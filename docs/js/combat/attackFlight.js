import { combatData, combatReference, combatTarget } from "./clock.js";
import { hasPendingCombatDeath } from "./timeline.js";
import { getAttackResolutionFlags } from "./attackResolution.js";
import { createAttackStatView, getRangePenaltyDetails } from "./statistics.js";
import { getControlState, getCombatSide } from "./control.js";
import { getEntityManualMovementVersion, recordEntityCombatAmount } from "../storage/entityStorage.js";
import { entites } from "../entities/runtime.js";
import { isHexTarget, getEntityHex, getHexEntity } from '../board/targets.js';
import { isAttackEntityAlive } from './targeting.js';
import { cloneCombatSnapshot } from './snapshot.js';
import { flightModeFromFlags, flightRemnantFromFlags, sampleFlightState, isFlightCancelled, resolveFlightSources } from './flightRules.js';

let battleGeneration = 0;
if (typeof window !== 'undefined') {
  const expireFlights = () => { battleGeneration++; };
  window.addEventListener('battleResolved', expireFlights);
  window.addEventListener('battleStopped', expireFlights);
}

export function getFlightMode(attack) {
  return flightModeFromFlags(getAttackResolutionFlags(attack));
}

export function createAttackFlight(attacker, target, attack, sources = {}, saved = null) {
  const generation = battleGeneration;
  const definition = cloneCombatSnapshot(attack, 'attack');
  const flags = getAttackResolutionFlags(definition);
  const mode = getFlightMode(definition);
  const remnantNature = flightRemnantFromFlags(mode, flags);
  const aimedHex = saved ? combatTarget(saved.aimedHex, entites) : getEntityHex(target);
  const projected = createAttackStatView(attacker, attack);
  const stats = saved?.stats ?? cloneCombatSnapshot(projected.stats || {}, 'attacker.stats');
  const modifiers = saved?.modifiers ?? cloneCombatSnapshot(projected.modifierStats || {}, 'attacker.modifierStats');
  const boosts = saved?.boosts ?? cloneCombatSnapshot(projected.battleBoosts || {}, 'attacker.battleBoosts');
  const baseStats = saved?.baseStats ?? cloneCombatSnapshot(attacker.baseStats || {}, 'attacker.baseStats');
  const statOverrides = saved?.statOverrides ?? cloneCombatSnapshot(projected._statSystemOverrides || {}, 'attacker.statOverrides');
  const seuilUmbra = saved?.seuilUmbra ?? attacker.seuilUmbra;
  const level = saved?.level ?? cloneCombatSnapshot(attacker.level, 'attacker.level');
  const side = saved?.side ?? getCombatSide(attacker);
  const folieAtLaunch = saved?.folieAtLaunch ?? Boolean(definition.folieTargeting || getControlState(attacker, 'folie'));
  const movementAtLaunch = saved?.movementAtLaunch ?? getEntityManualMovementVersion(target);
  // Calculations use launch-time stats; resource writes and counters still reach the entity.
  const resources = new Set(['HP', 'armor', 'extraLife']);
  const statView = new Proxy(stats, {
    get: (snapshot, key) => resources.has(key) ? attacker.stats[key] : snapshot[key],
  });
  const source = new Proxy(attacker, {
    get: (entity, key) => key === 'stats' ? statView
      : key === 'modifierStats' ? modifiers : key === 'battleBoosts' ? boosts : key === 'baseStats' ? baseStats
      : key === '_statSystemOverrides' ? statOverrides : key === 'seuilUmbra' ? seuilUmbra
      : key === 'currentAttack' ? definition : key === 'side' || key === '_combatSideAtLaunch' ? side
      : key === '_folieAtLaunch' ? folieAtLaunch : key === 'level' ? level : entity[key],
  });
  if (!saved) definition.rangePenaltyAtLaunch = getRangePenaltyDetails(source, definition);
  const invisibleTargetAccuracy = saved ? saved.invisibleTargetAccuracy : attacker.flags?.forcedInvisibleTargetAccuracy
    ? { ...attacker.flags.forcedInvisibleTargetAccuracy } : null;
  const flight = {
    id: `flight-${crypto.randomUUID()}`,
    attacker, target, attack: definition, source, mode, remnantNature, aimedHex, invisibleTargetAccuracy,
    sources: cloneCombatSnapshot(sources, 'damageSources'),
    casterLost: false,
    targetMoved: false,
    guidanceLost: false,
    lockedHex: mode === 'physical' ? aimedHex : null,
    magicalLossConsumed: false,
    manualAvoidanceRecorded: false,
    snapshot() {
      return combatData({ id: this.id, attacker: attacker.id, target: combatReference(target), attack: definition,
        sources: this.sources, stats, modifiers, boosts, baseStats, statOverrides, seuilUmbra, level, side, folieAtLaunch,
        movementAtLaunch, invisibleTargetAccuracy, aimedHex: combatReference(this.aimedHex),
        lockedHex: this.lockedHex ? combatReference(this.lockedHex) : null,
        casterLost: this.casterLost, targetMoved: this.targetMoved, guidanceLost: this.guidanceLost,
        magicalLossConsumed: this.magicalLossConsumed, manualAvoidanceRecorded: this.manualAvoidanceRecorded });
    },
    recordManualAvoidance() {
      const locked = this.lockedHex || this.aimedHex;
      if (this.manualAvoidanceRecorded || this.expired() || definition.combatFunction !== 'Attaquant'
        || isHexTarget(target) || !isAttackEntityAlive(target)
        || !(mode === 'physical' || mode === 'mixed' && this.guidanceLost)
        || !getEntityHex(target) || getEntityHex(target) === locked
        || getEntityManualMovementVersion(target) <= movementAtLaunch) return;
      this.manualAvoidanceRecorded = true;
      recordEntityCombatAmount(target, 'physicalProjectilesAvoided', 1);
    },
    expired() { return this.aborted === true || generation !== battleGeneration; },
    sample() {
      const { casterJustLost, ...state } = sampleFlightState(this, {
        casterAlive: isAttackEntityAlive(attacker),
        casterDeathPending: hasPendingCombatDeath(attacker),
        targetIsHex: isHexTarget(target),
        targetHex: isHexTarget(target) ? target : getEntityHex(target),
      });
      Object.assign(this, state);
      return casterJustLost;
    },
    consumeMagicalLoss() {
      this.sample();
      if (mode !== 'mixed' || !this.guidanceLost || this.magicalLossConsumed) return false;
      this.magicalLossConsumed = true;
      return true;
    },
    cancelled() {
      this.sample();
      return isFlightCancelled(this, this.expired());
    },
    resolveTarget(entities) {
      this.sample();
      if (isHexTarget(target)) return this.aimedHex?.isConnected ? this.aimedHex : null;
      if (mode === 'physical' || mode === 'mixed' && this.guidanceLost) {
        return getHexEntity(this.lockedHex || this.aimedHex, entities);
      }
      return target;
    },
    impactSources() {
      this.sample();
      return resolveFlightSources(this);
    },
  };
  if (saved) {
    for (const key of ['id', 'casterLost', 'targetMoved', 'guidanceLost', 'magicalLossConsumed', 'manualAvoidanceRecorded']) flight[key] = saved[key];
    flight.lockedHex = saved.lockedHex ? combatTarget(saved.lockedHex, entites) : null;
  }
  return flight;
}
