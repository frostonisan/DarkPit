import { generateUniqueID } from './entites.js';
import { getOrCreateWorldMapID, initializeArmyConfig, ResetGameStages, ResetEntitesB, ResetXp, ResetGameDay, detectPageReload } from './GameInit.js';
import { updateExperienceDisplay } from './UpgradeEntity.js';

export function gainExperience(amount) {
    if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
        console.warn(`❌ XP invalide : ${amount}`);
        return;
    }

    // Charger depuis localStorage
    let currentXP = parseInt(localStorage.getItem('playerExperience')) || 0;
    currentXP += amount;

    localStorage.setItem('playerExperience', currentXP);
    console.log(`✨ Gagné ${amount} XP ! Total : ${currentXP}`);

    updateExperienceDisplay();
    saveCurrentGameData();
}


export function resetFullGame() {
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
        'PlayerSave',
        'Playerinventory',      
        'equippedItems',
		'IngameItems',
		'CodexMenuIndex',
        'CodexSubmenuIndex' 		
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
export function saveCurrentGameData() {
    const currentGameID = getOrCreateGameID(); 
    const worldMapID = getOrCreateWorldMapID();
    const playerID = parseInt(currentGameID.split('_')[1], 10);

    const raw = localStorage.getItem("gameData");
    let parsed = {
        gameIDs: [],
        scriptedLevels: [],
        randomLevels: [],
    };

    if (raw) {
        try {
            parsed = JSON.parse(raw);
        } catch (e) {
            console.error("❌ Erreur de parsing de gameData. Les données ont été réinitialisées.");
        }
    }

    const playerXP = loadFromLocalStorage("playerExperience", { experience: 0 }).experience;
    const currentLevel = getCurrentLevel();
    const gameDay = parseInt(localStorage.getItem('gameDay')) || 1;  // 🔥 récupération du jour actuel
const codexMenuIdx = (typeof getCodexMenuIndex === "function")
    ? getCodexMenuIndex()
    : (loadFromLocalStorage('CodexMenuIndex', 1) || 1);

const codexSubIdx = (typeof getCodexSubmenuIndex === "function")
    ? getCodexSubmenuIndex()
    : (loadFromLocalStorage('CodexSubmenuIndex', 1) || 1);

    // Sauvegarde principale Game_XXXX
    const gameObject = {
        player_id: playerID,
        lastUpdated: new Date().toISOString(),
        gameIDs: parsed.gameIDs || [],
        scriptedLevels: parsed.scriptedLevels || [],
        randomLevels: parsed.randomLevels || [],
        worldmap_id: worldMapID,
        gameDay: gameDay  // ✅ stockage du compteur de jours
    };

    localStorage.setItem(currentGameID, JSON.stringify(gameObject));
    console.log(`✅ Données sauvegardées dans ${currentGameID} (gameDay = ${gameDay})`);

    if (!parsed.gameIDs.includes(playerID)) {
        parsed.gameIDs.push(playerID);
        console.log(`📌 Ajout de l’ID ${playerID} à la liste des parties connues.`);
    }

    if (!parsed.gameIDs.includes(parseInt(worldMapID, 10))) {
        parsed.gameIDs.push(parseInt(worldMapID, 10));
        console.log(`🌍 Ajout du worldmap_id ${worldMapID} à la liste des parties connues.`);
    }

    parsed.experience = playerXP;

    localStorage.setItem("gameData", JSON.stringify(parsed));
    console.log(`✅ gameData global mis à jour.`);

    // Sauvegarde complète dans PlayerSave
    const fullSave = {
        game_id: currentGameID,
        experience: playerXP,
        lastUpdated: new Date().toISOString(),
        worldmap_id: worldMapID,
        gameDay: gameDay, 
        currentLevel: currentLevel,
        gameIDs: parsed.gameIDs,
        scriptedLevels: parsed.scriptedLevels,
        randomLevels: parsed.randomLevels,
		codexMenu:   [codexMenuIdx], 
		codexSubMenu:[codexSubIdx], 
    };

    localStorage.setItem("PlayerSave", JSON.stringify(fullSave));
    console.log(`💾 Sauvegarde complète enregistrée dans PlayerSave (gameDay = ${gameDay})`);
}


export function saveItemsData() {
    const ingameItems = loadFromLocalStorage("IngameItems", []);
    const playerInventory = loadFromLocalStorage("Playerinventory", []);
    const equippedItems = loadFromLocalStorage("equippedItems", []);

    const itemsSave = {
        ItemsIDs: ingameItems.map(item => item.itemId),
        Playerinventory: playerInventory,
        equippedItems: equippedItems,
        items: ingameItems
    };

    localStorage.setItem("IngameItemsData", JSON.stringify(itemsSave));
    console.log("💾 Données objets sauvegardées dans IngameItemsData.");
}
export function loadItemsData() {
    const data = loadFromLocalStorage("IngameItemsData", null);
    if (!data) {
        console.warn("❌ Aucune donnée IngameItemsData trouvée.");
        return;
    }

    saveToLocalStorage("IngameItems", data.items || []);
    saveToLocalStorage("Playerinventory", data.Playerinventory || []);
    saveToLocalStorage("equippedItems", data.equippedItems || []);

    console.log("📦 Données objets restaurées depuis IngameItemsData.");
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
export const localStorageEnabled = true;

// Fonction pour sauvegarder l'entité mise à jour dans le localStorage
export function saveUpgradedEntity(entite) {
    const selectedArmy = loadFromLocalStorage('selectedArmyA', []);
    const index = selectedArmy.findIndex(e => e.id === entite.id);

    if (index !== -1) {
        selectedArmy[index] = entite;
    } else {
        selectedArmy.push(entite);
    }

    saveToLocalStorage('selectedArmyA', selectedArmy);

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

// Fonction pour sauvegarder dans le localStorage
export function saveToLocalStorage(key, value) {
    if (localStorageEnabled) {
        // console.log(`Enregistrement dans le localStorage de ${key}:`, value);
        localStorage.setItem(key, JSON.stringify(value));
    } else {
        console.log(`localStorage désactivé - enregistrement de ${key} ignoré.`);
    }
}

// Fonction pour charger depuis le localStorage ou les valeurs par défaut de GameStorage.js
export function loadFromLocalStorage(key, defaultValue = null) {
    // if (localStorageEnabled) {
        const savedValue = localStorage.getItem(key);
        if (savedValue) {
            const parsedValue = JSON.parse(savedValue);
            // console.log(`Chargement de ${key} depuis le localStorage:`, parsedValue);

            // Validation pour armyAConfig
            if (key === 'armyAConfig') {
                return validateArmyConfig(parsedValue);
            }

            return parsedValue;
        } else {
            // console.log(`Aucune donnée trouvée pour ${key} dans le localStorage, utilisation de la valeur par défaut:`, defaultValue);
            return defaultValue;
        }
  
}

export const armyAConfig = loadFromLocalStorage('armyAConfig', { lordId: null, squireIds: [] });

// Fonction de validation pour armyAConfig
function validateArmyConfig(config) {
    const defaultConfig = { lordId: null, squireIds: [] };
    if (!config || typeof config !== 'object') {
        return defaultConfig;
    }

    return {
        lordId: Number.isInteger(config.lordId) ? config.lordId : null,
        squireIds: Array.isArray(config.squireIds) ? config.squireIds.filter(Number.isInteger) : []
    };
}

// Exemples de constantes
// export const armyAConfig = {
    // lordId: 15,
    // squireIds: [716, 5, 4, 4, 4, 4, 4]
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
    const stageConfig = {
        id: String(storageId),
        biome_serial: biomeId,
		 statut: existingStatut,
        difficulty: difficulty,
        ArmyB_id: `ArmyB_${storageId}`,
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

export function addToEquippedItemsStorage(itemId, fullEquippedItem) {
    if (!itemId || typeof itemId !== 'string') {
        console.error('❌ itemId invalide ou non défini :', itemId);
        return;
    }

    const fullItemId = itemId.startsWith('e') ? itemId : `e${itemId}`;
    console.group(`📦 Ajout à equippedItems : ${fullItemId}`);

    if (!fullEquippedItem || typeof fullEquippedItem !== 'object') {
        console.error('❌ Objet fullEquippedItem manquant ou invalide.');
        console.groupEnd();
        return;
    }

    const fullItem = {
        ...fullEquippedItem,
        itemId: fullItemId
    };

    // === 1. Ajout ou remplacement dans equippedItems ===
    let equippedList = loadFromLocalStorage('equippedItems', []);
    equippedList = Array.isArray(equippedList)
        ? equippedList
        : Object.values(equippedList);

    equippedList = equippedList.filter(obj => obj.itemId !== fullItemId);
    equippedList.push(fullItem);
    saveToLocalStorage('equippedItems', equippedList);
    console.log(`✅ Objet ${fullItemId} ajouté à equippedItems.`);

    // === 2. Suppression dans "items" ===
    let itemsList = loadFromLocalStorage('items', []);
    itemsList = Array.isArray(itemsList) ? itemsList : Object.values(itemsList);
    itemsList = itemsList.filter(obj => obj.itemId !== fullEquippedItem.itemId);
    saveToLocalStorage('items', itemsList);
    console.log(`🧹 Objet ${fullEquippedItem.itemId} retiré de items.`);

    // === 3. Synchronisation PlayerSave ===
    const playerSave = loadFromLocalStorage('PlayerSave', {});
    playerSave.equippedItems = equippedList;

    playerSave.Playerinventory = Array.isArray(playerSave.Playerinventory)
        ? playerSave.Playerinventory
        : Object.values(playerSave.Playerinventory || {});
    playerSave.Playerinventory = playerSave.Playerinventory.filter(obj =>
        obj.itemId !== fullEquippedItem.itemId && obj.itemId !== fullItemId
    );

    console.log(`🧹 Objet ${fullEquippedItem.itemId} retiré de Playerinventory (transfert).`);

    saveToLocalStorage('PlayerSave', playerSave);
    console.log(`🔄 PlayerSave mis à jour avec equippedItems.`);

    console.groupEnd();
}



// Retire un item de equippedItems
export function removeFromEquippedItemsStorage(itemId) {
  if (!itemId || typeof itemId !== 'string') {
    console.error('❌ itemId invalide ou non défini :', itemId);
    return;
  }

  const fullItemId = itemId.startsWith('e') ? itemId : `e${itemId}`;
  const baseItemId = fullItemId.slice(1); // i2-xxxx

  console.group(`🧹 Retrait de equippedItems : ${fullItemId}`);

  // Chargement + robustesse
  let equippedListRaw = loadFromLocalStorage('equippedItems', []);
  let equippedList = Array.isArray(equippedListRaw) ? equippedListRaw : Object.values(equippedListRaw);
  let inventory = loadFromLocalStorage('Playerinventory', []);
  const index = equippedList.findIndex(obj => obj.itemId === fullItemId);
  const removedItem = equippedList[index];

  if (index === -1 || !removedItem) {
    console.warn(`⚠️ Aucun objet avec itemId ${fullItemId} dans equippedItems.`);
    console.groupEnd();
    return;
  }

  equippedList.splice(index, 1);
  console.log(`✅ Objet ${fullItemId} supprimé de equippedItems.`);

  const cleanItem = {
    ...removedItem,
    itemId: baseItemId
  };
  delete cleanItem.equippedId;
  delete cleanItem.equippedTo;
  delete cleanItem.slot;
  delete cleanItem.equippedAt;

  inventory.push(cleanItem);
  console.log(`📥 Objet ${baseItemId} ajouté à Playerinventory.`);

  saveToLocalStorage('equippedItems', equippedList);
  saveToLocalStorage('Playerinventory', inventory);

  const playerSave = loadFromLocalStorage('PlayerSave', {});
  playerSave.equippedItems = equippedList;
  playerSave.Playerinventory = inventory;
  saveToLocalStorage('PlayerSave', playerSave);
  console.log(`🔄 PlayerSave mis à jour.`);

  console.groupEnd();

  return baseItemId;
}
