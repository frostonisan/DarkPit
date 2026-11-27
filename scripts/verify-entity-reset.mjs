import assert from 'node:assert/strict';
import { installEntityTestEnvironment } from './entity-test-environment.mjs';

const environment = await installEntityTestEnvironment([['playerExperience', '100']]);
const { storage } = environment;

const statsApi = await import("../docs/js/entities/runtime.js");
const resetApi = await import("../docs/js/entities/progression.js");
const storageApi = await import("../docs/js/storage/gameStorage.js");
const xpApi = await import("../docs/js/entities/progression.js");
const { entitesNest } = await import("../docs/js/data/entityTemplates.js");
const { createLinkedEssenceItem } = await import("../docs/js/items/essenceInventory.js");
const { addFadedLife, consumeFadedLife, consumeRechargeableLife } = await import('../docs/js/items/resourceStocks.js');
let fixtureId = 800000;
function fixture(overrides = {}) {
  const entity = structuredClone(entitesNest[0]);
  entity.id = ++fixtureId;
  entity.level = { current: 1, baseMax: 100, max: 100 };
  entity.baseStats = {
    strength: 1, agility: 1, intelligence: 1, will: 20, HP: 20, vitality: 10,
    extraLife: 2, eternalLife: 1, fadedLife: 3, transcendence: 15, charge: 1,
  };
  Object.assign(entity, overrides);
  statsApi.enrichEntityStats(entity);
  return entity;
}
function save(key, value) { storageApi.saveToLocalStorage(key, value); }
function read(key) { return storageApi.loadFromLocalStorage(key); }

for (const [before, max, expected] of [
  [{ current: 50, max: 100 }, 150, 75],
  [{ current: 50, max: 100 }, 50, 25],
  [{ current: 100, max: 100 }, 150, 150],
  [{ current: 0, max: 100 }, 150, 0],
  [{ current: 1, max: 100 }, 1, 1],
  [{ current: 33, max: 100 }, 150, 50],
]) assert.equal(statsApi.rescaleHPCurrent(before, max), expected);
const health = fixture({ baseStats: { HP: 100, will: 20 }, reverseArchetype: undefined });
health.stats.HP.current = 50;
health.modifierStats.durable.level = { HP: 50 };
statsApi.recomputeEntityStats(health);
assert.deepEqual(health.stats.HP, { current: 75, max: 150 });
health.modifierStats.durable.level.HP = -50;
statsApi.recomputeEntityStats(health);
assert.deepEqual(health.stats.HP, { current: 25, max: 50 });
statsApi.recomputeEntityStats(health);
assert.deepEqual(health.stats.HP, { current: 25, max: 50 }, 'Repeated recomputation must not heal');
health.stats.HP.current = 0;
health.modifierStats.durable.level.HP = 100;
statsApi.recomputeEntityStats(health);
assert.deepEqual(health.stats.HP, { current: 0, max: 200 }, 'A max HP increase cannot resurrect');

for (const extraLife of [3, { current: 3, max: 3 }]) {
  const lives = fixture({ baseStats: { HP: 100, will: 20, extraLife }, reverseArchetype: undefined });
  for (const desiredMax of [6, 2, 1, 0, 4]) {
    lives.modifierStats.durable.adminLevel = { extraLife: desiredMax - 3 };
    statsApi.recomputeEntityStats(lives);
    assert.equal(lives.stats.extraLife?.max ?? 0, desiredMax, 'Admin can both increase and reduce native extra lives');
    assert.equal(Object.keys(lives.extraLifeRegen || {}).filter(key => /^\d{3}$/.test(key)).length, desiredMax,
      'Regeneration entries follow the reduced capacity');
    assert.ok((lives.stats.extraLife?.current ?? 0) <= desiredMax, 'Current lives never exceed the new maximum');
    const reloadedLives = JSON.parse(JSON.stringify(lives));
    statsApi.recomputeEntityStats(reloadedLives);
    assert.equal(reloadedLives.stats.extraLife?.max ?? 0, desiredMax, 'Extra life reductions survive reload and recomputation');
    if (desiredMax === 0) {
      assert.equal(lives.stats.extraLife, undefined);
      assert.equal(lives.extraLifeRegen, undefined, 'Zero capacity removes regeneration rather than restoring lives');
    }
  }
  lives.modifierStats.durable.adminLevel.extraLife = -10;
  statsApi.recomputeEntityStats(lives);
  assert.deepEqual(lives.stats.extraLife, { current: 0, max: 0 }, 'A negative source retains an empty, nonnegative life pool');
  assert.equal(lives.extraLifeRegen, undefined, 'Excess reduction leaves no regeneration slots');
  assert.equal(consumeRechargeableLife(lives, 'extraLife'), false, 'A negative source grants no usable life');
}
const generatedLives = fixture({ reverseArchetype: undefined });
const nativeLives = generatedLives.stats.extraLife.max;
generatedLives.modifierStats.durable.adminLevel = { extraLife: 1 - nativeLives };
statsApi.recomputeEntityStats(generatedLives);
assert.equal(generatedLives.stats.extraLife.max, 1, 'Admin reductions include native and transcendence lives');
console.log('Extra lives: native pools, signed admin modifiers, zero, regeneration cleanup and reload verified.');

for (const level of [1, 30, 35]) {
  const walletBefore = xpApi.playerExperience;
  const generated = fixture({ level: { current: level, baseMax: 100, max: 100 } });
  const expectedXP = statsApi.levelDetails
    .filter(row => row.level <= level)
    .reduce((sum, row) => sum + row.cost, 0);
  assert.equal(generated.experience, expectedXP, `Generated level ${level} must own its cumulative XP`);
  assert.equal(xpApi.playerExperience, walletBefore, 'Generation must not charge the player');
  statsApi.recomputeEntityStats(generated);
  statsApi.recomputeEntityStats(generated);
  assert.equal(generated.experience, expectedXP, 'Recomputation must not duplicate XP');
  const loaded = JSON.parse(JSON.stringify(generated));
  statsApi.recomputeEntityStats(loaded);
  assert.equal(loaded.experience, expectedXP, 'Generated XP must survive serialization and recomputation');
  const preview = resetApi.previewEntityReset(loaded);
  const refund = Math.floor(expectedXP * preview.refundPercent / 100);
  assert.equal(preview.refundXP, refund);
  assert.equal((await resetApi.resetEntityProgression(loaded)).refundXP, refund);
  assert.equal(loaded.experience, 0);
  assert.equal(xpApi.playerExperience, walletBefore + refund);
  assert.equal((await resetApi.resetEntityProgression(loaded)).refundXP, 0);
  console.log(`Generated level ${level}: ${expectedXP} XP, refund ${refund}, no repeated credit.`);
  xpApi.setPlayerExperience(walletBefore);
}

const entity = fixture();
entity.level.current = 12;
entity.experience = 1001;
entity.modifierStats.durable.statLeveled = { will: 65, vitality: 80, transcendence: 60, charge: 2 };
entity.modifierStats.durable.levelUpMeta = { source: 'manualLevelUp', confirmedLevel: 12, reverseBaseLevel: 1 };
statsApi.recomputeEntityStats(entity);
entity.stats.HP.current = 2;
entity.stats.extraLife.current = 0;
entity.stats.eternalLife.current = 0;
const fadedCount = entity.stats.fadedLife;
assert.equal(fadedCount, 3);
for (let i = 0; i < fadedCount; i++) assert.equal(consumeFadedLife(entity), true);
assert.equal(consumeFadedLife(entity), false, 'The faded life fixture exhausts its real stock');
for (const key of ['extraLifeRegen', 'eternalLifeRegen']) {
  Object.entries(entity[key]).forEach(([slot, value]) => { if (/^\d{3}$/.test(slot)) value.currentRegen = 0; });
}
entity.modifierStats.preview = { total: { will: 999 }, statLeveled: { strength: 7 } };
const nativeIds = entity.attackEssenceInventory.linkedItems.map(item => item.id);
const reward = createLinkedEssenceItem(entity.id, 'red', { provenance: { source: 'umbra-level-three' } });
const bound = createLinkedEssenceItem(entity.id, 'blue', { provenance: { source: 'universal-bound' } });
entity.attackEssenceInventory.linkedItems.push(reward, bound);
const other = fixture();
const untouched = JSON.stringify(other);
save('selectedArmyA', [entity, other]);
const runtime = structuredClone(entity);
window.selectedArmyA = [runtime, other];
statsApi.entites.push(entity, other);

const before = JSON.stringify(entity);
const beforeStorage = JSON.stringify([...storage]);
const beforeWrites = environment.writes;
const preview = resetApi.previewEntityReset(entity);
assert.equal(preview.ok, true);
assert.equal(preview.refundPercent, 115, 'Refund must use current committed will, without a cap');
assert.equal(preview.refundXP, 1151, 'Refund rounds down');
assert.equal(JSON.stringify(entity), before, 'Preview must not mutate its input');
assert.equal(JSON.stringify([...storage]), beforeStorage, 'Preview must not mutate storage');
assert.equal(environment.writes, beforeWrites, 'Even equipment lookup must remain read-only');
assert.deepEqual(preview.removedEssenceIds, [reward.id]);

const reset = await resetApi.resetEntityProgression(entity);
assert.equal(reset.ok, true);
assert.equal(xpApi.playerExperience, 1251);
assert.equal(entity.level.current, 1);
assert.equal(entity.experience, 0);
assert.equal(entity.modifierStats.preview, undefined);
assert.equal(entity.modifierStats.durable.levelUpMeta, undefined);
assert.equal(entity.stats.HP.current, entity.stats.HP.max);
assert.equal(entity.stats.extraLife.current, entity.stats.extraLife.max);
assert.equal(entity.stats.eternalLife.current, 1);
assert.equal(entity.stats.fadedLife, undefined);
assert.equal(entity.currentAttack, entity.attackDetails[0]);
assert.equal(entity.Archetype.achieve.length, 0);
assert.equal(entity.Archetype.current.step, 0);
assert.equal(entity.attackEssenceInventory.linkedItems.find(item => item.id === bound.id).state, 'available');
assert.equal(entity.attackEssenceInventory.linkedItems.some(item => item.id === reward.id), false);
assert(nativeIds.every(id => entity.attackEssenceInventory.linkedItems.some(item => item.id === id)));
assert.equal(runtime.level.current, 1, 'Existing runtime references must update in place');
assert.equal(runtime.modifierStats.preview, undefined);
assert.equal(JSON.stringify(other), untouched, 'Another entity must not change');
const reloaded = read('selectedArmyA')[0];
statsApi.recomputeEntityStats(reloaded);
assert.equal(reloaded.level.current, 1);
assert.equal(reloaded.stats.extraLife.current, reloaded.stats.extraLife.max);
assert.equal(reloaded.stats.eternalLife.current, 1);
assert.equal(reloaded.stats.fadedLife, undefined, 'Depleted faded lives must not reappear on recompute');
await resetApi.resetEntityProgression(entity);
assert.equal(xpApi.playerExperience, 1251, 'A second reset cannot refund spent XP twice');

const dead = fixture();
for (const marker of ['hp', 'flag', 'status']) {
  const target = structuredClone(dead);
  if (marker === 'hp') target.stats.HP.current = 0;
  if (marker === 'flag') target.isDEAD = true;
  if (marker === 'status') target.statut = ['dead'];
  const serialized = JSON.stringify(target);
  const writeCount = environment.writes;
  assert.equal(resetApi.previewEntityReset(target).ok, false);
  assert.equal((await resetApi.resetEntityProgression(target)).ok, false);
  assert.equal(JSON.stringify(target), serialized);
  assert.equal(environment.writes, writeCount);
}

const missingNative = fixture();
delete missingNative.nativeAttacks[0].essenceBaseProfile;
const missingBefore = JSON.stringify(missingNative);
assert.equal((await resetApi.resetEntityProgression(missingNative)).ok, false);
assert.equal(JSON.stringify(missingNative), missingBefore, 'Invalid native identities must reject before mutation');

const noRefund = fixture();
noRefund.experience = 100;
assert.equal(addFadedLife(noRefund, 2), 2);
assert.equal(noRefund.stats.fadedLife, 5);
const previousXP = xpApi.playerExperience;
const retainedFaded = noRefund.stats.fadedLife;
assert.equal((await resetApi.resetEntityProgression(noRefund, { refundExperience: false })).refundXP, 0);
assert.equal(noRefund.experience, 0);
assert.equal(noRefund.stats.fadedLife, retainedFaded);
statsApi.recomputeEntityStats(noRefund);
assert.equal(noRefund.stats.fadedLife, retainedFaded, 'Remaining faded charges survive recomputation above native count');
assert.equal(xpApi.playerExperience, previousXP);

const enemy = fixture({ side: 'B', level: { current: 35, baseMax: 100, max: 100 } });
const enemyCopy = structuredClone(enemy);
window.selectedArmyB = [enemyCopy];
save('ArmyB', { armies: { test: { entities: [enemy] } } });
const armyABefore = JSON.stringify(read('selectedArmyA'));
await resetApi.resetEntityProgression(enemy);
assert.equal(read('ArmyB').armies.test.entities[0].level.current, 1);
assert.equal(enemyCopy.level.current, 1);
assert.equal(JSON.stringify(read('selectedArmyA')), armyABefore, 'Resetting B must not insert into A');

const equipped = fixture();
equipped.level.current = 5;
equipped.modifierStats.durable.level = { charge: 2 };
equipped.modifierStats.durable.levelUpMeta = { source: 'manualLevelUp', confirmedLevel: 5, reverseBaseLevel: 1 };
statsApi.recomputeEntityStats(equipped);
const items = [1, 2, 3].map(i => ({
  itemId: `i2-reset-${i}`, equippedId: `e-reset-${i}`, equippedTo: equipped.id,
  itemType: ['stuff'], Stuffeffets: [{ type: 'stat-buff', stat: 'vitality', value: i }],
}));
save('equippedItems', items);
save('PlayerSave', { Playerinventory: [], equippedItems: items, items });
save('IngameItemsData', { Playerinventory: [], equippedItems: items, items });
equipped.stuff = { slot1: ['e-reset-1'], slot2: ['e-reset-2'], slot3: ['e-reset-3'] };
statsApi.recomputeEntityStats(equipped);
const gearStorage = JSON.stringify([...storage]);
const gearWrites = environment.writes;
const gearPreview = resetApi.previewEntityReset(equipped);
assert.deepEqual(gearPreview.returnedEquipmentIds, ['e-reset-3', 'e-reset-2']);
assert.equal(JSON.stringify([...storage]), gearStorage);
assert.equal(environment.writes, gearWrites);
await resetApi.resetEntityProgression(equipped);
assert.deepEqual(read('equippedItems').map(item => item.equippedId), ['e-reset-1']);
assert.deepEqual(read('PlayerSave').Playerinventory.map(item => item.itemId).sort(), ['i2-reset-2', 'i2-reset-3']);
assert.equal(equipped.stats.vitality, 11, 'Equipment that still fits remains effective');

function gearFixture(charge, effects, base = {}) {
  const target = fixture({ baseStats: { HP: 100, will: 20, charge, ...base }, reverseArchetype: undefined });
  const gear = effects.map((delta, index) => ({
    itemId: `i-curse-${target.id}-${index}`, equippedId: `e-curse-${target.id}-${index}`,
    equippedTo: target.id, displayName: `Curse test ${index}`, itemType: ['stuff'],
    Stuffeffets: Object.entries(delta).map(([stat, value]) => ({ type: 'stat-buff', stat, value })),
  }));
  save('equippedItems', gear);
  save('PlayerSave', { Playerinventory: [], equippedItems: gear, items: gear });
  save('IngameItemsData', { Playerinventory: [], equippedItems: gear, items: gear });
  target.stuff = Object.fromEntries(gear.map((item, i) => [`slot${i + 1}`, [item.equippedId]]));
  statsApi.recomputeEntityStats(target);
  return { target, gear };
}

const curse = gearFixture(3, [{ vitality: 1 }, { vitality: 2 }, { charge: -5, strength: -3 }], { strength: 3 });
assert.equal(curse.target.stats.charge, -2, 'Charge debt is not clamped');
assert.equal(curse.target.stats.strength, 0);
assert.deepEqual(curse.target.stuff, { slot3: [curse.gear[2].equippedId] }, 'Only the malus source slot is protected');
assert.deepEqual(read('PlayerSave').Playerinventory.map(i => i.itemId), [curse.gear[1].itemId, curse.gear[0].itemId], 'Surplus returns in descending slot order');
assert.equal(statsApi.getStatMalusSources(curse.target, 'strength')[0].id, curse.gear[2].equippedId);
for (const [bonus, expectedCharge, slotCount] of [[1, -1, 1], [2, 0, 1], [3, 1, 1], [4, 2, 2]]) {
  curse.target.modifierStats.durable.level = { charge: bonus };
  statsApi.recomputeEntityStats(curse.target);
  assert.equal(curse.target.stats.charge, expectedCharge);
  assert.equal(statsApi.getEquipmentSlotKeys(curse.target).length, slotCount, 'Protected slot consumes capacity, never grants extra space');
}
const curseReload = structuredClone(curse.target);
statsApi.recomputeEntityStats(curseReload);
assert.deepEqual(curseReload.stuff, curse.target.stuff);
assert.equal(read('PlayerSave').Playerinventory.length, 2, 'Repeated calculation cannot duplicate returned items');
curse.target.modifierStats.durable.level = { charge: -5 };
curse.target.stuff.slot3 = [];
statsApi.recomputeEntityStats(curse.target);
assert.deepEqual(curse.target.stuff, {}, 'Manually vacated protected slot disappears while capacity is negative');
assert.equal(statsApi.getStatMalusSources(curse.target, 'strength').length, 0);

const manyCurses = gearFixture(4, [{ charge: -3 }, { vitality: 1 }, { charge: -3 }, { vitality: 1 }]);
assert.deepEqual(statsApi.getEquipmentSlotKeys(manyCurses.target), ['slot1', 'slot3']);
assert.equal(manyCurses.target.stats.charge, -2);
assert.equal(read('PlayerSave').Playerinventory.length, 2);

const external = gearFixture(3, [{ vitality: 1 }, { vitality: 1 }, { vitality: 1 }]);
external.target.modifierStats.durable.level = { charge: -5 };
statsApi.recomputeEntityStats(external.target);
assert.deepEqual(external.target.stuff, {});
assert.equal(read('PlayerSave').Playerinventory.length, 3, 'External curse protects no equipment');

const indirect = gearFixture(1, [{ vitality: 1 }, { weaponMastery: -30 }], { weaponMastery: 30, strength: 1 });
assert.deepEqual(indirect.target.stuff, { slot2: [indirect.gear[1].equippedId] }, 'Indirect loss of generated Charge protects its source');

const recalc = gearFixture(2, [{ vitality: 1 }, { charge: 2 }, { vitality: 1 }, { vitality: 1 }]);
recalc.target.modifierStats.durable.level = { charge: -3 };
statsApi.recomputeEntityStats(recalc.target);
assert.deepEqual(recalc.target.stuff, {}, 'Removing a capacity bonus triggers another capacity calculation');
assert.equal(recalc.target.stats.charge, -1);
assert.equal(read('PlayerSave').Playerinventory.length, 4);

const purifyCurse = gearFixture(1, [{ vitality: 1 }, { charge: -4 }]);
assert.ok(purifyCurse.target.stuff.slot2);
const purified = resetApi.previewEntityReset(purifyCurse.target);
assert.ok(purified.returnedEquipmentIds.includes(purifyCurse.gear[1].equippedId), 'Purification explicitly removes surplus cursed equipment');

console.log('Charge verified: source protection, debt, multiple curses, descending returns, recalculation, reload, removal, and purification.');
console.log('Entity reset verified: preview purity, refunds, resources, essences, equipment, A/B persistence, and runtime references.');
