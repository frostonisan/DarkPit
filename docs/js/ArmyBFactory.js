import { generateUniqueID, enrichEntityStats } from './entites.js';
import { loadFromLocalStorage, saveToLocalStorage } from './GameStorage.js';

function assignEntityLevel(power) {
    const powerLevelRanges = [
        { minPower: 1, maxPower: 5, minLevel: 1, maxLevel: 10 },
        { minPower: 6, maxPower: 10, minLevel: 5, maxLevel: 15 },
        { minPower: 11, maxPower: 15, minLevel: 10, maxLevel: 20 },
        { minPower: 16, maxPower: 20, minLevel: 15, maxLevel: 25 },
        { minPower: 21, maxPower: 25, minLevel: 20, maxLevel: 30 },
        { minPower: 26, maxPower: 30, minLevel: 25, maxLevel: 35 },
        { minPower: 31, maxPower: 35, minLevel: 30, maxLevel: 40 },
        { minPower: 36, maxPower: 40, minLevel: 35, maxLevel: 45 },
        { minPower: 41, maxPower: 50, minLevel: 40, maxLevel: 50 },
    ];

    const selectedRange = powerLevelRanges.find(range => power >= range.minPower && power <= range.maxPower);

    if (!selectedRange) {
        console.error("Aucune plage de niveaux trouvée pour le Power donné.");
        return null;
    }

    return Math.floor(Math.random() * (selectedRange.maxLevel - selectedRange.minLevel + 1) + selectedRange.minLevel);
}

export function selectRandomEntitiesForSideB(entitesNestUp, totalPoints, moyennePower, maxUtilisation, pourcentage_variation, difficulte, lordcount) {
    const adjustedTotalPoints = Math.max(1, totalPoints + difficulte);
    const adjustedMoyenneNiveau = Math.max(1, moyennePower + difficulte);

    const maxAllowedPoints = adjustedTotalPoints * 1.15;
    const minAllowedPoints = adjustedTotalPoints * 0.85;
    const maxAllowedMoyenne = adjustedMoyenneNiveau * 1.15;
    const minAllowedMoyenne = adjustedMoyenneNiveau * 0.85;

    let entitesWithIds = entitesNestUp.map((entite, index) => ({
        ...entite,
        id: entite.id || index
    }));

    let selectedEntitiesB = [];
    let entityUsageCount = {};

    let minLevel = Math.floor(adjustedMoyenneNiveau * (1 - pourcentage_variation / 100));
    let maxLevel = Math.ceil(adjustedMoyenneNiveau * (1 + pourcentage_variation / 100));

    let lords = entitesWithIds.filter(entite => entite.type === 'lord');
    let otherEntities = entitesWithIds.filter(entite => entite.type === 'sbire');

    const currentStageId = window.currentStageId;
    if (!currentStageId) {
        console.error("currentStageId est indéfini.");
        return [];
    }

    const armyBData = loadFromLocalStorage('ArmyB', { armies: {} });
    const existingArmyB = armyBData.armies[`ArmyB_${currentStageId}`];

    if (existingArmyB) {
        console.log(`Armée B (${currentStageId}) détectée avec la même ID que le stage. L'armée est donc chargée directement depuis le local storage.`);
        return existingArmyB.entities;
    } else {
        console.log(`Armée B (${currentStageId}) non détectée avec la même ID que le stage. L'armée est donc générée et sauvegardée dans le local storage avec l'ID du stage (${currentStageId}).`);
    }

    function selectLordsForSideB() {
        let lordsFiltres = lords.filter(lord => {
            if (!entityUsageCount[lord.id]) entityUsageCount[lord.id] = 0;
            return lord.power >= minLevel && lord.power <= maxLevel && entityUsageCount[lord.id] < maxUtilisation;
        });

        lordsFiltres.sort((a, b) => Math.abs(a.power - adjustedMoyenneNiveau) - Math.abs(b.power - adjustedMoyenneNiveau));

        for (let i = 0; i < lordcount && lordsFiltres.length > 0; i++) {
            let selectedLord = lordsFiltres.shift();
            entityUsageCount[selectedLord.id]++;

            let newLordEntity = { ...selectedLord, id: generateUniqueID(), side: 'B' };
            newLordEntity.level.current = assignEntityLevel(newLordEntity.power);

            // **Application des stats bonus**
            newLordEntity = enrichEntityStats(newLordEntity);

            selectedEntitiesB.push(newLordEntity);

            console.log(`Sélectionné LORD Côté B : ${newLordEntity.name}, Niveau : ${newLordEntity.level.current}, Power : ${newLordEntity.power}, HP : ${newLordEntity.stats.HP}, ID: ${newLordEntity.id}`);
        }
    }

    function addEntitiesForSideB() {
        let totalLevel = selectedEntitiesB.reduce((acc, entity) => acc + entity.power, 0);

        let sortedEntities = otherEntities.sort((a, b) => Math.abs(a.power - adjustedMoyenneNiveau) - Math.abs(b.power - adjustedMoyenneNiveau));

        while (totalLevel < maxAllowedPoints) {
            let entityAdded = false;

            for (let entite of sortedEntities) {
                if (!entityUsageCount[entite.id]) entityUsageCount[entite.id] = 0;

                if (entityUsageCount[entite.id] < maxUtilisation) {
                    let newEntity = { ...entite, id: generateUniqueID(), side: 'B' };
                    newEntity.level.current = assignEntityLevel(newEntity.power);

                    let currentMoyenne = (totalLevel + newEntity.power) / (selectedEntitiesB.length + 1);

                    if (currentMoyenne <= maxAllowedMoyenne && totalLevel + newEntity.power <= maxAllowedPoints) {
                        // **Application des stats bonus**
                        newEntity = enrichEntityStats(newEntity);

                        selectedEntitiesB.push(newEntity);
                        totalLevel += newEntity.power;
                        entityUsageCount[entite.id]++;
                        entityAdded = true;

                        console.log(`Ajouté : ${newEntity.name}, Power : ${newEntity.power}, Level : ${newEntity.level.current}, HP : ${newEntity.stats.HP}, Côté B`);

                        if (currentMoyenne >= minAllowedMoyenne && currentMoyenne <= maxAllowedMoyenne) {
                            break;
                        }
                    }
                }
            }

            if (!entityAdded) {
                console.warn('Aucune entité supplémentaire trouvée pour respecter le total des points.');
                break;
            }
        }
    }

    selectLordsForSideB();
    addEntitiesForSideB();

       const armyBId = `ArmyB_${currentStageId}`;
    armyBData.armies[armyBId] = {
        ArmyB_id: armyBId,
        entities: selectedEntitiesB
    };
    saveToLocalStorage('ArmyB', armyBData);

    console.log(`ArmyB sauvegardée avec l'ID ${armyBId}`);
    return selectedEntitiesB;
}

export function selectScriptedEntitiesForSideB(entitesNestUp) {
    const currentStageId = window.currentStageId;
    if (!currentStageId) {
        console.error("currentStageId est indéfini.");
        return [];
    }

    // Vérifie s'il existe déjà une sauvegarde
    const armyBData = loadFromLocalStorage('ArmyB', { armies: {} });
    const existingArmyB = armyBData.armies[`ArmyB_${currentStageId}`];

    if (existingArmyB && Array.isArray(existingArmyB.entities)) {
        console.log(`🔄 Chargement direct des entités sauvegardées (ArmyB_${currentStageId}).`);
        return existingArmyB.entities;
    }

    // Aucune sauvegarde, génération scriptée
    let gameStageData = JSON.parse(localStorage.getItem('GameStages')) || { stages: [] };
    let stage = gameStageData.stages.find(stage => stage.id === currentStageId);

    if (!stage || !stage.scripted_entites) {
        console.error("Aucune donnée d'entités scriptées trouvée pour ce stage.");
        return [];
    }

    let selectedEntitiesB = [];

    function createEntityFromSerial(serial, level, type) {
        let entity = entitesNestUp.find(entite => entite.serial === serial);
        if (entity) {
            let newEntity = { 
                ...entity, 
                id: generateUniqueID(), 
                side: 'B', 
                level, 
                type 
            };
            newEntity = enrichEntityStats(newEntity);
            selectedEntitiesB.push(newEntity);
            console.log(`Scripted ${type.toUpperCase()} : ${newEntity.name}, Niveau : ${level}, ID: ${newEntity.id}`);
        } else {
            console.warn(`Aucune entité trouvée pour le serial ${serial}`);
        }
    }

    stage.scripted_entites.sbires.forEach(sbire => createEntityFromSerial(sbire.serial, sbire.level.current, 'sbire'));
    stage.scripted_entites.lords.forEach(lord => createEntityFromSerial(lord.serial, lord.level.current, 'lord'));

const armyBId = `ArmyB_${window.currentStageId}`; // L'ID exact du niveau en cours

// Stocke DIRECTEMENT en tableau pour éviter tout autre problème
armyBData[armyBId] = selectedEntitiesB;
armyBData.armies[armyBId] = {
    ArmyB_id: armyBId,
    entities: selectedEntitiesB
};
saveToLocalStorage('ArmyB', armyBData);

console.log(`✅ ArmyB scriptée sauvegardée avec l'ID ${armyBId}`);

    console.log(`✅ ArmyB scriptée sauvegardée avec l'ID ${armyBId}`);

    return selectedEntitiesB;
}
