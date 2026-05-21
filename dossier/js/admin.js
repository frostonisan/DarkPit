import { loadFromLocalStorage, saveToLocalStorage, armyAConfig, loadCurrentGameData,  getOrCreateGameID } from './GameStorage.js';


// preload
function preloadImages(images, callback) {
    let loadedCount = 0;
    const totalImages = images.length;

    images.forEach(src => {
        const img = new Image();
        img.src = src;
        img.onload = () => {
            loadedCount++;
            if (loadedCount === totalImages) {
                callback();
            }
        };
        img.onerror = () => {
            console.error(`Image failed to load: ${src}`);
            loadedCount++;
            if (loadedCount === totalImages) {
                callback();
            }
        };
    });
}

window.onload = function() {
    const imagesToPreload = [
        '/media/assets/loading/loader-01.jpg',
		'/media/assets/misc/chest-closed.png',
		'/media/assets/misc/chest-opened.png',
    ];

    preloadImages(imagesToPreload, () => {
        console.log("Toutes les images sont préchargées");
        // Vous pouvez maintenant exécuter d'autres scripts ou initialiser votre jeu ici.
    });
};

function scaleGameContainer() {
    const container = document.getElementById('game-windows');
    const containerWidth = 1536;
    const containerHeight = 676;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    const widthScale = windowWidth / containerWidth;
    const heightScale = windowHeight / containerHeight;
    const scale = Math.min(widthScale, heightScale);

    // Remise à zéro avant d'appliquer le scale
    container.style.transform = `scale(${scale})`;
}

window.addEventListener('resize', scaleGameContainer);
window.addEventListener('load', scaleGameContainer);

export function JsonInfosDL() {
    // DL JSON Army A
const btnArmyA = document.getElementById('downloadArmyA');
if (btnArmyA) {
  btnArmyA.addEventListener('click', () => {
    const selectedEntitiesA = loadFromLocalStorage('selectedArmyA', []);

    if (selectedEntitiesA.length === 0) {
      console.warn("Aucune armée enrichie trouvée. Téléchargement annulé.");
      return;
    }

    // 🧩 Ajoute un champ preview vide si absent
    const enrichedEntities = selectedEntitiesA.map(entite => {
      entite.modifierStats ??= {};
      entite.modifierStats.durable ??= {
        stuff: { byId: {} },
        level: {},
        archetype: {},
        statLeveled: {}
      };
      entite.modifierStats.preview ??= {}; // 👈 juste le champ vide
      return entite;
    });

    // 💾 Création du JSON
   // JSON joli
const prettyArmyA = JSON.stringify({ entities: enrichedEntities }, null, 4);

// 🔧 Recompacte UNIQUEMENT les tableaux "milestone" sur une seule ligne
const armyAJson = prettyArmyA.replace(
  /("milestone"\s*:\s*)\[\s*([\s\S]*?)\s*\]/g,
  (match, prefix, inner) => {
    const flat = inner.replace(/\s+/g, ' ').trim();
    return `${prefix}[ ${flat} ]`;
  }
);

const blob = new Blob([armyAJson], { type: 'application/json' });

    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'armyA.json';
    link.click();

    console.log('📥 Army A JSON téléchargé :', enrichedEntities);
  });
}

    // DL JSON GameStages
    const btnStages = document.getElementById('downloadGameStages');
    if (btnStages) {
        btnStages.addEventListener('click', () => {
            const gameStages = loadFromLocalStorage('GameStages', { stages: [] });

            if (gameStages.stages.length === 0) {
                console.warn("Aucun stage trouvé. Téléchargement annulé.");
                return;
            }

            const stagesJson = JSON.stringify(gameStages, null, 4);
            const blob = new Blob([stagesJson], { type: 'application/json' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = 'GameStages.json';
            link.click();

            console.log('📥 GameStages JSON téléchargé :', stagesJson);
        });
    }

    // DL JSON Army B
    const btnArmyB = document.getElementById('downloadArmyB');
    if (btnArmyB) {
        btnArmyB.addEventListener('click', () => {
            const armyBData = loadFromLocalStorage('ArmyB', { armies: {} });

            if (!armyBData || Object.keys(armyBData.armies).length === 0) {
                console.warn("Aucune armée B trouvée. Téléchargement annulé.");
                return;
            }

            const armyBJson = JSON.stringify(armyBData, null, 4);
            const blob = new Blob([armyBJson], { type: 'application/json' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = 'ArmyB.json';
            link.click();

            console.log('📥 Army B JSON téléchargé :', armyBJson);
        });
    }
	

// DL JSON Items
const btnItems = document.getElementById('downloadItems');
if (btnItems) {
    btnItems.addEventListener('click', () => {
        const ingameItems = loadFromLocalStorage('IngameItems', []);

        if (!Array.isArray(ingameItems) || ingameItems.length === 0) {
            console.warn("Aucun objet en jeu trouvé. Téléchargement annulé.");
            return;
        }

        // Charger l'inventaire du joueur depuis PlayerSave
      const playerSave = loadFromLocalStorage('PlayerSave', {
    Playerinventory: [],
    equippedItems: []
});

const playerInventory = Array.isArray(playerSave?.Playerinventory) ? playerSave.Playerinventory : [];
const equippedItems = Array.isArray(playerSave?.equippedItems) ? playerSave.equippedItems : [];

        const itemsIDs = ingameItems.map(item => item.itemId);

        const fullData = {
            ItemsIDs: itemsIDs,
			Playerinventory: playerInventory,
            equippedItems: equippedItems,
            items: ingameItems
         
        };

        const jsonContent = JSON.stringify(fullData, (key, value) => {
            if (key === 'ItemsIDs') {
                return JSON.parse(JSON.stringify(value));
            }
            return value;
        }, 4).replace(/\[\s+([^\]]+?)\s+\]/s, (match, inner) => {
            return '[' + inner.replace(/\s+/g, ' ') + ']';
        });

        const blob = new Blob([jsonContent], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'IngameItems.json';
        link.click();

        console.log('📥 IngameItems JSON téléchargé :', jsonContent);
    });
} else {
    console.error("❌ Le bouton 'downloadItems' n’a pas été trouvé dans le DOM.");
}


    // DL JSON Player Infos
const btnPlayer = document.getElementById('downloadPlayerInfos');

if (btnPlayer) {
    btnPlayer.addEventListener('click', () => {
        const currentGameID = localStorage.getItem('currentGameID') || 'Game_000000';
        const playerData = loadCurrentGameData();
        const currentLevel = localStorage.getItem('currentLevel') || 'none';

        // ✅ Déclare d'abord les index codex
        const codexMenuIdx = loadFromLocalStorage('CodexMenuIndex', 1) || 1;
        const codexSubIdx  = loadFromLocalStorage('CodexSubmenuIndex', 1) || 1;

        // ✅ Maintenant seulement on charge PlayerSave avec ces valeurs
        const playerSave = loadFromLocalStorage('PlayerSave', {
            Playerinventory: [],
            equippedItems: [],
            codexMenuIdx,
            codexSubIdx
        });

        const playerInventory = Array.isArray(playerSave.Playerinventory) ? playerSave.Playerinventory : [];
        const equippedItems   = Array.isArray(playerSave.equippedItems) ? playerSave.equippedItems : [];

        if (!playerData) {
            console.error("❌ Aucune donnée de partie à exporter.");
            return;
        }

        const playerDataJson =
`{
   "game_id": "${currentGameID}",
   "experience": ${parseInt(localStorage.getItem('playerExperience')) || 0},
   "lastUpdated": "${playerData.lastUpdated}",
   "worldmap_id": "${playerData.worldmap_id}",
   "gameDay": "${playerData.gameDay}",
   "currentLevel": "${currentLevel}",
   "gameIDs": [${playerData.gameIDs.join(',')}],
   "scriptedLevels": [${playerData.scriptedLevels.join(',')}],
   "randomLevels": [${playerData.randomLevels.join(',')}],
   "codexMenu": [${codexMenuIdx}],
   "codexSubMenu": [${codexSubIdx}]
}`;

        const blob = new Blob([playerDataJson], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'playerInfo.json';
        link.click();

        console.log('📥 Infos joueur téléchargées :', playerDataJson);
    });
} else {
    console.error("❌ Le bouton 'downloadPlayerInfos' n’a pas été trouvé dans le DOM.");
}
}

export function AdminButtons() {
    const gameWindows = document.getElementById('game-windows');
    if (!gameWindows) {
        console.error("❌ #game-windows introuvable dans le DOM.");
        return;
    }

    // Éviter les doublons
    if (document.querySelector('.admin-buttons')) {
        console.log("✅ Les boutons admin existent déjà.");
        return;
    }

    // Création du conteneur
    const adminDiv = document.createElement('div');
    adminDiv.className = 'admin-commands';

    const AlladminButtons = document.createElement('div');
    AlladminButtons.className = 'admin-buttons';

    // Ajout de l'affichage ID (et affichage immédiat)
    const gameIdDisplay = document.createElement('div');
    gameIdDisplay.className = 'GameidDisplay';
    gameIdDisplay.id = 'game-id-display';

    const gameId = getOrCreateGameID();
    gameIdDisplay.textContent = `ID de la partie : ${gameId}`;
    console.log(`🆔 ID affiché via AdminButtons : ${gameId}`);

    // Ajout au DOM
    adminDiv.appendChild(AlladminButtons);
    adminDiv.appendChild(gameIdDisplay);

    const buttons = [
        { id: 'downloadPlayerInfos', label: 'Télécharger Données' },
        { id: 'downloadGameStages', label: 'Télécharger Stages' },
        { id: 'downloadArmyA', label: 'Télécharger Armée A' },
        { id: 'downloadArmyB', label: 'Télécharger Armée B' },
		{ id: 'downloadItems', label: 'Télécharger Items' }
    ];

    buttons.forEach(btn => {
        const button = document.createElement('button');
        button.id = btn.id;
        button.className = 'dl-admin-button';
        button.textContent = btn.label;
        AlladminButtons.appendChild(button);
    });

    gameWindows.appendChild(adminDiv);

    // Attacher les fonctions de téléchargement
    JsonInfosDL();
}
