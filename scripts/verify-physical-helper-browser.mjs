import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('docs'), output = resolve('outputs/physical-helper');
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
let browser, page;
const errors = [];
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  const checks = await page.evaluate(async () => {
    const E = await import("/js/entities/runtime.js"), S = await import("/js/entities/statSystem.js");
    const D = await import("/js/ui/statistics/details.js"), H = await import('/js/data/helpers.js');
    const UI = await import("/js/ui/statistics/helpers.js"), _UI = await import("/js/ui/codex/index.js"), U = await import("/js/entities/progression.js"), _U = await import("/js/ui/statistics/components.js");
    const G = await import("/js/storage/gameStorage.js");
    const checks = [];
    const check = (ok, label) => { if (!ok) throw Error(label); checks.push(label); };
    const equal = (a, b, label) => check(Math.abs(a - b) < 1e-6, `${label}: ${a} / ${b}`);
    const fixture = values => ({ id: 988186, name: 'Puissance physique', type: 'sbire', side: 'A', awakening: 1,
      level: { current: 1, max: 250 }, attacks: ['autoAttack'], stuff: {}, baseStats: { HP: 100, ...values } });
    const recompute = entity => E.recomputeEntityStats(entity, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
    const values = { strength: 10, intelligence: 10, agility: 10, physicalDamage: 15, physicalDamagePlus: 10, vigueur: 5,
      esprit: 3, finesse: 3, adresse: 3, brutality: 3, inflexion: 3, vivacite: 3, constitution: 3, integrite: 3 };
    const probe = fixture(values);
    probe.modifierStats = { durable: { statLeveled: { physicalDamage: 5 } } };
    recompute(probe);
    const expected = { normal: 20, plus: 10, umbra: 16 };
    const model = S.buildStatSystemModel(S.getStatSystemResult(probe, 'physicalDamage'), probe);
    equal(probe.stats.physicalDamage, 46, 'Player example combat value');
    for (const part of model.contributions) equal(part.value, expected[part.kind], `${part.kind} exclusive contribution`);
    const baseSource = D.getStatisticSourceTotals(probe, 'physicalDamage', D.calculateStatsDisplay('physicalDamage', probe));
    for (const [category, amount] of [['fixed', 20], ['plus', 10], ['umbra', 16]]) equal(baseSource.find(row => row.category === category).value, amount, `${category} source amount`);
    check(!baseSource.find(row => row.category === 'plus').calculations.improved.parts.some(part => part.stat === 'strength'), 'Autonomous plus remains direct when Umbra is present');
    check(baseSource.find(row => row.category === 'umbra').calculations.improved.parts.some(part => part.stat === 'strength'), 'Umbra owns the progressive Force ratio once');
    for (const normal of [0, 15, -40]) for (const plus of [0, 10, -2]) for (const vigueur of [0, 5, 3.3]) for (const strength of [0, 5, 10]) {
      const entity = fixture({ physicalDamage: normal, physicalDamagePlus: plus, vigueur, strength });
      recompute(entity);
      const before = JSON.stringify(entity);
      const row = S.calculateStatSources({ physicalDamage: normal, physicalDamagePlus: plus, vigueur, strength }, 'physicalDamage');
      const full = S.buildStatSystemModel(row, entity);
      const curve = n => 1 + .85 * (1 - Math.exp(-2.5*n/150)) / (1-Math.exp(-2.5));
      const expectedTotal = Math.max(0, normal + plus + (vigueur > 0 ? vigueur + Math.round(vigueur*curve(vigueur)) + Math.round(strength*.5*curve(strength)) : plus>0 ? Math.round(strength*.5) : 0));
      equal(row.value, expectedTotal, 'Vigueur grants its fixed PP and both independent progressive ratios');
      equal(full.contributions.reduce((sum, part) => sum + part.value, 0), row.value, 'Signed and rounded component sum');
      for (const part of full.contributions) equal(part.parts.reduce((sum, term) => sum + (term.operator === '−' ? -term.value : term.value), 0), part.value, 'Exclusive calculation matches its own amount');
      const totals = S.getStatSystemSourceTotals(entity, 'physicalDamage');
      equal(totals.reduce((sum, part) => sum + part.value, 0), row.value, 'Sources reconcile with actual result');
      const vig = D.calculateStatsDisplay('vigueur', entity).umbraHelperCalculations;
      equal(vig.generatedUmbraSource.value, full.contributions.find(part => part.kind === 'umbra').value, 'Vigueur helper excludes autonomous PP+');
      equal(vig.generatedUmbraSource.parts.reduce((sum, part) => sum + (part.operator === '−' ? -part.value : part.value), 0), vig.generatedUmbraSource.value, 'Complete Umbra calculation matches its displayed capacity');
      equal(vig.physicalDamageTotal.value, row.value, 'Vigueur separate total includes all contributions');
      check(JSON.stringify(entity) === before, 'Reading helpers never changes gameplay state');
    }
    const noPlus = fixture({ strength: 10, physicalDamage: 20, vigueur: 5 });
    recompute(noPlus);
    equal(D.calculateStatsDisplay('vigueur', noPlus).umbraHelperCalculations.generatedUmbraSource.value, 16, 'Without PP+, Vigueur owns Force once');
    const noUmbra = fixture({ strength: 10, physicalDamage: 20, physicalDamagePlus: 10 });
    recompute(noUmbra);
    equal(noUmbra.stats.physicalDamage, 35, 'Without Umbra, PP+ keeps its flat and Force');
    const resettable = fixture({ strength: 10, physicalDamage: 20, physicalDamagePlus: 10 });
    resettable.modifierStats = { durable: { statLeveled: { vigueur: 5 } } };
    recompute(resettable);
    equal(resettable.stats.physicalDamage, 46, 'Leveled Vigueur adds its fixed gift and progressive ratios');
    const reset = U.previewEntityReset(resettable);
    check(reset.ok, `Real progression reset succeeds: ${reset.message}`);
    equal(reset.projection.stats.physicalDamage, 35, 'Reset removes leveled Vigueur but preserves owned PP and PP+');
    equal(reset.projection.baseStats.physicalDamagePlus, 10, 'Standalone plus ownership survives reset');
    check(S.getStatSystemResult(reset.projection, 'physicalDamage').state === '+', 'Removing Vigueur removes X without losing plus');
    equal(resettable.stats.physicalDamage, 46, 'Reset preview leaves committed power unchanged');
    const P = await import('/js/items/permanentItems.js');
    check(!P.getPermanentStatChoices().some(choice => choice.key === 'physicalDamageX'), 'X cannot be granted as a standalone crystal stat');
    for (const [inputs, amounts, operators] of [
      [{ strength: 10, vigueur: 5, physicalDamage: 20 }, [16, 20], ['+']],
      [{ strength: 10, physicalDamagePlus: 10, physicalDamage: 20 }, [15, 20], ['+']],
      [{ strength: 10, vigueur: 5, physicalDamagePlus: 10, physicalDamage: -2 }, [16, 10, 2], ['+', '−']],
      [{ strength: 25, vigueur: 12 }, [42], []],
    ]) {
      const actor = fixture(inputs); recompute(actor);
      const row = S.getStatSystemResult(actor, 'physicalDamage');
      const detail = document.createElement('div');
      detail.innerHTML = H.buildAutonomousCalculationHelper(S.buildStatSystemModel(row, actor), '', 'Puissance physique');
      check(JSON.stringify([...detail.querySelectorAll('.helper-calculation-result')].map(node => Number(node.textContent.replace(/\s/g, '')))) === JSON.stringify(amounts), 'Detail contains only exclusive amounts, including negative contributions');
      check(JSON.stringify([...detail.querySelectorAll('[data-autonomous-operator]')].map(node => node.textContent)) === JSON.stringify(operators), 'Separate plus/minus lines retain the signs');
      check(!detail.querySelector('[data-autonomous-kind="total"], .helper-calculation-detail'), 'No total or formulas repeated in detail');
      const source = H.buildStatisticOrigins({ compact: true, totals: S.getStatSystemSourceTotals(actor, 'physicalDamage'), statName: 'Puissance physique' });
      detail.innerHTML = source;
      const sourceText = [...detail.querySelectorAll('template')].map(node => node.content.textContent).join('');
      check(!/Crystal|Dont/i.test(sourceText), 'Source formulas keep the current ratio subhelper without a separate Crystal category');
      if (inputs.strength === 25) {
        check(/12 × 1.*25 × 0\./.test(sourceText), 'Fractional source formula keeps the unchanged coefficients');
        check(!/\+\s*0.5/.test(sourceText), 'No artificial rounding correction in source equation');
      }
    }
    const umbraOnly = fixture({ strength: 10, vigueur: 10 }); recompute(umbraOnly);
    const summary = document.createElement('div');
    summary.innerHTML = H.buildAutonomousCalculationHelper(S.buildStatSystemModel(S.getStatSystemResult(umbraOnly, 'physicalDamage')), '', 'Puissance physique');
    check(!summary.querySelector('[data-autonomous-kind="normal"], [data-autonomous-kind="plus"], [data-autonomous-kind="base"]'), 'Umbra alone never invents base PP');
    check(!summary.querySelector('[data-autonomous-kind="total"]'), 'A single contribution does not repeat an identical total');
    equal(umbraOnly.stats.physicalDamage, 27, 'Umbra alone adds its fixed gift and both progressive ratios');
    const normalOnly = fixture({ strength: 10, physicalDamage: 15 }); recompute(normalOnly);
    summary.innerHTML = H.buildAutonomousCalculationHelper(S.buildStatSystemModel(S.getStatSystemResult(normalOnly, 'physicalDamage')), '', 'Puissance physique');
    check(summary.querySelectorAll('[data-autonomous-kind]').length === 1 && summary.querySelector('[data-autonomous-kind="normal"]'), 'Normal PP alone shows only its autonomous contribution');
    check(!summary.querySelector('.helper-calculation-detail'), 'One fixed amount is not repeated as its own calculation');
    const screenshotCase = fixture({ strength: 10, vigueur: 10, physicalDamagePlus: 10, physicalDamage: 10 });
    recompute(screenshotCase);
    const screenshotHelper = D.calculateStatsDisplay('vigueur', screenshotCase).umbraHelperCalculations;
    equal(screenshotHelper.generatedUmbraSource.value, 27, 'Screenshot case: Umbra supplies 10 gift + 11 Vigueur + 6 Force');
    equal(screenshotHelper.physicalDamageTotal.value, 47, 'Screenshot case: entity total is 47, no duplicated PP+');
    check(screenshotHelper.generatedUmbraSource.parts.some(part => part.stat === 'strength'), 'Force remains visible inside Vigueur despite autonomous PP+');
    const families = (await import('/js/data/balanceData.js')).balanceData.generatedUmbraStats.sources;
    for (const [source, cfg] of Object.entries(families)) for (const plus of [10, -2]) {
      const actor = fixture({ [source]: 10, [cfg.attribute]: 25, [cfg.target]: 5, [`${cfg.target}Plus`]: plus });
      recompute(actor);
      const before = JSON.stringify(actor), system = S.getStatSystemResult(actor, cfg.target);
      const helper = D.calculateStatsDisplay(source, actor).umbraHelperCalculations;
      const ability = S.buildStatSystemModel(system, actor).contributions.find(part => part.kind === 'umbra').value;
      equal(helper.generatedUmbraSource.value, ability, `${source}: ability excludes signed autonomous plus`);
      equal(helper.generatedUmbraSource.parts.reduce((sum, part) => sum + (part.operator === '−' ? -part.value : part.value), 0), ability, `${source}: formula reconciles after conversion or rounding`);
      equal(helper[`${cfg.target}Total`].contributions.reduce((sum, part) => sum + part.value, 0), system.value, `${source}: total attribution remains exclusive`);
      check(JSON.stringify(actor) === before, `${source}: helper changes no gameplay data`);
    }
    G.saveToLocalStorage('equippedItems', []); G.saveToLocalStorage('selectedArmyA', [probe]);
    E.entites.splice(0, E.entites.length, probe);
    window.__physicalHelpers = {
      setup(mode) {
        UI.closeOpenHelpers();
        document.body.innerHTML = '<div class="Game-helper"></div><main id="physical-audit" style="position:fixed;inset:0;background:#240000;overflow:auto"></main>';
        U.setPlayerExperience(1000000);
        const mount = document.getElementById('physical-audit');
        _UI.createCodexEntityScan(probe, mount, `codex-entity_${probe.id}`);
        mount.querySelector(`.codex-inner-menu:has(.codex-${mode === 'Stats' ? 'stat' : 'soul'})`).click();
        if (mode === 'Stats') mount.querySelector('.section-content.stats [data-mode="stat"]').click();
        const entity = mode === 'Stats' ? probe : UI.helperEntityByRoot.get(mount.querySelector('.level-up-section'));
        if (mode === 'Preview') {
          entity.modifierStats.preview = { statLeveled: { strength: 2, vigueur: 1 } };
          _U.refreshActiveStatPreview(entity, mount);
        }
        this.entity = entity;
        return S.getStatSystemResult(entity, 'physicalDamage').value;
      },
      showUmbra(key) {
        UI.closeOpenHelpers();
        const mount = document.getElementById('physical-audit');
        const toggle = mount.querySelector('.section-content.stats [data-mode="umbra"]');
        if (toggle) toggle.click();
        let host = [...mount.querySelectorAll(`.stat-container[data-stat="${key}"]`)].find(node => node.getClientRects().length);
        if (!host) {
          host = document.createElement('div'); host.className = 'stat-container'; host.dataset.stat = key;
          host.innerHTML = `<span class="stat-name">${key}</span>`; mount.append(host);
          UI.bindHelperEntity(host, this.entity);
        }
        host.dataset.physicalTest = key;
      },
    };
    return checks;
  });
  for (const mode of ['Stats', 'Level up', 'Preview']) {
    const total=await page.evaluate(mode=>window.__physicalHelpers.setup(mode),mode);
    await page.evaluate(()=>window.__physicalHelpers.showUmbra('vigueur'));
    await page.locator('[data-physical-test="vigueur"]').click();
    const card=page.locator('[data-umbra-pinned="true"]');
    assert.match(await card.innerText(), /Umbra d’attaque de Force niveau 1/);
    assert.match(await card.locator('.short-descri').innerText(), /Confère \+(5|6)\s*,\s*\+(5|6)/);
    const model=await card.evaluate(node=>({total:node._umbraCalculations.physicalDamageTotal.value,ratio:node._umbraCalculations.generatedUmbraRatio.value,own:node._umbraCalculations.physicalDamageTotal.contributions.find(p=>p.kind==='umbra').value}));
    assert.equal(model.total,total);
    assert.equal(Number((await card.locator('[data-umbra-section="capacity"] .helper-calculation-result').innerText()).replace(/[^0-9.]/g,'')),model.ratio);
    const anchor=card.locator('[data-umbra-calculation="physicalDamageTotal"]');
    assert.equal(Number((await anchor.innerText()).replace(/[^0-9.]/g,'')),model.own);
    await anchor.focus();
    const detail=page.locator('[data-umbra-detail]');
    assert.match(await detail.innerText(),new RegExp('Total de l’entité :\\s*'+total));
    for(const ratio of await card.locator('[data-helper-ratio]').all()) {
      const raw=Number(await ratio.getAttribute('data-ratio-value'));
      assert.equal(Number((await ratio.innerText()).replace(',','.')),Math.round(raw*10)/10);
    }
    checks.push(mode+': current Umbra grant, ratios and complete entity breakdown');
  }
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ checks, errors }, null, 2));
  console.log(`PASS ${checks.length} physical helper checks`);
} catch (error) {
  if (page) await page.screenshot({ path: resolve(output, 'failure.png') }).catch(() => {});
  throw error;
} finally { if (browser) await browser.close(); server.close(); }
