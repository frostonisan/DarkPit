import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/Utilisateur/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = resolve('outputs/index-15-messages');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.VISUAL_LAB_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1536, height: 1100 } });
const checks = [], errors = [], failedRequests = [];
const check = (ok, label) => { assert.ok(ok, label); checks.push(label); };
page.on('pageerror', error => errors.push(error.message));
page.on('requestfailed', request => failedRequests.push(request.url()));
await page.addInitScript(() => {
  const rect = Element.prototype.getBoundingClientRect, style = window.getComputedStyle, raf = window.requestAnimationFrame;
  window.__probe = { rect: 0, style: 0, raf: 0, rectOf: node => rect.call(node), styleOf: node => style(node) };
  Element.prototype.getBoundingClientRect = function (...args) { __probe.rect++; return rect.apply(this, args); };
  window.getComputedStyle = function (...args) { __probe.style++; return style.apply(this, args); };
  window.requestAnimationFrame = function (...args) { __probe.raf++; return raf.apply(this, args); };
});
const ready = () => page.evaluate(() => visualLab.ready);
const inspect = () => page.evaluate(() => visualLab.popups.inspect());
const clear = () => page.evaluate(() => document.getElementById('feed-clear').click());
const emit = (kind, count = 1, value) => page.evaluate(({ kind, count, value }) => { for (let i = 0; i < count; i++) visualLab.popups.emit(1, kind, value); }, { kind, count, value });
const click = selector => page.evaluate(selector => document.querySelector(selector).click(), selector);
const input = (selector, value) => page.evaluate(({ selector, value }) => { const node = document.querySelector(selector); node.value = value; node.dispatchEvent(new Event('input', { bubbles: true })); }, { selector, value });
try {
  await page.goto(pathToFileURL(resolve('docs/index-15.html')).href);
  await ready();
  check(await page.locator('#error').isHidden(), 'Startup succeeds from file://');
  const auraCheck = await page.evaluate(() => {
    const before = { rect: __probe.rect, style: __probe.style, raf: __probe.raf, calibrations: visualLab.metrics.unifiedCalibrations };
    document.querySelector('button[data-mode=auras]').click();
    const initial = document.querySelectorAll('#new-world [data-aura]').length;
    for (const input of document.querySelectorAll('input[data-aura]')) { input.checked = true; input.dispatchEvent(new Event('change')); }
    const all = ['new', 'old'].map(id => document.querySelectorAll('#' + id + '-world [data-aura]').length);
    for (const input of document.querySelectorAll('input[data-aura]')) { input.checked = false; input.dispatchEvent(new Event('change')); }
    const none = document.querySelectorAll('#new-world [data-aura]').length;
    document.getElementById('aura-profiles').click();
    return { initial, all, none, before, after: { rect: __probe.rect, style: __probe.style, raf: __probe.raf, calibrations: visualLab.metrics.unifiedCalibrations } };
  });
  check(auraCheck.initial === 6 && auraCheck.all.every(count => count === 18) && auraCheck.none === 0, 'Aura selections still work identically in both scenes');
  assert.deepEqual(auraCheck.before, auraCheck.after); checks.push('Aura selections do not measure geometry');
  await click('button[data-mode=messages]');
  check(await page.locator('#message-panel').isVisible() && await page.locator('#message-rate').isVisible(), 'Message mode exposes its quantity gauge');
  check(await page.locator('#message-target').inputValue() === 'all', 'All entities are targeted by default');

  const before = await page.evaluate(() => ({ rect: __probe.rect, style: __probe.style, raf: __probe.raf }));
  await click('#feed-freeze');
  await emit('physical', 1, 24); await emit('critical', 1, 182); await emit('magical', 1, 65);
  let state = (await inspect()).states[1];
  check(state.history.map(row => row.value).join() === '24,182,65' && state.history.map(row => row.up).join() === '28,14,0', 'Damage list is chronological: latest at bottom, earlier hits rise in compact 14px rows');
  check(state.front.center.kind === 'magical' && state.front.center.value === 65, 'Latest normal hit immediately replaces an older critical in the center');
  const centerSequence = state.front.center.sequence;
  await emit('heal', 1, 32); await emit('proc'); await emit('stun'); await emit('poison'); await emit('burn');
  state = (await inspect()).states[1];
  check(state.history.length === 3 && state.history.every(row => row.category === 'damage'), 'Healing, triggers and statuses never enter damage history');
  check(state.front.center.sequence === centerSequence && state.front.left.kind === 'proc' && state.front.right.kind === 'burn', 'Left triggers and right statuses update independently from the central damage');
  check(await page.locator('#new-world .lab-slot[data-index="1"] [data-zone=right] .damage-popup-value').textContent() === 'Brûlure !', 'Right status uses a short label');
  await clear(); await click('#feed-freeze');
  await page.evaluate(() => { for (let value = 1; value <= 100; value++) visualLab.popups.emit(1, 'physical', value); });
  state = (await inspect()).states[1];
  check(state.history.length === 8 && state.history.map(row => row.value).join() === '93,94,95,96,97,98,99,100', 'A burst retains exactly the last eight hits without aggregation or backlog');
  check(state.front.center.value === 100 && Object.keys(state.front).length === 1 && state.legacy <= 48, 'Foreground always shows the latest hit and remains bounded');
  await emit('hybrid');
  state = (await inspect()).states[1];
  check(state.front.center.value === 160 && state.front.center.nature === 'hybridalDamage', 'Hybrid damage displays a total and its single declared nature');
  await emit('multi');
  check((await inspect()).states[1].front.center.value === 150, 'Multiple components are summed into one amount');
  await page.evaluate(() => visualLab.popups.emit(1, 'critical', undefined, { nature: 'magicalDamage', components: [20, 35, 7] }));
  const compact = await page.evaluate(() => {
    const slot = document.querySelector('#new-world .lab-slot[data-index="1"]');
    const card = slot.querySelector('[data-zone=center] .lab-front-card');
    return { icons: card.querySelectorAll('.picto-stat').length, icon: card.querySelector('.picto-stat').className,
      text: card.textContent, valueColor: __probe.styleOf(card.querySelector('.damage-popup-value')).color,
      suffixColor: __probe.styleOf(card.querySelector('.lab-critical-suffix')).color,
      lastClass: card.querySelector('.damage-popup').lastElementChild.className,
      historyZ: __probe.styleOf(slot.querySelector('.lab-damage-history')).zIndex,
      frontZ: __probe.styleOf(slot.querySelector('.lab-message-front')).zIndex,
      groupZ: __probe.styleOf(slot.querySelector('.lab-message-feed')).zIndex,
      auraZ: __probe.styleOf(slot.querySelector('.aura-container')).zIndex };
  });
  check(compact.icons === 1 && compact.icon.includes('magicalDamage') && !compact.icon.includes('criticalPower'), 'Critical keeps the source nature pictogram instead of replacing it with the critical icon');
  check(compact.text === '−62crit !' && compact.lastClass === 'lab-critical-suffix', 'Only amount and trailing crit ! appear, with no title or component details');
  check(compact.valueColor === 'rgb(185, 152, 255)' && compact.suffixColor === compact.valueColor, 'Amount and critical suffix use the source nature color');
  check(compact.historyZ === '1' && compact.frontZ === '2', 'History and foreground are explicitly separate z-index 1 and 2 blocks');
  check(Number(compact.groupZ) > Number(compact.auraZ), 'The whole message group stacks above the isolated aura container');
  await emit('executionCritical', 1, 214);
  state = (await inspect()).states[1];
  check(state.front.center.critical && state.front.left.icon === 'execution-critical', 'Execution critical keeps its damage in the center and its trigger FX on the left');
  await emit('physical', 1, 9);
  check((await inspect()).states[1].front.center.value === 9, 'A later normal hit also replaces execution critical immediately');
  const after = await page.evaluate(() => ({ rect: __probe.rect, style: __probe.style, raf: __probe.raf }));
  assert.deepEqual(before, after); checks.push('Insertion, replacement, formatting and history need no geometry reads or JS frames');

  const properties = await page.evaluate(() => [...document.querySelectorAll('#new-world .lab-message-feed')].flatMap(node => node.getAnimations({ subtree: true }).flatMap(animation => animation.effect.getKeyframes().flatMap(frame => Object.keys(frame).filter(key => !['offset', 'computedOffset', 'easing', 'composite'].includes(key))))));
  check(properties.length > 0 && properties.every(property => ['transform', 'opacity'].includes(property)), 'Message animations only affect transform and opacity');
  await clear(); await emit('critical', 1, 182); await page.waitForTimeout(170); await emit('physical', 1, 24);
  state = (await inspect()).states[1];
  check(state.exiting === 1 && state.front.center.value === 24, 'A replaced popup gets a short outgoing fade behind the new hit');
  await page.waitForTimeout(220);
  check((await inspect()).states[1].exiting === 0, 'Outgoing popup is removed after its short fade');
  await page.waitForTimeout(600);
  state = (await inspect()).states[1];
  check(!state.front.center && state.history.length === 2, 'Central popup vanishes rapidly while condensed damage history remains');
  const drain = await page.evaluate(async () => {
    const before = { rect: __probe.rect, style: __probe.style, raf: __probe.raf };
    await new Promise(resolve => setTimeout(resolve, 1700));
    return { before, after: { rect: __probe.rect, style: __probe.style, raf: __probe.raf } };
  });
  assert.deepEqual(drain.before, drain.after); checks.push('Animation completion and cleanup perform no layout reads');
  check(await page.locator('.lab-history-row, .lab-front-card, [data-feed-legacy]').count() === 0, 'History, foreground and legacy witness fully drain');

  await input('#message-rate', '0'); await click('#feed-run');
  let snapshot = await inspect();
  check(snapshot.running && !snapshot.timer, 'Rate zero creates no generation timer');
  const zeroCount = snapshot.generated;
  await page.waitForTimeout(180);
  check((await inspect()).generated === zeroCount, 'Rate zero emits no event');
  await input('#message-rate', '20');
  await page.waitForTimeout(1100); await click('#feed-freeze');
  snapshot = await inspect();
  check(snapshot.generated > zeroCount + 60 && snapshot.states.every(state => state.history.length <= 8 && Object.keys(state.front).length <= 3 && state.exiting <= 3 && state.legacy <= 48), '20 events per second on six entities respects all bounds');
  await page.waitForTimeout(180);
  const frozen = await inspect();
  check(frozen.generated === snapshot.generated && !frozen.timer, 'Freeze suspends generation');
  check(frozen.states.every((state, index) => Object.entries(state.front).every(([zone, card]) => Math.abs(card.time - snapshot.states[index].front[zone].time) < 30)), 'Freeze also stops foreground animation time');
  await page.screenshot({ path: resolve(output, 'messages-comparison.png'), fullPage: true });
  await page.locator('.lab-scene[data-kind=new]').screenshot({ path: resolve(output, 'messages-new.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: resolve(output, 'messages-mobile.png'), fullPage: true });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Mobile controls stay inside the viewport');
  await page.setViewportSize({ width: 1536, height: 1100 });
  await click('#feed-freeze'); await page.waitForTimeout(150);
  check((await inspect()).generated > frozen.generated, 'Resume continues generation');

  await clear();
  await page.evaluate(() => { for (const input of document.querySelectorAll('[data-message-kind]')) { input.checked = input.dataset.messageKind === 'stun'; input.dispatchEvent(new Event('change')); } });
  await click('#feed-burst');
  check((await inspect()).states.every(state => state.history.length === 0 && state.front.right.kind === 'stun' && !state.front.center), 'A status-only burst uses only the right foreground');
  await page.evaluate(() => { const node = document.querySelector('[data-message-kind=stun]'); node.checked = false; node.dispatchEvent(new Event('change')); });
  await click('#feed-run');
  check(!(await inspect()).timer && await page.locator('#feed-burst').isDisabled(), 'An empty type selection stops generation');
  await clear();
  await click('button[data-mode=auras]');
  for (const kind of ['fadedLife', 'extraLife', 'eternalLife']) await page.locator('input[data-aura=' + kind + ']').check();
  await page.locator('[data-toggle=motion]').uncheck();
  await click('button[data-mode=messages]'); await click('#feed-with-auras'); await click('#feed-freeze');
  await emit('physical', 1, 24); await emit('magical', 1, 65); await emit('hybrid'); await emit('physical', 1, 32);
  await emit('critical', 1, 182); await emit('proc'); await emit('stun');
  await page.locator('#new-world .lab-slot[data-index="1"]').screenshot({ path: resolve(output, 'two-blocks-detail.png') });
  const zones = await page.evaluate(() => {
    const slot = document.querySelector('#new-world .lab-slot[data-index="1"]');
    const rect = selector => { const value = __probe.rectOf(slot.querySelector(selector)); return { left: value.left, right: value.right, top: value.top, bottom: value.bottom }; };
    return { left: rect('[data-zone=left] .picto-stat'), center: rect('[data-zone=center] .damage-popup'), right: rect('[data-zone=right] .BattleText'), halo: rect('.life-aura-wrap') };
  });
  check(zones.left.right < zones.center.left && zones.right.left > zones.center.right, 'Left trigger and right effect have distinct spaces around central damage');
  check(zones.center.bottom < zones.halo.top, 'Foreground stays above the aura anchors');
  await page.selectOption('#new-world .lab-slot[data-index="1"] select', 'foudre-fange'); await ready();
  check((await inspect()).states[1].history.length === 0 && Object.keys((await inspect()).states[1].front).length === 0, 'Entity replacement clears both message blocks');
  await input('#scale', '1.5'); await emit('executionCritical', 8, 214); await emit('poison');
  const bounds = await page.evaluate(() => {
    const world = __probe.rectOf(document.querySelector('#new-world'));
    return [...document.querySelectorAll('#new-world .lab-feed-life')].map(node => __probe.rectOf(node).top - world.top);
  });
  check(bounds.every(top => top >= 0), 'Compact history and foreground fit with three auras at 150% scale');
  await page.locator('.lab-scene[data-kind=new]').screenshot({ path: resolve(output, 'two-blocks-auras-scale150.png') });
  await click('button[data-mode=auras]');
  check((await inspect()).states.every(state => !state.history.length && !Object.keys(state.front).length && !state.exiting && !state.legacy) && !(await inspect()).timer, 'Leaving the mode clears both layers, all outgoing nodes and clocks');
  await click('#reset'); await ready();
  check(await page.locator('#lab').getAttribute('data-mode') === 'overview' && !(await inspect()).timer, 'Reset restores the initial overview');
  assert.deepEqual(errors, []); assert.deepEqual(failedRequests, []);
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ checks, errors, failedRequests, stress: snapshot, geometryReads: { before, after }, zones }, null, 2));
  console.log('PASS index-15 messages: ' + checks.length + ' checks; two layers, latest damage, compact history, nature formatting, bounded lifecycle, zero geometry reads.');
} catch (error) {
  await page.screenshot({ path: resolve(output, 'failure.png'), fullPage: true }).catch(() => {});
  await writeFile(resolve(output, 'failure.json'), JSON.stringify({ message: error.message, checks, errors, failedRequests, state: await inspect().catch(() => null) }, null, 2));
  throw error;
} finally {
  await browser.close();
}
