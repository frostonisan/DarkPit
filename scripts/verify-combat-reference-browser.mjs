import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import os from 'node:os';
import { chromium } from 'playwright';
import { makeReferenceArmies, finishReferenceArmies, installDesertArmy, readReferenceScene,
  createReplayBoard, frameReferenceBoard, referenceVisibility, installReferenceProbe } from './combat-reference-fixture.mjs';
import { recordVisualScript, validateVisualScript, runVisualReplay } from './combat-visual-replay.mjs';

function checkTraceContracts() {
  for (const total of [10, 40, 80]) {
    const actors = Array.from({ length: total }, (_, i) => ({ id: i + 1, position: `hex_${i + 1}`, attack: { combatFunction: 'Attaquant' } }));
    const trace = recordVisualScript(actors);
    assert.ok(validateVisualScript(trace).flights > total);
    const bad = change => { const copy = structuredClone(trace); change(copy); assert.throws(() => validateVisualScript(copy)); };
    bad(t => { t.events[0].sequence = 1; });
    bad(t => { t.events[1].at = -1; });
    bad(t => { t.events[0].target = -1; });
    bad(t => { t.events.find(e => e.type === 'impact').flight = 'unlaunched'; });
    bad(t => { t.events.find(e => e.type === 'timer').remaining = NaN; });
    bad(t => { t.events.find(e => e.type === 'move').moves[0].position = 'missing'; });
    bad(t => { t.actors[1].id = t.actors[0].id; });
  }
  console.log('PASS trace contracts: 10/40/80, rejected corrupt order, target, impact, timer, move and identity');
}
checkTraceContracts();
if (process.argv.includes('--self-test')) process.exit(0);
const browserRequested = process.argv.some(arg => ['--measure', '--prepare', '--fixtures-only', '--replay-only', '--live-only'].includes(arg));
if (!browserRequested) process.exit(0);

const root = resolve('docs');
const output = resolve(process.env.REFERENCE_OUTPUT || 'outputs/combat-reference-20261123');
const fixture = resolve('scripts/fixtures/combat-reference.json');
const prepare = process.argv.includes('--prepare');
const fixturesOnly = process.argv.includes('--fixtures-only');
const replayOnly = process.argv.includes('--replay-only');
const liveOnly = process.argv.includes('--live-only');
assert.ok([fixturesOnly, replayOnly, liveOnly].filter(Boolean).length <= 1, 'Choose only one series filter');
const repetitions = Number(process.env.REFERENCE_REPEATS || 2);
assert.ok(Number.isInteger(repetitions) && repetitions >= 1 && repetitions <= 10);
const baseline = process.env.REFERENCE_BASELINE_ROOT && resolve(process.env.REFERENCE_BASELINE_ROOT);
const resume = process.env.REFERENCE_RESUME === '1';
let variant = 'current';
await fs.mkdir(output, { recursive: true });
const hash = value => createHash('sha256').update(value).digest('hex');
const write = (name, value) => fs.writeFile(resolve(output, name), JSON.stringify(value, null, 2));
async function sourceManifest(directory = root) {
  const entries = [];
  async function walk(folder) {
    for (const e of await fs.readdir(folder, { withFileTypes: true })) {
      const file = resolve(folder, e.name);
      if (e.isDirectory()) await walk(file);
      else entries.push([relative(directory, file).replaceAll('\\', '/'), hash(await fs.readFile(file))]);
    }
  }
  await walk(directory); return entries;
}
const initial = await sourceManifest();
const baselineInitial = baseline ? await sourceManifest(baseline) : null;
const harnessFiles = ['scripts/verify-combat-reference-browser.mjs', 'scripts/combat-reference-fixture.mjs',
  'scripts/combat-visual-replay.mjs', 'scripts/COMBAT_REFERENCE.md'];
const harnessManifest = () => Promise.all(harnessFiles.map(async file => [file, hash(await fs.readFile(file))]));
const harnessInitial = await harnessManifest();
if (resume) {
  assert.deepEqual(initial, JSON.parse(await fs.readFile(resolve(output, 'source-before.json'), 'utf8')),
    'Production changed since the interrupted campaign; start a new output directory');
  await write('harness-resume-before.json', harnessInitial);
} else {
  await write('source-before.json', initial);
  await write('harness-before.json', harnessInitial);
}
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = resolve(root, '.' + (path === '/' ? '/index.html' : path));
  if (!file.startsWith(root + sep)) return res.writeHead(403).end();
  try {
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
      '.json': 'application/json', '.svg': 'image/svg+xml', '.gif': 'image/gif', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg' })[extname(file)] || 'application/octet-stream');
    res.end(await fs.readFile(variant === 'baseline' && /^\/(js|css)\//.test(path) ? resolve(baseline, '.' + path) : file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: process.env.VERIFY_BROWSER || 'chrome', headless: true });
const system = await browser.newBrowserCDPSession();
const gpu = (await system.send('SystemInfo.getInfo')).gpu;
await write(resume ? 'environment-resume.json' : 'environment.json', { at: new Date().toISOString(), browser: browser.version(), node: process.version,
  cpu: os.cpus()[0].model, gpu: { devices: gpu.devices, featureStatus: gpu.featureStatus }, viewport: { width: 1536, height: 864 }, dpr: 1 });
async function pageForCase() {
  const context = await browser.newContext({ viewport: { width: 1536, height: 864 } });
  const page = await context.newPage(), errors = [], failed = [], requests = [];
  page.setDefaultTimeout(60000);
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', r => { if (r.status() >= 400) failed.push(r.url()); });
  page.on('request', r => requests.push(r.url().replace(origin, '')));
  await page.route('**/*', route => route.request().url().startsWith(origin) || /^(blob|data):/.test(route.request().url()) ? route.continue() : route.abort());
  await page.addInitScript(installReferenceProbe);
  await page.goto(origin);
  await page.locator('#game-container').waitFor({ state: 'attached' });
  return { page, context, errors, failed, requests };
}
async function enterDesert(page) {
  await page.locator('.level-button[data-biome="desert"]').click({ force: true });
  await page.locator('.loading-h2.loaded').waitFor();
}
const metrics = data => Object.fromEntries(data.metrics.map(e => [e.name, e.value]));
const mean = values => values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
const percentile = (values, q) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * q))] ?? null;
const measurements = [], initialScenes = new Map(), armyHashes = new Map(), replayStates = new Map();
const completed = new Set();
let desertEnemyHash;
if (resume) {
  const saved = JSON.parse(await fs.readFile(resolve(output, 'measurements.json'), 'utf8'));
  for (const row of saved) {
    assert.ok(['desert-live', 'visual-replay'].includes(row.family));
    assert.ok([10, 40, 80].includes(row.total) && ['baseline', 'current'].includes(row.variant));
    assert.ok(Number.isInteger(row.repeat) && row.repeat >= 0 && row.repeat < repetitions);
    assert.equal(row.id, `${row.family === 'desert-live' ? 'desert' : 'replay'}-${row.total}-${row.variant}-${row.repeat + 1}`);
    assert.ok(!completed.has(row.id), 'Duplicate completed case');
    const data = JSON.parse(await fs.readFile(resolve(output, `${row.id}.json`), 'utf8'));
    assert.deepEqual(data.row, row); assert.deepEqual(data.errors, []); assert.deepEqual(data.failed, []);
    assert.ok(row.gifRequests > 0 && row.atlasRequests === 0);
    if (row.family === 'desert-live') {
      assert.ok(row.impacts > 0 || row.outcome, 'Never resume with an inactive combat');
      if (initialScenes.has(row.total)) assert.deepEqual(data.ready.entities, initialScenes.get(row.total));
      if (armyHashes.has(row.total)) assert.equal(row.armyHash, armyHashes.get(row.total));
      initialScenes.set(row.total, data.ready.entities); armyHashes.set(row.total, row.armyHash);
      const enemyHash = hash(JSON.stringify(data.ready.entities.filter(e => e.side === 'B').map(({ position, box, ...entity }) => entity)));
      if (desertEnemyHash) assert.equal(enemyHash, desertEnemyHash);
      desertEnemyHash = enemyHash;
    } else {
      const trace = JSON.parse(await fs.readFile(resolve(process.env.REFERENCE_TRACE_DIR || output, `trace-${row.total}.json`), 'utf8'));
      assert.equal(hash(JSON.stringify(trace)), row.traceHash);
      assert.deepEqual(data.replay.dispatched, trace.events.map(e => e.sequence));
      assert.equal(data.replay.remainingProjectiles, 0);
      if (replayStates.has(row.total)) assert.deepEqual(data.replay.finalState, replayStates.get(row.total));
      replayStates.set(row.total, data.replay.finalState);
    }
    completed.add(row.id); measurements.push(row);
  }
  console.log(`RESUME ${completed.size} validated cases; unchanged production and recorded inputs`);
}
async function captureReferenceTrace(cdp, id, total) {
  if (process.env.REFERENCE_CAPTURE_TRACE !== '1' || total !== 40) return async () => {};
  await cdp.send('Tracing.start', { transferMode: 'ReturnAsStream', streamFormat: 'json', streamCompression: 'gzip',
    traceConfig: { recordMode: 'recordAsMuchAsPossible', includedCategories: ['devtools.timeline',
      'disabled-by-default-devtools.timeline', 'v8.execute', 'blink.user_timing', 'toplevel', 'disabled-by-default-v8.cpu_profiler'] } });
  return async () => {
    const complete = new Promise(done => cdp.once('Tracing.tracingComplete', done));
    await cdp.send('Tracing.end');
    const result = await complete;
    assert.equal(result.dataLossOccurred, false, 'The Chrome trace lost events');
    const chunks = [];
    try {
      for (;;) {
        const chunk = await cdp.send('IO.read', { handle: result.stream, size: 262144 });
        chunks.push(Buffer.from(chunk.data, chunk.base64Encoded ? 'base64' : 'utf8'));
        if (chunk.eof) break;
      }
      await fs.writeFile(resolve(output, `${id}-chrome.json.gz`), Buffer.concat(chunks));
    } finally { await cdp.send('IO.close', { handle: result.stream }); }
  };
}
function summarize(probe, before, after) {
  assert.ok(probe.gaps.length > 1, 'Not enough frames to measure');
  return { durationMs: probe.elapsedMs, frames: probe.gaps.length, meanMs: mean(probe.gaps),
    p95Ms: percentile(probe.gaps, .95), p99Ms: percentile(probe.gaps, .99), longTasks: probe.longTasks.length,
    impacts: probe.counts.impacts, deaths: probe.counts.deaths,
    scriptMs: (after.ScriptDuration - before.ScriptDuration) * 1000,
    layoutMs: (after.LayoutDuration - before.LayoutDuration) * 1000,
    styleMs: (after.RecalcStyleDuration - before.RecalcStyleDuration) * 1000 };
}
function checkResources(errors, failed, requests) {
  assert.deepEqual(errors, []); assert.deepEqual(failed, []);
  const gifRequests = requests.filter(p => /\.gif(?:[?#]|$)/.test(p)).length;
  const atlasRequests = requests.filter(p => /spritesheets\//.test(p)).length;
  assert.ok(gifRequests > 0, 'The real GIF assets must be loaded'); assert.equal(atlasRequests, 0);
  return { gifRequests, atlasRequests };
}
async function runDesert(reference, total, repeat) {
  const id = `desert-${total}-${variant}-${repeat + 1}`;
  console.log('START', id);
  const { page, context, errors, failed, requests } = await pageForCase();
  try {
    const army = await page.evaluate(installDesertArmy, { reference, total });
    const armyHash = hash(JSON.stringify(army));
    if (armyHashes.has(total)) assert.equal(armyHash, armyHashes.get(total), 'The army changed between passes');
    armyHashes.set(total, armyHash);
    await enterDesert(page);
    const ready = await page.evaluate(readReferenceScene);
    assert.equal(ready.entities.length, total); assert.ok(ready.entities.every(e => e.box));
    assert.equal(ready.started, false, 'Battle started before the initial snapshot');
    const enemyHash = hash(JSON.stringify(ready.entities.filter(e => e.side === 'B').map(({ position, box, ...entity }) => entity)));
    if (desertEnemyHash) assert.equal(enemyHash, desertEnemyHash, 'Desert enemy stats changed between populations');
    desertEnemyHash = enemyHash;
    const key = total;
    if (initialScenes.has(key)) assert.deepEqual(ready.entities, initialScenes.get(key), 'Initial stats or placements changed');
    initialScenes.set(key, ready.entities);
    const camera = await page.evaluate(frameReferenceBoard);
    const visible = await page.evaluate(referenceVisibility);
    assert.equal(visible.inside, total); assert.equal(visible.hudOutside, 0);
    if (fixturesOnly) {
      await write(`${id}.json`, { id, armyHash, ready, camera, visible, errors, failed });
      console.log('READY', id, JSON.stringify({ A: army.armyACount, B: army.armyBCount })); return;
    }
    await page.locator('.loading-h2.loaded').click();
    await page.waitForFunction(() => !document.querySelector('.loading-screen'));
    // The stage animation can replace/hide the button between two checks.
    // A normal browser click waits for actionability and re-resolves the node.
    // Check auto-start between attempts; never click through a hidden control.
    for (let attempt = 0; attempt < 10; attempt++) {
      if (await page.evaluate(async () => (await import('/js/app/state.js')).gameStarted)) break;
      try { await page.locator('#startButton').click({ timeout: 2000 }); }
      catch (error) { if (error.name !== 'TimeoutError') throw error; }
    }
    await page.waitForFunction(async () => (await import('/js/app/state.js')).gameStarted);
    const cdp = await context.newCDPSession(page); await cdp.send('Performance.enable');
    const finishTrace = await captureReferenceTrace(cdp, id, total);
    const before = metrics(await cdp.send('Performance.getMetrics'));
    const probe = await page.evaluate(() => new Promise(done => {
      __referenceProbe.start();
      const finish = () => { clearTimeout(timer); window.removeEventListener('battleResolved', finish); done(__referenceProbe.stop()); };
      const timer = setTimeout(finish, 12000);
      window.addEventListener('battleResolved', finish, { once: true });
    }));
    const after = metrics(await cdp.send('Performance.getMetrics'));
    await finishTrace();
    const last = await page.evaluate(readReferenceScene);
    const resources = checkResources(errors, failed, requests);
    const row = { id, family: 'desert-live', total, variant, repeat, A: army.armyACount, B: army.armyBCount,
      armyHash, outcome: last.outcome, ...summarize(probe, before, after), ...resources };
    await page.screenshot({ path: resolve(output, `${id}.png`) });
    await write(`${id}.json`, { row, ready, last, camera, visible, probe, errors, failed });
    if (!(probe.counts.impacts > 0 || last.outcome)) {
      const runtime = await page.evaluate(async () => ({
        hidden: document.hidden, paused: (await import('/js/combat/clock.js')).isCombatPaused(),
        reasons: (await import('/js/combat/pause.js')).getCombatPauseReasons(),
        entities: (await import('/js/entities/runtime.js')).entites.map(e => ({id:e.id, phase:e.currentPhase,
          speed:e.speedTimer, prep:e.preparationTime, exec:e.executionTime, recovery:e.recoveryTime, target:e.targetId}))
      }));
      await write(`${id}-inactive.json`, runtime);
    }
    assert.ok(probe.counts.impacts > 0 || last.outcome, 'The real combat must execute attacks');
    measurements.push(row); await write('measurements.json', measurements); console.log('RESULT', JSON.stringify(row));
  } finally { await context.close(); }
}
async function runReplay(reference, total, repeat) {
  const id = `replay-${total}-${variant}-${repeat + 1}`;
  console.log('START', id);
  const { page, context, errors, failed, requests } = await pageForCase();
  try {
    const actors = await page.evaluate(createReplayBoard, { reference, total });
    const planned = recordVisualScript(actors); validateVisualScript(planned);
    const tracePath = resolve(process.env.REFERENCE_TRACE_DIR || output, `trace-${total}.json`);
    let trace;
    try { trace = JSON.parse(await fs.readFile(tracePath, 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT' || process.env.REFERENCE_TRACE_DIR) throw error;
      trace = planned; await fs.writeFile(tracePath, JSON.stringify(trace) + '\n', { flag: 'wx' });
    }
    assert.deepEqual(trace, planned, 'The recorded workload changed: use the same input fixture');
    const traceHash = hash(JSON.stringify(trace));
    const camera = await page.evaluate(frameReferenceBoard);
    const visible = await page.evaluate(referenceVisibility);
    assert.equal(visible.inside, total); assert.equal(visible.hudOutside, 0);
    const cdp = await context.newCDPSession(page); await cdp.send('Performance.enable');
    const before = metrics(await cdp.send('Performance.getMetrics'));
    await page.evaluate(() => __referenceProbe.start());
    const replay = await page.evaluate(runVisualReplay, trace);
    const after = metrics(await cdp.send('Performance.getMetrics'));
    await write(`${id}-raw.json`, { replay, errors, failed });
    assert.deepEqual(replay.measurement.counts, { impacts: 0, deaths: 0 }, 'The visual replay must never start gameplay');
    assert.ok(replay.finalState.every(e => !e.dead && e.turns === 0), 'No AI turns or deaths in the replay');
    assert.deepEqual(replay.finalState.map(e => [e.id, e.position]), actors.map(e => [e.id, e.position]), 'Scripted movement must return to its recorded positions');
    assert.deepEqual(replay.dispatched, trace.events.map(e => e.sequence), 'Every input must execute exactly once and in order');
    assert.equal(replay.remainingProjectiles, 0, 'All projectile visuals must settle');
    if (replayStates.has(total)) assert.deepEqual(replay.finalState, replayStates.get(total), 'Replay end state changed');
    replayStates.set(total, replay.finalState);
    const resources = checkResources(errors, failed, requests);
    const visibleAfter = await page.evaluate(referenceVisibility);
    assert.equal(visibleAfter.inside, total); assert.equal(visibleAfter.hudOutside, 0);
    const row = { id, family: 'visual-replay', total, variant, repeat, traceHash, events: replay.dispatched.length,
      ...summarize(replay.measurement, before, after), latenessP95Ms: percentile(replay.lateness, .95), ...resources };
    await page.screenshot({ path: resolve(output, `${id}.png`) });
    await write(`${id}.json`, { row, camera, visible, visibleAfter, replay, errors, failed });
    measurements.push(row); await write('measurements.json', measurements); console.log('RESULT', JSON.stringify(row));
  } finally { await context.close(); }
}
try {
  if (prepare) {
    await assert.rejects(fs.access(fixture), 'Existing reference must not be silently regenerated');
    const { page, context, errors, failed } = await pageForCase();
    console.log('Generating reference through the production Desert stage');
    const roster = await page.evaluate(makeReferenceArmies, { seed: 231126 });
    await enterDesert(page);
    const reference = await page.evaluate(finishReferenceArmies);
    await write('prepare-report.json', { roster, cases: reference.cases, errors, failed });
    assert.deepEqual(errors, []); assert.deepEqual(failed, []);
    await fs.mkdir(resolve('scripts/fixtures'), { recursive: true });
    await fs.writeFile(fixture, JSON.stringify(reference, null, 2) + '\n', { flag: 'wx' });
    console.log('Saved', JSON.stringify(reference.cases));
    await context.close();
  } else {
    const reference = JSON.parse(await fs.readFile(fixture, 'utf8'));
    assert.deepEqual(reference.totals, [10, 40, 80]);
    assert.equal(new Set([...reference.armyA, ...reference.armyB].map(e => e.id)).size, reference.armyA.length + reference.armyB.length, 'Duplicate frozen entity IDs');
    for (let repeat = 0; repeat < repetitions; repeat++) {
      for (const total of repeat % 2 ? [...reference.totals].reverse() : reference.totals) {
        for (variant of baseline ? repeat % 2 ? ['current', 'baseline'] : ['baseline', 'current'] : ['current']) {
          if (!replayOnly && !completed.has(`desert-${total}-${variant}-${repeat + 1}`)) await runDesert(reference, total, repeat);
          if (!liveOnly && !fixturesOnly && !completed.has(`replay-${total}-${variant}-${repeat + 1}`)) await runReplay(reference, total, repeat);
        }
      }
    }
    await write('summary.json', { fixtureHash: hash(await fs.readFile(fixture)), repetitions, resumedCases: completed.size,
      baseline: baseline || null, version: JSON.parse(await fs.readFile('package.json', 'utf8')).version,
      cases: reference.cases, measurements, checks: { fixedArmies: replayOnly ? null : true,
        identicalInitialStates: replayOnly || repetitions < 2 ? null : true,
        identicalReplayInputs: liveOnly || fixturesOnly ? null : true, noSkippedReplayEvents: liveOnly || fixturesOnly ? null : true,
        identicalReplayFinalStates: liveOnly || fixturesOnly || repetitions < 2 ? null : true } });
  }
  assert.deepEqual(await sourceManifest(), initial, 'Production files changed during the test');
  assert.deepEqual(await harnessManifest(), harnessInitial, 'Test harness changed during the campaign');
  if (baseline) assert.deepEqual(await sourceManifest(baseline), baselineInitial, 'Baseline files changed during the test');
  await write('integrity.json', { unchanged: true, files: initial.length, resumedCases: completed.size });
  if (resume) await write('recovery.json', { complete: true, resumedCases: completed.size, total: measurements.length,
    note: 'Historical failure.json retained; completed cases validated, unchanged production, only missing cases executed.' });
} catch (error) {
  await write('failure.json', { message: error.message, stack: error.stack }); throw error;
} finally { await browser.close(); await new Promise(done => server.close(done)); }
