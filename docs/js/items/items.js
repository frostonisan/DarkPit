import { ItemDetails } from '../data/itemList.js';
import { loadFromLocalStorage, saveToLocalStorage } from "../storage/gameStorage.js";
import { generateUniqueID } from "../entities/runtime.js";
import { getDisplayStatKey, normalizeStatKey } from "../entities/rules.js";
import { POWER_RULES, evaluateItemPower, qualityFromPower, getPowerStatDefinition } from '../procedural/proc-bareme.js';

// Compatibility entry points used by item helpers and equipment.
export const ITEM_POWER_BALANCE = POWER_RULES;
export const calculateItemPower = evaluateItemPower;
export const getItemQualityFromPower = qualityFromPower;
export function getItemStatPowerConfig(stat) {
    const row = getPowerStatDefinition(stat);
    return { ...row, power: row.coefficient, level: row.rank };
}
export function applyItemPower(item) {
    if (!item || typeof item !== 'object') return item;
    const result = evaluateItemPower(item);
    item.power = result.score;
    item.powerQuality = result.quality;
    if (item.itemQuality == null && !Number.isFinite(item.generatedPowerQuality)) {
        item.generatedPowerQuality = evaluateItemPower(item, { fullReserve: true }).quality;
    }
    Object.defineProperty(item, 'powerDetails', {
        value: result, enumerable: false, configurable: true, writable: true,
    });
    return item;
}

export function refreshItemPowerCatalog(items = ItemDetails) {
    if (!Array.isArray(items)) return items;
    items.forEach(applyItemPower);
    return items;
}

function syncExistingIngameItemPowers() {
    const ingameItems = Array.isArray(existingRaw) ? existingRaw : [];
    let changed = false;

    for (const item of ingameItems) {
        if (!item || !Array.isArray(item.itemType) || !item.itemType.includes("stuff")) continue;
        const before = item.power;
        applyItemPower(item);
        if (before !== item.power) changed = true;
    }

    if (changed) saveToLocalStorage('IngameItems', ingameItems);
}

// Initialisation unique en haut
const existingRaw = loadFromLocalStorage('IngameItems', []);
const existing = Array.isArray(existingRaw) ? existingRaw : [];

// Liste des IDs existants → pour éviter les doublons
let ItemsIDs = existing.map(item => item.itemId);

refreshItemPowerCatalog();
syncExistingIngameItemPowers();

export function createIngameItem(serial, origin = 'unknown') {
    const itemTemplate = ItemDetails.find(i => i.serial === serial);
    if (!itemTemplate) {
        console.warn(`❌ Aucun item trouvé avec le serial : ${serial}`);
        return null;
    }

    return registerIngameItem(itemTemplate, origin);
}

export function registerIngameItem(itemTemplate, origin = 'unknown') {
    if (!itemTemplate?.serial) return null;
    const serial = itemTemplate.serial;
    const existingRaw = loadFromLocalStorage('IngameItems', []);
    const existing = Array.isArray(existingRaw) ? existingRaw : [];
    const ItemsIDs = existing.map(item => item.itemId);

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

    const newItem = applyItemPower({
        ...itemTemplate,
        itemId,
        origin
    });

    existing.push(newItem);
    saveToLocalStorage('IngameItems', existing);

    console.log(`🧾 Nouvel item créé : ${itemId} (origin: ${origin})`);
    return newItem;
}
