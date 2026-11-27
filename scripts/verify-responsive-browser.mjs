import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, relative, sep } from 'node:path';
import { chromium, webkit } from 'playwright';

const root = resolve('docs');
const useWebKit = process.argv.includes('--webkit');
const profileFilter = process.argv.find(arg => arg.startsWith('--profile='))?.slice(10);
const output = resolve(`outputs/responsive${useWebKit ? '-webkit' : ''}`);
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = resolve(root, '.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname));
  const rel = relative(root, file);
  if (rel === '..' || rel.startsWith('..' + sep)) return res.writeHead(403).end();
  try {
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await mkdir(output, { recursive: true });
await new Promise(done => server.listen(0, '127.0.0.1', done));
let browser;
let activePage;
const reports = [];
try {
  browser = useWebKit ? await webkit.launch({ headless: true })
    : await chromium.launch({ channel: 'chrome', headless: true });
  for (const [name, width, height, mobile = true] of [
    ['desktop', 1440, 900, false], ['small-landscape', 568, 320],
    ['iphone-landscape', 844, 390], ['android-landscape', 915, 412],
    ['wide-landscape', 956, 440], ['browser-bars', 915, 300],
    ['tablet', 1024, 768], ['portrait', 390, 844],
  ]) {
    if (profileFilter && !profileFilter.split(',').includes(name)) continue;
    const context = await browser.newContext({ viewport: { width, height }, isMobile: mobile,
      hasTouch: mobile, deviceScaleFactor: mobile ? 3 : 1 });
    // Device emulation must not switch the host's desktop fullscreen resolution.
    await context.addInitScript(() => {
      Element.prototype.requestFullscreen = async () => { throw new DOMException('Test browser refuses fullscreen', 'NotAllowedError'); };
    });
    const page = await context.newPage();
    activePage = page;
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const paint = () => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
    const activate = locator => mobile ? locator.tap() : locator.click();
    const layout = () => page.evaluate(() => {
      const game = document.getElementById('game-windows');
      const rect = game.getBoundingClientRect().toJSON();
      const root = document.documentElement;
      const view = visualViewport;
      return { rect, width: root.clientWidth, height: root.clientHeight,
        innerWidth, innerHeight, scrollWidth: root.scrollWidth, scrollHeight: root.scrollHeight,
        bodyWidth: document.body.clientWidth, bodyHeight: document.body.clientHeight,
        visible: { width: view.width, height: view.height },
        rotated: document.getElementById('game-shell').dataset.rotated === 'true',
        shells: document.querySelectorAll('#game-shell').length,
        windows: document.querySelectorAll('#game-windows').length,
        menus: document.querySelectorAll('#game-shell > .master-menu').length };
    });
    const assertWindow = async label => {
      await paint();
      const result = await layout();
      const { rect, width, height } = result;
      assert.equal(result.shells, 1, `${label}: one responsive parent`);
      assert.equal(await page.locator('#game-landscape-gate').count(), 0, 'No orientation gate or button');
      assert.equal(result.windows, 1, `${label}: one game window`);
      assert.equal(result.menus, 1, `${label}: one settings host`);
      assert.equal(result.innerWidth, width, `${label}: no phantom desktop viewport`);
      assert.equal(result.bodyWidth, width, `${label}: page follows device width`);
      assert.equal(result.scrollWidth, width, `${label}: no horizontal page scrolling`);
      assert.equal(result.scrollHeight, height, `${label}: no vertical page scrolling`);
      assert.ok(rect.left >= -1 && rect.top >= -1 && rect.right <= width + 1 && rect.bottom <= height + 1, `${label}: whole game fits`);
      assert.ok(Math.abs(rect.width / rect.height - (result.rotated ? 676 / 1536 : 1536 / 676)) < .001, `${label}: same landscape composition`);
      assert.ok(Math.abs(rect.left - (width - rect.width) / 2) < 1 && Math.abs(rect.top - (height - rect.height) / 2) < 1, `${label}: centered game`);
      assert.ok(Math.abs(rect.width - width) < 1 || Math.abs(rect.height - height) < 1, `${label}: largest fitting game`);
      return result;
    };
    const assertFitsGame = async selector => {
      const fits = await page.locator(selector).first().evaluate(node => {
        const rect = node.getBoundingClientRect(), game = document.getElementById('game-windows').getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.left >= game.left - 1 && rect.right <= game.right + 1
          && rect.top >= game.top - 1 && rect.bottom <= game.bottom + 1;
      });
      assert.ok(fits, `${name}: ${selector} remains inside the game`);
    };
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'load' });
    await page.waitForFunction(() => Number(getComputedStyle(document.getElementById('game-windows')).opacity) >= .99);
    const initial = await assertWindow(name);
    assert.equal(await page.locator('#game-windows').evaluate(node => node.inert), false, 'Every orientation is interactive');
    await page.screenshot({ path: resolve(output, `${name}-automatic-landscape.png`), scale: 'css' });
    await activate(page.locator('.entity-loot').first());
    await activate(page.locator('.starter-select-button:not([hidden])'));
    await page.locator('.entitylootContainer').waitFor({ state: 'detached' });
    await activate(page.locator('.settings-icon'));
    await assertFitsGame('.settings-menu');
    await activate(page.locator('.settings-menu-close'));
    await activate(page.locator('.player-inventory-icon'));
    await assertFitsGame('.inventory-interface');
    await page.evaluate(async () => (await import('/js/ui/application.js')).closeStagePlayerMenus());
    await activate(page.locator('.battle-book-icon'));
    await assertFitsGame('.battle-book-window');
    await activate(page.locator('#close-battle-book-button'));
    await activate(page.locator('.army-codex-icon'));
    await activate(page.locator('.codex-entity-list').first());
    await assertFitsGame('.codex-entity-scan');
    // Compare the real profile's logical columns across device sizes, not only its outer bounds.
    const profile = await page.evaluate(() => {
      const node = document.querySelector('.codex-profile-main-grid');
      return node ? getComputedStyle(node).gridTemplateColumns.split(' ').length : 0;
    });
    assert.ok(profile > 1, `${name}: Codex retains its landscape columns`);
    await page.screenshot({ path: resolve(output, `${name}-codex.png`), scale: 'css' });
    if (name === 'android-landscape') {
      for (const viewport of [{ width: 412, height: 915 }, { width: 915, height: 300 }, { width: 915, height: 412 }]) {
        await page.setViewportSize(viewport);
        await assertWindow(`${name}/${viewport.width}x${viewport.height}`);
        await assertFitsGame('.codex-entity-scan');
        assert.equal(await page.locator('.codex-entity-scan').isVisible(), true, 'Rotation preserves the open menu');

      }
      const safeArea = await page.evaluate(async () => {
        const root = document.documentElement;
        for (const [side, value] of Object.entries({ left: 44, right: 20, top: 0, bottom: 21 })) root.style.setProperty(`--game-safe-${side}`, `${value}px`);
        window.dispatchEvent(new Event('resize'));
        await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
        return document.getElementById('game-windows').getBoundingClientRect().toJSON();
      });
      assert.ok(safeArea.left >= 44 && safeArea.right <= 895 && safeArea.bottom <= 391, 'Notch and home indicator remain clear');
      const visibleResize = await page.evaluate(async () => {
        for (const side of ['left', 'right', 'top', 'bottom']) document.documentElement.style.removeProperty(`--game-safe-${side}`);
        Object.defineProperty(visualViewport, 'height', { configurable: true, value: 280 });
        Object.defineProperty(visualViewport, 'offsetTop', { configurable: true, value: 12 });
        visualViewport.dispatchEvent(new Event('resize'));
        await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
        return document.getElementById('game-windows').getBoundingClientRect().toJSON();
      });
      assert.ok(visibleResize.top >= 12 && visibleResize.bottom <= 293, 'Visual viewport resize alone keeps the game visible');
      await page.evaluate(() => { delete visualViewport.height; delete visualViewport.offsetTop; visualViewport.dispatchEvent(new Event('resize')); });
      await assertWindow('Restored visual viewport');
      const pinchZoom = await page.evaluate(async () => {
        const before = document.documentElement.style.getPropertyValue('--game-scale');
        for (const [key, value] of Object.entries({ width: 457.5, height: 206, scale: 2, offsetLeft: 100, offsetTop: 50 })) {
          Object.defineProperty(visualViewport, key, { configurable: true, value });
        }
        visualViewport.dispatchEvent(new Event('resize'));
        await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
        const after = document.documentElement.style.getPropertyValue('--game-scale');
        for (const key of ['width', 'height', 'scale', 'offsetLeft', 'offsetTop']) delete visualViewport[key];
        visualViewport.dispatchEvent(new Event('resize'));
        return { before, after };
      });
      assert.equal(pinchZoom.after, pinchZoom.before, 'Browser pinch zoom is not cancelled by game scaling');
      await assertWindow('Restored zoom');
      const writes = await page.evaluate(async () => {
        const records = [];
        const observer = new MutationObserver(batch => records.push(...batch));
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
        for (let i = 0; i < 20; i++) { dispatchEvent(new Event('resize')); visualViewport.dispatchEvent(new Event('resize')); }
        await new Promise(done => setTimeout(done, 150));
        observer.disconnect(); return records.length;
      });
      assert.equal(writes, 0, 'Unchanged viewport events do not rewrite layout');
      await page.evaluate(async () => {
        const ui = await import('/js/ui/application.js');
        ui.createGameContainer(); ui.GameUi(); ui.initializePlayerMenus();
      });
      await assertWindow('Repeated game initialization');
      await page.evaluate(async () => { (await import('/js/app/state.js')).restoreRunningBattle(); dispatchEvent(new Event('battleStarted')); });
      const runningBefore = await page.evaluate(async () => !(await import('/js/combat/clock.js')).isCombatPaused());
      await page.setViewportSize({ width: 412, height: 915 });
      await assertWindow('Active game rotated to portrait');
      await assertFitsGame('#combat-pause-control');
      assert.equal(await page.evaluate(async () => !(await import('/js/combat/clock.js')).isCombatPaused()), runningBefore,
        'Rotation does not change combat state');
      await page.setViewportSize({ width: 915, height: 412 });
      await assertWindow('Active game rotated back to landscape');

    }
    assert.deepEqual(errors, [], `${name}: runtime errors`);
    reports.push({ name, initial, profile, errors });
    console.log(`PASS: ${name} — one viewport; starter, settings, inventory, journal and Codex usable`);
    await context.close();
  }
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({ path: resolve(output, 'failure.png'), scale: 'css' });
    console.error(await activePage.evaluate(() => ({ viewport: [innerWidth, innerHeight],
      menus: [...document.querySelectorAll('.codex-entity-list, .codex-entity-scan, .army-codex-list')].map(node => ({
        class: node.className, bounds: node.getBoundingClientRect().toJSON(), text: node.textContent.slice(0, 100) })) })));
  }
  throw error;
} finally {
  await writeFile(resolve(output, profileFilter ? `report-${profileFilter.replaceAll(',', '-')}.json` : 'report.json'), JSON.stringify(reports, null, 2));
  await browser?.close();
  await new Promise(done => server.close(done));
}
