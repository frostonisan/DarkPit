import { SPRITE_ATLASES } from '../data/spriteAtlasCatalog.js';
import { clockNow, isCombatPaused, waitForCombatResume } from '../combat/clock.js';

// Shared PNG pages, one renderer, no per-effect decoder or per-effect RAF.
const atlases = new Map(), states = new WeakMap(), active = new Map();
const BATTLE = '#game-windows, #game-screen-effects, body > .BattleFX, body > .projectile-parent, body > .magic-projectile-dispersion, body > .melee-clone-death-blood';
const UI = '.Game-UI, .Game-helper, .codex, .codex-entity-scan, #admin-entity-form, #admin-combat-simulation';
let frame = null, resumePending = false, sequence = 0, cacheSweep = null;
const counters = { draws: 0, ticks: 0, loads: 0 };
const resolvedSources = new Map();
let sourceBase = '', sourceOrigin = '';
export function spriteAtlasFor(source) {
  if (!source || !/\.gif(?:[?#]|$)/i.test(String(source))) return null;
  const base = document.baseURI;
  if (base !== sourceBase) { sourceBase = base; sourceOrigin = new URL(base).origin; resolvedSources.clear(); }
  const path = String(source).split(/[?#]/, 1)[0];
  if (resolvedSources.has(path)) return resolvedSources.get(path);
  const url = new URL(path, base);
  if (url.origin !== sourceOrigin || !/\/media\/assets\/effects\/[^/]+\.gif$/i.test(url.pathname)) return null;
  const key = decodeURIComponent(url.pathname.split('/').pop()).slice(0, -4).toLowerCase();
  const spec = SPRITE_ATLASES[key] ? { key, ...SPRITE_ATLASES[key] } : null;
  if (spec) resolvedSources.set(path, spec);
  return spec;
}
const readJSON = async (url, signal) => {
  const response = await fetch(url, { signal });
  if (!response.ok) throw Error(`HTTP ${response.status}: ${url}`);
  return response.json();
};
const readImage = async (url, signal) => {
  const image = new Image();
  let onAbort;
  const aborted = new Promise((_, reject) => { onAbort = () => { image.src = ''; reject(Error(`Image loading aborted: ${url}`)); }; });
  if (signal?.aborted) throw Error(`Image loading aborted: ${url}`);
  signal?.addEventListener('abort', onAbort, { once: true });
  try { image.src = url; await Promise.race([image.decode(), aborted]); return image; }
  finally { signal?.removeEventListener('abort', onAbort); }
};
function scheduleCacheSweep() {
  if (cacheSweep !== null) return;
  cacheSweep = globalThis.setTimeout(() => {
    cacheSweep = null; evictSpriteAtlases();
    if (atlases.size) scheduleCacheSweep();
  }, 60000);
}
export function evictSpriteAtlases(maxIdleMs = 5 * 60 * 1000) {
  const used = new Set([...active.values()].map(s => s.atlas.key));
  let removed = 0;
  for (const [key, entry] of atlases) if (!used.has(key) && Date.now() - entry.lastUsed >= maxIdleMs) { atlases.delete(key); removed++; }
  return removed;
}
export function loadSpriteAtlas(source, { timeout = 20000 } = {}) {
  const spec = spriteAtlasFor(source);
  if (!spec) return Promise.reject(Error(`No sprite atlas: ${source}`));
  let entry = atlases.get(spec.key);
  if (entry) { entry.lastUsed = Date.now(); return entry.promise; }
  entry = { lastUsed: Date.now() };
  const controller = new AbortController(), timer = globalThis.setTimeout(() => controller.abort(), timeout);
  entry.promise = (async () => {
    try {
      const root = new URL(spec.json, document.baseURI), data = await readJSON(root, controller.signal);
      const pages = data.pages
        ? await Promise.all(data.pages.map(page => readJSON(new URL(page.json, root), controller.signal))) : [data];
      // Exported JSON paths name a "spritesheet" folder; the repository stores pages in png/.
      const images = await Promise.all(pages.map(page => readImage(new URL('../png/' + page.meta.image.split('/').pop(), root).href, controller.signal)));
      const metadata = data.animation || data.meta.animation;
      const frames = data.pages
        ? data.frames.map(f => ({ ...pages[f.page].frames[f.frame], page: f.page, duration: f.duration }))
        : data.animations[metadata.name].map(id => ({ ...data.frames[id], page: 0 }));
      let duration = 0;
      for (const f of frames) {
        if (!Number.isFinite(f.duration) || f.duration < 0 || f.rotated) throw Error(`Unsupported frame in ${spec.key}`);
        // Match native Chrome/Firefox GIF timing, including GIFs with a zero delay.
        // chromium: third_party/blink/renderer/platform/graphics/deferred_image_decoder.cc
        f.end = duration += f.duration <= 10 ? 100 : f.duration;
      }
      counters.loads++;
      scheduleCacheSweep();
      return { key: spec.key, images, frames, duration, width: spec.width, height: spec.height,
        sourceLoops: metadata.sourceGifLoopValue === null ? 1 : metadata.sourceGifLoopValue === 0 ? Infinity : metadata.sourceGifLoopValue + 1 };
    } catch (error) { atlases.delete(spec.key); throw error; }
    finally { globalThis.clearTimeout(timer); }
  })();
  atlases.set(spec.key, entry);
  return entry.promise;
}
export function spriteFrameAt(atlas, elapsed, loops = Infinity) {
  const t = Math.max(0, elapsed);
  if (t >= atlas.duration * loops) return atlas.frames.length - 1;
  const time = t % atlas.duration;
  let low = 0, high = atlas.frames.length - 1;
  while (low < high) { const mid = (low + high) >> 1; if (time < atlas.frames[mid].end) high = mid; else low = mid + 1; }
  return low;
}
export function drawSpriteFrame(canvas, atlas, index) {
  const context = canvas.getContext('2d'), f = atlas.frames[index], r = f.frame, s = f.spriteSourceSize;
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (!f.empty) context.drawImage(atlas.images[f.page], r.x, r.y, r.w, r.h, s.x, s.y, s.w, s.h);
  counters.draws++;
}
const nowFor = state => state.battle ? clockNow() : performance.now();
function attach(node, state) {
  if (!node.isConnected || !state.atlas) return;
  if ((state.elapsed || 0) >= state.atlas.duration * state.loops) return;
  if (!active.has(node)) {
    state.battle = node.dataset.spriteClock === 'combat' || node.dataset.spriteClock !== 'ui' && !!node.closest(BATTLE) && !node.closest(UI);
    state.started = nowFor(state) - (state.elapsed || 0);
    active.set(node, state);
  }
  schedule();
}
function tick() {
  frame = null; counters.ticks++;
  for (const [node, state] of active) {
    if (!node.isConnected) { state.elapsed = nowFor(state) - state.started; active.delete(node); continue; }
    if (state.battle && isCombatPaused()) continue;
    const elapsed = nowFor(state) - state.started;
    const index = spriteFrameAt(state.atlas, elapsed, state.loops);
    if (index !== state.index) { drawSpriteFrame(node, state.atlas, index); state.index = index; }
    if (elapsed >= state.atlas.duration * state.loops) { state.elapsed = elapsed; active.delete(node); }
  }
  schedule();
}
function schedule() {
  // The isolated simulator retains geometry and load events, but has no visible frames.
  if (globalThis.__combatSimulation || frame !== null || !active.size || document.hidden) return;
  if (isCombatPaused() && [...active.values()].every(s => s.battle)) {
    if (!resumePending) { resumePending = true; void waitForCombatResume().then(() => { resumePending = false; schedule(); }); }
    return;
  }
  frame = globalThis.requestAnimationFrame(tick);
}
function setSource(node, source, { loop = node.dataset.spriteLoop || 'infinite', restore = false } = {}) {
  const token = {};
  const state = { token, complete: false, naturalWidth: 0, naturalHeight: 0, index: -1, elapsed: restore ? Number(node.dataset.spriteElapsed) || 0 : 0 };
  states.set(node, state); active.delete(node);
  node.dataset.spriteSource = new URL(source, document.baseURI).href;
  node.dataset.spriteLoop = loop;
  if (!restore) delete node.dataset.spriteElapsed;
  const spec = spriteAtlasFor(source);
  state.promise = (spec ? loadSpriteAtlas(source) : readImage(source)).then(value => {
    if (states.get(node)?.token !== token) return;
    const atlas = spec ? value : null, width = atlas?.width || value.naturalWidth, height = atlas?.height || value.naturalHeight;
    node.width = width; node.height = height;
    Object.assign(state, { atlas, complete: true, naturalWidth: width, naturalHeight: height, loops: loop === 'source' ? atlas?.sourceLoops : Infinity });
    if (atlas) {
      state.index = spriteFrameAt(atlas, state.elapsed, state.loops);
      drawSpriteFrame(node, atlas, state.index); attach(node, state);
    } else node.getContext('2d').drawImage(value, 0, 0);
    node.dispatchEvent(new Event('load'));
  }).catch(error => {
    if (states.get(node)?.token !== token) return;
    state.complete = true; state.error = error; node.dispatchEvent(new Event('error'));
    console.error('[SpriteAtlas]', error);
  });
  return state.promise;
}
function decorate(node) {
  if (Object.hasOwn(node, 'src')) return node;
  Object.defineProperties(node, {
    src: { configurable: true, get: () => node.dataset.spriteSource || '', set: value => { void setSource(node, value); } },
    currentSrc: { get: () => node.src }, complete: { get: () => states.get(node)?.complete || false },
    naturalWidth: { get: () => states.get(node)?.naturalWidth || 0 }, naturalHeight: { get: () => states.get(node)?.naturalHeight || 0 },
    alt: { get: () => node.getAttribute('aria-label') || '', set: value => { node.setAttribute('aria-label', value); } },
    decode: { value: () => (states.get(node)?.promise || Promise.resolve()).then(() => { const error = states.get(node)?.error; if (error) throw error; }) },
  });
  return node;
}
// These canvases retain the image-loading contract used by existing visual lifetimes.
// Classes, filters, geometry, click handlers and removal deadlines stay with their owner.
export function createSpriteImage(source, { loop = 'infinite', clock = 'auto' } = {}) {
  if (!spriteAtlasFor(source)) return new Image();
  const node = decorate(document.createElement('canvas')), spec = spriteAtlasFor(source);
  node.width = spec.width; node.height = spec.height; node.dataset.spriteClock = clock;
  void setSource(node, source, { loop });
  return node;
}
export function playSpriteImage(node, source, options = {}) {
  if (!(node instanceof HTMLCanvasElement) || !spriteAtlasFor(source)) return null;
  decorate(node);
  // Separate playheads, shared textures. The fragment is metadata, never fetched.
  return setSource(node, `${source.split('#')[0]}#sprite-${++sequence}`, { loop: 'infinite', ...options });
}
export function captureSpriteAnimations() {
  for (const node of document.querySelectorAll('canvas[data-sprite-source]')) {
    const state = states.get(node); if (!state?.atlas) continue;
    const elapsed = Math.max(0, active.has(node) ? nowFor(state) - state.started : state.elapsed || 0);
    // Flush to the frozen clock before recording both the playhead and pixels.
    const index = spriteFrameAt(state.atlas, elapsed, state.loops);
    if (index !== state.index) { drawSpriteFrame(node, state.atlas, index); state.index = index; }
    node.dataset.spriteElapsed = String(elapsed);
  }
}
export async function restoreSpriteAnimations(root = document) {
  await Promise.all([...root.querySelectorAll('canvas[data-sprite-source]')].map(node => {
    if (states.has(node)) { attach(node, states.get(node)); return states.get(node).promise; }
    decorate(node); return setSource(node, node.dataset.spriteSource, { restore: true });
  }));
}
export function spriteAtlasInUse(source) {
  const key = spriteAtlasFor(source)?.key;
  return [...active.values()].some(s => s.atlas.key === key);
}
export function releaseSpriteAtlas(source) {
  const key = spriteAtlasFor(source)?.key;
  if (!spriteAtlasInUse(source)) atlases.delete(key);
}
export function inspectSpriteAnimations() { return { active: active.size, cached: atlases.size, pending: frame !== null, ...counters }; }
function spriteBackgrounds(root) {
  const nodes = root.matches?.('.eternalFill') ? [root] : [];
  nodes.push(...root.querySelectorAll('.eternalFill'));
  for (const host of nodes) {
    if (host.querySelector(':scope > canvas[data-sprite-background]')) continue;
    const canvas = createSpriteImage('./media/assets/effects/lil-circle-soul.gif', { clock: 'ui' });
    canvas.dataset.spriteBackground = 'true'; canvas.setAttribute('aria-hidden', 'true');
    Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' });
    host.style.backgroundImage = 'none'; host.append(canvas);
  }
}
const observer = typeof MutationObserver === 'undefined' ? null : new MutationObserver(mutations => {
  for (const m of mutations) for (const node of m.addedNodes) if (node.nodeType === 1) {
    if (node.matches('.eternalFill') || node.firstElementChild) spriteBackgrounds(node);
    if (node.matches('canvas[data-sprite-source]')) {
      if (states.has(node)) attach(node, states.get(node));
      else { decorate(node); void setSource(node, node.dataset.spriteSource, { restore: true }); }
    }
    if (node.querySelector('canvas[data-sprite-source]')) void restoreSpriteAnimations(node);
  }
  for (const [node, state] of active) if (!node.isConnected) { state.elapsed = nowFor(state) - state.started; active.delete(node); }
  if (!active.size && frame !== null) { globalThis.cancelAnimationFrame(frame); frame = null; }
});
if (observer && globalThis.document?.documentElement) {
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('visibilitychange', schedule);
}
