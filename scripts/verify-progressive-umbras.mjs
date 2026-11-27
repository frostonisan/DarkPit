import assert from 'node:assert/strict';
import { installEntityTestEnvironment } from './entity-test-environment.mjs';
await installEntityTestEnvironment();
const S = await import("../docs/js/entities/statSystem.js");
const E = await import("../docs/js/entities/runtime.js");
const D = await import("../docs/js/ui/statistics/details.js"), _D = await import("../docs/js/combat/statistics.js");
const R = await import("../docs/js/entities/rules.js");
const U = await import("../docs/js/entities/progression.js");
const H = await import('../docs/js/data/helpers.js');
const { balanceData: B } = await import('../docs/js/data/balanceData.js');
let count = 0;
const eq = (actual, expected, label) => { assert.ok(Math.abs(actual - expected) < 0.00001, `${label}: ${actual} != ${expected}`); count++; };
const ok = (value, label) => { assert.ok(value, label); count++; };
const fixture = values => ({ id: 981273, name: 'Progressive audit', type: 'sbire', side: 'A', awakening: 1,
  level: { current: 1, max: 250 }, attacks: ['autoAttack'], baseStats: { HP: 100, charge: 4, ...values }, stats: {}, stuff: {} });
const recompute = (entity, items = []) => E.recomputeEntityStats(entity, { equippedItems: items, persistEquipment: false, skipReverseArchetype: true });
const expectedRatio = n => 1 + .85 * (1 - Math.exp(-2.5 * n / 150)) / (1 - Math.exp(-2.5));
for (const [natural, other, value] of [[140, 20, 155], [150, 20, 160], [160, 0, 151],
  [200, 20, 165], [140, 10, 150], [0, 200, 175], [180, -50, 130], [140, -20, 120]]) {
  eq(S.calculateStatPointLimit(natural, other).value, value, `Total threshold ${natural} + ${other}`);
}
for (const [origin, attribute, target] of [['vigueur', 'strength', 'physicalDamage'],
  ['esprit', 'intelligence', 'magicalDamage'], ['finesse', 'agility', 'piercingDamage'],
  ['constitution', 'strength', 'physicalResistance'], ['integrite', 'intelligence', 'magicalResistance'], ['adresse', 'agility', 'dodge']]) {
  for (const points of [0, 1, 10, 75, 149, 150]) eq(S.getProgressiveRatio(points, origin), expectedRatio(points), `${origin} curve ${points}`);
  for (const [u, a] of [[0, 3], [0, 2.2], [0, 10], [1, 1], [10, 25], [50, 100], [149, 150], [150, 150]]) {
    const entity = fixture({ [origin]: u, [attribute]: a, [target]: 7, [`${target}Plus`]: 5 });
    const expected = 12 + (u ? u + Math.round(u * expectedRatio(u)) + Math.round(a * .5 * expectedRatio(a)) : Math.round(a * .5));
    recompute(entity);
    eq(entity.stats[target], expected, `${origin}: real entity total`);
    eq(R.getSafe(entity, target), expected, `${origin}: combat reader`);
    eq(D.calculateStatsDisplay(target, entity).statSystem.value, expected, `${origin}: helper`);
    const row = S.getStatSystemResult(entity, target);
    if (u) {
      eq(row.progression.source.normalValue, Math.round(u * expectedRatio(u)), `${origin}: Umbra contribution rounds to nearest`);
      eq(row.bonuses[0].normalValue, Math.round(a * .5 * expectedRatio(a)), `${attribute}: Umbra attribute contribution rounds to nearest`);
      eq(row.umbraFlat, u, `${origin}: fixed gift stays separate from rounding`);
    }
    const model = S.buildStatSystemModel(row, entity);
    eq(model.contributions.reduce((sum, part) => sum + part.value, 0), expected, `${origin}: exclusive sources`);
    eq(model.contributions.find(p => p.kind === 'plus').value, u ? 5 : 5 + Math.round(a * .5), `${origin}: attribute ratio counted once`);
    for (const part of model.contributions) eq(part.parts.reduce((sum, p) => sum + p.value * (p.operator === '−' ? -1 : 1), 0), part.value, `${origin}: source detail`);
    recompute(entity);
    eq(entity.stats[target], expected, `${origin}: no accumulation on recompute`);
    const saved = JSON.parse(JSON.stringify(entity));
    recompute(saved);
    eq(saved.stats[target], expected, `${origin}: no accumulation after reload`);
    if (u) {
      const helper = D.calculateStatsDisplay(origin, entity);
      const plain = helper.helpContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      ok(!/Don fixe|data-umbra-fixed-gift/.test(helper.helpContent), `${origin}: established helper structure has no added fixed-gift paragraph`);
      const inlineHTML = helper.helpContent.match(/data-umbra-inline-detail="generatedUmbraSource">([\s\S]*?)<\/div>/)?.[1] || '';
      ok(!inlineHTML.includes('→') && !inlineHTML.includes('Don fixe'), `${origin}: one compact formula without intermediate results`);
      ok(!/points propres|Ratio progressif|Base .*courbe|bonus externes|Seuil 150/.test(plain), `${origin}: helper omits ratio and cap explanations`);
      const ability = helper.umbraHelperCalculations.generatedUmbraSource;
      eq(ability.parts.filter(part => part.fixed && part.stat === target).reduce((sum, part) => sum + part.value, 0), u,
        `${origin}: fixed Umbra gift excludes autonomous plus`);
      for (const stat of [origin, attribute]) {
        const index = ability.parts.findIndex(part => part.stat === stat && Number.isFinite(part.coefficient));
        const part = ability.parts[index];
        const text = H.buildUmbraContributionHelper(ability, index).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
        ok(text.includes(`× ${part.coefficient}`), `${stat}: displayed coefficient retains engine precision`);
        ok(text.includes(`${part.raw} avant arrondi`), `${stat}: exact unrounded contribution is visible`);
        ok(text.includes(`arrondi au plus proche : ${part.value}`), `${stat}: retained contribution is visible`);
        ok(!text.includes('→'), `${stat}: source helper keeps the ratio without an intermediate result`);
      }
      eq(helper.umbraHelperCalculations[`${target}Total`].value, expected, `${origin}: compact helper keeps full precision and counts the fixed gift once`);
      eq(_D.calculateGeneratedUmbraStatBonus(entity, origin), expected - 12, `${origin}: legacy generated provider uses shared formula`);
      const before = S.getStatSystemResult(entity, target);
      entity.baseStats[origin] += 1;
      const after = S.getStatSystemResult(entity, target);
      eq(after.bonuses[0].coefficient, before.bonuses[0].coefficient, `${origin}: attribute ratio independent of Umbra points`);
      entity.baseStats[origin] -= 1;
      entity.baseStats[attribute] += 1;
      eq(S.getStatSystemResult(entity, target).sourceRatio, before.sourceRatio, `${origin}: Umbra ratio independent of attribute points`);
    }
  }
  const entity = fixture({ [origin]: 140, [attribute]: 140 });
  const item = { equippedId: `e-${origin}-cap`, equippedTo: entity.id, itemId: `i-${origin}`, itemType: ['stuff'],
    Stuffeffets: [{ type: 'stat-buff', stat: origin, value: 20 }, { type: 'stat-buff', stat: attribute, value: 20 }] };
  entity.stuff = { slot1: [item.equippedId] };
  recompute(entity, [item]);
  eq(entity.stats[origin], 155, `${origin}: actual equipment crosses total threshold`);
  eq(entity.stats[attribute], 155, `${attribute}: actual equipment crosses total threshold`);
  eq(R.getSafe(entity, origin), 155, `${origin}: no second limit when reading`);
  const sourceTotals = D.getStatisticSourceTotals(entity, attribute, D.calculateStatsDisplay(attribute, entity));
  eq(sourceTotals.find(p => p.category === 'equipment').value, 15, `${attribute}: equipment helper shows effective gain`);
  eq(sourceTotals.reduce((n, p) => n + p.value, 0), 155, `${attribute}: source helper reconciles after threshold`);
  ok(!/data-helper-point-limit|bonus externes|Au-delà : niveaux/.test(D.calculateStatsDisplay(attribute, entity).helpContent), `${attribute}: helper omits point-limit explanation`);
  const total = entity.stats[target];
  entity.modifierStats.preview = { statLeveled: { [origin]: 20, [attribute]: 20 } };
  U.ComputeStatPreview(entity);
  eq(entity.modifierStats.preview.total[origin], 161, `${origin}: preview combines natural and equipment sources`);
  const preview = entity.modifierStats.preview.total[target];
  eq(entity.stats[target], total, `${origin}: preview leaves saved total alone`);
  entity.modifierStats.durable.statLeveled = { [origin]: 20, [attribute]: 20 };
  delete entity.modifierStats.preview;
  recompute(entity, [item]);
  eq(entity.stats[target], preview, `${origin}: confirmed sources match preview`);
  entity.stuff.slot1 = [];
  recompute(entity, [item]);
  eq(entity.stats[origin], 151, `${origin}: removing equipment restores natural-only points`);
  entity.battleBoosts = { [origin]: [{ mode: 'flat', value: 20 }], [attribute]: [{ mode: 'flat', value: 20 }] };
  eq(R.getSafe(entity, origin), 161, `${origin}: battle bonus reduced once`);
  const battleTotal = R.getSafe(entity, target);
  delete entity.battleBoosts;
  ok(R.getSafe(entity, target) < battleTotal, `${origin}: expired buff disappears from derived power`);
  entity.baseStats[origin] += 20;
  entity.baseStatSources = { crystal: { [origin]: 20 } };
  recompute(entity);
  eq(entity.stats[origin], 171, `${origin}: crystal source retains its full value`);
  entity.modifierStats.durable.adminLevel = { [origin]: 10 };
  recompute(entity);
  eq(entity.stats[origin], 176, `${origin}: direct admin addition uses external rate`);
  const row = S.getStatSystemResult(entity, target);
  ok(row.progression.source.note.includes('Seuil 150'), `${origin}: helper explains point threshold`);
  const detail = D.calculateStatsDisplay(origin, entity).umbraHelperCalculations.generatedUmbraSource;
  ok(!/points propres|bonus externes|Seuil 150/.test(D.calculateStatsDisplay(origin, entity).helpContent), `${origin}: above-limit helper remains concise`);
  const overflowInline = D.calculateStatsDisplay(origin, entity).helpContent.match(/data-umbra-inline-detail="generatedUmbraSource">([\s\S]*?)<\/div>/)?.[1] || '';
  ok(!overflowInline.includes('→'), `${origin}: above-limit points keep the same compact presentation`);
  eq(detail.value, S.buildStatSystemModel(row).contributions.find(part => part.kind === 'umbra').value,
    `${origin}: only the Umbra contribution appears in its helper calculation`);
  eq(S.calculateStatSources({ [target]: 10000 }, target).value, 10000, `${target}: fixed points unlimited`);
  eq(S.calculateStatSources({ [`${target}Plus`]: 10000 }, target).value, 10000, `${target}+: fixed gift unlimited`);
  eq(S.calculateStatSources({ [origin]: 1, [attribute]: 1 }, target).value, 3,
    `${origin}: first point gives 1 from Umbra, 1 from attribute and 1 fixed`);
  const atLimit = S.calculateStatSources({ [origin]: 150, [attribute]: 150 }, target);
  const beyondLimit = S.calculateStatSources({ [origin]: 151, [attribute]: 151 }, target);
  ok(beyondLimit.value > atLimit.value && beyondLimit.value - atLimit.value < 1,
    `${origin}: nearest rounding still preserves tiny gains beyond the limit`);
  for (const part of [beyondLimit.progression.source, beyondLimit.bonuses[0]]) {
    const html = H.buildUmbraContributionHelper({ parts: [part] }, 0).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    ok(html.includes(`${part.raw} avant arrondi`) && html.includes(`retenu : ${part.value}`)
      && !/seuil|limite|Max atteint|supplément conservé/i.test(html), `${origin}: exact result stays visible without threshold explanations`);
  }
}
const limit = B.generatedUmbraStats.progression.limit;
const smith = fixture({ strength: 160, vigueur: 160, weaponOrfevrePlus: 4 });
const smithItem = { equippedId: 'e-progressive-smith', equippedTo: smith.id, itemId: 'i-progressive-smith', itemType: ['stuff'],
  Stuffeffets: [{ type: 'stat-buff', stat: 'strength', value: 20 }, { type: 'stat-buff', stat: 'vigueur', value: 20 }] };
smith.stuff = { slot1: [smithItem.equippedId] };
recompute(smith, [smithItem]);
smith.modifierStats.preview = { statLeveled: { strength: 20, vigueur: 20 } };
U.ComputeStatPreview(smith);
const smithPreview = { ...smith.modifierStats.preview.total };
smith.modifierStats.durable.statLeveled = { strength: 20, vigueur: 20 };
delete smith.modifierStats.preview;
recompute(smith, [smithItem]);
eq(smith.stats.strength, smithPreview.strength, 'Orfevre equipment preview agrees with committed points beyond limit');
eq(smith.stats.physicalDamage, smithPreview.physicalDamage, 'Orfevre equipment preview agrees with committed power beyond limit');
smith.seuilUmbra = 200;
recompute(smith, [smithItem]);
ok(smith.stats.strength > smithPreview.strength, 'Changing the owner limit reevaluates all entity sources');
B.generatedUmbraStats.progression.limit = limit;
B.generatedUmbraStats.progression.limit = 200;
eq(S.calculateStatPointLimit(180, 20, 0, 200).value, 200, 'Explicit owner limit raises the point threshold');
eq(S.getProgressiveRatio(200, 'vigueur', 200), 1.85, 'Cycles follow new limit');
B.generatedUmbraStats.progression.limit = limit;
const defaultStrength = S.getProgressiveRatio(70, 'strength');
B.generatedUmbraStats.progression.curves.strength.intensity = 4;
ok(S.getProgressiveRatio(70, 'strength') !== defaultStrength, 'Per-stat curve can be changed');
eq(S.getProgressiveRatio(70, 'vigueur'), defaultStrength, 'Other curve is unaffected');
delete B.generatedUmbraStats.progression.curves.strength.intensity;
eq(S.getProgressiveRatio(300, 'vigueur'), 1.85 + .85 * .0005, 'Residual affects ratio growth only beyond limit');
// Both resistance families pool every source as points before one conversion.
for (const [origin, attribute, target, source, penetrationKey] of [
  ['constitution', 'strength', 'physicalResistance', 'physical', 'physicalPen'],
  ['integrite', 'intelligence', 'magicalResistance', 'magical', 'magicalPen'],
]) {
for (const [values, points] of [
  [{ [origin]: 1, [attribute]: 1 }, 3],
  [{ [origin]: 10, [attribute]: 10 }, 27],
  [{ [origin]: 150, [attribute]: 150 }, 567],
  [{ [target]: 150 }, 150],
  [{ [`${target}Plus`]: 145, [attribute]: 10 }, 150],
  [{ [target]: 75, [`${target}Plus`]: 75 }, 150],
  [{ [target]: 10000 }, 10000],
]) {
  const entity = fixture(values);
  recompute(entity);
  const row = S.getStatSystemResult(entity, target);
  eq(row.value, points, `All ${target} sources use points`);
  eq(row.reductionRatio, .99 * points / (points + 70), 'One conversion with K=70 after source pooling');
  eq(row.unit.length, 0, 'RP helper quantities are not percentages');
  const display = D.calculateStatsDisplay(target, entity);
  eq(display.displayValue, points, 'Entity displays its total resistance points');
  eq(display.reductionPercent, .99 * points / (points + 70) * 100, 'Helper mitigation uses the pooled total');
  for (const penetration of [0, 25, 100]) {
    const attacker = fixture({ [penetrationKey]: penetration });
    recompute(attacker);
    const retained = points * (1 - Math.min(99, penetration) / 100);
    const hit = R.calculateResistances(entity, { [source]: 100, piercingDamage: 100 }, attacker);
    eq(hit[source === 'physical' ? 'reducedPhysicalDamage' : 'reducedMagicalDamage'], Math.floor(100 * (1 - .99 * retained / (retained + 70))), `${source} hit and penetration use pooled points with the existing damage floor`);
    eq(hit.reducedpiercingDamage, 100, 'Resistance does not reduce piercing damage');
  }
}
}
const small = fixture({ constitution: 1, strength: 1 });
recompute(small);
for (const [damage, expected] of [[0, 0], [.25, 0], [1, 0], [2, 1], [3, 2]]) {
  eq(R.calculateResistances(small, { physical: damage }).reducedPhysicalDamage, expected, 'Small physical hits keep the existing downward rounding');
}
const tank = fixture({ constitution: 150, strength: 150 });
recompute(tank);
eq(R.calculateResistances(tank, { physical: 565 }).reducedPhysicalDamage, Math.floor(565 * (1 - .99 * 567 / 637)), 'Equal PP/RP uses the existing downward rounding');
eq(R.calculateResistances(tank, { physical: 1 }).reducedPhysicalDamage, 0, 'Downward rounding keeps no artificial minimum damage');
const mixedDefense = fixture({ physicalResistance: 150, magicalResistance: 50 });
recompute(mixedDefense);
eq(R.calculateResistances(mixedDefense, { physical: 100 }, null, { inert: true }).reducedPhysicalDamage, 18,
  'Inert damage still applies physical and magical resistance successively');
eq(R.calculateResistances(mixedDefense, { hybridalDamage: 80 }).reducedHybridalDamage, 35,
  'Hybrid damage applies each resistance to its own half');
const magicDefense = fixture({ integrite: 10, intelligence: 10, magicalResistance: 3, magicalResistancePlus: 2 });
recompute(magicDefense);
const magicPoints = S.getStatSystemResult(magicDefense, 'magicalResistance').value;
const magicHit = R.calculateResistances(magicDefense, { magical: 100 }).reducedMagicalDamage;
const magicDisplay = D.calculateStatsDisplay('magicalResistance', magicDefense).reductionPercent;
eq(magicPoints, 32, 'Magic pools fixed, plus, both rounded contributions and the gift');
eq(magicDisplay, .99 * magicPoints / (magicPoints + 70) * 100, 'Magical conversion uses K=70 once on the total');
const bareDefense = { stats: { physicalResistance: 150, magicalResistance: 150 } };
eq(R.calculateResistances(bareDefense, { physical: 100, magical: 100 }).reducedPhysicalDamage, 32, 'Direct physical combat reader uses K=70');
eq(R.calculateResistances(bareDefense, { physical: 100, magical: 100 }).reducedMagicalDamage, 32, 'Direct magical combat reader uses K=70');
const oldConstant = B.resistance.reductionCurve.physicalConstant;
B.resistance.reductionCurve.physicalConstant = 300;
eq(S.getStatSystemResult(tank, 'physicalResistance').reductionRatio, .99 * 567 / 867, 'K edits apply without recomputing point gains');
eq(R.calculateResistances(tank, { physical: 565 }).reducedPhysicalDamage, Math.floor(565 * (1 - .99 * 567 / 867)), 'Combat reads the shared K live');
eq(R.calculateResistances(magicDefense, { magical: 100 }).reducedMagicalDamage, magicHit, 'Physical K edits leave magical damage unchanged');
eq(D.calculateStatsDisplay('magicalResistance', magicDefense).reductionPercent, magicDisplay, 'Physical K edits leave magical helpers unchanged');
eq(B.generatedUmbraStats.progression.limit, 150, 'Physical K is independent of the acquisition limit');
B.resistance.reductionCurve.physicalConstant = oldConstant;
const physicalBefore = R.calculateResistances(tank, { physical: 100 }).reducedPhysicalDamage;
B.resistance.reductionCurve.magicalConstant = 140;
eq(S.getStatSystemResult(magicDefense, 'magicalResistance').reductionRatio, .99 * 32 / 172, 'Magical K applies independently');
eq(R.calculateResistances(magicDefense, { magical: 100 }).reducedMagicalDamage, Math.floor(100 * (1 - .99 * 32 / 172)), 'Combat reads magical K live');
eq(R.calculateResistances(tank, { physical: 100 }).reducedPhysicalDamage, physicalBefore, 'Magical K leaves physical damage unchanged');
B.resistance.reductionCurve.magicalConstant = 70;
B.generatedUmbraStats.progression.limit = 200;
const opened = fixture({ constitution: 180, strength: 180, integrite: 180, intelligence: 180 });
opened.seuilUmbra = 200;
recompute(opened);
eq(opened.stats.constitution, 180, 'Constitution follows the entity threshold');
eq(S.getProgressiveRatio(200, 'constitution', 200), 1.85, 'Constitution curve follows the common interval');
eq(opened.stats.integrite, 180, 'Integrite follows the entity threshold');
eq(S.getProgressiveRatio(200, 'integrite', 200), 1.85, 'Integrite curve follows the common interval');
B.generatedUmbraStats.progression.limit = limit;
for (const [score, percent] of [[0, 0], [1, 1], [27, 21.384], [98, 49.5]]) {
  eq(E.calculateDodgePercent(score), percent, `Dodge curve: ${score} points`);
  const entity = fixture({ dodge: score });
  recompute(entity);
  eq(entity.stats.dodge, score, 'Dodge storage retains score points');
  eq(_D.calculateTotalDodgeBonus(entity), percent, 'Dodge combat converts the complete score once');
  eq(D.calculateStatsDisplay('dodge', entity).calculateTotalDodgeBonus, percent, 'Dodge helper uses combat chance');
}
let previousChance = 0;
for (const score of [.0001, .1, 1, 27, 98, 1000, 1e9, Number.MAX_VALUE]) {
  const chance = E.calculateDodgePercent(score);
  ok(chance > previousChance && chance < 99, `Dodge remains increasing and below 99% at ${score}`);
  previousChance = chance;
}
const dodger = fixture({ adresse: 10, agility: 10, dodge: 2, dodgePlus: 3 });
recompute(dodger);
eq(dodger.stats.dodge, 32, 'Dodge normal, plus and Adresse add points');
eq(_D.calculateTotalDodgeBonus(dodger), 99 * 32 / 130, 'All dodge sources share one conversion');
dodger.battleBoosts = { dodge: [{ mode: 'flat', value: 5 }] };
eq(_D.calculateTotalDodgeBonus(dodger), 99 * 37 / 135, 'Flat combat dodge buff is score, not percent');
delete dodger.battleBoosts;
for (const [natural, other, crystal, expected] of [[0,0,200,200], [140,20,20,175], [160,20,20,181], [180,-50,20,150]]) {
  eq(S.calculateStatPointLimit(natural, other, crystal).value, expected, 'Crystal full-strength gain does not discount other sources');
}
console.log(`Progressive Umbra audit: ${count} checks passed.`);
