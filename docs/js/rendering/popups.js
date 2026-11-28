import { clockNow, removeCombatVisualAfter, setTimeout, clearTimeout } from "../combat/clock.js";
import { EFFECT_VISUALS } from "../data/effectVisuals.js";

export const POPUP_LIMITS = Object.freeze({ damage: 8, history: 6, front: 3, outgoing: 3, movementLoss: 3 });
const removals = new WeakMap();
const animations = new WeakMap();
const trajectories = new Map();
const paths = ['center', 'left', 'right'];
const historySteps = [0, 16, 28, 37, 44, 49];
let damagePools = new WeakMap();

// The DOM owns the cursors and deadlines, so the existing paused-scene snapshot
// can restore the feed without a second saved-state format or replayed events.
export function calibrateEntityVisuals(sprite, parent, damageHost, statusHost, { auraHost, effectsHost }) {
  const box = sprite.closest('.entite-box');
  if (box.classList.contains('entity-visual-calibrated')) return;
  // Remove the old popup's flow width before sampling the native layout.
  damageHost.classList.add('combat-popup-damages');
  statusHost.classList.add('combat-popup-status');
  const css = getComputedStyle(sprite);
  const width = parseFloat(css.width) || 120, height = parseFloat(css.height) || 120;
  let top = 0;
  // Local layout offsets exclude idle transforms and the scale of ancestors.
  // Read once when the entity has been inserted, never when a hit arrives.
  for (let node = sprite; node && node !== parent; node = node.offsetParent) {
    top += node.offsetTop;
  }
  const facingOffset = parseFloat(getComputedStyle(sprite.closest('.img-container')).left) || 0;
  const left = sprite.classList.contains('side-B') ? -facingOffset : facingOffset;
  const entityHost = damageHost.parentElement, drag = entityHost.parentElement;
  const baseScale = new DOMMatrixReadOnly(getComputedStyle(entityHost).transform).a;
  const dragCSS = getComputedStyle(drag);
  const dragOriginY = parseFloat(dragCSS.transformOrigin.split(' ')[1]) || 0;
  const vars = {
    '--popup-sprite-w': `${width}px`, '--popup-sprite-h': `${height}px`,
    '--entity-visual-left': `${left}px`, '--entity-foot-y': `${top + height}px`,
    '--entity-base-scale': baseScale,
    '--entity-cast-left': dragCSS.position === 'absolute' && drag.offsetWidth === 0 ? '0px' : '50%',
    '--entity-drag-top': `${drag.offsetTop}px`, '--entity-drag-origin-y': `${dragOriginY}px`,
    '--entity-drag-transform': dragCSS.transform
  };
  const auraX = sprite.offsetLeft, auraY = sprite.offsetTop;
  // Finish all reads before publishing geometry on the original hosts.
  // Wide sprites may offset img-container: keep hex growth at their feet.
  parent.style.setProperty('--entity-foot-y', `${top + height}px`);
  parent.style.transformOrigin = `calc(50% + ${left}px) var(--entity-foot-y)`;
  box.dataset.spriteWidth = String(width); box.dataset.spriteHeight = String(height);
  for (const [key, value] of Object.entries(vars)) box.style.setProperty(key, value);
  auraHost.style.setProperty('--aura-local-x', `${auraX}px`);
  auraHost.style.setProperty('--aura-local-y', `${auraY}px`);
  effectsHost.classList.add('entity-effects-calibrated');
  box.classList.add('entity-visual-calibrated');
  ensureStatusLanes(statusHost);
  return box;
}

function removeCard(node) {
  if (!node) return;
  removals.get(node)?.cancel(); removals.delete(node);
  // Keep handles on the hot path; getAnimations can flush style. The fallback
  // only serves nodes rebuilt by the existing paused-scene restoration.
  for (const animation of animations.get(node) || node.getAnimations({ subtree: true })) animation.cancel();
  animations.delete(node);
  node.remove();
}

function expire(node, duration) {
  removals.get(node)?.cancel();
  removals.set(node, removeCombatVisualAfter(node, duration));
}

function animateCard(node, body, frames, duration) {
  animations.set(node, [body.animate(frames, { duration, fill: 'forwards', easing: 'linear' })]);
  expire(node, duration);
}

function fountainFrames(path, priority) {
  const key = `${path}:${priority}`;
  if (trajectories.has(key)) return trajectories.get(key);
  const direction = path === 'left' ? -1 : path === 'right' ? 1 : 0;
  const height = direction ? 22 : 28, landing = direction ? 8 : -6;
  const peak = priority === 3 ? 1.5 : priority === 1 ? 1.45 : 1.4;
  const frames = [
    { transform: `translate(0px, 0px) scale(${peak})`, opacity: 1, offset: 0 },
    { transform: `translate(0px, 0px) scale(${peak})`, opacity: 1, offset: .065 }
  ];
  for (let step = 1; step <= 18; step++) {
    const t = step / 18, x = direction * 66 * t, y = -4 * height * t * (1 - t) + landing * t;
    frames.push({ transform: `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${(1 - .86 * t).toFixed(3)})`, offset: .065 + .935 * t });
  }
  frames.push({ opacity: 1, offset: .8 }, { opacity: .5, offset: .9 }, { opacity: 0, offset: 1 });
  frames.sort((a, b) => a.offset - b.offset);
  trajectories.set(key, frames);
  return frames;
}

function makeCard(content, className) {
  const node = document.createElement('div'); node.className = `combat-popup-card ${className}`;
  const body = document.createElement('div'); body.className = 'combat-popup-life';
  body.append(content); node.append(body);
  return { node, body };
}

function damageView(node) {
  const body = node.firstElementChild, content = body.firstElementChild;
  return { node, body, content, icon: content.firstElementChild,
    value: content.querySelector('.damage-popup-value'), suffix: content.querySelector('.combat-popup-critical-suffix') };
}

function damagePool(host) {
  let pool = damagePools.get(host);
  if (!pool) {
    // A paused-scene reload restores only the active DOM, not the spare cache.
    // Adopt it lazily; no events or animations are replayed on restoration.
    const views = [...host.children].filter(node => node.classList.contains('combat-popup-flight')).map(damageView);
    pool = { active: views.sort((a, b) => Number(a.node.style.zIndex) - Number(b.node.style.zIndex)), idle: [] };
    damagePools.set(host, pool);
  }
  // The restored removal deadlines use the normal clock's DOM cleanup.
  for (let i = pool.active.length - 1; i >= 0; i--) {
    const view = pool.active[i];
    if (view.node.parentElement !== host) { pool.active.splice(i, 1); pool.idle.push(view); }
  }
  return pool;
}

function cancelDamage(view) {
  removals.get(view.node)?.cancel(); removals.delete(view.node);
  for (const animation of animations.get(view.node) || view.node.getAnimations({ subtree: true })) animation.cancel();
  animations.set(view.node, []);
  delete view.node.dataset.combatRemoveAt;
}

function retireDamage(pool, view) {
  cancelDamage(view);
  const index = pool.active.indexOf(view);
  if (index < 0) return;
  pool.active.splice(index, 1); pool.idle.push(view);
  // Detached spares cost no layout, paint or paused-scene serialization.
  view.node.remove();
}

function acquireDamage(pool) {
  const reused = pool.idle.pop() || (pool.active.length >= POPUP_LIMITS.damage ? pool.active.shift() : null);
  if (reused) { cancelDamage(reused); return reused; }
  const content = document.createElement('div');
  const icon = document.createElement('span'); icon.setAttribute('aria-hidden', 'true');
  const value = document.createElement('span'); value.className = 'damage-popup-value';
  content.append(icon, value);
  return { ...makeCard(content, 'combat-popup-flight'), content, icon, value, suffix: null };
}

export function showDamagePopup(host, { className, iconClass, valueClass, amount, label, critical }, priority = 0) {
  if (!host.classList.contains('combat-popup-damages')) host.classList.add('combat-popup-damages');
  const pool = damagePool(host);
  if (!pool.active.length) host.dataset.flightCursor = '0';
  const cursor = Number(host.dataset.flightCursor) || 0;
  const path = paths[cursor % paths.length]; host.dataset.flightCursor = String((cursor + 1) % paths.length);
  const view = acquireDamage(pool), { node, body, content, icon, value } = view;
  const previous = pool.active.at(-1)?.node;
  if (previous) delete previous.dataset.latest;
  node.dataset.latest = 'true';
  if (content.className !== className) content.className = className;
  if (icon.className !== iconClass) icon.className = iconClass;
  if (value.className !== valueClass) value.className = valueClass;
  const text = label ?? `−${amount}`;
  if (value.firstChild?.nodeType === Node.TEXT_NODE) {
    if (value.firstChild.data !== text) value.firstChild.data = text;
  } else value.textContent = text;
  if (critical) {
    if (!view.suffix) {
      view.suffix = document.createElement('span'); view.suffix.className = 'combat-popup-critical-suffix'; view.suffix.textContent = '!!!';
    }
    if (view.suffix.parentNode !== content) content.append(view.suffix);
  } else view.suffix?.remove();
  if (node.dataset.flight !== path) node.dataset.flight = path;
  if (node.dataset.priority !== String(priority)) node.dataset.priority = String(priority);
  if (node.parentNode !== host) host.append(node);
  pool.active.push(view);
  pool.active.forEach((card, index) => {
    const z = String(index + 1);
    if (card.node.style.zIndex !== z) card.node.style.zIndex = z;
  });
  const duration = priority === 3 ? 1750 : priority === 1 ? 1550 : 1350;
  animations.set(node, [body.animate(fountainFrames(path, priority), { duration, fill: 'forwards', easing: 'linear' })]);
  const at = clockNow() + duration;
  node.dataset.combatRemoveAt = String(at);
  const timer = setTimeout(() => {
    if (Number(node.dataset.combatRemoveAt) === at) retireDamage(pool, view);
  }, duration);
  removals.set(node, { cancel: () => clearTimeout(timer) });
  return content;
}

function ensureStatusLanes(host) {
  if (host.querySelector('.combat-popup-history')) return;
  const history = document.createElement('div'); history.className = 'combat-popup-history';
  host.append(history);
  for (const name of paths) {
    const lane = document.createElement('div'); lane.className = 'combat-popup-lane'; lane.dataset.lane = name; host.append(lane);
  }
}

function addHistory(host, content) {
  const history = host.querySelector('.combat-popup-history');
  const copy = content.cloneNode(true);
  copy.removeAttribute('id'); copy.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
  const { node, body } = makeCard(copy, 'combat-popup-history-row');
  history.append(node);
  while (history.children.length > POPUP_LIMITS.history) removeCard(history.firstElementChild);
  [...history.children].reverse().forEach((row, rank) => {
    const depth = Math.max(Number(row.dataset.depth) || 0, rank); row.dataset.depth = String(depth);
    row.style.transform = `translateY(${-historySteps[depth]}px) scale(${Math.max(.2, .78 ** depth)})`;
    row.style.opacity = String(Math.max(.24, .96 - depth * .09));
  });
  animateCard(node, body, [
    { transform: 'translateY(3px) scale(.86)', opacity: 0, offset: 0, easing: 'cubic-bezier(.16,1,.3,1)' },
    { transform: 'translateY(0px) scale(1.14)', opacity: 1, offset: .06, easing: 'ease-out' },
    { transform: 'translateY(-1px) scale(.94)', opacity: 1, offset: .2 },
    { transform: 'translateY(-4px) scale(.6)', opacity: 1, offset: .55 },
    { transform: 'translateY(-6px) scale(.35)', opacity: .65, offset: .8 },
    { transform: 'translateY(-8px) scale(.16)', opacity: 0, offset: 1 }
  ], 1700);
}

export function showEffectPopup(host, content) {
  ensureStatusLanes(host);
  // Only text is duplicated in the compact history; no VFX enters this renderer.
  addHistory(host, content);
  const central = host.querySelector('[data-lane="center"] > .combat-popup-front');
  const laneName = !central || clockNow() - Number(central.dataset.born) >= 240 ? 'center'
    : ['left', 'right'][(Number(host.dataset.laneCursor) || 0) % 2];
  host.dataset.laneCursor = laneName === 'center' ? '0' : String(((Number(host.dataset.laneCursor) || 0) + 1) % 2);
  const lane = host.querySelector(`[data-lane="${laneName}"]`);
  removeCard(lane.querySelector('.combat-popup-outgoing'));
  const previous = lane.querySelector('.combat-popup-front');
  if (previous) {
    previous.classList.replace('combat-popup-front', 'combat-popup-outgoing');
    previous.style.zIndex = '0';
    const active = animations.get(previous) || previous.getAnimations({ subtree: true });
    active.push(previous.animate([{ opacity: 1, transform: 'translateY(0) scale(1)' }, { opacity: 0, transform: 'translateY(-14px) scale(.96)' }],
      { duration: 280, easing: 'ease-out', fill: 'forwards' }));
    animations.set(previous, active);
    expire(previous, 280);
  }
  const { node, body } = makeCard(content, 'combat-popup-front'); node.dataset.born = String(clockNow());
  node.style.zIndex = '1'; lane.append(node);
  animateCard(node, body, [
    { transform: 'translateY(3px) scale(.9)', opacity: 0, offset: 0, easing: 'cubic-bezier(.16,1,.3,1)' },
    { transform: 'translateY(0px) scale(1.06)', opacity: 1, offset: .05, easing: 'ease-out' },
    { transform: 'translateY(-2px) scale(1)', opacity: 1, offset: .13, easing: 'ease-out' },
    { transform: 'translateY(-5px) scale(1)', opacity: 1, offset: .21 },
    { transform: 'translateY(-13.44px) scale(1)', opacity: 1, offset: .38 },
    { transform: 'translateY(-30.24px) scale(1)', opacity: 1, offset: .72 },
    { transform: 'translateY(-42px) scale(.96)', opacity: 0, offset: 1 }
  ], 1350);
  return content;
}

export function showMovementLossPopup(host, amount) {
  if (!host || !(amount > 0)) return null;
  // Keep distinct losses visible in the existing VFX layer, with bounded overlap.
  const active = [...host.querySelectorAll(':scope > .movement-loss-vfx')];
  while (active.length >= POPUP_LIMITS.movementLoss) removeCard(active.shift());
  const lane = paths.find(path => !active.some(node => node.dataset.movementLossLane === path));
  const line = document.createElement('div'); line.className = 'movement-loss-line';
  const value = document.createElement('span'); value.textContent = `−${amount}`;
  const icon = document.createElement('span'); icon.className = 'picto-stat shift'; icon.setAttribute('aria-hidden', 'true');
  line.append(value, icon);
  const { node, body } = makeCard(line, 'effect-vfx movement-loss-vfx');
  node.setAttribute('aria-label', `${amount} déplacement${amount > 1 ? 's' : ''} perdu${amount > 1 ? 's' : ''}`);
  node.dataset.movementLossLane = lane;
  node.style.setProperty('--movement-loss-x', `${lane === 'left' ? -32 : lane === 'right' ? 32 : 0}px`);
  host.append(node);
  animateCard(node, body, [
    { transform: 'translateY(6px) scale(.8)', opacity: 0, offset: 0 },
    { transform: 'translateY(0) scale(1.15)', opacity: 1, offset: .1 },
    { transform: 'translateY(-4px) scale(1)', opacity: 1, offset: .25 },
    { transform: 'translateY(-18px) scale(1)', opacity: 1, offset: .7 },
    { transform: 'translateY(-30px) scale(.9)', opacity: 0, offset: 1 },
  ], 1100);
  return node;
}

export function formatEffectPopup(node, { effectKey, effectLabel, effectNature, durationSeconds, effectValue, effectUnit = '' }) {
  const visual = EFFECT_VISUALS[effectKey];
  if (!visual) return false;
  effectNature ||= visual.nature;
  if (effectNature) node.classList.add(effectNature);
  node.style.color = effectNature ? 'var(--stat-color)' : visual.color;
  node.dataset.effectKey = effectKey;
  const icon = document.createElement('img'); icon.className = 'combat-popup-status-icon'; icon.src = visual.src; icon.alt = '';
  if (visual.iconClass) icon.classList.add(visual.iconClass);
  const text = document.createElement('span');
  const seconds = Number.isFinite(durationSeconds) && durationSeconds >= 0 ? Math.round(durationSeconds * 10) / 10 : null;
  const value = seconds !== null ? ` ${String(seconds).replace('.', ',')} scd`
    : Number.isFinite(effectValue) ? ` ${effectValue}${effectUnit}` : '';
  text.textContent = `${effectLabel || visual.label}${value} !`; node.append(icon, text);
  return true;
}

export function clearCombatPopups() {
  document.querySelectorAll('.combat-popup-card').forEach(removeCard);
  damagePools = new WeakMap();
  document.querySelectorAll('.combat-popup-damages, .combat-popup-status').forEach(node => {
    delete node.dataset.flightCursor; delete node.dataset.laneCursor;
  });
}
for (const event of ['battleStopped', 'battleResolved', 'stageInterfaceClosing']) window.addEventListener(event, clearCombatPopups);
