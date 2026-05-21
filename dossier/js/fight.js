import { gameStarted, checkGameOver, stopAllIntervals, OrderEntity } from './gameState.js';
import { createOrderButton, createQuitButton } from './game.js';
import { entites } from './entites.js';
import { attackDetails } from './attackList.js'; 
import { AliveattackFunctions, DeadattackFunctions, HexattackFunctions} from './attackEntites.js';
import { waitForCooldown , runPhaseTimer, updateCooldownDisplay, updateCurrentAttackDisplay } from './entityAttributs.js';
import { sbireEnemyTarget, sbireAllyTarget, sbireHexTarget, sbireAttackEnemy, sbireAttackAlly, sbireAttackHex } from './sbireFight.js';
import { lordEnemyTarget, lordAttackEnemy } from './lordFight.js';
import { calculateHexes } from './board.js';

export function initFightEntites() {
    entites.forEach(entite => {
        try {
            entite.status = 'active'; // L'état par défaut est 'active'
        } catch (error) {
            console.error("Erreur lors de l'extension des entités :", error);
        }
    });
}

// ENTITE SIDE
export function entiteSide(entites) {
    entites.forEach(entite => {
        if (entite.type === 'sbire') {
            const allies = entites.filter(e => e.side === entite.side && e.name !== entite.name);
            const ennemis = entites.filter(e => e.side !== entite.side);
            const { availableHexes, availableHexTypes } = calculateHexes(entite.side);

            // console.log(`[Sbire: ${entite.name}] Camp: ${entite.side}`);
            // console.log(`  Allies (${allies.length}): ${allies.map(e => e.name).join(', ')}`);
            // console.log(`  Ennemis (${ennemis.length}): ${ennemis.map(e => e.name).join(', ')}`);
            // console.log(`  Hexagons disponibles pour ${entite.side} (${availableHexes.length}): ${availableHexes.map(hex => hex.getAttribute('data-position')).join(', ')}`);
            
            Object.keys(availableHexTypes).forEach(role => {
                // console.log(`  Hexagons disponibles de type ${role} pour ${entite.side} (${availableHexTypes[role].length}): ${availableHexTypes[role].join(', ')}`);
            });
        }
    });
}

// ENTITE CAMP
export function entiteCamp(entites) {
    if (!gameStarted) {
        console.log("Les entités se préparent aux combats...");
        // Vérification (optionnelle) : s'assurer que chaque entité a bien HP.current et HP.max
        entites.forEach(entite => {
            if (!entite.stats.HP || typeof entite.stats.HP.current !== 'number' || typeof entite.stats.HP.max !== 'number') {
                console.warn(`Entité "${entite.name}" n'a pas le nouveau format d'HP attendu (HP.current / HP.max).`);
            }
        });
        return;
    }

    const entitesA = entites.filter(entite => entite.side === 'A');
    const entitesB = entites.filter(entite => entite.side === 'B');

    if (entitesA.length === 0 || entitesB.length === 0) {
        console.log("Chaque camp doit avoir au moins une entité pour commencer les combats.");
		createQuitButton();
        return;
    }

    console.log("Place au sang et aux larmes ! Que les combats commencent !");
// ORDER BUTTONS	
	createOrderButton('runaway', 'Fuyez pauvres fous !', 'runaway-button');
	createOrderButton('cancelrunaway', 'Annuler la fuite', 'cancelrunaway-button');
    // Analyse des entités par camp avant de commencer les combats
    entiteSide(entites);

    // Déclenche les tours de combat
    entitesA.forEach(entiteA => entiteTurn(entiteA, entitesB));
    entitesB.forEach(entiteB => entiteTurn(entiteB, entitesA));

    // Calcul et affichage des hexagones disponibles pour chaque camp
    const hexesForA = calculateHexes('A');
    const hexesForB = calculateHexes('B');

    Object.keys(hexesForA.availableHexTypes).forEach(role => {
        // console.log(...);
    });

    Object.keys(hexesForB.availableHexTypes).forEach(role => {
        // console.log(...);
    });
}

// ENTITE TURN
export async function entiteTurn(attacker, defendingEntites) {
	attacker.currentPhase = 'Entite Turn';

    if (!attacker || attacker.isDEAD) {
        checkGameOver(entites);
        return;
    } else if (attacker.turnCount === undefined) {
        attacker.turnCount = 1;
    } else {
        attacker.turnCount++;
    }

    entiteSide(entites);
    console.log(`${attacker.name} commence son tour ${attacker.turnCount}.`);

    entites.forEach(entite => {
        if (!entite.isDEAD) {
            entite.speedTimer = entite.stats.speed;
        }
    });

if (attacker && !attacker.isDEAD) {
    if (OrderEntity(attacker)) {
        console.warn(`🛑 Timer de ${attacker.name} annulé juste avant démarrage (ordre active).`);
        return;
    }
    await runPhaseTimer(attacker, 'speedTimer', attacker.speedTimer);
} else {
    stopAllIntervals();
    return;
}
    const allEnemiesDead = defendingEntites.every(entite => entite.isDEAD);

    if (attacker && !attacker.isDEAD && defendingEntites) {
        try {
            const target = await entiteTarget(attacker, defendingEntites);
            if (target === null) {
                console.log(`${attacker.name} ne trouve pas de cible à attaquer ce tour-ci.`);
                // Vérifie les cibles en fonction de attaquer speed
                const checkForTarget = setInterval(async () => {
                    if (!attacker.isDEAD) {
                        console.log(`${attacker.name} cherche une cible valide.`);
                        const newTarget = await entiteTarget(attacker, defendingEntites);
                        if (newTarget !== null) {
                            clearInterval(checkForTarget);
                            await entiteAttack(attacker, newTarget);
                        } else if (defendingEntites.every(entite => entite.isDEAD)) {
                            clearInterval(checkForTarget);
                            console.log(`Toutes les entités adverses sont mortes. Fin du tour.`);
                            return;
                        }
                    } else {
                        clearInterval(checkForTarget);
                        return;
                    }
                    console.log(`Attente de ${attacker.stats.speed} millisecondes avant la prochaine vérification.`);
                }, attacker.stats.speed);
            } else {
                await entiteAttack(attacker, target);
            }

        } catch (error) {
            console.error(`Erreur inattendue lors de la sélection par ${attacker.name} : ${error}`);
        }
    } else {
        if (allEnemiesDead) {
            console.log(`Toutes les entités adverses sont mortes. Fin du tour.`);
        }
        return;
    }
}

export function entiteTarget(attacker, defendingEntites) {
	 if (OrderEntity(attacker)) {
        console.warn(`🛑 Attaque de ${attacker.name} annulée : ordre en cours.`);
        return;
    }
    return new Promise((resolve) => {
        try {
            // Si l'attaquant est invalide ou mort, retourner null
            if (!attacker || attacker.isDEAD) {
                resolve(null);
                return;
            }

            // Recherche si l'attaquant a une attaque ciblant l'ennemi
            const hasEnemyTargetAttack = attacker.attacks.some(attackName => {
                const attackDetail = attackDetails.find(detail => detail.functionName === attackName);
                return attackDetail && attackDetail.attackTarget.includes('enemy');
            });

            // Recherche si l'attaquant a une attaque ciblant allié
            const allyTargetAttackDetails = attacker.attacks
                .map(attackName => attackDetails.find(detail => detail.functionName === attackName))
                .filter(attackDetail => attackDetail && attackDetail.attackTarget.includes('ally'));
            const hasAllyTargetAttack = allyTargetAttackDetails.length > 0;

            // Recherche si l'attaquant a une attaque ciblant les hex
            const hasHexTargetAttack = attacker.attacks.some(attackName => {
                const attackDetail = attackDetails.find(detail => detail.functionName === attackName);
                return attackDetail && attackDetail.attackTarget.includes('hexa');
            });

            // Si l'attaquant n'a pas d'attaque valide, retourner null
            if (!hasEnemyTargetAttack && !hasAllyTargetAttack && !hasHexTargetAttack) {
                resolve(null);
                return;
            }

            // Récupérer le rôle de l'attaquant, par défaut 'gueux'
            const attackerRole = attacker.role || 'gueux';

            // Gérer les attaques ciblant les ennemis
            if (hasEnemyTargetAttack) {
                const deadEnemies = defendingEntites.filter(entity => entity.isDEAD);
                if (attacker.type === 'sbire') {
                    if (deadEnemies.length > 0) {
                        console.log('Cibles ennemies mortes :', deadEnemies);
                    }
                 sbireEnemyTarget(attacker, defendingEntites, deadEnemies, attackerRole, (target) => {
				
				resolve(target);
				});
                } else if (attacker.type === 'lord') {
                    if (deadEnemies.length > 0) {
                        console.log('Cibles ennemies mortes :', deadEnemies);
                    }
                    lordEnemyTarget(defendingEntites, deadEnemies, (target) => {
                        if (target) {
                            target.targetStatut = 'newTarget'; // Ajout du statut newTarget
							  updateTargetStatut(attacker, target); // Mise à jour des classes CSS
                            // console.log(` TARGET-STATUT : ${target.name} est la new-target de ${attacker.name}`); // Log d'info
                        }
                        resolve(target);
                    }, attacker.name, attacker.id);
                }
            }
            // Gérer les attaques ciblant les alliés
            else if (hasAllyTargetAttack) {
                const deadAllies = entites.filter(entity => entity.isDEAD);
                if (attacker.type === 'sbire') {
                    if (deadAllies.length > 0) {
                        console.log('Cibles alliées mortes :', deadAllies);
                    }
                    sbireAllyTarget(attacker, entites, attackerRole, allyTargetAttackDetails, (target) => {
                        if (target) {
                            target.targetStatut = 'newTarget'; // Ajout du statut newTarget
                            console.log(`${target.name} est la new-target de ${attacker.name}`); // Log d'info
                        }
                        resolve(target);
                    });
                } else if (attacker.type === 'lord') {
                    if (deadAllies.length > 0) {
                        console.log('Cibles alliées mortes :', deadAllies);
                    }
                    lordAllyTarget(attacker, entites, (target) => {
  
                        resolve(target);
                    });
                }
            }
            // Attaque ciblant les hex
            else if (hasHexTargetAttack) {
                console.log(`${attacker.name} peut cibler des hex`);
                const { availableHexes } = calculateHexes(attacker.side);
                if (availableHexes.length > 0) {
                    sbireHexTarget(attacker, availableHexes, attackerRole, (target) => {
     
                        resolve(target);
                    });
                } else {
                    resolve(null);
                }
            }
        } catch (error) {
            console.error(`Erreur lors de la sélection de la cible pour ${attacker.name} :`, error);
            resolve(null);
        }
    });
}


// ENTITE ATTACK
export async function entiteAttack(attacker, target) {
	attacker.currentPhase = 'Start attaque';
	if (OrderEntity(attacker)) {
		console.warn(`🛑 Attaque de ${attacker.name} annulée : ordre en cours.`);
		return;
	}
	if (attacker && !attacker.isDEAD) {
		await waitForCooldown(attacker);

		let attackName;

		// Déterminer si la cible est un allié, un ennemi ou un hexagone
		const isAlly = attacker.side === target.side;
		const isEnemy = !isAlly;
		const isHex = target && target.nodeType === 1 && target.classList.contains('hex');

		if (isHex) {
			attackName = sbireAttackHex(attacker);
		} else if (attacker.type === 'sbire') {
			attackName = isAlly ? sbireAttackAlly(attacker) : sbireAttackEnemy(attacker);
		} else if (attacker.type === 'lord') {
			attackName = isAlly ? lordAttackAlly(attacker) : lordAttackEnemy(attacker);
		}

		// 🔥 Ajout ici : enregistrer l'attaque en cours
		const attack = attackDetails.find(a => a.functionName === attackName);
		attacker.currentAttackId = attack?.attackId || null;
		updateCurrentAttackDisplay(attacker);

		// Déterminer la fonction d'attaque en fonction de l'état de la cible
		let attackFunction;
		if (isHex) {
			attackFunction = HexattackFunctions[attackName];
			console.log(`Fonction d'attaque sélectionnée pour hexagone : ${attackName}`);
		} else if (target && !target.isDEAD) {
			attackFunction = AliveattackFunctions[attackName];
			// console.log(`Fonction d'attaque sélectionnée pour cible vivante : ${attackName}`);
		} else {
			attackFunction = DeadattackFunctions[attackName];
			console.log(`Fonction d'attaque sélectionnée pour cible morte : ${attackName}`);
		}

		if (!attackFunction) {
			console.error(`L'attaque spécifiée '${attackName}' pour ${attacker.name} n'est pas définie.`);
			return;
		}

		attacker.lastAttackTime = Date.now();
		updateCooldownDisplay(attacker);

		try {
			await attackFunction(attacker, target);
			entiteLoop(attacker);
		} catch (error) {
			console.error(`Échec de l'attaque de ${attacker.name} sur ${isHex ? 'hexagone' : target.name} : ${error}`);
		} finally {
			updateCooldownDisplay(attacker);
		}
	} else {
		checkGameOver(entites);
	}
}



//ENTITE LOOP
export async function entiteLoop(attacker) {
	if (OrderEntity(attacker)) {
        console.warn(`🛑 Loop annulée pour ${attacker.name} : ordre en cours.`);
        return;
    }
    try {
        // Premièrement, vérifier si l'attaquant est en vie
        if (attacker && !attacker.isDEAD) {
            // Deuxièmement, vérifier s'il reste des adversaires
            if (entites.some(entite => !entite.isDEAD && entite.side !== attacker.side)) {
                // Il y a encore des adversaires, donc la logique de combat continue
                let defendingEntites = entites.filter(entite => entite.side !== attacker.side && !entite.isDEAD);
                if (defendingEntites.length > 0 && !attacker.isDEAD ) {
                    // Appel de la logique de combat pour le prochain tour
                    await entiteTurn(attacker, defendingEntites);
                } else {
                    console.log(`${attacker.name} ne trouve plus de cibles à attaquer.`);
                }
            } else {
                console.log(`${attacker.name} ne peut plus combattre ou il n'y a plus de cibles.`);
                // Gestion de la fin du combat pour cet attaquant
                // Potentiellement, ajouter une logique pour gérer la fin du jeu ou transitionner vers un autre état de jeu
            }
        } else {
            // L'attaquant n'est pas en vie
            console.log(`${attacker.name} est hors de combat et ne peut pas attaquer.`);
			checkGameOver(entites);
            return; // Sortie anticipée si l'attaquant n'est pas en vie
        }
    } catch (error) {
        console.error(`Erreur lors de la boucle de combat pour ${attacker.name}:`, error);
    }
}

export function updateTargetStatut(attacker, targetEntity) {
    // Sélectionne l'élément avec l'id 'role-img_{attacker.id}'
    const lordRoleImg = document.getElementById(`Targetrole-img_${attacker.id}`);

    if (lordRoleImg) {
        // Supprimer les anciennes classes 'new-target', 'active-target', 'last-target'
        lordRoleImg.classList.remove('new-target', 'active-target', 'last-target');
        console.log(`ID de l'attaquant: ${attacker.id}`);

        // Ajouter la nouvelle classe en fonction du statut de la cible
        if (targetEntity.targetStatut === 'newTarget') {
            lordRoleImg.classList.add('new-target');
            console.log(`lordtarget : ajout de la classe 'new-target'`);
        } else if (targetEntity.targetStatut === 'activeTarget') {
            lordRoleImg.classList.add('active-target');
            console.log(`lordtarget : ajout de la classe 'active-target'`);
        } else if (targetEntity.targetStatut === 'lastTarget') {
            lordRoleImg.classList.add('last-target');
            console.log(`lordtarget : ajout de la classe 'last-target'`);
        }

        // Log pour vérifier les classes après l'ajout
        console.log(`Classes actuelles de l'élément : ${[...lordRoleImg.classList].join(', ')}`);
    } else {
        // Avertissement si l'élément avec l'id 'role-img_{attacker.id}' n'est pas trouvé
        console.warn(`L'élément avec l'id 'role-img_${attacker.id}' n'a pas été trouvé dans le DOM.`);
    }
}
