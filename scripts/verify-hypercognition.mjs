import assert from 'node:assert/strict';
import { installEntityTestEnvironment } from './entity-test-environment.mjs';
await installEntityTestEnvironment();
const E = await import('../docs/js/entities/runtime.js');
const S = await import('../docs/js/entities/statSystem.js');
const D = await import('../docs/js/combat/statistics.js');
const UI = await import('../docs/js/ui/statistics/details.js');
const I = await import('../docs/js/items/essenceInventory.js');
const P = globalThis.umbraProgression;
let checks = 0;
const eq = (a, b, message) => { assert.ok(Math.abs(a - b) < 1e-6, `${message}: ${a} != ${b}`); checks++; };
const ok = (value, message) => { assert.ok(value, message); checks++; };
const recalculate = e => E.recomputeEntityStats(e, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
const fixture = (h, intelligence = h, limit = 150) => recalculate({ id: 988831, name: 'Hypercognition', type: 'sbire', side: 'A', awakening: 3,
  level: 1, seuilUmbra: limit, attacks: ['autoAttack'], stuff: {}, baseStats: { HP: 1000, hypercognition: h, intelligence } });

for (const [h, explosion, essences] of [[1, 3, 1], [50, 164, 2], [100, 363, 6], [150, 567, 10], [300, 1515, 10], [1500, 22875, 10]]) {
  const e = fixture(h, h, Math.max(150, h));
  eq(D.calculateCognitiveExplosionTotal(e), explosion, 'Approved explosion calibration');
  eq(I.calculateCognitiveEssenceCount(e), essences, 'Approved generator calibration');
  eq(D.calculateHypercognitionBonus(e), explosion, 'Fallback adapter agrees with the source system');
  const detail = UI.calculateStatsDisplay('hypercognition', e);
  eq(detail.hypercognitionBonus, explosion, 'Card reads the engine');
  eq(detail.hypercognitionEssences, essences, 'Card count agrees with inventory');
  eq(detail.umbraHelperCalculations.cognitiveExplosionTotal.value, explosion, 'Complete contribution includes direct and reinforcement');
  eq(S.getStatSystemSourceTotals(e, 'cognitiveExplosion').reduce((sum, part) => sum + part.value, 0), explosion, 'Source attribution is exhaustive');
  ok(/class="cognitiveExplosion" data-stat-state="X"/.test(detail.helpContent), 'Only the strengthened damage has X state');
  ok(!/class="cognitiveGenerator" data-stat-state="X"/.test(detail.helpContent), 'The whole essence count has no invented X');
  ok(!detail.helpContent.includes('dégâts magiques'), 'The description preserves attack nature');
}
const milestonePoints = [1, 39, 54, 69, 83, 96, 110, 123, 137, 150];
for (const [index, points] of milestonePoints.entries()) {
  eq(I.calculateHypercognitionEssenceCount(points), index + 1, 'Milestone follows the shared curve');
  eq(I.calculateHypercognitionEssenceCount(points - 1), index, 'Previous whole point has not crossed the milestone');
}
eq(I.calculateHypercognitionEssenceCount(.99), 0, 'No essence before the first full point');
eq(I.calculateHypercognitionEssenceCount(-10), 0, 'Negative points generate no objects');
const explicit = fixture(150, 10);
const original = JSON.stringify(explicit);
for (const [points, expected] of [[0, 0], [1, 8], [150, 434]]) {
  const preview = UI.calculateStatsDisplay('hypercognition', explicit, points);
  eq(preview.hypercognitionBonus, expected, 'Explicit preview amount');
  eq(preview.umbraHelperCalculations.cognitiveExplosionTotal.value, expected, 'Explicit preview card uses the same projected points');
}
ok(JSON.stringify(explicit) === original, 'Explicit preview does not mutate the entity');

const raised = fixture(300, 300);
const before = D.calculateCognitiveExplosionTotal(raised);
eq(S.getDirectingStatResult(raised, 'hypercognition').value, 165, 'Natural points beyond the limit retain ten percent');
raised.seuilUmbra = 1500;
eq(D.calculateCognitiveExplosionTotal(raised), 1515, 'Changing the owner limit is immediately reflected');
ok(D.calculateCognitiveExplosionTotal(raised) > before, 'Raised limit restores normal curve growth');
eq(P.getProgressiveRatio(150, 'hypercognition', 1500), 1.85, 'Raising the limit does not stretch the cycles');
eq(P.getProgressiveRatio(300, 'hypercognition', 1500), 2.7, 'Ratios continue beyond the first cycle');
ok(P.getProgressiveRatio(151, 'hypercognition', 150) > 1.85, 'Beyond-limit progression is residual, not frozen');

for (const [source, expected] of [['natural', 165], ['external', 225], ['crystal', 300]]) {
  const e = fixture(source === 'natural' ? 300 : 150, 20);
  if (source === 'external') e.battleBoosts = { hypercognition: [{ mode: 'flat', value: 150, source: 'Test' }] };
  if (source === 'crystal') { e.baseStats.hypercognition = 300; e.baseStatSources = { crystal: { hypercognition: 150 } }; }
  recalculate(e);
  eq(S.getDirectingStatResult(e, 'hypercognition').value, expected, `Overflow from ${source} is applied once`);
  eq(D.calculateCognitiveExplosionTotal(e), P.hypercognitionExplosionDetails(expected, 20, 150).value, 'Effects consume retained points');
}
const limited = fixture(150, 20, 50);
I.syncEntityEssenceRewards(limited);
const owned = () => limited.attackEssenceInventory.linkedItems.filter(item => item.hyperco);
const lowIds = owned().map(item => item.id);
const lowCount = owned().length;
limited.seuilUmbra = 150;
recalculate(limited); I.syncEntityEssenceRewards(limited);
eq(owned().length, 10, 'Raising the limit reconciles actual owned essences');
ok(lowIds.every(id => owned().some(item => item.id === id)), 'Existing essence identities survive growth');
limited.modifierStats.preview = { statLeveled: { hypercognition: -150 } };
eq(I.calculateCognitiveEssenceCount(limited), 0, 'Preview uses projected points');
I.syncEntityEssenceRewards(limited);
eq(owned().length, 10, 'Preview never revokes committed inventory');
delete limited.modifierStats.preview;
limited.seuilUmbra = 50;
recalculate(limited); I.syncEntityEssenceRewards(limited);
eq(owned().length, lowCount, 'Lowering the limit revokes excess ranks');
const restored = JSON.parse(JSON.stringify(limited));
I.syncEntityEssenceRewards(restored);
assert.deepEqual(restored.attackEssenceInventory.linkedItems.filter(item => item.hyperco).map(item => item.id), lowIds); checks++;

const autonomous = fixture(100, 20);
autonomous.baseStats.cognitiveGenerator = 5;
autonomous.baseStats.cognitiveExplosion = 7;
autonomous.baseStats.cognitiveExplosionPlus = 3;
recalculate(autonomous);
eq(I.calculateCognitiveEssenceCount(autonomous), 10, 'Autonomous and Umbra essences share the ceiling');
eq(D.calculateCognitiveExplosionTotal(autonomous), D.calculateHypercognitionBonus(autonomous) + 10, 'Autonomous sources do not change Umbra coefficients');
const parts = S.getStatSystemSourceTotals(autonomous, 'cognitiveExplosion');
eq(parts.reduce((sum, part) => sum + part.value, 0), D.calculateCognitiveExplosionTotal(autonomous), 'Mixed sources are counted once');
eq(UI.calculateStatsDisplay('cognitiveExplosion', autonomous).cognitiveExplosionAutonomous, 10, 'Attack helper does not repeat the generated total as an autonomous source');
autonomous.archetypeFrozen = true;
eq(I.calculateCognitiveEssenceCount(autonomous), 5, 'Restricted Umbra preserves autonomous generator');
eq(D.calculateHypercognitionBonus(autonomous), 0, 'Restricted Umbra produces no damage');

const cfg = P.hypercognition.essences;
const ratio = cfg.ratio;
try {
  cfg.ratio = ratio / 2;
  eq(I.calculateHypercognitionEssenceCount(150), 5, 'Configuration edits immediately change generator ratios');
  eq(UI.calculateStatsDisplay('hypercognition', fixture(150)).hypercognitionEssences, 5, 'Helpers share live configuration');
} finally { cfg.ratio = ratio; }
console.log(`${checks} Hypercognition checks passed.`);
