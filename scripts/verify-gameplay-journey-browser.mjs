import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const injectMissingStart = process.argv.includes('--omit-initial-turn');
const root = resolve('docs'), output = resolve(`outputs/gameplay-journey${injectMissingStart ? '-recovery' : ''}`);
await mkdir(output, { recursive: true });
const mime = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.mp3': 'audio/mpeg' };
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = resolve(root, '.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname));
  const rel = relative(root, file);
  if (rel === '..' || rel.startsWith('..' + sep)) return res.writeHead(403).end();
  try { res.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream'); res.end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
let browser, page;
const report = { result: 'running', injectMissingStart, checkpoints: [], errors: [], diagnostics: [] };
const installProbe = async () => page.evaluate(async () => {
  const E = await import("/js/entities/runtime.js"), S = await import("/js/storage/gameStorage.js");
  const G = await import("/js/app/stages.js"), State = await import("/js/app/state.js");
  const F = await import("/js/combat/loop.js"), M = await import('/js/items/itemManager.js');
  const Gear = await import('/js/items/equipement.js'), R = await import('/js/items/resourceStocks.js');
  const A = await Promise.all([import("/js/combat/vitals.js"), import("/js/rendering/vitalFeedback.js"), import("/js/rendering/hud.js")]).then(parts => Object.defineProperties({}, Object.fromEntries(parts.flatMap(part => Object.keys(part).map(key => [key, { enumerable: true, get: () => part[key] }]))))), U = await import("/js/storage/entityStorage.js");
  const UI = await Promise.all([import("/js/ui/application.js"), import("/js/ui/attacks.js"), import("/js/ui/codex/index.js"), import("/js/ui/codex/profile.js"), import("/js/ui/codex/stats.js"), import("/js/ui/dialogue.js"), import("/js/ui/display.js"), import("/js/ui/drag.js"), import("/js/ui/essences.js"), import("/js/ui/inventory.js"), import("/js/ui/navigation.js"), import("/js/ui/statistics/components.js"), import("/js/ui/statistics/details.js"), import("/js/ui/statistics/helpers.js")]).then(parts => Object.defineProperties({}, Object.fromEntries(parts.flatMap(part => Object.keys(part).map(key => [key, { enumerable: true, get: () => part[key] }]))))), D = await Promise.all([import("/js/combat/statistics.js"), import("/js/board/deployment.js"), import("/js/rendering/hud.js"), import("/js/ui/statistics/details.js"), import("/js/rendering/damageFeedback.js"), import("/js/combat/damageRules.js")]).then(parts => Object.defineProperties({}, Object.fromEntries(parts.flatMap(part => Object.keys(part).map(key => [key, { enumerable: true, get: () => part[key] }])))));
  const checks = [];
  const check = (ok, text) => { if (!ok) throw Error(text); checks.push(text); };
  const actor = id => E.entites.find(entity => entity.id === id)
    || window.selectedArmyA?.find(entity => entity.id === id)
    || S.loadFromLocalStorage('selectedArmyA', []).find(entity => entity.id === id);
  const snapshot = () => ({ day: Number(localStorage.getItem('gameDay')), mode: window.levelRunning,
    viewport: { scrollY, height: innerHeight, grids: document.querySelectorAll('#hexGrid').length,
      gridBounds: document.querySelector('#hexGrid')?.getBoundingClientRect().toJSON() },
    entities: S.loadFromLocalStorage('selectedArmyA', []).map(entity => ({ id: entity.id,
      shift: entity.stats.shift, HP: entity.stats.HP, stuff: entity.stuff, resourceStocks: entity.resourceStocks,
      extraLife: entity.stats.extraLife, extraLifeRegen: entity.extraLifeRegen, eternalLife: entity.stats.eternalLife })),
    items: S.loadEquippedItems().map(item => ({ id: item.equippedId, owner: item.equippedTo,
      slot: item.slot, resourceStocks: item.resourceStocks })).sort((a, b) => a.id.localeCompare(b.id)),
    turns: E.entites.map(entity => ({ id: entity.id, side: entity.side, turn: entity.turnCount,
      phase: entity.currentPhase, hp: entity.stats.HP?.current, stopped: entity.battleStopped })) });
  window.__journey = { E, S, G, State, F, M, Gear, R, A, U, UI, D, check, checks, actor, snapshot };
});
const checkpoint = async name => {
  const result = await page.evaluate(() => ({ state: window.__journey.snapshot(), checks: window.__journey.checks.splice(0) }));
  report.checkpoints.push({ name, ...result });
  console.log(`PASS ${name}: ${result.checks.length} checks`);
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
};
const openLevel = async () => {
  await page.locator('.level-button.scripted').first().click({ force: true });
  await page.locator('.loading-h2.loaded').waitFor({ timeout: 45000 });
  await page.locator('.loading-h2.loaded').click();
  await page.waitForFunction(() => {
    const hud = document.querySelector('.hud-ingame');
    return !document.querySelector('.loading-screen') && document.querySelector('#startButton')
      && hud?.style.opacity === '1' && hud.style.transition === '';
  }, null, { timeout: 30000 });
};
const startBattle = async () => {
  await page.locator('#startButton').click();
  await page.waitForFunction(async () => {
    const { E } = window.__journey;
    return E.entites.filter(entity => ['A', 'B'].includes(entity.side) && entity.stats.HP?.current > 0)
      .every(entity => entity.turnCount >= 1 && entity.currentPhase);
  }, null, { timeout: 7000 });
};
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  page = await browser.newPage({ viewport: { width: 1536, height: 960 } });
  page.setDefaultTimeout(30000);
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' || /CombatTurnStart/.test(message.text())) {
      report.diagnostics.push({ type: message.type(), text: message.text() });
    }
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await installProbe();
  await page.evaluate(async () => {
    const { E, S, G, State, M, Gear, UI, check } = window.__journey;
    const { entitesNest } = await import("/js/data/entityTemplates.js");
    const { ItemDetails } = await import('/js/data/itemList.js');
    const Map = await import("/js/app/worldMap.js");
    S.setAdminMode(false);
    window.levelRunning = 'worldmap'; State.refreshStageAccess();
    localStorage.setItem('gameDay', '1');
    const template = entitesNest.find(entity => entity.serial === 900013);
    const make = (id, side, efficiency) => E.enrichEntityStats({ ...structuredClone(template),
      id, name: `Journey ${id}`, nickname: `Journey ${id}`, side, awakening: 1, level: 1,
      attacks: ['shot-p-r'], baseStats: { HP: 5000, shift: 10, agility: 17, intelligence: 30, strength: 1,
        charge: 8, weaponOrfevre: efficiency, trailer: 100, speed: 1000, ...(side === 'A' ? { extraLife: 1 } : {}) },
      stats: {}, modifierStats: {}, stuff: {}, resourceStocks: {} });
    const actors = [make(995701, 'A', 100), make(995702, 'A', 0)];
    E.entites.splice(0, E.entites.length, ...actors);
    S.saveToLocalStorage('selectedArmyA', actors); window.selectedArmyA = actors;
    S.saveToLocalStorage('equippedItems', []);
    for (const key of ['PlayerSave', 'IngameItemsData']) S.saveToLocalStorage(key, { Playerinventory: [], equippedItems: [], battleSlots: [] });
    UI.createGameContainer(); UI.GameUi(); UI.initializeArmyConfig(); UI.PlayerArmyCodex();
    Map.rebuildWorldMapLevelButtons();
    const button = document.querySelector('.level-button.scripted');
    const stageId = button.dataset.storageid;
    S.saveToLocalStorage('ArmyB', { armies: { [`ArmyB_${stageId}`]: { entities: [make(995703, 'B', 0)], ArmyB_id: `ArmyB_${stageId}` } } });
    const names = ['DevMovementCurrentFive', 'DevMovementMixed', 'DevExtraLifeSixDays', 'DevExtraLifeThreeDays', 'DevAbsoluteLifeTwo'];
    const items = {};
    for (const [index, name] of names.entries()) {
      const item = M.acquireItem(ItemDetails.find(item => item.functionName === name), 'journey');
      check(Gear.equip({ item, targetEntity: actors[0], slotId: `slot${index + 1}-${actors[0].id}` }), `Equip ${name} on map`);
      items[name] = `e${item.itemId}`;
    }
    const replacement = M.acquireItem(ItemDetails.find(item => item.functionName === 'DevMovementMaxThree'), 'journey');
    check(Gear.equip({ item: replacement, targetEntity: actors[1], slotId: `slot1-${actors[1].id}` }), 'Equip recipient before swap');
    const acquire = name => M.acquireItem(ItemDetails.find(item => item.functionName === name), 'journey').itemId;
    const movement = acquire('MovementChargeSeven');
    check((await M.useConsumableItem(movement, actors[0], { silent: true })).ok, 'Use +7 movement on map');
    const faded = acquire('FadedLifeCharge');
    check(M.moveBattleItem(faded, 0), 'Prepare resurrection consumable in satchel');
    const combatMovement = acquire('MovementChargeThree');
    check(M.moveBattleItem(combatMovement, 1), 'Prepare combat movement consumable');
    const resurrection = M.acquireItem(ItemDetails.find(item => item.effets?.includes('itemRez')), 'journey').itemId;
    const heal = M.acquireItem(ItemDetails.find(item => item.effets?.includes('itemHeal') && item.HealAmount === 100), 'journey').itemId;
    check(M.moveBattleItem(resurrection, 2), 'Prepare corpse resurrection consumable');
    check(M.moveBattleItem(heal, 3), 'Prepare post-resurrection healing');
    check(actors[0].stats.shift.current > actors[0].stats.shift.max, 'Map supplies exceed movement maximum');
    sessionStorage.setItem('journeyFixture', JSON.stringify({ items, faded, combatMovement, resurrection, heal, stageId }));
    document.querySelectorAll('.entitylootContainer, #black-overlay').forEach(node => node.remove());
  });
  await checkpoint('map-equipment-consumable');
  await openLevel();
  await page.evaluate(() => {
    const { E, check } = window.__journey;
    check(E.entites.length === 3, 'Same three entities loaded onto real board');
    check(E.entites.every(entity => document.getElementById(`Box_Entite_${entity.id}`)?.closest('.hex')), 'Each entity occupies a real board hex');
    check(E.entites.find(entity => entity.id === 995701).stats.shift.current > E.entites.find(entity => entity.id === 995701).stats.shift.max,
      'Entering combat preserves map movement surplus');
  });
  await startBattle();
  await page.evaluate(async () => {
    const { actor, M, R, U, check } = window.__journey;
    const entity = actor(995701), { combatMovement, faded } = JSON.parse(sessionStorage.getItem('journeyFixture'));
    check((await M.useConsumableItem(combatMovement, entity, { silent: true })).ok, 'Use movement consumable in real combat');
    check((await M.useConsumableItem(faded, entity, { silent: true })).ok, 'Use faded-life consumable in real combat');
    check(entity.resourceStocks.fadedLife.consumable === 1, 'Faded life retains consumable provenance');
    const before = R.getEquipmentResourceCurrent(entity, 'shift');
    R.spendMovementCharges(entity, entity.resourceStocks.shift.temporary + 2); U.saveEntityMovementState(entity);
    check(R.getEquipmentResourceCurrent(entity, 'shift') === before - 2, 'Movement spends consumables before equipment');
    window.__journey.remainingMovement = R.getEquipmentResourceCurrent(entity, 'shift');
    window.__journey.movementBefore = entity.stats.shift.current;
    window.__journey.turnsBefore = entity.turnCount;
  });
  await page.waitForFunction(() => window.__journey.actor(995701).turnCount > window.__journey.turnsBefore, null, { timeout: 15000 });
  await page.evaluate(() => {
    const { actor, R, check, remainingMovement } = window.__journey;
    check(R.getEquipmentResourceCurrent(actor(995701), 'shift') === remainingMovement, 'Natural recovery and Trailer do not refill equipment');
    check(actor(995701).stats.shift.current <= Math.max(actor(995701).stats.shift.max, window.__journey.movementBefore), 'Natural turns cannot create surplus or remove existing surplus');
    check(actor(995701).stats.shift.current === window.__journey.movementBefore, 'Existing surplus remains unchanged through natural recovery');
  });
  await checkpoint('combat-turns-and-consumables');
  await page.evaluate(() => {
    const { actor, A, R, check } = window.__journey;
    const entity = actor(995701), enemy = actor(995703);
    const { items } = JSON.parse(sessionStorage.getItem('journeyFixture'));
    const hit = () => {
      const attack = { functionName: 'journey-hit', launchContextId: 'journey-hit', displayName: 'Journey hit',
        combatFunction: 'Attaquant', type: ['alteration'], attackTarget: ['enemy'],
        attacknature: ['physicalDamage'], attackRange: ['melee'], effets: [], forceDamageSources: { physical: 100000 } };
      A.applyDamage(entity, 100000, enemy, attack, { physical: 100000 });
      check(entity.stats.HP.current > 0 && !entity.isDEAD, 'Lethal damage consumes a life and leaves entity viable');
    };
    hit(); check(!entity.resourceStocks.fadedLife.consumable, 'First lethal hit consumes faded consumable');
    hit();
    check(entity.resourceStocks.extraLife.stuff[items.DevExtraLifeSixDays].current === 0, 'Equal-age extra lives consume equipment slot first');
    hit(); check(entity.resourceStocks.extraLife.stuff[items.DevExtraLifeThreeDays].current === 0, 'Next extra-life slot consumed');
    hit(); check(entity.stats.extraLife.current === 0, 'Natural extra life consumed after equipment');
    hit(); check(R.getEquipmentResourceCurrent(entity, 'eternalLife') === 1, 'One eternal life consumed, not entire equipment');
    window.__journey.turnsBefore = entity.turnCount;
  });
  await page.waitForFunction(() => window.__journey.actor(995701).turnCount > window.__journey.turnsBefore, null, { timeout: 15000 });
  await page.screenshot({ path: resolve(output, 'combat-after-lives.png') });
  await checkpoint('resurrections-and-continuing-turns');
  await page.evaluate(() => window.__journey.G.QuitCurrentLevel());
  await page.waitForFunction(() => window.levelRunning === 'worldmap' && !window.__QUIT_LEVEL_LOCK__ && document.querySelector('.level-button.scripted'));
  await page.evaluate(() => {
    const { S, G, R, D, check } = window.__journey;
    const entity = S.loadFromLocalStorage('selectedArmyA', []).find(entity => entity.id === 995701);
    const { items } = JSON.parse(sessionStorage.getItem('journeyFixture'));
    check(Number(localStorage.getItem('gameDay')) === 2, 'Quitting real stage advances exactly one day');
    check(entity.resourceStocks.shift.temporary === 0, 'Next day removes temporary movement');
    check(entity.stats.shift.current === D.calculateShiftDailyStartingCharges(entity) + R.getEquipmentResourceCurrent(entity, 'shift'), 'New-day movement is natural fill plus remaining equipment');
    for (const name of ['DevExtraLifeSixDays', 'DevExtraLifeThreeDays']) {
      check(entity.resourceStocks.extraLife.stuff[items[name]].regen['001'].currentRegen === 1, `${name} recharges one day in parallel`);
    }
    check(entity.stats.eternalLife.current === 2, 'Eternal equipment recharges at next day');
  });
  await checkpoint('return-to-map-new-day');
  await page.evaluate(() => {
    const { actor, S, Gear, UI, M, check } = window.__journey;
    const owner = actor(995701), recipient = actor(995702);
    const { items } = JSON.parse(sessionStorage.getItem('journeyFixture'));
    UI.closeOpenHelpers();
    const host = document.createElement('section'); host.id = 'journey-equipment';
    host.style.cssText = 'position:fixed;top:80px;left:30px;width:300px;z-index:100';
    document.body.append(host); UI.createStuffDom(owner, host);
    for (const name of ['DevMovementCurrentFive', 'DevExtraLifeSixDays']) {
      const item = S.getEquippedItemById(items[name]);
      const anchor = host.querySelector(`[data-stuff-id="${item.equippedId}"]`);
      M.pinItemDescription(item, item.equippedId, anchor, { showEquippedActions: true });
      const card = document.querySelector(`.item-description-card[data-item-id="${item.equippedId}"]`);
      card.style.cssText += `;position:fixed;top:110px;left:${name === 'DevMovementCurrentFive' ? 40 : 400}px;width:290px`;
    }
    document.querySelector(`.item-description-card[data-item-id="${items.DevMovementCurrentFive}"] .stuff-stat-resource-reserve`).dataset.journeyHover = 'true';
  });
  await page.locator('[data-journey-hover="true"]').hover({ force: true });
  await page.evaluate(() => {
    const { actor, S, Gear, check } = window.__journey;
    const owner = actor(995701), recipient = actor(995702);
    const { items } = JSON.parse(sessionStorage.getItem('journeyFixture'));
    const helper = [...document.querySelectorAll('.stat-hover')].find(node => node._helperHost?.matches('[data-journey-hover="true"]'));
    check(helper, 'Real movement contribution sub-helper opened before swap');
    const stocks = () => JSON.stringify(S.loadEquippedItems().map(item => [item.equippedId, item.resourceStocks]).sort((a, b) => a[0].localeCompare(b[0])));
    const snapshot = stocks();
    check(Gear.equip({ item: S.getEquippedItemById(items.DevMovementCurrentFive), sourceEntity: owner,
      targetEntity: recipient, slotId: `slot1-${recipient.id}` }), 'Real occupied-slot swap after new day');
    check(Gear.equip({ item: S.getEquippedItemById(items.DevExtraLifeSixDays), sourceEntity: owner,
      targetEntity: recipient, slotId: `slot2-${recipient.id}` }), 'Transfer recharging life');
    check(stocks() === snapshot, 'Swaps preserve item reserves and life timers exactly');
    check(recipient.resourceStocks.shift.stuff[items.DevMovementCurrentFive].current === 4, 'Zero-efficiency recipient receives four raw remaining charges');
    check(recipient.resourceStocks.extraLife.stuff[items.DevExtraLifeSixDays].regen['001'].currentRegen === 1, 'Life remains at 1/6 days after transfer');
    const card = document.querySelector(`.item-description-card[data-item-id="${items.DevMovementCurrentFive}"]`);
    check(card?.classList.contains('persistent'), 'Open item helper survives swap');
    check(Number(card.querySelector('.item-stats-block').dataset.weaponOrfevreActive) === 0, 'Open helper uses zero-efficiency new owner');
    check(helper.isConnected && helper.dataset.entityId === String(recipient.id), 'Same open sub-helper follows new owner');
    const expected = document.createElement('template'); expected.innerHTML = helper._helperHost.dataset.helperText;
    check(helper.querySelector('.stat-hover-body').textContent.trim() === expected.content.textContent.trim(), 'Open sub-helper shows updated remaining charges');
    sessionStorage.setItem('journeyBeforeReload', JSON.stringify(window.__journey.snapshot()));
  });
  await page.screenshot({ path: resolve(output, 'map-after-swap.png') });
  await checkpoint('swap-with-open-helpers');
  await page.reload();
  await installProbe();
  await page.waitForFunction(() => document.querySelector('.level-button.scripted'), null, { timeout: 30000 });
  await page.evaluate(() => {
    const { snapshot, check, S } = window.__journey;
    const before = JSON.parse(sessionStorage.getItem('journeyBeforeReload')), after = snapshot();
    check(JSON.stringify(before.items) === JSON.stringify(after.items), 'Actual page reload preserves item owner, reserves and recharge timers');
    for (const previous of before.entities) {
      const current = after.entities.find(entity => entity.id === previous.id);
      check(JSON.stringify(current.resourceStocks) === JSON.stringify(previous.resourceStocks), `Reload preserves all stocks for ${previous.id}`);
      check(JSON.stringify(current.shift) === JSON.stringify(previous.shift), `Reload preserves movement for ${previous.id}`);
    }
    check(S.loadEquippedItems().length === 6, 'No equipment duplicated or lost');
  });
  await checkpoint('actual-browser-reload');
  await openLevel();
  if (injectMissingStart) await page.evaluate(() => {
    const { E, check } = window.__journey;
    window.addEventListener('battleStarted', () => {
      const index = E.entites.findIndex(entity => entity.id === 995702);
      const [entity] = E.entites.splice(index, 1);
      queueMicrotask(() => E.entites.splice(index, 0, entity));
    }, { once: true });
    check(true, 'Inject one omitted initial turn on the real second combat');
  });
  await startBattle();
  await page.waitForFunction(() => window.__journey.E.entites.every(entity => entity.turnCount >= 2), null, { timeout: 15000 });
  await page.evaluate(() => {
    const { E, check, actor } = window.__journey;
    const { items } = JSON.parse(sessionStorage.getItem('journeyFixture'));
    check(E.entites.every(entity => !entity.battleStopped && entity.turnCount >= 2), 'All entities start and continue turns after swap and reload');
    check(actor(995702).resourceStocks.shift.stuff[items.DevMovementCurrentFive].current === 4, 'Second combat does not refill transferred movement');
    check(actor(995702).resourceStocks.extraLife.stuff[items.DevExtraLifeSixDays].regen['001'].currentRegen === 1, 'Entering second combat does not advance recharge');
  });
  await checkpoint('second-combat-after-reload');
  await page.evaluate(() => {
    const { actor, A, check } = window.__journey;
    const target = actor(995702), enemy = actor(995703);
    const attack = { functionName: 'journey-corpse', launchContextId: 'journey-corpse', combatFunction: 'Attaquant',
      type: ['alteration'], attackTarget: ['enemy'], attackRange: ['melee'], attacknature: ['physicalDamage'], effets: [],
      forceDamageSources: { physical: 100000 } };
    A.applyDamage(target, 100000, enemy, attack, { physical: 100000 });
    check(!target.isDEAD && target.stats.extraLife.current === 0, 'Recipient consumes its last ready life');
    A.applyDamage(target, 100000, enemy, attack, { physical: 100000 });
    check(target.isDEAD && target.stats.HP.current === 0, 'Recipient becomes an actual corpse');
    window.__journey.turnsBefore = target.turnCount;
  });
  await page.waitForTimeout(350);
  await page.evaluate(async () => {
    const { actor, M, check } = window.__journey;
    const target = actor(995702), { resurrection, heal } = JSON.parse(sessionStorage.getItem('journeyFixture'));
    check((await M.useConsumableItem(resurrection, target, { silent: true })).ok, 'Resurrection consumable revives corpse during ongoing combat');
    check((await M.useConsumableItem(heal, target, { silent: true })).ok, 'Healing consumable works immediately after resurrection');
    check(!target.isDEAD && target.stats.HP.current > 0, 'Resurrected entity is viable');
  });
  await page.waitForFunction(() => window.__journey.actor(995702).turnCount >= window.__journey.turnsBefore + 2, null, { timeout: 20000 });
  await page.evaluate(() => {
    const { actor, check } = window.__journey;
    check(actor(995702).resurrections === 1, 'Corpse resurrection is recorded once');
    check(!actor(995702).isDEAD, 'Resurrected entity starts and completes a new turn');
  });
  await checkpoint('corpse-resurrection-turn-restart');
  await page.evaluate(() => {
    const { actor, R, U, check } = window.__journey;
    const owner = actor(995702);
    R.spendMovementCharges(owner, owner.stats.shift.current); U.saveEntityMovementState(owner);
    check(R.getEquipmentResourceCurrent(owner, 'shift') === 0, 'Exhaust transferred equipment in real combat');
    window.__journey.G.QuitCurrentLevel();
  });
  await page.waitForFunction(() => window.levelRunning === 'worldmap' && !window.__QUIT_LEVEL_LOCK__ && document.querySelector('.level-button.scripted'));
  await page.evaluate(() => {
    const { actor, S, Gear, R, check } = window.__journey;
    const owner = actor(995702), recipient = actor(995701);
    const { items } = JSON.parse(sessionStorage.getItem('journeyFixture'));
    check(R.getEquipmentResourceCurrent(owner, 'shift') === 0, 'Second new day does not restore exhausted gear');
    check(Gear.equip({ item: S.getEquippedItemById(items.DevMovementCurrentFive), sourceEntity: owner,
      targetEntity: recipient, slotId: `slot1-${recipient.id}` }), 'Swap empty equipment back to efficient owner');
    check(recipient.resourceStocks.shift.stuff[items.DevMovementCurrentFive].current === 0, 'Efficiency cannot refill a depleted item after two combats');
    check(owner.resourceStocks.extraLife.stuff[items.DevExtraLifeSixDays].regen['001'].currentRegen === 2, 'Transferred life advances once to 2/6 days');
    sessionStorage.setItem('journeyEmptyReload', JSON.stringify(window.__journey.snapshot().items));
  });
  await checkpoint('empty-equipment-second-day');
  await page.reload();
  await installProbe();
  await page.waitForFunction(() => document.querySelector('.level-button.scripted'));
  await page.evaluate(() => {
    const { snapshot, check } = window.__journey;
    check(JSON.stringify(snapshot().items) === sessionStorage.getItem('journeyEmptyReload'), 'Second reload retains empty stock and transferred recharge progress');
  });
  await checkpoint('empty-equipment-second-day-and-reload');
  assert.deepEqual(report.errors, []);
  const recoveries = report.diagnostics.filter(entry => /CombatTurnStart/.test(entry.text));
  assert.equal(recoveries.length, injectMissingStart ? 1 : 0, 'Only the injected missed start needs one recovery');
  assert.deepEqual(report.diagnostics.filter(entry => entry.type === 'error'), []);
  report.result = 'passed';
  report.checkCount = report.checkpoints.reduce((sum, entry) => sum + entry.checks.length, 0);
  console.log(`PASS complete journey: ${report.checkCount} checks, ${report.checkpoints.length} checkpoints`);
} catch (error) {
  report.result = 'failed'; report.failure = error.stack;
  if (page) {
    await page.screenshot({ path: resolve(output, 'failure.png') }).catch(() => {});
    report.failureState = await page.evaluate(() => window.__journey?.snapshot()).catch(() => null);
  }
  throw error;
} finally {
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  await browser?.close();
  await new Promise(done => server.close(done));
}
