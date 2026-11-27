import { combatNow, combatDelay, scheduleCombatTask, cancelCombatTask } from "./timeline.js";

const preparationWaits = new WeakMap();
export function waitPreparationPulse(entity, ms) {
  const task = scheduleCombatTask(() => true, ms);
  preparationWaits.set(entity, task);
  return task.promise.finally(() => { if (preparationWaits.get(entity) === task) preparationWaits.delete(entity); });
}
export function notifyPreparationInterrupted(entity) {
  cancelCombatTask(preparationWaits.get(entity));
}

// Intervals live on the entity so combat pause/reload preserves action progress.
export function addEntityControl(entity, kind, startedAt, expiresAt, rate = 1, source = kind) {
  const intervals = (entity.controlIntervals ||= {})[kind] ||= [];
  const last = intervals.findLast(interval => interval.source === source);
  if (last && last.end >= startedAt && last.rate === rate) last.end = Math.max(last.end, expiresAt);
  else {
    if (last && last.end > startedAt) last.end = startedAt;
    intervals.push({ start: startedAt, end: expiresAt, rate, source });
  }
}

export function endEntityControl(entity, kind, now = combatNow(), source = null) {
  for (const interval of entity?.controlIntervals?.[kind] || []) if (source === null || interval.source === source) interval.end = Math.min(interval.end, now);
}
export const getControlStates = (entity, kind, now = combatNow()) =>
  Object.values(entity?.controlEffects || {}).filter(state => state.kind === kind && state.expiresAt > now)
    .sort((a,b) => a.appliedOrder - b.appliedOrder);
export const getControlState = (entity, kind, now = combatNow()) => getControlStates(entity, kind, now).at(-1) || null;
export const getCombatSide = entity => entity?._combatSideAtLaunch ?? entity?.side;
export const getOriginalCombatSide = entity => entity?._combatOriginalSide ?? entity?.side;
// Only the uncharmed native members of a camp may finish converted opponents.
// Charmed entities remain allied to one another within their temporary camp.
export function isCharmedEnemyTarget(attacker, target) {
  return Boolean(attacker && target && attacker.id !== target.id
    && getCombatSide(attacker) === getCombatSide(target)
    && getOriginalCombatSide(attacker) === getCombatSide(attacker)
    && getOriginalCombatSide(target) !== getCombatSide(attacker)
    && !getControlState(attacker, 'charme')
    && getControlState(target, 'charme'));
}
export const isCombatEnemy = (attacker, target) =>
  getCombatSide(attacker) !== getCombatSide(target) || isCharmedEnemyTarget(attacker, target);
export function updateCharmedSide(entity) {
  const before = entity.side;
  const charm = getControlState(entity, 'charme');
  if (charm) { entity._combatOriginalSide ??= entity.side; entity.side = charm.side; }
  else if (entity._combatOriginalSide != null) { entity.side = entity._combatOriginalSide; delete entity._combatOriginalSide; }
  if (before === entity.side) return;
  for (const prefix of ['Box_Entite_', 'headsup-container_', 'ScanEntity_']) {
    const root = document.getElementById(`${prefix}${entity.id}`);
    if (!root) continue;
    for (const node of [root, ...root.querySelectorAll('[class]')]) for (const classPrefix of ['', 'side-', 'img-side-']) {
      if (!['A', 'B', 'neutral'].some(side => node.classList.contains(classPrefix + side))) continue;
      node.classList.remove(...['A', 'B', 'neutral'].map(side => classPrefix + side));
      node.classList.add(classPrefix + entity.side);
    }
  }
  const camp = document.querySelector(`#ScanEntity_${entity.id} .entity-camp`);
  if (camp) camp.textContent = `Camp ${entity.side === 'neutral' ? 'Neutre' : entity.side}`;
  const hud = document.getElementById(`headsup-container_${entity.id}`);
  const hudSide = document.querySelector(`.headsup-hud-side.side-${entity.side}`);
  if (hudSide && hud) hudSide.append(hud);
  if (hud) hud.hidden = entity.side === 'neutral';
  window.dispatchEvent(new CustomEvent('entityCombatSideChanged', { detail: { entity, previousSide: before } }));
}

export function getAttackControlValue(entity, field, key, fallback) {
  return getControlStates(entity, 'insolence').reduce((value, state) => state[field]?.[key] ?? value, fallback);
}
export function clearManualControlOverride(entity, field, keys = null) {
  for (const state of getControlStates(entity, 'insolence')) {
    if (keys === null) state[field] = {};
    else for (const key of keys) delete state[field]?.[key];
  }
}
export const isEntityAsleep = (entity, now = combatNow()) => active(entity, ['sommeil'], now);
// No random passive is attempted while asleep. Permanent stat reductions remain active.
export const canEntityProc = entity => !isEntityAsleep(entity);

const active = (entity, kinds, now) => kinds.some(kind =>
  (entity?.controlIntervals?.[kind] || []).some(({ start, end }) => start <= now && end > now));

export function isEntityActionPaused(entity, now = combatNow()) {
  return active(entity, ['stun', 'sommeil'], now);
}

export function getActionResumeTime(entity, now = combatNow()) {
  return Math.max(now, ...['stun', 'sommeil'].flatMap(kind => entity?.controlIntervals?.[kind] || [])
    .filter(({ start, end }) => start <= now && end > now).map(interval => interval.end));
}

export const isEntityMovementBlocked = (entity, now = combatNow()) =>
  active(entity, ['immobilisation', 'sommeil'], now);
export const isEntitySilenced = (entity, now = combatNow()) => active(entity, ['silence'], now);

function getControlElapsed(entity, kinds, from, to) {
  // Overlapping controls must suspend an action only once.
  const intervals = kinds.flatMap(kind => entity?.controlIntervals?.[kind] || [])
    .filter(({ start, end }) => end > from && start < to).sort((a, b) => a.start - b.start);
  let blocked = 0, cursor = from;
  for (const { start, end } of intervals) {
    blocked += Math.max(0, Math.min(to, end) - Math.max(cursor, start));
    cursor = Math.max(cursor, Math.min(to, end));
  }
  return Math.max(0, to - from - blocked);
}

export const getActionElapsed = (entity, from, to = combatNow()) =>
  getControlElapsed(entity, ['stun', 'sommeil'], from, to);
export const getMovementElapsed = (entity, from, to = combatNow()) =>
  getControlElapsed(entity, ['immobilisation', 'sommeil'], from, to);

export const getSleepElapsed = (entity, from, to = combatNow()) => to - from - getControlElapsed(entity, ['sommeil'], from, to);

export function getPhaseElapsed(entity, from, to, phase) {
  const slow = phase === 'preparationTime' ? 'bafouillage' : phase === 'speedTimer' ? 'lenteur' : null;
  if (!slow) return getActionElapsed(entity, from, to);
  const intervals = entity?.controlIntervals?.[slow] || [];
  const edges = [...new Set([from, to, ...intervals.flatMap(i => [i.start, i.end]).filter(t => t > from && t < to)])].sort((a,b)=>a-b);
  let elapsed = 0;
  for (let i=1; i<edges.length; i++) {
    const a=edges[i-1], b=edges[i];
    const rate = intervals.filter(entry => entry.start <= a && entry.end > a).reduce((product, entry) => product * entry.rate, 1);
    elapsed += getActionElapsed(entity, a, b) * rate;
  }
  return elapsed;
}

// Recoil events are replayed in time order, so several hits cannot remove progress
// which has not yet been earned. The same history serves melee impact scheduling.
export function getExecutionProgress(entity, from, to, duration) {
  let cursor=from, progress=0;
  for (const event of entity.executionRecoils || []) {
    if (event.at < from || event.at > to) continue;
    progress += getActionElapsed(entity, cursor, event.at);
    progress = Math.max(0, progress - duration * event.percent / 100);
    cursor = event.at;
  }
  return progress + getActionElapsed(entity, cursor, to);
}

export function applyControlRecoil(entity, percent) {
  const action = entity._combatAction;
  if (action?.stage === 'preparation') {
    (action.preparationRecoils ||= []).push({ at: combatNow(), percent });
    return true;
  }
  if (action?.stage === 'transport' && !(action.attack.attackRange || []).some(range => ['range','ranged','distance'].includes(range))) {
    (entity.executionRecoils ||= []).push({ at: combatNow(), percent });
    return true;
  }
  return false;
}

export function advanceInsolence(entity, keys, random = Math.random, state = getControlState(entity, 'insolence')) {
  if (!state || !keys.length || !canEntityProc(entity)) return;
  const weights = ['effectPriorityWeight','effectActivationWeight'].map(key => state.effect[key]);
  const total = weights.reduce((sum,n)=>sum+n,0);
  if (!total) return;
  let pick=random()*total, kind=0;
  while (kind<1 && pick>=weights[kind]) pick-=weights[kind++];
  const key=keys[Math.min(keys.length-1,Math.floor(random()*keys.length))];
  state.disabled ||= {}; state.priorities ||= {};
  if (kind===0) {
    if (keys.length < 2) return;
    const rankFor = candidate => getAttackControlValue(entity, 'priorities', candidate, entity.attackSelection?.priorities?.[candidate] ?? keys.indexOf(candidate)+1);
    const previous = rankFor(key);
    const ranks = keys.map((_,index)=>index+1).filter(rank=>rank!==previous);
    const rank = ranks[Math.min(ranks.length-1,Math.floor(random()*ranks.length))];
    const other = keys.find(candidate=>candidate!==key && rankFor(candidate)===rank);
    state.priorities[key]=rank;
    if (other) state.priorities[other]=previous;
  }
  else state.disabled[key]=!getAttackControlValue(entity, 'disabled', key, entity.attackSelection?.disabled?.[key] ?? false);
  state.changes = (state.changes || 0) + 1;
  return true;
}

export async function waitForEntityMovement(entity, canContinue) {
  while (isEntityMovementBlocked(entity)) {
    if (!canContinue()) return false;
    await combatDelay(50);
  }
  return canContinue();
}

export async function waitForEntitySilence(entity, canContinue) {
  while (isEntitySilenced(entity)) {
    if (!canContinue()) return false;
    const now = combatNow();
    const end = Math.max(...entity.controlIntervals.silence
      .filter(interval => interval.start <= now && interval.end > now).map(interval => interval.end));
    await combatDelay(Math.min(50, end - now));
  }
  return canContinue();
}

export async function waitForEntityControl(entity, canContinue) {
  while (isEntityActionPaused(entity)) {
    if (!canContinue()) return false;
    await combatDelay(50);
  }
  return canContinue();
}
