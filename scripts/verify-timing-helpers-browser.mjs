import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('docs');
const output = resolve('outputs/timing-helpers');
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
let page;
try {
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  const checks = await page.evaluate(async () => {
    const UI = await Promise.all([import("/js/ui/application.js"), import("/js/ui/attacks.js"), import("/js/ui/codex/index.js"), import("/js/ui/codex/profile.js"), import("/js/ui/codex/stats.js"), import("/js/ui/dialogue.js"), import("/js/ui/display.js"), import("/js/ui/drag.js"), import("/js/ui/essences.js"), import("/js/ui/inventory.js"), import("/js/ui/navigation.js"), import("/js/ui/statistics/components.js"), import("/js/ui/statistics/details.js"), import("/js/ui/statistics/helpers.js")]).then(parts => Object.defineProperties({}, Object.fromEntries(parts.flatMap(part => Object.keys(part).map(key => [key, { enumerable: true, get: () => part[key] }])))));
    const D = await Promise.all([import("/js/combat/statistics.js"), import("/js/board/deployment.js"), import("/js/rendering/hud.js"), import("/js/ui/statistics/details.js"), import("/js/rendering/damageFeedback.js"), import("/js/combat/damageRules.js")]).then(parts => Object.defineProperties({}, Object.fromEntries(parts.flatMap(part => Object.keys(part).map(key => [key, { enumerable: true, get: () => part[key] }])))));
    const E = await import("/js/entities/runtime.js");
    const U = await Promise.all([import("/js/entities/progression.js"), import("/js/rendering/vitalFeedback.js"), import("/js/ui/codex/stats.js"), import("/js/ui/statistics/components.js")]).then(parts => Object.defineProperties({}, Object.fromEntries(parts.flatMap(part => Object.keys(part).map(key => [key, { enumerable: true, get: () => part[key] }])))));
    const R = await import("/js/entities/rules.js");
    const keys = ['attackCooldownReduc', 'attackPreparationReduc', 'attackExecutionReduc', 'attackRecoveryReduc', 'attackProjectileSpeed'];
    const fixture = (amount = 2, haste = 25) => {
      const entity = { id: 987150, name: 'Timing audit', type: 'sbire', side: 'A', awakening: 1,
        level: { current: 30, max: 250 }, attacks: ['autoAttack'], stuff: {},
        baseStats: { HP: 100, chargePlus: 3, physicalDamage: 20, strength: 20, agility: 20, intelligence: 30, haste,
          ...Object.fromEntries(keys.map(key => [key, amount])) } };
      const gear = { equippedId: 'e-timing-gear', equippedTo: entity.id, itemId: 'e-timing-gear', serial: 'i42', itemType: ['stuff'],
        Stuffeffets: keys.flatMap(stat => [{ type: 'stat-buff', stat, value: 3 }, { type: 'stat-buff', stat, variant: '+', value: 4 }]) };
      entity.stuff.slot1 = [gear.equippedId];
      E.recomputeEntityStats(entity, { equippedItems: [gear], persistEquipment: false, skipReverseArchetype: true });
      return entity;
    };
    const attackFor = (range, nature, base = 1001) => ({ displayName: 'Timing audit', attacknature: [nature],
      attackRange: [range], combatFunction: 'Attaquant', attackTarget: ['enemy'], deadTarget: ['no'],
      physicalRatio: 1, magicalRatio: 0, piercingRatio: 0, entityAttackId: `audit-${range}-${nature}`,
      cooldown: base, preparationTime: base, executionTime: base, recoveryTime: base });
    const fields = range => [['cooldownTimeDetail', 'cooldown'], ['preparationTimeDetail', 'preparationTime'],
      [range === 'range' ? 'executionRangeTimeDetail' : 'executionTimeDetail', 'executionTime'], ['recoveryTimeDetail', 'recoveryTime']];
    let count = 0;
    const equal = (a, b, label) => {
      if (Math.abs(a - b) > 1e-7) throw new Error(`${label}: ${a} != ${b}`);
      count++;
    };
    for (const range of ['melee', 'range']) for (const nature of ['physicalDamage', 'piercingDamage', 'transpiercingDamage', 'inerte']) {
      for (const amount of [-10, 0, 20, 120]) for (const haste of [0, 25]) for (const preview of [false, true]) {
        const entity = fixture(amount, haste);
        if (preview) {
          entity.modifierStats.preview = { statLeveled: { haste: 5, intelligence: 8, attackPreparationReducPlus: 5 } };
          U.ComputeStatPreview(entity);
        }
        R.entityBattleBooste(entity, { stat: 'attackPreparationReduc', value: -3, mode: 'flat', source: 'timing-audit' });
        const attack = attackFor(range, nature);
        const view = D.createAttackStatView(entity, attack);
        if (preview && !view.modifierStats.preview?.statLeveled) throw new Error('Attack preview lost its source metadata');
        const before = JSON.stringify(entity);
        const timings = D.getEffectiveAttackTimings(attack, view);
        for (const [key, field] of fields(range)) {
          const display = D.calculateStatsDisplay(key, view, { baseMs: 1001, reduc: timings.reduc });
          const model = display.helperDetails.timing;
          equal(model.effectiveMs, field === 'executionTime' ? timings.impactExecutionTime : timings.effective[field], `${key}: duration`);
          equal(model.sources.filter(source => !source.duration).reduce((sum, source) => sum + source.value, 0), model.bonus, `${key}: source sum`);
          equal(model.sources.filter(source => source.duration).length, 1, `${key}: base duration once`);
          if (/undefined|NaN|Infinity/.test(display.helpContent)) throw new Error(`${key}: invalid text`);
          count++;
        }
        if (before !== JSON.stringify(entity)) throw new Error('Helpers changed entity data');
        count++;
      }
    }
    window.__timingAudit = { UI, D, E, U, R, fixture, attackFor, fields };
    return count;
  });
  const helper = page.locator('[data-umbra-pinned="true"]');
  const detail = page.locator('[data-umbra-detail]');
  const setup = async (range, preview, corner = 'bottom-right', base = 1001, amount = 2) => page.evaluate(({ range, preview, corner, base, amount }) => {
    const { UI, D, U, R, fixture, attackFor } = window.__timingAudit;
    UI.closeOpenHelpers();
    document.getElementById('timing-audit')?.remove();
    const entity = fixture(amount);
    R.entityBattleBooste(entity, { stat: 'attackPreparationReduc', value: 2, mode: 'flat', source: 'timing-audit' });
    if (preview) {
      entity.modifierStats.preview = { statLeveled: { haste: 5, intelligence: 8, attackPreparationReducPlus: 5 } };
      U.ComputeStatPreview(entity);
    }
    const attack = attackFor(range, 'piercingDamage', base);
    const root = UI.AttackDetailInfos(attack, entity, false, 0, { showUmbraPanel: false, showProgression: false, showActivation: false, codexLayout: true });
    const host = document.createElement('main');
    host.id = 'timing-audit';
    host.className = 'section-content attaques';
    host.style.cssText = `position:fixed;${corner.includes('bottom') ? 'bottom' : 'top'}:4px;${corner.includes('right') ? 'right' : 'left'}:4px;width:min(500px, calc(100vw - 8px));background:#240000;z-index:5`;
    root.replaceChildren(root.querySelector('.attack-more-details-reveal'));
    host.append(root);
    document.body.append(host);
    const view = UI.getBoundHelperEntity(root.querySelector('[data-timing-detail]'));
    const models = Object.fromEntries([...root.querySelectorAll('[data-timing-detail]')].map(node =>
      [node.dataset.stat, D.calculateStatsDisplay(node.dataset.stat, view, JSON.parse(node.dataset.timingDetail)).helperDetails.timing]));
    if (amount < 95 && !models.preparationTimeDetail.sources.some(source => source.category === 'equipment')) throw new Error('Fixture must exercise equipment sources');
    if (preview && !models.preparationTimeDetail.sources.some(source => source.category === 'stat')) throw new Error('Fixture must exercise preview sources');
    window.__timingAudit.entity = entity;
    window.__timingAudit.saved = JSON.stringify(entity);
    return models;
  }, { range, preview, corner, base, amount });
  const inBounds = async locator => {
    const bounds = await locator.boundingBox();
    const viewport = page.viewportSize();
    assert.ok(bounds.x >= -1 && bounds.y >= -1 && bounds.x + bounds.width <= viewport.width + 1 && bounds.y + bounds.height <= viewport.height + 1, JSON.stringify(bounds));
  };
  const committedReductions = {};
  for (const range of ['melee', 'range']) for (const preview of [false, true]) {
    const expected = await setup(range, preview);
    if (!preview) committedReductions[range] = expected.preparationTimeDetail.bonus;
    else assert.ok(expected.preparationTimeDetail.bonus > committedReductions[range], 'Preview changes the actual attack reduction');
    for (const [key, timing] of Object.entries(expected)) {
      const trigger = page.locator(`#timing-audit [data-stat="${key}"]`);
      await trigger.click();
      await helper.waitFor({ state: 'visible' });
      assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
      assert.equal(await helper.locator('.stat-hover-body > .helper-calculation').count(), 2, 'Only duration and reduction remain in the main helper');
      assert.equal(await helper.locator('.helper-calculation-detail').count(), 0, 'No expanded formula in the main helper');
      const results = helper.locator('.stat-hover-body > .helper-calculation > .helper-calculation-result');
      assert.equal(parseFloat(await results.nth(0).innerText()), timing.effectiveMs / 1000);
      assert.equal(parseFloat(await results.nth(1).innerText()), timing.bonus);
      assert.deepEqual(await helper.locator('[data-helper-source]').evaluateAll(nodes => nodes.map(node => node.dataset.helperSource)),
        ['umbra', 'fixed', 'stat', 'combat'].filter(category => timing.sources.some(source => (source.family || source.category) === category)));
      await results.nth(0).hover();
      await detail.waitFor({ state: 'visible' });
      assert.match(await detail.innerText(), /\u00d7/);
      await inBounds(detail);
      await results.nth(1).hover();
      await detail.waitFor({ state: 'visible' });
      assert.doesNotMatch(await detail.innerText(), /undefined|NaN/);
      await inBounds(detail);
      for (const source of await helper.locator('[data-helper-source]').all()) {
        await source.hover();
        await detail.waitFor({ state: 'visible' });
        const category = await source.getAttribute('data-helper-source');
        assert.equal(await helper.count(), 1, 'Source hover keeps the parent pinned');
        assert.match(await detail.locator('.stat-hover-header').innerText(), /Stat/);
        assert.equal(await source.evaluate(node => getComputedStyle(node).color), 'rgb(255, 155, 0)');
        const figures = await detail.locator('.helper-calculation-result > .helper-figure:not(.stat-source-provenance *)').allTextContents();
        const groups = new Map();
        for (const source of timing.sources.filter(source => (source.family || source.category) === category)) {
          const key = JSON.stringify([source.stat, source.unit, source.label, source.duration, source.umbra]);
          const previous = groups.get(key);
          if (!previous) groups.set(key, { ...source });
          else {
            if (previous.normalValue != null || source.normalValue != null) {
              previous.normalValue = (previous.normalValue ?? previous.value) + (source.normalValue ?? source.value);
              previous.improvedValue = (previous.improvedValue || 0) + (source.improvedValue || 0);
            }
            previous.value += source.value;
          }
        }
        const amounts = [...groups.values()].flatMap(source => {
          const variants = [source.normalValue, source.improvedValue].filter(value => value);
          return (variants.length ? variants : [source.value]).map(value => source.duration ? value : Math.round(value * 100) / 100);
        });
        assert.deepEqual(figures.map(text => Number(text.replace(/[^0-9.\-]/g, ''))), amounts);
        await inBounds(detail);
      }
      if (preview && key === 'preparationTimeDetail') {
        await page.waitForFunction(() => [...document.querySelectorAll('[data-umbra-pinned], [data-umbra-detail]')].every(node => Number(getComputedStyle(node).opacity) >= .99));
        await page.screenshot({ path: resolve(output, `${range}-preview-source.png`) });
      }
      await page.keyboard.press('Escape');
      if (await helper.count()) await page.keyboard.press('Escape');
      await helper.waitFor({ state: 'detached' });
    }
    assert.ok(await page.evaluate(() => JSON.stringify(window.__timingAudit.entity) === window.__timingAudit.saved), 'UI leaves entity and preview unchanged');
  }
  await setup('range', false);
  await page.locator('#timing-audit [data-stat="executionRangeTimeDetail"]').click();
  await helper.waitFor({ state: 'visible' });
  const refreshed = await page.evaluate(() => {
    const { UI, D, U, entity } = window.__timingAudit;
    entity.modifierStats.preview = { statLeveled: { attackProjectileSpeedPlus: 9 } };
    U.ComputeStatPreview(entity);
    window.dispatchEvent(new CustomEvent('entityCombatStatsChanged', { detail: { entity } }));
    const view = UI.getBoundHelperEntity(document.querySelector('#timing-audit [data-stat="executionRangeTimeDetail"]'));
    if (view.currentAttack?.attackRange?.[0] !== 'range') throw new Error('Live refresh lost the inspected attack');
    return D.getEffectiveAttackTimings(view.currentAttack, view).impactExecutionTime / 1000;
  });
  await page.waitForFunction(value => parseFloat(document.querySelector('[data-umbra-pinned] .helper-calculation-result')?.textContent) === value, refreshed);
  await helper.locator('[data-helper-source="stat"]').hover();
  await detail.waitFor({ state: 'visible' });
  assert.match(await detail.innerText(), /9\s*%/);
  await page.keyboard.press('Escape');
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const corner of ['top-left', 'top-right', 'bottom-left', 'bottom-right']) {
      await setup('melee', false, corner);
      const trigger = page.locator('#timing-audit [data-stat="preparationTimeDetail"]');
      await trigger.focus();
      await page.keyboard.press('Enter');
      await helper.waitFor({ state: 'visible' });
      await inBounds(helper);
      const first = await helper.boundingBox();
      await page.waitForTimeout(150);
      assert.deepEqual(await helper.boundingBox(), first, 'Helper does not jump after appearing');
      await helper.locator('.helper-calculation-result').first().hover();
      await detail.waitFor({ state: 'visible' });
      await inBounds(detail);
      await page.mouse.click(viewport.width / 2, viewport.height / 2);
      await helper.waitFor({ state: 'detached' });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await setup('melee', false, 'bottom-right', 100, 120);
  await page.locator('#timing-audit [data-stat="executionTimeDetail"]').click();
  await helper.waitFor({ state: 'visible' });
  assert.doesNotMatch(await helper.innerText(), /Max atteint/);
  assert.doesNotMatch(await helper.innerText(), /Maximum\s*:/);
  await helper.locator('.helper-calculation-result').first().hover();
  await detail.waitFor({ state: 'visible' });
  assert.match(await detail.innerText(), /Minimum appliqu.*0.2 s/);
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ checks, errors, result: 'passed' }, null, 2));
  console.log(`Timing helpers passed: ${checks} model checks, all timing interactions, previews and viewport edges.`);
} catch (error) {
  if (page) await page.screenshot({ path: resolve(output, 'failure.png') }).catch(() => {});
  throw error;
} finally {
  await browser.close();
  await new Promise(done => server.close(done));
}
