// Recrutement et constitution des armees du joueur et des adversaires.
import { loadFromLocalStorage, saveToLocalStorage, armyAConfig, isAdminMode } from "../storage/gameStorage.js";
import { entitesNestUp, generateUniqueID, enrichEntityStats, registerEntityAcquisition } from "./runtime.js";
import { assertEntityType, isLord, isNonLordCombatant, ENTITY_TYPE } from "./rules.js";
import { gameStorage as localStorage } from "../storage/sessionStorage.js";

export function canRecruitEntity(entity, acquisition = {}) {
    return isNonLordCombatant(entity)
        || (isLord(entity) && acquisition.source === 'shop' && isAdminMode());
}

export function addEntityToArmyA(entity, level = 1, acquisition = {}) {
    if (!canRecruitEntity(entity, acquisition)) {
        throw new TypeError(`Impossible d'ajouter ${entity?.type} comme unité recrutée.`);
    }
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
    registerEntityAcquisition(enriched, acquisition);

    selectedArmyA.push(enriched);
    saveToLocalStorage('selectedArmyA', selectedArmyA);

    console.log(`✅ Entité ajoutée à l'Armée A : ${enriched.name}, ID : ${enriched.id}`);
    return enriched;
}

export function generateArmyA(
    armyConfig,
    entitesNestUp,
    acquisition = { source: 'initial' }
) {
    if (!Array.isArray(armyConfig?.unitIds)) {
        throw new TypeError('armyConfig.unitIds doit être défini avant de générer l’armée A.');
    }
    const providedLordId = armyConfig.lordId;
    const providedLordNickname = armyConfig.lordNickname || null; // Permet de fournir un surnom pour le Lord
    const providedUnitIds = armyConfig.unitIds;
    const providedUnitNicknames = armyConfig.unitNicknames || {};

    let selectedEntitiesA = [];
    const cloneTemplateLevel = (level) => {
        if (level && typeof level === 'object') return { ...level };
        if (typeof level === 'number' && level > 0) return level;
        return 1;
    };

    // Charger et valider le Lord
    if (providedLordId != null) {
        const providedLord = entitesNestUp.find(entite => entite.id === providedLordId);
        if (providedLord) {
            if (!isLord(providedLord)) throw new TypeError(`${providedLord.name} n'est pas un lord.`);
            let newLordEntity = {
                ...providedLord,
                id: generateUniqueID(),
                side: 'A',
                level: cloneTemplateLevel(providedLord.level),
                nickname: providedLordNickname // Ajout du nickname pour le Lord
            };

            // Application du bonus de vitalité aux HP
            newLordEntity = enrichEntityStats(newLordEntity);
            registerEntityAcquisition(newLordEntity, acquisition);

            selectedEntitiesA.push(newLordEntity);
            console.log(`Utilisé LORD pour Côté A : ${newLordEntity.name}, Nickname : ${newLordEntity.nickname}, Level : ${newLordEntity.level}, Power : ${newLordEntity.power}, HP : ${newLordEntity.stats.HP}, ID : ${newLordEntity.id}`);
        } else {
            console.warn(`Le Lord avec l'ID ${providedLordId} n'existe pas dans les données.`);
        }
    } else {
        console.log("Aucun Lord fourni pour le côté A.");
    }

    // Charger et valider les unités non-lords.
    providedUnitIds.forEach(unitId => {
        const providedUnit = entitesNestUp.find(entite => entite.id === unitId);
        if (providedUnit) {
            assertEntityType(providedUnit);
            if (!isNonLordCombatant(providedUnit)) {
                throw new TypeError(`${providedUnit.name} n'est pas un sbire.`);
            }
            let newUnitEntity = {
                ...providedUnit,
                id: generateUniqueID(),
                side: 'A',
                level: cloneTemplateLevel(providedUnit.level),
                nickname: providedUnitNicknames[unitId] || null
            };

            // Application du bonus de vitalité aux HP
            newUnitEntity = enrichEntityStats(newUnitEntity);
            registerEntityAcquisition(newUnitEntity, acquisition);

            selectedEntitiesA.push(newUnitEntity);
            console.log(`Utilisé ${newUnitEntity.type.toUpperCase()} pour Côté A : ${newUnitEntity.name}, Nickname : ${newUnitEntity.nickname}, Level : ${newUnitEntity.level}, Power : ${newUnitEntity.power}, ID : ${newUnitEntity.id}`);
        } else {
            throw new TypeError(`Aucune unité trouvée avec l'ID ${unitId}.`);
        }
    });

    return selectedEntitiesA;
}

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

    const randomCandidates = entitesNestUp.filter(entite => Number.isInteger(entite.power) && entite.power >= 1 && entite.power <= 50);
    const missingPower = entitesNestUp.filter(entite => !randomCandidates.includes(entite));
    if (missingPower.length) {
        console.warn('Modèles exclus de la génération aléatoire : Power absent ou hors plage',
            missingPower.map(entite => ({ serial: entite.serial, name: entite.name, power: entite.power })));
    }
    let entitesWithIds = randomCandidates.map((entite, index) => ({
        ...entite,
        id: entite.id || index
    }));
    entitesWithIds.forEach(assertEntityType);

    let selectedEntitiesB = [];
    let entityUsageCount = {};

    let minLevel = Math.floor(adjustedMoyenneNiveau * (1 - pourcentage_variation / 100));
    let maxLevel = Math.ceil(adjustedMoyenneNiveau * (1 + pourcentage_variation / 100));

    let lords = entitesWithIds.filter(isLord);
    let otherEntities = entitesWithIds.filter(isNonLordCombatant);

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
    let stage = gameStageData.stages.find(stage => String(stage.id) === String(currentStageId));

    if (!stage || !stage.scripted_entites) {
        throw new Error(`Aucune donnée d'entités scriptées pour le stage ${currentStageId}.`);
    }

    let selectedEntitiesB = [];

    function createEntityFromSerial(serial, level, expectedType) {
        if (!Number.isInteger(level) || level < 1) {
            throw new TypeError(`Niveau scripté invalide pour le modèle ${serial} : ${level}.`);
        }
        let entity = entitesNestUp.find(entite => entite.serial === serial);
        if (entity) {
            const actualType = assertEntityType(entity);
            if (actualType !== expectedType) {
                throw new TypeError(`Le modèle ${entity.name} est ${actualType}, pas ${expectedType}.`);
            }
            let newEntity = { 
                ...structuredClone(entity),
                id: generateUniqueID(), 
                side: 'B', 
                level
            };
            newEntity = enrichEntityStats(newEntity);
            selectedEntitiesB.push(newEntity);
            console.log(`Scripted ${actualType.toUpperCase()} : ${newEntity.name}, Niveau : ${level}, ID: ${newEntity.id}`);
        } else {
            throw new Error(`Aucune entité trouvée pour le serial ${serial}.`);
        }
    }

    const scripted = stage.scripted_entites;
    if (!Array.isArray(scripted.sbires) || !Array.isArray(scripted.lords)) {
        throw new TypeError('Un stage scripté doit définir sbires et lords.');
    }
    scripted.sbires.forEach(entity => createEntityFromSerial(entity.serial, entity.level, ENTITY_TYPE.MINION));
    scripted.lords.forEach(entity => createEntityFromSerial(entity.serial, entity.level, ENTITY_TYPE.LORD));

const armyBId = `ArmyB_${window.currentStageId}`; // L'ID exact du niveau en cours

armyBData.armies[armyBId] = {
    ArmyB_id: armyBId,
    entities: selectedEntitiesB
};
saveToLocalStorage('ArmyB', armyBData);

    console.log(`✅ ArmyB scriptée sauvegardée avec l'ID ${armyBId}`);

    return selectedEntitiesB;
}
