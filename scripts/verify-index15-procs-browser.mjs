import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/Utilisateur/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = resolve('outputs/index-15-procs');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.VISUAL_LAB_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1536, height: 1000 } });
const checks = [], errors = [], failedRequests = [];
const check = (ok, label) => { assert.ok(ok, label); checks.push(label); };
page.on('pageerror', error => errors.push(error.message));
page.on('requestfailed', request => failedRequests.push(request.url()));
await page.addInitScript(() => {
  const rect = Element.prototype.getBoundingClientRect, style = window.getComputedStyle, raf = window.requestAnimationFrame;
  window.__procProbe = { rect: 0, style: 0, raf: 0, rectOf: node => rect.call(node), styleOf: node => style(node) };
  Element.prototype.getBoundingClientRect = function (...args) { __procProbe.rect++; return rect.apply(this, args); };
  window.getComputedStyle = function (...args) { __procProbe.style++; return style.apply(this, args); };
  window.requestAnimationFrame = function (...args) { __procProbe.raf++; return raf.apply(this, args); };
});
const click = id => page.evaluate(id => document.getElementById(id).click(), id);
const input = (id, value) => page.evaluate(({ id, value }) => { const node = document.getElementById(id); node.value = value; node.dispatchEvent(new Event('input')); }, { id, value });
const ready = () => page.evaluate(() => visualLab.ready);
const inspect = () => page.evaluate(() => visualLab.procs.inspect());
const slot = '#new-world .lab-slot[data-index="1"]';
// Current spell.css placements, including the game's AmbidextryVFX override.
const placements = {
  indestructibility: { top: -30 }, astrality: { middle: true }, resilience: { top: 5 },
  ambidextry: { middle: true, centered: true }, esoterism: { middle: true },
  transcendence: { top: -20 }, execution: { top: -100 }, recovery: { top: 43, left: .69, centered: true }
};
const positions = [];
const verifyPosition = async key => {
  const measured = await page.evaluate(({ key, expected }) => {
    const root = document.querySelector('#new-world .lab-slot[data-index="1"]');
    const frame = root.querySelector('.lab-frame'), image = root.querySelector('[data-proc="' + key + '"] img');
    const f = __procProbe.rectOf(frame), r = __procProbe.rectOf(image), style = __procProbe.styleOf(frame);
    const width = parseFloat(style.width), height = parseFloat(style.height), scale = f.width / width;
    const cap = Math.max(32, Math.min(width * .9, height * .75, 110)) * scale;
    return { key, centerX: r.x + r.width / 2, centerY: r.y + r.height / 2,
      expectedX: f.x + f.width * (expected.left || .5),
      expectedY: f.y + (expected.middle ? f.height / 2 : expected.top * scale) + (expected.centered ? 0 : r.height),
      width: r.width, height: r.height, cap, className: image.className };
  }, { key, expected: placements[key] });
  check(Math.abs(measured.centerX - measured.expectedX) < .3 && Math.abs(measured.centerY - measured.expectedY) < .3,
    key + ': respects its own current game placement');
  check(measured.width <= measured.cap + .2 && measured.height <= measured.cap + .2, key + ': native image size stays within sprite-based caps');
  positions.push(measured);
};
try {
  await page.goto(pathToFileURL(resolve('docs/index-15.html')).href); await ready();
  await page.evaluate(() => document.querySelector('[data-mode=messages]').click());
  check(await page.locator('#proc-rate').isVisible(), 'Independent VFX quantity gauge is visible');
  const layout = await page.evaluate(() => {
    const rect = __procProbe.rectOf;
    return { sidebarRight: rect(document.querySelector('.lab-settings')).right, stageLeft: rect(document.querySelector('.lab-stage')).left,
      messages: rect(document.getElementById('message-rate')).bottom, procs: rect(document.getElementById('proc-rate')).top,
      sticky: __procProbe.styleOf(document.querySelector('.lab-settings')).position };
  });
  check(layout.sidebarRight < layout.stageLeft && layout.sticky === 'sticky', 'Settings occupy a sticky side panel beside the scene');
  check(layout.procs > layout.messages, 'The VFX gauge appears underneath the message gauge');
  const assets = await page.evaluate(() => visualLab.procs.assets);
  check(['indestructibility', 'astrality', 'resilience', 'ambidextry'].every(key => assets[key]), 'Requested proc types are selectable');
  await click('feed-freeze');
  const before = await page.evaluate(() => ({ rect: __procProbe.rect, style: __procProbe.style, raf: __procProbe.raf }));
  for (const key of Object.keys(assets)) {
    await page.evaluate(key => visualLab.procs.emit(1, key), key);
    await page.waitForFunction(key => {
      const image = document.querySelector('#new-world .lab-slot[data-index="1"] [data-proc="' + key + '"] img');
      return image?.complete && image.naturalWidth > 0;
    }, key, { polling: 50 });
    check(true, 'Existing game asset loads: ' + assets[key].file);
    await verifyPosition(key);
  }
  const field = await page.evaluate(() => {
    const root = document.querySelector('#new-world .lab-slot[data-index="1"]');
    const frame = __procProbe.rectOf(root.querySelector('.lab-frame'));
    const anchor = __procProbe.rectOf(root.querySelector('.lab-proc-field'));
    return ['x', 'y', 'width', 'height'].every(key => Math.abs(anchor[key] - frame[key]) < .2);
  });
  check(field, 'Proc positioning uses the full calibrated sprite frame');
  check((await inspect()).states[1].length === 3, 'Proc overlay retains at most three active effects');
  await page.evaluate(() => { for (let i = 0; i < 100; i++) visualLab.procs.emit(1, 'indestructibility'); });
  check((await inspect()).states[1].filter(proc => proc.key === 'indestructibility').length === 1, 'Repeated ability procs retrigger without accumulating duplicate nodes');
  await input('scale', '1.5');
  const scaled = await page.evaluate(() => [...document.querySelectorAll('#new-world .lab-slot[data-index="1"] .lab-proc-burst img')].map(node => __procProbe.rectOf(node).width));
  check(scaled.every(width => width <= 110 * .85 * 1.5 + .2), 'Proc sizes stay capped under shared parent scaling');
  await verifyPosition('indestructibility'); await verifyPosition('recovery');
  await input('scale', '1');
  const independent = await page.evaluate(() => {
    const root = document.querySelector('#new-world .lab-slot[data-index="1"]');
    const idle = root.querySelector('[data-role=sprite]').getAnimations().find(animation => animation.animationName === 'bougeote');
    if (!idle) return false;
    idle.pause();
    const sample = time => { idle.currentTime = time; return [...root.querySelectorAll('.lab-proc-burst img')].map(image => {
      const rect = __procProbe.rectOf(image); return [rect.x, rect.y, rect.width, rect.height];
    }); };
    const unchanged = JSON.stringify(sample(0)) === JSON.stringify(sample(240)); idle.play(); return unchanged;
  });
  check(independent, 'Sprite tremble does not move the independently placed VFX');
  const after = await page.evaluate(() => ({ rect: __procProbe.rect, style: __procProbe.style, raf: __procProbe.raf }));
  assert.deepEqual(before, after); checks.push('Proc emission, retrigger and scaling add no geometry reads or JS animation frames');
  await page.screenshot({ path: resolve(output, 'sidebar-desktop.png'), fullPage: false });
  await page.locator(slot).screenshot({ path: resolve(output, 'centered-procs.png') });

  await click('feed-clear');
  await input('message-target', '1');
  await page.evaluate(() => {
    for (const node of document.querySelectorAll('[data-body-proc]')) { node.checked = node.dataset.bodyProc === 'resilience'; node.dispatchEvent(new Event('change')); }
  });
  await click('proc-one');
  let state = await inspect();
  check(state.states[1][0]?.key === 'resilience' && state.states.every((procs, i) => i === 1 || procs.length === 0), 'Random procs respect the selected ability pool and target');
  await click('feed-clear'); await input('message-target', 'all');
  await input('proc-rate', '0'); await click('proc-run'); await click('feed-run');
  await page.waitForTimeout(350);
  state = await inspect();
  check(state.running && !state.timer && state.generated === 0 && await page.evaluate(() => visualLab.popups.inspect().generated > 0), 'Zero VFX rate has no timer while messages run independently');
  await input('proc-rate', '20'); await page.waitForTimeout(700); await click('feed-freeze');
  state = await inspect();
  check(state.generated >= 60 && !state.timer && state.states.every(procs => procs.length <= 3), 'Twenty VFX per second on six entities stays bounded');
  const frozen = state;
  await page.waitForTimeout(160); state = await inspect();
  check(state.generated === frozen.generated && state.states.every((procs, i) => procs.every((proc, j) => Math.abs(proc.time - frozen.states[i][j].time) < 30)), 'Freeze pauses both VFX generation and overlay animation');
  await click('feed-freeze'); await page.waitForTimeout(100);
  check((await inspect()).generated > frozen.generated, 'Resume restarts the independent VFX stream');
  await page.evaluate(() => { const node = document.querySelector('[data-body-proc=resilience]'); node.checked = false; node.dispatchEvent(new Event('change')); });
  check(!(await inspect()).timer && await page.locator('#proc-one').isDisabled(), 'Empty VFX selection stops the scheduler and disables random emission');

  await click('feed-clear'); await click('feed-freeze');
  await page.evaluate(() => visualLab.procs.emit(1, 'astrality'));
  await page.selectOption(slot + ' select', 'foudre-fange'); await ready();
  check((await inspect()).states[1].length === 0, 'Replacing an entity clears its body procs');
  await page.evaluate(() => visualLab.procs.emit(1, 'astrality'));
  await page.waitForFunction(() => document.querySelector('#new-world .lab-slot[data-index="1"] [data-proc=astrality] img')?.complete);
  await verifyPosition('astrality');
  await page.locator(slot).screenshot({ path: resolve(output, 'tall-entity-proc.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Sidebar adapts to mobile without horizontal page overflow');
  await page.screenshot({ path: resolve(output, 'sidebar-mobile.png'), fullPage: false });
  await page.evaluate(() => document.querySelector('[data-mode=auras]').click());
  check(!(await inspect()).timer && !(await inspect()).running && await page.locator('.lab-proc-burst').count() === 0, 'Leaving message mode stops and removes all body VFX');
  await click('reset'); await ready();
  check((await inspect()).rate === 2 && (await inspect()).selected.length === Object.keys(assets).length, 'Reset restores the VFX gauge and full random pool');
  assert.deepEqual(errors, []); assert.deepEqual(failedRequests, []);
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ checks, layout, positions, errors, failedRequests }, null, 2));
  console.log('PASS index-15 procs: ' + checks.length + ' checks; sidebar, native effect placements, sprite-based caps, independent rates, bounded cleanup, zero geometry polling.');
} catch (error) {
  await page.screenshot({ path: resolve(output, 'failure.png'), fullPage: true }).catch(() => {});
  await writeFile(resolve(output, 'failure.json'), JSON.stringify({ message: error.message, checks, errors, failedRequests }, null, 2));
  throw error;
} finally { await browser.close(); }
