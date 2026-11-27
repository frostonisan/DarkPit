import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('docs'), output = resolve('outputs/target-death-after-launch');
await mkdir(output, { recursive: true });

// Only the test server injects this scenario into the simulator. The production
// combat, death, recovery and cooldown implementations run without substitutions.
async function installScenario(scenario) {
  const { entites } = await import("/js/entities/runtime.js");
  const A = await import("/js/combat/vitals.js"), R = await import("/js/combat/attackResolution.js");
  const C = await import("/js/combat/clock.js");
  const { isBattleFinished } = await import("/js/app/state.js");
  const [caster, survivor, target] = entites, epoch = C.clockNow();
  Math.random = () => .5;
  const log = data => window.dispatchEvent(new CustomEvent('combatLogEntry', { detail: { type: 'test_checkpoint', data } }));
  const snapshot = label => {
    // Projectile clocks remain active after the caster has entered recovery;
    // inspect the registered flight state, not just its current action timer.
    const flights = C.captureCombatState().flights.active.filter(record => record.flight.attacker === caster.id);
    log({ label, phase: caster.currentPhase, stage: caster._combatAction?.stage,
    targetId: caster._combatAction?.target?.entity, turn: caster.turnCount,
    timer: caster._phaseTimer?.phase, timerEnd: caster._phaseTimer ? caster._phaseTimer.endTime - epoch : null,
    cooldown: R.getAttackRuntime(caster, caster.attackDetails[0]).readyAt - epoch,
    impactDeadline: flights.length ? Math.max(...flights.map(record => record.at)) - epoch : null,
    flightIds: flights.map(record => record.flight.id),
    targetDead: target.isDEAD, targetHp: target.stats.HP.current, survivorHp: survivor.stats.HP.current,
    battleFinished: isBattleFinished() });
  };
  C.setTimeout(() => {
    snapshot('before-death');
    if (scenario.kill) { target.stats.HP.current = 0; A.LifeandDeath(target); }
    snapshot('after-death');
  }, scenario.deathAt);
  for (const [label, at] of [
    ['preparing', 1100], ['launched', 3050], ['recovery-range', 3600], ['range-recovered', 3900],
    ['before-melee-impact', 4550], ['recovery-melee', 4650], ['after-range-impact', 5050],
    ['melee-recovered', 5450], ['cooldown-wait', 6500], ['next-cast', 7050], ['end', 8000],
  ]) C.setTimeout(() => snapshot(label), at);
  document.addEventListener('entityTurnCompleted', ({ detail }) => {
    if (detail.entityId === caster.id) log({ label: 'turn-completed', reason: detail.reason, turn: detail.turnCount });
  });
}
const setupModule = `export const install = ${installScenario.toString()};`;
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (path === '/__target-death-fixture.js') return res.writeHead(200, { 'Content-Type': 'text/javascript' }).end(setupModule);
  const file = resolve(root, '.' + path), rel = relative(root, file);
  if (rel === '..' || rel.startsWith('..' + sep)) return res.writeHead(403).end();
  try {
    let data = await readFile(file);
    if (path === "/js/debug/simulationRuntime.js") {
      const source = data.toString();
      assert.ok(source.includes('  G.startGame();'));
      data = source.replace('  G.startGame();', `  G.startGame();\n  if (input.validationCase) await (await import('/__target-death-fixture.js')).install(input.validationCase);`);
    }
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif' })[extname(file)] || 'application/octet-stream');
    res.end(data);
  } catch (error) { res.writeHead(404).end(String(error)); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [], reports = [];
async function fixture(side, scenario) {
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const timeout = window.setTimeout.bind(window), clear = window.clearTimeout.bind(window);
    window.setTimeout = (...args) => (window.__testTimers?.setTimeout || timeout)(...args);
    window.clearTimeout = (...args) => (window.__testTimers?.clearTimeout || clear)(...args);
  });
  await page.goto(origin + '/index.html');
  await page.evaluate(async ({ side, scenario }) => {
    const UI = await import("/js/ui/application.js"), E = await import("/js/entities/runtime.js"), Create = await import("/js/rendering/entities.js");
    const Storage = await import("/js/storage/gameStorage.js"), G = await import("/js/app/state.js"), F = await import("/js/combat/loop.js");
    const Sim = await import("/js/debug/simulation.js"), Timeline = await import("/js/combat/timeline.js"), Clock = await import("/js/combat/clock.js");
    const { balanceData } = await import('/js/data/balanceData.js'); balanceData.brokenSpell.chance.basePercent = 0;
    UI.createGameContainer(); UI.GameUi(); Storage.setAdminMode(true); window.levelRunning = 'admin';
    G.configureBattleActionManager({ createStartButton: x => x, createFleeButton: x => x, createQuitButton: x => x });
    document.querySelector('.worldmap')?.remove();
    const grid = document.createElement('div'); grid.id = 'hexGrid'; grid.className = 'hex-grid';
    grid.style.cssText = 'position:absolute;top:100px;left:50px;width:1000px;height:300px';
    document.getElementById('game-container').append(grid); E.entites.length = 0;
    const template = (await import("/js/data/entityTemplates.js")).entitesNest.find(e => e.serial === 900013);
    for (const [i, camp] of [side, side === 'A' ? 'B' : 'A', side === 'A' ? 'B' : 'A'].entries()) {
      const hex = document.createElement('div'); hex.className = `hex Side${camp} occupied`;
      Object.assign(hex.dataset, { position: String(i + 1), row: '1', col: String(i * 3) });
      hex.style.cssText = `position:absolute;left:${i * 250}px;top:40px;width:180px;height:200px`; grid.append(hex);
      const physical = scenario.kind === 'physical';
      const entity = E.enrichEntityStats({ ...structuredClone(template), id: 999960 + i, name: ['Lanceur', 'Survivant', 'Cible'][i],
        side: camp, type: 'sbire', role: 'gueux', position: String(i + 1), level: 1, awakening: 1, stuff: {}, stats: {}, modifierStats: {},
        baseStats: { HP: 10000, armor: 0, strength: 0, intelligence: 0, agility: 0, magicalDamage: physical ? 0 : 50, physicalDamage: physical ? 50 : 0,
          magicalResistance: 0, alterationResistance: 0, resilienceTotal: 0, speed: i === 0 ? 1000 : 60000 },
        attacks: [{ functionName: `death-flight-${i}`, attackId: `death-flight-${i}`, displayName: `Attaque ${i}`,
          combatFunction: 'Attaquant', attacknature: [physical ? 'physicalDamage' : 'magicalDamage'], attackRange: [scenario.kind === 'melee' ? 'melee' : 'range'],
          attackTarget: ['enemy'], deadTarget: ['no'], effets: [], selfEffects: [], preparationTime: 2000,
          executionTime: 2000, recoveryTime: 800, cooldown: 6000,
          magicalRatio: physical ? 0 : 1, physicalRatio: physical ? 1 : 0, piercingRatio: 0 }] });
      entity.isDEAD = false; entity.statut = ['alive']; if (i) entity.stats.HP.current = i === 1 ? 9000 : 8000;
      E.entites.push(entity); const created = Create.createEntiteInDOM(entity); hex.append(created.element); await created.spriteReady;
    }
    const boardController = await import('/js/board/controller.js');
    boardController.invalidateFootprintGeometry(grid); boardController.rebuildBoardOccupancy(grid);
    window.test = { E, G, F, Sim, Timeline, Clock, scenario };
  }, { side, scenario });
  return page;
}
async function liveTrial(page, durationMs) {
  return page.evaluate(async durationMs => {
    const { G, F, Clock, Timeline, scenario } = test;
    const install = (await import('/__target-death-fixture.js')).install;
    const nativeDate = Date.now, nativeRandom = Math.random;
    let now = Date.now(), sequence = 0; const epoch = now, timers = new Map(), journal = [];
    const channel = new MessageChannel();
    const flush = () => new Promise(done => { channel.port1.onmessage = done; channel.port2.postMessage(null); });
    window.__testTimers = { setTimeout: (fn, ms = 0, ...args) => { const id = ++sequence; timers.set(id, { at: now + ms, fn: () => fn(...args) }); return id; }, clearTimeout: id => timers.delete(id) };
    Date.now = () => now; Math.random = () => .5;
    const listen = ({ detail: { type, data } }) => {
      if (type === 'test_checkpoint') journal.push({ timeMs: Clock.clockNow() - epoch, type, ...data });
      if (type === 'damage_resolution') journal.push({ timeMs: Clock.clockNow() - epoch, type, damage: data.damage,
        attacker: { id: data.attacker.id }, target: { id: data.target.id } });
      if (type === 'entity_death') journal.push({ timeMs: Clock.clockNow() - epoch, type, entity: { id: data.entity.id } });
    };
    window.addEventListener('combatLogEntry', listen);
    try {
      F.initFightEntites(); G.startGame(); await install(scenario);
      const end = now + durationMs; let steps = 0;
      while (true) {
        await flush(); await Timeline.settleCombatTimeline(); await flush();
        const due = [...timers].filter(([, task]) => task.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        if (++steps > 30000) throw Error('Timer loop');
        const [id, task] = due; now = Math.max(now, task.at); timers.delete(id); task.fn();
      }
      return { journal, steps };
    } finally {
      G.StopGame({ preserveScene: true }); window.removeEventListener('combatLogEntry', listen);
      Date.now = nativeDate; Math.random = nativeRandom; delete window.__testTimers; channel.port1.close(); channel.port2.close();
    }
  }, durationMs);
}
function verify(trial, side, scenario, mode) {
  const checkpoint = label => trial.journal.find(row => row.type === 'test_checkpoint' && row.label === label);
  const ownHits = trial.journal.filter(row => row.type === 'damage_resolution' && row.attacker?.id === 999960);
  const completions = trial.journal.filter(row => row.type === 'test_checkpoint' && row.label === 'turn-completed');
  const prefix = `${mode}/${side}/${scenario.kind}/${scenario.deathAt}/${scenario.kill ? 'dead' : 'alive'}`;
  const melee = scenario.kind === 'melee', impact = melee ? 4600 : 5000;
  const recoveryStart = melee ? impact : 3000, recoveryEnd = recoveryStart + 800;
  assert.equal(checkpoint('preparing')?.targetId, 999962, prefix + ': prepares on intended target');
  assert.equal(checkpoint('launched').impactDeadline, impact, prefix + ': attack released before target death');
  assert.ok(scenario.deathAt > 3000 && scenario.deathAt < impact, prefix + ': death occurs during execution/flight');
  assert.equal(checkpoint('after-death').targetDead, scenario.kill, prefix + ': real death state applied');
  assert.equal(checkpoint('after-death').impactDeadline, impact, prefix + ': scheduled impact remains committed');
  assert.deepEqual(checkpoint('after-death').flightIds, checkpoint('launched').flightIds, prefix + ': original flight retained');
  assert.equal(checkpoint('after-death').stage, checkpoint('before-death').stage, prefix + ': no action restart on death');
  for (const label of ['preparing', 'launched', 'after-death', 'cooldown-wait']) {
    assert.equal(checkpoint(label).cooldown, 7000, prefix + ': cooldown deadline unchanged at ' + label);
  }
  const recovery = checkpoint(melee ? 'recovery-melee' : 'recovery-range');
  assert.equal(recovery.phase, 'attack_5', prefix + ': normal recovery phase');
  assert.equal(recovery.timer, 'recoveryTime', prefix + ': normal recovery timer');
  assert.equal(recovery.timerEnd, recoveryEnd, prefix + ': original recovery deadline');
  assert.equal(completions.length, 1, prefix + ': exactly one completed turn');
  assert.equal(completions[0].timeMs, recoveryEnd, prefix + ': recovery finishes at normal deadline');
  assert.ok(!completions[0].reason, prefix + ': no pre-execution invalid-target penalty');
  if (melee) assert.equal(checkpoint('before-melee-impact').stage, 'transport', prefix + ': finishes full melee execution');
  else assert.equal(checkpoint('range-recovered').phase, 'Entite Turn', prefix + ': next turn starts while projectile still in flight');
  assert.equal(checkpoint('cooldown-wait').phase, 'cooldown-wait', prefix + ': next turn waits for original cooldown');
  assert.equal(checkpoint('next-cast').stage, 'preparation', prefix + ': next cast starts when cooldown expires');
  assert.equal(checkpoint('next-cast').cooldown, 13000, prefix + ': next cooldown starts at 7000 only');
  assert.equal(checkpoint('next-cast').targetId, scenario.kill ? 999961 : 999962, prefix + ': correct next target');
  assert.equal(checkpoint('end').survivorHp, 9000, prefix + ': launched attack never redirects to surviving enemy');
  assert.ok(!checkpoint('end').battleFinished, prefix + ': survivor prevents premature battle end');
  assert.deepEqual(checkpoint('end').flightIds, [], prefix + ': impact resolved without a lingering flight');
  if (scenario.kill) {
    assert.equal(ownHits.length, 0, prefix + ': no damage on corpse or other entity');
    assert.equal(checkpoint('end').targetHp, 0, prefix + ': corpse receives no damage');
    const deaths = trial.journal.filter(row => row.type === 'entity_death' && row.entity?.id === 999962);
    assert.equal(deaths.length, 1, prefix + ': exactly one actual death');
    assert.equal(deaths[0].timeMs, scenario.deathAt, prefix + ': death before impact verified');
  } else {
    assert.equal(ownHits.length, 1, prefix + ': living control target receives one impact');
    assert.equal(ownHits[0].timeMs, impact, prefix + ': control impact at expected deadline');
    assert.equal(ownHits[0].target.id, 999962, prefix + ': control hits original target');
    assert.ok(ownHits[0].damage > 0, prefix + ': control attack deals damage');
  }
  return { impact, recoveryStart, recoveryEnd, nextPreparation: 7000, cooldownEnd: 7000 };
}
try {
  for (const side of ['A', 'B']) for (const kind of ['melee', 'physical', 'magical']) {
    for (const deathAt of kind === 'melee' ? [3500] : [3500, 4500]) {
      const controls = {};
      for (const kill of [false, true]) {
        const scenario = { kind, deathAt, kill }, page = await fixture(side, scenario), durationMs = 8100;
        const simulated = await page.evaluate(({ durationMs, scenario }) => test.Sim.simulateTrial(test.Sim.captureSimulationBoard(), {
          seed: 193, durationMs, trace: true, validationCase: scenario,
        }), { durationMs, scenario });
        const name = `${side}-${kind}-${deathAt}-${kill ? 'dead' : 'alive'}`;
        await writeFile(resolve(output, `simulation-${name}.json`), JSON.stringify(simulated, null, 2));
        const simTiming = verify(simulated, side, scenario, 'simulator');
        const live = await liveTrial(page, durationMs);
        await writeFile(resolve(output, `game-${name}.json`), JSON.stringify(live, null, 2));
        const liveTiming = verify(live, side, scenario, 'game');
        assert.deepEqual(liveTiming, simTiming, name + ': game and simulator timing parity');
        if (!kill) controls.timing = liveTiming;
        else assert.deepEqual(liveTiming, controls.timing, name + ': death does not change normal timings');
        reports.push({ side, ...scenario, modes: ['game', 'simulator'], ...liveTiming });
        console.log(`PASS ${name} (game + simulator)`); await page.close();
      }
    }
  }
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'summary.json'), JSON.stringify(reports, null, 2));
  console.log(`Target death after launch: ${reports.length * 2} scenarios passed.`);
} finally { await browser.close(); await new Promise(done => server.close(done)); }
