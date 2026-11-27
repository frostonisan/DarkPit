import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve('docs'), output = resolve('outputs/combat-continuity');
// Optional pre-change modules for a deterministic before/after comparison.
// Regular regression checks do not depend on files under outputs/.
const baselineDirectory = process.argv.find(arg => arg.startsWith('--baseline-dir='))?.slice('--baseline-dir='.length);
const baselineFiles = new Set(baselineDirectory ? await readdir(resolve(baselineDirectory)) : []);
await mkdir(output, { recursive: true });
let baseline = false;
const server = createServer(async (req, res) => {
  const file = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(root + sep)) return res.writeHead(403).end();
  try {
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream');
    let data = await readFile(file);
    if (extname(file) !== '.js') return res.end(data);
    data = data.toString();
    const name = file.split(sep).at(-1);
    if (baseline && baselineFiles.has(name)) {
      data = await readFile(resolve(baselineDirectory, name), 'utf8');
    }
    if (file.endsWith('minionTurn.js')) data = data.replace('    clearForcedInvisibleTargetAccuracy(attacker);', `
      if (attacker.__lostTargetOnce) { delete attacker.__lostTargetOnce; attacker.__lateTarget = () => resolve(defendingEntites[0]); return; }
      if (attacker.__throwTargetOnce) { delete attacker.__throwTargetOnce; throw Error('Injected target failure'); }
      clearForcedInvisibleTargetAccuracy(attacker);`);
    if (file.endsWith('vitals.js')) data = data.replace('    await combatDelay(Math.max(0, state.nextAt - combatNow()));', `
      if (attacker.__stallPhaseOnce) { delete attacker.__stallPhaseOnce; await new Promise(resolve => { attacker.__releasePhase = resolve; }); }
      else await combatDelay(Math.max(0, state.nextAt - combatNow()));`);
    if (file.endsWith('attackExecution.js')) data = data.replace('    if (!canPrepare()) return false;', `
      if (attacker.__throwPreparationOnce) { delete attacker.__throwPreparationOnce; throw Error('Injected preparation failure'); }
      if (!canPrepare()) return false;`);
    if (file.endsWith('loop.js')) data = data.replace('wait.lastTick = now;', `
      if (attacker.__throwCooldownOnce) { delete attacker.__throwCooldownOnce; throw Error('Injected cooldown failure'); }
      wait.lastTick = now;`);
    if (!baseline && file.endsWith('loop.js')) data = data
      .replace('continuityChecks.set(entity, timer);', 'continuityChecks.set(entity, timer); (window.__checksArmed ||= []).push(entity.id);')
      .replace('continuityChecks.delete(entity);', 'continuityChecks.delete(entity); (window.__checksRun ||= []).push(entity.id);')
      .replace('try { verifyCombatTurnStarts(); }', 'try { window.__startupChecks = (window.__startupChecks || 0) + 1; verifyCombatTurnStarts(); }');
    res.end(data);
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
      const side = i === 1 || i === 3 ? 'B' : 'A';
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
    window.actor = E.entites[0]; window.enemy = E.entites[1];
    window.R = await import("/js/combat/attackResolution.js"); window.F = await import("/js/combat/loop.js");
    window.T = await import("/js/combat/timeline.js"); window.recoveries = [];
    const warn = console.warn; console.warn = (...args) => { if (args[0] === '[CombatRecovery]') recoveries.push(args[1]); warn(...args); };
    window.editAttack = patch => R.updateEntityAttackDefinition(actor, actor.attackDetails[0], patch);
    window.applied = [];
    window.effect = (kind, duration) => Effects[kind](actor, {effectName: kind, effectDuration: duration, effectSlowPercent: 50, effectMinInterval: 0.2, effectMaxInterval: 0.2, effectPriorityWeight: 1, effectActivationWeight: 1}, enemy);
    window.attacksDone = 0;
    document.addEventListener('entityTurnCompleted', ({ detail }) => { if (detail.entityId === actor.id) attacksDone++; });
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

async function advanceAttack(page, before = null) {
  before ??= await page.evaluate(() => attacksDone);
  await page.waitForFunction(before => attacksDone > before, before, { timeout: 12000 });
}
try {
  const preserved = await fixture();
  await preserved.evaluate(async () => {
    window.Control = await import("/js/combat/control.js");
    window.Move = await Promise.all([import("/js/board/controller.js"), import("/js/rendering/boardElements.js")]).then(parts => Object.defineProperties({}, Object.fromEntries(parts.flatMap(part => Object.keys(part).map(key => [key, { enumerable: true, get: () => part[key] }])))));
    window.Drag = await import("/js/board/interaction.js");
    editAttack({ preparationTime: 8000, executionTime: 100, recoveryTime: 100, cooldown: 40000 });
    const hex = document.createElement('div'); hex.id = 'hex_4'; hex.className = 'hex SideA';
    Object.assign(hex.dataset, { position: hex.id, row: '0', col: '3' });
    hex.innerHTML = '<div class="socle"></div>'; document.getElementById('hexGrid').append(hex);
    Move.invalidateFootprintGeometry(document.getElementById('hexGrid'));
    Drag.restoreEntityDragAndDrop();
    window.dropActor = position => {
      const transfer = new DataTransfer(); transfer.setData('text', `Box_Entite_${actor.id}`);
      document.getElementById(position).dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
      return actor.position === position;
    };
    window.hitActor = () => Damage.applyDamage(actor, 5, enemy, {
      ...enemy.attackDetails[0], launchContextId: 'preservation-hit', forceDamageSources: { physical: 5 },
    }, { physical: 5 });
    window.readCooldown = () => R.describeAttackChoices(actor, actor.attackDetails, attack => attack.cooldown)[0];
    G.startGame();
  });
  await preserved.waitForFunction(() => actor._combatAction?.stage === 'preparation'
    && actor._combatAction.preparation.progress >= actor._combatAction.timings.preparationTime * 0.6);
  assert.ok(await preserved.evaluate(() => {
    window.preservedAction = actor._combatAction; window.preservedPreparation = preservedAction.preparation;
    window.preservedTurn = actor.turnCount; window.preservedReadyAt = readCooldown().readyAt;
    window.progressBeforeMove = preservedPreparation.progress;
    const hp = actor.stats.HP.current;
    R.notifyAttackSelection(actor); // Also exercise an already pending recovery check.
    hitActor();
    return actor.stats.HP.current < hp && dropActor('hex_4') && actor._combatAction === preservedAction
      && preservedAction.preparationRecoils?.some(recoil => recoil.percent > 0);
  }));
  await preserved.waitForTimeout(150);
  assert.ok(await preserved.evaluate(() => actor._combatAction === preservedAction
    && preservedAction.preparation === preservedPreparation && preservedPreparation.progress > 0
    && preservedPreparation.progress < progressBeforeMove && readCooldown().readyAt === preservedReadyAt));
  checks.push('A real hit and manual movement keep the same preparation; only the existing movement recoil reduces progress');
  await preserved.waitForTimeout(2200);
  assert.ok(await preserved.evaluate(() => actor._combatAction === preservedAction && actor.turnCount === preservedTurn
    && readCooldown().readyAt === preservedReadyAt && recoveries.length === 0));
  checks.push('An already pending recovery check never resets a normally advancing preparation or its attack cooldown');

  assert.ok(await preserved.evaluate(() => {
    window.preStunChecks = window.__checksRun?.length || 0;
    effect('stun', 4); hitActor();
    return Move.swapEntitiesFromEffect(enemy, actor, E.entites[2], { type: [], effectMovementRecoilPercent: 20 });
  }));
  await preserved.waitForTimeout(150);
  const stunnedProgress = await preserved.evaluate(() => preservedPreparation.progress);
  assert.ok(stunnedProgress > 0);
  await preserved.waitForTimeout(2300);
  assert.ok(await preserved.evaluate(() => Control.isEntityActionPaused(actor) && actor._combatAction === preservedAction
    && actor._combatAction.preparation === preservedPreparation && actor.turnCount === preservedTurn
    && readCooldown().readyAt === preservedReadyAt && recoveries.length === 0
    && (window.__checksRun?.length || 0) > preStunChecks));
  assert.equal(await preserved.evaluate(() => preservedPreparation.progress), stunnedProgress);
  checks.push('Hits and a forced movement under a four-second stun preserve preparation identity/progress, turn and cooldown; no recovery');
  await preserved.waitForFunction(progress => !Control.isEntityActionPaused(actor)
    && actor._combatAction === preservedAction && preservedPreparation.progress > progress, stunnedProgress);
  checks.push('After stun expiry, the same preparation continues from its retained progress');

  await preserved.waitForFunction(() => actor.currentPhase === 'cooldown-wait', null, { timeout: 15000 });
  assert.ok(await preserved.evaluate(() => {
    window.cooldownTurn = actor.turnCount; window.cooldownBefore = readCooldown();
    const hp = actor.stats.HP.current;
    R.notifyAttackSelection(actor);
    for (let i = 0; i < 20; i++) hitActor();
    return actor.stats.HP.current < hp && dropActor('hex_4');
  }));
  await preserved.waitForTimeout(2300);
  assert.ok(await preserved.evaluate(() => {
    const cooldown = readCooldown();
    return actor.currentPhase === 'cooldown-wait' && !actor._combatAction && actor.turnCount === cooldownTurn
      && cooldown.readyAt === cooldownBefore.readyAt && cooldown.readyAt === preservedReadyAt
      && cooldown.remaining < cooldownBefore.remaining - 2000 && recoveries.length === 0;
  }));
  checks.push('Twenty real hits and manual movement during cooldown keep its exact deadline and the same waiting turn');
  await preserved.evaluate(() => { effect('stun', 4); hitActor(); dropActor('hex_2'); });
  await preserved.waitForTimeout(2300);
  assert.ok(await preserved.evaluate(() => Control.isEntityActionPaused(actor) && actor.currentPhase === 'cooldown-wait'
    && !actor._combatAction && actor.turnCount === cooldownTurn && readCooldown().readyAt === preservedReadyAt
    && recoveries.length === 0));
  await preserved.waitForFunction(() => !Control.isEntityActionPaused(actor));
  assert.ok(await preserved.evaluate(() => actor.currentPhase === 'cooldown-wait'
    && readCooldown().readyAt === preservedReadyAt && actor.turnCount === cooldownTurn && recoveries.length === 0));
  checks.push('Stun plus hits/movement during cooldown neither restarts the turn nor postpones the cooldown deadline');
  await preserved.evaluate(() => G.StopGame({ preserveScene: true }));
  await preserved.close();

  const page = await fixture(4);
  await select(page);
  await page.evaluate(() => G.startGame());
  await page.waitForFunction(() => actor._combatAction?.stage === 'preparation');
  await page.evaluate(() => {
    window.firstAction = actor._combatAction;
    window.oldDraft = JSON.parse(JSON.stringify(actor));
    effect('stun', 3);
    window.controlBefore = actor.controlIntervals;
    Admin.applyAdminLiveEntityDraft(actor, oldDraft);
  });
  await page.waitForTimeout(2300);
  assert.ok(await page.evaluate(() => actor._combatAction === firstAction && actor.controlIntervals === controlBefore && recoveries.length === 0));
  await advanceAttack(page, 0);
  checks.push('Stun preserves the same preparation and admin control intervals; its expiry resumes combat');
  for (const kind of ['silence', 'sommeil', 'bafouillage', 'lenteur', 'insolence', 'folie']) {
    await page.waitForFunction(() => actor._combatAction?.stage === 'preparation');
    const before = await page.evaluate(kind => { effect(kind, 0.6); return attacksDone; }, kind);
    await advanceAttack(page, before);
    assert.equal(await page.evaluate(() => recoveries.length), 0, `${kind} must resume naturally`);
    checks.push(`${kind}: application and expiry keep the turn cycle alive`);
  }
  // A draft containing an old control cannot revive it after its removal.
  await page.evaluate(() => { effect('stun', 0.3); window.expiredDraft = JSON.parse(JSON.stringify(actor)); });
  await page.waitForTimeout(500);
  assert.ok(await page.evaluate(async () => {
    Admin.applyAdminLiveEntityDraft(actor, expiredDraft);
    return !(await import("/js/combat/control.js")).isEntityActionPaused(actor);
  }));
  checks.push('An old admin draft cannot reapply an expired control');

  await page.waitForFunction(() => actor._combatAction?.stage === 'preparation');
  const beforeChange = await page.evaluate(async () => {
    window.previousAction = actor._combatAction;
    const I = await import("/js/items/essenceInventory.js");
    const item = I.createLinkedEssenceItem(actor.id, 'blue', { origin: 'admin-test' });
    actor.attackEssenceInventory.linkedItems.push(item);
    const slots = [{ ...actor.attackDetails[0].essenceSlots[0], color: 'blue', active: true,
      essenceId: item.id, essenceSource: 'linked', linkedColor: 'blue' }];
    editAttack({ essenceSlots: slots, physicalRatio: 0, magicalRatio: 1 });
    return attacksDone;
  });
  await page.waitForFunction(() => actor._combatAction && actor._combatAction !== previousAction
    && actor._combatAction.attack.attacknature.includes('magicalDamage'));
  await advanceAttack(page, beforeChange);
  checks.push('Changing nature during preparation selects the updated attack without losing the turn loop');

  await page.waitForFunction(() => actor._combatAction?.stage === 'preparation');
  await page.evaluate(() => R.setAttackEnabled(actor, actor.attackDetails, R.attackSelectionKey(actor.attackDetails[0]), false));
  await page.waitForFunction(() => !actor._combatAction);
  await page.waitForTimeout(2600);
  assert.equal(await page.evaluate(() => recoveries.length), 0, 'Disabled attacks use normal target search, not resets');
  const beforeEnable = await page.evaluate(() => {
    R.setAttackEnabled(actor, actor.attackDetails, R.attackSelectionKey(actor.attackDetails[0]), true);
    return attacksDone;
  });
  await advanceAttack(page, beforeEnable);
  checks.push('Disabling every attack enters normal search; re-enabling wakes selection');

  await page.waitForFunction(() => actor._combatAction?.stage === 'preparation');
  await page.evaluate(() => {
    const target = E.entites.find(e => e.id === actor._combatAction.target.entity);
    window.converted = target; window.beforeRetarget = attacksDone;
    target.side = 'A'; R.notifyAttackSelection(target);
  });
  await page.waitForFunction(() => actor._combatAction?.target?.entity && actor._combatAction.target.entity !== converted.id);
  await advanceAttack(page, await page.evaluate(() => beforeRetarget));
  assert.equal(await page.evaluate(() => recoveries.length), 0);
  checks.push('Target allegiance change revalidates preparation and selects a valid opponent');

  await page.evaluate(async () => { R.notifyAttackSelection(actor); await P.pauseCombat(); });
  const frozen = await page.evaluate(() => ({ now: Clock.clockNow(), turns: actor.turnCount, resets: recoveries.length, checks: window.__checksRun?.length || 0 }));
  await page.waitForTimeout(2300);
  assert.deepEqual(await page.evaluate(() => ({ now: Clock.clockNow(), turns: actor.turnCount, resets: recoveries.length, checks: window.__checksRun?.length || 0 })), frozen);
  await page.waitForFunction(async () => { await P.resumeCombat(); return !Clock.isCombatPaused(); });
  await advanceAttack(page);
  checks.push('Pending event checks freeze with tactical pause and resume without resetting healthy entities');
  await page.waitForTimeout(2500);
  const checksBefore = await page.evaluate(() => [window.__checksArmed?.length || 0, window.__checksRun?.length || 0, window.__startupChecks || 0]);
  await page.waitForTimeout(3000);
  assert.deepEqual(await page.evaluate(() => [window.__checksArmed?.length || 0, window.__checksRun?.length || 0, window.__startupChecks || 0]), checksBefore);
  checks.push('Normal turns and cooldown starts schedule zero continuity checks; startup checks never repeat in the background');
  await page.evaluate(() => G.StopGame({ preserveScene: true }));
  await page.close();

  const faults = await fixture();
  await faults.evaluate(() => { editAttack({ preparationTime: 500, recoveryTime: 100 }); actor.__lostTargetOnce = true; G.startGame(); });
  await faults.waitForFunction(() => actor.__lateTarget);
  await advanceAttack(faults, 0);
  assert.equal(await faults.evaluate(() => recoveries.length), 0);
  const completed = await faults.evaluate(() => { actor.__lateTarget(); return attacksDone; });
  await faults.waitForTimeout(100);
  assert.equal(await faults.evaluate(() => attacksDone), completed);
  checks.push('Missing targeting callback falls back within one second; late callback cannot duplicate an attack');
  await faults.evaluate(() => { actor.__throwTargetOnce = true; });
  await advanceAttack(faults);
  checks.push('Thrown targeting callback falls back to a valid target');

  await faults.evaluate(() => { actor.__throwPreparationOnce = true; window.beforeError = attacksDone; });
  await faults.waitForFunction(() => recoveries.some(e => e.reason === 'missing-turn'), null, { timeout: 8000 });
  await advanceAttack(faults, await faults.evaluate(() => beforeError));
  checks.push('An exception after combat startup triggers a new owned turn automatically');

  await faults.evaluate(() => { actor.__stallPhaseOnce = true; window.beforeStall = attacksDone; });
  await faults.waitForFunction(() => actor.__releasePhase);
  await faults.evaluate(() => { window.stalledTurn = actor.turnCount; window.resetsBeforeChange = recoveries.length; });
  await faults.waitForTimeout(3000);
  assert.equal(await faults.evaluate(() => recoveries.length), await faults.evaluate(() => resetsBeforeChange));
  assert.equal(await faults.evaluate(() => {
    const before = (window.__checksArmed || []).filter(id => id === actor.id).length;
    for (let i = 0; i < 50; i++) R.notifyAttackSelection(actor);
    return (window.__checksArmed || []).filter(id => id === actor.id).length - before;
  }), 1);
  checks.push('No periodic scan: a stuck phase is checked only after a change; 50 notifications merge into one entity check');
  await faults.waitForFunction(() => recoveries.some(e => e.reason === 'stalled-action'), null, { timeout: 8000 });
  assert.equal(await faults.evaluate(() => actor.turnCount), await faults.evaluate(() => stalledTurn), 'Recovery grants no extra turn/refill');
  await faults.waitForFunction(() => actor._combatAction?.stage === 'preparation');
  await faults.evaluate(() => { window.newAction = actor._combatAction; actor.__releasePhase(); });
  await faults.waitForTimeout(100);
  assert.ok(await faults.evaluate(() => actor._combatAction === newAction), 'Abandoned continuation cannot erase the new action');
  await advanceAttack(faults, await faults.evaluate(() => beforeStall));
  checks.push('Lost phase continuation recovers after its event check; late completion cannot overwrite the new turn');

  await faults.evaluate(() => { editAttack({ cooldown: 6000 }); window.beforeCooldownError = recoveries.length; });
  await faults.waitForFunction(() => actor.currentPhase === 'cooldown-wait');
  await faults.evaluate(() => { actor.__throwCooldownOnce = true; window.beforeCooldownAttack = attacksDone; });
  await faults.waitForFunction(() => recoveries.length > beforeCooldownError, null, { timeout: 8000 });
  await advanceAttack(faults, await faults.evaluate(() => beforeCooldownAttack));
  checks.push('An exception in a scheduled cooldown tick releases the wait and recovers without an unhandled rejection');

  await faults.evaluate(() => { actor.battleStopped = true; window.beforeExplicitStop = recoveries.length; });
  await faults.waitForTimeout(3000);
  assert.equal(await faults.evaluate(() => recoveries.length), await faults.evaluate(() => beforeExplicitStop));
  checks.push('An explicitly stopped entity stays stopped; recovery is reserved for unexplained stalls');

  await faults.evaluate(() => {
    G.StopGame({ preserveScene: true }); window.resetCount = recoveries.length;
  });
  await faults.waitForTimeout(2500);
  assert.equal(await faults.evaluate(() => recoveries.length), await faults.evaluate(() => resetCount));
  checks.push('Stopping the battle cancels all automatic recoveries');
  const recoveries = await faults.evaluate(() => window.recoveries);
  await faults.close();

  const interactions = await fixture();
  await interactions.evaluate(async () => {
    window.Move = await Promise.all([import("/js/board/controller.js"), import("/js/rendering/boardElements.js")]).then(parts => Object.defineProperties({}, Object.fromEntries(parts.flatMap(part => Object.keys(part).map(key => [key, { enumerable: true, get: () => part[key] }])))));
    await import("/js/board/interaction.js");
    editAttack({ preparationTime: 500, recoveryTime: 100 });
    window.hit = () => Damage.applyDamage(actor, 5, enemy, {
      ...enemy.attackDetails[0], launchContextId: 'continuity-hit', forceDamageSources: { physical: 5 },
    }, { physical: 5 });
    window.healActor = () => Damage.applyDamage(actor, 10, E.entites[2], {
      ...E.entites[2].attackDetails[0], combatFunction: 'Support', attacknature: ['magicalDamage'],
      attackTarget: ['ally'], launchContextId: 'continuity-heal',
    });
    G.startGame();
  });
  await interactions.waitForFunction(() => actor._combatAction?.stage === 'preparation');
  assert.deepEqual(await interactions.evaluate(() => {
    const armed = window.__checksArmed?.length || 0, hp = actor.stats.HP.current;
    hit(); const damaged = actor.stats.HP.current < hp;
    const wounded = actor.stats.HP.current; healActor();
    return { damaged, healed: actor.stats.HP.current > wounded, extraChecks: (window.__checksArmed?.length || 0) - armed };
  }), { damaged: true, healed: true, extraChecks: 0 });
  checks.push('Actual damage and healing on a healthy entity allocate no recovery timers');
  async function stallInteraction() {
    await interactions.evaluate(() => {
      delete actor.__releasePhase; actor.__stallPhaseOnce = true;
      window.interactionResets = recoveries.length; window.interactionAttacks = attacksDone;
    });
    await interactions.waitForFunction(() => actor.__releasePhase);
    await interactions.waitForTimeout(2600);
    assert.ok(await interactions.evaluate(() => recoveries.length === interactionResets));
  }
  async function recoveredInteraction(trigger) {
    await interactions.waitForFunction(trigger => recoveries.length > interactionResets
      && recoveries.at(-1).trigger === trigger, trigger, { timeout: 8000 });
    await advanceAttack(interactions, await interactions.evaluate(() => interactionAttacks));
    await interactions.evaluate(() => { actor.__releasePhase(); delete actor.__releasePhase; });
  }
  await stallInteraction();
  assert.equal(await interactions.evaluate(() => {
    const armed = window.__checksArmed?.length || 0;
    for (let i = 0; i < 50; i++) hit();
    return (window.__checksArmed?.length || 0) - armed;
  }), 1);
  await recoveredInteraction('received-action');
  checks.push('A silent stall recovers after a real hit; 50 hits coalesce into one check');
  await stallInteraction();
  await interactions.evaluate(() => healActor());
  await recoveredInteraction('healing');
  checks.push('Receiving a real heal also recovers a silent stall');
  await stallInteraction();
  assert.ok(await interactions.evaluate(() => {
    const position = actor.position;
    return Move.swapEntitiesFromEffect(enemy, actor, E.entites[2], { type: [], effectMovementRecoilPercent: 0 })
      && actor.position !== position;
  }));
  await recoveredInteraction('movement');
  checks.push('A real forced swap triggers recovery only for the stalled entity');
  await stallInteraction();
  assert.ok(await interactions.evaluate(async () => {
    await P.pauseCombat();
    const hex = document.createElement('div'); hex.id = 'hex_4'; hex.className = 'hex SideA';
    Object.assign(hex.dataset, { position: hex.id, row: '0', col: '3' });
    hex.innerHTML = '<div class="socle"></div>'; document.getElementById('hexGrid').append(hex);
    Move.invalidateFootprintGeometry(document.getElementById('hexGrid'));
    (await import("/js/board/interaction.js")).restoreEntityDragAndDrop();
    const transfer = new DataTransfer(); transfer.setData('text', `Box_Entite_${actor.id}`);
    hex.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    return actor.position === 'hex_4';
  }));
  await interactions.waitForTimeout(2300);
  assert.ok(await interactions.evaluate(() => recoveries.length === interactionResets));
  await interactions.evaluate(() => P.resumeCombat());
  await recoveredInteraction('movement');
  checks.push('A real manual drop during tactical pause triggers recovery after resuming, never during pause');
  await interactions.evaluate(() => G.StopGame({ preserveScene: true }));
  await interactions.close();

  const long = await fixture();
  await long.evaluate(() => { editAttack({ attackRange: ['melee'], preparationTime: 100, executionTime: 4000, recoveryTime: 100 }); G.startGame(); });
  await long.waitForFunction(() => actor._combatAction?.stage === 'transport');
  await long.evaluate(() => R.notifyAttackSelection(actor));
  await long.waitForTimeout(2600);
  assert.ok(await long.evaluate(() => actor._combatAction?.stage === 'transport' && recoveries.length === 0));
  await advanceAttack(long, 0);
  checks.push('A legitimate long melee execution is not mistaken for a frozen entity');
  await long.evaluate(() => G.StopGame({ preserveScene: true }));
  await long.close();

  // The real virtual-time engine must retain normal combat outcomes, not only
  // recover the injected failures. Same board and random seeds before/after.
  const simulations = [];
  if (baselineDirectory) {
  const simulation = await fixture(2);
  await simulation.evaluate(async () => {
    window.Sim = await import("/js/debug/simulation.js");
    for (const e of E.entites) {
      Object.assign(e.baseStats, { HP: 160, speed: 500, physicalDamage: 18, magicalDamage: 18,
        astrality: 10, strength: 10, intelligence: 10, agility: 10 });
      E.recomputeEntityStats(e); e.stats.HP.current = e.stats.HP.max;
      R.updateEntityAttackDefinition(e, e.attackDetails[0], { preparationTime: 200, executionTime: 250,
        recoveryTime: 200, cooldown: 800, effets: e.side === 'A' ? ['stun'] : ['silence'],
        effectOverrides: { stun: { effectDuration: 0.3 }, silence: { effectDuration: 0.3 } } });
    }
    window.snapshot = Sim.captureSimulationBoard();
  });
  const metrics = trial => ({ end: trial.end, winner: trial.winner, duration: trial.durationMs,
    entities: trial.entities.map(e => ({ id: e.id, damage: e.damage, healing: e.healing, deaths: e.deaths,
      hp: e.finalStats.HP, turns: e.turns, details: e.details })) });
  for (let seed = 800; seed < 810; seed++) {
    baseline = true;
    const before = await simulation.evaluate(seed => Sim.simulateTrial(snapshot, { seed, durationMs: 30000, trace: false }), seed);
    baseline = false;
    const after = await simulation.evaluate(seed => Sim.simulateTrial(snapshot, { seed, durationMs: 30000, trace: false }), seed);
    assert.deepEqual(metrics(after), metrics(before), `Seed ${seed}: normal combat keeps the same result`);
    simulations.push({ seed, durationMs: after.durationMs, winner: after.winner,
      beforeSteps: before.steps, afterSteps: after.steps, beforeMs: before.timings.combatMs, afterMs: after.timings.combatMs });
  }
  checks.push('20 real simulations: ten identical seeded comparisons retain outcomes, damage, healing and survival before/after');
  await simulation.close();
  }

  const expected = errors.filter(error => /Injected (preparation|cooldown) failure/.test(error));
  assert.equal(expected.length, 2);
  assert.deepEqual(errors.filter(error => !expected.includes(error)), []);
  await writeFile(resolve(output, 'validation.json'), JSON.stringify({ checks, recoveries, simulations, expectedErrors: expected }, null, 2));
  console.log(JSON.stringify({ checks, recoveries, expectedErrors: expected.length }, null, 2));
} finally { await browser.close(); await new Promise(done => server.close(done)); }
