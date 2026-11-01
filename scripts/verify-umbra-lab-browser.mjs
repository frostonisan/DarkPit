import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';

const path = resolve('docs/index-14.html');
const output = resolve('outputs/umbra-lab');
const html = await readFile(path, 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
let checks = 0;
const check = (condition, label) => { assert.ok(condition, label); checks++; };
const equal = (actual, expected, label) => { assert.equal(actual, expected, label); checks++; };
const near = (actual, expected, label) => check(Math.abs(actual - expected) < 1e-8, label);
equal(scripts.length, 2, 'Model and UI are inline');
check(!/<script[^>]+src=|<link[^>]+stylesheet|<iframe|\bimport\s*\(/.test(html), 'No runtime dependencies');
check(!/\blocalStorage\b|\bsessionStorage\b|\bfetch\s*\(/.test(html), 'No game save or network access');
for (const script of scripts) new vm.Script(script);
const sandbox = vm.createContext({ window: {} });
vm.runInContext(scripts[0], sandbox);
const { calculate, initialState, effects, umbras, attributes, multiplier, curveGain, curveProfiles, referenceLimit, defaultUmbraBase, ceiling, contributions } = sandbox.window.umbraLab;
const clone = state => JSON.parse(JSON.stringify(state));
const row = (state, key = 'physicalDamage') => calculate(state).results[key];
equal(umbras.length, 9, 'Exactly nine level-one Umbras');
equal(attributes.length, 4, 'Four directing attributes');
equal(initialState().limit,referenceLimit,'Initial entity cap uses the shared reference limit');
check(curveProfiles.every(profile=>profile.defaults.interval===referenceLimit),'All profiles derive their cycle length from the reference limit');
check(!umbras.some(spec => ['brutality', 'inflexion', 'vivacite'].includes(spec.key)), 'Higher rank Umbras excluded');
check(effects.every(spec => umbras.some(source => source.key === spec.source)), 'Every effect belongs to level one');
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
equal(zeroLimit.results.physicalDamage.total, 19998, 'Zero directing limit preserves all fixed acquisitions');
check(Object.values(zeroLimit.attributes).every(value => value === 0), 'All attributes share zero limit');
check(Object.values(zeroLimit.umbras).every(value => value === 0), 'All Umbras share zero limit');

const before = JSON.stringify(example);
calculate(example);
equal(JSON.stringify(example), before, 'Calculation does not mutate its inputs');
equal(row({ ...example, level: 99 }).total, row(example).total, 'Level is manual with no archetype gains');
const unrelated = clone(example); unrelated.umbras.esprit = 100; unrelated.attributes.intelligence = 120;
equal(row(unrelated).coefficient, row(example).coefficient, 'Another Umbra cannot influence PP ratio');
equal(row(unrelated).total, row(example).total, 'Another attribute cannot influence PP total');
// Independent formulas from profils_courbes_math.html, evaluated across full
// cycles rather than freezing history. Gain remains a percent of the base.
const referenceGain = (x,c) => {
  const w=c.interval, q=Math.floor(Math.max(0,x)/w), r=Math.max(0,x)-q*w;
  const norm=t=>{
    t=Math.max(0,Math.min(1,t));const k=c.shape;
    if(c.type==='exp')return -Math.expm1(-k*t)/(-Math.expm1(-k));
    if(c.type==='j')return Math.expm1(k*t)/Math.expm1(k);
    const z=x=>1/(1+Math.exp(-k*(x-c.mid/100))), a=z(0), b=z(1);return (z(t)-a)/(b-a);
  };
  const local=x=>c.cap*norm(x/w)+c.res*x;
  return q*local(w)+local(r);
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
  near(curveGain(curve.interval,curve),curve.cap+curve.res*curve.interval,'All families share the same complete-cycle gain');
  near(curveGain(2*curve.interval,curve),2*curveGain(curve.interval,curve),'Cycle gain accumulates without reset');
  check(multiplier(curve.interval+.001,curve)>multiplier(curve.interval,curve),'Next cycle resumes growth');
  let prior=0;
  for(let points=0;points<=3*curve.interval;points+=curve.interval/20) {
    const gain=curveGain(points,curve);check(gain>=prior,'Every profile remains monotonic across cycle boundaries');prior=gain;
  }
  const build=clone(example);build.curve={...curve};build.umbras.vigueur=17;build.attributes.strength=25;
  const m=1+referenceGain(17,curve)/100;
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
near(multiplier(200),1.851,'Full cycle: +85% and +0.1% residual');
near(multiplier(200,{}),1.851,'Partial settings preserve defaults');
near(row(example).native,15*multiplier(15),'Umbra ratio grows with the same multiplier as the attribute');
for(const [key,value] of [['cap',50],['shape',6],['res',.01],['interval',400]]) {
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
  equal(ownLimit.umbras[spec.source], 10, `${spec.key}: common source limit`);
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
  'docs/js/data/balanceData.js', 'docs/js/entites.js', 'docs/js/damagesCalcul.js',
  'docs/js/entite/entityRules.js', 'docs/js/entite/statSystem.js',
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
const reference = vm.createContext({});
vm.runInContext(unexport(balanceSource), reference);
vm.runInContext(`
  const getSafe = (entity, key, fallback=0) => entity.stats[key] ?? fallback;
  ${damageSource.match(/^const clamp = .*;$/m)[0]}
  ${damageSource.match(/^const round1 = .*;$/m)[0]}
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
for (const [u, attribute, fixed, plus] of [[0,25,0,0],[0,25,3,1],[15,60,0,0],[15,25,3,7],
  [1,3,0,.25],[.4,12.49,.25,.35],[150,150,0,0],[250,250,1000,7],[15,26.125,.23,.71]]) {
  const state=initialState(); state.mode='current'; state.limit=7; state.curve={type:'sigmoid',cap:150,shape:15,mid:70,res:.01,interval:50};
  for (const spec of attributes) state.attributes[spec.key]=attribute;
  for (const spec of umbras) state.umbras[spec.key]=u;
  for (const spec of effects) { state.fixed[spec.key]=fixed; state.plus[spec.key]=plus; state.gifts[spec.key]=99; }
  const inputs={...state.attributes,...state.umbras,...state.fixed,...Object.fromEntries(effects.map(spec=>[`${spec.key}Plus`,plus]))};
  const snapshot=calculate(state);
  for (const spec of effects) {
    const expected=spec.type==='precision'?reference.nativeE.calculatePrecisionPercent(u):reference.nativeCalculate(inputs,spec.key).value;
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
const currentExample={...initialState(true),mode:'current'};
equal(row(currentExample).total,45,'Current PP example remains Force × 0.5 + Vigueur');
equal(row({...currentExample,plus:{physicalDamage:10}}).total,55,'Current +10 PP+ gain is ten');
equal(row({...currentExample,umbras:{...currentExample.umbras,vigueur:25}}).total,55,'Current +10 Vigueur gain is also ten');
const savedInputs=JSON.stringify(currentExample);
calculate({...currentExample,mode:'concept'});
equal(JSON.stringify(currentExample),savedInputs,'Changing calculator does not mutate owned values');
console.log(`Model and current JS parity: ${checks} checks passed.`);
if (!process.argv.includes('--model-only')) {
  const require = createRequire(import.meta.url);
  const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/Utilisateur/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  await mkdir(output, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [], network = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (/^https?:/.test(request.url())) network.push(request.url()); });
    await page.route('**/*', route => /^https?:/.test(route.request().url()) ? route.abort() : route.continue());
    await page.goto(pathToFileURL(path).href);
    const total = id => page.locator(`[data-stat-total="${id.slice(id.indexOf('-')+1)}"]`).innerText();
    const field = (group, key) => page.locator(`input[data-group="${group}"][data-key="${key}"]`);
    const fill = (group, key, value) => field(group, key).fill(String(value));
    const setCurve = (scope,key,value) => scope.locator(`[data-curve="${key}"]`).evaluate((node,value)=>{node.value=String(value);node.dispatchEvent(new Event('input',{bubbles:true}));},value);
    const setCommonGain = async value => {
      const panel=page.locator('#common-balancing'),wasOpen=await panel.evaluate(node=>node.open);
      if(!wasOpen)await panel.locator('summary').click();
      await page.locator('#common-cycle-gain').fill(String(value));
      if(!wasOpen)await panel.locator('summary').click();
    };
    const baseField=(scope,id,group,key='physicalDamage')=>scope.locator(`[data-entry="${id}"] input[data-base-group="${group}"][data-base-effect="${key}"]`);
    const add = async (catalog, id, query = '') => {
      const picker = page.locator(`[data-catalog="${catalog}"]`);
      if (!await picker.evaluate(node => node.open)) await picker.locator('summary').click();
      await picker.locator('input').fill(query);
      await picker.locator(`[data-add="${id}"]`).click();
    };
    const remove = id => page.locator(`[data-remove="${id}"]`).click();
    const sharedEditor = () => page.locator('.entity').evaluate(entity => ({
      rows: [...entity.querySelectorAll('[data-entry]')].map(node => node.dataset.entry),
      inputs: [...entity.querySelectorAll('input')].map(node => ({
        id: node.id, group: node.dataset.group, key: node.dataset.key, value: node.value,
        disabled: node.disabled, min: node.min, max: node.max, step: node.step,
        visible: node.checkVisibility(),
      })),
      selects: [...entity.querySelectorAll('select')].map(node=>[node.dataset.ui,node.value,node.disabled,node.checkVisibility()]),
      buttons: [...entity.querySelectorAll('button:not([data-ui="mode-toggle"])')].map(node => [node.textContent, node.disabled]),
      settings: [...entity.querySelectorAll('[data-ui="concept-settings"], [data-ui="current-rules"]')].map(node => [node.dataset.ui, node.checkVisibility()]),
    }));
    equal(await page.locator('.picker').count(), 5, 'Five searchable dropdowns including attributes');
    equal(await page.locator('[data-entry]').count(), 0, 'No initial rows or default acquisitions');
    check(await page.locator('#empty').isVisible(), 'Empty state guides selection');
    equal(await page.locator('.picker[open]').count(), 0, 'Dropdowns begin closed');
    await page.screenshot({ path: resolve(output, 'empty.png'), fullPage: true });
    const statsPicker = page.locator('[data-catalog="stats"]');
    const attributesPicker = page.locator('[data-catalog="attributes"]');
    await attributesPicker.locator('summary').click();
    await attributesPicker.locator('input').fill('AGILITE');
    equal(await attributesPicker.locator('li:visible').count(), 1, 'Search ignores case and accents');
    check(await attributesPicker.locator('[data-add="attribute-agility"]').isVisible(), 'Attributes have their own searchable list');
    await attributesPicker.locator('input').fill('zzzz-no-match');
    check(await attributesPicker.locator('.no-match').isVisible(), 'Empty search has feedback');
    await attributesPicker.locator('input').press('Escape');
    equal(await page.locator('.picker[open]').count(), 0, 'Escape closes the search');
    check(await attributesPicker.locator('summary').evaluate(node => document.activeElement === node), 'Escape restores keyboard focus');

    await add('stats', 'fixed-physicalDamage', 'PP fixe');
    equal(await page.locator('[data-entry]').count(), 1, 'Click adds only the selected row');
    equal(await total('fixed-physicalDamage'), '1', 'Fixed PP starts at one point');
    await add('plus', 'plus-physicalDamage', 'pp');
    equal(await total('plus-physicalDamage'), '2', 'PP+ adds without a hidden attribute');
    await add('attributes', 'attribute-strength', 'force');
    await fill('attributes', 'strength', 25);
    equal(await total('plus-physicalDamage'), '15', 'Selected Force drives ceil(12.5), plus and fixed');
    await add('x', 'x-physicalDamage', 'pp');
    equal(await total('x-physicalDamage'), '15', 'Selecting an X view creates no acquisition');
    check((await page.locator('[data-ratio="x-physicalDamage"]').innerText()).includes('Inactive'), 'X reports missing Umbra');
    equal(await page.locator('[data-entry="umbra-vigueur"]').count(), 0, 'Selecting X never silently adds an Umbra');
    await add('umbras', 'umbra-vigueur', 'vig');
    await fill('umbras', 'vigueur', 15);
    equal(await total('x-physicalDamage'), '58', 'Selected Umbra activates shared X calculation');
    await add('umbras', 'umbra-vigueur', 'vig');
    equal(await page.locator('[data-entry]').count(), 5, 'Repeated selection never duplicates a row');
    equal(await field('umbras', 'vigueur').inputValue(), '15', 'Repeated selection preserves quantity');
    equal(await page.locator('.detail-row:visible').count(), 0, 'Calculations remain collapsed by default');
    equal(await page.locator('.picker[open]').count(), 0, 'Selection closes its dropdown');

    await page.locator('#example').click();
    equal(await page.locator('[data-entry]').count(), 5, 'Example adds only its five relevant rows');
    equal(await total('x-physicalDamage'), '81', 'Example uses both progressive ratios');
    equal(await page.locator('[data-curve]').count(),3,'Only curve shape, residual gain and center remain per entity');
    equal(await page.locator('[data-curve="cap"], [data-curve="interval"]').count(),0,'Gain and interval sliders are removed');
    equal(await page.locator('#common-cycle-gain').count(),1,'Cycle gain has one common editor');
    equal(await page.locator('#reference-limit').textContent(),String(referenceLimit),'Common rules state the fixed reference limit');
    equal(await page.locator('#curve-points').inputValue(),'15','Chart points and table points share state');
    near(Number(await page.locator('#curve-chart').getAttribute('data-current')),multiplier(15),'Chart marker displays the actual multiplier');
    check((await page.locator('#curve-attribute').innerText()).includes('44'),'Chart reports the actual rounded attribute gain');
    check((await page.locator('#curve-native').innerText()).includes('22'),'Chart reports the scaled Umbra gain');
    await page.locator('#curve-view').selectOption('total');
    equal(await page.locator('#curve-chart').getAttribute('data-current'),'81','Total chart marker equals the entity total');
    const curveBuild=initialState(true);
    for(const [key,value] of [['cap',50],['shape',6],['res',.01]]) {
      curveBuild.curve[key]=value;if(key==='cap')await setCommonGain(value);else await setCurve(page,key,value);
      equal(Number(await page.locator('#curve-chart').getAttribute('data-current')),row(curveBuild).total,`${key}: chart follows the live entity calculation`);
      equal(Number(await total('x-physicalDamage')),row(curveBuild).total,`${key}: table follows the same calculation`);
      equal(await field('umbras','vigueur').inputValue(),'15',`${key}: previously acquired points are conserved`);
    }
    await page.locator('#curve-points').fill('25');
    equal(await field('umbras','vigueur').inputValue(),'25','Editing curve progression changes the actual table source');
    await page.locator('#curve-reset').click();
    equal(await field('umbras','vigueur').inputValue(),'25','Curve reset preserves acquisitions');
    equal(await page.locator('#common-cycle-gain').inputValue(),'50','Resetting an entity profile preserves the common gain');
    const resetBuild=initialState(true);resetBuild.umbras.vigueur=25;resetBuild.curve.cap=50;
    equal(Number(await total('x-physicalDamage')),row(resetBuild).total,'Profile reset uses the current common gain');
    await setCommonGain(85);
    equal(await total('x-physicalDamage'),'115','Reset recomputes both ratios with the source defaults');
    check(await page.locator('#curve-unlock').isDisabled(),'Unlock requires reaching the common limit');
    await page.locator('#curve-fill').click();
    equal(await field('umbras','vigueur').inputValue(),'200','Max reaches the common limit');
    const atLimit=await total('x-physicalDamage');
    await page.locator('#curve-unlock').click();
    equal(await page.locator('#limit').inputValue(),'400','Unlock adds the original interval to the common cap');
    equal(await total('x-physicalDamage'),atLimit,'Unlock alone does not change existing ratios or totals');
    await page.locator('[data-curve-add="10"]').click();
    equal(await field('umbras','vigueur').inputValue(),'210','Progression resumes on the next cumulative cycle');
    await add('attributes','attribute-intelligence');await fill('attributes','intelligence',300);
    await add('umbras','umbra-esprit');await fill('umbras','esprit',300);
    equal(await page.locator('[data-total="attribute-intelligence"]').innerText(),'300','Common unlock opens another attribute');
    check((await page.locator('[data-ratio="umbra-esprit"]').innerText()).includes('300 / 400'),'Common unlock opens another Umbra');
    await page.locator('#curve-effect').selectOption('dayHpRegen');
    await page.locator('#curve-points').fill('15');
    equal(await page.locator('#curve-effect').inputValue(),'dayHpRegen','Adding an Umbra from a secondary effect preserves the plotted statistic');
    equal(await field('umbras','vitality').inputValue(),'15','Chart creates the actual Umbra row when needed');
    equal(await page.locator('#curve-chart').getAttribute('data-current'),'3','Secondary curve uses dependent HP totals');
    await page.locator('#example').click();
    equal(await page.locator('#curve-profile option').count(),3,'All three profiles can be selected');
    check(!await page.locator('[data-curve="mid"]').isVisible(),'Sigmoid center is hidden for the exponential');
    await fill('umbras','vigueur',80);
    await baseField(page,'plus-physicalDamage','attributeBases').fill('0.75');
    await baseField(page,'umbra-vigueur','umbraBases').fill('1.25');
    await page.locator('#limit').fill('350');
    const profileBuild=initialState(true);profileBuild.umbras.vigueur=80;profileBuild.limit=350;
    profileBuild.attributeBases.physicalDamage=.75;profileBuild.umbraBases.physicalDamage=1.25;
    const acquisitions=()=>page.locator('input[data-group], input[data-base-group], #level, #limit').evaluateAll(nodes=>nodes.map(node=>[node.dataset.group||node.dataset.baseGroup||node.id,node.dataset.key||node.dataset.baseEffect,node.value]));
    const profileInputs=JSON.stringify(await acquisitions());
    await page.locator('#curve-view').selectOption('total');
    await setCommonGain(60);await setCurve(page,'shape',7);
    profileBuild.curve={...profileBuild.curve,cap:60,shape:7};
    const tunedExponential={...profileBuild.curve};
    for(const type of ['j','sigmoid']) {
      await page.locator('#curve-profile').selectOption(type);
      profileBuild.curve={...curveProfiles.find(profile=>profile.type===type).defaults,cap:60};
      equal(Number(await total('x-physicalDamage')),row(profileBuild).total,`${type}: selecting a profile recalculates the existing entity`);
      equal(Number(await page.locator('#curve-chart').getAttribute('data-current')),row(profileBuild).total,`${type}: graph and table use the same profile`);
      equal(await page.locator('#curve-chart').getAttribute('data-profile'),type,'Graph tracks the active profile');
      equal(JSON.stringify(await acquisitions()),profileInputs,`${type}: profile selection preserves all points, bases and common limit`);
      await page.locator('.curve-panel').screenshot({path:resolve(output,`profile-${type}.png`)});
    }
    check(await page.locator('[data-curve="mid"]').isVisible(),'Sigmoid exposes its center control');
    await setCurve(page,'mid',70);profileBuild.curve.mid=70;
    equal(Number(await total('x-physicalDamage')),row(profileBuild).total,'Moving the sigmoid center recalculates actual entity values');
    await page.locator('#curve-view').selectOption('ratio');
    near(Number(await page.locator('#curve-chart').getAttribute('data-current')),multiplier(80,profileBuild.curve),'Sigmoid graph uses the edited center');
    await page.locator('#curve-profile').selectOption('j');
    await setCommonGain(40);await setCurve(page,'shape',3);
    const tunedJ={...curveProfiles.find(profile=>profile.type==='j').defaults,cap:40,shape:3};
    profileBuild.curve={...tunedJ};
    equal(Number(await total('x-physicalDamage')),row(profileBuild).total,'J uses its own intensity and the common gain');
    await page.locator('#curve-profile').selectOption('exp');
    equal(await page.locator('#common-cycle-gain').inputValue(),'40','Switching profiles preserves the common gain');
    equal(await page.locator('[data-curve="shape"]').inputValue(),'7','Exponential intensity survives profile round trips');
    equal(Number(await total('x-physicalDamage')),row({...profileBuild,curve:{...tunedExponential,cap:40}}).total,'Previously inactive exponential uses the updated common gain and its own intensity');
    await page.locator('#mode-toggle').click();
    await page.locator('#curve-profile').selectOption('sigmoid');
    equal(await total('x-physicalDamage'),'110','Profile selection in current mode leaves the actual game calculation unchanged');
    equal(await page.locator('[data-curve="mid"]').inputValue(),'70','Edited sigmoid center is restored even in current mode');
    const profileCurrentEditor=await sharedEditor();
    await page.locator('#mode-toggle').click();
    equal(JSON.stringify(await sharedEditor()),JSON.stringify(profileCurrentEditor),'Mode switch preserves the selected profile and all its controls');
    await page.locator('#curve-reset').click();
    equal(await page.locator('#curve-profile').inputValue(),'sigmoid','Reset affects the selected profile without switching family');
    equal(await page.locator('[data-curve="mid"]').inputValue(),'50','Reset restores the selected sigmoid defaults');
    equal(JSON.stringify(await acquisitions()),profileInputs,'Resetting a profile preserves the build and common limit');
    await page.locator('#curve-profile').selectOption('j');
    equal(await page.locator('#common-cycle-gain').inputValue(),'40','Resetting sigmoid preserves common balance settings');
    check((await page.locator('#curve-common-rules').innerText()).includes('200 points'),'Cycle length stays at the reference despite an entity limit of 350');
    equal(Number(await total('x-physicalDamage')),row({...profileBuild,curve:tunedJ}).total,'Restored J settings recover its real calculation');
    await page.locator('#example').click();
    equal(await page.locator('#common-cycle-gain').inputValue(),'40','Example preserves the common gain');
    const sharedExample=initialState(true);sharedExample.curve.cap=40;
    equal(Number(await total('x-physicalDamage')),row(sharedExample).total,'Example recalculates with the shared balance settings');
    await setCommonGain(85);
    await page.locator('#curve-view').selectOption('ratio');
    equal(await page.locator('[data-entry^="attribute-"] .base-settings input').count(),0,'Attribute rows do not expose ratio settings');
    equal(await baseField(page,'plus-physicalDamage','attributeBases').inputValue(),'0.5','Selected statistic row exposes its initial attribute base');
    equal(await baseField(page,'umbra-vigueur','umbraBases').inputValue(),'1','Selected Umbra row exposes its own initial base');
    equal(await page.locator('[data-entry="fixed-physicalDamage"] .base-settings input').count(),0,'Fixed points do not invent a ratio');
    await page.locator('#curve-view').selectOption('total');
    await baseField(page,'plus-physicalDamage','attributeBases').fill('1');
    equal(await total('x-physicalDamage'),'124','Force base changes immediately recalculate the entity');
    equal(await page.locator('#curve-chart').getAttribute('data-current'),'124','Stat total curve uses the custom base');
    for(const id of ['plus-physicalDamage','x-physicalDamage','umbra-vigueur'])equal(await baseField(page,id,'attributeBases').inputValue(),'1',`${id} synchronizes the same statistic base`);
    await baseField(page,'umbra-vigueur','umbraBases').fill('');
    await baseField(page,'umbra-vigueur','umbraBases').pressSequentially('0.25');
    equal(await total('x-physicalDamage'),'108','Decimal Umbra base can be typed without losing focus');
    equal(await baseField(page,'x-physicalDamage','umbraBases').inputValue(),'0.25','X reflects the same Umbra base');
    check((await page.locator('#curve-native').innerText()).includes('0,3621'),'Curve metrics show base times multiplier, not the multiplier alone');
    await page.locator('[data-detail="x-physicalDamage"]').click();
    check((await page.locator('#detail-x-physicalDamage').innerText()).includes('base 0,25'),'Helper details explain the customized base');
    await page.locator('#mode-toggle').click();
    equal(await total('x-physicalDamage'),'45','Custom bases do not overwrite the actual game formula');
    await baseField(page,'plus-physicalDamage','attributeBases').fill('0.75');
    equal(await total('x-physicalDamage'),'45','Editing a concept base in current mode preserves the current total');
    await page.locator('#mode-toggle').click();
    equal(await total('x-physicalDamage'),'87','Returning to concept uses the edited base on the same acquisitions');
    equal(await baseField(page,'plus-physicalDamage','attributeBases').inputValue(),'0.75','Mode switching preserves the configured base');
    await baseField(page,'umbra-vigueur','umbraBases').fill('0');
    equal(await total('x-physicalDamage'),'81','Zero Umbra base keeps the fixed gift and attribute gain');
    await remove('umbra-vigueur');
    await add('umbras','umbra-vigueur');await fill('umbras','vigueur',15);
    equal(await baseField(page,'umbra-vigueur','umbraBases').inputValue(),'0','Re-selecting a source preserves its configured base');
    await add('x','x-attackExecutionReduc');
    equal(await baseField(page,'x-attackExecutionReduc','attributeBases','attackExecutionReduc').inputValue(),String(25/150),'Another selected stat exposes its own Force base in its statistic row');
    await baseField(page,'x-attackExecutionReduc','attributeBases','attackExecutionReduc').fill('0.9');
    equal(await baseField(page,'plus-physicalDamage','attributeBases').inputValue(),'0.75','Per-statistic bases remain independent even with the same attribute');
    equal(await total('x-physicalDamage'),'81','Editing execution base does not affect PP');
    await page.locator('#example').click();
    await page.locator('#curve-view').selectOption('ratio');
    await page.screenshot({ path: resolve(output, 'desktop.png'), fullPage: true });
    await page.locator('[data-detail="x-physicalDamage"]').click();
    check((await page.locator('#detail-x-physicalDamage').innerText()).includes('115 PP'), 'Comparison remains available on demand');
    const ownedBefore = await page.locator('input[data-group]').evaluateAll(nodes => nodes.map(node => [node.dataset.group,node.dataset.key,node.value]));
    const conceptEditor = await sharedEditor();
    await page.locator('#mode-toggle').click();
    equal(await total('x-physicalDamage'), '45', 'Switch selects the current JS calculation');
    equal(await page.locator('#mode-name').innerText(), 'Version actuelle', 'Active calculation mode is explicit');
    check(await page.locator('#limit').isEnabled(), 'Same limit setting remains editable in current mode');
    equal(JSON.stringify(await sharedEditor()), JSON.stringify(conceptEditor), 'Mode changes calculations only, preserving the entire editor');
    equal(await page.locator('#curve-chart').getAttribute('data-current'),'1','Current JS mode has no global ratio multiplier');
    await page.locator('#curve-view').selectOption('total');
    equal(await page.locator('#curve-chart').getAttribute('data-current'),'45','Current-mode chart shows the actual JS total');
    await fill('umbras','vigueur',15.3);
    check((await page.locator('#curve-native').innerText()).includes('15,3 points'),'Current curve metrics preserve native values before final rounding');
    await fill('umbras','vigueur',15);
    await page.locator('#curve-view').selectOption('ratio');
    check((await page.locator('#detail-x-physicalDamage').innerText()).includes('55 PP'), 'Comparison follows the current formula');
    check(!(await page.locator('#detail-x-physicalDamage').innerText()).includes('arrondi supérieur'), 'Current helper does not claim the concept rounding rule');
    equal(JSON.stringify(await page.locator('input[data-group]').evaluateAll(nodes => nodes.map(node => [node.dataset.group,node.dataset.key,node.value]))), JSON.stringify(ownedBefore), 'Switch preserves every input');
    await page.screenshot({ path: resolve(output, 'current-mode.png'), fullPage: true });
    await fill('attributes', 'strength', 250);
    await fill('umbras', 'vigueur', 250);
    equal(await total('x-physicalDamage'), '375', 'Current mode uses its own acquisition rules');
    await page.locator('#mode-toggle').click();
    equal(await total('x-physicalDamage'), '757', 'Concept applies its own limit to the same stored inputs');
    equal(await field('attributes', 'strength').inputValue(), '250', 'Switching back does not overwrite out-of-limit acquisition');
    equal(await field('umbras', 'vigueur').inputValue(), '250', 'Switching preserves raw Umbra acquisition');
    const aboveLimitEditor = await sharedEditor();
    await page.getByRole('button', { name: 'Augmenter Vigueur', exact: true }).click();
    equal(await field('umbras', 'vigueur').inputValue(), '251', 'Concept stepper retains shared acquisitions above its calculation limit');
    equal(await total('x-physicalDamage'), '757', 'Calculation limit still caps effective concept points');
    await page.getByRole('button', { name: 'Diminuer Vigueur', exact: true }).click();
    await page.locator('#mode-toggle').click();
    equal(await total('x-physicalDamage'), '375', 'Round-trip switch restores the same current result');
    equal(JSON.stringify(await sharedEditor()), JSON.stringify(aboveLimitEditor), 'Above-limit inputs have the same values and controls in both modes');
    await page.locator('#example').click();
    equal(await total('x-physicalDamage'), '45', 'Example retains the chosen mode');
    await page.locator('#mode-toggle').click();
    equal(await total('x-physicalDamage'), '81', 'Returning to concept restores its example');
    await page.locator('[data-detail="x-physicalDamage"]').click();
    await page.locator('#detail-x-physicalDamage details > summary').click();
    await fill('plus', 'physicalDamage', 10);
    equal(await total('x-physicalDamage'), '91', 'Live PP+ retains correct shared ratio');
    check(await page.locator('#detail-x-physicalDamage details').evaluate(node => node.open), 'Open progression survives recalculation');
    await fill('umbras', 'vigueur', 25);
    equal(await total('x-physicalDamage'), '125', 'Live Umbra coefficient is not counted twice');
    await page.locator('#limit').fill('200');
    equal(await total('x-physicalDamage'), '125', 'Changing limit alone preserves total');
    await fill('fixed', 'physicalDamage', 1000);
    await page.locator('#limit').fill('10');
    equal(await field('attributes', 'strength').inputValue(), '60', 'Lower concept limit preserves shared attribute acquisition');
    equal(await field('umbras', 'vigueur').inputValue(), '25', 'Lower concept limit preserves shared Umbra acquisition');
    equal((await total('x-physicalDamage')).replace(/\s/g, ''), '1041', 'Fixed acquisition survives limit reduction');
    check(await page.getByRole('button', { name: 'Augmenter Vigueur', exact: true }).isEnabled(), 'Same Umbra editing remains available beyond the calculation limit');
    await page.getByRole('button', { name: 'Augmenter Puissance physique fixe', exact: true }).click();
    await page.getByRole('button', { name: 'Augmenter Puissance physique +', exact: true }).click();
    equal((await total('x-physicalDamage')).replace(/\s/g, ''), '1043', 'Fixed and plus steppers remain unlimited');
    await remove('x-physicalDamage');
    equal((await total('plus-physicalDamage')).replace(/\s/g, ''), '1043', 'Removing X closes its view without changing the build');
    await add('x', 'x-physicalDamage');
    await remove('umbra-vigueur');
    equal((await total('plus-physicalDamage')).replace(/\s/g, ''), '1017', 'Removing Umbra removes its gift and native gain and restores the plus coefficient');
    check((await page.locator('[data-ratio="x-physicalDamage"]').innerText()).includes('Inactive'), 'X becomes inactive when its Umbra is removed');
    await remove('plus-physicalDamage');
    equal((await total('fixed-physicalDamage')).replace(/\s/g, ''), '1001', 'Removing plus disables its independent attribute ratio');
    await remove('fixed-physicalDamage');
    equal(await total('x-physicalDamage'), '0', 'No orphan fixed contribution remains after removal');
    await page.locator('#clear').click();
    check(await page.locator('#empty').isVisible(), 'Clear restores empty state');
    equal(await page.locator('[data-entry]').count(), 0, 'Clear removes every selected row');

    await add('umbras', 'umbra-vitality', 'vitalite');
    await fill('umbras', 'vitality', 15);
    await add('x', 'x-dayHpRegen', 'regeneration');
    equal(await total('x-dayHpRegen'), '3 HP', 'Vitality computes its dependent effect');
    await add('stats', 'fixed-HP', 'hp');
    await fill('fixed', 'HP', 1000);
    equal(await total('x-dayHpRegen'), '10 HP', 'Selected fixed HP recomputes regeneration');
    await remove('fixed-HP');
    equal(await total('x-dayHpRegen'), '3 HP', 'Removing fixed HP recomputes regeneration');
    await remove('umbra-vitality');
    equal(await total('x-dayHpRegen'), '0 HP', 'An X view alone does not activate regeneration');
    await page.locator('#level').fill('90');
    equal(await total('x-dayHpRegen'), '0 HP', 'Level remains manual');

    // Exercise every catalog entry and detail renderer, after the actual user flows above.
    await page.locator('#clear').click();
    await page.evaluate(() => { for (const button of document.querySelectorAll('[data-add]')) button.click(); });
    equal(await page.locator('[data-entry]').count(), 58, 'All supported entries can coexist without duplicate sources');
    await page.evaluate(() => { for (const button of document.querySelectorAll('[data-detail]')) button.click(); });
    const allDetails = await page.locator('#effects').textContent();
    check(!/undefined|NaN|Infinity/.test(allDetails), 'Every selected entry renders valid labels and calculations');
    equal(await page.locator('.detail-row:visible').count(), 58, 'Every entry exposes a detail');
    const allEntriesEditor = await sharedEditor();
    await page.locator('#mode-toggle').click();
    check(!/undefined|NaN|Infinity/.test(await page.locator('#effects').textContent()), 'Every current-mode detail renders correctly');
    equal(JSON.stringify(await sharedEditor()), JSON.stringify(allEntriesEditor), 'All 58 entries keep identical editable controls in current mode');
    check(await field('fixed', 'precisionReduction').isEnabled(), 'Direct precision input stays editable even without a current formula');
    const currentPrecision = await total('fixed-precisionReduction');
    await fill('fixed', 'precisionReduction', 7);
    await fill('plus', 'precisionReduction', 9);
    equal(await total('fixed-precisionReduction'), currentPrecision, 'Current formula ignores unsupported direct bonuses without removing the inputs');
    await page.locator('#mode-toggle').click();
    equal(await field('fixed', 'precisionReduction').inputValue(), '7', 'Concept receives the fixed precision edited in current mode');
    equal(await field('plus', 'precisionReduction').inputValue(), '9', 'Concept receives the plus precision edited in current mode');

    await page.locator('#example').click();
    await page.locator('details.rules > summary').click();
    await setCommonGain(50);
    equal(await total('x-physicalDamage'), '72', 'Curve control recalculates existing points in the table');
    await setCommonGain(85);
    await page.locator('#concept-settings > details > summary').click();
    await fill('gifts', 'physicalDamage', 2);
    equal(await total('x-physicalDamage'), '96', 'Fixed grants remain adjustable inside settings');
    const openSettingsEditor = await sharedEditor();
    await page.locator('#mode-toggle').click();
    equal(await total('x-physicalDamage'), '45', 'Current mode ignores the concept grant setting');
    equal(JSON.stringify(await sharedEditor()), JSON.stringify(openSettingsEditor), 'Open parameters keep the same visibility and editing in current mode');
    check(await page.locator('#concept-settings').isVisible(), 'Concept settings remain displayed in current mode');
    check(await page.locator('#current-rules').isVisible(), 'Calculation rules for both modes remain accessible');
    await page.locator('#limit').fill('10');
    await setCurve(page,'shape',6);
    await setCommonGain(50);
    await fill('gifts', 'physicalDamage', 3);
    equal(await total('x-physicalDamage'), '45', 'Editing concept parameters in current mode leaves its JS calculation unchanged');
    const currentSettingsEditor = await sharedEditor();
    await page.locator('#mode-toggle').click();
    equal(JSON.stringify(await sharedEditor()), JSON.stringify(currentSettingsEditor), 'Current-mode edits are used directly by concept without an alternate build');
    equal(await total('x-physicalDamage'), '48', 'Concept uses the newly edited limit, curve and grant on the same points');
    await page.locator('#limit').fill('150');
    await setCurve(page,'shape',10);
    await setCommonGain(85);
    await fill('gifts', 'physicalDamage', 2);
    equal(await total('x-physicalDamage'), '96', 'Restoring concept parameters recovers the unchanged acquisitions');
    await fill('gifts', 'physicalDamage', 1);
    await page.locator('details.rules > summary').click();
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No page overflow at ${width}px`);
      for (const catalog of ['stats', 'plus', 'x', 'umbras', 'attributes']) {
        const picker = page.locator(`[data-catalog="${catalog}"]`);
        await picker.locator('summary').click();
        check(await picker.locator('.picker-panel').evaluate(node => { const box = node.getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth; }), `${catalog} dropdown fits at ${width}px`);
        await picker.locator('input').press('Escape');
      }
    }
    await page.locator('#curve-profile').selectOption('sigmoid');
    check(await page.locator('[data-curve="mid"]').isVisible(),'Sigmoid settings remain accessible on mobile');
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Sigmoid profile controls fit at 320px');
    await page.locator('#curve-profile').selectOption('exp');
    await page.setViewportSize({ width: 390, height: 844 });
    check(await page.locator('[data-total="x-physicalDamage"]').evaluate(node => node.getBoundingClientRect().right <= innerWidth), 'Mobile total fits the viewport');
    await page.screenshot({ path: resolve(output, 'mobile.png'), fullPage: true });
    await page.locator('[data-detail="x-physicalDamage"]').click();
    check(await page.locator('#detail-x-physicalDamage').evaluate(node => node.scrollWidth <= innerWidth), 'Mobile calculation fits the viewport');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('[data-detail="x-physicalDamage"]').click();
    await statsPicker.locator('summary').click();
    await statsPicker.locator('input').fill('pp');
    await page.screenshot({ path: resolve(output, 'dropdown.png'), fullPage: true });
    await statsPicker.locator('input').press('Escape');

    const first=page.locator('[data-entity-id="entity-1"]');
    const entityTotal=entity=>entity.locator('[data-stat-total="physicalDamage"]').innerText();
    const entityFill=(entity,group,key,value)=>entity.locator(`input[data-group="${group}"][data-key="${key}"]`).fill(String(value));
    const settings=entity=>entity.locator('input:not([type="search"])').evaluateAll(nodes=>nodes.map(node=>[node.dataset.ui||node.dataset.group||'name',node.dataset.key||'',node.value]));
    const rowNumber=(entity,id)=>entity.locator(`[data-total="${id}"]`).evaluate(node=>node.firstChild.textContent.trim());
    await first.locator('.entity-name').fill('Porc Vigueur');
    await first.locator('[data-ui="example"]').click();
    for(const [group,key] of [['attributes','strength'],['umbras','vigueur'],['fixed','physicalDamage'],['plus','physicalDamage']])await entityFill(first,group,key,10);
    equal(await entityTotal(first),'51','User build has a separate 51 PP total with both cycle ratios');
    equal(await rowNumber(first,'fixed-physicalDamage'),'10','Fixed row no longer repeats the global total');
    equal(await rowNumber(first,'plus-physicalDamage'),'10','Plus row shows its exclusive contribution');
    equal(await first.locator('[data-total="umbra-vigueur"] [data-contribution-stat="physicalDamage"]').evaluate(node=>node.firstChild.textContent),'31','Umbra row shows 31 PP');
    equal(await rowNumber(first,'x-physicalDamage'),'21','X displays its included capacity');
    equal(await first.locator('[data-stat-total="physicalDamage"]').count(),1,'Exactly one PP total despite four related rows');
    check((await first.locator('[data-breakdown="physicalDamage"]').innerText()).includes('Fixe 10 + Stat+ 10 + Vigueur 31'),'Total explains the non-duplicated sum');

    const firstBefore=await settings(first);
    await page.locator('#add-entity').click();
    const second=page.locator('[data-entity-id="entity-2"]');
    equal(await page.locator('.entity').count(),2,'Two entities are displayed simultaneously');
    equal(await second.locator('[data-entry]').count(),0,'New entity starts independently');
    equal(JSON.stringify(await settings(first)),JSON.stringify(firstBefore),'Creating an entity preserves the first build');
    await second.locator('.entity-name').fill('Porc PP+');
    await second.locator('[data-ui="example"]').click();
    await entityFill(second,'attributes','strength',10);
    await entityFill(second,'umbras','vigueur',0);
    await entityFill(second,'fixed','physicalDamage',10);
    await entityFill(second,'plus','physicalDamage',20);
    equal(await entityTotal(second),'35','Second entity computes its own build');
    equal(await rowNumber(second,'plus-physicalDamage'),'25','Without Umbra, the plus row includes its attribute ratio');
    equal(await entityTotal(first),'51','Second entity edits do not affect the first');
    await second.locator('[data-ui="level"]').fill('12');
    await second.locator('[data-ui="limit"]').fill('80');
    await second.locator('details.rules > summary').click();
    await setCurve(second,'shape',6);
    const beforeSharedGain=[await settings(first),await settings(second)];
    await setCommonGain(50);
    equal(await entityTotal(first),'48','Common gain immediately recalculates the first entity');
    equal(JSON.stringify([await settings(first),await settings(second)]),JSON.stringify(beforeSharedGain),'Shared balance changes preserve all entity acquisitions and local controls');
    await second.locator('[data-ui="concept-settings"] > details > summary').click();
    await entityFill(second,'gifts','physicalDamage',2);
    await entityFill(second,'umbras','vigueur',10);
    equal(await entityTotal(second),'68','Each entity keeps its own curve shape and grants with the common gain');
    await baseField(second,'umbra-vigueur','umbraBases').fill('2');
    equal(await baseField(first,'umbra-vigueur','umbraBases').inputValue(),'1','Each entity owns its Umbra base');
    equal(await entityTotal(first),'48','Another entity’s base cannot change this entity');
    equal(await entityTotal(second),'79','Custom base applies only to its own entity');
    await baseField(second,'umbra-vigueur','umbraBases').fill('1');
    await second.locator('[data-ui="curve-profile"]').selectOption('j');
    await setCurve(second,'shape',4);
    equal(await first.locator('[data-ui="curve-profile"]').inputValue(),'exp','Another entity can select its own independent profile');
    equal(await entityTotal(first),'48','Changing another entity’s profile leaves this entity’s calculations intact');
    await second.locator('[data-ui="curve-profile"]').selectOption('exp');
    equal(await second.locator('[data-curve="shape"]').inputValue(),'6','Switching profiles restores the second entity’s tuned exponential');
    equal(await entityTotal(second),'68','Restoring a profile preserves its per-entity bases and grants');
    const secondBefore=await settings(second);
    await second.locator('[data-ui="mode-toggle"]').click();
    equal(await entityTotal(second),'45','Second entity can use current JS while the first remains conceptual');
    await setCommonGain(85);
    equal(await entityTotal(first),'51','Shared gain updates an entity still using Concept');
    equal(await entityTotal(second),'45','Shared gain leaves the current-game calculation unchanged');
    await setCommonGain(50);
    equal(await first.locator('[data-ui="mode-name"]').innerText(),'Concept','Calculation mode is isolated per entity');
    equal(JSON.stringify(await settings(second)),JSON.stringify(secondBefore),'Mode switch preserves name, levels, limit, curve, grants and every input');
    equal(JSON.stringify(await settings(first)),JSON.stringify(firstBefore),'Switching another entity preserves all first-entity settings');
    await second.locator('[data-ui="mode-toggle"]').click();
    equal(await entityTotal(second),'68','Returning to concept restores the same second result');
    equal(JSON.stringify(await settings(second)),JSON.stringify(secondBefore),'Round trip preserves all second-entity settings');
    await first.locator('[data-ui="mode-toggle"]').click();
    equal(await entityTotal(first),'35','First entity switches independently');
    equal(await entityTotal(second),'68','Second entity remains unchanged');
    await first.locator('[data-ui="mode-toggle"]').click();
    await entityFill(first,'fixed','physicalDamage',11);
    equal(await entityTotal(first),'49','First entity still updates independently');
    equal(await entityTotal(second),'68','No input selector leaks to the other entity');
    await entityFill(first,'fixed','physicalDamage',10);
    check(await page.evaluate(()=>{const ids=[...document.querySelectorAll('[id]')].map(node=>node.id);return new Set(ids).size===ids.length;}),'Multiple entities have unique DOM and detail identifiers');
    await second.locator('details.rules > summary').click();
    const firstBox=await first.boundingBox(), secondBox=await second.boundingBox();
    check(secondBox.x>firstBox.x && Math.abs(secondBox.y-firstBox.y)<2,'Entity tables are side by side on desktop');
    await page.screenshot({path:resolve(output,'multiple-entities.png'),fullPage:true});
    for(const entity of [first,second])for(const catalog of ['stats','plus','x','umbras','attributes']) {
      const picker=entity.locator(`[data-catalog="${catalog}"]`);
      await picker.locator('summary').click();
      check(await picker.locator('.picker-panel').evaluate(node=>{const panel=node.getBoundingClientRect(),card=node.closest('.entity').getBoundingClientRect();return panel.left>=card.left&&panel.right<=card.right;}),'Dropdown remains inside its owning entity');
      await picker.locator('input').press('Escape');
    }
    await page.setViewportSize({width:390,height:844});
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Multiple entities do not overflow on mobile');
    await page.screenshot({path:resolve(output,'multiple-entities-mobile.png'),fullPage:true});
    await first.locator('[data-ui="clear"]').click();
    check(await first.locator('[data-ui="empty"]').isVisible(),'Clear only empties its own entity');
    equal(await first.locator('.entity-name').inputValue(),'Porc Vigueur','Clear preserves the entity name');
    equal(await entityTotal(second),'68','Clearing another entity leaves the second build untouched');
    await first.locator('[data-remove-entity]').click();
    equal(await page.locator('.entity').count(),1,'Minus Entity removes only the intended entity');
    equal(await entityTotal(second),'68','Remaining entity retains results and settings');
    await page.locator('#add-entity').click();
    const third=page.locator('[data-entity-id="entity-3"]');
    equal(await third.locator('[data-entry]').count(),0,'Entity created after removal is fresh');
    equal(await third.locator('[data-curve="shape"]').inputValue(),'10','A fresh entity preserves the original exponential intensity independently');
    equal(await page.locator('#common-cycle-gain').inputValue(),'50','A fresh entity preserves the common per-cycle gain');
    check((await third.locator('[data-ui="curve-common-rules"]').innerText()).includes('+50 %'),'A fresh entity inherits the current common gain');
    await third.locator('[data-ui="example"]').click();
    equal(await entityTotal(third),'72','A new entity calculates with the common gain');
    await third.locator('[data-ui="clear"]').click();
    equal(await page.locator('#common-cycle-gain').inputValue(),'50','Clearing an entity preserves the shared gain');
    await third.locator('[data-remove-entity]').click();
    await second.locator('[data-remove-entity]').click();
    check(await page.locator('#no-entities').isVisible(),'Removing the final entity leaves the add action available');
    await page.locator('#add-entity').click();
    equal(await page.locator('.entity').count(),1,'An entity can be created again after removing all');
    equal(errors.length, 0, `No browser errors: ${errors.join('; ')}`);
    equal(network.length, 0, 'Standalone page makes no external requests');
    await writeFile(resolve(output, 'verification.json'), JSON.stringify({ checks, errors, network }, null, 2));
    console.log(`Browser and model: ${checks} checks passed. Screenshots: ${output}`);
  } finally {
    await browser.close();
  }
}
