import { setDisplayStyle, setDisplayClass, toggleDisplayClass, flushCombatDisplay } from "./displayBatch.js";
import { requestAnimationFrame } from '../combat/clock.js';

// Phase transitions own the remaining time. These helpers only present it;
// keeping their calls synchronous preserves the existing animation sequence.
export function resetAttackBar(attacker) {
  const bar = document.getElementById(`currentAttackBar_${attacker.id}`);
  if (!bar) return;
  flushCombatDisplay(bar);
  bar.style.transition = 'none';
  bar.style.width = '0%';
  void bar.offsetWidth;
  requestAnimationFrame(() => {
    flushCombatDisplay(bar);
    bar.style.transition = '';
    bar.style.width = '0%';
  });
}

export function updateAttackBarFromRemaining(attacker, phase, duration) {
  const bar = document.getElementById(`currentAttackBar_${attacker.id}`);
  if (!bar) return;
  const remaining = Math.max(0, Number(attacker[phase]) || 0);
  const dur = Math.max(1, Number(duration) || 1);
  const pct = Math.max(0, Math.min(1, 1 - remaining / dur));
  setDisplayStyle(bar, 'width', `${(pct * 100).toFixed(2)}%`);
}

export function beginRecoveryBar(attacker, isTargetSearchRecovery) {
  const bar = document.getElementById(`currentAttackBar_${attacker.id}`);
  if (bar) {
    setDisplayStyle(bar, 'width', isTargetSearchRecovery ? '0%' : '100%');
    setDisplayClass(bar, isTargetSearchRecovery ? 'attack-bar-fill empty' : 'attack-bar-fill recovery');
  }
  // Retain the same node for this phase, matching interruption/rebuild behavior.
  return () => {
    if (bar) {
      setDisplayStyle(bar, 'width', '0%');
      setDisplayClass(bar, 'attack-bar-fill empty');
    }
  };
}

export function beginPreparationBar(attacker) {
  const bar = document.getElementById(`currentAttackBar_${attacker.id}`);
  if (!bar) return;
  setDisplayStyle(bar, 'transition', 'width 0.05s linear');
  setDisplayStyle(bar, 'width', `${attacker.preparationProgressRatio * 100}%`);
  toggleDisplayClass(bar, 'mysticism-accelerated', false);
  toggleDisplayClass(bar, 'occultism-slowed', false);
}

export function updatePreparationBar(attacker, progressRatio, mysticActive, occultismActive) {
  const bar = document.getElementById(`currentAttackBar_${attacker.id}`);
  if (!bar) return;
  setDisplayStyle(bar, 'transition', 'width 0.05s linear');
  setDisplayStyle(bar, 'width', `${(progressRatio * 100).toFixed(2)}%`);
  toggleDisplayClass(bar, 'mysticism-accelerated', mysticActive);
  toggleDisplayClass(bar, 'occultism-slowed', occultismActive);
}

export function finishPreparationBar(attacker) {
  const bar = document.getElementById(`currentAttackBar_${attacker.id}`);
  if (!bar) return;
  toggleDisplayClass(bar, 'mysticism-accelerated', false);
  toggleDisplayClass(bar, 'occultism-slowed', false);
  setDisplayStyle(bar, 'width', '100%');
}

export function resetInterruptedPreparationBar(entity) {
  const bar = document.getElementById(`currentAttackBar_${entity.id}`);
  if (bar) { setDisplayStyle(bar, 'transition', 'none'); setDisplayStyle(bar, 'width', '0%'); }
}

export function finishOrderBar(entity) {
  const bar = document.querySelector(`#atbFill_${entity.id}`);
  if (bar) {
    setDisplayStyle(bar, 'width', '100%');
    console.log(`🛠️ DOM mis à jour pour ATB de ${entity.name} → 100%`);
  }
}
