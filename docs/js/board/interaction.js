import { consumeEntityMovement, ensureMovementState } from "./deployment.js";
import { bindTouchEntityDrag, cancelTouchEntityDrag } from './touchDrag.js';
import {
  updateRoleInDOM, updateMovementDisplay,
} from "../rendering/hud.js";
import { getFootprintOccupant, planEntityPlacements, commitEntityPlacements, calculateHexes } from "./controller.js";
import { isEntityMovementBlocked } from "../combat/control.js";
import { setTimeout, isCombatPaused, isCombatInteractionBlocked, notifyCombatAction } from "../combat/clock.js";
import { generateUniqueID, entites, enrichEntityStats } from "../entities/runtime.js";
import { soclesVisible } from "../ui/display.js";
import { spawnEntiteIngame } from "../entities/spawn.js";
import { EffectMessage } from "../combat/effects.js";
import { applyEntityTint, releaseEntityTint, notifyProjectileTargetMoved } from "../rendering/animations.js";
import {
  saveEntityMovementState, saveEntityPositionState, recordEntityCombatMovement,
  recordEntityCombatAmount, recordEntityCombatProc,
} from "../storage/entityStorage.js";
import { battleLogs } from "../combat/journal.js";
import { gameStarted } from "../app/state.js";
import { isAdminMode as isGameAdminMode } from "../storage/gameStorage.js";

let selectedEntitiesB = [];
let lastHoveredHexPosition = null;
let lastHoveredHex = null;
let entityDragActive = false;
const hiddenTacticalDrag = () => entityDragActive && isCombatPaused() && !isCombatInteractionBlocked() && !soclesVisible;

function updateDragHexHover(hex) {
    if (hex === lastHoveredHex) return;
    if (lastHoveredHex) {
        lastHoveredHex.classList.remove('hovered');
        if (hiddenTacticalDrag() && !lastHoveredHex.classList.contains('occupied')) {
            const socle = lastHoveredHex.querySelector('.socle');
            if (socle) socle.style.opacity = '0';
        }
    }
    lastHoveredHex = hex;
    lastHoveredHexPosition = hex?.dataset.position || null;
    if (!hex) return;
    hex.classList.add('hovered');
    if (hiddenTacticalDrag()) {
        const socle = hex.querySelector('.socle');
        if (socle) socle.style.opacity = '1';
    }
}

function finishDragHexFeedback() {
    updateDragHexHover(null);
    entityDragActive = false;
    if (soclesVisible) return;
    // A moved entity must reveal its new base and hide the now-empty origin.
    document.querySelectorAll('#hexGrid .hex .socle').forEach(socle => {
        socle.style.opacity = socle.closest('.hex').classList.contains('occupied') ? '1' : '0';
    });
}

document.addEventListener('dragover', event => {
    if (isCombatInteractionBlocked()) return;
    event.preventDefault();
    updateDragHexHover(event.target.closest?.('.hex') || null);
});

function analyserPositionsEtRoles() {
    const tankPositions = [];
    const fantassinPositions = [];
    const magePositions = [];

    entites.forEach(entite => {
        const entiteElement = document.getElementById(`Box_Entite_${entite.id}`);
        if (entiteElement) {
            const position = entite.position;

            if (entite.role === 'tank') {
                tankPositions.push(position);
            } else if (entite.role === 'fantassin') {
                fantassinPositions.push(position);
            } else if (entite.role === 'mage') {
                magePositions.push(position);
            }
        }
    });

    return { tankPositions, fantassinPositions, magePositions };
}

// Fonction pour définir les rôles des hexagones
function definirRolesHexagones(positions) {
    document.querySelectorAll('.hex').forEach(hexElement => {
        const position = hexElement.dataset.position;

        if (positions.tankPositions.includes(position)) {
            hexElement.querySelector('.socle').classList.add('tank');
        } else if (positions.fantassinPositions.includes(position)) {
            hexElement.querySelector('.socle').classList.add('fantassin');
        } else if (positions.magePositions.includes(position)) {
            hexElement.querySelector('.socle').classList.add('mage');
        }
    });
}

// Fonction pour initialiser les rôles et positions des entités
function initialiserEntites() {
    const positions = analyserPositionsEtRoles();
    definirRolesHexagones(positions);
}

// Appeler cette fonction après le chargement de la page
window.addEventListener('load', initialiserEntites);

const boundDragHexes = new WeakSet();
function DragnDrop(hex) {
    if (boundDragHexes.has(hex)) return;
    boundDragHexes.add(hex);
	
hex.addEventListener('dragstart', event => {
    const draggedBox = event.target.closest('.sprite');

    if (!draggedBox) return;

    // Le payload est posé par le gestionnaire du plateau lui-même : le drag
    // reste donc fonctionnel même si l'entité a été recréée pendant un event.
    const entityBox = draggedBox.closest('[id^="Box_Entite_"]');
    if (!entityBox) return;
    event.dataTransfer?.setData('text', entityBox.id);

    const entiteId = parseInt(entityBox.id.replace('Box_Entite_', ''), 10);
    const entiteData = entites.find(e => e.id === entiteId);

  const shift = ensureMovementState(entiteData);
const movementImpossible =
    !shift ||
    shift.current == null ||
    Number(shift.current) < 1;

    const canvas = draggedBox.querySelector('canvas');

    if (movementImpossible && canvas) {
        applyEntityTint(canvas, 'movementImpossible', 0.75);

        setTimeout(() => {
            releaseEntityTint(canvas, 'movementImpossible');
        }, 0);
    }

    if (!soclesVisible && !isCombatPaused()) {
        document.querySelectorAll('.hex:not(.occupied) .socle').forEach(socle => {
            socle.style.opacity = '1';
        });
    }

    if (document.querySelector('.dragged')) {
        console.warn('🚫 Un autre Drag & Drop est déjà en cours.');
        return;
    }

    draggedBox.classList.add('dragged');
    entityDragActive = true;

    document.querySelectorAll('.sprite').forEach(sprite => {
        if (!sprite.classList.contains('dragged')) {
            sprite.style.opacity = '0.4';
            sprite.style.pointerEvents = 'none';
        }
    });

    document.querySelectorAll('.hex.focused, .sprite-container.focused').forEach(el => {
        el.classList.remove('focused');
    });

    document
        .querySelectorAll('.hex.targetable, .hex.supportable, .sprite-container.targetable, .sprite-container.supportable')
        .forEach(el => {
            el.classList.remove('targetable', 'supportable');
        });

    console.log(`🚀 Dragstart sur ${draggedBox.id}, nettoyage des anciennes cibles.`);
});
hex.addEventListener('dragend', event => {
    event.target.classList.remove('dragged');

    // Drag feedback belongs to the interface, including during tactical pause.
    globalThis.setTimeout(() => {
        document.querySelectorAll('.sprite').forEach(sprite => {
            sprite.style.opacity = '1';  
            sprite.style.pointerEvents = '';  
        });
    }, 50); // Petit délai pour éviter des conflits

    finishDragHexFeedback();

    // 🎯 **Réinitialisation des cibles après le drag**
    document.querySelectorAll('.hex.focused, .sprite-container.focused').forEach(el => el.classList.remove('focused'));
    document.querySelectorAll('.hex.targetable, .hex.supportable, .sprite-container.targetable, .sprite-container.supportable')
        .forEach(el => el.classList.remove('targetable', 'supportable'));

    console.log(`🛑 Dragend sur ${event.target.id}, restauration des opacités et nettoyage des cibles.`);
});

hex.addEventListener('drop', event => {
    event.preventDefault();
    if (isCombatInteractionBlocked()) return;

    let draggedElement = null;
    let isNewEntity = false;

    let dataText = event.dataTransfer.getData('text');
    let dataJson = event.dataTransfer.getData('application/json');

    const isAdminMode = isGameAdminMode() && window.levelRunning === 'admin';

    // 🎯 Vérification de la case cible
    let dropHex = event.target.closest('.hex') || lastHoveredHex; // Priorité à la case sous la souris

    if (!dropHex) {
        console.warn("❌ Drop annulé : Aucune case détectée.");
        return; // ANNULATION DU DROP
    }

    if (dataJson) {
        if (!isAdminMode) return;
        isNewEntity = true;
        let entity = JSON.parse(dataJson);
        let newEntity = { 
            ...entity, 
           id: generateUniqueID(),
            side: 'B', 
            level: entity.level || 1, 
            position: dropHex.dataset.position
        };

        newEntity = enrichEntityStats(newEntity);
        selectedEntitiesB.push(newEntity);
        spawnEntiteIngame(newEntity).catch(error => { selectedEntitiesB = selectedEntitiesB.filter(e => e !== newEntity); console.warn(error.message); });

        return;
    } else if (dataText) {
        draggedElement = document.getElementById(dataText);
        if (!draggedElement) {
            console.error('❌ Élément glissé non trouvé');
            return;
        }
    }

    if (!isNewEntity && !draggedElement) {
        console.error('❌ Aucun élément glissé trouvé et ce n’est pas un spawn admin.');
        return;
    }

    let originalParent = null;
    if (!isNewEntity && draggedElement) {
        originalParent = draggedElement.closest('.hex');
    }
const originalHexPosition = originalParent?.dataset?.position || null;

if (!isNewEntity && draggedElement) {
    if (draggedElement.classList.contains('side-B') && !isAdminMode) {
        console.error(`🚫 Drop interdit pour ${draggedElement.id} (côté B bloqué, mode normal)`);
        return;
    }

    if (dropHex.classList.contains('SideB') && !isAdminMode) {
        console.error(`🚫 Drop interdit sur hex SideB pour ${draggedElement.id} (Mode Normal)`);
        return;
    }

    console.log(`✅ Drop autorisé pour ${draggedElement.id} (Mode Admin: ${isAdminMode})`);
}

let entite = null;

if (!isNewEntity && draggedElement) {
    let entiteId = parseInt(draggedElement.id.replace('Box_Entite_', ''));
    entite = entites.find(e => e.id === entiteId);

    if (!entite) {
        console.error(`❌ Aucune entité trouvée avec l'ID: ${entiteId}`);
        return;
    }
}

const previousRole = entite.role;
const existingElement = getFootprintOccupant(dropHex, draggedElement);
const swappedEntite = existingElement && entites.find(e => String(e.id) === existingElement.id.replace('Box_Entite_', ''));
if (existingElement && (!swappedEntite || swappedEntite.side !== entite.side)) return;
if (swappedEntite) dropHex = existingElement.closest('.hex');
const targetHexPosition = dropHex.dataset.position;
const isEffectiveHexMove = originalHexPosition !== targetHexPosition;
const requests = [{ entity: entite, hex: dropHex }];
if (swappedEntite) requests.push({ entity: swappedEntite, hex: originalParent });
const plan = planEntityPlacements(requests, { allowGroundConsumables: !isAdminMode, allowedCell: (_entity, cell) => isAdminMode || !cell.classList.contains('SideB') });
if (!plan.valid) { EffectMessage(entite, 'Placement impossible !'); finishDragHexFeedback(); return; }
let movementCheck = null;
if (isEffectiveHexMove && !isAdminMode) {
    if (isEntityMovementBlocked(entite)) { EffectMessage(entite, 'Immobilisé !'); return; }
    const shift = ensureMovementState(entite);
    if (!shift || shift.current == null || Number(shift.current) < 1) {
        if (gameStarted) recordEntityCombatAmount(entite, 'blockedMovements', 1);
        EffectMessage(entite, 'Déplacement impossible !'); return;
    }
    movementCheck = consumeEntityMovement(entite, 1);
    if (movementCheck.allowed) updateMovementDisplay(entite);
    if (!movementCheck.allowed) { EffectMessage(entite, 'Déplacement impossible !'); return; }
    if (gameStarted && movementCheck.weightResistance?.canceled) recordEntityCombatProc(entite, movementCheck.weightResistance.kind);
}
if (!commitEntityPlacements(plan, { animate: Boolean(swappedEntite), persist: true })) return;
if (isEffectiveHexMove) {
    if (!isAdminMode) {
        if (gameStarted) recordEntityCombatMovement(entite, { marathon: movementCheck?.reason === 'marathon', negative: movementCheck?.consumed && movementCheck.movement.current < 0 });
        battleLogs(swappedEntite ? 'entity_swap_move' : 'entity_move', { entity: entite, target: swappedEntite, from: originalHexPosition, to: targetHexPosition, previousRole, newRole: entite.role, movementCheck });
        EffectMessage(entite, movementCheck?.reason === 'marathon' ? 'Marathon !' : 'Déplacement !');
        saveEntityMovementState(entite);
    }
    updateMovementDisplay(entite);
    notifyProjectileTargetMoved(entite, null, 'player');
    if (swappedEntite) {
        if (!isAdminMode && gameStarted) recordEntityCombatMovement(swappedEntite, { forced: true });
        updateMovementDisplay(swappedEntite);notifyProjectileTargetMoved(swappedEntite, null, 'player');
    }
}

    finishDragHexFeedback();

    notifyCombatAction();
    const { availableHexes, availableHexTypes } = calculateHexes();
    Object.keys(availableHexTypes).forEach(role => {
        // console.log(`Hexagons disponibles de type ${role} après le drop (${availableHexTypes[role].length}): ${availableHexTypes[role].join(', ')}`);
    });
});

}

// Initialisation des événements de dragstart pour empêcher le drag des éléments side-B
document.querySelectorAll('.entite-box').forEach(entite => {
    entite.addEventListener('dragstart', event => {
        const isAdminMode = isGameAdminMode() && window.levelRunning === 'admin';

        if (entite.classList.contains('side-B') && !isAdminMode) {
            event.preventDefault();
            console.log(`🔒 Drag interdit pour ${entite.id} (côté B bloqué, mode normal)`);
            return;
        }

        console.log(`✅ Drag autorisé pour ${entite.id} (Mode Admin: ${isAdminMode})`);
    });
});

document.querySelectorAll('.hex').forEach(hex => {
    DragnDrop(hex);
});

document.querySelectorAll('[id^="Box_Entite_"]').forEach(entite => {
    entite.addEventListener('dragstart', event => {
        event.dataTransfer.setData('text', event.currentTarget.id);
        console.log('Début du glissement:', event.currentTarget.id);
    });
});

const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE && node.classList.contains('hex')) {
                DragnDrop(node);
            }
        });
    });
});

observer.observe(document.body, { childList: true, subtree: true });

const droppableElements = document.querySelectorAll('.hex');

// Ajoutez les écouteurs d'événements dragenter et dragleave à chaque div "droppable"
droppableElements.forEach(element => {
    element.addEventListener('dragenter', handleDragEnter);
    element.addEventListener('dragleave', handleDragLeave);
});

export function restoreEntityDragAndDrop() {
    cancelTouchEntityDrag();
    document.querySelectorAll('.hex').forEach(DragnDrop);
    entityDragActive = false;
    if (lastHoveredHex) lastHoveredHex.classList.remove('hovered');
    lastHoveredHex = null;
    lastHoveredHexPosition = null;

    document.querySelectorAll('.dragged').forEach(element => {
        element.classList.remove('dragged');
    });

    document.querySelectorAll('.sprite').forEach(sprite => {
        sprite.style.removeProperty('opacity');
        sprite.style.removeProperty('pointer-events');

        if (!sprite.classList.contains('side-B') || (isGameAdminMode() && window.levelRunning === 'admin')) {
            sprite.draggable = true;
        }
    });
}

bindTouchEntityDrag();
