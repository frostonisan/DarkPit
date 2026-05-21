import { entitesNestUp, entites } from './entites.js';
import { entiteCamp } from './fight.js';
import { resetFullGame, saveToLocalStorage, loadFromLocalStorage, armyAConfig } from './GameStorage.js';
import { rewardPlayerA } from './loot.js';
import { createQuitButton  } from './game.js';
import { fledEntities } from './BattleOrder.js';

function isDead(entite) {
    return entite?.isDEAD === true || entite?.statut?.includes("dead") || entite?.stats?.HP?.current <= 0;
}

let GameWon = false;
let GameLost = false;

// BattleORDRE 
let orderSide = null;

export function setOrderSide(side) {
    orderSide = side;
}

export function getOrderSide() {
    return orderSide;
}

export function OrderEntity(entite) {
    if (orderSide !== null && entite.side === orderSide) {
        if (!entite.hasResetOrderTimers) {
            console.log(`🚨 BattleORDRE CONFIRMÉE pour ${entite.name} (phase actuelle : ${entite.currentPhase || 'indéterminée'})`);
            resetAllTimersForOrderSide();
            entite.hasResetOrderTimers = true; 
        }
        return true;
    }
    return false;
}

async function resetAllTimersForOrderSide() {
    const side = getOrderSide();
    if (!side) return;

    entites.forEach(entite => {
        if (entite.side === side) {
            entite.speedTimer = 0;
            entite.preparationTime = 0;
            entite.executionTime = 0;
            entite.recoveryTime = 0;
            entite.cooldownTimer = 0;
            entite.hasResetOrderTimers = true;

            console.log(`⏹️ Timers remis à zéro pour ${entite.name} (ID: ${entite.id})`);
        }
    });
}

// START GAME
export let gameStarted = false;
export function startGame() {
    try {
        if (gameStarted) {
            console.log("Le jeu est déjà en cours.");
            return;
        }
        gameStarted = true;
        const startButton = document.getElementById('startButton');
        if (startButton) {
            startButton.style.display = 'none';
        }
        console.log("Jeu démarré.");
        entiteCamp(entites); // Assurez-vous que 'entites' est défini ou accessible
    } catch (error) {
        console.error("Erreur lors du démarrage du jeu :", error);
    }
}
export function StopGame() {
    console.warn("🛑 Arrêt total du combat déclenché.");

    gameStarted = false;
    stopAllIntervals();

    let id = window.setTimeout(() => {}, 0);
    while (id--) {
        window.clearTimeout(id);
        window.clearInterval(id);
    }

    entites.forEach(entite => {
        if (entite) {
            entite.speedTimer = 0;
            entite.cooldownTimer = 0;
            entite.turnCount = 0;
            entite.status = 'inactive';
        }
    });

    fledEntities.length = 0; // ✅ Nettoyage du tableau des fuyards

    const gameOverMessage = document.querySelector(".GameOverMessage");
    if (gameOverMessage) gameOverMessage.remove();

    const chestContainers = document.querySelectorAll(".chest-container");
    chestContainers.forEach(chest => chest.remove());

    console.log("💀 Combat stoppé. Tout est nettoyé.");
}

// STOP TIMINGS
export let activeIntervals = []; // Liste pour suivre les intervalles actifs
export function stopAllIntervals() {
    activeIntervals.forEach(clearInterval);
    activeIntervals = []; // Réinitialisation du tableau
}

// GAME OVER
export let gameOver = false;
export let isGameOverHandled = false; 
 
export function setGameOver(value) {
    gameOver = value;
}

function handleVictory() {
    console.log('Victoire !');
    displayGameOverMessage('Victoire !');
    createChestLoot();
    stopAllIntervals();
	createQuitButton();
    gameOver = true;
    isGameOverHandled = false;

    const stageId = window.currentStageId;
    if (stageId) MarkFinishedStage(stageId);

    GameStatut();
}

function handleDefeat() {
    console.log('Défaite !');
    displayGameOverMessage('Défaite !');
    stopAllIntervals();
    gameOver = true;
    isGameOverHandled = false;
	createQuitButton();
    GameStatut();
}

export function checkGameOver(entites) {
    try {
        if (gameOver || isGameOverHandled) {
            console.log("Le Game Over a déjà été traité. Ignorer cet appel.");
            return true;
        }

        const sideAAlive = entites.filter(e => e.side === 'A' && !isDead(e) && !e.hasFled).length;
        const sideAFled = fledEntities.filter(e => e.side === 'A').length;
        const sideBAlive = entites.filter(e => e.side === 'B' && !isDead(e)).length;

        console.log(`🧮 Vivants côté A (hors morts et fuyards) : ${sideAAlive}`);
        console.log(`🧮 Vivants côté B : ${sideBAlive}`);
        console.log(`🏃‍♀️ Entités ayant fui :`, fledEntities.map(e => e.name));

        // ✅ Vérifier la VICTOIRE en premier
        if (sideBAlive === 0) {
            handleVictory();
            return true;
        }

        if (sideAAlive === 0 && sideAFled === 0) {
            handleDefeat();
            return true;
        }

        if (sideAAlive === 0 && sideAFled > 0 && sideBAlive > 0) {
            displayGameOverMessage("Au moins une Entité a pu fuir. Vous avez survécu... Pour l’instant.");
            stopAllIntervals();
            gameOver = true;
            return true;
        }

        if (sideAAlive > 0) {
            console.log("↩️ Encore des entités valides côté A, pas de Game Over.");
            return false;
        }

        return false;
    } catch (error) {
        console.error("Erreur lors de la vérification du Game Over :", error);
        return false;
    }
}



function MarkFinishedStage(stageId) {
    const gameStages = loadFromLocalStorage('GameStages', { stages: [] });
    const stage = gameStages.stages.find(s => String(s.id) === String(stageId));
    if (stage) {
        stage.statut = 'finished';
        saveToLocalStorage('GameStages', gameStages);
        console.log(`🏁 Stage ${stageId} marqué comme terminé (finished).`);

        const button = document.querySelector(`.level-button[data-storageid="${stageId}"]`);
        if (button) {
            button.setAttribute('data-statut', 'finished');
            if (typeof applyLevelStatusClasses === 'function') {
                applyLevelStatusClasses();
            }
        }
    }
}

function GameStatut() {
    const allDead = entites.filter(e => e.side === 'A' && !e.isDEAD).length === 0;
    const playerXP = armyAConfig?.experience || 0;

    const allStages = loadFromLocalStorage('GameStages', { stages: [] });
    const allStagesFinished = allStages.stages.every(stage => stage.statut === 'finished');

    if (allDead && playerXP === 0) {
        GameWon = false;
        GameLost = true;
        isGameOverHandled = true;
		afficherEchecGlobal(); 
		resetFullGame();
		
    }
    else if (!allDead && allStagesFinished) {
        GameWon = true;
        GameLost = false;
        isGameOverHandled = true;
        afficherVictoireGlobale(); 
    }
}
function afficherVictoireGlobale() {
    StopGame();

    const overlay = document.createElement('div');
    overlay.classList.add('overlay-end-screen', 'overlay-victory');

    const message = document.createElement('div');
    message.innerText = "Félicitation. Vous avez purifié le monde.";

    overlay.appendChild(message);
    document.body.appendChild(overlay);

    // Déclencher le fondu noir après une frame
    requestAnimationFrame(() => {
        overlay.classList.add('visible');
    });
}

function afficherEchecGlobal() {
    StopGame();

    const overlay = document.createElement('div');
    overlay.classList.add('overlay-end-screen', 'overlay-defeat');

    const message = document.createElement('div');
    message.innerText = "Game Over. Vous avez échoué.\nVous n'êtes même pas un souvenir.";

    const retryButton = document.createElement('button');
    retryButton.classList.add('end-button');
	retryButton.id = 'restartEndButton';
    retryButton.innerText = "Recommencer";

    retryButton.addEventListener('click', () => {
        window.location.reload();
    });

    overlay.appendChild(message);
    overlay.appendChild(retryButton);
    document.body.appendChild(overlay);

    // Déclencher le fondu noir après une frame
    requestAnimationFrame(() => {
        overlay.classList.add('visible');
    });
}



// Afficher le message de Game Over dans une div dynamique
function displayGameOverMessage(message) {
    const existingDiv = document.getElementById('gameOverMessage');
    
    if (existingDiv) {
        existingDiv.innerText = message;
        return;
    }

    // Vérifier si l'élément Game-UI existe
    let gameUI = document.querySelector(".Game-UI");
    if (!gameUI) {
        console.error("Erreur : Élément .Game-UI introuvable.");
        return;
    }

    // Vérifier si la div GameOverMessage existe déjà
    let existingGameOverContainer = document.querySelector(".GameOverMessage");
    if (existingGameOverContainer) {
        existingGameOverContainer.remove(); // Supprimer l'ancienne avant d'en ajouter une nouvelle
    }

    // Créer la div principale
    const GameOverMsgDiv = document.createElement('div');
    GameOverMsgDiv.className = 'GameOverMessage';

    // Créer la div du message
    const gameOverDiv = document.createElement('div');
    gameOverDiv.id = 'gameOverMessage';
    gameOverDiv.className = 'IngameAlert';
    gameOverDiv.innerText = message;

    // Créer le bouton de fermeture
    const closeButton = document.createElement('div');
    closeButton.className = 'close-button';
    closeButton.id = 'close-battle-report';
    closeButton.innerText = '×';

    // Ajouter un événement au bouton de fermeture
    closeButton.addEventListener('click', () => {
        GameOverMsgDiv.remove(); // Supprime toute la boîte de message
    });

    // Ajouter les éléments dans la div principale
    GameOverMsgDiv.appendChild(closeButton);
    GameOverMsgDiv.appendChild(gameOverDiv);
    gameUI.appendChild(GameOverMsgDiv);
}


export function createChestLoot() {
    // Création du conteneur principal pour le coffre
    const chestContainer = document.createElement('div');
    chestContainer.classList.add('chest-container', 'entrance');
    chestContainer.id = `chest-${Date.now()}`; // Génère un ID unique pour chaque coffre

    // Création de l'élément du coffre
    const chestDiv = document.createElement('div');
    chestDiv.classList.add('chest-loot');
    chestContainer.appendChild(chestDiv);

    // Création de la modale pour afficher la confirmation du loot
    const chestLootModal = document.createElement('div');
    chestLootModal.classList.add('confirmation-Modal', 'loot');

    // Ajout d'un gestionnaire de clic pour le coffre
    chestDiv.addEventListener('click', function () {
        console.log("Coffre cliqué, ouverture en cours...");
        OpeningChest(chestContainer.id); // Appelle OpeningChest avec l'ID du coffre
        rewardPlayerA(); // Appelle rewardPlayerA après avoir ouvert le coffre
    });

    // Retirer la classe 'entrance' après 4 secondes
    setTimeout(() => {
        chestContainer.classList.remove('entrance');
    }, 2000);

    // Sélection du conteneur principal dans le DOM
    const container = document.querySelector('#game-container'); // Modifiez le sélecteur si nécessaire

    if (container) {
        // Ajout du conteneur du coffre dans le DOM
        container.appendChild(chestContainer);
        container.appendChild(chestLootModal);
    } else {
        console.error("Le conteneur 'game-container' est introuvable dans le DOM.");
    }
}

// Fonction pour ouvrir le coffre et supprimer le conteneur
function OpeningChest(chestId) {
    const chest = document.getElementById(chestId);
    if (chest) {
        chest.remove(); // Supprime le coffre du DOM
        console.log(`Coffre avec l'ID ${chestId} supprimé.`);
    } else {
        console.error(`Coffre avec l'ID ${chestId} introuvable.`);
    }
}

