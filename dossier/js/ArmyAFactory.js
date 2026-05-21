import { loadFromLocalStorage, saveToLocalStorage, armyAConfig } from './GameStorage.js';
import { entitesNestUp, generateUniqueID, enrichEntityStats } from './entites.js';

export function addEntityToArmyA(entity, level = 1) {
    const selectedArmyA = loadFromLocalStorage('selectedArmyA', []);

    const newEntity = {
        ...entity,
        id: generateUniqueID(),
        side: 'A',
        level,
        experience: 0
    };

    // Assurer que HP et autres stats sont enrichies
    const enriched = enrichEntityStats(newEntity);

    selectedArmyA.push(enriched);
    saveToLocalStorage('selectedArmyA', selectedArmyA);

    console.log(`✅ Entité ajoutée à l'Armée A : ${enriched.name}, ID : ${enriched.id}`);
}

export function generateArmyA(armyConfig, entitesNestUp) {
    const providedLordId = armyConfig.lordId;
    const providedLordNickname = armyConfig.lordNickname || null; // Permet de fournir un surnom pour le Lord
    const providedSquireIds = armyConfig.squireIds;
    const providedSquireNicknames = armyConfig.squireNicknames || {}; // Objet avec des IDs comme clés et des surnoms comme valeurs

    let selectedEntitiesA = [];

    // Charger et valider le Lord
    if (providedLordId != null) {
        const providedLord = entitesNestUp.find(entite => entite.id === providedLordId);
        if (providedLord) {
            let newLordEntity = { 
                ...providedLord, 
                id: generateUniqueID(), 
                side: 'A', 
                level: 1, // Niveau de base
                nickname: providedLordNickname // Ajout du nickname pour le Lord
            };

            // Application du bonus de vitalité aux HP
            newLordEntity = enrichEntityStats(newLordEntity);

            selectedEntitiesA.push(newLordEntity);
            console.log(`Utilisé LORD pour Côté A : ${newLordEntity.name}, Nickname : ${newLordEntity.nickname}, Level : ${newLordEntity.level}, Power : ${newLordEntity.power}, HP : ${newLordEntity.stats.HP}, ID : ${newLordEntity.id}`);
        } else {
            console.warn(`Le Lord avec l'ID ${providedLordId} n'existe pas dans les données.`);
        }
    } else {
        console.log("Aucun Lord fourni pour le côté A.");
    }

    // Charger et valider les sbires
    providedSquireIds.forEach(squireId => {
        const providedSquire = entitesNestUp.find(entite => entite.id === squireId);
        if (providedSquire) {
            let newSquireEntity = { 
                ...providedSquire, 
                id: generateUniqueID(), 
                side: 'A', 
                level: 1, // Niveau de base
                nickname: providedSquireNicknames[squireId] || null // Ajout du nickname si fourni
            };

            // Application du bonus de vitalité aux HP
            newSquireEntity = enrichEntityStats(newSquireEntity);

            selectedEntitiesA.push(newSquireEntity);
            console.log(`Utilisé SBIRE pour Côté A : ${newSquireEntity.name}, Nickname : ${newSquireEntity.nickname}, Level : ${newSquireEntity.level}, Power : ${newSquireEntity.power}, HP : ${newSquireEntity.stats.HP}, ID : ${newSquireEntity.id}`);
        } else {
            console.warn(`Aucun sbire trouvé avec l'ID ${squireId}.`);
        }
    });

    return selectedEntitiesA;
}
