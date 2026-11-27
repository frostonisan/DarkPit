import assert from 'node:assert/strict';
import { installEntityTestEnvironment } from './entity-test-environment.mjs';
await installEntityTestEnvironment();
const E = await import('../docs/js/entities/runtime.js');
const S = await import('../docs/js/entities/statSystem.js');
const UI = await import('../docs/js/ui/statistics/details.js');
const H = await import('../docs/js/data/helpers.js');
const { stats } = await import('../docs/js/data/statsData.js');
const { normalizeStatKey } = await import('../docs/js/entities/rules.js');
const umbras = stats.filter(stat => stat.nature === 'umbra');
assert.equal(umbras.length, 27);
let checks = 0;
const near = (a, b, message) => { assert.ok(Math.abs(a - b) < 1e-6, `${message}: ${a} / ${b}`); checks++; };
const sources = Object.keys(S.STAT_SYSTEM_ORIGINS);
const recompute = entity => E.recomputeEntityStats(entity, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
const makeEntity = (points, normal, plus) => recompute({ id: 998887, name: 'Contributions', type: 'sbire', side: 'A', awakening: 3,
  level: 30, seuilUmbra: 1500, attacks: ['autoAttack'], stuff: {}, baseStats: {
    ...Object.fromEntries(sources.flatMap(key => [[key, normal], [key + 'Plus', plus]])),
    ...Object.fromEntries(umbras.map(stat => [stat.key, points])),
    HP: 1000, strength: 50, intelligence: 50, agility: 50,
  } });
const text = html => html.replace(/<template\b[^>]*>[\s\S]*?<\/template>/g, '').replace(/<[^>]*>/g, '');
for (const [points, normal, plus] of [[50, 0, 0], [50, 7, 0], [50, 0, 5], [50, 7, 5], [0, 7, 5], [150, 1000, 1000]]) {
  const entity = makeEntity(points, normal, plus), before = JSON.stringify(entity);
  for (const { key } of umbras) {
    const ui = UI.calculateStatsDisplay(key, entity), p = ui.umbraPresentation;
    assert.ok(p?.entries.length, key + ': card exists');
    assert.doesNotMatch(text(ui.helpContent), /Total de l’entité/, key + ': entity total never appears on card');
    for (const entry of [...p.entries, ...p.detailEntries].filter(entry => entry.value != null)) {
      const label = `${key}/${entry.id} (${points}/${normal}/${plus})`;
      assert.ok(Number.isFinite(entry.total?.value), label + ': every value has an entity total');
      for (const admin of [false, true]) {
        const html = H.buildUmbraEntryExplanation(entry, ui, { admin });
        assert.equal((html.match(/class="helper-score-total"/g) || []).length, 1, label + ': exactly one entity total in either mode');
        assert.doesNotMatch(html, /NaN|undefined/, label);
        checks += 2;
      }
      const row = S.getStatSystemResult(entity, normalizeStatKey(entry.stat));
      const contribution = row && S.buildStatSystemModel(row, entity).contributions?.find(source => source.kind === 'umbra');
      if (!entry.component && row?.origin === key && contribution && entry.id !== 'astralBodyDuration' && entry.id !== 'astralBodyCheck') {
        near(entry.value, contribution.value, label + ': card uses only engine Umbra contribution');
        near(entry.total.value, row.value, label + ': hover retains all sources');
      }
      if (entry.component) {
        const parent = p.entries.find(parent => parent.stat === entry.stat);
        near(entry.total.value, parent.total.value, label + ': component shares the actual entity total');
      }
    }
    for (const gift of p.directGrants) {
      const entry = p.entries.find(entry => entry.stat === gift.stat);
      const reinforcement = p.detailEntries.find(detail => detail.id === entry.calculationId);
      near(gift.value + reinforcement.value, entry.value, key + ': fixed gift plus reinforcement equals total supplied by Umbra');
    }
  }
  assert.equal(JSON.stringify(entity), before, 'Reading every card and helper never changes entity state');
}
const e = makeEntity(50, 7, 5);
for (const key of ['criticalPower', 'astrality', 'indestructibility', 'vigueur', 'robustness']) {
  const p = UI.calculateStatsDisplay(key, e).umbraPresentation;
  const entry = p.entries.find(entry => entry.total?.system?.origin === key && !entry.exclusive);
  assert.ok(entry.value !== entry.total.value, key + ': external sources stay out of the card');
}
const retreat = UI.calculateStatsDisplay('vivacite', e);
const retreatEntry = retreat.umbraPresentation.entries.find(entry => entry.id === 'agileRetreat');
near(retreatEntry.value, retreat.umbraHelperCalculations.generatedUmbraSource.value, 'Retreat card only adds Vivacity velocity');
near(retreatEntry.total.value, globalThis.umbraProgression.retreatChance(S.getStatSystemResult(e, 'velocity').value), 'Retreat hover retains native and autonomous sources');
console.log(`Umbra contribution helpers: ${checks} checks, all ${umbras.length} Umbras, six source combinations.`);
