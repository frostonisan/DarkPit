import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('docs'), output = resolve('outputs/inherited-stats');
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
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.evaluate(async () => {
    const E = await import("/js/entities/runtime.js"), G = await import("/js/storage/gameStorage.js");
    const UI = await import("/js/ui/codex/index.js"), _UI = await import("/js/ui/statistics/helpers.js"), P = await import("/js/entities/progression.js"), _P = await import("/js/ui/statistics/components.js");
    const State = await import("/js/app/state.js");
    window.levelRunning = 'worldmap'; G.setAdminMode(true); State.refreshStageAccess();
    const entity = structuredClone(E.entitesNestUp[0]);
    Object.assign(entity, { id: 986742, name: 'Stats héritées', side: 'A', awakening: 1,
      level: { current: 1, max: 250 }, baseStats: { HP: 100, constitution: 1, charge: 3 },
      modifierStats: {}, battleBoosts: {}, stuff: {}, stats: {}, resourceStocks: {},
      Archetype: { current: { key: 'egare', level: 1, step: 0, milestone: [] }, inProgress: [], achieve: [] } });
    E.recomputeEntityStats(entity, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
    E.entites.splice(0, E.entites.length, entity);
    G.saveToLocalStorage('selectedArmyA', [entity]); G.saveToLocalStorage('equippedItems', []);
    P.setPlayerExperience(1000000);
    const host = document.createElement('main');
    host.id = 'inherited-audit';
    host.style.cssText = 'position:fixed;inset:0;overflow:auto;background:#240000';
    document.body.append(host);
    UI.createCodexEntityScan(entity, host, `codex-entity_${entity.id}`);
    host.querySelector('.codex-inner-menu:has(.codex-soul)').click();
    const active = _UI.helperEntityByRoot.get(host.querySelector('.level-up-section'));
    window.__inheritedAudit = { host, entity, active,
      preview(values) {
        active.modifierStats.preview = { statLeveled: values };
        _P.refreshActiveStatPreview(active, host);
      } };
  });
  const sidebar = page.locator('#inherited-audit .codex-colomn-6');
  const inherited = sidebar.locator('.soul-inherited-stats');
  const umbras = sidebar.locator('.soul-umbras');
  assert.equal(await inherited.isVisible(), false, 'Empty inherited block is hidden');
  assert.equal(await umbras.locator('[data-stat="constitution"].stat-container').count(), 1, 'Existing Umbra stays above');
  await page.evaluate(() => window.__inheritedAudit.preview({ vigueur: 1, esprit: 1, finesse: 1 }));
  assert.equal(await inherited.isVisible(), true, 'Introducing powers reveals inherited block');
  assert.equal(await inherited.locator('.entity-stats-title .title').textContent(), 'Stats héritées');
  assert.equal(await inherited.locator('.separation-line.golden').count(), 2, 'Existing gold title separator is reused');
  for (const key of ['vigueur', 'esprit', 'finesse']) {
    assert.equal(await umbras.locator(`.stat-container[data-stat="${key}"]`).count(), 1);
    assert.equal(await inherited.locator(`.stat-container[data-stat="${key}"]`).count(), 0);
  }
  for (const key of ['physicalDamage', 'magicalDamage', 'piercingDamage']) {
    assert.equal(await inherited.locator(`.stat-container[data-stat="${key}"]`).count(), 1, `${key}: one inherited row`);
    assert.equal(await umbras.locator(`.stat-container[data-stat="${key}"]`).count(), 0);
  }
  assert.equal(await inherited.locator('.umbra-milestone').count(), 0);
  const initialRows = await inherited.locator('.stat-container').count();
  assert.deepEqual(await inherited.locator('.stat-milestone').allTextContents(), Array(initialRows).fill('stat'));
  assert.equal(await inherited.locator('.stat-milestone').first().evaluate(node => getComputedStyle(node).color), 'rgb(140, 140, 140)');
  await page.evaluate(() => window.__inheritedAudit.preview({ vigueur: 2, esprit: 1, finesse: 1 }));
  assert.equal(await inherited.locator('.stat-container').count(), initialRows, 'Refreshing preview does not duplicate rows');
  const pp = inherited.locator('.stat-container[data-stat="physicalDamage"]');
  assert.equal(await pp.locator('.entite-stat.preview').innerText(), '4', 'Inherited values refresh from the live preview');
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    const boxes = await sidebar.evaluate(node => {
      const box = selector => { const r = node.querySelector(selector).getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height }; };
      const row = node.querySelector('.soul-inherited-stats .stat-picto-valeur');
      const right = node.querySelector('.soul-inherited-stats-list').getBoundingClientRect().right;
      const clipped = [...node.querySelectorAll('.soul-inherited-stats .entite-stat.preview')]
        .some(value => value.getBoundingClientRect().right > right + 1);
      return { full: box('.soul-stats-panels'), umbras: box('.soul-umbras'), stats: box('.soul-inherited-stats'),
        first: row.firstElementChild.classList.contains('stat-milestone') && row.children[1].classList.contains('picto-stat'), overflow: row.scrollWidth - row.clientWidth, clipped };
    });
    await page.screenshot({ path: resolve(output, `split-${viewport.width}.png`) });
    assert.ok(Math.abs(boxes.stats.height / boxes.full.height - .25) < .01, `Inherited block occupies 25% of the panel: ${JSON.stringify(boxes)}`);
    assert.ok(boxes.stats.top >= boxes.umbras.bottom - 1, 'Inherited stats follow Umbras');
    assert.ok(boxes.first && boxes.overflow <= 2, 'Grey stat milestone precedes the stat icon without horizontal overflow');
    assert.ok(!boxes.clipped, 'Preview values fit inside the inherited panel');
  }
  await pp.hover();
  const helper = page.locator('.stat-hover[data-stat="physicalDamage"]');
  await helper.waitFor({ state: 'visible' });
  assert.match(await helper.innerText(), /puissance physique de\s+4/i, 'Inherited helper reads the preview');
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__inheritedAudit.preview({}));
  assert.equal(await inherited.isVisible(), false, 'Removing preview gains hides inherited block again');
  assert.equal(await inherited.locator('.stat-container').count(), 0);
  assert.equal(await umbras.locator('.stat-container[data-stat="constitution"]').count(), 1);
  await page.locator('#inherited-audit .axis-line[data-key="strength"] .right-arrow').dispatchEvent('click');
  assert.equal(await inherited.isVisible(), true, 'The real level-up control also reveals inherited stats');
  await page.locator('#inherited-audit .axis-line[data-key="strength"] .left-arrow').dispatchEvent('click');
  assert.equal(await inherited.isVisible(), false, 'Undoing the real level-up choice hides the inherited stats');
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ passed: true, initialRows, errors }, null, 2));
  console.log('Inherited stats sidebar verified: partition, 25% height, live preview, helper and empty state.');
} finally {
  await browser.close();
  await new Promise(done => server.close(done));
}
