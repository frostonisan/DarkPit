import { entites } from './entites.js';
import { attackDetails } from './attackList.js';
import { getHexes } from './board.js';
import { AttackerSbireTargetPriority, AllySbireTargetPriority, updateIngameListingFocus,listingFocusInvocateur, getRoleFromHex } from './role-rule.js';
import { calculateHexes } from './board.js';


// COMPTAGE DES ROLES
export let GlobalRoleEntite = {
    sideA: [],
    sideB: []
};

// Flag pour éviter les appels multiples lors du chargement initial
let isInitialLoad = true;

export function logPositionsAndAnalyze() {
    const { hexesSideA, hexesNeutral, hexesSideB } = getHexes();

    const getPositions = (hexes) => hexes.map(hex => hex.getAttribute('data-position'));

    const positionsSideA = getPositions(hexesSideA);
    const positionsNeutral = getPositions(hexesNeutral);
    const positionsSideB = getPositions(hexesSideB);

    const occupiedHexes = {
        SideA: [],
        Neutral: [],
        SideB: []
    };

    const positionMap = new Map();
    const duplicateEntities = [];

    // Première passe pour enregistrer les positions des entités
    entites.forEach(entite => {
        if (entite.position) {
            if (!positionMap.has(entite.position)) {
                positionMap.set(entite.position, []);
            }
            positionMap.get(entite.position).push(entite);
        }
    });

    // Deuxième passe pour traiter les entités avec des positions dupliquées et enregistrer les entités non dupliquées
    entites.forEach(entite => {
        const positions = positionMap.get(entite.position);
        if (positions && positions.length > 1) {
            // Cette position est dupliquée
            duplicateEntities.push(entite);
        } else if (positions) {
            // Cette position n'est pas dupliquée, marquer comme occupée
            if (positionsSideA.includes(entite.position)) {
                occupiedHexes.SideA.push(entite.position);
            } else if (positionsNeutral.includes(entite.position)) {
                occupiedHexes.Neutral.push(entite.position);
            } else if (positionsSideB.includes(entite.position)) {
                occupiedHexes.SideB.push(entite.position);
            }
        }
    });

    // Traiter les entités avec des positions dupliquées en dernier
    duplicateEntities.forEach(entite => {
        const side = positionsSideA.includes(entite.position) ? 'A' : 
                     positionsNeutral.includes(entite.position) ? 'Neutral' : 
                     positionsSideB.includes(entite.position) ? 'B' : null;
        if (side) {
            let availablePositions = side === 'A' ? positionsSideA : 
                                     side === 'Neutral' ? positionsNeutral : 
                                     positionsSideB;
            availablePositions = availablePositions.filter(pos => 
                !occupiedHexes[`Side${side}`].includes(pos)
            );
            const newPosition = availablePositions.shift();
            if (newPosition) {
                entite.position = newPosition;
                occupiedHexes[`Side${side}`].push(newPosition);
                // console.log(`Mise à jour de la position de l'entité ${entite.name} à ${newPosition} pour éviter la duplication.`);
            } else {
                // console.error(`Pas de position disponible pour l'entité ${entite.name} sur le côté ${side}`);
            }
        }
    });
}

// UPDATE ROLE EN FONCTION DE LA POSITION
export function updateRoleInDOM(entite) {
    // Vérifie si le type de l'entité est 'sbire'
    if (entite.type !== 'sbire') {
        return; // Si ce n'est pas un 'sbire', on arrête l'exécution de la fonction
    }

    const roleImg = document.getElementById(`role-img_${entite.id}`);
    const roleTitle = document.querySelector(`#entiteDetailsContainer_${entite.id} .entity-role-title`);
    const roleName = document.querySelector(`#entiteDetailsContainer_${entite.id} .entite-role-name`);
    const rolePicto = document.querySelector(`#entiteDetailsContainer_${entite.id} .entity-role-picto`);
    const entiteBox = document.getElementById(`Box_Entite_${entite.id}`);
    const rolePortrait = document.querySelector(`#rolePortrait_${entite.id}.hud-portrait-role`);
    
    if (roleImg) {
        roleImg.alt = `${entite.name} est un ${entite.role}`;
        roleImg.className = `role-img role-${entite.role}`;
    }
    
    if (roleTitle) {
        roleTitle.textContent = entite.role;
    }

    if (roleName) {
        roleName.textContent = entite.role;
    }
    
    if (rolePicto) {
        rolePicto.className = `entity-role-picto role-${entite.role}`;
    }

    if (rolePortrait) {
        rolePortrait.className = `hud-portrait-role role-${entite.role}`;
    }

    if (entiteBox) {
        entiteBox.className = `entite-box side-${entite.side} role-${entite.role}`;
    }
}


// POSITION DANS LE DOM
function getMiddleThirdHexes(hexes) {
    const positions = hexes.map(hex => {
        const pos = hex.getAttribute('data-position');
        const y = parseInt(pos.split('_')[1], 10);
        return { hex, y };
    });

    if (positions.length === 0) {
        console.log('PLUS DE PLACES DISPONIBLES SUR LE BOARD !');
        return [];
    }

    positions.sort((a, b) => a.y - b.y);

    const totalLines = positions[positions.length - 1].y;
    const third = Math.ceil(totalLines / 3);
    const start = third;
    const end = 2 * third;

    return positions.filter(pos => pos.y >= start && pos.y <= end).map(pos => pos.hex);
}


function getHexesSortedByProximityToCenter(hexes) {
    const validHexes = hexes.filter(hex => hex instanceof Element);
    const centerX = Math.floor(Math.max(...validHexes.map(hex => parseInt(hex.getAttribute('data-position').split('_')[0]))) / 2);
    const centerY = Math.floor(Math.max(...validHexes.map(hex => parseInt(hex.getAttribute('data-position').split('_')[1]))) / 2);

    return validHexes.map(hex => {
        const pos = hex.getAttribute('data-position').split('_').map(Number);
        const distanceToCenter = Math.sqrt(Math.pow(pos[0] - centerX, 2) + Math.pow(pos[1] - centerY, 2));
        return { hex, distanceToCenter };
    }).sort((a, b) => a.distanceToCenter - b.distanceToCenter).map(item => item.hex);
}

export function positionnerEntites(newEntite = null) {
    const { availableHexes: availableHexesA, availableHexTypes: availableHexTypesA } = calculateHexes('A');
    const { availableHexes: availableHexesB, availableHexTypes: availableHexTypesB } = calculateHexes('B');
    const { availableHexes: neutralHexes, availableHexTypes: neutralHexTypes } = calculateHexes('Neutral');

    const middleThirdHexesA = getMiddleThirdHexes(availableHexesA);
    const middleThirdHexesB = getMiddleThirdHexes(availableHexesB);

    const occupiedHexes = [];

    const rolePriority = ['mage', 'fantassin', 'tank', 'neutre'];

    const getAvailableHexForRole = (hexTypes, role, middleThirdHexes) => {
        for (let i = 0; i < rolePriority.length; i++) {
            if (rolePriority[i] === role && hexTypes[role] && hexTypes[role].length > 0) {
                const preferredHex = getHexesSortedByProximityToCenter(hexTypes[role]).find(hex => middleThirdHexes.includes(hex));
                if (preferredHex) {
                    hexTypes[role] = hexTypes[role].filter(hex => hex !== preferredHex);
                    return preferredHex;
                }
                return hexTypes[role].shift();
            }
        }
        for (let i = 0; i < rolePriority.length; i++) {
            if (hexTypes[rolePriority[i]] && hexTypes[rolePriority[i]].length > 0) {
                const preferredHex = getHexesSortedByProximityToCenter(hexTypes[rolePriority[i]]).find(hex => middleThirdHexes.includes(hex));
                if (preferredHex) {
                    hexTypes[rolePriority[i]] = hexTypes[rolePriority[i]].filter(hex => hex !== preferredHex);
                    return preferredHex;
                }
                return hexTypes[rolePriority[i]].shift();
            }
        }
        return null;
    };

    const assignPositionToEntity = (entite, entiteElement, hexTypes, middleThirdHexes, side, neutralHexes, occupiedHexes) => {
        let dataPosition = entite.position;

        if (!dataPosition) {
            for (const role of entite.role) {
                dataPosition = getAvailableHexForRole(hexTypes, role, middleThirdHexes);

                if (dataPosition && !occupiedHexes.includes(dataPosition)) {
                    break;
                } else {
                    dataPosition = null;
                }
            }
        }

        if (!dataPosition && neutralHexes.length > 0) {
            const neutralHex = neutralHexes.shift();
            if (neutralHex) {
                dataPosition = neutralHex.getAttribute('data-position');
                entite.role = 'gueux';
            }
        }

        if (dataPosition && !occupiedHexes.includes(dataPosition)) {
            entite.position = dataPosition;
            let targetHex = document.querySelector(`.hex[data-position='${dataPosition}']`);

            if (targetHex) {
                const isSideCorrect = (side === 'A' && targetHex.classList.contains('SideA')) ||
                                      (side === 'B' && targetHex.classList.contains('SideB')) ||
                                      targetHex.classList.contains('Neutral');

                if (!isSideCorrect) {
                    console.warn(`Tentative de positionnement de ${entite.name} sur un hex du côté opposé ${dataPosition}. Repositionnement sur le camp ${side}.`);
                    dataPosition = getAvailableHexForRole(hexTypes, entite.role[0], middleThirdHexes);
                    targetHex = document.querySelector(`.hex[data-position='${dataPosition}']`);

                    if (!targetHex) {
                        console.error(`Pas de position disponible pour ${entite.name} sur son propre camp.`);
                        return;
                    }
                }

             // Vérifier si l'entité est déjà dans le DOM avant de la déplacer
if (!targetHex.contains(entiteElement)) {
    targetHex.appendChild(entiteElement);  // ✅ déplacement sans recréation
}
occupiedHexes.push(dataPosition);
targetHex.classList.add('occupied');

                if (entite.role !== 'gueux') {
                    entite.role = getRoleFromHex(targetHex);
                }

                const entiteIndex = entites.findIndex(e => e.id === entite.id);
                if (entiteIndex !== -1) {
                    entites[entiteIndex].role = entite.role;
                }

                updateRoleInDOM(entite);
                entiteElement.setAttribute('data-position', dataPosition);
            } else {
                console.error(`Hexagone cible non trouvé pour ${entite.name} à la position ${dataPosition}`);
            }
        } else {
            console.error(`Aucune position disponible pour ${entite.name} ou position déjà occupée`);
        }
    };

    if (newEntite) {
        // Si une seule entité doit être positionnée
        const entiteElement = document.getElementById(`Box_Entite_${newEntite.id}`);
        if (entiteElement) {
            if (newEntite.side === 'A') {
                assignPositionToEntity(newEntite, entiteElement, availableHexTypesA, middleThirdHexesA, 'A', neutralHexes, occupiedHexes);
            } else if (newEntite.side === 'B') {
                assignPositionToEntity(newEntite, entiteElement, availableHexTypesB, middleThirdHexesB, 'B', neutralHexes, occupiedHexes);
            }
        } else {
            console.error(`Impossible de trouver l'élément pour l'entité ${newEntite.id}`);
        }
    } else {
        // Si aucune entité spécifique n'est fournie, repositionner toutes les entités
        document.querySelectorAll('[id^="Box_Entite_"]').forEach(function(entiteElement) {
            const entiteId = parseInt(entiteElement.id.replace('Box_Entite_', ''));
            const entite = entites.find(e => e.id === entiteId);

            if (entite) {
                if (entite.side === 'A') {
                    assignPositionToEntity(entite, entiteElement, availableHexTypesA, middleThirdHexesA, 'A', neutralHexes, occupiedHexes);
                } else if (entite.side === 'B') {
                    assignPositionToEntity(entite, entiteElement, availableHexTypesB, middleThirdHexesB, 'B', neutralHexes, occupiedHexes);
                }
            }
        });
    }
}


// POSITIONNEMENT ET CALCUL
export function handlePositionsAndLogs() {
    // Analyser les hexagones occupés et assigner des positions pour les entités sans position définie
    logPositionsAndAnalyze();

    // Mettre à jour les positions des entités dans le DOM après assignation des positions
    document.querySelectorAll('[id^="Box_Entite_"]').forEach(function(entiteElement) {
        const entite = entites.find(e => e.id === parseInt(entiteElement.id.replace('Box_Entite_', '')));
        if (entite && !entiteElement.dataset.position && entite.position) {
            entiteElement.dataset.position = entite.position; // Assigner la position calculée à l'entité
        }
    });
    // Positionner les entités dont les positions ont été mises à jour
    positionnerEntites();
}


// ECOUTEUR DEVENEMENT POUR MODIFICATION DE ROLES
	// ACTUALISTATION DU STOCKAGE DANS LA VARIABLE POUR LES SBIRES
export function updateGlobalRoleSbire() {
GlobalRoleEntite = {
    sideA: entites
        .filter(entite => 
            entite.side === 'A' && 
            (entite.stats.HP?.current > 0 || entite.life > 0) && 
            entite.type !== 'lord'
        )
        .map(entite => ({
            name: entite.name || 'sbire',
            role: entite.role || 'aucun',
            id: entite.id || 'inconnue',
            classe: entite.classe || 'aucune',
            type: entite.type || 'sbire'
        })),

    sideB: entites
        .filter(entite => 
            entite.side === 'B' && 
            (entite.stats.HP?.current > 0 || entite.life > 0) && 
            entite.type !== 'lord'
        )
        .map(entite => ({
            name: entite.name || 'sbire',
            role: entite.role || 'aucun',
            id: entite.id || 'inconnue',
            classe: entite.classe || 'aucune',
            type: entite.type || 'sbire'
        }))
};

    // console.log('Rôles des entités pour chaque côté:', GlobalRoleEntite);
}
export function determineClasse(entite) {
    const attackDetailsMap = attackDetails.reduce((map, attack) => {
        map[attack.functionName] = attack;
        return map;
    }, {});

    const classes = new Set();
    let canTargetDead = false;

    entite.attacks.forEach(attackName => {
        const attack = attackDetailsMap[attackName];
        if (attack) {
            if (attack.deadTarget && attack.deadTarget.includes('yes')) {
                canTargetDead = true;
                classes.add('Necro');
            }
            if (attack.attackTarget.includes('enemy')) {
                classes.add('Attaquant');
            }
            if (attack.attackTarget.includes('ally')) {
                classes.add('Support');
            }
            if (attack.attackTarget.includes('hexa')) {
                classes.add('Invocateur');
            }
        }
    });

    entite.classe = Array.from(classes).join(' '); // Joindre les classes avec un espace
    entite.canTargetDead = canTargetDead; // Marquer l'entité si elle peut cibler les morts
}


// Mettre à jour les classes pour toutes les entités
export function updateEntiteClasses() {
    entites.forEach(entite => determineClasse(entite));
}


// TARGET ZONE SBIRE ATTAQUANT
export function TraitementRolesSbires() {
    // Initialisation des compteurs pour chaque type de rôle
    const roleCounts = {
        sideA: {},
        sideB: {}
    };

    // Fonction pour compter les rôles dans une liste d'entités
    const countRoles = (entities, side) => {
        entities.forEach(entity => {
            if (!entity.isDEAD) { // Exclure les entités mortes
                const role = entity.role;
                if (!roleCounts[side][role]) {
                    roleCounts[side][role] = 0;
                }
                roleCounts[side][role]++;
            }
        });
    };

    // Compter les rôles pour chaque côté
    countRoles(GlobalRoleEntite.sideA, 'sideA');
    countRoles(GlobalRoleEntite.sideB, 'sideB');

    // Calcul des availableHexes pour chaque côté
    const { availableHexes: availableHexesASide } = calculateHexes('A');
    const { availableHexes: availableHexesBSide } = calculateHexes('B');
    const { availableHexes: neutralHexes } = calculateHexes('Neutral');

    // Combiner les hexagones neutres avec les hexagones de chaque côté
    const availableHexesA = [...availableHexesASide, ...neutralHexes];
    const availableHexesB = [...availableHexesBSide, ...neutralHexes];

    // Fonction pour déterminer la zone de cible pour chaque sbire
    const determineTargetZone = (entity, side, opponentSide) => {
        // Vérifier si le type de l'entité est 'sbire'
        if (entity.type !== 'sbire') {
            console.log(`L'entité ${entity.name} ${entity.type} n'est pas de type 'sbire'. Fonction non appliquée. Détails de l'entité:`, entity);
            return null;
        }

        const classes = entity.classe; // Récupère la classe de l'entité
        let priorities = [];

        // Définir les priorités en fonction de la classe
        if (classes.includes('Attaquant')) {
            priorities = AttackerSbireTargetPriority[entity.role];
        } else if (classes.includes('Support')) {
            priorities = AllySbireTargetPriority[entity.role];
        } else if (classes.includes('Invocateur')) {
            // Les Invocateurs peuvent avoir un traitement spécial
        } else {
            console.error(`Classe d'entité non prise en charge: ${classes}`);
            return null;
        }

        // Déterminer la cible en fonction des priorités et des rôles
        for (let i = 0; i < priorities.length; i++) {
            const targetRole = priorities[i];

            if (classes.includes('Attaquant')) {
                // Vérifier les ennemis pour les attaquants
                if (roleCounts[opponentSide][targetRole] && roleCounts[opponentSide][targetRole] > 0) {
                    return targetRole; // Retourner le rôle cible trouvé
                }
            } else if (classes.includes('Support')) {
                // Vérifier les alliés pour les supports
                if (roleCounts[side][targetRole] && roleCounts[side][targetRole] > 0) {
                    // Vérifier que l'entité ne se cible pas elle-même
                    if (!(targetRole === entity.role && roleCounts[side][targetRole] === 1)) {
                        return targetRole; // Retourner le rôle cible trouvé
                    }
                }
            }
        }
        console.log(`Aucune target-zone valide trouvée pour ${entity.name}`);

        // **Modification ici : définir 'lord' comme targetZone pour les attaquants sans cible**
        if (classes.includes('Attaquant')) {
            return 'lord'; // Les attaquants ciblent le 'lord' par défaut
        }

        return null; // Si aucune cible valide n'est trouvée pour les autres classes
    };

    // Mettre à jour les attributs data-targetzone et la classe target-zone pour chaque entité
    const updateTargetZoneForEntities = (entities, side, opponentSide) => {
        const validRoles = ['tank', 'mage', 'fantassin', 'gueux', 'lord']; // Ajouter 'lord' aux rôles valides

        // Sélection des availableHexes en fonction du côté, inclure les hexagones neutres
        let availableHexes;
        if (side === 'sideA') {
            availableHexes = availableHexesA;
        } else if (side === 'sideB') {
            availableHexes = availableHexesB;
        }

        entities.forEach(entity => {
            if (!entity.isDEAD) {
                const oldTargetZone = entity.targetZone;
                const newTargetZone = determineTargetZone(entity, side, opponentSide);
                entity.targetZone = newTargetZone;
const targetZoneName = entity.targetZone || 'aucune';
console.log(`Target zone pour ${entity.name} [${entity.classe}] : ${targetZoneName}`);

const entityScan = document.getElementById(`ScanEntity_${entity.id}`);
if (entityScan) {
    let entitePrioPhraseDiv = entityScan.querySelector('.entite-prio-phrase');
    if (!entitePrioPhraseDiv) {
        entitePrioPhraseDiv = document.createElement('div');
        entitePrioPhraseDiv.className = 'entite-prio-phrase';
        entityScan.appendChild(entitePrioPhraseDiv);
    }

    const targetZoneDiv = entitePrioPhraseDiv.querySelector('.target-zone-role-display');
    if (entity.classe !== 'Invocateur' && targetZoneDiv) {
        let target_adjectif = 'cible';
        if (entity.classe.includes('Attaquant')) {
            target_adjectif = 'ennemi';
        } else if (entity.classe.includes('Support')) {
            target_adjectif = 'allié';
        }

        targetZoneDiv.innerHTML = '';

        const picto = document.createElement('div');
        picto.className = `entity-role-picto role-${targetZoneName}`;

        const texte = document.createElement('span');
        texte.className = `target-zone-name ${targetZoneName}`;
        texte.textContent = targetZoneName;

        const textetarget = document.createElement('span');
        textetarget.className = 'target-zone-type';
        textetarget.textContent = `${target_adjectif}s`;

        targetZoneDiv.innerHTML = `Cibles : `;
        targetZoneDiv.appendChild(picto);
        targetZoneDiv.appendChild(texte);
        targetZoneDiv.appendChild(textetarget);

        const entitePrioPhraseStrong = document.getElementsByClassName('entite-prio-phrase-help')[0] || null;
        if (entitePrioPhraseStrong) {
            entitePrioPhraseDiv.appendChild(entitePrioPhraseStrong);

            if (entity.classe !== 'Invocateur') {
                entitePrioPhraseStrong.innerHTML = `<div class="help-text-role">
                <span class="txt">Ce</span>
                <div class="entite-role-name">${entity.type}</div>
                <div class="entite-role-name ${entity.classe}">${entity.classe}</div>
                <div class="entite-role-name ${entity.role}"> ${entity.role}</div>
                <span class="txt">cible actuellement les </span>
                <div class="entite-role-name ${targetZoneName}">${targetZoneName}s</div> ${target_adjectif}s.
                </div>
                <div class="help-text-role"><br>Cliquer pour afficher les régles de priorités de ciblage de cette Entité.</div></div>`;
            }

            const roleDisplay = targetZoneDiv;
            const helpText = entitePrioPhraseStrong;

            roleDisplay.addEventListener('mouseenter', () => {
                helpText.style.transition = 'opacity 2s';
                helpText.style.opacity = '1';
            });

            roleDisplay.addEventListener('mouseleave', () => {
                helpText.style.transition = 'opacity 2s';
                helpText.style.opacity = '0';
            });
        }
    }
}

                // Mise à jour de l'attribut data-targetzone
                const element = document.getElementById(`sbire_${entity.id}`);
                if (element) {
                    element.setAttribute('data-targetzone', entity.targetZone || 'none'); // Défaut à 'none' si aucune targetZone n'est trouvée
                }

                // Mise à jour de la classe target-zone dans listingElement
                const listingElement = document.getElementById(`listing_${entity.id}`);
                if (listingElement) {
                    // Enlever toutes les anciennes classes target-zone
                    const allTargetZones = listingElement.querySelectorAll('.entity-role-listing.target-zone');
                    allTargetZones.forEach(targetZoneElement => {
                        targetZoneElement.classList.remove('target-zone');
                    });

                    // Ajouter la nouvelle classe target-zone
                    const roleElements = listingElement.querySelectorAll('.entity-role-listing');
                    roleElements.forEach(roleElement => {
                        const classList = roleElement.className.split(' ');
                        classList.forEach(cls => {
                            if (cls.startsWith('role-')) {
                                const role = cls.substring(5); // Lire le contenu après "role-"
                                if (role === entity.targetZone) {
                                    roleElement.classList.add('target-zone'); // Ajouter la classe target-zone si les rôles correspondent
                                }
                            }
                        });
                    });

                    // **Modification ici pour les attaquants ciblant 'lord' ou sans targetZone**
                    if (entity.classe.includes('Attaquant') && (!entity.targetZone || entity.targetZone === 'lord')) {
                        // Modifier les classes du listingElement
                        listingElement.classList.remove('focus-sbire');
                        listingElement.classList.add('focus-lord');

                        // Créer le div spécifié s'il n'existe pas
                        let roleDetailDiv = listingElement.querySelector('.entite-role-detail-listing .role-lord');
                        if (!roleDetailDiv) {
                            const entiteRoleDetailListing = document.createElement('div');
                            entiteRoleDetailListing.className = 'entite-role-detail-listing';

                            const entityRoleListing = document.createElement('div');
                            entityRoleListing.className = 'entity-role-listing role-lord';

                            const roleNameSpan = document.createElement('span');
                            roleNameSpan.className = 'role-name';
                            roleNameSpan.textContent = 'lord';

                            entiteRoleDetailListing.appendChild(entityRoleListing);
                            entiteRoleDetailListing.appendChild(roleNameSpan);

                            listingElement.appendChild(entiteRoleDetailListing);
                        }
                    } else {
                        // Si la targetZone n'est plus 'lord', remettre les classes par défaut
                        listingElement.classList.remove('focus-lord');
                        listingElement.classList.add('focus-sbire');

                        // Supprimer le div spécifique s'il existe
                        let roleDetailDiv = listingElement.querySelector('.entite-role-detail-listing .role-lord');
                        if (roleDetailDiv) {
                            roleDetailDiv.parentElement.remove(); // Supprimer le parent qui est '.entite-role-detail-listing'
                        }
                    }
                } else {
                    // console.log(`listing_${entity.id} non trouvé dans le DOM`);
                }

                // Mise à jour de la classe de l'image de rôle pour la bataille
                const roleImgElement = document.getElementById(`Targetrole-img_${entity.id}`);
                if (roleImgElement) {
                    // Si l'entité est un Invocateur, s'assurer que la classe reste sur "Invocateur"
                    if (entity.classe.includes('Invocateur')) {
                        roleImgElement.className = roleImgElement.className.replace(/role-(?!img\b)\w+/g, '').trim(); // Retirer les autres classes 'role-'
                        roleImgElement.classList.add('role-Invocateur');
                    } else {
                        // Retirer toutes les classes qui commencent par 'role-' sauf 'role-img'
                        roleImgElement.className = roleImgElement.className.replace(/role-(?!img\b)\w+/g, '').trim();

                        // Ajouter la nouvelle classe basée sur targetZone si valide
                        if (entity.targetZone && validRoles.includes(entity.targetZone)) {
                            roleImgElement.classList.add(`role-${entity.targetZone}`);
                        } else {
                            console.warn(`Target zone invalide ou non définie pour l'entité ${entity.id}: ${entity.targetZone}`);
                            roleImgElement.classList.add('role-none'); // Classe par défaut
                        }
                    }
                } else {
                    // console.log(`Targetrole-img_${entity.id} non trouvé dans le DOM`);
                }

                // Appel de listingFocusInvocateur pour les Invocateurs
                if (entity.classe.includes('Invocateur')) {
                    // Utiliser les availableHexes du côté actuel qui incluent les hexagones neutres
                    listingFocusInvocateur(entity.id, side, availableHexes);
                }
            }
        });
    };

    // Mettre à jour les entités pour chaque côté
    updateTargetZoneForEntities(GlobalRoleEntite.sideA, 'sideA', 'sideB');
    updateTargetZoneForEntities(GlobalRoleEntite.sideB, 'sideB', 'sideA');

    return roleCounts;
}





export function observeRoleChanges() {
    const observer = new MutationObserver(mutations => {
        let roleChanged = false;

        mutations.forEach(mutation => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                const target = mutation.target;
                const newRoleClass = Array.from(target.classList).find(cls => cls.startsWith('role-'));
                if (newRoleClass) {
                    const roleName = newRoleClass.split('-')[1];
                    const entityId = target.id.split('_')[2];

                    // Utiliser les priorités correctes en fonction du rôle et de la classe
                    const entite = entites.find(entite => entite.id == entityId);
                    if (entite) {
                        if (entite.classe.includes('Support')) {
                            updateIngameListingFocus(entityId, roleName, AllySbireTargetPriority);
                        } else if (entite.classe.includes('Attaquant')) {
                            updateIngameListingFocus(entityId, roleName, AttackerSbireTargetPriority);
                        } else {
                            updateIngameListingFocus(entityId, roleName, AllySbireTargetPriority);
                        }
                        entite.role = roleName;
                        roleChanged = true;
                    }

                    // Mettre à jour la classe de l'élément ScanEntity
                    const entityScan = document.getElementById(`ScanEntity_${entityId}`);
                    if (entityScan) {
                        entityScan.classList.add('entite-details', roleName);

                    }
                }
            }
        });

        // Mettre à jour GlobalRoleEntite une seule fois après toutes les mutations
        if (roleChanged) {
            updateGlobalRoleSbire();
            TraitementRolesSbires();
        }
    });

    const boxes = document.querySelectorAll('.entite-box');
    boxes.forEach(box => observer.observe(box, { attributes: true }));
}
