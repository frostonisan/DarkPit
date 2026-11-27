import { checkGameOver } from "../app/state.js";
import { attackDetails } from "../data/attackList.js";
import { resolveAttackDefinitionForEntity } from './attackResolution.js';
import { sbireFocusEnemy, sbireFocusAlly, sbireFocusDeadAlly, sbireFocusDeadEnemy } from "./minionTargeting.js";
import {
  clearForcedInvisibleTargetAccuracy,
  isOccultismInvisibleTarget,
  markForcedInvisibleTargetAccuracy,
} from "./statistics.js";
import { isLord, isNonLordCombatant } from "../entities/rules.js";

function resolveSbireAttack(attacker, attackName) {
    return resolveAttackDefinitionForEntity(attacker, attackName, attackDetails);
}

// SBIRE ENEMY TARGET : trouve la cible
export function sbireEnemyTarget(attacker, defendingEntites, deadEnemies, attackerRole, resolve, selectedAttack = null) {
    clearForcedInvisibleTargetAccuracy(attacker);
    // console.log(`Attaquant : ${attacker.name}, Rôle de l'attaquant : ${attackerRole}`);
    
    // Vérifie si l'attaque peut cibler les ennemis morts
    const attackRefs = selectedAttack ? [selectedAttack] : attacker.attacks;
    const shouldTargetDead = attackRefs.some(attackName => {
        const attackDetail = resolveSbireAttack(attacker, attackName);
        return attackDetail?.attackTarget?.includes('enemy') && attackDetail.deadTarget?.includes('yes');
    });
    
    // console.log(`Peut cibler les ennemis morts : ${shouldTargetDead}`);

    // Si l'attaque peut cibler les ennemis morts et qu'il y a des ennemis morts, sélectionner un ennemi mort
    if (shouldTargetDead && deadEnemies.length > 0) {
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

    const canTargetLiving = attackRefs.some(ref => {
        const attack = resolveSbireAttack(attacker, ref);
        return attack?.attackTarget?.includes('enemy') && !attack.deadTarget?.includes('yes');
    });
    if (!canTargetLiving) { resolve(null); return; }

    // Vérifie s'il y a un sbire vivant parmi les entités défendantes
    const anyLivingSbire = defendingEntites.some(entity => isNonLordCombatant(entity) && !entity.isDEAD);
    const defenserRole = defendingEntites.find(entity => entity.role && !entity.isDEAD)?.role || 'gueux';

    // Si aucun sbire vivant n'est trouvé, tente de trouver un "lord"
    if (!anyLivingSbire) {
        // console.log(`Aucun sbire vivant trouvé parmi les ennemis.`);
        const lordTarget = defendingEntites.find(entity => isLord(entity) && !entity.isDEAD);
        if (lordTarget) {
            console.log(`Lord vivant trouvé : ${lordTarget.name}`);
            if (isOccultismInvisibleTarget(lordTarget)) {
                markForcedInvisibleTargetAccuracy(attacker, lordTarget, "sbire-single-invisible-lord-target");
            }
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
        const validTargets = defendingEntites.filter(entity => isNonLordCombatant(entity) && !entity.isDEAD);
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
    const allies = entities.filter(e => e.side === attacker.side && e.id !== attacker.id && !e.corpseConsumed);
    const livingAllies = allies.filter(e => !e.isDEAD);
    const deadAllies = allies.filter(e => e.isDEAD);
    const enemies = entities.filter(e => e.side !== attacker.side && !e.isDEAD);

    // console.log(`Alliés vivants pour ${attacker.name} :`, livingAllies);
    // console.log(`Alliés morts pour ${attacker.name} :`, deadAllies);
    // console.log(`Ennemis vivants pour ${attacker.name} :`, enemies);

    const shouldTargetDead = allyTargetAttackDetails.some(detail => detail.deadTarget && detail.deadTarget.includes('yes'));

    if (shouldTargetDead && deadAllies.length > 0) {
        // console.log(`${attacker.name} peut cibler des alliés morts.`);
        if (deadAllies.length > 0) {
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
        if (livingAllies.length === 0 || !allyTargetAttackDetails.some(attack => !attack.deadTarget?.includes('yes'))) {
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
export function invokerHexTarget(attacker, availableHexes, attackerRole, resolve) {
    if (availableHexes.length === 0) {
        console.log(`Aucune case possible pour ${attacker.name}. Vérification des conditions de fin de jeu.`);
        resolve(null);
        return;
    }

    // Choisir un hex aléatoire parmi les hex disponibles
    const randomIndex = Math.floor(Math.random() * availableHexes.length);
    const targetHex = availableHexes[randomIndex];

    console.log(`${attacker.name} cible le hex ${targetHex.getAttribute('data-position')}`);
    resolve(targetHex); // Résoudre la promesse avec le hex cible
}
