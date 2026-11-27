import assert from 'node:assert/strict';
import { installEntityTestEnvironment } from './entity-test-environment.mjs';
await installEntityTestEnvironment();
const E = await import('../docs/js/entities/runtime.js');
const S = await import('../docs/js/entities/statSystem.js');
const D = await import('../docs/js/combat/statistics.js');
const H = await import('../docs/js/ui/statistics/details.js');
const { balanceData: B } = await import('../docs/js/data/balanceData.js');
const P = globalThis.umbraProgression;
let checks = 0;
const eq = (actual, expected, label) => { assert.ok(Math.abs(actual - expected) < 1e-8, `${label}: ${actual} != ${expected}`); checks++; };
const ok = (value, label) => { assert.ok(value, label); checks++; };
const recalc = e => E.recomputeEntityStats(e, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
const entity = (ambi, agility, limit = 1500) => {
  const e = { id: 989778, type: 'sbire', side: 'A', awakening: 3, seuilUmbra: limit,
    level: { current: 1, max: 250 }, attacks: ['autoAttack'], stuff: {}, stats: {},
    baseStats: { HP: 1000, ambidextry: ambi, agility } };
  recalc(e); return e;
};
const table = [
  [1, 35, 20, 33.404056637000714],
  [10, 0, 12.4, 20.82317817207248],
  [10, 10, 16.42174408665271, 23.910096317344284],
  [50, 50, 56.44409981369455, 46.07910310535976],
  [100, 100, 74.54879353421452, 79.94793232103112],
  [150, 150, 82.02348653736821, 115],
  [500, 500, 96.28489651398122, 717.2775175400841],
  [1000, 1000, 98.17695827170364, 2365.425269156257],
  [1500, 1500, 98.60258277137731, 4898.378378378378],
];
for (const [ambi, agility, chance, damage] of table) {
  const e = entity(ambi, agility);
  eq(D.calculateAmbidextryTotalChance(e), chance, `Chance ${ambi}/${agility}`);
  eq(D.calculateAmbidextryDamageBonus(e), damage, `Damage ${ambi}/${agility}`);
  const before = JSON.stringify(e), detail = H.calculateStatsDisplay('ambidextry', e);
  eq(detail.ambidextryTotalChance, chance, 'Displayed chance');
  eq(detail.ambidextryDamageBonus, damage, 'Displayed damage');
  ok(detail.umbraPresentation.entries.length === 2 && detail.umbraPresentation.entries.every(entry => entry.exclusive && !entry.state && !entry.grant), 'Exactly two exclusive passives');
  for (const [id, expected] of [['ambidextryTotalChance', chance], ['ambidextryDamageBonus', damage]]) {
    const model = detail.umbraHelperCalculations[id];
    eq(model.value, expected, 'Helper result');
    eq(model.parts.reduce((sum, part) => sum + part.value, 0), expected, 'Helper contributions reconcile');
    ok(model.parts.every(part => !part.rounded), 'No old integer rounding of contributions');
    const entry = detail.umbraPresentation.entries.find(entry => entry.id === id);
    eq(entry.value, expected, 'Card value');
  }
  ok(detail.umbraPresentation.entries[1].maximum == null, 'Damage is uncapped');
  assert.equal(JSON.stringify(e), before, 'Helpers are read-only'); checks++;
}
const e = entity(150, 150, 150);
eq(D.calculateAmbidextryTotalChance(e), table[5][2], 'Normal threshold');
e.seuilUmbra = 1500; recalc(e);
eq(D.calculateAmbidextryTotalChance(e), table[5][2], 'Raising the limit does not renormalize existing points');
eq(D.calculateAmbidextryDamageBonus(e), 115, 'Damage calibration is fixed');
const damageBefore = D.calculateAmbidextryDamageBonus(e), chanceBefore = D.calculateAmbidextryTotalChance(e);
e.modifierStats.preview = { statLeveled: { agility: 100 } };
ok(D.calculateAmbidextryDamageBonus(e) > damageBefore, 'Agility preview increases damage immediately');
ok(D.calculateAmbidextryTotalChance(e) > chanceBefore, 'Agility preview increases chance immediately');
e.modifierStats.preview = { statLeveled: { ambidextry: -150 } };
eq(D.calculateAmbidextryTotalChance(e), 0, 'Preview withdrawal disables chance');
eq(D.calculateAmbidextryDamageBonus(e), 0, 'Preview withdrawal removes base damage too');
e.modifierStats = {}; e.baseStats.ambidextry = 0; recalc(e);
eq(D.calculateAmbidextryTotalChance(e), 0, 'Agility alone cannot trigger a second hit');
eq(D.calculateAmbidextryDamageBonus(e), 0, 'Agility alone gives no second-hit damage');
e.baseStats.ambidextry = 150; recalc(e);
const incompatible = { combatFunction: 'Attaquant', attackRange: ['melee'], attackTarget: ['enemy'], deadTarget: ['no'],
  essenceSlots: [{ slotId: 'ambi-test', kind: 'open', color: 'blue', essenceSource: 'test' }] };
const view = D.createAttackStatView(e, incompatible);
eq(D.calculateAmbidextryTotalChance(view), 0, 'Incompatible attack disables chance');
eq(D.calculateAmbidextryDamageBonus(view), 0, 'Incompatible attack disables second-hit damage');
const sourceBase = B.ambidextry.damage.ratios.source;
try {
  B.ambidextry.damage.ratios.source *= 2;
  eq(S.withStatReadSnapshot(() => D.calculateAmbidextryDamageBonus(e)), 135, 'Live balance changes are read');
} finally { B.ambidextry.damage.ratios.source = sourceBase; }
eq(D.calculateAmbidextryDamageBonus(e), 115, 'No persistent stale cache');
const agilityCurve = P.progression.curves.agility;
try {
  P.progression.curves.agility = { gainPercent: 170 };
  ok(D.calculateAmbidextryDamageBonus(e) > 115, 'Independent Agility curve is consumed');
} finally { P.progression.curves.agility = agilityCurve; }
eq(D.calculateAmbidextryDamageBonus(e), 115, 'Curve restoration is immediate');
ok(P.ambidextryChanceDetails(1e6, 1e6, 1e6).value < 99, 'Finite chance stays below 99%');
ok(P.ambidextryDamageDetails(3000, 3000, 3000).value > table.at(-1)[3], 'Damage continues beyond 1500 without a ceiling');
eq(P.ambidextryDamageDetails(0, 1500, 1500).value, 0, 'Pure calculation gates both passive contributions');
console.log(`Ambidextrie: ${checks} checks passed.`);
