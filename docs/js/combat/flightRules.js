// Pure flight policies. Cells are opaque references supplied by the board adapter.
// No browser, entity registry, renderer, clock or global combat state is accessed.
export function flightModeFromFlags(flags) {
  if (!flags.isRange) return 'melee';
  const physical = flags.hasPhysical || flags.hasHybridal;
  const magical = flags.hasMagicalBehavior;
  if (physical && magical && flags.hasPiercing) return 'triple';
  if (magical && flags.hasPhysicalBehavior) return 'mixed';
  return magical ? 'magical' : 'physical';
}

export function flightRemnantFromFlags(mode, flags) {
  return mode === 'mixed' && flags.hasPiercing && !flags.hasPhysical && !flags.hasHybridal
    ? 'piercing' : mode === 'mixed' ? 'physical' : null;
}

// Observing provisional zero HP must not drop guidance before simultaneous
// healing and additional lives have settled.
export function sampleFlightState(state, { casterAlive, casterDeathPending, targetIsHex, targetHex }) {
  const casterJustLost = !state.casterLost && !casterAlive && !casterDeathPending;
  const casterLost = state.casterLost || casterJustLost;
  const losesGuidance = state.mode === 'mixed' && casterJustLost;
  const guidanceLost = state.guidanceLost || losesGuidance;
  const lockedHex = losesGuidance ? targetHex : state.lockedHex;
  const aimedHex = losesGuidance ? lockedHex : state.aimedHex;
  const locked = state.mode === 'physical' || state.mode === 'mixed' && guidanceLost;
  const targetMoved = state.targetMoved || (locked && !targetIsHex && targetHex !== lockedHex);
  return { casterJustLost, casterLost, guidanceLost, lockedHex, aimedHex, targetMoved };
}

export function isFlightCancelled(state, expired) {
  return expired || (state.mode === 'magical' || state.mode === 'melee') && state.casterLost;
}

export function resolveFlightSources(state) {
  const result = { ...state.sources };
  if (state.mode !== 'mixed' || !state.casterLost) return result;
  // Hybrid damage contains equal physical and magical shares.
  const half = Number(result.hybridalDamage || 0) / 2;
  result.physical = Number(result.physical || 0) + half;
  result.magical = 0;
  result.hybridalDamage = 0;
  return result;
}
