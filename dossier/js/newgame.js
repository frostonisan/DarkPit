import { saveStageConfig, loadFromLocalStorage, saveToLocalStorage, getOrCreateGameData,getOrCreateGameID, setCurrentLevel } from './GameStorage.js';
import { PlayerArmyCodex } from './GameInit.js';
import { generateUniqueID, entitesNestUp } from './entites.js';
import { launchLevel } from './game.js';
import { selectAdminEntitiesForSideB, enableDeleteKeyForFocusedEntity, spawnEntiteIngame } from './ArmyBFactory.js';

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
        scripted_entites
    } = stage;

    // --- Met à jour le niveau courant ---
    setLevelRunning(level_type || 'randomized');
		if (window.levelRunning === 'admin') {
    enableDeleteKeyForFocusedEntity();
	selectAdminEntitiesForSideB(entitesNestUp);
}
    window.currentStageId = stageId;
    localStorage.setItem('currentStageId', stageId);
    setCurrentLevel(stageId);

    // --- Met à jour statut et classes CSS comme dans initializeButtonClicks ---
    let gameStageData = JSON.parse(localStorage.getItem('GameStages')) || { stages: [] };
    const stageIndex = gameStageData.stages.findIndex(s => String(s.id) === String(stageId));

    if (stageIndex !== -1) {
        gameStageData.stages[stageIndex].statut = 'visited';
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
        scripted_entites: level_type === 'scripted' ? scripted_entites : undefined
    });

    console.log(`🚀 Niveau ${stageId} lancé automatiquement avec succès (type : ${window.levelRunning})`);
}

function setLevelRunning(type) {
    if (type === 'scripted' || type === 'randomized' || type === 'admin') {
        window.levelRunning = type;
    } else {
        window.levelRunning = 'randomized';
    }
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
                Statut : ${statut}<br>`; 

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
            type: "scripted"
        }
    ];

    const RandomizedStagesData = [
        { biome: "marecage", totalpoints: 25, moyennepower: 3, maxutilisation: 4, variation: 15, difficulte: 1, lord: 1, levelName: "Le Marécage", position: { top: "54%", left: "52%" }, type: "randomized" },
        { biome: "prison", totalpoints: 15, moyennepower: 3, maxutilisation: 3, variation: 10, difficulte: 1, lord: 0, levelName: "La Prison", position: { top: "50%", left: "26%" }, type: "randomized" },
        { biome: "prison", totalpoints: 5, moyennepower: 5, maxutilisation: 3, variation: 1, difficulte: 0, lord: 0, levelName: "Admin", position: { top: "20%", left: "56%" }, type: "randomized" },
        { biome: "desert", totalpoints: 40, moyennepower: 7, maxutilisation: 2, variation: 20, difficulte: 0, lord: 2, levelName: "Le Désert", position: { top: "80%", left: "61%" }, type: "randomized" },
        { biome: "glacier", totalpoints: 60, moyennepower: 15, maxutilisation: 1, variation: 25, difficulte: 5, lord: 1, levelName: "Le Glacier", position: { top: "14%", right: "73%" }, type: "randomized" }
    ];

    const AdminStagesData = [
        { biome: "marecage", levelName: "admin island", position: { top: "6%", left: "89%" }, type: "admin" }
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
        scripted_entites
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
            const levelType = button.classList.contains('scripted') ? 'scripted' 
                : button.classList.contains('admin') ? 'admin' 
                : 'randomized';

            setLevelRunning(levelType);

            if (!storageId) {
                console.error("Aucun storageId trouvé pour ce bouton !");
                return;
            }

            let gameStageData = JSON.parse(localStorage.getItem('GameStages')) || { stages: [] };
            let stageIndex = gameStageData.stages.findIndex(stage => stage.id === storageId);

            // Variables à remplir
            let biome, totalpoints, moyennepower, maxutilisation, variation, difficulte, lord;
            let sbires = [], lords = [];

if (stageIndex !== -1) {
    console.log(`Stage existant trouvé (ID : ${storageId}). Chargement des paramètres existants.`);
    let existingStage = gameStageData.stages[stageIndex];

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
  existingStage.statut = 'visited';
button.setAttribute('data-statut', 'visited');
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
					statut: 'unknown',
                    difficulty,
                    ArmyB_id: `ArmyB_${storageId}`,
                    level_type: levelType
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
  difficulty: { totalpoints, moyennepower, maxutilisation, variation, difficulte, lord }
});

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



window.addEventListener('load', () => {
	determineAndGenerateButtons();
	initializeTooltips();
    initializeButtonClicks();
	applyLevelStatusClasses();
    PlayerArmyCodex();
	enableDeleteKeyForFocusedEntity();
	selectAdminEntitiesForSideB(entitesNestUp);
  const gameId = getOrCreateGameID();
    const displayElement = document.getElementById('game-id-display');
    if (displayElement) {
        displayElement.textContent = `ID de la partie : ${gameId}`;
    }
});
