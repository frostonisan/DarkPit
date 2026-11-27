import { gameStorage as localStorage } from './sessionStorage.js';
import { generateUniqueID } from "../entities/runtime.js";
import { getOrCreateWorldMapID, initializeArmyConfig, ResetGameStages, ResetEntitesB, ResetXp, ResetGameDay, detectPageReload } from "../ui/application.js";
import { resetStoredArmorCurrentToMax } from "./entityStorage.js";
import { StopGame } from "../app/state.js";
import { updateExperienceDisplay } from "../ui/codex/stats.js";
import { serializeChangedJSONFields } from "./jsonFields.js";

export const PLAYER_INFO_STORAGE_KEY = 'playerInfo.json';

export function getAdminSettings() {
    const gameId = localStorage.getItem('currentGameID');
    const game = gameId ? loadFromLocalStorage(gameId, {}) : null;
    const state = game?.adminSettings || loadFromLocalStorage('proceduralAdmin', {});
    return { enabled: state?.enabled === true, experience: Math.max(0, Math.min(1000000000000,
        Number(state?.experience ?? 1000000000000) || 0)) };
}

export function isAdminMode() {
    return getAdminSettings().enabled;
}

function persistAdminSettings(state) {
    saveToLocalStorage('proceduralAdmin', state);
    const gameId = localStorage.getItem('currentGameID');
    if (gameId) {
        const game = loadFromLocalStorage(gameId, {});
        game.adminSettings = state;
        saveToLocalStorage(gameId, game);
    }
}

export function setAdminMode(enabled) {
    const state = { ...getAdminSettings(), enabled: enabled === true };
    persistAdminSettings(state);
    document.documentElement.classList.toggle('admin-mode-enabled', state.enabled);
    document.querySelectorAll('[data-admin-power]').forEach(node => { node.hidden = !state.enabled; });
    document.querySelectorAll('[data-leveltype="admin"]').forEach(node => { node.hidden = !state.enabled; });
    if (!state.enabled) {
        window.__adminInvincibleMode = false;
        localStorage.setItem('DarkPitAdminInvincibleMode', 'false');
    }
    window.dispatchEvent(new CustomEvent('adminModeChanged', { detail: state }));
    return state;
}

export function getNormalPlayerExperience() {
    const stored = loadFromLocalStorage('playerExperience', 0);
    return Math.max(0, Number(typeof stored === 'object' ? stored?.experience : stored) || 0);
}

export function getAvailablePlayerExperience() {
    const admin = getAdminSettings();
    return getNormalPlayerExperience() + (admin.enabled ? admin.experience : 0);
}

export function spendPlayerExperience(amount) {
    const cost = Number(amount);
    if (!Number.isFinite(cost) || cost < 0 || cost > getAvailablePlayerExperience()) return null;
    const state = getAdminSettings();
    const admin = state.enabled ? Math.min(cost, state.experience) : 0;
    const normal = cost - admin;
    if (admin) persistAdminSettings({ ...state, experience: state.experience - admin });
    saveToLocalStorage('playerExperience', getNormalPlayerExperience() - normal);
    window.dispatchEvent(new CustomEvent('playerWalletChanged'));
    return { normal, admin };
}

export function creditPlayerExperience(amount, { admin = false } = {}) {
    const gain = Math.max(0, Number(amount) || 0);
    if (!Number.isFinite(gain)) return getAvailablePlayerExperience();
    if (admin) {
        const state = getAdminSettings();
        persistAdminSettings({ ...state, experience: Math.min(1000000000000, state.experience + gain) });
    } else saveToLocalStorage('playerExperience', getNormalPlayerExperience() + gain);
    window.dispatchEvent(new CustomEvent('playerWalletChanged'));
    return getAvailablePlayerExperience();
}

function cloneQuestValue(value) {
    try {
        return structuredClone(value);
    } catch {
        return JSON.parse(JSON.stringify(value));
    }
}

function normalizeQuestBucket(bucket) {
    return bucket && typeof bucket === 'object' && !Array.isArray(bucket)
        ? { ...bucket }
        : {};
}

export function normalizeQuestState(quest) {
    const source = quest && typeof quest === 'object' && !Array.isArray(quest)
        ? quest
        : {};

    return {
        ...source,
        version: Number.isInteger(source.version) && source.version > 0
            ? source.version
            : 1,
        activeEventKey: typeof source.activeEventKey === 'string' && source.activeEventKey
            ? source.activeEventKey
            : null,
        inProgress: normalizeQuestBucket(source.inProgress),
        finished: normalizeQuestBucket(source.finished),
        failed: normalizeQuestBucket(source.failed),
    };
}

export function loadPlayerInfo() {
    const playerInfo = loadFromLocalStorage(PLAYER_INFO_STORAGE_KEY, {});
    const normalized = playerInfo && typeof playerInfo === 'object' && !Array.isArray(playerInfo)
        ? { ...playerInfo }
        : {};

    normalized.quest = normalizeQuestState(normalized.quest);
    normalized.battleSlotCount = Math.max(0, Math.min(24, Math.floor(Number(normalized.battleSlotCount ?? 4)) || 0));
    return normalized;
}

export function savePlayerInfo(playerInfo, { updatedKey = 'playerInfo' } = {}) {
    const previous = loadFromLocalStorage(PLAYER_INFO_STORAGE_KEY, {});
    const incoming = playerInfo && typeof playerInfo === 'object' && !Array.isArray(playerInfo)
        ? playerInfo
        : {};
    const nextPlayerInfo = {
        ...(previous && typeof previous === 'object' ? previous : {}),
        ...incoming,
        battleSlotCount: Math.max(0, Math.min(24, Math.floor(Number(incoming.battleSlotCount ?? previous?.battleSlotCount ?? 4)) || 0)),
        quest: normalizeQuestState(incoming.quest ?? previous?.quest),
    };

    saveToLocalStorage(PLAYER_INFO_STORAGE_KEY, nextPlayerInfo);
    window.dispatchEvent(new CustomEvent('playerInfoUpdated', {
        detail: {
            key: updatedKey,
            playerInfo: cloneQuestValue(nextPlayerInfo),
        },
    }));

    return nextPlayerInfo;
}

export function loadQuestState() {
    return normalizeQuestState(loadPlayerInfo().quest);
}

export function updateQuestState(updateFunction) {
    if (typeof updateFunction !== 'function') {
        throw new TypeError('updateQuestState attend une fonction de mise à jour.');
    }

    const playerInfo = loadPlayerInfo();
    const draft = cloneQuestValue(normalizeQuestState(playerInfo.quest));
    const returnedState = updateFunction(draft, playerInfo);
    playerInfo.quest = normalizeQuestState(returnedState ?? draft);

    return savePlayerInfo(playerInfo, { updatedKey: 'quest' }).quest;
}


const CHEST_STORAGE_TRACE_PREFIX = '[CHEST STORAGE]';

function storageTrace(level, message, payload = {}) {
    const method = console[level] ? level : 'log';
    console[method](`${CHEST_STORAGE_TRACE_PREFIX} ${message}`, payload);
}

function createStorageTraceId(chestId, action) {
    const randomPart = globalThis.crypto?.randomUUID?.().slice(0, 8)
        ?? Math.random().toString(36).slice(2, 10);
    return `${String(chestId || 'unknown')}::${action}::${Date.now()}::${randomPart}`;
}

function summarizeStoredChest(chest) {
    return {
        id: chest?.id ?? null,
        level: chest?.level ?? null,
        statut: chest?.statut ?? null,
        openedAt: chest?.openedAt ?? null,
        updatedAt: chest?.updatedAt ?? null,
        counts: {
            entities: Array.isArray(chest?.loot?.entities) ? chest.loot.entities.length : 0,
            stuff: Array.isArray(chest?.loot?.stuff) ? chest.loot.stuff.length : 0,
            consommables: Array.isArray(chest?.loot?.consommables) ? chest.loot.consommables.length : 0,
        },
        lootInstanceIds: ['entities', 'stuff', 'consommables'].flatMap(category =>
            (Array.isArray(chest?.loot?.[category]) ? chest.loot[category] : [])
                .map(entry => entry?.lootInstanceId ?? null)
                .filter(Boolean)
        ),
    };
}

export function gainExperience(amount) {
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
        console.warn(`❌ XP invalide : ${amount}`);
        return;
    }

    creditPlayerExperience(amount);
    const currentXP = getNormalPlayerExperience();
    console.log(`✨ Gagné ${amount} XP ! Total : ${currentXP}`);

    updateExperienceDisplay();
    saveCurrentGameData();
}


export function resetFullGame() {
    // End the old fight before clearing its world. This also invalidates the
    // paused checkpoint, so the ensuing reload cannot resurrect that fight.
    StopGame();
    sessionStorage.removeItem('globalGameOverScreen');
    const previousGameID = localStorage.getItem('currentGameID');
    if (previousGameID) {
        localStorage.removeItem(previousGameID);
    }

    clearAllGameData(); 
	resetCurrentLevel();
	clearAllGameData();
    const newGameID = getOrCreateGameID();
    console.log(`🆕 Nouvelle partie initialisée avec ID : ${newGameID}`);

    initializeArmyConfig();
    ResetGameStages();
    ResetEntitesB();
    ResetXp();
	ResetGameDay();
    return newGameID;
}

export function clearAllGameData() {
  const keysToRemove = [
        'currentGameID',
        'worldmap_id',
        'selectedArmyA',
        'armyAConfig',
        'playerExperience',
        'GameStages',
        'ArmyB',
        'gameData',
        'playerInfo.json',
        'PlayerSave',
        'Playerinventory',      
        'equippedItems',
		'IngameItems',
        'ChestLoot',
        'EntityLoot',
		'CodexMenuIndex',
		'CodexSubmenuIndex',
		'CodexFocusedAttacks'
    ];

    keysToRemove.forEach(key => {
        localStorage.removeItem(key);
    });

    console.log("🧹 Toutes les données du joueur ont été nettoyées (clearAllGameData).");
}


export function getOrCreateGameID() {
    let currentGameID = localStorage.getItem('currentGameID');

    if (!currentGameID) {
        const newGameID = generateUniqueID(); // utilise déjà ta logique d'unicité
        currentGameID = `Game_${newGameID}`;
        localStorage.setItem('currentGameID', currentGameID);
    }

    return currentGameID;
}

/*
 * Préférence globale d'affichage des hexagones.
 *
 * La sauvegarde Game_XXXX est la source prioritaire. Les anciens joueurs qui
 * ne possèdent pas encore cette propriété reçoivent automatiquement `false`.
 */
export function getVisibleHexes() {
    const currentGameID = getOrCreateGameID();
    const gameObject = loadFromLocalStorage(currentGameID, {});

    if (typeof gameObject?.visibleHexes === 'boolean') {
        return gameObject.visibleHexes;
    }

    const playerSave = loadFromLocalStorage('PlayerSave', {});
    if (typeof playerSave?.visibleHexes === 'boolean') {
        return setVisibleHexes(playerSave.visibleHexes);
    }

    const gameData = loadFromLocalStorage('gameData', {});
    if (typeof gameData?.visibleHexes === 'boolean') {
        return setVisibleHexes(gameData.visibleHexes);
    }

    // Migration automatique des anciennes sauvegardes : la propriété est
    // réellement ajoutée au JSON dès le premier chargement d'un stage.
    return setVisibleHexes(false);
}

/*
 * Modifie la préférence du joueur et la rend immédiatement exploitable par
 * tous les stages et tous les modules.
 */
export function setVisibleHexes(value) {
    const visibleHexes = value === true;
    const currentGameID = getOrCreateGameID();
    const now = new Date().toISOString();

    const gameObject = loadFromLocalStorage(currentGameID, {});
    saveToLocalStorage(currentGameID, {
        ...gameObject,
        game_id: currentGameID,
        visibleHexes,
        lastUpdated: now,
    });

    const playerSave = loadFromLocalStorage('PlayerSave', {});
    saveToLocalStorage('PlayerSave', {
        ...playerSave,
        game_id: currentGameID,
        visibleHexes,
        lastUpdated: now,
    });

    const gameData = loadFromLocalStorage('gameData', {
        gameIDs: [],
        scriptedLevels: [],
        randomLevels: [],
    });
    saveToLocalStorage('gameData', {
        ...gameData,
        visibleHexes,
        lastUpdated: now,
    });

    window.dispatchEvent(new CustomEvent('visibleHexesChanged', {
        detail: { visibleHexes },
    }));

    return visibleHexes;
}

export function saveCurrentGameData() {
    const currentGameID = getOrCreateGameID();
    const worldMapID = getOrCreateWorldMapID();

    const playerID = parseInt(
        String(currentGameID).split('_')[1],
        10
    );

    if (Number.isNaN(playerID)) {
        console.error(
            `❌ Impossible d'extraire le playerID depuis "${currentGameID}".`
        );
        return;
    }

    /*
     * Chargement des données globales du jeu.
     */
    const parsed = loadFromLocalStorage("gameData", {
        gameIDs: [],
        scriptedLevels: [],
        randomLevels: [],
    });

    /*
     * Sécurisation des tableaux.
     */
    parsed.gameIDs = Array.isArray(parsed.gameIDs)
        ? parsed.gameIDs
        : [];

    parsed.scriptedLevels = Array.isArray(parsed.scriptedLevels)
        ? parsed.scriptedLevels
        : [];

    parsed.randomLevels = Array.isArray(parsed.randomLevels)
        ? parsed.randomLevels
        : [];

    /*
     * Chargement des données courantes.
     */
const experienceData = loadFromLocalStorage(
    'playerExperience',
    0
);

const playerXP =
    typeof experienceData === 'object'
        ? Number(experienceData?.experience) || 0
        : Number(experienceData) || 0;
    const currentLevel = getCurrentLevel();

    const storedGameDay = parseInt(
        localStorage.getItem("gameDay"),
        10
    );

    const gameDay = Number.isNaN(storedGameDay)
        ? 1
        : storedGameDay;

    const codexMenuIdx =
        typeof getCodexMenuIndex === "function"
            ? getCodexMenuIndex()
            : loadFromLocalStorage("CodexMenuIndex", 1);

    const codexSubIdx =
        typeof getCodexSubmenuIndex === "function"
            ? getCodexSubmenuIndex()
            : loadFromLocalStorage("CodexSubmenuIndex", 1);

    const now = new Date().toISOString();

    /*
     * Ajout des identifiants connus.
     */
    if (!parsed.gameIDs.includes(playerID)) {
        parsed.gameIDs.push(playerID);

        console.log(
            `📌 Ajout de l’ID joueur ${playerID} à la liste des parties connues.`
        );
    }

    /*
     * worldMapID peut être une chaîne structurée.
     * On évite d'ajouter NaN dans gameIDs.
     */
    const numericWorldMapID = parseInt(worldMapID, 10);

    if (
        !Number.isNaN(numericWorldMapID) &&
        !parsed.gameIDs.includes(numericWorldMapID)
    ) {
        parsed.gameIDs.push(numericWorldMapID);

        console.log(
            `🌍 Ajout du worldmap_id ${numericWorldMapID} à la liste des parties connues.`
        );
    }

    parsed.experience = playerXP;
    parsed.adminSettings = getAdminSettings();
    parsed.visibleHexes = getVisibleHexes();
    parsed.lastUpdated = now;

    /*
     * Sauvegarde spécifique à la partie Game_XXXX.
     */
    const previousGameObject = loadFromLocalStorage(
        currentGameID,
        {}
    );

    const gameObject = {
        ...previousGameObject,

        player_id: playerID,
        game_id: currentGameID,
        adminSettings: parsed.adminSettings,
        lastUpdated: now,

        gameIDs: [...parsed.gameIDs],
        scriptedLevels: [...parsed.scriptedLevels],
        randomLevels: [...parsed.randomLevels],

        worldmap_id: worldMapID,
        gameDay,
        currentLevel,
        visibleHexes: parsed.visibleHexes,

        codexMenu: [Number(codexMenuIdx) || 1],
        codexSubMenu: [Number(codexSubIdx) || 1],
    };

    saveToLocalStorage(currentGameID, gameObject);

    console.log(
        `✅ Données sauvegardées dans ${currentGameID} ` +
        `(gameDay = ${gameDay}).`
    );

    /*
     * Sauvegarde globale gameData.
     */
    saveToLocalStorage("gameData", parsed);

    console.log("✅ gameData global mis à jour.");

    /*
     * IMPORTANT :
     * On récupère le PlayerSave existant avant la sauvegarde.
     *
     * Cela empêche la disparition de :
     * - Playerinventory
     * - equippedItems
     * - items
     * - statistiques
     * - quêtes
     * - données ajoutées par d'autres systèmes
     */
    const previousPlayerSave = loadFromLocalStorage(
        "PlayerSave",
        {}
    );

    const existingInventory = Array.isArray(
        previousPlayerSave.Playerinventory
    )
        ? previousPlayerSave.Playerinventory
        : [];

    const existingEquippedItems = normalizeEquippedItems(
        previousPlayerSave.equippedItems
    );

    const existingItems = Array.isArray(
        previousPlayerSave.items
    )
        ? previousPlayerSave.items
        : [];

    /*
     * Sauvegarde complète PlayerSave.
     *
     * Le spread doit être placé en premier :
     * les valeurs courantes remplacent ensuite uniquement
     * les propriétés qui doivent réellement être actualisées.
     */
    const fullSave = {
        ...previousPlayerSave,

        game_id: currentGameID,
        player_id: playerID,
        experience: playerXP,
        adminSettings: parsed.adminSettings,
        lastUpdated: now,

        worldmap_id: worldMapID,
        gameDay,
        currentLevel,
        visibleHexes: parsed.visibleHexes,

        gameIDs: [...parsed.gameIDs],
        scriptedLevels: [...parsed.scriptedLevels],
        randomLevels: [...parsed.randomLevels],

        codexMenu: [Number(codexMenuIdx) || 1],
        codexSubMenu: [Number(codexSubIdx) || 1],

        Playerinventory: existingInventory,
        equippedItems: existingEquippedItems,
        items: existingItems,
    };

    saveToLocalStorage("PlayerSave", fullSave);

    console.log(
        `💾 Sauvegarde complète enregistrée dans PlayerSave ` +
        `(gameDay = ${gameDay}, ` +
        `inventaire = ${existingInventory.length}, ` +
        `équipés = ${existingEquippedItems.length}).`
    );

    /*
     * Retour utile pour les appels qui souhaitent contrôler
     * ou exploiter le résultat de la sauvegarde.
     */
    return fullSave;
}
export function saveItemsData() {
    const ingameItems = loadFromLocalStorage('IngameItems', []);

    const playerSave = loadFromLocalStorage('PlayerSave', {
        Playerinventory: [],
        equippedItems: []
    });

    const playerInventory = Array.isArray(playerSave.Playerinventory)
        ? playerSave.Playerinventory
        : [];

    const equippedItems = normalizeEquippedItems(playerSave.equippedItems);

    const itemsSave = {
        ItemsIDs: ingameItems.map(item => item.itemId),
        Playerinventory: playerInventory,
        equippedItems: equippedItems,
        battleSlots: playerSave.battleSlots || [],
        battleGroundItems: playerSave.battleGroundItems || [],
        items: ingameItems
    };

    saveToLocalStorage('IngameItemsData', itemsSave);

    console.log(
        '💾 Données objets sauvegardées dans IngameItemsData.'
    );
}

export function normalizeEquippedItems(rawEquippedItems = loadFromLocalStorage('equippedItems', [])) {
    if (!Array.isArray(rawEquippedItems)) return [];

    const byEquippedId = new Map();

    for (const rawItem of rawEquippedItems) {
        if (!rawItem || typeof rawItem !== 'object') continue;

        const { itemId, equippedId } = rawItem;
        if (typeof itemId !== 'string') continue;
        if (typeof equippedId !== 'string' || !equippedId.startsWith('e')) continue;

        byEquippedId.set(equippedId, {
            ...rawItem,
            itemId,
            equippedId,
        });
    }

    return [...byEquippedId.values()];
}

function mergeEquippedItemSources(...sources) {
    const byEquippedId = new Map();

    for (const source of sources) {
        normalizeEquippedItems(source).forEach(item => {
            byEquippedId.set(item.equippedId, item);
        });
    }

    return [...byEquippedId.values()];
}

function equippedItemsStorageSignature(rawEquippedItems) {
    return JSON.stringify(normalizeEquippedItems(rawEquippedItems));
}

function shouldSyncEquippedBucket(bucket) {
    return Boolean(
        bucket &&
        typeof bucket === 'object' &&
        !Array.isArray(bucket) &&
        (
            Array.isArray(bucket.equippedItems) ||
            Array.isArray(bucket.Playerinventory) ||
            Array.isArray(bucket.items)
        )
    );
}

function notifyEquippedItemsUpdated(action, detail = {}) {
    if (typeof window === 'undefined') return;

    const eventDetail = {
        action,
        ...detail,
    };

    window.dispatchEvent(new CustomEvent('equippedItemsUpdated', {
        detail: eventDetail,
    }));

    window.dispatchEvent(new CustomEvent('inventoryItemsUpdated', {
        detail: {
            source: 'equipped-items',
            ...eventDetail,
        },
    }));
}

export function loadEquippedItems() {
    const rawEquippedItems = loadFromLocalStorage('equippedItems', []);
    const playerSave = loadFromLocalStorage('PlayerSave', {});
    const ingameItemsData = loadFromLocalStorage('IngameItemsData', {});
    const equippedItems = mergeEquippedItemSources(
        rawEquippedItems,
        playerSave?.equippedItems,
        ingameItemsData?.equippedItems
    );
    const signature = JSON.stringify(equippedItems);

    if (!Array.isArray(rawEquippedItems) || equippedItemsStorageSignature(rawEquippedItems) !== signature) {
        saveToLocalStorage('equippedItems', equippedItems);
    }

    if (shouldSyncEquippedBucket(playerSave) && equippedItemsStorageSignature(playerSave.equippedItems) !== signature) {
        playerSave.equippedItems = equippedItems;
        saveToLocalStorage('PlayerSave', playerSave);
    }

    if (shouldSyncEquippedBucket(ingameItemsData) && equippedItemsStorageSignature(ingameItemsData.equippedItems) !== signature) {
        ingameItemsData.equippedItems = equippedItems;
        saveToLocalStorage('IngameItemsData', ingameItemsData);
    }

    return equippedItems;
}

export function getEquippedItemsById(rawEquippedItems = loadEquippedItems()) {
    return normalizeEquippedItems(rawEquippedItems).reduce((acc, item) => {
        if (item?.equippedId) acc[item.equippedId] = item;
        return acc;
    }, {});
}

export function getEquippedItemById(equippedId, rawEquippedItems = loadEquippedItems()) {
    if (!equippedId || typeof equippedId !== 'string') return null;
    if (!equippedId.startsWith('e')) return null;

    return getEquippedItemsById(rawEquippedItems)[equippedId] || null;
}

export function loadItemsData({ importSnapshot = false } = {}) {
    // Runtime locations belong to PlayerSave; IngameItemsData is an export projection.
    if (!importSnapshot) {
        saveItemsData();
        return;
    }
    const data = loadFromLocalStorage('IngameItemsData', null);

    if (!data) {
        console.warn(
            '❌ Aucune donnée IngameItemsData trouvée.'
        );

        return;
    }

    saveToLocalStorage(
        'IngameItems',
        Array.isArray(data.items) ? data.items : []
    );

    const playerSave = loadFromLocalStorage('PlayerSave', {
        Playerinventory: [],
        equippedItems: []
    });

    playerSave.Playerinventory = Array.isArray(data.Playerinventory)
        ? data.Playerinventory
        : [];

    playerSave.equippedItems = normalizeEquippedItems(data.equippedItems);
    playerSave.battleSlots = Array.isArray(data.battleSlots) ? data.battleSlots : [];
    playerSave.battleGroundItems = Array.isArray(data.battleGroundItems) ? data.battleGroundItems : [];

    saveToLocalStorage('PlayerSave', playerSave);

    console.log(
        '📦 Données objets restaurées depuis IngameItemsData vers PlayerSave.'
    );
}
function isInLevelType(t) {
  return t === 'scripted' || t === 'randomized' || t === 'admin';
}

function getStageTypeById(stageId) {
  const stages = JSON.parse(localStorage.getItem('GameStages'))?.stages || [];
  const s = stages.find(x => String(x.id) === String(stageId));
  return s?.level_type || null;
}

export function loadCurrentGameData() {
  const currentGameID = localStorage.getItem('currentGameID');
  if (!currentGameID) return null;

  const gameDataRaw = localStorage.getItem(currentGameID);
  if (!gameDataRaw) return null;

  let gameData;
  try {
    gameData = JSON.parse(gameDataRaw);
  } catch (e) {
    console.error("❌ Erreur lors du parsing de la sauvegarde.");
    return null;
  }

  const worldmap_id = gameData.worldmap_id;
  const existingCurrentLevel = getCurrentLevel(); // string ou null

  // ✅ Déterminer si on est déjà "dans un niveau" (y compris admin)
  const existingType = existingCurrentLevel ? getStageTypeById(existingCurrentLevel) : null;

  // Priorité: window.levelRunning si déjà défini, sinon type du stage courant
  const runningType = window.levelRunning || existingType || null;

  const inLevelNow = isInLevelType(runningType);

  // ✅ Si on est dans un niveau en cours => on ne touche à rien (et donc on ne “perd” pas l’admin UI)
  if (inLevelNow) {
    // (optionnel mais utile) recoller le levelRunning si absent
    if (!window.levelRunning && existingType) window.levelRunning = existingType;

    console.log(`🧷 Niveau en cours détecté (${runningType}) -> currentLevel conservé : ${existingCurrentLevel}`);
    return gameData;
  }

  // ─────────────────────────────────────────────
  // Ici seulement, on autorise la bascule vers la worldmap
  // ─────────────────────────────────────────────
  if (worldmap_id) {
    if (detectPageReload()) {
      console.log("🔄 Détection : RELOAD de la page.");
      if (!existingCurrentLevel || String(existingCurrentLevel) === String(worldmap_id)) {
        setCurrentLevel(worldmap_id);
        console.log(`📌 currentLevel défini (reload) : ${worldmap_id}`);
      } else {
        console.log(`⛔ Reload détecté - Conservation de l'ancien currentLevel : ${existingCurrentLevel}`);
      }
    } else {
      console.log("✅ Détection : navigation normale.");
      setCurrentLevel(worldmap_id);
      console.log(`📌 currentLevel défini (navigation) : ${worldmap_id}`);
    }
  }

  const currentLevel = getCurrentLevel();
  if (currentLevel) console.log(`🔁 Reprise du level/worldmap ID : ${currentLevel}`);

  // (optionnel) si on vient de forcer la worldmap :
  window.levelRunning = 'worldmap';

  return gameData;
}

export function getOrCreateGameData() {
    const storedData = localStorage.getItem("gameData");
    let gameData;

    if (storedData) {
        try {
            gameData = JSON.parse(storedData);
            // Initialise les tableaux si absents
            gameData.scriptedLevels = gameData.scriptedLevels || [];
            gameData.randomLevels = gameData.randomLevels || [];
            gameData.gameIDs = gameData.gameIDs || [];
        } catch (e) {
            console.error("❌ Erreur parsing gameData, réinitialisation.");
            gameData = {
                lastUpdated: new Date().toISOString(),
                gameIDs: [],
                scriptedLevels: [],
                randomLevels: []
            };
        }
    } else {
        gameData = {
            experience: 0,
            lastUpdated: new Date().toISOString(),
            gameIDs: [],
            scriptedLevels: [],
            randomLevels: []
        };
    }

    localStorage.setItem("gameData", JSON.stringify(gameData));
    return gameData;
}
// Définit le niveau ou la worldmap courante
export function setCurrentLevel(id) {
    localStorage.setItem('currentLevel', String(id));
    console.log(`📌 currentLevel défini sur : ${id}`);
}

// Récupère l'ID du niveau ou de la worldmap actuelle
export function getCurrentLevel() {
    return localStorage.getItem('currentLevel') || null;
}

// Réinitialise (supprime) l'info du niveau courant
export function resetCurrentLevel() {
    localStorage.removeItem('currentLevel');
    console.log(`🧹 currentLevel supprimé.`);
}

// STORAGE ARMY A
// Activation ou désactivation du localStorage
export var localStorageEnabled = true;

// Fonction pour sauvegarder l'entité mise à jour dans le localStorage
export function saveUpgradedEntity(entite) {
    const selectedArmy = loadFromLocalStorage('selectedArmyA', []);
    const index = selectedArmy.findIndex(e => String(e?.id) === String(entite?.id));

    if (index !== -1) {
        selectedArmy[index] = entite;
    } else {
        selectedArmy.push(entite);
    }

    saveToLocalStorage('selectedArmyA', selectedArmy);
    if (typeof window !== 'undefined') {
        window.selectedArmyA = selectedArmy;
        window.dispatchEvent(new CustomEvent('selectedArmyAUpdated', {
            detail: {
                source: 'saveUpgradedEntity',
                entityId: entite?.id,
                entite,
            },
        }));
    }

    // 🧾 Affichage console de l'entité sauvegardée
    console.log(`✅ Entité sauvegardée :`, {
        id: entite.id,
        name: entite.name,
		stats:entite.stats,
		leveledstats:entite.modifierStats.durable.statLeveled,
        preview: entite.modifierStats.preview,
    });
}

export function purgeStatPreview(entite) {
  const enrichedArmyA = loadFromLocalStorage('selectedArmyA', []);

  // 🧹 Si aucun argument, on purge toutes les entités
  if (!entite) {
    console.log(`🧹 [purgeStatPreview] Aucune entité spécifiée → purge de toutes les entités de l’armée A`);
    enrichedArmyA.forEach(e => {
      if (e?.modifierStats?.preview) {
        delete e.modifierStats.preview;
        console.log(`🧹 [purgeStatPreview] Preview supprimée pour ${e.name || e.id}`);
      }
    });
    saveToLocalStorage('selectedArmyA', enrichedArmyA);
    console.log(`💾 [purgeStatPreview] Toutes les entités de l’armée A ont été mises à jour`);
    return;
  }

  // 🔎 Si on reçoit seulement un ID, on récupère l'entité complète
  if (typeof entite === 'string' || typeof entite === 'number') {
    const foundEntite = enrichedArmyA.find(e => Number(e.id) === Number(entite));
    if (!foundEntite) {
      console.warn(`⚠️ [purgeStatPreview] Aucune entité trouvée avec l'ID ${entite}`);
      return;
    }
    entite = foundEntite;
  }

  // 🧱 Sécurité : si aucune preview, on quitte
  if (!entite?.modifierStats?.preview) return;

  // 🧹 Suppression de la preview
  delete entite.modifierStats.preview;
  console.log(`🧹 [purgeStatPreview] Preview supprimée pour ${entite.name || entite.id}`);

  // 💾 Sauvegarde mise à jour
  saveUpgradedEntity(entite);
  console.log(`💾 [purgeStatPreview] Entité mise à jour dans le localStorage`);
}

function filterSavedValue(field, data) {
    if (field !== 'battleBoosts' || !data || typeof data !== 'object') return data;
    // Nature stacks live only in the current battle, never in a saved army.
    return Object.fromEntries(Object.entries(data).map(([stat, boosts]) => [
        stat, Array.isArray(boosts) ? boosts.filter(boost => !boost?.attackNatureTemporary) : boosts,
    ]));
}

// Fonction pour sauvegarder dans le localStorage
export function saveToLocalStorage(key, value) {
    if (localStorageEnabled !== false) {
        // console.log(`Enregistrement dans le localStorage de ${key}:`, value);
        const storedValue = key === 'armyAConfig' ? validateArmyConfig(value) : value;
        const serialized = JSON.stringify(storedValue, filterSavedValue);
        // Compare against the actual storage, not a cache: every changed state is written now.
        if (localStorage.getItem(key) !== String(serialized)) localStorage.setItem(key, serialized);
    } else {
        console.log(`localStorage désactivé - enregistrement de ${key} ignoré.`);
    }
}

// These two snapshots belong only to the combat writers below. Never return
// them from the general loader: callers of that API own independent objects.
// Lazy initialization also supports the existing module bootstrap cycles.
var combatArmySnapshots;

export function loadCombatArmyForUpdate(key, fallback = null) {
    if (key !== 'selectedArmyA' && key !== 'ArmyB') return loadFromLocalStorage(key, fallback);
    const snapshots = combatArmySnapshots ??= new Map();
    const raw = localStorage.getItem(key);
    if (!raw) { snapshots.delete(key); return fallback; }
    const cached = snapshots.get(key);
    if (cached?.raw === raw) return cached.value;
    snapshots.delete(key);
    const value = JSON.parse(raw);
    const arrays = key === 'selectedArmyA' ? [value]
        : value?.armies && typeof value.armies === 'object'
            ? Object.values(value.armies).map(army => army?.entities) : [null];
    // Unusual records retain the ordinary loader/writer and its error behavior.
    if (arrays.every(army => Array.isArray(army)
        && army.every(entity => entity && typeof entity === 'object' && !Array.isArray(entity)))) {
        const records = arrays.flatMap(array => array.map((entity, index) => ({ array, index, entity, text: null })));
        snapshots.set(key, { raw, value, records, parts: null });
    }
    return value;
}

export function saveCombatArmyUpdate(key, value, changedEntities, changedFields = null) {
    const snapshots = combatArmySnapshots;
    const snapshot = snapshots?.get(key);
    try {
        if (localStorageEnabled === false || !snapshot || snapshot.value !== value
            || localStorage.getItem(key) !== snapshot.raw) {
            snapshots?.delete(key);
            return saveToLocalStorage(key, value);
        }
        const changed = new Set(changedEntities);
        const records = snapshot.records.filter(record => changed.has(record.entity));
        if (records.length !== changed.size) {
            snapshots.delete(key);
            return saveToLocalStorage(key, value);
        }
        const firstWrite = !snapshot.parts;
        if (firstWrite) {
            // Build the surrounding JSON once, preserving all metadata/key order.
            // Check canonical JSON so escaped input strings cannot collide with a token.
            const canonical = JSON.stringify(value);
            let prefix = '~combat-entity~';
            while (canonical.includes(prefix)) prefix += '~';
            const tokens = new Map(snapshot.records.map((record, index) => [record.entity, `${prefix}${index}~`]));
            const template = JSON.stringify(value, (field, data) => tokens.has(data) ? tokens.get(data) : filterSavedValue(field, data));
            snapshot.parts = template.split(new RegExp(`"${prefix}(\\d+)~"`, 'g'))
                .map((part, index) => index % 2 ? snapshot.records[Number(part)] : part);
        }
        const dirty = firstWrite ? snapshot.records : records;
        // Serialize only changed entities. Normalize those private copies to the
        // exact JSON representation (undefined, NaN, key order, temporary boosts).
        const prepared = dirty.map(record => {
            const partial = !firstWrite && serializeChangedJSONFields(record, changedFields, filterSavedValue);
            if (partial) return partial;
            const text = JSON.stringify(record.entity, filterSavedValue);
            return { record, text, normalized: JSON.parse(text), fields: null };
        });
        for (const { record, text } of prepared) record.text = text;
        const serialized = snapshot.parts.map(part => typeof part === 'string' ? part : part.text).join('');
        // Keep the same immediate writes and actual-storage comparison as the
        // general writer. No timer, deferred flush or gameplay-event suppression.
        if (localStorage.getItem(key) !== serialized) localStorage.setItem(key, serialized);
        for (const { record, normalized, fields } of prepared) {
            record.entity = normalized;
            record.array[record.index] = normalized;
            record.fields = fields;
        }
        snapshot.raw = serialized;
    } catch (error) {
        // A failed serialization/quota write must never leave a mutated cache
        // looking like the unchanged persistent state on the next call.
        snapshots?.delete(key);
        throw error;
    }
}

// Fonction pour charger depuis le localStorage ou les valeurs par défaut de storage/gameStorage.js
export function loadFromLocalStorage(key, defaultValue = null) {
    // if (localStorageEnabled) {
        const savedValue = localStorage.getItem(key);
        if (savedValue) {
            if (key === 'armyAConfig') {
                try {
                    return validateArmyConfig(JSON.parse(savedValue));
                } catch (error) {
                    // A bad startup config must not abort all modules or erase a saved army.
                    console.warn('armyAConfig invalide : configuration ignorée pour ce chargement, données conservées.', error);
                    return validateArmyConfig(defaultValue ?? EMPTY_ARMY_CONFIG);
                }
            }

            return JSON.parse(savedValue);
        } else {
            // console.log(`Aucune donnée trouvée pour ${key} dans le localStorage, utilisation de la valeur par défaut:`, defaultValue);
            return defaultValue;
        }
  
}



// === STAGE VICTORY & PERSISTENT CHESTS =====================================
export const CHESTS_STORAGE_KEY = 'ChestLoot';
export const ENTITY_LOOT_STORAGE_KEY = 'EntityLoot';

const STAGE_CHEST_STATUS = Object.freeze({
    LOCKED: 'locked',
    CLOSED: 'closed',
    OPENED: 'opened',
    PARTIALLY_LOOTED: 'partially-looted',
    DESTROYED: 'destroyed',
});

function countChestLoot(chest) {
    return ['entities', 'stuff', 'consommables'].reduce((total, category) =>
        total + (Array.isArray(chest?.loot?.[category]) ? chest.loot[category].length : 0), 0
    );
}

function deriveChestStatus(chest) {
    if (!chest) return STAGE_CHEST_STATUS.LOCKED;
    if (chest.statut === STAGE_CHEST_STATUS.LOCKED) return STAGE_CHEST_STATUS.LOCKED;
    if (chest.statut === STAGE_CHEST_STATUS.DESTROYED || countChestLoot(chest) === 0) {
        return STAGE_CHEST_STATUS.DESTROYED;
    }
    const collectedCount = (Array.isArray(chest.history) ? chest.history : [])
        .filter(event => event?.event === 'loot-collected').length;
    if (collectedCount > 0) return STAGE_CHEST_STATUS.PARTIALLY_LOOTED;
    if (chest.openedAt || chest.statut === STAGE_CHEST_STATUS.OPENED) return STAGE_CHEST_STATUS.OPENED;
    return STAGE_CHEST_STATUS.CLOSED;
}

function syncStageChestState(chest, providedStagesData = null) {
    if (!chest?.id || chest.level == null) return null;
    const stagesData = providedStagesData || loadFromLocalStorage('GameStages', { stages: [] });
    const stage = stagesData.stages.find(entry => String(entry.id) === String(chest.level));
    if (!stage) {
        storageTrace('warn', 'SYNCHRONISATION stage/coffre impossible : stage introuvable', {
            chestId: chest.id,
            stageId: chest.level,
        });
        return null;
    }

    const status = deriveChestStatus(chest);
    stage.chest = {
        id: String(chest.id),
        status,
        createdAt: chest.createdAt ?? null,
        openedAt: chest.openedAt ?? null,
        updatedAt: chest.updatedAt ?? null,
        destroyedAt: chest.destroyedAt ?? null,
        remainingLoot: countChestLoot(chest),
    };
    // Compatibilité temporaire avec les anciennes sauvegardes/modules.
    stage['chest-id-1'] = String(chest.id);
    saveToLocalStorage('GameStages', stagesData);
    storageTrace('log', 'SYNCHRONISATION stage/coffre', {
        stageId: stage.id,
        chest: cloneStorageValue(stage.chest),
    });
    return stage.chest;
}


function createPersistentUniqueId(prefix) {
    const randomPart = (globalThis.crypto?.randomUUID?.() || generateUniqueID?.() || Math.random().toString(36).slice(2));
    return `${prefix}-${Date.now()}-${String(randomPart).replace(/[^a-zA-Z0-9_-]/g, '')}`;
}

function cloneStorageValue(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
}

function getArmyBEntitiesForStage(stage) {
    const armyBData = loadFromLocalStorage('ArmyB', { armies: {} });
    const armies = armyBData?.armies || {};
    const army = armies[stage.ArmyB_id] || armies[String(stage.id)] || armies[`ArmyB_${stage.id}`];
    if (Array.isArray(army)) return army;
    if (Array.isArray(army?.entities)) return army.entities;
    if (Array.isArray(army?.entites)) return army.entites;
    return [];
}

function getIngameItems() {
    const raw = loadFromLocalStorage('IngameItems', []);
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.items)) return raw.items;
    return [];
}

function isConsumableItem(item) {
    const type = String(item?.type || item?.category || item?.itemType || item?.serial || '').toLowerCase();
    return /consomm|consum|potion|food|scroll|elixir/.test(type);
}

function instantiateItemLoot(source, kind) {
    if (!source) return null;
    const instance = cloneStorageValue(source);
    instance.lootInstanceId = createPersistentUniqueId('li');
    instance.sourceId = source.id ?? source.itemId ?? source.serial ?? null;
    instance.lootType = kind;
    instance.collected = false;
    return instance;
}

function getChestTracePart(chestId) {
    const parts = String(chestId || '').split('-').filter(Boolean);
    const uuidPart = parts.find(part => /^[a-f0-9]{8}$/i.test(part) && /[a-f]/i.test(part))
        || parts.find(part => /^[a-f0-9]{8,}$/i.test(part) && /[a-f]/i.test(part));
    return (uuidPart || parts.at(-1) || Date.now().toString(36)).slice(0, 8);
}

function createEntityLootId(sourceEntity, chestId) {
    const sourceId = sourceEntity?.id ?? sourceEntity?.serial ?? 'unknown';
    return `el-${sourceId}-${getChestTracePart(chestId)}`;
}

function normalizeEntityLootInstance(sourceEntity, entityLootId, chestId, stageId) {
    const entity = cloneStorageValue(sourceEntity);
    entity.id = entityLootId;
    entity.entityLootId = entityLootId;
    entity.sourceEntityId = sourceEntity?.id ?? null;
    entity.sourceSerial = sourceEntity?.serial ?? null;
    entity.sourceChestId = chestId;
    entity.sourceStageId = String(stageId);
    entity.lootType = 'entity';
    entity.collected = false;
    entity.collectedAt = null;
    entity.createdAt = new Date().toISOString();
    entity.side = 'A';
    entity.isDEAD = false;
    entity.statut = Array.isArray(entity.statut)
        ? entity.statut.filter(status => status !== 'dead')
        : [];
    if (entity.stats?.HP && typeof entity.stats.HP === 'object') {
        entity.stats.HP.current = entity.stats.HP.max ?? entity.stats.HP.current;
    }
    return entity;
}

export function getEntityLootStorage() {
    const data = loadFromLocalStorage(ENTITY_LOOT_STORAGE_KEY, { entities: [] });
    return { entities: Array.isArray(data?.entities) ? data.entities : [] };
}

export function getEntityLoot(entityLootId) {
    return getEntityLootStorage().entities.find(entity => entity.entityLootId === entityLootId || entity.id === entityLootId) || null;
}

function createEntityLootReference(sourceEntity, chestId, stageId) {
    if (!sourceEntity) return null;
    const storage = getEntityLootStorage();
    let entityLootId = createEntityLootId(sourceEntity, chestId);
    let suffix = 1;
    while (storage.entities.some(entity => entity.entityLootId === entityLootId || entity.id === entityLootId)) {
        entityLootId = `${createEntityLootId(sourceEntity, chestId)}-${suffix++}`;
    }

    const entity = normalizeEntityLootInstance(sourceEntity, entityLootId, chestId, stageId);
    storage.entities.push(entity);
    saveToLocalStorage(ENTITY_LOOT_STORAGE_KEY, storage);

    return {
        entityLootId,
        sourceEntityId: sourceEntity?.id ?? null,
        sourceSerial: sourceEntity?.serial ?? null,
        lootInstanceId: entityLootId,
        lootType: 'entity',
    };
}

export function getChestStorage() {
    const data = loadFromLocalStorage(CHESTS_STORAGE_KEY, { chests: [] });
    return { chests: Array.isArray(data?.chests) ? data.chests : [] };
}

export function getStageChests(stageId, { includeDestroyed = false } = {}) {
    return getChestStorage().chests.filter(chest =>
        String(chest.level) === String(stageId) && (includeDestroyed || chest.statut !== 'destroyed')
    );
}

export function stageHasRewardChest(stage) {
    return stage?.reward === 'chest';
}

function normalizeStageChestStatus(status, fallback) {
    const normalized = String(status || '').trim().toLowerCase();
    if (normalized === 'lootable' || normalized === 'unlocked') return STAGE_CHEST_STATUS.CLOSED;
    if (Object.values(STAGE_CHEST_STATUS).includes(normalized)) return normalized;
    return fallback;
}

function normalizeStageChestSide(side) {
    const normalized = String(side || '').trim().toLowerCase();
    if (normalized === 'a' || normalized === 'sidea' || normalized === 'side-a') return 'A';
    if (normalized === 'b' || normalized === 'sideb' || normalized === 'side-b') return 'B';
    return 'neutral';
}

export function getOrCreateStageChest(stage, options = {}) {
    if (!stage?.id || !stageHasRewardChest(stage)) return null;

    const chestStorage = getChestStorage();
    const existing = chestStorage.chests.find(chest => String(chest.level) === String(stage.id));
    if (existing && options.forceNew !== true) {
        syncStageChestState(existing);
        return existing;
    }

    const createdAt = new Date().toISOString();
    const fallbackStatus = stage.victory ? STAGE_CHEST_STATUS.CLOSED : STAGE_CHEST_STATUS.LOCKED;
    const status = normalizeStageChestStatus(options.status ?? options.statut, fallbackStatus);
    const side = normalizeStageChestSide(options.side);
    const chest = {
        id: createPersistentUniqueId(`c-${stage.id}`),
        level: String(stage.id),
        statut: status,
        createdAt,
        unlockedAt: status === STAGE_CHEST_STATUS.LOCKED ? null : createdAt,
        openedAt: null,
        updatedAt: createdAt,
        destroyedAt: status === STAGE_CHEST_STATUS.DESTROYED ? createdAt : null,
        durabilityState: status === STAGE_CHEST_STATUS.DESTROYED ? STAGE_CHEST_STATUS.DESTROYED : 'normal',
        metadata: {
            side,
            source: options.source || null
        },
        loot: { entities: [], stuff: [], consommables: [] },
        history: [{
            at: createdAt,
            event: status === STAGE_CHEST_STATUS.LOCKED ? 'created-locked' : `created-${status}`,
            stageId: String(stage.id),
            side,
        }],
    };

    chestStorage.chests.push(chest);
    saveToLocalStorage(CHESTS_STORAGE_KEY, chestStorage);
    syncStageChestState(chest);
    return chest;
}

function populateStageVictoryChestLoot(chest, stage) {
    if (!chest || !stage) return chest;
    if (countChestLoot(chest) > 0) return chest;

    const defeated = getArmyBEntitiesForStage(stage).filter(entity =>
        entity?.isDEAD === true || entity?.statut?.includes?.('dead') || entity?.stats?.HP?.current <= 0
    );
    const items = getIngameItems();
    const stuff = items.find(item => !isConsumableItem(item)) || null;
    const consumable = items.find(isConsumableItem) || null;
    const entityReference = defeated.length
        ? createEntityLootReference(defeated[0], chest.id, stage.id)
        : null;

    chest.loot = {
        entities: entityReference ? [entityReference] : [],
        stuff: stuff ? [instantiateItemLoot(stuff, 'stuff')] : [],
        consommables: consumable ? [instantiateItemLoot(consumable, 'consommable')] : [],
    };

    const allIds = ['entities', 'stuff', 'consommables'].flatMap(category =>
        chest.loot[category].map(entry => entry?.lootInstanceId).filter(Boolean)
    );
    if (new Set(allIds).size !== allIds.length) {
        throw new Error(`Collision lootInstanceId dans le coffre ${chest.id}`);
    }
    return chest;
}

// Compatibilité avec les anciens imports.
export function createStageVictoryChest(stage) {
    const chest = getOrCreateStageChest(stage);
    if (!chest) return null;
    populateStageVictoryChestLoot(chest, stage);
    chest.statut = STAGE_CHEST_STATUS.CLOSED;
    chest.unlockedAt ||= new Date().toISOString();
    chest.updatedAt = new Date().toISOString();
    return chest;
}

export function registerStageVictory(stageId) {
    const stagesData = loadFromLocalStorage('GameStages', { stages: [] });
    const stage = stagesData.stages.find(entry => String(entry.id) === String(stageId));
    if (!stage) return { isNewVictory: false, stage: null, chest: null, reason: 'stage-not-found' };

    // La présence de victory est le verrou idempotent définitif.
    if (stage.victory) {
        const linkedChestId = stage.chest?.id ?? stage['chest-id-1'] ?? null;
        const chest = linkedChestId
            ? getChestStorage().chests.find(entry => String(entry.id) === String(linkedChestId)) || null
            : getStageChests(stage.id, { includeDestroyed: true })[0] || null;
        if (chest) syncStageChestState(chest, stagesData);
        return { isNewVictory: false, stage, chest, reason: 'already-won' };
    }

    const victoryAt = new Date().toISOString();
    stage.statut = 'finished';
    stage.victory = victoryAt;

    let chest = null;

    if (stageHasRewardChest(stage)) {
        chest = getOrCreateStageChest(stage);
        populateStageVictoryChestLoot(chest, stage);
        chest.statut = STAGE_CHEST_STATUS.CLOSED;
        chest.unlockedAt = victoryAt;
        chest.updatedAt = victoryAt;
        chest.history ||= [];
        chest.history.push({ at: victoryAt, event: 'unlocked-after-victory', stageId: String(stage.id) });

        const chestStorage = getChestStorage();
        const chestIndex = chestStorage.chests.findIndex(entry => String(entry.id) === String(chest.id));
        if (chestIndex !== -1) chestStorage.chests[chestIndex] = chest;
        saveToLocalStorage(CHESTS_STORAGE_KEY, chestStorage);

        stage['chest-id-1'] = chest.id;
        stage.chest = {
            id: String(chest.id),
            status: deriveChestStatus(chest),
            createdAt: chest.createdAt ?? null,
            openedAt: chest.openedAt ?? null,
            updatedAt: chest.updatedAt ?? null,
            destroyedAt: chest.destroyedAt ?? null,
            remainingLoot: countChestLoot(chest),
        };
    } else {
        // Un stage sans reward chest ne doit jamais créer ni annoncer de coffre.
        delete stage['chest-id-1'];
        delete stage.chest;
    }

    saveToLocalStorage('GameStages', stagesData);

    if (chest) {
        window.dispatchEvent(new CustomEvent('stageVictoryChestUnlocked', {
            detail: { stageId: String(stage.id), chest: cloneStorageValue(chest) },
        }));
    }

    window.dispatchEvent(new CustomEvent('stageVictoryRegistered', {
        detail: { stage: cloneStorageValue(stage) },
    }));
    return { isNewVictory: true, stage, chest, victoryAt };
}

export function openChest(chestId) {
    const traceId = createStorageTraceId(chestId, 'open-storage');
    try {
        const data = getChestStorage();
        const chest = data.chests.find(entry => String(entry.id) === String(chestId));
        storageTrace('log', `OUVERTURE stockage demandée | trace=${traceId}`, { traceId, chestId, found: Boolean(chest), chest: summarizeStoredChest(chest) });

        if (!chest) {
            storageTrace('warn', `OUVERTURE stockage refusée : coffre introuvable | trace=${traceId}`, { traceId, chestId });
            return null;
        }
        if (chest.statut === STAGE_CHEST_STATUS.LOCKED) {
            storageTrace('warn', `OUVERTURE stockage refusée : coffre verrouillé | trace=${traceId}`, { traceId, chestId });
            return null;
        }
        if (chest.statut === 'destroyed') {
            storageTrace('warn', `OUVERTURE stockage refusée : coffre vidé/détruit | trace=${traceId}`, { traceId, chestId, chest: summarizeStoredChest(chest) });
            return null;
        }

        const now = new Date().toISOString();
        chest.history ||= [];
        const firstOpening = chest.statut === STAGE_CHEST_STATUS.CLOSED || !chest.openedAt;

        if (firstOpening) {
            chest.statut = STAGE_CHEST_STATUS.OPENED;
            chest.openedAt ||= now;
            chest.updatedAt = now;
            chest.history.push({ at: now, event: 'opened', openingType: 'first' });
            saveToLocalStorage(CHESTS_STORAGE_KEY, data);
            syncStageChestState(chest);
            storageTrace('log', `PREMIERE OUVERTURE persistée | trace=${traceId}`, { traceId, chest: summarizeStoredChest(chest), loot: cloneStorageValue(chest.loot) });
        } else {
            chest.statut = deriveChestStatus(chest) === STAGE_CHEST_STATUS.PARTIALLY_LOOTED
                ? STAGE_CHEST_STATUS.PARTIALLY_LOOTED
                : STAGE_CHEST_STATUS.OPENED;
            chest.updatedAt = now;
            chest.history.push({ at: now, event: 'reopened', openingType: 'reopen' });
            saveToLocalStorage(CHESTS_STORAGE_KEY, data);
            syncStageChestState(chest);
            storageTrace('log', `REOUVERTURE persistée | trace=${traceId}`, { traceId, chest: summarizeStoredChest(chest), loot: cloneStorageValue(chest.loot) });
        }

        return cloneStorageValue(chest);
    } catch (error) {
        storageTrace('error', `EXCEPTION ouverture stockage | trace=${traceId}`, { traceId, chestId, error, stack: error?.stack });
        return null;
    }
}

function chestHasLoot(chest) {
    return ['entities', 'stuff', 'consommables'].some(key => Array.isArray(chest.loot?.[key]) && chest.loot[key].length > 0);
}

export function inspectChestLoot(chestId, lootInstanceId) {
    const traceId = createStorageTraceId(chestId, `inspect-${lootInstanceId}`);
    try {
        storageTrace('log', `INSPECTION loot demandée | trace=${traceId}`, { traceId, chestId, lootInstanceId });

    const data = getChestStorage();
    const chest = data.chests.find(entry => entry.id === chestId && entry.statut !== 'destroyed');
    if (!chest) return { success: false, reason: 'chest-not-found' };

    for (const category of ['entities', 'stuff', 'consommables']) {
        const list = Array.isArray(chest.loot?.[category]) ? chest.loot[category] : [];
        const index = list.findIndex(entry => entry?.lootInstanceId === lootInstanceId);
        if (index === -1) continue;

        const collected = list[index];
        if (category === 'entities') {
            const entity = getEntityLoot(collected.entityLootId);
            if (!entity) return { success: false, reason: 'entity-loot-not-found' };
            if (entity.collected === true) return { success: false, reason: 'entity-already-collected' };
        }

        return {
            success: true,
            chest,
            category,
            index,
            collected: cloneStorageValue(collected),
        };
    }

    const alreadyCollected = (chest.history || []).some(event =>
        event?.event === 'loot-collected' && event?.lootInstanceId === lootInstanceId
    );
    return { success: false, reason: alreadyCollected ? 'already-collected' : 'loot-not-found' };

    } catch (error) {
        storageTrace('error', `EXCEPTION inspection loot | trace=${traceId}`, { traceId, chestId, lootInstanceId, error, stack: error?.stack });
        return { success: false, reason: 'inspect-exception', error };
    }
}

export function collectChestLoot(chestId, lootInstanceId) {
    const traceId = createStorageTraceId(chestId, `collect-${lootInstanceId}`);
    try {
        storageTrace('group', `COLLECTE stockage demandée | trace=${traceId}`, { traceId, chestId, lootInstanceId });

    const inspected = inspectChestLoot(chestId, lootInstanceId);
    if (!inspected.success) return inspected;

    const data = getChestStorage();
    const chest = data.chests.find(entry => entry.id === chestId && entry.statut !== 'destroyed');
    if (!chest) return { success: false, reason: 'chest-not-found' };

    const list = Array.isArray(chest.loot?.[inspected.category])
        ? chest.loot[inspected.category]
        : [];
    const index = list.findIndex(entry => entry?.lootInstanceId === lootInstanceId);
    if (index === -1) return { success: false, reason: 'loot-not-found' };

    const [collected] = list.splice(index, 1);
    const now = new Date().toISOString();
    collected.collected = true;
    collected.collectedAt = now;

    if (inspected.category === 'entities') {
        const entityStorage = getEntityLootStorage();
        const entity = entityStorage.entities.find(entry =>
            entry.entityLootId === collected.entityLootId || entry.id === collected.entityLootId
        );
        if (!entity || entity.collected === true) {
            list.splice(index, 0, collected);
            return { success: false, reason: entity ? 'entity-already-collected' : 'entity-loot-not-found' };
        }
        entity.collected = true;
        entity.collectedAt = now;
        entity.currentOwner = 'player';
        saveToLocalStorage(ENTITY_LOOT_STORAGE_KEY, entityStorage);
    }

    chest.statut = chestHasLoot(chest)
        ? STAGE_CHEST_STATUS.PARTIALLY_LOOTED
        : STAGE_CHEST_STATUS.DESTROYED;
    chest.updatedAt = now;
    chest.destroyedAt = chest.statut === 'destroyed' ? now : null;
    chest.history ||= [];
    chest.history.push({
        at: now,
        event: 'loot-collected',
        lootInstanceId,
        category: inspected.category,
        itemId: collected.itemId ?? null,
        sourceId: collected.sourceId ?? null,
        entityLootId: collected.entityLootId ?? null,
        sourceEntityId: collected.sourceEntityId ?? null,
    });
    if (chest.statut === STAGE_CHEST_STATUS.DESTROYED) chest.history.push({ at: now, event: 'destroyed-empty' });
    saveToLocalStorage(CHESTS_STORAGE_KEY, data);
    syncStageChestState(chest);

    storageTrace('log', `COLLECTE stockage validée | trace=${traceId}`, { traceId, chestId, lootInstanceId, category: inspected.category, collected: cloneStorageValue(collected), chest: summarizeStoredChest(chest) });
    return {
        success: true,
        collected: cloneStorageValue(collected),
        category: inspected.category,
        originalIndex: index,
        chest: cloneStorageValue(chest),
    };

    } catch (error) {
        storageTrace('error', `EXCEPTION collecte stockage | trace=${traceId}`, { traceId, chestId, lootInstanceId, error, stack: error?.stack });
        return { success: false, reason: 'collect-exception', error };
    } finally {
        console.groupEnd?.();
    }
}

export function restoreCollectedChestLoot(chestId, transaction) {
    const traceId = createStorageTraceId(chestId, `rollback-${transaction?.collected?.lootInstanceId || 'unknown'}`);
    try {
        storageTrace('warn', `ROLLBACK stockage demandé | trace=${traceId}`, { traceId, chestId, transaction });

    if (!transaction?.success || !transaction?.collected || !transaction?.category) {
        return { success: false, reason: 'invalid-transaction' };
    }

    const data = getChestStorage();
    const chest = data.chests.find(entry => entry.id === chestId);
    if (!chest) return { success: false, reason: 'chest-not-found' };

    const category = transaction.category;
    chest.loot ||= {};
    chest.loot[category] = Array.isArray(chest.loot[category]) ? chest.loot[category] : [];

    const lootInstanceId = transaction.collected.lootInstanceId;
    if (!chest.loot[category].some(entry => entry?.lootInstanceId === lootInstanceId)) {
        const restored = cloneStorageValue(transaction.collected);
        restored.collected = false;
        delete restored.collectedAt;
        const index = Math.max(0, Math.min(Number(transaction.originalIndex) || 0, chest.loot[category].length));
        chest.loot[category].splice(index, 0, restored);
    }

    if (category === 'entities') {
        const entityStorage = getEntityLootStorage();
        const entity = entityStorage.entities.find(entry =>
            entry.entityLootId === transaction.collected.entityLootId ||
            entry.id === transaction.collected.entityLootId
        );
        if (entity) {
            entity.collected = false;
            entity.collectedAt = null;
            delete entity.currentOwner;
            saveToLocalStorage(ENTITY_LOOT_STORAGE_KEY, entityStorage);
        }
    }

    chest.statut = STAGE_CHEST_STATUS.OPENED;
    chest.destroyedAt = null;
    chest.updatedAt = new Date().toISOString();
    chest.history = (chest.history || []).filter(event => !(
        (event?.event === 'loot-collected' || event?.event === 'destroyed-empty') &&
        (event?.lootInstanceId === lootInstanceId || event?.event === 'destroyed-empty') &&
        event?.at === transaction.collected.collectedAt
    ));
    chest.history.push({
        at: chest.updatedAt,
        event: 'loot-collection-rollback',
        lootInstanceId,
        category,
    });
    chest.statut = deriveChestStatus(chest);
    saveToLocalStorage(CHESTS_STORAGE_KEY, data);
    syncStageChestState(chest);
    return { success: true, chest: cloneStorageValue(chest) };

    } catch (error) {
        storageTrace('error', `EXCEPTION rollback stockage | trace=${traceId}`, { traceId, chestId, transaction, error, stack: error?.stack });
        return { success: false, reason: 'rollback-exception', error };
    }
}

const EMPTY_ARMY_CONFIG = Object.freeze({
    lordId: null,
    lordNickname: null,
    unitIds: [],
    unitNicknames: {},
    experience: 0
});

export const armyAConfig = loadFromLocalStorage('armyAConfig', { ...EMPTY_ARMY_CONFIG });

// Fonction de validation pour armyAConfig
function validateArmyConfig(config) {
    if (!config || typeof config !== 'object') {
        throw new TypeError('armyAConfig doit être un objet.');
    }
    if (config.lordId !== null && !Number.isInteger(config.lordId)) {
        throw new TypeError('armyAConfig.lordId doit être null ou un entier.');
    }
    if (!Array.isArray(config.unitIds) || !config.unitIds.every(Number.isInteger)) {
        throw new TypeError('armyAConfig.unitIds doit être un tableau d’identifiants entiers.');
    }
    if (config.unitNicknames != null && (
        typeof config.unitNicknames !== 'object' ||
        Array.isArray(config.unitNicknames)
    )) {
        throw new TypeError('armyAConfig.unitNicknames doit être un objet.');
    }

    return {
        lordId: config.lordId,
        lordNickname: typeof config.lordNickname === 'string' ? config.lordNickname : null,
        unitIds: [...config.unitIds],
        unitNicknames: { ...(config.unitNicknames || {}) },
        experience: Math.max(0, Number(config.experience) || 0)
    };
}

// Exemples de constantes
// export const armyAConfig = {
    // lordId: 15,
    // unitIds: [716, 5, 4, 4, 4, 4, 4]
// };

export const soundSettings = {
    isMuted: true,
    volume: 0.5
};


// STORAGE STAGE
export function saveStageConfig(biomeId, difficulty, storageId, selectedEntitiesB, levelType) {
    if (!storageId) {
        console.error("Aucun storageId fourni !");
        return null;
    }

    // Charger les GameStages existants
    const existingStages = loadFromLocalStorage('GameStages', { stages: [] });

    // Vérifier si le stage existe déjà
    const existingIndex = existingStages.stages.findIndex(stage => String(stage.id) === String(storageId));
    
    // Récupérer l'ancien statut si dispo
    const existingStatut = existingStages.stages[existingIndex]?.statut ?? 'unknown';

    // Configuration du stage avec statut garanti
    const previousStage = existingIndex !== -1 ? existingStages.stages[existingIndex] : {};
    const stageConfig = {
        ...previousStage,
        id: String(storageId),
        biome_serial: biomeId,
        statut: previousStage.victory ? 'finished' : existingStatut,
        difficulty: difficulty,
        ArmyB_id: previousStage.ArmyB_id || `ArmyB_${storageId}`,
        level_type: levelType,
    };

    if (existingIndex !== -1) {
        // Mettre à jour l'entrée existante
        existingStages.stages[existingIndex] = stageConfig;
        // console.log("Stage mis à jour :", stageConfig);
    } else {
        // Ajouter le nouveau stage avec statut: 'unknown'
        existingStages.stages.push(stageConfig);
        console.log("Nouveau stage ajouté :", stageConfig);
    }

    // Sauvegarde finale
    saveToLocalStorage('GameStages', existingStages);

    // ArmyB non gérée ici pour l'instant
    if (selectedEntitiesB) {
        // À implémenter selon tes besoins
    }

    return storageId;
}

export function addToEquippedItemsStorage(equippedId, fullEquippedItem) {
    if (!equippedId || !fullEquippedItem) return;

    const baseItemId = fullEquippedItem.itemId;
    if (typeof baseItemId !== 'string') {
        console.error('❌ itemId manquant pour l’objet équipé :', fullEquippedItem);
        return;
    }

    if (typeof equippedId !== 'string' || !equippedId.startsWith('e')) {
        console.error('❌ equippedId invalide pour l’objet équipé :', equippedId);
        return;
    }

    const equippedItem = {
        ...fullEquippedItem,
        itemId: baseItemId,
        equippedId
    };

    let equippedItems = loadEquippedItems();

    equippedItems = equippedItems.filter(
        item => item.equippedId !== equippedId
    );

    equippedItems.push(equippedItem);
    saveToLocalStorage('equippedItems', equippedItems);

    const playerSave = loadFromLocalStorage('PlayerSave', {});
    playerSave.Playerinventory = Array.isArray(playerSave.Playerinventory)
        ? playerSave.Playerinventory
        : [];

    playerSave.equippedItems = equippedItems;
    playerSave.Playerinventory = playerSave.Playerinventory.filter(
        item => {
            const id = typeof item === 'string' ? item : item?.itemId;
            return id !== baseItemId;
        }
    );

    saveToLocalStorage('PlayerSave', playerSave);

    const itemData = loadFromLocalStorage('IngameItemsData', {
        ItemsIDs: [],
        Playerinventory: [],
        equippedItems: [],
        items: []
    });

    itemData.equippedItems = equippedItems;
    itemData.Playerinventory = (
        Array.isArray(itemData.Playerinventory)
            ? itemData.Playerinventory
            : []
    ).filter(entry => {
        const id = typeof entry === 'string' ? entry : entry?.itemId;
        return id !== baseItemId;
    });

    saveToLocalStorage('IngameItemsData', itemData);
    notifyEquippedItemsUpdated('equip', {
        itemId: baseItemId,
        equippedId,
        equippedTo: equippedItem.equippedTo,
        slot: equippedItem.slot,
    });
}

// Retire un item de equippedItems
export function removeFromEquippedItemsStorage(equippedId) {
    if (!equippedId || typeof equippedId !== 'string' || !equippedId.startsWith('e')) {
        console.error(
            '❌ equippedId invalide ou non défini :',
            equippedId
        );

        return null;
    }

    console.group(
        `🧹 Retrait de equippedItems : ${equippedId}`
    );

    const equippedItems = loadEquippedItems();

    /*
     * Recherche par equippedId et non par itemId.
     */
    const index = equippedItems.findIndex(item =>
        item?.equippedId === equippedId
    );

    if (index === -1) {
        console.warn(
            `⚠️ Aucun objet équipé avec equippedId ` +
            `${equippedId}.`
        );

        console.groupEnd();
        return null;
    }

    const removedItem = equippedItems[index];
    equippedItems.splice(index, 1);

    const baseItemId = removedItem.itemId;

    /*
     * Nettoyage des propriétés propres à l'équipement.
     */
    const inventoryItem = {
        ...removedItem,
        itemId: baseItemId
    };

    delete inventoryItem.equippedId;
    delete inventoryItem.equippedTo;
    delete inventoryItem.slot;
    delete inventoryItem.equippedAt;

    // Equipping removes the inventory registry entry; returning the item must restore it too.
    const registeredItems = getIngameItems().filter(item => item.itemId !== baseItemId);
    registeredItems.push(inventoryItem);
    saveToLocalStorage('IngameItems', registeredItems);

    /*
     * PlayerSave est la source principale de l'inventaire.
     */
    const playerSave = loadFromLocalStorage(
        'PlayerSave',
        {
            Playerinventory: [],
            equippedItems: [],
            items: []
        }
    );

    playerSave.Playerinventory = Array.isArray(
        playerSave.Playerinventory
    )
        ? playerSave.Playerinventory
        : [];

    /*
     * Suppression des doublons avant réinsertion.
     */
    playerSave.Playerinventory =
        playerSave.Playerinventory.filter(entry => {
            const id = typeof entry === 'string'
                ? entry
                : entry?.itemId;

            return id !== baseItemId;
        });

    playerSave.Playerinventory.push(inventoryItem);
    playerSave.equippedItems = equippedItems;

    saveToLocalStorage('PlayerSave', playerSave);
    saveToLocalStorage('equippedItems', equippedItems);

    /*
     * Synchronisation IngameItemsData.
     */
    const itemData = loadFromLocalStorage(
        'IngameItemsData',
        {
            ItemsIDs: [],
            Playerinventory: [],
            equippedItems: [],
            items: []
        }
    );

    itemData.Playerinventory = Array.isArray(
        itemData.Playerinventory
    )
        ? itemData.Playerinventory
        : [];

    itemData.Playerinventory =
        itemData.Playerinventory.filter(entry => {
            const id = typeof entry === 'string'
                ? entry
                : entry?.itemId;

            return id !== baseItemId;
        });

    /*
     * Ton code utilise actuellement des IDs dans
     * IngameItemsData.Playerinventory.
     */
    itemData.Playerinventory.push(baseItemId);
    itemData.equippedItems = equippedItems;

    itemData.items = Array.isArray(itemData.items)
        ? itemData.items
        : [];

    const existingItemIndex = itemData.items.findIndex(
        item => item?.itemId === baseItemId
    );

    if (existingItemIndex === -1) {
        itemData.items.push(inventoryItem);
    } else {
        itemData.items[existingItemIndex] = inventoryItem;
    }

    if (!Array.isArray(itemData.ItemsIDs)) {
        itemData.ItemsIDs = [];
    }

    if (!itemData.ItemsIDs.includes(baseItemId)) {
        itemData.ItemsIDs.push(baseItemId);
    }

    saveToLocalStorage('IngameItemsData', itemData);

    console.log(
        `✅ ${equippedId} déséquipé et ` +
        `${baseItemId} replacé dans l'inventaire.`
    );

    console.groupEnd();
    notifyEquippedItemsUpdated('unequip', {
        itemId: baseItemId,
        equippedId,
        equippedTo: removedItem.equippedTo,
        slot: removedItem.slot,
    });

    return baseItemId;
}
