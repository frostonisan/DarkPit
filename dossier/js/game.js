import { updateEntiteClasses, logPositionsAndAnalyze, observeRoleChanges, updateGlobalRoleSbire, TraitementRolesSbires } from './load-entity.js';
import { entites, injectSavedEntities, syncExtraLifeCurrentFromRegen, updateExtraLifeRegenOrders, updateEternalLifeRegenOrders, syncEternalLifeCurrentFromRegen } from './entites.js';
import { entiteCamp, initFightEntites } from './fight.js';
import { getStyleProperties, calculerPointsHexagone, genererSvgHexagone, setupBoard, StageLoading } from './board.js';
import { createEntiteInDOM } from './createEntity.js';
import { HideGenerateLevelButton, toggleScanEntityListener, HexButtonVisibility, parallaxEffect, loadStageAnimation, helperDisplay, isRegenKey, toNonNegInt } from './ui.js';
import { screenLoadOptions } from './loaderList.js';
import { saveCurrentGameData, loadFromLocalStorage, saveToLocalStorage, getOrCreateGameID, setCurrentLevel, getCurrentLevel, purgeStatPreview, getVisibleHexes } from './GameStorage.js';
import {
    BATTLE_ACTION_MODE,
    configureBattleActionManager,
    hasSideBThreat,
    isBattleDialogueVisible,
    manageBattleActions,
    gameStarted,
    startGame,
    StopGame,
    stopAllIntervals,
    triggerAdminStageGameOver,
    triggerAdminStageVictory,
    setOrderSide
} from './gameState.js';
import { launchOrderCycleForSide } from './BattleOrder.js';
import { initializeAllMovementStatesAtBattleStart } from './damagesCalcul.js';
import { resetStoredArmorCurrentToMax, resetStoredShiftCurrentToStartingCharges } from './entityUpdatesStorage.js';
import { battleLogs } from './battleLogs.js';
import { attackSurprise, configureEventRuntime, initializeEvents } from './events.js';

let selectedBiome = null;
let selectedDifficulty = null;
let selectedSurpriseAttack = null;
let surpriseFleeLocked = false;
let surpriseAutoStartTimer = null;
let battleSystemsConfigured = false;

function isAdminLevel() {
    return window.levelRunning === 'admin';
}

function isPlayerSurprised(side = selectedSurpriseAttack) {
    if (typeof side !== 'string') return false;
    const normalizedSide = side.trim().toLowerCase();
    return normalizedSide === 'sideb' || normalizedSide === 'b';
}

function removeSurpriseLockedCombatControls() {
    document.querySelectorAll([
        '#startButton',
        '.launch-combat-button',
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

function unlockFleeAfterFirstCompletedTurn(event) {
    if (!surpriseFleeLocked || !isPlayerSurprised()) return;

    surpriseFleeLocked = false;
    console.log('Une entité a terminé son premier tour : la fuite est maintenant disponible.', event?.detail);

    if (gameStarted) {
        manageBattleActions({
            mode: BATTLE_ACTION_MODE.FLEE,
            entityList: entites
        });
    }
}

function configureBattleSystemsOnce() {
    if (battleSystemsConfigured) return;

    configureEventRuntime({
        quitLevel: () => QuitCurrentLevel(),
        stageVictory: () => triggerAdminStageVictory(),
        stageGameOverPreview: payload => triggerAdminStageGameOver({
            source: payload?.eventKey || 'admin-event'
        })
    });

    configureBattleActionManager({
        createStartButton: createStartCombatButton,
        createFleeButton: createFleeCombatButton,
        createQuitButton
    });

    document.addEventListener('entityTurnCompleted', unlockFleeAfterFirstCompletedTurn);

    battleSystemsConfigured = true;
}

// ✅ Chargement du jeu 
export async function launchLevel({ biome, difficulty, levelId, surpriseAttack = null }) {
    if (levelId) {
        setCurrentLevel(levelId); // 🔥 assure que currentLevel correspond au vrai niveau lancé
    }

    updateSelectedBiome(biome);
    updateSelectedDifficulty(difficulty);
    if (surpriseAutoStartTimer !== null) {
        window.clearTimeout(surpriseAutoStartTimer);
        surpriseAutoStartTimer = null;
    }
    selectedSurpriseAttack = surpriseAttack;
    surpriseFleeLocked = isPlayerSurprised(surpriseAttack);
    await loadGame();
}
function updateSelectedBiome(biome) {
    const gameStages = loadFromLocalStorage('GameStages', { stages: [] });
    const existingStage = gameStages.stages.find(stage => stage.biome_serial === biome);
    selectedBiome = existingStage ? existingStage.biome_serial : biome;
    document.dispatchEvent(new CustomEvent('biomeUpdated', { detail: selectedBiome }));
}

function updateSelectedDifficulty(difficulty) {
    const gameStages = loadFromLocalStorage('GameStages', { stages: [] });
    const stageIndex = gameStages.stages.findIndex(stage => stage.biome_serial === selectedBiome);
    if (stageIndex !== -1) {
        gameStages.stages[stageIndex].difficulty = difficulty;
        saveToLocalStorage('GameStages', gameStages);
        selectedDifficulty = difficulty;
    }
    document.dispatchEvent(new CustomEvent('difficultyUpdated', { detail: selectedDifficulty }));
}

function getRandomScreenLoad() {
    return screenLoadOptions[Math.floor(Math.random() * screenLoadOptions.length)];
}

function LoadingScreen() {
    const screen = getRandomScreenLoad();
	    // ✅ Vérifie si #game-windows existe
    let gameWindows = document.getElementById('game-windows');
    if (!gameWindows) {
        console.warn("⚠️ #game-windows introuvable, création automatique...");
        gameWindows = document.createElement('div');
        gameWindows.id = 'game-windows';
        document.body.appendChild(gameWindows);
    }

    const loadingScreen = document.createElement('div');
    loadingScreen.id = 'loadingScreen';
    loadingScreen.className = 'loading-screen';
    loadingScreen.style.backgroundColor = screen.backgroundColor;

    const hud = document.createElement('div');
    hud.className = 'loading-bar-hud';

    const desc = document.createElement('div');
    desc.className = 'loadingDescritpion';
    desc.innerHTML = `<h2 class="loadingTitle">${screen.titleContent}</h2><p class="loadingText">${screen.textContent}</p>`;

    const progressBarContainer = document.createElement('div');
    progressBarContainer.className = 'loading-bar-container';

    const progressBar = document.createElement('div');
    progressBar.id = 'loadingProgressBar';
    progressBar.className = 'loading-bar';
    progressBar.style.width = '0%';

    const percentText = document.createElement('span');
    percentText.className = 'pourcent-progressbar';
    percentText.textContent = '0%';

    progressBar.appendChild(percentText);
    progressBarContainer.appendChild(progressBar);

    const startMessage = document.createElement('h2');
    startMessage.className = 'loading-h2';
    startMessage.textContent = 'Chargement en cours...';

    hud.append(desc, progressBarContainer, startMessage);
    loadingScreen.appendChild(hud);

    if (screen.imageSrc) {
        const img = new Image();
        img.src = screen.imageSrc;
        img.className = 'loading-pic';
        img.onload = () => loadingScreen.appendChild(img);
    }

    document.getElementById('game-windows').appendChild(loadingScreen);

    return { progressBar, percentText, startMessage, loadingScreen };
}

function updateProgressBar(progress) {
    const bar = document.getElementById('loadingProgressBar');
    const text = document.querySelector('.pourcent-progressbar');
    if (bar) bar.style.width = `${progress}%`;
    if (text) text.textContent = `${progress}%`;
}
function isDialogueActive() {
    return isBattleDialogueVisible();
}

/**
 * Vérification obligatoire à chaque chargement du stage, premier lancement
 * comme rechargement F5. À cet instant, les entités sauvegardées, leurs camps,
 * le DOM du plateau et les événements ont déjà été restaurés.
 */
function initializeBattleActionsForLoadedStage() {
    const sideBThreat = hasSideBThreat(entites);
    const dialogueActive = isDialogueActive();

    const surpriseActionLock = isPlayerSurprised() && surpriseFleeLocked;
    const requestedMode = dialogueActive || surpriseActionLock
        ? BATTLE_ACTION_MODE.HIDDEN
        : isAdminLevel()
            // Un niveau admin doit pouvoir être lancé même avant que son
            // armée B soit composée depuis le panneau de génération.
            ? (gameStarted ? BATTLE_ACTION_MODE.FLEE : BATTLE_ACTION_MODE.START)
            : BATTLE_ACTION_MODE.AUTO;
    const managedResult = manageBattleActions({
        // AUTO tient aussi compte d'un clic éventuel survenu pendant les
        // tentatives : il ne recréera jamais START si le combat a commencé.
        mode: requestedMode,
        dialogueActive,
        entityList: entites
    });

    let result = managedResult;
    if (isAdminLevel() && requestedMode !== BATTLE_ACTION_MODE.HIDDEN) {
        const container = managedResult.container
            || document.querySelector('.Game-UI > .battle-actions');

        if (container) {
            if (requestedMode === BATTLE_ACTION_MODE.START) {
                createStartCombatButton(container);
            } else if (requestedMode === BATTLE_ACTION_MODE.FLEE) {
                createFleeCombatButton(container);
            }
            createQuitButton(container);
        }

        // La réconciliation doit contrôler l'action imposée par le niveau
        // admin, pas le fallback choisi selon la présence initiale d'ennemis.
        result = { ...managedResult, mode: requestedMode, container };
    }

    console.log('[BattleActions] État initial du stage :', {
        sideBThreat,
        dialogueActive,
        surpriseActionLock,
        requestedMode,
        selectedMode: result.mode,
        sideBEntities: entites
            .filter(entity => entity?.side === 'B')
            .map(entity => ({
                id: entity.id,
                name: entity.name,
                statut: entity.statut,
                isDEAD: entity.isDEAD,
                hasFled: entity.hasFled,
                hp: entity?.stats?.HP?.current
            }))
    });

    return result;
}

let battleActionReconcileToken = 0;

/**
 * Réconciliation finale après les animations/reconstructions de l'interface.
 * Une décision n'est validée que si le bouton attendu existe encore dans le
 * DOM et est bien rattaché à `.Game-UI`.
 */
function reconcileLoadedStageBattleActions() {
    const token = ++battleActionReconcileToken;
    const retryDelays = [0, 50, 150, 300, 600, 1000, 1600];

    const reconcile = () => {
        if (token !== battleActionReconcileToken) return;

        const result = initializeBattleActionsForLoadedStage();
        const expectedSelector = {
            [BATTLE_ACTION_MODE.START]: '#startButton, .launch-combat-button',
            [BATTLE_ACTION_MODE.FLEE]: [
                '.flee-button',
                '.escape-button',
                '.runaway-button',
                '[data-order="flee"]',
                '[data-order="escape"]',
                '[data-order="runaway"]'
            ].join(','),
            [BATTLE_ACTION_MODE.QUIT]: '.quit-level-button'
        }[result.mode];

        if (!expectedSelector) return;

        const actionElement = document.querySelector(expectedSelector);
        const correctlyMounted = Boolean(
            actionElement?.isConnected &&
            actionElement.closest('.Game-UI > .battle-actions')
        );

        if (!correctlyMounted) {
            console.warn('[BattleActions] Action absente après rendu, nouvelle tentative.', {
                mode: result.mode,
                expectedSelector
            });
        }
    };

    retryDelays.forEach(delay => window.setTimeout(reconcile, delay));
}

function createStartCombatButton(battleActions = null) {
    if (isPlayerSurprised()) {
        document.querySelectorAll('#startButton, .launch-combat-button')
            .forEach(element => element.remove());
        return null;
    }

    // En admin, Quitter reste disponible avant le lancement du combat.
    const controlsToRemove = [
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
    ];
    if (!isAdminLevel()) controlsToRemove.push('.quit-level-button');
    document.querySelectorAll(controlsToRemove.join(',')).forEach(element => element.remove());

    // Empêche les doublons
    const existing = document.querySelector(
        '#startButton, .launch-combat-button'
    );

    if (existing) {
        if (isAdminLevel() && battleActions) createQuitButton(battleActions);
        return existing;
    }

    if (!battleActions) {
        console.warn('[BattleActions] Conteneur directeur introuvable.');
        return null;
    }

    const startButton = document.createElement('div');
    startButton.id = 'startButton';
    startButton.className = 'launch-combat-button';
    startButton.textContent = 'Lancer les combats';

    startButton.style.opacity = '0';
    startButton.style.transition = 'opacity 2s ease';

    startButton.addEventListener('click', () => {
        saveCurrentGameData();
        battleLogs('battle_start');
        startGame();
        startButton.remove();
    });

    battleActions.appendChild(startButton);

    if (isAdminLevel()) {
        createQuitButton(battleActions);
    }

    requestAnimationFrame(() => {
        startButton.style.opacity = '1';
    });

    return startButton;
}

/** Affiche l'annonce uniquement pour un niveau possédant surpriseAttack. */
export function showSurpriseAttackAnnouncement(side) {
    const normalizedSide = typeof side === 'string' ? side.trim().toLowerCase() : '';
    if (normalizedSide !== 'sidea' && normalizedSide !== 'sideb') return null;

    const gameUI = document.querySelector('.Game-UI');
    if (!gameUI) {
        console.warn("Annonce d'attaque surprise impossible : .Game-UI introuvable.");
        return null;
    }

    gameUI.querySelector('.IngameAlert.surpriseAttack')?.remove();

    const announcement = document.createElement('span');
    announcement.className = 'IngameAlert surpriseAttack';
    announcement.textContent = normalizedSide === 'sideb'
        ? 'Vous subissez une attaque surprise !'
        : 'Vous réalisez une attaque surprise !';
    announcement.setAttribute('role', 'status');
    announcement.setAttribute('aria-live', 'polite');
    gameUI.appendChild(announcement);

    announcement.addEventListener('animationend', () => announcement.remove(), { once: true });
    window.setTimeout(() => announcement.remove(), 4500);
    return announcement;
}

function schedulePlayerSurprisedCombatStart() {
    if (!isPlayerSurprised()) return;

    removeSurpriseLockedCombatControls();
    if (surpriseAutoStartTimer !== null) {
        window.clearTimeout(surpriseAutoStartTimer);
    }

    surpriseAutoStartTimer = window.setTimeout(() => {
        surpriseAutoStartTimer = null;
        removeSurpriseLockedCombatControls();

        if (gameStarted) return;

        saveCurrentGameData();
        battleLogs('battle_start');
        startGame();
    }, 3000);
}

function displayStartMessage(startMessage, loadingScreen) {
    setTimeout(() => {
        startMessage.textContent =
            "Cliquer sur l'écran pour continuer";

        startMessage.classList.add('loaded');

        loadingScreen.addEventListener('click', () => {
            loadingScreen.style.transition =
                'opacity 0.5s ease';

            loadingScreen.style.opacity = '0';

            loadStageAnimation();

            setTimeout(() => {
                loadingScreen.remove();

                // Le niveau est désormais visible : l'annonce traverse .Game-UI.
                showSurpriseAttackAnnouncement(selectedSurpriseAttack);
                schedulePlayerSurprisedCombatStart();

                /*
                 * SÉCURITÉ 1 :
                 * un dialogue d'événement est actuellement affiché.
                 * Aucun bouton d'action ne doit exister.
                 */
                // L'animation de stage peut encore reconstruire `.Game-UI`.
                // On réconcilie donc l'action plusieurs fois après sa fin.
                reconcileLoadedStageBattleActions();
            }, 500);
        }, { once: true });
    }, 1000);
}
function recordLoadedEntityOriginalPositions() {
    entites.forEach(entity => {
        if (!entity) return;
        entity.originalPosition = entity.position ?? null;
    });
}

async function loadGame() {
    try {
		// Les modules ES sont maintenant complètement initialisés : on peut
		// enregistrer les factories sans déclencher de dépendance circulaire.
		configureBattleSystemsOnce();
		injectSavedEntities();
        initFightEntites();
        recordLoadedEntityOriginalPositions();

		console.log("🔍 Vérif entites avant tout :");
entites.forEach(ent => {
    console.log(`   ${ent.name} - nickname: ${ent.nickname} - stuff:`, ent.stuff);
});

        // Réinitialise toujours l'état entre deux niveaux, y compris lorsque
        // le nouveau niveau n'a pas d'attaque surprise.
        attackSurprise(null);
        const { startMessage, loadingScreen } = LoadingScreen();
		purgeStatPreview();
        StageLoading();
        updateEntiteClasses();
        entiteCamp(entites);
	
        const totalItems = entites.length + 3;
		setOrderSide(false);
        let loadedItems = 0;
 const increment = () => {
    loadedItems++;

    const progress = Math.floor(
        (loadedItems / totalItems) * 100
    );

    updateProgressBar(progress);
};

        await Promise.all(entites.map(entite => loadSprite(entite).then(increment)));

// Marque les entités vivantes avant leur création DOM. createEntiteInDOM()
// peut ainsi ajouter .surprised directement à leur propre img-container.
attackSurprise(selectedSurpriseAttack);

entites.forEach(entite => {
  try {
    createEntiteInDOM(entite);
  } catch (err) {
    console.error(
      `Erreur createEntiteInDOM pour ${entite?.name ?? entite?.id}:`,
      err
    );
    console.error(err?.stack);
    throw err;
  }
});
logPositionsAndAnalyze();
observeRoleChanges();
updateGlobalRoleSbire();
TraitementRolesSbires(); 
        

        const entityCount = entites.length;
        getStyleProperties();
        calculerPointsHexagone();
        genererSvgHexagone();
        setupBoard(entityCount);

        // Le plateau existe maintenant : appliquer la préférence du joueur à
        // chaque génération de stage sans modifier sa valeur sauvegardée.
        HexButtonVisibility(getVisibleHexes());

        parallaxEffect();
        HideGenerateLevelButton();
        toggleScanEntityListener();
        helperDisplay();

        // Le plateau et #game-windows sont prêts : restaurer d'abord une quête
        // en cours, sinon seulement vérifier les nouveaux déclencheurs.
       await initializeEvents({
    levelId: getCurrentLevel()
});

// La vérification effective est faite après la disparition de l'écran de
// chargement, car loadStageAnimation() peut reconstruire `.Game-UI`.

increment();
increment();
increment();

// On attend que les 3 états soient connus avant d'afficher l'action.
displayStartMessage(startMessage, loadingScreen);
    } catch (err) {
        console.error("Erreur lors du chargement :", err);
    }
}

function loadSprite(entite) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = entite.sprite;
        img.onload = () => resolve(entite);
        img.onerror = reject;
    });
}
export function createQuitButton(battleActions = null) {
    // Conserve la compatibilité avec les anciens appels directs tout en
    // faisant obligatoirement passer la décision par gameState.js.
    if (!battleActions) {
        manageBattleActions({ mode: BATTLE_ACTION_MODE.QUIT });
        return document.querySelector('.quit-level-button');
    }

    // Hors admin, Quitter reste une action exclusive. En admin, il demeure
    // visible aux côtés de Lancer avant combat, puis de Fuir après lancement.
    if (!isAdminLevel()) document.querySelectorAll([
        '#startButton',
        '.launch-combat-button',
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

    const existing = document.querySelector('.quit-level-button');

    if (existing) {
        return existing;
    }

    const btn = document.createElement('div');
    btn.className = 'quit-level-button';
    btn.textContent = 'Quitter le niveau';
    btn.addEventListener('click', QuitCurrentLevel);

    if (!battleActions) {
        console.warn('[BattleActions] Conteneur directeur introuvable.');
        return null;
    }

    battleActions.appendChild(btn);

    return btn;
}
function appendOrderButton(
    orderType,
    buttonText,
    buttonClass,
    battleActions
) {
    if (!battleActions) return null;

    const fleeOrders = [
        'flee',
        'escape',
        'runaway',
        'cancelrunaway'
    ];

    const isFleeButton = fleeOrders.includes(orderType);

    if (isFleeButton && surpriseFleeLocked) {
        return null;
    }

    if (isFleeButton) {
        // Fuir remplace Lancer. Quitter reste présent uniquement en admin.
        const controlsToRemove = ['#startButton', '.launch-combat-button'];
        if (!isAdminLevel()) controlsToRemove.push('.quit-level-button');
        document.querySelectorAll(controlsToRemove.join(',')).forEach(element => element.remove());
    }

    const existing = battleActions.querySelector(
        `[data-order="${CSS.escape(String(orderType))}"]`
    );
    if (existing) {
        if (isFleeButton && isAdminLevel()) createQuitButton(battleActions);
        return existing;
    }

    const btn = document.createElement('div');
    btn.className = buttonClass;
    btn.dataset.order = orderType;
    btn.textContent = buttonText;

    btn.addEventListener('click', () => {
        console.warn(
            `⚡ Ordre "${orderType}" déclenché pour le camp A !`
        );

        stopAllIntervals();
        launchOrderCycleForSide('A', orderType);

        btn.style.transition = 'opacity 0.5s ease';
        btn.style.opacity = '0';

        setTimeout(() => {
            btn.remove();
        }, 500);
    });

    battleActions.appendChild(btn);

    if (isFleeButton && isAdminLevel()) {
        createQuitButton(battleActions);
    }

    return btn;
}

function createFleeCombatButton(battleActions) {
    if (surpriseFleeLocked) return null;

    return appendOrderButton(
        'runaway',
        'Fuyez pauvres fous !',
        'runaway-button',
        battleActions
    );
}

export function createOrderButton(
    orderType,
    buttonText,
    buttonClass = 'order-button'
) {
    const fleeOrders = ['flee', 'escape', 'runaway', 'cancelrunaway'];
    const directedActions = manageBattleActions({
        mode: fleeOrders.includes(orderType)
            ? BATTLE_ACTION_MODE.FLEE
            : BATTLE_ACTION_MODE.ORDERS
    });

    return appendOrderButton(
        orderType,
        buttonText,
        buttonClass,
        directedActions.container
    );
}
function getGameDay() {
  const raw = localStorage.getItem('gameDay');
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

function setGameDay(day) {
  localStorage.setItem('gameDay', String(day));
}

export function nextDay(increment = 1, { animate = true } = {}) {
  const previousDay = getGameDay();
  const deltaDays = Math.max(0, Math.floor(Number(increment) || 0));
  const newDay = previousDay + deltaDays;

  setGameDay(newDay);
  console.log(`📅 Nouveau jour : ${newDay} (ajout de ${deltaDays} jour(s))`);

  // ✅ tick regen (localStorage)
  if (deltaDays > 0) {
    bumpExtraLifeRegenInStorage(deltaDays, newDay);
    bumpEternalLifeRegenInStorage(deltaDays, newDay); 
	  bumpDayHpRegenInStorage(deltaDays); 
  }

  if (animate) updateDayDisplayAnimated(newDay, previousDay);

  return { previousDay, newDay, deltaDays };
}


let dayAnimTimeoutA = null;
let dayAnimTimeoutB = null;

export function updateDayDisplayAnimated(newDay, previousDay) {
  const dayDiv = document.querySelector(".day-counter");
  if (!dayDiv) return;

  const dayValue = dayDiv.querySelector(".day-value");
  if (!dayValue) {
    // IMPORTANT : ne surtout pas faire dayDiv.textContent ici (ça détruit la structure)
    console.warn("⚠️ .day-counter trouvé mais .day-value absent -> aucune mise à jour.");
    return;
  }

  // Stopper une animation en cours (évite les chevauchements)
  if (dayAnimTimeoutA) clearTimeout(dayAnimTimeoutA);
  if (dayAnimTimeoutB) clearTimeout(dayAnimTimeoutB);
  dayAnimTimeoutA = null;
  dayAnimTimeoutB = null;

  // État initial : afficher le jour précédent uniquement via .day-value
  dayDiv.style.transition = "none";
  dayDiv.style.opacity = "1";
  dayDiv.style.transform = "scale(1)";
  dayValue.textContent = String(previousDay);

  // Reflow pour appliquer les styles avant transition
  dayDiv.offsetHeight;

  // Même logique d’animation que ton ancienne version
  dayAnimTimeoutA = setTimeout(() => {
    dayDiv.style.transition = "opacity 0.8s, transform 0.8s";
    dayDiv.style.opacity = "0";
    dayDiv.style.transform = "scale(0.8)";

    dayAnimTimeoutB = setTimeout(() => {
      dayDiv.style.transition = "none";
      dayValue.textContent = String(newDay); // ✅ SEULE MODIF DU JOUR
      dayDiv.style.opacity = "1";
      dayDiv.style.transform = "scale(1)";

      dayDiv.offsetHeight; // reflow (optionnel)
      dayDiv.style.transition = "opacity 0.8s, transform 0.8s";
    }, 800);
  }, 2000);
}

function bumpExtraLifeRegenOnEntity(entite, deltaDays, dayNow) {
  const regen = entite?.extraLifeRegen;
  if (!regen || typeof regen !== "object") return false;

  let changed = false;

  // ✅ lastUpdate doit être persisté même si rien ne bouge
  if (regen.lastUpdate !== dayNow) {
    regen.lastUpdate = dayNow;
    changed = true;
  }

  // ⛔️ STOP : pas de regen si l'entité est morte
  if (!isEntiteAlive(entite)) {
    return changed; // on garde seulement le tampon lastUpdate
  }

  // incrément regen
  for (const k of Object.keys(regen)) {
    if (!/^\d{3}$/.test(k)) continue;

    const slot = regen[k];
    if (!slot || typeof slot !== "object") continue;

    const maxRegen = toNonNegInt(slot.maxRegen);
    let curRegen = toNonNegInt(slot.currentRegen);

    if (curRegen > maxRegen) {
      slot.currentRegen = maxRegen;
      changed = true;
      continue;
    }

    if (curRegen < maxRegen) {
      const next = Math.min(maxRegen, curRegen + deltaDays);
      if (next !== curRegen) {
        slot.currentRegen = next;
        changed = true;
      }
    }
  }

  if (updateExtraLifeRegenOrders(entite)) changed = true;
  if (syncExtraLifeCurrentFromRegen(entite)) changed = true;

  return changed;
}

export function bumpExtraLifeRegenInStorage(deltaDays = 1, dayNow = 1) {
  const d = Math.max(0, toNonNegInt(deltaDays));
  if (d <= 0) return { changedA: false, changedB: false };

  // --- Army A ---
  const selectedArmyA = loadFromLocalStorage("selectedArmyA", []);
  let changedA = false;

  if (Array.isArray(selectedArmyA)) {
    for (const e of selectedArmyA) {
      if (bumpExtraLifeRegenOnEntity(e, d, dayNow)) changedA = true;
    }
    if (changedA) saveToLocalStorage("selectedArmyA", selectedArmyA);
  }

  // --- Army B ---
  const armyBData = loadFromLocalStorage("ArmyB", { armies: {} });
  let changedB = false;

  if (armyBData && typeof armyBData === "object" && armyBData.armies && typeof armyBData.armies === "object") {
    for (const armyKey of Object.keys(armyBData.armies)) {
      const army = armyBData.armies[armyKey];
      const entities = army?.entities;
      if (!Array.isArray(entities)) continue;

      for (const e of entities) {
        if (bumpExtraLifeRegenOnEntity(e, d, dayNow)) changedB = true;
      }
    }
    if (changedB) saveToLocalStorage("ArmyB", armyBData);
  }

  // Optionnel : si tu veux aussi “tamponner” PlayerSave / gameData après le tick
  if (changedA || changedB) {
    saveCurrentGameData();
  }

  return { changedA, changedB };
}

export function isEntiteAlive(entite) {
  const hp = entite?.stats?.HP?.current;

  // ✅ Si on a une valeur HP fiable, elle tranche.
  if (typeof hp === "number") {
    if (hp <= 0) return false;
  }

  const st = entite?.statut;

  // dead prioritaire
  if (Array.isArray(st)) {
    if (st.includes("dead")) return false;
    if (st.includes("alive")) return true;
  } else if (typeof st === "string") {
    if (st === "dead") return false;
    if (st === "alive") return true;
  }

  // fallback final (si ni HP ni statut exploitable)
  return true;
}

function bumpEternalLifeRegenOnEntity(entite, deltaDays, dayNow) {
  const regen = entite?.eternalLifeRegen;
  if (!regen || typeof regen !== "object") return false;

  let changed = false;

  if (regen.lastUpdate !== dayNow) {
    regen.lastUpdate = dayNow;
    changed = true;
  }

  // ⛔️ STOP : pas de regen si l'entité est morte
  if (!isEntiteAlive(entite)) {
    return changed; // on garde seulement le tampon lastUpdate
  }

  // ✅ Unicité : prune immédiatement
  for (const k of Object.keys(regen)) {
    if (/^\d{3}$/.test(k) && k !== "001") {
      delete regen[k];
      changed = true;
    }
  }

  const slot = regen["001"];
  if (!slot || typeof slot !== "object") return changed;

  const maxRegen = 1;
  if (slot.maxRegen !== maxRegen) {
    slot.maxRegen = maxRegen;
    changed = true;
  }

  let cur = toNonNegInt(slot.currentRegen);
  if (cur > 1) {
    slot.currentRegen = 1;
    changed = true;
    cur = 1;
  }

  if (cur < 1) {
    const next = Math.min(1, cur + toNonNegInt(deltaDays));
    if (next !== cur) {
      slot.currentRegen = next;
      changed = true;
    }
  }

  if (updateEternalLifeRegenOrders(entite)) changed = true;
  if (syncEternalLifeCurrentFromRegen(entite)) changed = true;

  return changed;
}

export function bumpEternalLifeRegenInStorage(deltaDays = 1, dayNow = 1) {
  const d = Math.max(0, toNonNegInt(deltaDays));
  if (d <= 0) return { changedA: false, changedB: false };

  // --- Army A ---
  const selectedArmyA = loadFromLocalStorage("selectedArmyA", []);
  let changedA = false;

  if (Array.isArray(selectedArmyA)) {
    for (const e of selectedArmyA) {
      if (bumpEternalLifeRegenOnEntity(e, d, dayNow)) changedA = true;
    }
    if (changedA) saveToLocalStorage("selectedArmyA", selectedArmyA);
  }

  // --- Army B ---
  const armyBData = loadFromLocalStorage("ArmyB", { armies: {} });
  let changedB = false;

  if (armyBData && typeof armyBData === "object" && armyBData.armies && typeof armyBData.armies === "object") {
    for (const armyKey of Object.keys(armyBData.armies)) {
      const army = armyBData.armies[armyKey];
      const entities = army?.entities;
      if (!Array.isArray(entities)) continue;

      for (const e of entities) {
        if (bumpEternalLifeRegenOnEntity(e, d, dayNow)) changedB = true;
      }
    }
    if (changedB) saveToLocalStorage("ArmyB", armyBData);
  }

  if (changedA || changedB) {
    saveCurrentGameData();
  }

  return { changedA, changedB };
}
function bumpDayHpRegenOnEntity(entite, deltaDays = 1) {
  if (!entite || !entite.stats) return false;

  // ⛔️ pas de heal si morte
  if (!isEntiteAlive(entite)) return false;

  const hpObj = entite.stats.HP;
  if (!hpObj || typeof hpObj !== "object") return false;

  const maxHP = toNonNegInt(hpObj.max);
  const curHP = toNonNegInt(hpObj.current);

  if (maxHP <= 0) return false;

  const perDay = toNonNegInt(entite.stats.dayHpRegen ?? 0);
  if (perDay <= 0) return false;

  const d = Math.max(0, toNonNegInt(deltaDays));
  if (d <= 0) return false;

  const heal = perDay * d;
  const nextHP = Math.min(maxHP, curHP + heal);

  if (nextHP !== curHP) {
    entite.stats.HP.current = nextHP;
    return true;
  }

  return false;
}

export function bumpDayHpRegenInStorage(deltaDays = 1) {
  const d = Math.max(0, toNonNegInt(deltaDays));
  if (d <= 0) return { changedA: false, changedB: false };

  // --- Army A ---
  const selectedArmyA = loadFromLocalStorage("selectedArmyA", []);
  let changedA = false;

  if (Array.isArray(selectedArmyA)) {
    for (const e of selectedArmyA) {
      if (bumpDayHpRegenOnEntity(e, d)) changedA = true;
    }
    if (changedA) saveToLocalStorage("selectedArmyA", selectedArmyA);
  }

  // --- Army B ---
  const armyBData = loadFromLocalStorage("ArmyB", { armies: {} });
  let changedB = false;

  if (armyBData && typeof armyBData === "object" && armyBData.armies && typeof armyBData.armies === "object") {
    for (const armyKey of Object.keys(armyBData.armies)) {
      const army = armyBData.armies[armyKey];
      const entities = army?.entities;
      if (!Array.isArray(entities)) continue;

      for (const e of entities) {
        if (bumpDayHpRegenOnEntity(e, d)) changedB = true;
      }
    }
    if (changedB) saveToLocalStorage("ArmyB", armyBData);
  }

  // (Optionnel) aussi sur les entités live en mémoire (si une session est en cours)
  if (Array.isArray(entites)) {
    for (const e of entites) bumpDayHpRegenOnEntity(e, d);
  }

  if (changedA || changedB) saveCurrentGameData();

  return { changedA, changedB };
}

export function QuitCurrentLevel() {
  // ⛔ Anti double-clic / double event
  if (window.__QUIT_LEVEL_LOCK__) return;
  window.__QUIT_LEVEL_LOCK__ = true;

  if (surpriseAutoStartTimer !== null) {
    window.clearTimeout(surpriseAutoStartTimer);
    surpriseAutoStartTimer = null;
  }
  surpriseFleeLocked = false;

  try {
    console.log("🚪 Le joueur quitte le niveau...");
    StopGame();

    // ─────────────────────────────────────────────
    // 1) SAUVEGARDES
    // ─────────────────────────────────────────────

    // 🔒 Sauvegarde Armée A
    if (!window.selectedArmyA || window.selectedArmyA.length === 0) {
      const restored = loadFromLocalStorage("selectedArmyA");
      if (restored?.length) {
        window.selectedArmyA = restored;
        console.log("🔁 Armée A restaurée depuis le localStorage avant sauvegarde.");
      }
    }
    const updatedArmyA = loadFromLocalStorage("selectedArmyA", []);
    saveToLocalStorage("selectedArmyA", updatedArmyA);
    window.selectedArmyA = updatedArmyA;

    // 🔒 Sauvegarde Armée B
    if (window.selectedArmyB && window.ArmyB_id) {
      saveToLocalStorage(`ArmyB-${window.ArmyB_id}`, window.selectedArmyB);
      console.log(`📦 Armée B (ArmyB-${window.ArmyB_id}) sauvegardée.`);
    } else {
      console.warn("⚠️ Aucune armée B trouvée à sauvegarder.");
    }

    // ─────────────────────────────────────────────
    // 2) PURGE TOTALE DU BODY (SAUF #game-windows)
    // ─────────────────────────────────────────────
    purgeBodyExceptGameWindows();

    // ─────────────────────────────────────────────
    // 3) RESET STRICT DE #game-windows
    // ─────────────────────────────────────────────
    const gameWindows = document.getElementById("game-windows");
    if (!gameWindows) {
      console.warn("⚠️ game-windows introuvable...");
      return;
    }

    // Reset complet.
    // Ne jamais conserver #game-id-display séparément :
    // AdminButtons() le recrée ensuite dans .admin-commands.
    gameWindows.innerHTML = "";

    // Recrée un container clean
    const container = document.createElement("div");
    container.id = "game-container";
    gameWindows.appendChild(container);

    // ─────────────────────────────────────────────
    // 4) GESTION DU JOUR + RETOUR WORLDMAP
    // ─────────────────────────────────────────────
    let previousDay = parseInt(localStorage.getItem("gameDay"), 10) || 1;
    let newDay = previousDay;

    const worldmap_id = localStorage.getItem("worldmap_id");
    if (worldmap_id) {
      setCurrentLevel(worldmap_id);
resetStoredArmorCurrentToMax();
resetStoredShiftCurrentToStartingCharges();
      // Capture AVANT incrément
      previousDay = parseInt(localStorage.getItem("gameDay"), 10) || 1;

      nextDay();
      purgeStatPreview();

      // Nouveau jour
      newDay = parseInt(localStorage.getItem("gameDay"), 10) || 1;

      window.levelRunning = "worldmap";
      console.log(`🌍 Retour à la World Map (currentLevel = ${worldmap_id})`);
    } else {
      console.error("❌ worldmap_id manquant, impossible de revenir sur la carte !");
    }

    // ─────────────────────────────────────────────
    // 5) REBUILD UI WORLDMAP (UNE SEULE FOIS)
    // ─────────────────────────────────────────────
Promise.all([
  import("./admin.js"),
  import("./GameInit.js"),
  import("./newgame.js")
])
.then(([admin, gameInit, newgame]) => {
  console.log("🔄 Carte relancée !");

  // 1) Toujours d’abord : structure DOM (helper + game-windows + container)
  gameInit.createGameContainer();

  // 2) Ensuite seulement : UI qui dépend du container
  gameInit.GameUi();
  gameInit.initializeArmyConfig();
  gameInit.PlayerArmyCodex();

  // 3) Admin + boutons + tooltips ensuite
  admin.AdminButtons();

  newgame.determineAndGenerateButtons();
  newgame.initializeTooltips();
  newgame.initializeButtonClicks();
  newgame.applyLevelStatusClasses();

  updateDayDisplayAnimated(newDay, previousDay);
})
.catch(err => {
  console.error("❌ Erreur lors du rebuild World Map :", err);
}).finally(() => {
      window.__QUIT_LEVEL_LOCK__ = false;
    });

  } catch (e) {
    console.error("❌ QuitCurrentLevel a crash :", e);
    window.__QUIT_LEVEL_LOCK__ = false;
  }
}


// ─────────────────────────────────────────────
// PURGE : conserve uniquement #game-windows dans <body>
// ─────────────────────────────────────────────
function purgeBodyExceptGameWindows() {
  const gw = document.getElementById("game-windows");
  if (!gw) return;

  [...document.body.children].forEach(node => {
    if (node !== gw) node.remove();
  });
}


import './dragndrop.js';
