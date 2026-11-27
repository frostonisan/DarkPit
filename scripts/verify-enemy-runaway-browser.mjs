import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('docs'), output = resolve('outputs/enemy-runaway');
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  const path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!path.startsWith(root + sep)) return res.writeHead(403).end();
  try { res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml' })[extname(path)] || 'application/octet-stream'); res.end(await readFile(path)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.evaluate(async () => {
    window.U = await Promise.all([import("/js/ui/application.js"), import("/js/ui/attacks.js"), import("/js/ui/codex/index.js"), import("/js/ui/codex/profile.js"), import("/js/ui/codex/stats.js"), import("/js/ui/dialogue.js"), import("/js/ui/display.js"), import("/js/ui/drag.js"), import("/js/ui/essences.js"), import("/js/ui/inventory.js"), import("/js/ui/navigation.js"), import("/js/ui/statistics/components.js"), import("/js/ui/statistics/details.js"), import("/js/ui/statistics/helpers.js")]).then(parts => Object.defineProperties({}, Object.fromEntries(parts.flatMap(part => Object.keys(part).map(key => [key, { enumerable: true, get: () => part[key] }]))))); window.E = await import("/js/entities/runtime.js");
    window.G = await import("/js/app/state.js"); window.O = await import("/js/combat/orders.js");
    window.C = await import("/js/rendering/entities.js"); window.At = await Promise.all([import("/js/combat/vitals.js"), import("/js/rendering/vitalFeedback.js"), import("/js/rendering/hud.js")]).then(parts => Object.defineProperties({}, Object.fromEntries(parts.flatMap(part => Object.keys(part).map(key => [key, { enumerable: true, get: () => part[key] }])))));
    window.S = await import("/js/storage/gameStorage.js"); window.Sim = await import("/js/debug/simulation.js");
    window.T = await import("/js/storage/entityStorage.js");
    window.template = (await import("/js/data/entityTemplates.js")).entitesNest.find(e => e.serial === 900013);
    U.createGameContainer(); U.GameUi(); S.setAdminMode(true); window.levelRunning = 'admin';
    window.currentStageId = null;
    document.querySelector('.worldmap')?.remove();
    const grid = document.createElement('div'); grid.id = 'hexGrid'; grid.style.cssText = 'position:absolute;top:150px;left:400px;width:700px;height:500px';
    document.getElementById('game-container').append(grid);
    window.setup = async (kinds, stats = {}) => {
      G.StopGame({ preserveScene: true }); G.setOrderSide(null); G.resetBattleResolution();
      document.querySelectorAll('.runaway-msg, .fade-to-black').forEach(element => element.remove());
      E.entites.length = 0; grid.innerHTML = '';
      for (const [i, kind] of kinds.entries()) {
        const side = i ? 'B' : 'A';
        const hex = document.createElement('div'); hex.className = `hex Side${side} occupied`; hex.dataset.position = String(i + 1);
        hex.style.cssText = `position:absolute;left:${i * 200}px;top:50px;width:180px;height:200px`; grid.append(hex);
        const offensive = kind === 'offense';
        const attack = { functionName: `test-${kind}`, attackId: `test-${kind}`, displayName: kind,
          combatFunction: offensive ? 'Attaquant' : 'Support', attackTarget: [offensive ? 'enemy' : kind === 'summon' ? 'hexa' : 'ally'],
          attacknature: ['physicalDamage'], attackRange: ['melee'], deadTarget: ['no'], type: [], effets: offensive ? ['none'] : kind === 'summon' ? ['summonJarret'] : ['heal'], selfEffects: [],
          preparationTime: 100, executionTime: 200, recoveryTime: 100, cooldown: 50000, physicalRatio: 1, magicalRatio: 0, piercingRatio: 0 };
        const e = E.enrichEntityStats({ ...structuredClone(template), id: 997710 + i, name: i ? `Soigneur ${i}` : 'Allié', side,
          type: 'sbire', role: 'gueux', position: String(i+1), level: 1, awakening: 1, stuff: {}, stats: {}, modifierStats: {},
          baseStats: { HP: 1000, physicalDamage: 1, speed: 100, ...stats }, attacks: [attack] });
        e.statut = ['alive']; e.isDEAD = false; E.entites.push(e);
        const dom = C.createEntiteInDOM(e); hex.append(dom.element); await dom.spriteReady;
      }
      return Sim.captureSimulationBoard();
    };
  });
  const simulated = await page.evaluate(async () => {
    const soloBoard = await setup(['heal', 'heal']);
    const solo = await Sim.runCombatSimulation(soloBoard, { count: 1, durationSeconds: 15, seed: 17 });
    const groupBoard = await setup(['heal', 'heal', 'heal']);
    const group = await Sim.runCombatSimulation(groupBoard, { count: 1, durationSeconds: 15, seed: 17 });
    const offensiveBoard = await setup(['heal', 'offense']);
    const offensive = await Sim.runCombatSimulation(offensiveBoard, { count: 1, durationSeconds: 1, seed: 17 });
    const summonBoard = await setup(['heal', 'summon']);
    const summon = await Sim.runCombatSimulation(summonBoard, { count: 1, durationSeconds: 15, seed: 17 });
    const pursuitBoard = await setup(['offense', 'heal'], { velocity: 100 });
    const pursuit = await Sim.runCombatSimulation(pursuitBoard, { count: 1, durationSeconds: 15, seed: 17 });
    await setup(['heal', 'offense'], { velocity: 100 });
    const selection = await import("/js/combat/attackResolution.js");
    selection.setAllAttacksEnabled(E.entites[1], selection.readAttackDefinitionsForEntity(E.entites[1]), false);
    const disabled = await Sim.runCombatSimulation(Sim.captureSimulationBoard(), { count: 1, durationSeconds: 15, seed: 17 });
    const failures = [];
    for (let seed = 1; seed <= 10; seed++) {
      const r = await Sim.runCombatSimulation(soloBoard, { count: 1, durationSeconds: 15, seed });
      if (r.trials[0]?.entities.find(e => e.side === 'B')?.details.fleeFailures > 0) { failures.push(r); break; }
    }
    return { solo, group, offensive, summon, pursuit, disabled, failure: failures[0] };
  });
  await writeFile(resolve(output, 'simulations.json'), JSON.stringify(simulated));
  for (const name of ['solo', 'group', 'summon', 'failure', 'pursuit', 'disabled']) {
    const r = simulated[name]; assert.ok(r, name); assert.equal(r.status, 'complete', r.error);
    const t = r.trials[0]; assert.equal(t.winner, 'A', name); assert.equal(t.end, 'victory');
    const enemies = t.entities.filter(e => e.side === 'B');
    assert.ok(enemies.every(e => e.hasFled && !e.dead && e.hpEnd > 0));
    assert.ok(enemies.every(e => e.details.fleeSuccesses === 1 && e.details.fleeAttempts >= 1));
    assert.ok(t.journal.some(e => e.type === 'battle_victory' && e.reason === 'enemy-escape'));
    assert.equal(t.entities.find(e => e.side === 'A').dead, false);
  }
  assert.equal(simulated.offensive.status, 'complete', simulated.offensive.error);
  assert.ok(simulated.pursuit.trials[0].entities.find(e => e.side === 'A').damage > 0, 'A keeps attacking while B flees');
  assert.equal(simulated.offensive.trials[0].end, 'timeout');
  assert.ok(!simulated.offensive.trials[0].journal.some(e => e.type === 'runaway_order_launched'));
  const retry = simulated.failure.trials[0], enemy = retry.entities.find(e => e.side === 'B');
  assert.ok(enemy.details.fleeFailures >= 1);
  assert.equal(enemy.details.fleeAttempts, enemy.details.fleeFailures + 1);
  const attempts = retry.journal.filter(e => e.type === 'runaway_fail' || e.type === 'runaway_success');
  assert.ok(attempts[0].timeMs >= 2000 + enemy.initialStats.speed);
  assert.ok(attempts[1].timeMs - attempts[0].timeMs >= 2 * enemy.initialStats.speed);
  console.log('PASS: support stalemates, group retreat, support summoner, offensive cooldown and actual failure/retry cycles in the game simulator.');
  await page.evaluate(async () => {
    await setup(['heal', 'heal', 'offense'], { velocity: 100 });
    window.events = []; window.addEventListener('combatLogEntry', e => events.push(e.detail.type));
    G.startGame();
    if (O.isEnemyFleeing(E.entites[1])) throw Error('Healer fled while its offensive ally was alive');
    const fighter = E.entites[2]; fighter.stats.HP.current = 0; At.LifeandDeath(fighter, E.entites[0]);
    if (!O.isEnemyFleeing(E.entites[1])) throw Error('Death of last offensive fighter did not trigger retreat');
  });
  await page.waitForFunction(() => G.battleOutcome === 'victory', { timeout: 15000 });
  assert.equal(await page.locator('#gameOverMessage').innerText(), 'L’armée adverse a pris la fuite !');
  await page.waitForFunction(() => !document.getElementById('Box_Entite_997711'));
  assert.equal(await page.locator('#Box_Entite_997710').count(), 1);
  assert.equal(await page.evaluate(() => window.levelRunning), 'admin');
  assert.equal(await page.locator('.fade-to-black').count(), 0);
  await page.screenshot({ path: resolve(output, 'solo-retreat.png') });
  await page.evaluate(async () => { await setup(['heal', 'heal', 'heal'], { velocity: 100 }); G.startGame(); });
  await page.waitForFunction(() => G.battleOutcome === 'victory', { timeout: 15000 });
  assert.equal(await page.locator('#gameOverMessage').innerText(), 'L’armée adverse a pris la fuite !');
  await page.waitForFunction(() => !document.getElementById('Box_Entite_997711') && !document.getElementById('Box_Entite_997712'));
  assert.equal(await page.locator('#Box_Entite_997710').count(), 1);
  assert.equal(await page.evaluate(() => window.levelRunning), 'admin');
  await page.screenshot({ path: resolve(output, 'group-retreat.png') });
  // Stopping the fight must also cancel pending retreat attempts.
  await page.evaluate(async () => { await setup(['heal', 'heal'], { velocity: 100 }); G.startGame(); G.StopGame({ preserveScene: true }); });
  await page.waitForTimeout(2500);
  assert.equal(await page.evaluate(() => E.entites.some(e => e.side === 'B' && e.hasFled)), false);
  assert.equal(await page.locator('#Box_Entite_997711').count(), 1);
  const playerFlight = await page.evaluate(async () => {
    await setup(['heal', 'offense']);
    const player = E.entites[0], random = Math.random;
    let rolls = 0;
    Math.random = () => ++rolls === 1 ? 0 : .99;
    try {
      await O.RunawayFunction(player);
      const details = T.getEntityCombatDetails(player);
      return { hasFled: player.hasFled, attempts: details.fleeAttempts, failures: details.fleeFailures, successes: details.fleeSuccesses };
    } finally { Math.random = random; G.StopGame({ preserveScene: true }); }
  });
  assert.deepEqual(playerFlight, { hasFled: true, attempts: 2, failures: 1, successes: 1 }, 'Player flight keeps the same roll and retry rules');
  const partialPlayerFlight = await page.evaluate(async () => {
    await setup(['heal', 'heal', 'offense'], { velocity: 100 });
    const [casualty, survivor, enemy] = E.entites;
    survivor.side = 'A';
    G.startGame();
    const order = O.launchOrderCycleForSide('A', 'runaway');
    setTimeout(() => { casualty.stats.HP.current = 0; At.LifeandDeath(casualty, enemy); }, 100);
    await order;
    const result = { fled: survivor.hasFled, dead: casualty.isDEAD, message: Boolean(document.querySelector('.runaway-msg')) };
    G.StopGame({ preserveScene: true });
    return result;
  });
  assert.deepEqual(partialPlayerFlight, { fled: true, dead: true, message: true }, 'A death during the player order must not block the surviving ally’s escape');
  assert.deepEqual(errors, []);
  console.log('PASS: last offensive death triggers retreat, correct solo/group messages, B leaves, A stays on the board, no world-map transition, stopped fights cannot flee later.');
} finally { await browser.close(); await new Promise(done => server.close(done)); }
