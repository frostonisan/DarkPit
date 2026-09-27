const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../docs/index-11.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(script);
const context = vm.createContext({ Intl });
vm.runInContext(script.split('// DOM bindings:')[0] + '\nglobalThis.api = { UMBRAS, DEFAULTS, resolveProfile, resolveAttack, natureName, signatureFor, stackProjection, dischargeProjection, bounded };', context);
const { api } = context;
function input(colors, extras = {}) {
  return { slots: colors.map(color => ({ color, active: true })), range: 'melee', attackFunction: 'offense', oldHypercognition: true,
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

test('legacy comparator preserves actual v10 conditions, without invented absent rules', () => {
  const model = api.resolveAttack(input(['red', 'yellow']));
  assert.equal(entry(model, 'brutality').legacy, true);
  assert.equal(entry(model, 'brutality').available, false);
  assert.equal(entry(model, 'ambidextry').legacy, true);
  assert.equal(entry(model, 'ambidextry').available, false);
  assert.equal(entry(model, 'vigueur').legacy, null);
  assert.equal(entry(model, 'hypercognition').legacy, true);
  assert.equal(entry(api.resolveAttack(input(['red'], { oldHypercognition: false })), 'hypercognition').legacy, false);
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
