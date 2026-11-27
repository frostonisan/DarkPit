import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('docs');
const output = resolve('outputs/life-auras');
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  const file = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  const rel = relative(root, file);
  if (rel === '..' || rel.startsWith('..' + sep)) return res.writeHead(403).end();
  try {
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' })[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
let browser, page;
const checks = [];
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  checks.push(...await page.evaluate(async () => {
    const E = await import("/js/entities/runtime.js");
    const S = await import("/js/storage/gameStorage.js");
    const UI = await Promise.all([import("/js/ui/application.js"), import("/js/ui/attacks.js"), import("/js/ui/codex/index.js"), import("/js/ui/codex/profile.js"), import("/js/ui/codex/stats.js"), import("/js/ui/dialogue.js"), import("/js/ui/display.js"), import("/js/ui/drag.js"), import("/js/ui/essences.js"), import("/js/ui/inventory.js"), import("/js/ui/navigation.js"), import("/js/ui/statistics/components.js"), import("/js/ui/statistics/details.js"), import("/js/ui/statistics/helpers.js")]).then(parts => Object.defineProperties({}, Object.fromEntries(parts.flatMap(part => Object.keys(part).map(key => [key, { enumerable: true, get: () => part[key] }])))));
    const M = await import('/js/items/itemManager.js');
    const Gear = await import('/js/items/equipement.js');
    const A = await import("/js/combat/vitals.js"), _A = await import("/js/rendering/vitalFeedback.js");
    const R = await import('/js/items/resourceStocks.js');
    const Aura = await import("/js/rendering/auras.js");
    const U = await import("/js/ui/statistics/components.js");
    const Store = await import("/js/storage/entityStorage.js");
    const G = await import("/js/app/stages.js");
    const State = await import("/js/app/state.js");
    const { ItemDetails } = await import('/js/data/itemList.js');
    const passed = [];
    const check = (ok, label) => { if (!ok) throw Error(label); passed.push(label); };
    window.levelRunning = 'worldmap'; State.refreshStageAccess(); S.setAdminMode(true);
    localStorage.setItem('gameDay', '1');
    const entities = [981201, 981202].map(id => {
      const entity = { ...structuredClone(E.entitesNestUp[0]), id, side: 'A', awakening: 1,
        level: { current: 1, max: 250 }, baseStats: { HP: 100, charge: 5 },
        stats: {}, modifierStats: {}, stuff: {}, statut: ['alive'] };
      E.recomputeEntityStats(entity, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
      return entity;
    });
    const [actor, recipient] = entities;
    E.entites.splice(0, E.entites.length, ...entities);
    S.saveToLocalStorage('equippedItems', []); S.saveToLocalStorage('selectedArmyA', entities);
    S.saveToLocalStorage('PlayerSave', { Playerinventory: [], equippedItems: [] });
    S.saveToLocalStorage('IngameItemsData', { Playerinventory: [], equippedItems: [] });
    const host = document.createElement('main'); host.id = 'life-aura-audit';
    host.style.cssText = 'position:fixed;inset:0;background:#171717;z-index:100;display:grid;grid-template-columns:repeat(2,1fr);gap:24px;padding:70px;overflow:auto';
    document.body.append(host);
    for (const entity of entities) for (const context of ['battle', 'codex']) {
      const surface = document.createElement('section');
      surface.style.cssText = 'min-height:230px;text-align:center;color:white';
      const name = document.createElement('h2'); name.textContent = `${entity.id} / ${context}`;
      const sprite = document.createElement('div'); sprite.style.cssText = 'position:relative;width:160px;height:150px;margin:65px auto 10px';
      sprite.id = context === 'battle' ? `spriteContainer_${entity.id}` : `codex-surface_${entity.id}`;
      const img = document.createElement('img'); img.src = entity.sprite; img.style.cssText = 'width:160px;height:150px;object-fit:contain';
      if (context === 'codex') img.id = `codex-image_${entity.id}`;
      const container = document.createElement('div'); container.className = 'aura-container';
      container.id = `auraContainer_${context === 'codex' ? 'codex_' : ''}${entity.id}`;
      container.style.cssText = 'position:absolute;inset:0';
      sprite.append(img, container); surface.append(name, sprite); host.append(surface);
    }
    const assertAuras = (entity, expected, label) => {
      for (const context of ['battle', 'codex']) {
        const container = document.getElementById(`auraContainer_${context === 'codex' ? 'codex_' : ''}${entity.id}`);
        for (const key of ['fadedLife', 'extraLife', 'eternalLife']) {
          check(container.querySelectorAll(`.life-aura-anim.anim-${key}`).length === Number(expected.includes(key)), `${label}/${context}/${key}`);
        }
        check(container.querySelectorAll(':scope > .life-sup').length === Number(expected.length > 0), `${label}/${context}: no duplicate root`);
      }
    };
    const acquire = name => M.acquireItem(ItemDetails.find(item => item.functionName === name), 'life-aura-audit');
    const spend = (entity, key) => {
      while (Aura.getAuraPoolCurrent(entity, key) > 0) {
        if (key === 'fadedLife') { R.consumeFadedLife(entity); Store.saveEntityfadedLifeToStorage(entity); }
        else if (key === 'extraLife') A.extraLifeConsumption(entity);
        else A.eternalLifeConsumption(entity);
        _A.updateBonusLifeCounters(entity);
      }
    };
    assertAuras(actor, [], 'Initially no life');
    for (const name of ['FadedLifeCharge', 'DevExtraLifeConsumable', 'DevAbsoluteLifeConsumable']) {
      const item = acquire(name);
      check((await M.useConsumableItem(item.itemId, actor, { silent: true })).ok, `${name}: consumed through real inventory`);
      assertAuras(actor, ['fadedLife'], `${name}: immediate correct aura`);
      check(!M.getIngameItemById(item.itemId), `${name}: consumed exactly once`);
      spend(actor, 'fadedLife'); assertAuras(actor, [], `${name}: last charge removed`);
    }
    let gearSlot = 0;
    for (const [key, name] of [['fadedLife', 'DevFadedLifeReserve'], ['extraLife', 'DevExtraLifeThreeDays'], ['eternalLife', 'DevAbsoluteLifeTwo']]) {
      const slot = `slot${++gearSlot}`;
      const item = acquire(name);
      check(Gear.equip({ item, targetEntity: actor, slotId: `${slot}-${actor.id}` }), `${key}: equip`);
      assertAuras(actor, [key], `${key}: equip creates aura synchronously`);
      for (let i = 0; i < 3; i++) U.syncDOMWithStats({}, actor.stats, actor.id, actor);
      assertAuras(actor, [key], `${key}: repeated refresh is idempotent`);
      const equippedId = actor.stuff[slot][0];
      check(Gear.equip({ item: S.getEquippedItemById(equippedId), sourceEntity: actor,
        targetEntity: recipient, slotId: `${slot}-${recipient.id}` }), `${key}: transfer`);
      assertAuras(actor, [], `${key}: former owner cleared`);
      assertAuras(recipient, [key], `${key}: new owner updated`);
      spend(recipient, key); assertAuras(recipient, [], `${key}: empty reserve cleared`);
      check(Gear.equip({ item: S.getEquippedItemById(equippedId), sourceEntity: recipient,
        targetEntity: actor, slotId: `${slot}-${actor.id}` }), `${key}: exhausted transfer`);
      assertAuras(actor, [], `${key}: empty gear does not recreate an aura`);
      if (key !== 'fadedLife') {
        const day = Number(localStorage.getItem('gameDay')) + 6;
        localStorage.setItem('gameDay', String(day));
        if (key === 'extraLife') G.bumpExtraLifeRegenInStorage(6, day);
        else G.bumpEternalLifeRegenInStorage(6, day);
        assertAuras(actor, [key], `${key}: daily recovery creates aura`);
      }
      Gear.unequip({ targetEntity: actor, slotId: `${slot}-${actor.id}` });
      assertAuras(actor, [], `${key}: unequip clears aura`);
    }
    // Fresh snapshot: removing one aura must not depend on cached DOM references.
    R.addFadedLife(actor, 1, 'spell'); _A.updateBonusLifeCounters(actor);
    assertAuras(actor, ['fadedLife'], 'Spell gain uses shared refresh');
    const extra = acquire('DevExtraLifeThreeDays');
    Gear.equip({ item: extra, targetEntity: actor, slotId: `slot4-${actor.id}` });
    assertAuras(actor, ['fadedLife', 'extraLife'], 'Different life types coexist');
    const snapshot = { id: actor.id, stats: { ...actor.stats, fadedLife: 0 } };
    _A.updateBonusLifeCounters(snapshot);
    assertAuras(actor, ['extraLife'], 'Snapshot removes only spent life type');
    const image = document.querySelector(`#auraContainer_${actor.id} .life-aura-img--extraLife`);
    _A.updateBonusLifeCounters(snapshot);
    check(image === document.querySelector(`#auraContainer_${actor.id} .life-aura-img--extraLife`), 'Unchanged aura keeps the same animated image');
    spend(actor, 'fadedLife');
    Gear.unequip({ targetEntity: actor, slotId: `slot4-${actor.id}` });
    assertAuras(actor, [], 'All snapshots cleared');
    check(!Object.values(actor).some(value => value instanceof Node), 'Counter updates do not add DOM nodes to save data');

    const combatItem = acquire('FadedLifeCharges');
    M.setBattleSlotCount(3, { admin: true });
    check(M.moveBattleItem(combatItem.itemId, 0), 'Life consumable prepared in battle pouch');
    E.entites.splice(0, E.entites.length);
    window.levelRunning = 'aura-test'; State.startGame();
    E.entites.push(...entities); State.refreshStageAccess();
    check(State.getStageAccess().battleActive, 'Real combat inventory access active');
    check((await M.useConsumableItem(combatItem.itemId, actor, { silent: true })).ok, 'Battle pouch life consumed');
    assertAuras(actor, ['fadedLife'], 'Combat consumable creates aura before next frame or turn');
    check(!M.getBattleInventoryState().battleSlots.includes(combatItem.itemId), 'Battle item removed from pouch');
    check(actor.stats.fadedLife === 3, 'All three consumable lives credited');
    spend(actor, 'fadedLife'); assertAuras(actor, [], 'Combat last charge removes aura immediately');
    R.addFadedLife(actor, 1, 'spell'); _A.updateBonusLifeCounters(actor);
    actor.stats.HP.current = 0; _A.updateBonusLifeCounters(actor);
    assertAuras(actor, [], 'No aura on dead entity');
    actor.stats.HP.current = 100; _A.updateBonusLifeCounters(actor);
    assertAuras(actor, ['fadedLife'], 'Living entity restores its remaining life aura');
    const other = { id: recipient.id, stats: { ...recipient.stats, extraLife: { current: 1, max: 1 }, eternalLife: { current: 1, max: 1 } } };
    _A.updateBonusLifeCounters(other);
    window.__lifeAuraAudit = { actor, recipient, UI };
    return passed;
  }));
  await page.waitForFunction(() => [...document.querySelectorAll('#life-aura-audit .life-aura-img')].every(img => img.complete && img.naturalWidth > 0));
  await page.screenshot({ path: resolve(output, 'live-life-auras.png') });
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ count: checks.length, checks }, null, 2));
  console.log(JSON.stringify({ count: checks.length, last: checks.slice(-8) }));
} catch (error) {
  await page?.screenshot({ path: resolve(output, 'failure.png') }).catch(() => {});
  throw error;
} finally {
  await browser?.close();
  await new Promise(done => server.close(done));
}
