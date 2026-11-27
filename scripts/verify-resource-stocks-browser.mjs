import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('docs');
const output = resolve('outputs/resource-stocks');
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
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index-13.html`);
  const report = await page.evaluate(async () => {
    const E = await import("/js/entities/runtime.js");
    const D = await import("/js/board/deployment.js"), _D = await import("/js/ui/statistics/details.js"), _D2 = await import("/js/combat/statistics.js");
    const R = await import('/js/items/resourceStocks.js');
    const S = await import("/js/storage/gameStorage.js");
    const U = await import("/js/storage/entityStorage.js");
    const P = await import("/js/entities/progression.js");
    const G = await import("/js/app/stages.js");
    const A = await import("/js/combat/vitals.js");
    const I = await import('/js/items/itemEffectMecanics.js');
    const Q = await import('/js/procedural/proc-bareme.js');
    const M = await import('/js/items/itemManager.js');
    const State = await import("/js/app/state.js");
    const { ItemDetails } = await import('/js/data/itemList.js');
    const checks = [];
    const check = (condition, message) => { if (!condition) throw new Error(message); checks.push(message); };
    const equal = (actual, expected, message) => check(actual === expected, typeof actual === 'number' ? `${message}: ${actual} = ${expected}` : message);
    let nextId = 910000;
    const fixture = (values = {}) => ({ id: ++nextId, name: 'Resource audit', type: 'sbire', side: 'A',
      awakening: 1, level: { current: 1, max: 250 }, attacks: ['autoAttack'],
      baseStats: { HP: 20, shift: 10, agility: 17, charge: 5, ...values }, stats: {}, stuff: {} });
    const gear = (id, effects) => ({ itemId: `i-resource-${id}`, equippedId: `ei-resource-${id}`,
      serial: 'i51', itemType: ['stuff'], displayName: 'Reserve test', itemQuality: 2,
      itemAsset: './media/assets/items/cape-agilite.png', Stuffeffets: effects });
    const stockGear = gear('a', [{ type: 'stat-buff', stat: 'shift', value: { current: 7, max: 0 } }]);
    const maxGear = gear('max', [{ type: 'stat-buff', stat: 'shift', value: { max: 4 } }]);
    const lifeGear = gear('life', [{ type: 'stat-buff', stat: 'fadedLife', value: 2 }]);
    let equipment = [stockGear, maxGear, lifeGear];
    const persistGear = () => {
      S.saveToLocalStorage('equippedItems', equipment);
      S.saveToLocalStorage('PlayerSave', { Playerinventory: [], equippedItems: equipment });
      S.saveToLocalStorage('IngameItemsData', { Playerinventory: [], equippedItems: equipment });
    };
    const recompute = entity => E.recomputeEntityStats(entity, { equippedItems: equipment, persistEquipment: false, skipReverseArchetype: true });
    const save = entity => { S.saveToLocalStorage('selectedArmyA', [entity]); U.saveEntityMovementState(entity); };
    const refreshGear = () => { equipment = S.loadEquippedItems(); };
    persistGear();
    const entity = fixture();
    recompute(entity);
    equal(entity.stats.shift.current, 5, 'Existing barème starts at 50 percent with 17 Agility');
    equal(entity.stats.shift.max, 10, 'Normal capacity');
    entity.stuff.slot1 = [stockGear.equippedId];
    recompute(entity);
    equal(entity.stats.shift.current, 12, 'Equipping adds seven current charges');
    equal(entity.stats.shift.max, 10, 'Current stock never increases max');
    equal(R.getNaturalMovementCurrent(entity), 5, 'Natural portion remains five');
    const unchangedGear = JSON.stringify(equipment);
    for (let index = 0; index < 3; index++) recompute(entity);
    equal(entity.stats.shift.current, 12, 'Repeated recomputation never grants another seven');
    equal(JSON.stringify(equipment), unchangedGear, 'Read-only recomputation does not mutate equipment inputs');
    for (let index = 0; index < 10; index++) D.refillEntityMovement(entity);
    equal(entity.stats.shift.current, 12, 'Natural recovery preserves surplus without adding charges');
    equal(R.getEquipmentResourceCurrent(entity, 'shift'), 7, 'Recovery does not touch stock');
    save(entity);
    G.nextDay(1, { animate: false });
    let stored = S.loadFromLocalStorage('selectedArmyA', [])[0];
    equal(stored.stats.shift.current, 12, 'New day restores five plus remaining seven');
    Object.assign(entity, stored);
    const spent = D.consumeEntityMovement(entity, 4);
    equal(spent.cost, 4, 'Unchanged weight cost');
    equal(entity.stats.shift.current, 8, 'Four charges are spent');
    equal(entity.resourceStocks.shift.stuff[stockGear.equippedId].current, 3, 'Equipment is spent first');
    equal(R.getNaturalMovementCurrent(entity), 5, 'Natural reserve was not spent');
    save(entity);
    refreshGear();
    for (const bucket of ['equippedItems', 'PlayerSave', 'IngameItemsData']) {
      const raw = S.loadFromLocalStorage(bucket, {});
      const items = Array.isArray(raw) ? raw : raw.equippedItems;
      equal(items.find(item => item.equippedId === stockGear.equippedId).resourceStocks.shift.current, 3, `${bucket} retains the spent stock`);
    }
    recompute(entity);
    equal(entity.stats.shift.current, 8, 'Reloaded equipment does not restore stock');
    const beforePreview = JSON.stringify({ stats: entity.stats, stocks: entity.resourceStocks, equipment });
    entity.modifierStats.preview = { statLeveled: { shiftPlus: 4, agility: 10 } };
    P.ComputeStatPreview(entity);
    const display = _D.calculateStatsDisplay('shift', entity);
    equal(display.shiftMax, 14, 'Preview capacity includes its bonus');
    equal(display.shiftCurrent, 8, 'Preview does not grant current charges');
    equal(display.shiftStartingCharges, _D2.calculateMovementStartingCharges({ stats: { movement: 14, agility: 27 } }) + 3, 'Daily helper preview includes remaining equipment');
    equal(JSON.stringify({ stats: entity.stats, stocks: entity.resourceStocks, equipment }), beforePreview, 'Preview never changes persistent resources');
    delete entity.modifierStats.preview;
    entity.stuff.slot2 = [maxGear.equippedId];
    recompute(entity);
    equal(entity.stats.shift.max, 14, 'Max-only equipment raises capacity');
    equal(entity.stats.shift.current, 8, 'Max-only equipment grants no current charges');
    delete entity.stuff.slot2;
    recompute(entity);
    equal(entity.stats.shift.current, 8, 'Removing max does not destroy equipment stock');
    delete entity.stuff.slot1;
    recompute(entity);
    equal(entity.stats.shift.current, 5, 'Unequipping removes only remaining equipment charges');
    const recipient = fixture();
    recompute(recipient);
    recipient.stuff.slot1 = [stockGear.equippedId];
    recompute(recipient);
    equal(recipient.stats.shift.current, 8, 'Transfer grants the three remaining charges, not seven');
    recipient.stuff = {};
    recompute(recipient);
    entity.stuff.slot1 = [stockGear.equippedId];
    recompute(entity);
    equal(entity.stats.shift.current, 8, 'Reequipping cannot refill the item');
    const consumable = ItemDetails.find(item => item.functionName === 'MovementCharge');
    check(I.validateConsumableUse(entity, consumable).ok, 'New +1 consumable is usable');
    save(entity);
    const used = await I.itemApplyEffect(entity, 'itemMovement', consumable);
    check(used.ok, 'Movement consumable succeeds');
    equal(entity.stats.shift.current, 9, 'Consumable adds exactly one current');
    equal(entity.stats.shift.max, 10, 'Consumable does not affect maximum');
    D.initializeAllMovementStatesAtBattleStart([entity]);
    equal(entity.stats.shift.current, 9, 'Battle entry preserves map consumable');
    G.nextDay(0, { animate: false });
    equal(S.loadFromLocalStorage('selectedArmyA', [])[0].stats.shift.current, 9, 'Zero days does not reset charges');
    G.nextDay(1, { animate: false });
    stored = S.loadFromLocalStorage('selectedArmyA', [])[0];
    equal(stored.stats.shift.current, 8, 'Next day removes consumable but retains equipment stock');
    equal(stored.resourceStocks.shift.temporary, 0, 'Temporary source is cleared');
    Object.assign(entity, stored);
    entity.baseStats.marathon = 100;
    recompute(entity);
    const beforeFree = JSON.stringify(entity.resourceStocks);
    equal(D.consumeEntityMovement(entity).reason, 'marathon', 'Free movement procs');
    equal(JSON.stringify(entity.resourceStocks), beforeFree, 'Free movement spends no stock');
    delete entity.baseStats.marathon;
    recompute(entity);
    D.consumeEntityMovement(entity, 3);
    equal(entity.resourceStocks.shift.stuff[stockGear.equippedId].current, 0, 'Equipment can be completely depleted');
    equal(entity.stats.shift.current, 5, 'Normal charges remain after equipment depletion');
    save(entity);
    refreshGear();
    G.nextDay(1, { animate: false });
    Object.assign(entity, S.loadFromLocalStorage('selectedArmyA', [])[0]);
    recompute(entity);
    equal(entity.stats.shift.current, 5, 'Empty equipment never refills next day');
    const empty = fixture({ shift: { current: 0, max: 10 } });
    recompute(empty);
    const emptySnapshot = JSON.stringify(empty.resourceStocks);
    check(!D.consumeEntityMovement(empty).allowed, 'Movement without available charges is refused');
    equal(JSON.stringify(empty.resourceStocks), emptySnapshot, 'Refused movement changes no resource');
    const lives = fixture({ fadedLife: 1 });
    recompute(lives);
    lives.stuff.slot1 = [lifeGear.equippedId];
    recompute(lives);
    equal(lives.stats.fadedLife, 3, 'Equipment lives add to native lives');
    S.saveToLocalStorage('selectedArmyA', [lives]);
    lives.baseStats.transcendenceTotal = 100;
    recompute(lives);
    check(A.attemptExtraLife(lives, { pool: 'fadedLife', vfxDuration: 0 }), 'Protected resurrection succeeds');
    equal(lives.stats.fadedLife, 3, 'Transcendence preserves total lives');
    equal(lives.resourceStocks.fadedLife.stuff[lifeGear.equippedId].current, 2, 'Transcendence preserves item stock');
    delete lives.baseStats.transcendenceTotal;
    recompute(lives);
    check(A.attemptExtraLife(lives, { pool: 'fadedLife', vfxDuration: 0 }), 'Faded life resurrects');
    equal(lives.stats.fadedLife, 2, 'Exactly one faded life is spent');
    equal(lives.resourceStocks.fadedLife.stuff[lifeGear.equippedId].current, 1, 'Item life is spent before native life');
    refreshGear();
    recompute(lives);
    equal(lives.stats.fadedLife, 2, 'Recomputation does not restore a spent life');
    G.nextDay(1, { animate: false });
    equal(S.loadFromLocalStorage('selectedArmyA', [])[0].stats.fadedLife, 2, 'Unspent faded lives persist across days');
    lives.stuff = {};
    recompute(lives);
    equal(lives.stats.fadedLife, 1, 'Unequipping removes only the remaining equipment life');
    lives.stuff.slot1 = [lifeGear.equippedId];
    recompute(lives);
    equal(lives.stats.fadedLife, 2, 'Reequipping does not replenish faded lives');
    check(!I.validateConsumableUse(entity, { ...consumable, MovementAmount: -1 }).ok, 'Invalid charge amount rejected');
    check(!I.validateConsumableUse(entity, { ...consumable, MovementAmount: Infinity }).ok, 'Infinite charge amount rejected');
    const enemy = fixture();
    enemy.side = 'B';
    recompute(enemy);
    R.addMovementCharges(enemy, 7);
    S.saveToLocalStorage('ArmyB', { armies: { ArmyB_test: { entities: [enemy] } } });
    U.saveEntityMovementState(enemy);
    equal(S.loadFromLocalStorage('ArmyB', {}).armies.ArmyB_test.entities[0].stats.shift.current, 12, 'Enemy pool uses canonical army storage');
    G.nextDay(1, { animate: false });
    equal(S.loadFromLocalStorage('ArmyB', {}).armies.ArmyB_test.entities[0].stats.shift.current, 5, 'Enemy temporary movement resets on the same day boundary');
    const multi = fixture();
    const small = [gear('first', [{ type: 'stat-buff', stat: 'shift', value: { current: 2 } }]),
      gear('second', [{ type: 'stat-buff', stat: 'shift', value: { current: 3 } }])];
    equipment = small;
    persistGear();
    recompute(multi);
    multi.stuff = { slot1: [small[0].equippedId], slot2: [small[1].equippedId] };
    recompute(multi);
    R.addMovementCharges(multi, 4);
    equal(multi.stats.shift.current, 14, 'Two item stocks and consumable combine with natural charges');
    D.consumeEntityMovement(multi, 6);
    equal(multi.stats.shift.current, 8, 'Cost crossing several sources is deducted once');
    equal(R.getEquipmentResourceCurrent(multi, 'shift'), 3, 'Consumable spent before equipment stocks');
    equal(multi.resourceStocks.shift.temporary, 0, 'Consumable exhausted first');
    equal(R.getNaturalMovementCurrent(multi), 5, 'Natural reserve preserved after cross-source spending');
    for (let index = 0; index < 12; index++) D.refillEntityMovement(multi);
    equal(multi.stats.shift.current, 10, 'Natural recovery stops at max including temporary charges');
    equal(multi.resourceStocks.shift.temporary, 0, 'Natural recovery never refills temporary sources');
    equal(R.getEquipmentResourceCurrent(multi, 'shift'), 3, 'Natural recovery leaves remaining equipment unchanged');
    save(multi);
    E.entites.push(multi);
    const menuCopy = structuredClone(multi);
    window.selectedArmyA = [menuCopy];
    G.nextDay(1, { animate: false });
    equal(multi.stats.shift.current, 8, 'Live entity and stored entity share daily reset plus remaining gear');
    equal(menuCopy.stats.shift.current, 8, 'Menu entity copy receives the same daily reset plus remaining gear');
    window.selectedArmyA = [];
    E.entites.splice(E.entites.indexOf(multi), 1);
    const emptyGear = S.loadEquippedItems()[0];
    check(Q.evaluateItemPower(emptyGear).score < Q.evaluateItemPower(emptyGear, { fullReserve: true }).score, 'Depleted resource does not contribute its original equipment power');
    S.removeFromEquippedItemsStorage(emptyGear.equippedId);
    const inventoryItem = M.getIngameItemById(emptyGear.itemId);
    equal(inventoryItem.resourceStocks.shift.current, 0, 'Real unequip storage keeps the exhausted stock in inventory');
    R.ensureStuffResourceStocks(inventoryItem);
    equal(inventoryItem.resourceStocks.shift.current, 0, 'Equipment initialization preserves explicit zero');
    const rebound = { ...inventoryItem, equippedId: emptyGear.equippedId, equippedTo: recipient.id };
    S.addToEquippedItemsStorage(rebound.equippedId, rebound);
    equipment = S.loadEquippedItems();
    recipient.stuff = { slot1: [rebound.equippedId] };
    recompute(recipient);
    equal(recipient.stats.shift.current, 5, 'Actual stored reequipping grants no exhausted charges');
    const debt = fixture({ shift: { current: 1, max: 10 }, weight: 100 });
    recompute(debt);
    const debtMove = D.consumeEntityMovement(debt);
    equal(debt.stats.shift.current, 1 - debtMove.cost, 'Existing overweight movement debt retained');
    save(debt);
    equal(S.loadFromLocalStorage('selectedArmyA', [])[0].stats.shift.current, debt.stats.shift.current, 'Saving does not erase movement debt');
    const debtBefore = debt.stats.shift.current;
    D.refillEntityMovement(debt);
    equal(debt.stats.shift.current, debtBefore + 1, 'Natural recovery repays debt normally');
    const availableLifeItem = { ...lifeGear, resourceStocks: { fadedLife: { current: 1, max: 2 } } };
    equipment = [availableLifeItem];
    persistGear();
    const resetCandidate = fixture({ fadedLife: 1, charge: 0 });
    resetCandidate.level.current = 2;
    resetCandidate.experience = 100;
    resetCandidate.modifierStats = { durable: { statLeveled: { charge: 1 } } };
    resetCandidate.stuff.slot1 = [availableLifeItem.equippedId];
    recompute(resetCandidate);
    equal(resetCandidate.stats.fadedLife, 2, 'Reset fixture owns one native and one remaining equipment life');
    const resetPreview = P.previewEntityReset(resetCandidate);
    check(resetPreview.ok, 'Progression reset can be previewed');
    equal(resetPreview.projection.stats.fadedLife, 1, 'Progression reset does not keep life from returned equipment');
    equal(resetCandidate.stats.fadedLife, 2, 'Progression preview leaves real lives untouched');
    window.levelRunning = 'worldmap';
    State.refreshStageAccess();
    const consumer = fixture();
    recompute(consumer);
    save(consumer);
    const acquired = M.acquireItem(consumable, 'resource-audit');
    check(Boolean(acquired?.itemId), 'Movement consumable can be acquired through the real inventory');
    const consumed = await M.useConsumableItem(acquired.itemId, consumer, { silent: true });
    check(consumed.ok && !consumed.warning, 'Real inventory transaction applies the movement effect');
    equal(consumer.stats.shift.current, 6, 'Real inventory use grants exactly one charge');
    check(!M.getBattleInventoryState().Playerinventory.some(item => item.itemId === acquired.itemId), 'Real use removes exactly the consumed object');
    check(!(await M.useConsumableItem(acquired.itemId, consumer, { silent: true })).ok, 'Consumed movement object cannot be reused');
    equal(consumer.stats.shift.current, 6, 'Rejected reuse adds no charges');
    const livesBefore = consumer.stats.fadedLife || 0;
    check((await I.itemApplyEffect(consumer, 'itemFadedLife', { itemType: ['consumable'], effets: ['itemFadedLife'], FadedLifeAmount: 2 })).ok, 'Consumable faded-life effect is implemented');
    equal(consumer.stats.fadedLife, livesBefore + 2, 'Consumable grants its exact faded-life amount');
    recompute(consumer);
    equal(consumer.stats.fadedLife, livesBefore + 2, 'Faded-life consumable survives a stat recalculation');
    G.nextDay(1, { animate: false });
    equal(S.loadFromLocalStorage('selectedArmyA', [])[0].stats.shift.current, 5, 'Real inventory movement expires next day');
    equal(S.loadFromLocalStorage('selectedArmyA', [])[0].stats.fadedLife, livesBefore + 2, 'Faded-life consumable does not expire next day');
    const defaultMovement = fixture();
    delete defaultMovement.baseStats.shift;
    recompute(defaultMovement);
    D.initializeAllMovementStatesAtBattleStart([defaultMovement]);
    equal(defaultMovement.stats.shift.current, 0, 'Battle entry preserves empty fallback movement');
    equal(_D2.calculateShiftDailyStartingCharges(defaultMovement), 0, 'Fallback pool cannot generate charges through battle initialization');
    equal(new Set(ItemDetails.map(item => item.serial)).size, ItemDetails.length, 'Catalogue serials remain unique');
    equal(new Set(ItemDetails.map(item => item.functionName)).size, ItemDetails.length, 'Catalogue function names remain unique');
    for (const [name, amount] of [['MovementChargeThree', 3], ['MovementChargeFive', 5], ['MovementChargeSeven', 7]]) {
      const definition = ItemDetails.find(item => item.functionName === name);
      check(Boolean(definition), `${name} exists in the catalogue`);
      equal(definition.MovementAmount, amount, `${name} has the requested amount`);
      const target = fixture();
      recompute(target);
      save(target);
      const acquiredCharge = M.acquireItem(definition, 'resource-audit');
      check((await M.useConsumableItem(acquiredCharge.itemId, target, { silent: true })).ok, `${name} works through inventory`);
      equal(target.stats.shift.current, 5 + amount, `${name} grants only its current charges`);
      equal(target.stats.shift.max, 10, `${name} leaves maximum unchanged`);
      G.nextDay(1, { animate: false });
      equal(S.loadFromLocalStorage('selectedArmyA', [])[0].stats.shift.current, 5, `${name} expires next day`);
    }
    const catalogueGear = [];
    for (const [name, max, current] of [['DevMovementMaxThree', 3, 0], ['DevMovementCurrentFive', 0, 5], ['DevMovementMixed', 2, 1]]) {
      const definition = ItemDetails.find(item => item.functionName === name);
      check(Boolean(definition), `${name} exists in the catalogue`);
      const item = { ...structuredClone(definition), itemId: `i-${name}`, equippedId: `ei-${name}` };
      equipment = [item];
      persistGear();
      const target = fixture();
      recompute(target);
      target.stuff.slot1 = [item.equippedId];
      recompute(target);
      equal(target.stats.shift.max, 10 + max, `${name} grants its exact maximum`);
      equal(target.stats.shift.current, 5 + current, `${name} grants only its current stock`);
      equal(R.getEquipmentResourceCurrent(target, 'shift'), current, `${name} stock excludes capacity`);
      recompute(target);
      equal(target.stats.shift.current, 5 + current, `${name} is not granted twice`);
      save(target);
      G.nextDay(1, { animate: false });
      equal(S.loadFromLocalStorage('selectedArmyA', [])[0].stats.shift.current, _D2.calculateShiftDailyStartingCharges(target) + current, `${name} daily refill adds only remaining stock`);
      if (current) {
        D.consumeEntityMovement(target, current);
        save(target);
        refreshGear();
        recompute(target);
        equal(R.getEquipmentResourceCurrent(target, 'shift'), 0, `${name} stock is exhaustible`);
        equal(target.stats.shift.max, 10 + max, `${name} keeps its max bonus after depletion`);
      }
      catalogueGear.push(item);
    }
    equipment = catalogueGear;
    persistGear();
    const combined = fixture();
    recompute(combined);
    combined.stuff = Object.fromEntries(catalogueGear.map((item, index) => [`slot${index + 1}`, [item.equippedId]]));
    recompute(combined);
    equal(combined.stats.shift.max, 15, 'Three catalogue items combine for five extra maximum');
    equal(combined.stats.shift.current, 11, 'Three catalogue items combine for six current charges');
    const amplifiedGear = gear('amplified', [{ type: 'stat-buff', stat: 'shift', value: { current: 5, max: 3 } }]);
    equipment = [amplifiedGear]; persistGear();
    const amplified = fixture({ weaponOrfevre: 20 }); recompute(amplified);
    amplified.stuff.slot1 = [amplifiedGear.equippedId]; recompute(amplified);
    equal(amplified.stats.shift.max, 14, 'Efficiency amplifies maximum independently');
    equal(R.getEquipmentResourceCurrent(amplified, 'shift'), 6, 'Five supplemental charges become six at 20 percent efficiency');
    equal(amplified.stats.shift.current, 11, 'Amplified reserve adds to existing natural charges once');
    const movementSources = target => _D.getStatisticSourceTotals(target, 'shift', _D.calculateStatsDisplay('shift', target));
    let labeled = movementSources(amplified);
    check(labeled.every(source => source.label === (source.movementKind === 'max' ? 'Déplacements max' : 'Déplacements sup.')), 'Every movement source identifies max or supplemental');
    equal(labeled.filter(source => source.movementKind === 'max').reduce((sum, source) => sum + source.value, 0), 14, 'Maximum sources sum only to capacity');
    equal(labeled.find(source => source.category === 'equipment' && source.movementKind === 'sup').value, 6, 'Equipment source includes amplified supplemental stock');
    R.spendMovementCharges(amplified, 2);
    equal(R.getEquipmentResourceCurrent(amplified, 'shift'), 4, 'Spending subtracts exactly two amplified charges');
    equal(R.getNaturalMovementCurrent(amplified), 5, 'Amplified equipment is still spent before natural charges');
    for (let i = 0; i < 4; i++) recompute(amplified);
    equal(R.getEquipmentResourceCurrent(amplified, 'shift'), 4, 'Recompute cannot restore consumed efficiency charges');
    R.addMovementCharges(amplified, 3); R.addMovementCharges(amplified, 2, 'spell');
    labeled = movementSources(amplified);
    equal(labeled.find(source => source.category === 'consumable').value, 3, 'Consumable current is labeled supplemental and not amplified');
    equal(labeled.find(source => source.category === 'spell').value, 2, 'Spell current is labeled supplemental and not amplified');
    const frozenAmplified = JSON.stringify({ stats: amplified.stats, stocks: amplified.resourceStocks });
    amplified.modifierStats.preview = { statLeveled: { weaponOrfevre: 80 } };
    P.ComputeStatPreview(amplified);
    const previewAmplified = _D.calculateStatsDisplay('shift', amplified);
    equal(previewAmplified.shiftCurrent, 17, 'Efficiency preview scales remaining gear only, not consumables or spells');
    equal(previewAmplified.shiftMax, 16, 'Efficiency preview scales max separately');
    equal(previewAmplified.shiftEquipmentCharges, 7, 'Daily preview uses amplified remaining stock');
    equal(movementSources(amplified).find(source => source.category === 'equipment' && source.movementKind === 'sup').value, 7, 'Preview sources use the same stock as the preview counter');
    equal(JSON.stringify({ stats: amplified.stats, stocks: amplified.resourceStocks }), frozenAmplified, 'Efficiency preview does not mutate live stocks');
    delete amplified.modifierStats.preview;
    save(amplified); refreshGear();
    const storedReserve = equipment[0].resourceStocks.shift;
    check(Math.abs(storedReserve.preciseCurrent - 10 / 3) < 1e-8, 'Save retains the precise unamplified remainder');
    const reloadedAmplified = S.loadFromLocalStorage('selectedArmyA', [])[0]; recompute(reloadedAmplified);
    equal(reloadedAmplified.stats.shift.current, 14, 'Reload preserves total current and all source categories');
    delete amplified.stuff.slot1; recompute(amplified);
    equal(amplified.stats.shift.current, 10, 'Unequip removes amplified remaining stock only');
    const newOwner = fixture({ weaponOrfevre: 50 }); recompute(newOwner);
    newOwner.stuff.slot1 = [amplifiedGear.equippedId]; recompute(newOwner);
    equal(R.getEquipmentResourceCurrent(newOwner, 'shift'), 5, 'Transfer uses new owner efficiency on the same remainder');
    R.resetDailyMovement(newOwner, _D2.calculateShiftDailyStartingCharges(newOwner));
    equal(newOwner.stats.shift.current, _D2.calculateShiftDailyStartingCharges(newOwner) + 5, 'New day retains amplified gear without replenishing it');
    R.spendMovementCharges(newOwner, 5); save(newOwner); refreshGear();
    equal(equipment[0].resourceStocks.shift.preciseCurrent, 0, 'Last displayed charge exhausts precise stock');
    newOwner.baseStats.weaponOrfevre = 200; recompute(newOwner);
    equal(R.getEquipmentResourceCurrent(newOwner, 'shift'), 0, 'Increased efficiency never restores exhausted stock');
    for (const amount of [1, 2, 3, 5, 7]) for (const efficiency of [0, 1, 20, 33, 50, 100, 250]) {
      const stock = R.getEffectiveMovementStock({ current: amount, max: amount }, efficiency);
      const target = { stats: { shift: { current: stock.current, max: 10 } }, stuff: { slot1: ['fraction'] },
        resourceStocks: { shift: { stuff: { fraction: stock } } } };
      const granted = stock.current;
      for (let remaining = granted; remaining > 0; remaining--) {
        R.spendMovementCharges(target, 1);
        equal(R.getEquipmentResourceCurrent(target, 'shift'), remaining - 1, `Exact charge spending: ${amount} at ${efficiency}%`);
      }
      equal(target.resourceStocks.shift.stuff.fraction.reserve.preciseCurrent, 0, 'No fractional stock survives full consumption');
    }
    for (const trailer of [0, 100]) {
      const target = fixture({ shift: 0, movement: 10, trailer });
      E.recomputeEntityStats(target, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
      for (const [current, amount, expected] of [[7, 1, trailer ? 9 : 8], [9, 3, 10], [10, 1, 10], [13, 1, 13], [-2, 1, trailer ? 0 : -1]]) {
        target.stats.shift.current = current;
        target.resourceStocks.shift = { temporary: 2, stuff: { finite: { current: 1, max: 5 }, empty: { current: 0, max: 3 } } };
        const sources = JSON.stringify(target.resourceStocks);
        const random = Math.random;
        let value;
        try {
          Math.random = () => trailer ? 0 : 0.999;
          value = D.refillEntityMovement(target, amount);
        } finally { Math.random = random; }
        equal(value.current, expected, `Refill ${current}/10, amount ${amount}, Trailer ${trailer}`);
        equal(JSON.stringify(target.resourceStocks), sources, 'Refill leaves every source current unchanged');
        if (current >= 10) {
          check(value.trailer.disabled && value.trailer.roll === null, 'Full or overflowing reserve skips Trailer roll');
        } else if (trailer) check(value.trailer.success, 'Guaranteed Trailer is exercised below maximum');
      }
    }
    for (const max of [0, 6, 14]) {
      const target = fixture();
      target.stats.shift = { current: max - 1, max };
      equal(R.refillNaturalMovement(target, 5), 1, 'Natural refill respects the current modified maximum');
      target.stats.shift.current = max + 5;
      equal(R.refillNaturalMovement(target, 5), 0, 'Surplus grants no room even with a modified maximum');
      equal(target.stats.shift.current, max + 5, 'Clamping the gain never removes existing surplus');
    }
    // Restore UI fixtures without overwriting their exhausted item state.
    equipment = [R.applyResourceStocksToEquippedItems(entity, [stockGear])[0], maxGear,
      R.applyResourceStocksToEquippedItems(lives, [lifeGear])[0]];
    persistGear();
    S.saveToLocalStorage('selectedArmyA', [entity]);
    window.__resourceAudit = { entity, equipment, lives, checks };
    return { count: checks.length, checks };
  });
  assert.deepEqual(errors, []);
  const fixtures = await page.evaluate(() => window.__resourceAudit);
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  const colorChecks = await page.evaluate(async () => {
    const E = await import("/js/entities/runtime.js");
    const D = await import("/js/rendering/hud.js");
    const P = await import("/js/entities/progression.js"), _P = await import("/js/ui/statistics/components.js");
    const UI = await import("/js/ui/statistics/helpers.js"), _UI = await import("/js/ui/codex/index.js"), _UI2 = await import("/js/ui/statistics/components.js");
    const S = await import("/js/storage/gameStorage.js");
    const { createMovementCounter } = await import("/js/rendering/entities.js");
    const checks = [];
    const check = (condition, label) => { if (!condition) throw new Error(label); checks.push(label); };
    const colors = { 'movement-overflow': 'rgb(182, 255, 156)', 'movement-buffed': 'rgb(209, 255, 196)', 'movement-reduced': 'rgb(255, 150, 150)' };
    const inspect = (node, part, state, label) => {
      const value = node.querySelector(`.current-shift.${part}`);
      check(Boolean(value), `${label}: separate ${part} value`);
      for (const key of Object.keys(colors)) check(value.classList.contains(key) === (key === state), `${label}: ${part} ${key}`);
      if (state) {
        const style = getComputedStyle(value);
        check(style.color === colors[state], `${label}: ${part} CSS color (${style.color})`);
        check(style.webkitTextFillColor === colors[state], `${label}: ${part} visible text fill (${style.webkitTextFillColor})`);
      }
    };
    window.levelRunning = 'worldmap';
    P.setPlayerExperience(1000000);
    const host = document.createElement('main');
    host.id = 'movement-color-audit';
    host.style.cssText = 'position:fixed;inset:10px;overflow:auto;background:#240000;z-index:10';
    document.body.append(host);
    const gallery = document.createElement('div');
    for (const [label, currentBonus, maxBonus, forceCurrent, expectedCurrent, expectedMax] of [
      ['normal', 0, 0, null, null, null],
      ['surplus', 0, 0, 13, 'movement-overflow', null],
      ['current bonus', 3, 0, null, 'movement-buffed', null],
      ['max bonus', 0, 3, null, 'movement-buffed', 'movement-buffed'],
      ['max malus', 0, -3, null, 'movement-reduced', 'movement-reduced'],
      ['surplus and malus', 9, -3, null, 'movement-reduced', 'movement-reduced'],
      ['debt', 0, 0, -2, 'movement-reduced', null],
    ]) {
      UI.closeOpenHelpers();
      host.replaceChildren();
      const entity = structuredClone(E.entitesNestUp[0]);
      Object.assign(entity, { id: 978315, name: label, side: 'A', awakening: 1, level: { current: 1, max: 250 },
        baseStats: { HP: 100, shift: 10, agility: 17, charge: 5 }, stats: {}, modifierStats: {}, stuff: {} });
      const equipment = currentBonus || maxBonus ? [{ itemId: 'i-color', equippedId: 'ei-color',
        displayName: 'Movement colors', itemType: ['stuff'], Stuffeffets: [{ type: 'stat-buff', stat: 'shift', value: { current: currentBonus, max: maxBonus } }] }] : [];
      if (equipment.length) entity.stuff.slot1 = ['ei-color'];
      E.recomputeEntityStats(entity, { equippedItems: equipment, persistEquipment: false, skipReverseArchetype: true });
      if (forceCurrent != null) entity.stats.shift.current = forceCurrent;
      S.saveToLocalStorage('equippedItems', equipment);
      S.saveToLocalStorage('selectedArmyA', [entity]);
      const counter = createMovementCounter(entity);
      host.append(counter);
      const profile = D.createMovementDisplay(entity);
      host.append(profile);
      _UI.createCodexEntityScan(entity, host, `codex-entity_${entity.id}`);
      host.querySelector('.codex-inner-menu:has(.codex-stat)').click();
      host.querySelector('.section-content.stats [data-mode="stat"]').click();
      const stat = host.querySelector('.section-content.stats .stat-container[data-stat="shift"] .entite-stat:not(.preview)');
      for (const [name, node] of [['HUD', counter], ['Profile', profile], ['Stats', stat]]) {
        check(Boolean(node), `${label}: ${name} exists`);
        inspect(node, 'current', expectedCurrent, `${label} ${name}`);
        inspect(node, 'max', expectedMax, `${label} ${name}`);
      }
      const before = JSON.stringify(entity.stats);
      const sample = document.createElement('section');
      const title = document.createElement('div');
      title.textContent = label;
      sample.style.cssText = 'margin:0 0 14px;padding:6px;border-bottom:1px solid #795e27';
      sample.append(title, createMovementCounter(entity));
      gallery.append(sample);
      _P.syncDOMWithStats(entity.stats, entity.stats, entity.id, entity);
      inspect(counter, 'current', expectedCurrent, `${label} synchronized HUD`);
      inspect(counter, 'max', expectedMax, `${label} synchronized HUD`);
      check(entity.stats.shift.current === JSON.parse(before).shift.current, 'Color synchronization preserves current movement');
      entity.stats.shift.current = entity.stats.shift.max;
      D.updateMovementDisplay(entity, { animate: false });
      check(!counter.querySelector('.current-shift.current').classList.contains('movement-overflow'), 'Overflow color clears at max');
    }
    host.replaceChildren();
    const entity = structuredClone(E.entitesNestUp[0]);
    Object.assign(entity, { id: 978316, side: 'A', awakening: 1, level: { current: 1, max: 250 },
      baseStats: { HP: 100, shift: 10, agility: 17, charge: 5 }, stats: {}, modifierStats: {}, stuff: {} });
    E.recomputeEntityStats(entity, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
    S.saveToLocalStorage('equippedItems', []);
    S.saveToLocalStorage('selectedArmyA', [entity]);
    _UI.createCodexEntityScan(entity, host, `codex-entity_${entity.id}`);
    host.querySelector('.codex-inner-menu:has(.codex-soul)').click();
    const active = UI.helperEntityByRoot.get(host.querySelector('.level-up-section'));
    // Existing autonomous rows are not repeated by default in Level up.
    // Exercise its shared preview renderer on an explicitly rendered movement row.
    _UI2.createUmbraBlock(host.querySelector('.umbra-submenu.new.entity-stats-section'), 'Déplacements',
      () => active.stats.shift, active, 'shift');
    const committed = JSON.stringify(active.stats);
    for (const delta of [4, -4]) {
      active.modifierStats.preview = { statLeveled: { shift: delta } };
      _P.refreshActiveStatPreview(active, host);
      const stat = host.querySelector('.stat-container[data-stat="shift"]');
      check(Boolean(stat), 'Shared Level up preview renders the movement stat row');
      inspect(stat.querySelector('.entite-stat.preview'), 'max', delta > 0 ? 'movement-buffed' : 'movement-reduced', 'Level up preview');
      inspect(stat.querySelector('.entite-stat.preview'), 'current', delta > 0 ? 'movement-buffed' : 'movement-reduced', 'Level up preview');
      inspect(stat.querySelector('.entite-stat:not(.preview)'), 'max', null, 'Confirmed value during preview');
      check(JSON.stringify(active.stats) === committed, 'Color preview never changes real movement');
    }
    active.modifierStats.preview = { statLeveled: {} };
    _P.refreshActiveStatPreview(active, host);
    check(host.querySelector('.stat-container[data-stat="shift"] .entite-stat.preview').classList.contains('is-hidden'), 'Cancelling preview hides preview colors');
    host.replaceChildren(gallery);
    host.style.cssText = 'position:fixed;left:20px;top:20px;width:300px;padding:16px;box-sizing:border-box;background:#240000;color:white;z-index:10';
    UI.closeOpenHelpers();
    return checks;
  });
  report.checks.push(...colorChecks);
  report.count = report.checks.length;
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: resolve(output, `movement-colors-${width}.png`) });
  }
  await page.evaluate(() => document.getElementById('movement-color-audit').remove());
  await page.evaluate(async ({ entity, equipment }) => {
    const M = await import('/js/items/itemManager.js');
    const S = await import("/js/storage/gameStorage.js");
    const { ItemDetails } = await import('/js/data/itemList.js');
    window.levelRunning = 'worldmap';
    S.saveToLocalStorage('selectedArmyA', [entity]);
    S.saveToLocalStorage('equippedItems', equipment);
    S.saveToLocalStorage('PlayerSave', { Playerinventory: [], equippedItems: equipment });
    S.saveToLocalStorage('IngameItemsData', { Playerinventory: [], equippedItems: equipment });
    window.__showStock = async (key) => {
      M.clearItemDescriptions();
      let helpers = document.querySelector('.Game-helper');
      if (!helpers) { helpers = document.createElement('div'); helpers.className = 'Game-helper'; document.body.append(helpers); }
      let anchor = document.getElementById('stock-audit-anchor');
      if (!anchor) { anchor = document.createElement('button'); anchor.id = 'stock-audit-anchor'; anchor.style.cssText = 'position:fixed;left:8px;top:220px;width:20px;height:20px'; document.body.append(anchor); }
      const item = equipment.find(item => item.Stuffeffets.some(effect => effect.stat === key && (key !== 'shift' || effect.value.current)));
      M.createItemDescription(item, item.equippedId, anchor, { persistent: true });
    };
    window.__showMixedStock = empty => {
      M.clearItemDescriptions();
      const item = structuredClone(ItemDetails.find(item => item.functionName === 'DevMovementMixed'));
      if (empty) item.resourceStocks = { shift: { current: 0, max: 1 } };
      M.createItemDescription(item, 'mixed-stock-audit', document.getElementById('stock-audit-anchor'), { persistent: true });
    };
    window.__showMovementGear = (remaining, negativeMax = false) => {
      M.clearItemDescriptions();
      const item = structuredClone(ItemDetails.find(item => item.functionName === 'DevMovementCurrentFive'));
      if (negativeMax) item.Stuffeffets = [{ type: 'stat-buff', stat: 'shift', value: { max: -5 } }];
      else item.resourceStocks = { shift: { current: remaining, max: 5 } };
      M.createItemDescription(item, 'movement-gear-audit', document.getElementById('stock-audit-anchor'), { persistent: true });
    };
    window.__showMovementConsumable = amount => {
      M.clearItemDescriptions();
      const item = ItemDetails.find(item => item.effets?.includes('itemMovement') && item.MovementAmount === amount);
      M.createItemDescription(item, 'movement-consumable-audit', document.getElementById('stock-audit-anchor'), { persistent: true });
    };
  }, fixtures);
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => window.__showStock('shift'));
    const stockRow = page.locator('.item-description-card .stuff-stat-resource-reserve[data-stat="shift"]');
    await stockRow.waitFor({ state: 'visible' });
    assert.match(await stockRow.innerText(), /0\s*\/\s*7/);
    assert.ok(await stockRow.evaluate(node => node.classList.contains('stuff-stat-resource-empty')));
    const style = await stockRow.evaluate(node => ({ filter: getComputedStyle(node).filter, opacity: getComputedStyle(node).opacity }));
    assert.match(style.filter, /grayscale\(1\)/);
    assert.ok(Number(style.opacity) < 1);
    const rect = await stockRow.boundingBox();
    assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= viewport.width + 1, 'Stock row stays within viewport');
    await page.screenshot({ path: resolve(output, `empty-stock-${viewport.width}.png`) });
    await page.evaluate(() => window.__showStock('fadedLife'));
    await page.locator('.stuff-stat-resource-reserve[data-stat="fadedLife"]').waitFor({ state: 'visible' });
    assert.match(await page.locator('.stuff-stat-resource-reserve[data-stat="fadedLife"]').innerText(), /1\s*\/\s*2/);
    for (const empty of [false, true]) {
      await page.evaluate(empty => window.__showMixedStock(empty), empty);
      const capacity = page.locator('.item-description-card .stuff-stat-row[data-stat="shift"]:not(.stuff-stat-resource-reserve)');
      const reserve = page.locator('.item-description-card .stuff-stat-resource-reserve[data-stat="shift"]');
      await reserve.waitFor({ state: 'visible' });
      assert.match(await capacity.innerText(), /Déplacements max[\s\S]*\+\s*2/);
      assert.match(await reserve.locator('.stat-line').innerText(), empty ? /Déplacements sup\.\s*0\s*\/\s*1/ : /Déplacements sup\.\s*\+1\s*$/);
      assert.equal(await reserve.locator('.stat-lore').count(), 0, 'Movement equipment has no explanatory notice');
      assert.doesNotMatch(await page.locator('.item-description-card').innerText(), /actuel|disponible|recharge quotidienne/);
      assert.equal(await reserve.evaluate(node => node.classList.contains('stuff-stat-resource-empty')), empty);
      assert.ok(!(await capacity.evaluate(node => node.classList.contains('stuff-stat-resource-empty'))));
      const rect = await page.locator('.item-description-card').boundingBox();
      assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= viewport.width + 1, 'Mixed item helper stays within viewport');
    }
    await page.screenshot({ path: resolve(output, `mixed-stock-${viewport.width}.png`) });
    for (const remaining of [5, 2, 0]) {
      await page.evaluate(remaining => window.__showMovementGear(remaining), remaining);
      const reserve = page.locator('.item-description-card .stuff-stat-resource-reserve[data-stat="shift"]');
      await reserve.waitFor({ state: 'visible' });
      assert.equal((await reserve.locator('.stat-name').innerText()).trim(), 'Déplacements sup.');
      assert.equal((await reserve.locator('.stuff-stat-effective').innerText()).trim(), remaining === 5 ? '+5' : remaining === 2 ? '+2 / 5' : '0 / 5');
      assert.equal(await reserve.evaluate(node => node.classList.contains('stuff-stat-resource-empty')), remaining === 0);
      assert.equal(await page.locator('.item-description-card .stuff-stat-boosted[data-stat="shift"]').count(), 0, 'Unequipped stock has no owner efficiency');
      const rect = await page.locator('.item-description-card').boundingBox();
      assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= viewport.width + 1 && rect.y + rect.height <= viewport.height + 1, 'Movement explanation stays within viewport');
      if (remaining === 5) await page.screenshot({ path: resolve(output, `movement-stock-${viewport.width}.png`) });
    }
    await page.evaluate(() => window.__showMovementGear(0, true));
    const malus = page.locator('.item-description-card .stuff-stat-malus[data-stat="shift"]');
    await malus.waitFor({ state: 'visible' });
    assert.equal((await malus.locator('.stuff-stat-effective').innerText()).trim(), '-5');
    assert.equal((await malus.locator('.stat-name').innerText()).trim(), 'Déplacements max');
    assert.equal(await malus.locator('.stat-lore').count(), 0, 'Capacity penalty is not described as a finite reserve');
    for (const amount of [1, 3, 5, 7]) {
      await page.evaluate(amount => window.__showMovementConsumable(amount), amount);
      const description = page.locator('.item-description-card .item-stats-block.consumable');
      await description.waitFor({ state: 'visible' });
      assert.equal((await description.locator('.stat-name').innerText()).trim(), 'Déplacements sup.');
      assert.equal((await description.locator('.stuff-stat-effective').innerText()).trim(), `+${amount}`);
      assert.equal(await description.locator('.picto-stat.shift').count(), 1);
      assert.doesNotMatch(await page.locator('.item-description-card').innerText(), /charge\(s\)|disponible\(s\)|changement de jour|déplacements actuels/);
    }
    await page.screenshot({ path: resolve(output, `consumable-${viewport.width}.png`) });
  }
  await page.evaluate(async () => {
    const E = await import("/js/entities/runtime.js"), UI = await import("/js/ui/statistics/helpers.js"), _UI3 = await import("/js/ui/codex/index.js");
    const S = await import("/js/storage/gameStorage.js"), P = await import("/js/entities/progression.js");
    const M = await import('/js/items/itemManager.js');
    const { ItemDetails } = await import('/js/data/itemList.js');
    const entity = structuredClone(E.entitesNestUp[0]);
    Object.assign(entity, { id: 971888, side: 'A', awakening: 1, level: { current: 1, max: 250 },
      baseStats: { HP: 100, shift: 10, movement: 5, agility: 17, charge: 5, weaponOrfevre: 20 }, stats: {}, modifierStats: {}, stuff: {}, resourceStocks: {} });
    E.recomputeEntityStats(entity, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
    const item = { ...structuredClone(ItemDetails.find(item => item.functionName === 'DevMovementCurrentFive')),
      itemId: 'i-shift-efficiency', equippedId: 'ei-shift-efficiency', equippedTo: entity.id, slot: `slot1-${entity.id}`,
      Stuffeffets: [{ type: 'stat-buff', stat: 'shift', value: { current: 5, max: 3 } }] };
    entity.stuff.slot1 = [item.equippedId];
    E.recomputeEntityStats(entity, { equippedItems: [item], persistEquipment: false, skipReverseArchetype: true });
    window.selectedArmyA = [entity];
    S.saveToLocalStorage('equippedItems', [item]); S.saveToLocalStorage('selectedArmyA', [entity]);
    const host = document.createElement('main'); host.id = 'movement-boost-audit'; document.body.append(host);
    host.style.cssText = 'position:fixed;left:10px;top:10px;width:calc(100vw - 20px);background:#240000;z-index:10';
    window.__showAmplifiedMovement = (preview, itemOnly = false) => {
      M.clearItemDescriptions(); UI.closeOpenHelpers(); host.replaceChildren();
      delete entity.modifierStats.preview;
      if (itemOnly) {
        if (preview) { entity.modifierStats.preview = { statLeveled: { weaponOrfevre: 80 } }; P.ComputeStatPreview(entity); }
        M.createItemDescription(item, item.equippedId, document.getElementById('stock-audit-anchor'), { persistent: true });
        return;
      }
      _UI3.createCodexEntityScan(entity, host, `codex-entity_${entity.id}`);
      host.querySelector('.codex-inner-menu:has(.codex-stat)').click();
      const row = host.querySelector('.codex-attack-stat-block .stat-container[data-stat="shift"]');
      if (!row) throw Error('Production Stats movement row missing');
      let helperEntity = entity;
      if (preview) {
        host.querySelector('.codex-inner-menu:has(.codex-soul)').click();
        helperEntity = UI.helperEntityByRoot.get(host.querySelector('.level-up-section'));
        helperEntity.modifierStats.preview = { statLeveled: { weaponOrfevre: 80 } }; P.ComputeStatPreview(helperEntity);
      }
      const shell = document.createElement('div'); shell.className = preview ? 'level-up-section' : 'codex-entity-scan';
      shell.style.cssText = 'position:static;width:100%;height:auto';
      const block = document.createElement('div'); block.className = 'codex-attack-stat-block';
      block.append(row); shell.append(block); host.replaceChildren(shell);
      UI.bindHelperEntity(shell, helperEntity); UI.bindHelperEntity(row, helperEntity);
    };
  });
  for (const width of [1280, 390]) for (const preview of [false, true]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(preview => window.__showAmplifiedMovement(preview), preview);
    await page.locator('#movement-boost-audit .stat-container[data-stat="shift"]').click();
    const helper = page.locator('[data-umbra-pinned="true"]');
    await helper.waitFor({ state: 'visible' });
    assert.match(await helper.innerText(), /Déplacements max/);
    assert.match(await helper.innerText(), /Déplacements sup\./);
    await helper.locator('[data-helper-source="umbra"]').hover();
    let detail = page.locator('[data-umbra-detail]');
    await detail.waitFor({ state: 'visible' });
    assert.match(await detail.innerText(), /Déplacements max \+.*\+\s*5/s);
    await helper.locator('[data-helper-source="fixed"]').hover();
    await detail.waitFor({ state: 'visible' });
    assert.match(await detail.innerText(), new RegExp(`Déplacements max[^\\n]*\\+\\s*${preview ? 6 : 4}`));
    await helper.locator('[data-helper-source="equipment"]').hover();
    await detail.waitFor({ state: 'visible' });
    assert.match(await detail.innerText(), new RegExp(`Déplacements sup\\.[^\\n]*\\+\\s*${preview ? 10 : 6}`));
    await page.waitForFunction(() => [...document.querySelectorAll('[data-umbra-pinned], [data-umbra-detail]')]
      .every(node => Number(getComputedStyle(node).opacity) > .99));
    for (const node of [helper, detail]) {
      const box = await node.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width + 1, 'Movement source helper fits viewport');
    }
    await page.screenshot({ path: resolve(output, `amplified-sources-${width}-${preview}.png`) });
    await page.evaluate(preview => window.__showAmplifiedMovement(preview, true), preview);
    const stock = page.locator('.stuff-stat-resource-reserve[data-stat="shift"]');
    assert.equal((await stock.locator('.stuff-stat-effective').innerText()).trim(), '+6');
    assert.ok(await stock.evaluate(node => node.classList.contains('stuff-stat-boosted')));
    const payload = JSON.parse(await stock.locator('[data-orfevre-detail]').getAttribute('data-orfevre-detail'));
    assert.equal(payload.raw, 5); assert.equal(payload.total, 6); assert.equal(payload.exactBonus, 1);
    if (preview) assert.equal(payload.previewDetail.total, 10);
    await page.screenshot({ path: resolve(output, `amplified-item-${width}-${preview}.png`) });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  const liveEquipmentChecks = await page.evaluate(async () => {
    const E = await import("/js/entities/runtime.js"), C = await import("/js/rendering/entities.js");
    const S = await import("/js/storage/gameStorage.js"), U = await import("/js/storage/entityStorage.js");
    const D = await import("/js/board/deployment.js"), R = await import('/js/items/resourceStocks.js');
    const A = await import('/js/items/armor.js'), M = await import('/js/items/itemManager.js');
    const P = await import("/js/rendering/vitalFeedback.js");
    const UI = await import("/js/ui/statistics/helpers.js");
    const { ItemDetails } = await import('/js/data/itemList.js');
    const checks = [];
    const check = (ok, label) => { if (!ok) throw Error(label); checks.push(label); };
    M.clearItemDescriptions(); UI.closeOpenHelpers();
    document.getElementById('movement-boost-audit')?.remove();
    const entity = structuredClone(E.entitesNestUp[0]);
    Object.assign(entity, { id: 971889, side: 'A', position: 'hex_1', awakening: 1,
      level: { current: 1, max: 250 }, baseStats: { HP: 100, shift: 10, agility: 17, charge: 5, weaponOrfevre: 20 },
      stats: {}, modifierStats: {}, stuff: {}, resourceStocks: {} });
    const item = { ...structuredClone(ItemDetails.find(item => item.functionName === 'DevMovementMixed')),
      itemId: 'i-live-stocks', equippedId: 'ei-live-stocks', equippedTo: entity.id,
      Stuffeffets: [
        { type: 'stat-buff', stat: 'shift', value: { current: 5, max: 2 } },
        { type: 'stat-buff', stat: 'armor', value: 10 },
        { type: 'stat-buff', stat: 'fadedLife', value: 2 },
        { type: 'stat-buff', stat: 'extraLife', value: 1, rechargeDays: 3 },
        { type: 'stat-buff', stat: 'eternalLife', value: 1 },
      ] };
    const second = { ...structuredClone(item), itemId: 'i-live-second', equippedId: 'ei-live-second',
      Stuffeffets: [{ type: 'stat-buff', stat: 'shift', value: { current: 2 } }] };
    entity.stuff = { slot1: [item.equippedId], slot2: [second.equippedId] };
    E.recomputeEntityStats(entity, { equippedItems: [item, second], persistEquipment: false, skipReverseArchetype: true });
    window.levelRunning = 'equipment-live-audit';
    E.entites.splice(0, E.entites.length, entity);
    window.selectedArmyA = [structuredClone(entity)]; // Deliberately stale menu copy.
    S.saveToLocalStorage('selectedArmyA', [entity]);
    S.saveToLocalStorage('equippedItems', [item, second]);
    for (const bucket of ['PlayerSave', 'IngameItemsData']) S.saveToLocalStorage(bucket, { Playerinventory: [], equippedItems: [item, second] });
    U.persistEquippedResourceStocks(entity);
    document.body.append(C.createEntiteInDOM(entity).element);
    C.createHeadUpInDom(entity.id);
    C.createEntiteScanInDOM(entity.id);
    M.equippedHoverDescription();
    const scan = document.getElementById(`ScanEntity_${entity.id}`);
    scan.style.cssText = 'display:block;position:fixed;inset:10px;overflow:auto;z-index:10';
    const anchor = scan.querySelector(`.entity-equipement [data-stuff-id="${item.equippedId}"]`);
    const secondAnchor = scan.querySelector(`.entity-equipement [data-stuff-id="${second.equippedId}"]`);
    check(Boolean(anchor && secondAnchor), 'Production combat scan contains both equipped slots');
    M.pinItemDescription(item, item.equippedId, anchor);
    M.pinItemDescription(second, second.equippedId, secondAnchor);
    const card = document.querySelector(`.item-description-card[data-item-id="${item.equippedId}"]`);
    const secondCard = document.querySelector(`.item-description-card[data-item-id="${second.equippedId}"]`);
    const row = key => card.querySelector(`.stuff-stat-resource-reserve[data-stat="${key}"]`);
    const amount = key => row(key).querySelector('.stuff-stat-effective').textContent.trim();
    const sameCard = () => check(card.isConnected && card.classList.contains('persistent')
      && scan.querySelector(`[data-stuff-id="${item.equippedId}"]`) === anchor, 'Consumption preserves pinned helper and drag anchor');
    const hoverContribution = host => {
      host.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      const helper = [...document.querySelectorAll('.stat-hover')].find(node => node._helperHost === host);
      check(Boolean(helper), 'Equipment contribution sub-helper opens');
      return helper;
    };
    const checkContribution = (helper, key, expected) => {
      check(helper.isConnected && helper._helperHost === row(key), `${key}: same sub-helper follows the refreshed stock row`);
      const text = helper.querySelector('.stat-hover-body').textContent;
      check(['extraLife', 'eternalLife'].includes(key)
        ? text.includes(expected ? 'Disponible.' : 'Disponible dans ')
        : text.includes(`Donne ${expected ? '+' : ''}${expected} `), `${key}: open sub-helper immediately describes remaining ${expected}`);
      check(!text.includes('maximum'), `${key}: supplemental contribution is not confused with maximum`);
    };
    let contribution = hoverContribution(row('shift'));
    checkContribution(contribution, 'shift', 6);
    const secondBefore = secondCard.innerHTML;
    const cost = D.consumeEntityMovement(entity, 1).cost;
    U.saveEntityMovementState(entity);
    check(amount('shift') === `+${6 - cost} / 6`, 'Open combat helper immediately updates amplified movement');
    checkContribution(contribution, 'shift', 6 - cost);
    sameCard();
    check(secondCard.innerHTML === secondBefore, 'Later equipment slot is untouched while first stock is consumed');
    while (entity.resourceStocks.shift.stuff[item.equippedId].current > 0) {
      D.consumeEntityMovement(entity, 1); U.saveEntityMovementState(entity);
      const remaining = entity.resourceStocks.shift.stuff[item.equippedId].current;
      check(amount('shift') === (remaining ? `+${remaining} / 6` : '0 / 6'), 'Every movement updates the open equipment stock');
      checkContribution(contribution, 'shift', remaining);
      sameCard();
    }
    check(row('shift').classList.contains('stuff-stat-resource-empty'), 'Spent stock becomes gray without closing its helper');
    check(getComputedStyle(row('shift')).filter.includes('grayscale(1)'), 'Empty stock uses existing grayscale CSS');
    check(!card.querySelector('.stuff-stat-row[data-stat="shift"]:not(.stuff-stat-resource-reserve)').classList.contains('stuff-stat-resource-empty'), 'Max bonus stays active when supplemental stock is empty');
    D.consumeEntityMovement(entity, 1); U.saveEntityMovementState(entity);
    check(secondCard.innerHTML !== secondBefore, 'Next slot helper updates when consumption reaches its stock');
    const beforeRefill = card.innerHTML;
    D.refillEntityMovement(entity); U.saveEntityMovementState(entity);
    check(card.innerHTML === beforeRefill && amount('shift') === '0 / 6', 'Natural refill leaves depleted equipment unchanged');
    checkContribution(contribution, 'shift', 0);
    const maxRow = card.querySelector('.stuff-stat-row[data-stat="shift"]:not(.stuff-stat-resource-reserve)');
    const maximumHelper = hoverContribution(maxRow);
    const maximumText = maximumHelper.textContent;
    A.consumeEntityArmor(entity, 3); U.saveEntityArmorState(entity);
    check(maximumHelper.isConnected && maximumHelper.textContent === maximumText
      && !maximumHelper._helperHost.classList.contains('stuff-stat-resource-reserve'), 'Unrelated consumption preserves the maximum sub-helper');
    check(card.querySelector('.stuff-stat-armor-reserve .stuff-stat-effective').textContent.includes('/'), 'Open helper updates partial armor consumption');
    const armorHelper = hoverContribution(card.querySelector('.stuff-stat-armor-reserve'));
    A.consumeEntityArmor(entity, 1000); U.saveEntityArmorState(entity);
    check(armorHelper.isConnected && armorHelper._helperHost.isConnected
      && armorHelper.textContent.includes("Donne 0 points d'armure"), 'Open armor sub-helper updates without another hover');
    check(card.querySelector('.stuff-stat-armor-empty'), 'Open helper grays exhausted armor');
    P.updateHealthBar(entity.stats.HP.current, entity.stats.HP.max, entity.stats.armor.current, entity.stats.armor.max, entity.id);
    check(card.querySelector('.stuff-stat-armor-reserve .stuff-stat-effective')?.textContent === '0 / 12', 'HUD armor refresh preserves the item stock rather than the entity total');
    check(card.querySelector('.stuff-stat-armor-reserve .entite-stat').style.display !== 'none', 'Empty equipment armor remains visible in its helper');
    contribution = hoverContribution(row('fadedLife'));
    R.consumeFadedLife(entity); U.saveEntityLifePoolToStorage(entity, 'fadedLife');
    checkContribution(contribution, 'fadedLife', 1);
    check(amount('fadedLife') === '1 / 2', 'Open helper updates Faded Life stock');
    R.consumeFadedLife(entity); U.saveEntityLifePoolToStorage(entity, 'fadedLife');
    checkContribution(contribution, 'fadedLife', 0);
    check(row('fadedLife').classList.contains('stuff-stat-resource-empty'), 'Open helper grays exhausted Faded Life');
    for (const key of ['extraLife', 'eternalLife']) {
      contribution = hoverContribution(row(key));
      R.consumeRechargeableLife(entity, key); U.saveEntityLifePoolToStorage(entity, key);
      checkContribution(contribution, key, 0);
      check(row(key).classList.contains('stuff-stat-resource-empty'), `Open helper grays consumed ${key}`);
      const stock = entity.resourceStocks[key].stuff[item.equippedId];
      const days = stock.regen['001'].maxRegen;
      R.advanceLifeRegen(entity, key, days, (stock.lastUpdate || 0) + days, true);
      U.persistEquippedResourceStocks(entity);
      checkContribution(contribution, key, 1);
      check(!row(key).classList.contains('stuff-stat-resource-empty'), `Open helper reactivates recharged ${key}`);
    }
    sameCard();
    M.clearItemDescriptions();
    anchor.dispatchEvent(new MouseEvent('mouseenter'));
    const reopened = document.querySelector(`.item-description-card[data-item-id="${item.equippedId}"]`);
    check(reopened.querySelector('.stuff-stat-resource-reserve[data-stat="shift"]').textContent.includes('0 / 6'), 'Rehover reads combat stock rather than stale selected army or captured item');
    check(reopened.querySelector('.stuff-stat-armor-empty'), 'Rehover retains consumed armor');
    R.consumeRechargeableLife(entity, 'extraLife'); U.saveEntityLifePoolToStorage(entity, 'extraLife');
    check(reopened.isConnected && reopened.querySelector('.stuff-stat-resource-empty[data-stat="extraLife"]'), 'Unpinned hover helper also refreshes during consumption');
    await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
    check(reopened.querySelector('.stuff-stat-armor-reserve .stuff-stat-effective')?.textContent === '0 / 12', 'Deferred HUD refresh cannot overwrite the equipment helper');
    check(window.selectedArmyA[0].resourceStocks.shift.stuff[item.equippedId].current === 6, 'UI refresh does not mutate stale army model or refill stocks');
    const box = reopened.getBoundingClientRect();
    check(box.left >= 0 && box.right <= innerWidth + 1 && box.top >= 0 && box.bottom <= innerHeight + 1, 'Updated combat equipment helper stays within viewport');
    UI.closeOpenHelpers();
    M.pinItemDescription(item, item.equippedId, anchor);
    window.__liveContribution = {
      spend: () => { R.consumeRechargeableLife(entity, 'eternalLife'); U.saveEntityLifePoolToStorage(entity, 'eternalLife'); },
      recharge: () => {
        const stock = entity.resourceStocks.eternalLife.stuff[item.equippedId];
        const days = stock.regen['001'].maxRegen;
        R.advanceLifeRegen(entity, 'eternalLife', days, (stock.lastUpdate || 0) + days, true);
        U.persistEquippedResourceStocks(entity);
      },
    };
    return checks;
  });
  report.checks.push(...liveEquipmentChecks);
  const liveRow = '.item-description-card[data-item-id="ei-live-stocks"] .stuff-stat-resource-reserve[data-stat="eternalLife"]';
  await page.locator(`${liveRow} .stat-name`).hover();
  await page.waitForFunction(() => {
    const helper = document.querySelector('.stat-hover[data-stat="eternalLife"]');
    return helper && Number(getComputedStyle(helper).opacity) > .99;
  });
  await page.evaluate(() => { window.__liveContribution.helper = document.querySelector('.stat-hover[data-stat="eternalLife"]'); });
  for (const [action, expected] of [['spend', 'Disponible dans '], ['recharge', 'Disponible.']]) {
    await page.evaluate(action => window.__liveContribution[action](), action);
    await page.waitForFunction(expected => window.__liveContribution.helper.textContent.includes(expected), expected);
    // Leave the pointer untouched long enough to expose a stale mouseout timer.
    await page.waitForTimeout(1500);
    assert.equal(await page.evaluate(() => {
      const helper = window.__liveContribution.helper;
      return helper.isConnected && helper._helperHost.isConnected && Number(getComputedStyle(helper).opacity) > .99
        && document.querySelector('.stat-hover[data-stat="eternalLife"]') === helper;
    }), true, 'Pointer held still: same contribution helper remains visible after resource update');
    report.checks.push(`Real pointer held still: ${action} refreshes the open sub-helper without reopening`);
  }
  await page.evaluate(async () => {
    const E = await import("/js/entities/runtime.js"), D = await import("/js/ui/statistics/details.js");
    const R = await import('/js/items/resourceStocks.js'), A = await import('/js/items/armor.js');
    const U = await import("/js/storage/entityStorage.js"), P = await import("/js/entities/progression.js");
    const UI = await import("/js/ui/statistics/helpers.js"), _UI4 = await import("/js/ui/codex/index.js"), _UI5 = await import("/js/ui/statistics/components.js"), S = await import("/js/storage/gameStorage.js");
    const M = await import('/js/items/itemManager.js'), { ItemDetails } = await import('/js/data/itemList.js');
    let entity, draft, mode, stat;
    const amount = () => stat === 'armor'
      ? Object.values(entity.armorLayers.stuff).reduce((sum, stock) => sum + stock.current, 0)
      : R.getEquipmentResourceCurrent(entity, stat, stat === 'shift' ? (mode === 'preview' ? 100 : 20) : undefined);
    window.__stockSources = {
      setup(nextMode, key) {
        mode = nextMode; stat = key;
        UI.closeOpenHelpers(); M.clearItemDescriptions();
        document.body.innerHTML = '<div class="Game-helper"></div><main id="stock-source-audit"></main>';
        entity = structuredClone(E.entitesNestUp[0]);
        Object.assign(entity, { id: 971892, side: 'A', awakening: 1, level: { current: 1, max: 250 },
          baseStats: { HP: 100, shift: 10, movement: 5, agility: 17, charge: 5, weaponOrfevre: 20,
            armor: 5, fadedLife: 1, extraLife: 1, eternalLife: 1 },
          stats: {}, modifierStats: {}, stuff: {}, resourceStocks: {} });
        const effect = (stat, value) => ({ type: 'stat-buff', stat, value });
        const template = ItemDetails.find(item => item.serial === 'i57');
        const items = [
          { ...structuredClone(template), itemId: 'i-source-one', equippedId: 'ei-source-one', equippedTo: entity.id,
            Stuffeffets: [effect('shift', { current: 5, max: 3 }), effect('armor', 10), effect('fadedLife', 2),
              { ...effect('extraLife', 2), rechargeDays: 3 }, effect('eternalLife', 2)] },
          { ...structuredClone(template), itemId: 'i-source-two', equippedId: 'ei-source-two', equippedTo: entity.id,
            Stuffeffets: [effect('shift', { current: 2 }), effect('fadedLife', 1),
              { ...effect('extraLife', 1), rechargeDays: 6 }, effect('eternalLife', 1)] },
        ];
        entity.stuff = { slot1: [items[0].equippedId], slot2: [items[1].equippedId] };
        E.recomputeEntityStats(entity, { equippedItems: items, persistEquipment: false, skipReverseArchetype: true });
        window.levelRunning = 'stock-sources-audit'; E.entites.splice(0, E.entites.length, entity);
        window.selectedArmyA = [structuredClone(entity)];
        S.saveToLocalStorage('selectedArmyA', [entity]); S.saveToLocalStorage('equippedItems', items);
        for (const bucket of ['PlayerSave', 'IngameItemsData']) S.saveToLocalStorage(bucket, { Playerinventory: [], equippedItems: items });
        const mount = document.getElementById('stock-source-audit');
        _UI4.createCodexEntityScan(entity, mount, `codex-entity_${entity.id}`);
        mount.querySelector('.codex-inner-menu:has(.codex-stat)').click();
        let row = mount.querySelector(`.codex-attack-stat-block .stat-container[data-stat="${key}"]`);
        if (!row || mode !== 'stats') {
          const holder = document.createElement('div');
          const names = { shift: 'Déplacements', armor: 'Armure', fadedLife: 'Vies fanées', extraLife: 'Vies supplémentaires', eternalLife: 'Vies éternelles' };
          _UI5.createUmbraBlock(holder, names[key], () => entity.stats[key], entity, key);
          row = holder.querySelector('.stat-container');
        }
        if (!row) throw Error(`Missing shared stat row: ${key}`);
        draft = structuredClone(entity);
        if (mode === 'preview') {
          draft.modifierStats.preview = { statLeveled: { weaponOrfevre: 80 } };
          P.ComputeStatPreview(draft);
        }
        const scope = document.createElement('section');
        scope.className = mode === 'stats' ? 'codex-entity-scan' : 'level-up-section';
        scope.style.cssText = 'position:static;width:100%;height:auto';
        const block = document.createElement('div'); block.className = 'codex-attack-stat-block';
        block.append(row); scope.append(block); mount.replaceChildren(scope);
        mount.style.cssText = 'position:fixed;top:10px;left:10px;width:calc(100vw - 20px);background:#240000';
        UI.bindHelperEntity(scope, draft); UI.bindHelperEntity(row, draft);
        return amount();
      },
      spend(all) {
        const count = all ? R.getEquipmentResourceCurrent(entity, stat) : 1;
        if (stat === 'shift') { R.spendMovementCharges(entity, all ? count : 2); U.saveEntityMovementState(entity); }
        else if (stat === 'armor') { A.consumeEntityArmor(entity, all ? 1000 : 3); U.saveEntityArmorState(entity); }
        else {
          for (let n = 0; n < count; n++) stat === 'fadedLife' ? R.consumeFadedLife(entity) : R.consumeRechargeableLife(entity, stat);
          U.saveEntityLifePoolToStorage(entity, stat);
        }
        return amount();
      },
      inspect() {
        const row = document.querySelector('#stock-source-audit .stat-container');
        const before = JSON.stringify({ entity, draft, items: S.loadEquippedItems() });
        const view = UI.getBoundHelperEntity(row);
        const display = D.calculateStatsDisplay(stat, view);
        const totals = D.getStatisticSourceTotals(view, stat, display);
        const equipment = totals.filter(source => source.category === 'equipment');
        const reserves = equipment.filter(source => stat === 'shift' ? source.movementKind === 'sup'
          : ['armor', 'extraLife'].includes(stat) ? source.remainingStock : true);
        if (reserves.length !== 1 || reserves[0].value !== amount()) throw Error(`${mode}/${stat}: remaining stock source ${JSON.stringify(reserves)} != ${amount()}`);
        if (stat === 'shift') {
          const maximum = equipment.filter(source => source.movementKind === 'max');
          if (maximum.length !== 1 || maximum[0].value !== (mode === 'preview' ? 6 : 4)) throw Error('Maximum contribution changed with stock depletion');
          if (totals.filter(source => source.movementKind === 'max').reduce((sum, source) => sum + source.value, 0) !== display.shiftMax) throw Error('Maximum sources do not sum to capacity');
          if (totals.some(source => !['Déplacements max', 'Déplacements sup.'].includes(source.label))) throw Error('Ambiguous movement source');
        }
        if (before !== JSON.stringify({ entity, draft, items: S.loadEquippedItems() })) throw Error('Reading a helper mutated gameplay, draft or saved equipment');
        return { expected: amount(), labels: equipment.map(source => source.label) };
      },
    };
  });
  for (const mode of ['stats', 'level-up', 'preview']) for (const stat of ['shift', 'armor', 'fadedLife', 'extraLife', 'eternalLife']) {
    await page.evaluate(({ mode, stat }) => window.__stockSources.setup(mode, stat), { mode, stat });
    await page.locator(`#stock-source-audit .stat-container[data-stat="${stat}"]`).click();
    const parent = page.locator('[data-umbra-pinned="true"]');
    await page.evaluate(() => window.__stockSources.inspect());
    assert.equal(await parent.count(), 1, `${mode}/${stat}: production stat row can be pinned`);
    assert.equal(await parent.locator('[data-helper-source="equipment"]').count(), 1, `${mode}/${stat}: equipment source exists: ${await parent.innerText()}`);
    await parent.locator('[data-helper-source="equipment"]').hover();
    for (const stage of ['full', 'spent', 'empty']) {
      if (stage !== 'full') await page.evaluate(all => window.__stockSources.spend(all), stage === 'empty');
      const { expected } = await page.evaluate(() => window.__stockSources.inspect());
      await page.waitForFunction(({ stat, expected }) => {
        const detail = document.querySelector('[data-umbra-detail]');
        const figures = [...(detail?.querySelectorAll(`.helper-figure[data-helper-stat="${stat}"]`) || [])];
        const last = figures.at(-1);
        return last && Number(last.textContent.replace(/\s/g, '')) === expected;
      }, { stat, expected });
      assert.equal(await page.locator('[data-umbra-pinned="true"]').count(), 1, 'Stats helper stays pinned during consumption');
      await page.waitForTimeout(250);
      assert.equal(await page.locator('[data-umbra-detail]').count(), 1, `${mode}/${stat}/${stage}: source stays open with the pointer untouched`);
      if (stat === 'shift') {
        const text = await page.locator('[data-umbra-detail]').innerText();
        assert.doesNotMatch(text, /Déplacements max/); assert.match(text, /Déplacements sup\./);
        assert.equal(await parent.locator('[data-helper-source="fixed"]').count(), 1, 'Maximum equipment gain belongs to the normal stat family');
        if (mode === 'preview' && stage === 'spent') {
          await page.waitForFunction(() => [...document.querySelectorAll('.stat-hover')].every(node => Number(getComputedStyle(node).opacity) > .99));
          await page.screenshot({ path: resolve(output, 'remaining-sources-preview.png') });
        }
      }
      report.checks.push(`${mode}/${stat}/${stage}: sources show remaining equipment stock, preserve max and do not mutate game or preview`);
    }
  }
  await page.evaluate(async () => {
    const E = await import("/js/entities/runtime.js"), D = await import("/js/ui/statistics/details.js");
    const R = await import('/js/items/resourceStocks.js'), A = await import('/js/items/armor.js');
    const U = await import("/js/storage/entityStorage.js"), P = await import("/js/entities/progression.js");
    const UI = await import("/js/ui/statistics/helpers.js"), _UI6 = await import("/js/ui/statistics/components.js"), S = await import("/js/storage/gameStorage.js");
    const Gear = await import('/js/items/equipement.js'), State = await import("/js/app/state.js");
    const M = await import('/js/items/itemManager.js'), { ItemDetails } = await import('/js/data/itemList.js');
    let actors, drafts, stockSnapshot, mode, stat;
    const stockState = () => S.loadEquippedItems().map(item => ({ id: item.equippedId,
      resourceStocks: item.resourceStocks, armorReserve: item.armorReserve })).sort((a, b) => a.id.localeCompare(b.id));
    window.__swapSources = {
      setup(context, nextMode, key) {
        mode = nextMode; stat = key;
        UI.closeOpenHelpers(); M.clearItemDescriptions();
        document.body.innerHTML = '<div class="Game-helper"></div><main id="swap-source-audit"></main>';
        window.levelRunning = context === 'map' ? 'worldmap' : 'swap-source-audit';
        S.setAdminMode(true); State.refreshStageAccess();
        const effect = (stat, value) => ({ type: 'stat-buff', stat, value });
        const template = ItemDetails.find(item => item.serial === 'i57');
        const items = [0, 1].map(index => ({ ...structuredClone(template),
          itemId: `i-swap-${index}`, equippedId: `ei-swap-${index}`, equippedTo: 971900 + index,
          slot: `slot1-${971900 + index}`, Stuffeffets: [effect('shift', { current: 5, max: 3 - index }),
            effect('armor', 10), effect('fadedLife', 2), { ...effect('extraLife', 2), rechargeDays: 3 + index },
            effect('eternalLife', 2)] }));
        actors = items.map((item, index) => {
          const entity = structuredClone(E.entitesNestUp[0]);
          Object.assign(entity, { id: item.equippedTo, side: 'A', awakening: 1, level: { current: 1, max: 250 },
            baseStats: { HP: 100, shift: 10, agility: 17, charge: 5, weaponOrfevre: index ? 100 : 20,
              armor: 5, robustness: 5, fadedLife: 1, extraLife: 1, eternalLife: 1 },
            stats: {}, modifierStats: {}, stuff: { slot1: [item.equippedId] }, resourceStocks: {} });
          E.recomputeEntityStats(entity, { equippedItems: items, persistEquipment: false, skipReverseArchetype: true });
          return entity;
        });
        E.entites.splice(0, E.entites.length, ...actors);
        S.saveToLocalStorage('selectedArmyA', actors); S.saveToLocalStorage('equippedItems', items);
        for (const bucket of ['PlayerSave', 'IngameItemsData']) S.saveToLocalStorage(bucket, { Playerinventory: [], equippedItems: items });
        for (const [index, entity] of actors.entries()) {
          R.spendMovementCharges(entity, index ? R.getEquipmentResourceCurrent(entity, 'shift') : 2);
          A.consumeEntityArmor(entity, index ? 20 : 3);
          for (const key of ['fadedLife', 'extraLife', 'eternalLife']) {
            const count = index ? R.getEquipmentResourceCurrent(entity, key) : 1;
            for (let n = 0; n < count; n++) key === 'fadedLife' ? R.consumeFadedLife(entity) : R.consumeRechargeableLife(entity, key);
            U.saveEntityLifePoolToStorage(entity, key);
          }
          U.saveEntityMovementState(entity); U.saveEntityArmorState(entity); S.saveUpgradedEntity(entity);
        }
        stockSnapshot = JSON.stringify(stockState());
        drafts = actors.map(entity => structuredClone(entity));
        const mount = document.getElementById('swap-source-audit');
        mount.style.cssText = 'position:fixed;top:20px;left:20px;width:calc(100vw - 40px);background:#240000';
        for (const draft of drafts) {
          if (mode === 'preview') {
            draft.modifierStats.preview = { statLeveled: { weaponOrfevre: 80 } };
            P.ComputeStatPreview(draft);
          }
          const scope = document.createElement('section'); scope.id = `swap-source-${draft.id}`;
          scope.className = mode === 'stats' ? 'codex-entity-scan' : 'level-up-section';
          scope.style.cssText = 'position:static;width:100%;height:auto';
          const block = document.createElement('div'); block.className = 'codex-attack-stat-block';
          _UI6.createUmbraBlock(block, key, () => draft.stats[key], draft, key);
          if (!block.querySelector('.stat-container')) throw Error(`No ${key} row before swap: ${JSON.stringify(draft.stats[key])}`);
          scope.append(block); mount.append(scope);
          UI.bindHelperEntity(scope, draft); UI.bindHelperEntity(block.querySelector('.stat-container'), draft);
        }
      },
      swap() {
        const [sourceEntity, targetEntity] = actors;
        const ok = Gear.equip({ item: S.getEquippedItemById(sourceEntity.stuff.slot1[0]), sourceEntity, targetEntity,
          slotId: `slot1-${targetEntity.id}` });
        if (!ok) throw Error('Production equipment swap failed');
        if (JSON.stringify(stockState()) !== stockSnapshot) throw Error('Swap changed an item reserve or life recharge clock');
        const saved = S.loadFromLocalStorage('selectedArmyA', []);
        for (const entity of actors) {
          const owner = S.getEquippedItemById(entity.stuff.slot1[0]);
          if (owner.equippedTo !== entity.id) throw Error('Wrong item owner after swap');
          const restored = structuredClone(saved.find(candidate => candidate.id === entity.id));
          const before = JSON.stringify({ stocks: restored.resourceStocks, armor: restored.armorLayers, shift: restored.stats.shift });
          E.recomputeEntityStats(restored, { equippedItems: S.loadEquippedItems(), persistEquipment: false, skipReverseArchetype: true });
          if (before !== JSON.stringify({ stocks: restored.resourceStocks, armor: restored.armorLayers, shift: restored.stats.shift })) throw Error('Reload after swap refilled or changed reserves');
        }
      },
      inspect(index) {
        const entity = actors[index];
        const row = document.querySelector(`#swap-source-${entity.id} .stat-container`);
        const before = JSON.stringify({ actors, drafts, items: S.loadEquippedItems() });
        const view = UI.getBoundHelperEntity(row);
        const display = D.calculateStatsDisplay(stat, view);
        const totals = D.getStatisticSourceTotals(view, stat, display);
        const equipment = totals.filter(source => source.category === 'equipment');
        const reserves = equipment.filter(source => stat === 'shift' ? source.movementKind === 'sup'
          : ['armor', 'extraLife'].includes(stat) ? source.remainingStock : true);
        const percent = (index ? 100 : 20) + (mode === 'preview' ? 80 : 0);
        const expected = stat === 'armor' ? Object.values(entity.armorLayers.stuff).reduce((sum, pool) => sum + pool.current, 0)
          : R.getEquipmentResourceCurrent(entity, stat, stat === 'shift' ? percent : undefined);
        if (reserves.length !== 1 || reserves[0].value !== expected) throw Error(`${mode}/${stat}/entity${index}: source ${JSON.stringify(reserves)} != ${expected}`);
        if (stat === 'shift') {
          const item = S.getEquippedItemById(entity.stuff.slot1[0]);
          const max = Math.round(item.Stuffeffets.find(effect => effect.stat === 'shift').value.max * (1 + percent / 100));
          if (equipment.find(source => source.movementKind === 'max')?.value !== max) throw Error('Swap source has stale maximum or missing preview');
          if (totals.filter(source => source.movementKind === 'max').reduce((sum, source) => sum + source.value, 0) !== display.shiftMax) throw Error('Swapped max sources do not sum to capacity');
        }
        if (mode === 'preview' && view.modifierStats.preview?.statLeveled.weaponOrfevre !== 80) throw Error('Swap lost the Level up projection');
        if (before !== JSON.stringify({ actors, drafts, items: S.loadEquippedItems() })) throw Error('Swap helper mutated real or preview state');
        return expected;
      },
    };
  });
  for (const context of ['map', 'combat']) for (const mode of ['stats', 'level-up', 'preview']) {
    for (const stat of ['shift', 'armor', 'fadedLife', 'extraLife', 'eternalLife']) {
      await page.evaluate(({ context, mode, stat }) => window.__swapSources.setup(context, mode, stat), { context, mode, stat });
      for (const index of [0, 1]) {
        await page.evaluate(async () => (await import("/js/ui/statistics/helpers.js")).closeOpenHelpers());
        await page.locator(`#swap-source-${971900 + index} .stat-container`).click();
        await page.locator('[data-umbra-pinned="true"] [data-helper-source="equipment"]').hover();
        await page.evaluate(() => window.__swapSources.swap());
        for (const owner of [0, 1]) await page.evaluate(owner => window.__swapSources.inspect(owner), owner);
        const expected = await page.evaluate(index => window.__swapSources.inspect(index), index);
        await page.waitForFunction(({ stat, expected }) => {
          const figures = [...document.querySelectorAll(`[data-umbra-detail] .helper-figure[data-helper-stat="${stat}"]`)];
          return figures.length && Number(figures.at(-1).textContent.replace(/\s/g, '')) === expected;
        }, { stat, expected });
        if (stat === 'shift') {
          const sourceText = await page.locator('[data-umbra-detail]').innerText();
          assert.doesNotMatch(sourceText, /Déplacements max/); assert.match(sourceText, /Déplacements sup\./);
          assert.equal(await page.locator('[data-umbra-pinned="true"] [data-helper-source="fixed"]').count(), 1, 'Swapped maximum keeps its stat family');
          if (mode === 'preview' && index === 0) {
            await page.waitForFunction(() => [...document.querySelectorAll('.stat-hover')].every(node => Number(getComputedStyle(node).opacity) > .99));
            await page.screenshot({ path: resolve(output, `swapped-sources-${context}-preview.png`) });
          }
        }
        report.checks.push(`${context}/${mode}/${stat}/swap${index}: both owners' sources refresh, open detail follows swap, raw reserves and recharge clocks survive reload`);
        await page.keyboard.press('Escape');
      }
    }
  }
  report.count = report.checks.length;
  await page.screenshot({ path: resolve(output, 'live-combat-equipment.png') });
  report.ui = 'Movement labels, efficiency, previews; real-time combat equipment reserves and pinned helpers; desktop and mobile';
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  await new Promise(done => server.close(done));
}
