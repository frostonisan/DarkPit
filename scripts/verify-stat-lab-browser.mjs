import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/Utilisateur/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const path = resolve('docs/index-13.html');
const output = resolve('outputs/stat-lab');
await mkdir(output, { recursive: true });
const html = await readFile(path, 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
check(scripts.length === 2, 'model and UI inline');
check(!/<script[^>]+src=|<link[^>]+stylesheet|<iframe|\bimport\s*\(/.test(html), 'no external runtime files');
for (const script of scripts) new vm.Script(script);
const sandbox = vm.createContext({ window: {}, Intl, console });
vm.runInContext(scripts[0], sandbox);
const helper = (entries, target, part) => {
  const changed = sandbox.testEntries !== entries;
  sandbox.testEntries = entries; sandbox.testTarget = target; sandbox.testPart = part;
  if (changed) vm.runInContext('labSnapshot = calculateLab(testEntries)', sandbox);
  return vm.runInContext('labHelper(testTarget, testPart)', sandbox);
};
const { calculate, catalogs } = sandbox.window.statLab;
const source = (kind, key, value) => ({ id: `${kind}:${key}:${value}`, kind, key, value });
const normal = (key, value) => source('normal', key, value);
const plus = (key, value) => source('improved', key, value);
const umbra = (key, value) => source('umbra', key, value);
const row = (entries, key) => calculate(entries).rows.find(row => row.id === key);
const signature = entries => JSON.stringify(calculate(entries).rows.map(row => [row.id, row.value, row.state]).sort());
const attributes = [normal('strength', 20), normal('intelligence', 20), normal('agility', 20)];
check(catalogs.normal.length === 46 && catalogs.improved.length === 34 && catalogs.umbra.length === 27, 'complete catalogs');
check(calculate([]).rows.length === 0, 'no default results');
check(calculate([normal('physicalPen', 1)]).rows.length === 1, 'only selected result');
check(row([normal('physicalPen', 5), ...attributes], 'physicalPen').value === 5, 'normal penetration stays final percent');
for (const [key, umbraValue] of Object.entries({ physicalPen: 12, magicalPen: 12, physicalResistance: 27, magicalResistance: 27, dodge: 30.5, velocity: 25 })) {
  const spec = catalogs.improved.find(spec => spec.key === key);
  check(spec.unit === '%' && spec.step === .01, `+ percentage input ${key}`);
  check(row([normal(key, 1), plus(key, 1), plus(key, 6)], key).value === 8, `1% normal + 1% improved + 6% improved: ${key}`);
  check(row([plus(key, 6.5)], key).value === 6.5, `decimal improved percentage preserved: ${key}`);
  check(row([...attributes, umbra(spec.origin, 15)], key).value === umbraValue, `existing Umbra curve preserved: ${key}`);
  check(row([...attributes, umbra(spec.origin, 15), plus(key, 1), plus(key, 6), normal(key, 1)], key).value === umbraValue + 8, `attribute improvement once, autonomous percentages preserved: ${key}`);
}
check(row([plus('physicalDamage', 5), ...attributes], 'physicalDamage').value === 15, 'independent + has strength ratio');
check(row([plus('physicalDamage', 5)], 'physicalDamage').state === '+', '+ state');
check(row([normal('physicalDamage', 2), normal('physicalDamage', 4)], 'physicalDamage').value === 6, 'normal sum');
check(row([normal('physicalDamage', 2)], 'physicalDamage').state === 'normal', 'normal state');
const mixed = [...attributes, normal('physicalDamage', 2), normal('physicalDamage', 4), plus('physicalDamage', 4), plus('physicalDamage', 3)];
check(row(mixed, 'physicalDamage').value === 23, 'normal 6 + improved 7 + strength 10 once');
check(row(mixed, 'physicalDamage').state === 'X', 'X state');
check(signature(mixed) === signature([...mixed].reverse()), 'order independent');
check(row([...mixed, umbra('vigueur', 15)], 'physicalDamage').value === 38, 'Umbra does not repeat attribute bonus');
check(row([plus('armor', 2), plus('armor', 3)], 'armor').value === 15, 'common armor base once');
check(row([normal('armor', 5)], 'armor').value === 5, 'normal armor has no extra base');
check(row([plus('physicalDamage', 0), ...attributes], 'physicalDamage').value === 0, 'zero + does not grant a free bonus');
check(row([normal('criticalChance', 90), plus('criticalChance', 20)], 'criticalChance').value === 100, 'final probability cap');
check(row([normal('cognitiveGenerator', 8), plus('cognitiveGenerator', 6)], 'cognitiveGenerator').value === 10, 'generator cap');
check(row([plus('bloodFuryExecutionChance', 4), plus('bloodFuryExecutionChance', 3), normal('bloodFuryExecutionChance', 6), normal('strength', 20)], 'bloodFuryExecutionChance').value === 23, 'execution strength ratio once');
check(row([plus('criticalDamage', 4), plus('criticalDamage', 3)], 'criticalDamage').value === 57, 'common critical base once');
check(row([plus('hpBattleRegen', 4), normal('strength', 150)], 'hpBattleRegen').value === 9, 'combat regen + activates strength ratio without an Umbra');
const capped = row([normal('criticalChance', 90), plus('criticalChance', 20)], 'criticalChance');
check(capped.parts.reduce((sum, part) => sum + part.value, 0) === capped.value, 'displayed contributions sum to capped total');
check(!/localStorage|sessionStorage|indexedDB/.test(scripts.join('\n')), 'standalone never touches game storage');
for (const spec of catalogs.normal) {
  const amount = spec.key === 'speed' ? .5 : 7;
  check(row([normal(spec.key, amount)], spec.key).value === amount, `normal ${spec.key} is final`);
}
for (const spec of catalogs.improved) {
  const split = [...attributes, plus(spec.key, 4), plus(spec.key, 3)];
  check(signature(split) === signature([...attributes, plus(spec.key, 7)]), `+ pooling ${spec.key}`);
  const entries = [...split, normal(spec.key, 2)];
  check(row(entries, spec.key).state === 'X', `X ${spec.key}`);
  check(signature(entries) === signature([...entries].reverse()), `order ${spec.key}`);
  check(signature([...split, umbra(spec.origin, 15)]) === signature([...attributes, plus(spec.key, 7), umbra(spec.origin, 15)]), `Umbra pooling ${spec.key}`);
}
for (const spec of catalogs.umbra) for (const amount of [0, 1, 15, 80, 150, 1000]) {
  check(calculate([...attributes, umbra(spec.key, amount)]).rows.every(row => Number.isFinite(row.value)), `finite ${spec.key} ${amount}`);
  check(signature([...attributes, umbra(spec.key, amount), umbra(spec.key, amount)]) === signature([...attributes, umbra(spec.key, amount * 2)]), `Umbra sum ${spec.key} ${amount}`);
}
const all = [...catalogs.normal.map(spec => normal(spec.key, spec.key === 'speed' ? .5 : 10)), ...catalogs.improved.map(spec => plus(spec.key, 10)), ...catalogs.umbra.map(spec => umbra(spec.key, 10))];
check(calculate(all).rows.every(row => Number.isFinite(row.value)), 'complete composition finite');
for (const result of calculate(all).rows) check(Math.abs(result.parts.reduce((total, part) => total + part.value, 0) - result.value) < .000001, `helper parts equal total: ${result.id}`);
for (const target of [...catalogs.normal.map(spec => spec.key), ...catalogs.umbra.map(spec => spec.key), ...calculate(all).rows.map(row => row.id)]) {
  const rendered = helper(all, target);
  check(!!rendered.html && !/NaN|undefined|Infinity/.test(rendered.html), `game helper content valid: ${target}`);
  for (const match of rendered.html.matchAll(/data-umbra-calculation="([^"]+)" data-umbra-part="(\d+)"/g)) {
    const detail = helper(all, target, { calculation: match[1], index: Number(match[2]) });
    check(!!detail.html && !/NaN|undefined|Infinity/.test(detail.html), `game ratio content valid: ${target}/${match[1]}/${match[2]}`);
  }
}
check(helper([umbra('vigueur', 15), ...attributes], 'vigueur').html.includes('La Vigueur permet'), 'original Vigueur text');
check(helper([umbra('haste', 15), ...attributes], 'haste').html.includes('durée de préparation'), 'original Haste text');
check(/0\.5/.test(helper(mixed, 'physicalDamage', { calculation: 'physicalDamage/improved', index: 2 }).html), 'true strength ratio, not inferred from result');
check(helper([umbra('hypercognition', 20)], 'hypercognition', { calculation: 'cognitiveGenerator/improved', index: 0 }).html.includes('Palier 2'), 'current cognitive milestone');
check(!helper([umbra('hypercognition', 20)], 'hypercognition').html.includes('Prochain palier'), 'no future milestone');
check(helper([umbra('hypercognition', 20)], 'hypercognition').html.includes('data-umbra-calculation="hypercognitionEssences"'), 'generator has complete source model');
check(/>5 %</.test(helper([umbra('precision', 10), plus('criticalDamage', 1)], 'precision').html), 'Precision shows its active critical damage contribution');
check(helper([umbra('precision', 10)], 'precision', { calculation: 'critPrecisionBonus', index: 0 }).html.includes('Bonus inactif.'), 'inactive Precision critical bonus identified');

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [], requests = [];
let page;
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, offline: true });
  page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (!/^(file|data):/.test(request.url())) requests.push(request.url()); });
  await page.goto(pathToFileURL(path).href);
  await page.waitForSelector('body[data-ready=true]', { timeout: 20000 });
  let count = 0;
  async function settle(next) {
    count = next;
    await page.waitForFunction(count => document.getElementById('lab-status').textContent.startsWith(`${count} source`), count);
    check(await page.locator('#lab-status').getAttribute('data-error') === 'false', `UI calculation ${count}`);
  }
  async function add(kind, key, value) {
    const field = page.locator(`#${kind}-list [data-key="${key}"]`);
    await field.locator('input').fill(String(value));
    await field.locator('button[type=submit]').click();
    await settle(count + 1);
  }
  const getValue = async key => Number(await page.locator(`[data-result="${key}"]`).getAttribute('data-value'));
  await add('normal', 'physicalPen', 1);
  check(await page.locator('#lab-totals .lab-result').count() === 1, 'one visible result');
  await page.locator('[data-result=physicalPen] .lab-remove').click();
  await settle(0);
  await add('normal', 'magicalPen', 1);
  await add('improved', 'magicalPen', 1);
  await add('improved', 'magicalPen', 6);
  check(await getValue('magicalPen') === 8, 'reported penetration example totals 8%');
  check(await page.locator('#improved-list [data-key=magicalPen] .lab-unit').innerText() === '%', 'improved penetration visibly uses percent');
  await page.locator('[data-result=magicalPen] .lab-name').click();
  await page.waitForSelector('#lab-helper:not([hidden])');
  check(await page.locator('#lab-helper .lab-helper-source').count() === 3, 'X helper lists all three sources separately');
  check(await page.locator('#lab-helper [data-source-kind=normal]').count() === 1 && await page.locator('#lab-helper [data-source-kind=improved]').count() === 2, 'X helper distinguishes normal and improved');
  check(/6\s*%/.test(await page.locator('#lab-helper .lab-helper-source').last().innerText()), '6% source visible in X helper');
  check(/7\s*%/.test(await page.locator('#lab-helper .lab-helper-calculation').innerText()), 'pooled improved subtotal visible');
  await page.screenshot({ path: resolve(output, 'system2-penetration-x-helper.png') });
  await page.locator('#lab-helper [data-umbra-calculation="magicalPen/improved"]').last().hover();
  await page.waitForSelector('#lab-helper .lab-detail [data-umbra-calculation="magicalPen/points"]');
  await page.locator('#lab-helper .lab-detail [data-umbra-calculation="magicalPen/points"]').last().hover();
  await page.waitForSelector('#lab-helper .lab-detail .lab-detail .stat-hover-body');
  check(/0\.5/.test(await page.locator('#lab-helper .lab-detail .lab-detail').innerText()), 'conversion exposes underlying attribute ratio');
  await page.screenshot({ path: resolve(output, 'game-helper-conversion.png') });
  await page.keyboard.press('Escape');
  await page.locator('#sources-tab').click();
  check(await page.locator('#lab-sources .lab-unit').allTextContents().then(units => units.every(unit => unit === '%')), 'all penetration source units are percentages');
  const penetrationInput = page.locator('#lab-sources input').last();
  await penetrationInput.fill('6.5'); await penetrationInput.press('Tab');
  await page.waitForFunction(() => document.querySelector('[data-result=magicalPen]').dataset.value === '8.5');
  await page.locator('#totals-tab').click();
  await page.locator('[data-result=magicalPen] .lab-name').click();
  await page.waitForSelector('#lab-helper:not([hidden])');
  check(/6,5\s*%/.test(await page.locator('#lab-helper .lab-helper-source').last().innerText()), 'edited source updated in X helper');
  await page.keyboard.press('Escape');
  await page.locator('#sources-tab').click();
  await page.locator('#lab-sources .lab-remove').last().click();
  await settle(2);
  await page.locator('#totals-tab').click();
  check(await getValue('magicalPen') === 2, 'removed source no longer counted');
  await page.locator('[data-result=magicalPen] .lab-name').click();
  await page.waitForSelector('#lab-helper:not([hidden])');
  check(await page.locator('#lab-helper .lab-helper-source').count() === 2, 'removed source absent from X helper');
  await page.keyboard.press('Escape');
  await page.locator('[data-result=magicalPen] .lab-remove').click();
  await settle(0);
  await add('normal', 'strength', 20);
  await add('improved', 'physicalDamage', 4);
  check(await getValue('physicalDamage') === 14, '+ without Umbra');
  await add('improved', 'physicalDamage', 3);
  check(await getValue('physicalDamage') === 17, 'second + only adds its base');
  await add('normal', 'physicalDamage', 6);
  check(await getValue('physicalDamage') === 23, 'normal joins after ratio');
  check((await page.locator('[data-result=physicalDamage] .lab-name').innerText()).endsWith(' X'), 'visible X label');
  await add('umbra', 'vigueur', 15);
  check(await getValue('physicalDamage') === 38, 'Umbra joins once');
  await page.locator('[data-result=physicalDamage] .lab-name').click();
  await page.waitForSelector('#lab-helper:not([hidden])');
  check((await page.locator('#lab-helper').innerText()).includes('38'), 'helper total');
  check(await page.locator('#lab-helper .lab-helper-source').count() === 4, 'X helper shows normal, both improved inputs and Umbra');
  check(await page.locator('#lab-helper [data-source-kind=umbra]').count() === 1, 'Umbra source listed once');
  check(await page.locator('#lab-helper [data-source-key=strength]').count() === 0, 'ratio attribute not counted as a direct source');
  check(/10/.test(await page.locator('#lab-helper .lab-helper-calculation').innerText()), 'shared attribute contribution visible in X helper');
  check(await page.evaluate(() => pinned), 'click pins long helper without covering its trigger');
  await page.locator('#lab-helper [data-umbra-part]').last().hover();
  await page.waitForSelector('#lab-helper .lab-detail .stat-hover-body');
  check(/0[.,]5/.test(await page.locator('#lab-helper .lab-detail').innerText()), 'actual ratio shown');
  check((await page.locator('#lab-helper .lab-detail').innerText()).includes('Détail du ratio : Force'), 'named game ratio header');
  check((await page.locator('#lab-helper .lab-detail').innerText()).includes('La valeur finale est arrondie.'), 'rounding footer');
  await page.keyboard.press('Escape');
  await page.screenshot({ path: resolve(output, 'system2-desktop.png'), fullPage: true });
  for (const width of [1280, 900, 390]) {
    await page.setViewportSize({ width, height: 850 });
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no overflow ${width}`);
    await page.locator('[data-result=physicalDamage] .lab-name').click();
    await page.waitForSelector('#lab-helper:not([hidden])');
    const box = await page.locator('#lab-helper').boundingBox();
    check(box.x >= 0 && box.x + box.width <= width + 1 && box.y >= 0 && box.y + box.height <= 851, `helper bounds ${width}`);
    check(await page.locator('#lab-helper').evaluate(node => node.scrollWidth <= node.clientWidth), `X source details fit ${width}`);
    await page.screenshot({ path: resolve(output, `system2-x-helper-${width}.png`) });
    await page.keyboard.press('Escape');
    await page.screenshot({ path: resolve(output, `system2-${width}.png`), fullPage: true });
  }
  await page.locator('[data-result=physicalDamage] .lab-remove').click();
  await settle(1);
  check(await page.locator('#lab-totals .lab-result').count() === 1, 'minus preserves unrelated strength');
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.locator('#lab-reset').click();
  await settle(0);
  for (const entry of all) await add(entry.kind, entry.key, entry.value);
  check(await page.locator('#lab-totals .lab-result > .lab-remove').count() === await page.locator('#lab-totals .lab-result').count(), 'minus on all results');
  const helperAudit = await page.evaluate(() => [...new Set([...document.querySelectorAll('[data-helper-target]')].map(node => node.dataset.helperTarget))].filter(target => {
    const helper = labHelper(target); return !helper.html || /NaN|undefined|Infinity/.test(helper.html);
  }));
  check(helperAudit.length === 0, `all helpers valid: ${helperAudit}`);
  for (const key of ['haste', 'hypercognition', 'robustness', 'movement']) {
    await page.locator(`#umbra-list [data-key="${key}"] .lab-name`).click();
    await page.waitForSelector('#lab-helper:not([hidden])');
    check(await page.evaluate(() => pinned), `game Umbra helper pins: ${key}`);
    check(await page.locator('#lab-helper [data-umbra-part]').count() > 0, `game Umbra contributions: ${key}`);
    check(await page.locator('#lab-helper').evaluate(node => node.scrollWidth <= node.clientWidth), `game Umbra content fits: ${key}`);
    await page.screenshot({ path: resolve(output, `game-helper-${key}.png`) });
    await page.keyboard.press('Escape');
  }
  const images = await page.evaluate(async () => {
    const urls = new Set([...document.images].map(image => image.src));
    for (const icon of document.querySelectorAll('.lab-row > .picto-stat, .lab-result > .picto-stat')) for (const match of getComputedStyle(icon).backgroundImage.matchAll(/url\(["']?(.*?)["']?\)/g)) urls.add(match[1]);
    const probe = document.createElement('div'); probe.className = 'lab-helper'; probe.hidden = true; document.body.append(probe);
    const missing = new Set();
    for (const target of [...catalogs.normal.map(spec => spec.key), ...catalogs.umbra.map(spec => spec.key), ...snapshot.rows.map(row => row.id)]) {
      probe.innerHTML = labHelper(target).html;
      for (const icon of probe.querySelectorAll('.picto-stat')) {
        if (icon.classList.contains('neutral')) continue;
        const background = getComputedStyle(icon).backgroundImage;
        if (background === 'none') missing.add(icon.className);
        for (const match of background.matchAll(/url\(["']?(.*?)["']?\)/g)) urls.add(match[1]);
      }
    }
    probe.remove();
    const failed = [];
    for (const url of urls) { const image = new Image(); image.src = url; try { await image.decode(); } catch { failed.push(url.slice(0, 70)); } }
    return { count: urls.size, failed, missing: [...missing] };
  });
  check(images.failed.length === 0 && images.count > 40, `embedded pictos: ${JSON.stringify(images)}`);
  check(images.missing.length === 0, `no empty game helper pictograms: ${images.missing}`);
  await page.locator('#sources-tab').click();
  const input = page.locator('#lab-sources input').first();
  await input.fill('17'); await input.press('Tab');
  await page.waitForFunction(() => document.getElementById('lab-status').textContent !== 'Calcul en cours…');
  check(await input.inputValue() === '17', 'source remains editable');
  await page.locator('#totals-tab').click();
  await page.screenshot({ path: resolve(output, 'system2-complete.png'), fullPage: true });
  check(requests.length === 0, `no network requests: ${requests}`);
  check(errors.length === 0, `no browser exceptions: ${errors}`);
  const redirect = await context.newPage();
  await redirect.goto(pathToFileURL(resolve('docs/index-12.html')).href);
  await redirect.waitForURL('**/index-13.html');
  await redirect.waitForSelector('body[data-ready=true]');
  check(true, 'index-12 redirects to standalone index-13');
  console.log(JSON.stringify({ status: 'passed', checks, offline: true, output }, null, 2));
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ checks, errors, requests, images }, null, 2));
} catch (error) {
  if (page) {
    console.log(await page.evaluate(() => ({ pinned, helperTarget, status: document.getElementById('lab-status').textContent, helper: document.getElementById('lab-helper').outerHTML })).catch(() => null));
    await page.screenshot({ path: resolve(output, 'failure.png') }).catch(() => {});
  }
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ checks, errors, requests, error: error.stack }, null, 2));
  throw error;
} finally { await browser.close(); }
