import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { extname, relative, resolve, sep } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium, devices } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = resolve('docs');
const remoteUrl = process.argv.find(arg => arg.startsWith('--url='))?.slice(6);
const release = remoteUrl ? null : JSON.parse(await readFile('package.json', 'utf8'));
const expectedVersion = release && (release.gameVersion || release.version);
// Preview the local entry page with the files already uploaded to FTP; never writes to the server.
const previewIndex = process.argv.includes('--preview-index');
assert.ok(!previewIndex || remoteUrl, '--preview-index requires --url');
const output = resolve('outputs/ftp-diagnostic', remoteUrl ? (previewIndex ? 'remote-preview' : 'remote') : 'verified');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ttf': 'font/ttf' };
const server = createServer(async (req, res) => {
  let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (pathname.startsWith('/ftp-preview/')) pathname = pathname.slice('/ftp-preview'.length);
  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = resolve(root, '.' + pathname);
  const rel = relative(root, file);
  if (rel === '..' || rel.startsWith('..' + sep)) return res.writeHead(403).end();
  try {
    const content = await readFile(file);
    res.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.end(content);
  } catch { res.writeHead(404).end(); }
});
let browser;
try {
  await mkdir(output, { recursive: true });
  if (!remoteUrl) await new Promise(done => server.listen(0, '127.0.0.1', done));
  const base = remoteUrl || `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch({ headless: true, channel: process.env.VERIFY_BROWSER || 'chrome' });
  const cases = [
    ['desktop', base, { viewport: { width: 1440, height: 900 } }],
    ['mobile', base, { ...devices['Pixel 7 landscape'], defaultBrowserType: undefined }],
  ];
  if (!remoteUrl) cases.push(['subdirectory', new URL('ftp-preview/', base).href, { viewport: { width: 1440, height: 900 } }]);
  const reports = [];
  for (const [name, url, options] of cases) {
    const context = await browser.newContext(options);
    await context.addInitScript(() => {
      Element.prototype.requestFullscreen = async () => { throw new DOMException('Test browser refuses fullscreen', 'NotAllowedError'); };
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [], failedRequests = [];
    page.on('pageerror', error => errors.push(error.stack || error.message));
    page.on('requestfailed', request => failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
    page.on('response', response => {
      if (response.status() >= 400) failedRequests.push({ url: response.url(), status: response.status() });
    });
    if (previewIndex) {
      const body = await readFile(resolve(root, 'index.html'), 'utf8');
      await page.route(url, route => route.fulfill({ contentType: 'text/html', body }));
    }
    const report = { name, url, previewIndex, errors, failedRequests };
    reports.push(report);
    try {
      await page.goto(url, { waitUntil: 'load' });
      await page.waitForFunction(() => {
        const game = document.querySelector('#game-windows');
        return game && Number(getComputedStyle(game).opacity) >= 0.99;
      });
      await page.locator('.entity-loot').first().waitFor({ state: 'visible' });
      report.state = await page.evaluate(() => ({
        gameCount: document.querySelectorAll('#game-container').length,
        starterCount: document.querySelectorAll('.entity-loot').length,
        width: document.documentElement.clientWidth,
        height: document.documentElement.clientHeight,
        bounds: document.querySelector('#game-windows').getBoundingClientRect().toJSON(),
      }));
      assert.equal(report.state.gameCount, 1, 'The game must initialize once');
      assert.ok(report.state.bounds.width > 0 && report.state.bounds.height > 0, 'Game is visible');
      assert.ok(report.state.bounds.right <= report.state.width + 1 && report.state.bounds.bottom <= report.state.height + 1, 'Game fits the viewport');
      if (expectedVersion) {
        report.version = await page.locator('#game-version').textContent();
        assert.equal(report.version, `The Dark Pit v${expectedVersion}`, 'Startup displays the JavaScript release');
        assert.ok(await page.locator('#game-version').isVisible(), 'Release label is visible');
      }
      await page.screenshot({ path: resolve(output, `${name}.png`), scale: 'css' });
      await page.locator('.entity-loot').first().click();
      await page.locator('.starter-select-button:not([hidden])').click();
      await page.locator('.entitylootContainer').waitFor({ state: 'detached' });
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('selectedArmyA')).length), 1);
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => {
        const game = document.querySelector('#game-windows');
        return game && Number(getComputedStyle(game).opacity) >= 0.99
          && document.querySelectorAll('.level-button').length > 0;
      });
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('selectedArmyA')).length), 1);
      assert.equal(await page.locator('.entitylootContainer').count(), 0, 'Selection survives reload');
      if (expectedVersion) {
        assert.equal(await page.locator('#game-version').textContent(), `The Dark Pit v${expectedVersion}`, 'Release survives reload');
        assert.ok(await page.locator('#game-version').isVisible(), 'Release remains visible after reload');
      }
      report.selectionAndReload = true;
    } catch (error) { errors.push(error.message); }
    await writeFile(resolve(output, 'report.json'), JSON.stringify(reports, null, 2));
    console.log(`${name}: ${errors.length} errors, ${failedRequests.length} failed resources, selection/reload ${!!report.selectionAndReload}`);
    await context.close();
  }
  for (const report of reports) {
    assert.deepEqual(report.errors, [], `${report.name}: startup errors`);
    assert.deepEqual(report.failedRequests, [], `${report.name}: missing resources`);
    assert.ok(report.selectionAndReload, `${report.name}: selection/reload failed`);
  }
  console.log(`PASS: ${reports.length} startup profiles`);
} finally {
  await browser?.close();
  if (server.listening) await new Promise(done => server.close(done));
}
