import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = resolve('docs'), output = resolve('outputs/admin-session');
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  const file = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(root + sep)) return res.writeHead(403).end();
  try {
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' })[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1536, height: 960 } });
  const errors = [], diagnostics = [], checks = [];
  page.on('pageerror', error => errors.push(error.stack || error.message));
  page.on('console', message => {
    if (message.type() === 'error') console.log(message.text());
    if (message.type() === 'error' && /^Reset admin :|\[CombatTurnStart\]|\[MultiAttackDecision\]/.test(message.text())) diagnostics.push(message.text());
  });
  const check = (value, label) => { assert.ok(value, label); checks.push(label); };
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  const original = await page.evaluate(async () => {
    const S = await import("/js/storage/gameStorage.js");
    const E = await import("/js/entities/runtime.js");
    const UI = await import("/js/ui/application.js"), _UI = await import("/js/ui/codex/index.js");
    const N = await import("/js/app/worldMap.js");
    const { entitesNest } = await import("/js/data/entityTemplates.js");
    window.levelRunning = 'worldmap'; S.setAdminMode(true);
    const template = entitesNest.find(entity => entity.serial === 900013);
    const actor = E.enrichEntityStats({ ...structuredClone(template), id: 981970, name: 'Saved army', side: 'A', level: 1,
      attacks: ['shot-p-r'], stats: {}, baseStats: { HP: 100, shift: 10, speed: 10000, armor: 10 }, stuff: {}, resourceStocks: {} });
    (await import('/js/items/resourceStocks.js')).addFadedLife(actor, 1, 'consumable');
    S.saveToLocalStorage('selectedArmyA', [actor]); window.selectedArmyA = [actor];
    E.entites.splice(0, E.entites.length, actor);
    UI.createGameContainer(); UI.GameUi(); UI.initializeArmyConfig(); _UI.PlayerArmyCodex();
    N.rebuildWorldMapLevelButtons();
    S.setCurrentLevel(UI.getOrCreateWorldMapID());
    const snapshot = () => JSON.stringify(Object.entries(window.localStorage).sort());
    window.__adminPersistentSnapshot = snapshot;
    window.__adminNativeWrites = [];
    for (const method of ['setItem', 'removeItem', 'clear']) {
      const native = Storage.prototype[method];
      Storage.prototype[method] = function (...args) {
        if (this === window.localStorage) window.__adminNativeWrites.push({ method, key: args[0], stack: new Error().stack });
        return native.apply(this, args);
      };
    }
    return { snapshot: snapshot(), army: S.loadFromLocalStorage('selectedArmyA'), day: localStorage.getItem('gameDay') };
  });
  await page.evaluate(() => document.querySelectorAll('.entitylootContainer, #black-overlay').forEach(node => node.remove()));
  await page.locator('.level-button.admin').first().click();
  await page.locator('.loading-h2.loaded').waitFor({ timeout: 45000 });
  await page.locator('.loading-h2.loaded').click();
  await page.waitForFunction(() => {
    const hud = document.querySelector('.hud-ingame');
    return !document.querySelector('.loading-screen') && document.getElementById('startButton') && hud?.style.opacity === '1' && hud.style.transition === '';
  }, null, { timeout: 30000 });
  check(await page.evaluate(async () => (await import("/js/storage/sessionStorage.js")).isAdminSessionActive()), 'Real map entry activates the in-memory admin session');
  check(await page.evaluate(snapshot => window.__adminPersistentSnapshot() === snapshot && window.__adminNativeWrites.length === 0, original.snapshot), 'Entering admin performs zero localStorage writes');

  for (let round = 0; round < 2; round++) {
    await page.evaluate(async () => {
      const E = await import("/js/entities/runtime.js");
      const S = await import("/js/storage/gameStorage.js");
      const C = await import("/js/rendering/entities.js");
      const { entitesNest } = await import("/js/data/entityTemplates.js");
      document.querySelectorAll('#hexGrid .entite-box').forEach(node => node.remove());
      document.querySelectorAll('#hexGrid .hex').forEach(hex => hex.classList.remove('occupied'));
      E.entites.length = 0;
      const actors = [];
      for (const [index, side] of ['A', 'B'].entries()) {
        const hex = document.querySelector(`#hexGrid .hex.Side${side}`);
        const actor = E.enrichEntityStats({ ...structuredClone(entitesNest.find(row => row.serial === 900013)), id: 981970 + index,
          name: `Admin combat ${side}`, side, role: 'gueux', type: 'sbire', position: hex.dataset.position, level: 1, awakening: 1,
          attacks: ['shot-p-r'], stuff: {}, stats: {}, modifierStats: {}, resourceStocks: {}, baseStats: { HP: 100, armor: 10, speed: 10000, shift: 10 } });
        actor.stats.speed = 10000; actor.statut = ['alive']; actor.isDEAD = false;
        (await import('/js/items/resourceStocks.js')).addFadedLife(actor, 1, 'consumable');
        actors.push(actor);
      }
      E.entites.push(...actors);
      S.saveToLocalStorage('selectedArmyA', [actors[0]]);
      S.saveToLocalStorage('ArmyB', { armies: { test: { entities: [actors[1]] } } });
      for (const actor of actors) {
        const created = C.createEntiteInDOM(actor);
        document.querySelector(`[data-position="${actor.position}"].hex`).appendChild(created.element);
        await created.spriteReady;
        (await import("/js/rendering/auras.js")).syncEntityAuras(actor);
      }
      (await import('/js/board/controller.js')).rebuildBoardOccupancy();
      (await import("/js/combat/loop.js")).initFightEntites();
      window.__adminCombatActors = actors;
      const G = await import("/js/app/state.js");
      G.manageBattleActions({ mode: G.BATTLE_ACTION_MODE.START });
    });
    await page.locator('#startButton').click();
    await page.waitForFunction(() => window.__adminCombatActors.every(actor => actor.turnCount === 1 && actor.speedTimer > 0 && actor.speedTimer < 9500));
    check(true, `Combat ${round + 1}: real Start button advances both entity turns, including reused IDs after reset`);
    const ids = await page.evaluate(async () => {
      const M = await import('/js/items/itemManager.js');
      const I = await import('/js/items/items.js');
      const P = await import('/js/items/permanentItems.js');
      const free = [...document.querySelectorAll('#hexGrid .hex')].filter(hex => !hex.querySelector('.entite-box, [data-ground-summon]'));
      const crystal = P.createUmbraCrystal({ statKey: 'attackCooldownReduc', origin: 'admin-spawn', random: () => .5 });
      if (!M.spawnBattleGroundItem(crystal, free[0], 'admin-spawn', { infinite: true })) throw Error('Crystal spawn failed');
      const dataTransfer = new DataTransfer(); dataTransfer.setData('text', `Box_Entite_${window.__adminCombatActors[0].id}`);
      free[0].dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
      await new Promise(done => setTimeout(done, 100));
      if (!M.getIngameItemById(crystal.itemId)) throw Error('Admin placement must preserve ground items');
      const Board = await import('/js/board/controller.js');
      const pickup = Board.planEntityPlacements([{ entity: window.__adminCombatActors[0], hex: free[0] }], { allowGroundConsumables: true });
      if (!pickup.valid || !Board.commitEntityPlacements(pickup, { persist: true })) throw Error('Combat pickup placement failed');
      await new Promise(done => setTimeout(done, 100));
      if (M.getIngameItemById(crystal.itemId) || window.__adminCombatActors[0].baseStats.attackCooldownReduc !== 2) throw Error('In-memory crystal gain failed');
      const second = P.createUmbraCrystal({ statKey: 'magicalPenPlus', origin: 'admin-spawn' });
      const potion = I.createIngameItem('i0', 'admin-spawn');
      M.spawnBattleGroundItem(second, free[1], 'admin-spawn', { infinite: true });
      M.spawnBattleGroundItem(potion, free[2], 'admin-spawn');
      M.spawnAdminGroundSummon('jarret-summon', free[3], { infinite: true });
      document.getElementById('admin-event-launch-status').textContent = '';
      return [second.itemId, potion.itemId];
    });
    await page.waitForFunction(() => document.querySelectorAll('[data-ground-summon]').length === 3);
    check(await page.locator('[data-ground-summon]').count() === 3, 'Combat contains a timed item, infinite crystal and infinite native summon');
    await page.screenshot({ path: resolve(output, `combat-${round + 1}-before-reset.png`) });
    if (round === 1) await page.evaluate(async () => {
      (await import("/js/app/state.js")).setOrderSide('A');
      (await import("/js/events/runtime.js")).attackSurprise('B');
    });
    await page.getByRole('button', { name: 'Reset niveau', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('admin-event-launch-status').textContent.includes('réinitialisé'));
    await page.waitForTimeout(1200);
    const stopped = await page.evaluate(async ids => {
      const E = await import("/js/entities/runtime.js"), G = await import("/js/app/state.js"), M = await import('/js/items/itemManager.js');
      const save = M.getBattleInventoryState();
      return !G.gameStarted && !E.entites.length && !G.activeIntervals.length && G.getOrderSide() === null
        && (await import("/js/events/runtime.js")).getSurprisedSide() === null
        && !save.battleGroundItems.length && !save.adminGroundSummons.length && ids.every(id => !M.getIngameItemById(id))
        && !document.querySelector('#hexGrid .entite-box, [data-ground-summon], .ground-loot-remnant, #hexGrid .ground-item-glitter')
        && window.__adminCombatActors.every(actor => actor.turnCount === 0 && actor.speedTimer === 0
          && Object.values(actor).filter(value => value instanceof Node).every(node => !node.isConnected))
        && Boolean(document.getElementById('startButton'));
    }, ids);
    check(stopped, `Combat ${round + 1}: reset removes entities, auras, items and timers, clears order/surprise and restores Start`);
    check(await page.evaluate(snapshot => window.__adminPersistentSnapshot() === snapshot && window.__adminNativeWrites.length === 0, original.snapshot), 'Combat, gains and reset perform zero persistent writes');
  }
  await page.evaluate(async () => (await import("/js/app/stages.js")).QuitCurrentLevel());
  await page.waitForFunction(async () => window.levelRunning === 'worldmap' && !window.__QUIT_LEVEL_LOCK__ && !(await import("/js/storage/sessionStorage.js")).isAdminSessionActive());
  check(await page.evaluate(snapshot => window.__adminPersistentSnapshot() === snapshot && window.__adminNativeWrites.length === 0, original.snapshot), 'Leaving admin restores the map with the persistent save byte-for-byte unchanged');
  check(await page.evaluate(async original => {
    const S = await import("/js/storage/gameStorage.js");
    return JSON.stringify(S.loadFromLocalStorage('selectedArmyA')) === JSON.stringify(original.army) && localStorage.getItem('gameDay') === original.day;
  }, original), 'Normal army and day remain unchanged after admin experiments');
  await page.locator('.level-button.admin').first().click({ force: true });
  await page.locator('.loading-h2.loaded').waitFor({ timeout: 45000 });
  await page.evaluate(async () => {
    const S = await import("/js/storage/gameStorage.js");
    S.saveToLocalStorage('admin-reload-probe', { temporary: true });
  });
  await page.reload({ waitUntil: 'load' });
  check(await page.evaluate(async () => !(await import("/js/storage/sessionStorage.js")).isAdminSessionActive()
    && (await import("/js/storage/gameStorage.js")).loadFromLocalStorage('admin-reload-probe') === null
    && !document.querySelector('[data-ground-summon]')), 'Reload discards admin state instead of restoring it');
  check(await page.evaluate(async () => {
    const S = await import("/js/storage/sessionStorage.js");
    const snapshot = () => JSON.stringify(Object.entries(window.localStorage).sort());
    const before = snapshot();
    S.beginAdminSession();
    S.gameStorage.setItem('memory-probe', 42);
    if (S.gameStorage.getItem('memory-probe') !== '42'
      || !Array.from({ length: S.gameStorage.length }, (_, index) => S.gameStorage.key(index)).includes('memory-probe')) return false;
    S.gameStorage.removeItem('memory-probe');
    if (S.gameStorage.getItem('memory-probe') !== null) return false;
    S.gameStorage.clear();
    if (S.gameStorage.length !== 0 || snapshot() !== before) return false;
    S.restorePersistentSession(); S.endAdminSession();
    S.gameStorage.setItem('normal-probe', 'saved');
    const normalWrites = window.localStorage.getItem('normal-probe') === 'saved';
    S.gameStorage.removeItem('normal-probe');
    return normalWrites && snapshot() === before;
  }), 'Memory read/write/remove/clear are isolated; normal persistent writes resume outside admin');
  assert.deepEqual(errors, []);
  assert.deepEqual(diagnostics, []);
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ checks, errors, diagnostics }, null, 2));
  console.log(`PASS ${checks.length} full admin-session checks`);
} finally { await browser.close(); await new Promise(done => server.close(done)); }
