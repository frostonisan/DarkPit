const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../docs/index-11.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(script);
const context = vm.createContext({ Intl });
vm.runInContext(script.split('// DOM bindings:')[0] + '\nglobalThis.api = { UMBRAS, DEFAULTS, resolveProfile, resolveAttack, natureName, signatureFor, stackProjection, dischargeProjection, bounded, calculateImpact, piercingMultiplier, damageMultiplier, getNatureEffects };', context);
const { api } = context;
function input(colors, extras = {}) {
  return { slots: colors.map(color => ({ color, active: true })), range: 'melee', attackFunction: 'offense',
    sources: Object.fromEntries(api.UMBRAS.map(entry => [entry.id, { learned: true }])), ...extras };
}
const entry = (model, id) => model.access.find(value => value.id === id);

test('each of the seven compositions has the expected exclusive signature', () => {
  for (const [colors, signature] of [
    [['red'], 'none'], [['blue'], 'none'], [['yellow'], 'none'],
    [['red', 'blue'], 'none'], [['red', 'yellow'], 'rupture'],
    [['blue', 'yellow'], 'dissolution'], [['red', 'blue', 'yellow'], 'discharge']
  ]) assert.equal(api.resolveAttack(input(colors)).signature, signature);
});

test('every composition up to ten sockets obeys learned tier rules', () => {
  for (let red = 0; red <= 10; red++) for (let blue = 0; blue <= 10 - red; blue++) for (let yellow = 0; yellow <= 10 - red - blue; yellow++) {
    const counts = { red, blue, yellow };
    const model = api.resolveAttack(input(Object.keys(counts).flatMap(color => Array(counts[color]).fill(color))));
    const pure = Object.values(counts).filter(Boolean).length === 1;
    for (const effect of model.access) assert.equal(effect.available, counts[effect.color] > 0 && (pure || counts[effect.color] >= effect.tier), `${red}/${blue}/${yellow} ${effect.id}`);
  }
});

test('one pure essence permits all learned tiers of its branch, not other branches', () => {
  for (const color of ['red', 'blue', 'yellow']) {
    const model = api.resolveAttack(input([color]));
    assert.equal(model.access.filter(effect => effect.available).length, 3);
    assert.ok(model.access.filter(effect => effect.available).every(effect => effect.color === color));
  }
});

test('red + yellow does not grant critical or ambidextry; two/three yellow unlock them', () => {
  for (let count = 1; count <= 3; count++) {
    const model = api.resolveAttack(input(['red', ...Array(count).fill('yellow')]));
    assert.equal(entry(model, 'critical').available, count >= 2);
    assert.equal(entry(model, 'ambidextry').available, count >= 3);
  }
});

test('essences never grant unowned umbras', () => {
  const model = api.resolveAttack(input(['yellow'], { sources: {} }));
  assert.ok(model.access.every(effect => !effect.available));
});

test('equipment on pure magical grants its contribution without granting the learned branch', () => {
  const state = input(['blue']);
  state.sources.critical.equipment = true;
  const model = api.resolveAttack(state);
  assert.equal(entry(model, 'critical').learned, false);
  assert.equal(entry(model, 'critical').equipment, true);
  assert.equal(entry(model, 'critical').available, true);
  assert.equal(entry(model, 'ambidextry').available, false);
  assert.equal(entry(model, 'finesse').available, false);
});

test('direct bonuses bypass the learned essence requirement without fabricating ownership', () => {
  const state = input(['blue'], { sources: { critical: { direct: true }, ambidextry: { direct: true } } });
  const model = api.resolveAttack(state);
  for (const id of ['critical', 'ambidextry']) {
    assert.equal(entry(model, id).available, true);
    assert.equal(entry(model, id).learned, false);
    assert.equal(entry(model, id).equipment, false);
  }
});

test('compatible learned, equipment and autonomous sources are retained separately', () => {
  const state = input(['yellow']);
  state.sources.critical = { learned: true, equipment: true, direct: true };
  const result = entry(api.resolveAttack(state), 'critical');
  assert.equal(result.learned, true);
  assert.equal(result.equipment, true);
  assert.equal(result.direct, true);
  assert.equal(result.directLabel, 'Chance critique');
});

test('no essence has no offensive bonus even with external sources', () => {
  const state = input([]);
  for (const source of Object.values(state.sources)) Object.assign(source, { equipment: true, direct: true });
  const model = api.resolveAttack(state);
  assert.ok(model.access.every(effect => !effect.available));
  assert.equal(model.signature, 'none');
});

test('pure strengthening caps at 15 points and disappears for mixtures', () => {
  for (let count = 1; count <= 10; count++) {
    const model = api.resolveAttack(input(Array(count).fill('red')));
    assert.equal(model.profile.bonus, Math.min(15, (count - 1) * 3));
  }
  assert.equal(api.resolveAttack(input(['red', 'red', 'blue'])).profile.bonus, 0);
});

test('disabled, empty and invalid sockets do not contribute; ten is the hard limit', () => {
  const profile = api.resolveProfile([{ color: 'red', active: false }, { color: '', active: true }, { color: 'invalid', active: true }, ...Array(10).fill({ color: 'blue', active: true })]);
  assert.equal(profile.total, 7);
  assert.equal(profile.blue, 7);
  assert.equal(profile.pure, 'blue');
});

test('support and summons cannot trigger offensive signatures', () => {
  for (const attackFunction of ['support', 'summon']) for (const colors of [['red', 'yellow'], ['blue', 'yellow'], ['red', 'blue', 'yellow']]) {
    assert.equal(api.resolveAttack(input(colors, { attackFunction })).signature, 'none');
  }
});

test('range does not block compatible blood fury, crit or ambidextry', () => {
  const red = api.resolveAttack(input(['red'], { range: 'range' }));
  assert.equal(entry(red, 'bloodFury').available, true);
  const yellow = api.resolveAttack(input(['yellow'], { range: 'range' }));
  assert.equal(entry(yellow, 'critical').available, true);
  assert.equal(entry(yellow, 'ambidextry').available, true);
});

test('the page contains only the current logic and no inactive comparison renderer', () => {
  assert.doesNotMatch(html, /index-10|\bV10\b|legacyAccess|comparisonRow|oldHypercognition/);
  assert.match(html, /model\.access\.filter\(entry => entry\.available\)/);
});

test('projections are bounded and preserve the configured values', () => {
  const config = { cap: 5, amount: 7, duration: 8 };
  const snapshot = JSON.stringify(config);
  assert.equal(api.stackProjection(config, 99).reduction, 35);
  assert.equal(api.stackProjection(config, -3).reduction, 0);
  assert.equal(api.stackProjection(config, 2).reduction, 14);
  assert.equal(JSON.stringify(config), snapshot);
  assert.equal(api.dischargeProjection({ maxHP: 10000, percent: 1.5 }), 150);
  assert.equal(api.bounded('', 8, .1, 120), 8);
  assert.equal(api.bounded('Infinity', 8, .1, 120), 8);
  assert.equal(api.bounded(-4, 8, .1, 120), .1);
  assert.equal(api.bounded(5.8, 5, 1, 100, true), 5);
});

test('resolving one attack does not mutate entity sources or slots', () => {
  const state = input(['red', 'blue', 'yellow']);
  const before = JSON.stringify(state);
  api.resolveAttack(state);
  assert.equal(JSON.stringify(state), before);
});

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const impact = (colors, values = {}, config = api.DEFAULTS) => api.calculateImpact(api.resolveAttack(input(colors)), values, config);
const traits = (colors, extra = {}) => api.getNatureEffects(api.resolveAttack(input(colors, extra))).map(effect => effect.id);

test('piercing reaches the agreed -60% and x2 anchors', () => {
  close(impact(['yellow'], { physicalResistance: 0, magicalResistance: 200 }).total, 40);
  close(impact(['yellow'], { physicalResistance: 500, magicalResistance: 0 }).total, 200);
  close(impact(['yellow'], { physicalResistance: 50, magicalResistance: 50 }).total, 100);
  close(impact(['yellow'], { physicalResistance: 500, magicalResistance: 500 }).total, 100);
});

test('piercing is continuous, monotonic and bounded on both sides', () => {
  let previous = 0;
  for (let delta = -10000; delta <= 10000; delta += 10) {
    const value = api.piercingMultiplier(Math.max(0, delta), Math.max(0, -delta));
    assert.ok(value >= previous && value > .1 && value < 2.2);
    previous = value;
  }
  close(api.piercingMultiplier(1e-10, 0), 1);
  close(api.piercingMultiplier(0, 1e-10), 1);
});

test('power, attack ratio and essence weight each apply exactly once', () => {
  close(impact(['yellow'], { powers: { yellow: 100 }, ratio: .6 }).raw, 60);
  const split = impact(['red', 'red', 'blue'], { powers: { red: 200, blue: 50 }, ratio: .6 });
  close(split.raw, 90);
  close(split.components[0].raw, 80);
  close(split.components[1].raw, 10);
  close(split.total, 90);
});

test('physical and magical use the existing constant 70, not the piercing curve', () => {
  close(impact(['red'], { physicalResistance: 70, magicalResistance: 900 }).total, 50);
  close(impact(['blue'], { magicalResistance: 70, physicalResistance: 900 }).total, 50);
  close(impact(['red'], { physicalResistance: 100 }).total, 100 * 70 / 170);
});

test('mixed components receive their own defensive treatment then sum', () => {
  const result = impact(['red', 'yellow'], { physicalResistance: 100, magicalResistance: 20 });
  close(result.total, 50 * 70 / 170 + 50 * (1 + 1.2 * 80 / 180));
  assert.equal(result.components.length, 2);
});

test('penetration applies before the piercing differential for both resistances', () => {
  const values = { physicalResistance: 100, magicalResistance: 20 };
  const base = impact(['yellow'], values);
  const physicalPen = impact(['yellow'], { ...values, physicalPen: 50 });
  const magicalPen = impact(['yellow'], { ...values, magicalPen: 100 });
  close(physicalPen.physical, 50);
  close(physicalPen.delta, 30);
  assert.ok(physicalPen.total < base.total);
  assert.ok(magicalPen.total > base.total);
  close(impact(['red'], { physicalResistance: 100, physicalPen: 100 }).total, 100);
});

test('Rupture benefits physical damage but weakens piercing for the same target', () => {
  const values = { physicalResistance: 100, magicalResistance: 20 };
  const base = impact(['red', 'yellow'], values);
  const weakened = impact(['red', 'yellow'], { ...values, ruptureStacks: 5 });
  close(weakened.physical, 75);
  assert.ok(weakened.components[0].damage > base.components[0].damage);
  assert.ok(weakened.components[1].damage < base.components[1].damage);
});

test('Dissolution benefits both magical and piercing components', () => {
  const values = { physicalResistance: 50, magicalResistance: 100 };
  const base = impact(['blue', 'yellow'], values);
  const weakened = impact(['blue', 'yellow'], { ...values, dissolutionStacks: 5 });
  assert.ok(weakened.components.every((component, index) => component.damage > base.components[index].damage));
});

test('target debuffs are shared and cannot lower effective resistance below zero', () => {
  const result = impact(['yellow'], { physicalResistance: 10, magicalResistance: -50, ruptureStacks: 999, physicalPen: 50 });
  close(result.physical, 0);
  close(result.magical, 0);
  close(result.rupture.count, 5);
  close(result.total, 100);
});

test('the triggering hit does not automatically gain its own new stack', () => {
  const result = impact(['red', 'yellow'], { physicalResistance: 100 });
  assert.equal(result.rupture.count, 0);
  close(result.physical, 100);
});

test('armor absorbs raw damage before resistance for ordinary attacks', () => {
  const result = impact(['red'], { physicalResistance: 70, armor: 40 });
  close(result.absorbed, 40);
  close(result.armorAfter, 0);
  close(result.total, 30);
  const fullyBlocked = impact(['red'], { armor: 200 });
  close(fullyBlocked.total, 0);
  close(fullyBlocked.armorAfter, 100);
});

test('pure piercing ignores armor but still undergoes its defensive differential', () => {
  const result = impact(['yellow'], { armor: 1000, physicalResistance: 0, magicalResistance: 200 });
  close(result.absorbed, 0);
  close(result.armorAfter, 1000);
  close(result.total, 40);
  assert.equal(result.components[0].bypass, true);
});

test('mixed piercing is blockable and armor is distributed proportionally', () => {
  const result = impact(['red', 'yellow'], { armor: 50 });
  assert.ok(result.components.every(component => !component.bypass));
  close(result.components[0].afterArmor, 25);
  close(result.components[1].afterArmor, 25);
  close(result.total, 50);
});

test('prismatic discharge is one separate typed component, not a recursive proc or pure attack', () => {
  for (const dischargeNature of ['red', 'blue', 'yellow']) {
    const result = impact(['red', 'blue', 'yellow'], { dischargeNature });
    assert.equal(result.components.length, 4);
    const proc = result.components.find(component => component.secondary);
    assert.equal(proc.color, dischargeNature);
    close(proc.raw, 150);
    assert.equal(proc.bypass, false);
    close(result.total, 250);
  }
  close(impact(['red', 'blue', 'yellow'], { dischargeNature: 'yellow', armor: 1000 }).total, 0);
});

test('discharge uses target max HP then the selected nature defensive formula', () => {
  const values = { powers: { red: 0, blue: 0, yellow: 0 }, physicalResistance: 70, magicalResistance: 0 };
  close(impact(['red', 'blue', 'yellow'], { ...values, dischargeNature: 'red' }).total, 75);
  close(impact(['red', 'blue', 'yellow'], { ...values, dischargeNature: 'blue' }).total, 150);
  close(impact(['red', 'blue', 'yellow'], { ...values, dischargeNature: 'yellow' }).total, 150 * api.piercingMultiplier(70, 0));
});

test('nonoffensive attacks and empty compositions have no simulated offensive damage', () => {
  for (const attackFunction of ['support', 'summon']) {
    const model = api.resolveAttack(input(['red', 'blue', 'yellow'], { attackFunction }));
    assert.equal(api.calculateImpact(model, {}).applicable, false);
  }
  assert.equal(impact([]).total, 0);
});

test('invalid inputs and zero damage remain finite and nonnegative', () => {
  for (const values of [{ powers: { red: 0 }, armor: 0 }, { powers: { red: -50 }, ratio: -5 }, { powers: { red: NaN }, physicalResistance: Infinity, armor: NaN }]) {
    const result = impact(['red'], values);
    assert.ok(Number.isFinite(result.total) && result.total >= 0);
  }
});

test('nature traits distinguish perforation, dodge immunity and projectile transport', () => {
  assert.ok(traits(['yellow']).includes('perforation'));
  assert.ok(traits(['yellow']).includes('transpiercing'));
  assert.ok(!traits(['blue']).includes('perforation'));
  assert.ok(traits(['blue']).includes('undodgeable'));
  assert.ok(traits(['blue']).includes('broken-spell'));
  assert.ok(!traits(['blue'], { attackFunction: 'support' }).includes('broken-spell'));
  assert.ok(!traits(['red', 'yellow']).includes('perforation'));
  assert.ok(traits(['red'], { range: 'range' }).includes('physical-flight'));
  assert.ok(traits(['blue'], { range: 'range' }).includes('magic-flight'));
  assert.ok(traits(['red', 'blue'], { range: 'range' }).includes('hybrid-flight'));
  assert.ok(traits(['red', 'blue', 'yellow'], { range: 'range' }).includes('prismatic-flight'));
  assert.equal(traits([]).length, 0);
});

test('ranged blood fury retains lifesteal without melee-only effects', () => {
  const active = traits(['red'], { range: 'range' });
  assert.ok(active.includes('lifesteal'));
  assert.ok(!active.includes('blood-melee'));
  assert.ok(traits(['red']).includes('blood-melee'));
});

test('simulation is repeatable and never changes model, target inputs or settings', () => {
  const model = api.resolveAttack(input(['red', 'blue', 'yellow']));
  const values = { physicalResistance: 100, magicalResistance: 20, armor: 10, ruptureStacks: 2 };
  const config = JSON.parse(JSON.stringify(api.DEFAULTS));
  const before = JSON.stringify([model, values, config]);
  const first = api.calculateImpact(model, values, config);
  const second = api.calculateImpact(model, values, config);
  close(first.total, second.total);
  assert.equal(JSON.stringify([model, values, config]), before);
});

test('range scales only the physical and piercing primary components after armor', () => {
  const model = api.resolveAttack(input(['red', 'blue', 'yellow'], { range: 'range' }));
  const result = api.calculateImpact(model, { rangePercent: 50, dischargeNature: 'red' });
  close(result.components[0].beforeResistance, 100 / 6);
  close(result.components[1].beforeResistance, 100 / 3);
  close(result.components[2].beforeResistance, 100 / 6);
  close(result.components[3].beforeResistance, 150);
  const red = api.resolveAttack(input(['red'], { range: 'range' }));
  close(api.calculateImpact(red, { armor: 40, rangePercent: 50 }).total, 30);
  close(impact(['red'], { rangePercent: 0 }).total, 100);
});
