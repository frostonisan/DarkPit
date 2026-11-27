import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {installEntityTestEnvironment} from './entity-test-environment.mjs';
await installEntityTestEnvironment();
const E = await import("../docs/js/entities/runtime.js"),D = await import("../docs/js/combat/statistics.js"), _D = await import("../docs/js/ui/statistics/details.js");
const S = await import("../docs/js/entities/statSystem.js"),U = await import("../docs/js/entities/progression.js");
const P=globalThis.umbraProgression;
let checks=0;
const ok=(v,label)=>{assert.ok(v,label);checks++;};
const eq=(a,b,label)=>ok(Math.abs(a-b)<1e-8,`${label}: ${a} != ${b}`);
const entity=(baseStats={},seuilUmbra=150)=>{
  const e={id:989917,name:'Vivacité audit',type:'sbire',side:'A',awakening:3,seuilUmbra,
    level:{current:1,max:250},attacks:['autoAttack'],stuff:{},baseStats:{HP:1000,speed:10000,...baseStats}};
  E.recomputeEntityStats(e,{equippedItems:[],persistEquipment:false,skipReverseArchetype:true});return e;
};
const html=await readFile(new URL('../docs/index-14.html',import.meta.url),'utf8');
const script=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('window.umbraLab ='));
const context={window:{},globalThis:{umbraProgression:P}};vm.createContext(context);vm.runInContext(script,context);
const L=context.window.umbraLab;
eq(entity({vivacite:50,agility:50}).stats.velocity,34.99071678596711,'Approved 50/50 example');
eq(entity({vivacite:150,agility:150}).stats.velocity,52.6130286825474,'Approved 150/150 example');
for(const threshold of [150,300])for(const v of [0,1,50,149,150,151,300,1000])for(const a of [0,50,200]){
  const e=entity({vivacite:v,agility:a},threshold);
  const u=P.calculateStatPointLimit(v,0,0,threshold).value,agility=P.calculateStatPointLimit(a,0,0,threshold).value;
  const input=L.initialState();input.mode='maj';input.seuilUmbra=threshold;input.umbras.vivacite=v;input.attributes.agility=a;
  const snap=L.calculate(input);
  const generated=P.vivaciteDetails('velocity',u,agility,0,0,undefined,threshold).generated;
  eq(D.calculateGeneratedUmbraStatBonus(e,'vivacite'),v>0?generated:0,'Fallback retains the percentage curve');
  const detail=D.getGeneratedUmbraStatDetail(e,'vivacite');
  eq(detail.sourceBonus+detail.attributeBonus,detail.bonus,'Fallback source and attribute use the same unit');
  eq(D.calculateGeneratedUmbraStatRatio(e,'vivacite'),P.getProgressiveRatio(u,'vivacite',threshold),'Fallback ratio follows the Umbra curve');
  for(const key of ['velocity','controlledSpeed']){
    const expected=key==='velocity'?P.vivaciteDetails(key,u,agility,0,0,undefined,threshold).value:P.controlledSpeedDetails(u,agility,undefined,threshold).percent;
    eq(e.stats[key],expected,'Game reads common curve');eq(snap.results[key].total,expected,'Maj equals game');
    eq(L.conversionPercent(u,{...L.conversionSettings(key),agility,seuilUmbra:threshold}),expected,'Interactive conversion equals game');
    const parts=L.contributions(snap.results[key],'maj');eq(parts.fixed+parts.plus+parts.umbra,expected,'Lab contributions reconcile');
  }
  const time=Math.round(10000*(1-e.stats.velocity/100));
  eq(e.stats.speed,time,'Timing applies final percentage once');
  eq(_D.calculateStatsDisplay('velocity',e).velocityAdjustedSpeedMs,time,'Velocity helper matches timing');
  eq(_D.calculateStatsDisplay('vivacite',e).vivaciteTiming.adjustedSpeed,time,'Umbra card matches timing');
  eq(D.calculateControlledSpeed(e),e.stats.controlledSpeed,'Movement reads game result');
}
for(const key of ['velocity','controlledSpeed']){
  let before=0;
  for(const n of [1,50,150,1000,1e9,1e100,Number.MAX_VALUE]){
    const value=key==='velocity'?P.vivaciteDetails(key,n,n).value:P.controlledSpeedDetails(n,n).percent;
    ok(Number.isFinite(value)&&value>=before&&value<P.vivacite[key].maxPercent,'Monotonic asymptote');before=value;
  }
}
eq(entity({velocity:50,agility:150}).stats.velocity,50,'Fixed percentage has no attribute ratio');
eq(entity({velocity:65}).stats.speed,3500,'65% really means 3.5 seconds, not 5.29');
eq(entity({controlledSpeed:90,agility:150}).stats.controlledSpeed,0,'Exclusive passive requires its Umbra');
eq(D.calculateControlledSpeed({archetypeFrozen:true,stats:{vivacite:50,agility:50}}),0,'Frozen rank-two passive stays inactive');
for(const fixed of [0,5,100])for(const plus of [0,5,100]){
  const e=entity({vivacite:50,agility:50,velocity:fixed,velocityPlus:plus});
  eq(e.stats.velocity,P.vivaciteDetails('velocity',50,50,fixed,plus).value,'Fixed/+ pooled once');
  const input=L.initialState();input.mode='maj';input.umbras.vivacite=50;input.attributes.agility=50;input.fixed.velocity=fixed;input.plus.velocity=plus;
  eq(L.calculate(input).results.velocity.total,e.stats.velocity,'Manual inputs stay synchronized with Maj');
}
eq(P.vivaciteDetails('velocity',0,100,0,1).attributeRatio,.5,'Standalone + fixed attribute ratio');
const before=P.vivaciteDetails('velocity',50,50);
const a=P.vivaciteDetails('velocity',50,51),v=P.vivaciteDetails('velocity',51,50);
eq(a.sourceRatio,before.sourceRatio,'Agility does not change Vivacité ratio');ok(a.attributeRatio>before.attributeRatio,'Agility grows own ratio');
eq(v.attributeRatio,before.attributeRatio,'Vivacité does not change Agility ratio');ok(v.sourceRatio>before.sourceRatio,'Vivacité grows own ratio');
const settings={...P.progression.curve};
try{
  P.progression.curve.intensity=4;
  const e=entity({vivacite:50,agility:50}),input=L.initialState();input.mode='maj';input.umbras.vivacite=50;input.attributes.agility=50;
  ok(e.stats.velocity!==before.value,'Curve setting is live in the game');
  eq(L.calculate(input).results.velocity.total,e.stats.velocity,'Modified shared curve is live in Maj');
}finally{Object.assign(P.progression.curve,settings);}
for(const [velocity,chance] of [[0,50],[30,80],[50,99],[65,99]])eq(P.retreatChance(velocity),chance,'Flee barème preserved');
const retreatModels=_D.calculateStatsDisplay('vivacite',entity({vivacite:150,agility:150})).umbraHelperCalculations;
eq(retreatModels.generatedUmbraSource.value,52.6130286825474,'Flee detail keeps the true Umbra velocity');
eq(retreatModels.agileRetreat.value,49,'Umbra retreat bonus excludes the universal 50 percent base');
eq(retreatModels.agileRetreatTotal.value,99,'Entity total still reports the capped result');
const preview=entity({vivacite:50,agility:50});preview.modifierStats.preview={statLeveled:{vivacite:10,agility:5}};
U.ComputeStatPreview(preview);
const projected=entity({vivacite:60,agility:55});
eq(preview.modifierStats.preview.total.velocity,projected.stats.velocity,'Level-up preview velocity matches confirmation');
eq(preview.modifierStats.preview.total.speed,projected.stats.speed,'Level-up preview speed matches confirmation');
eq(_D.calculateStatsDisplay('velocity',preview).velocityAdjustedSpeedMs,projected.stats.speed,'Preview helper timing matches');
const buffed=entity({vivacite:50,agility:50});buffed.battleBoosts={speed:[{mode:'flat',value:1000}]};
E.recomputeEntityStats(buffed,{equippedItems:[],persistEquipment:false,skipReverseArchetype:true});
eq(D.getSafe(buffed,'speed'),buffed.stats.speed+1000,'Flat speed buff still applies after velocity');
eq(_D.calculateStatsDisplay('velocity',buffed).velocityAdjustedSpeedMs,D.getSafe(buffed,'speed'),'Timing helper includes speed buffs');
buffed.battleBoosts.agility=[{mode:'flat',value:20}];
const live=P.velocityTiming(D.getSafe(buffed,'velocity'),10000).adjustedSpeed+1000;
eq(D.getSafe(buffed,'speed'),live,'Agility buffs immediately change the actual turn duration');
eq(_D.calculateStatsDisplay('vivacite',buffed).vivaciteTiming.adjustedSpeed,live,'Umbra helper reads the live duration');
console.log(`Vivacité: ${checks} checks passed.`);
