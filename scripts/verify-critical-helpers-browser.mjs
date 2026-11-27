import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright';

const root = resolve('docs'), output = resolve('outputs/critical-nature-helpers-2026-11-28/screens');
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  const file = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(root + sep)) return res.writeHead(403).end();
  try {
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const errors = [];
  for (const width of [1440, 390]) {
  const page = await browser.newPage({ viewport: { width, height: 1000 }, isMobile: width === 390, hasTouch: width === 390 });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await (await import('./browser-test-fixture.mjs')).dismissStarterForFixture(page);
  await page.evaluate(async () => {
    const E = await import('/js/entities/runtime.js'), G = await import('/js/storage/gameStorage.js');
    const C = await import('/js/ui/statistics/components.js'), H = await import('/js/ui/statistics/helpers.js');
    const L = await import('/js/data/loaderList.js');
    const e = { id: 996719, name: 'Critiques', type: 'sbire', side: 'A', awakening: 3,
      level: { current: 30, max: 250 }, attacks: ['autoAttack'], stuff: {},
      baseStats: { HP: 1000, agility: 25, criticalPower: 50, criticalChance: 7 } };
    E.recomputeEntityStats(e, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
    E.entites.splice(0, E.entites.length, e);
    G.setAdminMode(false); window.levelRunning = 'worldmap';
    const host = document.createElement('main');
    host.className = 'codex-entity-scan codex-attack-stat-block';
    host.style.cssText = 'position:fixed;inset:0;padding:60px;background:#080b10;overflow:auto';
    document.getElementById('game-shell').append(host);
    const resources = [...L.collectLevelResources()];
    await Promise.all(['power', 'umbra', 'physic', 'magic', 'piercing', 'hybrid', 'cinetic', 'spectral', 'prismatic'].map(async kind => {
      const file = `picto-crit-${kind}.svg`;
      if (!resources.some(path => path.endsWith('/' + file))) throw Error('Missing preloaded critical icon: ' + file);
      const image = new Image(); image.src = `/media/assets/ui/${file}`; await image.decode();
    }));
    window.criticalHelperAudit = { show(key) {
      H.closeOpenHelpers(); host.replaceChildren();
      if (key === 'criticalPower') C.createUmbraBlock(host, 'Puissance critique', () => e.stats[key], e, key);
      let row = host.querySelector('.stat-container');
      if (!row) {
        row = document.createElement('div'); row.className = 'stat-container';
        row.dataset.stat = key; row.dataset.hover = 'true'; row.dataset.autonomousHelper = 'true';
        row.textContent = 'Chance de critique'; host.append(row);
      }
      H.bindHelperEntity(row, e); row.click();
    } };
  });
  const card = page.locator('[data-umbra-pinned="true"]:not([data-umbra-detail])');
    await page.evaluate(() => criticalHelperAudit.show('criticalPower'));
    await card.waitFor({ state: 'visible' });
    assert.match(await card.locator('.umbra-role').innerText(), /Les coups critiques améliorent grandement les effets des attaques\. Voir dans chaque attaque\./);
    assert.ok(await card.locator('.picto-stat.criticalPower').first().evaluate(node => getComputedStyle(node).backgroundImage.includes('picto-crit-umbra.svg')));
    await page.evaluate(() => criticalHelperAudit.show('criticalChance'));
    await card.waitFor({ state: 'visible' });
    assert.match(await card.innerText(), /Permet à l’entité de réaliser des coups critiques/);
    const neutral = card.locator('.criticalHit[data-helper-picto-stat]').first();
    assert.ok(await neutral.evaluate(node => getComputedStyle(node).backgroundImage.includes('picto-crit-power.svg')));
    await neutral.click();
    const detail = page.locator('[data-umbra-detail]');
    await detail.waitFor({ state: 'visible' });
    assert.equal(await detail.count(), 1);
    assert.match(await detail.innerText(), /Coup critique[\s\S]*Les coups critiques améliorent grandement les effets des attaques/);
    assert.doesNotMatch(await detail.innerText(), /undefined|NaN/);
    await page.waitForFunction(() => [...document.querySelectorAll('.stat-hover')].every(node => Number(getComputedStyle(node).opacity) >= .99));
    await page.screenshot({ path: resolve(output, `neutral-helper-${width}.png`) });
    assert.ok(await detail.evaluate(node => node.scrollWidth <= node.clientWidth + 1));
    await page.keyboard.press('Escape');
    assert.equal(await detail.count(), 0);
    assert.equal(await card.count(), 1);
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log('PASS critical helpers: distinct Umbra/neutral icons, requested descriptions, nested helper, nine preloaded SVGs, desktop/mobile and dismissal.');
} finally { await browser.close(); await new Promise(done => server.close(done)); }
