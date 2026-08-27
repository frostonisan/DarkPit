import { loadFromLocalStorage, saveToLocalStorage, armyAConfig } from './GameStorage.js';
import { entitesNest } from './entitesNest.js';
import { getUniqueId } from './entites.js';


export function generateArmyA(armyConfig, entitesNest) {
    const providedLordId = armyConfig.lordId;
    const providedLordNickname = armyConfig.lordNickname || null;
    const providedSquireIds = armyConfig.squireIds;
    const providedSquireNicknames = armyConfig.squireNicknames || {};

    const equippedItems = loadFromLocalStorage('equippedItems', {}); // { "342491": { slot1: [...], slot2: [...] }, ... }

    console.log("🎯 Génération de l'armée A depuis armyConfig : ", armyConfig);
    console.log("📦 Items équipés retrouvés :", equippedItems);

    let selectedEntitiesA = [];

    function injectStuff(entiteBase, originalId) {
        const newId = getUniqueId();
        const entityStuff = equippedItems[originalId] || { slot1: [], slot2: [] };

        console.log(`🛠️ Injection du stuff pour entité ID ${originalId} → Nouveau ID ${newId}`);
        console.log(`   → Stuff détecté :`, entityStuff);

        return {
            ...entiteBase,
            id: newId,
            side: 'A',
            stuff: entityStuff,
            nickname: providedSquireNicknames[originalId] || null
        };
    }

    // LORD
    if (providedLordId != null) {
        const providedLord = entitesNest.find(entite => entite.id === providedLordId);
        if (providedLord) {
            const newLordEntity = injectStuff(providedLord, providedLordId);
            newLordEntity.nickname = providedLordNickname;

            selectedEntitiesA.push(newLordEntity);
            console.log(`👑 LORD ajouté : ${newLordEntity.name} (Nickname : ${newLordEntity.nickname})`);
            console.log(`   ➤ ID unique : ${newLordEntity.id}`);
            console.log(`   ➤ Stuff :`, newLordEntity.stuff);
        } else {
            console.warn(`⚠️ Lord introuvable avec ID ${providedLordId} dans entitesNest`);
        }
    } else {
        console.log("ℹ️ Aucun Lord fourni pour l'armée A.");
    }

    // SBIRE(S)
    providedSquireIds.forEach(squireId => {
        const providedSquire = entitesNest.find(entite => entite.id === squireId);
        if (providedSquire) {
            const newSquireEntity = injectStuff(providedSquire, squireId);
            selectedEntitiesA.push(newSquireEntity);

            console.log(`🪖 SBIRE ajouté : ${newSquireEntity.name} (Nickname : ${newSquireEntity.nickname})`);
            console.log(`   ➤ ID unique : ${newSquireEntity.id}`);
            console.log(`   ➤ Stuff :`, newSquireEntity.stuff);
        } else {
            console.warn(`⚠️ Aucun sbire trouvé avec l'ID ${squireId} dans entitesNest`);
        }
    });

    console.log("✅ Armée A finalisée :", selectedEntitiesA);
    return selectedEntitiesA;
}

