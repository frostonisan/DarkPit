import { saveStageConfig, loadFromLocalStorage, saveToLocalStorage, getOrCreateGameData,getOrCreateGameID, setCurrentLevel, getStageChests, getOrCreateStageChest, stageHasRewardChest } from './GameStorage.js';
import { PlayerArmyCodex } from './GameInit.js';
import { generateUniqueID, entitesNestUp } from './entites.js';
import { launchLevel, createQuitButton } from './game.js';
import { spawnEntiteIngame } from './createEntity.js';
import { cleanupAdminLevel, initializeAdminLevel } from './admin.js?catalog=20260823i';

function syncStageReward(stageId, reward) {
    const gameStages = JSON.parse(localStorage.getItem('GameStages')) || { stages: [] };
    const storedStage = gameStages.stages.find(stage => String(stage.id) === String(stageId));
    if (!storedStage) return;

    if (reward === 'chest') storedStage.reward = 'chest';
    else delete storedStage.reward;

    localStorage.setItem('GameStages', JSON.stringify(gameStages));
}

function syncStageSurpriseAttack(stageId, surpriseAttack) {
    const gameStages = JSON.parse(localStorage.getItem('GameStages')) || { stages: [] };
    const storedStage = gameStages.stages.find(stage => String(stage.id) === String(stageId));
    if (!storedStage) return;

    if (surpriseAttack === 'sideA' || surpriseAttack === 'sideB') {
        storedStage.surpriseAttack = surpriseAttack;
    } else {
        delete storedStage.surpriseAttack;
    }

    localStorage.setItem('GameStages', JSON.stringify(gameStages));
}


function dispatchPersistentStageChests(stageId) {
    const persistentChests = getStageChests(stageId, {
        includeDestroyed: true,
    });
    const detail = {
        stageId: String(stageId),
        chests: persistentChests,
        // Un coffre restauré ne doit jamais rejouer sa chute initiale.
        spawnMode: 'in-place',
    };

    // Le DOM du niveau est créé de façon asynchrone par launchLevel.
    // Plusieurs émissions garantissent la restauration sans F5, tandis que loot.js
    // déduplique les coffres par leur identifiant persistant.
    [0, 50, 150, 300, 600, 1000, 1500, 2200, 3200].forEach(delay => {
        setTimeout(() => {
            const activeStageId = String(
                window.currentStageId ??
                localStorage.getItem('currentStageId') ??
                ''
            );

            // Un callback retardé d'un ancien niveau ne doit jamais injecter
            // ses coffres dans le niveau actuellement affiché.
            if (activeStageId !== String(stageId)) return;

            window.dispatchEvent(new CustomEvent('stageChestsLoaded', { detail }));
        }, delay);
    });
}

function configureFinishedLevelControls(stage) {
    if (!stage?.victory) return;

    const removeCombatControls = () => {
        const selectors = [
            '#startButton',
            '#fleeButton',
            '#escapeButton',
            '.start-button',
            '.fight-button',
            '.launch-fight-button',
            '.battle-start-button',
            '.flee-button',
            '.escape-button',
            '.run-away-button',
            '[data-action="start-fight"]',
            '[data-action="launch-combat"]',
            '[data-action="flee"]',
            '[data-action="escape"]'
        ];
        document.querySelectorAll(selectors.join(',')).forEach(control => control.remove());
    };

    removeCombatControls();
    createQuitButton();

    if (typeof MutationObserver !== 'undefined') {
        const observer = new MutationObserver(removeCombatControls);
        observer.observe(document.documentElement, { childList: true, subtree: true });
        setTimeout(() => observer.disconnect(), 3000);
    }
}

export function launchCurrentLevelFromStorage() {
    const stageId = localStorage.getItem('currentStageId');
    if (!stageId) {
        console.warn("Aucun ID de niveau en cours trouvé dans le localStorage (clé : currentStageId).");
        return;
    }

    const allStages = JSON.parse(localStorage.getItem('GameStages'))?.stages || [];
    const stage = allStages.find(s => String(s.id) === String(stageId));

    if (!stage) {
        console.error(`Aucun stage trouvé avec l'ID : ${stageId}`);
        return;
    }

    const {
        biome_serial: biome,
        level_type,
        difficulty,
        scripted_entites,
        surpriseAttack
    } = stage;

    // --- Met à jour le niveau courant ---
    setLevelRunning(level_type || 'randomized');
    window.currentStageId = stageId;
    localStorage.setItem('currentStageId', stageId);
    setCurrentLevel(stageId);

    // --- Met à jour statut et classes CSS comme dans initializeButtonClicks ---
    let gameStageData = JSON.parse(localStorage.getItem('GameStages')) || { stages: [] };
    const stageIndex = gameStageData.stages.findIndex(s => String(s.id) === String(stageId));

    if (stageIndex !== -1) {
        if (!gameStageData.stages[stageIndex].victory) gameStageData.stages[stageIndex].statut = 'visited';
        gameStageData.stages[stageIndex].level_type = level_type || 'randomized';
        localStorage.setItem('GameStages', JSON.stringify(gameStageData));
    } else {
        console.warn(`⚠️ Stage ID ${stageId} n'existe pas dans GameStages.`);
    }

    if (typeof applyLevelStatusClasses === 'function') {
        applyLevelStatusClasses();
    }

    // --- Maintenant, lance vraiment le niveau ---
    launchLevel({
        biome,
        difficulty: difficulty || {
            totalpoints: null,
            moyennepower: null,
            maxutilisation: null,
            variation: null,
            difficulte: null,
            lord: null
        },
        scripted_entites: level_type === 'scripted' ? scripted_entites : undefined,
        surpriseAttack
    });

    if (window.levelRunning === 'admin') {
        initializeAdminLevel(entitesNestUp);
    }

    if (stageHasRewardChest(stage)) {
        getOrCreateStageChest(stage);
        dispatchPersistentStageChests(stageId);
    }
    configureFinishedLevelControls(stage);

    const persistentChests = stageHasRewardChest(stage)
        ? getStageChests(stageId, { includeDestroyed: true })
        : [];
    if (persistentChests.length) {
        console.log(`📦 ${persistentChests.length} coffre(s) persistant(s) chargé(s) pour le stage ${stageId}.`);
    }

    console.log(`🚀 Niveau ${stageId} lancé automatiquement avec succès (type : ${window.levelRunning})`);
}

function setLevelRunning(type) {
    if (type === 'scripted' || type === 'randomized' || type === 'admin') {
        window.levelRunning = type;
    } else {
        window.levelRunning = 'randomized';
    }
    if (window.levelRunning !== 'admin') cleanupAdminLevel();
    console.log(`🔄 Niveau en cours : levelRunning = ${window.levelRunning}`);
}

function createStageButtonDOM(stage, container, storageId) {
    // 🔒 Sécurité : ne PAS créer de bouton si on est dans un niveau
    if (window.levelRunning && window.levelRunning !== 'worldmap') {
        console.warn('⛔ Tentative de créer un bouton de stage pendant un niveau, annulé.');
        return;
    }

    const finalStorageId = storageId ?? generateUniqueID();
    const stageDiv = document.createElement('div');
    stageDiv.className = `LevelButton ${stage.type}`;
    stageDiv.style.position = 'absolute';
    stageDiv.style.display = 'flex';
    stageDiv.style.flexDirection = 'column';
    stageDiv.style.alignItems = 'center';

    if (stage.position.top) stageDiv.style.top = stage.position.top;
    if (stage.position.left) stageDiv.style.left = stage.position.left;
    if (stage.position.right) stageDiv.style.right = stage.position.right;

    const buttonDiv = document.createElement('div');
    buttonDiv.className = `level-button ${stage.type}`;

    buttonDiv.setAttribute('data-leveltype', stage.type);

    // 🔍 Lire le statut du localStorage si disponible
    let statuts = JSON.parse(localStorage.getItem('GameStages'))?.stages || [];
    let foundStage = statuts.find(s => String(s.id) === String(finalStorageId));
    let statut = foundStage?.statut || 'unknown';
    buttonDiv.setAttribute('data-statut', statut);

    if (stage.type === 'scripted') {
        buttonDiv.setAttribute('data-sbires', JSON.stringify(stage.sbires));
        buttonDiv.setAttribute('data-lords', JSON.stringify(stage.lords));
    } else if (stage.type === 'randomized') {
        buttonDiv.setAttribute('data-totalpoints', stage.totalpoints);
        buttonDiv.setAttribute('data-moyennepower', stage.moyennepower);
        buttonDiv.setAttribute('data-maxutilisation', stage.maxutilisation);
        buttonDiv.setAttribute('data-variation', stage.variation);
        buttonDiv.setAttribute('data-difficulte', stage.difficulte);
        buttonDiv.setAttribute('data-lord', stage.lord);
    }

    buttonDiv.setAttribute('data-biome', stage.biome);
    buttonDiv.setAttribute('data-storageid', finalStorageId);
    if (Array.isArray(stage.adminTabs) && stage.adminTabs.length > 0) {
        buttonDiv.setAttribute('data-admintabs', JSON.stringify(stage.adminTabs));
    }
    if (stage.reward) buttonDiv.setAttribute('data-reward', stage.reward);
    if (stage.surpriseAttack) {
        buttonDiv.setAttribute('data-surpriseattack', stage.surpriseAttack);
    }

    const levelNameSpan = document.createElement('span');
    levelNameSpan.className = 'IngameAlert levelname';
    levelNameSpan.textContent = stage.levelName;

    stageDiv.appendChild(buttonDiv);
    stageDiv.appendChild(levelNameSpan);
    container.appendChild(stageDiv);
}



export function initializeTooltips() {
    document.querySelectorAll('.LevelButton').forEach(button => {
        const levelButton = button.querySelector('.level-button');
        if (!levelButton) return;

        button.addEventListener('mouseenter', () => {
            const levelType = levelButton.dataset.leveltype || 'Inconnu';
            const storageId = levelButton.dataset.storageid || 'Inconnu';
            const biome = levelButton.dataset.biome || 'Inconnu';
            const statut = levelButton.dataset.statut || 'unknown';
            const reward = levelButton.dataset.reward || null;

            const totalpoints = levelButton.dataset.totalpoints;
            const moyennepower = levelButton.dataset.moyennepower;
            const maxutilisation = levelButton.dataset.maxutilisation;
            const variation = levelButton.dataset.variation;
            const difficulte = levelButton.dataset.difficulte;
            const lord = levelButton.dataset.lord;

            const infosDisponibles = [totalpoints, moyennepower, maxutilisation, variation, difficulte, lord].every(val =>
                val !== null && val !== undefined && val !== ''
            );

            const fightInfos = document.createElement('div');
            fightInfos.className = 'fightInfos';

            let tooltipHTML = `
                <strong>Infos du niveau :</strong><br>
                Type : ${levelType}<br>
                Biome : ${biome}<br>
                Statut : ${statut}<br>
                ${reward ? `Récompense : ${reward}<br>` : ''}`; 

            if (infosDisponibles) {
                tooltipHTML += `
                    Total points : ${totalpoints}<br>
                    Niveau moyen : ${moyennepower}<br>
                    Max utilisation : ${maxutilisation}<br>
                    Variation : ${variation}<br>
                    Difficulté : ${difficulte}<br>
                    Lords : ${lord}<br>`;
            } else {
                tooltipHTML += `Données insuffisantes !<br>`;
            }

            tooltipHTML += `ID : ${storageId}<br>`;
            fightInfos.innerHTML = tooltipHTML;

            button.appendChild(fightInfos);
        });

        button.addEventListener('mouseleave', () => {
            const existingFightInfos = button.querySelector('.fightInfos');
            if (existingFightInfos) existingFightInfos.remove();
        });
    });
}


function generateStageButtons(StageData, type) {
    const container = document.getElementById('game-windows');
    if (!container) return console.error("Element with ID 'game-windows' not found.");

    StageData.forEach(stage => {
        stage.type = type;
        createStageButtonDOM(stage, container);
    });
}

 // sbires: [{serial:9, level:5}, {serial:1, level:5}],  
// Fonction pour déterminer et générer tous les boutons de niveau
export function determineAndGenerateButtons() {
    const ScriptedStagesData = [
        {
            biome: "prison",
            sbires: [{ serial: 7, level: 5 }],
            lords: [],
            levelName: "Le Marécage Scripté",
            position: { top: "50%", left: "68%" },
            type: "scripted", reward: "chest"
        }
    ];

    const RandomizedStagesData = [
        { biome: "marecage", totalpoints: 25, moyennepower: 3, maxutilisation: 4, variation: 15, difficulte: 1, lord: 1, levelName: "Le Marécage", position: { top: "54%", left: "52%" }, type: "randomized" },
        { biome: "prison", totalpoints: 15, moyennepower: 3, maxutilisation: 3, variation: 10, difficulte: 1, lord: 0, levelName: "La Prison", position: { top: "50%", left: "26%" }, type: "randomized" },
        { biome: "prison", totalpoints: 5, moyennepower: 5, maxutilisation: 3, variation: 1, difficulte: 0, lord: 0, levelName: "Admin", position: { top: "20%", left: "56%" }, type: "randomized" },
        { biome: "desert", totalpoints: 40, moyennepower: 7, maxutilisation: 2, variation: 20, difficulte: 0, lord: 2, levelName: "Le Désert", position: { top: "80%", left: "61%" }, type: "randomized", surpriseAttack: "sideA" },
        { biome: "glacier", totalpoints: 60, moyennepower: 15, maxutilisation: 1, variation: 25, difficulte: 5, lord: 1, levelName: "Le Glacier", position: { top: "14%", right: "73%" }, type: "randomized", reward: "chest", surpriseAttack: "sideB" }
    ];

    const AdminStagesData = [
        {
            biome: "marecage",
            levelName: "admin island",
            position: { top: "6%", left: "89%" },
            type: "admin",
            adminTabs: ["entities", "events"]
        }
    ];

    const container = document.getElementById('game-windows');
    if (!container) return console.error("Element #game-windows introuvable.");

    const gameData = getOrCreateGameData();

// Scripted
ScriptedStagesData.forEach((stage, index) => {
    let id = gameData.scriptedLevels[index];

    if (!id) {
        id = generateUniqueID();
        gameData.scriptedLevels[index] = id;
        gameData.gameIDs.push(id);
    }

    const storageId = String(id); // Toujours string
    const biome = stage.biome;
    const scripted_entites = { sbires: stage.sbires, lords: stage.lords };
    const difficulty = {
        totalpoints: null,
        moyennepower: null,
        maxutilisation: null,
        variation: null,
        difficulte: null,
        lord: null
    };

    const stageData = {
        id: storageId,
        biome_serial: biome,
		statut: 'unknown',
        difficulty,
        ArmyB_id: `ArmyB_${storageId}`,
        level_type: 'scripted',
        scripted_entites,
        ...(stage.surpriseAttack ? { surpriseAttack: stage.surpriseAttack } : {}),
        ...(stage.reward === 'chest' ? { reward: 'chest' } : {})
    };

    // Charger l'existant
    let stages = JSON.parse(localStorage.getItem('GameStages')) || { stages: [] };
    
    // Vérifier si le stage existe déjà (en string ou number)
    const alreadyExists = stages.stages.some(s => String(s.id) === storageId);

    // Si non, on ajoute la bonne version
    if (!alreadyExists) {
        stages.stages.push(stageData);
        localStorage.setItem('GameStages', JSON.stringify(stages));
        // console.log(`✅ Stage scripted ajouté : ${storageId}`);
    } else {
        // console.log(`ℹ️ Stage scripted déjà présent : ${storageId}`);
    }

    syncStageReward(storageId, stage.reward);
    syncStageSurpriseAttack(storageId, stage.surpriseAttack);
    createStageButtonDOM(stage, container, storageId);
});


    // Randomized
    RandomizedStagesData.forEach((stage, index) => {
        let id = gameData.randomLevels[index];
        if (!id) {
            id = generateUniqueID();
            gameData.randomLevels[index] = id;
            gameData.gameIDs.push(id);
        }

        const difficulty = {
            totalpoints: stage.totalpoints,
            moyennepower: stage.moyennepower,
            maxutilisation: stage.maxutilisation,
            variation: stage.variation,
            difficulte: stage.difficulte,
            lord: stage.lord
        };

        saveStageConfig(stage.biome, difficulty, id, null, 'randomized');
        syncStageReward(id, stage.reward);
        syncStageSurpriseAttack(id, stage.surpriseAttack);
        createStageButtonDOM(stage, container, id);
    });

    // Admin (aucun ID fixe ni sauvegarde à faire)
    generateStageButtons(AdminStagesData, 'admin');

    // Final save
    gameData.lastUpdated = new Date().toISOString();
    localStorage.setItem("gameData", JSON.stringify(gameData));
}

// Fonction pour gérer les clics sur les boutons Generatelevel-button
export function initializeButtonClicks() {
    document.querySelectorAll('.level-button').forEach(button => {
        button.addEventListener('click', function () {

            // Vérifie si l'ID du niveau existe ou le génère
            let storageId = button.getAttribute('data-storageid') || generateUniqueID();
			const levelWrapper = button.closest('.LevelButton');
const levelName = levelWrapper?.querySelector('.levelname')?.textContent?.trim() || "Stage inconnu";
            const levelType = button.classList.contains('scripted') ? 'scripted' 
                : button.classList.contains('admin') ? 'admin' 
                : 'randomized';
            const reward = button.dataset.reward || null;
            const buttonSurpriseAttack = button.dataset.surpriseattack || null;
            let adminTabs = [];
            try {
                const parsedAdminTabs = JSON.parse(button.dataset.admintabs || '[]');
                adminTabs = Array.isArray(parsedAdminTabs) ? parsedAdminTabs : [];
            } catch (error) {
                console.warn('Configuration des onglets admin invalide :', error);
            }

            setLevelRunning(levelType);

            if (!storageId) {
                console.error("Aucun storageId trouvé pour ce bouton !");
                return;
            }

            let gameStageData = JSON.parse(localStorage.getItem('GameStages')) || { stages: [] };
            let stageIndex = gameStageData.stages.findIndex(stage => stage.id === storageId);

            // Variables à remplir
            let biome, totalpoints, moyennepower, maxutilisation, variation, difficulte, lord;
            let surpriseAttack = buttonSurpriseAttack;
            let sbires = [], lords = [];

if (stageIndex !== -1) {
    console.log(`Stage existant trouvé (ID : ${storageId}). Chargement des paramètres existants.`);
    let existingStage = gameStageData.stages[stageIndex];
existingStage.levelName = levelName;
    if (levelType === 'admin') existingStage.adminTabs = adminTabs;
    if (reward === 'chest') existingStage.reward = 'chest';
    else delete existingStage.reward;
    surpriseAttack = existingStage.surpriseAttack || buttonSurpriseAttack;
    if (surpriseAttack) existingStage.surpriseAttack = surpriseAttack;
    else delete existingStage.surpriseAttack;
    biome = existingStage.biome_serial;

    if (existingStage.level_type === 'scripted') {
        sbires = existingStage.scripted_entites?.sbires || [];
        lords = existingStage.scripted_entites?.lords || [];
        totalpoints = moyennepower = maxutilisation = variation = difficulte = lord = null;
    } else {
        ({ totalpoints, moyennepower, maxutilisation, variation, difficulte, lord } = existingStage.difficulty);
    }

    window.currentStageId = storageId;
    localStorage.setItem('currentStageId', storageId);

    // ✅ Mise à jour du statut
  if (!existingStage.victory) existingStage.statut = 'visited';
button.setAttribute('data-statut', existingStage.victory ? 'finished' : 'visited');
localStorage.setItem('GameStages', JSON.stringify(gameStageData));

    button.setAttribute('data-statut', 'visited');
    applyLevelStatusClasses();

    existingStage.level_type = levelType;
    localStorage.setItem('GameStages', JSON.stringify(gameStageData));
}
 else {
                console.log(`Aucun stage trouvé avec l'ID ${storageId}. Création d'un nouveau stage.`);

                biome = button.dataset.biome || 'defaultBiome';

                if (levelType === 'scripted') {
                    totalpoints = moyennepower = maxutilisation = variation = difficulte = lord = null;
                    sbires = JSON.parse(button.getAttribute('data-sbires') || '[]');
                    lords = JSON.parse(button.getAttribute('data-lords') || '[]');
                } else {
                    totalpoints = parseInt(button.dataset.totalpoints) || 100;
                    moyennepower = parseInt(button.dataset.moyennepower) || 5;
                    maxutilisation = parseInt(button.dataset.maxutilisation) || 4;
                    variation = parseInt(button.dataset.variation) || 15;
                    difficulte = parseInt(button.dataset.difficulte) || 0;
                    lord = parseInt(button.dataset.lord) || 0;
                }

                let difficulty = { totalpoints, moyennepower, maxutilisation, variation, difficulte, lord };

          let newStage = {
    id: storageId,
    biome_serial: biome,
    levelName,
    statut: 'unknown',
    difficulty,
    ArmyB_id: `ArmyB_${storageId}`,
    level_type: levelType,
    ...(levelType === 'admin' && adminTabs.length > 0 ? { adminTabs } : {}),
    ...(surpriseAttack ? { surpriseAttack } : {}),
    ...(reward === 'chest' ? { reward: 'chest' } : {})
};

                if (levelType === 'scripted') {
                    newStage.scripted_entites = { sbires, lords };
                }

                gameStageData.stages.push(newStage);
                localStorage.setItem('GameStages', JSON.stringify(gameStageData));

                window.currentStageId = storageId;
                localStorage.setItem('currentStageId', storageId);

                console.log("Nouveau stage sauvegardé avec l'ID :", storageId);
            }
setCurrentLevel(storageId);
            // Charge ou actualise le script game.js avec les paramètres appropriés
launchLevel({
  biome,
  difficulty: { totalpoints, moyennepower, maxutilisation, variation, difficulte, lord },
  surpriseAttack
});

if (levelType === 'admin') {
    initializeAdminLevel(entitesNestUp);
}

const launchedStage = gameStageData.stages.find(stage => String(stage.id) === String(storageId));
if (stageHasRewardChest(launchedStage)) {
    getOrCreateStageChest(launchedStage);
    dispatchPersistentStageChests(storageId);
}
configureFinishedLevelControls(launchedStage);

        });
    });
}

export function applyLevelStatusClasses() {
    const statusClasses = ['unknown', 'discovered', 'visited', 'current', 'finished'];

    document.querySelectorAll('.level-button').forEach(button => {
        const statut = button.dataset.statut || 'unknown';

        // Supprimer toutes les classes de statut précédentes
        statusClasses.forEach(cls => button.classList.remove(cls));

        // Ajouter la classe correspondant au statut actuel
        if (statusClasses.includes(statut)) {
            button.classList.add(statut);
        }
    });
}



window.onload = function () {
	determineAndGenerateButtons();
	initializeTooltips();
    initializeButtonClicks();
	applyLevelStatusClasses();
    PlayerArmyCodex();
  const gameId = getOrCreateGameID();
    const displayElement = document.getElementById('game-id-display');
    if (displayElement) {
        displayElement.textContent = `ID de la partie : ${gameId}`;
    }
};
