import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium, firefox } = require('playwright');
const root = resolve('docs'), output = resolve('outputs/combat-simulation-performance');
await mkdir(output, { recursive: true });
const reportPath = process.env.SIM_REPORT;
const referencePath = process.env.SIM_REFERENCE;
assert.ok(reportPath, 'Set SIM_REPORT to an HTML report exported by the combat simulator.');
assert.ok(process.env.SIM_BASELINE !== '1' || referencePath, 'Set SIM_REFERENCE when SIM_BASELINE=1.');
const html = await readFile(reportPath, 'utf8');
const saved = JSON.parse(html.match(/<script\b[^>]*id=["']simulation-data["'][^>]*>([\s\S]*?)<\/script>/i)[1]);
const reference = process.env.SIM_BASELINE === '1' ? await readFile(referencePath, 'utf8') : null;
let useReference = process.env.SIM_BASELINE === '1', delayed = false;
const server = createServer(async (req, res) => {
  const path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!path.startsWith(root + sep)) return res.writeHead(403).end();
  try {
    let data = await readFile(path);
    if (path === resolve(root, 'js/debug/simulationRuntime.js')) {
      let source = useReference ? reference : data.toString();
      // Emulate the browser's background timer clamp, without slowing virtual game timers.
      source = source.replace('export async function runSimulationTrial(input) {', `export async function runSimulationTrial(input) {
        const hostTimeout = window.setTimeout.bind(window);
        let nativeWaits = 0;
        window.setTimeout = (callback, delay, ...args) => {
          nativeWaits++;
          return hostTimeout(callback, ${delayed ? 'Math.max(1000, delay || 0)' : 'delay'}, ...args);
        };`);
      source = source.replace('timings.combatMs =', 'timings.nativeWaits = nativeWaits; timings.combatMs =');
      data = source;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml' })[extname(path)] || 'application/octet-stream');
    res.end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browserName = process.env.SIM_BROWSER || 'chrome';
const browser = await (browserName === 'firefox' ? firefox.launch({ headless: true })
  : chromium.launch({ channel: browserName === 'edge' ? 'msedge' : browserName, headless: true }));
try {
  const page = await browser.newPage({ viewport: saved.snapshot.viewport });
  page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
  await page.exposeFunction('benchmarkProgress', ({ completed, skipped, total }) => {
    if (completed + skipped > 0) console.log(`PROGRESS ${completed + skipped}/${total}: ${completed} completed, ${skipped} skipped`);
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.evaluate(async source => {
    const U = await import("/js/ui/application.js"), E = await import("/js/entities/runtime.js");
    const C = await import("/js/rendering/entities.js"), S = await import("/js/storage/gameStorage.js");
    const { balanceData } = await import('/js/data/balanceData.js');
    const merge = (target, values) => { for (const [key, value] of Object.entries(values)) {
      if (value && typeof value === 'object' && !Array.isArray(value) && target[key] && typeof target[key] === 'object') merge(target[key], value);
      else target[key] = value;
    } };
    merge(balanceData, source.balance);
    U.createGameContainer(); U.GameUi(); S.setAdminMode(true); window.levelRunning = 'admin';
    document.querySelector('.worldmap')?.remove();
    const grid = document.createElement('div'); grid.id = 'hexGrid';
    grid.style.cssText = 'position:absolute;top:150px;left:400px;width:700px;height:500px';
    document.getElementById('game-container').append(grid);
    E.entites.length = 0;
    for (const [index, original] of source.entities.entries()) {
      const entity = structuredClone(original);
      const hex = document.createElement('div'); hex.className = `hex Side${entity.side} occupied`;
      hex.dataset.position = entity.position;
      hex.style.cssText = `position:absolute;left:${index * 210}px;top:50px;width:180px;height:200px`;
      grid.append(hex); E.entites.push(entity);
      const created = C.createEntiteInDOM(entity); hex.append(created.element); await created.spriteReady;
    }
    window.Sim = await import("/js/debug/simulation.js");
    window.snapshot = Sim.captureSimulationBoard();
    window.boardBefore = JSON.stringify(E.entites, (key, value) => typeof value === 'function' || value instanceof Node ? undefined : value);
    window.storageBefore = JSON.stringify(Object.entries(localStorage));
  }, saved.snapshot);
  // The archived report supplies inputs; the live board uses today's stat catalog and rules.
  const capturedStats = await page.evaluate(() => snapshot.boardStats);
  const execute = async (label, count, seed) => {
    console.log(`START ${browserName} ${label}: ${count} fights`);
    const report = await page.evaluate(async ({ count, seed }) => Sim.runCombatSimulation(snapshot,
      { count, durationSeconds: 180, seed }, { onProgress: p => { if (p.completed + p.skipped > 0) window.benchmarkProgress({ completed: p.completed, skipped: p.skipped, total: p.total }); } }), { count, seed });
    await writeFile(resolve(output, `${browserName}-${label}.json`), JSON.stringify(report));
    console.log(JSON.stringify({ label, status: report.status, error: report.error, budget: report.budget,
      wallSeconds: (report.trials.reduce((s,t) => s + t.timings.elapsedMs, 0) + report.skippedTrials.reduce((s,t) => s + t.elapsedMs, 0)) / 1000,
      nativeWaits: report.trials.map(t => t.timings.nativeWaits), durationMs: report.trials.map(t => t.durationMs) }));
    return report;
  };
  if (useReference) {
    const normal = await execute('reference-normal', 1, saved.options.seed);
    assert.equal(normal.budget.completed, 1, normal.error);
    delayed = true;
    await execute('reference-background', 1, saved.options.seed);
  } else {
    // Current runtime receives the same board and seeds, with and without timer clamping.
    const before = await execute('current-comparison', 2, saved.options.seed);
    assert.equal(before.budget.completed, 2, before.error);
    useReference = false; delayed = true;
    const after = await execute('fixed-background-comparison', 2, saved.options.seed);
    assert.equal(after.budget.completed, 2, after.error);
    for (let i = 0; i < before.trials.length; i++) {
      // Flight/second-strike UUIDs identify transport and launch contexts, not combat RNG.
      // Preserve their equality relationships while normalizing their spelling.
      const stable = ({ timings, ...trial }) => {
        const ids = new Map();
        return JSON.parse(JSON.stringify(trial, (key, value) => {
          if (typeof value === 'string' && /^(?:flight|second)-[\da-f-]{36}$/.test(value)) {
            if (!ids.has(value)) ids.set(value, `${value.split('-')[0]}-${ids.size}`);
            return ids.get(value);
          }
          return value;
        }));
      };
      assert.deepEqual(stable(after.trials[i]), stable(before.trials[i]), 'Same events, timings, procs and results despite background timer delays');
      assert.equal(after.trials[i].timings.nativeWaits, 0, 'Combat progression must not depend on real timer delays');
      for (const entity of after.trials[i].entities) assert.deepEqual(entity.initialStats, capturedStats[entity.id], 'Real report build preserved');
    }
    const count = Number(process.env.SIM_BENCH_COUNT || 100);
    const batch = await execute('fixed-background-batch', count, saved.options.seed);
    assert.equal(batch.status, 'complete', batch.error);
    assert.equal(batch.budget.attempted, count); assert.equal(batch.budget.completed, count); assert.equal(batch.budget.skipped, 0);
    assert.equal(new Set(batch.trials.map(t => t.seed)).size, count);
    assert.ok(batch.trials.every(t => t.timings.nativeWaits === 0 && t.end === 'victory'));
    for (const trial of batch.trials) for (const entity of trial.entities) assert.deepEqual(entity.initialStats, capturedStats[entity.id]);
    await writeFile(resolve(output, `${browserName}-rapport-100.html`), await page.evaluate(r => Sim.simulationReportHtml(r, { standalone: true }), batch));
    const isolation = await page.evaluate(async () => {
      const E = await import("/js/entities/runtime.js");
      return { frames: document.querySelectorAll('iframe[title="Calcul isolé"]').length,
        board: boardBefore === JSON.stringify(E.entites, (key, value) => typeof value === 'function' || value instanceof Node ? undefined : value),
        storage: storageBefore === JSON.stringify(Object.entries(localStorage)) };
    });
    assert.deepEqual(isolation, { frames: 0, board: true, storage: true });
    console.log(`PASS ${browserName}: ${count}/${count} real-build combats with background timer clamp, unchanged results and isolated board/storage.`);
  }
} finally { await browser.close(); await new Promise(done => server.close(done)); }
