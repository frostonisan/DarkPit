import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = resolve('docs');
const output = resolve('outputs/shop-filters');
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
  page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
  page.setDefaultTimeout(10000);
  const errors = [];
  const checks = [];
  const check = (condition, label) => { assert.ok(condition, label); checks.push(label); };
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const counts = await page.evaluate(async () => {
    const U = await import("/js/ui/application.js"), _U = await import("/js/ui/inventory.js");
    const S = await import("/js/storage/gameStorage.js");
    const State = await import("/js/app/state.js");
    const { ItemDetails } = await import('/js/data/itemList.js');
    const { entitesNestUp } = await import("/js/entities/runtime.js");
    window.levelRunning = 'worldmap';
    State.refreshStageAccess();
    S.setAdminMode(true);
    U.createGameContainer();
    U.GameUi();
    document.querySelector('.starter-select-button')?.click();
    window.__shopCatalogueBefore = JSON.stringify(entitesNestUp);
    _U.openShopInterface();
    return { all: ItemDetails.length, consumable: ItemDetails.filter(item => item.itemType.includes('consumable')).length,
      stuff: ItemDetails.filter(item => item.itemType.includes('stuff')).length,
      entities: [...new Set(entitesNestUp.map(entity => JSON.stringify([entity.type, entity.name])))].sort() };
  });
  const shop = page.locator('.shop-interface');
  const search = shop.getByRole('searchbox');
  const tiles = shop.locator('.shop-item-mosaic > .item-wrapper');
  const visible = shop.locator('.shop-item-mosaic > .item-wrapper:not([hidden])');
  const ids = () => tiles.evaluateAll(nodes => nodes.map(node => node.dataset.itemId));
  const category = value => shop.locator(`.shop-categories label:has(input[value="${value}"])`).click();
  const original = await ids();
  check(await shop.locator('.shop-header > .shop-filters').count() === 1, 'Filters are direct children of the shop header');
  check(await shop.locator('.shop-content .shop-filters').count() === 0, 'Filters no longer occupy the item list');
  check(original.length > counts.all, 'Admin shop includes the full item catalogue and entities');
  check(new Set(original).size === original.length, 'Every offer has its own ID, including templates with shared catalogue IDs');
  const entityOffers = shop.locator('.item-wrapper.entity');
  const offeredEntities = await entityOffers.evaluateAll(nodes => nodes.map(node => JSON.stringify([node._shopEntity.type, node._shopEntity.name])).sort());
  check(JSON.stringify(offeredEntities) === JSON.stringify(counts.entities), 'Admin shop offers every distinct entity exactly once, including Lords');
  for (const value of ['consumable', 'stuff', 'entity']) {
    await category(value);
    check(await visible.count() > 0, `${value} filter has offers`);
    check(await visible.evaluateAll((nodes, value) => nodes.every(node => node.dataset.shopCategory === value), value), `${value} excludes other categories`);
    if (counts[value]) check(await visible.count() === counts[value], `${value} includes its full catalogue`);
  }
  await page.screenshot({ path: resolve(output, 'admin-entities.png') });
  await category('all');
  check(await visible.count() === original.length, 'All restores relics and every other category');
  check(JSON.stringify(await ids()) === JSON.stringify(original), 'Filtering never regenerates or replaces offers');

  await search.fill('  DEPLACEMENTS  ');
  check(await visible.count() > 0, 'Search ignores accents, case and outer spaces');
  await category('stuff');
  check(await visible.evaluateAll(nodes => nodes.every(node => node.classList.contains('stuff'))), 'Search combines with category');
  await search.fill('souffle de marche');
  check(await visible.count() === 0 && await shop.locator('.shop-empty').isVisible(), 'No matches have a visible empty state');
  await category('consumable');
  check(await visible.count() === 4, 'Switching category retains the query and finds all movement consumables');
  const beforeEnter = await ids();
  const url = page.url();
  await search.press('Enter');
  check(page.url() === url && JSON.stringify(await ids()) === JSON.stringify(beforeEnter), 'Submitting search does not navigate, buy or reroll');

  await visible.first().click();
  await page.waitForTimeout(220);
  check(await shop.locator('.item-wrapper.selected').count() === 1, 'An offer can be selected while filtered');
  await search.fill('no-such-shop-item');
  check(await shop.locator('.item-wrapper.selected').count() === 0, 'Hiding a selected offer clears its selection');
  check(!(await shop.locator('.seller-button').evaluate(node => node.classList.contains('buy'))), 'Hidden offers cannot remain the purchase target');
  check(await page.locator('.item-description-card.persistent').count() === 0, 'Hidden offer helpers are closed');
  await search.fill('');
  check(await visible.count() === counts.consumable, 'Clearing search restores the current category');
  check(JSON.stringify(await ids()) === JSON.stringify(original), 'Typing and clearing never change offer IDs');

  await category('stuff');
  await search.fill('déplacements max +2 et déplacements +1');
  check(await visible.count() === 1, 'Mixed movement item is searchable by its name');
  const purchasedId = await visible.first().getAttribute('data-item-id');
  await visible.first().click();
  await shop.locator('.seller-button').dispatchEvent('click');
  check(await visible.count() === 0 && await shop.locator('.shop-empty').isVisible(), 'Buying the last match updates the empty state');
  check(!(await ids()).includes(purchasedId), 'Purchased offer stays removed');
  check(await search.inputValue() === 'déplacements max +2 et déplacements +1', 'Purchase preserves search text');
  check(await page.evaluate(async () => (await import('/js/items/itemManager.js')).getBattleInventoryState().Playerinventory
    .some(item => item.functionName === 'DevMovementMixed')), 'Filtered purchase reaches the real inventory');
  await search.fill('');
  await category('all');
  check(await visible.count() === original.length - 1, 'Clearing filters does not restore a purchased offer');

  await category('entity');
  await search.fill('Porc pure magi cac');
  check(await visible.count() === 1, 'A distinct variant sharing catalogue IDs and serials remains available');
  const selectedVariant = await visible.first().evaluate(node => {
    window.__purchasedShopOffer = { item: node._shopEntity, id: node.dataset.itemId };
    return { name: node._shopEntity.name, attacks: node._shopEntity.attacks, id: node._shopEntity.id };
  });
  await visible.first().click();
  await shop.locator('.seller-button').dispatchEvent('click');
  const recruitedVariant = await page.evaluate(() => JSON.parse(localStorage.getItem('selectedArmyA')).at(-1));
  check(recruitedVariant.name === selectedVariant.name && JSON.stringify(recruitedVariant.attacks.map(attack => typeof attack === 'string' ? attack : attack.functionName))
    === JSON.stringify(selectedVariant.attacks.map(attack => typeof attack === 'string' ? attack : attack.functionName)), 'Purchase button recruits the chosen variant rather than another template with the same ID');
  check(recruitedVariant.id !== selectedVariant.id, 'Recruited entity receives its own instance ID');
  check(await visible.count() === 0, 'Purchasing an entity removes its only offer');
  check(await page.evaluate(async () => {
    const { BuyItems } = await import('/js/items/itemManager.js');
    const before = localStorage.getItem('selectedArmyA');
    const { item, id } = window.__purchasedShopOffer;
    return BuyItems(item, id) === false && localStorage.getItem('selectedArmyA') === before;
  }), 'The same entity offer cannot be purchased twice');

  await search.fill('Torche Noire');
  check(await visible.count() === 1, 'Lord is available through the entity filter and search');
  await visible.first().dblclick();
  const recruitedLord = await page.evaluate(() => JSON.parse(localStorage.getItem('selectedArmyA')).at(-1));
  check(recruitedLord.name === 'Torche Noire' && recruitedLord.type === 'lord' && recruitedLord.side === 'A', 'Admin double-click recruits a Lord without converting its type');
  check(await visible.count() === 0, 'Lord also has only one purchasable copy');
  check(await page.evaluate(async () => {
    const { canRecruitEntity } = await import("/js/entities/armies.js");
    const { entitesNestUp } = await import("/js/entities/runtime.js");
    const lord = entitesNestUp.find(entity => entity.type === 'lord');
    return !canRecruitEntity(lord, { source: 'loot' }) && !canRecruitEntity(lord)
      && JSON.stringify(entitesNestUp) === window.__shopCatalogueBefore;
  }), 'Admin Lord exception stays limited to shop acquisition and never mutates the catalogue');
  await search.fill('');
  await category('all');
  await page.evaluate(async () => (await import("/js/storage/gameStorage.js")).setAdminMode(false));
  const normal = await ids();
  check(normal.length <= 8 && normal.length > 0, 'Normal shop keeps its limited offer selection');
  check(await entityOffers.count() >= 1 && await entityOffers.count() <= 2, 'Normal shop still rolls one or two entities');
  check(await entityOffers.evaluateAll(nodes => nodes.every(node => node._shopEntity.type === 'sbire')), 'Normal shop never offers Lords');
  check(await page.evaluate(async () => {
    const { BuyItems } = await import('/js/items/itemManager.js');
    const { addEntityToArmyA } = await import("/js/entities/armies.js");
    const { entitesNestUp } = await import("/js/entities/runtime.js");
    const lord = entitesNestUp.find(entity => entity.type === 'lord');
    const before = localStorage.getItem('selectedArmyA');
    if (BuyItems(lord) !== false) return false;
    try { addEntityToArmyA(lord, 1, { source: 'shop' }); return false; }
    catch (error) { return error instanceof TypeError && localStorage.getItem('selectedArmyA') === before; }
  }), 'Lord purchase and direct recruitment remain forbidden outside admin mode');
  await category('stuff');
  await search.fill('absent');
  await search.fill('');
  await category('all');
  check(JSON.stringify(await ids()) === JSON.stringify(normal), 'Normal filters cannot reroll stock');
  check(await visible.locator('[data-shop-price]').evaluateAll(nodes => nodes.every(node => !node.hidden)), 'Normal offers keep their prices');
  await category('consumable');
  await search.fill('souffle de marche');
  await page.evaluate(async () => (await import("/js/storage/gameStorage.js")).setAdminMode(true));
  check(await search.inputValue() === 'souffle de marche' && await visible.count() === 4, 'Admin refresh preserves active filters');

  for (const viewport of [{ width: 1400, height: 950 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await category('stuff');
    await search.fill('deplacements');
    const layout = await shop.evaluate(node => {
      const parent = node.querySelector('.shop-header').getBoundingClientRect();
      const body = node.querySelector('.shop-body').getBoundingClientRect();
      const close = node.querySelector('.close-button').getBoundingClientRect();
      return { parent: { x: parent.x, right: parent.right, y: parent.y, bottom: parent.bottom }, bodyTop: body.y, closeX: close.x,
        controls: [...node.querySelectorAll('.shop-filters, .shop-categories label, .shop-search')].map(control => {
        const rect = control.getBoundingClientRect();
        return { x: rect.x, right: rect.right, y: rect.y, bottom: rect.bottom, width: rect.width, height: rect.height };
      }) };
    });
    check(layout.controls.every(rect => rect.width > 0 && rect.height > 0 && rect.x >= layout.parent.x - 1
      && rect.right <= Math.min(layout.parent.right, layout.closeX) + 1 && rect.y >= layout.parent.y - 1
      && rect.bottom <= layout.parent.bottom + 1), `Controls fit the header without covering close at ${viewport.width}px`);
    check(layout.bodyTop >= layout.parent.bottom - 1, `Header does not overlap offers at ${viewport.width}px`);
    await page.screenshot({ path: resolve(output, `shop-${viewport.width}.png`) });
  }
  await page.setViewportSize({ width: 1400, height: 950 });
  await shop.locator('.close-button').click();
  await page.evaluate(async () => (await import("/js/ui/inventory.js")).openShopInterface());
  check(await page.locator('.shop-filters').count() === 1, 'Reopening does not duplicate controls');
  check(await page.locator('.shop-search').inputValue() === '', 'New shop session starts with clear search');
  check(await page.locator('[name="shop-category"][value="all"]').isChecked(), 'New shop session starts on All');
  check(await entityOffers.count() === counts.entities.length, 'Reopening admin shop restores one offer per distinct entity');
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ count: checks.length, entities: counts.entities.length, checks }, null, 2));
  console.log(JSON.stringify({ count: checks.length, entities: counts.entities.length, checks }, null, 2));
} catch (error) {
  await page?.screenshot({ path: resolve(output, 'failure.png') });
  throw error;
} finally {
  await browser.close();
  await new Promise(done => server.close(done));
}
