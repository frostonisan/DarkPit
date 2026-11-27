import assert from 'node:assert/strict';
import { installEntityTestEnvironment } from './entity-test-environment.mjs';
await installEntityTestEnvironment();
const E = await import('../docs/js/entities/runtime.js');
const S = await import('../docs/js/entities/statSystem.js');
const D = await import('../docs/js/combat/statistics.js');
const UI = await import('../docs/js/ui/statistics/details.js');
const H = await import('../docs/js/data/helpers.js');
const { getStatEffectMaximum } = await import('../docs/js/data/balanceData.js');
const P = globalThis.umbraProgression;
let checks = 0;
const near = (a, b, message) => { assert.ok(Math.abs(a - b) < 1e-7, `${message}: ${a} / ${b}`); checks++; };
const ok = (value, message) => { assert.ok(value, message); checks++; };
const recalculate = e => E.recomputeEntityStats(e, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
const entity = (i, strength = i, limit = Math.max(150, i)) => recalculate({ id: 998871, name: 'Indestructibilité', type: 'sbire',
  side: 'A', awakening: 3, level: 1, seuilUmbra: limit, attacks: ['autoAttack'], stuff: {},
  baseStats: { HP: 1000, indestructibility: i, strength, agility: 0, intelligence: 0 } });

for (const [points, chance, cooldown] of [[1, 1.0151486822794007, 4.984539694161932],
  [50, 43.298499839876065, 4.160347511916951], [150, 73.16245006657789, 3.24181626187962],
  [300, 88.31497797356828, 2.584493041749503], [1500, 98.32380819626428, 2.040703308874429]]) {
  const e = entity(points), ui = UI.calculateStatsDisplay('indestructibility', e);
  near(D.calculateIndestructibilityPercentFromEntity(e), chance, 'Approved single-source chance');
  near(D.calculateIndestructibilityCooldown(e).seconds, cooldown, 'Approved Force cooldown');
  near(ui.indestructibilityBonus, chance, 'Helper agrees with proc');
  near(ui.indestructibilityCooldown.seconds, cooldown, 'Helper agrees with deadline');
  near(ui.indestructibilityReductionTotal, D.caluclateIndestructibilityReductionTotal(e), 'Helper agrees with damage reduction');
  near(ui.hpBattleRegenPercent, D.calculateHpBattleRegenPercent(e), 'Helper agrees with regeneration');
  near(ui.hpBattleRegenAmount, D.calculateHpBattleRegenAmount(e), 'Helper shows rounded HP');
  const entries = ui.umbraPresentation.entries;
  assert.deepEqual(entries.filter(x => x.exclusive).map(x => x.stat).sort(), ['indestructibilityTotal', 'indestructibleSkin'].sort(), 'Cancellation and skin are exclusive passives'); checks++;
  ok(entries.filter(x => x.state === 'X').length === 1 && entries.find(x => x.state === 'X').stat === 'hpBattleRegen', 'Only generated regeneration has X');
  const parts = ui.umbraHelperCalculations.indestructibilityBonus.parts;
  ok(parts.length === 1 && parts[0].stat === 'indestructibility', 'Chance calculation contains no Force ratio');
  for (const key of ['indestructibilityBonus', 'indestructibilityReductionTotal', 'hpBattleRegenPercent']) {
    const model = ui.umbraHelperCalculations[key];
    near(model.parts.reduce((sum, p) => sum + p.value, 0), model.value, 'Calculation parts sum to actual output');
  }
}
const e = entity(150);
near(D.caluclateIndestructibilityReductionTotal(e), 15, 'Skin calibration');
near(D.calculateHpBattleRegenPercent(e), 15, 'Regeneration calibration');
near(D.calculateHpBattleRegenAmount(e), 150, 'HP return calibration');
near(D.calculateHpBattleRegenPercent(entity(1, 0)), 1, 'First point guarantees one percent');
const initialChance = D.calculateIndestructibilityPercentFromEntity(e), initialCD = D.calculateIndestructibilityCooldown(e).seconds;
e.baseStats.strength = 0; recalculate(e);
near(D.calculateIndestructibilityPercentFromEntity(e), initialChance, 'Force cannot affect cancellation chance');
near(D.calculateIndestructibilityCooldown(e).seconds, 5, 'No Force keeps five seconds');
e.baseStats.strength = 150; e.baseStats.intelligence = 15000; e.baseStats.agility = 15000; recalculate(e);
near(D.calculateIndestructibilityPercentFromEntity(e), initialChance, 'Other attributes cannot affect chance');
near(D.calculateIndestructibilityCooldown(e).seconds, initialCD, 'Other attributes cannot affect cooldown');
e.seuilUmbra = 1500; recalculate(e);
near(D.calculateIndestructibilityPercentFromEntity(e), initialChance, 'Raising the limit does not stretch the first cycle');
const growth = entity(300), high = entity(1500), limited = entity(1500, 1500, 150);
ok(D.caluclateIndestructibilityReductionTotal(growth) > 15 && D.calculateHpBattleRegenPercent(growth) > 15, 'Both former bars continue beyond 150');
ok(D.caluclateIndestructibilityReductionTotal(high) > D.caluclateIndestructibilityReductionTotal(limited), 'Owner limit controls normal progression');
for (const [source, expected] of [['natural', 165], ['equipment', 225], ['crystal', 300]]) {
  const input = source === 'natural' ? S.calculateStatPointLimit(300, 0, 0, 150)
    : source === 'equipment' ? S.calculateStatPointLimit(150, 150, 0, 150) : S.calculateStatPointLimit(150, 0, 150, 150);
  near(input.value, expected, source + ' crossing applies the shared point rules');
  const model = S.calculateStatSources({ indestructibility: input.value, strength: 150 }, 'hpBattleRegen', { effective: true, seuilUmbra: 150 });
  ok(model.value > 15 && model.value < 99, source + ' overflow still progresses');
}
const absent = entity(0, 150);
near(D.calculateIndestructibilityPercentFromEntity(absent), 0, 'Force alone cannot cancel damage');
near(D.caluclateIndestructibilityReductionTotal(absent), 0, 'Force alone cannot activate skin');
near(D.calculateHpBattleRegenPercent(absent), 0, 'Force alone cannot regenerate');
ok(!Object.hasOwn(absent.stats, 'hpBattleRegen'), 'No inactive regeneration field is added to stored stats');
absent.baseStats.hpBattleRegen = 10; recalculate(absent);
near(D.calculateHpBattleRegenPercent(absent), 10, 'Normal autonomous bonus is fixed');
ok(S.getStatSystemResult(absent, 'hpBattleRegen').state === 'normal', 'Normal state');
absent.baseStats.hpBattleRegenPlus = 5; recalculate(absent);
const fixedForce = D.calculateHpBattleRegenPercent(absent);
ok(fixedForce > 15 && S.getStatSystemResult(absent, 'hpBattleRegen').state === '+', 'Plus unlocks fixed Force reinforcement');
const previousCurve = P.progression.curves.strength;
P.progression.curves.strength = { gainPercent: 170 };
near(D.calculateHpBattleRegenPercent(absent), fixedForce, 'Autonomous Plus ignores progressive curve edits');
e.baseStats.indestructibility = 150; recalculate(e);
ok(D.calculateHpBattleRegenPercent(e) > 15, 'Active Umbra reads Force curve changes immediately');
P.progression.curves.strength = previousCurve;
recalculate(e); near(D.calculateHpBattleRegenPercent(e), 15, 'Configuration restoration is immediate');
e.baseStats.hpBattleRegen = 10; e.baseStats.hpBattleRegenPlus = 5; recalculate(e);
near(D.calculateHpBattleRegenPercent(e), 30, 'Normal, Plus and generated regeneration each count once');
const model = S.buildStatSystemModel(S.getStatSystemResult(e, 'hpBattleRegen'), e);
near(model.contributions.reduce((sum, part) => sum + part.value, 0), 30, 'Source contributions reconcile');
near(S.getStatSystemSourceTotals(e, 'hpBattleRegen').reduce((sum, source) => sum + source.value, 0), 30, 'Source attribution reconciles');
const regenEntry = ui => ui.umbraPresentation.entries.find(entry => entry.stat === 'hpBattleRegen');
for (const [normal, plus, expectedTotal] of [[50, 0, 65], [50, 5, 70]]) {
  e.baseStats.hpBattleRegen = normal; e.baseStats.hpBattleRegenPlus = plus; recalculate(e);
  const ui = UI.calculateStatsDisplay('indestructibility', e), entry = regenEntry(ui);
  near(entry.value, 15, 'Umbra card excludes autonomous Normal and Plus bonuses');
  near(entry.total.value, expectedTotal, 'Entity total retains all regeneration sources');
  const calculation = ui.umbraHelperCalculations.hpBattleRegenPercent;
  near(calculation.value, 15, 'Inline calculation explains only the Umbra contribution');
  ok(calculation.parts.every(part => ['indestructibility', 'strength'].includes(part.stat)), 'No external source in inline calculation');
  for (const admin of [false, true]) {
    const helper = H.buildUmbraEntryExplanation(entry, ui, { admin });
    ok(helper.includes('Total Umbra') && helper.includes('Total de l’entité') && helper.includes(expectedTotal + ' %'), 'Helper distinguishes Umbra bonus and entity total');
    ok(helper.includes(expectedTotal * 10 + ' HP'), 'Helper keeps actual total HP restored');
  }
  near(UI.calculateStatsDisplay('hpBattleRegen', e).displayValue, expectedTotal, 'Entity statistic still displays total');
}
const inactiveUI = UI.calculateStatsDisplay('indestructibility', absent);
near(regenEntry(inactiveUI).value, 0, 'Inactive Umbra grants no regeneration despite autonomous sources');
near(regenEntry(inactiveUI).total.value, fixedForce, 'Inactive Umbra helper retains autonomous total');
e.baseStats.hpBattleRegen = 1000; recalculate(e);
near(D.calculateHpBattleRegenPercent(e), 99, 'Autonomous bonuses respect total cap');
near(D.calculateHpBattleRegenAmount(e), 990, 'Combat cannot heal more than 99 percent per trigger');
const cappedUI = UI.calculateStatsDisplay('indestructibility', e);
near(regenEntry(cappedUI).value, 15, 'External ceiling does not cap the displayed Umbra bonus');
ok(!cappedUI.helpContent.includes('MAX'), 'Entity ceiling is not presented as the Umbra ceiling');
ok(H.buildUmbraEntryExplanation(regenEntry(cappedUI), cappedUI).includes('MAX'), 'Entity ceiling renders MAX in the total helper');
const before = JSON.stringify(e);
const preview = UI.calculateStatsDisplay('indestructibility', e, 0);
near(preview.indestructibilityBonus, 0, 'Explicit zero preview disables cancellation');
near(preview.indestructibilityReductionTotal, 0, 'Explicit zero preview disables skin');
near(preview.indestructibilityCooldown.seconds, 5, 'Inactive preview has base cooldown');
near(regenEntry(preview).value, 0, 'Explicit zero preview has no Umbra regeneration');
ok(JSON.stringify(e) === before, 'Reading previews never mutates entity');
const distant = entity(1e8, 1e8, 1e8);
for (const value of [D.calculateIndestructibilityPercentFromEntity(distant), D.caluclateIndestructibilityReductionTotal(distant), D.calculateHpBattleRegenPercent(distant)]) {
  ok(value < 99 && value > 98.995, 'Asymptote remains below cap at finite points');
}
ok(UI.calculateStatsDisplay('indestructibility', distant).helpContent.includes('MAX'), 'Rounded asymptote renders MAX');
for (const key of ['indestructibilityBonus', 'indestructibilityReductionTotal', 'hpBattleRegenPercent']) near(getStatEffectMaximum(key), 99, 'Explicit shared ceiling');
ok(H.STAT_HELPER_DESCRIPTIONS.indestructibilityTotal.includes('armure') && H.STAT_HELPER_DESCRIPTIONS.hpBattleRegen.includes('deuxième'), 'Player descriptions state actual activation conditions');
console.log(`Indestructibility: ${checks} checks passed.`);
