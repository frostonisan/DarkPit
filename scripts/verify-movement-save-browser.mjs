import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
const root = resolve('docs'), output = resolve(process.env.MOVEMENT_SAVE_OUTPUT || 'outputs/movement-save');
const baseline = process.env.MOVEMENT_SAVE_BASELINE && resolve(process.env.MOVEMENT_SAVE_BASELINE);
let variant = 'current';
await fs.mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = resolve(root, '.' + (path === '/' ? '/index.html' : path));
  if (!file.startsWith(root + sep)) return res.writeHead(403).end();
  try {
    let data = await fs.readFile(variant === 'baseline' && path.startsWith('/js/') ? resolve(baseline, '.' + path) : file);
    if (path === '/js/combat/loop.js') {
      // Exercise the real turn-start block, stopping before asynchronous combat.
      const boundary = "const speed = Math.max(1, Number(getSafe(attacker, 'speed', 1000)) || 1000);";
      assert.ok(data.toString().includes(boundary));
      data = data.toString().replace(boundary, 'return false;\n    ' + boundary)
        + '\nwindow.movementSaveTestTurnStart = runEntityTurn;\n';
    }
    if (path === '/js/storage/entityStorage.js') data = data.toString().replace(
      'export function saveEntityMovementState(entite) {',
      'export function saveEntityMovementState(entite) { if (window.movementSaveProbe) movementSaveProbe.calls++;');
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
      '.svg': 'image/svg+xml', '.gif': 'image/gif', '.png': 'image/png', '.jpg': 'image/jpeg' })[extname(file)] || 'application/octet-stream');
    res.end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
let browser;
const report = [];
try {
  browser = await chromium.launch({ channel: process.env.VERIFY_BROWSER || 'chrome', headless: true });
  for (const side of ['A', 'B']) {
    const results = {};
    for (variant of baseline ? ['baseline', 'current'] : ['current']) {
      const context = await browser.newContext(), page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      await page.locator('#game-container').waitFor({ state: 'attached' });
      results[variant] = await page.evaluate(async side => {
        const E = await import('/js/entities/runtime.js'), S = await import('/js/storage/gameStorage.js');
        const Store = await import('/js/storage/entityStorage.js');
        await import('/js/combat/loop.js'); // Installs the test-only entry point in the served module.
        const Stocks = await import('/js/items/resourceStocks.js'), Clock = await import('/js/combat/clock.js');
        const template = (await import('/js/data/entityTemplates.js')).entitesNest.find(e => e.serial === 900013);
        const actor = E.enrichEntityStats({ ...structuredClone(template), id: 987700, name: 'Save test', side,
          type: 'sbire', role: 'gueux', level: 1, awakening: 1, stuff: {}, stats: {}, modifierStats: {},
          baseStats: { HP: 100, strength: 1, intelligence: 1, agility: 1, speed: 60000, trailer: 0 } });
        actor.isDEAD = false; actor.statut = ['alive']; actor.turnCount = 0;
        actor.stats.shift = { current: 3, max: 3, baseDefault: true };
        actor.resourceStocks = { shift: { temporary: 0, spell: 0, stuff: {} } };
        E.entites.length = 0; E.entites.push(actor); window.currentStageId = 'save-test';
        S.saveToLocalStorage('selectedArmyA', side === 'A' ? [actor] : []);
        S.saveToLocalStorage('ArmyB', { armies: { 'ArmyB_save-test': { entities: side === 'B' ? [actor] : [] } } });
        for (const key of ['equippedItems', 'PlayerSave', 'IngameItemsData']) S.saveToLocalStorage(key, key === 'equippedItems' ? [] : { equippedItems: [] });
        window.movementSaveProbe = { calls: 0 };
        const snapshots = [];
        const stored = () => side === 'A' ? S.loadFromLocalStorage('selectedArmyA')[0] : S.loadFromLocalStorage('ArmyB').armies['ArmyB_save-test'].entities[0];
        const run = async (name, resume = false) => {
          movementSaveProbe.calls = 0;
          await window.movementSaveTestTurnStart(actor, { resume, canContinue: () => true });
          const saved = stored();
          snapshots.push({ name, calls: movementSaveProbe.calls, shift: structuredClone(actor.stats.shift),
            storedShift: saved.stats.shift, resources: saved.resourceStocks, turnCount: actor.turnCount,
            equipment: S.loadFromLocalStorage('equippedItems'), hp: saved.stats.HP, liveHp: structuredClone(actor.stats.HP) });
        };
        Math.random = () => .99;
        await run('first-full'); await run('unchanged-full');
        actor.stats.shift.current = 1; Store.saveEntityMovementState(actor);
        await run('refill-to-two'); await run('refill-to-three'); await run('full-again');
        actor.stats.shift.current = '3'; actor.stats.shift.max = '3';
        await run('normalize-numbers');
        actor.stats.shift = { current: 0, max: 0 }; Store.saveEntityMovementState(actor);
        await run('disabled-reserve');
        actor.stats.shift = { current: -2, max: 3 }; Store.saveEntityMovementState(actor);
        await run('movement-debt');
        actor.stuff = { 1: ['save-test-item'] };
        actor.resourceStocks.shift.stuff['save-test-item'] = { current: 2, max: 2, multiplier: 1, activePercent: 0,
          reserve: { current: 2, preciseCurrent: 2, max: 2 } };
        const equipped = [{ equippedId: 'save-test-item', resourceStocks: {} }];
        S.saveToLocalStorage('equippedItems', equipped);
        S.saveToLocalStorage('PlayerSave', { equippedItems: equipped });
        S.saveToLocalStorage('IngameItemsData', { equippedItems: equipped });
        actor.stats.shift.current = 4;
        Stocks.spendMovementCharges(actor, 1); Store.saveEntityMovementState(actor);
        await run('equipment-spent-then-full');
        await run('resume', true);
        actor.baseStats.hpBattleRegen = 20;
        actor.stats.HP.current = 1;
        Store.saveEntityHPToStorage(actor, 1);
        await run('unchanged-full-healing');
        actor.turnCount = 0;
        await run('first-after-reload');
        Clock.clearCombatClock();
        return snapshots;
      }, side);
      assert.deepEqual(errors, []); await context.close();
    }
    const actual = results.current;
    for (const name of ['first-full', 'refill-to-two', 'refill-to-three', 'normalize-numbers', 'movement-debt', 'first-after-reload']) {
      assert.equal(actual.find(r => r.name === name).calls, 1, name + ': real change or initial synchronization must save');
    }
    for (const name of ['unchanged-full', 'full-again', 'disabled-reserve', 'equipment-spent-then-full', 'resume', 'unchanged-full-healing']) {
      assert.equal(actual.find(r => r.name === name).calls, 0, name + ': no redundant turn-start save');
    }
    if (baseline) assert.deepEqual(actual.map(({ calls, ...r }) => r), results.baseline.map(({ calls, ...r }) => r), 'Changed movement or saved state');
    const equipment = actual.find(r => r.name === 'equipment-spent-then-full');
    assert.equal(equipment.equipment[0].resourceStocks.shift.current, 1);
    const healing = actual.find(r => r.name === 'unchanged-full-healing');
    assert.ok(healing.hp.current > 1, 'HP regeneration must still execute when the movement reserve is unchanged');
    assert.equal(healing.hp.current, healing.liveHp.current, 'Healing must be persisted immediately');
    report.push({ side, results }); console.log('PASS', side, 'refills, normalization, debt, equipment, resume, healing, first-turn synchronization and persisted parity');
  }
  await fs.writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
} finally { await browser?.close(); await new Promise(done => server.close(done)); }
