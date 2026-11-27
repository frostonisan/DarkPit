import assert from 'node:assert/strict';
import { installEntityTestEnvironment } from './entity-test-environment.mjs';

await installEntityTestEnvironment();
const { ENTITY_TYPE, assertEntityType, assertEntityTargetingIdentity, getBattleEntityDomId, isLord, isNonLordCombatant, analyzeEntityCombatProfile } = await import("../docs/js/entities/rules.js");
const { entitesNest } = await import("../docs/js/data/entityTemplates.js");
const { attackDetails } = await import('../docs/js/data/attackList.js');

const byName = new Map(attackDetails.map(attack => [attack.functionName, attack]));
const minion = { id: 1, name: 'Minion', type: ENTITY_TYPE.MINION };
const lord = { id: 2, name: 'Lord', type: ENTITY_TYPE.LORD };
assert.deepEqual(Object.values(ENTITY_TYPE), ['sbire', 'lord']);
assert.equal(getBattleEntityDomId(minion), 'sbire_1');
assert.equal(getBattleEntityDomId(lord), 'lord_2');
assert.throws(() => assertEntityType({ type: 'invocateur' }), /invalide/);
assert.equal(isNonLordCombatant(minion), true);
assert.equal(isNonLordCombatant(lord), false);
assert.equal(isLord(lord), true);

const hex = byName.get('lancedejarret');
const hit = byName.get('quickAttack');
const rez = byName.get('resurrection');
for (const entity of [minion, lord]) {
  assert.equal(assertEntityTargetingIdentity(entity, [hex, hit, rez]), true);
  const all = analyzeEntityCombatProfile(entity, [hex, hit, rez]);
  assert.deepEqual(all.domains, ['necro', 'invocateur', 'combattant']);
  assert.equal(all.combatFunction, 'Arbitre');
  assert.equal(all.range, 'multi');
  assert.match(all.label, /Nécro-invo-combattant Arbitre multi-portée/);
  assert.equal(all.classes.includes('invocateur'), false);
  assert.ok(all.classes.includes('domain-invocateur'));
  assert.match(all.helper, /cadavres alliés/);
  assert.match(all.helper, /êtres vivants ennemis/);
  assert.doesNotMatch(all.helper, /cadavres ennemis/);
  for (let mask = 1; mask < 8; mask++) {
    const kit = [hit, hex, rez].filter((_, i) => mask & (1 << i));
    assert.equal(analyzeEntityCombatProfile(entity, kit).domains.length, kit.length);
  }
}
assert.throws(() => assertEntityTargetingIdentity(minion, [{ ...hit, combatFunction: undefined }]), /combatFunction/);
assert.throws(() => assertEntityTargetingIdentity(minion, [{ ...hit, attackRange: ['wrong'] }]), /attackRange/);
assert.throws(() => assertEntityTargetingIdentity(minion, [{ ...hit, attackTarget: [] }]), /attackTarget/);
const lifesteal = analyzeEntityCombatProfile(minion, [byName.get('morsure-goulue')]);
assert.equal(lifesteal.combatFunction, 'Attaquant', 'Incidental self-heal does not make an Arbitre');
assert.equal(analyzeEntityCombatProfile(minion, [hex]).combatFunction, 'Support');
assert.equal(analyzeEntityCombatProfile(minion, [rez]).range, 'range');
const snapshot = JSON.stringify([minion, hit, hex, rez]);
analyzeEntityCombatProfile(minion, [hit, hex, rez]);
assert.equal(JSON.stringify([minion, hit, hex, rez]), snapshot, 'Analysis has no data side effects');

for (const entity of entitesNest) {
  assertEntityType(entity);
  const definitions = entity.attacks.map(name => {
    const attack = byName.get(name);
    assert.ok(attack, `${entity.name}: missing attack ${name}`);
    return attack;
  });
  assertEntityTargetingIdentity(entity, definitions);
  analyzeEntityCombatProfile(entity, definitions);
}
assert.equal(entitesNest.find(entity => entity.class === 'lance-jarret').type, 'sbire');
const tests = entitesNest.filter(entity => entity.name.startsWith('Grouille-Doigt TEST'));
assert.deepEqual(tests.map(entity => entity.attacks.length), [3, 2, 3, 2]);
console.log(`PASS: ranks, 14 domain combinations, function/range aggregation and ${entitesNest.length} catalogue entities.`);
