import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {installEntityTestEnvironment} from './entity-test-environment.mjs';
await installEntityTestEnvironment();
const E = await import("../docs/js/entities/runtime.js"),D = await import("../docs/js/combat/statistics.js"), _D = await import("../docs/js/ui/statistics/details.js"), _D2 = await import("../docs/js/combat/damageRules.js");
const S = await import("../docs/js/entities/statSystem.js"),Items=await import('../docs/js/items/permanentItems.js');
const Helpers=await import('../docs/js/data/helpers.js');
const P=globalThis.umbraProgression;
let checks=0;
const ok=(value,label)=>{assert.ok(value,label);checks++;};
const eq=(a,b,label)=>ok(Math.abs(a-b)<1e-8,`${label}: ${a} != ${b}`);
const entity=(baseStats={},seuilUmbra=150)=>{
  const e={id:989901,name:'Résilience audit',type:'sbire',side:'A',awakening:3,seuilUmbra,
    level:{current:1,max:250},attacks:['autoAttack'],stuff:{},stats:{},baseStats:{HP:1000,...baseStats}};
  E.recomputeEntityStats(e,{equippedItems:[],persistEquipment:false,skipReverseArchetype:true});return e;
};
const keys=['criticalResistance','alterationResistance','hindranceResistance','resilienceTotal'];
const calculators=[D.calculateResilienceCritTotalBonus,D.calculateResilienceAlterationTotalBonus,D.calculateHindranceResistance,D.calculateResilienceTotalCancelBonus];
for(const key of keys){
  eq(P.resilience[key].constant,98,`${key}: shared conversion spread`);
  eq(P.resilience[key].maxPercent,key==='resilienceTotal'?25:50,`${key}: final effect limit`);
}
// Equal inputs produce equal percentages for all three ordinary resistances.
for(const [key,expected] of [['criticalResistance',26.915935989205465],['alterationResistance',26.915935989205465],['hindranceResistance',26.915935989205465],['resilienceTotal',4.06780980420414]]){
  const value=key==='resilienceTotal'?P.resilienceCancelDetails(50,50).percent:P.resilienceDetails(key,50,50).value;
  eq(value,expected,`${key}: 50 Resilience and 50 relevant attribute`);
}
eq(entity({resilience:100,strength:50}).stats.resilienceTotal,6.997104067358739,'Selected curve: 100 Resilience / 50 Force');
const pig=entity({resilience:50,strength:1,intelligence:5,agility:3});
for(const [i,expected] of [21.94968343325391,22.29502352923642,22.118881256740856,2.8663765808956194].entries()) {
  eq(calculators[i](pig),expected,`${keys[i]}: pig reference`);
}
eq(100*(1-(1-pig.stats.resilienceTotal/100)*(1-pig.stats.hindranceResistance/100)),24.351247405337148,'Pig combined entrave cancellation');
const pigHelper=_D.calculateStatsDisplay('resilience',pig);
for(const key of keys) {
  const cap=P.resilience[key].maxPercent;
  const entry=pigHelper.umbraPresentation.entries.find(entry=>entry.stat===key);
  ok(Helpers.buildUmbraEntryExplanation(entry,pigHelper).includes(`data-resilience-limit="${cap}"`),`${key}: Umbra detail shows shared cap`);
  ok(Helpers.buildPlayerStatHelper(key,_D.calculateStatsDisplay(key,pig)).includes(`data-resilience-limit="${cap}"`),`${key}: statistic helper shows shared cap`);
  ok(_D.calculateStatsDisplay(key,pig).helpContent.includes(`data-resilience-limit="${cap}"`),`${key}: complete statistic helper shows shared cap`);
}
const empty=entity({strength:150,intelligence:150,agility:150});
for(const [i,key] of keys.entries())eq(calculators[i](empty),0,`${key}: attributes alone grant no protection`);
eq(D.calculateResilienceAlterationBonus(empty),0,'No minimum 3%');
for(const threshold of [150,300])for(const resilience of [0,1,10,149,150,151,299,300,301,1000])for(const attribute of [0,1,6,150,500]){
  const e=entity({resilience,strength:attribute,intelligence:attribute,agility:attribute},threshold);
  const retained=P.calculateStatPointLimit(resilience,0,0,threshold).value;
  const a=P.calculateStatPointLimit(attribute,0,0,threshold).value;
  for(const [i,key] of keys.entries()){
    const expected=key==='resilienceTotal'?P.resilienceCancelDetails(retained,a,undefined,threshold).percent:P.resilienceDetails(key,retained,a,0,0,undefined,threshold).value;
    eq(e.stats[key],expected,`${key}: shared curve`);eq(calculators[i](e),expected,`${key}: combat agrees`);
    const row=S.calculateStatSources(E.getStatSystemInputs(e),key),model=S.buildStatSystemModel(row,e);
    eq(model.contributions.reduce((sum,p)=>sum+p.value,0),expected,`${key}: contribution totals`);
    ok(expected>=0&&expected<P.resilience[key].maxPercent,`${key}: finite result below asymptote`);
  }
  const before=JSON.stringify(e),helper=_D.calculateStatsDisplay('resilience',e);
  ok(helper.helpContent.includes('data-umbra-passive="resilienceTotal"'),'Exclusive passive card');
  ok(helper.helpContent.includes('data-umbra-layout="card"'),'Main card layout');
  ok(!/seuil|maximum|plafond|Max atteint/i.test(helper.helpContent),'No threshold notices in helper');
  eq(helper.umbraHelperCalculations.criticalResistanceTotal.value,e.stats.criticalResistance,'Helper agrees');
  assert.equal(JSON.stringify(e),before);checks++;
}
for(const key of keys){
  eq(entity({[key]:20,strength:150,intelligence:150,agility:150}).stats[key],20,`${key}: flat has no ratio`);
  for(const points of [1e3,1e9,1e100,Number.MAX_VALUE]){
    const value=key==='resilienceTotal'?P.resilienceCancelDetails(points,points).percent:P.resilienceDetails(key,points,points).value;
    ok(Number.isFinite(value)&&value<P.resilience[key].maxPercent,`${key}: asymptote at huge scores`);
  }
  eq(entity({[key]:1000}).stats[key],P.resilience[key].maxPercent,`${key}: manual gains share final cap`);
  const e=entity({resilience:50,strength:50,intelligence:50,agility:50,[key]:7});
  const old=e.stats[key];delete e.baseStats.resilience;
  E.recomputeEntityStats(e,{equippedItems:[],persistEquipment:false});
  eq(e.stats[key],7,`${key}: removing Umbra removes its generated effect`);ok(old>7,'Umbra had an effect');
}
for(const key of keys.slice(0,3)){
  const attr=P.resilience[key].attribute;
  const row=S.calculateStatSources({[`${key}Plus`]:5,[attr]:100},key);
  eq(row.value,P.resilienceDetails(key,0,100,0,5).value,'Autonomous + fixed attribute ratio');
  const fixedRatio=.5;
  eq(P.resilienceDetails(key,0,100,0,5).attributeRatio,fixedRatio,'Fixed attribute ratio without Umbra');
  ok(P.resilienceDetails(key,50,100).attributeRatio>fixedRatio,'X progressive attribute');
  eq(P.resilienceDetails(key,50,100,5).value,P.resilienceDetails(key,50,100).value+5,'Direct % remains direct');
}
eq(D.attemptResilienceCritReduction(null,entity({criticalResistance:60}),150,100),125,'Resistance caps at 50% and preserves base critical damage');
eq(D.attemptResilienceCritReduction(null,empty,150,100),150,'No free critical reduction');
for(const base of [0,1,10,100,1000])for(const bonus of [0,1,50,500])for(const reduction of [0,20,60,99,100]){
  const value=_D2.reduceCriticalSupplement(base+bonus,base,reduction);
  ok(value>=base&&value<=base+bonus,'Mitigation preserves normal hit and never increases damage');
}
const protection=entity({alterationResistance:50}),agilityOnly=entity({hindranceResistance:50});
const stun={type:['alteration'],effectName:'stun',effectDuration:5};
const immobilisation={type:['entrave'],effectName:'immobilisation',effectDuration:5,blocksMovement:true};
eq(D.calculateResilienceEffectDuration(protection,stun),2.5,'Intelligence shortens a Stun');
eq(D.calculateResilienceEffectDuration(agilityOnly,stun),5,'Agility no longer shortens duration');
eq(stun.effectDuration,5,'Catalog unchanged');
eq(D.calculateResilienceEffectDuration(protection,{type:['entrave'],effectName:'immobilisation',effectDuration:5,blocksMovement:true}),5,'Pure entraves do not inherit alteration mitigation');
eq(D.calculateResilienceEffectDuration(protection,{type:['alteration'],effectDuration:5,effectDot:50}),5,'DoT duration unchanged');
eq(D.calculateResilienceEffectDuration(protection,{type:['bonus'],effectDuration:5}),5,'Buff duration unchanged');
const slow={type:['alteration'],effectDuration:5,slowPercent:40,intensityFields:['slowPercent']};
const prepared=D.prepareResilienceEffect(protection,slow);
eq(prepared.effectDuration,2.5,'Non-damaging malus duration reduced');eq(prepared.slowPercent,40,'No double mitigation of magnitude and duration');
const preparedDot=D.prepareResilienceEffect(protection,{type:['alteration'],effectDuration:5,effectDot:100});
eq(preparedDot.effectDot,100,'DoT damage mitigated once in damage engine');
eq(D.getAlterationTiming(protection,preparedDot).duration,5,'DoT keeps cadence and duration');
eq(D.getAlterationTiming(protection,preparedDot).baseDuration,5,'Base DoT timing retained');
const guarded=entity({resilienceTotal:50,hindranceResistance:50});
let canceledAtCap=0;
for(const first of [.125,.375,.625,.875])for(const second of [.25,.75]){
  const rolls=[first,second];let index=0;
  canceledAtCap+=Number(D.rollAlterationResistance(guarded,immobilisation,()=>rolls[index++]).canceled);
}
eq(canceledAtCap/8,.625,'Priority protections cap at 62.5% combined, including autonomous gains');
for(const effect of [immobilisation,{type:'entrave',forcedMovement:true},{type:['entrave'],effectName:'weight'}]){
  for(const [rolls,kind,count] of [[[.1],'resilienceCancel',1],[[.7,.1],'hindranceResistance',2],[[.7,.7],null,2]]){
    let calls=0;const result=D.rollAlterationResistance(guarded,effect,()=>rolls[calls++]);
    ok(result.kind===kind,'Resilience total precedes specific resistance');eq(calls,count,'No extra rolls after successful priority protection');
  }
}
let calls=0;ok(!D.rollAlterationResistance(guarded,{type:['alteration'],effectDot:10},()=>{calls++;return .7;}).canceled,'Non-entrave does not use Agility');eq(calls,1,'One roll for poison');
calls=0;D.rollAlterationResistance(guarded,{type:['bonus']},()=>{calls++;return 0;});eq(calls,0,'Buffs never roll resistance');
const baseline=entity({resilience:50}),strong=entity({resilience:50,strength:150}),smart=entity({resilience:50,intelligence:150}),agile=entity({resilience:50,agility:150});
ok(strong.stats.resilienceTotal>baseline.stats.resilienceTotal,'Force improves exclusive cancellation');
ok(strong.stats.criticalResistance>baseline.stats.criticalResistance,'Force improves critical resistance');
eq(agile.stats.resilienceTotal,baseline.stats.resilienceTotal,'Agility does not improve exclusive cancellation');
eq(smart.stats.resilienceTotal,baseline.stats.resilienceTotal,'Intelligence does not improve exclusive cancellation');
ok(agile.stats.hindranceResistance>baseline.stats.hindranceResistance,'Agility improves recovery');
eq(agile.stats.alterationResistance,baseline.stats.alterationResistance,'Agility does not improve intensity');
ok(smart.stats.alterationResistance>baseline.stats.alterationResistance,'Intelligence improves intensity');
eq(smart.stats.hindranceResistance,baseline.stats.hindranceResistance,'Intelligence does not improve recovery');
eq(strong.stats.hindranceResistance,baseline.stats.hindranceResistance,'Force does not improve recovery');
for(const r of [1,10,50,150,300,1000])for(const a of [0,10,150,300]){
  const expected=P.resilienceDetails('criticalResistance',r,a).value;
  eq(P.resilienceDetails('hindranceResistance',r,a).value,expected,'Entraves share the critical resistance calculation');
  eq(P.resilienceDetails('alterationResistance',r,a).value,expected,'Alterations share the critical resistance calculation');
}
const independentBase=entity({resilience:50,strength:50,intelligence:50,agility:50});
for(const [attribute,key] of [['strength','criticalResistance'],['intelligence','alterationResistance'],['agility','hindranceResistance']]){
  const raised=entity({resilience:50,strength:50,intelligence:50,agility:50,[attribute]:51});
  for(const other of keys.slice(0,3)){
    if(other===key)ok(raised.stats[other]>independentBase.stats[other],`${attribute}: its own resistance increases`);
    else eq(raised.stats[other],independentBase.stats[other],`${attribute}: unrelated resistance unchanged`);
  }
  ok(P.getProgressiveRatio(51,attribute)>P.getProgressiveRatio(50,attribute),`${attribute}: its ratio grows with its own points`);
}
const choices=Items.getPermanentStatChoices();
ok(choices.some(s=>s.key==='criticalResistancePlus'),'Critical resistance + in admin');
ok(choices.some(s=>s.key==='alterationResistancePlus'),'Alteration resistance + in admin');
ok(choices.some(s=>s.key==='hindranceResistancePlus'),'Recovery + in admin');
ok(!choices.some(s=>s.key==='resilienceTotalPlus'),'No passive + variant');
ok(choices.some(s=>s.key==='resilienceTotal'),'Manual passive input still allowed');
// Same source classes and threshold for every generated effect; no second discount.
for(const threshold of [150,300])for(const [natural,other,crystal,expected] of [[threshold+10,0,0,threshold+1],[threshold,10,0,threshold+5],[threshold,0,10,threshold+10]]){
  const retained=P.calculateStatPointLimit(natural,other,crystal,threshold).value;
  eq(retained,expected,'10/50/100 source overflow');
  for(const key of keys){const row=S.calculateStatSources({resilience:retained},key,{effective:true});
    eq(row.umbra,expected,'Effective input not limited twice');}
}
// Index 14 numerical engine, isolated from its UI and game storage.
const html=await readFile(new URL('../docs/index-14.html',import.meta.url),'utf8');
const script=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('window.umbraLab ='));
const context={window:{},globalThis:{umbraProgression:P}};vm.createContext(context);vm.runInContext(script,context);
const L=context.window.umbraLab;
for(const threshold of [150,300])for(const agility of [0,50,150,300]){
  const input=L.initialState();input.mode='maj';input.seuilUmbra=threshold;input.umbras.vision=200;input.attributes.agility=agility;
  const row=L.calculate(input).results.bullsEye;
  eq(row.total,entity({vision:200,agility},threshold).stats.bullsEye,'Index14: Bull’s Eye still uses Agility');
  ok(row.attribute==='agility','Bull’s Eye ratio retains Agility label');
}
for(const threshold of [150,300])for(const r of [0,10,150,300,1000]){
  const input=L.initialState();input.mode='maj';input.seuilUmbra=threshold;input.umbras.resilience=r;
  input.attributes.strength=50;input.attributes.intelligence=100;input.attributes.agility=150;
  input.fixed.criticalResistance=7;input.plus.alterationResistance=4;
  const e=entity({resilience:r,strength:50,intelligence:100,agility:150,criticalResistance:7,alterationResistancePlus:4},threshold);
  const snapshot=L.calculate(input);
  for(const key of keys){eq(snapshot.results[key].total,e.stats[key],`${key}: Index14 equals game`);
    eq(Object.entries(L.contributions(snapshot.results[key],'maj')).filter(([k])=>k!=='x').reduce((n,[,v])=>n+v,0),e.stats[key],'Index14 contributions');}
}
for(const key of keys)for(const a of [0,50,150])for(const points of [1,50,150,300])for(const limit of [20,99,100]){
  const settings={...L.conversionSettings(key),agility:a,limit};
  const percent=L.conversionPercent(points,settings);
  eq(L.conversionPoints(percent,settings),points,`${key}: point/% roundtrip`);
}
console.log(`Résilience audit: ${checks} checks passed.`);
