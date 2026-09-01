import { loadFromLocalStorage, saveToLocalStorage, armyAConfig, loadCurrentGameData, getOrCreateGameID, getVisibleHexes } from './GameStorage.js';
import { assignUniqueIDToEntities, entites } from './entites.js';
import { createEntityIngame } from './createEntity.js';
import { eventList } from './eventList.js?catalog=20260823i';
import { levelBiome } from './level.js';

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
const ADMIN_MENU_STORAGE_KEY = 'DarkPitAdminMenuState';
const ADMIN_INVINCIBLE_MODE_STORAGE_KEY = 'DarkPitAdminInvincibleMode';
const ADMIN_SPAWN_SIDES = Object.freeze([
    Object.freeze({ key: 'A', label: 'Side A' }),
    Object.freeze({ key: 'B', label: 'Side B' }),
    Object.freeze({ key: 'neutral', label: 'Neutral' })
]);
const ADMIN_CHEST_STATUSES = Object.freeze([
    Object.freeze({ key: 'lootable', label: 'Lootable' }),
    Object.freeze({ key: 'locked', label: 'Locked' }),
    Object.freeze({ key: 'destroyed', label: 'Destroyed' })
]);
const ADMIN_CORPSE_STATUSES = Object.freeze([
    Object.freeze({ key: 'lootable', label: 'Lootable' }),
    Object.freeze({ key: 'empty', label: 'Empty' }),
    Object.freeze({ key: 'destroyed', label: 'Destroyed' })
]);

function normalizeAdminSpawnSide(side) {
    const normalized = String(side || '').trim().toLowerCase();
    if (normalized === 'b' || normalized === 'sideb' || normalized === 'side-b') return 'B';
    if (normalized === 'neutral' || normalized === 'neutre' || normalized === 'n') return 'neutral';
    return 'A';
}

function readAdminMenuState() {
    try {
        const parsed = JSON.parse(localStorage.getItem(ADMIN_MENU_STORAGE_KEY) || '{}');
        const mode = ['spawn', 'events', 'biome'].includes(parsed.mode)
            ? parsed.mode
            : (parsed.category === 'biome' ? 'biome' : 'spawn');
        return {
            mode,
            side: normalizeAdminSpawnSide(parsed.side),
            category: parsed.category === 'misc' ? 'misc' : 'entity',
            miscType: ['chest', 'corpse'].includes(parsed.miscType) ? parsed.miscType : null,
            miscStatus: String(parsed.miscStatus || '').trim().toLowerCase() || null,
            biomeClass: levelBiome.some(biome => biome.classe === parsed.biomeClass)
                ? parsed.biomeClass
                : null
        };
    } catch {
        return {
            mode: 'spawn',
            side: 'A',
            category: 'entity',
            miscType: null,
            miscStatus: null,
            biomeClass: null
        };
    }
}

function writeAdminMenuState(state) {
    try {
        localStorage.setItem(ADMIN_MENU_STORAGE_KEY, JSON.stringify(state));
    } catch {
        // La persistance admin ne doit jamais bloquer l'outil de debug.
    }
}

function readAdminInvincibleMode() {
    return localStorage.getItem(ADMIN_INVINCIBLE_MODE_STORAGE_KEY) === 'true';
}

function writeAdminInvincibleMode(enabled) {
    const active = enabled === true;
    window.__adminInvincibleMode = active;
    localStorage.setItem(ADMIN_INVINCIBLE_MODE_STORAGE_KEY, active ? 'true' : 'false');
}

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

function getAdminEventFirstChoiceNode(eventDefinition) {
    const nodes = eventDefinition?.nodes || {};
    const visited = new Set();
    let nodeId = eventDefinition?.startNodeId;

    for (let depth = 0; nodeId && depth < 40; depth += 1) {
        if (visited.has(nodeId)) break;
        visited.add(nodeId);

        const node = nodes[nodeId];
        if (!node) break;

        const choices = Array.isArray(node.choices) ? node.choices : [];
        if (choices.length > 0) return node;

        nodeId = node.next || null;
    }

    return null;
}

function getAdminEventResolutionBranches(eventDefinition, choice) {
    const outcomes = choice?.resolution?.outcomes;
    if (!outcomes || typeof outcomes !== 'object') return [];

    const approachLabel = getAdminEventApproachLabel(choice);
    const branches = [];
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

    return branches;
}

function getAdminEventChoiceTreeBranches(eventDefinition, nodeId, labels = [], visited = new Set()) {
    const nodes = eventDefinition?.nodes || {};
    const node = nodes[nodeId];
    if (!node || visited.has(nodeId)) return [];

    const nextVisited = new Set(visited);
    nextVisited.add(nodeId);

    const choices = Array.isArray(node.choices) ? node.choices : [];
    if (choices.length > 0) {
        return choices.flatMap(choice => {
            const resolutionBranches = getAdminEventResolutionBranches(eventDefinition, choice);
            if (resolutionBranches.length > 0) return resolutionBranches;
            if (!choice.next) return [];
            return getAdminEventChoiceTreeBranches(
                eventDefinition,
                choice.next,
                [...labels, String(choice.text || choice.id || '').trim()].filter(Boolean),
                nextVisited
            );
        });
    }

    if (labels.length === 0) return [];
    return [Object.freeze({
        id: `${eventDefinition.key || 'event'}-${nodeId}`,
        eventKey: eventDefinition.key,
        label: labels.join(' - '),
        startNodeId: nodeId
    })];
}

function getAdminEventBranches(eventDefinition) {
    if (Array.isArray(eventDefinition?.adminBranches)) {
        return eventDefinition.adminBranches
            .map((branch) => {
                const targetNodeId = branch?.startNodeId || branch?.nodeId || null;
                if (!targetNodeId || !eventDefinition.nodes?.[targetNodeId]) return null;

                return Object.freeze({
                    id: String(branch.id || `${eventDefinition.key || 'event'}-${targetNodeId}`),
                    eventKey: eventDefinition.key,
                    label: String(branch.label || targetNodeId),
                    group: branch.group == null ? null : String(branch.group),
                    startNodeId: String(targetNodeId)
                });
            })
            .filter(Boolean);
    }

    const firstChoiceNode = getAdminEventFirstChoiceNode(eventDefinition);
    if (!firstChoiceNode) return [];
    return getAdminEventChoiceTreeBranches(eventDefinition, firstChoiceNode.id);
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
            socle.style.opacity = '0';
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

    const selectedEntitiesA = [];
    const selectedEntitiesB = [];
    const selectedEntitiesNeutral = [];
    const selectedBaseSet = new Set();
    const menuState = readAdminMenuState();

    const form = document.createElement('form');
    form.id = 'admin-entity-form';
    form.dataset.activeSide = menuState.side;
    form.dataset.eventCount = String(ADMIN_EVENT_LIST.length);
    form.dataset.activeAdminTab = menuState.mode;
    form.innerHTML = '<h3>Sélectionner les entités (Admin)</h3>';
    form.addEventListener('submit', event => event.preventDefault());

    const createTabs = (id, entries, getActive, onSelect) => {
        const tabs = document.createElement('div');
        if (id) tabs.id = id;
        tabs.className = 'admin-side-tabs';
        tabs.style.display = 'flex';
        tabs.style.gap = '8px';
        tabs.style.marginBottom = '8px';

        entries.forEach(entry => {
            const button = document.createElement('button');
            button.type = 'button';
            button.classList.add('admin-tab-button');
            button.dataset.adminTabKey = entry.key;
            button.textContent = entry.label;
            const isActive = getActive() === entry.key;
            button.classList.toggle('active', isActive);
            button.classList.toggle('passive', !isActive);
            button.addEventListener('click', () => onSelect(entry.key));
            tabs.appendChild(button);
        });

        return tabs;
    };

    const modeTabs = createTabs('admin-side-tabs', [
        Object.freeze({ key: 'spawn', label: 'Spawn' }),
        Object.freeze({ key: 'events', label: 'Events' }),
        Object.freeze({ key: 'biome', label: 'Biome' })
    ], () => menuState.mode, key => {
        menuState.mode = key;
        menuState.miscType = null;
        menuState.miscStatus = null;
        viewStack.length = 0;
        persistAndRender();
    });

    const sideTabs = createTabs(null, ADMIN_SPAWN_SIDES, () => menuState.side, key => {
        menuState.side = key;
        form.dataset.activeSide = key;
        viewStack.length = 0;
        persistAndRender();
    });

    const categoryTabs = createTabs(null, [
        Object.freeze({ key: 'entity', label: 'Entity' }),
        Object.freeze({ key: 'misc', label: 'Misc' })
    ], () => menuState.category, key => {
        menuState.category = key;
        menuState.miscType = null;
        menuState.miscStatus = null;
        viewStack.length = 0;
        persistAndRender();
    });

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

    const resetLevelButton = document.createElement('button');
    resetLevelButton.type = 'button';
    resetLevelButton.textContent = 'Reset niveau';

    const invincibleModeButton = document.createElement('button');
    invincibleModeButton.type = 'button';
    invincibleModeButton.className = 'admin-tab-button admin-invincible-mode-button';

    const entityRows = [];
    const eventRows = [];
    const viewStack = [];
    let currentRows = [];

    const updateInvincibleModeButton = () => {
        const active = readAdminInvincibleMode();
        window.__adminInvincibleMode = active;
        invincibleModeButton.textContent = active
            ? 'Invincible mode : ON'
            : 'Invincible mode : OFF';
        invincibleModeButton.classList.toggle('active', active);
        invincibleModeButton.classList.toggle('passive', !active);
        invincibleModeButton.setAttribute('aria-pressed', String(active));
    };

    function persistAndRender() {
        writeAdminMenuState(menuState);
        renderShell();
        renderCurrentView();
    }

    const renderAdminList = (availableRows = currentRows) => {
        const query = normalizeAdminSearchText(searchInput.value);
        const displayedRows = getAdminSearchMatches(query, availableRows);

        clearSearchButton.disabled = query.length === 0;
        list.replaceChildren();

        if (displayedRows.length === 0) {
            const emptyMessage = document.createElement('p');
            emptyMessage.textContent = query
                ? 'Aucun résultat.'
                : 'Aucun élément disponible.';
            list.appendChild(emptyMessage);
            return;
        }

        list.append(...displayedRows.map(entry => entry.element));
    };

    const resetSearch = () => {
        searchInput.value = '';
        clearSearchButton.disabled = true;
    };

    searchInput.addEventListener('input', () => renderAdminList());
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

    const pushRowsView = (title, rows, placeholder, onBack) => {
        viewStack.push({ title, rows, placeholder, onBack });
        resetSearch();
        renderCurrentView();
    };

    const closeRowsView = () => {
        const view = viewStack.pop();
        view?.onBack?.();
        resetSearch();
        renderCurrentView();
    };

    const openEventBranches = (eventDefinition, eventTitle, branches, launchEvent, options = {}) => {
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
            if (typeof options.onBack === 'function') {
                options.onBack();
                return;
            }

            closeRowsView();
        };
        backRow.addEventListener('click', closeBranches);
        backRow.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            closeBranches();
        });

        const branchRows = [{
            element: backRow,
            searchText: `retour ${eventTitle}`
        }];

        const groupedBranches = !options.skipGrouping
            && branches.some(branch => branch.group);
        const displayedBranches = groupedBranches
            ? [...new Map(branches
                .filter(branch => branch.group)
                .map(branch => [branch.group, branch])).values()]
            : branches;

        displayedBranches.forEach(branch => {
            const branchRow = document.createElement('div');
            branchRow.className = 'admin-entity-row admin-event-row';
            branchRow.dataset.eventKey = eventDefinition.key;
            branchRow.dataset.eventBranch = branch.id;
            branchRow.setAttribute('role', 'button');
            branchRow.setAttribute('aria-disabled', 'false');
            branchRow.tabIndex = 0;

            const branchName = document.createElement('span');
            branchName.textContent = groupedBranches
                ? `${branch.group} >`
                : branch.label;

            const branchIdentity = document.createElement('span');
            branchIdentity.style.opacity = '0.7';
            branchIdentity.textContent = groupedBranches
                ? eventTitle
                : `ID ${eventDefinition.id} · v${eventDefinition.version || 1}`;

            branchRow.append(branchName, branchIdentity);
            const openOrLaunchBranch = () => {
                if (groupedBranches) {
                    openEventBranches(
                        eventDefinition,
                        `${eventTitle} > ${branch.group}`,
                        branches.filter(candidate => candidate.group === branch.group),
                        launchEvent,
                        { skipGrouping: true }
                    );
                    return;
                }

                launchEvent(branch);
            };

            branchRow.addEventListener('click', openOrLaunchBranch);
            branchRow.addEventListener('keydown', event => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                openOrLaunchBranch();
            });

            eventLaunchRows.push(branchRow);
            branchRows.push({
                element: branchRow,
                searchText: `${branch.group || ''} ${branch.label} ${eventTitle} ${eventDefinition.key}`
            });
        });

        pushRowsView(eventTitle, branchRows, 'Rechercher une branche…');
    };

    ADMIN_EVENT_LIST.forEach(eventDefinition => {
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

    const spawnEntity = async (entityBase, side, forcedPosition = null) => {
        if (window.levelRunning !== 'admin') return null;

        try {
            const created = await createEntityIngame(entityBase, { side, position: forcedPosition });
            if (side === 'A') selectedEntitiesA.push(created);
            else if (side === 'B') selectedEntitiesB.push(created);
            else selectedEntitiesNeutral.push(created);
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
            if (menuState.category === 'misc' && menuState.miscType === 'corpse' && menuState.miscStatus) {
                spawnAdminMisc({
                    side: menuState.side,
                    miscType: 'corpse',
                    status: menuState.miscStatus,
                    entity
                });
                return;
            }

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
            const payload = `ADMIN_SPAWN:${JSON.stringify(
                menuState.category === 'misc' && menuState.miscType === 'corpse' && menuState.miscStatus
                    ? { __adminSpawn: 1, kind: 'misc', side, miscType: 'corpse', status: menuState.miscStatus, entity }
                    : { __adminSpawn: 1, kind: 'entity', side, entity }
            )}`;
            event.dataTransfer.setData('text/plain', payload);
            event.dataTransfer.effectAllowed = 'copy';
        });

        entityRows.push({
            element: row,
            searchText: entity.name
        });
    });

    const createRow = ({
        label,
        identity = '',
        searchText = label,
        draggable = false,
        payload = null,
        onClick = null
    }) => {
        const row = document.createElement('div');
        row.className = 'admin-entity-row';
        row.draggable = Boolean(draggable);
        row.setAttribute('role', onClick ? 'button' : 'listitem');
        if (onClick) row.tabIndex = 0;

        const name = document.createElement('span');
        name.textContent = label;

        const details = document.createElement('span');
        details.style.opacity = '0.7';
        details.textContent = identity;
        row.append(name, details);

        if (onClick) {
            row.addEventListener('click', onClick);
            row.addEventListener('keydown', event => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                onClick();
            });
        }

        if (draggable && payload) {
            row.addEventListener('dragstart', event => {
                const data = typeof payload === 'function' ? payload() : payload;
                event.dataTransfer.setData('text/plain', `ADMIN_SPAWN:${JSON.stringify(data)}`);
                event.dataTransfer.effectAllowed = 'copy';
            });
        }

        return { element: row, searchText };
    };

    const getDefaultCorpseEntity = () => entityCatalog.find(entity => (
        String(entity?.name || entity?.nom || '').toLowerCase().includes('porc')
    )) || entityCatalog[0] || null;

    const spawnAdminMisc = async ({
        side,
        miscType,
        status = 'lootable',
        entity = null,
        position = null
    } = {}) => {
        if (window.levelRunning !== 'admin') return null;

        try {
            const eventsApi = await import('./events.js');
            if (miscType === 'chest') {
                return eventsApi.spawnChest({
                    side,
                    status,
                    position,
                    spawnMode: position ? 'in-place' : 'drop',
                    forceNew: true,
                    random: true,
                    eventKey: 'admin-spawn'
                });
            }

            const corpseEntity = entity || getDefaultCorpseEntity();
            return eventsApi.spawnDead({
                side,
                status,
                serial: corpseEntity?.serial ?? null,
                entityName: corpseEntity?.name || corpseEntity?.nom || 'Porc des bas-fonds',
                createOptions: position ? { position } : {},
                eventKey: 'admin-spawn'
            });
        } catch (error) {
            console.error('❌ Création du misc admin impossible :', error);
            eventStatus.textContent = `Échec spawn misc : ${error?.message || error}`;
            eventStatus.hidden = false;
            return null;
        }
    };

    const miscPayload = (miscType, status = 'lootable', entity = null) => ({
        __adminSpawn: 1,
        kind: 'misc',
        side: menuState.side,
        miscType,
        status,
        ...(entity ? { entity } : {})
    });

    const renderMiscRoot = () => [
        createRow({
            label: 'Chest >',
            identity: 'lootable par défaut',
            draggable: true,
            payload: () => miscPayload('chest'),
            onClick: () => {
                menuState.miscType = 'chest';
                menuState.miscStatus = null;
                persistAndRender();
            }
        }),
        createRow({
            label: 'Corpse >',
            identity: 'lootable par défaut',
            draggable: true,
            payload: () => miscPayload('corpse'),
            onClick: () => {
                menuState.miscType = 'corpse';
                menuState.miscStatus = null;
                persistAndRender();
            }
        })
    ];

    const backToMiscRow = (label = '< Retour misc') => createRow({
        label,
        identity: menuState.side === 'neutral' ? 'Neutral' : `Side ${menuState.side}`,
        onClick: () => {
            menuState.miscType = null;
            menuState.miscStatus = null;
            persistAndRender();
        }
    });

    const renderChestStatusRows = () => [
        backToMiscRow(),
        ...ADMIN_CHEST_STATUSES.map(status => createRow({
            label: status.label,
            identity: 'Chest',
            draggable: true,
            payload: () => miscPayload('chest', status.key),
            onClick: () => spawnAdminMisc({
                side: menuState.side,
                miscType: 'chest',
                status: status.key
            })
        }))
    ];

    const renderCorpseStatusRows = () => [
        backToMiscRow(),
        ...ADMIN_CORPSE_STATUSES.map(status => createRow({
            label: `${status.label} >`,
            identity: 'Corpse',
            draggable: true,
            payload: () => miscPayload('corpse', status.key),
            onClick: () => {
                menuState.miscStatus = status.key;
                persistAndRender();
            }
        }))
    ];

    const renderCorpseEntityRows = () => [
        createRow({
            label: '< Retour corpse',
            identity: menuState.miscStatus || '',
            onClick: () => {
                menuState.miscStatus = null;
                persistAndRender();
            }
        }),
        ...entityRows
    ];

    const applyAdminBiome = async (biome, options = {}) => {
        try {
            const { applyBiomeRealtime } = await import('./board.js');
            const applied = applyBiomeRealtime(biome.classe, options);
            eventStatus.textContent = applied
                ? `Biome appliqué : ${biome.name || biome.classe}.`
                : `Biome introuvable : ${biome.classe}.`;
            eventStatus.hidden = false;
        } catch (error) {
            console.error('❌ Changement de biome impossible :', error);
            eventStatus.textContent = `Échec biome : ${error?.message || error}`;
            eventStatus.hidden = false;
        }
    };

    const createBiomeRow = (biome) => {
        const row = document.createElement('div');
        row.className = 'admin-entity-row admin-biome-row';
        row.setAttribute('role', 'button');
        row.setAttribute('aria-disabled', 'false');
        row.tabIndex = 0;

        const name = document.createElement('span');
        name.textContent = biome.name || biome.classe;

        const details = document.createElement('span');
        details.style.opacity = '0.7';
        details.textContent = biome.classe;

        const arrow = document.createElement('button');
        arrow.type = 'button';
        arrow.className = 'admin-biome-size-button';
        arrow.textContent = '>';
        arrow.setAttribute('aria-label', `Tailles ${biome.name || biome.classe}`);

        row.append(name, details, arrow);

        const applySkinOnly = () => applyAdminBiome(biome);
        const openSizes = (event = null) => {
            event?.stopPropagation?.();
            menuState.biomeClass = biome.classe;
            persistAndRender();
        };

        row.addEventListener('click', applySkinOnly);
        row.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            applySkinOnly();
        });
        arrow.addEventListener('click', openSizes);

        return {
            element: row,
            searchText: `${biome.name || ''} ${biome.classe || ''} small medium large`
        };
    };

    const renderBiomeRows = () => levelBiome.map(createBiomeRow);

    const renderBiomeSizeRows = () => {
        const biome = levelBiome.find(candidate => candidate.classe === menuState.biomeClass);
        if (!biome) {
            menuState.biomeClass = null;
            return renderBiomeRows();
        }

        return [
            createRow({
                label: '< Retour biomes',
                identity: biome.name || biome.classe,
                onClick: () => {
                    menuState.biomeClass = null;
                    persistAndRender();
                }
            }),
            ...[
                { key: 'small', label: 'Small' },
                { key: 'medium', label: 'Medium' },
                { key: 'large', label: 'Large' }
            ].map(size => createRow({
                label: size.label,
                identity: biome.name || biome.classe,
                searchText: `${biome.name || ''} ${biome.classe || ''} ${size.label}`,
                onClick: () => applyAdminBiome(biome, { size: size.key })
            }))
        ];
    };

    function renderShell() {
        form.dataset.activeAdminTab = menuState.mode;
        form.dataset.activeSide = menuState.side;
        modeTabs.querySelectorAll('button').forEach(button => {
            const isActive = button.dataset.adminTabKey === menuState.mode;
            button.classList.toggle('active', isActive);
            button.classList.toggle('passive', !isActive);
        });
        sideTabs.querySelectorAll('button').forEach(button => {
            const isActive = button.dataset.adminTabKey === menuState.side;
            button.classList.toggle('active', isActive);
            button.classList.toggle('passive', !isActive);
        });
        categoryTabs.querySelectorAll('button').forEach(button => {
            const isActive = button.dataset.adminTabKey === menuState.category;
            button.classList.toggle('active', isActive);
            button.classList.toggle('passive', !isActive);
        });

        const showSpawnOptions = menuState.mode === 'spawn';
        sideTabs.style.display = showSpawnOptions ? 'flex' : 'none';
        categoryTabs.style.display = showSpawnOptions ? 'flex' : 'none';
        spawnButton.hidden = menuState.mode !== 'spawn' || menuState.category !== 'entity';
        resetLevelButton.hidden = false;
        eventStatus.hidden = !eventStatus.textContent;
    }

    function renderCurrentView() {
        if (viewStack.length > 0) {
            const view = viewStack[viewStack.length - 1];
            currentRows = view.rows;
            searchInput.placeholder = view.placeholder;
            renderAdminList();
            return;
        }

        if (menuState.mode === 'events') {
            currentRows = eventRows;
            searchInput.placeholder = 'Rechercher un événement…';
        } else if (menuState.mode === 'biome') {
            currentRows = menuState.biomeClass
                ? renderBiomeSizeRows()
                : renderBiomeRows();
            searchInput.placeholder = menuState.biomeClass
                ? 'Rechercher une taille…'
                : 'Rechercher un biome…';
        } else if (menuState.category === 'entity') {
            currentRows = entityRows;
            searchInput.placeholder = 'Rechercher une entité…';
        } else if (!menuState.miscType) {
            currentRows = renderMiscRoot();
            searchInput.placeholder = 'Rechercher un élément misc…';
        } else if (menuState.miscType === 'chest') {
            currentRows = renderChestStatusRows();
            searchInput.placeholder = 'Rechercher un coffre…';
        } else if (!menuState.miscStatus) {
            currentRows = renderCorpseStatusRows();
            searchInput.placeholder = 'Rechercher un type de cadavre…';
        } else {
            currentRows = renderCorpseEntityRows();
            searchInput.placeholder = 'Rechercher une entité pour le cadavre…';
        }

        renderAdminList();
    }

    spawnButton.addEventListener('click', async () => {
        const side = form.dataset.activeSide || 'A';
        for (const serializedEntity of selectedBaseSet) {
            await spawnEntity(JSON.parse(serializedEntity), side);
        }
        assignUniqueIDToEntities(selectedEntitiesA);
        assignUniqueIDToEntities(selectedEntitiesB);
        assignUniqueIDToEntities(selectedEntitiesNeutral);
    });

    resetLevelButton.addEventListener('click', async () => {
        let restoreAdminBattleActions = null;

        try {
            const {
                StopGame,
                resetBattleResolution,
                manageBattleActions,
                BATTLE_ACTION_MODE
            } = await import('./gameState.js');
            StopGame();
            resetBattleResolution();
            restoreAdminBattleActions = () => manageBattleActions({
                mode: BATTLE_ACTION_MODE.START,
                dialogueActive: false,
                entityList: entites
            });
        } catch (error) {
            console.warn('Reset admin : arrêt combat partiel.', error);
        }

        try {
            const { resetActiveEventsImmediately } = await import('./events.js');
            resetActiveEventsImmediately({ resetSource: 'admin-level-reset' });
        } catch (error) {
            console.warn('Reset admin : arrêt event partiel.', error);
        }

        try {
            const { clearProjectileEffects } = await import('./entitesAnimation.js');
            clearProjectileEffects(entites);
        } catch (error) {
            console.warn('Reset admin : nettoyage projectiles partiel.', error);
        }

        document.querySelectorAll(
            '#hexGrid .entite-box, #hexGrid .battle-element, .loot-interface, .destroyed-corpse, .event-dialogue-overlay, .projectile-parent, .projectile-impacte'
        ).forEach(element => element.remove());
        document.querySelectorAll('#hexGrid .hex').forEach(hex => {
            hex.classList.remove('occupied', 'focused');
            delete hex.dataset.occupiedBy;
            const socle = hex.querySelector('.socle');
            if (socle) {
                socle.style.opacity = '0';
                socle.style.filter = '';
            }
            hex.querySelectorAll('.focused').forEach(node => node.classList.remove('focused'));
        });
        entites.splice(0, entites.length);

        const chestStorage = loadFromLocalStorage('ChestLoot', { chests: [] });
        if (Array.isArray(chestStorage.chests)) {
            chestStorage.chests = chestStorage.chests.filter(chest => (
                String(chest?.level ?? chest?.stageId ?? '') !== String(currentStageId)
            ));
            saveToLocalStorage('ChestLoot', chestStorage);
        }

        const corpseStorage = loadFromLocalStorage('PersistentCorpseLootSources', { corpses: [] });
        if (Array.isArray(corpseStorage.corpses)) {
            corpseStorage.corpses = corpseStorage.corpses.filter(corpse => (
                String(corpse?.level ?? corpse?.stageId ?? '') !== String(currentStageId)
            ));
            saveToLocalStorage('PersistentCorpseLootSources', corpseStorage);
        }

        selectedEntitiesA.length = 0;
        selectedEntitiesB.length = 0;
        selectedEntitiesNeutral.length = 0;
        selectedBaseSet.clear();
        restoreAdminBattleActions?.();
        eventStatus.textContent = 'Niveau admin réinitialisé.';
        eventStatus.hidden = false;
        renderCurrentView();
    });

    invincibleModeButton.addEventListener('click', () => {
        writeAdminInvincibleMode(!readAdminInvincibleMode());
        updateInvincibleModeButton();
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

        const side = normalizeAdminSpawnSide(payload.side);
        if (payload.kind === 'misc') {
            await spawnAdminMisc({
                side,
                miscType: payload.miscType,
                status: payload.status,
                entity: payload.entity,
                position: hex.dataset.position
            });
            return;
        }

        const created = await spawnEntity(payload.entity, side, hex.dataset.position);
        if (!created) return;

        assignUniqueIDToEntities(selectedEntitiesA);
        assignUniqueIDToEntities(selectedEntitiesB);
        assignUniqueIDToEntities(selectedEntitiesNeutral);
    };

    window.__adminDropInterceptor = adminDropInterceptor;
    document.addEventListener('drop', adminDropInterceptor, true);

    updateInvincibleModeButton();
    form.append(modeTabs, sideTabs, categoryTabs, searchTools, eventStatus, list, spawnButton, invincibleModeButton, resetLevelButton, closeButton);
    document.body.appendChild(form);
    renderShell();
    renderCurrentView();

    return { A: selectedEntitiesA, B: selectedEntitiesB, neutral: selectedEntitiesNeutral };
}

// Alias temporaire pour les anciens imports pendant la migration.
export const selectAdminEntitiesForSideB = initializeAdminLevel;
export const enableDeleteKeyForFocusedEntity = enableAdminDeleteKey;
