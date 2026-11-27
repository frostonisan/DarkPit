import assert from 'node:assert/strict';
import { installEntityTestEnvironment } from './entity-test-environment.mjs';

await installEntityTestEnvironment();
const { initializeAttackPowerRatios, getAttackPowerRatios, isAttackSublime, ensureEntityAttackInstances, readAttackDefinitionsForEntity, updateEntityAttackDefinition, applyEntityAttackModifier } = await import("../docs/js/combat/attackResolution.js");
const { attackDetails: catalog } = await import('../docs/js/data/attackList.js');
const { resetEntityAttackEssences } = await import("../docs/js/items/essenceInventory.js");

const complete = (nature, fields = {}) => {
  const attack = { attacknature: [nature].flat(), ...fields };
  initializeAttackPowerRatios(attack);
  return getAttackPowerRatios(attack);
};
const ratios = (physical, magical, piercing) => ({ physical, magical, piercing });
for (const [nature, expected] of [
  ['physicalDamage', ratios(1, 0, 0)],
  ['magicalDamage', ratios(0, 1, 0)],
  ['piercingDamage', ratios(0, 0, 1)],
  ['transpiercingDamage', ratios(0, 0, 1)],
  ['hybridalDamage', ratios(0.5, 0.5, 0)],
  ['physicalPiercingDamage', ratios(0.5, 0, 0.5)],
  ['magicalPiercingDamage', ratios(0, 0.5, 0.5)],
  [['magicalDamage', 'piercingDamage'], ratios(0, 0.5, 0.5)],
]) assert.deepEqual(complete(nature), expected, `Default power sources for ${nature}`);

for (const [label, nature, fields, expected] of [
  ['kinetic missing piercing', 'physicalPiercingDamage', { physicalRatio: 0.3 }, ratios(0.3, 0, 0.7)],
  ['kinetic explicit zero', 'physicalPiercingDamage', { physicalRatio: 0.3, piercingRatio: 0 }, ratios(0.3, 0, 0)],
  ['prism explicit zero and missing', 'hybridalPiercingDamage', { physicalRatio: 0.3, piercingRatio: 0 }, ratios(0.3, 0.7, 0)],
  ['prism over one', 'hybridalPiercingDamage', { physicalRatio: 1.2, piercingRatio: 0.2 }, ratios(1.2, 0, 0.2)],
  ['spectral over one', 'magicalPiercingDamage', { magicalRatio: 1.2 }, ratios(0, 1.2, 0)],
  ['exactly one', 'hybridalPiercingDamage', { physicalRatio: 0.3, magicalRatio: 0.7 }, ratios(0.3, 0.7, 0)],
  ['off-nature source counts in remainder', 'magicalDamage', { piercingRatio: 0.6 }, ratios(0, 0.4, 0.6)],
  ['off-nature only with explicit zero', 'magicalDamage', { piercingRatio: 0.6, magicalRatio: 0 }, ratios(0, 0, 0.6)],
  ['off-nature fills budget', 'magicalDamage', { piercingRatio: 1 }, ratios(0, 0, 1)],
  ['off-nature zero does not fill budget', 'magicalDamage', { piercingRatio: 0 }, ratios(0, 1, 0)],
  ['complete below one', 'hybridalDamage', { physicalRatio: 0.2, magicalRatio: 0.3 }, ratios(0.2, 0.3, 0)],
  ['native zero does not fall back', 'physicalDamage', { physicalRatio: 0 }, ratios(0, 0, 0)],
  ['all explicit zeros', 'hybridalPiercingDamage', { physicalRatio: 0, magicalRatio: 0, piercingRatio: 0 }, ratios(0, 0, 0)],
  ['precision retained', 'physicalPiercingDamage', { physicalRatio: 0.35 }, ratios(0.35, 0, 0.65)],
]) assert.deepEqual(complete(nature, fields), expected, label);

function withRandom(draws, action) {
  const original = Math.random;
  let calls = 0;
  Math.random = () => {
    assert.ok(calls < draws.length, 'Only generation may draw random ratio rounding');
    return draws[calls++];
  };
  try { return action(); } finally { Math.random = original; }
}
const winners = new Set();
for (const draws of [[0, 0], [0, 0.9], [0.9, 0.9]]) {
  const values = withRandom(draws, () => complete('hybridalPiercingDamage'));
  assert.deepEqual(Object.values(values).sort(), [0.3, 0.3, 0.4]);
  winners.add(Object.keys(values).find(key => values[key] === 0.4));
}
assert.equal(winners.size, 3, 'Any constituent may receive the extra tenth');
const precise = withRandom([0], () => complete('hybridalPiercingDamage', { physicalRatio: 0.35 }));
assert.equal(precise.physical, 0.35);
assert.deepEqual([precise.magical, precise.piercing].sort(), [0.32, 0.33]);
withRandom([], () => complete('magicalPiercingDamage'));

for (const invalid of [-1, NaN, Infinity, null, '', '0.3', undefined]) {
  const attack = { attacknature: ['physicalDamage'], physicalRatio: invalid };
  assert.throws(() => initializeAttackPowerRatios(attack), /Ratio invalide/);
  assert.equal(Object.hasOwn(attack, 'magicalRatio'), false, 'Invalid definitions are not partially filled');
}

const originalCatalog = JSON.stringify(catalog);
const auto = { id: 970001, attacks: ['autoAttack'] };
ensureEntityAttackInstances(auto, catalog);
assert.deepEqual(getAttackPowerRatios(auto.attackDetails[0]), ratios(0, 0, 1),
  'Auto-attack explicitly disables physical/magical and generates its native piercing ratio');
const nativeRatios = getAttackPowerRatios(auto.attackDetails[0]);
const saved = JSON.stringify(auto);
withRandom([], () => {
  updateEntityAttackDefinition(auto, 'autoAttack', { essenceSlots: [{ color: 'red', kind: 'open' }] });
  assert.deepEqual(auto.attackDetails[0].attacknature, ['physicalDamage']);
  assert.deepEqual(getAttackPowerRatios(auto.attackDetails[0]), nativeRatios);
  updateEntityAttackDefinition(auto, 'autoAttack', { essenceSlots: [{ color: 'blue', kind: 'open' }] });
  assert.deepEqual(getAttackPowerRatios(auto.currentAttack), nativeRatios);
  applyEntityAttackModifier(auto, 'autoAttack', { essences: ['red'] }, [], { sourceId: 'test-nature' });
  assert.deepEqual(getAttackPowerRatios(readAttackDefinitionsForEntity(auto)[0]), nativeRatios);
  const loaded = JSON.parse(saved);
  ensureEntityAttackInstances(loaded, catalog);
  assert.deepEqual(getAttackPowerRatios(loaded.currentAttack), nativeRatios);
  resetEntityAttackEssences(auto);
  ensureEntityAttackInstances(auto, catalog);
  assert.deepEqual(getAttackPowerRatios(auto.currentAttack), nativeRatios);
});

const prismTemplate = { functionName: 'prism', combatFunction: 'Attaquant', attackTarget: ['enemy'],
  attackRange: ['melee'], attacknature: ['hybridalPiercingDamage'] };
const prism = { id: 970002, attacks: ['prism'] };
withRandom([0, 0], () => ensureEntityAttackInstances(prism, [prismTemplate]));
const frozenRatios = getAttackPowerRatios(prism.currentAttack);
withRandom([], () => {
  for (let pass = 0; pass < 5; pass++) {
    readAttackDefinitionsForEntity(prism);
    ensureEntityAttackInstances(prism);
    assert.deepEqual(getAttackPowerRatios(prism.currentAttack), frozenRatios);
  }
  const copy = { ...JSON.parse(JSON.stringify(prism)), id: 970003 };
  ensureEntityAttackInstances(copy);
  assert.deepEqual(getAttackPowerRatios(copy.currentAttack), frozenRatios, 'A copied instance retains its generated ratios');
  assert.deepEqual(getAttackPowerRatios(prism.nativeAttacks[0]), frozenRatios);
});
assert.equal(Object.hasOwn(prismTemplate, 'physicalRatio'), false, 'Generation does not modify catalog templates');
assert.equal(JSON.stringify(catalog), originalCatalog);
assert.deepEqual(getAttackPowerRatios({ attacknature: ['physicalDamage'] }), ratios(0, 0, 0),
  'Runtime reading never derives ratios from the current nature');
for (const [nature, physical, magical, piercing] of [
  ['physicalDamage', 0.3, 0, 0],
  ['magicalDamage', 0, 1.2, 0],
  ['piercingDamage', 0, 0, 1],
  ['transpiercingDamage', 0, 0, 0.5],
  ['hybridalDamage', 0.3, 0.8, 0],
  ['physicalPiercingDamage', 0.3, 0, 0.7],
  ['magicalPiercingDamage', 0, 0.8, 0.2],
  [['magicalDamage', 'piercingDamage'], 0, 1.2, 0.2],
  ['hybridalPiercingDamage', 0.3, 0.3, 0.4],
]) {
  const attack = { attacknature: [nature].flat(), physicalRatio: physical, magicalRatio: magical, piercingRatio: piercing };
  const snapshot = JSON.stringify(attack);
  assert.equal(isAttackSublime(attack), true, `Matching sources qualify as sublime: ${nature}`);
  assert.equal(JSON.stringify(attack), snapshot, 'Sublime classification does not mutate the attack');
}
const spectral = { attacknature: ['magicalPiercingDamage'], physicalRatio: 0, magicalRatio: 0.8, piercingRatio: 0.2 };
assert.equal(isAttackSublime({ ...spectral, physicalRatio: 0.1 }), false, 'An extra source disqualifies sublime');
assert.equal(isAttackSublime({ ...spectral, piercingRatio: 0 }), false, 'A missing constituent disqualifies sublime');
assert.equal(isAttackSublime({ ...spectral, magicalRatio: 0, piercingRatio: 0 }), false, 'Zero ratios never qualify');
assert.equal(isAttackSublime({ attacknature: ['magicalDamage'] }), false, 'No runtime ratio inference for sublime');
assert.equal(isAttackSublime({ ...spectral, essenceSlots: [] }), false, 'No active nature never qualifies');
assert.equal(isAttackSublime({ ...spectral, essences: ['red'] }), false, 'Current essence nature overrides the original nature');
assert.equal(isAttackSublime({ ...spectral, essences: ['blue', 'blue', 'yellow'] }), true,
  'Essence proportions do not need to match ratio proportions');
console.log('PASS: ratio generation, explicit zeros, precision, random distribution, ownership, essence changes, save/load and reset');
