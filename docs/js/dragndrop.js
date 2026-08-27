import { generateUniqueID, entites, enrichEntityStats } from './entites.js';
import { updateRoleInDOM } from './load-entity.js';
import { calculateHexes } from './board.js';
import { soclesVisible } from './ui.js';
import { spawnEntiteIngame } from './createEntity.js';
import { consumeEntityMovement, ensureMovementState, updateMovementDisplay } from './damagesCalcul.js';
import { EffectMessage } from './attackEffectMecanics.js';
import { applyEntityTint, releaseEntityTint, notifyProjectileTargetMoved } from './entitesAnimation.js';
import { saveEntityMovementState, saveEntityPositionState } from './entityUpdatesStorage.js';
import { battleLogs } from './battleLogs.js';

let selectedEntitiesB = [];
let lastHoveredHexPosition = null;
let lastHoveredHex = null;

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

// Mise à jour de hexRoles pour utiliser les rôles définis après l'analyse
export function hexRoles(hexElement) {
    const roleClasses = ['tank-role', 'fantassin-role', 'mage-role'];
    roleClasses.forEach(roleClass => hexElement.classList.remove(roleClass));

    if (hexElement.classList.contains('tank-role')) {
        return { role: 'tank', span: '<span class="hex-role-detail">TANK</span>' };
    } else if (hexElement.classList.contains('fantassin-role')) {
        return { role: 'fantassin', span: '<span class="hex-role-detail">FANTASSIN</span>' };
    } else if (hexElement.classList.contains('mage-role')) {
        return { role: 'mage', span: '<span class="hex-role-detail">MAGE</span>' };
    } else {
        return { role: 'gueux', span: '' };
    }
}

function DragnDrop(hex) {
	
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

    if (!soclesVisible) {
        document.querySelectorAll('.hex:not(.occupied) .socle').forEach(socle => {
            socle.style.opacity = '1';
        });
    }

    if (document.querySelector('.dragged')) {
        console.warn('🚫 Un autre Drag & Drop est déjà en cours.');
        return;
    }

    draggedBox.classList.add('dragged');

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

    // Attendre un peu avant de restaurer l'opacité
    setTimeout(() => {
        document.querySelectorAll('.sprite').forEach(sprite => {
            sprite.style.opacity = '1';  
            sprite.style.pointerEvents = '';  
        });
    }, 50); // Petit délai pour éviter des conflits

    // Masquer les socles des hexagones non occupés si `soclesVisible` est faux
    if (!soclesVisible) {
        document.querySelectorAll('.hex:not(.occupied) .socle').forEach(socle => {
            socle.style.opacity = '0';
        });
    }

    // 🎯 **Réinitialisation des cibles après le drag**
    document.querySelectorAll('.hex.focused, .sprite-container.focused').forEach(el => el.classList.remove('focused'));
    document.querySelectorAll('.hex.targetable, .hex.supportable, .sprite-container.targetable, .sprite-container.supportable')
        .forEach(el => el.classList.remove('targetable', 'supportable'));

    console.log(`🛑 Dragend sur ${event.target.id}, restauration des opacités et nettoyage des cibles.`);
});

document.addEventListener('dragover', event => {
    event.preventDefault();

    const hex = event.target.closest('.hex');
    if (hex && hex !== lastHoveredHex) {
        if (lastHoveredHex) {
            lastHoveredHex.classList.remove('hovered');
        }

        hex.classList.add('hovered');
        lastHoveredHex = hex; // Mise à jour de la dernière case survolée
    }
});

hex.addEventListener('drop', event => {
    event.preventDefault();

    let draggedElement = null;
    let isNewEntity = false;

    let dataText = event.dataTransfer.getData('text');
    let dataJson = event.dataTransfer.getData('application/json');

    const isAdminMode = window.levelRunning === 'admin';

    // 🎯 Vérification de la case cible
    let dropHex = event.target.closest('.hex') || lastHoveredHex; // Priorité à la case sous la souris

    if (!dropHex) {
        console.warn("❌ Drop annulé : Aucune case détectée.");
        return; // ANNULATION DU DROP
    }

    if (dataJson) {
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
        spawnEntiteIngame(newEntity);

        console.log(`🔥 Entité créée sur ${dropHex.dataset.position} : ${newEntity.name}, ID: ${newEntity.id}`);
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

let targetHexPosition = dropHex.dataset.position;
const previousRole = entite?.role || "gueux";
let hasLoggedSwapMove = false;

const isEffectiveHexMove =
    !isNewEntity &&
    entite &&
    originalHexPosition &&
    targetHexPosition &&
    originalHexPosition !== targetHexPosition;

if (isEffectiveHexMove && !isAdminMode) {
  const shift = ensureMovementState(entite);

  if (
    !shift ||
    shift.current == null ||
    Number(shift.current) < 1
  ) {
    console.warn(`🚫 Déplacement annulé : ${entite.name} n'a pas assez de mouvement.`);
    EffectMessage(entite, "Déplacement impossible !");
    return;
  }
}

const existingElementBeforeDrop = dropHex.querySelector('.entite-box');
let existingElement = existingElementBeforeDrop;
let swappedEntite = null;

const isSwapMove =
  isEffectiveHexMove &&
  existingElementBeforeDrop &&
  existingElementBeforeDrop !== draggedElement;

if (!isSwapMove) {
  draggedElement.dataset.position = targetHexPosition;
  dropHex.appendChild(draggedElement);
}

    let sideClass = entite ? `Side${entite.side}` : '';

    if (existingElement) {
        let existingEntiteId = parseInt(existingElement.id.replace('Box_Entite_', ''));
        let existingEntite = entites.find(e => e.id === existingEntiteId);
        swappedEntite = existingEntite || null;

        if (entite.side !== existingEntite.side) {
            return;
        }

        existingEntite.role = entite.role;

        if (!isNewEntity && draggedElement) {
            let draggedElementOriginalPosition = draggedElement.dataset.position;
            let existingElementOriginalPosition = existingElement.dataset.position;

            draggedElement.dataset.position = existingElementOriginalPosition;
            existingElement.dataset.position = draggedElementOriginalPosition;
        }

        let existingElementParent = existingElement.closest('.hex');

        if (originalParent && existingElementParent) {
            originalParent.appendChild(existingElement);
            dropHex.appendChild(draggedElement);

            if (!originalParent.querySelector('.entite-box')) {
                originalParent.classList.remove('occupied', sideClass);
            }
            if (!dropHex.querySelector('.entite-box')) {
                dropHex.classList.remove('occupied');
            }
            dropHex.classList.add('occupied', sideClass);

            let socle = dropHex.querySelector('.socle');
            let newRole = 'gueux';

            if (socle.classList.contains('tank')) {
                newRole = 'tank';
            } else if (socle.classList.contains('fantassin')) {
                newRole = 'fantassin';
            } else if (socle.classList.contains('mage')) {
                newRole = 'mage';
            }

            entite.role = newRole;
            console.log(`Rôle après drop pour ${entite.name}: ${entite.role}`);

            draggedElement.classList.remove('tank-role', 'fantassin-role', 'mage-role', 'gueux-role');
            draggedElement.classList.add(`role-${entite.role}`);
            if (existingElement) {
                existingElement.classList.remove('tank-role', 'fantassin-role', 'mage-role', 'gueux-role');
                existingElement.classList.add(`role-${existingEntite.role}`);
            }

           updateRoleInDOM(entite);
updateRoleInDOM(existingEntite);

if (isEffectiveHexMove && !isAdminMode) {
  battleLogs("entity_swap_move", {
    entity: entite,
    target: existingEntite,
    to: targetHexPosition,
    previousRole,
    newRole: entite.role,
  });

  hasLoggedSwapMove = true;
}
console.log(
  "Positions après l'échange - Élément glissé:",
  draggedElement.dataset.position,
  "Élément existant:",
  existingElement.dataset.position
);

        } else {
            console.error('Parent container not found for one or both elements.');
        }
    } else {
        if (!isNewEntity && draggedElement && originalParent) {
            dropHex.appendChild(draggedElement);
            draggedElement.dataset.position = targetHexPosition;

            if (!originalParent.querySelector('.entite-box')) {
                originalParent.classList.remove('occupied');
                if (originalParent.classList.contains('Neutral')) {
                    originalParent.classList.remove(sideClass);
                }
            }
            dropHex.classList.add('occupied', sideClass);
        }

        let socle = dropHex.querySelector('.socle');
        let newRole = 'gueux';

        if (socle.classList.contains('tank')) {
            newRole = 'tank';
        } else if (socle.classList.contains('fantassin')) {
            newRole = 'fantassin';
        } else if (socle.classList.contains('mage')) {
            newRole = 'mage';
        }

        if (entite) {
            entite.role = newRole;
            console.log(`Rôle après drop pour ${entite.name}: ${entite.role}`);

            if (!isNewEntity && draggedElement) {
                draggedElement.classList.remove('tank-role', 'fantassin-role', 'mage-role', 'gueux-role');
                draggedElement.classList.add(`role-${entite.role}`);

                updateRoleInDOM(entite);
            }
        }
    }
if (isEffectiveHexMove && !isAdminMode && entite) {
    const movementCheck = consumeEntityMovement(entite, 1);

if (!movementCheck.allowed) {
    console.warn(`🚫 Consommation mouvement impossible après drop validé : ${entite.name}`);
    EffectMessage(entite, "Déplacement impossible !");
    return;
}

if (!hasLoggedSwapMove) {
 battleLogs("entity_move", {
  entity: entite,
  from: originalHexPosition,
  to: targetHexPosition,
  previousRole,
  newRole: entite.role,
  movementCheck,
});
}

if (movementCheck.reason === "marathon") {
  EffectMessage(entite, "Marathon !");

  battleLogs("entity_move_marathon", {
    entity: entite,
  });
} else {
  EffectMessage(entite, "Déplacement !");
  saveEntityMovementState(entite);
}

updateMovementDisplay(entite);
}

if (isEffectiveHexMove && entite) {
    entite.position = targetHexPosition;
    saveEntityPositionState(entite);

    if (isSwapMove && swappedEntite && swappedEntite !== entite) {
        swappedEntite.position = originalHexPosition;
        saveEntityPositionState(swappedEntite);
        updateMovementDisplay(swappedEntite);
    }

    updateMovementDisplay(entite);
    notifyProjectileTargetMoved(entite);
    if (isSwapMove && swappedEntite && swappedEntite !== entite) {
        notifyProjectileTargetMoved(swappedEntite);
    }
}

    if (dropHex.classList.contains('occupied')) {
        const hexOccupiedEvent = new Event('hexOccupied');
        dropHex.dispatchEvent(hexOccupiedEvent);
    }

    if (lastHoveredHex) {
        lastHoveredHex.classList.remove('hovered');
        lastHoveredHex = null;
        lastHoveredHexPosition = null;
    }

    const { availableHexes, availableHexTypes } = calculateHexes();
    Object.keys(availableHexTypes).forEach(role => {
        // console.log(`Hexagons disponibles de type ${role} après le drop (${availableHexTypes[role].length}): ${availableHexTypes[role].join(', ')}`);
    });
});

}

// Initialisation des événements de dragstart pour empêcher le drag des éléments side-B
document.querySelectorAll('.entite-box').forEach(entite => {
    entite.addEventListener('dragstart', event => {
        const isAdminMode = window.levelRunning === 'admin'; // Détection du mode Admin

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
    if (lastHoveredHex) lastHoveredHex.classList.remove('hovered');
    lastHoveredHex = null;
    lastHoveredHexPosition = null;

    document.querySelectorAll('.dragged').forEach(element => {
        element.classList.remove('dragged');
    });

    document.querySelectorAll('.sprite').forEach(sprite => {
        sprite.style.removeProperty('opacity');
        sprite.style.removeProperty('pointer-events');

        if (!sprite.classList.contains('side-B') || window.levelRunning === 'admin') {
            sprite.draggable = true;
        }
    });
}
