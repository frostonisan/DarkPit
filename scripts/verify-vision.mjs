import assert from 'node:assert/strict';
import { installEntityTestEnvironment } from './entity-test-environment.mjs';
await installEntityTestEnvironment();
const E = await import("../docs/js/entities/runtime.js");
const D = await import("../docs/js/combat/statistics.js"), _D = await import("../docs/js/ui/statistics/details.js");
const S = await import("../docs/js/entities/statSystem.js");
const A = await import("../docs/js/combat/attackResolution.js");
const H = await import('../docs/js/data/helpers.js');
const { balanceData: B } = await import('../docs/js/data/balanceData.js');
const { stats } = await import('../docs/js/data/statsData.js');
let checks = 0;
const eq = (a, b, label) => { assert.ok(Math.abs(a - b) < 1e-8, `${label}: ${a} != ${b}`); checks++; };
const ok = (value, label) => { assert.ok(value, label); checks++; };
const entity = baseStats => {
  const e = { id: 988961, name: 'Vision audit', type: 'sbire', side: 'A', awakening: 1,
    level: { current: 1, max: 250 }, attacks: ['autoAttack'], stuff: {}, stats: {}, baseStats: { HP: 100, ...baseStats } };
  E.recomputeEntityStats(e, { equippedItems: [], persistEquipment: false, skipReverseArchetype: true });
  return e;
};
const progression = globalThis.umbraProgression;
for (const vision of [0, 1, 10, 149, 150, 151, 200, 1000]) for (const agility of [0, 1, 3, 25, 150, 200]) {
  const e = entity({ vision, agility, precision: 7, precisionPlus: 5 });
  const v = S.calculateStatPointLimit(vision).value, a = S.calculateStatPointLimit(agility).value;
  const vp = progression.progressivePowerPart('vision', v, 1).value;
  const ap = progression.progressivePowerPart('agility', a, .5, v > 0).value;
  eq(e.stats.precision, 12 + v + vp + ap, 'Fixed, +, Vision gift and ratios counted once');
  eq(e.stats.bullsEye || 0, progression.bullsEyePercent(v,a), 'Bull’s Eye stores the percentage from retained Vision and Agility');
  const row = S.getStatSystemResult(e, 'precision');
  eq(row.chancePercent, E.calculatePrecisionPercent(e.stats.precision), 'Score converted after pooling');
  eq(S.buildStatSystemModel(row, e).contributions.reduce((sum, p) => sum + p.value, 0), row.value, 'Helper contributions reconcile');
  const bull = S.getStatSystemResult(e, 'bullsEye');
  if (bull) eq(S.buildStatSystemModel(bull, e).parts.reduce((sum, p) => sum + (p.operator === '−' ? -p.value : p.value), 0), bull.value, 'Bull’s Eye helper reconciles');
  const reload = JSON.parse(JSON.stringify(e)); E.recomputeEntityStats(reload, { equippedItems: [], persistEquipment: false });
  eq(reload.stats.precision, e.stats.precision, 'Recompute does not accumulate generated precision');
  eq(reload.stats.bullsEye || 0, e.stats.bullsEye || 0, 'The direct passive percentage survives reload without double conversion');
}
eq(entity({ agility: 150, precision: 7 }).stats.precision, 7, 'Normal Precision has no agility ratio');
eq(entity({ agility: 3, precisionPlus: 1 }).stats.precision, 3, 'Précision + rounds 1.5 to 2');
ok(entity({ vision: 10, agility: 0 }).stats.bullsEye < entity({ vision: 10, agility: 150 }).stats.bullsEye, 'Agility improves Bull’s Eye');
eq(S.calculateStatPointLimit(200, 20, 20).value, 185, 'Common limit: natural 10%, external 50%, crystals 100%');
eq(progression.bullsEyePercent(0), 0, 'Zero Bull’s Eye');
eq(progression.bullsEyePercent(1), 1, 'First Vision point gives 1%');
eq(progression.bullsEyePercent(99), 50, 'Bull’s Eye midpoint');
for (const n of [1e3, 1e9, 1e100, Number.MAX_VALUE]) {
  ok(progression.bullsEyePercent(n) < 99, 'Finite Vision stays below 99%');
  ok(S.calculateStatSources({vision:n},'bullsEye').value < 99,'Stored gameplay percentage stays strictly below the asymptote');
}
for(const agility of [0,6,25,150,300]) {
  eq(progression.bullsEyePercent(0,agility),0,'Agility alone cannot activate the passive');
  eq(progression.bullsEyePercent(1,agility),1,'Agility preserves the first point at 1%');
  eq(progression.bullsEyePercent(.4,agility),.4,'Fractional retained Vision is continuous below the first point');
  let previous=0;
  for(const v of [0,.1,1,2,10,81,150,300,1000]) {
    const percent=progression.bullsEyePercent(v,agility);
    ok(percent>previous||v===0,'Percentage progression is strictly increasing');previous=percent;
    eq(progression.bullsEyeVision(percent,agility),v,'Vision and percentage round-trip at fixed Agility');
  }
}
for (const extra of [{}, { criticalDamage: 10 }, { criticalDamagePlus: 10 }, { criticalPower: 10 }, { criticalPower: 10, criticalDamagePlus: 10 }]) {
  const before = entity({ agility: 10, ...extra }), after = entity({ agility: 10, vision: 100, precision: 200, precisionPlus: 100, ...extra });
  eq(D.calculateCritDamageBonus(before), D.calculateCritDamageBonus(after), 'Vision and Precision never add critical damage');
}
for (const agility of [0, 75, 150, 300]) {
  const e = entity({ occultism: 1, agility });
  eq(D.calculateOccultismTargetableChance(e), agility === 0 ? 10 : agility === 75 ? 2.5 : 0, 'Agility lowers targetability');
  eq(D.calculateOccultismTargetableChanceDisplay(e), agility === 0 ? 90 : agility === 75 ? 97.5 : 100, 'Agility improves targeting avoidance');
  const helper = _D.calculateStatsDisplay('occultism', e);
  ok(helper.umbraHelperCalculations.occultismTargetableChance.parts[1].operator === '−', 'Helper subtracts agility');
}
for (const precision of [0, 1, 30, 150]) eq(D.calculateInvisibleTargetAvoidChance(entity({ precision })), 50 * (1 - E.calculatePrecisionPercent(precision) / 100), 'Only final Precision reduces the 50% avoidance');
eq(D.calculateInvisibleTargetAvoidChance(entity({ agility: 150 })), 50, 'No separate agility accuracy bonus');
const attack = (colors, duration = 10000, range = 'range') => ({ functionName: 'vision-audit', combatFunction: 'Attaquant',
  attackTarget: ['enemy'], deadTarget: ['no'], attackRange: [range], attacknature: [], executionTime: duration,
  essenceSlots: colors.map((color, index) => ({ slotId: `vision-${index}`, kind: 'open', color, essenceSource: 'test' })) });
const base = entity({});
for (const [ms, expected] of [[0,25],[500,26.25],[1000,27.5],[5000,37.5],[10000,50],[20000,50]]) {
  eq(D.calculateRangeRatio(base, attack(['red'], ms)), expected, 'Duration raises the base penalty');
}
for (const colors of [['red'], ['yellow'], [], ['red','yellow'], ['red','blue'], ['blue','yellow']]) eq(D.calculateRangeRatio(base, attack(colors)), 50, 'Affected ranged nature');
for (const colors of [['blue'], ['red','blue','yellow']]) eq(D.calculateRangeRatio(base, attack(colors)), 0, 'Magic and prism have no ranged penalty');
eq(D.calculateRangeRatio(base, attack(['red'],10000,'melee')),0,'Melee has no distance penalty');
eq(D.calculateRangeRatio(base, { ...attack(['red']), combatFunction:'Support' }),0,'Support has no damage penalty');
eq(entity({ vision:99 }).stats.bullsEye,50,'99 Vision without Agility gives 50% directly');
eq(D.calculateRangeRatio(entity({ bullsEye:50 }),attack(['red'])),25,'Manual Bull’s Eye is directly a percentage');
eq(D.calculateRangeRatio(entity({ bullsEye:99 }),attack(['red'])),.5,'99% reduces a 50% penalty to 0.5%');
for(const vision of [0,10,200]) {
  const passive=entity({vision,bullsEye:999,bullsEyePlus:999});
  const generated=entity({vision}).stats.bullsEye || 0, expected=99;
  eq(passive.stats.bullsEye,expected,'Manual admin inputs are retained alongside the Vision passive');
  const row=S.getStatSystemResult(passive,'bullsEye');
  ok(row.uniquePassive&&row.state==='normal','Passive has no + or X variant');
  const source=S.getStatSystemSourceTotals(passive,'bullsEye');
  eq(source.reduce((sum,part)=>sum+part.value,0),expected,'Manual additions and Vision reconcile in the entity total');
  const helper=_D.calculateStatsDisplay('vision',passive);
  eq(helper.umbraHelperCalculations.bullsEyeTotal.contributions.find(part=>part.kind==='umbra').value,generated,'Passive block reports only the percentage granted by Vision');
  const manual=entity({vision,bullsEye:5,bullsEyePlus:3});
  eq(manual.stats.bullsEye,Math.min(99,generated+8),'Manual admin additions are percentage points');
  eq(D.calculateBullsEyePercent(manual),manual.stats.bullsEye,'Combat consumes the stored percentage unchanged');
}
const removed=entity({vision:20});removed.baseStats.vision=0;E.recomputeEntityStats(removed,{equippedItems:[],persistEquipment:false});
eq(removed.stats.bullsEye || 0,0,'Removing Vision removes its passive');
ok(S.calculateStatSources({vision:250},'bullsEye',{seuilUmbra:300}).value>S.calculateStatSources({vision:250},'bullsEye',{seuilUmbra:150}).value,'Raising the entity threshold improves the passive');
const {getPermanentStatChoices}=await import('../docs/js/items/permanentItems.js');
ok(getPermanentStatChoices().some(choice=>choice.key==='bullsEye'),'Manual admin grant remains available');
ok(!getPermanentStatChoices().some(choice=>choice.key==='bullsEyePlus'),'The unique Bull’s Eye passive has no autonomous + acquisition');
ok(getPermanentStatChoices().filter(choice=>choice.key.startsWith('bullsEye')).every(choice=>choice.unit===' %'),'Admin grants show percentage units');
const swift = entity({ attackExecutionReduc:20, attackProjectileSpeed:30 });
eq(D.getRangePenaltyDetails(swift,attack(['red'])).executionMs,5000,'Execution and projectile speed applied once');
eq(D.calculateRangeRatio(swift,attack(['red'])),37.5,'Speed reduces the ranged penalty');
eq(D.calculateRangeRatio(swift,{...attack(['red'],5000),effectiveExecutionTime:5000}),37.5,'Launch duration is not reduced twice');
const hasty = entity({ haste:20, strength:150 });
ok(D.calculateRangeRatio(hasty,attack(['red'])) < 50,'Haste helps ranged damage via execution duration');
for(const key of ['vision','precision','bullsEye','occultism','criticalPower','criticalDamage','rangeAttack','rangeAttackPhysical']) {
  const r=_D.calculateStatsDisplay(key,entity({vision:10,agility:10,precisionPlus:5,occultism:1}));
  ok(!/undefined|NaN/.test(r.helpContent),`${key} helper has valid figures`);
  if(key==='vision') {
    ok(r.helpContent.includes('Bull’s Eye') && r.helpContent.includes('data-helper-value="precisionUmbraGrant"'), 'Vision includes both abilities and inspectable ratios');
    for (const part of r.umbraHelperCalculations.precisionRatio.parts) {
      if (Number.isFinite(part.coefficient)) ok(H.buildUmbraContributionHelper({parts:[part]},0).includes(String(part.coefficient)), 'Vision retains the exact coefficient in its calculation detail');
    }
    ok(!r.helpContent.includes('avant arrondi'), 'Vision does not expose the verbose raw formula inline');
  }
}
ok(stats.some(s=>s.key==='vision'&&s.nature==='umbra'),'Vision is an Umbra');
ok(stats.some(s=>s.key==='precision'&&s.nature==='statistic'),'Precision is a statistic');
ok(H.buildImprovementHelperFooter('external','vision').includes('Bonus supérieur'),'Vision uses enhancement footer');
console.log(`Vision audit: ${checks} checks passed.`);
