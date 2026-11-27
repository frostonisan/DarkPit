import assert from 'node:assert/strict';
import { installEntityTestEnvironment } from './entity-test-environment.mjs';
await installEntityTestEnvironment();
const E = await import("../docs/js/entities/runtime.js");
const D = await import("../docs/js/combat/statistics.js"), _D = await import("../docs/js/ui/statistics/details.js");
const S = await import("../docs/js/entities/statSystem.js");
const P = await import('../docs/js/items/permanentItems.js');
const live = globalThis.umbraProgression;
let checks = 0;
const eq = (a,b,label) => { assert.ok(Math.abs(a-b)<1e-8, `${label}: ${a} != ${b}`); checks++; };
const ok = (value,label) => { assert.ok(value,label); checks++; };
const entity = (baseStats, seuilUmbra=150) => {
  const e={id:989711,name:'Critique audit',type:'sbire',side:'A',awakening:3,seuilUmbra,
    level:{current:1,max:250},attacks:['autoAttack'],stuff:{},stats:{},baseStats:{HP:100,...baseStats}};
  E.recomputeEntityStats(e,{equippedItems:[],persistEquipment:false,skipReverseArchetype:true});return e;
};
for (const criticalPower of [0,1,2,50,149,150,151,300,1000]) for (const agility of [0,1,6,100,150,300]) {
  const e=entity({criticalPower,agility,criticalChance:7,criticalChancePlus:3,criticalDamage:9});
  const power=S.calculateStatPointLimit(criticalPower).value,agi=S.calculateStatPointLimit(agility).value;
  const chance=live.criticalChanceDetails(power,agi,7,3);
  eq(e.stats.criticalChance,chance.value,'Final chance is the direct percentage');
  eq(D.calculateCritTotalChance(e),chance.value,'Combat chance agrees');
  eq(e.stats.criticalDamage,59+live.criticalDamageDetails(power).value,'Native damage counted once');
  for(const key of ['criticalChance','criticalDamage']) {
    const row=S.getStatSystemResult(e,key),model=S.buildStatSystemModel(row,e);
    eq(model.contributions.reduce((sum,p)=>sum+p.value,0),row.value,'Source totals reconcile');
    eq(model.parts.reduce((sum,p)=>sum+p.value,0),row.value,'Calculation reconciles');
  }
  const before=JSON.stringify(e);
  const helper=_D.calculateStatsDisplay('criticalPower',e);
  ok(helper.helpContent.includes('data-umbra-passive="criticalDamage"'),'Damage gets exclusive passive card');
  ok(helper.helpContent.includes('data-umbra-layout="card"'),'Main Umbra gets compact card');
  eq(helper.umbraHelperCalculations.criticalDamageTotal.contributions.find(p=>p.kind==='umbra').value,live.criticalDamageDetails(power).value,'Native 50 excluded from Umbra grant');
  assert.equal(JSON.stringify(e),before);checks++;
  E.recomputeEntityStats(e,{equippedItems:[],persistEquipment:false});
  eq(e.stats.criticalChance,chance.value,'Recompute does not accumulate');
}
eq(entity({agility:150,criticalChance:12}).stats.criticalChance,12,'Normal chance has no Agility ratio');
eq(entity({agility:150}).stats.criticalChance,0,'Agility alone cannot activate chance');
eq(entity({agility:150,criticalDamage:12}).stats.criticalDamage,62,'Manual damage retains native base');
const plus=live.criticalChanceDetails(0,100,0,1);
eq(live.criticalChanceDetails(50,100,-10).value,live.criticalChanceDetails(50,100).value-10,'A flat malus reduces generated chance');
eq(live.criticalChanceDetails(50,100,1).value,live.criticalChanceDetails(50,100).value+1,'An autonomous +1% remains a direct +1%');
eq(live.criticalChanceDetails(50,100,100).value,99,'Direct gains share the final cap');
for(const key of ['criticalChance','criticalDamage']) for(const malus of [-5,-1000]) {
  const row=S.calculateStatSources({criticalPower:50,[key]:malus},key),model=S.buildStatSystemModel(row);
  eq(model.contributions.reduce((sum,p)=>sum+p.value,0),row.value,'Malus contributions reconcile at zero');
}
eq(plus.attributeRatio,.5,'Autonomous + uses fixed Agility base');
ok(live.criticalChanceDetails(1,100).attributeRatio>.5,'X unlocks progressive Agility');
eq(entity({criticalPower:50,agility:0}).stats.criticalDamage,entity({criticalPower:50,agility:150,vision:150,precision:150}).stats.criticalDamage,'Damage depends only on Coup critique');
for(const n of [1e3,1e9,1e100,Number.MAX_VALUE]) {
  const value=live.criticalChanceDetails(n,n).value;
  ok(Number.isFinite(value)&&value<99,'Finite ratio gains stay below 99');
}
ok(entity({criticalPower:300},300).stats.criticalChance>entity({criticalPower:300},150).stats.criticalChance,'Entity threshold applies to Coup critique');
const e=entity({criticalPower:50,agility:100});
const attack=colors=>({combatFunction:'Attaquant',attackRange:['range'],attackTarget:['enemy'],deadTarget:['no'],
  essenceSlots:colors.map((color,i)=>({slotId:`crit-${i}`,kind:'open',color,essenceSource:'test'}))});
for(const colors of [[],['red'],['blue'],['yellow','blue'],['red','blue','yellow']]) {
  const projected=D.createAttackStatView(e,attack(colors));
  eq(D.calculateCritTotalChance(projected),0,'Incompatible attack loses Umbra chance');
  eq(D.calculateCritDamageBonus(projected),50,'Incompatible attack keeps only native damage');
}
for(const colors of [['yellow'],['yellow','yellow','blue']]) eq(D.calculateCritTotalChance(D.createAttackStatView(e,attack(colors))),e.stats.criticalChance,'Compatible attack gets chance');
const manual=entity({criticalPower:50,agility:100,criticalChance:10,criticalDamage:15});
const projected=D.createAttackStatView(manual,attack(['red']));
eq(D.calculateCritTotalChance(projected),10,'Autonomous chance works without compatible Umbra');
eq(D.calculateCritDamageBonus(projected),65,'Manual damage remains valid');
const random=Math.random,log=console.log;
try {
  console.log=()=>{};Math.random=()=>0;
  eq(D.attemptCriticalHit(projected,null,100).finalDamage,165,'Combat applies damage bonus');
  Math.random=()=>.999999;
  ok(!D.attemptCriticalHit(e,null,100).isCritical,'Roll above chance stays normal');
} finally {Math.random=random;console.log=log;}
delete e.baseStats.criticalPower;E.recomputeEntityStats(e,{equippedItems:[],persistEquipment:false});
eq(e.stats.criticalChance,0,'Removing Umbra clears derived chance');eq(e.stats.criticalDamage,50,'Removing Umbra clears passive damage');
const choices=P.getPermanentStatChoices();
ok(choices.some(p=>p.key==='criticalChancePlus'),'Chance + is available');
ok(!choices.some(p=>p.key==='criticalDamagePlus'),'Damage has no + variant');
ok(choices.some(p=>p.key==='criticalDamage'),'Admin manual damage remains available');
console.log(`Critical audit: ${checks} checks passed.`);
