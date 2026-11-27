import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('docs'), output = resolve('outputs/admin-codex-controls');
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  const file = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  const rel = relative(root, file);
  if (rel === '..' || rel.startsWith('..' + sep)) return res.writeHead(403).end();
  try {
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1536, height: 960 } });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  assert.equal(await page.locator('#admin-stop-combat').count(), 0);
  await page.evaluate(async () => {
    const S = await import("/js/storage/gameStorage.js");
    const E = await import("/js/entities/runtime.js");
    const A = await import("/js/debug/admin.js");
    const UI = await import("/js/ui/application.js"), _UI = await import("/js/ui/codex/index.js");
    const N = await import("/js/app/worldMap.js");
    S.setAdminMode(true);
    window.levelRunning = 'worldmap';
    A.initializeAdminLevel(E.entitesNestUp);
    if (document.getElementById('admin-stop-combat')) throw Error('Admin mode outside the Admin level must not expose Stop');
    const template = (await import("/js/data/entityTemplates.js")).entitesNest.find(row => row.serial === 900013);
    const actor = E.enrichEntityStats({ ...structuredClone(template), id: 991810, name: 'Saved army', side: 'A', level: 1,
      attacks: ['shot-p-r'], stats: {}, baseStats: { HP: 1000, shift: 10, speed: 10000, armor: 10 }, stuff: {}, resourceStocks: {} });
    S.saveToLocalStorage('selectedArmyA', [actor]); window.selectedArmyA = [actor];
    E.entites.splice(0, E.entites.length, actor);
    UI.createGameContainer(); UI.GameUi(); UI.initializeArmyConfig(); _UI.PlayerArmyCodex();
    N.rebuildWorldMapLevelButtons(); S.setCurrentLevel(UI.getOrCreateWorldMapID());
  });
  await page.evaluate(() => document.querySelectorAll('.entitylootContainer, #black-overlay').forEach(node => node.remove()));
  await page.locator('.level-button.admin').first().click();
  await page.locator('.loading-h2.loaded').waitFor({ timeout: 45000 });
  await page.locator('.loading-h2.loaded').click();
  await page.waitForFunction(() => !document.querySelector('.loading-screen') && document.getElementById('startButton'));
  assert.equal(await page.locator('#admin-stop-combat').count(), 0, 'Stop is absent before launching');
  await page.evaluate(async () => {
    const S = await import("/js/storage/gameStorage.js");
    const E = await import("/js/entities/runtime.js");
    const G = await import("/js/app/state.js");
    const C = await import("/js/rendering/entities.js");
    document.querySelectorAll('#hexGrid .entite-box').forEach(node => node.remove());
    document.querySelectorAll('#hexGrid .hex').forEach(hex => hex.classList.remove('occupied'));
    E.entites.length = 0;
    const template = (await import("/js/data/entityTemplates.js")).entitesNest.find(row => row.serial === 900013);
    for (const [index, side] of ['A', 'B'].entries()) {
      const hex = document.querySelector(`#hexGrid .hex.Side${side}`);
      const actor = E.enrichEntityStats({ ...structuredClone(template), id: 991810 + index,
        name: `Stop combat ${side}`, side, role: 'gueux', type: 'sbire', position: hex.dataset.position, level: 1, awakening: 1,
        attacks: ['shot-p-r'], stuff: {}, stats: {}, modifierStats: {}, resourceStocks: {},
        baseStats: { HP: 1000, physicalDamage: 10, speed: 10000, shift: 10 } });
      actor.stats.speed = 10000; actor.statut = ['alive']; actor.isDEAD = false;
      E.entites.push(actor);
      const created = C.createEntiteInDOM(actor); hex.appendChild(created.element); await created.spriteReady;
    }
    S.saveToLocalStorage('selectedArmyA', [E.entites[0]]);
    S.saveToLocalStorage('ArmyB', { armies: { test: { entities: [E.entites[1]] } } });
    (await import('/js/board/controller.js')).rebuildBoardOccupancy();
    (await import("/js/combat/loop.js")).initFightEntites();
    G.manageBattleActions({ mode: G.BATTLE_ACTION_MODE.START });
    window.__stops = 0; window.__resolutions = 0;
    window.addEventListener('battleStopped', () => window.__stops++);
    window.addEventListener('battleResolved', () => window.__resolutions++);
  });
  await page.locator('#Box_Entite_991810').dispatchEvent('click', { detail: 1 });
  await page.waitForFunction(() => window.__adminActiveLiveEntityId === '991810');
  await page.getByRole('button', { name: 'Fermer', exact: true }).click();
  await page.evaluate(async () => {
    const E = await import("/js/entities/runtime.js");
    const UI = await import("/js/ui/codex/index.js");
    const S = await import("/js/storage/gameStorage.js");
    window.__mastery = structuredClone(E.entites[0].attackDetails[0].mastery);
    window.__otherAttack = JSON.stringify(E.entites[1].attackDetails);
    window.__universal = JSON.stringify(S.loadFromLocalStorage('essenceInventory', {}));
    window.__openCodex = id => {
      let menu = document.querySelector('.Game-UI .menu-map-container');
      if (!menu) { menu = document.createElement('div'); menu.className = 'menu-map-container'; document.querySelector('.Game-UI').append(menu); }
      menu.querySelectorAll('.codex-entity-scan').forEach(node => node.remove());
      const actor = E.entites.find(e => e.id === id);
      const codex = UI.createCodexEntityScan(actor, menu, `codex-entity_${id}`);
      codex.querySelector('.codex-attacks').parentElement.click();
    };
    window.__openCodex(991810);
  });
  const surface = page.locator('#codex-entity_991810 .section-content.attaques');
  const field = key => surface.locator(`[data-admin-attack-field="${key}"]`);
  const edit = async (key, value) => {
    await field(key).fill(String(value));
    await field(key).press('Tab');
    await page.waitForFunction(({ key, value }) => {
      const actor = window.selectedArmyA.find(e => e.id === 991810);
      const attack = actor.attackDetails[0];
      return (key === 'essenceSlotCount' ? attack.essenceSlots.length : attack[key]) === value;
    }, { key, value });
    await field(key).waitFor({ state: 'visible' });
  };
  assert.equal(await page.locator('#Box_Entite_991810.admin-selected-entity').count(), 1, 'Marker survives opening codex');
  await edit('essenceSlotCount', 10);
  await field('essenceSlotCount').fill('11');
  await field('essenceSlotCount').dispatchEvent('change');
  assert.equal(await page.evaluate(() => window.selectedArmyA[0].attackDetails[0].essenceSlots.length), 10);
  await edit('essenceSlotCount', 3);
  await page.waitForFunction(() => document.querySelectorAll('#codex-entity_991810 .section-content.attaques .attack-details .attack-essence-socket').length === 3);
  const equip = async (index, color, label) => {
    await surface.locator('.attack-details .attack-essence-socket').nth(index).click();
    assert.equal(await page.locator('.admin-infinite-essences button').count(), 3);
    await page.getByRole('button', { name: `${label} · illimité`, exact: true }).click();
    await page.waitForFunction(({ index, color }) => window.selectedArmyA.find(e => e.id === 991810).attackDetails[0].essenceSlots[index].color === color, { index, color });
    await page.keyboard.press('Escape');
    await page.locator('.attack-essence-popup').waitFor({ state: 'detached' });
  };
  await equip(0, 'red', 'Rouge');
  await equip(1, 'blue', 'Bleu');
  await equip(2, 'yellow', 'Jaune');
  const checkState = async () => page.evaluate(async () => {
    const E = await import("/js/entities/runtime.js");
    const L = await import("/js/items/essences.js");
    const S = await import("/js/storage/gameStorage.js");
    const a = E.entites[0];
    return { attack: a.attackDetails[0], current: a.currentAttack, ledger: L.validateEntityEssenceLedger(a),
      items: a.attackEssenceInventory.linkedItems,
      otherUntouched: JSON.stringify(E.entites[1].attackDetails) === window.__otherAttack,
      universalUntouched: JSON.stringify(S.loadFromLocalStorage('essenceInventory', {})) === window.__universal,
      mastery: JSON.stringify(a.attackDetails[0].mastery) === JSON.stringify(window.__mastery) };
  });
  let state = await checkState();
  assert.deepEqual(state.attack.attacknature, ['hybridalDamage', 'piercingDamage']);
  assert.equal(state.ledger.ok, true, JSON.stringify(state.ledger));
  assert.ok(state.otherUntouched && state.universalUntouched && state.mastery);
  await edit('essenceSlotCount', 1);
  state = await checkState();
  assert.equal(state.ledger.ok, true, JSON.stringify(state.ledger));
  assert.ok(state.items.filter(item => item.state === 'available').length >= 2, 'Removed socket essences return to the entity');
  await edit('essenceSlotCount', 0);
  state = await checkState();
  assert.deepEqual(state.attack.attacknature, ['inerte']);
  assert.equal(state.ledger.ok, true, JSON.stringify(state.ledger));
  await edit('essenceSlotCount', 3);
  for (let index = 0; index < 3; index++) await equip(index, 'blue', 'Bleu');
  for (const [key, value] of Object.entries({ physicalRatio: 0.25, magicalRatio: 1.5, piercingRatio: 0.75 })) {
    await edit(key, value);
    state = await checkState();
    assert.equal(state.attack[key], value); assert.equal(state.current[key], value);
  }
  assert.equal(state.ledger.ok, true, JSON.stringify(state.ledger));
  assert.equal(new Set(state.attack.essenceSlots.map(slot => slot.essenceId)).size, 3, 'Unlimited essences have distinct owned IDs');
  assert.ok(state.otherUntouched && state.universalUntouched && state.mastery);
  await page.screenshot({ path: resolve(output, 'codex-admin.png'), fullPage: true });
  await surface.locator('.attack-details .attack-essence-socket').first().click();
  await page.screenshot({ path: resolve(output, 'infinite-essences.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__openCodex(991811));
  assert.equal(await page.locator('#Box_Entite_991811.admin-selected-entity').count(), 1);
  await page.evaluate(() => window.__openCodex(991810));
  assert.equal(await field('magicalRatio').inputValue(), '1.5');
  assert.equal(await field('essenceSlotCount').inputValue(), '3');

  // Exercise actual turns after codex edits, including the stored/live entity copies.
  // Observe the existing damage pipeline without replacing selection or damage resolution.
  await page.evaluate(async () => {
    const E = await import("/js/entities/runtime.js");
    const S = await import("/js/storage/gameStorage.js");
    const R = await import("/js/combat/attackResolution.js");
    const D = await import("/js/combat/statistics.js");
    const H = await import("/js/combat/vitals.js");
    Math.random = () => 0.4; // Hits without random criticals, dodges or broken spells.
    for (const [index, actor] of E.entites.entries()) {
      actor.baseStats = { HP: 10000, physicalDamage: 40, magicalDamage: 20, piercingDamage: 12,
        speed: index ? 100000 : 100, shift: 10 };
      E.enrichEntityStats(actor);
      actor.stats.HP.current = actor.stats.HP.max = 10000;
      R.updateEntityAttackDefinition(actor, actor.attackDetails[0], {
        preparationTime: 100, executionTime: 200, recoveryTime: 100, cooldown: 10000,
        effets: [], selfEffects: [],
      });
    }
    S.saveToLocalStorage('selectedArmyA', [E.entites[0]]);
    S.saveToLocalStorage('ArmyB', { armies: { test: { entities: [E.entites[1]] } } });
    window.__launches = []; window.__impacts = [];
    const snapshot = value => JSON.parse(JSON.stringify(value));
    D.registerAttackDamageModifier({ id: 'test-observe-codex-restart', priority: 99999,
      apply({ attacker, attack, sources }) {
        if (new Error().stack.includes('attemptAttackerDamages')) {
          window.__launches.push({ entityId: attacker.id, attack: snapshot(attack), sources: snapshot(sources) });
        }
      },
    });
    const originalLog = console.log, originalGroup = console.groupCollapsed, originalEnd = console.groupEnd;
    let impact = null;
    console.groupCollapsed = (...args) => {
      if (String(args[0]).includes('[FINAL]')) impact = { title: args[0] };
      originalGroup.apply(console, args);
    };
    console.log = (...args) => {
      if (impact && ['Attaque', 'Entrée', '3) Sources', '8) Totaux', '9) PV'].includes(args[0])) {
        impact[args[0]] = snapshot(args[1]);
      }
      originalLog.apply(console, args);
    };
    console.groupEnd = (...args) => {
      if (impact) { window.__impacts.push(impact); impact = null; }
      originalEnd.apply(console, args);
    };
    window.__combatActorIndex = 0;
    window.__prepareCombatCheck = (actorIndex = 0) => {
      window.__combatActorIndex = actorIndex;
      const actor = E.entites[actorIndex], target = E.entites[1 - actorIndex];
      const attack = actor.attackDetails[0];
      const preview = D.calculateAttackDamagePreview(actor, attack);
      const signature = R.getAttackNatureRules(attack).signature;
      // The fixed random roll selects magical damage for the prismatic discharge.
      const secondary = signature?.key === 'discharge'
        ? Math.floor(target.stats.HP.max * signature.percent / 100) : 0;
      window.__launches.length = 0; window.__impacts.length = 0;
      return { attack: snapshot(attack), sources: preview.sources, rawDamage: preview.totalDamage,
        expectedHP: H.estimateCancelledAttackHp(preview.attacker, target, attack, preview.sources),
        secondary, hpBefore: target.stats.HP.current };
    };
    window.__combatState = () => ({ launches: window.__launches, impacts: window.__impacts,
      hp: E.entites[1 - window.__combatActorIndex].stats.HP.current,
      attack: snapshot(E.entites[window.__combatActorIndex].currentAttack), ledger: window.__combatLedger() });
    const L = await import("/js/items/essences.js");
    window.__combatLedger = () => L.validateEntityEssenceLedger(E.entites[window.__combatActorIndex]);
    window.__openCodex(991810);
  });
  const combatReports = [];
  const runCombatCheck = async (label, actorIndex = 0) => {
    const expected = await page.evaluate(index => {
      const data = window.__prepareCombatCheck(index);
      document.querySelectorAll('.codex-entity-scan').forEach(node => node.remove());
      return data;
    }, actorIndex);
    assert.ok(expected.rawDamage > 0 && expected.expectedHP > 0, label);
    await page.locator('#startButton').click();
    await page.waitForFunction(() => window.__impacts.length > 0, null, { timeout: 20000 });
    await page.getByRole('button', { name: 'Stopper le combat', exact: true }).click();
    const actual = await page.evaluate(() => window.__combatState());
    await writeFile(resolve(output, 'last-combat.json'), JSON.stringify({ label, expected, actual }, null, 2));
    assert.equal(actual.launches.length, 1, `${label}: one real attack launched`);
    assert.equal(actual.impacts.length, expected.secondary ? 2 : 1, `${label}: main impact and optional nature effect`);
    const launched = actual.launches[0].attack, impact = actual.impacts[0];
    for (const key of ['physicalRatio', 'magicalRatio', 'piercingRatio', 'essenceSlots', 'attacknature']) {
      assert.deepEqual(launched[key], expected.attack[key], `${label}: launched ${key}`);
      assert.deepEqual(actual.attack[key], expected.attack[key], `${label}: current ${key}`);
    }
    assert.deepEqual(impact['Attaque'].nature, expected.attack.attacknature, `${label}: impact nature`);
    assert.deepEqual(impact['3) Sources'].base, expected.sources, `${label}: damage source colors`);
    assert.equal(impact['Entrée'].totalDamageArg, expected.rawDamage, `${label}: raw damage`);
    assert.equal(impact['9) PV'].delta, expected.expectedHP, `${label}: damage applied`);
    if (expected.secondary) {
      assert.equal(actual.impacts[1]['Attaque'].functionName, 'discharge', `${label}: prismatic signature`);
      assert.equal(actual.impacts[1]['9) PV'].delta, expected.secondary, `${label}: prismatic damage`);
    }
    assert.equal(expected.hpBefore - actual.hp, expected.expectedHP + expected.secondary, `${label}: real HP lost`);
    assert.equal(actual.ledger.ok, true, `${label}: essence ownership remains valid`);
    combatReports.push({ label, ratios: [launched.physicalRatio, launched.magicalRatio, launched.piercingRatio],
      colors: launched.essenceSlots.map(slot => slot.color), sources: expected.sources,
      rawDamage: expected.rawDamage, secondary: expected.secondary, hpLost: expected.hpBefore - actual.hp });
    await page.evaluate(() => window.__openCodex(991810));
  };
  await runCombatCheck('Initial combat: three blue essences');
  await edit('essenceSlotCount', 1);
  for (const scenario of [
    // Pure physical/magical attacks have an existing minimum +1 power intensifier.
    { color: 'red', label: 'Rouge', ratios: [2, 0, 0], raw: 82 },
    { color: 'blue', label: 'Bleu', ratios: [0, 3, 0], raw: 63 },
    { color: 'yellow', label: 'Jaune', ratios: [0, 0, 4], raw: 48 },
  ]) {
    for (const [index, key] of ['physicalRatio', 'magicalRatio', 'piercingRatio'].entries()) {
      await edit(key, scenario.ratios[index]);
    }
    await equip(0, scenario.color, scenario.label);
    await runCombatCheck(`Restart: ${scenario.color}`);
    assert.equal(combatReports.at(-1).rawDamage, scenario.raw, 'Independent power × ratio calculation');
  }
  await edit('essenceSlotCount', 3);
  await equip(0, 'red', 'Rouge'); await equip(1, 'blue', 'Bleu'); await equip(2, 'yellow', 'Jaune');
  for (const [key, value] of Object.entries({ physicalRatio: 0.25, magicalRatio: 1.5, piercingRatio: 0.75 })) await edit(key, value);
  await runCombatCheck('Restart: mixed essences and fractional ratios');

  // The opposing entity is saved through ArmyB, not selectedArmyA.
  await page.evaluate(async () => {
    const E = await import("/js/entities/runtime.js");
    const S = await import("/js/storage/gameStorage.js");
    for (const [index, actor] of E.entites.entries()) {
      actor.baseStats.speed = index ? 100 : 100000;
      E.enrichEntityStats(actor);
    }
    S.saveToLocalStorage('selectedArmyA', [E.entites[0]]);
    S.saveToLocalStorage('ArmyB', { armies: { test: { entities: [E.entites[1]] } } });
    window.__openCodex(991811);
  });
  const opposingCard = page.locator('#codex-entity_991811 .section-content.attaques');
  for (const [key, value] of Object.entries({ essenceSlotCount: 1, physicalRatio: 0, magicalRatio: 2.5, piercingRatio: 0 })) {
    const input = opposingCard.locator(`[data-admin-attack-field="${key}"]`);
    await input.fill(String(value)); await input.press('Tab');
  }
  await opposingCard.locator('.attack-details .attack-essence-socket').first().click();
  await page.getByRole('button', { name: 'Bleu · illimité', exact: true }).click();
  await page.keyboard.press('Escape');
  await runCombatCheck('Restart: opposing entity edited in codex', 1);
  assert.equal(combatReports.at(-1).rawDamage, 52, '(20 PM + 1 pure bonus) × 2.5, rounded down');
  await writeFile(resolve(output, 'combat-restarts.json'), JSON.stringify(combatReports, null, 2));
  console.log('Combat restart checks:', JSON.stringify(combatReports));

  await field('magicalRatio').evaluate(node => { window.__staleRatioInput = node; });
  await page.evaluate(async () => (await import("/js/storage/gameStorage.js")).setAdminMode(false));
  assert.equal(await surface.locator('.admin-attack-card-controls').isVisible(), false);
  const before = JSON.stringify((await checkState()).attack);
  await page.evaluate(() => { const node = window.__staleRatioInput; node.value = '9'; node.dispatchEvent(new Event('change', { bubbles: true })); });
  assert.equal(JSON.stringify((await checkState()).attack), before, 'Disabled Admin cannot mutate through stale controls');
  await page.evaluate(async () => { window.levelRunning = 'worldmap'; (await import("/js/debug/admin.js")).cleanupAdminLevel(); });
  await page.evaluate(() => window.__openCodex(991810));
  await surface.locator('.attack-details .attack-essence-socket').first().click();
  assert.equal(await page.locator('.admin-infinite-essences').count(), 0, 'No unlimited choices outside Admin');
  await page.keyboard.press('Escape');
  assert.deepEqual(errors, []);
  console.log('PASS Admin codex: sockets, infinite essences, ratios, save/reopen, marker, actual damage after five edited combat restarts on both sides, and ordinary-mode guards.');
} finally { await browser.close(); await new Promise(done => server.close(done)); }
