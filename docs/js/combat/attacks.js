// Public combat attack API for integrations and browser scenarios.
// Internal game modules import each responsibility directly to avoid barrel cycles.
export { cloneCombatSnapshot } from './snapshot.js';
export { isHexTarget, getEntityHex, getHexEntity } from '../board/targets.js';
export { isAttackEntityAlive, acceptsImpactTarget, acceptsSelectedTarget, acceptsExecutionTarget } from './targeting.js';
export { getFlightMode, createAttackFlight } from './attackFlight.js';
export { buildAttackTimingsWithHaste, getAttackTransportDeadline, cancelEntityAttackAction,
  resolveAttackImpact, executeAttack } from './attackExecution.js';
