import { ensureGameShell, layoutGameShell } from '../ui/viewport.js';
import { flushCombatDisplay } from "../rendering/displayBatch.js";
import { clockNow, combatClockSequence, isCombatPaused, freezeCombatClock, resumeCombatClock,
  restoreCombatClock, settleCombatOperations, captureCombatState, restoreCombatState,
  isCombatInteractionBlocked, setCombatInteractionBlocked, combatData, removeCombatVisualAfter } from "./clock.js";
import { combatNow, settleCombatTimeline } from "./timeline.js";
import { gameStarted, isBattleFinished, getOrderSide, restoreRunningBattle, manageBattleActions } from "../app/state.js";
import { entites, removedEntities } from "../entities/runtime.js";
import { captureAdminSession, restoreAdminSession } from "../storage/sessionStorage.js";

import { persistentMediaMarkup, loadResource } from "../data/loaderList.js";

// Combat visuals freeze and restore with the pause lifecycle.
const held = new Map(), audioHeld = new Set();
const nativeAnimate = Element.prototype.animate;
let visualId = 0, observing = false;
const ROOTS = '#game-windows, #game-screen-effects, body > .BattleFX, body > .projectile-parent, body > .magic-projectile-dispersion, body > .melee-clone-death-blood';
const UI = '.Game-UI, .Game-helper, .codex, .codex-entity-scan, #admin-entity-form, #admin-combat-simulation, #combat-pause-control, #combat-pause-fx';
const isBattleVisual = node => node instanceof Element && !!node.closest(ROOTS) && !node.closest(UI);
const keyFor = node => node.dataset.combatVisualKey ||= `combat-visual-${++visualId}`;
const byKey = key => document.querySelector(`[data-combat-visual-key="${CSS.escape(key)}"]`);

// Hex visibility and selection focus belong to tactical input, not to the combat timeline.
// Keep actual animations (including their pulses) frozen, and freeze everything
// again when the page is hidden and the absolute pause takes precedence.
const isHexInteractionTransition = animation => {
  if (isCombatInteractionBlocked()) return false;
  const node = animation.effect?.target;
  const property = animation.transitionProperty;
  return (['opacity', 'visibility', 'background-color'].includes(property)
      && node?.matches?.('.hex .socle, .hex .image-role-hex-info'))
    || (['filter', 'opacity'].includes(property)
      && node?.matches?.('.hex .hud-ingame, .hex .drag-box, .hex .socle'))
    || (property === 'filter' && node?.matches?.('.foreground, .ground, .background'));
};

function hold(animation) {
  if (!isCombatPaused() || held.has(animation) || !isBattleVisual(animation.effect?.target)) return;
  if (isHexInteractionTransition(animation)) return;
  if (animation.playState === 'finished' || animation.playState === 'idle') return;
  held.set(animation, animation.playState);
  const time = animation.currentTime;
  animation.pause();
  if (time !== null) animation.currentTime = time;
}
function freezeNewVisuals() {
  if (!isCombatPaused()) return;
  for (const [animation, previous] of held) {
    if (!isHexInteractionTransition(animation)) continue;
    held.delete(animation);
    if (previous === 'running' && animation.playState === 'paused') animation.play();
  }
  for (const animation of document.getAnimations()) hold(animation);
}
// WAAPI animations created by a late image decode obey the same pause as timers.
Element.prototype.animate = function (...args) {
  const animation = nativeAnimate.apply(this, args);
  hold(animation);
  return animation;
};
const observer = new MutationObserver(freezeNewVisuals);
document.addEventListener('play', event => {
  if (isCombatPaused() && event.target instanceof HTMLMediaElement) {
    audioHeld.add(event.target); event.target.pause();
  }
}, true);

function pauseCombatVisuals() {
  freezeNewVisuals();
  if (!observing) {
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style'] });
    observing = true;
  }
  for (const media of document.querySelectorAll('audio, video')) {
    if (!media.paused) { audioHeld.add(media); media.pause(); }
  }
}
function resumeCombatVisuals() {
  observer.disconnect(); observing = false;
  for (const [animation, previous] of held) if (previous === 'running' && animation.playState === 'paused') animation.play();
  held.clear();
  for (const media of audioHeld) if (media.isConnected) void media.play().catch(() => {});
  audioHeld.clear();
}


function captureCombatVisuals() {
  flushCombatDisplay();
  freezeNewVisuals();
  const animations = [];
  for (const [animation, previous] of held) {
    const node = animation.effect?.target;
    if (!node?.isConnected || animation.playState === 'idle') continue;
    const timing = animation.effect.getTiming();
    animations.push({ key: keyFor(node), name: animation.animationName || null,
      transition: animation.transitionProperty || null, frames: animation.effect.getKeyframes(),
      timing: { ...timing, iterations: timing.iterations === Infinity ? 'Infinity' : timing.iterations },
      time: animation.currentTime, rate: animation.playbackRate, previous });
  }
  const canvases = [];
  for (const canvas of document.querySelectorAll(`${ROOTS.replaceAll(', ', ' canvas, ')} canvas`)) {
    try { canvases.push({ key: keyFor(canvas), image: canvas.toDataURL() }); }
    catch { /* A cross-origin decoration cannot affect the combat snapshot. */ }
  }
  const roots = [...document.querySelectorAll(ROOTS)].filter(node => !node.parentElement?.closest(ROOTS));
  document.querySelectorAll('.sprite-container, .sprite-canvas, .sprite, .animation-sprite').forEach(keyFor);
  const styles = [...document.querySelectorAll('[data-combat-visual-key]')].map(node => ({ key: node.dataset.combatVisualKey, style: node.getAttribute('style') === null ? null : persistentMediaMarkup(node.getAttribute('style')) }));
  const media = [...document.querySelectorAll('audio, video')].map(node => ({ key: keyFor(node), html: persistentMediaMarkup(node.outerHTML),
    time: node.currentTime, volume: node.volume, muted: node.muted, rate: node.playbackRate, playing: audioHeld.has(node) }));
  return { animations, canvases, styles, media, sequence: visualId, html: roots.map(node => {
    const scene = node.cloneNode(true);
    scene.querySelector('#combat-pause-fx')?.remove();
    return persistentMediaMarkup(scene.outerHTML);
  }) };
}

async function restoreCombatVisuals(snapshot) {
  visualId = snapshot.sequence;
  for (const node of document.querySelectorAll(ROOTS)) node.remove();
  for (const html of snapshot.html) document.body.insertAdjacentHTML('beforeend', html);
  const gifJobs = [];
  for (const node of document.querySelectorAll(`${ROOTS.replaceAll(', ', ' img, ')} img`)) {
    if (/\.gif(?:[?#]|$)/i.test(node.src)) gifJobs.push(loadResource(node.src).then(resource => { node.src = resource.url; }));
  }
  for (const node of document.querySelectorAll('[style]')) {
    const original = node.style.backgroundImage;
    const source = original.match(/url\(["']?([^"')]+\.gif(?:[?#][^"')]*)?)["']?\)/i)?.[1];
    if (source && isBattleVisual(node)) gifJobs.push(loadResource(source).then(resource => { node.style.backgroundImage = `url("${resource.url}")`; }));
  }
  await Promise.all(gifJobs);
  await Promise.all(snapshot.canvases.map(async ({ key, image }) => {
    const canvas = byKey(key); if (!canvas) return;
    const source = new Image(); source.src = image; await source.decode();
    canvas.getContext('2d')?.drawImage(source, 0, 0);
  }));
  restoreCombatMedia(snapshot);
  restoreAnimationPositions(snapshot);
  for (const node of document.querySelectorAll('[data-combat-remove-at]')) {
    removeCombatVisualAfter(node, Math.max(0, Number(node.dataset.combatRemoveAt) - clockNow()));
  }
  pauseCombatVisuals();
}

function restoreCombatMedia(snapshot) {
  for (const data of snapshot.media || []) {
    let node = byKey(data.key);
    if (!node) { (document.querySelector('.sound-controls') || document.body).insertAdjacentHTML('beforeend', data.html); node = byKey(data.key); }
    node.autoplay = false; node.pause(); node.volume = data.volume; node.muted = data.muted; node.playbackRate = data.rate;
    node.currentTime = data.time;
    if (data.playing) audioHeld.add(node);
  }
}

function restoreAnimationPositions(snapshot) {
  for (const entry of snapshot.styles || []) {
    const node = byKey(entry.key); if (!node) continue;
    const background = node.style.backgroundImage;
    if (entry.style === null) node.removeAttribute('style'); else node.setAttribute('style', entry.style);
    if (background.includes('blob:') && /\.gif(?:[?#]|[\"')])/i.test(node.style.backgroundImage)) node.style.backgroundImage = background;
  }
  const claimed = new Set();
  for (const saved of snapshot.animations) {
    const node = byKey(saved.key); if (!node) continue;
    let animation = node.getAnimations().find(a => !claimed.has(a) && (saved.name ? a.animationName === saved.name
      : saved.transition ? a.transitionProperty === saved.transition : !a.animationName && !a.transitionProperty));
    if (!animation) animation = nativeAnimate.call(node, saved.frames,
      { ...saved.timing, iterations: saved.timing.iterations === 'Infinity' ? Infinity : saved.timing.iterations });
    claimed.add(animation);
    animation.effect.setKeyframes(saved.frames);
    animation.effect.updateTiming({ ...saved.timing, iterations: saved.timing.iterations === 'Infinity' ? Infinity : saved.timing.iterations });
    animation.pause(); animation.currentTime = saved.time; animation.playbackRate = saved.rate;
    held.set(animation, saved.previous);
  }
}

const KEY = 'DarkPitPausedCombat';
const AVAILABLE = KEY + ':available';
const snapshotEntity = entity => ({ ...entity, corpseConsumed: entity.corpseConsumed, runtimeProfanation: entity.runtimeProfanation });
let busy = false, restoring = null;
let reloadRequested = false;
let saveEpoch = 0, failure = null;
let tacticalPause = false, automaticPause = false;
let revision = 0, savedRevision = 0, checkpointPromise = null;
export const isCombatCheckpointBusy = () => busy || revision !== savedRevision;
export const getCombatPauseReasons = () => ({ tactical: tacticalPause, absolute: automaticPause });
// DevTools can take focus while the game remains visible. Only a hidden page
// triggers the absolute pause or prevents its explicit resumption.
const unavailable = () => document.hidden;
let visibilityEpoch = 0;
function clearAutomaticPause() {
  automaticPause = false; setCombatInteractionBlocked(false);
}
function handleCombatVisibility() {
  if (window.__combatSimulation) return;
  ++visibilityEpoch;
  if (!gameStarted || isBattleFinished()) return;
  if (unavailable()) {
    void pauseCombat({ automatic: true });
  }
  control();
}
const owner = () => {
  let id = sessionStorage.getItem(KEY);
  if (!id) { id = crypto.randomUUID(); sessionStorage.setItem(KEY, id); }
  return id;
};
function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(KEY, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('pause');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function stored(action, value) {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('pause', action === 'get' ? 'readonly' : 'readwrite');
      const store = tx.objectStore('pause');
      const request = action === 'put' ? store.put(value, owner()) : store[action](owner());
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = tx.onabort = () => reject(tx.error || request.error);
    });
  } finally { db.close(); }
}

// Pause decoration is UI, outside the combat scene and its saved/frozen animations.
// Keep its markup, styles and lifecycle here; the only asset is the existing cloud PNG.
const pauseCloudUrl = new URL("../../media/assets/misc/battle-pause-cloud.png", import.meta.url).href;
const pauseEffectCss = `
#combat-pause-fx {
  position: fixed; inset: 0; z-index: 5100; overflow: hidden; isolation: isolate;
  pointer-events: none; user-select: none; opacity: 0; visibility: hidden;
  transition: opacity .3s ease, visibility 0s linear .3s;
}
#combat-pause-fx.is-visible { opacity: 1; visibility: visible; transition-delay: 0s; }
#game-container > #combat-pause-fx, #game-windows > #combat-pause-fx { position: absolute; }
body.combat-paused:not(.combat-pause-absolute) .battle-actions > [data-order] { z-index: 5202; }
#combat-pause-fx, #combat-pause-fx * { box-sizing: border-box; pointer-events: none; }
#combat-pause-fx .pause-dim { position: absolute; inset: 0;
  background: radial-gradient(ellipse at center, #ffffff05 0%, #050a120d 44%, #03080e38 100%); }
#combat-pause-fx .pause-edge { position: absolute; inset: 0;
  background: linear-gradient(90deg, #02070fdb 0%, #0814228f 10%, #163a5438 22%, transparent 36%, transparent 64%, #163a5438 78%, #0814228f 90%, #02070fdb 100%); }
#combat-pause-fx .pause-breath { position: absolute; inset: 0;
  background: radial-gradient(ellipse 48% 36% at 50% 48%, #a0dcff0d, transparent 70%);
  animation: combat-pause-breath 6s ease-in-out infinite; }
#combat-pause-fx .pause-mist { position: absolute; top: 0; bottom: 0; width: 31%; overflow: hidden; filter: saturate(1.03); }
#combat-pause-fx .pause-left { left: 0; }
#combat-pause-fx .pause-right { right: 0; transform: scaleX(-1); }
#combat-pause-fx .pause-glow { position: absolute; inset: 0;
  background: radial-gradient(ellipse 72% 23% at 9% 19%, #a0d7f53d, transparent 76%), radial-gradient(ellipse 64% 19% at 11% 49%, #8ac6e82e, transparent 78%), radial-gradient(ellipse 66% 19% at 10% 79%, #b4e6ff24, transparent 80%);
  opacity: .7; animation: combat-pause-glow 9s ease-in-out infinite; }
#combat-pause-fx .pause-cloud { position: absolute; inset: -10% -6%;
  background-image: var(--pause-cloud); background-repeat: repeat;
  -webkit-mask-image: linear-gradient(90deg, #000 0%, #000000f2 18%, #0000008f 56%, transparent 100%);
  mask-image: linear-gradient(90deg, #000 0%, #000000f2 18%, #0000008f 56%, transparent 100%);
}
#combat-pause-fx .pause-cloud::before { content: ''; position: absolute; inset: 0;
  background-image: var(--pause-cloud); background-repeat: repeat; opacity: .46; mix-blend-mode: screen; }
#combat-pause-fx .pause-cloud-1 { background-size: 360px 360px; opacity: .44;
  animation: combat-pause-scroll-1 18s linear infinite, combat-pause-drift-1 12s ease-in-out infinite; }
#combat-pause-fx .pause-cloud-1::before { background-size: 439px 439px; transform: translate(-2%,1%) scale(1.08); }
#combat-pause-fx .pause-cloud-2 { background-size: 470px 470px; opacity: .30;
  animation: combat-pause-scroll-2 24s linear infinite, combat-pause-drift-2 15s ease-in-out infinite; }
#combat-pause-fx .pause-cloud-2::before { background-size: 404px 404px; transform: translate(3%,-2%) scale(1.05); }
#combat-pause-fx .pause-cloud-3 { background-size: 290px 290px; opacity: .20;
  animation: combat-pause-scroll-3 15s linear infinite, combat-pause-drift-3 10s ease-in-out infinite; }
#combat-pause-fx .pause-cloud-3::before { background-size: 333px 333px; transform: translate(-1%,0) scale(1.06); }
#combat-pause-fx .pause-glyph { position: absolute; top: 18%; width: 26%; aspect-ratio: 1; border-radius: 50%;
  border: 1px solid #addff538; box-shadow: 0 0 26px #74bfe714, inset 0 0 22px #addff50d;
  opacity: .35; animation: combat-pause-glyph 7s ease-in-out infinite; }
#combat-pause-fx .pause-glyph.pause-left { left: -7%; }
#combat-pause-fx .pause-glyph.pause-right { right: -7%; }
#combat-pause-fx .pause-glyph::before { content: ''; position: absolute; inset: 8%; border-radius: 50%; border: 1px dashed #addff52e; }
#combat-pause-fx .pause-glyph::after { content: ''; position: absolute; inset: 20%; border-radius: 50%; border: 1px solid #addff51f; }
#combat-pause-fx .pause-ticks { position: absolute; inset: 4%; border-radius: 50%;
  background: repeating-conic-gradient(from 0deg, #bfe8ff54 0deg .5deg, transparent .5deg 15deg);
  -webkit-mask: radial-gradient(circle, transparent 62%, #000 62.5% 66.5%, transparent 67%);
  mask: radial-gradient(circle, transparent 62%, #000 62.5% 66.5%, transparent 67%); }
#combat-pause-fx .pause-particles { position: absolute; inset: 0;
  background-image: radial-gradient(circle, #d7f3ffb8 0 1px, transparent 1.6px), radial-gradient(circle, #abe1ff6b 0 1px, transparent 1.6px);
  background-size: 220px 180px, 300px 240px; background-position: 0 0, 40px 30px; opacity: .15;
  animation: combat-pause-particles 18s linear infinite;
  -webkit-mask: linear-gradient(90deg, #000 0%, transparent 31%, transparent 69%, #000 100%);
  mask: linear-gradient(90deg, #000 0%, transparent 31%, transparent 69%, #000 100%); }
#combat-pause-fx .pause-banner { position: absolute; left: 50%; top: max(68px, 10.5%);
  transform: translateX(-50%); display: grid; justify-items: center; width: max-content; max-width: calc(100% - 32px);
  font-family: Georgia, serif; text-align: center; }
#combat-pause-fx .pause-orb { display: grid; place-items: center; width: 52px; height: 52px; border-radius: 50%;
  background: radial-gradient(circle at 50% 42%, #4da8d1, #0b1722 72%); border: 1px solid #dfc489e6;
  box-shadow: 0 0 18px #6fcaf7a6, inset 0 0 18px #a2e7ff2e; margin-bottom: -8px; }
#combat-pause-fx .pause-orb svg { width: 24px; height: 24px; stroke: #d6f7ff; fill: none; stroke-width: 1.7; filter: drop-shadow(0 0 4px #a7e9ffd9); }
#combat-pause-fx .pause-title { max-width: 100%; padding: 12px 28px; border-block: 1px solid #dfc489e0;
  background: linear-gradient(180deg, #102131f2, #071019f5); font-size: clamp(15px, 1.7vw, 34px); letter-spacing: .05em;
  color: #f6e9cf; text-shadow: 0 2px 5px #000000d9, 0 0 10px #ffe8a22e;
  box-shadow: 0 0 24px #5fc3f42e, inset 0 0 18px #87c8e11f; }
#combat-pause-fx .pause-line { width: 72%; height: 1px; background: linear-gradient(90deg, transparent, #84dbfff2, transparent);
  box-shadow: 0 0 12px #84dbffa6; margin-top: 6px; }
#combat-pause-fx.is-absolute {
  z-index: 2147483647; background: rgb(0 0 0 / 22%);
  -webkit-backdrop-filter: grayscale(1) blur(2px); backdrop-filter: grayscale(1) blur(2px);
}
#combat-pause-fx.is-absolute > :not(.pause-banner) { display: none; }
#combat-pause-fx.is-absolute .pause-banner { top: 50%; transform: translate(-50%, -50%); }
#combat-pause-fx.is-absolute .pause-title { letter-spacing: .12em; }
#combat-pause-fx.is-absolute .pause-title { color: #e5c776; }
#combat-pause-fx .pause-resume { display: none; margin-top: 24px; padding: 12px 24px;
  color: #e5c776; background: #111e; border: 1px solid #b99a52; border-radius: 4px;
  font: 18px/1.4 Georgia, serif; cursor: pointer; }
#combat-pause-fx.is-visible.is-absolute .pause-resume:not([hidden]) { display: block; pointer-events: auto; }
#combat-pause-fx .pause-resume:disabled { opacity: .5; cursor: wait; }
#combat-pause-fx .pause-resume:focus-visible { outline: 2px solid #e5c776; outline-offset: 4px; }
#combat-pause-fx:not(.is-visible) *, #combat-pause-fx.is-absolute * { animation-play-state: paused; }
/* Each scroll travels a whole tile so restarting a loop has no jump. */
@keyframes combat-pause-scroll-1 { from { background-position: 0 0; } to { background-position: -360px -360px; } }
@keyframes combat-pause-scroll-2 { from { background-position: 0 0; } to { background-position: 470px -470px; } }
@keyframes combat-pause-scroll-3 { from { background-position: 0 0; } to { background-position: -290px 290px; } }
@keyframes combat-pause-drift-1 { 0%,100% { transform: translate3d(-10px,-3px,0) scale(1.04); } 50% { transform: translate3d(14px,7px,0) scale(1.095); } }
@keyframes combat-pause-drift-2 { 0%,100% { transform: translate3d(6px,9px,0) scale(1.05); } 50% { transform: translate3d(-12px,-8px,0) scale(1.11); } }
@keyframes combat-pause-drift-3 { 0%,100% { transform: translate3d(-5px,0,0) scale(1.02); } 50% { transform: translate3d(9px,-7px,0) scale(1.085); } }
@keyframes combat-pause-glow { 0%,100% { transform: translateY(-4px); opacity: .58; } 50% { transform: translateY(4px); opacity: .76; } }
@keyframes combat-pause-glyph { 0%,100% { opacity: .22; transform: scale(.985); } 50% { opacity: .40; transform: scale(1.02); } }
@keyframes combat-pause-particles { from { background-position: 0 0, 40px 30px; } to { background-position: 0 -180px, 40px -210px; } }
@keyframes combat-pause-breath { 0%,100% { opacity: .42; } 50% { opacity: .8; } }
@media (prefers-reduced-motion: reduce) {
  #combat-pause-fx { transition: none; }
  #combat-pause-fx * { animation: none !important; }
}
`;
function updatePauseEffect() {
  let effect = document.getElementById('combat-pause-fx');
  if (window.__combatSimulation || (!gameStarted && !isCombatPaused())) { effect?.remove(); return; }
  if (!document.getElementById('combat-pause-style')) {
    const style = document.createElement('style'); style.id = 'combat-pause-style';
    style.textContent = pauseEffectCss; document.head.append(style);
  }
  if (!effect) {
    effect = document.createElement('div'); effect.id = 'combat-pause-fx';
    effect.setAttribute('aria-hidden', 'true');
    effect.style.setProperty('--pause-cloud', `url("${pauseCloudUrl}")`);
    const mist = side => `<div class="pause-mist pause-${side}"><div class="pause-glow"></div><div class="pause-cloud pause-cloud-1"></div><div class="pause-cloud pause-cloud-2"></div><div class="pause-cloud pause-cloud-3"></div></div>`;
    effect.innerHTML = `<div class="pause-dim"></div><div class="pause-edge"></div><div class="pause-breath"></div>
      <div class="pause-glyph pause-left"><div class="pause-ticks"></div></div><div class="pause-glyph pause-right"><div class="pause-ticks"></div></div>
      ${mist('left')}${mist('right')}<div class="pause-particles"></div>
      <div class="pause-banner"><div class="pause-orb"><svg viewBox="0 0 24 24"><path d="M5 3h14M5 21h14M7 4c0 5 5 5 5 8s-5 3-5 8m10-16c0 5-5 5-5 8s5 3 5 8"/><path d="M9 8h6m-6 9h6"/></svg></div>
      <div class="pause-title"></div><div class="pause-line"></div>
      <button type="button" id="combat-pause-resume" class="pause-resume" hidden>Reprendre la partie</button></div>`;
    effect.querySelector('.pause-resume').addEventListener('click', event => {
      event.stopImmediatePropagation();
      void resumeCombat({ automatic: true });
    });
  }
  // The stage animation leaves a transform on #game-container, which creates
  // its own stacking context. The tactical veil must share it with .Game-UI;
  // otherwise even the controls' higher z-indices remain behind the veil.
  const host = automaticPause ? ensureGameShell()
    : document.getElementById('game-container') || document.getElementById('game-windows') || document.body;
  if (effect.parentElement !== host) host.append(effect);
  effect.classList.toggle('is-visible', isCombatPaused());
  effect.classList.toggle('is-absolute', automaticPause);
  effect.querySelector('.pause-title').textContent = automaticPause ? 'JEU EN PAUSE' : 'PAUSE DE COMBAT ACTIVE';
  effect.setAttribute('aria-hidden', String(!isCombatPaused() || !automaticPause));
  const resume = effect.querySelector('.pause-resume');
  resume.hidden = !automaticPause;
  resume.disabled = busy || unavailable();
}

function control(message = null) {
  document.body.classList.toggle('combat-paused', isCombatPaused());
  document.body.classList.toggle('combat-pause-absolute', automaticPause);
  updatePauseEffect();
  let button = document.getElementById('combat-pause-control');
  if (!gameStarted && !isCombatPaused()) { button?.remove(); return; }
  if (!button) {
    button = document.createElement('button'); button.id = 'combat-pause-control'; button.type = 'button';
    button.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:100001;padding:8px 16px;background:#111e;color:#e5c776;border:1px solid #b99a52;border-radius:4px;cursor:pointer';
    button.addEventListener('click', () => void toggleCombatPause());
    ensureGameShell().append(button);
  }
  button.textContent = message || failure || (isCombatPaused()
    ? automaticPause
      ? 'Jeu en pause'
      : 'Pause tactique · Espace pour reprendre'
    : 'Pause · Espace');
  button.setAttribute('aria-pressed', String(isCombatPaused()));
  button.setAttribute('aria-keyshortcuts', 'Space');
  button.disabled = busy || automaticPause;
  button.hidden = automaticPause;
}

function saveCheckpoint() {
  if (busy) return checkpointPromise || Promise.resolve(false);
  if (!isCombatPaused() || !gameStarted || isBattleFinished()) return Promise.resolve(false);
  busy = true; failure = null;
  control('Combat en pause · Sauvegarde…');
  const epoch = saveEpoch;
  checkpointPromise = (async () => {
    try {
      do {
        // Settle the committed action and ground consequences, never advance time.
        await settleCombatTimeline();
        await settleCombatOperations();
        if (!gameStarted || isBattleFinished() || epoch !== saveEpoch) return false;
        const capturedRevision = revision;
        pauseCombatVisuals();
        const snapshot = {
          version: 1, now: clockNow(), sequence: combatClockSequence(), orderSide: getOrderSide(),
          pause: getCombatPauseReasons(),
          levelRunning: window.levelRunning, stageId: window.currentStageId,
          bodyClass: document.body.className, bodyStyle: document.body.style.cssText,
          admin: captureAdminSession(), entities: combatData(entites.map(snapshotEntity)), removed: combatData(removedEntities.map(snapshotEntity)),
          state: combatData(captureCombatState()), visuals: captureCombatVisuals(),
        };
        await stored('put', snapshot);
        if (epoch !== saveEpoch) { await stored('delete'); return false; }
        sessionStorage.setItem(AVAILABLE, '1');
        savedRevision = capturedRevision;
      } while (savedRevision !== revision);
      return true;
    } catch (error) {
      console.error('[CombatPause] Sauvegarde impossible', error);
      failure = 'Pause · Échec de sauvegarde : F5 ne restaurera pas ce combat';
      return false;
    } finally {
      busy = false; checkpointPromise = null; control();
    }
  })();
  return checkpointPromise;
}
function savePausedAction() {
  if (!isCombatPaused() || !gameStarted || isBattleFinished()) return;
  ++revision;
  void saveCheckpoint();
}
export async function pauseCombat({ automatic = false } = {}) {
  if (!gameStarted || isBattleFinished()) return false;
  const previous = getCombatPauseReasons();
  if (automatic) {
    automaticPause = true; setCombatInteractionBlocked(true);
  } else {
    if (automaticPause || busy) return false;
    tacticalPause = true;
  }
  if (isCombatPaused()) {
    if (previous.tactical !== tacticalPause || previous.absolute !== automaticPause) {
      ++revision;
      control();
      return saveCheckpoint();
    }
    control(); return true;
  }
  ++saveEpoch; ++revision;
  freezeCombatClock(combatNow()); flushCombatDisplay(); pauseCombatVisuals();
  const saved = await saveCheckpoint();
  window.dispatchEvent(new Event('combatPaused'));
  return saved;
}
export async function resumeCombat({ automatic = false } = {}) {
  if (busy || !isCombatPaused() || unavailable() || !gameStarted || isBattleFinished()
    || (automatic ? !automaticPause : automaticPause)) return false;
  // Confirming the return removes only the absolute pause.
  if (automatic && tacticalPause) {
    clearAutomaticPause(); ++revision; control();
    return saveCheckpoint();
  }
  const epoch = saveEpoch, visibility = visibilityEpoch, actionRevision = revision;
  const canResume = () => epoch === saveEpoch && visibility === visibilityEpoch
    && actionRevision === revision && !unavailable() && gameStarted && !isBattleFinished() && (!automatic || automaticPause);
  busy = true; control();
  try {
    // Delete the old checkpoint before gameplay advances.
    if (sessionStorage.getItem(AVAILABLE) === '1') {
      const checkpoint = await stored('get');
      if (!canResume()) return false;
      await stored('delete');
      if (!canResume()) {
        // Keep F5 usable if the tab was hidden again while deletion completed.
        if (checkpoint && epoch === saveEpoch && gameStarted && !isBattleFinished()) {
          await stored('put', checkpoint);
          if (epoch !== saveEpoch) await stored('delete');
        }
        return false;
      }
    }
    clearAutomaticPause(); tacticalPause = false;
    sessionStorage.removeItem(AVAILABLE); failure = null; ++saveEpoch;
    resumeCombatClock(); resumeCombatVisuals();
    window.dispatchEvent(new Event('combatResumed'));
    return true;
  } catch (error) {
    tacticalPause = true;
    console.error('[CombatPause] Reprise impossible', error); return false;
  } finally {
    busy = false; control();
    if (revision !== savedRevision && isCombatPaused()) void saveCheckpoint();
  }
}
export const toggleCombatPause = () => isCombatPaused() ? resumeCombat() : pauseCombat();

async function restore() {
  if (sessionStorage.getItem(AVAILABLE) !== '1') return false;
  const snapshot = await stored('get');
  if (!snapshot) { sessionStorage.removeItem(AVAILABLE); restoreAdminSession(null); return false; }
  if (snapshot.version !== 1 || !Array.isArray(snapshot.entities) || !Number.isFinite(snapshot.now)) throw new Error('Sauvegarde de pause invalide.');
  busy = true;
  tacticalPause = Boolean(snapshot.pause?.tactical);
  automaticPause = Boolean(snapshot.pause?.absolute);
  setCombatInteractionBlocked(true);
  restoreAdminSession(snapshot.admin);
  restoreCombatClock(snapshot.now, snapshot.sequence);
  window.levelRunning = snapshot.levelRunning; window.currentStageId = snapshot.stageId;
  document.body.className = snapshot.bodyClass; document.body.style.cssText = snapshot.bodyStyle;
  entites.splice(0, entites.length, ...snapshot.entities);
  removedEntities.splice(0, removedEntities.length, ...(snapshot.removed || []));
  restoreRunningBattle(snapshot.orderSide);
  await restoreCombatVisuals(snapshot.visuals);
  const shell = ensureGameShell();
  const gameWindow = document.getElementById('game-windows');
  if (gameWindow) shell.prepend(gameWindow);
  if (!shell.querySelector(':scope > .Game-helper')) {
    const helper = document.createElement('div'); helper.className = 'Game-helper'; shell.append(helper);
  }
  const effects = document.getElementById('game-screen-effects');
  if (effects) shell.append(effects);
  layoutGameShell();
  // Runtime handles from the old document must never cancel newly bound timers.
  for (const entity of entites) {
    entity.poisonIntervalId = null; entity.brulureIntervalId = null;
    entity.projectiles = [];
  }
  const [{ GameUi }, { PlayerArmyCodex }, { configureBattleSystemsOnce }, drag, ui] = await Promise.all([
    import("../ui/application.js"), import("../ui/codex/index.js"), import("../app/stages.js"), import("../board/interaction.js"), import("../ui/display.js"),
  ]);
  document.querySelectorAll('.Game-UI, #admin-entity-form, #admin-combat-simulation, #admin-open-btn').forEach(node => node.remove());
  GameUi(); PlayerArmyCodex(); configureBattleSystemsOnce();
  restoreCombatMedia(snapshot.visuals);
  drag.restoreEntityDragAndDrop(); ui.LevelUi(); ui.toggleScanEntityListener();
  const roles = await import("../board/deployment.js");
  roles.updateCombatantRoleIndex(); roles.updateCombatantTargetZones(); roles.observeRoleChanges();
  if (snapshot.levelRunning === 'admin') {
    const [{ initializeAdminLevel }, { entitesNestUp }] = await Promise.all([
      import("../debug/admin.js"), import("../entities/runtime.js"),
    ]);
    initializeAdminLevel(entitesNestUp, { restoringCombat: true });
  }
  await restoreCombatState(snapshot.state, { entities: entites, removed: removedEntities });
  manageBattleActions();
  restoreAnimationPositions(snapshot.visuals);
  pauseCombatVisuals();
  busy = false; setCombatInteractionBlocked(automaticPause); control(); handleCombatVisibility();
  if (revision !== savedRevision) void saveCheckpoint();
  window.dispatchEvent(new Event('combatPauseRestored'));
  return true;
}
export function restorePausedCombat() {
  return restoring ||= restore().catch(error => {
    busy = false; freezeCombatClock(); setCombatInteractionBlocked(true);
    console.error('[CombatPause] Restauration interrompue', error);
    control('Restauration impossible · Combat maintenu en pause');
    const button = document.getElementById('combat-pause-control'); if (button) button.disabled = true;
    return true;
  });
}

document.addEventListener('keydown', event => {
  if (event.key === 'F5' && gameStarted && !isBattleFinished() && !window.__combatSimulation) {
    // Freeze before unloading and wait for IndexedDB: a live order must resume
    // at its saved deadline, just like an order paused explicitly by the player.
    event.preventDefault(); event.stopImmediatePropagation();
    if (reloadRequested) return;
    reloadRequested = true;
    void (async () => {
      try {
        const saved = isCombatPaused() ? await saveCheckpoint() : await pauseCombat({ automatic: true });
        if (saved && gameStarted && !isBattleFinished() && isCombatPaused() && !isCombatCheckpointBusy()) window.location.reload();
      } finally { reloadRequested = false; }
    })();
    return;
  }
  if (event.code !== 'Space' || event.repeat || event.ctrlKey || event.altKey || event.metaKey
    || event.target?.closest?.('#combat-pause-resume, input, textarea, select, [contenteditable="true"], [role="textbox"]')) return;
  if (!gameStarted || isBattleFinished()) return;
  event.preventDefault(); event.stopImmediatePropagation();
  void toggleCombatPause();
}, true);
// UI inspection and tactical orders remain usable; an absolute pause blocks input.
// Ignore browser shortcuts, including F5, and focus changes between page controls.
for (const type of ['pointerdown', 'pointerover', 'pointermove', 'mouseover', 'mousemove', 'touchstart', 'wheel', 'mousedown', 'click', 'dblclick', 'contextmenu', 'dragstart', 'dragover', 'drop', 'keydown', 'input', 'change']) {
  window.addEventListener(type, event => {
    if (!gameStarted || !isCombatPaused() || !isCombatInteractionBlocked()) return;
    if (type === 'keydown' && (event.key === 'F5' || event.ctrlKey || event.metaKey || event.altKey)) return;
    if (automaticPause && !unavailable() && event.target?.closest?.('#combat-pause-resume')) return;
    if (type === 'keydown' && event.key === 'Tab' && automaticPause && !unavailable()) {
      event.preventDefault(); event.stopImmediatePropagation();
      document.getElementById('combat-pause-resume')?.focus();
      return;
    }
    event.preventDefault(); event.stopImmediatePropagation();
  }, true);
}
window.addEventListener('combatActionCommitted', savePausedAction);
window.addEventListener('inventoryItemsUpdated', savePausedAction);
document.addEventListener('visibilitychange', handleCombatVisibility);
window.addEventListener('battleStarted', () => {
  clearAutomaticPause(); tacticalPause = false; revision = savedRevision = 0;
  sessionStorage.removeItem(AVAILABLE);
  void stored('delete').catch(error => console.error('[CombatPause]', error));
  control(); handleCombatVisibility();
});
for (const type of ['battleStopped', 'battleResolved', 'stageInterfaceClosing']) window.addEventListener(type, () => {
  ++visibilityEpoch; clearAutomaticPause(); tacticalPause = false; revision = savedRevision = 0;
  ++saveEpoch; failure = null; sessionStorage.removeItem(AVAILABLE);
  void stored('delete').catch(error => console.error('[CombatPause]', error));
  resumeCombatClock(); resumeCombatVisuals(); control();
});

// The browser must not discard an IndexedDB transaction still being committed.
window.addEventListener('beforeunload', event => {
  if (isCombatCheckpointBusy() && isCombatPaused()) { event.preventDefault(); event.returnValue = ''; }
});
