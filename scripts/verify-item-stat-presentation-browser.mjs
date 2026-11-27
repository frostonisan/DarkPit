import { dismissStarterForFixture } from './browser-test-fixture.mjs';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = resolve('docs');
const output = resolve('outputs/item-stat-presentation');
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
let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await dismissStarterForFixture(page);
  const report = await page.evaluate(async () => {
    const M = await import('/js/items/itemManager.js');
    const { ItemDetails } = await import('/js/data/itemList.js');
    const { setAdminMode } = await import("/js/storage/gameStorage.js");
    const H = await import('/js/data/helpers.js');
    const { stats } = await import('/js/data/statsData.js');
    const E = await import("/js/entities/runtime.js");
    const D = await import("/js/ui/statistics/details.js");
    const U = await import("/js/entities/progression.js");
    setAdminMode(true);
    document.body.innerHTML = '<div class="Game-helper"></div><div id="anchor"></div><div id="equipment-anchor"></div>';
    document.body.style.background = '#101214';
    const anchor = document.getElementById('anchor');
    anchor.style.cssText = 'position:fixed;left:30px;top:300px;width:24px;height:24px';
    const equipmentAnchor = document.getElementById('equipment-anchor');
    equipmentAnchor.style.cssText = 'position:fixed;left:440px;top:300px;width:24px;height:24px';
    const checks = [];
    const check = (condition, message) => { if (!condition) throw Error(message); checks.push(message); };
    const textOf = html => {
      const template = document.createElement('template'); template.innerHTML = html;
      return template.content.textContent.trim();
    };
    const descriptions = Object.fromEntries(Object.entries(H.STAT_HELPER_DESCRIPTIONS).map(([key, html]) => [key, textOf(html)]));
    const umbras = stats.filter(stat => stat.nature === 'umbra');
    check(umbras.length === 27, 'All 27 Umbra introductions covered');
    for (const { key, description } of umbras) {
      check(description === H.STAT_HELPER_DESCRIPTIONS[key], `${key}: identity references the shared description`);
      const entity = { id: 971899, name: 'Introduction audit', type: 'sbire', side: 'A', awakening: 1,
        level: { current: 30, max: 250 }, stuff: {},
        baseStats: { HP: 100, strength: 20, agility: 30, intelligence: 40, [key]: 15 } };
      E.recomputeEntityStats(entity, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
      const before = JSON.stringify(entity.stats);
      for (const preview of [false, true]) {
        if (preview) {
          entity.modifierStats.preview = { statLeveled: { [key]: 5 } };
          U.ComputeStatPreview(entity);
        }
        const calculated = D.calculateStatsDisplay(key, entity);
        // Generated introductions include live points and fixed grants.
        const content = document.createElement('div'); content.innerHTML = calculated.helpContent;
        check(content.querySelector('.short-descri')?.dataset.statDescription === key && content.querySelector('.short-descri').textContent.startsWith('Confère'), `${key}/${preview}: shared introduction precedes the calculations`);
        check(content.querySelectorAll('.short-descri').length === 1, `${key}/${preview}: exactly one introduction wrapper`);
        check(content.querySelector('[data-umbra-calculation]'), `${key}/${preview}: detailed calculation preserved`);
        check(!textOf(description).includes('X HP'), `${key}: no unresolved value in the introduction`);
        check(JSON.stringify(entity.stats) === before, `${key}/${preview}: presentation does not mutate committed stats`);
      }
    }
    const show = (serial, element = anchor, overrides = {}) => {
      const item = { ...structuredClone(ItemDetails.find(entry => entry.serial === serial)), ...overrides };
      const before = JSON.stringify(item);
      const card = M.createItemDescription(item, `${serial}-${element.id}`, element, { persistent: true });
      for (const row of card.querySelectorAll('.stuff-stat-row')) {
        const content = document.createElement('div'); content.innerHTML = row.dataset.helperText;
        const introduction = content.querySelector('[data-stat-description]');
        if (!introduction) continue;
        check(introduction.classList.contains('short-descri') && content.querySelectorAll('.short-descri').length === 1, `${serial}/${row.dataset.stat}: item has a single introduction wrapper`);
        check(introduction.textContent.trim() === descriptions[introduction.dataset.statDescription] || introduction.textContent.startsWith('Confère') && introduction.querySelector('.helper-figure'), `${serial}/${row.dataset.stat}: item uses the shared description`);
        check(!content.querySelector('.helper-calculation, [data-helper-source]'), `${serial}/${row.dataset.stat}: item sub-helper stays descriptive`);
      }
      if (item.itemType.includes('consumable')) check(JSON.stringify(item) === before, `${serial}: presentation does not mutate consumable data`);
      return card;
    };
    const rows = card => [...card.querySelectorAll('.stuff-stat-row')].map(row => ({
      stat: row.dataset.stat,
      label: row.querySelector('.stat-name').textContent,
      value: row.querySelector('.entite-stat').textContent.trim(),
    }));
    const expectedFields = {
      itemMovement: [['MovementAmount', 'shift', 'Deplacements']],
      itemHeal: [['HealAmount', 'healing', 'Soins']],
      itemRez: [['HealAmount', 'healing', 'Restitution']],
      itemFadedLife: [['FadedLifeAmount', 'fadedLife', 'Vies']],
      itemExtraLife: [['ExtraLifeAmount', 'fadedLife', 'Vies']],
      itemEternalLife: [['EternalLifeAmount', 'fadedLife', 'Vies']],
      itemDamage: [['physicalDamage', 'physicalDamage'], ['MagicDamage', 'magicalDamage'], ['hybridalDamage', 'hybridalDamage'], ['piercingDamage', 'piercingDamage']],
    };
    for (const item of ItemDetails.filter(item => item.itemType.includes('consumable'))) {
      const card = show(item.serial);
      const expected = item.effets.flatMap(effect => (expectedFields[effect] || [])
        .filter(([field]) => Number(item[field]) > 0)
        .map(([field, stat]) => ({ stat, value: `${effect === 'itemDamage' ? '' : '+'}${item[field]}` })));
      const actual = rows(card);
      check(actual.length === expected.length, `${item.serial}: exactly one row per active contribution`);
      expected.forEach((entry, index) => {
        check(actual[index].stat === entry.stat && actual[index].value === entry.value, `${item.serial}: correct stat and amount ${entry.stat}`);
        const row = card.querySelectorAll('.stuff-stat-row')[index];
        check(row.querySelector(`.stat-line > .picto-stat.${entry.stat}`), `${item.serial}: shared stat pictogram`);
        check(actual[index].label.length > 0 && !actual[index].label.includes(':'), `${item.serial}: separate stat name`);
      });
      if (expected.length) check(!card.querySelector('.effect-description'), `${item.serial}: no duplicated inline calculation`);
      if (item.effets.includes('itemRez')) check(card.textContent.includes('Ressuscite'), 'Resurrection keeps its effect explanation');
      if (item.effets.some(effect => ['itemExtraLife', 'itemEternalLife'].includes(effect))) {
        check(card.textContent.includes('devient une vie fanée'), `${item.serial}: life conversion remains explained`);
      }
      if (item.effets.includes('itemResetProgression')) check(card.querySelector('.effect-description')?.textContent.includes('Purifie'), 'Non-stat purification description is preserved');
      if (item.effets.includes('itemPoison')) check(card.querySelector('.unknown-effect'), 'Unknown effect fallback is preserved');
      card.remove();
    }
    const mixed = show('i53', anchor, { effets: ['itemMovement', 'itemHeal', 'itemDamage', 'itemFadedLife'], HealAmount: 7, MagicDamage: 4, FadedLifeAmount: 2 });
    check(JSON.stringify(rows(mixed).map(({ stat, value }) => [stat, value])) === JSON.stringify([
      ['shift', '+5'], ['healing', '+7'], ['magicalDamage', '4'], ['fadedLife', '+2'],
    ]), 'Mixed effects each keep their own stat and amount');
    mixed.remove();
    const movement = show('i53');
    const equipment = show('i55', equipmentAnchor);
    check(rows(movement)[0].label === 'Déplacements sup.', 'Consumable distinguishes additional movement');
    check(rows(equipment)[0].label === 'Déplacements max' && rows(equipment)[0].value === '+3', 'Equipment maximum remains unchanged');
    const styles = (card, selector, properties) => {
      const style = getComputedStyle(card.querySelector(selector));
      return properties.map(property => style[property]);
    };
    for (const [selector, properties] of [
      ['.stat-line', ['display', 'gap', 'alignItems']],
      ['.stat-line > .picto-stat', ['width', 'height', 'backgroundImage', 'backgroundSize']],
      ['.stat-name', ['fontSize', 'color', 'lineHeight']],
      ['.stuff-stat-effective', ['fontSize', 'color', 'fontWeight']],
    ]) check(JSON.stringify(styles(movement, selector, properties)) === JSON.stringify(styles(equipment, selector, properties)), `Shared computed styles: ${selector}`);
    check(getComputedStyle(movement.querySelector('.item-stats-block'), '::before').backgroundImage
      === getComputedStyle(equipment.querySelector('.item-stats-block'), '::before').backgroundImage, 'Shared header and body separator');
    window.__itemAudit = { show, rows, anchor, equipmentAnchor, manager: M };
    return { checks, count: checks.length, descriptions };
  });
  await page.screenshot({ path: resolve(output, 'desktop.png') });
  report.viewports = [];
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const serial of ['i53', 'i8', 'i5', 'i59', 'i57']) {
      const layout = await page.evaluate(({ serial }) => {
        document.querySelector('.Game-helper').replaceChildren();
        const { show, anchor } = window.__itemAudit;
        anchor.style.left = `${innerWidth - 30}px`;
        anchor.style.top = `${innerHeight - 30}px`;
        const card = show(serial);
        const rect = card.getBoundingClientRect();
        return { serial, inside: rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
          noOverflow: card.scrollWidth <= card.clientWidth + 1,
          ordered: [...card.querySelectorAll('.stat-line')].every(line => {
            const picto = line.querySelector('.picto-stat').getBoundingClientRect();
            const name = line.querySelector('.stat-name').getBoundingClientRect();
            const value = line.querySelector('.entite-stat').getBoundingClientRect();
            return picto.right <= name.left + 1 && name.right <= value.left + 1;
          }) };
      }, { serial });
      assert.equal(layout.inside, true, `${viewport.width}/${serial}: tooltip stays within viewport`);
      assert.equal(layout.noOverflow, true, `${viewport.width}/${serial}: no horizontal overflow`);
      assert.equal(layout.ordered, true, `${viewport.width}/${serial}: icon, label and value do not overlap`);
      report.viewports.push({ width: viewport.width, ...layout });
      if (viewport.width === 390 && serial === 'i8') await page.screenshot({ path: resolve(output, 'mobile-damage.png') });
    }
  }
  report.contributionHelpers = [];
  const buff = (stat, value) => ({ type: 'stat-buff', stat, value });
  const cases = [
    { serial: 'i57', stat: 'shift', row: 0, text: 'Donne +2 déplacements maximum à l\'entité.' },
    { serial: 'i57', stat: 'shift', row: 1, text: 'Donne +1 charge de déplacement supplémentaire à l\'entité.' },
    { serial: 'i56', stat: 'shift', overrides: { resourceStocks: { shift: { current: 2, max: 5 } } }, text: 'Donne +2 charges de déplacement supplémentaires à l\'entité.' },
    { serial: 'i56', stat: 'shift', overrides: { resourceStocks: { shift: { current: 0, max: 5 } } }, text: 'Donne 0 charges de déplacement supplémentaires à l\'entité.' },
    { serial: 'i55', stat: 'shift', overrides: { Stuffeffets: [buff('shift', { max: -5 })] }, text: 'Donne -5 déplacements maximum à l\'entité.' },
    { serial: 'i53', stat: 'shift', text: 'Donne +5 charges de déplacement supplémentaires à l\'entité.' },
    { serial: 'i59', stat: 'fadedLife', text: 'Donne +3 vies fanées à l\'entité.' },
    { serial: 'i60', stat: 'fadedLife', overrides: { resourceStocks: { fadedLife: { current: 1, max: 3 } } }, text: 'Donne +1 vie fanée à l\'entité.' },
    { serial: 'i61', stat: 'extraLife', text: 'Recharge : 3 j.\nDisponible.' },
    { serial: 'i64', stat: 'eternalLife', text: 'Recharge : 1 j.\nDisponible.' },
    { serial: 'i67', stat: 'fadedLife', text: 'Donne +1 vie fanée à l\'entité.' },
    { serial: 'i68', stat: 'fadedLife', text: 'Donne +1 vie fanée à l\'entité.' },
    { serial: 'i55', stat: 'armor', overrides: { Stuffeffets: [buff('armor', 10)], armorReserve: { current: 4, max: 10 } }, text: 'Donne +4 points d\'armure à l\'entité.' },
    { serial: 'i55', stat: 'magicalPenPlus', visual: 'magicalPen', overrides: { Stuffeffets: [buff('magicalPenPlus', 3)] }, text: '', state: '+' },
    { serial: 'i55', stat: 'magicalPen', overrides: { Stuffeffets: [buff('magicalPen', 3)] }, text: '' },
    { serial: 'i55', stat: 'bloodFury', overrides: { Stuffeffets: [buff('bloodFury', 4)] }, text: '', state: 'umbra' },
    { serial: 'i55', stat: 'mysticism', overrides: { Stuffeffets: [buff('mysticism', 6)] }, text: '', state: 'umbra' },
    { serial: 'i55', stat: 'adresse', overrides: { Stuffeffets: [buff('adresse', 6)] }, text: '', state: 'umbra' },
    { serial: 'i55', stat: 'criticalChancePlus', visual: 'criticalChance', overrides: { Stuffeffets: [buff('criticalChancePlus', 2)] }, text: '', state: '+' },
  ];
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const entry of cases) {
      await page.evaluate(({ serial, overrides }) => {
        const { manager, show, anchor } = window.__itemAudit;
        manager.clearItemDescriptions();
        document.querySelectorAll('.stat-hover').forEach(node => node.remove());
        anchor.style.left = `${innerWidth - 30}px`;
        anchor.style.top = `${innerHeight - 30}px`;
        show(serial, anchor, overrides);
      }, entry);
      const row = page.locator(`.item-description-card .stuff-stat-row[data-stat="${entry.stat}"]`).nth(entry.row || 0);
      await row.locator('.stat-name').hover();
      const helper = page.locator(`.stat-hover[data-stat="${entry.stat}"]`);
      await helper.waitFor({ state: 'visible' });
      const normalize = value => value.replace(/\s+/g, ' ').trim();
      const descriptionKey=await helper.locator('[data-stat-description]').getAttribute('data-stat-description');
      const summary=await row.evaluate((node, fallback)=>{const box=document.createElement('div');box.innerHTML=node.dataset.helperText;const intro=box.querySelector('.short-descri');return intro?.textContent.startsWith('Confère')?intro.textContent:fallback;},report.descriptions[descriptionKey]);
      assert.equal(normalize(await helper.locator('[data-stat-description]').innerText()), normalize(summary));
      assert.equal(normalize(await helper.locator('.stat-hover-body').evaluate(node=>{const clone=node.cloneNode(true);clone.querySelectorAll('[data-improvement-kind]').forEach(n=>n.remove());clone.querySelectorAll('br').forEach(n=>n.replaceWith(' '));return clone.textContent;})), normalize(`${summary} ${entry.text}`));
      assert.ok(await helper.locator('.picto-stat').count() > 0, 'Short description keeps its stat pictograms');
      const figure = helper.locator('.helper-figure:not(.short-descri *)');
      assert.equal(await figure.count(), entry.text ? 1 : 0, 'No repeated amount in a descriptive stat summary');
      if (entry.text) {
        assert.equal(await figure.locator(`.picto-stat.${entry.visual || entry.stat}`).count(), 1);
        assert.equal(await figure.locator('[data-stat-state]').getAttribute('data-stat-state'), entry.state || 'normal');
      }
      assert.equal(await helper.locator('.stat-source-details, .helper-calculation').count(), 0);
      const rect = await helper.boundingBox();
      assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= width + 1 && rect.y + rect.height <= 901, 'Contribution helper stays in viewport');
      report.contributionHelpers.push({ width, text: entry.text });
      if ((entry.serial === 'i57' && entry.row === 1) || ['mysticism', 'eternalLife'].includes(entry.stat)) {
        await page.waitForFunction(() => [...document.querySelectorAll('.stat-hover')].every(node => Number(getComputedStyle(node).opacity) > .99));
        await page.screenshot({ path: resolve(output, `contribution-helper-${entry.stat}-${width}.png`) });
      }
    }
  }
  // Same-stat rows and different pinned items must never reuse the previous contribution.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => {
    const { manager, show, anchor, equipmentAnchor } = window.__itemAudit;
    manager.clearItemDescriptions();
    document.querySelectorAll('.stat-hover').forEach(node => node.remove());
    anchor.style.cssText = 'position:fixed;left:30px;top:300px;width:24px;height:24px';
    show('i57'); show('i56', equipmentAnchor);
  });
  for (const [index, text] of [[0, '+2 déplacements maximum'], [1, '+1 charge de déplacement supplémentaire'], [2, '+5 charges de déplacement supplémentaires'], [0, '+2 déplacements maximum']]) {
    await page.locator('.stuff-stat-row[data-stat="shift"] .stat-name').nth(index).hover();
    assert.ok((await page.locator('.stat-hover[data-stat="shift"] .stat-hover-body').innerText()).includes(text));
  }
  await page.evaluate(async () => {
    const E = await import("/js/entities/runtime.js");
    const S = await import("/js/storage/gameStorage.js");
    const P = await import("/js/entities/progression.js");
    const { ItemDetails } = await import('/js/data/itemList.js');
    const { manager, anchor } = window.__itemAudit;
    manager.clearItemDescriptions();
    document.querySelectorAll('.stat-hover').forEach(node => node.remove());
    const entity = structuredClone(E.entitesNestUp[0]);
    Object.assign(entity, { id: 971891, side: 'A', awakening: 1, level: { current: 1, max: 250 },
      baseStats: { HP: 100, shift: 10, agility: 17, charge: 5, weaponOrfevre: 20 }, stats: {}, modifierStats: {}, stuff: {}, resourceStocks: {} });
    const item = { ...structuredClone(ItemDetails.find(item => item.serial === 'i57')),
      itemId: 'item-contribution-audit', equippedId: 'equipment-contribution-audit', equippedTo: entity.id,
      Stuffeffets: [{ type: 'stat-buff', stat: 'shift', value: { current: 5, max: 3 } }] };
    entity.stuff.slot1 = [item.equippedId];
    E.recomputeEntityStats(entity, { equippedItems: [item], persistEquipment: false, skipReverseArchetype: true });
    entity.modifierStats.preview = { statLeveled: { weaponOrfevre: 80 } };
    P.ComputeStatPreview(entity);
    window.selectedArmyA = [entity];
    S.saveToLocalStorage('selectedArmyA', [entity]); S.saveToLocalStorage('equippedItems', [item]);
    manager.pinItemDescription(item, item.equippedId, anchor);
  });
  for (const [selector, amount, description] of [
    ['.stuff-stat-row:not(.stuff-stat-resource-reserve)', 4, 'déplacements maximum'],
    ['.stuff-stat-resource-reserve', 6, 'charges de déplacement supplémentaires'],
  ]) {
    const row = page.locator(`.item-description-card ${selector}[data-stat="shift"]`);
    await row.locator('.entite-stat').hover();
    const body = await page.locator('.stat-hover[data-stat="shift"] .stat-hover-body').innerText();
    assert.ok(body.includes(report.descriptions.shift));
    assert.ok(body.trim().endsWith(`Donne +${amount} ${description} à l'entité.`));
    const detail = row.locator('[data-orfevre-detail]');
    const payload = JSON.parse(await detail.getAttribute('data-orfevre-detail'));
    assert.equal(payload.total, amount);
    assert.ok(payload.previewDetail.total > payload.total, 'Level-up preview remains separate from actual contribution');
    await detail.hover();
    const helper = page.locator('.stat-hover[data-stat="orfevre-detail"]');
    await helper.waitFor({ state: 'visible' });
    assert.ok(!(await helper.innerText()).startsWith('Donne'), 'Efficiency detail keeps its own helper');
    assert.ok((await helper.innerText()).includes('Aperçu'), 'Efficiency detail keeps its preview');
    assert.equal((await helper.locator('.helper-calculation-detail .helper-figure[data-helper-stat="weaponOrfevre"]').first().innerText()).trim(), String(payload.exactBonus));
  }
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ count: report.count, layouts: report.viewports.length, contributionHelpers: report.contributionHelpers.length, errors }));
} finally {
  await browser?.close();
  await new Promise(done => server.close(done));
}
