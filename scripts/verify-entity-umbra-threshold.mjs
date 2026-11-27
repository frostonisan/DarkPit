import assert from 'node:assert/strict';
import { installEntityTestEnvironment } from './entity-test-environment.mjs';
await installEntityTestEnvironment();
const E = await import("../docs/js/entities/runtime.js");
const S = await import("../docs/js/entities/statSystem.js");
const R = await import("../docs/js/entities/rules.js");
const D = await import("../docs/js/ui/statistics/details.js");
const U = await import("../docs/js/entities/progression.js");
const Storage = await import("../docs/js/storage/gameStorage.js");
const { stats } = await import('../docs/js/data/statsData.js');
const keys = stats.filter(stat => stat.nature === 'umbra').map(stat => stat.key);
const map = value => Object.fromEntries(keys.map(key => [key, value]));
let checks = 0, id = 989400;
const eq = (actual, expected, label) => {
  assert.ok(Math.abs(actual - expected) < 1e-8, `${label}: ${actual} != ${expected}`); checks++;
};
const ok = (value, label) => { assert.ok(value, label); checks++; };
const fixture = (baseStats, seuilUmbra) => ({ id: ++id, name: 'Seuil Umbra', type: 'sbire', side: 'A', awakening: 3,
  level: { current: 1, max: 250 }, attacks: ['autoAttack'], stuff: {}, baseStats: { HP: 100, ...baseStats },
  ...(seuilUmbra == null ? {} : { seuilUmbra }) });
const recompute = (entity, equippedItems = []) => E.recomputeEntityStats(entity,
  { equippedItems, persistEquipment: false, skipReverseArchetype: true });
eq(keys.length, 27, 'All 27 current Umbras are covered');
for (const key of keys) ok(S.getPointLimitedStatKeys().includes(key), `${key}: registered for point acquisition`);

// A single owner setting applies independently to every Umbra, with no shared budget.
const ordinary = fixture(map(300)), unlocked = fixture(map(300), 300);
for (const [entity, expected] of [[ordinary, 165], [unlocked, 300]]) {
  recompute(entity);
  for (const key of keys) {
    eq(entity.stats[key], expected, `${key}: stored effective points`);
    eq(R.getSafe(entity, key), expected, `${key}: combat reader does not apply the threshold twice`);
    eq(S.getDirectingStatResult(entity, key).limit, entity.seuilUmbra, `${key}: helper reads the owner's threshold`);
    eq(entity.baseStats[key], 300, `${key}: raw acquisition is retained`);
  }
}
eq(ordinary.seuilUmbra, 150, 'New entity receives its own default threshold');
unlocked.seuilUmbra = 450;
recompute(unlocked); recompute(ordinary);
for (const key of keys) eq(ordinary.stats[key], 165, `${key}: another entity's unlock has no effect`);
unlocked.seuilUmbra = 300;

for (const threshold of [150, 300]) {
  // Base, level, archetype and invested points use the same natural acquisition bucket.
  const leveled = fixture(map(threshold - 10), threshold);
  leveled.modifierStats = { durable: { level: map(10), archetype: map(10), statLeveled: map(10) } };
  recompute(leveled);
  for (const key of keys) eq(leveled.stats[key], threshold + 2, `${key}: natural overflow retains 10%`);

  // Real equipment sources, including the old Umbras, use external overflow once.
  // Neutralize Orfevre amplification to isolate the acquired 20 equipment points.
  const equipped = fixture({ ...map(threshold - 10), weaponOrfevre: -1000, weaponOrfevrePlus: 1 }, threshold);
  const item = { equippedId: `e-threshold-${threshold}`, equippedTo: equipped.id, itemId: 'i-threshold', itemType: ['stuff'],
    Stuffeffets: keys.map(stat => ({ type: 'stat-buff', stat, value: 20 })) };
  equipped.stuff.slot1 = [item.equippedId];
  recompute(equipped, [item]);
  for (const key of keys) eq(equipped.stats[key], threshold + 5, `${key}: equipment overflow retains 50%`);

  // Preview and committed level-up agree across the threshold, before generated effects.
  equipped.modifierStats.preview = { statLeveled: map(20) };
  U.ComputeStatPreview(equipped);
  const preview = structuredClone(equipped.modifierStats.preview.total);
  for (const key of keys) {
    eq(preview[key], threshold + 11, `${key}: level-up preview pools natural and equipment sources`);
    eq(equipped.stats[key], threshold + 5, `${key}: preview preserves stored points`);
  }
  equipped.modifierStats.durable.statLeveled = map(20);
  delete equipped.modifierStats.preview;
  recompute(equipped, [item]);
  for (const key of keys) eq(equipped.stats[key], preview[key], `${key}: committed level-up matches preview`);
  for (const key of Object.keys(S.STAT_SYSTEM_ORIGINS)) {
    const capacity = value => Number(value?.max ?? value ?? 0);
    eq(capacity(equipped.stats[key]), capacity(preview[key]), `${key}: generated effect matches preview`);
  }
  equipped.stuff.slot1 = [];
  recompute(equipped, [item]);
  for (const key of keys) eq(equipped.stats[key], threshold + 1, `${key}: unequip restores natural points`);

  const boosted = fixture(map(threshold), threshold);
  recompute(boosted);
  boosted.battleBoosts = Object.fromEntries(keys.map(key => [key, [{ mode: 'flat', value: 20 }]]));
  for (const key of keys) eq(R.getSafe(boosted, key), threshold + 10, `${key}: combat buff is external`);
  boosted.battleBoosts = Object.fromEntries(keys.map(key => [key, [{ mode: 'percent', value: 10 }]]));
  for (const key of keys) eq(R.getSafe(boosted, key), threshold * 1.05, `${key}: percent combat buff is external`);
  delete boosted.battleBoosts;
  for (const key of keys) eq(R.getSafe(boosted, key), threshold, `${key}: expired combat buff leaves no gain`);

  const crystal = fixture(map(threshold + 40), threshold);
  crystal.baseStatSources = { crystal: map(20) };
  crystal.modifierStats = { durable: { adminLevel: map(20) } };
  recompute(crystal);
  for (const key of keys) eq(crystal.stats[key], threshold + 32, `${key}: crystals retain 100% in addition to natural/external gains`);
  crystal.modifierStats.durable.adminLevel = map(-50);
  recompute(crystal);
  for (const key of keys) eq(crystal.stats[key], threshold - 10, `${key}: malus frees room and never discounts crystals`);
}

// Raising the owner limit extends normal acquisition and the existing curve for every directing stat.
for (const points of [10, 149, 150, 180, 300]) {
  const entity = fixture({ ...map(points), strength: 300, intelligence: 300, agility: 300 });
  recompute(entity);
  const before = Object.fromEntries(Object.keys(S.STAT_SYSTEM_ORIGINS).map(key => [key, S.getStatSystemResult(entity, key)]));
  entity.seuilUmbra = 300;
  recompute(entity);
  for (const attribute of ['strength', 'intelligence', 'agility']) eq(entity.stats[attribute], 300, `${attribute}: entity limit also governs attributes`);
  for (const [key, previous] of Object.entries(before)) {
    const next = S.getStatSystemResult(entity, key);
    if (!previous || !next) continue;
    ok(next.value >= previous.value, `${key}: unlock never lowers existing benefits at ${points} points`);
    if (next.progression) eq(next.progression.source.multiplier, S.getProgressiveRatio(next.umbra, next.origin, 300), `${key}: curve uses the raised owner limit`);
    if (next.progression) {
      eq(next.progression.limit, 300, `${key}: progression helper uses the owner threshold`);
      ok(next.progression.source.note.includes('Seuil 300'), `${key}: detailed threshold is accurate`);
    }
  }
}
eq(S.calculateStatSources({ vision: 300 }, 'precision', { seuilUmbra: 300 }).umbra, 300, 'Standalone calculation accepts the owner threshold');
eq(S.calculateStatSources({ vision: 300 }, 'precision').umbra, 165, 'Standalone calculation defaults to 150');
eq(S.calculateStatSources({ precision: 1000 }, 'precision', { seuilUmbra: 300 }).value, 1000, 'Generated statistic scores have no acquisition threshold');

// The existing save round trip retains the owner's setting without a migration.
Storage.saveToLocalStorage('umbra-threshold-audit', unlocked);
const restored = Storage.loadFromLocalStorage('umbra-threshold-audit');
recompute(restored);
eq(restored.seuilUmbra, 300, 'Entity threshold survives save/reload');
for (const key of keys) eq(restored.stats[key], 300, `${key}: reload retains the unlocked threshold`);
for (const key of keys) {
  const displayed = D.calculateStatsDisplay(key, restored);
  ok(!/NaN|undefined/.test(displayed.helpContent), `${key}: helper handles unlocked values`);
}
console.log(`Entity Umbra threshold: ${checks} checks passed across ${keys.length} Umbras.`);
