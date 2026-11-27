import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = resolve('docs'), output = resolve('outputs/admin-critical');
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  const path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!path.startsWith(root + sep)) return res.writeHead(403).end();
  try {
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png' })[extname(path)] || 'application/octet-stream');
    res.end(await readFile(path));
  } catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const checks = [], errors = [];
const equal = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks.push(label); };
const check = (value, label) => { assert.ok(value, label); checks.push(label); };
try {
  const page = await browser.newPage({ viewport: { width: 1536, height: 960 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.evaluate(async () => {
    const S = await import("/js/storage/gameStorage.js"), E = await import("/js/entities/runtime.js"), A = await import("/js/debug/admin.js");
    S.setAdminMode(true);
    window.levelRunning = 'admin'; window.currentStageId = 'admin-critical';
    S.setCurrentLevel('admin-critical');
    (await import("/js/storage/sessionStorage.js")).beginAdminSession();
    window.__persistent = JSON.stringify(Object.entries(localStorage).sort());
    S.saveToLocalStorage('GameStages', { stages: [{ id: 'admin-critical', level_type: 'admin' }] });
    S.saveToLocalStorage('selectedArmyA', []); S.saveToLocalStorage('ArmyB', { armies: {} });
    S.saveToLocalStorage('equippedItems', []);
    E.entites.length = 0;
    document.body.innerHTML = '<div id="game-container"><div class="Game-UI"></div><div class="AllEntitiesHud"></div><div id="hexGrid" class="hex-grid"></div></div>';
    const hex = document.createElement('div'); hex.id = 'hex_1'; hex.className = 'hex SideA';
    Object.assign(hex.dataset, { position: hex.id, row: 0, col: 0 });
    hex.appendChild(Object.assign(document.createElement('div'), { className: 'socle' }));
    document.getElementById('hexGrid').append(hex);
    const template = (await import("/js/data/entityTemplates.js")).entitesNest.find(e => e.serial === 1);
    const actor = E.enrichEntityStats({ ...structuredClone(template), id: 991801, side: 'A', position: hex.id,
      level: 1, stats: {}, stuff: {}, modifierStats: {},
      baseStats: { HP: 100, speed: 10000, will: 20, strength: 0, agility: 30, intelligence: 0 } });
    await (await import("/js/entities/spawn.js")).spawnEntiteIngame(actor);
    window.__actor = E.entites[0];
    A.initializeAdminLevel(E.entitesNestUp);
  });
  equal(await page.evaluate(() => window.__actor.Archetype.current.key), 'egare', 'Reproduces the level-one Égarée shown by the user');
  const form = page.locator('#admin-entity-form');
  const field = form.locator('.admin-stat-editor-row[data-stat-key="criticalPower"] input');
  const openEditor = async () => {
    await page.locator('#Box_Entite_991801').dispatchEvent('click', { detail: 1 });
    await form.getByRole('tab', { name: 'Stats', exact: true }).click();
  };
  await openEditor();
  equal(await field.getAttribute('aria-label'), 'Puissance critique', 'Admin uses the current Umbra name');
  for (const amount of [10, 30]) {
    await field.fill(String(amount));
    equal(await page.evaluate(() => window.__adminActiveLiveEntityDraft.stats.criticalPower), amount, `${amount} admin points remain active on Égaré`);
  }
  await form.locator('.admin-validate-live-entity-button').click();
  equal(await page.evaluate(() => window.__actor.stats.criticalPower), 30, 'Validation applies 30 to the live entity');
  check(await page.evaluate(() => window.__actor.stats.criticalChance > 0 && window.__actor.stats.criticalDamage > 50), 'Both critical effects activate');
  equal(await page.evaluate(() => window.__actor.Archetype.current.key), 'egare', 'Manual grant does not change the archetype');
  await page.evaluate(async () => {
    const UI = await import("/js/ui/codex/index.js");
    const host = document.createElement('div'); host.className = 'menu-map-container';
    document.querySelector('.Game-UI').append(host);
    window.__codex = UI.createCodexEntityScan(window.__actor, host, 'codex-entity_991801');
    window.__openTab = name => window.__codex.querySelector(name === 'Soul' ? '.codex-soul' : '.codex-stat').parentElement.click();
    window.__openTab('Soul');
  });
  const value = page.locator('#codex-entity_991801 .entite-stat.criticalPower:not(.preview)').filter({ visible: true });
  await value.first().waitFor({ state: 'visible' });
  equal((await value.first().innerText()).trim(), '30', 'Soul shows the manually granted Umbra');
  await form.evaluate(node => { node.style.visibility = 'hidden'; });
  await page.screenshot({ path: resolve(output, 'soul-critical-egare.png') });
  await form.evaluate(node => { node.style.visibility = ''; });
  await page.evaluate(() => { window.__openTab('Stats'); window.__codex.querySelector('[data-mode="umbra"]').click(); });
  equal((await value.first().innerText()).trim(), '30', 'Stats shows the same Umbra');
  const boundaries = await page.evaluate(async () => {
    const E = await import("/js/entities/runtime.js"), P = await import('/js/procedural/proc-bareme.js');
    const S = await import("/js/entities/statSystem.js");
    const copy = structuredClone(window.__actor);
    copy.baseStats.brutality = 30;
    E.recomputeEntityStats(copy);
    const result = { otherRestricted: P.isUmbraRestricted(copy, 'brutality'), otherValue: copy.stats.brutality };
    copy.modifierStats.durable.adminLevel.criticalPower = 300;
    E.recomputeEntityStats(copy);
    result.limited = copy.stats.criticalPower;
    result.expectedLimit = S.calculateStatPointLimit(0, 300, 0, 150).value;
    delete copy.modifierStats.durable.adminLevel.criticalPower;
    copy.baseStats.criticalPower = 30;
    E.recomputeEntityStats(copy);
    result.baseOnlyRestricted = P.isUmbraRestricted(copy, 'criticalPower');
    result.baseOnlyValue = copy.stats.criticalPower;
    return result;
  });
  check(boundaries.otherRestricted && boundaries.otherValue === 0, 'Other rank-two Umbras remain restricted');
  equal(boundaries.limited, boundaries.expectedLimit, 'The shared point threshold still applies to manual grants');
  check(boundaries.baseOnlyRestricted && boundaries.baseOnlyValue === 0, 'Ordinary sources retain the awakening requirement');
  await page.evaluate(() => window.__codex.remove());
  await openEditor();
  equal(await field.inputValue(), '30', 'Reopening admin retains the manual amount');
  await field.fill('0');
  await form.locator('.admin-validate-live-entity-button').click();
  equal(await page.evaluate(() => [window.__actor.stats.criticalPower ?? 0, window.__actor.stats.criticalChance, window.__actor.stats.criticalDamage]), [0, 0, 50], 'Removing the grant removes the Umbra and its generated effects');
  check(await page.evaluate(() => window.__persistent === JSON.stringify(Object.entries(localStorage).sort())), 'Admin test preserves the player save');
  equal(errors, [], 'No browser errors or exception pauses');
  await writeFile(resolve(output, 'regression.json'), JSON.stringify({ checks, boundaries }, null, 2));
  console.log(`PASS admin critical: ${checks.length} checks, Égaré manual grant, Soul, Stats, effects, restrictions, threshold and removal.`);
} finally { await browser.close(); await new Promise(done => server.close(done)); }
