import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('docs'), output = resolve('outputs/fear-expiry');
await mkdir(output, { recursive: true });

// The server injects only scenario setup into the isolated simulator. Effects,
// timers, targeting, damage, cooldowns and recovery all use production modules.
async function installScenario(config) {
  const E = await import("/js/entities/runtime.js"), A = await import("/js/combat/vitals.js");
  const C = await import("/js/combat/clock.js"), R = await import("/js/combat/attackResolution.js");
  const T = await import("/js/storage/entityStorage.js"), Control = await import("/js/combat/control.js");
  const Effects = await import("/js/combat/effects.js"), G = await import("/js/app/state.js");
  const [target, source] = E.entites, epoch = C.clockNow();
  const expiry = config.at + config.duration;
  // A stale flee attempt after expiry would now succeed, exposing any lingering loop.
  Math.random = () => C.clockNow() - epoch < expiry ? 0 : .999;
  const log = data => window.dispatchEvent(new CustomEvent('combatLogEntry', { detail: { type: 'test_checkpoint', data } }));
  const snapshot = label => {
    const stats = T.getEntityCombatDetails(target);
    log({ label, phase: target.currentPhase, stage: target._combatAction?.stage,
      attackTarget: target._combatAction?.target?.entity, turn: target.turnCount,
      cooldownEnd: R.getAttackRuntime(target, target.attackDetails[0]).readyAt - epoch,
      fear: Boolean(Control.getControlState(target, 'effroi')),
      effectCount: Effects.getActiveEffectStates(target).filter(e => e.kind === 'effroi').length,
      attempts: stats.fleeAttempts || 0, failures: stats.fleeFailures || 0, successes: stats.fleeSuccesses || 0,
      fled: Boolean(target.hasFled), outcome: G.battleOutcome, targetHp: target.stats.HP.current, sourceHp: source.stats.HP.current });
  };
  C.setTimeout(() => {
    snapshot('before');
    A.applyEffect(target, 'effroi', source, { functionName: 'fear-expiry-test', effets: ['effroi'],
      effectOverrides: { effroi: { effectDuration: config.duration / 1000 } } });
    snapshot('applied');
  }, config.at);
  for (const [label, at] of [['active', config.at + config.duration / 2], ['expired', expiry + 100], ['end', 13900]]) {
    C.setTimeout(() => snapshot(label), at);
  }
  let phase = '';
  const monitor = () => {
    const current = `${target.currentPhase}/${target._combatAction?.stage}/${target.turnCount}`;
    if (current !== phase) { phase = current; snapshot('phase'); }
    if (C.clockNow() - epoch < 14000 && !G.isBattleFinished()) C.setTimeout(monitor, 50);
  };
  monitor();
}
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (path === '/__fear-expiry-fixture.js') return res.writeHead(200, { 'Content-Type': 'text/javascript' }).end(`export const install = ${installScenario.toString()};`);
  const file = resolve(root, '.' + path), rel = relative(root, file);
  if (rel === '..' || rel.startsWith('..' + sep)) return res.writeHead(403).end();
  try {
    let data = await readFile(file);
    if (path === "/js/debug/simulationRuntime.js") {
      assert.ok(data.toString().includes('  G.startGame();'));
      data = data.toString().replace('  G.startGame();', `  G.startGame();\n  if (input.validationCase) await (await import('/__fear-expiry-fixture.js')).install(input.validationCase);`);
    }
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif' })[extname(file)] || 'application/octet-stream');
    res.end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [], reports = [];
async function fixture(side, config) {
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('Failed to load resource')) errors.push(message.text()); });
  await page.addInitScript(() => {
    const timeout = window.setTimeout.bind(window), clear = window.clearTimeout.bind(window);
    window.setTimeout = (...args) => (window.__testTimers?.setTimeout || timeout)(...args);
    window.clearTimeout = (...args) => (window.__testTimers?.clearTimeout || clear)(...args);
  });
  await page.goto(origin + '/index.html');
  await page.evaluate(async ({ side, config }) => {
    const U = await import("/js/ui/application.js"), E = await import("/js/entities/runtime.js"), Create = await import("/js/rendering/entities.js");
    const S = await import("/js/storage/gameStorage.js"), G = await import("/js/app/state.js"), F = await import("/js/combat/loop.js");
    const Sim = await import("/js/debug/simulation.js"), Clock = await import("/js/combat/clock.js"), Timeline = await import("/js/combat/timeline.js");
    const { balanceData } = await import('/js/data/balanceData.js'); balanceData.brokenSpell.chance.basePercent = 0;
    U.createGameContainer(); U.GameUi(); S.setAdminMode(true); window.levelRunning = 'admin';
    G.configureBattleActionManager({ createStartButton: e => e, createFleeButton: e => e, createQuitButton: e => e });
    document.querySelector('.worldmap')?.remove();
    const grid = document.createElement('div'); grid.id = 'hexGrid'; grid.className = 'hex-grid';
    grid.style.cssText = 'position:absolute;left:50px;top:100px;width:900px;height:400px';
    document.getElementById('game-container').append(grid); E.entites.length = 0;
    const template = (await import("/js/data/entityTemplates.js")).entitesNest.find(e => e.serial === 900013);
    for (const [i, camp] of [side, side === 'A' ? 'B' : 'A'].entries()) {
      const hex = document.createElement('div'); hex.className = `hex Side${camp} occupied`;
      Object.assign(hex.dataset, { position: String(i + 1), row: '1', col: String(i * 3) });
      hex.style.cssText = `position:absolute;left:${i * 350}px;top:40px;width:180px;height:200px`; grid.append(hex);
      const entity = E.enrichEntityStats({ ...structuredClone(template), id: 999920 + i, name: i ? 'Source' : 'Effrayé',
        side: camp, type: 'sbire', role: 'gueux', position: String(i + 1), level: 1, awakening: 1, stuff: {}, stats: {}, modifierStats: {},
        baseStats: { HP: 10000, armor: 0, strength: 0, intelligence: 0, agility: 0, physicalDamage: 0, magicalDamage: 50,
          velocity: 0, resilienceTotal: 0, hindranceResistance: 0, speed: i ? 60000 : 1000 },
        attacks: [{ functionName: `fear-expiry-${i}`, attackId: `fear-expiry-${i}`, displayName: 'Attaque après Effroi', combatFunction: 'Attaquant',
          attacknature: ['magicalDamage'], attackRange: [config.name === 'melee' ? 'melee' : 'range'], attackTarget: ['enemy'], deadTarget: ['no'],
          effets: [], selfEffects: [], preparationTime: 2000, executionTime: ['melee', 'projectile'].includes(config.name) ? 2000 : 200,
          recoveryTime: 800, cooldown: 6000, magicalRatio: 1, physicalRatio: 0, piercingRatio: 0 }] });
      entity.isDEAD = false; entity.statut = ['alive']; E.entites.push(entity);
      const dom = Create.createEntiteInDOM(entity); hex.append(dom.element); await dom.spriteReady;
    }
    window.test = { E, G, F, Sim, Clock, Timeline, config };
  }, { side, config });
  return page;
}
async function liveTrial(page, realTime = false) {
  return page.evaluate(async realTime => {
    const { G, F, Clock, Timeline, config } = test;
    const nativeDate = Date.now, nativeRandom = Math.random;
    let now = Date.now(), sequence = 0; const epoch = now, timers = new Map(), journal = [];
    const channel = new MessageChannel();
    const flush = () => new Promise(done => { channel.port1.onmessage = done; channel.port2.postMessage(null); });
    if (!realTime) {
      window.__testTimers = { setTimeout: (fn, ms = 0, ...args) => { const id = ++sequence; timers.set(id, { at: now + ms, fn: () => fn(...args) }); return id; }, clearTimeout: id => timers.delete(id) };
      Date.now = () => now;
    }
    const listen = ({ detail: { type, data } }) => {
      if (type === 'test_checkpoint') journal.push({ timeMs: Clock.clockNow() - epoch, type, ...data });
      if (type === 'damage_resolution') journal.push({ timeMs: Clock.clockNow() - epoch, type, damage: data.damage,
        attacker: { id: data.attacker.id }, target: { id: data.target.id } });
    };
    window.addEventListener('combatLogEntry', listen);
    try {
      F.initFightEntites(); G.startGame(); await (await import('/__fear-expiry-fixture.js')).install(config);
      if (realTime) await new Promise(done => window.setTimeout(done, 14100));
      else {
        const end = now + 14100; let steps = 0;
        while (true) {
          await flush(); await Timeline.settleCombatTimeline(); await flush();
          const due = [...timers].filter(([, task]) => task.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
          if (!due) break;
          if (++steps > 40000) throw Error('Timer loop');
          const [id, task] = due; now = Math.max(now, task.at); timers.delete(id); task.fn();
        }
      }
      return { journal };
    } finally {
      G.StopGame({ preserveScene: true }); window.removeEventListener('combatLogEntry', listen);
      Date.now = nativeDate; Math.random = nativeRandom; delete window.__testTimers; channel.port1.close(); channel.port2.close();
    }
  }, realTime);
}
function verify(trial, side, config, mode) {
  const prefix = `${mode}/${side}/${config.name}`, expiry = config.at + config.duration;
  const checkpoint = label => trial.journal.find(e => e.type === 'test_checkpoint' && e.label === label);
  const applied = checkpoint('applied'), expired = checkpoint('expired'), end = checkpoint('end');
  assert.equal(checkpoint('before')?.phase, config.phase, prefix + ': effect begins during intended phase');
  assert.equal(applied?.fear, true, prefix + ': Effroi actually applied');
  assert.equal(checkpoint('active')?.fear, true, prefix + ': stays active before expiry');
  assert.equal(expired?.fear, false, prefix + ': Effroi expires');
  assert.equal(expired.effectCount, 0, prefix + ': effect instance removed');
  if (config.duration > 1000) assert.ok(expired.attempts >= 1, prefix + ': actual failed attempts before expiry');
  else assert.equal(expired.attempts, 0, prefix + ': short Effroi ends before first attempt');
  assert.equal(expired.failures, expired.attempts, prefix + ': all flee attempts failed');
  assert.equal(expired.successes, 0, prefix + ': no successful escape');
  assert.equal(end?.attempts, expired.attempts, prefix + ': no new attempts after expiry');
  assert.equal(end.fled, false, prefix + ': entity stays in battle despite now-successful random rolls');
  assert.equal(end.outcome, null, prefix + ': combat continues');
  assert.equal(end.targetHp, 10000, prefix + ': target is alive');
  const resumed = trial.journal.find(e => e.type === 'test_checkpoint' && e.label === 'phase' && e.timeMs >= expiry && e.stage === 'preparation');
  assert.ok(resumed, prefix + ': resumes normal attack preparation');
  const hit = trial.journal.find(e => e.type === 'damage_resolution' && e.attacker?.id === 999920 && e.timeMs > resumed.timeMs);
  assert.ok(hit && hit.damage > 0, prefix + ': resumed attack deals damage');
  assert.equal(hit.target.id, 999921, prefix + ': attacks correct enemy');
  assert.ok(end.sourceHp < 10000, prefix + ': enemy HP actually decreases');
  assert.ok(!trial.journal.some(e => e.type === 'test_checkpoint' && e.label === 'phase' && e.timeMs > applied.timeMs + 100
    && e.timeMs < expiry && e.stage === 'preparation'), prefix + ': no new preparation during Effroi');
  return { attempts: end.attempts, expiredAt: expiry, resumedAt: resumed.timeMs, hitAt: hit.timeMs };
}
const cases = [
  { name: 'turn', at: 250, duration: 2500, phase: 'Entite Turn' },
  { name: 'preparation', at: 1500, duration: 2500, phase: 'attack_1' },
  { name: 'recovery', at: 3400, duration: 2500, phase: 'attack_5' },
  { name: 'cooldown', at: 5000, duration: 2500, phase: 'cooldown-wait' },
  { name: 'melee', at: 3500, duration: 2500, phase: 'attack_3' },
  { name: 'projectile', at: 3500, duration: 2500, phase: 'attack_5' },
  { name: 'short', at: 250, duration: 100, phase: 'Entite Turn' },
];
try {
  for (const side of ['A', 'B']) for (const config of cases) {
    const page = await fixture(side, config);
    const simulated = await page.evaluate(() => test.Sim.simulateTrial(test.Sim.captureSimulationBoard(), {
      seed: 193, durationMs: 14100, trace: true, validationCase: test.config,
    }));
    await writeFile(resolve(output, `simulation-${side}-${config.name}.json`), JSON.stringify(simulated, null, 2));
    const simulation = verify(simulated, side, config, 'simulator');
    const live = await liveTrial(page);
    await writeFile(resolve(output, `game-${side}-${config.name}.json`), JSON.stringify(live, null, 2));
    const game = verify(live, side, config, 'game');
    assert.deepEqual(game, simulation, `${side}/${config.name}: same resumption and flee attempts in both engines`);
    reports.push({ side, name: config.name, modes: ['game', 'simulator'], ...game });
    console.log(`PASS ${side}/${config.name} (game + simulator)`); await page.close();
  }
  for (const [side, name] of [['A', 'preparation'], ['B', 'turn']]) {
    const config = cases.find(c => c.name === name), page = await fixture(side, config);
    const live = await liveTrial(page, true);
    await writeFile(resolve(output, `realtime-${side}-${name}.json`), JSON.stringify(live, null, 2));
    reports.push({ side, name, modes: ['realtime'], ...verify(live, side, config, 'realtime') });
    console.log(`PASS ${side}/${name} (real browser clock)`); await page.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'summary.json'), JSON.stringify(reports, null, 2));
  console.log(`Fear expiry: ${reports.reduce((total, row) => total + row.modes.length, 0)} scenarios passed.`);
} finally { await browser.close(); await new Promise(done => server.close(done)); }
