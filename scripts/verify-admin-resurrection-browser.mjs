import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('docs'), output = resolve('outputs/admin-resurrection');
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  const file = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(root + sep)) return res.writeHead(403).end();
  try {
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [], checks = [];
async function fixture(count = 3) {
  const page = await browser.newPage({ viewport: { width: 1536, height: 960 } });
  page.on('pageerror', e => errors.push(e.stack || e.message));
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.evaluate(async count => {
    window.S = await import("/js/storage/gameStorage.js"); window.E = await import("/js/entities/runtime.js");
    window.Admin = await import("/js/debug/admin.js"); window.G = await import("/js/app/state.js");
    window.P = await import("/js/combat/pause.js"); await P.restorePausedCombat();
    window.Clock = await import("/js/combat/clock.js"); window.Effects = await Promise.all([import("/js/combat/effects.js"), import("/js/rendering/auras.js")]).then(parts => Object.defineProperties({}, Object.fromEntries(parts.flatMap(part => Object.keys(part).map(key => [key, { enumerable: true, get: () => part[key] }])))));
    window.pauseEvents = [];
    for (const type of ['combatPaused', 'combatResumed']) window.addEventListener(type, () => pauseEvents.push({ type, at: Date.now(), reasons: P.getCombatPauseReasons(), stack: new Error().stack }));
    document.addEventListener('visibilitychange', () => pauseEvents.push({ visibility: document.visibilityState }));
    window.Damage = await Promise.all([import("/js/combat/vitals.js"), import("/js/rendering/vitalFeedback.js"), import("/js/rendering/hud.js")]).then(parts => Object.defineProperties({}, Object.fromEntries(parts.flatMap(part => Object.keys(part).map(key => [key, { enumerable: true, get: () => part[key] }]))))); window.C = await import("/js/rendering/entities.js");
    window.Loot = await import("/js/items/loot.js");
    S.setAdminMode(true); window.levelRunning = 'admin'; window.currentStageId = 'resurrection-test';
    S.setCurrentLevel('resurrection-test'); (await import("/js/storage/sessionStorage.js")).beginAdminSession();
    S.saveToLocalStorage('GameStages', { stages: [{ id: 'resurrection-test', level_type: 'admin' }] });
    S.saveToLocalStorage('selectedArmyA', []); S.saveToLocalStorage('ArmyB', { armies: {} });
    S.saveToLocalStorage('equippedItems', []); E.entites.length = 0;
    document.body.innerHTML = '<div id="game-container"><div class="Game-UI"><div id="score"></div></div><div class="AllEntitiesHud"></div><div id="hexGrid" class="hex-grid"></div></div>';
    const grid = document.getElementById('hexGrid');
    grid.style.cssText = 'position:fixed;left:140px;top:200px;display:flex;gap:40px;transform:none';
    const template = (await import("/js/data/entityTemplates.js")).entitesNest.find(row => row.serial === 900013);
    for (let i = 0; i < count; i++) {
      const side = i === 1 ? 'B' : 'A';
      const hex = document.createElement('div'); hex.id = `hex_${i + 1}`; hex.className = `hex Side${side} occupied`;
      Object.assign(hex.dataset, { position: hex.id, row: '0', col: String(i) });
      hex.style.cssText = 'width:160px;height:180px;position:relative;transform:none;background:#20252a';
      grid.append(hex);
      const entity = E.enrichEntityStats({ ...structuredClone(template), id: 991790 + i, name: `Résurrection ${side} ${i}`, side,
        type: 'sbire', role: 'gueux', position: hex.id, level: 1, awakening: 1, stuff: {}, stats: {}, modifierStats: {},
        hasReward: false,
        baseStats: { HP: 10000, strength: 10, intelligence: 10, agility: 10, physicalDamage: 2,
          speed: i ? 60000 : 100, astrality: i ? 0 : 20 },
        attacks: [{ functionName: 'resurrection-test', attackId: 'resurrection-test', displayName: 'Test préparation',
          combatFunction: 'Attaquant', attacknature: ['physicalDamage'], attackRange: ['range'], attackTarget: ['enemy'], deadTarget: ['no'],
          type: [], effets: [], selfEffects: [], preparationTime: 2000, executionTime: 100, recoveryTime: 100, cooldown: 100,
          physicalRatio: 1, magicalRatio: 0, piercingRatio: 0 }] });
      entity.isDEAD = false; entity.statut = ['alive']; E.entites.push(entity);
      const created = C.createEntiteInDOM(entity); hex.append(created.element); await created.spriteReady;
    }
    const boardController = await import('/js/board/controller.js');
    boardController.invalidateFootprintGeometry(grid); boardController.rebuildBoardOccupancy(grid);
    window.actor = E.entites[0]; window.enemy = E.entites[1];
    (await import("/js/app/stages.js")).configureBattleSystemsOnce();
    Admin.initializeAdminLevel(E.entitesNestUp);
    window.kill = entity => {
      entity.stats.HP.current = 0; Damage.LifeandDeath(entity);
    };
  }, count);
  return page;
}
async function select(page, id = 991790) {
  await page.locator(`#Box_Entite_${id}`).dispatchEvent('click', { detail: 1 });
  await page.waitForFunction(id => window.__adminActiveLiveEntityId === String(id), id);
  await page.locator('.admin-resurrect-entity-button').waitFor({ state: 'visible' });
}
try {
  const page = await fixture();
  await select(page);
  await page.evaluate(() => {
    window.draftBeforeCombat = window.__adminActiveLiveEntityDraft;
    draftBeforeCombat.nickname = 'Modifié pendant préparation';
    G.startGame();
  });
  await page.waitForFunction(() => actor._combatAction?.stage === 'preparation');
  await page.evaluate(() => { window.actionBefore = actor._combatAction; });
  await page.locator('.admin-validate-live-entity-button').click();
  await page.waitForTimeout(150);
  if (process.env.REPRO_BEFORE === '1') {
    const lost = await page.evaluate(() => !actor._combatAction);
    assert.ok(lost && errors.some(e => /preparationRecoils/.test(e)), JSON.stringify({ lost, errors }));
    console.log('REPRODUCED: validating a pre-combat admin draft drops _combatAction and crashes preparationRecoils.');
  } else {
    assert.ok(await page.evaluate(() => actor._combatAction === actionBefore), 'Admin validation keeps the exact running action');
    assert.equal(await page.evaluate(() => actor.nickname), 'Modifié pendant préparation');
    await page.waitForFunction(() => enemy.stats.HP.current < enemy.stats.HP.max, null, { timeout: 8000 });
    await page.waitForFunction(() => actor.turnCount >= 2, null, { timeout: 8000 });
    checks.push('Admin validation during Astrality preparation keeps the action, applies edits, deals damage and starts the next turn');
    // A draft captured mid-preparation must not restore its completed action later.
    await page.waitForFunction(() => actor._combatAction?.stage === 'preparation');
    await page.evaluate(() => { window.staleDraft = JSON.parse(JSON.stringify(actor)); window.oldAction = actor._combatAction; });
    await page.waitForFunction(() => actor._combatAction && actor._combatAction !== oldAction);
    assert.ok(await page.evaluate(() => {
      const current = actor._combatAction;
      Admin.applyAdminLiveEntityDraft(actor, staleDraft);
      return actor._combatAction === current;
    }), 'Old admin snapshot cannot rewind the attack');
    checks.push('Stale admin draft does not rewind a newer attack');
    // Even an externally cancelled action must end cleanly and let the turn cycle continue.
    const turn = await page.evaluate(() => { delete actor._combatAction; return actor.turnCount; });
    await page.waitForFunction(turn => actor.turnCount > turn, turn, { timeout: 8000 });
    checks.push('Removed action ends cleanly and the entity starts its next turn');
    await page.evaluate(() => G.StopGame({ preserveScene: true }));
    await page.close();

    const solo = await fixture(1);
    await solo.evaluate(() => { kill(actor); G.setGameOver(true); });
    await select(solo);
    await solo.locator('#admin-list-search-input').fill('vie');
    const before = await solo.evaluate(() => {
      window.__adminActiveLiveEntityDraft.nickname = 'Toujours ici';
      return { stats: actor.stats.strength, stuff: actor.stuff, lives: actor.resourceStocks, id: actor.id };
    });
    await solo.locator('.admin-resurrect-entity-button').click();
    await solo.waitForFunction(() => !actor.isDEAD && actor.stats.HP.current === actor.stats.HP.max);
    await solo.waitForTimeout(200);
    assert.ok(await solo.locator('.admin-resurrect-entity-button').isDisabled());
    assert.equal(await solo.locator('#admin-list-search-input').inputValue(), 'vie');
    assert.ok(await solo.locator('#startButton').isVisible());
    const after = await solo.evaluate(() => ({ stats: actor.stats.strength, stuff: actor.stuff, lives: actor.resourceStocks, id: actor.id }));
    assert.deepEqual(after, before);
    assert.ok(await solo.evaluate(() => !G.gameStarted && !G.isBattleFinished()
      && !document.querySelector('.overlay-end-screen') && !sessionStorage.getItem('globalGameOverScreen')
      && !document.querySelector(`#Box_Entite_${actor.id} .dead-sprite`)
      && document.querySelector('.admin-resurrect-entity-button').previousElementSibling.textContent === 'Clear'));
    await solo.locator('.admin-validate-live-entity-button').click();
    assert.ok(await solo.evaluate(() => actor.nickname === 'Toujours ici' && !actor.isDEAD && actor.stats.HP.current === actor.stats.HP.max));
    checks.push('Selected corpse returns at full HP beside Clear, sole survivor can launch, resources/search/pending edits are preserved');
    await solo.screenshot({ path: resolve(output, 'toolbar.png') });
    await solo.close();

    const battle = await fixture();
    await select(battle, 991791);
    await battle.evaluate(() => G.startGame());
    await battle.waitForFunction(() => actor._combatAction?.stage === 'preparation');
    // Kill A (another A and B remain alive), including an old delayed dead-sprite callback.
    await battle.evaluate(async () => {
      await P.pauseCombat(); kill(actor);
      const box = document.getElementById(`Box_Entite_${actor.id}`), hex = box.closest('.hex');
      box.remove(); const created = C.createEntiteInDOM(actor); hex.append(created.element); await created.spriteReady;
    });
    await select(battle);
    await battle.locator('.admin-resurrect-entity-button').click();
    await battle.waitForFunction(() => !actor.isDEAD);
    assert.ok(await battle.evaluate(() => G.gameStarted && Clock.isCombatPaused()));
    // The resurrection also refreshes the pause checkpoint; wait for that write
    // before asking the normal resume control to continue the battle.
    // The real control stays disabled while the checkpoint is being written.
    // An async waitForFunction predicate is a truthy Promise, not a retry loop.
    await battle.locator('#combat-pause-control').click();
    await battle.waitForFunction(() => !Clock.isCombatPaused());
    await battle.waitForTimeout(300);
    assert.ok(await battle.evaluate(() => !actor.isDEAD && !document.querySelector(`#Box_Entite_${actor.id} .dead-sprite`)));
    try {
      await battle.waitForFunction(() => enemy.stats.HP.current < enemy.stats.HP.max, null, { timeout: 8000 });
    } catch (error) {
      console.log(JSON.stringify(await battle.evaluate(() => ({ running: G.gameStarted, paused: Clock.isCombatPaused(), reasons: P.getCombatPauseReasons(), pauseEvents, outcome: G.battleOutcome,
        actors: E.entites.map(e => ({ id: e.id, hp: e.stats.HP, dead: e.isDEAD, stopped: e.battleStopped,
          phase: e.currentPhase, action: e._combatAction?.stage, turn: e.turnCount, order: G.getOrderSide() })) })), null, 2));
      console.log(errors); throw error;
    }
    checks.push('Resurrection during paused battle preserves the battle and resumes attacks without restoring an old dead sprite');
    await battle.evaluate(() => G.StopGame({ preserveScene: true }));
    await battle.evaluate(() => kill(enemy));
    await battle.waitForFunction(() => document.getElementById(`Box_Entite_${enemy.id}`).dataset.corpseLootId);
    await select(battle, 991791);
    await battle.locator('.admin-resurrect-entity-button').click();
    await battle.waitForFunction(() => !enemy.isDEAD);
    await battle.waitForTimeout(250);
    assert.ok(await battle.evaluate(() => {
      const box = document.getElementById(`Box_Entite_${enemy.id}`);
      return !box.dataset.corpseLootId && !box.querySelector('.dead-sprite, .glitter-loot-container');
    }));
    checks.push('Enemy corpse loot remains detached from the living entity');
    assert.equal(await battle.evaluate(async () => {
      kill(enemy); S.setAdminMode(false); window.levelRunning = 'level';
      return Admin.resurrectAdminEntity(enemy);
    }), false);
    checks.push('Admin resurrection cannot be invoked outside Admin');
    await battle.close();
    assert.deepEqual(errors, []);
    await writeFile(resolve(output, 'validation.json'), JSON.stringify({ checks, errors }, null, 2));
    console.log(JSON.stringify({ checks, errors }, null, 2));
  }
} finally { await browser.close(); await new Promise(done => server.close(done)); }
