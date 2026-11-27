import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createServer } from 'node:http';
import { chromium } from 'playwright';

const root = resolve('docs'), output = resolve(process.env.FOLLOWER_OUTPUT || 'outputs/follower-registration');
const baseline = process.env.FOLLOWER_BASELINE && resolve(process.env.FOLLOWER_BASELINE);
const maxLaunchReads = Number(process.env.FOLLOWER_MAX_READS || 2);
assert.ok(Number.isInteger(maxLaunchReads) && maxLaunchReads >= 1 && maxLaunchReads <= 2);
let variant = 'current';
await fs.mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = resolve(root, '.' + (path === '/' ? '/index.html' : path));
  if (!file.startsWith(root + sep)) return res.writeHead(403).end();
  try {
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
      '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream');
    let bytes = await fs.readFile(variant === 'baseline' && path.startsWith('/js/') ? resolve(baseline, '.' + path) : file);
    if (path === '/js/rendering/animations.js') {
      bytes = bytes.toString().replace('cachedTargetY = targetRect.top + targetRect.height / 2;',
        'cachedTargetY = targetRect.top + targetRect.height / 2; globalThis.__followerPositions?.push({ id: projectileId, x: cachedTargetX, y: cachedTargetY });');
    }
    res.end(bytes);
  } catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
let browser;
const report = [];
try {
  browser = await chromium.launch({ channel: process.env.VERIFY_BROWSER || 'chrome', headless: true });
  for (const count of [10, 40, 80]) {
    const trials = {};
    for (variant of baseline ? ['baseline', 'current'] : ['current']) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      await page.locator('#game-container').waitFor({ state: 'attached' });
      trials[variant] = await page.evaluate(async count => {
        const A = await import('/js/rendering/animations.js'), C = await import('/js/combat/clock.js');
        C.clearCombatClock(); C.freezeCombatClock();
        document.getElementById('game-windows').style.display = 'none';
        const host = document.createElement('div');
        host.style.cssText = 'position:fixed;inset:0';
        host.innerHTML = '<div id="sbire_998001" style="position:absolute;left:100px;top:200px;width:24px;height:24px"></div>'
          + '<div id="sbire_998002" style="position:absolute;left:900px;top:200px;width:24px;height:24px"></div>';
        document.body.append(host);
        const source = { id: 998001, type: 'sbire' }, target = { id: 998002, type: 'sbire' };
        const node = host.lastElementChild, nativeRect = node.getBoundingClientRect.bind(node);
        let reads = 0, hits = 0;
        node.getBoundingClientRect = () => { reads++; return nativeRect(); };
        const flights = Array.from({ length: count }, (_, i) => A.animationProjectile(source, target,
          () => { hits++; return 'hit'; }, { id: 'follower-test-' + i, executionTime: 1000, attacknature: ['magicalDamage'] }));
        const launchReads = reads;
        const initial = [...document.querySelectorAll('[id^="follower-test-"]')].map(e => ({
          id: e.id, style: e.style.cssText, classes: e.className, child: e.firstElementChild.outerHTML }));
        node.style.left = '700px';
        const { screenEffectRect } = await import('/js/ui/viewport.js');
        const expectedRect = screenEffectRect(nativeRect());
        const expectedPosition = { x: expectedRect.left + expectedRect.width / 2, y: expectedRect.top + expectedRect.height / 2 };
        window.__followerPositions = [];
        const followers = A.notifyAllProjectileTargetsMoved(), movementReads = reads - launchReads;
        const positions = window.__followerPositions; delete window.__followerPositions;
        A.clearProjectileEffects([source, target]);
        C.resumeCombatClock();
        const results = await Promise.all(flights);
        const afterCleanup = A.notifyAllProjectileTargetsMoved();
        return { launchReads, movementReads, followers, positions, expectedPosition, afterCleanup, initial, hits, results,
          remaining: document.querySelectorAll('[id^="follower-test-"]').length };
      }, count);
      assert.deepEqual(errors, []);
      const trial = trials[variant];
      const budget = variant === 'baseline' ? 2 : maxLaunchReads;
      assert.ok(trial.launchReads >= count && trial.launchReads <= count * budget, 'Launch geometry read budget exceeded');
      assert.equal(trial.movementReads, variant === 'baseline' ? count : 1, 'Movement shares one native position read');
      assert.equal(trial.positions.length, count, 'Every follower receives its position immediately');
      assert.equal(new Set(trial.positions.map(position => position.id)).size, count);
      for (const { x, y } of trial.positions) assert.deepEqual({ x, y }, trial.expectedPosition, 'Every follower receives the moved target coordinates');
      assert.equal(trial.followers, count); assert.equal(trial.afterCleanup, 0);
      assert.equal(trial.hits, 0); assert.equal(trial.remaining, 0);
      assert.equal(trial.results.length, count); assert.ok(trial.results.every(result => result === 'removed'));
      await context.close();
    }
    if (baseline) assert.deepEqual(trials.current.initial, trials.baseline.initial, 'Initial projectile visuals changed');
    report.push({ count, trials });
    console.log('PASS', count, 'launch reads, initial visuals, movement refresh and cleanup');
  }
  await fs.writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
} finally { await browser?.close(); await new Promise(done => server.close(done)); }
