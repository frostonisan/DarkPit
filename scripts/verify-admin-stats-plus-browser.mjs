import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = resolve('docs'), output = resolve('outputs/admin-stats-plus');
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
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true });
const checks = [], errors = [];
const check = (condition, label) => { assert.ok(condition, label); checks.push(label); };
const equal = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks.push(label); };
try {
  const page = await browser.newPage({ viewport: { width: 1536, height: 960 } });
  page.on('pageerror', error => errors.push(error.stack || error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  const choices = await page.evaluate(async () => {
    const S = await import("/js/storage/gameStorage.js"), E = await import("/js/entities/runtime.js"), A = await import("/js/debug/admin.js");
    S.setAdminMode(true);
    window.levelRunning = 'admin'; window.currentStageId = 'admin-stats-plus';
    S.setCurrentLevel('admin-stats-plus');
    (await import("/js/storage/sessionStorage.js")).beginAdminSession();
    window.__persistent = JSON.stringify(Object.entries(localStorage).sort());
    S.saveToLocalStorage('GameStages', { stages: [{ id: 'admin-stats-plus', level_type: 'admin' }] });
    S.saveToLocalStorage('selectedArmyA', []); S.saveToLocalStorage('ArmyB', { armies: {} });
    S.saveToLocalStorage('equippedItems', []);
    E.entites.length = 0;
    document.body.innerHTML = '<div id="game-container"><div class="Game-UI"></div><div class="AllEntitiesHud"></div><div id="hexGrid" class="hex-grid"></div></div>';
    const grid = document.getElementById('hexGrid');
    grid.style.cssText = 'position:fixed;left:520px;top:180px;display:flex;gap:30px;transform:none;';
    const template = (await import("/js/data/entityTemplates.js")).entitesNest.find(row => row.serial === 900013);
    for (let i = 1; i <= 2; i++) {
      const hex = document.createElement('div'); hex.id = `hex_${i}`;
      Object.assign(hex.dataset, { position: hex.id, row: 0, col: i - 1 });
      hex.className = 'hex SideA';
      hex.style.cssText = 'width:120px;height:120px;position:relative;transform:none;background:#20252a;';
      hex.appendChild(Object.assign(document.createElement('div'), { className: 'socle' })); grid.appendChild(hex);
      // This fixture extends the terrain directly; publish its new geometry before spawning.
      (await import('/js/board/controller.js')).invalidateFootprintGeometry(grid);
      const actor = E.enrichEntityStats({ ...structuredClone(template), id: 991800 + i, name: `Stats + ${i}`, side: 'A', position: hex.id,
        level: 1, awakening: 1, attacks: ['shot-p-r'], stats: {}, stuff: {},
        modifierStats: { durable: { adminLevel: { physicalDamage: 3 } } },
        baseStats: { HP: 100, speed: 10000, strength: 10, agility: 5, intelligence: 3, physicalDamage: 20 } });
      await (await import("/js/entities/spawn.js")).spawnEntiteIngame(actor);
    }
    window.__actor = E.entites[0]; window.__other = E.entites[1];
    window.__otherBefore = JSON.stringify(window.__other);
    A.initializeAdminLevel(E.entitesNestUp);
    const { STAT_SYSTEM_ORIGINS } = await import("/js/entities/statSystem.js");
    const { stats } = await import('/js/data/statsData.js');
    const uniquePassives = new Set(stats.filter(stat => stat.uniquePassive).map(stat => stat.key));
    const choices = (await import('/js/items/permanentItems.js')).getPermanentStatChoices().filter(entry => entry.key.endsWith('Plus'));
    if (JSON.stringify(choices.map(entry => entry.key).sort()) !== JSON.stringify(Object.keys(STAT_SYSTEM_ORIGINS).filter(key => !uniquePassives.has(key)).map(key => `${key}Plus`).sort())) throw Error('Current stat+ catalog mismatch');
    return choices;
  });
  await page.locator('#Box_Entite_991801').dispatchEvent('click', { detail: 1 });
  const form = page.locator('#admin-entity-form');
  const row = key => form.locator(`.admin-stat-editor-row[data-stat-key="${key}"]`);
  const field = key => row(key).locator('input');
  await form.getByRole('tab', { name: 'Stats', exact: true }).click();
  await form.getByRole('tab', { name: 'All', exact: true }).click();
  await field('physicalDamagePlus').waitFor({ state: 'visible' });
  check(await form.locator('.admin-stat-editor-header').filter({ hasText: /^Stats \+$/ }).isVisible(), 'Stats + has its own section');
  equal(await form.locator('.admin-stat-editor-row[data-stat-key$="Plus"]').count(), choices.length, 'Every current stat+ appears exactly once, even when absent from the entity');
  for (const choice of choices) {
    equal(await field(choice.key).inputValue(), '0', `${choice.name}: no fallback to the normal stat`);
    equal(await row(choice.key).locator('.admin-stat-editor-name').innerText(), choice.name, `${choice.key}: readable catalog name`);
    check(await row(choice.key).locator(`.picto-stat.${choice.icon}`).count() === 1, `${choice.key}: native pictogram`);
  }
  const search = form.getByPlaceholder('Rechercher une stat…');
  await search.fill('Puissance physique +');
  check(await row('physicalDamagePlus').isVisible(), 'Stat+ is found through the existing search');
  check(await row('physicalDamage').isHidden(), 'Searching for the plus variant filters the ordinary stat');
  await page.screenshot({ path: resolve(output, 'stats-plus-search.png') });
  await search.fill('');
  const read = () => page.evaluate(() => {
    const draft = window.__adminActiveLiveEntityDraft;
    return { base: draft.baseStats.physicalDamage, basePlus: draft.baseStats.physicalDamagePlus || 0,
      modifier: draft.modifierStats.durable.adminLevel.physicalDamage,
      modifierPlus: draft.modifierStats.durable.adminLevel.physicalDamagePlus || 0,
      total: draft.stats.physicalDamage, plus: draft.stats.physicalDamagePlus || 0,
      livePlus: window.__actor.stats.physicalDamagePlus || 0 };
  });
  const before = await read();
  equal(await field('physicalDamage').inputValue(), '3', 'Ordinary PP field shows only added points, not base PP or calculated totals');
  equal(await field('strength').inputValue(), '0', 'Attribute field shows only its added points');
  await field('physicalDamagePlus').fill('10');
  equal(await field('physicalDamagePlus').inputValue(), '10', 'Admin can set the PP+ amount');
  let edited = await read();
  equal(edited.base, before.base, 'Editing PP+ preserves base PP');
  equal(edited.modifier, before.modifier, 'Editing PP+ preserves the separate normal admin bonus');
  equal(edited.modifierPlus, 10, 'PP+ is stored under its own admin key');
  check(edited.total > before.total + 10, 'PP+ enables the actual game attribute ratio');
  equal(edited.livePlus, 0, 'Editing keeps the selected entity draft until validation');
  await field('vigueur').fill('6');
  await field('strength').fill('10');
  equal(await field('physicalDamage').inputValue(), '3', 'Changing an Umbra and its attribute never copies their ratios into the fixed PP input');
  equal(await field('physicalDamagePlus').inputValue(), '10', 'Attribute and Umbra recalculation leaves PP+ input at its raw amount');
  await field('physicalDamage').fill('10');
  equal((await read()).modifier, 10, 'Typing 10 PP adds exactly 10 PP without subtracting existing ratios');
  await row('physicalDamage').getByRole('button', { name: 'Ajouter 1 Puissance physique', exact: true }).click();
  equal((await read()).modifier, 11, 'Fixed stat stepper adds one raw point even while ratios are active');
  await row('physicalDamage').getByRole('button', { name: 'Retirer 1 Puissance physique', exact: true }).click();
  const parity = await page.evaluate(async () => {
    const E = await import("/js/entities/runtime.js");
    const draft = window.__adminActiveLiveEntityDraft;
    const crystal = structuredClone(draft);
    for (const [key, value] of Object.entries(crystal.modifierStats.durable.adminLevel)) {
      crystal.baseStats[key] = Number(crystal.baseStats[key] || 0) + value;
    }
    crystal.modifierStats.durable.adminLevel = {};
    E.recomputeEntityStats(crystal);
    return ['physicalDamage', 'physicalDamagePlus', 'strength', 'vigueur'].map(key => [key, draft.stats[key], crystal.stats[key]]);
  });
  for (const [key, actual, expected] of parity) equal(actual, expected, `${key}: raw admin grants match equivalent crystal points`);
  await field('physicalResistance').fill('150');
  equal(await field('physicalResistance').inputValue(), '150', 'A capped stat keeps the raw amount in its input');
  check(await page.evaluate(() => window.__adminActiveLiveEntityDraft.stats.physicalResistance === 150), 'Resistance remains an uncapped score; mitigation is converted at impact');
  await row('physicalResistance').getByRole('button', { name: 'Ajouter 1 Résistance physique', exact: true }).click();
  equal(await field('physicalResistance').inputValue(), '151', 'Adding a point to a capped result does not reset the raw input');
  await field('physicalResistance').fill('0');
  await field('physicalDamage').fill('3');
  await field('vigueur').fill('0');
  await field('strength').fill('0');
  await row('physicalDamagePlus').getByRole('button', { name: 'Ajouter 1 Puissance physique +', exact: true }).click();
  equal(await field('physicalDamagePlus').inputValue(), '11', 'Plus stepper increases the bonus');
  await row('physicalDamagePlus').getByRole('button', { name: 'Retirer 1 Puissance physique +', exact: true }).click();
  equal(await field('physicalDamagePlus').inputValue(), '10', 'Minus stepper decreases the bonus');
  await field('physicalDamagePlus').fill('0');
  edited = await read();
  equal(edited.total, before.total, 'Removing PP+ removes its ratio without losing normal PP');
  equal(edited.modifier, before.modifier, 'Removing PP+ does not delete the normal admin modifier');
  const baseMode = form.getByLabel('BaseStats', { exact: true });
  await form.getByRole('tab',{name:'Général',exact:true}).click();
  await baseMode.check();
  await form.getByRole('tab',{name:'Stats',exact:true}).click();
  equal(await field('physicalDamagePlus').inputValue(), '0', 'Base mode does not invent PP+ from fixed PP');
  equal(await field('HPPlus').inputValue(), '0', 'Base mode keeps HP+ separate from HP');
  await field('physicalDamagePlus').fill('4');
  edited = await read();
  equal(edited.basePlus, 4, 'BaseStats can edit the independent plus source');
  equal(edited.base, before.base, 'BaseStats plus edit preserves fixed PP');
  await form.getByRole('tab',{name:'Général',exact:true}).click();
  await baseMode.uncheck();
  await form.getByRole('tab',{name:'Stats',exact:true}).click();
  equal(await field('physicalDamagePlus').inputValue(), '0', 'Added-points mode stays separate from the existing base plus source');
  await field('physicalDamagePlus').fill('7');
  edited = await read();
  equal(edited.modifierPlus, 7, 'Typing 7 adds seven raw plus points on top of existing sources');
  equal(edited.plus, 11, 'Four existing plus points and seven added points remain separate from the ratios');
  equal(edited.modifier, before.modifier, 'Raw plus grant leaves normal modifiers intact');
  await field('attackCooldownReducPlus').fill('1.5');
  equal(await field('attackCooldownReducPlus').inputValue(), '1.5', 'Percentage plus stats accept fractional values');
  const resilienceStats = ['criticalResistance', 'alterationResistance', 'hindranceResistance'];
  for (const key of resilienceStats) {
    await field(key).fill('5');
    await field(key + 'Plus').fill('3');
  }
  await form.getByRole('tab', { name: 'This entity', exact: true }).click();
  for (const key of resilienceStats) {
    check(await row(key).isVisible(), `${key}: owned resistance appears in This entity`);
    check(await row(key + 'Plus').isVisible(), `${key}: owned plus appears in This entity`);
    check(Number(await field(key).inputValue()) >= 8, `${key}: total includes normal, plus and the attribute ratio`);
    equal(await field(key + 'Plus').inputValue(), '3', `${key}: plus input retains its own source amount`);
  }
  await form.locator('.admin-validate-live-entity-button').click();
  await page.waitForFunction(() => window.__actor.stats.physicalDamagePlus === 11);
  check(await page.evaluate(() => window.__actor.baseStats.physicalDamage === 20
    && window.__actor.baseStats.physicalDamagePlus === 4
    && window.__actor.modifierStats.durable.adminLevel.physicalDamage === 3
    && window.__actor.modifierStats.durable.adminLevel.physicalDamagePlus === 7), 'Validation applies separate fixed and plus sources to the selected entity');
  check(await page.evaluate(() => JSON.stringify(window.__other) === window.__otherBefore), 'Other entities remain unchanged');
  await page.locator('#Box_Entite_991801').dispatchEvent('click', { detail: 1 });
  await form.getByRole('tab', { name: 'Stats', exact: true }).click();
  await form.getByRole('tab', { name: 'All', exact: true }).click();
  await field('physicalDamagePlus').waitFor({ state: 'visible' });
  for (const key of resilienceStats) {
    equal(await field(key).inputValue(), '5', `${key}: normal points survive validation`);
    equal(await field(key + 'Plus').inputValue(), '3', `${key}: plus points survive validation`);
  }
  equal(await field('physicalDamagePlus').inputValue(), '7', 'Reopening the selected entity retains the applied plus amount');
  await search.fill(' +');
  await page.screenshot({ path: resolve(output, 'stats-plus-list.png') });
  check(await page.evaluate(() => window.__persistent === JSON.stringify(Object.entries(localStorage).sort())), 'Admin edits preserve the player persistent save');
  const codexRows = await page.evaluate(async keys => {
    const UI = await import("/js/ui/codex/index.js");
    document.getElementById('admin-entity-form').remove();
    const mount = document.createElement('div');
    mount.style.cssText = 'position:fixed;inset:0;overflow:auto;background:#111';
    document.body.append(mount);
    UI.createCodexEntityScan(window.__actor, mount, 'admin-resilience-codex');
    mount.querySelector('.codex-inner-menu:has(.codex-stat)').click();
    mount.querySelector('.section-content.stats [data-mode="stat"]').click();
    return keys.map(key => {
      const node = mount.querySelector(`.section-content.stats [data-stat="${key}"]`);
      return { key, visible: Boolean(node?.getClientRects().length), text: node?.textContent, total: window.__actor.stats[key] };
    });
  }, resilienceStats);
  for (const entry of codexRows) check(entry.visible && entry.total >= 8, `${entry.key}: validated resistance appears in the Codex (${entry.text})`);
  const cachedCodexChecks = await page.evaluate(async keys => {
    const UI = await import("/js/ui/codex/index.js");
    const E = await import("/js/entities/runtime.js");
    const S = await import("/js/storage/gameStorage.js");
    const A = await import("/js/debug/admin.js");
    const template = (await import("/js/data/entityTemplates.js")).entitesNest.find(row => row.serial === 900013);
    document.querySelectorAll('.codex-entity-scan').forEach(node => node.remove());
    S.saveToLocalStorage('selectedArmyA', []);
    const results = [];
    for (const side of ['A', 'B']) for (const plus of [false, true]) {
      const actor = E.enrichEntityStats({ ...structuredClone(template), id: 993000 + results.length,
        side, level: 1, awakening: 1, attacks: ['shot-p-r'], stats: {}, stuff: {}, modifierStats: {},
        baseStats: { HP: 100, strength: 10, intelligence: 10, agility: 10 } });
      E.entites.push(actor);
      const cached = structuredClone(actor);
      const mount = document.createElement('div');
      document.body.append(mount);
      UI.createCodexEntityScan(cached, mount, `codex-entity_${actor.id}`);
      mount.querySelector(`.codex-inner-menu:has(.${plus ? 'codex-stat' : 'codex-profil'})`).click();
      if (plus) mount.querySelector('.section-content.stats [data-mode="stat"]').click();
      const draft = structuredClone(actor);
      draft.modifierStats.durable ||= {};
      draft.modifierStats.durable.adminLevel = Object.fromEntries(keys.map(key => [key + (plus ? 'Plus' : ''), 5]));
      A.applyAdminLiveEntityDraft(actor, draft);
      await new Promise(done => setTimeout(done, 100));
      // Reopening Stats used to read the stale Codex copy for board-only entities.
      mount.querySelector('.codex-inner-menu:has(.codex-stat)').click();
      mount.querySelector('.section-content.stats [data-mode="stat"]').click();
      const rows = keys.map(key => {
        const nodes = mount.querySelectorAll(`.codex-attack-stat-block .stat-container[data-stat="${key}"]`);
        const node = nodes[0];
        return { key, count: nodes.length, visible: Boolean(node?.getClientRects().length),
          value: node?.querySelector('.entite-stat')?.textContent,
          state: node?.querySelector('.entite-stat')?.dataset.statState,
          total: actor.stats[key] };
      });
      // A reopened Codex must also prefer the current board entity to the old copy.
      mount.remove();
      const reopened = document.createElement('div'); document.body.append(reopened);
      UI.createCodexEntityScan(cached, reopened, `codex-entity_${actor.id}`);
      reopened.querySelector('.codex-inner-menu:has(.codex-stat)').click();
      reopened.querySelector('.section-content.stats [data-mode="stat"]').click();
      const reopenedCount = keys.filter(key => reopened.querySelector(`.codex-attack-stat-block .stat-container[data-stat="${key}"]`)).length;
      results.push({ side, plus, rows, reopenedCount });
      reopened.remove(); E.entites.pop();
    }
    return results;
  }, [...resilienceStats, 'physicalDamage']);
  for (const result of cachedCodexChecks) {
    for (const entry of result.rows) {
      const context = `${result.side} ${entry.key}${result.plus ? '+' : ''}`;
      check(entry.visible && entry.count === 1, `${context}: appears once after returning to cached Codex Stats`);
      check(entry.value?.includes(String(Number(entry.total.toFixed(2)))), `${context}: Codex displays the current total`);
      equal(entry.state, result.plus ? '+' : 'normal', `${context}: Codex keeps the correct stat variant`);
    }
    equal(result.reopenedCount, 4, `${result.side} ${result.plus ? '+' : 'normal'}: reopening an old Codex snapshot uses the live entity`);
  }
  equal(errors, [], 'No browser errors');
  await writeFile(resolve(output, 'verification.json'), JSON.stringify({ count: checks.length, choices: choices.length, checks, errors }, null, 2));
  console.log(`Admin stat+ browser: ${checks.length} checks passed; ${choices.length} current stats +.`);
} finally {
  await browser.close();
  await new Promise(done => server.close(done));
}
