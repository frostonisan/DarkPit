import { beginPreparationBar, updatePreparationBar, finishPreparationBar } from "../rendering/timers.js";
import { advanceCombatTimerState } from "./timerState.js";
import { withStatReadSnapshot } from "../entities/statSystem.js";
import { updateBonusLifeCounters, updateHealthBar } from "../rendering/vitalFeedback.js";
import { DAMAGE_SOURCE_KEYS, buildScaledDamageSources } from './damageRules.js';
import { cloneCombatSnapshot } from './snapshot.js';
import { createAttackFlight } from './attackFlight.js';
import { isAttackEntityAlive, acceptsImpactTarget, acceptsSelectedTarget, acceptsExecutionTarget } from './targeting.js';
import { isHexTarget } from '../board/targets.js';
import { presentAttackTransport } from '../rendering/attackTransport.js';
import {
  getPhaseElapsed,
  waitPreparationPulse,
  getExecutionProgress,
  getControlState,
  getActionResumeTime,
  isEntityActionPaused,
  isEntitySilenced,
  waitForEntityControl
} from "./control.js";
import {
  setTimeout, clearTimeout, registerCombatState, combatData, combatReference, combatTarget,
} from "./clock.js";
import { combatNow, combatDelay, scheduleCombatImpactTask, cancelCombatTask } from "./timeline.js";

import {
  getAttackResolutionFlags, splitDodgeDamageSources, normArr, awardAttackMastery,
  startAttackCooldown
} from "./attackResolution.js";
import {
  createAttackStatView, attemptAttackerDamages, attemptDodge, attemptInvisibleTargetAccuracy,
  calculateAmbidextryTotalChance, calculateAmbidextryDamageBonus, getFinalAttackCooldownReduc, getFinalAttackPreparationReduc,
  getFinalAttackExecutionReduc, getFinalAttackRecoveryReduc, getFinalAttackProjectileSpeed, clampPercent,
  getHastePoints, applyReducToMs, attemptRangeBrokenSpell, attemptMeleeBrokenSpell,
  attemptMeleeExecBonus, attemptMysticismTrance, attemptEquilibreAttack, attemptOccultismInvisibility,
  clearOccultismInvisibleState, calculateOccultismPreparationSpeedDebuff, applyOccultismExitCritBoost, shouldApplyForcedInvisibleTargetAccuracy,
  totalPiercingRecupReductionWithAgi, totalTranspiercingRecupReductionWithAgi
} from "./statistics.js";
import { AmbidextryVFX } from '../rendering/damageFeedback.js';
import { recordEntityCombatProc, recordEntityDefenseHp } from "../storage/entityStorage.js";
import { OrderEntity, checkGameOver, isBattleFinished } from "../app/state.js";
import { entites } from "../entities/runtime.js";
import { updateTimerDisplay } from "../rendering/hud.js";
import {
  runEntityRecovery, LifeandDeath, applyDamage, applyDamageToDead, applyDamageToHex,
  estimateCancelledAttackHp,
} from "./vitals.js";
import { updateTargetStatut } from "./loop.js";
import { animatePreparation, mysticismBoostedAttackAnimation, mysticismAttackGif } from "../rendering/animations.js";

import { EffectMessage } from "./effects.js";
import { battleLogs } from "./journal.js";

import { isLord } from "../entities/rules.js";

// Attack preparation, execution and recovery.



// =========================
// HASTE TIMINGS BUILDER
// =========================
async function runDynamicPreparationTimerWithMysticism(attacker, basePreparationMs, canContinue) {
  const tickDelay = 50;

  const action = attacker._combatAction;
  const canPrepare = () => attacker._combatAction === action && canContinue();
  if (!action || !canPrepare()) return false;
  const state = action.preparation ||= { progress: 0, lastTick: combatNow(), recordedSlow: false };
  let virtualProgressMs = state.progress;
  let lastTick = state.lastTick;
  if (state.nextAt != null) {
    await waitPreparationPulse(attacker, Math.max(0, state.nextAt - combatNow()));
    state.nextAt = null;
  }
  if (!canPrepare()) return false;
  let recordedOccultismSlow = state.recordedSlow;

  const totalDuration = Math.max(1, Number(basePreparationMs) || 1);

  attacker.preparationTime = totalDuration - virtualProgressMs;
  attacker.preparationProgressRatio = virtualProgressMs / totalDuration;

  updateTimerDisplay(attacker, advanceCombatTimerState(attacker));

  beginPreparationBar(attacker);

  while (virtualProgressMs < totalDuration) {
    if (!canPrepare()) return false;

    const now = combatNow();
    const progressFrom = lastTick;
    lastTick = now;

const mysticActive =
  Boolean(attacker.mysticTrance?.active) &&
  Number(attacker.mysticTrance?.endsAt || 0) >= now;

const occultismActive =
  Boolean(attacker.flags?.occultismInvisible) ||
  Boolean(attacker.isInvisible) ||
  Boolean(attacker.invisible);

const mysticismSpeedMultiplier = mysticActive
  ? Math.max(0.01, Number(attacker.mysticTrance?.speedMultiplier || 1))
  : 1;

const occultismDebuff = occultismActive
  ? Math.max(0, Number(calculateOccultismPreparationSpeedDebuff(attacker)) || 0)
  : 0;
if (occultismDebuff > 0 && !recordedOccultismSlow) {
  recordedOccultismSlow = true;
  recordEntityCombatProc(attacker, 'occultismSlow');
}

const occultismSpeedMultiplier = occultismActive
  ? 1 / (1 + occultismDebuff / 100)
  : 1;

const rawSpeedMultiplier =
  mysticismSpeedMultiplier *
  occultismSpeedMultiplier;

const speedMultiplier = Number.isFinite(rawSpeedMultiplier)
  ? Math.max(0.01, rawSpeedMultiplier)
  : 1;

const recoils = action.preparationRecoils || [];
let cursor = progressFrom;
for (const recoil of recoils.splice(0)) {
  const at = Math.max(cursor, Math.min(now, recoil.at));
  virtualProgressMs += getPhaseElapsed(attacker, cursor, at, 'preparationTime') * speedMultiplier;
  virtualProgressMs = Math.max(0, virtualProgressMs - totalDuration * recoil.percent / 100);
  cursor = at;
}
virtualProgressMs += getPhaseElapsed(attacker, cursor, now, 'preparationTime') * speedMultiplier;

    if (virtualProgressMs > totalDuration) {
      virtualProgressMs = totalDuration;
    }

    const remainingMs = Math.max(0, totalDuration - virtualProgressMs);
    const progressRatio = Math.max(
      0,
      Math.min(1, virtualProgressMs / totalDuration)
    );

    attacker.preparationTime = remainingMs;
    attacker.preparationProgressRatio = progressRatio;

    updateTimerDisplay(attacker, advanceCombatTimerState(attacker));

    updatePreparationBar(attacker, progressRatio, mysticActive, occultismActive);

    if (remainingMs <= 0) break;
    Object.assign(state, { progress: virtualProgressMs, lastTick, recordedSlow: recordedOccultismSlow });
    state.nextAt = state.nextAt > combatNow() ? state.nextAt
      : combatNow() + Math.max(1, Math.ceil(Math.min(tickDelay, remainingMs / speedMultiplier)));
    await waitPreparationPulse(attacker, Math.max(0, state.nextAt - combatNow()));
    state.nextAt = null;
  }

  if (!canPrepare()) return false;
  const launchedAt = combatNow();

  const wasLaunchedUnderMysticism =
    Boolean(attacker.mysticTrance?.active) &&
    Number(attacker.mysticTrance?.endsAt || 0) >= launchedAt;

  attacker.attackLaunchedUnderMysticism = wasLaunchedUnderMysticism;

  if (attacker.currentAttack) {
    attacker.currentAttack.isLaunchedUnderMysticism = wasLaunchedUnderMysticism;
  }

  console.log(
    `🔮 Lancement sous Mysticisme : ${wasLaunchedUnderMysticism ? "OUI" : "NON"}`
  );
const equilibreAttack = attemptEquilibreAttack(attacker);
attacker.equilibreAttackDebug = equilibreAttack;
if (equilibreAttack.success) recordEntityCombatProc(attacker, 'equilibre');
  if (attacker.mysticismTranceEndTO) {
    clearTimeout(attacker.mysticismTranceEndTO);
    attacker.mysticismTranceEndTO = null;
  }

  if (typeof attacker.stopMysticismAnimation === "function") {
    attacker.stopMysticismAnimation(true);
    attacker.stopMysticismAnimation = null;
  }

  attacker.isMysticTrance = false;

  if (attacker.mysticTrance) {
    attacker.mysticTrance.active = false;
  }

  attacker.preparationTime = 0;
  attacker.preparationProgressRatio = 1;

  updateTimerDisplay(attacker, advanceCombatTimerState(attacker));

  finishPreparationBar(attacker);
}

export function buildAttackTimingsWithHaste(attacker, attack) {
  return withStatReadSnapshot(() => readAttackTimingsWithHaste(attacker, attack));
}

function readAttackTimingsWithHaste(attacker, attack) {
  const { preparationTime, executionTime, recoveryTime, cooldown } = attack;

  const prepReducPct = clampPercent(getFinalAttackPreparationReduc(attacker));
  const cdReducPct = clampPercent(getFinalAttackCooldownReduc(attacker));
  const execReducPct = clampPercent(getFinalAttackExecutionReduc(attacker));
  const recupReducPct = clampPercent(getFinalAttackRecoveryReduc(attacker));
  const flags = getAttackResolutionFlags(attack);
  const attackNatures = normArr(attack?.attacknature);
  const hasBaseNature =
    attackNatures.includes("physicalDamage") ||
    attackNatures.includes("magicalDamage") ||
    attackNatures.includes("hybridalDamage");
  const hasPiercingNature =
    attackNatures.includes("piercingDamage") ||
    attackNatures.includes("transpiercingDamage");
  const isTranspiercing =
    attackNatures.includes("transpiercingDamage") ||
    (attackNatures.includes("piercingDamage") && !hasBaseNature);
  const isPiercing =
    hasPiercingNature &&
    !isTranspiercing;
  const projectileSpeedPct = flags.isRange
    ? clampPercent(getFinalAttackProjectileSpeed(attacker))
    : 0;
  const totalExecutionReducPct = flags.isRange
    ? clampPercent(execReducPct + projectileSpeedPct)
    : execReducPct;
  const piercingRecupReducPct = isPiercing
    ? totalPiercingRecupReductionWithAgi(attacker, attack)
    : 0;
  const transpiercingRecupReducPct = isTranspiercing
    ? totalTranspiercingRecupReductionWithAgi(attacker, attack)
    : 0;
  const specificRecoveryReducPct = isTranspiercing
    ? transpiercingRecupReducPct
    : isPiercing
      ? piercingRecupReducPct
      : 0;
  const totalRecoveryReducPct = clampPercent(recupReducPct + specificRecoveryReducPct);

  const timings = {
    preparationTime: applyReducToMs(preparationTime, prepReducPct),
    executionTime: applyReducToMs(executionTime, totalExecutionReducPct),
    recoveryTime: applyReducToMs(recoveryTime, totalRecoveryReducPct),
    cooldown: applyReducToMs(cooldown, cdReducPct),
  };

  const hastePoints = getHastePoints(attacker);

  const debug = {
    hastePoints,
    prepReducPct,
    cdReducPct,
    execReducPct,
    projectileSpeedPct,
    totalExecutionReducPct,
    recupReducPct,
    isPiercing,
    isTranspiercing,
    piercingRecupReducPct,
    transpiercingRecupReducPct,
    specificRecoveryReducPct,
    totalRecoveryReducPct,
    base: { preparationTime, executionTime, recoveryTime, cooldown },
    final: { ...timings },
  };

  return {
    timings,
    debug,
    reductions: {
      prepReducPct,
      cdReducPct,
      execReducPct,
      projectileSpeedPct,
      totalExecutionReducPct,
      recupReducPct,
      piercingRecupReducPct,
      transpiercingRecupReducPct,
      specificRecoveryReducPct,
      totalRecoveryReducPct
    }
  };
}
function startMysticismPreparationState(attacker, basePreparationMs) {
  attacker.attackLaunchedUnderMysticism = false;
  attacker.attackBalancedNoAggro = false;

  if (attacker.currentAttack) {
    attacker.currentAttack.isLaunchedUnderMysticism = false;
    attacker.currentAttack.isBalancedNoAggro = false;
  }

  if (attacker.mysticismTranceEndTO) {
    clearTimeout(attacker.mysticismTranceEndTO);
    attacker.mysticismTranceEndTO = null;
  }

  const trance = attemptMysticismTrance(attacker);
  attacker.mysticismDebug = trance;

  if (!trance.success) {
    attacker.isMysticTrance = false;

    attacker.mysticTrance = {
      active: false,
      startedAt: null,
      endsAt: null,
      durationMs: 0,
      accelerationPercent: 0,
      speedMultiplier: 1,
      basePreparationMs,
    };

    return trance;
  }

  recordEntityCombatProc(attacker, 'mysticism');

  const speedMultiplier = 1 + trance.accelerationPercent / 100;
  const startedAt = combatNow();
  const endsAt = startedAt + trance.durationMs;
console.log("🔮 Mysticisme timing", {
  attacker: attacker.name,
  durationMs: trance.durationMs,
  accelerationPercent: trance.accelerationPercent,
  speedMultiplier,
  startedAt,
  endsAt,
});
  attacker.isMysticTrance = true;

  attacker.mysticTrance = {
    active: true,
    startedAt,
    endsAt,
    durationMs: trance.durationMs,
    accelerationPercent: trance.accelerationPercent,
    speedMultiplier,
    basePreparationMs,
  };

attacker.mysticismTranceEndTO = setTimeout(() => {
  if (!attacker.mysticTrance) return;

  attacker.mysticTrance.active = false;
  attacker.isMysticTrance = false;

  console.log(
    `🔮 Transe mystique terminée pour ${attacker.name} après ${combatNow() - startedAt}ms.`
  );
}, trance.durationMs);

  return trance;
}
const sumSources = sources => DAMAGE_SOURCE_KEYS.reduce((sum, key) => sum + Number(sources[key] || 0), 0);
const pause = combatDelay;

function refreshTarget(target) {
  if (!target?.stats?.HP) return;
  updateHealthBar(target.stats.HP.current, target.stats.HP.max, target.stats.armor?.current || 0, target.stats.armor?.max || 0, target.id);
  updateBonusLifeCounters(target);
}

// Used by every transport and every repeat. No relation check is made here.
const activeFlights = new Map(), delayedFlights = new Map();
export function getAttackTransportDeadline(entity) {
  if (entity._combatAction?.stage !== 'transport') return 0;
  return Math.max(0, ...(entity._combatAction.flights || []).map(id =>
    activeFlights.get(id)?.at ?? delayedFlights.get(id)?.at ?? 0));
}

export function cancelEntityAttackAction(entity) {
  const action = entity._combatAction;
  if (action) {
    // Already launched projectiles keep their own trajectory. A melee action
    // cannot land later after its abandoned turn has been restarted.
    if (getAttackResolutionFlags(action.attack).isMelee) for (const id of action.flights || []) {
      const record = activeFlights.get(id);
      if (record) { record.flight.aborted = true; cancelCombatTask(record.task); activeFlights.delete(id); }
      delayedFlights.delete(id);
    }
    delete entity._combatAction;
  }
  entity.stopPreparationAnimation?.();
  clearOccultismInvisibleState(entity);
  clearTimeout(entity.mysticismTranceEndTO);
  entity.stopMysticismAnimation?.(true);
  if (entity.mysticTrance) entity.mysticTrance.active = false;
  entity.isMysticTrance = false;
}

export function resolveAttackImpact(flight, options = {}) {
  const at = options.at ?? combatNow();
  const record = { flight, options, at, promise: null };
  const prepare = () => {
    // A melee execution belongs to its caster's action clock. Projectiles have
    // their own flight clock and never enter this branch. Re-check at impact so
    // controls received after launch also postpone the hit, including in replays.
    if (options.actionDuration != null && !isBattleFinished() && !flight.expired()) {
      const remaining = Math.max(0, options.actionDuration
        - getExecutionProgress(flight.attacker, options.actionStartedAt, combatNow(), options.actionDuration));
      const resumeAt = getActionResumeTime(flight.attacker);
      // Epoch-sized timestamps can lose a fraction of a microsecond on addition.
      if (remaining > 0.001 || resumeAt > combatNow()) {
        record.at = combatNow() + (resumeAt > combatNow() ? Math.min(50, resumeAt - combatNow()) : Math.max(0.001, remaining));
        return schedule(record.at);
      }
    }
    return prepareAttackImpact(flight, options);
  };
  const schedule = deadline => {
    record.task = scheduleCombatImpactTask(deadline, prepare);
    return record.task.promise;
  };
  record.promise = schedule(at);
  activeFlights.set(flight.id, record);
  const forget = () => { if (activeFlights.get(flight.id) === record) activeFlights.delete(flight.id); };
  record.promise.then(forget, forget);
  return record.promise;
}

function prepareAttackImpact(flight, { secondHit = false, ambidextry = false, broken = false } = {}) {
  if (isBattleFinished() || flight.expired()) return 'miss';
  const target = flight.resolveTarget(entites);
  if (flight.cancelled()) return 'dispelled';
  flight.recordManualAvoidance();
  if (!acceptsImpactTarget(flight.attack, target)) return 'miss';
  const attack = {
    ...flight.attack, launchContextId: flight.id,
    isAmbidextry: secondHit,
    ambidextryHitIndex: ambidextry ? secondHit ? 2 : 1 : null,
    logVariant: ambidextry ? secondHit ? 'ambidextry_2' : 'ambidextry_1' : 'normal',
    natureSignatureSuppressed: flight.mode === 'mixed' && flight.casterLost,
  };
  const flags = getAttackResolutionFlags(attack);
  let sources = flight.impactSources();
  let damage = sumSources(sources);
  if (flight.mode === 'mixed') {
    console.log('[HybridImpact]', JSON.stringify({
      flightId: flight.id, attacker: flight.attacker.name, target: target?.name,
      targetMoved: flight.targetMoved, casterLost: flight.casterLost,
      launchSources: flight.sources, impactSources: sources,
      launchDamage: sumSources(flight.sources), impactDamage: damage,
    }));
  }
  const offensive = attack.combatFunction === 'Attaquant';
  if (flight.mode === 'mixed' && damage <= 0) return 'miss';

  const deadTarget = target.isDEAD;
  return async () => {
  if (isHexTarget(target)) {
    const status = await applyDamageToHex(target, flight.source, attack);
    if (status === 'hit' && !broken) awardAttackMastery(flight.attacker, attack, { impact: true });
    return status;
  }
  if (deadTarget) {
    const status = await applyDamageToDead(target, damage, flight.source, attack);
    if (status === 'hit' && !broken) awardAttackMastery(flight.attacker, attack, { impact: true });
    refreshTarget(target);
    return status;
  }
  // Support spells never roll accuracy, dodge or resistances.
  if (offensive && !broken) {
    if (!(flags.hasMagical && !flags.hasPhysicalBehavior)
      && shouldApplyForcedInvisibleTargetAccuracy({ flags: { forcedInvisibleTargetAccuracy: flight.invisibleTargetAccuracy } }, target)
      && !attemptInvisibleTargetAccuracy(flight.source, target)) {
      EffectMessage(target, 'Raté !');
      return 'miss';
    }
    const dodge = splitDodgeDamageSources(sources);
    const partial = sumSources(dodge.remaining) > 0;
    if (flags.canBeDodged && sumSources(dodge.avoided) > 0 && attemptDodge(flight.source, target, { partial })) {
      recordEntityCombatProc(target, 'dodge');
      const avoidedHp = Math.max(0, estimateCancelledAttackHp(flight.source, target, attack, sources)
        - (partial ? estimateCancelledAttackHp(flight.source, target, attack, dodge.remaining) : 0));
      recordEntityDefenseHp(target, { dodge: avoidedHp });
      battleLogs('attack_dodged', { attacker: flight.attacker, target, attack, partial });
      if (!partial) return 'dodged';
      sources = dodge.remaining;
      damage = sumSources(sources);
    }
  }
  if (ambidextry && !secondHit) AmbidextryVFX(target);
  const outcome = applyDamage(target, damage, flight.source, { ...attack, forceDamageSources: sources },
    sources, broken ? [] : attack.selfEffects);
  if (outcome?.hit && !broken) awardAttackMastery(flight.attacker, attack, { impact: true, critical: outcome.critical });
  refreshTarget(target);
  LifeandDeath(target);
  return outcome?.hit ? 'hit' : 'miss';
  };
}

async function launchAttackTransport(flight, options = {}, restored = null) {
  const { attacker, target, attack } = flight;
  if (isBattleFinished() || attacker.battleStopped) return 'cancelled-before-launch';
  if (!restored && (!entites.includes(attacker) || !isAttackEntityAlive(attacker) || !acceptsSelectedTarget(flight.source, attack, target))) return 'cancelled-before-launch';
  const flags = getAttackResolutionFlags(attack);
  if (!restored && !options.secondHit && !options.broken) awardAttackMastery(attacker, attack, { launch: true });
  if (!flags.isRange && !flags.isMelee) return 'unsupported-range';
  const duration = flags.isRange ? attack.executionTime : Math.max(options.secondHit ? 120 : 200, attack.executionTime);
  const impact = resolveAttackImpact(flight, { ...options,
    ...(flags.isMelee ? { actionStartedAt: options.actionStartedAt ?? combatNow(),
      actionDuration: options.actionDuration ?? duration } : {}),
    at: restored?.at ?? combatNow() + duration });
  return presentAttackTransport(flight, impact, { duration, isRange: flags.isRange, options, restored });
}

function queueSecondFlight(data) {
  const record = { ...data, promise: null };
  delayedFlights.set(data.id, record);
  record.promise = (async () => {
    await combatDelay(Math.max(0, data.at - combatNow()));
    if (delayedFlights.get(data.id) !== record) return;
    const attacker = entites.find(entity => entity.id === data.attacker);
    const target = combatTarget(data.target, entites);
    if (!attacker || !isAttackEntityAlive(attacker) || attacker.battleStopped || isBattleFinished() || OrderEntity(attacker)) return;
    recordEntityCombatProc(attacker, 'ambidextry');
    const flight = createAttackFlight(attacker, target, data.attack, data.sources);
    // The id persists across the delay and the flight so melee can await it after reload.
    flight.id = data.id;
    delayedFlights.delete(data.id);
    return launchAttackTransport(flight, { secondHit: true, ambidextry: true });
  })().finally(() => delayedFlights.delete(data.id));
  return record.promise;
}

registerCombatState('flights', () => ({
  active: [...activeFlights.values()].map(record => ({ flight: record.flight.snapshot(), options: record.options,
    at: record.at, visual: record.flight.attacker.projectiles?.find(p => p.id === record.flight.id)?.visual })),
  delayed: [...delayedFlights.values()].map(({ promise, ...data }) => data),
}), (snapshot, { removed = [] }) => {
  const actors = [...entites, ...removed];
  activeFlights.clear(); delayedFlights.clear();
  for (const entry of snapshot.active) {
    const attacker = actors.find(entity => entity.id === entry.flight.attacker);
    const target = combatTarget(entry.flight.target, actors);
    if (!attacker || !target) throw new Error('Cible ou lanceur absent du combat sauvegardé.');
    const flight = createAttackFlight(attacker, target, entry.flight.attack, entry.flight.sources, entry.flight);
    void launchAttackTransport(flight, entry.options, entry);
  }
  for (const data of snapshot.delayed) void queueSecondFlight(data);
});
for (const event of ['battleStopped', 'battleResolved']) window.addEventListener(event, () => {
  activeFlights.clear(); delayedFlights.clear();
});

export async function executeAttack(attacker, target, selectedAttack, { onStart = null, canContinue = () => true } = {}) {
  let state = attacker._combatAction;
  const canAct = () => isAttackEntityAlive(attacker) && !attacker.battleStopped
    && (!state || attacker._combatAction === state)
    && !state?.invalidated
    && !isBattleFinished() && !OrderEntity(attacker) && canContinue()
    && !attacker._combatAction?.interruptedBySilence && !getControlState(attacker, 'effroi');
  if (!attacker._combatAction) {
    if (isEntitySilenced(attacker)) return 'silenced';
    if (isEntityActionPaused(attacker) && !await waitForEntityControl(attacker, canAct)) return;
    if (isEntitySilenced(attacker)) return 'silenced';
  }
  const restoring = Boolean(state);
  if (!state) {
    const definition = selectedAttack || attacker.currentAttack;
    if (!definition || !canAct()) return;
    if (!acceptsSelectedTarget(attacker, definition, target)) return 'target-invalid';
    const attack = cloneCombatSnapshot(definition, 'selectedAttack');
    attack.folieTargeting = Boolean(getControlState(attacker, 'folie'));
    const { timings, debug } = buildAttackTimingsWithHaste(attacker, attack);
    state = attacker._combatAction = { stage: 'preparation', attack, timings, debug, target: combatReference(target), flights: [] };
    onStart?.();
    startAttackCooldown(attacker, attack, timings.cooldown);
    Object.assign(attacker, timings, { hasteDebug: debug, baseTimings: debug.base });
    attacker.currentAttack = { ...attack, ...timings, baseTimings: debug.base };
    attacker.lastAttackTime = combatNow();
    attacker.currentPhase = 'attack_1';
  }
  const { attack, timings, debug } = state;
  const flags = getAttackResolutionFlags(attack);
  attacker.projectiles ||= [];
  let stopPreparationAnimation = null;
  try {
    if (state.stage === 'preparation') {
      if (state.interruptedBySilence || isEntitySilenced(attacker)) {
        state.interruptedBySilence = true;
        return 'silenced';
      }
      if (!restoring) {
        clearOccultismInvisibleState(attacker);
        attacker.occultismInvisibilityDebug = attemptOccultismInvisibility(attacker);
        if (attacker.occultismInvisibilityDebug?.success) recordEntityCombatProc(attacker, 'occultism');
        startMysticismPreparationState(attacker, timings.preparationTime);
      }
      stopPreparationAnimation = animatePreparation(attacker, attack, timings.preparationTime);
      const prepared = await runDynamicPreparationTimerWithMysticism(attacker, timings.preparationTime, canAct);
      if (attacker._combatAction !== state) return;
      const wasInvisible = Boolean(attacker.flags?.occultismInvisible || attacker.isInvisible || attacker.invisible);
      clearOccultismInvisibleState(attacker);
      if (state.interruptedBySilence || isEntitySilenced(attacker)) return 'silenced';
      if (state.invalidated) return 'retry';
      if (prepared === false || !canAct()) return;
      if (isEntityActionPaused(attacker) && !await waitForEntityControl(attacker, canAct)) {
        return state.interruptedBySilence ? 'silenced' : undefined;
      }
      if (state.interruptedBySilence || isEntitySilenced(attacker)) return 'silenced';
      if (!acceptsExecutionTarget(attacker, attack, target)) {
        state.targetInvalidated = true;
        return 'target-invalid';
      }
      if (wasInvisible) applyOccultismExitCritBoost(attacker);
      Object.assign(attack, timings, {
        effectiveExecutionTime: timings.executionTime,
        isLaunchedUnderMysticism: attacker.currentAttack.isLaunchedUnderMysticism,
        isBalancedNoAggro: attacker.currentAttack.isBalancedNoAggro,
      });
      if (attack.isLaunchedUnderMysticism) {
        mysticismBoostedAttackAnimation(attacker.id); mysticismAttackGif(attacker.id);
      }
      if (!isHexTarget(target)) {
        target.targetStatut = 'activeTarget';
        if (isLord(attacker)) updateTargetStatut(attacker, target);
      }
      let secondDelay = applyReducToMs(500, debug.totalExecutionReducPct);
      if (flags.isMelee) {
        const melee = attemptMeleeExecBonus(attacker, attack, debug.base.executionTime);
        attack.executionTime = melee.finalExecMs;
        attacker.executionTime = melee.finalExecMs;
        attacker.meleeExecDebug = melee.debug;
        secondDelay = applyReducToMs(500, Number(melee.debug?.totalReduc) || 0);
      }
      const damageContext = attemptAttackerDamages(attacker, attack);
      attacker.currentPhase = flags.isRange ? 'attack_2' : 'attack_3';
      attacker.currentAttack.executionTime = attack.executionTime;
      const offensive = attack.combatFunction === 'Attaquant' && !normArr(attack.deadTarget).includes('yes');
      const broken = offensive && flags.canBrokenSpell
        ? flags.isRange ? attemptRangeBrokenSpell(attacker, target, attack) : attemptMeleeBrokenSpell(attacker, target, attack)
        : null;
      state.stage = 'transport';
      if (broken?.success) {
        recordEntityCombatProc(attacker, 'brokenSpell');
        state.backfireSources = buildScaledDamageSources(damageContext.totalDamageSources,
          Math.round(damageContext.totalDamage * broken.damagePct / 100));
        state.backfireAttack = { ...attack, launchContextId: `backfire-${crypto.randomUUID()}`,
          isBrokenSpell: true, attackTarget: ['enemy'], selfEffects: [] };
        if (flags.isMelee) {
          const flight = createAttackFlight(attacker, target, state.backfireAttack, state.backfireSources);
          state.flights.push(flight.id);
          void launchAttackTransport(flight, { broken: true });
        }
      } else {
        const attackView = createAttackStatView(attacker, attack);
        const ambidextry = flags.canAmbidextry && Math.random() * 100 < calculateAmbidextryTotalChance(attackView);
        const flight = createAttackFlight(attacker, target, attack, damageContext.totalDamageSources);
        state.flights.push(flight.id);
        const primary = launchAttackTransport(flight, { ambidextry });
        let secondary = Promise.resolve();
        if (ambidextry) {
          const sources = buildScaledDamageSources(flight.sources,
            Math.round(damageContext.totalDamage * calculateAmbidextryDamageBonus(attackView) / 100));
          const id = `second-${crypto.randomUUID()}`;
          state.flights.push(id);
          secondary = queueSecondFlight({ id, at: combatNow() + secondDelay, attacker: attacker.id,
            target: combatReference(target), attack: combatData(attack), sources });
        }
        if (flags.isRange) Promise.all([primary, secondary]).then(() => checkGameOver(entites))
          .catch(error => console.error('[AttackFlight]', flight.id, error));
      }
    }
    if (state.stage === 'transport') {
      if (flags.isMelee) await Promise.all(state.flights.map(id =>
        activeFlights.get(id)?.promise || delayedFlights.get(id)?.promise));
      if (attacker._combatAction !== state) return;
      if (state.backfireSources && !state.backfireApplied && isAttackEntityAlive(attacker)) {
        state.backfireApplied = true;
        applyDamage(attacker, sumSources(state.backfireSources), attacker,
          { ...state.backfireAttack, forceDamageSources: state.backfireSources }, state.backfireSources, []);
      }
      attacker.executionTime = 0;
      if (target && !isHexTarget(target)) {
        target.targetStatut = 'lastTarget';
        if (isLord(attacker)) updateTargetStatut(attacker, target);
      }
      state.stage = 'recovery';
    }
    if (!canAct()) return;
    await runEntityRecovery(attacker, timings.recoveryTime, { canContinue: canAct, source: 'attack' });
  } finally {
    const ownsAction = attacker._combatAction === state;
    if (ownsAction) delete attacker._combatAction;
    if (ownsAction && (state.interruptedBySilence || state.targetInvalidated)) {
      attacker.preparationTime = 0;
      attacker.preparationProgressRatio = 0;
      attacker.executionTime = 0;
      updateTimerDisplay(attacker, advanceCombatTimerState(attacker));
    }
    stopPreparationAnimation?.();
    if (ownsAction || !attacker._combatAction) {
      clearOccultismInvisibleState(attacker);
      clearTimeout(attacker.mysticismTranceEndTO);
      attacker.stopMysticismAnimation?.(true);
      if (attacker.mysticTrance) attacker.mysticTrance.active = false;
      attacker.isMysticTrance = false;
    }
  }
}

registerCombatState('trances', () => true, (_, { entities }) => {
  for (const entity of entities) if (entity.mysticTrance?.active) {
    entity.mysticismTranceEndTO = setTimeout(() => {
      entity.mysticTrance.active = false; entity.isMysticTrance = false;
    }, Math.max(0, entity.mysticTrance.endsAt - combatNow()));
  }
});

window.addEventListener('restoredMysticismAnimation', ({ detail }) => {
  const entity = entites.find(e => e.id === detail.entityId);
  if (entity) entity.stopMysticismAnimation = detail.stop;
});

window.addEventListener('restoredOccultismAnimation', ({ detail }) => {
  const entity = entites.find(e => e.id === detail.entityId);
  if (entity) entity.stopOccultismAnimation = detail.stop;
});
