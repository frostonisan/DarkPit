import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('docs'), output = resolve('outputs/admin-navigation');
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  const file = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(root + sep)) return res.writeHead(403).end();
  try {
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1536, height: 960 } });
  page.setDefaultTimeout(12000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.evaluate(async () => {
    const S = await import("/js/storage/gameStorage.js"), E = await import("/js/entities/runtime.js"), A = await import("/js/debug/admin.js");
    S.setAdminMode(true);
    window.levelRunning = 'admin'; window.currentStageId = 'admin-navigation';
    S.setCurrentLevel('admin-navigation');
    (await import("/js/storage/sessionStorage.js")).beginAdminSession();
    S.saveToLocalStorage('GameStages', { stages: [{ id: 'admin-navigation', level_type: 'admin' }] });
    S.saveToLocalStorage('selectedArmyA', []); S.saveToLocalStorage('ArmyB', { armies: {} });
    S.saveToLocalStorage('equippedItems', []);
    E.entites.length = 0;
    document.body.innerHTML = '<div id="game-container"><div class="Game-UI"><div class="scoring-ui"><div class="scoring-experience"><img src="/media/assets/ui/experience-01.png" class="experience-01"><img src="/media/assets/ui/experience-02.png" class="experience-02"></div><div class="scoring" id="score">Experience : 999998565964</div></div><div class="menu-player-icons">Menu joueur</div></div><div class="AllEntitiesHud"></div><div id="hexGrid" class="hex-grid"></div></div>';
    const grid = document.getElementById('hexGrid');
    grid.style.cssText = 'position:fixed;left:400px;top:180px;display:flex;gap:30px;transform:none;';
    const template = (await import("/js/data/entityTemplates.js")).entitesNest.find(row => row.serial === 900013);
    for (let i = 1; i <= 3; i++) {
      const hex = document.createElement('div'); hex.id = `hex_${i}`;
      Object.assign(hex.dataset, { position: hex.id, row: 0, col: i - 1 });
      hex.className = 'hex SideA';
      hex.style.cssText = 'width:120px;height:120px;position:relative;transform:none;background:#20252a;';
      hex.appendChild(Object.assign(document.createElement('div'), { className: 'socle' })); grid.appendChild(hex);
      (await import("/js/board/controller.js")).invalidateFootprintGeometry(grid);
      const actor = E.enrichEntityStats({ ...structuredClone(template), id: 991900 + i, name: `Navigation ${i}`,
        side: 'A', position: hex.id, level: 1, awakening: 1, attacks: ['shot-p-r'], stats: {}, stuff: {},
        baseStats: { HP: 1000, speed: 10000, strength: i * 10, intelligence: 10, agility: 10,
          vigueur: 10, constitution: 10, esprit: 10, integrite: 10, finesse: 10, haste: 10, vitality: 10,
          robustness: 10, physicalDamage: 20 } });
      await (await import("/js/entities/spawn.js")).spawnEntiteIngame(actor);
    }
    S.saveToLocalStorage('selectedArmyA', E.entites);
    A.initializeAdminLevel(E.entitesNestUp);
    (await import("/js/ui/codex/index.js")).PlayerArmyCodex(document.querySelector('.menu-player-icons'));
  });
  const form = page.locator('#admin-entity-form'), list = page.locator('#admin-entity-list');
  const search = page.locator('#admin-list-search-input');
  const select = async id => {
    await page.locator(`#Box_Entite_${id}`).dispatchEvent('click', { detail: 1 });
    await page.waitForFunction(value => window.__adminActiveLiveEntityId === String(value), id);
  };
  const setScroll = (node, value) => node.evaluate((element, top) => {
    element.scrollTop = top; element.dispatchEvent(new Event('scroll'));
    return element.scrollTop;
  }, value);
  const layout = await form.evaluate(node => {
    const box = node.getBoundingClientRect(), css = getComputedStyle(node);
    return { top: box.top, right: box.right, height: box.height, background: css.backgroundColor,
      list: document.querySelector('#admin-entity-list').getBoundingClientRect().height,
      iconsLeft: getComputedStyle(document.querySelector('.menu-player-icons')).left };
  });
  assert.deepEqual(layout, { top: 0, right: 1536, height: 960, background: 'rgba(0, 0, 0, 0.39)', list: 460, iconsLeft: '300px' });
  await search.press('Enter');
  assert.equal(await page.locator('#admin-event-launch-status').innerText(), '', 'Enter without a selected entity has no effect');
  await search.fill('porc');
  const catalogScroll = await setScroll(list, 100);
  assert.ok(catalogScroll > 0);
  await list.locator('.admin-entity-stat-button').last().click();
  await list.locator('.admin-entity-row').filter({ hasText: /^< Retour/ }).first().click();
  assert.equal(await search.inputValue(), 'porc', 'Catalog search survives returning from an entity');
  assert.equal(await list.evaluate(node => node.scrollTop), catalogScroll, 'Catalog position is restored');
  await select(991901);
  const generalTab = form.getByRole('tab', { name: 'Général', exact: true });
  const statsTab = form.getByRole('tab', { name: 'Stats', exact: true });
  const allTab = form.getByRole('tab', { name: 'All', exact: true });
  const entityTab = form.getByRole('tab', { name: 'This entity', exact: true });
  assert.equal(await generalTab.getAttribute('aria-selected'), 'true', 'General opens first');
  assert.equal(await form.getByRole('spinbutton', { name: 'Niveau', exact: true }).count(), 1);
  assert.equal(await form.getByRole('checkbox', { name: 'BaseStats', exact: true }).count(), 1);
  assert.equal(await form.locator('.admin-stat-editor-row[data-stat-key="strength"]').count(), 0, 'General does not contain the stat catalog');
  await form.getByRole('textbox', { name: 'Nom', exact: true }).fill('Navigation renommée');
  const nicknameInput = form.getByRole('textbox', { name: 'Nickname', exact: true });
  await nicknameInput.fill('Petit porc');
  assert.equal(await page.evaluate(async () => (await import("/js/entities/runtime.js")).entites.find(e => e.id === 991901).name), 'Navigation 1', 'Identity edits remain in the draft');
  await nicknameInput.press('Enter');
  const identity = await page.evaluate(async () => {
    const E = await import("/js/entities/runtime.js"), S = await import("/js/storage/gameStorage.js");
    return [E.entites.find(e => e.id === 991901), S.loadFromLocalStorage('selectedArmyA', []).find(e => e.id === 991901)]
      .map(e => ({ name: e.name, nickname: e.nickname }));
  });
  assert.deepEqual(identity, [{ name: 'Navigation renommée', nickname: 'Petit porc' }, { name: 'Navigation renommée', nickname: 'Petit porc' }], 'Names are applied and saved by Enter');
  await form.getByRole('checkbox', { name: 'BaseStats', exact: true }).check();
  await statsTab.click();
  assert.equal(await allTab.getAttribute('aria-selected'), 'true');
  assert.equal(await form.locator('.admin-stat-editor-row[data-stat-key="strength"] input').inputValue(), '10', 'BaseStats mode also refreshes stat fields in the other tab');
  assert.equal(await form.getByRole('spinbutton', { name: 'Niveau', exact: true }).count(), 0, 'Level is only in General');
  await generalTab.click();
  await form.getByRole('checkbox', { name: 'BaseStats', exact: true }).uncheck();
  await page.screenshot({ path: resolve(output, 'admin-general.png'), fullPage: true });
  await statsTab.click();
  const allStatCount = await form.locator('.admin-stat-editor-row').count();
  await entityTab.click();
  const ownedCount = await form.locator('.admin-stat-editor-row').count();
  assert.ok(ownedCount > 0 && ownedCount < allStatCount, 'Entity only contains owned statistics');
  assert.deepEqual(await form.locator('.admin-stat-editor-row').evaluateAll(rows => rows.filter(row => {
    const stat = window.__adminActiveLiveEntityDraft.stats[row.dataset.statKey];
    return !(Number(typeof stat === 'object' ? stat?.totalMax ?? stat?.max ?? stat?.current ?? stat?.value : stat) > 0);
  }).map(row => row.dataset.statKey)), [], 'This entity contains only strictly positive total values');
  const assertDisplayedTotals = async () => assert.deepEqual(await form.locator('.admin-stat-editor-row').evaluateAll(rows => rows.flatMap(row => {
    const stat = window.__adminActiveLiveEntityDraft.stats[row.dataset.statKey];
    const total = Number(typeof stat === 'object' ? stat?.totalMax ?? stat?.max ?? stat?.current ?? stat?.value : stat);
    const displayed = Number(row.querySelector('input').value);
    return displayed === total ? [] : [{ key: row.dataset.statKey, displayed, total }];
  })), [], 'Every This entity field displays the full calculated entity total');
  await assertDisplayedTotals();
  const totalStrength = form.locator('.admin-stat-editor-row[data-stat-key="strength"] input');
  assert.equal(await totalStrength.inputValue(), '10', 'Existing strength is shown even with no admin bonus');
  await form.getByRole('button', { name: 'Ajouter 1 Force', exact: true }).click();
  assert.equal(await totalStrength.inputValue(), '11');
  assert.equal(await page.evaluate(() => window.__adminActiveLiveEntityDraft.modifierStats.durable.adminLevel.strength), 1, 'Plus adds one point, not the full displayed total');
  await form.getByRole('button', { name: 'Retirer 1 Force', exact: true }).click();
  assert.equal(await totalStrength.inputValue(), '10');
  await totalStrength.fill('14');
  await totalStrength.press('Enter');
  await assertDisplayedTotals();
  assert.equal(await totalStrength.inputValue(), '14', 'Entering and validating a total does not add it twice');
  await allTab.click();
  assert.equal(await totalStrength.inputValue(), '4', 'All still displays just the four added points');
  await totalStrength.fill('0');
  await totalStrength.press('Enter');
  await entityTab.click();
  assert.equal(await totalStrength.inputValue(), '10', 'Switching views does not copy the total into admin bonuses');
  await assertDisplayedTotals();
  assert.equal(await form.locator('.admin-stat-editor-row[data-stat-key="strength"]').count(), 1);
  assert.equal(await form.locator('.admin-stat-editor-row[data-stat-key="physicalDamagePlus"]').count(), 0, 'Umbra does not invent an autonomous PP+');
  assert.equal(await form.locator('.admin-stat-editor-row[data-stat-key="bloodFury"]').count(), 0, 'An absent Umbra is hidden');
  await allTab.click();
  await search.fill('puissance physique +');
  await form.locator('.admin-stat-editor-row[data-stat-key="physicalDamagePlus"] input').fill('6');
  await entityTab.click();
  assert.equal(await search.inputValue(), '', 'Filters have separate search memory');
  assert.equal(await form.locator('.admin-stat-editor-row[data-stat-key="physicalDamagePlus"] input').inputValue(), '6', 'A newly added stat appears immediately in Entity');
  await form.locator('.admin-stat-editor-row[data-stat-key="physicalDamagePlus"] input').fill('0');
  await form.getByRole('button', { name: 'Valider', exact: true }).click();
  assert.equal(await form.locator('.admin-stat-editor-row[data-stat-key="physicalDamagePlus"]').count(), 0, 'Removing the last source removes the stat from Entity');
  await setScroll(list, 0);
  await page.screenshot({ path: resolve(output, 'admin-entity-stats.png'), fullPage: true });
  await allTab.click();
  assert.equal(await search.inputValue(), 'puissance physique +', 'All keeps its own search');
  await form.locator('.admin-stat-editor-row[data-stat-key="physicalDamagePlus"] input').fill('-3');
  await entityTab.click();
  assert.equal(await form.locator('.admin-stat-editor-row[data-stat-key="physicalDamagePlus"]').count(), 0, 'A nonpositive stat stays hidden even with a nonzero source');
  await allTab.click();
  await form.locator('.admin-stat-editor-row[data-stat-key="physicalDamagePlus"] input').fill('0');
  await search.fill('');
  const actionLayout = await form.evaluate(node => {
    const box = selector => node.querySelector(selector).getBoundingClientRect().toJSON();
    return { panel: node.getBoundingClientRect().toJSON(), clear: box('#admin-list-search button'),
      invincible: box('.admin-invincible-mode-control'), checkbox: box('#admin-invincible-mode'),
      caption: box('.admin-invincible-mode-control span'), tabs: box('.admin-editor-side-tabs'),
      validate: box('.admin-validate-live-entity-button'),
      duplicate: box('.admin-duplicate-entity-button'), close: box('.admin-panel-close'),
      actionsInTabs: Boolean(node.querySelector('.admin-editor-side-tabs > .admin-live-entity-actions')) };
  });
  assert.equal(actionLayout.validate.top, actionLayout.duplicate.top, 'Validate and duplicate share one row');
  assert.ok(actionLayout.actionsInTabs && actionLayout.validate.top < 20 && actionLayout.validate.left >= actionLayout.tabs.left && actionLayout.duplicate.right <= actionLayout.tabs.right, 'Actions are in the editor toolbar');
  assert.ok(actionLayout.close.right < actionLayout.panel.left, 'Close cross is on the left of the panel');
  assert.ok(actionLayout.invincible.left > actionLayout.clear.right && Math.abs(actionLayout.invincible.top - actionLayout.clear.top) < 5, 'Invincible sits beside Clear');
  assert.ok(actionLayout.caption.top >= actionLayout.checkbox.bottom, 'Invincible label sits below its checkbox');
  assert.equal(await form.getByRole('button', { name: 'Fermer', exact: true }).innerText(), '×');
  const invincible = form.getByRole('checkbox', { name: 'Invincible', exact: true });
  const checkedBefore = await invincible.isChecked();
  await invincible.setChecked(!checkedBefore);
  assert.equal(await page.evaluate(() => window.__adminInvincibleMode), !checkedBefore, 'Checkbox updates invincibility');
  await invincible.setChecked(checkedBefore);
  const resetButton = page.getByRole('button', { name: 'Reset niveau', exact: true });
  const scoreBox = await page.locator('.scoring-ui').boundingBox();
  const resetBox = await resetButton.boundingBox();
  assert.ok(resetBox.x + resetBox.width < scoreBox.x && Math.abs(resetBox.y + resetBox.height / 2 - scoreBox.y - scoreBox.height / 2) < 1, 'Reset is centered to the left of the experience display');
  const firstScroll = await setScroll(list, 500);
  assert.ok(firstScroll > 0);
  await select(991902);
  assert.equal(await allTab.getAttribute('aria-selected'), 'true', 'A new entity inherits the selected stats view');
  assert.equal(await list.evaluate(node => node.scrollTop), firstScroll, 'A newly selected entity inherits the current location');
  await search.fill('puissance physique');
  await select(991901);
  assert.equal(await search.inputValue(), '');
  assert.equal(await list.evaluate(node => node.scrollTop), firstScroll, 'Returning restores that entity’s own position');
  await search.fill('force');
  await select(991903);
  assert.equal(await search.inputValue(), 'force', 'New entity inherits the stat search');
  assert.equal(await page.evaluate(() => window.__adminActiveLiveEntityDraft.baseStats.strength), 30, 'Entity values are not copied with navigation');
  await select(991902);
  assert.equal(await search.inputValue(), 'puissance physique', 'Existing entity restores its own search');
  await select(991901);
  await form.getByRole('button', { name: 'Attaques', exact: true }).click();
  await list.locator('.admin-attack-row .admin-attack-pick-button').first().click();
  await search.fill('ratio');
  await select(991902);
  assert.equal(await search.inputValue(), 'puissance physique');
  await select(991901);
  assert.equal(await search.inputValue(), 'ratio', 'Nested attack editor search restored');
  assert.equal(await form.getByRole('spinbutton', { name: 'Ratio physique', exact: true }).count(), 1, 'The attack editor reopens directly');
  const physicalRatio = form.getByRole('spinbutton', { name: 'Ratio physique', exact: true });
  await physicalRatio.fill('1.75');
  await physicalRatio.press('Enter');
  assert.equal(await page.evaluate(async () => (await import("/js/entities/runtime.js")).entites.find(e => e.id === 991901).attackDetails[0].physicalRatio), 1.75, 'Enter saves an attack ratio even between the stepper increments');
  await form.getByRole('button', { name: 'Entité active', exact: true }).click();
  assert.equal(await search.inputValue(), 'force', 'Stats and attacks keep separate searches');
  const strengthInput = form.locator('input.admin-stat-editor-input[data-stat-key="strength"]');
  await strengthInput.fill('7');
  assert.equal(await page.evaluate(async () => (await import("/js/entities/runtime.js")).entites.find(e => e.id === 991901).stats.strength), 10, 'Typing keeps edits in the draft');
  await form.evaluate(node => {
    window.__adminTestSubmits = 0;
    node.addEventListener('submit', () => window.__adminTestSubmits++);
  });
  await strengthInput.press('Enter');
  const validated = await page.evaluate(async () => {
    const E = await import("/js/entities/runtime.js"), S = await import("/js/storage/gameStorage.js");
    return { submits: window.__adminTestSubmits, live: E.entites.find(e => e.id === 991901).stats.strength,
      stored: S.loadFromLocalStorage('selectedArmyA', []).find(e => e.id === 991901).stats.strength,
      other: E.entites.find(e => e.id === 991902).stats.strength };
  });
  assert.deepEqual(validated, { submits: 1, live: 17, stored: 17, other: 20 }, 'Enter validates and saves once, only for the selected entity');
  assert.equal(await search.inputValue(), 'force', 'Validation preserves the search');
  await form.getByRole('button', { name: 'Valider', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__adminTestSubmits), 2, 'Click uses the same submit action');
  await search.fill('');
  await page.screenshot({ path: resolve(output, 'admin-panel.png'), fullPage: true });
  await form.getByRole('button', { name: 'Fermer', exact: true }).click();
  assert.equal(await resetButton.isVisible(), true, 'Reset remains beside experience when Admin is closed');
  await page.locator('#admin-open-btn').click();
  assert.equal(await invincible.isChecked(), checkedBefore, 'Invincibility choice survives reopening');
  assert.equal(await resetButton.count(), 1, 'Reopening keeps a single reset control');
  await select(991902);
  assert.equal(await search.inputValue(), 'puissance physique', 'Closing and reopening Admin preserves entity navigation');
  await page.locator('.army-codex-icon').click();
  assert.equal(await form.count(), 0, 'Opening the army codex closes Admin');
  assert.equal(await page.locator('.army-codex-list').count(), 1);
  await page.locator('#admin-open-btn').click();
  assert.equal(await form.count(), 1, 'Admin reopens from its launcher');
  assert.equal(await page.locator('.army-codex-list').count(), 0, 'Opening Admin closes the army codex');
  await select(991902);
  assert.equal(await search.inputValue(), 'puissance physique', 'Switching between panels preserves Admin navigation');
  await select(991903);
  await entityTab.click();
  await search.fill('force');
  await generalTab.click();
  await search.fill('nickname');
  await statsTab.click();
  await allTab.click();
  await generalTab.click();
  assert.equal(await search.inputValue(), 'nickname', 'General search survives changing the Stats filter');
  await statsTab.click();
  await entityTab.click();
  assert.equal(await search.inputValue(), 'force', 'This entity retains its search separately from All');
  await generalTab.click();
  await search.fill('');
  await form.getByRole('button', { name: 'Reset', exact: true }).click();
  assert.equal(await generalTab.getAttribute('aria-selected'), 'true', 'Rebuilding the editor preserves General');
  await statsTab.click();
  assert.equal(await entityTab.getAttribute('aria-selected'), 'true', 'Rebuilding the editor preserves the hidden Stats filter');
  await select(991901);
  assert.equal(await allTab.getAttribute('aria-selected'), 'true', 'Other entities retain their own All filter');
  await select(991903);
  assert.equal(await entityTab.getAttribute('aria-selected'), 'true', 'Returning restores This entity');
  assert.equal(await search.inputValue(), 'force');
  await form.getByRole('button', { name: 'Attaques', exact: true }).click();
  await form.getByRole('button', { name: 'Entité active', exact: true }).click();
  assert.equal(await entityTab.getAttribute('aria-selected'), 'true', 'Returning from attacks keeps This entity');
  await form.getByRole('button', { name: 'Fermer', exact: true }).click();
  await page.locator('#admin-open-btn').click();
  await select(991903);
  assert.equal(await statsTab.getAttribute('aria-selected'), 'true', 'Reopening restores Stats');
  assert.equal(await entityTab.getAttribute('aria-selected'), 'true', 'Reopening restores This entity');
  assert.equal(await search.inputValue(), 'force');
  assert.equal(await form.locator('input[data-stat-key="strength"]').inputValue(), '30', 'Navigation restore shows the selected entity’s own total');
  await generalTab.click();
  await search.fill('nickname');
  await form.getByRole('button', { name: 'Fermer', exact: true }).click();
  await page.locator('#admin-open-btn').click();
  await select(991903);
  assert.equal(await generalTab.getAttribute('aria-selected'), 'true', 'Reopening also restores General');
  assert.equal(await search.inputValue(), 'nickname');
  await statsTab.click();
  assert.equal(await entityTab.getAttribute('aria-selected'), 'true', 'The last Stats filter survives reopening from General');
  await form.getByRole('button', { name: 'Fermer', exact: true }).click();

  await page.setViewportSize({ width: 1536, height: 480 });
  await page.evaluate(async () => {
    const E = await import("/js/entities/runtime.js"), UI = await import("/js/ui/codex/index.js"), S = await import("/js/storage/gameStorage.js");
    S.saveToLocalStorage('CodexMenuIndex', 3);
    S.saveToLocalStorage('CodexSubstatMode', 'stat');
    const menu = document.createElement('div'); menu.className = 'menu-map-container';
    document.querySelector('.Game-UI').append(menu);
    window.__openCodex = id => {
      menu.querySelectorAll('.codex-entity-scan').forEach(node => node.remove());
      UI.createCodexEntityScan(E.entites.find(actor => actor.id === id), menu, `codex-entity_${id}`);
    };
    window.__openCodex(991901);
  });
  const waitForCodex = () => page.waitForFunction(() => document.querySelector('.codex-entity-scan')?.dataset.navigationRestoring === 'false');
  const openCodex = async id => {
    await page.evaluate(value => window.__openCodex(value), id);
    await waitForCodex();
  };
  await waitForCodex();
  const codex = page.locator('.codex-entity-scan');
  const mainScroll = codex.locator('.codex-colomn-3');
  const codexScroll = await setScroll(mainScroll, 20);
  if (!codexScroll) {
    console.log(await codex.evaluate(root => [...root.querySelectorAll('*')].filter(node => node.clientHeight > 0 && node.scrollHeight > node.clientHeight + 10)
      .map(node => ({ class: node.className, height: node.clientHeight, scroll: node.scrollHeight, overflow: getComputedStyle(node).overflowY }))));
    await page.screenshot({ path: resolve(output, 'codex-scroll-debug.png'), fullPage: true });
  }
  assert.ok(codexScroll > 0, 'Real codex content is scrollable');
  await openCodex(991902);
  assert.equal(await mainScroll.evaluate(node => node.scrollTop), codexScroll, 'Codex position inherited by a new entity');
  await setScroll(mainScroll, 40);
  await openCodex(991901);
  assert.equal(await mainScroll.evaluate(node => node.scrollTop), codexScroll, 'Codex position restored per entity');
  await codex.locator('.codex-soul').first().click();
  await waitForCodex();
  await codex.locator('.umbra-filtre-title').click();
  await codex.locator('.umbra-filters label:has(input[data-group="attr"][value="force"])').click();
  await openCodex(991902);
  assert.equal(await codex.locator('.umbra-filtres-container').isVisible(), true, 'Filter panel remains open');
  assert.equal(await codex.locator('.umbra-filters input[value="force"]').isChecked(), true, 'Codex filters inherited');
  await codex.locator('.umbra-filters label:has(input[value="force"])').click();
  await codex.locator('.umbra-filters label:has(input[value="intelligence"])').click();
  await openCodex(991901);
  assert.equal(await codex.locator('.umbra-filters input[value="force"]').isChecked(), true, 'Codex filters restored per entity');
  assert.equal(await codex.locator('.umbra-filters input[value="intelligence"]').isChecked(), false);
  await page.screenshot({ path: resolve(output, 'codex-filters.png'), fullPage: true });
  await codex.locator('.codex-lore').click();
  await waitForCodex();
  await codex.locator('.codex-information-tabs [data-mode="combat"]').click();
  await openCodex(991902);
  assert.equal(await codex.locator('.codex-information-tabs [data-mode="combat"]').getAttribute('aria-selected'), 'true', 'Information subtab is remembered');
  await page.evaluate(async () => {
    (await import("/js/storage/gameStorage.js")).setAdminMode(false);
    window.levelRunning = 'worldmap';
    (await import("/js/debug/admin.js")).cleanupAdminLevel();
  });
  assert.equal(await page.locator('body.admin-level-active').count(), 0);
  assert.equal(await resetButton.count(), 0, 'Leaving Admin removes its reset control');
  assert.notEqual(await page.locator('.menu-player-icons').evaluate(node => getComputedStyle(node).left), '300px', 'Menu position is scoped to the Admin level');
  assert.deepEqual(errors, []);
  console.log('PASS Admin navigation: catalog/stat searches, nested attack view, entity scroll positions, panel reopen, codex scroll/filters/subtabs, compact actions, Enter validation, right-side layout and Admin-only CSS.');
} finally { await browser.close(); await new Promise(done => server.close(done)); }
