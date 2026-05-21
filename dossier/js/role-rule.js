// ROLE DEPUIS LA HEX DE ROLE
export function getRoleFromHex(hexElement) {
    if (hexElement.classList.contains('fantassin-role')) {
        return ['fantassin'];
    } else if (hexElement.classList.contains('mage-role')) {
        return ['mage'];
    } else if (hexElement.classList.contains('tank-role')) {
        return ['tank'];
    } else {
        return ['gueux'];
    }
}

// REGLE DES PRIORITES DES SBIRES ATTAQUANTS
export const AttackerSbireTargetPriority = {
    'gueux': ['gueux', 'tank', 'fantassin', 'mage'],
    'tank': ['gueux', 'tank', 'fantassin', 'mage'],
    'fantassin': ['gueux', 'tank', 'mage', 'fantassin'],
    'mage': ['gueux', 'fantassin', 'tank', 'mage']
};

// REGLE DES PRIORITES DES SBIRES SUPPORTS
export const AllySbireTargetPriority = {
    'gueux': ['gueux', 'tank', 'fantassin', 'mage'],
    'tank': ['tank', 'fantassin', 'mage', 'gueux'],
    'fantassin': ['tank', 'mage', 'fantassin', 'gueux'],
    'mage': ['fantassin','tank', 'mage', 'gueux']
};

export function IngameListingFocus(role, priorities) {
    const priorityList = priorities[role] || [];
    let content = '';

    priorityList.forEach((role, index) => {
        content += `<div class="entite-role-detail-listing">
                        <div class="entity-role-listing role-${role}"></div>
                        <span class="role-name">${role}</span>
                        <div class="hexastone"></div>
                    </div>`;
        
        // Ajout de la transition sauf après le dernier élément
        if (index < priorityList.length - 1) {
            content += `<div class="hexastone-transition"></div>`;
        }
    });

    return content;
}

// UPDATE REGLE DU FOCUS DANS LA FICHE PERSO
export function updateIngameListingFocus(entityId, newRole, priorities) {
    const entityContainer = document.getElementById(`ScanEntity_${entityId}`);
    if (!entityContainer) {
        // console.error(`Entity container with ID ${entityId} not found.`);
        return;
    }

    const focusListingContainer = entityContainer.querySelector('.focus-listing');
    if (!focusListingContainer) {
        console.error("Focus listing container not found.");
        return;
    }

    const listingFocusContent = IngameListingFocus(newRole, priorities);
    focusListingContainer.innerHTML = listingFocusContent;
}

// LISTING FOCUS INVOCATEUR
export function listingFocusInvocateur(attackerId, attackerSide, availableHexes) {
    // Vérifie si availableHexes est un tableau
    if (!Array.isArray(availableHexes)) {
        console.warn(`availableHexes n'est pas un tableau. La fonction d'affichage dynamique est ignorée.`);
        return;
    }

    // Sélectionne le conteneur parent avec l'id 'listing_ID' et la classe 'Invocateur'
    const parentDiv = document.querySelector(`#listing_${attackerId}.Invocateur`);

    if (!parentDiv) {
        console.warn(`Le conteneur avec l'id 'listing_${attackerId}' et la classe 'Invocateur' n'a pas été trouvé dans le DOM.`);
        return;
    }

    // Vide le contenu du parentDiv pour éviter les doublons
    parentDiv.innerHTML = '';

    // Objet pour accumuler les positions des hex par type
    const hexListing = {};

    // Itère sur les hex disponibles qui ne sont pas occupés
    availableHexes.forEach(hex => {
        const isOccupied = hex.classList.contains('occupied');

        if (!isOccupied) {
            // Détermine le type de hex (neutral, tank, fantassin, mage)
            let hexType = hex.getAttribute('data-role');
            if (!hexType || hexType.trim() === '') {
                hexType = 'neutre'; // Utilise 'neutre' si le data-role est vide ou non défini
            }

            // Ajoute la position du hex au tableau correspondant
            if (!hexListing[hexType]) {
                hexListing[hexType] = [];
            }
            hexListing[hexType].push(hex.getAttribute('data-position'));
        }
    });

    // Affiche les clés de hexListing pour le débogage
    // console.log('Clés de hexListing :', Object.keys(hexListing));

    // Définit l'ordre désiré des types (ajusté pour correspondre aux noms réels)
    const desiredOrder = ['neutre', 'tank', 'fantassin', 'mage'];

    // Itère sur les types dans l'ordre désiré
    desiredOrder.forEach(type => {
        const positions = hexListing[type];
        if (positions && positions.length > 0) {
            // Crée le conteneur pour ce type de hex avec la classe correspondante
            const typeContainer = document.createElement('div');
            typeContainer.className = `invocateur-hex-listing invocateur-hex-${type}`;

            // Crée la div extérieure pour le premier hex de ce type
            const outerDiv = document.createElement('div');
            outerDiv.id = `invocateur_${attackerId}_hex-${positions[0]}`;
            outerDiv.className = `invocateur-hex-item`;

            // Crée la div intérieure
            const innerDiv = document.createElement('div');
            innerDiv.className = `invocateur-hex-pic focus-${positions[0]} ${type}`;
            innerDiv.setAttribute('data-focus-hex-id', positions[0]);

            // Ajoute la div intérieure à la div extérieure
            outerDiv.appendChild(innerDiv);

            // Ajoute la div extérieure au conteneur de type
            typeContainer.appendChild(outerDiv);

            // Affiche le compteur pour ce type de hex
            const counterDiv = document.createElement('div');
            counterDiv.className = `invocateur-hex-counter ${type}`;
            counterDiv.textContent = `Cases ${type} : ${positions.length}`;

            // Ajoute le compteur sous le hex
            typeContainer.appendChild(counterDiv);

            // Ajoute le conteneur de type au conteneur parent
            parentDiv.appendChild(typeContainer);
        }
    });

    // Vérifie si des hex summonables n'ont pas été ajoutés
    if (parentDiv.children.length === 0) {
        console.warn(`Aucun hex disponible à afficher pour l'Invocateur ${attackerId}.`);
    }
}


//LORD LISTING FOUCS
export function listingFocusLord(attackerId, allEntitiesAggro) {
    // Sélectionne le conteneur parent avec l'id 'lord listing_ID'
    const parentDiv = document.querySelector(`#listing_${attackerId}.flisting-lord`);

    if (!parentDiv) {
        console.warn(`Le conteneur avec l'id 'lord listing_${attackerId}' n'a pas été trouvé dans le DOM.`);
        return;
    }

    // Vide le contenu du parentDiv pour éviter les doublons
    parentDiv.innerHTML = '';

    // Itère sur les 4 premiers éléments du classement d'aggro
    for (let i = 0; i < 4; i++) {
        const entity = allEntitiesAggro[i];

        // Si l'entité n'existe pas, passe à l'itération suivante
        if (!entity) {
            continue;
        }

        // Crée la div extérieure avec id 'lord_ID_target-N'
        const outerDiv = document.createElement('div');
        outerDiv.id = `lord_${attackerId}_target-${i + 1}`;
        outerDiv.className = `lord-targets-listing`;

        // Crée la div intérieure avec les classes et attributs spécifiés
        const innerDiv = document.createElement('div');
        innerDiv.className = `lord-target-pic focus-${i + 1}`;
        innerDiv.setAttribute('data-focus-target-id', entity.id);

        // Définit les styles de la div intérieure
        if (entity.portrait) {
            innerDiv.style.backgroundImage = `url('${entity.portrait}')`;
            innerDiv.style.backgroundSize = 'cover';
            innerDiv.style.backgroundPosition = 'center center';
        }

        // Ajoute la div intérieure à la div extérieure
        outerDiv.appendChild(innerDiv);

        // Pour la cible 1, ajoute la div supplémentaire
        if (i === 0) {
            const additionalDiv = document.createElement('div');
            additionalDiv.id = `lord_${attackerId}-focuslisting-activetarget`;
            additionalDiv.className = 'lord-focuslisting-target';

            // Ajoute la div supplémentaire à la div extérieure
            outerDiv.appendChild(additionalDiv);
        }

        // Ajoute la div extérieure au conteneur parent
        parentDiv.appendChild(outerDiv);
    }
}


function getEntityPortraitFromDiv(div, entities) {
    const entityId = div.getAttribute('data-focus-target-id');
    const entity = entities.find(e => e.id == entityId);
    return entity ? entity.portrait : null;
}

// CREATION DES CASES ROLES SUR LE BOARD
export function hexRoles(row, col, rows, cols, hexIdCounter, hexElement) {
    const middleRow = Math.floor(rows / 2);
    const sideAWidth = Math.floor(cols / 3);
    const sideBStartCol = Math.floor(cols * 2 / 3);

    const tankPositions = [
        [middleRow - 2, sideAWidth - 1],
        [middleRow - 1, sideAWidth - 1],
        [middleRow, sideAWidth - 1],
        [middleRow + 1, sideAWidth - 1],
        [middleRow + 2, sideAWidth - 1],
        [middleRow - 2, sideBStartCol],
        [middleRow - 1, sideBStartCol],
        [middleRow, sideBStartCol],
        [middleRow + 1, sideBStartCol],
        [middleRow + 2, sideBStartCol]
    ];

    const fantassinPositions = [
        [middleRow - 2, sideAWidth - 2],
        [middleRow - 1, sideAWidth - 2],
        [middleRow, sideAWidth - 2],
        [middleRow + 1, sideAWidth - 2],
        [middleRow + 2, sideAWidth - 2],
        [middleRow - 2, sideBStartCol + 1],
        [middleRow - 1, sideBStartCol + 1],
        [middleRow, sideBStartCol + 1],
        [middleRow + 1, sideBStartCol + 1],
        [middleRow + 2, sideBStartCol + 1]
    ];

    const magePositions = [
        [middleRow - 1, sideAWidth - 3],
        [middleRow, sideAWidth - 3],
        [middleRow + 1, sideAWidth - 3],
        [middleRow - 1, sideBStartCol + 2],
        [middleRow, sideBStartCol + 2],
        [middleRow + 1, sideBStartCol + 2]
    ];

    const isInPosition = (positions) => {
        return positions.some(([r, c]) => r === row && c === col);
    };

    if (isInPosition(tankPositions)) {
        hexElement.classList.add('tank-role');
        return { role: 'tank', span: '<span class="hex-role-detail">TANK</span>' };
    } else if (isInPosition(fantassinPositions)) {
        hexElement.classList.add('fantassin-role');
        return { role: 'fantassin', span: '<span class="hex-role-detail">FANTASSIN</span>' };
    } else if (isInPosition(magePositions)) {
        hexElement.classList.add('mage-role');
        return { role: 'mage', span: '<span class="hex-role-detail">MAGE</span>' };
    }

    return { role: 'neutre', span: '' };
}
