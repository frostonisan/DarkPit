// Game startup. UI construction lives in the themed modules below.
import "../debug/logger.js";
import { gameStorage as localStorage } from "../storage/sessionStorage.js";
import {
  loadFromLocalStorage,
  saveToLocalStorage,
  getOrCreateGameID,
  loadCurrentGameData,
  saveCurrentGameData,
  setCurrentLevel,
} from "../storage/gameStorage.js";
import { migrateEntityAcquisitions } from "../entities/runtime.js";
import { AdminButtons } from "../debug/admin.js";
import { launchCurrentLevelFromStorage, initializeWorldMapInterface } from "./worldMap.js";
import { sanitizeItemId } from "../items/itemManager.js";
import {
  detectPageReload,
  markPageLoaded,
  createGameContainer,
  getOrCreateWorldMapID,
  GameUi,
  initializeArmyConfig,
  triggerAnimation,
  initializePlayerMenus,
} from "../ui/application.js";

import { initializeAttackInterface } from "../ui/attacks.js";
import { initializeCodex } from "../ui/codex/index.js";
import { initializeCodexProfile, initializeEquipment } from "../ui/codex/profile.js";
import { initializeCodexStats } from "../ui/codex/stats.js";
import { initializeInventory } from "../ui/inventory.js";
import { initializePowerViews } from "../ui/statistics/components.js";
import { initializeStatHelpers } from "../ui/statistics/helpers.js";

initializeAttackInterface();
initializeCodex();
initializeCodexProfile();
initializeCodexStats();
initializeEquipment();
initializeInventory();
initializePlayerMenus();
initializePowerViews();
initializeStatHelpers();

const currentGameID = getOrCreateGameID();

console.log(`Partie en cours trouvée : ${currentGameID}`);

const currentGameData = loadCurrentGameData();

if (!currentGameData) {
    console.warn("Aucune donnée de partie trouvée, initialisation avec saveCurrentGameData()");
    saveCurrentGameData();
} else {
    console.log(`${currentGameID} chargée avec succès`);
}

const loadedArmyA = loadFromLocalStorage('selectedArmyA', []);

const migratedAcquisitions = migrateEntityAcquisitions(loadedArmyA, { source: 'legacy' });

if (migratedAcquisitions > 0) {
  saveToLocalStorage('selectedArmyA', loadedArmyA);
}

window.selectedArmyA = loadedArmyA;

console.log('selectedArmyA rechargé depuis le localStorage :', window.selectedArmyA);

function initializeGameOnLoad() {
    console.log("📥 Document chargé. Initialisation du jeu...");

    const currentLevel = localStorage.getItem('currentLevel');
    const worldMapID = localStorage.getItem('worldmap_id');

    if (!currentLevel || String(currentLevel) === String(worldMapID)) {
        // Cas 1 : Le joueur est sur la worldmap
        const generatedWorldMapID = getOrCreateWorldMapID();
        setCurrentLevel(generatedWorldMapID);
        console.log(`🌍 Reload détecté : joueur sur la World Map => currentLevel = ${generatedWorldMapID}`);
    } else {
        // Cas 2 : Le joueur est dans un niveau
        console.log(`🧭 Reload détecté : joueur sur un niveau => currentLevel = ${currentLevel}`);
		launchCurrentLevelFromStorage()
    }

    createGameContainer();
    GameUi();
    AdminButtons();
    initializeArmyConfig();
	sanitizeItemId();
	// sanitizeEquippedItems();
	// sanitizeGlobalEquipement();

    const animationType = localStorage.getItem('loadingAnimation');
    if (animationType) {
        localStorage.removeItem('loadingAnimation');
        triggerAnimation(animationType);
    }

    const gameWindows = document.getElementById('game-windows');
    if (gameWindows) {
        gameWindows.style.opacity = 0;
        gameWindows.style.transition = 'opacity 3s ease';
        requestAnimationFrame(() => {
            gameWindows.style.opacity = 1;
            gameWindows.classList.add('fade-in');
        });
    } else {
        console.warn("⚠️ #game-windows introuvable dans le DOM.");
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    if (await (await import("../combat/pause.js")).restorePausedCombat()) return;
    const reloaded = detectPageReload(); // ❗ On détecte vraiment le reload cette fois
    console.log(`✅ Page Reload détecté ? ${reloaded}`);
    initializeGameOnLoad();
    markPageLoaded();
    // Async pause restoration can finish after window.load. In both cases the
    // map is initialized only after its container, never by a competing handler.
    if (document.readyState === 'complete') initializeWorldMapInterface();
    else window.addEventListener('load', initializeWorldMapInterface, { once: true });
});
