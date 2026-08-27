import { ItemDetails } from './itemList.js';
import { loadFromLocalStorage, saveToLocalStorage } from './GameStorage.js';
import { generateUniqueID } from './entites.js';

// Initialisation unique en haut
const existingRaw = loadFromLocalStorage('IngameItems', []);
const existing = Array.isArray(existingRaw) ? existingRaw : [];

// Liste des IDs existants → pour éviter les doublons
let ItemsIDs = existing.map(item => item.itemId);

export function createIngameItem(serial, origin = 'unknown') {
    const existingRaw = loadFromLocalStorage('IngameItems', []);
    const existing = Array.isArray(existingRaw) ? existingRaw : [];
    const ItemsIDs = existing.map(item => item.itemId);

    const itemTemplate = ItemDetails.find(i => i.serial === serial);
    if (!itemTemplate) {
        console.warn(`❌ Aucun item trouvé avec le serial : ${serial}`);
        return null;
    }

    let itemId;
    let attempt = 0;
    const maxAttempts = 100;

    do {
        itemId = `${serial}-${generateUniqueID()}`;
        attempt++;
        if (attempt >= maxAttempts) {
            console.error(`❌ Impossible de générer un ID unique pour l’item ${serial} après ${maxAttempts} tentatives.`);
            return null;
        }
    } while (ItemsIDs.includes(itemId));

    ItemsIDs.push(itemId);

    const newItem = {
        ...itemTemplate,
        itemId,
        origin
    };

    existing.push(newItem);
    saveToLocalStorage('IngameItems', existing);

    console.log(`🧾 Nouvel item créé : ${itemId} (origin: ${origin})`);
    return newItem;
}
