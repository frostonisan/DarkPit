import { ensureGameShell } from '../ui/viewport.js';
import { clearCombatClock, clearInterval, setTimeout, clearTimeout, clockNow } from "../combat/clock.js";
import { isResolvingCombatImpacts } from "../combat/timeline.js";
import { gameStorage as localStorage } from "../storage/sessionStorage.js";
import { entitesNestUp, entites } from "../entities/runtime.js";
import { entiteCamp, initFightEntites } from "../combat/loop.js";
import {
  resetFullGame,
  isAdminMode,
  saveToLocalStorage,
  loadFromLocalStorage,
  armyAConfig,
  registerStageVictory,
} from "../storage/gameStorage.js";
import { resetAttackSelectionRuntime } from "../combat/attackResolution.js";
import { createChestLoot, rewardPlayerA } from "../items/loot.js";
import { fledEntities, isEnemyFleeing, tryEnemyRunaway } from "../combat/orders.js";
import { battleLogs } from "../combat/journal.js";
import { clearProjectileEffects, playRunawaySuccessAnimation } from "../rendering/animations.js";
import { showGamePopupMessage } from "../ui/display.js";
import { recordEntityCombatStat, beginEntityBattleRole } from "../storage/entityStorage.js";

let stageInterfaceLoading = false;
let stageInterfaceFailed = false;
let lastStageAccess = '';

export function getStageAccess() {
    const inStage = Boolean(window.levelRunning && window.levelRunning !== 'worldmap');
    const admin = isAdminMode() && window.levelRunning === 'admin';
    const loading = inStage && stageInterfaceLoading;
    const unavailable = inStage && (stageInterfaceLoading || stageInterfaceFailed);
    const threatened = inStage && (unavailable || hasSideBThreat() || (gameStarted && !battleOutcome));
    const finished = isBattleFinished();
    const battleActive = inStage && gameStarted && !finished;
    return { inStage, admin, loading, unavailable, finished, battleActive, threatened, menusAllowed: admin || !threatened };
}

export function refreshStageAccess() {
    const access = getStageAccess();
    const signature = JSON.stringify(access);
    if (signature !== lastStageAccess) {
        lastStageAccess = signature;
        window.dispatchEvent(new CustomEvent('stageAccessChanged', { detail: access }));
    }
    return access;
}

window.addEventListener('adminModeChanged', refreshStageAccess);

export function setStageInterfaceLoading(loading, { failed = false } = {}) {
    stageInterfaceLoading = Boolean(loading);
    stageInterfaceFailed = !loading && failed;
    if (loading) window.dispatchEvent(new Event('stageInterfaceClosing'));
    return refreshStageAccess();
}

export function requireSafeMenuAccess() {
    if (getStageAccess().menusAllowed) return true;
    showGamePopupMessage({
        mode: 'auto', tone: 'warning', key: 'nearby-threat',
        message: 'Vous ne pouvez pas faire cela quand une menace est proche.',
    });
    return false;
}

function normalizeStoredExperience(value) {
    if (value && typeof value === 'object') {
        return Math.max(0, Number.parseInt(value.experience, 10) || 0);
    }
    return Math.max(0, Number.parseInt(value, 10) || 0);
}

export function addPlayerExperience(amount, options = {}) {
    const gain = Math.max(0, Math.floor(Number(amount) || 0));
    if (gain <= 0) return 0;

    const hasDedicatedExperience = localStorage.getItem('playerExperience') !== null;
    const storedExperience = loadFromLocalStorage('playerExperience', { experience: 0 });
    const currentGameData = loadFromLocalStorage('currentGameData', {});
    const playerInfo = loadFromLocalStorage('playerInfo.json', {});
    const currentExperience = hasDedicatedExperience
        ? normalizeStoredExperience(storedExperience)
        : Math.max(
            normalizeStoredExperience(currentGameData?.experience),
            normalizeStoredExperience(playerInfo?.experience),
            normalizeStoredExperience(armyAConfig?.experience)
        );
    const nextExperience = currentExperience + gain;

    saveToLocalStorage('playerExperience', { experience: nextExperience });

    if (currentGameData && typeof currentGameData === 'object' && !Array.isArray(currentGameData)) {
        currentGameData.experience = nextExperience;
        currentGameData.lastUpdated = new Date().toISOString();
        saveToLocalStorage('currentGameData', currentGameData);
    }

    if (playerInfo && typeof playerInfo === 'object' && !Array.isArray(playerInfo)) {
        playerInfo.experience = nextExperience;
        playerInfo.lastUpdated = new Date().toISOString();
        saveToLocalStorage('playerInfo.json', playerInfo);
    }

    if (armyAConfig && typeof armyAConfig === 'object') {
        armyAConfig.experience = nextExperience;
        saveToLocalStorage('armyAConfig', armyAConfig);
    }

    const score = document.getElementById('score');
    if (score) score.textContent = `Experience : ${nextExperience}`;

    window.dispatchEvent(new CustomEvent('playerExperienceUpdated', {
        detail: {
            gained: gain,
            experience: nextExperience,
            source: options.source || 'unknown'
        }
    }));

    return nextExperience;
}

window.addEventListener('playerExperienceRequested', event => {
    addPlayerExperience(event?.detail?.amount, {
        source: event?.detail?.source
    });
});

window.addEventListener('beforeunload', () => {
    if (sessionStorage.getItem('globalGameOverScreen') === 'true') {
        // A previous test/defeat must never erase a different, live combat on F5.
        // Only the actual terminal defeat screen is allowed to reset the world.
        if (gameStarted || battleOutcome !== 'defeat'
            || !document.querySelector('.overlay-defeat[data-save-preserved="false"]')) {
            sessionStorage.removeItem('globalGameOverScreen');
            return;
        }
        localStorage.removeItem('BattleLogsIndex');

        Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).forEach(key => {
            if (key.startsWith('BattleLog_')) {
                localStorage.removeItem(key);
            }
        });

        resetFullGame();
        sessionStorage.removeItem('globalGameOverScreen');
    }
});

function isDead(entite) {
    return entite?.isDEAD === true || entite?.statut?.includes("dead") || entite?.stats?.HP?.current <= 0;
}

// === DIRECTION UNIQUE DES ACTIONS DE COMBAT ================================

export const BATTLE_ACTION_MODE = Object.freeze({
    AUTO: 'auto',
    HIDDEN: 'hidden',
    START: 'start',
    QUIT: 'quit',
    FLEE: 'flee',
    ORDERS: 'orders'
});

const battleActionFactories = {
    start: null,
    flee: null,
    quit: null
};
let battleActionFleeLocked = () => false;

export function configureBattleActionManager({
    createStartButton,
    createFleeButton,
    createQuitButton,
    isFleeLocked
} = {}) {
    if (typeof createStartButton === 'function') {
        battleActionFactories.start = createStartButton;
    }

    if (typeof createQuitButton === 'function') {
        battleActionFactories.quit = createQuitButton;
    }

    if (typeof createFleeButton === 'function') {
        battleActionFactories.flee = createFleeButton;
    }

    if (typeof isFleeLocked === 'function') {
        battleActionFleeLocked = isFleeLocked;
    }
}

function isExplicitlyRemovedEnemy(entity) {
    const status = entity?.statut;
    const markedDead = Array.isArray(status)
        ? status.includes('dead')
        : status === 'dead';

    return (
        entity?.hasFled === true ||
        entity?.isDEAD === true ||
        markedDead
    );
}

/**
 * Détermine la menace qui interdit de quitter gratuitement.
 *
 * HP.current n'est volontairement pas utilisé ici : après un F5, une armée B
 * restaurée peut conserver temporairement un ancien HP à 0 avant sa remise en
 * état. Tant que l'entité B existe dans le niveau et n'est pas explicitement
 * morte ou en fuite, elle représente une menace et autorise le combat.
 */
export function hasSideBThreat(entityList = null) {
    const list = Array.isArray(entityList) ? entityList : entites;

    return list.some(entity => (
        entity?.side === 'B' &&
        !isExplicitlyRemovedEnemy(entity)
    ));
}

function removeStartAndQuitButtons() {
    document.querySelectorAll([
        '#startButton',
        '.launch-combat-button',
        '.quit-level-button'
    ].join(',')).forEach(element => element.remove());
}

function removeFleeButtons() {
    document.querySelectorAll([
        '.flee-button',
        '.escape-button',
        '.runaway-button',
        '.run-away-button',
        '.cancelrunaway-button',
        '[data-action="flee"]',
        '[data-order="flee"]',
        '[data-order="escape"]',
        '[data-order="runaway"]',
        '[data-order="cancelrunaway"]'
    ].join(',')).forEach(element => element.remove());
}

function getOrCreateBattleActions() {
    const gameUi = document.querySelector('.Game-UI');
    if (!gameUi) {
        console.warn('[BattleActions] Élément .Game-UI introuvable.');
        return null;
    }

    let container = gameUi.querySelector(':scope > .battle-actions');
    if (!container) {
        container = document.createElement('div');
        container.className = 'battle-actions';
        gameUi.appendChild(container);
    }

    return container;
}

export function isBattleDialogueVisible() {
    const dialogue = document.querySelector(
        '#game-windows > .dialogue-window.active'
    );

    if (!dialogue || dialogue.hidden) return false;

    const style = window.getComputedStyle(dialogue);
    return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity || 1) > 0 &&
        dialogue.getClientRects().length > 0
    );
}

/**
 * Point d'entrée unique pour décider, nettoyer et préparer .battle-actions.
 *
 * Priorité du mode AUTO :
 * 1. dialogue actif -> rien ;
 * 2. aucun ennemi B vivant -> quitter le niveau ;
 * 3. ennemi B vivant + combat lancé -> fuir ;
 * 4. ennemi B vivant + combat non lancé -> démarrer le combat.
 *
 * Le statut historique du niveau (inexploré, en cours, terminé, échoué)
 * n'accorde jamais à lui seul le droit de quitter.
 */
export function manageBattleActions({
    mode = BATTLE_ACTION_MODE.AUTO,
    dialogueActive = null,
    entityList = null
} = {}) {
    refreshStageAccess();
    const activeDialogue = dialogueActive == null
        ? isBattleDialogueVisible()
        : dialogueActive;
    let resolvedMode = mode;
    const livingEnemyB = hasSideBThreat(entityList);

    if (activeDialogue || mode === BATTLE_ACTION_MODE.HIDDEN) {
        resolvedMode = BATTLE_ACTION_MODE.HIDDEN;
    } else if (mode === BATTLE_ACTION_MODE.AUTO) {
        if (isAdminMode() && window.levelRunning === 'admin') {
            resolvedMode = gameStarted ? BATTLE_ACTION_MODE.FLEE : BATTLE_ACTION_MODE.START;
        } else if (!livingEnemyB) {
            resolvedMode = BATTLE_ACTION_MODE.QUIT;
        } else {
            resolvedMode = gameStarted
                ? BATTLE_ACTION_MODE.FLEE
                : BATTLE_ACTION_MODE.START;
        }
    }

    // Protection d'autorisation : même un appel direct à QUIT ne permet pas
    // de quitter gratuitement sous la menace. Seule une fuite déjà résolue
    // peut ouvrir cette sortie malgré des ennemis encore présents.
    if (
        resolvedMode === BATTLE_ACTION_MODE.QUIT &&
        livingEnemyB &&
        battleOutcome !== 'escape'
    ) {
        resolvedMode = gameStarted
            ? BATTLE_ACTION_MODE.FLEE
            : BATTLE_ACTION_MODE.START;
    }

    // Pendant une attaque surprise ennemie, la fuite reste verrouillée
    // jusqu'au premier tour terminé. L'absence de bouton est alors voulue.
    if (resolvedMode === BATTLE_ACTION_MODE.FLEE && battleActionFleeLocked()) {
        resolvedMode = BATTLE_ACTION_MODE.HIDDEN;
    }

    if (resolvedMode === BATTLE_ACTION_MODE.HIDDEN) {
        removeStartAndQuitButtons();
        removeFleeButtons();
        document.querySelectorAll('.battle-actions')
            .forEach(container => container.remove());
        return { mode: resolvedMode, container: null };
    }

    if (
        resolvedMode === BATTLE_ACTION_MODE.FLEE ||
        resolvedMode === BATTLE_ACTION_MODE.ORDERS
    ) {
        // Les contrôles de fuite et d'annulation peuvent coexister entre eux,
        // mais jamais avec Démarrer ou Quitter.
        removeStartAndQuitButtons();
    } else {
        removeStartAndQuitButtons();
        removeFleeButtons();
    }

    const container = getOrCreateBattleActions();
    if (!container) return { mode: resolvedMode, container: null };

    let actionElement = null;

    if (resolvedMode === BATTLE_ACTION_MODE.START) {
        actionElement = battleActionFactories.start?.(container) || null;
    } else if (resolvedMode === BATTLE_ACTION_MODE.FLEE) {
        actionElement = battleActionFactories.flee?.(container) || null;
    } else if (resolvedMode === BATTLE_ACTION_MODE.QUIT) {
        actionElement = battleActionFactories.quit?.(container) || null;
    }

    if (
        [BATTLE_ACTION_MODE.START, BATTLE_ACTION_MODE.FLEE, BATTLE_ACTION_MODE.QUIT]
            .includes(resolvedMode) &&
        !actionElement
    ) {
        console.error(
            `[BattleActions] Échec de création de l'action "${resolvedMode}".`,
            { factories: { ...battleActionFactories }, container }
        );
    }

    return { mode: resolvedMode, container, actionElement };
}

window.addEventListener('battleActionContextChanged', event => {
    manageBattleActions({
        mode: event?.detail?.dialogueActive === true
            ? BATTLE_ACTION_MODE.HIDDEN
            : BATTLE_ACTION_MODE.AUTO,
        dialogueActive: event?.detail?.dialogueActive === true
    });
});

let GameWon = false;
let GameLost = false;

// BattleORDRE 
let orderSide = null;

export function setOrderSide(side) {
    const previousSide = orderSide;
    orderSide = side;
    if (previousSide !== side) window.dispatchEvent(new CustomEvent('combatOrderSideChanged', { detail: { previousSide, side } }));
}

export function getOrderSide() {
    return orderSide;
}

export function OrderEntity(entite) {
    if (isEnemyFleeing(entite)) return true;
    if (orderSide !== null && entite.side === orderSide) {
        if (!entite.hasResetOrderTimers) {
            console.log(`🚨 BattleORDRE CONFIRMÉE pour ${entite.name} (phase actuelle : ${entite.currentPhase || 'indéterminée'})`);
            resetAllTimersForOrderSide();
            entite.hasResetOrderTimers = true; 
        }
        return true;
    }
    return false;
}

async function resetAllTimersForOrderSide() {
    const side = getOrderSide();
    if (!side) return;

    entites.forEach(entite => {
        if (entite.side === side) {
            entite.speedTimer = 0;
            entite.preparationTime = 0;
            entite.executionTime = 0;
            entite.recoveryTime = 0;
            entite.cooldownTimer = 0;
            entite.hasResetOrderTimers = true;

            console.log(`⏹️ Timers remis à zéro pour ${entite.name} (ID: ${entite.id})`);
        }
    });
}

// START GAME
export let gameStarted = false;
export function startGame() {
    try {
        if (gameStarted) {
            console.log("Le jeu est déjà en cours.");
            return;
        }
        resetBattleResolution();
        if (isAdminMode() && window.levelRunning === 'admin') initFightEntites();
        gameStarted = true;
        const participants = entites.filter(entity =>
            (entity?.side === 'A' || entity?.side === 'B')
            && !entity.isDEAD && !entity.statut?.includes('dead')
            && (Number(entity.stats?.HP?.current) || 0) > 0);
        if (participants.some(entity => entity.side === 'A')
            && participants.some(entity => entity.side === 'B')) {
            participants.forEach(entity => {
                recordEntityCombatStat(entity, 'battlesFought');
                beginEntityBattleRole(entity);
            });
        }
        refreshStageAccess();
        window.dispatchEvent(new Event('battleStarted'));
        checkGameOver();
        if (isBattleFinished()) return;
        // Une menace B est présente : AUTO remplace Démarrer par Fuir.
        manageBattleActions({ mode: BATTLE_ACTION_MODE.AUTO });
        console.log("Jeu démarré.");
        entiteCamp(entites); // Assurez-vous que 'entites' est défini ou accessible
    } catch (error) {
        console.error("Erreur lors du démarrage du jeu :", error);
    }
}
export function StopGame({ preserveScene = false } = {}) {
    gameStarted = false;
    window.dispatchEvent(new Event('battleStopped'));
    console.warn("🛑 Arrêt total du combat déclenché.");

    stopAllIntervals();
    freezeBattleEntities({ notifyResolved: false });

    clearCombatClock();

    fledEntities.length = 0; // ✅ Nettoyage du tableau des fuyards

    const gameOverMessage = document.querySelector(".GameOverMessage");
    if (gameOverMessage) gameOverMessage.remove();

    if (!preserveScene) document.querySelectorAll('.chest-container').forEach(chest => chest.remove());

    console.log("💀 Combat stoppé. Tout est nettoyé.");
}

// STOP TIMINGS
export let activeIntervals = []; // Liste pour suivre les intervalles actifs
export function stopAllIntervals() {
    activeIntervals.forEach(clearInterval);
    activeIntervals = []; // Réinitialisation du tableau
}

// GAME OVER
export let gameOver = false;
export let isGameOverHandled = false;
export let battleOutcome = null; // null | "victory" | "defeat" | "draw" | "escape"
let battleResolutionInProgress = false;

export function isBattleFinished() {
    return battleOutcome !== null || gameOver === true;
}

function removeFleeControls() {
    document.querySelectorAll(
        '.flee-button, .escape-button, .run-away-button, [data-action="flee"], [data-order="flee"], [data-order="escape"]'
    ).forEach(element => element.remove());
}

function freezeBattleEntities({ notifyResolved = true } = {}) {
    entites.forEach(entity => {
        if (!entity) return;
        entity.battleStopped = true;
        entity.stopPreparationAnimation?.();
        entity.stopRecoveryAnimation?.();
        entity.stopMysticismAnimation?.(false);
        entity.speedTimer = 0;
        entity.preparationTime = 0;
        entity.executionTime = 0;
        entity.recoveryTime = 0;
        entity.cooldownTimer = 0;
        entity.turnCount = 0;
        entity.status = 'inactive';
    });
    clearProjectileEffects(entites);

    if (notifyResolved) window.dispatchEvent(new CustomEvent('battleResolved', {
        detail: { outcome: battleOutcome }
    }));
}

function lockBattle(outcome) {
    if (battleOutcome) return false;
    window.dispatchEvent(new Event('battleEnding'));
    battleOutcome = outcome;
    gameOver = true;
    isGameOverHandled = true;
    gameStarted = false;
    stopAllIntervals();
    freezeBattleEntities();
    return true;
}

 
export function setGameOver(value) {
    gameOver = value;
    if (value === false) {
        battleOutcome = null;
        isGameOverHandled = false;
        battleResolutionInProgress = false;
    }
}

export function resetBattleResolution() {
    resetAttackSelectionRuntime();
    battleOutcome = null;
    gameOver = false;
    isGameOverHandled = false;
    battleResolutionInProgress = false;
}

function handleVictory({ skipGlobalStatus = false, escapedEnemies = [] } = {}) {
    if (!lockBattle("victory")) return false;

    console.log('Victoire !');
    const message = escapedEnemies.length ? 'L’armée adverse a pris la fuite !' : 'Victoire !';
    displayGameOverMessage(message);
    battleLogs("battle_victory", escapedEnemies.length ? { reason: 'enemy-escape', escapedEnemies } : {});
    removeFleeControls();
    manageBattleActions({ mode: BATTLE_ACTION_MODE.QUIT });

    const stageId = window.currentStageId || localStorage.getItem('currentStageId');
    if (stageId) {
        const victory = registerStageVictory(stageId);
        if (victory.isNewVictory) {
            console.log(`🏆 Première victoire du stage ${stageId}. Coffre créé : ${victory.chest?.id}`);
            window.dispatchEvent(new CustomEvent('stageVictoryChestCreated', { detail: victory }));
        } else {
            console.log(`ℹ️ Victoire du stage ${stageId} déjà enregistrée : aucun nouveau coffre.`);
        }
        MarkFinishedStage(stageId);
    }

    if (!skipGlobalStatus) GameStatut();
    return true;
}

export function triggerAdminStageVictory() {
    if (!isAdminMode() || window.levelRunning !== 'admin') {
        throw new Error('La victoire forcée est réservée au niveau administrateur.');
    }
    resetBattleResolution();
    return handleVictory({ skipGlobalStatus: true });
}

function handleDefeat() {
    if (!lockBattle("defeat")) return false;

    console.log('Défaite !');
    battleLogs("battle_defeat");
    displayGameOverMessage('Défaite !');
    removeFleeControls();
    // La défaite ne donne jamais un droit gratuit de quitter sous la menace.
    manageBattleActions({ mode: BATTLE_ACTION_MODE.HIDDEN });
    GameStatut();
    return true;
}

function handleDraw() {
    if (!lockBattle('draw')) return false;
    battleLogs('battle_draw');
    displayGameOverMessage('Double KO — Match nul !');
    removeFleeControls();
    manageBattleActions({ mode: BATTLE_ACTION_MODE.QUIT });
    refreshStageAccess();
    return true;
}

window.addEventListener('combatImpactsSettled', () => checkGameOver());

export function resolveBattleOutcome(entityList = entites) {
    if (isResolvingCombatImpacts()) return false;
    if (battleResolutionInProgress) return isBattleFinished();

    battleResolutionInProgress = true;
    try {
        const list = Array.isArray(entityList) ? entityList : entites;
        // Temporary changes of camp must never manufacture an end of combat.
        const originalSide = entity => entity?._combatOriginalSide ?? entity?.side;
        const originalA = list.filter(entity => originalSide(entity) === 'A' && !entity.hasFled);
        const originalB = list.filter(entity => originalSide(entity) === 'B' && !entity.hasFled);
        const remainingA = originalA.filter(entity => !isDead(entity)).length;
        const remainingB = originalB.filter(entity => !isDead(entity)).length;
        const escapedA = fledEntities.some(entity => originalSide(entity) === 'A');
        const escapedB = fledEntities.some(entity => originalSide(entity) === 'B');
        const terminal = (!remainingB && escapedB && remainingA > 0)
            || (originalB.length > 0 && !remainingB && !escapedB)
            || (originalA.length > 0 && !remainingA && !escapedA)
            || (!remainingA && escapedA && (remainingB > 0 || escapedB));
        if (!terminal) {
            if (gameStarted && !battleOutcome && list === entites) tryEnemyRunaway(list);
            return false;
        }
        // Synchronous cleanup restores camps and manual choices before computing the verdict.
        window.dispatchEvent(new Event('battleEnding'));
        const sideA = list.filter(entity => entity?.side === 'A' && !entity.hasFled);
        const sideB = list.filter(entity => entity?.side === 'B' && !entity.hasFled);
        const sideAAlive = sideA.filter(entity => !isDead(entity)).length;
        const sideBAlive = sideB.filter(entity => !isDead(entity)).length;
        const sideAFled = fledEntities.filter(entity => entity?.side === 'A').length;
        const sideBFled = fledEntities.filter(entity => entity?.side === 'B');

        console.log(`🧮 Résolution combat — A vivants: ${sideAAlive}, B vivants: ${sideBAlive}, A fuyards: ${sideAFled}`);

        // Both armies are evaluated after ALL impacts and survival effects.
        if (sideA.length > 0 && sideB.length > 0 && sideAAlive === 0 && sideBAlive === 0
            && sideAFled === 0 && sideBFled.length === 0) return handleDraw();

        // La victoire du stage est prioritaire si le dernier membre de B vient de mourir.
        if (sideBAlive === 0 && sideBFled.length && sideAAlive > 0) {
            return handleVictory({ skipGlobalStatus: true, escapedEnemies: sideBFled });
        }
        if (sideB.length > 0 && sideBAlive === 0 && !sideBFled.length) return handleVictory();

        // Une armée A entièrement morte est toujours une défaite.
        if (sideA.length > 0 && sideAAlive === 0 && sideAFled === 0) return handleDefeat();

        if (sideAAlive === 0 && sideAFled > 0 && (sideBAlive > 0 || sideBFled.length > 0)) {
            if (!lockBattle("escape")) return true;
            battleLogs("battle_escape");
            removeFleeControls();
            manageBattleActions({ mode: BATTLE_ACTION_MODE.QUIT });
            playRunawaySuccessAnimation();
            return true;
        }

        if (gameStarted && !battleOutcome && list === entites) tryEnemyRunaway(list);
        return false;
    } finally {
        battleResolutionInProgress = false;
    }
}

export function checkGameOver(entityList = entites) {
    // Ne jamais laisser un ancien verrou masquer une condition terminale réelle.
    if (battleOutcome) return true;
    return resolveBattleOutcome(entityList);
}

function MarkFinishedStage(stageId) {
    const gameStages = loadFromLocalStorage('GameStages', { stages: [] });
    const stage = gameStages.stages.find(s => String(s.id) === String(stageId));
    if (stage) {
        stage.statut = 'finished';
        saveToLocalStorage('GameStages', gameStages);
        console.log(`🏁 Stage ${stageId} marqué comme terminé (finished).`);

        const button = document.querySelector(`.level-button[data-storageid="${stageId}"]`);
        if (button) {
            button.setAttribute('data-statut', 'finished');
            if (typeof applyLevelStatusClasses === 'function') {
                applyLevelStatusClasses();
            }
        }
    }
}

function GameStatut() {
    const allDead = entites.filter(e => e.side === 'A' && !isDead(e) && !e.hasFled).length === 0;

    const allStages = loadFromLocalStorage('GameStages', { stages: [] });
    const stages = Array.isArray(allStages?.stages) ? allStages.stages : [];
    const stageId = window.currentStageId || localStorage.getItem('currentStageId');
    // An absent world is not a completed world (every() is true for an empty list).
    // A test outside that world's stages must not complete it either.
    const allStagesFinished = window.levelRunning !== 'admin' && stages.length > 0
        && stages.some(stage => stage?.id != null && String(stage.id) === String(stageId))
        && stages.every(stage => stage?.statut === 'finished');

    if (allDead) {
        GameWon = false;
        GameLost = true;
        isGameOverHandled = true;
		afficherEchecGlobal(); 
		
		
    }
    else if (!allDead && allStagesFinished) {
        GameWon = true;
        GameLost = false;
        isGameOverHandled = true;
        afficherVictoireGlobale(); 
    }
}
function afficherVictoireGlobale() {
    StopGame();

    const overlay = document.createElement('div');
    overlay.classList.add('overlay-end-screen', 'overlay-victory');

    const message = document.createElement('div');
    message.innerText = "Félicitation. Vous avez purifié le monde.";

    overlay.appendChild(message);
    ensureGameShell().appendChild(overlay);

    // Déclencher le fondu noir après une frame
    requestAnimationFrame(() => {
        overlay.classList.add('visible');
    });
}

function closeAdminGlobalGameOver(overlay, source = 'admin-event') {
    sessionStorage.removeItem('globalGameOverScreen');
    resetBattleResolution();
    GameWon = false;
    GameLost = false;

    overlay.classList.remove('visible');
    const removeOverlay = () => overlay.remove();
    overlay.addEventListener('transitionend', removeOverlay, { once: true });
    setTimeout(removeOverlay, 700);

    manageBattleActions({ mode: BATTLE_ACTION_MODE.AUTO });
    window.dispatchEvent(new CustomEvent('adminStageGameOverClosed', {
        detail: {
            source,
            savePreserved: true
        }
    }));
}

function afficherEchecGlobal({
    preserveSave = false,
    dismissible = false,
    source = 'game'
} = {}) {
    StopGame();

    if (preserveSave) {
        // L’événement admin utilise le vrai Game Over, mais ne doit jamais
        // armer le nettoyage de sauvegarde exécuté dans beforeunload.
        sessionStorage.removeItem('globalGameOverScreen');
    } else {
        sessionStorage.setItem('globalGameOverScreen', 'true');
    }

    document.querySelectorAll('.overlay-end-screen.overlay-defeat')
        .forEach(existingOverlay => existingOverlay.remove());

    const overlay = document.createElement('div');
    overlay.classList.add('overlay-end-screen', 'overlay-defeat');
    overlay.dataset.savePreserved = preserveSave ? 'true' : 'false';
    overlay.dataset.source = source;
	overlay.appendChild(gameOverScreenDesign());
    const message = document.createElement('div');
   message.innerHTML = "Game Over.<br>Vous avez échoué.<br>Vous n'êtes même pas un souvenir.";
 message.classList.add('game-over-msg');
    const reportButton = document.createElement('button');
    reportButton.classList.add('end-button');
    reportButton.innerText = "Voir le dernier rapport de bataille";

    reportButton.addEventListener('click', () => {
        const battleBookIcon = document.getElementById('battle-book-display');

        if (!battleBookIcon) {
            console.warn("Icône BattleBook introuvable.");
            return;
        }

        battleBookIcon.click();
    });

    const actionButton = document.createElement('button');
    actionButton.classList.add('end-button');

    if (dismissible) {
        actionButton.id = 'admin-stage-game-over-exit';
        actionButton.innerText = "Quitter l’écran Game Over";
        actionButton.addEventListener('click', () => {
            closeAdminGlobalGameOver(overlay, source);
        });
    } else {
        actionButton.id = 'restartEndButton';
        actionButton.innerText = "Recommencer";
        actionButton.addEventListener('click', restartAfterGlobalGameOver);
    }

    overlay.appendChild(message);
    overlay.appendChild(reportButton);
    overlay.appendChild(actionButton);
    ensureGameShell().appendChild(overlay);

    requestAnimationFrame(() => {
        overlay.classList.add('visible');
    });

    return {
        overlay,
        message,
        reportButton,
        actionButton,
        dismissButton: dismissible ? actionButton : null,
        savePreserved: preserveSave,
        dismissible
    };
}

export function triggerAdminStageGameOver({ source = 'admin-event' } = {}) {
    if (!isAdminMode() || window.levelRunning !== 'admin') {
        throw new Error('Le Game Over forcé est réservé au niveau administrateur.');
    }
    resetBattleResolution();
    lockBattle('defeat');

    GameWon = false;
    GameLost = true;
    isGameOverHandled = true;

    console.log('Défaite administrateur : affichage du véritable Game Over.');
    battleLogs('battle_defeat');
    removeFleeControls();
    manageBattleActions({ mode: BATTLE_ACTION_MODE.HIDDEN });

    return afficherEchecGlobal({
        preserveSave: true,
        dismissible: true,
        source
    });
}

function gameOverScreenDesign() {
    const decorContainer = document.createElement('div');
    decorContainer.classList.add('game-over-decor-container');

    const decorLeft = document.createElement('div');
    decorLeft.classList.add('game-over-decor', 'game-over-decor-top');

    const decorRight = document.createElement('div');
    decorRight.classList.add('game-over-decor', 'game-over-decor-bot');

    decorContainer.appendChild(decorLeft);
    decorContainer.appendChild(decorRight);

    return decorContainer;
}

function restartAfterGlobalGameOver() {
    sessionStorage.removeItem('globalGameOverScreen');

    localStorage.removeItem('BattleLogsIndex');

    Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).forEach(key => {
        if (key.startsWith('BattleLog_')) {
            localStorage.removeItem(key);
        }
    });

    resetFullGame();
    window.location.reload();
}
// Afficher le message de Game Over dans une div dynamique
function displayGameOverMessage(message) {
    if (String(message).trim() === 'Victoire !') {
        displayVictoryOutcomeMessage(message);
        return;
    }

    const existingDiv = document.getElementById('gameOverMessage');

    if (existingDiv) {
        existingDiv.innerText = message;

        const existingContainer = existingDiv.closest('.GameOverMessage');
        if (existingContainer && !existingContainer.querySelector('.open-last-battle-report-button')) {
            addLastBattleReportButton(existingContainer);
        }

        return;
    }

    const gameUI = document.querySelector(".Game-UI");
    if (!gameUI) {
        console.error("Erreur : Élément .Game-UI introuvable.");
        return;
    }

    const existingGameOverContainer = document.querySelector(".GameOverMessage");
    if (existingGameOverContainer) {
        existingGameOverContainer.remove();
    }

    const GameOverMsgDiv = document.createElement('div');
    GameOverMsgDiv.className = 'GameOverMessage';

    const gameOverDiv = document.createElement('div');
    gameOverDiv.id = 'gameOverMessage';
    gameOverDiv.className = 'IngameAlert';
    gameOverDiv.innerText = message;

    const closeButton = document.createElement('div');
    closeButton.className = 'close-button';
    closeButton.id = 'close-battle-report';
    closeButton.innerText = '×';

    closeButton.addEventListener('click', () => {
        GameOverMsgDiv.remove();
    });

    GameOverMsgDiv.appendChild(closeButton);
    GameOverMsgDiv.appendChild(gameOverDiv);

    addLastBattleReportButton(GameOverMsgDiv);

    gameUI.appendChild(GameOverMsgDiv);
}

function displayVictoryOutcomeMessage(message) {
    const gameUI = document.querySelector(".Game-UI");
    if (!gameUI) {
        console.error("Erreur : Élément .Game-UI introuvable.");
        return;
    }

    document.querySelector(".GameOverMessage")?.remove();

    const GameOverMsgDiv = document.createElement('div');
    GameOverMsgDiv.className = 'GameOverMessage victory-outcome-message';

    const gameOverDiv = document.createElement('div');
    gameOverDiv.id = 'gameOverMessage';
    gameOverDiv.className = 'IngameAlert victory-msg';
    gameOverDiv.innerText = message;

    GameOverMsgDiv.appendChild(gameOverDiv);
    gameUI.appendChild(GameOverMsgDiv);

    const removeMessage = () => GameOverMsgDiv.remove();
    gameOverDiv.addEventListener('animationend', removeMessage, { once: true });
    setTimeout(removeMessage, 4000);
}

function addLastBattleReportButton(container) {
    const button = document.createElement('button');
    button.className = 'open-last-battle-report-button';
    button.innerText = 'Voir le dernier rapport de bataille';

    button.addEventListener('click', () => {
        const existingBattleBook = document.getElementById('battle-book-window');

        if (existingBattleBook) {
            existingBattleBook.remove();
        }

        const battleBookIcon = document.getElementById('battle-book-display');

        if (!battleBookIcon) {
            console.warn("Icône BattleBook introuvable.");
            return;
        }

        battleBookIcon.click();
    });

    container.appendChild(button);
}

// Restore flags without resetting cooldowns or counting another battle.
export function restoreRunningBattle(orderSide = null) {
    gameStarted = true; gameOver = false; isGameOverHandled = false;
    battleOutcome = null; battleResolutionInProgress = false;
    setOrderSide(orderSide); refreshStageAccess();
}
