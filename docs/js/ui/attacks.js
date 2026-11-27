import { ensureGameShell, overlayRect } from './viewport.js';
import { flushCombatDisplay, setDOMText } from "../rendering/displayBatch.js";
import { getOpenViewRoots } from './viewRoots.js';
import { getAttackControlValue } from "../combat/control.js";
import { previewAttackEffects } from "../combat/effectParameters.js";
// Attack cards, descriptions, progression and combat controls.
import { clockNow, requestAnimationFrame, cancelAnimationFrame } from "../combat/clock.js";
import {
  buildAttackLightDescription,
  renderAttackDescription,
  buildAttackAttributeHelpers,
  buildAttackRateHelper,
  HELPER_TEXT,
  buildAttackActivationHelper,
  buildAttackSignatureHelper,
  buildAttackCriticalDescription,
  buildAttackUmbraCompatibilityHelper,
  buildInertEnergyHelper,
  buildAttackMasteryHelper,
} from "../data/helpers.js";
import { cachedResourceUrl } from "../data/loaderList.js";
import { attackDetails } from "../data/attackList.js";
import { balanceData } from "../data/balanceData.js";
import { criticalNaturePlan } from "../combat/damageRules.js";
import { isAdminMode } from "../storage/gameStorage.js";
import { getSafe } from "../entities/rules.js";
import { entites } from "../entities/runtime.js";
import {
  ATTACK_ESSENCE_MAX_SLOTS,
  attackSelectionKey,
  describeAttackChoices,
  setAttackEnabled,
  setAttackPriority,
  setAttackPrioritiesAutomatic,
  restoreManualAttackPriorities,
  subscribeAttackSelection,
  getAttackRuntime,
  getAttackMastery,
  getAttackResolutionFlags,
  getAttackNatureRules,
  getAttackPowerRatios,
  isAttackSublime,
  readAttackDefinitionKey,
  readAttackDefinitionsForEntity,
  resolveAttackDefinitionForEntity,
  ensureEntityAttackInstances,
  refreshEntityCurrentAttackDefinition,
  setAllAttacksEnabled,
  getAttackResonance,
} from "../combat/attackResolution.js";
import {
  createAttackStatView, getAttackPurity, calculateAttackDamagePreview, calculateDirectAttackDps,
  calculateDirectAttackHps, calculateProfanationSummonLevel, getFinalAttackProjectileSpeed, getEffectiveAttackTimings,
  calculateCritTotalChance, calculateCritDamageBonus, getRangePenaltyDetails, totalPiercingRecupReductionWithAgi, totalTranspiercingRecupReductionWithAgi,
  calculateMeleeExecBonus, getAttackUmbraAccess
} from "../combat/statistics.js";
import { calculateStatsDisplay } from "./statistics/details.js";
import { saveEntityAttackSelection } from "../storage/entityStorage.js";
import { resolveAttackEffects, describeAttackEffect, EFFECT_TYPES } from "../data/attackEffects.js";
import { normArr } from "../combat/vitals.js";
import { createAttackEssenceSocketsElement } from "../items/essences.js";
import {
  getCodexFocusedAttackKey,
  setCodexFocusedAttackKey,
  getPendingInventoryCodexAttackTarget,
} from "./navigation.js";
import {
  bindHelperEntity, getBoundHelperEntity, layoutOpenStatHelpers, cssEscape,
  escape, statSourcesHelper
} from "./statistics/helpers.js";
import { resolvePowerOwner, createAttackPowerValue } from "./statistics/components.js";
import { applyAttackEssenceSocketChoice, applyAdminAttackCardChange } from "./essences.js";
import { createFullStatDom, createEntityStatsTitleNode } from "./statistics/components.js";
import { removeCombatVisualAfter } from "../combat/clock.js";
import { gameStarted } from "../app/state.js";
import { createLifeBars, CreateATBEntity } from "../rendering/entities.js";

function generateAttackDescription(attack, attacker) {
  const preview = calculateAttackDamagePreview(attacker, attack);
  const description = attack?.attackDescription || '';
  const summon = description.includes('{profanationLevel}') || description.includes('{profanationCalculation}')
    ? calculateProfanationSummonLevel(attacker, attack) : null;
  const powers = {
    physical: Number(getSafe(attacker, 'physicalDamage', 0)) || 0,
    magical: Number(getSafe(attacker, 'magicalDamage', 0)) || 0,
    piercing: Number(getSafe(attacker, 'piercingDamage', 0)) || 0,
  };
  const evaluateFormula = expr => {
    try {
      const result = Function('"use strict"; return (' + expr + ')')();
      return Math.round(result);
    } catch {
      return expr;
    }
  };
  return renderAttackDescription(attack, preview, powers, summon, evaluateFormula);
}

const ATTACK_SPARK_PHASE_STEP_MS = 160;

function getAttackCombatFunctionClass(attack) {
  const explicit = String(attack?.combatFunction || '').trim().toLowerCase();
  if (explicit === 'support') return 'Support';
  if (explicit === 'attaquant') return 'Attaquant';
  const targets = normArr(attack?.attackTarget);
  if (targets.includes('ally')) return 'Support';
  if (targets.includes('enemy')) return 'Attaquant';
  return '';
}

function getAttackTargetVisualClasses(attack) {
  const classes = [getAttackCombatFunctionClass(attack)];
  const targets = normArr(attack?.attackTarget);
  const isNecro = normArr(attack?.deadTarget).includes('yes');

  if (isNecro) classes.push('Necro', 'domain-necro');
  else if (targets.includes('hexa')) classes.push('domain-invocateur');
  else classes.push('domain-combattant');

  return classes.filter(Boolean);
}

function createAttackTargetPictogram(attack, { codex = false, fallbackTargets = [] } = {}) {
  const picto = document.createElement('div');
  if (!codex) {
    picto.className = `picto-target-attack-detail ${fallbackTargets.join(' ')}`.trim();
    return picto;
  }

  const functionClass = getAttackCombatFunctionClass(attack);
  picto.className = `picto-target-attack-detail ${getAttackTargetVisualClasses(attack).join(' ')}`;

  const targetLines = document.createElement('div');
  targetLines.className = `target-picto-hud ${functionClass}`.trim();
  targetLines.setAttribute('aria-hidden', 'true');
  picto.appendChild(targetLines);
  return picto;
}

function createAttackPriorityBadge(value = 1, title = '') {
  const badge = document.createElement('span');
  badge.className = 'attack-priority-badge';
  if (title) badge.title = title;
  const text = document.createElement('span');
  text.className = 'attack-priority-badge-value';
  text.textContent = String(value);
  badge.appendChild(text);
  return { badge, text };
}

function syncAttackActivationPresentation(root, owner, attack, frame = null, phaseMs = null, { compact = false, imageToggle = false, resolveOwner = null } = {}) {
  if (!root || !owner || !attack) return;
  const key = attackSelectionKey(attack);
  const disabled = getAttackControlValue(owner, 'disabled', key, owner.attackSelection?.disabled?.[key] === true);
  const imageFrame = frame || root.querySelector('.attack-image-frame');
  const title = root.querySelector('.attack-loot-name, .attack-readonly-title');
  root.classList.toggle('is-attack-disabled', disabled);
  imageFrame?.classList.toggle('attack-image-frame--disabled', disabled);
  imageFrame?.classList.toggle('attack-image-frame--active', !disabled && !compact);

  let disabledLabel = title?.querySelector('.attack-disabled-label');
  if (disabled && title && !disabledLabel) {
    disabledLabel = document.createElement('span');
    disabledLabel.className = 'attack-disabled-label';
    disabledLabel.textContent = 'Désactivée';
    title.appendChild(disabledLabel);
  } else if (!disabled) {
    disabledLabel?.remove();
  }

  let overlay = imageFrame?.querySelector(':scope > .attack-disabled-overlay');
  if (disabled && imageFrame && !overlay) {
    overlay = document.createElement('div');
    overlay.className = 'attack-disabled-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    imageFrame.appendChild(overlay);
  } else if (!disabled) {
    overlay?.remove();
  }

  let spark = imageFrame?.querySelector(':scope > .attack-active-spark');
  let trail = imageFrame?.querySelector(':scope > .attack-active-trail');
  if (compact || imageToggle) {
    spark?.remove();
    trail?.remove();
    let indicator = imageFrame?.querySelector(':scope > .attack-activation-indicator');
    if (imageFrame && !indicator) {
      indicator = document.createElement(imageToggle ? 'button' : 'span');
      indicator.className = 'attack-activation-indicator';
      if (imageToggle) {
        indicator.type = 'button';
        indicator.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          const currentOwner = resolveOwner?.() || owner;
          if (setAttackEnabled(currentOwner, readAttackDefinitionsForEntity(currentOwner, attackDetails), key,
            getAttackControlValue(currentOwner, 'disabled', key, currentOwner.attackSelection?.disabled?.[key] === true))) {
            saveEntityAttackSelection(currentOwner);
            syncAttackActivationPresentation(root, currentOwner, attack, imageFrame, phaseMs,
              { compact, imageToggle, resolveOwner });
          }
        });
      } else indicator.setAttribute('aria-hidden', 'true');
      imageFrame.appendChild(indicator);
    }
    indicator?.classList.toggle('is-active', !disabled);
    indicator?.classList.toggle('is-disabled', disabled);
    indicator?.setAttribute('title', disabled ? 'Attaque désactivée' : 'Attaque activée');
    if (indicator) {
      indicator.dataset.stat = 'attackActivation';
      indicator.dataset.hover = 'true';
      indicator.dataset.helperKey = `${owner.id}-${key}-attackActivation`;
      indicator.dataset.entityId = String(owner.id);
      indicator.dataset.helperText = buildAttackActivationHelper(!disabled);
    }
    if (imageToggle) {
      indicator?.setAttribute('aria-label', disabled
        ? `Activer ${attack.displayName || attack.name || 'cette attaque'}`
        : `Désactiver ${attack.displayName || attack.name || 'cette attaque'}`);
      indicator?.setAttribute('aria-pressed', String(!disabled));
    }
    return;
  }
  imageFrame?.querySelector(':scope > .attack-activation-indicator')?.remove();
  if (disabled) {
    spark?.remove();
    trail?.remove();
    return;
  }
  if (!imageFrame || spark) return;

  if (!imageFrame.style.getPropertyValue('--attack-spark-phase')) {
    const resolvedPhase = Number.isFinite(Number(phaseMs))
      ? Number(phaseMs)
      : Math.round(-Math.random() * 3600);
    imageFrame.style.setProperty('--attack-spark-phase', `${resolvedPhase}ms`);
  }

  trail = document.createElement('div');
  trail.className = 'attack-active-trail';
  trail.setAttribute('aria-hidden', 'true');
  const trailPointCount = 10;
  for (let index = 1; index <= trailPointCount; index += 1) {
    const fade = 1 - ((index - 1) / trailPointCount);
    const point = document.createElement('span');
    point.className = 'attack-active-trail-point';
    point.style.setProperty('--attack-trail-index', index);
    point.style.setProperty('--attack-trail-opacity', (0.08 + (fade * 0.64)).toFixed(3));
    point.style.setProperty('--attack-trail-size', `${(1.5 + (fade * 2.5)).toFixed(2)}px`);
    trail.appendChild(point);
  }

  spark = document.createElement('button');
  spark.type = 'button';
  spark.className = 'attack-active-spark';
  spark.title = `Désactiver ${attack.displayName || attack.name || 'cette attaque'}`;
  spark.setAttribute('aria-label', spark.title);
  spark.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    if (spark.classList.contains('is-leaving')) return;
    spark.classList.add('is-leaving');
    trail.classList.add('is-leaving');
    spark.disabled = true;
    setTimeout(() => {
      setAttackEnabled(owner, readAttackDefinitionsForEntity(owner, attackDetails), key, false);
      saveEntityAttackSelection(owner);
      spark.remove();
      syncAttackActivationPresentation(root, owner, attack, imageFrame);
    }, 320);
  });
  imageFrame.appendChild(trail);
  imageFrame.appendChild(spark);
}

const effectDescriptionOwners = new WeakMap();
function renderAttackEffects(root, attack, entity) {
  effectDescriptionOwners.set(root, entity);
  const source = createAttackStatView(entity, attack);
  const resolved = resolveAttackEffects({ ...attack });
  root.replaceChildren();
  root.dataset.entityId = String(entity?.id ?? '');
  root.dataset.attackKey = attackSelectionKey(attack);
  root.dataset.effectTypes = [...new Set([...resolved.effectTypes, ...resolved.selfEffectTypes])].join(' ');
  bindHelperEntity(root, entity);
  for (const self of [false, true]) {
    for (const effect of previewAttackEffects(attack, source, self).filter(effect => !effect.tacticalVisualOnly)) {
      const row = document.createElement('div');
      row.className = 'effect-description';
      row.dataset.effectName = effect.effectName;
      row.dataset.effectTypes = effect.type.join(' ');
      row.dataset.effectTarget = self ? 'self' : 'target';
      const heading = document.createElement('strong');
      heading.textContent = `${effect.effectDisplay}${self ? ' (sur soi)' : ''}`;
      const categories = effect.type.map(type => EFFECT_TYPES[type] || type).join(' · ');
      row.append(heading, document.createTextNode(categories ? ` — ${categories}` : ''));
      if (effect.effectDescription) {
        const detail = document.createElement('div');
        detail.textContent = describeAttackEffect(effect);
        if (effect.effectName === 'poison') {
          // Same per-source rounding as poison(), before the target's defenses.
          const total = effect.effectDot + Math.ceil(Math.max(0, Number(getSafe(source, 'physicalDamage', 0)) || 0) * effect.effectPhysicalRatio)
            + Math.ceil(Math.max(0, Number(getSafe(source, 'magicalDamage', 0)) || 0) * effect.effectMagicalRatio);
          detail.textContent += ` Dégâts sur la durée : ${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 }).format(total)}.`;
        }
        row.append(detail);
      }
      root.append(row);
    }
  }
}

function refreshAttackEffectDescriptions(entity) {
  let changed = false;
  getOpenViewRoots('attackEffects').forEach(root => {
    if (entity && root.dataset.entityId !== String(entity.id)) return;
    const owner = entity || effectDescriptionOwners.get(root) || getBoundHelperEntity(root) || resolveEntity(root.dataset.entityId);
    if (!owner) return;
    const attack = resolveAttackDefinitionForEntity(owner, root.dataset.attackKey, attackDetails);
    if (attack) renderAttackEffects(root, attack, owner);
    else root.replaceChildren();
    changed = true;
  });
  // Serialized helper HTML has no closures; its data keys keep it connected to the attack.
  if (changed) layoutOpenStatHelpers();
}

function createAttackDescriptionContent(attack, entity, { descriptionOnly = false } = {}) {
  const attackTextContainer = document.createElement('div');
  attackTextContainer.className = 'attack-text-container';
  if (!descriptionOnly) {
    const natureRules = getAttackNatureRules(attack);
    const displayNature = natureRules.natures;
    const natureStat = natureRules.stat;
    const natureLabel = natureRules.label;
    const functionClass = getAttackCombatFunctionClass(attack);
    const roleLabel = functionClass === 'Support' ? 'Support' : 'Attaque';
    const isNecro = normArr(attack?.deadTarget).includes('yes');
    const isHex = !isNecro && normArr(attack?.attackTarget).includes('hexa');
    const targetLabel = isNecro ? 'Cadavre' : isHex ? 'Terrain' : 'Entité';
    const targetDomain = isNecro ? 'domain-necro' : isHex ? 'domain-invocateur' : 'domain-combattant';
    const helpers = getAttackAttributeHelpers(attack, natureRules, { roleLabel, targetLabel });

    const roleInfoDiv = document.createElement('div');
    roleInfoDiv.className = 'ciblage-attack-detail-infos attack-attribute-row';
    roleInfoDiv.innerHTML = `<span class="attack-info-type">Rôle :</span> <span class="attack-role-value ${functionClass}"><span class="attack-attribute-picto attack-role-picto ${functionClass}" aria-hidden="true"></span>${roleLabel}</span>`;
    bindAttackAttributeHelper(roleInfoDiv.querySelector('.attack-role-value'), 'attackRole', helpers.role, entity, attack);

    const targetingInfoDiv = document.createElement('div');
    targetingInfoDiv.className = 'ciblage-attack-detail-infos attack-attribute-row';
    targetingInfoDiv.innerHTML = `<span class="attack-info-type">Cible :</span> <span class="attack-target-value ${targetDomain}"><span class="attack-attribute-picto attack-target-picto ${functionClass} ${isNecro ? 'Necro' : ''} ${targetDomain}" aria-hidden="true"></span>${targetLabel}</span>`;
    bindAttackAttributeHelper(targetingInfoDiv.querySelector('.attack-target-value'), 'attackTarget', helpers.target, entity, attack);

    const attackTypeDiv = document.createElement('div');
    attackTypeDiv.className = 'ciblage-attack-detail-infos attack-attribute-row';
    attackTypeDiv.innerHTML = `
      <div class="attack-type-container">
        <span class="attack-info-type">Nature :</span>
        <div class="attack-nature" data-stat="${natureStat}" data-hover="true">
          <div class="picto-stat ${natureStat}"></div>
          <div class="${natureStat}">${natureLabel}</div>
        </div>
      </div>
    `;
    bindAttackAttributeHelper(attackTypeDiv.querySelector('.attack-nature'), natureStat, helpers.nature, entity, attack);
    attackTextContainer.append(roleInfoDiv, targetingInfoDiv, attackNatureRange(attack, entity, helpers.range), attackTypeDiv);
    if (attack.combatFunction === 'Attaquant' && natureRules.colors.length > 1) {
      const distribution = document.createElement('div');
      distribution.className = 'attack-nature-distribution';
      distribution.textContent = natureRules.key === 'hybrid' ? 'Encaissement : 50 % physique / 50 % magique.'
        : `Répartition : ${natureRules.colors.map(color => `${(natureRules.profile[color] / natureRules.profile.total * 100).toFixed(1)} % ${{red: 'physique', blue: 'magique', yellow: 'perçant'}[color]}`).join(' / ')}.`;
      attackTextContainer.append(distribution);
    }
  }

  const description = document.createElement('div');
  description.className = 'attack-description-wrapper';
  if (attack.functionName === 'autoAttack' || normArr(attack.effets).includes('summonProfanation')) {
    description.dataset.entityId = String(entity?.id ?? '');
    description._refreshDescription = owner => {
      const currentAttack = resolveAttackDefinitionForEntity(owner, attackSelectionKey(attack), attackDetails) || attack;
      description.innerHTML = generateAttackDescription(currentAttack, owner);
      bindHelperEntity(description.closest('.attack-details, .attack-light-description'), createAttackStatView(owner, currentAttack));
      if (description.closest('.attack-light-description')) {
        const hiddenDetails = currentAttack.functionName === 'autoAttack'
          ? '.attack-damage-preview, .detail.total-damage'
          : '.attack-damage-preview, .detail.total-damage, .attack-power-calculation';
        description.querySelectorAll(hiddenDetails).forEach(node => node.remove());
      }
    };
  }
  description.innerHTML = generateAttackDescription(attack, entity);
  attackTextContainer.append(description);
  const effectsList = document.createElement('div');
  effectsList.className = 'attack-effects-list';
  renderAttackEffects(effectsList, attack, entity);
  attackTextContainer.append(effectsList);
  return attackTextContainer;
}

function bindAttackAttributeHelper(node, key, html, entity, attack) {
  if (!node || !html) return;
  const entityId = entity?.id ?? entity?.uniqueId ?? 'unknown';
  const attackKey = attackSelectionKey(attack) || attack?.entityAttackId || 'attack';
  node.dataset.stat = key;
  node.dataset.hover = 'true';
  node.dataset.helperKey = `${entityId}-${attackKey}-${key}`;
  node.dataset.entityId = String(entityId);
  node.dataset.helperText = html;
  node.tabIndex = 0;
}

function getAttackAttributeHelpers(attack, nature, { roleLabel, targetLabel }) {
  return buildAttackAttributeHelpers(attack, nature, { roleLabel, targetLabel }, { normArr, balanceData });
}

function createAttackLightDescription(attack, entity) {
  const view = createAttackStatView(entity, attack);
  const description = createAttackDescriptionContent(attack, view);
  const removedDetails = attack.functionName === 'autoAttack'
    ? '.attack-damage-preview, .detail.total-damage'
    : '.attack-damage-preview, .detail.total-damage, .attack-power-calculation';
  description.querySelectorAll(removedDetails).forEach(node => node.remove());
  const preview = !normArr(attack.attackTarget).includes('hexa') && !normArr(attack.deadTarget).includes('yes')
    && !description.querySelector('.attack-damage-summary') ? calculateAttackDamagePreview(view, attack) : null;
  const content = buildAttackLightDescription({
    attackKey: attackSelectionKey(attack),
    attackClass: getAttackCombatFunctionClass(attack).toLowerCase(),
    attackName: attackDisplayName(attack),
    powerValue: createAttackPowerValue(attack, entity),
    description, preview, isHealing: attack.combatFunction === 'Support',
  });
  bindHelperEntity(content, view);
  return content;
}

function applyAttackNatureBorder(node, attack) {
  if (!node) return;
  const natureStat = getAttackNatureRules(attack).stat || 'neutral';
  node.classList.add('attack-nature-border', natureStat);
  node.dataset.attackNature = natureStat;
}

function attackDisplayName(attack, masteryLevel = 1) {
  const name = attack?.displayName || attack?.name || 'Attaque';
  const mastery = masteryLevel > 1 ? ` ${masteryLevel}` : '';
  return `${name}${mastery}${isAttackSublime(attack) ? ' sublime' : ''}`;
}

function attackNameWithMastery(attack) {
  return attackDisplayName(attack, getAttackMastery(attack).level);
}

function createAttackRatePreview(attack, owner) {
  const isHealing = attack.combatFunction === 'Support';
  const calculate = isHealing ? calculateDirectAttackHps : calculateDirectAttackDps;
  const key = isHealing ? 'hps' : 'dps';
  const title = isHealing ? 'HPS théorique' : 'DPS';
  const format = value => Number(value).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
  const line = document.createElement('div');
  line.className = `attack-rate-preview attack-${key}-preview`;
  line.dataset.stat = isHealing ? 'attackHps' : 'attackDps';
  line.dataset.hover = 'true';
  line.dataset.helperKey = `${owner.id}-${attackSelectionKey(attack)}-${line.dataset.stat}`;
  line.dataset.entityId = String(owner.id);
  line.tabIndex = 0;
  let rateOwner = owner;
  const refresh = (currentOwner = rateOwner) => {
    rateOwner = currentOwner;
    const rate = calculate(attack, currentOwner);
    line.hidden = !rate;
    if (!rate) return false;
    const natureStat = getAttackNatureRules(attack).stat || 'neutral';
    line.innerHTML = isHealing
      ? `<span class="picto-stat healing" aria-hidden="true"></span><span>${title} :</span><span class="attack-rate-value attack-hps-value Support">${format(rate.perSecond)}</span><span>HP/s</span>`
      : `<span class="neutral">DPS :</span><span class="picto-stat ${natureStat}" aria-hidden="true"></span><span class="attack-rate-value attack-dps-value ${natureStat}">${format(rate.perSecond)}</span>`;
    line.dataset.helperText = buildAttackRateHelper({ isHealing, title, rate, format, admin: isAdminMode() });
    return true;
  };
  line._refreshRate = refresh;
  return refresh(owner) ? line : null;
}

function createAdminAttackCardControls(owner, attack) {
  const controls = document.createElement('div');
  controls.className = 'admin-attack-card-controls';
  controls.hidden = !isAdminMode();
  const title = document.createElement('strong');
  title.textContent = 'Réglages Admin';
  controls.append(title);
  const fields = [
    ['essenceSlotCount', 'Châsses', attack.essenceSlots?.length || 0, 1, ATTACK_ESSENCE_MAX_SLOTS],
    ['physicalRatio', 'Ratio physique', attack.physicalRatio || 0, 'any'],
    ['magicalRatio', 'Ratio magique', attack.magicalRatio || 0, 'any'],
    ['piercingRatio', 'Ratio perçant', attack.piercingRatio || 0, 'any'],
  ];
  for (const [key, label, value, step, max] of fields) {
    const row = document.createElement('label');
    const name = document.createElement('span');
    name.textContent = label;
    const input = document.createElement('input');
    input.type = 'number'; input.min = '0'; input.step = String(step); input.value = String(value);
    input.setAttribute('aria-label', label);
    input.dataset.adminAttackField = key;
    if (max !== undefined) input.max = String(max);
    input.addEventListener('change', event => {
      event.stopPropagation();
      if (!input.value.trim() || !input.checkValidity()) return;
      applyAdminAttackCardChange(owner, attack, key, Number(input.value));
    });
    row.append(name, input);
    controls.append(row);
  }
  controls.addEventListener('click', event => event.stopPropagation());
  return controls;
}

function AttackDetailInfos(attack, entity, fromMulti = false, attackIndex = null, {
  showUmbraPanel = true,
  descriptionOnly = false,
  showProgression = true,
  showActivation = true,
  onSocketClick = null,
  codexLayout = false,
} = {}) {
  if (!attack) return document.createElement("div");
  const owner = entity;
  entity = createAttackStatView(entity, attack);

  const attackTargets = normArr(attack?.attackTarget);
  const displayName = attack?.displayName || "Inconnu";
  const attackDetailsDiv = document.createElement("div");
  attackDetailsDiv.className = `attack-details ${attackTargets.join(" ")}`.trim();
  attackDetailsDiv.classList.add(getAttackCombatFunctionClass(attack));
  if (codexLayout) attackDetailsDiv.classList.add('attack-details--codex');

  bindHelperEntity(attackDetailsDiv, entity);

  if (!fromMulti && !codexLayout) {
    const attackTitleName = document.createElement("div");
    attackTitleName.className = `attack-loot-name ${getAttackCombatFunctionClass(attack)}`.trim();
    attackTitleName.textContent = attackNameWithMastery(attack);
    attackTitleName.appendChild(createAttackPowerValue(attack, owner));
    attackDetailsDiv.appendChild(attackTitleName);
  }

  const attackImageContainer = document.createElement("div");
  attackImageContainer.className = "attack-image-container";

  const attackImgComplete = document.createElement("div");
  attackImgComplete.className = "attack-img-complete";

  const attackImageFrame = document.createElement("div");
  attackImageFrame.className = "attack-image-frame";

	const attackImg = document.createElement("img");
	attackImg.src = cachedResourceUrl(attack.attackAssetHD || `${attack.attackAsset}-hd.jpg`);
	attackImg.className = `attackElement-asset-spell ${attackTargets.join(" ")}`.trim();
	attackImg.classList.add("attack-image");
  applyAttackNatureBorder(attackImg, attack);

  const pictoTarget = createAttackTargetPictogram(attack, {
    codex: codexLayout,
    fallbackTargets: attackTargets,
  });
  let detailPriorityBadge = null;
  if (codexLayout) {
    const attackKey = attackSelectionKey(attack);
    const priority = Number(owner.attackSelection?.priorities?.[attackKey]) || (Number(attackIndex) + 1) || 1;
    detailPriorityBadge = createAttackPriorityBadge(priority, `Priorité ${priority}`).badge;
    detailPriorityBadge.classList.add('attack-priority-badge--detail');
    detailPriorityBadge.dataset.attackKey = attackKey;
  }

  const essenceSocketOptions = {
    compact: fromMulti,
    position: "detail",
    entity: owner,
    attackIndex,
  };
  if (typeof onSocketClick === 'function') essenceSocketOptions.onSocketClick = onSocketClick;
  else essenceSocketOptions.onApplyEssence = applyAttackEssenceSocketChoice;
  const essenceSockets = createAttackEssenceSocketsElement(attack, essenceSocketOptions);
  if (!essenceSockets.classList.contains("is-empty")) {
    attackImgComplete.classList.add("with-essence-sockets");
    if (fromMulti) attackImgComplete.classList.add("with-compact-essence-sockets");
  }

  attackImageFrame.appendChild(attackImg);
  attackImageFrame.appendChild(pictoTarget);
  if (detailPriorityBadge) attackImageFrame.appendChild(detailPriorityBadge);
  attackImgComplete.appendChild(attackImageFrame);
  attackImgComplete.appendChild(essenceSockets);
  attackImageContainer.appendChild(attackImgComplete);

  const attackDetailsColumn = document.createElement("div");
  attackDetailsColumn.className = "attack-details-colomne";

  const attackMoreDetails = document.createElement("div");
  attackMoreDetails.className = "attack-more-details";

  if (fromMulti || codexLayout) {
    const attackTitleClone = document.createElement("div");
    attackTitleClone.className = `attack-loot-name ${getAttackCombatFunctionClass(attack)}`.trim();
    attackTitleClone.textContent = attackNameWithMastery(attack);
    attackTitleClone.appendChild(createAttackPowerValue(attack, owner));
    attackMoreDetails.appendChild(attackTitleClone);
  }

  attackMoreDetails.appendChild(createAttackDescriptionContent(attack, entity, { descriptionOnly }));
  if (!descriptionOnly) attackMoreDetails.appendChild(createAdminAttackCardControls(owner, attack));
  if (codexLayout && !descriptionOnly) {
    const rate = createAttackRatePreview(attack, owner);
    if (rate) attackMoreDetails.appendChild(rate);
  }

  // ===========================================================
  // TIMINGS
  // ===========================================================
  const attackMoreDetailsReveal = document.createElement("div");
  attackMoreDetailsReveal.className = "attack-more-details-reveal";

  const timingsPicto = document.createElement("div");
  timingsPicto.className = "attack-timings-picto";

  const cooldownDiv = document.createElement("div");
  cooldownDiv.className = "timers-detail attack-timing-cooldown";

  const preparationTimeDiv = document.createElement("div");
  preparationTimeDiv.className = "timers-detail attack-timing-step attack-timing-step--first";

  const executionTimeDiv = document.createElement("div");
  executionTimeDiv.className = "timers-detail attack-timing-step";

  const recoveryTimeDiv = document.createElement("div");
  recoveryTimeDiv.className = "timers-detail attack-timing-step attack-timing-step--last";

  const timingSeparator = document.createElement('span');
  timingSeparator.className = 'attack-timing-separator';
  timingSeparator.setAttribute('aria-hidden', 'true');

  const timings = getEffectiveAttackTimings(attack, entity);
  const fmt = (ms) => `${((Number(ms) || 0) / 1000).toFixed(2)}s`;

  const attackRangeArr = normArr(attack?.attackRange);
  const isRangeAttack =
    attackRangeArr.includes("range") ||
    attackRangeArr.includes("ranged") ||
    attackRangeArr.includes("distance");

  const enableTimingHelper = (node, statKey, detail = {}) => {
    node.dataset.stat = `${statKey}Detail`;
    node.dataset.hover = "true";
    node.tabIndex = 0;
    node.setAttribute('role', 'button');
    node.setAttribute('aria-expanded', 'false');

    if (entity?.id != null) {
      node.dataset.entityId = String(entity.id);
    }

    node.dataset.timingDetail = JSON.stringify(detail);
  };

  enableTimingHelper(cooldownDiv, "cooldownTime", {
    label: "Cooldown",
    baseMs: timings.base.cooldown,
    effectiveMs: timings.effective.cooldown,
    reduc: timings.reduc.cdReduc,
    reducKey: "cdReduc",
  });

  enableTimingHelper(preparationTimeDiv, "preparationTime", {
    label: "Préparation",
    baseMs: timings.base.preparationTime,
    effectiveMs: timings.effective.preparationTime,
    reduc: timings.reduc.prepReduc,
    reducKey: "prepReduc",
  });

enableTimingHelper(
  executionTimeDiv,
  isRangeAttack ? "executionRangeTime" : "executionTime",
  {
    label: isRangeAttack ? "Vitesse projectile" : "Exécution",
    baseMs: timings.base.executionTime,
    effectiveMs: timings.impactExecutionTime,
    reduc: timings.reduc,
    reducKey: isRangeAttack ? "projectileTime" : "totalExecReduc",
  }
);

enableTimingHelper(recoveryTimeDiv, "recoveryTime", {
  label: "Récupération",
  baseMs: timings.base.recoveryTime,
  effectiveMs: timings.effective.recoveryTime,
  reduc: timings.reduc,
});

  const renderTiming = (node, label, effectiveMs, baseMs, iconClass) => {
    node.replaceChildren();
    const icon = document.createElement('span');
    icon.className = `attack-timing-icon picto-stat ${iconClass}`;
    icon.setAttribute('aria-hidden', 'true');
    const name = document.createElement('span');
    name.className = 'attack-timing-label';
    name.textContent = label;
    const content = document.createElement('span');
    content.className = 'attack-timing-content';
    const values = document.createElement('span');
    values.className = 'attack-timing-values';
    const effective = document.createElement('span');
    effective.className = 'timing-effective';
    effective.textContent = fmt(effectiveMs);
    const base = document.createElement('span');
    base.className = 'timing-base';
    base.textContent = `(${fmt(baseMs)})`;
    values.append(effective, base);
    content.append(name, values);
    node.append(icon, content);
  };

  renderTiming(cooldownDiv, 'Cooldown', timings.effective.cooldown, timings.base.cooldown, 'cooldownTime');
  renderTiming(preparationTimeDiv, 'Préparation', timings.effective.preparationTime, timings.base.preparationTime, 'preparationTime');
  renderTiming(
    executionTimeDiv,
    isRangeAttack ? 'Vitesse projectile' : 'Exécution',
    timings.impactExecutionTime,
    timings.base.executionTime,
    'executionTime',
  );
  renderTiming(recoveryTimeDiv, 'Récupération', timings.effective.recoveryTime, timings.base.recoveryTime, 'recuperationTime');

  attackMoreDetailsReveal.appendChild(timingsPicto);
  attackMoreDetailsReveal.appendChild(cooldownDiv);
  attackMoreDetailsReveal.appendChild(timingSeparator);
  attackMoreDetailsReveal.appendChild(preparationTimeDiv);
  attackMoreDetailsReveal.appendChild(executionTimeDiv);
  attackMoreDetailsReveal.appendChild(recoveryTimeDiv);

  let progressionView = null;
  if (showProgression) progressionView = createAttackProgressionView(owner, attack);

  if (codexLayout) {
    const timingSettingsRow = document.createElement('div');
    timingSettingsRow.className = 'attack-timing-settings-row';
    const settings = document.createElement('section');
    settings.className = 'attack-settings-panel';
    const settingsTitle = document.createElement('div');
    settingsTitle.className = 'attack-settings-title';
    settingsTitle.textContent = 'Paramètres';
    settings.appendChild(settingsTitle);
    const activationControl = progressionView?.querySelector(':scope > .attack-enabled-control');
    if (activationControl) settings.appendChild(activationControl);
    if (!descriptionOnly) timingSettingsRow.append(attackMoreDetailsReveal, settings);
    else timingSettingsRow.appendChild(settings);
    attackMoreDetails.appendChild(timingSettingsRow);
    attackDetailsColumn.appendChild(attackImageContainer);
    if (progressionView) attackImageContainer.appendChild(progressionView);
  } else if (fromMulti) {
    attackMoreDetails.prepend(attackImageContainer);
  } else {
    attackDetailsColumn.appendChild(attackImageContainer);
  }

  attackDetailsColumn.appendChild(attackMoreDetails);

  attackDetailsDiv.appendChild(attackDetailsColumn);
  if (!descriptionOnly && !codexLayout) attackDetailsDiv.appendChild(attackMoreDetailsReveal);
  if (progressionView && !codexLayout) attackDetailsDiv.appendChild(progressionView);
  if (showUmbraPanel) attackDetailsDiv.appendChild(createAttackUmbraPanel(owner, attack));
  if (showActivation) {
    const attackCount = readAttackDefinitionsForEntity(owner, attackDetails).length;
    const sparkPhaseMs = attackCount > 1 && Number.isInteger(attackIndex)
      ? -(attackIndex * ATTACK_SPARK_PHASE_STEP_MS)
      : null;
    attackDetailsDiv._syncAttackActivation = updatedOwner => syncAttackActivationPresentation(
      attackDetailsDiv,
      updatedOwner || owner,
      attack,
      attackImageFrame,
      sparkPhaseMs,
      { imageToggle: codexLayout },
    );
    attackDetailsDiv._syncAttackActivation(owner);
  }

  return attackDetailsDiv;
}

function attackNatureRange(attack, entity = null, helperText = '') {
  const toArr = (v) => (Array.isArray(v) ? v.filter(Boolean) : v ? [v] : []);
  const rangeArr = toArr(attack?.attackRange);
  let rangeLabel = "—";
  let rangeKey = "unknownRange";

  if (rangeArr.includes("melee")) {
    rangeLabel = "Corps à corps";
    rangeKey = "meleeAttack";
  } else if (rangeArr.includes("range") || rangeArr.includes("ranged") || rangeArr.includes("distance")) {
    rangeLabel = "À distance";
    rangeKey = "rangeAttack";
  }

  const rangeDiv = document.createElement("div");
  rangeDiv.className = "ciblage-attack-detail-infos attack-attribute-row";
  rangeDiv.innerHTML = `
    <span class="attack-info-type">Portée :</span>
    <div class="attack-range"
         data-hover="true"
         data-stat="${rangeKey}">
      <div class="picto-stat ${rangeKey}" data-stat="${rangeKey}"></div>
     <span class="attack-range-type ${rangeKey}">${rangeLabel}</span>
    </div>
  `;
  bindAttackAttributeHelper(rangeDiv.querySelector('.attack-range'), 'attackRange', helperText, entity, attack);

  return rangeDiv;
}

const multiAttackViews = new Map();

const syncOwnedAttackReferences = ({ type, detail }) => {
    if (type === 'selectedArmyAUpdated' && detail?.source !== 'essenceur') return;
    const owner = detail?.entite;
    if (!owner) return;
    // Menus and the battlefield can retain different copies of the same owner.
    const copies = new Set([...entites, ...(window.selectedArmyA || []), ...(window.selectedArmyB || [])]);
    for (const copy of copies) {
        if (copy === owner || String(copy.id) !== String(owner.id)) continue;
        copy.attackDetails = owner.attackDetails;
        copy.attackEssenceInventory = owner.attackEssenceInventory;
        refreshEntityCurrentAttackDefinition(copy, attackDetails);
    }
};

let multiAttackViewTimer = null;

function refreshMultiAttackViews() {
    multiAttackViewTimer = null;
    for (const [root, view] of multiAttackViews) {
        if (root.isConnected) view.connected = true;
        else if (view.connected || clockNow() - view.createdAt > 1000) {
            multiAttackViews.delete(root);
            continue;
        }
        view.update();
    }
    if (multiAttackViews.size) multiAttackViewTimer = setTimeout(refreshMultiAttackViews, 100);
}

function createEntityAttackDisplay(entity, { presentation } = {}) {
  if (!['starter', 'combat'].includes(presentation)) {
    throw new TypeError('La présentation légère doit préciser starter ou combat.');
  }
  const attacks = readAttackDefinitionsForEntity(entity, attackDetails);
  const root = document.createElement('div');
  root.className = `attack-light-display attack-light-display--${presentation}`;
  if (!attacks.length) return root;
  const list = document.createElement('div');
  list.className = 'attack-light-thumbnails';
  list.setAttribute('role', 'group');
  list.setAttribute('aria-label', 'Attaques');
  root.append(list);
  const detail = presentation === 'starter' ? document.createElement('div') : null;
  if (detail) {
    detail.className = 'attack-light-detail';
    detail.setAttribute('aria-live', 'polite');
    root.append(detail);
  }
  const select = key => {
    const attack = readAttackDefinitionsForEntity(entity, attackDetails)
      .find(candidate => attackSelectionKey(candidate) === key);
    if (!attack || !detail) return;
    detail.replaceChildren(createAttackLightDescription(attack, entity));
    list.querySelectorAll('button').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.attackKey === key));
    });
  };
  for (const attack of attacks) {
    const key = attackSelectionKey(attack);
    const selectable = Boolean(detail && attacks.length > 1);
    const thumbnail = document.createElement(selectable ? 'button' : 'div');
    thumbnail.className = `attack-light-thumbnail ${getAttackCombatFunctionClass(attack).toLowerCase()}`;
    thumbnail.dataset.attackKey = key;
    const image = document.createElement('img');
    image.src = cachedResourceUrl(`${attack.attackAsset}-ld.jpg`);
    image.alt = attack.displayName || 'Attaque';
    image.draggable = false;
    thumbnail.append(image);
    if (selectable) {
      thumbnail.type = 'button';
      thumbnail.setAttribute('aria-label', attack.displayName || 'Attaque');
      thumbnail.addEventListener('click', () => select(key));
    } else if (!detail) {
      thumbnail.tabIndex = 0;
      thumbnail.dataset.stat = `combatAttack-${key}`;
      thumbnail.dataset.hover = 'true';
      thumbnail.dataset.helperKey = `combat-scan-${entity.id}-${key}`;
      thumbnail.dataset.helperClass = 'combat-attack-hover';
      thumbnail.dataset.entityId = String(entity.id);
      thumbnail.addEventListener('mouseover', event => {
        if (thumbnail.contains(event.relatedTarget)) return;
        const currentAttack = readAttackDefinitionsForEntity(entity, attackDetails)
          .find(candidate => attackSelectionKey(candidate) === key);
        thumbnail.dataset.helperText = currentAttack ? createAttackLightDescription(currentAttack, entity).outerHTML : '';
      });
    }
    list.append(thumbnail);
  }
  // Attack inspection never selects or validates the surrounding starter.
  root.addEventListener('click', event => event.stopPropagation());
  root.addEventListener('dblclick', event => event.stopPropagation());
  if (detail) select(attackSelectionKey(attacks[0]));
  return root;
}

function attachAttackPriorityHelper(node, key, html, entityId, attackKey = '') {
    node.dataset.stat = key;
    node.dataset.hover = 'true';
    node.dataset.helperKey = `${entityId}-${attackKey || 'kit'}-${key}`;
    node.dataset.entityId = entityId;
    node.dataset.helperText = html;
}

function MultiAttackDisplay(entite, { selectedAttackKey = null, onSelect = null, showUmbraPanel = true, codexLayout = false } = {}) {
    const wrapper = document.createElement('div');
    wrapper.className = 'entite-attack-container multi-attacks';
    const controls = document.createElement('button');
    controls.type = 'button';
    controls.className = 'multi-attack-controls attack-priority-auto';
    controls.textContent = 'Priorité auto';
    attachAttackPriorityHelper(controls, 'attackPriorityAuto', HELPER_TEXT.attackPriorityAuto, entite.id);
    const topBlock = document.createElement('div');
    topBlock.className = 'attack-details-multi multi-attacks';
    const bottomBlock = document.createElement('div');
    bottomBlock.className = 'attack-imgs multi-attacks';
    wrapper.append(bottomBlock, controls, topBlock);
    const nodes = new Map();
    const entity = () => entites.find(candidate => String(candidate.id) === String(entite.id))
        || window.selectedArmyA?.find(candidate => String(candidate.id) === String(entite.id))
        || window.selectedArmyB?.find(candidate => String(candidate.id) === String(entite.id))
        || entite;
    const definitions = () => readAttackDefinitionsForEntity(entity(), attackDetails);
    let focusedKey = selectedAttackKey;
    let signature = '';
    let prioritySelect = null;
    let currentChoices = [];

    const persist = () => {
        entite.attackSelection = structuredClone(entity().attackSelection);
        saveEntityAttackSelection(entity());
    };
    controls.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        const owner = entity();
        const attacks = definitions();
        if (owner.attackSelection?.priorityMode === 'auto') restoreManualAttackPriorities(owner, attacks);
        else setAttackPrioritiesAutomatic(
            owner,
            attacks,
            attack => getEffectiveAttackTimings(attack, owner).effective.cooldown,
        );
        persist();
        update();
    });

    function focus(key) {
        const attacks = definitions();
        const index = attacks.findIndex(attack => attackSelectionKey(attack) === key);
        if (index < 0) return;
        focusedKey = key;
        const attack = attacks[index];
        const detail = AttackDetailInfos(attack, entity(), true, index, { showUmbraPanel, codexLayout });
        detail.classList.add('focus');
        detail.dataset.attackKey = key;
        prioritySelect = null;
        if (attacks.length > 1) {
            const label = document.createElement('label');
            label.className = 'attack-priority-field';
            const labelText = document.createElement('span');
            labelText.className = 'attack-priority-label';
            labelText.textContent = 'Priorité :';
            attachAttackPriorityHelper(labelText, 'attackPriority', HELPER_TEXT.attackPriority, entity().id, key);
            label.append(labelText);
            prioritySelect = document.createElement('select');
            prioritySelect.setAttribute('aria-label', 'Priorité de ' + attack.displayName);
            for (let rank = 1; rank <= attacks.length; rank++) {
                const option = document.createElement('option');
                option.value = String(rank);
                option.textContent = String(rank);
                prioritySelect.appendChild(option);
            }
            prioritySelect.value = String(getAttackControlValue(entity(), 'priorities', key, entity().attackSelection.priorities[key]));
            prioritySelect.addEventListener('change', () => {
                setAttackPriority(entity(), definitions(), key, Number(prioritySelect.value));
                persist();
                update();
            });
            label.appendChild(prioritySelect);
            if (codexLayout) {
                const settings = detail.querySelector('.attack-settings-panel');
                const activation = settings?.querySelector('.attack-enabled-control');
                label.appendChild(controls);
                if (settings) settings.insertBefore(label, activation || null);
            }
            else detail.prepend(label);
        }
        topBlock.replaceChildren(detail);
        for (const [nodeKey, node] of nodes) {
            node.img.classList.toggle('focus', nodeKey === key);
            node.img.setAttribute('aria-pressed', String(nodeKey === key));
            node.container.classList.toggle('is-focused', nodeKey === key);
        }
        wrapper.dataset.focusedAttackKey = key;
        onSelect?.(attack, index);
    }

    function build(choices) {
        nodes.clear();
        bottomBlock.replaceChildren();
        choices.forEach(({ attack, key, index }) => {
            const container = document.createElement('div');
            container.className = `attack-image-container attack-browser-thumb ${getAttackCombatFunctionClass(attack)}`.trim();
            container.dataset.attackKey = key;
            const label = document.createElement('div');
            label.className = `attack-loot-name ${getAttackCombatFunctionClass(attack)}`.trim();
            label.textContent = attackNameWithMastery(attack);
            label.appendChild(createAttackPowerValue(attack, entity()));
            const complete = document.createElement('div');
            complete.className = 'attack-img-complete';
            const frame = document.createElement('div');
            frame.className = 'attack-image-frame';
            const img = document.createElement('img');
            img.src = cachedResourceUrl(attack.attackAsset + '-ld.jpg');
            img.className = 'attackElement-asset-spell attack-image ' + attack.attackTarget.join(' ');
            applyAttackNatureBorder(img, attack);
            img.alt = attack.displayName;
            img.tabIndex = 0;
            img.setAttribute('role', 'button');
            img.addEventListener('click', () => focus(key));
            img.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); focus(key); }
            });
            const picto = createAttackTargetPictogram(attack, { codex: true });
            const { badge: rank, text: rankValue } = createAttackPriorityBadge();
            const cooldown = document.createElement('span');
            cooldown.className = 'attack-browser-cooldown';
            frame.append(img, picto, rank, cooldown);
            const sockets = createAttackEssenceSocketsElement(attack, {
                compact: true, position: 'thumb', entity: entity(), attackIndex: index,
                onApplyEssence: applyAttackEssenceSocketChoice,
            });
            if (!sockets.classList.contains('is-empty')) complete.classList.add('with-essence-sockets', 'with-compact-essence-sockets');
            complete.append(frame, sockets);
            container.append(complete, label);
            bottomBlock.appendChild(container);
            nodes.set(key, { container, img, frame, label, rank, rankValue, cooldown });
        });
        focus(nodes.has(focusedKey) ? focusedKey : choices[0]?.key);
    }

    function update() {
        const owner = entity();
        const attacks = definitions();
        currentChoices = describeAttackChoices(owner, attacks, attack => getEffectiveAttackTimings(attack, owner).effective.cooldown);
        const isAuto = owner.attackSelection.priorityMode === 'auto';
        controls.classList.toggle('is-auto', isAuto);
        controls.setAttribute('aria-pressed', String(isAuto));
        controls.textContent = isAuto ? 'Priorité auto' : 'Priorité personnalisée';
        controls.title = isAuto
            ? 'Désactiver la priorité automatique et restaurer le dernier classement personnalisé'
            : 'Activer la priorité automatique';
        controls.hidden = attacks.length <= 1;
        bottomBlock.hidden = attacks.length <= 1;
        const ordered = currentChoices.slice().sort((a, b) => a.priority - b.priority || a.index - b.index);
        const nextSignature = JSON.stringify(attacks.map(({ mastery, ...definition }) => definition));
        if (signature !== nextSignature) {
            signature = nextSignature;
            build(ordered);
        }
        const now = clockNow();
        ordered.forEach((choice, order) => {
            const node = nodes.get(choice.key);
            if (node.label.firstChild?.nodeType === Node.TEXT_NODE) node.label.firstChild.textContent = attackNameWithMastery(choice.attack);
            node.container.style.order = String(order);
            node.rankValue.textContent = String(choice.priority);
            node.rank.title = `${isAuto ? 'Priorité automatique' : 'Priorité manuelle'} ${choice.priority}`;
            const detailRank = topBlock.querySelector(`.attack-priority-badge--detail[data-attack-key="${cssEscape(choice.key)}"]`);
            if (detailRank) {
                detailRank.querySelector('.attack-priority-badge-value').textContent = String(choice.priority);
                detailRank.title = node.rank.title;
            }
            const remaining = getAttackRuntime(owner, choice.attack).readyAt - now;
            node.cooldown.hidden = remaining <= 0;
            node.cooldown.textContent = remaining > 0 ? formatAttackCooldown(remaining) : '';
            node.container.classList.toggle('is-cooling-down', remaining > 0);
            node.container.classList.toggle('is-attack-disabled', choice.disabled);
            node.container.classList.toggle('is-current-attack', owner.currentAttackId === choice.key
                && ['attack_1', 'attack_2', 'attack_3'].includes(owner.currentPhase));
            const sparkPhaseMs = attacks.length > 1
                ? -(choice.index * ATTACK_SPARK_PHASE_STEP_MS)
                : null;
            syncAttackActivationPresentation(node.container, owner, choice.attack, node.frame, sparkPhaseMs,
                { compact: true, imageToggle: true, resolveOwner: entity });
        });
        if (prioritySelect) {
            prioritySelect.disabled = false;
            prioritySelect.value = String(getAttackControlValue(owner, 'priorities', focusedKey, owner.attackSelection.priorities[focusedKey]));
        }
    }

    update();
    multiAttackViews.set(wrapper, { update, connected: false, createdAt: clockNow(), masteryChanged(owner) {
        if (String(owner.id) !== String(entity().id)) return;
        signature = JSON.stringify(definitions().map(({ mastery, ...definition }) => definition));
    } });
    if (!multiAttackViewTimer) multiAttackViewTimer = setTimeout(refreshMultiAttackViews, 100);
    return wrapper;
}

function normalizeInventoryLookupValue(value = '') {
    return String(value ?? '').trim().toLowerCase();
}

function pushUniqueInventoryLookupValue(list, value) {
    const text = String(value ?? '').trim();
    if (!text) return;

    const key = normalizeInventoryLookupValue(text);
    if (list.some(entry => normalizeInventoryLookupValue(entry) === key)) return;

    list.push(text);
}

function getInventoryAttackKeyCandidates(attack = {}) {
    const keys = [];

    if (Array.isArray(attack)) {
        attack.forEach(value => pushUniqueInventoryLookupValue(keys, value));
        return keys;
    }

    if (attack && typeof attack === 'object') {
        if (Array.isArray(attack.keys)) {
            attack.keys.forEach(value => pushUniqueInventoryLookupValue(keys, value));
        }

        pushUniqueInventoryLookupValue(keys, attack.key);
        pushUniqueInventoryLookupValue(keys, attack.attackKey);
        pushUniqueInventoryLookupValue(keys, attack.templateKey);
        pushUniqueInventoryLookupValue(keys, attack.functionName);
        pushUniqueInventoryLookupValue(keys, attack.attackId);
        pushUniqueInventoryLookupValue(keys, attack.entityAttackId);
        pushUniqueInventoryLookupValue(keys, readAttackDefinitionKey(attack));
        pushUniqueInventoryLookupValue(keys, attack.displayName);
        return keys;
    }

    pushUniqueInventoryLookupValue(keys, attack);
    return keys;
}

function resolveCurrentAttackWithIndex(entite, attackDetails, target = null) {
  const attacks = ensureEntityAttackInstances(entite, attackDetails);
  const targetIndex = Number(target?.attackIndex);

  if (target?.attackIndex != null && Number.isInteger(targetIndex) && attacks[targetIndex]) {
    return {
      attack: attacks[targetIndex],
      index: Math.max(0, Math.floor(targetIndex)),
    };
  }

  const targetKeys = new Set(getInventoryAttackKeyCandidates(target).map(normalizeInventoryLookupValue));
  if (targetKeys.size) {
    const matchedIndex = attacks.findIndex(attack => {
      return getInventoryAttackKeyCandidates(attack)
        .some(key => targetKeys.has(normalizeInventoryLookupValue(key)));
    });

    if (matchedIndex >= 0) {
      return {
        attack: attacks[matchedIndex],
        index: matchedIndex,
      };
    }
  }

  const fallbackRef = entite?.attacks?.[0] || attacks[0];
  const fallbackAttack = fallbackRef
    ? resolveAttackDefinitionForEntity(entite, fallbackRef, attackDetails)
    : null;

  return {
    attack: fallbackAttack,
    index: 0,
  };
}

function getCurrentAttack(entite, attackDetails, target = null) {
  return resolveCurrentAttackWithIndex(entite, attackDetails, target).attack;
}

function resolveAttackRangeType(attack) {
  const r = Array.isArray(attack?.attackRange) ? attack.attackRange : [attack?.attackRange].filter(Boolean);
  if (r.includes("range") || r.includes("ranged") || r.includes("distance")) return "range";
  return "melee";
}

function resolveAttackNatureType(attack, entite) {
  const n = getAttackNatureRules(attack).natures;

  const hasMagical  = n.includes("magicalDamage");
  const hasPhysical = n.includes("physicalDamage");
  const hasHybridal = n.includes("hybridalDamage");

  // Base nature prioritaire
  if (hasMagical) return "magicalDamage";
  if (hasPhysical) return "physicalDamage";
  if (hasHybridal) return "hybridalDamage";

  if (n.includes("transpiercingDamage")) return "transpiercingDamage";
  if (n.includes("piercingDamage")) return "piercingDamage";

  return null;
}

function createAttackReadOnlyOverview(entite, { variant = 'profile', onOpenAttack = null } = {}) {
  const wrapper = document.createElement('div');
  wrapper.className = `attack-readonly-overview attack-readonly-overview--${variant}`;
  const attacks = readAttackDefinitionsForEntity(entite, attackDetails);

  if (!attacks.length) {
    const empty = document.createElement('p');
    empty.className = 'codex-attacks-empty';
    empty.textContent = 'Aucune attaque.';
    wrapper.appendChild(empty);
    return wrapper;
  }

  if (variant === 'stats') {
    const choices = document.createElement('div');
    choices.className = 'attack-imgs multi-attacks attack-stats-choices';
    choices.setAttribute('role', 'group');
    choices.setAttribute('aria-label', 'Choisir une attaque à consulter');
    const detailHost = document.createElement('div');
    detailHost.className = 'attack-stats-selected';
    const buttons = [];
    const select = (attack, index) => {
      const key = attackSelectionKey(attack);
      setCodexFocusedAttackKey(entite, attack);
      buttons.forEach(button => {
        const focused = button.dataset.attackKey === key;
        button.classList.toggle('is-focused', focused);
        button.setAttribute('aria-pressed', String(focused));
      });
      const detail = document.createElement('div');
      detail.className = `attack-readonly-entry attack-stats-detail ${getAttackCombatFunctionClass(attack)}`;
      if (entite.attackSelection?.disabled?.[key] === true) detail.classList.add('is-attack-disabled');
      const heading = document.createElement('div');
      heading.className = `attack-loot-name ${getAttackCombatFunctionClass(attack)}`;
      heading.textContent = attackDisplayName(attack);
      heading.appendChild(createAttackPowerValue(attack, entite));
      if (detail.classList.contains('is-attack-disabled')) {
        const disabled = document.createElement('span');
        disabled.className = 'attack-disabled-label';
        disabled.textContent = 'Désactivée';
        heading.appendChild(disabled);
      }
      detail.append(heading, createAttackDescriptionContent(attack, createAttackStatView(entite, attack)));
      const essenceBonuses = createAttackSubmenuInfos(entite, attackDetails, { compact: true, attack });
      if (essenceBonuses) detail.appendChild(essenceBonuses);
      if (onOpenAttack) {
        const manage = document.createElement('button');
        manage.type = 'button';
        manage.className = 'codex-attack-detail-link';
        manage.textContent = 'Gérer cette attaque';
        manage.addEventListener('click', () => onOpenAttack(attack, index));
        detail.appendChild(manage);
      }
      detailHost.replaceChildren(detail);
    };
    attacks.forEach((attack, index) => {
      const key = attackSelectionKey(attack);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `attack-browser-thumb attack-stats-choice ${getAttackCombatFunctionClass(attack)}`;
      button.dataset.attackKey = key;
      button.setAttribute('aria-label', attackDisplayName(attack));
      const disabled = entite.attackSelection?.disabled?.[key] === true;
      if (disabled) button.classList.add('is-attack-disabled');
      const frame = document.createElement('span');
      frame.className = `attack-image-frame${disabled ? ' attack-image-frame--disabled' : ''}`;
      const image = document.createElement('img');
      image.className = 'attackElement-asset-spell attack-image';
      image.src = cachedResourceUrl(`${attack.attackAsset}-ld.jpg`);
      image.alt = '';
      applyAttackNatureBorder(image, attack);
      frame.append(image, createAttackTargetPictogram(attack, { codex: true }));
      const label = document.createElement('span');
      label.className = `attack-loot-name ${getAttackCombatFunctionClass(attack)}`;
      label.textContent = attackDisplayName(attack);
      label.appendChild(createAttackPowerValue(attack, entite));
      button.append(frame, label);
      button.addEventListener('click', () => select(attack, index));
      buttons.push(button);
      choices.appendChild(button);
    });
    if (attacks.length > 1) wrapper.appendChild(choices);
    wrapper.appendChild(detailHost);
    const rememberedIndex = attacks.findIndex(attack => attackSelectionKey(attack) === getCodexFocusedAttackKey(entite));
    select(attacks[rememberedIndex >= 0 ? rememberedIndex : 0], rememberedIndex >= 0 ? rememberedIndex : 0);
    return wrapper;
  }

  const activeAttacks = attacks
    .map((attack, attackIndex) => ({ attack, attackIndex }))
    .filter(({ attack }) => entite.attackSelection?.disabled?.[attackSelectionKey(attack)] !== true);

  if (!activeAttacks.length) {
    const empty = document.createElement(onOpenAttack ? 'button' : 'p');
    if (empty instanceof HTMLButtonElement) empty.type = 'button';
    empty.className = 'attack-active-empty';
    empty.textContent = `Aucune attaque active sur ${attacks.length} disponible${attacks.length > 1 ? 's' : ''}.`;
    if (onOpenAttack) empty.addEventListener('click', () => onOpenAttack(attacks[0], 0));
    wrapper.appendChild(empty);

    if (variant === 'stats' && onOpenAttack) {
      const manage = document.createElement('button');
      manage.type = 'button';
      manage.className = 'codex-attack-detail-link codex-attack-manage-link';
      manage.textContent = 'Gérer les attaques';
      manage.addEventListener('click', () => onOpenAttack(attacks[0], 0));
      wrapper.appendChild(manage);
    }
    return wrapper;
  }

  activeAttacks.forEach(({ attack, attackIndex }) => {
    const card = AttackDetailInfos(attack, entite, false, attackIndex, {
      showUmbraPanel: false,
      descriptionOnly: false,
      showProgression: false,
      showActivation: false,
      onSocketClick: ({ slotIndex }) => onOpenAttack?.(attack, attackIndex, slotIndex),
    });
    card.classList.add('attack-readonly-entry');
    card.dataset.attackKey = attackSelectionKey(attack);
    if (variant === 'stats') {
      const essenceBonuses = createAttackSubmenuInfos(entite, attackDetails, {
        compact: true,
        attack,
      });
      if (essenceBonuses) card.appendChild(essenceBonuses);
    }

    const detail = document.createElement('button');
    detail.type = 'button';
    detail.className = 'codex-attack-detail-link';
    detail.textContent = variant === 'stats' ? 'Umbras utilisées' : 'Détail';
    detail.addEventListener('click', () => onOpenAttack?.(attack, attackIndex));
    card.appendChild(detail);
    wrapper.appendChild(card);
  });

  return wrapper;
}

function createAttackSubmenu(entite, attackDetails, { compact = true, contextHost = null } = {}) {
  const wrapper = document.createElement('div'); wrapper.className = 'sub-menu-stat attack-submenu';
  wrapper.dataset.entityId = String(entite.id);
  wrapper.dataset.normalTitle = compact ? "Statistiques d'attaque"
    : readAttackDefinitionsForEntity(entite, attackDetails).length > 1
      ? `Attaques de ${entite.nickname || entite.name || entite.class || "l'entité"}` : 'Attaques';
  const header = document.createElement('div'); header.className = 'submenu-header'; header.appendChild(createEntityStatsTitleNode(compact ? "Statistiques d'attaque" : "Attaques")); wrapper.appendChild(header);
  if (!compact) {
    const available = readAttackDefinitionsForEntity(entite, attackDetails);
    if (available.length && available.every(item => entite.attackSelection?.disabled?.[attackSelectionKey(item)] === true)) {
      const title = header.querySelector('.entity-stats-title > .title');
      title.textContent = "Cette entité n'a plus d'attaque active";
      title.classList.add('attack-all-disabled-title');
    }
  }

  const attackTarget = getPendingInventoryCodexAttackTarget(entite);
  const rememberedKey = getCodexFocusedAttackKey(entite);
  const { attack, index: attackIndex } = resolveCurrentAttackWithIndex(entite, attackDetails,
    attackTarget || (rememberedKey ? { key: rememberedKey } : null));
  if (!attack) {
    const empty = document.createElement('p');
    empty.className = 'codex-attacks-empty';
    empty.textContent = 'Aucune attaque.';
    wrapper.appendChild(empty);
    return wrapper;
  }
  wrapper._attack = attack;
  const umbraHost = contextHost ? document.createElement('div') : null;
  if (umbraHost) umbraHost.className = 'attack-submenu-umbra';
  const renderContext = (selected, owner = entite) => {
    if (!contextHost) return false;
    const infos = createAttackSubmenuInfos(owner, attackDetails, { compact, attack: selected });
    const title = document.createElement('div');
    title.className = 'attack-context-title';
    title.textContent = `Propriétés · ${attackDisplayName(selected)}`;
    title.appendChild(createAttackPowerValue(selected, owner));
    contextHost.replaceChildren();
    contextHost.appendChild(title);
    if (infos) contextHost.appendChild(infos);
    umbraHost.replaceChildren(createAttackUmbraPanel(owner, selected, { showMissingRequirement: true }));
    return true;
  };
  const onEssenceUpdate = ({ type, detail }) => {
    if (!wrapper.isConnected) {
      wrapper._dispose();
      return;
    }
    if (type === 'selectedArmyAUpdated' && detail?.source !== 'essenceur') return;
    if (String(detail?.entityId) !== String(entite.id)
        || attackSelectionKey(detail.attack) !== attackSelectionKey(wrapper._attack)) return;
    const replacement = createAttackSubmenu(detail.entite || entite, attackDetails, { compact, contextHost });
    wrapper._dispose();
    wrapper.replaceWith(replacement);
  };
  window.addEventListener('attackEssenceSocketUpdated', onEssenceUpdate);
  window.addEventListener('selectedArmyAUpdated', onEssenceUpdate);
  wrapper._dispose = () => {
    window.removeEventListener('attackEssenceSocketUpdated', onEssenceUpdate);
    window.removeEventListener('selectedArmyAUpdated', onEssenceUpdate);
  };
  if (readAttackDefinitionsForEntity(entite, attackDetails).length > 1) {
    const infosHost = document.createElement('div');
    const browser = MultiAttackDisplay(entite, {
      selectedAttackKey: attackSelectionKey(attack),
      showUmbraPanel: !contextHost,
      codexLayout: !!contextHost,
      onSelect: selected => {
        wrapper._attack = selected;
        setCodexFocusedAttackKey(entite, selected);
        if (renderContext(selected)) return;
        infosHost.replaceChildren();
        const infos = createAttackSubmenuInfos(entite, attackDetails, { compact, attack: selected });
        if (infos) infosHost.appendChild(infos);
      },
    });
    if (contextHost) {
      const selector = browser.querySelector(':scope > .attack-imgs.multi-attacks');
      const titleRoot = header.querySelector('.entity-stats-title');
      const title = titleRoot?.querySelector(':scope > .title');
      const lowerLine = titleRoot?.querySelector(':scope > .separation-line:last-child');
      if (selector && titleRoot && title) {
        const center = document.createElement('div');
        center.className = 'attack-multi-header-center';
        if (!title.classList.contains('attack-all-disabled-title')) title.textContent = `Attaques de ${entite.nickname || entite.name || entite.class || 'l\'entité'}`;
        title.replaceWith(center);
        center.append(title, selector);
        header.classList.add('multi-attack-header');
        if (lowerLine) titleRoot.appendChild(lowerLine);
      }
    }
    wrapper.appendChild(browser);
    if (umbraHost) wrapper.appendChild(umbraHost);
    if (!contextHost) wrapper.appendChild(infosHost);
    return wrapper;
  }

  const node = AttackDetailInfos(attack, entite, compact, attackIndex, { showUmbraPanel: !contextHost, codexLayout: !!contextHost }); if (!node) return wrapper;
  wrapper.appendChild(node);
  if (umbraHost) wrapper.appendChild(umbraHost);
  if (!renderContext(attack)) {
    const infos = createAttackSubmenuInfos(entite, attackDetails, { compact, attack });
    if (infos) wrapper.appendChild(infos);
  }

  wrapper._initAttack = () => { if (typeof node._initAttack === 'function') node._initAttack(); };
  return wrapper;
}

function readTimingReduction(timingReduc, key) {
  const direct = timingReduc?.[key];
  const pct = timingReduc?.[`${key}Pct`];
  const value = direct ?? pct;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

const ATTACK_SUBMENU_MAP = {
  melee: {
    common: (frag, entite, flags = {}, attack = null, timingReduc = {}) => {
frag.appendChild(
  createFullStatDom({
    stat: "shortRange",
    label: "Courte portée :",
    value: "<span class='less-bonus'>-</span> <span class='value-duo'>${value}%</span> <div class='picto-stat executionTime'></div>",
    entite,
    calculatorName: () => Number(timingReduc?.meleeExecBaseBonus ?? calculateMeleeExecBonus(entite, attack)),
    dataStat: "executionMelee",
  })
);

    },

    magicalDamage: (frag, entite, flags = {}) => {
      if (!flags.isPureMagicalPsionique) return;

      if (flags.canBrokenSpell) frag.appendChild(
        createFullStatDom({
          stat: "messedSpell",
          label: "Surcharge magique : ",
          value: "${value} %",
          entite,
          calculatorName: "calculateBrokenSpellChance",
          dataStat: "messedSpell",
        })
      );

      frag.appendChild(
        createFullStatDom({
          stat: "psionic",
          label: "Psionique :",
          value: "<span class='value-duo'>${value}%</span> <div class='picto-stat magicalDamage'></div>",
          entite,
          calculatorName: "psionicPercantBonus",
          dataStat: "psionic",
        })
      );

	  
    },

    physicalDamage: (frag, entite, flags = {}) => {
      if (!flags.isPurePhysicalBrutality) return;

      frag.appendChild(
        createFullStatDom({
          stat: "fracass",
          label: "Fracassante :",
          value: "<span class='value-duo'>${value}%</span> <div class='picto-stat physicalDamage'></div>",
          entite,
          calculatorName: "brutalityPercantBonus",
          dataStat: "fracass",
        })
      );
    },

    hybridalDamage: (frag, entite) => {},

piercingDamage: (frag, entite, flags = {}, attack = null, timingReduc = {}) => {
  frag.appendChild(
    createFullStatDom({
      stat: "piercingDamage",
      label: "Récupération perçante :",
      value: "- ${value} %",
      entite,
      calculatorName: () => readTimingReduction(timingReduc, "piercingRecupReduc") ?? totalPiercingRecupReductionWithAgi(entite, attack),
      dataStat: "piercingDamage",
    })
  );
},
transpiercingDamage: (frag, entite, flags = {}, attack = null, timingReduc = {}) => {
  frag.appendChild(
    createFullStatDom({
      stat: "transpiercingDamage",
      label: "Récupération transperçante :",
      value: "- ${value} %",
      entite,
      calculatorName: () => readTimingReduction(timingReduc, "transpiercingRecupReduc") ?? totalTranspiercingRecupReductionWithAgi(entite, attack),
      dataStat: "transpiercingDamage",
    })
  );

  frag.appendChild(
    createFullStatDom({
      stat: "piercingDamage",
      label: "Transpercement :",
      value: "Bonus de + ${value} aux dégâts",
      entite,
      calculatorName: "transpiercingAgiRatio",
      showZero: true,
      dataStat: "transpiercingPower",
    })
  );

  frag.appendChild(
    createFullStatDom({
      stat: "perforation",
      label: "Perforation",
      value: "${value} %",
      entite,
      calculatorName: () => getAttackNatureRules(attack || entite.currentAttack).armorBypassPercent,
      dataStat: "perforation",
    })
  );
},
  },

  range: {
    common: (frag, entite, flags = {}, attack = null, timingReduc = {}) => {
      frag.appendChild(
        createFullStatDom({
          stat: "rangeAttack",
          label: "Vitesse des projectiles :",
          value: "+ ${value} %",
          entite,
          calculatorName: () => Number(timingReduc?.projectileSpeedReduc ?? getFinalAttackProjectileSpeed(entite)),
          dataStat: "projectileTime",
        })
      );
    },

    physicalDamage: (frag, entite, flags = {}) => {
      if (!flags.isPurePhysicalBrutality) return;

      frag.appendChild(
        createFullStatDom({
          stat: "fracass",
          label: "Fracassante :",
          value: "<span class='value-duo'>${value}%</span> <div class='picto-stat physicalDamage'></div>",
          entite,
          calculatorName: "brutalityPercantBonus",
          dataStat: "fracass",
        })
      );
    },

    magicalDamage: (frag, entite, flags = {}) => {
      if (!flags.isPureMagicalPsionique) return;

      if (flags.canBrokenSpell) frag.appendChild(
        createFullStatDom({
          stat: "brokenSpell",
          label: "Surcharge magique : ",
          value: "${value} %",
          entite,
          calculatorName: "calculateBrokenSpellChance",
          dataStat: "brokenSpell",
        })
      );

      frag.appendChild(
        createFullStatDom({
          stat: "psionic",
          label: "Psionique :",
          value: "<span class='value-duo'>${value}%</span> <div class='picto-stat magicalDamage'></div>",
          entite,
          calculatorName: "psionicPercantBonus",
          dataStat: "psionic",
        })
      );
    },

    hybridalDamage: (frag, entite) => {},

    piercingDamage: (frag, entite, flags = {}, attack = null, timingReduc = {}) => {
      frag.appendChild(
        createFullStatDom({
          stat: "piercingDamage",
          label: "Réduction récupération (perçante) :",
          value: "- ${value} %",
          entite,
          calculatorName: () => readTimingReduction(timingReduc, "piercingRecupReduc") ?? totalPiercingRecupReductionWithAgi(entite, attack),
          dataStat: "piercingDamage",
        })
      );
    },

    transpiercingDamage: (frag, entite, flags = {}, attack = null, timingReduc = {}) => {

frag.appendChild(
  createFullStatDom({
    stat: "transpiercingDamage",
    label: "Réduction récupération transperçante :",
    value: "- ${value} %",
    entite,
    calculatorName: () => readTimingReduction(timingReduc, "transpiercingRecupReduc") ?? totalTranspiercingRecupReductionWithAgi(entite, attack),
    dataStat: "transpiercingDamage",
  })
);

      frag.appendChild(
        createFullStatDom({
          stat: "piercingDamage",
          label: "Transpercement :",
          value: "Bonus de + ${value} aux dégâts",
          entite,
          calculatorName: "transpiercingAgiRatio",
          showZero: true,
          dataStat: "transpiercingPower",
        })
      );

      frag.appendChild(
        createFullStatDom({
          stat: "perforation",
          label: "Perforation",
          value: "${value} %",
          entite,
          calculatorName: () => getAttackNatureRules(attack || entite.currentAttack).armorBypassPercent,
          dataStat: "perforation",
        })
      );
    },
  },
};

function appendRangeAccuracyAdvantage(frag, entite) {
  frag.appendChild(
    createFullStatDom({
      stat: "rangeAttack",
      label: "Évitement de la dernière cible invisible :",
      value: "${value} %",
      entite,
      calculatorName: "calculateInvisibleTargetAvoidChance",
      dataStat: "rangeAttack",
    })
  );
}

function appendRangeDamageAdvantage(frag, entite) {
  if (!getRangePenaltyDetails(entite).applicable) return;
  frag.appendChild(createFullStatDom({
    stat: 'bullsEye',
    label: 'Bull’s Eye :',
    value: '${value} %',
    entite,
    calculatorName: 'calculateBullsEyePercent',
  }));
  frag.appendChild(
    createFullStatDom({
      stat: "rangeAttack",
      label: "Malus de dégâts à distance :",
      value: "${value} %",
      entite,
      calculatorName: "calculateRangeRatio",
      dataStat: "rangeAttack",
    })
  );
}

function appendCriticalAdvantages(frag, entite, attack) {
  if (!getAttackResolutionFlags(attack).canCrit || calculateCritTotalChance(entite) <= 0) return;
  for (const [stat, label, calculatorName] of [
    ['criticalChance', 'Chance de critique :', 'calculateCritTotalChance'],
    ['criticalDamage', 'Supplément critique :', 'calculateCritDamageBonus'],
  ]) frag.appendChild(createFullStatDom({ stat, label, value: '${value} %', entite, calculatorName }));
}

function appendSharedRangeAdvantages(frag, entite, flags = {}, timingReduc = {}) {
  if (!flags.isRange) return;

  const isTranspiercing = Boolean(timingReduc?.isTranspiercing || flags.isTranspiercing);

  if (flags.canMissAccuracy && !isTranspiercing) {
    appendRangeAccuracyAdvantage(frag, entite);
  }

  appendRangeDamageAdvantage(frag, entite);
}

function buildAttackSubmenuFallbackAttack(rangeType, natureType) {
  return {
    attackRange: [rangeType === "range" ? "range" : "melee"],
    attacknature: natureType ? [natureType] : [],
    preparationTime: 0,
    executionTime: 0,
    recoveryTime: 0,
    cooldown: 0,
  };
}

function attackSubmenuInfos(rangeType, natureType, entite, attack = null) {
  const frag = document.createDocumentFragment();

  const r = rangeType === "range" ? "range" : "melee";
  const bucket = ATTACK_SUBMENU_MAP[r];
  if (!bucket) return frag;

  const actualAttack = attack || buildAttackSubmenuFallbackAttack(rangeType, natureType);
  if (getAttackNatureRules(actualAttack).isInert) {
    frag.append(createAttackNatureSignature(entite, actualAttack));
    if (r === 'range') appendRangeDamageAdvantage(frag, createAttackStatView(entite, actualAttack));
    appendCriticalAdvantages(frag, createAttackStatView(entite, actualAttack), actualAttack);
    frag.append(createAttackCriticalPanel(entite, actualAttack));
    return frag;
  }
  entite = createAttackStatView(entite, actualAttack);
  const flags = getAttackResolutionFlags(actualAttack);
  const timings = getEffectiveAttackTimings(actualAttack, entite);
  const timingReduc = timings?.reduc || {};
  const damagePreview = calculateAttackDamagePreview(entite, actualAttack);

  if (typeof bucket.common === "function") {
    bucket.common(frag, entite, flags, actualAttack, timingReduc, damagePreview);
  }

  appendSharedRangeAdvantages(frag, entite, flags, timingReduc);
  appendCriticalAdvantages(frag, entite, actualAttack);
  if (flags.isRange && getAttackNatureRules(actualAttack).key === 'prism') {
    frag.appendChild(createFullStatDom({ stat: 'rangeAttack', label: 'Malus de distance :', value: 'Aucun', entite }));
  }

  const resolvedNatureType =
    timingReduc.isTranspiercing || flags.isTranspiercing
      ? "transpiercingDamage"
      : natureType;

  if (resolvedNatureType && typeof bucket[resolvedNatureType] === "function") {
    bucket[resolvedNatureType](frag, entite, flags, actualAttack, timingReduc, damagePreview);
  }

  if (
    timingReduc.isPiercing &&
    !timingReduc.isTranspiercing &&
    typeof bucket.piercingDamage === "function"
  ) {
    bucket.piercingDamage(frag, entite, {
      ...flags,
      mode: "additive",
    }, actualAttack, timingReduc, damagePreview);
  }

  const natureRules = getAttackNatureRules(actualAttack);
  const purity = getAttackPurity(actualAttack);
  if (natureRules.profile.total) {
    frag.querySelectorAll('.stat-container').forEach(row => {
      const key = row.dataset.stat;
      if (!['fracass', 'psionic', 'transpiercingDamage', 'piercingDamage', 'transpiercingPower', 'perforation', 'brokenSpell', 'messedSpell'].includes(key)) return;
      const level = ['piercingDamage', 'transpiercingDamage'].includes(key) ? natureRules.profile.yellow : purity.level;
      const label = row.querySelector('.stat-name');
      if (label) label.textContent = label.textContent.replace(/\s*:\s*$/, '') + ` ${level} :`;
      row.dataset.purityLevel = level;
      row.dataset.purityBonus = purity.bonus;
    });
  }
  const powerRatios = getAttackPowerRatios(actualAttack);
  frag.querySelectorAll('.stat-container[data-stat="fracass"], .stat-container[data-stat="psionic"]').forEach(row => {
    const physical = row.dataset.stat === 'fracass';
    if ((physical ? powerRatios.physical : powerRatios.magical) > 0) return;
    row.classList.add('attack-ratio-inactive');
    row.dataset.helperSuffix = physical
      ? HELPER_TEXT.unusedPhysicalRatio
      : HELPER_TEXT.unusedMagicalRatio;
  });
  const signature = createAttackNatureSignature(entite, actualAttack);
  if (signature) frag.append(signature);
  frag.append(createAttackCriticalPanel(entite, actualAttack));
  return frag;
}

function createAttackSubmenuInfos(entite, attackDetails, { compact = true, attack: selectedAttack = null } = {}) {
  const attack = selectedAttack || getCurrentAttack(entite, attackDetails, getPendingInventoryCodexAttackTarget(entite));
  if (!attack) return null;

  const root = document.createElement('div');
  root.className = 'attack-submenu-infos' + (compact ? ' compact' : '');
  root.dataset.entityId = String(entite.id);
  const header = document.createElement('div');
  header.className = 'submenu-header attack-context-section-title';
  header.textContent = "Compétences de l'attaque";
  root._refreshStats = (owner = resolvePowerOwner(entite)) => {
    if (String(owner.id) !== String(entite.id)) return;
    // Use the displayed attack, which can differ from the entity's active attack.
    const selected = resolveAttackDefinitionForEntity(owner, attackSelectionKey(attack), attackDetails) || attack;
    const frag = attackSubmenuInfos(resolveAttackRangeType(selected), resolveAttackNatureType(selected, owner), owner, selected);
    root.replaceChildren(header);
    if (frag.childNodes.length) {
      root.appendChild(frag);
    } else {
      const empty = document.createElement('small');
      empty.className = 'attack-context-empty';
      empty.textContent = 'Aucune compétence propre à cette attaque.';
      root.appendChild(empty);
    }
  };
  root._refreshStats();

  return root;
}

function formatAttackCooldown(ms) {
  return `${(Math.max(0, ms) / 1000).toFixed(2).replace('.', ',')} s`;
}

function createCooldownWaitView(entity) {
  flushCombatDisplay();
  const image = document.getElementById(`currentAttackImage_${entity.id}`);
  const visual = image?.closest('.active-attack-visual');
  const text = document.getElementById(`battlePreparation_${entity.id}`);
  const bar = document.getElementById(`currentAttackBar_${entity.id}`);
  const original = image ? { src: image.getAttribute('src'), alt: image.alt, executed: image.classList.contains('attack-executed') } : null;
  image?.classList.remove('attack-executed');
  const originalText = text?.innerHTML;
  const countdown = document.createElement('span');
  countdown.className = 'attack-cooldown-countdown';
  visual?.appendChild(countdown);
  visual?.classList.add('cooldown-preview');
  if (bar) { bar.style.width = '0%'; bar.className = 'attack-bar-fill empty'; }
  let previewKey = null;
  return {
    update(choice, now) {
      if (!choice) return;
      if (choice.key !== previewKey) {
        previewKey = choice.key;
        if (image) {
          image.src = cachedResourceUrl(`${choice.attack.attackAsset}-ld.jpg`);
          image.alt = choice.attack.displayName;
        }
        if (text) text.textContent = choice.attack.displayName;
        if (visual) visual.dataset.pendingAttackKey = choice.key;
      }
      const remaining = formatAttackCooldown(choice.readyAt - now);
      setDOMText(countdown, remaining);
      countdown.title = `Disponible dans ${remaining}`;
    },
    clear() {
      countdown.remove();
      visual?.classList.remove('cooldown-preview');
      if (visual) delete visual.dataset.pendingAttackKey;
      if (image && original) {
        if (original.src === null) image.removeAttribute('src');
        else image.setAttribute('src', original.src);
        image.alt = original.alt;
        image.classList.toggle('attack-executed', original.executed);
      }
      if (text) text.innerHTML = originalText;
    },
  };
}

const views = new WeakMap();

const colorNames = { red: 'Force', blue: 'Intelligence', yellow: 'Agilité' };

function attachHelper(node, key, html, entity, attack) {
  node.dataset.stat = key;
  node.dataset.hover = 'true';
  node.dataset.helperKey = `${entity.id}-${attack.entityAttackId}-${key}`;
  node.dataset.entityId = entity.id;
  node.dataset.helperText = html;
  node.tabIndex = 0;
}

function createAttackCriticalPanel(entity, attack) {
  const nature = getAttackNatureRules(attack);
  const view = createAttackStatView(entity, attack);
  const plan = criticalNaturePlan(nature, 100, calculateCritDamageBonus(view));
  const presentation = buildAttackCriticalDescription(nature, plan, {
    support: getAttackCombatFunctionClass(attack) === 'Support',
    canCrit: getAttackResolutionFlags(attack).canCrit,
  });
  const panel = document.createElement('section');
  panel.className = 'attack-critical-panel';
  panel.dataset.criticalNature = nature.key;
  const title = document.createElement('strong');
  title.className = nature.stat;
  const icon = document.createElement('span');
  icon.className = `picto-stat criticalHit ${nature.stat}`;
  icon.setAttribute('aria-hidden', 'true');
  title.append(icon, presentation.title);
  panel.append(title);
  if (presentation.bonus) {
    const bonus = document.createElement('p');
    bonus.className = 'attack-critical-bonus';
    bonus.textContent = presentation.bonus;
    panel.append(bonus);
  }
  const list = document.createElement('ul');
  for (const text of presentation.lines) {
    const item = document.createElement('li');
    item.textContent = text;
    list.append(item);
  }
  panel.append(list);
  if (presentation.note) {
    const note = document.createElement('small');
    note.textContent = presentation.note;
    panel.append(note);
  }
  return panel;
}

function createAttackNatureSignature(entity, attack) {
  const nature = getAttackNatureRules(attack);
  const signature = nature.signature;
  if (nature.isInert) {
    const loss = balanceData.attackNature.inertRatioReductionPercent;
    const rows = document.createDocumentFragment();
    const row = document.createElement('div');
    row.className = 'attack-nature-signature inerte';
    row.innerHTML = '<span class="picto-stat inerte inerte-resistance" aria-hidden="true"></span>Attaque sans nature : toutes les résistances la réduisent.';
    attachHelper(row, 'inerte', HELPER_TEXT.inertResistance, entity, attack);
    const energyLoss = document.createElement('div');
    energyLoss.className = 'attack-nature-signature attack-inert-energy-loss inerte';
    energyLoss.innerHTML = `<span class="picto-stat inerte inerte-ratio" aria-hidden="true"></span>Énergie perdue : les ratios de l’attaque sont réduits de ${loss} %.`;
    attachHelper(energyLoss, 'attackInertEnergyLoss', buildInertEnergyHelper({ loss }), entity, attack);
    rows.append(row, energyLoss);
    return rows;
  }
  if (!signature) return null;
  const view = createAttackStatView(entity, attack);
  const resonance = signature.key === 'resonance'
    ? getAttackResonance(attack, getSafe(view, 'physicalDamage'), getSafe(view, 'magicalDamage')) : null;
  if (resonance && !resonance.bonus) return null;
  const row = document.createElement('div');
  row.className = `attack-nature-signature ${signature.stat}`;
  const title = document.createElement('strong');
  title.textContent = `${signature.label}${resonance?.perfect ? ' parfaite' : ''} ${signature.level}`;
  const icon = document.createElement('span');
  icon.className = `picto-stat ${signature.stat} attack-signature-picto attack-signature-picto--${signature.key}`;
  title.prepend(icon);
  const description = document.createElement('p');
  const { descriptionText, helper } = buildAttackSignatureHelper({ resonance, balanceData, signature, getSafe, view, nature, attack });
  description.textContent = descriptionText;
  attachHelper(row, `attackNature-${signature.key}`, `${title.textContent}<br>${description.textContent}<br><br>${helper}`, entity, attack);
  row.append(title, description);
  return row;
}

function createAttackUmbraPanel(entity, attack, { availableOnly = false, showMissingRequirement = false } = {}) {
  const panel = document.createElement('div');
  panel.className = 'attack-umbra-panel';
  const entries = getAttackUmbraAccess(entity, attack).filter(entry => entry.owned > 0);
  const attackView = createAttackStatView(entity, attack);
  const availableEntries = entries.filter(entry => entry.usable);
  const unavailableEntries = entries.filter(entry => !entry.usable);
  if (!availableEntries.length && (!unavailableEntries.length || availableOnly)) {
    const empty = document.createElement('small');
    empty.className = 'attack-umbra-empty attack-umbra-empty--all';
    empty.textContent = availableOnly
      ? "Aucune Umbra d'attaque utilisable."
      : "L'entité ne possède pas d'Umbra d'attaque.";
    panel.append(empty);
    return panel;
  }

  const heading = document.createElement('div');
  heading.className = 'attack-umbra-heading';
  heading.textContent = "Affinité à l'Umbra de l'attaque";
  attachHelper(heading, 'attackUmbraCompatibility', HELPER_TEXT.attackUmbraCompatibility, entity, attack);
  panel.append(heading);

  const groups = [{
    key: 'available',
    title: 'Umbras utilisables',
    entries: availableEntries,
    empty: "Aucune Umbra d'attaque utilisable.",
  }];
  if (!availableOnly) groups.push({
    key: 'unavailable',
    title: 'Umbras possédées mais non utilisables',
    entries: unavailableEntries,
    empty: "Aucune autre Umbra d'attaque possédée.",
  });

  for (const group of groups) {
    const section = document.createElement('section');
    section.className = `attack-umbra-group attack-umbra-group--${group.key}`;
    const list = document.createElement('div');
    list.className = 'attack-umbra-list';
    if (group.entries.length) {
      const title = document.createElement('div');
      title.className = 'attack-umbra-title';
      title.textContent = group.title;
      section.append(title);
    }
    section.append(list);

    for (const entry of group.entries) {
      const row = document.createElement('div');
      row.className = `attack-umbra-entry attack-umbra-entry--${entry.color} ${entry.usable ? 'is-available' : 'is-unavailable'}`;
      const label = document.createElement('span');
      label.className = entry.key;
      const icon = document.createElement('span');
      icon.className = `picto-stat ${entry.key}`;
      label.append(icon, document.createTextNode(entry.name));
      row.append(label);

      const normalHelper = calculateStatsDisplay(entry.key, attackView)?.helpContent || '';
      const compatibilityHelper = buildAttackUmbraCompatibilityHelper({ entry, showMissingRequirement, colorNames, escape });
      attachHelper(row, entry.key, `${normalHelper}${statSourcesHelper(entity, entry.key)}${compatibilityHelper}`, entity, attack);
      list.append(row);
    }

    if (!group.entries.length) {
      const empty = document.createElement('small');
      empty.className = 'attack-umbra-empty';
      empty.textContent = group.empty;
      list.append(empty);
    }
    panel.append(section);
  }
  return panel;
}

function createAttackProgressionView(entity, attack) {
  const root = document.createElement('div');
  root.className = 'attack-progression';
  root.dataset.attackInstance = attack.entityAttackId || '';
  root.dataset.entityId = entity.id;
  const control = document.createElement('label');
  control.className = 'attack-enabled-control';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.setAttribute('role', 'switch');
  checkbox.setAttribute('aria-label', `Activer ${attack.displayName}`);
  const state = document.createElement('span');
  control.append(checkbox, state);
  const label = document.createElement('div');
  label.className = 'attack-mastery-label';
  const gauge = document.createElement('div');
  gauge.className = 'attack-mastery-gauge';
  gauge.dataset.helperClass = 'attack-mastery-hover';
  gauge.setAttribute('role', 'progressbar');
  const fill = document.createElement('div');
  fill.className = 'attack-mastery-fill';
  const count = document.createElement('span');
  count.className = 'attack-mastery-count';
  gauge.append(fill, count);
  root.append(control, label, gauge);
  const update = (owner = entity, definition = attack) => {
    const key = attackSelectionKey(definition);
    checkbox.checked = !owner.attackSelection?.disabled?.[key];
    checkbox.setAttribute('aria-checked', String(checkbox.checked));
    attachHelper(control, 'attackActivation', buildAttackActivationHelper(checkbox.checked), owner, definition);
    const pending = !checkbox.checked && owner.currentAttackId === key
      && (['attack_1', 'attack_2', 'attack_3'].includes(owner.currentPhase)
        || owner.currentPhase === 'attack_5' && owner.recoveryTime > 0);
    state.textContent = checkbox.checked ? 'Attaque activée' : pending ? 'Désactivation après récupération' : 'Attaque désactivée';
    const progress = getAttackMastery(definition);
    label.textContent = `Niveau de maîtrise ${progress.level}`;
    gauge.setAttribute('aria-label', `${definition.displayName} : niveau de maîtrise ${progress.level}`);
    gauge.setAttribute('aria-valuenow', progress.maxed ? 1 : progress.current);
    gauge.setAttribute('aria-valuemin', '0');
    gauge.setAttribute('aria-valuemax', progress.maxed ? 1 : progress.cost);
    fill.style.width = `${progress.maxed ? 100 : progress.current / progress.cost * 100}%`;
    count.textContent = progress.maxed ? 'MAX' : `${progress.current} / ${progress.cost} · ${progress.remaining} restants`;
    const gains = balanceData.attackMastery.gains;
    attachHelper(gauge, 'attackMastery', buildAttackMasteryHelper({ progress, gains }), owner, definition);
  };
  checkbox.addEventListener('change', () => {
    setAttackEnabled(entity, readAttackDefinitionsForEntity(entity), attackSelectionKey(attack), checkbox.checked);
    saveEntityAttackSelection(entity);
    update();
  });
  views.set(root, { update, entity, attack });
  update();
  return root;
}

function refreshViews(entity, attack = null) {
  getOpenViewRoots('attackProgression').forEach(root => {
    const view = views.get(root);
    if (!view || entity && String(entity.id) !== root.dataset.entityId) return;
    const owner = entity || view.entity;
    const definition = owner.attackDetails?.find(candidate => candidate.entityAttackId === root.dataset.attackInstance) || view.attack;
    if (!attack || attack.entityAttackId === definition.entityAttackId) view.update(owner, definition);
  });
}

let activeEntityId = null;

let root = null;

let animationFrame = null;

let cards = new Map();

let definitionSignature = '';

let identityView = null;

let priorityEditor = null;

function resolveEntity(entityId = activeEntityId) {
  return entites.find(entity => String(entity?.id) === String(entityId)) || null;
}

function definitionsFor(entity) {
  return readAttackDefinitionsForEntity(entity, attackDetails);
}

function cooldownFor(entity, attack) {
  return Math.max(0, Number(getEffectiveAttackTimings(attack, entity)?.effective?.cooldown) || 0);
}

function formatCountdown(milliseconds) {
  const seconds = Math.max(0, milliseconds) / 1000;
  if (seconds <= 5) return seconds.toFixed(1).replace('.', ',');
  return String(Math.ceil(seconds));
}

function persist(entity) {
  saveEntityAttackSelection(entity);
}

function clearAttackHelpers() {
  document.querySelectorAll('.stat-hover.combat-attack-hover').forEach(helper => helper.remove());
}

function createPriorityButton(label, className, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.setAttribute('aria-label', label);
  button.title = label;
  button.addEventListener('click', event => {
    event.stopPropagation();
    onClick();
  });
  return button;
}

function closePriorityEditor() {
  if (!priorityEditor) return;
  cards.get(priorityEditor.key)?.rank.setAttribute('aria-expanded', 'false');
  priorityEditor.element.remove();
  priorityEditor = null;
}

function positionPriorityEditor() {
  if (!priorityEditor || !root) return;
  const anchor = cards.get(priorityEditor.key)?.rank;
  if (!anchor) return closePriorityEditor();
  const bounds = overlayRect(root, root);
  const left = overlayRect(root, anchor).left - bounds.left;
  priorityEditor.element.style.left = `${Math.max(8, Math.min(left, bounds.width - 116))}px`;
}

function openPriorityEditor(key) {
  if (priorityEditor?.key === key) return closePriorityEditor();
  closePriorityEditor();
  const entity = resolveEntity();
  const view = cards.get(key);
  if (!entity || !view || cards.size < 2) return;
  clearAttackHelpers();
  const editor = document.createElement('div');
  editor.className = 'combat-attack-control-priority';
  editor.setAttribute('role', 'group');
  editor.setAttribute('aria-label', `Priorité de ${view.attack.displayName}`);
  const select = document.createElement('select');
  select.className = 'combat-attack-priority-value';
  select.setAttribute('aria-label', `Priorité de ${view.attack.displayName}`);
  for (let value = 1; value <= cards.size; value++) select.add(new Option(String(value), String(value)));
  const change = value => {
    const owner = resolveEntity();
    if (owner && setAttackPriority(owner, definitionsFor(owner), key, value)) persist(owner);
  };
  const up = createPriorityButton('Augmenter la priorité', 'combat-attack-priority-up', () => change(Number(select.value) - 1));
  const down = createPriorityButton('Réduire la priorité', 'combat-attack-priority-down', () => change(Number(select.value) + 1));
  select.addEventListener('change', () => { change(Number(select.value)); closePriorityEditor(); });
  editor.addEventListener('click', event => event.stopPropagation());
  editor.append(up, select, down);
  priorityEditor = { key, element: editor, select, up, down };
  root.append(editor);
  view.rank.setAttribute('aria-expanded', 'true');
  refreshStructure();
  positionPriorityEditor();
  select.focus({ preventScroll: true });
}

function createAttackCard(entity, attack, attackCount) {
  const key = attackSelectionKey(attack);
  const card = document.createElement('article');
  card.className = 'combat-attack-control-card';
  card.dataset.attackKey = key;

  const rank = createPriorityButton(`Modifier la priorité de ${attack.displayName}`, 'combat-attack-control-rank', () => openPriorityEditor(key));
  rank.setAttribute('aria-expanded', 'false');
  rank.disabled = attackCount <= 1;

  const imageFrame = document.createElement('div');
  imageFrame.className = 'combat-attack-control-image-frame';
  imageFrame.dataset.stat = `combatAttack-${key}`;
  imageFrame.dataset.hover = 'true';
  imageFrame.dataset.helperKey = `combat-attack-${entity.id}-${key}`;
  imageFrame.dataset.helperClass = 'combat-attack-hover';
  imageFrame.dataset.entityId = String(entity.id);
  imageFrame.addEventListener('mouseover', event => {
    if (imageFrame.contains(event.relatedTarget)) return;
    const owner = resolveEntity(entity.id);
    const currentAttack = owner && definitionsFor(owner).find(candidate => attackSelectionKey(candidate) === key);
    imageFrame.dataset.helperText = currentAttack ? createAttackLightDescription(currentAttack, owner).outerHTML : '';
  });
  const image = document.createElement('img');
  image.className = 'combat-attack-control-image';
  image.src = cachedResourceUrl(`${attack.attackAsset}-ld.jpg`);
  image.alt = attack.displayName || key;
  const cooldownShade = document.createElement('div');
  cooldownShade.className = 'combat-attack-control-cooldown-shade';
  const cooldownRing = document.createElement('div');
  cooldownRing.className = 'combat-attack-control-cooldown-ring';
  const cooldownValue = document.createElement('span');
  cooldownValue.className = 'combat-attack-control-cooldown-value';
  cooldownRing.append(cooldownValue);
  imageFrame.append(image, cooldownShade, cooldownRing);

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'combat-attack-control-toggle';
  toggle.addEventListener('click', event => {
    event.stopPropagation();
    const owner = resolveEntity();
    if (!owner) return;
    const attacks = definitionsFor(owner);
    const enabled = getAttackControlValue(owner, 'disabled', key, owner.attackSelection?.disabled?.[key] === true);
    if (setAttackEnabled(owner, attacks, key, enabled)) persist(owner);
  });

  card.append(imageFrame, rank, toggle);
  card.classList.toggle('single-attack', attackCount === 1);
  cards.set(key, {
    attack,
    card,
    rank,
    imageFrame,
    cooldownRing,
    cooldownValue,
    toggle,
    lastCountdown: '',
  });
  return card;
}

function build(entity, attacks) {
  if (!root) return;
  closePriorityEditor();
  clearAttackHelpers();
  cards = new Map();
  const list = root.querySelector('.combat-attack-control-list');
  list.replaceChildren(...attacks.map(attack => createAttackCard(entity, attack, attacks.length)));
  root.classList.toggle('single-attack', attacks.length === 1);
}

function createIdentityView(entity) {
  const identity = document.createElement('aside');
  identity.className = 'combat-attack-control-identity';

  const portrait = document.createElement('div');
  portrait.className = `combat-attack-control-portrait ${entity.type || 'sbire'}`;
  const image = document.createElement('img');
  image.className = 'combat-attack-control-portrait-image';
  image.alt = '';
  const frame = document.createElement('div');
  frame.className = 'combat-attack-control-portrait-frame';
  const role = document.createElement('div');
  role.className = `combat-attack-control-role role-${entity.role || 'neutre'}`;
  role.title = entity.role || '';
  portrait.append(image, frame, role);

  const level = document.createElement('span');
  level.className = 'combat-attack-control-level';
  const actions = document.createElement('div');
  actions.className = 'combat-attack-control-actions';
  const all = createPriorityButton('Désactiver toutes les attaques', 'combat-attack-control-all', () => {
    const owner = resolveEntity();
    if (!owner) return;
    const attacks = definitionsFor(owner);
    const anyEnabled = attacks.some(attack => !owner.attackSelection?.disabled?.[attackSelectionKey(attack)]);
    setAllAttacksEnabled(owner, attacks, !anyEnabled);
    persist(owner);
  });
  const auto = createPriorityButton('Priorité automatique', 'combat-attack-control-auto', () => {
    const owner = resolveEntity();
    if (!owner) return;
    const attacks = definitionsFor(owner);
    if (owner.attackSelection?.priorityMode === 'auto') restoreManualAttackPriorities(owner, attacks);
    else setAttackPrioritiesAutomatic(owner, attacks, attack => cooldownFor(owner, attack));
    persist(owner);
  });
  const flee = document.createElement('button');
  flee.type = 'button';
  flee.className = 'combat-attack-control-flee';
  flee.disabled = true;
  flee.title = 'Fuite individuelle indisponible';
  flee.setAttribute('aria-label', flee.title);
  flee.setAttribute('aria-pressed', 'false');
  actions.append(all, auto, flee);
  identity.append(actions, portrait);
  return { identity, portrait, image, frame, role, level, all, auto, flee };
}

function syncIdentity(entity) {
  if (!identityView) return;
  identityView.portrait.dataset.dropable = 'true';
  identityView.portrait.dataset.entityId = entity.id;
  const level = entity.level?.current ?? entity.level ?? 1;
  const portraitSource = entity.portrait || entity.sprite || '';
  const portraitClass = `combat-attack-control-portrait ${entity.type || 'sbire'}`;
  const roleClass = `combat-attack-control-role role-${entity.role || 'neutre'}`;
  const levelText = String(level);

  if (identityView.image.dataset.source !== portraitSource) {
    identityView.image.dataset.source = portraitSource;
    identityView.image.src = cachedResourceUrl(portraitSource);
    identityView.image.alt = `Portrait de ${entity.nickname || entity.name || 'l’entité'}`;
  }
  if (identityView.portrait.className !== portraitClass) identityView.portrait.className = portraitClass;
  if (identityView.role.className !== roleClass) identityView.role.className = roleClass;
  if (identityView.role.title !== (entity.role || '')) identityView.role.title = entity.role || '';
  if (identityView.level.textContent !== levelText) identityView.level.textContent = levelText;
}

function ensureRoot(entity) {
  if (root?.isConnected) return root;
  root = document.createElement('section');
  root.className = 'combat-attack-control-panel';
  root.setAttribute('aria-label', 'Pilotage des attaques');

  identityView = createIdentityView(entity);

  const command = document.createElement('div');
  command.className = 'combat-attack-control-command';

  const header = document.createElement('header');
  header.className = 'combat-attack-control-header';
  const title = document.createElement('div');
  title.className = 'combat-attack-control-title';
  header.append(title);

  const list = document.createElement('div');
  list.className = 'combat-attack-control-list';
  const vitals = document.createElement('div');
  vitals.className = 'combat-attack-control-vitals';
  const health = document.createElement('div');
  health.className = 'health-bar-container';
  const lifeBars = createLifeBars(entity);
  if (lifeBars) health.append(lifeBars);
  const speedInterface = CreateATBEntity(entity, { mirror: true });
  identityView.speedInterface = speedInterface;
  vitals.append(identityView.level, health, speedInterface);
  command.append(header, list, vitals);
  root.append(identityView.identity, command);
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape' && priorityEditor) {
      const anchor = cards.get(priorityEditor.key)?.rank;
      closePriorityEditor();
      anchor?.focus({ preventScroll: true });
      event.stopPropagation();
    }
  });
  root.addEventListener('click', event => {
    if (!event.target.closest('.combat-attack-control-priority, .combat-attack-control-rank')) closePriorityEditor();
  });
  list.addEventListener('scroll', closePriorityEditor, { passive: true });
  ensureGameShell().append(root);
  root.sizeObserver = new ResizeObserver(() => {
    if (root?.isConnected) document.documentElement.style.setProperty('--combat-controls-height', `${root.offsetHeight}px`);
  });
  root.sizeObserver.observe(root);
  return root;
}

function updateRealtime() {
  const entity = resolveEntity();
  if (!gameStarted || !entity || entity.side !== 'A' || !root?.isConnected) {
    hideCombatAttackControlPanel();
    return;
  }
  if (document.hidden) return;

  syncIdentity(entity);

  const now = clockNow();
  for (const [key, view] of cards) {
    const runtime = getAttackRuntime(entity, view.attack);
    const remaining = Math.max(0, runtime.readyAt - now);
    const current = entity.currentAttackId === key && entity.currentPhase === 'attack_1';
    const countdown = remaining > 0 ? formatCountdown(remaining) : '';

    view.card.classList.toggle('is-current', current);
    view.card.classList.toggle('is-cooldown', remaining > 0);
    view.cooldownRing.hidden = remaining <= 0;
    if (countdown !== view.lastCountdown) {
      view.cooldownValue.textContent = countdown;
      view.cooldownValue.setAttribute('aria-label', remaining > 0 ? `Disponible dans ${countdown} secondes` : 'Disponible');
      view.lastCountdown = countdown;
    }
  }
}

function animateRealtime() {
  updateRealtime();
  if (root?.isConnected && gameStarted) {
    animationFrame = requestAnimationFrame(animateRealtime);
  } else {
    animationFrame = null;
  }
}

function refreshStructure() {
  const entity = resolveEntity();
  if (!gameStarted || !entity || entity.side !== 'A' || !root?.isConnected) {
    hideCombatAttackControlPanel();
    return;
  }

  const attacks = definitionsFor(entity);
  if (!attacks.length) {
    hideCombatAttackControlPanel();
    return;
  }
  const signature = JSON.stringify(attacks.map(attack => [attackSelectionKey(attack), attack.displayName, attack.attackAsset, attack.combatFunction]));
  if (signature !== definitionSignature) {
    definitionSignature = signature;
    build(entity, attacks);
  }

  const now = clockNow();
  const choices = describeAttackChoices(entity, attacks, attack => cooldownFor(entity, attack), now);
  root.querySelector('.combat-attack-control-title').textContent = entity.nickname || entity.name || 'Entité';
  syncIdentity(entity);
  const isAuto = entity.attackSelection?.priorityMode === 'auto';
  root.querySelector('.combat-attack-control-auto').classList.toggle('is-auto', isAuto);
  root.querySelector('.combat-attack-control-auto').setAttribute('aria-pressed', String(isAuto));
  const autoLabel = isAuto ? 'Désactiver la priorité automatique et restaurer mon classement' : 'Activer la priorité automatique';
  identityView.auto.title = autoLabel;
  identityView.auto.setAttribute('aria-label', autoLabel);
  const anyEnabled = choices.some(choice => !choice.disabled);
  identityView.all.setAttribute('aria-pressed', String(anyEnabled));
  const allLabel = anyEnabled ? 'Désactiver toutes les attaques' : 'Activer toutes les attaques';
  identityView.all.title = allLabel;
  identityView.all.setAttribute('aria-label', allLabel);

  for (const choice of choices) {
    const view = cards.get(choice.key);
    if (!view) continue;
    const disabled = choice.disabled;

    view.card.style.order = String(choice.priority);
    view.card.classList.toggle('is-disabled', disabled);
    view.card.classList.toggle('is-support', choice.attack.combatFunction === 'Support');
    view.rank.textContent = String(choice.priority);
    view.toggle.setAttribute('aria-pressed', String(!disabled));
    const toggleLabel = `${disabled ? 'Réactiver' : 'Désactiver'} ${choice.attack.displayName}`;
    view.toggle.setAttribute('aria-label', toggleLabel);
    view.toggle.title = toggleLabel;
    if (priorityEditor?.key === choice.key) {
      priorityEditor.select.value = String(choice.priority);
      priorityEditor.up.disabled = choice.priority <= 1;
      priorityEditor.down.disabled = choice.priority >= attacks.length;
      requestAnimationFrame(positionPriorityEditor);
    }
  }
  updateRealtime();
}

function showCombatAttackControlPanel(entityId) {
  const entity = resolveEntity(entityId);
  if (!gameStarted || !entity || entity.side !== 'A') {
    hideCombatAttackControlPanel();
    return null;
  }
  const changed = String(activeEntityId) !== String(entity.id);
  if (changed) hideCombatAttackControlPanel();
  activeEntityId = entity.id;
  if (changed) definitionSignature = '';
  ensureRoot(entity);
  refreshStructure();
  if (!animationFrame) animationFrame = requestAnimationFrame(animateRealtime);
  return root;
}

function hideCombatAttackControlPanel() {
  closePriorityEditor();
  clearAttackHelpers();
  identityView?.speedInterface?.dispose?.();
  root?.sizeObserver?.disconnect();
  document.documentElement.style.removeProperty('--combat-controls-height');
  root?.remove();
  root = null;
  cards = new Map();
  activeEntityId = null;
  definitionSignature = '';
  identityView = null;
  if (animationFrame) cancelAnimationFrame(animationFrame);
  animationFrame = null;
}

function isCombatAttackControlPanelOpenFor(entityId) {
  return Boolean(root?.isConnected && String(activeEntityId) === String(entityId));
}

export {
  generateAttackDescription,
  createAttackDescriptionContent,
  createAttackLightDescription,
  AttackDetailInfos,
  attackNatureRange,
  createEntityAttackDisplay,
  MultiAttackDisplay,
  formatAttackCooldown,
  createCooldownWaitView,
  createAttackNatureSignature,
  createAttackUmbraPanel,
  createAttackProgressionView,
  showCombatAttackControlPanel,
  hideCombatAttackControlPanel,
  isCombatAttackControlPanelOpenFor,
  normalizeInventoryLookupValue,
  getInventoryAttackKeyCandidates,
  createAttackReadOnlyOverview,
  createAttackSubmenu,
};

export { statSourcesHelper } from "./statistics/helpers.js";

// Register shared handlers once, after the complete module graph is initialized.
let initialized = false;
export function initializeAttackInterface() {
  if (initialized) return;
  initialized = true;
  window.addEventListener('attackEssenceSocketUpdated', syncOwnedAttackReferences);

  window.addEventListener('selectedArmyAUpdated', syncOwnedAttackReferences);

  for (const name of ['attackEffectsRulesChanged', 'selectedArmyAUpdated', 'entityProgressionReset', 'entityCombatStatsChanged', 'equippedItemsUpdated', 'attackEssenceSocketUpdated']) {
    window.addEventListener(name, ({ detail }) => refreshAttackEffectDescriptions(detail?.entity || detail?.entite));
  }

  window.addEventListener('attackMasteryChanged', ({ detail }) => {
      for (const [root, view] of multiAttackViews) if (root.isConnected) view.masteryChanged(detail.entity);
  });

  subscribeAttackSelection(() => {
      if (!multiAttackViewTimer && multiAttackViews.size) multiAttackViewTimer = setTimeout(refreshMultiAttackViews, 0);
  });

  subscribeAttackSelection(entity => {
      refreshAttackEffectDescriptions(entity);
      document.querySelectorAll('.attack-details').forEach(root => {
          if (typeof root._syncAttackActivation !== 'function') return;
          const bound = getBoundHelperEntity(root);
          if (!entity || !bound || String(bound.id) === String(entity.id)) root._syncAttackActivation(entity || bound);
      });
      if (entity) document.querySelectorAll('.attack-submenu[data-entity-id]').forEach(root => {
        if (root.dataset.entityId !== String(entity.id)) return;
        const title = root.querySelector('.submenu-header .entity-stats-title > .title, .submenu-header .attack-multi-header-center > .title');
        const attacks = readAttackDefinitionsForEntity(entity, attackDetails);
        const allDisabled = attacks.length > 0 && attacks.every(attack => entity.attackSelection?.disabled?.[attackSelectionKey(attack)] === true);
        if (title) {
          title.textContent = allDisabled ? "Cette entité n'a plus d'attaque active" : root.dataset.normalTitle;
          title.classList.toggle('attack-all-disabled-title', allDisabled);
        }
      });
  });

  if (typeof window !== 'undefined') {
    subscribeAttackSelection(entity => refreshViews(entity));
    document.addEventListener('entityTurnCompleted', () => refreshViews());
    window.addEventListener('attackMasteryChanged', ({ detail }) => {
      const { entity, attack, before, after } = detail;
      refreshViews(entity, attack);
      if (after.level <= before.level) return;
      const host = document.getElementById(`effectsContainer_${entity.id}`);
      if (!host) return;
      const message = document.createElement('div');
      message.className = 'attack-mastery-levelup';
      message.textContent = `${attack.displayName} : maîtrise ${after.level}`;
      host.append(message);
      message.addEventListener('animationend', () => message.remove(), { once: true });
      removeCombatVisualAfter(message, 2400);
    });
  }

  subscribeAttackSelection(entity => {
    if (!root?.isConnected || entity && String(entity.id) !== String(activeEntityId)) return;
    refreshStructure();
  });

  window.addEventListener('combatActionCommitted', () => {
    if (root?.isConnected) refreshStructure();
  });

  window.addEventListener('battleStopped', hideCombatAttackControlPanel);

  window.addEventListener('battleResolved', hideCombatAttackControlPanel);
}
