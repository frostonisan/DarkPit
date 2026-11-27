import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = resolve('docs');
const output = resolve('outputs/battle-inventory');
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.gif': 'image/gif' };
const server = createServer(async (req, res) => {
  let path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  const rel = relative(root, path);
  if (rel === '..' || rel.startsWith('..' + sep)) { res.writeHead(403).end(); return; }
  if (path === root) path = resolve(root, 'index.html');
  try { res.setHeader('Content-Type', mime[extname(path)] || 'application/octet-stream'); res.end(await readFile(path)); }
  catch { res.writeHead(404).end(); }
});
await mkdir(output, { recursive: true });
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1536, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'load' });
  const reports = await page.evaluate(async () => {
    const items = await import('/js/items/itemManager.js');
    const store = await import("/js/storage/gameStorage.js");
    const init = await import("/js/ui/application.js"), _init = await import("/js/ui/inventory.js");
    const state = await import("/js/app/state.js");
    const { entites, entitesNestUp } = await import("/js/entities/runtime.js");
    const { ItemDetails } = await import('/js/data/itemList.js');
    const { createUniversalEssenceHelperHTML, openAttackEssenceSocketPopup, commitAttackEssenceEquipTransaction } = await import("/js/items/essences.js");
    const { createLifeBars, CreateATBEntity } = await import("/js/rendering/entities.js");
    const { placeGroundItem } = await import("/js/combat/summons.js");
    const { getEntityCombatDetails } = await import("/js/storage/entityStorage.js");
    const popup = await import("/js/ui/display.js");
    const reports = [];
    const check = (test, label) => { if (!test) throw new Error(label); reports.push(label); };
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const read = key => JSON.parse(localStorage.getItem(key));
    const ownership = id => {
      const save = items.getBattleInventoryState();
      return save.Playerinventory.filter(entry => (entry.itemId || entry) === id).length + save.battleSlots.filter(entry => entry === id).length + save.battleGroundItems.filter(entry => entry.itemId === id).length;
    };
    window.levelRunning = 'worldmap';
    entites.length = 0;
    store.saveToLocalStorage('PlayerSave', { Playerinventory: [], items: [], equippedItems: [], battleSlots: [], battleGroundItems: [] });
    store.saveToLocalStorage('IngameItems', []);
    store.saveToLocalStorage('IngameItemsData', { items: [], Playerinventory: [] });
    store.savePlayerInfo({ battleSlotCount: 4 });
    const actor = structuredClone(entitesNestUp.find(entity => entity.name === 'Grouille-Doigt TEST 3A polyvalent'));
    Object.assign(actor, { id: 974101, side: 'A', statut: ['alive'], isDEAD: false });
    actor.stats.HP = { current: 20, max: 100 };
    actor.stats.armor = { current: 0, max: 0 };
    const enemy = structuredClone(actor);
    Object.assign(enemy, { id: 974102, side: 'B', name: 'Cible ennemie' });
    entites.push(actor, enemy);
    store.saveToLocalStorage('selectedArmyA', [actor]);
    init.createGameContainer(); init.GameUi();
    document.querySelectorAll('.entitylootContainer, #black-overlay').forEach(node => node.remove());
    check(document.querySelectorAll('.menu-player-icons img').length === 5, 'Safe map creates the five normal menu entries');
    _init.createInventory();
    check(document.querySelectorAll('.inventory-interface [data-battle-slot]').length === 4, 'Inventory contains four stable hexagonal satchel slots');

    const acquire = serial => items.acquireItem(ItemDetails.find(item => item.serial === serial), 'satchel-test');
    const potions = Array.from({ length: 9 }, () => acquire('i0'));
    const anima = acquire('i45');
    const stuff = acquire('i2');
    check(items.moveBattleItem(potions[0].itemId, 0) && ownership(potions[0].itemId) === 1, 'Storage to satchel retains one existing item ID');
    check(items.moveBattleItem(potions[1].itemId, 0) && ownership(potions[0].itemId) === 1 && items.getBattleInventoryState().Playerinventory.some(entry => entry.itemId === potions[0].itemId), 'Occupied slot swaps its old object back to storage');
    items.moveBattleItem(potions[0].itemId, 1);
    items.moveBattleItem(potions[1].itemId, 1);
    check(items.getBattleInventoryState().battleSlots[0] === potions[0].itemId && items.getBattleInventoryState().battleSlots[1] === potions[1].itemId, 'Satchel-to-satchel movement swaps references');
    const inventory = document.querySelector('.inventory-interface');
    inventory.querySelector('[data-inventory-tab="objects"]').click();
    check(inventory.querySelector('.inventory-filter-toggle')?.textContent === 'Équipé', 'Objects expose the Equipped filter');
    check(!inventory.querySelector('.inventory-item--used'), 'Satchel objects are hidden from the list by default');
    const beforeFilter = JSON.stringify(items.getBattleInventoryState());
    inventory.querySelector('[data-inventory-show-used]').click();
    for (const potion of potions.slice(0, 2)) {
      const card = inventory.querySelector(`.inventory-content [data-item-id="${potion.itemId}"]`);
      check(card?.classList.contains('inventory-item--used') && Number(getComputedStyle(card).opacity) < 1,
        'Equipped satchel object uses the existing translucent item style');
      check(card.querySelector('.inventory-used-owner').textContent.includes('Sacoche'), 'Satchel object displays its actual location');
      check(card.querySelector('img').draggable && !card.dataset.equippedId, 'Satchel drag keeps the consumable ID, not an equipment ID');
    }
    inventory.querySelector('[data-inventory-tab="equipment"]').click();
    inventory.querySelector('[data-inventory-tab="objects"]').click();
    check(inventory.querySelector('[data-inventory-show-used]').checked, 'Object filter choice survives tab navigation');
    check(ownership(potions[0].itemId) === 1 && ownership(potions[1].itemId) === 1
      && JSON.stringify(items.getBattleInventoryState()) === beforeFilter, 'Showing equipped objects never duplicates or moves them');
    inventory.querySelector('[data-inventory-show-used]').click();
    check(!inventory.querySelector('.inventory-item--used'), 'Disabling Equipped hides satchel copies again');
    inventory.querySelector('[data-inventory-tab="all"]').click();
    check(!items.moveBattleItem(anima.itemId, 2) && !items.moveBattleItem(stuff.itemId, 2), 'Anima and equipment cannot enter the satchel');
    check(document.querySelector('.inventory-transfer-confirm-text').textContent.includes('Impossible de transporter'), 'Rejected item displays the shared warning popup');
    popup.dismissGamePopups();
    items.createItemDescription(anima, anima.itemId, document.querySelector('.inventory-interface'));
    check(document.querySelector('.item-combat-restriction')?.textContent === 'Non utilisable en combat', 'Anima helper declares the combat restriction');
    check(createUniversalEssenceHelperHTML('red').includes('Non utilisable en combat'), 'Universal essence helper declares the combat restriction');
    items.clearItemDescriptions();
    items.moveBattleItem(potions[2].itemId, 3);
    items.setBattleSlotCount(2);
    check(items.getBattleInventoryState().battleSlots.length === 2 && ownership(potions[2].itemId) === 1, 'Capacity reduction returns overflow items without deleting them');
    items.setBattleSlotCount(4);
    store.saveItemsData();
    store.loadItemsData();
    check(items.getBattleInventoryState().battleSlots[0] === potions[0].itemId && store.loadPlayerInfo().battleSlotCount === 4, 'Satchel and capacity survive the normal save/load pipeline');
    const equippedOnly = acquire('i34');
    const equippedSave = items.getBattleInventoryState();
    equippedSave.Playerinventory = equippedSave.Playerinventory.filter(entry => entry.itemId !== equippedOnly.itemId);
    equippedSave.equippedItems = [...(equippedSave.equippedItems || []), {
      ...equippedOnly,
      equippedId: `e${equippedOnly.itemId}`,
      equippedTo: actor.id,
      slot: `slot1-${actor.id}`,
    }];
    store.saveToLocalStorage('PlayerSave', equippedSave);
    store.saveToLocalStorage('equippedItems', equippedSave.equippedItems);
    store.saveToLocalStorage('IngameItems', read('IngameItems').filter(item => item.itemId !== equippedOnly.itemId));
    check(items.validateBattleInventoryState(items.getBattleInventoryState()).ok, 'Equipped item remains valid outside the inventory registry');
    check(items.setBattleSlotCount(5, { admin: true }) && store.loadPlayerInfo().battleSlotCount === 5, 'Admin can increase satchel capacity while equipment is worn');
    check(items.getBattleInventoryState().equippedItems.some(item => item.itemId === equippedOnly.itemId), 'Satchel capacity change preserves equipped items');
    items.setBattleSlotCount(4, { admin: true });
    const beforeMapStats = getEntityCombatDetails(actor);
    const usedMap = await items.useConsumableItem(potions[0].itemId, actor);
    check(usedMap.ok && actor.stats.HP.current === 25 && ownership(potions[0].itemId) === 0, 'Satchel item can be consumed directly on the map');
    check(!read('IngameItems').some(item => item.itemId === potions[0].itemId), 'Consumed object is removed from the item registry');
    check(getEntityCombatDetails(actor).consumablesUsed === beforeMapStats.consumablesUsed + 1
      && getEntityCombatDetails(actor).consumablesPouch === beforeMapStats.consumablesPouch + 1
      && getEntityCombatDetails(actor).consumablesCombatPouch === beforeMapStats.consumablesCombatPouch
      && getEntityCombatDetails(actor).consumablesSupport === beforeMapStats.consumablesSupport + 1
      && getEntityCombatDetails(actor).consumableHealingReceived === beforeMapStats.consumableHealingReceived + 5,
      'A satchel potion records one supportive use and only the restored HP');
    const concurrentItem = acquire('i0');
    items.moveBattleItem(concurrentItem.itemId, 0);
    const beforeConcurrent = actor.stats.HP.current;
    const beforeConcurrentStats = getEntityCombatDetails(actor);
    const concurrent = await Promise.all([items.useConsumableItem(concurrentItem.itemId, actor), items.useConsumableItem(concurrentItem.itemId, actor)]);
    check(concurrent.filter(result => result.ok).length === 1 && actor.stats.HP.current === beforeConcurrent + 5, 'Concurrent consumption cannot apply the same item twice');
    check(getEntityCombatDetails(actor).consumablesUsed === beforeConcurrentStats.consumablesUsed + 1,
      'Concurrent consumption records only one career use');
    actor.stats.HP.current = 25;

    const confirmation = popup.showGamePopupMessage({ mode: 'manual', key: 'test-cleanup', message: 'Pending confirmation' });
    state.setStageInterfaceLoading(true);
    check(await confirmation === false && !document.querySelector('.inventory-interface'), 'Level loading closes menus and resolves pending confirmations as cancelled');
    window.levelRunning = 'scripted';
    store.setCurrentLevel('satchel-test-stage');
    window.currentStageId = 'satchel-test-stage';
    state.setStageInterfaceLoading(false);
    check(!state.getStageAccess().menusAllowed && !state.getStageAccess().battleActive && !document.querySelector('.menu-player-icons') && !document.querySelector('.battle-satchel--combat'), 'Hostile standby locks normal menus without exposing the combat satchel');
    _init.createInventory();
    check(!document.querySelector('.inventory-interface') && document.querySelector('.inventory-transfer-confirm-text').textContent.includes('menace'), 'Direct inventory opening is denied under threat');
    popup.dismissGamePopups();
    check(openAttackEssenceSocketPopup({ anchor: document.body, entity: actor }) === null &&
      !commitAttackEssenceEquipTransaction({ entity: actor }).ok,
      'Essence popup and transaction entry points both reject changes under threat');
    popup.dismissGamePopups();
    const denied = await items.useConsumableItem(potions[3].itemId, actor);
    check(!denied.ok && ownership(potions[3].itemId) === 1, 'Ordinary inventory consumption cannot bypass the threatened-stage restriction');
    popup.dismissGamePopups();
    check(!items.moveBattleItem(potions[3].itemId, 0), 'Loadout changes are blocked during hostile standby');
    popup.dismissGamePopups();
    const standbyEnemyUse = await items.useConsumableItem(potions[1].itemId, enemy);
    check(!standbyEnemyUse.ok && enemy.stats.HP.current === 20 && ownership(potions[1].itemId) === 1, 'A satchel consumable cannot target an idle enemy before combat starts');
    popup.dismissGamePopups();
    state.startGame();
    check(state.getStageAccess().battleActive && document.querySelectorAll('.battle-satchel--combat [data-battle-slot]').length === 4, 'Starting combat reveals the satchel on the right');
    check(document.querySelector('.Game-UI > .battle-satchel--combat') && !document.querySelector('body > .battle-satchel--combat'), 'Combat satchel belongs directly to Game-UI, never to body');
    const usedEnemy = await items.useConsumableItem(potions[1].itemId, enemy);
    check(usedEnemy.ok && enemy.stats.HP.current === 25, 'A satchel consumable can target an enemy after combat starts');
    const inventoryBeforeAnima = JSON.stringify(items.getBattleInventoryState());
    check(!(await items.useConsumableItem(anima.itemId, actor)).ok && JSON.stringify(items.getBattleInventoryState()) === inventoryBeforeAnima, 'Direct Anima use is also blocked under threat, without losing the item');
    popup.dismissGamePopups();

    // Configure loadout in a safe context, then exercise the board's real drop handler.
    state.StopGame();
    window.levelRunning = 'worldmap'; state.refreshStageAccess();
    for (let i = 0; i < 4; i++) items.moveBattleItem(potions[i + 2].itemId, i);
    const movedThroughUI = acquire('i0');
    _init.createInventory();
    const transfer = new DataTransfer();
    transfer.setData('text/plain', movedThroughUI.itemId);
    document.querySelector('.inventory-interface [data-battle-slot="3"]').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    check(items.getBattleInventoryState().battleSlots[3] === movedThroughUI.itemId, 'Inventory drag-and-drop equips a satchel object through the shared movement action');
    document.querySelector('.inventory-interface .inventory-content').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    check(items.getBattleInventoryState().battleSlots[3] === null && ownership(movedThroughUI.itemId) === 1, 'Dragging a satchel object back to storage releases its slot');
    items.moveBattleItem(potions[5].itemId, 3);
    const essenceTransfer = new DataTransfer();
    essenceTransfer.setData('application/x-game-essence', 'uess-test-1');
    essenceTransfer.setData('text/plain', 'uess-test-1');
    document.querySelector('.inventory-interface [data-battle-slot="3"]').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: essenceTransfer }));
    check(document.querySelector('.inventory-transfer-confirm-text')?.textContent.includes('Impossible de transporter'), 'An essence drop is explicitly rejected with the shared popup');
    popup.dismissGamePopups();
    const board = document.createElement('div');
    board.id = 'satchel-test-board';
    board.className = 'hex-grid';
    board.style.cssText = 'position:fixed;top:150px;left:100px;display:flex;gap:40px;';
    const hexes = ['hex_1', 'hex_2', 'hex_3'].map((position, index) => {
      const hex = document.createElement('div');
      hex.className = `hex ${index < 2 ? 'SideA' : 'SideB'}`;
      hex.dataset.position = position;
      hex.style.cssText = 'position:relative;width:150px;height:130px;transform:none;';
      board.appendChild(hex);
      return hex;
    });
    document.getElementById('game-container').appendChild(board);
    window.levelRunning = 'scripted'; state.refreshStageAccess(); state.startGame();
    check(items.dropBattleItemOnHex(potions[2].itemId, hexes[0]), 'Satchel object is placed on an empty hex');
    const expiry = items.getBattleInventoryState().battleGroundItems[0].expiresAt;
    check(ownership(potions[2].itemId) === 1 && !items.getBattleInventoryState().battleSlots.includes(potions[2].itemId), 'Ground placement moves ownership out of the satchel');
    check(items.dropBattleItemOnHex(potions[3].itemId, hexes[0]), 'A second object can land on the occupied consumable hex');
    const displaced = items.getBattleInventoryState().battleGroundItems.find(entry => entry.itemId === potions[2].itemId);
    check(displaced.position === 'hex_2' && displaced.expiresAt === expiry, 'Previous ground object moves to the nearest allied free hex without renewing expiry');
    items.dropBattleItemOnHex(potions[4].itemId, hexes[0]);
    check(items.getBattleInventoryState().battleGroundItems.find(entry => entry.itemId === potions[3].itemId).position === 'hex_3', 'Enemy territory is used when no allied ground destination remains');
    items.dropBattleItemOnHex(potions[5].itemId, hexes[0]);
    check(ownership(potions[4].itemId) === 0, 'A displaced object is destroyed when no free destination exists');
    const actorBox = document.createElement('div');
    actorBox.className = 'entite-box'; actorBox.id = `Box_Entite_${actor.id}`;
    actorBox.append(createLifeBars(actor), CreateATBEntity(actor));
    const effects = document.createElement('div'); effects.id = `effectsContainer_${actor.id}`; actorBox.append(effects);
    actor.position = 'hex_1';
    hexes[0].appendChild(actorBox);
    (await import('/js/board/controller.js')).rebuildBoardOccupancy(board);
    const beforeGroundStats = getEntityCombatDetails(actor);
    hexes[0].dispatchEvent(new Event('hexOccupied'));
    hexes[0].dispatchEvent(new Event('hexOccupied'));
    await wait(50);
    check(actor.stats.HP.current === 30 && ownership(potions[5].itemId) === 0, 'Entering a hex consumes the ground object exactly once despite repeated occupancy events');
    check(getEntityCombatDetails(actor).consumablesUsed === beforeGroundStats.consumablesUsed + 1
      && getEntityCombatDetails(actor).consumablesGround === beforeGroundStats.consumablesGround + 1
      && getEntityCombatDetails(actor).consumablesCombatGround === beforeGroundStats.consumablesCombatGround + 1
      && getEntityCombatDetails(actor).consumableHealingReceived === beforeGroundStats.consumableHealingReceived + 5,
      'Repeated ground events credit one ground consumption and one effective heal');
    items.clearBattleGroundItems();
    check(items.getBattleInventoryState().battleGroundItems.length === 0 && !document.querySelector('.battle-ground-item'), 'Leaving a level removes remaining ground objects and their DOM');

    const sprite = document.createElement('div');
    sprite.dataset.dropable = 'true';
    sprite.dataset.entityId = actor.id;
    const spriteImage = document.createElement('img');
    sprite.appendChild(spriteImage);
    actorBox.appendChild(sprite);
    window.levelRunning = 'worldmap'; state.refreshStageAccess();
    const spritePotion = acquire('i0');
    const spriteEquipment = acquire('i55');
    items.moveBattleItem(spritePotion.itemId, 0);
    window.levelRunning = 'scripted'; state.refreshStageAccess();
    const spriteDrop = id => {
      const dataTransfer = new DataTransfer();
      dataTransfer.setData('text/plain', id);
      spriteImage.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
    };
    spriteDrop(spriteEquipment.itemId);
    await wait(20);
    check(ownership(spriteEquipment.itemId) === 1 && !items.getBattleInventoryState().equippedItems.some(item => item.itemId === spriteEquipment.itemId), 'Marked battle sprite cannot bypass equipment restrictions');
    popup.dismissGamePopups();
    spriteDrop(spritePotion.itemId);
    spriteDrop(spritePotion.itemId);
    await wait(50);
    check(actor.stats.HP.current === 35 && ownership(spritePotion.itemId) === 0, 'Nested marked sprite consumes a satchel potion exactly once during combat');
    check(!items.getBattleInventoryState().battleGroundItems.some(item => item.itemId === spritePotion.itemId), 'Sprite drop is not also handled as a ground drop');
    actor.stats.HP.current = 30;

    window.levelRunning = 'worldmap'; state.refreshStageAccess();
    items.moveBattleItem(potions[6].itemId, 0);
    window.levelRunning = 'scripted'; state.refreshStageAccess();
    actor.isDEAD = true; actor.statut = ['dead']; actor.stats.HP.current = 0;
    items.dropBattleItemOnHex(potions[6].itemId, hexes[0]);
    await wait(30);
    check(ownership(potions[6].itemId) === 1 && document.querySelector('.battle-ground-item'), 'Incompatible corpse does not consume a healing object');
    items.clearBattleGroundItems();
    actor.isDEAD = false; actor.statut = ['alive']; actor.stats.HP.current = 30;
    const expiryItem = potions[7];
    let expired = false;
    placeGroundItem(hexes[1], expiryItem, { expiresAt: Date.now() + 60, consume: () => ({ ok: false }), settled: status => { expired = status === 'expired'; }, moved: () => {} });
    await wait(110);
    check(expired && !hexes[1].querySelector('.battle-ground-item'), 'Ground expiry removes the object at its configured deadline');

    state.StopGame();
    enemy.isDEAD = true; enemy.statut = ['dead']; state.refreshStageAccess();
    check(state.getStageAccess().menusAllowed && document.querySelector('.menu-player-icons') && document.querySelector('.battle-satchel--combat'), 'Menus return while the revealed combat satchel remains available after victory');
    _init.createInventory();
    enemy.isDEAD = false; enemy.statut = ['alive']; state.refreshStageAccess();
    check(!document.querySelector('.inventory-interface') && document.querySelector('.battle-satchel--combat'), 'A newly appearing threat closes inventory without removing the already revealed combat satchel');
    store.setAdminMode(true);
    window.levelRunning = 'admin'; state.refreshStageAccess();
    check(state.getStageAccess().menusAllowed && document.querySelector('.menu-player-icons'), 'Admin keeps ordinary menu access under threat');

    const feather = acquire('i5');
    const beforeFeatherStats = getEntityCombatDetails(actor);
    items.moveBattleItem(feather.itemId, 0);
    actor.isDEAD = true; actor.statut = ['dead']; actor.stats.HP.current = 0; actor.corpseDestroyed = true;
    check(!(await items.useConsumableItem(feather.itemId, actor)).ok && ownership(feather.itemId) === 1, 'A destroyed corpse rejects resurrection without consuming the feather');
    actor.corpseDestroyed = false;
    actor.isDEAD = false;
    check(!(await items.useConsumableItem(feather.itemId, actor)).ok && ownership(feather.itemId) === 1, 'An unresolved death cannot spend a resurrection item before the shared engine accepts the corpse');
    check(getEntityCombatDetails(actor).consumablesUsed === beforeFeatherStats.consumablesUsed,
      'Rejected resurrection attempts do not increase consumable counters');
    actor.isDEAD = true;
    actorBox.remove();
    (await import('/js/board/controller.js')).rebuildBoardOccupancy(board);
    check((await items.useConsumableItem(feather.itemId, actor)).ok && !actor.isDEAD && actor.stats.HP.current === 5 && ownership(feather.itemId) === 0, 'Feather uses the common resurrection behavior and restores its specified HP');
    check(getEntityCombatDetails(actor).consumableHealingReceived === beforeFeatherStats.consumableHealingReceived + 5
      && getEntityCombatDetails(actor).healingReceived === beforeFeatherStats.healingReceived + 5,
      'Resurrection healing is attributed to the consumable without duplicating the received healing total');
    actor.stats.HP.current = 100;
    const beforeDamageStats = getEntityCombatDetails(actor);
    const damageItem = acquire('i4');
    items.moveBattleItem(damageItem.itemId, 0);
    check((await items.useConsumableItem(damageItem.itemId, actor)).ok && actor.stats.HP.current < 100, 'Damaging consumable applies through the ordinary item effects');
    check(getEntityCombatDetails(actor).consumableDamageReceived === beforeDamageStats.consumableDamageReceived + 100 - actor.stats.HP.current
      && getEntityCombatDetails(actor).consumablesHostile === beforeDamageStats.consumablesHostile + 1,
      'A hostile consumable records its actual HP loss and one hostile use');
    const invalid = acquire('i1');
    const beforeInvalid = actor.stats.HP.current;
    check(!(await items.useConsumableItem(invalid.itemId, actor)).ok && ownership(invalid.itemId) === 1 && actor.stats.HP.current === beforeInvalid, 'An undefined catalogue effect is rejected before spending the item or applying partial effects');

    store.setAdminMode(false);
    window.levelRunning = 'worldmap'; state.refreshStageAccess();
    check(!items.moveBattleItem(invalid.itemId, 0) && !items.moveBattleItem(acquire('i3').itemId, 0), 'Unimplemented poison and antidote effects are rejected when configuring the satchel');
    popup.dismissGamePopups();
    const robustPotion = acquire('i0');
    items.moveBattleItem(robustPotion.itemId, 0);
    _init.createInventory();
    const stableBag = document.querySelector('.battle-satchel--inventory');
    const stableSlot = stableBag.querySelector('[data-battle-slot="0"]');
    const stableImage = stableSlot.querySelector('img');
    store.savePlayerInfo(store.loadPlayerInfo(), { updatedKey: 'quest' });
    acquire('i0');
    check(stableBag.isConnected && stableSlot.isConnected && stableImage === stableSlot.querySelector('img'), 'Quest and unrelated inventory events preserve satchel, slots and draggable nodes');
    const authoritative = JSON.stringify(items.getBattleInventoryState());
    const obsolete = read('IngameItemsData');
    obsolete.battleSlots = [potions[0].itemId, null, null, null];
    store.saveToLocalStorage('IngameItemsData', obsolete);
    store.loadItemsData();
    check(JSON.stringify(items.getBattleInventoryState()) === authoritative, 'Stale export data cannot overwrite authoritative locations or resurrect a spent object');

    const clean = read('PlayerSave');
    const duplicated = structuredClone(clean);
    duplicated.Playerinventory.push(robustPotion);
    store.saveToLocalStorage('PlayerSave', duplicated);
    check(!items.validateBattleInventoryState().ok && !items.moveBattleItem(robustPotion.itemId, 1) && JSON.stringify(read('PlayerSave')) === JSON.stringify(duplicated), 'Duplicate ownership blocks the move without rewriting the conflicting data');
    store.saveToLocalStorage('PlayerSave', clean);
    const missing = structuredClone(clean);
    missing.battleSlots[3] = 'missing-registry-id';
    store.saveToLocalStorage('PlayerSave', missing);
    check(!items.validateBattleInventoryState().ok && !items.moveBattleItem(robustPotion.itemId, 1), 'Unknown registry IDs block movement before mutation');
    store.saveToLocalStorage('PlayerSave', clean);
    popup.dismissGamePopups();

    const setItem = Storage.prototype.setItem;
    const beforeFailureHP = actor.stats.HP.current;
    Storage.prototype.setItem = function(key, value) {
      if (key === 'PlayerSave') throw new DOMException('Injected write failure', 'QuotaExceededError');
      return setItem.call(this, key, value);
    };
    let failedUse;
    try { failedUse = await items.useConsumableItem(robustPotion.itemId, actor); }
    finally { Storage.prototype.setItem = setItem; }
    check(!failedUse.ok && ownership(robustPotion.itemId) === 1 && actor.stats.HP.current === beforeFailureHP, 'Failure of the authoritative write preserves both the item and target HP');
    popup.dismissGamePopups();
    actor.stats.HP.current = 20;
    const brokenFx = document.createElement('div');
    brokenFx.id = `effectsContainer_${actor.id}`;
    document.body.append(brokenFx);
    brokenFx.appendChild = () => { throw Error('Injected rendering failure'); };
    const visualFailure = await items.useConsumableItem(robustPotion.itemId, actor);
    check(visualFailure.ok && ownership(robustPotion.itemId) === 0 && actor.stats.HP.current === 25, 'A failed healing visual cannot preserve a consumed potion or undo its acquired HP');
    brokenFx.remove();
    const careerFailureItem = acquire('i0');
    Storage.prototype.setItem = function(key, value) {
      if (key === 'selectedArmyA') throw new DOMException('Injected career write failure', 'QuotaExceededError');
      return setItem.call(this, key, value);
    };
    let careerFailure;
    try { careerFailure = await items.useConsumableItem(careerFailureItem.itemId, actor, { silent: true }); }
    finally { Storage.prototype.setItem = setItem; }
    const afterCareerFailure = acquire('i0');
    check(careerFailure.ok && ownership(careerFailureItem.itemId) === 0
      && (await items.useConsumableItem(afterCareerFailure.itemId, actor)).ok,
      'A career-storage failure cannot resurrect a spent item or leave the target locked');

    state.setStageInterfaceLoading(true);
    window.levelRunning = 'scripted';
    state.setStageInterfaceLoading(false, { failed: true });
    check(!state.getStageAccess().loading && state.getStageAccess().unavailable && !state.getStageAccess().menusAllowed && !document.querySelector('.battle-satchel--combat'), 'A failed level stops loading but keeps the incomplete stage inaccessible');
    window.levelRunning = 'worldmap'; state.refreshStageAccess();
    check(!state.getStageAccess().unavailable && !document.querySelector('.battle-satchel--combat'), 'Returning to the map after a failed load releases item access and leaves no combat satchel');
    state.setStageInterfaceLoading(false);

    // The short deadline proves that retrieval cancels expiry, not merely hides the sprite.
    const recovered = acquire('i0');
    const swapped = acquire('i0');
    items.moveBattleItem(recovered.itemId, 0);
    items.moveBattleItem(swapped.itemId, 1);
    window.levelRunning = 'scripted'; state.resetBattleResolution(); state.refreshStageAccess(); state.startGame();
    let saved = items.getBattleInventoryState();
    saved.battleSlots[0] = null;
    saved.battleGroundItems.push({ itemId: recovered.itemId, position: 'hex_2', stageId: store.getCurrentLevel(), expiresAt: Date.now() + 180 });
    store.saveToLocalStorage('PlayerSave', saved);
    items.restoreBattleGroundItems();
    const groundSprite = hexes[1].querySelector('.battle-ground-item');
    check(groundSprite?.draggable && hexes[1].querySelector('.ground-item-lifetime'), 'A ground object is draggable and exposes a lightweight expiration bar');
    const recoveryTransfer = new DataTransfer();
    groundSprite.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: recoveryTransfer }));
    document.querySelector('.battle-satchel--combat [data-battle-slot="0"]').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: recoveryTransfer }));
    await wait(220);
    check(items.getBattleInventoryState().battleSlots[0] === recovered.itemId && ownership(recovered.itemId) === 1 && !hexes[1].querySelector('.battle-ground-item'), 'Ground-to-satchel drag recovers one ID and cancels its original expiration');
    items.dropBattleItemOnHex(recovered.itemId, hexes[1]);
    const swapTransfer = new DataTransfer();
    swapTransfer.setData('application/x-game-item', recovered.itemId);
    document.querySelector('.battle-satchel--combat [data-battle-slot="1"]').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: swapTransfer }));
    saved = items.getBattleInventoryState();
    const replacement = saved.battleGroundItems.find(entry => entry.itemId === swapped.itemId);
    check(saved.battleSlots[1] === recovered.itemId && replacement?.position === 'hex_2' && replacement.expiresAt > Date.now() + 19000 && ownership(recovered.itemId) === 1 && ownership(swapped.itemId) === 1, 'Occupied satchel slot swaps its object onto the source hex with a fresh ground lifetime');
    check(items.recoverBattleItem(swapped.itemId, 0), 'The swapped ground object is itself recoverable');

    hexes[0].appendChild(actorBox);
    (await import('/js/board/controller.js')).rebuildBoardOccupancy(board);
    let attempts = 0;
    placeGroundItem(hexes[0], { ...recovered, itemId: 'busy-probe' }, {
      expiresAt: Date.now() + 20000, consume: async () => (++attempts === 1 ? { ok: false, busy: true } : { ok: true }), settled: () => {}, moved: () => {},
    });
    await wait(10);
    window.dispatchEvent(new CustomEvent('consumableTargetReleased', { detail: { entityId: actor.id } }));
    await wait(10);
    check(attempts === 2 && !hexes[0].querySelector('.summon'), 'Temporary busy rejection retries after target release and never becomes a permanent incompatibility');
    const cursorData = new DataTransfer();
    const dragEvent = new DragEvent('dragover', { dataTransfer: cursorData });
    items.updateConsumableDropVisual(actorBox, recovered.itemId, actor, dragEvent);
    check(actorBox.classList.contains('consumable-drop-valid') && items.previewConsumableItemUse(recovered.itemId, actor).ok, 'Valid target indicator and real consumption share the same validation');
    actor.isDEAD = true; actor.statut = ['dead']; actor.stats.HP.current = 0;
    items.updateConsumableDropVisual(actorBox, recovered.itemId, actor, dragEvent);
    check(actorBox.classList.contains('consumable-drop-invalid') && !items.previewConsumableItemUse(recovered.itemId, actor).ok, 'A corpse is marked invalid for healing before the drop');
    items.clearConsumableDropVisuals();
    actor.isDEAD = false; actor.statut = ['alive']; actor.stats.HP.current = 30;
    items.dropBattleItemOnHex(recovered.itemId, hexes[1]);
    const directConcurrentUse = items.useConsumableItem(swapped.itemId, actor);
    hexes[1].appendChild(actorBox);
    actor.position = hexes[1].dataset.position;
    (await import('/js/board/controller.js')).rebuildBoardOccupancy(board);
    hexes[1].dispatchEvent(new Event('hexOccupied'));
    await directConcurrentUse;
    await wait(30);
    check(actor.stats.HP.current === 40 && ownership(recovered.itemId) === 0 && ownership(swapped.itemId) === 0, 'Real direct-use and ground-use contention consumes each item once after the target lock is released');
    actorBox.remove();
    (await import('/js/board/controller.js')).rebuildBoardOccupancy(board);
    state.setGameOver(true); state.refreshStageAccess();
    check(document.querySelector('.battle-satchel--combat'), 'Finished battle keeps its revealed satchel even if ordinary menus return');
    state.StopGame(); state.resetBattleResolution(); state.refreshStageAccess();
    check(document.querySelector('.battle-satchel--combat'), 'Stopping battle logic in the same stage does not hide its revealed satchel');

    window.levelRunning = 'worldmap'; state.refreshStageAccess();
    for (let index = 0; index < 4; index++) items.moveBattleItem(acquire(index === 0 ? 'i8' : index === 3 ? 'i0' : 'i4').itemId, index);
    _init.createInventory();
    popup.dismissGamePopups();
    window.__satchelTest = { actor, enemy };
    return reports;
  });
  await page.waitForFunction(() => [...document.querySelectorAll('.battle-satchel img')].every(img => img.complete && img.naturalWidth > 0));
  await page.evaluate(() => document.querySelector('#black-overlay')?.remove());
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(output, 'inventory-desktop.png') });
  const expandedFits = await page.evaluate(async () => {
    const items = await import('/js/items/itemManager.js');
    items.setBattleSlotCount(24, { admin: true });
    const list = document.querySelector('.inventory-interface .battle-satchel-slots');
    const bounds = list.getBoundingClientRect();
    const firstVisible = list.firstElementChild.getBoundingClientRect().left >= bounds.left;
    list.scrollLeft = list.scrollWidth;
    const lastVisible = list.lastElementChild.getBoundingClientRect().right <= bounds.right + 1;
    items.setBattleSlotCount(4, { admin: true });
    return firstVisible && lastVisible;
  });
  if (!expandedFits) throw Error('Expanded admin satchel has unreachable slots');
  reports.push('Expanded admin capacity keeps the first and last slots reachable by scrolling');
  await page.evaluate(async () => {
    const state = await import("/js/app/state.js");
    const init = await import("/js/ui/application.js");
    const panel = await import("/js/ui/attacks.js");
    init.closeStagePlayerMenus();
    document.querySelectorAll('#black-overlay, .entitylootContainer').forEach(node => node.remove());
    window.levelRunning = 'scripted'; state.refreshStageAccess(); state.startGame();
    panel.showCombatAttackControlPanel(window.__satchelTest.actor.id);
  });
  for (const [name, width, height] of [['combat-desktop', 1536, 900], ['combat-tablet', 1024, 768], ['combat-mobile', 390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(80);
    const geometry = await page.evaluate(() => {
      const bag = document.querySelector('.battle-satchel--combat').getBoundingClientRect();
      const hud = document.querySelector('.combat-attack-control-panel').getBoundingClientRect();
      return { fits: bag.left >= 0 && bag.right <= innerWidth && bag.bottom <= innerHeight, overlaps: bag.left < hud.right && bag.right > hud.left && bag.top < hud.bottom && bag.bottom > hud.top };
    });
    if (!geometry.fits || geometry.overlaps) throw Error(`${name}: satchel overflow/overlap ${JSON.stringify(geometry)}`);
    reports.push(`${name}: satchel stays inside viewport without covering allied controls`);
    await page.screenshot({ path: resolve(output, `${name}.png`) });
  }
  const checkpoint = await page.evaluate(async () => {
    const items = await import('/js/items/itemManager.js');
    const state = await import("/js/app/state.js");
    const store = await import("/js/storage/gameStorage.js");
    state.StopGame();
    await Promise.resolve();
    state.startGame();
    const id = items.getBattleInventoryState().battleSlots[0];
    const hex = document.querySelector('.hex[data-position="hex_2"]');
    if (!items.dropBattleItemOnHex(id, hex)) throw Error('Unable to prepare reload checkpoint');
    store.saveItemsData();
    return items.getBattleInventoryState().battleGroundItems.find(entry => entry.itemId === id);
  });
  await page.reload({ waitUntil: 'load' });
  const reloaded = await page.evaluate(async checkpoint => {
    const items = await import('/js/items/itemManager.js');
    const state = await import("/js/app/state.js");
    const { entites } = await import("/js/entities/runtime.js");
    const store = await import("/js/storage/gameStorage.js");
    store.loadItemsData();
    window.levelRunning = 'scripted';
    store.setCurrentLevel(checkpoint.stageId);
    entites.length = 0;
    const hex = document.createElement('div');
    hex.className = 'hex SideA'; hex.dataset.position = checkpoint.position;
    document.body.appendChild(hex);
    state.setStageInterfaceLoading(false);
    items.restoreBattleGroundItems();
    const hiddenDuringStandby = !hex.querySelector('.battle-ground-item');
    state.startGame();
    items.restoreBattleGroundItems();
    const save = items.getBattleInventoryState();
    const restored = save.battleGroundItems.find(entry => entry.itemId === checkpoint.itemId);
    return Boolean(hiddenDuringStandby && restored && restored.expiresAt === checkpoint.expiresAt && hex.querySelectorAll('.battle-ground-item').length === 1 && !save.battleSlots.includes(checkpoint.itemId));
  }, checkpoint);
  if (!reloaded) throw Error('Reload duplicated or lost the deposited item or renewed its expiry');
  reports.push('Real page reload restores one ground object with its original expiration timestamp');
  if (errors.length) throw Error(errors.join('\n'));
  for (const report of reports) console.log(report);
  console.log(`PASS: ${reports.length} battle inventory checks`);
} finally {
  await browser.close();
  await new Promise(done => server.close(done));
}
