import assert from 'node:assert/strict';
import { dismissStarterForFixture } from './browser-test-fixture.mjs';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('docs'), output = resolve('outputs/combat-simulation');
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  const file = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(root + sep)) return res.writeHead(403).end();
  try { res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream'); res.end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const profiler = process.env.SIMULATION_PROFILE ? await page.context().newCDPSession(page) : null;
  if (profiler) { await profiler.send('Profiler.enable'); await profiler.send('Profiler.start'); }
  page.on('pageerror', error => console.error('PAGE ERROR:', error));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await dismissStarterForFixture(page);
  await page.evaluate(async () => {
    const U = await import("/js/ui/application.js"), E = await import("/js/entities/runtime.js");
    const C = await import("/js/rendering/entities.js"), S = await import("/js/storage/gameStorage.js");
    const template = (await import("/js/data/entityTemplates.js")).entitesNest.find(e => e.serial === 900013);
    U.createGameContainer(); U.GameUi(); S.setAdminMode(true); window.levelRunning = 'admin';
    document.querySelector('.worldmap')?.remove();
    const grid = document.createElement('div'); grid.id = 'hexGrid'; grid.style.cssText = 'position:absolute;top:150px;left:400px;width:700px;height:500px';
    document.getElementById('game-container').append(grid);
    E.entites.length = 0;
    for (const [index, side] of ['A', 'B', 'B'].entries()) {
      const hex = document.createElement('div'); hex.className = `hex Side${side} occupied`; hex.dataset.position = String(index + 1);
      hex.style.cssText = `position:absolute;left:${index * 210}px;top:50px;width:180px;height:200px`;
      grid.append(hex);
      const entity = E.enrichEntityStats({ ...structuredClone(template), id: 999810 + index, name: `Simulation ${side}${index}`, side, type: 'sbire', role: 'gueux',
        position: String(index + 1), level: 1, awakening: 1, stuff: {}, stats: {}, modifierStats: {}, baseStats: { HP: index ? 12 : 100, physicalDamage: index ? 1 : 20, speed: 1000 },
        attacks: [{ functionName: 'simulation-test', attackId: 'simulation-test', displayName: 'Test physique', combatFunction: 'Attaquant', attacknature: ['physicalDamage'],
          attackRange: ['melee'], attackTarget: ['enemy'], deadTarget: ['no'], type: [], effets: [], selfEffects: [], preparationTime: 100, executionTime: 200, recoveryTime: 100, cooldown: 0,
          physicalRatio: 1, magicalRatio: 0, piercingRatio: 0 }] });
      entity.statut = ['alive']; entity.isDEAD = false; E.entites.push(entity);
      const created = C.createEntiteInDOM(entity); hex.append(created.element); await created.spriteReady;
    }
    const boardController = await import('/js/board/controller.js');
    boardController.invalidateFootprintGeometry(grid); boardController.rebuildBoardOccupancy(grid);
    window.Sim = await import("/js/debug/simulation.js");
    // Regression: real players already have an acquired army in storage.
    // This exercises GameInit's import-time acquisition registration, unlike
    // a board fixture whose saved army is empty.
    const savedAlly = JSON.parse(JSON.stringify(E.entites[0], (_key, value) =>
      typeof value === 'function' || value instanceof Node ? undefined : value));
    savedAlly.acquisition = { order: 7, source: 'test', acquiredAt: '2026-11-04T00:00:00.000Z' };
    S.saveToLocalStorage('selectedArmyA', [savedAlly]);
    S.saveToLocalStorage('gameData', { entityAcquisitionCounter: 7 });
    Sim.mountCombatSimulation();
    window.snapshot = Sim.captureSimulationBoard();
    const choices = (await import('/js/items/permanentItems.js')).getPermanentStatChoices();
    if (!choices.every(choice => snapshot.stats.some(stat => stat.key === choice.key && stat.name === choice.name))) throw Error('Le catalogue complet des stats et stats + doit être utilisé.');
    window.before = JSON.stringify(E.entites, (k, v) => typeof v === 'function' || v instanceof Node ? undefined : v);
    window.beforeStorage = JSON.stringify(Object.entries(localStorage));
  });
  const report = await page.evaluate(async () => {
    window.progressHistory = [];
    window.report = await Sim.runCombatSimulation(snapshot, { count: 8, durationSeconds: 5, seed: 17 }, {
      onProgress: ({ label, completed, total }) => progressHistory.push({ label, completed, total }),
    });
    return report;
  });
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  assert.equal(report.status, 'complete', report.error);
  assert.equal(report.trials.length, 8);
  assert.equal(report.budget.completed, 8); assert.equal(report.budget.attempted, 8);
  assert.equal(report.summary.count, 8);
  assert.equal('sensitivity' in report, false);
  assert.equal(new Set(report.trials.map(t => t.seed)).size, 8);
  for (const trial of report.trials) assert.deepEqual(trial.entities.map(e => e.initialStats), report.trials[0].entities.map(e => e.initialStats), 'Every fight has exactly the same starting stats');
  const progress = await page.evaluate(() => progressHistory);
  assert.ok(progress.every(p => p.total === 8 && p.completed <= 8));
  assert.equal(progress.at(-1).completed, 8);
  assert.ok(progress.every(p => !p.label.includes('+1')));
  for (const trial of report.trials) {
    assert.equal(trial.end, 'victory');
    assert.equal(trial.winner, 'A');
    assert.equal(trial.entities.filter(e => e.dead).length, 2, 'Both B enemies must die before A wins');
    assert.ok(trial.durationMs > trial.firstDeath.timeMs, 'Group combat continues after the first death');
    assert.ok(trial.durationMs < 5000 && trial.durationMs >= 1000);
    assert.ok(trial.journal.some(e => e.type === 'damage_resolution'));
    assert.ok(trial.journal.some(e => e.type === 'battle_victory'));
  }
  assert.equal(report.summary.winsA, 8); assert.equal(report.summary.winsB, 0);
  assert.equal(report.summary.armies[0].wins, 8);
  assert.equal(report.summary.armies[1].deaths.mean, 2);
  for (const army of report.summary.armies) {
    const sums = report.trials.map(t => t.entities.filter(e => e.side === army.side).reduce((n, e) => n + e.damage, 0));
    assert.equal(army.damage.mean, sums.reduce((a,b) => a+b,0) / 8);
    assert.equal(army.damage.min, Math.min(...sums)); assert.equal(army.damage.max, Math.max(...sums));
  }
  const checks = await page.evaluate(async () => {
    const E = await import("/js/entities/runtime.js");
    const first = await Sim.simulateTrial(snapshot, { seed: report.trials[0].seed, durationMs: 5000, trace: true });
    const timeout = await Sim.simulateTrial(snapshot, { seed: 5, durationMs: 50, trace: true });
    const afterFirstDeath = await Sim.simulateTrial(snapshot, {
      seed: report.trials[0].seed, durationMs: first.firstDeath.timeMs + 1, trace: true,
    });
    // B loses its weak ally first, then its stronger remaining fighter wins.
    const comebackSnapshot = structuredClone(snapshot);
    const strongB = comebackSnapshot.entities[2];
    strongB.baseStats.HP = 1000; strongB.baseStats.physicalDamage = 200;
    strongB.stats.HP = { current: 1000, max: 1000 };
    comebackSnapshot.reserves[strongB.id].HP = { current: 1000, max: 1000 };
    strongB.attackDetails[0].preparationTime = 1800;
    const comeback = await Sim.runCombatSimulation(comebackSnapshot, {
      count: 4, durationSeconds: 10, seed: 17,
    });
    const html = Sim.simulationReportHtml(report, { standalone: true });
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const embedded = JSON.parse(parsed.getElementById('simulation-data').textContent);
    return { untouched: before === JSON.stringify(E.entites, (k,v) => typeof v === 'function' || v instanceof Node ? undefined : v),
      storageUntouched: beforeStorage === JSON.stringify(Object.entries(localStorage)), first, timeout, afterFirstDeath, comeback,
      exported: embedded.trials.length, html, frames: document.querySelectorAll('iframe[title="Calcul isolé"]').length };
  });
  assert.equal(checks.untouched, true); assert.equal(checks.storageUntouched, true);
  assert.equal(checks.timeout.end, 'timeout'); assert.equal(checks.timeout.durationMs, 50);
  assert.equal(checks.timeout.winner, null);
  assert.equal(checks.afterFirstDeath.entities.filter(e => e.dead).length, 1);
  assert.equal(checks.afterFirstDeath.end, 'timeout'); assert.equal(checks.afterFirstDeath.winner, null);
  assert.equal(checks.comeback.status, 'complete', checks.comeback.error);
  const comeback = checks.comeback.trials[0];
  assert.equal(comeback.firstDeath.side, 'B', 'B loses the first entity');
  assert.equal(comeback.end, 'victory'); assert.equal(comeback.winner, 'B', 'B still wins the army battle');
  assert.ok(comeback.durationMs > comeback.firstDeath.timeMs);
  assert.ok(comeback.journal.some(e => e.type === 'battle_defeat'));
  assert.equal(checks.comeback.summary.winsB, 4); assert.equal(checks.comeback.summary.winsA, 0);
  assert.equal(checks.comeback.budget.completed, 4);
  assert.match(checks.html, /Victoires A/);
  assert.match(checks.html, /Camp vainqueur/);
  assert.match(checks.html, /8 \/ 8 combats terminés/);
  assert.match(checks.html, /Moyennes par armée/);
  assert.match(checks.html, /Moyennes par entité/);
  assert.ok(!/comparaison|classement|statistique \+1|référence/i.test(checks.html));
  assert.ok(!/premier mort|Camp opposé|en tête/.test(checks.html));
  assert.equal(checks.first.durationMs, report.trials[0].durationMs);
  assert.deepEqual(checks.first.entities, report.trials[0].entities, 'Seed reproduces metrics exactly');
  assert.equal(checks.exported, 8); assert.equal(checks.frames, 0);
  await writeFile(resolve(output, 'rapport.html'), checks.html);
  // The downloaded report starts small; opening a journal must restore every
  // event in its original order, without another simulation or network request.
  const reportPage = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const reportErrors = [];
  reportPage.on('pageerror', error => reportErrors.push(error.message));
  await reportPage.setContent(checks.html);
  assert.equal(await reportPage.locator('[data-journal] tr').count(), 0);
  await reportPage.locator('[data-trial-index="0"] > summary').click();
  await reportPage.waitForFunction(() => document.querySelector('[data-trial-index="0"]').dataset.loaded === 'true');
  assert.equal(await reportPage.locator('[data-trial-index="0"] tbody tr').count(), report.trials[0].journal.length);
  const displayedOrder = await reportPage.locator('[data-trial-index="0"] tbody tr td:first-child').allTextContents();
  assert.deepEqual(displayedOrder, report.trials[0].journal.map((_, i) => String(i + 1)));
  assert.equal(await reportPage.locator('[data-trial-index="1"] tr').count(), 0);
  await reportPage.locator('[data-trial-index="0"] > summary').click();
  await reportPage.screenshot({ path: resolve(output, 'rapport.png'), fullPage: true });
  assert.deepEqual(reportErrors, []);
  await reportPage.close();

  const checksExtra = await page.evaluate(async () => {
    for (const count of [0, -1, 1.5, 10001, NaN]) {
      let rejected = false;
      try { await Sim.runCombatSimulation(snapshot, { count, durationSeconds: 1 }); } catch { rejected = true; }
      if (!rejected) throw Error('Budget invalide accepté');
    }
    const cancelled = new AbortController();
    const partial = await Sim.runCombatSimulation(snapshot, { count: 8, durationSeconds: 5, seed: 17 }, {
      signal: cancelled.signal, onProgress: p => { if (p.completed === 3) cancelled.abort(); },
    });
    const row = (id, damage, heal, hpEnd, critical) => ({ id, side: 'A', name: id, damage, heal, hpEnd, dead: hpEnd === 0,
      initialStats: {}, finalStats: {}, details: { procs: { critical } }, phases: {} });
    const aggregate = Sim.summarizeTrials([
      { durationMs: 1000, winner: 'A', entities: [row('a',10,2,5,1), row('b',30,4,0,3)] },
      { durationMs: 2000, winner: 'B', entities: [row('a',30,4,0,2), row('b',10,2,5,0), row('summon',20,3,4,1)] },
    ]);
    const one = await Sim.runCombatSimulation(snapshot, { count: 1, durationSeconds: .05, seed: 17 });
    const escaped = structuredClone(one);
    escaped.snapshot.entities[0].name = '<script>example</script>';
    const html = Sim.simulationReportHtml(escaped, { standalone: true });
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const restoredName = JSON.parse(doc.getElementById('simulation-data').textContent).snapshot.entities[0].name;
    return { partial, aggregate, empty: Sim.summarizeTrials([]), one, restoredName };
  });
  assert.equal(checksExtra.partial.status, 'cancelled');
  assert.equal(checksExtra.partial.budget.attempted, 3); assert.equal(checksExtra.partial.budget.completed, 3);
  assert.equal(checksExtra.partial.trials.length, 3); assert.equal(checksExtra.partial.summary.count, 3);
  assert.equal(checksExtra.one.budget.completed, 1); assert.equal(checksExtra.one.trials.length, 1);
  assert.equal(checksExtra.restoredName, '<script>example</script>');
  const army = checksExtra.aggregate.armies[0];
  assert.deepEqual([army.damage.mean, army.damage.min, army.damage.max], [50,40,60]);
  assert.equal(army.dps.mean, 35); assert.equal(army.heal.mean, 7.5);
  assert.equal(army.survivors.mean, 1.5); assert.equal(army.winRate, .5);
  assert.equal(army.details['procs.critical'], 3.5);
  assert.equal(checksExtra.aggregate.entities.find(e => e.id === 'summon').dps.mean, 10);
  assert.equal(checksExtra.empty.armies[0].damage.mean, 0); assert.equal(checksExtra.empty.armies[0].winRate, 0);
  const deadlineChecks = await page.evaluate(async () => {
    // Trigger the real watchdog without waiting two minutes per failure.
    // Only the parent deadline is shortened; successful fights use the game engine.
    const withDeadlines = async (runs, work) => {
      const original = window.setTimeout;
      let attempted = 0;
      window.setTimeout = function (callback, delay, ...args) {
        if (delay === 120000 && runs.includes(++attempted)) delay = 0;
        return original.call(window, callback, delay, ...args);
      };
      try { return await work(); } finally { window.setTimeout = original; }
    };
    const progress = [];
    const mixed = await withDeadlines([2, 3, 5], () => Sim.runCombatSimulation(snapshot,
      { count: 5, durationSeconds: 5, seed: 17 }, { onProgress: p => progress.push({
        completed: p.completed, processed: p.processed, skipped: p.skipped, total: p.total,
      }) }));
    const allSkipped = await withDeadlines([1, 2], () => Sim.runCombatSimulation(snapshot,
      { count: 2, durationSeconds: 5, seed: 17 }));
    const cancelled = new AbortController();
    const cancelledAfterSkip = await withDeadlines([1], () => Sim.runCombatSimulation(snapshot,
      { count: 5, durationSeconds: 5, seed: 17 }, { signal: cancelled.signal,
        onProgress: p => { if (p.skipped === 1) cancelled.abort(); } }));
    // An unrelated setup error must remain visible and stop the series.
    const broken = await Sim.runCombatSimulation({ ...snapshot, uncloneable: () => {} },
      { count: 5, durationSeconds: 5, seed: 17 });
    const html = Sim.simulationReportHtml(mixed, { standalone: true });
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const restored = JSON.parse(doc.getElementById('simulation-data').textContent);
    const outcomes = [...doc.querySelectorAll('details')].find(d =>
      d.querySelector('summary')?.textContent === 'Résultat de chaque combat');
    const E = await import("/js/entities/runtime.js");
    return { mixed, allSkipped, cancelledAfterSkip, broken, progress, html,
      exportedSkips: restored.skippedTrials, outcomeRuns: [...outcomes.querySelectorAll('tbody tr')].map(r => Number(r.cells[0].textContent)),
      frames: document.querySelectorAll('iframe[title="Calcul isolé"]').length,
      untouched: before === JSON.stringify(E.entites, (k,v) => typeof v === 'function' || v instanceof Node ? undefined : v),
      storageUntouched: beforeStorage === JSON.stringify(Object.entries(localStorage)) };
  });
  assert.equal(deadlineChecks.mixed.status, 'complete', deadlineChecks.mixed.error);
  assert.deepEqual(deadlineChecks.mixed.budget, { requested: 5, attempted: 5, completed: 2, skipped: 3 });
  assert.deepEqual(deadlineChecks.mixed.trials.map(t => t.run), [1, 4]);
  assert.deepEqual(deadlineChecks.mixed.skippedTrials.map(t => t.run), [2, 3, 5]);
  assert.equal(deadlineChecks.mixed.summary.count, 2);
  assert.equal(deadlineChecks.mixed.summary.winsA, 2);
  assert.equal(deadlineChecks.mixed.summary.armies[0].winRate, 1, 'Skipped fights do not dilute the win rate');
  assert.equal(deadlineChecks.mixed.summary.armies[0].damage.mean,
    deadlineChecks.mixed.trials.reduce((sum, t) => sum + t.entities.filter(e => e.side === 'A').reduce((n,e) => n + e.damage, 0), 0) / 2);
  assert.deepEqual(deadlineChecks.mixed.trials[1].entities, report.trials[3].entities, 'Skipping does not change the next scheduled seed or result');
  assert.equal(new Set([...deadlineChecks.mixed.trials, ...deadlineChecks.mixed.skippedTrials].map(t => t.seed)).size, 5);
  assert.deepEqual(deadlineChecks.progress.at(-1), { completed: 2, processed: 5, skipped: 3, total: 5 });
  assert.ok(deadlineChecks.progress.every((p, i, all) => !i || p.processed >= all[i-1].processed));
  assert.equal(deadlineChecks.allSkipped.status, 'complete');
  assert.deepEqual(deadlineChecks.allSkipped.budget, { requested: 2, attempted: 2, completed: 0, skipped: 2 });
  assert.equal(deadlineChecks.allSkipped.summary.count, 0);
  assert.equal(deadlineChecks.cancelledAfterSkip.status, 'cancelled');
  assert.deepEqual(deadlineChecks.cancelledAfterSkip.budget, { requested: 5, attempted: 1, completed: 0, skipped: 1 });
  assert.equal(deadlineChecks.broken.status, 'error');
  assert.equal(deadlineChecks.broken.budget.attempted, 1); assert.equal(deadlineChecks.broken.budget.skipped, 0);
  assert.equal(deadlineChecks.frames, 0); assert.equal(deadlineChecks.untouched, true); assert.equal(deadlineChecks.storageUntouched, true);
  assert.deepEqual(deadlineChecks.exportedSkips, deadlineChecks.mixed.skippedTrials);
  assert.deepEqual(deadlineChecks.outcomeRuns, [1, 2, 3, 4, 5]);
  assert.match(deadlineChecks.html, /exclues des moyennes et des taux de victoire/);
  await writeFile(resolve(output, 'rapport-delais.html'), deadlineChecks.html);
  console.log('PASS: watchdog deadlines skip only the affected fights, keep the exact attempt budget, preserve later results and remain visible in the report.');
  const advanced = await page.evaluate(async () => {
    const make = ({ range = 'melee', hp = 1000, armor = 0, effect = [], extraLife = 0, cooldown = 1500 } = {}) => {
      const s = structuredClone(snapshot);
      s.entities = s.entities.slice(0, 2);
      for (const entity of s.entities) {
        entity.baseStats = { HP: hp, armor, extraLife, physicalDamage: 11, strength: 0, speed: 100 };
        entity.stats.HP = { current: hp, max: hp };
        entity.stats.armor = { current: armor, max: armor };
        const attack = entity.attackDetails[0];
        attack.attackRange = [range]; attack.preparationTime = 100; attack.executionTime = 400;
        attack.recoveryTime = 100; attack.cooldown = cooldown; attack.effets = effect;
        s.reserves[entity.id].HP = { current: hp, max: hp };
        s.reserves[entity.id].armor = { current: armor, max: armor };
        s.reserves[entity.id].extraLife = { current: extraLife, max: extraLife };
      }
      return s;
    };
    const range = await Sim.simulateTrial(make({ range: 'range', armor: 15 }), { seed: 27, durationMs: 6000, trace: true });
    const poison = await Sim.simulateTrial(make({ range: 'range', effect: ['poison'], cooldown: 20000 }), { seed: 27, durationMs: 6000, trace: true });
    const lives = await Sim.simulateTrial(make({ hp: 5, extraLife: 1 }), { seed: 27, durationMs: 6000, trace: true });
    const long = await Sim.simulateTrial(make({ cooldown: 5000 }), { seed: 27, durationMs: 180000, trace: false });
    return { range, poison, lives, long };
  });
  await writeFile(resolve(output, 'advanced.json'), JSON.stringify(advanced, null, 2));
  assert.equal(advanced.range.end, 'timeout');
  assert.ok(advanced.range.entities.every(e => e.actions >= 3 && e.damage > 0));
  assert.ok(advanced.range.entities.some(e => e.details.armorDamageDealt > 0));
  assert.ok(advanced.poison.journal.filter(e => e.type === 'damage_resolution').length > 2, 'Periodic effects run after the initial hit');
  assert.ok(advanced.lives.journal.some(e => e.type === 'extra_life_used'), 'Additional lives resolve before victory');
  assert.equal(advanced.lives.end, 'draw'); assert.equal(advanced.lives.winner, null);
  assert.equal(advanced.lives.entities.filter(e => e.dead).length, 2);
  assert.ok(advanced.long.durationMs <= 180000 && advanced.long.entities[0].actions > 10, 'Multiple turns run through a long horizon');
  await page.locator('[data-sim="duration"]').fill('5');
  await page.locator('[data-sim="count"]').fill('2');
  await page.evaluate(() => {
    window.originalSimulationTimeout = window.setTimeout;
    window.setTimeout = (callback, delay, ...args) => originalSimulationTimeout(callback, delay === 120000 ? 0 : delay, ...args);
  });
  try {
    await page.locator('[data-sim="run"]').click();
    await page.locator('[data-sim="view"]:not(:disabled)').waitFor();
    assert.match(await page.locator('[data-sim="status"]').innerText(), /2 \/ 2 combats traités · 0 terminés · 2 hors délai/);
    assert.equal(await page.locator('[data-sim="progress"]').evaluate(e => e.value), 2);
    assert.equal(await page.locator('[data-sim="download"]').isEnabled(), true, 'Export remains available when every fight exceeded its deadline');
    await page.locator('[data-sim="view"]').click();
    assert.match(await page.locator('#simulation-report-dialog').innerText(), /0 \/ 2 combats terminés/);
    await page.locator('#simulation-report-dialog').getByRole('button', { name: 'Fermer', exact: true }).click();
    assert.equal(await page.locator('iframe[title="Calcul isolé"]').count(), 0);
  } finally { await page.evaluate(() => { window.setTimeout = originalSimulationTimeout; delete window.originalSimulationTimeout; }); }
  await page.locator('[data-sim="count"]').fill('14');
  assert.equal(await page.locator('#admin-combat-simulation input').count(), 2, 'Only duration and number of fights');
  assert.equal(await page.locator('#admin-combat-simulation select').count(), 0);
  assert.match(await page.locator('[data-sim="estimate"]').innerText(), /14 combats du même affrontement/);
  await page.locator('[data-sim="run"]').click();
  await page.locator('[data-sim="view"]:not(:disabled)').waitFor({ timeout: 60000 });
  assert.match(await page.locator('[data-sim="status"]').innerText(), /Terminé/);
  assert.match(await page.locator('[data-sim="status"]').innerText(), /14 \/ 14 combats/);
  const downloadEvent = page.waitForEvent('download');
  await page.locator('[data-sim="download"]').click();
  const download = await downloadEvent;
  await download.saveAs(resolve(output, 'rapport-bouton.html'));
  await page.locator('[data-sim="view"]').click();
  assert.ok(await page.locator('#simulation-report-dialog').isVisible());
  await page.locator('#simulation-report-dialog').getByRole('button', { name: 'Fermer', exact: true }).click();
  await page.locator('[data-sim="count"]').fill('100');
  await page.locator('[data-sim="run"]').click();
  await page.locator('[data-sim="cancel"]:not(:disabled)').waitFor();
  await page.locator('[data-sim="cancel"]').click();
  await page.locator('[data-sim="run"]:not(:disabled)').waitFor();
  assert.match(await page.locator('[data-sim="status"]').innerText(), /annulée/);
  assert.equal(await page.locator('iframe[title="Calcul isolé"]').count(), 0);
  await page.screenshot({ path: resolve(output, 'options.png') });
  const batchCount = Number(process.env.SIMULATION_BATCH_COUNT || 100);
  const batch = await page.evaluate(async count => {
    const started = performance.now();
    const result = await Sim.runCombatSimulation(snapshot, { count, durationSeconds: 180, seed: 104 });
    return { status: result.status, error: result.error, count: result.trials.length, milliseconds: performance.now() - started,
      deaths: result.trials.map(t => t.entities.filter(e => e.dead).length),
      winners: result.trials.map(t => t.winner),
      frames: document.querySelectorAll('iframe[title="Calcul isolé"]').length };
  }, batchCount);
  await writeFile(resolve(output, `batch-${batchCount}.json`), JSON.stringify(batch, null, 2));
  assert.equal(batch.status, 'complete', batch.error);
  assert.equal(batch.count, batchCount); assert.ok(batch.deaths.every(n => n === 2));
  assert.ok(batch.winners.every(side => side === 'A')); assert.equal(batch.frames, 0);
  // Count actual trials and check identical starts, distinct seeds and real proc variation.
  const randomBatchCount = Number(process.env.SIMULATION_RANDOM_BATCH_COUNT || 100);
  const exactBatch = await page.evaluate(async count => {
    let framesCreated = 0;
    const observer = new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) {
        if (node.nodeName === 'IFRAME' && node.title === 'Calcul isolé') framesCreated++;
      }
    });
    observer.observe(document.body, { childList: true });
    const randomBoard = structuredClone(snapshot);
    for (const entity of randomBoard.entities) {
      Object.assign(entity.baseStats, { HP: 500, physicalDamage: 12, criticalChance: 50, dodge: 25 });
      entity.stats.HP = { current: 500, max: 500 };
      randomBoard.reserves[entity.id].HP = { current: 500, max: 500 };
    }
    const result = await Sim.runCombatSimulation(randomBoard, { count, durationSeconds: 2, seed: 104 });
    observer.disconnect();
    const starts = result.trials.map(t => JSON.stringify(t.entities.map(e => e.initialStats)));
    return { status: result.status, error: result.error, budget: result.budget, framesCreated,
      retained: result.trials.length, summaryCount: result.summary.count,
      identicalStarts: starts.every(s => s === starts[0]), distinctSeeds: new Set([...result.trials, ...result.skippedTrials].map(t => t.seed)).size,
      skippedTrials: result.skippedTrials,
      distinctDamage: new Set(result.trials.map(t => t.entities[0].damage)).size,
      remainingFrames: document.querySelectorAll('iframe[title="Calcul isolé"]').length };
  }, randomBatchCount);
  await writeFile(resolve(output, `budget-${randomBatchCount}.json`), JSON.stringify(exactBatch, null, 2));
  assert.equal(exactBatch.status, 'complete', exactBatch.error);
  assert.equal(exactBatch.framesCreated, randomBatchCount); assert.equal(exactBatch.budget.attempted, randomBatchCount);
  assert.equal(exactBatch.budget.completed + exactBatch.budget.skipped, randomBatchCount);
  assert.equal(exactBatch.retained, exactBatch.budget.completed);
  assert.equal(exactBatch.skippedTrials.length, exactBatch.budget.skipped);
  assert.equal(exactBatch.summaryCount, exactBatch.budget.completed); assert.equal(exactBatch.identicalStarts, true);
  assert.equal(exactBatch.distinctSeeds, randomBatchCount); assert.ok(exactBatch.distinctDamage > 1, 'Random procs change results without changing starting stats');
  assert.equal(exactBatch.remainingFrames, 0);
  const exportedPage = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  await exportedPage.goto(`file:///${resolve(output, 'rapport-bouton.html').replaceAll('\\', '/')}`);
  assert.equal(await exportedPage.locator('[data-sim-ranking]').count(), 0);
  assert.ok(await exportedPage.getByRole('heading', { name: 'Moyennes par armée', exact: true }).isVisible());
  assert.ok(await exportedPage.getByRole('heading', { name: 'Moyennes par entité', exact: true }).isVisible());
  const exported = await exportedPage.locator('#simulation-data').textContent();
  assert.equal(JSON.parse(exported).trials.length, 14);
  await exportedPage.screenshot({ path: resolve(output, 'rapport.png') });
  await exportedPage.close();
  if (profiler) {
    const { profile } = await profiler.send('Profiler.stop');
    await writeFile(resolve(output, 'cpu-profile.json'), JSON.stringify(profile));
    const times = new Map();
    profile.samples.forEach((id, i) => times.set(id, (times.get(id) || 0) + profile.timeDeltas[i]));
    const totals = new Map();
    for (const node of profile.nodes) {
      const label = `${node.callFrame.functionName || '(anonymous)'} ${node.callFrame.url?.split('/').slice(-2).join('/')}:${node.callFrame.lineNumber + 1}`;
      totals.set(label, (totals.get(label) || 0) + (times.get(node.id) || 0) / 1000);
    }
    console.log([...totals].sort((a, b) => b[1] - a[1]).slice(0, 25));
  }
  console.log(`PASS: ${randomBatchCount} unchanged fight attempts, distinct random seeds/procs, entity and army averages, full camp victories, deadline continuation, cancellation, reproducibility, isolated board/storage and report export.`);
  const book = await page.evaluate(async () => {
    const S = await import("/js/storage/gameStorage.js"), B = await import("/js/combat/journal.js");
    const key = 'BattleLog_report_readability_fixture';
    const entries = [
      { type: 'battle_start', time: '00:00', message: 'Début' },
      { type: 'attack_missed', time: '00:01', message: 'Sort raté. Corps astral.' },
      { type: 'entity_move', time: '00:01', message: 'Déplacement vers la case 4.' },
      { type: 'extra_life_used', time: '00:02', message: 'Vie supplémentaire consommée.' },
      { type: 'entity_death', time: '00:03', message: 'Mort définitive.' },
      { type: 'battle_victory', time: '00:03', message: 'Victoire.' },
    ];
    const meta = { key, stageId: 'readability', stageName: 'Rapport test', statut: 'finished', createdAt: new Date().toISOString(), attemptNumber: 1 };
    S.saveToLocalStorage('BattleLogsIndex', { logs: [meta] });
    S.saveToLocalStorage(key, { ...meta, entries });
    const saved = JSON.stringify(S.loadFromLocalStorage(key));
    const root = document.querySelector('.battle-book-report-content') || document.body.appendChild(Object.assign(document.createElement('div'), { className: 'battle-book-report-content' }));
    B.renderBattleBookReport(key);
    const detail = root.querySelector('.battle-book-chronology');
    const before = detail.querySelectorAll('.battle-book-entry').length;
    detail.open = true;
    await new Promise(resolve => setTimeout(resolve, 0));
    const all = [...detail.querySelectorAll('.battle-book-entry')].map(node => node.textContent);
    detail.open = false; detail.open = true;
    await new Promise(resolve => setTimeout(resolve, 0));
    return { before, all, expected: entries.map(e => `[${e.time}] ${e.message}`),
      unchanged: saved === JSON.stringify(S.loadFromLocalStorage(key)), final: detail.querySelectorAll('.battle-book-entry').length };
  });
  assert.equal(book.before, 0); assert.deepEqual(book.all, book.expected); assert.equal(book.final, book.expected.length); assert.equal(book.unchanged, true);
} finally { await browser.close(); await new Promise(done => server.close(done)); }
