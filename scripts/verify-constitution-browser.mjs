import { dismissStarterForFixture } from "./browser-test-fixture.mjs";
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('docs'), output = resolve('outputs/constitution');
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  const file = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  const rel = relative(root, file);
  if (rel === '..' || rel.startsWith('..' + sep)) return res.writeHead(403).end();
  try {
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await dismissStarterForFixture(page);
  await page.evaluate(async () => {
    const UI = await import("/js/ui/codex/index.js");
    const E = await import("/js/entities/runtime.js");
    const entity = { id: 987131, name: 'Constitution audit', type: 'sbire', side: 'A', awakening: 1,
      level: { current: 1, max: 250 }, attacks: ['autoAttack'], stuff: {}, stats: {},
      baseStats: { HP: 100, strength: 10, constitution: 10, physicalResistance: 10, physicalResistancePlus: 5 } };
    E.recomputeEntityStats(entity, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
    localStorage.setItem('selectedArmyA', JSON.stringify([entity]));
    const host = document.createElement('main');
    host.id = 'constitution-test';
    host.style.cssText = 'position:fixed;inset:0;overflow:auto;background:#240000;z-index:1';
    document.body.append(host);
    UI.createCodexEntityScan(entity, host, `codex-entity_${entity.id}`);
    host.querySelector('.codex-inner-menu:has(.codex-stat)').click();
    host.querySelector('.section-content.stats [data-mode="stat"]').click();
  });
  const resistance = page.locator('#constitution-test .stat-container[data-stat="physicalResistance"]').first();
  assert.match(await resistance.innerText(), /37[.,]5\s*%/, 'Codex reduction uses K=70, not the 42 RP points');
  await resistance.click();
  const helper = page.locator('[data-umbra-pinned="true"]');
  await helper.waitFor({ state: 'visible' });
  await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('[data-umbra-pinned="true"]')).opacity) >= .99);
  assert.match(await helper.locator('.stat-hover-body').innerText(), /37[.,]5\s*%/);
  assert.match(await helper.locator('.stat-hover-body').innerText(), /Résistance physique totale\s*:\s*42/);
  await page.screenshot({ path: resolve(output, 'physical-resistance-helper.png') });
  await page.keyboard.press('Escape');
  await page.locator('#constitution-test .section-content.stats [data-mode="umbra"]').click();
  const constitution = page.locator('#constitution-test .stat-container[data-stat="constitution"]').first();
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await constitution.scrollIntoViewIfNeeded();
    await constitution.click();
    await helper.waitFor({ state: 'visible' });
    await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('[data-umbra-pinned="true"]')).opacity) >= .99);
    const body = (await helper.locator('.stat-hover-body').innerText()).replace(/\s+/g, ' ');
    assert.match(body, /Confère \+10\s*,\s*\+10/);
    assert.match(body, /Résistance physique X\s*:\s*\+\s*17/);
    assert.match(body, /accordée par l’Umbra\s*:\s*\+\s*27/);
    // Mitigation belongs to the resistance helper, checked above.
    const calculation = await helper.locator('[data-umbra-inline-detail]').innerText();
    assert.match(calculation, /10\s*×\s*1[.,]1/);
    assert.match(calculation, /10\s*×\s*0[.,]6/);
    assert.ok(!calculation.includes('→'));
    assert.ok(!body.includes('bonus externes'));
    const box = await helper.boundingBox();
    assert.ok(box.x >= -1 && box.x + box.width <= viewport.width + 1, 'Helper fits the viewport');
    await page.screenshot({ path: resolve(output, `constitution-helper-${viewport.width}.png`) });
    await page.keyboard.press('Escape');
  }
  const impacts = await page.evaluate(async () => {
    const E = await import("/js/entities/runtime.js");
    const { applyDamage } = await import("/js/combat/vitals.js");
    const actor = (id, side, values = {}) => E.enrichEntityStats({ id, name: `K70 ${id}`, side,
      type: 'sbire', level: 1, attacks: ['autoAttack'], baseStats: { HP: 1000, ...values }, stuff: {} });
    const attacker = actor(987132, 'A');
    const previousRandom = Math.random;
    Math.random = () => 0.4;
    try {
      return ['physical', 'magical'].map((source, index) => {
        const target = actor(987133 + index, 'B', { physicalResistance: 150, magicalResistance: 50 });
        E.entites.push(target);
        const hpBefore = target.stats.HP.current;
        const sources = { [source]: 100 };
        applyDamage(target, 100, attacker, { functionName: 'k70-impact', launchContextId: `k70-${source}`,
          combatFunction: 'Attaquant', attackTarget: ['enemy'], attackRange: ['melee'],
          attacknature: [`${source}Damage`], effets: [], selfEffects: [], forceDamageSources: sources }, sources);
        return hpBefore - target.stats.HP.current;
      });
    } finally { Math.random = previousRandom; }
  });
  assert.deepEqual(impacts, [31, 58], 'Real impacts: 150 RP leaves 31 HP damage; 50 RM leaves 58 HP damage');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(pathToFileURL(resolve('docs/index-14.html')).href);
  await page.getByRole('tab', { name: 'New', exact: true }).click();
  for (const [catalog, id] of [['umbras', 'umbra-constitution'], ['stats', 'fixed-physicalResistance'], ['plus', 'plus-physicalResistance']]) {
    const picker = page.locator(`[data-catalog="${catalog}"]`);
    await picker.locator('summary').click();
    await picker.locator(`[data-add="${id}"]`).click();
  }
  const fill = (group, key, value) => page.locator(`input[data-group="${group}"][data-key="${key}"]`).fill(String(value));
  await fill('attributes', 'strength', 10);
  await fill('umbras', 'constitution', 10);
  await fill('fixed', 'physicalResistance', 10);
  await fill('plus', 'physicalResistance', 5);
  assert.equal(await page.locator('[data-stat-total="physicalResistance"]').innerText(), '42');
  assert.match(await page.locator('[data-breakdown="physicalResistance"]').innerText(), /37[.,]5\s*%/);
  assert.match(await page.locator('[data-ratio="umbra-constitution"]').innerText(), /42 \/ \(42 \+ 70\)/);
  await page.locator('#curve-effect').selectOption('physicalResistance');
  await page.locator('#curve-view').selectOption('total');
  assert.equal(await page.locator('#curve-chart').getAttribute('data-current'), '42');
  await page.getByRole('tab', { name: 'Old', exact: true }).click();
  await page.getByRole('tab', { name: 'New', exact: true }).click();
  assert.equal(await page.locator('[data-stat-total="physicalResistance"]').innerText(), '42');
  await page.locator('[data-catalog="umbras"] summary').click();
  await page.locator('[data-add="umbra-integrite"]').click();
  await fill('umbras', 'integrite', 10);
  await fill('attributes', 'intelligence', 10);
  assert.equal(await page.locator('[data-stat-total="magicalResistance"]').innerText(), '27');
  await page.evaluate(() => { globalThis.umbraProgression.resistanceCurve.physicalConstant = 300; });
  await page.getByRole('tab', { name: 'New', exact: true }).click();
  assert.equal(await page.locator('[data-stat-total="physicalResistance"]').innerText(), '42');
  assert.match(await page.locator('[data-breakdown="physicalResistance"]').innerText(), /12[.,]28\s*%/);
  assert.equal(await page.locator('[data-stat-total="magicalResistance"]').innerText(), '27', 'Maj magical K is unaffected by physical K edits');
  await page.evaluate(() => { globalThis.umbraProgression.resistanceCurve.physicalConstant = 70; });
  await page.getByRole('tab', { name: 'New', exact: true }).click();
  await page.screenshot({ path: resolve(output, 'index-14-constitution.png'), fullPage: true });
  assert.deepEqual(errors, []);
  console.log('Constitution browser audit passed: live points, mitigation, helpers, mobile, chart, mode inputs and shared K.');
} finally {
  await browser.close();
  await new Promise(done => server.close(done));
}
