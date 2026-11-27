import { removeCombatVisualAfter } from "../combat/clock.js";
import { showDamagePopup, showEffectPopup, formatEffectPopup } from "../rendering/popups.js";
import { HelpText, HELPER_PICTOGRAM_NAMES } from "../data/helpers.js";
import { getDisplayStatKey, normalizeStatKey } from "../entities/rules.js";
import { calculateStatSources } from "../entities/statSystem.js";
import { stats as STATS_DATA } from "../data/statsData.js";
import { playCachedGif } from "../data/loaderList.js";
import { createEntiteScanInDOM, createHeadUpInDom } from "../rendering/entities.js";
import { renderCurrentBattleLog } from "../combat/journal.js";
import { getVisibleHexes, setVisibleHexes } from "../storage/gameStorage.js";
import { hideCombatAttackControlPanel, isCombatAttackControlPanelOpenFor, showCombatAttackControlPanel } from "./attacks.js";

export function getOrCreateGameContainer() {
    const gameWindows = document.getElementById('game-windows');
    if (!gameWindows) {
        console.error("❌ 'game-windows' introuvable, impossible de créer 'game-container'.");
        return null;
    }

    let gameContainer = document.getElementById('game-container');
    if (!gameContainer) {
        console.warn("⚠️ #game-container manquant, création automatique.");
        gameContainer = document.createElement('div');
        gameContainer.id = 'game-container';
        gameWindows.appendChild(gameContainer); // ✅ Correct : enfant de #game-windows
    }
    return gameContainer;
}

let openWindows = [];
export function goldTitle(text, tag = "p", opts = {}) {
  const {
    containerClass = "entity-stats-title statistiques",
    titleClass = "title",
    lineClass = "separation-line golden",
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
const ENTITY_FOCUS_HOLD_MS = 2000;
const ENTITY_FOCUS_MOVE_TOLERANCE = 10;
let outsideEntityClickBound = false;

function resetBattlefieldFocusStyles() {
    document.querySelectorAll('.hex .hud-ingame, .hex .drag-box, .hex .socle').forEach((element) => {
        element.style.filter = '';
        element.style.opacity = '';
    });
    document.querySelectorAll('.background, .foreground, .ground').forEach((element) => {
        element.style.filter = '';
    });
    document.querySelectorAll('#hexGrid .hex').forEach((hex) => {
        hex.classList.remove('targetable', 'supportable', 'summonable');
        hex.querySelector('.sprite-container')?.classList.remove('targetable', 'supportable', 'summonable');
    });
    applySoclesVisibility(soclesVisible);
}

function clearBattlefieldFocus() {
    document.querySelectorAll('[id^="spriteContainer_"]').forEach((sprite) => {
        sprite.classList.remove('focused', 'targetable', 'supportable');
        sprite.closest('.hex')?.classList.remove('focused', 'targetable', 'supportable');
        const entityId = sprite.id.split('_')[1];
        document.getElementById(`TargetInfos_${entityId}`)?.classList.remove('focused', 'targetable', 'supportable');
    });
    resetBattlefieldFocusStyles();
}

function applyBattlefieldFocus(element, entityId) {
    clearBattlefieldFocus();
    element.classList.add('focused', 'targetable', 'supportable');
    element.closest('.hex')?.classList.add('focused', 'targetable', 'supportable');
    document.getElementById(`TargetInfos_${entityId}`)?.classList.add('focused', 'targetable', 'supportable');
    checkFocused();
}

export function toggleScanEntityListener() {
    document.querySelectorAll('[id^="spriteContainer_"]').forEach(element => {
        if (eventListenersMap.has(element)) {
            const {
                clickHandler,
                dblclickHandler,
                pointerDownHandler,
                pointerMoveHandler,
                pointerUpHandler,
                pointerCancelHandler,
                dragStartHandler,
            } = eventListenersMap.get(element);
            element.removeEventListener('click', clickHandler);
            element.removeEventListener('dblclick', dblclickHandler);
            element.removeEventListener('pointerdown', pointerDownHandler);
            element.removeEventListener('pointermove', pointerMoveHandler);
            element.removeEventListener('pointerup', pointerUpHandler);
            element.removeEventListener('pointercancel', pointerCancelHandler);
            element.removeEventListener('dragstart', dragStartHandler);
        }

        let clickTimeout = null;
        let holdTimer = null;
        let holdPointerId = null;
        let holdStart = null;
        let holdActivated = false;
        let suppressClickUntil = 0;

        const entityIdFromElement = () => element.id.split('_')[1] || null;
        const cancelHoldTimer = () => {
            if (holdTimer) window.clearTimeout(holdTimer);
            holdTimer = null;
        };
        const releaseHold = (event = null) => {
            cancelHoldTimer();
            if (holdActivated) {
                clearBattlefieldFocus();
                suppressClickUntil = Date.now() + 500;
            }
            if (holdPointerId !== null && element.hasPointerCapture?.(holdPointerId)) {
                element.releasePointerCapture(holdPointerId);
            }
            holdPointerId = null;
            holdStart = null;
            holdActivated = false;
            if (event?.type === 'pointercancel') suppressClickUntil = Date.now() + 500;
        };

        const pointerDownHandler = (event) => {
            if (event.button !== 0 && event.pointerType !== 'touch') return;
            cancelHoldTimer();
            holdPointerId = event.pointerId;
            holdStart = { x: event.clientX, y: event.clientY };
            holdActivated = false;
            try {
                element.setPointerCapture?.(event.pointerId);
            } catch {
                // Les événements synthétiques de test n'enregistrent pas toujours le pointeur.
            }
            holdTimer = window.setTimeout(() => {
                const entityId = entityIdFromElement();
                if (!entityId || holdPointerId !== event.pointerId) return;
                holdActivated = true;
                applyBattlefieldFocus(element, entityId);
            }, ENTITY_FOCUS_HOLD_MS);
        };
        const pointerMoveHandler = (event) => {
            if (holdPointerId !== event.pointerId || !holdStart || holdActivated) return;
            if (Math.hypot(event.clientX - holdStart.x, event.clientY - holdStart.y) > ENTITY_FOCUS_MOVE_TOLERANCE) {
                releaseHold(event);
            }
        };
        const pointerUpHandler = (event) => {
            if (holdPointerId === event.pointerId) releaseHold(event);
        };
        const pointerCancelHandler = (event) => {
            if (holdPointerId === event.pointerId) releaseHold(event);
        };
        const dragStartHandler = (event) => {
            releaseHold(event);
            clearBattlefieldFocus();
        };

        const clickHandler = function(event) {
            if (Date.now() < suppressClickUntil) {
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            clearTimeout(clickTimeout);

            clickTimeout = setTimeout(() => {
                const entityId = entityIdFromElement();
                if (!entityId) return;

                if (!event.shiftKey) {
                    document.querySelectorAll('[id^="headsup-container_"]').forEach(headsupContainer => {
                        headsupContainer.remove();
                    });
                }

                clearBattlefieldFocus();
                if (isCombatAttackControlPanelOpenFor(entityId)) {
                    hideCombatAttackControlPanel();
                    return;
                }

                applyBattlefieldFocus(element, entityId);
                const alliedPanel = showCombatAttackControlPanel(entityId);
                if (alliedPanel) return;

                const headsupContainerId = `headsup-container_${entityId}`;
                let currentHeadsupContainer = document.getElementById(headsupContainerId);
                if (!currentHeadsupContainer) {
                    createHeadUpInDom(entityId);
                } else {
                    currentHeadsupContainer.style.display =
                        currentHeadsupContainer.style.display === 'none' ? 'flex' : 'none';
                    if (currentHeadsupContainer.style.display === 'none') clearBattlefieldFocus();
                }
            }, 200);
        };

        const dblclickHandler = function(event) {
            clearTimeout(clickTimeout);

            const idParts = this.id.split('_');
            if (idParts.length < 2) return;
            const entityId = Number(idParts[1]);
            toggleScanEntity(`ScanEntity_${entityId}`, event.shiftKey);
            applyBattlefieldFocus(element, entityId);
            showCombatAttackControlPanel(entityId);
        };

        element.addEventListener('click', clickHandler);
        element.addEventListener('dblclick', dblclickHandler);
        element.addEventListener('pointerdown', pointerDownHandler);
        element.addEventListener('pointermove', pointerMoveHandler);
        element.addEventListener('pointerup', pointerUpHandler);
        element.addEventListener('pointercancel', pointerCancelHandler);
        element.addEventListener('dragstart', dragStartHandler);

        eventListenersMap.set(element, {
            clickHandler,
            dblclickHandler,
            pointerDownHandler,
            pointerMoveHandler,
            pointerUpHandler,
            pointerCancelHandler,
            dragStartHandler,
        });
    });

    if (outsideEntityClickBound) return;
    outsideEntityClickBound = true;
    document.addEventListener('click', function(event) {
        if (
            !event.target.closest('[id^="headsup-container_"]') &&
            !event.target.closest('[id^="ScanEntity_"]') &&
            !event.target.closest('[class^="board-ui"]') &&
            !event.target.closest('.combat-attack-control-panel') &&
            !event.target.closest('[id^="globalhelper"]') &&
            !event.target.closest('[id^="spriteContainer_"]')
        ) {
            document.querySelectorAll('[id^="headsup-container_"]').forEach(headsupContainer => {
                headsupContainer.remove();
            });

            clearBattlefieldFocus();
            hideCombatAttackControlPanel();
        }
    });
}
export function createBattleLogUi(boardUI) {
    const GameUI = document.querySelector('.Game-UI');
    if (!GameUI) return;

    let viewControls = GameUI.querySelector(':scope > .view-controls');
    if (!viewControls) {
        viewControls = document.createElement('div');
        viewControls.className = 'view-controls';
        GameUI.appendChild(viewControls);
    }

    const existingBattleLogButton = document.querySelector('.battle-log-button');
    if (existingBattleLogButton) {
        if (existingBattleLogButton.parentElement !== viewControls) {
            viewControls.appendChild(existingBattleLogButton);
        }
        return;
    }

    const battleLogButton = document.createElement('div');
    battleLogButton.id = 'battle-log-button';
    battleLogButton.className = 'battle-log-button';
    battleLogButton.alt = 'rapport de bataille';

    const battleLogIcon = document.createElement('div');
    battleLogIcon.className = 'battleLogs picto-ui';

    battleLogButton.appendChild(battleLogIcon);
    viewControls.appendChild(battleLogButton);

    battleLogButton.addEventListener('click', () => {
        toggleBattleLogHelper();
        battleLogButton.classList.toggle('active');
    });
}

function toggleBattleLogHelper() {
    const gameHelper = document.querySelector('.board-ui');

    if (!gameHelper) {
        console.warn('Aucune div .Game-helper trouvée pour le rapport de bataille.');
        return;
    }

    let battleLogHelper = document.getElementById('battle-log-helper');

    if (battleLogHelper) {
        battleLogHelper.remove();
        return;
    }

    battleLogHelper = document.createElement('div');
    battleLogHelper.id = 'battle-log-helper';
    battleLogHelper.className = 'battle-log-helper';

battleLogHelper.innerHTML = `
    <span class="close-helper" id="close-battlelog-button">X</span>

    <div class="battle-log-header">
        <span class="battle-log-title">Rapport de bataille</span>
    </div>

    <div class="battle-log-list"></div>
`;

    gameHelper.appendChild(battleLogHelper);
	renderCurrentBattleLog();
	const closeBattleLogButton = document.getElementById('close-battlelog-button');

closeBattleLogButton.addEventListener('click', () => {
    battleLogHelper.remove();

    const battleLogButton = document.getElementById('battle-log-button');
    if (battleLogButton) {
        battleLogButton.classList.remove('active');
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
    const usesFusedCombatHud = Boolean(showCombatAttackControlPanel(numericId));

    // En combat, le side A utilise le panneau fusionné ; le HUD historique reste au side B.
    if (!currentHeadsupContainer && !usesFusedCombatHud) {
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
        const classe = parent.dataset.attackDomain === 'invocateur' ? 'Invocateur'
            : parent.dataset.attackFunction || 'Unknown';

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

        const elementsToReset = document.querySelectorAll('.hex.focused .hud-ingame, .hex.focused .drag-box, .hex.focused .socle');
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
                        element.querySelectorAll('.drag-box, .hud-ingame, .socle').forEach(node => {
                            node.style.filter = 'none';
                            node.style.opacity = '1';
                        });
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
                        element.querySelectorAll('.drag-box, .hud-ingame, .socle').forEach(node => {
                            node.style.filter = 'none';
                            node.style.opacity = '1';
                        });
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

    } else {
        resetBattlefieldFocusStyles();
    }
}





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
function applySoclesVisibility(visible) {
    soclesVisible = visible === true;
    const seeHexButton = document.getElementById('see-hex');
    const hideHexButton = document.getElementById('hide-hex');
    if (hideHexButton) hideHexButton.style.display = soclesVisible ? 'block' : 'none';
    if (seeHexButton) seeHexButton.style.display = soclesVisible ? 'none' : 'block';
    document.querySelectorAll('#hexGrid .hex:not(.occupied) .socle').forEach(socle => {
        socle.style.opacity = soclesVisible ? '1' : '0';
    });
}

function showSocles() { setVisibleHexes(true); }
function hideSocles() { setVisibleHexes(false); }

export function HexButtonVisibility(initialVisible = getVisibleHexes()) {
    document.getElementById('see-hex')?.addEventListener('click', showSocles);
    document.getElementById('hide-hex')?.addEventListener('click', hideSocles);
    applySoclesVisibility(initialVisible);
}

window.addEventListener('visibleHexesChanged', ({ detail }) => applySoclesVisibility(detail.visibleHexes));
document.addEventListener('hexGridCreated', () => HexButtonVisibility());

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

    // Une seule `.board-ui`, toujours enfant direct de `#game-container`.
    const boardUIs = [...document.querySelectorAll('.board-ui')];
    let boardUI = boardUIs.find((element) => element.parentElement === gameContainer)
        || boardUIs[0]
        || null;
    if (!boardUI) {
        boardUI = document.createElement('div');
        boardUI.className = 'board-ui';
    }
    if (boardUI.parentElement !== gameContainer || gameContainer.firstElementChild !== boardUI) {
        gameContainer.insertBefore(boardUI, gameContainer.firstChild);
    }
    boardUIs.forEach((element) => {
        if (element !== boardUI) element.remove();
    });

    document.querySelectorAll('#help-display').forEach((element) => {
        if (element.parentElement !== boardUI) element.remove();
    });

    let helpButton = boardUI.querySelector(':scope > #help-display');
    if (!helpButton) {
        helpButton = document.createElement('span');
        helpButton.className = 'help-button';
        helpButton.id = 'help-display';
        helpButton.textContent = '?';
        boardUI.appendChild(helpButton);
    }

    // Un seul parent de contrôles de vue, toujours enfant direct de .Game-UI.
    let gameUI = document.querySelector('.Game-UI');
    if (!gameUI) {
        gameUI = document.createElement('div');
        gameUI.className = 'Game-UI';
        gameContainer.appendChild(gameUI);
    }

    let viewControls = gameUI.querySelector(':scope > .view-controls');
    if (!viewControls) {
        viewControls = document.createElement('div');
        viewControls.className = 'view-controls';
        gameUI.appendChild(viewControls);
    }

    // Nettoyage défensif : aucun autre .view-controls ne doit survivre ailleurs.
    document.querySelectorAll('.view-controls').forEach(other => {
        if (other === viewControls) return;

        other.querySelectorAll('.seehex-button, .hidehex-button, .reset-view-button')
            .forEach(control => {
                if (!viewControls.querySelector(`.${control.classList[0]}`)) {
                    viewControls.appendChild(control);
                }
            });

        other.remove();
    });

    if (!viewControls.querySelector('.seehex-button')) {
        const seeHexButton = document.createElement('div');
        seeHexButton.id = 'see-hex';
        seeHexButton.className = 'seehex-button';
        seeHexButton.alt = 'voir les hexagones';

        const seeHexIcon = document.createElement('div');
        seeHexIcon.className = 'seeHex picto-ui';
        seeHexButton.appendChild(seeHexIcon);

        viewControls.appendChild(seeHexButton);
    }

    if (!viewControls.querySelector('.hidehex-button')) {
        const hideHexButton = document.createElement('div');
        hideHexButton.id = 'hide-hex';
        hideHexButton.className = 'hidehex-button';
        hideHexButton.alt = 'masquer les hexagones';

        const hideHexIcon = document.createElement('div');
        hideHexIcon.className = 'hideHex picto-ui';
        hideHexButton.appendChild(hideHexIcon);

        viewControls.appendChild(hideHexButton);
    }

    createBattleLogUi(boardUI);

    // Ordre fixe dans l'unique parent.
    const seeHexControl = viewControls.querySelector('.seehex-button');
    const hideHexControl = viewControls.querySelector('.hidehex-button');
    const resetViewControl = viewControls.querySelector('.reset-view-button');
    const battleLogControl = viewControls.querySelector('.battle-log-button');
    if (seeHexControl) viewControls.appendChild(seeHexControl);
    if (hideHexControl) viewControls.appendChild(hideHexControl);
    if (battleLogControl) viewControls.appendChild(battleLogControl);
    if (resetViewControl) viewControls.appendChild(resetViewControl);

    // Une interface reconstruite doit retrouver exactement l'état normal
    // persisté des socles et de ses contrôles de vue.
    HexButtonVisibility(getVisibleHexes());
    setResetViewButtonVisible(false);
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
    // La cinématique de chargement possède la priorité jusqu'à sa fin complète.
    stageLoadingAnimationActive = true;

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
        });

        // La cinématique de chargement du niveau est maintenant totalement terminée.
        stageLoadingAnimationActive = false;

        // Si un event a démarré pendant le chargement, sa vue cinématique
        // n'est appliquée que maintenant, jamais avant.
        if (pendingCinematicViewAfterStageLoad) {
            pendingCinematicViewAfterStageLoad = false;
            requestAnimationFrame(() => cinematicView());
        }
    }, 3000);  // Supprimer l'effet de transition après 3 secondes
}, 2000); // Délai avant de commencer la transition d'opacité
    }, 1000);
}





let parallaxResetHandler = null;
let parallaxIntermediateHandler = null;
let parallaxWheelTarget = null;
let parallaxWheelHandler = null;
let parallaxEnableTimer = null;

// La cinématique de chargement du niveau reste prioritaire sur cinematicView().
let stageLoadingAnimationActive = false;
let pendingCinematicViewAfterStageLoad = false;

const INTERMEDIATE_PARALLAX = Object.freeze({
    hudRotation: -55,
    dragRotation: -55,
    hexRotation: 55,
    consommablesRotation: -55,
    backgroundTop: 70,
    boardTop: '1%',
    boardScale: 0.675,
    foregroundScale: 1.05
});

function setResetViewButtonVisible(visible) {
    document.querySelectorAll('.reset-view-button').forEach(button => {
        button.style.opacity = visible ? '1' : '0';
        button.style.pointerEvents = visible ? 'auto' : 'none';
    });
}


/**
 * Applique une légère perspective intermédiaire.
 * Le palier de base reste à 50° ; ce palier léger est à 55°.
 *
 * Aucun élément du DOM n'est créé, déplacé ou supprimé ici.
 */
export function cinematicView() {
    if (document.getElementById('loadingScreen') || stageLoadingAnimationActive) {
        pendingCinematicViewAfterStageLoad = true;
        return { deferred: true, reason: 'stage-loading-cinematic' };
    }

    pendingCinematicViewAfterStageLoad = false;

    document.querySelectorAll('.hud-ingame').forEach(element => {
        element.style.transition = 'transform 2s ease';
    });

    document.querySelectorAll('.drag-box, .chest-container').forEach(element => {
        element.style.transition = 'transform 2s ease';
    });

    document.querySelectorAll('.consommable-container').forEach(element => {
        element.style.transition = 'transform 2s ease';
    });

    const hexGrid = document.querySelector('#hexGrid');
    const backgroundBas = document.querySelector('.foreground');
    const board = document.querySelector('.board');

    if (hexGrid) hexGrid.style.transition = 'transform 2s ease';
    if (backgroundBas) backgroundBas.style.transition = 'top 2s ease, transform 2s ease';
    if (board) board.style.transition = 'top 2s ease, transform 2s ease';

    if (typeof parallaxIntermediateHandler === 'function') {
        return parallaxIntermediateHandler();
    }

    document.querySelectorAll('.hud-ingame').forEach(element => {
        element.style.transform = `rotateX(${INTERMEDIATE_PARALLAX.hudRotation}deg) scale(0.8)`;
    });

    document.querySelectorAll('.drag-box, .chest-container').forEach(element => {
        element.style.transform = `rotateX(${INTERMEDIATE_PARALLAX.dragRotation}deg)`;
    });

    document.querySelectorAll('.consommable-container').forEach(element => {
        element.style.transform = `rotateX(${INTERMEDIATE_PARALLAX.consommablesRotation}deg)`;
    });

    if (hexGrid) {
        hexGrid.style.transform = `perspective(2000px) rotateX(${INTERMEDIATE_PARALLAX.hexRotation}deg)`;
    }

    if (backgroundBas) {
        backgroundBas.style.top = `${INTERMEDIATE_PARALLAX.backgroundTop}%`;
        backgroundBas.style.transform = `scale(${INTERMEDIATE_PARALLAX.foregroundScale})`;
        backgroundBas.style.transformOrigin = 'center';
    }

    if (board) {
        board.style.top = INTERMEDIATE_PARALLAX.boardTop;
        board.style.transform = `scale(${INTERMEDIATE_PARALLAX.boardScale})`;
    }

    const gameContainer = document.querySelector('#game-container');

    if (gameContainer) {
        gameContainer.style.transform = 'scale(1)';
        gameContainer.style.transformOrigin = 'initial';
    }

    setResetViewButtonVisible(true);
    return true;
}
/**
 * Restaure la vue de jeu au palier de perspective normal.
 *
 * Valeurs de base :
 * - HUD / drag / consommables : rotateX(-50deg)
 * - hexGrid : perspective(2000px) rotateX(50deg)
 * - foreground : top 75%, scale(1)
 * - board : top -8%, scale(0.7)
 * - game-container : scale(1)
 *
 * Si parallaxEffect() est déjà actif, ses variables internes sont également
 * remises à zéro afin que la molette reparte exactement de ce palier.
 */
export function resetParallaxView({ force = false } = {}) {
    if (!force && (document.getElementById('loadingScreen') || stageLoadingAnimationActive)) {
        // L'event s'est terminé avant la fin du chargement :
        // on laisse la cinématique de stage finir normalement à 50°.
        pendingCinematicViewAfterStageLoad = false;
        return {
            deferred: true,
            reason: 'stage-loading-cinematic'
        };
    }

    pendingCinematicViewAfterStageLoad = false;

    if (typeof parallaxResetHandler === 'function') {
        return parallaxResetHandler();
    }

    // Fallback : permet au bouton de restaurer la vue même si
    // parallaxEffect() n'a pas encore installé son handler interne.
    document.querySelectorAll('.hud-ingame').forEach(element => {
        element.style.transform = 'rotateX(-50deg) scale(0.8)';
    });

    document
        .querySelectorAll('.drag-box, .chest-container')
        .forEach(element => {
            element.style.transform = 'rotateX(-50deg)';
        });

    document
        .querySelectorAll('.consommable-container')
        .forEach(element => {
            element.style.transform = 'rotateX(-50deg)';
        });

    const hexGrid = document.querySelector('#hexGrid');
    if (hexGrid) {
        hexGrid.style.transform = 'perspective(2000px) rotateX(50deg)';
    }

    const backgroundBas = document.querySelector('.foreground');
    if (backgroundBas) {
        backgroundBas.style.top = '75%';
        backgroundBas.style.transform = 'scale(1)';
        backgroundBas.style.transformOrigin = 'center';
    }

    const board = document.querySelector('.board');
    if (board) {
        board.style.top = '-8%';
        board.style.transform = 'scale(0.7)';
    }

    const gameContainer = document.querySelector('#game-container');
    if (gameContainer) {
        gameContainer.style.transform = 'scale(1)';
        gameContainer.style.transformOrigin = 'initial';
    }

    setResetViewButtonVisible(false);
    return true;
}

export function parallaxEffect({ applyInitialState = true, enableDelay = 6000 } = {}) {
    const hexGrid = document.querySelector('#hexGrid');
    const board = document.querySelector('.board');
    const backgroundBas = document.querySelector('.foreground');

    if (hexGrid && board && backgroundBas) {
        if (parallaxWheelTarget && parallaxWheelHandler) {
            parallaxWheelTarget.removeEventListener('wheel', parallaxWheelHandler);
        }
        clearTimeout(parallaxEnableTimer);
        parallaxEnableTimer = null;
        if (applyInitialState) setInitialParallaxValues();

        const BASE_HUD_ROTATION = -50;
        const BASE_DRAG_ROTATION = -50;
        const BASE_HEX_ROTATION = 50;
        const BASE_CONSUMMABLE_ROTATION = -50;
        const BASE_BACKGROUND_TOP = 75;

        let hudIngameRotation = BASE_HUD_ROTATION;
        let dragBoxRotation = BASE_DRAG_ROTATION;
        let hexGridRotation = BASE_HEX_ROTATION;
        let consommablesRotation = BASE_CONSUMMABLE_ROTATION;

        const minRotation = -75;
        const maxRotation = -10;
        const minHexGridRotation = 10;
        const maxHexGridRotation = 75;

        let backgroundBasTop = BASE_BACKGROUND_TOP;

        const applyTransformations = () => {
            document.querySelectorAll('.hud-ingame').forEach(element => {
                element.style.transform =
                    `rotateX(${hudIngameRotation}deg) scale(0.8)`;
            });

            document
                .querySelectorAll('.drag-box, .chest-container')
                .forEach(element => {
                    element.style.transform =
                        `rotateX(${dragBoxRotation}deg)`;
                });

            document
                .querySelectorAll('.consommable-container')
                .forEach(element => {
                    element.style.transform =
                        `rotateX(${consommablesRotation}deg)`;
                });

            hexGrid.style.transform =
                `perspective(2000px) rotateX(${hexGridRotation}deg)`;

            backgroundBas.style.top = `${backgroundBasTop}%`;

            if (backgroundBasTop > 90) {
                board.style.top = '-20%';
                backgroundBas.style.transform = 'scale(1.1)';
            } else if (backgroundBasTop >= 75) {
                backgroundBas.style.transform = 'scale(1)';
                board.style.transform = 'scale(0.7)';
                board.style.top = '-8%';
            } else {
                backgroundBas.style.transform = 'scale(1.1)';
                board.style.transform = 'scale(0.65)';
                board.style.top = '10%';
            }

            backgroundBas.style.transformOrigin = 'center';
        };

        // Palier léger : 55°. Les variables internes de la molette
        // sont synchronisées avec la vue affichée.
        parallaxIntermediateHandler = () => {
            hudIngameRotation = INTERMEDIATE_PARALLAX.hudRotation;
            dragBoxRotation = INTERMEDIATE_PARALLAX.dragRotation;
            hexGridRotation = INTERMEDIATE_PARALLAX.hexRotation;
            consommablesRotation = INTERMEDIATE_PARALLAX.consommablesRotation;
            backgroundBasTop = INTERMEDIATE_PARALLAX.backgroundTop;

            document.querySelectorAll('.hud-ingame').forEach(element => {
                element.style.transform =
                    `rotateX(${hudIngameRotation}deg) scale(0.8)`;
            });

            document
                .querySelectorAll('.drag-box, .chest-container')
                .forEach(element => {
                    element.style.transform =
                        `rotateX(${dragBoxRotation}deg)`;
                });

            document
                .querySelectorAll('.consommable-container')
                .forEach(element => {
                    element.style.transform =
                        `rotateX(${consommablesRotation}deg)`;
                });

            hexGrid.style.transform =
                `perspective(2000px) rotateX(${hexGridRotation}deg)`;

            backgroundBas.style.top = `${backgroundBasTop}%`;
            backgroundBas.style.transform =
                `scale(${INTERMEDIATE_PARALLAX.foregroundScale})`;
            backgroundBas.style.transformOrigin = 'center';

            board.style.top = INTERMEDIATE_PARALLAX.boardTop;
            board.style.transform =
                `scale(${INTERMEDIATE_PARALLAX.boardScale})`;

            const gameContainer = document.querySelector('#game-container');
            if (gameContainer) {
                gameContainer.style.transform = 'scale(1)';
                gameContainer.style.transformOrigin = 'initial';
            }

            setResetViewButtonVisible(true);
            return true;
        };

        // Reset réel du palier : on remet à la fois le DOM et les variables
        // utilisées ensuite par la molette.
        parallaxResetHandler = () => {
            hudIngameRotation = BASE_HUD_ROTATION;
            dragBoxRotation = BASE_DRAG_ROTATION;
            hexGridRotation = BASE_HEX_ROTATION;
            consommablesRotation = BASE_CONSUMMABLE_ROTATION;
            backgroundBasTop = BASE_BACKGROUND_TOP;

            applyTransformations();

            const gameContainer = document.querySelector('#game-container');
            if (gameContainer) {
                gameContainer.style.transform = 'scale(1)';
                gameContainer.style.transformOrigin = 'initial';
            }

            setResetViewButtonVisible(false);
            return true;
        };

        board.style.transition =
            'top 2s ease, transform 2s ease';

        backgroundBas.style.transition =
            'top 2s ease, transform 2s ease';

        let parallaxEnabled = false;

        const handleWheelEvent = event => {
            if (!parallaxEnabled) return;

            // La perspective ne réagit que lorsque la molette est utilisée
            // directement sur la zone #hexGrid (ou l'un de ses enfants).
            event.preventDefault();

            if (event.deltaY > 0) {
                if (
                    hudIngameRotation > minRotation &&
                    dragBoxRotation > minRotation &&
                    hexGridRotation < maxHexGridRotation
                ) {
                    hudIngameRotation = Math.max(
                        hudIngameRotation - 1,
                        minRotation
                    );

                    consommablesRotation = Math.max(
                        consommablesRotation - 1,
                        minRotation
                    );

                    dragBoxRotation = Math.max(
                        dragBoxRotation - 1,
                        minRotation
                    );

                    hexGridRotation = Math.min(
                        hexGridRotation + 1,
                        maxHexGridRotation
                    );

                    backgroundBasTop = Math.max(
                        backgroundBasTop - 1,
                        45
                    );
                }
            } else if (event.deltaY < 0) {
                if (
                    hudIngameRotation < maxRotation &&
                    dragBoxRotation < maxRotation &&
                    hexGridRotation > minHexGridRotation
                ) {
                    hudIngameRotation = Math.min(
                        hudIngameRotation + 1,
                        maxRotation
                    );

                    consommablesRotation = Math.min(
                        consommablesRotation + 1,
                        maxRotation
                    );

                    dragBoxRotation = Math.min(
                        dragBoxRotation + 1,
                        maxRotation
                    );

                    hexGridRotation = Math.max(
                        hexGridRotation - 1,
                        minHexGridRotation
                    );

                    backgroundBasTop = Math.min(
                        backgroundBasTop + 1,
                        100
                    );
                }
            }

            // 50° définit le palier de base. Quand on y revient à la molette,
            // on resynchronise toutes les autres valeurs du palier normal.
            if (hexGridRotation === BASE_HEX_ROTATION) {
                hudIngameRotation = BASE_HUD_ROTATION;
                dragBoxRotation = BASE_DRAG_ROTATION;
                consommablesRotation = BASE_CONSUMMABLE_ROTATION;
                backgroundBasTop = BASE_BACKGROUND_TOP;
            }

            applyTransformations();
            setResetViewButtonVisible(hexGridRotation !== BASE_HEX_ROTATION);
        };

        parallaxWheelTarget = hexGrid;
        parallaxWheelHandler = handleWheelEvent;
        hexGrid.addEventListener('wheel', parallaxWheelHandler, { passive: false });

        parallaxEnableTimer = setTimeout(() => {
            document
                .querySelectorAll('.drag-box, .chest-container')
                .forEach(element => {
                    element.style.transition = 'none';
                });

            parallaxEnabled = true;
            setResetViewButtonVisible(false);
            parallaxEnableTimer = null;
        }, Math.max(0, Number(enableDelay) || 0));
    } else {
        console.error(
            'One or more elements could not be found in the DOM.'
        );
    }
}

/**
 * Réinstalle la molette sur la grille actuellement présente dans le DOM et
 * restaure immédiatement le palier normal, sans rejouer l'animation de stage.
 */
export function restoreParallaxViewAndControls() {
    parallaxEffect({ applyInitialState: false, enableDelay: 0 });
    return resetParallaxView({ force: true });
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
  return /^\d{3,}$/.test(k);
}
export function toNonNegInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

const HEALING_FEEDBACK_DURATION = 1000;

export function showHealingFeedback(target, restoredHP) {
    const amount = Math.max(0, Math.round(Number(restoredHP) || 0));
    if (!target?.id || amount <= 0) return false;

    const effectsContainer = document.getElementById(`effectsContainer_${target.id}`)
        || document.getElementById(`codex-entity-sprite-container_${target.id}`);
    if (effectsContainer) {
        const vfx = document.createElement('img');
        vfx.dataset.effectAsset = 'heal-green.gif';
        vfx.className = 'effect-vfx heal healing-feedback-vfx';
        vfx.alt = '';
        vfx.setAttribute('aria-hidden', 'true');
        effectsContainer.appendChild(vfx);
        const remove = () => {
            vfx.remove();
        };
        const timeout = removeCombatVisualAfter(vfx, 10000);
        vfx.addEventListener('load', () => {
            timeout.cancel();
            removeCombatVisualAfter(vfx, HEALING_FEEDBACK_DURATION);
        }, { once: true });
        vfx.addEventListener('error', () => { timeout.cancel(); remove(); }, { once: true });
        // Fetch once, but use an independent decoded GIF for each impact.
        playCachedGif(vfx, './media/assets/effects/heal-green.gif');
    }

    const line = document.createElement('div');
    line.className = 'healing-feedback-line';

    const icon = document.createElement('span');
    icon.className = 'healing-feedback-icon';
    icon.setAttribute('aria-hidden', 'true');

    const text = document.createElement('span');
    text.className = 'healing-feedback-value';
    text.textContent = `+${amount} HP`;

    line.append(icon, text);
    EffectMessage(target, line, 'heal healing-feedback');

    return true;
}

export function EffectMessage(target, customText = "MISS", messageType = "normal", options = {}) {
    const { container = null } = options;
    if (!target?.id || typeof document === 'undefined') return null;
    const isContentNode = customText instanceof Node;
    if (customText === 'OVERKILL !' && !container) {
        const damageHost = document.getElementById(`PopUp_${target.id}`);
        if (damageHost) return showDamagePopup(damageHost, {
            className: 'damage-popup damage-popup--overkill', iconClass: 'picto-stat overkill',
            valueClass: 'damage-popup-value', label: customText,
        }, 2);
    }
    const healingMatch = !isContentNode && String(customText).match(/^\+(\d+)\s*HP$/i);
    if (healingMatch) {
        showHealingFeedback(target, Number(healingMatch[1]));
        return;
    }

    const id = CSS.escape(String(target.id));
    const battleHost = document.getElementById(`PopDow_${target.id}`);
    const directHost = container || (battleHost?.classList.contains('combat-popup-status') && battleHost);
    const potentialContainers = directHost ? [] : [...document.querySelectorAll(`[id="PopDow_${id}"], [id="codex-entity-sprite-container_${id}"]`)];
    const foundContainer = directHost
        || potentialContainers.find(node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden')
        || potentialContainers[0];

    if (!foundContainer) {
        console.error(`🚨 Aucun conteneur PopUp trouvé pour target.id: ${target.id}.`);
        return;
    }

    const messageDiv = document.createElement("div");
    messageDiv.className = "BattleText";
    if (!isContentNode) messageDiv.id = `message_${target.id}`;
    messageDiv.classList.add("absolute");
    messageDiv.dataset.entityId = String(target.id);

    if (formatEffectPopup(messageDiv, options)) {
        messageDiv.classList.add('combat-effect-text');
    } else if (isContentNode) {
        messageDiv.classList.add(...messageType.split(/\s+/).filter(Boolean));
        messageDiv.appendChild(customText);
    } else switch (customText) {
        case "MISS":
            messageDiv.classList.add("miss");
            messageDiv.textContent = customText;
            break;

        case "Raté !":
            messageDiv.classList.add("miss");

            {
                const missLine = document.createElement("div");
                missLine.className = "effect-message-line miss";

                const missIcon = document.createElement("div");
                missIcon.className = "picto-stat miss-shot";

                const missText = document.createElement("span");
                missText.textContent = customText;

                missLine.appendChild(missIcon);
                missLine.appendChild(missText);
                messageDiv.appendChild(missLine);
            }
            break;

case "Esquive !":
case "Esquive partielle !":
    messageDiv.classList.add("dodge");

    {
        const dodgeLine = document.createElement("div");
        dodgeLine.className = "effect-message-line dodge";

        const dodgeIcon = document.createElement("div");
        dodgeIcon.className = "picto-stat dodge";

        const dodgeText = document.createElement("span");
        dodgeText.textContent = customText;

        dodgeLine.appendChild(dodgeIcon);
        dodgeLine.appendChild(dodgeText);
        messageDiv.appendChild(dodgeLine);
    }
    break;
        case "Éxecution !":
            messageDiv.classList.add("bloodFury");

            {
                const execText = document.createElement("p");
                execText.textContent = customText;
                messageDiv.appendChild(execText);
            }
            break;

        case "Indestructible !":
            messageDiv.classList.add("indestructibility");
            messageDiv.textContent = customText;
            break;

        case "Ambidextrie !":
            messageDiv.classList.add("ambidextry");
            messageDiv.textContent = customText;
            break;

        case "Ésotérisme !":
            messageDiv.classList.add("esoterism");
            messageDiv.textContent = customText;
            break;

        case "Astralité !":
            messageDiv.classList.add("astrality");
            messageDiv.textContent = customText;
            break;

        case "Transe mystique !":
            messageDiv.classList.add("mysticism");

            {
                const mysticismLine = document.createElement("div");
                mysticismLine.className = "effect-message-line mysticism";

                const mysticismIcon = document.createElement("div");
                mysticismIcon.className = "picto-stat mysticism";

                const mysticismText = document.createElement("span");
                mysticismText.textContent = customText;

                mysticismLine.appendChild(mysticismIcon);
                mysticismLine.appendChild(mysticismText);
                messageDiv.appendChild(mysticismLine);
            }
            break;
case "Fragilité !":
    messageDiv.classList.add("fragility");

    {
        const fragilityLine = document.createElement("div");
        fragilityLine.className = "effect-message-line fragility";

        const fragilityIcon = document.createElement("div");
        fragilityIcon.className = "picto-stat fragility";

        const fragilityText = document.createElement("span");
        fragilityText.textContent = customText;

        fragilityLine.appendChild(fragilityIcon);
        fragilityLine.appendChild(fragilityText);
        messageDiv.appendChild(fragilityLine);
    }
    break;
	case "Perseption équilibrée !":
    messageDiv.classList.add("balance-view");

    {
        const balanceLine = document.createElement("div");
        balanceLine.className = "effect-message-line balance-view";

        const balanceIcon = document.createElement("div");
        balanceIcon.className = "picto-stat balance-view";

        const balanceText = document.createElement("span");
        balanceText.className = "effect-txt balance-view";
        balanceText.textContent = customText;

        balanceLine.appendChild(balanceIcon);
        balanceLine.appendChild(balanceText);
        messageDiv.appendChild(balanceLine);
    }
    break;
        case "Déplacement !":
            messageDiv.classList.add("move");

            {
                const moveLine = document.createElement("div");
                moveLine.className = "effect-message-line move";

                const moveIcon = document.createElement("div");
                moveIcon.className = "picto-stat move";

                const moveText = document.createElement("span");
                moveText.textContent = customText;

                moveLine.appendChild(moveIcon);
                moveLine.appendChild(moveText);
                messageDiv.appendChild(moveLine);
            }
            break;

   case "Déplacement impossible !":
            messageDiv.classList.add("nomove");

            {
                const noMoveLine = document.createElement("div");
                noMoveLine.className = "effect-message-line nomove";

                const noMoveIcon = document.createElement("div");
                noMoveIcon.className = "picto-stat nomove";

                const noMoveText = document.createElement("span");
                noMoveText.textContent = customText;
				noMoveText.className = "effect-txt";

                noMoveLine.appendChild(noMoveIcon);
                noMoveLine.appendChild(noMoveText);
                messageDiv.appendChild(noMoveLine);
            }
            break;
	case "Marathon !":
            messageDiv.classList.add("marathon");

            {
                const marathonLine = document.createElement("div");
                marathonLine.className = "effect-message-line marathon";

                const marathonIcon = document.createElement("div");
                marathonIcon.className = "picto-stat marathon";

                const marathonText = document.createElement("span");
                marathonText.textContent = customText;

                marathonLine.appendChild(marathonIcon);
                marathonLine.appendChild(marathonText);
                messageDiv.appendChild(marathonLine);
            }
            break;
	case "OVERKILL !":
    messageDiv.classList.add("overkill");

    {
        const overkillLine = document.createElement("div");
        overkillLine.className = "effect-message-line overkill";

        const overkillIcon = document.createElement("div");
        overkillIcon.className = "picto-stat overkill";

        overkillLine.appendChild(overkillIcon);
        messageDiv.appendChild(overkillLine);
    }

    break;
case messageType === "execution-critical" ? customText : null:
    messageDiv.classList.add("execution-critical");

    {
        const execCritLine = document.createElement("div");
        execCritLine.className = "effect-message-line execution-critical";

        const execCritIcon = document.createElement("div");
        execCritIcon.className = "picto-stat execution-critical big-exec-critical";

        const execCritText = document.createElement("span");
        execCritText.className = "effect-txt execution-critical-text";

        const damageMatch = String(customText).match(/(\d+)/);
        const damageValue = damageMatch ? damageMatch[1] : "0";

        const execCritDamage = document.createElement("span");
        execCritDamage.className = "critical-exec-dmg";
        execCritDamage.textContent = ` ${damageValue} !!!`;

        execCritText.appendChild(execCritDamage);

        execCritLine.appendChild(execCritIcon);
        execCritLine.appendChild(execCritDamage);
        messageDiv.appendChild(execCritLine);
    }

    break;
case messageType === "blood-glutony" ? customText : null:
    messageDiv.classList.add("blood-glutony");

{
    const bloodGlutonyLine = document.createElement("div");
    bloodGlutonyLine.className = "effect-message-line blood-glutony";

    const bloodGlutonyIcon = document.createElement("div");
    bloodGlutonyIcon.className = "picto-stat bloodGlutony";

    const [, healPart] = String(customText).split("|");

    const bloodGlutonyHeal = document.createElement("span");
    bloodGlutonyHeal.className = "blood-glutony-heal-text heal";
    bloodGlutonyHeal.textContent = `${healPart || ""} !`;

    bloodGlutonyLine.appendChild(bloodGlutonyIcon);
    bloodGlutonyLine.appendChild(bloodGlutonyHeal);
    messageDiv.appendChild(bloodGlutonyLine);
}

    break;
        default:
            messageDiv.classList.add("generic");
            messageDiv.textContent = customText;
            break;
    }

    if (foundContainer.classList.contains('combat-popup-status')) {
        messageDiv.removeAttribute('id');
        return showEffectPopup(foundContainer, messageDiv);
    }
    foundContainer.appendChild(messageDiv);

const duration =
    customText === "OVERKILL !" || messageType === "execution-critical"
        ? 1500
        : HEALING_FEEDBACK_DURATION;

removeCombatVisualAfter(messageDiv, duration);
    return messageDiv;
}

const POPUP_ROOT_CLASS = "inventory-transfer-popup";

function getPopupHost() {
  if (typeof document === "undefined") return null;
  return document.querySelector(".Game-helper") || document.body;
}

function normalizePopupMode(mode = "auto") {
  return mode === "manual" ? "manual" : "auto";
}

function normalizePopupTone(tone = "normal") {
  return ["passive", "warning", "normal"].includes(tone) ? tone : "normal";
}

function setPopupContent(node, content, allowHTML = false) {
  if (!node) return;
  if (content instanceof Node) {
    node.appendChild(content);
    return;
  }
  if (allowHTML) {
    node.innerHTML = String(content ?? "");
    return;
  }
  node.textContent = String(content ?? "");
}

function removeExistingPopups(key = "global") {
  if (typeof document === "undefined") return;
  document
    .querySelectorAll(`.${POPUP_ROOT_CLASS}[data-popup-key="${key}"]`)
    .forEach(node => node.dismissPopup ? node.dismissPopup() : closePopupPanel(node));
}

export function dismissGamePopups() {
  document.querySelectorAll(`.${POPUP_ROOT_CLASS}`).forEach(panel => {
    if (panel.dismissPopup) panel.dismissPopup();
    else closePopupPanel(panel);
  });
}

function closePopupPanel(panel, { fade = false, fadeMs = 1500 } = {}) {
  if (!panel?.isConnected) return;
  const layer = panel.closest('.game-popup-layer') || panel;

  if (!fade) {
    layer.remove();
    return;
  }

  panel.classList.add("is-leaving");
  layer.classList.add("is-leaving");
  window.setTimeout(() => layer.remove(), Math.max(0, Number(fadeMs) || 0));
}

function buildPopupPanel({
  title = "",
  message = "",
  html = "",
  allowHTML = false,
  mode = "auto",
  tone = "normal",
  key = "global",
  className = "",
} = {}) {
  const normalizedMode = normalizePopupMode(mode);
  const normalizedTone = normalizePopupTone(tone);
  const panel = document.createElement("div");
  panel.className = [
    "inventory-transfer-confirm",
    "inventory-transfer-message",
    POPUP_ROOT_CLASS,
    `inventory-transfer-popup--${normalizedMode}`,
    `inventory-transfer-popup--${normalizedTone}`,
    className,
  ].filter(Boolean).join(" ");
  panel.dataset.popupKey = key;

  if (normalizedMode === "manual") {
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.tabIndex = -1;
  } else {
    panel.setAttribute("role", "status");
    panel.setAttribute("aria-live", "polite");
  }

  const titleNode = document.createElement("div");
  titleNode.className = "inventory-transfer-confirm-title";
  titleNode.textContent = title;

  const text = document.createElement("div");
  text.className = "inventory-transfer-confirm-text";
  setPopupContent(text, html || message, allowHTML || Boolean(html));

  panel.append(titleNode, text);
  return panel;
}

// Called by committed actions, never by stat projection or recomputation.
export function showStatGainFeedback(entity, gains = []) {
  if (!entity?.id || typeof document === 'undefined') return null;
  const lines = document.createElement('div');
  lines.className = 'stat-gain-lines';
  for (const { stat, amount, unit } of gains) {
    const key = normalizeStatKey(stat);
    const visual = getDisplayStatKey(key);
    const name = STATS_DATA.find(entry => getDisplayStatKey(entry.key) === visual)?.name || HELPER_PICTOGRAM_NAMES[visual];
    const value = Number(Number(amount).toFixed(4));
    if (!name || !Number.isFinite(value) || value <= 0) continue;
    const suffix = unit ?? (calculateStatSources({}, key.replace(/Plus$/, '')).unit
      || ({ HP: ' HP', speed: ' ms', shift: ' ch. max', dayHpRegen: ' HP/j', lifesteal: ' %' })[visual] || '');
    const row = document.createElement('span');
    row.className = 'stat-gain-line';
    row.dataset.statGain = key;
    row.dataset.amount = String(value);
    row.title = `${name}${key.endsWith('Plus') ? ' +' : ''}`;
    row.setAttribute('aria-label', `${row.title} : +${value}${suffix}`);
    const icon = document.createElement('span');
    icon.className = `picto-stat ${visual}`;
    icon.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span');
    text.className = `${visual} stat-gain-value`;
    if (key.endsWith('Plus')) text.dataset.statState = '+';
    text.textContent = `+${value}${suffix}`;
    row.append(icon, text);
    lines.appendChild(row);
  }
  if (!lines.childElementCount) return null;
  const id = CSS.escape(String(entity.id));
  const anchor = [...document.querySelectorAll(`[id="PopDow_${id}"], [id="codex-entity-sprite-container_${id}"]`)]
    .find(node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden');
  const panel = EffectMessage(entity, lines, 'stat-gain-feedback', { container: anchor || document.body });
  if (!panel) return null;
  if (!anchor) panel.classList.add('stat-gain-feedback--global');
  panel.setAttribute('role', 'status');
  panel.setAttribute('aria-live', 'polite');
  return panel;
}

export function showStatGainsFromDiff(entity, before = {}, after = entity?.stats || {}, extraShiftGain) {
  const gains = [];
  for (const [stat, value] of Object.entries(after)) {
    const capacity = entry => Number(entry?.totalMax ?? entry?.max ?? entry?.current ?? entry) || 0;
    const delta = capacity(value) - capacity(before[stat]);
    if (delta > 0) gains.push({ stat, amount: delta });
    // Current-only charges are a separate contribution, not a second max-stat gain.
    if (stat === 'shift' && extraShiftGain === undefined && delta <= 0 && value?.current > (before[stat]?.current ?? 0)) {
      gains.push({ stat, amount: value.current - (before[stat]?.current ?? 0), unit: ' ch. sup.' });
    }
  }
  if (extraShiftGain > 0) gains.push({ stat: 'shift', amount: extraShiftGain, unit: ' ch. sup.' });
  return showStatGainFeedback(entity, gains);
}

export function showGamePopupMessage(options = {}) {
  if (typeof document === "undefined") {
    return normalizePopupMode(options.mode) === "manual"
      ? Promise.resolve(options.fallbackValue ?? false)
      : null;
  }

  const {
    mode = "auto",
    tone = "normal",
    key = "global",
    dismissExisting = true,
    duration = 2000,
    fadeMs = 1500,
    enterMs = 250,
    actions = null,
    extraContent = null,
    closeOnEscape = true,
    focusSelector = ".primary",
  } = options;
  const normalizedMode = normalizePopupMode(mode);
  const host = getPopupHost();
  if (!host) {
    return normalizedMode === "manual"
      ? Promise.resolve(options.fallbackValue ?? false)
      : null;
  }

  if (dismissExisting) removeExistingPopups(key);

  const panel = buildPopupPanel({ ...options, mode: normalizedMode, tone, key });
  const layer = document.createElement('div');
  layer.className = `game-popup-layer game-popup-layer--${normalizedMode}`;
  layer.style.setProperty('--popup-enter-duration', `${Math.max(0, Number(enterMs) || 0)}ms`);
  layer.style.setProperty('--popup-exit-duration', `${Math.max(0, Number(fadeMs) || 0)}ms`);
  const backdrop = document.createElement('div');
  backdrop.className = 'game-popup-backdrop';
  backdrop.setAttribute('aria-hidden', 'true');
  layer.append(backdrop, panel);

  if (extraContent instanceof Node) {
    panel.appendChild(extraContent);
  }

  if (normalizedMode === "auto") {
    host.appendChild(layer);
    const leaveDelay = Math.max(0, Number(enterMs) || 0) + Math.max(0, Number(duration) || 0);
    const removeDelay = leaveDelay + Math.max(0, Number(fadeMs) || 0);
    window.setTimeout(() => closePopupPanel(panel, { fade: true, fadeMs }), leaveDelay);
    window.setTimeout(() => layer.remove(), removeDelay + 25);
    return panel;
  }

  return new Promise(resolve => {
    const actionList = Array.isArray(actions) && actions.length
      ? actions
      : [
          { label: "Annuler", value: false },
          { label: "Continuer", value: true, primary: true },
        ];

    const actionRoot = document.createElement("div");
    actionRoot.className = "inventory-transfer-confirm-actions";

    let settled = false;
    const close = value => {
      if (settled) return;
      settled = true;
      closePopupPanel(panel, { fade: false });
      resolve(value);
    };
    panel.dismissPopup = () => close(false);

    actionList.forEach(action => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = action.label || "OK";
      if (action.primary) button.classList.add("primary");
      if (action.className) button.classList.add(action.className);
      button.addEventListener("click", () => close(action.value));
      actionRoot.appendChild(button);
    });

    if (closeOnEscape) {
      panel.addEventListener("keydown", event => {
        if (event.key === "Escape") close(false);
      });
    }

    panel.appendChild(actionRoot);
    host.appendChild(layer);

    const focusTarget = panel.querySelector(focusSelector) || panel.querySelector("button") || panel;
    focusTarget.focus?.({ preventScroll: true });
  });
}

if (typeof window !== "undefined") {
  window.showGamePopupMessage = showGamePopupMessage;
  window.addEventListener('entityStatsGained', ({ detail }) => showStatGainFeedback(detail?.entity, detail?.gains));
}
