import { resetInterruptedPreparationBar, updateSpectralTimingFeedback, clearSpectralTimingFeedback } from "../rendering/timers.js";
import { updateScore } from "./score.js";
import { advanceCombatTimerState } from "./timerState.js";
import { updateHealthBar, presentEntityVitals } from "../rendering/vitalFeedback.js";
import { corruptHealthCapacity } from '../entities/healthCapacity.js';
import { spendMovementCharges } from '../items/resourceStocks.js';
import {
  syncEntityFootprints, pullEntityToward, moveEntityRandomly, entitySizeInCells, setEntitySizeInCells, getAdjacentEntities,
} from "../board/controller.js";
import {
  registerCombatState, combatData, setTimeout, clearTimeout, setInterval, clearInterval,
} from "./clock.js";

import {
  combatNow as clockNow, scheduleCombatTask, scheduleCombatImpactTask, cancelCombatTask,
  deferCombatEffect,
} from "./timeline.js";
import { buildSignatureStackHelper } from "../data/helpers.js";
import { cachedResourceUrl, playCachedGif } from "../data/loaderList.js";
import { setDisplayClass } from '../rendering/displayBatch.js';
import { showMovementLossPopup } from '../rendering/popups.js';
import { EFFECT_VISUALS } from '../data/effectVisuals.js';
import { entites, removedEntities, getMovementWeightMalus, recomputeEntityStats } from "../entities/runtime.js";
import { summons } from "../data/summons.js";
import {
  dotNameElement,
  updateTimerDisplay,
  updateKillsCounter,
  updateTotalDamageCounter,
  updateTotalHealCounter,
  updateScoreDisplay,
  updateMovementDisplay,
} from "../rendering/hud.js";
import {
  attackEffects, describeAttackEffect,
} from "../data/attackEffects.js";
import { applyDamage } from "./vitals.js";
import {
  getAlterationTiming, calculateResilienceEffectIntensity, attemptAlterationResistance,
  prepareResilienceEffect, calculateControlledSpeed,
} from "./statistics.js";
import { escape } from "../ui/statistics/helpers.js";
import { setEntityEffectView, removeEntityEffectView, refreshEntityEffectViews } from "../ui/statistics/components.js";
import {
  addEntityControl, endEntityControl, getControlState, getControlStates, getCombatSide,
  updateCharmedSide, advanceInsolence, applyControlRecoil, getMovementElapsed, getSleepElapsed,
  isEntityAsleep, notifyPreparationInterrupted, canEntityProc,
} from "./control.js";
import {
  effectProvenance, effectRuntimeKey, burnRules, feedBurn, decayBurn, burnPower, burnExpiresAt,
} from "./effectRules.js";
import { attackDetails } from "../data/attackList.js";
import { attemptEffectRunaway } from "./orders.js";
import { defaultEffect } from './effectParameters.js';


import {
  saveEntityHPToStorage,
  saveEntityMovementState,
  recordEntityCombatStat, recordEntityCombatProc,
  recordEntityLifeSteal,
  recordEntityHealingReceived,
  updateEntityStatusInStorage,
} from "../storage/entityStorage.js";
import { createEntiteInDOM } from "../rendering/entities.js";
import { entiteTurn } from "./loop.js";
import { gameStarted, isBattleFinished } from "../app/state.js";
import { getSafe, entityBattleBooste } from "../entities/rules.js";
import {
  getAttackNatureRules, notifyAttackSelection, readAttackDefinitionsForEntity, attackSelectionKey,
  normalizeAttackSelection, startAttackCooldown,
} from "./attackResolution.js";
import { EffectMessage, showHealingFeedback } from "../ui/display.js";
export { EffectMessage, showHealingFeedback } from "../ui/display.js";

const natureEffects = new Map(), activeAlterations = new Map();
const controlEffects = new Map();
const controlledEntities = new Set();
let applicationOrder = 0;
let natureEffectsTimer = null;
function effectSource(effect, attackerId) {
  const source = [...entites, ...removedEntities].find(entity => String(entity.id) === String(attackerId));
  return { sourceLabel: effect.sourceLabel || source?.name || 'Source inconnue', portrait: effect.sourcePortrait || source?.portrait };
}

function createDotHelper(key, target, state) {
  if (state.criticalBurn) {
    setEntityEffectView(target, key, {
      kind: 'magicalBurn', label: state.effect.effectDisplay, type: 'dot', endAt: () => state.expiresAt,
      effectTypes: state.effect.type,
      count: () => Object.keys(state.sources).length,
      read: () => {
        const sources = Object.values(state.sources).map(source => ({
          ...effectSource(source, source.attacker), remainingDamage: source.remaining,
        }));
        const remainingDamage = sources.reduce((sum, source) => sum + source.remainingDamage, 0);
        return { sources, remainingDamage,
          dps: calculateResilienceEffectIntensity(target, remainingDamage / Math.max(.001, (state.expiresAt - state.accruedAt) / 1000)),
          interval: state.effect.effectTickInterval, lastTick: state.lastTick };
      },
    });
    return;
  }
  setEntityEffectView(target, key, {
    kind: state.kind, label: state.effect.effectDisplay, type: 'dot',
    endAt: () => state.kind === 'brulure' ? burnExpiresAt(state) : state.expiresAt,
    count: () => state.kind === 'brulure' ? target.brulureStacks : 1,
    decaying: () => state.kind === 'brulure' && state.decayReference != null,
    read: () => ({
      ...effectSource(state.effect, state.attacker),
      dps: calculateResilienceEffectIntensity(target, state.perSecond),
      interval: state.effect.effectTickInterval, lastTick: state.lastTick,
      ...(state.kind === 'brulure' ? {
        count: target.brulureStacks, maintenanceAt: state.expiresAt,
        maintenanceSeconds: state.rules.maintenanceSeconds, lossPercent: state.rules.lossPercent,
        sources: Object.values(state.sources).map(source => ({
          ...effectSource(source, source.attacker), attacker: source.attacker, count: source.values.length,
        })),
      } : {}),
    }),
  });
}

function applyDotTick(target, state, damage, attacker, attack) {
  const hpBefore = Number(target.combatDetails?.hpDamageReceived) || 0;
  const armorBefore = Number(target.combatDetails?.armorDamageReceived) || 0;
  if (damage > 0) applyDamage(target, damage, attacker, attack);
  // Combat counters include the real damage even when a lost life restores HP immediately.
  state.lastTick = {
    hp: Math.max(0, (Number(target.combatDetails?.hpDamageReceived) || 0) - hpBefore),
    armor: Math.max(0, (Number(target.combatDetails?.armorDamageReceived) || 0) - armorBefore),
  };
  refreshEntityEffectViews(target);
}

function syncStatEffect(target) {
  recomputeEntityStats(target, { persistEquipment: false, skipReverseArchetype: true });
  presentEntityVitals(target);
  window.dispatchEvent(new CustomEvent('entityStatsChanged', { detail: { entity: target } }));
}

function restoreGigantismSize(target) {
  if (target._gigantismBaseSize == null) return;
  const active = Object.values(target.controlEffects || {}).filter(state => state.kind === 'gigantisme');
  const size = Math.max(target._gigantismBaseSize, ...active.map(state => state.effect.effectSize));
  setEntitySizeInCells(target, size, { temporary: true });
  if (!active.length) delete target._gigantismBaseSize;
}

function removeControlEffect(key, { preserveBoost = false, preserveVisual = false, preserveNode = false, preserveSize = false, preserveStats = false } = {}) {
  const current = controlEffects.get(key);
  if (!current) return;
  clearTimeout(current.timer);
  endEntityControl(current.target, current.state.kind, clockNow(), key);
  delete current.target.controlEffects?.[key];
  if (!preserveBoost) current.boost?.remove();
  if (!preserveNode) removeEntityEffectView(key);
  controlEffects.delete(key);
  if (current.state.kind === 'gigantisme' && !preserveSize) restoreGigantismSize(current.target);
  if (current.state.effect.statKey && !preserveBoost && !preserveStats) syncStatEffect(current.target);
  const remaining = getControlState(current.target, current.state.kind);
  current.target.controlStates ||= {};
  if (remaining) current.target.controlStates[current.state.kind] = remaining;
  else {
    delete current.target.controlStates[current.state.kind];
    if (!preserveVisual) current.vfx?.remove();
    current.onEnd?.();
    toggleEffectClass(current.target, current.state.kind, 'remove');
  }
  if (current.state.kind === 'charme') updateCharmedSide(current.target);
  if (current.state.kind === 'sommeil') armAstrality(current.target);
  notifyAttackSelection(current.target);
}

export function clearControlEffects(target = null) {
  if (target) { target.controlIntervals = {}; controlledEntities.delete(target); }
  else { for (const entity of controlledEntities) entity.controlIntervals = {}; controlledEntities.clear(); }
  for (const [key, current] of controlEffects) {
    if (target && current.target !== target) continue;
    current.target.controlIntervals = {};
    removeControlEffect(key);
  }
}

function applyTimedControl(target, effect, attacker, onEnd, saved = null) {
  if (!target?.stats?.HP || target.isDEAD || target.stats.HP.current <= 0) { onEnd?.(); return false; }
  const incomingSide = getCombatSide(attacker);
  effect = { ...effect, provenance: effect.provenance || effectProvenance(attacker, null, effect) };
  const key = effectRuntimeKey(target, effect);
  const prior = [...controlEffects.values()].filter(entry => entry.target === target && entry.state.kind === effect.effectName);
  const previous = controlEffects.get(key)?.state;
  const cadence = effect.applicationMode === 'replace'
    ? prior.map(entry => entry.state).sort((a,b) => (a.nextActionAt ?? Infinity) - (b.nextActionAt ?? Infinity))[0] : previous;
  const previousExpiry = previous?.expiresAt || 0;
  if (effect.effectName === 'gigantisme') {
    const baseSize = target._gigantismBaseSize ?? entitySizeInCells(target);
    const remainingSizes = effect.applicationMode === 'replace' ? [] : prior
      .filter(entry => entry.state !== previous).map(entry => entry.state.effect.effectSize);
    const size = Math.max(baseSize, effect.effectSize, ...remainingSizes);
    // Validate and commit growth before replacing any existing application.
    const placement = setEntitySizeInCells(target, size, { temporary: true, animate: !saved });
    if (!placement.valid) { onEnd?.(); return false; }
    target._gigantismBaseSize = baseSize;
  }
  if (!saved && effect.applicationMode === 'replace') for (const [otherKey, entry] of controlEffects) {
    if (entry.target === target && entry.state.kind === effect.effectName && otherKey !== key) removeControlEffect(otherKey, { preserveSize: true, preserveStats: true });
  }
  removeControlEffect(key, { preserveBoost: Boolean(saved), preserveVisual: true, preserveNode: true, preserveSize: true, preserveStats: true });
  const now = clockNow();
  const state = saved || { kind: effect.effectName, target: target.id, attacker: attacker.id,
    effect: combatData(effect), startedAt: now, expiresAt: now + Math.max(0, effect.effectDuration * 1000),
    appliedOrder: ++applicationOrder, nextActionAt: cadence?.nextActionAt,
    actionClockAt: cadence?.actionClockAt ?? now,
    movementProgress: cadence?.movementProgress || 0, movementLastTick: cadence?.movementLastTick ?? now };
  controlledEntities.add(target);
  target.controlStates ||= {};
  target.controlEffects ||= {};
  target.controlEffects[key] = state;
  applicationOrder = Math.max(applicationOrder, state.appliedOrder);
  state.effect = effect;
  if (saved) state.movementPending = false;
  state.changes ??= 0;
  if (!saved && previous && effect.applicationMode !== 'replace') {
    state.changes = previous.changes;
    state.disabled = { ...previous.disabled }; state.priorities = { ...previous.priorities };
  }
  if (effect.effectName === 'charme') { state.side ??= incomingSide; updateCharmedSide(target); }
  if (effect.effectName === 'insolence') {
    const nextDelay = () => {
      const min = Math.max(0.05, effect.effectMinInterval), max = Math.max(min, effect.effectMaxInterval);
      return (min + Math.random() * (max - min)) * 1000;
    };
    state.nextActionAt ??= now + nextDelay();
  }
  target.controlStates[effect.effectName] = state;
  if (effect.effectName === 'effroi' && target._combatAction?.stage === 'preparation') {
    target._combatAction.interruptedBySilence = true;
    notifyPreparationInterrupted(target);
  }
  let boost = null;
  if (['immobilisation', 'stun', 'silence', 'sommeil', 'bafouillage', 'lenteur'].includes(effect.effectName)) {
    addEntityControl(target, effect.effectName, now, state.expiresAt, 1 - (effect.effectSlowPercent || 0) / 100, key);
    if (effect.effectName === 'sommeil') armAstrality(target);
    if (effect.effectName === 'silence' && !saved && state.expiresAt > now
      && target._combatAction?.stage === 'preparation') {
      // Remember interruption even if a very short Silence expires before the next timer tick.
      const action = target._combatAction;
      if (!action.interruptedBySilence) startAttackCooldown(target, action.attack, action.timings.cooldown, now);
      target._combatAction.interruptedBySilence = true;
      notifyPreparationInterrupted(target);
      target.preparationTime = 0;
      target.preparationProgressRatio = 0;
      resetInterruptedPreparationBar(target);
      updateTimerDisplay(target, advanceCombatTimerState(target));
    }
  }
  if (effect.effectName === 'lourdeur') {
    boost = saved && Object.values(target.battleBoosts || {}).flat().find(entry => entry.id === saved.boostId);
    boost ||= entityBattleBooste(target, { stat: 'weight', value: effect.effectWeightPercent,
      source: key, mode: 'percent', stackable: true });
    state.boostId = boost.id;
  }
  if (effect.statKey) {
    boost = saved && Object.values(target.battleBoosts || {}).flat().find(entry => entry.id === saved.boostId);
    boost ||= entityBattleBooste(target, { stat: effect.statKey, value: effect.modifierSign * effect.effectValue,
      source: key, mode: effect.effectModifierMode, stackable: true });
    state.boostId = boost.id;
    if (!saved) syncStatEffect(target);
  }
  const container = document.getElementById(`effectsContainer_${target.id}`);
  let vfx = container?.querySelector(`[data-control-visual="${effect.effectName}"]`) || null;
  if (effect.effectVisual && container && !vfx) {
    vfx = document.createElement('img');
    vfx.id = `${effect.effectName}VFX_${target.id}`;
    vfx.className = `effect-vfx ${effect.effectName}`;
    vfx.dataset.controlVisual = effect.effectName;
    vfx.alt = '';
    vfx.setAttribute('aria-hidden', 'true');
    container.appendChild(vfx);
    playCachedGif(vfx, effect.effectVisual);
  }
  if (['immobilisation', 'stun', 'silence', 'sommeil', 'folie', 'insolence', 'confusion', 'charme', 'effroi', 'bafouillage', 'lenteur'].includes(effect.effectName)
    && !saved && previousExpiry <= now && state.expiresAt > now) {
    EffectMessage(target, `${effect.effectDisplay} !`, 'normal', { effectKey: effect.effectName, durationSeconds: (state.expiresAt - now) / 1000 });
  }
  setEntityEffectView(target, key, {
    kind: effect.effectName, label: effect.effectDisplay, stat: effect.statVisual, type: 'control', endAt: () => state.expiresAt,
    read: () => {
      const displayed = { ...state.effect, effectDuration: (state.expiresAt - state.startedAt) / 1000 };
      return { ...effectSource(state.effect, state.attacker), html: `<div>${escape(describeAttackEffect(displayed))}</div>`
        + (effect.effectName === 'insolence' ? `<div>Actions effectuées : ${state.changes}.</div>` : '') };
    },
  });
  const current = { state, target, boost, vfx, onEnd, timer: null };
  controlEffects.set(key, current);
  toggleEffectClass(target, effect.effectName, 'add');
  const tick = () => {
    if (target.isDEAD || target.stats.HP.current <= 0 || state.expiresAt <= clockNow()) {
      removeControlEffect(key);
      return;
    }
    if (effect.effectName === 'insolence') {
      const now = clockNow();
      // Preserve the remaining cadence, without rolling or accumulating missed
      // changes while asleep. Effect duration itself still expires normally.
      state.nextActionAt += getSleepElapsed(target, state.actionClockAt ?? now, now);
      state.actionClockAt = now;
    }
    if (effect.effectName === 'insolence' && canEntityProc(target) && clockNow() >= state.nextActionAt) {
      const attacks = readAttackDefinitionsForEntity(target, attackDetails);
      normalizeAttackSelection(target, attacks);
      advanceInsolence(target, attacks.map(attackSelectionKey), Math.random, state);
      const min = Math.max(0.05, effect.effectMinInterval), max = Math.max(min, effect.effectMaxInterval);
      state.nextActionAt = clockNow() + (min + Math.random() * (max - min)) * 1000;
      notifyAttackSelection(target);
    }
    if (effect.effectName === 'confusion' || effect.effectName === 'effroi') {
      const now = clockNow();
      state.movementProgress = (state.movementProgress || 0) + getMovementElapsed(target, state.movementLastTick ?? now, now);
      state.movementLastTick = now;
      const interval = effect.effectName === 'confusion' ? effect.effectMoveInterval * 1000 : Math.max(1, Number(getSafe(target, 'speed', 1000)) || 1000);
      if (state.movementProgress >= interval && !state.movementPending) {
        state.movementProgress = 0;
        if (effect.effectName === 'confusion') moveEntityRandomly(target, Math.random, effect);
        else {
          state.movementPending = true;
          void attemptEffectRunaway(target).finally(() => { state.movementPending = false; });
        }
      }
    }
    refreshEntityEffectViews(target);
    current.timer = setTimeout(tick, Math.max(1, Math.min(250, state.expiresAt - clockNow(),
      (canEntityProc(target) ? state.nextActionAt ?? Infinity : Infinity) - clockNow())));
  };
  tick();
  notifyAttackSelection(target);
  return true;
}

export const immobilisation = (target, effect, attacker, onEnd, saved) =>
  applyTimedControl(target, effect, attacker, onEnd, saved);
immobilisation.tacticalConsequence = ['temporaire', 'deplacement_entite'];
immobilisation.tacticalScope = 'attack';

export const gigantisme = (target, effect, attacker, onEnd, saved) => applyTimedControl(target, effect, attacker, onEnd, saved);
gigantisme.tacticalConsequence = ['temporaire', 'deplacement_entite'];
gigantisme.tacticalScope = 'attack';
export const statModifier = (target, effect, attacker, onEnd, saved) => applyTimedControl(target, effect, attacker, onEnd, saved);
statModifier.tacticalConsequence = ['temporaire'];
statModifier.tacticalScope = 'attack';

export const stun = (target, effect, attacker, onEnd, saved) =>
  applyTimedControl(target, effect, attacker, onEnd, saved);
stun.tacticalConsequence = ['temporaire', 'blocage_total'];
stun.tacticalScope = 'attack';

export const silence = (target, effect, attacker, onEnd, saved) =>
  applyTimedControl(target, effect, attacker, onEnd, saved);
silence.tacticalConsequence = ['temporaire', 'blocage_total'];
silence.tacticalScope = 'attack';

export const bafouillage = (target, effect, attacker, onEnd, saved) => applyTimedControl(target, effect, attacker, onEnd, saved);
export const lenteur = bafouillage, folie = bafouillage, insolence = bafouillage, confusion = bafouillage, charme = bafouillage, effroi = bafouillage, sommeil = bafouillage;
bafouillage.tacticalConsequence = ['temporaire'];
bafouillage.tacticalScope = 'attack';

export function interruption(target, effect, attacker, onEnd) {
  onEnd?.();
  if (target._combatAction?.stage !== 'preparation') return false;
  target._interruptedAttackKey = target._combatAction.attack.attackKey || target._combatAction.attack.functionName;
  target._combatAction.interruptedBySilence = true;
  notifyPreparationInterrupted(target);
  return true;
}
interruption.tacticalConsequence = ['direct']; interruption.tacticalScope = 'attack';
export function applyMovementDestabilisation(entity, movementEffect = null, origin = 'automatic') {
  if (!['preparation', 'transport'].includes(entity._combatAction?.stage)) return;
  if (entity._combatAction.stage === 'transport' && (entity._combatAction.attack.attackRange || []).some(range => ['range','ranged','distance'].includes(range))) return;
  const recoil = Number(movementEffect?.effectMovementRecoilPercent ?? globalThis.umbraProgression.vivacite.movementRecoilPercent);
  if (!(recoil > 0)) return;
  // Movement recoil is a game mechanic, not an alteration. Its origin must
  // be explicit: allied swaps, summons and hostile control can all move allies.
  const attenuation = origin === 'player' ? calculateControlledSpeed(entity) : 0;
  return applyControlRecoil(entity, recoil * (1 - attenuation / 100));
}

// Each impact owns its wake check, including effects deferred by simultaneous combat.
// A freshly inflicted sleep cannot be woken by the damage which preceded it.
let sleepImpact = null;
function sleepImpactEntry(target) {
  if (!sleepImpact.targets.has(target)) sleepImpact.targets.set(target, {
    state: getControlState(target, 'sommeil'), damagePercent: 0, movements: 0,
  });
  return sleepImpact.targets.get(target);
}
function resolveSleepWake(target, entry, random = Math.random) {
  if (!entry.state || !getControlState(target, 'sommeil') || target.isDEAD
    || target.stats.HP.current <= 0 || !(entry.damagePercent > 0 || entry.movements > 0)) return false;
  const effect = entry.state.effect;
  const chance = Math.min(100, Math.max(0, Number(effect.effectWakeBase) || 0)
    + entry.damagePercent * Math.max(0, Number(effect.effectWakeRatio) || 0)
    + entry.movements * Math.max(0, Number(effect.effectWakeMovement ?? 10) || 0));
  if (random() * 100 >= chance) return false;
  for (const [key, current] of controlEffects) if (current.target === target && current.state.kind === 'sommeil') removeControlEffect(key);
  toggleEffectClass(target, 'sommeil', 'remove');
  EffectMessage(target, 'Réveillé !');
  return true;
}
function runSleepImpact(context, callback) {
  const previous = sleepImpact;
  sleepImpact = context;
  try { return callback(); }
  finally {
    sleepImpact = previous;
    if (--context.pending === 0) for (const [target, entry] of context.targets) resolveSleepWake(target, entry);
  }
}
export function withSleepImpact(target, callback) {
  if (sleepImpact) { sleepImpactEntry(target); return callback(); }
  return runSleepImpact({ targets: new Map(), pending: 1 }, () => {
    sleepImpactEntry(target);
    return callback();
  });
}
export function deferSleepImpactEffect(callback) {
  if (!sleepImpact) return deferCombatEffect(callback);
  const context = sleepImpact;
  const deferred = deferCombatEffect(() => runSleepImpact(context, callback));
  if (deferred) context.pending++;
  return deferred;
}
export function wakeFromDamage(target, hpBefore, hpLost, random = Math.random) {
  if (!(hpBefore > 0 && hpLost > 0)) return false;
  const entry = sleepImpact ? sleepImpactEntry(target)
    : { state: getControlState(target, 'sommeil'), damagePercent: 0, movements: 0 };
  entry.damagePercent += 100 * hpLost / hpBefore;
  return sleepImpact ? false : resolveSleepWake(target, entry, random);
}
export function wakeFromMovement(target, random = Math.random) {
  const entry = sleepImpact ? sleepImpactEntry(target)
    : { state: getControlState(target, 'sommeil'), damagePercent: 0, movements: 0 };
  entry.movements++;
  return sleepImpact ? false : resolveSleepWake(target, entry, random);
}

export function lourdeur(target, effect, attacker, onEnd, saved) {
  const applied = applyTimedControl(target, effect, attacker, onEnd, saved);
  if (applied && !saved && getControlState(target, 'lourdeur')) {
    // Read the same weight tier as the Codex, after the debuff has been applied.
    const { weightClass } = getMovementWeightMalus(target);
    const line = document.createElement('div');
    line.className = 'effect-message-line lourdeur';
    const icon = document.createElement('span');
    icon.className = `picto-stat ${weightClass}`;
    icon.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.textContent = 'Lourdeur !';
    line.append(icon, label);
    EffectMessage(target, line, 'lourdeur');
  }
  return applied;
}
lourdeur.tacticalConsequence = ['temporaire', 'affaiblissement', 'proportionnel'];
lourdeur.tacticalScope = 'attack';

export function grab(target, effect, attacker, onEnd) {
  const moved = target?.stats?.HP && !target.isDEAD && pullEntityToward(target, attacker, effect.effectDistance, effect);
  if (moved) {
    const line = document.createElement('div');
    line.className = 'effect-message-line grab';
    const icon = document.createElement('img');
    icon.className = 'picto-stat grab';
    icon.src = cachedResourceUrl(effect.effectIcon);
    icon.alt = '';
    icon.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.textContent = 'Grab !';
    line.append(icon, label);
    EffectMessage(target, line, 'grab');
  }
  onEnd?.();
  return Boolean(moved);
}
grab.tacticalConsequence = ['direct', 'deplacement_entite'];
grab.tacticalScope = 'attack';

export function clearAttackNatureEffects(target = null) {
    for (const [entity, effects] of natureEffects) {
        if (target && entity !== target) continue;
        for (const effect of effects.values()) {
            removeNatureCapacity(entity, effect);
            removeEntityEffectView(`${entity.id}-nature-${effect.signature.key}`);
        }
        natureEffects.delete(entity);
    }
    if (!natureEffects.size && natureEffectsTimer !== null) {
        clearInterval(natureEffectsTimer);
        natureEffectsTimer = null;
    }
}

function tickNatureEffects() {
    const now = clockNow();
    for (const [entity, effects] of natureEffects) {
        if (entity.isDEAD || Number(entity.stats?.HP?.current) <= 0) {
            clearAttackNatureEffects(entity);
            continue;
        }
        for (const [key, effect] of effects) {
            if (effect.expiresAt <= now) {
                removeNatureCapacity(entity, effect);
                removeEntityEffectView(`${entity.id}-nature-${effect.signature.key}`);
                effects.delete(key);
            }
        }
        if (!effects.size) natureEffects.delete(entity);
    }
    scheduleNatureExpiration();
}

function scheduleNatureExpiration() {
  clearTimeout(natureEffectsTimer); natureEffectsTimer = null;
  let next = Infinity;
  for (const effects of natureEffects.values()) for (const effect of effects.values()) next = Math.min(next, effect.expiresAt);
  if (Number.isFinite(next)) natureEffectsTimer = setTimeout(tickNatureEffects, Math.max(0, next - clockNow()));
}

for (const event of ['battleResolved', 'battleStopped', 'stageInterfaceClosing']) {
    window.addEventListener(event, () => clearAttackNatureEffects());
}

function applyNatureResistance(target, signature, count = 1) {
    if (count <= 0) return null;
    const confirmedGainValue = () => getSafe({ ...target, modifierStats: null }, signature.resistance, 0);
    const valueBefore = confirmedGainValue();
    let effects = natureEffects.get(target);
    if (!effects) natureEffects.set(target, effects = new Map());
    let effect = effects.get(signature.key);
    if (effect && effect.expiresAt <= clockNow()) {
        removeNatureCapacity(target, effect);
        removeEntityEffectView(`${target.id}-nature-${signature.key}`);
        effects.delete(signature.key); effect = null;
    }
    let entry = target.battleBoosts?.[signature.resistance]?.find(boost => boost.id === effect?.boost.id);
    if (!entry) {
        const boost = entityBattleBooste(target, { stat: signature.resistance, value: 0,
            source: signature.label, durationMs: null });
        effect = { boost, signature, amounts: effect?.amounts || [] };
        effects.set(signature.key, effect);
        entry = target.battleBoosts?.[boost.stat]?.find(entry => entry.id === boost.id);
        // A synchronous combat-ending listener can remove the newly created bonus.
        if (!entry) {
            effects.delete(signature.key);
            if (!effects.size) natureEffects.delete(target);
            return null;
        }
    }
    if (entry.timeout) clearTimeout(entry.timeout);
    entry.timeout = null;
    entry.attackNatureTemporary = true;
    // Mixed ranks keep their own strength; at the cap only a stronger stack replaces the weakest.
    for (let i = 0; i < Math.min(signature.cap, count); i++) {
      if (effect.amounts.length < signature.cap) effect.amounts.push(signature.amount);
      else {
        const weakest = Math.min(...effect.amounts);
        if (signature.amount > weakest) effect.amounts[effect.amounts.indexOf(weakest)] = signature.amount;
      }
    }
    const value = signature.sign * effect.amounts.reduce((sum, amount) => sum + amount, 0);
    entry.value = value;
    window.dispatchEvent(new CustomEvent('entityStatsGained', { detail: {
        entity: target, gains: [{ stat: signature.resistance, amount: confirmedGainValue() - valueBefore }],
    } }));
    effect.expiresAt = clockNow() + signature.durationMs;
    entry.expiresAt = clockNow() + signature.durationMs;
    bindNatureEffectHelper(target, effect);
    tickNatureEffects();

    return { applied: true, key: signature.key, stacks: effect.amounts.length, value };
}

function bindNatureEffectHelper(target, effect) {
  setEntityEffectView(target, `${target.id}-nature-${effect.signature.key}`, {
    kind: effect.signature.key, label: effect.signature.label, type: 'nature', stat: effect.signature.resistance,
    effectTypes: effect.signature.sign < 0 ? ['alteration'] : [],
    count: () => effect.amounts.length, endAt: () => effect.expiresAt,
    read: () => ({ html: buildSignatureStackHelper({ signature: effect.signature, effect,
      value: effect.signature.sign * effect.amounts.reduce((sum, amount) => sum + amount, 0) }) }),
  });
}

export function applyAttackNatureEffect(target, attacker, attack) {
    if (!target || target.isDEAD || target.isInvincible || Number(target.stats?.HP?.current) <= 0
        || attack?.natureEffectSecondary || attack?.natureSignatureSuppressed || attack?.isBrokenSpell
        || [].concat(attack?.type || []).includes('alteration')) return null;
    const signature = getAttackNatureRules(attack).signature;
    if (!signature || signature.key === 'resonance') return null;
    if (signature.resistance) {
      if (signature.sign < 0) {
        const effect = { effectName: signature.key, type: ['alteration'], effectDuration: signature.durationMs / 1000 };
        if (attemptAlterationResistance(attacker, target, effect).canceled) return { applied: false, canceled: true };
        return applyNatureResistance(target, { ...signature,
          amount: calculateResilienceEffectIntensity(target, signature.amount) }, attack.criticalProperties?.stacks ?? 1);
      }
      return applyNatureResistance(target, signature);
    }
    const amount = Math.floor(Math.max(0, Number(target.stats.HP.max) || 0) * signature.percent / 100);
    if (amount <= 0) return null;
    const heal = signature.key === 'effusion';
    const nature = heal ? 'magicalDamage' : ['physicalDamage', 'magicalDamage', 'piercingDamage'][Math.floor(Math.random() * 3)];
    const sourceKey = { physicalDamage: 'physical', magicalDamage: 'magical', piercingDamage: 'piercingDamage' }[nature];
    const sources = { [sourceKey]: amount };
    // Resolve through the ordinary pipeline, but never recurse into signatures, crits or mastery.
    return applyDamage(target, amount, attacker, {
        functionName: signature.key, displayName: signature.label,
        launchContextId: `${attack.launchContextId || 'nature'}:${signature.key}`,
        natureEffectSecondary: true, combatFunction: heal ? 'Support' : 'Attaquant',
        attacknature: [nature], attackRange: attack.attackRange, attackTarget: [heal ? 'ally' : 'enemy'],
        effets: [], selfEffects: [], forceDamageSources: sources,
    }, sources);
}


function removeNatureCapacity(target, effect) {
  if (!effect.signature.corruption) { effect.boost.remove(); return; }
  target.stats.HP = corruptHealthCapacity(target.stats.HP, 0);
  toggleEffectClass(target, 'corruptionPrismatique', 'remove');
  saveEntityHPToStorage(target);
  presentEntityVitals(target);
}

function bindCorruptionHelper(target, effect) {
  setEntityEffectView(target, `${target.id}-nature-corruptionPrismatique`, {
    kind: 'corruptionPrismatique', label: 'Corruption prismatique', type: 'nature', stat: 'HP',
    endAt: () => effect.expiresAt,
    read: () => ({ html: `PV maximum retirés : ${effect.amount}. Durée : 20 secondes, renouvelée à chaque cumul. Ne peut pas tuer. Le retour des PV maximum ne soigne pas.` }),
  });
}

export function corruptionPrismatique(target, effect, attacker) {
  if (!target?.stats?.HP || target.isDEAD || target.stats.HP.current <= 0) return false;
  const amount = calculateResilienceEffectIntensity(target, effect.effectAmount);
  if (!(amount > 0)) return false;
  let effects = natureEffects.get(target);
  if (!effects) natureEffects.set(target, effects = new Map());
  let state = effects.get('corruptionPrismatique');
  if (!state) {
    state = { signature: { key: 'corruptionPrismatique', corruption: true }, amount: 0 };
    effects.set('corruptionPrismatique', state);
  }
  state.amount += amount;
  state.expiresAt = clockNow() + 20000;
  target.stats.HP = corruptHealthCapacity(target.stats.HP, state.amount);
  saveEntityHPToStorage(target); presentEntityVitals(target); bindCorruptionHelper(target, state);
  scheduleNatureExpiration();
  return true;
}

export function exaust(target, effect, attacker, onEnd) {
  onEnd?.();
  if (!target?.stats?.shift || target.isDEAD) return false;
  const available = Math.max(0, Number(target.stats.shift.current) || 0);
  if (available >= 1) spendMovementCharges(target, 1);
  // Existing movement orders may carry debt. An ignored withdrawal must not repay it.
  saveEntityMovementState(target); updateMovementDisplay(target);
  if (available >= 1) {
    EffectMessage(target, 'Exaust !', 'normal', { effectKey: 'exaust' });
    showMovementLossPopup(document.getElementById(`effectsContainer_${target.id}`), 1);
  }
  return available >= 1;
}
exaust.tacticalConsequence = ['direct']; exaust.tacticalScope = 'attack';

export function dephasage(target, effect, attacker, onEnd) {
  onEnd?.();
  const applied = applyControlRecoil(target, calculateResilienceEffectIntensity(target, effect.effectAmount), { allTimings: true });
  if (applied) updateSpectralTimingFeedback(target);
  return applied;
}
dephasage.tacticalConsequence = ['direct']; dephasage.tacticalScope = 'attack';
corruptionPrismatique.tacticalConsequence = ['temporaire']; corruptionPrismatique.tacticalScope = 'attack';

export function applySpectralRecoil(target, attacker, hpDamage, hpMax) {
  if (!(hpDamage > 0 && hpMax > 0) || target.isDEAD) return false;
  const effect = { effectName: 'dephasage', type: ['alteration'], effectAmount: hpDamage / hpMax * 100 };
  if (attemptAlterationResistance(attacker, target, effect).canceled) return false;
  return dephasage(target, effect);
}

export function prepareCriticalImpact(target, attacker, attack, plan) {
  return { ...plan, neighbours: plan.explosion > 0 ? getAdjacentEntities(target)
    .filter(other => !other.isDEAD && other.stats?.HP?.current > 0 && getCombatSide(other) === getCombatSide(target)) : [] };
}

// A synchronous FIFO avoids JS recursion even when an explosion critically explodes again.
// It only exists during an impact and is emptied in finally, with no idle timer.
const criticalExplosions = [];
let drainingCriticalExplosions = false;
export function applyCriticalNatureEffects(target, attacker, attack, plan, hpDamage, hpMax) {
  const nature = getAttackNatureRules(attack);
  if (!target.isDEAD && target.stats.HP.current > 0) {
    if (plan.burn > 0 && plan.burnSeconds > 0) {
      const effect = { effectName: 'brulure', effectDisplay: 'Brûlure', type: ['alteration'],
        effectDot: plan.burn, effectDuration: plan.burnSeconds, effectTickInterval: 1,
        criticalBurn: true, criticalLifesteal: plan.lifesteal, spectralBurn: nature.key === 'magical-piercing',
        provenance: effectProvenance(attacker, attack, { effectName: 'brulure' }) };
      if (!attemptAlterationResistance(attacker, target, effect).canceled) brulure(target, effect, attacker);
    }
    if (nature.key === 'physical-piercing') {
      const effect = { effectName: 'exaust', type: ['entrave'] };
      if (!attemptAlterationResistance(attacker, target, effect).canceled) exaust(target);
    }
    if (nature.key === 'magical-piercing') applySpectralRecoil(target, attacker, hpDamage, hpMax);
    if (plan.corruption > 0) {
      const effect = { effectName: 'corruptionPrismatique', type: ['alteration'], effectAmount: plan.corruption };
      if (!attemptAlterationResistance(attacker, target, effect).canceled) corruptionPrismatique(target, effect, attacker);
    }
  }
  const share = Math.floor(plan.explosion / (plan.neighbours.length || 1));
  if (share <= 0) return;
  for (const neighbour of plan.neighbours) criticalExplosions.push({ target: neighbour, attacker, attack, share });
  if (drainingCriticalExplosions) return;
  drainingCriticalExplosions = true;
  try {
    for (let i = 0; i < criticalExplosions.length; i++) {
      const hit = criticalExplosions[i];
      if (hit.target.isDEAD || hit.target.stats.HP.current <= 0) continue;
      const sources = { magical: hit.share };
      applyDamage(hit.target, hit.share, hit.attacker, {
        functionName: 'criticalExplosion', displayName: 'Explosion critique', launchContextId: 'critical-explosion',
        criticalExplosion: true, natureEffectSecondary: true, combatFunction: 'Attaquant',
        essenceSlots: [{ color: 'blue', active: true }], attacknature: ['magicalDamage'],
        attackRange: hit.attack.attackRange, attackTarget: ['enemy'], effets: [], selfEffects: [], forceDamageSources: sources,
      }, sources);
      criticalExplosions[i] = null;
    }
  } finally { criticalExplosions.length = 0; drainingCriticalExplosions = false; }
}

export function toggleEffectClass(target, effectName, action = 'add') {
    // Vérifie si effectName est défini et n'est pas une chaîne vide ou "none"
    if (!effectName || effectName.trim() === '' || effectName.toLowerCase() === 'none') {
        return; // Sortie anticipée si effectName n'est pas valide
    }

    const entityDiv = document.getElementById(`spriteContainer_${target.id}`);
    if (entityDiv) {
        const effectClassName = effectName.toLowerCase(); // Transforme le nom de l'effet en minuscules pour la classe
        if (action === 'add') {
            entityDiv.classList.add(effectClassName);
        } else if (action === 'remove') {
            // Supprime la classe sauf si elle est "none"
            if (effectClassName !== 'none') {
                entityDiv.classList.remove(effectClassName);
            }
        }
    }
}

// Keep the original one-second cadence and prorate the final, possibly partial tick.
// Absolute deadlines prevent timer drift from extending an alteration.
export function scheduleAlterationTicks({ duration, isActive, onTick, onEnd, onTimer, state = {}, interval = 1 }) {
  const start = state.start ?? clockNow();
  state.start = start;
  let elapsed = state.elapsed || 0, index = state.index || 0;
  if (!(duration > 0) || !Number.isFinite(duration)) { onEnd(); return; }
  function schedule() {
    const next = Math.min(duration, elapsed + Math.max(0.05, Number(interval) || 1));
    onTimer(setTimeout(() => {
      if (!isActive()) { onEnd(); return; }
      const seconds = next - elapsed;
      elapsed = next;
      const final = elapsed >= duration;
      state.elapsed = elapsed; state.index = index + 1;
      onTick({ elapsed, seconds, index: index++, final });
      if (final || !isActive()) onEnd(); else schedule();
    }, Math.max(0, start + next * 1000 - clockNow())));
  }
  schedule();
}

const num = v => Number.isFinite(+v) ? +v : 0;
const dotRuntimes = new Map();

function syncDotVisual(target, kind, active = true) {
  const id = `${kind}VFX_${target.id}`;
  let vfx = document.getElementById(id);
  if (!active) { vfx?.remove(); return; }
  const container = document.getElementById(`effectsContainer_${target.id}`);
  if (!container) return;
  const magical = kind === 'brulure' && activeAlterations.has(`${target.id}:critical-brulure`);
  const className = `effect-vfx ${kind === 'brulure' ? 'burn' : 'poison'}${magical ? ' magical-burn magicalDamage' : ''}`;
  if (!vfx) {
    vfx = document.createElement('img'); vfx.id = id; vfx.className = className;
    vfx.alt = ''; vfx.src = cachedResourceUrl(`./media/assets/effects/${kind === 'brulure' ? 'burn' : 'poison'}.gif`);
    container.append(vfx);
  } else setDisplayClass(vfx, className);
}

function removeDotEffect(key) {
  const state = activeAlterations.get(key), runtime = dotRuntimes.get(key);
  if (!state) return;
  cancelCombatTask(runtime?.timer);
  activeAlterations.delete(key); dotRuntimes.delete(key); removeEntityEffectView(key);
  const target = runtime?.target;
  if (!target) return;
  const active = [...activeAlterations.values()].some(other => other.target === state.target && other.kind === state.kind);
  syncDotVisual(target, state.kind, active);
  if (!active) {
    toggleEffectClass(target, state.kind, 'remove');
    if (state.kind === 'brulure') target.brulureStacks = 0;
    runtime.onEnd?.();
  }
}

function syncBurnView(target, state) {
  state.perSecond = burnPower(state) / state.effect.effectTickInterval;
  state.capacity = Object.values(state.sources).reduce((sum, source) => sum + source.capacity, 0);
  target.brulureStacks = Object.values(state.sources).reduce((sum, source) => sum + source.values.length, 0);
}

function runDot(key, target, state, attacker, onEnd) {
  const existing = dotRuntimes.get(key);
  cancelCombatTask(existing?.timer);
  const runtime = { target, onEnd, sources: existing?.sources || new Map(), timer: null };
  // Critical properties are stored on each contribution; ordinary offensive stats
  // follow the live source on ticks, identically before and after a pause/reload.
  runtime.sources.set(String(attacker.id), state.criticalBurn
    ? [...entites, ...removedEntities].find(entity => String(entity.id) === String(attacker.id)) || attacker : attacker);
  dotRuntimes.set(key, runtime); activeAlterations.set(key, state);
  toggleEffectClass(target, state.kind, 'add');
  state.runtimeKey = key;
  syncDotVisual(target, state.kind);
  const damage = (raw, sourceId, rounding, properties = {}) => {
    const source = runtime.sources.get(String(sourceId)) || [...entites, ...removedEntities].find(entity => String(entity.id) === String(sourceId)) || attacker;
    applyDotTick(target, state, Math.max(0, raw), source, {
      dotname: state.effect.effectDisplay, combatFunction: 'Attaquant', attackTarget: ['enemy'],
      effets: [], popup: `${state.kind}-dot`, attacknature: ['magicalDamage'], type: ['alteration'],
      alterationRounding: rounding, forceDamageSources: { magical: raw },
      ...properties,
    });
  };
  const schedule = () => {
    if (activeAlterations.get(key) !== state) return;
    runtime.timer = scheduleCombatImpactTask(Math.min(state.nextTickAt, state.expiresAt), () => {
      if (activeAlterations.get(key) !== state) return;
      if (target.isDEAD) return () => removeDotEffect(key);
      return tick;
    });
    runtime.timer.promise.catch(error => console.error('[EffectTick]', error));
  };
  const tick = () => {
    if (activeAlterations.get(key) !== state) return;
    if (target.isDEAD) { removeDotEffect(key); return; }
    const now = clockNow();
    if (state.criticalBurn) {
      const until = Math.min(now, state.expiresAt);
      const fraction = Math.min(1, Math.max(0, until - state.accruedAt) / Math.max(1, state.expiresAt - state.accruedAt));
      state.accruedAt = until;
      for (const source of Object.values(state.sources)) {
        const deal = source.remaining * fraction;
        source.remaining -= deal;
        damage(deal, source.attacker, source.rounding ||= {}, {
          criticalBurn: true, spectralBurn: source.spectralBurn, criticalLifesteal: source.lifesteal,
          criticalRounding: source.criticalRounding ||= {},
          natureEffectSecondary: true,
          essenceSlots: [{ color: 'blue', active: true }],
        });
        if (activeAlterations.get(key) !== state) return;
      }
      if (now >= state.expiresAt) { removeDotEffect(key); return; }
      state.nextTickAt += state.effect.effectTickInterval * 1000;
    } else if (state.kind === 'brulure') {
      if (state.nextTickAt <= now) {
        const hp = Number(target.combatDetails?.hpDamageReceived) || 0, armor = Number(target.combatDetails?.armorDamageReceived) || 0;
        for (const source of Object.values(state.sources)) {
          source.pending = (source.pending || 0) + source.values.reduce((a,b) => a+b, 0);
          const deal = Math.floor(source.pending + 1e-9); source.pending -= deal;
          damage(deal, source.attacker, source.rounding ||= {});
          if (activeAlterations.get(key) !== state) return;
        }
        state.lastTick = { hp: (Number(target.combatDetails?.hpDamageReceived) || 0) - hp,
          armor: (Number(target.combatDetails?.armorDamageReceived) || 0) - armor };
        state.nextTickAt += state.effect.effectTickInterval * 1000;
      }
      if (state.expiresAt <= now) {
        if (!decayBurn(state, state.rules)) { removeDotEffect(key); return; }
        syncBurnView(target, state);
      }
    } else {
      const until = Math.min(now, state.expiresAt);
      state.pending = (state.pending || 0) + Math.max(0, until - state.accruedAt) / 1000 * state.perSecond;
      state.accruedAt = until;
      const deal = Math.floor(state.pending + 1e-9); state.pending -= deal;
      damage(deal, state.attacker, state.rounding ||= {});
      if (activeAlterations.get(key) !== state) return;
      if (state.expiresAt <= now) { removeDotEffect(key); return; }
      state.nextTickAt += state.effect.effectTickInterval * 1000;
    }
    refreshEntityEffectViews(target); schedule();
  };
  createDotHelper(key, target, state); schedule();
}

export function poison(target, effect, attacker, onEnd, saved = null) {
  if (!target?.stats?.HP || target.isDEAD || target.stats.HP.current <= 0) return false;
  effect = { ...defaultEffect('poison', attacker), ...effect };
  effect = { ...effect, provenance: effect.provenance || effectProvenance(attacker, null, effect) };
  const key = effectRuntimeKey(target, effect), now = clockNow();
  const { baseDuration, duration } = saved || getAlterationTiming(target, effect);
  let previous = activeAlterations.get(key), nextTickAt = previous?.nextTickAt;
  if (!saved && effect.applicationMode === 'replace') {
    const matching = [...activeAlterations].filter(([,state]) => state.kind === 'poison' && state.target === target.id);
    nextTickAt = matching.length ? Math.min(...matching.map(([,state]) => state.nextTickAt)) : undefined;
    for (const [other] of matching) removeDotEffect(other);
    previous = null;
  }
  if (!(duration > 0)) { removeDotEffect(key); return false; }
  const total = num(effect.effectDot) + Math.ceil(num(getSafe(attacker, 'physicalDamage', 0)) * num(effect.effectPhysicalRatio))
    + Math.ceil(num(getSafe(attacker, 'magicalDamage', 0)) * num(effect.effectMagicalRatio));
  const state = saved || { kind: 'poison', target: target.id, attacker: attacker.id, effect: combatData(effect), baseDuration, duration,
    expiresAt: now + duration * 1000, nextTickAt: nextTickAt ?? now + effect.effectTickInterval * 1000,
    perSecond: total / baseDuration, accruedAt: now,
    pending: (previous?.pending || 0) + (previous ? Math.max(0, now - previous.accruedAt) / 1000 * previous.perSecond : 0),
    rounding: previous?.rounding || {}, lastTick: previous?.lastTick };
  runDot(key, target, state, attacker, onEnd);
  if (!saved) EffectMessage(target, 'Poison !', 'normal', { effectKey: 'poison', durationSeconds: (state.expiresAt - now) / 1000 });
  return true;
}

export function brulure(target, effect, attacker, onEnd, saved = null) {
  if (!target?.stats?.HP || target.isDEAD || target.stats.HP.current <= 0) return false;
  effect = { ...defaultEffect('brulure', attacker), ...effect };
  effect = { ...effect, provenance: effect.provenance || effectProvenance(attacker, null, effect) };
  if (effect.criticalBurn || saved?.criticalBurn) {
    effect.effectDisplay = EFFECT_VISUALS.magicalBurn.label;
    const key = `${target.id}:critical-brulure`, now = clockNow();
    const state = saved || activeAlterations.get(key) || { kind: 'brulure', criticalBurn: true,
      target: target.id, attacker: attacker.id, sources: {}, nextTickAt: now + 1000 };
    if (!saved) {
      if (!(effect.effectDuration > 0 && effect.effectDot > 0)) return false;
      const sourceKey = `${effect.provenance}:${effect.spectralBurn === true}`;
      const source = state.sources[sourceKey] ||= { attacker: attacker.id, remaining: 0, lifesteal: 0, spectralBurn: effect.spectralBurn };
      const added = effect.effectDot;
      source.lifesteal = (source.remaining * source.lifesteal + added * (effect.criticalLifesteal || 0)) / (source.remaining + added);
      source.remaining += added;
      state.effect = combatData(effect); state.accruedAt = now;
      state.expiresAt = now + effect.effectDuration * 1000;
    }
    runDot(key, target, state, attacker, onEnd);
    if (!saved) EffectMessage(target, `${effect.effectDisplay} !`, 'normal', {
      effectKey: 'magicalBurn',
      durationSeconds: (state.expiresAt - now) / 1000,
    });
    return true;
  }
  const key = `${target.id}:brulure`, now = clockNow();
  let state = saved || activeAlterations.get(key);
  if (!state) {
    const rules = { ...burnRules() };
    state = { kind: 'brulure', target: target.id, attacker: attacker.id,
      effect: { ...combatData(effect), effectDuration: rules.maintenanceSeconds, effectTickInterval: rules.tickSeconds },
      rules, sources: {}, nextTickAt: now + rules.tickSeconds * 1000 };
  }
  if (!saved) feedBurn(state, { ...effect, sourceLabel: effect.sourceLabel || attacker.name, sourcePortrait: effect.sourcePortrait || attacker.portrait }, attacker.id, now, state.rules);
  syncBurnView(target, state);
  runDot(key, target, state, attacker, onEnd);
  if (!saved) EffectMessage(target, 'Brûlure !', 'normal', { effectKey: 'brulure', durationSeconds: (state.expiresAt - now) / 1000 });
  return true;
}

export function getActiveEffectStates(target) {
  return [...activeAlterations.values(), ...[...controlEffects.values()].map(entry => entry.state)]
    .filter(state => !target || String(state.target) === String(target.id));
}

export function clearCombatEffects(target = null) {
  clearSpectralTimingFeedback(target);
  for (const [key, state] of activeAlterations) if (!target || state.target === target.id) removeDotEffect(key);
  clearControlEffects(target); clearAttackNatureEffects(target); clearAstralityEffects(target); clearTranscendentalCooldown(target); clearIndestructibilityCooldown(target); clearEsoterismCooldown(target);
}


export function heal(target, restoredHP = 0) {
    return showHealingFeedback(target, restoredHP);
}

// Read-only scoring metadata. Resolving these properties never runs combat.
poison.tacticalConsequence = ['periodique', 'temporaire', 'degats', 'fixe', 'proportionnel'];
poison.tacticalScope = 'damage';
brulure.tacticalConsequence = ['periodique', 'temporaire', 'degats', 'fixe'];
brulure.tacticalScope = 'damage';
heal.tacticalConsequence = ['soin', 'proportionnel'];
heal.tacticalScope = 'healing';
rez.tacticalConsequence = ['resurrection', 'fixe'];
lifesteal.tacticalConsequence = ['soin', 'proportionnel'];
lifesteal.tacticalScope = 'healing';


export function rez(target, options = {}) {
    if (!target?.isDEAD || target.corpseConsumed || target.corpseDestroyed) return false;
    target.isDEAD = false;
    target.dead = false;
    target.stats.HP.current = Math.min(target.stats.HP.max, Math.max(1, Number(options?.restoredHP ?? 10) || 10));
    target.statut = ['alive'];
    target.hasDeathBeenLogged = false;
    target.hasAlreadyDeadBeenLogged = false;
    recordEntityCombatStat(target, 'resurrections');
    recordEntityHealingReceived(target, target.stats.HP.current);
    saveEntityHPToStorage(target);
    updateEntityStatusInStorage(target);

    const renderResurrection = () => {
        const oldBox = document.getElementById(`Box_Entite_${target.id}`);
        const hex = oldBox?.closest('.hex');
        if (hex) {
            oldBox.remove();
            const { element } = createEntiteInDOM(target);
            hex.appendChild(element);
            syncEntityFootprints(hex.closest('.hex-grid, #hexGrid') || hex.parentElement);
            hex.classList.add('occupied');
            hex.dataset.occupiedBy = target.id;
            const effects = element.querySelector('.effects-container');
            if (effects) {
                const vfx = document.createElement('img');
                vfx.src = cachedResourceUrl('./media/assets/effects/rez.gif');
                vfx.className = 'effect-vfx extraLife';
                effects.appendChild(vfx);
                setTimeout(() => vfx.remove(), 1000);
            }
        }
        if (gameStarted) {
            setTimeout(() => {
                if (!target.isDEAD) entiteTurn(target, entites.filter(e => e.side !== target.side));
            }, 0);
        }
    };
    if (options.feedback) options.feedback.push(renderResurrection);
    else renderResurrection();
    return true;
}


export function lifesteal(attacker, totalReducedDamage, attackEffects, range = 'other') {
  if (!attacker?.stats?.HP || attacker.isDEAD || attacker.stats.HP.current <= 0) return;
  if (!attackEffects || attackEffects.effectName !== 'lifesteal') {
    console.warn(`⚠️ lifesteal() a été appelé sans attackEffects valide.`);
    return;
  }
  console.log(`--- [Lifesteal Debug] ---`);
  console.log(`Attaquant : ${attacker.name}`);
  console.log(`Dégâts après résistances : ${totalReducedDamage}`);
  console.log(`Effect ID : ${attackEffects.effectId}`);
  console.log(`Effect Projectile : ${attackEffects.effectProjectile}`);
  console.log(`Effect Magical Ratio : ${attackEffects.effectMagicalRatio}`);
  const currentHP = Math.max(0, Number(attacker.stats.HP.current) || 0);
  const maxHP = Math.max(0, Number(attacker.stats.HP.max) || 0);
  const reducedDamage = Math.max(0, Number(totalReducedDamage) || 0);
  const magicalDamage = Math.max(0, Number(getSafe(attacker, "magicalDamage", 0)) || 0);
  const magicalRatio = Math.max(0, Number(attackEffects.effectMagicalRatio) || 0);
  const baseLifesteal = Math.floor(reducedDamage * 0.2);
  const bonusMagicalLifesteal = Math.floor(magicalDamage * magicalRatio);
  const calculatedHeal = baseLifesteal + bonusMagicalLifesteal;
  const newHP = Math.min(maxHP, currentHP + calculatedHeal);
  const restoredHP = newHP - currentHP;
  console.log(`Base Lifesteal (20%) : ${baseLifesteal}`);
  console.log(`Bonus via magicalDamage : ${magicalDamage} × ${magicalRatio} = ${bonusMagicalLifesteal}`);
  console.log(`Soin calculé : ${calculatedHeal}`);
  console.log(`Soin réellement appliqué : ${restoredHP}`);
  if (restoredHP <= 0) return;
  attacker.stats.HP.current = newHP;
  // Sauvegarde immédiate des HP
  saveEntityHPToStorage(attacker);
  showHealingFeedback(attacker, restoredHP);
  attacker.totalHeal = (Number(attacker.totalHeal) || 0) + restoredHP;
  updateTotalHealCounter(attacker.id, attacker.totalHeal);
  recordEntityLifeSteal(attacker, restoredHP, range);
  updateHealthBar(attacker.stats.HP.current, attacker.stats.HP.max, attacker.stats.armor?.current || 0, attacker.stats.armor?.max || 0, attacker.id, attacker.stats.HP.uncorruptedMax || 0);
  updateScoreDisplay(updateScore(attacker, restoredHP));
}

export function LifestealBloodFury(attacker, target, hpLoss, bloodFuryPercent, range = 'other') {
  if (!attacker || !target || attacker.isDEAD || attacker.stats?.HP?.current <= 0) return;
  if (bloodFuryPercent <= 0) return;

  console.log("🩸 Bloodfury déclenchée juste avant la perte de HP !");

  // 💉 Calcul du soin
  const healAmount = Math.round((hpLoss * bloodFuryPercent) / 100);

  let restoredHP = 0;
  // 💚 Application du soin à l’attaquant
  if (healAmount > 0 && attacker?.stats?.HP) {
    const hpBeforeHeal = Math.max(0, Number(attacker.stats.HP.current) || 0);
    attacker.stats.HP.current = Math.min(
      attacker.stats.HP.max,
      hpBeforeHeal + healAmount
    );
    restoredHP = Math.max(0, attacker.stats.HP.current - hpBeforeHeal);

    saveEntityHPToStorage(attacker);
    updateHealthBar(
      attacker.stats.HP.current,
      attacker.stats.HP.max,
      attacker.stats.armor?.current || 0,
      attacker.stats.armor?.max || 0,
      attacker.id
    );
  }

  showHealingFeedback(attacker, restoredHP);
  if (restoredHP > 0) {
    attacker.totalHeal = (Number(attacker.totalHeal) || 0) + restoredHP;
    updateTotalHealCounter(attacker.id, attacker.totalHeal);
    recordEntityLifeSteal(attacker, restoredHP, range);
  }

  // 🧮 LOG DÉTAILLÉ DU CALCUL
  console.log(`💉 ${attacker.name} bénéficie du vol de vie :`);
  console.log(`   • Dégâts réels infligés à ${target.name} : ${hpLoss}`);
  console.log(`   • Pourcentage Blood Fury : ${bloodFuryPercent}%`);
  console.log(`   • Montant soigné : (${hpLoss} × ${bloodFuryPercent}%) ÷ 100 = ${healAmount}`);
  console.log(`   • HP actuel après soin : ${attacker.stats.HP.current}/${attacker.stats.HP.max}`);
}

registerCombatState('alterations', () => combatData([...activeAlterations.values(), ...[...controlEffects.values()].map(entry => entry.state)]), (saved, { removed = [] }) => {
  for (const key of activeAlterations.keys()) removeDotEffect(key);
  for (const key of controlEffects.keys()) removeControlEffect(key, { preserveBoost: true, preserveSize: true });
  for (const entry of saved) {
    const target = entites.find(entity => entity.id === entry.target);
    const attacker = [...entites, ...removed].find(entity => entity.id === entry.attacker);
    const handler = entry.effect.statKey ? statModifier
      : { poison, brulure, lourdeur, gigantisme, immobilisation, stun, silence, interruption, bafouillage, lenteur, folie, insolence, confusion, charme, effroi, sommeil }[entry.kind];
    if (target && attacker && !target.isDEAD && handler) handler(target, entry.effect, attacker, null, entry);
  }
});
registerCombatState('nature-effects', () => [...natureEffects].map(([entity, effects]) => ({
  entity: entity.id, effects: [...effects].map(([key, effect]) => ({ key, amounts: effect.amounts,
    amount: effect.amount, signature: effect.signature, expiresAt: effect.expiresAt, boostId: effect.boost?.id }))
})), saved => {
  for (const [entity, effects] of natureEffects) for (const key of effects.keys()) removeEntityEffectView(`${entity.id}-nature-${key}`);
  clearInterval(natureEffectsTimer); natureEffectsTimer = null;
  natureEffects.clear();
  for (const entry of saved) {
    const entity = entites.find(candidate => candidate.id === entry.entity);
    if (!entity) continue;
    const effects = new Map(); natureEffects.set(entity, effects);
    for (const data of entry.effects) {
      if (data.signature.corruption) {
        effects.set(data.key, data); bindCorruptionHelper(entity, data); continue;
      }
      const boost = Object.values(entity.battleBoosts || {}).flat().find(b => b.id === data.boostId);
      if (!boost) throw new Error('Bonus de nature absent de la sauvegarde.');
      const effect = { ...data, boost };
      bindNatureEffectHelper(entity, effect);
      effects.set(data.key, effect);
    }
  }
  scheduleNatureExpiration();
});
for (const event of ['battleEnding', 'battleStopped', 'battleResolved', 'stageInterfaceClosing']) window.addEventListener(event, () => clearCombatEffects());

// Astralité uses the same combat deadlines, effect views and pause snapshots as
// other timed mechanics. Timers stay outside the serializable entity data.
const astralStates = new Map(), astralTasks = new Map();
const astralAlive = entity => entity && !entity.isDEAD && !entity.hasFled && !entity.battleStopped
  && !entity.statut?.includes('dead') && Number(entity.stats?.HP?.current) > 0;
function syncAstralityClock(entity, now = clockNow()) {
  const state = astralStates.get(entity);
  if (!state) return null;
  const sleeping = getSleepElapsed(entity, state.clockAt ?? now, now);
  state.clockAt = now;
  if (sleeping > 0) {
    for (const key of ['nextCheckAt', 'survivalReadyAt']) if (state[key] != null) state[key] += sleeping;
    // Sleep pauses healing and future procs, not an already active immunity.
    if (state.return) {
      state.return.startedAt += sleeping;
      state.return.expiresAt += sleeping;
    }
  }
  return state;
}
export function getAstralityRuntime(entity) { return syncAstralityClock(entity); }
export function isAstralReturnActive(entity) {
  return (syncAstralityClock(entity)?.return?.expiresAt || 0) > clockNow();
}
export function astralCooldownRemaining(entity) {
  return Math.max(0, (syncAstralityClock(entity)?.survivalReadyAt || 0) - clockNow()) / 1000;
}
export function startAstralCooldown(entity) {
  const { seconds } = globalThis.umbraProgression.astralCooldownDetails(getSafe(entity, 'astrality', 0), getSafe(entity, 'agility', 0));
  if (!(seconds > 0) || !Number.isFinite(seconds)) return;
  const state = syncAstralityClock(entity) || {};
  state.survivalReadyAt = clockNow() + seconds * 1000;
  astralStates.set(entity, state); armAstrality(entity);
}
export function isAstralBodyActive(entity) {
  return astralAlive(entity) && Number(getSafe(entity, 'astrality', 0)) > 0
    && (syncAstralityClock(entity)?.body?.expiresAt || 0) > clockNow();
}
export function blocksAstralSpell(entity, attack) {
  return isAstralBodyActive(entity) && attack?.combatFunction === 'Attaquant'
    && !attack.natureEffectSecondary && !attack.type?.includes('alteration')
    && getAttackNatureRules(attack).key === 'blue';
}
function astralReturnView(entity, active) {
  document.querySelectorAll(`.health-bar[data-entity-id="${entity.id}"]`).forEach(bar => {
    bar.classList.toggle('astral-return-active', active);
  });
}
function astralView(entity, state) {
  syncAstralityClock(entity);
  astralReturnView(entity, (state.return?.expiresAt || 0) > clockNow());
  const active = (state.body?.expiresAt || 0) > clockNow();
  const sprite = document.getElementById(`spriteContainer_${entity.id}`);
  sprite?.classList.toggle('astral-body-active', active);
  if (sprite && active) sprite.style.setProperty('--astral-opacity', String(globalThis.umbraProgression.astrality.astralBody.opacity));
  for (const [kind, label] of [['body', 'Corps astral'], ['return', 'Retour astral']]) {
    const effect = state[kind], key = `${entity.id}-astral-${kind}`;
    if (!effect || effect.expiresAt <= clockNow()) { removeEntityEffectView(key); continue; }
    setEntityEffectView(entity, key, { kind: kind === 'body' ? 'astralBody' : 'astralReturn', label,
      stat: 'astrality', type: 'passive', endAt: () => {
        syncAstralityClock(entity);
        return effect.expiresAt;
      },
      read: () => ({ html: kind === 'body'
        ? 'Les attaques magiques pures hostiles ratent : dégâts et malus annulés.'
        : `Restauration : ${effect.delivered} / ${effect.amount} HP distribués. Survie fatale indisponible jusqu’à la fin de l’effet.` }) });
  }
}
function armAstrality(entity) {
  cancelCombatTask(astralTasks.get(entity)); astralTasks.delete(entity);
  const state = syncAstralityClock(entity); if (!state) return;
  if (isEntityAsleep(entity)) {
    const now = clockNow();
    const wakeAt = Math.max(now, ...(entity.controlIntervals?.sommeil || [])
      .filter(interval => interval.start <= now && interval.end > now).map(interval => interval.end));
    const next = Math.min(wakeAt, state.body?.expiresAt ?? Infinity);
    astralTasks.set(entity, scheduleCombatTask(() => tickAstrality(entity), Math.max(0, next - now)));
    return;
  }
  const returning = state.return;
  const healAt = returning && returning.delivered < returning.amount
    ? returning.startedAt + returning.durationMs * Math.min(returning.amount, returning.delivered + returning.tickAmount) / returning.amount
    : returning?.expiresAt;
  const next = Math.min(state.body?.expiresAt ?? state.nextCheckAt ?? Infinity, healAt ?? Infinity, state.survivalReadyAt ?? Infinity);
  if (Number.isFinite(next)) astralTasks.set(entity, scheduleCombatTask(() => tickAstrality(entity), Math.max(0, next - clockNow())));
}
function tickAstrality(entity) {
  astralTasks.delete(entity);
  const state = syncAstralityClock(entity);
  if (!state) return;
  if (!astralAlive(entity) || isBattleFinished()) { clearAstralityEffects(entity); return; }
  const now = clockNow(), P = globalThis.umbraProgression;
  if (state.body && now >= state.body.expiresAt) {
    delete state.body;
    state.nextCheckAt = now + P.astrality.astralBody.checkSeconds * 1000;
  }
  if (isEntityAsleep(entity)) { astralView(entity, state); armAstrality(entity); return; }
  if (now >= state.survivalReadyAt) delete state.survivalReadyAt;
  const returning = state.return;
  if (returning) {
    // Compare the same absolute deadline used by armAstrality. Deriving a tick
    // count from elapsed / duration loses precision at epoch-sized dates and
    // can endlessly reschedule the same instant in the virtual-time simulator.
    let due = returning.delivered;
    while (due < returning.amount) {
      const next = Math.min(returning.amount, due + returning.tickAmount);
      if (now < returning.startedAt + returning.durationMs * next / returning.amount) break;
      due = next;
    }
    const portion = Math.max(0, due - returning.delivered);
    returning.delivered += portion;
    const actual = Math.max(0, Math.min(portion, entity.stats.HP.max - entity.stats.HP.current));
    if (actual > 0) {
      entity.stats.HP.current += actual;
      entity.totalHeal = (Number(entity.totalHeal) || 0) + actual;
      recordEntityHealingReceived(entity, actual);
      saveEntityHPToStorage(entity); updateTotalHealCounter(entity.id, entity.totalHeal);
      updateHealthBar(entity.stats.HP.current, entity.stats.HP.max, entity.stats.armor?.current || 0, entity.stats.armor?.max || 0, entity.id, entity.stats.HP.uncorruptedMax || 0);
      showHealingFeedback(entity, actual);
    }
    if (now >= returning.expiresAt) delete state.return;
  }
  if (!state.body && now >= state.nextCheckAt) {
    const points = Number(getSafe(entity, 'astrality', 0)) || 0;
    const body = P.astralBodyDetails(points, getSafe(entity, 'intelligence', 0), undefined, P.getUmbraThreshold(entity));
    if (canEntityProc(entity) && points > 0 && Math.random() * 100 < body.value) {
      state.body = { startedAt: now, expiresAt: now + body.seconds * 1000 };
      delete state.nextCheckAt;
      recordEntityCombatProc(entity, 'astralBody');
      EffectMessage(entity, 'Corps astral !');
    } else state.nextCheckAt = now + P.astrality.astralBody.checkSeconds * 1000;
  }
  if (!state.return && !state.body && state.nextCheckAt == null && state.survivalReadyAt == null) {
    clearAstralityEffects(entity); return;
  }
  astralView(entity, state); armAstrality(entity);
}
export function ensureAstralityEffects(entity) {
  if (!gameStarted || !astralAlive(entity) || isBattleFinished()
    || !(Number(getSafe(entity, 'astrality', 0)) > 0)) return;
  const state = syncAstralityClock(entity) || {};
  if (state.body || state.nextCheckAt != null) return;
  state.nextCheckAt = clockNow() + globalThis.umbraProgression.astrality.astralBody.checkSeconds * 1000;
  astralStates.set(entity, state);
  armAstrality(entity);
}
export function startAstralReturn(entity) {
  if (!canEntityProc(entity)) return false;
  const P = globalThis.umbraProgression;
  const result = P.astralReturnDetails(getSafe(entity, 'astrality', 0), getSafe(entity, 'strength', 0), entity.stats?.HP?.max, getSafe(entity, 'agility', 0));
  if (!(result.points > 0) || !(result.seconds > 0) || isAstralReturnActive(entity)) return false;
  const state = syncAstralityClock(entity) || {};
  if (!state.body && state.nextCheckAt == null) state.nextCheckAt = clockNow() + P.astrality.astralBody.checkSeconds * 1000;
  recordEntityCombatProc(entity, 'astralReturn');
  const now = clockNow();
  state.survivalReadyAt = now + result.seconds * 1000;
  state.return = { startedAt: now, expiresAt: state.survivalReadyAt,
    durationMs: result.seconds * 1000, amount: result.amount, delivered: 0, tickAmount: result.tickAmount };
  astralStates.set(entity, state); astralView(entity, state); armAstrality(entity);
  return true;
}
export function clearAstralityEffects(entity = null) {
  for (const [target] of astralStates) if (!entity || target === entity) {
    cancelCombatTask(astralTasks.get(target)); astralTasks.delete(target); astralStates.delete(target);
    document.getElementById(`spriteContainer_${target.id}`)?.classList.remove('astral-body-active');
    astralReturnView(target, false);
    removeEntityEffectView(`${target.id}-astral-body`); removeEntityEffectView(`${target.id}-astral-return`);
  }
}
registerCombatState('astrality', () => [...astralStates].map(([entity, state]) => ({ entity: entity.id, state: combatData(state) })),
  (saved, { entities }) => {
    clearAstralityEffects();
    for (const entry of saved) {
      const entity = entities.find(candidate => String(candidate.id) === String(entry.entity));
      if (!astralAlive(entity)) continue;
      astralStates.set(entity, entry.state); astralView(entity, entry.state); armAstrality(entity);
    }
  });
window.addEventListener('battleStarted', () => { clearAstralityEffects(); clearTranscendentalCooldown(); clearIndestructibilityCooldown(); clearEsoterismCooldown(); entites.forEach(ensureAstralityEffects); });

// One entry and one scheduled expiry per protected entity. No periodic polling;
// the existing effect view owns countdown rendering. Death/combat end releases all.
// One state and one existing combat task per active entity. Cleared at expiry,
// entity effect removal, battle start and snapshot restoration; nothing ticks idle.
const indestructibilityCooldowns = new Map(), indestructibilityTasks = new Map();
function syncIndestructibilityCooldown(entity) {
  const state = indestructibilityCooldowns.get(entity);
  if (!state) return null;
  const now = Math.max(state.clockAt, clockNow());
  state.expiresAt += getSleepElapsed(entity, state.clockAt, now);
  state.clockAt = now;
  return state;
}
export function indestructibilityCooldownRemaining(entity) {
  return Math.max(0, (syncIndestructibilityCooldown(entity)?.expiresAt || 0) - clockNow()) / 1000;
}
function armIndestructibilityCooldown(entity) {
  cancelCombatTask(indestructibilityTasks.get(entity)); indestructibilityTasks.delete(entity);
  const state = syncIndestructibilityCooldown(entity);
  if (!state) return;
  const now = clockNow(), sleeping = isEntityAsleep(entity);
  if (!astralAlive(entity) || (!sleeping && state.expiresAt <= now)) { clearIndestructibilityCooldown(entity); return; }
  const next = sleeping ? Math.max(now, ...(entity.controlIntervals?.sommeil || [])
    .filter(interval => interval.start <= now && interval.end > now).map(interval => interval.end)) : state.expiresAt;
  indestructibilityTasks.set(entity, scheduleCombatTask(() => armIndestructibilityCooldown(entity), Math.max(1, next - now)));
}
function showIndestructibilityCooldown(entity) {
  setEntityEffectView(entity, `${entity.id}-indestructibility-cooldown`, {
    kind: 'indestructibilityCooldown', stat: 'indestructibilityCooldown', type: 'passive', label: 'Cooldown d’Indestructibilité',
    endAt: () => syncIndestructibilityCooldown(entity)?.expiresAt || clockNow(),
    read: () => ({ html: 'Indestructibilité totale indisponible. Peau indestructible et la régénération restent actives.' }),
  });
}
export function startIndestructibilityCooldown(entity) {
  const P = globalThis.umbraProgression;
  const points = getSafe(entity, 'indestructibility', 0);
  if (!(points > 0)) return;
  const { seconds } = P.indestructibilityCooldownDetails(points, getSafe(entity, 'strength', 0), undefined, P.getUmbraThreshold(entity));
  if (!(seconds > 0) || !Number.isFinite(seconds)) return;
  const now = clockNow();
  indestructibilityCooldowns.set(entity, { expiresAt: now + seconds * 1000, clockAt: now });
  showIndestructibilityCooldown(entity); armIndestructibilityCooldown(entity);
}
export function clearIndestructibilityCooldown(entity = null) {
  for (const [target] of indestructibilityCooldowns) if (!entity || target === entity) {
    cancelCombatTask(indestructibilityTasks.get(target)); indestructibilityTasks.delete(target);
    indestructibilityCooldowns.delete(target); removeEntityEffectView(`${target.id}-indestructibility-cooldown`);
  }
}
registerCombatState('indestructibility', () => [...indestructibilityCooldowns].map(([entity]) => ({
  entity: entity.id, state: combatData(syncIndestructibilityCooldown(entity)),
})), (saved, { entities }) => {
  clearIndestructibilityCooldown();
  for (const entry of saved) {
    const entity = entities.find(candidate => String(candidate.id) === String(entry.entity));
    if (!astralAlive(entity) || !(entry.state?.expiresAt > clockNow())) continue;
    indestructibilityCooldowns.set(entity, entry.state);
    showIndestructibilityCooldown(entity); armIndestructibilityCooldown(entity);
  }
});

// At most one state/task per entity; expiry, death and combat cleanup release it.
const esoterismCooldowns = new Map(), esoterismTasks = new Map();
function syncEsoterismCooldown(entity) {
  const state = esoterismCooldowns.get(entity);
  if (!state) return null;
  const now = Math.max(state.clockAt, clockNow());
  state.expiresAt += getSleepElapsed(entity, state.clockAt, now);
  state.clockAt = now;
  return state;
}
export function esoterismCooldownRemaining(entity) {
  return Math.max(0, (syncEsoterismCooldown(entity)?.expiresAt || 0) - clockNow()) / 1000;
}
function armEsoterismCooldown(entity) {
  cancelCombatTask(esoterismTasks.get(entity)); esoterismTasks.delete(entity);
  const state = syncEsoterismCooldown(entity);
  if (!state) return;
  const now = clockNow(), sleeping = isEntityAsleep(entity);
  if (!astralAlive(entity) || (!sleeping && state.expiresAt <= now)) { clearEsoterismCooldown(entity); return; }
  const next = sleeping ? Math.max(now, ...(entity.controlIntervals?.sommeil || [])
    .filter(interval => interval.start <= now && interval.end > now).map(interval => interval.end)) : state.expiresAt;
  esoterismTasks.set(entity, scheduleCombatTask(() => armEsoterismCooldown(entity), Math.max(1, next - now)));
}
function showEsoterismCooldown(entity) {
  setEntityEffectView(entity, `${entity.id}-esoterism-cooldown`, {
    kind: 'esoterismCooldown', stat: 'esoterismCooldown', type: 'passive', label: 'Cooldown d’Ésotérisme',
    endAt: () => syncEsoterismCooldown(entity)?.expiresAt || clockNow(),
    read: () => ({ html: 'Protection ésotérique indisponible contre les dégâts magiques et perçants.' }),
  });
}
export function startEsoterismCooldown(entity) {
  const P = globalThis.umbraProgression;
  const points = getSafe(entity, 'esoterism', 0);
  if (!(points > 0)) return;
  const { seconds } = P.esoterismCooldownDetails(points, getSafe(entity, 'intelligence', 0), undefined, P.getUmbraThreshold(entity));
  if (!(seconds > 0) || !Number.isFinite(seconds)) return;
  const now = clockNow();
  esoterismCooldowns.set(entity, { expiresAt: now + seconds * 1000, clockAt: now });
  showEsoterismCooldown(entity); armEsoterismCooldown(entity);
}
export function clearEsoterismCooldown(entity = null) {
  for (const [target] of esoterismCooldowns) if (!entity || target === entity) {
    cancelCombatTask(esoterismTasks.get(target)); esoterismTasks.delete(target);
    esoterismCooldowns.delete(target); removeEntityEffectView(`${target.id}-esoterism-cooldown`);
  }
}
registerCombatState('esoterism', () => [...esoterismCooldowns].map(([entity]) => ({
  entity: entity.id, state: combatData(syncEsoterismCooldown(entity)),
})), (saved, { entities }) => {
  clearEsoterismCooldown();
  for (const entry of saved) {
    const entity = entities.find(candidate => String(candidate.id) === String(entry.entity));
    if (!astralAlive(entity) || !(entry.state?.expiresAt > clockNow())) continue;
    esoterismCooldowns.set(entity, entry.state);
    showEsoterismCooldown(entity); armEsoterismCooldown(entity);
  }
});

const transcendentalCooldowns = new Map(), transcendentalTasks = new Map();
function syncTranscendentalCooldown(entity) {
  const state = transcendentalCooldowns.get(entity);
  if (!state) return null;
  // A late combat batch can use an earlier logical deadline than a UI read.
  // Never count a negative interval or count an already observed sleep twice.
  const now = Math.max(state.clockAt, clockNow());
  state.expiresAt += getSleepElapsed(entity, state.clockAt, now);
  state.clockAt = now;
  return state;
}
export function transcendentalCooldownRemaining(entity) {
  return Math.max(0, (syncTranscendentalCooldown(entity)?.expiresAt || 0) - clockNow()) / 1000;
}
function armTranscendentalCooldown(entity) {
  cancelCombatTask(transcendentalTasks.get(entity)); transcendentalTasks.delete(entity);
  const state = syncTranscendentalCooldown(entity);
  if (!state) return;
  const now = clockNow();
  const sleeping = isEntityAsleep(entity);
  if (!sleeping && state.expiresAt <= now) { clearTranscendentalCooldown(entity); return; }
  const next = sleeping ? Math.max(now, ...(entity.controlIntervals?.sommeil || [])
    .filter(interval => interval.start <= now && interval.end > now).map(interval => interval.end)) : state.expiresAt;
  transcendentalTasks.set(entity, scheduleCombatTask(() => armTranscendentalCooldown(entity), Math.max(1, next - now)));
}
function showTranscendentalCooldown(entity) {
  setEntityEffectView(entity, `${entity.id}-transcendental-cooldown`, {
    kind: 'transcendentalCooldown', stat: 'transcendence', type: 'passive', label: 'Cooldown transcendantal',
    endAt: () => syncTranscendentalCooldown(entity)?.expiresAt || clockNow(),
    read: () => ({ html: 'Transcendance totale indisponible. Les résurrections consomment normalement leurs vies.' }),
  });
}
export function startTranscendentalCooldown(entity) {
  const P = globalThis.umbraProgression;
  const { seconds } = P.transcendenceCooldownDetails(getSafe(entity, 'transcendence', 0),
    getSafe(entity, 'intelligence', 0), undefined, P.getUmbraThreshold(entity));
  if (!(seconds > 0) || !Number.isFinite(seconds)) return;
  const now = clockNow();
  transcendentalCooldowns.set(entity, { expiresAt: now + seconds * 1000, clockAt: now });
  showTranscendentalCooldown(entity); armTranscendentalCooldown(entity);
}
export function clearTranscendentalCooldown(entity = null) {
  for (const [target] of transcendentalCooldowns) if (!entity || target === entity) {
    cancelCombatTask(transcendentalTasks.get(target)); transcendentalTasks.delete(target);
    transcendentalCooldowns.delete(target); removeEntityEffectView(`${target.id}-transcendental-cooldown`);
  }
}
registerCombatState('transcendence', () => [...transcendentalCooldowns].map(([entity]) => ({
  entity: entity.id, state: combatData(syncTranscendentalCooldown(entity)),
})), (saved, { entities }) => {
  clearTranscendentalCooldown();
  for (const entry of saved) {
    const entity = entities.find(candidate => String(candidate.id) === String(entry.entity));
    if (!astralAlive(entity) || !(entry.state?.expiresAt > clockNow())) continue;
    transcendentalCooldowns.set(entity, entry.state);
    showTranscendentalCooldown(entity); armTranscendentalCooldown(entity);
  }
});
