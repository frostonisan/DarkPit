const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../docs/index-11.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(script);
const context = vm.createContext({ Intl });
vm.runInContext(script.split('// DOM bindings:')[0] + '\nglobalThis.api = { UMBRAS, DEFAULTS, resolveProfile, resolveAttack, natureName, signatureFor, signatureStats, stackProjection, dischargeProjection, bounded, calculateImpact, piercingMultiplier, damageMultiplier, getNatureEffects, resonanceBonus, resonanceProximityLabel, resonanceStatus };', context);
const { api } = context;
function input(colors, extras = {}) {
  return { slots: colors.map(color => ({ color, active: true })), range: 'melee', attackFunction: 'offense',
    sources: Object.fromEntries(api.UMBRAS.map(entry => [entry.id, { learned: true }])), ...extras };
}
const entry = (model, id) => model.access.find(value => value.id === id);

test('each of the seven compositions has the expected exclusive signature', () => {
  for (const [colors, signature] of [
    [['red'], 'none'], [['blue'], 'none'], [['yellow'], 'none'],
    [['red', 'blue'], 'resonance'], [['red', 'yellow'], 'rupture'],
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

test('physical and magical purity strengthen progressively to 15 points at level ten', () => {
  for (const color of ['red', 'blue']) for (let count = 1; count <= 10; count++) {
    const model = api.resolveAttack(input(Array(count).fill(color)));
    close(model.profile.bonus, (count - 1) * 15 / 9);
    if (count < 10) assert.ok(model.profile.bonus < 15);
  }
  assert.equal(api.resolveAttack(input(['red', 'red', 'blue'])).profile.bonus, 0);
  assert.equal(api.resolveAttack(input(Array(10).fill('yellow'))).profile.bonus, 0);
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

test('pure piercing at level ten ignores armor but still undergoes its defensive differential', () => {
  const result = impact(Array(10).fill('yellow'), { armor: 1000, physicalResistance: 0, magicalResistance: 200 });
  close(result.absorbed, 0);
  close(result.armorAfter, 1000);
  close(result.total, 40);
  assert.equal(result.components[0].bypassFraction, 1);
});

test('mixed piercing is blockable and armor is distributed proportionally', () => {
  const result = impact(['red', 'yellow'], { armor: 50 });
  assert.ok(result.components.every(component => component.bypassFraction === 0));
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
    assert.equal(proc.bypassFraction, 0);
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

test('nature traits distinguish perforation and projectile transport without dodge immunity', () => {
  assert.ok(traits(['yellow']).includes('perforation'));
  assert.ok(traits(['yellow']).includes('transpiercing'));
  assert.ok(!traits(['blue']).includes('perforation'));
  assert.ok(!traits(['blue']).includes('undodgeable'));
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

test('all compositions count complete combinations with limits 10, 5 and 3', () => {
  for (let red = 0; red <= 10; red++) for (let blue = 0; blue <= 10 - red; blue++) for (let yellow = 0; yellow <= 10 - red - blue; yellow++) {
    const counts = { red, blue, yellow };
    const colors = Object.keys(counts).flatMap(color => Array(counts[color]).fill(color));
    const model = api.resolveAttack(input(colors));
    const nonzero = Object.values(counts).filter(Boolean);
    assert.equal(model.profile.combinationLevel, nonzero.length ? Math.min(...nonzero) : 0);
    assert.equal(model.profile.maxLevel, nonzero.length ? Math.floor(10 / nonzero.length) : 0);
    assert.equal(model.signatureLevel, model.signature === 'none' ? 0 : Math.min(...nonzero));
    assert.ok(model.profile.combinationLevel <= model.profile.maxLevel);
  }
});

test('extra unmatched essences do not increase signature level or create extra signatures', () => {
  for (const [colors, signature, level] of [
    [['red', 'red', 'yellow', 'yellow'], 'rupture', 2],
    [['red', 'red', 'red', 'yellow'], 'rupture', 1],
    [['blue', 'blue', 'blue', 'yellow', 'yellow'], 'dissolution', 2],
    [['red', 'blue', 'yellow', 'red', 'blue', 'yellow', 'red'], 'discharge', 2]
  ]) {
    const model = api.resolveAttack(input(colors));
    assert.equal(model.signature, signature);
    assert.equal(model.signatureLevel, level);
    assert.equal(model.profile.bonus, 0);
    assert.equal(model.profile.armorBypass, 0);
  }
});

test('debuff levels scale strength only, not stack capacity or duration', () => {
  for (const key of ['rupture', 'dissolution']) for (let level = 1; level <= 5; level++) {
    const stats = api.signatureStats(key, level);
    assert.equal(stats.level, level);
    close(stats.amount, 4 + level);
    assert.equal(stats.cap, 5);
    assert.equal(stats.duration, 8);
    close(api.stackProjection(stats, 5).reduction, (4 + level) * 5);
  }
});

test('signature settings remain configurable and have one scaling path', () => {
  const config = JSON.parse(JSON.stringify(api.DEFAULTS));
  config.rupture = { amount: 8, perLevel: 2, duration: 9, cap: 4 };
  config.discharge = { percent: 2, perLevel: .25, maxHP: 20000 };
  const rupture = api.signatureStats('rupture', 3, config);
  close(rupture.amount, 12);
  close(api.stackProjection(rupture, 10).reduction, 48);
  assert.equal(rupture.duration, 9);
  const result = impact(['red', 'blue', 'yellow', 'red', 'blue', 'yellow'], {}, config);
  close(result.discharge.percent, 2.25);
  close(result.components.at(-1).raw, 450);
  close(result.total, 550);
});

test('prismatic levels add one scaled discharge, never extra discharges or primary power', () => {
  for (let level = 1; level <= 3; level++) {
    const colors = Array.from({ length: level }, () => ['red', 'blue', 'yellow']).flat();
    for (const dischargeNature of ['red', 'blue', 'yellow']) {
      const result = impact(colors, { dischargeNature });
      close(result.discharge.percent, 1.5 + (level - 1) * .5);
      close(result.components.at(-1).raw, 150 + (level - 1) * 50);
      close(result.total, 250 + (level - 1) * 50);
      assert.equal(result.components.filter(component => component.secondary).length, 1);
      assert.equal(result.components.length, 4);
      assert.ok(result.components.every(component => component.bypassFraction === 0));
    }
  }
});

test('target debuff levels remain independent from the attacking combination', () => {
  const values = { physicalResistance: 100, magicalResistance: 100, ruptureStacks: 5, dissolutionStacks: 3, ruptureLevel: 5, dissolutionLevel: 3 };
  const result = impact(['red'], values);
  close(result.physical, 55);
  close(result.magical, 79);
  close(result.total, 100 * 70 / 125);
  const highRupture = impact([...Array(5).fill('red'), ...Array(5).fill('yellow')], { physicalResistance: 100, ruptureStacks: 5 });
  close(highRupture.physical, 75);
});

test('partial perforation bypasses 10 percent per purity level without consuming that armor', () => {
  for (let level = 1; level <= 10; level++) {
    const result = impact(Array(level).fill('yellow'), { armor: 1000, physicalResistance: 50, magicalResistance: 50 });
    close(result.components[0].bypassFraction, level / 10);
    close(result.components[0].bypassedRaw, 10 * level);
    close(result.absorbed, 100 - 10 * level);
    close(result.armorAfter, 900 + 10 * level);
    close(result.total, 10 * level);
  }
});

test('partial perforation and armor conserve raw damage before resistance and distance', () => {
  for (const armor of [0, 20, 60, 1000]) {
    const result = impact(Array(4).fill('yellow'), { armor });
    close(result.total, 100 - Math.min(60, armor));
    close(result.absorbed + result.total, result.raw);
  }
  const model = api.resolveAttack(input(Array(4).fill('yellow'), { range: 'range' }));
  const result = api.calculateImpact(model, { armor: 1000, rangePercent: 50, physicalResistance: 0, magicalResistance: 200 });
  close(result.absorbed, 60);
  close(result.total, 8);
});

test('yellow recovery scales with yellow count and retains the pure bonus', () => {
  for (let level = 1; level <= 10; level++) {
    const model = api.resolveAttack(input(Array(level).fill('yellow')));
    close(model.profile.recoveryBase, 10 + (level - 1) * 5 / 9);
    const effects = api.getNatureEffects(model);
    const perforation = effects.find(effect => effect.id === 'perforation');
    assert.equal(perforation.name.includes('imblocable'), level === 10);
    assert.ok(effects.some(effect => effect.id === 'transpiercing-recovery'));
  }
  for (const color of ['red', 'blue']) for (let yellow = 1; yellow <= 9; yellow++) {
    const model = api.resolveAttack(input([color, ...Array(yellow).fill('yellow')]));
    close(model.profile.recoveryBase, 5 + (yellow - 1) * 5 / 9);
    assert.equal(model.signatureLevel, 1);
    const effect = api.getNatureEffects(model).find(effect => effect.id === 'piercing-recovery');
    assert.match(effect.name, new RegExp(`Récupération perçante ${yellow} ·`));
  }
  const prism = api.resolveAttack(input(['red', 'blue', 'yellow', 'yellow']));
  close(prism.profile.recoveryBase, 5 + 5 / 9);
  assert.equal(prism.signatureLevel, 1);
});

test('all offensive ranged compositions allow dodge separately from launch success', () => {
  const compositions = [['red'], ['blue'], ['yellow'], ['red','blue'], ['red','yellow'], ['blue','yellow'], ['red','blue','yellow']];
  for (const colors of compositions) {
    const effects = api.getNatureEffects(api.resolveAttack(input(colors, {range: 'range'})));
    assert.ok(!effects.some(effect => effect.id === 'undodgeable'));
    const range = effects.find(effect => effect.id === 'range');
    assert.match(range.description, /cible peut esquiver/);
    assert.match(range.description, /Pas de jet de réussite/);
  }
  const heal = api.getNatureEffects(api.resolveAttack(input(['blue'], {range: 'range', attackFunction: 'support'})));
  assert.doesNotMatch(heal.find(effect => effect.id === 'range').description, /esquiver/);
});

test('transpiercing damage scales independently from armor perforation', () => {
  for (let level = 1; level <= 10; level++) {
    const model = api.resolveAttack(input(Array(level).fill('yellow')));
    close(model.profile.transpiercingDamagePercent, 5 + (level - 1) * 25 / 9);
    close(model.profile.armorBypass, level * 10);
    const effects = api.getNatureEffects(model);
    const damage = effects.find(effect => effect.id === 'transpiercing');
    const perforation = effects.find(effect => effect.id === 'perforation');
    assert.match(damage.name, new RegExp(`Transperçant ${level} ·`));
    assert.match(damage.description, /Agilité/);
    assert.match(perforation.name, new RegExp(`Perforation ${level} · ${level * 10} %`));
    assert.match(perforation.description, /contournent l’armure sans la consommer/);
    close(api.calculateImpact(model, {}).raw, 100);
  }
  for (const colors of [[], ['red'], ['red','yellow'], ['blue','yellow'], ['red','blue','yellow']]) {
    const model = api.resolveAttack(input(colors));
    assert.equal(model.profile.transpiercingDamagePercent, 0);
    assert.equal(model.profile.armorBypass, 0);
    assert.ok(!api.getNatureEffects(model).some(effect => ['transpiercing','perforation'].includes(effect.id)));
  }
});

test('all purity-scaled nature bonuses display their actual level from one to ten', () => {
  const effectsByColor = {
    red: [['fracassante', 'Fracassante']],
    blue: [['psionique', 'Psionique'], ['broken-spell', 'Surcharge magique']],
    yellow: [['transpiercing', 'Transperçant'], ['perforation', 'Perforation'], ['transpiercing-recovery', 'Récupération perçante']]
  };
  for (const [color, names] of Object.entries(effectsByColor)) for (let level = 1; level <= 10; level++) {
    const model = api.resolveAttack(input(Array(level).fill(color)));
    const effects = api.getNatureEffects(model);
    for (const [id, name] of names) {
      assert.match(effects.find(effect => effect.id === id).name, new RegExp(`^${name} ${level}(?: ·|$)`));
    }
  }
});

test('transpiercing adds floored agility damage after the attack ratio before defenses', () => {
  const pure = api.resolveAttack(input(Array(10).fill('yellow')));
  const result = api.calculateImpact(pure, {powers: {yellow: 200}, agility: 100});
  close(result.agilityBonus, 30);
  close(result.raw, 230);
  close(result.total, 230);
  close(api.calculateImpact(pure, {powers: {yellow: 400}, ratio: .5, agility: 100}).raw, 230);
  close(api.calculateImpact(pure, {powers: {yellow: 200}, agility: 101}).agilityBonus, 30);
  for (let level = 1; level <= 10; level++) for (let agility = 0; agility <= 120; agility++) {
    const model = api.resolveAttack(input(Array(level).fill('yellow')));
    const actual = api.calculateImpact(model, {agility});
    const expected = Number(BigInt(agility) * BigInt(45 + (level - 1) * 25) / 900n);
    assert.equal(actual.agilityBonus, expected);
    close(actual.raw, 100 + expected);
    assert.equal(actual.components.length, 1);
  }
  const protectedTarget = api.calculateImpact(pure, {powers: {yellow: 200}, agility: 100, armor: 1000, physicalResistance: 0, magicalResistance: 200});
  close(protectedTarget.absorbed, 0);
  close(protectedTarget.total, 92);
  const partial = impact(['yellow'], {agility: 100, armor: 1000});
  close(partial.agilityBonus, 5);
  close(partial.raw, 105);
  close(partial.total, 10.5);
  for (const colors of [['red','yellow'], ['blue','yellow'], ['red','blue','yellow']]) {
    assert.equal(impact(colors, {agility: 100}).agilityBonus, 0);
  }
  for (const agility of [-100, NaN, Infinity, '', 1e-100]) {
    assert.equal(api.calculateImpact(pure, {agility}).agilityBonus, 0);
  }
});

test('magical overload risk reduction is relative, linear and exclusive to blue purity', () => {
  for (let level = 1; level <= 10; level++) {
    const model = api.resolveAttack(input(Array(level).fill('blue')));
    close(model.profile.surchargeReductionPercent, (level - 1) * 50 / 9);
    const effect = api.getNatureEffects(model).find(effect => effect.id === 'broken-spell');
    assert.match(effect.name, new RegExp(`Surcharge magique ${level}`));
    assert.match(effect.description, /ne réduit pas les dégâts du retour/);
  }
  const reduction = api.resolveAttack(input(Array(10).fill('blue'))).profile.surchargeReductionPercent;
  close(30 * (1 - reduction / 100), 15);
  for (const colors of [[], ['red'], ['yellow'], ['blue','yellow'], ['red','blue'], ['red','blue','yellow']]) {
    const model = api.resolveAttack(input(colors));
    assert.equal(model.profile.surchargeReductionPercent, 0);
    assert.ok(!api.getNatureEffects(model).some(effect => effect.id === 'broken-spell'));
  }
});

test('disabling a yellow essence removes its recovery level without retaining pure bonuses', () => {
  const state = input(['red', 'yellow', 'yellow']);
  state.slots[2].active = false;
  const model = api.resolveAttack(state);
  assert.equal(model.profile.yellow, 1);
  assert.equal(model.profile.recoveryBase, 5);
  assert.equal(model.profile.transpiercingDamagePercent, 0);
  assert.equal(model.profile.armorBypass, 0);
});

test('signature levels are bounded and disabled colors cannot preserve a stale signature', () => {
  assert.equal(api.signatureStats('rupture', 999).level, 5);
  assert.equal(api.signatureStats('discharge', 999).level, 3);
  assert.equal(api.signatureStats('discharge', -5).level, 1);
  const state = input(['red', 'blue', 'yellow', 'red', 'blue', 'yellow']);
  state.slots.filter(slot => slot.color === 'red').forEach(slot => { slot.active = false; });
  const model = api.resolveAttack(state);
  assert.equal(model.signature, 'dissolution');
  assert.equal(model.signatureLevel, 2);
  assert.equal(api.calculateImpact(model, {}).discharge, null);
});

test('bonuses precede the simulator and help, with individual sockets collapsed', () => {
  assert.ok(html.indexOf('id="nature-section"') < html.indexOf('id="simulator"'));
  assert.ok(html.indexOf('id="access-section"') < html.indexOf('id="simulator"'));
  assert.ok(html.indexOf('id="simulator"') < html.indexOf('id="aides"'));
  assert.match(html, /<details><summary>Chasses individuelles<\/summary>/);
  assert.doesNotMatch(html, /<details open/);
});

test('individual sockets and damage shares remain in the top composition area', () => {
  const sockets = html.indexOf('id="essence-slots"');
  const results = html.indexOf('<section class="results"');
  const shares = html.indexOf('id="shares"');
  assert.ok(sockets > html.indexOf('id="composition-counts"') && sockets < results);
  assert.ok(shares > results && shares < html.indexOf('id="signature"'));
  assert.equal(html.match(/id="essence-slots"/g).length, 1);
  assert.equal(html.match(/id="shares"/g).length, 1);
});

const hybrid = level => api.resolveAttack(input([...Array(level).fill('red'), ...Array(level).fill('blue')]));
const resonance = (physical, magical, level = 1) => api.resonanceBonus(hybrid(level), { powers: { red: physical, blue: magical } });

test('resonance has an inclusive thirty percent threshold, never a rounded threshold', () => {
  const below = resonance(100, 29.999999999);
  assert.equal(below.eligible, false);
  assert.equal(below.bonus, 0);
  assert.equal(api.resonanceProximityLabel(below), '< 30 %');
  const at = resonance(100, 30);
  assert.equal(at.eligible, true);
  close(at.percent, 5);
  close(at.reference, 65);
  assert.equal(at.bonus, 3);
  assert.ok(resonance(100, 30.001).percent > 5);
});

test('resonance scales normal caps from thirty to forty and perfect caps from forty to fifty', () => {
  for (let level = 1; level <= 5; level++) {
    const cap = 30 + (level - 1) * 2.5;
    const normal = resonance(100, 99.999999, level);
    assert.equal(normal.perfect, false);
    assert.ok(normal.percent < cap && normal.percent > cap - .00001);
    const perfect = resonance(100, 100, level);
    assert.equal(perfect.perfect, true);
    close(perfect.percent, cap + 10);
    assert.equal(perfect.bonus, Math.floor(cap + 10));
    close(resonance(100, 30, level).percent, 5);
  }
});

test('resonance interpolation is symmetric, monotonic and excludes premature perfection', () => {
  for (let level = 1; level <= 5; level++) {
    let previous = 0;
    for (let pm = 1; pm <= 100; pm++) {
      const result = resonance(100, pm, level);
      const opposite = resonance(pm, 100, level);
      close(result.percent, opposite.percent);
      assert.equal(result.bonus, opposite.bonus);
      assert.ok(result.percent >= previous);
      previous = result.percent;
    }
  }
  close(resonance(100, 50).percent, 5 + 25 * 20 / 70);
  close(resonance(100, 70, 5).percent, 25);
  const almost = resonance(100.00000000000001, 100);
  assert.equal(almost.perfect, false);
  close(almost.percent, 30);
  assert.equal(api.resonanceProximityLabel(almost), '< 100 %');
});

test('zero or negative powers never grant resonance and small bonuses can floor to zero', () => {
  for (const [physical, magical] of [[0, 0], [100, 0], [0, 100], [-10, 10], [-2, -2]]) {
    const result = resonance(physical, magical);
    assert.equal(result.eligible, false);
    assert.equal(result.perfect, false);
    assert.equal(result.bonus, 0);
    assert.ok(Number.isFinite(result.percent));
  }
  const tiny = resonance(1, 1);
  assert.equal(tiny.perfect, true);
  assert.equal(tiny.bonus, 0);
  assert.match(api.resonanceStatus(tiny), /gain nul/);
});

test('resonance belongs only to offensive red-blue compositions, not prism or support', () => {
  for (const colors of [[], ['red'], ['blue'], ['yellow'], ['red','yellow'], ['blue','yellow'], ['red','blue','yellow']]) {
    assert.equal(api.resonanceBonus(api.resolveAttack(input(colors)), {}).bonus, 0);
  }
  for (const attackFunction of ['support','summon']) {
    const model = api.resolveAttack(input(['red','blue'], {attackFunction}));
    assert.equal(model.signature, 'none');
    assert.equal(api.resonanceBonus(model, {}).applicable, false);
    assert.equal(api.calculateImpact(model, {}).applicable, false);
  }
});

test('unmatched essences keep their damage shares without granting extra resonance levels', () => {
  const model = api.resolveAttack(input([...Array(9).fill('red'), 'blue']));
  const result = api.calculateImpact(model, { powers: {red: 100, blue: 100} });
  assert.equal(result.resonance.level, 1);
  assert.equal(result.resonance.perfect, true);
  assert.equal(result.resonance.bonus, 40);
  close(result.components[0].raw, 126);
  close(result.components[1].raw, 14);
  close(result.total, 140);
});

test('hybrid bonus is based on existing weighted power and then split once', () => {
  const model = api.resolveAttack(input(['red','red','red','blue']));
  const result = api.calculateImpact(model, { powers: {red: 100, blue: 50}, ratio: 2 });
  close(result.resonance.reference, 87.5);
  assert.equal(result.resonance.bonus, 10);
  close(result.components[0].resonancePower, 7.5);
  close(result.components[1].resonancePower, 2.5);
  close(result.raw, 195);
  assert.equal(result.components.length, 2);
  assert.ok(result.components.every(component => !component.secondary));
});

test('resonance floors the added power once, not its rate, each component or final damage', () => {
  const result = api.calculateImpact(hybrid(1), {powers: {red: 103, blue: 103}, ratio: .6});
  close(result.resonance.unroundedBonus, 41.2);
  assert.equal(result.resonance.bonus, 41);
  close(result.components[0].resonancePower, 20.5);
  close(result.components[1].resonancePower, 20.5);
  close(result.raw, 86.4);
  close(result.total, 86.4);
  assert.equal(resonance(12.499999999, 12.499999999).bonus, 4);
  assert.equal(resonance(12.5, 12.5).bonus, 5);
  assert.equal(resonance(15, 45, 5).bonus, 2);
  assert.equal(resonance(36, 104, 4).bonus, 5);
});

test('decimal flooring matches exact rational arithmetic across integer power pairs', () => {
  const models = [1,2,3,4,5].map(level => hybrid(level));
  for (let pp = 1; pp <= 120; pp++) for (let pm = 1; pm <= 120; pm++) for (let level = 1; level <= 5; level++) {
    const min = BigInt(Math.min(pp, pm));
    const max = BigInt(Math.max(pp, pm));
    const sum = BigInt(pp + pm);
    const capTwice = BigInt(60 + 5 * (level - 1));
    const expected = 10n * min < 3n * max ? 0 : pp === pm
      ? Number(sum * (capTwice + 20n) / 400n)
      : Number(sum * (70n * max + (capTwice - 10n) * (10n * min - 3n * max)) / (2800n * max));
    const actual = api.resonanceBonus(models[level - 1], {powers: {red: pp, blue: pm}});
    assert.equal(actual.bonus, expected, `PP ${pp} PM ${pm} L${level}`);
  }
});

test('resonance floor is safe for scientific notation and extreme permitted powers', () => {
  assert.equal(resonance(1e-300, 1e-300, 5).bonus, 0);
  assert.equal(resonance(1e-300, 1, 5).bonus, 0);
  assert.equal(resonance(1e9, 1e9, 5).bonus, 5e8);
  assert.equal(resonance(1e-7, 1e-7).perfect, true);
});

test('resonance precedes armor, distance and per-nature resistance without extra procs', () => {
  const model = hybrid(1);
  model.range = 'range';
  const result = api.calculateImpact(model, { armor:40, rangePercent:50, physicalResistance:70, magicalResistance:0 });
  assert.equal(result.resonance.bonus, 40);
  close(result.absorbed, 40);
  close(result.components[0].afterArmor, 50);
  close(result.components[1].afterArmor, 50);
  close(result.components[0].damage, 12.5);
  close(result.components[1].damage, 50);
  close(result.total, 62.5);
});

test('repeated resonance simulation neither compounds its bonus nor mutates powers', () => {
  const model = hybrid(5);
  const values = {powers: {red: 100, blue: 100}};
  const before = JSON.stringify([model, values]);
  for(let index=0; index<5; index++) {
    const result = api.calculateImpact(model, values);
    assert.equal(result.resonance.bonus, 50);
    close(result.total, 150);
  }
  assert.equal(JSON.stringify([model, values]), before);
});
