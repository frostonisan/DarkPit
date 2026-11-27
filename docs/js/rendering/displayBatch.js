import { gameStarted } from '../app/state.js';
import { isCombatPaused } from '../combat/clock.js';

// Only replaceable presentation values enter this queue. Impacts, sounds,
// animation starts and combat state transitions keep their original cadence.
const pending = new Map();
const propertyNames = new Map();
let frame = null;

// These view attributes are also read synchronously by UI/targeting code.
// Keep their publication immediate, but do not invalidate style for equal values.
export function setDOMAttribute(node, name, value) {
  if (!node) return;
  value = String(value);
  if (node.getAttribute(name) !== value) node.setAttribute(name, value);
}

export function setDOMText(node, value) {
  if (!node) return;
  value = String(value);
  if (value && node.childNodes.length === 1 && node.firstChild.nodeType === Node.TEXT_NODE) {
    if (node.firstChild.data !== value) node.firstChild.data = value;
  } else if (node.textContent !== value || node.childNodes.length !== (value ? 1 : 0)
    || value && node.firstChild.nodeType !== Node.TEXT_NODE) node.textContent = value;
}

export function replaceDOMClassGroup(node, removed, added) {
  if (!node) return;
  // Preserve the token order of classList.remove(...removed), then add(...added).
  const excluded = new Set(removed);
  const classes = new Set([...node.classList].filter(name => !excluded.has(name)));
  for (const name of added) classes.add(String(name));
  setDOMAttribute(node, 'class', [...classes].join(' '));
}

function apply(node, update) {
  if (update.kind === 'style') {
    if (node.style.getPropertyValue(update.name) !== update.value
      || node.style.getPropertyPriority(update.name) !== update.priority) {
      node.style.setProperty(update.name, update.value, update.priority);
    }
  } else if (update.kind === 'text') {
    if (node.textContent !== update.value) setDOMText(node, update.value);
  } else if (update.kind === 'class') {
    // Publish the final token set once. Replacing the phase then restoring
    // modifiers would invalidate the same subtree twice before it can paint.
    const classes = new Set(update.replace === null ? node.classList : update.replace.split(/\s+/).filter(Boolean));
    for (const [name, enabled] of update.toggles) {
      if (enabled) classes.add(name);
      else classes.delete(name);
    }
    setDOMAttribute(node, 'class', [...classes].join(' '));
  }
}

function cancelEmptyFrame() {
  if (!pending.size && frame !== null) {
    globalThis.cancelAnimationFrame(frame);
    frame = null;
  }
}

// A targeted flush is used before a deliberate bar animation layout read.
// A full flush is required before pause snapshots and synchronous DOM previews.
export function flushCombatDisplay(node = null) {
  if (!pending.size) return;
  const entries = node ? [[node, pending.get(node)]] : pending;
  for (const [target, updates] of entries) {
    pending.delete(target);
    if (target.isConnected && updates) for (const update of updates.values()) apply(target, update);
  }
  cancelEmptyFrame();
}

export function discardCombatDisplay() {
  pending.clear();
  cancelEmptyFrame();
}

function batchFor(node) {
  if (!gameStarted || isCombatPaused() || globalThis.__combatSimulation === true
    || document.hidden || !node.isConnected || !globalThis.requestAnimationFrame) {
    flushCombatDisplay();
    return null;
  }
  let updates = pending.get(node);
  if (!updates) pending.set(node, updates = new Map());
  if (frame === null) frame = globalThis.requestAnimationFrame(() => {
    frame = null;
    flushCombatDisplay();
  });
  return updates;
}

export function setDisplayStyle(node, property, value, priority = '') {
  if (!node) return;
  let name = propertyNames.get(property);
  if (!name) propertyNames.set(property, name = property.replace(/[A-Z]/g, c => '-' + c.toLowerCase()));
  value = String(value);
  const previous = pending.get(node)?.get('style:' + name);
  if (previous ? previous.value === value && previous.priority === priority
    : node.style.getPropertyValue(name) === value && node.style.getPropertyPriority(name) === priority) return;
  // Validate changed values only. Invalid CSS must not erase an earlier valid
  // pending write (e.g. HP 0/0), but unchanged values need no second CSS parse.
  if (value && !CSS.supports(name, value)) return;
  const updates = batchFor(node);
  const update = previous || { kind: 'style', name };
  update.value = value; update.priority = priority;
  if (updates) updates.set('style:' + name, update);
  else apply(node, update);
}

export function setDisplayText(node, value) {
  if (!node) return;
  value = String(value);
  const previous = pending.get(node)?.get('text');
  if ((previous ? previous.value : node.textContent) === value) return;
  const updates = batchFor(node), update = previous || { kind: 'text' };
  update.value = value;
  if (updates) updates.set('text', update);
  else apply(node, update);
}

export function setDisplayClass(node, value) {
  if (!node) return;
  const previous = pending.get(node)?.get('class');
  if (previous?.replace === value && !previous.toggles.size) return;
  if (!previous && node.className === value) return;
  const update = { kind: 'class', replace: value, toggles: new Map() }, updates = batchFor(node);
  if (updates) updates.set('class', update);
  else apply(node, update);
}

export function toggleDisplayClass(node, name, enabled) {
  if (!node) return;
  enabled = Boolean(enabled);
  const previous = pending.get(node)?.get('class');
  const current = previous?.toggles.has(name) ? previous.toggles.get(name)
    : previous?.replace !== null && previous?.replace !== undefined
      ? previous.replace.split(/\s+/).includes(name) : node.classList.contains(name);
  if (current === enabled) return;
  const updates = batchFor(node);
  const update = updates?.get('class') || { kind: 'class', replace: null, toggles: new Map() };
  update.toggles.set(name, enabled);
  if (updates) updates.set('class', update);
  else apply(node, update);
}

if (typeof window !== 'undefined') {
  for (const event of ['battleStopped', 'battleEnding']) {
    window.addEventListener(event, () => flushCombatDisplay());
  }
  for (const event of ['stageInterfaceClosing', 'combatPauseRestored']) {
    window.addEventListener(event, discardCombatDisplay);
  }
  // Visibility pauses flush through pauseCombat, after the gameplay clock has
  // frozen. Rendering must not delay the logical instant chosen for the pause.
}
