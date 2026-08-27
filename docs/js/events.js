import { entites, entitesNestUp, RemoveEntite } from './entites.js';
import { createEntityIngame } from './createEntity.js';
import { removeBattleElementFromDOM } from './createBattleElements.js';
import { closeOpenLootInterfaces, destroyChest as destroyChestLoot, restoreVacatedHexSocleOpacity } from './loot.js';
import { battleLogs } from './battleLogs.js';
import { startGame } from './gameState.js';
import { getCurrentLevel, getOrCreateStageChest, getStageChests, getVisibleHexes, loadFromLocalStorage, loadPlayerInfo, loadQuestState, saveCurrentGameData, saveToLocalStorage, updateQuestState } from './GameStorage.js';
import { eventList, getEventDefinition as getListedEventDefinition } from './eventList.js';
import { closeDialogue as closeDialogueWindowRaw, renderDialogueScreen } from './dialogue.js';
import { LifeandDeath } from './entityAttributs.js';
import { PopUpDamages } from './dom.js';
import { updateHealthBar } from './UpgradeEntity.js';
import { saveEntityArmorState, saveEntityHPToStorage } from './entityUpdatesStorage.js';
import { damageImpact, damageArmorImpact, shakeImpact, createSpeedTrail, RunawayAnimation, runawayInfosBulle, animationProjectile, animationMelee, destructionItemAnimation } from './entitesAnimation.js';
import { attackDetails } from './attackList.js';
import { attackEffects } from './attackEffects.js';
import { stats } from './statsData.js';
import { hexCoordonne } from './board.js';
import { cinematicView, restoreParallaxViewAndControls } from './ui.js';

const runtimeAdapters = Object.create(null);
const runtimeEventDefinitions = new Map();
const eventSpawnAnimations = new Map();
const wanderingTheatreSessions = new Map();

const DESTROYED_CORPSE_STORAGE_KEY = 'EventDestroyedCorpseMarkers';
const PERSISTENT_CORPSE_LOOT_STORAGE_KEY = 'PersistentCorpseLootSources';
const DESTROYED_CORPSE_SPRITE_URL = './media/assets/misc/corspe-destroyed.png';

export function registerEventDefinition(eventDefinition) {
  if (!eventDefinition?.key || !eventDefinition?.id || !eventDefinition?.nodes) {
    throw new TypeError('[Events] Définition d’événement invalide.');
  }
  runtimeEventDefinitions.set(String(eventDefinition.key), eventDefinition);
  return eventDefinition;
}

function resolveEventDefinition(keyOrId) {
  const normalizedKeyOrId = String(keyOrId);
  return runtimeEventDefinitions.get(normalizedKeyOrId)
    || [...runtimeEventDefinitions.values()].find((eventDefinition) => (
      String(eventDefinition.id) === normalizedKeyOrId
    ))
    || getListedEventDefinition(keyOrId)
    || null;
}

function getRuntimeEventDefinitions() {
  return [...runtimeEventDefinitions.values()];
}

eventList.forEach(registerEventDefinition);

let eventsInitialized = false;
let activeLevelId = null;
let transitionLocked = false;
let surprisedSide = null;
const pendingActionNodeResolutions = new Map();
const CHOICE_RESOLUTION_FLOOR = 3;
const CHOICE_RESOLUTION_POOL = 100 - (CHOICE_RESOLUTION_FLOOR * 3);

// Réglages cinématiques : durée de transition, puis pause avant l’action.
export let EVENT_CINEMATIC_SOFT_TRANSITION_DURATION = 1000;
export let EVENT_CINEMATIC_HARD_TRANSITION_DURATION = 2000;
export let EVENT_CINEMATIC_SOFT_ACTION_SAFETY_DELAY = 500;
export let EVENT_CINEMATIC_HARD_ACTION_SAFETY_DELAY = 1000;
export let EVENT_SPAWN_CHARGE_DURATION = 700;
export let EVENT_SPAWN_CHARGE_OUTSIDE_OFFSET = 150;
export let EVENT_RUNAWAY_THEATRE_DURATION = 850;
export let EVENT_RUNAWAY_THEATRE_OUTSIDE_OFFSET = 180;
export let EVENT_WANDERING_THEATRE_STEPS = 6;
export let EVENT_WANDERING_THEATRE_MIN_STEP_DURATION = 650;
export let EVENT_WANDERING_THEATRE_MAX_STEP_DURATION = 1050;
export let EVENT_WANDERING_THEATRE_MIN_PAUSE = 90;
export let EVENT_WANDERING_THEATRE_MAX_PAUSE = 240;
let cinematicDialogueReadyAt = 0;
let cinematicCloseTimer = null;
let cinematicDialogueTimer = null;
let activeEventCinematicMode = null;
let cinematicPerspectiveEngaged = false;
let dialogueClosureRestorePromise = null;
let eventDialogueWasVisible = false;
let eventActionScreenDepth = 0;
let cinematicScreenFXShakeTimer = null;
let cinematicScreenFXSuccessFlashAnimation = null;
let eventTargetTraceId = 0;
const CINEMATIC_SCREEN_FX_OUTCOMES = new Set(['success', 'middle', 'fail']);
const EVENT_CINEMATIC_MODES = new Set(['soft', 'hard']);
const CINEMATIC_SCREEN_FX_SHAKE_DURATION = 460;
const EVENT_CAPTURE_REGISTRY_KEY = 'eventCapturedEntities';
const CHOICE_RESOLUTION_TITLES = Object.freeze({
  success: 'Succès !',
  middle: 'Vous ne vous en sortez pas trop mal.',
  fail: 'Échec !'
});
const CHOICE_RESOLUTION_STATS = Object.freeze({
  agility: Object.freeze({
    success: 'agility',
    middle: 'strength',
    fail: 'intelligence'
  }),
  strength: Object.freeze({
    success: 'strength',
    middle: 'intelligence',
    fail: 'agility'
  }),
  intelligence: Object.freeze({
    success: 'intelligence',
    middle: 'agility',
    fail: 'strength'
  })
});
const STAGE_VICTORY_COMPLETE_ADAPTERS = Object.freeze([
  'stageVictory',
  'completeStageVictory',
  'winStage',
  'victoryStage',
  'victory',
  'triggerVictory',
  'runVictory'
]);
const STAGE_VICTORY_COMPONENT_ADAPTERS = Object.freeze([
  Object.freeze(['victoryVisuals', 'showVictoryVisuals']),
  Object.freeze(['victoryAudio', 'playVictoryAudio']),
  Object.freeze(['victoryRewards', 'applyVictoryRewards'])
]);
const STAGE_GAME_OVER_PREVIEW_ADAPTERS = Object.freeze([
  'stageGameOverPreview',
  'gameOverPreview',
  'showStageGameOver',
  'defeatPreview'
]);
const STAGE_GAME_OVER_COMPONENT_ADAPTERS = Object.freeze([
  Object.freeze(['gameOverVisuals', 'showGameOverVisuals', 'defeatVisuals', 'showDefeatVisuals']),
  Object.freeze(['defeatAudio', 'playDefeatAudio']),
  Object.freeze(['defeatSummary', 'showDefeatSummary'])
]);

function eventCinematicTransitionDuration(mode = null) {
  const resolvedMode = String(mode || activeEventCinematicMode || 'hard')
    .trim()
    .toLowerCase();
  const configuredDuration = resolvedMode === 'soft'
    ? EVENT_CINEMATIC_SOFT_TRANSITION_DURATION
    : EVENT_CINEMATIC_HARD_TRANSITION_DURATION;
  return Math.max(0, Number(configuredDuration) || 0);
}

function eventCinematicActionSafetyDelay(mode = null) {
  const resolvedMode = String(mode || 'hard').trim().toLowerCase();
  const configuredDelay = resolvedMode === 'soft'
    ? EVENT_CINEMATIC_SOFT_ACTION_SAFETY_DELAY
    : EVENT_CINEMATIC_HARD_ACTION_SAFETY_DELAY;
  return Math.max(0, Number(configuredDelay) || 0);
}

function configureEventCinematicTransitions(cinematic, mode = null) {
  if (!cinematic) return null;

  const duration = eventCinematicTransitionDuration(
    mode || cinematic.dataset.cinematicMode
  );
  cinematic.style.setProperty('--cinematic-duration', `${duration}ms`);
  cinematic.style.removeProperty('transition');

  // Le CSS pilote aussi le délai de `visibility` du parent. Des transitions
  // inline sur ces éléments le remplaçaient et rendaient les bandes invisibles
  // avant même leur mouvement de sortie.
  cinematic.querySelectorAll(
    '.cinematic-broder, .border-top, .border-bottom'
  ).forEach((element) => {
    element.style.removeProperty('transition');
    element.style.removeProperty('will-change');
  });

  const cinematicCorp = cinematic.querySelector('.cinematic-corp');
  if (cinematicCorp) {
    cinematicCorp.style.removeProperty('transition');
    cinematicCorp.style.removeProperty('will-change');
    cinematicCorp.style.removeProperty('opacity');
  }

  return cinematic;
}

function enterEventCinematicOverlay(cinematic) {
  if (!cinematic) return null;
  configureEventCinematicTransitions(cinematic);
  cinematic.classList.remove('is-action-running');

  // État fermé réellement calculé avant d’ouvrir les bandes et le voile.
  void cinematic.offsetWidth;
  cinematic.classList.add('is-visible');
  return cinematic;
}

function exitEventCinematicOverlay(cinematic, mode = null) {
  if (!cinematic) return null;
  configureEventCinematicTransitions(cinematic, mode);

  // `is-visible` est la source unique des transitions de sortie : le voile
  // revient à opacity 0 et les deux bandes glissent hors de l’écran.
  void cinematic.offsetWidth;
  cinematic.classList.remove(
    'event-cinematic-soft',
    'event-cinematic-hard',
    'event-cinematic-choice',
    'is-action-running',
    'is-visible'
  );
  delete cinematic.dataset.cinematicMode;

  return cinematic;
}

function setEventCinematicScreenTheme(cinematic, node) {
  if (!cinematic) return null;
  cinematic.classList.toggle('event-cinematic-choice', node?.type === 'choices');
  return cinematic;
}

function ensureEventCinematicElement() {
  const gameWindows = document.getElementById('game-windows');
  if (!gameWindows) {
    console.warn('Mode cinématique impossible : #game-windows est introuvable.');
    return null;
  }

  let cinematic = gameWindows.querySelector(':scope > .event-cinematic');
  if (cinematic) return configureEventCinematicTransitions(cinematic);

  cinematic = document.querySelector('.event-cinematic');
  if (cinematic) {
    gameWindows.appendChild(cinematic);
    return configureEventCinematicTransitions(cinematic);
  }

  cinematic = document.createElement('div');
  cinematic.className = 'event-cinematic';
  cinematic.setAttribute('aria-hidden', 'true');
  cinematic.innerHTML = `
    <div class="cinematic-broder">
      <div class="border-top"></div>
      <div class="border-bottom"></div>
    </div>
    <div class="cinematic-corp"></div>
  `;
  gameWindows.appendChild(cinematic);
  return configureEventCinematicTransitions(cinematic);
}

function waitEventMilliseconds(duration) {
  const delay = Math.max(0, Number(duration) || 0);
  return delay > 0
    ? new Promise((resolve) => setTimeout(resolve, delay))
    : Promise.resolve();
}

function normalizeEventCinematicMode(value = null) {
  if (value == null || value === '') return null;

  const mode = String(value).trim().toLowerCase();

  if (!EVENT_CINEMATIC_MODES.has(mode)) {
    throw new TypeError(
      `[Events] Mode cinematic invalide (${String(value)}). Valeurs : soft, hard.`
    );
  }
  return mode;
}

function setEventCinematicElementMode(cinematic, mode) {
  if (!cinematic) return null;
  cinematic.classList.remove(
    'event-cinematic-soft',
    'event-cinematic-hard'
  );
  cinematic.classList.add(`event-cinematic-${mode}`);
  cinematic.dataset.cinematicMode = mode;
  return configureEventCinematicTransitions(cinematic, mode);
}

/**
 * Applique l’unique mode cinématique d’un écran.
 *
 * soft : affiche voile/bandes en conservant la perspective normale.
 * hard : affiche voile/bandes et engage la perspective cinématique.
 *
 * Sans paramètre `cinematic`, cette fonction n’est normalement pas appelée.
 * Un appel sans valeur reste malgré tout strictement sans effet.
 */
export function setEventCinematicMode(value = null) {
  const mode = normalizeEventCinematicMode(value);
  const previousMode = activeEventCinematicMode;
  const duration = eventCinematicTransitionDuration(mode);
  const existingCinematic = document.querySelector('.event-cinematic');

  if (mode == null) {
    return {
      element: existingCinematic,
      mode: null,
      previousMode,
      visible: existingCinematic?.classList.contains('is-visible') === true,
      perspectiveChanged: false,
      unchanged: true,
      delay: 0
    };
  }

  clearTimeout(cinematicCloseTimer);
  clearTimeout(cinematicDialogueTimer);
  cinematicCloseTimer = null;
  cinematicDialogueTimer = null;
  cinematicScreenFX(false);

  const cinematic = setEventCinematicElementMode(
    ensureEventCinematicElement(),
    mode
  );
  if (!cinematic) {
    let perspectiveChanged = false;
    if (cinematicPerspectiveEngaged) {
      restoreParallaxViewAndControls();
      cinematicPerspectiveEngaged = false;
      perspectiveChanged = true;
    }
    activeEventCinematicMode = null;
    cinematicDialogueReadyAt = 0;
    return {
      element: null,
      mode: null,
      previousMode,
      visible: false,
      perspectiveChanged,
      delay: perspectiveChanged ? duration : 0
    };
  }

  const overlayEntering = !cinematic.classList.contains('is-visible');
  if (overlayEntering) {
    enterEventCinematicOverlay(cinematic);
  }
  cinematic.setAttribute('aria-hidden', 'false');

  let perspectiveChanged = false;
  if (mode === 'hard' && !cinematicPerspectiveEngaged) {
    cinematicView();
    cinematicPerspectiveEngaged = true;
    perspectiveChanged = true;
  } else if (mode === 'soft' && cinematicPerspectiveEngaged) {
    restoreParallaxViewAndControls();
    cinematicPerspectiveEngaged = false;
    perspectiveChanged = true;
  }

  const delay = overlayEntering || perspectiveChanged ? duration : 0;
  activeEventCinematicMode = mode;
  cinematicDialogueReadyAt = Date.now() + delay;
  return {
    element: cinematic,
    mode,
    previousMode,
    visible: true,
    perspectiveChanged,
    delay
  };
}

function beginEventCinematicAction(value) {
  const mode = normalizeEventCinematicMode(value);
  if (mode == null) return null;

  const duration = eventCinematicTransitionDuration(mode);
  const cinematic = document.querySelector('.event-cinematic');
  const previousMode = activeEventCinematicMode;
  const overlayWasVisible = cinematic?.classList.contains('is-visible') === true;
  const perspectiveWasEngaged = cinematicPerspectiveEngaged === true;

  if (cinematic) {
    configureEventCinematicTransitions(cinematic, mode);
    cinematic.classList.remove('event-cinematic-choice');
    if (overlayWasVisible) {
      void cinematic.offsetWidth;
      cinematic.classList.add('is-action-running');
    }
  }

  let perspectiveChanged = false;
  if (mode === 'hard' && cinematicPerspectiveEngaged) {
    restoreParallaxViewAndControls();
    cinematicPerspectiveEngaged = false;
    perspectiveChanged = true;
  }

  const delay = overlayWasVisible || perspectiveChanged ? duration : 0;
  cinematicDialogueReadyAt = Date.now() + delay;
  return {
    cinematic,
    mode,
    previousMode,
    overlayWasVisible,
    perspectiveWasEngaged,
    perspectiveChanged,
    delay
  };
}

async function restoreEventCinematicAfterAction(session) {
  if (!session) return { restored: false, delay: 0 };

  const {
    cinematic,
    mode,
    previousMode,
    overlayWasVisible,
    perspectiveWasEngaged
  } = session;

  // Une fermeture réelle (combat, sortie de niveau, fin d’événement) reste
  // prioritaire et ne doit jamais être annulée par la fin d’une action.
  if (activeEventCinematicMode !== previousMode) {
    return { restored: false, reason: 'cinematic-lifecycle-changed', delay: 0 };
  }

  let overlayReturning = false;
  if (overlayWasVisible && cinematic && cinematic.isConnected !== false) {
    configureEventCinematicTransitions(cinematic, mode);
    void cinematic.offsetWidth;
    cinematic.classList.remove('is-action-running');
    cinematic.setAttribute('aria-hidden', 'false');
    overlayReturning = true;
  }

  let perspectiveChanged = false;
  if (mode === 'hard' && perspectiveWasEngaged && !cinematicPerspectiveEngaged) {
    cinematicView();
    cinematicPerspectiveEngaged = true;
    perspectiveChanged = true;
  }

  const delay = overlayReturning || perspectiveChanged
    ? eventCinematicTransitionDuration(mode)
    : 0;
  cinematicDialogueReadyAt = Date.now() + delay;
  await waitEventMilliseconds(delay);

  return {
    restored: overlayReturning || perspectiveChanged,
    overlayReturning,
    perspectiveChanged,
    delay
  };
}

/**
 * Ferme la cinématique au titre du cycle de vie de l’événement.
 * Cette opération n’est jamais déclenchée par l’absence du paramètre
 * `cinematic` sur un écran.
 */
async function closeEventCinematic() {
  const previousMode = activeEventCinematicMode;
  const duration = eventCinematicTransitionDuration(previousMode);
  const cinematic = document.querySelector('.event-cinematic');

  // Les garde-fous peuvent converger vers la même fermeture. On laisse la
  // première sortie aller jusqu’au bout au lieu de couper son animation.
  if (activeEventCinematicMode == null && cinematicCloseTimer && cinematic) {
    const delay = Math.max(0, cinematicDialogueReadyAt - Date.now());
    await waitEventMilliseconds(delay);
    return {
      element: cinematic,
      previousMode,
      visible: false,
      perspectiveChanged: false,
      delay
    };
  }

  clearTimeout(cinematicCloseTimer);
  clearTimeout(cinematicDialogueTimer);
  cinematicCloseTimer = null;
  cinematicDialogueTimer = null;
  cinematicScreenFX(false);

  const overlayLeaving = cinematic?.classList.contains('is-visible') === true;
  if (cinematic) {
    exitEventCinematicOverlay(cinematic, previousMode);
  }

  let perspectiveChanged = false;
  if (cinematicPerspectiveEngaged) {
    restoreParallaxViewAndControls();
    cinematicPerspectiveEngaged = false;
    perspectiveChanged = true;
  }

  const delay = overlayLeaving || perspectiveChanged ? duration : 0;
  activeEventCinematicMode = null;
  cinematicDialogueReadyAt = Date.now() + delay;

  if (cinematic) {
    const remove = () => {
      if (activeEventCinematicMode == null) {
        cinematic.setAttribute('aria-hidden', 'true');
        cinematic.remove();
        cinematicDialogueReadyAt = 0;
      }
      cinematicCloseTimer = null;
    };
    if (delay > 0) cinematicCloseTimer = setTimeout(remove, delay);
    else remove();
  }

  await waitEventMilliseconds(delay);
  return {
    element: cinematic || null,
    previousMode,
    visible: false,
    perspectiveChanged,
    delay
  };
}

/**
 * Exécute une liste d’actions dans l’ordre.
 *
 * `sequence` est une action générique : elle peut être utilisée directement
 * dans un événement, dans un écran action ou dans un choix.
 */
export async function sequence({
  sequence: actionDefinitions,
  eventKey = null,
  event = null,
  actions: _actions = null,
  ...context
} = {}) {
  if (!Array.isArray(actionDefinitions) || actionDefinitions.length === 0) {
    throw new TypeError('[Events] sequence attend un tableau `sequence` non vide.');
  }

  const normalizedDefinitions = actionDefinitions.map((definition, index) => {
    const actionName = getChoiceActionName(definition);
    if (!actionName || actionName === 'unknownAction') {
      throw new TypeError(`[Events] sequence contient une action invalide à l’index ${index}.`);
    }
    return { definition, actionName };
  });

  const resolvedEventKey = event?.key || eventKey || null;
  if (!resolvedEventKey) {
    throw new Error('[Events] sequence ne peut pas résoudre la clé de l’événement.');
  }

  const outputs = [];

  for (let index = 0; index < normalizedDefinitions.length; index += 1) {
    const { definition, actionName } = normalizedDefinitions[index];
    const output = await executeEventAction(
      resolvedEventKey,
      definition,
      {
        ...context,
        eventKey: resolvedEventKey,
        sequenceIndex: index,
        sequenceCount: normalizedDefinitions.length
      }
    );

    outputs.push({ action: actionName, output });
  }

  const eventResults = outputs.flatMap(({ action, output }) => {
    if (Array.isArray(output?.eventResults)) {
      return output.eventResults.map((result) => ({
        sequenceAction: action,
        ...result
      }));
    }
    if (output?.eventResult) {
      return [{
        sequenceAction: action,
        ...output.eventResult
      }];
    }
    return [];
  });

  return {
    sequenceResults: outputs,
    ...(eventResults.length > 0 ? { eventResults } : {})
  };
}

/**
 * Supprime entièrement les interfaces de niveau pendant une action théâtrale.
 * Purement DOM : aucun état de jeu n'est modifié.
 */
export function hideAllInterface() {
  const removed = {
    gameUI: 0,
    boardUI: 0
  };

  document.querySelectorAll('.Game-UI').forEach((element) => {
    element.remove();
    removed.gameUI += 1;
  });

  document.querySelectorAll('.board-ui').forEach((element) => {
    element.remove();
    removed.boardUI += 1;
  });

  return removed;
}

/**
 * Reconstruit l'interface normale : une `.Game-UI` et une `.board-ui`, toutes
 * deux rattachées directement à `#game-container`.
 */
export async function restoreAllInterface() {
  const gameContainer = document.querySelector('#game-container');
  if (!gameContainer) {
    return {
      restored: false,
      gameUI: false,
      boardUI: false,
      reason: 'game-container-not-found'
    };
  }

  let gameUIRestored = Boolean(document.querySelector('.Game-UI'));
  if (!gameUIRestored) {
    const gameInit = await import('./GameInit.js');
    if (typeof gameInit.GameUi !== 'function') {
      throw new TypeError('[Events] restoreAllInterface: GameUi() est introuvable.');
    }
    gameInit.GameUi();
    gameUIRestored = Boolean(document.querySelector('.Game-UI'));
  }

  // Toujours repasser par la factory idempotente : elle restaure les boutons
  // retirés avec `.Game-UI` et canonicalise `.board-ui` sans la dupliquer.
  const ui = await import('./ui.js');
  if (typeof ui.LevelUi !== 'function') {
    throw new TypeError('[Events] restoreAllInterface: LevelUi() est introuvable.');
  }
  ui.LevelUi();
  const boardUIRestored = gameContainer.querySelectorAll(':scope > .board-ui').length === 1
    && document.querySelectorAll('.board-ui').length === 1;

  // La cinématique peut interrompre un drag en cours avant que `dragend`
  // soit émis. Nettoyer cet état et réarmer les entités après reconstruction.
  const dragAndDrop = await import('./dragndrop.js');
  dragAndDrop.restoreEntityDragAndDrop?.();

  return {
    restored: gameUIRestored && boardUIRestored,
    gameUI: gameUIRestored,
    boardUI: boardUIRestored
  };
}

/**
 * Garde-fou global de sortie de dialogue.
 *
 * Dès qu'aucune `.dialogue-window` ne subsiste, il retire les restes de la
 * cinématique puis restaure la vue, l'interface et le drag-and-drop. Les
 * appels concurrents partagent la même Promise afin d'éviter toute duplication.
 */
export function ensureEventInterfaceAfterDialogueClosed({ source = 'dialogue-closed' } = {}) {
  // Une fermeture effectuée par un écran action est un passage contrôlé,
  // pas une fin d'événement.
  if (eventActionScreenDepth > 0) {
    return Promise.resolve({ restored: false, source, reason: 'action-screen-transition' });
  }

  if (document.querySelector('.dialogue-window')) {
    return Promise.resolve({ restored: false, source, reason: 'dialogue-still-visible' });
  }

  if (dialogueClosureRestorePromise) return dialogueClosureRestorePromise;

  dialogueClosureRestorePromise = Promise.resolve().then(async () => {
    // L'écran action peut démarrer juste après la fermeture du dialogue :
    // revalider le contexte dans cette micro-tâche aussi.
    if (eventActionScreenDepth > 0) {
      return { restored: false, source, reason: 'action-screen-transition' };
    }

    // Une nouvelle page de dialogue a pu être rendue dans la même micro-tâche.
    if (document.querySelector('.dialogue-window')) {
      return { restored: false, source, reason: 'dialogue-rendered-again' };
    }

    await closeEventCinematic();

    // Une nouvelle séquence peut avoir démarré pendant la transition sortante.
    // Dans ce cas, son mode cinématique reprend la main et ne doit pas être
    // supprimé par le garde-fou précédent.
    if (eventActionScreenDepth > 0) {
      return { restored: false, source, reason: 'action-screen-transition' };
    }
    if (document.querySelector('.dialogue-window')) {
      return { restored: false, source, reason: 'dialogue-rendered-during-exit' };
    }
    if (activeEventCinematicMode != null) {
      return { restored: false, source, reason: 'cinematic-mode-reentered' };
    }

    clearTimeout(cinematicCloseTimer);
    clearTimeout(cinematicDialogueTimer);
    cinematicCloseTimer = null;
    cinematicDialogueTimer = null;
    cinematicDialogueReadyAt = 0;
    cinematicPerspectiveEngaged = false;
    document.querySelectorAll('.event-cinematic').forEach((element) => element.remove());

    restoreParallaxViewAndControls();
    const interfaceState = await restoreAllInterface();
    restoreParallaxViewAndControls();

    return { restored: interfaceState.restored === true, source, interfaceState };
  }).catch((error) => {
    console.error(`[Events] Restauration après disparition du dialogue impossible (${source}).`, error);
    return { restored: false, source, error };
  }).finally(() => {
    dialogueClosureRestorePromise = null;
  });

  return dialogueClosureRestorePromise;
}

function closeDialogueWindow(options = {}) {
  const dialogueWasVisible = Boolean(document.querySelector('.dialogue-window'));
  const closed = closeDialogueWindowRaw(options);

  if (dialogueWasVisible && !document.querySelector('.dialogue-window')) {
    void ensureEventInterfaceAfterDialogueClosed({ source: 'close-dialogue' });
  }

  return closed;
}

function observeEventDialogueDisappearance() {
  if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return;

  eventDialogueWasVisible = Boolean(document.querySelector('.dialogue-window'));
  const root = document.documentElement || document.body;
  if (!root) return;

  const observer = new MutationObserver((mutations) => {
    const dialogueIsVisible = Boolean(document.querySelector('.dialogue-window'));
    const dialogueWasRemoved = mutations.some((mutation) => (
      [...mutation.removedNodes].some((node) => (
        node?.nodeType === 1
        && (node.matches?.('.dialogue-window') || node.querySelector?.('.dialogue-window'))
      ))
    ));

    if ((eventDialogueWasVisible || dialogueWasRemoved) && !dialogueIsVisible) {
      void ensureEventInterfaceAfterDialogueClosed({ source: 'dialogue-dom-removal' });
    }
    eventDialogueWasVisible = dialogueIsVisible;
  });

  observer.observe(root, { childList: true, subtree: true });
}

observeEventDialogueDisappearance();

/**
 * Garde-fou auto-réparateur exécuté juste avant le démarrage réel d'un combat.
 * Il ne bloque jamais le combat : chaque invariant invalide déclenche une
 * seconde reconstruction ciblée, puis le résultat est seulement journalisé.
 */
export async function ensureBattleInterfaceReady({ source = 'fight' } = {}) {
  closeDialogueWindow({ remove: true });
  await closeEventCinematic();

  clearTimeout(cinematicCloseTimer);
  clearTimeout(cinematicDialogueTimer);
  cinematicCloseTimer = null;
  cinematicDialogueTimer = null;
  cinematicDialogueReadyAt = 0;
  activeEventCinematicMode = null;
  cinematicPerspectiveEngaged = false;
  document.querySelectorAll('.event-cinematic').forEach((element) => element.remove());

  restoreParallaxViewAndControls();
  await restoreAllInterface();

  const ui = await import('./ui.js');
  ui.HexButtonVisibility?.(getVisibleHexes());

  const resetViewButton = document.querySelector('.reset-view-button');
  if (resetViewButton) {
    resetViewButton.style.opacity = '0';
    resetViewButton.style.pointerEvents = 'none';
  }

  const dragAndDrop = await import('./dragndrop.js');
  dragAndDrop.restoreEntityDragAndDrop?.();

  const inspect = () => {
    const seeHexButton = document.getElementById('see-hex');
    const hideHexButton = document.getElementById('hide-hex');
    const resetButton = document.querySelector('.reset-view-button');
    const hexesVisible = getVisibleHexes() === true;
    const activeSprites = [...document.querySelectorAll('.sprite:not(.side-B)')];
    return {
      gameUI: document.querySelectorAll('.Game-UI').length === 1,
      boardUI: document.querySelectorAll('#game-container > .board-ui').length === 1
        && document.querySelectorAll('.board-ui').length === 1,
      viewControls: document.querySelectorAll('.view-controls').length === 1,
      seeHexButton: Boolean(seeHexButton)
        && seeHexButton.style.display === (hexesVisible ? 'none' : 'block'),
      hideHexButton: Boolean(hideHexButton)
        && hideHexButton.style.display === (hexesVisible ? 'block' : 'none'),
      resetViewButton: Boolean(resetButton)
        && resetButton.style.opacity === '0'
        && resetButton.style.pointerEvents === 'none',
      cinematicRemoved: !document.querySelector('.event-cinematic'),
      dragStateClean: !document.querySelector('.dragged')
        && activeSprites.length > 0
        && activeSprites.every((sprite) => (
          sprite.style.pointerEvents !== 'none' && sprite.draggable === true
        ))
    };
  };

  let checks = inspect();
  let repaired = false;
  if (Object.values(checks).some((valid) => !valid)) {
    repaired = true;
    const gameContainer = document.querySelector('#game-container');
    const gameInit = await import('./GameInit.js');

    // GameUi() récupère d'abord les contrôles utiles placés dans un éventuel
    // doublon avant que les racines surnuméraires soient supprimées.
    gameInit.GameUi?.();
    const gameUIs = [...document.querySelectorAll('.Game-UI')];
    const canonicalGameUI = gameUIs.find((element) => element.parentElement === gameContainer)
      || gameUIs[0];
    gameUIs.forEach((element) => {
      if (element !== canonicalGameUI) element.remove();
    });

    // Recréer une unique `.board-ui` sous son parent canonique.
    document.querySelectorAll('.board-ui').forEach((element) => element.remove());
    ui.LevelUi?.();
    ui.HexButtonVisibility?.(getVisibleHexes());

    document.querySelectorAll('.event-cinematic').forEach((element) => element.remove());
    activeEventCinematicMode = null;
    cinematicPerspectiveEngaged = false;
    restoreParallaxViewAndControls();
    const repairedResetButton = document.querySelector('.reset-view-button');
    if (repairedResetButton) {
      repairedResetButton.style.opacity = '0';
      repairedResetButton.style.pointerEvents = 'none';
    }
    dragAndDrop.restoreEntityDragAndDrop?.();
    checks = inspect();
  }

  const remainingIssues = Object.entries(checks)
    .filter(([, valid]) => !valid)
    .map(([name]) => name);
  if (remainingIssues.length > 0) {
    console.warn(
      `[Events] Combat maintenu (${source}) malgré des réglages non confirmés : ${remainingIssues.join(', ')}.`
    );
  }

  return {
    ready: remainingIssues.length === 0,
    repaired,
    source,
    checks,
    remainingIssues
  };
}

/**
 * Affiche l'ambiance colorée d'un résultat de choix.
 * La bordure reste visible jusqu'à l'appel suivant avec false/null.
 * Pour le moment, seul un échec déclenche le tremblement bref de l'écran.
 */
export function cinematicScreenFX(outcome = null) {
  clearTimeout(cinematicScreenFX._shakeTimer);
  cinematicScreenFX._shakeTimer = null;
  const gameWindows = document.getElementById('game-windows');
  if (!gameWindows) return null;
  const normalizedOutcome = typeof outcome === 'string' ? outcome.trim().toLowerCase() : '';
  gameWindows.style.transformOrigin = 'center center';
  gameWindows.style.removeProperty('animation-delay');
  gameWindows.classList.remove('event-screen-shake-fail');
  const currentTransform = () => {
    const value = getComputedStyle(gameWindows).transform;
    return !value || value === 'none' ? 'scale(1)' : value;
  };
  let interruptedTransform = 'scale(1)';
  if (cinematicScreenFX._screenMotion) {
    interruptedTransform = currentTransform();
    cinematicScreenFX._screenMotion.cancel();
    cinematicScreenFX._screenMotion = null;
  }
  if (cinematicScreenFX._settleMotion) {
    interruptedTransform = currentTransform();
    cinematicScreenFX._settleMotion.cancel();
    cinematicScreenFX._settleMotion = null;
  }
  cinematicScreenFX._successFlash?.cancel();
  cinematicScreenFX._successFlash = null;
  const settleToNormal = (from = interruptedTransform, duration = 1250) => {
    if (typeof gameWindows.animate !== 'function') return null;
    const animation = gameWindows.animate([
      { transform: from, transformOrigin: 'center center' },
      { transform: 'scale(1)', transformOrigin: 'center center' }
    ], { duration, easing: 'cubic-bezier(.18,.72,.22,1)', fill: 'none' });
    cinematicScreenFX._settleMotion = animation;
    animation.addEventListener('finish', () => {
      if (cinematicScreenFX._settleMotion === animation) cinematicScreenFX._settleMotion = null;
    }, { once: true });
    animation.addEventListener('cancel', () => {
      if (cinematicScreenFX._settleMotion === animation) cinematicScreenFX._settleMotion = null;
    }, { once: true });
    return animation;
  };
  let cinematic = gameWindows.querySelector(':scope > .event-cinematic') || document.querySelector('.event-cinematic');
  let screenFX = cinematic?.querySelector(':scope > .cinematic-screen-fx') || gameWindows.querySelector(':scope > .cinematic-screen-fx');
  if (!CINEMATIC_SCREEN_FX_OUTCOMES.has(normalizedOutcome)) {
    screenFX?.classList.remove('is-visible', 'success', 'middle', 'fail');
    screenFX?.setAttribute('aria-hidden', 'true');
    settleToNormal(interruptedTransform, 1350);
    return null;
  }
  cinematic = ensureEventCinematicElement();
  if (!cinematic) {
    settleToNormal(interruptedTransform, 1350);
    return null;
  }
  if (screenFX && screenFX.parentElement !== cinematic) {
    const borderLayer = cinematic.querySelector(':scope > .cinematic-broder');
    cinematic.insertBefore(screenFX, borderLayer || null);
  }
  if (!screenFX) {
    screenFX = document.createElement('div');
    screenFX.className = 'cinematic-screen-fx';
    screenFX.setAttribute('aria-hidden', 'true');
    const borderLayer = cinematic.querySelector(':scope > .cinematic-broder');
    cinematic.insertBefore(screenFX, borderLayer || null);
  }
  screenFX.classList.remove('success', 'middle', 'fail');
  screenFX.classList.add('is-visible', normalizedOutcome);
  screenFX.setAttribute('aria-hidden', 'false');
  if (normalizedOutcome === 'success') {
    if (typeof screenFX.animate === 'function') {
      const animation = screenFX.animate([
        { opacity: .42, filter: 'brightness(1)', offset: 0 },
        { opacity: .92, filter: 'brightness(1.28)', offset: .20 },
        { opacity: .67, filter: 'brightness(1.08)', offset: .46 },
        { opacity: .84, filter: 'brightness(1.18)', offset: .67 },
        { opacity: .60, filter: 'brightness(1)', offset: 1 }
      ], { duration: 1850, easing: 'cubic-bezier(.18,.76,.24,1)', fill: 'none' });
      cinematicScreenFX._successFlash = animation;
      animation.addEventListener('finish', () => {
        if (cinematicScreenFX._successFlash === animation) cinematicScreenFX._successFlash = null;
      }, { once: true });
      animation.addEventListener('cancel', () => {
        if (cinematicScreenFX._successFlash === animation) cinematicScreenFX._successFlash = null;
      }, { once: true });
    }
    if (typeof gameWindows.animate === 'function') {
      const animation = gameWindows.animate([
        { transform: interruptedTransform, transformOrigin: 'center center', offset: 0 },
        { transform: 'scale(1.050)', transformOrigin: 'center center', offset: .23 },
        { transform: 'scale(1.010)', transformOrigin: 'center center', offset: .46 },
        { transform: 'scale(1.032)', transformOrigin: 'center center', offset: .67 },
        { transform: 'scale(1.006)', transformOrigin: 'center center', offset: .84 },
        { transform: 'scale(1)', transformOrigin: 'center center', offset: 1 }
      ], { duration: 1950, easing: 'cubic-bezier(.17,.72,.22,1)', fill: 'none' });
      cinematicScreenFX._screenMotion = animation;
      animation.addEventListener('finish', () => {
        if (cinematicScreenFX._screenMotion === animation) cinematicScreenFX._screenMotion = null;
      }, { once: true });
      animation.addEventListener('cancel', () => {
        if (cinematicScreenFX._screenMotion === animation) cinematicScreenFX._screenMotion = null;
      }, { once: true });
    }
  }
  if (normalizedOutcome === 'middle' && typeof gameWindows.animate === 'function') {
    const animation = gameWindows.animate([
      { transform: interruptedTransform, transformOrigin: 'center center', offset: 0 },
      { transform: 'scale(1.010)', transformOrigin: 'center center', offset: .16 },
      { transform: 'scale(1.022)', transformOrigin: 'center center', offset: .36 },
      { transform: 'scale(1.033)', transformOrigin: 'center center', offset: .54 },
      { transform: 'scale(1.036)', transformOrigin: 'center center', offset: .64 },
      { transform: 'scale(1.030)', transformOrigin: 'center center', offset: .76 },
      { transform: 'scale(1.016)', transformOrigin: 'center center', offset: .89 },
      { transform: 'scale(1)', transformOrigin: 'center center', offset: 1 }
    ], { duration: 4100, easing: 'cubic-bezier(.22,.06,.20,1)', fill: 'none' });
    cinematicScreenFX._screenMotion = animation;
    animation.addEventListener('finish', () => {
      if (cinematicScreenFX._screenMotion === animation) cinematicScreenFX._screenMotion = null;
    }, { once: true });
    animation.addEventListener('cancel', () => {
      if (cinematicScreenFX._screenMotion === animation) cinematicScreenFX._screenMotion = null;
    }, { once: true });
  }
  if (normalizedOutcome === 'fail') {
    // Aucun recentrage préalable : le shake démarre dans le même rendu que
    // l’écran d’échec, même si une animation précédente vient d’être coupée.
    cinematicScreenFX._settleMotion?.cancel();
    cinematicScreenFX._settleMotion = null;
    gameWindows.style.animationDelay = '0s';
    void gameWindows.offsetWidth;
    gameWindows.classList.add('event-screen-shake-fail');
    cinematicScreenFX._shakeTimer = setTimeout(() => {
      gameWindows.classList.remove('event-screen-shake-fail');
      gameWindows.style.removeProperty('animation-delay');
      cinematicScreenFX._shakeTimer = null;
    }, CINEMATIC_SCREEN_FX_SHAKE_DURATION);
  }
  return screenFX;
}

function formatEventFinalResultHeader(view = null) {
  let root = null;

  if (typeof Element !== 'undefined' && view instanceof Element) {
    root = view;
  } else if (
    typeof Element !== 'undefined'
    && view?.element instanceof Element
  ) {
    root = view.element;
  }

  const dialogueWindow = root?.matches?.('.dialogue-window')
    ? root
    : root?.querySelector?.('.dialogue-window')
      || document.querySelector('.dialogue-window');

  const header = dialogueWindow?.querySelector?.('.dialogue-header')
    || document.querySelector('.dialogue-window .dialogue-header');

  if (!header) return null;

  header.querySelector('.dialogue-title')?.remove();
  header.querySelector(':scope > .picto-event.result')?.remove();
  header.querySelector(':scope > .title.result')?.remove();

  const picto = document.createElement('div');
  picto.className = 'picto-event result';

  const title = document.createElement('span');
  title.className = 'title result';
  title.textContent = 'Résultat';

  header.prepend(title);
  header.prepend(picto);

  return header;
}

function eventScreenCinematicMode(node) {
  return normalizeEventCinematicMode(node?.cinematic);
}

function renderEventDialogueScreen(node, options = {}) {
  const cinematicMode = eventScreenCinematicMode(node);
  closeOpenLootInterfaces();

  let cinematic = { delay: 0 };
  if (cinematicMode != null) {
    hideAllInterface();
    cinematic = setEventCinematicMode(cinematicMode);
    setEventCinematicScreenTheme(cinematic.element, node);
  }

  const render = () => {
    cinematicDialogueTimer = null;
    const view = renderDialogueScreen(node, options);

    if (node?.type === 'result') {
      formatEventFinalResultHeader(view);
    }

    const outcome = node?.outcome || node?.choiceResult || null;
    if (cinematicMode != null) cinematicScreenFX(outcome);
    else cinematicScreenFX(false);
    return view;
  };
  if (cinematic.delay <= 0) return render();
  clearTimeout(cinematicDialogueTimer);
  cinematicDialogueTimer = setTimeout(render, cinematic.delay);
  return null;
}

/**
 * Fuite purement visuelle d'un camp.
 *
 * IMPORTANT : cette action ne modifie aucun état de combat, aucune armée,
 * aucun stockage et ne déclenche pas la vraie mécanique de fuite.
 * Elle joue uniquement le théâtre visuel : picto de fuite réussie, animation
 * de course et translation de toutes les entités visibles hors de la fenêtre.
 *
 * `side` accepte : `sideA`, `sideB` ou `both`.
 */
export async function runawayTheatre({
  side = 'sideA',
  duration = EVENT_RUNAWAY_THEATRE_DURATION,
  outsideOffset = EVENT_RUNAWAY_THEATRE_OUTSIDE_OFFSET,
  levelId = activeLevelId || getCurrentLevel()
} = {}) {
  const normalizedSide = normalizeEventTargetSide(side);
  const sides = normalizedSide === 'both' ? ['A', 'B'] : [normalizedSide];
  const animationDuration = Math.max(0, Number(duration) || 0);
  const margin = Math.max(0, Number(outsideOffset) || 0);

  const seenEntityIds = new Set();
  const animated = [];

  for (const armySide of sides) {
    const entitiesToRun = getEventArmyEntities(armySide, levelId)
      .filter((entity) => isAliveEventEntity(entity));

    for (const entity of entitiesToRun) {
      const entityId = String(entity?.id ?? '');
      if (!entityId || seenEntityIds.has(entityId)) continue;
      seenEntityIds.add(entityId);

      const battleElement = document.getElementById(`Box_Entite_${entity.id}`)
        || document.getElementById(`imgContainer_${entity.id}`)
        || document.getElementById(`spriteContainer_${entity.id}`);

      if (!battleElement) continue;

      const vacatedHex = battleElement.closest?.('.hex') || null;

      /*
       * Présentation de la fuite :
       * picto de réussite + course hors écran.
       *
       * AUCUN retrait n'est effectué avant la fin de l'animation.
       */
      RunawayAnimation(entity);
      runawayInfosBulle(entity, 'success');

      const entityRect = battleElement.getBoundingClientRect();
      const viewport = eventSpawnAnimationViewport(battleElement);
      const viewportRect = viewport.rect;

      const deltaX = armySide === 'A'
        ? (viewportRect.left - entityRect.right - margin)
        : (viewportRect.right - entityRect.left + margin);

      const previousTransition = battleElement.style.transition;
      const previousWillChange = battleElement.style.willChange;

      // La translation reste séparée de transform pour préserver les scaleX.
      battleElement.style.willChange = 'translate';
      battleElement.style.transition = animationDuration > 0
        ? `translate ${animationDuration}ms cubic-bezier(0.4, 0, 1, 1)`
        : 'none';

      battleElement.style.translate = '0px 0px';
      void battleElement.offsetWidth;
      battleElement.style.translate = `${deltaX}px 0px`;

      animated.push({
        entity,
        entityId,
        side: armySide,
        element: battleElement,
        vacatedHex,
        previousTransition,
        previousWillChange,
        deltaX
      });
    }
  }

  // On laisse l'animation se terminer complètement avant de toucher à l'état.
  await waitEventMilliseconds(animationDuration);

  const removedEntityIds = [];

  for (const {
    entity,
    entityId,
    element,
    vacatedHex,
    previousTransition,
    previousWillChange
  } of animated) {
    /*
     * Fin visuelle de la fuite.
     *
     * L'entité est déjà hors écran : on peut maintenant appliquer la vraie
     * mécanique de fuite sans provoquer de coupure visuelle.
     */
    element.style.transition = previousTransition;
    element.style.willChange = previousWillChange;

    restoreVacatedHexSocleOpacity(vacatedHex);

    /*
     * Même séquence que la fuite réussie native de BattleOrder :
     *
     * 1. l'entité est marquée comme ayant fui ;
     * 2. RemoveEntite(..., 'runaway') applique son retrait réel/persistant.
     *
     * IMPORTANT :
     * runawayTheatre() ne déclenche NI playRunawaySuccessAnimation(),
     * NI quitLevel(), NI changement de niveau.
     */
    entity.hasFled = true;

    await Promise.resolve(
      RemoveEntite(entity, 'runaway')
    );

    removedEntityIds.push(entityId);
  }

  /*
   * Sauvegarde globale après que tous les retraits ont été appliqués.
   * RemoveEntite(..., 'runaway') conserve la sémantique native de fuite ;
   * cette sauvegarde verrouille ensuite l'état courant de la partie.
   */
  if (removedEntityIds.length > 0) {
    saveCurrentGameData();

    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('eventRunawayTheatreApplied', {
        detail: {
          side: normalizedSide,
          levelId,
          entityIds: [...removedEntityIds]
        }
      }));
    }
  }

  return {
    side: normalizedSide,
    animatedEntityCount: animated.length,
    animatedEntityIds: animated.map(({ entityId }) => entityId),
    removedEntityCount: removedEntityIds.length,
    removedEntityIds,
    persistedRunaway: removedEntityIds.length > 0,
    levelQuit: false
  };
}

function randomEventRange(min, max) {
  const low = Number(min);
  const high = Number(max);
  const safeLow = Number.isFinite(low) ? low : 0;
  const safeHigh = Number.isFinite(high) ? high : safeLow;
  if (safeHigh <= safeLow) return safeLow;
  return safeLow + (Math.random() * (safeHigh - safeLow));
}

function resolveWanderingTheatreEntity(entityOrId) {
  if (entityOrId && typeof entityOrId === 'object' && entityOrId.id != null) {
    return entityOrId;
  }

  const wantedId = String(entityOrId ?? '').trim();
  if (!wantedId) return null;
  return entites.find((entity) => String(entity?.id ?? '') === wantedId) || null;
}

function eventHexElementByPosition(grid, position) {
  if (!grid || position == null) return null;
  const id = String(position);
  const byId = document.getElementById(id);
  if (byId?.matches?.('.hex') && grid.contains(byId)) return byId;

  const escaped = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(id)
    : id.replace(/["\\]/g, '\\$&');
  return grid.querySelector(
    `[data-hex-id="${escaped}"], .hex[data-position="${escaped}"]`
  );
}

function collectNeutralTheatreHexes(grid) {
  if (!grid) return [];

  const positions = new Set();
  const lines = ['top', 'middle', 'bottom'];
  const columns = ['start', 'center', 'end'];

  // On demande volontairement plus de positions qu'un secteur normal n'en
  // contient afin de reconstruire toute la zone neutre depuis board.js.
  for (const line of lines) {
    for (const column of columns) {
      try {
        const sector = hexCoordonne('neutral', line, column, 64);
        if (Array.isArray(sector)) {
          sector.forEach((position) => {
            if (position != null) positions.add(String(position));
          });
        }
      } catch (error) {
        console.warn('[Events] wanderingTheatre : secteur neutre indisponible.', error);
      }
    }
  }

  const resolved = [...positions]
    .map((position) => eventHexElementByPosition(grid, position))
    .filter(Boolean);

  if (resolved.length > 0) return [...new Set(resolved)];

  // Fallback DOM pour les plateaux qui exposent directement leur zone.
  return [...new Set(grid.querySelectorAll([
    '.hex[data-side="neutral"]',
    '.hex[data-camp="neutral"]',
    '.hex[data-entity-side="neutral"]',
    '.hex[data-zone="neutral"]',
    '.hex.neutral'
  ].join(',')))];
}

function theatreHexCenter(hex) {
  const rect = hex?.getBoundingClientRect?.();
  if (!rect) return null;
  return {
    x: rect.left + (rect.width / 2),
    y: rect.top + (rect.height / 2)
  };
}

function isTheatreHexAvailable(hex, movingElement) {
  if (!hex) return false;
  if (movingElement && hex.contains(movingElement)) return true;
  if (!hex.classList.contains('occupied')) return true;

  // Une classe `occupied` peut parfois rester visuellement présente alors que
  // la case ne contient plus rien de bloquant : on vérifie donc son contenu.
  return !hex.querySelector([
    '[data-battle-element-id]',
    '[id^="Box_Entite_"]',
    '[id^="imgContainer_"]',
    '.chest-container',
    '[id^="chest-ui-"]'
  ].join(','));
}

function nearestTheatreHexNeighbours(currentPoint, neutralHexes, movingElement) {
  if (!currentPoint) return [];

  const distances = neutralHexes
    .filter((hex) => isTheatreHexAvailable(hex, movingElement))
    .map((hex) => {
      const center = theatreHexCenter(hex);
      if (!center) return null;
      const dx = center.x - currentPoint.x;
      const dy = center.y - currentPoint.y;
      return {
        hex,
        center,
        dx,
        dy,
        distance: Math.hypot(dx, dy)
      };
    })
    .filter((candidate) => candidate && candidate.distance > 4)
    .sort((left, right) => left.distance - right.distance);

  if (distances.length === 0) return [];

  // Le plus petit écart représente un déplacement d'une case. On conserve
  // uniquement les cases du même anneau de voisinage : jamais de téléportation.
  const oneHexDistance = distances[0].distance;
  const tolerance = Math.max(8, oneHexDistance * 0.28);
  return distances.filter((candidate) => (
    candidate.distance <= oneHexDistance + tolerance
  ));
}

/**
 * Fait errer visuellement une entité de case neutre en case neutre.
 *
 * Théâtre pur : aucune battlePosition, aucune armée et aucun stockage ne sont
 * modifiés. L'élément reste attaché à son hex réel ; seule sa translation DOM
 * évolue de façon fluide, une case à la fois.
 *
 * Appel direct : `wanderingTheatre(entity)`.
 * Comme action d'événement :
 * `{ action: 'wanderingTheatre', args: { entity, steps: 6 } }`.
 */
export async function wanderingTheatre(entityOrOptions = {}, directOptions = {}) {
  const directEntity = resolveWanderingTheatreEntity(entityOrOptions);
  const options = directEntity
    ? (directOptions || {})
    : (entityOrOptions && typeof entityOrOptions === 'object' ? entityOrOptions : {});
  const entity = directEntity || resolveWanderingTheatreEntity(
    options.entity ?? options.entityId
  );

  if (!entity?.id) {
    return {
      entityId: null,
      movedSteps: 0,
      visualOnly: true,
      reason: 'entity-not-found'
    };
  }

  // PREMIÈRE opération théâtrale : masquer immédiatement le socle de l'hex
  // réellement occupé. Aucun état de combat n'est modifié.
  opacityHexOccupied(entity);

  const continuous = options.continuous === true;
  const steps = Math.max(0, Math.floor(
    Number(options.steps ?? EVENT_WANDERING_THEATRE_STEPS) || 0
  ));
  const minStepDuration = Math.max(0, Number(
    options.minStepDuration ?? EVENT_WANDERING_THEATRE_MIN_STEP_DURATION
  ) || 0);
  const maxStepDuration = Math.max(minStepDuration, Number(
    options.maxStepDuration ?? EVENT_WANDERING_THEATRE_MAX_STEP_DURATION
  ) || minStepDuration);
  const minPause = Math.max(0, Number(
    options.minPause ?? EVENT_WANDERING_THEATRE_MIN_PAUSE
  ) || 0);
  const maxPause = Math.max(minPause, Number(
    options.maxPause ?? EVENT_WANDERING_THEATRE_MAX_PAUSE
  ) || minPause);

  const battleElement = document.getElementById(`Box_Entite_${entity.id}`)
    || document.getElementById(`imgContainer_${entity.id}`)
    || document.getElementById(`spriteContainer_${entity.id}`);
  if (!battleElement) {
    return {
      entityId: entity.id,
      movedSteps: 0,
      visualOnly: true,
      reason: 'battle-element-not-found'
    };
  }

  const grid = battleElement.closest?.('.hex-grid') || document.querySelector('.hex-grid');
  const neutralHexes = collectNeutralTheatreHexes(grid);
  if (!grid || neutralHexes.length === 0 || (!continuous && steps === 0)) {
    return {
      entityId: entity.id,
      movedSteps: 0,
      visualOnly: true,
      reason: (!continuous && steps === 0) ? 'no-steps' : 'neutral-hexes-not-found'
    };
  }

  const originRect = battleElement.getBoundingClientRect();
  const originPoint = {
    x: originRect.left + (originRect.width / 2),
    y: originRect.top + (originRect.height / 2)
  };

  const imgContainer = document.getElementById(`imgContainer_${entity.id}`)
    || battleElement.querySelector?.(`#imgContainer_${entity.id}`)
    || battleElement.querySelector?.('.img-container')
    || battleElement;

  const previousTransition = battleElement.style.transition;
  const previousWillChange = battleElement.style.willChange;
  const previousTranslate = battleElement.style.translate;

  battleElement.style.willChange = 'translate';

  const currentRect = battleElement.getBoundingClientRect();
  let currentPoint = {
    x: currentRect.left + (currentRect.width / 2),
    y: currentRect.top + (currentRect.height / 2)
  };
  let currentHex = battleElement.closest?.('.hex') || null;
  let previousHex = null;
  let movedSteps = 0;
  let finalHex = currentHex;

  const entityKey = String(entity.id);
  const session = { active: true, entityId: entity.id };

  // Un seul wandering continu par entité. Un nouvel appel remplace l'ancien.
  if (continuous) {
    const previousSession = wanderingTheatreSessions.get(entityKey);
    if (previousSession) previousSession.active = false;
    wanderingTheatreSessions.set(entityKey, session);
  }

  const runWandering = async () => {
    let stepIndex = 0;

    try {
      while (continuous ? session.active : stepIndex < steps) {
        if (!battleElement.isConnected) break;

        let neighbours = nearestTheatreHexNeighbours(currentPoint, neutralHexes, battleElement);
        if (previousHex && neighbours.length > 1) {
          const withoutImmediateReturn = neighbours.filter(({ hex }) => hex !== previousHex);
          if (withoutImmediateReturn.length > 0) neighbours = withoutImmediateReturn;
        }
        if (neighbours.length === 0) break;

        const chosen = neighbours[Math.floor(Math.random() * neighbours.length)];
        const moveX = chosen.center.x - currentPoint.x;

        // sideA regarde naturellement vers la droite ; sideB est inversé.
        if (Math.abs(moveX) > 2) {
          const entitySide = String(entity?.side ?? '').trim().toUpperCase();
          const shouldFlipHorizontal = entitySide === 'B'
            ? moveX > 0
            : moveX < 0;
          imgContainer?.classList?.toggle('flip-horizontal', shouldFlipHorizontal);
        }

        const stepDuration = Math.round(randomEventRange(minStepDuration, maxStepDuration));
        battleElement.style.transition = stepDuration > 0
          ? `translate ${stepDuration}ms cubic-bezier(0.45, 0, 0.55, 1)`
          : 'none';

        const targetTranslateX = chosen.center.x - originPoint.x;
        const targetTranslateY = chosen.center.y - originPoint.y;
        battleElement.style.translate = `${targetTranslateX}px ${targetTranslateY}px`;

        await waitEventMilliseconds(stepDuration);
        if (continuous && !session.active) break;

        previousHex = currentHex;
        currentHex = chosen.hex;
        finalHex = chosen.hex;
        currentPoint = chosen.center;
        movedSteps += 1;
        stepIndex += 1;

        if (continuous || stepIndex < steps) {
          await waitEventMilliseconds(Math.round(randomEventRange(minPause, maxPause)));
        }
      }
    } finally {
      battleElement.style.transition = previousTransition;
      battleElement.style.willChange = previousWillChange;

      if (continuous && wanderingTheatreSessions.get(entityKey) === session) {
        wanderingTheatreSessions.delete(entityKey);
      }
    }

    return {
      entityId: entity.id,
      movedSteps,
      requestedSteps: continuous ? null : steps,
      continuous,
      running: false,
      finalHexId: finalHex?.id || finalHex?.dataset?.hexId || finalHex?.dataset?.position || null,
      visualOnly: true,
      previousTranslate
    };
  };

  if (continuous) {
    // Important : on ne l'attend PAS. L'errance continue pendant les dialogues
    // et s'arrête naturellement lorsque l'entité / le niveau quitte le DOM.
    void runWandering();
    return {
      entityId: entity.id,
      movedSteps: 0,
      requestedSteps: null,
      continuous: true,
      running: true,
      visualOnly: true,
      previousTranslate
    };
  }

  return runWandering();
}

export function stopWanderingTheatre(entityOrOptions = {}) {
  const options = entityOrOptions && typeof entityOrOptions === 'object'
    && entityOrOptions.id == null
    ? entityOrOptions
    : {};
  const entity = resolveWanderingTheatreEntity(
    options.entity ?? options.entityId ?? entityOrOptions
  );
  const entityId = entity?.id ?? options.entityId ?? null;

  if (entityId == null) {
    return {
      stopped: false,
      reason: 'entity-not-found'
    };
  }

  const session = wanderingTheatreSessions.get(String(entityId));
  if (!session) {
    return {
      entityId,
      stopped: false,
      reason: 'not-running'
    };
  }

  session.active = false;
  return {
    entityId,
    stopped: true,
    visualOnly: true
  };
}


/**
 * Masque visuellement le socle de l'hex réellement occupé par une entité.
 * Théâtre pur : aucune position ni donnée de combat n'est modifiée.
 */
export function opacityHexOccupied(entityOrOptions = {}) {
  const options = entityOrOptions && typeof entityOrOptions === 'object'
    && entityOrOptions.id == null
    ? entityOrOptions
    : {};
  const entity = resolveWanderingTheatreEntity(
    options.entity ?? options.entityId ?? entityOrOptions
  );

  if (!entity?.id) {
    return {
      entityId: null,
      hidden: false,
      visualOnly: true,
      reason: 'entity-not-found'
    };
  }

  const battleElement = document.getElementById(`Box_Entite_${entity.id}`)
    || document.getElementById(`imgContainer_${entity.id}`)
    || document.getElementById(`spriteContainer_${entity.id}`);
  const occupiedHex = battleElement?.closest?.('.hex') || null;

  if (!occupiedHex) {
    return {
      entityId: entity.id,
      hidden: false,
      visualOnly: true,
      reason: 'occupied-hex-not-found'
    };
  }

  const hidden = restoreVacatedHexSocleOpacity(occupiedHex);
  return {
    entityId: entity.id,
    hexId: occupiedHex.id || occupiedHex.dataset?.hexId || occupiedHex.dataset?.position || null,
    hidden,
    visualOnly: true
  };
}

function normalizeSurpriseAttackSide(side) {
  if (typeof side !== 'string') return null;

  const normalized = side.trim().toLowerCase();
  if (normalized === 'sidea' || normalized === 'a') return 'A';
  if (normalized === 'sideb' || normalized === 'b') return 'B';
  return null;
}

function ensureSurprisedStyle() {
  if (document.getElementById('surprised-army-style')) return;

  const style = document.createElement('style');
  style.id = 'surprised-army-style';
  style.textContent = '.img-container.surprised { transform: scaleX(-1); }';
  document.head.appendChild(style);
}

/** Retourne le camp actuellement surpris, ou null. */
export function getSurprisedSide() {
  return surprisedSide;
}

/**
 * Libère le camp surpris uniquement si `side` correspond au camp attendu.
 * fight.js utilise cette consommation atomique pour empêcher un double réveil.
 */
export function releaseSurprisedSide(side) {
  const normalizedSide = String(side || '').trim().toUpperCase();
  if (normalizedSide !== surprisedSide) return null;

  const releasedSide = surprisedSide;
  surprisedSide = null;
  return releasedSide;
}

/**
 * Déclenche une attaque surprise.
 * `side` désigne le camp qui réalise l'embuscade (`sideA` ou `sideB`).
 */
export function attackSurprise(sideOrOptions) {
  const side = sideOrOptions && typeof sideOrOptions === 'object'
    ? sideOrOptions.side
    : sideOrOptions;
  const attackingSide = normalizeSurpriseAttackSide(side);

  document.querySelectorAll('.img-container.surprised')
    .forEach((container) => container.classList.remove('surprised'));
  entites.forEach((entity) => {
    entity.isSurprised = false;
  });

  if (!attackingSide) {
    surprisedSide = null;
    return null;
  }

  surprisedSide = attackingSide === 'A' ? 'B' : 'A';
  ensureSurprisedStyle();

  entites
    .filter((entity) => entity.side === surprisedSide)
    .forEach((entity) => {
      const isAlive = isAliveEventEntity(entity);
      entity.isSurprised = isAlive;
      document
        .getElementById(`imgContainer_${entity.id}`)
        ?.classList.toggle('surprised', isAlive);
    });

  console.log(
    `Attaque surprise du camp ${attackingSide} : le camp ${surprisedSide} est surpris.`
  );
  return surprisedSide;
}

function cloneValue(value) {
  /*
   * Les entités runtime peuvent contenir des références DOM ajoutées par
   * l'affichage (HTMLElement, HTMLStyleElement, etc.).
   *
   * structuredClone() lève un DataCloneError sur ces objets. On fabrique donc
   * directement une copie de données sérialisable en ignorant uniquement les
   * références runtime non persistables.
   */
  const seen = new WeakSet();

  const serialize = (current, inArray = false) => {
    if (
      current == null
      || typeof current === 'string'
      || typeof current === 'number'
      || typeof current === 'boolean'
    ) {
      return current;
    }

    if (typeof current === 'bigint') return Number(current);

    if (
      typeof current === 'undefined'
      || typeof current === 'function'
      || typeof current === 'symbol'
    ) {
      return inArray ? null : undefined;
    }

    if (
      typeof Node !== 'undefined'
      && current instanceof Node
    ) {
      return inArray ? null : undefined;
    }

    if (
      typeof Window !== 'undefined'
      && current instanceof Window
    ) {
      return inArray ? null : undefined;
    }

    if (current instanceof Date) {
      return new Date(current.getTime());
    }

    if (typeof current !== 'object') return current;

    if (seen.has(current)) {
      return inArray ? null : undefined;
    }
    seen.add(current);

    if (Array.isArray(current)) {
      return current.map((entry) => serialize(entry, true));
    }

    if (current instanceof Map) {
      const result = {};
      current.forEach((entryValue, entryKey) => {
        const cloned = serialize(entryValue, false);
        if (cloned !== undefined) result[String(entryKey)] = cloned;
      });
      return result;
    }

    if (current instanceof Set) {
      return Array.from(current, (entry) => serialize(entry, true));
    }

    const result = {};
    for (const [key, entry] of Object.entries(current)) {
      const cloned = serialize(entry, false);
      if (cloned !== undefined) result[key] = cloned;
    }

    return result;
  };

  return serialize(value, false);
}

function nowIso() {
  return new Date().toISOString();
}

function getArmyEntityList(army, createIfMissing = false) {
  if (Array.isArray(army)) return army;
  if (!army || typeof army !== 'object') return null;
  if (Array.isArray(army.entities)) return army.entities;
  if (Array.isArray(army.entites)) return army.entites;
  if (!createIfMissing) return null;
  army.entities = [];
  return army.entities;
}

function isAliveEventEntity(entity) {
  if (!entity) return false;
  if (entity.isDEAD === true) return false;
  if (entity.statut?.includes?.('dead')) return false;

  const hp = entity.stats?.HP ?? entity.HP;
  const currentHp = hp && typeof hp === 'object'
    ? hp.current
    : hp;

  return currentHp == null || Number(currentHp) > 0;
}

function getEventArmyEntities(side, levelId = activeLevelId || getCurrentLevel()) {
  const normalizedSide = String(side || '').trim().toUpperCase();
  if (normalizedSide !== 'A' && normalizedSide !== 'B') return [];

  // Les entités actives sont prioritaires : leurs morts et leurs statistiques
  // correspondent exactement à l'état actuel du combat/niveau.
  const liveArmy = entites.filter(
    (entity) => String(entity?.side || '').toUpperCase() === normalizedSide
  );
  if (liveArmy.length > 0) return liveArmy;

  if (normalizedSide === 'A') {
    const selectedArmy = loadFromLocalStorage('selectedArmyA', []);
    return getArmyEntityList(selectedArmy, false) || [];
  }

  const stagesData = loadFromLocalStorage('GameStages', { stages: [] });
  const stage = Array.isArray(stagesData?.stages)
    ? stagesData.stages.find(
      (candidate) => String(candidate?.id) === String(levelId)
    )
    : null;
  const armyBData = loadFromLocalStorage('ArmyB', { armies: {} });
  const armies = armyBData?.armies || {};
  const army = armies[stage?.ArmyB_id]
    || armies[String(levelId)]
    || armies[`ArmyB_${levelId}`]
    || null;

  return getArmyEntityList(army, false) || [];
}

function eventValueAtPath(source, pathParts) {
  let value = source;
  for (const part of pathParts) {
    if (value == null || typeof value !== 'object') return undefined;
    value = value[part];
  }
  return value;
}

function getEventEntityStatValue(entity, statKey) {
  const pathParts = String(statKey ?? '')
    .split('.')
    .map((part) => part.trim())
    .filter(Boolean);
  if (!entity || pathParts.length === 0) return null;

  const hasExplicitRoot = ['stats', 'baseStats'].includes(pathParts[0]);
  const sources = hasExplicitRoot
    ? [{ source: entity, path: pathParts }]
    : [
      { source: entity.stats, path: pathParts },
      { source: entity, path: pathParts },
      { source: entity.baseStats, path: pathParts }
    ];

  let rawValue;
  for (const candidate of sources) {
    rawValue = eventValueAtPath(candidate.source, candidate.path);
    if (rawValue !== undefined && rawValue !== null) break;
  }

  if (rawValue === undefined || rawValue === null) return null;

  if (rawValue && typeof rawValue === 'object') {
    rawValue = rawValue.current
      ?? rawValue.value
      ?? rawValue.total
      ?? rawValue.max;
  }

  const numericValue = Number(rawValue);
  return Number.isFinite(numericValue) ? numericValue : null;
}

export function armyTotalStats(side, statKey) {
  const key = String(statKey ?? '').trim();
  if (!key) return 0;

  return getEventArmyEntities(side)
    .filter(isAliveEventEntity)
    .reduce(
      (total, entity) => total + (getEventEntityStatValue(entity, key) ?? 0),
      0
    );
}

export function checkArmyStatCondition(condition) {
  if (!condition || typeof condition !== 'object') return true;

  // `entity` reste toléré comme alias de `armyA` pour les anciens événements.
  const armyConditions = [
    ['A', condition.armyA ?? condition.entity],
    ['B', condition.armyB]
  ];

  return armyConditions.every(([side, requiredStats]) => {
    if (requiredStats == null) return true;
    if (typeof requiredStats !== 'object') return false;

    return Object.entries(requiredStats).every(([statKey, minimum]) => {
      const requiredValue = Number(minimum);
      if (!Number.isFinite(requiredValue)) return false;
      return armyTotalStats(side, statKey) >= requiredValue;
    });
  });
}

export function isEventChoiceAvailable(choice) {
  return Boolean(choice) && checkArmyStatCondition(choice.condition);
}

/**
 * Calcule les chances d'un choix normal à partir des seules statistiques de
 * l'armée A encore en vie. Chaque issue conserve toujours au moins 3 %.
 */
export function calculateChoiceResolutionChances(approach) {
  const normalizedApproach = String(approach || '').trim().toLowerCase();
  const statKeys = CHOICE_RESOLUTION_STATS[normalizedApproach];
  if (!statKeys) {
    throw new Error(`[Events] Orientation de choix inconnue : ${approach}.`);
  }

  const stats = Object.fromEntries(
    Object.entries(statKeys).map(([outcome, statKey]) => [
      outcome,
      Math.max(0, armyTotalStats('A', statKey))
    ])
  );
  const total = stats.success + stats.middle + stats.fail;

  if (total <= 0) {
    return {
      approach: normalizedApproach,
      statKeys: { ...statKeys },
      stats,
      chances: {
        success: 100 / 3,
        middle: 100 / 3,
        fail: 100 / 3
      }
    };
  }

  const success = CHOICE_RESOLUTION_FLOOR
    + (CHOICE_RESOLUTION_POOL * stats.success / total);
  const middle = CHOICE_RESOLUTION_FLOOR
    + (CHOICE_RESOLUTION_POOL * stats.middle / total);

  return {
    approach: normalizedApproach,
    statKeys: { ...statKeys },
    stats,
    chances: {
      success,
      middle,
      // Le reliquat évite qu'un arrondi fasse dépasser ou manquer 100 %.
      fail: 100 - success - middle
    }
  };
}

export function rollChoiceResolution(choice, random = Math.random) {
  const approach = choice?.resolution?.approach;
  const calculation = calculateChoiceResolutionChances(approach);
  const sampledValue = Number(typeof random === 'function' ? random() : random);
  const normalizedSample = Number.isFinite(sampledValue)
    ? Math.min(Math.max(sampledValue, 0), 0.999999999999)
    : Math.random();
  const roll = normalizedSample * 100;
  const successLimit = calculation.chances.success;
  const middleLimit = successLimit + calculation.chances.middle;
  const outcome = roll < successLimit
    ? 'success'
    : roll < middleLimit
      ? 'middle'
      : 'fail';

  return {
    choiceId: String(choice.id),
    ...calculation,
    roll,
    outcome,
    resolvedAt: nowIso()
  };
}

function rollBinaryChoiceResolution(choice, availableOutcomes, random = Math.random) {
  const approach = String(choice?.resolution?.approach || '').trim().toLowerCase();
  if (!approach) {
    throw new Error(`[Events] Statistique binaire absente du choix ${choice?.id}.`);
  }

  const bonus = Number.isFinite(Number(choice.resolution.bonus))
    ? Number(choice.resolution.bonus)
    : 5;
  const cap = Number.isFinite(Number(choice.resolution.cap))
    ? Number(choice.resolution.cap)
    : 95;
  const stat = Math.max(0, armyTotalStats('A', approach));
  const chance = Math.max(0, Math.min(cap, stat + bonus));
  const sampledValue = Number(typeof random === 'function' ? random() : random);
  const roll = (Number.isFinite(sampledValue)
    ? Math.min(Math.max(sampledValue, 0), 0.999999999999)
    : Math.random()) * 100;
  const [bestOutcome, fallbackOutcome] = availableOutcomes;

  return {
    choiceId: String(choice.id),
    mode: 'binary',
    approach,
    stat,
    bonus,
    cap,
    chance,
    roll,
    outcome: roll < chance ? bestOutcome : fallbackOutcome,
    resolvedAt: nowIso()
  };
}

/**
 * Point d'entrée unique des résolutions : une issue est déterministe, deux
 * issues utilisent le jet binaire, trois issues utilisent la table ternaire.
 */
export function eventChoiceDriver(choice, random = Math.random) {
  const outcomes = choice?.resolution?.outcomes;
  const availableOutcomes = outcomes && typeof outcomes === 'object'
    ? ['success', 'middle', 'fail'].filter((outcome) => outcomes[outcome])
    : [];

  if (availableOutcomes.length === 1) {
    return {
      choiceId: String(choice.id),
      mode: 'single',
      outcome: availableOutcomes[0],
      resolvedAt: nowIso()
    };
  }
  if (availableOutcomes.length === 2) {
    return rollBinaryChoiceResolution(choice, availableOutcomes, random);
  }
  if (availableOutcomes.length === 3) return rollChoiceResolution(choice, random);

  throw new Error(
    `[Events] Le choix ${choice?.id} doit contenir une, deux ou trois issues.`
  );
}

function applyChoiceResolution(choice, resolutionResult) {
  if (!choice?.resolution || !resolutionResult?.outcome) return choice;
  const consequence = choice.resolution.outcomes?.[resolutionResult.outcome];
  if (!consequence) {
    throw new Error(
      `[Events] Conséquence ${resolutionResult.outcome} absente du choix ${choice.id}.`
    );
  }

  return {
    ...choice,
    ...consequence,
    id: choice.id,
    resolution: choice.resolution,
    resolutionResult
  };
}

function ensureChoiceResolution(eventDefinition, choice, initialState) {
  if (!choice?.resolution) {
    return { state: initialState, choice };
  }

  const storedResolution = initialState?.choiceResolution;
  if (
    storedResolution
    && String(storedResolution.choiceId) === String(choice.id)
    && ['success', 'middle', 'fail'].includes(storedResolution.outcome)
  ) {
    return {
      state: initialState,
      choice: applyChoiceResolution(choice, storedResolution)
    };
  }

  const choiceResolution = eventChoiceDriver(choice);
  let resolvedState = initialState;
  updateQuestState((quest) => {
    const stored = quest.inProgress[eventDefinition.key];
    if (!stored) return quest;

    resolvedState = {
      ...stored,
      choiceResolution,
      updatedAt: nowIso()
    };
    quest.inProgress[eventDefinition.key] = resolvedState;
    return quest;
  });

  if (resolvedState) syncEventStateToStage(eventDefinition.key, resolvedState);
  return {
    state: resolvedState,
    choice: applyChoiceResolution(choice, choiceResolution)
  };
}

function sameEventEntity(entity, spawnedEntity) {
  return (
    String(entity?.id) === String(spawnedEntity?.id)
    || (
      Number(entity?.serial) === Number(spawnedEntity?.serial)
      && entity?.eventId === spawnedEntity?.eventId
    )
  );
}

function saveSpawnedEntityInArmyB(entity, levelId = getCurrentLevel()) {
  if (!levelId) return null;

  const gameStages = loadFromLocalStorage('GameStages', { stages: [] });
  const stage = Array.isArray(gameStages.stages)
    ? gameStages.stages.find((candidate) => String(candidate?.id) === String(levelId))
    : null;
  const configuredArmyId = String(stage?.ArmyB_id || window.ArmyB_id || `ArmyB_${levelId}`);
  const armyBData = loadFromLocalStorage('ArmyB', { armies: {} });
  armyBData.armies = armyBData.armies && typeof armyBData.armies === 'object'
    ? armyBData.armies
    : {};

  const armyKey = [configuredArmyId, String(levelId), `ArmyB_${levelId}`]
    .find((key) => Object.prototype.hasOwnProperty.call(armyBData.armies, key))
    || configuredArmyId;
  let stageArmy = armyBData.armies[armyKey];

  if (!stageArmy || (typeof stageArmy !== 'object' && !Array.isArray(stageArmy))) {
    stageArmy = {
      id: configuredArmyId,
      stageId: String(levelId),
      entities: []
    };
    armyBData.armies[armyKey] = stageArmy;
  }

  const storedEntities = getArmyEntityList(stageArmy, true);
  if (!storedEntities.some((candidate) => sameEventEntity(candidate, entity))) {
    storedEntities.push(cloneValue(entity));
  }
  saveToLocalStorage('ArmyB', armyBData);

  const liveEntities = getArmyEntityList(window.selectedArmyB, false);
  if (liveEntities && !liveEntities.some((candidate) => sameEventEntity(candidate, entity))) {
    liveEntities.push(entity);
  }

  return { armyId: armyKey, levelId: String(levelId) };
}

function requireRuntimeAdapter(name) {
  const adapter = runtimeAdapters[name];
  if (typeof adapter !== 'function') {
    throw new Error(`[Events] Adaptateur générique manquant : ${name}.`);
  }
  return adapter;
}

export function configureEventRuntime(adapters = {}) {
  for (const [name, adapter] of Object.entries(adapters)) {
    if (typeof adapter === 'function') runtimeAdapters[name] = adapter;
  }
}

function normalizeEventSpawnAnimationName(name) {
  return String(name || '').trim().toLowerCase();
}

export function registerEventSpawnAnimation(name, animation) {
  const normalizedName = normalizeEventSpawnAnimationName(name);
  if (!normalizedName || typeof animation !== 'function') {
    throw new TypeError('[Events] Animation de spawn invalide.');
  }
  eventSpawnAnimations.set(normalizedName, animation);
  return animation;
}

export function getEventSpawnAnimation(name) {
  if (typeof name === 'function') return name;
  return eventSpawnAnimations.get(normalizeEventSpawnAnimationName(name)) || null;
}

export async function playEventSpawnAnimation(name, context = {}) {
  const animation = getEventSpawnAnimation(name);
  if (!animation) {
    throw new Error(`[Events] Animation de spawn inconnue : ${String(name)}.`);
  }
  return animation(context);
}

function normalizeSpawnChargeSide(side) {
  const normalizedSide = String(side || '').trim().toLowerCase();
  if (['a', 'sidea', 'armya'].includes(normalizedSide)) return 'A';
  if (['b', 'sideb', 'armyb'].includes(normalizedSide)) return 'B';
  return null;
}

function findEventSpawnElement(entity, preferredElement = null) {
  if (preferredElement) return preferredElement;
  if (!entity?.id || typeof document === 'undefined') return null;
  return document.getElementById(`Box_Entite_${entity.id}`)
    || document.getElementById(`imgContainer_${entity.id}`)
    || document.getElementById(`spriteContainer_${entity.id}`)
    || null;
}

function waitForEventAnimationFrame() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

async function waitForEventSpawnElement(entity, preferredElement, attempts = 8) {
  let element = findEventSpawnElement(entity, preferredElement);
  for (let attempt = 0; !element && attempt < attempts; attempt += 1) {
    await waitForEventAnimationFrame();
    element = findEventSpawnElement(entity, preferredElement);
  }
  return element;
}

function eventSpawnAnimationViewport(element, container = null) {
  const gameWindows = container
    || element?.closest?.('#game-windows')
    || (typeof document !== 'undefined'
      ? document.getElementById?.('game-windows')
      : null)
    || null;
  const viewportRect = gameWindows?.getBoundingClientRect?.();
  if (viewportRect && Number.isFinite(viewportRect.left) && Number.isFinite(viewportRect.right)) {
    return { element: gameWindows, rect: viewportRect };
  }
  const width = Math.max(
    0,
    Number(typeof window !== 'undefined' ? window.innerWidth : 0) || 0
  );
  return {
    element: null,
    rect: { left: 0, right: width, width }
  };
}

function dispatchEventSpawnAnimation(type, detail) {
  if (
    typeof window === 'undefined'
    || typeof window.dispatchEvent !== 'function'
    || typeof CustomEvent !== 'function'
  ) return false;
  window.dispatchEvent(new CustomEvent(type, { detail }));
  return true;
}

function spawnChargeTransform(baseTransform, x = 0, y = 0) {
  const translation = `translate3d(${x}px, ${y}px, 0)`;
  return baseTransform ? `${translation} ${baseTransform}` : translation;
}

function startSpawnChargeSpeedTrail({
  animatedElement,
  viewport,
  side,
  offsetX,
  duration
}) {
  if (typeof createSpeedTrail !== 'function') return null;

  const parent = viewport?.element
    || animatedElement?.closest?.('#game-windows')
    || animatedElement?.parentElement
    || null;
  if (!parent?.appendChild || !animatedElement?.getBoundingClientRect) return null;

  const entityRect = animatedElement.getBoundingClientRect();
  const parentRect = parent.getBoundingClientRect?.() || { left: 0, top: 0 };
  const movementX = -offsetX;
  const movingLeft = movementX < 0;
  const resolvedDuration = Math.max(120, Number(duration) || EVENT_SPAWN_CHARGE_DURATION);
  const rushDuration = Math.max(90, Math.round(resolvedDuration * 0.72));

  // Même proportions que le trail de la charge de mêlée.
  const travelFactor = Math.min(1, Math.abs(movementX) / Math.max(1, entityRect.width * 8));
  const trailWidth = Math.min(
    176,
    Math.max(60, entityRect.width * (1.1 + travelFactor * 0.55))
  );
  const trailHeight = Math.min(
    20,
    Math.max(8, entityRect.height * (0.14 + travelFactor * 0.04))
  );

  const centerX = entityRect.left - parentRect.left + entityRect.width / 2;
  const centerY = entityRect.top - parentRect.top + entityRect.height / 2;
  const rotation = movingLeft ? 180 : 0;
  const trailTransform = (progress, stretch = 1) =>
    `translate3d(${movementX * progress}px, 0, 0) rotate(${rotation}deg) scaleX(${stretch})`;

  try {
    const trail = createSpeedTrail(parent, {
      className: 'melee-motion-trail event-spawn-charge-trail',
      style: {
        left: `${centerX - trailWidth}px`,
        top: `${centerY - trailHeight / 2}px`,
        width: `${trailWidth}px`,
        height: `${trailHeight}px`,
        zIndex: '49'
      }
    });

    let animation = null;
    if (typeof trail.animate === 'function') {
      // Profil volontairement proche de la charge de mêlée : le trait devient
      // surtout visible lorsque la vitesse monte, s'étire avant l'arrivée,
      // puis se contracte et disparaît au moment de l'impact.
      animation = trail.animate([
        { transform: trailTransform(0, 0.72), opacity: '0', offset: 0 },
        { transform: trailTransform(0.08, 0.82), opacity: '0.18', offset: 0.12 },
        { transform: trailTransform(0.24, 0.94), opacity: '0.42', offset: 0.28 },
        { transform: trailTransform(0.52, 1.08), opacity: '0.36', offset: 0.52 },
        { transform: trailTransform(0.76, 1.18), opacity: '0.56', offset: 0.72 },
        { transform: trailTransform(0.92, 1.24), opacity: '0.72', offset: 0.88 },
        { transform: trailTransform(1, 0.45), opacity: '0', offset: 1 }
      ], {
        duration: rushDuration,
        easing: 'cubic-bezier(0.8, 0, 0.2, 1)',
        fill: 'forwards'
      });
    } else {
      trail.style.transform = trailTransform(0, 0.82);
      trail.style.opacity = '0.45';
    }

    return { trail, animation };
  } catch (error) {
    console.warn('[Events] createSpeedTrail indisponible pour spawnCharge.', error);
    return null;
  }
}

function stopSpawnChargeSpeedTrail(handle) {
  if (!handle) return;
  try {
    const trail = handle.trail || handle;
    handle.animation?.cancel?.();
    trail?.getAnimations?.().forEach(animation => animation.cancel());
    trail?.remove?.();
  } catch (error) {
    console.warn('[Events] Nettoyage createSpeedTrail impossible.', error);
  }
}

/**
 * Charge latérale depuis l’extérieur de #game-windows jusqu’à la position
 * déjà calculée par le plateau. A arrive par la gauche, B par la droite.
 *
 * La fin reprend le feeling d'une charge de mêlée : accélération franche,
 * petit dépassement de la cible, recul très court, puis stabilisation.
 */
export async function spawnCharge({
  entity,
  element = null,
  side = entity?.side,
  container = null,
  duration = EVENT_SPAWN_CHARGE_DURATION,
  outsideOffset = EVENT_SPAWN_CHARGE_OUTSIDE_OFFSET,
  easing = 'cubic-bezier(0.16, 0.9, 0.24, 1)',
  domAttempts = 8
} = {}) {
  const normalizedSide = normalizeSpawnChargeSide(side);
  const animatedElement = await waitForEventSpawnElement(entity, element, domAttempts);
  if (!normalizedSide || !animatedElement?.getBoundingClientRect) {
    console.warn('[Events] spawnCharge ignorée : camp ou élément DOM invalide.', {
      entityId: entity?.id ?? null,
      side
    });
    return {
      animation: 'spawnCharge',
      completed: false,
      reason: !normalizedSide ? 'invalidSide' : 'missingElement',
      entityId: entity?.id ?? null
    };
  }

  const elementRect = animatedElement.getBoundingClientRect();
  const viewport = eventSpawnAnimationViewport(animatedElement, container);
  const resolvedOutsideOffset = Math.max(0, Number(outsideOffset) || 0);
  const resolvedDuration = Math.max(0, Number(duration) || 0);
  const offsetX = normalizedSide === 'A'
    ? viewport.rect.left - resolvedOutsideOffset - elementRect.right
    : viewport.rect.right + resolvedOutsideOffset - elementRect.left;
  const direction = normalizedSide === 'A' ? 'left' : 'right';
  const computedTransform = typeof getComputedStyle === 'function'
    ? getComputedStyle(animatedElement).transform
    : 'none';
  const baseTransform = computedTransform && computedTransform !== 'none'
    ? computedTransform
    : '';
  const motionSign = normalizedSide === 'A' ? 1 : -1;
  const overshootX = 18 * motionSign;
  const recoilX = -6 * motionSign;
  const startTransform = spawnChargeTransform(baseTransform, offsetX, 0);
  const overshootTransform = spawnChargeTransform(baseTransform, overshootX, 0);
  const recoilTransform = spawnChargeTransform(baseTransform, recoilX, 0);
  const endTransform = spawnChargeTransform(baseTransform, 0, 0);
  const animationDetail = {
    animation: 'spawnCharge',
    entity,
    entityId: entity?.id ?? null,
    element: animatedElement,
    side: normalizedSide,
    direction,
    offsetX,
    outsideOffset: resolvedOutsideOffset,
    duration: resolvedDuration
  };

  animatedElement.classList?.add(
    'event-spawn-animation',
    'spawn-charge',
    `spawn-charge-from-${direction}`
  );
  if (animatedElement.dataset) {
    animatedElement.dataset.spawnAnimation = 'spawnCharge';
    animatedElement.dataset.spawnDirection = direction;
  }
  dispatchEventSpawnAnimation('eventSpawnAnimationStarted', animationDetail);

  const previousInline = {
    transform: animatedElement.style?.transform || '',
    transition: animatedElement.style?.transition || '',
    willChange: animatedElement.style?.willChange || '',
    zIndex: animatedElement.style?.zIndex || '',
    pointerEvents: animatedElement.style?.pointerEvents || ''
  };
  let speedTrail = null;

  try {
    if (animatedElement.style) {
      animatedElement.style.willChange = 'transform';
      animatedElement.style.zIndex = '50';
      animatedElement.style.pointerEvents = 'none';
    }

    // Poser l'entité hors écran avant de créer le trail : createSpeedTrail()
    // reçoit ainsi une position de départ réelle, puis son animation suit la ruée.
    if (animatedElement.style) {
      animatedElement.style.transform = startTransform;
    }
    speedTrail = startSpawnChargeSpeedTrail({
      animatedElement,
      viewport,
      side: normalizedSide,
      offsetX,
      duration: resolvedDuration
    });

    if (typeof animatedElement.animate === 'function') {
      const animation = animatedElement.animate([
        { transform: startTransform, offset: 0 },
        { transform: overshootTransform, offset: 0.72 },
        { transform: recoilTransform, offset: 0.88 },
        { transform: endTransform, offset: 1 }
      ], {
        duration: resolvedDuration,
        easing,
        fill: 'both'
      });
      try {
        await animation.finished;
      } finally {
        animation.cancel?.();
      }
    } else if (animatedElement.style) {
      const rushDuration = Math.round(resolvedDuration * 0.72);
      const recoilDuration = Math.round(resolvedDuration * 0.16);
      const settleDuration = Math.max(0, resolvedDuration - rushDuration - recoilDuration);

      animatedElement.style.transition = 'none';
      animatedElement.style.transform = startTransform;
      void animatedElement.offsetWidth;

      animatedElement.style.transition = `transform ${rushDuration}ms ${easing}`;
      animatedElement.style.transform = overshootTransform;
      await waitEventMilliseconds(rushDuration);

      animatedElement.style.transition = `transform ${recoilDuration}ms cubic-bezier(0.2, 0.8, 0.2, 1)`;
      animatedElement.style.transform = recoilTransform;
      await waitEventMilliseconds(recoilDuration);

      animatedElement.style.transition = `transform ${settleDuration}ms ease-out`;
      animatedElement.style.transform = endTransform;
      await waitEventMilliseconds(settleDuration);
    }
  } finally {
    stopSpawnChargeSpeedTrail(speedTrail);
    if (animatedElement.style) {
      animatedElement.style.transform = previousInline.transform;
      animatedElement.style.transition = previousInline.transition;
      animatedElement.style.willChange = previousInline.willChange;
      animatedElement.style.zIndex = previousInline.zIndex;
      animatedElement.style.pointerEvents = previousInline.pointerEvents;
    }
    animatedElement.classList?.remove(
      'event-spawn-animation',
      'spawn-charge',
      `spawn-charge-from-${direction}`
    );
    if (animatedElement.dataset) {
      delete animatedElement.dataset.spawnAnimation;
      delete animatedElement.dataset.spawnDirection;
    }
  }

  const result = {
    ...animationDetail,
    completed: true
  };
  dispatchEventSpawnAnimation('eventSpawnAnimationFinished', result);
  return result;
}

registerEventSpawnAnimation('spawnCharge', spawnCharge);

export async function spawnMonster({
  serial,
  side = 'B',
  eventId = null,
  levelId = getCurrentLevel(),
  unique = true,
  requireExisting = false,
  spawnAnimation = null,
  spawnAnimationOptions = {},
  entityOverrides = {},
  createOptions = {},
  // Placement spatial optionnel. Si absent, createEntityIngame conserve son fallback.
  spawnLine = null,
  spawnColumn = null
} = {}) {
  const numericSerial = Number(serial);
  if (!Number.isFinite(numericSerial)) {
    throw new TypeError('spawnMonster attend un serial valide.');
  }

  if (spawnAnimation != null && !getEventSpawnAnimation(spawnAnimation)) {
    throw new Error(`[Events] Animation de spawn inconnue : ${String(spawnAnimation)}.`);
  }

  if (unique) {
    const existing = entites.find((entity) => (
      Number(entity?.serial) === numericSerial
      && (!eventId || entity?.eventId === eventId || entity?.eventSpawned === true)
    ));
    if (existing) return existing;
  }

  if (requireExisting) {
    throw new Error(`[Events] L’entité serial ${numericSerial} devait déjà être présente.`);
  }

  const template = entitesNestUp.find((entity) => Number(entity?.serial) === numericSerial);
  if (!template) {
    throw new Error(`[Events] Entité serial ${numericSerial} introuvable.`);
  }

  let resolvedPosition = createOptions?.position ?? null;

  // Un placement spatial explicite prend la priorité sur le fallback automatique.
  // Les deux paramètres sont optionnels indépendamment : l'axe manquant prend son centre.
  if (!resolvedPosition && (spawnLine != null || spawnColumn != null)) {
    const [bestPosition] = hexCoordonne(
      side,
      spawnLine ?? 'middle',
      spawnColumn ?? 'center',
      1
    );
    resolvedPosition = bestPosition ?? null;
  }

  const spawnedEntity = await createEntityIngame({
    ...cloneValue(template),
    ...(entityOverrides && typeof entityOverrides === 'object'
      ? cloneValue(entityOverrides)
      : {}),
    ...(eventId ? { eventId } : {}),
    eventSpawned: true
  }, {
    side,
    ...createOptions,
    ...(resolvedPosition ? { position: resolvedPosition } : {})
  });

  const element = typeof document !== 'undefined'
    ? document.getElementById(`Box_Entite_${spawnedEntity.id}`)
    : null;
  if (element && eventId) element.dataset.gameEvent = eventId;
  if (spawnAnimation != null) {
    spawnedEntity.eventSpawnAnimation = typeof spawnAnimation === 'string'
      ? spawnAnimation
      : spawnAnimation.name || 'custom';
  }
  if (side === 'B') saveSpawnedEntityInArmyB(spawnedEntity, levelId);

  if (spawnAnimation != null) {
    try {
      const animationResult = await playEventSpawnAnimation(spawnAnimation, {
        ...(spawnAnimationOptions && typeof spawnAnimationOptions === 'object'
          ? spawnAnimationOptions
          : {}),
        entity: spawnedEntity,
        element,
        side,
        eventId,
        levelId
      });
      spawnedEntity.eventSpawnAnimationCompleted = animationResult?.completed === true;
    } catch (error) {
      spawnedEntity.eventSpawnAnimationCompleted = false;
      console.error(
        `[Events] L’animation de spawn ${spawnedEntity.eventSpawnAnimation} a échoué.`,
        error
      );
    }
  }

  return spawnedEntity;
}

function normalizeEventTemplateName(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function eventTemplateLevel(entity) {
  return Number(entity?.level?.current ?? entity?.level ?? 1) || 1;
}

function eventTemplateMaxHp(entity) {
  return Number(
    entity?.stats?.HP?.max
    ?? entity?.stats?.HP?.current
    ?? entity?.HP?.max
    ?? entity?.HP?.current
    ?? entity?.HP
    ?? Number.POSITIVE_INFINITY
  ) || Number.POSITIVE_INFINITY;
}

function resolveEventEntityTemplate({ serial = null, entityName = '', aliases = [] } = {}) {
  const numericSerial = Number(serial);
  if (serial != null && Number.isFinite(numericSerial)) {
    const serialMatch = entitesNestUp.find((entity) => Number(entity?.serial) === numericSerial);
    if (serialMatch) return serialMatch;
  }

  const requestedNames = [entityName, ...(Array.isArray(aliases) ? aliases : [])]
    .map(normalizeEventTemplateName)
    .filter(Boolean);
  const candidates = entitesNestUp.map((entity) => ({
    entity,
    normalizedName: normalizeEventTemplateName(entity?.name)
  }));

  for (const requestedName of requestedNames) {
    const exactMatch = candidates.find(({ normalizedName }) => normalizedName === requestedName);
    if (exactMatch) return exactMatch.entity;
  }

  for (const requestedName of requestedNames) {
    const requestedWords = requestedName.split(' ').filter((word) => word.length > 2);
    const wordMatch = candidates.find(({ normalizedName }) => {
      const candidateWords = normalizedName.split(' ');
      return requestedWords.length > 0 && requestedWords.every((requestedWord) => (
        candidateWords.some((candidateWord) => (
          candidateWord.startsWith(requestedWord)
          || requestedWord.startsWith(candidateWord)
        ))
      ));
    });
    if (wordMatch) return wordMatch.entity;
  }

  if (requestedNames.some((requestedName) => requestedName.split(' ').includes('porc'))) {
    const lowestPigTemplate = candidates
      .filter(({ normalizedName }) => normalizedName.split(' ').includes('porc'))
      .map(({ entity }) => entity)
      .sort((first, second) => (
        eventTemplateLevel(first) - eventTemplateLevel(second)
        || eventTemplateMaxHp(first) - eventTemplateMaxHp(second)
        || Number(first?.serial ?? Number.POSITIVE_INFINITY)
          - Number(second?.serial ?? Number.POSITIVE_INFINITY)
      ))[0];
    if (lowestPigTemplate) return lowestPigTemplate;
  }

  throw new Error(
    `[Events] Modèle d’entité introuvable : ${entityName || serial || 'non renseigné'}.`
  );
}

function zeroEventResource(container, key) {
  if (!container || typeof container !== 'object' || !(key in container)) return;
  const value = container[key];
  if (value && typeof value === 'object') {
    if ('current' in value) value.current = 0;
    if ('value' in value) value.value = 0;
    if ('amount' in value) value.amount = 0;
    return;
  }
  container[key] = 0;
}

function prepareEventLootableCorpse(entity, reward = 'random') {
  EVENT_RESURRECTION_TYPES.forEach((resourceKey) => {
    zeroEventResource(entity, resourceKey);
    zeroEventResource(entity?.stats, resourceKey);
  });

  const hp = entity?.stats?.HP ?? entity?.HP;
  if (hp && typeof hp === 'object') {
    hp.current = 0;
  } else if (entity?.stats && Object.prototype.hasOwnProperty.call(entity.stats, 'HP')) {
    entity.stats.HP = 0;
  } else {
    entity.HP = 0;
  }

  entity.isDEAD = true;
  entity.dead = true;
  entity.statut = Array.isArray(entity.statut)
    ? [...new Set([...entity.statut, 'dead'])]
    : ['dead'];
  entity.lootable = true;
  entity.eventLootable = true;
  entity.eventCorpse = true;
  entity.excludeFromBattle = true;
  entity.excludeFromVictory = true;
  entity.countsForVictory = false;
  entity.hasReward = reward !== false;
  if (reward !== false) {
    entity.eventReward = reward === true ? 'random' : cloneValue(reward);
  }
}

export async function spawnDead({
  serial = null,
  entityName = 'Porc des bas-fonds',
  aliases = [],
  side = 'neutral',
  reward = 'random',
  eventKey = null,
  eventId = null,
  levelId = getCurrentLevel(),
  createOptions = {}
} = {}) {
  const template = resolveEventEntityTemplate({ serial, entityName, aliases });
  const corpseBase = cloneValue(template);
  prepareEventLootableCorpse(corpseBase, reward);
  corpseBase.eventId = eventId || eventKey || 'spawnDead';
  corpseBase.eventSpawned = true;
  corpseBase.eventSpawnedCorpse = true;

  // Création directe en état mort : surtout ne pas appeler LifeandDeath ou
  // killEventEntity, car ces fonctions déclenchent la vérification de victoire.
  const corpse = await createEntityIngame(corpseBase, {
    ...createOptions,
    side
  });

  prepareEventLootableCorpse(corpse, reward);
  corpse.side = side;
  corpse.eventId = corpseBase.eventId;
  corpse.eventSpawned = true;
  corpse.eventSpawnedCorpse = true;

  const corpseElement = document.getElementById(`Box_Entite_${corpse.id}`)
    || document.getElementById(`imgContainer_${corpse.id}`);
  if (corpseElement) {
    corpseElement.dataset.gameEvent = corpse.eventId;
    corpseElement.dataset.lootable = 'true';
    corpseElement.dataset.ignoreVictory = 'true';
    corpseElement.classList.add('dead', 'lootable-corpse', 'event-corpse');
  }

  const isDead = !isAliveEventEntity(corpse);
  if (!isDead) {
    throw new Error(`[Events] ${eventEntityName(corpse)} n’a pas pu être transformé en cadavre.`);
  }

  syncEventMaterialChanges();
  window.dispatchEvent(new CustomEvent('eventCorpseSpawned', {
    detail: {
      entity: corpse,
      entityId: corpse.id,
      levelId,
      lootable: true,
      reward: reward === false ? null : cloneValue(reward),
      ignoreVictory: true
    }
  }));

  const name = eventEntityName(corpse);
  return {
    corpse,
    eventResults: [eventResult('lootableCorpseSpawned', {
      entityId: corpse.id,
      serial: corpse.serial,
      name,
      side,
      lootable: true,
      reward: reward === false ? null : cloneValue(reward)
    }, `<strong>Un cadavre de ${escapeEventHtml(name)} apparaît.</strong><br>Il peut être fouillé et contient une récompense.`, [
      'event-result-corpse-spawned',
      'loot'
    ])]
  };
}

export async function spawnChest({
  levelId = getCurrentLevel(),
  spawnMode = 'drop',
  random = true,
  forceNew = true,
  eventKey = null
} = {}) {
  if (typeof runtimeAdapters.spawnChest === 'function') {
    return runtimeAdapters.spawnChest({
      levelId,
      spawnMode,
      random,
      forceNew,
      eventKey
    });
  }

  const stageId = String(levelId ?? activeLevelId ?? getCurrentLevel() ?? '');
  const gameStages = loadFromLocalStorage('GameStages', { stages: [] });
  const stage = Array.isArray(gameStages?.stages)
    ? gameStages.stages.find((candidate) => String(candidate?.id) === stageId)
    : null;
  if (!stageId || !stage) {
    throw new Error('[Events] Impossible de créer un coffre sans niveau actif valide.');
  }

  const chest = getOrCreateStageChest({
    ...stage,
    reward: 'chest'
  }, {
    forceNew,
    random,
    source: eventKey || 'spawnChest'
  });
  const storedChests = getStageChests(stageId, { includeDestroyed: true });
  const resolvedChest = chest || storedChests[storedChests.length - 1] || null;
  if (!resolvedChest) {
    throw new Error('[Events] La création du coffre aléatoire a échoué.');
  }

  window.dispatchEvent(new CustomEvent('stageChestsLoaded', {
    detail: {
      stageId,
      chests: [resolvedChest],
      spawnMode,
      random,
      source: eventKey || 'spawnChest'
    }
  }));
  syncEventMaterialChanges();

  const chestId = resolvedChest.id ?? resolvedChest.chestId ?? resolvedChest.uid ?? null;
  return {
    chest: resolvedChest,
    eventResults: [eventResult('randomChestSpawned', {
      chestId,
      stageId,
      lootable: true,
      random: Boolean(random)
    }, '<strong>Un coffre apparaît dans le niveau.</strong><br>Son contenu aléatoire peut être récupéré immédiatement.', [
      'event-result-chest-spawned',
      'loot'
    ])]
  };
}

function getConfiguredOutcomeAdapter(names) {
  for (const name of names) {
    const adapter = runtimeAdapters[name];
    if (typeof adapter === 'function') return { name, adapter };

    const globalAdapter = typeof window !== 'undefined' ? window[name] : null;
    if (typeof globalAdapter === 'function') {
      return { name, adapter: globalAdapter.bind(window) };
    }
  }
  return null;
}

async function runConfiguredOutcomePipeline({ complete, components }, payload) {
  const completeAdapter = getConfiguredOutcomeAdapter(complete);
  if (completeAdapter) {
    return {
      completeAdapterName: completeAdapter.name,
      adapterNames: [completeAdapter.name],
      adapterResults: [await completeAdapter.adapter(payload)]
    };
  }

  const adapterNames = [];
  const adapterResults = [];
  for (const aliases of components) {
    const configured = getConfiguredOutcomeAdapter(aliases);
    if (!configured) continue;
    adapterNames.push(configured.name);
    adapterResults.push(await configured.adapter(payload));
  }
  return { completeAdapterName: null, adapterNames, adapterResults };
}

function dispatchEventOutcomeSignal(type, detail) {
  if (
    typeof window === 'undefined'
    || typeof window.dispatchEvent !== 'function'
    || typeof CustomEvent !== 'function'
  ) {
    return false;
  }
  window.dispatchEvent(new CustomEvent(type, { detail }));
  return true;
}

function eventOutcomeDetail(payload, adapterNames = []) {
  return {
    outcome: payload.outcome,
    adminOnly: true,
    stageOutcome: payload.stageOutcome === true,
    eventKey: payload.eventKey || payload.event?.key || null,
    eventId: payload.event?.id || null,
    executionId: payload.executionId || null,
    levelId: payload.levelId ?? activeLevelId ?? getCurrentLevel(),
    visualOnly: payload.visualOnly,
    showGameOver: payload.showGameOver === true,
    allowDismiss: payload.allowDismiss === true,
    preserveSave: payload.preserveSave === true,
    skipSaveDeletion: payload.skipSaveDeletion === true,
    endGame: payload.endGame,
    finishGame: payload.finishGame,
    terminateGame: payload.terminateGame,
    skipGameOver: payload.skipGameOver,
    skipEndGame: payload.skipEndGame,
    adapterNames: [...adapterNames]
  };
}

function resolveActualStageGameOverUi(adapterResults = []) {
  const gameOverResult = adapterResults.find((result) => (
    result?.overlay || result?.dismissButton || result?.actionButton
  )) || null;
  const screen = gameOverResult?.overlay
    || (typeof document !== 'undefined'
      ? document.querySelector?.('.overlay-end-screen.overlay-defeat')
      : null)
    || null;
  const button = gameOverResult?.dismissButton
    || gameOverResult?.actionButton
    || screen?.querySelector?.('#admin-stage-game-over-exit')
    || null;

  return { result: gameOverResult, screen, button };
}

/**
 * Événement d'administration : déclenche une vraie victoire de stage.
 */
export async function eventVictory(options = {}) {
  const payload = {
    ...options,
    outcome: 'victory',
    stageOutcome: true,
    visualOnly: false,
    endGame: true,
    finishGame: true,
    terminateGame: true,
    skipGameOver: false,
    skipEndGame: false
  };

  await closeEventCinematic();
  cinematicScreenFX('success');
  dispatchEventOutcomeSignal('adminStageVictoryRequested', eventOutcomeDetail(payload));
  dispatchEventOutcomeSignal('eventVictoryRequested', eventOutcomeDetail(payload));

  const pipeline = await runConfiguredOutcomePipeline({
    complete: STAGE_VICTORY_COMPLETE_ADAPTERS,
    components: STAGE_VICTORY_COMPONENT_ADAPTERS
  }, payload);
  if (!pipeline.completeAdapterName) {
    throw new Error('[Events] Le véritable gestionnaire de victoire de stage n’est pas configuré.');
  }
  const detail = {
    ...eventOutcomeDetail(payload, pipeline.adapterNames),
    actualStageVictory: true
  };
  dispatchEventOutcomeSignal('adminStageVictoryTriggered', detail);
  dispatchEventOutcomeSignal('eventVictoryTriggered', detail);

  return {
    ...detail,
    adapterResults: pipeline.adapterResults,
    eventResults: [eventResult('victoryTriggered', detail,
      '<strong>La victoire est déclenchée.</strong><br>La séquence complète peut maintenant s’exécuter.',
      ['event-result-victory', 'success'])]
  };
}

/**
 * Événement d'administration : affiche la défaite de stage / Game Over,
 * sans exécuter la terminaison définitive, puis ajoute un bouton de sortie.
 */
export async function eventDefeat(options = {}) {
  const payload = {
    ...options,
    outcome: 'defeat',
    stageOutcome: true,
    showGameOver: true,
    allowDismiss: true,
    preserveSave: true,
    skipSaveDeletion: true,
    visualOnly: false,
    endGame: true,
    finishGame: true,
    terminateGame: false,
    skipGameOver: false,
    skipEndGame: false
  };

  await closeEventCinematic();
  cinematicScreenFX('fail');
  dispatchEventOutcomeSignal('adminStageGameOverRequested', eventOutcomeDetail(payload));
  dispatchEventOutcomeSignal('eventDefeatVisualsRequested', eventOutcomeDetail(payload));

  const pipeline = await runConfiguredOutcomePipeline({
    complete: STAGE_GAME_OVER_PREVIEW_ADAPTERS,
    components: STAGE_GAME_OVER_COMPONENT_ADAPTERS
  }, payload);
  if (!pipeline.completeAdapterName) {
    throw new Error('[Events] Le véritable gestionnaire de Game Over n’est pas configuré.');
  }
  const gameOverUi = resolveActualStageGameOverUi(pipeline.adapterResults);
  if (!gameOverUi.screen || !gameOverUi.button) {
    throw new Error('[Events] Le vrai écran Game Over ou son bouton de sortie est introuvable.');
  }
  const detail = {
    ...eventOutcomeDetail(payload, pipeline.adapterNames),
    actualGameOver: true,
    gameOverVisible: true,
    exitButtonVisible: true,
    savePreserved: gameOverUi.result?.savePreserved === true,
    fallbackScreen: false
  };
  dispatchEventOutcomeSignal('adminStageGameOverShown', detail);
  dispatchEventOutcomeSignal('eventDefeatVisualsTriggered', detail);

  return {
    ...detail,
    adapterResults: pipeline.adapterResults,
    eventResults: [eventResult('defeatVisualsTriggered', detail,
      '<strong>Le Game Over du stage est affiché.</strong><br>Le bouton permet de quitter cet écran sans terminer la partie.',
      ['event-result-defeat', 'fail'])]
  };
}

export async function destroyNeutrals(options = {}) {
  if (typeof runtimeAdapters.destroyNeutrals === 'function') {
    return runtimeAdapters.destroyNeutrals(options);
  }

  const container = options.container || document.querySelector('.hex-grid');
  if (!container) return { destroyed: 0, elements: [] };

  const neutralElements = [...new Set(container.querySelectorAll([
    '[data-side="neutral"]',
    '[data-camp="neutral"]',
    '[data-entity-side="neutral"]'
  ].join(',')))].filter((element) => !element.matches('.hex'));

  for (const element of neutralElements) {
    removeBattleElementFromDOM(element);
  }

  window.dispatchEvent(new CustomEvent('neutralObjectsDestroyed', {
    detail: { count: neutralElements.length }
  }));

  return { destroyed: neutralElements.length, elements: neutralElements };
}

export async function forceCombat(payload = {}) {
  await closeEventCinematic();
  restoreCombatDomImmediately();
  const result = requireRuntimeAdapter('forceCombat')(payload);
  return result;
}

function restoreCombatDomImmediately() {
  closeDialogueWindow({ remove: true });
  cinematicScreenFX(false);
  clearTimeout(cinematicCloseTimer);
  clearTimeout(cinematicDialogueTimer);
  cinematicCloseTimer = null;
  cinematicDialogueTimer = null;
  cinematicDialogueReadyAt = 0;
  activeEventCinematicMode = null;
  cinematicPerspectiveEngaged = false;
  document.querySelectorAll('.event-cinematic').forEach((element) => element.remove());

  // Ces deux opérations sont synchrones : le plateau est remis à 50° et le
  // listener de molette est rattaché avant que le combat prenne la main.
  restoreParallaxViewAndControls();

  document.querySelectorAll('.dragged').forEach((element) => {
    element.classList.remove('dragged');
  });
  document.querySelectorAll('.sprite').forEach((sprite) => {
    sprite.style.removeProperty('opacity');
    sprite.style.removeProperty('pointer-events');
    if (!sprite.classList.contains('side-B') || window.levelRunning === 'admin') {
      sprite.draggable = true;
    }
  });
}

/**
 * Met en pause la partie dialogue d'un événement pendant son combat.
 *
 * L'événement reste dans `inProgress` pour pouvoir être terminé plus tard
 * (par exemple à la mort du monstre), mais il ne bloque plus le système
 * normal de `.battle-actions`.
 */
export function battleEventInPause(eventKey = null) {
  const questSnapshot = loadQuestState();
  const resolvedEventKey = typeof eventKey === 'string'
    ? eventKey
    : eventKey?.eventKey || questSnapshot.activeEventKey || null;

  if (!resolvedEventKey) {
    restoreCombatDomImmediately();
    void restoreAllInterface().catch((error) => {
      console.error('[Events] Restauration d’interface pré-combat impossible.', error);
    });
    window.dispatchEvent(new CustomEvent('battleActionContextChanged', {
      detail: { dialogueActive: false, reason: 'battle-without-active-event' }
    }));
    return null;
  }

  let combatState = null;
  updateQuestState((quest) => {
    const stored = quest.inProgress?.[resolvedEventKey];
    if (!stored) return quest;

    combatState = {
      ...stored,
      status: 'battleEventInPause',
      phase: 'combat',
      dialogueActive: false,
      eventInPause: true,
      eventPausedForBattle: true,
      pauseReason: 'battle',
      combatStartedAt: stored.combatStartedAt || nowIso(),
      updatedAt: nowIso()
    };
    quest.inProgress[resolvedEventKey] = combatState;
    return quest;
  });

  if (combatState) {
    syncEventStateToStage(resolvedEventKey, combatState, 'battleEventInPause');
  }

  // Même si aucune sauvegarde n'a été trouvée, un combat ordinaire reprend
  // toujours la priorité sur l'ancien dialogue.
  restoreCombatDomImmediately();
  void restoreAllInterface().then(() => {
    restoreCombatDomImmediately();
  }).catch((error) => {
    console.error('[Events] Restauration d’interface pré-combat impossible.', error);
  });
  window.dispatchEvent(new CustomEvent('battleActionContextChanged', {
    detail: {
      dialogueActive: false,
      reason: 'battle-event-in-progress',
      eventKey: resolvedEventKey
    }
  }));

  return combatState;
}

export async function forceBattle(options = {}) {
  // La fin cinématique précède le nettoyage de combat afin que les bandes et
  // le voile aient toujours le temps d’achever leur transition sortante.
  await closeEventCinematic();

  // Déclare automatiquement l'événement actif en pause de dialogue.
  battleEventInPause(options?.eventKey || null);

  /*
   * Un combat ne doit JAMAIS démarrer avec les interfaces encore retirées
   * par le dialogue / cinematic.
   *
   * Ordre verrouillé :
   * dialogue fermé
   * -> aura/cinematic retirés
   * -> première restauration des interfaces
   * -> lancement COMPLET du combat
   * -> seconde restauration de sécurité
   *
   * La seconde restauration est volontaire : startGame() peut modifier ou
   * reconstruire le DOM pendant son lancement. On garantit ainsi que
   * `.Game-UI` et une unique `.board-ui` existent une fois le combat démarré.
   */
  restoreCombatDomImmediately();
  const interfaceBeforeBattle = await restoreAllInterface();
  restoreCombatDomImmediately();

  const saveResult = saveCurrentGameData();
  const logResult = battleLogs('battle_start');

  // Important : attendre startGame() s'il retourne une Promise.
  const startResult = await Promise.resolve(startGame());

  const interfaceAfterBattle = await restoreAllInterface();
  restoreCombatDomImmediately();

  return {
    saveResult,
    logResult,
    startResult,
    interfaceBeforeBattle,
    interfaceAfterBattle
  };
}

export function closeDialogue(options = {}) {
  const { keepCinematic = false, ...dialogueOptions } = options || {};
  const closed = closeDialogueWindow(dialogueOptions);
  cinematicScreenFX(false);
  if (!keepCinematic) void closeEventCinematic();
  return closed;
}

export async function fleeCombat(payload = {}) {
  await closeEventCinematic();
  const result = requireRuntimeAdapter('fleeCombat')(payload);
  return result;
}

export async function quitCombat(payload = {}) {
  await closeEventCinematic();
  const result = requireRuntimeAdapter('quitCombat')(payload);
  return result;
}

export async function quitLevel(payload = {}) {
  await closeEventCinematic();
  const result = requireRuntimeAdapter('quitLevel')(payload);
  return result;
}

function normalizeEventTargetSide(side) {
  const normalized = String(side || 'A').trim().toLowerCase();
  if (['a', 'armya', 'sidea'].includes(normalized)) return 'A';
  if (['b', 'armyb', 'sideb'].includes(normalized)) return 'B';
  if (['both', 'all', 'a+b', 'ab'].includes(normalized)) return 'both';
  throw new TypeError(`[Events] Camp de ciblage invalide : ${side}.`);
}

function normalizeEventLifeState(lifeState, includeDead = false) {
  if (lifeState == null || lifeState === '') {
    return includeDead ? 'all' : 'alive';
  }
  const normalized = String(lifeState).trim().toLowerCase();
  if (['alive', 'living', 'vivant', 'vivants'].includes(normalized)) return 'alive';
  if (['dead', 'corpse', 'corpses', 'cadavre', 'cadavres'].includes(normalized)) return 'dead';
  if (['all', 'both', 'any', 'tous'].includes(normalized)) return 'all';
  throw new TypeError(`[Events] État de vie ciblé invalide : ${lifeState}.`);
}

function getEntityHpRecord(entity) {
  const hp = entity?.stats?.HP ?? entity?.HP;
  if (hp && typeof hp === 'object') return hp;
  return null;
}

function getEntityCurrentHp(entity) {
  const hp = entity?.stats?.HP ?? entity?.HP;
  const value = hp && typeof hp === 'object' ? hp.current : hp;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function getEntityMaxHp(entity) {
  const hp = entity?.stats?.HP ?? entity?.HP;
  const value = hp && typeof hp === 'object' ? hp.max ?? hp.current : hp;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function setEntityCurrentHp(entity, value) {
  const finalValue = Math.max(0, Number(value) || 0);
  const hpRecord = getEntityHpRecord(entity);
  if (hpRecord) hpRecord.current = finalValue;
  else if (entity?.stats && Object.prototype.hasOwnProperty.call(entity.stats, 'HP')) {
    entity.stats.HP = finalValue;
  } else if (entity) {
    entity.HP = finalValue;
  }
  return finalValue;
}

function getEntityArmor(entity) {
  const armor = entity?.stats?.armor ?? entity?.stats?.armors
    ?? entity?.armor ?? entity?.armors;
  if (!armor || typeof armor !== 'object') {
    return { record: null, current: 0, max: 0 };
  }
  const current = Math.max(0, Number(armor.current) || 0);
  const max = Math.max(current, Number(armor.max) || 0);
  return { record: armor, current, max };
}

function destroyEventEntityArmor(entity) {
  const armor = getEntityArmor(entity);
  if (armor.record) armor.record.current = 0;
  return {
    armorBefore: armor.current,
    armorAfter: 0,
    armorDamage: armor.current
  };
}

function triggerEventDamageImpact(entity, armorDamage, rawDamage) {
  if (armorDamage > 0) damageArmorImpact(entity.id);
  else if (rawDamage > 0) damageImpact(entity.id);
  if (rawDamage > 0) shakeImpact(entity.id);
}

function showEventDamageNumbers(entity, hpDamage, armorDamage) {
  PopUpDamages(
    entity,
    hpDamage,
    [],
    '',
    hpDamage > 0 ? { physical: hpDamage } : {},
    '',
    armorDamage
  );
}

function persistEventEntityVitals(entity) {
  if (getEntityArmor(entity).record) saveEntityArmorState(entity);
  saveEntityHPToStorage(entity);
  const armor = getEntityArmor(entity);
  updateHealthBar(
    getEntityCurrentHp(entity),
    getEntityMaxHp(entity),
    armor.current,
    armor.max,
    entity.id,
    0
  );
}

function eventEntityName(entity) {
  return String(entity?.nickname || entity?.name || entity?.id || 'L’entité');
}

function eventEntityGender(entity) {
  return String(entity?.gender || '').trim().toLowerCase() === 'w' ? 'w' : 'm';
}

function eventGendered(record, masculine, feminine) {
  return record?.gender === 'w' ? feminine : masculine;
}

function eventGroupGendered(records, masculine, feminine) {
  return records.length > 0 && records.every((record) => record?.gender === 'w')
    ? feminine
    : masculine;
}

function escapeEventHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function eventMalusHtml(html) {
  return `<span class="malus">${html}</span>`;
}

function getTargetPool(side, {
  lifeState = null,
  includeDead = false,
  levelId
} = {}) {
  const normalizedSide = normalizeEventTargetSide(side);
  const normalizedLifeState = normalizeEventLifeState(lifeState, includeDead);
  const sides = normalizedSide === 'both' ? ['A', 'B'] : [normalizedSide];
  return sides.flatMap((armySide) => getEventArmyEntities(armySide, levelId)
    .filter((entity) => {
      if (normalizedLifeState === 'all') return true;
      const alive = isAliveEventEntity(entity);
      return normalizedLifeState === 'alive' ? alive : !alive;
    })
    .map((entity) => ({ entity, side: armySide })));
}

function acquiredTimestamp(entity) {
  const value = entity?.acquisition?.acquiredAt
    ?? entity?.acquiredAt
    ?? entity?.createdAt
    ?? '';
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number(value) || 0;
}

function acquisitionOrder(entity) {
  const value = Number(entity?.acquisition?.order);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function compareLastAcquisition(a, b) {
  const leftOrder = acquisitionOrder(a.entity);
  const rightOrder = acquisitionOrder(b.entity);
  if (leftOrder !== rightOrder) {
    if (leftOrder == null) return 1;
    if (rightOrder == null) return -1;
    return rightOrder - leftOrder;
  }
  return acquiredTimestamp(b.entity) - acquiredTimestamp(a.entity);
}

function compareFirstAcquisition(a, b) {
  const leftOrder = acquisitionOrder(a.entity);
  const rightOrder = acquisitionOrder(b.entity);
  if (leftOrder !== rightOrder) {
    if (leftOrder == null) return 1;
    if (rightOrder == null) return -1;
    return leftOrder - rightOrder;
  }
  return acquiredTimestamp(a.entity) - acquiredTimestamp(b.entity);
}

function compareStableEntityId(left, right) {
  return String(left?.entity?.id ?? '').localeCompare(String(right?.entity?.id ?? ''));
}

function eventTargetIdentity(target) {
  return `${String(target?.side || '')}:${String(target?.entity?.id ?? '')}`;
}

function normalizeEventTargetDirection(direction, fallback = 'lowest') {
  const normalized = String(direction || fallback).trim().toLowerCase();
  if (['lowest', 'low', 'asc', 'ascending', 'moins'].includes(normalized)) return 'lowest';
  if (['highest', 'high', 'desc', 'descending', 'plus'].includes(normalized)) return 'highest';
  throw new TypeError(`[Events] Direction de ciblage inconnue : ${direction}.`);
}

function normalizeEventTargetRule(rule, fallback = {}) {
  if (!rule || typeof rule !== 'object') return { ...fallback };
  const strategy = String(rule.strategy || fallback.strategy || 'lowestStat').trim();
  const normalizedStrategy = strategy.toLowerCase();
  if (['loweststat', 'higheststat'].includes(normalizedStrategy)) {
    return {
      strategy: normalizedStrategy === 'loweststat' ? 'lowestStat' : 'highestStat',
      statKey: String(rule.statKey ?? fallback.statKey ?? '').trim()
    };
  }
  return {
    strategy,
    statKey: rule.statKey ?? fallback.statKey ?? null
  };
}

const DEFAULT_EVENT_TARGET_TIE_BREAKERS = Object.freeze([
  Object.freeze({ statKey: 'HP.current', direction: 'lowest' }),
  Object.freeze({ statKey: 'level', direction: 'lowest' }),
  Object.freeze({ random: true })
]);

/**
 * Résout une seule fois le profil de ciblage. Le plan retourné peut ensuite
 * être réutilisé entre plusieurs étapes d'une action séquentielle.
 */
export function resolveEventTargetPlan({
  targetMode = null,
  strategy = 'first',
  statKey = null,
  tieBreakers = null
} = {}) {
  const normalizedMode = String(targetMode || 'default').trim().toLowerCase();
  let primaryRule = normalizeEventTargetRule({ strategy, statKey });

  if (['weakness', 'weakened', 'affaiblie', 'affaibli'].includes(normalizedMode)) {
    primaryRule = { strategy: 'lowestStat', statKey: 'HP.current' };
  } else if (!['default', 'normal', 'ranked', ''].includes(normalizedMode)) {
    throw new TypeError(`[Events] Mode de ciblage inconnu : ${targetMode}.`);
  }

  const normalizedStrategy = String(primaryRule.strategy || 'first').trim().toLowerCase();
  if (['loweststat', 'higheststat'].includes(normalizedStrategy)
    && !String(primaryRule.statKey ?? '').trim()) {
    throw new TypeError(`[Events] La stratégie ${primaryRule.strategy} exige un paramètre statKey.`);
  }

  const configuredTieBreakers = Array.isArray(tieBreakers)
    ? tieBreakers
    : DEFAULT_EVENT_TARGET_TIE_BREAKERS;
  const normalizedTieBreakers = configuredTieBreakers.map((criterion) => {
    if (criterion?.random === true) return { random: true };
    const criterionKey = String(criterion?.statKey ?? '').trim();
    if (!criterionKey) return null;
    return {
      statKey: criterionKey,
      direction: normalizeEventTargetDirection(criterion?.direction)
    };
  }).filter(Boolean);

  return Object.freeze({
    targetMode: normalizedMode,
    strategy: primaryRule.strategy,
    statKey: primaryRule.statKey ?? null,
    tieBreakers: Object.freeze(normalizedTieBreakers.map((criterion) => Object.freeze(criterion)))
  });
}

function compareEventStatTargets(left, right, statKey, direction) {
  const leftValue = getEventEntityStatValue(left.entity, statKey);
  const rightValue = getEventEntityStatValue(right.entity, statKey);

  // Une statistique absente ne doit jamais devenir artificiellement la plus
  // faible ou la plus forte : les entités concernées passent en fin de liste.
  if (leftValue == null && rightValue == null) return 0;
  if (leftValue == null) return 1;
  if (rightValue == null) return -1;

  return (leftValue - rightValue) * direction;
}

function randomEventTargetRanks(pool) {
  return new Map(pool.map((target) => [eventTargetIdentity(target), Math.random()]));
}

function eventTargetCriteria(plan) {
  const normalized = String(plan?.strategy || 'first').trim().toLowerCase();
  const criteria = [];

  if (normalized === 'loweststat') {
    criteria.push({ statKey: plan.statKey, direction: 'lowest', primary: true });
  } else if (normalized === 'higheststat') {
    criteria.push({ statKey: plan.statKey, direction: 'highest', primary: true });
  } else if (['lastacquisition', 'newest'].includes(normalized)) {
    criteria.push({ acquisition: 'last', primary: true });
  } else if (['firstacquisition', 'oldest'].includes(normalized)) {
    criteria.push({ acquisition: 'first', primary: true });
  } else if (normalized === 'random') {
    criteria.push({ random: true, primary: true });
  } else if (normalized !== 'first') {
    throw new TypeError(`[Events] Stratégie de ciblage inconnue : ${plan?.strategy}.`);
  }

  const rankedStrategy = [
    'loweststat',
    'higheststat',
    'lastacquisition',
    'firstacquisition',
    'newest',
    'oldest'
  ].includes(normalized);
  if (!rankedStrategy) return criteria;

  const usedStatKeys = new Set(
    criteria.filter((criterion) => criterion.statKey).map((criterion) => criterion.statKey)
  );
  for (const tieBreaker of plan?.tieBreakers || []) {
    if (tieBreaker.random === true) {
      if (!criteria.some((criterion) => criterion.random)) criteria.push({ random: true });
      continue;
    }
    if (usedStatKeys.has(tieBreaker.statKey)) continue;
    criteria.push({ ...tieBreaker });
    usedStatKeys.add(tieBreaker.statKey);
  }
  return criteria;
}

function compareTargetsByCriterion(left, right, criterion, randomRanks) {
  if (criterion.random) {
    return (randomRanks.get(eventTargetIdentity(left)) || 0)
      - (randomRanks.get(eventTargetIdentity(right)) || 0);
  }
  if (criterion.acquisition === 'last') return compareLastAcquisition(left, right);
  if (criterion.acquisition === 'first') return compareFirstAcquisition(left, right);
  const direction = normalizeEventTargetDirection(criterion.direction) === 'lowest' ? 1 : -1;
  return compareEventStatTargets(left, right, criterion.statKey, direction);
}

function sameTargetCriterionValue(left, right, criterion) {
  if (criterion.random) return false;
  if (criterion.acquisition) {
    return acquisitionOrder(left.entity) === acquisitionOrder(right.entity)
      && acquiredTimestamp(left.entity) === acquiredTimestamp(right.entity);
  }
  return getEventEntityStatValue(left.entity, criterion.statKey)
    === getEventEntityStatValue(right.entity, criterion.statKey);
}

function eventCriterionAnnouncement(criterion) {
  if (!criterion) return null;
  if (criterion.random) return 'Le hasard désigne cette entité.';
  if (criterion.acquisition === 'last') return 'L’entité arrivée le plus récemment dans l’équipe.';
  if (criterion.acquisition === 'first') return 'L’entité présente depuis le plus longtemps dans l’équipe.';
  return eventTargetAnnouncement({
    strategy: normalizeEventTargetDirection(criterion.direction) === 'lowest'
      ? 'lowestStat'
      : 'highestStat',
    statKey: criterion.statKey
  });
}

function selectionReasonFor(target, pool, criteria) {
  let tiedTargets = [...pool];
  let decisiveCriterion = criteria[0] || null;
  for (const criterion of criteria) {
    decisiveCriterion = criterion;
    const nextTiedTargets = tiedTargets.filter((candidate) => (
      sameTargetCriterionValue(target, candidate, criterion)
    ));
    if (nextTiedTargets.length <= 1) break;
    tiedTargets = nextTiedTargets;
  }
  return decisiveCriterion
    ? {
      criterion: decisiveCriterion.random
        ? 'random'
        : decisiveCriterion.statKey || `acquisition.${decisiveCriterion.acquisition}`,
      direction: decisiveCriterion.direction || decisiveCriterion.acquisition || 'random',
      tieBreaker: decisiveCriterion.primary !== true,
      announcement: eventCriterionAnnouncement(decisiveCriterion)
    }
    : null;
}

function sortEventTargets(pool, plan, { livingFirst = false } = {}) {
  const criteria = eventTargetCriteria(plan);
  const randomRanks = randomEventTargetRanks(pool);
  const sortGroup = (group) => [...group].sort((left, right) => {
    for (const criterion of criteria) {
      const comparison = compareTargetsByCriterion(left, right, criterion, randomRanks);
      if (comparison !== 0) return comparison;
    }
    return compareStableEntityId(left, right);
  });
  const sorted = livingFirst
    ? [
      ...sortGroup(pool.filter(({ entity }) => isAliveEventEntity(entity))),
      ...sortGroup(pool.filter(({ entity }) => !isAliveEventEntity(entity)))
    ]
    : sortGroup(pool);

  return sorted.map((target) => {
    const reason = selectionReasonFor(target, pool, criteria);
    return {
      ...target,
      selectionPlan: plan,
      selectionReason: reason,
      announcement: reason?.announcement || null,
      targetRandomRank: randomRanks.get(eventTargetIdentity(target)) ?? null
    };
  });
}

function eventTargetTraceCriterionLabel(criterion, index) {
  const prefix = criterion?.primary === true || index === 0 ? 'Principal' : `Départage ${index}`;
  if (criterion?.random) return `${prefix} : hasard`;
  if (criterion?.acquisition === 'last') return `${prefix} : arrivée la plus récente`;
  if (criterion?.acquisition === 'first') return `${prefix} : présence la plus ancienne`;
  const direction = normalizeEventTargetDirection(criterion?.direction) === 'lowest'
    ? 'minimum'
    : 'maximum';
  return `${prefix} : ${criterion?.statKey || 'stat inconnue'} (${direction})`;
}

function eventTargetTraceCriterionValue(target, criterion) {
  if (criterion?.random) {
    const rank = Number(target?.targetRandomRank);
    return Number.isFinite(rank) ? `tirage=${rank.toFixed(6)}` : 'tirage aléatoire indisponible';
  }
  if (criterion?.acquisition) {
    const order = acquisitionOrder(target.entity);
    const timestamp = acquiredTimestamp(target.entity);
    return `ordre=${order ?? 'absent'}, date=${timestamp || 'absente'}`;
  }
  const value = getEventEntityStatValue(target.entity, criterion?.statKey);
  return value == null ? 'absente' : value;
}

function eventTargetTraceRows(rankedTargets, selectedTargets, criteria) {
  const selectedIds = new Set(selectedTargets.map(eventTargetIdentity));
  return rankedTargets.map((target, index) => {
    const row = {
      Rang: index + 1,
      Retenue: selectedIds.has(eventTargetIdentity(target)) ? 'OUI' : 'non',
      Entité: eventEntityName(target.entity),
      ID: target.entity?.id ?? '',
      Camp: target.side,
      État: isAliveEventEntity(target.entity) ? 'vivante' : 'cadavre'
    };
    criteria.forEach((criterion, criterionIndex) => {
      row[eventTargetTraceCriterionLabel(criterion, criterionIndex)] = (
        eventTargetTraceCriterionValue(target, criterion)
      );
    });
    row['Critère décisif'] = target.selectionReason?.announcement
      || target.announcement
      || 'ordre disponible';
    return row;
  });
}

function traceEventTargetSelection({
  label = 'targetEventEntity',
  request = {},
  plan = null,
  rankedTargets = [],
  selectedTargets = [],
  livingFirst = false,
  traceId = ++eventTargetTraceId
} = {}) {
  if (typeof console === 'undefined') return traceId;
  const criteria = plan ? eventTargetCriteria(plan) : [];
  const title = `[Events][Targeting #${traceId}] ${label} — ${selectedTargets.length}/${rankedTargets.length} cible(s)`;
  console.groupCollapsed?.(title);
  console.log('[Events][Targeting] Consignes reçues', request);
  console.log('[Events][Targeting] Plan résolu', plan || {
    strategy: request.targetId != null ? 'targetId imposé' : 'aucun classement'
  });
  console.log('[Events][Targeting] Règle de population', {
    vivantsPrioritaires: livingFirst,
    candidats: rankedTargets.length,
    demandés: request.count,
    retenus: selectedTargets.length
  });
  const rows = eventTargetTraceRows(rankedTargets, selectedTargets, criteria);
  if (rows.length > 0) console.table?.(rows);
  else console.warn('[Events][Targeting] Aucune entité éligible.');
  selectedTargets.forEach((target, index) => {
    console.log(`[Events][Targeting] Choix ${index + 1} : ${eventEntityName(target.entity)}`, {
      entityId: target.entity?.id,
      side: target.side,
      state: isAliveEventEntity(target.entity) ? 'vivante' : 'cadavre',
      raison: target.selectionReason?.announcement || target.announcement || 'ordre disponible',
      critereDecisif: target.selectionReason?.criterion || (request.targetId != null ? 'targetId' : 'first'),
      departage: target.selectionReason?.tieBreaker === true
    });
  });
  console.groupEnd?.();
  return traceId;
}

function traceSequentialEventTargetChoice(sequence, target, remainingTargets) {
  if (typeof console === 'undefined' || !target) return;
  const criteria = sequence.selectionPlan ? eventTargetCriteria(sequence.selectionPlan) : [];
  const comparedTargets = remainingTargets.map((candidate) => ({
    ...candidate,
    selectionReason: sequence.selectionPlan
      ? selectionReasonFor(candidate, remainingTargets, criteria)
      : candidate.selectionReason
  }));
  const selected = comparedTargets.find((candidate) => (
    eventTargetIdentity(candidate) === eventTargetIdentity(target)
  )) || target;
  const step = sequence.processedSteps + 1;
  console.groupCollapsed?.(
    `[Events][Targeting #${sequence.traceId}] ${sequence.traceLabel} — étape ${step} : ${eventEntityName(target.entity)}`
  );
  console.table?.(eventTargetTraceRows(comparedTargets, [selected], criteria));
  console.log('[Events][Targeting] Pourquoi cette entité ?', {
    raison: selected.selectionReason?.announcement || selected.announcement || 'première cible disponible',
    critereDecisif: selected.selectionReason?.criterion || 'first',
    departage: selected.selectionReason?.tieBreaker === true,
    candidatsEncoreDisponibles: remainingTargets.length
  });
  console.groupEnd?.();
}

function traceEventTargetOverride(sequence, target, reason, details = {}) {
  if (typeof console === 'undefined') return;
  console.warn(`[Events][Targeting #${sequence?.traceId || '?'}] Cible réévaluée : ${eventEntityName(target?.entity)}`, {
    raison: reason,
    entityId: target?.entity?.id,
    side: target?.side,
    ...details
  });
}

export function targetEventEntity({
  side = 'A',
  strategy = 'first',
  statKey = null,
  targetMode = null,
  tieBreakers = null,
  selectionPlan = null,
  count = 1,
  targetId = null,
  lifeState = null,
  traceSelection = true,
  traceLabel = 'targetEventEntity',
  // Compatibilité avec les anciens scénarios : true équivaut à lifeState='all'.
  includeDead = false,
  levelId = activeLevelId || getCurrentLevel()
} = {}) {
  const normalizedLifeState = normalizeEventLifeState(lifeState, includeDead);
  let pool = getTargetPool(side, {
    lifeState: normalizedLifeState,
    includeDead,
    levelId
  });
  if (targetId != null) {
    pool = pool.filter(({ entity }) => String(entity?.id) === String(targetId));
    pool = pool.map((target) => ({
      ...target,
      selectionPlan: null,
      selectionReason: null,
      announcement: null
    }));
  } else {
    const plan = selectionPlan || resolveEventTargetPlan({
      targetMode,
      strategy,
      statKey,
      tieBreakers
    });
    pool = sortEventTargets(pool, plan, {
      livingFirst: normalizedLifeState === 'all'
    });
  }
  const numericCount = Number(count);
  const requestedCount = String(count).trim().toLowerCase() === 'all'
    ? pool.length
    : Number.isFinite(numericCount)
      ? Math.max(0, Math.floor(numericCount))
      : 1;
  const selectedTargets = pool.slice(0, requestedCount);
  if (traceSelection) {
    traceEventTargetSelection({
      label: traceLabel,
      request: {
        side,
        strategy,
        statKey,
        targetMode,
        tieBreakers,
        count,
        targetId,
        lifeState: normalizedLifeState,
        includeDead,
        levelId
      },
      plan: targetId == null ? pool[0]?.selectionPlan || resolveEventTargetPlan({
        targetMode,
        strategy,
        statKey,
        tieBreakers
      }) : null,
      rankedTargets: pool,
      selectedTargets,
      livingFirst: normalizedLifeState === 'all'
    });
  }
  return selectedTargets;
}

function requestedEventTargetCount(count, availableCount) {
  if (String(count).trim().toLowerCase() === 'all') return availableCount;
  const numericCount = Number(count);
  return Number.isFinite(numericCount)
    ? Math.max(0, Math.floor(numericCount))
    : 1;
}

function createEventTargetSequence(options, overrides = {}, traceLabel = 'event sequence') {
  const selectionPlan = options.targetId == null
    ? resolveEventTargetPlan(options)
    : null;
  const targets = targetEventEntity({
    ...options,
    ...overrides,
    count: 'all',
    selectionPlan,
    traceSelection: false
  });
  const limit = Math.min(requestedEventTargetCount(options.count ?? 1, targets.length), targets.length);
  const traceId = traceEventTargetSelection({
    label: traceLabel,
    request: {
      ...options,
      ...overrides,
      count: options.count ?? 1
    },
    plan: selectionPlan,
    rankedTargets: targets,
    selectedTargets: targets.slice(0, limit),
    livingFirst: (overrides.lifeState ?? options.lifeState) === 'all'
  });
  return {
    targets,
    limit,
    selectionPlan,
    traceId,
    traceLabel,
    processedSteps: 0
  };
}

function eventTargetResultData(target) {
  return {
    gender: eventEntityGender(target?.entity),
    selectionPlan: cloneValue(target?.selectionPlan || null),
    selectionReason: cloneValue(target?.selectionReason || null),
    targetAnnouncement: target?.announcement || null
  };
}

function withEventTargetAnnouncement(target, html) {
  const announcement = String(target?.announcement || '').trim();
  return announcement
    ? `<div class="event-target-announcement"><strong>${escapeEventHtml(announcement)}</strong></div><br>${html}`
    : html;
}

function eventTargetExists(target) {
  return getEventArmyEntities(target?.side).some((entity) => (
    String(entity?.id) === String(target?.entity?.id)
  ));
}

function nextEventSequenceTarget(sequence, processedTargets) {
  const remainingTargets = sequence.targets.filter((target) => (
    !processedTargets.has(eventTargetIdentity(target)) && eventTargetExists(target)
  ));
  const target = remainingTargets[0] || null;
  if (!target) return target;
  if (!sequence.selectionPlan) {
    traceSequentialEventTargetChoice(sequence, target, remainingTargets);
    sequence.processedSteps += 1;
    return target;
  }
  const reason = selectionReasonFor(
    target,
    remainingTargets,
    eventTargetCriteria(sequence.selectionPlan)
  );
  const resolvedTarget = {
    ...target,
    selectionReason: reason,
    announcement: reason?.announcement || null
  };
  traceSequentialEventTargetChoice(sequence, resolvedTarget, remainingTargets);
  sequence.processedSteps += 1;
  return resolvedTarget;
}

function resourceAmount(value) {
  if (value && typeof value === 'object') {
    return Number(value.current ?? value.value ?? value.amount ?? 0) || 0;
  }
  return Number(value) || 0;
}

function getResurrectionResources(entity) {
  const keys = ['fadedLife', 'extraLife', 'eternalLife'];
  return Object.fromEntries(keys.map((key) => [
    key,
    resourceAmount(entity?.stats?.[key] ?? entity?.[key])
  ]));
}

export function hasUsableResurrection(entity) {
  return Object.values(getResurrectionResources(entity)).some((amount) => amount > 0);
}

const EVENT_RESURRECTION_TYPES = Object.freeze([
  'fadedLife',
  'extraLife',
  'eternalLife'
]);

function eventStatDefinition(statKey) {
  const exactKey = String(statKey ?? '').trim();
  const rootKey = exactKey.split('.')[0];
  return stats.find((stat) => String(stat?.key) === exactKey)
    || stats.find((stat) => String(stat?.key) === rootKey)
    || null;
}

function eventStatDisplayName(statKey, fallbackName = statKey) {
  return String(eventStatDefinition(statKey)?.name || fallbackName || statKey || '')
    .trim();
}

export function eventTargetAnnouncement({
  strategy,
  statKey
} = {}) {
  const normalizedStrategy = String(strategy || '').trim().toLowerCase();
  if (!['loweststat', 'higheststat'].includes(normalizedStrategy)) return null;

  const normalizedStatKey = String(statKey || '').trim();
  const specialAnnouncements = {
    'HP.current': {
      loweststat: 'L’entité la plus affaiblie.',
      higheststat: 'L’entité possédant le plus de points de vie.'
    },
    level: {
      loweststat: 'L’entité la moins expérimentée.',
      higheststat: 'L’entité la plus expérimentée.'
    },
    'acquisition.order': {
      loweststat: 'L’entité présente depuis le plus longtemps dans l’équipe.',
      higheststat: 'L’entité arrivée le plus récemment dans l’équipe.'
    }
  };
  const specialAnnouncement = specialAnnouncements[normalizedStatKey]?.[normalizedStrategy];
  if (specialAnnouncement) return specialAnnouncement;

  const definition = eventStatDefinition(statKey);
  const adjective = String(definition?.adjectif || '').trim();
  const quantity = normalizedStrategy === 'loweststat' ? 'moins' : 'plus';

  if (adjective) return `L’entité la ${quantity} ${adjective}.`;

  const displayName = eventStatDisplayName(statKey).toLocaleLowerCase('fr-FR');
  return `L’entité avec le ${quantity} de ${displayName}.`;
}

function eventStatClassName(statKey) {
  return String(statKey || 'unknown-stat').replace(/[^a-zA-Z0-9_-]/g, '-');
}

export function eventStatHtml(statKey, fallbackName = statKey) {
  const definition = eventStatDefinition(statKey);
  const className = eventStatClassName(statKey);
  const displayName = definition?.name || fallbackName || statKey;
  return `<div class="picto-stat ${className}"></div> <span class="${className}">${escapeEventHtml(displayName)}</span>`;
}

function detectConsumedResurrection(before, after, { assumeUsed = false } = {}) {
  const types = EVENT_RESURRECTION_TYPES;
  const consumedType = types.find((type) => after[type] < before[type]);
  // Certaines protections de consommation permettent à la vie de fonctionner
  // sans diminuer son compteur. LifeandDeath respecte alors le même ordre de
  // priorité : fadedLife, extraLife, puis eternalLife.
  const inferredType = assumeUsed
    ? types.find((type) => before[type] > 0)
    : null;
  const type = consumedType || inferredType || null;
  return type
    ? { type, label: eventStatDefinition(type)?.name || type }
    : null;
}

async function applyFatalEventDamage(entity, { destroyArmor = false } = {}) {
  const beforeResources = getResurrectionResources(entity);
  const hpBefore = getEntityCurrentHp(entity);
  const armorLoss = destroyArmor
    ? destroyEventEntityArmor(entity)
    : { armorBefore: getEntityArmor(entity).current, armorAfter: getEntityArmor(entity).current, armorDamage: 0 };
  if (hpBefore > 0 || armorLoss.armorDamage > 0) {
    triggerEventDamageImpact(entity, armorLoss.armorDamage, hpBefore);
  }
  setEntityCurrentHp(entity, 0);
  persistEventEntityVitals(entity);
  if (hpBefore > 0 || armorLoss.armorDamage > 0) {
    showEventDamageNumbers(entity, hpBefore, armorLoss.armorDamage);
  }
  const hadDomResurrectionFlag = document
    .getElementById(`sbire_${entity.id}`)
    ?.classList.contains('resurrected') === true;
  await LifeandDeath(entity);
  const afterResources = getResurrectionResources(entity);
  const alive = isAliveEventEntity(entity);
  const resurrection = detectConsumedResurrection(beforeResources, afterResources, {
    assumeUsed: alive && !hadDomResurrectionFlag
  });
  persistEventEntityVitals(entity);
  return {
    hpBefore,
    hpAfter: getEntityCurrentHp(entity),
    damage: hpBefore,
    alive,
    died: !alive,
    resurrection: resurrection?.label || null,
    resurrectionType: resurrection?.type || null,
    ...armorLoss
  };
}

function eventResult(type, data, html, classes = []) {
  return {
    type,
    data: cloneValue(data),
    html: String(html),
    classes: Array.isArray(classes) ? [...classes] : []
  };
}

function fatalResultFor(target, fatal) {
  const { entity, side } = target;
  const name = eventEntityName(entity);
  const safeName = escapeEventHtml(name);
  if (fatal.resurrection) {
    const resurrectionStat = eventStatHtml(
      fatal.resurrectionType,
      fatal.resurrection
    );
    return eventResult('entityResurrected', {
      entityId: entity.id,
      name,
      side,
      ...eventTargetResultData(target),
      ...fatal
    }, withEventTargetAnnouncement(target, `Le corps s’effondre... mais, par miracle, une ${resurrectionStat} se consume. ${safeName} revient à la vie !<br><strong>${safeName} utilise une ${resurrectionStat}. L’entité possède désormais <span class="HP">${fatal.hpAfter} HP</span>.</strong>`));
  }
  return eventResult('entityKilled', {
    entityId: entity.id,
    name,
    side,
    ...eventTargetResultData(target),
    ...fatal
  }, withEventTargetAnnouncement(target, `${safeName} prend le coup de plein fouet et s’effondre sans un bruit.<br><br><strong>${safeName} ${eventMalusHtml('décède')} sur le coup.</strong>`));
}

function pluralizeEventAdjective(adjective) {
  const words = String(adjective || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  if (!/[sxz]$/i.test(words[0])) words[0] += 's';
  return words.join(' ');
}

function multiTargetDescription(records) {
  const plan = records.find((record) => record?.selectionPlan)?.selectionPlan;
  if (!plan) return null;

  const strategy = String(plan.strategy || 'first').trim().toLowerCase();
  if (strategy === 'random') return 'des entités au hasard';
  if (['lastacquisition', 'newest'].includes(strategy)) {
    return 'les entités arrivées le plus récemment dans l’équipe';
  }
  if (['firstacquisition', 'oldest'].includes(strategy)) {
    return 'les entités présentes depuis le plus longtemps dans l’équipe';
  }
  if (strategy === 'first') return 'les premières entités disponibles';
  if (!['loweststat', 'higheststat'].includes(strategy)) return null;

  const statKey = String(plan.statKey || '').trim();
  const highest = strategy === 'higheststat';
  const specialDescriptions = {
    'HP.current': highest
      ? 'les entités possédant le plus de points de vie'
      : 'les entités les plus affaiblies',
    level: highest
      ? 'les entités les plus expérimentées'
      : 'les entités les moins expérimentées',
    'acquisition.order': highest
      ? 'les entités arrivées le plus récemment dans l’équipe'
      : 'les entités présentes depuis le plus longtemps dans l’équipe'
  };
  if (specialDescriptions[statKey]) return specialDescriptions[statKey];

  const definition = eventStatDefinition(statKey);
  const adjective = pluralizeEventAdjective(definition?.adjectif);
  const quantity = highest ? 'plus' : 'moins';
  if (adjective) return `les entités les ${quantity} ${adjective}`;

  const displayName = eventStatDisplayName(statKey).toLocaleLowerCase('fr-FR');
  return `les entités avec le ${quantity} de ${displayName}`;
}

function multiTargetOpening(records, actionSentence) {
  const description = multiTargetDescription(records);
  if (description) {
    return `La créature semble avoir ciblé ${description} ! ${actionSentence}`;
  }
  const names = records.map((record) => record.name);
  return `La créature cible ${formatEventEntityNameList(names)} ! ${actionSentence}`;
}

function groupedNumericSentence(records, valueKey, equalSentence, individualSentence) {
  if (records.length === 0) return null;
  const values = records.map((record) => Number(record?.[valueKey]) || 0);
  if (values.every((value) => value === values[0])) {
    return equalSentence(
      formatEventEntityNameList(records.map((record) => record.name)),
      values[0],
      records
    );
  }
  return records.map((record, index) => individualSentence(
    escapeEventHtml(record.name),
    values[index],
    record
  )).join('<br>');
}

function groupedResurrectionSentences(records) {
  const groups = new Map();
  records.filter((record) => record?.resurrectionType).forEach((record) => {
    const key = record.resurrectionType;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  });
  return [...groups.entries()].map(([type, group]) => {
    const names = formatEventEntityNameList(group.map((record) => record.name));
    const verb = group.length > 1 ? 'utilisent' : 'utilise';
    return `Par miracle, ${names} ${verb} une ${eventStatHtml(type, group[0].resurrection)}.`;
  });
}

function groupedArmorSentences(records, mode) {
  const armored = records.filter((record) => Number(record?.armorDamage) > 0);
  if (armored.length === 0) return [];
  if (mode === 'destroyed') {
    const names = formatEventEntityNameList(armored.map((record) => record.name));
    return [armored.length > 1
      ? `Les armures de ${names} sont détruites.`
      : `L’armure de ${names} est détruite.`];
  }
  return armored.map((record) => (
    `L’armure de l’entité ${escapeEventHtml(record.name)} absorbe ${record.armorDamage} dégâts.`
  ));
}

function multiTargetEventResult(
  type,
  records,
  htmlParts,
  classes,
  extraData = {},
  separator = '<br><br>'
) {
  const names = records.map((record) => record.name);
  return eventResult(type, {
    count: records.length,
    entityIds: records.map((record) => record.entityId),
    names,
    outcomes: records,
    ...extraData
  }, htmlParts.filter(Boolean).join(separator), classes);
}

function aggregateDamagedEntityResults(results) {
  if (results.length <= 1) return results;
  const damages = results.map((result) => cloneValue(result.data));
  const hitSentence = groupedNumericSentence(
    damages,
    'rawDamage',
    (names, damage, records) => `${names} ${eventMalusHtml(eventGroupGendered(records, 'sont touchés', 'sont touchées'))} pour <span class="event-damages">${damage} dégâts</span> ${eventGroupGendered(records, 'chacun', 'chacune')}.`,
    (name, damage) => `${name} ${eventMalusHtml('subit')} <span class="event-damages">${damage} dégâts</span>.`
  );
  const deathRecords = damages.filter((damage) => damage.died || damage.resurrectionType);
  const bodySentence = deathRecords.length > 0
    ? `${deathRecords.length > 1 ? 'Les corps' : 'Le corps'} de ${formatEventEntityNameList(deathRecords.map((damage) => damage.name))} ${deathRecords.length > 1 ? 's’effondrent' : 's’effondre'}.`
    : null;
  const statuses = damages.map((damage) => damage.alive
    ? `${escapeEventHtml(damage.name)} est en vie avec <span class="HP">${damage.hpAfter} HP</span>.`
    : `${escapeEventHtml(damage.name)} est ${eventGendered(damage, 'mort', 'morte')}.`).join('<br>');
  return [multiTargetEventResult('entitiesDamaged', damages, [
    `<strong>${multiTargetOpening(damages, 'Et elle les touche !')}</strong>`,
    hitSentence,
    ...groupedArmorSentences(damages, 'absorbed'),
    bodySentence,
    ...groupedResurrectionSentences(damages),
    statuses
  ], [
    'event-result-entities-damaged',
    'damage'
  ], { damages })];
}

function aggregateKilledEntityResults(results) {
  if (results.length <= 1) return results;
  const outcomes = results.map((result) => ({
    type: result.type,
    ...cloneValue(result.data)
  }));
  const allKilled = results.every((result) => result.type === 'entityKilled');
  const fatalOutcomes = outcomes.filter((outcome) => (
    outcome.type === 'entityKilled' || outcome.type === 'entityResurrected'
  ));
  const fatalSentence = groupedNumericSentence(
    fatalOutcomes,
    'damage',
    (names, damage, records) => `${names} ${eventMalusHtml(`${eventGroupGendered(records, 'sont frappés', 'sont frappées')} mortellement`)} pour <span class="event-damages">${damage} dégâts</span> ${eventGroupGendered(records, 'chacun', 'chacune')}.`,
    (name, damage, record) => `${name} est ${eventMalusHtml(`${eventGendered(record, 'frappé', 'frappée')} mortellement`)} pour <span class="event-damages">${damage} dégâts</span>.`
  );
  const bodySentence = fatalOutcomes.length > 0
    ? `${fatalOutcomes.length > 1 ? 'Les corps' : 'Le corps'} de ${formatEventEntityNameList(fatalOutcomes.map((outcome) => outcome.name))} ${fatalOutcomes.length > 1 ? 's’effondrent' : 's’effondre'}.`
    : null;
  const protectedOutcomes = outcomes.filter((outcome) => outcome.type === 'lastSurvivorEscapesDeath');
  const protectedSentence = protectedOutcomes.length > 0
    ? `${formatEventEntityNameList(protectedOutcomes.map((outcome) => outcome.name))} ${protectedOutcomes.length > 1 ? 'échappent' : 'échappe'} au coup mortel et ${protectedOutcomes.length > 1 ? 'conservent 10 % de leurs' : 'conserve 10 % de ses'} HP actuels.`
    : null;
  const statuses = outcomes.map((outcome) => {
    const safeName = escapeEventHtml(outcome.name);
    if (outcome.type === 'entityKilled') {
      return `${safeName} est ${eventGendered(outcome, 'mort', 'morte')}.`;
    }
    return `${safeName} est en vie avec <span class="HP">${outcome.hpAfter} HP</span>.`;
  }).join('<br>');
  return [multiTargetEventResult(
    allKilled ? 'entitiesKilled' : 'multipleKillOutcomes',
    outcomes,
    [
      `<strong>${multiTargetOpening(outcomes, 'Et elle les touche !')}</strong>`,
      fatalSentence,
      protectedSentence,
      ...groupedArmorSentences(outcomes, 'destroyed'),
      bodySentence,
      ...groupedResurrectionSentences(outcomes),
      statuses
    ], [
    'event-result-multiple-kills',
    'kill'
    ]
  )];
}

function syncEventMaterialChanges() {
  const saved = saveCurrentGameData();
  window.dispatchEvent(new CustomEvent('eventMaterialChangesApplied'));
  return saved;
}

export async function eventEntitydamages(options = {}) {
  const percent = Number(options.percent);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new RangeError('eventEntitydamages attend un pourcentage compris entre 0 et 100.');
  }
  const targets = targetEventEntity({
    ...options,
    lifeState: 'alive',
    includeDead: false,
    traceLabel: 'eventEntitydamages'
  });
  const results = [];

  for (const target of targets) {
    const { entity, side } = target;
    const hpBefore = getEntityCurrentHp(entity);
    const projectedHpWithoutArmor = percent === 100
      ? 0
      : Math.max(1, Math.ceil(hpBefore * (1 - percent / 100)));
    const rawDamage = Math.max(0, hpBefore - projectedHpWithoutArmor);
    const armorBefore = getEntityArmor(entity);
    const armorDamage = Math.min(rawDamage, armorBefore.current);
    const hpDamage = Math.max(0, rawDamage - armorDamage);
    const hpAfterDamage = Math.max(0, hpBefore - hpDamage);
    const resurrectionBefore = getResurrectionResources(entity);
    const hadDomResurrectionFlag = document
      .getElementById(`sbire_${entity.id}`)
      ?.classList.contains('resurrected') === true;

    triggerEventDamageImpact(entity, armorDamage, rawDamage);
    if (armorBefore.record) {
      armorBefore.record.current = Math.max(0, armorBefore.current - armorDamage);
    }
    setEntityCurrentHp(entity, hpAfterDamage);
    persistEventEntityVitals(entity);
    showEventDamageNumbers(entity, hpDamage, armorDamage);

    if (hpAfterDamage <= 0) await LifeandDeath(entity);

    const hpAfter = getEntityCurrentHp(entity);
    const armorAfter = getEntityArmor(entity).current;
    const alive = isAliveEventEntity(entity);
    const resurrection = detectConsumedResurrection(
      resurrectionBefore,
      getResurrectionResources(entity),
      { assumeUsed: hpAfterDamage <= 0 && alive && !hadDomResurrectionFlag }
    );
    persistEventEntityVitals(entity);

    const name = eventEntityName(entity);
    const safeName = escapeEventHtml(name);
    const armorSentence = armorDamage > 0
      ? ` Son <span class="picto-stat armor" data-typewriter-atomic="true"></span><span class="armor">armure</span> encaisse ${armorDamage} dégâts.<br>`
      : '<br>';
    const hpSentence = hpDamage > 0
      ? `${safeName} perd ${hpDamage} HP. `
      : `${safeName} ne perd aucun HP. `;
    const survivalSentence = resurrection
      ? `${safeName} utilise une ${eventStatHtml(resurrection.type, resurrection.label)} pour échapper à la mort.<br>`
      : alive
        ? ''
        : `${safeName} décède sur le coup.<br>`;
    results.push(eventResult('entityDamaged', {
      entityId: entity.id,
      name,
      side,
      ...eventTargetResultData(target),
      percent,
      hpBefore,
      hpAfter,
      rawDamage,
      hpDamage,
      armorBefore: armorBefore.current,
      armorAfter,
      armorDamage,
      alive,
      died: !alive,
      resurrection: resurrection?.label || null,
      resurrectionType: resurrection?.type || null
    }, `<div class="event-result-item-text">${safeName} ${eventMalusHtml('subit')} <span class="event-damages">${rawDamage} dégâts</span>.${armorSentence}${hpSentence}${survivalSentence}L’entité possède désormais <span class="HP">${hpAfter} HP</span>.</div>`, [
      'event-result-entity-damage',
      'damage'
    ]));
  }

  syncEventMaterialChanges();
  return { eventResults: aggregateDamagedEntityResults(results) };
}


const EVENT_ENTITY_ATTACK_DEFAULT_ANIMATION_DURATION = 650;
const EVENT_ENTITY_ATTACK_PROJECTILE_TIMEOUT_GRACE = 800;

function normalizeEventAttackCssClass(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '-');
}

function eventAttackRangeKind(attack) {
  const ranges = Array.isArray(attack?.attackRange)
    ? attack.attackRange
    : attack?.attackRange == null
      ? []
      : [attack.attackRange];

  const normalized = ranges.map((range) => String(range || '').trim().toLowerCase());
  if (normalized.some((range) => ['range', 'ranged', 'distance'].includes(range))) return 'range';
  if (normalized.some((range) => ['melee', 'cac', 'close'].includes(range))) return 'melee';
  return null;
}

function findEventAttackDefinition(candidate) {
  if (!candidate) return null;

  if (typeof candidate === 'function') {
    return findEventAttackDefinition(candidate.name);
  }

  if (
    typeof candidate === 'object'
    && (
      candidate.attackId
      || candidate.functionName
      || candidate.displayName
      || candidate.attackRange
    )
  ) {
    const exact = attackDetails.find((attack) => (
      (candidate.attackId && String(attack.attackId) === String(candidate.attackId))
      || (
        candidate.functionName
        && String(attack.functionName) === String(candidate.functionName)
      )
    ));
    return exact || candidate;
  }

  const key = String(candidate || '').trim().toLowerCase();
  if (!key) return null;

  return attackDetails.find((attack) => (
    String(attack?.attackId || '').toLowerCase() === key
    || String(attack?.functionName || '').toLowerCase() === key
    || String(attack?.displayName || '').toLowerCase() === key
  )) || null;
}

function eventAttackDefinitionIdentity(attack) {
  return String(
    attack?.attackId
    || attack?.functionName
    || attack?.displayName
    || ''
  ).trim().toLowerCase();
}

function collectEventEntityOwnedAttackCandidates(attacker) {
  const candidates = [];

  const add = (value) => {
    if (value == null) return;
    if (Array.isArray(value)) {
      value.forEach(add);
      return;
    }
    if (
      typeof value === 'object'
      && !value.attackId
      && !value.functionName
      && !value.displayName
      && !value.attackRange
    ) {
      Object.values(value).forEach(add);
      return;
    }
    candidates.push(value);
  };

  // Propriétés décrivant les attaques réellement possédées par l'entité.
  // currentAttack / activeAttack sont volontairement exclus : ce sont des
  // états runtime et ils ne doivent jamais servir à choisir arbitrairement
  // une attaque lorsqu'une entité en possède plusieurs.
  [
    attacker?.attacks,
    attacker?.attackList,
    attacker?.attackFunctions,
    attacker?.availableAttacks,
    attacker?.skills,
    attacker?.abilities,
    attacker?.spells,
    attacker?.attack,
    attacker?.attackDefinition,
    attacker?.attackId,
    attacker?.attackID,
    attacker?.attackFunction,
    attacker?.attackFunctionName,
    attacker?.attackName
  ].forEach(add);

  return candidates;
}

function collectEventEntityOwnedAttacks(attacker) {
  const resolved = [];
  const seen = new Set();

  for (const candidate of collectEventEntityOwnedAttackCandidates(attacker)) {
    const attack = findEventAttackDefinition(candidate);
    if (!attack) continue;

    const identity = eventAttackDefinitionIdentity(attack);
    if (!identity || seen.has(identity)) continue;

    seen.add(identity);
    resolved.push(attack);
  }

  return resolved;
}

function resolveEventEntityAttackDefinition(attacker, options = {}) {
  const ownedAttacks = collectEventEntityOwnedAttacks(attacker);
  const explicitCandidate = options.attack
    ?? options.attackId
    ?? options.attackFunction
    ?? options.functionName
    ?? null;

  if (explicitCandidate != null) {
    const explicitAttack = findEventAttackDefinition(explicitCandidate);
    if (!explicitAttack) {
      throw new Error(
        `[Events] eventEntityAttack : attaque explicite inconnue (${String(explicitCandidate)}).`
      );
    }

    if (ownedAttacks.length === 0) {
      throw new Error(
        `[Events] eventEntityAttack ne peut pas vérifier que `
        + `${eventEntityName(attacker)} possède l’attaque `
        + `${explicitAttack.displayName || explicitAttack.functionName || explicitAttack.attackId}.`
      );
    }

    const explicitIdentity = eventAttackDefinitionIdentity(explicitAttack);
    const ownedAttack = ownedAttacks.find((attack) => (
      eventAttackDefinitionIdentity(attack) === explicitIdentity
      || String(attack?.attackId || '') === String(explicitAttack?.attackId || '')
      || String(attack?.functionName || '') === String(explicitAttack?.functionName || '')
    ));

    if (!ownedAttack) {
      throw new Error(
        `[Events] eventEntityAttack : ${eventEntityName(attacker)} ne possède pas `
        + `${explicitAttack.displayName || explicitAttack.functionName || explicitAttack.attackId}.`
      );
    }

    return ownedAttack;
  }

  if (ownedAttacks.length === 1) {
    return ownedAttacks[0];
  }

  if (ownedAttacks.length > 1) {
    const choices = ownedAttacks
      .map((attack) => attack.functionName || attack.attackId || attack.displayName)
      .filter(Boolean)
      .join(', ');

    throw new Error(
      `[Events] eventEntityAttack : ${eventEntityName(attacker)} possède plusieurs attaques `
      + `(${choices}). Précise attackId ou attackFunction.`
    );
  }

  throw new Error(
    `[Events] eventEntityAttack ne détecte aucune attaque possédée par `
    + `${eventEntityName(attacker)}.`
  );
}

function eventAttackProjectileVisualClasses(attack) {
  const classes = new Set();
  const attackId = normalizeEventAttackCssClass(attack?.attackId);
  const functionName = normalizeEventAttackCssClass(attack?.functionName);

  if (attackId) classes.add(`event-attack-${attackId}`);
  if (functionName) classes.add(`event-attack-${functionName}`);

  const configuredEffects = Array.isArray(attack?.effets)
    ? attack.effets
    : attack?.effets == null
      ? []
      : [attack.effets];

  for (const effectName of configuredEffects) {
    const normalized = String(effectName || '').trim().toLowerCase();
    if (!normalized || normalized === 'none') continue;

    const effect = attackEffects.find((candidate) => (
      String(candidate?.effectName || '').trim().toLowerCase() === normalized
      || String(candidate?.effectId || '').trim().toLowerCase() === normalized
    ));

    const projectileClass = normalizeEventAttackCssClass(effect?.effectProjectile);
    const effectClass = normalizeEventAttackCssClass(effect?.effectName || effectName);

    if (projectileClass && projectileClass !== 'none') classes.add(projectileClass);
    if (effectClass && effectClass !== 'none') classes.add(`event-effect-${effectClass}`);
  }

  return [...classes];
}

function eventEntityAttackDomElement(entity) {
  if (!entity?.id || typeof document === 'undefined') return null;
  const prefix = entity.type === 'lord' ? 'lord' : 'sbire';
  return document.getElementById(`${prefix}_${entity.id}`);
}

function applyEventProjectileVisualMetadata(attacker, token, attack) {
  if (typeof document === 'undefined') return;

  const projectile = Array.isArray(attacker?.projectiles)
    ? attacker.projectiles.find((candidate) => candidate?.eventEntityAttackToken === token)
    : null;
  if (!projectile?.id) return;

  const parent = document.getElementById(projectile.id);
  if (!parent) return;

  const child = parent.querySelector('.projectile');
  const classes = eventAttackProjectileVisualClasses(attack);

  parent.classList.add('event-entity-attack-projectile');
  child?.classList.add('event-entity-attack-projectile');

  for (const className of classes) {
    parent.classList.add(className);
    child?.classList.add(className);
  }

  if (attack?.attackAsset) {
    parent.dataset.attackAsset = String(attack.attackAsset);
    if (child) child.dataset.attackAsset = String(attack.attackAsset);
  }
}

async function runEventRangeAttackVisual({
  attacker,
  target,
  attack,
  duration,
  applyDamage
}) {
  if (!eventEntityAttackDomElement(attacker) || !eventEntityAttackDomElement(target)) {
    console.warn('[Events] eventEntityAttack : DOM projectile indisponible ; dégâts sans animation.');
    return applyDamage();
  }

  const token = `eventEntityAttack:${attacker.id}:${target.id}:${Date.now()}:${Math.random()}`;
  let settled = false;
  let timeoutId = null;

  return new Promise((resolve, reject) => {
    const finish = async () => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      try {
        resolve(await applyDamage());
      } catch (error) {
        reject(error);
      }
    };

    timeoutId = setTimeout(
      () => void finish(),
      duration + EVENT_ENTITY_ATTACK_PROJECTILE_TIMEOUT_GRACE
    );

    void animationProjectile(
      attacker,
      target,
      async () => {
        await finish();
        return 'hit';
      },
      {
        eventEntityAttackToken: token,
        attackId: attack?.attackId ?? null,
        damage: 0,
        status: 'in-flight',
        cosmeticOnly: true
      }
    );

    applyEventProjectileVisualMetadata(attacker, token, attack);
  });
}

async function runEventMeleeAttackVisual({
  attacker,
  target,
  duration,
  applyDamage
}) {
  if (!eventEntityAttackDomElement(attacker) || !eventEntityAttackDomElement(target)) {
    console.warn('[Events] eventEntityAttack : DOM mêlée indisponible ; dégâts sans animation.');
    return applyDamage();
  }

  const controller = animationMelee(attacker, target, false, { duration });
  controller?.resolveImpact?.(true);

  await new Promise((resolve) => setTimeout(resolve, duration));
  return applyDamage();
}

/**
 * Animation cosmétique d'une attaque d'entité suivie des dégâts d'événement.
 *
 * AUCUNE fonction d'attaque normale n'est appelée :
 * - pas de préparation / récupération / cooldown ;
 * - pas de précision, esquive, ambidextrie ;
 * - pas d'effet, DoT, poison, brûlure, soin, etc. ;
 * - pas de dégâts ou ratios natifs de l'attaque.
 *
 * L'attaque visuelle touche toujours. Les seuls dégâts réellement appliqués
 * sont ceux demandés via `percent`, par eventEntitydamages().
 *
 * Victime : mêmes options que eventEntitydamages()
 * (`side`, `targetId`, `strategy`, `statKey`, `count`, ...).
 *
 * Attaquant :
 * `attackerSide`, `attackerId`, `attackerStrategy`,
 * `attackerStatKey`, `attackerTargetMode`, `attackerTieBreakers`.
 *
 * Attaque :
 * résolue depuis l'entité, ou forcée avec `attackId` / `attackFunction`.
 * `executionTime` règle la durée de l'animation en millisecondes.
 */
export async function eventEntityAttack(options = {}) {
  const percent = Number(options.percent);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new RangeError(
      'eventEntityAttack attend un pourcentage de dégâts compris entre 0 et 100.'
    );
  }

  const victimSide = String(options.side || 'A').trim().toUpperCase();
  if (!['A', 'B'].includes(victimSide)) {
    throw new TypeError(`eventEntityAttack : camp cible invalide (${options.side}).`);
  }

  const attackerSide = String(
    options.attackerSide || (victimSide === 'A' ? 'B' : 'A')
  ).trim().toUpperCase();
  if (!['A', 'B'].includes(attackerSide)) {
    throw new TypeError(
      `eventEntityAttack : camp attaquant invalide (${options.attackerSide}).`
    );
  }

  const attackerTarget = targetEventEntity({
    side: attackerSide,
    targetId: options.attackerId ?? null,
    strategy: options.attackerStrategy || 'first',
    statKey: options.attackerStatKey ?? null,
    targetMode: options.attackerTargetMode ?? null,
    tieBreakers: options.attackerTieBreakers ?? null,
    count: 1,
    lifeState: 'alive',
    includeDead: false,
    levelId: options.levelId,
    traceLabel: 'eventEntityAttack:attacker'
  })[0];

  const attacker = attackerTarget?.entity;
  if (!attacker) {
    throw new Error(
      `[Events] eventEntityAttack : aucune entité vivante trouvée dans le camp ${attackerSide}.`
    );
  }

  const victims = targetEventEntity({
    ...options,
    side: victimSide,
    lifeState: 'alive',
    includeDead: false,
    traceLabel: 'eventEntityAttack:target'
  });

  if (victims.length === 0) return { eventResults: [] };

  const attack = resolveEventEntityAttackDefinition(attacker, options);
  const rangeKind = eventAttackRangeKind(attack);

  if (!rangeKind) {
    throw new Error(
      `[Events] eventEntityAttack : portée inconnue pour `
      + `${attack?.displayName || attack?.attackId || 'attaque'}.`
    );
  }

  const configuredDuration = Number(
    options.executionTime
    ?? options.animationDuration
    ?? options.duration
    ?? EVENT_ENTITY_ATTACK_DEFAULT_ANIMATION_DURATION
  );
  const animationDuration = Number.isFinite(configuredDuration)
    ? Math.max(120, Math.min(10000, configuredDuration))
    : EVENT_ENTITY_ATTACK_DEFAULT_ANIMATION_DURATION;

  const previousRuntimeAttack = attacker.currentAttack;
  const previousExecutionTime = attacker.executionTime;
  const previousCurrentPhase = attacker.currentPhase;

  const visualAttack = {
    ...attack,
    preparationTime: 0,
    executionTime: animationDuration,
    recoveryTime: 0,
    cooldown: 0,
    effets: ['none'],
    selfEffects: [],
    eventCosmeticOnly: true
  };

  const eventResults = [];

  try {
    attacker.currentAttack = visualAttack;
    attacker.executionTime = animationDuration;
    attacker.currentPhase = 'event_attack_visual';

    for (const victimTarget of victims) {
      const target = victimTarget?.entity;
      if (!target || !isAliveEventEntity(target)) continue;

      if (
        String(attackerTarget?.side || attacker.side || '') === String(victimTarget?.side || target.side || '')
        && String(attacker.id) === String(target.id)
      ) {
        console.warn('[Events] eventEntityAttack ignore une auto-cible attaquant/cible identique.');
        continue;
      }

      let damagePromise = null;
      const applyDamageOnce = () => {
        if (!damagePromise) {
          damagePromise = eventEntitydamages({
            ...options,
            side: victimTarget.side || victimSide,
            targetId: target.id,
            count: 1,
            percent,
            lifeState: 'alive',
            includeDead: false,
            traceSelection: false,
            traceLabel: 'eventEntityAttack:damage'
          });
        }
        return damagePromise;
      };

      const damageOutput = rangeKind === 'range'
        ? await runEventRangeAttackVisual({
          attacker,
          target,
          attack,
          duration: animationDuration,
          applyDamage: applyDamageOnce
        })
        : await runEventMeleeAttackVisual({
          attacker,
          target,
          duration: animationDuration,
          applyDamage: applyDamageOnce
        });

      if (Array.isArray(damageOutput?.eventResults)) {
        eventResults.push(...damageOutput.eventResults);
      }
    }
  } finally {
    attacker.currentAttack = previousRuntimeAttack;
    attacker.executionTime = previousExecutionTime;
    attacker.currentPhase = previousCurrentPhase;
  }

  return { eventResults };
}

export async function killEventEntity(options = {}) {
  const sequence = createEventTargetSequence(options, {
    lifeState: 'alive',
    includeDead: false
  }, 'killEventEntity');
  const results = [];
  const processedTargets = new Set();
  const safeMode = options.safeMode === true;
  const protectedSide = String(options.protectedSide || 'A').toUpperCase();

  for (let step = 0; step < sequence.limit; step += 1) {
    const target = nextEventSequenceTarget(sequence, processedTargets);
    if (!target) break;
    processedTargets.add(eventTargetIdentity(target));
    const { entity, side } = target;
    const livingCount = getEventArmyEntities(side).filter(isAliveEventEntity).length;
    const isProtectedLastLiving = safeMode
      && side === protectedSide
      && livingCount <= 1;

    if (isProtectedLastLiving) {
      traceEventTargetOverride(
        sequence,
        target,
        hasUsableResurrection(entity)
          ? 'Safe Mode : dernière entité vivante, mais une résurrection permet de résoudre le kill normalement.'
          : 'Safe Mode : dernière entité vivante sans résurrection ; le kill devient une blessure laissant 10 % des HP.',
        { protection: hasUsableResurrection(entity) ? 'resurrection' : 'tenPercentHp' }
      );
    }

    if (!isProtectedLastLiving || hasUsableResurrection(entity)) {
      results.push(fatalResultFor(
        target,
        await applyFatalEventDamage(entity, {
          destroyArmor: isProtectedLastLiving
        })
      ));
      continue;
    }

    const hpBefore = getEntityCurrentHp(entity);
    const hpAfter = Math.max(1, Math.ceil(hpBefore * 0.10));
    const damage = Math.max(0, hpBefore - hpAfter);
    const armorLoss = destroyEventEntityArmor(entity);
    if (damage > 0 || armorLoss.armorDamage > 0) {
      triggerEventDamageImpact(entity, armorLoss.armorDamage, damage);
    }
    setEntityCurrentHp(entity, hpAfter);
    persistEventEntityVitals(entity);
    if (damage > 0 || armorLoss.armorDamage > 0) {
      showEventDamageNumbers(entity, damage, armorLoss.armorDamage);
    }
    const name = eventEntityName(entity);
    const safeName = escapeEventHtml(name);
    const armorSentence = armorLoss.armorDamage > 0
      ? `<br>L’<span class="picto-stat armor" data-typewriter-atomic="true"></span><span class="armor">armure</span> de ${safeName} vole en éclats et perd ${armorLoss.armorDamage} points.`
      : '';
    results.push(eventResult('lastSurvivorEscapesDeath', {
      entityId: entity.id,
      name,
      side,
      safeMode: true,
      ...eventTargetResultData(target),
      hpBefore,
      hpAfter,
      damage,
      ...armorLoss
    }, withEventTargetAnnouncement(target, `${safeName} aurait dû mourir sur le coup. Mais, dans un élan héroïque, ${safeName} parvient, sans trop comprendre comment, à préserver sa vie au prix d’une profonde blessure.${armorSentence}<br><br><strong>${safeName} ${eventMalusHtml('subit')} <span class="event-damages">${damage} dégâts</span>. L’entité conserve 10 % de ses HP actuels et possède désormais <span class="HP">${hpAfter} HP</span>.</strong>`)));
  }

  syncEventMaterialChanges();
  return { eventResults: aggregateKilledEntityResults(results) };
}

function removeMatchingEntities(container, entity) {
  const list = getArmyEntityList(container, false);
  if (!list) return 0;
  let removed = 0;
  for (let index = list.length - 1; index >= 0; index -= 1) {
    if (String(list[index]?.id) !== String(entity?.id)) continue;
    list.splice(index, 1);
    removed += 1;
  }
  return removed;
}

function removeEventEntityEverywhere(entity, side) {
  for (let index = entites.length - 1; index >= 0; index -= 1) {
    if (String(entites[index]?.id) === String(entity?.id)) entites.splice(index, 1);
  }

  if (side === 'A') {
    removeMatchingEntities(window.selectedArmyA, entity);

    const storedArmyA = loadFromLocalStorage('selectedArmyA', []);
    removeMatchingEntities(storedArmyA, entity);
    if (Array.isArray(storedArmyA)) {
      for (let index = storedArmyA.length - 1; index >= 0; index -= 1) {
        if (String(storedArmyA[index]?.id) === String(entity?.id)) storedArmyA.splice(index, 1);
      }
    }
    saveToLocalStorage('selectedArmyA', storedArmyA);
  } else if (side === 'B') {
    removeMatchingEntities(window.selectedArmyB, entity);

    const armyBData = loadFromLocalStorage('ArmyB', { armies: {} });
    Object.values(armyBData?.armies || {}).forEach((army) => removeMatchingEntities(army, entity));
    saveToLocalStorage('ArmyB', armyBData);
  }

  /*
   * side === 'neutral' :
   * l'entité est retirée du registre runtime `entites` et du DOM uniquement.
   * Elle ne doit surtout pas être supprimée d'ArmyA ou ArmyB.
   */

  const battleElement = document.getElementById(`Box_Entite_${entity.id}`)
    || document.getElementById(`imgContainer_${entity.id}`);
  if (battleElement) {
    const vacatedHex = battleElement.closest?.('.hex') || null;
    removeBattleElementFromDOM(battleElement);
    restoreVacatedHexSocleOpacity(vacatedHex);
  }
}


function normalizeDestroyedCorpseStageId(levelId = activeLevelId || getCurrentLevel()) {
  const explicit = levelId == null ? '' : String(levelId);
  if (explicit) return explicit;

  const runtimeStageId = typeof window !== 'undefined'
    ? window.currentStageId
    : null;

  return String(
    runtimeStageId
      ?? localStorage.getItem('currentStageId')
      ?? ''
  );
}

function readPersistentCorpseLootStorage() {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(PERSISTENT_CORPSE_LOOT_STORAGE_KEY) || '{}'
    );

    return {
      version: Number(parsed?.version) || 2,
      corpses: Array.isArray(parsed?.corpses) ? parsed.corpses : []
    };
  } catch (error) {
    console.warn('[Events] Stockage des cadavres persistants illisible.', error);
    return {
      version: 2,
      corpses: []
    };
  }
}

function writePersistentCorpseLootStorage(storage) {
  try {
    localStorage.setItem(
      PERSISTENT_CORPSE_LOOT_STORAGE_KEY,
      JSON.stringify({
        version: Number(storage?.version) || 2,
        corpses: Array.isArray(storage?.corpses) ? storage.corpses : []
      })
    );
    return true;
  } catch (error) {
    console.error('[Events] Impossible de sauvegarder les cadavres persistants.', error);
    return false;
  }
}

function persistentCorpseSourceEntityId(source) {
  return source?.metadata?.sourceEntityId
    ?? source?.sourceEntityId
    ?? null;
}

function persistentCorpseSourceStageId(source) {
  return String(
    source?.stageId
      ?? source?.level
      ?? ''
  );
}

function resolveDestroyCorpseRequestedEntityId(requestedId, stageId) {
  const normalizedRequestedId = String(requestedId ?? '').trim();
  if (!normalizedRequestedId) return null;

  const storage = readPersistentCorpseLootStorage();
  const source = storage.corpses.find((corpse) => (
    String(corpse?.id ?? '') === normalizedRequestedId
    && (
      !stageId
      || !persistentCorpseSourceStageId(corpse)
      || persistentCorpseSourceStageId(corpse) === String(stageId)
    )
  ));

  return String(
    persistentCorpseSourceEntityId(source)
      ?? normalizedRequestedId
  );
}

function normalizeDestroyCorpseRequestedIds(options, stageId) {
  const rawIds = [];

  const singleId = options?.id
    ?? options?.targetId
    ?? options?.corpseId
    ?? null;

  if (singleId != null && String(singleId).trim()) {
    rawIds.push(singleId);
  }

  const multipleIds = options?.ids
    ?? options?.targetIds
    ?? options?.corpseIds
    ?? null;

  if (Array.isArray(multipleIds)) {
    rawIds.push(...multipleIds);
  }

  const normalizedIds = rawIds
    .map((requestedId) => resolveDestroyCorpseRequestedEntityId(
      requestedId,
      stageId
    ))
    .filter(Boolean);

  return [...new Set(normalizedIds)];
}

function readDestroyedCorpseMarkerStorage() {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(DESTROYED_CORPSE_STORAGE_KEY) || '{}'
    );

    return {
      version: 1,
      markers: Array.isArray(parsed?.markers) ? parsed.markers : []
    };
  } catch (error) {
    console.warn('[Events] Stockage des marqueurs de cadavres détruits illisible.', error);
    return {
      version: 1,
      markers: []
    };
  }
}

function writeDestroyedCorpseMarkerStorage(storage) {
  try {
    localStorage.setItem(
      DESTROYED_CORPSE_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        markers: Array.isArray(storage?.markers) ? storage.markers : []
      })
    );
    return true;
  } catch (error) {
    console.error('[Events] Sauvegarde des marqueurs de cadavres détruits impossible.', error);
    return false;
  }
}

function destroyedCorpseDomToken(value) {
  return String(value ?? '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'unknown';
}

function destroyedCorpseMarkerId(stageId, entityId) {
  return `destroyedCorpse_${destroyedCorpseDomToken(stageId)}_${destroyedCorpseDomToken(entityId)}`;
}

function resolveDestroyedCorpseHex({
  hex = null,
  hexId = null,
  hexPosition = null
} = {}) {
  if (hex?.matches?.('.hex')) return hex;

  if (hexId) {
    const byId = document.getElementById(String(hexId));
    if (byId?.matches?.('.hex')) return byId;
  }

  const grid = document.getElementById('hexGrid')
    || document.querySelector('.hex-grid');

  if (!grid || hexPosition == null || hexPosition === '') return null;

  return eventHexElementByPosition(grid, hexPosition);
}

function renderDestroyedCorpseMarker(record) {
  if (!record?.entityId) return null;

  const stageId = String(record.stageId ?? '');
  const entityId = String(record.entityId);
  const markerId = destroyedCorpseMarkerId(stageId, entityId);

  const existing = document.getElementById(markerId);
  if (existing) return existing;

  const hex = resolveDestroyedCorpseHex(record);
  if (!hex) return null;

  const marker = document.createElement('img');
  marker.id = markerId;
  marker.className = 'destroyed-corpse';
  marker.src = DESTROYED_CORPSE_SPRITE_URL;
  marker.alt = '';
  marker.draggable = false;
  marker.setAttribute('aria-hidden', 'true');
  marker.dataset.destroyedCorpse = 'true';
  marker.dataset.entityId = entityId;
  marker.dataset.side = String(record.side || '');
  marker.dataset.stageId = stageId;

  /*
   * Petit sprite purement visuel :
   * - aucun statut d'entité ;
   * - aucun loot ;
   * - aucune occupation logique de l'hex.
   *
   * Le style essentiel est posé ici afin que destroyCorpse() ne dépende
   * d'aucune nouvelle règle CSS.
   */
  // Object.assign(marker.style, {
    // position: 'absolute',
    // left: '50%',
    // top: '50%',
    // width: '58px',
    // height: '58px',
    // objectFit: 'contain',
    // transform: 'translate(-50%, -50%)',
    // transformOrigin: 'center',
    // pointerEvents: 'none',
    // userSelect: 'none',
    // zIndex: '3'
  // });

  hex.appendChild(marker);
  return marker;
}

function rememberDestroyedCorpseMarker(record) {
  if (!record?.entityId) return false;

  const storage = readDestroyedCorpseMarkerStorage();
  const stageId = String(record.stageId ?? '');
  const entityId = String(record.entityId);

  storage.markers = storage.markers.filter((marker) => !(
    String(marker?.stageId ?? '') === stageId
    && String(marker?.entityId ?? '') === entityId
  ));

  storage.markers.push({
    stageId,
    entityId,
    corpseId: record.corpseId ?? null,
    side: record.side ?? null,
    hexId: record.hexId ?? null,
    hexPosition: record.hexPosition ?? null,
    destroyedAt: record.destroyedAt || nowIso()
  });

  return writeDestroyedCorpseMarkerStorage(storage);
}

export function renderDestroyedCorpseMarkers(
  levelId = activeLevelId || getCurrentLevel()
) {
  const stageId = normalizeDestroyedCorpseStageId(levelId);
  const storage = readDestroyedCorpseMarkerStorage();

  const stageMarkers = storage.markers.filter((marker) => (
    String(marker?.stageId ?? '') === stageId
  ));

  let rendered = 0;

  for (const marker of stageMarkers) {
    if (renderDestroyedCorpseMarker(marker)) rendered += 1;
  }

  return {
    stageId,
    markerCount: stageMarkers.length,
    rendered
  };
}

function scheduleDestroyedCorpseMarkerRender(
  levelId = activeLevelId || getCurrentLevel()
) {
  const stageId = normalizeDestroyedCorpseStageId(levelId);

  const render = () => {
    try {
      renderDestroyedCorpseMarkers(stageId);
    } catch (error) {
      console.warn('[Events] Rendu du sprite de cadavre détruit impossible.', error);
    }
  };

  render();

  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(render);
  }

  setTimeout(render, 150);
  setTimeout(render, 600);

  return stageId;
}

function purgePersistentCorpseLootSources(entityIds, stageId) {
  const wantedIds = new Set(
    [...entityIds].map((entityId) => String(entityId))
  );

  if (wantedIds.size === 0) return 0;

  const storage = readPersistentCorpseLootStorage();
  const before = storage.corpses.length;

  storage.corpses = storage.corpses.filter((source) => {
    const sourceEntityId = persistentCorpseSourceEntityId(source);
    if (sourceEntityId == null) return true;

    const sourceStageId = persistentCorpseSourceStageId(source);
    const sameStage = (
      !stageId
      || !sourceStageId
      || sourceStageId === String(stageId)
    );

    return !(
      sameStage
      && wantedIds.has(String(sourceEntityId))
    );
  });

  const removed = before - storage.corpses.length;
  if (removed > 0) writePersistentCorpseLootStorage(storage);

  return removed;
}

function findEventCorpseBattleElement(entity) {
  if (!entity?.id && entity?.id !== 0) return null;

  const entityId = String(entity.id);

  return document.getElementById(`Box_Entite_${entityId}`)
    || document.getElementById(`imgContainer_${entityId}`)
    || document.querySelector(
      `[data-entity-instance-id="${typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(entityId) : entityId}"]`
    );
}

function eventCorpseHexRecord(entity, side, stageId) {
  const battleElement = findEventCorpseBattleElement(entity);
  const hex = battleElement?.closest?.('.hex')
    || resolveDestroyedCorpseHex({
      hexPosition: entity?.battlePosition
        ?? entity?.position
        ?? entity?.hexId
        ?? null
    });

  return {
    stageId,
    entityId: String(entity?.id ?? ''),
    side,
    hex,
    hexId: hex?.id || null,
    hexPosition: hex?.dataset?.position
      ?? hex?.dataset?.hexId
      ?? entity?.battlePosition
      ?? entity?.position
      ?? entity?.hexId
      ?? null,
    destroyedAt: nowIso()
  };
}

function normalizeDestroyCorpseSide(side) {
  const normalized = String(side ?? '').trim().toLowerCase();

  if (['a', 'armya', 'sidea'].includes(normalized)) return 'A';
  if (['b', 'armyb', 'sideb'].includes(normalized)) return 'B';
  if (['neutral', 'neutre', 'n'].includes(normalized)) return 'neutral';
  if (['both', 'all', 'a+b', 'ab'].includes(normalized)) return 'both';

  throw new TypeError(`[Events] Camp destroyCorpse invalide : ${side}.`);
}

function resolveDestroyCorpseSides(options = {}) {
  const requestedSides = Array.isArray(options?.sides)
    ? options.sides
    : [options?.side ?? 'both'];

  const resolved = [];

  requestedSides.forEach((requestedSide) => {
    const normalized = normalizeDestroyCorpseSide(requestedSide);

    if (normalized === 'both') {
      resolved.push('A', 'B');
      return;
    }

    resolved.push(normalized);
  });

  return [...new Set(resolved)];
}

function getDestroyCorpseEntitiesForSide(side, stageId) {
  if (side === 'A' || side === 'B') {
    return getEventArmyEntities(side, stageId);
  }

  if (side !== 'neutral') return [];

  /*
   * Les entités neutres n'appartiennent ni à ArmyA ni à ArmyB.
   * Elles sont donc lues directement depuis le registre runtime.
   */
  return entites.filter((entity) => {
    const entitySide = String(
      entity?.side
        ?? entity?.armySide
        ?? entity?.camp
        ?? ''
    ).trim().toLowerCase();

    return ['neutral', 'neutre', 'n'].includes(entitySide);
  });
}

function getDestroyCorpseTargetPool(options, stageId) {
  return resolveDestroyCorpseSides(options).flatMap((side) => (
    getDestroyCorpseEntitiesForSide(side, stageId)
      .filter((entity) => !isAliveEventEntity(entity))
      .map((entity) => ({
        entity,
        side
      }))
  ));
}

function selectDestroyCorpseTargets(options, stageId) {
  const exactIds = normalizeDestroyCorpseRequestedIds(options, stageId);
  let pool = getDestroyCorpseTargetPool(options, stageId);

  if (exactIds.length > 0) {
    const byEntityId = new Map(
      pool.map((target) => [String(target?.entity?.id ?? ''), target])
    );

    return exactIds
      .map((entityId) => byEntityId.get(String(entityId)))
      .filter(Boolean);
  }

  const strategy = options?.random === true
    ? 'random'
    : options?.strategy ?? 'first';

  const count = options?.count ?? 'all';

  const plan = resolveEventTargetPlan({
    targetMode: options?.targetMode ?? null,
    strategy,
    statKey: options?.statKey ?? null,
    tieBreakers: options?.tieBreakers ?? null
  });

  pool = sortEventTargets(pool, plan);

  const requestedCount = requestedEventTargetCount(count, pool.length);

  return pool.slice(0, Math.min(requestedCount, pool.length));
}


function resolveDestroyCorpseAnimationElements(entity) {
  const entityId = String(entity?.id ?? '');

  if (!entityId) {
    return {
      entityId,
      battleElement: null,
      spriteContainer: null,
      canvas: null,
      effectsContainer: null
    };
  }

  const battleElement = findEventCorpseBattleElement(entity);

  const spriteContainer = document.getElementById(`spriteContainer_${entityId}`)
    || battleElement?.querySelector?.(`#spriteContainer_${entityId}`)
    || battleElement?.querySelector?.('[id^="spriteContainer_"]')
    || null;

  const canvas = document.getElementById(`spriteCanvas_${entityId}`)
    || spriteContainer?.querySelector?.('canvas')
    || battleElement?.querySelector?.('canvas')
    || null;

  let effectsContainer = document.getElementById(`effectsContainer_${entityId}`)
    || spriteContainer?.querySelector?.(`#effectsContainer_${entityId}`)
    || battleElement?.querySelector?.(`#effectsContainer_${entityId}`)
    || null;

  if (!effectsContainer && spriteContainer) {
    effectsContainer = document.createElement('div');
    effectsContainer.id = `effectsContainer_${entityId}`;
    effectsContainer.className = 'effects-container';
    spriteContainer.appendChild(effectsContainer);
  }

  return {
    entityId,
    battleElement,
    spriteContainer,
    canvas,
    effectsContainer
  };
}

function destroyCorpseAnimationBloodGif(
  effectsContainer,
  entityId,
  {
    src = './media/assets/effects/death-blood.gif',
    className = 'effect-vfx death-blood destroy-corpse-blood',
    lifetime = 850
  } = {}
) {
  if (!effectsContainer) return null;

  const gif = document.createElement('img');
  gif.className = className;
  gif.alt = '';
  gif.draggable = false;
  gif.setAttribute('aria-hidden', 'true');
  gif.dataset.destroyCorpseFx = 'true';
  gif.src = `${src}?t=${Date.now()}-${Math.random()}`;

  /*
   * Les classes de VFX existantes restent prioritaires si elles sont stylées.
   * Ces valeurs servent uniquement de filet de sécurité.
   */
  Object.assign(gif.style, {
    pointerEvents: 'none',
    userSelect: 'none'
  });

  effectsContainer.appendChild(gif);

  setTimeout(() => {
    gif.remove();
  }, Math.max(0, Number(lifetime) || 0));

  return gif;
}

export async function destroyCorpseAnimation({
  entity,
  markerRecord,
  impactDuration = 450,
  transitionDuration = 650,
  bloodImpactCount = 3,
  bloodImpactGap = 150
} = {}) {
  if (!entity) return { completed: false, reason: 'missing-entity' };
  const { entityId, battleElement, spriteContainer, canvas, effectsContainer } = resolveDestroyCorpseAnimationElements(entity);
  const marker = markerRecord ? renderDestroyedCorpseMarker(markerRecord) : null;
  if (marker) {
    marker.style.opacity = '0';
    marker.style.willChange = 'opacity';
  }
  const safeTransitionDuration = Math.max(0, Number(transitionDuration) || 0);
  const safeBloodImpactCount = Math.max(0, Math.floor(Number(bloodImpactCount) || 0));
  const safeBloodImpactGap = Math.max(0, Number(bloodImpactGap) || 0);
  await destructionItemAnimation({
    canvas,
    shakeTarget: spriteContainer || battleElement || canvas,
    impactDuration
  });
  destroyCorpseAnimationBloodGif(effectsContainer, entityId, {
    src: './media/assets/effects/death-blood.gif',
    lifetime: Math.max(850, safeTransitionDuration + 250)
  });
  for (let index = 0; index < safeBloodImpactCount; index += 1) {
    const delay = index * safeBloodImpactGap;
    setTimeout(() => {
      try {
        damageImpact(entityId, {
          lifetime: Math.max(500, safeTransitionDuration),
          randomBloodImpact: true,
          preserveCanvasSnapshot: false,
          skipCanvasTint: true
        });
      } catch (error) {
        console.warn(`[Events] Blood-impact destroyCorpse impossible pour ${entityId}.`, error);
      }
    }, delay);
  }
  const fadePromises = [];
  if (marker?.animate) {
    const markerFade = marker.animate([
      { opacity: 0 },
      { opacity: 1 }
    ], {
      duration: safeTransitionDuration,
      easing: 'ease-out',
      fill: 'forwards'
    });
    fadePromises.push(markerFade.finished.catch(() => null).then(() => {
      marker.style.opacity = '1';
      marker.style.willChange = '';
      markerFade.cancel();
    }));
  } else if (marker) {
    marker.style.opacity = '1';
    marker.style.willChange = '';
  }
  const corpseVisual = canvas || spriteContainer || battleElement;
  if (corpseVisual?.animate) {
    const computedOpacity = Number.parseFloat(getComputedStyle(corpseVisual).opacity);
    const startOpacity = Number.isFinite(computedOpacity) ? computedOpacity : 1;
    const corpseFade = corpseVisual.animate([
      { opacity: startOpacity },
      { opacity: 0 }
    ], {
      duration: safeTransitionDuration,
      easing: 'ease-in',
      fill: 'forwards'
    });
    fadePromises.push(corpseFade.finished.catch(() => null));
  } else if (corpseVisual) {
    corpseVisual.style.opacity = '0';
  }
  await Promise.allSettled([
    ...fadePromises,
    waitEventMilliseconds(safeTransitionDuration + Math.max(0, (safeBloodImpactCount - 1) * safeBloodImpactGap))
  ]);
  if (corpseVisual) corpseVisual.style.opacity = '0';
  if (marker) {
    marker.style.opacity = '1';
    marker.style.willChange = '';
  }
  return { completed: true, entityId, marker };
}

function resolveDestroyChestAnimationTargets() {
  if (typeof document === 'undefined') return [];
  const chestContainers = [...document.querySelectorAll('.chest-container')];
  const roots = chestContainers.length > 0 ? chestContainers : [...document.querySelectorAll('[id^="chest-ui-"]')];
  return [...new Set(roots)].map((root) => {
    const canvas = root.matches?.('canvas') ? root : root.querySelector?.('canvas');
    const shakeTarget = root.querySelector?.('[id^="spriteContainer_"]') || root;
    return { root, canvas: canvas || null, shakeTarget };
  });
}

export async function destroyChest(options = {}) {
  const normalizedOptions = options && typeof options === 'object' ? options : {};
  const impactDuration = Math.max(0, Number(normalizedOptions.impactDuration ?? 450) || 0);
  const targets = resolveDestroyChestAnimationTargets();
  if (targets.length > 0) {
    await Promise.allSettled(targets.map(({ canvas, shakeTarget }) => destructionItemAnimation({
      canvas,
      shakeTarget,
      impactDuration
    })));
  }
  const result = await Promise.resolve(destroyChestLoot(normalizedOptions));
  const destroyedChestCount = Math.max(0, Number(result?.destroyedChestCount) || 0);
  const lostLootCount = Math.max(0, Number(result?.lostLootCount) || 0);
  const chestSentence = destroyedChestCount === 1
    ? 'Le coffre du niveau est détruit.'
    : `${destroyedChestCount} coffres du niveau sont détruits.`;
  const lootSentence = lostLootCount === 0
    ? ''
    : lostLootCount === 1
      ? '<br>1 objet contenu dans le coffre est perdu.'
      : `<br>${lostLootCount} objets contenus dans les coffres sont perdus.`;
  const eventResults = destroyedChestCount > 0
    ? [eventResult(
      'chestsDestroyed',
      {
        stageId: result?.stageId ?? normalizedOptions.levelId ?? null,
        destroyedChestCount,
        lostLootCount
      },
      `${chestSentence}${lootSentence}`,
      ['event-result-chests-destroyed', 'destroy']
    )]
    : [];

  return {
    ...(result && typeof result === 'object' ? result : {}),
    eventResults
  };
}


/**
 * Détruit physiquement des cadavres présents sur le stage.
 *
 * API :
 *
 * destroyCorpse()
 *   -> tous les cadavres A + B du stage.
 *
 * destroyCorpse({ id: 123 })
 * destroyCorpse({ targetId: 123 })
 * destroyCorpse({ corpseId: 'corpse-stage-123' })
 *   -> un cadavre précis.
 *
 * destroyCorpse({ ids: [123, 456] })
 * destroyCorpse({ targetIds: [123, 456] })
 * destroyCorpse({ corpseIds: [...] })
 *   -> plusieurs cadavres précis.
 *
 * destroyCorpse({ side: 'A', count: 3, strategy: 'random' })
 *   -> X cadavres aléatoires du side demandé.
 *
 * destroyCorpse({ side: 'neutral' })
 *   -> tous les cadavres neutres.
 *
 * destroyCorpse({ sides: ['B', 'neutral'] })
 *   -> tous les cadavres side B + neutral.
 *
 * side accepte A, B, neutral ou both.
 * sides accepte plusieurs camps à la fois.
 * Sans count, tous les cadavres éligibles sont détruits.
 */
export async function destroyCorpse(options = {}) {
  const normalizedOptions = (
    typeof options === 'string'
    || typeof options === 'number'
  )
    ? { id: options }
    : options && typeof options === 'object'
      ? options
      : {};

  const stageId = normalizeDestroyedCorpseStageId(
    normalizedOptions.levelId
      ?? activeLevelId
      ?? getCurrentLevel()
  );

  const targets = selectDestroyCorpseTargets(normalizedOptions, stageId);

  if (targets.length === 0) {
    return {
      success: true,
      stageId,
      destroyedCorpseCount: 0,
      destroyedCorpseIds: []
    };
  }

  closeOpenLootInterfaces();

  const corpseStorage = readPersistentCorpseLootStorage();

  const preparedTargets = targets
    .map((target) => {
      const entity = target?.entity;
      const side = target?.side;

      if (!entity || !side || isAliveEventEntity(entity)) return null;

      const markerRecord = eventCorpseHexRecord(entity, side, stageId);

      const corpseSource = corpseStorage.corpses.find((source) => (
        String(persistentCorpseSourceEntityId(source) ?? '') === String(entity.id)
        && (
          !stageId
          || !persistentCorpseSourceStageId(source)
          || persistentCorpseSourceStageId(source) === stageId
        )
      ));

      markerRecord.corpseId = corpseSource?.id ?? null;

      return {
        entity,
        side,
        markerRecord
      };
    })
    .filter(Boolean);

  /*
   * Plusieurs cadavres ciblés sont animés simultanément.
   * Un problème visuel sur une cible ne doit jamais empêcher la destruction
   * logique des autres.
   */
  await Promise.allSettled(
    preparedTargets.map(({ entity, markerRecord }) => (
      destroyCorpseAnimation({
        entity,
        markerRecord,
        ...(normalizedOptions.animationOptions
          && typeof normalizedOptions.animationOptions === 'object'
          ? normalizedOptions.animationOptions
          : {})
      })
    ))
  );

  const destroyedRecords = [];

  for (const {
    entity,
    side,
    markerRecord
  } of preparedTargets) {
    /*
     * L'animation est terminée : on peut maintenant retirer réellement le
     * corpse de tous les registres et du DOM.
     */
    removeEventEntityEverywhere(entity, side);

    /*
     * Le marker destroyedCorpse est ensuite persisté. S'il a déjà été créé
     * par destroyCorpseAnimation(), renderDestroyedCorpseMarker() le réutilise.
     */
    rememberDestroyedCorpseMarker(markerRecord);
    renderDestroyedCorpseMarker(markerRecord);

    destroyedRecords.push(markerRecord);
  }

  const destroyedEntityIds = destroyedRecords.map(
    (record) => String(record.entityId)
  );

  const removedPersistentCorpseCount = purgePersistentCorpseLootSources(
    destroyedEntityIds,
    stageId
  );

  syncEventMaterialChanges();

  const destroyedCorpseCount = destroyedRecords.length;

  window.dispatchEvent(new CustomEvent('eventCorpsesDestroyed', {
    detail: {
      stageId,
      destroyedCorpseCount,
      destroyedCorpseIds: destroyedEntityIds,
      removedPersistentCorpseCount,
      sprite: DESTROYED_CORPSE_SPRITE_URL
    }
  }));

  const eventResults = destroyedCorpseCount > 0
    ? [
      eventResult(
        'corpsesDestroyed',
        {
          stageId,
          destroyedCorpseCount,
          destroyedCorpseIds: destroyedEntityIds,
          removedPersistentCorpseCount,
          sprite: DESTROYED_CORPSE_SPRITE_URL
        },
        destroyedCorpseCount === 1
          ? 'Un cadavre est détruit.'
          : `${destroyedCorpseCount} cadavres sont détruits.`,
        [
          'event-result-corpses-destroyed',
          'destroy'
        ]
      )
    ]
    : [];

  return {
    success: true,
    stageId,
    destroyedCorpseCount,
    destroyedCorpseIds: destroyedEntityIds,
    removedPersistentCorpseCount,
    sprite: DESTROYED_CORPSE_SPRITE_URL,
    eventResults
  };
}


function captureEventEntity(entity, side, context = {}) {
  const registry = loadFromLocalStorage(EVENT_CAPTURE_REGISTRY_KEY, { captures: {} });
  registry.captures = registry.captures && typeof registry.captures === 'object'
    ? registry.captures
    : {};
  const captureId = String(
    context.executionId
      ? `${context.executionId}:${side}:${entity.id}`
      : `${context.eventKey || 'event'}:${side}:${entity.id}`
  );
  if (!registry.captures[captureId]) {
    registry.captures[captureId] = {
      captureId,
      eventKey: context.eventKey || null,
      side,
      levelId: context.levelId || activeLevelId || getCurrentLevel(),
      capturedAt: nowIso(),
      entity: cloneValue(entity)
    };
    saveToLocalStorage(EVENT_CAPTURE_REGISTRY_KEY, registry);
  }
  removeEventEntityEverywhere(entity, side);
  return registry.captures[captureId];
}

function captureResultFor(target, snapshot) {
  const { entity, side } = target;
  const name = eventEntityName(entity);
  const safeName = escapeEventHtml(name);
  return eventResult('entityCaptured', {
    entityId: entity.id,
    name,
    side,
    aliveWhenCaptured: isAliveEventEntity(entity),
    acquisition: cloneValue(entity?.acquisition || null),
    captureId: snapshot.captureId,
    ...eventTargetResultData(target)
  }, withEventTargetAnnouncement(target, `La créature referme son emprise sur ${safeName} et l’emporte loin du champ de bataille.<br><br><strong>La ${eventMalusHtml('capture')} de ${safeName} est confirmée.</strong>`));
}

function formatEventEntityNameList(names) {
  const safeNames = names.map((name) => escapeEventHtml(name));
  if (safeNames.length <= 1) return safeNames[0] || '';
  if (safeNames.length === 2) return `${safeNames[0]} et ${safeNames[1]}`;
  return `${safeNames.slice(0, -1).join(', ')} et ${safeNames.at(-1)}`;
}

function aggregateCapturedEntityResults(results) {
  if (results.length <= 1) return results;

  const outcomes = results.map((result) => ({
    type: result.type,
    ...cloneValue(result.data)
  }));
  const captures = outcomes.filter((outcome) => outcome.type === 'entityCaptured');
  const names = captures.map((capture) => capture.name);
  const captureSentence = captures.length === 1
    ? `${formatEventEntityNameList(names)} est ${eventMalusHtml(eventGendered(captures[0], 'capturé', 'capturée'))} et ${eventMalusHtml(eventGendered(captures[0], 'emporté', 'emportée'))} sur-le-champ.`
    : captures.length > 1
      ? `${formatEventEntityNameList(names)} sont ${eventMalusHtml(eventGroupGendered(captures, 'capturés', 'capturées'))} et ${eventMalusHtml(eventGroupGendered(captures, 'emportés', 'emportées'))} sur-le-champ.`
      : null;
  const resurrectionEscapes = outcomes.filter((outcome) => (
    outcome.type === 'lastSurvivorConsumesResurrectionToEscapeCapture'
  ));
  const captureEscapes = outcomes.filter((outcome) => [
    'lastSurvivorConsumesResurrectionToEscapeCapture',
    'lastSurvivorEscapesCapture'
  ].includes(outcome.type));
  const violentRaptSentence = captureEscapes.length === 1
    ? `Le rapt est si violent qu’il emporte un membre complet de ${escapeEventHtml(captureEscapes[0].name)}.`
    : captureEscapes.length > 1
      ? `Le rapt est si violent qu’il emporte un membre complet de chacune des entités suivantes : ${formatEventEntityNameList(captureEscapes.map((outcome) => outcome.name))}.`
      : null;
  const bodySentence = resurrectionEscapes.length > 0
    ? `Sous la violence du choc, ${resurrectionEscapes.length > 1 ? 'les corps' : 'le corps'} de ${formatEventEntityNameList(resurrectionEscapes.map((outcome) => outcome.name))} ${resurrectionEscapes.length > 1 ? 's’effondrent' : 's’effondre'} sans vie, mais la capture échoue.`
    : null;
  const simpleEscapes = outcomes.filter((outcome) => outcome.type === 'lastSurvivorEscapesCapture');
  const escapeSentence = simpleEscapes.length > 0
    ? `${formatEventEntityNameList(simpleEscapes.map((outcome) => outcome.name))} ${simpleEscapes.length > 1 ? 'échappent' : 'échappe'} à la capture au prix d’une grave blessure.`
    : null;
  const abandonedBodies = outcomes.filter((outcome) => outcome.type === 'lastBodyNotCaptured');
  const bodyLeftSentence = abandonedBodies.length > 0
    ? `${abandonedBodies.length > 1 ? 'Les dépouilles' : 'La dépouille'} de ${formatEventEntityNameList(abandonedBodies.map((outcome) => outcome.name))} ${abandonedBodies.length > 1 ? 'restent' : 'reste'} sur le champ de bataille.`
    : null;
  const statuses = outcomes
    .filter((outcome) => !['entityCaptured', 'lastBodyNotCaptured'].includes(outcome.type))
    .map((outcome) => (
      `${escapeEventHtml(outcome.name)} est en vie avec <span class="HP">${outcome.hpAfter} HP</span>.`
    )).join('<br>');
  const allCaptured = captures.length === outcomes.length;

  return [multiTargetEventResult(
    allCaptured ? 'entitiesCaptured' : 'multipleCaptureOutcomes',
    outcomes,
    [
      `<strong>${multiTargetOpening(outcomes, 'Et elle tente de les emporter !')}</strong>`,
      captureSentence,
      violentRaptSentence,
      escapeSentence,
      bodySentence,
      ...groupedResurrectionSentences(outcomes),
      bodyLeftSentence,
      statuses
    ], [
      allCaptured ? 'event-result-entities-captured' : 'event-result-multiple-captures',
      'capture'
    ], { captures }, '<br>'
  )];
}

function randomSafeCaptureCorpse(side, processedTargets) {
  const corpses = getEventArmyEntities(side)
    .filter((entity) => !isAliveEventEntity(entity))
    .map((entity) => ({ entity, side }))
    .filter((target) => !processedTargets.has(eventTargetIdentity(target)));
  if (corpses.length === 0) return null;
  const target = corpses[Math.floor(Math.random() * corpses.length)];
  return {
    ...target,
    selectionPlan: {
      targetMode: 'safeCorpseFallback',
      strategy: 'random',
      statKey: null
    },
    selectionReason: {
      criterion: 'randomCorpse',
      direction: 'random',
      tieBreaker: false,
      announcement: 'Un cadavre est choisi au hasard pour préserver le dernier membre vivant.'
    },
    announcement: 'Un cadavre est choisi au hasard pour préserver le dernier membre vivant.'
  };
}

export async function eventRemoveEntity(options = {}) {
  const sequence = createEventTargetSequence(options, {
    lifeState: options.lifeState ?? 'all',
    includeDead: true
  }, 'eventRemoveEntity');
  const results = [];
  const processedTargets = new Set();
  const safeMode = options.safeMode === true;
  const allowResurrectionEscape = options.allowResurrectionEscape !== false;
  const protectedSide = String(options.protectedSide || 'A').toUpperCase();

  for (let step = 0; step < sequence.limit; step += 1) {
    let target = nextEventSequenceTarget(sequence, processedTargets);
    if (!target) break;
    let { entity, side } = target;
    const living = getEventArmyEntities(side).filter(isAliveEventEntity);
    const total = getEventArmyEntities(side).length;
    const isLastLivingTarget = safeMode
      && side === protectedSide
      && isAliveEventEntity(entity)
      && living.length <= 1;
    const isLastMember = safeMode && side === protectedSide && total <= 1;

    if (isLastLivingTarget && options.allowCorpseFallback !== false) {
      const corpseFallback = randomSafeCaptureCorpse(side, processedTargets);
      if (corpseFallback) {
        target = corpseFallback;
        ({ entity, side } = target);
        traceEventTargetOverride(
          sequence,
          target,
          'Safe Mode : le vivant ciblé était le dernier encore en vie ; un cadavre disponible est capturé à sa place.',
          { protection: 'corpseFallback' }
        );
        processedTargets.add(eventTargetIdentity(target));
        const snapshot = captureEventEntity(entity, side, options);
        results.push(captureResultFor(target, snapshot));
        continue;
      }
    }

    processedTargets.add(eventTargetIdentity(target));

    if (isLastLivingTarget) {
      traceEventTargetOverride(
        sequence,
        target,
        hasUsableResurrection(entity)
          && allowResurrectionEscape
          ? 'Safe Mode : dernière entité vivante ; la capture est remplacée par une mort suivie d’une résurrection.'
          : 'Safe Mode : la capture de la dernière entité vivante est remplacée par une blessure à 1 HP.',
        {
          protection: hasUsableResurrection(entity) && allowResurrectionEscape
            ? 'resurrection'
            : 'oneHp'
        }
      );
    }

    if (!isLastLivingTarget && !isLastMember) {
      const snapshot = captureEventEntity(entity, side, options);
      results.push(captureResultFor(target, snapshot));
      continue;
    }

    if (!isAliveEventEntity(entity)) {
      const name = eventEntityName(entity);
      results.push(eventResult('lastBodyNotCaptured', {
        entityId: entity.id,
        name,
        side,
        safeMode: true,
        ...eventTargetResultData(target)
      }, withEventTargetAnnouncement(target, `La créature tente d’emporter la dépouille de ${escapeEventHtml(name)}, mais doit l’abandonner dans le chaos de l’affrontement.`)));
      continue;
    }

    if (isLastLivingTarget && hasUsableResurrection(entity) && allowResurrectionEscape) {
      const fatal = await applyFatalEventDamage(entity, { destroyArmor: true });
      const name = eventEntityName(entity);
      const safeName = escapeEventHtml(name);
      const resurrectionStat = eventStatHtml(
        fatal.resurrectionType,
        fatal.resurrection || 'force de résurrection'
      );
      const armorSentence = fatal.armorDamage > 0
        ? ` L’<span class="picto-stat armor" data-typewriter-atomic="true"></span><span class="armor">armure</span> est arrachée et perd ${fatal.armorDamage} points.`
        : '';
      results.push(eventResult('lastSurvivorConsumesResurrectionToEscapeCapture', {
        entityId: entity.id,
        name,
        side,
        safeMode: true,
        capturePrevented: true,
        ...eventTargetResultData(target),
        ...fatal
      }, withEventTargetAnnouncement(target, `La créature tente d’emporter ${safeName}. Dans un ultime effort, ${safeName} se libère au prix d’une blessure mortelle.${armorSentence}<br><br>Le corps s’effondre... mais, par miracle, une ${resurrectionStat} se consume. ${safeName} revient à la vie !<br><strong>${safeName} utilise une ${resurrectionStat}. L’entité possède désormais <span class="HP">${fatal.hpAfter} HP</span>.</strong>`)));
      continue;
    }

    const hpBefore = getEntityCurrentHp(entity);
    const damage = Math.max(0, hpBefore - 1);
    const armorLoss = destroyEventEntityArmor(entity);
    if (damage > 0 || armorLoss.armorDamage > 0) {
      triggerEventDamageImpact(entity, armorLoss.armorDamage, damage);
    }
    setEntityCurrentHp(entity, 1);
    persistEventEntityVitals(entity);
    if (damage > 0 || armorLoss.armorDamage > 0) {
      showEventDamageNumbers(entity, damage, armorLoss.armorDamage);
    }
    const name = eventEntityName(entity);
    const safeName = escapeEventHtml(name);
    const armorSentence = armorLoss.armorDamage > 0
      ? `<br>L’<span class="picto-stat armor" data-typewriter-atomic="true"></span><span class="armor">armure</span> de ${safeName} est arrachée et perd ${armorLoss.armorDamage} points.`
      : '';
    results.push(eventResult('lastSurvivorEscapesCapture', {
      entityId: entity.id,
      name,
      side,
      safeMode: true,
      ...eventTargetResultData(target),
      hpBefore,
      hpAfter: 1,
      damage,
      ...armorLoss
    }, withEventTargetAnnouncement(target, `La créature tente d’emporter ${safeName}, mais cette cible est le dernier membre encore en état de combattre. Dans un acte désespéré de bravoure, ${safeName} s’automutile, abandonnant à l’ennemi la partie du corps retenue prisonnière.${armorSentence}<br><br>Malgré la gravité de la blessure, ${safeName} se relève. Toujours là. En piètre état, mais toujours là.<br><br><strong>L’entité ne possède plus que <span class="HP">1 HP</span>.</strong>`)));
  }

  syncEventMaterialChanges();
  return { eventResults: aggregateCapturedEntityResults(results) };
}

export const genericEventActions = Object.freeze({
  sequence,
  runawayTheatre,
  wanderingTheatre,
  stopWanderingTheatre,
  opacityHexOccupied,
  attackSurprise,
  eventEntityAttack,
  eventEntitydamages,
  killEventEntity,
  eventRemoveEntity,
  spawnCharge,
  spawnMonster,
  spawnDead,
  spawnChest,
  eventVictory,
  eventDefeat,
  destroyNeutrals,
  destroyChest,
  destroyCorpse,
  destroyCorpseAnimation,
  renderDestroyedCorpseMarkers,
  battleEventInPause,
  forceBattle,
  closeDialogue,
  forceCombat,
  fleeCombat,
  quitCombat,
  quitLevel,
  QuitCurrentLevel: quitLevel
});

function getStoredEventState(eventKey) {
  return loadQuestState().inProgress?.[eventKey] || null;
}

/**
 * Verrou central : tant que cette fonction retourne true, aucune partie de
 * events.js n'a le droit de restaurer ou d'afficher le dialogue de l'événement.
 * Les anciens champs sont acceptés afin de migrer les sauvegardes existantes.
 */
export function isBattleEventInPause(eventStateOrKey = null) {
  const state = typeof eventStateOrKey === 'string'
    ? getStoredEventState(eventStateOrKey)
    : eventStateOrKey;

  return Boolean(state && (
    state.status === 'battleEventInPause' ||
    state.status === 'battleInProgress' ||
    state.phase === 'combat' ||
    state.eventInPause === true ||
    state.eventPausedForBattle === true
  ));
}

function validateNode(eventDefinition, nodeId) {
  const node = eventDefinition?.nodes?.[nodeId];
  if (!node) {
    throw new Error(`[Events] Écran ${nodeId} introuvable dans ${eventDefinition?.key}.`);
  }
  return node;
}

function normalizeEventHistory(storedState) {
  const history = Array.isArray(storedState?.history)
    ? storedState.history
      .filter((entry) => entry?.nodeId)
      .map((entry) => ({
        nodeId: String(entry.nodeId),
        selectedChoiceId: entry.selectedChoiceId == null
          ? null
          : String(entry.selectedChoiceId),
        visitedAt: entry.visitedAt || null
      }))
    : [];
  const legacyNodeIds = [
    ...(Array.isArray(storedState?.completedNodeIds) ? storedState.completedNodeIds : []),
    storedState?.currentNodeType === 'action' ? null : storedState?.currentNodeId
  ].filter(Boolean).map(String);

  for (const nodeId of legacyNodeIds) {
    if (!history.some((entry) => entry.nodeId === nodeId)) {
      history.push({ nodeId, selectedChoiceId: null, visitedAt: null });
    }
  }

  const currentNodeId = storedState?.currentNodeType === 'action'
    ? ''
    : String(storedState?.currentNodeId || '');
  if (currentNodeId && history[history.length - 1]?.nodeId !== currentNodeId) {
    history.push({ nodeId: currentNodeId, selectedChoiceId: null, visitedAt: null });
  }
  if (history[history.length - 1]?.nodeId === currentNodeId && storedState?.selectedChoiceId) {
    history[history.length - 1].selectedChoiceId = String(storedState.selectedChoiceId);
  }

  return history;
}

function syncEventStateToStage(eventKey, eventState, status = 'inProgress') {
  const levelId = eventState?.levelId;
  if (levelId == null) return false;

  const gameStages = loadFromLocalStorage('GameStages', { stages: [] });
  if (!Array.isArray(gameStages.stages)) return false;

  const stage = gameStages.stages.find(
    (candidate) => String(candidate?.id) === String(levelId)
  );
  if (!stage) return false;

  stage.quests = stage.quests && typeof stage.quests === 'object' && !Array.isArray(stage.quests)
    ? stage.quests
    : {};
  const previous = stage.quests[eventKey] && typeof stage.quests[eventKey] === 'object'
    ? stage.quests[eventKey]
    : {};

  stage.quests[eventKey] = {
    ...previous,
    questId: String(eventState.eventId),
    status,
    currentNodeId: eventState.currentNodeId || null,
    currentNodeType: eventState.currentNodeType || previous.currentNodeType || null,
    lastCompletedNodeId: eventState.lastCompletedNodeId || null,
    selectedChoiceId: eventState.selectedChoiceId || null,
    choiceResolution: cloneValue(eventState.choiceResolution || null),
    completedNodeIds: cloneValue(eventState.completedNodeIds || []),
    history: cloneValue(normalizeEventHistory(eventState)),
    executedActions: cloneValue(eventState.executedActions || []),
    eventResults: cloneValue(eventState.eventResults || []),
    eventResultScreens: cloneValue(eventState.eventResultScreens || {}),
    actionNodeState: cloneValue(eventState.actionNodeState || null),
    lastActionError: cloneValue(eventState.lastActionError || null),
    phase: eventState.phase || previous.phase || 'dialogue',
    dialogueActive: eventState.dialogueActive ?? previous.dialogueActive ?? true,
    eventPausedForBattle: eventState.eventPausedForBattle
      ?? previous.eventPausedForBattle
      ?? false,
    eventInPause: eventState.eventInPause
      ?? previous.eventInPause
      ?? false,
    pauseReason: eventState.pauseReason || previous.pauseReason || null,
    combatStartedAt: eventState.combatStartedAt || previous.combatStartedAt || null,
    startedAt: eventState.startedAt || previous.startedAt || null,
    choiceSelectedAt: eventState.choiceSelectedAt || null,
    completedAt: eventState.completedAt || null,
    updatedAt: eventState.updatedAt || nowIso()
  };

  saveToLocalStorage('GameStages', gameStages);
  return true;
}

function renderEventHistoryAt(eventDefinition, storedState, requestedIndex, animate = true) {
  if (isBattleEventInPause(storedState)) {
    console.warn(
      `[Events] Rendu bloqué : ${eventDefinition?.key} est en pause combat.`
    );
    return null;
  }

  const history = normalizeEventHistory(storedState);

  // Un choix validé est irréversible : dès qu'une entrée d'historique porte
  // un selectedChoiceId, aucun rendu d'un écran antérieur n'est autorisé.
  // Ce garde-fou protège aussi contre un appel programmatique direct à
  // renderEventHistoryAt(), pas seulement contre le bouton « précédent ».
  const choiceCommitted = history.some((entry) => entry.selectedChoiceId != null);
  const requestedHistoryIndex = Math.max(
    0,
    Math.min(Number(requestedIndex) || 0, history.length - 1)
  );
  const historyIndex = choiceCommitted
    ? history.length - 1
    : requestedHistoryIndex;
  const historyEntry = history[historyIndex];
  const node = validateNode(eventDefinition, historyEntry.nodeId);
  const isCurrentScreen = (
    historyIndex === history.length - 1
    && String(node.id) === String(storedState.currentNodeId)
  );

  let renderedNode = node?.outcome && !node.title
    ? {
      ...node,
      title: CHOICE_RESOLUTION_TITLES[node.outcome] || null
    }
    : node;
  if (node.type === 'choices') {
    renderedNode = {
      ...renderedNode,
      choices: (node.choices || []).filter((choice) => (
        String(choice.id) === String(historyEntry.selectedChoiceId || '')
        || isEventChoiceAvailable(choice)
      ))
    };
  } else if (node.type === 'result' && node.includeResults !== false) {
    const resultScreen = storedState.eventResultScreens?.[node.id]
      ?? storedState.eventResults
      ?? [];
    renderedNode = {
      ...renderedNode,
      text: materialResultHtml({
        preMessage: node.text || '',
        results: resultScreen
      })
    };
  }

  return renderEventDialogueScreen(renderedNode, {
    selectedChoiceId: historyEntry.selectedChoiceId,
    choicesReadOnly: !isCurrentScreen,
    animateText: animate,
    animateChoices: animate,
    onPrevious: !choiceCommitted && historyIndex > 0
      ? () => renderEventHistoryAt(eventDefinition, storedState, historyIndex - 1, false)
      : null,
    onHistoryNext: !choiceCommitted && historyIndex < history.length - 1
      ? () => renderEventHistoryAt(eventDefinition, storedState, historyIndex + 1, false)
      : null,
    onContinue: isCurrentScreen
      ? () => advanceEvent(eventDefinition.key, node.id)
      : null,
    onChoice: isCurrentScreen
      ? (choiceId) => selectEventChoice(eventDefinition.key, node.id, choiceId)
      : null
  });
}

async function renderStoredEvent(eventDefinition, storedState, { animate = true } = {}) {
  if (isBattleEventInPause(storedState)) return null;

  const currentNode = validateNode(eventDefinition, storedState.currentNodeId);
  if (currentNode.type === 'action') {
    return resolveActionNode(eventDefinition, currentNode, storedState);
  }

  const history = normalizeEventHistory(storedState);
  return renderEventHistoryAt(eventDefinition, storedState, history.length - 1, animate);
}

async function withTransitionLock(callback) {
  if (transitionLocked) return false;
  transitionLocked = true;
  try {
    return await callback();
  } finally {
    transitionLocked = false;
  }
}

export async function startEvent(eventDefinition, {
  levelId = activeLevelId || getCurrentLevel(),
  force = false
} = {}) {
  if (
    eventDefinition?.adminOnly === true
    && (typeof window === 'undefined' || window.levelRunning !== 'admin')
  ) {
    throw new Error(`[Events] ${eventDefinition.key} est réservé au niveau administrateur.`);
  }
  registerEventDefinition(eventDefinition);
  const startedAt = nowIso();
  let startedState = null;
  let interruptedEvent = null;

  if (force) {
    if (
      transitionLocked
      || pendingActionNodeResolutions.size > 0
    ) {
      throw new Error('Un événement est encore en train d’appliquer une action. Réessayez dans un instant.');
    }
    closeDialogue({ remove: true });
    attackSurprise(null);
  }

  updateQuestState((quest) => {
    if (!force && (
      quest.activeEventKey
      || quest.finished[eventDefinition.key]
      || quest.failed[eventDefinition.key]
    )) {
      return quest;
    }

    if (force) {
      const activeKey = quest.activeEventKey;
      const activeState = activeKey ? quest.inProgress?.[activeKey] : null;
      if (activeKey && activeState) {
        interruptedEvent = {
          key: activeKey,
          state: {
            ...activeState,
            status: 'failed',
            interruptedByAdmin: true,
            interruptionReason: 'admin_event_launcher',
            completedAt: startedAt,
            updatedAt: startedAt
          }
        };
        quest.failed[activeKey] = interruptedEvent.state;
        delete quest.inProgress[activeKey];
      }
      delete quest.finished[eventDefinition.key];
      delete quest.failed[eventDefinition.key];
      delete quest.inProgress[eventDefinition.key];
      quest.activeEventKey = null;
    }

    startedState = {
      eventId: String(eventDefinition.id),
      version: eventDefinition.version || 1,
      levelId: levelId == null ? null : String(levelId),
      currentNodeId: eventDefinition.startNodeId,
      currentNodeType: validateNode(eventDefinition, eventDefinition.startNodeId).type,
      lastCompletedNodeId: null,
      selectedChoiceId: null,
      choiceResolution: null,
      completedNodeIds: [],
      history: [{
        nodeId: eventDefinition.startNodeId,
        selectedChoiceId: null,
        visitedAt: startedAt
      }],
      executedActions: [],
      eventResults: [],
      eventResultScreens: {},
      actionNodeState: null,
      startedAt,
      updatedAt: startedAt
    };

    quest.activeEventKey = eventDefinition.key;
    quest.inProgress[eventDefinition.key] = startedState;
    return quest;
  });

  if (!startedState) return null;
  if (interruptedEvent && interruptedEvent.key !== eventDefinition.key) {
    syncEventStateToStage(interruptedEvent.key, interruptedEvent.state, 'failed');
  }
  syncEventStateToStage(eventDefinition.key, startedState);

  if (typeof eventDefinition.onStart === 'function') {
    await eventDefinition.onStart({
      actions: genericEventActions,
      event: eventDefinition,
      levelId: startedState.levelId,
      state: startedState
    });
  }

  return renderStoredEvent(eventDefinition, startedState);
}

async function moveEventToNodeUnlocked(eventDefinition, expectedNodeId, nextNodeId) {
  const eventKey = eventDefinition.key;
  const nextNode = validateNode(eventDefinition, nextNodeId);
  let nextState = null;

  updateQuestState((quest) => {
    const stored = quest.inProgress[eventKey];
    if (!stored || stored.currentNodeId !== expectedNodeId) return quest;

    const currentNode = validateNode(eventDefinition, expectedNodeId);
    const completedNodeIds = Array.isArray(stored.completedNodeIds)
      ? [...stored.completedNodeIds]
      : [];
    if (currentNode.type !== 'action' && !completedNodeIds.includes(expectedNodeId)) {
      completedNodeIds.push(expectedNodeId);
    }
    const history = normalizeEventHistory(stored);
    if (nextNode.type !== 'action') {
      history.push({
        nodeId: nextNode.id,
        selectedChoiceId: null,
        visitedAt: nowIso()
      });
    }

    const pendingEventResults = cloneValue(stored.eventResults || []);
    const eventResultScreens = cloneValue(stored.eventResultScreens || {});
    if (nextNode.type === 'result' && nextNode.includeResults !== false) {
      eventResultScreens[nextNode.id] = cloneValue(pendingEventResults);
    }

    nextState = {
      ...stored,
      currentNodeId: nextNode.id,
      currentNodeType: nextNode.type,
      lastCompletedNodeId: expectedNodeId,
      selectedChoiceId: null,
      choiceResolution: null,
      // Le bilan traverse les dialogues intermédiaires. Il n'est consommé
      // qu'après le passage sur un vrai nœud `result`.
      eventResults: currentNode.type === 'result' ? [] : pendingEventResults,
      eventResultScreens,
      actionNodeState: null,
      completedNodeIds,
      history,
      updatedAt: nowIso()
    };
    quest.inProgress[eventKey] = nextState;
    return quest;
  });

  if (!nextState) return false;
  syncEventStateToStage(eventKey, nextState);
  await renderStoredEvent(eventDefinition, nextState);
  return nextState;
}

export async function advanceEvent(eventKey, expectedNodeId) {
  return withTransitionLock(async () => {
    if (isBattleEventInPause(eventKey)) return false;

    const eventDefinition = resolveEventDefinition(eventKey);
    if (!eventDefinition) throw new Error(`[Events] Événement inconnu : ${eventKey}.`);

    const currentState = getStoredEventState(eventKey);
    if (!currentState || currentState.currentNodeId !== expectedNodeId) return false;

    const currentNode = validateNode(eventDefinition, currentState.currentNodeId);
    if (!currentNode.next) return false;
    return Boolean(await moveEventToNodeUnlocked(
      eventDefinition,
      expectedNodeId,
      currentNode.next
    ));
  });
}

export async function selectEventChoice(eventKey, expectedNodeId, choiceId) {
  return withTransitionLock(async () => {
    if (isBattleEventInPause(eventKey)) return false;

    const eventDefinition = resolveEventDefinition(eventKey);
    if (!eventDefinition) throw new Error(`[Events] Événement inconnu : ${eventKey}.`);

    const currentState = getStoredEventState(eventKey);
    if (!currentState || currentState.currentNodeId !== expectedNodeId) return false;
    if (currentState.selectedChoiceId) return false;

    const currentNode = validateNode(eventDefinition, expectedNodeId);
    const choice = (currentNode.choices || []).find(
      (candidate) => String(candidate.id) === String(choiceId)
    );
    if (!choice) throw new Error(`[Events] Choix ${choiceId} introuvable.`);
    if (!isEventChoiceAvailable(choice)) {
      throw new Error(`[Events] Les conditions du choix ${choiceId} ne sont pas remplies.`);
    }

    let selectedState = null;
    updateQuestState((quest) => {
      const stored = quest.inProgress[eventKey];
      if (!stored || stored.currentNodeId !== expectedNodeId || stored.selectedChoiceId) {
        return quest;
      }

      const completedNodeIds = Array.isArray(stored.completedNodeIds)
        ? [...stored.completedNodeIds]
        : [];
      if (!completedNodeIds.includes(expectedNodeId)) completedNodeIds.push(expectedNodeId);
      const history = normalizeEventHistory(stored);
      for (let index = history.length - 1; index >= 0; index -= 1) {
        if (history[index].nodeId !== String(expectedNodeId)) continue;
        history[index] = {
          ...history[index],
          selectedChoiceId: String(choice.id)
        };
        break;
      }

      selectedState = {
        ...stored,
        lastCompletedNodeId: expectedNodeId,
        selectedChoiceId: String(choice.id),
        completedNodeIds,
        history,
        choiceSelectedAt: nowIso(),
        updatedAt: nowIso()
      };
      quest.inProgress[eventKey] = selectedState;
      return quest;
    });

    if (!selectedState) return false;
    syncEventStateToStage(eventKey, selectedState);
    const resolution = ensureChoiceResolution(eventDefinition, choice, selectedState);
    selectedState = resolution.state;
    const resolvedChoice = resolution.choice;
    await resolveSelectedChoice(
      eventDefinition,
      currentNode,
      resolvedChoice,
      selectedState
    );
    return true;
  });
}

export async function executeEventAction(eventKey, actionDefinition, context = {}) {
  const eventDefinition = resolveEventDefinition(eventKey);
  if (!eventDefinition) throw new Error(`[Events] Événement inconnu : ${eventKey}.`);

  const directAction = typeof actionDefinition === 'function' ? actionDefinition : null;
  const actionName = directAction
    ? directAction.name || 'anonymousAction'
    : typeof actionDefinition === 'string'
      ? actionDefinition
      : actionDefinition?.action;
  const args = typeof actionDefinition === 'object' && actionDefinition?.args
    ? actionDefinition.args
    : {};
  const action = directAction
    || eventDefinition.actions?.[actionName]
    || genericEventActions[actionName];
  if (typeof action !== 'function') {
    throw new Error(`[Events] Action inconnue : ${actionName}.`);
  }

  return action({
    ...context,
    ...args,
    actions: genericEventActions,
    event: eventDefinition
  });
}

function getChoiceActionName(actionDefinition) {
  if (typeof actionDefinition === 'function') {
    return actionDefinition.name || 'anonymousAction';
  }
  if (typeof actionDefinition === 'string') return actionDefinition;
  return actionDefinition?.action || 'unknownAction';
}

async function finalizeSelectedChoice(eventDefinition, node, choice) {
  if (choice.end === true) {
    failEvent(eventDefinition.key, {
      endedByChoice: true,
      failedNodeId: node.id,
      failedChoiceId: String(choice.id),
      failureReason: 'choice_end'
    });
    return null;
  }

  if (choice.next) {
    return moveEventToNodeUnlocked(eventDefinition, node.id, choice.next);
  }

  return getStoredEventState(eventDefinition.key);
}

function serializeEventData(value) {
  const seen = new WeakSet();
  try {
    return JSON.parse(JSON.stringify(value, (_key, item) => {
      if (typeof item === 'function') return `[Function ${item.name || 'anonymous'}]`;
      if (typeof Element !== 'undefined' && item instanceof Element) {
        return { element: item.id || item.className || item.tagName };
      }
      if (item && typeof item === 'object') {
        if (seen.has(item)) return '[Circular]';
        seen.add(item);
      }
      return item;
    }));
  } catch {
    return String(value);
  }
}

function collectActionResults(actionOutput, actionName, executionId) {
  if (actionOutput == null) return [];
  const provided = Array.isArray(actionOutput?.eventResults)
    ? actionOutput.eventResults
    : actionOutput?.eventResult
      ? [actionOutput.eventResult]
      : [];
  if (provided.length > 0) {
    return provided.map((result) => ({
      executionId,
      action: actionName,
      ...serializeEventData(result)
    }));
  }
  return [];
}

function storedEventResultIdentity(result) {
  const data = result?.data && typeof result.data === 'object'
    ? result.data
    : {};
  const materialIdentity = data.captureId
    ?? data.entityId
    ?? (Array.isArray(data.entityIds) ? data.entityIds.join('|') : null)
    ?? 'single';
  return `${String(result?.executionId || '')}:${String(result?.type || '')}:${String(materialIdentity)}`;
}

function shouldDisplayMaterialEventResult(result) {
  const data = result?.data && typeof result.data === 'object'
    ? result.data
    : null;

  const hasEffectiveDamage = (record) => Boolean(record) && (
    Number(record.rawDamage) > 0
    || Number(record.hpDamage) > 0
    || Number(record.armorDamage) > 0
    || record.died === true
    || Boolean(record.resurrectionType || record.resurrection)
  );

  if (result?.type === 'entityDamaged' && !hasEffectiveDamage(data)) {
    return false;
  }

  if (result?.type === 'entitiesDamaged') {
    const damages = Array.isArray(data?.damages) ? data.damages : data?.outcomes;
    if (!Array.isArray(damages) || !damages.some(hasEffectiveDamage)) return false;
  }

  if (
    data
    && Object.prototype.hasOwnProperty.call(data, 'destroyedChestCount')
  ) {
    const destroyedChestCount = Number(data.destroyedChestCount);

    if (
      Number.isFinite(destroyedChestCount)
      && destroyedChestCount <= 0
    ) {
      return false;
    }
  }

  return true;
}


function materialResultHtml(screen) {
  const sections = [];

  // Un texte manuel éventuel introduit le relevé objectif.
  if (screen.preMessage) {
    sections.push(`<div class="event-result-pre-message">${screen.preMessage}</div>`);
  }

  // Les résultats proviennent exclusivement des actions réellement exécutées.
  for (const result of screen.results || []) {
    if (!shouldDisplayMaterialEventResult(result)) continue;

    const html = result?.html
      || `<pre>${escapeEventHtml(JSON.stringify(result?.data ?? result, null, 2))}</pre>`;
    const resultClasses = Array.isArray(result?.classes)
      ? result.classes.map((className) => escapeEventHtml(className)).join(' ')
      : '';
    const fallbackClass = resultClasses
      ? ''
      : ` event-result-${escapeEventHtml(result?.type || 'data')}`;

    sections.push(
      `<div class="event-result-item${fallbackClass}${resultClasses ? ` ${resultClasses}` : ''}">${html}</div>`
    );
  }

  return sections.join('<br><br>');
}

function actionNodeDefinitions(node) {
  if (!Array.isArray(node?.actions) || node.actions.length === 0) {
    throw new Error(`[Events] L’écran action ${node?.id} attend un tableau \`actions\` non vide.`);
  }
  return node.actions;
}

function actionNodeDefinition(node) {
  const definitions = actionNodeDefinitions(node);
  if (definitions.length === 1) return definitions[0];
  return {
    action: 'sequence',
    args: { sequence: definitions }
  };
}

function actionNodeExecutionId(node, actionDefinition) {
  return `${node.id}:actions:${getChoiceActionName(actionDefinition)}`;
}

async function enterEventActionScreen(node) {
  closeDialogueWindow({ remove: true });
  closeOpenLootInterfaces();
  cinematicScreenFX(false);

  const cinematicMode = eventScreenCinematicMode(node);
  if (cinematicMode != null) {
    hideAllInterface();
    const session = beginEventCinematicAction(cinematicMode);
    await waitEventMilliseconds(session?.delay);

    // L'action ne part jamais immédiatement après l'entrée de son écran
    // cinématique : ce temps de respiration rend l'enchaînement plus doux.
    await waitEventMilliseconds(eventCinematicActionSafetyDelay(cinematicMode));
    return session;
  }
  return null;
}

function finishTerminalActionNode(eventDefinition, node) {
  if (node.endEvent === 'finished') {
    return finishEvent(eventDefinition.key, {
      endedByActionNode: true,
      completedActionNodeId: node.id
    });
  }
  if (node.endEvent === true || node.endEvent === 'failed') {
    return failEvent(eventDefinition.key, {
      endedByActionNode: true,
      failedActionNodeId: node.id,
      failureReason: 'action_node_end'
    });
  }
  return getStoredEventState(eventDefinition.key);
}

async function completeActionNodeUnlocked(eventDefinition, node, state = null) {
  const currentState = state || getStoredEventState(eventDefinition.key);
  if (!currentState || currentState.currentNodeId !== node.id) return false;

  if (node.next) {
    return moveEventToNodeUnlocked(eventDefinition, node.id, node.next);
  }
  return finishTerminalActionNode(eventDefinition, node);
}

async function resolveActionNode(eventDefinition, node, initialState) {
  const eventKey = eventDefinition.key;
  const pendingKey = `${eventKey}:${node.id}`;
  if (pendingActionNodeResolutions.has(pendingKey)) {
    return pendingActionNodeResolutions.get(pendingKey);
  }

  const resolution = (async () => {
    let latestState = getStoredEventState(eventKey) || initialState;
    if (!latestState || latestState.currentNodeId !== node.id) return latestState;
    if (latestState.actionNodeState?.status === 'resolved') {
      return completeActionNodeUnlocked(eventDefinition, node, latestState);
    }

    const actionDefinition = actionNodeDefinition(node);
    const actionName = getChoiceActionName(actionDefinition);
    const executionId = actionNodeExecutionId(node, actionDefinition);
    const executedActions = Array.isArray(latestState.executedActions)
      ? latestState.executedActions
      : [];
    eventActionScreenDepth += 1;
    try {
      const cinematicActionSession = await enterEventActionScreen(node);
      let actionOutput = null;
      try {
        if (!executedActions.includes(executionId)) {
          updateQuestState((quest) => {
            const stored = quest.inProgress[eventKey];
            if (!stored || stored.currentNodeId !== node.id) return quest;
            const reservedActions = Array.isArray(stored.executedActions)
              ? [...stored.executedActions]
              : [];
            if (!reservedActions.includes(executionId)) reservedActions.push(executionId);
            latestState = {
              ...stored,
              executedActions: reservedActions,
              currentNodeType: 'action',
              actionNodeState: {
                nodeId: node.id,
                actions: actionNodeDefinitions(node).map(getChoiceActionName),
                executionId,
                status: 'running',
                startedAt: nowIso()
              },
              updatedAt: nowIso()
            };
            quest.inProgress[eventKey] = latestState;
            return quest;
          });
          syncEventStateToStage(eventKey, latestState);

          try {
            actionOutput = await executeEventAction(eventKey, actionDefinition, {
              eventKey,
              executionId,
              node,
              state: latestState,
              levelId: latestState.levelId
            });
          } catch (error) {
            updateQuestState((quest) => {
              const stored = quest.inProgress[eventKey];
              if (!stored) return quest;
              const retryableActions = Array.isArray(stored.executedActions)
                ? stored.executedActions.filter((candidate) => candidate !== executionId)
                : [];
              latestState = {
                ...stored,
                executedActions: retryableActions,
                actionNodeState: {
                  ...(stored.actionNodeState || {}),
                  status: 'failed',
                  failedAt: nowIso()
                },
                lastActionError: {
                  executionId,
                  action: actionName,
                  message: String(error?.message || error),
                  failedAt: nowIso()
                },
                updatedAt: nowIso()
              };
              quest.inProgress[eventKey] = latestState;
              return quest;
            });
            syncEventStateToStage(eventKey, latestState);
            throw error;
          }
        }
      } finally {
        try {
          await restoreEventCinematicAfterAction(cinematicActionSession);
        } catch (error) {
          console.error(
            `[Events] Restauration cinématique après l’écran action ${node.id} impossible.`,
            error
          );
        }
      }

      updateQuestState((quest) => {
        const stored = quest.inProgress[eventKey];
        if (!stored || stored.currentNodeId !== node.id) return quest;
        const storedActions = Array.isArray(stored.executedActions)
          ? [...stored.executedActions]
          : [];
        if (!storedActions.includes(executionId)) storedActions.push(executionId);
        const results = collectActionResults(actionOutput, actionName, executionId);
        const storedResults = Array.isArray(stored.eventResults)
          ? [...stored.eventResults]
          : [];
        for (const result of results) {
          if (!storedResults.some((candidate) => (
            storedEventResultIdentity(candidate) === storedEventResultIdentity(result)
          ))) storedResults.push(result);
        }
        latestState = {
          ...stored,
          executedActions: storedActions,
          eventResults: storedResults,
          actionNodeState: {
            nodeId: node.id,
            actions: actionNodeDefinitions(node).map(getChoiceActionName),
            executionId,
            status: 'resolved',
            appliedAt: nowIso()
          },
          lastActionError: null,
          updatedAt: nowIso()
        };
        quest.inProgress[eventKey] = latestState;
        return quest;
      });
      syncEventStateToStage(eventKey, latestState);

      return completeActionNodeUnlocked(eventDefinition, node, latestState);
    } finally {
      eventActionScreenDepth = Math.max(0, eventActionScreenDepth - 1);
    }
  })().finally(() => {
    pendingActionNodeResolutions.delete(pendingKey);
  });

  pendingActionNodeResolutions.set(pendingKey, resolution);
  return resolution;
}

async function resolveSelectedChoice(eventDefinition, node, choice, initialState) {
  let latestState = await finalizeSelectedChoice(eventDefinition, node, choice) || initialState;
  if (choice.startsCombat === true) {
    latestState = battleEventInPause(eventDefinition.key) || latestState;
  }
  return latestState;
}

function moveEventTo(eventKey, destination, details = {}) {
  let finalState = null;
  updateQuestState((quest) => {
    const current = quest.inProgress[eventKey];
    if (!current) return quest;

    finalState = {
      ...current,
      ...details,
      status: destination,
      completedAt: nowIso(),
      updatedAt: nowIso()
    };
    quest[destination][eventKey] = finalState;
    delete quest.inProgress[eventKey];
    if (quest.activeEventKey === eventKey) quest.activeEventKey = null;
    return quest;
  });

  if (finalState) {
    syncEventStateToStage(eventKey, finalState, destination);
    closeDialogue({ remove: true });

    // Retour fluide au palier de jeu normal dès que l'event quitte inProgress.
    restoreParallaxViewAndControls();

    /*
     * FIN D'ÉVÉNEMENT = interfaces obligatoirement restaurées.
     *
     * restoreAllInterface() est idempotente : si une interface existe déjà,
     * elle n'est pas recréée.
     */
    restoreAllInterface().catch((error) => {
      console.error(
        `[Events] Impossible de restaurer les interfaces après la fin de l'événement ${eventKey}.`,
        error
      );
    });
  }

  return finalState;
}

export function finishEvent(eventKey, details = {}) {
  return moveEventTo(eventKey, 'finished', details);
}

export function failEvent(eventKey, details = {}) {
  return moveEventTo(eventKey, 'failed', details);
}

export async function restoreOrStartEvents({
  levelId = activeLevelId || getCurrentLevel()
} = {}) {
  activeLevelId = levelId == null ? null : String(levelId);
  const quest = loadQuestState();

  if (quest.activeEventKey) {
    const eventDefinition = resolveEventDefinition(quest.activeEventKey);
    const storedState = quest.inProgress?.[quest.activeEventKey];
    if (
      eventDefinition
      && storedState
      && String(storedState.levelId ?? '') === String(activeLevelId ?? '')
    ) {
      syncEventStateToStage(quest.activeEventKey, storedState);

      // Priorité absolue : un événement déjà passé en combat n'est plus un
      // dialogue, même s'il reste activeEventKey/inProgress pour son suivi.
      if (isBattleEventInPause(storedState)) {
        battleEventInPause(quest.activeEventKey);
        return null;
      }

      if (storedState.selectedChoiceId) {
        const node = validateNode(eventDefinition, storedState.currentNodeId);
        const choice = (node.choices || []).find(
          (candidate) => String(candidate.id) === String(storedState.selectedChoiceId)
        );
        if (choice) {
          try {
            const resolution = ensureChoiceResolution(
              eventDefinition,
              choice,
              storedState
            );
            const resolvedChoice = resolution.choice;
            await resolveSelectedChoice(
              eventDefinition,
              node,
              resolvedChoice,
              resolution.state
            );
            return null;
          } catch (error) {
            console.error('[Events] Reprise de l’action du choix impossible.', error);
          }
        }
      }
      return renderStoredEvent(eventDefinition, storedState);
    }
    return null;
  }

  const playerInfo = loadPlayerInfo();
  for (const eventDefinition of getRuntimeEventDefinitions()) {
    if (quest.finished[eventDefinition.key] || quest.failed[eventDefinition.key]) continue;
    const canStart = typeof eventDefinition.canStart === 'function'
      ? await eventDefinition.canStart({ playerInfo, levelId: activeLevelId })
      : false;
    if (canStart) return startEvent(eventDefinition, { levelId: activeLevelId });
  }

  await closeEventCinematic();
  return null;
}

function handlePlayerInfoUpdated(event) {
  if (!eventsInitialized || event?.detail?.key === 'quest') return;
  const updatedKey = event?.detail?.key;
  if (
    updatedKey
    && !getRuntimeEventDefinitions().some(
      (definition) => definition.watchedPlayerInfoKeys?.includes(updatedKey)
    )
  ) {
    return;
  }
  void restoreOrStartEvents({ levelId: activeLevelId });
}

export async function initializeEvents({
  levelId = getCurrentLevel(),
  runtime = null
} = {}) {
  if (runtime) configureEventRuntime(runtime);
  activeLevelId = levelId == null ? null : String(levelId);

  if (!eventsInitialized) {
    window.addEventListener('playerInfoUpdated', handlePlayerInfoUpdated);
    window.addEventListener('armyBRendered', () => {
      scheduleDestroyedCorpseMarkerRender(activeLevelId);
    });
    window.addEventListener('stageChestsLoaded', (event) => {
      scheduleDestroyedCorpseMarkerRender(
        event?.detail?.stageId ?? activeLevelId
      );
    });
    eventsInitialized = true;
  }

  scheduleDestroyedCorpseMarkerRender(activeLevelId);

  return restoreOrStartEvents({ levelId: activeLevelId });
}
