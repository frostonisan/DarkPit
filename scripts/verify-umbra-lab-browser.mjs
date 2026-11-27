import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { stats as STATS_DATA } from '../docs/js/data/statsData.js';

const path = resolve('docs/index-14.html');
const output = resolve('outputs/umbra-lab');
const html = await readFile(path, 'utf8');
const sharedSource = await readFile(resolve('docs/js/data/umbraProgression.js'), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
let checks = 0;
const check = (condition, label) => { assert.ok(condition, label); checks++; };
const equal = (actual, expected, label) => { assert.equal(actual, expected, label); checks++; };
const near = (actual, expected, label) => check(Number.isFinite(actual) && Math.abs(actual - expected) < 1e-8, `${label}: ${actual} / ${expected}`);
equal(scripts.length, 2, 'Model and UI are inline');
equal([...html.matchAll(/<script src="([^"]+)"/g)].map(match=>match[1]).join(), 'js/data/umbraProgression.js', 'Only the game shared numerical rules are loaded');
check(!/<link[^>]+stylesheet|<iframe|\bimport\s*\(/.test(html), 'No game bootstrap or module dependency');
check(!/\blocalStorage\b|\bsessionStorage\b|\bfetch\s*\(/.test(html), 'No game save or network access');
for (const script of scripts) new vm.Script(script);
const sandbox = vm.createContext({ window: {} });
vm.runInContext(sharedSource, sandbox);
vm.runInContext(scripts[0], sandbox);
const { calculate, initialState, changeLimit, effects, umbras, attributes, multiplier, curveGain, curveProfiles, referenceLimit, defaultUmbraBase, ceiling, contributions } = sandbox.window.umbraLab;
const clone = state => JSON.parse(JSON.stringify(state));
const displayedNumber=text=>Number(text.replace(/[\s%]/g,'').replace(',','.'));
const row = (state, key = 'physicalDamage') => calculate(state).results[key];
assert.deepEqual(Array.from(umbras, spec => spec.key).sort(),
  ['vigueur', 'astrality', 'robustness', 'constitution', 'vitality', 'equilibre', 'resilience',
    'esprit', 'integrite', 'haste', 'finesse', 'criticalPower', 'adresse', 'vivacite', 'vision'].sort(),
  'Workshop exposes the fifteen supported Umbras, including Astrality');
checks++;
equal(attributes.length, 4, 'Four directing attributes');
equal(initialState().limit,referenceLimit,'Initial entity cap uses the shared reference limit');
check(curveProfiles.every(profile=>profile.defaults.interval===referenceLimit),'All profiles derive their cycle length from the reference limit');
check(!umbras.some(spec => ['brutality', 'inflexion'].includes(spec.key)), 'Higher rank Umbras excluded');
check(effects.every(spec => umbras.some(source => source.key === spec.source)), 'Every effect belongs to a listed Umbra');
check(Object.values(calculate(initialState()).results).every(effect => effect.total === 0), 'Empty inputs yield zero');

const example = initialState(true);
equal(row(example).attributeGain, 44, 'Force 60 and Vigueur 15 give ceil(43.4575) through the cycle ratio');
equal(row(example).total, 81, 'Example has native 22 + fixed grant 15 + Force 44');
const addPlus = clone(example); addPlus.plus.physicalDamage = 10;
equal(row(addPlus).total, 91, '+10 PP+ adds 10 once an Umbra supplies the ratio');
equal(row(addPlus).coefficient, row(example).coefficient, 'PP+ cannot grow its coefficient');
const addUmbra = clone(example); addUmbra.umbras.vigueur += 10;
equal(row(addUmbra).total, 115, '+10 Vigueur increases both ratios and the fixed gift');
equal(row(addUmbra).attributeGain, 49, 'Fractional Force contribution is rounded upward');
const lineExample=initialState();
lineExample.attributes.strength=10; lineExample.umbras.vigueur=10;
lineExample.fixed.physicalDamage=10; lineExample.plus.physicalDamage=10;
equal(row(lineExample).total,51,'User example has 51 total PP with the cycle curve');
const lineParts=contributions(row(lineExample));
equal(lineParts.fixed,10,'Fixed PP row displays its own ten-point contribution');
equal(lineParts.plus,10,'PP+ does not count the Umbra attribute ratio again');
equal(lineParts.umbra,31,'Vigueur row displays its gift and generated capacity');
equal(lineParts.x,21,'X is an included capacity, not another acquisition');
const noUmbraLines=clone(lineExample); noUmbraLines.umbras.vigueur=0;
equal(contributions(row(noUmbraLines)).plus,15,'Without Umbra, plus carries its own attribute contribution');
const withoutUmbra = initialState(); withoutUmbra.attributes.strength = 25;
equal(row(withoutUmbra).total, 0, 'Force alone does not activate a PP capacity');
withoutUmbra.fixed.physicalDamage = 10;
equal(row(withoutUmbra).total, 10, 'Fixed PP alone does not activate a ratio');
withoutUmbra.plus.physicalDamage = 1;
equal(row(withoutUmbra).attributeGain, 13, '25 × 0.5 rounds to 13');
equal(row(withoutUmbra).total, 24, 'Fixed, plus and attribute remain separate');
withoutUmbra.plus.physicalDamage = 1000;
equal(row(withoutUmbra).coefficient, .5, 'An arbitrarily large PP+ retains the base ratio');
equal(ceiling(0.1 + 0.2, 1), .3, 'Floating-point noise cannot introduce a false upward step');

const moreCapacity = clone(example); moreCapacity.limit = 300;
equal(row(moreCapacity).total, row(example).total, 'Raising the limit alone preserves acquired results');
equal(row(moreCapacity).coefficient, row(example).coefficient, 'Limit does not rescale the ratio curve');
moreCapacity.umbras.vigueur = 250; moreCapacity.attributes.strength = 250;
check(row(moreCapacity).total > row({ ...moreCapacity, limit: 150 }).total, 'The new limit opens progression beyond 150');
equal(row(moreCapacity).attributeValue, 250, 'No hidden attribute cap at 150');
equal(row(moreCapacity).u, 250, 'No hidden Umbra cap at 150');
moreCapacity.fixed.physicalDamage = 9999; moreCapacity.plus.physicalDamage = 9999;
const zeroLimit = calculate({ ...moreCapacity, limit: 0 });
equal(zeroLimit.results.physicalDamage.fixed+zeroLimit.results.physicalDamage.plus,19998,'Zero directing limit preserves all fixed acquisitions');
check(zeroLimit.results.physicalDamage.total>19998 && zeroLimit.results.physicalDamage.total<19999,'Zero threshold permits only tiny residual Umbra gains');
check(Object.values(zeroLimit.attributes).every(value => value === 0), 'All attributes share zero limit');
equal(zeroLimit.umbras.vigueur,250,'Umbra points remain available beyond a zero threshold');

const before = JSON.stringify(example);
calculate(example);
equal(JSON.stringify(example), before, 'Calculation does not mutate its inputs');
equal(row({ ...example, level: 99 }).total, row(example).total, 'Level is manual with no archetype gains');
const unrelated = clone(example); unrelated.umbras.esprit = 100; unrelated.attributes.intelligence = 120;
equal(row(unrelated).coefficient, row(example).coefficient, 'Another Umbra cannot influence PP ratio');
equal(row(unrelated).total, row(example).total, 'Another attribute cannot influence PP total');
// Independent formulas from profils_courbes_math.html, evaluated across full
// cycles rather than freezing history. Gain remains a percent of the base.
const referenceGain = (x,c,limit=c.interval) => {
  const normal=Math.min(Math.max(0,x),limit),w=c.interval;
  const norm=t=>{
    t=Math.max(0,Math.min(1,t));const k=c.shape;
    if(c.type==='exp')return -Math.expm1(-k*t)/(-Math.expm1(-k));
    if(c.type==='j')return Math.expm1(k*t)/Math.expm1(k);
    const z=x=>1/(1+Math.exp(-k*(x-c.mid/100))), a=z(0), b=z(1);return (z(t)-a)/(b-a);
  };
  const local=x=>c.cap*norm(x/w);
  const full=points=>Math.floor(points/w)*local(w)+local(points%w);
  return full(normal)+(full(x)-full(normal))*c.res;
};
equal(curveProfiles.length,3,'Three selectable mathematical curve families');
for(const curve of [...curveProfiles.map(profile=>profile.defaults),
  ...['exp','j','sigmoid'].flatMap(type=>[
    {type,cap:1,shape:.5,res:0,mid:10,interval:1000},
    {type,cap:200,shape:15,res:.02,mid:90,interval:50},
  ])]) {
  for(const points of [0,1,10,15,50,199.999,200,200.001,400,999,10000,curve.interval-.001,curve.interval,curve.interval+.001]) {
    near(curveGain(points,curve),referenceGain(points,curve),`Reference cycle formula at ${points}`);
    near(multiplier(points,curve),1+referenceGain(points,curve)/100,'Cumulative gain is a percentage of the starting ratio');
  }
  near(curveGain(curve.interval,curve),curve.cap,'No residual bonus before or at the threshold');
  near(curveGain(2*curve.interval,curve),curve.cap*(1+curve.res),'Beyond the threshold only the residual fraction contributes');
  near(curveGain(2*curve.interval,curve,2*curve.interval),2*curve.cap,'Raising the threshold enables a full second cycle');
  check(multiplier(curve.interval+.001,curve)>=multiplier(curve.interval,curve),'Residual growth is monotone, or flat at zero efficiency');
  let prior=0;
  for(let points=0;points<=3*curve.interval;points+=curve.interval/20) {
    const gain=curveGain(points,curve);check(gain>=prior,'Every profile remains monotonic across cycle boundaries');prior=gain;
  }
  const build=clone(example);build.curve={...curve};build.umbras.vigueur=17;build.attributes.strength=25;
  const m=1+referenceGain(17,curve,build.limit)/100;
  near(row(build).coefficient,.5*m,'Each profile reaches the actual attribute ratio');
  near(row(build).umbraCoefficient,m,'Each profile reaches the actual Umbra ratio');
  equal(row(build).total,Math.ceil(25*.5*m)+Math.ceil(17*m)+17,'Each profile computes the rounded real PP total');
  equal(row({...build,mode:'current'}).total,30,'Current game formulas ignore every concept profile');
}
const symmetric={...initialState().curve,shape:5,res:0,mid:50};
near(curveGain(100,{...symmetric,type:'sigmoid'}),42.5,'Centered sigmoid reaches half the gain at mid-cycle');
check(curveGain(50,{...symmetric,type:'exp'})>curveGain(50,{...symmetric,type:'sigmoid'}),'Exponential gives larger early gains than sigmoid');
check(curveGain(50,{...symmetric,type:'sigmoid'})>curveGain(50,{...symmetric,type:'j'}),'J delays gains relative to sigmoid');
check(curveGain(100,{...symmetric,type:'sigmoid',mid:70})<curveGain(100,{...symmetric,type:'sigmoid',mid:30}),'Sigmoid center moves its acceleration window');
near(multiplier(200),1.85,'Full cycle: +85% without any residual');
near(multiplier(200,{}),1.85,'Partial settings preserve defaults');
near(row(example).native,15*multiplier(15),'Umbra ratio grows with the same multiplier as the attribute');
for(const [key,value] of [['cap',50],['shape',6],['interval',400]]) {
  const changed=clone(example);changed.curve[key]=value;
  check(row(changed).multiplier!==row(example).multiplier,`${key} changes the active multiplier`);
  check(row(changed).coefficient!==row(example).coefficient && row(changed).native!==row(example).native,`${key} recalculates both ratios on existing points`);
  equal(row(changed).gift,row(example).gift,`${key} never multiplies the fixed gift`);
}
check(row(addUmbra).total - row(example).total > row(addPlus).total - row(example).total, 'Umbra remains stronger than the same number of plus points');

const equalBases=clone(example);equalBases.attributeBases.physicalDamage=1;
near(row(equalBases).coefficient,row(equalBases).umbraCoefficient,'Equal initial bases produce equal attribute and Umbra ratios');
equal(row(equalBases).total,124,'Changing only the Force base recalculates its contribution');
equalBases.umbraBases.physicalDamage=.25;
equal(row(equalBases).total,108,'Changing the Vigueur base changes only its generated points');
equal(row(equalBases).gift,15,'Initial ratios never scale the fixed gift');
equal(row({...equalBases,mode:'current'}).total,45,'Current mode ignores custom concept bases');
equal(row(initialState(true)).total,81,'Custom bases never mutate shared defaults');
const autonomous=clone(equalBases);autonomous.umbras.vigueur=0;autonomous.plus.physicalDamage=10;
equal(row(autonomous).total,70,'Without Umbra the configurable attribute base stays static');
autonomous.plus.physicalDamage=100;
equal(row(autonomous).coefficient,1,'Autonomous plus acquisitions cannot evolve their initial ratio');

for (const spec of effects) {
  const state = initialState();
  for (const attribute of attributes) state.attributes[attribute.key] = 25;
  state.umbras[spec.source] = 15;
  const ordinary = row(state, spec.key);
  if(spec.attribute) {
    const changed=clone(state);changed.attributeBases[spec.key]=.75;
    near(row(changed,spec.key).coefficient,.75*multiplier(15),`${spec.key}: configurable attribute base feeds the live ratio`);
    equal(row(changed,spec.key).native,ordinary.native,`${spec.key}: attribute base leaves Umbra contribution unchanged`);
    for(const other of effects.filter(other=>other.attribute===spec.attribute && other.key!==spec.key))equal(row(changed,other.key).coefficient,row(state,other.key).coefficient,`${spec.key}: the same attribute retains its other independent ratios`);
    changed.attributeBases[spec.key]=0;
    equal(row(changed,spec.key).attributeGain,0,`${spec.key}: zero is a valid initial attribute base`);
  }
  if(defaultUmbraBase(spec)!==null) {
    const changed=clone(state);changed.umbraBases[spec.key]=0;
    equal(row(changed,spec.key).native,0,`${spec.key}: zero disables only the native Umbra gain`);
    equal(row(changed,spec.key).gift,ordinary.gift,`${spec.key}: fixed gift is independent of the initial base`);
    equal(row(changed,spec.key).attributeGain,ordinary.attributeGain,`${spec.key}: Umbra base leaves attribute gain unchanged`);
  }
  const plusState = clone(state); plusState.plus[spec.key] = 7;
  const enhanced = row(plusState, spec.key);
  equal(enhanced.coefficient, ordinary.coefficient, `${spec.key}: stat+ does not stack an attribute ratio`);
  near(enhanced.uncapped - ordinary.uncapped, 7, `${spec.key}: stat+ adds only its fixed acquisition`);
  const ownLimit = calculate({ ...state, limit: 10 });
  check(Object.values(ownLimit.attributes).every(value => value <= 10), `${spec.key}: common attribute limit`);
  equal(ownLimit.umbras[spec.source],15,`${spec.key}: raw Umbra points preserved beyond the limit`);
  equal(ownLimit.results[spec.key].normalU,10,`${spec.key}: normal points stop at the common threshold`);
  const noGift = clone(state); noGift.gifts[spec.key] = 0;
  // Regeneration depends on HP, but changing its own grant leaves that input alone.
  near(ordinary.uncapped - row(noGift, spec.key).uncapped, ordinary.gift, `${spec.key}: fixed gift is counted exactly once`);
  if (spec.attribute) {
    state.umbras[spec.source] = 0; state.plus[spec.key] = 1;
    equal(row(state, spec.key).coefficient, spec.coefficient, `${spec.key}: stat+ uses a static coefficient without an Umbra`);
    state.plus[spec.key] = 10000;
    equal(row(state, spec.key).coefficient, spec.coefficient, `${spec.key}: more stat+ never changes coefficient`);
  }
}

// Residual efficiency applies to every Umbra component only above the threshold.
for(const profile of curveProfiles)for(const spec of effects) {
  const build=initialState();build.limit=10;build.curve={...profile.defaults,res:.01};
  for(const attribute of attributes)build.attributes[attribute.key]=4;
  build.umbras[spec.source]=10;
  const boundary=row(build,spec.key),withoutResidual=row({...build,curve:{...build.curve,res:0}},spec.key);
  equal(boundary.total,withoutResidual.total,`${profile.type}/${spec.key}: residual has no effect at the threshold`);
  build.umbras[spec.source]=110;
  const excess=row(build,spec.key),stopped=row({...build,curve:{...build.curve,res:0}},spec.key);
  equal(excess.overflow,100,`${spec.key}: only the 100 excess points trigger residual gains`);
  equal(stopped.total,boundary.total,`${spec.key}: zero residual rate is a true stop`);
  near(excess.gift-boundary.gift,boundary.giftRate,`${spec.key}: Umbra fixed grant uses the same residual points`);
  check(excess.coefficient>=boundary.coefficient && excess.nativeGain>=boundary.nativeGain && excess.generated>=boundary.generated,`${spec.key}: every component grows monotonically through residual gains`);
  const reopened=row({...build,limit:110},spec.key);
  for(const key of ['coefficient','umbraCoefficient','attributeGain','nativeGain','generated','gift'])near(excess[key],boundary[key]+(reopened[key]-boundary[key])*.01,`${spec.key}/${key}: retain exactly 1% of the theoretical additional benefit`);
  if(reopened.total>boundary.total)check(excess.total>boundary.total,`${spec.key}: positive residual efficiency still provides gains`);
  check(reopened.total>=excess.total,`${spec.key}: raising the limit restores normal progression`);
}
for(const threshold of [0,1,200]) {
  const build=initialState();build.limit=threshold;build.attributes.strength=25;build.umbras.vigueur=threshold;
  const baseline=row(build);build.umbras.vigueur=threshold+.001;
  const excess=row(build);
  check(excess.total>baseline.total && excess.total-baseline.total<.005,'Infinitesimal overflow is not rounded to multiple whole points');
}
const residualPP=initialState();residualPP.attributes.strength=25;residualPP.umbras.vigueur=201;
equal(row(residualPP).residualRate,.0005,'Default overflow efficiency is 0.05 percent');
near(row(residualPP).gift,200.0005,'Umbra grant does not keep full efficiency past the threshold');
residualPP.fixed.physicalDamage=10000;residualPP.plus.physicalDamage=20000;
const residualParts=contributions(row(residualPP));
equal(residualParts.fixed,10000,'Separate fixed stats remain unlimited beyond the Umbra threshold');
equal(residualParts.plus,20000,'Separate stat+ direct acquisitions remain unlimited');
// Moving the threshold starts a new curve immediately at each source's own
// point count, without repricing its acquired Umbra benefits.
for(const profile of curveProfiles)for(const spec of effects)for(const departure of [120,240]) {
  let build=initialState();build.curve={...profile.defaults,res:.01};build.umbras[spec.source]=departure;
  for(const attribute of attributes)build.attributes[attribute.key]=4;
  const original=JSON.stringify(build),before=row(build,spec.key);
  build=changeLimit(build,400);
  equal(JSON.stringify({...build,limit:200,limitHistory:undefined}),original,`${spec.key}: limit edits preserve every acquisition and setting`);
  const atDeparture=row(build,spec.key);
  for(const key of ['total','coefficient','attributeGain','nativeGain','gift','generated'])near(atDeparture[key],before[key],`${profile.type}/${spec.key}/${key}: no jump when the limit changes at ${departure}`);
  equal(atDeparture.segmentStart,departure,`${spec.key}: fresh curve starts at the current points`);
  build.umbras[spec.source]++;
  const next=row(build,spec.key);
  near(next.multiplier,before.multiplier+referenceGain(1,build.curve,400)/100,`${spec.key}: the very next point uses the beginning of the curve`);
  check(next.total>=before.total,`${spec.key}: next point cannot lose acquired gains`);
  near(next.multiplier,multiplier(departure+1,build.curve,build.limit,build.limitHistory[spec.source]),`${spec.key}: chart and actual ratio share departures`);
  const again=changeLimit(build,450),beforeAgain=row(again,spec.key);
  near(beforeAgain.total,next.total,`${spec.key}: multiple successive departures preserve gains`);
  near(row({...again,mode:'current'},spec.key).total,row({...again,mode:'current',limitHistory:{}},spec.key).total,`${spec.key}: current JS mode ignores all departure records`);
}
let timeline=initialState();timeline.umbras.vigueur=120;timeline.umbras.esprit=30;
timeline=changeLimit(timeline,400);
equal(row(timeline).segmentStart,120,'Force Umbra keeps its own departure');
equal(row(timeline,'magicalDamage').segmentStart,30,'Intelligence Umbra gets an independent departure');
timeline=changeLimit(timeline,500);
equal(timeline.limitHistory.vigueur.length,2,'Dragging a limit at unchanged points replaces the departure');
timeline.umbras.vigueur=40;timeline=changeLimit(timeline,300);
equal(timeline.limitHistory.vigueur.length,2,'Editing after moving backward discards future departures');
equal(row(timeline).segmentStart,40,'Backward edit starts a new current departure');
timeline.umbras.vigueur=45;const reached=row(timeline);
timeline=changeLimit(timeline,20);near(row(timeline).total,reached.total,'A lower limit preserves existing Umbra gains when attributes stay within it');
timeline.umbras.vigueur=46;check(row(timeline).total-reached.total<1,'Lowering the limit below acquired points makes the next point residual immediately');
const vitality = initialState(); vitality.umbras.vitality = 15;
equal(row(vitality, 'HP').total, 169, 'Vitality native HP curve scales with the shared multiplier plus the fixed grant');
equal(row(vitality, 'dayHpRegen').total, 3, 'Regeneration follows current max HP and scaled Umbra ratio');
vitality.fixed.HP = 1000;
equal(row(vitality, 'dayHpRegen').total, 10, 'Fixed HP propagates to regeneration in the same calculation');
const haste = initialState(); haste.umbras.haste = 15;
haste.attributes.strength = 60; haste.attributes.intelligence = 60; haste.attributes.agility = 60;
equal(row(haste, 'attackExecutionReduc').attributeGain, 15, 'Haste boosts the original execution coefficient with the shared cycle curve');
equal(row(haste, 'attackProjectileSpeed').total, 17.65, 'Projectile time reduction converts to speed gain');
for (const key of ['physicalResistance', 'dodge', 'attackPreparationReduc']) {
  const state = initialState(); state.fixed[key] = 1000;
  const effect = row(state, key);
  equal(effect.fixed, 1000, `${key}: fixed input remains uncapped`);
  equal(effect.total, effect.cap, `${key}: final effect is capped separately`);
  check(effect.capped && effect.capLoss > 0, `${key}: excess is explained`);
}

// Sweep real progression boundaries, including beyond the historical 150.
for (const limit of [0, 1, 30, 150, 300]) {
  for (const source of umbras) {
    let previous = null;
    for (const points of [...new Set([0, 1, 15, 149, 150, 151, 300].map(value => Math.min(value, limit)))]) {
      const state = initialState(); state.limit = limit; state.umbras[source.key] = points;
      for (const attribute of attributes) state.attributes[attribute.key] = limit;
      const snapshot = calculate(state);
      for (const effect of Object.values(snapshot.results)) {
        check(Number.isFinite(effect.total) && effect.total >= 0, `${source.key}/${points}: finite ${effect.key}`);
        if (effect.source === source.key && previous) check(effect.total >= previous[effect.key].total, `${effect.key}: monotone acquisition`);
      }
      previous = snapshot.results;
    }
  }
}

// Compare the current-mode snapshot with the project's actual numerical JS.
// Import side effects are excluded; formula bodies and the source-pooling
// engine are read verbatim from the files, rather than recreated as expectations.
const [balanceSource, entitySource, damageSource, ruleSource, systemSource] = await Promise.all([
  'docs/js/data/balanceData.js', 'docs/js/entities/runtime.js', 'docs/js/combat/statistics.js',
  'docs/js/entities/rules.js', 'docs/js/entities/statSystem.js',
].map(file => readFile(resolve(file), 'utf8')));
const unexport = source => source.replace(/^export default[^\n]+/gm, '').replace(/\bexport (?=(?:const|let|var|function)\b)/g, '');
const functionBody = (source, name) => {
  const match = source.match(new RegExp(`(?:export )?function ${name}\\([^]*?^}`, 'm'));
  assert.ok(match, `Native function ${name} must exist`);
  return unexport(match[0]);
};
const entityFunctions = ['calculateVitalityBonus', 'calculateDodgePercent', 'calculatePrecisionPercent', 'calculateHastePercent', 'calculateCritChancePercent'];
const damageFunctions = ['calculateStrength', 'calculateAgility', 'calculateIntelligence', 'getHastePoints', 'calculateHasteIntelRatio',
  'calculateHasteCDReduc', 'calculateHasteRecupReduc', 'calculateHastePrepReduc', 'calculateHasteExecReduc', 'calculateHasteProjectilSpeed',
  'calculateVitalityRegenPercent', 'calculateVitalityRegenAmount', 'toNumber', 'calculateCritRatioBonus'];
const reference = vm.createContext({ STATS_DATA: STATS_DATA.map(({ key, nature }) => ({ key, nature })) });
vm.runInContext(sharedSource, reference);
vm.runInContext(unexport(balanceSource.replace(/^import .*;\r?\n/gm, '')), reference);
vm.runInContext(`
  const getSafe = (entity, key, fallback=0) => entity.stats[key] ?? fallback;
  ${damageSource.match(/^const clamp = .*;$/m)[0]}
  ${unexport(damageSource.match(/^(?:export )?const round1 = .*;$/m)[0])}
  ${damageSource.match(/^const scalePercentRounded = [^]*?^};/m)[0]}
  ${ruleSource.match(/^const toPositiveNumber = .*;$/m)[0]}
  ${['getResistanceConstant', 'calculateResistanceReductionRatio', 'calculateResistanceReductionPercent'].map(name => functionBody(ruleSource, name)).join('\n')}
  ${entityFunctions.map(name => functionBody(entitySource, name)).join('\n')}
  ${damageFunctions.map(name => functionBody(damageSource, name)).join('\n')}
  globalThis.nativeE = {${entityFunctions.join(',')}};
  globalThis.nativeD = {${damageFunctions.join(',')}};
  globalThis.nativeCalculate = (() => {
    const B = balanceData, E = nativeE, D = nativeD;
    ${unexport(systemSource.replace(/^import .*;\r?\n/gm, ''))}
    return calculateStatSources;
  })();
`, reference);
// Actuel is intentionally the pre-update baseline; Maj uses the live rules.
for(const cfg of Object.values(reference.umbraProgression.sources))cfg.progressive=false;
const liveDodgeConversion=reference.nativeE.calculateDodgePercent;
reference.nativeE.calculateDodgePercent=points=>points<=0?0:points===1?5:Math.min(72,Number((5+67*(1-Math.exp(-.02*(points-1)))).toFixed(1)));
const liveResistanceConstant=reference.umbraProgression.resistanceCurve.constant;
reference.umbraProgression.resistanceCurve.constant=70;
for (const [u, attribute, fixed, plus] of [[0,25,0,0],[0,25,3,1],[15,60,0,0],[15,25,3,7],
  [1,3,0,.25],[.4,12.49,.25,.35],[150,150,0,0],[250,250,1000,7],[15,26.125,.23,.71]]) {
  const state=initialState(); state.mode='current'; state.limit=7; state.curve={type:'sigmoid',cap:150,shape:15,mid:70,res:.01,interval:50};
  for (const spec of attributes) state.attributes[spec.key]=attribute;
  for (const spec of umbras) state.umbras[spec.key]=u;
  for (const spec of effects) { state.fixed[spec.key]=fixed; state.plus[spec.key]=plus; state.gifts[spec.key]=99; }
  const inputs={...state.attributes,...state.umbras,...state.fixed,...Object.fromEntries(effects.map(spec=>[`${spec.key}Plus`,plus]))};
  const snapshot=calculate(state);
  for (const spec of effects.filter(spec=>!['criticalPower','resilience'].includes(spec.source))) {
    let expected=spec.key==='bullsEye'?fixed+plus+Math.round(u):reference.nativeCalculate(inputs,spec.key,{effective:true}).value;
    // These families intentionally retain their pre-update behavior in Actuel.
    if(spec.source==='robustness')expected=fixed+plus+Math.ceil(u)+(u>0||plus>0?Math.ceil(10+989*(1-Math.exp(-((attribute+30)**3-30**3)/100**3))):0);
    if(spec.source==='vivacite') {
      const points=Math.max(0,Math.min(150,Math.round(u+(u>0||plus>0?attribute*.5:0))));
      const legacy=points<=30?points:30+35*(1-Math.exp(-.015*(points-30)))/(1-Math.exp(-.015*120));
      expected=spec.key==='controlledSpeed'?0:Math.round(Math.min(65,fixed+plus+legacy)*1e6)/1e6;
    }
    if(spec.source==='equilibre') {
      const bonus=spec.key==='equilibreAggroReduction'?20:spec.key==='equilibreInvisibleDetection'?25:7;
      const generated=u>0?(spec.uniquePassive?50:5)+Math.round(bonus*(1-(1-Math.min(attribute/150,1))**2)*100)/100:0;
      expected=fixed+plus+generated;
    }
    if(spec.source==='astrality') {
      // “Actuel” is the preserved historical model; “Maj” checks live Astrality below.
      const native=u<=0?0:u<=1?2:Math.min(40,Math.round((2+38*Math.sqrt((u-1)/100))*10)/10);
      const intel=u>0?Math.round(60*(1-(1-Math.min(attribute,150)/150)**2)*10)/10:0;
      expected=spec.key==='fatalSurvival'?native+intel:0;
    }
    near(snapshot.results[spec.key].total, expected, `Current JS parity: ${spec.key}, U=${u}, A=${attribute}, fixe=${fixed}, +=${plus}`);
    equal(snapshot.results[spec.key].gift, 0, `Current ${spec.key} has no concept grant`);
    for(const mode of ['current','concept']) {
      const result=calculate({...state,mode}).results[spec.key], parts=contributions(result,mode);
      near(parts.fixed+parts.plus+parts.umbra,result.total,`${mode} ${spec.key}: exclusive contributions reconcile after rounding and caps`);
      check(Object.values(parts).every(value=>Number.isFinite(value)&&value>=0),`${mode} ${spec.key}: contributions are nonnegative`);
      check(parts.x<=parts.umbra+1e-8,`${mode} ${spec.key}: X is already included in its Umbra`);
    }
  }
}
for(const cfg of Object.values(reference.umbraProgression.sources))cfg.progressive=true;
reference.nativeE.calculateDodgePercent=liveDodgeConversion;
reference.umbraProgression.resistanceCurve.constant=liveResistanceConstant;
for(const seuilUmbra of [150,300])for(const points of [0,1,10,149,150,151,200,1000])for(const attribute of [0,25,150,200]) {
  const state=initialState();state.mode='maj';state.limit=7;state.curve.shape=99;
  state.seuilUmbra=seuilUmbra;
  for(const spec of attributes)state.attributes[spec.key]=attribute;
  for(const spec of umbras)state.umbras[spec.key]=points;
  for(const spec of effects){state.fixed[spec.key]=3;state.plus[spec.key]=7;}
  const inputs={...state.attributes,...state.umbras,...state.fixed,...Object.fromEntries(effects.map(spec=>[`${spec.key}Plus`,7]))};
  const snapshot=calculate(state);
  equal(snapshot.limit,seuilUmbra,'Maj uses the entity Umbra threshold, not the Concept limit');
  for(const spec of effects) {
    // Astral return is a combat projection, not a stored stat. Use the same
    // shared calculation as combat, with the entity's retained stat values.
    const stat=key=>reference.nativeCalculate(inputs,key,{seuilUmbra}).value;
    const expected=spec.key==='astralReturn'
      ?reference.umbraProgression.astralReturnDetails(stat('astrality'),stat('strength'),stat('HP'),stat('agility')).percent
      :stat(spec.key);
    near(snapshot.results[spec.key].total,expected,`Maj parity with game: ${spec.key}, U=${points}, A=${attribute}`);
    if(spec.key==='precision')near(snapshot.results[spec.key].chancePercent,reference.nativeE.calculatePrecisionPercent(expected),'Maj Precision percentage matches the pooled score');
    if(spec.key==='bullsEye')near(snapshot.results[spec.key].chancePercent,expected,'Maj Bull’s Eye directly applies the stored percentage');
    const parts=contributions(snapshot.results[spec.key],'maj');
    near(parts.fixed+parts.plus+parts.umbra,expected,`Maj source reconciliation: ${spec.key}`);
  }
}
const liveSettings=sandbox.umbraProgression;
const liveExample={...initialState(true),mode:'maj'};
const beforeLive=row(liveExample).total;
liveSettings.progression.curves.strength.intensity=5;
check(row(liveExample).total!==beforeLive,'A shared attribute-curve edit is applied without copying settings');
delete liveSettings.progression.curves.strength.intensity;
liveSettings.sources.vigueur.ratios.source=2;
check(row(liveExample).total>beforeLive,'A shared Umbra base edit changes Maj directly');
liveSettings.sources.vigueur.ratios.source=1;
liveExample.seuilUmbra=300;
equal(calculate(liveExample).limit,300,'Maj reads the entity Umbra threshold');
equal(calculate({...liveExample,seuilUmbra:150}).limit,150,'Other entities retain their own Umbra threshold');
delete liveExample.seuilUmbra;
equal(row(liveExample).total,beforeLive,'Restoring the shared settings restores the total');
const currentExample={...initialState(true),mode:'current'};
equal(row(currentExample).total,45,'Current PP example remains Force × 0.5 + Vigueur');
equal(row({...currentExample,plus:{physicalDamage:10}}).total,55,'Current +10 PP+ gain is ten');
equal(row({...currentExample,umbras:{...currentExample.umbras,vigueur:25}}).total,55,'Current +10 Vigueur gain is also ten');
const savedInputs=JSON.stringify(currentExample);
calculate({...currentExample,mode:'concept'});
equal(JSON.stringify(currentExample),savedInputs,'Changing calculator does not mutate owned values');
// Bidirectional conversion works on the score after all acquisition/ratio calculations.
const conversion=sandbox.window.umbraLab;
const gameConversions=JSON.stringify([sandbox.umbraProgression.bullsEyeCurve,sandbox.umbraProgression.dodgeCurve,
  sandbox.umbraProgression.resistanceCurve,sandbox.umbraProgression.precisionCurve]);
for(const spec of conversion.statConversions) {
  const native=conversion.conversionSettings(spec.key);
  for(const points of [0,1,10,98,150,300,1000]) {
    const percent=conversion.conversionPercent(points,native);
    const expected=spec.key==='bullsEye'?sandbox.umbraProgression.bullsEyePercent(points)
      :spec.key==='fatalSurvival'?sandbox.umbraProgression.astralityChanceDetails(points).value
      :spec.key==='astralReturn'?sandbox.umbraProgression.astralReturnDetails(1,points).percent
      :spec.key==='astralBody'?sandbox.umbraProgression.astralBodyDetails(points).value
      :spec.key==='criticalChance'?sandbox.umbraProgression.criticalChanceDetails(points).value
      :['criticalResistance','alterationResistance','hindranceResistance'].includes(spec.key)?sandbox.umbraProgression.resilienceDetails(spec.key,points).value
      :spec.key==='resilienceTotal'?sandbox.umbraProgression.resilienceCancelDetails(points).percent
      :spec.key==='velocity'?sandbox.umbraProgression.vivaciteDetails(spec.key,points).value
      :spec.key==='controlledSpeed'?sandbox.umbraProgression.controlledSpeedDetails(points).percent
      :spec.key==='equilibreBalancedAttackChance'?sandbox.umbraProgression.balancedAttackDetails(points).percent
      :spec.key.startsWith('equilibre')?sandbox.umbraProgression.equilibreDetails(spec.key,points).value
      :spec.key==='dodge'?sandbox.umbraProgression.dodgeChancePercent(points)
      :spec.key==='precision'?sandbox.umbraProgression.precisionPercent(points)
      :sandbox.umbraProgression.resistanceReductionRatio(points,sandbox.umbraProgression.getResistanceConstant(spec.key))*100;
    check(Math.abs(percent-expected)<(spec.key==='precision'?.05000001:1e-8),`${spec.key}: conversion starts from current game settings, before display rounding`);
  }
  const experiment={...native,limit:99};
  for(const percent of [0,5,10,49.5,80,98.99]) {
    const points=conversion.conversionPoints(percent,experiment);
    if(spec.key==='astralReturn'&&percent<native.start) {
      check(Number.isNaN(points),'Astral return rejects healing below its guaranteed base');
      continue;
    }
    check(Number.isFinite(points)&&points>=0,`${spec.key}: requested effect gives finite nonnegative points`);
    near(conversion.conversionPercent(points,experiment),percent,`${spec.key}: inverse conversion returns the requested percentage`);
  }
  equal(conversion.conversionPoints(99,experiment),Infinity,`${spec.key}: reaching the exact limit requires infinite points`);
  equal(conversion.conversionPercent(Infinity,experiment),99,`${spec.key}: infinite points tend to the limit`);
  const highPercent=conversion.conversionPercent(1e100,experiment);
  // The healing curve can round to its asymptote at floating-point precision.
  check(spec.key==='astralReturn'?highPercent<=99:highPercent<99,`${spec.key}: finite points never exceed the limit`);
  check(Number.isNaN(conversion.conversionPoints(100,experiment)),`${spec.key}: no inverse above the limit`);
}
const bullExperiment={...conversion.conversionSettings('bullsEye'),limit:99,shape:98};
near(conversion.conversionPercent(1,bullExperiment),1,'Bull’s Eye: 1 point can be set to 1%');
near(conversion.conversionPoints(50,bullExperiment),99,'Without Agility, 99 Vision grants 50%');
for(const agility of [0,10,150])for(const influence of [0,.5,1,2])for(const percent of [0,.4,1,25,50,98.99]) {
  const settings={...bullExperiment,agility,influence};
  near(conversion.conversionPercent(conversion.conversionPoints(percent,settings),settings),percent,'Passive Vision/percent inverse retains Agility and its influence');
}
check(Number.isNaN(conversion.conversionPoints(1,conversion.conversionSettings('precision'))),'Current Precision jump reports unreachable percentages');
equal(JSON.stringify([sandbox.umbraProgression.bullsEyeCurve,sandbox.umbraProgression.dodgeCurve,
  sandbox.umbraProgression.resistanceCurve,sandbox.umbraProgression.precisionCurve]),gameConversions,'Conversion experiments do not write game settings');
console.log(`Model and current JS parity: ${checks} checks passed.`);
if (!process.argv.includes('--model-only')) {
  const require = createRequire(import.meta.url);
  const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
  await mkdir(output, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [], network = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (/^https?:/.test(request.url())) network.push(request.url()); });
    await page.route('**/*', route => /^https?:/.test(route.request().url()) ? route.abort() : route.continue());
    await page.goto(pathToFileURL(path).href);
    const conversionPanel=page.locator('#stat-conversion');
    const conversionField=key=>page.locator(`#conversion-${key}`);
    equal(await conversionField('stat').inputValue(),'velocity','Conversion editor starts on Vivacité');
    equal(await conversionField('limit').inputValue(),'65','Velocity reads the shared ceiling');
    await conversionField('stat').selectOption('bullsEye');
    equal(await conversionField('limit').inputValue(),'99','Initial limit reads the game settings');
    await conversionField('limit').fill('99');
    await conversionField('shape').fill('98');
    await conversionField('points').fill('300');
    near(Number(await conversionField('percent').inputValue()),1+98*299/397,'Vision updates the percentage immediately');
    equal(await page.locator('#conversion-points-label').innerText(),'Vision (points retenus)','Passive editor requests Vision rather than a Bull’s Eye score');
    await conversionField('agility').fill('150');
    check(Number(await conversionField('percent').inputValue())>1+98*299/397,'Agility immediately improves the direct percentage');
    await conversionField('percent').fill('50');
    near(Number(await conversionField('points').inputValue()),1+98/1.85,'Inverse calculation retains the selected Agility ratio');
    await conversionField('influence').fill('0');
    near(Number(await conversionField('percent').inputValue()),conversion.conversionPercent(1+98/1.85,{...bullExperiment,agility:150,influence:0}),'Influence zero disables Agility acceleration');
    await conversionField('points').fill('1');
    await conversionField('influence').fill('2');
    near(Number(await conversionField('percent').inputValue()),1,'First Vision point stays at 1% regardless of Agility influence');
    await conversionField('agility').fill('0');await conversionField('influence').fill('1');
    await conversionField('percent').fill('50');
    near(Number(await conversionField('points').inputValue()),99,'Editing percentage solves Vision without changing the curve');
    equal(await conversionField('shape').inputValue(),'98','Inverse conversion retains curvature');
    await conversionField('percent').fill('99');
    check(await page.locator('#conversion-infinite').isVisible(),'The exact asymptote shows infinite points');
    equal(await conversionField('points').getAttribute('placeholder'),'∞','Infinite points are explicit in the score field');
    await conversionField('percent').fill('100');
    check((await page.locator('#conversion-status').innerText()).includes('dépasse'),'Percent above the limit is rejected with an explanation');
    await conversionField('points').fill('98');
    near(Number(await conversionField('percent').inputValue()),1+98*97/195,'Finite input restores a valid bidirectional calculation');
    equal(await conversionField('percent').getAttribute('aria-invalid'),null,'A valid score clears the percent error');
    await conversionField('limit').fill('50');
    equal(await conversionField('points').inputValue(),'98','Changing the limit preserves owned test points');
    near(Number(await conversionField('percent').inputValue()),1+49*97/195,'Changing the limit immediately rescales the effect');
    await conversionField('limit').fill('99');
    await conversionField('shape').fill('196');
    near(Number(await conversionField('percent').inputValue()),1+98*97/293,'The curve parameter immediately changes progression');
    await conversionField('shape').fill('98');
    for(const key of ['physicalResistance','magicalResistance','dodge','precision']) {
      await conversionField('stat').selectOption(key);
      check(!await conversionField('agility').isVisible(),'Other statistics keep their existing conversion controls');
      await conversionField('limit').fill('99');
      await conversionField('percent').fill('50');
      const settings=await page.evaluate(key=>window.umbraLab.conversionSettings(key),key);
      const points=Number(await conversionField('points').inputValue());
      near(conversion.conversionPercent(points,{...settings,limit:99}),50,`${key}: UI inverse matches the selected statistic`);
    }
    await conversionField('percent').fill('1');
    check((await page.locator('#conversion-status').innerText()).includes('Aucun score'),'Unreachable Precision input is explained');
    await conversionField('percent').fill('50');
    await conversionField('stat').selectOption('bullsEye');
    equal(await conversionField('points').inputValue(),'98','Each statistic retains its own score');
    equal(await conversionField('shape').inputValue(),'98','Each statistic retains its own curve');
    await conversionField('limit').fill('0');
    check((await page.locator('#conversion-status').innerText()).includes('dépasser'),'Zero limit is rejected');
    await conversionField('limit').fill('99');
    await conversionField('shape').fill('0');
    check((await page.locator('#conversion-status').innerText()).includes('strictement'),'Zero shape is rejected');
    await conversionField('shape').fill('98');
    await conversionField('points').fill('300');
    await page.waitForFunction(()=>document.querySelector('#conversion-chart').dataset.points==='300');
    await conversionPanel.screenshot({path:resolve(output,'stat-conversion-desktop.png')});
    for(const width of [390,320]) {
      await page.setViewportSize({width,height:900});
      check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Conversion editor fits ${width}px`);
      check(await conversionPanel.evaluate(node=>node.scrollWidth<=node.clientWidth),`Conversion panel has no horizontal overflow at ${width}px`);
      await conversionPanel.screenshot({path:resolve(output,`stat-conversion-${width}.png`)});
    }
    await page.setViewportSize({width:1440,height:1000});
    const nativeBeforeReset=await page.evaluate(()=>({...globalThis.umbraProgression.bullsEyeCurve}));
    equal(nativeBeforeReset.maxPercent,99,'Experimental limit leaves game settings untouched');
    equal(nativeBeforeReset.constant,98,'Experimental curvature leaves game settings untouched');
    await page.evaluate(()=>{globalThis.umbraProgression.bullsEyeCurve.maxPercent=97;globalThis.umbraProgression.bullsEyeCurve.constant=88;});
    await conversionField('reset').click();
    equal(await conversionField('limit').inputValue(),'97','Reset reads the currently loaded game limit');
    equal(await conversionField('shape').inputValue(),'88','Reset reads the currently loaded game curve');
    equal(await conversionField('points').inputValue(),'300','Reset keeps the test score');
    await page.evaluate(()=>{globalThis.umbraProgression.bullsEyeCurve.maxPercent=99;globalThis.umbraProgression.bullsEyeCurve.constant=98;});
    await conversionField('reset').click();
    await conversionPanel.locator('summary').click();
    // The former Concept UI has been replaced by New / Old. The historical
    // Concept model is still covered above; here we exercise the real controls.
    const entity = page.locator('[data-entity-id="entity-1"]');
    equal(await entity.getByRole('tab').allTextContents().then(v=>v.join(',')),'New,Old','Current mode tabs');
    const add=async (scope,catalog,id,query='')=>{
      const picker=scope.locator('[data-catalog="'+catalog+'"]');
      if(!await picker.evaluate(n=>n.open))await picker.locator('summary').click();
      await picker.locator('input').fill(query);
      await picker.locator('[data-add="'+id+'"]').click();
    };
    const input=(scope,group,key)=>scope.locator('input[data-group="'+group+'"][data-key="'+key+'"]');
    const total=(scope,key)=>scope.locator('[data-stat-total="'+key+'"]').innerText().then(displayedNumber);
    const owned=scope=>scope.locator('input[data-group],input.entity-name').evaluateAll(nodes=>nodes.map(n=>[n.dataset.group,n.dataset.key,n.value]));
    await entity.locator('.entity-name').fill('Attaquant');
    for(const [catalog,id] of [['umbras','umbra-vigueur'],['stats','fixed-physicalDamage'],['plus','plus-physicalDamage'],['x','x-physicalDamage']])await add(entity,catalog,id);
    await input(entity,'attributes','strength').fill('10');
    await input(entity,'umbras','vigueur').fill('10');
    await input(entity,'fixed','physicalDamage').fill('10');
    await input(entity,'plus','physicalDamage').fill('5');
    equal(await total(entity,'physicalDamage'),42,'New: 15 direct + 10 gift + 11 Vigueur + 6 Force');
    const saved=await owned(entity);
    for(let i=0;i<2;i++) {
      await entity.getByRole('tab',{name:'Old',exact:true}).click();
      equal(await total(entity,'physicalDamage'),30,'Old: same build with historical ratios');
      equal(JSON.stringify(await owned(entity)),JSON.stringify(saved),'Old retains every acquisition');
      await entity.getByRole('tab',{name:'New',exact:true}).click();
      equal(await total(entity,'physicalDamage'),42,'Switching back restores live calculations');
      equal(JSON.stringify(await owned(entity)),JSON.stringify(saved),'New retains every acquisition');
    }
    await entity.locator('[data-ui="curve-effect"]').selectOption('physicalDamage');
    await entity.locator('[data-ui="curve-view"]').selectOption('total');
    equal(Number(await entity.locator('[data-ui="curve-chart"]').getAttribute('data-current')),42,'Live chart matches displayed total');
    const base=entity.locator('[data-entry="umbra-vigueur"] input[data-base-group="umbraBases"][data-base-effect="physicalDamage"]');
    check(await base.isDisabled(),'New displays the shared game base as a read-only reference');
    await page.evaluate(()=>{globalThis.umbraProgression.sources.vigueur.ratios.source=2;});
    await entity.getByRole('tab',{name:'New',exact:true}).click();
    equal(await total(entity,'physicalDamage'),54,'Changing the Umbra base recalculates actual points');
    await page.evaluate(()=>{globalThis.umbraProgression.sources.vigueur.ratios.source=1;});
    await entity.getByRole('tab',{name:'New',exact:true}).click();
    equal(await total(entity,'physicalDamage'),42,'Restoring the base restores the result');
    for(const key of ['magicalDamage','piercingDamage','physicalResistance','magicalResistance','dodge','precision']) {
      const spec=effects.find(effect=>effect.key===key);
      await add(entity,'umbras','umbra-'+spec.source);
      await input(entity,'umbras',spec.source).fill('10');
      await input(entity,'attributes',spec.attribute).fill('10');
      const expected = key === 'dodge' ? Number((99 * 27 / (27 + 98)).toFixed(2))
        : key === 'precision' ? sandbox.umbraProgression.precisionPercent(27) : 27;
      equal(await total(entity,key),expected,key+': 27 points converted to the displayed unit');
    }
    await page.locator('#add-entity').click();
    const second=page.locator('[data-entity-id="entity-2"]');
    await second.locator('.entity-name').fill('Réserve');
    await add(second,'stats','fixed-physicalDamage','physique');
    await input(second,'fixed','physicalDamage').fill('10000');
    equal(await total(second,'physicalDamage'),10000,'Fixed stats remain unlimited');
    equal(await total(entity,'physicalDamage'),42,'Second entity leaves the first build unchanged');
    await second.getByRole('tab',{name:'Old',exact:true}).click();
    equal(await entity.getByRole('tab',{selected:true}).innerText(),'New','Modes are independent per entity');
    await page.locator('#add-entity').click();
    const third=page.locator('[data-entity-id="entity-3"]');
    await third.locator('.entity-name').fill('Troisième');
    equal(await page.locator('.entity').count(),3,'Three simultaneous entities');
    await second.locator('[data-remove-entity]').click();
    equal(await page.locator('.entity').count(),2,'Removing one entity preserves the others');
    equal(await total(entity,'physicalDamage'),42,'Removal preserves first entity values');
    await entity.locator('[data-ui="curve-effect"]').selectOption('physicalDamage');
    await entity.locator('[data-ui="curve-view"]').selectOption('total');
    for(const width of [1440,390]) {
      await page.setViewportSize({width,height:1000});
      await entity.screenshot({path:resolve(output,'new-'+width+'.png')});
      equal(Number(await entity.locator('[data-ui="curve-chart"]').getAttribute('data-current')),42,'Responsive redraw preserves values');
    }
    check(errors.length===0,'No browser errors: '+errors.join('; '));
    check(network.length===0,'Standalone workshop makes no network requests');
    await writeFile(resolve(output,'report.json'),JSON.stringify({checks,errors,network},null,2));
    console.log('Browser and model: '+checks+' checks passed.');
  } finally {
    await browser.close();
  }
}
