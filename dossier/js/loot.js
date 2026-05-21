import { entitesNestUp, entites, generateUniqueID, assignUniqueIDToEntities } from './entites.js';
import { addEntityToArmyA  } from './ArmyAFactory.js';
import { loadFromLocalStorage, saveToLocalStorage } from './GameStorage.js';

// Fonction pour créer le lootpool basé sur les serials uniques de Side B
function createLootPoolFromSideB() {
    console.log("Recherche des serials uniques dans Side B...");

    // Étape 1 : Identifier les serials des entités de Side B
    const sideBEntities = entites.filter(entity => entity.side === 'B');
    const uniqueSerials = new Set(sideBEntities.map(entity => entity.serial));

    console.log("Serials uniques trouvés dans Side B :", Array.from(uniqueSerials));

    // Étape 2 : Créer la lootpool avec les entités ayant les mêmes serials
    const lootPool = entitesNestUp.filter(entity => uniqueSerials.has(entity.serial));

    console.log("Lootpool final généré à partir des serials :", lootPool);
    return lootPool;
}

// Fonction pour sélectionner une entité aléatoire dans le lootpool
function entityRarityLoot(lootPool) {
    if (lootPool.length === 0) {
        console.log("Aucun sbire disponible dans le lootpool.");
        return null;
    }

    // Étape 1 : Calculer le Power max et min
    const maxPower = Math.max(...lootPool.map(entity => entity.power));
    const minPower = Math.min(...lootPool.map(entity => entity.power));
    console.log(`Power max : ${maxPower}, Power min : ${minPower}`);

    // Étape 2 : Générer une table de pondération
    const weightedLootPool = lootPool.map(entity => {
        const weight = maxPower - entity.power + 1;
        console.log(`Entité : ${entity.name}, Power : ${entity.power}, Taux de drop pondéré : ${weight}`);
        return { ...entity, weight };
    });

    // Étape 3 : Calculer la somme totale des poids
    const totalWeight = weightedLootPool.reduce((sum, entity) => sum + entity.weight, 0);
    console.log(`Somme totale des poids : ${totalWeight}`);

    // Étape 4 : Générer un nombre aléatoire pour déterminer le drop
    let randomValue = Math.random() * totalWeight;
    console.log(`Valeur aléatoire générée : ${randomValue}`);

    // Étape 5 : Sélectionner l'entité en fonction du poids
    for (const entity of weightedLootPool) {
        if (randomValue < entity.weight) {
            console.log(`Entité sélectionnée : ${entity.name}`);
            console.log(`Power : ${entity.power}, Taux de drop pondéré : ${entity.weight}`);
            console.log("==> Cette entité est gagnée !");
            return entity;
        }
        randomValue -= entity.weight;
    }

    return null;
}


// Fonction principale pour donner une récompense au joueur A
export function rewardPlayerA() {
    console.log("Début du processus de récompense...");

    // Étape 3 : Créer le lootpool
    const lootPool = createLootPoolFromSideB();

    if (lootPool.length === 0) {
        console.log("Aucun lootpool disponible. Fin du processus.");
        return;
    }

    // Sélectionner une entité aléatoire
    const rewardEntity = entityRarityLoot(lootPool);

    if (!rewardEntity) {
        console.log("Aucun sbire n'a été sélectionné.");
        return;
    }

    // Ajouter la récompense au joueur A
    rewardEntity.side = 'A'; // Changer le side en 'A'
    console.log(`Modification du side de l'entité ${rewardEntity.name} : Side A`);

    giveEntityReward(rewardEntity);

    // Afficher l'entité gagnée dans la console
    console.log(`Récompense ajoutée : ${JSON.stringify(rewardEntity, null, 2)}`);
}

// Fonction pour ajouter une entité au joueur A
function giveEntityReward(entity) {
    if (entity.type !== 'sbire') {
        console.log("L'entité n'est pas de type sbire. Aucun ajout effectué.");
        return;
    }

    addEntityToArmyA(entity, 1); // tu peux modifier le niveau si besoin
}