import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('docs'), output = resolve('outputs/pre-execution-target');
await mkdir(output, { recursive: true });

// Test-only setup, shared by the real board and the isolated simulator document.
// It applies normal game effects and schedules mutations through the combat clock.
async function installScenario(kind) {
  const { entites } = await import("/js/entities/runtime.js");
  const A = await import("/js/combat/vitals.js"), R = await import("/js/combat/attackResolution.js");
  const C = await import("/js/combat/clock.js");
  const { getAttackTransportDeadline } = await import("/js/combat/attacks.js");
  const [caster, first, second] = entites;
  const epoch = C.clockNow();
  Math.random = () => .5;
  const charm = (target, seconds) => A.applyEffect(target, 'charme', caster, {
    functionName: 'fixture-charme', effets: ['charme'], effectOverrides: { charme: { effectDuration: seconds } },
  });
  if (['charme', 'valid-again', 'launched-range', 'launched-melee'].includes(kind)) {
    charm(first, kind.startsWith('launched') ? 3.5 : 1.5); charm(second, 60);
    if (kind === 'valid-again') C.setTimeout(() => charm(first, 60), 2000);
  } else {
    if (kind === 'death-notified') A.applyEffect(second, 'lenteur', caster, {
      effets: ['lenteur'], effectOverrides: { lenteur: { effectDuration: 60, effectSlowPercent: 0 } },
    });
    C.setTimeout(() => {
      if (kind.startsWith('death')) { second.stats.HP.current = 0; A.LifeandDeath(second); }
      else { second.side = caster.side; R.notifyAttackSelection(second); }
    }, 1500);
  }
  const log = data => window.dispatchEvent(new CustomEvent('combatLogEntry', { detail: { type: 'test_checkpoint', data } }));
  for (const [label, at] of [['preparing', 1100], ['changed', 1600], ['boundary', 3050], ['charged', 4050], ['next-cast', 7050]]) {
    C.setTimeout(() => log({ label, phase: caster.currentPhase, stage: caster._combatAction?.stage,
      targetId: caster._combatAction?.target?.entity, turn: caster.turnCount, speedTimer: caster.speedTimer,
      cooldown: R.getAttackRuntime(caster, caster.attackDetails[0]).readyAt - epoch,
      impactDeadline: getAttackTransportDeadline(caster) - epoch,
      firstSide: first.side, secondSide: second.side }), at);
  }
  document.addEventListener('entityTurnCompleted', ({ detail }) => {
    if (detail.entityId === caster.id) log({ label: 'turn-completed', reason: detail.reason, turn: detail.turnCount });
  });
}
const setupModule = `export const install = ${installScenario.toString()};`;
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (path === '/__pre-execution-fixture.js') return res.writeHead(200, { 'Content-Type': 'text/javascript' }).end(setupModule);
  const file = resolve(root, '.' + path), rel = relative(root, file);
  if (rel === '..' || rel.startsWith('..' + sep)) return res.writeHead(403).end();
  try {
    let data = await readFile(file);
    if (path === "/js/debug/simulationRuntime.js") {
      const source = data.toString();
      assert.ok(source.includes('  G.startGame();'));
      data = source.replace('  G.startGame();', `  G.startGame();\n  if (input.validationCase) await (await import('/__pre-execution-fixture.js')).install(input.validationCase);`);
    }
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif' })[extname(file)] || 'application/octet-stream');
    res.end(data);
  } catch (error) { res.writeHead(404).end(String(error)); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [], reports = [];
async function fixture(side, kind) {
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const timeout = window.setTimeout.bind(window), clear = window.clearTimeout.bind(window);
    window.__nativeTimeout = timeout;
    window.setTimeout = (...args) => (window.__testTimers?.setTimeout || timeout)(...args);
    window.clearTimeout = (...args) => (window.__testTimers?.clearTimeout || clear)(...args);
  });
  await page.goto(origin + '/index.html');
  await page.evaluate(async ({ side, kind }) => {
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
      const entity = E.enrichEntityStats({ ...structuredClone(template), id: 999960 + i, name: ['Lanceur', 'B1', 'B2'][i],
        side: camp, type: 'sbire', role: 'gueux', position: String(i + 1), level: 1, awakening: 1, stuff: {}, stats: {}, modifierStats: {},
        baseStats: { HP: 10000, armor: 0, strength: 0, intelligence: 0, agility: 0, magicalDamage: 50, physicalDamage: 0,
          magicalResistance: 0, alterationResistance: 0, resilienceTotal: 0, speed: i === 0 ? 1000 : 60000 },
        attacks: [{ functionName: `boundary-${i}`, attackId: `boundary-${i}`, displayName: `Attaque ${i}`,
          combatFunction: 'Attaquant', attacknature: ['magicalDamage'], attackRange: [kind === 'launched-melee' ? 'melee' : 'range'],
          attackTarget: ['enemy'], deadTarget: ['no'], effets: [], selfEffects: [], preparationTime: 2000,
          executionTime: kind.startsWith('launched') ? 2000 : 100, recoveryTime: 100, cooldown: 6000,
          magicalRatio: 1, physicalRatio: 0, piercingRatio: 0 }] });
      entity.isDEAD = false; entity.statut = ['alive']; if (i) entity.stats.HP.current = i === 1 ? 9000 : 8000;
      E.entites.push(entity); const created = Create.createEntiteInDOM(entity); hex.append(created.element); await created.spriteReady;
    }
    window.test = { E, G, F, Sim, Timeline, Clock, kind };
  }, { side, kind });
  return page;
}
async function liveTrial(page, durationMs) {
  return page.evaluate(async durationMs => {
    const { G, F, Clock, Timeline, kind } = test;
    const install = (await import('/__pre-execution-fixture.js')).install;
    const nativeDate = Date.now, nativeRandom = Math.random;
    let now = Date.now(), sequence = 0; const epoch = now, timers = new Map(), journal = [];
    const channel = new MessageChannel();
    const flush = () => new Promise(done => { channel.port1.onmessage = done; channel.port2.postMessage(null); });
    window.__testTimers = { setTimeout: (fn, ms = 0, ...args) => { const id = ++sequence; timers.set(id, { at: now + ms, fn: () => fn(...args) }); return id; }, clearTimeout: id => timers.delete(id) };
    Date.now = () => now; Math.random = () => .5;
    const listen = ({ detail: { type, data } }) => {
      if (type === 'test_checkpoint') journal.push({ timeMs: Clock.clockNow() - epoch, type, ...data });
      if (type === 'damage_resolution') journal.push({ timeMs: Clock.clockNow() - epoch, type, damage: data.damage,
        attacker: { id: data.attacker.id, side: data.attacker.side }, target: { id: data.target.id, side: data.target.side } });
    };
    window.addEventListener('combatLogEntry', listen);
    try {
      F.initFightEntites(); G.startGame(); await install(kind);
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
function verify(trial, side, kind, mode) {
  const checkpoint = label => trial.journal.find(row => row.type === 'test_checkpoint' && row.label === label);
  const ownHits = trial.journal.filter(row => row.type === 'damage_resolution' && row.attacker?.id === 999960);
  const invalid = trial.journal.filter(row => row.type === 'test_checkpoint' && row.reason === 'target-invalid');
  const prefix = `${mode}/${side}/${kind}`;
  assert.equal(checkpoint('preparing')?.targetId, 999962, prefix + ': prepares on B2');
  assert.equal(checkpoint('changed')?.stage, 'preparation', prefix + ': no early interruption before the boundary');
  assert.equal(checkpoint('preparing').turn, checkpoint('changed').turn, prefix + ': no free retry');
  if (['charme', 'death', 'death-notified', 'forbidden'].includes(kind)) {
    assert.equal(invalid.length, 1, prefix + ': exactly one rejected turn');
    assert.equal(invalid[0].timeMs, 3000, prefix + ': rejection at end of preparation');
    assert.equal(checkpoint('boundary').phase, 'Entite Turn', prefix + ': full turn restarts');
    assert.equal(checkpoint('boundary').turn, 2, prefix + ': new turn counted once');
    assert.ok(checkpoint('boundary').speedTimer >= 950 && checkpoint('boundary').speedTimer <= 1000,
      prefix + ': full 1000 ms charge, allowing the timer display tick at the checkpoint');
    assert.equal(checkpoint('charged').phase, 'cooldown-wait', prefix + ': wait only after completing the turn charge');
    assert.equal(checkpoint('charged').cooldown, 7000, prefix + ': original cooldown deadline retained');
    assert.equal(checkpoint('next-cast').targetId, 999961, prefix + ': next preparation targets B1');
    assert.equal(ownHits[0]?.timeMs, 9100, prefix + ': next hit requires cooldown and full preparation');
    assert.equal(ownHits[0]?.target.id, 999961, prefix + ': B1 receives the next hit');
    assert.ok(!ownHits.some(row => row.target.id === 999962), prefix + ': rejected B2 receives no damage');
  } else {
    assert.equal(invalid.length, 0, prefix + ': no rejected turn');
    const expectedImpact = kind === 'launched-melee' ? checkpoint('boundary').impactDeadline : kind === 'launched-range' ? 5000 : 3100;
    if (kind === 'launched-melee') assert.ok(expectedImpact > 3500, prefix + ': melee was committed before the charm expiry');
    assert.equal(ownHits[0]?.timeMs, expectedImpact, prefix + ': committed execution keeps its timing');
    assert.equal(ownHits[0]?.target.id, 999962, prefix + ': original target retained');
  }
}
try {
  for (const side of ['A', 'B']) for (const kind of ['charme', 'death', 'death-notified', 'forbidden', 'valid-again', 'launched-range', 'launched-melee']) {
    const page = await fixture(side, kind);
    const durationMs = ['valid-again', 'launched-range', 'launched-melee'].includes(kind) ? 5500 : 9600;
    const simulated = await page.evaluate(({ durationMs, kind }) => test.Sim.simulateTrial(test.Sim.captureSimulationBoard(), {
      seed: 193, durationMs, trace: true, validationCase: kind,
    }), { durationMs, kind });
    await writeFile(resolve(output, `simulation-${side}-${kind}.json`), JSON.stringify(simulated, null, 2));
    verify(simulated, side, kind, 'simulator');
    const live = await liveTrial(page, durationMs);
    await writeFile(resolve(output, `game-${side}-${kind}.json`), JSON.stringify(live, null, 2));
    verify(live, side, kind, 'game');
    reports.push({ side, kind, modes: ['game', 'simulator'] }); console.log(`PASS ${side}: ${kind} (game + simulator)`);
    await page.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'summary.json'), JSON.stringify(reports, null, 2));
  console.log(`Pre-execution target checks: ${reports.length * 2} scenarios passed.`);
} finally { await browser.close(); await new Promise(done => server.close(done)); }
