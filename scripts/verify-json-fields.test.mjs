import test from 'node:test';
import assert from 'node:assert/strict';
import { splitJSONFields, serializeChangedJSONFields } from '../docs/js/storage/jsonFields.js';

const replacer = (key, value) => key === 'battleBoosts' && value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).map(([stat, boosts]) => [stat,
    Array.isArray(boosts) ? boosts.filter(b => !b?.attackNatureTemporary) : boosts])) : value;
const recordOf = source => {
  const text = JSON.stringify(source, replacer);
  return { text, entity: JSON.parse(text) };
};
function checkUpdate(record, changes, removed = []) {
  for (const [key, value] of Object.entries(changes)) Object.defineProperty(record.entity, key,
    { value, enumerable: true, configurable: true, writable: true });
  for (const key of removed) delete record.entity[key];
  const fields = [...new Set([...Object.keys(changes), ...removed])];
  const expected = JSON.stringify(record.entity, replacer);
  const result = serializeChangedJSONFields(record, fields, replacer);
  assert.ok(result);
  assert.equal(result.text, expected);
  assert.deepEqual(result.normalized, JSON.parse(expected));
  assert.equal(JSON.stringify(result.normalized), expected);
  return { text: result.text, entity: result.normalized, fields: result.fields };
}

test('JSON field boundaries preserve escaped keys, quotes, nesting and primitives', () => {
  const value = Object.fromEntries(['', '1', '00', '9', 'quotes"\\', '\n\t', '雪', '\ud800', '__proto__']
    .map((key, i) => [key, [i, { nested: '},["\\\n雪\ud800', empty: {}, list: [] }, null, true]]));
  const text = JSON.stringify(value), fields = splitJSONFields(text);
  assert.deepEqual([...fields.keys()], Object.keys(value));
  assert.equal('{' + [...fields.values()].join(',') + '}', text);
  assert.equal(splitJSONFields('[]'), null);
  assert.equal(splitJSONFields('null'), null);
  assert.deepEqual([...splitJSONFields('{}')], []);
});

test('changed fields retain exact JSON normalization, omission and property order', () => {
  let record = recordOf({ id: 1, untouched: { array: [1, 'x'] }, attackDetails: [], attackSelection: {} });
  record = checkUpdate(record, { attackSelection: { missing: undefined, nan: NaN, inf: Infinity,
    negativeZero: -0, array: [undefined, NaN], date: new Date('2026-11-23T00:00:00Z') } });
  record = checkUpdate(record, { attackDetails: undefined, '2': 'integer key', extra: 1 });
  record = checkUpdate(record, { attackDetails: [1], attackSelection: undefined });
  record = checkUpdate(record, Object.fromEntries([['__proto__', { valid: true }], ['quote"', '\\']]), ['extra']);
  record = checkUpdate(record, { attackSelection: { reinserted: true }, battleBoosts: {
    power: [{ value: 1 }, { value: 2, attackNatureTemporary: true }] } });
  record = checkUpdate(record, { attackSelection: { battleBoosts: {
    nested: [{ value: 3 }, { value: 4, attackNatureTemporary: true }] } } });
  assert.equal(record.entity.untouched.array[1], 'x');
  assert.equal(Object.getPrototypeOf(record.entity), Object.prototype);
});

test('partial normalization never keeps live references; full records invalidate the field index', () => {
  const selection = { nested: { value: 7 } };
  let record = checkUpdate(recordOf({ id: 1, stats: { HP: 5 }, attackSelection: {} }), { attackSelection: selection });
  selection.nested.value = 100;
  assert.equal(record.entity.attackSelection.nested.value, 7);
  record.entity.stats.HP = 3;
  record = recordOf(record.entity); // ordinary writer / external-storage replacement
  record = checkUpdate(record, { attackSelection: { nested: { value: 8 } } });
  assert.equal(record.entity.stats.HP, 3);
});

test('cycles and BigInt preserve serialization errors without mutating cached fragments', () => {
  const record = checkUpdate(recordOf({ id: 1, attackSelection: {} }), { attackSelection: { n: 1 } });
  const fragments = [...record.fields];
  const cyclic = {}; cyclic.self = cyclic;
  for (const bad of [cyclic, { n: 1n }]) {
    record.entity.attackSelection = bad;
    assert.throws(() => serializeChangedJSONFields(record, ['attackSelection'], replacer), TypeError);
    assert.deepEqual([...record.fields], fragments);
  }
  assert.equal(serializeChangedJSONFields({ entity: 1, text: '1' }, [], replacer), null);
  assert.equal(serializeChangedJSONFields({ entity: { toJSON() { return 3; } }, text: '{}' }, [], replacer), null);
});

test('500 deterministic mutations match native full serialization byte for byte', () => {
  let state = 231126;
  const random = max => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state % max; };
  const keys = ['id', 'stats', 'attackDetails', 'attackSelection', '', '3', '00', 'a"\\', '雪', '__proto__'];
  const scalar = () => [null, true, false, random(100), '},[]"\\\n', '雪\ud800', undefined, NaN][random(8)];
  let record = recordOf({ id: 1, stats: { HP: 10 }, attackDetails: [], attackSelection: {} });
  for (let i = 0; i < 500; i++) {
    const key = keys[random(keys.length)], operation = random(4);
    const value = operation === 0 ? scalar() : operation === 1 ? [scalar(), { x: scalar() }]
      : { x: scalar(), nested: { y: scalar(), list: [scalar()] } };
    record = checkUpdate(record, operation === 3 ? {} : Object.fromEntries([[key, value]]), operation === 3 ? [key] : []);
    if (i % 11 === 0) record = recordOf(record.entity);
  }
});
