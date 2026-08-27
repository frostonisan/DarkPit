import { checkGameOver } from './gameState.js';
import { attackDetails } from './attackList.js'; 
import { sbireFocusEnemy, sbireFocusAlly, sbireFocusDeadAlly, sbireFocusDeadEnemy } from './sbireFocus.js'; 
import { listingFocusInvocateur } from './role-rule.js'; 

// SBIRE ENEMY TARGET : trouve la cible
export function sbireEnemyTarget(attacker, defendingEntites, deadEnemies, attackerRole, resolve) {
    // console.log(`Attaquant : ${attacker.name}, Rôle de l'attaquant : ${attackerRole}`);
    
    // Vérifie si l'attaque peut cibler les ennemis morts
    const shouldTargetDead = attacker.attacks.some(attackName => {
        const attackDetail = attackDetails.find(detail => detail.functionName === attackName);
        return attackDetail && attackDetail.deadTarget && attackDetail.deadTarget.includes('yes');
    });
    
    // console.log(`Peut cibler les ennemis morts : ${shouldTargetDead}`);

    // Si l'attaque peut cibler les ennemis morts et qu'il y a des ennemis morts, sélectionner un ennemi mort
    if (shouldTargetDead) {
        console.log(`L'attaquant peut cibler uniquement les ennemis morts.`);
        if (deadEnemies.length > 0) {
            // console.log(`Cibles mortes valides : ${deadEnemies.map(target => target.name).join(', ')}`);
			const target = sbireFocusDeadEnemy(attacker, deadEnemies, attackerRole);
            // console.log(`Cible sélectionnée parmi les ennemis morts : ${target.name}`);
			
            resolve(target);
        } else {
            // console.log(`Aucun ennemi mort disponible pour ciblage.`);
            resolve(null);
        }
        return; // Termine l'exécution après la sélection d'un ennemi mort comme cible
    }

    // Vérifie s'il y a un sbire vivant parmi les entités défendantes
    const anyLivingSbire = defendingEntites.some(entity => entity.type === 'sbire' && !entity.isDEAD);
    const defenserRole = defendingEntites.find(entity => entity.role && !entity.isDEAD)?.role || 'gueux';

    // Si aucun sbire vivant n'est trouvé, tente de trouver un "lord"
    if (!anyLivingSbire) {
        // console.log(`Aucun sbire vivant trouvé parmi les ennemis.`);
        const lordTarget = defendingEntites.find(entity => entity.type === 'lord' && !entity.isDEAD);
        if (lordTarget) {
            console.log(`Lord vivant trouvé : ${lordTarget.name}`);
            if (!lordTarget.alerted) {
                console.log(`${lordTarget.name} a perdu tous ses sbires et n'a plus de protection !`);
                lordTarget.alerted = true; // Marque le lord comme alerté pour ne pas répéter le message
            }
            resolve(lordTarget);
            return; // Termine l'exécution après la sélection d'un "lord" comme cible
        }
    } else {
        // console.log(`Des sbires vivants trouvés parmi les ennemis.`);
        // Filtre pour trouver les sbires défendant qui sont vivants
        const validTargets = defendingEntites.filter(entity => entity.type === 'sbire' && !entity.isDEAD);
        // console.log(`Cibles vivantes valides : ${validTargets.map(target => target.name).join(', ')}`);
        // Si au moins une cible valide de sbire existe, sélectionne en une au hasard
        if (validTargets.length > 0) {
            const target = sbireFocusEnemy(attacker, validTargets, attackerRole, defenserRole);
            // console.log(`Cible sélectionnée parmi les sbires vivants : ${target.name}`);
            resolve(target);
            return; // Termine l'exécution après la sélection d'un sbire comme cible
        }
    }

    // S'il n'y a pas de cibles valides, résout avec null
    console.log(`Aucune cible valide trouvée.`);
    resolve(null);
}


// SBIRE ALLY TARGET : trouve la cilble
export function sbireAllyTarget(attacker, entities, attackerRole, allyTargetAttackDetails, resolve) {
    const allies = entities.filter(e => e.side === attacker.side && e.name !== attacker.name && e.type === 'sbire');
    const livingAllies = allies.filter(e => !e.isDEAD);
    const deadAllies = allies.filter(e => e.isDEAD);
    const enemies = entities.filter(e => e.side !== attacker.side && !e.isDEAD);

    // console.log(`Alliés vivants pour ${attacker.name} :`, livingAllies);
    // console.log(`Alliés morts pour ${attacker.name} :`, deadAllies);
    // console.log(`Ennemis vivants pour ${attacker.name} :`, enemies);

    const shouldTargetDead = allyTargetAttackDetails.some(detail => detail.deadTarget && detail.deadTarget.includes('yes'));

    if (shouldTargetDead) {
        // console.log(`${attacker.name} peut cibler des alliés morts.`);
        if (deadAllies.length > 0 && enemies.length > 0) {
            const target = sbireFocusDeadAlly(attacker, deadAllies, attackerRole);
            // console.log(`Ciblage d'un allié mort par ${attacker.name} :`, target);
            resolve(target);
        } else {
            console.log(`Aucun allié mort trouvé pour ${attacker.name} bien que l'attaque nécessite de cibler un allié mort. Vérification des conditions de fin de jeu.`);
            checkGameOver(entities);
            resolve(null);
        }
    } else {
        // console.log(`${attacker.name} ne peut cibler que des alliés vivants.`);
        if (livingAllies.length === 0 || enemies.length === 0) {
            console.log(`Aucun ciblage possible pour ${attacker.name}. Vérification des conditions de fin de jeu.`);
            checkGameOver(entities);
            resolve(null);
        } else {
            const target = sbireFocusAlly(attacker, livingAllies, attackerRole);
            // console.log(`Ciblage d'un allié vivant par ${attacker.name} :`, target);
            resolve(target);
        }
    }
}
// SBIRE HEX TARGET : trouve la cible
export function sbireHexTarget(attacker, availableHexes, attackerRole, resolve) {
    if (availableHexes.length === 0) {
        console.log(`Aucune case possible pour ${attacker.name}. Vérification des conditions de fin de jeu.`);
        checkGameOver(entities);
        resolve(null);
        return;
    }

    // Met à jour l'affichage des hex disponibles pour l'Invocateur
    listingFocusInvocateur(attacker.id, availableHexes, attacker.side);

    // Choisir un hex aléatoire parmi les hex disponibles
    const randomIndex = Math.floor(Math.random() * availableHexes.length);
    const targetHex = availableHexes[randomIndex];

    console.log(`${attacker.name} cible le hex ${targetHex.getAttribute('data-position')}`);
    resolve(targetHex); // Résoudre la promesse avec le hex cible
}

// SBIRE ATTACK ENEMY : trouve l'attaque
export function sbireAttackEnemy(attacker) {
    if (!attacker.attacks || attacker.attacks.length === 0) {
        console.error("Aucune attaque disponible pour cet attaquant.");
        return null;
    }

    // Filtrer les attaques pour ne sélectionner que celles ciblant 'enemy'
    const enemyTargetAttacks = attacker.attacks.filter(attackName => {
		// console.log("attaque ennemy");
        const attackDetail = attackDetails.find(detail => detail.functionName === attackName);
        return attackDetail && attackDetail.attackTarget.includes('enemy');
    });

    if (enemyTargetAttacks.length === 0) {
        console.error("Aucune attaque ciblant les ennemis disponible pour cet attaquant.");
        return null;
    }

    // Implémentation d'une logique de sélection d'attaque parmi celles filtrées
    // Exemple simple: sélection aléatoire parmi les attaques filtrées
    const randomIndex = Math.floor(Math.random() * enemyTargetAttacks.length);
    return enemyTargetAttacks[randomIndex];
}

// SBIRE ATTACK ALLY : trouve l'attaque
export function sbireAttackAlly(attacker) {
    if (!attacker.attacks || attacker.attacks.length === 0) {
        console.error("Aucune attaque disponible pour cet attaquant.");
        return null;
    }
// console.log("attaque ally");
    // Filtrer les attaques pour ne sélectionner que celles ciblant 'ally'
    const allyTargetAttacks = attacker.attacks.filter(attackName => {
        const attackDetail = attackDetails.find(detail => detail.functionName === attackName);
        return attackDetail && attackDetail.attackTarget.includes('ally');
    });

    if (allyTargetAttacks.length === 0) {
        console.error("Aucune attaque ciblant les alliés disponible pour cet attaquant.");
        return null;
    }

    // Implémentation d'une logique de sélection d'attaque parmi celles filtrées
    // Exemple simple: sélection aléatoire parmi les attaques filtrées
    const randomIndex = Math.floor(Math.random() * allyTargetAttacks.length);
    return allyTargetAttacks[randomIndex];
}

//  SBIRE ATTACK HEX : trouve l'attaque
export function sbireAttackHex(attacker) {
    if (!attacker.attacks || attacker.attacks.length === 0) {
        console.error("Aucune attaque disponible pour cet attaquant.");
        return null;
    }

    // Filtrer les attaques pour ne sélectionner que celles ciblant 'hexa'
    const hexTargetAttacks = attacker.attacks.filter(attackName => {
        const attackDetail = attackDetails.find(detail => detail.functionName === attackName);
        return attackDetail && attackDetail.attackTarget.includes('hexa');
    });

    if (hexTargetAttacks.length === 0) {
        console.error("Aucune attaque ciblant les hexagones disponible pour cet attaquant.");
        return null;
    }

    // Implémentation d'une logique de sélection d'attaque parmi celles filtrées
    // Exemple simple: sélection aléatoire parmi les attaques filtrées
    const randomIndex = Math.floor(Math.random() * hexTargetAttacks.length);
    return hexTargetAttacks[randomIndex];
}