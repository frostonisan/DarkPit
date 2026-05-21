import { getUniqueId } from './entites.js';
import { entitesNest } from './entitesNest.js';

// Fonction principale de sélection aléatoire d'entités pour le côté B
export function selectRandomEntitiesForSideB(entitesNest, totalPoints, moyennePower, maxUtilisation, pourcentage_variation, difficulte, lordcount) {
    const adjustedTotalPoints = Math.max(1, totalPoints + difficulte);
    const adjustedMoyenneNiveau = Math.max(1, moyennePower + difficulte);

    const maxAllowedPoints = adjustedTotalPoints * 1.15;
    const minAllowedPoints = adjustedTotalPoints * 0.85;
    const maxAllowedMoyenne = adjustedMoyenneNiveau * 1.15;
    const minAllowedMoyenne = adjustedMoyenneNiveau * 0.85;

    let entitesWithIds = entitesNest.map((entite, index) => ({
        ...entite,
        id: entite.id || index
    }));

    let selectedEntitiesB = [];
    let entityUsageCount = {};

    let minLevel = Math.floor(adjustedMoyenneNiveau * (1 - pourcentage_variation / 100));
    let maxLevel = Math.ceil(adjustedMoyenneNiveau * (1 + pourcentage_variation / 100));

    let lords = entitesWithIds.filter(entite => entite.type === 'lord');
    let otherEntities = entitesWithIds.filter(entite => entite.type === 'sbire');

    function selectLordsForSideB() {
        for (let i = 0; i < lordcount && lords.length > 0; i++) {
            let lordsFiltres = lords.filter(lord => {
                if (!entityUsageCount[lord.id]) {
                    entityUsageCount[lord.id] = 0;
                }
                return lord.power >= minLevel && lord.power <= maxLevel && entityUsageCount[lord.id] < maxUtilisation;
            });

            if (lordsFiltres.length === 0) {
                lordsFiltres = lords.filter(lord => entityUsageCount[lord.id] < maxUtilisation);
                if (lordsFiltres.length === 0) {
                    console.warn("Tous les Lords ont atteint leur nombre maximal d'utilisations.");
                    break;
                }
            }

            let selectedLord = lordsFiltres.reduce((prev, curr) => 
                Math.abs(curr.power - adjustedMoyenneNiveau) < Math.abs(prev.power - adjustedMoyenneNiveau) ? curr : prev
            );

            entityUsageCount[selectedLord.id]++;
            let newLordEntity = { ...selectedLord, id: getUniqueId(), side: 'B' };
            selectedEntitiesB.push(newLordEntity);  // Ajoute directement le Lord dans `selectedEntitiesB`

            console.log(`Sélectionné LORD Côté B : ${newLordEntity.name}, niveau ${newLordEntity.power}, ID: ${newLordEntity.id}`);
        }
    }

    selectLordsForSideB();

    let remainingPointsB = adjustedTotalPoints - selectedEntitiesB.reduce((acc, lord) => acc + lord.power, 0);

    function addEntitiesForSideB(remainingPoints) {
        let totalLevel = selectedEntitiesB.reduce((acc, entity) => acc + entity.power, 0);
        let sortedEntities = otherEntities.sort((a, b) => Math.abs(a.power - adjustedMoyenneNiveau) - Math.abs(b.power - adjustedMoyenneNiveau));

        while (totalLevel < maxAllowedPoints) {
            let entityAdded = false;
            for (let entite of sortedEntities) {
                if (!entityUsageCount[entite.id]) {
                    entityUsageCount[entite.id] = 0;
                }
                if (entityUsageCount[entite.id] < maxUtilisation) {
                    let newEntity = { ...entite, id: getUniqueId(), side: 'B' };
                    let entiteLevel = newEntity.power;

                    let currentMoyenne = (totalLevel + entiteLevel) / (selectedEntitiesB.length + 1);
                    if (currentMoyenne <= maxAllowedMoyenne) {
                        selectedEntitiesB.push(newEntity);
                        totalLevel += entiteLevel;
                        entityUsageCount[entite.id]++;
                        entityAdded = true;
                        console.log(`Ajouté : ${newEntity.name}, Power : ${newEntity.power}, Côté B`);

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

        return selectedEntitiesB;
    }

    selectedEntitiesB = addEntitiesForSideB(remainingPointsB);
    let totalPointsB = selectedEntitiesB.reduce((acc, entity) => acc + entity.power, 0);
    let moyennePowerB = totalPointsB / selectedEntitiesB.length;

    console.log(`Total Points armée B atteint : ${totalPointsB}`);
    console.log(`Moyenne Power de l'armée B : ${moyennePowerB.toFixed(2)}`);

    return selectedEntitiesB;
}
