import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright';

const root = resolve('docs'), baseline = process.env.COMBAT_SAVE_BASELINE;
const output = resolve(process.env.COMBAT_SAVE_OUTPUT || 'outputs/combat-partial-save');
const reference = JSON.parse(await fs.readFile('scripts/fixtures/combat-reference.json', 'utf8'));
let variant = 'current';
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = resolve(root, '.' + (path === '/' ? '/index.html' : path));
  if (!file.startsWith(root + sep)) return res.writeHead(403).end();
  try {
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream');
    res.end(await fs.readFile(variant === 'baseline' && path.startsWith('/js/') ? resolve(baseline, '.' + path) : file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
await fs.mkdir(output, { recursive: true });
let browser;
const report = {};
try {
  browser = await chromium.launch({ channel: process.env.VERIFY_BROWSER || 'chrome', headless: true });
  for (variant of baseline ? ['baseline', 'current'] : ['current']) {
    const context = await browser.newContext(), page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.locator('#game-container').waitFor({ state: 'attached' });
    report[variant] = await page.evaluate(async ({ reference, optimized }) => {
      const E = await import('/js/storage/entityStorage.js'), S = await import('/js/storage/gameStorage.js');
      const { gameStorage: storage } = await import('/js/storage/sessionStorage.js');
      const runtime = await import('/js/entities/runtime.js');
      const check = (value, message) => { if (!value) throw Error(message); };
      const hash = async text => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))]
        .map(v => v.toString(16).padStart(2, '0')).join('');
      const reports = [];
      for (const total of [10, 40, 80]) {
        const A = structuredClone(reference.armyA.slice(0, total - 9)), B = structuredClone(reference.armyB);
        const actors = [...A, ...B], key = 'ArmyB_json-test';
        runtime.entites.length = 0; runtime.entites.push(...actors);
        window.selectedArmyA = structuredClone(A); window.selectedArmyB = structuredClone(B);
        window.currentStageId = 'json-test';
        S.saveToLocalStorage('selectedArmyA', A);
        S.saveToLocalStorage('ArmyB', { armies: { [key]: { entities: B } } });
        for (const actor of actors) { E.saveEntityHPToStorage(actor); E.saveEntityCombatTotals(actor); }
        let active = false, parsedCharacters = 0, wholeEntitySerializations = 0, calls = 0;
        const parse = JSON.parse, stringify = JSON.stringify, writes = [], events = [];
        const set = storage.setItem;
        JSON.parse = function (text, ...options) {
          if (active) parsedCharacters += text.length;
          return parse(text, ...options);
        };
        JSON.stringify = function (value, ...options) {
          if (active && value?.id != null && value?.stats) wholeEntitySerializations++;
          return stringify(value, ...options);
        };
        storage.setItem = function (name, value) {
          if (active && ['selectedArmyA', 'ArmyB'].includes(name)) writes.push([name, String(value).length]);
          return set.call(this, name, value);
        };
        const listener = ({ detail }) => {
          if (active) events.push([detail.entity.id, detail.entity.combatDetails.damageReceived, detail.entity.combatDetails.healingReceived]);
        };
        window.addEventListener('entityCombatStatsChanged', listener);
        const save = fn => { active = true; try { fn(); calls++; } finally { active = false; } };
        const saved = actor => (actor.side === 'A' ? S.loadFromLocalStorage('selectedArmyA')
          : S.loadFromLocalStorage('ArmyB').armies[key].entities).find(e => e.id === actor.id);
        const gains = [];
        try {
          for (const actor of actors) {
            const hp = actor.stats.HP.current, damage = actor.combatDetails?.damageReceived || 0;
            const healing = actor.combatDetails?.healingReceived || 0;
            const points = actor.attackDetails[0].mastery.points;
            for (let hit = 1; hit <= 2; hit++) {
              actor.stats.HP.current--;
              save(() => E.saveEntityHPToStorage(actor));
              check(saved(actor).stats.HP.current === hp - hit, 'Each HP change is stored immediately');
              save(() => E.recordEntityDamageReceived(actor, 1, 0));
              check(saved(actor).combatDetails.damageReceived === damage + hit, 'Identical damage events both count');
            }
            actor.attackDetails[0].mastery.points++;
            save(() => E.saveEntityAttackProgression(actor));
            check(saved(actor).stats.HP.current === hp - 2 && saved(actor).attackDetails[0].mastery.points === points + 1,
              'Progression preserves the preceding damage and HP writes');
            actor.stats.HP.current += 2;
            save(() => E.saveEntityHPToStorage(actor));
            save(() => E.recordEntityHealingReceived(actor, 2));
            const final = saved(actor);
            check(final.stats.HP.current === hp && final.combatDetails.healingReceived === healing + 2
              && final.combatDetails.damageReceived === damage + 2 && final.attackDetails[0].mastery.points === points + 1,
              'Reload preserves damage, progression and healing together');
            gains.push([actor.id, hp, final.combatDetails.damageReceived, final.combatDetails.healingReceived, points + 1]);
          }
        } finally {
          JSON.parse = parse; JSON.stringify = stringify; storage.setItem = set;
          window.removeEventListener('entityCombatStatsChanged', listener);
        }
        if (optimized) check(wholeEntitySerializations === 0, 'No whole-entity serialization after warmup');
        const raw = [storage.getItem('selectedArmyA'), storage.getItem('ArmyB')];
        const storedHP = saved(A[0]).stats.HP.current;
        A[0].stats.HP.current = -999;
        A[0].combatDetails.damageReceived = -999;
        const snapshot = S.loadCombatArmyForUpdate('selectedArmyA')[0];
        check(snapshot.stats.HP.current === storedHP && snapshot.combatDetails.damageReceived >= 0,
          'Unsaved live mutations cannot leak into cached stats or totals');
        reports.push({ total, calls, parsedCharacters, wholeEntitySerializations, writes, events, gains,
          storedHashes: await Promise.all(raw.map(hash)) });
      }
      return reports;
    }, { reference, optimized: variant === 'current' });
    assert.deepEqual(errors, []);
    await context.close();
    console.log('PASS', variant, '10/40/80: repeated damage, immediate HP, progression, healing, reload and independent live data');
  }
  if (baseline) for (const current of report.current) {
    const before = report.baseline.find(r => r.total === current.total);
    const state = ({ parsedCharacters, wholeEntitySerializations, ...rest }) => rest;
    assert.deepEqual(state(current), state(before), 'Writes, event order or final stored bytes changed');
    assert.ok(current.parsedCharacters < before.parsedCharacters);
    assert.ok(current.wholeEntitySerializations < before.wholeEntitySerializations);
  }
  await fs.writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
} finally { await browser?.close(); await new Promise(done => server.close(done)); }
