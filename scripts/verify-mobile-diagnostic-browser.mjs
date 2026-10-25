import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium, webkit, devices } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/Utilisateur/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
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
  for (const engine of ['chromium', 'webkit']) {
    const browser = engine === 'webkit' ? await webkit.launch({ headless: true })
      : await chromium.launch({ headless: true, channel: 'msedge' });
    try {
      for (const scenario of ['normal', 'module-failure', 'runtime-failure', 'hidden-game', 'javascript-disabled']) {
        const context = await browser.newContext({ ...devices['Pixel 7'], defaultBrowserType: undefined,
          javaScriptEnabled: scenario !== 'javascript-disabled' });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        if (scenario === 'module-failure') await page.route('**/js/GameInit.js', route => route.abort());
        await page.goto(`http://127.0.0.1:${server.address().port}/mobile-diagnostic.html`, { waitUntil: 'load' });
        const panel = page.locator('#startup-diagnostic');
        if (scenario === 'normal') {
          await page.waitForFunction(() => document.getElementById('startup-diagnostic').dataset.gameStatus === 'ready');
          assert.equal(await panel.getAttribute('data-error-count'), '0');
          assert.deepEqual(errors, []);
        } else if (scenario === 'module-failure') {
          await page.waitForFunction(() => Number(document.getElementById('startup-diagnostic').dataset.errorCount) > 0);
          assert.equal(await panel.getAttribute('data-game-status'), 'missing');
          assert.match(await panel.innerText(), /RESSOURCE NON CHARGEE[\s\S]*GameInit\.js/);
        } else if (scenario === 'runtime-failure') {
          await page.evaluate(() => {
            setTimeout(() => { throw new Error('Diagnostic runtime probe'); }, 0);
            Promise.reject(new Error('Diagnostic async probe'));
          });
          await page.waitForFunction(() => Number(document.getElementById('startup-diagnostic').dataset.errorCount) >= 2);
          assert.match(await panel.innerText(), /Diagnostic runtime probe/);
          assert.match(await panel.innerText(), /Diagnostic async probe/);
        } else if (scenario === 'hidden-game') {
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
        await context.close();
      }
    } finally { await browser.close(); }
  }
  await writeFile('outputs/mobile-diagnostic/report.json', JSON.stringify(results, null, 2));
  console.log(`PASS: ${results.length} startup diagnostic checks`);
} finally { server.close(); }
