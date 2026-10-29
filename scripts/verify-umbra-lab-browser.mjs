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
const { calculate, initialState, effects, umbras, attributes, multiplier, ceiling } = sandbox.window.umbraLab;
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

console.log(`Model: ${checks} checks passed.`);
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
    const total = key => page.locator(`[data-total="${key}"]`).innerText();
    const fill = (group, key, value) => page.locator(`input[data-group="${group}"][data-key="${key}"]`).fill(String(value));
    equal(await total('physicalDamage'), '80', 'Example renders immediately');
    check((await page.locator('#detail-physicalDamage').innerText()).includes('Contribution de Force'), 'Attribute has its name in the detail');
    check((await page.locator('#detail-physicalDamage').innerText()).includes('108 PP'), 'PP comparison is rendered');
    await page.screenshot({ path: resolve(output, 'desktop.png'), fullPage: true });
    await fill('plus', 'physicalDamage', 10);
    equal(await total('physicalDamage'), '90', 'PP+ updates immediately');
    await fill('umbras', 'vigueur', 25);
    equal(await total('physicalDamage'), '118', 'Umbra updates immediately without double ratio');
    await page.locator('#limit').fill('200');
    equal(await total('physicalDamage'), '118', 'Increasing live limit preserves total');
    equal(await page.locator('#umbra-vigueur').getAttribute('max'), '200', 'Live limit is applied to inputs');
    await fill('fixed', 'physicalDamage', 1000);
    await page.locator('#limit').fill('10');
    equal(await page.locator('#attribute-strength').inputValue(), '10', 'Lowering live limit clamps attributes');
    equal(await page.locator('#umbra-vigueur').inputValue(), '10', 'Lowering live limit clamps Umbras');
    equal((await total('physicalDamage')).replace(/\s/g, ''), '1038', 'Clamping leaves fixed gains untouched');
    check(await page.getByRole('button', { name: 'Augmenter Vigueur', exact: true }).isDisabled(), 'Stepper stops at the limit');
    equal(await page.locator('[data-gain="physicalDamage"]').innerText(), 'Limite', 'Marginal gain reports limit');
    await page.locator('#limit').fill('200');
    await page.getByRole('button', { name: 'Augmenter Vigueur', exact: true }).click();
    equal(await page.locator('#umbra-vigueur').inputValue(), '11', 'New limit reopens the stepper');
    await page.locator('#clear').click();
    equal(await total('physicalDamage'), '0', 'Clear resets to empty');
    await fill('attributes', 'strength', 25);
    await fill('plus', 'physicalDamage', 1);
    equal(await total('physicalDamage'), '14', 'Live result applies ceil(12.5) = 13');
    await page.locator('[data-detail="physicalDamage"]').click();
    check((await page.locator('#detail-physicalDamage').innerText()).includes('12,5 → 13'), 'Detail shows upward rounding');
    await page.locator('#level').fill('90');
    equal(await total('physicalDamage'), '14', 'Manual level does not generate hidden progression');
    await fill('umbras', 'vitality', 15);
    equal(await total('dayHpRegen'), '2 HP', 'Dependent regeneration updates live');
    await fill('fixed', 'HP', 1000);
    equal(await total('dayHpRegen'), '7 HP', 'HP change recomputes dependent effect');
    for (const spec of effects) {
      const button = page.locator(`[data-detail="${spec.key}"]`);
      if (await button.getAttribute('aria-expanded') !== 'true') await button.click();
    }
    const allDetails = await page.locator('#effects').innerText();
    check(!/undefined|NaN|Infinity/.test(allDetails), 'All detail formulas and labels are valid');
    equal(await page.locator('.detail-row:visible').count(), effects.length, 'Every effect has an accessible detail');
    await page.locator('#example').click();
    await page.locator('details.rules > summary').click();
    await page.locator('#curve-max').fill('1');
    equal(await total('physicalDamage'), '60', 'Common curve setting recomputes the ratio live');
    await page.locator('#curve-max').fill('3');
    equal(await total('physicalDamage'), '80', 'Curve can be restored');
    await page.locator('#curve-max').fill('');
    await page.locator('#curve-max').pressSequentially('2.5');
    equal(await page.locator('#curve-max').inputValue(), '2.5', 'Decimal curve values can be typed character by character');
    equal(await total('physicalDamage'), '75', 'Typed decimal curve is applied');
    await page.locator('#curve-max').fill('3');
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No page overflow at ${width}px`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('details.rules > summary').click();
    check(await page.locator('[data-total="physicalDamage"]').evaluate(node => node.getBoundingClientRect().right <= innerWidth), 'Mobile total is visible without horizontal scrolling');
    check(await page.locator('#detail-physicalDamage').evaluate(node => node.scrollWidth <= innerWidth), 'Mobile calculation fits the viewport');
    await page.screenshot({ path: resolve(output, 'mobile.png'), fullPage: true });
    equal(errors.length, 0, `No browser errors: ${errors.join('; ')}`);
    equal(network.length, 0, 'Standalone page makes no external requests');
    await writeFile(resolve(output, 'verification.json'), JSON.stringify({ checks, errors, network }, null, 2));
    console.log(`Browser and model: ${checks} checks passed. Screenshots: ${output}`);
  } finally {
    await browser.close();
  }
}
