import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve, extname, sep, dirname, relative } from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('docs'), output = resolve(process.env.LOAD_OUTPUT || 'outputs/combat-load');
await mkdir(output, { recursive: true });
const counts = (process.env.LOAD_COUNTS || '40,80').split(',').map(Number);
const liveMs = Number(process.env.LOAD_LIVE_MS || 12000);
const simMs = Number(process.env.LOAD_SIM_MS || 5000);
const repeats = Number(process.env.LOAD_REPEATS || 2);
const baselineDirectory = process.env.LOAD_BASELINE && resolve(process.env.LOAD_BASELINE);
const profile = process.env.LOAD_PROFILE === '1';
const scenario = process.env.LOAD_SCENARIO || 'mixed';
const poolPrototype = process.env.LOAD_POOL === '1';
const diagnosticFiltersOff = process.env.LOAD_FILTERS_OFF === '1';
const observeRecoveries = process.env.LOAD_OBSERVE_RECOVERIES === '1';
const captureRoot = resolve(process.env.LOAD_FROZEN_ROOT || root);
// Freeze code for the whole run: concurrent workspace edits must not mix two
// versions inside a trial. Only the selected optimization modules vary by side.
const comparedModules = (process.env.LOAD_MODULES || 'combat/loop.js,entities/runtime.js,rendering/hud.js').split(',');
const sourceFiles = new Map(), baselineFiles = new Map();
async function captureSources(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = resolve(directory, entry.name);
    if (entry.isDirectory()) await captureSources(file);
    else if (['.js', '.css', '.html', '.json'].includes(extname(file))) sourceFiles.set(resolve(root, relative(captureRoot, file)), await readFile(file));
  }
}
await captureSources(captureRoot);
if (process.env.LOAD_ARCHIVE_SOURCES === '1') {
  for (const [file, data] of sourceFiles) {
    const archived = resolve(output, 'frozen-sources', relative(root, file));
    await mkdir(dirname(archived), { recursive: true });
    await writeFile(archived, data);
  }
}
for (const name of comparedModules) {
  if (baselineDirectory) baselineFiles.set(resolve(root, 'js', name), await readFile(resolve(baselineDirectory, 'js', name)));
}
let checksOn = true;
const fingerprints = {};
for (const name of new Set(['combat/loop.js', 'combat/vitals.js', 'combat/control.js', 'combat/attackResolution.js', 'combat/timeline.js', 'entities/runtime.js', 'rendering/hud.js', 'combat/attacks.js', ...comparedModules])) {
  fingerprints[name] = createHash('sha256').update(sourceFiles.get(resolve(root, 'js', name))).digest('hex');
}
const replace = (source, from, to) => {
  assert.ok(source.includes(from), `Instrumentation anchor missing: ${from.slice(0, 80)}`);
  return source.replace(from, to);
};
const server = createServer(async (req, res) => {
  const file = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(root + sep)) return res.writeHead(403).end();
  try {
    let data;
    if (baselineDirectory && (!checksOn || process.env.LOAD_BASELINE_ONLY === '1')) {
      data = baselineFiles.get(file);
    }
    data ??= sourceFiles.get(file) ?? await readFile(file);
    // Experimental response only: the production file stays untouched.
    if (poolPrototype && checksOn && file.endsWith(`${sep}rendering${sep}animations.js`)) {
      data = require('./combat-fx-pool-prototype.cjs')(data.toString());
    }
    const recoveryEnabled = Boolean(baselineDirectory) || checksOn;
    if (file.endsWith(`${sep}combat${sep}loop.js`)) {
      data = data.toString();
      data = replace(data, 'function requestCombatContinuityCheck(entity, trigger) {', `
function requestCombatContinuityCheck(entity, trigger) {
  return globalThis.__loadMeasure('request', () => ${recoveryEnabled ? 'loadRequest(entity, trigger)' : 'undefined'});
}
function loadRequest(entity, trigger) {`);
      data = replace(data, "window.addEventListener('entityCombatInteraction', ({ detail }) => {", `
window.addEventListener('entityCombatInteraction', ({ detail }) => globalThis.__loadMeasure('interaction', () => {
  if (${!recoveryEnabled}) return;`);
      data = replace(data, "requestCombatContinuityCheck(entity, detail.kind || 'interaction');\n});", "requestCombatContinuityCheck(entity, detail.kind || 'interaction');\n}));");
      if (data.includes('function verifyContinuity() {')) {
        data = replace(data, 'function verifyContinuity() {', "function verifyContinuity() { return globalThis.__loadMeasure('check', measuredVerifyContinuity); }\n    function measuredVerifyContinuity() {");
      } else {
        data = replace(data, 'const timer = setTimeout(() => {\n        if (continuityChecks.get(entity)', "const timer = setTimeout(() => globalThis.__loadMeasure('check', () => {\n        if (continuityChecks.get(entity)");
        data = replace(data, '}, STALLED_TURN_DELAY);', '}), STALLED_TURN_DELAY);');
      }
      data = replace(data, 'continuityChecks.set(entity, timer);', 'continuityChecks.set(entity, timer); if (globalThis.__loadProbe.active) { globalThis.__loadProbe.scheduled++; globalThis.__loadProbe.maxPending = Math.max(globalThis.__loadProbe.maxPending, continuityChecks.size); }');
      data = data.replace('deferredForBacklog = true;', "deferredForBacklog = true; (globalThis.__loadProbe.deferrals ||= []).push({ id: entity.id, clock: clockNow(), logical: combatNow() });");
      data = replace(data, 'function resetBlockedTurn(entity) {', `function resetBlockedTurn(entity) {
        globalThis.__loadProbe.recoveries.push({ id: entity.id, phase: entity.currentPhase, at: combatNow(),
          stunned: isEntityActionPaused(entity), silenced: isEntitySilenced(entity),
          progress: combatProgressSignature(entity), owner: activeTurns.has(entity) });`);
    }
    if (file.endsWith(`${sep}combat${sep}effects.js`)) {
      data = replace(data.toString(), 'controlEffects.set(key, current);', "controlEffects.set(key, current); globalThis.__loadEffect(state.kind);");
      data = replace(data, 'activeAlterations.set(key, state);', 'activeAlterations.set(key, state); globalThis.__loadEffect(state.kind);');
    }
    if (file.endsWith(`${sep}debug${sep}simulationRuntime.js`)) {
      if (process.env.LOAD_RANDOM_TRACE === '1') data = replace(data.toString(), '  Math.random = random;', `
  globalThis.__loadProbe.random = [];
  Math.random = () => { const value = random();
    if (time >= 3000) globalThis.__loadProbe.random.push({ time, value, stack: new Error().stack.split('\\n').slice(2, 6).map(s => s.replace(/https?:\\/\\/[^/]+/g, '')).join('\\n') });
    return value; };`);
      data = replace(data.toString(), '  F.initFightEntites();', `
  globalThis.__loadProbe.active = true;
  F.initFightEntites();
  // Observe writes at logical time, not the report's outer timer samples.
  globalThis.__loadProbe.phaseChanges = [];
  for (const entity of gameEntities) {
    let phase = entity.currentPhase;
    Object.defineProperty(entity, 'currentPhase', { enumerable: true, configurable: true,
      get: () => phase,
      set(next) {
        if (next !== phase) globalThis.__loadProbe.phaseChanges.push({
          id: entity.id, at: timeline.combatNow() - input.epoch, phase: next });
        phase = next;
      }
    });
  }`);
      data = replace(data, '  return { seed: input.seed, durationMs: time,', '  return { loadProbe: globalThis.__loadProbe, seed: input.seed, durationMs: time,');
    }
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream');
    res.end(data);
  } catch (error) { console.error('SERVER', file, error.message); res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [], live = [], simulations = [];
let passed = false, failure = null, saveReady = process.env.LOAD_RESUME !== '1';
const workspaceChanges = [];
const origin = `http://127.0.0.1:${server.address().port}`;
function installProbe(options) {
  const now = performance.now.bind(performance);
  const probe = window.__loadProbe = { active: false, calls: {}, workMs: 0, scheduled: 0, maxPending: 0,
    recoveries: [], effects: {}, interactions: {}, impacts: 0, impactBuckets: {}, turns: 0, errors: [],
    creates: {}, removes: 0, animations: 0, poolHits: 0, renderCalls: {} };
  const create = Document.prototype.createElement, remove = Element.prototype.remove, animate = Element.prototype.animate;
  Document.prototype.createElement = function (name, ...args) {
    if (probe.active) probe.creates[name] = (probe.creates[name] || 0) + 1;
    return create.call(this, name, ...args);
  };
  Element.prototype.remove = function (...args) { if (probe.active) probe.removes++; return remove.apply(this, args); };
  Element.prototype.animate = function (...args) { if (probe.active) probe.animations++; return animate.apply(this, args); };
  let depth = 0;
  window.__loadMeasure = (kind, work) => {
    if (!probe.active) return work();
    probe.calls[kind] = (probe.calls[kind] || 0) + 1;
    const start = depth++ === 0 ? now() : null;
    try { return work(); } finally { depth--; if (start !== null) probe.workMs += now() - start; }
  };
  window.__loadEffect = kind => { if (probe.active) probe.effects[kind] = (probe.effects[kind] || 0) + 1; };
  window.addEventListener('entityCombatInteraction', ({ detail }) => {
    if (probe.active) probe.interactions[detail.kind] = (probe.interactions[detail.kind] || 0) + 1;
  });
  window.addEventListener('combatLogEntry', ({ detail }) => {
    if (probe.active && detail.type === 'damage_resolution') {
      probe.impacts++; const at = String(Date.now()); probe.impactBuckets[at] = (probe.impactBuckets[at] || 0) + 1;
    }
  });
  document.addEventListener('entityTurnCompleted', () => { if (probe.active) probe.turns++; });
  const error = console.error;
  console.error = (...args) => {
    probe.errors.push(args.map(value => value?.stack || String(value)).join(' ')); error(...args);
  };
  if (options?.profile) {
    for (const [owner, name] of [[Element.prototype, 'getBoundingClientRect'], [Element.prototype, 'getAnimations'],
      [Document.prototype, 'createElement'], [Element.prototype, 'animate'], [Element.prototype, 'remove'],
      [CanvasRenderingContext2D.prototype, 'drawImage']]) {
      const original = owner[name];
      owner[name] = function (...args) {
        if (!probe.active) return original.apply(this, args);
        const start = now(), stat = probe.renderCalls[name] ||= { calls: 0, ms: 0 };
        stat.calls++;
        try { return original.apply(this, args); } finally { stat.ms += now() - start; }
      };
    }
    const clone = globalThis.structuredClone.bind(globalThis);
    probe.clones = { calls: 0, ms: 0, stacks: {} };
    globalThis.structuredClone = (...args) => {
      if (!probe.active) return clone(...args);
      if (++probe.clones.calls % 200 === 0) {
        const stack = new Error().stack.split('\n').slice(2, 6).join('\n');
        probe.clones.stacks[stack] = (probe.clones.stacks[stack] || 0) + 1;
      }
      const start = now();
      try { return clone(...args); } finally { probe.clones.ms += now() - start; }
    };
  }
}
async function fixture(count) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.addInitScript(installProbe, { profile });
  page.on('pageerror', error => errors.push(error.stack || error.message));
  await page.goto(`${origin}/index.html`);
  // Cost isolation only, never a proposed production visual change.
  if (diagnosticFiltersOff && checksOn) await page.addStyleTag({ content: '* { filter:none !important; backdrop-filter:none !important; }' });
  await page.evaluate(async ({ count, scenario }) => {
    const U = await import("/js/ui/application.js");
    window.E = await import("/js/entities/runtime.js"); window.G = await import("/js/app/state.js");
    window.P = await import("/js/combat/pause.js"); await P.restorePausedCombat();
    window.Clock = await import("/js/combat/clock.js"); window.Timeline = await import("/js/combat/timeline.js");
    window.Sim = await import("/js/debug/simulation.js");
    const C = await import("/js/rendering/entities.js"), S = await import("/js/storage/gameStorage.js");
    S.setAdminMode(true); window.levelRunning = 'admin'; window.currentStageId = 'load-test'; S.setCurrentLevel('load-test');
    (await import("/js/storage/sessionStorage.js")).beginAdminSession();
    S.saveToLocalStorage('GameStages', { stages: [{ id: 'load-test', level_type: 'admin' }] });
    S.saveToLocalStorage('selectedArmyA', []); S.saveToLocalStorage('ArmyB', { armies: {} }); S.saveToLocalStorage('equippedItems', []);
    document.body.innerHTML = '<div id="game-container"><div class="Game-UI"><div id="score"></div></div><div class="AllEntitiesHud"></div><div id="hexGrid" class="hex-grid"></div></div>';
    const grid = document.getElementById('hexGrid');
    grid.style.cssText = 'position:absolute;top:80px;left:35px;width:2600px;height:1400px;transform:scale(.68);transform-origin:top left';
    const columnsPerSide = count / 10, columns = columnsPerSide * 2 + 2;
    for (let row = 0; row < 6; row++) for (let col = 0; col < columns; col++) {
      const hex = document.createElement('div'); hex.id = `hex_${row * columns + col + 1}`; hex.className = 'hex Neutral';
      Object.assign(hex.dataset, { position: hex.id, row: String(row), col: String(col) });
      hex.style.cssText = `position:absolute;left:${col * 130 + row % 2 * 65}px;top:${row * 165}px;width:150px;height:180px`;
      hex.innerHTML = '<div class="socle gueux"></div>'; grid.append(hex);
    }
    const profiles = [[], ['stun'], ['silence'], ['poison'], ['brulure'], ['immobilisation'],
      ['bafouillage'], ['lenteur'], ['grab'], ['confusion'], ['sommeil'], ['insolence'], ['charme'], ['lourdeur']];
    const overrides = { stun: { effectDuration: .7 }, silence: { effectDuration: .6 },
      sommeil: { effectDuration: 1.2 }, immobilisation: { effectDuration: 1.5 },
      bafouillage: { effectDuration: 1.2, effectSlowPercent: 40 }, lenteur: { effectDuration: 1.2, effectSlowPercent: 40 },
      poison: { effectDuration: 3, effectTickInterval: .5, effectDot: 2, effectPhysicalRatio: 0 },
      brulure: { effectDot: 2, effectStack: 3 }, grab: { effectDistance: 4, effectMovementRecoilPercent: 20 },
      confusion: { effectDuration: 1.8, effectMoveInterval: .6 }, charme: { effectDuration: .7 },
      insolence: { effectDuration: 1.2, effectMinInterval: .4, effectMaxInterval: .6 }, lourdeur: { effectDuration: 2 } };
    const template = (await import("/js/data/entityTemplates.js")).entitesNest.find(entity => entity.serial === 900013);
    const renders = []; E.entites.length = 0;
    for (let i = 0; i < count; i++) {
      const side = i < count / 2 ? 'A' : 'B', n = i % (count / 2), support = n % 15 === 14;
      const col = n % columnsPerSide + (side === 'B' ? columnsPerSide + 2 : 0), row = Math.floor(n / columnsPerSide);
      const hex = grid.querySelector(`[data-row="${row}"][data-col="${col}"]`);
      const magic = support || n % 3 !== 0;
      const entity = E.enrichEntityStats({ ...structuredClone(template), id: 981000 + i, name: `Charge ${side} ${n + 1}`, side,
        type: 'sbire', role: 'gueux', position: hex.id, level: 1, awakening: 1, stuff: {}, stats: {}, modifierStats: {}, hasReward: false,
        baseStats: { HP: 8000, strength: 10, intelligence: 10, agility: 10, physicalDamage: 20, magicalDamage: 20,
          speed: 500, shift: 100, movement: 100, astrality: n % 10 === 0 ? 15 : 0,
          ...(scenario === 'impacts-auras' ? { hpBattleRegen: n % 3 === 0 ? 150 : 0, armor: n % 5 === 0 ? 200 : 0 } : {}) },
        attacks: [{ functionName: 'load-attack', attackId: 'load-attack', displayName: 'Charge simultanée',
          attackAsset: './media/assets/spells/auto-attack',
          combatFunction: support ? 'Support' : 'Attaquant', attacknature: [magic ? 'magicalDamage' : 'physicalDamage'],
          attackRange: [(scenario === 'impacts-auras' ? n % 4 !== 0 : n % 4 === 0) ? 'melee' : 'range'], attackTarget: [support ? 'ally' : 'enemy'], deadTarget: ['no'],
          type: [], effets: support ? [] : profiles[n % profiles.length], effectOverrides: overrides, selfEffects: [],
          preparationTime: 350, executionTime: 250, recoveryTime: 250, cooldown: 1400,
          physicalRatio: magic ? 0 : 1, magicalRatio: magic ? 1 : 0, piercingRatio: 0 }] });
      entity.isDEAD = false; entity.statut = ['alive']; E.entites.push(entity);
      hex.className = `hex Side${side} occupied`; hex.dataset.occupiedBy = String(entity.id);
      const created = C.createEntiteInDOM(entity); hex.append(created.element); renders.push(created.spriteReady);
    }
    await Promise.all(renders);
    // The load fixture builds its own cells/entities instead of the normal
    // placement pipeline. Publish that initial board before starting combat.
    (await import("/js/board/controller.js")).syncEntityFootprints(grid);
    (await import("/js/app/stages.js")).configureBattleSystemsOnce();
    window.snapshot = Sim.captureSimulationBoard();
    window.captureFrames = () => {
      window.frameGaps = []; window.longTasks = []; let previous = performance.now(); window.sampling = true;
      const frame = now => { if (!sampling) return; frameGaps.push(now - previous); previous = now; requestAnimationFrame(frame); };
      requestAnimationFrame(frame);
      window.longObserver = new PerformanceObserver(list => { for (const entry of list.getEntries()) longTasks.push(entry.duration); });
      longObserver.observe({ type: 'longtask', buffered: false });
    };
  }, { count, scenario });
  await page.waitForTimeout(1000);
  return page;
}
const percentile = (values, fraction) => { const v = [...values].sort((a, b) => a - b); return v[Math.min(v.length - 1, Math.floor(v.length * fraction))] || 0; };
const briefProbe = probe => ({ ...probe, peakSameMillisecondImpacts: Math.max(0, ...Object.values(probe.impactBuckets)), impactBuckets: undefined, phaseChanges: undefined });
const metricMap = response => Object.fromEntries(response.metrics.map(m => [m.name, m.value]));
const comparable = trial => ({ end: trial.end, duration: trial.durationMs, winner: trial.winner,
  // New report metadata describes the starting footprint; it does not alter
  // the combat. Compare every pre-existing result and final footprint below.
  entities: trial.entities.map(({ phases, phaseAt, initialPosition, initialSizeInCells, ...entity }) => entity),
  phaseChanges: trial.loadProbe.phaseChanges,
  events: trial.journal.filter(entry => entry.type !== 'phase' && entry.type !== 'resources') });
function validateLive(entry) {
  // Keep pre-change faults in the report; the optimized build must have none.
  if (!observeRecoveries && (!baselineDirectory || entry.enabled)) assert.deepEqual(entry.probe.recoveries, [], 'No healthy entity may be restarted under real rendering load');
  assert.deepEqual(entry.probe.errors, [], 'No real-time combat errors');
  // Supports and controlled actors need not land a hit within the sample.
  // Require actual battle activity and applied effects, not one hit per actor.
  assert.ok(entry.probe.impacts >= entry.count / 2 && entry.probe.interactions.movement > 0,
    'The large fight must actually exchange hits and forced movements');
  for (const kind of ['stun', 'silence', 'poison', 'immobilisation']) {
    assert.ok(entry.probe.effects[kind] > 0, `${kind} must actually be applied`);
  }
}
async function save() { await writeFile(resolve(output, 'results.json'), JSON.stringify({ passed, failure, workspaceChanges, observeRecoveries, scenario, poolPrototype, diagnosticFiltersOff,
  profiled: profile, browser: browser.version(), comparison: baselineDirectory ? 'source-before-after' : 'recovery-off-on', baselineDirectory, counts, liveMs, simMs, fingerprints, live, simulations, errors }, null, 2)); }
try {
  if (process.env.LOAD_RESUME === '1') {
    const previous = JSON.parse(await readFile(resolve(output, 'results.json'), 'utf8'));
    assert.deepEqual(previous.fingerprints, fingerprints, 'Only resume against the same game source');
    assert.deepEqual([previous.counts, previous.liveMs, previous.simMs], [counts, liveMs, simMs]);
    live.push(...previous.live); simulations.push(...previous.simulations); errors.push(...previous.errors);
    saveReady = true;
    live.forEach(validateLive);
  }
  for (const count of counts) {
    for (let repeat = 0; repeat < repeats; repeat++) for (const enabled of (repeat % 2 ? [true, false] : [false, true])) {
      if (live.some(entry => entry.count === count && entry.repeat === repeat && entry.enabled === enabled)) continue;
      checksOn = enabled;
      console.log(`LIVE ${count} entities, ${baselineDirectory ? (enabled ? 'AFTER' : 'BEFORE') : `checks ${enabled ? 'ON' : 'OFF'}`}, repeat ${repeat + 1}`);
      const page = await fixture(count), cdp = await page.context().newCDPSession(page);
      await cdp.send('Performance.enable');
      if (profile) {
        await cdp.send('Profiler.enable');
        await cdp.send('Profiler.start');
        await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline,blink,cc', transferMode: 'ReturnAsStream' });
      }
      const before = metricMap(await cdp.send('Performance.getMetrics'));
      await page.evaluate(seed => {
        let random = seed >>> 0;
        Math.random = () => { random = (Math.imul(1664525, random) + 1013904223) >>> 0; return random / 4294967296; };
        __loadProbe.active = true; captureFrames(); window.liveStart = performance.now(); G.startGame();
      }, 973 + repeat);
      await page.waitForTimeout(liveMs);
      const after = metricMap(await cdp.send('Performance.getMetrics'));
      // Exclude battle teardown from the CPU profile of the active fight.
      const cpuProfile = profile ? (await cdp.send('Profiler.stop')).profile : null;
      const result = await page.evaluate(() => {
        const result = { elapsedMs: performance.now() - liveStart, probe: structuredClone(__loadProbe), frameGaps, longTasks,
          entities: E.entites.map(e => ({ id: e.id, turns: e.turnCount || 0, phase: e.currentPhase, hp: e.stats.HP.current })) };
        sampling = false; longObserver.disconnect(); __loadProbe.active = false; G.StopGame({ preserveScene: true }); return result;
      });
      if (profile) {
        const prefix = `profile-${count}-${enabled ? 'on' : 'off'}-${repeat}`;
        await writeFile(resolve(output, `${prefix}.cpuprofile`), JSON.stringify(cpuProfile));
        const traceDone = new Promise(done => cdp.once('Tracing.tracingComplete', done));
        await cdp.send('Tracing.end');
        const { stream } = await traceDone;
        let trace = '';
        for (;;) { const part = await cdp.send('IO.read', { handle: stream }); trace += part.data; if (part.eof) break; }
        await cdp.send('IO.close', { handle: stream });
        await writeFile(resolve(output, `${prefix}.trace.json`), trace);
      }
      const entry = { count, enabled, repeat, elapsedMs: result.elapsedMs,
        cpuMs: (after.TaskDuration - before.TaskDuration) * 1000,
        scriptMs: (after.ScriptDuration - before.ScriptDuration) * 1000,
        layoutMs: (after.LayoutDuration - before.LayoutDuration) * 1000,
        styleMs: (after.RecalcStyleDuration - before.RecalcStyleDuration) * 1000,
        frames: result.frameGaps.length, meanFrameMs: result.frameGaps.reduce((a, b) => a + b, 0) / result.frameGaps.length,
        frameOver50: result.frameGaps.filter(ms => ms > 50).length,
        frameOver100: result.frameGaps.filter(ms => ms > 100).length,
        frameP95Ms: percentile(result.frameGaps, .95), frameMaxMs: Math.max(...result.frameGaps),
        longTasks: result.longTasks.length, longTaskMs: result.longTasks.reduce((a, b) => a + b, 0),
        heapMb: after.JSHeapUsedSize / 1048576, probe: briefProbe(result.probe), entities: result.entities };
      live.push(entry); await save();
      console.log(JSON.stringify({ count, enabled, cpuMs: entry.cpuMs, frameP95Ms: entry.frameP95Ms,
        controlMs: entry.probe.workMs, impacts: entry.probe.impacts, recovery: entry.probe.recoveries.length, errors: entry.probe.errors.length }));
      validateLive(entry);
      await page.screenshot({ path: resolve(output, `live-${count}-${enabled ? 'on' : 'off'}-${repeat}.png`) });
      await page.close();
    }
    if (process.env.LOAD_SKIP_SIM === '1' || [1701, 1702].every(seed => simulations.some(entry => entry.count === count && entry.seed === seed))) continue;
    checksOn = true;
    const simulation = await fixture(count);
    for (const seed of (process.env.LOAD_SEEDS || '1701,1702').split(',').map(Number)) {
      if (simulations.some(entry => entry.count === count && entry.seed === seed)) continue;
      const trials = {};
      for (const enabled of (seed % 2 ? [false, true] : [true, false])) {
        checksOn = enabled;
        console.log(`SIM ${count} entities, ${baselineDirectory ? (enabled ? 'AFTER' : 'BEFORE') : `checks ${enabled ? 'ON' : 'OFF'}`}, seed ${seed}`);
        const trial = await simulation.evaluate(({ seed, durationMs }) => Sim.simulateTrial(snapshot, { seed, durationMs, trace: true }), { seed, durationMs: simMs });
        trials[enabled ? 'on' : 'off'] = trial;
        assert.deepEqual(trial.loadProbe.recoveries, [], 'No healthy entity may be restarted in the real virtual-time engine');
      }
      await writeFile(resolve(output, `simulation-${count}-${seed}.json`), JSON.stringify({ before: comparable(trials.off), after: comparable(trials.on) }));
      await writeFile(resolve(output, `probes-${count}-${seed}.json`), JSON.stringify({ before: trials.off.loadProbe, after: trials.on.loadProbe }));
      if (process.env.LOAD_EXACT_JOURNAL === '1') {
        await writeFile(resolve(output, `journal-${count}-${seed}.json`), JSON.stringify({ before: trials.off.journal, after: trials.on.journal }));
        assert.deepEqual(trials.on.journal, trials.off.journal, 'Full journal: order, times and intermediate resource snapshots');
      }
      let identical = true;
      try { assert.deepEqual(comparable(trials.on), comparable(trials.off)); }
      catch { identical = false; console.error(`MISMATCH ${count} entities, seed ${seed}: saved full event comparison`); }
      simulations.push({ count, seed, durationMs: trials.on.durationMs, identical,
        phaseTransitions: trials.on.loadProbe.phaseChanges.length, combatEvents: comparable(trials.on).events.length,
        phaseSamples: { before: trials.off.entities.map(e => ({ id: e.id, phases: e.phases })),
          after: trials.on.entities.map(e => ({ id: e.id, phases: e.phases })) },
        beforeMs: trials.off.timings.combatMs, afterMs: trials.on.timings.combatMs,
        beforeSteps: trials.off.steps, afterSteps: trials.on.steps, probe: briefProbe(trials.on.loadProbe) });
      await save();
    }
    await simulation.close();
  }
  assert.deepEqual(errors, []);
  assert.ok(simulations.every(trial => trial.identical), 'Every seeded comparison must retain entity results, events and exact phase transitions');
  for (const [name, hash] of Object.entries(fingerprints)) {
    const currentHash = createHash('sha256').update(await readFile(resolve(root, 'js', name))).digest('hex');
    if (currentHash !== hash) workspaceChanges.push({ name, captured: hash, current: currentHash });
  }
  // Every response used the captured buffers, even if another task edited the
  // workspace. Preserve that distinction instead of invalidating a frozen run.
  if (workspaceChanges.length) console.log('Workspace changed; all trials used frozen source buffers:', workspaceChanges.map(x => x.name));
  passed = !observeRecoveries || live.filter(x=>x.enabled).every(x=>x.probe.recoveries.length===0);
  if (!passed) { failure = 'Diagnostic completed, but unexpected recovery checks failed; see probe.recoveries.'; process.exitCode = 1; }
  console.log(passed ? 'PASS: rendered stress tests and deterministic comparisons' : failure);
} catch (error) {
  failure = error.stack || error.message;
  throw error;
} finally { if (saveReady) await save(); await browser.close(); await new Promise(done => server.close(done)); }
