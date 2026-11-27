import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {installEntityTestEnvironment} from './entity-test-environment.mjs';
await installEntityTestEnvironment();
const E = await import("../docs/js/entities/runtime.js"),D = await import("../docs/js/combat/statistics.js"), _D = await import("../docs/js/ui/statistics/details.js");
const S = await import("../docs/js/entities/statSystem.js");
const P=globalThis.umbraProgression;
let checks=0;
const ok=(v,label)=>{assert.ok(v,label);checks++;};
const eq=(a,b,label)=>ok(Math.abs(a-b)<1e-8,`${label}: ${a} != ${b}`);
const entity=(baseStats={},seuilUmbra=150)=>{
 const e={id:989919,name:'Astralité audit',type:'sbire',side:'A',awakening:3,seuilUmbra,
  level:{current:30,max:250},attacks:['autoAttack'],stuff:{},baseStats:{HP:1000,...baseStats}};
 E.recomputeEntityStats(e,{equippedItems:[],persistEquipment:false,skipReverseArchetype:true});return e;
};
const html=await readFile(new URL('../docs/index-14.html',import.meta.url),'utf8');
const script=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('window.umbraLab ='));
const context={window:{},globalThis:{umbraProgression:P}};vm.createContext(context);vm.runInContext(script,context);
const L=context.window.umbraLab;
eq(P.astralityChanceDetails(1).value,1,'First point gives exactly 1%');
eq(P.astralBodyDetails(1).value,1,'First body control chance is 1%');
eq(P.astralReturnDetails(1,0,1000).amount,100,'Starting return 10% HP');
eq(P.astralReturnDetails(1,0,1000).seconds,5,'Starting return lasts 5s');
for(const limit of [150,300])for(const a of [0,1,50,150,200,1000])for(const i of [0,50,200])for(const f of [0,50])for(const ag of [0,150])for(const fixed of [0,5]){
 const e=entity({astrality:a,intelligence:i,strength:f,agility:ag,fatalSurvival:fixed,fatalSurvivalPlus:7},limit);
 const input=L.initialState();input.mode='maj';input.seuilUmbra=limit;input.umbras.astrality=a;
 input.attributes.intelligence=i;input.attributes.strength=f;input.attributes.agility=ag;input.fixed.HP=1000;input.fixed.fatalSurvival=fixed;input.plus.fatalSurvival=7;
 const lab=L.calculate(input),fatal=S.getStatSystemResult(e,'fatalSurvival'),body=S.getStatSystemResult(e,'astralBody');
 eq(fatal.value,lab.results.fatalSurvival.total,'Maj fatal chance matches engine');
 eq(body.value,lab.results.astralBody.total,'Maj body chance matches engine');
 eq(D.calculateAstralityTotal(e),fatal.value,'Combat uses pooled chance');
 eq(D.calculateAstralReturn(e).percent,lab.results.astralReturn.total,'Maj return percent');
 eq(D.calculateAstralReturn(e).seconds,lab.results.astralReturn.returnDetails.seconds,'Maj return duration');
 eq(D.calculateAstralCooldown(e).seconds,lab.results.fatalSurvival.cooldownDetails.seconds,'Maj common cooldown matches engine');
 eq(D.calculateAstralBody(e).seconds,lab.results.astralBody.bodyDetails.seconds,'Maj body duration');
 const parts=L.contributions(lab.results.fatalSurvival,'maj');eq(parts.fixed+parts.plus+parts.umbra,fatal.value,'No duplicate autonomous ratio');
 const h=_D.calculateStatsDisplay('astrality',e);
 ok(!/NaN|undefined/.test(h.helpContent),'Valid markup');
 ok(h.helpContent.includes('data-umbra-passive="astralBody"'),'Exclusive body card');
 ok(h.helpContent.includes('data-umbra-capacity="astralReturn"'),'Return card');
}
const alone=entity({fatalSurvival:5,fatalSurvivalPlus:7,intelligence:50});
const autonomous=P.astralityChanceDetails(0,50,5,7);
eq(autonomous.attributeRatio,.5,'Autonomous plus keeps static Intelligence ratio');eq(D.calculateAstralityTotal(alone),autonomous.value,'Autonomous plus uses common percentage conversion');
eq(D.calculateAstralReturn(alone).seconds,0,'No return without Umbra');eq(D.calculateAstralBody(alone).value,0,'No body without Umbra');
for(const a of [1,50,150,1000,1e8]){
 const r=P.astralReturnDetails(a,50,1000);eq(r.seconds,5,'Force never changes cooldown');eq(r.percent,P.astralReturnDetails(1,50,1000).percent,'Umbra quantity never changes healing');
 ok(r.percent<100&&r.seconds===5,'Return asymptotic limits');
 ok(P.astralityChanceDetails(a,50).value<99,'Fatal chance asymptotic limit');
 ok(P.astralBodyDetails(a,50).value<25,'Body chance asymptotic limit');
 eq(P.astralBodyDetails(a).seconds,3*P.getProgressiveRatio(a,'astrality'),'Body duration follows own curve');
}
for(const key of ['fatalSurvival','astralReturn','astralBody'])for(const a of [1,50,150]) {
 const settings={...L.conversionSettings(key),agility:50};
 const expected=key==='astralReturn'?P.astralReturnDetails(1,a).percent:key==='astralBody'?P.astralBodyDetails(a,50).value:P.astralityChanceDetails(a,50).value;
 eq(L.conversionPercent(a,settings),expected,'Conversion graph follows real formula');
 eq(L.conversionPoints(expected,settings),a,'Conversion graph inverse finds original points');
}
const returnCurve=L.conversionSettings('astralReturn');
eq(L.conversionPercent(0,returnCurve),10,'Zero Force still grants the base healing');
eq(L.conversionPoints(10,returnCurve),0,'Base healing maps to zero Force');
ok(Number.isNaN(L.conversionPoints(0,returnCurve)),'Impossible healing percentage rejected');
for(const ag of [0,1,50,150,1e8]){
 eq(P.astralCooldownDetails(0,ag).seconds,5,'Autonomous delay ignores Agility');
 const cd=P.astralCooldownDetails(1,ag),r=P.astralReturnDetails(1,50,1000,ag);
 ok(cd.seconds<=5&&cd.seconds>2,'Cooldown remains between base and asymptote');
 eq(r.seconds,cd.seconds,'Return duration is common cooldown');
 eq(r.amount,P.astralReturnDetails(1,50,1000,0).amount,'Agility preserves healing budget');
 eq(P.astralCooldownDetails(150,ag).seconds,cd.seconds,'Umbra amount does not affect cooldown');
}
const historical=L.initialState();historical.mode='current';historical.umbras.astrality=26;historical.attributes.intelligence=30;historical.fixed.fatalSurvival=5;historical.plus.fatalSurvival=7;
eq(L.calculate(historical).results.fatalSurvival.total,42.6,'Old uses historical chance without new autonomous bonuses');
const cfg=P.astrality,saved=structuredClone(cfg),curve={...P.progression.curves.astrality};
try{
 cfg.fatalSurvival.ratios.attribute=.25;cfg.astralBody.baseDurationSeconds=4;cfg.astralBody.checkSeconds=2;
 cfg.astralReturn.basePercent=12;cfg.astralReturn.ratios.attribute=.25;cfg.astralCooldown.baseSeconds=8;cfg.astralCooldown.minSeconds=3;cfg.astralCooldown.attributeRatio=.3;P.progression.curves.astrality.intensity=4;
 const e=entity({astrality:50,strength:50,intelligence:50}),input=L.initialState();input.mode='maj';input.umbras.astrality=50;input.attributes.strength=50;input.attributes.intelligence=50;
 const r=L.calculate(input);eq(r.results.fatalSurvival.total,D.calculateAstralityTotal(e),'Changed settings shared by Maj');
 eq(r.results.astralReturn.total,D.calculateAstralReturn(e).percent,'Changed return settings shared');
 eq(r.results.fatalSurvival.cooldownDetails.seconds,D.calculateAstralCooldown(e).seconds,'Changed cooldown settings shared');
 eq(r.results.astralBody.bodyDetails.seconds,D.calculateAstralBody(e).seconds,'Changed body settings shared');
}finally{Object.assign(cfg,saved);P.progression.curves.astrality=curve;}
console.log(`Astralité: ${checks} checks passed.`);
