import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('docs');
const output = resolve('outputs/lives');
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
    const R = await import('/js/items/resourceStocks.js');
    const S = await import("/js/storage/gameStorage.js");
    const U = await import("/js/storage/entityStorage.js");
    const A = await import("/js/combat/vitals.js");
    const G = await import("/js/app/stages.js");
    const I = await import('/js/items/itemEffectMecanics.js');
    const Armor = await import('/js/items/armor.js');
    const D = await import("/js/ui/statistics/details.js");
    const P = await import("/js/entities/progression.js");
    const Q = await import('/js/procedural/proc-bareme.js');
    const checks = [];
    const check = (yes, message) => { if (!yes) throw Error(message); checks.push(message); };
    const equal = (a, b, msg) => check(a === b, `${msg}: ${a} = ${b}`);
    let id = 960000;
    const fixture = (stats = {}) => ({ id: ++id, name: 'Lives audit', type: 'sbire', side: 'A', awakening: 1,
      level: { current: 1, max: 250 }, attacks: ['autoAttack'], baseStats: { HP: 20, charge: 8, ...stats }, stats: {}, stuff: {}, statut: ['alive'] });
    const gear = (id, key, count, days) => ({ itemId: `i-lives-${id}`, equippedId: `ei-lives-${id}`, serial: 'i51', itemType: ['stuff'],
      itemAsset: './media/assets/items/cursed-skull.png', displayName: 'Lives audit',
      Stuffeffets: [{ type: 'stat-buff', stat: key, value: count, ...(days ? { rechargeDays: days } : {}) }] });
    const one = gear('z', 'extraLife', 2, 6), two = gear('a', 'extraLife', 1, 3);
    const eternal = gear('eternal', 'eternalLife', 3), faded = gear('faded', 'fadedLife', 2);
    let equipment = [one, two, eternal, faded];
    const persist = entity => {
      equipment = R.applyResourceStocksToEquippedItems(entity, equipment);
      S.saveToLocalStorage('equippedItems', equipment);
      S.saveToLocalStorage('selectedArmyA', [entity]);
      S.saveToLocalStorage('PlayerSave', { equippedItems: equipment });
      S.saveToLocalStorage('IngameItemsData', { equippedItems: equipment });
    };
    const recompute = entity => E.recomputeEntityStats(entity, { equippedItems: equipment, persistEquipment: false, skipReverseArchetype: true });
    localStorage.setItem('gameDay', '1');
    const entity = fixture({ extraLife: 2, eternalLife: 2, fadedLife: 1 });
    recompute(entity);
    equal(entity.stats.extraLife.current, 2, 'Native extra lives ready');
    equal(entity.stats.eternalLife.max, 2, 'Native absolute lives stack');
    entity.stuff.slot1 = [one.equippedId]; entity.stuff.slot2 = [two.equippedId];
    entity.stuff.slot3 = [eternal.equippedId]; entity.stuff.slot4 = [faded.equippedId];
    recompute(entity); persist(entity);
    equal(entity.stats.extraLife.max, 5, 'Extra capacity adds equipment exactly once');
    equal(entity.stats.extraLife.current, 5, 'Gear provides ready lives');
    equal(entity.stats.eternalLife.max, 5, 'Absolute 2 plus 3');
    equal(entity.stats.eternalLife.current, 5, 'All absolute lives ready');
    equal(entity.stats.fadedLife, 3, 'Natural and equipped faded lives');
    for (let i = 0; i < 3; i++) recompute(entity);
    equal(entity.stats.extraLife.max, 5, 'Recompute cannot duplicate lives');
    R.addFadedLife(entity, 2, 'consumable'); R.addFadedLife(entity, 1, 'spell');
    equal(entity.stats.fadedLife, 6, 'Categories sum');
    for (let i = 0; i < 2; i++) check(R.consumeFadedLife(entity), 'Consume consumable faded');
    equal(R.getEquipmentResourceCurrent(entity, 'fadedLife'), 2, 'Consumables before equipment');
    check(R.consumeFadedLife(entity), 'Consume equipment faded');
    equal(R.getEquipmentResourceCurrent(entity, 'fadedLife'), 1, 'Finite item stock decremented');
    equal(entity.resourceStocks.fadedLife.spell, 1, 'Spell kept before equipment depleted');
    R.consumeFadedLife(entity); R.consumeFadedLife(entity);
    equal(entity.resourceStocks.fadedLife.spell, 0, 'Spell after equipment');
    equal(entity.resourceStocks.fadedLife.natural, 1, 'Natural last');
    R.consumeFadedLife(entity); persist(entity); recompute(entity);
    equal(entity.stats.fadedLife, undefined, 'Depleted faded lives stay depleted');
    check(A.extraLifeConsumption(entity), 'Consume extra life');
    equal(entity.resourceStocks.extraLife.stuff[one.equippedId].current, 1, 'Slot 1 before lower item ID');
    equal(entity.extraLifeRegen['001'].currentRegen, 3, 'Equipment before natural at same ready date');
    check(A.extraLifeConsumption(entity), 'Second equipment life consumed');
    check(A.extraLifeConsumption(entity), 'Next slot consumed');
    equal(entity.stats.extraLife.current, 2, 'Only natural lives left');
    check(A.extraLifeConsumption(entity), 'Natural life consumed');
    persist(entity);
    G.bumpExtraLifeRegenInStorage(1, 2);
    Object.assign(entity, S.loadFromLocalStorage('selectedArmyA', [])[0]);
    equipment = S.loadEquippedItems();
    equal(entity.resourceStocks.extraLife.stuff[one.equippedId].regen['001'].currentRegen, 1, 'Equipment timer advances');
    equal(entity.resourceStocks.extraLife.stuff[one.equippedId].regen['002'].currentRegen, 1, 'Same item timers advance in parallel');
    equal(entity.resourceStocks.extraLife.stuff[two.equippedId].regen['001'].currentRegen, 1, 'Other item advances in parallel');
    equal(entity.extraLifeRegen['001'].currentRegen, 1, 'Natural timer advances in parallel');
    G.bumpExtraLifeRegenInStorage(1, 2);
    equal(S.loadFromLocalStorage('selectedArmyA', [])[0].extraLifeRegen['001'].currentRegen, 1, 'Same day never recharges twice');
    check(A.eternalLifeConsumption(entity), 'Consume absolute life');
    equal(entity.stats.eternalLife.current, 4, 'Absolute consumes just one of five');
    equal(entity.resourceStocks.eternalLife.stuff[eternal.equippedId].current, 2, 'Absolute consumes gear before base');
    equal(entity.eternalLifeRegen['001'].currentRegen, 1, 'Native absolute preserved');
    persist(entity);
    G.bumpEternalLifeRegenInStorage(1, 2);
    Object.assign(entity, S.loadFromLocalStorage('selectedArmyA', [])[0]); equipment = S.loadEquippedItems();
    equal(entity.stats.eternalLife.current, 5, 'Absolute gear restores after one day');
    const savedTimer = entity.resourceStocks.extraLife.stuff[one.equippedId].regen['001'].currentRegen;
    delete entity.stuff.slot1; recompute(entity); persist(entity);
    equal(entity.stats.extraLife.max, 3, 'Unequip removes own capacity');
    localStorage.setItem('gameDay', '10');
    G.bumpExtraLifeRegenInStorage(8, 10); equipment = S.loadEquippedItems();
    equal(equipment.find(item => item.equippedId === one.equippedId).resourceStocks.extraLife.regen['001'].currentRegen, savedTimer, 'Unequipped timer paused');
    const recipient = fixture(); recompute(recipient); recipient.stuff.slot1 = [one.equippedId]; recompute(recipient); persist(recipient);
    equal(recipient.stats.extraLife.current, 0, 'Transfer does not refill');
    equal(recipient.resourceStocks.extraLife.stuff[one.equippedId].regen['001'].currentRegen, savedTimer, 'Transfer keeps progress');
    G.bumpExtraLifeRegenInStorage(1, 11);
    Object.assign(recipient, S.loadFromLocalStorage('selectedArmyA', [])[0]); equipment = S.loadEquippedItems();
    equal(recipient.resourceStocks.extraLife.stuff[one.equippedId].regen['001'].currentRegen, savedTimer + 1, 'Transfer resumes next day');
    recipient.stats.HP.current = 0; recipient.statut = ['dead']; persist(recipient);
    G.bumpExtraLifeRegenInStorage(2, 13);
    const dead = S.loadFromLocalStorage('selectedArmyA', [])[0];
    equal(dead.resourceStocks.extraLife.stuff[one.equippedId].regen['001'].currentRegen, savedTimer + 1, 'Dead owner pauses gear recharge');
    recipient.stats.HP.current = 20; recipient.statut = ['alive'];
    for (const [name, field] of [['itemExtraLife', 'ExtraLifeAmount'], ['itemEternalLife', 'EternalLifeAmount']]) {
      const item = { effets: [name], [field]: 2 };
      check(I.validateConsumableUse(recipient, item).ok, 'Convertible consumable accepted');
      check((await I.itemApplyEffect(recipient, name, item, { feedback: [] })).ok, 'Convertible consumable applied');
    }
    equal(recipient.stats.fadedLife, 4, 'Both rechargeable consumables convert to faded');
    equal(recipient.stats.eternalLife, undefined, 'Consumable does not grant rechargeable absolute');
    const protectedEntity = fixture({ fadedLife: 1, transcendenceTotal: 100 }); recompute(protectedEntity); persist(protectedEntity);
    protectedEntity.stats.HP.current = 0;
    check(A.attemptExtraLife(protectedEntity, { pool: 'fadedLife' }), 'Protected resurrection succeeds');
    equal(protectedEntity.stats.fadedLife, 1, 'Protection preserves life');
    equal(protectedEntity.resourceStocks.fadedLife.natural, 1, 'Protection preserves category');
    for (const key of ['extraLife', 'eternalLife']) {
      const guarded = fixture({ [key]: 1, transcendenceTotal: 100 }); recompute(guarded); persist(guarded);
      const before = JSON.stringify(guarded[`${key}Regen`]); guarded.stats.HP.current = 0;
      check(A.attemptExtraLife(guarded, { pool: key }), `${key} protected resurrection`);
      equal(guarded.stats[key].current, 1, `${key} protected current unchanged`);
      equal(JSON.stringify(guarded[`${key}Regen`]), before, `${key} protected timer unchanged`);
    }
    localStorage.setItem('gameDay', '20');
    const old = fixture({ extraLife: 1 }); equipment = [gear('age', 'extraLife', 1, 6)]; recompute(old);
    localStorage.setItem('gameDay', '21'); old.stuff.slot1 = [equipment[0].equippedId]; recompute(old); persist(old);
    check(A.extraLifeConsumption(old), 'Oldest-ready life consumed');
    equal(old.extraLifeRegen['001'].currentRegen, 0, 'Older natural life before newer equipment');
    equal(R.getEquipmentResourceCurrent(old, 'extraLife'), 1, 'Newer equipment was not consumed');
    R.advanceLifeRegen(old, 'extraLife', 3, 24, true);
    equal(old.extraLifeRegen['001'].readySince, 24, 'Batched days preserve actual readiness date');
    check(A.extraLifeConsumption(old), 'Equipment now oldest ready');
    equal(R.getEquipmentResourceCurrent(old, 'extraLife'), 0, 'Previously ready gear before newly restored native');
    old.resourceStocks.extraLife.stuff[equipment[0].equippedId].lastUpdate = 24;
    const frozen = JSON.stringify({ stats: old.stats, stocks: old.resourceStocks, regen: old.extraLifeRegen });
    old.modifierStats.preview = { statLeveled: { extraLife: 2 } }; P.ComputeStatPreview(old);
    equal(D.calculateStatsDisplay('extraLife', old).extraLifeMax, 4, 'Preview adds native capacity to equipment');
    equal(JSON.stringify({ stats: old.stats, stocks: old.resourceStocks, regen: old.extraLifeRegen }), frozen, 'Preview never refills any life');
    delete old.modifierStats.preview;
    old.baseStats.weaponOrfevre = 100; recompute(old);
    equal(old.stats.extraLife.max, 2, 'Orfevre cannot duplicate rechargeable equipment lives');
    old.level.current = 2; old.experience = 100;
    const resetState = JSON.stringify(old.resourceStocks);
    const reset = P.previewEntityReset(old);
    check(reset.ok, 'Rechargeable life reset can be previewed');
    equal(JSON.stringify(reset.projection.resourceStocks.extraLife.stuff), JSON.stringify(old.resourceStocks.extraLife.stuff), 'Reset never refills rechargeable equipment');
    equal(JSON.stringify(old.resourceStocks), resetState, 'Reset preview leaves real life stocks untouched');
    const fadedCategory = fixture({ fadedLife: 2 }); recompute(fadedCategory);
    R.addFadedLife(fadedCategory, 3, 'consumable'); R.addFadedLife(fadedCategory, 4, 'spell');
    const sources = D.getStatisticSourceTotals(fadedCategory, 'fadedLife', D.calculateStatsDisplay('fadedLife', fadedCategory));
    equal(sources.reduce((sum, source) => sum + source.value, 0), 9, 'Faded source totals reconcile');
    check(sources.some(source => source.category === 'consumable' && source.value === 3), 'Consumable source visible');
    const armor = fixture({ armor: 5 }); const armorGear = gear('armor', 'armor', 4); equipment = [armorGear];
    armor.stuff.slot1 = [armorGear.equippedId]; recompute(armor);
    Armor.grantEntityExternalArmor(armor, 2, 'consumable'); Armor.grantEntityExternalArmor(armor, 3, 'spell');
    equal(armor.stats.armor.current, 14, 'Armor categories sum');
    recompute(armor);
    equal(armor.stats.armor.current, 14, 'Recompute preserves armor categories');
    Armor.consumeEntityArmor(armor, 2);
    equal(armor.armorLayers.stuff[armorGear.equippedId].current, 4, 'Armor consumable before stuff');
    Armor.consumeEntityArmor(armor, 4);
    equal(armor.armorLayers.spell.current, 3, 'Armor stuff before spell');
    Armor.consumeEntityArmor(armor, 3);
    equal(armor.armorLayers.external.current, 5, 'Armor natural last');
    const shiftGear = gear('shift', 'shift', { current: 2 }); equipment = [shiftGear];
    const mover = fixture({ shift: { current: 5, max: 10 } }); mover.stuff.slot1 = [shiftGear.equippedId]; recompute(mover);
    R.addMovementCharges(mover, 3); R.addMovementCharges(mover, 4, 'spell');
    R.spendMovementCharges(mover, 3); equal(R.getEquipmentResourceCurrent(mover, 'shift'), 2, 'Movement consumable first');
    R.spendMovementCharges(mover, 2); equal(mover.resourceStocks.shift.spell, 4, 'Movement equipment before spell');
    R.spendMovementCharges(mover, 4); equal(R.getNaturalMovementCurrent(mover), 5, 'Movement natural last');
    const { ItemDetails } = await import('/js/data/itemList.js');
    for (const name of ['FadedLifeCharge', 'FadedLifeCharges', 'DevFadedLifeReserve', 'DevExtraLifeThreeDays',
      'DevExtraLifeSixDays', 'DevExtraLifeDouble', 'DevAbsoluteLifeTwo', 'DevAbsoluteLifeThree', 'DevMixedLives',
      'DevExtraLifeConsumable', 'DevAbsoluteLifeConsumable']) {
      const item = ItemDetails.find(item => item.functionName === name);
      check(Boolean(item), `${name} available in catalog`);
      if (item.itemType.includes('consumable')) check(I.hasImplementedConsumableEffects(item), `${name} effect supported`);
      const details = Q.evaluateItemPower(item).details;
      for (const stat of ['extraLife', 'eternalLife']) {
        const entries = details.filter(row => row.stat === stat && row.unit !== 'premium');
        check(entries.length <= 1, `${name} ${stat} not priced twice`);
      }
    }
    return { checks, count: checks.length };
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.evaluate(async () => {
    const E = await import("/js/entities/runtime.js"); const S = await import("/js/storage/gameStorage.js");
    const UI = await Promise.all([import("/js/ui/application.js"), import("/js/ui/attacks.js"), import("/js/ui/codex/index.js"), import("/js/ui/codex/profile.js"), import("/js/ui/codex/stats.js"), import("/js/ui/dialogue.js"), import("/js/ui/display.js"), import("/js/ui/drag.js"), import("/js/ui/essences.js"), import("/js/ui/inventory.js"), import("/js/ui/navigation.js"), import("/js/ui/statistics/components.js"), import("/js/ui/statistics/details.js"), import("/js/ui/statistics/helpers.js")]).then(parts => Object.defineProperties({}, Object.fromEntries(parts.flatMap(part => Object.keys(part).map(key => [key, { enumerable: true, get: () => part[key] }]))))); const M = await import('/js/items/itemManager.js');
    const Gear = await import('/js/items/equipement.js'); const A = await import("/js/combat/vitals.js"), _A = await import("/js/rendering/vitalFeedback.js");
    const { ItemDetails } = await import('/js/data/itemList.js');
    window.levelRunning = 'worldmap'; S.setAdminMode(true);
    const entity = structuredClone(E.entitesNestUp[0]);
    Object.assign(entity, { id: 971222, side: 'A', awakening: 1, level: { current: 1, max: 250 },
      baseStats: { HP: 100, charge: 8 }, stats: {}, modifierStats: {}, stuff: {} });
    E.recomputeEntityStats(entity, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
    S.saveToLocalStorage('equippedItems', []); S.saveToLocalStorage('selectedArmyA', [entity]);
    S.saveToLocalStorage('PlayerSave', { Playerinventory: [], equippedItems: [] });
    S.saveToLocalStorage('IngameItemsData', { Playerinventory: [], equippedItems: [] });
    const host = document.createElement('main'); host.id = 'lives-audit';
    host.style.cssText = 'position:fixed;inset:8px;overflow:auto;background:#240000;z-index:10'; document.body.append(host);
    UI.createCodexEntityScan(entity, host, `codex-entity_${entity.id}`);
    host.querySelector('.codex-inner-menu:has(.codex-stat)').click();
    if (host.querySelector('.picto-extralife')) throw Error('Unexpected native life menu');
    const item = M.acquireItem(ItemDetails.find(item => item.functionName === 'DevExtraLifeDouble'), 'lives-audit');
    if (!Gear.equip({ item, targetEntity: entity, slotId: `slot1-${entity.id}` })) throw Error('Equipment failed');
    const menu = host.querySelector('.picto-extralife');
    if (!menu) throw Error('Equipping must immediately create resurrection tab');
    menu.click();
    if (host.querySelectorAll('.submenu-resurrections .ex-slot--equipment').length !== 2) throw Error('Equipment-only lives missing');
    A.extraLifeConsumption(entity); _A.updateBonusLifeCounters(entity);
    if (host.querySelectorAll('.submenu-resurrections .ex-slot--progress').length !== 1) throw Error('Consumed slot must update');
    A.extraLifeConsumption(entity); _A.updateBonusLifeCounters(entity);
    if (host.querySelectorAll('.submenu-resurrections .ex-slot--progress').length !== 2) throw Error('Empty equipment lives must stay visible');
    Gear.unequip({ slotId: `slot1-${entity.id}`, targetEntity: entity });
    if (host.querySelector('.picto-extralife')) throw Error('Unequip must remove unavailable capability');
    const stored = M.getIngameItemById(item.itemId);
    if (stored.resourceStocks.extraLife.current !== 0) throw Error('Unequip must retain exhausted life stock');
    Gear.equip({ item: stored, targetEntity: entity, slotId: `slot1-${entity.id}` });
    if (entity.stats.extraLife.current !== 0) throw Error('Reequip must not refill');
    const recipient = structuredClone(entity);
    Object.assign(recipient, { id: 971223, stats: {}, modifierStats: {}, stuff: {}, resourceStocks: {} });
    delete recipient.extraLifeRegen; delete recipient.eternalLifeRegen;
    E.recomputeEntityStats(recipient, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
    S.saveToLocalStorage('selectedArmyA', [entity, recipient]);
    const second = M.acquireItem(ItemDetails.find(item => item.functionName === 'DevExtraLifeThreeDays'), 'lives-swap');
    if (!Gear.equip({ item: second, targetEntity: recipient, slotId: `slot1-${recipient.id}` })) throw Error('Recipient equip failed');
    A.extraLifeConsumption(recipient);
    const R = await import('/js/items/resourceStocks.js');
    const U = await import("/js/storage/entityStorage.js");
    const day = Number(localStorage.getItem('gameDay')) || 1;
    R.advanceLifeRegen(recipient, 'extraLife', 1, day + 1, true);
    localStorage.setItem('gameDay', String(day + 1));
    U.persistEquippedResourceStocks(recipient);
    const firstId = `e${item.itemId}`, secondId = `e${second.itemId}`;
    const firstTimers = JSON.stringify(entity.resourceStocks.extraLife.stuff[firstId].regen);
    const secondTimers = JSON.stringify(recipient.resourceStocks.extraLife.stuff[secondId].regen);
    if (!Gear.equip({ item: S.getEquippedItemById(firstId), sourceEntity: entity,
      targetEntity: recipient, slotId: `slot1-${recipient.id}` })) throw Error('Life gear swap failed');
    if (entity.stats.extraLife.max !== 1 || recipient.stats.extraLife.max !== 2) throw Error('Swapped capacities are incorrect');
    if (JSON.stringify(entity.resourceStocks.extraLife.stuff[secondId].regen) !== secondTimers
      || JSON.stringify(recipient.resourceStocks.extraLife.stuff[firstId].regen) !== firstTimers) throw Error('Swap changed life timers');
    const reloaded = S.loadFromLocalStorage('selectedArmyA', []);
    for (const owner of [entity, recipient]) {
      const saved = reloaded.find(entry => entry.id === owner.id);
      if (JSON.stringify(saved.resourceStocks) !== JSON.stringify(owner.resourceStocks)) throw Error('Saved life stocks differ');
      E.recomputeEntityStats(saved, { equippedItems: S.loadEquippedItems(), persistEquipment: false, skipReverseArchetype: true });
      if (saved.stats.extraLife.current !== 0) throw Error('Reload restored an unfinished life');
    }
    if (!Gear.equip({ item: S.getEquippedItemById(firstId), sourceEntity: recipient,
      targetEntity: entity, slotId: `slot1-${entity.id}` })) throw Error('Return life swap failed');
    if (JSON.stringify(entity.resourceStocks.extraLife.stuff[firstId].regen) !== firstTimers) throw Error('Return swap changed timers');
    const eternal = M.acquireItem(ItemDetails.find(item => item.functionName === 'DevAbsoluteLifeTwo'), 'lives-audit');
    Gear.equip({ item: eternal, targetEntity: entity, slotId: `slot2-${entity.id}` });
    host.querySelector('.picto-extralife').click();
    if (host.querySelectorAll('.resu-block--eternal .ex-slot').length !== 2) throw Error('Absolute must show each equipment life');
    if (host.querySelectorAll('.ex-slot--next').length !== 1) throw Error('Exactly one next life');
    const view = host.querySelector('.submenu-resurrections');
    host.replaceChildren(view);
    host.style.cssText = 'position:fixed;top:8px;left:8px;bottom:8px;width:min(360px,calc(100vw - 16px));overflow:auto;background:#240000;z-index:10';
    view.style.cssText = 'position:static;width:100%;box-sizing:border-box';
    window.__livesUI = { entity, item: S.getEquippedItemById(`e${item.itemId}`), UI, M };
  });
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const view = page.locator('#lives-audit .submenu-resurrections');
    await view.waitFor({ state: 'visible' });
    assert.equal(await view.locator('.ex-slot').count(), 4);
    const bounds = await view.boundingBox();
    for (const slot of await view.locator('.ex-slot').all()) {
      const box = await slot.boundingBox();
      assert.ok(box.x >= bounds.x - 1 && box.x + box.width <= bounds.x + bounds.width + 1, 'Life slot fits column');
    }
    await page.screenshot({ path: resolve(output, `resurrection-${width}.png`) });
    await page.mouse.move(width - 2, 2);
    await view.locator('.resu-block--extra .ex-slot').first().hover();
    const helper = page.locator('.stat-hover').filter({ hasText: 'Recharge : ' }).last();
    await helper.waitFor({ state: 'visible' });
    await page.waitForFunction(() => [...document.querySelectorAll('.stat-hover')]
      .some(node => node.textContent.includes('Recharge : ') && Number(getComputedStyle(node).opacity) > 0.99));
    assert.match(await helper.innerText(), /0\/6\s*j/);
    assert.match(await helper.innerText(), /Source : Équipement/);
    const box = await helper.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= width + 1, 'Life helper within window');
    await page.screenshot({ path: resolve(output, `life-helper-${width}.png`) });
    await page.evaluate(() => window.__livesUI.UI.closeOpenHelpers());
    await page.evaluate(() => {
      const { M, item } = window.__livesUI;
      let anchor = document.getElementById('life-item-anchor');
      if (!anchor) { anchor = document.createElement('button'); anchor.id = 'life-item-anchor';
        anchor.style.cssText = 'position:fixed;right:8px;bottom:8px;width:20px;height:20px'; document.body.append(anchor); }
      M.createItemDescription(item, item.equippedId, anchor, { persistent: true });
    });
    const itemHelper = page.locator('.item-description-card').last();
    await itemHelper.waitFor({ state: 'visible' });
    const lifeRows = itemHelper.locator('.stuff-stat-row[data-stat="extraLife"]');
    assert.equal(await lifeRows.count(), 2, 'One row for each rechargeable life');
    assert.deepEqual(await lifeRows.locator('.stuff-stat-effective').allTextContents(), ['0/6 j', '0/6 j']);
    assert.equal(await itemHelper.locator('.life-equipment-source').count(), 0, 'No equipment notice below life rows');
    assert.ok(await lifeRows.evaluateAll(rows => rows.every(node => node.classList.contains('stuff-stat-resource-empty'))));
    const itemBox = await itemHelper.boundingBox();
    assert.ok(itemBox.x >= 0 && itemBox.y >= 0 && itemBox.x + itemBox.width <= width + 1 && itemBox.y + itemBox.height <= 901, 'Equipment helper within window');
    await page.screenshot({ path: resolve(output, `equipment-helper-${width}.png`) });
    await page.evaluate(() => window.__livesUI.M.clearItemDescriptions());
  }
  const perLifeChecks = await page.evaluate(async () => {
    const E = await import("/js/entities/runtime.js"), S = await import("/js/storage/gameStorage.js");
    const M = await import('/js/items/itemManager.js'), UI = await Promise.all([import("/js/ui/application.js"), import("/js/ui/attacks.js"), import("/js/ui/codex/index.js"), import("/js/ui/codex/profile.js"), import("/js/ui/codex/stats.js"), import("/js/ui/dialogue.js"), import("/js/ui/display.js"), import("/js/ui/drag.js"), import("/js/ui/essences.js"), import("/js/ui/inventory.js"), import("/js/ui/navigation.js"), import("/js/ui/statistics/components.js"), import("/js/ui/statistics/details.js"), import("/js/ui/statistics/helpers.js")]).then(parts => Object.defineProperties({}, Object.fromEntries(parts.flatMap(part => Object.keys(part).map(key => [key, { enumerable: true, get: () => part[key] }])))));
    const Gear = await import('/js/items/equipement.js'), R = await import('/js/items/resourceStocks.js');
    const Store = await import("/js/storage/entityStorage.js");
    const { ItemDetails } = await import('/js/data/itemList.js');
    UI.closeOpenHelpers(); M.clearItemDescriptions();
    document.getElementById('lives-audit')?.remove();
    const checks = [];
    const check = (ok, text) => { if (!ok) throw Error(text); checks.push(text); };
    const owners = [971231, 971232].map(id => {
      const entity = { id, name: `Life row ${id}`, type: 'sbire', side: 'A', awakening: 1,
        level: { current: 1, max: 250 }, baseStats: { HP: 100, charge: 3 }, stats: {}, stuff: {}, statut: ['alive'] };
      E.recomputeEntityStats(entity, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
      return entity;
    });
    S.saveToLocalStorage('selectedArmyA', owners); S.saveToLocalStorage('equippedItems', []);
    S.saveToLocalStorage('PlayerSave', { Playerinventory: [], equippedItems: [] });
    S.saveToLocalStorage('IngameItemsData', { Playerinventory: [], equippedItems: [] });
    const effect = (stat, value, rechargeDays) => ({ type: 'stat-buff', stat, value, rechargeDays });
    const mixedDefinition = { ...structuredClone(ItemDetails.find(item => item.functionName === 'DevExtraLifeThreeDays')),
      serial: 'i-life-row-audit', displayName: 'Vies panachees', Stuffeffets: [effect('fadedLife', 5), effect('extraLife', 1, 6),
        effect('eternalLife', 2), effect('extraLife', 1, 2), effect('extraLife', 1, 6)] };
    ItemDetails.push(mixedDefinition);
    const otherItem = M.acquireItem(ItemDetails.find(item => item.functionName === 'DevAbsoluteLifeTwo'), 'life-row-audit');
    check(Gear.equip({ item: otherItem, targetEntity: owners[1], slotId: `slot1-${owners[1].id}` }), 'Recipient slot occupied for a real equipment swap');
    const mixed = M.acquireItem(mixedDefinition, 'life-row-audit');
    check(Gear.equip({ item: mixed, targetEntity: owners[0], slotId: `slot1-${owners[0].id}` }), 'Mixed life gear equipped');
    const equippedId = owners[0].stuff.slot1[0];
    const item = S.getEquippedItemById(equippedId);
    const stocksBefore = JSON.stringify(item.resourceStocks);
    const anchor = document.getElementById('life-item-anchor');
    anchor.style.cssText = 'position:fixed;left:30px;top:30px;width:20px;height:20px';
    M.pinItemDescription(item, equippedId, anchor);
    const card = document.querySelector(`.item-description-card[data-item-id="${equippedId}"]`);
    const rows = () => [...card.querySelectorAll('.stuff-stat-row')];
    const signature = () => rows().map(row => `${row.dataset.stat}/${row.dataset.resourceLifeId || ''}/${row.querySelector('.stuff-stat-effective').textContent}`);
    const expected = ['eternalLife/001/1 j', 'eternalLife/002/1 j', 'extraLife/002/2 j',
      'extraLife/001/6 j', 'extraLife/003/6 j', 'fadedLife//5'];
    const rowOrder = () => rows().map(row => `${row.dataset.stat}/${row.dataset.resourceLifeId || ''}`);
    const initialOrder = JSON.stringify(rowOrder());
    const checkRows = (values, message) => {
      check(card.isConnected && document.querySelector(`.item-description-card[data-item-id="${equippedId}"]`) === card, 'Same equipment helper stays open');
      check(JSON.stringify(rowOrder()) === initialOrder, 'Life row order stays fixed by type, duration and identity');
      check(JSON.stringify(rows().map(row => row.querySelector('.stuff-stat-effective').textContent)) === JSON.stringify(values), message);
    };
    check(JSON.stringify(signature()) === JSON.stringify(expected), `Type priority then ascending duration, including equal-duration lives: ${JSON.stringify(signature())}`);
    check(rows().filter(row => row.dataset.resourceLifeId).every(row => !row.querySelector('.entite-stat').textContent.includes('/')), 'Rechargeable lives show days instead of quantities');
    check(!card.querySelector('.life-equipment-source, .stat-lore'), 'Life notices removed, including Faded Life');
    check(JSON.stringify(S.getEquippedItemById(equippedId).resourceStocks) === stocksBefore, 'Display sorting does not reorder saved timers');
    const lifeRow = () => card.querySelector('.stuff-stat-row[data-stat="extraLife"][data-resource-life-id="003"]');
    lifeRow().dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    const helper = [...document.querySelectorAll('.stat-hover')].find(node => node._helperHost === lifeRow());
    check(Boolean(helper), 'Third life sub-helper opens independently');
    const assertHelper = (text, owner = owners[0]) => {
      check(helper.isConnected && helper._helperHost === lifeRow(), 'Open sub-helper stays on life 003 rather than the first same-stat row');
      check(helper.textContent.includes(text), `Life 003 status: ${text}`);
      check(helper.dataset.entityId === String(owner.id), 'Open life sub-helper follows current owner');
    };
    for (let i = 0; i < 3; i++) {
      R.consumeRechargeableLife(owners[0], 'extraLife'); Store.saveEntityLifePoolToStorage(owners[0], 'extraLife');
      assertHelper(i < 2 ? 'Disponible.' : 'Disponible dans 6 j');
    }
    checkRows(['1 j', '1 j', '0/2 j', '0/6 j', '0/6 j', '5'], 'Spent lives immediately show zero recharge progress');
    check(lifeRow().classList.contains('stuff-stat-resource-empty'), 'Only spent life lines become gray');
    check(rows().filter(row => row.dataset.stat === 'eternalLife').every(row => !row.classList.contains('stuff-stat-resource-empty')), 'Ready Eternal Life lines remain active');
    R.consumeRechargeableLife(owners[0], 'eternalLife'); Store.saveEntityLifePoolToStorage(owners[0], 'eternalLife');
    checkRows(['0/1 j', '1 j', '0/2 j', '0/6 j', '0/6 j', '5'], 'Eternal Life also shows individual recharge progress');
    const day = Number(localStorage.getItem('gameDay')) || 1;
    R.advanceLifeRegen(owners[0], 'extraLife', 2, day + 2, true);
    R.advanceLifeRegen(owners[0], 'eternalLife', 2, day + 2, true);
    localStorage.setItem('gameDay', String(day + 2)); Store.persistEquippedResourceStocks(owners[0]);
    assertHelper('Disponible dans 4 j');
    check(!card.querySelector('[data-stat="extraLife"][data-resource-life-id="002"]').classList.contains('stuff-stat-resource-empty'), 'Shortest life reactivates independently');
    checkRows(['1 j', '1 j', '2 j', '2/6 j', '2/6 j', '5'], 'Recharge progress updates in place; ready lives show their duration only');
    const timers = () => ['extraLife', 'eternalLife'].map(key => S.getEquippedItemById(equippedId).resourceStocks[key].regen);
    const beforeSwap = JSON.stringify(timers());
    check(Gear.equip({ item: S.getEquippedItemById(equippedId), sourceEntity: owners[0],
      targetEntity: owners[1], slotId: `slot1-${owners[1].id}` }), 'Partly recharging gear transfers');
    assertHelper('Disponible dans 4 j', owners[1]);
    check(JSON.stringify(timers()) === beforeSwap, 'Transfer preserves each life timer');
    checkRows(['1 j', '1 j', '2 j', '2/6 j', '2/6 j', '5'], 'Swap preserves progress on every line');
    check(owners[0].stuff.slot1[0] === `e${otherItem.itemId}`, 'Other equipment moves to the original owner');
    R.advanceLifeRegen(owners[1], 'extraLife', 1, day + 3, true);
    localStorage.setItem('gameDay', String(day + 3)); Store.persistEquippedResourceStocks(owners[1]);
    assertHelper('Disponible dans 3 j', owners[1]);
    checkRows(['1 j', '1 j', '2 j', '3/6 j', '3/6 j', '5'], 'Same open helper keeps updating on the new owner');
    const beforeReturn = JSON.stringify(timers());
    check(Gear.equip({ item: S.getEquippedItemById(equippedId), sourceEntity: owners[1],
      targetEntity: owners[0], slotId: `slot1-${owners[0].id}` }), 'Equipment swaps back while helpers stay open');
    assertHelper('Disponible dans 3 j');
    check(JSON.stringify(timers()) === beforeReturn, 'Return swap preserves each life timer');
    checkRows(['1 j', '1 j', '2 j', '3/6 j', '3/6 j', '5'], 'Return swap preserves progress and order');
    helper.remove();
    window.__perLifeAudit = { card, anchor, M, UI };
    return checks;
  });
  report.checks.push(...perLifeChecks);
  report.count = report.checks.length;
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => {
      const { card, anchor } = window.__perLifeAudit;
      window.dispatchEvent(new Event('resize'));
      anchor.scrollIntoView();
      card.scrollTop = 0;
    });
    const card = page.locator('.item-description-card');
    const bounds = await card.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1, 'Mixed life card fits viewport');
    for (const line of await card.locator('.stat-line').all()) {
      const box = await line.boundingBox();
      assert.ok(box.x >= bounds.x - 1 && box.x + box.width <= bounds.x + bounds.width + 1, 'Per-life row fits card');
    }
    await page.screenshot({ path: resolve(output, `per-life-${width}.png`) });
  }
  report.ui = 'Equipment lives, individual rows, type priority and duration sorting, live recharge and swaps, source helpers and 1280/390px layout';
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ checks: report.count, errors }, null, 2));
} finally {
  await browser.close();
  await new Promise(done => server.close(done));
}
