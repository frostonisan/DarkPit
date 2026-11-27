import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright';

const output = resolve(process.env.RENDER_COST_OUTPUT || 'outputs/combat-render-costs');
const baseline = process.env.RENDER_COST_BASELINE && resolve(process.env.RENDER_COST_BASELINE);
let root = resolve('docs');
const server = createServer(async (req, res) => {
  const file = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!file.startsWith(root + sep)) return res.writeHead(403).end();
  try {
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await mkdir(output, { recursive: true });
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = {};
try {
  for (const previous of baseline ? [true, false] : [false]) {
    root = previous ? baseline : resolve('docs');
    const page = await browser.newPage(), errors = [], messages = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.text().startsWith('render-cost-')) messages.push(message.text()); });
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
    await page.locator('#game-container').waitFor({ state: 'attached' });
    const result = await page.evaluate(async previous => {
      if (!previous && !window.DarkPitLogs) throw Error('Log control is not loaded by game startup');
      await import('/js/debug/logger.js');
      const HUD = await import('/js/rendering/hud.js');
      const FX = await import('/js/rendering/animations.js');
      const batch = await import('/js/rendering/displayBatch.js');
      const clock = await import('/js/combat/clock.js');
      const game = await import('/js/app/state.js');
      const host = document.createElement('div'); host.dataset.renderCostProbe = 'true';
      host.style.cssText = 'position:fixed;top:0;left:0;width:200px;'; document.body.append(host);
      const entity = { id: 99981121, stats: { shift: { current: 0, max: 3, trailer: { success: true } } } };
      host.innerHTML = ['atbFill_', 'HUATBfill_', 'scanATBFill_'].map((p, i) =>
        `<div id="${p}${entity.id}" class="${['atb-fill', 'headsup-atb-fill', 'atb-scan-fill'][i]}" style="height:4px;width:50%"></div>`).join('')
        + `<div class="movement-counter" data-movement-entity-id="${entity.id}"></div>`.repeat(2);
      const bars = [...host.children].slice(0, 3), views = [], reads = {}, sequence = {};
      const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
      let reading = null;
      Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { ...descriptor, get() {
        if (reading && this.closest('[data-render-cost-probe]')) reads[reading]++;
        return descriptor.get.call(this);
      } });
      const measure = (name, fn) => {
        reads[name] = 0; reading = name;
        const start = clock.combatClockSequence();
        try { fn(); } finally { reading = null; sequence[name] = clock.combatClockSequence() - start; }
      };
      const animationView = node => node.getAnimations().map(a => ({ name: a.animationName, timing: a.effect.getTiming(), frames: a.effect.getKeyframes() }));
      // Compare actual CSS animations synchronously, with cleanup deadlines held.
      // Waiting on a loaded browser can otherwise let a 440 ms pulse expire.
      clock.freezeCombatClock();
      try {
        measure('firstPulse', () => FX.pulseTargetSearchAtb(entity, 'search'));
        const originals = bars.map(node => node.getAnimations()[0]);
        views.push({ name: 'first-pulse', html: host.innerHTML, animations: bars.map(animationView) });
        measure('restartPulse', () => FX.pulseTargetSearchAtb(entity, 'search'));
        if (bars.some((node, i) => node.getAnimations()[0] === originals[i])) throw Error('An active search pulse did not restart');
        views.push({ name: 'restarted-pulse', html: host.innerHTML, animations: bars.map(animationView) });
        HUD.updateMovementDisplay(entity, { animate: false });
        entity.stats.shift.current = 1;
        measure('movement', () => HUD.updateMovementDisplay(entity));
        views.push({ name: 'movement', html: host.innerHTML, animations: [...host.querySelectorAll('.current-shift.current')].map(animationView) });
        entity.stats.shift.current = 2;
        measure('refill', () => HUD.presentMovementRefill(entity, 1));
        views.push({ name: 'refill', html: host.innerHTML, animations: [...host.querySelectorAll('.current-shift.current')].map(animationView) });
      } finally { Object.defineProperty(HTMLElement.prototype, 'offsetWidth', descriptor); clock.resumeCombatClock(); }

      game.restoreRunningBattle();
      const probe = document.createElement('div'); probe.style.width = '50%'; host.append(probe);
      const supports = CSS.supports; let parses = 0;
      CSS.supports = function (...args) { parses++; return supports.apply(this, args); };
      try { for (let i = 0; i < 1000; i++) batch.setDisplayStyle(probe, 'width', '50%'); }
      finally { CSS.supports = supports; }
      batch.setDisplayStyle(probe, 'width', '42%'); batch.setDisplayText(probe, 'queued');
      clock.freezeCombatClock();
      batch.setDisplayStyle(probe, 'width', '33%'); batch.setDisplayText(probe, 'paused');
      if (probe.style.width !== '33%' || probe.textContent !== 'paused') throw Error('Pending values were not synchronized after the clock paused');
      clock.resumeCombatClock(); batch.discardCombatDisplay(); host.remove();
      window.DarkPitLogs.disable(); console.groupCollapsed('render-cost-disabled'); console.groupEnd();
      window.DarkPitLogs.enable(); console.groupCollapsed('render-cost-enabled'); console.groupEnd();
      window.DarkPitLogs.disable(); console.warn('render-cost-warning'); console.error('render-cost-error');
      return { views, reads, sequence, parses };
    }, previous);
    await page.waitForTimeout(50);
    results[previous ? 'before' : 'after'] = { ...result, messages };
    await writeFile(resolve(output, 'results.json'), JSON.stringify(results, null, 2));
    assert.deepEqual(errors, []);
    assert.ok(messages.includes('render-cost-enabled'));
    assert.ok(messages.includes('render-cost-warning') && messages.includes('render-cost-error'));
    if (!previous) {
      assert.ok(!messages.includes('render-cost-disabled'), 'Disabled diagnostic groups must not reach the console');
      assert.equal(result.parses, 0, 'Unchanged inline styles must not be parsed again');
      assert.deepEqual(result.reads, { firstPulse: 0, restartPulse: 1, movement: 0, refill: 0 });
      for (const view of result.views) for (const animations of view.animations) {
        assert.equal(animations.length, 1, `${view.name} still animates`);
        assert.equal(animations[0].timing.duration, view.name.includes('pulse') ? 440 : 500);
      }
      for (const enabled of [true, false]) {
        await page.goto(`http://127.0.0.1:${server.address().port}/index.html?debugLogs=${enabled ? 1 : 0}`);
        await page.locator('#game-container').waitFor({ state: 'attached' });
        assert.equal(await page.evaluate(() => window.DarkPitLogs.isEnabled()), enabled, 'Query controls logging on startup');
      }
    }
    await page.close();
  }
  if (baseline) {
    assert.deepEqual(results.after.views, results.before.views, 'Animation keyframes, timing, classes and HTML remain identical');
    assert.deepEqual(results.after.sequence, results.before.sequence, 'Animation cleanup keeps the same combat clock schedule');
  }
  await writeFile(resolve(output, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ reads: results.after.reads, parses: results.after.parses, referenceCompared: Boolean(baseline) }));
} finally { await browser.close(); await new Promise(done => server.close(done)); }
