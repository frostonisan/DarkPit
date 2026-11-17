import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/Utilisateur/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = resolve('outputs/index-15');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.VISUAL_LAB_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const errors = [], failedRequests = [], checks = [];
const page = await browser.newPage({ viewport: { width: 1536, height: 1100 } });
page.on('pageerror', error => errors.push(error.message));
page.on('requestfailed', request => failedRequests.push(request.url()));
await page.addInitScript(() => {
  const originalRect = Element.prototype.getBoundingClientRect;
  const originalStyle = window.getComputedStyle;
  window.__probe = { rect: 0, style: 0, raf: 0, observers: 0, observerStacks: [], storageWrites: 0,
    rectOf: element => originalRect.call(element), styleOf: element => originalStyle(element) };
  Element.prototype.getBoundingClientRect = function (...args) {
    window.__probe.rect++; return originalRect.apply(this, args);
  };
  window.getComputedStyle = function (...args) {
    window.__probe.style++; return originalStyle.apply(this, args);
  };
  const raf = window.requestAnimationFrame;
  window.requestAnimationFrame = function (...args) { window.__probe.raf++; return raf.apply(this, args); };
  for (const name of ['ResizeObserver', 'MutationObserver']) {
    const Native = window[name];
    window[name] = class extends Native { constructor(...args) { super(...args); window.__probe.observers++; window.__probe.observerStacks.push(new Error().stack); } };
  }
  const set = Storage.prototype.setItem;
  Storage.prototype.setItem = function (...args) { window.__probe.storageWrites++; return set.apply(this, args); };
});
const check = (ok, label) => { assert.ok(ok, label); checks.push(label); };
const ready = async () => {
  await page.evaluate(() => window.visualLab.ready);
  await page.waitForFunction(() => [...document.images].every(image => image.complete));
  check(await page.locator('#error').isHidden(), 'No visible startup/calibration error');
};
// Browser automation itself reads layout. Only compare instrumented counters inside
// page.evaluate, where controls are dispatched without Playwright actionability reads.
const exerciseWithoutReads = async () => page.evaluate(async () => {
  const before = { rect: __probe.rect, style: __probe.style, raf: __probe.raf, observers: __probe.observers };
  const scale = document.getElementById('scale');
  for (const value of ['.5', '1.5', '1', '1.25', '1.5']) {
    scale.value = value; scale.dispatchEvent(new Event('input', { bubbles: true }));
  }
  for (const input of document.querySelectorAll('[data-toggle]')) {
    if (input.dataset.toggle === 'motion') continue;
    input.checked = !input.checked; input.dispatchEvent(new Event('change', { bubbles: true }));
    input.checked = !input.checked; input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  await new Promise(resolve => setTimeout(resolve, 350));
  return { before, after: { rect: __probe.rect, style: __probe.style, raf: __probe.raf, observers: __probe.observers } };
});
const geometry = async () => page.evaluate(() => [...document.querySelectorAll('#new-world .lab-slot')].map(slot => {
  const root = slot.querySelector('.lab-unified');
  const rect = node => {
    const r = __probe.rectOf(node); return { x: r.x, y: r.y, width: r.width, height: r.height, top: r.top, bottom: r.bottom };
  };
  return { model: root.dataset.model, frame: rect(root.querySelector('.lab-frame')), canvas: rect(root.querySelector('canvas')),
    aura: rect(root.querySelector('.aura-container')), effects: rect(root.querySelector('.effects-container')),
    halo: rect(root.querySelector('.life-aura-wrap')), messages: rect(root.querySelector('.pop-down-txt')),
    damage: rect(root.querySelector('.damage-popup')), messageText: rect(root.querySelector('.BattleText')),
    bodyEffects: [...root.querySelectorAll('[data-family=body]')].map(node => ({ type: [...node.classList].find(name => ['mysticism', 'heal', 'burn'].includes(name)), ...rect(node) })),
    world: rect(slot.parentElement), base: { w: parseFloat(root.style.getPropertyValue('--sprite-w')), h: parseFloat(root.style.getPropertyValue('--sprite-h')) } };
}));
function verifyGeometry(items, scale) {
  for (const item of items) {
    check(Math.abs(item.canvas.width - item.base.w * .85 * scale) < .15, `${item.model}: CSS width follows parent scale ${scale}`);
    check(Math.abs(item.canvas.height - item.base.h * .85 * scale) < .15, `${item.model}: CSS height follows parent scale ${scale}`);
    for (const layer of ['frame', 'aura', 'effects']) {
      check(['x', 'y', 'width', 'height'].every(key => Math.abs(item[layer][key] - item.canvas[key]) < .15), `${item.model}: ${layer} aligned with canvas`);
    }
    check(item.halo.bottom <= item.canvas.top + .1, `${item.model}: halo above sprite`);
    check(item.halo.width <= 64 * .85 * scale + .15, `${item.model}: halo respects the shared local cap`);
    check(item.canvas.top - item.halo.bottom <= 5 * .85 * scale + .15, `${item.model}: halo stays close above sprite`);
    check(Math.abs(item.halo.x + item.halo.width / 2 - item.canvas.x - item.canvas.width / 2) < .15, `${item.model}: halo horizontally centered`);
    check(item.messages.bottom < item.halo.top, `${item.model}: messages above halo`);
    check(item.damage.bottom <= item.messageText.top - 4, `${item.model}: damage and message do not overlap`);
    check(item.messages.top > item.world.top, `${item.model}: visible headroom at scale ${scale}`);
    const caps = { mysticism: [140, 200], heal: [110, 160], burn: [110, 140] };
    for (const effect of item.bodyEffects) {
      const [w, h] = caps[effect.type];
      check(effect.width <= w * .85 * scale + .15 && effect.height <= h * .85 * scale + .15, `${item.model}: ${effect.type} respects shared width and height caps`);
    }
  }
}

async function verifyIndependentIdle() {
  const result = await page.evaluate(() => {
    const root = document.querySelector('#new-world [data-model=mouche-asticoteuse]');
    const sprite = root.querySelector('[data-role=sprite]');
    const animations = root.getAnimations({ subtree: true });
    const idle = sprite.getAnimations().find(animation => animation.animationName === 'bougeote');
    if (!idle) return { missingIdle: true };
    animations.forEach(animation => animation.pause());
    const before = { rect: __probe.rect, style: __probe.style };
    const rect = node => { const r = __probe.rectOf(node); return [r.x, r.y, r.width, r.height]; };
    const sample = time => {
      idle.currentTime = time;
      return { canvas: rect(root.querySelector('canvas')), anchors: [root.querySelector('.lab-frame'),
        root.querySelector('.aura-container'), root.querySelector('.life-aura-wrap'), root.querySelector('.effects-container'),
        root.querySelector('.cast-animation-container'), root.querySelector('.pop-down-txt')].map(rect) };
    };
    const normal = [0, 120, 240].map(sample);
    document.getElementById('lab').dataset.mirror = 'true';
    const mirrored = [0, 120, 240].map(sample);
    const facing = __probe.styleOf(root.querySelector('.lab-sprite-facing')).transform;
    document.getElementById('lab').dataset.mirror = 'false';
    const ownAuraAnimation = root.querySelector('.life-aura-anim').getAnimations().length > 0;
    const after = { rect: __probe.rect, style: __probe.style };
    animations.forEach(animation => animation.play());
    return { normal, mirrored, facing, ownAuraAnimation, before, after };
  });
  check(!result.missingIdle, 'Native entity idle animation stays on the sprite');
  for (const mode of ['normal', 'mirrored']) {
    const samples = result[mode];
    check(samples.some(sample => Math.abs(sample.canvas[0] - samples[0].canvas[0]) > 1), `${mode}: sprite visibly trembles`);
    check(samples.every(sample => sample.anchors.every((anchor, i) => anchor.every((value, j) => Math.abs(value - samples[0].anchors[i][j]) < .05))), `${mode}: aura, FX, ground and message anchors do not inherit sprite idle`);
  }
  check(result.facing.startsWith('matrix(-1'), 'Mirror remains active while sprite idle animates');
  check(result.ownAuraAnimation, 'Aura keeps its own independent animation');
  assert.deepEqual(result.after, result.before, 'Sprite idle needs no page geometry polling');
  checks.push('Sprite idle needs no page geometry polling');
}

try {
  // file:// is intentional: the user can open the HTML directly without a server.
  await page.goto(pathToFileURL(resolve('docs/index-15.html')).href);
  await ready();
  check(await page.locator('#new-world canvas').count() === 6 && await page.locator('#old-world canvas').count() === 6, 'Six matching entities per scene');
  const initial = await page.evaluate(() => ({ ...visualLab.metrics, writes: __probe.storageWrites }));
  check(initial.unifiedCalibrations === 6 && initial.unifiedStyleReads === 6, 'One local CSS read per new entity at creation');
  check(initial.writes === 0, 'No game storage writes');
  check(await page.evaluate(() => [...document.images].every(image => image.naturalWidth > 0)), 'All displayed sprite/effect images loaded');
  await verifyIndependentIdle();
  await page.locator('[data-toggle=motion]').uncheck();
  const base = await geometry();
  verifyGeometry(base, 1);
  check(base.find(item => item.model === 'mouche-asticoteuse').base.h === 120, 'Mouche uses the current 120 px CSS height');
  check(base.find(item => item.model === 'escargot-coulissant').base.w === 220 && base.find(item => item.model === 'escargot-coulissant').base.h === 140, 'Escargot preserves independent width and height');
  await page.screenshot({ path: resolve(output, 'comparison-desktop.png'), fullPage: true });
  const noReads = await exerciseWithoutReads();
  assert.deepEqual(noReads.after, noReads.before, 'Scale and layers add no geometry read, RAF or observer');
  checks.push('Scale and layer toggles add no geometry read, RAF or observer');
  verifyGeometry(await geometry(), 1.5);
  await page.locator('button[data-view=new]').click();
  await page.locator('[data-toggle=guides]').check();
  await page.locator('[data-toggle=mirror]').check();
  verifyGeometry(await geometry(), 1.5);
  await page.screenshot({ path: resolve(output, 'new-scale-150.png'), fullPage: true });
  await page.selectOption('#preset', 'extreme'); await ready();
  verifyGeometry(await geometry(), 1.5);
  await page.locator('#new-world .lab-slot[data-index="3"]').screenshot({ path: resolve(output, 'foudre-capped-effects.png') });
  check((await geometry()).find(item => item.model === 'cockroach-king').base.w === 540, 'Wide boss uses current 540 px CSS width');
  await page.locator('button[data-view=old]').click();
  await page.selectOption('#old-world .lab-slot[data-index="0"] select', 'mouche-asticoteuse'); await ready();
  check(await page.locator('#new-world [data-model=mouche-asticoteuse]').count() === 2, 'Replacing from current-only view also calibrates hidden new view');
  await page.locator('button[data-view=new]').click();
  verifyGeometry(await geometry(), 1.5);
  await page.locator('#reset').click(); await ready();
  check(await page.locator('#scale').inputValue() === '1', 'Reset restores parent scale');
  await page.locator('button[data-view=new]').click();
  await page.locator('[data-toggle=motion]').uncheck();
  for (const family of ['auras', 'status', 'body', 'messages']) await page.locator(`[data-toggle=${family}]`).uncheck();
  const ground = await page.evaluate(() => [...document.querySelectorAll('#new-world .cast-animation-container:not([hidden])')].map(layer => {
    const fx = __probe.rectOf(layer.querySelector('img')), sprite = __probe.rectOf(layer.parentElement.querySelector('canvas'));
    return { centered: Math.abs(fx.x + fx.width / 2 - sprite.x - sprite.width / 2) < .2,
      grounded: Math.abs(fx.y + fx.height / 2 - sprite.bottom) < .2,
      visible: __probe.styleOf(layer).display !== 'none' && fx.width > 0 && fx.height > 0 };
  }));
  check(ground.length === 3 && ground.every(item => item.centered && item.grounded && item.visible), 'Ground effects use bottom-center and sprite width');
  await page.screenshot({ path: resolve(output, 'ground-only.png'), fullPage: true });
  await page.locator('#reset').click(); await ready();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-toggle=motion]').uncheck();
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Mobile viewport has no page overflow');
  check(await page.evaluate(() => document.querySelector('.lab-scroll').scrollWidth > document.querySelector('.lab-scroll').clientWidth), 'Battle scenes remain horizontally scrollable on mobile');
  await page.screenshot({ path: resolve(output, 'comparison-mobile.png'), fullPage: true });
  check(await page.evaluate(() => __probe.observerStacks.every(stack => !/(?:file|http).*index-15\.html:\d/.test(stack)) && __probe.storageWrites === 0), 'Page adds no observers or storage writes after replacements and reset');
  assert.deepEqual(errors, [], 'No browser runtime errors');
  assert.deepEqual(failedRequests, [], 'No failed resource requests');
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ checks, noReads, initial, errors, failedRequests }, null, 2));
  console.log(`PASS index-15: ${checks.length} checks; file://, CSS dimensions, scale, replacement, mobile, zero geometry polling.`);
} catch (error) {
  await page.screenshot({ path: resolve(output, 'failure.png'), fullPage: true }).catch(() => {});
  await writeFile(resolve(output, 'failure.json'), JSON.stringify({ message: error.message, checks, errors, failedRequests, geometry: await geometry().catch(() => []) }, null, 2));
  throw error;
} finally {
  await browser.close();
}
