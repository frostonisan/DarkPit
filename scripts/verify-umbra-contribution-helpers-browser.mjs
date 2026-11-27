import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright';
const root = resolve('docs'), output = resolve(process.env.UMBRA_HELPER_OUTPUT || 'outputs/umbra-contributions-2026-11-26/browser');
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  const file = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(root + sep)) return res.writeHead(403).end();
  try { res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream'); res.end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
const coverage = [], errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await (await import('./browser-test-fixture.mjs')).dismissStarterForFixture(page);
  const keys = await page.evaluate(async () => {
    const E = await import('/js/entities/runtime.js'), G = await import('/js/storage/gameStorage.js');
    const C = await import('/js/ui/statistics/components.js'), H = await import('/js/ui/statistics/helpers.js');
    const D = await import('/js/ui/statistics/details.js'), S = await import('/js/entities/statSystem.js');
    const { stats } = await import('/js/data/statsData.js');
    const umbras = stats.filter(stat => stat.nature === 'umbra');
    const e = { id: 998888, name: 'Contributions', type: 'sbire', side: 'A', awakening: 3, seuilUmbra: 1500,
      level: 30, attacks: ['autoAttack'], stuff: {}, baseStats: {
        ...Object.fromEntries(Object.keys(S.STAT_SYSTEM_ORIGINS).flatMap(key => [[key, 7], [key + 'Plus', 5]])),
        ...Object.fromEntries(umbras.map(stat => [stat.key, 50])), HP: 1000, strength: 50, intelligence: 50, agility: 50,
      } };
    const recompute = () => E.recomputeEntityStats(e, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
    recompute(); E.entites.splice(0, E.entites.length, e);
    G.saveToLocalStorage('equippedItems', []); G.saveToLocalStorage('selectedArmyA', [e]);
    window.levelRunning = 'worldmap';
    const host = document.createElement('main'); host.className = 'codex-entity-scan codex-attack-stat-block';
    host.style.cssText = 'position:fixed;inset:0;padding:60px;background:#080b10;overflow:auto';
    document.getElementById('game-shell').append(host);
    window.audit = { e, E, G, H, D, host, recompute, async show(key, admin) {
      H.closeOpenHelpers(); host.replaceChildren(); G.setAdminMode(admin);
      (await import('/js/app/state.js')).refreshStageAccess();
      const stat = stats.find(stat => stat.key === key);
      C.createUmbraBlock(host, stat.name, () => e.stats[key], e, key);
      const row = host.querySelector('.stat-container'); H.bindHelperEntity(row, e); row.click();
      return D.calculateStatsDisplay(key, e).umbraPresentation;
    } };
    return umbras.map(stat => stat.key);
  });
  assert.equal(keys.length, 27);
  const card = page.locator('.stat-hover[data-umbra-pinned="true"]:not([data-umbra-detail])');
  const details = page.locator('[data-umbra-detail]');
  const number = text => Number(text.replace(/MAX/g, '').replace(/[^\d.−-]/g, '').replace('−', '-'));
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const admin of [false, true]) for (const key of keys) {
      const presentation = await page.evaluate(({ key, admin }) => audit.show(key, admin), { key, admin });
      await card.waitFor({ state: 'visible' });
      assert.doesNotMatch(await card.innerText(), /Total de l’entité|NaN|undefined/, key + ': only Umbra data on card');
      assert.ok(await card.evaluate(n => n.scrollWidth <= n.clientWidth + 2), key + ': no horizontal overflow');
      const introduction = card.locator('[data-umbra-section="introduction"]');
      assert.equal(await introduction.locator('[data-helper-value], [data-helper-stat-value], [data-umbra-detail-toggle]').count(), 0,
        key + ': Confère only links short definitions, including on its numbers');
      const grants = introduction.locator('[data-helper-source]');
      assert.equal(await grants.count(), 1 + presentation.directGrants.length);
      for (const grant of await grants.all()) {
        const expected = await grant.locator('template').evaluate(t => t.content.textContent.trim());
        for (const part of ['.picto-stat', '.helper-figure > span:last-child']) {
          await grant.locator(part).first().click();
          assert.equal((await details.last().locator('.stat-hover-body').innerText()).trim(), expected,
            key + ': Confère pictogram and number share the short definition');
          assert.equal(await details.last().locator('[data-helper-technical], .helper-player-value, .helper-score-total, .helper-umbra-grant').count(), 0);
          if (key === 'finesse' && await grant.getAttribute('data-helper-source') === 'umbra-grant-piercingDamage' && part === '.picto-stat') {
            await details.last().screenshot({ path: resolve(output, `finesse-confere-${width}-${admin}.png`), animations: 'disabled' });
          }
          await page.keyboard.press('Escape');
        }
      }
      for (const entry of presentation.entries.filter(entry => entry.state === 'X')) {
        const label = card.locator('.umbra-effect-name[data-helper-entry="' + entry.id + '"]');
        assert.equal(await label.locator('[data-helper-source], [tabindex]').count(), 0,
          key + ': statistic name and X have no separate helper anchor');
        const title = label.locator(':scope > [data-stat-state="X"]');
        assert.equal(await title.innerText(), entry.name + ' X');
        await title.click();
        assert.equal(await details.last().evaluate((node, id) => node._sourceAnchor?.dataset.helperEntry === id, entry.id), true,
          key + ': the complete X label opens its statistic definition');
        assert.equal(await details.last().locator('[data-helper-technical], .helper-score-total').count(), 0);
        await page.keyboard.press('Escape');
      }
      const ids = [...new Set(await card.locator('[data-helper-value]').evaluateAll(nodes => nodes.map(n => n.dataset.helperValue)))];
      for (const id of ids) {
        const entry = [...presentation.entries, ...presentation.detailEntries].find(entry => entry.id === id);
        const anchor = card.locator('[data-helper-value="' + id + '"] .helper-figure').first();
        assert.equal(number(await anchor.innerText()), Math.round(entry.value * 100) / 100, key + '/' + id + ': correct source amount');
        await anchor.click();
        const total = details.last().locator('.helper-score-total');
        await total.waitFor({ state: 'visible' });
        assert.equal(await total.count(), 1, key + '/' + id + ': one entity total');
        assert.equal(number(await total.locator('.helper-figure').innerText()), Math.round(entry.total.value * 100) / 100, key + '/' + id + ': correct total in helper');
        await page.keyboard.press('Escape');
      }
      {
        const info = card.locator('[data-umbra-info-toggle]');
        assert.equal(await info.count(), 1, key + ': global details are available in both modes');
        assert.equal(await info.getAttribute('title'), 'Voir tous les détails des stats');
        await info.click();
        assert.equal(await card.locator('[data-umbra-inline-detail][hidden]').count(), 0, key + ': i opens every ratio');
        await info.click();
        assert.equal(await card.locator('[data-umbra-inline-detail]:not([hidden])').count(), 0, key + ': i closes every ratio');
        const toggle = card.locator('[data-umbra-detail-toggle]').first();
        if (await toggle.count()) {
          assert.equal(await toggle.getAttribute('title'), 'Voir les ratios de la stat');
          await toggle.click();
          assert.equal(await card.locator('[data-umbra-inline-detail]:not([hidden])').count(), 1, key + ': triangle opens only its row');
          const source = card.locator('[data-umbra-inline-detail]:not([hidden]) .picto-stat[data-helper-picto-stat="' + key + '"]').first();
          if (await source.count()) {
            await source.click();
            assert.equal((await details.last().locator('.stat-hover-body').innerText()).trim(), presentation.role,
              key + ': Umbra in a calculation describes its role instead of listing its grants');
            assert.equal(await details.last().locator('.helper-score-total').count(), 0);
            if (key === 'finesse') await details.last().screenshot({ path: resolve(output, `finesse-intro-${width}-${admin}.png`), animations: 'disabled' });
            await page.keyboard.press('Escape');
          }
          const ratio = card.locator('[data-umbra-inline-detail]:not([hidden]) [data-helper-ratio]').first();
          if (await ratio.count()) {
            await ratio.click(); await details.last().waitFor({ state: 'visible' });
            assert.equal(await details.last().locator('.helper-score-total').count(), 0, key + ': coefficient helper has no entity total');
            assert.doesNotMatch(await details.last().innerText(), /Total de l’entité/);
            if (key === 'finesse') await details.last().screenshot({ path: resolve(output, `finesse-ratio-${width}-${admin}.png`), animations: 'disabled' });
            await page.keyboard.press('Escape');
          }
          const input = card.locator('[data-umbra-inline-detail]:not([hidden]) [data-helper-stat-value]').first();
          if (await input.count()) {
            await input.click();
            try { await details.last().locator('.helper-score-total').waitFor({ state: 'visible', timeout: 5000 }); }
            catch (error) { throw new Error(`${key}/${width}: input ${await input.getAttribute('data-helper-stat-value')} has no total; helper: ${await details.last().innerText()}`, { cause: error }); }
            await page.keyboard.press('Escape');
          }
          await toggle.click();
        }
      }
      if (['vigueur', 'criticalPower', 'astrality', 'hypercognition', 'vivacite'].includes(key)) {
        await page.mouse.move(1, 1);
        await card.screenshot({ path: resolve(output, `${key}-${width}-${admin}.png`), animations: 'disabled' });
      }
      coverage.push({ key, width, admin, values: ids.length });
    }
  }
  // The global preference follows navigation, while a triangle only affects its row.
  for (const admin of [false, true]) {
    await page.evaluate(admin => audit.show('astrality', admin), admin);
    await card.locator('[data-umbra-info-toggle]').click();
    await page.evaluate(admin => audit.show('vigueur', admin), admin);
    assert.ok(await card.locator('[data-umbra-inline-detail]').evaluateAll(nodes => nodes.length > 0 && nodes.every(node => !node.hidden)));
    await card.locator('[data-umbra-detail-toggle]').first().click();
    await page.evaluate(admin => audit.show('esprit', admin), admin);
    assert.ok(await card.locator('[data-umbra-inline-detail]').evaluateAll(nodes => nodes.length > 0 && nodes.every(node => !node.hidden)), 'A local triangle does not change another Umbra');
    await card.locator('[data-umbra-info-toggle]').click();
    await page.evaluate(admin => audit.show('vigueur', admin), admin);
    assert.ok(await card.locator('[data-umbra-inline-detail]').evaluateAll(nodes => nodes.length > 0 && nodes.every(node => node.hidden)), 'Global collapse resets local choices');
  }
  // An open total follows an entity edit while the Umbra contribution is stable.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => audit.show('indestructibility', true));
  const value = card.locator('[data-helper-value="hpBattleRegenPercent"]');
  const sourceBefore = await value.innerText();
  await value.click();
  const before = number(await details.last().locator('.helper-score-total .helper-figure').innerText());
  await page.evaluate(() => {
    audit.e.baseStats.hpBattleRegen += 10; audit.recompute();
    window.dispatchEvent(new CustomEvent('entityCombatStatsChanged', { detail: { entity: audit.e } }));
  });
  await page.waitForFunction(before => {
    const text = document.querySelector('[data-umbra-detail] .helper-score-total .helper-figure')?.textContent || '';
    return Number(text.replace(/[^\d.]/g, '')) > before;
  }, before);
  assert.equal(await value.innerText(), sourceBefore, 'Live external edit does not change Umbra amount');
  await page.keyboard.press('Escape');
  const version = JSON.parse(await readFile('package.json', 'utf8')).gameVersion;
  assert.ok((await page.locator('#game-version').innerText()).includes(version));
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'coverage.json'), JSON.stringify({ passed: true, coverage }, null, 2));
  console.log(`All 27 Umbra cards: ${coverage.length} desktop/mobile/player/admin views; ${coverage.reduce((n, c) => n + c.values, 0)} value helpers; live refresh.`);
} finally { await browser.close(); await new Promise(done => server.close(done)); }
