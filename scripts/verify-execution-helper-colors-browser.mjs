import { dismissStarterForFixture } from './browser-test-fixture.mjs';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('docs');
const output = resolve('outputs/execution-helper-colors');
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  const file = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  const rel = relative(root, file);
  if (rel === '..' || rel.startsWith('..' + sep)) return res.writeHead(403).end();
  try {
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file === root ? resolve(root, 'index.html') : file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const keys = ['bloodFuryExecutionChance', 'bloodFuryExecutionDamage', 'bloodFuryTargetThreshold'];
const checks = [];
let page;
try {
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await dismissStarterForFixture(page);
  const reference = await page.evaluate(keys => {
    const colors = {};
    for (const key of keys) for (const state of ['normal', '+', 'X', '◇', '◆', 'Ω', 'umbra']) {
      const node = document.createElement('span');
      node.className = 'bloodFury';
      if (state === 'X') {
        node.style.setProperty('--stat-x-from', key === 'bloodFuryTargetThreshold' ? 'var(--color-bloodFury)' : 'var(--color-strength)');
        node.style.setProperty('--stat-x-to', 'var(--color-bloodFury)');
      }
      node.dataset.statState = state;
      document.body.append(node);
      const style = getComputedStyle(node);
      colors[key + state] = { color: style.color, background: style.backgroundImage, fill: style.webkitTextFillColor };
      node.remove();
    }
    return colors;
  }, keys);
  const paint = locator => locator.evaluate(node => {
    const style = getComputedStyle(node);
    return { color: style.color, background: style.backgroundImage, fill: style.webkitTextFillColor };
  });
  const verifyPaint = async (locator, state, label) => {
    const key = keys.find(key => label.includes(key));
    assert.ok(key, label + ': effect identity');
    assert.deepEqual(await paint(locator), reference[key + state], label);
    checks.push(label);
  };
  const setup = async (state, preview, view) => page.evaluate(async ({ keys, state, preview, view }) => {
    const UI = await import("/js/ui/statistics/helpers.js"), _UI = await import("/js/ui/codex/index.js");
    const E = await import("/js/entities/runtime.js");
    const U = await import("/js/entities/progression.js"), _U = await import("/js/ui/statistics/components.js");
    const S = await import("/js/entities/statSystem.js");
    UI.closeOpenHelpers();
    document.getElementById('color-audit')?.remove();
    const entity = { id: 987149, name: 'Execution color audit', type: 'sbire', side: 'A', awakening: 1,
      level: { current: 30, max: 250 }, attacks: ['autoAttack'], stuff: {},
      baseStats: { HP: 100, physicalDamage: 25, strength: 20, agility: 10, intelligence: 6 } };
    const withUmbra = ['◇', '◆', 'Ω'].includes(state);
    const withNormal = ['normal', 'X', '◇', 'Ω'].includes(state);
    const withPlus = ['+', 'X', '◆', 'Ω'].includes(state);
    if (withUmbra) entity.baseStats.bloodFury = 15;
    for (const key of keys) {
      if (withNormal) entity.baseStats[key] = 3;
      if (withPlus) entity.baseStats[`${key}Plus`] = 2;
    }
    E.recomputeEntityStats(entity, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
    localStorage.setItem('selectedArmyA', JSON.stringify([entity]));
    U.setPlayerExperience(1000000);
    const host = document.createElement('main');
    host.id = 'color-audit';
    host.style.cssText = 'position:fixed;inset:0;overflow:auto;background:#240000;z-index:1';
    document.body.append(host);
    _UI.createCodexEntityScan(entity, host, `codex-entity_${entity.id}`);
    host.querySelector(`.codex-inner-menu:has(.codex-${view === 'Stats' ? 'stat' : 'soul'})`).click();
    if (view === 'Stats') host.querySelector('.section-content.stats [data-mode="stat"]').click();
    const activeEntity = view === 'Level up' ? UI.helperEntityByRoot.get(host.querySelector('.level-up-section')) : entity;
    const committed = JSON.stringify(activeEntity.stats);
    if (preview) {
      activeEntity.modifierStats.preview = { statLeveled: { strength: 6, physicalDamage: 5,
        ...(withUmbra ? { bloodFury: 5 } : {}),
        ...Object.fromEntries(keys.map(key => [withPlus ? `${key}Plus` : key, 1])) } };
      _U.refreshActiveStatPreview(activeEntity, host);
    }
    window.__executionColorAudit = { entity: activeEntity, committed };
    return Object.fromEntries(keys.map(key => [key, S.getStatSystemResult(activeEntity, key)]));
  }, { keys, state, preview, view });
  const helper = page.locator('[data-umbra-pinned="true"]');
  const detail = page.locator('[data-umbra-detail]');
  checks.push(...await page.evaluate(async () => {
    const E = await import("/js/entities/runtime.js");
    const D = await import("/js/ui/statistics/details.js");
    const S = await import("/js/entities/statSystem.js");
    const H = await import('/js/data/helpers.js');
    const U = await import("/js/entities/progression.js");
    const { getDisplayStatKey } = await import("/js/entities/rules.js");
    const passed = [];
    const expect = (ok, label) => { if (!ok) throw new Error(label); passed.push(label); };
    for (const [key, origin] of Object.entries(S.STAT_SYSTEM_ORIGINS)) {
      for (const mode of ['normal', 'plus-only', 'umbra', 'mixed']) for (const preview of [false, true]) {
        const entity = { id: 987150, type: 'sbire', awakening: 1, level: { current: 30, max: 250 }, stuff: {},
          baseStats: { strength: 20, agility: 30, intelligence: 40, HP: 100 } };
        const withUmbra = ['umbra', 'mixed'].includes(mode);
        if (mode !== 'umbra') entity.baseStats[key] = 3;
        if (mode !== 'normal') entity.baseStats[`${key}Plus`] = 2;
        if (withUmbra) entity.baseStats[origin] = 30;
        E.recomputeEntityStats(entity, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
        const committed = JSON.stringify(entity.stats);
        if (preview) {
          entity.modifierStats.preview = { statLeveled: { [withUmbra ? origin : `${key}Plus`]: 5 } };
          U.ComputeStatPreview(entity);
        }
        const row = S.getStatSystemResult(entity, key);
        const model = S.buildStatSystemModel(row, entity);
        const content = document.createElement('div');
        content.innerHTML = H.buildAutonomousCalculationHelper(model, '', key);
        const label = `${key}/${mode}${preview ? '/preview' : ''}`;
        const icons = content.querySelectorAll('[data-helper-umbra-source]');
        expect(icons.length === (withUmbra ? 1 : 0), `${label}: only a real Umbra gets an icon in the calculation`);
        if (withUmbra) {
          expect(icons[0].dataset.helperUmbraSource === origin && icons[0].classList.contains(origin), `${label}: originating Umbra icon`);
          expect(icons[0].nextElementSibling?.dataset.statState === row.state, `${label}: icon precedes the final stat name with its actual state`);
        }
        const totals = D.getStatisticSourceTotals(entity, key, D.calculateStatsDisplay(key, entity));
        content.innerHTML = H.buildStatisticOrigins({ compact: true, totals, statName: key });
        for (const source of content.querySelectorAll('[data-helper-source]')) {
          const template = source.querySelector('template');
          const sourceIcons = template.content.querySelectorAll('[data-helper-umbra-source]');
          const umbraSource = source.dataset.helperSource === 'umbra' && withUmbra;
          expect(sourceIcons.length === (umbraSource ? 1 : 0), `${label}/${source.dataset.helperSource}: source attribution has no borrowed icon`);
          if (umbraSource) expect(sourceIcons[0].dataset.helperUmbraSource === origin
            && sourceIcons[0].nextElementSibling?.classList.contains(getDisplayStatKey(key))
            && sourceIcons[0].nextElementSibling.hasAttribute('data-stat-state'), `${label}: source icon precedes the stat name`);
        }
        expect(JSON.stringify(entity.stats) === committed, `${label}: presentation leaves committed totals unchanged`);
      }
    }
    return passed;
  }));
  for (const state of ['normal', '+', 'X', '◇', '◆', 'Ω']) for (const preview of [false, true]) {
    const expected = await setup(state, preview, 'Stats');
    for (const key of keys) {
      const label = `Stats ${key} ${state}${preview ? ' preview' : ''}`;
      const row = page.locator(`#color-audit .section-content.stats .stat-container[data-stat="${key}"]`).first();
      const suffix = state === 'normal' ? '' : ` ${state}`;
      assert.ok((await row.locator('.stat-name').innerText()).trim().endsWith(`${suffix} :`), `${label}: composition suffix`);
      await verifyPaint(row.locator('.stat-name [data-stat-state]').first(), state, `${label}: name`);
      await verifyPaint(row.locator('.entite-stat:not(.preview)').first(), state, `${label}: value`);
      await page.evaluate(async () => (await import("/js/ui/statistics/helpers.js")).closeOpenHelpers());
      await row.click();
      await helper.waitFor({ state: 'visible' });
      if (suffix) assert.ok((await helper.locator('.stat-hover-header').innerText()).endsWith(suffix), `${label}: helper suffix`);
      await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('[data-umbra-pinned]')).opacity) >= .99);
      const result = helper.locator('.helper-calculation-result').first();
      await verifyPaint(result.locator('.helper-figure > span:not(.picto-stat)').first(), state, `${label}: helper result`);
      assert.equal(Number((await result.innerText()).replace(/\s|%|\+/g, '')), Math.round(expected[key].value * 100) / 100, `${label}: live result`);
      await result.hover();
      await detail.waitFor({ state: 'visible' });
      for (const [kind, variant] of [['base', 'normal'], ['total', state]]) {
        const line = detail.locator(`[data-autonomous-kind="${kind}"]`);
        assert.equal(await line.count(), 1, `${label}: base and final result are both present`);
        assert.equal(await line.locator('[data-helper-umbra-source="bloodFury"]').count(), kind === 'total' && ['◇', '◆', 'Ω'].includes(state) ? 1 : 0, `${label}: Umbra icon before the final stat name only`);
        await verifyPaint(line.locator(':scope > [data-stat-state]'), variant, `${label}: ${kind} detail name`);
        await verifyPaint(line.locator('.helper-figure > span:not(.picto-stat)'), variant, `${label}: ${kind} detail value`);
      }
      if (preview && state === 'Ω' && key === 'bloodFuryExecutionDamage') {
        await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('[data-umbra-detail]')).opacity) >= .99);
        await detail.screenshot({ path: resolve(output, 'umbra-calculation-icon.png') });
      }
      for (const source of await helper.locator('[data-helper-source]').all()) {
        const category = await source.getAttribute('data-helper-source');
        await source.hover();
        await detail.waitFor({ state: 'visible' });
        const names = detail.locator('.stat-source-details > [data-stat-state]');
        const values = detail.locator('.stat-source-details > .helper-calculation > .helper-calculation-result > .helper-figure > span:not(.picto-stat)');
        assert.equal(await detail.locator('[data-helper-umbra-source="bloodFury"]').count(), category === 'umbra' ? 1 : 0, `${label}: live source identifies its Umbra`);
        assert.equal(await names.count(), await values.count());
        for (let i = 0; i < await names.count(); i++) {
          const variant = await names.nth(i).getAttribute('data-stat-state');
          await verifyPaint(names.nth(i), variant, `${label}: ${category} source name`);
          await verifyPaint(values.nth(i), variant, `${label}: ${category} source value`);
        }
        assert.equal(await source.evaluate(node => getComputedStyle(node).color), 'rgb(255, 155, 0)', 'Source label remains orange');
        if (category === 'umbra' && preview && state === 'Ω' && key === 'bloodFuryExecutionDamage') {
          await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('[data-umbra-detail]')).opacity) >= .99);
          await detail.screenshot({ path: resolve(output, 'umbra-source-icon.png') });
        }
      }
      if (preview && state === 'Ω') {
        await page.waitForFunction(() => [...document.querySelectorAll('[data-umbra-pinned], [data-umbra-detail]')]
          .every(node => Number(getComputedStyle(node).opacity) >= .99));
        await page.screenshot({ path: resolve(output, `stats-preview-${key}.png`) });
      }
      await page.keyboard.press('Escape');
    }
    assert.ok(await page.evaluate(() => JSON.stringify(window.__executionColorAudit.entity.stats) === window.__executionColorAudit.committed), 'Stats previews do not alter committed stats');
  }
  for (const state of ['◇', '◆', 'Ω']) for (const preview of [false, true]) {
    const expected = await setup(state, preview, 'Level up');
    const row = page.locator('#color-audit .umbra-submenu .stat-container[data-stat="bloodFury"]').first();
    await row.click();
    await helper.waitFor({ state: 'visible' });
    for (const [key, text] of [['bloodFuryExecutionChance', 'Chance d’exécution'], ['bloodFuryExecutionDamage', 'Dégâts d’exécution']]) {
      const label = helper.locator(`[data-umbra-section="capacity"] [data-helper-effect="${key}"]`);
      assert.equal(await label.evaluate(node => getComputedStyle(node).color), 'rgb(255, 0, 6)', `Level up: ${text} matches Fureur sanguinaire`);
      checks.push(`Level up ${state}${preview ? ' preview' : ''}: ${text} label`);
    }
    for (const key of keys) {
      const label = `Level up ${key} ${state}${preview ? ' preview' : ''}`;
      const figure = helper.locator(`.helper-calculation-result .helper-figure[data-helper-stat="${key}"]`).first();
      assert.equal(await figure.locator(`.${key}:not(.picto-stat)`).evaluate(node => getComputedStyle(node).color), 'rgb(255, 0, 6)', `${label}: Umbra figure keeps its base hue`);
      const picto = helper.locator(`[data-umbra-section="capacity"] > .picto-stat[data-helper-picto-stat="${key}"]`).first();
      await picto.hover();
      await detail.waitFor({ state: 'visible' });
      const expectedName = await page.evaluate(async key => (await import('/js/data/statsData.js')).stats.find(stat => stat.key === key).name, key);
      assert.ok((await detail.locator('.stat-hover-header').innerText()).includes(expectedName), `${label}: nested helper names its statistic`);
      const result = detail.locator('.helper-calculation-result').first();
      await verifyPaint(result.locator(`.${key}[data-stat-state]`), state, `${label}: nested stat result`);
      assert.equal(Number((await result.innerText()).replace(/\s|%|\+/g, '')), Math.round(expected[key].value * 100) / 100, `${label}: nested stat uses preview total`);
      const total = helper.locator(`[data-umbra-section="total"] .helper-calculation-result .helper-figure[data-helper-stat="${key}"]`).first();
      assert.equal(Number((await total.innerText()).replace(/\s|%|\+/g, '')), Math.round(expected[key].value * 100) / 100, `${label}: capacity total uses preview values`);
      if (preview && state === 'Ω') {
        await page.waitForFunction(() => [...document.querySelectorAll('[data-umbra-pinned], [data-umbra-detail]')]
          .every(node => Number(getComputedStyle(node).opacity) >= .99));
        await page.screenshot({ path: resolve(output, `level-up-preview-${key}.png`) });
      }
    }
    await page.keyboard.press('Escape');
    assert.ok(await page.evaluate(() => JSON.stringify(window.__executionColorAudit.entity.stats) === window.__executionColorAudit.committed), 'Level up previews do not alter committed stats');
  }
  await setup('normal', false, 'Stats');
  const transitionRow = page.locator('#color-audit .section-content.stats .stat-container[data-stat="bloodFuryExecutionChance"]').first();
  await transitionRow.click();
  await helper.waitFor({ state: 'visible' });
  for (const [delta, state] of [
    [{ bloodFury: 15 }, '◇'],
    [{ bloodFury: 15, bloodFuryExecutionChancePlus: 2 }, 'Ω'],
    [{ bloodFuryExecutionChancePlus: 2 }, 'X'],
    [{ bloodFuryExecutionChance: -3, bloodFuryExecutionChancePlus: 2, bloodFury: 15 }, '◆'],
    [{ bloodFuryExecutionChance: -3, bloodFury: 15 }, '+'],
    [null, 'normal'],
  ]) {
    const expected = await page.evaluate(async delta => {
      const U = await import("/js/ui/statistics/components.js");
      const S = await import("/js/entities/statSystem.js");
      const { entity, committed } = window.__executionColorAudit;
      if (delta) entity.modifierStats.preview = { statLeveled: delta };
      else delete entity.modifierStats.preview;
      U.refreshActiveStatPreview(entity, document.getElementById('color-audit'));
      if (JSON.stringify(entity.stats) !== committed) throw new Error('Composition preview changed committed statistics');
      return S.getStatSystemResult(entity, 'bloodFuryExecutionChance');
    }, delta);
    assert.equal(expected.state, state);
    await page.waitForFunction(state => {
      const name = document.querySelector('#color-audit .section-content.stats [data-stat="bloodFuryExecutionChance"] .stat-name [data-stat-state]');
      const card = document.querySelector('[data-umbra-pinned="true"]');
      const figure = card?.querySelector('.helper-calculation-result [data-stat-state]');
      return name?.dataset.statState === state && figure?.dataset.statState === state;
    }, state);
    const header = await helper.locator('.stat-hover-header').innerText();
    assert.equal(/[+X◇◆Ω]$/.test(header), state !== 'normal', `Live ${state}: obsolete suffix removed`);
    if (state !== 'normal') assert.ok(header.endsWith(` ${state}`), `Live ${state}: pinned header follows preview`);
    assert.equal(Number((await helper.locator('.helper-calculation-result').first().innerText()).replace(/\s|%|\+/g, '')),
      Math.round(expected.value * 100) / 100, `Live ${state}: pinned total agrees with the engine`);
    checks.push(`Live preview transition to ${state}, with pinned helper and untouched committed stats`);
  }
  await page.keyboard.press('Escape');
  await setup('Ω', true, 'Stats');
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileRow = page.locator('#color-audit .section-content.stats .stat-container[data-stat="bloodFuryExecutionChance"]').first();
  await mobileRow.scrollIntoViewIfNeeded();
  await mobileRow.click();
  await helper.waitFor({ state: 'visible' });
  await helper.locator('.helper-calculation-result').first().hover();
  await detail.waitFor({ state: 'visible' });
  for (const box of await page.locator('[data-umbra-pinned], [data-umbra-detail]').evaluateAll(nodes => nodes.map(node => {
    const r = node.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }))) assert.ok(box.left >= 0 && box.top >= 0 && box.right <= 391 && box.bottom <= 845, 'Omega helper and detail stay within mobile bounds');
  await page.waitForFunction(() => [...document.querySelectorAll('[data-umbra-pinned], [data-umbra-detail]')]
    .every(node => Number(getComputedStyle(node).opacity) >= .99));
  await page.screenshot({ path: resolve(output, 'omega-preview-mobile.png') });
  checks.push('Omega helper and detail fit the 390 px viewport');
  assert.deepEqual(errors, []);
  const report = { checks: checks.length, states: ['normal', '+', 'X', '◇', '◆', 'Ω'], previews: true, views: ['Stats', 'Level up'], checksPassed: checks };
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ checks: checks.length, last: checks.slice(-6) }));
} catch (error) {
  console.error(JSON.stringify({ last: checks.slice(-6) }));
  if (page) await page.screenshot({ path: resolve(output, 'failure.png') }).catch(() => {});
  throw error;
} finally {
  await browser.close();
  await new Promise(done => server.close(done));
}
