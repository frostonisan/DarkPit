import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright';

const root = resolve('docs'), baseline = process.env.PROGRESSION_BASELINE;
const output = resolve(process.env.PROGRESSION_OUTPUT || 'outputs/attack-progression-tests');
const reference = JSON.parse(await fs.readFile('scripts/fixtures/combat-reference.json', 'utf8'));
const release = JSON.parse(await fs.readFile('package.json', 'utf8'));
const version = release.gameVersion || release.version;
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
    assert.equal(await page.locator('#game-version').textContent(), `The Dark Pit v${version}`);
    assert.ok(await page.locator('#game-version').isVisible(), 'Release label is visible in the game');
    if (variant === 'current') await page.screenshot({ path: resolve(output, 'version.png') });
    report[variant] = await page.evaluate(async ({ reference, optimized }) => {
      const E = await import('/js/storage/entityStorage.js'), S = await import('/js/storage/gameStorage.js');
      const { gameStorage: storage } = await import('/js/storage/sessionStorage.js');
      const UI = await import('/js/ui/statistics/components.js');
      const mastery = await import('/js/combat/attackResolution.js');
      const runtime = await import('/js/entities/runtime.js');
      const check = (value, message) => { if (!value) throw Error(message); };
      const clone = globalThis.structuredClone, populations = [];
      for (const total of [10, 40, 80]) {
        const A = clone(reference.armyA.slice(0, total - 9)), B = clone(reference.armyB);
        const actors = [...A, ...B];
        window.selectedArmyA = clone(A);
        S.saveToLocalStorage('selectedArmyA', A);
        S.saveToLocalStorage('ArmyB', { armies: { desert: { entities: B } } });
        for (const actor of actors) E.saveEntityAttackProgression(actor);
        let clones = 0, clonedCharacters = 0, writes = 0, measuringSave = false;
        let wholeEntitySerializations = 0, parsedCharacters = 0;
        const stringify = JSON.stringify, parse = JSON.parse;
        JSON.stringify = function (value, ...options) {
          if (measuringSave && value?.id != null && value?.stats) wholeEntitySerializations++;
          return stringify(value, ...options);
        };
        JSON.parse = function (text, ...options) {
          if (measuringSave) parsedCharacters += text.length;
          return parse(text, ...options);
        };
        globalThis.structuredClone = function (value, ...options) {
          clones++; clonedCharacters += JSON.stringify(value).length;
          return clone(value, ...options);
        };
        try {
          for (let repeat = 0; repeat < 3; repeat++) for (const actor of actors) {
            actor.attackDetails[0].mastery.points++;
            measuringSave = true;
            try { E.saveEntityAttackProgression(actor); } finally { measuringSave = false; }
            const army = actor.side === 'A' ? S.loadFromLocalStorage('selectedArmyA')
              : S.loadFromLocalStorage('ArmyB').armies.desert.entities;
            check(army.find(e => String(e.id) === String(actor.id)).attackDetails[0].mastery.points
              === actor.attackDetails[0].mastery.points, 'Every repeated gain is saved synchronously');
            writes++;
          }
        } finally { globalThis.structuredClone = clone; JSON.stringify = stringify; JSON.parse = parse; }
        if (optimized) {
          const fields = ['attackDetails', 'attacks', 'attackEssenceInventory', 'nativeAttacks', 'attackSelection'];
          check(clones === 3 * (actors.reduce((sum, actor) => sum + fields.filter(key => actor[key] !== undefined).length, 0)
            + A.length), 'Prepared progression copies are never cloned twice for their first recipient');
          check(wholeEntitySerializations === 0, 'Warm progression never serializes complete entities');
        }
        const saved = [storage.getItem('selectedArmyA'), storage.getItem('ArmyB')];
        const before = A[0].attackDetails[0].mastery.points;
        window.selectedArmyA[0].attackDetails[0].mastery.points += 10000;
        check(A[0].attackDetails[0].mastery.points === before, 'Visible copy cannot mutate the combat entity');
        check(S.loadCombatArmyForUpdate('selectedArmyA')[0].attackDetails[0].mastery.points === before,
          'Visible copy cannot mutate the private storage snapshot');
        check(storage.getItem('selectedArmyA') === saved[0], 'Unsaved mutations do not leak into storage');
        populations.push({ total, clones, clonedCharacters, writes, wholeEntitySerializations, parsedCharacters, saved });
      }
      // No persistent destination: the first prepared copy belongs to the first
      // visible recipient, and subsequent recipients must remain independent.
      storage.removeItem('selectedArmyA'); storage.removeItem('ArmyB');
      const shared = { nested: { value: 1 } };
      const source = { id: 991991, attackDetails: shared, attacks: shared };
      const first = { id: '991991' }, second = { id: 991991 };
      window.selectedArmyA = [source, first, second];
      E.saveEntityAttackProgression(source);
      first.attackDetails.nested.value = 2;
      check(first.attacks.nested.value === 1 && second.attackDetails.nested.value === 1
        && source.attackDetails.nested.value === 1, 'Fields and all destinations keep their original isolation');

      const owner = clone(reference.armyA[0]), other = clone(reference.armyA[1]);
      owner.isDEAD = false; owner.stats.HP.current = owner.stats.HP.max || 1000;
      owner.attackDetails[0].mastery.points = 99;
      owner.attackDetails[0].mastery.level = 1;
      runtime.entites.length = 0; runtime.entites.push(owner, other);
      window.selectedArmyA = [owner, other];
      S.saveToLocalStorage('selectedArmyA', [owner, other]);
      S.setAdminMode(true);
      UI.initializePowerViews();
      const nodes = [UI.createEntityPowerValue(owner), UI.createAttackPowerValue(owner.attackDetails[0], owner),
        UI.createEntityPowerValue(other), UI.createArmyPowerSummary(() => [owner, other])];
      nodes[3].open = true;
      document.body.append(...nodes);
      await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
      const counts = nodes.map(() => 0), methods = nodes.map(n => n._refreshPower);
      nodes.forEach((node, i) => { node._refreshPower = (...args) => { counts[i]++; return methods[i](...args); }; });
      let queued = 0;
      const raf = globalThis.requestAnimationFrame;
      globalThis.requestAnimationFrame = function (...args) { queued++; return raf.apply(this, args); };
      try { mastery.awardAttackMastery(owner, owner.attackDetails[0], { launch: true }); }
      finally { globalThis.requestAnimationFrame = raf; }
      check(owner.attackDetails[0].mastery.points === 100 && owner.attackDetails[0].mastery.level === 2,
        'Actual level-up and reward happen immediately');
      check(counts[0] === 1 && counts[1] === 1 && counts[3] === 1, 'Owner, attack and aggregate refresh immediately');
      if (optimized) check(counts[2] === 0 && queued === 0, 'No unrelated owner refresh or extra global RAF');
      const displayed = nodes.map(n => n.textContent);
      nodes.forEach((node, i) => { node._refreshPower = methods[i]; });
      UI.refreshDisplayedPowers();
      check(JSON.stringify(displayed) === JSON.stringify(nodes.map(n => n.textContent)),
        'Targeted refresh displays exactly the full-refresh values');
      nodes.forEach(n => n.remove());
      await new Promise(done => raf(() => raf(done)));
      let emptyQueued = 0;
      globalThis.requestAnimationFrame = function (...args) { emptyQueued++; return raf.apply(this, args); };
      try { mastery.awardAttackMastery(owner, owner.attackDetails[0], { impact: true }); }
      finally { globalThis.requestAnimationFrame = raf; }
      if (optimized) check(emptyQueued === 0, 'No power RAF when all views are closed');
      check(S.loadFromLocalStorage('selectedArmyA')[0].attackDetails[0].mastery.points === 101,
        'Closing displays never suppresses progression or its save');
      return { populations, displayed, counts, queued, emptyQueued };
    }, { reference, optimized: variant === 'current' });
    assert.deepEqual(errors, []);
    await context.close();
    console.log('PASS', variant, '10/40/80 immediate progression, independent copies, real level-up and power displays');
  }
  if (baseline) {
    assert.deepEqual(report.current.displayed, report.baseline.displayed, 'Visible values changed');
    for (const row of report.current.populations) {
      const old = report.baseline.populations.find(r => r.total === row.total);
      assert.deepEqual(row.saved, old.saved, 'Persisted bytes changed');
      assert.ok(row.clones <= old.clones && row.clonedCharacters <= old.clonedCharacters, 'No additional progression copies');
      assert.ok(row.wholeEntitySerializations < old.wholeEntitySerializations, 'Complete-entity serialization removed');
      assert.ok(row.parsedCharacters < old.parsedCharacters, 'Only changed fields are parsed');
    }
  }
  for (const data of Object.values(report)) for (const row of data.populations) {
    row.savedHashes = row.saved.map(raw => createHash('sha256').update(raw).digest('hex'));
    delete row.saved;
  }
  await fs.writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
} finally { await browser?.close(); await new Promise(done => server.close(done)); }
