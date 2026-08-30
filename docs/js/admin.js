import { loadFromLocalStorage, saveToLocalStorage, armyAConfig, loadCurrentGameData, getOrCreateGameID, getVisibleHexes } from './GameStorage.js';
import { assignUniqueIDToEntities, entites } from './entites.js';
import { createEntityIngame } from './createEntity.js';
import { eventList } from './eventList.js?catalog=20260823i';

const ADMIN_EVENT_LIST = Object.freeze(
    eventList
        .filter((eventDefinition, index, definitions) => (
            eventDefinition?.key
            && definitions.findIndex(candidate => candidate?.key === eventDefinition.key) === index
        ))
);

export function getAdminEventDefinitions() {
    return [...ADMIN_EVENT_LIST];
}

const ADMIN_EVENT_OUTCOME_ORDER = Object.freeze(['success', 'middle', 'fail']);

function getAdminEventApproachLabel(choice) {
    const resolution = choice?.resolution || {};
    const approach = String(
        resolution.adminLabel
        || resolution.label
        || resolution.approach
        || choice?.text
        || 'branche'
    ).trim();
    const condition = resolution.condition
        ? String(resolution.condition).trim()
        : '';

    return condition ? `${approach} ${condition}` : approach;
}

function getAdminEventBranchChoices(eventDefinition) {
    const nodes = eventDefinition?.nodes || {};
    const visited = new Set();
    let nodeId = eventDefinition?.startNodeId;

    for (let depth = 0; nodeId && depth < 40; depth += 1) {
        if (visited.has(nodeId)) break;
        visited.add(nodeId);

        const node = nodes[nodeId];
        if (!node) break;

        const choices = Array.isArray(node.choices) ? node.choices : [];
        if (choices.some(choice => choice?.resolution?.outcomes)) return choices;

        nodeId = node.next || null;
    }

    return Object.values(nodes)
        .filter(node => Array.isArray(node?.choices))
        .flatMap(node => node.choices)
        .filter(choice => choice?.resolution?.outcomes);
}

function getAdminEventBranches(eventDefinition) {
    const choices = getAdminEventBranchChoices(eventDefinition);
    const branches = [];

    choices.forEach(choice => {
        const outcomes = choice?.resolution?.outcomes;
        if (!outcomes || typeof outcomes !== 'object') return;

        const approachLabel = getAdminEventApproachLabel(choice);
        ADMIN_EVENT_OUTCOME_ORDER.forEach(outcomeKey => {
            const targetNodeId = outcomes[outcomeKey]?.next;
            if (!targetNodeId || !eventDefinition.nodes?.[targetNodeId]) return;

            branches.push(Object.freeze({
                id: `${choice.id || approachLabel}-${outcomeKey}`,
                eventKey: eventDefinition.key,
                label: `${approachLabel} - ${outcomeKey}`,
                startNodeId: targetNodeId
            }));
        });
    });

    return branches;
}


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
        './media/assets/loading/loader-01.jpg',
		'./media/assets/misc/chest-closed.png',
		'./media/assets/misc/chest-opened.png',
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


    // DL JSON Coffres / Loot persistants
    const btnChestLoot = document.getElementById('downloadChestLoot');
    if (btnChestLoot) {
        btnChestLoot.addEventListener('click', () => {
            const chestLoot = loadFromLocalStorage('ChestLoot', { chests: [] });
            const json = JSON.stringify(chestLoot, null, 4);
            const blob = new Blob([json], { type: 'application/json' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = 'chest-loot.json';
            link.click();
            URL.revokeObjectURL(link.href);
            console.log('📥 Coffres / loot téléchargés :', chestLoot);
        });
    }


    // DL JSON Entités issues des coffres
    const btnEntityLoot = document.getElementById('downloadEntityLoot');
    if (btnEntityLoot) {
        btnEntityLoot.addEventListener('click', () => {
            const entityLoot = loadFromLocalStorage('EntityLoot', { entities: [] });
            const json = JSON.stringify(entityLoot, null, 4);
            const blob = new Blob([json], { type: 'application/json' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = 'entity-loot.json';
            link.click();
            URL.revokeObjectURL(link.href);
            console.log('📥 EntityLoot téléchargé :', entityLoot);
        });
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
        const visibleHexes = getVisibleHexes();
        const storedPlayerInfo = loadFromLocalStorage('playerInfo.json', {});
        const storedPlayerExperience = loadFromLocalStorage('playerExperience', { experience: 0 });
        const playerExperience = Math.max(
            0,
            parseInt(
                storedPlayerExperience && typeof storedPlayerExperience === 'object'
                    ? storedPlayerExperience.experience
                    : storedPlayerExperience,
                10
            ) || 0
        );
        const cockroaches = Math.max(
            0,
            parseInt(storedPlayerInfo?.cockroaches, 10) || 0
        );

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

        const playerInfoExport = {
            ...storedPlayerInfo,
            game_id: currentGameID,
            experience: playerExperience,
            lastUpdated: playerData.lastUpdated,
            worldmap_id: playerData.worldmap_id,
            gameDay: playerData.gameDay,
            currentLevel,
            gameIDs: Array.isArray(playerData.gameIDs) ? playerData.gameIDs : [],
            scriptedLevels: Array.isArray(playerData.scriptedLevels) ? playerData.scriptedLevels : [],
            randomLevels: Array.isArray(playerData.randomLevels) ? playerData.randomLevels : [],
            codexMenu: [codexMenuIdx],
            codexSubMenu: [codexSubIdx],
            visibleHexes,
            cockroaches,
            quest: storedPlayerInfo.quest || {
                version: 1,
                activeEventKey: null,
                inProgress: {},
                finished: {},
                failed: {}
            }
        };
        const playerDataJson = JSON.stringify(playerInfoExport, null, 4);

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

    const adminToggle = document.createElement('div');
    adminToggle.className = 'admin-toggle-button picto-ui';
    adminToggle.title = 'Afficher / masquer les commandes admin';
    adminToggle.setAttribute('role', 'button');
    adminToggle.setAttribute('tabindex', '0');
    adminToggle.setAttribute('aria-expanded', 'true');
    adminToggle.textContent = '⚙';

    const AlladminButtons = document.createElement('div');
    AlladminButtons.className = 'admin-buttons';

    const toggleAdminButtons = () => {
        const isHidden = AlladminButtons.classList.toggle('is-hidden');
        gameIdDisplay.classList.toggle('is-hidden', isHidden);
        adminToggle.setAttribute('aria-expanded', String(!isHidden));
    };

    adminToggle.addEventListener('click', toggleAdminButtons);
    adminToggle.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        toggleAdminButtons();
    });

    // Ajout de l'affichage ID (et affichage immédiat)
    const gameIdDisplay = document.createElement('div');
    gameIdDisplay.className = 'GameidDisplay';
    gameIdDisplay.id = 'game-id-display';

    const gameId = getOrCreateGameID();
    gameIdDisplay.textContent = `ID de la partie : ${gameId}`;
    console.log(`🆔 ID affiché via AdminButtons : ${gameId}`);

    // Ajout au DOM : icône admin tout à gauche, puis les boutons.
    adminDiv.appendChild(adminToggle);
    adminDiv.appendChild(AlladminButtons);
    adminDiv.appendChild(gameIdDisplay);

    const buttons = [
        { id: 'downloadPlayerInfos', label: 'Télécharger Données' },
        { id: 'downloadGameStages', label: 'Télécharger Stages' },
        { id: 'downloadArmyA', label: 'Télécharger Armée A' },
        { id: 'downloadArmyB', label: 'Télécharger Armée B' },
		{ id: 'downloadItems', label: 'Télécharger Items' },
        { id: 'downloadChestLoot', label: 'Télécharger Coffres / Loot' },
        { id: 'downloadEntityLoot', label: 'Télécharger Entity Loot' }
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

function getFocusedEntityIdFromDOM() {
    const box = document.querySelector('.hex.focused .entite-box[id^="Box_Entite_"]');
    if (box?.id) return box.id.replace('Box_Entite_', '');

    const fallback = document.querySelector(
        '[id^="spriteContainer_"].focused, [id^="TargetInfos_"].focused'
    );
    const match = fallback?.id?.match(/_(\d+)$/);
    return match ? match[1] : null;
}

export function removeAdminEntityIngame(entityId) {
    if (!entityId || window.levelRunning !== 'admin') return false;

    const box = document.getElementById(`Box_Entite_${entityId}`);
    const hex = box?.closest('.hex');

    if (hex) {
        hex.classList.remove('occupied', 'focused');
        if (String(hex.dataset.occupiedBy) === String(entityId)) {
            delete hex.dataset.occupiedBy;
        }

        const socle = hex.querySelector('.socle');
        if (socle) {
            socle.style.opacity = '';
            socle.style.filter = '';
        }
    }

    const spriteContainer = document.getElementById(`spriteContainer_${entityId}`);
    if (spriteContainer) {
        spriteContainer.classList.remove('focused');
        spriteContainer.querySelectorAll('.focused').forEach(node => node.classList.remove('focused'));
    }

    document.getElementById(`TargetInfos_${entityId}`)?.classList.remove('focused');
    box?.remove();

    const entityIndex = entites.findIndex(entity => String(entity.id) === String(entityId));
    if (entityIndex !== -1) entites.splice(entityIndex, 1);

    return true;
}

export function enableAdminDeleteKey() {
    if (window.__adminDeleteKeyBound) return;
    window.__adminDeleteKeyBound = true;

    document.addEventListener('keydown', event => {
        if (window.levelRunning !== 'admin') return;

        const activeElement = document.activeElement;
        const isTyping = activeElement && (
            activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.tagName === 'SELECT' ||
            activeElement.isContentEditable
        );
        if (isTyping || (event.key !== 'Delete' && event.code !== 'Delete' && event.keyCode !== 46)) return;

        const entityId = getFocusedEntityIdFromDOM();
        if (!entityId) return;

        event.preventDefault();
        removeAdminEntityIngame(entityId);
    });
}

export function cleanupAdminLevel() {
    document.getElementById('admin-entity-form')?.remove();
    document.getElementById('admin-open-btn')?.remove();

    if (window.__adminDropInterceptor) {
        document.removeEventListener('drop', window.__adminDropInterceptor, true);
        window.__adminDropInterceptor = null;
    }
}

function normalizeAdminSearchText(value) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function getAdminSearchDistance(source, target) {
    if (source === target) return 0;
    if (!source.length) return target.length;
    if (!target.length) return source.length;

    let previous = Array.from({ length: target.length + 1 }, (_, index) => index);

    for (let sourceIndex = 1; sourceIndex <= source.length; sourceIndex++) {
        const current = [sourceIndex];

        for (let targetIndex = 1; targetIndex <= target.length; targetIndex++) {
            const substitutionCost = source[sourceIndex - 1] === target[targetIndex - 1] ? 0 : 1;
            current[targetIndex] = Math.min(
                current[targetIndex - 1] + 1,
                previous[targetIndex] + 1,
                previous[targetIndex - 1] + substitutionCost
            );
        }

        previous = current;
    }

    return previous[target.length];
}

function getAdminSearchScore(queryValue, candidateValue) {
    const query = normalizeAdminSearchText(queryValue);
    const candidate = normalizeAdminSearchText(candidateValue);
    if (!query) return 0;
    if (!candidate) return Number.POSITIVE_INFINITY;
    if (candidate === query) return -100;

    if (candidate.startsWith(query)) {
        return -80 + ((candidate.length - query.length) / Math.max(candidate.length, 1));
    }

    const directMatchIndex = candidate.indexOf(query);
    if (directMatchIndex !== -1) {
        return -60
            + (directMatchIndex / Math.max(candidate.length, 1))
            + ((candidate.length - query.length) / Math.max(candidate.length, 1));
    }

    const queryWords = query.split(' ');
    const candidateWords = candidate.split(' ');
    const wordScore = queryWords.reduce((total, queryWord) => {
        const closestWordScore = candidateWords.reduce((closest, candidateWord) => {
            if (candidateWord === queryWord) return 0;
            if (candidateWord.startsWith(queryWord)) {
                return Math.min(closest, 0.05 + (
                    (candidateWord.length - queryWord.length)
                    / Math.max(candidateWord.length, 1)
                ));
            }

            const distance = getAdminSearchDistance(queryWord, candidateWord);
            return Math.min(
                closest,
                distance / Math.max(queryWord.length, candidateWord.length, 1)
            );
        }, Number.POSITIVE_INFINITY);

        return total + closestWordScore;
    }, 0) / queryWords.length;

    const fullDistance = getAdminSearchDistance(query, candidate)
        / Math.max(query.length, candidate.length, 1);
    const wordCountPenalty = Math.abs(queryWords.length - candidateWords.length) * 0.01;

    return wordScore + (fullDistance * 0.15) + wordCountPenalty;
}

function getAdminSearchMatches(queryValue, entries) {
    const query = normalizeAdminSearchText(queryValue);
    if (!query) return entries;

    const queryWords = query.split(' ');
    const preparedEntries = entries.map((entry, index) => ({
        entry,
        index,
        normalizedText: normalizeAdminSearchText(entry.searchText)
    }));

    const phraseMatches = preparedEntries.filter(({ normalizedText }) => (
        normalizedText.includes(query)
    ));
    if (phraseMatches.length > 0) {
        return phraseMatches.map(({ entry }) => entry);
    }

    const tokenMatches = preparedEntries.filter(({ normalizedText }) => {
        const candidateWords = normalizedText.split(' ');
        return queryWords.every(queryWord => candidateWords.some(candidateWord => (
            candidateWord.startsWith(queryWord)
            || (queryWord.length >= 3 && candidateWord.includes(queryWord))
        )));
    });
    if (tokenMatches.length > 0) {
        return tokenMatches.map(({ entry }) => entry);
    }

    const fuzzyMatches = preparedEntries
        .map(prepared => ({
            ...prepared,
            score: getAdminSearchScore(query, prepared.normalizedText)
        }))
        .sort((first, second) => first.score - second.score || first.index - second.index);

    if (fuzzyMatches.length === 0) return [];

    const bestScore = fuzzyMatches[0].score;
    const tolerance = queryWords.length > 1 ? 0.14 : 0.1;
    const maximumAcceptedScore = queryWords.length > 1 ? 0.72 : 0.58;
    const acceptedScore = Math.min(bestScore + tolerance, maximumAcceptedScore);

    return fuzzyMatches
        .filter(({ score }) => score <= acceptedScore)
        .map(({ entry }) => entry);
}

export function initializeAdminLevel(entityCatalog) {
    const currentStageId = window.currentStageId;
    const gameStageData = JSON.parse(localStorage.getItem('GameStages')) || { stages: [] };
    const stage = gameStageData.stages.find(candidate => String(candidate.id) === String(currentStageId));

    if (window.levelRunning !== 'admin' || !stage || stage.level_type !== 'admin') {
        cleanupAdminLevel();
        console.warn('Initialisation admin ignorée : le niveau courant n’est pas un niveau admin.');
        return { A: [], B: [] };
    }

    if (!Array.isArray(entityCatalog)) {
        console.error('Initialisation admin impossible : catalogue d’entités invalide.');
        return { A: [], B: [] };
    }

    cleanupAdminLevel();
    enableAdminDeleteKey();
    window.__adminEntityCatalog = entityCatalog;

    const configuredAdminTabs = Array.isArray(stage.adminTabs)
        ? stage.adminTabs.map(tab => String(tab).trim().toLowerCase())
        : [];
    const isAdminIsland = String(stage.levelName || '').trim().toLowerCase() === 'admin island';
    const eventsEnabled = configuredAdminTabs.includes('events') || isAdminIsland;

    const selectedEntitiesA = [];
    const selectedEntitiesB = [];
    const selectedBaseSet = new Set();

    const form = document.createElement('form');
    form.id = 'admin-entity-form';
    form.dataset.activeSide = 'A';
    form.dataset.eventCount = String(ADMIN_EVENT_LIST.length);
    form.innerHTML = '<h3>Sélectionner les entités (Admin)</h3>';
    form.addEventListener('submit', event => event.preventDefault());

    const tabs = document.createElement('div');
    tabs.id = 'admin-side-tabs';
    tabs.style.display = 'flex';
    tabs.style.gap = '8px';
    tabs.style.marginBottom = '8px';

    const tabA = document.createElement('button');
    tabA.type = 'button';
    tabA.textContent = 'Side A';

    const tabB = document.createElement('button');
    tabB.type = 'button';
    tabB.textContent = 'Side B';

    const tabEvents = document.createElement('button');
    tabEvents.type = 'button';
    tabEvents.textContent = 'Events';

    const list = document.createElement('div');
    list.id = 'admin-entity-list';
    list.classList.add('admin-entity-list');

    const searchTools = document.createElement('div');
    searchTools.id = 'admin-list-search';
    searchTools.style.display = 'flex';
    searchTools.style.alignItems = 'center';
    searchTools.style.gap = '6px';
    searchTools.style.marginBottom = '8px';

    const searchInput = document.createElement('input');
    searchInput.id = 'admin-list-search-input';
    searchInput.type = 'search';
    searchInput.placeholder = 'Rechercher une entité…';
    searchInput.autocomplete = 'off';
    searchInput.spellcheck = false;
    searchInput.setAttribute('aria-label', 'Recherche rapide');
    searchInput.style.flex = '1 1 140px';
    searchInput.style.minWidth = '0';
    searchInput.style.padding = '4px 6px';

    const clearSearchButton = document.createElement('button');
    clearSearchButton.type = 'button';
    clearSearchButton.textContent = 'Clear';
    clearSearchButton.disabled = true;
    clearSearchButton.style.flex = '0 0 auto';
    clearSearchButton.style.padding = '4px 8px';

    searchTools.append(searchInput, clearSearchButton);

    const spawnButton = document.createElement('button');
    spawnButton.type = 'button';
    spawnButton.textContent = 'Ajouter Entités Sélectionnées';

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.textContent = 'Fermer';

    const eventStatus = document.createElement('div');
    eventStatus.id = 'admin-event-launch-status';
    eventStatus.setAttribute('role', 'status');
    eventStatus.setAttribute('aria-live', 'polite');
    eventStatus.hidden = true;

    const entityRows = [];
    const eventRows = [];
    let activeBranchEventTitle = null;
    let eventBranchRows = [];

    const renderAdminList = () => {
        const isEventsTab = form.dataset.activeAdminTab === 'events';
        const availableRows = isEventsTab
            ? (activeBranchEventTitle ? eventBranchRows : eventRows)
            : entityRows;
        const query = normalizeAdminSearchText(searchInput.value);
        const displayedRows = getAdminSearchMatches(query, availableRows);

        clearSearchButton.disabled = query.length === 0;
        list.replaceChildren();

        if (displayedRows.length === 0) {
            const emptyMessage = document.createElement('p');
            emptyMessage.textContent = query
                ? 'Aucun résultat.'
                : (isEventsTab
                    ? (activeBranchEventTitle ? 'Aucune branche disponible.' : 'Aucun scénario enregistré.')
                    : 'Aucune entité disponible.');
            list.appendChild(emptyMessage);
            return;
        }

        list.append(...displayedRows.map(entry => entry.element));
    };

    const resetSearch = () => {
        searchInput.value = '';
        clearSearchButton.disabled = true;
    };

    const setActiveSide = side => {
        form.dataset.activeAdminTab = 'entities';
        activeBranchEventTitle = null;
        eventBranchRows = [];
        form.dataset.activeSide = side;
        tabA.classList.toggle('active', side === 'A');
        tabB.classList.toggle('active', side === 'B');
        tabEvents.classList.remove('active');
        searchInput.placeholder = 'Rechercher une entité…';
        spawnButton.hidden = false;
        eventStatus.hidden = true;
        resetSearch();
        renderAdminList();
    };

    const setActiveEvents = () => {
        form.dataset.activeAdminTab = 'events';
        activeBranchEventTitle = null;
        eventBranchRows = [];
        tabA.classList.remove('active');
        tabB.classList.remove('active');
        tabEvents.classList.add('active');
        searchInput.placeholder = 'Rechercher un événement…';
        spawnButton.hidden = true;
        eventStatus.hidden = !eventStatus.textContent;
        resetSearch();
        renderAdminList();
    };

    tabA.addEventListener('click', () => setActiveSide('A'));
    tabB.addEventListener('click', () => setActiveSide('B'));
    if (eventsEnabled) {
        tabEvents.addEventListener('click', setActiveEvents);
        tabs.append(tabA, tabB, tabEvents);
    } else {
        tabs.append(tabA, tabB);
    }

    searchInput.addEventListener('input', renderAdminList);
    clearSearchButton.addEventListener('click', () => {
        resetSearch();
        renderAdminList();
        searchInput.focus();
    });

    const showAdminLauncherButton = () => {
        if (window.levelRunning !== 'admin' || document.getElementById('admin-open-btn')) return;

        const button = document.createElement('button');
        button.id = 'admin-open-btn';
        button.type = 'button';
        button.textContent = 'Admin';
        button.className = 'admin-open-btn';
        button.addEventListener('click', () => {
            button.remove();
            initializeAdminLevel(window.__adminEntityCatalog || entityCatalog);
        });
        document.body.appendChild(button);
    };

    const eventLaunchRows = [];
    const setEventRowsDisabled = disabled => {
        eventLaunchRows.forEach(row => {
            row.setAttribute('aria-disabled', String(disabled));
            row.tabIndex = disabled ? -1 : 0;
        });
    };

    const openEventBranches = (eventDefinition, eventTitle, branches, launchEvent) => {
        activeBranchEventTitle = eventTitle;
        searchInput.placeholder = 'Rechercher une branche…';

        const backRow = document.createElement('div');
        backRow.className = 'admin-entity-row admin-event-row';
        backRow.setAttribute('role', 'button');
        backRow.setAttribute('aria-disabled', 'false');
        backRow.tabIndex = 0;

        const backLabel = document.createElement('span');
        backLabel.textContent = '< Retour aux événements';

        const backIdentity = document.createElement('span');
        backIdentity.style.opacity = '0.7';
        backIdentity.textContent = eventTitle;

        backRow.append(backLabel, backIdentity);
        const closeBranches = () => {
            activeBranchEventTitle = null;
            eventBranchRows = [];
            searchInput.placeholder = 'Rechercher un événement…';
            resetSearch();
            renderAdminList();
        };
        backRow.addEventListener('click', closeBranches);
        backRow.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            closeBranches();
        });

        eventBranchRows = [{
            element: backRow,
            searchText: `retour ${eventTitle}`
        }];

        branches.forEach(branch => {
            const branchRow = document.createElement('div');
            branchRow.className = 'admin-entity-row admin-event-row';
            branchRow.dataset.eventKey = eventDefinition.key;
            branchRow.dataset.eventBranch = branch.id;
            branchRow.setAttribute('role', 'button');
            branchRow.setAttribute('aria-disabled', 'false');
            branchRow.tabIndex = 0;

            const branchName = document.createElement('span');
            branchName.textContent = branch.label;

            const branchIdentity = document.createElement('span');
            branchIdentity.style.opacity = '0.7';
            branchIdentity.textContent = `ID ${eventDefinition.id} · v${eventDefinition.version || 1}`;

            branchRow.append(branchName, branchIdentity);
            branchRow.addEventListener('click', () => launchEvent(branch));
            branchRow.addEventListener('keydown', event => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                launchEvent(branch);
            });

            eventLaunchRows.push(branchRow);
            eventBranchRows.push({
                element: branchRow,
                searchText: `${branch.label} ${eventTitle} ${eventDefinition.key}`
            });
        });

        resetSearch();
        renderAdminList();
    };

    if (eventsEnabled) ADMIN_EVENT_LIST.forEach(eventDefinition => {
        const eventRow = document.createElement('div');
        eventRow.className = 'admin-entity-row admin-event-row';
        eventRow.dataset.eventKey = eventDefinition.key;
        eventRow.setAttribute('role', 'button');
        eventRow.setAttribute('aria-disabled', 'false');
        eventRow.tabIndex = 0;

        const eventName = document.createElement('span');
        const eventTitle = eventDefinition.title
            || eventDefinition.name
            || eventDefinition.key;
        const eventBranches = getAdminEventBranches(eventDefinition);
        eventName.textContent = eventBranches.length > 0
            ? `${eventTitle} >`
            : eventTitle;

        const eventIdentity = document.createElement('span');
        eventIdentity.style.opacity = '0.7';
        eventIdentity.textContent = `ID ${eventDefinition.id} · v${eventDefinition.version || 1}`;

        eventRow.append(eventName, eventIdentity);

        const launchEvent = async (branch = null) => {
            if (window.levelRunning !== 'admin' || window.__adminEventLaunchPending) return;

            window.__adminEventLaunchPending = true;
            setEventRowsDisabled(true);
            eventStatus.textContent = `Lancement de ${branch?.label || eventTitle}…`;
            eventStatus.hidden = false;

            try {
                const { startEvent } = await import('./events.js');
                await startEvent(eventDefinition, {
                    levelId: window.currentStageId,
                    force: true,
                    ...(branch?.startNodeId ? { forcedStartNodeId: branch.startNodeId } : {})
                });
                cleanupAdminLevel();
                showAdminLauncherButton();
            } catch (error) {
                console.error(`Lancement admin de l’événement ${eventDefinition.key} impossible :`, error);
                eventStatus.textContent = `Échec du lancement : ${error?.message || error}`;
                setEventRowsDisabled(false);
            } finally {
                window.__adminEventLaunchPending = false;
            }
        };

        const openOrLaunchEvent = () => {
            if (eventBranches.length > 0) {
                openEventBranches(eventDefinition, eventTitle, eventBranches, launchEvent);
                return;
            }

            launchEvent();
        };

        eventRow.addEventListener('click', openOrLaunchEvent);
        eventRow.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            openOrLaunchEvent();
        });

        eventLaunchRows.push(eventRow);
        eventRows.push({
            element: eventRow,
            searchText: eventName.textContent
        });
    });

    closeButton.addEventListener('click', () => {
        cleanupAdminLevel();
        showAdminLauncherButton();
    });

    form.append(tabs, searchTools, eventStatus, list, spawnButton, closeButton);
    document.body.appendChild(form);

    const spawnEntity = async (entityBase, side, forcedPosition = null) => {
        if (window.levelRunning !== 'admin') return null;

        try {
            const created = await createEntityIngame(entityBase, { side, position: forcedPosition });
            if (side === 'A') selectedEntitiesA.push(created);
            else selectedEntitiesB.push(created);
            return created;
        } catch (error) {
            console.error('❌ Création de l’entité impossible :', error);
            return null;
        }
    };

    entityCatalog.forEach(entity => {
        const row = document.createElement('div');
        row.className = 'admin-entity-row';
        row.draggable = true;

        const label = document.createElement('span');
        label.textContent = entity.name;

        const level = document.createElement('span');
        level.style.opacity = '0.7';
        level.textContent = `Lv ${entity.level?.current ?? entity.level ?? 1}`;
        row.append(label, level);

        const serializedEntity = JSON.stringify(entity);
        row.addEventListener('click', () => {
            const isSelected = selectedBaseSet.has(serializedEntity);
            if (isSelected) selectedBaseSet.delete(serializedEntity);
            else selectedBaseSet.add(serializedEntity);
            row.style.outline = isSelected ? '' : '2px solid rgba(255,255,255,0.35)';
        });

        row.addEventListener('dragstart', event => {
            if (window.levelRunning !== 'admin') {
                event.preventDefault();
                return;
            }

            const side = form.dataset.activeSide || 'A';
            const payload = `ADMIN_SPAWN:${JSON.stringify({ __adminSpawn: 1, side, entity })}`;
            event.dataTransfer.setData('text/plain', payload);
            event.dataTransfer.effectAllowed = 'copy';
        });

        entityRows.push({
            element: row,
            searchText: entity.name
        });
    });

    setActiveSide('A');

    spawnButton.addEventListener('click', async () => {
        const side = form.dataset.activeSide || 'A';
        for (const serializedEntity of selectedBaseSet) {
            await spawnEntity(JSON.parse(serializedEntity), side);
        }
        assignUniqueIDToEntities(selectedEntitiesA);
        assignUniqueIDToEntities(selectedEntitiesB);
    });

    const adminDropInterceptor = async event => {
        if (window.levelRunning !== 'admin' || !document.getElementById('admin-entity-form')) return;

        const hex = event.target?.closest?.('.hex');
        const rawPayload = event.dataTransfer?.getData?.('text/plain') || '';
        if (!hex || !rawPayload.startsWith('ADMIN_SPAWN:')) return;

        event.preventDefault();
        event.stopImmediatePropagation();

        let payload;
        try {
            payload = JSON.parse(rawPayload.slice('ADMIN_SPAWN:'.length));
        } catch (error) {
            console.error('❌ Payload ADMIN_SPAWN invalide :', error);
            return;
        }

        const side = payload.side === 'B' ? 'B' : 'A';
        const created = await spawnEntity(payload.entity, side, hex.dataset.position);
        if (!created) return;

        assignUniqueIDToEntities(selectedEntitiesA);
        assignUniqueIDToEntities(selectedEntitiesB);
    };

    window.__adminDropInterceptor = adminDropInterceptor;
    document.addEventListener('drop', adminDropInterceptor, true);

    return { A: selectedEntitiesA, B: selectedEntitiesB };
}

// Alias temporaire pour les anciens imports pendant la migration.
export const selectAdminEntitiesForSideB = initializeAdminLevel;
export const enableDeleteKeyForFocusedEntity = enableAdminDeleteKey;
