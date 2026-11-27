import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {installEntityTestEnvironment} from './entity-test-environment.mjs';
await installEntityTestEnvironment();
const E = await import("../docs/js/entities/runtime.js"), D = await import("../docs/js/combat/statistics.js"), _D = await import("../docs/js/ui/statistics/details.js");
const S = await import("../docs/js/entities/statSystem.js"), Items=await import('../docs/js/items/permanentItems.js');
const P=globalThis.umbraProgression;
const keys=['equilibreAggroReduction','equilibreInvisibleDetection','equilibreBalancedAttackChance','equilibreAggroBonus'];
const calculators=[D.calculateEquilibreAggroReduction,D.calculateEquilibreInvisibleDetection,D.calculateEquilibreAttackChance,D.calculateEquilibreAggroBonus];
let checks=0;
const ok=(v,label)=>{assert.ok(v,label);checks++;};
const eq=(a,b,label)=>ok(Math.abs(a-b)<1e-8,`${label}: ${a} != ${b}`);
const entity=(baseStats={},seuilUmbra=150)=>{
  const e={id:989916,name:'Équilibre audit',type:'sbire',side:'A',awakening:3,seuilUmbra,
    level:{current:1,max:250},attacks:['autoAttack'],stuff:{},baseStats:{HP:1000,...baseStats}};
  E.recomputeEntityStats(e,{equippedItems:[],persistEquipment:false,skipReverseArchetype:true});return e;
};
const value=(key,u,a,limit=150)=>key===keys[2]?P.balancedAttackDetails(u,a,undefined,limit).percent:P.equilibreDetails(key,u,a,0,0,undefined,limit).value;
const empty=entity({intelligence:150,agility:150});
for(const calculate of calculators)eq(calculate({archetypeFrozen:true,stats:{equilibre:50,strength:50,intelligence:50,agility:50}}),0,'Frozen rank-two Umbra stays inactive');
for(const [i,key] of keys.entries()){
  eq(calculators[i](empty),0,'Attributes alone unlock nothing');
  eq(P.equilibre[key].maxPercent,[60,99,40,99][i],`${key}: requested asymptote`);
  let previous=0;
  for(const n of [1,10,50,150,300,1000,1e9,1e100,Number.MAX_VALUE]){
    const current=value(key,n,n);
    ok(Number.isFinite(current)&&current>=previous&&current<P.equilibre[key].maxPercent,`${key}: monotonic and strictly below asymptote`);
    previous=current;
  }
  eq(entity({[key]:7}).stats[key],7,'Direct manual percentage has no ratio');
  eq(entity({[key]:10000}).stats[key],P.equilibre[key].maxPercent,'All contributions share the effect cap');
}
const html=await readFile(new URL('../docs/index-14.html',import.meta.url),'utf8');
const script=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('window.umbraLab ='));
const context={window:{},globalThis:{umbraProgression:P}};vm.createContext(context);vm.runInContext(script,context);
const L=context.window.umbraLab;
const historical=L.initialState();historical.mode='current';historical.umbras.equilibre=150;historical.attributes.strength=150;
historical.fixed.equilibreAggroBonus=7;historical.plus.equilibreAggroBonus=5;
eq(L.calculate(historical).results.equilibreAggroBonus.total,0,'Historical comparison does not invent a previous presence bonus');
const autonomous=L.initialState();autonomous.mode='maj';autonomous.umbras.equilibre=0;autonomous.attributes.strength=50;autonomous.plus.equilibreAggroBonus=5;
const autonomousPresence=L.calculate(autonomous).results.equilibreAggroBonus;
ok(autonomousPresence.active&&autonomousPresence.state==='+','Maj keeps autonomous presence + active without Umbra');
eq(autonomousPresence.total,P.equilibreDetails('equilibreAggroBonus',0,50,0,5).value,'Maj preserves the autonomous Force ratio');
for(const threshold of [150,300,1500])for(const u of [0,1,10,149,150,151,300,1000])for(const a of [0,50,200]){
  const e=entity({equilibre:u,strength:a,intelligence:a,agility:a},threshold);
  const input=L.initialState(); input.mode='maj';input.seuilUmbra=threshold;input.umbras.equilibre=u;
  input.attributes.strength=a;input.attributes.intelligence=a;input.attributes.agility=a;
  const snapshot=L.calculate(input),retained=P.calculateStatPointLimit(u,0,0,threshold).value,attribute=P.calculateStatPointLimit(a,0,0,threshold).value;
  for(const [i,key] of keys.entries()){
    const expected=value(key,retained,attribute,threshold);
    eq(e.stats[key],expected,`${key}: entity uses shared engine`);
    eq(calculators[i](e),expected,`${key}: combat uses shared engine`);
    eq(snapshot.results[key].total,expected,`${key}: Maj agrees with combat`);
    const row=S.calculateStatSources(E.getStatSystemInputs(e),key),model=S.buildStatSystemModel(row,e);
    eq(model.contributions.reduce((sum,p)=>sum+p.value,0),expected,'Source pooling agrees');
    const cfg=L.conversionSettings(key);
    eq(L.conversionPercent(retained,{...cfg,agility:attribute,seuilUmbra:threshold}),expected,'Interactive conversion curve agrees');
  }
  const before=JSON.stringify(e),helper=_D.calculateStatsDisplay('equilibre',e);
  ok(helper.helpContent.includes('data-umbra-layout="card"'),'Shared Umbra card');
  ok(helper.helpContent.includes('data-umbra-passive="equilibreBalancedAttackChance"'),'Exclusive passive card');
  eq(helper.umbraHelperCalculations.equilibreAggroReductionTotal.value,e.stats.equilibreAggroReduction,'Helper agrees');
  assert.equal(JSON.stringify(e),before);checks++;
}
for(const key of keys.filter(key=>key!==keys[2])){
  const attr=P.equilibre[key].attribute;
  eq(P.equilibreDetails(key,0,100,0,5).attributeRatio,.5,'Autonomous + ratio stays fixed');
  ok(P.equilibreDetails(key,50,100).attributeRatio>.5,'Umbra enables progressive attribute ratio');
  const e=entity({equilibre:30,[attr]:20,[key]:3,[`${key}Plus`]:5});
  eq(e.stats[key],P.equilibreDetails(key,30,20,3,5).value,'No duplicate attribute bonus from + and Umbra');
  const before=e.stats[key];delete e.baseStats.equilibre;
  E.recomputeEntityStats(e,{equippedItems:[],persistEquipment:false});
  ok(e.stats[key]<before,'Removing Umbra recomputes direct and + sources');
  eq(e.stats[key],P.equilibreDetails(key,0,20,3,5).value,'Autonomous + remains');
}
const e=entity({equilibre:50,strength:50,intelligence:50,agility:50});
const smart=entity({equilibre:50,intelligence:51,agility:50}),agile=entity({equilibre:50,intelligence:50,agility:51});
ok(smart.stats[keys[0]]>e.stats[keys[0]],'Intelligence improves aggro reduction');
ok(smart.stats[keys[2]]>e.stats[keys[2]],'Intelligence improves balanced attack');
eq(smart.stats[keys[1]],e.stats[keys[1]],'Intelligence does not improve perception');
ok(agile.stats[keys[1]]>e.stats[keys[1]],'Agility improves perception');
eq(agile.stats[keys[2]],e.stats[keys[2]],'Agility does not improve balanced attack');
const strong=entity({equilibre:50,strength:51,intelligence:50,agility:50});
ok(strong.stats.equilibreAggroBonus>e.stats.equilibreAggroBonus,'Force improves presence');
eq(strong.stats.equilibreAggroReduction,e.stats.equilibreAggroReduction,'Force does not improve damage aggro reduction');
eq(strong.stats.equilibreInvisibleDetection,e.stats.equilibreInvisibleDetection,'Force does not improve perception');
const smartPresence=entity({equilibre:50,strength:50,intelligence:51,agility:51});
eq(smartPresence.stats.equilibreAggroBonus,e.stats.equilibreAggroBonus,'Intelligence and Agility do not improve presence');
const own=entity({equilibre:50,strength:50,equilibreAggroBonus:7,equilibreAggroBonusPlus:5});
const presentation=_D.calculateStatsDisplay('equilibre',own).umbraPresentation;
const presence=presentation.entries.find(entry=>entry.stat==='equilibreAggroBonus');
eq(presence.value,P.equilibreDetails('equilibreAggroBonus',50,50).generated,'Presence card excludes external sources');
eq(presence.total.value,own.stats.equilibreAggroBonus,'Presence helper includes external sources');
ok(presence.name==='Présence équilibrée','User-selected name');
const boosted=entity({equilibre:50,strength:50});
const initial=D.calculateEquilibreAggroBonus(boosted);
boosted.baseStats.strength=100;
E.recomputeEntityStats(boosted,{equippedItems:[],persistEquipment:false});
ok(D.calculateEquilibreAggroBonus(boosted)>initial,'Force edit takes effect on next calculation');
const original=P.equilibre.equilibreAggroBonus.ratios.attribute;
try { P.equilibre.equilibreAggroBonus.ratios.attribute=original*2;
  ok(D.calculateEquilibreAggroBonus(e)>e.stats.equilibreAggroBonus,'Live configuration is not cached between reads');
} finally {P.equilibre.equilibreAggroBonus.ratios.attribute=original;}
const choices=Items.getPermanentStatChoices();
for(const key of keys)for(const fixed of [0,5,100])for(const plus of [0,5,100]){
  const input=L.initialState();input.mode='maj';input.umbras.equilibre=50;input.attributes.strength=50;input.attributes.intelligence=50;input.attributes.agility=50;
  input.fixed[key]=fixed;input.plus[key]=plus;
  const row=L.calculate(input).results[key],e=entity({equilibre:50,strength:50,intelligence:50,agility:50,[key]:fixed,[`${key}Plus`]:plus});
  eq(row.total,e.stats[key],'Maj applies each effect cap after manual inputs');
  const parts=L.contributions(row,'maj');eq(parts.fixed+parts.plus+parts.umbra,row.total,'Displayed contributions sum to capped entity total');
}
for(const key of keys.filter(key=>key!==keys[2]))ok(choices.some(s=>s.key===`${key}Plus`),'Stat + available in admin');
ok(!choices.some(s=>s.key===`${keys[2]}Plus`),'Exclusive passive has no + variant');
const one=entity({equilibre:1});ok(one.stats[keys[2]]<1,'No old 50% granted at first point');
console.log(`Équilibre: ${checks} checks passed.`);
