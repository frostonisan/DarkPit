import { dismissStarterForFixture } from "./browser-test-fixture.mjs";
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('docs'), output = resolve('outputs/integrite');
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
  const expectedParts = await page.evaluate(async () => {
    const UI = await import("/js/ui/codex/index.js");
    const E = await import("/js/entities/runtime.js");
    const S = await import("/js/entities/statSystem.js");
    const entity = { id: 987141, name: 'Intégrité et arrondis', type: 'sbire', side: 'A', awakening: 1,
      level: { current: 1, max: 250 }, attacks: ['autoAttack'], stuff: {}, stats: {},
      baseStats: { HP: 100, strength: 10, intelligence: 10, agility: 10, vigueur: 10, esprit: 10,
        finesse: 10, constitution: 10, integrite: 10, magicalResistance: 10, magicalResistancePlus: 5 } };
    E.recomputeEntityStats(entity, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
    localStorage.setItem('selectedArmyA', JSON.stringify([entity]));
    const host = document.createElement('main');
    host.id = 'integrite-test';
    host.style.cssText = 'position:fixed;inset:0;overflow:auto;background:#001024;z-index:1';
    document.body.append(host);
    UI.createCodexEntityScan(entity, host, `codex-entity_${entity.id}`);
    host.querySelector('.codex-inner-menu:has(.codex-stat)').click();
    host.querySelector('.section-content.stats [data-mode="stat"]').click();
    const row = S.getStatSystemResult(entity, 'magicalResistance');
    return [row.progression.source, row.bonuses[0]].map(p => ({ ratio: String(p.coefficient), raw: String(p.raw), retained: p.value }));
  });
  const helper = page.locator('[data-umbra-pinned="true"]');
  const waitHelper = async () => {
    await helper.waitFor({ state: 'visible' });
    await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('[data-umbra-pinned="true"]')).opacity) >= .99);
  };
  const resistance = page.locator('#integrite-test .stat-container[data-stat="magicalResistance"]').first();
  assert.match(await resistance.innerText(), /37[.,]5\s*%/);
  await resistance.click();
  await waitHelper();
  assert.match(await helper.innerText(), /Résistance magique totale\s*:\s*42/);
  await page.screenshot({ path: resolve(output, 'magical-resistance-helper.png') });
  await page.keyboard.press('Escape');
  await page.locator('#integrite-test .section-content.stats [data-mode="umbra"]').click();
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const origin of ['vigueur', 'esprit', 'finesse', 'constitution', 'integrite']) {
      const stat = page.locator(`#integrite-test .stat-container[data-stat="${origin}"]`).first();
      await stat.scrollIntoViewIfNeeded();
      await stat.click();
      await waitHelper();
      await page.mouse.move(viewport.width - 1, 1);
      await page.waitForTimeout(250);
      const calculation = (await helper.locator('[data-umbra-inline-detail]').innerText()).replace(/\s+/g, ' ');
      for (const part of expectedParts) {
        assert.ok(calculation.replaceAll(',', '.').includes(`× ${Math.round(Number(part.ratio) * 10) / 10}`), `${origin}: coefficient displayed to one decimal`);
        assert.ok((await helper.locator('[data-helper-ratio]').evaluateAll(nodes => nodes.map(n => Number(n.dataset.ratioValue)))).includes(Number(part.ratio)), `${origin}: exact coefficient retained for subhelper`);
      }
      const body = (await helper.innerText()).replace(/\s+/g, ' ');
      if (origin === 'integrite') {
        assert.match(body, /Confère \+10\s*,\s*\+10/);
        assert.match(body, /Résistance magique X\s*:\s*\+\s*17/);
        assert.match(body, /Résistance magique accordée par l’Umbra\s*:\s*\+\s*27/);
        assert.ok(!body.includes('dégâts physiques'));
      }
      const box = await helper.boundingBox();
      assert.ok(box.x >= -1 && box.x + box.width <= viewport.width + 1, `${origin}: helper fits viewport`);
      const overflow = await helper.evaluate(el => el.scrollWidth - el.clientWidth);
      assert.ok(overflow <= 1, `${origin}: precise numbers do not overflow the helper`);
      if (origin === 'integrite' || origin === 'vigueur') await page.screenshot({ path: resolve(output, `${origin}-${viewport.width}.png`) });
      await page.keyboard.press('Escape');
    }
  }
  const impacts = await page.evaluate(async () => {
    const E = await import("/js/entities/runtime.js");
    const { applyDamage } = await import("/js/combat/vitals.js");
    const actor = (id, side, values = {}) => E.enrichEntityStats({ id, name: `Intégrité ${id}`, side,
      type: 'sbire', level: 1, attacks: ['autoAttack'], baseStats: { HP: 1000, ...values }, stuff: {} });
    const previousRandom = Math.random;
    Math.random = () => .4;
    try {
      return [0, 25, 100].map((penetration, index) => {
        const attacker = actor(987150 + index, 'A', { magicalPen: penetration });
        const target = actor(987160 + index, 'B', { intelligence: 10, integrite: 10, magicalResistance: 10, magicalResistancePlus: 5 });
        E.entites.push(target);
        const before = target.stats.HP.current, sources = { magical: 100 };
        applyDamage(target, 100, attacker, { functionName: 'integrite-impact', launchContextId: `integrite-${index}`,
          combatFunction: 'Attaquant', attackTarget: ['enemy'], attackRange: ['melee'], attacknature: ['magicalDamage'],
          effets: [], selfEffects: [], forceDamageSources: sources }, sources);
        return before - target.stats.HP.current;
      });
    } finally { Math.random = previousRandom; }
  });
  assert.deepEqual(impacts, [62, 68, 100], 'Real magic damage with pooled 42 RM and 0/25/100% penetration');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(pathToFileURL(resolve('docs/index-14.html')).href);
  await page.getByRole('tab', { name: 'New', exact: true }).click();
  for (const [catalog, id] of [['umbras', 'umbra-integrite'], ['stats', 'fixed-magicalResistance'], ['plus', 'plus-magicalResistance']]) {
    const picker = page.locator(`[data-catalog="${catalog}"]`);
    await picker.locator('summary').click();
    await picker.locator(`[data-add="${id}"]`).click();
  }
  const fill = (group, key, value) => page.locator(`input[data-group="${group}"][data-key="${key}"]`).fill(String(value));
  await fill('attributes', 'intelligence', 10);
  await fill('umbras', 'integrite', 10);
  await fill('fixed', 'magicalResistance', 10);
  await fill('plus', 'magicalResistance', 5);
  assert.equal(await page.locator('[data-stat-total="magicalResistance"]').innerText(), '42');
  const ratio = await page.locator('[data-ratio="umbra-integrite"]').innerText();
  assert.match(ratio, /Réduction magique : 42 \/ \(42 \+ 70\)/);
  for (const part of expectedParts) assert.ok(ratio.includes(`${part.raw} avant arrondi`) && ratio.includes(`× ${part.ratio}`));
  await page.locator('#curve-effect').selectOption('magicalResistance');
  await page.locator('#curve-view').selectOption('total');
  assert.equal(await page.locator('#curve-chart').getAttribute('data-current'), '42');
  await page.screenshot({ path: resolve(output, 'index-14-integrite.png'), fullPage: true });
  await page.evaluate(() => { globalThis.umbraProgression.resistanceCurve.magicalConstant = 140; });
  await page.getByRole('tab', { name: 'New', exact: true }).click();
  assert.equal(await page.locator('[data-stat-total="magicalResistance"]').innerText(), '42');
  assert.match(await page.locator('[data-breakdown="magicalResistance"]').innerText(), /23[.,]08\s*%/);
  assert.deepEqual(errors, []);
  console.log('Integrite browser audit passed: five precise helpers, desktop/mobile, real magic impacts, penetration and Maj parity.');
} finally {
  await browser.close();
  await new Promise(done => server.close(done));
}
