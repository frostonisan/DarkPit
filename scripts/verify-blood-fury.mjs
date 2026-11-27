import assert from 'node:assert/strict';
import { installEntityTestEnvironment } from './entity-test-environment.mjs';
await installEntityTestEnvironment();
const E = await import('../docs/js/entities/runtime.js');
const S = await import('../docs/js/entities/statSystem.js');
const D = await import('../docs/js/combat/statistics.js');
const H = await import('../docs/js/ui/statistics/details.js');
const I = await import('../docs/js/items/permanentItems.js');
const { balanceData: B } = await import('../docs/js/data/balanceData.js');
const P = globalThis.umbraProgression;
let checks = 0;
const eq = (actual, expected, label) => { assert.ok(Math.abs(actual - expected) < 1e-8, `${label}: ${actual} != ${expected}`); checks++; };
const ok = (value, label) => { assert.ok(value, label); checks++; };
const recalc = e => E.recomputeEntityStats(e, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
const entity = (baseStats, seuilUmbra = 150) => {
  const e = { id: 989777, type: 'sbire', side: 'A', awakening: 3, seuilUmbra,
    level: { current: 1, max: 250 }, attacks: ['autoAttack'], stuff: {}, stats: {}, baseStats: { HP: 1000, ...baseStats } };
  recalc(e); return e;
};
const params = ['bloodFuryExecutionChance', 'bloodFuryTargetThreshold', 'bloodFuryExecutionDamage'];
for (const [points, limit, values] of [
  [150, 150, [80.13368983957218, 58.020063357972546, 33.44244984160507, 435]],
  [150, 1500, [80.13368983957218, 58.020063357972546, 33.44244984160507, 435]],
  [1500, 1500, [99 * 21375 / 21473, 99 * 7125 / 7223, 10 + 40 * 7125 / 7223, 595]],
]) {
  const e = entity({ bloodFury: points, strength: points, physicalDamage: 100 }, limit);
  for (const [i, key] of ['bloodThirsty', ...params].entries()) eq(e.stats[key], values[i], `${key} at ${points}/${limit}`);
  eq(D.calculateBloodThirstyPercent(e), e.stats.bloodThirsty, 'Combat lifesteal');
  eq(D.calculateBloodFuryExecutionPercent(e), e.stats.bloodFuryExecutionChance, 'Combat chance');
  eq(D.calculateBloodFuryTargetThreshold(e), e.stats.bloodFuryTargetThreshold, 'Combat threshold');
  eq(D.calculateExecutionDamage(e), e.stats.bloodFuryExecutionDamage, 'Combat extra damage');
}
eq(entity({ bloodThirsty: 12, strength: 150 }).stats.bloodThirsty, 12, 'Normal lifesteal has no ratio');
eq(entity({ strength: 150 }).stats.bloodThirsty, 0, 'Force alone gives no lifesteal');
eq(entity({ bloodThirstyPlus: 1, strength: 100 }).stats.bloodThirsty, 1 + 99 * 50 / 148, 'Autonomous + uses fixed 0.5');
eq(entity({ bloodThirsty: 200 }).stats.bloodThirsty, 99, 'Direct lifesteal cap');
for (const points of [0, 1, 10, 50, 150, 151, 1500]) for (const strength of [0, 10, 150, 1500]) {
  const e = entity({ bloodFury: points, strength, physicalDamage: 100, bloodThirsty: 3, bloodThirstyPlus: 2,
    ...Object.fromEntries(params.flatMap(key => [[key, 999], [`${key}Plus`, 999]])) }, 1500);
  const execution = P.bloodFuryExecutionDetails(points, strength, 100, 1500);
  eq(e.stats.bloodThirsty, P.bloodThirstyDetails(points, strength, 3, 2, undefined, 1500).value, 'No duplicate lifesteal grant');
  eq(e.stats.bloodFuryExecutionChance, execution.chance.percent, 'Autonomous chance input is ignored');
  eq(e.stats.bloodFuryTargetThreshold, execution.threshold.percent, 'Autonomous threshold input is ignored');
  eq(e.stats.bloodFuryExecutionDamage, execution.damage.value, 'Autonomous execution damage input is ignored');
  const before = JSON.stringify(e);
  const h = H.calculateStatsDisplay('bloodFury', e);
  ok(h.umbraPresentation.entries.filter(entry => entry.exclusive && !entry.passiveOf).length === 3, 'Three exclusive abilities');
  ok(params.every(key => h.umbraPresentation.entries.some(entry => entry.stat === key && entry.passiveOf === 'bloodExecution')), 'Three execution parameters');
  ok(h.umbraPresentation.entries.some(entry => entry.stat === 'bloodThirsty' && !entry.exclusive && entry.state === 'X'), 'Soif is an autonomous X row');
  for (const key of ['bloodThirsty', ...params]) {
    const row = S.getStatSystemResult(e, key), model = S.buildStatSystemModel(row, e);
    eq(model.contributions.reduce((sum, part) => sum + part.value, 0), row.value, 'Contributions reconcile');
    eq(model.parts.reduce((sum, part) => sum + part.value, 0), row.value, 'Calculation reconciles');
  }
  assert.equal(JSON.stringify(e), before, 'Helpers do not mutate the entity'); checks++;
  recalc(e);
  eq(e.stats.bloodThirsty, P.bloodThirstyDetails(points, strength, 3, 2, undefined, 1500).value, 'Recompute does not accumulate');
}
const e = entity({ bloodFury: 150, strength: 150, physicalDamage: 100, bloodThirsty: 7 });
e.modifierStats.preview = { statLeveled: { bloodFury: -150 } };
for (const key of params) eq(S.getStatSystemResult(e, key).value, 0, 'Preview withdrawal disables execution');
eq(D.calculateBloodThirstyPercent(e), 7, 'Preview preserves autonomous lifesteal');
e.modifierStats = {}; delete e.baseStats.bloodFury; recalc(e);
for (const key of params) eq(e.stats[key], 0, 'Withdrawal clears all stored parameters');
eq(e.stats.bloodThirsty, 7, 'Withdrawal preserves autonomous lifesteal');
e.baseStats.bloodFury = 150; recalc(e);
const incompatible = { combatFunction: 'Attaquant', attackRange: ['melee'], attackTarget: ['enemy'], deadTarget: ['no'],
  essenceSlots: [{ slotId: 'blood-test', kind: 'open', color: 'blue', essenceSource: 'test' }] };
const view = D.createAttackStatView(e, incompatible);
eq(D.calculateBloodFuryExecutionPercent(view), 0, 'Attack restriction disables execution');
eq(D.calculateBloodThirstyPercent(view), 7, 'Restricted attack keeps autonomous lifesteal');
const choices = I.getPermanentStatChoices();
ok(choices.some(choice => choice.key === 'bloodThirstyPlus'), 'Soif + available separately');
ok(!choices.some(choice => params.some(key => choice.key.startsWith(key))), 'Execution parameters are not autonomous item choices');
const settings = B.blood.furyExecution.threshold;
const original = settings.basePercent;
try {
  settings.basePercent = 20;
  ok(S.withStatReadSnapshot(() => D.calculateBloodFuryTargetThreshold(e)) > 33.44244984160507, 'Live configuration is read');
} finally { settings.basePercent = original; }
eq(D.calculateBloodFuryTargetThreshold(e), 33.44244984160507, 'No persistent stale configuration cache');
for (const amount of [1e6, 1e100, Number.MAX_VALUE]) {
  const result = P.bloodFuryExecutionDetails(amount, amount, 100, amount);
  ok(Number.isFinite(result.chance.percent) && result.chance.percent < 99, 'Chance finite below asymptote');
  ok(Number.isFinite(result.threshold.percent) && result.threshold.percent < 50, 'Threshold finite below asymptote');
  ok(Number.isFinite(result.damage.percent) && result.damage.percent < 600, 'Damage coefficient finite below asymptote');
}
console.log(`Fureur sanguinaire: ${checks} checks passed.`);
