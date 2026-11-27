import { advanceCombatTimerState } from "./timerState.js";
import {
  updateEntityAttackTargetDisplay, presentMovementRefill, updateTimerDisplay,
} from "../rendering/hud.js";
import { refillEntityMovement } from "../board/deployment.js";
import { ensureAstralityEffects } from "./effects.js";
import {
  isEntityActionPaused, isEntityAsleep, getControlState, getCombatSide, getOriginalCombatSide,
  isCombatEnemy, isCharmedEnemyTarget, isEntitySilenced, waitForEntityControl, waitForEntitySilence,
  notifyPreparationInterrupted,
} from "./control.js";
import {
  setTimeout, clearTimeout, clockNow, registerCombatState, waitForCombatResume, isCombatPaused,
  combatTarget,
} from "./clock.js";
import { combatNow, combatDelay, atCombatStart, scheduleCombatTask, cancelCombatTask } from "./timeline.js";
import { gameStarted, checkGameOver, stopAllIntervals, OrderEntity, getOrderSide, isBattleFinished } from "../app/state.js";
import { createOrderButton, createQuitButton } from "../app/stages.js";
import { entites } from "../entities/runtime.js";
import { attackDetails } from "../data/attackList.js";
import {
  executeAttack, buildAttackTimingsWithHaste, cancelEntityAttackAction, getAttackTransportDeadline,
} from "./attackExecution.js";
import { acceptsSelectedTarget, isAttackEntityAlive } from "./targeting.js";
import { isHexTarget } from "../board/targets.js";
import { runPhaseTimer, runEntityRecovery, updateCurrentAttackDisplay } from "./vitals.js";
import { sbireEnemyTarget, sbireAllyTarget, invokerHexTarget } from "./minionTurn.js";
import { lordEnemyTarget } from "./lordTurn.js";
import { calculateHexes } from "../board/controller.js";
import { clearForcedInvisibleTargetAccuracy } from "./statistics.js";
import { getSafe, isLord, isNonLordCombatant } from "../entities/rules.js";
import { withStatReadSnapshot } from "../entities/statSystem.js";
import {
  saveEntityMovementState,
  saveEntityHPToStorage,
  applyHpBattleRegenAtTurnStart,
  recordEntityCombatProc,
  recordEntityCombatAmount,
} from "../storage/entityStorage.js";
import { battleLogs } from "./journal.js";
import { orderAnimation, pulseTargetSearchAtb, setTargetSearchVisual } from "../rendering/animations.js";
import { ORDER_DECISION_DURATION, isEnemyFleeing } from "./orders.js";
import { getSurprisedSide, releaseSurprisedSide } from "../events/runtime.js";
import {
  readAttackDefinitionsForEntity,
  clearExpiredEntityAttackModifiers,
  attackSelectionKey,
  describeAttackChoices,
  compareAttackChoices,
  predictNextAttack,
  commitAttackChoice,
  subscribeAttackSelection,
  resetAttackSelectionRuntime,
} from "./attackResolution.js";
import { createCooldownWaitView } from "../ui/attacks.js";

const TARGET_SEARCH_INTERVAL = 1000;
const targetSearchCycles = new Map();
const activeTurns = new Map();
const turnOwners = new Map();
const continuityChecks = new Map();
const recoveryAttempts = new WeakMap();
const attackRevisions = new WeakMap();
const STALLED_TURN_DELAY = 2000;
export function settleSideCombatTurns(side) {
    return Promise.allSettled([...activeTurns].filter(([entity]) => entity.side === side).map(([, task]) => task));
}
const cooldownWaits = new Map();
const surpriseWakeTimers = new Set();
const surpriseWaking = new Set();
const pendingTurnStarts = new Map();
const TURN_START_CHECK_DELAY = 500;
const MAX_TURN_START_RETRIES = 2;
let turnStartCheckTimer = null;
let combatEpoch = 0;

function clearTurnStartChecks() {
    clearTimeout(turnStartCheckTimer);
    turnStartCheckTimer = null;
    pendingTurnStarts.clear();
}

function stopBattleDecisions() {
    combatEpoch++;
    clearTurnStartChecks();
    for (const timer of surpriseWakeTimers) clearTimeout(timer);
    surpriseWakeTimers.clear();
    surpriseWaking.clear();
    for (const wait of cooldownWaits.values()) wait.cancel();
    for (const entity of entites) setTargetSearchVisual(entity, 'clear');
    targetSearchCycles.clear();
    activeTurns.clear();
    turnOwners.clear();
    clearContinuityChecks();
    resetAttackSelectionRuntime();
}
window.addEventListener('battleResolved', stopBattleDecisions);
window.addEventListener('battleStopped', stopBattleDecisions);
window.addEventListener('stageInterfaceClosing', stopBattleDecisions);

function scheduleTurnStartCheck() {
    if (!gameStarted || isBattleFinished() || !pendingTurnStarts.size || turnStartCheckTimer != null) return;
    turnStartCheckTimer = setTimeout(() => {
        turnStartCheckTimer = null;
        try { verifyCombatTurnStarts(); }
        catch (error) { console.error('[CombatRecovery]', error); }
    }, TURN_START_CHECK_DELAY);
}

window.addEventListener('battleStarted', () => {
    clearTurnStartChecks();
    clearContinuityChecks();
    for (const entity of entites) {
        recoveryAttempts.delete(entity);
        if (['A', 'B'].includes(entity.side) && isAttackEntityAlive(entity)) {
            pendingTurnStarts.set(entity, { attempts: 0, started: false, error: null });
        }
    }
    scheduleTurnStartCheck();
});

function clearContinuityChecks() {
    for (const timer of continuityChecks.values()) {
        if (typeof timer === 'object') cancelCombatTask(timer);
        else clearTimeout(timer);
    }
    continuityChecks.clear();
}

function combatProgressSignature(entity) {
    const action = entity._combatAction;
    return [entity._turnStage, action?.stage, action?.preparation?.lastTick,
        entity._phaseTimer?.lastTick, entity._targetSearch?.nextProbe, entity._targetSearch?.attempts,
        cooldownWaits.get(entity)?.lastTick, getAttackTransportDeadline(entity), turnOwners.get(entity)?.startedAt].join('|');
}

// A risky mutation or an interrupted loop schedules ONE check for its entity.
// No interval, army scan or rearming after a successful check.
function requestCombatContinuityCheck(entity, trigger) {
    if (!gameStarted || isBattleFinished() || !entites.includes(entity) || !isAttackEntityAlive(entity) || entity.hasFled) return;
    if (trigger !== 'interrupted-turn') recoveryAttempts.delete(entity);
    if (continuityChecks.has(entity) || (recoveryAttempts.get(entity) || 0) >= 2) return;
    const signature = combatProgressSignature(entity), epoch = combatEpoch;
    let deferredForBacklog = false;
    let timer = setTimeout(verifyContinuity, STALLED_TURN_DELAY);
    continuityChecks.set(entity, timer);
    function verifyContinuity() {
        if (continuityChecks.get(entity) !== timer) return;
        // A browser callback can overtake a healthy, delayed combat batch.
        // Only in that case defer this one check into logical combat time.
        // Ordinary checks keep their original deadline and event ordering.
        if (!deferredForBacklog && clockNow() - combatNow() > 50) {
            deferredForBacklog = true;
            timer = scheduleCombatTask(verifyContinuity, STALLED_TURN_DELAY);
            continuityChecks.set(entity, timer);
            return;
        }
        continuityChecks.delete(entity);
        if (epoch !== combatEpoch || !gameStarted || isBattleFinished() || isCombatPaused()
            || !entites.includes(entity) || !isAttackEntityAlive(entity) || entity.hasFled) return;
        // Control removal emits a fresh event; do not poll while it is active.
        if (entity.battleStopped || entity.isSurprised || entity.side === getSurprisedSide() || surpriseWaking.has(entity)
            || getOrderSide() === entity.side || isEnemyFleeing(entity) || entity.orderPhase
            || isEntityActionPaused(entity) || isEntitySilenced(entity) || getControlState(entity, 'effroi')) return;
        if (!entites.some(other => getOriginalCombatSide(other) !== getOriginalCombatSide(entity)
            && isAttackEntityAlive(other) && !other.hasFled)) return;
        try {
            if (activeTurns.has(entity) && (signature !== combatProgressSignature(entity)
                || getAttackTransportDeadline(entity) > combatNow())) {
                recoveryAttempts.delete(entity);
                return;
            }
            const diagnostic = { entityId: entity.id, phase: entity.currentPhase, trigger,
                reason: activeTurns.has(entity) ? 'stalled-action' : 'missing-turn' };
            resetBlockedTurn(entity);
            recoveryAttempts.set(entity, (recoveryAttempts.get(entity) || 0) + 1);
            console.warn('[CombatRecovery]', diagnostic);
            // A recovery does not grant another movement refill or HP regeneration.
            void entiteTurn(entity, null, { resume: true });
        } catch (error) {
            console.error('[CombatRecovery]', entity.id, error);
        }
    }
}

window.addEventListener('combatResumed', () => {
    for (const entity of entites) requestCombatContinuityCheck(entity, 'combat-resumed');
});
window.addEventListener('combatOrderSideChanged', ({ detail }) => {
    if (!detail?.previousSide) return;
    scheduleTurnStartCheck();
    for (const entity of entites) if (entity.side === detail.previousSide) requestCombatContinuityCheck(entity, 'order-released');
});

window.addEventListener('entityCombatInteraction', ({ detail }) => {
    if (!gameStarted || isBattleFinished()) return;
    const entity = detail?.entity || entites.find(candidate => String(candidate.id) === String(detail?.entityId));
    if (!entity || continuityChecks.has(entity)) return;
    if (activeTurns.has(entity)) {
        // Hits and movements are frequent. Healthy timers only require these
        // timestamp reads; they do not allocate a recovery timer or scan targets.
        const lastProgress = Math.max(turnOwners.get(entity)?.startedAt ?? -Infinity,
            entity._phaseTimer?.lastTick ?? -Infinity, entity._combatAction?.preparation?.lastTick ?? -Infinity,
            cooldownWaits.get(entity)?.lastTick ?? -Infinity);
        const now = combatNow();
        if (now - lastProgress < STALLED_TURN_DELAY || getAttackTransportDeadline(entity) > now
            || Math.min(entity._targetSearch?.nextProbe ?? 0, entity._targetSearch?.deadline ?? 0) > now) return;
    }
    requestCombatContinuityCheck(entity, detail.kind || 'interaction');
});

function resetBlockedTurn(entity) {
    turnOwners.delete(entity); activeTurns.delete(entity);
    cooldownWaits.get(entity)?.cancel();
    targetSearchCycles.delete(String(entity.id));
    cancelEntityAttackAction(entity);
    entity.stopPreparationAnimation?.(); entity.stopRecoveryAnimation?.();
    for (const key of ['_phaseTimer', '_resumePhaseTimer', '_resumeCombat', '_targetSearch', '_turnStage']) delete entity[key];
    for (const key of ['speedTimer', 'preparationTime', 'preparationProgressRatio', 'executionTime', 'recoveryTime']) entity[key] = 0;
    entity.isATBFull = false;
    setTargetSearchVisual(entity, 'clear'); updateTimerDisplay(entity, advanceCombatTimerState(entity));
}

function revalidatePreparingAttack(entity, checkDefinition = true) {
    const action = entity._combatAction;
    if (action?.stage !== 'preparation' || action.invalidated) return;
    // Direct scripted casts need not belong to the selectable attack roster.
    if (!checkDefinition || !turnOwners.has(entity)) return;
    const targeting = attack => JSON.stringify([attack.combatFunction, attack.attacknature, attack.attackRange, attack.attackTarget, attack.deadTarget]);
    const current = readAttackChoices(entity).find(choice => choice.key === attackSelectionKey(action.attack));
    // A changed attack definition still retries selection. Target changes are
    // judged only before execution, and consume the turn when invalid.
    if (!current || targeting(current.attack) !== targeting(action.attack)) {
        action.invalidated = true;
        notifyPreparationInterrupted(entity);
    }
}

subscribeAttackSelection((entity, reason) => {
    if (!entity) return;
    attackRevisions.set(entity, (attackRevisions.get(entity) || 0) + 1);
    // Catalogue enrichment also notifies during module loading, before battle state exists.
    // With no combatants there is no active preparation to revalidate.
    if (!entites.length || !gameStarted || isBattleFinished() || reason === 'cooldown-start') return;
    // Notifications also cover gaining/removing controls and changing allegiance.
    for (const actor of entites) {
        const action = actor._combatAction;
        if (actor === entity || action?.target?.entity === entity.id) {
            try { revalidatePreparingAttack(actor, actor === entity); }
            catch (error) { console.warn('[CombatTarget]', actor.id, error); }
            requestCombatContinuityCheck(actor, actor === entity ? 'attack-or-control-change' : 'target-change');
        }
    }
});

// Only recover missing startup loops. A real timer, search, cooldown or order
// must keep its owner; deleting an active turn would create concurrent attacks.
export function verifyCombatTurnStarts() {
    if (!gameStarted || isBattleFinished()) {
        clearTurnStartChecks();
        return [];
    }
    const results = [];
    for (const [entity, state] of pendingTurnStarts) {
        let reason = null;
        if (!entites.includes(entity) || !isAttackEntityAlive(entity) || entity.statut?.includes('dead')) {
            pendingTurnStarts.delete(entity);
            reason = 'unavailable';
        } else if (entity.battleStopped) reason = 'stopped';
        else if (entity.isSurprised || entity.side === getSurprisedSide() || surpriseWaking.has(entity)) reason = 'surprised';
        else if (getOrderSide() === entity.side || isEnemyFleeing(entity)) reason = 'order';
        else if (activeTurns.has(entity) || cooldownWaits.has(entity) || targetSearchCycles.has(String(entity.id))) {
            pendingTurnStarts.delete(entity);
            reason = 'running';
        } else if (!entites.some(other => getOriginalCombatSide(other) !== getOriginalCombatSide(entity) && isAttackEntityAlive(other))) {
            pendingTurnStarts.delete(entity);
            reason = 'no-opponent';
        }
        if (reason) {
            results.push({ entityId: entity.id, status: reason });
            continue;
        }
        const diagnostic = { entityId: entity.id, name: entity.name, side: entity.side,
            phase: entity.currentPhase, turnCount: entity.turnCount || 0,
            attempts: state.attempts, error: state.error?.message || null };
        if (state.attempts >= MAX_TURN_START_RETRIES) {
            console.error('[CombatTurnStart] Relance impossible apres deux tentatives.', diagnostic);
            pendingTurnStarts.delete(entity);
            results.push({ entityId: entity.id, status: 'failed' });
            continue;
        }
        state.attempts++;
        console.warn('[CombatTurnStart] Tour absent : relance controlee.', diagnostic);
        results.push({ entityId: entity.id, status: 'restarted' });
        void entiteTurn(entity, null, { resume: state.started });
    }
    return results;
}

function canContinueTargetSearch(attacker) {
    return Boolean(isAttackEntityAlive(attacker) && !attacker.statut?.includes('dead') && !attacker.battleStopped
        && !attacker.hasFled && entites.includes(attacker)
        && !attacker.isSurprised && !surpriseWaking.has(attacker)
        && !isBattleFinished() && !OrderEntity(attacker));
}

async function waitForTargetSearchTick(attacker, duration, token) {
    const deadline = combatNow() + Math.max(0, Number(duration) || 0);
    while (combatNow() < deadline) {
        if (targetSearchCycles.get(String(attacker.id))?.token !== token || !canContinueTargetSearch(attacker)) {
            return false;
        }
        if (targetSearchCycles.get(String(attacker.id))?.wake) return true;
        await combatDelay(Math.min(50, Math.max(1, deadline - combatNow())));
    }
    return targetSearchCycles.get(String(attacker.id))?.token === token && canContinueTargetSearch(attacker);
}

export function runTargetSearchWindow(attacker, duration = Number(getSafe(attacker, 'speed', 1000)) || 1000, canContinue = () => canContinueTargetSearch(attacker)) {
    const id = String(attacker?.id ?? '');
    if (!id || !canContinueTargetSearch(attacker)) {
        return Promise.resolve({ status: 'cancelled', target: null, attempts: 0 });
    }

    const activeCycle = targetSearchCycles.get(id);
    if (activeCycle) {
        return activeCycle.promise.then(result => ({
            ...result,
            status: 'duplicate-search',
            target: null,
        }));
    }

    const token = Symbol(`target-search-${id}`);
    const searchDuration = Math.max(1, Number(duration) || 1);
    const cycle = { token, promise: null, wake: false };
    targetSearchCycles.set(id, cycle);
    cycle.promise = (async () => {
        attacker.currentPhase = 'target-search';
        attacker.speedTimer = 0;
        attacker.preparationTime = 0;
        attacker.executionTime = 0;
        attacker.recoveryTime = 0;
        setTargetSearchVisual(attacker, 'searching');
        updateTimerDisplay(attacker, advanceCombatTimerState(attacker));
        const saved = attacker._targetSearch;
        const deadline = saved?.deadline ?? combatNow() + searchDuration;
        let nextProbe = saved?.nextProbe ?? combatNow() + Math.min(TARGET_SEARCH_INTERVAL, searchDuration);
        let choices = readAttackChoices(attacker);
        let attempts = saved?.attempts ?? 0;
        const unsubscribe = subscribeAttackSelection(entity => {
            if (!entity || String(entity.id) === id) cycle.wake = true;
        });

        try {
            while (combatNow() < deadline) {
                attacker._targetSearch = { deadline, nextProbe, attempts };
                const now = combatNow();
                const nextCooldown = Math.min(...choices.filter(choice => choice.readyAt > now).map(choice => choice.readyAt));
                const nextAttempt = Math.min(nextProbe, nextCooldown);
                if (!await waitForTargetSearchTick(attacker, Math.min(deadline, nextAttempt) - now, token)) {
                    return { status: 'cancelled', target: null, attempts };
                }
                if (!canContinue()) return { status: 'cancelled', target: null, attempts };
                if (!cycle.wake && nextAttempt > deadline) break;
                cycle.wake = false;
                clearExpiredEntityAttackModifiers(attacker);

                attempts += 1;
                pulseTargetSearchAtb(attacker);
                const decision = await selectAttackDecision(attacker, canContinue);
                if (!canContinue()) return { status: 'cancelled', target: null, attempts };
                if (decision.status === 'silenced') return { status: 'silenced', attempts };
                if (decision.status === 'ready') return { status: 'found', target: decision.target, decision, attempts };
                choices = readAttackChoices(attacker);
                if (combatNow() >= nextProbe) nextProbe = combatNow() + TARGET_SEARCH_INTERVAL;

                const livingOpponentExists = entites.some(entity =>
                    getOriginalCombatSide(entity) !== getOriginalCombatSide(attacker) && !entity.isDEAD
                );
                if (!livingOpponentExists && checkGameOver(entites)) {
                    return { status: 'combat-ended', target: null, attempts };
                }
            }
            return { status: 'exhausted', target: null, attempts };
        } finally {
            unsubscribe();
            if (targetSearchCycles.get(id)?.token === token) {
                delete attacker._targetSearch;
                targetSearchCycles.delete(id);
                setTargetSearchVisual(attacker, 'clear');
            }
        }
    })();

    return cycle.promise;
}

function getSideImageContainers(side) {
    return Array.from(
        document.querySelectorAll(`.img-container.img-side-${side}`)
    );
}

export function wakeSurprisedArmy(target) {
    const currentSurprisedSide = getSurprisedSide();
    if (!target || target.nodeType === 1 || target.side !== currentSurprisedSide) {
        return;
    }

    const awakenedSide = releaseSurprisedSide(target.side);
    if (!awakenedSide) return;
    // On libère l'état avant de démarrer les tours pour empêcher deux attaques
    // simultanées de lancer deux fois la même armée.
    getSideImageContainers(awakenedSide)
        .forEach(container => container.classList.remove('surprised'));

    const awakenedEntites = entites.filter(entite => entite.side === awakenedSide);
    awakenedEntites.forEach(entite => {
        entite.isSurprised = false;
    });

    const defendingEntites = entites.filter(
        entite => entite.side !== awakenedSide && !entite.isDEAD
    );

    const awakenedLivingEntites = awakenedEntites.filter(entite => !entite.isDEAD);

    // La durée vient de BattleOrder : une seule modification règle les deux
    // réactions visuelles.
    awakenedLivingEntites.forEach(entite => {
        surpriseWaking.add(entite);
        entite._surpriseWakeAt = combatNow() + ORDER_DECISION_DURATION;
        orderAnimation(entite);
    });
    const epoch = combatEpoch;
    const timer = setTimeout(() => {
        surpriseWakeTimers.delete(timer);
        awakenedLivingEntites.forEach(entite => { surpriseWaking.delete(entite); delete entite._surpriseWakeAt; });
        if (epoch !== combatEpoch || isBattleFinished()) return;
        atCombatStart(() => awakenedLivingEntites
            .filter(entite => entites.includes(entite) && canContinueTargetSearch(entite))
            .forEach(entite => entiteTurn(entite, defendingEntites)));
        console.log(`Le camp ${awakenedSide} n'est plus surpris et entre dans le combat.`);
    }, ORDER_DECISION_DURATION);
    surpriseWakeTimers.add(timer);
}

export function initFightEntites() {
    entites.forEach(entite => {
        try {
            entite.status = 'active'; // L'état par défaut est 'active'
            entite.battleStopped = false;
        } catch (error) {
            console.error("Erreur lors de l'extension des entités :", error);
        }
    });
}

// ENTITE SIDE
export function entiteSide(entites) {
    entites.forEach(entite => {
        if (isNonLordCombatant(entite)) {
            const allies = entites.filter(e => e.side === entite.side && e.name !== entite.name);
            const ennemis = entites.filter(e => e.side !== entite.side);
            const { availableHexes, availableHexTypes } = calculateHexes(entite.side);

            // console.log(`[Sbire: ${entite.name}] Camp: ${entite.side}`);
            // console.log(`  Allies (${allies.length}): ${allies.map(e => e.name).join(', ')}`);
            // console.log(`  Ennemis (${ennemis.length}): ${ennemis.map(e => e.name).join(', ')}`);
            // console.log(`  Hexagons disponibles pour ${entite.side} (${availableHexes.length}): ${availableHexes.map(hex => hex.getAttribute('data-position')).join(', ')}`);
            
            Object.keys(availableHexTypes).forEach(role => {
                // console.log(`  Hexagons disponibles de type ${role} pour ${entite.side} (${availableHexTypes[role].length}): ${availableHexTypes[role].join(', ')}`);
            });
        }
    });
}

// ENTITE CAMP
export function entiteCamp(entites) {
   if (!gameStarted) {
    console.log("Les entités se préparent aux combats...");

    battleLogs("level_loaded");

    entites.forEach(entite => {
        if (
            !entite.stats.HP ||
            typeof entite.stats.HP.current !== 'number' ||
            typeof entite.stats.HP.max !== 'number'
        ) {
            console.warn(`Entité "${entite.name}" n'a pas le nouveau format d'HP attendu (HP.current / HP.max).`);
        }
    });

    return;
}

    const entitesA = entites.filter(entite => entite.side === 'A');
    const entitesB = entites.filter(entite => entite.side === 'B');

    if (entitesA.length === 0 || entitesB.length === 0) {
        console.log("Chaque camp doit avoir au moins une entité pour commencer les combats.");
		createQuitButton();
        return;
    }

    console.log("Place au sang et aux larmes ! Que les combats commencent !");
// ORDER BUTTONS	
	createOrderButton('runaway', 'Fuyez pauvres fous !', 'runaway-button');
    // Analyse des entités par camp avant de commencer les combats
    entiteSide(entites);

    // Déclenche les tours de combat
    const surprisedSide = getSurprisedSide();
    atCombatStart(() => {
        if (surprisedSide !== 'A') entitesA.forEach(entity => entiteTurn(entity, entitesB));
        if (surprisedSide !== 'B') entitesB.forEach(entity => entiteTurn(entity, entitesA));
    });

    // Calcul et affichage des hexagones disponibles pour chaque camp
    const hexesForA = calculateHexes('A');
    const hexesForB = calculateHexes('B');

    Object.keys(hexesForA.availableHexTypes).forEach(role => {
        // console.log(...);
    });

    Object.keys(hexesForB.availableHexTypes).forEach(role => {
        // console.log(...);
    });
}

// One decision loop owns the entity until recovery completes.
export function entiteTurn(attacker, defendingEntites, { resume = false } = {}) {
    if (!canContinueTargetSearch(attacker)) return Promise.resolve(false);
    ensureAstralityEffects(attacker);
    if (activeTurns.has(attacker)) return activeTurns.get(attacker);
    const epoch = combatEpoch;
    const owner = { startedAt: combatNow() };
    turnOwners.set(attacker, owner);
    const canContinue = () => turnOwners.get(attacker) === owner && epoch === combatEpoch && canContinueTargetSearch(attacker);
    const task = runEntityTurn(attacker, { resume, canContinue }).catch(error => {
        const startup = pendingTurnStarts.get(attacker);
        if (startup) { startup.error = error; scheduleTurnStartCheck(); }
        console.error('[MultiAttackDecision]', attacker.id, error);
        return false;
    });
    activeTurns.set(attacker, task);
    return task.then(completed => {
        const ownsTurn = turnOwners.get(attacker) === owner;
        if (activeTurns.get(attacker) === task) activeTurns.delete(attacker);
        if (ownsTurn) turnOwners.delete(attacker);
        if (ownsTurn && epoch === combatEpoch) {
            if (completed && canContinueTargetSearch(attacker)) {
                recoveryAttempts.delete(attacker);
                entiteLoop(attacker);
            } else if (!pendingTurnStarts.has(attacker)) requestCombatContinuityCheck(attacker, 'interrupted-turn');
        }
        return completed;
    });
}

async function runEntityTurn(attacker, { resume = false, canContinue } = {}) {
    const startup = pendingTurnStarts.get(attacker);
    const restored = attacker._resumeCombat === true;
    delete attacker._resumeCombat;
    if (restored) await waitForCombatResume();
    if (!canContinue()) return false;
    if (restored && attacker._combatAction) {
        const result = await entiteAttack(attacker, combatTarget(attacker._combatAction.target, entites), null, canContinue);
        if (!['silenced', 'retry'].includes(result)) return result;
        if (!canContinue()) return false;
        attacker._turnStage = 'decision';
    }
    if (isEntityActionPaused(attacker) && !await waitForEntityControl(attacker, canContinue)) return false;
    if (!restored || attacker._turnStage === 'speed') attacker.currentPhase = 'Entite Turn';
    if (!resume) {
        attacker.turnCount = (attacker.turnCount || 0) + 1;
        if (startup) startup.started = true;
        const movementBeforeRefill = attacker?.stats?.shift?.current;
        const movementMaxBeforeRefill = attacker?.stats?.shift?.max;
        const movementBaseBeforeRefill = Boolean(attacker?.stats?.shift?.baseDefault);
        const movementAfterRefill = refillEntityMovement(attacker, 1);
        presentMovementRefill(attacker, movementBeforeRefill);
        if (movementAfterRefill?.trailer?.success && movementAfterRefill.current > movementBeforeRefill) {
            recordEntityCombatProc(attacker, 'trailer');
            recordEntityCombatAmount(attacker, 'trailerCharges', Math.max(0, movementAfterRefill.current - movementBeforeRefill - 1));
        }
        // The first turn synchronizes the initial reserve. Later refills only
        // persist changes to the fields saved by saveEntityMovementState.
        // Spending charges, equipment and other resource changes keep their
        // own synchronous saves; the refill itself only changes current/max.
        if (attacker.turnCount === 1
            || movementAfterRefill?.current !== movementBeforeRefill
            || movementAfterRefill?.max !== movementMaxBeforeRefill
            || Boolean(movementAfterRefill?.baseDefault) !== movementBaseBeforeRefill) {
            saveEntityMovementState(attacker);
        }
        if (attacker.turnCount > 1) applyHpBattleRegenAtTurnStart(attacker);
    }
    const speed = Math.max(1, Number(getSafe(attacker, 'speed', 1000)) || 1000);
    if (!restored || attacker._turnStage === 'speed') {
    attacker._turnStage = 'speed';
    attacker.speedTimer = speed;
    attacker.preparationTime = 0;
    attacker.executionTime = 0;
    attacker.recoveryTime = 0;
    attacker.isATBFull = false;
    if (await runPhaseTimer(attacker, 'speedTimer', speed, { canContinue }) === false || !canContinue()) return false;
    attacker.speedTimer = 0;
    attacker.isATBFull = true;
    attacker._turnStage = 'decision';
    }
    // Startup is confirmed before an attack can apply any effect.
    pendingTurnStarts.delete(attacker);

    while (canContinue()) {
        if (isEntityActionPaused(attacker) && !await waitForEntityControl(attacker, canContinue)) return false;
        if (getControlState(attacker, 'effroi')) {
            attacker.currentPhase = 'fear-wait';
            await combatDelay(50);
            continue;
        }
        if (isEntitySilenced(attacker)) {
            attacker.currentPhase = 'silence-wait';
            if (!await waitForEntitySilence(attacker, canContinue)) return false;
            attacker.currentPhase = 'attack-decision';
            continue;
        }
        if (attacker._turnStage === 'search-recovery') {
            await runEntityRecovery(attacker, speed, { canContinue, source: 'target-search' });
            if (!canContinue()) return false;
            document.dispatchEvent(new CustomEvent('entityTurnCompleted', {
                detail: { entityId: attacker.id, side: attacker.side, turnCount: attacker.turnCount, reason: 'no-target' },
            }));
            return canContinue();
        }
        let decision = attacker._targetSearch ? { status: 'no-target' } : await selectAttackDecision(attacker, canContinue);
        if (!canContinue()) return false;
        if (decision.status === 'silenced') continue;
        if (decision.status === 'retry') { await combatDelay(50); continue; }
        if (decision.status === 'cooldown') {
            if (!await runAttackCooldownWait(attacker, canContinue)) return false;
            continue;
        }
        if (decision.status === 'ready') {
            const result = await entiteAttack(attacker, decision.target, decision, canContinue);
            if (!['silenced', 'retry'].includes(result)) return result;
            if (!canContinue()) return false;
            attacker._turnStage = 'decision';
            continue;
        }
        pulseTargetSearchAtb(attacker);
        attacker._turnStage = 'search';
        const result = await runTargetSearchWindow(attacker, speed, canContinue);
        if (!canContinue()) return false;
        if (result.status === 'silenced') { attacker._turnStage = 'decision'; continue; }
        if (result.status === 'found') {
            const completed = await entiteAttack(attacker, result.target, result.decision, canContinue);
            if (!['silenced', 'retry'].includes(completed)) return completed;
            if (!canContinue()) return false;
            attacker._turnStage = 'decision';
            continue;
        }
        if (result.status !== 'exhausted' || !canContinue()) return false;
        setTargetSearchVisual(attacker, 'failed');
        try {
            attacker._turnStage = 'search-recovery';
            const recovered = await runEntityRecovery(attacker, speed, { canContinue, source: 'target-search' });
            if (!recovered || !canContinue()) return false;
            document.dispatchEvent(new CustomEvent('entityTurnCompleted', {
                detail: { entityId: attacker.id, side: attacker.side, turnCount: attacker.turnCount, reason: 'no-target' },
            }));
            return true;
        } finally {
            if (canContinue()) setTargetSearchVisual(attacker, 'clear');
        }
    }
    return false;
}

function readAttackChoices(attacker) {
    const attacks = readAttackDefinitionsForEntity(attacker, attackDetails);
    const now = combatNow();
    // Share stat reads only while calculating this decision's cooldowns.
    // Selection updates and later combat events run after the snapshot is released.
    const cooldowns = withStatReadSnapshot(() => new Map(attacks.map(attack =>
        [attack, buildAttackTimingsWithHaste(attacker, attack).timings.cooldown])));
    return describeAttackChoices(attacker, attacks, attack => cooldowns.get(attack), now)
        .filter(choice => !choice.disabled);
}

export function collectAttackTargetCandidates(attacker, attack) {
    const candidates = attack.attackTarget.includes('hexa') ? [...calculateHexes(getCombatSide(attacker)).availableHexes] : [];
    if (getControlState(attacker, 'folie') || attack.attackTarget.some(type => type === 'ally' || type === 'enemy')) candidates.push(...entites);
    return candidates.filter(target => (getControlState(attacker, 'folie') || target.id !== attacker.id) && acceptsSelectedTarget(attacker, attack, target));
}

export async function selectTargetForAttack(attacker, attack, candidates = collectAttackTargetCandidates(attacker, attack), canContinue = () => canContinueTargetSearch(attacker)) {
    if (!candidates.length) return null;
    const madness = getControlState(attacker, 'folie');
    if (!madness && attack.attackTarget.includes('enemy')) {
        const preferred = candidates.filter(target => isHexTarget(target) || !isCharmedEnemyTarget(attacker, target));
        if (preferred.length) candidates = preferred;
    }
    if (madness || getControlState(attacker, 'charme') || candidates.some(target => getControlState(target, 'charme'))) {
        const roll = Math.random();
        return candidates[Math.min(candidates.length - 1, Math.floor(roll * candidates.length))];
    }
    const role = attacker.role || 'gueux';
    const entities = candidates.filter(target => !isHexTarget(target));
    const hexes = candidates.filter(isHexTarget);
    if (hexes.length && (!entities.length || attack.attackTarget[0] === 'hexa')) {
        return resolveTargetSelection(attacker, attack, hexes, resolve => invokerHexTarget(attacker, hexes, role, resolve), canContinue);
    }
    candidates = entities;
    const enemies = candidates.filter(target => isCombatEnemy(attacker, target));
    if (enemies.length) {
        const dead = enemies.filter(target => target.isDEAD);
        return resolveTargetSelection(attacker, attack, enemies, resolve => {
            if (isLord(attacker) && !dead.length) lordEnemyTarget(enemies, dead, resolve, attacker);
            else sbireEnemyTarget(attacker, enemies, dead, role, resolve, attack);
        }, canContinue);
    }
    return resolveTargetSelection(attacker, attack, candidates, resolve => sbireAllyTarget(attacker, candidates, role, [attack], resolve), canContinue);
}

function resolveTargetSelection(attacker, attack, candidates, choose, canContinue) {
    return new Promise(resolve => {
        let done = false, timer;
        const finish = target => {
            if (done) return;
            done = true; cancelCombatTask(timer);
            resolve(canContinue() && target && acceptsSelectedTarget(attacker, attack, target) ? target : null);
        };
        const fallback = () => finish(candidates.find(target => acceptsSelectedTarget(attacker, attack, target)));
        try { Promise.resolve(choose(finish)).catch(error => { console.warn('[CombatTarget]', attacker.id, error); fallback(); }); }
        catch (error) { console.warn('[CombatTarget]', attacker.id, error); fallback(); }
        // Most selectors answer synchronously: no safety timer is needed.
        if (!done) timer = scheduleCombatTask(fallback, 1000);
    });
}

export async function selectAttackDecision(attacker, canContinue = () => canContinueTargetSearch(attacker)) {
    if (getControlState(attacker, 'effroi')) return { status: 'silenced' };
    if (isEntitySilenced(attacker)) return { status: 'silenced' };
    const choices = readAttackChoices(attacker);
    const revision = attackRevisions.get(attacker) || 0;
    const ready = choices.filter(choice => choice.remaining === 0);
    if (choices.length && !ready.length) return { status: 'cooldown', preview: predictNextAttack(attacker, choices) };
    const participants = ready.map(choice => ({ ...choice, targets: collectAttackTargetCandidates(attacker, choice.attack) }))
        .filter(choice => choice.targets.length);
    const ranked = participants.slice().sort((a, b) => compareAttackChoices(attacker, a, b));
    for (const choice of ranked) {
        const target = await selectTargetForAttack(attacker, choice.attack, choice.targets, canContinue);
        if (!canContinue()) return { status: 'cancelled' };
        if (isEntitySilenced(attacker)) return { status: 'silenced' };
        const current = revision === (attackRevisions.get(attacker) || 0) ? choice
            : readAttackChoices(attacker).find(item => item.key === choice.key && item.remaining === 0);
        if (!current) return { status: 'retry' };
        if (target && acceptsSelectedTarget(attacker, current.attack, target)) {
            return { status: 'ready', ...current, target, participants };
        }
    }
    return { status: 'no-target', attackCount: choices.length };
}

// Read a target without committing an attack or changing its HUD.
export async function entiteTarget(attacker) {
    if (!canContinueTargetSearch(attacker)) return null;
    const decision = await selectAttackDecision(attacker);
    return decision.status === 'ready' ? decision.target : null;
}

export function runAttackCooldownWait(attacker, canContinue = () => canContinueTargetSearch(attacker)) {
    if (!canContinueTargetSearch(attacker)) return Promise.resolve(false);
    if (cooldownWaits.has(attacker)) return cooldownWaits.get(attacker).promise;
    const epoch = combatEpoch;
    let finish, timer, unsubscribe, dirty = true, choices = [], nextPulse = 0, done = false;
    const view = createCooldownWaitView(attacker);
    const promise = new Promise(resolve => { finish = resolve; });
    const wait = { promise, cancel: () => settle(false) };
    const settle = result => {
        if (done) return;
        done = true;
        cancelCombatTask(timer);
        unsubscribe?.();
        view.clear();
        setTargetSearchVisual(attacker, 'clear');
        if (attacker.currentPhase === 'cooldown-wait') attacker.currentPhase = 'attack-decision';
        cooldownWaits.delete(attacker);
        finish(result);
    };
    cooldownWaits.set(attacker, wait);
    attacker.currentPhase = 'cooldown-wait';
    attacker.speedTimer = 0;
    setTargetSearchVisual(attacker, 'cooldown');

    const tick = () => {
        cancelCombatTask(timer);
        if (done) return;
        try {
            if (epoch !== combatEpoch || !canContinue()) { settle(false); return; }
            const now = combatNow();
            wait.lastTick = now;
            if (isEntitySilenced(attacker)) { settle(true); return; }
            if (clearExpiredEntityAttackModifiers(attacker, now)) dirty = true;
            if (dirty || isEntityAsleep(attacker)) { choices = readAttackChoices(attacker); dirty = false; }
            if (!choices.length || choices.some(choice => choice.readyAt <= now)) { settle(true); return; }
            const preview = predictNextAttack(attacker, choices);
            view.update(preview, now);
            if (now >= nextPulse) {
                pulseTargetSearchAtb(attacker, 'cooldown');
                nextPulse = now + 1000;
            }
            timer = scheduleCombatTask(tick, Math.max(1, Math.min(50, preview.readyAt - now)));
        } catch (error) {
            // A scheduled callback must release its waiter even when a live
            // attack mutation fails. The continuity check can then restart it.
            console.error('[CombatCooldown]', attacker.id, error);
            settle(false);
        }
    };
    unsubscribe = subscribeAttackSelection(entity => {
        if (!entity) { settle(false); return; }
        if (String(entity.id) !== String(attacker.id)) return;
        dirty = true;
        queueMicrotask(tick);
    });
    tick();
    return promise;
}

export async function entiteAttack(attacker, target, decision = null, ownsTurn = () => true) {
    if (!canContinueTargetSearch(attacker)) return false;
    const epoch = combatEpoch;
    const canContinue = () => ownsTurn() && epoch === combatEpoch && canContinueTargetSearch(attacker);
    const restored = attacker._combatAction;
    decision ||= restored ? { status: 'ready', attack: restored.attack, target } : await selectAttackDecision(attacker, canContinue);
    if (!canContinue()) return false;
    if (decision.status !== 'ready') return false;
    const attack = decision.attack;
    target = decision.target;
    const isEnemy = target && !isHexTarget(target) && isCombatEnemy(attacker, target);
    attacker.currentAttackId = attackSelectionKey(attack);
    if (!restored) attacker.currentAttack = attack;
    attacker._turnStage = 'attack';
    updateEntityAttackTargetDisplay(attacker, attack, target);
    updateCurrentAttackDisplay(attacker);
    try {
        const result = await executeAttack(attacker, target, attack, {
            canContinue,
            onStart: () => {
                commitAttackChoice(attacker, decision.participants, decision.key);
                console.debug('[MultiAttackDecision]', {
                    entityId: attacker.id, chosen: decision.key, target: target.id || target.dataset?.position,
                    mode: attacker.attackSelection.priorityMode || 'auto',
                    choices: decision.participants.map(({ key, credit, weight, priority, cooldown }) =>
                        ({ key, credit, weight, priority, cooldown })),
                });
            },
        });
        if (result === 'silenced' || result === 'retry') return result;
        if (!canContinue()) return false;
        if (isEnemy && result !== 'target-invalid') wakeSurprisedArmy(target);
        if (!canContinue()) return false;
        document.dispatchEvent(new CustomEvent('entityTurnCompleted', {
            detail: { entityId: attacker.id, side: attacker.side, turnCount: attacker.turnCount,
                ...(result === 'target-invalid' ? { reason: 'target-invalid' } : {}) },
        }));
        return true;
    } finally {
        clearForcedInvisibleTargetAccuracy(attacker, target);
    }
}

registerCombatState('turns', () => ({ active: [...activeTurns.keys()]
    .filter(entity => entites.includes(entity) && isAttackEntityAlive(entity) && !entity.hasFled).map(entity => entity.id),
    waking: [...surpriseWaking].map(entity => entity.id) }), (saved) => {
    activeTurns.clear(); turnOwners.clear(); clearContinuityChecks(); cooldownWaits.clear(); targetSearchCycles.clear(); pendingTurnStarts.clear();
    for (const id of saved.active) {
        const entity = entites.find(candidate => candidate.id === id);
        if (!entity) throw new Error('Entité absente du tour sauvegardé.');
        entity._resumePhaseTimer = entity._phaseTimer;
        entity._resumeCombat = true;
        void entiteTurn(entity, null, { resume: true });
    }
    for (const id of saved.waking) {
        const entity = entites.find(candidate => candidate.id === id);
        if (!entity) continue;
        surpriseWaking.add(entity);
        const timer = setTimeout(() => {
            surpriseWakeTimers.delete(timer); surpriseWaking.delete(entity); delete entity._surpriseWakeAt;
            if (canContinueTargetSearch(entity)) void entiteTurn(entity);
        }, Math.max(0, entity._surpriseWakeAt - combatNow()));
        surpriseWakeTimers.add(timer);
    }
});

//ENTITE LOOP
export async function entiteLoop(attacker) {
	if (OrderEntity(attacker)) {
        console.warn(`🛑 Loop annulée pour ${attacker.name} : ordre en cours.`);
        return;
    }
    try {
        // Premièrement, vérifier si l'attaquant est en vie
        if (attacker && !attacker.isDEAD) {
            // Deuxièmement, vérifier s'il reste des adversaires
            if (entites.some(entite => !entite.isDEAD && getOriginalCombatSide(entite) !== getOriginalCombatSide(attacker))) {
                // Il y a encore des adversaires, donc la logique de combat continue
                let defendingEntites = entites.filter(entite => getOriginalCombatSide(entite) !== getOriginalCombatSide(attacker) && !entite.isDEAD);
                if (defendingEntites.length > 0 && !attacker.isDEAD ) {
                    // Appel de la logique de combat pour le prochain tour
                    await entiteTurn(attacker, defendingEntites);
                } else {
                    console.log(`${attacker.name} ne trouve plus de cibles à attaquer.`);
                }
            } else {
                console.log(`${attacker.name} ne peut plus combattre ou il n'y a plus de cibles.`);
                // Gestion de la fin du combat pour cet attaquant
                // Potentiellement, ajouter une logique pour gérer la fin du jeu ou transitionner vers un autre état de jeu
            }
        } else {
            // L'attaquant n'est pas en vie
            console.log(`${attacker.name} est hors de combat et ne peut pas attaquer.`);
			checkGameOver(entites);
            return; // Sortie anticipée si l'attaquant n'est pas en vie
        }
    } catch (error) {
        console.error(`Erreur lors de la boucle de combat pour ${attacker.name}:`, error);
    }
}

export function updateTargetStatut(attacker, targetEntity) {
    // Sélectionne l'élément avec l'id 'role-img_{attacker.id}'
    const lordRoleImg = document.getElementById(`Targetrole-img_${attacker.id}`);

    if (lordRoleImg) {
        // Supprimer les anciennes classes 'new-target', 'active-target', 'last-target'
        lordRoleImg.classList.remove('new-target', 'active-target', 'last-target');
        console.log(`ID de l'attaquant: ${attacker.id}`);

        // Ajouter la nouvelle classe en fonction du statut de la cible
        if (targetEntity.targetStatut === 'newTarget') {
            lordRoleImg.classList.add('new-target');
            console.log(`lordtarget : ajout de la classe 'new-target'`);
        } else if (targetEntity.targetStatut === 'activeTarget') {
            lordRoleImg.classList.add('active-target');
            console.log(`lordtarget : ajout de la classe 'active-target'`);
        } else if (targetEntity.targetStatut === 'lastTarget') {
            lordRoleImg.classList.add('last-target');
            console.log(`lordtarget : ajout de la classe 'last-target'`);
        }

        // Log pour vérifier les classes après l'ajout
        console.log(`Classes actuelles de l'élément : ${[...lordRoleImg.classList].join(', ')}`);
    } else {
        // Avertissement si l'élément avec l'id 'role-img_{attacker.id}' n'est pas trouvé
        console.warn(`L'élément avec l'id 'role-img_${attacker.id}' n'a pas été trouvé dans le DOM.`);
    }
}

