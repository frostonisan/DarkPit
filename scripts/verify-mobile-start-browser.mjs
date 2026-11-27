import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium, webkit, firefox, devices } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = resolve('docs');
const targetUrl = process.argv.find(argument => argument.startsWith('--url='))?.slice(6);
const substituteScale = process.argv.includes('--test-mobile-scale-fix');
const viewportBaseline = process.argv.includes('--viewport-baseline');
const profileFilter = process.argv.find(argument => argument.startsWith('--profile='))?.slice(10);
const useWebKit = process.argv.includes('--webkit');
const useFirefox = process.argv.includes('--firefox');
const output = (targetUrl ? 'outputs/mobile-start-remote' : 'outputs/mobile-start')
  + (substituteScale ? '-corrected' : '') + (useWebKit ? '-webkit' : '') + (useFirefox ? '-firefox' : '')
  + (viewportBaseline ? '-viewport-before' : '');
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  const path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (path !== root && !path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  try {
    const file = path === root ? resolve(root, 'index.html') : path;
    res.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = useWebKit ? await webkit.launch({ headless: true })
  : useFirefox ? await firefox.launch({ headless: true })
  : await chromium.launch({ headless: true, channel: 'msedge',
    args: ['--host-resolver-rules=MAP mobile.test 127.0.0.1', '--no-proxy-server', `--explicitly-allowed-ports=${server.address().port}`] });
const results = [];
try {
  await mkdir(output, { recursive: true });
  for (const [name, options, hostname = '127.0.0.1'] of [
    ['desktop', { viewport: { width: 1440, height: 900 } }],
    ['mobile-390', { ...devices['iPhone 13'], defaultBrowserType: undefined }],
    ['mobile-android', { ...devices['Pixel 7'], defaultBrowserType: undefined }],
    ['mobile-landscape', { ...devices['Pixel 7 landscape'], defaultBrowserType: undefined }],
    ['s25-landscape', { viewport: { width: 915, height: 412 }, screen: { width: 915, height: 412 },
      deviceScaleFactor: 3, isMobile: true, hasTouch: true }],
    ['s25-landscape-large', { viewport: { width: 956, height: 440 }, screen: { width: 956, height: 440 },
      deviceScaleFactor: 3, isMobile: true, hasTouch: true }],
    ['mobile-http', { ...devices['Pixel 7'], defaultBrowserType: undefined }, 'mobile.test'],
  ]) {
    if (profileFilter && name !== profileFilter) continue;
    if ((targetUrl || useWebKit || useFirefox) && name === 'mobile-http') continue;
    // Playwright's Firefox supports touch and viewport sizing, not mobile-layout emulation.
    const context = await browser.newContext(useFirefox ? { ...options, isMobile: false } : options);
    if (!targetUrl && !viewportBaseline) await context.addInitScript(() => {
      Element.prototype.requestFullscreen = async () => { throw new DOMException('Test browser refuses fullscreen', 'NotAllowedError'); };
    });
    const page = await context.newPage();
    const errors = [];
    const failedRequests = [];
    const cancelledImages = [];
    const consoleErrors = [];
    await page.addInitScript(() => {
      window.__testFrameRequests = 0;
      const frame = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = callback => { window.__testFrameRequests++; return frame(callback); };
    });
    if (viewportBaseline) {
      for (const [url, file] of [['/', 'index.html'], ['/css/style.css', 'style.css'],
        ['/js/ui/application.js', 'application.js'], ['/js/rendering/entities.js', 'entities.js']]) {
        await page.route(candidate => candidate.pathname === url, route => route.fulfill({
          path: resolve('outputs/mobile-landscape/before', file), contentType: mime[extname(file)],
        }));
      }
    }
    if (targetUrl && substituteScale) {
      await page.route(url => url.origin === new URL(targetUrl).origin && url.pathname === "/js/debug/admin.js", async route => {
        const response = await route.fetch();
        const source = await response.text();
        assert.ok(source.includes('const windowWidth = window.innerWidth;')
          && source.includes('const windowHeight = window.innerHeight;'), 'Remote scaling code changed');
        await route.fulfill({ response, body: source
          .replace('const windowWidth = window.innerWidth;', 'const windowWidth = document.documentElement.clientWidth;')
          .replace('const windowHeight = window.innerHeight;', 'const windowHeight = document.documentElement.clientHeight;') });
      });
    }
    page.on('pageerror', error => errors.push(error.stack || error.message));
    page.on('requestfailed', request => {
      const failure = { url: request.url(), failure: request.failure() };
      // WebKit may cancel a CSS image when its element is hidden or removed.
      if (request.resourceType() === 'image' && request.failure()?.errorText === 'Load request cancelled') {
        cancelledImages.push(failure);
      } else failedRequests.push(failure);
    });
    page.on('response', response => { if (response.status() >= 400) failedRequests.push({ url: response.url(), status: response.status() }); });
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    await page.goto(targetUrl || `http://${hostname}:${server.address().port}/`, { waitUntil: 'load' });
    await page.waitForFunction(() => {
      const game = document.querySelector('#game-windows');
      return game && Number(getComputedStyle(game).opacity) >= 0.99;
    }, null, { timeout: 15000 }).catch(error => errors.push(error.message));
    const state = await page.evaluate(() => ({
      viewport: { width: innerWidth, height: innerHeight },
      visible: { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight },
      secure: isSecureContext,
      screen: { width: screen.width, height: screen.height },
      text: document.body.innerText.slice(0, 1000),
      children: document.body.childElementCount,
      game: [...document.querySelectorAll('#game-windows, .Game-UI, .map-container, .level-button')].slice(0, 12).map(node => ({
        class: node.className, id: node.id, bounds: node.getBoundingClientRect().toJSON(),
        display: getComputedStyle(node).display, opacity: getComputedStyle(node).opacity,
      })),
    }));
    await page.screenshot({ path: `${output}/${name}.png`, scale: 'css' });
    results.push({ name, url: page.url(), state, errors, failedRequests, cancelledImages, consoleErrors });
    try {
      if (!state.game.some(node => node.id === 'game-windows')) throw Error('Game did not initialize');
      if (!viewportBaseline && !targetUrl) {
        // The logical game canvas fits inside one real device-sized viewport.
        assert.ok(Math.abs(state.visible.width - options.viewport.width) <= 1, 'Visible viewport matches the emulated device');
        assert.equal(await page.locator('#game-landscape-gate').count(), 0, 'Landscape is automatic without a gate');
        assert.equal(await page.locator('#game-windows').evaluate(node => node.inert), false, 'The landscape game is interactive');
      }
      const choose = page.locator('.entity-loot').first();
      if (options.hasTouch) await choose.tap();
      else await choose.click();
      const confirm = page.locator('.starter-select-button:not([hidden])');
      if (options.hasTouch) await confirm.tap();
      else await confirm.click();
      await page.locator('.entitylootContainer').waitFor({ state: 'detached' });
      const roster = await page.evaluate(() => JSON.parse(localStorage.getItem('selectedArmyA')));
      assert.equal(roster.length, 1, `${name}: starter selection not saved`);
      await page.waitForLoadState('networkidle');
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => {
        const game = document.querySelector('#game-windows');
        return game && Number(getComputedStyle(game).opacity) >= 0.99;
      });
      assert.equal(await page.locator('.entitylootContainer').count(), 0, `${name}: starter lost on reload`);
      results.at(-1).selectionAndReload = true;
      if (!viewportBaseline && !targetUrl && name === 's25-landscape') {
        const layouts = [];
        for (const viewport of [{ width: 915, height: 340 }, { width: 915, height: 412 }, { width: 956, height: 440 }]) {
          await page.setViewportSize(viewport);
          await page.waitForTimeout(100);
          const layout = await page.evaluate(() => ({ rect: document.querySelector('#game-windows').getBoundingClientRect().toJSON(),
            width: document.documentElement.clientWidth, height: document.documentElement.clientHeight }));
          assert.ok(layout.rect.left >= -1 && layout.rect.top >= -1 && layout.rect.right <= layout.width + 1 && layout.rect.bottom <= layout.height + 1);
          assert.ok(Math.abs(layout.rect.left - (layout.width - layout.rect.width) / 2) < 1
            && Math.abs(layout.rect.top - (layout.height - layout.rect.height) / 2) < 1, 'Logical game canvas stays centered in the viewport');
          assert.ok(Math.abs(layout.rect.width / layout.rect.height - 1536 / 676) < .01, 'Resize preserves the logical game aspect ratio');
          layouts.push(layout);
        }
        // No repeated transform rewrites after Chrome's bars finish resizing.
        const idleWrites = await page.evaluate(async () => {
          let count = 0;
          const observer = new MutationObserver(records => { count += records.length; });
          observer.observe(document.getElementById('game-windows'), { attributes: true, attributeFilter: ['style'] });
          for (let i = 0; i < 20; i++) window.dispatchEvent(new Event('resize'));
          await new Promise(done => setTimeout(done, 180));
          // Explicit resize events may write the transform; idle rendering must stop.
          observer.takeRecords(); count = 0;
          await new Promise(done => setTimeout(done, 180));
          count += observer.takeRecords().length; observer.disconnect(); return count;
        });
        assert.equal(idleWrites, 0);
        results.at(-1).layouts = layouts;
        results.at(-1).idleWrites = idleWrites;
      }
      if (!targetUrl && !useWebKit && !useFirefox && name === 's25-landscape') {
        const session = await context.newCDPSession(page);
        await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
        const bars = await page.evaluate(async () => {
          const E = await import('/js/entities/runtime.js');
          const R = await import('/js/rendering/entities.js');
          const H = await import('/js/rendering/hud.js');
          const template = (await import('/js/data/entityTemplates.js')).entitesNest.find(entity => entity.serial === 900013);
          const { getSafe } = await import('/js/entities/rules.js');
          const host = document.createElement('div'); host.id = 'timer-load-fixture';
          host.style.cssText = 'position:fixed;inset:0;z-index:10000001;background:#111;display:grid;grid-template-columns:repeat(8,1fr);gap:4px;padding:12px';
          document.body.append(host);
          const units = [];
          for (let i = 0; i < 80; i++) {
            const entity = E.enrichEntityStats({ ...structuredClone(template), id: 990000 + i, name: `Jauge ${i + 1}`, side: i % 2 ? 'B' : 'A',
              type: 'sbire', stats: {}, modifierStats: {}, stuff: {}, baseStats: { ...template.baseStats, speed: 2000, HP: 1000 } });
            const attack = { functionName: 'mobile-timer-test', displayName: 'Progression', preparationTime: 2000, executionTime: 600, recoveryTime: 600, attackRange: ['melee'] };
            Object.assign(entity, { currentPhase: 'attack_1', currentAttack: attack, currentAttackId: attack.functionName,
              attacks: [attack], isATBFull: false, speedTimer: 2000, preparationTime: 0, executionTime: 0, recoveryTime: 0 });
            E.entites.push(entity); units.push(entity);
            const row = document.createElement('div'); row.style.cssText = 'position:relative;min-width:0;font:11px Arial';
            row.textContent = entity.name;
            const atb = R.CreateATBEntity(entity); atb.style.cssText = 'position:relative;width:100%;height:6px';
            atb.firstElementChild.style.cssText = 'position:relative;width:100%;height:6px;margin:3px 0';
            row.append(atb);
            const attackHost = document.createElement('div'); attackHost.style.cssText = 'position:relative;width:100%;height:5px';
            attackHost.innerHTML = `<div class="attack-bar-fill" id="currentAttackBar_${entity.id}"></div>`;
            row.append(attackHost); host.append(row);
            R.createHeadUpInDom(entity.id);
          }
          await new Promise(done => setTimeout(done, 150));
          const frameStart = __testFrameRequests;
          await new Promise(done => setTimeout(done, 300));
          const idleFrameRequests = __testFrameRequests - frameStart;
          const samples = [];
          for (const percent of [10, 35, 60, 85]) {
            for (const entity of units) {
              entity.speedTimer = getSafe(entity, 'speed', 2000) * (1 - percent / 100); H.updateTimerDisplay(entity);
              // Preparation also writes an inline transition in the real engine.
              const attack = document.getElementById(`currentAttackBar_${entity.id}`);
              attack.style.transition = 'width 0.05s linear'; attack.style.width = `${percent}%`;
            }
            await new Promise(requestAnimationFrame);
            // Allow the current renderer's CSS width transitions to finish before measuring.
            await Promise.all(units.flatMap(entity => [document.getElementById(`atbFill_${entity.id}`), document.getElementById(`currentAttackBar_${entity.id}`)])
              .flatMap(node => node.getAnimations().map(animation => animation.finished.catch(() => {}))));
            samples.push(units.map(entity => {
              const atb = document.getElementById(`atbFill_${entity.id}`);
              const attack = document.getElementById(`currentAttackBar_${entity.id}`);
              const parentCSS = getComputedStyle(atb.parentElement);
              const trackWidth = atb.parentElement.getBoundingClientRect().width - parseFloat(parentCSS.borderLeftWidth) - parseFloat(parentCSS.borderRightWidth);
              return { expected: percent, painted: atb.getBoundingClientRect().width / trackWidth * 100,
                attackPainted: attack.getBoundingClientRect().width / attack.parentElement.getBoundingClientRect().width * 100,
                mirror: parseFloat(document.getElementById(`HUATBfill_${entity.id}`).style.width) };
            }));
            await new Promise(done => setTimeout(done, 50));
          }
          return { count: units.length, idleFrameRequests, samples };
        });
        results.at(-1).bars = bars;
        await page.screenshot({ path: `${output}/${name}-80-bars.png`, scale: 'css' });
        await session.send('Emulation.setCPUThrottlingRate', { rate: 1 });
        if (!viewportBaseline) {
          // This HTML renderer updates HUD mirrors with RAF. Keep its cost in the
          // report; functional parity below must hold after the width transitions.
          for (const sample of bars.samples.flat()) {
            assert.ok(Math.abs(sample.expected - sample.painted) < 1, `ATB ${sample.painted} must reflect ${sample.expected}`);
            assert.ok(Math.abs(sample.expected - sample.attackPainted) < 1, `Attack ${sample.attackPainted} must reflect ${sample.expected}`);
            assert.ok(Math.abs(sample.expected - sample.mirror) < 0.01, 'HUD mirror tracks the source');
          }
        }
      }
    } catch (error) { errors.push(error.message); }
    for (const url of new Set(cancelledImages.map(request => request.url))) {
      const response = await context.request.get(url);
      if (!response.ok()) failedRequests.push({ url, status: response.status() });
    }
    console.log(`${name}: ${errors.length} errors; game ${Math.round(state.game[0]?.bounds.width)}px / viewport ${state.visible.width}px; selection/reload ${!!results.at(-1).selectionAndReload}`);
    if (errors.length || failedRequests.length || consoleErrors.length) console.log(JSON.stringify({ errors, failedRequests, consoleErrors }));
    await writeFile(`${output}/report.json`, JSON.stringify(results, null, 2));
    await context.close();
  }
  await writeFile(`${output}/report.json`, JSON.stringify(results, null, 2));
  for (const result of results) {
    assert.equal(result.errors.length, 0, `${result.name}: ${result.errors.join('\n')}`);
    assert.equal(result.failedRequests.length, 0, `${result.name}: resource loading failed`);
    assert.ok(result.state.children > 0 && result.state.game.length > 0, `${result.name}: game missing`);
    assert.ok(result.state.text.length > 0, `${result.name}: empty screen`);
    const game = result.state.game.find(node => node.id === 'game-windows');
    assert.ok(game.bounds.width > 0 && game.bounds.height > 0
      && game.bounds.right <= result.state.visible.width + 1
      && game.bounds.bottom <= result.state.visible.height + 1,
    `${result.name}: game extends outside the visible viewport`);
  }
  console.log(`PASS: ${results.length} cold-start profiles`);
} finally {
  await browser.close();
  server.close();
}
