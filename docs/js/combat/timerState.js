import { getSafe } from '../entities/rules.js';

// Plan the existing timer transitions without consulting the DOM. The view is
// captured before resets (a completed ATB stays full for this update), while
// timer labels read the committed state afterwards, as they did previously.
function planTimerUpdate(entity) {
  const changes = {};
  const view = { skip: false, search: false, atbPercent: null, attackExecuted: null };
  if (entity.currentPhase === 'cooldown-wait') {
    view.skip = true;
    return { changes, view };
  }
  if (entity.currentPhase === 'target-search' || entity.currentPhase === 'target-search-recovery') {
    view.search = true;
    view.recovering = entity.currentPhase === 'target-search-recovery';
    view.atbPercent = view.recovering
      ? Math.max(0, Math.min(100, (Number(entity.recoveryTime) || 0) / Math.max(1, entity.maxRecoveryTime || 1) * 100))
      : 100;
    return { changes, view };
  }

  const speedTimer = entity.speedTimer === undefined ? 0 : entity.speedTimer;
  if (entity.speedTimer === undefined) changes.speedTimer = 0;
  const speed = () => Number(getSafe(entity, 'speed', 1000)) || 1000;
  if (entity.orderPhase === 'runawayRecovery') {
    const max = entity.maxRecoveryTime || entity.runawayLoopRecuperation || speed();
    view.atbPercent = Math.max(0, entity.recoveryTime / max * 100);
    view.runaway = true;
    return { changes, view };
  }
  if (entity.orderPhase === 'runawayPreparation') {
    const max = entity.maxPreparationTime || entity.runawayLoopPreparation || speed();
    view.atbPercent = Math.min(100, (max - speedTimer) / max * 100);
    view.runaway = true;
    return { changes, view };
  }

  if (entity.orderPhase !== 'orderDecision' && entity.orderPhase !== 'orderExecution') {
    if (speedTimer > 0 && !entity.isATBFull) {
      const max = speed();
      const percent = (max - speedTimer) / max * 100;
      changes.isATBFull = percent >= 100;
      view.atbPercent = Math.min(100, percent);
    }
    if (entity.preparationTime > 0 || entity.executionTime > 0) {
      view.attackExecuted = false;
      view.atbPercent = 100;
    } else if (speedTimer === 0 && entity.preparationTime === 0 && entity.executionTime === 0 && entity.recoveryTime === 0) {
      view.atbPercent = 100;
    }
    if (entity.executionTime === 0 && entity.recoveryTime > 0) {
      let max = entity.maxRecoveryTime;
      if (typeof max === 'undefined' || max <= 0) changes.maxRecoveryTime = max = entity.recoveryTime;
      view.atbPercent = Math.max(0, entity.recoveryTime / max * 100);
      if (entity.wasInExecution) {
        view.attackExecuted = true;
        changes.wasInExecution = false;
      }
    }
    if (speedTimer === 0 && entity.preparationTime === 0 && entity.executionTime === 0 && entity.recoveryTime === 0) {
      changes.speedTimer = speed();
      changes.rangeExecutedFlag = false;
    }
  } else if (entity.orderPhase === 'orderDecision' && entity.recoveryTime > 0 && entity.maxRecoveryTime > 0) {
    view.atbPercent = Math.max(0, entity.recoveryTime / entity.maxRecoveryTime * (entity.ATBfillBeforeOrder || 100));
  } else if (entity.orderPhase === 'orderExecution' && entity.orderExecutionTime > 0 && entity.maxOrderExecutionTime > 0) {
    view.atbPercent = Math.min(100, (entity.maxOrderExecutionTime - entity.orderExecutionTime) / entity.maxOrderExecutionTime * 100);
  }

  // These transition flags belong to the combat state, even when its HUD is
  // absent or rebuilt. Drawing a bar must never be required to advance them.
  if (entity.currentAttack) {
    if (entity.preparationTime > 0) {
      if (entity.currentAttack.attackRange?.includes('range') && entity.preparationTime <= 50 && !entity.rangeExecutedFlag) {
        view.attackExecuted = false;
        changes.rangeExecutedFlag = true;
      }
    } else if (entity.executionTime > 0) {
      changes.wasInExecution = true;
    }
  }
  return { changes, view };
}

// Read-only projection for an initial display or a rebuilt HUD.
export function readTimerDisplayState(entity) {
  return planTimerUpdate(entity).view;
}

// Called by combat phases at the former update points, independently of render.
export function advanceCombatTimerState(entity) {
  const { changes, view } = planTimerUpdate(entity);
  Object.assign(entity, changes);
  return view;
}
