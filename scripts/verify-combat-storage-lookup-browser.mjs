import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright';
const root = resolve('docs'), baseline = process.env.STORAGE_LOOKUP_BASELINE && resolve(process.env.STORAGE_LOOKUP_BASELINE);
const output = resolve(process.env.STORAGE_LOOKUP_OUTPUT || 'outputs/combat-storage-lookup');
const reference = JSON.parse(await fs.readFile('scripts/fixtures/combat-reference.json', 'utf8'));
let variant = 'current', browser;
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = resolve(root, '.' + (path === '/' ? '/index.html' : path));
  if (!file.startsWith(root + sep)) return res.writeHead(403).end();
  try {
    const data = await fs.readFile(variant === 'baseline' && path.startsWith('/js/') ? resolve(baseline, '.' + path) : file);
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
      '.svg': 'image/svg+xml', '.gif': 'image/gif', '.png': 'image/png', '.jpg': 'image/jpeg' })[extname(file)] || 'application/octet-stream');
    res.end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
await fs.mkdir(output, { recursive: true });
const report = {};
try {
  browser = await chromium.launch({ headless: true, channel: process.env.VERIFY_BROWSER || 'chrome' });
  for (variant of baseline ? ['baseline', 'current'] : ['current']) {
    const context = await browser.newContext(), page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.locator('#game-container').waitFor({ state: 'attached' });
    report[variant] = await page.evaluate(async reference => {
      const S = await import('/js/storage/gameStorage.js'), E = await import('/js/storage/entityStorage.js');
      const Session = await import('/js/storage/sessionStorage.js'), Runtime = await import('/js/entities/runtime.js');
      const A = structuredClone(reference.armyA.slice(0, 31)), B = structuredClone(reference.armyB);
      const a = A[0], b = B[0], outsider = { ...structuredClone(a), id: 999991 };
      Runtime.entites.length = 0; Runtime.entites.push(...A, ...B);
      window.selectedArmyA = A; window.selectedArmyB = B; window.currentStageId = 'lookup-test';
      const armyB = units => ({ armies: { test: { entities: units } } });
      S.saveToLocalStorage('selectedArmyA', A); S.saveToLocalStorage('ArmyB', armyB(B));
      const originalA = localStorage.getItem('selectedArmyA'), originalB = localStorage.getItem('ArmyB');
      const raw = () => [Session.gameStorage.getItem('selectedArmyA'), Session.gameStorage.getItem('ArmyB')];
      const hash = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(v => v.toString(16).padStart(2, '0')).join('');
      const parse = JSON.parse, stringify = JSON.stringify, set = Storage.prototype.setItem, writes = [], events = [], snapshots = [];
      let active = false, counts, work, failWrite = false;
      JSON.parse = function (...args) {
        if (active && typeof args[0] === 'string') work.parseChars += args[0].length;
        if (active) for (const key of ['selectedArmyA', 'ArmyB']) if (args[0] === Session.gameStorage.getItem(key)) counts[key]++;
        return parse.apply(this, args);
      };
      JSON.stringify = function (...args) {
        if (active && (Array.isArray(args[0]) && args[0][0]?.id != null || args[0]?.armies)) work.wholeArmySerializations++;
        if (active && args[0]?.id != null && args[0]?.stats) work.wholeEntitySerializations++;
        return stringify.apply(this, args);
      };
      Storage.prototype.setItem = function (key, value) {
        if (active && ['selectedArmyA', 'ArmyB'].includes(String(key))) writes.push({ key: String(key), value: String(value) });
        if (active && failWrite) { failWrite = false; throw new DOMException('Test quota failure', 'QuotaExceededError'); }
        return set.call(this, key, value);
      };
      const listener = ({ detail }) => { if (active) events.push({ id: detail.entity.id, totalDamage: detail.entity.totalDamage || 0, damageReceived: detail.entity.combatDetails?.damageReceived || 0 }); };
      window.addEventListener('entityCombatStatsChanged', listener);
      const run = async (name, fn) => {
        counts = { selectedArmyA: 0, ArmyB: 0 }; work = { parseChars: 0, wholeArmySerializations: 0, wholeEntitySerializations: 0 }; active = true;
        let error = null;
        try { fn(); } catch (e) { error = e.name; }
        finally { active = false; }
        const values = raw();
        const stateHash = await hash(JSON.stringify(values));
        snapshots.push({ name, counts, work, error, stateHash, writes: writes.length, events: structuredClone(events),
          persistentHash: await hash(JSON.stringify([localStorage.getItem('selectedArmyA'), localStorage.getItem('ArmyB')])),
          received: b.combatDetails?.damageReceived || 0 });
      };
      const progress = entity => { entity.attackDetails[0].mastery.points++; E.saveEntityAttackProgression(entity); };
      await run('ally-progress-cold', () => progress(a));
      await run('ally-progress-repeat', () => progress(a));
      await run('enemy-damage-cold', () => E.recordEntityDamageReceived(b, 3, 0));
      await run('enemy-damage-repeat', () => E.recordEntityDamageReceived(b, 3, 0));
      await run('ally-progress-after-enemy-write', () => progress(a));
      await run('ally-progress-burst', () => { for (let i = 0; i < 8; i++) progress(a); });
      await run('ally-totals-between-progression', () => E.recordEntityDamageReceived(a, 2, 0));
      await run('ally-progression-after-totals', () => progress(a));
      await run('ally-hp-between-progression', () => { a.stats.HP.current--; E.saveEntityHPToStorage(a); });
      await run('ally-progression-after-hp', () => progress(a));
      failWrite = true;
      await run('progression-quota-error', () => progress(a));
      await run('progression-quota-recovery', () => progress(a));
      await run('missing-entity-cold', () => E.saveEntityCombatTotals(outsider));
      await run('missing-entity-repeat', () => E.saveEntityCombatTotals(outsider));
      // A previously absent ID appears through a direct write, without game events.
      localStorage.setItem('selectedArmyA', JSON.stringify([...parse(localStorage.getItem('selectedArmyA')), structuredClone(b)]));
      await run('external-insert-and-duplicate-id', () => progress(b));
      const modified = parse(localStorage.getItem('selectedArmyA'));
      modified.find(e => e.id === a.id).stats.HP.current = 7;
      localStorage.setItem('selectedArmyA', JSON.stringify(modified));
      await run('external-existing-record-edit', () => E.recordEntityDamageReceived(a, 2, 0));
      const hpAfter = parse(localStorage.getItem('selectedArmyA')).find(e => e.id === a.id).stats.HP.current;
      localStorage.setItem('selectedArmyA', originalA);
      localStorage.setItem('ArmyB', JSON.stringify({ armies: { first: { entities: [structuredClone(a)] }, second: { entities: [structuredClone(a)] } } }));
      await run('multiple-enemy-armies', () => progress(a));
      localStorage.setItem('ArmyB', originalB);
      await run('missing-after-replacement', () => E.saveEntityCombatTotals(outsider));
      localStorage.removeItem('selectedArmyA');
      await run('removed-key', () => progress(b));
      localStorage.setItem('selectedArmyA', originalA);
      await run('restored-key', () => progress(a));
      localStorage.setItem('selectedArmyA', 'null');
      await run('null-army-preserves-error', () => E.saveEntityCombatTotals(a));
      localStorage.setItem('selectedArmyA', '{invalid');
      await run('invalid-json-preserves-error', () => E.saveEntityCombatTotals(a));
      localStorage.setItem('selectedArmyA', originalA);
      await run('repaired-json', () => progress(a));
      Session.beginAdminSession();
      Session.gameStorage.setItem('selectedArmyA', JSON.stringify([structuredClone(outsider)]));
      await run('admin-insert', () => progress(outsider));
      await run('admin-absent-ally', () => E.saveEntityCombatTotals(a));
      Session.endAdminSession();
      await run('persistent-return', () => progress(a));
      Session.restoreAdminSession([['selectedArmyA', JSON.stringify([structuredClone(outsider)])], ['ArmyB', originalB]]);
      await run('restored-admin-session', () => progress(outsider));
      Session.endAdminSession();
      await run('persistent-return-again', () => E.saveEntityCombatTotals(a));
      // String/numeric IDs retain String(id) matching, and live objects never alias stored copies.
      const stringActor = { ...structuredClone(a), id: String(a.id) };
      await run('string-id', () => progress(stringActor));
      localStorage.setItem('ArmyB', JSON.stringify({ armies: { 'ArmyB_lookup-test': { entities: [structuredClone(b)] } } }));
      await run('hp-ally-cold', () => { a.stats.HP.current = 8; E.saveEntityHPToStorage(a); });
      await run('hp-ally-warm', () => { a.stats.HP.current = 7; E.saveEntityHPToStorage(a); });
      await run('hp-enemy-cold', () => { b.stats.HP.current = 6; E.saveEntityHPToStorage(b); });
      await run('hp-enemy-warm', () => { b.stats.HP.current = 5; E.saveEntityHPToStorage(b); });
      const special = parse(originalA);
      special[0].metadata = { token: '~combat-entity~0~', escaped: '\\u007ecombat-entity~1~', quotes: '\\"雪',
        battleBoosts: { power: [{ value: 2 }, { value: 9, attackNatureTemporary: true }] } };
      special[1].battleBoosts = { power: [{ value: 3 }, { value: 7, attackNatureTemporary: true }] };
      localStorage.setItem('selectedArmyA', stringify(special).replace('~combat-entity~0~', '\\u007ecombat-entity~0~'));
      await run('tokens-metadata-and-temporary-boosts', () => E.saveEntityCombatTotals(a));
      a.attackSelection = { removed: undefined, nan: NaN, infinity: Infinity, negativeZero: -0, final: 'preserved' };
      await run('json-normalization', () => E.saveEntityAttackProgression(a));
      a.attackSelection.removed = 'reinserted';
      await run('json-property-order-after-normalization', () => E.saveEntityAttackProgression(a));
      const independent = S.loadFromLocalStorage('selectedArmyA');
      independent[0].metadata.token = 'must not leak into the combat cache';
      await run('general-loader-isolation', () => E.saveEntityHPToStorage(a));
      failWrite = true;
      await run('quota-error', () => { a.stats.HP.current = 4; E.saveEntityHPToStorage(a); });
      await run('quota-recovery', () => E.saveEntityHPToStorage(a));
      a.attackSelection = {}; a.attackSelection.circular = a.attackSelection;
      await run('cyclic-error', () => E.saveEntityAttackProgression(a));
      a.attackSelection = { repaired: true };
      await run('cyclic-recovery', () => E.saveEntityAttackProgression(a));
      const duplicate = parse(originalA); duplicate.splice(1, 0, structuredClone(duplicate[0]));
      localStorage.setItem('selectedArmyA', stringify(duplicate));
      await run('duplicate-id-within-army', () => E.saveEntityAttackProgression(a));
      await run('duplicate-id-within-army-warm', () => E.saveEntityAttackProgression(a));
      const storedBeforeMutation = raw();
      stringActor.attackDetails[0].mastery.points += 100;
      const noAliasing = JSON.stringify(storedBeforeMutation) === JSON.stringify(raw());
      JSON.parse = parse; JSON.stringify = stringify; Storage.prototype.setItem = set; window.removeEventListener('entityCombatStatsChanged', listener);
      return { snapshots, hpAfter, noAliasing, writes: await Promise.all(writes.map(async ({ key, value }) => ({ key, hash: await hash(value) }))) };
    }, reference);
    assert.deepEqual(errors, []); await context.close();
    assert.equal(report[variant].hpAfter, 7, 'An external HP edit must survive a totals update');
    assert.ok(report[variant].noAliasing);
    for (const row of report[variant].snapshots) assert.equal(row.error,
      ['null-army-preserves-error', 'cyclic-error'].includes(row.name) ? 'TypeError'
        : row.name === 'invalid-json-preserves-error' ? 'SyntaxError' : row.name.endsWith('quota-error') ? 'QuotaExceededError' : null, row.name);
    console.log('PASS', variant, 'immediate writes, repeated damage/progression, external edits, IDs, corrupt data and admin isolation');
  }
  const rows = report.current.snapshots;
  assert.equal(rows.find(r => r.name === 'ally-progress-repeat').counts.ArmyB, 0);
  assert.equal(rows.find(r => r.name === 'enemy-damage-repeat').counts.selectedArmyA, 0);
  assert.deepEqual(rows.find(r => r.name === 'missing-entity-repeat').counts, { selectedArmyA: 0, ArmyB: 0 });
  assert.equal(rows.find(r => r.name === 'ally-progress-burst').counts.ArmyB, 0);
  assert.equal(rows.find(r => r.name === 'enemy-damage-repeat').received - rows.find(r => r.name === 'enemy-damage-cold').received, 3);
  for (const name of ['ally-progress-repeat', 'ally-progress-burst', 'hp-ally-warm', 'hp-enemy-warm']) {
    assert.equal(rows.find(r => r.name === name).work.wholeArmySerializations, 0, name + ': no full-army serialization after warmup');
    assert.deepEqual(rows.find(r => r.name === name).counts, { selectedArmyA: 0, ArmyB: 0 }, name + ': no full-army parse after warmup');
  }
  if (baseline) {
    const states = result => ({ ...result, snapshots: result.snapshots.map(({ counts, work, ...state }) => state) });
    assert.deepEqual(states(report.current), states(report.baseline), 'Persistent bytes, write order, events or gameplay changed');
    for (const name of ['ally-progress-repeat', 'ally-progress-burst']) {
      const before = report.baseline.snapshots.find(r => r.name === name);
      const after = report.current.snapshots.find(r => r.name === name);
      assert.equal(after.work.wholeEntitySerializations, 0, 'Warm progression serializes only declared fields');
      assert.ok(after.work.parseChars <= before.work.parseChars, 'Warm progression never parses more characters');
    }
    for (const name of ['enemy-damage-repeat', 'ally-totals-between-progression', 'hp-ally-warm', 'hp-enemy-warm']) {
      const before = report.baseline.snapshots.find(r => r.name === name);
      const after = report.current.snapshots.find(r => r.name === name);
      assert.equal(after.work.wholeEntitySerializations, 0, name + ': only changed fields are serialized');
      assert.ok(after.work.parseChars < before.work.parseChars, name + ': fewer characters are parsed');
    }
  }
  await fs.writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log('PASS', rows.length, 'scenarios; skipped parsing only for unchanged missing IDs; baseline parity:', !!baseline);
} finally { await browser?.close(); await new Promise(done => server.close(done)); }
