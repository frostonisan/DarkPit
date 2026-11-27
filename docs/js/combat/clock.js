// One clock for gameplay deadlines, periodic effects and their rendering.
// Browser/UI time is intentionally independent. GIF decoding stays native.
const nativeTimeout = globalThis.setTimeout.bind(globalThis);
const nativeClear = globalThis.clearTimeout.bind(globalThis);
const nativeFrame = globalThis.requestAnimationFrame?.bind(globalThis);
const nativeCancelFrame = globalThis.cancelAnimationFrame?.bind(globalThis);
let offset = 0, pausedAt = null, nextId = -1;
const timers = new Map(), frames = new Map(), sections = new Map();
const resumeWaiters = new Set();
// Permissions are separate from time: tactical actions can run on a frozen clock.
let interactionBlocked = false;
export const isCombatInteractionBlocked = () => interactionBlocked;
export const setCombatInteractionBlocked = blocked => { interactionBlocked = Boolean(blocked); };
export function notifyCombatAction() {
  if (isCombatPaused()) globalThis.dispatchEvent(new Event('combatActionCommitted'));
}
export function trackCombatAction(promise) {
  const action = trackCombatOperation(promise);
  notifyCombatAction();
  action.then(notifyCombatAction, notifyCombatAction);
  return action;
}

export const clockNow = () => pausedAt ?? Date.now() - offset;
export const isCombatPaused = () => pausedAt !== null;
export const waitForCombatResume = () => isCombatPaused()
  ? new Promise(resolve => resumeWaiters.add(resolve)) : Promise.resolve();

function arm(timer) {
  if (isCombatPaused()) return;
  timer.native = nativeTimeout(() => {
    timer.native = null;
    if (!timers.has(timer.id) || isCombatPaused()) return;
    if (!timer.interval) timers.delete(timer.id);
    try { timer.callback(...timer.args); }
    finally {
      if (timer.interval && timers.has(timer.id)) {
        timer.at = clockNow() + timer.interval;
        arm(timer);
      }
    }
  }, Math.max(0, timer.at - clockNow()));
}

function schedule(callback, delay, args, interval = 0) {
  const timer = { id: nextId--, callback, args, interval,
    at: clockNow() + Math.max(0, Number(delay) || 0), native: null };
  timers.set(timer.id, timer); arm(timer);
  return timer.id;
}
export const setTimeout = (callback, delay = 0, ...args) => schedule(callback, delay, args);
export const setInterval = (callback, delay = 0, ...args) => schedule(callback, delay, args, Math.max(1, Number(delay) || 0));
export function clearTimeout(id) {
  const timer = timers.get(id);
  if (timer) { nativeClear(timer.native); timers.delete(id); }
  else if (id >= 0) nativeClear(id);
}
export const clearInterval = clearTimeout;

function armFrame(frame) {
  if (isCombatPaused() || !nativeFrame) return;
  frame.native = nativeFrame(renderFrameStamp => {
    frame.native = null;
    if (isCombatPaused() || !frames.has(frame.id)) return;
    frames.delete(frame.id);
    frame.callback(clockNow(), renderFrameStamp);
  });
}
export function requestAnimationFrame(callback) {
  const frame = { id: nextId--, callback, native: null };
  frames.set(frame.id, frame); armFrame(frame);
  return frame.id;
}
export function cancelAnimationFrame(id) {
  const frame = frames.get(id);
  if (frame) { nativeCancelFrame?.(frame.native); frames.delete(id); }
  else if (id >= 0) nativeCancelFrame?.(id);
}
export function freezeCombatClock(at = clockNow()) {
  if (isCombatPaused()) return;
  pausedAt = at;
  for (const timer of timers.values()) { nativeClear(timer.native); timer.native = null; }
  for (const frame of frames.values()) { nativeCancelFrame?.(frame.native); frame.native = null; }
}
export function resumeCombatClock() {
  if (!isCombatPaused()) return;
  offset = Date.now() - pausedAt; pausedAt = null;
  for (const timer of timers.values()) arm(timer);
  for (const frame of frames.values()) armFrame(frame);
  for (const resolve of resumeWaiters) resolve();
  resumeWaiters.clear();
}
export const combatClockSequence = () => nextId;
export function restoreCombatClock(at, sequence = -1) {
  nextId = sequence;
  for (const timer of timers.values()) nativeClear(timer.native);
  for (const frame of frames.values()) nativeCancelFrame?.(frame.native);
  timers.clear(); frames.clear();
  pausedAt = at; offset = Date.now() - at;
}
export const remainingCombatTimer = id => Math.max(0, (timers.get(id)?.at ?? clockNow()) - clockNow());

// Each owner persists data, never a function, DOM node or promise.
export function registerCombatState(name, capture, restore) { sections.set(name, { capture, restore }); }
export function captureCombatState() {
  return Object.fromEntries([...sections].map(([name, section]) => [name, section.capture()]));
}
export async function restoreCombatState(snapshot, context) {
  const order = ['boosts', 'modifiers', 'roles', 'orders', 'nature-effects', 'alterations', 'ground', 'melee', 'flights', 'turns'];
  const entries = [...sections].sort(([a], [b]) => (order.indexOf(a) < 0 ? 5 : order.indexOf(a)) - (order.indexOf(b) < 0 ? 5 : order.indexOf(b)));
  for (const [name, section] of entries) if (snapshot[name] !== undefined) await section.restore(snapshot[name], context);
}

export function clearCombatClock() {
  for (const timer of timers.values()) nativeClear(timer.native);
  for (const frame of frames.values()) nativeCancelFrame?.(frame.native);
  timers.clear(); frames.clear();
  resumeCombatClock();
}

export const setIntervalFrom = (callback, interval, firstDelay = interval) =>
  schedule(callback, firstDelay ?? interval, [], Math.max(1, Number(interval) || 0));

const operations = new Set();
export function trackCombatOperation(promise) {
  operations.add(promise);
  promise.then(() => operations.delete(promise), () => operations.delete(promise));
  return promise;
}
export async function settleCombatOperations() {
  do {
    await Promise.allSettled([...operations]);
    await new Promise(resolve => nativeTimeout(resolve, 0));
  } while (operations.size);
}

// Visual removal uses the same gameplay clock as combat deadlines.
export function removeCombatVisualAfter(node, delay) {
  const at = clockNow() + Math.max(0, Number(delay) || 0);
  node.dataset.combatRemoveAt = String(at);
  const timer = setTimeout(() => {
    if (Number(node.dataset.combatRemoveAt) === at) node.remove();
  }, delay);
  return { cancel: () => clearTimeout(timer) };
}

// Saved actions contain identifiers and values, never live browser objects.
export function combatData(value) {
  const ancestors = [];
  return JSON.parse(JSON.stringify(value, function (_key, item) {
    if (typeof item === 'function' || typeof item === 'symbol'
      || typeof Node !== 'undefined' && item instanceof Node
      || typeof Window !== 'undefined' && item instanceof Window) return undefined;
    if (item && typeof item === 'object') {
      while (ancestors.length && ancestors.at(-1) !== this) ancestors.pop();
      if (ancestors.includes(item)) return undefined;
      ancestors.push(item);
    }
    return item;
  }));
}
export const combatReference = target => target?.nodeType === 1
  ? { hex: target.dataset.position, id: target.id, side: target.classList.contains('SideB') ? 'B' : target.classList.contains('SideA') ? 'A' : 'Neutral' }
  : { entity: target?.id };
export function combatTarget(reference, entities) {
  if (reference?.entity != null) return entities.find(entity => String(entity.id) === String(reference.entity));
  if (reference?.id) return document.getElementById(reference.id);
  return [...document.querySelectorAll('#hexGrid .hex')].find(hex => hex.dataset.position === String(reference?.hex)
    && hex.classList.contains(reference?.side === 'Neutral' ? 'Neutral' : `Side${reference?.side}`));
}
