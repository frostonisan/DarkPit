import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('docs'), output = resolve('outputs/nested-helpers');
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  const file = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  const rel = relative(root, file);
  if (rel === '..' || rel.startsWith('..' + sep)) return res.writeHead(403).end();
  try {
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
import { dismissStarterForFixture } from './browser-test-fixture.mjs';
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [], checks = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await dismissStarterForFixture(page);
  await page.evaluate(async () => {
    const E = await import("/js/entities/runtime.js"), G = await import("/js/storage/gameStorage.js");
    const UI = await Promise.all([import("/js/ui/application.js"), import("/js/ui/attacks.js"), import("/js/ui/codex/index.js"), import("/js/ui/codex/profile.js"), import("/js/ui/codex/stats.js"), import("/js/ui/dialogue.js"), import("/js/ui/display.js"), import("/js/ui/drag.js"), import("/js/ui/essences.js"), import("/js/ui/inventory.js"), import("/js/ui/navigation.js"), import("/js/ui/statistics/components.js"), import("/js/ui/statistics/details.js"), import("/js/ui/statistics/helpers.js")]).then(parts => Object.defineProperties({}, Object.fromEntries(parts.flatMap(part => Object.keys(part).map(key => [key, { enumerable: true, get: () => part[key] }]))))), P = await import("/js/entities/progression.js");
    const State = await import("/js/app/state.js");
    window.levelRunning = 'worldmap'; G.setAdminMode(true); State.refreshStageAccess();
    const entity = { id: 986742, name: 'Pictos et types de malus', type: 'sbire', side: 'A', awakening: 3,
      level: { current: 30, max: 250 }, baseStats: { HP: 100, strength: 25, intelligence: 25, agility: 25,
        brutality: 12, inflexion: 12, resilience: 10, charge: 3 },
      attacks: ['autoAttack'], stuff: {} };
    E.recomputeEntityStats(entity, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
    E.entites.splice(0, E.entites.length, entity);
    G.saveToLocalStorage('selectedArmyA', [entity]); G.saveToLocalStorage('equippedItems', []);
    P.setPlayerExperience(1000000);
    const host = document.createElement('main'); host.id = 'icon-audit';
    host.style.cssText = 'position:fixed;inset:0;overflow:auto;background:#240000'; document.getElementById('game-shell').append(host);
    UI.createCodexEntityScan(entity, host, `codex-entity_${entity.id}`);
    window.audit = { UI, host, entity,
      mode(mode, kind = 'umbra') {
        UI.closeOpenHelpers();
        host.querySelector(`.codex-inner-menu:has(.codex-${mode === 'Stats' ? 'stat' : 'soul'})`).click();
        if (mode === 'Stats') host.querySelector(`.section-content.stats [data-mode="${kind}"]`).click();
      },
      open(key) {
        UI.closeOpenHelpers();
        const row = [...host.querySelectorAll(`.stat-container[data-stat="${key}"]`)].find(node => node.getClientRects().length);
        if (!row) throw Error('Missing visible row: ' + key);
        row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      }
    };
  });
  const root = page.locator('[data-umbra-pinned="true"]:not([data-umbra-detail])');
  const detail = key => page.locator(`[data-umbra-detail][data-helper-picto-subject="${key}"]`);
  const link = (card, key) => card.locator(`[data-helper-entry="${key}UmbraGrant"], .picto-stat[data-helper-picto-stat="${key}"]`).first();
  await page.evaluate(() => { audit.mode('Stats'); audit.open('resilience'); });
  const resistanceLink = link(root, 'hindranceResistance');
  await resistanceLink.hover();
  await detail('hindranceResistance').waitFor({ state: 'visible' });
  await page.mouse.move(2, 2);
  await detail('hindranceResistance').waitFor({ state: 'detached' });
  checks.push('Ordinary unpinned hover closes on mouse leave');

  await resistanceLink.click();
  const resistance = detail('hindranceResistance');
  await page.mouse.move(2, 2);
  assert.equal(await resistance.getAttribute('data-umbra-pinned'), 'true');
  assert.equal(await resistance.evaluate(node => getComputedStyle(node).pointerEvents), 'auto');
  await link(resistance, 'entrave').click();
  const entrave = detail('entrave');
  await entrave.waitFor({ state: 'visible' });
  assert.equal(await entrave.locator('.umbra-description').innerText(), 'Type de malus : Entrave');
  assert.match(await entrave.locator('.stat-hover-body').innerText(), /mouvement forcé, paralysie partielle ou totale/);
  assert.equal(await resistance.count(), 0);
  assert.equal(await page.locator('[data-umbra-detail]').count(), 1);
  assert.equal(await root.count(), 1);
  assert.equal(await entrave.getAttribute('data-umbra-pinned'), 'true');
  checks.push('A deeper description replaces its parent detail and keeps the main card');

  await page.evaluate(async () => {
    window.nestedAuditNodes = [...document.querySelectorAll('[data-umbra-detail]')];
    audit.entity.baseStats.resilience += 3;
    const E = await import('/js/entities/runtime.js');
    E.recomputeEntityStats(audit.entity, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
    window.dispatchEvent(new CustomEvent('entityCombatStatsChanged', { detail: { entity: audit.entity } }));
  });
  await page.waitForFunction(() => document.querySelector('[data-umbra-pinned="true"]:not([data-umbra-detail]) [data-helper-source="umbra-grant"]')?.textContent.replace(/\s/g, '').includes('+13'));
  assert.equal(await page.locator('[data-umbra-detail]').count(), 1);
  assert.equal(await entrave.count(), 1);
  assert.equal(await page.evaluate(() => nestedAuditNodes.every(node => node.isConnected && node.dataset.umbraPinned === 'true' && node._sourceAnchor.isConnected)), true);
  checks.push('Live refresh keeps the single detail and rebinds its source on the main card');
  await page.waitForFunction(() => [...document.querySelectorAll('[data-umbra-detail]')].every(node => getComputedStyle(node).opacity === '1'));
  await page.screenshot({ path: resolve(output, 'resilience-single-detail.png') });

  await page.keyboard.press('Escape');
  assert.equal(await page.locator('[data-umbra-detail]').count(), 0);
  assert.equal(await root.count(), 1);
  checks.push('Escape closes the detail without closing the main card');
  await resistanceLink.click();
  await resistanceLink.click();
  assert.equal(await page.locator('[data-umbra-detail]').count(), 0);
  assert.equal(await root.count(), 1);
  checks.push('Clicking the pinned source again closes its detail');

  await resistanceLink.click();
  await link(resistance, 'entrave').click();
  await root.locator('.umbra-description').click();
  assert.equal(await page.locator('[data-umbra-detail]').count(), 0);
  assert.equal(await root.count(), 1);
  checks.push('Clicking the main card background closes its current detail');

  await resistanceLink.click();
  const alterationLink = link(root, 'alterationResistance');
  await alterationLink.click();
  assert.equal(await resistance.count(), 0);
  assert.equal(await resistanceLink.getAttribute('aria-expanded'), null);
  assert.equal(await page.locator('[data-umbra-detail][data-umbra-pinned="true"]').count(), 1);
  const alteration = detail('alterationResistance');
  await link(alteration, 'alteration').focus();
  assert.equal(await alteration.count(), 1, 'Focusing an inner link keeps it available for activation');
  await page.keyboard.press('Enter');
  assert.equal(await alteration.count(), 0);
  assert.equal(await page.locator('[data-umbra-detail]').count(), 1);
  assert.equal(await detail('alteration').getAttribute('data-umbra-pinned'), 'true');
  for (const section of ['.umbra-description', '.stat-hover-body']) {
    const concept = detail('alteration').locator(section);
    assert.match(await concept.locator('.picto-stat.alteration').evaluate(node => getComputedStyle(node).backgroundImage), /picto-alteration\.svg/);
    assert.equal(await concept.locator('.picto-stat.alteration').evaluate(node => getComputedStyle(node).color), 'rgb(154, 70, 255)');
    assert.equal(await concept.locator('[data-helper-effect="alteration"]').evaluate(node => getComputedStyle(node).color), 'rgb(156, 69, 69)');
  }
  checks.push('Opening a sibling or activating an inner keyboard link replaces the previous detail');
  checks.push('Altération keeps its purple pictogram and malus-colored text');
  await page.waitForFunction(() => [...document.querySelectorAll('[data-umbra-detail]')].every(node => getComputedStyle(node).opacity === '1'));
  await page.screenshot({ path: resolve(output, 'alteration-colored-helper.png') });
  await page.mouse.move(2, 2);
  await alterationLink.focus();
  await page.keyboard.press('Space');
  assert.equal(await page.locator('[data-umbra-detail]').count(), 0);
  checks.push('Space toggles the current pinned detail from its main source');
  await resistanceLink.focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('[data-umbra-detail]').count(), 1);
  await alterationLink.hover();
  assert.equal(await resistance.count(), 0);
  assert.equal(await page.locator('[data-umbra-detail]').count(), 1, 'Hovering another source also replaces a pinned detail');
  await alterationLink.click();

  await page.setViewportSize({ width: 390, height: 700 });
  assert.equal(await page.locator('[data-umbra-detail]').count(), 1);
  for (const bounds of await page.locator('[data-umbra-detail]').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().toJSON()))) {
    assert.ok(bounds.x >= 0 && bounds.right <= 390 && bounds.y >= 0 && bounds.bottom <= 700);
  }
  await page.screenshot({ path: resolve(output, 'single-detail-mobile.png') });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.mouse.click(1435, 995);
  assert.equal(await page.locator('[data-umbra-pinned], [data-umbra-detail]').count(), 0);
  checks.push('The single detail stays in bounds on mobile and closes on outside click');

  // Navigate from a ratio to its source statistic, then change that source.
  await page.evaluate(() => audit.open('resilience'));
  await root.locator('[data-umbra-info-toggle]').click();
  const ratio = root.locator('[data-helper-ratio][data-ratio-stat="strength"]').first();
  await ratio.locator('.helper-figure > span:not(.picto-stat)').click();
  const details = page.locator('[data-umbra-detail]');
  await details.locator('[data-helper-stat-value="strength"]').first().click();
  assert.equal(await details.count(), 1);
  assert.equal(await details.getAttribute('data-helper-picto-subject'), 'strength');
  const total = details.locator('.helper-score-total .helper-figure');
  const before = Number((await total.innerText()).replace(/[^\d.]/g, ''));
  await page.evaluate(async () => {
    audit.entity.baseStats.strength += 10;
    const E = await import('/js/entities/runtime.js');
    E.recomputeEntityStats(audit.entity, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
    window.dispatchEvent(new CustomEvent('entityCombatStatsChanged', { detail: { entity: audit.entity } }));
  });
  await page.waitForFunction(before => {
    const text = document.querySelector('[data-umbra-detail] .helper-score-total .helper-figure')?.textContent || '';
    return Number(text.replace(/[^\d.]/g, '')) > before;
  }, before);
  assert.equal(Number((await total.innerText()).replace(/[^\d.]/g, '')), before + 10);
  assert.equal(await details.count(), 1);
  assert.equal(await details.getAttribute('data-helper-picto-subject'), 'strength');
  checks.push('A statistic replaces its ratio and follows live source values without reopening older details');

  await page.evaluate(() => audit.open('resilience'));
  await link(root, 'hindranceResistance').click();
  await page.evaluate(() => audit.mode('Level up'));
  await page.waitForFunction(() => !document.querySelector('[data-umbra-pinned], [data-umbra-detail]'));
  checks.push('Leaving the Codex section closes the main card and its detail');
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'checks.json'), JSON.stringify(checks, null, 2));
  console.log('PASS:\n' + checks.join('\n'));
} finally { await browser.close(); await new Promise(done => server.close(done)); }
