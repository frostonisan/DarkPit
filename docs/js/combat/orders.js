import { finishOrderBar } from "../rendering/timers.js";
import { registerCombatState, waitForCombatResume, isCombatPaused, isCombatInteractionBlocked, notifyCombatAction, setTimeout, clearTimeout } from "./clock.js";
import { entites, RemoveEntite } from "../entities/runtime.js";
import { runPhaseTimer } from "./vitals.js";
import { isEntityMovementBlocked, waitForEntityMovement, getOriginalCombatSide } from "./control.js";
import { setOrderSide, gameStarted, isBattleFinished, checkGameOver } from "../app/state.js";
import { settleSideCombatTurns, entiteTurn } from "./loop.js";
import { readAttackDefinitionsForEntity, attackSelectionKey, subscribeAttackSelection } from './attackResolution.js';
import { attackDetails } from "../data/attackList.js";
import {
  RunawayAnimation,
  orderAnimation,
  runawayInfosBulle,
} from "../rendering/animations.js";
import { battleLogs } from "./journal.js";
import { getSafe } from "../entities/rules.js";
import { recordEntityCombatAmount, endEntityBattleRole } from "../storage/entityStorage.js";
import { showGamePopupMessage } from "../ui/display.js";

// Durée commune de la réaction visuelle aux ordres et au réveil d'une
// attaque surprise. Modifier cette valeur met à jour les deux systèmes.
export const ORDER_DECISION_DURATION = 2000;

export const fledEntities = [];
// Variables globales entites fuites 
let remainingRunaways = 0;
let successfulRunaways = 0;
let totalRunawayCandidates = 0;
let enemyRunaway = null;
let pendingPlayerOrder = null;
let playerOrder = null;
let attackSelectionSubscribed = false;
const pendingRunawayNotices = new Set();
let runawayNoticeTimer = null;
const runawayNoticePanels = new Set();

function clearRunawayNotices() {
    clearTimeout(runawayNoticeTimer);
    runawayNoticeTimer = null;
    pendingRunawayNotices.clear();
    for (const panel of runawayNoticePanels) panel?.closest('.game-popup-layer')?.remove();
    runawayNoticePanels.clear();
}

function announceRunaway(entity) {
    pendingRunawayNotices.add(entity);
    if (runawayNoticeTimer !== null) return;
    // Group near-simultaneous departures. A terminal departure is announced
    // by the battle outcome instead, and cancels these partial notifications.
    runawayNoticeTimer = setTimeout(() => {
        runawayNoticeTimer = null;
        const escaped = [...pendingRunawayNotices];
        pendingRunawayNotices.clear();
        if (isBattleFinished()) return;
        for (const side of new Set(escaped.map(getOriginalCombatSide))) {
            const names = escaped.filter(entity => getOriginalCombatSide(entity) === side)
                .map(entity => entity.nickname || entity.name || 'Une entité');
            const message = `${new Intl.ListFormat('fr', { type: 'conjunction' }).format(names)} ${names.length > 1 ? 'ont' : 'a'} pris la fuite !`;
            for (const panel of runawayNoticePanels) if (!panel?.isConnected) runawayNoticePanels.delete(panel);
            runawayNoticePanels.add(showGamePopupMessage({ key: `runaway-${side}`, message }));
        }
    }, 50);
}

function removeSuccessfulRunaway(entity) {
    entity.hasFled = true;
    endEntityBattleRole(entity);
    fledEntities.push(entity);
    battleLogs('runaway_success', { entity });
    RemoveEntite(entity, 'runaway');
    announceRunaway(entity);
}

export function getPlayerOrderType() {
    return pendingPlayerOrder?.orderType || playerOrder?.orderType || null;
}
function refreshOrderControls() {
    window.dispatchEvent(new Event('battleActionContextChanged'));
    notifyCombatAction();
}
const cycleFor = entity => entity.side === 'B' ? enemyRunaway : playerOrder;

export function isEnemyFleeing(entity) {
    return entity?.side === 'B' && enemyRunaway?.candidates.has(entity) === true
        && !entity.hasFled && !isEntityAlreadyDead(entity);
}

export function hasEnemyOffensiveSpell(entityList = entites) {
    return entityList.some(entity => entity?.side === 'B' && !entity.hasFled && !isEntityAlreadyDead(entity)
        && readAttackDefinitionsForEntity(entity, attackDetails).some(attack =>
            attack.combatFunction === 'Attaquant'
            && attack.attackTarget.some(target => target === 'enemy' || target === 'hexa')
            && entity.attackSelection?.disabled?.[attackSelectionKey(attack)] !== true));
}

export function tryEnemyRunaway(entityList = entites) {
    if (!gameStarted || isBattleFinished() || enemyRunaway) return false;
    const living = entityList.filter(entity => !entity.hasFled && !isEntityAlreadyDead(entity));
    const candidates = living.filter(entity => entity.side === 'B');
    if (!candidates.length || !living.some(entity => entity.side === 'A') || hasEnemyOffensiveSpell(living)) return false;
    const cycle = enemyRunaway = { candidates: new Set(candidates) };
    battleLogs('runaway_order_launched', { side: 'B' });
    // Mark the order first, then let interrupted attacks release their own timers.
    // Only B changes orders; A continues attacking while B attempts to escape.
    void settleSideCombatTurns('B').then(async () => {
        if (enemyRunaway !== cycle || !gameStarted || isBattleFinished()) return;
        await Promise.all(candidates.filter(entity => !isEntityAlreadyDead(entity))
            .map(entity => startOrderCycle(entity, 'runaway')));
    }).catch(error => console.error('Fuite ennemie :', error));
    return true;
}

window.addEventListener('battleStarted', () => {
    clearRunawayNotices();
    enemyRunaway = null; pendingPlayerOrder = null; playerOrder = null;
    for (let i = fledEntities.length - 1; i >= 0; i--) if (fledEntities[i]?.side === 'B') fledEntities.splice(i, 1);
    if (!attackSelectionSubscribed) {
        attackSelectionSubscribed = true;
        subscribeAttackSelection(entity => {
            if (entity?.side === 'B' && gameStarted) queueMicrotask(() => checkGameOver());
        });
    }
});
for (const event of ['battleStopped', 'battleResolved', 'stageInterfaceClosing']) {
    window.addEventListener(event, () => { clearRunawayNotices(); enemyRunaway = null; pendingPlayerOrder = null; playerOrder = null; });
}

function orderCanContinue(entity, cycle) {
    return !isEntityAlreadyDead(entity) && !entity.hasFled && !entity.battleStopped
        && (entity.side !== 'A' || playerOrder === cycle)
        && (entity.side !== 'B' || (enemyRunaway === cycle && isEnemyFleeing(entity) && gameStarted && !isBattleFinished()));
}

function finishInterruptedOrder(entity, cycle) {
    // A casualty still completes its player-side order, so surviving allies can
    // finish a partial escape. Enemy orders are resolved by checkGameOver.
    if (entity.side === 'A' && cycle === playerOrder && cycle?.orderType === 'runaway' && isEntityAlreadyDead(entity)) {
        remainingRunaways -= 1;
        checkRunawayEnd();
    }
}

function isEntityAlreadyDead(entite) {
    return entite?.isDEAD === true
        || entite?.statut?.includes?.('dead')
        || Number(entite?.stats?.HP?.current ?? 0) <= 0;
}

window.addEventListener('combatResumed', () => {
    const pending = pendingPlayerOrder;
    pendingPlayerOrder = null;
    if (pending && gameStarted && !isBattleFinished()) void beginPlayerOrder(pending.side, pending.orderType);
});
export async function launchOrderCycleForSide(side, orderType) {
    if (isCombatInteractionBlocked() || !gameStarted || isBattleFinished()) return false;
    if (side !== 'A' || !['runaway', 'cancelrunaway'].includes(orderType)) return false;
    const current = getPlayerOrderType();
    if (orderType === 'cancelrunaway' ? current !== 'runaway' : current !== null) return false;
    // A queued flee has never reached the entities: discard it without issuing
    // another order or interrupting their saved actions and gauges.
    if (orderType === 'cancelrunaway' && pendingPlayerOrder?.orderType === 'runaway') {
        pendingPlayerOrder = null;
        refreshOrderControls();
        return true;
    }
    if (isCombatPaused()) {
        pendingPlayerOrder = { side, orderType };
        refreshOrderControls();
        return true;
    }
    return beginPlayerOrder(side, orderType);
}

async function beginPlayerOrder(side, orderType) {
    const candidates = entites.filter(e => e.side === side && !e.hasFled && !isEntityAlreadyDead(e));
    if (!candidates.length) return false;
    const previous = playerOrder;
    const cycle = playerOrder = { side, orderType, candidates: new Set(candidates), started: false };
    setOrderSide(side);
    refreshOrderControls();
    cycle.task = runPlayerOrder(cycle, previous?.task);
    await cycle.task;
    return true;
}

async function runPlayerOrder(cycle, previousTask = null, restored = false) {
    // Invalidate the previous order before waiting for its timers/attacks to
    // release the entity. Only this army is interrupted; enemies keep fighting.
    if (restored) await waitForCombatResume();
    await Promise.all([previousTask, settleSideCombatTurns(cycle.side)]);
    if (playerOrder !== cycle || !gameStarted || isBattleFinished()) return;
    const candidates = [...cycle.candidates].filter(e => entites.includes(e) && !e.hasFled && !isEntityAlreadyDead(e));
    const resume = restored && cycle.started;
    cycle.started = true;
    if (!resume && cycle.orderType === 'runaway') {
        battleLogs('runaway_order_launched');
        remainingRunaways = totalRunawayCandidates = candidates.length;
        successfulRunaways = 0;
    }
    await Promise.all(candidates.map(entity => resume
        ? restoreOrder(entity, cycle) : startOrderCycle(entity, cycle.orderType, cycle)));
    if (playerOrder !== cycle || !gameStarted || isBattleFinished() || cycle.orderType !== 'cancelrunaway') return;
    const survivors = entites.filter(e => e.side === cycle.side && !e.hasFled && !isEntityAlreadyDead(e));
    survivors.forEach(resetOrderActions);
    playerOrder = null;
    remainingRunaways = successfulRunaways = totalRunawayCandidates = 0;
    setOrderSide(null);
    refreshOrderControls();
    survivors.forEach(entity => { void entiteTurn(entity); });
}

function resetOrderActions(entity) {
    entity.stopOrderAnimation?.();
    for (const field of ['speedTimer', 'preparationTime', 'executionTime', 'recoveryTime', 'cooldownTimer',
        'orderExecutionTime', 'orderDecisionTimer', 'runawayLoopRecuperation', 'runawayLoopPreparation']) entity[field] = 0;
    for (const field of ['orderPhase', '_phaseTimer', '_resumePhaseTimer', '_resumeCombat', '_combatAction', '_turnStage', '_targetSearch']) delete entity[field];
    entity.hasResetOrderTimers = false;
    entity.isATBFull = false;
    entity.currentPhase = 'order';
    document.getElementById(`imgContainer_${entity.id}`)?.classList.remove('flip-horizontal');
    const sprite = document.getElementById(`DragSprite_${entity.id}`);
    sprite?.classList.remove('runaway', 'runaway-animate', 'order');
    sprite?.classList.add('iddle');
    document.querySelectorAll(`#effectsContainer_${entity.id} .runaway-info, #effectsContainer_${entity.id} .recoveryGif,
        #effectsContainer_${entity.id} .order-exclamation, #statusBar_${entity.id} .hudbattletexte.runaway`).forEach(node => node.remove());
}

export async function startOrderCycle(entite, orderType, cycle = cycleFor(entite)) {
    const canContinue = () => orderCanContinue(entite, cycle);
    if (!canContinue()) return;
    const speedTotal = Number(getSafe(entite, "speed", 1000)) || 1000;
    const speedRestant = entite.speedTimer || 0;
    let pourcentageRempli = Math.floor(((speedTotal - speedRestant) / speedTotal) * 100);

    console.log(`🔁 Cycle d'Ordre rejoint pour ${entite.name} (ID: ${entite.id})`);
    console.log(`⏳ [DEBUT] Jauge ATB à ${pourcentageRempli}% (${speedTotal - speedRestant}ms / ${speedTotal}ms)`);

    const phase = entite.currentPhase || 'inconnue';
    console.warn(`🚫 L'ordre "${orderType}" interrompt ${entite.name} pendant la phase : [${phase}]`);


    // Enregistrer la jauge actuelle avant l'ordre (si besoin ailleurs)
    entite.ATBfillBeforeOrder = ((speedTotal - speedRestant) / speedTotal) * 100;

    // Réinitialisation de la jauge après libération de l'ancien cycle.
    resetOrderActions(entite);
    entite.hasResetOrderTimers = true;

    // === PHASE 1 : Décision de l'ordre ===
    entite.orderPhase = 'orderDecision';
    entite.orderDecisionTimer = ORDER_DECISION_DURATION;
    entite.recoveryTime = entite.orderDecisionTimer;
    entite.maxRecoveryTime = entite.orderDecisionTimer;

    console.log(`🧠 [DEBUT] Phase "1" pour ${entite.name} (${entite.orderDecisionTimer}ms)`);
	orderAnimation(entite);
    if (await runPhaseTimer(entite, 'recoveryTime', entite.orderDecisionTimer, { canContinue }) === false) return finishInterruptedOrder(entite, cycle);
    if (orderType === 'cancelrunaway') {
        entite.orderPhase = 'orderCancelled';
        return;
    }
    console.log(`🧠 [FIN] Phase "1 Ordre" terminée pour ${entite.name}`);


    // === PHASE 2 : Exécution de l'ordre ===
    console.log(`🚀 ORDRE lancé pour ${entite.name} (ID: ${entite.id})`);
    console.log(`🕒 [DEBUT] Phase "2" (${speedTotal}ms)`);
entite.orderPhase = 'orderExecution';
entite.orderExecutionTime = speedTotal;
entite.maxOrderExecutionTime = speedTotal;

if (orderType === 'runaway') {
    RunawayAnimation(entite);
	runawayInfosBulle(entite, 'preparation');
}
const percentRempli = (entite.speedTimer || 0) / speedTotal;
const adjustedExecutionTime = speedTotal * (1 - percentRempli);
entite.orderExecutionTime = adjustedExecutionTime;
entite.maxOrderExecutionTime = entite.orderExecutionTime;

    if (await runPhaseTimer(entite, 'orderExecutionTime', adjustedExecutionTime, { canContinue }) === false) return finishInterruptedOrder(entite, cycle);

  console.log(`🕒 [DEBUT] Phase "2" (${speedTotal}ms) fin`);
    // Mise à jour visuelle forcée (au cas où)
    finishOrderBar(entite);

// === PHASE 3 : Execution ===
if (entite.orderPhase === 'orderExecution') {
	console.log(`🕒 [DEBUT] Phase "3" debut ${speedTotal}ms)`);
	
	// === CHOIX DE L'ORDRE ===
	if (orderType === 'runaway') {
		console.log(`🕒 [DEBUT] Phase "3" order type`); 
			
			return RunawayFunction(entite, cycle);
			}
		} else {console.warn(`⚠️ ${entite.name} n'est plus en phase de fuite au moment de déclencher la phase 3. Ignoré.`);
}}

async function attemptRunaway(entite) {
    const velocity = Number(getSafe(entite, "velocity", 0)) || 0;

    const roll = Math.random() * 100;
    const total = roll + velocity;
    const chance = globalThis.umbraProgression.retreatChance(velocity);

    console.log(`🎲 Jet de fuite pour ${entite.name} :`);
    console.log(`   ➤ Jet de base : ${roll.toFixed(2)}`);
    console.log(`   ➤ Bonus velocity : ${velocity}`);
    console.log(`   ➤ Total = ${total.toFixed(2)} (chance de fuite : ${chance.toFixed(2)} %)`);

    return chance >= 100 || roll > 100 - chance;
}

// Fear uses the ordinary flee roll/removal, without issuing an army-wide order.
export async function attemptEffectRunaway(entity) {
    if (isEntityAlreadyDead(entity) || entity.hasFled || entity.battleStopped || isBattleFinished() || isEntityMovementBlocked(entity)) return false;
    const success = await attemptRunaway(entity);
    if (isEntityAlreadyDead(entity) || entity.hasFled || entity.battleStopped || isBattleFinished()) return false;
    recordEntityCombatAmount(entity, 'fleeAttempts', 1);
    recordEntityCombatAmount(entity, success ? 'fleeSuccesses' : 'fleeFailures', 1);
    if (!success) return false;
    removeSuccessfulRunaway(entity);
    checkGameOver();
    return true;
}

export async function RunawayFunction(entite, cycle = cycleFor(entite)) {
    if (isEntityAlreadyDead(entite) || entite.hasFled) return;
    if (!orderCanContinue(entite, cycle)) return;
    if (isEntityMovementBlocked(entite) && !await waitForEntityMovement(entite, () => orderCanContinue(entite, cycle))) return;
    const success = await attemptRunaway(entite);
    if (isEntityAlreadyDead(entite) || entite.hasFled) return;
    if (!orderCanContinue(entite, cycle)) return;
    recordEntityCombatAmount(entite, 'fleeAttempts', 1);
    recordEntityCombatAmount(entite, success ? 'fleeSuccesses' : 'fleeFailures', 1);

    if (success) {
        console.log(`✅ ${entite.name} a réussi à fuir.`);
		runawayInfosBulle(entite, 'success'); 
        registerSuccessfulRunaway(entite);
    } else {
      console.warn(`❌ Fuite échouée pour ${entite.name}. Lancement de runawayLoop...`);
		battleLogs("runaway_fail", { entity: entite });
		runawayInfosBulle(entite, 'fail');
		await runawayLoop(entite, cycle);
    }
}



function registerSuccessfulRunaway(entite) {
    if (entite.isDEAD) {
        console.warn(`💀 ${entite.name} est déjà mort(e). Fuite ignorée.`);
        remainingRunaways -= 1;
        checkRunawayEnd();
        return;
    }

    console.log(`✅ ${entite.name} a réussi à fuir.`);
    if (getOriginalCombatSide(entite) === 'B') {
        removeSuccessfulRunaway(entite);
        checkGameOver();
        return;
    }
    successfulRunaways += 1;
    remainingRunaways -= 1;

    removeSuccessfulRunaway(entite);
    checkRunawayEnd();
}
function checkRunawayEnd() {
    if (isBattleFinished()) return;
    if (remainingRunaways <= 0 && successfulRunaways > 0) {
        battleLogs(successfulRunaways === totalRunawayCandidates ? 'battle_escape_total' : 'battle_escape_partial');
    }
    // The common verdict owns the return to the map, including mixed
    // departures caused by a player order, Effroi, and casualties. An Effroi
    // departure need not have completed its army-order counter to end combat.
    checkGameOver();
}

async function runawayLoop(entite, cycle) {
    const canContinue = () => orderCanContinue(entite, cycle);
	if (entite.isDEAD) {
    console.warn(`💀 ${entite.name} est mort(e) pendant la boucle de fuite.`);
    remainingRunaways -= 1;
    checkRunawayEnd();
    return;
}
    console.log(`♻️ Boucle de fuite pour ${entite.name} (ID: ${entite.id})`);

    // === PHASE 1 : Récupération (vidange ATB)
    const speedTotal = Number(getSafe(entite, "speed", 1000)) || 1000;
    entite.orderPhase = 'runawayRecovery';
    entite.runawayLoopRecuperation = speedTotal;
    entite.recoveryTime = entite.runawayLoopRecuperation;
    entite.maxRecoveryTime = entite.runawayLoopRecuperation;
    runawayInfosBulle(entite, 'fail');
    console.log(`⏳ Phase 1 [runawayRecovery] → ${entite.runawayLoopRecuperation}ms`);
    if (await runPhaseTimer(entite, 'recoveryTime', entite.runawayLoopRecuperation, { canContinue }) === false) return finishInterruptedOrder(entite, cycle);

    // === PHASE 2 : Préparation (remplissage ATB)
    entite.orderPhase = 'runawayPreparation';
    entite.runawayLoopPreparation = speedTotal;
    entite.preparationTime = entite.runawayLoopPreparation;
    entite.maxPreparationTime = entite.runawayLoopPreparation;
    entite.speedTimer = entite.runawayLoopPreparation;

    console.log(`⚙️ Phase 2 [runawayPreparation] → ${entite.runawayLoopPreparation}ms`);
    runawayInfosBulle(entite, 'preparation');
    if (await runPhaseTimer(entite, 'speedTimer', entite.runawayLoopPreparation, { canContinue }) === false) return finishInterruptedOrder(entite, cycle);

    // 🔴 Nettoyage manuel de l’infobulle "preparation"
    const prepInfo = document.querySelector(`#effectsContainer_${entite.id} .runaway-info.preparation`);
    if (prepInfo) prepInfo.remove();

    // === PHASE 3 : Exécution (tentative de fuite)
    entite.orderPhase = 'runawayExecution';
    entite.orderExecutionTime = speedTotal;
    entite.maxOrderExecutionTime = speedTotal;

    console.log(`🎯 Phase 3 [runawayExecution] → tentative de fuite`);
	if (entite.isDEAD) {
    console.warn(`💀 ${entite.name} est mort(e) juste avant une nouvelle tentative.`);
    remainingRunaways -= 1;
    checkRunawayEnd();
    return;
}
    return RunawayFunction(entite, cycle);
}

// Re-enter the saved phase; completed phases and flee rolls are not replayed.
async function restoreOrder(entity, cycle = cycleFor(entity)) {
    await waitForCombatResume();
    const canContinue = () => orderCanContinue(entity, cycle);
    if (!canContinue()) return;
    const speed = Number(getSafe(entity, 'speed', 1000)) || 1000;
    if (entity.orderPhase === 'orderDecision') {
        if (await runPhaseTimer(entity, 'recoveryTime', ORDER_DECISION_DURATION, { canContinue }) === false) return finishInterruptedOrder(entity, cycle);
        if (cycle?.orderType === 'cancelrunaway') {
            entity.orderPhase = 'orderCancelled';
            return;
        }
        entity.orderPhase = 'orderExecution';
    }
    if (entity.orderPhase === 'orderExecution') {
        RunawayAnimation(entity); runawayInfosBulle(entity, 'preparation');
        if (await runPhaseTimer(entity, 'orderExecutionTime', speed, { canContinue }) === false) return finishInterruptedOrder(entity, cycle);
    } else {
        if (entity.orderPhase === 'runawayRecovery') {
            if (await runPhaseTimer(entity, 'recoveryTime', speed, { canContinue }) === false) return finishInterruptedOrder(entity, cycle);
            entity.orderPhase = 'runawayPreparation';
        }
        if (entity.orderPhase === 'runawayPreparation') {
            runawayInfosBulle(entity, 'preparation');
            if (await runPhaseTimer(entity, 'speedTimer', speed, { canContinue }) === false) return finishInterruptedOrder(entity, cycle);
        }
    }
    if (cycle?.orderType !== 'cancelrunaway') return RunawayFunction(entity, cycle);
}
registerCombatState('orders', () => ({
    remainingRunaways, successfulRunaways, totalRunawayCandidates, pendingPlayerOrder,
    player: playerOrder ? { side: playerOrder.side, orderType: playerOrder.orderType,
        started: playerOrder.started, candidates: [...playerOrder.candidates].map(e => e.id) } : null,
    candidates: enemyRunaway ? [...enemyRunaway.candidates].map(e => e.id) : null,
    fled: fledEntities.map(e => e.id),
    active: entites.filter(e => e.orderPhase && !e.hasFled && !e.isDEAD).map(e => e.id),
}), (saved, { entities, removed = [] }) => {
    const find = id => [...entities, ...removed].find(e => e.id === id);
    pendingPlayerOrder = saved.pendingPlayerOrder || null;
    remainingRunaways = saved.remainingRunaways; successfulRunaways = saved.successfulRunaways;
    totalRunawayCandidates = saved.totalRunawayCandidates;
    enemyRunaway = saved.candidates ? { candidates: new Set(saved.candidates.map(find).filter(Boolean)) } : null;
    playerOrder = saved.player ? { ...saved.player, candidates: new Set(saved.player.candidates.map(find).filter(Boolean)) } : null;
    fledEntities.splice(0, fledEntities.length, ...saved.fled.map(find).filter(Boolean));
    for (const id of saved.active) {
        const entity = find(id); if (!entity) continue;
        entity._resumePhaseTimer = entity._phaseTimer;
        if (entity.side === 'B') void restoreOrder(entity);
    }
    if (playerOrder) playerOrder.task = runPlayerOrder(playerOrder, null, true);
    if (enemyRunaway && !saved.active.length) {
        void waitForCombatResume().then(() => settleSideCombatTurns('B')).then(() => {
            for (const entity of enemyRunaway?.candidates || []) if (!entity.hasFled && !entity.isDEAD) void startOrderCycle(entity, 'runaway');
        });
    }
});
