import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const output = resolve(process.env.READ_BATCH_OUTPUT || 'outputs/projectile-read-batch');
const baseline = process.env.READ_BATCH_BASELINE;
const server = createServer(async (req, res) => {
  if (req.url === '/') return res.end('<!doctype html><title>Projectile read batching</title>');
  try {
    const path = req.url === '/before.js' && baseline
      ? resolve(baseline, 'js/rendering/projectileGeometry.js')
      : req.url === '/after.js' ? resolve('docs/js/rendering/projectileGeometry.js') : null;
    if (!path) return res.writeHead(404).end();
    res.setHeader('Content-Type', 'text/javascript'); res.end(await fs.readFile(path));
  } catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
await fs.mkdir(output, { recursive: true });
const reports = [];
let browser;
try {
  browser = await chromium.launch({ channel: process.env.VERIFY_BROWSER || 'chrome', headless: true });
  for (const total of [10, 40, 80]) for (const variant of baseline ? ['before', 'after'] : ['after']) {
    const context = await browser.newContext(), page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate(async ({ total, variant }) => {
      window.geometry = await import(`/${variant}.js`);
      document.body.innerHTML = '<div id="game-shell"><div id="game-screen-effects"></div></div>';
      const host = document.getElementById('game-screen-effects');
      window.targets = []; window.overlays = []; window.releases = []; window.readOrder = [];
      for (let i = 0; i < total; i++) {
        const node = document.createElement('div');
        node.style.cssText = `position:absolute;left:${10+i*3}px;top:80px;width:20px;height:30px`;
        document.body.append(node); targets.push(node);
        const native = node.getBoundingClientRect.bind(node);
        node.getBoundingClientRect = () => { readOrder.push(i); return native(); };
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:absolute;left:0;top:0;width:4px;height:4px';
        host.append(overlay); overlays.push(overlay);
        releases.push(geometry.trackProjectileGeometry(overlay, () => targets[i]));
      }
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
    }, { total, variant });
    const cdp = await context.newCDPSession(page); await cdp.send('Performance.enable');
    const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
    const before = await metrics();
    const coordinates = await page.evaluate(async total => {
      const result = [];
      for (let frame = 1; frame <= 4; frame++) {
        await new Promise(requestAnimationFrame);
        const positions = [];
        for (let i = 0; i < total; i++) {
          const rect = geometry.readProjectileTargetRect(targets[i], frame);
          positions.push([rect.x, rect.y, rect.width, rect.height]);
          geometry.setProjectileTransform(overlays[i], `translateX(${frame*10+i}px)`);
        }
        result.push(positions);
      }
      return result;
    }, total);
    const after = await metrics();
    const behavior = await page.evaluate(({ total, optimized }) => {
      const check = (v, why) => { if (!v) throw Error(why); };
      const reads = readOrder.length;
      check(reads === total * 4, 'Exactly one read per target and frame');
      geometry.invalidateProjectileGeometry(); readOrder.length = 0;
      geometry.readProjectileTargetRect(targets[0], 5);
      check(readOrder.length === (optimized ? total : 1), 'Known targets are read before the first transform');
      targets[1].style.left = '333px';
      geometry.setProjectileTransform(overlays[0], 'translateX(444px)');
      check(geometry.readProjectileTargetRect(targets[1], 5).left === 333, 'An intervening real movement invalidates the batch');
      const old = targets[2], replacement = old.cloneNode(); old.replaceWith(replacement); targets[2] = replacement;
      replacement.style.left = '555px';
      check(geometry.readProjectileTargetRect(replacement, 5).left === 555, 'Replacement targets stay fresh');
      targets[3].remove();
      readOrder.length = 0; geometry.readProjectileTargetRect(targets[0], 6);
      check(!readOrder.includes(3), 'Detached targets are not prefetched');
      for (const release of releases) release();
      geometry.clearProjectileGeometry();
      return { reads, movement: 333, replacement: 555, detached: true };
    }, { total, optimized: variant === 'after' });
    assert.deepEqual(errors, []);
    reports.push({ total, variant, coordinates, behavior,
      styleRecalculations: after.RecalcStyleCount - before.RecalcStyleCount,
      layouts: after.LayoutCount - before.LayoutCount });
    await context.close();
    console.log('PASS', total, variant, reports.at(-1).styleRecalculations, 'style recalculations');
  }
  if (baseline) for (const total of [10, 40, 80]) {
    const before = reports.find(r => r.total === total && r.variant === 'before');
    const after = reports.find(r => r.total === total && r.variant === 'after');
    assert.deepEqual(after.coordinates, before.coordinates);
    assert.deepEqual(after.behavior, before.behavior);
    assert.ok(after.styleRecalculations < before.styleRecalculations, 'Grouped reads avoid interleaved style flushes');
  }
  await fs.writeFile(resolve(output, 'report.json'), JSON.stringify(reports, null, 2));
} finally { await browser?.close(); await new Promise(done => server.close(done)); }
