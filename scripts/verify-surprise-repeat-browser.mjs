import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('docs'), output = resolve('outputs/surprise-repeat');
await mkdir(output, { recursive: true });
const mime = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif' };
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const path = resolve(root, '.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname));
  const rel = relative(root, path);
  if (rel === '..' || rel.startsWith('..' + sep)) return res.writeHead(403).end();
  try { res.setHeader('Content-Type', mime[extname(path)] || 'application/octet-stream'); res.end(await readFile(path)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1536, height: 800 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const report = await page.evaluate(async () => {
    window.E = await import("/js/entities/runtime.js");
    window.G = await import("/js/app/state.js");
    window.Game = await import("/js/app/stages.js");
    window.S = await import("/js/storage/gameStorage.js");
    window.Events = await import("/js/events/runtime.js");
    const U = await import("/js/ui/application.js");
    const template = (await import("/js/data/entityTemplates.js")).entitesNest.find(e => e.serial === 900013);
    Game.configureBattleSystemsOnce(); U.createGameContainer(); U.GameUi();
    S.setAdminMode(false); window.levelRunning = 'scripted';
    const army = ['A', 'B'].map((side, i) => E.enrichEntityStats({
      ...structuredClone(template), id: 987120 + i, side, level: 1,
      baseStats: { HP: 10000, speed: 50000, strength: 1, physicalDamage: 1 }, stuff: {},
    }));
    const stages = ['sideA', 'sideB', null].map((surpriseAttack, i) => ({
      id: `surprise-test-${i}`, biome_serial: 'prison', difficulty: {}, level_type: 'scripted',
      ...(surpriseAttack ? { surpriseAttack } : {}),
    }));
    S.saveToLocalStorage('GameStages', { stages });
    S.saveToLocalStorage('selectedArmyA', [army[0]]);
    S.saveToLocalStorage('ArmyB', { armies: Object.fromEntries(stages.map(stage => [
      `ArmyB_${stage.id}`, { ArmyB_id: `ArmyB_${stage.id}`, entities: [army[1]] },
    ])) });
    const checks = [];
    const check = (ok, message) => { if (!ok) throw Error(message); checks.push(message); };
    const reset = stageId => {
      G.StopGame({ preserveScene: true }); Events.attackSurprise(null);
      E.entites.length = 0; E.entites.push(...structuredClone(army));
      for (const entity of E.entites) { entity.isDEAD = false; entity.statut = ['alive']; }
      S.setCurrentLevel(stageId); window.currentStageId = stageId;
    };
    const start = value => {
      const random = Math.random; Math.random = () => value;
      try { G.startGame(); } finally { Math.random = random; }
      return Events.getSurprisedSide();
    };
    for (const [index, victim] of [[0, 'B'], [1, 'A']]) {
      reset(stages[index].id);
      check(start(.99) === victim, `${stages[index].surpriseAttack}: first encounter guaranteed`);
      check(S.loadFromLocalStorage('GameStages').stages[index].surpriseEncountered === true, 'First combat recorded on its own stage');
      for (const [roll, expected] of [[.99, null], [.299999, victim], [.30, null], [0, victim]]) {
        reset(stages[index].id);
        check(start(roll) === expected, `${stages[index].surpriseAttack}: restart roll ${roll} gives ${expected || 'normal combat'}`);
        check(Boolean(document.querySelector('.IngameAlert.surpriseAttack')) === Boolean(expected), 'Announcement follows the actual outcome');
      }
    }
    check(!S.loadFromLocalStorage('GameStages').stages[2].surpriseEncountered, 'Ordinary level has no surprise history');
    // The actual loader must prepare one roll, then reuse it when Start is clicked.
    reset(stages[1].id);
    const random = Math.random; Math.random = () => .99;
    let pending;
    try { pending = Game.launchLevel({ levelId: stages[1].id }); }
    finally { Math.random = random; }
    check(await pending, 'Repeated level loads successfully');
    check(Events.getSurprisedSide() === null, 'Failed repeat roll removes surprise before sprites are created');
    check(!E.entites.some(e => e.isSurprised), 'Normal retry leaves every entity ready');
    while (!document.querySelector('.loading-h2.loaded')) await new Promise(done => setTimeout(done, 50));
    document.querySelector('.loading-h2.loaded').click();
    await new Promise(done => setTimeout(done, 3800));
    check(!G.gameStarted && !!document.querySelector('#startButton'), 'Normal retry waits for the player instead of auto-starting an enemy ambush');
    check(start(0) === null, 'Starting a prepared normal encounter does not roll again');
    check(!!document.querySelector('[data-order="runaway"]'), 'Normal retry does not lock the flee button');
    G.StopGame({ preserveScene: true });
    reset(stages[2].id);
    check(await Game.launchLevel({ levelId: stages[2].id }), 'Ordinary level still loads');
    document.getElementById('loadingScreen')?.remove();
    check(start(0) === null, 'Level without an ambush parameter stays normal even on a low roll');
    check(!S.loadFromLocalStorage('GameStages').stages[2].surpriseEncountered, 'Ordinary combat does not acquire surprise history');
    G.StopGame({ preserveScene: true });
    // Returning to an untouched level still grants its first guaranteed ambush.
    const stored = S.loadFromLocalStorage('GameStages'); delete stored.stages[0].surpriseEncountered;
    S.saveToLocalStorage('GameStages', stored);
    reset(stages[0].id);
    check(await Game.launchLevel({ levelId: stages[0].id }), 'Fresh ambush level loads successfully');
    check(!S.loadFromLocalStorage('GameStages').stages[0].surpriseEncountered, 'Loading alone does not consume the first encounter');
    check(Events.getSurprisedSide() === 'B', 'Fresh level prepares the guaranteed ambush');
    document.getElementById('loadingScreen')?.remove();
    check(start(.99) === 'B', 'Fresh prepared ambush survives a high random value at Start');
    check(S.loadFromLocalStorage('GameStages').stages[0].surpriseEncountered === true, 'First loaded fight commits its encounter');
    // Restoration must keep the same fight rather than starting another encounter.
    window.P = await import("/js/combat/pause.js");
    await P.pauseCombat();
    return checks;
  });
  await page.waitForFunction(() => P.getCombatPauseReasons().tactical && !P.isCombatCheckpointBusy());
  await page.reload();
  const restored = await page.evaluate(async () => {
    const P = await import("/js/combat/pause.js"); await P.restorePausedCombat();
    const Events = await import("/js/events/runtime.js");
    const S = await import("/js/storage/gameStorage.js");
    return { paused: P.getCombatPauseReasons().tactical, surprised: Events.getSurprisedSide(), stage: S.loadFromLocalStorage('GameStages').stages[0] };
  });
  assert.equal(restored.paused, true);
  assert.equal(restored.surprised, 'B');
  assert.equal(restored.stage.surpriseEncountered, true);
  assert.equal(restored.stage.surpriseAttack, 'sideA');
  report.push('F5 during pause preserves the existing surprise and its stage history');
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'checks.json'), JSON.stringify({ report, restored, errors }, null, 2));
  console.log(`PASS ${report.length} checks: first encounter, repeat probability, loader, controls and paused reload`);
} finally { await browser.close(); await new Promise(done => server.close(done)); }
