import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/Utilisateur/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = resolve('outputs/index-15-gifs');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.VISUAL_LAB_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1536, height: 1000 } });
const checks = [], errors = [], frames = {};
const check = (ok, label) => { assert.ok(ok, label); checks.push(label); };
page.on('pageerror', error => errors.push(error.message));
let server;
const openLab = async target => {
  await page.goto(target); await page.evaluate(() => visualLab.ready);
  await page.evaluate(() => {
    document.querySelector('[data-mode=messages]').click();
    document.getElementById('feed-freeze').click();
  });
};
const createProbe = () => page.evaluate(() => {
  // Move the real, already-triggered IMG nodes into a static, opaque test area.
  // This excludes sprite/overlay movement from the measured GIF pixel changes.
  const stage = document.createElement('div'); stage.id = 'gif-probe';
  stage.style.cssText = 'position:fixed;inset:0 auto auto 0;width:360px;height:180px;background:#223;z-index:2147483647;isolation:isolate';
  document.body.append(stage);
  const style = document.createElement('style');
  style.textContent = '#lab {visibility:hidden!important} #gif-probe img { all:initial!important;position:absolute!important;top:10px!important;width:160px!important;height:160px!important;object-fit:contain!important } #gif-probe img:first-child {left:10px!important} #gif-probe img:nth-child(2) {left:190px!important}';
  document.head.append(style);
});
const play = key => page.evaluate(async key => {
  visualLab.popups.clear();
  if (key === 'heal') visualLab.popups.emit(1, 'heal');
  else visualLab.procs.emit(1, key);
  const newer = document.querySelector('#new-world .lab-slot[data-index="1"] ' + (key === 'heal' ? '.lab-proc-gif' : '.lab-proc-burst img'));
  const legacy = document.querySelector('#old-world .lab-slot[data-index="1"] img[data-feed-legacy]');
  document.getElementById('gif-probe').replaceChildren(newer, legacy);
  await Promise.all([newer.decode(), legacy.decode()]);
}, key);
const sample = async () => {
  const hashes = [[], []];
  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(90);
    for (let column = 0; column < 2; column++) {
      const png = await page.screenshot({ clip: { x: 10 + column * 180, y: 10, width: 160, height: 160 } });
      hashes[column].push(createHash('sha256').update(png).digest('hex'));
    }
  }
  return hashes;
};
try {
  await openLab(pathToFileURL(resolve('docs/index-15.html')).href); await createProbe();
  await page.screenshot({ clip: { x: 0, y: 0, width: 360, height: 180 } });
  // Finite GIFs used to work once, then show only their final frame forever.
  // complete/naturalWidth are insufficient: compare actual rendered frames.
  const durations = { ambidextry: 990, esoterism: 880, execution: 570, resilience: 1610, transcendence: 3240, recovery: 1800, heal: 1260 };
  for (const [key, duration] of Object.entries(durations)) {
    await play(key);
    const initial = await sample();
    frames[key] = { initial };
    check(initial.every(sequence => new Set(sequence).size >= 3), key + ': first trigger animates in both scenes');
    await page.waitForTimeout(duration * 2 + 100);
    await play(key);
    const repeated = await sample();
    check(repeated.every(sequence => new Set(sequence).size >= 3), key + ': retrigger animates after the previous GIF has finished');
    frames[key] = { initial, repeated };
    console.log('GIF frames verified: ' + key);
  }
  // A later entity must get its own timeline while the first is still playing.
  await play('ambidextry'); await page.waitForTimeout(350);
  await page.evaluate(async () => {
    visualLab.procs.emit(2, 'ambidextry');
    const image = document.querySelector('#new-world .lab-slot[data-index="2"] .lab-proc-burst img');
    document.getElementById('gif-probe').lastElementChild.replaceWith(image);
    await image.decode();
  });
  const overlapping = await sample();
  check(overlapping.every(sequence => new Set(sequence).size >= 3) && overlapping[0].every((hash, i) => hash !== overlapping[1][i]), 'Overlapping entities animate at different GIF playback positions');
  await page.screenshot({ path: resolve(output, 'independent-playback.png'), clip: { x: 0, y: 0, width: 360, height: 180 } });

  await openLab(pathToFileURL(resolve('docs/index-15.html')).href);
  await page.evaluate(() => {
    document.getElementById('feed-freeze').click();
    const rate = document.getElementById('proc-rate'); rate.value = '20'; rate.dispatchEvent(new Event('input'));
    document.getElementById('proc-run').click();
  });
  await page.waitForTimeout(8000);
  const stress = await page.evaluate(() => {
    document.getElementById('proc-run').click();
    return { generated: visualLab.procs.inspect().generated, procs: document.querySelectorAll('.lab-proc-burst').length,
      legacy: document.querySelectorAll('[data-feed-legacy]').length };
  });
  check(stress.generated >= 400 && stress.procs <= 18 && stress.legacy <= 288, 'Sustained 20/s stream on six entities keeps active GIF nodes bounded');
  await page.waitForTimeout(3800);
  check(await page.locator('.lab-proc-burst, [data-feed-legacy]').count() === 0, 'Stopping the stream releases all remaining transient GIF nodes');
  await page.evaluate(() => document.getElementById('feed-freeze').click()); await createProbe();
  await play('ambidextry');
  check((await sample()).every(sequence => new Set(sequence).size >= 3), 'GIFs still replay after sustained traffic and complete cleanup');

  // Confirm that independent playback does not download the GIF on every proc.
  // Local HTTP only; the frame assertions above deliberately use file://.
  const root = resolve('docs'), requests = new Map();
  const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.gif': 'image/gif', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
  server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = resolve(root, '.' + pathname);
    if (!file.startsWith(root + sep)) { response.writeHead(403).end(); return; }
    try {
      const bytes = await readFile(file); requests.set(pathname, (requests.get(pathname) || 0) + 1);
      response.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': 'public, max-age=3600' }); response.end(bytes);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  await openLab(`http://127.0.0.1:${server.address().port}/index-15.html`);
  for (let batch = 0; batch < 4; batch++) {
    await page.evaluate(async () => {
      for (let i = 0; i < 100; i++) visualLab.procs.emit(i % 6, 'ambidextry');
      await Promise.all([...document.querySelectorAll('.lab-proc-burst img')].map(image => image.decode()));
    });
  }
  check(requests.get('/media/assets/effects/ambidextry.gif') === 1, '400 repeated procs reuse one GIF download');
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ checks, frames, overlapping, stress, errors }, null, 2));
  console.log(`PASS index-15 GIF playback: ${checks.length} checks; real frames, finished/repeated/overlapping GIFs, sustained load, shared download.`);
} catch (error) {
  await page.screenshot({ path: resolve(output, 'failure.png') }).catch(() => {});
  await writeFile(resolve(output, 'failure.json'), JSON.stringify({ message: error.message, checks, frames, errors }, null, 2));
  throw error;
} finally { await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); }
