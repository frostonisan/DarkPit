import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('docs');
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const server = createServer(async (req, res) => {
  const path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (path !== root && !path.startsWith(root + '/') && !path.startsWith(root + '\\')) { res.writeHead(403).end(); return; }
  try { res.setHeader('Content-Type', mime[extname(path)] || 'text/html'); res.end(await readFile(path === root ? resolve(root, 'index.html') : path)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  for (const permanent of [false, true]) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let attempts = 0;
    await page.route('**/media/assets/effects/heal-green.gif', route => {
      attempts += 1;
      if (permanent || attempts === 1) return route.fulfill({ status: permanent ? 404 : 503, body: 'Unavailable' });
      return route.continue();
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const result = await page.evaluate(async () => {
      const { setAdminMode, isAdminMode } = await import("/js/storage/gameStorage.js");
      setAdminMode(true);
      if (!isAdminMode()) throw Error('Resource retry fixture requires authorized admin mode');
      window.levelRunning = 'admin';
      const { launchLevel } = await import("/js/app/stages.js");
      const loaded = await launchLevel({ biome: 'prison', difficulty: 1, levelId: 'resource-retry-test' });
      return {
        loaded,
        progress: document.getElementById('loadingProgressBar')?.style.width,
        message: document.querySelector('.loading-h2')?.textContent,
        retryControls: document.querySelectorAll('.loading-retry, .loading-resource-errors').length,
      };
    });
    assert.equal(result.loaded, true);
    assert.equal(result.progress, '100%');
    await page.locator('.loading-h2.loaded').waitFor();
    assert.equal(await page.locator('.loading-h2').textContent(), "Cliquer sur l'écran pour continuer");
    assert.equal(result.retryControls, 0);
    assert.equal(attempts, 2, 'A missing resource must be retried only once at the end');
    assert.deepEqual(errors, []);
    console.log(`PASS: ${permanent ? 'permanent 404 ignored' : 'temporary 503 recovered'} after ${attempts} attempts`);
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
