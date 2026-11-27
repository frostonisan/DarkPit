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
  const link = (card, key) => card.locator(`.picto-stat[data-helper-picto-stat="${key}"]`).first();
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
  await link(resistance, 'entrave').hover();
  const entrave = detail('entrave');
  await entrave.waitFor({ state: 'visible' });
  assert.equal(await entrave.locator('.umbra-description').innerText(), 'Type de malus : Entrave');
  assert.match(await entrave.locator('.stat-hover-body').innerText(), /mouvement forcé, paralysie partielle ou totale/);
  assert.equal(await resistance.count(), 1);
  checks.push('Pinned Résilience → pinned Résistance aux entraves X → Entrave');
  await link(resistance, 'entrave').click();
  await page.mouse.move(2, 2);
  assert.equal(await entrave.getAttribute('data-umbra-pinned'), 'true');

  // Refresh the root with a new entity value while retaining the whole chain.
  const beforeNodes = await page.evaluate(() => {
    window.nestedAuditNodes = [...document.querySelectorAll('[data-umbra-detail]')];
    audit.entity.baseStats.resilience += 3;
    return document.querySelectorAll('[data-umbra-detail]').length;
  });
  await page.evaluate(async () => {
    const E = await import("/js/entities/runtime.js");
    E.recomputeEntityStats(audit.entity, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
    window.dispatchEvent(new CustomEvent('entityCombatStatsChanged', { detail: { entity: audit.entity } }));
  });
  await page.waitForFunction(() => document.querySelector('[data-umbra-pinned="true"]:not([data-umbra-detail]) .short-descri')?.textContent.includes('+13'));
  assert.equal(await page.locator('[data-umbra-detail]').count(), beforeNodes);
  assert.equal(await page.evaluate(() => nestedAuditNodes.every(node => node.isConnected && node.dataset.umbraPinned === 'true' && node._sourceAnchor.isConnected)), true);
  checks.push('Live values refresh without closing or recreating the pinned chain');
  await page.waitForFunction(() => [...document.querySelectorAll('[data-umbra-detail]')].every(node => getComputedStyle(node).opacity === '1'));
  await page.screenshot({ path: resolve(output, 'resilience-entrave-chain.png') });

  await page.keyboard.press('Escape');
  assert.equal(await entrave.count(), 0);
  assert.equal(await resistance.count(), 1);
  assert.equal(await root.count(), 1);
  checks.push('Escape closes the deepest helper and keeps its parents');
  await link(resistance, 'entrave').click();
  await resistanceLink.click();
  assert.equal(await page.locator('[data-umbra-detail]').count(), 0);
  assert.equal(await root.count(), 1);
  checks.push('Clicking a pinned source again closes it and its descendants');

  await resistanceLink.click();
  await link(resistance, 'entrave').click();
  await resistance.locator('.umbra-description').click();
  assert.equal(await entrave.count(), 0);
  assert.equal(await resistance.getAttribute('data-umbra-pinned'), 'true');
  assert.equal(await root.count(), 1);
  await link(resistance, 'entrave').click();
  await root.locator('.umbra-description').click();
  assert.equal(await page.locator('[data-umbra-detail]').count(), 0);
  assert.equal(await root.count(), 1);
  checks.push('Clicking parent text closes its descendants, retaining the clicked parent');

  // Lock two sibling descriptions, without the second replacing the first.
  await resistanceLink.click();
  const alterationLink = link(root, 'alterationResistance');
  await alterationLink.click();
  assert.equal(await page.locator('[data-umbra-detail][data-umbra-pinned="true"]').count(), 2);
  const alteration = detail('alterationResistance');
  await link(alteration, 'alteration').focus();
  await page.keyboard.press('Enter');
  assert.equal(await detail('alteration').getAttribute('data-umbra-pinned'), 'true');
  for (const section of ['.umbra-description', '.stat-hover-body']) {
    const concept = detail('alteration').locator(section);
    assert.match(await concept.locator('.picto-stat.alteration').evaluate(node => getComputedStyle(node).backgroundImage), /picto-alteration\.svg/);
    assert.equal(await concept.locator('.picto-stat.alteration').evaluate(node => getComputedStyle(node).color), 'rgb(154, 70, 255)');
    assert.equal(await concept.locator('[data-helper-effect="alteration"]').evaluate(node => getComputedStyle(node).color), 'rgb(156, 69, 69)');
  }
  checks.push('Altération keeps its purple pictogram with malus-colored text in the heading and description');
  await page.waitForFunction(() => [...document.querySelectorAll('[data-umbra-detail]')].every(node => getComputedStyle(node).opacity === '1'));
  await page.screenshot({ path: resolve(output, 'alteration-colored-helper.png') });
  await page.mouse.move(2, 2);
  await link(alteration, 'alteration').focus();
  await page.keyboard.press('Space');
  assert.equal(await detail('alteration').count(), 0);
  checks.push('Multiple pinned siblings and keyboard pin/unpin work');

  await page.setViewportSize({ width: 390, height: 700 });
  for (const bounds of await page.locator('[data-umbra-detail]').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().toJSON()))) {
    assert.ok(bounds.x >= 0 && bounds.right <= 390 && bounds.y >= 0 && bounds.bottom <= 700);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.mouse.click(1435, 995);
  assert.equal(await page.locator('[data-umbra-pinned], [data-umbra-detail]').count(), 0);
  checks.push('Responsive bounds and outside-click cleanup include every level');

  await page.evaluate(() => audit.open('resilience'));
  await link(root, 'hindranceResistance').click();
  await page.evaluate(() => audit.mode('Level up'));
  await page.waitForFunction(() => !document.querySelector('[data-umbra-pinned], [data-umbra-detail]'));
  checks.push('Leaving the Codex section closes the complete helper chain');
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'checks.json'), JSON.stringify(checks, null, 2));
  console.log('PASS:\n' + checks.join('\n'));
} finally { await browser.close(); await new Promise(done => server.close(done)); }
