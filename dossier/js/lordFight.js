import { listingFocusLord } from './role-rule.js'; 

export let globalTargetName = null;

// LORD TARGET
export function lordEnemyTarget(defendingEntities, deadEnemies, resolve, attackerName, attackerId) {
    let highestAggroScore = 0;
    let targetWithHighestAggro = null;
    let lowestHP = Infinity;
    let targetWithLowestHP = null;

    // Prépare un tableau pour conserver les scores d'aggro de toutes les entités
    let allEntitiesAggro = defendingEntities.map(entity => {
        let totalDamage = entity.totalDamage || 0;
        let totalHeal = entity.totalHeal || 0;
        let totalKills = entity.kills || 0;

        let aggroDamage = totalDamage;
        let aggroHeal = totalHeal * 1.1;
        let aggroRole = 1.0; // Initialisation par défaut
        let aggroKills = totalKills * 2;

        if (Array.isArray(entity.role) && entity.role.includes('tank')) {
            aggroRole = 1.6;
        } else if (Array.isArray(entity.role) && entity.role.includes('gueux')) {
            aggroRole = 1.2;
        }

        let aggroScore = (aggroDamage + aggroHeal + aggroKills) * aggroRole;

        return {
            name: entity.name,
			id:entity.id,
			portrait: entity.portrait,
            totalDamage: totalDamage,
            totalHeal: totalHeal,
            kills: totalKills,
            aggroScore: aggroScore,
            role: entity.role,
            isDEAD: entity.isDEAD
        };
    }).filter(entity => !entity.isDEAD); // Filtre pour éliminer les entités mortes

    // Trouve la cible avec le plus de score d'aggro et les plus faibles HP parmi les entités vivantes
    allEntitiesAggro.forEach(entity => {
        if (entity.aggroScore > highestAggroScore) {
            highestAggroScore = entity.aggroScore;
            targetWithHighestAggro = entity;
        }
        let entityHP = defendingEntities.find(e => e.name === entity.name).stats.HP;
        if (entityHP < lowestHP) {
            lowestHP = entityHP;
            targetWithLowestHP = entity;
        }
    });

    let selectedTarget = targetWithHighestAggro || targetWithLowestHP;

    // Stocke le nom de la cible sélectionnée dans la variable globale
    globalTargetName = selectedTarget ? selectedTarget.name : null;

    // **Ajout du statut 'new-target' à la cible sélectionnée**
    if (selectedTarget) {
        let targetEntityInDefendingEntities = defendingEntities.find(e => e.name === selectedTarget.name);
        if (targetEntityInDefendingEntities) {
            targetEntityInDefendingEntities.status = 'new-target';
            // **Console.log les informations sur la nouvelle cible**
                     console.log(`NEW TARGET : Nom: ${targetEntityInDefendingEntities.name} Statut: ${targetEntityInDefendingEntities.status}`);     
        }
    }

    // Trie le tableau des scores d'aggro pour l'affichage
    allEntitiesAggro.sort((a, b) => b.aggroScore - a.aggroScore);

    // Affichage des informations dans la console
    if (selectedTarget) {
        console.log(`${attackerName} commence son attaque sur ${selectedTarget.name} (car ${selectedTarget.name} a le plus gros score d'aggro : ${selectedTarget.aggroScore}pts)`);

        // Recherche de l'entité complète pour obtenir le portrait
        const targetEntity = defendingEntities.find(e => e.name === selectedTarget.name);
        if (targetEntity && targetEntity.portrait) {
            // console.log(`Portrait de la cible: ${targetEntity.portrait}`);
        } else {
            // console.log(`Portrait non disponible pour la cible: ${selectedTarget.name}`);
        }

        allEntitiesAggro.forEach(entity => {
            console.log(`Score d'aggro de ${entity.name} (Role: ${entity.role}) : Dégâts - ${entity.totalDamage}pts, Soins - ${entity.totalHeal}pts, Kills - ${entity.kills}, Score d'aggro - ${entity.aggroScore}pts`);
        });

        // Appel à la fonction pour mettre à jour le background-image
        updateLordRoleImg(attackerId, targetEntity);
		allEntitiesAggro.sort((a, b) => b.aggroScore - a.aggroScore);

// Mise à jour du classement d'aggro du lord en temps réel
listingFocusLord(attackerId, allEntitiesAggro);
    } else {
        console.log(`${attackerName} n'a trouvé aucune cible valide pour l'attaque.`);
        
        // Réinitialise le background-image si aucune cible valide n'est trouvée
        updateLordRoleImg(null);
    }

    // Résout avec la cible sélectionnée, ou null si aucune cible valide
    resolve(defendingEntities.find(e => e.name === (selectedTarget ? selectedTarget.name : null)));
}


// LORD ATTACK
export function lordAttackEnemy(attacker) {
    if (!attacker.attacks || attacker.attacks.length === 0) {
        console.error("Aucune attaque disponible pour cet attaquant.");
        return null; // Assure que la fonction renvoie null si aucune attaque n'est disponible
    }
    const attackIndex = Math.floor(Math.random() * attacker.attacks.length);
    return attacker.attacks[attackIndex];
}

// LORD IMAGE TARGET HUD
export function updateLordRoleImg(attackerId, targetEntity) {
    // Sélectionne l'élément avec l'id 'role-img_{attackerId}'
    const lordRoleImg = document.getElementById(`Targetrole-img_${attackerId}`);

    if (lordRoleImg) {
        if (targetEntity && targetEntity.portrait) {
            // Met à jour le background-image avec l'URL du portrait de la cible
            lordRoleImg.style.backgroundImage = `url('${targetEntity.portrait}')`;
            lordRoleImg.style.backgroundSize = 'cover'; // Optionnel : Ajuste la taille de l'image
            lordRoleImg.style.backgroundPosition = 'center'; // Optionnel : Centre l'image
            
            // Ajoute l'attribut data-target avec l'id de la cible
            lordRoleImg.setAttribute('data-target', targetEntity.id);
        } else {
            // Si aucune cible ou portrait, réinitialise le background-image
            lordRoleImg.style.backgroundImage = '';

            // Supprime l'attribut data-target si présent
            lordRoleImg.removeAttribute('data-target');
        }
    } else {
        console.warn(`L'élément avec l'id 'role-img_${attackerId}' n'a pas été trouvé dans le DOM.`);
    }
}


