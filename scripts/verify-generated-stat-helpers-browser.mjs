import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('docs'), output = resolve('outputs/generated-stat-helpers');
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  const path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  const rel = relative(root, path);
  if (rel === '..' || rel.startsWith('..' + sep)) return res.writeHead(403).end();
  try {
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml' })[extname(path)] || 'application/octet-stream');
    res.end(await readFile(path));
  } catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
let browser, page;
const errors = [];
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  const result = await page.evaluate(async () => {
    const E = await import("/js/entities/runtime.js"), S = await import("/js/entities/statSystem.js");
    const D = await import("/js/combat/statistics.js"), _D = await import("/js/ui/statistics/details.js"), R = await import("/js/entities/rules.js");
    const UI = await Promise.all([import("/js/ui/application.js"), import("/js/ui/attacks.js"), import("/js/ui/codex/index.js"), import("/js/ui/codex/profile.js"), import("/js/ui/codex/stats.js"), import("/js/ui/dialogue.js"), import("/js/ui/display.js"), import("/js/ui/drag.js"), import("/js/ui/essences.js"), import("/js/ui/inventory.js"), import("/js/ui/navigation.js"), import("/js/ui/statistics/components.js"), import("/js/ui/statistics/details.js"), import("/js/ui/statistics/helpers.js")]).then(parts => Object.defineProperties({}, Object.fromEntries(parts.flatMap(part => Object.keys(part).map(key => [key, { enumerable: true, get: () => part[key] }]))))), U = await Promise.all([import("/js/entities/progression.js"), import("/js/rendering/vitalFeedback.js"), import("/js/ui/codex/stats.js"), import("/js/ui/statistics/components.js")]).then(parts => Object.defineProperties({}, Object.fromEntries(parts.flatMap(part => Object.keys(part).map(key => [key, { enumerable: true, get: () => part[key] }])))));
    const G = await import("/js/storage/gameStorage.js");
    const configs = Object.values(D.getGeneratedUmbraStatConfigs());
    let count = 0;
    const check = (ok, label) => { if (!ok) throw Error(label); count++; };
    const equal = (a, b, label) => check(Math.abs(a - b) < 1e-5, `${label}: ${a} / ${b}`);
    const fixture = values => ({ id: 986881, name: 'Familles de statistiques', type: 'sbire', side: 'A', awakening: 1,
      level: { current: 1, max: 250 }, attacks: ['autoAttack'], stuff: {}, baseStats: { HP: 100, ...values } });
    const recompute = entity => E.recomputeEntityStats(entity, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
    const conversions = {
      dodge: E.calculateDodgePercent,
      velocity: value => E.calculateVelocityReduction(value, 1000000).percentage,
      physicalPen: value => R.calculatePenetrationPercent(null, 'physicalPen', value),
      magicalPen: value => R.calculatePenetrationPercent(null, 'magicalPen', value),
      physicalResistance: R.calculateResistanceReductionPercent,
      magicalResistance: R.calculateResistanceReductionPercent,
    };
    const curve = n => 1 + .85 * (1 - Math.exp(-2.5 * n / 150)) / (1 - Math.exp(-2.5));
    for (const cfg of configs) {
      for (const normal of [0, 20, -40, 125]) for (const plus of [0, 10, -2, 120]) {
        for (const points of [0, 12, 3.3]) for (const attribute of [0, 10, 25]) {
          const inputs = { [cfg.target]: normal, [`${cfg.target}Plus`]: plus, [cfg.source]: points, [cfg.attribute]: attribute };
          const entity = fixture(inputs); recompute(entity);
          const before = JSON.stringify(entity);
          const row = S.calculateStatSources(inputs, cfg.target);
          const score = points * cfg.ratios.source * (points > 0 ? curve(points) : 1)
            + (plus > 0 || points > 0 ? attribute * cfg.ratios.attribute * (points > 0 ? curve(attribute) : 1) : 0);
          const generated = cfg.ratioPercent ? cfg.maxPercent * score / (cfg.constant + score)
            : plus > 0 || points > 0 ? cfg.progressive && points > 0
            ? Math.round(points * curve(points)) + Math.round(attribute * .5 * curve(attribute))
            : Math.round(points + attribute * .5) : 0;
          const flat = cfg.progressive ? points : 0;
          const cap = cfg.target === 'velocity' ? 65 : !cfg.progressive && conversions[cfg.target] ? 100 : Infinity;
          const converted = (!cfg.ratioPercent && !cfg.progressive && conversions[cfg.target] || (value => value))(generated);
          let expected = Math.round(Math.max(0, Math.min(cap, normal + plus + flat + converted)) * 1e6) / 1e6;
          if(cfg.target==='armor')expected=Math.max(0,Math.round(normal+Math.round(plus+flat+converted)));
          equal(row.value, expected, `${cfg.target}: direct amounts, fixed Umbra gift and current ratios`);
          equal(Number(cfg.target==='armor'?entity.stats.armor?.totalMax??0:entity.stats[cfg.target]), expected, `${cfg.target}: live entity matches the shared engine`);
          equal(row.umbraFlat, flat, `${cfg.source}: fixed gift follows its configured rule`);
          equal(D.calculateGeneratedUmbraStatBonus(entity, cfg.source), points > 0 ? generated + flat : 0, `${cfg.source}: fallback produces ratio points only`);
          check(row.state === (points > 0 ? 'X' : plus > 0 ? '+' : 'normal'), `${cfg.target}: correct state`);
          const model = S.buildStatSystemModel(row, entity);
          equal(model.contributions.reduce((sum, part) => sum + part.value, 0), expected, `${cfg.target}: exclusive contributions reconcile`);
          for (const part of model.contributions) {
            equal(part.parts.reduce((sum, term) => sum + (term.operator === '−' ? -term.value : term.value), 0), part.value, `${cfg.target}/${part.kind}: calculation matches contribution`);
          }
          equal(S.getStatSystemSourceTotals(entity, cfg.target).reduce((sum, part) => sum + part.value, 0), expected, `${cfg.target}: source totals reconcile`);
          const helper = _D.calculateStatsDisplay(cfg.source, entity);
          equal(helper.umbraHelperCalculations.generatedUmbraSource.value, model.contributions.find(part => part.kind === 'umbra').value, `${cfg.source}: ability contribution excludes autonomous Plus and keeps a separate entity total`);
          equal(helper.umbraHelperCalculations[`${cfg.target}Total`].value, expected, `${cfg.source}: separate entity total`);
          check(JSON.stringify(entity) === before, `${cfg.source}: helper reads never change combat state`);
        }
      }
    }
    const baseStats = { strength: 25, intelligence: 25, agility: 25 };
    for (const cfg of configs) Object.assign(baseStats, { [cfg.source]: 12, [cfg.target]: 30 });
    const probe = fixture(baseStats); recompute(probe);
    G.saveToLocalStorage('equippedItems', []); G.saveToLocalStorage('selectedArmyA', [probe]);
    E.entites.splice(0, E.entites.length, probe);
    window.__family = {
      configs, probe, UI, U,
      setup(mode) {
        UI.closeOpenHelpers();
        document.body.innerHTML = '<div class="Game-helper"></div><main id="family-audit" style="position:fixed;inset:0;background:#240000;overflow:auto"></main>';
        U.setPlayerExperience(1000000);
        const mount = document.getElementById('family-audit');
        UI.createCodexEntityScan(probe, mount, `codex-entity_${probe.id}`);
        mount.querySelector(`.codex-inner-menu:has(.codex-${mode === 'Stats' ? 'stat' : 'soul'})`).click();
        if (mode === 'Stats') mount.querySelector('.section-content.stats [data-mode="stat"]').click();
        this.entity = mode === 'Stats' ? probe : UI.helperEntityByRoot.get(mount.querySelector('.level-up-section'));
        if (mode === 'Preview') {
          this.entity.modifierStats.preview = { statLeveled: Object.fromEntries(configs.map(cfg => [cfg.source, 3])) };
          U.refreshActiveStatPreview(this.entity, mount);
        }
        return configs.map(cfg => ({ ...cfg, value: _D.calculateStatsDisplay(cfg.source, this.entity).umbraHelperCalculations[`${cfg.target}Total`].value }));
      },
      show(key, source = true) {
        UI.closeOpenHelpers();
        const mount = document.getElementById('family-audit');
        mount.querySelector(`.section-content.stats [data-mode="${source ? 'umbra' : 'stat'}"]`)?.click();
        let host = [...mount.querySelectorAll(`.stat-container[data-stat="${key}"]`)].find(node => node.getClientRects().length);
        // Velocity and armor are also reached from movement/resource helper links.
        if (!host && ['velocity','armor'].includes(key)) {
          const block = document.createElement('div'); block.className = 'codex-attack-stat-block'; mount.querySelector('.codex-entity-scan').append(block);
          UI.createUmbraBlock(block, key, () => this.entity.stats[key], this.entity, key);
          host = block.querySelector('.stat-container'); host.dataset.autonomousHelper = 'true';
          UI.bindHelperEntity(host, this.entity);
        }
        if (!host) throw Error(`Missing live row: ${key}`);
        host.dataset.familyTest = key;
        host.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      },
    };
    return { count, configs };
  });
  console.log(`PASS ${result.count} model, engine, fallback, source and boundary checks`);
  const uiChecks = [];
  for (const width of [1440, 390]) for (const mode of ['Stats', 'Level up', 'Preview']) {
    await page.setViewportSize({ width, height: 1000 });
    const configs = await page.evaluate(mode => window.__family.setup(mode), mode);
    for (const cfg of configs) {
      await page.evaluate(key => window.__family.show(key), cfg.source);
      const card = page.locator('[data-umbra-pinned="true"]');
      const body = card.locator('.stat-hover-body');
      const text = await body.innerText();
      assert.match(text, /^Confère/);
      assert.equal(await body.locator('[data-stat-description="'+cfg.source+'"]').count(), 1);
      const cardLayout = await body.locator('[data-umbra-layout="card"]').count() > 0;
      assert.ok(await body.locator('[data-umbra-section="capacity"]').count() > 0);
      const total = body.locator('[data-umbra-calculation="'+cfg.target+'Total"]');
      const current = await card.evaluate((node, cfg) => {
        const model=node._umbraCalculations[cfg.target+'Total'];
        return { total:model.value, own:model.contributions.find(p=>p.kind==='umbra').value };
      }, cfg);
      assert.equal(current.total, cfg.value);
      assert.equal(Number((await total.innerText()).replace(/[^0-9.−-]/g,'')), Math.round((cardLayout ? current.own : current.total)*100)/100);
      if (cardLayout) {
        assert.equal(await body.locator('[data-umbra-section="rounding"]').count(),0);
        for (const ratio of await body.locator('[data-helper-ratio]').all()) {
          const raw=Number(await ratio.getAttribute('data-ratio-value'));
          assert.equal(Number((await ratio.innerText()).replace(',','.')), Math.round(raw*10)/10);
        }
      } else assert.equal(await body.locator('[data-umbra-section="rounding"]').innerText(), 'La statistique peut être arrondie.');
      await total.focus();
      if(cardLayout) assert.match(await page.locator('[data-umbra-detail]').innerText(), /Total de l’entité/);
      else assert.ok(await page.locator('[data-umbra-detail] [data-autonomous-kind="umbra"]').count());
      const bounds = await card.boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1, `${cfg.source}: fits ${width}px`);
      if (mode === 'Stats' && ['esprit', 'constitution', 'adresse'].includes(cfg.source)) {
        await page.mouse.move(2, 2);
        await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('[data-umbra-pinned]')).opacity) >= .99);
        await card.screenshot({ path: resolve(output, `${cfg.source}-${width}.png`) });
      }
      if (mode === 'Stats') {
        await page.evaluate(key => window.__family.show(key, false), cfg.target);
        const statBody = page.locator('[data-umbra-pinned] .stat-hover-body');
        const statText = await statBody.innerText();
        if (cfg.target === 'velocity') assert.match(statText, /délai de remplissage de la barre d.action/);
        else assert.ok(await statBody.locator('.short-descri').count()>0, cfg.target+': description remains visible');
        assert.equal(await page.locator('[data-umbra-pinned]').evaluate(node=>node._umbraCalculations.autonomousTotal.value),cfg.value,cfg.target+': stat total agrees with the entity');

      }
      uiChecks.push(`${width}/${mode}/${cfg.source}`);
    }
  }
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ modelChecks: result.count, uiChecks, errors }, null, 2));
  console.log(`PASS ${uiChecks.length} live helpers across desktop, mobile, Stats, Level up and Preview`);
} catch (error) {
  if (page) await page.screenshot({ path: resolve(output, 'failure.png') }).catch(() => {});
  throw error;
} finally { await browser?.close(); await new Promise(done => server.close(done)); }
