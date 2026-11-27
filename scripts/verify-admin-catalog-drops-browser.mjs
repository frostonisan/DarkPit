import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = resolve('docs'), output = resolve('outputs/admin-catalog-drops');
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
  const errors = [], checks = [];
  page.on('pageerror', error => errors.push(error.stack || error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  // Reset restores production perspective; this fixture uses flat rectangular cells.
  await page.addStyleTag({ content: '#hexGrid { transform: none !important; }' });
  await page.evaluate(async () => {
    const Admin = await import("/js/debug/admin.js");
    const E = await import("/js/entities/runtime.js");
    const S = await import("/js/storage/gameStorage.js");
    const State = await import("/js/app/state.js");
    S.setAdminMode(true);
    S.setCurrentLevel('admin-native-drops'); window.currentStageId = 'admin-native-drops'; window.levelRunning = 'admin';
    S.saveToLocalStorage('GameStages', { stages: [{ id: 'admin-native-drops', level_type: 'admin' }] });
    S.saveToLocalStorage('PlayerSave', { Playerinventory: [], battleSlots: [], battleGroundItems: [], equippedItems: [] });
    S.saveToLocalStorage('IngameItems', []);
    S.saveToLocalStorage('selectedArmyA', []); S.saveToLocalStorage('ArmyB', { armies: {} });
    E.entites.length = 0;
    State.setGameOver(false); State.refreshStageAccess();
    document.body.innerHTML = '<div id="game-container"><div class="Game-UI"></div><div id="hexGrid" class="hex-grid"></div></div>';
    const grid = document.getElementById('hexGrid');
    grid.style.cssText = 'position:fixed;left:350px;top:180px;display:grid;grid-template-columns:repeat(5,100px);gap:10px;transform:none;';
    for (let row = 0; row < 3; row++) for (let col = 0; col < 5; col++) {
      const hex = document.createElement('div'); hex.id = `hex_${row * 5 + col + 1}`;
      Object.assign(hex.dataset, { position: hex.id, row, col });
      hex.className = `hex ${col < 2 ? 'SideA' : col > 2 ? 'SideB' : 'Neutral'}`;
      hex.style.cssText = 'width:100px;height:100px;position:relative;transform:none;background:#20252a;';
      hex.appendChild(Object.assign(document.createElement('div'), { className: 'socle' }));
      grid.appendChild(hex);
    }
    window.__materialDrops = [];
    window.__dragTrace = [];
    for (const type of ['dragstart', 'dragover', 'drop', 'dragend']) document.addEventListener(type, event => {
      window.__dragTrace.push({ type, target: event.target.id || event.target.className,
        payload: event.dataTransfer?.getData('application/x-admin-spawn'), x: event.clientX, y: event.clientY });
    }, true);
    window.addEventListener('stageChestsLoaded', event => {
      for (const chest of event.detail.chests) window.__materialDrops.push({ kind: 'chest', position: chest.battlePosition, status: chest.statut });
    });
    window.addEventListener('eventCorpseSpawned', event => {
      window.__materialDrops.push({ kind: 'corpse', position: event.detail.entity.position, side: event.detail.entity.side });
    });
    Admin.initializeAdminLevel(E.entitesNestUp);
  });
  const list = page.locator('#admin-entity-list');
  const rowNamed = name => list.locator(':scope > .admin-entity-row').filter({ has: page.locator('span', { hasText: new RegExp(`^${name}$`) }) }).first();
  const tab = key => page.locator(`#admin-entity-form [data-admin-tab-key="${key}"]`).click();
  const reset = async () => {
    await page.evaluate(() => { document.getElementById('admin-event-launch-status').textContent = ''; });
    await page.getByRole('button', { name: 'Reset niveau', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('admin-event-launch-status').textContent === 'Niveau admin réinitialisé.');
    assert.equal(await page.locator('#hexGrid [data-ground-summon], #hexGrid .chest-container, #hexGrid [id^="Box_Entite_"]').count(), 0);
  };
  const drag = async row => {
    await page.evaluate(() => { window.__materialDrops.length = 0; });
    await row.dragTo(page.locator('#hex_8'), { timeout: 10000 });
  };
  const dragFromText = async row => row.evaluate(element => {
    const text = element.querySelector('.admin-stat-editor-name > span:last-child').firstChild;
    if (text.nodeType !== Node.TEXT_NODE) throw Error('Expected an actual text-node drag source');
    const dataTransfer = new DataTransfer();
    const started = text.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }));
    const payload = dataTransfer.getData('application/x-admin-spawn');
    if (!started || !payload.startsWith('ADMIN_SPAWN:')) throw Error('Text-node drag must carry the admin spawn payload');
    const hex = document.getElementById('hex_8');
    const bounds = hex.getBoundingClientRect();
    const options = { bubbles: true, cancelable: true, dataTransfer,
      clientX: bounds.x + bounds.width / 2, clientY: bounds.y + bounds.height / 2 };
    hex.dispatchEvent(new DragEvent('dragover', options));
    hex.dispatchEvent(new DragEvent('drop', options));
    text.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer }));
  });
  const verifyGround = async (label, { key, tier, serial, native = false } = {}) => {
    try {
      await page.waitForFunction(() => document.querySelector('#hex_8 [data-ground-summon]'), null, { timeout: 5000 });
    } catch (error) {
      await page.screenshot({ path: resolve(output, 'failed-drag.png'), fullPage: true });
      console.error(await page.evaluate(() => ({ trace: window.__dragTrace,
        hex: document.getElementById('hex_8').outerHTML,
        styles: [document.getElementById('hex_8'), document.getElementById('hex_8').querySelector('.socle')].map(node => {
          const css = getComputedStyle(node), rect = node.getBoundingClientRect();
          return { pointerEvents: css.pointerEvents, opacity: css.opacity, visibility: css.visibility,
            transform: css.transform, rect: rect.toJSON(), top: document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.outerHTML.slice(0, 500) };
        }),
        ground: [...document.querySelectorAll('[data-ground-summon]')].map(node => node.outerHTML),
        status: document.getElementById('admin-event-launch-status').textContent })));
      throw error;
    }
    const state = await page.evaluate(async () => {
      const M = await import('/js/items/itemManager.js');
      const S = await import("/js/storage/gameStorage.js");
      return { nodes: document.querySelectorAll('[data-ground-summon]').length,
        items: S.loadFromLocalStorage('IngameItems', []), state: M.getBattleInventoryState(), valid: M.validateBattleInventoryState().ok };
    });
    assert.equal(state.nodes, 1, `${label}: no click-created duplicate`);
    assert.ok(state.valid, `${label}: unique ownership`);
    if (native) assert.equal(state.items.length, 0);
    else {
      assert.equal(state.items.length, 1);
      assert.equal(state.state.battleGroundItems[0].position, 'hex_8');
      if (key) assert.equal(state.items[0].permanentStat.key, key);
      if (tier) assert.equal(state.items[0].permanentStat.crystalLevel, tier);
      if (serial) assert.equal(state.items[0].serial, serial);
    }
    checks.push(`Drag/drop: ${label}, exact hex, one copy`);
    await reset();
  };
  await tab('items');
  await drag(list.locator('[data-item-serial="i0"] img'));
  await verifyGround('item dragged from its image', { serial: 'i0' });
  await drag(list.locator('[data-summon-effect="jarret-summon"] img'));
  await verifyGround('native summon dragged from its image', { native: true });
  await tab('misc');
  await rowNamed('Cristaux').dblclick();
  assert.equal(await page.locator('[data-ground-summon]').count(), 1);
  checks.push('Real double click on crystal root produces exactly one item');
  await reset();
  await dragFromText(rowNamed('Cristaux'));
  await verifyGround('random crystal root dragged from a text node');
  await drag(rowNamed('Cristaux').locator('img'));
  await verifyGround('random crystal root');
  await rowNamed('Cristaux').locator('button').click();
  await page.locator('#admin-entity-form').screenshot({ path: resolve(output, 'crystal-tiers.png') });
  for (const tier of [1, 2, 3, 4]) {
    const row = list.locator(`[data-crystal-tier="${tier}"]`);
    const navigationDrag = await row.locator('button').evaluate(button => {
      const dataTransfer = new DataTransfer();
      const accepted = button.firstChild.dispatchEvent(new DragEvent('dragstart', {
        bubbles: true, cancelable: true, dataTransfer,
      }));
      return { accepted, payload: dataTransfer.getData('application/x-admin-spawn') };
    });
    assert.deepEqual(navigationDrag, { accepted: false, payload: '' }, 'Navigation button text must not start a spawn drag');
    checks.push(`Tier ${tier}: navigation button text cannot spawn an object`);
    await row.dblclick();
    assert.equal(await page.locator(`[data-ground-summon] .umbra-crystal[data-crystal-level="${tier}"]`).count(), 1);
    assert.equal(await page.locator('[data-ground-summon]').count(), 1);
    checks.push(`Real double click on tier ${tier}: one matching crystal`);
    await reset();
    await drag(row.locator('img'));
    await verifyGround(`tier ${tier}`, { tier });
  }
  await list.locator('[data-crystal-tier="2"] button').click();
  await dragFromText(list.locator('[data-crystal-stat="magicalPenPlus"]'));
  await verifyGround('precise crystal dragged from a text node', { key: 'magicalPenPlus' });
  await drag(list.locator('[data-crystal-stat="magicalPenPlus"] .picto-stat'));
  await verifyGround('precise crystal from its stat icon', { key: 'magicalPenPlus' });
  await list.locator(':scope > .admin-entity-row').first().click();
  await list.locator(':scope > .admin-entity-row').first().click();
  for (const type of ['Chest', 'Corpse']) {
    const assertMaterial = async status => {
      await page.waitForFunction(() => window.__materialDrops.length > 0);
      const drops = await page.evaluate(() => window.__materialDrops);
      assert.equal(drops.length, 1, `${type}/${status}: one spawn`);
      assert.equal(drops[0].position, 'hex_8', `${type}/${status}: exact target hex`);
      if (type === 'Chest') assert.equal(drops[0].status, status === 'lootable' ? 'closed' : status);
      if (status !== 'destroyed') {
        await page.waitForFunction(type => document.querySelector(type === 'Chest'
          ? '#hex_8 .chest-container' : '#hex_8 .event-corpse'), type);
      }
      checks.push(`Native mouse drop: ${type}/${status}, exact hex, one copy`);
      await reset();
    };
    await drag(rowNamed(type));
    await assertMaterial('lootable');
    await rowNamed(type).locator('button').click();
    for (const status of type === 'Chest' ? ['Lootable', 'Locked', 'Destroyed'] : ['Lootable', 'Empty', 'Destroyed']) {
      await drag(rowNamed(status).locator('span').first());
      await assertMaterial(status.toLowerCase());
    }
    if (type === 'Corpse') {
      await rowNamed('Lootable').locator('button').click();
      await drag(list.locator('.admin-entity-catalog-row').first());
      await assertMaterial('lootable');
      await list.locator(':scope > .admin-entity-row').first().click();
    }
    await list.locator(':scope > .admin-entity-row').first().click();
  }
  await tab('entity');
  assert.ok(await list.locator('.admin-entity-catalog-row').evaluateAll(rows => rows.length > 0 && rows.every(row => row.draggable)));
  for (const side of ['A', 'B', 'neutral']) {
    await tab(side);
    await drag(list.locator('.admin-entity-catalog-row').first());
    await page.waitForFunction(() => document.querySelector('#hex_8 [id^="Box_Entite_"]'));
    const actors = await page.evaluate(async () => (await import("/js/entities/runtime.js")).entites.map(entity => ({ position: entity.position, side: entity.side })));
    assert.deepEqual(actors, [{ position: 'hex_8', side }]);
    checks.push(`Native entity drop: side ${side}, exact hex, one entity`);
    await reset();
  }
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ checks }, null, 2));
  console.log(`PASS ${checks.length} drag/drop scenarios`);
} finally {
  await browser.close();
  await new Promise(done => server.close(done));
}
