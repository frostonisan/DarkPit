import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium, webkit, devices } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = resolve('docs');
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  const file = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  try { res.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream'); res.end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
await mkdir('outputs/mobile-diagnostic', { recursive: true });
const results = [];
try {
  for (const engine of (process.env.MOBILE_ENGINES || 'chromium,webkit').split(',')) {
    const browser = engine === 'webkit' ? await webkit.launch({ headless: true })
      : await chromium.launch({ headless: true, channel: 'msedge' });
    try {
      let savedGame;
      for (const scenario of ['normal', 'invalid-army-config', 'invalid-unit-ids', 'invalid-army-json',
        'invalid-config-saved-army', 'module-failure', 'runtime-failure', 'hidden-game', 'javascript-disabled']) {
        const invalidConfig = scenario.startsWith('invalid-');
        const existingArmy = scenario === 'invalid-config-saved-army';
        const brokenConfig = scenario === 'invalid-army-json' ? '{"lordId":null,'
          : JSON.stringify({ lordId: null, unitIds: scenario === 'invalid-unit-ids' ? ['1', null] : {} });
        const context = await browser.newContext({ ...devices['Pixel 7 landscape'], defaultBrowserType: undefined,
          javaScriptEnabled: scenario !== 'javascript-disabled',
          ...(existingArmy ? { storageState: savedGame } : {}) });
        if (invalidConfig) await context.addInitScript(raw => {
          if (!sessionStorage.getItem('diagnostic-config-seeded')) {
            localStorage.setItem('armyAConfig', raw);
            localStorage.setItem('diagnostic-preserve', 'saved-data');
            sessionStorage.setItem('diagnostic-config-seeded', '1');
          }
        }, brokenConfig);
        await context.addInitScript(() => {
      Element.prototype.requestFullscreen = async () => { throw new DOMException('Test browser refuses fullscreen', 'NotAllowedError'); };
    });
    const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        if (scenario === 'module-failure') await page.route('**/js/app/startup.js', route => route.abort());
        await page.goto(`http://127.0.0.1:${server.address().port}/mobile-diagnostic.html`, { waitUntil: 'load' });
        const panel = page.locator('#startup-diagnostic');
        if (scenario === 'normal' || invalidConfig) {
          await page.waitForFunction(() => document.getElementById('startup-diagnostic').dataset.gameStatus === 'ready',
            null, { timeout: 10000 }).catch(error => {
              throw new Error(`${engine}/${scenario}: ${errors.join('; ') || error.message}`);
            });
          assert.equal(await panel.getAttribute('data-error-count'), '0');
          assert.deepEqual(errors, []);
          if (invalidConfig) {
            const stored = await page.evaluate(async () => {
              const { loadFromLocalStorage, saveToLocalStorage } = await import("/js/storage/gameStorage.js");
              const { entites } = await import("/js/entities/runtime.js");
              const fallback = loadFromLocalStorage('armyAConfig');
              const customFallback = loadFromLocalStorage('armyAConfig', { lordId: null, unitIds: [1] });
              let rejected = false;
              try { saveToLocalStorage('armyAConfig', { lordId: null, unitIds: ['1'] }); }
              catch (error) { rejected = error instanceof TypeError; }
              return { fallback, customFallback, rejected, entitiesReady: Array.isArray(entites),
                raw: localStorage.getItem('armyAConfig'), sentinel: localStorage.getItem('diagnostic-preserve'),
                army: JSON.parse(localStorage.getItem('selectedArmyA')) };
            });
            assert.deepEqual(stored.fallback.unitIds, [], 'Invalid configuration is not converted into unit IDs');
            assert.deepEqual(stored.customFallback.unitIds, [1], 'An explicit valid default is honored');
            assert.equal(stored.rejected, true, 'Writes still reject malformed IDs');
            assert.equal(stored.entitiesReady, true, 'Entity initialization completes without a cascading TDZ error');
            assert.equal(stored.raw, brokenConfig, 'Reading an invalid configuration does not overwrite it');
            assert.equal(stored.sentinel, 'saved-data', 'Unrelated storage is preserved');
            if (existingArmy) {
              const original = JSON.parse(savedGame.origins[0].localStorage.find(entry => entry.name === 'selectedArmyA').value);
              assert.deepEqual(stored.army, original, 'The existing army and its progression survive startup');
              assert.equal(await page.locator('.entitylootContainer').count(), 0, 'No replacement starter for an existing army');
            } else {
              assert.ok(await page.locator('.entity-loot').count() > 0, 'Starter selection remains available');
            }
            await page.reload({ waitUntil: 'load' });
            await page.waitForFunction(() => document.getElementById('startup-diagnostic').dataset.gameStatus === 'ready');
            assert.deepEqual(errors, [], 'Reload does not reintroduce the initialization failure');
            assert.equal(await panel.getAttribute('data-error-count'), '0');
            assert.equal(await page.evaluate(() => localStorage.getItem('armyAConfig')), brokenConfig);
          }
        } else if (scenario === 'module-failure') {
          await page.waitForFunction(() => Number(document.getElementById('startup-diagnostic').dataset.errorCount) > 0);
          assert.equal(await panel.getAttribute('data-game-status'), 'missing');
          assert.match(await panel.innerText(), /RESSOURCE NON CHARGEE[\s\S]*startup\.js/);
        } else if (scenario === 'runtime-failure') {
          await page.evaluate(() => {
            setTimeout(() => { throw new Error('Diagnostic runtime probe'); }, 0);
            Promise.reject(new Error('Diagnostic async probe'));
          });
          await page.waitForFunction(() => Number(document.getElementById('startup-diagnostic').dataset.errorCount) >= 2);
          assert.match(await panel.innerText(), /Diagnostic runtime probe/);
          assert.match(await panel.innerText(), /Diagnostic async probe/);
        } else if (scenario === 'hidden-game') {
          await page.locator('#game-windows').waitFor({ state: 'attached' });
          await page.evaluate(() => {
            const game = document.getElementById('game-windows');
            game.style.transition = 'none';
            game.style.opacity = '0';
          });
          await page.waitForFunction(() => document.getElementById('startup-diagnostic').dataset.gameStatus === 'hidden');
          assert.match(await panel.innerText(), /creee mais masquee/);
        } else {
          assert.equal(await page.locator('noscript').isVisible(), true);
          assert.equal(await page.locator('#game-windows').count(), 0);
        }
        assert.equal(await panel.isVisible(), true);
        if (scenario !== 'javascript-disabled') {
          const bounds = await panel.boundingBox();
          const width = await page.evaluate(() => document.documentElement.clientWidth);
          assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1, 'Report must fit the phone screen');
        }
        await page.screenshot({ path: `outputs/mobile-diagnostic/${engine}-${scenario}.png`, scale: 'css' });
        results.push({ engine, scenario, result: 'PASS' });
        console.log(`PASS ${engine}: ${scenario}`);
        if (scenario === 'normal') {
          // Build a real saved game rather than mocking the entity model.
          await panel.evaluate(node => { node.style.pointerEvents = 'none'; });
          await page.locator('.entity-loot').first().tap();
          await page.locator('.starter-select-button:not([hidden])').tap();
          await page.locator('.entitylootContainer').waitFor({ state: 'detached' });
          savedGame = await context.storageState();
        }
        await context.close();
      }
    } finally { await browser.close(); }
  }
  await writeFile('outputs/mobile-diagnostic/report.json', JSON.stringify(results, null, 2));
  console.log(`PASS: ${results.length} startup diagnostic checks`);
} finally { server.close(); }
