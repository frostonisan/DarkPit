import assert from 'node:assert/strict';
import { installEntityTestEnvironment } from './entity-test-environment.mjs';
await installEntityTestEnvironment();
const E = await import('../docs/js/entities/runtime.js');
const S = await import('../docs/js/entities/statSystem.js');
const D = await import('../docs/js/combat/statistics.js');
const UI = await import('../docs/js/ui/statistics/details.js');
const H = await import('../docs/js/data/helpers.js');
const { balanceData: B, getStatEffectMaximum } = await import('../docs/js/data/balanceData.js');
const { calculateEffectParameter } = await import('../docs/js/combat/effectParameters.js');
const P = globalThis.umbraProgression;
let checks = 0;
const eq = (actual, expected, label) => { assert.ok(Math.abs(actual - expected) < 1e-7, `${label}: ${actual} != ${expected}`); checks++; };
const ok = (condition, label) => { assert.ok(condition, label); checks++; };
const recompute = e => E.recomputeEntityStats(e, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
const entity = (baseStats = {}, limit = 150) => recompute({ id: 988221, name: 'Limites', type: 'sbire', side: 'A', awakening: 3,
  seuilUmbra: limit, level: { current: 1, max: 250 }, attacks: ['autoAttack'], stuff: {}, baseStats: { HP: 1000, ...baseStats } });

for (const [natural, other, crystal, expected] of [
  [10, -9, 0, 1], [10, -10, 0, 0], [10, -20, 0, -5], [-10, 0, 0, -1],
  [10, 0, -20, -10], [10, -20, 20, 10], [-20, 10, 0, -1], [0, -20, 10, -5],
  [150, 20, 0, 160], [170, 0, 0, 152], [150, 0, 20, 170], [180, -50, 0, 130],
]) eq(S.calculateStatPointLimit(natural, other, crystal).value, expected, 'Only the excess or underflow gets the source rate');

const keys = S.getPointLimitedStatKeys();
eq(keys.length, 30, '27 Umbras and 3 attributes share the owner limit');
for (const limit of [0, 150, 300, 1500]) {
  const e = entity(Object.fromEntries(keys.map(key => [key, limit + 20])), limit);
  for (const key of keys) {
    eq(S.getDirectingStatResult(e, key).value, limit + 2, `${key}: natural overflow at ${limit}`);
    eq(e.baseStats[key], limit + 20, `${key}: stored gains stay raw`);
  }
}
for (const [points, ratio] of [[150, 1.85], [300, 2.7], [1500, 9.5]]) {
  eq(S.getProgressiveRatio(points, 'strength', 1500), ratio, 'Existing cycles continue up to the owner limit');
}
const e = entity({ strength: 300, vigueur: 300 }, 150);
const old = S.getStatSystemResult(e, 'physicalDamage').value;
e.seuilUmbra = 1500;
eq(S.getDirectingStatResult(e, 'strength').value, 300, 'Changing the limit invalidates cached input immediately');
ok(S.getStatSystemResult(e, 'physicalDamage').value > old, 'Raised limit updates acquisition and ratio');
eq(calculateEffectParameter({ flat: 0, ratios: [{ stat: 'strength', coefficient: 1, curve: 'progressive' }] }, { default: 0 }, e),
  810, 'Parametric combat effects use the same owner curve');
e.modifierStats.preview = { statLeveled: { strength: 20 } };
eq(S.getDirectingStatResult(e, 'strength').value, 320, 'Preview uses the owner limit');
delete e.modifierStats.preview;
e.battleBoosts = { strength: [{ mode: 'flat', value: -320, source: 'Test' }] };
eq(S.getDirectingStatResult(e, 'strength').value, -10, 'Combat malus crosses zero only once');
const source = D.getStatContributions(e, 'strength').find(row => row.combat);
ok(source.underflow > 0 && source.improvementKind === 'external', 'Malus quality comes from its actual underflow');
const active = H.buildStatisticOrigins({ compact: true, totals: [], modifiers: [source] });
ok(active.includes('Malus supérieur') && active.includes('descendre grandement sous zéro'), 'Negative source helper explains its quality');
e.battleBoosts.strength[0].value = -300;
const zero = H.buildStatisticOrigins({ compact: true, totals: [], modifiers: D.getStatContributions(e, 'strength') });
ok(!zero.includes('Malus supérieur'), 'At exactly zero the negative quality is not active');
eq(S.getDirectingStatResult(e, 'strength').value, 0, 'Zero is the boundary');
e.battleBoosts.strength[0].value = -20;
eq(S.getDirectingStatResult(e, 'strength').value, 280, 'Ordinary malus above zero remains full strength');

for (const [kind, label] of [['standard', 'Bonus'], ['external', 'Bonus supérieur'], ['intense', 'Bonus exceptionnel']]) {
  ok(H.buildImprovementHelperFooter(kind, 'transcendence').includes(label), 'Every Umbra exposes its source quality');
  ok(H.buildImprovementHelperFooter(kind, 'intelligence').includes('limites de l’entité'), 'Attribute helper explains overflow');
  ok(!H.buildImprovementHelperFooter(kind, 'HP'), 'Ordinary HP has no entity point limit');
}
const crystal = entity({ strength: 170 });
crystal.baseStatSources = { crystal: { strength: 20 } };
eq(S.getDirectingStatResult(crystal, 'strength').value, 170, 'Crystal retains 100%');
const crystalSources = D.getStatContributions(crystal, 'strength');
eq(crystalSources.reduce((sum, row) => sum + row.value, 0), 170, 'Crystal provenance does not duplicate points');
ok(crystalSources.some(row => row.improvementKind === 'intense' && row.value === 20), 'Crystal quality remains identifiable');

const capEntity = entity({ physicalPen: 1000, magicalPen: 1000, transcendenceTotal: 1000, bloodFuryExecutionChance: 1000,
  bloodFuryTargetThreshold: 1000, cognitiveGenerator: 100, marathon: 1000, trailer: 1000, ambidextry: 1000, agility: 1000 });
for (const key of ['physicalPen', 'magicalPen', 'transcendenceTotal', 'marathon', 'trailer']) {
  eq(S.getStatSystemResult(capEntity, key).value, 99, `${key}: explicit old 100% ceiling is now 99%`);
}
for (const key of ['bloodFuryExecutionChance', 'bloodFuryTargetThreshold']) {
  eq(S.getStatSystemResult(capEntity, key).value, 0, `${key}: inactive without Fureur despite direct inputs`);
}
ok(D.calculateAmbidextryTotalChance(capEntity) > 0 && D.calculateAmbidextryTotalChance(capEntity) < 99,
  'Progressive double attack approaches its 99% asymptote');
eq(P.retreatChance(65), 99, 'Retreat caps at 99%');
eq(S.getStatSystemResult(capEntity, 'cognitiveGenerator').value, 10, 'Non-percentage ceiling is unchanged');
eq(B.astrality.astralReturn.maxPercent, 99, 'Astral healing asymptote is 99%');
eq(B.resistance.reductionCurve.maxPercent, 99, 'Resistance asymptote is 99%');
ok(P.resistanceReductionRatio(Number.MAX_VALUE) < .99, 'Finite resistance stays strictly below its asymptote');
ok(H.statMaximumLabel(98.999, 99) === 'MAX', 'Visible rounding permits MAX');
ok(H.statMaximumLabel(98.994, 99) === '', 'Below rounding boundary no MAX');
ok(H.statMaximumLabel(1e20, undefined) === '', 'No explicit ceiling means no MAX');
ok(getStatEffectMaximum('physicalDamage') === undefined && getStatEffectMaximum('HP') === undefined, 'No invented total ceilings');
const high = entity({ criticalPower: 1e9, agility: 1e9, vitality: 1e9, astrality: 1e9, strength: 1e9 }, 1e9);
const chance = S.getStatSystemResult(high, 'criticalChance').value;
ok(chance < 99 && H.statMaximumLabel(chance, 99) === 'MAX', 'MAX does not alter the real asymptotic chance');
const vitality = UI.calculateStatsDisplay('vitality', high);
ok(vitality.helpContent.includes('>MAX<'), 'Capped HP contribution displays MAX');
ok(!UI.calculateStatsDisplay('HP', high).helpContent.includes('>MAX<'), 'The full HP reserve remains uncapped');
ok(UI.calculateStatsDisplay('astrality', high).helpContent.includes('>MAX<'), 'Astral effect cards display their ceiling');
console.log(`Entity limits: ${checks} checks passed.`);
