import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = resolve('docs'), output = resolve('outputs/attribute-sources');
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
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const checks = [], errors = [];
let page;
try {
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.evaluate(async () => {
    const E = await import("/js/entities/runtime.js"), G = await import("/js/storage/gameStorage.js");
    const UI = await import("/js/ui/statistics/helpers.js"), _UI = await import("/js/ui/codex/index.js"), P = await import("/js/entities/progression.js"), _P = await import("/js/ui/statistics/components.js");
    const D = await import("/js/combat/statistics.js"), Gear = await import('/js/items/equipement.js');
    const State = await import("/js/app/state.js"), { ItemDetails } = await import('/js/data/itemList.js');
    let actors, active, key, mode, host, pinned, snapshot;
    const check = (ok, message) => { if (!ok) throw Error(message); };
    const state = () => JSON.stringify({ actors, selected: G.loadFromLocalStorage('selectedArmyA', []), items: G.loadEquippedItems() });
    window.__attributeSources = {
      setup(options) {
        ({ key, mode } = options);
        UI.closeOpenHelpers();
        document.body.innerHTML = '<div class="Game-helper"></div><main id="attribute-audit" style="position:fixed;inset:0;overflow:auto;background:#240000"></main>';
        window.levelRunning = 'worldmap'; G.setAdminMode(true); State.refreshStageAccess();
        const template = ItemDetails.find(item => item.functionName === 'DevMovementMixed');
        const items = options.bare ? [] : [0, 1].map(index => ({ ...structuredClone(template),
          itemId: `i-attribute-${index}`, equippedId: `ei-attribute-${index}`, equippedTo: 988180,
          slot: `slot${index + 1}-988180`, displayName: index ? 'Anneau de dette' : 'Anneau de soutien',
          Stuffeffets: [{ type: 'stat-buff', stat: key, value: index ? (options.zero ? -46 : -4) : 4 }] }));
        actors = [0, 1].map(index => {
          const entity = structuredClone(E.entitesNestUp[0]);
          Object.assign(entity, { id: 988180 + index, side: 'A', awakening: 1, level: { current: 1, max: 250 },
            baseStats: { HP: 100, strength: 10, agility: 10, intelligence: 10, will: 10, charge: 5, weaponOrfevre: 50,
              ...(options.zero ? { vigueur: 1 } : {}),
              [key]: index || options.bare ? 10 : 13 },
            baseStatSources: index || options.bare ? {} : { crystal: { [key]: 3 } },
            modifierStats: { durable: { statLeveled: index || options.bare ? {} : { [key]: 2 } } },
            battleBoosts: index || options.bare ? {} : { [key]: [{ id: 'attribute-spell', source: 'Sort de soutien', value: 2, mode: 'flat' }] },
            stuff: index || options.bare ? {} : { slot1: [items[0].equippedId], slot2: [items[1].equippedId] },
            stats: {}, resourceStocks: {} });
          E.recomputeEntityStats(entity, { equippedItems: items, persistEquipment: false, skipReverseArchetype: true });
          return entity;
        });
        E.entites.splice(0, E.entites.length, ...actors);
        G.saveToLocalStorage('selectedArmyA', actors); G.saveToLocalStorage('equippedItems', items);
        for (const bucket of ['PlayerSave', 'IngameItemsData']) G.saveToLocalStorage(bucket, { Playerinventory: [], equippedItems: items });
        P.setPlayerExperience(1000000);
        const mount = document.getElementById('attribute-audit');
        _UI.createCodexEntityScan(actors[0], mount, 'codex-entity_988180');
        mount.querySelector(`.codex-inner-menu:has(.codex-${mode === 'stats' ? 'stat' : 'soul'})`).click();
        if (mode === 'stats') mount.querySelector('.section-content.stats [data-mode="stat"]').click();
        active = mode === 'stats' ? actors[0] : UI.helperEntityByRoot.get(mount.querySelector('.level-up-section'));
        if (mode === 'preview') {
          active.modifierStats.preview = { statLeveled: { [key]: 3 } };
          _P.refreshActiveStatPreview(active, mount);
        }
        host = [...mount.querySelectorAll(`.stat-container[data-stat="${key}"], [data-attribute-helper][data-stat="${key}"]`)]
          .find(node => node.getClientRects().length && (mode !== 'stats' || node.closest('.section-content.stats')));
        check(host, `${mode}/${key}: real Codex attribute row exists`);
        host.dataset.attributeAudit = 'true';
        snapshot = state();
      },
      capture() {
        pinned = document.querySelector('[data-umbra-pinned="true"]');
        check(pinned?._helperHost === host, 'Attribute helper is pinnable');
      },
      inspect() {
        check(pinned.isConnected, 'Attribute helper stays pinned');
        const view = UI.getBoundHelperEntity(host);
        const inputs = D.getStatContributions(view, key, { includePreview: true });
        const actual = [...pinned.querySelectorAll('template[data-helper-source-detail]')]
          .flatMap(template => [...template.content.querySelectorAll('.stat-modifier-source')]);
        check(actual.length === inputs.length, `Each attribute input appears exactly once: ${actual.length}/${inputs.length}`);
        check(actual.every(row => !/crystal/i.test(row.textContent) && row.dataset.provenance !== 'crystal'),
          'Crystal gains are included in the owned attribute without a separate mention');
        for (const input of inputs) {
          const origin = input.equipment ? `Stuff · ${input.source}` : input.source;
          const matches = actual.filter(row => row.dataset.sourceId === (input.id || '') && row.textContent.startsWith(`${origin} :`));
          check(matches.length === 1, `Unique named origin: ${origin}`);
          const row = matches[0];
          check(Number(row.querySelector('.helper-figure').textContent.replace(/\s/g, '')) === input.value, 'Effective input value, without extra ratio');
          check(row.querySelectorAll(':scope > [data-stat-state="attribute"], :scope > .helper-figure > [data-stat-state="attribute"]').length === 2,
            'Attribute name and final amount use attribute colors');
          check(row.querySelector(`.picto-stat.${key}`), 'Every input has its attribute icon');
          check(row.classList.contains('stat-modifier-malus') === Boolean(input.malus), 'Penalty classification is preserved');
        }
        check(!pinned.querySelector('[data-helper-source="equipment"], [data-helper-source="crystal"]'), 'Stuff and crystals stay in their stat family');
        if (mode === 'preview') check(view.modifierStats.preview?.statLeveled[key] === 3, 'Level-up choice survives equipment change');
        check(state() === snapshot, 'Reading attribute sources never changes stats or saved data');
      },
      swap(back = false) {
        const [sourceEntity, targetEntity] = back ? [actors[1], actors[0]] : actors;
        check(Gear.equip({ item: G.getEquippedItemById('ei-attribute-0'), sourceEntity, targetEntity,
          slotId: `slot1-${targetEntity.id}` }), 'Real equipment transfer succeeds');
        snapshot = state();
      },
      removePenalty() {
        Gear.unequip({ targetEntity: actors[0], slotId: 'slot2-988180' });
        snapshot = state();
      },
    };
  });
  for (const mode of ['stats', 'level-up', 'preview']) for (const key of ['strength', 'agility', 'intelligence', 'will']) {
    if (key === 'will' && mode !== 'stats') continue;
    console.log(`Checking ${mode}/${key}`);
    for (const bare of [true, false]) {
      await page.evaluate(options => window.__attributeSources.setup(options), { mode, key, bare });
      await page.locator('[data-attribute-audit]').click();
      await page.evaluate(() => window.__attributeSources.capture());
      const parent = page.locator('[data-umbra-pinned="true"]');
      await parent.locator('[data-helper-source="fixed"]').focus();
      await page.evaluate(() => window.__attributeSources.inspect());
      checks.push(`${mode}/${key}/${bare ? 'base' : 'mixed'}: named inputs once, correct icons/colors, no save mutation`);
      if (bare) {
        if (mode !== 'stats') {
          await page.keyboard.press('Escape');
          assert.equal(await page.locator('[data-umbra-detail]').count(), 0, 'Escape first closes the source subhelper');
          assert.equal(await parent.count(), 1, 'The pinned parent survives closing its child');
          await page.keyboard.press('Escape');
          assert.equal(await parent.count(), 0, 'The next Escape closes the pinned parent');
          const icon = page.locator('[data-attribute-audit]');
          assert.equal(await icon.getAttribute('role'), 'button');
          assert.ok(await icon.getAttribute('aria-label'));
          await icon.focus();
          await page.keyboard.press('Enter');
          await page.evaluate(() => { window.__attributeSources.capture(); window.__attributeSources.inspect(); });
          checks.push(`${mode}/${key}: keyboard opens named attribute helper without spending points`);
        }
        continue;
      }
      assert.equal(await parent.locator('[data-helper-source="stat"]').count(), 1);
      assert.equal(await parent.locator('[data-helper-source="combat"]').count(), 1);
      assert.equal(await parent.locator('[data-helper-source="malus"]').count(), 1);
      for (const back of [false, true]) {
        await page.evaluate(back => window.__attributeSources.swap(back), back);
        await page.waitForTimeout(200);
        await page.evaluate(() => window.__attributeSources.inspect());
        assert.equal(await page.locator('[data-umbra-detail]').count(), 1, 'Source stays open during equipment transfer');
        assert.equal((await page.locator('[data-umbra-detail]').innerText()).includes('Anneau de soutien'), back);
        checks.push(`${mode}/${key}/swap-${back}: open source follows equipment owner and keeps preview`);
      }
      await parent.locator('[data-helper-source="malus"]').focus();
      assert.match(await page.locator('[data-umbra-detail]').innerText(), /Stuff · Anneau de dette/);
      await page.evaluate(() => window.__attributeSources.removePenalty());
      await page.waitForTimeout(200);
      await page.evaluate(() => window.__attributeSources.inspect());
      assert.equal(await parent.locator('[data-helper-source="malus"]').count(), 0);
      assert.equal(await page.locator('[data-attribute-audit] .stat-curse-marker').count(), 0);
      checks.push(`${mode}/${key}: unequip removes obsolete Malus and ! without closing parent`);
      if (key === 'strength') {
        await parent.locator('[data-helper-source="fixed"]').focus();
        await page.waitForFunction(() => [...document.querySelectorAll('[data-umbra-pinned], [data-umbra-detail]')]
          .every(node => Number(getComputedStyle(node).opacity) >= .99));
        await page.screenshot({ path: resolve(output, `${mode}.png`) });
      }
    }
  }
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const key of ['strength', 'agility', 'intelligence']) {
      await page.evaluate(options => window.__attributeSources.setup(options), { mode: 'stats', key, zero: true });
      for (const panel of ['stat', 'umbra']) {
        // This check measures row geometry, not the Codex's separate mobile navigation layout.
        await page.locator(`.section-content.stats [data-mode="${panel}"]`).dispatchEvent('click');
        const row = page.locator(`.entity-stats-section.attributs [data-stat="${key}"].stat-container:visible`);
        const layout = await row.evaluate(node => {
          const name = node.querySelector('.stat-name'), marker = name.querySelector('.stat-curse-marker');
          const value = node.querySelector('.entite-stat:not(.preview)'), icon = node.querySelector('.attribut-picto');
          const rect = element => { const r = element.getBoundingClientRect(); return { x: r.x, right: r.right, y: r.y, height: r.height, center: r.y + r.height / 2 }; };
          const style = getComputedStyle(marker);
          return { name: rect(name), marker: rect(marker), value: rect(value), icon: rect(icon),
            text: value.textContent, margin: style.marginLeft, padding: style.padding, color: style.color };
        });
        assert.equal(layout.text, '0', 'Zero attributes retain their penalty marker');
        for (const part of ['name', 'marker', 'icon']) {
          assert.ok(Math.abs(layout[part].center - layout.value.center) < 1, `${width}/${panel}/${key}: ${part} and value share a vertical center`);
        }
        assert.ok(layout.marker.right <= layout.value.x, 'Penalty and value do not overlap');
        assert.ok(layout.icon.right <= layout.name.x, 'Attribute icon and name do not overlap');
        assert.equal(layout.margin, '10px');
        assert.equal(layout.padding, '6px');
        assert.equal(layout.color, 'rgb(255, 136, 152)');
        checks.push(`${width}/${panel}/${key}: zero value, name and malus aligned with requested marker style`);
        if (key === 'strength') await row.screenshot({ path: resolve(output, `alignment-${width}-${panel}.png`) });
      }
    }
  }
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ checks, errors }, null, 2));
  console.log(`PASS ${checks.length} attribute source scenarios`);
} catch (error) {
  await page?.screenshot({ path: resolve(output, 'failure.png') });
  throw error;
} finally {
  await browser.close();
  await new Promise(done => server.close(done));
}
