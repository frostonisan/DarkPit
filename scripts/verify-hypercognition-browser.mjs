import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright';
import { dismissStarterForFixture } from './browser-test-fixture.mjs';
const root = resolve('docs'), output = resolve('outputs/hypercognition-2026-11-26/captures');
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  const file = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(root + sep)) return res.writeHead(403).end();
  try { res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream'); res.end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ channel: process.env.VERIFY_BROWSER || 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const mount = async () => {
    await dismissStarterForFixture(page);
    await page.evaluate(async () => {
      const E = await import('/js/entities/runtime.js'), Store = await import('/js/storage/gameStorage.js');
      const Cards = await import('/js/ui/codex/index.js'), Helpers = await import('/js/ui/statistics/helpers.js');
      window.levelRunning = 'worldmap'; Store.setAdminMode(true); (await import('/js/app/state.js')).refreshStageAccess();
      const e = { id: 998813, name: 'Hypercognition', type: 'sbire', side: 'A', awakening: 3, seuilUmbra: 150,
        level: 30, baseStats: { HP: 1000, hypercognition: 150, intelligence: 150, vigueur: 50, strength: 50, speed: 10000 }, attacks: ['autoAttack'], stuff: {} };
      E.recomputeEntityStats(e, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
      E.entites.splice(0, E.entites.length, e); Store.saveToLocalStorage('selectedArmyA', [e]);
      const host = document.createElement('main'); host.id = 'hypercognition-audit';
      host.style.cssText = 'position:fixed;inset:0;overflow:auto;background:#160d24'; document.getElementById('game-shell').append(host);
      Cards.createCodexEntityScan(e, host, `codex-entity_${e.id}`);
      window.audit = { e, host, open(key = 'hypercognition') {
        Helpers.closeOpenHelpers(); host.querySelector('.codex-inner-menu:has(.codex-stat)').click();
        host.querySelector('.section-content.stats [data-mode="umbra"]').click();
        [...host.querySelectorAll(`.stat-container[data-stat="${key}"]`)].find(n => n.getClientRects().length).click();
      } }; audit.open();
    });
  };
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`); await mount();
  const card = page.locator('[data-umbra-pinned="true"]:not([data-umbra-detail])');
  await card.waitFor({ state: 'visible' });
  assert.match(await card.innerText(), /567/); assert.match(await card.innerText(), /417/);
  assert.match(await card.locator('[data-umbra-capacity="hypercognitionEssences"]').innerText(), /10 MAX/);
  assert.equal(await card.locator('[data-umbra-passive]').count(), 0, 'No invented exclusive passive');
  const toggle = key => card.locator(`[data-umbra-detail-toggle="${key}"]`).first();
  const damageKey = 'hypercognitionBonus', essenceKey = 'hypercognitionEssences';
  assert.equal(await toggle(damageKey).getAttribute('aria-expanded'), 'false');
  await toggle(damageKey).click();
  assert.equal(await toggle(essenceKey).getAttribute('aria-expanded'), 'false');
  await page.evaluate(() => audit.open());
  assert.equal(await toggle(damageKey).getAttribute('aria-expanded'), 'true');
  await page.reload(); await mount();
  assert.equal(await toggle(damageKey).getAttribute('aria-expanded'), 'true', 'Individual opening survives reload');
  assert.equal(await toggle(essenceKey).getAttribute('aria-expanded'), 'false', 'Other calculation remains independent');
  await toggle(essenceKey).click();
  const formula = card.locator(`[data-umbra-calculation-details="${damageKey}"]`);
  assert.ok(await formula.locator('.intelligence').count());
  assert.match(await formula.innerText(), /1,85/);
  assert.match(await formula.innerText(), /0,925/);
  assert.match(await card.locator(`[data-umbra-calculation-details="${essenceKey}"]`).innerText(), /0,0667/);
  assert.equal(await formula.locator('.strength, .agility').count(), 0, 'Level three uses Intelligence only');
  await formula.locator('.picto-stat.intelligence').first().click();
  const detail = page.locator('[data-umbra-detail][data-helper-picto-subject="intelligence"]');
  await detail.waitFor({ state: 'visible' });
  assert.match(await detail.locator('.stat-hover-header').innerText(), /Attribut : Intelligence/);
  await page.keyboard.press('Escape');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 }); await page.mouse.move(1, 1); await page.waitForTimeout(1000);
    assert.ok(await card.evaluate(n => n.scrollWidth <= n.clientWidth + 2), 'No horizontal overflow');
    assert.ok(await card.locator('[data-umbra-inline-detail]').evaluateAll(nodes => nodes.length === 2 && nodes.every(n => {
      const row = n.closest('.umbra-effect-row'), heading = row.querySelector('.umbra-effect-heading');
      const box = n.getBoundingClientRect(), parent = row.getBoundingClientRect();
      return !n.hidden && box.top >= heading.getBoundingClientRect().bottom - 1
        && Math.abs(box.left + box.width / 2 - parent.left - parent.width / 2) < 2 && getComputedStyle(n).textAlign === 'center';
    })), 'Both calculations sit centered beneath their value');
    assert.doesNotMatch(await card.innerText(), /Détail (?:du|des) calcul/);
    assert.ok(await card.locator('.umbra-effect-name > [data-stat-state="X"]').first().evaluate(n => getComputedStyle(n).backgroundImage.includes('linear-gradient')));
    assert.ok(await card.locator('.umbra-effect-name.cognitiveGenerator > span:not(.picto-stat), .helper-figure > span:not(.picto-stat)').evaluateAll(nodes => nodes.every(n => getComputedStyle(n).backgroundImage === 'none')), 'Only X names have gradients');
    await card.screenshot({ path: resolve(output, `hypercognition-${width}.png`), animations: 'disabled' });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => audit.open('vigueur'));
  assert.equal(await card.locator('[data-umbra-detail-toggle]').first().getAttribute('aria-expanded'), 'false', 'Other Umbra preferences stay independent');
  await page.evaluate(() => audit.open()); await toggle(damageKey).click();
  await page.evaluate(() => audit.open());
  assert.equal(await toggle(damageKey).getAttribute('aria-expanded'), 'false', 'Closing is remembered');
  assert.equal(await toggle(essenceKey).getAttribute('aria-expanded'), 'true');
  await page.reload();
  const version = JSON.parse(await readFile('package.json', 'utf8')).gameVersion;
  assert.ok((await page.locator('#game-version').innerText()).includes(version));
  assert.deepEqual(errors, []);
  console.log('Hypercognition cards: engine values, MAX, independent preferences, centered calculations, Intelligence helper, desktop/mobile and version passed.');
} finally { await browser.close(); await new Promise(done => server.close(done)); }
