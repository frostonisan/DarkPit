import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium, webkit } from 'playwright';
import { createReplayBoard } from './combat-reference-fixture.mjs';

const root = resolve('docs'), useWebKit = process.argv.includes('--webkit');
const output = resolve(`outputs/responsive-combat${useWebKit ? '-webkit' : ''}`);
const reference = JSON.parse(await readFile('scripts/fixtures/combat-reference.json', 'utf8'));
const server = createServer(async (req, res) => {
  const file = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(root + sep)) return res.writeHead(403).end();
  try {
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await mkdir(output, { recursive: true });
await new Promise(done => server.listen(0, '127.0.0.1', done));
let browser;
const reports = [];
try {
  browser = await (useWebKit ? webkit.launch({ headless: true }) : chromium.launch({ channel: 'chrome', headless: true }));
  for (const total of [10, 40, 80]) {
    const context = await browser.newContext({ viewport: { width: 915, height: 412 }, isMobile: true, hasTouch: true });
    await context.addInitScript(() => {
      Element.prototype.requestFullscreen = async () => { throw new DOMException('Unavailable', 'NotAllowedError'); };
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
    await page.locator('#game-container').waitFor();
    // Seed a real player before entering the isolated admin fixture. Otherwise
    // leaving admin correctly returns to starter selection, which hides settings.
    await page.locator('.entity-loot').first().tap();
    await page.locator('.starter-select-button:not([hidden])').tap();
    await page.locator('.entitylootContainer').waitFor({ state: 'detached' });
    // The shared combat fixture clears body; retain the real release label for its new shell.
    await page.evaluate(() => { window.__version = document.getElementById('game-version'); });
    await page.evaluate(createReplayBoard, { reference, total });
    await page.evaluate(async () => {
      document.getElementById('game-shell').append(window.__version);
      const display = await import('/js/ui/display.js');
      await display.resetParallaxView({ force: true });
      display.LevelUi(); display.toggleScanEntityListener();
      dispatchEvent(new Event('battleStarted'));
    });
    await page.waitForTimeout(2300);
    const read = () => page.evaluate(async () => {
      const { overlayRect } = await import('/js/ui/viewport.js');
      const shell = document.getElementById('game-shell');
      const rect = shell.getBoundingClientRect().toJSON();
      const state = (await import('/js/entities/runtime.js')).entites.map(e => [e.id, e.position, e.stats.HP.current]);
      const geometry = Object.fromEntries(['#game-windows', '#game-container', '.board-global', '#hexGrid', '#responsive-effect-anchor'].map(selector => {
        const r = overlayRect(shell, document.querySelector(selector));
        return [selector, [r.left, r.top, r.width, r.height]];
      }));
      const escaped = [...document.querySelectorAll('.master-menu, .Game-helper, #combat-pause-control, .combat-attack-control-panel, #game-version')]
        .filter(node => !shell.contains(node)).map(node => node.id || node.className);
      return { rect, state, geometry, escaped, width: innerWidth, height: innerHeight,
        shells: document.querySelectorAll('#game-shell').length, gameWindows: document.querySelectorAll('#game-windows').length };
    });
    await page.locator('#combat-pause-control').tap();
    await page.waitForFunction(async () => {
      const p = await import('/js/combat/pause.js'), c = await import('/js/combat/clock.js');
      return c.isCombatPaused() && !p.isCombatCheckpointBusy();
    });
    await page.evaluate(async () => {
      const host = (await import('/js/ui/viewport.js')).screenEffectHost();
      const anchor = document.createElement('div'); anchor.id = 'responsive-effect-anchor';
      anchor.style.cssText = 'position:absolute;left:70px;top:80px;width:12px;height:10px;visibility:hidden';
      host.append(anchor);
    });
    const original = await read();
    for (const [name, width, height] of [['landscape', 915, 412], ['portrait', 412, 915], ['short-bars', 915, 300], ['restored', 915, 412]]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
      const effectCoordinates = await page.evaluate(async () => {
        const { screenEffectHost, screenEffectRect } = await import('/js/ui/viewport.js');
        const host = screenEffectHost();
        const probe = document.createElement('div');
        const p = screenEffectRect({ left: 100, top: 120, right: 112, bottom: 130, width: 12, height: 10 });
        probe.style.cssText = `position:absolute;left:${p.left}px;top:${p.top}px;width:${p.width}px;height:${p.height}px`;
        host.append(probe); const rect = probe.getBoundingClientRect().toJSON(); probe.remove(); return rect;
      });
      assert.ok(Math.abs(effectCoordinates.left - 100) < .1 && Math.abs(effectCoordinates.top - 120) < .1,
        'Screen effects retain their existing projectile coordinates inside the shell');
      const result = await read();
      assert.equal(result.shells, 1); assert.equal(result.gameWindows, 1);
      assert.deepEqual(result.state, original.state, 'Rotation preserves HP, position and entity identity');
      assert.deepEqual(result.escaped, [], 'UI belongs to the responsive parent');
      for (const [key, geometry] of Object.entries(result.geometry)) {
        geometry.forEach((value, i) => assert.ok(Math.abs(value - original.geometry[key][i]) < .1, `${total}/${name}: ${key} keeps its logical position`));
      }
      const { rect } = result;
      assert.ok(rect.left >= -1 && rect.top >= -1 && rect.right <= width + 1 && rect.bottom <= height + 1, 'Entire frame fits the screen');
      await page.locator('.settings-icon').tap();
      await page.locator('.settings-menu-close').tap();
      assert.ok(await page.evaluate(async () => (await import('/js/combat/clock.js')).isCombatPaused()), 'Rotation preserves the tactical pause');
      assert.ok(await page.evaluate(() => document.getElementById('game-shell').contains(document.getElementById('combat-pause-fx'))));
      await page.screenshot({ path: resolve(output, `${total}-${name}.png`), scale: 'css' });
      reports.push({ total, name, rect, unchangedState: true });
    }
    await page.locator('#combat-pause-control').tap();
    await page.waitForFunction(async () => !(await import('/js/combat/clock.js')).isCombatPaused());
    if (total === 40) {
      await page.evaluate(async () => (await import('/js/app/stages.js')).QuitCurrentLevel());
      await page.waitForFunction(() => !window.__QUIT_LEVEL_LOCK__ && document.querySelector('#game-shell #game-container .worldmap'));
      assert.equal(await page.locator('#game-version').count(), 1, 'Version survives returning to the map');
      assert.equal(await page.locator('#game-shell > .Game-helper').count(), 1);
      assert.equal(await page.locator('#game-shell > .master-menu').count(), 1);
      await page.locator('.settings-icon').tap(); await page.locator('.settings-menu-close').tap();
    }
    assert.deepEqual(errors, []);
    console.log(`PASS ${total}: landscape, automatic portrait, browser bars, touch settings/pause, unchanged combat state`);
    await context.close();
  }
} finally {
  await writeFile(resolve(output, 'report.json'), JSON.stringify(reports, null, 2));
  await browser?.close(); await new Promise(done => server.close(done));
}
