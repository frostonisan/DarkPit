import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('docs'), output = resolve('outputs/pause-orders');
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  const file = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(root + sep)) return res.writeHead(403).end();
  try { res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream'); res.end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true });

const errors = [];
async function fixture(config = {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', error => errors.push(error.message));
  page.testLog=[];page.on('console',message=>page.testLog.push(message.text()));
  page.on('console', message => { if (message.type()==='error' && !message.text().includes('Failed to load resource')) console.error(message.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.evaluate(async config => {
    window.P = await import("/js/combat/pause.js"); await P.restorePausedCombat();
    window.Clock = await import("/js/combat/clock.js");
    const { loadResource } = await import('/js/data/loaderList.js');
    const gif = await loadResource('/media/assets/effects/ambidextry.gif');
    const bytes = new Uint8Array(await gif.blob.arrayBuffer());
    const marker = new TextDecoder('latin1').decode(bytes).indexOf('NETSCAPE2.0');
    if (marker < 0 || bytes[marker + 13] || bytes[marker + 14]) throw Error('GIF should loop while combat time is paused');

    const U = await import("/js/ui/application.js");
    const E = await import("/js/entities/runtime.js");
    const C = await import("/js/rendering/entities.js");
    const S = await import("/js/storage/gameStorage.js");
    const template = (await import("/js/data/entityTemplates.js")).entitesNest.find(e => e.serial === 900013);
    U.createGameContainer(); U.GameUi(); S.setAdminMode(true); window.levelRunning = 'admin';
    document.querySelector('.worldmap')?.remove();
    const store = await import("/js/storage/sessionStorage.js");
    store.beginAdminSession(); window.currentStageId = 'pause-test';
    store.gameStorage.setItem('GameStages', JSON.stringify({stages:[{id:'pause-test',level_type:'admin'}]}));
    store.gameStorage.setItem('currentLevel','pause-test');
    window.baseStorage = JSON.stringify(Object.entries(window.localStorage).sort());
    const grid = document.createElement('div'); grid.id = 'hexGrid';
    grid.style.cssText = 'position:absolute;top:100px;left:180px;width:850px;height:500px';
    document.getElementById('game-container').append(grid); E.entites.length = 0;
    for (const [i, side] of ['A', 'B'].entries()) {
      const hex = document.createElement('div'); hex.className = `hex Side${side} occupied`; hex.dataset.position = String(i + 1);
      hex.style.cssText = `position:absolute;left:${i * 400}px;top:50px;width:180px;height:200px`; grid.append(hex);
      const own = config[side] || {};
      const magic = own.magic || false;
      const entity = E.enrichEntityStats({ ...structuredClone(template), id: 999820 + i, name: `Simultané ${side}`, side,
        type: 'sbire', role: 'gueux', position: String(i+1), level: 1, awakening: 1, stuff: {}, stats: {}, modifierStats: {},
        baseStats: { HP: 1000, strength: 0, intelligence: 0, agility: 0, physicalDamage: 40, magicalDamage: 40,
          speed: config.speed ?? 100, extraLife: own.extraLife || 0 },
        attacks: [{ functionName: 'simultaneous-test', attackId: 'simultaneous-test', displayName: 'Impact simultané',
          combatFunction: own.support ? 'Support' : 'Attaquant', attacknature: [magic ? 'magicalDamage' : 'physicalDamage'],
          attackRange: [own.range || 'melee'], attackTarget: [own.support ? 'ally' : 'enemy'], deadTarget: ['no'], type: [], effets: own.support ? ['heal'] : [], selfEffects: [],
          preparationTime: own.preparation ?? 500, executionTime: own.execution ?? 1800, recoveryTime: own.recovery ?? 300, cooldown: 20000,
          physicalRatio: magic ? 0 : 1, magicalRatio: magic ? 1 : 0, piercingRatio: 0 }] });
      entity.statut = ['alive']; entity.isDEAD = false; E.entites.push(entity);
      const created = C.createEntiteInDOM(entity); hex.append(created.element); await created.spriteReady;
    }
    window.E = E; window.G = await import("/js/app/state.js"); window.F = await import("/js/combat/loop.js");
    window.Timeline = await import("/js/combat/timeline.js"); window.Attacks = await import("/js/combat/attacks.js");
    window.Sim = await import("/js/debug/simulation.js"); window.snapshot = Sim.captureSimulationBoard();
    window.entries = [];
    window.addEventListener('combatLogEntry', event => {
      const { type, data } = event.detail;
      entries.push({ type, at: Timeline.combatNow(), side: data.attacker?.side || data.entity?.side, damage: data.damage });
    });
  }, config);
  return page;
}


const ready = page => page.waitForFunction(async () => {
  window.P = await import("/js/combat/pause.js"); window.Clock = await import("/js/combat/clock.js");
  await P.restorePausedCombat(); // F5 also rebinds ground effects asynchronously.
  return Clock.isCombatPaused() && !P.isCombatCheckpointBusy() && sessionStorage.getItem('DarkPitPausedCombat:available') === '1';
});
async function attach(page) {
  await page.evaluate(async () => {
    window.E = await import("/js/entities/runtime.js"); window.G = await import("/js/app/state.js");
    window.M = await import('/js/items/itemManager.js'); window.R = await import("/js/combat/attackResolution.js");
    window.dropEntity = position => {
      const transfer = new DataTransfer(); transfer.setData('text', 'Box_Entite_999820');
      document.querySelector(`.hex[data-position="${position}"]`).dispatchEvent(new DragEvent('drop', {dataTransfer:transfer,bubbles:true,cancelable:true}));
    };
    window.readTactical = () => ({ now:Clock.clockNow(), entities:E.entites.map(e=>({id:e.id,position:e.position,hp:e.stats.HP.current,
      shift:e.stats.shift.current,selection:e.attackSelection,action:e._combatAction,poison:e.stats.poison})),
      inventory:M.getBattleInventoryState(), ground:Clock.captureCombatState().ground, orders:Clock.captureCombatState().orders });
  });
}

async function startPlayerBattle(page, extraAlly = false) {
  await attach(page);
  await page.evaluate(async extra => {
    window.O = await import("/js/combat/orders.js");
    const game = await import("/js/app/stages.js"); game.configureBattleSystemsOnce();
    (await import("/js/ui/display.js")).LevelUi();
    const S = await import("/js/storage/gameStorage.js");
    S.saveToLocalStorage('selectedArmyA', [E.entites[0]]);
    S.saveToLocalStorage('PlayerSave', { Playerinventory: [], equippedItems: [] });
    S.saveToLocalStorage('IngameItems', []);
    M.setBattleSlotCount(2, { admin: true });
    const { ItemDetails } = await import('/js/data/itemList.js');
    const item = M.acquireItem(ItemDetails.find(i => i.effets?.length === 1 && i.effets[0] === 'itemHeal'), 'orders-test');
    M.moveBattleItem(item.itemId, 0);
    if (extra) {
      const ally = E.enrichEntityStats({ ...structuredClone(E.entites[0]), id: 999822, name: 'Fuyard', position: '3',
        stats: {}, modifierStats: {}, baseStats: { ...E.entites[0].baseStats, velocity: 100, speed: 100 } });
      const hex = document.createElement('div'); hex.className = 'hex SideA occupied'; hex.dataset.position = '3';
      hex.style.cssText = 'position:absolute;left:200px;top:280px;width:180px;height:200px';
      document.querySelector('#hexGrid').append(hex); E.entites.push(ally);
      const dom = (await import("/js/rendering/entities.js")).createEntiteInDOM(ally); hex.append(dom.element); await dom.spriteReady;
    }
    S.setAdminMode(false); window.levelRunning = 'scripted';
    S.saveToLocalStorage('GameStages', { stages: [{ id: 'pause-test', level_type: 'scripted' }] });
    document.querySelector('.entitylootContainer')?.remove();
    document.getElementById('game-windows').style.cssText = 'opacity:1;transform:scale(.8);transform-origin:top left';
    G.startGame();
  }, extraAlly);
}
async function attachOrders(page) {
  await attach(page);
  await page.evaluate(async () => { window.O = await import("/js/combat/orders.js"); });
}
async function resume(page) {
  await page.evaluate(() => P.resumeCombat());
  await page.waitForFunction(() => !Clock.isCombatPaused());
}

try {
  // Real controls in the scaled game stacking context; commands stay immediate.
  const page = await fixture({ speed: 50000 }); await startPlayerBattle(page);
  await page.evaluate(() => P.pauseCombat()); await ready(page);
  assert.equal(await page.locator('[data-order="runaway"]').count(), 1);
  assert.equal(await page.locator('[data-order="cancelrunaway"]').count(), 0);
  await page.evaluate(async () => (await import("/js/ui/attacks.js")).showCombatAttackControlPanel(E.entites[0].id));
  const layers = await page.evaluate(() => {
    const veil = document.getElementById('combat-pause-fx');
    veil.style.pointerEvents = 'auto'; // Inspect paint order, even though the veil normally passes clicks.
    const result = ['.view-controls', '.battle-satchel--combat', '.combat-attack-control-panel', '[data-order="runaway"]'].map(selector => {
      const node = document.querySelector(selector), box = node?.getBoundingClientRect();
      if (!box || !box.width || !box.height) return { selector, missing: true };
      const stack = document.elementsFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      const own = stack.findIndex(e => e === node || node.contains(e)), cover = stack.indexOf(veil);
      return { selector, above: own >= 0 && (cover < 0 || own < cover) };
    });
    veil.style.removeProperty('pointer-events'); return result;
  });
  assert.ok(layers.every(e => e.above), JSON.stringify(layers));
  await page.locator('#see-hex').click();
  assert.equal(await page.locator('#hide-hex').isVisible(), true);
  await page.locator('#hide-hex').click();
  await page.locator('#battle-log-button').click();
  assert.equal(await page.locator('#battle-log-helper').isVisible(), true);
  await page.locator('#close-battlelog-button').click();
  await page.screenshot({ path: resolve(output, 'controls-above-pause.png') });
  const time = await page.evaluate(() => Clock.clockNow());
  await page.locator('.combat-attack-control-toggle').first().click(); await ready(page);
  assert.equal(await page.locator('.combat-attack-control-toggle').first().getAttribute('aria-pressed'), 'false');
  const before = await page.evaluate(() => JSON.stringify(E.entites[0]._phaseTimer));
  await page.locator('[data-order="runaway"]').click(); await ready(page);
  assert.equal(await page.locator('[data-order="runaway"]').count(), 0);
  assert.equal(await page.locator('[data-order="cancelrunaway"]').innerText(), 'Annuler la fuite');
  assert.equal(await page.evaluate(() => JSON.stringify(E.entites[0]._phaseTimer)), before);
  assert.equal(await page.evaluate(() => Clock.clockNow()), time);
  await page.locator('[data-order="cancelrunaway"]').click(); await ready(page);
  assert.equal(await page.evaluate(() => Clock.captureCombatState().orders.pendingPlayerOrder), null);
  assert.equal(await page.evaluate(() => JSON.stringify(E.entites[0]._phaseTimer)), before);
  assert.equal(await page.locator('[data-order="runaway"]').count(), 1, 'cancel simply restores the flee button');
  await page.reload(); await ready(page); await attachOrders(page);
  assert.equal(await page.locator('#see-hex, #hide-hex').count(), 2, 'view controls rebuilt after F5');
  await page.locator('#see-hex').click();
  assert.equal(await page.locator('#hide-hex').isVisible(), true);
  assert.equal(await page.evaluate(() => O.getPlayerOrderType()), null);
  assert.equal(await page.evaluate(() => JSON.stringify(E.entites[0]._phaseTimer)), before);
  await resume(page);
  await page.waitForTimeout(2300);
  assert.equal(await page.locator('#effectsContainer_999820 .order-exclamation').count(), 0);
  assert.equal(await page.evaluate(() => G.getOrderSide()), null);
  assert.equal(await page.evaluate(() => E.entites[0].turnCount), 1, 'same turn continues, no order or extra turn');
  assert.equal(await page.evaluate(() => E.entites[0]._phaseTimer.endTime), JSON.parse(before).endTime, 'original gauge deadline retained');
  assert.equal(await page.evaluate(() => E.entites[0].orderPhase ?? null), null);
  assert.equal(await page.evaluate(() => E.entites[0].hasFled === true), false);
  assert.equal(await page.locator('[data-order="runaway"]').count(), 1);
  await page.evaluate(() => G.StopGame({ preserveScene: true })); await page.close();
  console.log('PASS controls above veil, live attack toggle; queued flee discarded through F5 with no order, reset or extra turn');

  // Cancel during both decision and flight execution, including an F5 mid-cancellation.
  for (const phase of ['orderDecision', 'orderExecution']) {
    const page = await fixture({ speed: 5000 }); await startPlayerBattle(page);
    await page.locator('[data-order="runaway"]').click();
    try { await page.waitForFunction(phase => E.entites[0]?.orderPhase === phase, phase); }
    catch (error) { await writeFile(resolve(output, `${phase}-debug.log`), page.testLog.join('\n')); throw error; }
    if (phase === 'orderExecution') assert.equal(await page.evaluate(() => E.entites[0]._phaseTimer.duration), 5000, 'flight keeps its full execution duration');
    await page.locator('[data-order="cancelrunaway"]').click();
    await page.waitForFunction(() => O.getPlayerOrderType() === 'cancelrunaway' && E.entites[0].orderPhase === 'orderDecision');
    await page.waitForTimeout(200);
    assert.equal(await page.locator('#effectsContainer_999820 .order-exclamation').count(), 1, 'old order animation is released');
    await page.evaluate(() => P.pauseCombat()); await ready(page);
    const remaining = await page.evaluate(() => E.entites[0].recoveryTime);
    await page.reload(); await ready(page); await attachOrders(page);
    assert.equal(await page.evaluate(() => E.entites[0].recoveryTime), remaining);
    await resume(page);
    await page.waitForFunction(() => G.getOrderSide() === null);
    assert.equal(await page.evaluate(() => E.entites[0].turnCount), 2);
    assert.equal(await page.evaluate(() => E.entites[0].hasFled === true), false);
    assert.equal(await page.locator('#effectsContainer_999820 .order-exclamation, #effectsContainer_999820 .runaway-info').count(), 0);
    assert.ok(await page.evaluate(() => E.entites[0].speedTimer > 4000), 'new ATB starts empty');
    assert.equal(await page.locator('#DragSprite_999820.runaway').count(), 0);
    await page.evaluate(() => G.StopGame({ preserveScene: true })); await page.close();
    console.log(`PASS cancellation during ${phase}, ! stays unique, F5 preserves cancellation phase`);
  }
  // A successful fugitive stays removed. The remaining ally cancels a failed attempt.
  const group = await fixture({ speed: 500 }); await startPlayerBattle(group, true);
  await group.evaluate(() => { Math.random = () => 0; }); // 0 velocity fails; the agile ally still escapes.
  await group.locator('[data-order="runaway"]').click();
  try {
    await group.waitForFunction(() => O.fledEntities.some(e => e.id === 999822) && E.entites[0].orderPhase === 'runawayRecovery');
  } catch (error) {
    await writeFile(resolve(output, 'group-debug.json'), JSON.stringify(await group.evaluate(() => ({
      state: Clock.captureCombatState().orders, entities: E.entites.map(e => ({ id: e.id, hp: e.stats.HP.current, speed: e.stats.speed,
        velocity: e.stats.velocity, phase: e.orderPhase, fled: e.hasFled })), outcome: G.battleOutcome, started: G.gameStarted
    })), null, 2));
    await writeFile(resolve(output, 'group-debug.log'), group.testLog.join('\n'));
    throw error;
  }
  await group.evaluate(() => P.pauseCombat()); await ready(group);
  const groupBefore = await group.evaluate(() => ({ now: Clock.clockNow(), phase: E.entites[0].orderPhase, turn: E.entites[0].turnCount }));
  await group.locator('[data-order="cancelrunaway"]').click(); await ready(group);
  assert.deepEqual(await group.evaluate(() => ({ now: Clock.clockNow(), phase: E.entites[0].orderPhase, turn: E.entites[0].turnCount })), groupBefore);
  await group.reload(); await ready(group); await attachOrders(group);
  await resume(group);
  await group.waitForFunction(() => O.getPlayerOrderType() === 'cancelrunaway' && E.entites[0].orderPhase === 'orderDecision');
  await group.waitForTimeout(600);
  // Record the state at the F5 keystroke, before the application handles it.
  await group.evaluate(() => {
    window.addEventListener('keydown', event => {
      if (event.key !== 'F5') return;
      const entity = E.entites.find(e => e.id === 999820);
      sessionStorage.setItem('cancel-reload-witness', JSON.stringify({
        now: Clock.clockNow(), timer: entity._phaseTimer, remaining: entity.recoveryTime, turn: entity.turnCount,
        attempts: entity.combatDetails?.fleeAttempts || 0, fled: O.fledEntities.map(e => e.id)
      }));
    }, { capture: true, once: true });
  });
  await Promise.all([
    group.waitForEvent('framenavigated', { predicate: frame => frame === group.mainFrame(), timeout: 5000 }),
    group.keyboard.press('F5'),
  ]);
  await ready(group); await attachOrders(group);
  const witness = await group.evaluate(() => JSON.parse(sessionStorage.getItem('cancel-reload-witness')));
  const readCancellation = () => group.evaluate(() => {
    const entity = E.entites.find(e => e.id === 999820);
    return { now: Clock.clockNow(), pause: P.getCombatPauseReasons(), order: O.getPlayerOrderType(), phase: entity.orderPhase,
      timer: entity._phaseTimer, remaining: entity.recoveryTime, turn: entity.turnCount,
      attempts: entity.combatDetails?.fleeAttempts || 0, fled: O.fledEntities.map(e => e.id), present: E.entites.map(e => e.id) };
  });
  const restored = await readCancellation();
  assert.ok(witness.remaining > 0 && witness.remaining < 1600, 'F5 occurs partway through !');
  assert.equal(restored.remaining, witness.remaining, 'remaining comprehension time is preserved exactly');
  assert.deepEqual(restored.timer, witness.timer, 'same timer deadline, no new 2-second decision');
  assert.equal(restored.order, 'cancelrunaway'); assert.equal(restored.phase, 'orderDecision');
  assert.deepEqual(restored.pause, { tactical: false, absolute: true });
  assert.equal(restored.attempts, witness.attempts); assert.equal(restored.turn, witness.turn);
  assert.deepEqual(restored.fled, [999822]); assert.ok(!restored.present.includes(999822));
  assert.equal(await group.locator('#effectsContainer_999820 .order-exclamation').count(), 1);
  await group.waitForTimeout(400); assert.deepEqual(await readCancellation(), restored, 'no background progression');
  await group.reload(); await ready(group); await attachOrders(group);
  assert.deepEqual(await readCancellation(), restored, 'a second F5 keeps the same cancellation state');
  await group.evaluate(() => {
    window.cancelFinishedAt = null;
    window.addEventListener('battleActionContextChanged', () => {
      if (cancelFinishedAt === null && O.getPlayerOrderType() === null && G.getOrderSide() === null) cancelFinishedAt = Clock.clockNow();
    });
  });
  await group.getByRole('button', { name: 'Reprendre la partie', exact: true }).click();
  await group.waitForFunction(() => G.getOrderSide() === null);
  const finishedAt = await group.evaluate(() => cancelFinishedAt);
  assert.ok(finishedAt >= witness.timer.endTime && finishedAt < witness.timer.endTime + 150, 'cancellation finishes at its saved deadline');
  assert.equal(await group.evaluate(() => E.entites[0].turnCount), witness.turn + 1, 'exactly one new turn after cancellation');
  await group.waitForTimeout(1800);
  assert.equal(await group.evaluate(() => E.entites[0].combatDetails?.fleeAttempts || 0), witness.attempts, 'no flee rolls restart after F5');
  const result = await group.evaluate(() => ({ present: E.entites.map(e => e.id), fled: O.fledEntities.map(e => e.id),
    turned: E.entites[0].turnCount > 1, enemyTurns: E.entites.find(e => e.side === 'B').turnCount, started: G.gameStarted }));
  assert.ok(result.turned && result.started && result.enemyTurns >= 1);
  assert.ok(!result.present.includes(999822)); assert.deepEqual(result.fled, [999822]);
  assert.equal(await group.locator('#Box_Entite_999822').count(), 0);
  await writeFile(resolve(output, 'cancel-reload.json'), JSON.stringify({ witness, restored, finishedAt, result }, null, 2));
  await group.evaluate(() => G.StopGame({ preserveScene: true })); await group.close();
  assert.deepEqual(errors, []);
  console.log('PASS direct F5 during cancellation !, exact remaining timer, second F5, no new flee roll; escaped ally stays removed');
} finally { await browser.close(); await new Promise(done => server.close(done)); }
