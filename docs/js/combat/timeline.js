import { setTimeout, clearTimeout, clockNow } from "./clock.js";
// Gameplay deadlines are independent of rendering and timer callback latency.
// Equal deadlines share a batch; overdue, different deadlines NEVER get merged.
let pending = [], wake = null, draining = null, currentTime = null, sequence = 0;
let impactBatch = null;

export const combatNow = () => currentTime ?? clockNow();
export const isResolvingCombatImpacts = () => impactBatch !== null;
export const hasPendingCombatDeath = entity => Boolean(impactBatch
  && impactBatch.stage !== 'death' && impactBatch.deaths.has(entity));

export function atCombatStart(callback) {
  const previous = currentTime;
  currentTime ??= clockNow();
  try { return callback(); } finally { currentTime = previous; }
}

function checkpoint() {
  return new Promise(resolve => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close(); channel.port2.close(); resolve();
    };
    channel.port2.postMessage(null);
  });
}

function arm() {
  if (draining) return;
  clearTimeout(wake);
  pending.sort((a, b) => a.at - b.at || a.id - b.id);
  if (!pending.length) { wake = null; return; }
  wake = setTimeout(() => {
    wake = null;
    // Mark the drain active before its first callback can schedule another
    // phase; otherwise that callback can accidentally arm a concurrent drain.
    draining = Promise.resolve().then(drainInstant).finally(() => { draining = null; arm(); });
    draining.catch(error => console.error('[CombatTimeline]', error));
  }, Math.max(0, pending[0].at - clockNow()));
}

function schedule(at, kind, callback) {
  if (!Number.isFinite(at)) throw new Error('Échéance de combat invalide');
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  const task = { id: ++sequence, at, kind, callback, resolve, reject, promise };
  pending.push(task); arm();
  return task;
}

export function scheduleCombatTask(callback, delay = 0) {
  return schedule(combatNow() + Math.max(0, Number(delay) || 0), 'phase', callback);
}
export function cancelCombatTask(task) {
  if (!task) return;
  pending = pending.filter(item => item !== task);
  task.resolve(false); arm();
}
export const combatDelay = ms => scheduleCombatTask(() => true, ms).promise;
export const scheduleCombatImpactTask = (at, prepare) => schedule(at, 'impact', prepare);
export const scheduleCombatImpact = (at, prepare) => scheduleCombatImpactTask(at, prepare).promise;

// Effects run after all impacts; death/survival is finalized after all effects.
export function deferCombatEffect(callback) {
  if (!impactBatch || impactBatch.stage !== 'damage') return false;
  impactBatch.effects.push(callback);
  return true;
}
export function deferCombatDeath(entity, callback, hasAttacker = false) {
  if (!impactBatch || impactBatch.stage === 'death') return false;
  const previous = impactBatch.deaths.get(entity);
  if (!previous || hasAttacker && !previous.hasAttacker) {
    impactBatch.deaths.set(entity, { callback, hasAttacker });
  }
  return true;
}

async function drainInstant() {
  if (!pending.length) return;
  currentTime = Math.min(...pending.map(task => task.at));
  try {
    // Drain phase continuations first so every launch at this instant is known.
    let passes = 0;
    while (true) {
      const phases = pending.filter(task => task.at === currentTime && task.kind === 'phase');
      pending = pending.filter(task => !phases.includes(task));
      for (const task of phases) {
        try { task.resolve(task.callback()); } catch (error) { task.reject(error); }
      }
      await checkpoint();
      if (!pending.some(task => task.at === currentTime && task.kind === 'phase')) break;
      if (++passes > 10000) throw new Error('Boucle de phases de combat sans progression');
    }
    const impacts = pending.filter(task => task.at === currentTime && task.kind === 'impact');
    pending = pending.filter(task => !impacts.includes(task));
    if (impacts.length) {
      impactBatch = { stage: 'damage', effects: [], deaths: new Map() };
      // Validate every flight before any of them can kill a caster/target.
      const prepared = impacts.map(task => {
        try { return { task, commit: task.callback() }; }
        catch (error) { task.reject(error); return { task, commit: null }; }
      });
      for (const entry of prepared) {
        try { entry.result = typeof entry.commit === 'function' ? entry.commit() : entry.commit; }
        catch (error) { entry.task.reject(error); }
      }
      await checkpoint();
      impactBatch.stage = 'effects';
      for (const effect of impactBatch.effects) effect();
      await checkpoint();
      impactBatch.stage = 'death';
      for (const { callback } of impactBatch.deaths.values()) callback();
      impactBatch = null;
      window.dispatchEvent(new Event('combatImpactsSettled'));
      // Resume attack/recovery loops only after extra lives and healing. A
      // temporary zero HP inside the batch is not yet a dead combatant.
      for (const { task, result } of prepared) task.resolve(result);
    }
    await checkpoint();
  } finally { impactBatch = null; currentTime = null; }
}

// The virtual clock must not advance while this instant's promise jobs run.
export async function settleCombatTimeline() {
  if (draining) await draining;
}

export function clearCombatTimeline() {
  clearTimeout(wake); wake = null;
  const cancelled = pending; pending = [];
  for (const task of cancelled) task.resolve(false);
}
if (typeof window !== 'undefined') {
  window.addEventListener('battleResolved', clearCombatTimeline);
  window.addEventListener('battleStopped', clearCombatTimeline);
}
