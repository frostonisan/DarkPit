import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const layoutOnly = process.argv.includes('--layout-only');
const root = resolve('docs'), output = resolve(`outputs/sprite-drops${layoutOnly ? '-layout' : ''}`);
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = resolve(root, '.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname));
  const rel = relative(root, file);
  if (rel === '..' || rel.startsWith('..' + sep)) return res.writeHead(403).end();
  try {
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.gif': 'image/gif' })[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
let browser, page;
const report = { result: 'running', cases: [], errors: [] };
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => report.errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.evaluate(async () => {
    window.__dragAudit = [];
    for (const type of ['dragstart', 'dragover', 'drop', 'dragend']) document.addEventListener(type, event => {
      queueMicrotask(() => {
        window.__dragAudit.push({ type, target: event.target.id || event.target.className, prevented: event.defaultPrevented,
          payload: event.dataTransfer?.getData('text/plain'), effect: event.dataTransfer?.dropEffect });
        if (window.__dragAudit.length > 20) window.__dragAudit.shift();
      });
    }, true);
    const E = await import("/js/entities/runtime.js"), S = await import("/js/storage/gameStorage.js");
    const UI = await import("/js/ui/codex/index.js"), _UI = await import("/js/ui/statistics/helpers.js"), _UI2 = await import("/js/ui/application.js"), _UI3 = await import("/js/ui/inventory.js"), State = await import("/js/app/state.js");
    const M = await import('/js/items/itemManager.js'), Gear = await import('/js/items/equipement.js');
    const R = await import('/js/items/resourceStocks.js'), U = await import("/js/storage/entityStorage.js");
    const C = await import("/js/rendering/entities.js"), AttackUI = await import("/js/ui/attacks.js");
    const Role = await import("/js/rendering/hud.js"), Lord = await import("/js/combat/lordTurn.js");
    const Popup = await import("/js/ui/display.js");
    const { ItemDetails } = await import('/js/data/itemList.js');
    const { entitesNest } = await import("/js/data/entityTemplates.js");
    const template = entitesNest.find(entity => entity.serial === 900013);
    const checks = [], expected = new Map();
    let actor, donor, enemy, sourceId, incoming, previous, targetNode, label;
    const check = (ok, message) => { if (!ok) throw Error(`${label}: ${message}`); checks.push(message); };
    const ownId = entry => typeof entry === 'string' ? entry : entry.itemId;
    const ledger = () => {
      const state = M.getBattleInventoryState(), locations = new Map();
      const add = (id, where) => locations.set(id, [...(locations.get(id) || []), where]);
      state.Playerinventory.forEach(item => add(ownId(item), 'inventory'));
      state.battleSlots.forEach((id, index) => { if (id) add(id, `pouch:${index}`); });
      state.battleGroundItems.forEach(item => add(item.itemId, 'ground'));
      S.loadEquippedItems().forEach(item => add(item.itemId, `gear:${item.equippedTo}:${item.slot}`));
      return Object.fromEntries(locations);
    };
    const verifyLedger = () => {
      const locations = ledger(), registry = S.loadFromLocalStorage('IngameItems', []);
      check(M.validateBattleInventoryState().ok, 'Canonical inventory validates');
      for (const [id, consumed] of expected) {
        check((locations[id]?.length || 0) === (consumed ? 0 : 1), `Exactly ${consumed ? 'zero' : 'one'} location for ${id}`);
        check(registry.filter(item => item.itemId === id).length <= 1, `No duplicate registry record for ${id}`);
        if (consumed) check(!registry.some(item => item.itemId === id), 'Consumed object is absent from registry');
      }
      for (const entity of [actor, donor]) {
        const saved = S.loadFromLocalStorage('selectedArmyA', []).find(row => row.id === entity.id);
        check(JSON.stringify(saved.stuff) === JSON.stringify(entity.stuff), 'Saved and live equipment slots agree');
        for (const [slot, ids] of Object.entries(entity.stuff || {})) for (const id of ids) {
          const item = S.getEquippedItemById(id);
          check(item?.equippedTo === entity.id && item.slot === `${slot}-${entity.id}`, 'Slot and item agree on owner');
        }
      }
      return locations;
    };
    const acquire = name => {
      const item = M.acquireItem(ItemDetails.find(item => item.functionName === name), 'sprite-drop-audit');
      check(Boolean(item), `Acquire ${name}`); expected.set(item.itemId, false); return item;
    };
    const mountTarget = node => {
      check(Boolean(node), 'Production target exists');
      const marker = node.closest('[data-dropable]');
      check(marker?.dataset.dropable === 'true', 'Production target advertises dropable=true');
      // Keep actual generated nodes and listeners; isolate their layout for native drag hit-testing.
      const root = marker;
      document.getElementById('drop-target-mount').append(root);
      root.style.cssText = 'position:relative!important;display:block!important;visibility:visible!important;opacity:1!important;transform:none!important;width:150px!important;height:150px!important;pointer-events:auto!important;overflow:visible!important;animation:none!important';
      if (node !== root) node.style.cssText += ';position:absolute!important;inset:0!important;display:block!important;visibility:visible!important;opacity:1!important;width:150px!important;height:150px!important;transform:none!important;animation:none!important';
      node.dataset.auditDropTarget = 'true';
      targetNode = node;
    };
    const buildTarget = async kind => {
      const mount = document.getElementById('drop-build');
      let node;
      if (kind.startsWith('codex-')) {
        if (kind === 'codex-scan') {
          UI.createCodexEntityScan(actor, mount, `codex-entity_${actor.id}`);
          node = mount.querySelector('.codex-scan-image');
        } else {
          UI.createEntityCodex(actor, mount);
          node = mount.querySelector({ 'codex-entry': '.codex-entity-list', 'codex-sprite': '.codex-entity-sprite', 'codex-container': '.codex-entity-sprite-container' }[kind]);
        }
      } else if (kind.startsWith('battle-')) {
        const created = C.createEntiteInDOM(actor); mount.append(created.element); await created.spriteReady;
        node = created.element.querySelector({ 'battle-sprite': '.sprite', 'battle-canvas': '.sprite canvas', 'battle-container': '.sprite-container' }[kind]);
      } else if (kind.startsWith('hud-')) {
        C.createHeadUpInDom(actor.id);
        node = document.querySelector({ 'hud-image': `#portrait_${actor.id}`, 'hud-frame': `#portrait-container_${actor.id} .portrait-cadre`, 'hud-container': `#portrait-container_${actor.id}` }[kind]);
      } else if (kind === 'scan-image') {
        const created = C.createEntiteInDOM(actor); mount.append(created.element); await created.spriteReady;
        C.createHeadUpInDom(actor.id); C.createEntiteScanInDOM(actor.id);
        node = document.querySelector(`#ScanEntity_${actor.id} .entite-details-image`);
      } else if (kind.startsWith('attack-')) {
        const panel = AttackUI.showCombatAttackControlPanel(actor.id);
        node = panel?.querySelector(kind === 'attack-portrait' ? '.combat-attack-control-portrait' : '.combat-attack-control-portrait img');
      } else if (kind.startsWith('lord-')) {
        const lord = E.enrichEntityStats({ ...structuredClone(entitesNest.find(entity => entity.type === 'lord')), id: 996104, side: 'B', level: 1 });
        E.entites.push(lord);
        const created = C.createEntiteInDOM(lord); mount.append(created.element); await created.spriteReady;
        C.createHeadUpInDom(lord.id); C.createEntiteScanInDOM(lord.id);
        if (kind === 'lord-current') {
          Lord.updateLordRoleImg(lord.id, actor); node = document.getElementById(`Targetrole-img_${lord.id}`);
        } else {
          Role.listingFocusLord(lord.id, [actor, donor]); node = document.querySelector(`#lord_${lord.id}_target-1 .lord-target-pic`);
        }
        // Portrait identity must win over the enclosing Lord's identity.
      } else if (kind === 'catalogue') {
        const card = M.createAllItems(actor, { source: 'shop' }); mount.append(card); node = card.querySelector('.item-icon');
      }
      mountTarget(node);
    };
    const mountSource = id => {
      sourceId = id;
      const item = M.getIngameItemById(id), img = document.createElement('img');
      img.id = id; img.className = 'inventory-item-icon'; img.dataset.dragItemId = id;
      img.src = item.itemAsset; img.style.cssText = 'width:80px;height:80px;display:block';
      M.setupDragAndDropItem(img, id);
      document.getElementById('drop-source-mount').replaceChildren(img);
      img.dataset.auditDropSource = 'true';
    };
    const drop = (id = sourceId, node = targetNode) => {
      const dataTransfer = new DataTransfer(); dataTransfer.setData('text/plain', id);
      dataTransfer.setData('application/x-game-item', id);
      node.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }));
      node.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
    };
    window.__drops = {
      checks, check, ledger, verifyLedger, drop,
      async setup(mode, kind, action) {
        label = `${mode}/${kind}/${action}`; checks.length = 0; expected.clear();
        AttackUI.hideCombatAttackControlPanel(); Popup.dismissGamePopups(); _UI.closeOpenHelpers(); M.clearItemDescriptions();
        State.StopGame(); State.resetBattleResolution();
        window.levelRunning = 'worldmap'; S.setAdminMode(false); State.refreshStageAccess();
        document.body.replaceChildren(); _UI2.createGameContainer(); _UI2.GameUi();
        document.getElementById('game-windows').style.opacity = '1';
        document.body.insertAdjacentHTML('beforeend', '<section id="drop-build" style="position:fixed;left:-5000px"></section><section id="drop-source-mount" style="position:fixed;left:40px;top:200px;z-index:1000"></section><section id="drop-target-mount" style="position:fixed;left:650px;top:170px;z-index:1000;width:160px;height:160px"></section>');
        const make = (id, side) => {
          const entity = E.enrichEntityStats({ ...structuredClone(template), id, side, name: `Drop ${id}`, awakening: 1,
            level: 1, attacks: ['shot-p-r'], baseStats: { HP: 100, shift: 10, agility: 17, charge: 1 },
            stats: {}, modifierStats: {}, stuff: {}, resourceStocks: {} });
          entity.battleStopped = true; return entity;
        };
        actor = make(996101, 'A'); donor = make(996102, 'A'); enemy = make(996103, 'B');
        E.entites.splice(0, E.entites.length, actor, donor, enemy);
        window.selectedArmyA = [actor, donor];
        S.saveToLocalStorage('selectedArmyA', [actor, donor]); S.saveToLocalStorage('equippedItems', []);
        S.saveToLocalStorage('IngameItems', []);
        for (const bucket of ['PlayerSave', 'IngameItemsData']) S.saveToLocalStorage(bucket, { items: [], Playerinventory: [], equippedItems: [], battleSlots: [null, null, null, null], battleGroundItems: [] });
        S.savePlayerInfo({ battleSlotCount: 4 });
        localStorage.setItem('inventoryEquippedStuffTransferConfirmHidden', 'true');
        if (action === 'consume' || action === 'reject-inventory') incoming = acquire('MovementCharge');
        else incoming = acquire('DevMovementCurrentFive');
        if (['transfer', 'swap', 'cancel', 'reject-swap'].includes(action)) {
          check(Gear.equip({ item: incoming, targetEntity: donor, slotId: `slot1-${donor.id}` }), 'Arrange donor equipment');
          R.spendMovementCharges(donor, 2); U.saveEntityMovementState(donor);
          sourceId = `e${incoming.itemId}`;
        } else sourceId = incoming.itemId;
        if (['swap', 'cancel', 'replace', 'reject-swap'].includes(action)) {
          previous = acquire('DevMovementMixed');
          check(Gear.equip({ item: previous, targetEntity: actor, slotId: `slot1-${actor.id}` }), 'Arrange occupied target');
        } else previous = null;
        if (mode !== 'map') {
          if (action === 'consume') check(M.moveBattleItem(incoming.itemId, 0), 'Prepare battle consumable');
          window.levelRunning = mode === 'admin-combat' ? 'admin' : 'scripted';
          S.setCurrentLevel('sprite-drop-test'); window.currentStageId = 'sprite-drop-test';
          S.setAdminMode(mode === 'admin-combat'); State.refreshStageAccess(); State.startGame();
        }
        await buildTarget(kind); mountSource(sourceId);
        this.before = { ledger: ledger(), shift: actor.stats.shift.current, donorShift: donor.stats.shift.current,
          sourceSlot: donor.stuff.slot1?.[0], targetSlot: actor.stuff.slot1?.[0] };
        this.action = action; this.mode = mode;
        this.ready = true;
      },
      confirm(accept = true) {
        const button = document.querySelector(`.inventory-transfer-confirm-actions ${accept ? '.primary' : 'button:not(.primary)'}`);
        check(Boolean(button), 'Replacement confirmation exists'); button.click();
      },
      inspect() {
        const { action, mode, before } = this;
        if (action === 'consume') {
          check(actor.stats.shift.current === before.shift + 1, 'Exactly one charge reaches the intended entity');
          check(donor.stats.shift.current === before.donorShift, 'Other entity remains unchanged');
          expected.set(incoming.itemId, true);
        } else if (mode === 'combat' || action === 'cancel' || action === 'reject-inventory') {
          check(JSON.stringify(ledger()) === JSON.stringify(before.ledger), 'Rejected or cancelled drag changes no location');
          check(actor.stats.shift.current === before.shift && donor.stats.shift.current === before.donorShift, 'Rejected drag changes no reserve');
        } else {
          check(actor.stuff.slot1?.[0] === `e${incoming.itemId}`, 'Incoming equipment has the intended owner');
          check(S.getEquippedItemById(`e${incoming.itemId}`).resourceStocks.shift.current === (['swap', 'transfer'].includes(action) ? 3 : 5), 'Equipment keeps its remaining stock');
          if (action === 'swap') check(donor.stuff.slot1?.[0] === `e${previous.itemId}`, 'Swap sends replaced gear to donor');
          if (action === 'replace') check(M.getBattleInventoryState().Playerinventory.some(item => ownId(item) === previous.itemId), 'Inventory replacement returns old gear to inventory');
        }
        const locations = verifyLedger();
        return { label, checks: [...checks], locations };
      },
      settled() {
        if (this.action === 'consume') return !M.getBattleInventoryState().Playerinventory.some(item => ownId(item) === incoming.itemId)
          && !M.getBattleInventoryState().battleSlots.includes(incoming.itemId);
        return actor.stuff.slot1?.[0] === `e${incoming.itemId}`;
      },
      replay() { drop(sourceId); },
      async realMap(action) {
        await this.setup('map', 'codex-sprite', action === 'slot-swap' ? 'swap' : action);
        label = `full-layout/map/${action}`;
        document.querySelectorAll('#drop-build, #drop-source-mount, #drop-target-mount').forEach(node => node.remove());
        _UI2.initializeArmyConfig();
        document.querySelector('.army-codex-icon').click(); _UI3.createInventory();
        document.querySelector(`[data-inventory-tab="${action === 'consume' ? 'objects' : 'equipment'}"]`).click();
        if (action === 'slot-swap') {
          _UI3.createInventory(); UI.EntityCodexDetails(donor.id);
          return { source: `.stuff-slot img[id="${sourceId}"]`, target: `#CodexEntityList_${actor.id} .codex-entity-sprite` };
        }
        if (action === 'swap') document.querySelector('[data-inventory-show-used]').click();
        return { source: `.inventory-interface [data-item-id="${sourceId}"] img`,
          target: `#CodexEntityList_${actor.id} .codex-entity-sprite` };
      },
      async realBattle() {
        await this.setup('map', 'codex-sprite', 'consume');
        label = 'full-layout/combat';
        document.querySelectorAll('#drop-build, #drop-source-mount, #drop-target-mount').forEach(node => node.remove());
        for (const entity of [actor, donor, enemy]) {
          entity.baseStats.HP = 5000; entity.baseStats.speed = 1000;
          delete entity.battleStopped; E.recomputeEntityStats(entity);
          entity.stats.HP.current = entity.stats.HP.max;
        }
        S.saveToLocalStorage('selectedArmyA', [actor, donor]);
        check(M.moveBattleItem(incoming.itemId, 0), 'Prepare real battle pouch');
        for (let index = 1; index < 4; index++) check(M.moveBattleItem(acquire('MovementCharge').itemId, index), 'Fill real battle pouch');
        _UI2.initializeArmyConfig();
        const MapUI = await import("/js/app/worldMap.js");
        MapUI.rebuildWorldMapLevelButtons();
        const stageId = document.querySelector('.level-button.scripted').dataset.storageid;
        S.saveToLocalStorage('ArmyB', { armies: { [`ArmyB_${stageId}`]: { entities: [enemy], ArmyB_id: `ArmyB_${stageId}` } } });
        document.querySelectorAll('.entitylootContainer, #black-overlay').forEach(node => node.remove());
      },
      captureBattleDrop(index) {
        actor = E.entites.find(entity => entity.id === actor.id);
        donor = E.entites.find(entity => entity.id === donor.id);
        label = `full-layout/combat/drop-${index}`;
        checks.length = 0;
        sourceId = M.getBattleInventoryState().battleSlots[index];
        incoming = M.getIngameItemById(sourceId);
        this.action = 'consume'; this.before.shift = actor.stats.shift.current; this.before.donorShift = donor.stats.shift.current;
        return { source: `.battle-satchel--combat img[data-drag-item-id="${sourceId}"]` };
      },
      async challenge(name) {
        const wait = () => new Promise(done => setTimeout(done, 100));
        const pendingSwap = ['stale-target', 'stale-source', 'access-changed', 'duplicate-swap'].includes(name);
        await this.setup(name.startsWith('combat-') ? 'combat' : 'map', 'codex-sprite', pendingSwap ? 'swap' : name.includes('stock') ? 'transfer' : 'consume');
        label = `adversarial/${name}`;
        if (name === 'duplicate-consume' || name === 'combat-duplicate-consume') {
          drop(); drop(); await wait(); this.inspect();
          const shift = actor.stats.shift.current;
          drop(); await wait();
          check(actor.stats.shift.current === shift, 'Replayed consumed ID cannot apply again');
        } else if (pendingSwap) {
          drop(); await wait();
          check(Boolean(document.querySelector('.equipment-swap-choice')), 'Real swap confirmation is pending');
          if (name === 'stale-target') {
            const other = acquire('DevMovementMaxThree');
            check(Gear.equip({ item: other, targetEntity: actor, slotId: `slot1-${actor.id}` }), 'Target equipment changes while confirmation is open');
          } else if (name === 'stale-source') {
            Gear.unequip({ slotId: `slot1-${donor.id}`, targetEntity: donor });
          } else if (name === 'access-changed') {
            window.levelRunning = 'scripted'; S.setCurrentLevel('sprite-drop-test');
            window.currentStageId = 'sprite-drop-test'; State.refreshStageAccess(); State.startGame();
          } else { drop(); drop(); }
          const beforeConfirm = JSON.stringify(ledger());
          if (document.querySelector('.equipment-swap-choice')) this.confirm();
          await wait();
          if (name === 'duplicate-swap') this.inspect();
          else check(JSON.stringify(ledger()) === beforeConfirm, 'Stale confirmation never moves or duplicates an item');
        } else if (name === 'empty-stock' || name === 'partial-stock') {
          if (name === 'empty-stock') { R.spendMovementCharges(donor, 3); U.saveEntityMovementState(donor); }
          const remaining = name === 'empty-stock' ? 0 : 3;
          drop(); await wait();
          check(actor.stuff.slot1?.[0] === `e${incoming.itemId}`, 'Stock test reaches new owner');
          check(S.getEquippedItemById(`e${incoming.itemId}`).resourceStocks.shift.current === remaining, 'Transferred stock never refills');
          const beforeReplay = JSON.stringify(ledger()), beforeShift = actor.stats.shift.current;
          drop(`e${incoming.itemId}`); await wait();
          check(JSON.stringify(ledger()) === beforeReplay && actor.stats.shift.current === beforeShift, 'Dropping onto its current owner is a no-op');
          S.saveItemsData(); S.loadItemsData();
          check(S.getEquippedItemById(`e${incoming.itemId}`).resourceStocks.shift.current === remaining, 'Saved equipment preserves remaining stock');
        } else if (name === 'combat-enemy') {
          targetNode.dataset.entityId = enemy.id;
          const hp = enemy.stats.shift.current;
          drop(); await wait();
          expected.set(incoming.itemId, true);
          check(enemy.stats.shift.current === hp + 1 && actor.stats.shift.current === this.before.shift, 'Enemy portrait resolves its own entity, never the ally');
        } else {
          if (name === 'disabled-sprite') targetNode.dataset.dropable = 'false';
          else if (name === 'unmarked-sprite') delete targetNode.dataset.dropable;
          else if (name === 'unowned-sprite') targetNode.dataset.entityId = '999999999';
          else if (name === 'starter-unowned') {
            _UI2.EntityNewGameStarter([E.entitesNestUp[0].id], 'drop-build');
            mountTarget(document.querySelector('.entite-loot-img'));
          }
          else if (name === 'dead-target') { actor.stats.HP.current = 0; actor.isDEAD = true; actor.statut = ['dead']; }
          else if (name === 'invalid-payload') { drop('not-an-item'); await wait(); }
          if (name !== 'invalid-payload') drop();
          await wait();
          check(JSON.stringify(ledger()) === JSON.stringify(this.before.ledger), 'Invalid target or payload leaves the item at its original location');
          check(actor.stats.shift.current === this.before.shift, 'Rejected drop applies no effect');
        }
        const locations = verifyLedger();
        return { label, checks: [...checks], locations };
      },
    };
  });
  const mapKinds = ['codex-entry', 'codex-container', 'codex-sprite', 'codex-scan', 'catalogue'];
  const combatKinds = ['battle-container', 'battle-sprite', 'battle-canvas', 'hud-container', 'hud-image', 'hud-frame', 'scan-image', 'attack-portrait', 'attack-image', 'lord-current', 'lord-list'];
  if (!layoutOnly) for (const mode of ['map', 'admin-combat', 'combat']) {
    const kinds = mode === 'map' ? mapKinds : mode === 'admin-combat' ? [...mapKinds, ...combatKinds] : combatKinds;
    const actions = mode === 'combat' ? ['consume', 'reject-inventory', 'reject-swap'] : ['consume', 'equip', 'replace', 'transfer', 'swap', 'cancel'];
    for (const kind of kinds) for (const action of actions) {
      await page.evaluate(({ mode, kind, action }) => window.__drops.setup(mode, kind, action), { mode, kind, action });
      // Native HTML drag tests payload, dragover, drop and dragend together.
      await page.locator('[data-audit-drop-source]').dragTo(page.locator('[data-audit-drop-target]'), { force: true });
      if (mode !== 'combat' && ['replace', 'swap', 'cancel'].includes(action)) {
        await page.locator('select[aria-label="Équipement à remplacer"]').waitFor({ state: 'visible', timeout: 5000 });
        await page.evaluate(accept => window.__drops.confirm(accept), action !== 'cancel');
      }
      if (action === 'consume' || mode !== 'combat' && action !== 'cancel') {
        await page.waitForFunction(() => window.__drops.settled(), null, { timeout: 5000 });
      } else await page.waitForTimeout(100);
      const result = await page.evaluate(() => window.__drops.inspect());
      report.cases.push(result);
      console.log(`PASS ${result.label}: ${result.checks.length} checks`);
      if (kind === 'battle-canvas' && action === 'consume') await page.screenshot({ path: resolve(output, `${mode}-canvas.png`) });
    }
  }
  if (!layoutOnly) for (const name of ['duplicate-consume', 'combat-duplicate-consume', 'duplicate-swap', 'stale-target', 'stale-source', 'access-changed',
    'empty-stock', 'partial-stock', 'disabled-sprite', 'unmarked-sprite', 'unowned-sprite', 'starter-unowned', 'dead-target', 'invalid-payload', 'combat-enemy']) {
    const result = await page.evaluate(name => window.__drops.challenge(name), name);
    report.cases.push(result);
    console.log(`PASS ${result.label}: ${result.checks.length} checks`);
  }
  await page.setViewportSize({ width: 1536, height: 960 });
  for (const action of ['consume', 'equip', 'swap', 'slot-swap']) {
    const selectors = await page.evaluate(action => window.__drops.realMap(action), action);
    await page.locator(selectors.source).dragTo(page.locator(selectors.target));
    if (action === 'swap' || action === 'slot-swap') {
      await page.locator('.equipment-swap-choice').waitFor({ state: 'visible' });
      await page.evaluate(() => window.__drops.confirm());
    }
    await page.waitForFunction(() => window.__drops.settled(), null, { timeout: 5000 });
    const result = await page.evaluate(() => window.__drops.inspect());
    report.cases.push(result); console.log(`PASS ${result.label}: ${result.checks.length} checks`);
    await page.screenshot({ path: resolve(output, `full-map-${action}.png`) });
  }
  await page.evaluate(() => window.__drops.realBattle());
  await page.locator('.level-button.scripted').first().click();
  await page.locator('.loading-h2.loaded').waitFor({ timeout: 45000 });
  await page.locator('.loading-h2.loaded').click();
  await page.waitForFunction(() => {
    const hud = document.querySelector('.hud-ingame');
    return !document.querySelector('.loading-screen') && document.querySelector('#startButton')
      && hud?.style.opacity === '1' && hud.style.transition === '';
  }, null, { timeout: 30000 });
  await page.locator('#startButton').click();
  await page.waitForFunction(async () => {
    const { entites } = await import("/js/entities/runtime.js");
    return entites.every(entity => entity.turnCount >= 1 && entity.currentPhase);
  });
  // Freeze the fixture's action timers, not access rules, so drag assertions cannot race a turn refill.
  await page.evaluate(async () => {
    const { entites } = await import("/js/entities/runtime.js");
    for (const entity of entites) entity.battleStopped = true;
    const State = await import("/js/app/state.js"); State.stopAllIntervals();
  });
  for (const [index, target] of ['#DragSprite_996101', '#portrait-container_996101', '#ScanEntity_996101 .entite-details-image', '.combat-attack-control-portrait'].entries()) {
    if (index === 1) await page.evaluate(async () => (await import("/js/rendering/entities.js")).createHeadUpInDom(996101));
    if (index === 2) await page.evaluate(async () => (await import("/js/ui/display.js")).toggleScanEntity('ScanEntity_996101', false));
    if (index === 3) await page.evaluate(async () => {
      (await import("/js/ui/display.js")).toggleScanEntity('ScanEntity_996101', false);
      (await import("/js/ui/attacks.js")).showCombatAttackControlPanel(996101);
    });
    const selectors = await page.evaluate(index => window.__drops.captureBattleDrop(index), index);
    await page.locator(selectors.source).hover();
    await page.waitForTimeout(80);
    const sourcePoint = await page.locator(selectors.source).evaluate(node => {
      const rect = node.getBoundingClientRect();
      const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
      window.__drops.check(node === document.elementFromPoint(x, y), 'Hovered pouch item stays reachable beneath its helper');
      return { x, y };
    });
    const targetPoint = await page.locator(target).evaluate(node => {
      const rect = node.getBoundingClientRect(), x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
      window.__drops.check(node.contains(document.elementFromPoint(x, y)), 'Real portrait or sprite receives pointer events');
      return { x, y };
    });
    // The pouch icon deliberately animates on hover; use real mouse movement without a stability wait.
    await page.mouse.move(sourcePoint.x, sourcePoint.y);
    await page.mouse.down();
    await page.mouse.move(sourcePoint.x - 12, sourcePoint.y, { steps: 3 });
    await page.mouse.move(targetPoint.x, targetPoint.y, { steps: 12 });
    await page.mouse.up();
    await page.waitForFunction(() => window.__drops.settled(), null, { timeout: 5000 });
    const result = await page.evaluate(() => window.__drops.inspect());
    report.cases.push(result); console.log(`PASS ${result.label}: ${result.checks.length} checks`);
    await page.screenshot({ path: resolve(output, `full-combat-${index}.png`) });
  }
  assert.deepEqual(report.errors, []);
  report.result = 'passed';
  report.checkCount = report.cases.reduce((sum, row) => sum + row.checks.length, 0);
} catch (error) {
  report.result = 'failed'; report.failure = error.stack;
  if (page) {
    await page.screenshot({ path: resolve(output, 'failure.png') }).catch(() => {});
    report.failureState = await page.evaluate(() => ({ label: window.__drops?.action, ledger: window.__drops?.ledger(), trace: window.__dragAudit,
      checks: window.__drops?.checks, targets: [...document.querySelectorAll('[data-audit-drop-target]')].map(node => node.outerHTML.slice(0, 1000)) })).catch(() => null);
  }
  throw error;
} finally {
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  await browser?.close();
  await new Promise(done => server.close(done));
}
