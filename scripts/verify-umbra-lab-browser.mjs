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
const { calculate, initialState, effects, umbras, attributes, multiplier, ceiling, contributions } = sandbox.window.umbraLab;
const clone = state => JSON.parse(JSON.stringify(state));
const row = (state, key = 'physicalDamage') => calculate(state).results[key];
equal(umbras.length, 9, 'Exactly nine level-one Umbras');
equal(attributes.length, 4, 'Four directing attributes');
check(!umbras.some(spec => ['brutality', 'inflexion', 'vivacite'].includes(spec.key)), 'Higher rank Umbras excluded');
check(effects.every(spec => umbras.some(source => source.key === spec.source)), 'Every effect belongs to level one');
check(Object.values(calculate(initialState()).results).every(effect => effect.total === 0), 'Empty inputs yield zero');

const example = initialState(true);
equal(row(example).attributeGain, 50, 'Force 60 and Vigueur 15 give 50 through the attribute ratio');
equal(row(example).total, 80, 'Example has native 15 + fixed grant 15 + Force 50');
const addPlus = clone(example); addPlus.plus.physicalDamage = 10;
equal(row(addPlus).total, 90, '+10 PP+ adds 10 once an Umbra supplies the ratio');
equal(row(addPlus).coefficient, row(example).coefficient, 'PP+ cannot grow its coefficient');
const addUmbra = clone(example); addUmbra.umbras.vigueur += 10;
equal(row(addUmbra).total, 108, '+10 Vigueur adds 28 in the reference build');
equal(row(addUmbra).attributeGain, 58, 'Fractional Force contribution is rounded upward');
const lineExample=initialState();
lineExample.attributes.strength=10; lineExample.umbras.vigueur=10;
lineExample.fixed.physicalDamage=10; lineExample.plus.physicalDamage=10;
equal(row(lineExample).total,48,'User example has 48 total PP');
const lineParts=contributions(row(lineExample));
equal(lineParts.fixed,10,'Fixed PP row displays its own ten-point contribution');
equal(lineParts.plus,10,'PP+ does not count the Umbra attribute ratio again');
equal(lineParts.umbra,28,'Vigueur row displays its gift and generated capacity');
equal(lineParts.x,18,'X is an included capacity, not another acquisition');
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
equal(multiplier(30), 2, 'K is the midpoint between multiplier one and three');
equal(multiplier(30, {}), 2, 'Partial settings preserve defaults');

for (const spec of effects) {
  const state = initialState();
  for (const attribute of attributes) state.attributes[attribute.key] = 25;
  state.umbras[spec.source] = 15;
  const ordinary = row(state, spec.key);
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
equal(row(vitality, 'HP').total, 121, 'Vitality native HP curve plus fixed HP grant');
equal(row(vitality, 'dayHpRegen').total, 2, 'Regeneration follows current max HP and active base');
vitality.fixed.HP = 1000;
equal(row(vitality, 'dayHpRegen').total, 7, 'Fixed HP propagates to regeneration in the same calculation');
const haste = initialState(); haste.umbras.haste = 15;
haste.attributes.strength = 60; haste.attributes.intelligence = 60; haste.attributes.agility = 60;
equal(row(haste, 'attackExecutionReduc').attributeGain, 17, 'Haste boosts the original execution coefficient');
check(row(haste, 'attackProjectileSpeed').total > 20, 'Projectile time reduction converts to speed gain');
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
  const state=initialState(); state.mode='current'; state.limit=7; state.curve={k:1,max:100};
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
    const add = async (catalog, id, query = '') => {
      const picker = page.locator(`[data-catalog="${catalog}"]`);
      if (!await picker.evaluate(node => node.open)) await picker.locator('summary').click();
      await picker.locator('input').fill(query);
      await picker.locator(`[data-add="${id}"]`).click();
    };
    const remove = id => page.locator(`[data-remove="${id}"]`).click();
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
    equal(await total('x-physicalDamage'), '53', 'Selected Umbra activates shared X calculation');
    await add('umbras', 'umbra-vigueur', 'vig');
    equal(await page.locator('[data-entry]').count(), 5, 'Repeated selection never duplicates a row');
    equal(await field('umbras', 'vigueur').inputValue(), '15', 'Repeated selection preserves quantity');
    equal(await page.locator('.detail-row:visible').count(), 0, 'Calculations remain collapsed by default');
    equal(await page.locator('.picker[open]').count(), 0, 'Selection closes its dropdown');

    await page.locator('#example').click();
    equal(await page.locator('[data-entry]').count(), 5, 'Example adds only its five relevant rows');
    equal(await total('x-physicalDamage'), '80', 'Example retains its known total');
    await page.screenshot({ path: resolve(output, 'desktop.png'), fullPage: true });
    await page.locator('[data-detail="x-physicalDamage"]').click();
    check((await page.locator('#detail-x-physicalDamage').innerText()).includes('108 PP'), 'Comparison remains available on demand');
    const ownedBefore = await page.locator('input[data-group]').evaluateAll(nodes => nodes.map(node => [node.dataset.group,node.dataset.key,node.value]));
    await page.locator('#mode-toggle').click();
    equal(await total('x-physicalDamage'), '45', 'Switch selects the current JS calculation');
    equal(await page.locator('#mode-name').innerText(), 'Version actuelle', 'Active calculation mode is explicit');
    check(await page.locator('#limit').isDisabled(), 'Concept limit is unavailable in current mode');
    check((await page.locator('#detail-x-physicalDamage').innerText()).includes('55 PP'), 'Comparison follows the current formula');
    check(!(await page.locator('#detail-x-physicalDamage').innerText()).includes('arrondi supérieur'), 'Current helper does not claim the concept rounding rule');
    equal(JSON.stringify(await page.locator('input[data-group]').evaluateAll(nodes => nodes.map(node => [node.dataset.group,node.dataset.key,node.value]))), JSON.stringify(ownedBefore), 'Switch preserves every input');
    await page.screenshot({ path: resolve(output, 'current-mode.png'), fullPage: true });
    await fill('attributes', 'strength', 250);
    await fill('umbras', 'vigueur', 250);
    equal(await total('x-physicalDamage'), '375', 'Current mode uses its own acquisition rules');
    await page.locator('#mode-toggle').click();
    equal(await total('x-physicalDamage'), '500', 'Concept applies its own limit to the same stored inputs');
    equal(await field('attributes', 'strength').inputValue(), '250', 'Switching back does not overwrite out-of-limit acquisition');
    equal(await field('umbras', 'vigueur').inputValue(), '250', 'Switching preserves raw Umbra acquisition');
    await page.locator('#mode-toggle').click();
    equal(await total('x-physicalDamage'), '375', 'Round-trip switch restores the same current result');
    await page.locator('#example').click();
    equal(await total('x-physicalDamage'), '45', 'Example retains the chosen mode');
    await page.locator('#mode-toggle').click();
    equal(await total('x-physicalDamage'), '80', 'Returning to concept restores its example');
    await page.locator('[data-detail="x-physicalDamage"]').click();
    await page.locator('#detail-x-physicalDamage details > summary').click();
    await fill('plus', 'physicalDamage', 10);
    equal(await total('x-physicalDamage'), '90', 'Live PP+ retains correct shared ratio');
    check(await page.locator('#detail-x-physicalDamage details').evaluate(node => node.open), 'Open progression survives recalculation');
    await fill('umbras', 'vigueur', 25);
    equal(await total('x-physicalDamage'), '118', 'Live Umbra coefficient is not counted twice');
    await page.locator('#limit').fill('200');
    equal(await total('x-physicalDamage'), '118', 'Changing limit alone preserves total');
    await fill('fixed', 'physicalDamage', 1000);
    await page.locator('#limit').fill('10');
    equal(await field('attributes', 'strength').inputValue(), '10', 'Limit clamps selected attributes');
    equal(await field('umbras', 'vigueur').inputValue(), '10', 'Limit clamps selected Umbras');
    equal((await total('x-physicalDamage')).replace(/\s/g, ''), '1038', 'Fixed acquisition survives limit reduction');
    check(await page.getByRole('button', { name: 'Augmenter Vigueur', exact: true }).isDisabled(), 'Umbra stepper stops at its limit');
    await page.getByRole('button', { name: 'Augmenter Puissance physique fixe', exact: true }).click();
    await page.getByRole('button', { name: 'Augmenter Puissance physique +', exact: true }).click();
    equal((await total('x-physicalDamage')).replace(/\s/g, ''), '1040', 'Fixed and plus steppers remain unlimited');
    await remove('x-physicalDamage');
    equal((await total('plus-physicalDamage')).replace(/\s/g, ''), '1040', 'Removing X closes its view without changing the build');
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
    equal(await total('x-dayHpRegen'), '2 HP', 'Vitality computes its dependent effect');
    await add('stats', 'fixed-HP', 'hp');
    await fill('fixed', 'HP', 1000);
    equal(await total('x-dayHpRegen'), '7 HP', 'Selected fixed HP recomputes regeneration');
    await remove('fixed-HP');
    equal(await total('x-dayHpRegen'), '2 HP', 'Removing fixed HP recomputes regeneration');
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
    await page.locator('#mode-toggle').click();
    check(!/undefined|NaN|Infinity/.test(await page.locator('#effects').textContent()), 'Every current-mode detail renders correctly');
    check(await field('fixed', 'precisionReduction').isDisabled(), 'Unavailable current direct precision effect is explicit');
    await page.locator('#mode-toggle').click();
    check(await field('fixed', 'precisionReduction').isEnabled(), 'Concept-only input is restored when switching back');

    await page.locator('#example').click();
    await page.locator('details.rules > summary').click();
    await page.locator('#curve-max').fill('');
    await page.locator('#curve-max').pressSequentially('2.5');
    equal(await total('x-physicalDamage'), '75', 'Typed decimal curve parameter recalculates the table');
    await page.locator('#curve-max').fill('3');
    await page.locator('#concept-settings > details > summary').click();
    await fill('gifts', 'physicalDamage', 2);
    equal(await total('x-physicalDamage'), '95', 'Fixed grants remain adjustable inside settings');
    await page.locator('#mode-toggle').click();
    equal(await total('x-physicalDamage'), '45', 'Current mode ignores the concept grant setting');
    check(await page.locator('#current-rules').isVisible(), 'Rules switch with the calculation mode');
    await page.locator('#mode-toggle').click();
    equal(await total('x-physicalDamage'), '95', 'Concept grant setting survives the round trip');
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
    equal(await entityTotal(first),'48','User screenshot build has a separate 48 PP total');
    equal(await rowNumber(first,'fixed-physicalDamage'),'10','Fixed row no longer repeats the global total');
    equal(await rowNumber(first,'plus-physicalDamage'),'10','Plus row shows its exclusive contribution');
    equal(await first.locator('[data-total="umbra-vigueur"] [data-contribution-stat="physicalDamage"]').evaluate(node=>node.firstChild.textContent),'28','Umbra row shows 28 PP');
    equal(await rowNumber(first,'x-physicalDamage'),'18','X displays its included capacity');
    equal(await first.locator('[data-stat-total="physicalDamage"]').count(),1,'Exactly one PP total despite four related rows');
    check((await first.locator('[data-breakdown="physicalDamage"]').innerText()).includes('Fixe 10 + Stat+ 10 + Vigueur 28'),'Total explains the non-duplicated sum');

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
    equal(await entityTotal(first),'48','Second entity edits do not affect the first');
    await second.locator('[data-ui="level"]').fill('12');
    await second.locator('[data-ui="limit"]').fill('80');
    await second.locator('details.rules > summary').click();
    await second.locator('[data-ui="curve-k"]').fill('45');
    await second.locator('[data-ui="curve-max"]').fill('4');
    await second.locator('[data-ui="concept-settings"] > details > summary').click();
    await entityFill(second,'gifts','physicalDamage',2);
    await entityFill(second,'umbras','vigueur',10);
    equal(await entityTotal(second),'68','Each entity has its own curve and grants');
    const secondBefore=await settings(second);
    await second.locator('[data-ui="mode-toggle"]').click();
    equal(await entityTotal(second),'45','Second entity can use current JS while the first remains conceptual');
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
    equal(await third.locator('[data-ui="curve-k"]').inputValue(),'30','A fresh entity does not inherit another entity’s settings');
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
