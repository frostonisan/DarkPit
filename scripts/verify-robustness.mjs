import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {installEntityTestEnvironment} from './entity-test-environment.mjs';
await installEntityTestEnvironment();
const E = await import("../docs/js/entities/runtime.js"),D = await import("../docs/js/ui/statistics/details.js");
const S = await import("../docs/js/entities/statSystem.js"),U = await import("../docs/js/entities/progression.js");
const A=await import('../docs/js/items/armor.js'),Rules = await import("../docs/js/entities/rules.js");
const P=globalThis.umbraProgression;
let checks=0;
const ok=(v,label)=>{assert.ok(v,label);checks++;};
const eq=(a,b,label)=>ok(Math.abs(a-b)<1e-8,`${label}: ${a} != ${b}`);
const options={equippedItems:[],persistEquipment:false,skipReverseArchetype:true};
const entity=(baseStats={},seuilUmbra=150)=>{
 const e={id:989918,name:'Robustesse audit',type:'sbire',side:'A',awakening:3,seuilUmbra,
  level:{current:30,max:250},attacks:['autoAttack'],stuff:{},baseStats:{HP:1000,...baseStats}};
 E.recomputeEntityStats(e,options);return e;
};
const html=await readFile(new URL('../docs/index-14.html',import.meta.url),'utf8');
const script=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('window.umbraLab ='));
const context={window:{},globalThis:{umbraProgression:P}};vm.createContext(context);vm.runInContext(script,context);
const L=context.window.umbraLab;
for(const [r,f,expected] of [[1,0,2],[10,10,27],[1,100,90],[50,50,164],[150,150,567]]){
 const e=entity({robustness:r,strength:f});
 eq(e.stats.armor.totalMax,expected,'Approved example');eq(e.armorLayers.robustness.max,expected,'Solar capacity includes direct gift');
 eq(A.calculateRobustnessBonus(r,f),expected,'Pool calculator matches examples');
}
for(const threshold of [150,300])for(const r of [0,1,10,149,150,151,300,1000])for(const f of [0,10,150,200])for(const plus of [0,7]){
 const e=entity({robustness:r,strength:f,armor:5,armorPlus:plus},threshold);
 const input=L.initialState();input.mode='maj';input.seuilUmbra=threshold;input.umbras.robustness=r;input.attributes.strength=f;input.fixed.armor=5;input.plus.armor=plus;
 const row=S.getStatSystemResult(e,'armor'),lab=L.calculate(input).results.armor;
 eq(e.stats.armor.totalMax,lab.total,'Maj matches current/max resource');eq(row.value,lab.total,'Stat engine matches Maj');
 const parts=L.contributions(lab,'maj');eq(parts.fixed+parts.plus+parts.umbra,lab.total,'Lab has no double-counted X');
 const retainedR=P.calculateStatPointLimit(r,0,0,threshold).value,retainedF=P.calculateStatPointLimit(f,0,0,threshold).value;
 eq(e.armorLayers.robustness.max,A.calculateRobustnessBonus(retainedR,retainedF,threshold),'Solar layer follows retained points');
 const before=JSON.stringify(e),h=D.calculateStatsDisplay('robustness',e);
 eq(h.umbraHelperCalculations.armorTotal.value,lab.total,'Helper entity total');
 eq(h.umbraHelperCalculations.armorBonus.value,e.armorLayers.robustness.max,'Helper solar grant');
 ok(h.helpContent.includes('data-umbra-passive="solarArmor"'),'Exclusive solar card');
 ok(!/NaN|undefined/.test(h.helpContent),'Valid helper markup');ok(JSON.stringify(e)===before,'Helper never fills or mutates resource');
}
eq(entity({armor:10000,strength:150}).stats.armor.totalMax,10000,'Fixed armor unlimited and no Force ratio');
const alone=entity({armorPlus:7,strength:100});eq(alone.stats.armor.totalMax,57,'Standalone plus uses fixed .5 ratio');eq(alone.armorLayers.robustness.max,0,'Standalone plus never regenerates');
const shared=entity({robustness:50,strength:50,armor:5,armorPlus:7});eq(shared.stats.armor.totalMax,176,'Fixed/+ and Umbra pooled once');
A.consumeEntityArmor(shared,60);const remaining=shared.stats.armor.current;
for(let i=0;i<3;i++)E.recomputeEntityStats(shared,options);
eq(shared.stats.armor.current,remaining,'Repeated recompute preserves spent armor');
const restored=JSON.parse(JSON.stringify(shared));E.recomputeEntityStats(restored,options);eq(restored.stats.armor.current,remaining,'Save/reload preserves remaining armor');
const boost=Rules.entityBattleBooste(shared,{stat:'strength',value:20,source:'robustness-audit'});
eq(shared.armorLayers.robustness.current,remaining,'Attribute buff never refills armor');
const boostedMax=shared.armorLayers.robustness.max;E.recomputeEntityStats(shared,options);eq(shared.armorLayers.robustness.max,boostedMax,'Active buff survives recompute');
boost.remove();eq(shared.armorLayers.robustness.max,164,'Removing buff restores capacity');
const frozen=entity({robustness:50,strength:50});frozen.archetypeFrozen=true;E.recomputeEntityStats(frozen,options);eq(frozen.armorLayers.robustness.max,0,'Rank restriction is retained');
A.resetEntityRegenerableArmor(shared);eq(shared.armorLayers.robustness.current,164,'Solar refill restores its reserve');eq(shared.armorLayers.external.current,0,'Solar refill leaves external reserve empty');
const preview=entity({robustness:50,strength:50});A.consumeEntityArmor(preview,30);preview.modifierStats.preview={statLeveled:{robustness:10,strength:5}};U.ComputeStatPreview(preview);
const projected=entity({robustness:60,strength:55});eq(preview.modifierStats.preview.total.armor.max,projected.stats.armor.totalMax,'Level preview matches confirmed capacity');eq(preview.stats.armor.current,134,'Preview never changes real reserve');
const cfg=P.sources.robustness,saved={...cfg.ratios},curve={...P.progression.curves.robustness};
try{
 cfg.ratios.source=2;cfg.ratios.attribute=.25;P.progression.curves.robustness.intensity=4;
 const e=entity({robustness:50,strength:50}),input=L.initialState();input.mode='maj';input.umbras.robustness=50;input.attributes.strength=50;
 ok(e.stats.armor.totalMax!==164,'Editable bases and own curve change combat capacity');eq(L.calculate(input).results.armor.total,e.stats.armor.totalMax,'Maj reads live settings');
}finally{Object.assign(cfg.ratios,saved);P.progression.curves.robustness=curve;}
const old=L.initialState();old.mode='current';old.umbras.robustness=1;old.attributes.strength=100;eq(L.calculate(old).results.armor.total,888,'Current comparison retains historical formula');
console.log(`Robustesse: ${checks} checks passed.`);
