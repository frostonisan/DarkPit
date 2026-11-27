import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = resolve('docs'), output = resolve('outputs/admin-entity-actions');
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
const checks = [], errors = [];
const check = (condition, label) => { assert.ok(condition, label); checks.push(label); };
try {
  const page = await browser.newPage({ viewport: { width: 1536, height: 960 } });
  page.on('pageerror', error => errors.push(error.stack || error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.evaluate(async () => {
    const S = await import("/js/storage/gameStorage.js");
    const E = await import("/js/entities/runtime.js");
    const A = await import("/js/debug/admin.js");
    const R = await import('/js/items/resourceStocks.js');
    S.setAdminMode(true);
    window.levelRunning = 'admin'; window.currentStageId = 'admin-actions';
    S.setCurrentLevel('admin-actions');
    (await import("/js/storage/sessionStorage.js")).beginAdminSession();
    window.__persistent = JSON.stringify(Object.entries(localStorage).sort());
    S.saveToLocalStorage('GameStages', { stages: [{ id: 'admin-actions', level_type: 'admin' }] });
    S.saveToLocalStorage('selectedArmyA', []); S.saveToLocalStorage('ArmyB', { armies: {} });
    S.saveToLocalStorage('equippedItems', []);
    E.entites.length = 0;
    document.body.innerHTML = '<div id="game-container"><div class="Game-UI"></div><div class="AllEntitiesHud"></div><div id="hexGrid" class="hex-grid"></div></div>';
    const grid = document.getElementById('hexGrid');
    grid.style.cssText = 'position:fixed;left:500px;top:160px;display:grid;grid-template-columns:repeat(5,120px);gap:10px;transform:none;';
    for (let i = 1; i <= 15; i++) {
      const hex = document.createElement('div'); hex.id = `hex_${i}`;
      Object.assign(hex.dataset, { position: hex.id, row: Math.floor((i - 1) / 5), col: (i - 1) % 5, side: i < 9 ? 'A' : 'B' });
      hex.className = `hex Side${hex.dataset.side}`;
      delete hex.dataset.side;
      hex.style.cssText = 'width:120px;height:120px;position:relative;transform:none;background:#20252a;';
      hex.appendChild(Object.assign(document.createElement('div'), { className: 'socle' }));
      grid.appendChild(hex);
    }
    const template = structuredClone((await import("/js/data/entityTemplates.js")).entitesNest.find(row => row.serial === 900013));
    const gear = { itemId: 'test-gear', equippedId: 'e-test-gear', equippedTo: 991780, slot: 'slot1', name: 'Test charges',
      Stuffeffets: [{ type: 'stat-buff', stat: 'shift', value: { current: 5, max: 3 } },
        { type: 'stat-buff', stat: 'extraLife', value: 1, rechargeDays: 6 },
        { type: 'stat-buff', stat: 'armor', value: 10 }] };
    S.addToEquippedItemsStorage(gear.equippedId, gear);
    const actor = E.enrichEntityStats({ ...template, id: 991780, name: 'Original admin', side: 'A', position: 'hex_1', level: 5,
      attacks: ['shot-p-r'], stats: {}, modifierStats: { durable: { statLeveled: { strength: 2 }, adminLevel: { magicalDamage: 4 } } },
      baseStats: { HP: 100, speed: 10000, strength: 10, agility: 5, intelligence: 3, charge: 1, shift: 6,
        vigor: 0, extraLife: 1, eternalLife: 1, armor: 8, fadedLife: 2, weaponOrfevre: 10 },
      stuff: { slot1: [gear.equippedId] }, baseStatSources: { crystal: { strength: 3 } }, experience: 100 });
    await (await import("/js/entities/spawn.js")).spawnEntiteIngame(actor);
    actor.stats.HP.current = 37;
    R.spendMovementCharges(actor, 2);
    R.addFadedLife(actor, 3, 'consumable');
    R.consumeRechargeableLife(actor, 'extraLife');
    actor.resourceStocks.extraLife.stuff[gear.equippedId].regen['001'].currentRegen = 2;
    R.syncLifeCurrent(actor, 'extraLife');
    (await import('/js/items/armor.js')).consumeEntityArmor(actor, 4);
    actor.domReference = document.getElementById(`Box_Entite_${actor.id}`);
    actor.testIntervalId = 999999;
    window.__actor = actor;
    window.__before = JSON.stringify(actor.stats);
    A.initializeAdminLevel(E.entitesNestUp);
  });
  check(await page.locator('.admin-duplicate-entity-button').isHidden(), 'Duplicate is hidden without a selected entity');
  await page.locator('#Box_Entite_991780').dispatchEvent('click', { detail: 1 });
  await page.locator('.admin-duplicate-entity-button').waitFor({ state: 'visible' });
  await page.locator('.admin-duplicate-entity-button').click();
  await page.waitForFunction(async () => (await import("/js/entities/runtime.js")).entites.length === 2);
  await page.waitForFunction(() => !document.querySelector('.admin-duplicate-entity-button').disabled);
  const clone = await page.evaluate(async () => {
    const E = await import("/js/entities/runtime.js"), S = await import("/js/storage/gameStorage.js");
    const a = window.__actor, b = E.entites.find(row => row !== a);
    window.__copy = b;
    const aid = a.stuff.slot1[0], bid = b.stuff.slot1[0];
    const sourceItem = S.loadEquippedItems().find(item => item.equippedId === aid);
    const item = S.loadEquippedItems().find(item => item.equippedId === bid);
    const { validateEntityEssenceLedger } = await import("/js/items/essences.js");
    const statsEqual = JSON.stringify(a.stats) === JSON.stringify(b.stats);
    const essenceIds = a.attackEssenceInventory.linkedItems.map(item => item.id);
    const independent = a.stats !== b.stats && a.attackDetails !== b.attackDetails && a.resourceStocks !== b.resourceStocks;
    E.recomputeEntityStats(b);
    return { ids: a.id !== b.id && a.position !== b.position,
      statsEqual, independent, hp: b.stats.HP, sourceUnchanged: JSON.stringify(a.stats) === window.__before,
      gear: aid !== bid && item.itemId !== sourceItem.itemId && item.equippedTo === b.id,
      life: b.resourceStocks.extraLife.stuff[bid].regen['001'].currentRegen,
      shift: b.resourceStocks.shift.stuff[bid].reserve.preciseCurrent === a.resourceStocks.shift.stuff[aid].reserve.preciseCurrent,
      noRuntime: !('testIntervalId' in b) && !('domReference' in b),
      attacks: b.attackDetails.every(attack => !a.attackDetails.some(other => other.entityAttackId === attack.entityAttackId)),
      essences: !b.attackEssenceInventory.linkedItems.some(item => essenceIds.includes(item.id)),
      ledger: validateEntityEssenceLedger(b), sourceLedger: validateEntityEssenceLedger(a) };
  });
  for (const key of ['ids', 'statsEqual', 'independent', 'sourceUnchanged', 'gear', 'shift', 'noRuntime', 'essences', 'attacks']) check(clone[key], `Duplicate: ${key}`);
  assert.deepEqual(clone.hp, { current: 37, max: 100 }); checks.push('Duplicate retains injured HP after recomputation');
  assert.equal(clone.life, 2); checks.push('Duplicate retains 2/6 days of equipment recharge');
  check(clone.ledger.ok && clone.sourceLedger.ok, `Independent essence ledgers: ${JSON.stringify(clone.ledger)}`);
  await page.locator('.admin-hard-reset-entity-button').click();
  await page.waitForFunction(() => document.getElementById('admin-event-launch-status').textContent.includes('stats à 0'));
  const reset = await page.evaluate(async () => {
    const E = await import("/js/entities/runtime.js"), S = await import("/js/storage/gameStorage.js");
    const a = window.__actor;
    for (let i = 0; i < 3; i++) E.recomputeEntityStats(a);
    return { hp: a.stats.HP, nonzero: Object.fromEntries(Object.entries(a.stats).filter(([key, value]) => key !== 'HP'
        && (typeof value === 'number' ? value !== 0 : value && Object.values(value).some(part => typeof part === 'number' && part !== 0)))),
      gearGone: Object.values(a.stuff).flat().length === 0,
      inventory: S.loadFromLocalStorage('PlayerSave', {}).Playerinventory,
      sourcesGone: !a.baseStatSources && Object.keys(a.modifierStats.durable.statLeveled || {}).length === 0,
      copyIntact: window.__copy.stats.HP.current === 37 && !!window.__copy.stuff.slot1?.length,
      unchangedSave: window.__persistent === JSON.stringify(Object.entries(localStorage).sort()) };
  });
  assert.deepEqual(reset.hp, { current: 1, max: 1 }); checks.push('Hard-reset: HP 1/1');
  assert.deepEqual(reset.nonzero, { criticalDamage: 50 }); checks.push('Hard-reset: only the innate 50% critical damage remains after three recomputations');
  for (const key of ['gearGone', 'sourcesGone', 'copyIntact', 'unchangedSave']) check(reset[key], `Hard-reset: ${key}`);
  check(reset.inventory.some(item => (item.itemId || item) === 'test-gear'), 'Hard-reset returns equipment without deleting it');
  await page.screenshot({ path: resolve(output, 'hard-reset-desktop.png') });
  await page.locator('.admin-duplicate-entity-button').click();
  await page.waitForFunction(async () => (await import("/js/entities/runtime.js")).entites.length === 3);
  await page.waitForFunction(() => !document.querySelector('.admin-duplicate-entity-button').disabled);
  check(await page.evaluate(async () => {
    const E = await import("/js/entities/runtime.js");
    const actor = E.entites.at(-1); E.recomputeEntityStats(actor);
    return actor.adminZeroBaseline && actor.stats.HP.max === 1 && actor.stats.dayHpRegen === 0 && actor.stats.weight === 0;
  }), 'A hard-reset entity can be duplicated without restoring implicit bonuses');
  await page.evaluate(async () => {
    const E = await import("/js/entities/runtime.js");
    window.__actor.baseStats.strength = 4;
    window.__actor.baseStats.vitality = 3;
    E.recomputeEntityStats(window.__actor);
  });
  check(await page.evaluate(() => window.__actor.stats.strength === 4 && window.__actor.stats.HP.max > 1
    && window.__actor.stats.dayHpRegen > 0), 'Hard-reset does not lock future stat gains');
  const further = await page.evaluate(async () => {
    const A = await import("/js/debug/admin.js"), E = await import("/js/entities/runtime.js"), S = await import("/js/storage/gameStorage.js");
    const R = await import('/js/items/resourceStocks.js');
    const Rules = await import("/js/entities/rules.js");
    const original = window.__copy;
    const results = {};
    R.spendMovementCharges(original, 100);
    const exhausted = await A.duplicateAdminEntity(original);
    const newGearId = exhausted.stuff.slot1[0];
    results.exhausted = exhausted.resourceStocks.shift.stuff[newGearId].current === 0;
    exhausted.baseStats.strength += 2;
    E.recomputeEntityStats(exhausted);
    results.independentEdits = exhausted.baseStats.strength !== original.baseStats.strength;
    exhausted.resourceStocks.extraLife.stuff[newGearId].regen['001'].currentRegen = 0;
    results.independentStocks = original.resourceStocks.extraLife.stuff[original.stuff.slot1[0]].regen['001'].currentRegen === 2;
    Rules.entityBattleBooste(original, { stat: 'magicalDamage', value: 7, source: 'duplication-test', durationMs: 1500 });
    const buffed = await A.duplicateAdminEntity(original);
    results.temporaryBoost = Rules.getSafe(buffed, 'magicalDamage', 0) === Rules.getSafe(original, 'magicalDamage', 0)
      && buffed.battleBoosts.magicalDamage[0].id !== original.battleBoosts.magicalDamage[0].id;
    await new Promise(done => setTimeout(done, 1700));
    results.expires = !buffed.battleBoosts.magicalDamage && !original.battleBoosts.magicalDamage;
    Rules.entityBattleBooste(buffed, { stat: 'strength', value: 9, source: 'reset-test', durationMs: 500 });
    await A.hardResetAdminEntity(buffed);
    await new Promise(done => setTimeout(done, 600));
    results.clearedBoosts = Rules.getSafe(buffed, 'strength', 0) === 0 && !Object.keys(buffed.battleBoosts).length;
    const dead = { ...original, isDEAD: true, statut: ['dead'], stats: { ...original.stats, HP: { ...original.stats.HP, current: 0 } } };
    const corpse = await A.duplicateAdminEntity(dead);
    results.deadCopy = corpse.isDEAD && corpse.stats.HP.current === 0;
    await A.hardResetAdminEntity(corpse);
    results.deadReset = !corpse.isDEAD && corpse.stats.HP.current === 1 && corpse.stats.HP.max === 1
      && !document.getElementById(`Box_Entite_${corpse.id}`).dataset.dead;
    const beforeCount = E.entites.length, beforeItems = JSON.stringify(S.loadEquippedItems());
    const cells = [...document.querySelectorAll('.hex')];
    const blockers = cells.filter(hex => !hex.querySelector('.entite-box')).map(hex => {
      const node = document.createElement('div'); node.dataset.groundSummon = 'true'; hex.appendChild(node); return node;
    });
    try { await A.duplicateAdminEntity(original); } catch (error) { results.fullBoardRejected = error.message.includes('case libre'); }
    results.failedCopyAtomic = E.entites.length === beforeCount && JSON.stringify(S.loadEquippedItems()) === beforeItems;
    blockers.forEach(node => node.remove());
    const enemy = await A.duplicateAdminEntity({ ...original, side: 'B' });
    results.enemy = enemy.side === 'B' && document.getElementById(`Box_Entite_${enemy.id}`).closest('.hex').classList.contains('SideB');
    const G = await import("/js/app/state.js");
    G.setGameOver(false); G.startGame();
    const shift = original.stats.shift.current, hp = original.stats.HP.current;
    const combatCopy = await A.duplicateAdminEntity(original);
    await new Promise(done => setTimeout(done, 150));
    results.combatStarted = combatCopy.speedTimer > 0 && combatCopy.currentPhase === 'Entite Turn';
    results.noFreeRefill = combatCopy.stats.shift.current === shift && combatCopy.stats.HP.current === hp;
    G.StopGame();
    results.saveUntouched = window.__persistent === JSON.stringify(Object.entries(localStorage).sort());
    return results;
  });
  for (const [label, value] of Object.entries(further)) check(value, label);
  const navigation = await page.evaluate(async () => {
    const C = await import("/js/rendering/entities.js");
    const S = await import("/js/storage/gameStorage.js");
    const settle = () => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
    const results = {};
    const writes = [];
    const nativeMethods = {};
    for (const method of ['setItem', 'removeItem', 'clear']) {
      nativeMethods[method] = Storage.prototype[method];
      Storage.prototype[method] = function (...args) {
        if (this === localStorage) writes.push(method);
        return nativeMethods[method].apply(this, args);
      };
    }
    const open = async (entity, shiftKey = false) => {
      C.createEntiteScanInDOM(entity.id);
      await settle();
      const button = document.getElementById(`adminSoulScan_${entity.id}`);
      if (!button) throw Error('Missing admin Codex opener');
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey }));
      const deadline = performance.now() + 5000;
      while (!document.getElementById(`codex-entity_${entity.id}`) && performance.now() < deadline) await settle();
      await settle();
      const codex = document.getElementById(`codex-entity_${entity.id}`);
      if (!codex) throw Error('Admin Codex did not open');
      return codex;
    };
    const tabs = { Stats: 'codex-stat', Attaques: 'codex-attacks', Informations: 'codex-lore', Soul: 'codex-soul', Profil: 'codex-profil' };
    const active = codex => Object.keys(tabs).find(tab => codex.querySelector(`.codex-inner-menu.active .${tabs[tab]}`));
    const close = async codex => {
      codex.querySelector(':scope > .close-button').click();
      await settle();
      if (codex.isConnected) throw Error('Codex did not close');
    };
    try {
      S.saveToLocalStorage('CodexMenuIndex', 1);
      let codex = await open(window.__actor);
      results.initialTab = active(codex) === 'Profil';
      for (const tab of Object.keys(tabs)) {
        codex.querySelector(`.codex-inner-menu:has(.${tabs[tab]})`).click();
        await settle();
        await close(codex);
        codex = await open(window.__copy);
        results[`${tab}: other entity retains last tab`] = active(codex) === tab;
        if (tab === 'Soul') results.soulReset = codex.querySelectorAll('.admin-soul-reset-level').length === 1;
        await close(codex);
        codex = await open(window.__actor);
        results[`${tab}: original entity retains last tab`] = active(codex) === tab;
      }
      codex.querySelector('.codex-inner-menu:has(.codex-stat)').click();
      const second = await open(window.__copy, true);
      results.dualCodex = codex.isConnected && active(codex) === 'Stats' && active(second) === 'Stats';
      await close(second);
      await close(codex);
      results.noPersistentWrites = writes.length === 0 && window.__persistent === JSON.stringify(Object.entries(localStorage).sort());
    } finally {
      for (const [method, native] of Object.entries(nativeMethods)) Storage.prototype[method] = native;
    }
    return results;
  });
  for (const [label, value] of Object.entries(navigation)) check(value, `Admin Codex: ${label}`);
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ checks, errors }, null, 2));
  console.log(`Admin entity actions: ${checks.length} checks passed.`);
} finally {
  await browser.close();
  await new Promise(done => server.close(done));
}
