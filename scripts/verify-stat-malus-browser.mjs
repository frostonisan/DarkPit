import assert from 'node:assert/strict';
import { dismissStarterForFixture } from './browser-test-fixture.mjs';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = resolve('docs');
const output = resolve('outputs/stat-malus');
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  const path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  const rel = relative(root, path);
  if (rel === '..' || rel.startsWith('..' + sep)) return res.writeHead(403).end();
  try {
    const file = path === root ? resolve(root, 'index.html') : path;
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true });
const checks = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await dismissStarterForFixture(page);
  checks.push(...await page.evaluate(async () => {
    const E = await import("/js/entities/runtime.js");
    const D = await Promise.all([import("/js/combat/statistics.js"), import("/js/board/deployment.js"), import("/js/rendering/hud.js"), import("/js/ui/statistics/details.js"), import("/js/rendering/damageFeedback.js"), import("/js/combat/damageRules.js")]).then(parts => Object.defineProperties({}, Object.fromEntries(parts.flatMap(part => Object.keys(part).map(key => [key, { enumerable: true, get: () => part[key] }])))));
    const S = await import("/js/entities/statSystem.js");
    const H = await import('/js/data/helpers.js');
    const U = await Promise.all([import("/js/entities/progression.js"), import("/js/rendering/vitalFeedback.js"), import("/js/ui/codex/stats.js"), import("/js/ui/statistics/components.js")]).then(parts => Object.defineProperties({}, Object.fromEntries(parts.flatMap(part => Object.keys(part).map(key => [key, { enumerable: true, get: () => part[key] }])))));
    const passed = [];
    const check = (ok, label) => { if (!ok) throw new Error(label); passed.push(label); };
    for (const [key, origin] of Object.entries(S.STAT_SYSTEM_ORIGINS)) for (const points of [10, 500]) {
      const sample = { id: 987161, type: 'sbire', awakening: 1, level: 1,
        baseStats: { HP: 100, strength: 20, agility: 20, intelligence: 20, [origin]: 10, [key]: points, [`${key}Plus`]: points } };
      E.recomputeEntityStats(sample, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
      const before = S.getStatSystemResult(sample, key).value;
      const sourcesBefore = JSON.stringify(S.getStatSystemSourceTotals(sample, key));
      sample.baseStatSources = { crystal: { [key]: 3, [`${key}Plus`]: 2, [origin]: 2 } };
      const totals = S.getStatSystemSourceTotals(sample, key);
      check(Math.abs(totals.reduce((sum, source) => sum + source.value, 0) - before) < .00001
        && S.getStatSystemResult(sample, key).value === before, `${key}/${points}: absorbed crystal gains preserve total, shared ratios and cap`);
      check(JSON.stringify(totals.map(({category,value}) => ({category,value}))) === JSON.stringify(JSON.parse(sourcesBefore).map(({category,value}) => ({category,value}))) && !totals.some(source => source.category === 'crystal'),
        `${key}/${points}: crystal gains display exactly like owned normal, plus and Umbra points`);
    }
    const entity = { id: 987160, name: 'Malus audit', type: 'sbire', side: 'A', awakening: 1,
      level: { current: 30, max: 100 }, attacks: ['autoAttack'], stuff: {},
      baseStats: { HP: 100, physicalDamage: 35, strength: 10, agility: 10, intelligence: 10, speed: 2000, charge: 4 } };
    const recompute = () => E.recomputeEntityStats(entity, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
    recompute();
    entity.baseStats.strength += 3;
    entity.baseStatSources = { crystal: { strength: 3 } };
    recompute();
    const attributeSources = D.getStatisticSourceTotals(entity, 'strength', D.calculateStatsDisplay('strength', entity));
    check(attributeSources.length === 1 && attributeSources[0].category === 'fixed'
      && attributeSources[0].value === 13 && attributeSources[0].provenance.some(source => source.provenance === 'crystal'),
    'attribute total keeps its 13 owned points with crystal provenance');
    const attributeHTML = document.createElement('div');
    attributeHTML.innerHTML = H.buildStatisticOrigins({ compact: true, totals: [],
      modifiers: D.getStatContributions(entity, 'strength'), statName: 'Force' });
    const attributeDetail = attributeHTML.querySelector('template').content;
    check(attributeDetail.querySelectorAll('[data-stat-state="attribute"]').length === 4
      && /Base :\s*Force\s*\+ 10/.test(attributeDetail.textContent) && /Cristaux :\s*Force\s*\+ 3/.test(attributeDetail.textContent) && attributeDetail.textContent.includes('Bonus exceptionnel'),
      'owned attribute points retain color, icon, total and exceptional source quality');
    delete entity.baseStatSources;
    entity.baseStats.strength -= 3;
    recompute();
    const timingEntity = { ...entity, baseStats: { HP: 100, intelligence: 20, haste: 5, attackCooldownReduc: 3, attackCooldownReducPlus: 2 },
      baseStatSources: { crystal: { haste: 2, attackCooldownReduc: 3, attackCooldownReducPlus: 2 } }, modifierStats: undefined };
    E.recomputeEntityStats(timingEntity, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
    const timing = D.calculateStatsDisplay('cooldownTimeDetail', timingEntity, { baseMs: 1000 }).helperDetails.timing;
    check(Math.abs(timing.sources.filter(source => !source.duration).reduce((sum, source) => sum + source.value, 0) - timing.bonus) < .00001,
      'timing source totals include crystal gains exactly once');
    check(timing.sources.some(source => source.category === 'umbra')
      && timing.sources.some(source => source.category === 'fixed' && !source.duration)
      && !timing.sources.some(source => source.category === 'crystal'), 'timing totals retain Umbra and fixed categories while provenance identifies crystals');
    entity.modifierStats.durable.statLeveled.physicalDamage = -30;
    recompute();
    check(S.getStatSystemResult(entity, 'physicalDamage').value === 5, '35 - 30 = 5 unchanged');
    check(E.getStatMalusSources(entity, 'physicalDamage')[0].value === -30, 'negative progression is exposed');
    const render = key => {
      const doc = document.createElement('div');
      const calculated = D.calculateStatsDisplay(key, entity);
      const modifiers = D.getStatContributions(entity, key, { includePreview: true, includePlus: true });
      doc.innerHTML = H.buildStatisticOrigins({ compact: true, totals: D.getStatisticSourceTotals(entity, key, calculated), modifiers });
      return doc;
    };
    let doc = render('physicalDamage');
    check(doc.querySelector('[data-helper-source="malus"]')?.firstChild.textContent === '− Malus', 'footer announces Malus without an amount');
    check(!doc.querySelector('[data-helper-source="stat"]'), 'negative-only progression is listed under Malus');
    check(doc.querySelector('[data-helper-source="malus"] template').content.querySelector('.stat-malus-value')?.textContent.includes('-30'), 'penalty detail is red');
    entity.modifierStats.durable.level.physicalDamage = 30;
    recompute();
    doc = render('physicalDamage');
    const mixed = doc.querySelector('[data-helper-source="fixed"] template').content;
    const malus = doc.querySelector('[data-helper-source="malus"] template').content;
    check([...mixed.querySelectorAll('.helper-calculation-detail .helper-figure')].some(node => Number(node.textContent) === 30), 'net-zero normal PP retains the positive input in its own calculation');
    check(malus.querySelectorAll('.stat-modifier-malus').length === 1, 'penalty appears once in Malus');
    check(mixed.textContent.includes('30') && malus.textContent.includes('-30'), 'opposite inputs remain signed in their own details');
    delete entity.modifierStats.durable.level.physicalDamage;
    entity.battleBoosts = {
      physicalDamage: [{ id: 'slow', source: 'Test percent', value: -10, mode: 'percent' }],
      speed: [{ id: 'slower', source: 'Slower turn', value: 250, mode: 'flat' }, { id: 'faster', source: 'Faster turn', value: -50, mode: 'flat' }],
      weight: [{ id: 'heavier', value: 5, mode: 'flat' }],
    };
    recompute();
    const label = H.buildStatCurseHelper(E.getStatMalusSources(entity, 'physicalDamage'), { compact: true });
    check(label.includes('-30') && label.includes('-10 % relatif') && !label.includes('-40'), 'flat and relative percentage never merged');
    check(E.getStatMalusSources(entity, 'speed').length === 1 && E.getStatMalusSources(entity, 'speed')[0].value === 250, 'slower turn positive malus, negative bonus');
    check(E.getStatMalusSources(entity, 'weight')[0].value === 5, 'positive weight penalty');
    check(H.buildStatCurseHelper(E.getStatMalusSources(entity, 'speed'), { compact: true }) === '+250 ms', 'turn penalty has explicit unit');
    delete entity.battleBoosts;
    recompute();
    entity.modifierStats.preview = { statLeveled: { physicalDamage: -2 } };
    U.ComputeStatPreview(entity);
    const before = JSON.stringify(entity);
    check(E.getStatMalusSources(entity, 'physicalDamage').reduce((s, p) => s + p.value, 0) === -32, 'preview includes new penalty');
    render('physicalDamage');
    check(JSON.stringify(entity) === before, 'reading sources leaves all entity data unchanged');
    entity.modifierStats.preview = { statLeveled: {} };
    entity.modifierStats.durable.statLeveled.physicalDamagePlus = -1;
    check(E.getStatMalusSources(entity, 'physicalDamage').some(s => s.state === '+' && s.value === -1), 'plus-family penalty remains identifiable');
    delete entity.modifierStats.durable.statLeveled.physicalDamagePlus;
    const rawById = { penalty: { physicalDamage: -30, speed: 100 }, bonus: { physicalDamage: 10 } };
    const effective = E.buildWeaponOrfevreStuffModifiersById(rawById, 50);
    entity.modifierStats.durable.stuff = { byId: rawById, orfevre: {
      effectiveById: effective.byId, byId: effective.detailsById, activePercent: 50,
      source: { weaponOrfevre: 50, strength: 0, weaponMastery: 0, weaponOrfevrePlus: 0 },
    } };
    check(E.getStatMalusSources(entity, 'physicalDamage').find(s => s.equipment).value === -15, 'equipment penalty uses effective value, not raw -30');
    entity.modifierStats.preview.statLeveled.weaponOrfevre = 50;
    check(!E.getStatMalusSources(entity, 'physicalDamage').some(s => s.equipment), 'preview neutralized equipment penalty disappears');
    entity.modifierStats.preview.statLeveled.weaponOrfevre = -50;
    check(E.getStatMalusSources(entity, 'physicalDamage').find(s => s.equipment).value === -30, 'zero efficiency preview restores raw penalty');
    entity.modifierStats.preview.statLeveled = {};
    check(E.getStatMalusSources(entity, 'physicalDamage').find(s => s.equipment).value === -15, 'preview cancellation restores current penalty');
    delete entity.modifierStats.durable.stuff;
    recompute();
    const G = await import("/js/storage/gameStorage.js");
    const { ItemDetails } = await import('/js/data/itemList.js');
    const gearActor = { id: 987163, type: 'sbire', side: 'A', awakening: 1, level: 1,
      baseStats: { HP: 100, physicalDamage: 35, physicalDamagePlus: 2, strength: 10, charge: 4, weaponOrfevre: 0 },
      stuff: { slot1: ['ei-source-good'], slot2: ['ei-source-bad'] } };
    const makeGear = (id, displayName, effects) => ({ ...structuredClone(ItemDetails.find(item => item.functionName === 'DevMovementMixed')),
      itemId: `i-source-${id}`, equippedId: `ei-source-${id}`, equippedTo: gearActor.id, slot: `slot${id === 'good' ? 1 : 2}-${gearActor.id}`,
      displayName, Stuffeffets: Object.entries(effects).map(([stat, value]) => ({ type: 'stat-buff', stat, value })) });
    const goodItem = makeGear('good', 'Anneau des trois voies', { vigueur: 3, physicalDamage: 4, physicalDamagePlus: 2 });
    const badItem = makeGear('bad', 'Anneau de la dette', { physicalDamage: -3, physicalDamagePlus: -1 });
    G.saveToLocalStorage('equippedItems', [goodItem, badItem]);
    E.recomputeEntityStats(gearActor, { equippedItems: [goodItem, badItem], persistEquipment: false, skipReverseArchetype: true });
    for (const efficiency of [0, 50]) {
      gearActor.modifierStats.preview = { statLeveled: efficiency ? { weaponOrfevre: efficiency } : {} };
      U.ComputeStatPreview(gearActor);
      const before = JSON.stringify(gearActor);
      const totals = S.getStatSystemSourceTotals(gearActor, 'physicalDamage');
      const modifiers = D.getStatContributions(gearActor, 'physicalDamage', { includePlus: true, includePreview: true });
      const card = document.createElement('div');
      card.innerHTML = H.buildStatisticOrigins({ compact: true, totals, modifiers, statName: 'Puissance physique' });
      check(!card.querySelector('[data-helper-source="equipment"]'), `${efficiency}: Stuff is not a separate stat family`);
      const umbra = card.querySelector('[data-helper-source="umbra"] template').content;
      check(umbra.querySelector('[data-provenance="equipment"]')?.textContent.includes('Stuff · Anneau des trois voies'), `${efficiency}: Umbra contribution names its equipment`);
      const fixed = card.querySelector('[data-helper-source="fixed"] template').content;
      const plus = card.querySelector('[data-helper-source="plus"] template').content;
      check(fixed.querySelectorAll('[data-provenance="equipment"]').length === 1 && plus.querySelectorAll('[data-provenance="equipment"]').length === 1, `${efficiency}: normal and plus equipment stay in their own branches`);
      const malus = card.querySelector('[data-helper-source="malus"] template').content;
      check(malus.querySelectorAll('.stat-modifier-malus').length === modifiers.filter(source => source.malus).length
        && [...malus.querySelectorAll('.stat-modifier-source')].every(node => node.textContent.includes('Stuff · Anneau de la dette')),
      `${efficiency}: one malus per effective normal/plus input with the item name`);
      check(Math.abs(totals.reduce((sum, total) => sum + total.value, 0) - S.getStatSystemResult(gearActor, 'physicalDamage').value) < .00001,
        `${efficiency}: equipment provenance never adds a contribution twice`);
      check(JSON.stringify(gearActor) === before, `${efficiency}: rendering is read-only`);
    }
    G.saveToLocalStorage('equippedItems', []);
    window.__malusAudit = { entity, E, D, S, U, G, goodItem, items: [] };
    return passed;
  }));
  const setup = async view => page.evaluate(async view => {
    const UI = await import("/js/ui/statistics/helpers.js"), _UI = await import("/js/ui/codex/index.js");
    const { entity, U, items } = window.__malusAudit;
    UI.closeOpenHelpers();
    document.getElementById('malus-audit')?.remove();
    entity.baseStats.vigueur = view === 'Level up' ? 10 : 0;
    entity.modifierStats.durable.statLeveled.vigueur = view === 'Level up' ? -3 : 0;
    window.__malusAudit.E.recomputeEntityStats(entity, { equippedItems: items, persistEquipment: false, skipReverseArchetype: true });
    U.ComputeStatPreview(entity);
    localStorage.setItem('selectedArmyA', JSON.stringify([entity]));
    U.setPlayerExperience(1000000);
    const host = document.createElement('main');
    host.id = 'malus-audit';
    host.style.cssText = 'position:fixed;inset:0;overflow:auto;background:#240000;z-index:1';
    document.body.append(host);
    _UI.createCodexEntityScan(entity, host, `codex-entity_${entity.id}`);
    host.querySelector(`.codex-inner-menu:has(.codex-${view === 'Stats' ? 'stat' : 'soul'})`).click();
    if (view === 'Stats') host.querySelector('.section-content.stats [data-mode="stat"]').click();
    const active = view === 'Stats' ? entity : UI.helperEntityByRoot.get(host.querySelector('.level-up-section'));
    window.__malusAudit.active = active;
  }, view);
  for (const view of ['Stats', 'Level up']) {
    await setup(view);
    const scope = view === 'Stats' ? '.section-content.stats' : '.umbra-submenu';
    const key = view === 'Stats' ? 'physicalDamage' : 'vigueur';
    const penalty = view === 'Stats' ? -30 : -3;
    const row = page.locator(`#malus-audit ${scope} .stat-container[data-stat="${key}"]`).first();
    await row.waitFor({ state: 'visible' });
    const marker = row.locator('.stat-curse-marker');
    assert.equal(await marker.getAttribute('data-malus-label'), String(penalty), `${view}: accessible penalty amount`);
    assert.equal(await marker.evaluate(n => getComputedStyle(n, '::after').content), '"!"', `${view}: only ! is visible on the stat`);
    assert.equal(await row.locator('.stat-name').evaluate(n => getComputedStyle(n).color), 'rgb(255, 136, 152)');
    assert.match(await row.evaluate(n => getComputedStyle(n).backgroundImage), /150, 20, 35/, 'penalized row has a red background');
    assert.equal(await marker.evaluate(n => getComputedStyle(n, '::after').webkitTextFillColor), 'rgb(255, 136, 152)');
    assert.ok(await row.locator('.entite-stat:not(.preview)').count(), `${view}: current counter exists`);
    assert.equal(await row.locator('.entite-stat:not(.preview)').first().innerText(), view === 'Stats' ? '5' : '7');
    await row.click();
    const helper = page.locator('[data-umbra-pinned="true"]');
    await helper.waitFor({ state: 'visible' });
    assert.ok(!(await helper.locator('.stat-hover-header').innerText()).includes('-30'), 'badge never pollutes stat title');
    const source = helper.locator('[data-helper-source="malus"]');
    const detail = page.locator('[data-umbra-detail]');
    if (view === 'Stats') {
    assert.equal((await source.innerText()).trim(), '− Malus');
    assert.equal(await helper.locator('[data-helper-source="fixed"]').count(), 1, 'source includes actual base stat');
    if (view === 'Level up') assert.equal(await helper.locator('[data-helper-source="umbra"]').count(), 0, 'Umbra points are not a source of themselves');
    await source.hover();
    await detail.waitFor({ state: 'visible' });
    assert.match(await detail.innerText(), new RegExp(`Progression.*${penalty}`, 's'));
    assert.notEqual(await detail.locator('.stat-modifier-source').first().evaluate(n => getComputedStyle(n).backgroundColor), 'rgba(0, 0, 0, 0)');
    for (const value of await detail.locator('.stat-malus-value').all()) {
      assert.equal(await value.evaluate(n => getComputedStyle(n).color), 'rgb(255, 136, 152)');
    }
    } else {
      assert.equal(await source.count(), 0, 'Current Umbra card keeps its compact layout');
      assert.match(await helper.locator('.short-descri').innerText(), /Confère\s*\+7/);
    }
    await page.waitForFunction(() => [...document.querySelectorAll('[data-umbra-pinned], [data-umbra-detail]')].every(n => Number(getComputedStyle(n).opacity) >= .99));
    await page.screenshot({ path: resolve(output, `${view.replace(' ', '-')}.png`) });
    await page.evaluate(key => {
      const { active, U } = window.__malusAudit;
      active.modifierStats.preview = { statLeveled: { [key]: -2 } };
      U.refreshActiveStatPreview(active, document.getElementById('malus-audit'));
    }, key);
    await page.waitForFunction(({ scope, key, penalty }) => document.querySelector(`#malus-audit ${scope} [data-stat="${key}"] .stat-curse-marker`)?.dataset.malusLabel === String(penalty - 2), { scope, key, penalty });
    if (view === 'Stats') {
      await source.hover();
      assert.ok((await detail.innerText()).includes('-2'), 'open subhelper shows preview penalty');
    } else assert.match(await helper.locator('.short-descri').innerText(), /Confère\s*\+5/, 'Umbra amount includes the preview penalty');
    await page.evaluate(() => {
      const { active, U } = window.__malusAudit;
      active.modifierStats.preview.statLeveled = {};
      U.refreshActiveStatPreview(active, document.getElementById('malus-audit'));
    });
    await page.waitForFunction(({ scope, key, penalty }) => document.querySelector(`#malus-audit ${scope} [data-stat="${key}"] .stat-curse-marker`)?.dataset.malusLabel === String(penalty), { scope, key, penalty });
    checks.push(`${view}: total, badge, source, subhelper, live preview and cancellation`);
    await page.keyboard.press('Escape');
  }
  await setup('Stats');
  await page.evaluate(async () => {
    const { entity, E, U, G, goodItem } = window.__malusAudit;
    const P = await import('/js/items/permanentItems.js');
    const I = await import('/js/items/itemEffectMecanics.js');
    entity.baseStats.vigueur = 1;
    entity.baseStats.physicalDamagePlus = 2;
    const item = { ...structuredClone(goodItem), equippedTo: entity.id, slot: `slot1-${entity.id}` };
    window.__malusAudit.items = [item];
    entity.stuff = { slot1: [item.equippedId] };
    G.saveToLocalStorage('equippedItems', [item]);
    E.recomputeEntityStats(entity, { equippedItems: [item], persistEquipment: false, skipReverseArchetype: true });
    for (const [statKey, amount] of [['physicalDamage', 3], ['physicalDamagePlus', 1], ['vigueur', 2], ['strength', 3]]) {
      const crystal = P.createUmbraCrystal({ statKey, random: () => (amount - .5) / 3 });
      const result = await I.itemApplyEffect(entity, 'itemPermanentStat', crystal);
      if (!result.ok) throw new Error('Crystal fixture consumption failed');
    }
    U.refreshActiveStatPreview(entity, document.getElementById('malus-audit'));
    const row = document.querySelector('#malus-audit .section-content.stats [data-stat="physicalDamage"].stat-container');
    row.querySelector('.stat-name').dataset.baseLabel = 'Puissance Physique Ω :! Ω';
    row.querySelector('.stat-curse-marker').textContent = '!';
  });
  const mixedRow = page.locator('#malus-audit .section-content.stats [data-stat="physicalDamage"].stat-container').first();
  await mixedRow.click();
  const mixedHelper = page.locator('[data-umbra-pinned="true"]');
  await mixedHelper.waitFor({ state: 'visible' });
  assert.equal((await mixedHelper.locator('.stat-hover-header').innerText()).trim(), 'Statistique : Puissance Physique X');
  assert.deepEqual(await mixedHelper.locator('[data-helper-source]').evaluateAll(nodes => nodes.map(n => n.dataset.helperSource)), ['umbra', 'plus', 'fixed', 'malus']);
  for (const [category, states] of [['umbra', ['X']], ['plus', ['+']], ['fixed', ['normal']], ['malus', ['normal']]]) {
    await mixedHelper.locator(`[data-helper-source="${category}"]`).hover();
    const detail = page.locator('[data-umbra-detail]');
    await detail.waitFor({ state: 'visible' });
    const names = await detail.locator('.stat-source-details [data-stat-state]:not(.helper-figure *, .stat-source-provenance *)').allTextContents();
    assert.deepEqual(names.map(text => text.trim()), states.map(state => `${category === 'malus' ? 'Puissance physique' : 'Puissance Physique'}${state === 'normal' ? '' : ` ${state}`}`), `${category}: each source has only its own suffix`);
    assert.doesNotMatch(await detail.innerText(), /[!Ω◇◆]/, 'no main-row symbols in individual source names');
    const provenance = detail.locator('[data-provenance="crystal"]');
    const stuff = detail.locator('[data-provenance="equipment"]');
    assert.equal(await stuff.count(), category === 'malus' ? 0 : 1);
    for (const source of await stuff.all()) assert.match(await source.innerText(), /Stuff · Anneau des trois voies/);
    assert.equal(await provenance.count(), 0, `${category}: crystal is absorbed into the affected stat`);
    assert.doesNotMatch(await detail.innerText(), /crystal/i, `${category}: no separate Crystal mention`);
  }
  const mixedValues = await page.evaluate(async () => {
    const { entity, D, S, U } = window.__malusAudit;
    const UI = await import("/js/ui/statistics/components.js");
    const statsBefore = JSON.stringify(entity.stats);
    const row = document.querySelector('#malus-audit .section-content.stats [data-stat="physicalDamage"].stat-container');
    for (let i = 0; i < 3; i++) UI.syncStatCurseMarker(row, entity, 'physicalDamage');
    const totals = D.getStatisticSourceTotals(entity, 'physicalDamage', D.calculateStatsDisplay('physicalDamage', entity));
    return { label: row.querySelector('.stat-name').textContent, value: S.getStatSystemResult(entity, 'physicalDamage').value,
      sum: totals.reduce((sum, source) => sum + source.value, 0), unchanged: statsBefore === JSON.stringify(entity.stats),
      saved: JSON.parse(localStorage.getItem('selectedArmyA'))[0].baseStatSources,
      reset: U.previewEntityReset(entity).projection.baseStatSources };
  });
  assert.equal(mixedValues.label, 'Puissance Physique X :');
  assert.equal(mixedValues.value, mixedValues.sum, 'provenance never duplicates points or ratios');
  assert.ok(mixedValues.unchanged);
  assert.deepEqual(mixedValues.saved.crystal, { physicalDamage: 3, physicalDamagePlus: 1, vigueur: 2, strength: 3 });
  assert.deepEqual(mixedValues.reset, mixedValues.saved, 'purification retains crystal provenance');
  await mixedHelper.locator('[data-helper-source="umbra"]').hover();
  await page.waitForFunction(() => [...document.querySelectorAll('[data-umbra-pinned], [data-umbra-detail]')].every(n => Number(getComputedStyle(n).opacity) >= .99));
  await page.screenshot({ path: resolve(output, 'mixed-crystal-sources.png') });
  await mixedHelper.locator('[data-helper-source="fixed"]').hover();
  await page.waitForFunction(() => [...document.querySelectorAll('[data-umbra-pinned], [data-umbra-detail]')].every(n => Number(getComputedStyle(n).opacity) >= .99));
  await page.screenshot({ path: resolve(output, 'mixed-stuff-sources.png') });
  const compactResult = mixedHelper.locator('[data-autonomous-calculation]').first();
  await compactResult.focus();
  await page.evaluate(() => {
    const { entity, U } = window.__malusAudit;
    entity.modifierStats.preview = { statLeveled: { strength: 10, vigueur: -5 } };
    U.refreshActiveStatPreview(entity, document.getElementById('malus-audit'));
  });
  assert.equal(await page.locator('[data-umbra-detail]').count(), 1, 'Calculation subhelper survives a change in source detail');
  const previewTotal = await page.evaluate(() => {
    const { entity, S } = window.__malusAudit;
    return S.getStatSystemResult(entity, 'physicalDamage').value;
  });
  assert.equal(Number(await compactResult.innerText()), previewTotal, 'Pinned total follows both progressive curves during preview');
  await mixedHelper.locator('[data-helper-source="malus"]').hover();
  assert.equal(await page.locator('[data-umbra-detail] .stat-modifier-malus').count(), 2, 'Direct and Umbra penalties each appear once');
  await page.evaluate(() => {
    const { entity, U } = window.__malusAudit;
    entity.modifierStats.preview.statLeveled = {};
    U.refreshActiveStatPreview(entity, document.getElementById('malus-audit'));
  });
  checks.push('Pinned calculation and Malus details refresh without closing, including inherited Umbra penalties');
  checks.push('mixed sources: crystals absorbed into Umbra/normal/plus, equipment still named, saved gains and totals unchanged');
  await page.keyboard.press('Escape');
  await setup('Level up');
  const umbraRow = page.locator('#malus-audit .umbra-submenu .stat-container[data-stat="vigueur"]').first();
  await umbraRow.click();
  const umbraHelper = page.locator('[data-umbra-pinned="true"]');
  const ownedUmbraText = await umbraHelper.innerText();
  assert.doesNotMatch(ownedUmbraText, /crystal/i);
  assert.equal(await umbraHelper.locator('[data-helper-source="crystal"]').count(), 0);
  const ownedPoints = await page.evaluate(() => JSON.stringify(window.__malusAudit.active.baseStats));
  await page.evaluate(() => {
    const { active, U } = window.__malusAudit;
    active.modifierStats.preview = { statLeveled: { vigueur: 4 } };
    U.refreshActiveStatPreview(active, document.getElementById('malus-audit'));
  });
  assert.equal(await page.evaluate(() => JSON.stringify(window.__malusAudit.active.baseStats)), ownedPoints, 'Preview preserves every permanently owned point');
  assert.notEqual(await umbraHelper.innerText(), ownedUmbraText, 'Umbra preview refreshes the pinned card');
  assert.doesNotMatch(await umbraHelper.innerText(), /crystal/i, 'Preview keeps crystal gains absorbed in the stat');
  checks.push('Level up: owned Umbra points include crystal gains without annotation, including previews');
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    const { entity, G } = window.__malusAudit;
    window.__malusAudit.items = [];
    entity.stuff = {};
    G.saveToLocalStorage('equippedItems', []);
    entity.baseStats.physicalDamage = 35;
    delete entity.baseStats.physicalDamagePlus;
    delete entity.baseStatSources;
  });
  await setup('Stats');
  await page.setViewportSize({ width: 390, height: 844 });
  const row = page.locator('#malus-audit .section-content.stats [data-stat="physicalDamage"].stat-container').first();
  await row.click();
  const helper = page.locator('[data-umbra-pinned="true"]');
  await helper.locator('[data-helper-source="malus"]').hover();
  await page.locator('[data-umbra-detail]').waitFor({ state: 'visible' });
  for (const card of [helper, page.locator('[data-umbra-detail]')]) {
    const bounds = await card.boundingBox();
    assert.ok(bounds.x >= -1 && bounds.x + bounds.width <= 391, 'mobile helper contained horizontally');
  }
  await page.waitForFunction(() => [...document.querySelectorAll('[data-umbra-pinned], [data-umbra-detail]')].every(n => Number(getComputedStyle(n).opacity) >= .99));
  await page.screenshot({ path: resolve(output, 'mobile.png') });
  checks.push('390 px: helper and source stay within viewport');
  await page.evaluate(async () => {
    const { entity, E, U } = window.__malusAudit;
    delete entity.modifierStats.durable.statLeveled.physicalDamage;
    E.recomputeEntityStats(entity, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
    U.refreshActiveStatPreview(entity, document.getElementById('malus-audit'));
  });
  assert.equal(await row.locator('.stat-curse-marker').count(), 0, 'removed penalty removes badge');
  await helper.locator('[data-helper-source="fixed"]').hover();
  assert.equal(await helper.locator('.stat-malus-value').count(), 0, 'removed penalty clears pinned source');
  checks.push('removal clears badge and pinned helper without reopening');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(async () => {
    const E = await import("/js/entities/runtime.js"), UI = await import("/js/ui/statistics/helpers.js"), _UI2 = await import("/js/ui/statistics/components.js");
    const G = await import("/js/storage/gameStorage.js"), P = await import("/js/entities/progression.js");
    const Gear = await import('/js/items/equipement.js'), State = await import("/js/app/state.js");
    const { ItemDetails } = await import('/js/data/itemList.js');
    let actors, mode, key, residual, pinned, selected, category;
    const check = (ok, message) => { if (!ok) throw Error(message); };
    const row = index => document.querySelector(`#malus-owner-${index} .stat-container[data-stat="${key}"]`);
    const expected = index => {
      const entity = structuredClone(actors[index]);
      if (mode === 'preview') {
        entity.modifierStats.preview = { statLeveled: { weaponOrfevre: 20, physicalDamage: 2 } };
        P.ComputeStatPreview(entity);
      }
      return E.getStatMalusSources(entity, key);
    };
    window.__malusSwap = {
      setup(options) {
        ({ mode, key, residual } = options);
        UI.closeOpenHelpers();
        document.body.innerHTML = '<div class="Game-helper"></div><main id="malus-swap-audit"></main>';
        window.levelRunning = options.context === 'map' ? 'worldmap' : 'malus-swap-audit';
        G.setAdminMode(true); State.refreshStageAccess();
        const template = ItemDetails.find(item => item.functionName === 'DevMovementMixed');
        const items = [0, 1].map(index => ({ ...structuredClone(template),
          itemId: `i-malus-swap-${index}`, equippedId: `ei-malus-swap-${index}`, equippedTo: 987170 + index,
          slot: `slot1-${987170 + index}`, displayName: index ? 'Anneau favorable' : 'Anneau maudit',
          Stuffeffets: Object.entries(index ? { physicalDamage: 4, physicalDamagePlus: 2, vigueur: 3 }
            : { physicalDamage: -6, physicalDamagePlus: -2, vigueur: -4 })
            .map(([stat, value]) => ({ type: 'stat-buff', stat, value })) }));
        actors = items.map((item, index) => {
          const entity = structuredClone(E.entitesNestUp[0]);
          Object.assign(entity, { id: item.equippedTo, side: 'A', awakening: 1, level: { current: 1, max: 250 },
            baseStats: { HP: 100, physicalDamage: 35, physicalDamagePlus: 3, vigueur: 10, strength: 10,
              agility: 10, intelligence: 10, charge: 4, weaponOrfevre: index ? 50 : 0 },
            modifierStats: { durable: { statLeveled: residual ? { [key]: -1 } : {} } },
            stats: {}, stuff: { slot1: [item.equippedId] }, resourceStocks: {} });
          E.recomputeEntityStats(entity, { equippedItems: items, persistEquipment: false, skipReverseArchetype: true });
          return entity;
        });
        E.entites.splice(0, E.entites.length, ...actors);
        G.saveToLocalStorage('selectedArmyA', actors); G.saveToLocalStorage('equippedItems', items);
        for (const bucket of ['PlayerSave', 'IngameItemsData']) G.saveToLocalStorage(bucket, { Playerinventory: [], equippedItems: items });
        for (const [index, entity] of actors.entries()) {
          const draft = structuredClone(entity);
          if (mode === 'preview') {
            draft.modifierStats.preview = { statLeveled: { weaponOrfevre: 20, physicalDamage: 2 } };
            P.ComputeStatPreview(draft);
          }
          const scope = document.createElement('section'); scope.id = `malus-owner-${index}`;
          scope.className = mode === 'stats' ? 'codex-entity-scan' : 'level-up-section';
          scope.style.cssText = `position:fixed;top:20px;left:${20 + index * 700}px;width:620px;height:auto;background:#240000`;
          const block = document.createElement('div'); block.className = 'codex-attack-stat-block';
          _UI2.createUmbraBlock(block, key === 'vigueur' ? 'Vigueur' : 'Puissance Physique', () => draft.stats[key], draft, key);
          scope.append(block); document.getElementById('malus-swap-audit').append(scope);
          if (key === 'physicalDamage') row(index).dataset.autonomousHelper = 'true';
          _UI2.syncStatCurseMarker(row(index), draft, key);
          UI.bindHelperEntity(scope, draft); UI.bindHelperEntity(row(index), draft);
        }
      },
      capture(index) {
        selected = index;
        pinned = document.querySelector('[data-umbra-pinned="true"]');
        category = document.querySelector('[data-umbra-detail]')?._sourceAnchor?.dataset.helperSource;
        check(pinned && (key === 'vigueur' || category), 'Parent and the available source helper are open before equipment change');
      },
      swap() {
        check(Gear.equip({ item: G.getEquippedItemById(actors[0].stuff.slot1[0]), sourceEntity: actors[0],
          targetEntity: actors[1], slotId: `slot1-${actors[1].id}` }), 'Real equipment swap succeeds');
      },
      remove() {
        Gear.unequip({ targetEntity: actors[selected], slotId: `slot1-${actors[selected].id}` });
        check(!actors[selected].stuff.slot1?.length, 'Real unequip removes item from selected owner');
      },
      inspect() {
        for (const [index, entity] of actors.entries()) {
          const host = row(index), penalties = expected(index);
          check(host.dataset.statCursed === String(Boolean(penalties.length)), `Owner ${index}: curse dataset follows remaining penalties`);
          check(host.querySelectorAll('.stat-curse-marker').length === Number(Boolean(penalties.length)), `Owner ${index}: no stale or duplicate !`);
          check(getComputedStyle(host).backgroundImage.includes('150, 20, 35') === Boolean(penalties.length), `Owner ${index}: red background follows remaining penalties`);
          check((getComputedStyle(host.querySelector('.stat-name')).color === 'rgb(255, 136, 152)') === Boolean(penalties.length), `Owner ${index}: name color follows remaining penalties`);
          const view = UI.getBoundHelperEntity(host);
          check(JSON.stringify(E.getStatMalusSources(view, key)) === JSON.stringify(penalties), `Owner ${index}: sources use current equipment and efficiency`);
          if (mode === 'preview') check(view.modifierStats.preview?.statLeveled.physicalDamage === 2, `Owner ${index}: preview remains intact`);
          const equippedId = entity.stuff.slot1?.[0];
          if (equippedId) check(G.getEquippedItemById(equippedId).equippedTo === entity.id, 'Saved equipment belongs to its new owner');
        }
        check(pinned?.isConnected && pinned === document.querySelector('[data-umbra-pinned="true"]'), 'Same pinned helper survives change');
        const view = UI.getBoundHelperEntity(row(selected));
        const hasMalus = E.getStatMalusSources(view, key).length > 0;
        if (key === 'vigueur') {
          check(!pinned.querySelector('[data-helper-source="malus"]'), 'Compact Umbra card does not add a source footer');
          const expectedPoints = view.modifierStats.preview?.total?.vigueur ?? view.stats.vigueur;
          const shown = pinned.querySelector('.short-descri .helper-figure').textContent.replace(/\s|\+/g, '');
          check(Number(shown) === expectedPoints, 'Pinned Umbra amount follows the equipped penalty and preview');
          return;
        }
        check(Boolean(pinned.querySelector('[data-helper-source="malus"]')) === hasMalus, 'Open source footer updates its Malus link');
        const owned = actors[selected].stuff.slot1?.[0];
        const equipmentSources = [...pinned.querySelectorAll('template')]
          .flatMap(template => [...template.content.querySelectorAll('[data-provenance="equipment"]')]);
        check(equipmentSources.every(source => source.dataset.sourceId === owned), 'No old item remains in any pinned source template');
        const detail = document.querySelector('[data-umbra-detail]');
        const previousAnchor = category && pinned.querySelector(`[data-helper-source="${category}"]`);
        if (!previousAnchor && !detail) {
          check(!detail, 'Removed Malus source leaves no obsolete detail');
        } else {
          check(detail && detail._parentHelper === pinned, 'Existing source detail stays open without a new hover');
          const anchor = detail._sourceAnchor;
          check(pinned.contains(anchor), 'Visible detail belongs to a current source');
          if (selected === 0 && previousAnchor) check(anchor === previousAnchor, 'Focused source stays selected');
          check(detail.querySelector('.stat-hover-body').textContent.trim() === anchor.querySelector('template').content.textContent.trim(),
            `Already-open detail matches refreshed source template: ${JSON.stringify({
              actual: detail.querySelector('.stat-hover-body').textContent.trim(),
              expected: anchor.querySelector('template').content.textContent.trim(), anchor: detail._sourceAnchor?.outerHTML })}`);
          const ownsCursed = actors[selected].stuff.slot1?.[0] === 'ei-malus-swap-0';
          if (anchor.dataset.helperSource === 'malus') check(detail.textContent.includes('Anneau maudit') === ownsCursed, 'Open Malus detail follows item provenance');
        }
        category = detail?._sourceAnchor?.dataset.helperSource;
      },
    };
  });
  for (const context of ['map', 'combat']) for (const mode of ['stats', 'level-up', 'preview']) {
    for (const key of ['physicalDamage', 'vigueur']) for (const residual of [false, true]) for (const selected of [0, 1]) {
      const label = `${context}/${mode}/${key}/${residual ? 'other-malus' : 'only-stuff'}/owner${selected}`;
      console.log(`Checking ${label}`);
      await page.evaluate(options => window.__malusSwap.setup(options), { context, mode, key, residual });
      await page.locator(`#malus-owner-${selected} .stat-container`).click();
      const source = selected === 0 || residual ? 'malus' : 'fixed';
      const sourceAnchor = page.locator(`[data-umbra-pinned="true"] [data-helper-source="${source}"]`);
      if (key !== 'vigueur') {
        if (selected === 0) await sourceAnchor.focus();
        else await sourceAnchor.hover();
      }
      await page.evaluate(selected => window.__malusSwap.capture(selected), selected);
      await page.evaluate(() => window.__malusSwap.inspect());
      for (const action of ['swap', 'remove']) {
        await page.evaluate(action => window.__malusSwap[action](), action);
        await page.waitForTimeout(150);
        try { await page.evaluate(() => window.__malusSwap.inspect()); }
        catch (error) {
          await page.screenshot({ path: resolve(output, 'swap-failure.png') });
          throw new Error(`${label}/${action}: ${error.message}`);
        }
        checks.push(`${label}/${action}: both owners' !, red background, sources and open helpers reflect remaining penalties`);
        if (context === 'map' && mode === 'preview' && key === 'physicalDamage' && residual && selected === 0) {
          await page.waitForFunction(() => [...document.querySelectorAll('[data-umbra-pinned], [data-umbra-detail]')]
            .every(node => Number(getComputedStyle(node).opacity) >= .99));
          await page.screenshot({ path: resolve(output, `live-${action}-sources.png`) });
        }
      }
    }
  }
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ checks, errors }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, checks, errors }, null, 2));
} finally {
  await browser.close();
  await new Promise(done => server.close(done));
}
