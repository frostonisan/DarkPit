import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('docs'), output = resolve('outputs/fear-retreat');
await mkdir(output, { recursive: true });

async function installScenario(config) {
  const E = await import("/js/entities/runtime.js"), A = await import("/js/combat/vitals.js");
  const C = await import("/js/combat/clock.js"), G = await import("/js/app/state.js");
  const O = await import("/js/combat/orders.js"), Effects = await import("/js/combat/effects.js");
  const [source, ...targets] = E.entites, epoch = C.clockNow();
  const log = data => window.dispatchEvent(new CustomEvent('combatLogEntry', { detail: { type: 'test_checkpoint', data } }));
  Math.random = () => config.fail ? 0 : .99;
  const apply = (target, name, seconds) => A.applyEffect(target, name, source, {
    functionName: `test-${name}`, effets: [name], effectOverrides: { [name]: { effectDuration: seconds } },
  });
  if (config.charm) for (const target of targets) apply(target, 'charme', 60);
  const snapshot = label => log({ label, outcome: G.battleOutcome, elapsed: C.clockNow() - epoch,
    fled: O.fledEntities.map(e => ({ id: e.id, side: e.side, originalSide: e._combatOriginalSide })),
    active: E.entites.filter(e => !e.hasFled && !e.isDEAD).map(e => e.id),
    effects: Effects.getActiveEffectStates().length,
    message: document.querySelector('#gameOverMessage')?.textContent || '',
    notices: [...document.querySelectorAll('[data-popup-key^="runaway-"]')].map(node => node.textContent),
    returnMessages: document.querySelectorAll('.runaway-msg').length,
  });
  const resolved = () => { snapshot('resolved'); C.setTimeout(() => snapshot('final'), 0); };
  window.addEventListener('battleResolved', resolved, { once: true });
  if (config.mixedOrder) void O.launchOrderCycleForSide('A', 'runaway');
  targets.forEach((target, i) => {
    if ((config.partial || config.mixedOrder) && i > 0) return;
    const at = config.staggered ? [0, 500, 500, 1500][i] : 0;
    C.setTimeout(() => apply(target, 'effroi', config.short ? .1 : 5), at);
  });
  for (const [label, at] of [['first', 400], ['group', 1000], ['end', 2200]]) C.setTimeout(() => snapshot(label), at);
}
const setupModule = `export const install = ${installScenario.toString()};`;
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (path === '/__fear-fixture.js') return res.writeHead(200, { 'Content-Type': 'text/javascript' }).end(setupModule);
  const file = resolve(root, '.' + path), rel = relative(root, file);
  if (rel === '..' || rel.startsWith('..' + sep)) return res.writeHead(403).end();
  try {
    let data = await readFile(file);
    if (path === "/js/debug/simulationRuntime.js") {
      const source = data.toString(); assert.ok(source.includes('  G.startGame();'));
      data = source.replace('  G.startGame();', `  G.startGame();\n  if (input.validationCase) await (await import('/__fear-fixture.js')).install(input.validationCase);`);
    }
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif' })[extname(file)] || 'application/octet-stream');
    res.end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const origin = `http://127.0.0.1:${server.address().port}`, errors = [], reports = [];
async function fixture(config) {
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('Failed to load resource')) errors.push(message.text()); });
  await page.goto(origin + '/index.html');
  await page.evaluate(async config => {
    const U = await import("/js/ui/application.js"), E = await import("/js/entities/runtime.js"), Create = await import("/js/rendering/entities.js");
    const S = await import("/js/storage/gameStorage.js"), G = await import("/js/app/state.js"), F = await import("/js/combat/loop.js");
    const Sim = await import("/js/debug/simulation.js");
    S.setAdminMode(!config.worldmap); window.levelRunning = config.worldmap ? 'stage' : 'admin'; window.currentStageId = null;
    U.createGameContainer(); U.GameUi();
    localStorage.setItem('gameDay', '12'); localStorage.setItem('worldmap_id', '12345');
    S.saveToLocalStorage('GameStages', { stages: [] });
    localStorage.removeItem('currentStageId');
    G.configureBattleActionManager({ createStartButton: e => e, createFleeButton: e => e, createQuitButton: e => e });
    document.querySelector('.worldmap')?.remove();
    const grid = document.createElement('div'); grid.id = 'hexGrid'; grid.className = 'hex-grid';
    grid.style.cssText = 'position:absolute;left:30px;top:80px;width:1200px;height:400px';
    document.getElementById('game-container').append(grid); E.entites.length = 0;
    const template = (await import("/js/data/entityTemplates.js")).entitesNest.find(e => e.serial === 900013);
    for (let i = 0; i <= (config.count || 1); i++) {
      const side = i ? config.side : config.side === 'A' ? 'B' : 'A';
      const hex = document.createElement('div'); hex.className = `hex Side${side} occupied`;
      Object.assign(hex.dataset, { position: String(i + 1), row: '1', col: String(i * 2) });
      hex.style.cssText = `position:absolute;left:${i * 210}px;top:40px;width:180px;height:200px`; grid.append(hex);
      const entity = E.enrichEntityStats({ ...structuredClone(template), id: 999930 + i, name: i ? `Fuyard ${i}` : 'Lanceur', nickname: '',
        side, type: 'sbire', role: 'gueux', position: String(i + 1), level: 1, awakening: 1, stuff: {}, stats: {}, modifierStats: {},
        baseStats: { HP: 10000, armor: 0, strength: 0, intelligence: 0, agility: 0, physicalDamage: 1,
          velocity: config.fail ? 0 : 100, resilienceTotal: 0, hindranceResistance: 0, speed: i ? 250 : 60000 },
        attacks: [{ functionName: 'fear-test', attackId: 'fear-test', displayName: 'Attaque', combatFunction: 'Attaquant',
          attacknature: ['physicalDamage'], attackRange: ['range'], attackTarget: ['enemy'], deadTarget: ['no'],
          effets: [], selfEffects: [], preparationTime: 60000, executionTime: 2000, recoveryTime: 800, cooldown: 60000, physicalRatio: 1 }] });
      entity.isDEAD = false; entity.statut = ['alive']; E.entites.push(entity);
      const dom = Create.createEntiteInDOM(entity); hex.append(dom.element); await dom.spriteReady;
    }
    window.selectedArmyA = E.entites.filter(e => e.side === 'A');
    S.saveToLocalStorage('selectedArmyA', window.selectedArmyA);
    window.selectedArmyB = []; window.ArmyB_id = null;
    const journal = [], resolved = [], messages = [];
    window.addEventListener('combatLogEntry', ({ detail }) => {
      if (detail.type === 'test_checkpoint') journal.push({ type: detail.type, ...detail.data });
      else if (detail.type.startsWith('runaway_') || detail.type.startsWith('battle_')) journal.push({ type: detail.type, entity: detail.data?.entity?.id });
    });
    window.addEventListener('battleResolved', e => resolved.push(e.detail.outcome));
    let closing = 0; window.addEventListener('stageInterfaceClosing', () => closing++);
    const observer = new MutationObserver(() => {
      for (const node of document.querySelectorAll('[data-popup-key^="runaway-"], .runaway-msg, #gameOverMessage')) {
        const text = node.textContent; if (text && !messages.includes(text)) messages.push(text);
      }
    }); observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.test = { E, S, G, F, Sim, config, journal, resolved, messages, get closing() { return closing; } };
  }, config);
  return page;
}
const cases = [
  { name: 'B-solo', side: 'B' },
  { name: 'B-staggered', side: 'B', count: 4, staggered: true },
  { name: 'B-charmed', side: 'B', charm: true },
  { name: 'A-worldmap', side: 'A', count: 2, worldmap: true },
  { name: 'A-charmed-worldmap', side: 'A', charm: true, worldmap: true },
  { name: 'A-mixed-order-worldmap', side: 'A', count: 2, mixedOrder: true, worldmap: true },
  { name: 'A-partial', side: 'A', count: 2, partial: true },
  { name: 'B-failed-attempts', side: 'B', fail: true },
  { name: 'B-short-effect', side: 'B', short: true },
];
try {
  for (const config of cases.filter(config => process.argv.length <= 2 || process.argv.slice(2).includes(config.name))) {
    const page = await fixture(config), terminal = !config.partial && !config.fail && !config.short;
    const simulated = await page.evaluate(() => test.Sim.simulateTrial(test.Sim.captureSimulationBoard(), {
      seed: 193, durationMs: test.config.mixedOrder ? 5000 : 2300, trace: true, validationCase: test.config,
    }));
    await writeFile(resolve(output, `simulation-${config.name}.json`), JSON.stringify(simulated, null, 2));
    assert.equal(simulated.end, terminal ? config.side === 'A' ? 'escape' : 'victory' : 'timeout', config.name + ': simulator verdict');
    const escaped = simulated.entities.filter(e => e.hasFled);
    assert.equal(escaped.length, config.fail || config.short ? 0 : config.partial ? 1 : config.count || 1, config.name + ': actual escaped count');
    for (const e of escaped) assert.equal(e.side, config.side, config.name + ': original camp restored');
    if (config.fail) {
      const details = simulated.entities.find(e => e.id === '999931').details;
      assert.ok(details.fleeAttempts > 0, 'Effroi does attempt to flee');
      assert.equal(details.fleeFailures, details.fleeAttempts, 'Failed attempts never count as departures');
    }
    if (config.short) assert.equal(simulated.entities.find(e => e.id === '999931').details.fleeAttempts, 0, 'Expired Effroi does not roll');
    if (config.staggered) {
      const group = simulated.journal.find(e => e.type === 'test_checkpoint' && e.label === 'group');
      assert.ok(group.notices.includes('Fuyard 2 et Fuyard 3 ont pris la fuite !'), 'Simulator groups partial departures too');
      assert.equal(group.outcome, null, 'Partial departures do not settle the battle');
    }
    assert.equal(await page.evaluate(() => localStorage.getItem('gameDay')), '12', config.name + ': simulator does not advance real day');
    await page.evaluate(async () => {
      test.F.initFightEntites(); test.G.startGame();
      await (await import('/__fear-fixture.js')).install(test.config);
    });
    if (terminal) {
      await page.waitForFunction(() => test.resolved.length > 0, null, { timeout: 10000 });
      await page.evaluate(() => { test.G.checkGameOver(); test.G.checkGameOver(); });
      assert.equal(await page.evaluate(() => test.resolved.length), 1, config.name + ': one verdict only');
      if (config.side === 'A') {
        assert.equal(await page.locator('.runaway-msg').count(), 1, config.name + ': one automatic exit sequence');
        await page.waitForFunction(() => window.levelRunning === 'worldmap' && !window.__QUIT_LEVEL_LOCK__, null, { timeout: 12000 });
        assert.equal(await page.evaluate(() => localStorage.getItem('gameDay')), '13', config.name + ': exactly one normal day');
        assert.equal(await page.evaluate(() => test.closing), 1, config.name + ': exactly one level exit');
        assert.ok(await page.evaluate(() => test.S.loadFromLocalStorage('selectedArmyA').every(e => e.side === 'A')), config.name + ': saved army remains A');
      } else {
        assert.equal(await page.locator('#gameOverMessage').innerText(), 'L’armée adverse a pris la fuite !');
        assert.equal(await page.locator('.runaway-msg, .fade-to-black').count(), 0, config.name + ': no player return sequence');
        assert.equal(await page.locator('#Box_Entite_999930').count(), 1, config.name + ': A stays on board');
        assert.equal(await page.evaluate(() => window.levelRunning), 'admin');
        assert.equal(await page.evaluate(() => localStorage.getItem('gameDay')), '12');
      }
    } else {
      await page.waitForTimeout(2300);
      await writeFile(resolve(output, `diagnostic-${config.name}.json`), JSON.stringify(await page.evaluate(async () => ({
        journal: test.journal, messages: test.messages,
        entities: test.E.entites.map(e => ({ id: e.id, phase: e.currentPhase, side: e.side, hp: e.stats.HP.current,
          attacks: e.attacks, details: e.attackDetails, selection: e.attackSelection })),
        fled: (await import("/js/combat/orders.js")).fledEntities.map(e => ({ id: e.id, side: e.side,
          attacks: e.attacks, details: e.attackDetails, selection: e.attackSelection })),
      })), null, 2));
      assert.equal(await page.evaluate(() => test.G.battleOutcome), null, config.name + ': attempts/partial departure do not end combat');
      assert.equal(await page.locator('.runaway-msg, .fade-to-black').count(), 0);
    }
    const live = await page.evaluate(() => ({ journal: test.journal, messages: test.messages, resolved: test.resolved,
      closing: test.closing, day: localStorage.getItem('gameDay'), mode: window.levelRunning }));
    if (config.staggered) {
      assert.ok(live.messages.includes('Fuyard 1 a pris la fuite !'), 'Individual partial departure');
      assert.ok(live.messages.includes('Fuyard 2 et Fuyard 3 ont pris la fuite !'), 'Grouped partial departure');
      assert.ok(!live.messages.includes('Fuyard 4 a pris la fuite !'), 'Last departure uses army outcome only');
    }
    if (terminal) assert.equal(live.journal.find(e => e.label === 'resolved')?.effects, 0, config.name + ': effects cleared before verdict');
    await writeFile(resolve(output, `game-${config.name}.json`), JSON.stringify(live, null, 2));
    reports.push({ scenario: config.name, simulator: simulated.end, live: live.resolved[0] || 'ongoing', day: live.day });
    console.log(`PASS ${config.name} (game + simulator)`); await page.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'summary.json'), JSON.stringify(reports, null, 2));
  console.log(`Fear retreat: ${reports.length * 2} scenarios passed.`);
} finally { await browser.close(); await new Promise(done => server.close(done)); }
