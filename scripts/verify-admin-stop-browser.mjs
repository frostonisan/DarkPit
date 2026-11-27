import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('docs'), output = resolve('outputs/admin-stop');
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  const file = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  const rel = relative(root, file);
  if (rel === '..' || rel.startsWith('..' + sep)) return res.writeHead(403).end();
  try {
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1536, height: 960 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  assert.equal(await page.locator('#admin-stop-combat').count(), 0);
  await page.evaluate(async () => {
    const S = await import("/js/storage/gameStorage.js");
    const E = await import("/js/entities/runtime.js");
    const A = await import("/js/debug/admin.js");
    const UI = await import("/js/ui/application.js"), _UI = await import("/js/ui/codex/index.js");
    const N = await import("/js/app/worldMap.js");
    S.setAdminMode(true);
    window.levelRunning = 'worldmap';
    A.initializeAdminLevel(E.entitesNestUp);
    if (document.getElementById('admin-stop-combat')) throw Error('Admin mode outside the Admin level must not expose Stop');
    const template = (await import("/js/data/entityTemplates.js")).entitesNest.find(row => row.serial === 900013);
    const actor = E.enrichEntityStats({ ...structuredClone(template), id: 991810, name: 'Saved army', side: 'A', level: 1,
      attacks: ['shot-p-r'], stats: {}, baseStats: { HP: 1000, shift: 10, speed: 10000, armor: 10 }, stuff: {}, resourceStocks: {} });
    S.saveToLocalStorage('selectedArmyA', [actor]); window.selectedArmyA = [actor];
    E.entites.splice(0, E.entites.length, actor);
    UI.createGameContainer(); UI.GameUi(); UI.initializeArmyConfig(); _UI.PlayerArmyCodex();
    N.rebuildWorldMapLevelButtons(); S.setCurrentLevel(UI.getOrCreateWorldMapID());
  });
  await page.evaluate(() => document.querySelectorAll('.entitylootContainer, #black-overlay').forEach(node => node.remove()));
  await page.locator('.level-button.admin').first().click();
  await page.locator('.loading-h2.loaded').waitFor({ timeout: 45000 });
  await page.locator('.loading-h2.loaded').click();
  await page.waitForFunction(() => !document.querySelector('.loading-screen') && document.getElementById('startButton'));
  // The loaded stage reconciles its controls for 1600 ms; test a settled level.
  await page.waitForTimeout(1700);
  assert.equal(await page.locator('#admin-stop-combat').count(), 0, 'Stop is absent before launching');
  await page.evaluate(async () => {
    const S = await import("/js/storage/gameStorage.js");
    const E = await import("/js/entities/runtime.js");
    const G = await import("/js/app/state.js");
    const C = await import("/js/rendering/entities.js");
    document.querySelectorAll('#hexGrid .entite-box').forEach(node => node.remove());
    document.querySelectorAll('#hexGrid .hex').forEach(hex => hex.classList.remove('occupied'));
    E.entites.length = 0;
    const template = (await import("/js/data/entityTemplates.js")).entitesNest.find(row => row.serial === 900013);
    for (const [index, side] of ['A', 'B'].entries()) {
      const hex = document.querySelector(`#hexGrid .hex.Side${side}`);
      const actor = E.enrichEntityStats({ ...structuredClone(template), id: 991810 + index,
        name: `Stop combat ${side}`, side, role: 'gueux', type: 'sbire', position: hex.dataset.position, level: 1, awakening: 1,
        attacks: ['shot-p-r'], stuff: {}, stats: {}, modifierStats: {}, resourceStocks: {},
        baseStats: { HP: 1000, physicalDamage: 10, speed: 10000, shift: 10 } });
      actor.stats.speed = 10000; actor.statut = ['alive']; actor.isDEAD = false;
      E.entites.push(actor);
      const created = C.createEntiteInDOM(actor); hex.appendChild(created.element); await created.spriteReady;
    }
    S.saveToLocalStorage('selectedArmyA', [E.entites[0]]);
    S.saveToLocalStorage('ArmyB', { armies: { test: { entities: [E.entites[1]] } } });
    (await import("/js/combat/loop.js")).initFightEntites();
    G.manageBattleActions({ mode: G.BATTLE_ACTION_MODE.START });
    window.__stops = 0; window.__resolutions = 0;
    window.addEventListener('battleStopped', () => window.__stops++);
    window.addEventListener('battleResolved', () => window.__resolutions++);
  });
  const button = page.getByRole('button', { name: 'Stopper le combat', exact: true });
  const startPosition = await page.locator('#startButton').evaluate(node => {
    const style = getComputedStyle(node); return [style.left, style.bottom, style.position];
  });
  await page.locator('#startButton').click();
  await page.waitForFunction(async () => {
    const { entites } = await import("/js/entities/runtime.js");
    return entites.every(entity => entity.speedTimer > 0 && entity.turnCount > 0);
  });
  await button.waitFor({ state: 'visible' });
  assert.equal(await page.locator('#startButton').count(), 0, 'Stop replaces Start');
  assert.equal(await page.locator('#admin-stop-combat').count(), 1, 'Only one Stop action');
  assert.equal(await page.locator('#admin-entity-form #admin-stop-combat').count(), 0, 'No separate Admin-menu copy');
  assert.equal(await page.locator('.runaway-button, .cancelrunaway-button').count(), 0, 'Admin uses Stop in place of flight orders');
  assert.deepEqual(await button.evaluate(node => {
    const style = getComputedStyle(node); return [style.left, style.bottom, style.position];
  }), startPosition, 'Stop uses the same position as Start');
  await page.screenshot({ path: resolve(output, 'stop-replaces-start.png'), fullPage: true });
  await page.evaluate(async () => {
    const { entites } = await import("/js/entities/runtime.js");
    const G = await import("/js/app/state.js");
    const A = await import("/js/rendering/animations.js");
    const { createAttackFlight } = await import("/js/combat/attacks.js");
    const attack = { ...entites[0].attackDetails[0], attacknature: ['physicalDamage'], attackRange: ['range'],
      attackTarget: ['enemy'], deadTarget: ['no'], effets: [], selfEffects: [] };
    window.__flight = createAttackFlight(entites[0], entites[1], attack, { physical: 40 });
    window.__hp = entites.map(entity => entity.stats.HP.current);
    A.animatePreparation(entites[0], attack, 5000);
    entites[1].recoveryTime = 5000;
    A.animateRecuperation(entites[1], attack);
    const projectile = document.createElement('div'); projectile.className = 'projectile-parent'; document.body.append(projectile);
    const chest = document.createElement('div'); chest.className = 'chest-container'; chest.id = 'preserved-chest'; document.body.append(chest);
    window.__intervalTicks = 0; window.__lateCallback = false;
    const combatClock = await import("/js/combat/clock.js");
    G.activeIntervals.push(combatClock.setInterval(() => window.__intervalTicks++, 50));
    combatClock.setTimeout(() => { window.__lateCallback = true; }, 1500);
  });
  await button.click();
  await page.waitForFunction(() => document.getElementById('startButton') && !document.getElementById('admin-stop-combat'));
  const stopped = await page.evaluate(async () => {
    const E = await import("/js/entities/runtime.js"); const G = await import("/js/app/state.js");
    await (await import("/js/combat/attacks.js")).resolveAttackImpact(window.__flight);
    return { started: G.gameStarted, finished: G.isBattleFinished(), actors: E.entites.length,
      frozen: E.entites.every(e => e.battleStopped && e.status === 'inactive' && e.speedTimer === 0 && e.preparationTime === 0 && e.executionTime === 0 && e.recoveryTime === 0 && e.cooldownTimer === 0),
      hp: E.entites.map(e => e.stats.HP.current), beforeHP: window.__hp, ticks: window.__intervalTicks,
      stops: window.__stops, resolutions: window.__resolutions, intervals: G.activeIntervals.length,
      flightExpired: window.__flight.expired() };
  });
  assert.equal(stopped.started, false); assert.equal(stopped.finished, false);
  assert.equal(stopped.actors, 2); assert.equal(stopped.frozen, true);
  assert.deepEqual(stopped.hp, stopped.beforeHP); assert.equal(stopped.flightExpired, true);
  assert.equal(stopped.intervals, 0); assert.equal(stopped.stops, 1); assert.equal(stopped.resolutions, 0);
  assert.equal(await page.locator('.projectile-parent, .cast-preparation-container, .recoveryGif').count(), 0);
  assert.equal(await page.locator('#preserved-chest').count(), 1);
  await page.waitForTimeout(1600);
  assert.deepEqual(await page.evaluate(() => [window.__intervalTicks, window.__lateCallback]), [stopped.ticks, false]);
  await page.screenshot({ path: resolve(output, 'combat-stopped.png'), fullPage: true });
  await page.evaluate(async () => {
    const { entites } = await import("/js/entities/runtime.js");
    const { updateEntityAttackDefinition } = await import("/js/combat/attackResolution.js");
    for (const entity of entites) {
      entity.stats.speed = 100;
      entity.stats.accuracy = 10000;
      entity.stats.physicalDamage = 10;
      entity.stats.HP = { current: 10000, max: 10000 };
      entity.stats.dodge = 0;
      updateEntityAttackDefinition(entity, entity.attackDetails[0], {
        preparationTime: 100, executionTime: 100, recoveryTime: 100, cooldown: 100,
        physicalRatio: 1, magicalRatio: 0, piercingRatio: 0,
      });
    }
  });
  await page.locator('#startButton').click();
  await page.waitForFunction(async () => {
    const { entites } = await import("/js/entities/runtime.js");
    return entites.every(entity => !entity.battleStopped && entity.turnCount > 0);
  });
  await page.waitForFunction(async () => {
    const { entites } = await import("/js/entities/runtime.js");
    return entites.every(entity => entity.turnCount >= 2 && entity.stats.HP.current < 10000);
  }, null, { timeout: 20000 });
  await page.evaluate(() => { window.__staleStopButton = document.getElementById('admin-stop-combat'); });
  await button.click();
  await page.waitForFunction(() => window.__stops === 2);
  const resumeHP = await page.evaluate(async () => (await import("/js/entities/runtime.js")).entites.map(entity => entity.stats.HP.current));
  await page.locator('#startButton').click();
  await page.waitForFunction(async hp => {
    const { entites } = await import("/js/entities/runtime.js");
    return entites.every((entity, index) => !entity.battleStopped && entity.turnCount >= 2 && entity.stats.HP.current < hp[index]);
  }, resumeHP, { timeout: 20000 });
  await button.click();
  await page.waitForFunction(() => window.__stops === 3);
  await page.evaluate(async () => {
    const A = await import("/js/debug/admin.js");
    const E = await import("/js/entities/runtime.js");
    const oldButton = window.__staleStopButton;
    window.levelRunning = 'worldmap'; window.currentStageId = 'outside';
    oldButton.click();
    A.cleanupAdminLevel();
    A.initializeAdminLevel(E.entitesNestUp);
    oldButton.click();
  });
  assert.equal(await page.locator('#admin-stop-combat').count(), 0);
  assert.equal(await page.evaluate(() => window.__stops), 3, 'A stale button cannot stop combat outside the Admin level');
  assert.deepEqual(errors, []);
  console.log('Admin Stop passed: real level controls, Start/Stop toggle at the same position, Admin-only action, expired flight, animation/timer cleanup, preserved actors/chest, restart and level exit.');
} finally {
  await browser.close();
  await new Promise(done => server.close(done));
}
