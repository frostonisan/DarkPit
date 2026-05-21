import { generateUniqueID, entites, enrichEntityStats } from './entites.js';
import { updateRoleInDOM } from './load-entity.js';
import { calculateHexes } from './board.js';
import { soclesVisible } from './ui.js';
import { spawnEntiteIngame } from './ArmyBFactory.js';

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
	
	if (!soclesVisible) {
    document.querySelectorAll('.hex:not(.occupied) .socle').forEach(socle => {
        socle.style.opacity = '1';
    });
}

	
    document.querySelectorAll('.sprite').forEach(sprite => {
    if (!sprite.classList.contains('dragged')) {
        sprite.style.opacity = '0.4';
        sprite.style.pointerEvents = 'none';
    }
});

    // Vérifier s'il y a déjà une entité en train d'être déplacée
    if (document.querySelector('.dragged')) {
        console.warn('🚫 Un autre Drag & Drop est déjà en cours.');
        return;
    }

    // Ne modifier que les autres sprites qui ne sont pas déjà affectés
    document.querySelectorAll('.sprite').forEach(sprite => {
        if (!sprite.classList.contains('dragged') && sprite.style.opacity !== '0.4') {
            sprite.style.opacity = '0.4';  
            sprite.style.pointerEvents = 'none';
        }
    });

    // Afficher les socles des hexagones non occupés si `soclesVisible` est faux
    if (!soclesVisible) {
        document.querySelectorAll('.hex:not(.occupied) .socle').forEach(socle => {
            socle.style.opacity = '1';
        });
    }

    // 🎯 **CLEAR TARGET ZONE BOARD - RESET FOCUS & TARGETS**
    document.querySelectorAll('.hex.focused, .sprite-container.focused').forEach(el => el.classList.remove('focused'));
    document.querySelectorAll('.hex.targetable, .hex.supportable, .sprite-container.targetable, .sprite-container.supportable')
        .forEach(el => el.classList.remove('targetable', 'supportable'));

    console.log(`🚀 Dragstart sur ${event.target.id}, nettoyage des anciennes cibles.`);
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

        let targetHexPosition = dropHex.dataset.position;
        draggedElement.dataset.position = targetHexPosition;
        dropHex.appendChild(draggedElement);
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
    let existingElement = dropHex.querySelector('.entite-box');

    let sideClass = entite ? `Side${entite.side}` : '';

    if (existingElement) {
        let existingEntiteId = parseInt(existingElement.id.replace('Box_Entite_', ''));
        let existingEntite = entites.find(e => e.id === existingEntiteId);

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

            console.log('Positions après l\'échange - Élément glissé:', draggedElement.dataset.position, 'Élément existant:', existingElement.dataset.position);
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