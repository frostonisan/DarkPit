import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = resolve('docs');
const output = resolve('outputs/item-swap-helpers');
await mkdir(output, { recursive: true });
const mime = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const path = resolve(root, '.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname));
  const rel = relative(root, path);
  if (rel === '..' || rel.startsWith('..' + sep)) return res.writeHead(403).end();
  try { res.setHeader('Content-Type', mime[extname(path)] || 'application/octet-stream'); res.end(await readFile(path)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
let page;
try {
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.evaluate(async () => {
    const E = await import("/js/entities/runtime.js"), S = await import("/js/storage/gameStorage.js");
    const UI = await import("/js/ui/statistics/helpers.js"), _UI = await import("/js/ui/codex/profile.js"), M = await import('/js/items/itemManager.js');
    const Gear = await import('/js/items/equipement.js'), R = await import('/js/items/resourceStocks.js');
    const A = await import('/js/items/armor.js'), U = await import("/js/storage/entityStorage.js");
    const State = await import("/js/app/state.js"), { ItemDetails } = await import('/js/data/itemList.js');
    let actors, cards, helper, kind, stockSnapshot;
    const check = (ok, label) => { if (!ok) throw Error(label); };
    const stockState = () => JSON.stringify(S.loadEquippedItems().map(item => ({ id: item.equippedId,
      stock: item.resourceStocks, armor: item.armorReserve })).sort((a, b) => a.id.localeCompare(b.id)));
    const currentRow = card => card.querySelector('.stuff-stat-resource-reserve[data-stat="shift"]');
    const maximumRow = card => card.querySelector('.stuff-stat-row[data-stat="shift"]:not(.stuff-stat-resource-reserve)');
    const host = () => {
      const row = kind.endsWith('current') ? currentRow(cards[0]) : maximumRow(cards[0]);
      return kind.startsWith('efficiency') ? row.querySelector('[data-orfevre-detail]') : row;
    };
    window.__itemSwap = {
      setup(context, nextKind, { zeroEfficiency = false } = {}) {
        kind = nextKind;
        UI.closeOpenHelpers(); M.clearItemDescriptions();
        document.body.innerHTML = '<div class="Game-helper"></div><main id="item-swap-audit"></main>';
        window.levelRunning = context === 'map' ? 'worldmap' : 'item-swap-audit';
        S.setAdminMode(true); State.refreshStageAccess();
        const effect = (stat, value) => ({ type: 'stat-buff', stat, value });
        const template = ItemDetails.find(item => item.functionName === 'DevMovementMixed');
        const items = [0, 1].map(index => ({ ...structuredClone(template), displayName: `Swap ${index + 1}`,
          itemId: `i-helper-swap-${index}`, equippedId: `ei-helper-swap-${index}`, equippedTo: 971910 + index,
          slot: `slot1-${971910 + index}`, Stuffeffets: [effect('shift', { current: 5, max: 3 - index }),
            effect('armor', 10), effect('fadedLife', 2), effect('weaponOrfevre', zeroEfficiency || index ? 0 : 20)] }));
        actors = items.map((item, index) => {
          const entity = structuredClone(E.entitesNestUp[0]);
          Object.assign(entity, { id: item.equippedTo, side: 'A', nickname: `Porteur ${index + 1}`, awakening: 1,
            level: { current: 1, max: 250 }, baseStats: { HP: 100, shift: 10, agility: 17, charge: 2,
              weaponOrfevre: zeroEfficiency ? (index ? 0 : 100) : (index ? 100 : 20) }, stats: {}, modifierStats: {},
            stuff: { slot1: [item.equippedId] }, resourceStocks: {} });
          E.recomputeEntityStats(entity, { equippedItems: items, persistEquipment: false, skipReverseArchetype: true });
          return entity;
        });
        E.entites.splice(0, E.entites.length, ...actors);
        S.saveToLocalStorage('selectedArmyA', actors); S.saveToLocalStorage('equippedItems', items);
        for (const bucket of ['PlayerSave', 'IngameItemsData']) S.saveToLocalStorage(bucket, { Playerinventory: [], equippedItems: items });
        for (const [index, entity] of actors.entries()) {
          R.spendMovementCharges(entity, index ? R.getEquipmentResourceCurrent(entity, 'shift') : 2);
          A.consumeEntityArmor(entity, index ? 1000 : 3); R.consumeFadedLife(entity);
          U.saveEntityMovementState(entity); U.saveEntityArmorState(entity); U.saveEntityLifePoolToStorage(entity, 'fadedLife');
          S.saveUpgradedEntity(entity);
        }
        stockSnapshot = stockState();
        const mount = document.getElementById('item-swap-audit');
        for (const [index, entity] of actors.entries()) {
          const section = document.createElement('section');
          section.style.cssText = `position:fixed;top:10px;left:${20 + index * 700}px;width:280px`;
          mount.append(section); _UI.createStuffDom(entity, section);
        }
        cards = items.map((item, index) => {
          const anchor = document.querySelector(`[data-stuff-id="${item.equippedId}"]`);
          check(anchor, 'Production equipment anchor exists');
          M.pinItemDescription(S.getEquippedItemById(item.equippedId), item.equippedId, anchor, { showEquippedActions: true });
          const card = document.querySelector(`.item-description-card[data-item-id="${item.equippedId}"]`);
          card.style.cssText += `;position:fixed;top:160px;left:${20 + index * 700}px;width:290px;max-height:800px;overflow:auto`;
          return card;
        });
        host().dataset.testSwapHost = 'true';
      },
      capture() {
        helper = [...document.querySelectorAll('.stat-hover')].find(node => node._helperHost === host());
        check(helper, 'Production sub-helper is open');
      },
      swap() {
        check(Gear.equip({ item: S.getEquippedItemById(actors[0].stuff.slot1[0]), sourceEntity: actors[0], targetEntity: actors[1],
          slotId: `slot1-${actors[1].id}` }), 'Production swap succeeds');
        check(stockState() === stockSnapshot, 'Swap preserves precise reserves on both items');
      },
      spend(all = false) {
        const item = S.getEquippedItemById(cards[0].dataset.itemId);
        const owner = actors.find(entity => entity.id === item.equippedTo);
        R.spendMovementCharges(owner, all ? R.getEquipmentResourceCurrent(owner, 'shift') : 1); U.saveEntityMovementState(owner);
        A.consumeEntityArmor(owner, all ? 1000 : 1); U.saveEntityArmorState(owner);
        stockSnapshot = stockState();
      },
      inspectZero(empty) {
        const item = S.getEquippedItemById(cards[0].dataset.itemId);
        const owner = actors.find(entity => entity.id === item.equippedTo);
        check(E.getWeaponOrfevreStuffActivePercent(owner) === 0, 'Target really has zero equipment efficiency');
        const stock = owner.resourceStocks.shift.stuff[item.equippedId];
        check(stock.current === (empty ? 0 : 4), 'Zero-efficiency owner receives only raw remaining charges');
        check(stock.reserve.preciseCurrent === (empty ? 0 : 4), 'No swap refills precise stock');
        if (empty) {
          check(currentRow(cards[0]).classList.contains('stuff-stat-resource-empty'), 'Empty movement stays gray after swap');
          check(owner.armorLayers.stuff[item.equippedId].current === 0, 'Empty armor stays empty');
        }
        check(!cards[0].querySelector('.stuff-stat-orfevre-bonus:not(:empty)')
          || [...cards[0].querySelectorAll('.stuff-stat-orfevre-bonus')].every(node => Number(node.textContent) === 0), 'No former efficiency bonus remains in card');
        if (kind.startsWith('efficiency')) {
          const payload = JSON.parse(host().dataset.orfevreDetail);
          check(payload.exactBonus === 0 && payload.bonus === 0 && payload.activePercent === 0, 'Open efficiency detail has zero bonus');
        }
        const restored = structuredClone(S.loadFromLocalStorage('selectedArmyA', []).find(entity => entity.id === owner.id));
        E.recomputeEntityStats(restored, { equippedItems: S.loadEquippedItems(), persistEquipment: false, skipReverseArchetype: true });
        check(restored.resourceStocks.shift.stuff[item.equippedId].current === stock.current, 'Reload does not restore spent charges');
      },
      inspect() {
        for (const card of cards) {
          check(card.isConnected && card.classList.contains('persistent'), 'Original pinned card survives slot rebuild');
          const item = S.getEquippedItemById(card.dataset.itemId);
          const owner = actors.find(entity => entity.id === item.equippedTo);
          const percent = E.getWeaponOrfevreStuffActivePercent(owner);
          check(Number(card.querySelector('.item-stats-block').dataset.weaponOrfevreActive) === percent, `Equipment efficiency follows ${owner.nickname}: expected ${percent}`);
          const stock = owner.resourceStocks.shift.stuff[item.equippedId];
          const numbers = currentRow(card).querySelector('.stuff-stat-effective').textContent.match(/\d+(?:\.\d+)?/g).map(Number);
          check(numbers[0] === stock.current && (numbers[1] ?? numbers[0]) === stock.max, 'Item shows remaining movement at new owner efficiency');
          const max = Math.round(item.Stuffeffets.find(effect => effect.stat === 'shift').value.max * (1 + percent / 100));
          check(Number(maximumRow(card).querySelector('.stuff-stat-effective').textContent.replace(/[^\d.-]/g, '')) === max, 'Maximum uses new owner efficiency separately');
          const armor = owner.armorLayers.stuff[item.equippedId];
          const armorNumbers = card.querySelector('.stuff-stat-armor-reserve .stuff-stat-effective').textContent.match(/\d+(?:\.\d+)?/g).map(Number);
          check(armorNumbers[0] === armor.current && (armorNumbers[1] ?? armorNumbers[0]) === armor.max, 'Armor also follows new owner and remaining stock');
          check(card.querySelector('.item-equipped-context').textContent.includes(owner.nickname), 'Equipped owner label is current');
          check(card.querySelector('.item-equipped-unequip-button').textContent.includes(owner.nickname), 'Unequip action names current owner');
          for (const row of card.querySelectorAll('.stuff-stat-row')) check(row.dataset.entityId === String(owner.id), 'Every contribution row is bound to current owner');
        }
        check(helper.isConnected && helper._helperHost === host(), 'Same open sub-helper follows replaced row');
        const item = S.getEquippedItemById(cards[0].dataset.itemId);
        check(helper.dataset.entityId === String(item.equippedTo), 'Open sub-helper belongs to new owner');
        if (kind.startsWith('efficiency')) {
          const payload = JSON.parse(host().dataset.orfevreDetail);
          const owner = actors.find(entity => entity.id === item.equippedTo);
          check(payload.activePercent === E.getWeaponOrfevreStuffActivePercent(owner), 'Efficiency payload is refreshed');
          const template = document.createElement('template');
          const D = window.__itemSwapDisplay;
          template.innerHTML = D(host().dataset.stat, owner, payload).helpContent;
          check(helper.querySelector('.stat-hover-body').textContent.trim() === template.content.textContent.trim(), `Open efficiency calculation is rerendered from new owner payload: ${JSON.stringify({ actual: helper.querySelector('.stat-hover-body').textContent, expected: template.content.textContent })}`);
        } else {
          const template = document.createElement('template'); template.innerHTML = host().dataset.helperText;
          check(helper.querySelector('.stat-hover-body').textContent.trim() === template.content.textContent.trim(), `Open contribution shows current remaining amount: ${JSON.stringify({ actual: helper.querySelector('.stat-hover-body').textContent, expected: template.content.textContent })}`);
        }
        check(stockState() === stockSnapshot, 'Reading item helper never restores stock');
        return { owner: item.equippedTo, kind };
      },
      retainThroughCleanup() {
        cards[0].querySelector('.item-equipped-context').click();
        check(cards.every(card => card.isConnected), 'Pinned cards reattach to current slots instead of being removed');
      },
    };
    const D = await import("/js/ui/statistics/details.js");
    window.__itemSwapDisplay = D.calculateStatsDisplay;
  });
  const checks = [];
  for (const context of ['map', 'combat']) for (const empty of [false, true]) {
    for (const kind of ['contribution-current', 'efficiency-current', 'efficiency-maximum']) {
      await page.evaluate(({ context, kind }) => window.__itemSwap.setup(context, kind, { zeroEfficiency: true }), { context, kind });
      await page.locator('[data-test-swap-host="true"]').hover();
      await page.evaluate(() => window.__itemSwap.capture());
      if (empty) await page.evaluate(() => window.__itemSwap.spend(true));
      await page.evaluate(() => window.__itemSwap.swap());
      await page.evaluate(() => window.__itemSwap.inspect());
      await page.evaluate(empty => window.__itemSwap.inspectZero(empty), empty);
      await page.waitForTimeout(1200);
      await page.evaluate(() => window.__itemSwap.inspect());
      await page.evaluate(() => window.__itemSwap.retainThroughCleanup());
      await page.evaluate(() => window.__itemSwap.inspect());
      if (kind === 'efficiency-current') await page.screenshot({ path: resolve(output, `zero-${context}-${empty ? 'empty' : 'partial'}.png`) });
      await page.evaluate(() => window.__itemSwap.swap());
      await page.evaluate(() => window.__itemSwap.inspect());
      await page.evaluate(() => window.__itemSwap.swap());
      await page.evaluate(() => window.__itemSwap.inspect());
      await page.evaluate(empty => window.__itemSwap.inspectZero(empty), empty);
      checks.push(`${context}/${kind}/${empty ? 'empty' : 'partial'}: zero-efficiency owner, no stale bonus in open helper, no refill through repeated swaps or reload`);
    }
  }
  for (const context of ['map', 'combat']) for (const kind of ['contribution-current', 'contribution-maximum', 'efficiency-current', 'efficiency-maximum']) {
    await page.evaluate(({ context, kind }) => window.__itemSwap.setup(context, kind), { context, kind });
    await page.locator('[data-test-swap-host="true"]').hover();
    await page.evaluate(() => window.__itemSwap.capture());
    for (const direction of ['forward', 'back']) {
      await page.evaluate(() => window.__itemSwap.swap());
      await page.evaluate(() => window.__itemSwap.inspect());
      await page.waitForTimeout(1200);
      await page.evaluate(() => window.__itemSwap.inspect());
      await page.evaluate(() => window.__itemSwap.retainThroughCleanup());
      await page.evaluate(() => window.__itemSwap.inspect());
      checks.push(`${context}/${kind}/${direction}: same cards and sub-helper show new owner, efficiency and remaining stock without refilling`);
      if (direction === 'forward') {
        await page.evaluate(() => window.__itemSwap.spend());
        await page.waitForTimeout(1200);
        await page.evaluate(() => window.__itemSwap.inspect());
        checks.push(`${context}/${kind}: further consumption by new owner refreshes the same open helper and sub-helper`);
      }
      if (direction === 'forward' && kind === 'efficiency-current') await page.screenshot({ path: resolve(output, `swap-${context}.png`) });
    }
  }
  assert.deepEqual(errors, []);
  const report = { count: checks.length, checks };
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await page?.screenshot({ path: resolve(output, 'failure.png') });
  throw error;
} finally {
  await browser.close();
  await new Promise(done => server.close(done));
}
