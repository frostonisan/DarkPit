import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = resolve('docs');
const output = resolve('outputs/admin-ground-items');
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  const file = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(root + sep)) return res.writeHead(403).end();
  try {
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png' })[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1536, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.stack || error.message));
  await page.clock.install({ time: new Date('2026-10-25T12:00:00Z') });
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  const report = await page.evaluate(async () => {
    const Admin = await import("/js/debug/admin.js");
    const E = await import("/js/entities/runtime.js");
    const S = await import("/js/storage/gameStorage.js");
    const M = await import('/js/items/itemManager.js');
    const P = await import('/js/items/permanentItems.js');
    const State = await import("/js/app/state.js");
    const { ItemDetails } = await import('/js/data/itemList.js');
    const { summons } = await import('/js/data/summons.js');
    window.__groundClock = await import('/js/combat/clock.js');
    const checks = [], check = (ok, label) => { if (!ok) throw Error(label); checks.push(label); };
    const registry = () => S.loadFromLocalStorage('IngameItems', []);
    const ground = () => M.getBattleInventoryState().battleGroundItems;
    const list = () => document.getElementById('admin-entity-list');
    const tab = key => document.querySelector(`#admin-entity-form [data-admin-tab-key="${key}"]`).click();
    const wait = ms => new Promise(done => setTimeout(done, ms));
    const doubleClick = row => {
      for (const [type, detail] of [['click', 1], ['click', 2], ['dblclick', 2]]) {
        row.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, detail }));
      }
    };
    const drop = (row, hex) => {
      check(row?.draggable, 'Catalog spawn row is draggable');
      const dataTransfer = new DataTransfer();
      row.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }));
      check(dataTransfer.getData('application/x-admin-spawn').startsWith('ADMIN_SPAWN:'), 'Drag carries an admin spawn payload');
      const over = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer });
      hex.dispatchEvent(over);
      check(over.defaultPrevented, 'Terrain accepts the catalog drag');
      hex.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
    };
    S.setAdminMode(true);
    S.setCurrentLevel('admin-items-test'); window.currentStageId = 'admin-items-test'; window.levelRunning = 'admin';
    S.saveToLocalStorage('GameStages', { stages: [{ id: 'admin-items-test', level_type: 'admin' }] });
    S.saveToLocalStorage('PlayerSave', { Playerinventory: [], battleSlots: [], battleGroundItems: [], equippedItems: [] });
    S.saveToLocalStorage('IngameItems', []);
    S.saveToLocalStorage('selectedArmyA', []); S.saveToLocalStorage('ArmyB', { armies: {} });
    S.savePlayerInfo({ battleSlotCount: 4 });
    E.entites.length = 0;
    State.setGameOver(false); State.refreshStageAccess();
    document.body.innerHTML = '<div id="game-container"><div class="Game-UI"></div><div id="hexGrid" class="hex-grid"></div></div>';
    const grid = document.getElementById('hexGrid');
    grid.style.cssText = 'position:fixed;left:400px;top:180px;display:grid;grid-template-columns:repeat(5,100px);gap:10px;transform:none;';
    for (let row = 0; row < 3; row++) for (let col = 0; col < 5; col++) {
      const hex = document.createElement('div'); hex.id = `hex_${row * 5 + col + 1}`;
      Object.assign(hex.dataset, { position: hex.id, row, col });
      hex.className = `hex ${col < 2 ? 'SideA' : col > 2 ? 'SideB' : 'Neutral'}`;
      hex.style.cssText = 'width:100px;height:100px;position:relative;transform:none;background:#20252a;';
      hex.appendChild(Object.assign(document.createElement('div'), { className: 'socle' }));
      grid.appendChild(hex);
    }
    Admin.initializeAdminLevel(E.entitesNestUp);
    const persistentSnapshot = JSON.stringify(Object.entries(localStorage).sort());
    const persistentWrites = [], nativeStorage = {};
    for (const method of ['setItem', 'removeItem', 'clear']) {
      nativeStorage[method] = Storage.prototype[method];
      Storage.prototype[method] = function (...args) {
        if (this === localStorage) persistentWrites.push(method);
        return nativeStorage[method].apply(this, args);
      };
    }
    tab('items');
    const eligible = ItemDetails.filter(M.isBattleConsumable);
    check(list().querySelectorAll('[data-item-serial]').length === eligible.length, 'Items lists every ground-eligible inventory consumable');
    check(list().querySelectorAll('[data-summon-effect]').length === summons.filter(row => row.summonType === 'consommable').length,
      'Items also lists all native consumable summons');
    for (const item of eligible) {
      list().querySelector(`[data-item-serial="${item.serial}"]`).click();
      const spawned = registry()[0], entry = ground()[0];
      check(registry().length === 1 && ground().length === 1 && spawned.serial === item.serial
        && document.querySelector(`[data-ground-summon][data-item-id="${spawned.itemId}"]`), `One grounded copy: ${item.serial}`);
      check(entry.expiresAt > window.__groundClock.clockNow() + 19000 && entry.expiresAt <= window.__groundClock.clockNow() + 20000, `Normal ground lifetime: ${item.serial}`);
      check(M.validateBattleInventoryState().ok, `Unique ownership: ${item.serial}`);
      M.clearBattleGroundItems();
      drop(list().querySelector(`[data-item-serial="${item.serial}"]`), grid.querySelector('#hex_8'));
      check(registry().length === 1 && ground().length === 1 && registry()[0].serial === item.serial
        && ground()[0].position === 'hex_8', `Every inventory item drops exactly once on the requested hex: ${item.serial}`);
      M.clearBattleGroundItems();
    }
    for (const row of list().querySelectorAll('[data-summon-effect]')) {
      row.click();
      check(grid.querySelectorAll('[data-ground-summon]').length === 1 && !registry().length,
        `Native summon spawns without an inventory copy: ${row.dataset.summonEffect}`);
      M.clearBattleGroundItems();
      drop(row, grid.querySelector('#hex_8'));
      check(grid.querySelectorAll('#hex_8 [data-ground-summon]').length === 1 && !registry().length,
        `Every native consumable drops on the requested hex: ${row.dataset.summonEffect}`);
      M.clearBattleGroundItems();
    }
    const search = document.getElementById('admin-list-search-input');
    search.value = eligible[0].serial; search.dispatchEvent(new Event('input'));
    check(list().querySelector(`[data-item-serial="${eligible[0].serial}"]`), 'Items search matches serials');
    search.value = ''; search.dispatchEvent(new Event('input'));
    tab('misc');
    const rootRow = [...list().children].find(row => row.textContent.includes('Cristaux'));
    rootRow.click();
    check(!registry().length, 'Single click on the crystal category does not spawn');
    const random = Math.random;
    try {
      for (const level of [1, 2, 3, 4]) {
        Math.random = () => (level - .5) / 4;
        doubleClick(rootRow);
        check(registry().length === 1 && registry()[0].permanentStat.crystalLevel === level,
          `Root double click chooses a random child tier ${level} and creates exactly one crystal`);
        M.clearBattleGroundItems();
      }
    } finally { Math.random = random; }
    drop(rootRow, grid.querySelector('#hex_8'));
    check(ground().length === 1 && ground()[0].position === 'hex_8' && P.getPermanentStatGrant(registry()[0]),
      'Root crystal category is draggable and creates one random crystal at the drop');
    M.clearBattleGroundItems();
    rootRow.querySelector('button').click();
    check(!registry().length && !ground().length, 'Arrow opens tiers without spawning a crystal');
    const choices = P.getPermanentStatChoices();
    check(list().querySelectorAll('[data-crystal-tier]').length === 4 && !list().querySelector('[data-crystal-stat]'),
      'Four crystal tiers are integrated as nested list entries');
    check(!document.getElementById('admin-crystal-filters'), 'No separate tier filter toolbar');
    for (const level of [1, 2, 3, 4]) {
      const tier = list().querySelector(`[data-crystal-tier="${level}"]`);
      tier.click();
      check(!registry().length, `Level ${level}: single click does not spawn`);
      doubleClick(tier);
      check(registry().length === 1 && registry()[0].permanentStat.crystalLevel === level,
        `Level ${level}: double click creates one random stat within the tier`);
      M.clearBattleGroundItems();
      drop(tier, grid.querySelector('#hex_8'));
      check(ground().length === 1 && ground()[0].position === 'hex_8' && registry()[0].permanentStat.crystalLevel === level,
        `Level ${level}: drag preserves the tier and target hex`);
      M.clearBattleGroundItems();
      search.value = `Niv ${level}`;
      tier.querySelector('button').click();
      check(search.value === '' && !registry().length, `Level ${level}: arrow clears the parent search without spawning`);
      const expected = choices.filter(choice => choice.crystalLevel === level);
      const rows = [...list().querySelectorAll('[data-crystal-stat]')];
      check(rows.length === expected.length && rows.every(row => Number(row.dataset.crystalLevel) === level),
        `Level ${level}: subsection contains exactly its stat category`);
      search.value = expected[0].name;
      search.dispatchEvent(new Event('input'));
      check(list().querySelector(`[data-crystal-stat="${expected[0].key}"]`)
        && [...list().querySelectorAll('[data-crystal-stat]')].every(row => Number(row.dataset.crystalLevel) === level),
        `Level ${level}: text search stays within the selected tier`);
      search.value = ''; search.dispatchEvent(new Event('input'));
      if (level === 4) check(rows.map(row => row.dataset.crystalStat).sort().join() === 'agility,intelligence,strength,will',
        'Level 4 contains all four attributes and no autonomous stats');
      for (const choice of expected) {
        const row = list().querySelector(`[data-crystal-stat="${choice.key}"]`);
        check(row?.querySelector(`.picto-stat.${choice.icon}`), `Crystal stat icon: ${choice.key}`);
        const input = row.querySelector('.admin-crystal-amount');
        check(input?.type === 'number' && input.value === '' && input.min === '1' && input.step === '1',
          `Compact amount input defaults to the random roll: ${choice.key}`);
        row.click();
        const item = registry()[0];
        check(registry().length === 1 && item.permanentStat.key === choice.key && item.permanentStat.amount >= 1
          && item.permanentStat.amount <= 3, `Chosen crystal stat with random amount: ${choice.key}`);
        M.clearBattleGroundItems();
        input.value = String(10 + level);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        doubleClick(input);
        input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
        const inputDrag = new DataTransfer();
        const inputDragEvent = new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: inputDrag });
        input.dispatchEvent(inputDragEvent);
        check(!registry().length && inputDragEvent.defaultPrevented && !inputDrag.getData('application/x-admin-spawn'),
          `Editing, double-clicking, Enter and dragging the input never spawn: ${choice.key}`);
        row.click();
        check(registry().length === 1 && P.getPermanentStatGrant(registry()[0])?.amount === 10 + level
          && registry()[0].displayName.includes(`+${10 + level}`), `Click grants the chosen amount above three: ${choice.key}`);
        M.clearBattleGroundItems();
        input.value = String(20 + level);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        drop(row, grid.querySelector('#hex_8'));
        check(registry().length === 1 && ground().length === 1 && ground()[0].position === 'hex_8'
          && registry()[0].permanentStat.key === choice.key && P.getPermanentStatGrant(registry()[0])?.amount === 20 + level,
          `Exact stat and latest amount drag with no extra item: ${choice.key}`);
        M.clearBattleGroundItems();
      }
      const firstRow = list().querySelector(`[data-crystal-stat="${expected[0].key}"]`);
      const firstInput = firstRow.querySelector('input');
      for (const invalid of ['0', '-2', '1.5', '9007199254740992']) {
        firstInput.value = invalid;
        firstInput.dispatchEvent(new Event('input', { bubbles: true }));
        firstRow.click();
        const dataTransfer = new DataTransfer();
        const drag = new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer });
        firstRow.dispatchEvent(drag);
        check(!firstInput.checkValidity() && !registry().length && drag.defaultPrevented && !dataTransfer.getData('application/x-admin-spawn'),
          `Level ${level}: invalid amount ${invalid} cannot spawn or start a drag`);
      }
      firstInput.value = '';
      firstInput.dispatchEvent(new Event('input', { bubbles: true }));
      firstRow.click();
      check(registry().length === 1 && registry()[0].permanentStat.amount >= 1 && registry()[0].permanentStat.amount <= 3,
        `Level ${level}: clearing the amount restores random +1 to +3`);
      M.clearBattleGroundItems();
      firstInput.value = '6'; firstInput.dispatchEvent(new Event('input', { bubbles: true }));
      list().firstElementChild.click();
      check(list().querySelectorAll('[data-crystal-tier]').length === 4, `Level ${level}: back returns to tiers`);
      doubleClick(list().querySelector(`[data-crystal-tier="${level}"]`));
      check(registry().length === 1 && registry()[0].permanentStat.amount <= 3,
        `Level ${level}: random category spawn ignores per-stat overrides`);
      M.clearBattleGroundItems();
      list().querySelector(`[data-crystal-tier="${level}"] button`).click();
      check(list().querySelector(`[data-crystal-stat="${expected[0].key}"] input`).value === '6',
        `Level ${level}: returning to the subsection retains its own amounts`);
      list().firstElementChild.click();
    }
    let rejected = false;
    try { P.createUmbraCrystal({ statKey: 'unknown-stat' }); } catch { rejected = true; }
    check(rejected && !registry().length, 'Invalid chosen stat never creates a registered item');
    list().querySelector('[data-crystal-tier="2"] button').click();
    const chosenAmount = list().querySelector('[data-crystal-stat="magicalPenPlus"] input');
    chosenAmount.value = '6'; chosenAmount.dispatchEvent(new Event('input', { bubbles: true }));
    drop(list().querySelector('[data-crystal-stat="magicalPenPlus"]'), grid.querySelector('#hex_8'));
    check(ground().length === 1 && ground()[0].position === 'hex_8' && registry()[0].permanentStat.key === 'magicalPenPlus',
      'Crystal drag chooses the exact hex and stat');
    const expiresAt = ground()[0].expiresAt;
    M.restoreBattleGroundItems();
    check(ground().length === 1 && ground()[0].expiresAt === expiresAt && grid.querySelectorAll('[data-ground-summon]').length === 1,
      'Admin restoration neither duplicates the item nor resets its lifetime');
    const target = { ...structuredClone(E.entitesNestUp[0]), id: 981950, name: 'Admin crystal test', side: 'A', position: 'hex_1', type: 'sbire', awakening: 1,
      level: { current: 1, max: 250 }, attacks: ['autoAttack'], stuff: {}, stats: {},
      baseStats: { HP: 30, intelligence: 20, strength: 10, agility: 10, speed: 1000, shift: 10, fadedLife: 1 } };
    E.recomputeEntityStats(target);
    (await import('/js/items/resourceStocks.js')).addFadedLife(target, 1, 'consumable');
    E.entites.push(target); S.saveToLocalStorage('selectedArmyA', [target]);
    const amount = registry()[0].permanentStat.amount;
    check(amount === 6, 'Ground pickup fixture uses the exact manually entered amount');
    const C = await import("/js/rendering/entities.js");
    const Aura = await import("/js/rendering/auras.js");
    const Drag = await import("/js/board/interaction.js");
    const Board = await import('/js/board/controller.js');
    const created = C.createEntiteInDOM(target);
    const box = created.element;
    grid.querySelector('#hex_1').appendChild(box);
    grid.querySelector('#hex_1').classList.add('occupied');
    await created.spriteReady;
    Aura.syncEntityAuras(target);
    const runtimeKeys = Object.keys(target).filter(key => target[key] instanceof Node);
    check(runtimeKeys.length > 0, 'Real board entity owns live aura DOM references before crystal pickup');
    const shared = { remaining: 2 };
    target._saveProbe = { first: shared, second: shared, node: box, callback: () => {}, owner: target };
    (await import('/js/board/controller.js')).invalidateFootprintGeometry(grid);
    (await import('/js/board/controller.js')).rebuildBoardOccupancy(grid);
    Drag.restoreEntityDragAndDrop();
    const dragData = new DataTransfer(); dragData.setData('text', box.id);
    grid.querySelector('#hex_8').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dragData }));
    await wait(50);
    check(target.position === 'hex_1' && ground().length === 1,
      'Admin placement rejects a ground-occupied cell without consuming its item');
    // Gameplay movement and editor placement use distinct occupancy policies.
    const pickup = Board.planEntityPlacements([{ entity: target, hex: grid.querySelector('#hex_8') }], { allowGroundConsumables: true });
    check(pickup.valid && Board.commitEntityPlacements(pickup, { persist: true }), 'Combat placement triggers the ground-item pipeline');
    await wait(250);
    check(!ground().length && !registry().length && target.baseStats.magicalPenPlus === amount,
      'Admin crystal is consumed once and grants exactly its permanent bonus');
    const savedTarget = S.loadFromLocalStorage('selectedArmyA', []).find(entity => entity.id === target.id);
    check(savedTarget.baseStats.magicalPenPlus === amount, 'Persisted combat placement saves the crystal bonus despite live aura references');
    check(runtimeKeys.every(key => target[key] instanceof Node && !(key in savedTarget)),
      'Saving omits runtime aura nodes without deleting the live aura');
    check(savedTarget._saveProbe.first.remaining === 2 && savedTarget._saveProbe.second.remaining === 2
      && !('node' in savedTarget._saveProbe) && !('callback' in savedTarget._saveProbe) && !('owner' in savedTarget._saveProbe),
      'Nested runtime nodes, callbacks and cycles are omitted while shared stat data survives');
    S.saveToLocalStorage('ArmyB', { armies: { test: { entities: [savedTarget] } } });
    (await import("/js/storage/entityStorage.js")).saveEntireEntityToStorage(target);
    const savedEnemy = S.loadFromLocalStorage('ArmyB').armies.test.entities[0];
    check(savedEnemy.baseStats.magicalPenPlus === amount && runtimeKeys.every(key => !(key in savedEnemy)),
      'Enemy army storage also saves the permanent bonus without runtime DOM references');
    S.saveToLocalStorage('ArmyB', { armies: {} });
    box.remove(); E.entites.length = 0; Board.rebuildBoardOccupancy(grid);
    tab('items');
    drop(list().querySelector('[data-item-serial="i0"]'), grid.querySelector('#hex_7'));
    check(ground()[0]?.position === 'hex_7' && registry()[0]?.serial === 'i0', 'Item drag uses the requested terrain hex');
    const save = M.getBattleInventoryState(); save.battleGroundItems[0].expiresAt = window.__groundClock.clockNow() - 1;
    S.saveToLocalStorage('PlayerSave', save); M.restoreBattleGroundItems();
    check(!ground().length && !registry().length && !grid.querySelector('[data-ground-summon]'),
      'Expired admin items are removed from ground, registry and display: ' + JSON.stringify({ground:ground().length,registry:registry().length,nodes:grid.querySelectorAll('[data-ground-summon]').length,access:State.getStageAccess()}));
    Admin.cleanupAdminLevel(); Admin.initializeAdminLevel(E.entitesNestUp);
    check(list().querySelectorAll('[data-item-serial]').length === eligible.length, 'Items category survives reopening admin');
    tab('misc');
    const crystals = [...list().children].find(row => row.textContent.includes('Cristaux'));
    grid.querySelectorAll('.hex').forEach(hex => hex.classList.add('occupied'));
    doubleClick(crystals);
    check(!registry().length && !ground().length, 'Full board does not leave an orphaned crystal');
    grid.querySelectorAll('.hex').forEach(hex => hex.classList.remove('occupied'));
    crystals.querySelector('button').click();
    list().querySelector('[data-crystal-tier="2"] button').click();
    check(list().querySelector('[data-crystal-stat="magicalPenPlus"] input').value === '6',
      'Reopening admin preserves the per-stat amount in the current session');
    list().querySelector('[data-crystal-stat="magicalPenPlus"]').click();
    check(!persistentWrites.length && persistentSnapshot === JSON.stringify(Object.entries(localStorage).sort()),
      'Crystal amount edits, spawns and menu reopening perform zero persistent writes');
    for (const [method, native] of Object.entries(nativeStorage)) Storage.prototype[method] = native;
    return { checks, items: eligible.length, crystals: choices.length, savedEntityId: target.id, savedAmount: amount };
  });
  await page.locator('#admin-entity-form').screenshot({ path: resolve(output, 'crystal-choices.png') });
  await page.screenshot({ path: resolve(output, 'admin-ground.png') });
  await page.evaluate(async () => (await import('/js/items/itemManager.js')).clearBattleGroundItems());
  const amountRow = page.locator('[data-crystal-stat="magicalPenPlus"]');
  const amountInput = amountRow.locator('input');
  await amountInput.fill('6');
  await amountInput.dblclick();
  await amountInput.press('ArrowUp');
  await amountInput.press('Enter');
  assert.equal(await amountInput.inputValue(), '7');
  assert.equal(await page.locator('[data-ground-summon]').count(), 0);
  await amountRow.locator('.admin-stat-editor-name').click();
  assert.equal(await page.evaluate(async () => (await import("/js/storage/gameStorage.js")).loadFromLocalStorage('IngameItems', [])[0]?.permanentStat.amount), 7);
  report.checks.push('Real pointer and keyboard input edits spawn nothing until the stat name is clicked, then grant the exact amount');
  await page.evaluate(async () => (await import('/js/items/itemManager.js')).clearBattleGroundItems());
  // Keep the synthetic board out of the catalog layout captures.
  const catalogCaptureStyle = await page.addStyleTag({ content: '#admin-entity-form { position:fixed; top:16px; right:16px; bottom:auto; z-index:100000; }' });
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const level of [1, 2, 3, 4]) {
      const layout = await page.evaluate(level => {
        const list = document.getElementById('admin-entity-list');
        list.firstElementChild.click();
        list.querySelector(`[data-crystal-tier="${level}"] button`).click();
        return [...list.querySelectorAll('[data-crystal-stat]')].flatMap(row => {
          const rect = row.getBoundingClientRect();
          const input = row.querySelector('input');
          const field = input.getBoundingClientRect();
          const label = row.querySelector('.admin-stat-editor-name');
          const name = label.getBoundingClientRect();
          const fits = field.width > 0 && field.left >= name.right && field.right <= rect.right
            && row.scrollWidth <= row.clientWidth + 1
            && label.scrollWidth <= label.clientWidth + 1;
          const colors = [getComputedStyle(input).color, getComputedStyle(label).color];
          return fits && colors[0] === colors[1] ? [] : [{ stat: row.dataset.crystalStat, fits, colors }];
        });
      }, level);
      assert.deepEqual(layout, [], `${width}px level ${level}: amount inputs fit beside stat labels with matching colors`);
      report.checks.push(`${width}px level ${level}: every stat input fits without overlap and uses its stat color`);
      await page.locator('#admin-entity-form').screenshot({ path: resolve(output, `crystal-amounts-${width}-level-${level}.png`) });
    }
  }
  await page.setViewportSize({ width: 1536, height: 900 });
  await catalogCaptureStyle.evaluate(style => style.remove());
  await page.evaluate(() => {
    const list = document.getElementById('admin-entity-list');
    list.firstElementChild.click();
    list.querySelector('[data-crystal-tier="2"] button').click();
  });
  await page.clock.pauseAt(new Date('2026-10-25T12:01:00Z'));
  const infiniteFixture = await page.evaluate(async () => {
    const M = await import('/js/items/itemManager.js');
    const I = await import('/js/items/items.js');
    const tab = key => document.querySelector(`#admin-entity-form [data-admin-tab-key="${key}"]`).click();
    const row = selector => document.querySelector(`#admin-entity-list ${selector}`);
    row('[data-crystal-stat="magicalPenPlus"]').click();
    tab('items'); row('[data-item-serial="i0"]').click(); row('[data-summon-effect="jarret-summon"]').click();
    const item = I.createIngameItem('i0', 'normal-lifetime-test');
    M.spawnBattleGroundItem(item, document.getElementById('hex_15'));
    const before = M.getBattleInventoryState();
    document.getElementById('admin-ground-infinite').click();
    return { ids: before.battleGroundItems.filter(entry => entry.itemId !== item.itemId).map(entry => entry.itemId),
      nativeId: before.adminGroundSummons[0].id, ordinaryId: item.itemId,
      grid: document.getElementById('hexGrid').outerHTML };
  });
  await page.clock.fastForward(25000);
  const held = await page.evaluate(async ({ ids, ordinaryId }) => {
    const M = await import('/js/items/itemManager.js');
    const save = M.getBattleInventoryState();
    return {
      infinite: save.battleGroundItems.length === 2 && save.battleGroundItems.every(row => row.infinite && row.expiresAt === null),
      native: save.adminGroundSummons.length === 1 && save.adminGroundSummons[0].infinite,
      alive: ids.every(id => document.querySelector(`[data-ground-summon][data-item-id="${id}"][data-infinite="true"]`)),
      noBars: [...document.querySelectorAll('[data-ground-summon][data-infinite="true"] .ground-item-lifetime')].every(node => node.hidden),
      ordinaryExpired: !M.getIngameItemById(ordinaryId),
      aura: [...document.querySelectorAll('[data-ground-summon]')].every(node => node.querySelector('.ground-item-glitter .glitter-loot')),
      visibleAura: [...document.querySelectorAll('[data-ground-summon] .ground-item-glitter:not(.is-dispersing)')].every(node => getComputedStyle(node).opacity === '1'
        && node.children.length === 8 && [...node.children].every(particle => {
          const animation = particle.getAnimations().find(entry => entry.animationName === 'groundItemLootFloat');
          const frames = animation?.effect.getKeyframes();
          return frames && Number(frames[0].opacity) === 0 && Number(frames.at(-1).opacity) === 0
            && frames.some(frame => frame.offset === .25 && Number(frame.opacity) === 1)
            && frames.some(frame => frame.offset === .7 && Number(frame.opacity) === 1);
        })),
      softEdges: [...document.querySelectorAll('[data-ground-summon] .ground-item-glitter')].every(node => {
        const style = getComputedStyle(node);
        return style.overflow === 'hidden' && style.maskImage.includes('24px') && style.maskImage.includes('28px')
          && style.maskImage.includes('100% - 28px') && style.maskComposite.includes('intersect');
      }),
    };
  }, infiniteFixture);
  for (const [label, value] of Object.entries(held)) { assert.ok(value, label); report.checks.push(`Infinite admin lifetime: ${label}`); }
  await page.locator('#admin-entity-form').screenshot({ path: resolve(output, 'infinite-items.png') });
  await page.screenshot({ path: resolve(output, 'infinite-board.png') });
  await page.evaluate(async () => (await import("/js/debug/admin.js")).cleanupAdminLevel());
  assert.equal(await page.evaluate(async id => (await import("/js/storage/gameStorage.js")).loadFromLocalStorage('selectedArmyA', [])
    .find(entity => entity.id === id)?.baseStats.magicalPenPlus, report.savedEntityId), report.savedAmount);
  report.checks.push('Reopening the admin menu preserves the bonus in the current in-memory session');
  const reloadState = await page.evaluate(async ({ grid, ids, nativeId }) => {
    const S = await import("/js/storage/gameStorage.js");
    const E = await import("/js/entities/runtime.js");
    const Admin = await import("/js/debug/admin.js");
    const State = await import("/js/app/state.js");
    const M = await import('/js/items/itemManager.js');
    E.entites.length = 0; S.saveToLocalStorage('selectedArmyA', []);
    window.currentStageId = 'admin-items-test'; window.levelRunning = 'admin';
    S.setCurrentLevel('admin-items-test'); State.setGameOver(false); State.refreshStageAccess();
    Admin.initializeAdminLevel(E.entitesNestUp);
    M.restoreBattleGroundItems();
    return {
      checked: document.getElementById('admin-ground-infinite').checked,
      copies: document.querySelectorAll('[data-ground-summon]').length,
      ids: M.getBattleInventoryState().battleGroundItems.map(row => row.itemId).sort().join() === ids.sort().join(),
      native: M.getBattleInventoryState().adminGroundSummons[0]?.id === nativeId,
    };
  }, infiniteFixture);
  assert.ok(reloadState.checked && reloadState.copies === 3 && reloadState.ids && reloadState.native);
  report.checks.push('Reopening admin within the session retains the checkbox and the same three infinite objects exactly once');
  await page.evaluate(() => document.getElementById('admin-ground-infinite').click());
  const restarted = await page.evaluate(async () => {
    const save = (await import('/js/items/itemManager.js')).getBattleInventoryState();
    return save.battleGroundItems.every(row => !row.infinite && row.expiresAt - window.__groundClock.clockNow() === 20000)
      && save.adminGroundSummons.every(row => !row.infinite && row.expiresAt - window.__groundClock.clockNow() === 10000)
      && [...document.querySelectorAll('.ground-item-lifetime')].every(node => !node.hidden);
  });
  assert.ok(restarted); report.checks.push('Disabling infinite restarts complete 20s item and 10s summon lifetimes, with visible counters');
  await page.clock.fastForward(9999);
  assert.equal(await page.locator('[data-ground-summon]').count(), 3);
  await page.clock.fastForward(2);
  assert.equal(await page.locator('[data-ground-summon]').count(), 2);
  assert.ok(await page.locator('.ground-loot-remnant .glitter-loot-container.is-dispersing').count());
  report.checks.push('Native summon expires at its normal deadline and disperses the chest loot particles');
  await page.clock.fastForward(10000);
  assert.equal(await page.locator('[data-ground-summon]').count(), 0);
  assert.equal(await page.locator('.ground-loot-remnant .glitter-loot-container.is-dispersing').count(), 2);
  report.checks.push('Both items expire once and leave only their temporary loot-particle dispersal');
  await page.clock.fastForward(5000);
  assert.equal(await page.locator('.ground-loot-remnant').count(), 0);
  report.checks.push('Loot particle hosts are removed after fading, with no permanent residue');
  await page.evaluate(() => {
    document.getElementById('admin-ground-infinite').click();
    document.querySelector('#admin-entity-form [data-admin-tab-key="misc"]').click();
    [...document.querySelectorAll('#admin-entity-list > div')].find(row => row.textContent.includes('Cristaux')).querySelector('button').click();
    document.querySelector('#admin-entity-list [data-crystal-tier="1"] button').click();
    document.querySelector('#admin-entity-list [data-crystal-stat="attackCooldownReduc"]').click();
  });
  const consumedInfinite = await page.evaluate(async () => {
    const M = await import('/js/items/itemManager.js');
    const E = await import("/js/entities/runtime.js");
    const S = await import("/js/storage/gameStorage.js");
    const entry = M.getBattleInventoryState().battleGroundItems[0];
    const item = M.getIngameItemById(entry.itemId);
    const startHex = [...document.querySelectorAll('.hex')].find(hex => hex.dataset.position !== entry.position);
    const target = { ...structuredClone(E.entitesNestUp[0]), id: 981951, name: 'Infinite loot test', side: 'A', position: startHex.dataset.position, type: 'sbire', awakening: 1,
      level: { current: 1, max: 250 }, attacks: ['autoAttack'], stuff: {}, stats: {},
      baseStats: { HP: 30, intelligence: 20, strength: 10, agility: 10, speed: 1000, shift: 10 } };
    E.recomputeEntityStats(target);
    (await import('/js/items/resourceStocks.js')).addFadedLife(target, 1, 'consumable');
    E.entites.push(target); S.saveToLocalStorage('selectedArmyA', [target]);
    const created = (await import("/js/rendering/entities.js")).createEntiteInDOM(target);
    startHex.appendChild(created.element); startHex.classList.add('occupied');
    await created.spriteReady;
    (await import("/js/rendering/auras.js")).syncEntityAuras(target);
    if (!Object.values(target).some(value => value instanceof Node)) throw Error('Missing live aura in infinite regression fixture');
    const Board = await import('/js/board/controller.js');
    Board.rebuildBoardOccupancy();
    const pickup = Board.planEntityPlacements([{ entity: target, hex: document.querySelector(`.hex[data-position="${entry.position}"]`) }], { allowGroundConsumables: true });
    if (!pickup.valid || !Board.commitEntityPlacements(pickup, { persist: true })) throw Error('Infinite crystal pickup placement failed');
    return { itemId: item.itemId, entityId: target.id, amount: item.permanentStat.amount, infinite: entry.infinite };
  });
  await page.waitForFunction(() => !document.querySelector('[data-ground-summon]'));
  assert.ok(await page.locator('.ground-loot-remnant .is-dispersing').count());
  assert.ok(await page.locator('.ground-loot-remnant .is-dispersing').evaluateAll(nodes => nodes.every(node => {
    if (!node.classList.contains('glitter-loot-container')) return true;
    const style = getComputedStyle(node);
    return style.maskImage === 'none' && style.overflow === 'visible'
      && style.transitionProperty === 'opacity' && style.transitionDuration === '1s';
  })));
  report.checks.push('Pickup retains the shared unmasked chest dispersal and its one-second fade');
  assert.ok(await page.evaluate(async ({ itemId }) => !(await import('/js/items/itemManager.js')).getIngameItemById(itemId), consumedInfinite));
  assert.ok(consumedInfinite.infinite);
  assert.ok(await page.evaluate(async ({ entityId, amount }) => {
    const E = await import("/js/entities/runtime.js");
    const S = await import("/js/storage/gameStorage.js");
    return E.entites.find(entity => entity.id === entityId).baseStats.attackCooldownReduc === amount
      && S.loadFromLocalStorage('selectedArmyA', []).find(entity => entity.id === entityId).baseStats.attackCooldownReduc === amount;
  }, consumedInfinite));
  report.checks.push('Combat placement onto an infinite Cooldown crystal grants and saves its exact permanent bonus with an active life aura');
  report.checks.push('Infinite crystal remains consumable exactly once and disperses loot particles on pickup');
  await page.screenshot({ path: resolve(output, 'loot-dispersal.png') });
  await page.clock.fastForward(5000);
  assert.equal(await page.locator('.ground-loot-remnant').count(), 0);
  const retainedItems = await page.evaluate(async () => {
    const M = await import('/js/items/itemManager.js');
    const I = await import('/js/items/items.js');
    const inventory = I.createIngameItem('i0', 'reset-inventory-test');
    const satchel = I.createIngameItem('i0', 'reset-satchel-test');
    M.addItemToInventory(inventory.itemId); M.addItemToInventory(satchel.itemId);
    if (!M.moveBattleItem(satchel.itemId, 0)) throw Error('Cannot prepare retained satchel item');
    return { inventory: inventory.itemId, satchel: satchel.itemId };
  });
  for (const infinite of [false, true]) {
    const resetItems = await page.evaluate(async infinite => {
      const M = await import('/js/items/itemManager.js');
      const tab = key => document.querySelector(`#admin-entity-form [data-admin-tab-key="${key}"]`).click();
      const row = selector => document.querySelector(`#admin-entity-list ${selector}`).click();
      const toggle = document.getElementById('admin-ground-infinite');
      if (toggle.checked !== infinite) toggle.click();
      tab('items'); row('[data-item-serial="i0"]'); row('[data-summon-effect="jarret-summon"]');
      tab('misc');
      [...document.querySelectorAll('#admin-entity-list > div')].find(row => row.textContent.includes('Cristaux'))
        .dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, detail: 2 }));
      const save = M.getBattleInventoryState();
      if (save.battleGroundItems.length !== 2 || save.adminGroundSummons.length !== 1
        || [...save.battleGroundItems, ...save.adminGroundSummons].some(row => row.infinite !== infinite)) {
        throw Error('Missing reset fixtures');
      }
      return save.battleGroundItems.map(row => row.itemId);
    }, infinite);
    await page.evaluate(() => { document.getElementById('admin-event-launch-status').textContent = ''; });
    await page.getByRole('button', { name: 'Reset niveau', exact: true }).evaluate(button => button.click());
    await page.waitForFunction(() => document.getElementById('admin-entity-form').textContent.includes('Niveau admin réinitialisé.'));
    const resetState = await page.evaluate(async ({ resetItems, retainedItems, infinite }) => {
      const M = await import('/js/items/itemManager.js');
      M.restoreBattleGroundItems();
      const save = M.getBattleInventoryState();
      return {
        emptyGround: !save.battleGroundItems.length && !save.adminGroundSummons.length,
        removedItems: resetItems.every(id => !M.getIngameItemById(id)),
        emptyBoard: !document.querySelector('[data-ground-summon], .ground-loot-remnant, .consommable-summoned, .jarret-summon'),
        inventoryPreserved: save.Playerinventory.some(item => (item.itemId || item) === retainedItems.inventory)
          && save.battleSlots[0] === retainedItems.satchel
          && Object.values(retainedItems).every(id => M.getIngameItemById(id)),
        infinitePreserved: document.getElementById('admin-ground-infinite').checked === infinite,
        ownershipValid: M.validateBattleInventoryState().ok,
      };
    }, { resetItems, retainedItems, infinite });
    for (const [label, value] of Object.entries(resetState)) {
      assert.ok(value, `Admin reset (${infinite ? 'infinite' : 'timed'}): ${label}`);
      report.checks.push(`Admin reset (${infinite ? 'infinite' : 'timed'}): ${label}`);
    }
    await page.clock.fastForward(25000);
    assert.equal(await page.locator('[data-ground-summon], .ground-loot-remnant').count(), 0);
    report.checks.push(`Admin reset (${infinite ? 'infinite' : 'timed'}): no delayed timer residue`);
  }
  await page.reload({ waitUntil: 'load' });
  assert.ok(await page.evaluate(async retainedItems => {
    const M = await import('/js/items/itemManager.js');
    const save = M.getBattleInventoryState();
    return !save.battleGroundItems.length && !save.adminGroundSummons.length
      && Object.values(retainedItems).every(id => !M.getIngameItemById(id));
  }, retainedItems));
  report.checks.push('Actual reload discards the entire temporary admin session, including its test inventory');
  // Probe the rendered shared masks, not just their CSS declarations.
  const maskPage = await browser.newPage({ viewport: { width: 1200, height: 500 } });
  await maskPage.setContent(`<base href="http://127.0.0.1:${server.address().port}/">
    <link rel="stylesheet" href="css/base.css">
    <link rel="stylesheet" href="css/interface.css">
    <link rel="stylesheet" href="css/stats.css">
    <link rel="stylesheet" href="css/combat.css">
    <link rel="stylesheet" href="css/animation.css">
    <link rel="stylesheet" href="css/monstre.css">
    <link rel="stylesheet" href="css/effects.css">
    <link rel="stylesheet" href="css/monstre-hitbox.css">
    <style>body { margin:0; background:#000; }
      [data-probe] { position:fixed; top:200px; width:84px; height:100px; margin:0; transform:none; }
      [data-probe] > .glitter-loot-container { background:#fff; }
    </style>
    <div data-probe="item" class="battle-ground-item-active" style="left:60px">
      <div class="glitter-loot-container ground-item-glitter"></div></div>
    <div data-probe="crystal" class="battle-ground-item-active" style="left:240px">
      <div class="umbra-crystal"></div><div class="glitter-loot-container ground-item-glitter"></div></div>
    <div data-probe="chest" class="chest-parent" style="left:520px"><div class="glitter-loot-container"></div></div>
    <div data-probe="corpse" class="corpse-lootable" style="left:860px"><div class="glitter-loot-container"></div></div>`);
  const maskImage = await maskPage.screenshot({ path: resolve(output, 'loot-mask-probes.png') });
  const maskPixels = await maskPage.evaluate(async base64 => {
    const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
    const pixel = (x, y) => ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data[0];
    return [...document.querySelectorAll('[data-probe]')].map(host => {
      const node = host.querySelector('.glitter-loot-container');
      const rect = node.getBoundingClientRect(), style = getComputedStyle(node);
      const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
      const fadeX = parseFloat(style.getPropertyValue('--glitter-fade-x')) || 20;
      const fadeY = parseFloat(style.getPropertyValue('--glitter-fade-y')) || 20;
      return { type: host.dataset.probe, fadeX, fadeY, center: pixel(x, y), edges: {
        left: [pixel(rect.left + 1, y), pixel(rect.left + fadeX / 2, y)],
        right: [pixel(rect.right - 2, y), pixel(rect.right - fadeX / 2, y)],
        top: [pixel(x, rect.top + 1), pixel(x, rect.top + fadeY / 2)],
        bottom: [pixel(x, rect.bottom - 2), pixel(x, rect.bottom - fadeY / 2)],
      } };
    });
  }, maskImage.toString('base64'));
  for (const { type, fadeX, fadeY, center, edges } of maskPixels) {
    assert.ok(center >= 250, `${type}: center remains fully visible`);
    if (['chest', 'corpse'].includes(type)) assert.ok(fadeX === 20 && fadeY === 20, `${type}: original mask unchanged`);
    for (const [edge, [outer, middle]] of Object.entries(edges)) {
      assert.ok(outer < 25 && middle > outer + 60 && middle < center - 40, `${type}/${edge}: continuous rendered edge fade`);
      report.checks.push(`Rendered loot mask: ${type}/${edge} fades smoothly without dimming the center`);
    }
  }
  report.maskPixels = maskPixels;
  await maskPage.close();
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`PASS ${report.checks.length} checks; ${report.items} items; ${report.crystals} crystal stats`);
} finally {
  await browser.close();
  await new Promise(done => server.close(done));
}
