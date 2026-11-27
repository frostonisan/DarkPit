import assert from 'node:assert/strict';
import { installEntityTestEnvironment } from './entity-test-environment.mjs';
await installEntityTestEnvironment();
const E = await import('../docs/js/entities/runtime.js');
const D = await import('../docs/js/combat/statistics.js');
const H = await import('../docs/js/ui/statistics/details.js');
const V = await import('../docs/js/combat/vitalRules.js');
const P = globalThis.umbraProgression;
let checks = 0;
const eq = (a,b,label) => { assert.ok(Math.abs(a-b)<1e-8,`${label}: ${a} != ${b}`); checks++; };
const ok = (value,label) => { assert.ok(value,label); checks++; };
const recalc=e=>E.recomputeEntityStats(e,{equippedItems:[],persistEquipment:false,skipReverseArchetype:true});
const entity=(points,agility=points,strength=points,intelligence=points,limit=1500)=>{
  const e={id:989779,type:'sbire',side:'A',awakening:3,seuilUmbra:limit,level:1,attacks:['autoAttack'],stuff:{},stats:{},
    baseStats:{HP:100000,esoterism:points,agility,strength,intelligence}};
  recalc(e);return e;
};
const rows=[
  [1,2,42.82599811701811,.5101900926562254,4.984539694161932],
  [10,10.333774558162489,61.32282933043618,5.451400105956484,4.834806057395258],
  [150,73.1624500665779,95,58.020063357972546,3.24181626187962],
  [1500,98.3238081962643,98.91655836709731,97.65679080714385,2.040703308874429],
];
for(const [n,chance,reduction,piercing,seconds] of rows){
  const e=entity(n),before=JSON.stringify(e),shown=H.calculateStatsDisplay('esoterism',e);
  eq(D.calculateEsoterismChance(e),chance,'Combat chance');eq(E.calculateEsoterismPercent(e),chance,'Runtime chance');
  eq(D.calculateEsoterismtotalReduction(e),reduction,'Combat reduction');
  eq(D.esoterismResult(e,'piercing').value,piercing,'Force chance');eq(D.esoterismResult(e,'cooldown').seconds,seconds,'Intelligence cooldown');
  eq(shown.esoterismBonus,chance,'Displayed chance');eq(shown.esoterismTotalReduction,reduction,'Displayed reduction');
  eq(shown.esoterismPiercingChance,piercing,'Displayed Force chance');eq(shown.esoterismPiercingReduction,reduction/2,'Piercing is exactly half');
  eq(shown.esoterismCooldown.seconds,seconds,'Displayed cooldown');
  for(const id of ['esoterismBonus','esoterismTotalReduction','esoterismPiercingChance','esoterismPiercingReduction']){
    const m=shown.umbraHelperCalculations[id];eq(m.parts.reduce((sum,p)=>sum+p.value,0),m.value,`${id} parts reconcile`);
    ok(m.parts.every(p=>!p.rounded),`${id} uses precise contributions`);
  }
  const entries=shown.umbraPresentation.entries;
  ok(entries.length===5&&entries.every(e=>e.exclusive||e.passiveOf),'Only exclusive parameters');
  ok(entries.every(e=>!e.state&&!e.grant),'No autonomous X or flat grants');
  assert.equal(JSON.stringify(e),before,'Read-only helpers');checks++;
}
const e=entity(150,150,150,150,150);
const before=D.esoterismResult(e,'reduction').value;
e.seuilUmbra=1500;recalc(e);eq(D.esoterismResult(e,'reduction').value,before,'Limit does not renormalize existing ratios');
const clamped=entity(1500,1500,1500,1500,150);
ok(D.calculateEsoterismChance(clamped)<rows.at(-1)[1],'Entity point threshold and overflow are consumed');
ok(P.esoterismChanceDetails(1500,150).value<P.esoterismChanceDetails(1500,1500).value,'Curve respects owner threshold');
const noUmbra=entity(0,1500,1500,1500);
eq(D.calculateEsoterismChance(noUmbra),0,'No Umbra chance');eq(D.calculateEsoterismtotalReduction(noUmbra),0,'No Umbra reduction');
eq(D.esoterismResult(noUmbra,'piercing').value,0,'Force cannot create the Umbra');
const solo=entity(1,0,0,0);eq(D.calculateEsoterismtotalReduction(solo),40,'Base magic protection');eq(D.esoterismResult(solo,'reduction').piercingValue,20,'Half base protection');
eq(D.esoterismResult(solo,'piercing').value,0,'Zero Force gives no piercing roll');eq(D.esoterismResult(solo,'cooldown').seconds,5,'Base cooldown');
const chance=D.calculateEsoterismChance(e),cd=D.esoterismResult(e,'cooldown').seconds;
e.modifierStats.preview={statLeveled:{strength:100}};
ok(D.esoterismResult(e,'piercing').value>rows[2][3],'Force preview improves extension');
eq(D.calculateEsoterismChance(e),chance,'Force does not change main chance');eq(D.calculateEsoterismtotalReduction(e),95,'Force does not change magnitude');
eq(D.esoterismResult(e,'cooldown').seconds,cd,'Force does not change cooldown');
e.modifierStats.preview={statLeveled:{intelligence:100}};ok(D.esoterismResult(e,'cooldown').seconds<cd,'Intelligence preview reduces cooldown');
e.modifierStats.preview={statLeveled:{agility:100}};ok(D.calculateEsoterismtotalReduction(e)>95,'Agility preview increases magnitude');
e.modifierStats.preview={statLeveled:{esoterism:-150}};eq(D.calculateEsoterismtotalReduction(e),0,'Removing Umbra removes its base');
e.modifierStats={};
const ratio=P.esoterism.reduction.attributeRatio;
try{P.esoterism.reduction.attributeRatio*=2;ok(D.calculateEsoterismtotalReduction(e)>95,'Live coefficient edit');}
finally{P.esoterism.reduction.attributeRatio=ratio;}
eq(D.calculateEsoterismtotalReduction(e),95,'No stale balance cache');
const input={physical:100,magical:1000,piercingDamage:1000,hybridalDamage:1000};
assert.deepEqual(V.calculateEsoterismSources(input,95,47.5),{physical:100,magical:50,piercingDamage:525,hybridalDamage:525});checks++;
eq(V.calculateDefensiveHpTotal(input,{esoterism:95,esoterismPiercing:47.5}),1200,'Counterfactual accounting includes both reductions');
assert.deepEqual(V.calculateEsoterismSources({physical:11,piercingDamage:101,hybridalDamage:11},0,47.5),{physical:11,piercingDamage:54,hybridalDamage:11,magical:0});checks++;
console.log(`Esoterism: ${checks} checks passed.`);
