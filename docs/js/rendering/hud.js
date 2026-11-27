import { setDisplayStyle as setTimerStyle, setDisplayText as setTimerText, setDisplayClass as setTimerClass, toggleDisplayClass as toggleTimerClass, setDOMAttribute, setDOMText, replaceDOMClassGroup } from "./displayBatch.js";
import { readTimerDisplayState } from "../combat/timerState.js";
import { getOpenViewRoots } from '../ui/viewRoots.js';
import { getStatSystemResult } from "../entities/statSystem.js";
import { getEquipmentResourceCurrent } from "../items/resourceStocks.js";
import { showDamagePopup } from "./popups.js";
import { setTimeout } from "../combat/clock.js";
import { entites } from "../entities/runtime.js";
import { attackDetails } from "../data/attackList.js";
import { gameStarted } from "../app/state.js";
import { EffectMessage } from "../combat/effects.js";
import {
  isNonLordCombatant, getBattleEntityElement, getSafe,
} from "../entities/rules.js";
import {
  subscribeAttackSelection, readEntityCombatProfile, resolveAttackDefinitionForEntity, resolveEntityAttackDisplayName
} from "../combat/attackResolution.js";
import { getEntityCombatDetails } from "../storage/entityStorage.js";
import { acceptsSelectedTarget } from "../combat/targeting.js";
import { AttackerSbireTargetPriority, AllySbireTargetPriority } from "../combat/roles.js";
import { calculateHexes } from "../board/controller.js";

export { DRAG_HELPER_CLEANUP_EVENT, isDragDropActive, clearDragTransientHelpers, beginDragHelperCleanup, endDragHelperCleanup, bindDragHelperCleanupGuards } from "../ui/drag.js";

// Combat HUD and entity counters.
// TIMERS ENTITES
const attackTimerViews = new WeakMap();
let timerNodes = new WeakMap();
function timerNode(entity, id) {
  let nodes = timerNodes.get(entity);
  if (!nodes) timerNodes.set(entity, nodes = new Map());
  const node = nodes.get(id);
  // Editor rebuilds, revival and F5 can replace the whole entity DOM.
  if (node?.isConnected && node.id === id && node.ownerDocument === document) return node;
  const current = document.getElementById(id);
  if (current) nodes.set(id, current);
  else nodes.delete(id);
  return current;
}
export function updateTimerDisplay(entite, timerView = readTimerDisplayState(entite)) {
  if (timerView.skip) return;
  const hudNode = id => timerNode(entite, id);
  if (timerView.search) {
    const recovering = timerView.recovering;
    const percent = timerView.atbPercent;
    for (const prefix of ['atbFill_', 'HUATBfill_', 'scanATBFill_']) {
      const bar = hudNode(prefix + entite.id);
      setTimerStyle(bar, 'width', `${percent}%`);
    }
    const speed = hudNode(`SpeedInterface_${entite.id}`);
    toggleTimerClass(speed, 'preparation', false);
    toggleTimerClass(speed, 'execution', false);
    toggleTimerClass(speed, 'recuperation', recovering);
    const bar = hudNode(`currentAttackBar_${entite.id}`);
    if (bar) {
      setTimerStyle(bar, "width", '0%');
      setTimerClass(bar, 'attack-bar-fill empty');
    }
    return;
  }
  const updateElementTextContent = (elementId, text) => {
    const element = hudNode(elementId);
    setTimerText(element, text);
};
// ✅ Classes d'état sur la SpeedInterface : preparation / execution / recuperation
const speedInterface = hudNode(`SpeedInterface_${entite.id}`);
if (speedInterface) {
  const isPreparation = (Number(entite.preparationTime) || 0) > 0;
  const isExecution = (Number(entite.executionTime) || 0) > 0;
  const isRecuperation = (Number(entite.recoveryTime) || 0) > 0 && !isExecution;

  toggleTimerClass(speedInterface, "preparation", isPreparation);
  toggleTimerClass(speedInterface, "execution", isExecution);
  toggleTimerClass(speedInterface, "recuperation", isRecuperation);
}
    const updateATBFill = (percent) => {
        const atbFillElement = hudNode(`atbFill_${entite.id}`);
        if (atbFillElement) {
            setTimerStyle(atbFillElement, "width", `${percent}%`);
        }
    };

    if (timerView.atbPercent !== null) updateATBFill(timerView.atbPercent);
    if (timerView.attackExecuted !== null) {
        toggleTimerClass(hudNode(`currentAttackImage_${entite.id}`), 'attack-executed', timerView.attackExecuted);
    }
    if (timerView.runaway) return;

// === 🟥 JAUGE ATTAQUE ===
const updateCurrentAttackBar = () => {
   const el = hudNode(`currentAttackBar_${entite.id}`);
    if (!el) return;

    if (!entite.currentAttack) return;

    const { preparationTime, executionTime, recoveryTime } = entite.currentAttack;

    // Préparation → remplissage jaune
if (entite.preparationTime > 0) {
  const percent = ((preparationTime - entite.preparationTime) / preparationTime) * 100;
  setTimerStyle(el, "width", `${Math.min(100, percent)}%`);
  setTimerClass(el, 'attack-bar-fill preparation');

  return;
}

// Exécution → full bar rouge
if (entite.executionTime > 0) {
    setTimerStyle(el, "width", '100%');
    setTimerClass(el, 'attack-bar-fill execution');

    const execTime = Number(entite.executionTime) || 0;
    const execMax = Number(entite.currentAttack?.executionTime) || 1;
    const ratio = Math.max(0, Math.min(1, execTime / execMax));
    const duration = 0.05 + (1.5 - 0.05) * ratio;
setTimerStyle(el, "animationDuration", `${duration}s`);

    return;
}
    //Récupération → vidange verte
    if (entite.recoveryTime > 0) {
		
        // const percent = (entite.recoveryTime / recoveryTime) * 100;
        // setTimerStyle(el, "width", `${Math.max(0, percent)}%`);
        setTimerClass(el, 'attack-bar-fill recovery');
        return;
    }

    // Par défaut (aucune phase en cours)
    setTimerStyle(el, "width", '0%');
    setTimerClass(el, 'attack-bar-fill empty');
};

    // === 🟨 AFFICHAGE DES TIMERS ===
  // Combat has already advanced before this read-only presentation call.
  // The isolated simulator does not need timer text or attack-name resolution.
  if (window.__combatSimulation === true) {
    updateCurrentAttackBar();
    return;
  }
  updateElementTextContent(`speedTimer_${entite.id}`, `ATB : ${isNaN(entite.speedTimer) ? "0.0" : (entite.speedTimer / 1000).toFixed(1)}s`);

const prepTime = isNaN(entite.preparationTime) ? 0 : (entite.preparationTime / 1000).toFixed(1);
const execTime = isNaN(entite.executionTime) ? 0 : (entite.executionTime / 1000).toFixed(1);
const attackDisplayName = resolveEntityAttackDisplayName(
  entite,
  entite.currentAttackId || entite.attacks?.[0],
  attackDetails
);

const battlePrepEl = hudNode(`battlePreparation_${entite.id}`);
if (battlePrepEl) {
  let view = attackTimerViews.get(battlePrepEl);
  if (!view || view.name.parentNode !== battlePrepEl || view.preparation.parentNode !== battlePrepEl || view.execution.parentNode !== battlePrepEl) {
    battlePrepEl.innerHTML = `
      <span class="timer-activeattack attackname"></span>
      <span class="timer-activeattack preparation" id="attackPrep_${entite.id}"></span>
      <span class="timer-activeattack execution" id="attackExec_${entite.id}" style="display: none;"></span>
    `;
    view = { name: battlePrepEl.querySelector('.attackname'), preparation: battlePrepEl.querySelector('.preparation'),
      execution: battlePrepEl.querySelector('.execution'), label: null };
    attackTimerViews.set(battlePrepEl, view);
  }
  if (view.label !== attackDisplayName) { view.name.innerHTML = attackDisplayName; view.label = attackDisplayName; }
  setTimerText(view.preparation, `${prepTime}s`);
  setTimerText(view.execution, `${execTime}s`);
}


const prepCurrent = isNaN(entite.preparationTime) ? 0 : (entite.preparationTime / 1000).toFixed(1);
const prepMax = entite.currentAttack?.preparationTime ? (entite.currentAttack.preparationTime / 1000).toFixed(1) : '0.0';
updateElementTextContent(`preparationTimer_${entite.id}`, `Preparation: ${prepCurrent} / ${prepMax}s`);

const execCurrent = isNaN(entite.executionTime) ? 0 : (entite.executionTime / 1000).toFixed(1);
const execMax = entite.currentAttack?.executionTime ? (entite.currentAttack.executionTime / 1000).toFixed(1) : '0.0';
updateElementTextContent(`executionTimer_${entite.id}`, `Execution: ${execCurrent} / ${execMax}s`);

const cooldownCurrent = isNaN(entite.cooldownTimer) ? 0 : (entite.cooldownTimer / 1000).toFixed(1);
const cooldownMax = entite.currentAttack?.cooldown ? (entite.currentAttack.cooldown / 1000).toFixed(1) : '0.0';
updateElementTextContent(`cooldownDisplay_${entite.id}`, `Cooldown: ${cooldownCurrent} / ${cooldownMax}s`);

const recoveryCurrent = isNaN(entite.recoveryTime) ? 0 : (entite.recoveryTime / 1000).toFixed(1);
const recoveryMax = entite.currentAttack?.recoveryTime ? (entite.currentAttack.recoveryTime / 1000).toFixed(1) : '0.0';
updateElementTextContent(`recoveryTimer_${entite.id}`, `Recovery: ${recoveryCurrent} / ${recoveryMax}s`);

	
updateCurrentAttackBar();


const prepSpan = hudNode(`attackPrep_${entite.id}`);
const execSpan = hudNode(`attackExec_${entite.id}`);

if (prepSpan && execSpan) {
  if (entite.preparationTime > 0) {
    setTimerStyle(prepSpan, "display", 'inline');
    setTimerStyle(execSpan, "display", 'none');
  } else if (entite.executionTime > 0) {
    setTimerStyle(prepSpan, "display", 'none');
    setTimerStyle(execSpan, "display", 'inline');
  } else {
    // si aucune des deux phases n'est active
    setTimerStyle(prepSpan, "display", 'none');
    setTimerStyle(execSpan, "display", 'none');
  }
}
}

const levelBattleStarts = new WeakMap();
const levelBattleDetailStarts = new WeakMap();
const battleTotalKeys = [
    "kills", "deaths", "resurrections", "overkills", "battlesFought",
    "extraLivesUsed", "totalDamage", "totalHeal"
];

export function resetLevelBattleStats(entities) {
    for (const entity of entities) {
        if (!entity) continue;
        levelBattleStarts.set(entity, Object.fromEntries(
            battleTotalKeys.map(key => [key, Math.max(0, Number(entity[key]) || 0)])));
        levelBattleDetailStarts.set(entity, structuredClone(getEntityCombatDetails(entity)));
    }
}

export function getLevelBattleStats(entity) {
    const start = levelBattleStarts.get(entity) || {};
    return Object.fromEntries(battleTotalKeys.map(key => [key,
        Math.max(0, (Number(entity?.[key]) || 0) - (start[key] || 0))]));
}

export function getLevelCombatDetails(entity) {
    const current = getEntityCombatDetails(entity);
    const start = levelBattleDetailStarts.get(entity) || {};
    const delta = (value, baseline) => typeof value === 'string' ? value : value && typeof value === 'object'
        ? Object.fromEntries(Object.entries(value).map(([key, part]) => [key, delta(part, baseline?.[key])]))
        : Math.max(0, (Number(value) || 0) - (Number(baseline) || 0));
    return delta(current, start);
}

function levelBattleValue(counterId, prefix, key, fallback) {
    const id = String(counterId).slice(prefix.length);
    const entity = entites.find(candidate => String(candidate.id) === id);
    return entity ? getLevelBattleStats(entity)[key] : Math.max(0, Number(fallback) || 0);
}

if (typeof window !== "undefined") {
    // Armies can outlive the level DOM. Do not retain its detached HUD through
    // an entity that remains in the player's roster after leaving a stage.
    for (const type of ['stageInterfaceClosing', 'battleStopped', 'battleResolved']) {
        window.addEventListener(type, () => { timerNodes = new WeakMap(); });
    }
    window.addEventListener("entityCombatStatsChanged", ({ detail }) => {
        const entity = detail?.entity;
        if (!entity) return;
        const values = getOpenViewRoots('levelBattleStats');
        if (!values.length) return;
        const levelStats = getLevelBattleStats(entity);
        values.forEach(value => {
            if (String(value.dataset.entityId) === String(entity.id)) {
                setTimerText(value, String(levelStats[value.dataset.levelBattleStat] ?? 0));
            }
        });
    });
}

// KILLS COUNTER
export function updateKillsCounter(killsCounterId, kills) {
    // Récupère l'élément du DOM basé sur l'ID fourni, qui devrait être de la forme "Kills_<sbireId>"
    const killsCounterElement = document.getElementById(killsCounterId);
    if (killsCounterElement) {
        // Vérifie si `kills` est `undefined` et utilise 0 comme valeur par défaut
        const killsDisplay = levelBattleValue(killsCounterId, "Kills_", "kills", kills);
        // Met à jour le contenu textuel de l'élément avec le nombre de kills ou 0 si `kills` est `undefined`.
        setTimerText(killsCounterElement, `Kills : ${killsDisplay}`);
    }
}

// TOTAL DAMAGES COUNTER
export function updateTotalDamageCounter(TotalDamageCounterId, totalDamage) {
    // Récupère l'élément du DOM basé sur l'ID fourni, qui devrait être de la forme "Kills_<sbireId>"
    const TotalDamageCounterElement = document.getElementById(TotalDamageCounterId);
    if (TotalDamageCounterElement) {
        // Vérifie si `kills` est `undefined` et utilise 0 comme valeur par défaut
        const TotalDamageCounterDisplay = levelBattleValue(TotalDamageCounterId, "TotalDamages_", "totalDamage", totalDamage);
        // Met à jour le contenu textuel de l'élément avec le nombre de kills ou 0 si `kills` est `undefined`.
        setTimerText(TotalDamageCounterElement, `Dégâts : ${TotalDamageCounterDisplay}`);
    }
}

// TOTAL HEAL COUNTER
export function updateTotalHealCounter(entityId, totalHeal) {
    // Construire l'ID basé sur l'ID de l'entité
    const totalHealCounterId = `TotalHeal_${entityId}`;

    // Récupérer l'élément du DOM
    const totalHealCounterElement = document.getElementById(totalHealCounterId);
    if (totalHealCounterElement) {
        // Mettre à jour le texte de l'élément avec le total des soins
        setTimerText(totalHealCounterElement, `Soins : ${levelBattleValue(totalHealCounterId, "TotalHeal_", "totalHeal", totalHeal)}`);
    } else {
        // console.error(`Élément avec l'ID ${totalHealCounterId} introuvable.`);
        return;
    }
}

// DOM TIMERS ATTAQUES
export function createAttackElementsForEntity(entites) {
    // Trouver l'élément conteneur où ajouter les attaques (par exemple, un élément avec l'ID de l'entité)
    const entityContainer = document.getElementById(`entiteDetailsContainer_${entites.id}`);
    if (!entityContainer) {
        console.error(`Conteneur pour l'entité ${entites.id} non trouvé.`);
        return;
    }
    entites.attacks.forEach(attackName => {
        const attackDetail = resolveAttackDefinitionForEntity(entites, attackName, attackDetails);
        if (!attackDetail) {
            console.error(`Détails non trouvés pour l'attaque ${attackName}.`);
            return;
        }

        // Vérifiez le contenu de attackDetail.attackTarget
        // console.log(`Cible de l'attaque ${attackDetail.functionName} : ${attackDetail.attackTarget}`);

        let attackDetailinfos;

        if (attackDetail.attackTarget.includes('ally')) {
            attackDetailinfos = 'Allié';
        } else if (attackDetail.attackTarget.includes('enemy')) {
            attackDetailinfos = 'Ennemi';
        } else if (attackDetail.attackTarget.includes('hexa')) {
            attackDetailinfos = 'Case';
        } else {
            attackDetailinfos = 'Inconnu';
        }

        // Vérifiez le contenu de deadTarget
        let deadTargetInfo = '';
        if (attackDetail.deadTarget && attackDetail.deadTarget.includes('yes')) {
            deadTargetInfo = ' mort';
        }

        // Créer un élément pour l'attaque
        const attackElement = document.createElement('div');
        attackElement.className = 'attack-details';
        attackElement.innerHTML = `
            <div class="attackElement-attaque" id='attackElement-attaque_${attackDetail.attackId}'>
                <div class="attackElement_partie-1">
                    <div class="attack-image-frame">
                        <img src='${attackDetail.attackAsset}' class="attackElement-asset-spell ${attackDetail.attackTarget} attack-image";>
                        <div class="picto-target-attack-detail ${attackDetail.attackTarget}"></div>
                    </div>
               </div> 
                <div class="attackElement_partie-2">
                    <p class="attackElement-timers">
                        <div class="attack-name-detail ${attackDetail.attackTarget.join(' ')}">${attackDetail.displayName}</div>
                        <i>Ciblage :<strong class="ciblage-attack-detail-infos"> ${attackDetailinfos}${deadTargetInfo}</strong></i><br/>
                        <i>Cooldown : ${attackDetail.cooldown / 1000}s</i><br/>
                        <i>Préparation : ${attackDetail.preparationTime / 1000}s</i><br/>
                        <i>Exécution : ${attackDetail.executionTime / 1000}s</i><br/>
                        <i>Récupération : ${attackDetail.recoveryTime / 1000}s</i>
                    </p>
                </div>
            </div>
            <p class="attack-description-detail">${attackDetail.attackDescription}</p>
        `;
        // Ajouter cet élément au conteneur de l'entité
        entityContainer.appendChild(attackElement);
    });
}

export let dotNameElement;

export function PopUpDamages(
  target,
  damage,
  effectName,
  popupContent,
  totalDamageSources = {},
  popupType = "normal",
  armorGate = 0,
  natureClass = ''
) {
  if (!totalDamageSources || typeof totalDamageSources !== "object") {
    console.error("totalDamageSources est manquant ou invalide dans PopUpDamages.");
    totalDamageSources = {};
  }

  const entityContainer = document.getElementById(`PopUp_${target.id}`);
  if (!entityContainer) return;

  const hpLoss = Math.max(0, Math.round(Number(damage) || 0));
  const armorLoss = Math.max(0, Math.round(Number(armorGate) || 0));

  const effectClass = effectName ? `${effectName}-pop-up` : "generic-pop-up";
  const isCritical = popupType === "critical" || popupType === "execution-critical";
  const isExecutionCritical = popupType === "execution-critical";
  const isBloodGlutony = popupType === "blood-glutony";
  const popupClass = isCritical ? "popup-critical" : "popup-normal";

  if (isBloodGlutony) {
    EffectMessage(target, `Voracité sanguinaire|+${hpLoss} HP`, "blood-glutony");
    return;
  }

  const sourceTypes = Object.entries(totalDamageSources)
    .filter(([, value]) => Number(value) > 0).map(([type]) => type);
  const physical = sourceTypes.some(type => ['physical', 'physicalDamage', 'hybridalDamage', 'physicalPiercingDamage', 'hybridalPiercingDamage'].includes(type));
  const magical = sourceTypes.some(type => ['magical', 'magicalDamage', 'hybridalDamage', 'magicalPiercingDamage', 'hybridalPiercingDamage'].includes(type));
  const piercing = sourceTypes.some(type => ['piercingDamage', 'transpiercingDamage', 'physicalPiercingDamage', 'magicalPiercingDamage', 'hybridalPiercingDamage'].includes(type));
  const inferredNature = piercing
    ? physical && magical ? 'hybridalPiercingDamage' : physical ? 'physicalPiercingDamage' : magical ? 'magicalPiercingDamage' : 'transpiercingDamage'
    : physical && magical ? 'hybridalDamage' : magical ? 'magicalDamage' : 'physicalDamage';
  const natureKeys = ['physicalDamage', 'magicalDamage', 'hybridalDamage', 'piercingDamage',
    'transpiercingDamage', 'physicalPiercingDamage', 'magicalPiercingDamage', 'hybridalPiercingDamage', 'inerte'];
  const nature = natureKeys.includes(natureClass) ? natureClass : inferredNature;
  const className = `damage-popup total-damage damage-popup--nature ${effectClass} ${popupClass}`
    + (armorLoss > 0 ? ' damage-popup--armor-hit' : '')
    + (isExecutionCritical ? ' damage-popup--execution-critical' : '');
  const iconClass = isExecutionCritical
    ? 'picto-stat damage-popup-critical-icon execution-critical'
    : isCritical ? 'picto-stat damage-popup-critical-icon criticalPower'
    : `picto-stat damage-popup-nature-icon ${nature}`;
  showDamagePopup(entityContainer, { className, iconClass, valueClass: `damage-popup-value ${nature}`,
    amount: hpLoss + armorLoss, critical: isCritical }, isExecutionCritical ? 3 : isCritical ? 1 : popupType === 'execution' ? 2 : 0);

  if (armorLoss > 0 && (Number(target.stats?.armor?.current) || 0) <= 0) {
      const destroyed = document.createElement("div");
      destroyed.className = "damage-popup damage-popup--armor-destroyed";
      const destroyedIcon = document.createElement("span");
      destroyedIcon.className = "damage-popup-armor-destroyed-icon";
      destroyedIcon.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.className = "damage-popup-armor-destroyed-text";
      label.textContent = "armure détruite";
      destroyed.append(destroyedIcon, label);
      EffectMessage(target, destroyed, 'armor-destroyed');
  }
}

function CleardotName(element, delai) {
    setTimeout(() => {
        element.remove();
    }, delai);
}

// Presentation only; score accounting lives in combat/score.js.
export function updateScoreDisplay(score) {
  const element = document.getElementById('score');
  setTimerText(element, 'Score : ' + score);
}

// Compteurs de deplacement : lecture des ressources, mise en forme et animations.
function getMovementCounterState(entite) {
  const current = Math.round(Number(entite?.stats?.shift?.current) || 0);
  const max = Math.max(0, Math.round(Number(entite?.stats?.shift?.max) || 0));
  const durable = entite?.modifierStats?.durable;
  // Keep progression, but exclude equipment and temporary effects from the comparison.
  const native = entite?.baseStats ? getStatSystemResult({
    ...entite,
    modifierStats: { durable: { ...durable, stuff: { byId: {} } } },
    battleBoosts: {},
    _statSystemOverrides: undefined,
  }, 'shift') : null;
  const delta = entite?.baseStats ? max - (native?.value ?? 1) : 0;
  const extra = getEquipmentResourceCurrent(entite, 'shift')
    + Math.max(0, Number(entite?.resourceStocks?.shift?.temporary) || 0)
    + Math.max(0, Number(entite?.resourceStocks?.shift?.spell) || 0);
  return { current, max, delta, extra };
}

const movementCounterViews = new WeakMap();

export function renderMovementCounter(node, entite, state = getMovementCounterState(entite), restartAnimation = false) {
  const { current, max, delta, extra } = state;
  let text = node;
  if (node.classList.contains('movement-counter')) {
    text = node.querySelector('.counter-shift');
    if (!text) {
      text = document.createElement('span');
      text.className = 'counter-shift hu';
      node.appendChild(text);
    }
  }
  let view = movementCounterViews.get(text);
  if (!view || view.current.parentNode !== text || view.max.parentNode !== text || restartAnimation) {
    // A generated move starts a fresh bounce, including overlapping refills.
    // Other refreshes keep the text nodes instead of reconstructing the counter.
    text.innerHTML = `${text !== node ? ': ' : ''}<span class="current-shift current">${current}</span> / <span class="current-shift max">${max}</span>`;
    view = { current: text.querySelector('.current'), max: text.querySelector('.max') };
    movementCounterViews.set(text, view);
  } else {
    setDOMText(view.current, current);
    setDOMText(view.max, max);
    // The previous renderer replaced this node on every refresh, ending its bounce.
    if (view.current.classList.contains('bounce-shift')) view.current.classList.remove('bounce-shift');
  }
  const currentSpan = view.current;
  const maxSpan = view.max;
  currentSpan.classList.toggle('negative-shift', current < 0);
  currentSpan.classList.toggle('movement-reduced', delta < 0 || current < 0);
  currentSpan.classList.toggle('movement-overflow', delta >= 0 && current > max);
  currentSpan.classList.toggle('movement-buffed', delta >= 0 && current >= 0 && current <= max && (delta > 0 || extra > 0));
  maxSpan.classList.toggle('movement-reduced', delta < 0);
  maxSpan.classList.toggle('movement-buffed', delta > 0);
  node.classList.toggle('empty', current <= 0);
  node.classList.toggle('full', current >= max && max > 0);
  return currentSpan;
}

// Animation memory belongs to the view, never to the saved movement reserve.
const displayedMovement = new WeakMap();

export function updateMovementDisplay(entite, { animate = true } = {}) {
  if (!entite?.id) return;

  const rawMovement = entite?.stats?.shift;
  if (!rawMovement || typeof rawMovement !== "object") return;

  const previousCurrent = Number(displayedMovement.get(rawMovement) ?? rawMovement.current);

  const current = Math.round(Number(rawMovement.current) || 0);
  const max = Math.max(0, Math.round(Number(rawMovement.max) || 0));

  const hasGeneratedMove =
    animate &&
    current > previousCurrent &&
    previousCurrent < max &&
    current <= max;

  const state = getMovementCounterState(entite);
  document
    .querySelectorAll(`[data-movement-entity-id="${entite.id}"]`)
    .forEach(el => {
      const currentSpan = renderMovementCounter(el, entite, state, hasGeneratedMove);

      if (hasGeneratedMove && currentSpan) {
        // renderMovementCounter just created this span: there is no animation
        // to cancel and no previous layout to force before its first bounce.
        currentSpan.classList.add("bounce-shift");

        setTimeout(() => {
          currentSpan.classList.remove("bounce-shift");
        }, 500);
      }

    });

  displayedMovement.set(rawMovement, current);
}

export function createMovementDisplay(entite) {
  const wrapper = document.createElement("div");
  wrapper.className = "movement-charge-display";
  wrapper.setAttribute("data-movement-entity-id", entite.id);
  renderMovementCounter(wrapper, entite);

  return wrapper;
}

export function animateMoveCounter(counterElement) {
    if (!counterElement) return;

    counterElement.classList.remove("counter-pop");
    void counterElement.offsetWidth;
    counterElement.classList.add("counter-pop");
}

// Present the already applied refill, including the trailer proc highlight.
export function presentMovementRefill(entite, before) {
  updateMovementDisplay(entite);
  const movement = entite.stats.shift;
  const trailer = movement.trailer || {};
  if (movement.current !== before && trailer.success) {
    document
      .querySelectorAll(`[data-movement-entity-id="${entite.id}"] .counter-shift.hu`)
      .forEach(currentValue => {
        const restarting = currentValue.classList.contains("trailer-proc-highlight");
        currentValue.classList.remove("trailer-proc-highlight");
        if (restarting) void currentValue.offsetWidth;
        currentValue.classList.add("trailer-proc-highlight");

        setTimeout(() => {
          currentValue.classList.remove("trailer-proc-highlight");
        }, 1000);
      });
  }
}

// Roles et cibles affiches : badges, choix confirme et listes de priorite.
const selectedTargetDisplays = new WeakMap();

export function updateRoleInDOM(entite) {
    if (!isNonLordCombatant(entite)) {
        return;
    }

    const roleImg = document.getElementById(`role-img_${entite.id}`);
    const roleTitle = document.querySelector(`#entiteDetailsContainer_${entite.id} .entity-role-title`);
    const roleName = document.querySelector(`#entiteDetailsContainer_${entite.id} .entite-role-name`);
    const rolePicto = document.querySelector(`#entiteDetailsContainer_${entite.id} .entity-role-picto`);
    const entiteBox = document.getElementById(`Box_Entite_${entite.id}`);
    const rolePortrait = document.querySelector(`#rolePortrait_${entite.id}.hud-portrait-role`);

    if (roleImg) {
        roleImg.alt = `${entite.name} est un ${entite.role}`;
        roleImg.className = `role-img role-${entite.role}`;
    }

    if (roleTitle) {
        roleTitle.textContent = entite.role;
    }

    if (roleName) {
        roleName.textContent = entite.role;
    }

    if (rolePicto) {
        rolePicto.className = `entity-role-picto role-${entite.role}`;
    }

    if (rolePortrait) {
        rolePortrait.className = `hud-portrait-role role-${entite.role}`;
    }

    if (entiteBox) {
        for (const name of [...entiteBox.classList]) {
            if (name.startsWith('side-') || name.startsWith('role-')) entiteBox.classList.remove(name);
        }
        entiteBox.classList.add('entite-box', `side-${entite.side}`, `role-${entite.role}`);
    }
}

export function clearBattleTargetDisplays(entities = entites) {
    for (const entity of entities || []) selectedTargetDisplays.delete(entity);
}

export function getBattleTargetAttack(entity) {
    const committedAttack = selectedTargetDisplays.get(entity)?.attack;
    if (committedAttack) return committedAttack;

    const profile = readEntityCombatProfile(entity, attackDetails);
    const hasAmbiguousInitialTarget = profile?.combatFunction === 'Arbitre'
        && (profile?.domains?.length || 0) > 1;
    if (hasAmbiguousInitialTarget) return null;

    return entity.currentAttack
        || resolveAttackDefinitionForEntity(entity, entity.attacks?.[0], attackDetails);
}

function displayNeutralAttackTarget(entity) {
    entity.targetZone = 'none';
    const element = getBattleEntityElement(entity);
    if (element) {
        setDOMAttribute(element, 'data-targetzone', 'none');
        delete element.dataset.attackFunction;
        delete element.dataset.attackDomain;
    }

    const container = document.getElementById(`TargetroleContainer_${entity.id}`);
    if (container) {
        setDOMAttribute(container, 'class', `target-role-img-container sbire ${entity.side} no-target`);
        delete container.dataset.attackKey;
        const picto = container.querySelector('.target-picto-hud');
        setDOMAttribute(picto, 'class', 'target-picto-hud no-target');
        const roleImg = container.querySelector('.role-img');
        setDOMAttribute(roleImg, 'class', 'role-img sbire role-none');
        const frame = container.querySelector('.targetrole-img-hud');
        setDOMAttribute(frame, 'class', 'targetrole-img-hud sbire');
    }

    const targetInfo = document.getElementById(`TargetInfos_${entity.id}`);
    if (targetInfo) {
        replaceDOMClassGroup(targetInfo, ['Attaquant', 'Support', 'Arbitre', 'Invocateur', 'Necro'], ['no-target']);
    }

    const listing = document.getElementById(`listing_${entity.id}`);
    if (listing) {
        replaceDOMClassGroup(listing, ['Attaquant', 'Support', 'Arbitre', 'Invocateur', 'Necro'], ['no-target']);
        listing.querySelectorAll('.target-zone').forEach(node => node.classList.remove('target-zone'));
    }

    const zone = document.querySelector(`#ScanEntity_${entity.id} .target-zone-role-display`);
    setDOMText(zone, 'Aucune attaque sélectionnée.');
}

function targetRoleForAttack(entity, attack) {
    if (attack.attackTarget.includes('hexa')) return 'hexa';
    const candidates = entites.filter(candidate => candidate !== entity && acceptsSelectedTarget(entity, attack, candidate));
    const priorityTable = attack.attackTarget.includes('enemy') ? AttackerSbireTargetPriority : AllySbireTargetPriority;
    const priorities = priorityTable[entity.role] || priorityTable.gueux;
    return priorities.find(role => candidates.some(candidate => isNonLordCombatant(candidate) && candidate.role === role))
        || (candidates.some(candidate => candidate.type === 'lord') ? 'lord' : 'none');
}

// Only a committed attack replaces the HUD's last selection. Candidate previews
// and cooldown predictions must not change the action shown above the entity.
export function updateEntityAttackTargetDisplay(entity, selectedAttack = null, selectedTarget = null) {
    if (!isNonLordCombatant(entity)) return;
    if (selectedAttack) selectedTargetDisplays.set(entity, { attack: selectedAttack, target: selectedTarget });
    const attack = getBattleTargetAttack(entity);
    if (!attack) {
        displayNeutralAttackTarget(entity);
        return;
    }
    const committedTarget = selectedTargetDisplays.get(entity)?.target;
    const isHex = committedTarget ? committedTarget.nodeType === 1 : attack.attackTarget[0] === 'hexa';
    const isNecro = attack.deadTarget?.includes('yes');
    const role = isHex ? 'Invocateur' : committedTarget?.type === 'lord' ? 'lord' : committedTarget?.role || targetRoleForAttack(entity, attack);
    const functionName = attack.combatFunction;
    const classes = [functionName, isNecro ? 'Necro' : '', isHex ? 'domain-invocateur' : isNecro ? 'domain-necro' : 'domain-combattant'].filter(Boolean).join(' ');
    entity.targetZone = isHex ? 'hexa' : role;
    const element = getBattleEntityElement(entity);
    if (element) {
        setDOMAttribute(element, 'data-targetzone', entity.targetZone);
        setDOMAttribute(element, 'data-attack-function', functionName);
        setDOMAttribute(element, 'data-attack-domain', isHex ? 'invocateur' : isNecro ? 'necro' : 'combattant');
    }
    const container = document.getElementById(`TargetroleContainer_${entity.id}`);
    if (container) {
        setDOMAttribute(container, 'class', `target-role-img-container sbire ${entity.side} ${classes}`);
        setDOMAttribute(container, 'data-attack-key', attack.attackKey || attack.functionName);
        const picto = container.querySelector('.target-picto-hud');
        setDOMAttribute(picto, 'class', `target-picto-hud ${functionName} ${isNecro ? 'Necro' : ''}`);
        const roleImg = container.querySelector('.role-img');
        setDOMAttribute(roleImg, 'class', `role-img sbire role-${role}`);
        const frame = container.querySelector('.targetrole-img-hud');
        setDOMAttribute(frame, 'class', 'targetrole-img-hud sbire');
    }
    const targetInfo = document.getElementById(`TargetInfos_${entity.id}`);
    if (targetInfo) {
        replaceDOMClassGroup(targetInfo, ['Attaquant', 'Support', 'Arbitre', 'Invocateur', 'Necro'],
            [functionName, ...(isHex ? ['Invocateur'] : []), ...(isNecro ? ['Necro'] : [])]);
    }
    const listing = document.getElementById(`listing_${entity.id}`);
    if (listing) {
        setDOMAttribute(listing, 'class', `flisting-sbire focus-listing ${classes} focus-${isHex ? 'invocateur' : role === 'lord' ? 'lord' : 'sbire'}`);
        if (isHex) {
            listingFocusInvocateur(entity.id, entity.side, calculateHexes(entity.side).availableHexes);
        } else {
            const table = attack.attackTarget.includes('enemy') ? AttackerSbireTargetPriority : AllySbireTargetPriority;
            updateIngameListingFocus(entity.id, entity.role, table);
            if (role === 'lord') listing.innerHTML = '<div class="entity-role-listing role-lord target-zone"></div>';
            else listing.querySelector(`.role-${role}`)?.classList.add('target-zone');
        }
    }
    const zone = document.querySelector(`#ScanEntity_${entity.id} .target-zone-role-display`);
    setDOMText(zone, isHex ? 'Ciblage des cases du terrain.' : `Cibles : ${isNecro ? 'cadavres' : 'entités'} ${attack.attackTarget.includes('enemy') ? 'ennemis' : 'alliés'} (${role}).`);
}

export function applyCombatProfileView(element, entity, { text = false, helper = false } = {}) {
    const profile = readEntityCombatProfile(entity, attackDetails);
    const previous = (element.dataset.combatProfileClasses || '').split(' ').filter(Boolean);
    replaceDOMClassGroup(element, previous, profile.classes);
    setDOMAttribute(element, 'data-combat-profile-classes', profile.classes.join(' '));
    setDOMAttribute(element, 'data-combat-profile-entity', entity.id);
    setDOMAttribute(element, 'data-combat-profile-text', text);
    setDOMAttribute(element, 'data-combat-profile-helper', helper);
    if (text) setDOMText(element, profile.label);
    if (element.classList.contains('entity-role-BadgeContainer')) {
        let icons = element.querySelector('.entity-domain-icons');
        if (!icons) {
            icons = document.createElement('div');
            icons.className = 'entity-domain-icons';
            element.appendChild(icons);
        }
        const labels = { necro: 'Nécro', invocateur: 'Invocateur', combattant: 'Combattant' };
        const unchanged = icons.childNodes.length === profile.domains.length && profile.domains.every((domain, index) => {
            const icon = icons.childNodes[index];
            return icon.nodeName === 'SPAN' && icon.attributes.length === 3 && icon.className === `entity-domain-picto domain-${domain}`
                && icon.title === labels[domain] && icon.getAttribute('aria-label') === labels[domain] && !icon.childNodes.length;
        });
        if (!unchanged) icons.replaceChildren(...profile.domains.map(domain => {
            const icon = document.createElement('span');
            icon.className = `entity-domain-picto domain-${domain}`;
            icon.title = labels[domain];
            icon.setAttribute('aria-label', icon.title);
            return icon;
        }));
    }
    if (helper) {
        setDOMAttribute(element, 'data-stat', 'battlefieldRole');
        setDOMAttribute(element, 'data-hover', 'true');
        setDOMAttribute(element, 'data-entity-id', entity.id);
        setDOMAttribute(element, 'data-helper-text', profile.helper);
    }
    return profile;
}

// Listes des priorites de ciblage : sbires, invocateurs et lords.
export function IngameListingFocus(role, priorities) {
    const priorityList = priorities[role] || [];
    let content = '';

    priorityList.forEach((role, index) => {
        content += `<div class="entite-role-detail-listing">
                        <div class="entity-role-listing role-${role}"></div>
                        <span class="role-name">${role}</span>
                        <div class="hexastone"></div>
                    </div>`;

        // Ajout de la transition sauf après le dernier élément
        if (index < priorityList.length - 1) {
            content += `<div class="hexastone-transition"></div>`;
        }
    });

    return content;
}

export function updateIngameListingFocus(entityId, newRole, priorities) {
    const entityContainer = document.getElementById(`ScanEntity_${entityId}`);
    if (!entityContainer) {
        // console.error(`Entity container with ID ${entityId} not found.`);
        return;
    }

    const focusListingContainer = entityContainer.querySelector('.focus-listing');
    if (!focusListingContainer) {
        console.error("Focus listing container not found.");
        return;
    }

    const listingFocusContent = IngameListingFocus(newRole, priorities);
    focusListingContainer.innerHTML = listingFocusContent;
}

export function listingFocusInvocateur(attackerId, attackerSide, availableHexes) {
    // Vérifie si availableHexes est un tableau
    if (!Array.isArray(availableHexes)) {
        console.warn(`availableHexes n'est pas un tableau. La fonction d'affichage dynamique est ignorée.`);
        return;
    }

    const parentDiv = document.querySelector(`#listing_${attackerId}.focus-invocateur`);

    if (!parentDiv) {
        console.warn(`Le listing de l'Invocateur ${attackerId} n'a pas été trouvé dans le DOM.`);
        return;
    }

    // Vide le contenu du parentDiv pour éviter les doublons
    parentDiv.innerHTML = '';

    // Objet pour accumuler les positions des hex par type
    const hexListing = {};

    // Itère sur les hex disponibles qui ne sont pas occupés
    availableHexes.forEach(hex => {
        const isOccupied = hex.classList.contains('occupied');

        if (!isOccupied) {
            // Détermine le type de hex (neutral, tank, fantassin, mage)
            let hexType = hex.getAttribute('data-role');
            if (!hexType || hexType.trim() === '') {
                hexType = 'neutre'; // Utilise 'neutre' si le data-role est vide ou non défini
            }

            // Ajoute la position du hex au tableau correspondant
            if (!hexListing[hexType]) {
                hexListing[hexType] = [];
            }
            hexListing[hexType].push(hex.getAttribute('data-position'));
        }
    });

    // Affiche les clés de hexListing pour le débogage
    // console.log('Clés de hexListing :', Object.keys(hexListing));

    // Définit l'ordre désiré des types (ajusté pour correspondre aux noms réels)
    const desiredOrder = ['neutre', 'tank', 'fantassin', 'mage'];

    // Itère sur les types dans l'ordre désiré
    desiredOrder.forEach(type => {
        const positions = hexListing[type];
        if (positions && positions.length > 0) {
            // Crée le conteneur pour ce type de hex avec la classe correspondante
            const typeContainer = document.createElement('div');
            typeContainer.className = `invocateur-hex-listing invocateur-hex-${type}`;

            // Crée la div extérieure pour le premier hex de ce type
            const outerDiv = document.createElement('div');
            outerDiv.id = `invocateur_${attackerId}_hex-${positions[0]}`;
            outerDiv.className = `invocateur-hex-item`;

            // Crée la div intérieure
            const innerDiv = document.createElement('div');
            innerDiv.className = `invocateur-hex-pic focus-${positions[0]} ${type}`;
            innerDiv.setAttribute('data-focus-hex-id', positions[0]);

            // Ajoute la div intérieure à la div extérieure
            outerDiv.appendChild(innerDiv);

            // Ajoute la div extérieure au conteneur de type
            typeContainer.appendChild(outerDiv);

            // Affiche le compteur pour ce type de hex
            const counterDiv = document.createElement('div');
            counterDiv.className = `invocateur-hex-counter ${type}`;
            counterDiv.textContent = `Cases ${type} : ${positions.length}`;

            // Ajoute le compteur sous le hex
            typeContainer.appendChild(counterDiv);

            // Ajoute le conteneur de type au conteneur parent
            parentDiv.appendChild(typeContainer);
        }
    });

    // Vérifie si des hex summonables n'ont pas été ajoutés
    if (parentDiv.children.length === 0) {
        console.warn(`Aucun hex disponible à afficher pour l'Invocateur ${attackerId}.`);
    }
}

export function listingFocusLord(attackerId, allEntitiesAggro) {
    // Sélectionne le conteneur parent avec l'id 'lord listing_ID'
    const parentDiv = document.querySelector(`#listing_${attackerId}.flisting-lord`);

    if (!parentDiv) {
        console.warn(`Le conteneur avec l'id 'lord listing_${attackerId}' n'a pas été trouvé dans le DOM.`);
        return;
    }

    // Vide le contenu du parentDiv pour éviter les doublons
    parentDiv.innerHTML = '';

    // Itère sur les 4 premiers éléments du classement d'aggro
    for (let i = 0; i < 4; i++) {
        const entity = allEntitiesAggro[i];

        // Si l'entité n'existe pas, passe à l'itération suivante
        if (!entity) {
            continue;
        }

        // Crée la div extérieure avec id 'lord_ID_target-N'
        const outerDiv = document.createElement('div');
        outerDiv.id = `lord_${attackerId}_target-${i + 1}`;
        outerDiv.className = `lord-targets-listing`;
        outerDiv.dataset.dropable = 'true';
        outerDiv.dataset.entityId = entity.id;

        // Crée la div intérieure avec les classes et attributs spécifiés
        const innerDiv = document.createElement('div');
        innerDiv.className = `lord-target-pic focus-${i + 1}`;
        innerDiv.setAttribute('data-focus-target-id', entity.id);

        // Définit les styles de la div intérieure
        if (entity.portrait) {
            innerDiv.style.backgroundImage = `url('${entity.portrait}')`;
            innerDiv.style.backgroundSize = 'cover';
            innerDiv.style.backgroundPosition = 'center center';
        }

        // Ajoute la div intérieure à la div extérieure
        outerDiv.appendChild(innerDiv);

        // Pour la cible 1, ajoute la div supplémentaire
        if (i === 0) {
            const additionalDiv = document.createElement('div');
            additionalDiv.id = `lord_${attackerId}-focuslisting-activetarget`;
            additionalDiv.className = 'lord-focuslisting-target';

            // Ajoute la div supplémentaire à la div extérieure
            outerDiv.appendChild(additionalDiv);
        }

        // Ajoute la div extérieure au conteneur parent
        parentDiv.appendChild(outerDiv);
    }
}

// Rafraichir les badges ouverts lorsque le profil de combat change.
subscribeAttackSelection(entity => {
    if (!entity || typeof document === 'undefined') return;
    for (const element of document.querySelectorAll('[data-combat-profile-entity]')) {
        if (element.dataset.combatProfileEntity !== String(entity.id)) continue;
        applyCombatProfileView(element, entity, {
            text: element.dataset.combatProfileText === 'true',
            helper: element.dataset.combatProfileHelper === 'true',
        });
    }
});
