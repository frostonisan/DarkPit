import {
  updateMovementDisplay, renderMovementCounter,
} from "../../rendering/hud.js";
import { clockNow, setInterval, clearInterval, isCombatPaused } from "../../combat/clock.js";
import { getStatSystemResult } from "../../entities/statSystem.js";
import { getStatEffectMaximum } from '../../data/balanceData.js';
import { statMaximumLabel, STAT_EFFECT_HELPERS, buildStatCurseHelper, buildEntityRateHelper } from "../../data/helpers.js";
import { cachedResourceUrl } from "../../data/loaderList.js";
import { getSafe, getDisplayStatKey, normalizeStatKey } from "../../entities/rules.js";
import {
  calculateVelocityReduction, calculatePhysicalPenPercent, calculateMagicalPenPercent,
  getBloodThirstyPercent, calculateEsoterismPercent, calculateTranscendenceExtraLife,
  getMovementWeightMalus, getStatMalusSources, entites,
} from "../../entities/runtime.js";
import {
  calculateLvlMaxEntiteWithWill, getStatContributions, calculateResistanceReductionPercent,
  calculateMagicalTotal, getFinalAttackPreparationReduc, getFinalAttackExecutionReduc,
  getFinalAttackCooldownReduc, getFinalAttackRecoveryReduc, getFinalAttackProjectileSpeed,
  calculateCritTotalChance, calculateCritDamageBonus, getFinalCriticalChanceFlat,
  getFinalCriticalDamageFlat, calculateAmbidextryTotalChance, calculateAmbidextryDamageBonus,
  calculateBloodFuryExecutionPercent, calculateBloodFuryTargetThreshold,
  calculateBloodThirstyPercent, calculateExecutionDamage,
  calculateHypercognitionEssences, calculateCognitiveExplosionTotal, calculateRangeRatio,
  calculateBullsEyePercent, calculateTotalDodgeBonus, calculateResilienceCritTotalBonus,
  calculateResilienceTotalCancelBonus, calculateResilienceAlterationTotalBonus,
  caluclateIndestructibilityReductionTotal, calculateIndestructibilityPercentFromEntity,
  calculateEsoterismtotalReduction, calculateHpBattleRegenPercent, calculateAstralityTotal,
  calculateTranscendenceConsoProtectionTotal, calculateTotalRegenAmount,
  calculateInvisibleTargetAvoidChance, calculateBrokenSpellDamage, calculateBrokenSpellChance,
  totalMeleeExecReduction, totalPiercingRecupReductionWithAgi, totalTranspiercingRecupReductionWithAgi,
  transpiercingAgiRatio, transpiercingTotal, brutalityPercantBonus, psionicPercantBonus,
  calculateMeleeExecBonus, calculateMysticismProcChance, calculateMysticismTranceDuration,
  calculateMysticismPreparationAcceleration, calculateMysticismTotalDamageBonus,
  calculateEquilibreAggroReduction, calculateEquilibreInvisibleDetection,
  calculateEquilibreAttackChance, calculateAgileRetreatChance, calculateOccultismInvisibilityChance,
  calculateOccultismTargetableChanceDisplay, calculateOccultismDodgeBonus,
  calculateOccultismCritChanceBonus, calculateOccultismShadowFragilityPercent,
  calculateMovementMaxCharges, calculateMovementStartingChargePercent, calculateMovementStartingCharges,
  calculateMovementMarathonChance, calculateWeaponOrfevreWeaponMastery, calculateWeaponOrfevreStrength,
  getFinalWeaponOrfevreBonus, getFinalWeaponCollectorBonus, calculateChargeEquipmentSlots,
  calculateWeaponMasteryTotalChargeBonus, calculateWeaponMasteryTrophyChance, getMarathonChance,
  getTrailerChance, calculateEntityPower, calculateEntityRates, calculateAttackPower,
  calculateArmyPower, getPowerConfigurationSignature,
} from "../../combat/statistics.js";
import { isDisplayableStatContribution, calculateStatsDisplay, getStatImprovement } from "./details.js";
import {
  stats as STATS_DATA, stats,
} from "../../data/statsData.js";
import {
  clamp, LEVEL_UP_HELPER_SCOPE, STOCK_HELPER_STATS, bindHelperEntity, getBoundHelperEntity,
  findStatKeyFromLabel, umbraDetection, getStatValue, readStatLabel, contextualStatDefinition,
  refreshStatHelper, escape,
} from "./helpers.js";
import { attackDetails } from "../../data/attackList.js";
import { getPowerBreakdownLines, roundPower, readOwnedPowerAttacks } from "../../procedural/proc-bareme.js";
import { isAdminMode, loadFromLocalStorage, loadEquippedItems } from "../../storage/gameStorage.js";
import { attackSelectionKey } from "../../combat/attackResolution.js";
import { EFFECT_VISUALS } from "../../data/effectVisuals.js";
import {
  updateBonusLifeCounters, ensureHPDom, updateHealthBar, updateHPCounters, updateArmorCounter,
} from "../../rendering/vitalFeedback.js";
import {
  getEntityLevelCurrent, isObjStat, getPermStats, getPreviewStats, ComputeStatPreview,
} from "../../entities/progression.js";
import { gameStorage as localStorage } from "../../storage/sessionStorage.js";

// Presentation des statistiques : composants, puissance, Umbra et effets actifs.

function umbraCreation({ attribut, category, level }, filled = true) {
  const milestone = document.createElement("div");
  milestone.className = `milestone ${category} lvl-${level} ${filled ? "filled" : ""} ${attribut}`.trim();

  const gemme = document.createElement("div");
  gemme.className = `gemme ${attribut}`;

  milestone.appendChild(gemme);
  return milestone;
}

function initUmbraOrnementBlink(root = document) {
  const ornaments = root.querySelectorAll(
    ".umbra-ornement.lvl-1:not(.umbra-ornement--blink)"
  );

  ornaments.forEach((el) => {
    const duration = 5200 + Math.random() * 2600;
    const delay = Math.random() * 2200;
    const opacityMin = 0.2 + Math.random() * 0.08;
    const opacityMax = 0.8 + Math.random() * 0.10;

    el.style.setProperty("--umbra-blink-duration", `${duration}ms`);
    el.style.setProperty("--umbra-blink-delay", `${delay}ms`);
    el.style.setProperty("--umbra-opacity-min", opacityMin);
    el.style.setProperty("--umbra-opacity-max", opacityMax);

    el.classList.add("umbra-ornement--blink");
  });
}

function syncStatCurseMarker(container, entity, statKey) {
  if (!container || container.closest('.item-description-card, .item-stats-block')) return;
  bindHelperEntity(container, entity);
  if (container.closest(LEVEL_UP_HELPER_SCOPE)) entity = getBoundHelperEntity(container) || entity;
  if (container.dataset.autonomousHelper === 'true') syncStatImprovement(container, entity, statKey);
  if (container.dataset.autonomousHelper !== 'true' && stats.some(stat => stat.key === normalizeStatKey(statKey) && stat.nature === 'umbra')) {
    for (const text of container.querySelectorAll('.stat-name, .entite-stat')) {
      text.classList.add(getDisplayStatKey(statKey));
      text.dataset.statState = 'umbra';
    }
  }
  const enhanced = getStatContributions(entity, statKey).some(source => source.value > 0 && isDisplayableStatContribution(source));
  container.dataset.statUpgraded = String(enhanced);
  container.classList.toggle('source-upgraded', enhanced);
  const sources = getStatMalusSources(entity, statKey);
  container.dataset.statCursed = sources.length ? 'true' : 'false';
  if (sources.length || ['strength', 'agility', 'intelligence'].includes(normalizeStatKey(statKey))) {
    container.classList.remove('zero');
  }
  let marker = container.querySelector('.stat-curse-marker');
  if (!sources.length) { marker?.remove(); return; }
  if (!marker) {
    marker = document.createElement('span');
    marker.className = 'stat-curse-marker';
    marker.tabIndex = 0;
  }
  // Keep the stat name's text unchanged for helper titles and live label updates.
  marker.textContent = '';
  marker.dataset.malusLabel = buildStatCurseHelper(sources, { compact: true });
  const label = container.querySelector('.stat-name') || container;
  if (marker.parentNode !== label) label.appendChild(marker);
  const description = `Malus appliqués. ${buildStatCurseHelper(sources)}`;
  marker.title = description;
  marker.setAttribute('aria-label', description);
}

function createUmbraBlock(
  parentDiv,
  statName,
  statValueCallback,
  entite,
  forcedStatKey = null,
  inlineStatName = false,
  attribut = null,
  umbra = null,
  options = {}
) {
  // ✅ Overload: si le 5e param est un bool => c'est le flag umbra, pas forcedStatKey
  const umbraEnabled =
    typeof forcedStatKey === "boolean" ? forcedStatKey : Boolean(umbra);
  if (typeof forcedStatKey === "boolean") forcedStatKey = null;

  let statKey = "stat";
  const fnString = statValueCallback.toString();

  // === Détection du bon statKey ===
  if (forcedStatKey) {
    statKey = forcedStatKey;
  } else if (
    fnString.includes("entite.stats.physicalDamage") &&
    fnString.includes("entite.stats.magicalDamage")
  ) {
    statKey = "hybridalDamage";
  } else if (
    fnString.includes("entite.stats.HP.current") &&
    fnString.includes("entite.stats.HP.max")
  ) {
    statKey = "HP";
  } else if (fnString.includes("entite.stats.speed")) {
    statKey = "speed";
  } else {
    const match = fnString.match(/\.stats\??\.([a-zA-Z0-9_]+)/);
    if (match) statKey = match[1];
  }

  // The level-up sidebar keeps one preview scope, with separate visual lists.
  if (parentDiv?.classList.contains('soul-stats-panels')) {
    parentDiv = parentDiv.querySelector(umbraDetection(statKey)
      ? '.soul-umbras' : '.soul-inherited-stats-list') || parentDiv;
  }

  let statValue;
  if (statKey === "hybridalDamage" && !forcedStatKey) {
    statValue =
      (Number(getSafe(entite, "physicalDamage", 0)) || 0) +
      (Number(getSafe(entite, "magicalDamage", 0)) || 0);
  } else if (statKey !== "stat") {
    statValue = getSafe(entite, statKey, 0);
  } else {
    statValue = statValueCallback();
  }

  // === Helpers ===
  const isObjStatValue = (v) =>
    v && typeof v === "object" && ("current" in v || "max" in v);

  const isZeroValue = (v) => {
    if (isObjStatValue(v)) {
      const c = Number(v.current ?? 0);
      const m = Number(v.max ?? 0);
      return c <= 0 && m <= 0;
    }
    const n = Number(v);
    return v == null || Number.isNaN(n) ? true : n <= 0;
  };

  // === Filtrage ===
  const isZeroStat = isZeroValue(statValue);
  const alwaysVisible = ['strength', 'agility', 'intelligence'].includes(normalizeStatKey(statKey))
    || getStatMalusSources(entite, statKey).length > 0;
  const showMissingAsNew = Boolean(options.showMissingAsNew);
  const forceNew = Boolean(options.forceNew || options.markAsNew);
  const createdAsNewLine = forceNew || (showMissingAsNew && isZeroStat && !alwaysVisible);

  if (isZeroStat && !alwaysVisible && statKey !== "HP" && statKey !== "extraLife" && !showMissingAsNew) {
    return;
  }

  // ✅ Calcul et helper text
  const computed = calculateStatsDisplay(statKey, entite, statValue, { includeHelper: false });

  // ✅ Règle : dans le codex/menus, HP & armor = affichage MAX-only
  const isMaxOnlyStat = statKey === "HP" || statKey === "armor";

  let displayValue = isMaxOnlyStat
    ? isObjStatValue(statValue)
      ? String(Number(statValue.max ?? 0))
      : String(statValue ?? 0)
    : computed.displayValue;

  // ✅ FORCAGE AFFICHAGE SPEED (ms -> s)
  if (statKey === "speed") {
    const ms = Number(statValue ?? 0);
    const safe = Number.isFinite(ms) ? ms : 0;
    displayValue = `${(safe / 1000).toFixed(2)} s`;
  }

  // ✅ Opt-in hover helper (absent => false)
  const enableHover = (el) => {
    if (el) el.dataset.hover = "true"; // ou el.setAttribute("data-hover","true")
  };

  // === DOM ===
  const statDiv = document.createElement("div");
  statDiv.className = `${statKey}-stat stat-container`;
  if (createdAsNewLine) {
    statDiv.classList.add("new");
    statDiv.dataset.statLineCreatedAsNew = options.newLineContext || "generic";
  }
  statDiv.dataset.stat = statKey;
  if (STOCK_HELPER_STATS.has(statKey)) statDiv.dataset.autonomousHelper = 'true';
  enableHover(statDiv); // ✅ IMPORTANT

  if (entite && entite.id) statDiv.dataset.entityId = entite.id;
  statDiv.dataset.helperText = computed.helpContent;

  const pictoContainer = document.createElement("div");
  pictoContainer.className = `stat-picto-valeur ${statKey}`;

  const picto = document.createElement("div");
  picto.className = `picto-stat ${statKey}`;
const umbraOrnement = document.createElement("div");
umbraOrnement.className = "umbra-ornement";

if (typeof umbraDetection === "function") {
  const umbraProfile = umbraDetection(statKey);

  if (umbraProfile) {
    statDiv.dataset.umbra = "1";
    statDiv.dataset.attribut = umbraProfile.attribut;
    statDiv.dataset.category = umbraProfile.category;
    statDiv.dataset.level = String(umbraProfile.level);

    const level = umbraProfile.level;
    const attributName = umbraProfile.attribut;

  if (level) {
  umbraOrnement.classList.add(`lvl-${level}`);
}

if (attributName) {
  umbraOrnement.classList.add(attributName);
}

if (Number(level) === 3) {
  const delay = Math.random() * 5500;

  setTimeout(() => {
    const img = document.createElement("img");
    img.className = "umbra-apng";

    // const flipX = Math.random() < 0.5 ? -1 : 1;
    // const flipY = Math.random() < 0.5 ? -1 : 1;
    // img.style.transform = `scale(${flipX}, ${flipY})`;

    umbraOrnement.style.setProperty(
      "--umbra-lvl3-blink-duration",
      `${3600 + Math.random() * 2400}ms`
    );

    umbraOrnement.style.setProperty(
      "--umbra-lvl3-blink-delay",
      `${Math.random() * 1800}ms`
    );

    img.src = cachedResourceUrl(`./media/assets/misc/umbra-ornement-lvl-3.apng?seed=${clockNow()}-${Math.random()}`);

    umbraOrnement.appendChild(img);
    umbraOrnement.classList.add("umbra-visible");
  }, delay);
}
  }
}
  if (["strength", "agility", "intelligence"].includes(statKey)) {
    picto.classList.add("attribut");
  }

  // (optionnel) si tu veux que le hover marche DIRECTEMENT sur l’icône :
  // picto.dataset.stat = statKey;
  // enableHover(picto);
  // if (entite && entite.id) picto.dataset.entityId = entite.id;

  const valueDiv = document.createElement("div");
  valueDiv.dataset.stat = statKey;
  enableHover(valueDiv); // ✅ IMPORTANT
  if (entite && entite.id) valueDiv.dataset.entityId = entite.id;

  // 🔒 Flag crucial : permet à updateHealthBar() de NE PAS écraser ce bloc
  if (isMaxOnlyStat) valueDiv.dataset.display = "max";

  if (showMissingAsNew && isZeroStat && !forceNew && !alwaysVisible) {
    valueDiv.className = "entite-stat stat-new new-stat";
    valueDiv.textContent = "";
  } else {
    valueDiv.className = forceNew ? "entite-stat new-stat" : "entite-stat";
    valueDiv.textContent = displayValue;
    if (statKey === 'shift' && isObjStatValue(statValue)) {
      valueDiv.dataset.movementEntityId = entite.id;
      renderMovementCounter(valueDiv, { ...entite, stats: { ...entite.stats, shift: statValue } });
    }
  }

  // === Preview (toujours créée)
  const valueDivPreview = document.createElement("div");
  valueDivPreview.className = "entite-stat preview is-hidden";
  valueDivPreview.textContent = displayValue;
  valueDivPreview.dataset.stat = statKey;
  enableHover(valueDivPreview); // ✅ IMPORTANT
  if (entite && entite.id) valueDivPreview.dataset.entityId = entite.id;

  if (statKey === "speed") {
    const ms = Number(statValue ?? 0);
    const rawMs = String(Number.isFinite(ms) ? ms : 0);
    valueDiv.dataset.rawMs = rawMs;
    valueDivPreview.dataset.rawMs = rawMs;
  }
  if (isMaxOnlyStat) valueDivPreview.dataset.display = "max";

  const separatorDivPreview = document.createElement("div");
  separatorDivPreview.className = "separator-stats-preview";
  separatorDivPreview.textContent = ">";

  // ✅ Helper milestone wrapper
  const appendUmbraMilestone = (targetEl) => {
    if (!umbraEnabled) return;
    if (typeof umbraDetection !== "function") return;
    if (typeof umbraCreation !== "function") return;

    const profile = umbraDetection(statKey);
    if (!profile) return;

    const wrap = document.createElement("div");
    wrap.className = "umbra-milestone";
    wrap.appendChild(umbraCreation(profile));

    targetEl.appendChild(wrap);
  };

  // === Gestion spéciale des attributs ===
  if (attribut) {
    const attributPicto = document.createElement("div");
    attributPicto.className = "attribut-picto";

    // ✅ milestone (wrappé) AVANT le picto
    appendUmbraMilestone(attributPicto);

    attributPicto.appendChild(picto);

    const nameDiv = document.createElement("div");
    nameDiv.className = "stat-name";
    nameDiv.textContent = statName;

    const valueGroup = document.createElement("div");
    valueGroup.className = "attribut-value-group";
    valueGroup.appendChild(valueDiv);
    valueGroup.appendChild(separatorDivPreview);
    valueGroup.appendChild(valueDivPreview);

    pictoContainer.appendChild(nameDiv);
    pictoContainer.appendChild(valueGroup);
    statDiv.appendChild(attributPicto);
    statDiv.appendChild(pictoContainer);

    parentDiv.appendChild(statDiv);
    syncStatCurseMarker(statDiv, entite, statKey);

    return;
  }

  // === Présentation standard ===
  // ✅ milestone (wrappé) AVANT le picto
  appendUmbraMilestone(pictoContainer);
  if (parentDiv.closest('.soul-inherited-stats') && !umbraDetection(statKey)) {
    const statMilestone = document.createElement('div');
    statMilestone.className = 'stat-milestone';
    statMilestone.textContent = 'stat';
    pictoContainer.appendChild(statMilestone);
  }

  pictoContainer.appendChild(picto);
pictoContainer.appendChild(umbraOrnement);

  if (!inlineStatName && statName && statName.trim()) {
    const nameDiv = document.createElement("div");
    nameDiv.className = "stat-name";
    nameDiv.textContent = statName;
    pictoContainer.appendChild(nameDiv);
  }

  pictoContainer.appendChild(valueDiv);
  pictoContainer.appendChild(separatorDivPreview);
  pictoContainer.appendChild(valueDivPreview);

  statDiv.appendChild(pictoContainer);
  parentDiv.appendChild(statDiv);
  syncStatCurseMarker(statDiv, entite, statKey);
  initUmbraOrnementBlink(parentDiv);
}

function setupLinesClassByChildren(containerEl, { onlyVisible = true } = {}) {
  if (!containerEl) return () => {};

  const LINE_CLASSES = ["oneline", "twoline", "threeline", "fourline", "fiveline", "sixline", "sevenline"];
  const SPECIAL_CONTAINER_CLASS = "four-exact";
  const SPECIAL_CHILD_CLASS = "slot-5";
  let rafId = 0;

  const isVisible = (el) => {
    if (!onlyVisible) return true;
    if (!(el instanceof HTMLElement)) return false;
    if (el.hidden) return false;
    const cs = getComputedStyle(el);
    return cs.display !== "none" && cs.visibility !== "hidden";
  };

  const getLineClass = (count) => {
    if (count >= 1 && count <= 3) return "oneline";
    if (count >= 4 && count <= 6) return "twoline";
    if (count >= 7 && count <= 9) return "threeline";
    if (count >= 10 && count <= 12) return "fourline";
    if (count >= 13 && count <= 15) return "fiveline";
	if (count >= 16 && count <= 18) return "sixline";
	if (count >= 16) return "sevenline";
    return "";
  };

  const update = () => {
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      const allChildren = Array.from(containerEl.children);
      const visibleChildren = allChildren.filter(isVisible);
      const count = visibleChildren.length;

      // Reset classes container
      containerEl.classList.remove(...LINE_CLASSES, SPECIAL_CONTAINER_CLASS);

      // Reset children special
      allChildren.forEach((ch) => ch.classList.remove(SPECIAL_CHILD_CLASS));

      // Apply line class
      const cls = getLineClass(count);
      if (cls) containerEl.classList.add(cls);

      // ✅ Exception: 4 visibles -> 3 en ligne 1, le 4e centré en ligne 2 (position 5)
      if (count === 4) {
        containerEl.classList.add(SPECIAL_CONTAINER_CLASS);
        visibleChildren[3].classList.add(SPECIAL_CHILD_CLASS);
      }
    });
  };

  const mo = new MutationObserver(update);
  mo.observe(containerEl, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "style", "hidden"],
  });

  update();

  return () => {
    cancelAnimationFrame(rafId);
    mo.disconnect();
  };
}

function createStatSection({ sectionClass, titleText, titleClass = "" }) {
  // Bloc section (ex: "stat-section-codex attack")
  const section = document.createElement("div");
  section.className = `stat-section-codex ${sectionClass}`.trim();

  // Titre (ex: "stat-title-type attack")
  const titleWrap = document.createElement("div");
  titleWrap.className = `stat-title-type ${titleClass}`.trim();

  const titlePicto = document.createElement("div");
  titlePicto.className = "picto";

  const title = document.createElement("div");
  title.className = "title";
  title.textContent = titleText;

  titleWrap.append(titlePicto, title);
  section.appendChild(titleWrap);

  return section;
}

function finalizeCodexStatSection(section, emptyText) {
  if (!section.querySelector('.stat-container')) {
    const empty = document.createElement('p');
    empty.className = 'codex-stat-section-empty no-stats';
    empty.textContent = emptyText;
    section.appendChild(empty);
  }
}

function removeEmptyCodexStatGroup(section, statClass) {
  const title = section.querySelector(`.titre.${statClass}`);
  if (!title) return;
  let next = title.nextElementSibling;
  while (next && !next.classList.contains('titre')) {
    if (next.classList.contains('stat-container')) return;
    next = next.nextElementSibling;
  }
  title.remove();
}

function statTitle({
  statClass,
  title,
  wrapperClass = "titre",
  pictoBaseClass = "picto-stat",
  nameClass = "stat-type",
}) {
  const wrapper = document.createElement("div");
  wrapper.classList.add(wrapperClass);
  if (statClass) wrapper.classList.add(statClass);

  const name = document.createElement("div");
  name.classList.add(nameClass);
  name.textContent = title;

 wrapper.append(name);
  // wrapper.append(picto);
  return wrapper;
}

function createCodexStatLine({ statClass, entite, calculatorName, content }) {
  const valeur = getStatValue(entite, calculatorName);

  const line = document.createElement("div");
  line.classList.add("codex-stat-line", statClass);

  // content = string libre contenant "${valeur}" (littéral), on remplace
  line.textContent = String(content).replaceAll("${valeur}", String(valeur));

  return line;
}

function calculateMeleeExecutionPercent(entite) {
  const reduc = getFinalAttackExecutionReduc(entite); // 0..25 (points de %)
  const execPercent = 100 - reduc;               // ex: reduc=1 => 99
  return clamp(execPercent, 0, 100);
}

const STAT_CALCULATORS = {
  calculateEsoterismtotalReduction,
 calculateMagicalTotal,
 calculateMeleeExecutionPercent,
 calculateCritTotalChance: entite => calculateCritTotalChance(entite),
 calculateCritDamageBonus: entite => calculateCritDamageBonus(entite), getFinalCriticalChanceFlat, getFinalCriticalDamageFlat,
 calculateAmbidextryTotalChance, calculateAmbidextryDamageBonus,
 calculateBloodFuryExecutionPercent, calculateBloodFuryTargetThreshold, calculateExecutionDamage, calculateBloodThirstyPercent,
 getBloodThirstyPercent,
 calculatePhysicalPenPercent,
 calculateMagicalPenPercent,
 calculateHypercognitionEssences, calculateCognitiveExplosionTotal,
 calculateRangeRatio: entite => Number(calculateRangeRatio(entite).toFixed(2)), calculateBullsEyePercent,
 calculateTotalDodgeBonus,
 calculateResilienceCritTotalBonus, calculateResilienceTotalCancelBonus, calculateResilienceAlterationTotalBonus,
 caluclateIndestructibilityReductionTotal, calculateIndestructibilityPercentFromEntity,
 calculateHpBattleRegenPercent,
 calculateAstralityTotal,
 calculateTranscendenceConsoProtectionTotal, calculateTranscendenceExtraLife,
 calculateEsoterismPercent,
 calculateTotalRegenAmount,
getFinalAttackPreparationReduc, getFinalAttackExecutionReduc, getFinalAttackCooldownReduc, getFinalAttackRecoveryReduc, getFinalAttackProjectileSpeed,
calculateInvisibleTargetAvoidChance,
calculateBrokenSpellChance,
totalMeleeExecReduction,
totalPiercingRecupReductionWithAgi, totalTranspiercingRecupReductionWithAgi,
transpiercingAgiRatio, 
transpiercingTotal,
brutalityPercantBonus,
psionicPercantBonus, 
calculateBrokenSpellDamage,
calculateMeleeExecBonus,
calculateMysticismProcChance, calculateMysticismTranceDuration, calculateMysticismPreparationAcceleration, calculateMysticismTotalDamageBonus,
calculateLvlMaxEntiteWithWill: (e) => { const willValue = readEntityKey(e, "will"); return calculateStatsDisplay("will", e, willValue)?.lvlMaxEntite ?? 0;},
calculateEquilibreAggroReduction, calculateEquilibreInvisibleDetection, calculateEquilibreAttackChance,
calculateAgileRetreatChance,
calculateOccultismInvisibilityChance, calculateOccultismTargetableChanceDisplay, calculateOccultismDodgeBonus, calculateOccultismCritChanceBonus, calculateOccultismShadowFragilityPercent,
calculateMovementMaxCharges, calculateMovementStartingChargePercent, calculateMovementStartingCharges, calculateMovementMarathonChance, getMarathonChance, getTrailerChance,
calculateWeaponOrfevreWeaponMastery, calculateWeaponOrfevreStrength, getFinalWeaponOrfevreBonus, getFinalWeaponCollectorBonus, calculateChargeEquipmentSlots, calculateWeaponMasteryTotalChargeBonus, calculateWeaponMasteryTrophyChance,
};

function syncStatImprovement(container, entite, statKey) {
  const name = container.querySelector('.stat-name');
  if (!name) return;
  const weight = container.dataset.stat === 'weight' ? getMovementWeightMalus(entite) : null;
  const improvement = weight ? null : getStatImprovement(entite, statKey, container.dataset.statEffect);
  const baseLabel = normalizeStatKey(statKey) === 'criticalDamage'
    ? contextualStatDefinition(stats.find(stat => stat.key === 'criticalDamage'), entite).name
    : readStatLabel(container, { base: true });
  const hasColon = (name.dataset.baseLabel || name.textContent).includes(':');
  name.dataset.baseLabel = baseLabel + (hasColon ? ' :' : '');
  container.querySelector('.stat-picto-valeur > .picto-stat')?.classList.toggle('picto-stat--bonus', Boolean(improvement));
  name.textContent = improvement ? `${baseLabel} ${improvement.state || '+'} :`
    : name.dataset.baseLabel;
  name.classList.remove('stat-improved-strength', 'stat-improved-intelligence', 'stat-improved-agility');
  const label = document.createElement('span');
  label.className = weight?.weightClass || getDisplayStatKey(improvement?.stat || statKey);
  const state = improvement?.state || (improvement ? '+' : 'normal');
  if (!improvement && !weight) label.dataset.statState = state;
  for (const value of container.querySelectorAll('.entite-stat')) {
    if (weight) delete value.dataset.statState;
    else {
      value.classList.add(getDisplayStatKey(improvement?.stat || statKey));
      value.dataset.statState = state;
    }
  }
  label.textContent = name.textContent;
  if (weight) {
    for (const node of container.querySelectorAll('.stat-picto-valeur, .stat-picto-valeur > .picto-stat, .entite-stat')) {
      node.classList.remove('weight', 'feather-weight', 'light-weight', 'middle-weight', 'heavy-weight', 'super-heavy-weight');
      node.classList.add(weight.weightClass);
    }
    const value = container.querySelector('.entite-stat');
    if (value) value.textContent = weight.label.replace(/^Poids\s+/i, '').replace(/^./, c => c.toUpperCase());
  }
  for (const key of ['statImprovement', 'stat', 'hover', 'helperText']) delete name.dataset[key];
  if (improvement) {
    const text = document.createElement('span');
    text.className = 'stat-improved-label';
    text.dataset.statState = state;
    text.textContent = label.textContent;
    label.replaceChildren(text);
    const origin = document.createElement('span');
    origin.className = getDisplayStatKey(improvement.source);
    origin.appendChild(label);
    name.replaceChildren(origin);
  } else {
    name.replaceChildren(label);
  }
}

function createFullStatDom({
  stat,
  label,
  value: valueTemplate,
  entite = null,
  calculatorName = null,
  calculatorKey = null,
  originKey = null,
  showZero = false,
  dataStat = null, // override data-stat
  helperEffect = null,
}) {
  const entityId = entite?.id != null ? String(entite.id) : "";

  // ✅ Opt-in hover helper (absence => false)
  const enableHover = (node) => {
    if (node instanceof HTMLElement) node.dataset.hover = "true";
  };

  // clé réellement utilisée dans data-stat
  const dataStatKey =
    (typeof dataStat === "string" && dataStat.trim().length > 0)
      ? dataStat.trim()
      : stat;
  const visualStatKey = getDisplayStatKey(dataStatKey);
  showZero ||= getStatMalusSources(entite, stat).length > 0
    || ['strength', 'agility', 'intelligence'].includes(normalizeStatKey(stat));

  // --- value "simple" : si value est fourni ET ne contient pas ${value}, on affiche value tel quel
const hasValue =
  valueTemplate !== null &&
  valueTemplate !== undefined;

  const isTemplate =
    hasValue &&
    typeof valueTemplate === "string" &&
    valueTemplate.includes("${value}");

  const isManualValue = hasValue && !isTemplate;

  const readStatValue = () => getSafe(entite, stat, 0);

  let rawValue;

  if (calculatorName) {
    if (typeof calculatorName === "function") {
      rawValue = entite ? calculatorName(entite) : 0;
    } else {
      const fn = STAT_CALCULATORS[calculatorName];
      if (typeof fn !== "function") {
        throw new Error(`Calculator introuvable: "${calculatorName}"`);
      }
      rawValue = entite ? fn(entite, readEntityKey(entite, dataStatKey)) : 0;
    }
  } else {
    rawValue = readStatValue();
  }

  if (stat === "physicalResistance" || stat === "magicalResistance") {
    const resistance = getStatSystemResult(entite, normalizeStatKey(stat));
    rawValue = resistance?.resistancePoints && valueTemplate?.includes('%')
      ? Number((resistance.reductionRatio * 100).toFixed(2))
      : resistance?.value ?? calculateResistanceReductionPercent(rawValue);
  }
  if (['dodge', 'precision', 'bullsEye', 'criticalChance', 'criticalDamage', 'criticalResistance', 'alterationResistance', 'hindranceResistance', 'resilienceTotal', 'equilibreAggroReduction', 'equilibreInvisibleDetection', 'equilibreBalancedAttackChance', 'velocity', 'controlledSpeed', 'agileRetreat'].includes(normalizeStatKey(stat)) && valueTemplate?.includes('%')) rawValue = Number(Number(rawValue).toFixed(2));

  // ✅ Filtre "zéro" uniquement si on dépend de rawValue (pas de value manuel)
  if (!showZero && !isManualValue) {
    const n =
      typeof rawValue === "number"
        ? rawValue
        : typeof rawValue === "string"
          ? Number(rawValue.replace(",", ".").replace(/[^0-9.\-]/g, ""))
          : NaN;

    if (!Number.isNaN(n) && n === 0) return document.createDocumentFragment();
  }

  // ✅ Rendu : value manuel = affichage direct ; template = remplace ${value} ; sinon rawValue
  const maximum = statDisplayMaximum(normalizeStatKey(stat), calculatorKey || calculatorName, valueTemplate);
  const formattedValue = Number.isFinite(maximum) && typeof rawValue === 'number' ? formatDynamicStatValue(rawValue) : String(rawValue);
  const renderedValue = appendStatMaximum(hasValue
    ? (isTemplate
        ? valueTemplate.replaceAll("${value}", formattedValue)
        : String(valueTemplate))
    : formattedValue, isManualValue ? null : rawValue, maximum);

  const root = document.createElement("div");
  root.className = `${visualStatKey}-stat stat-container`;
  root.setAttribute("data-stat", dataStatKey);
  root.dataset.sourceStat = normalizeStatKey(stat);
  root.dataset.autonomousHelper = 'true';
  if (originKey) root.dataset.originStat = normalizeStatKey(originKey);
  if (isTemplate) root.dataset.valueTemplate = valueTemplate;
  const syncCalculatorName =
    typeof calculatorKey === "string" && calculatorKey.trim()
      ? calculatorKey.trim()
      : typeof calculatorName === "string" && calculatorName.trim()
        ? calculatorName.trim()
        : "";
  if (syncCalculatorName) root.dataset.calculatorName = syncCalculatorName;
  const statEffect = helperEffect || STAT_EFFECT_HELPERS[syncCalculatorName];
  if (statEffect) {
    root.dataset.statEffect = statEffect;
    root.dataset.helperKey = `${entityId}-stat-${dataStatKey}-${statEffect}`;
  }
  enableHover(root); // ✅ IMPORTANT
  if (entityId) root.setAttribute("data-entity-id", entityId);

  const wrap = document.createElement("div");
  wrap.className = `stat-picto-valeur ${visualStatKey}`;

  const picto = document.createElement("div");
  picto.className = `picto-stat ${visualStatKey}`;

  const name = document.createElement("div");
  name.className = "stat-name";
  name.textContent = label;

  const mainVal = document.createElement("div");
  mainVal.className = "entite-stat";
  mainVal.setAttribute("data-stat", dataStatKey);
  enableHover(mainVal); // ✅ IMPORTANT
  if (entityId) mainVal.setAttribute("data-entity-id", entityId);
  mainVal.innerHTML = renderedValue;
  if (dataStatKey === 'shift') {
    mainVal.dataset.movementEntityId = entityId;
    renderMovementCounter(mainVal, { ...entite, stats: { ...entite.stats, shift: getSafe(entite, 'shift', {}) } });
  }

  wrap.append(picto, name, mainVal);
  root.appendChild(wrap);
  syncStatCurseMarker(root, entite, stat);

  return root;
}

const hasOwn = (obj, key) =>
  obj != null && Object.prototype.hasOwnProperty.call(obj, key);

function entityHasKey(entite, key) {
  const statKey = normalizeStatKey(key);
  if (!entite || !statKey) return false;
  if (Array.isArray(entite?.battleBoosts?.[statKey]) && entite.battleBoosts[statKey].length > 0) {
    return true;
  }

  const sources = [
    entite?.modifierStats?.preview?.total,
    entite?.stats,
    entite?.baseStats,
    entite,
  ];

  return sources.some(src => hasOwn(src, statKey));
}

function readEntityKey(entite, key) {
  return getSafe(entite, normalizeStatKey(key), 0);
}

function createValideStatDom(opts = {}) {
  const { entite, stat, originKey = null, calculatorName } = opts;

  // 1) clé à vérifier (gating)
  const keyToCheck =
    (typeof originKey === "string" && originKey.trim().length > 0)
      ? normalizeStatKey(originKey.trim())
      : normalizeStatKey(stat);

  if (!entityHasKey(entite, keyToCheck) && !entityHasKey(entite, stat) && !getStatImprovement(entite, stat) && !getStatMalusSources(entite, stat).length) {
    return document.createDocumentFragment();
  }

  // 2) si c'est une stat "virtuelle" (stat n'existe pas), on injecte la valeur de originKey au calculator
  const statExists = entityHasKey(entite, stat);

  if (!statExists && originKey && typeof calculatorName === "string") {
    const fn = STAT_CALCULATORS[calculatorName];
    if (typeof fn !== "function") {
      throw new Error(`Calculator introuvable: "${calculatorName}"`);
    }

    return createFullStatDom({
      ...opts,
      calculatorName: (e) => fn(e, readEntityKey(e, originKey)),
      calculatorKey: calculatorName,
    });
  }

  // 3) sinon comportement normal
  return createFullStatDom(opts);
}

function tagUmbraStatContainer(statContainer, statKey) {
  if (!statContainer) return;
  if (typeof statKey !== "string" || !statKey) return;

  const meta = umbraDetection(statKey);
  if (!meta) return;

  statContainer.dataset.stat = statKey;
  statContainer.dataset.umbra = "1";
  statContainer.dataset.attribut = meta.attribut;
  statContainer.dataset.category = meta.category;
  statContainer.dataset.level = String(meta.level);
}

function createUmbraBlockTagged(parent, label, getterFn, entity, statKeyOrUmbra, umbraOverride = false) {
  const before = parent.querySelectorAll(".stat-container").length;

  const enableHover = (node) => {
    if (node instanceof HTMLElement) node.dataset.hover = "true";
  };

  const umbraEnabled =
    typeof statKeyOrUmbra === "boolean"
      ? statKeyOrUmbra
      : Boolean(umbraOverride);

  let resolvedKey = null;
  if (typeof statKeyOrUmbra === "string" && statKeyOrUmbra.trim()) {
    resolvedKey = statKeyOrUmbra.trim();
  } else if (typeof findStatKeyFromLabel === "function") {
    resolvedKey = findStatKeyFromLabel(label) || null;
  }

  // 1) Appel createUmbraBlock avec une lecture finale quand la stat est connue.
  const maybeEl = createUmbraBlock(
    parent,
    label,
    resolvedKey ? () => getSafe(entity, resolvedKey, 0) : getterFn,
    entity,
    resolvedKey,
    false,
    null,
    umbraEnabled
  );

  // 3) Récupère l’élément créé
  let el = null;
  if (maybeEl instanceof HTMLElement) {
    el = maybeEl;
  } else {
    const afterEls = parent.querySelectorAll(".stat-container");
    if (afterEls.length > before) el = afterEls[afterEls.length - 1] || null;
  }

  // 4) ✅ Ajoute data-hover="true" sur tout ce qui porte data-stat dans ce bloc
  if (el) {
    // Si le root porte data-stat
    if (el.hasAttribute("data-stat")) enableHover(el);

    // Tous les descendants data-stat (valueDiv, preview, etc.)
    el.querySelectorAll("[data-stat]").forEach(enableHover);
  }

  // 5) Tag umbra
  if (el && resolvedKey) tagUmbraStatContainer(el, resolvedKey);

  return el;
}

function createEntityStatsTitleNode(text) {
  const title = document.createElement("div");
  title.className = "entity-stats-title attribut";
  title.innerHTML = `
    <div class="separation-line golden"></div>
    <p class="title">${text}</p>
    <div class="separation-line golden"></div>
  `;
  return title;
}

function createBlockTitle(text, cls = "") {
  const h3 = document.createElement("h3");
  h3.className = `resu-subtitle ${cls}`.trim();
  h3.textContent = text;
  return h3;
}

function withBlockSubtitle(block, subtitleText) {
  if (!subtitleText) return block;

  const sub = document.createElement("h4");
  sub.className = "resu-block-subtitle";
  sub.textContent = subtitleText;

  // ✅ si un titre existe déjà, on place le sous-titre juste après
  const title = block.querySelector(":scope > .resu-subtitle");
  if (title) {
    title.insertAdjacentElement("afterend", sub);
  } else {
    block.prepend(sub);
  }

  return block;
}

function createBlockMarker(text) {
  const p = document.createElement("div");
  p.className = "resu-block-marker"; // style léger
  p.textContent = text;
  return p;
}

export {
  syncStatCurseMarker,
  createUmbraBlock,
  calculateMeleeExecutionPercent,
  createUmbraBlockTagged,
  createStatSection,
  finalizeCodexStatSection,
  removeEmptyCodexStatGroup,
  statTitle,
  createFullStatDom,
  entityHasKey,
  readEntityKey,
  createValideStatDom,
  tagUmbraStatContainer,
  createEntityStatsTitleNode,
  createBlockTitle,
  withBlockSubtitle,
  createBlockMarker,
};

// Shared power and rate displays with one refresh cache per pass.

let powerRefreshTimer = null;

let powerRefreshFrame = null;

let powerPassCache = null;

let powerPassEquipment = null;

let powerPassArmy = null;

let powerPassConfiguration = null;

function powerEntityInputs(entity) {
  return [entity.id, entity.type, entity.level, entity.stats, entity.baseStats,
    entity.modifierStats, entity.battleBoosts, entity.stuff, entity.armorLayers,
    entity.Archetype, entity.archetypeFrozen, entity.summonOrigin, entity.attackDetails, entity.attacks,
    !entity.attackDetails && !entity.attacks ? entity.currentAttack : null];
}

function resolvePowerOwner(owner, update) {
  if (update && String(update.id) === String(owner.id)) return { ...owner, ...update };
  const match = candidate => String(candidate.id) === String(owner.id);
  return entites.find(match) || window.selectedArmyA?.find(match) || window.selectedArmyB?.find(match)
    || (powerPassArmy || loadFromLocalStorage('selectedArmyA', [])).find(match) || owner;
}

function cachedDisplayPower(node, kind, inputs, calculate) {
  const signature = JSON.stringify([kind, powerPassConfiguration || getPowerConfigurationSignature(), inputs]);
  if (node._powerSignature === signature) return node._powerResult;
  const result = powerPassCache?.get(signature) || calculate();
  powerPassCache?.set(signature, result);
  node._powerSignature = signature;
  node._powerResult = result;
  return result;
}

function schedulePowerRefresh() {
  if (powerRefreshTimer !== null || !isAdminMode()) return;
  powerRefreshTimer = setTimeout(() => {
    powerRefreshTimer = null;
    if (document.hidden || !isAdminMode()) return;
    if (!document.querySelector('[data-refresh-power]')) return;
    refreshDisplayedPowers();
    schedulePowerRefresh();
  }, 250);
}

function refreshDisplayedPowers(entity = null, onlyOwner = false) {
  const nodes = [...document.querySelectorAll('[data-refresh-power]')].filter(node =>
    !onlyOwner || !node.dataset.entityId || node.dataset.entityId === String(entity.id));
  // Combat events can arrive while every power view is closed.
  // Keep the existing refresh cadence, but prepare shared data only for targets.
  if (!nodes.length) return;
  const enabled = isAdminMode();
  powerPassCache = new Map();
  powerPassEquipment = enabled ? loadEquippedItems() : null;
  powerPassArmy = enabled ? loadFromLocalStorage('selectedArmyA', []) : null;
  powerPassConfiguration = enabled ? getPowerConfigurationSignature() : null;
  try {
    nodes.forEach(node => {
      node._refreshPower?.(entity && node.dataset.entityId === String(entity.id) ? entity : undefined);
    });
  } finally {
    powerPassCache = powerPassEquipment = powerPassArmy = powerPassConfiguration = null;
  }
  return true;
}

function queuePowerRefresh(event) {
  const entity = event?.detail?.entite || event?.detail?.entity;
  if (event?.type === 'attackMasteryChanged' && entity) {
    // Mastery changes this owner's attacks. Refresh them and aggregate reports
    // now; unrelated owners and a second whole-document RAF pass add no work
    // visible to the player. The ordinary periodic/configuration refresh stays.
    if (refreshDisplayedPowers(entity, true)) schedulePowerRefresh();
    return;
  }
  if (entity) refreshDisplayedPowers(entity);
  if (powerRefreshFrame !== null) return;
  powerRefreshFrame = requestAnimationFrame(() => {
    powerRefreshFrame = null;
    refreshDisplayedPowers();
    schedulePowerRefresh();
  });
}

function createAttackPowerValue(attack, owner) {
  const line = document.createElement('span');
  line.className = 'attack-power-value';
  line.dataset.adminPower = 'attack';
  line.dataset.entityId = String(owner.id);
  line.dataset.refreshPower = 'true';
  line.dataset.attackKey = attackSelectionKey(attack);
  const refresh = currentOwner => {
    line.hidden = !isAdminMode();
    if (line.hidden) return true;
    owner = resolvePowerOwner(owner, currentOwner);
    const attacks = readOwnedPowerAttacks(owner, attackDetails);
    attack = attacks.find(candidate => attack.entityAttackId && candidate.entityAttackId === attack.entityAttackId)
      || attacks.find(candidate => attackSelectionKey(candidate) === line.dataset.attackKey) || attack;
    const result = cachedDisplayPower(line, 'attack', [powerEntityInputs(owner), attack], () => calculateAttackPower(attack, owner));
    const value = roundPower(result.score).toLocaleString('fr-FR');
    if (line.textContent !== value) line.textContent = value;
    line.setAttribute('aria-label', `Power : ${value}`);
    line.title = getPowerBreakdownLines(result).join('\n');
    return true;
  };
  line._refreshPower = refresh;
  refresh(owner);
  schedulePowerRefresh();
  return line;
}

function createEntityPowerValue(entity) {
  const panel = document.createElement('span');
  panel.className = 'entity-power-value';
  panel.dataset.adminPower = 'entity';
  panel.dataset.entityId = String(entity.id);
  panel.dataset.refreshPower = 'true';
  const refresh = currentEntity => {
    panel.hidden = !isAdminMode();
    if (panel.hidden) return;
    entity = resolvePowerOwner(entity, currentEntity);
    const ids = new Set(Object.values(entity.stuff || {}).flat());
    const equipment = (powerPassEquipment || loadEquippedItems()).filter(item => ids.has(item.equippedId));
    const power = cachedDisplayPower(panel, 'entity', [powerEntityInputs(entity), equipment], () => calculateEntityPower(entity, { equipment }));
    const value = roundPower(power.score).toLocaleString('fr-FR');
    if (panel.textContent !== value) panel.textContent = value;
    panel.setAttribute('aria-label', `Power : ${panel.textContent}`);
  };
  panel._refreshPower = refresh;
  refresh();
  schedulePowerRefresh();
  return panel;
}

function createArmyPowerReport(army, side) {
  const power = calculateArmyPower(army);
  const counted = new Map(power.details.map(row => [row.path[0], row.breakdown]));
  return {
    side,
    generatedAt: new Date().toISOString(),
    power,
    entities: army.map(entity => {
      const includedInTotal = counted.has(String(entity.id));
      const result = counted.get(String(entity.id)) || calculateEntityPower(entity);
      return {
        id: entity.id,
        name: entity.nickname || entity.name,
        level: entity.level?.current ?? entity.level,
        includedInTotal,
        ...(!includedInTotal ? { countedThroughSummoner: entity.summonOrigin?.casterId } : {}),
        power: result,
        calculation: getPowerBreakdownLines(result),
      };
    }),
  };
}

function createEntityRateSummary(entity) {
  const line = document.createElement('div');
  line.className = 'entity-rate-summary';
  line.dataset.entityId = String(entity.id);
  line._refreshRate = current => {
    if (current) entity = current;
    const rates = calculateEntityRates(entity);
    line.textContent = `DPS : ${roundPower(rates.dps)} · HPS : ${roundPower(rates.hps)}${rates.incomplete ? ' (partiels)' : ''}`;
    line.title = buildEntityRateHelper(rates);
  };
  line._refreshRate();
  return line;
}

function createArmyPowerSummary(readArmy, label = 'Power de l’armée') {
  const panel = document.createElement('details');
  panel.className = 'entity-power-summary';
  panel.dataset.adminPower = 'army';
  panel.dataset.refreshPower = 'true';
  const heading = document.createElement('summary');
  heading.textContent = label;
  const content = document.createElement('pre');
  panel.append(heading, content);
  panel._refreshPower = () => {
    panel.hidden = !isAdminMode();
    if (panel.hidden || !panel.open) return;
    const army = readArmy();
    if (!Array.isArray(army) || !army.length) {
      content.textContent = 'Aucune armée générée.';
      return;
    }
    const result = cachedDisplayPower(panel, 'army', [army.map(powerEntityInputs), powerPassEquipment || loadEquippedItems()], () => calculateArmyPower(army));
    const text = getPowerBreakdownLines(result).join('\n');
    if (content.textContent !== text) content.textContent = text;
  };
  panel.addEventListener('toggle', panel._refreshPower);
  panel._refreshPower();
  schedulePowerRefresh();
  return panel;
}

export {
  cachedDisplayPower,
  schedulePowerRefresh,
  createEntityPowerValue,
  createArmyPowerReport,
  createEntityRateSummary,
  createArmyPowerSummary,
  resolvePowerOwner,
  refreshDisplayedPowers,
  createAttackPowerValue,
};

// Register shared handlers once, after the complete module graph is initialized.
let initialized = false;
export function initializePowerViews() {
  if (initialized) return;
  initialized = true;
  window.addEventListener('adminModeChanged', () => {
    if (powerRefreshTimer !== null) clearTimeout(powerRefreshTimer);
    powerRefreshTimer = null;
    refreshDisplayedPowers();
    document.querySelectorAll('.attack-dps-preview').forEach(row => row._refreshRate?.());
    document.querySelectorAll('.admin-attack-card-controls').forEach(row => { row.hidden = !isAdminMode(); });
    document.querySelectorAll('.stat-hover[data-stat="attackDps"]').forEach(helper => {
      const body = helper.querySelector('.stat-hover-body');
      if (body && helper._helperHost?.isConnected) body.innerHTML = helper._helperHost.dataset.helperText;
      else helper.remove();
    });
    schedulePowerRefresh();
  });

  ['selectedArmyAUpdated', 'inventoryItemsUpdated', 'equippedItemsUpdated', 'attackEssenceSocketUpdated',
    'linkedEssenceInventoryUpdated', 'attackMasteryChanged', 'entityProgressionReset']
    .forEach(name => window.addEventListener(name, queuePowerRefresh));

  document.addEventListener('visibilitychange', () => { if (!document.hidden) queuePowerRefresh(); });
}

const entries = new Map(), columns = new Map();
let pulse = null;
const fmt = value => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 }).format(value);
const seconds = deadline => Math.max(0, deadline - clockNow()) / 1000;
const duration = value => `${value.toFixed(1).replace('.', ',')} s`;
const actualTick = tick => tick ? `${fmt(tick.hp)} HP · ${fmt(tick.armor)} armure` : '—';
const helperFor = node => document.querySelector(`.stat-hover[data-helper-key="${CSS.escape(node.dataset.helperKey)}"]`);

function sourceMarkup(source) {
  const portrait = source.portrait ? `<img class="effect-source-portrait" src="${escape(cachedResourceUrl(source.portrait))}" alt="">` : '';
  return `${portrait}<span>${escape(source.sourceLabel || 'Source inconnue')}</span>`;
}

function helperHtml(group, now) {
  const sorted = group.entries.slice().sort((a,b) => a.endAt() - b.endAt() || a.key.localeCompare(b.key));
  const read = sorted.map(entry => ({ ...entry.read(), remaining: Math.max(0, entry.endAt() - now) / 1000 }));
  const remaining = Math.max(...read.map(source => source.remaining));
  if (group.kind === 'poison' && sorted[0].type === 'dot') {
    return `<div class="effect-source-heading">${read.length} source${read.length > 1 ? 's' : ''} active${read.length > 1 ? 's' : ''} · Dernière fin : <strong>${duration(remaining)}</strong></div>`
      + `<table class="effect-source-table"><thead><tr><th>Source</th><th>Reste</th><th>Dernier tick subi</th></tr></thead><tbody>`
      + read.map(source => `<tr><td><div class="effect-source-name">${sourceMarkup(source)}</div><small>${fmt(source.dps)} dégâts/s après Résistance aux altérations · tick de ${fmt(source.interval)} s</small></td><td>${duration(source.remaining)}</td><td>${actualTick(source.lastTick)}</td></tr>`).join('')
      + `</tbody></table><div class="effect-helper-note">Chaque source conserve sa durée et sa cadence. Les dégâts subis distinguent HP et armure.</div>`;
  }
  if (group.kind === 'magicalBurn' && sorted[0].type === 'dot') {
    const fire = read[0];
    return `<div>Durée restante : <strong>${duration(remaining)}</strong></div>`
      + `<div>Dégâts restants avant protections : <strong>${fmt(fire.remainingDamage)}</strong></div>`
      + `<div>${fmt(fire.dps)} dégâts/s après Résistance aux altérations · tick de ${fmt(fire.interval)} s</div>`
      + `<div class="effect-last-tick">Dernier tick subi : <strong>${actualTick(fire.lastTick)}</strong></div>`
      + `<table class="effect-source-table"><thead><tr><th>Source</th><th>Dégâts restants</th></tr></thead><tbody>`
      + fire.sources.map(source => `<tr><td><div class="effect-source-name">${sourceMarkup(source)}</div></td><td>${fmt(source.remainingDamage)}</td></tr>`).join('')
      + `</tbody></table><div class="effect-helper-note">Un nouvel apport s’ajoute aux dégâts restants et renouvelle la durée.</div>`;
  }
  if (group.kind === 'brulure' && sorted[0].type === 'dot') {
    const fire = read[0], sources = fire.sources || [];
    return `<div class="effect-source-heading">Feu commun · ${fire.count} apports · ${new Set(sources.map(source => source.attacker)).size} lanceur(s)</div>`
      + `<div class="effect-last-tick">Dernier tick subi : <strong>${actualTick(fire.lastTick)}</strong></div>`
      + `<div>${fmt(fire.dps)} dégâts/s après Résistance aux altérations · tick de ${fmt(fire.interval)} s</div>`
      + `<div class="effect-maintenance">Prochaine baisse : <strong>${duration(seconds(fire.maintenanceAt))}</strong><progress max="1" value="${Math.max(0, Math.min(1, seconds(fire.maintenanceAt) / fire.maintenanceSeconds))}"></progress></div>`
      + `<div>Sans nouvel apport : −${fmt(fire.lossPercent)} % par cycle.<br>Extinction estimée : <strong>${duration(remaining)}</strong></div>`
      + `<table class="effect-source-table"><thead><tr><th>Contributeur</th><th>Apports</th></tr></thead><tbody>`
      + sources.map(source => `<tr><td><div class="effect-source-name">${sourceMarkup(source)}</div></td><td>${source.count}</td></tr>`).join('')
      + `</tbody></table><div class="effect-helper-note">Un apport réussi entretient le feu, sans décaler le prochain tick.</div>`;
  }
  return `<div>Durée restante : <strong>${duration(remaining)}</strong></div>`
    + read.map(source => `<div class="effect-control-source">${read.length > 1 ? `<div class="effect-source-name">${sourceMarkup(source)}<span>${duration(source.remaining)}</span></div>` : ''}${source.html || ''}</div>`).join('');
}

function removeRow(row) { helperFor(row)?.remove(); row.remove(); }

function makeRow(column, group) {
  const row = document.createElement('div');
  row.className = 'attack-nature-effect entity-effect-row';
  row.dataset.stat = 'active-effect'; row.dataset.hover = 'true'; row.dataset.entityEffect = group.kind;
  row.dataset.helperKey = `${column.target.id}-effect-${group.kind}`;
  row.dataset.entityId = String(column.target.id);
  row.dataset.activeEffect = group.label;
  row.dataset.helperClass = 'active-effect-hover entity-effect-hover';
  row.tabIndex = 0; row.setAttribute('role', 'button');
  const visual = EFFECT_VISUALS[group.kind];
  if (visual?.nature) row.classList.add(visual.nature);
  const icon = visual
    ? `<img class="entity-effect-icon ${escape(visual.iconClass || '')}" src="${escape(cachedResourceUrl(visual.src))}" alt="" draggable="false">`
    : '<span class="entity-effect-icon" aria-hidden="true"></span>';
  row.innerHTML = `${icon}<span class="entity-effect-count" aria-hidden="true"></span><small class="entity-effect-time"></small>`;
  if (!EFFECT_VISUALS[group.kind]) row.querySelector('.entity-effect-icon').classList.add('picto-stat', group.entries[0].stat || 'neutral');
  row._refreshActiveEffect = () => {
    const current = column.groups.get(group.kind);
    if (!current) return;
    row.dataset.helperText = helperHtml(current, clockNow());
    const helper = helperFor(row);
    if (helper) refreshStatHelper(helper, row, column.target);
  };
  for (const event of ['mouseover', 'focusin']) row.addEventListener(event, row._refreshActiveEffect);
  for (const event of ['click', 'dblclick', 'pointerdown', 'dragstart']) row.addEventListener(event, eventObject => {
    eventObject.stopPropagation();
    if (event === 'dragstart') eventObject.preventDefault();
  });
  bindHelperEntity(row, column.target);
  return row;
}

function renderColumn(column) {
  const { target } = column;
  const host = document.getElementById(`effectsContainer_${target.id}`);
  if (!host) return;
  if (!column.node?.isConnected) {
    column.node = host.querySelector(':scope > .entity-effect-column') || document.createElement('div');
    // Restored scene markup is rebound from effect snapshots, never from saved listeners.
    column.node.replaceChildren(); column.rows = new Map(); column.signature = '';
    column.node.className = 'entity-effect-column';
    column.node.dataset.entityId = String(target.id);
    column.node.setAttribute('aria-label', 'Effets actifs');
    host.append(column.node);
  }
  column.node.dataset.side = target.side === 'B' ? 'B' : 'A';
  const groups = new Map();
  for (const [key, entry] of entries) {
    if (String(entry.target.id) !== String(target.id) || entry.endAt() <= clockNow() || target.isDEAD || target.stats?.HP?.current <= 0) continue;
    const group = groups.get(entry.kind) || { kind: entry.kind, label: entry.label, entries: [], expiresAt: 0, count: 0 };
    group.entries.push({ ...entry, key }); group.expiresAt = Math.max(group.expiresAt, entry.endAt());
    group.count += entry.count?.() ?? 1; groups.set(entry.kind, group);
  }
  column.groups = groups;
  for (const [kind, row] of column.rows) if (!groups.has(kind)) { removeRow(row); column.rows.delete(kind); }
  const ordered = [...groups.values()].sort((a,b) => a.expiresAt - b.expiresAt || a.kind.localeCompare(b.kind));
  const signature = ordered.map(group => group.kind).join('|');
  const positions = signature !== column.signature ? new Map([...column.rows].map(([key,row]) => [key,row.getBoundingClientRect().top])) : null;
  for (const group of ordered) {
    let row = column.rows.get(group.kind);
    if (!row) { row = makeRow(column, group); column.rows.set(group.kind, row); }
    const type = group.entries[0].type;
    if (type === 'dot') row.dataset.dotEffect = group.kind;
    if (type === 'control') row.dataset.controlEffect = group.kind;
    if (type === 'nature') row.dataset.natureEffect = group.kind;
    row.style.setProperty('--effect-color', EFFECT_VISUALS[group.kind]?.color || '#e4d2a6');
    row.dataset.expiresAt = String(group.expiresAt);
    row.dataset.effectCount = String(group.count);
    const count = row.querySelector('.entity-effect-count'); count.hidden = group.count <= 1; count.textContent = group.count;
    const countLabel = group.kind === 'brulure' ? 'apports' : type === 'nature' ? 'cumuls' : 'sources';
    const label = `${group.label}${group.count > 1 ? ` · ${group.count} ${countLabel}` : ''} · ${duration(seconds(group.expiresAt))}${group.kind === 'brulure' ? ' sans nouvel apport' : ''}`;
    row.setAttribute('aria-label', label);
    row.querySelector('small').textContent = duration(seconds(group.expiresAt));
    row.classList.toggle('is-decaying', group.entries.some(entry => entry.decaying?.()));
    if (signature !== column.signature || row.parentElement !== column.node) column.node.append(row);
    if (helperFor(row)) row._refreshActiveEffect();
  }
  if (positions && column.signature && !isCombatPaused() && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    for (const [key,row] of column.rows) {
      const offset = positions.get(key) - row.getBoundingClientRect().top;
      if (Number.isFinite(offset) && Math.abs(offset) > 1) row.animate([{ transform: `translateY(${offset}px)` }, { transform: 'translateY(0)' }], { duration: 140 });
    }
  }
  column.signature = signature;
  if (!ordered.length) { column.node.remove(); columns.delete(String(target.id)); }
}

export function refreshEntityEffectViews(target = null) {
  for (const column of columns.values()) if (!target || String(column.target.id) === String(target.id)) renderColumn(column);
}

export function setEntityEffectView(target, key, entry) {
  entries.set(key, { ...entry, target });
  let column = columns.get(String(target.id));
  if (!column) { column = { target, rows: new Map(), groups: new Map() }; columns.set(String(target.id), column); }
  column.target = target; renderColumn(column);
  if (pulse === null) pulse = setInterval(() => refreshEntityEffectViews(), 250);
}

export function removeEntityEffectView(key) {
  const entry = entries.get(key); entries.delete(key);
  if (entry) refreshEntityEffectViews(entry.target);
  if (!entries.size && pulse !== null) { clearInterval(pulse); pulse = null; }
}

export function clearEntityEffectViews() {
  for (const column of columns.values()) { for (const row of column.rows.values()) removeRow(row); column.node?.remove(); }
  entries.clear(); columns.clear(); clearInterval(pulse); pulse = null;
}
window.addEventListener('entityCombatSideChanged', ({ detail }) => refreshEntityEffectViews(detail.entity));
for (const event of ['battleEnding', 'battleStopped', 'battleResolved', 'stageInterfaceClosing']) window.addEventListener(event, clearEntityEffectViews);


// Projection des statistiques permanentes et prevues dans les vues existantes.
const DISPLAYABLE_STAT_KEYS = new Set(
  STATS_DATA.flatMap(({ key }) => [key, normalizeStatKey(key)])
);


const DOM_NON_STAT_KEYS = new Set([
  "hp-bar",
  "armor-bar",
  "armor-text",
  "extraLife-value",
  "stuffSlot",
]);


export const ZERO_VALUE_VISIBLE_STAT_KEYS = new Set([
  "HP",
  "armor",
  "extraLife",
  "shift",
  "speed",
  "strength",
  "agility",
  "intelligence",
  "will",
]);


const STAT_SYNC_CALCULATORS = {
  calculateMagicalTotal,
  calculateMeleeExecutionPercent: entite =>
    Math.max(0, 100 - (Number(getFinalAttackExecutionReduc(entite)) || 0)),
  calculateCritTotalChance: entite => calculateCritTotalChance(entite),
  calculateCritDamageBonus: entite => calculateCritDamageBonus(entite),
  getFinalCriticalChanceFlat,
  getFinalCriticalDamageFlat,
  calculateAmbidextryTotalChance,
  calculateAmbidextryDamageBonus,
  calculateBloodFuryExecutionPercent,
  calculateBloodFuryTargetThreshold,
  calculateExecutionDamage,
  calculateBloodThirstyPercent,
  getBloodThirstyPercent,
  calculatePhysicalPenPercent,
  calculateMagicalPenPercent,
  calculateHypercognitionEssences,
  calculateCognitiveExplosionTotal,
  calculateRangeRatio: entite => Number(calculateRangeRatio(entite).toFixed(2)),
  calculateBullsEyePercent,
  calculateTotalDodgeBonus,
  calculateResilienceCritTotalBonus,
  calculateResilienceTotalCancelBonus,
  calculateResilienceAlterationTotalBonus,
  caluclateIndestructibilityReductionTotal,
  calculateIndestructibilityPercentFromEntity,
  calculateHpBattleRegenPercent,
  calculateAstralityTotal,
  calculateTranscendenceConsoProtectionTotal,
  calculateTranscendenceExtraLife: entite =>
    calculateTranscendenceExtraLife(Number(getSafe(entite, "transcendence", 0)) || 0, globalThis.umbraProgression.getUmbraThreshold(entite)),
  calculateEsoterismPercent,
  calculateTotalRegenAmount,
  getFinalAttackPreparationReduc,
  getFinalAttackExecutionReduc,
  getFinalAttackCooldownReduc,
  getFinalAttackRecoveryReduc,
  getFinalAttackProjectileSpeed,
  calculateInvisibleTargetAvoidChance,
  calculateBrokenSpellChance,
  calculateBrokenSpellDamage,
  totalMeleeExecReduction,
  totalPiercingRecupReductionWithAgi,
  totalTranspiercingRecupReductionWithAgi,
  transpiercingAgiRatio,
  transpiercingTotal,
  brutalityPercantBonus,
  psionicPercantBonus,
  calculateMeleeExecBonus,
  calculateMysticismProcChance,
  calculateMysticismTranceDuration,
  calculateMysticismPreparationAcceleration,
  calculateMysticismTotalDamageBonus,
  calculateLvlMaxEntiteWithWill: entite =>
    calculateLvlMaxEntiteWithWill(entite, Number(getSafe(entite, "will", 0)) || 0),
  calculateEquilibreAggroReduction,
  calculateEquilibreInvisibleDetection,
  calculateEquilibreAttackChance,
  calculateAgileRetreatChance,
  calculateOccultismInvisibilityChance,
  calculateOccultismTargetableChanceDisplay,
  calculateOccultismDodgeBonus,
  calculateOccultismCritChanceBonus,
  calculateOccultismShadowFragilityPercent,
  calculateMovementMaxCharges,
  calculateMovementStartingChargePercent,
  calculateMovementStartingCharges,
  calculateMovementMarathonChance,
  getMarathonChance,
  getTrailerChance,
  getFinalWeaponOrfevreBonus,
  getFinalWeaponCollectorBonus,
  calculateChargeEquipmentSlots,
  calculateWeaponMasteryTotalChargeBonus,
  calculateWeaponMasteryTrophyChance,
};


const STATS_PANEL_DYNAMIC_ROWS = {
  fatalSurvival: { sectionClass: 'defence', sourceStat: 'fatalSurvival', label: 'Survie fatale :', valueTemplate: '${value} %', autonomousHelper: true },
  ...Object.fromEntries([
    ['criticalResistance', 'Résistance aux critiques'],
    ['alterationResistance', 'Résistance aux altérations'],
    ['hindranceResistance', 'Résistance aux entraves'],
    ['resilienceTotal', 'Résilience totale'],
  ].map(([key, label]) => [key, {
    sectionClass: 'defence', sourceStat: key, label: `${label} :`,
    valueTemplate: '${value} %', autonomousHelper: true, beforeStats: ['astrality'],
  }])),
  bloodThirsty: {
    sectionClass: "attack",
    sourceStat: "bloodThirsty",
    label: "Soif de sang :",
    value: value => `${formatDynamicStatValue(value)} %`,
    beforeStats: ["magicalDamage"],
  },
  hpBattleRegen: {
    sectionClass: "defence",
    sourceStat: "hpBattleRegen",
    label: "Régénération de Combat :",
    value: value => `${formatDynamicStatValue(value)} % des HP max / tour`,
    beforeStats: ["astrality"],
  },
  marathon: {
    sectionClass: "utilitaire",
    sourceStat: "marathon",
    label: "Marathonien :",
    value: value => `${formatDynamicStatValue(value)} %`,
    beforeStats: ["trailer", "weaponOrfevre", "weaponCollector", "charge"],
  },
  trailer: {
    sectionClass: "utilitaire",
    sourceStat: "trailer",
    label: "Trailer :",
    value: value => `${formatDynamicStatValue(value)} %`,
    beforeStats: ["weaponOrfevre", "weaponCollector", "charge"],
  },
  weaponOrfevre: {
    sectionClass: "utilitaire",
    sourceStat: "weaponOrfevre",
    label: "Efficacité des équipements :",
    value: value => `+ ${formatDynamicStatValue(value)}%`,
    beforeStats: ["weaponCollector", "charge"],
  },
  weaponCollector: {
    sectionClass: "utilitaire",
    sourceStat: "weaponCollector",
    label: "Butins d'équipement :",
    value: value => `+ ${formatDynamicStatValue(value)}%`,
    beforeStats: ["charge"],
  },
  attackCooldownReduc: {
    sectionClass: "utilitaire",
    displayStat: "cooldownTime",
    sourceStat: "attackCooldownReduc",
    originStat: "haste",
    label: "Durée de Cooldown :",
    valueTemplate: "- ${value} %",
    calculatorName: "getFinalAttackCooldownReduc",
  },
  attackPreparationReduc: {
    sectionClass: "utilitaire",
    displayStat: "preparationTime",
    sourceStat: "attackPreparationReduc",
    originStat: "haste",
    label: "Durée de Préparation :",
    valueTemplate: "- ${value} %",
    calculatorName: "getFinalAttackPreparationReduc",
  },
  attackExecutionReduc: {
    sectionClass: "utilitaire",
    displayStat: "executionTime",
    sourceStat: "attackExecutionReduc",
    originStat: "haste",
    label: "Durée d'Exécution :",
    valueTemplate: "- ${value} %",
    calculatorName: "getFinalAttackExecutionReduc",
  },
  attackRecoveryReduc: {
    sectionClass: "utilitaire",
    displayStat: "recuperationTime",
    sourceStat: "attackRecoveryReduc",
    originStat: "haste",
    label: "Durée de Récupération :",
    valueTemplate: "- ${value} %",
    calculatorName: "getFinalAttackRecoveryReduc",
  },
  attackProjectileSpeed: {
    sectionClass: "utilitaire",
    displayStat: "projectileTime",
    sourceStat: "attackProjectileSpeed",
    originStat: "haste",
    label: "Vitesse des projectiles :",
    valueTemplate: "+ ${value} %",
    calculatorName: "getFinalAttackProjectileSpeed",
  },
};


export function refreshResetDom(entity, oldStats, entityApi, codexApi) {
  if (typeof document === 'undefined') return;
  // Existing consumables only change HP/status immediately and leave cosmetic effects.
  document.getElementById(`spriteContainer_${entity.id}`)?.classList.remove('itemheal', 'itemdamage', 'itemrez');
  document.getElementById(`codex-entity-sprite-container_${entity.id}`)
    ?.querySelectorAll('.itemeffectVfx').forEach(node => node.remove());
  document.querySelectorAll('.entity-level, [data-stat="lvl"][data-entity-id]').forEach(node => {
    if (String(node.dataset?.entityId) === String(entity.id)) node.textContent = '1';
  });
  syncDOMWithStats(oldStats, entity.stats, entity.id, entity);
  updateBonusLifeCounters(entity);
  entityApi.updateCurrentAttackDisplay(entity);
  const codex = document.getElementById(`codex-entity_${entity.id}`);
  if (codex?.parentElement) {
    const parent = codex.parentElement;
    const position = codex.classList.contains('right') ? 'right' : codex.classList.contains('left') ? 'left' : '';
    const dual = codex.classList.contains('dual-view');
    const id = codex.id;
    codex.remove();
    codexApi.createCodexEntityScan(entity, parent, id, position);
    if (dual) document.getElementById(id)?.classList.add('dual-view');
  }
}


export function refreshConfirmedLevelDom(entite) {
  if (typeof document === "undefined" || !entite?.id) return;

  const entityId = cssEscapeValue(entite.id);
  const levelValue = getEntityLevelCurrent(entite);

  document
    .querySelectorAll(`[data-stat="lvl"][data-entity-id="${entityId}"]`)
    .forEach(node => { node.textContent = String(levelValue); });

  document
    .querySelectorAll(`#codex-entity_${entityId} .entite-stat-level`)
    .forEach(node => { node.textContent = ` - Level ${levelValue}`; });
}


function containerOf(el) {
  if (!el || typeof el.closest !== "function") return null;
  return el.closest(".stat-container, .codex-profile-battle-stat, .codex-profile-umbra-stat");
}


function getStatComparableValue(value, fallback = 0) {
  if (value && typeof value === "object") {
    return Number(value.max ?? value.current ?? fallback) || 0;
  }

  return Number(value ?? fallback) || 0;
}


function getSnapshotComparableValue(stats, key, fallback = 0) {
  if (!stats || stats[key] === undefined) return fallback;
  return getStatComparableValue(stats[key], fallback);
}


function formatDynamicStatValue(value) {
  const n = getStatComparableValue(value, 0);
  if (!Number.isFinite(n)) return "0";
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 100) / 100).replace(/\.0+$/, "");
}


function formatSyncedStatValue(value) {
  if (value && typeof value === "object") {
    const current = Number(value.current ?? value.max ?? 0) || 0;
    const max = Number(value.max ?? value.current ?? 0) || 0;
    return current !== max ? `${formatDynamicStatValue(current)} / ${formatDynamicStatValue(max)}` : formatDynamicStatValue(max);
  }

  return formatDynamicStatValue(value);
}


function statDisplayMaximum(stat, calculatorName = '', template = '') {
  // A score in points has no effect ceiling; only its percent conversion does.
  const converted = { dodge: 'dodgeChance', precision: 'precisionChance', physicalResistance: 'resistanceReduction', magicalResistance: 'resistanceReduction' };
  const aliases = {
    calculateCritTotalChance: 'criticalChance', calculateBullsEyePercent: 'bullsEye',
    calculatePhysicalPenPercent: 'physicalPen', calculateMagicalPenPercent: 'magicalPen',
    calculateHypercognitionEssences: 'cognitiveGenerator', calculateAstralityTotal: 'fatalSurvival',
    calculateBloodFuryExecutionPercent: 'bloodFuryExecutionChance', calculateBloodFuryTargetThreshold: 'bloodFuryTargetThreshold',
    calculateTranscendenceConsoProtectionTotal: 'transcendenceTotal', calculateAgileRetreatChance: 'agileRetreat',
    getFinalAttackCooldownReduc: 'attackCooldownReduc', getFinalAttackPreparationReduc: 'attackPreparationReduc',
    getFinalAttackExecutionReduc: 'attackExecutionReduc', getFinalAttackRecoveryReduc: 'attackRecoveryReduc', getFinalAttackProjectileSpeed: 'attackProjectileSpeed',
  };
  if (converted[stat]) return template?.includes('%') ? getStatEffectMaximum(converted[stat]) : undefined;
  return getStatEffectMaximum(STAT_EFFECT_HELPERS[calculatorName] || aliases[calculatorName] || stat);
}
function appendStatMaximum(html, value, maximum) {
  return html + (statMaximumLabel(value, maximum) ? ' <small class="stat-maximum">MAX</small>' : '');
}

function formatStatTemplate(template, value, maximum) {
  if (typeof template === "string" && template.includes("${value}")) {
    return appendStatMaximum(template.replaceAll("${value}", formatSyncedStatValue(value)), value, maximum);
  }

  return appendStatMaximum(formatSyncedStatValue(value), value, maximum);
}


function getStatSyncCalculator(calculatorName) {
  const name = String(calculatorName || "").trim();
  return name ? STAT_SYNC_CALCULATORS[name] : null;
}


function resolveStatSyncValue(entite, statKey, {
  calculatorName = null,
  fallback = 0,
} = {}) {
  const canonical = normalizeStatKey(statKey);
  const fn = getStatSyncCalculator(calculatorName);

  if (typeof fn === "function") {
    try {
      return fn(entite, getSafe(entite, canonical, fallback));
    } catch (error) {
      console.warn(`Calculateur de stat impossible a executer: ${calculatorName}`, error);
    }
  }

  const rawValue = getSafe(entite, canonical, fallback);
  const computed = calculateStatsDisplay(canonical, entite, rawValue, { includeHelper: false });
  return computed?.displayValue ?? rawValue;
}


function resolveStatContainerValue(container, entite, statKey, fallback = 0) {
  const sourceStat = normalizeStatKey(container?.dataset?.sourceStat || statKey);
  const calculatorName = container?.dataset?.calculatorName || "";
  const percent = container?.dataset?.valueTemplate?.includes('%');
  const conversion = percent && ['physicalResistance', 'magicalResistance', 'dodge', 'precision'].includes(sourceStat)
    ? getStatSystemResult(entite, sourceStat) : null;
  const value = conversion?.resistancePoints ? conversion.reductionRatio * 100
    : conversion?.dodgePoints || conversion?.precisionPoints ? conversion.chancePercent
    : resolveStatSyncValue(entite, sourceStat, { calculatorName, fallback });
  const html = formatStatTemplate(container?.dataset?.valueTemplate, value, statDisplayMaximum(sourceStat, calculatorName, container?.dataset?.valueTemplate));

  return { value, html };
}


function getStatsPanelDynamicConfig(stat) {
  const statKey = normalizeStatKey(stat);
  return STATS_PANEL_DYNAMIC_ROWS[statKey] || null;
}


function getStatsPanelDynamicSourceStat(stat, config = null) {
  const statKey = normalizeStatKey(stat);
  if (STATS_PANEL_DYNAMIC_ROWS[statKey]) return statKey;
  return normalizeStatKey(config?.sourceStat || statKey);
}


function getStatsPanelDynamicDisplayStat(stat, config = null) {
  const cfg = config || getStatsPanelDynamicConfig(stat);
  return cfg?.displayStat || stat;
}


function getStatsPanelDynamicValue(stat, config, entite, fallback = 0) {
  if (!config) return fallback;
  return resolveStatSyncValue(entite, getStatsPanelDynamicSourceStat(stat, config), {
    calculatorName: config.calculatorName,
    fallback,
  });
}


function formatStatsPanelDynamicValue(config, value) {
  if (typeof config?.value === "function" && !config.valueTemplate) {
    return appendStatMaximum(config.value(value), value, statDisplayMaximum(config.sourceStat, config.calculatorName, config.valueTemplate));
  }

  return formatStatTemplate(config?.valueTemplate, value, statDisplayMaximum(config?.sourceStat, config?.calculatorName, config?.valueTemplate));
}


function cssEscapeValue(value) {
  return globalThis.CSS?.escape
    ? CSS.escape(String(value))
    : String(value).replace(/["\\]/g, "\\$&");
}


function getStatSnapshotValue(stats, statKey, fallback = undefined) {
  if (!stats) return fallback;
  const canonical = normalizeStatKey(statKey);
  if (stats[statKey] !== undefined) return stats[statKey];
  if (stats[canonical] !== undefined) return stats[canonical];
  return fallback;
}


function isStatsSnapshotDifferent(a, b) {
  if (a === b) return false;
  return JSON.stringify(a) !== JSON.stringify(b);
}


function getLiveEntityForStatSync(entityId) {
  const id = String(entityId);
  const win = globalThis.window || {};
  const pools = [
    entites,
    win.entites,
    win.selectedArmyA,
    win.selectedArmyB,
    win.entitesNestUp,
  ];

  for (const pool of pools) {
    if (!Array.isArray(pool)) continue;
    const found = pool.find(entity => String(entity?.id) === id);
    if (found) return found;
  }

  return null;
}


function buildStatsSnapshotEntity(liveEntity, statsSnapshot, entityId, modifierStatsSnapshot = undefined) {
  const modifierSource =
    modifierStatsSnapshot !== undefined
      ? modifierStatsSnapshot
      : liveEntity?.modifierStats;
  const modifierStats = {
    ...(modifierSource || {}),
    preview: null,
  };

  return {
    ...(liveEntity || {}),
    id: liveEntity?.id ?? entityId,
    stats: statsSnapshot || {},
    modifierStats,
  };
}


function getRenderedStatKeysForEntity(entityId) {
  if (typeof document === "undefined" || !entityId) return [];

  const escapedEntityId = cssEscapeValue(entityId);
  const renderedKeys = new Set();

  document
    .querySelectorAll(
      `.stat-container[data-entity-id="${escapedEntityId}"][data-stat], ` +
      `.codex-profile-battle-stat[data-entity-id="${escapedEntityId}"][data-stat], ` +
      `.codex-profile-umbra-stat[data-entity-id="${escapedEntityId}"][data-stat]`
    )
    .forEach((node) => {
      const statKey = node.dataset.stat;
      const canonical = normalizeStatKey(statKey);
      if (!statKey || DOM_NON_STAT_KEYS.has(statKey) || DOM_NON_STAT_KEYS.has(canonical)) return;
      if (!DISPLAYABLE_STAT_KEYS.has(statKey) && !DISPLAYABLE_STAT_KEYS.has(canonical)) return;
      renderedKeys.add(statKey);
    });

  return [...renderedKeys];
}


function getRenderedStatContainersForEntity(entityId) {
  const state = {
    containers: new WeakSet(),
    statKeys: new Set(),
  };

  if (typeof document === "undefined" || !entityId) return state;

  const escapedEntityId = cssEscapeValue(entityId);
  document
    .querySelectorAll(
      `.stat-container[data-entity-id="${escapedEntityId}"][data-stat], ` +
      `.codex-profile-battle-stat[data-entity-id="${escapedEntityId}"][data-stat], ` +
      `.codex-profile-umbra-stat[data-entity-id="${escapedEntityId}"][data-stat]`
    )
    .forEach((node) => {
      const statKey = node.dataset.stat;
      const canonical = normalizeStatKey(statKey);
      if (!statKey || DOM_NON_STAT_KEYS.has(statKey) || DOM_NON_STAT_KEYS.has(canonical)) return;

      state.containers.add(node);
      state.statKeys.add(statKey);
      state.statKeys.add(canonical);
      state.statKeys.add(getDisplayStatKey(canonical));
    });

  return state;
}


function shouldMarkExistingContainerAsNew(renderedBefore, container) {
  return Boolean(container && renderedBefore && !renderedBefore.containers.has(container));
}


function shouldRemoveFinalZeroStatContainer(container, stat, nextValue, beforeValue) {
  if (!container) return false;
  if (container.dataset.statCursed === 'true') return false;

  const statKey = normalizeStatKey(stat || container.dataset?.stat);
  if (!statKey) return false;
  if (DOM_NON_STAT_KEYS.has(statKey) || ZERO_VALUE_VISIBLE_STAT_KEYS.has(statKey)) return false;
  if (container.closest?.(".level-up-section")) return false;

  const beforeComparable = getStatComparableValue(beforeValue, 0);
  const nextComparable = getStatComparableValue(nextValue, 0);

  return beforeComparable > 0 && nextComparable <= 0;
}


function getStatDisplayImpactScore(statKey, entite, statsSnapshot) {
  if (!statKey || !entite) return null;

  try {
    const statValue = getStatSnapshotValue(statsSnapshot, statKey, undefined);
    const computed = calculateStatsDisplay(statKey, entite, statValue);
    if (!computed || typeof computed !== "object") return null;

    let score = 0;
    for (const [key, value] of Object.entries(computed)) {
      if (key === "helpContent" || key === "ambianceContent") continue;
      if (typeof value === "number" && Number.isFinite(value)) {
        score += value;
      }
    }

    return Math.round(score * 1000) / 1000;
  } catch (error) {
    console.warn(`Impact helper impossible a calculer pour ${statKey}`, error);
    return null;
  }
}


function addRenderedStatImpactDiffs(changedStats, oldStats, newStats, entityId, entityContext = null, options = {}) {
  const renderedStatKeys = getRenderedStatKeysForEntity(entityId);
  if (!renderedStatKeys.length) return changedStats;

  const liveEntity = entityContext || getLiveEntityForStatSync(entityId);
  if (!liveEntity) return changedStats;

  const beforeEntity = buildStatsSnapshotEntity(liveEntity, oldStats, entityId, options.oldModifierStats);
  const afterEntity = buildStatsSnapshotEntity(liveEntity, newStats, entityId, options.newModifierStats);

  for (const statKey of renderedStatKeys) {
    const beforeScore = getStatDisplayImpactScore(statKey, beforeEntity, oldStats);
    const afterScore = getStatDisplayImpactScore(statKey, afterEntity, newStats);

    if (!Number.isFinite(beforeScore) || !Number.isFinite(afterScore)) continue;
    if (beforeScore === afterScore) continue;

    const newValue = getStatSnapshotValue(newStats, statKey, 0);
    if (!changedStats[statKey]) {
      changedStats[statKey] = {
        value: newValue,
        isNew: false,
      };
    }

    changedStats[statKey].visualBefore = beforeScore;
    changedStats[statKey].visualAfter = afterScore;
  }

  return changedStats;
}


function addStatsPanelDynamicDiffs(changedStats, oldStats, newStats, entityId, entityContext = null, options = {}) {
  const liveEntity = entityContext || getLiveEntityForStatSync(entityId);
  const beforeEntity = buildStatsSnapshotEntity(liveEntity, oldStats, entityId, options.oldModifierStats);
  const afterEntity = buildStatsSnapshotEntity(liveEntity, newStats, entityId, options.newModifierStats);

  for (const statKey of Object.keys(STATS_PANEL_DYNAMIC_ROWS)) {
    const config = STATS_PANEL_DYNAMIC_ROWS[statKey];
    const displayStatKey = getStatsPanelDynamicDisplayStat(statKey, config);
    const beforeFallback = getStatSnapshotValue(oldStats, statKey, 0);
    const nextFallback = getStatSnapshotValue(newStats, statKey, 0);
    const beforeValue = getStatsPanelDynamicValue(statKey, config, beforeEntity, beforeFallback);
    const nextValue = getStatsPanelDynamicValue(statKey, config, afterEntity, nextFallback);
    const beforeComparable = getStatComparableValue(beforeValue, 0);
    const nextComparable = getStatComparableValue(nextValue, 0);

    if (beforeComparable === nextComparable) continue;

    const payload = {
      value: nextValue,
      isNew: false,
      visualBefore: beforeComparable,
      visualAfter: nextComparable,
    };

    changedStats[statKey] = payload;
    changedStats[displayStatKey] = payload;
  }

  return changedStats;
}


function getPayloadStatDeltaComparison(payload, nextValue, beforeValue) {
  const visualBefore = Number(payload?.visualBefore);
  const visualAfter = Number(payload?.visualAfter);

  if (Number.isFinite(visualBefore) && Number.isFinite(visualAfter)) {
    return { next: visualAfter, before: visualBefore };
  }

  return { next: nextValue, before: beforeValue };
}


function findStatsPanelSectionForEntity(entityId, sectionClass) {
  if (typeof document === "undefined" || !entityId || !sectionClass) return null;
  const escapedEntityId = cssEscapeValue(entityId);
  const sections = Array.from(document.querySelectorAll(`.stat-section-codex.${sectionClass}`));

  const exact = sections
    .find(section => section.querySelector(`[data-entity-id="${escapedEntityId}"]`));
  if (exact) return exact;

  const visibleStatsSections = sections.filter(section =>
    section.closest(".section-content.stats, .section-content.statistiques")
  );

  return visibleStatsSections.length === 1 ? visibleStatsSections[0] : null;
}


function findStatsPanelInsertionAnchor(section, beforeStats = []) {
  if (!section || !Array.isArray(beforeStats)) return null;
  const beforeSet = new Set(beforeStats.map(stat => normalizeStatKey(stat)));

  return Array.from(section.children).find(child => {
    const stat = normalizeStatKey(child?.dataset?.stat);
    return stat && beforeSet.has(stat);
  }) || null;
}


function getStatsDataSectionClass(def) {
  const type = String(def?.type || "").toLowerCase();
  if (type.startsWith("attaque")) return "attack";
  if (type.startsWith("defense") || type.startsWith("défense") || type.startsWith("defence")) return "defence";
  if (type.startsWith("utilitaire") || type === "special") return "utilitaire";
  return "utilitaire";
}


function findStatsPanelSectionForStat(entityId, def) {
  return findStatsPanelSectionForEntity(entityId, getStatsDataSectionClass(def));
}


function findStatsDefinition(stat) {
  const statKey = normalizeStatKey(stat);
  return STATS_DATA.find(def => normalizeStatKey(def.key) === statKey) || null;
}


function createMissingStatsPanelStatRow({
  entityId,
  stat,
  value,
  payload = {},
  entityContext = null,
}) {
  const statKey = normalizeStatKey(stat);
  const nextComparable = getStatComparableValue(payload?.visualAfter ?? value, 0);
  if (nextComparable <= 0 && !ZERO_VALUE_VISIBLE_STAT_KEYS.has(statKey) && !getStatMalusSources(entityContext, statKey).length) return null;

  const dynamicRow = createStatsPanelDynamicRow({
    entityId,
    stat: statKey,
    value,
    payload,
    beforeValue: 0,
    entityContext,
  });
  if (dynamicRow) return dynamicRow;

  const def = findStatsDefinition(statKey);
  const section = findStatsPanelSectionForStat(entityId, def);
  if (!def || !section) return null;

  const rowEntity = {
    ...(entityContext || {}),
    id: entityId,
    stats: {
      ...(entityContext?.stats || {}),
      [statKey]: value,
    },
  };

  createUmbraBlock(
    section,
    def.name,
    () => value,
    rowEntity,
    def.key,
    false,
    null,
    null,
    { forceNew: nextComparable > 0, newLineContext: "sync" }
  );

  return Array.from(section.children).find(child =>
    normalizeStatKey(child?.dataset?.stat) === statKey &&
    String(child?.dataset?.entityId || "") === String(entityId)
  ) || null;
}


function findStatsPanelDynamicRow(entityId, stat) {
  const statKey = normalizeStatKey(stat);
  const config = STATS_PANEL_DYNAMIC_ROWS[statKey];
  if (!config) return null;

  const section = findStatsPanelSectionForEntity(entityId, config.sectionClass);
  if (!section) return null;
  const displayStatKey = normalizeStatKey(getStatsPanelDynamicDisplayStat(statKey, config));
  const sourceStatKey = normalizeStatKey(getStatsPanelDynamicSourceStat(statKey, config));

  return Array.from(section.children).find(child =>
    (
      normalizeStatKey(child?.dataset?.stat) === statKey ||
      normalizeStatKey(child?.dataset?.stat) === displayStatKey ||
      normalizeStatKey(child?.dataset?.sourceStat) === statKey ||
      normalizeStatKey(child?.dataset?.sourceStat) === sourceStatKey
    ) &&
    String(child?.dataset?.entityId || "") === String(entityId)
  ) || null;
}


function createStatsPanelDynamicRow({
  entityId,
  stat,
  value,
  payload = {},
  beforeValue = 0,
  entityContext = null,
}) {
  const statKey = normalizeStatKey(stat);
  const config = STATS_PANEL_DYNAMIC_ROWS[statKey];
  if (!config) return null;

  const section = findStatsPanelSectionForEntity(entityId, config.sectionClass);
  if (!section) return null;

  const existing = findStatsPanelDynamicRow(entityId, statKey);
  if (existing) {
    updateStatsPanelDynamicRow(existing, {
      entityId,
      stat: statKey,
      value,
      payload: { ...payload, isNew: false },
      beforeValue,
      entityContext,
    });
    return existing;
  }

  const displayStatKey = getStatsPanelDynamicDisplayStat(statKey, config);
  const visualStatKey = getDisplayStatKey(displayStatKey);
  const root = document.createElement("div");
  root.className = `${visualStatKey}-stat stat-container`;
  root.dataset.stat = displayStatKey;
  root.dataset.sourceStat = normalizeStatKey(config.sourceStat || statKey);
  if (config.originStat) root.dataset.originStat = normalizeStatKey(config.originStat);
  if (config.calculatorName) root.dataset.calculatorName = config.calculatorName;
  if (config.valueTemplate) root.dataset.valueTemplate = config.valueTemplate;
  if (config.autonomousHelper) root.dataset.autonomousHelper = 'true';
  root.dataset.hover = "true";
  root.dataset.entityId = String(entityId);
  root.dataset.codexDynamicStat = "true";

  const wrap = document.createElement("div");
  wrap.className = `stat-picto-valeur ${visualStatKey}`;

  const picto = document.createElement("div");
  picto.className = `picto-stat ${visualStatKey}`;

  const name = document.createElement("div");
  name.className = "stat-name";
  name.textContent = config.label;

  const mainVal = document.createElement("div");
  mainVal.className = "entite-stat";
  mainVal.dataset.stat = displayStatKey;
  mainVal.dataset.hover = "true";
  mainVal.dataset.entityId = String(entityId);

  wrap.append(picto, name, mainVal);
  root.appendChild(wrap);

  updateStatsPanelDynamicRow(root, {
    entityId,
    stat: statKey,
    value,
    payload: { ...payload, isNew: true },
    beforeValue,
    entityContext,
  });

  const anchor = findStatsPanelInsertionAnchor(section, config.beforeStats);
  section.insertBefore(root, anchor);
  return root;
}


function updateStatsPanelDynamicRow(row, {
  entityId,
  stat,
  value,
  payload = {},
  beforeValue = 0,
  entityContext = null,
}) {
  const statKey = normalizeStatKey(stat);
  const config = STATS_PANEL_DYNAMIC_ROWS[statKey];
  if (!row || !config) return;

  const displayStatKey = getStatsPanelDynamicDisplayStat(statKey, config);
  const visualStatKey = getDisplayStatKey(displayStatKey);

  row.classList.add(`${visualStatKey}-stat`, "stat-container");
  row.dataset.stat = displayStatKey;
  row.dataset.sourceStat = getStatsPanelDynamicSourceStat(statKey, config);
  if (config.originStat) row.dataset.originStat = normalizeStatKey(config.originStat);
  if (config.calculatorName) row.dataset.calculatorName = config.calculatorName;
  if (config.valueTemplate) row.dataset.valueTemplate = config.valueTemplate;
  if (config.autonomousHelper) row.dataset.autonomousHelper = 'true';
  row.dataset.codexDynamicStat = "true";

  const mainVal = Array.from(row.querySelectorAll(".entite-stat"))
    .find(el => normalizeStatKey(el?.dataset?.stat) === statKey);
  if (mainVal) {
    mainVal.innerHTML = formatStatsPanelDynamicValue(config, value);
    mainVal.dataset.stat = displayStatKey;
    mainVal.dataset.hover = "true";
    mainVal.dataset.entityId = String(entityId);
  }

  row.dataset.hover = "true";
  row.dataset.entityId = String(entityId);

  const helperEntity = entityContext || { id: entityId, stats: { [statKey]: value } };
  syncStatCurseMarker(row, helperEntity, statKey);
  const computed = calculateStatsDisplay(displayStatKey, helperEntity, value);
  if (computed?.helpContent) row.dataset.helperText = computed.helpContent;

  const comparison = getPayloadStatDeltaComparison(payload, value, beforeValue);
  if (shouldRemoveFinalZeroStatContainer(row, displayStatKey, comparison.next, comparison.before)) {
    row.remove();
    return;
  }

  applyStatDeltaClass(row, comparison.next, comparison.before, {
    isNew: payload?.isNew === true,
    zeroAsHidden: false,
  });
}


function syncStatsPanelDynamicRows(entityId, oldStats = {}, newStats = {}, entityContext = null, changedStats = {}, renderedBefore = null, options = {}) {
  if (!entityId || typeof document === "undefined") return;

  const liveEntity = entityContext || getLiveEntityForStatSync(entityId);
  const beforeEntity = buildStatsSnapshotEntity(liveEntity, oldStats, entityId, options.oldModifierStats);
  const afterEntity = buildStatsSnapshotEntity(liveEntity, newStats, entityId, options.newModifierStats);

  for (const statKey of Object.keys(STATS_PANEL_DYNAMIC_ROWS)) {
    const config = STATS_PANEL_DYNAMIC_ROWS[statKey];
    const displayStatKey = getStatsPanelDynamicDisplayStat(statKey, config);
    const beforeFallback = getStatSnapshotValue(oldStats, statKey, 0);
    const nextFallback = getStatSnapshotValue(newStats, statKey, 0);
    const beforeValue = getStatsPanelDynamicValue(statKey, config, beforeEntity, beforeFallback);
    const nextValue = getStatsPanelDynamicValue(statKey, config, afterEntity, nextFallback);
    const beforeComparable = getStatComparableValue(beforeValue, 0);
    const nextComparable = getStatComparableValue(nextValue, 0);
    const existing = findStatsPanelDynamicRow(entityId, statKey);
    const existedBefore = existing && renderedBefore?.containers?.has(existing);
    const rowPayload = changedStats[statKey] || changedStats[displayStatKey] || {
      value: nextValue,
      isNew: false,
      visualBefore: beforeComparable,
      visualAfter: nextComparable,
    };

    if (existing) syncStatCurseMarker(existing, afterEntity, statKey);
    if (nextComparable <= 0 && !getStatMalusSources(afterEntity, statKey).length) {
      if (existing) existing.remove();
      continue;
    }

    createStatsPanelDynamicRow({
      entityId,
      stat: statKey,
      value: nextValue,
      payload: {
        ...rowPayload,
        isNew: (renderedBefore ? !existedBefore : !existing) && nextComparable > 0,
      },
      beforeValue,
      entityContext: afterEntity,
    });
  }
}


function applyStatDeltaClass(container, nextValue, beforeValue, { isNew = false, zeroAsHidden = true } = {}) {
  if (!container) return null;

  const nextComparable = getStatComparableValue(nextValue, 0);
  const beforeComparable = getStatComparableValue(beforeValue, 0);
  const showsNew = isNew && nextComparable > beforeComparable && nextComparable > 0;
  const valueEls = Array.from(container.querySelectorAll(".entite-stat:not(.preview)"));

  container.classList.remove("upgraded", "reducted", "new");
  container.removeAttribute("upgraded");
  delete container.dataset.previewDelta;
  valueEls.forEach(el => el.classList.remove("new-stat", "stat-new"));

  if (showsNew) {
    container.classList.add("new");
    valueEls.forEach(el => el.classList.add("new-stat"));
  }

  container.classList.remove("zero");

  if (nextComparable > beforeComparable) {
    container.classList.add("upgraded");
    return "up";
  }

  if (nextComparable < beforeComparable) {
    container.classList.add("reducted");
    return "down";
  }

  if (zeroAsHidden && nextComparable <= 0 && container.dataset.statCursed !== 'true'
    && !ZERO_VALUE_VISIBLE_STAT_KEYS.has(normalizeStatKey(container.dataset.stat))) {
    container.classList.add("zero");
    container.classList.remove("last");
  }

  return null;
}


export function clearEntityStatDeltaClasses(entityId, root = document) {
  if (!entityId) return;
  const scope = root?.querySelectorAll ? root : document;
  const escapedEntityId = cssEscapeValue(entityId);

  scope
    .querySelectorAll(
      `.stat-container[data-entity-id="${escapedEntityId}"], ` +
      `.codex-profile-battle-stat[data-entity-id="${escapedEntityId}"], ` +
      `.codex-profile-umbra-stat[data-entity-id="${escapedEntityId}"]`
    )
    .forEach((container) => {
      if (container.dataset.codexDynamicStat === "true") {
        const valueEl = container.querySelector(".entite-stat:not(.preview)");
        const currentValue = Number(
          String(valueEl?.textContent || "0")
            .replace(",", ".")
            .replace(/[^0-9.\-]/g, "")
        ) || 0;

        if (currentValue <= 0 && container.dataset.statCursed !== 'true') {
          container.remove();
          return;
        }
      }

      container.classList.remove("upgraded", "reducted", "new");
      container.removeAttribute("upgraded");
      delete container.dataset.previewDelta;
      container
        .querySelectorAll(".entite-stat:not(.preview)")
        .forEach(el => el.classList.remove("new-stat", "stat-new"));
    });
}


export function updateStatsInDOM(statsObject, baseStats = {}, entityContext = null, options = {}) {
  const entityId = baseStats.id || statsObject.id || statsObject.entityId;
  if (!entityId) return;

  const renderedBefore = options.renderedBefore || getRenderedStatContainersForEntity(entityId);
  clearEntityStatDeltaClasses(entityId);

  const liveEntity = entityContext || getLiveEntityForStatSync(entityId) || { id: entityId };
  const nextStatsSnapshot = { ...baseStats };
  for (const [stat, payload] of Object.entries(statsObject || {})) {
    const statKey = normalizeStatKey(stat);
    if (!statKey || statKey === "id" || statKey === "entityId") continue;
    nextStatsSnapshot[statKey] =
      (typeof payload === "object" && payload !== null && "value" in payload)
        ? payload.value
        : payload;
  }
  const beforeEntity = buildStatsSnapshotEntity(liveEntity, baseStats, entityId);
  const afterEntity = entityContext || buildStatsSnapshotEntity(liveEntity, nextStatsSnapshot, entityId);

  document.querySelectorAll(`.stat-container[data-entity-id="${cssEscapeValue(entityId)}"][data-stat]`)
    .forEach(container => syncStatCurseMarker(container, afterEntity, container.dataset.stat));
  document.querySelectorAll(`[data-attribute-helper][data-entity-id="${cssEscapeValue(entityId)}"]`)
    .forEach(container => bindHelperEntity(container, afterEntity));

  const getDomStatKeys = (stat) => {
    const raw = String(stat || "");
    const canonical = normalizeStatKey(raw);
    const display = getDisplayStatKey(canonical);
    return [...new Set([raw, canonical, display].filter(Boolean))];
  };

  const qAll = (stat, { preview = false } = {}) => {
    const selectors = getDomStatKeys(stat).map((key) => {
      const statSelector = cssEscapeValue(key);
      const entitySelector = cssEscapeValue(entityId);
      return preview
        ? `.entite-stat.preview[data-stat="${statSelector}"][data-entity-id="${entitySelector}"]`
        : `.entite-stat[data-stat="${statSelector}"][data-entity-id="${entitySelector}"]:not(.preview)`;
    });

    return Array.from(document.querySelectorAll(selectors.join(","))).filter(el =>
      !el.closest(".Game-helper, .shop-item-card, .item-description-card, .item-stats-block")
    );
  };

  // 🔹 fonction utilitaire : gérer le "last"
  const setLastUpgraded = (containers) => {
    if (!Array.isArray(containers)) containers = [containers];

    // wipe tous les "last" avant
    const allStats = document.querySelectorAll(`.entite-stat[data-entity-id="${entityId}"]`);
    allStats.forEach((el) => {
      const c = containerOf(el);
      if (c) c.classList.remove("last");
    });

    // puis marquer tous les containers donnés
    containers.forEach(c => {
      if (c) c.classList.add("last");
    });
  };

  const shouldMarkNew = (container, requested = false) =>
    Boolean(requested && shouldMarkExistingContainerAsNew(renderedBefore, container));

  for (const [stat, payload] of Object.entries(statsObject)) {
    const value = (typeof payload === "object" && "value" in payload) ? payload.value : payload;
    const isNew = (typeof payload === "object" && payload.isNew);

    // --- VITALITY → met à jour HP.max ---
if (stat === "vitality") {
  const vitEls = Array.from(qAll("vitality"));
  const upgradedContainers = [];

  vitEls.forEach((vitEl) => {
    const vitC = containerOf(vitEl);
    if (!vitC) return;

    if (shouldRemoveFinalZeroStatContainer(vitC, stat, value, baseStats.vitality)) {
      vitC.remove();
      return;
    }

    vitEl.textContent = value;
    const direction = applyStatDeltaClass(
      vitC,
      value,
      baseStats.vitality,
      { isNew: shouldMarkNew(vitC, isNew) }
    );
    if (direction === "up") upgradedContainers.push(vitC);
  });

  if (upgradedContainers.length) {
    setLastUpgraded(upgradedContainers);
  }

  continue;
}
    // --- HP normal ---
// --- HP permanent (NE DOIT PAS écraser la preview) ---
if (stat === 'HP' && typeof value === 'object') {
  ensureHPDom(entityId);

  const els = qAll('HP'); // ✅ uniquement non-preview
  if (!els.length) continue;

  const baseMax =
    typeof baseStats.HP === 'object'
      ? (baseStats.HP.max ?? 0)
      : (baseStats.HP ?? 0);

  // 1) Texte permanent
  els.forEach((el) => {
    el.textContent = `${value.current} / ${value.max}`;

    const c = containerOf(el);
    if (!c) return;

    const direction = applyStatDeltaClass(
      c,
      value,
      { current: baseMax, max: baseMax },
      { isNew: shouldMarkNew(c, isNew) }
    );
    if (direction === "up") setLastUpgraded(c);
  });

  // 2) Barres HP/armure (permanent)
  const armorCur = (typeof baseStats.armor === "object")
    ? (baseStats.armor.current ?? 0)
    : (baseStats.armor ?? 0);

  const armorMax = (typeof baseStats.armor === "object")
    ? (baseStats.armor.max ?? 0)
    : (baseStats.armor ?? 0);

  updateHealthBar(value.current, value.max, armorCur, armorMax, entityId, value.uncorruptedMax || 0);
  updateHPCounters(entityId, value.current, value.max);
  continue;
}

if (stat === "armor" && value && typeof value === "object") {
  const els = qAll("armor");
  const armorMax = Number(value.max ?? value.current ?? 0) || 0;
  const baseArmorMax = getSnapshotComparableValue(baseStats, "armor", 0);

  els.forEach((armorEl) => {
    armorEl.textContent = String(armorMax);

    const armorContainer = containerOf(armorEl);
    if (!armorContainer) return;

    const direction = applyStatDeltaClass(
      armorContainer,
      { current: armorMax, max: armorMax },
      { current: baseArmorMax, max: baseArmorMax },
      { isNew: shouldMarkNew(armorContainer, isNew) }
    );

    if (direction === "up") {
      setLastUpgraded(armorContainer);
    }
  });

  continue;
}

if (
  (stat === "extraLife" || stat === "shift") &&
  value &&
  typeof value === "object"
) {
  const els = qAll(stat);
  const current = Number(value.current ?? 0) || 0;
  const max = Number(value.max ?? value.current ?? 0) || 0;
  const upgradedContainers = [];

  els.forEach((el) => {
    if (stat === 'shift') renderMovementCounter(el, { ...afterEntity, stats: { ...afterEntity.stats, shift: value } });
    else el.textContent = max > 0 ? `${current} / ${max}` : String(current);
    const c = containerOf(el);
    const direction = applyStatDeltaClass(c, value, baseStats[stat], {
      isNew: shouldMarkNew(c, isNew),
    });
    if (direction === "up" && c) upgradedContainers.push(c);
  });

  if (upgradedContainers.length) {
    setLastUpgraded(upgradedContainers);
  }

  continue;
}

    // --- autres stats ---
    const oldValueForStat = getStatSnapshotValue(baseStats, stat, 0);
    const dynamicComparable = getStatComparableValue(value, 0);
    const dynamicBaseComparable = getStatComparableValue(oldValueForStat, 0);

    if (
      STATS_PANEL_DYNAMIC_ROWS[normalizeStatKey(stat)] &&
      !findStatsPanelDynamicRow(entityId, stat) &&
      (dynamicComparable > 0 || dynamicBaseComparable > 0)
    ) {
      createStatsPanelDynamicRow({
        entityId,
        stat,
        value,
        payload,
        beforeValue: oldValueForStat,
        entityContext,
      });
    }

    const els = Array.from(qAll(stat));
    if (!els.length) {
      const createdDynamicRow = createMissingStatsPanelStatRow({
        entityId,
        stat,
        value,
        payload,
        entityContext,
      });

      if (createdDynamicRow) {
        continue;
      }
      continue;
    }

    if (stat === 'velocity') {
      const baseSpeed = baseStats.speed ?? 1000;
      const { adjustedSpeed } = calculateVelocityReduction(value, baseSpeed);

      const upgradedContainers = [];
      const velocityEls = Array.from(qAll("velocity"));
      velocityEls.forEach((velEl) => {
        const velC = containerOf(velEl);
        if (!velC) return;

        if (shouldRemoveFinalZeroStatContainer(velC, stat, value, baseStats.velocity)) {
          velC.remove();
          return;
        }

        velEl.textContent = value;
        const direction = applyStatDeltaClass(
          velC,
          value,
          baseStats.velocity,
          { isNew: shouldMarkNew(velC, isNew) }
        );
        if (direction === "up") upgradedContainers.push(velC);
      });

      const speedEls = Array.from(qAll('speed'));
      speedEls.forEach((speedEl) => {
        const spdC = containerOf(speedEl);
        if (!spdC) return;

        const sec = (Number(adjustedSpeed ?? 0) / 1000).toFixed(1);
		speedEl.textContent = `${sec} s`;
        const direction = applyStatDeltaClass(
          spdC,
          adjustedSpeed,
          baseSpeed,
          { isNew: false }
        );

        if (direction === "up") {
          upgradedContainers.push(spdC);
        }
      });

      if (upgradedContainers.length) {
        setLastUpgraded(upgradedContainers);
      }

      continue;
    }

    if (stat === 'speed') {
      const upgradedContainers = [];
      const speedEls = Array.from(qAll("speed"));
      const nextSpeed = Number(value ?? 0) || 0;
      const baseSpeed = getSnapshotComparableValue(baseStats, "speed", 0);

      speedEls.forEach((speedEl) => {
        const spdC = containerOf(speedEl);
        if (!spdC) return;

        speedEl.textContent = `${(nextSpeed / 1000).toFixed(2)} s`;
        const direction = applyStatDeltaClass(
          spdC,
          nextSpeed,
          baseSpeed,
          { isNew: shouldMarkNew(spdC, isNew) }
        );
        if (direction === "up") upgradedContainers.push(spdC);
      });

      if (upgradedContainers.length) {
        setLastUpgraded(upgradedContainers);
      }

      continue;
    }

    // cas générique
    const comparison = getPayloadStatDeltaComparison(payload, value, oldValueForStat);
    const dynamicRowConfig = STATS_PANEL_DYNAMIC_ROWS[normalizeStatKey(stat)];
    const upgradedContainers = [];

    els.forEach((el) => {
      const c = containerOf(el);
      const usesSyncedCalculator = Boolean(c?.dataset?.calculatorName || c?.dataset?.valueTemplate);
      let nextForClass = comparison.next;
      let beforeForClass = comparison.before;

      if (usesSyncedCalculator) {
        const resolvedNext = resolveStatContainerValue(c, afterEntity, stat, value);
        const resolvedBefore = resolveStatContainerValue(c, beforeEntity, stat, oldValueForStat);
        el.innerHTML = resolvedNext.html;
        nextForClass = payload?.visualAfter ?? resolvedNext.value;
        beforeForClass = payload?.visualBefore ?? resolvedBefore.value;
      } else if (dynamicRowConfig && el.closest(".stat-section-codex")) {
        el.innerHTML = formatStatsPanelDynamicValue(dynamicRowConfig, value);
      } else {
        el.textContent = value;
      }

      if (!c) return;

      if (shouldRemoveFinalZeroStatContainer(c, stat, nextForClass, beforeForClass)) {
        c.remove();
        return;
      }

      if (getStatComparableValue(nextForClass, 0) <= 0) {
        applyStatDeltaClass(c, nextForClass, beforeForClass, {
          isNew: shouldMarkNew(c, isNew),
        });
      } else {
        c.classList.remove("last");
        const direction = applyStatDeltaClass(c, nextForClass, beforeForClass, {
          isNew: shouldMarkNew(c, isNew),
        });
        if (direction === "up") upgradedContainers.push(c);
      }
    });

    if (upgradedContainers.length) {
      setLastUpgraded(upgradedContainers);
    }
  }
}


function syncEntityResourceCounters(entityId, stats, entityContext = null) {
  if (!entityId || !stats) return;

  const hp = stats.HP;
  const armor = stats.armor;
  const currentHP = Number(hp?.current ?? 0) || 0;
  const maxHP = Number(hp?.max ?? 0) || 0;
  const currentArmor = Number(armor?.current ?? 0) || 0;
  const maxArmor = Number(armor?.max ?? 0) || 0;
  const entity = { id: entityId, stats };

  if (hp && typeof hp === "object") {
    updateHealthBar(currentHP, maxHP, currentArmor, maxArmor, entityId, hp.uncorruptedMax || 0);
    updateHPCounters(entityId, currentHP, maxHP);
  }

  updateArmorCounter(entity);
  updateBonusLifeCounters(entity);
  updateMovementDisplay({ ...(entityContext || getLiveEntityForStatSync(entityId)), ...entity }, { animate: false });
}


export function syncDOMWithStats(oldStats = {}, newStats = {}, entityId, entityContext = null, options = {}) {
  if (!entityId) return;

  const renderedBefore = options.renderedBefore || getRenderedStatContainersForEntity(entityId);
  const changedStats = {};
  const allKeys = new Set([...Object.keys(oldStats), ...Object.keys(newStats)]);

  for (const stat of allKeys) {
    const oldVal = oldStats[stat];
    const newVal = (newStats[stat] !== undefined) ? newStats[stat] : 0;

    if (isStatsSnapshotDifferent(oldVal, newVal)) {
      changedStats[stat] = {
        value: newVal,
        isNew: false
      };
    }
  }

  addRenderedStatImpactDiffs(changedStats, oldStats, newStats, entityId, entityContext, options);
  addStatsPanelDynamicDiffs(changedStats, oldStats, newStats, entityId, entityContext, options);

  // ✅ IMPORTANT : si velocity change, on force aussi la MAJ de speed
  // (sinon ton DOM peut garder une speed obsolète)
  if ("velocity" in changedStats) {
    if (newStats.speed !== undefined) {
      changedStats.speed = {
        value: newStats.speed,
        isNew: false
      };
    }
  }

  updateStatsInDOM(changedStats, { id: entityId, ...oldStats }, entityContext, { renderedBefore });
  syncStatsPanelDynamicRows(entityId, oldStats, newStats, entityContext, changedStats, renderedBefore, options);
  syncEntityResourceCounters(entityId, newStats, entityContext);
  const currentEntity = entityContext || getLiveEntityForStatSync(entityId);
  document.querySelectorAll('.level-up-section').forEach(section => section._refreshStats?.(currentEntity));
  document.querySelectorAll(`.attack-submenu-infos[data-entity-id="${cssEscapeValue(entityId)}"]`)
    .forEach(section => section._refreshStats?.(currentEntity || { id: entityId, stats: newStats }));
  if (typeof window !== "undefined" && typeof window.refreshCodexUmbraPanel === "function") {
    window.refreshCodexUmbraPanel(
      entityContext || { id: entityId, stats: newStats },
      { oldStats, newStats, changedStats }
    );
  }
  localStorage.setItem("entityStats", JSON.stringify(newStats));
  return changedStats; // optionnel, mais pratique en debug
}


function ensureStatNodes(entiteId, key, rootEl) {
  // rootEl doit être un ELEMENT, pas document
  let container = rootEl;

  // Fallbacks intelligents si rootEl non fourni ou invalide
  if (!container || container.nodeType !== 1) {
    // Essaye de trouver un container dédié à l’entité
    container = document.querySelector(`.entity-stats-section[data-entity-id="${entiteId}"]`)
             || document.querySelector(`#stats-${entiteId}`)
             || document.body; // dernier recours, mais ÉVITE si possible
  }

  // Recherche dans le container
  let perm = container.querySelector(`.entite-stat[data-entity-id="${entiteId}"][data-stat="${key}"]:not(.preview)`);
  let prev = container.querySelector(`.entite-stat.preview[data-entity-id="${entiteId}"][data-stat="${key}"]`);

  // Crée le permanent si absent
  if (!perm) {
    perm = document.createElement('div');
    perm.className = 'entite-stat';
    perm.dataset.entityId = String(entiteId);
    perm.dataset.stat = key;
    container.insertAdjacentElement('beforeend', perm);
  }

  // Crée le preview si absent (juste après le perm)
  if (!prev) {
    prev = document.createElement('div');
    prev.className = 'entite-stat preview is-hidden';
    prev.dataset.entityId = String(entiteId);
    prev.dataset.stat = key;
    perm.insertAdjacentElement('afterend', prev);
  }

  return { perm, prev };
}


function formatProgressionStatValue(v) {
  if (isObjStat(v)) return `${Number(v.current ?? 0)} / ${Number(v.max ?? 0)}`;
  return String(v ?? "");
}


export function isLevelUpNewStatsArea(container) {
  return !!container?.closest?.(
    ".level-up-section, .umbra-submenu.new.entity-stats-section"
  );
}


export function renderStatPair(entite, key, rootEl) {
  const { perm, prev } = ensureStatNodes(entite.id, key, rootEl);

  const permStats = getPermStats(entite);
  const prevStats = getPreviewStats(entite);

  const statContainer = containerOf(perm);
  syncStatCurseMarker(statContainer, entite, key);
  const usesSyncedCalculator = Boolean(
    statContainer?.dataset?.calculatorName ||
    statContainer?.dataset?.valueTemplate
  );

  let permVal = getStatSnapshotValue(permStats, key, undefined);
  let prevVal = getStatSnapshotValue(prevStats, key, undefined);
  let permHtml = null;
  let prevHtml = null;

  if (usesSyncedCalculator) {
    const permEntity = buildStatsSnapshotEntity(entite, permStats, entite.id);
    const prevEntity = buildStatsSnapshotEntity(entite, prevStats, entite.id);
    const resolvedPerm = resolveStatContainerValue(statContainer, permEntity, key, permVal);
    const resolvedPrev = resolveStatContainerValue(statContainer, prevEntity, key, prevVal);

    permVal = resolvedPerm.value;
    prevVal = resolvedPrev.value;
    permHtml = resolvedPerm.html;
    prevHtml = resolvedPrev.html;
  }

  const isObj = (v) => v && typeof v === "object" && ("current" in v || "max" in v);

  const toMs = (v) => {
    if (v == null) return 0;
    if (typeof v === "number") return v;
    // tolère "2426 ms", "2.4 s", etc.
    return parseFloat(String(v).replace(",", ".")) || 0;
  };

  const isZero = (v) => {
    if (isObj(v)) return Number(v.current ?? 0) <= 0 && Number(v.max ?? 0) <= 0;
    return v == null || Number(v) <= 0;
  };

  const hasPreview =
    !!entite?.modifierStats?.preview?.statLeveled &&
    Object.keys(entite.modifierStats.preview.statLeveled).length > 0;

  // ✅ SPEED: comparaison sur la valeur BRUTE (ms), pas sur le texte formaté
  const permMs = key === "speed" ? toMs(permVal) : null;
  const prevMs = key === "speed" ? toMs(prevVal) : null;
const SPEED_DISPLAY_STEP_MS = 10; // 0.01 s = 10 ms (car toFixed(2))
const speedHasDelta =
  key === "speed" &&
  hasPreview &&
  Math.round(permMs / SPEED_DISPLAY_STEP_MS) !== Math.round(prevMs / SPEED_DISPLAY_STEP_MS);
  // ✅ affichage "MAX only" pour HP + armor (+ speed en secondes)
  const fmtKey = (v) => {
   if ((key === "HP" || key === "armor" || key === "extraLife") && isObj(v)) {
      return String(Number(v.max ?? 0));
    }
if (key === "speed") {
  const ms = toMs(v);
  return `${(ms / 1000).toFixed(2)} s`; // ✅ visuel uniquement
}
    return formatProgressionStatValue(v);
  };

  const showPrev = hasPreview && (
    usesSyncedCalculator
      ? getStatComparableValue(prevVal, 0) !== getStatComparableValue(permVal, 0)
      : key === "speed"
        ? speedHasDelta
        : fmtKey(prevVal) !== fmtKey(permVal)
  );

  const isNew =
    showPrev &&
    statContainer?.dataset?.statLineCreatedAsNew === "preview" &&
    !isZero(prevVal);
  const setPreviewDeltaState = (container, up, down) => {
    if (!container) return;

    if (up || down) {
      container.dataset.previewDelta = up ? "up" : "down";
      container.classList.remove("zero");
      container.removeAttribute("upgraded");
      container.classList.toggle("upgraded", up);
      container.classList.toggle("reducted", down);
      return;
    }

    container.classList.remove("upgraded", "reducted");
    container.removeAttribute("upgraded");
    delete container.dataset.previewDelta;
  };

  const comparableValue = (v) => {
    return getStatComparableValue(v, 0);
  };

  if (statContainer && isLevelUpNewStatsArea(statContainer)) {
    statContainer.classList.toggle("new", isNew);
  }

  // ✅ ARMOR: suppression si 0/0 sans preview
if (key === "armor" || key === "extraLife" || key === "charge") {
  const container =
    containerOf(perm) ||
    document.querySelector(`.stat-container[data-stat="${key}"][data-entity-id="${entite.id}"]`);

  if (!showPrev && isZero(permVal) && !getStatMalusSources(entite, key).length) {
    if (container) container.remove();
    return;
  }
}

  // ✅ upgraded/reducted sur container pour HP/armor
if (key === "HP" || key === "armor" || key === "extraLife" || key === "charge") {
  const container = containerOf(perm);
  if (container) {
    const permMax = isObj(permVal) ? Number(permVal.max ?? 0) : Number(permVal ?? 0);
    const prevMax = isObj(prevVal) ? Number(prevVal.max ?? 0) : Number(prevVal ?? 0);

    const up = showPrev && prevMax > permMax;
    const down = showPrev && prevMax < permMax;

    setPreviewDeltaState(container, up, down);
  }
}


  // SPEED : la classe reflète la variation numérique brute.
  if (key === "speed") {
    const container = containerOf(perm);
    if (container) {
      const p = permMs;
      const n = prevMs;

      const up   = showPrev && n > p;
      const down = showPrev && n < p;

      setPreviewDeltaState(container, up, down);
    }
  }
  if (key === "dayHpRegen") {
    const container = containerOf(perm);
    if (container) {
      const p = Number(permVal ?? 0) || 0;
      const n = Number(prevVal ?? 0) || 0;

      const up   = showPrev && n > p;
      const down = showPrev && n < p;

      setPreviewDeltaState(container, up, down);
    }
  }

  if (!["HP", "armor", "extraLife", "charge", "speed", "dayHpRegen"].includes(key)) {
    const p = comparableValue(permVal);
    const n = comparableValue(prevVal);

    setPreviewDeltaState(
      statContainer,
      showPrev && n > p,
      showPrev && n < p
    );
  }

  // Helpers resolve the active draft on hover. Do not build every closed tooltip
  // for each point spent, or retain text from a previous preview.
  if (statContainer) delete statContainer.dataset.helperText;

  // 1) Permanent
  if (isNew) {
    perm.classList.add("stat-new", "new-stat");
    perm.textContent = "";
  } else {
    perm.classList.remove("stat-new", "new-stat");
    if (permHtml != null) {
      if (perm.innerHTML !== permHtml) perm.innerHTML = permHtml;
    } else {
      const permTxt = fmtKey(permVal);
      if (perm.textContent !== permTxt) perm.textContent = permTxt;
    }
  }

  // 2) Preview
  if (showPrev) {
    if (prevHtml != null) {
      if (prev.innerHTML !== prevHtml) prev.innerHTML = prevHtml;
    } else {
      const prevTxt = fmtKey(prevVal);
      if (prev.textContent !== prevTxt) prev.textContent = prevTxt;
    }
    prev.classList.remove("is-hidden");
  } else {
    prev.classList.add("is-hidden");
  }
  if (key === 'shift') {
    if (!isNew && isObj(permVal)) renderMovementCounter(perm, buildStatsSnapshotEntity(entite, permStats, entite.id));
    if (showPrev && isObj(prevVal)) renderMovementCounter(prev, buildStatsSnapshotEntity(entite, prevStats, entite.id));
  }
}


export function renderAllStats(entite, rootEl) {
  const perm = getPermStats(entite);
  for (const key of Object.keys(perm)) {
    renderStatPair(entite, key, rootEl);
  }
}


function findEntityStatContainer(entityId, stat, root = document) {
  if (!entityId || !root?.querySelectorAll) return null;

  const statKey = normalizeStatKey(stat);
  const escapedEntityId = cssEscapeValue(entityId);

  return Array.from(
    root.querySelectorAll(`.stat-container[data-entity-id="${escapedEntityId}"][data-stat]`)
  ).find(block => normalizeStatKey(block?.dataset?.stat) === statKey) || null;
}


function getPreviewNewStatsParent(entite, root = document) {
  if (!entite?.id) return null;
  const escapedEntityId = cssEscapeValue(entite.id);
  const scoped =
    root?.querySelector?.(`#codex-entity_${escapedEntityId} .umbra-submenu.new.entity-stats-section`) ||
    root?.closest?.(".umbra-submenu.new.entity-stats-section");
  if (scoped) return scoped;

  return (
    document.querySelector(`#codex-entity_${escapedEntityId} .umbra-submenu.new.entity-stats-section`) ||
    document.querySelector(".umbra-submenu.new.entity-stats-section")
  );
}


function configureSyncedStatContainer(block, stat, config) {
  if (!block || !config) return;

  const statKey = normalizeStatKey(stat);
  const displayStatKey = getStatsPanelDynamicDisplayStat(statKey, config);

  block.dataset.stat = displayStatKey;
  block.dataset.sourceStat = getStatsPanelDynamicSourceStat(statKey, config);
  if (config.originStat) block.dataset.originStat = normalizeStatKey(config.originStat);
  if (config.calculatorName) block.dataset.calculatorName = config.calculatorName;
  if (config.valueTemplate) block.dataset.valueTemplate = config.valueTemplate;

  block
    .querySelectorAll(".entite-stat")
    .forEach(el => {
      el.dataset.stat = displayStatKey;
      el.dataset.hover = "true";
    });
}


function createPreviewStatBlock(parent, entite, stat, value, {
  forceNew = false,
  syncedConfig = null,
} = {}) {
  if (!parent || !entite?.id) return null;

  const statKey = normalizeStatKey(stat);
  const displayStatKey = syncedConfig
    ? getStatsPanelDynamicDisplayStat(statKey, syncedConfig)
    : getDisplayStatKey(statKey);
  const def = findStatsDefinition(displayStatKey);
  if (!def && !syncedConfig) return null;

  const existing = findEntityStatContainer(entite.id, displayStatKey, parent);
  if (existing) {
    configureSyncedStatContainer(existing, statKey, syncedConfig);
    renderStatPair(entite, displayStatKey, parent);
    return existing;
  }

  createUmbraBlock(
    parent,
    def?.name || syncedConfig?.label || displayStatKey,
    () => value,
    entite,
    displayStatKey,
    false,
    null,
    def?.nature === "umbra",
    { showMissingAsNew: true, forceNew, newLineContext: "preview" }
  );

  const block = findEntityStatContainer(entite.id, displayStatKey, parent);
  if (block && forceNew) block.dataset.statLineCreatedAsNew = "preview";
  configureSyncedStatContainer(block, statKey, syncedConfig);
  renderStatPair(entite, displayStatKey, parent);
  return block;
}


function syncPreviewIntroducedRows(entite, total, root = document) {
  if (!entite?.id || !total) return;

  const parent = getPreviewNewStatsParent(entite, root);
  if (!parent) return;

  const beforeEntity = buildStatsSnapshotEntity(entite, entite.stats || {}, entite.id);
  const afterEntity = buildStatsSnapshotEntity(entite, total, entite.id);

  parent
    .querySelectorAll(`.stat-container[data-entity-id="${cssEscapeValue(entite.id)}"][data-stat]`)
    .forEach((block) => {
      const statKey = normalizeStatKey(block.dataset.stat);
      const config = getStatsPanelDynamicConfig(statKey);
      const beforeValue = config
        ? getStatsPanelDynamicValue(statKey, config, beforeEntity, getStatSnapshotValue(entite.stats, statKey, 0))
        : getStatSnapshotValue(entite.stats, statKey, 0);
      const nextValue = config
        ? getStatsPanelDynamicValue(statKey, config, afterEntity, getStatSnapshotValue(total, statKey, 0))
        : getStatSnapshotValue(total, statKey, 0);
      const beforeComparable = getStatComparableValue(beforeValue, 0);
      const nextComparable = getStatComparableValue(nextValue, 0);

      // Bind the actual draft, not a snapshot mistaken for an external update.
      // The helper resolver already reads its preview totals.
      syncStatCurseMarker(block, entite, statKey);
      if (beforeComparable <= 0 && nextComparable <= 0
        && !ZERO_VALUE_VISIBLE_STAT_KEYS.has(statKey) && block.dataset.statCursed !== 'true') {
        block.remove();
      }
    });

  for (const [key, value] of Object.entries(total)) {
    const statKey = normalizeStatKey(key);
    if (
      !statKey ||
      ["strength", "agility", "intelligence"].includes(statKey) ||
      DOM_NON_STAT_KEYS.has(statKey)
    ) continue;
    const def = findStatsDefinition(statKey);
    if (!def) continue;

    const beforeValue = getStatSnapshotValue(entite.stats, statKey, 0);
    const beforeComparable = getStatComparableValue(beforeValue, 0);
    const nextComparable = getStatComparableValue(value, 0);
    const existing = findEntityStatContainer(entite.id, statKey, parent);

    if (getStatMalusSources(afterEntity, statKey).length || (nextComparable > 0 && (beforeComparable <= 0 || existing))) {
      createPreviewStatBlock(parent, entite, statKey, beforeValue, {
        forceNew: beforeComparable <= 0 && nextComparable > 0,
      });
    } else if (existing && beforeComparable <= 0 && nextComparable <= 0) {
      existing.remove();
    }
  }

  for (const [statKey, config] of Object.entries(STATS_PANEL_DYNAMIC_ROWS)) {
    const displayStatKey = getStatsPanelDynamicDisplayStat(statKey, config);
    const beforeFallback = getStatSnapshotValue(entite.stats, statKey, 0);
    const nextFallback = getStatSnapshotValue(total, statKey, 0);
    const beforeValue = getStatsPanelDynamicValue(statKey, config, beforeEntity, beforeFallback);
    const nextValue = getStatsPanelDynamicValue(statKey, config, afterEntity, nextFallback);
    const beforeComparable = getStatComparableValue(beforeValue, 0);
    const nextComparable = getStatComparableValue(nextValue, 0);
    const existing = findEntityStatContainer(entite.id, displayStatKey, parent);

    if (getStatMalusSources(afterEntity, statKey).length || (nextComparable > 0 && (beforeComparable <= 0 || existing))) {
      createPreviewStatBlock(parent, entite, statKey, beforeValue, {
        forceNew: beforeComparable <= 0 && nextComparable > 0,
        syncedConfig: config,
      });
    } else if (existing && beforeComparable <= 0 && nextComparable <= 0) {
      existing.remove();
    }
  }
}


export function refreshActiveStatPreview(entite, rootEl = document, { recalculate = true } = {}) {
  if (!entite?.id || !entite?.stats) {
    return null;
  }

  const total = !recalculate && entite.modifierStats?.preview?.total || ComputeStatPreview(entite);
  const root = rootEl?.querySelectorAll ? rootEl : document;
  const escape = (value) =>
    globalThis.CSS?.escape
      ? CSS.escape(String(value))
      : String(value).replace(/["\\]/g, "\\$&");

  root
    .querySelectorAll(`.stat-container[data-entity-id="${escape(entite.id)}"][data-stat]`)
    .forEach((block) => {
      const key = block.dataset.stat;
      if (!key) return;

      renderStatPair(entite, key, block);
    });

  syncPreviewIntroducedRows(entite, total, root);

  return total;
}
