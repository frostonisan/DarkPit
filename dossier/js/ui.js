import { createEntiteScanInDOM, createHeadUpInDom } from './createEntity.js';
import { getOrCreateGameContainer } from './GameInit.js';

let openWindows = [];
export function goldTitle(text, tag = "p", opts = {}) {
  const {
    containerClass = "entity-stats-title statistiques",
    titleClass = "title",
    lineClass = "gold-line",
  } = opts;

  const container = document.createElement("div");
  container.className = containerClass;

  const lineTop = document.createElement("div");
  lineTop.className = lineClass;

  const titleEl = document.createElement(tag);
  titleEl.className = titleClass;
  titleEl.textContent = text;

  const lineBottom = document.createElement("div");
  lineBottom.className = lineClass;

  container.appendChild(lineTop);
  container.appendChild(titleEl);
  container.appendChild(lineBottom);

  return container;
}

// MASQUER LE BOUTON LVL
export function HideGenerateLevelButton() {
    // Supprimer tous les boutons avec la classe 'GenerateLevelButton'
    document.querySelectorAll('.LevelButton').forEach(button => button.remove());

    // Supprimer tous les éléments avec la classe 'worldmap'
    document.querySelectorAll('.worldmap').forEach(worldmap => worldmap.remove());

    // Supprimer tous les éléments avec la classe 'ingame-msg'
    document.querySelectorAll('.ingame-msg').forEach(msg => msg.remove());
}

// AFFICHAGE MASQUAGE HELPER DISPLAY
// Fonction pour remplacer les anciens écouteurs et ajouter les nouveaux
const eventListenersMap = new Map();
export function toggleScanEntityListener() {
    let clickTimeout;

    // 1️⃣ SUPPRIMÉ : ❌ la logique de clonage
    // document.querySelectorAll('[id^="spriteContainer_"], [id^="ScanEntity_"]').forEach(element => {
    //     let newElement = element.cloneNode(true);
    //     element.parentNode.replaceChild(newElement, element);
    // });

    // 2️⃣ AJOUTÉ : ✅ suppression propre des anciens écouteurs avec removeEventListener
    document.querySelectorAll('[id^="spriteContainer_"]').forEach(element => {
        // Suppression des anciens écouteurs s'ils existent
        if (eventListenersMap.has(element)) {
            const { clickHandler, dblclickHandler } = eventListenersMap.get(element);
            element.removeEventListener('click', clickHandler);
            element.removeEventListener('dblclick', dblclickHandler);
        }

        // Définition des nouveaux écouteurs (inchangé, repris tel quel)
        const clickHandler = function(event) {
            clearTimeout(clickTimeout);

            clickTimeout = setTimeout(() => {
                const idParts = this.id.split('_');
                if (idParts.length < 2) return;
                const entityId = idParts[1];

                if (!event.shiftKey) {
                    document.querySelectorAll('[id^="headsup-container_"]').forEach(headsupContainer => {
                        headsupContainer.remove();
                    });
                }

                const headsupContainerId = `headsup-container_${entityId}`;
                let currentHeadsupContainer = document.getElementById(headsupContainerId);

                if (!currentHeadsupContainer) {
                    createHeadUpInDom(entityId);
                    currentHeadsupContainer = document.getElementById(headsupContainerId);

                    if (!currentHeadsupContainer) {
                        console.error(`🚨 ERREUR : headsup-container_${entityId} n'a pas été créé.`);
                    }
                } else {
                    currentHeadsupContainer.style.display = 
                        (currentHeadsupContainer.style.display === 'none' || currentHeadsupContainer.style.display === '') ? 'flex' : 'none';
                }

                document.querySelectorAll('[id^="spriteContainer_"]').forEach(el => {
                    el.classList.remove('focused', 'targetable', 'supportable');
                    const parentHex = el.closest('.hex');
                    if (parentHex) parentHex.classList.remove('focused', 'targetable', 'supportable');

                    const elIdParts = el.id.split('_');
                    if (elIdParts.length >= 2) {
                        const targetInfosElement = document.getElementById(`TargetInfos_${elIdParts[1]}`);
                        if (targetInfosElement) {
                            targetInfosElement.classList.remove('focused', 'targetable', 'supportable');
                        }
                    }
                });

                element.classList.add('focused', 'targetable', 'supportable');
                const parentHex = element.closest('.hex');
                if (parentHex) parentHex.classList.add('focused', 'targetable', 'supportable');

                const targetInfosElement = document.getElementById(`TargetInfos_${entityId}`);
                if (targetInfosElement) {
                    targetInfosElement.classList.add('focused', 'targetable', 'supportable');
                }

                checkFocused();
            }, 200);
        };

        const dblclickHandler = function(event) {
            clearTimeout(clickTimeout);

            const idParts = this.id.split('_');
            if (idParts.length < 2) return;
            const entityId = Number(idParts[1]);
            toggleScanEntity(`ScanEntity_${entityId}`, event.shiftKey);

            const headsupContainerId = `headsup-container_${entityId}`;
            let currentHeadsupContainer = document.getElementById(headsupContainerId);
            if (currentHeadsupContainer && currentHeadsupContainer.style.display !== 'flex') {
                currentHeadsupContainer.style.display = 'flex';
            }

            document.querySelectorAll('[id^="spriteContainer_"]').forEach(el => {
                el.classList.remove('focused', 'targetable', 'supportable');
                const parentHex = el.closest('.hex');
                if (parentHex) parentHex.classList.remove('focused', 'targetable', 'supportable');

                const elIdParts = el.id.split('_');
                if (elIdParts.length >= 2) {
                    const targetInfosElement = document.getElementById(`TargetInfos_${elIdParts[1]}`);
                    if (targetInfosElement) {
                        targetInfosElement.classList.remove('focused', 'targetable', 'supportable');
                    }
                }
            });

            element.classList.add('focused', 'targetable', 'supportable');
            const parentHex = element.closest('.hex');
            if (parentHex) parentHex.classList.add('focused', 'targetable', 'supportable');

            const targetInfosElement = document.getElementById(`TargetInfos_${entityId}`);
            if (targetInfosElement) {
                targetInfosElement.classList.add('focused', 'targetable', 'supportable');
            }

            checkFocused();
        };

        // Ajout des nouveaux écouteurs
        element.addEventListener('click', clickHandler);
        element.addEventListener('dblclick', dblclickHandler);

        // Stockage des écouteurs dans la Map
        eventListenersMap.set(element, { clickHandler, dblclickHandler });
    });

    // ✅ Garde la gestion des clics à l'extérieur inchangée (c'était déjà correct)
    document.addEventListener('click', function(event) {
        if (
            !event.target.closest('[id^="headsup-container_"]') &&
            !event.target.closest('[id^="ScanEntity_"]') &&
            !event.target.closest('[class^="board-ui"]') &&
            !event.target.closest('[id^="globalhelper"]') &&
            !event.target.closest('[id^="spriteContainer_"]')
        ) {
            document.querySelectorAll('[id^="headsup-container_"]').forEach(headsupContainer => {
                headsupContainer.remove();
            });

            document.querySelectorAll('[id^="spriteContainer_"]').forEach(el => {
                el.classList.remove('focused', 'targetable', 'supportable');
                const parentHex = el.closest('.hex');
                if (parentHex) parentHex.classList.remove('focused', 'targetable', 'supportable');

                const elIdParts = el.id.split('_');
                if (elIdParts.length >= 2) {
                    const targetInfosElement = document.getElementById(`TargetInfos_${elIdParts[1]}`);
                    if (targetInfosElement) {
                        targetInfosElement.classList.remove('focused', 'targetable', 'supportable');
                    }
                }
            });

            checkFocused();
        }
    });
}

let globalListingState = false;

function updateGlobalListingState(newState) {
    globalListingState = newState;
    
    // Appliquer l'état à tous les listingTab
    document.querySelectorAll("[id^='targetScan_']").forEach(tab => {
        if (newState) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });

    // Appliquer l'état à tous les listingContent
    document.querySelectorAll("[id^='listing_']").forEach(content => {
        if (newState) {
            content.style.opacity = "1";
            content.style.display = "grid"; 
        } else {
            content.style.opacity = "0";
            content.style.display = "none";
        }
    });
}

export function toggleScanEntity(entityId, shiftKey) {
    let allEntitiesHud = document.querySelector('.AllEntitiesHud');
    if (!allEntitiesHud) {
        allEntitiesHud = document.createElement('div');
        allEntitiesHud.className = 'AllEntitiesHud';
        document.getElementById('game-container').appendChild(allEntitiesHud);
    }

    let allEntitiesScan = document.querySelector('.AllEntitiesHud .AllEntitiesScan');
    if (!allEntitiesScan) {
        allEntitiesScan = document.createElement('div');
        allEntitiesScan.className = 'AllEntitiesScan';
        allEntitiesHud.appendChild(allEntitiesScan);
    }

    const uniqueId = entityId.replace('ScanEntity_', ''); 
    const numericId = parseInt(uniqueId);
    let currentScanEntity = document.getElementById(entityId);

    // 🔥 Création forcée de l'entité si elle n'existe pas
    if (!currentScanEntity) {
        console.log(`🛠️ Création de ScanEntity_${numericId}`);
        createEntiteScanInDOM(numericId);
        currentScanEntity = document.getElementById(entityId);
		
    }

    const headsupContainerId = `headsup-container_${numericId}`;
    let currentHeadsupContainer = document.getElementById(headsupContainerId);

    // 🔥 Création forcée du headsup-container si inexistant
    if (!currentHeadsupContainer) {
        console.log(`🛠️ Création forcée de headsup-container_${numericId}`);
        createHeadUpInDom(numericId);
        currentHeadsupContainer = document.getElementById(headsupContainerId);

        if (!currentHeadsupContainer) {
            console.error(`🚨 ERREUR : headsup-container_${numericId} n'a pas été créé.`);
        }
    }

  if (typeof numericId === "undefined") {
        console.error("❌ numericId est indéfini !");
        return;
    }

// Sélection et gestion des onglets
const detailTab = document.getElementById(`detailScan_${numericId}`);
const loreTab = document.getElementById(`loreScan_${numericId}`);
const detailContent = document.getElementById(`entiteDetailsContainer_${numericId}`);
const loreContent = document.getElementById(`entiteLoreContainer_${numericId}`);
const listingTab = document.getElementById(`targetScan_${numericId}`);
const listingContent = document.getElementById(`listing_${numericId}`);

if (detailTab && loreTab && detailContent && loreContent && listingTab && listingContent) {
    if (!detailTab.classList.contains('event-added')) {
        detailTab.addEventListener('click', function () {
            detailTab.classList.add('active');
            loreTab.classList.remove('active');
            detailContent.classList.add('active');
            loreContent.classList.remove('active');
        });
        detailTab.classList.add('event-added');
    }

    if (!loreTab.classList.contains('event-added')) {
        loreTab.addEventListener('click', function () {
            loreTab.classList.add('active');
            detailTab.classList.remove('active');
            loreContent.classList.add('active');
            detailContent.classList.remove('active');
        });
        loreTab.classList.add('event-added');
    }

    if (!listingTab.classList.contains('event-added')) {
        listingTab.addEventListener('click', function () {
            // 🔄 Inverser l'état global
            const newState = !globalListingState;
            updateGlobalListingState(newState);
        });

        // Appliquer l'état initial global
        if (globalListingState) {
            listingTab.classList.add('active');
            listingContent.style.opacity = "1";
			 listingContent.style.display = "grid";
         
        } else {
            listingTab.classList.remove('active');
            listingContent.style.opacity = "0";
            listingContent.style.display = "none";
        }

        listingTab.classList.add('event-added');
		// ON OFF LISTING PRIO PHRASE
		const entitePrioPhrase = document.getElementById(`entitePrioPhrase_${numericId}`);
if (entitePrioPhrase && listingTab && listingContent) {
    if (!entitePrioPhrase.classList.contains('event-added')) {
        entitePrioPhrase.addEventListener('click', function () {
            const newState = !globalListingState;
            updateGlobalListingState(newState);
        });
        entitePrioPhrase.classList.add('event-added');
    }
}
    }
} else {
    console.warn(`⚠️ Les éléments pour l'entité ${numericId} n'ont pas été trouvés pour le système d'onglets.`);
}


if (listingTab && listingContent) {
    if (!listingTab.classList.contains('event-added')) {
        listingTab.addEventListener('click', function () {
            listingTab.classList.toggle('active');
            listingContent.style.opacity = listingTab.classList.contains('active') ? "1" : "0";
        });
        listingTab.classList.add('event-added');
    }
}


    if (!shiftKey) {
        document.querySelectorAll('.entite-details').forEach(scanEntity => {
            if (scanEntity !== currentScanEntity) {
                scanEntity.remove();
            }
        });

        document.querySelectorAll('[id^="headsup-container_"]').forEach(headsupContainer => {
            if (headsupContainer !== currentHeadsupContainer) {
                headsupContainer.remove();
            }
        });

        openWindows = [];
    }

    if (currentScanEntity.style.display === 'block') {
        currentScanEntity.remove();
        if (currentHeadsupContainer) currentHeadsupContainer.remove(); // Suppression complète
        openWindows = openWindows.filter(id => id !== entityId);
    } else {
        currentScanEntity.style.display = 'block';
        if (currentHeadsupContainer) currentHeadsupContainer.style.display = 'flex';

        openWindows.push(entityId);

        if (detailTab && loreTab && detailContent && loreContent) {
            detailTab.classList.add('active');
            loreTab.classList.remove('active');
            detailContent.classList.add('active');
            loreContent.classList.remove('active');
        }
        CloseScan();
        positionWindows();
    }

    if (openWindows.length > 2) {
        const oldestWindow = openWindows.shift();
        const oldestScanEntity = document.getElementById(oldestWindow);
        if (oldestScanEntity) {
            oldestScanEntity.remove();
        }
    }

}

export function checkFocused() {
    const focusedSprite = document.querySelector('.sprite-container.focused');

    if (focusedSprite) {
        // console.log('Sprite avec la classe .focused trouvé :', focusedSprite);

        const parent = focusedSprite.parentElement;
        const targetZone = parent.getAttribute('data-targetzone');
        const side = parent.classList.contains('A') ? 'A' : parent.classList.contains('B') ? 'B' : 'Unknown';
        const entityClasse = parent.getAttribute('data-entityclasse');
        const classe = entityClasse === 'Attaquant' ? 'Attaquant' :
                       entityClasse === 'Support' ? 'Support' :
                       entityClasse === 'Invocateur' ? 'Invocateur' : 'Unknown';

        const elementsToFilter = document.querySelectorAll(
            '.hex .hud-ingame, .hex .drag-box, .foreground, .ground, .background, .socle'
        );
        elementsToFilter.forEach((el) => {
            el.style.filter = 'brightness(0.5)';
        });

        const elementsToSetOpacity = document.querySelectorAll(
            '.hex .hud-ingame, .hex .drag-box, .hex .socle'
        );
        elementsToSetOpacity.forEach((el) => {
            el.style.opacity = '0.2';
        });

        const elementsToReset = document.querySelectorAll('.hex.focused .hud-ingame, .hex.focused .drag-box');
        elementsToReset.forEach((el) => {
            el.style.filter = 'none';
            el.style.opacity = '1';
        });

        const allHexElements = document.querySelectorAll('#hexGrid .hex');
        allHexElements.forEach(element => {
            element.classList.remove('targetable', 'supportable', 'summonable');
            const sprite = element.querySelector('.sprite-container');
            if (sprite) {
                sprite.classList.remove('targetable', 'supportable', 'summonable');
            }
        });

        let TargetSide;
        if (classe === 'Attaquant') {
            TargetSide = side === 'A' ? 'B' : 'A';
            const hexElements = document.querySelectorAll('#hexGrid .hex.occupied');
            hexElements.forEach(element => {
                if (element.classList.contains(`Side${TargetSide}`)) {
                    const role = element.getAttribute('data-role');
                    if (role === targetZone || (role === 'neutre' && targetZone === 'gueux')) {
                        element.classList.add('targetable');
                        const sprite = element.querySelector('.sprite-container');
                        if (sprite) {
                            sprite.classList.add('targetable');
                        }
                        const dragBox = element.querySelector('.drag-box');
                        if (dragBox) {
                            dragBox.style.filter = 'none';
                            dragBox.style.opacity = '1';
                        }
                    }
                }
            });
        } else if (classe === 'Support') {
            TargetSide = side;
            const hexElements = document.querySelectorAll('#hexGrid .hex.occupied');
            hexElements.forEach(element => {
                if (element.classList.contains(`Side${TargetSide}`) && element !== parent) {
                    const role = element.getAttribute('data-role');
                    if (role === targetZone || (role === 'neutre' && targetZone === 'gueux')) {
                        element.classList.add('supportable');
                        const sprite = element.querySelector('.sprite-container');
                        if (sprite) {
                            sprite.classList.add('supportable');
                        }
                        const dragBox = element.querySelector('.drag-box');
                        if (dragBox) {
                            dragBox.style.filter = 'none';
                            dragBox.style.opacity = '1';
                        }
                    }
                }
            });
        } else if (classe === 'Invocateur') {
            TargetSide = side;
            const hexElements = document.querySelectorAll('#hexGrid .hex');
            hexElements.forEach(element => {
                const isOccupied = element.classList.contains('occupied');
                const isSideMatch = element.classList.contains(`Side${TargetSide}`) || element.classList.contains('Neutral');
                if (!isOccupied && isSideMatch) {
                    element.classList.add('summonable');
                    const socle = element.querySelector('.socle');
                    if (socle) {
                        socle.style.filter = 'none';
                        socle.style.opacity = '1';
                    }
                }
            });
        }

        // Event global pour réinitialiser les styles lorsqu'on clique dans le vide
        document.addEventListener('click', handleOutsideClick);
    } else {
        // console.log('Aucun élément avec la classe .focused trouvé.');
    }

    // Fonction pour réinitialiser les styles
    function resetStyles() {
        const elementsToReset = document.querySelectorAll('.hex .hud-ingame, .hex .drag-box, .hex .socle');
        elementsToReset.forEach((el) => {
            el.style.filter = '';
            el.style.opacity = '';
        });

        // Réinitialiser les filtres sur .background, .foreground, et .ground
        const backgroundElements = document.querySelectorAll('.background, .foreground, .ground');
        backgroundElements.forEach((el) => {
            el.style.filter = ''; // Supprimer le filtre
        });

        const allHexElements = document.querySelectorAll('#hexGrid .hex');
        allHexElements.forEach(element => {
            element.classList.remove('targetable', 'supportable', 'summonable');
            const sprite = element.querySelector('.sprite-container');
            if (sprite) {
                sprite.classList.remove('targetable', 'supportable', 'summonable');
            }
        });
    }

    // Gérer le clic en dehors d'une entité focalisée
    function handleOutsideClick(event) {
        const clickedInsideFocusedSprite = event.target.closest('.sprite-container.focused');
        const clickedInsideHexButton = event.target.closest('#see-hex, #hide-hex');

        if (!clickedInsideFocusedSprite && !clickedInsideHexButton) {
            resetStyles();
            document.removeEventListener('click', handleOutsideClick); // Supprimer l'event listener après la réinitialisation
        }
    }
}


// Ajouter un écouteur de clic pour chaque sprite
document.querySelectorAll('.sprite-container').forEach(sprite => {
    sprite.addEventListener('click', () => {
        // Retirer la classe .focused de tous les sprites
        document.querySelectorAll('.sprite-container.focused').forEach(focused => {
            focused.classList.remove('focused');
        });

        // Ajouter la classe .focused à l'élément cliqué
        sprite.classList.add('focused');

        // Appeler la fonction checkFocused pour gérer les changements
        checkFocused();
    });
});





// Observer les changements de classe sur les éléments .hex
const hexElements = document.querySelectorAll('.hex');
hexElements.forEach((hex) => {
    const observer = new MutationObserver(() => {
        checkFocused();
    });
    observer.observe(hex, { attributes: true, attributeFilter: ['class'] });
});


function CloseScan() {
  // Sélectionne tous les éléments dont l’ID commence par "closeScan_"
  const closeButtons = document.querySelectorAll("[id^='closeScan_']");
  
  closeButtons.forEach(button => {
    // Pour éviter d'ajouter plusieurs fois le même listener, on peut recréer le bouton :
    const newButton = button.cloneNode(true);
    button.parentNode.replaceChild(newButton, button);

    // Maintenant on attache un seul écouteur
    newButton.addEventListener("click", () => {
      // Récupère le suffixe (nombre) de l'ID, ex: "closeScan_1" => "1"
      const suffix = newButton.id.replace('closeScan_', '');
      
      // Construit l'ID correspondant à la div à supprimer : "ScanEntity_1"
      const targetId = 'ScanEntity_' + suffix;
      const targetElement = document.getElementById(targetId);
      
      if (targetElement) {
        // Supprime l'élément du DOM
        targetElement.remove();

        // Mise à jour de la liste des fenêtres ouvertes
        openWindows = openWindows.filter(id => id !== targetId);

        // Si, après la fermeture, il ne reste plus qu'une fenêtre,
        // on lui applique la classe "solo"
        if (openWindows.length === 1) {
          const remainingWindow = document.getElementById(openWindows[0]);
          if (remainingWindow) {
            remainingWindow.classList.remove('duo-left', 'duo-right');
            remainingWindow.classList.add('solo');
          }
        }

      } else {
        // Si l'élément n'existe pas (au cas où)
        console.log(`Aucun élément avec l'ID "${targetId}" n'a été trouvé.`);
      }
    });
  });
}

function positionWindows() {
    if (openWindows.length === 2) {
        const scanEntity1 = document.getElementById(openWindows[0]);
        const scanEntity2 = document.getElementById(openWindows[1]);

        if (scanEntity1 && scanEntity2) {
            scanEntity1.classList.add('duo-left');
            scanEntity2.classList.add('duo-right');
        }
    }
}


let globalFoundEntity = null; // Variable globale pour stocker foundEntity


// HIDE SHOW HEX BUTTON
export let soclesVisible = false;
export function HexButtonVisibility() {
    const seeHexButton = document.getElementById('see-hex');
    const hideHexButton = document.getElementById('hide-hex');

    if (seeHexButton && hideHexButton) {
        function showSocles() {
            seeHexButton.style.display = 'none';
            hideHexButton.style.display = 'block';
            let socles = document.querySelectorAll('.hex:not(.occupied) .socle');
            socles.forEach(function(socle) {
                socle.style.opacity = '1';
            });
        }

        function hideSocles() {
            hideHexButton.style.display = 'none';
            seeHexButton.style.display = 'block';
            let socles = document.querySelectorAll('.hex:not(.occupied) .socle');
            socles.forEach(function(socle) {
                socle.style.opacity = '0';
            });
        }

        function initializeHexVisibility() {
            seeHexButton.style.display = 'block';
            hideHexButton.style.display = 'none';
            let socles = document.querySelectorAll('.hex:not(.occupied) .socle');
            socles.forEach(function(socle) {
                socle.style.opacity = '0';
            });
        }

        // Associer les fonctions aux boutons
        seeHexButton.addEventListener('click', showSocles);
        hideHexButton.addEventListener('click', hideSocles);

        initializeHexVisibility();
    }
}

export function helperDisplay() {
    const helpDisplay = document.getElementById('help-display');

    if (helpDisplay) {
        helpDisplay.addEventListener('click', function() {
            // Vérifie si l'aide existe déjà
            let globalHelper = document.getElementById('globalhelper');
            if (!globalHelper) {
                const gameContainer = document.getElementById('game-container');

                globalHelper = document.createElement('div');
                globalHelper.className = 'global-help';
                globalHelper.id = 'globalhelper';

                const closeButton = document.createElement('span');
                closeButton.className = 'close-helper';
                closeButton.id = 'close-helper-button';
                closeButton.textContent = 'X';

                const scaleHelper = document.createElement('div');
                scaleHelper.className = 'scale-helper';
                scaleHelper.innerHTML = HelpText();

                // Ajout des éléments à globalHelper
                globalHelper.appendChild(closeButton);
                globalHelper.appendChild(scaleHelper);

                // Ajout à gameContainer
                gameContainer.appendChild(globalHelper);

                // Écouteur pour supprimer globalHelper au clic sur closeButton
                closeButton.addEventListener('click', function() {
                    globalHelper.remove();
                });
            }
        });
    }
}


export function LevelUi(){   
const gameContainer = getOrCreateGameContainer();

      const boardUI = document.createElement('div');
    boardUI.className = 'board-ui';

    const helpButton = document.createElement('span');
    helpButton.className = 'help-button';
    helpButton.id = 'help-display';
    helpButton.textContent = '?';
    boardUI.appendChild(helpButton);

  	gameContainer.appendChild(boardUI);
  
    const seeHexButton = document.createElement('div');
    seeHexButton.id = 'see-hex';
    seeHexButton.className = 'seehex-button';
    seeHexButton.alt = 'voir les hexagones';

    const seeHexIcon = document.createElement('div');
    seeHexIcon.className = 'seeHex picto-ui';
    seeHexButton.appendChild(seeHexIcon);

    boardUI.appendChild(seeHexButton);

    const hideHexButton = document.createElement('div');
    hideHexButton.id = 'hide-hex';
    hideHexButton.className = 'hidehex-button';
    hideHexButton.alt = 'masquer les hexagones';

    const hideHexIcon = document.createElement('div');
    hideHexIcon.className = 'hideHex picto-ui';
    hideHexButton.appendChild(hideHexIcon);

    boardUI.appendChild(hideHexButton);
	
	}
	
function HelpText() {
    return `
  <!-- <div class="container-help-intro"> -->
  <!-- <span class="title-1">The Pit</span> -->
     <!-- <span class="title-2">Tactical AutoBattle</span> -->
   <!-- <p class="help-text">The Pit est un projet de tactical auto-battle en temps réél, dans lequel vous devez exterminer l'armée adverse.<br>Placez vos troupes de manière stratégique, et adaptez votre formation en temps réel suivant l'évolution du combat pour remporter la bataille.</p> -->
  <!-- </div> -->
  <div class="container-help">
    <div class="help-partie-1">
		 <!-- <span class="title-3">The Pit </span> -->
      <!-- <div class="help"><p>The Pit est un projet de tactical auto-battle en temps réél, dans lequel vous devez exterminer l'armée adverse.<br>Placez vos troupes de manière stratégique, et adaptez votre formation en temps réel suivant l'évolution du combat pour remporter la bataille.</p></div> -->
	 <span class="title-3"> I - L'OBJECTIF</span>
      <div class="help"><p>Deux armées s'affrontent.<br>Votre armée se trouve à <strong>gauche</strong> de l'écran, l'armée adverse à <strong>droite</strong>.<br>Vous devez vaincre toutes les <strong>Entités</strong> adverses pour remporter la partie. Positionez stratégiquement vos troupes, de maniére à éliminer les éléments clefs de l'adversaires et preservez les votre, et cliquez sur lancer les combats quand vous êtes prêts.</p></div>
	  	  <div class="title-3"><p>II - LES ENTITÉS</p></div>
      <div class="help"><p>Elles constituent les armées, et vont s'attaquer automatiquement, selon leur propres caractéristiques. Elles sont de deux types : les <strong>Lords</strong> et les <strong>Sbires</strong>.<br>
	  <div style="text-align:center;">• Les Lords sont les <strong>commandants</strong>. Ces puissantes Entités sont représentées par une aura dorée qui les entoure.<br>• Les Sbires sont l'<strong>armée régulière</strong> et leur puissance varie grandement d'un Sbire à l'autre.</div><br>
	  Les Lords <strong>attaquent toujours</strong> la cible qui représente <strong>la plus grande menace</strong> dans l'armée adverse. En plus, ils sont <strong>protégés par leurs Sbires</strong> : Ils ne peuvent pas être pris pour cible par les Sbires adverses, <strong>tant qu'ils ont des Sbires vivant dans leur armée</strong>.<br> Les Sbires choisissent leur cible <strong>en fonction du rôle qu'ils occupent</strong>, et ne peuvent <strong>cibler le Lord adverse</strong> que quand les Sbires adverses sont <strong>tous morts</strong>.</p></div>
	   <span class="title-3"> III - LE POSITIONNEMENT</span>
	  <div class="help"><p><strong>Positionnez vos Entités</strong> sur les cases hexagonales du plateau de jeux (board).<br>Chaque case donnera à l'Entité qui l'occupe un <strong>rôle spécifique durant la bataille</strong>.<br>Créez votre formation avant de lancer le combat, et déplacez vos entités <strong>pendant la bataille</strong>, pour <strong>adapter</strong> votre formation à la situation <strong>en temps réel</strong>.</p></div>
   
    </div>

	
<div class="help-partie-2">
 <span class="title-3"> IV - LE BOARD</span>
	 <div class="help"><p>Faites un <strong>glissé/déposé</strong> pour <strong>positionner les Entités</strong> sur les cases hexagonales. Il ne peut y avoir qu'une Entité par case.<br>Il existe <strong>4 types de cases</strong> :</p></div>
			<div class="helper-bloc-images"> 
				<!-- Case neutre -->
					<div class="helper-block-picto">
						<img class="helper-hex" alt="case fantassin" src="/media/assets/board/hex-helper-neutral.svg">
							<span class="helper-block-title">Case Neutre</span>
							<p>Elles composent la plupart du board. Toute entité positionnée dessus aura pour rôle <strong>Gueux</strong>.</p>
					</div>
					<!-- Case tank-->
					<div class="helper-block-picto">
						<img class="helper-hex" alt="case tank" src="/media/assets/board/hex-helper-tank.svg">
							<span class="helper-block-title">Case Tank</span>
							<p>En première ligne de votre armée. Toute entité positionnée dessus aura pour rôle <strong>Tank</strong>.</p>
					</div>
					<!-- Case fantassin-->
					<div class="helper-block-picto">
						<img class="helper-hex" alt="case fantassin" src="/media/assets/board/hex-helper-fantassin.svg">
							<span class="helper-block-title">Case Fantassin</span>
							<p>Au milieu de votre armée. Toute entité positionnée dessus aura pour rôle <strong>Fantassin</strong>.</p>
					</div>
					<!-- Case mage -->
					<div class="helper-block-picto">
						<img class="helper-hex" alt="case mage" src="/media/assets/board/hex-helper-mage.svg">
							<span class="helper-block-title">Case Mage</span>
							<p>À l'arrière votre armée. Toute entité positionnée dessus aura pour rôle <strong>Mage</strong>.</p>
					</div>
			</div>
 <span class="title-3"> V - LES RÔLES</span>
  
	  			<div class="helper-bloc-role"> 
				<div style="display: flex; margin-bottom: 5%;"><p style="width: 63%;margin-right: 3%;">Le rôle du Sbire détermine son  <strong>ciblage</strong> : Quel <strong>Sbire</strong> il pourra  <strong>prendre pour cible</strong>, et quel <strong>Sbire</strong> pourra <strong>le prendre pour cible </strong>.<br><i class="helper-legend">La bare de vie indique en temps réél le  Role de l'Entité (1) et ce qu'elle cible (2).<br></i></p><img src="/media/assets/ui/tuto-hud.jpg" class="image-tuto-role" alt="image explicative du hu" style="width: 25%;"></div>
				<!-- Case neutre -->
				<p>Il existe 4 rôles :</p>
					<div class="helper-part-role">
						<img class="helper-roles" alt="case fantassin" src="/media/assets/ui/picto-gueux.svg">
							
							<p><span class="helper-block-title">Le Gueux :</span> Il est le rôle misérable par excellence. Il sera la <strong>cible prioritaire</strong> de tous les Sbires adverses, et ses alliés Supports rechigneront à l'aider.</p>
					</div>
					<!-- Case tank-->
					<div class="helper-part-role">
						<img class="helper-roles" alt="case tank" src="/media/assets/ui/picto-tank.svg">
							
							<p><span class="helper-block-title">Le Tank :</span> Il sera <strong>pris pour cible par le plus grand nombre d'Entité</strong>. Il est la première ligne de votre armée et se doit d'être <strong>robuste</strong>.</p>
					</div>
					<!-- Case fantassin-->
					<div class="helper-part-role">
						<img class="helper-roles" alt="case fantassin" src="/media/assets/ui/picto-fantassin.svg">
							
							<p><span class="helper-block-title">Le Fantassin :</span> Il est l'armée régulière. Il ciblera d'abord <strong>les premières lignes</strong>, puis les <strong>arrières lignes</strong>.</p>
					</div>
					<!-- Case mage -->
					<div class="helper-part-role">
						<img class="helper-roles" alt="case mage" src="/media/assets/ui/picto-mage.svg">
							
							<p> <span class="helper-block-title">Le Mage :</span> Il se bat <strong>loin</strong> des zones de conflits. <strong>Protégé</strong> par ses premières lignes, il cible les <strong>Fantassins</strong>.</p>
					</div>
			</div>
<!-- Classes -->
 <span class="title-3"> VI - LES CLASSES</span>
	<div class="help"><p>En plus des rôles, les Entités <strong>peuvent avoir différentes classes</strong> : Attaquant, Support, ou Invocateur.</p></div>
<div><div class="helper-part-role">
		<img class="helper-roles" alt="classe support" src="/media/assets/ui/picto-support.svg" style="height: 40px;">			
	  <p><span class="helper-block-title">Le Support : </span>Il cible les Entités alliées. Souvent pour leur venir en aide. Et parfois même quand elle sont mortes...</p></div>
<div class="helper-part-role">
		<img class="helper-roles" alt="classe attaquant" src="/media/assets/ui/picto-attaquant.svg" style="height: 40px;">
	  <p><span class="helper-block-title">L'Attaquant :</span> Il cible les Entités ennemies</strong>, et il ne leur veut pas du bien...</p>
</div><div class="helper-part-role">
		<img class="helper-roles" alt="classe invocateur" src="/media/assets/ui/picto-invocateur.svg" style="height: 40px;">
	  <p><span class="helper-block-title">L'Invocateur :</span> Il cible les cases du board</strong>, et fait apparaitre de nouveaux éléments.</p>
</div></div></div>
  
    <div class="help-partie-3">
	<span class="title-3"> VII - CONTRÔLES</span>
	  <p style="font-size: 13px;"><strong>Drag n' drop (glissé-déposé)</strong> : Déplacer une Entité sur la case disponible de votre choix.<br>
	  <strong>Clic simple :</strong> Voir les cibles de l'Entité.<br>
	  <strong>Double clic :</strong> Information sur l'Entité.<br><strong>Molette avant/arriére :</strong> Changer l'angle de vue.</p><br>
      <span class="title-3"> VIII - ASTUCES</span>
      <div class="help"><p>• Attribuer le <strong>bon rôle</strong> à la <strong>bonne Entité</strong>, au <strong>bon moment</strong> est la clef pour gagner la partie.<br>N'hésitez pas à <strong>déplacer</strong> vos troupes <strong>pendant la bataille</strong>. Vous pouvez également échanger la place de deux Entités (swap).</p></div>
	   <div class="help"><p>• Il n'est pas possible de controler directement le ciblage d'une Entité, mais avec un <strong>placement astucieux</strong>, il est possible de l'influencer, voire de le <strong>prévoir</strong>.</p></div>
	   <div class="help"><p>• Vous pouvez voir les cibles en temps réel de chaque Entité en clicant dessus. Si c'est un attaquant, ses cibles apparaitront en rouge si c'est un support, elles apparaitrons en bleux, si c'est un invocateur, vous verrez les cases qu'il peut cibler. </p></div>
	   <img src="/media/assets/ui/tuto-cible.jpg" class="image-tuto-role" alt="image explicative de la selection du ciblage">
	   <div class="help"><p>• N'oubliez pas que le Lord est un véritable électron libre, qui pourra potentiellement <strong>changer de cible à chaque tour</strong>, pour attaquer l'Entité adverse <strong>la plus dangereuse</strong> pour son équipe.</p></div>
	   <div class="help"><p>• Certaines Entités, comme les Invocateurs, necessiteront des actions en temps réel de votre part (comme récolter des ressources) <strong> alors soyez réactif.</p></div>
    </div>
  </div>
</div>`;
}
	
	
export function setInitialParallaxValues() {
    // console.log("Définition des valeurs de base dans setInitialParallaxValues");

    document.querySelectorAll('.hud-ingame').forEach(element => {
        element.style.transform = 'rotateX(-75deg) scale(0.8)';
        element.style.transition = 'none';
        element.style.opacity = '0';
        // console.log("hud-ingame : transform = rotateX(-75deg) scale(0.8), opacity = 0");
    });
    document.querySelectorAll('.drag-box').forEach(box => {
        box.style.transform = 'rotateX(-75deg)';
        box.style.transition = 'none';
        // console.log("drag-box : transform = rotateX(-75deg)");
    });
    document.querySelectorAll('.consommable-container').forEach(box => {
        box.style.transform = 'rotateX(-75deg)';
        box.style.transition = 'none';
        // console.log("consommable-container : transform = rotateX(-75deg)");
    });

    const hexGrid = document.querySelector('#hexGrid');
    if (hexGrid) {
        hexGrid.style.transform = 'perspective(2000px) rotateX(75deg)';
        hexGrid.style.transition = 'none';
        // console.log("hexGrid : transform = perspective(2000px) rotateX(75deg)");
    }

    const backgroundBas = document.querySelector('.foreground');
    if (backgroundBas) {
        backgroundBas.style.transition = 'none';
        backgroundBas.style.top = '50%';
        backgroundBas.style.transform = 'scale(1.1)';
        backgroundBas.style.transformOrigin = 'center center 0px';
        // console.log("foreground : top = 50%, transform = scale(1.1)");
    }

    const board = document.querySelector('.board');
    if (board) {
        board.style.transition = 'none';
        board.style.transform = 'scale(0.65)';
        board.style.top = '10%';
        // console.log("board : top = 10%, transform = scale(0.65)");
    }

    const gameContainer = document.querySelector('#game-container');
    if (gameContainer) {
        gameContainer.style.transform = 'scale(1.3)';
        gameContainer.style.transformOrigin = 'center';
        gameContainer.style.transition = 'none';
        // console.log("#game-container : transform = scale(2.5), transform-origin = center");
    }

    // Initialisation des opacités pour .hex.occupied .socle et .board-ui
    document.querySelectorAll('.hex.occupied .socle').forEach(element => {
        element.style.opacity = '0';
        element.style.transition = 'none';
        // console.log(`${element.className} : opacity = 0`);
    });
	  document.querySelectorAll('.board-ui').forEach(element => {
        element.style.opacity = '1';
        element.style.transition = 'none';
        // console.log(`${element.className} : opacity = 0`);
    });
}

export function loadStageAnimation() {
    // console.log("Déclenchement de l'animation vers les valeurs normales dans loadStageAnimation");

    const observer = new MutationObserver(() => {});
    observer.disconnect();

    setTimeout(() => {
        document.querySelectorAll('.hud-ingame').forEach(element => {
            element.style.transition = 'transform 4s ease';
            element.style.transform = 'rotateX(-50deg) scale(0.8)';
            // console.log("hud-ingame : transform = rotateX(-50deg) scale(0.8)");
        });
        document.querySelectorAll('.drag-box').forEach(box => {
            box.style.transition = 'transform 4s ease';
            box.style.transform = 'rotateX(-50deg)';
            // console.log("drag-box : transform = rotateX(-50deg)");
        });
        document.querySelectorAll('.consommable-container').forEach(box => {
            box.style.transition = 'transform 4s ease';
            box.style.transform = 'rotateX(-50deg)';
            // console.log("consommable-container : transform = rotateX(-50deg)");
        });

        const hexGrid = document.querySelector('#hexGrid');
        if (hexGrid) {
            hexGrid.style.transition = 'transform 4s ease';
            hexGrid.style.transform = 'perspective(2000px) rotateX(50deg)';
            // console.log("hexGrid : transform = perspective(2000px) rotateX(50deg)");
        }

        const backgroundBas = document.querySelector('.foreground');
        if (backgroundBas) {
            backgroundBas.style.transition = 'top 4s ease, transform 4s ease';
            backgroundBas.style.top = '75%';
            backgroundBas.style.transform = 'scale(1)';
            // console.log("foreground : top = 75%, transform = scale(1)");
        }

        const board = document.querySelector('.board');
        if (board) {
            board.style.transition = 'top 4s ease, transform 4s ease';
            board.style.transform = 'scale(0.7)';
            board.style.top = '-8%';
            // console.log("board : top = -8%, transform = scale(0.7)");
        }

        const gameContainer = document.querySelector('#game-container');
        if (gameContainer) {
            gameContainer.style.transition = 'transform 4s ease';
            gameContainer.style.transform = 'scale(1)';
            gameContainer.style.transformOrigin = 'initial';
            // console.log("#game-container : transform = scale(1), transform-origin = initial");
        }

        // Délai de 4 secondes pour commencer la transition d'opacité de 3 secondes
setTimeout(() => {
    document.querySelectorAll('.hud-ingame').forEach(element => {
        element.style.transition = 'opacity 2s ease';
        element.style.opacity = '1';
        // console.log("hud-ingame : opacity = 1");
    });

    document.querySelectorAll('.hex.occupied .socle, .board-ui').forEach(element => {
        element.style.transition = 'opacity 3s ease';
        element.style.opacity = '1';
        // console.log(`${element.className} : opacity = 1`);
    });

    // Supprimer l'effet de transition après 3 secondes
    setTimeout(() => {
        document.querySelectorAll('.hud-ingame, .hex.occupied .socle, .board-ui').forEach(element => {
            element.style.transition = ''; // Supprime la transition
            // console.log(`${element.className} : transition removed`);
        });}, 3000);  // Supprimer l'effet de transition après 3 secondes
}, 2000); // Délai de 4 secondes avant de commencer la transition d'opacité
    }, 1000);
}




export function parallaxEffect() {
    // console.log("Initialisation de parallaxEffect");

    const hexGrid = document.querySelector('#hexGrid');
    const board = document.querySelector('.board');
    const backgroundBas = document.querySelector('.foreground');

    if (hexGrid && board && backgroundBas) {
        // console.log("Appel de setInitialParallaxValues pour définir les valeurs de base");
        setInitialParallaxValues();

        // Valeurs normales pour les effets de parallaxe
        let hudIngameRotation = -50;
        let dragBoxRotation = -50;
        let hexGridRotation = 50;
        let consommablesRotation = -50;
        const minRotation = -75;
        const maxRotation = -10;
        const minHexGridRotation = 10;
        const maxHexGridRotation = 75;
        let backgroundBasTop = 75;

        const applyTransformations = () => {
            console.log("Application des transformations dans applyTransformations");

            document.querySelectorAll('.hud-ingame').forEach(element => 
                element.style.transform = `rotateX(${hudIngameRotation}deg) scale(0.8)`
            );
            document.querySelectorAll('.drag-box').forEach(box => 
                box.style.transform = `rotateX(${dragBoxRotation}deg)`
            );
            document.querySelectorAll('.consommable-container').forEach(box => 
                box.style.transform = `rotateX(${consommablesRotation}deg)`
            );
            hexGrid.style.transform = `perspective(2000px) rotateX(${hexGridRotation}deg)`;
            backgroundBas.style.top = `${backgroundBasTop}%`;

            if (backgroundBasTop > 90) {
                board.style.top = '-20%';
                backgroundBas.style.transform = 'scale(1.1)';
                console.log("board et foreground ajustés pour >90%");
            } else if (backgroundBasTop >= 75) {
                backgroundBas.style.transform = 'scale(1)';
                board.style.transform = 'scale(0.7)';
                board.style.top = '-8%';
                console.log("board et foreground ajustés pour >=75%");
            } else {
                backgroundBas.style.transform = 'scale(1.1)';
                board.style.transform = 'scale(0.65)';
                board.style.top = '10%';
                console.log("board et foreground ajustés pour <75%");
            }
            backgroundBas.style.transformOrigin = 'center';
        };

        board.style.transition = 'top 2s ease, transform 2s ease';
        backgroundBas.style.transition = 'top 2s ease, transform 2s ease';

        // Désactiver l'effet de parallaxe pendant 5 secondes
        let parallaxEnabled = false;

        const handleWheelEvent = (event) => {
            if (!parallaxEnabled) return;

            if (event.deltaY > 0) { // Scroll down
                if (hudIngameRotation > minRotation && dragBoxRotation > minRotation && hexGridRotation < maxHexGridRotation) {
                    hudIngameRotation = Math.max(hudIngameRotation - 1, minRotation);
                    consommablesRotation = Math.max(consommablesRotation - 1, minRotation);
                    dragBoxRotation = Math.max(dragBoxRotation - 1, minRotation);
                    hexGridRotation = Math.min(hexGridRotation + 1, maxHexGridRotation);
                    backgroundBasTop = Math.max(backgroundBasTop - 1, 45);
                    console.log("Scroll down : ajustement des rotations et top");
                }
            } else if (event.deltaY < 0) { // Scroll up
                if (hudIngameRotation < maxRotation && dragBoxRotation < maxRotation && hexGridRotation > minHexGridRotation) {
                    hudIngameRotation = Math.min(hudIngameRotation + 1, maxRotation);
                    consommablesRotation = Math.min(consommablesRotation + 1, maxRotation);
                    dragBoxRotation = Math.min(dragBoxRotation + 1, maxRotation);
                    hexGridRotation = Math.max(hexGridRotation - 1, minHexGridRotation);
                    backgroundBasTop = Math.min(backgroundBasTop + 1, 100);
                    console.log("Scroll up : ajustement des rotations et top");
                }
            }

            applyTransformations();
        };

        document.addEventListener('wheel', handleWheelEvent);

        // Activer l'effet de parallaxe après 4,5 secondes
        setTimeout(() => {
            parallaxEnabled = true;
          
        }, 6000); 
    } else {
        console.error('One or more elements could not be found in the DOM.');
    }
}




export function adjustFontSize(element, minFontSize = 6) {
  let fontSize = parseFloat(getComputedStyle(element).fontSize);

  while (element.scrollWidth > element.clientWidth && fontSize > minFontSize) {
    fontSize -= 0.5;
    element.style.fontSize = fontSize + "px";
  }
}
export function toRoman(n) {
  n = Math.max(1, Math.floor(n || 0));
  const map = [
    [1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],
    [100,'C'],[90,'XC'],[50,'L'],[40,'XL'],
    [10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']
  ];
  let res = '';
  for (const [val, sym] of map) {
    while (n >= val) { res += sym; n -= val; }
  }
  return res;
}

 export function isRegenKey(k) {
  return /^\d{3}$/.test(k);
}
export function toNonNegInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

