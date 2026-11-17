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
const slot = '#new-world .lab-slot[data-index="1"]';
const foreground = (zone, lane = 'center') => slot + ' [data-zone=' + zone + '] [data-lane=' + lane + ']';
const freeze = () => click('#feed-freeze');
const fresh = async () => { await clear(); await freeze(); };
const describe = (zone = 'center', lane = 'center') => page.evaluate(selector => {
  const card = document.querySelector(selector + ' .lab-front-card:not([data-outgoing])');
  const value = card.querySelector('.damage-popup-value'), suffix = card.querySelector('.lab-critical-suffix');
  return { text: card.textContent, icons: card.querySelectorAll('.picto-stat, .lab-status-icon').length,
    icon: card.querySelector('.picto-stat')?.className, statusIcon: card.querySelector('.lab-status-icon')?.src,
    valueColor: value && __probe.styleOf(value).color, suffixColor: suffix && __probe.styleOf(suffix).color,
    font: parseFloat(__probe.styleOf(card.querySelector('.lab-feed-life')).fontSize),
    peak: card.querySelector('.lab-feed-life').getAnimations()[0].effect.getKeyframes()[1].transform };
}, foreground(zone, lane));
try {
  await page.goto(pathToFileURL(resolve('docs/index-15.html')).href); await ready();
  check(await page.locator('#error').isHidden(), 'Startup succeeds from file://');
  const aura = await page.evaluate(() => {
    const before = { rect: __probe.rect, style: __probe.style, raf: __probe.raf };
    document.querySelector('button[data-mode=auras]').click();
    for (const node of document.querySelectorAll('input[data-aura]')) { node.checked = true; node.dispatchEvent(new Event('change')); }
    const counts = ['new', 'old'].map(id => document.querySelectorAll('#' + id + '-world [data-aura]').length);
    document.getElementById('aura-profiles').click();
    return { counts, before, after: { rect: __probe.rect, style: __probe.style, raf: __probe.raf } };
  });
  check(aura.counts.every(count => count === 18), 'Aura selection remains available in both scenes');
  assert.deepEqual(aura.before, aura.after); checks.push('Aura changes do not measure geometry');
  await click('button[data-mode=messages]');
  check(await page.locator('#message-rate').isVisible() && await page.locator('#message-target').inputValue() === 'all', 'Quantity gauge is visible with all entities targeted');
  check(await page.locator(slot + ' .lab-feedback-lane').count() === 9, 'Each of the three families owns center, left and right piles');
  const before = await page.evaluate(() => ({ rect: __probe.rect, style: __probe.style, raf: __probe.raf }));

  await freeze(); await emit('physical', 1, 24); await emit('critical', 1, 182); await emit('magical', 1, 65);
  let state = (await inspect()).states[1];
  check(state.front['center:center'].value === 24 && state.front['center:left'].value === 182 && state.front['center:right'].value === 65, 'Rapid damage arrivals start in the center then alternate left and right');
  check(state.history.map(row => row.value).join() === '24,182,65' && state.history.map(row => row.up).join() === '28,14,0', 'One central damage archive rises in compact chronological rows');
  await emit('heal'); await emit('proc', 3); await emit('stun'); await emit('poison'); await emit('burn');
  state = (await inspect()).states[1];
  check(['left:center', 'left:left', 'left:right', 'right:center', 'right:left', 'right:right'].every(key => state.front[key]), 'GIF and effect families independently use their own overflow piles');
  check(state.history.length === 3 && state.statusHistory.map(row => row.kind).join() === 'stun,poison,burn', 'Damage and status have separate archives, with no trigger GIF archived');
  check(await page.locator(slot + ' .lab-feedback-archive .lab-proc-gif').count() === 0 && await page.locator(slot + ' [data-zone=left] .lab-feedback-archive').count() === 0, 'The GIF family has no history container or archived image');
  const stun = await describe('right');
  check(stun.text === 'Stun 3 scd !' && stun.statusIcon.endsWith('/statut-stun.jpg'), 'Stun includes its pictogram and three-second duration');
  check(await page.locator(foreground('left', 'left') + ' .lab-proc-gif').count() === 1 && await page.locator(foreground('left', 'left') + ' .picto-stat').count() === 0, 'Capability proc uses the existing animated GIF instead of an icon');

  await fresh();
  await page.evaluate(() => { for (let value = 1; value <= 100; value++) visualLab.popups.emit(1, 'physical', value); });
  state = (await inspect()).states[1];
  check(state.history.map(row => row.value).join() === '93,94,95,96,97,98,99,100' && Object.keys(state.front).length === 3, 'A hundred hits retain only eight archived rows and three live damage piles');
  check(Object.values(state.front).some(card => card.value === 100), 'Newest burst hit is visible in an overflow pile without a pending queue');
  await page.evaluate(() => { document.querySelector('#new-world .lab-slot[data-index="1"] [data-zone=center] [data-lane=center] .lab-feed-life').getAnimations()[0].currentTime = 300; visualLab.popups.emit(1, 'physical', 999); });
  check((await inspect()).states[1].front['center:center'].value === 999, 'The central pile takes priority again once its appearance window is free');

  await fresh(); await emit('hybrid');
  check((await inspect()).states[1].front['center:center'].value === 160 && (await describe()).icons === 1, 'Hybrid damage keeps one total and one pictogram');
  await emit('multi');
  check((await inspect()).states[1].front['center:left'].value === 150, 'Multiple components remain summed into one popup');
  await fresh();
  await page.evaluate(() => visualLab.popups.emit(1, 'critical', undefined, { nature: 'magicalDamage', components: [20, 35, 7] }));
  const critical = await describe();
  check(critical.icons === 1 && critical.icon.includes('criticalPower') && critical.text === '−62!!!', 'Critical replaces the nature icon and uses only !!! after the amount');
  check(critical.valueColor === 'rgb(185, 152, 255)' && critical.suffixColor === 'rgb(255, 108, 0)', 'Critical amount keeps its magical color while punctuation is orange');
  check(critical.font === 32 && critical.peak.includes('scale(1.14)'), 'Critical has a bigger pop than normal damage');
  const smoothing = await page.evaluate(() => {
    const body = document.querySelector('#new-world .lab-slot[data-index="1"] [data-zone=center] [data-lane=center] .lab-feed-life');
    const animation = body.getAnimations()[0];
    const samples = [0, 80, 240, 700, 980].map(time => { animation.currentTime = time; return Number(__probe.styleOf(body).opacity); });
    animation.currentTime = 150;
    return { samples, duration: animation.effect.getTiming().duration, start: animation.effect.getKeyframes()[0].transform };
  });
  check(smoothing.samples[0] === 0 && smoothing.samples[1] > 0 && smoothing.samples[1] < smoothing.samples[2] && smoothing.samples[3] > smoothing.samples[4], 'Popup fades in progressively and fades out over its final phase');
  check(smoothing.start.includes('scale(0.94)') && smoothing.duration === 1000, 'Critical starts near its final size with a softer one-second lifecycle');
  await emit('executionCritical', 1, 214);
  const execution = await describe('center', 'left');
  check(execution.icon.includes('execution-critical') && execution.valueColor === critical.valueColor && execution.suffixColor === 'rgb(255, 0, 6)', 'Execution critical uses its special icon, nature-colored amount and red !!!');
  check(execution.font === 40 && execution.peak.includes('scale(1.2)'), 'Execution critical has the largest font and pop');
  check((await inspect()).states[1].front['left:center'].fx === 'bloodFuryExec.gif', 'Execution capability GIF appears in the left family');

  await fresh();
  await page.evaluate(() => {
    visualLab.popups.emit(1, 'stun', undefined, { durationMs: 3000 });
    visualLab.popups.emit(1, 'poison', undefined, { durationMs: 1250 });
    visualLab.popups.emit(1, 'burn', undefined, { durationMs: null, effectValue: 20, effectUnit: '%' });
  });
  check((await describe('right')).text === 'Stun 3 scd !' && (await describe('right', 'left')).text === 'Poison 1,3 scd !', 'Durations convert milliseconds to seconds with at most one decimal');
  check((await describe('right', 'right')).text === 'Brûlure 20% !', 'An available non-duration effect value is displayed');
  await fresh(); await input('#effect-duration', ''); await emit('stun');
  check((await describe('right')).text === 'Stun !', 'An unknown duration does not produce an invented value');
  await input('#effect-duration', '3');
  const layers = await page.evaluate(() => {
    const root = document.querySelector('#new-world .lab-slot[data-index="1"]');
    return { archive: __probe.styleOf(root.querySelector('.lab-effect-history')).zIndex, front: __probe.styleOf(root.querySelector('[data-zone=right] .lab-feedback-lanes')).zIndex,
      group: __probe.styleOf(root.querySelector('.lab-message-feed')).zIndex, aura: __probe.styleOf(root.querySelector('.aura-container')).zIndex };
  });
  check(layers.archive === '1' && layers.front === '2' && Number(layers.group) > Number(layers.aura), 'Each archive stays behind foreground piles and the complete group stays above auras');
  const anchors = await page.evaluate(async () => {
    document.getElementById('feed-clear').click();
    const root = document.querySelector('#new-world .lab-slot[data-index="1"] .lab-message-feed');
    const capture = () => {
      const origin = __probe.rectOf(root);
      return [...root.querySelectorAll('.lab-message-front, .lab-front-slot, .lab-feedback-lanes, .lab-feedback-lane, .lab-feedback-archive')].map(node => {
        const rect = __probe.rectOf(node);
        return { position: __probe.styleOf(node).position, x: Number((rect.x - origin.x).toFixed(3)), y: Number((rect.y - origin.y).toFixed(3)), width: rect.width, height: rect.height };
      });
    };
    const empty = capture();
    document.getElementById('feed-freeze').click();
    visualLab.popups.emit(1, 'physical', 1);
    visualLab.popups.emit(1, 'proc');
    visualLab.popups.emit(1, 'stun', undefined, { durationMs: 1000 });
    const short = capture();
    for (let i = 0; i < 5; i++) {
      visualLab.popups.emit(1, 'executionCritical', 123456);
      visualLab.popups.emit(1, 'burn', undefined, { durationMs: 123400 });
    }
    const long = capture();
    const styles = [...root.querySelectorAll('.lab-front-card')].map(node => __probe.styleOf(node).position);
    document.getElementById('feed-freeze').click();
    await new Promise(resolve => setTimeout(resolve, 1300));
    const expiredPopups = capture();
    await new Promise(resolve => setTimeout(resolve, 1200));
    return { empty, short, long, expiredPopups, drained: capture(), styles };
  });
  check(anchors.empty.every(anchor => anchor.position === 'absolute') && anchors.styles.every(position => position === 'absolute'), 'All family, lane, archive and popup containers are absolute');
  for (const phase of ['short', 'long', 'expiredPopups', 'drained']) assert.deepEqual(anchors[phase], anchors.empty, 'Fixed anchors remain identical during ' + phase);
  checks.push('All nine piles and both archives stay fixed across short/long values, critical changes, GIFs, fades and removal');
  const after = await page.evaluate(() => ({ rect: __probe.rect, style: __probe.style, raf: __probe.raf }));
  assert.deepEqual(before, after); checks.push('Overflow routing, archives, durations and critical rendering add no geometry reads or JS frames');

  for (const [key, file] of [['esoterism', 'esoterism.gif'], ['ambidextry', 'ambidextry.gif'], ['indestructibility', 'indestructibility.gif'], ['bloodfuryexec', 'bloodFuryExec.gif']]) {
    await fresh();
    await page.evaluate(key => { document.getElementById('proc-gif').value = key; visualLab.popups.emit(1, 'proc'); }, key);
    await page.waitForFunction(file => { const image = document.querySelector('#new-world .lab-slot[data-index="1"] [data-zone=left] [data-lane=center] img'); return image?.src.endsWith('/' + file) && image.complete && image.naturalWidth > 0; }, file);
    check(true, 'Capability GIF loads: ' + file);
  }
  await page.evaluate(() => { document.getElementById('proc-gif').value = 'esoterism'; });
  await clear(); await emit('proc'); await page.waitForTimeout(180);
  await page.locator(slot).screenshot({ path: resolve(output, 'proc-live.png') });
  await clear(); await emit('proc'); await page.waitForTimeout(180);
  await page.locator(slot).screenshot({ path: resolve(output, 'proc-retrigger.png') });
  await fresh(); await emit('physical', 4); await emit('stun', 4);
  const properties = await page.evaluate(() => [...document.querySelectorAll('#new-world .lab-message-feed')].flatMap(node => node.getAnimations({ subtree: true }).flatMap(animation => animation.effect.getKeyframes().flatMap(frame => Object.keys(frame).filter(key => !['offset', 'computedOffset', 'easing', 'composite'].includes(key))))));
  check(properties.length > 0 && properties.every(property => ['transform', 'opacity'].includes(property)), 'Message animations only affect transform and opacity');
  await clear(); await emit('physical', 5, 24);
  state = (await inspect()).states[1];
  check(Object.keys(state.front).length === 3 && state.exiting <= 2, 'Overflow replacement keeps a bounded short fade per occupied pile');
  await page.waitForFunction(() => visualLab.popups.inspect().states[1].exiting === 0, null, { timeout: 2500 });
  await page.waitForFunction(() => Object.keys(visualLab.popups.inspect().states[1].front).length === 0);
  check((await inspect()).states[1].history.length > 0, 'Brief popups disappear before the central damage archive');
  const drain = await page.evaluate(async () => {
    const before = { rect: __probe.rect, style: __probe.style, raf: __probe.raf };
    await new Promise(resolve => setTimeout(resolve, 2300));
    return { before, after: { rect: __probe.rect, style: __probe.style, raf: __probe.raf } };
  });
  assert.deepEqual(drain.before, drain.after); checks.push('Animation cleanup performs no geometry reads');
  check(await page.locator('.lab-history-row, .lab-front-card, [data-feed-legacy]').count() === 0, 'Both archives and all foreground/GIF nodes drain completely');

  await input('#message-rate', '0'); await click('#feed-run');
  let snapshot = await inspect();
  check(snapshot.running && !snapshot.timer, 'Rate zero creates no generation timer');
  const zeroCount = snapshot.generated;
  await page.waitForTimeout(180);
  check((await inspect()).generated === zeroCount, 'Rate zero emits no events');
  await input('#message-rate', '20'); await page.waitForTimeout(1300); await freeze();
  snapshot = await inspect();
  check(snapshot.generated > zeroCount + 60 && snapshot.states.every(state => state.history.length <= 8 && state.statusHistory.length <= 6 && Object.keys(state.front).length <= 9 && state.exiting <= 9 && state.legacy <= 48), '20 events per second on six entities stays bounded across all nine piles and both archives');
  await page.waitForTimeout(180);
  const frozen = await inspect();
  check(frozen.generated === snapshot.generated && !frozen.timer, 'Freeze suspends generation');
  check(frozen.states.every((state, index) => Object.entries(state.front).every(([key, card]) => Math.abs(card.time - snapshot.states[index].front[key].time) < 30)), 'Freeze stops popup motion in every pile');
  await page.screenshot({ path: resolve(output, 'messages-comparison.png'), fullPage: true });
  await page.locator('.lab-scene[data-kind=new]').screenshot({ path: resolve(output, 'messages-new.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: resolve(output, 'messages-mobile.png'), fullPage: true });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Controls stay inside the mobile viewport');
  await page.setViewportSize({ width: 1536, height: 1100 });
  await freeze(); await page.waitForTimeout(150);
  check((await inspect()).generated > frozen.generated, 'Resume continues generation');

  await clear();
  await page.evaluate(() => { for (const input of document.querySelectorAll('[data-message-kind]')) { input.checked = input.dataset.messageKind === 'stun'; input.dispatchEvent(new Event('change')); } });
  await click('#feed-burst');
  check((await inspect()).states.every(state => state.history.length === 0 && state.statusHistory.length === 6 && Object.keys(state.front).every(key => key.startsWith('right:'))), 'A status-only burst populates only status piles and the status archive');
  await page.evaluate(() => { const node = document.querySelector('[data-message-kind=stun]'); node.checked = false; node.dispatchEvent(new Event('change')); });
  await click('#feed-run');
  check(!(await inspect()).timer && await page.locator('#feed-burst').isDisabled(), 'Empty type selection stops generation');
  await clear(); await click('button[data-mode=auras]');
  for (const kind of ['fadedLife', 'extraLife', 'eternalLife']) await page.locator('input[data-aura=' + kind + ']').check();
  await page.locator('[data-toggle=motion]').uncheck();
  await click('button[data-mode=messages]'); await click('#feed-with-auras'); await freeze();
  await emit('critical', 1, 182); await emit('proc'); await emit('stun');
  await page.locator(slot).screenshot({ path: resolve(output, 'critical-gif-detail.png') });
  const zones = await page.evaluate(() => {
    const root = document.querySelector('#new-world .lab-slot[data-index="1"]');
    const rect = selector => { const value = __probe.rectOf(root.querySelector(selector)); return { left: value.left, right: value.right, top: value.top, bottom: value.bottom }; };
    return { left: rect('[data-zone=left] [data-lane=center] img'), center: rect('[data-zone=center] [data-lane=center] .damage-popup'), right: rect('[data-zone=right] [data-lane=center] .BattleText'), frame: rect('.lab-frame'), halo: rect('.life-aura-wrap') };
  });
  check(zones.center.left - zones.left.right < 32 && zones.right.left - zones.center.right < 32, 'Fixed family positions retain compact spacing around the critical popup');
  check(Math.abs(zones.center.left + zones.center.right - zones.frame.left - zones.frame.right) < .6, 'Damage stays centered on the sprite despite variable text widths');
  check(zones.center.bottom < zones.halo.top, 'The foreground remains above aura anchors');
  await emit('physical', 1, 32); await emit('magical', 1, 65); await emit('proc', 2); await emit('poison'); await emit('burn');
  await page.locator(slot).screenshot({ path: resolve(output, 'nine-piles-detail.png') });
  await page.selectOption(slot + ' select', 'foudre-fange'); await ready();
  check((await inspect()).states[1].history.length === 0 && (await inspect()).states[1].statusHistory.length === 0 && Object.keys((await inspect()).states[1].front).length === 0, 'Replacement clears all nine piles and both archives');
  await input('#scale', '1.5'); await emit('executionCritical', 8, 214); await emit('stun'); await emit('poison'); await emit('burn');
  const bounds = await page.evaluate(() => {
    const world = __probe.rectOf(document.querySelector('#new-world'));
    return [...document.querySelectorAll('#new-world .lab-feed-life')].map(node => __probe.rectOf(node).top - world.top);
  });
  check(bounds.every(top => top >= 0), 'Nine piles and archives fit with three auras at 150% scale');
  await page.locator('.lab-scene[data-kind=new]').screenshot({ path: resolve(output, 'nine-piles-auras-scale150.png') });
  await click('button[data-mode=auras]');
  check((await inspect()).states.every(state => !state.history.length && !state.statusHistory.length && !Object.keys(state.front).length && !state.exiting && !state.legacy) && !(await inspect()).timer, 'Leaving the mode removes every archive, popup, GIF and clock');
  await click('#reset'); await ready();
  check(await page.locator('#lab').getAttribute('data-mode') === 'overview' && !(await inspect()).timer, 'Reset restores initial overview');
  assert.deepEqual(errors, []); assert.deepEqual(failedRequests, []);
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ checks, errors, failedRequests, stress: snapshot, geometryReads: { before, after }, anchors, smoothing, zones }, null, 2));
  console.log('PASS index-15 messages: ' + checks.length + ' checks; nine piles, GIFs, critical tiers, two archives, effect durations, bounded lifecycle, zero geometry reads.');
} catch (error) {
  await page.screenshot({ path: resolve(output, 'failure.png'), fullPage: true }).catch(() => {});
  await writeFile(resolve(output, 'failure.json'), JSON.stringify({ message: error.message, checks, errors, failedRequests, state: await inspect().catch(() => null) }, null, 2));
  throw error;
} finally {
  await browser.close();
}
