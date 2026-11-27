import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = resolve('docs'), output = resolve('outputs/crystal-live-helpers');
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  const file = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  const rel = relative(root, file);
  if (rel === '..' || rel.startsWith('..' + sep)) return res.writeHead(403).end();
  try {
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const checks = [], errors = [];
let page;
try {
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', msg => { if (msg.type() === 'error' && !msg.text().includes('404')) errors.push(msg.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.evaluate(async () => {
    const E = await import("/js/entities/runtime.js"), G = await import("/js/storage/gameStorage.js");
    const UI = await import("/js/ui/statistics/helpers.js"), _UI = await import("/js/ui/codex/index.js"), U = await import("/js/entities/progression.js"), _U = await import("/js/ui/statistics/components.js");
    const D = await import("/js/ui/statistics/details.js"), S = await import("/js/entities/statSystem.js");
    const H = await import('/js/data/helpers.js');
    const P = await import('/js/items/permanentItems.js'), M = await import('/js/items/itemManager.js');
    const State = await import("/js/app/state.js");
    let entity, draft, mount, host, helper, baseline, choice, mode, itemId, expected, beforeDetail, previewDeltas, openDetail;
    const check = (ok, message) => { if (!ok) throw Error(message); };
    const number = text => Number(text.replace(/\s|%/g, ''));
    window.__liveCrystal = {
      setup(options) {
        ({ choice, mode } = options);
        UI.closeOpenHelpers(); M.clearBattleGroundItems();
        document.body.innerHTML = '<div class="Game-helper"></div><div id="hexGrid"><div class="hex Neutral" id="hex_1" data-position="hex_1" data-row="0" data-col="0"></div></div><main id="crystal-live-audit" style="position:fixed;inset:0;overflow:auto;background:#240000"></main>';
        window.levelRunning = 'worldmap'; State.setGameOver(false); State.refreshStageAccess();
        G.setCurrentLevel('crystal-live-audit');
        G.saveToLocalStorage('ArmyB', { armies: {} });
        G.saveToLocalStorage('PlayerSave', { Playerinventory: [], equippedItems: [], battleSlots: [], battleGroundItems: [] });
        G.saveToLocalStorage('equippedItems', []); G.saveToLocalStorage('IngameItems', []);
        entity = { id: 988185, name: 'Crystal en direct', type: 'sbire', side: 'A', awakening: 1,
          level: { current: choice.stat === 'inflexion' ? 30 : 1, max: 250 }, attacks: ['autoAttack'], stuff: {},
          baseStats: { HP: 100, strength: 10, intelligence: 10, agility: 10, charge: 4,
            physicalDamage: 10, physicalDamagePlus: 2, vigueur: 4, magicalPen: 3, magicalPenPlus: 1, inflexion: 4 } };
        if (choice.unlock) { delete entity.baseStats.physicalDamagePlus; delete entity.baseStats.vigueur; }
        if (choice.malus) entity.modifierStats = { durable: { statLeveled: { vigueur: -1 } } };
        E.recomputeEntityStats(entity, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
        E.entites.splice(0, E.entites.length, entity);
        G.saveToLocalStorage('selectedArmyA', [entity]);
        U.setPlayerExperience(1000000);
        mount = document.getElementById('crystal-live-audit');
        _UI.createCodexEntityScan(entity, mount, `codex-entity_${entity.id}`);
        mount.querySelector(`.codex-inner-menu:has(.codex-${mode === 'Stats' ? 'stat' : 'soul'})`).click();
        if (mode === 'Stats') mount.querySelector(`.section-content.stats [data-mode="${['vigueur', 'inflexion'].includes(choice.stat) ? 'umbra' : 'stat'}"]`).click();
        draft = mode === 'Stats' ? entity : UI.helperEntityByRoot.get(mount.querySelector('.level-up-section'));
        if (mode === 'Preview') {
          draft.modifierStats.preview = { statLeveled: { strength: 2, vigueur: 1 } };
          _U.refreshActiveStatPreview(draft, mount);
        }
        if (mode === 'Invested') {
          mount.querySelector('.axis-line[data-key="strength"] .right-arrow').click();
          mount.querySelector('.axis-line[data-key="strength"] .right-arrow').click();
        }
        previewDeltas = structuredClone(draft.modifierStats?.preview?.statLeveled || {});
        const scope = mode === 'Stats' ? mount.querySelector('.section-content.stats') : mount;
        host = [...scope.querySelectorAll(`.stat-container[data-stat="${choice.stat}"], [data-attribute-helper][data-stat="${choice.stat}"]`)]
          .find(node => node.getClientRects().length);
        check(host, `${mode}/${choice.stat}: real visible stat row exists`);
        host.dataset.liveCrystalHost = 'true';
        baseline = structuredClone(entity.baseStats);
      },
      capture() {
        helper = document.querySelector('[data-umbra-pinned="true"]');
        check(helper?._helperHost === host, 'Helper is pinned on the actual entity');
        openDetail = document.querySelector('[data-umbra-detail]');
        beforeDetail = openDetail?.textContent;
        check(beforeDetail, 'Source or total sub-helper is already open');
      },
      async consume() {
        const item = P.createUmbraCrystal({ statKey: choice.grant, amount: 2 });
        itemId = item.itemId;
        check(M.spawnBattleGroundItem(item, document.getElementById('hex_1'), 'live-helper-test', { infinite: true }), 'Crystal is on the board');
        const result = await M.useConsumableItem(itemId, entity, { ground: true, silent: true });
        check(result.ok && !result.warning, 'Production crystal consumption succeeds');
        const projected = structuredClone(entity);
        if (Object.keys(previewDeltas).length) {
          projected.modifierStats.preview = { statLeveled: structuredClone(previewDeltas) };
          U.ComputeStatPreview(projected);
        }
        expected = projected;
      },
      inspect() {
        check(helper.isConnected && document.querySelector('[data-umbra-pinned="true"]') === helper, 'Pinned helper remains open');
        const detail = document.querySelector('[data-umbra-detail]');
        check(detail === openDetail, 'Existing sub-helper updates in place without restarting its appearance');
        check(detail?._parentHelper === helper && detail._sourceAnchor?.isConnected, 'Open sub-helper is still attached to the refreshed parent');
        if (choice.anchor !== 'picto') check(detail.textContent !== beforeDetail, 'Sub-helper updates without a new hover');
        check(!/crystal/i.test(helper.textContent + detail.textContent), 'No Crystal annotation returns');
        const view = UI.getBoundHelperEntity(helper._helperHost);
        for (const key of Object.keys(entity.baseStats)) check(JSON.stringify(view.baseStats[key]) === JSON.stringify(entity.baseStats[key]), `${key}: helper sees current permanent base`);
        if (Object.keys(previewDeltas).length) check(JSON.stringify(draft.modifierStats.preview.statLeveled) === JSON.stringify(previewDeltas), 'Pending level-up choices survive consumption');
        const actualRow = S.getStatSystemResult(view, choice.stat);
        const expectedRow = S.getStatSystemResult(expected, choice.stat);
        if (actualRow && expectedRow) check(actualRow.value === expectedRow.value, 'Helper model includes the gain and pending preview once');
        const expectedModels = D.calculateStatsDisplay(choice.stat, expected).umbraHelperCalculations || {};
        for (const [key, model] of Object.entries(helper._umbraCalculations || {})) {
          if (expectedModels[key]) check(model.value === expectedModels[key].value, `${key}: pinned calculation is current`);
        }
        const totals = D.getStatisticSourceTotals(view, choice.stat, D.calculateStatsDisplay(choice.stat, view));
        if (actualRow) check(Math.abs(totals.reduce((sum, row) => sum + row.value, 0) - actualRow.value) < 1e-5, 'Source totals reconcile without duplicate gains');
        if (choice.anchor === 'total' && actualRow) {
          const exclusive = [...detail.querySelectorAll('[data-contribution-value]')];
          const amount = exclusive.length ? exclusive.reduce((sum, node) => sum + Number(node.dataset.contributionValue), 0)
            : number(detail.querySelector('[data-autonomous-kind="total"] .helper-figure').textContent);
          check(amount === actualRow.value, 'Open total displays the live result through exclusive contributions');
        }
        if (choice.anchor === 'picto') {
          // The current Umbra pictogram opens the stat description, not a second total.
          const description = document.createElement('div');
          const anchor = detail._sourceAnchor;
          description.innerHTML = H.buildStatDescriptionHelper('physicalDamage', anchor.dataset.helperStatState || anchor.dataset.statState || 'normal');
          check(detail.querySelector('.stat-hover-body').textContent.trim() === description.textContent.trim(), 'Nested physical power keeps the current descriptive helper');
          check(!detail.querySelector('.helper-calculation-detail'), 'Nested PP description does not reintroduce inline formulas');
        } else if (choice.anchor === 'own') {
          check(number(detail.querySelector('[data-autonomous-kind="umbra"] .helper-calculation-result').textContent) === expectedModels.generatedUmbraSource.value, 'Own Vigueur contribution refreshes without other source amounts');
          check(detail.querySelectorAll('[data-autonomous-kind]').length === 1, 'Vigueur own detail remains exclusive');
        } else if (choice.anchor === 'ratio') {
          const anchor = detail._sourceAnchor;
          const expectedDetail = document.createElement('div');
          expectedDetail.innerHTML = anchor.hasAttribute('data-helper-ratio')
            ? H.buildRatioValueHelper(anchor.dataset.ratioStat,anchor.dataset.ratioValue,anchor.dataset.ratioUnit,anchor.dataset.ratioRounding,anchor.dataset.ratioSourcePoints)
            : H.buildUmbraContributionHelper(expectedModels[anchor.dataset.umbraCalculation], Number(anchor.dataset.umbraPart));
          check(detail.querySelector('.stat-hover-body').textContent.trim() === expectedDetail.textContent.trim(), 'Restored inline Umbra ratio refreshes in place');
        } else if (choice.anchor !== 'total') {
          const template = helper.querySelector(`[data-helper-source="${choice.anchor}"] template`);
          check(detail.querySelector('.stat-hover-body').textContent.trim() === template.content.textContent.trim(),
            'Open source displays the current source calculation');
        }
        const liveBlocks = [...mount.querySelectorAll(`.stat-container[data-stat="${choice.stat}"]`)].filter(node => node.getClientRects().length);
        const committed = S.getStatSystemResult(entity, choice.stat)?.value ?? entity.stats[choice.stat];
        for (const block of liveBlocks) {
          const counter = block.querySelector('.entite-stat:not(.preview)');
          if (counter && typeof committed === 'number') check(number(counter.textContent) === committed, 'Visible committed counter reflects consumption');
          if (Object.keys(previewDeltas).length) {
            const previewCounter = block.querySelector('.entite-stat.preview');
            const previewValue = expectedRow?.value ?? expected.modifierStats.preview.total[choice.stat];
            if (previewCounter && !previewCounter.classList.contains('is-hidden') && typeof previewValue === 'number') {
              check(number(previewCounter.textContent) === previewValue,
                `Visible preview counter reflects consumption: ${choice.stat} ${previewCounter.textContent} / ${previewValue}`);
            }
          }
        }
        const saved = G.loadFromLocalStorage('selectedArmyA', []).find(row => row.id === entity.id);
        if (mode !== 'Stats') for (const key of ['strength', 'agility', 'intelligence']) {
          const axis = mount.querySelector(`.axis-line[data-key="${key}"] .axis-value-display`);
          const value = expected.modifierStats?.preview?.total?.[key] ?? expected.stats[key];
          check(number(axis.textContent) === value, `${key}: visible attribute axis includes gains and pending choices`);
        }
        check(saved.baseStats[choice.grant] === (baseline[choice.grant] || 0) + 2 && entity.baseStats[choice.grant] === saved.baseStats[choice.grant], 'Saved gain applied exactly once');
        check(!M.getIngameItemById(itemId) && !M.getBattleInventoryState().battleGroundItems.some(row => row.itemId === itemId), 'Consumed crystal is removed');
      },
      async replay() {
        const before = JSON.stringify(entity.baseStats);
        const result = await M.useConsumableItem(itemId, entity, { ground: true, silent: true });
        check(!result.ok && JSON.stringify(entity.baseStats) === before, 'Replaying consumed crystal cannot add points twice');
      },
      confirm() {
        mount.querySelector('.confirm-button.yes').click();
        const saved = G.loadFromLocalStorage('selectedArmyA', []).find(row => row.id === entity.id);
        E.recomputeEntityStats(saved, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
        check(saved.baseStats[choice.grant] === (baseline[choice.grant] || 0) + 2, 'Confirming Level up retains permanent crystal gain exactly once');
        check(JSON.stringify(saved.baseStats) === JSON.stringify(expected.baseStats), 'Confirmation keeps every permanent base gain');
        for (const key of ['strength', 'vigueur']) check(saved.modifierStats.durable.statLeveled[key]
          === (expected.modifierStats.durable.statLeveled[key] || 0) + (previewDeltas[key] || 0),
          `${key}: pending investment is committed once, apart from permanent crystal points`);
      },
    };
  });
  const choices = [
    { grant: 'physicalDamage', stat: 'physicalDamage', anchor: 'total' },
    { grant: 'physicalDamagePlus', stat: 'physicalDamage', anchor: 'total', unlock: true },
    { grant: 'physicalDamagePlus', stat: 'physicalDamage', anchor: 'plus' },
    { grant: 'vigueur', stat: 'physicalDamage', anchor: 'umbra' },
    { grant: 'vigueur', stat: 'vigueur', anchor: 'total' },
    { grant: 'vigueur', stat: 'vigueur', anchor: 'ratio' },
    { grant: 'strength', stat: 'strength', anchor: 'fixed' },
    { grant: 'magicalPenPlus', stat: 'magicalPen', anchor: 'total' },
  ];
  const levelChoices = [
    { grant: 'vigueur', stat: 'vigueur', anchor: 'total' },
    { grant: 'vigueur', stat: 'vigueur', anchor: 'ratio' },
    { grant: 'vigueur', stat: 'vigueur', anchor: 'ratio', malus: true },
    { grant: 'strength', stat: 'strength', anchor: 'fixed' },
    { grant: 'physicalDamage', stat: 'vigueur', anchor: 'picto' },
    { grant: 'physicalDamagePlus', stat: 'vigueur', anchor: 'picto' },
    { grant: 'inflexion', stat: 'inflexion', anchor: 'total' },
  ];
  for (const mode of ['Stats', 'Level up', 'Preview', 'Invested']) for (const choice of mode === 'Stats' ? choices : levelChoices) {
    const label = `${mode}/${choice.grant}/${choice.stat}/${choice.anchor}`;
    console.log(`Checking ${label}`);
    await page.evaluate(options => window.__liveCrystal.setup(options), { mode, choice });
    await page.locator('[data-live-crystal-host]').click();
    const helper = page.locator('[data-umbra-pinned="true"]');
    const totalKey = { vigueur: 'physicalDamageTotal', inflexion: 'magicalPenTotal' }[choice.stat];
    const anchor = helper.locator(choice.anchor === 'total' ? totalKey ? `[data-autonomous-calculation][data-umbra-calculation="${totalKey}"]` : '[data-autonomous-calculation]' : choice.anchor === 'own' ? '[data-autonomous-calculation][data-umbra-calculation="generatedUmbraSource"]' : choice.anchor === 'ratio' ? '[data-helper-ratio], [data-umbra-part]' : choice.anchor === 'picto'
      ? '[data-helper-picto-stat="physicalDamage"]' : `[data-helper-source="${choice.anchor}"]`).first();
    assert.ok(await anchor.count(), `${label}: expected current helper anchor exists`);
    await anchor.focus();
    await page.locator('[data-umbra-detail]').waitFor({ state: 'visible' });
    await page.evaluate(() => window.__liveCrystal.capture());
    await page.evaluate(() => window.__liveCrystal.consume());
    await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
    await page.evaluate(() => window.__liveCrystal.inspect());
    await page.evaluate(() => window.__liveCrystal.replay());
    if (mode === 'Invested') await page.evaluate(() => window.__liveCrystal.confirm());
    checks.push(label);
    if (mode !== 'Invested' && choice.grant === 'vigueur' && choice.stat === 'vigueur') {
      await page.waitForFunction(() => [...document.querySelectorAll('[data-umbra-pinned], [data-umbra-detail]')]
        .every(node => Number(getComputedStyle(node).opacity) >= .99));
      await page.screenshot({ path: resolve(output, `${mode.replace(/\s/g, '-')}.png`) });
    }
  }
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ checks, errors }, null, 2));
  console.log(`PASS ${checks.length} live consumption scenarios: pinned stats, sources, previews and replay protection`);
} catch (error) {
  if (page) await page.screenshot({ path: resolve(output, 'failure.png') }).catch(() => {});
  throw error;
} finally { await browser.close(); server.close(); }
