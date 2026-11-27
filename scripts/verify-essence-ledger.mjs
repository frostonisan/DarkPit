import assert from "node:assert/strict";
import test from 'node:test';
import { installEntityTestEnvironment } from './entity-test-environment.mjs';

const { storage } = await installEntityTestEnvironment();
const { buildAttackEssenceSocketPatch, calculateEntityLinkedEssenceAvailability, commitAttackEssenceEquipTransaction, grantEssencesToInventory, loadUniversalEssenceItems, previewAttackEssenceEquipTransaction, syncEntityLinkedEssenceInventory, validateEntityEssenceLedger } = await import("../docs/js/items/essences.js");
const { ensureEntityAttackInstances, updateEntityAttackDefinition, setEntityAttackDefinitions } = await import("../docs/js/combat/attackResolution.js");
const { getCycleForKey } = await import("../docs/js/entities/rules.js");
const { resetEntityAttackEssences, getEntityEssenceRewards } = await import("../docs/js/items/essenceInventory.js");
const items = entity => entity.attackEssenceInventory.linkedItems;
const attack = (entity, index = 0) => entity.attackDetails[index];

// The same attack is present as a reference and as an uninitialized override at spawn.
const nativeCatalog = [{ attackId: 'a1', combatFunction: 'Attaquant', attackTarget: ['enemy'], attackRange: ['melee'], functionName: 'autoAttack', attacknature: ['piercingDamage'] }];
for (const reference of ['autoAttack', 'a1']) {
  const fresh = { id: 301578, attacks: [reference], attackDetails: structuredClone(nativeCatalog) };
  ensureEntityAttackInstances(fresh, nativeCatalog);
  assert.equal(fresh.attackDetails.length, 1);
  assert.equal(items(fresh).length, 1, 'Duplicate attack references must not allocate ghost essences');
  assert.equal(validateEntityEssenceLedger(fresh).ok, true);
  const ids = items(fresh).map(item => item.id);
  ensureEntityAttackInstances(fresh, nativeCatalog);
  assert.deepEqual(items(fresh).map(item => item.id), ids, 'Reading an existing attack must not allocate extra IDs');
}
const duplicateInput = { id: 301579 };
setEntityAttackDefinitions(duplicateInput, [...nativeCatalog, ...structuredClone(nativeCatalog)], nativeCatalog);
assert.equal(items(duplicateInput).length, 1, 'Duplicate definition input must be filtered before identity allocation');
assert.equal(validateEntityEssenceLedger(duplicateInput).ok, true);

function equip(entity, slotIndex, color, source, essenceId = "", attackIndex = 0) {
  ensureEntityAttackInstances(entity);
  const target = attack(entity, attackIndex);
  const patch = buildAttackEssenceSocketPatch(target, slotIndex, color, source, entity, essenceId);
  assert.ok(patch?.patch, "Socket choice is allowed");
  const args = {
    entity, attackKey: target.attackKey,
    previousSlots: patch.previousEssenceSlots, nextSlots: patch.nextEssenceSlots,
    stagedNextSlots: patch.stagedNextEssenceSlots,
  };
  const prepared = previewAttackEssenceEquipTransaction(args);
  assert.equal(prepared.ok, true, JSON.stringify(prepared));
  const socketIds = target.essenceSlots.map(s => s.socketId);
  const beforeIds = items(entity).map(i => i.id);
  const result = commitAttackEssenceEquipTransaction({ ...args, preparedTransaction: prepared });
  assert.equal(result.ok, true, result.message);
  updateEntityAttackDefinition(entity, target.attackKey, { ...patch.patch, essenceSlots: result.finalNextSlots });
  syncEntityLinkedEssenceInventory(entity);
  assert.deepEqual(attack(entity, attackIndex).essenceSlots.map(s => s.socketId), socketIds);
  assert.deepEqual(items(entity).map(i => i.id).sort(), [...beforeIds, ...result.universalBoundItems.map(i => i.id)].sort());
  assert.equal(validateEntityEssenceLedger(entity).ok, true, JSON.stringify(validateEntityEssenceLedger(entity)));
  return result;
}

function createEntity(id) {
  const entity = { id, name: "Fresh entity", attacks: [
    { combatFunction: 'Attaquant', attackTarget: ['enemy'], attackRange: ['melee'], functionName: "autoAttack", attacknature: ["physicalDamage"], defaultEssenceSlots: [
      { slotId: "slot-1", color: "red" }, { slotId: "slot-2", color: null },
    ] },
    { combatFunction: 'Attaquant', attackTarget: ['enemy'], attackRange: ['melee'], functionName: "spell", attacknature: ["magicalDamage"] },
  ] };
  ensureEntityAttackInstances(entity);
  syncEntityLinkedEssenceInventory(entity);
  return entity;
}
function cycleEntry(entity, level = 1) {
  const cycle = getCycleForKey("golgoth", entity);
  const milestone = cycle.map(() => "force");
  milestone[39] = "intelligence";
  milestone[49] = "agilite";
  return { key: "golgoth", level, step: cycle.length, uid: "cycle-" + level, milestone };
}

const entity = createEntity(1234);
assert.equal(items(entity).length, 2);
const red = items(entity).find(i => i.color === "red");
assert.equal(red.nativeOrder, 1);
assert.equal(red.nativeAttackId, attack(entity).entityAttackId);
const base = JSON.stringify(attack(entity).essenceBaseProfile);
const clonedTemplate = { ...entity, id: 5678 };
ensureEntityAttackInstances(clonedTemplate);
syncEntityLinkedEssenceInventory(clonedTemplate);
assert.ok(items(clonedTemplate).every(i => i.id.startsWith("5678-ess-")));
assert.ok(items(entity).every(i => i.id.startsWith("1234-ess-")));
assert.notEqual(clonedTemplate.attackEssenceInventory, entity.attackEssenceInventory);

// No reward from stats alone, or from a point still awaiting confirmation.
entity.modifierStats = { durable: { statLeveled: { bloodFury: 10 } }, preview: { statLeveled: { mysticism: 1 } } };
syncEntityLinkedEssenceInventory(entity);
assert.equal(items(entity).length, 2);
const firstCycle = cycleEntry(entity);
entity.Archetype = { achieve: [firstCycle], inProgress: [], current: firstCycle };
ensureEntityAttackInstances(entity);
syncEntityLinkedEssenceInventory(entity);
const rewards = items(entity).filter(i => i.provenance.source === "umbra-level-three");
assert.deepEqual(rewards.map(i => i.color), ["red", "blue", "yellow", "red"]);
assert.equal(new Set(rewards.map(i => i.provenance.rewardId)).size, 4);
const confirmedIds = items(entity).map(i => i.id);
syncEntityLinkedEssenceInventory(entity);
assert.deepEqual(items(entity).map(i => i.id), confirmedIds);
entity.Archetype.achieve.push(cycleEntry(entity, 2));
ensureEntityAttackInstances(entity);
syncEntityLinkedEssenceInventory(entity);
assert.equal(getEntityEssenceRewards(entity).length, 8);
assert.equal(items(entity).length, 10);

// Universal binding on a filled socket, return native, then clear/refill same linked ID.
grantEssencesToInventory({ blue: 1, yellow: 1 }, { origin: "shop-purchase", provenanceContext: { shop: "essenceur" } });
const universal = loadUniversalEssenceItems().find(i => i.color === "blue");
const bound = equip(entity, 0, "blue", "inventory", universal.id).universalBoundItems[0];
assert.equal(bound.provenance.source, "universal-shop");
assert.equal(bound.provenance.parentUniversalId, universal.id);
assert.equal(bound.nativeOrder, undefined);
assert.equal(calculateEntityLinkedEssenceAvailability(entity).availableItems.filter(i => i.id === bound.id).length, 0);
equip(entity, 1, "red", "linked", red.id);
equip(entity, 0, "", "");
assert.equal(calculateEntityLinkedEssenceAvailability(entity).availableItems.filter(i => i.id === bound.id).length, 1);
equip(entity, 0, "blue", "linked", bound.id);
assert.equal(items(entity).filter(i => i.id === bound.id).length, 1);

// Another binding on an empty socket returns exactly one item when cleared.
// Chasses now come from attack mastery, never from completed archetype cycles.
attack(entity).mastery = { points: 250 };
ensureEntityAttackInstances(entity);
const universalYellow = loadUniversalEssenceItems().find(i => i.color === "yellow");
const yellowBound = equip(entity, 2, "yellow", "inventory", universalYellow.id).universalBoundItems[0];
equip(entity, 2, "", "");
assert.equal(calculateEntityLinkedEssenceAvailability(entity).availableItems.filter(i => i.id === yellowBound.id).length, 1);
equip(entity, 2, rewards[2].color, "linked", rewards[2].id);
assert.equal(JSON.stringify(attack(entity).essenceBaseProfile), base);

// Reset keeps universals, puts native IDs back, removes reward objects and added sockets.
delete entity.Archetype;
entity.modifierStats = { durable: {} };
const reset = resetEntityAttackEssences(entity);
assert.equal(reset.ok, true);
assert.equal(reset.removedEssenceIds.length, 8);
ensureEntityAttackInstances(entity);
syncEntityLinkedEssenceInventory(entity);
assert.equal(items(entity).length, 4);
assert.equal(attack(entity).essenceSlots.length, 2);
assert.equal(attack(entity).essenceSlots[0].essenceId, red.id);
assert.deepEqual(attack(entity).attacknature, ["physicalDamage"]);
assert.equal(items(entity).find(i => i.id === bound.id).state, "available");
assert.equal(items(entity).find(i => i.id === yellowBound.id).state, "available");
assert.ok(reset.removedEssenceIds.every(id => !items(entity).some(i => i.id === id)));
assert.equal(validateEntityEssenceLedger(entity).ok, true);
const afterReset = JSON.stringify(entity);
resetEntityAttackEssences(entity);
assert.equal(items(entity).length, 4);

// Normal fresh-format save/reload never grants a second object.
const reloaded = JSON.parse(afterReset);
ensureEntityAttackInstances(reloaded);
syncEntityLinkedEssenceInventory(reloaded);
assert.deepEqual(items(reloaded).map(i => i.id).sort(), items(entity).map(i => i.id).sort());
assert.deepEqual(attack(reloaded).essenceBaseProfile, attack(entity).essenceBaseProfile);
assert.equal(loadUniversalEssenceItems().length, 0);
assert.equal(validateEntityEssenceLedger(reloaded).ok, true);

// Reearning a cleared milestone creates a fresh object, never resurrects deleted IDs.
reloaded.Archetype = { achieve: [cycleEntry(reloaded)] };
ensureEntityAttackInstances(reloaded);
syncEntityLinkedEssenceInventory(reloaded);
const reearned = items(reloaded).filter(i => i.provenance.source === "umbra-level-three");
assert.equal(reearned.length, 4);
assert.ok(reearned.every(i => !reset.removedEssenceIds.includes(i.id)));

// Native order restores the original attack even after sharing those items between attacks.
const multi = { id: 6789, attacks: [
  { combatFunction: 'Attaquant', attackTarget: ['enemy'], attackRange: ['melee'], functionName: 'mixed', attacknature: ['physicalPiercingDamage'] },
  { combatFunction: 'Attaquant', attackTarget: ['enemy'], attackRange: ['melee'], functionName: 'magic', attacknature: ['magicalDamage'] },
] };
ensureEntityAttackInstances(multi);
syncEntityLinkedEssenceInventory(multi);
const initial = multi.attackDetails.map(a => a.essenceSlots.map(s => s.essenceId));
assert.deepEqual(items(multi).filter(i => i.nativeAttackId === attack(multi).entityAttackId).map(i => i.nativeOrder), [1, 2]);
const nativeRed = items(multi).find(i => i.color === 'red');
const nativeBlue = items(multi).find(i => i.color === 'blue');
equip(multi, 0, '', '');
equip(multi, 0, 'red', 'linked', nativeRed.id, 1);
equip(multi, 0, 'blue', 'linked', nativeBlue.id);
assert.equal(resetEntityAttackEssences(multi).ok, true);
ensureEntityAttackInstances(multi);
syncEntityLinkedEssenceInventory(multi);
assert.deepEqual(multi.attackDetails.map(a => a.essenceSlots.map(s => s.essenceId)), initial);
assert.equal(items(multi).length, 3);

assert.ok(buildAttackEssenceSocketPatch(attack(multi, 1), 0, '', '', multi).patch, 'The last essence can be removed');
const candidate = buildAttackEssenceSocketPatch(attack(multi), 1, 'red', 'linked', multi, nativeRed.id);
const beforeInvalid = JSON.stringify(multi);
const invalid = commitAttackEssenceEquipTransaction({ entity: multi, attackKey: attack(multi).attackKey,
  previousSlots: candidate.previousEssenceSlots, stagedNextSlots: candidate.stagedNextEssenceSlots });
assert.equal(invalid.ok, false, 'An already socketed ID cannot occupy a second socket');
assert.equal(JSON.stringify(multi), beforeInvalid, 'Rejected moves do not mutate data');
{
const { calculateHypercognitionEssenceCount, calculateCognitiveEssenceCount, syncEntityEssenceRewards } = await import("../docs/js/items/essenceInventory.js");
const { entityBattleBooste } = await import("../docs/js/entities/rules.js");
const { getAttackNatureRules, getAttackPowerRatios, readAttackDefinitionsForEntity } = await import("../docs/js/combat/attackResolution.js");
for (const [h, expected] of [[-1, 0], [0, 0], [0.9, 0], [1, 1], [30, 1], [58, 3], [99, 6], [100, 6], [124, 8], [125, 8], [149, 9], [150, 10], [999, 10]]) {
  assert.equal(calculateHypercognitionEssenceCount(h), expected, `Hypercognition ${h}`);
}
const hyper = createEntity(885500);
hyper.stats = { hypercognition: 150 };
syncEntityLinkedEssenceInventory(hyper);
const hyperItems = () => items(hyper).filter(item => item.hyperco);
const socketCount = attack(hyper).essenceSlots.length;
const ownedRatios = getAttackPowerRatios(attack(hyper));
assert.equal(hyperItems().length, 10);
const hyperIds = hyperItems().map(item => item.id);
for (let i = 0; i < 10; i++) syncEntityLinkedEssenceInventory(hyper);
assert.deepEqual(hyperItems().map(item => item.id), hyperIds, 'Repeated reads cannot mint extra hyperco essences');
equip(hyper, 0, 'blue', 'linked', hyperItems().find(item => item.hypercoRank === 10).id);
assert.equal(attack(hyper).essenceSlots[0].hyperco, true);
assert.equal(attack(hyper).essenceSlots.length, socketCount, 'Hypercognition grants no sockets');
assert.equal(hyperItems().length, 10, 'Equipped and available essences share the cap');
assert.deepEqual(getAttackPowerRatios(attack(hyper)), ownedRatios);
hyper.stats.hypercognition = 100;
syncEntityLinkedEssenceInventory(hyper);
assert.equal(hyperItems().length, 6);
assert.equal(attack(hyper).essenceSlots[0].color, null, 'Losing the granting stat removes its equipped essence');
assert.equal(getAttackNatureRules(attack(hyper)).isInert, true);
assert.deepEqual(attack(hyper).attacknature, ['inerte']);
assert.equal(validateEntityEssenceLedger(hyper).ok, true);
hyper.modifierStats = { preview: { total: { hypercognition: 150 } } };
syncEntityLinkedEssenceInventory(hyper);
assert.equal(hyperItems().length, 6, 'Uncommitted previews cannot grant essences');
delete hyper.modifierStats;
hyper.stats.hypercognition = 0;
syncEntityLinkedEssenceInventory(hyper);
assert.equal(hyperItems().length, 0);
assert.ok(items(hyper).some(item => !item.hyperco), 'Ordinary linked essences survive hyperco removal');
hyper.stats.hypercognition = 1;
syncEntityLinkedEssenceInventory(hyper);
const regranted = hyperItems()[0].id;
const reloaded = JSON.parse(JSON.stringify(hyper));
syncEntityLinkedEssenceInventory(reloaded);
assert.equal(items(reloaded).filter(item => item.hyperco).length, 1);
assert.equal(items(reloaded).find(item => item.hyperco).id, regranted, 'Save/load preserves identity');
resetEntityAttackEssences(hyper);
syncEntityLinkedEssenceInventory(hyper);
assert.equal(hyperItems().length, 1);
assert.notEqual(hyperItems()[0].id, regranted, 'Reset revokes old grants then reconciles the remaining entitlement');
equip(hyper, 0, '', '');
assert.equal(getAttackNatureRules(attack(hyper)).isInert, true, 'Voluntary removal of the last essence stays usable');
assert.deepEqual(getAttackPowerRatios(attack(hyper)), ownedRatios);
const blue = hyperItems()[0];
equip(hyper, 0, 'blue', 'linked', blue.id);
attack(hyper).essenceSlots[0].active = false;
ensureEntityAttackInstances(hyper);
syncEntityLinkedEssenceInventory(hyper);
assert.equal(getAttackNatureRules(readAttackDefinitionsForEntity(hyper)[0]).isInert, true);
assert.equal(items(hyper).find(item => item.id === blue.id).state, 'socketed', 'Inactive essence remains owned by its socket');
assert.equal(calculateEntityLinkedEssenceAvailability(hyper).equippedRefs.some(ref => ref.id === blue.id), true);
assert.equal(validateEntityEssenceLedger(hyper).ok, true);
attack(hyper).essenceSlots = [];
ensureEntityAttackInstances(hyper);
syncEntityLinkedEssenceInventory(hyper);
assert.equal(attack(hyper).essenceSlots.length, 0, 'Normalization cannot recreate lost sockets');
assert.equal(getAttackNatureRules(attack(hyper)).isInert, true);
const nativeInert = { id: 885501, attacks: [{ ...nativeCatalog[0], attacknature: ['inerte'], physicalRatio: 0.3, magicalRatio: 0, piercingRatio: 0.7 }] };
ensureEntityAttackInstances(nativeInert);
assert.equal(getAttackNatureRules(attack(nativeInert)).isInert, true);
assert.equal(items(nativeInert).length, 0, 'An explicitly inert attack receives no essence');
assert.deepEqual(getAttackPowerRatios(attack(nativeInert)), { physical: 0.3, magical: 0, piercing: 0.7 });
assert.throws(() => ensureEntityAttackInstances({ id: 885502, attacks: [{ ...nativeCatalog[0], functionName: 'undefined-inert', attacknature: ['inerte'] }] }), /ratio/i,
  'Explicitly Inert native attacks must declare their power ratios');
const inferred = { id: 885503, attacks: [{ ...nativeCatalog[0], functionName: 'inferred', attacknature: undefined, physicalRatio: 0, magicalRatio: 0.4, piercingRatio: 0.6 }] };
ensureEntityAttackInstances(inferred);
assert.deepEqual(getAttackNatureRules(attack(inferred)).colors, ['blue', 'yellow']);
const noAttacks = { id: 885504, stats: { hypercognition: 1 } };
syncEntityLinkedEssenceInventory(noAttacks);
assert.equal(items(noAttacks).filter(item => item.hyperco).length, 1, 'Hypercognition grants essences even without attacks');
const boost = entityBattleBooste(noAttacks, { stat: 'hypercognition', value: 149, source: 'test' });
assert.equal(items(noAttacks).filter(item => item.hyperco).length, 10);
boost.remove();
assert.equal(items(noAttacks).filter(item => item.hyperco).length, 1, 'Expired buffs immediately revoke excess grants');

for (const [value, expected] of [[-1, 0], [0, 0], [0.9, 0], [1, 1], [3.9, 3], [12, 10]]) {
  await test(`Standalone generator ${value} is a nonnegative whole count capped at ten`, () => {
    assert.equal(calculateCognitiveEssenceCount({ baseStats: { cognitiveGenerator: value } }), expected);
  });
}
for (const restriction of [
  { archetypeFrozen: true },
  { Archetype: { current: { key: 'egare' } } },
  { Archetype: { current: { key: 'inerte' } } },
]) {
  const restricted = { ...restriction, stats: { hypercognition: 150, cognitiveGenerator: 3.9 } };
  const before = structuredClone(restricted);
  assert.equal(calculateCognitiveEssenceCount(restricted), 3, 'Umbra restrictions leave the autonomous count active');
  assert.deepEqual(restricted, before, 'Count calculation never mutates the owner or creates an inventory');
}

await test('Autonomous generator sources, previews, buffs and reset retain essence ownership', () => {
  const standalone = createEntity(885505);
  standalone.Archetype = { current: { key: 'egare' } };
  standalone.baseStats = { hypercognition: 150, cognitiveGenerator: 2.9 };
  syncEntityEssenceRewards(standalone);
  const standaloneItems = () => items(standalone).filter(item => item.hyperco);
  assert.equal(standaloneItems().length, 2, 'Restricted entities receive standalone bound essences from base stats');
  assert.ok(standaloneItems().every(item => item.color === 'blue' && item.type === 'linked'
    && item.ownerEntityId === standalone.id && item.boundTo === standalone.id));
  assert.ok(standaloneItems().every(item => item.provenance.source === 'cognitiveGenerator'
    && !item.provenance.umbraStatKey), 'Autonomous essence provenance does not invent an Umbra source');
  assert.equal(validateEntityEssenceLedger(standalone).ok, true);
  const standaloneIds = standaloneItems().map(item => item.id);
  standalone.modifierStats = { durable: { statLeveled: { cognitiveGenerator: 2.1 } } };
  syncEntityEssenceRewards(standalone);
  assert.equal(standaloneItems().length, 5, 'Committed source modifiers add to the base entitlement');
  delete standalone.modifierStats;
  syncEntityEssenceRewards(standalone);
  assert.deepEqual(standaloneItems().map(item => item.id), standaloneIds, 'Removing committed modifiers preserves surviving IDs');
  for (const cognitiveGenerator of [0, 10]) {
    standalone.modifierStats = { preview: { statLeveled: { cognitiveGenerator: cognitiveGenerator - 2.9 } } };
    assert.equal(calculateCognitiveEssenceCount(standalone), cognitiveGenerator, 'Pure counts support projected source modifiers');
    syncEntityEssenceRewards(standalone);
    assert.deepEqual(standaloneItems().map(item => item.id), standaloneIds, 'Previews neither mint nor revoke owned essences');
  }
  delete standalone.modifierStats;
  const percentBoost = entityBattleBooste(standalone, { stat: 'cognitiveGenerator', value: 100, mode: 'percent', source: 'test' });
  assert.equal(standaloneItems().length, 5, 'Percentage buffs are applied before flooring the autonomous count');
  percentBoost.remove();
  assert.deepEqual(standaloneItems().map(item => item.id), standaloneIds, 'Removing a percentage buff immediately revokes its grants');

  equip(standalone, 0, 'blue', 'linked', standaloneItems()[0].id);
  assert.equal(resetEntityAttackEssences(standalone).ok, true);
  syncEntityEssenceRewards(standalone);
  assert.equal(standaloneItems().length, 2, 'Reset reconciliation restores surviving autonomous entitlement without Umbra');
  assert.ok(standaloneItems().every(item => !standaloneIds.includes(item.id)), 'Reset grants use fresh IDs');
  assert.equal(validateEntityEssenceLedger(standalone).ok, true);
});

await test('Combined generator caps and revocation preserve sockets and ordinary essences', () => {
  const combined = createEntity(885506);
  combined.stats = { hypercognition: 125, cognitiveGenerator: 3.7 };
  syncEntityEssenceRewards(combined);
  const combinedItems = () => items(combined).filter(item => item.hyperco);
  assert.equal(calculateCognitiveEssenceCount(combined), 10, 'Umbra and autonomous counts share one cap of ten');
  assert.equal(combinedItems().length, 10);
  const combinedIds = combinedItems().map(item => item.id);
  const ordinaryIds = items(combined).filter(item => !item.hyperco).map(item => item.id);
  equip(combined, 0, 'blue', 'linked', combinedItems().find(item => item.hypercoRank === 10).id);
  const socketId = attack(combined).essenceSlots[0].socketId;
  assert.equal(combinedItems().length, 10, 'Available and socketed essences share the combined cap');
  combined.stats.hypercognition = 0;
  syncEntityEssenceRewards(combined);
  assert.deepEqual(combinedItems().map(item => item.id), combinedIds.slice(0, 3), 'Losing Umbra retains autonomous entitlement and IDs');
  assert.equal(attack(combined).essenceSlots[0].essenceId, '', 'Lost entitlement clears an equipped essence');
  const generatorBoost = entityBattleBooste(combined, { stat: 'cognitiveGenerator', value: 7, source: 'test' });
  assert.equal(combinedItems().length, 10, 'Applying a generator buff immediately grants capped essences without Umbra');
  equip(combined, 0, 'blue', 'linked', combinedItems().find(item => item.hypercoRank === 10).id);
  generatorBoost.remove();
  assert.deepEqual(combinedItems().map(item => item.id), combinedIds.slice(0, 3), 'Removing a generator buff immediately revokes excess ranks');
  assert.equal(attack(combined).essenceSlots[0].essenceId, '');
  assert.equal(attack(combined).essenceSlots[0].hyperco, false);
  assert.equal(attack(combined).essenceSlots[0].socketId, socketId, 'Buff revocation preserves the socket identity');
  assert.equal(getAttackNatureRules(attack(combined)).isInert, true);
  assert.deepEqual(items(combined).filter(item => !item.hyperco).map(item => item.id), ordinaryIds);
  assert.equal(validateEntityEssenceLedger(combined).ok, true);

});
console.log("Ledger identity, binding, reset, Hypercognition and Inerte checks completed; generator cases reported by node:test.");
}
