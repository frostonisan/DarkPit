import { ItemDetails } from './itemList.js';
import { createIngameItem } from './items.js';
import { loadFromLocalStorage, saveToLocalStorage, saveItemsData } from './GameStorage.js';
import { entitesNestUp, generateUniqueID } from './entites.js';
import { addEntityToArmyA } from './ArmyAFactory.js';
import { createEntityCodex, EntityCodexDetails, generateEffectDescription, createUmbraBlock } from './GameInit.js';
import { itemApplyEffect } from './itemEffectMecanics.js';
import { itemEffects } from './itemEffects.js';
import { EquipedEntityItems } from './entityUpdatesStorage.js';
import { stuffInteraction } from './equipement.js';
import { glitterStuff } from './meteo.js';
import { stats } from './statsData.js';

export function getIngameItemById(itemId) {
  if (!itemId || typeof itemId !== 'string') {
    console.warn(`❌ itemId invalide :`, itemId);
    return null;
  }

  const norm = (raw) =>
    Array.isArray(raw)
      ? raw
      : (raw && typeof raw === 'object' ? Object.values(raw) : []);

  // Sources modernes
  const data = loadFromLocalStorage('IngameItemsData', {
    items: [], Playerinventory: [], equippedItems: []
  });
  const player = loadFromLocalStorage('PlayerSave', {
    Playerinventory: [], equippedItems: [], items: []
  });

  // Legacy
  const equippedLegacy = loadFromLocalStorage('equippedItems', {});
  const invLegacy = loadFromLocalStorage('IngameItems', []);

  // Concat de toutes les sources
  const pool = [
    ...norm(data.items),
    ...norm(player.Playerinventory),
    ...norm(player.equippedItems),
    ...norm(player.items),
    ...norm(equippedLegacy),
    ...norm(invLegacy),
  ].filter(Boolean);

  // 1) Match direct sur itemId (ex: "i16-639641")
  let found = pool.find(it => it && it.itemId === itemId);
  if (found) return found;

  // 2) Si "e…" → chercher par equippedId
  if (!found && itemId.startsWith('e')) {
    found = pool.find(it => it && it.equippedId === itemId);
    if (found) return found;

    // 2.b) retomber sur l'ID base "i…"
    const baseId = itemId.replace(/^e/, '');
    found = pool.find(it => it && it.itemId === baseId);
    if (found) return found;
  }

  // 3) Si "i…" → tenter l'ID équipé "e…"
  if (!found && itemId.startsWith('i')) {
    const eqId = `e${itemId}`;
    found = pool.find(it => it && it.equippedId === eqId);
    if (found) return found;
  }

  console.warn(`❌ Aucun item trouvé avec l'ID : ${itemId}`);
  return null;
}


let lastDraggedItemId = null;
export function setLastDraggedItemId(id) {
    lastDraggedItemId = id;
}
export function getLastDraggedItemId() {
    return lastDraggedItemId;
}
export function getItemQualityData(quality) {
    const qualities = {
		0: { norm: 'Médiocre', color: '#b0b0b0', class: 'quality-common' },
        1: { norm: 'Commun', color: '#ffffff', class: 'quality-common' },
        2: { norm: 'Inhabituel', color: '#4ce055', class: 'quality-uncommon' },
        3: { norm: 'Rare', color: '#0048ff', class: 'quality-rare' },
        4: { norm: 'Épique', color: '#c000ff', class: 'quality-epic' },
        5: { norm: 'Légendaire', color: '#ffb400', class: 'quality-legendary' },
        6: { norm: 'Mythique', color: '#e60000', class: 'quality-mythic' },
    };

    return qualities[quality] || { norm: 'Inconnu', color: '#777', class: 'quality-unknown' };
}

export function getEntityPriceAndQuality(entity) {
    const power = entity.power ?? 0;
    const level = entity.level.current ?? 1;

    const price = power * 90 + level;

    // Déterminer la rareté sur une échelle de 1 à 6
    const powerClamped = Math.min(power, 100);
    const quality = Math.ceil((powerClamped / 100) * 6) || 1;

    return { price, quality };
}

export function DropInventorytoCodex(codexEntry, entiteId) {
    codexEntry.setAttribute('droppable', 'true');

    codexEntry.addEventListener('dragover', (e) => {
        e.preventDefault();
        codexEntry.classList.add('drag-over');
    });

    codexEntry.addEventListener('dragleave', () => {
        codexEntry.classList.remove('drag-over');
    });

    codexEntry.addEventListener('drop', (e) => {
        e.preventDefault();
        codexEntry.classList.remove('drag-over');

        const usingImg = document.querySelector('.inventory-item-icon.using');
        if (usingImg) usingImg.classList.remove('using');

        let itemId = null;
        let item = null;
        let itemElement = null;

        // 1. dataTransfer
        if (e.dataTransfer) {
            const dataId = e.dataTransfer.getData('text/plain');
            if (dataId) {
                const [serial] = dataId.split('-');
                const found = getIngameItemById(dataId);
                if (found) {
                    itemId = dataId;
                    item = found;
                    itemElement = document.getElementById(dataId);
                }
            }
        }

        // 2. Fallback hover
        if (!itemId || !item) {
            const hovered = document.querySelector('.inventory-item-icon:hover');
            if (hovered && hovered.id) {
                const [serial] = hovered.id.split('-');
				const found = getIngameItemById(hovered.id);
                if (found) {
                    itemId = hovered.id;
                    item = found;
                    itemElement = hovered;
                }
            }
        }

        // 3. Fallback globale
        if (!itemId || !item) {
            const fallbackId = getLastDraggedItemId();
            const found = getIngameItemById(fallbackId);
            if (found) {
                itemId = fallbackId;
                item = found;
                itemElement = document.getElementById(fallbackId);
            } else {
                console.warn("❌ Aucun item trouvé.");
                return;
            }
        }

        // 4. Ciblage entité
        const armyA = loadFromLocalStorage('selectedArmyA', []);
        const targetEntity = armyA.find(e => e.id === entiteId);
        if (!targetEntity) {
            console.warn("❌ Entité cible introuvable.");
            return;
        }

        // 5. Consommable
        if (item.itemType.includes('consumable')) {
            console.log(`🍽️ Utilisation de ${item.displayName} sur ${targetEntity.name}`);

            item.effets.forEach(effet => itemApplyEffect(targetEntity, effet, item));
            removeItem(itemId, { from: 'inventory' });

            console.log(`✅ ${item.displayName} consommé par ${targetEntity.name}`);
            return;
        }

        // 6. Équipement → centralisation
        if (item.itemType.includes('stuff')) {
            console.log(`🛡️ Interaction avec équipement ${item.displayName} sur ${targetEntity.name}`);
           stuffInteraction({
    mode: 'inventory-to-codex', // ou 'double-click', 'codex-to-inventory', etc.
    source: 'inventory',
    target: 'codex',
    itemElement,
    itemData: item,
    targetEntity,
    targetElement: codexEntry,
    event: e
});
            return;
        }

        // 7. Autre cas
        console.warn("❓ Type d'objet non pris en charge.");
    });
}

export function removeItem(itemId, options = {}) {
    const { from = 'inventory' } = options;

    const dropByItemId = (arr) => {
        if (!Array.isArray(arr)) return arr;

        return arr.filter(entry => {
            if (typeof entry === 'string') return entry !== itemId;

            if (entry && typeof entry === 'object') {
                return entry.itemId !== itemId;
            }

            return true;
        });
    };

    // ==== 1) IngameItemsData ====
    const data = loadFromLocalStorage('IngameItemsData', {
        ItemsIDs: [],
        Playerinventory: [],
        equippedItems: [],
        items: []
    });

    const updatedData = {
        ...data,
        ItemsIDs: dropByItemId(data.ItemsIDs),
        Playerinventory: dropByItemId(data.Playerinventory),
        items: dropByItemId(data.items),

        // IMPORTANT :
        // removeItem() ne gère PAS l'équipement.
        // Sinon, équiper un objet puis removeItem(itemId)
        // détruit directement l'objet équipé.
        equippedItems: data.equippedItems
    };

    saveToLocalStorage('IngameItemsData', updatedData);
    console.log(`🗑️ Objet supprimé de l'inventaire : ${itemId} (IngameItemsData)`);

    // ==== 2) PlayerSave ====
    const playerSave = loadFromLocalStorage('PlayerSave', {});
    if (playerSave) {
        playerSave.Playerinventory = dropByItemId(playerSave.Playerinventory || []);
        playerSave.items = dropByItemId(playerSave.items || []);

        // IMPORTANT :
        // Ne pas toucher à playerSave.equippedItems ici.
        // L'équipement/déséquipement doit être géré par equipement.js.
        saveToLocalStorage('PlayerSave', playerSave);

        console.log(`🔄 PlayerSave synchronisé : suppression de ${itemId} uniquement côté inventaire/items.`);
    }

    // ==== 3) Anciennes clés éventuelles ====
    // getIngameItemById lit encore 'IngameItems'.
    // On nettoie l'inventaire legacy, mais PAS 'equippedItems'.
    const legacyIngameItems = loadFromLocalStorage('IngameItems', []);
    if (Array.isArray(legacyIngameItems) && legacyIngameItems.length) {
        const cleaned = dropByItemId(legacyIngameItems);

        if (cleaned.length !== legacyIngameItems.length) {
            saveToLocalStorage('IngameItems', cleaned);
            console.log(`🧹 Legacy: suppression dans IngameItems de ${itemId}`);
        }
    }

    // IMPORTANT :
    // Ne jamais faire ça ici :
    //
    // const legacyEquipped = loadFromLocalStorage('equippedItems', []);
    // saveToLocalStorage('equippedItems', cleanedEq);
    //
    // Sinon tu transformes parfois equippedItems objet -> tableau
    // et tu peux supprimer l'objet qui vient d'être équipé.

    // ==== 4) Nettoyage DOM ciblé ====
    if (from === 'inventory') {
        const inventoryContainer = document.querySelector('.inventory-interface .inventory-content');

        if (inventoryContainer) {
            const itemEl =
                inventoryContainer.querySelector(`[data-item-id="${CSS.escape(itemId)}"]`) ||
                inventoryContainer.querySelector(`img.inventory-item-icon#${CSS.escape(itemId)}`)?.closest('.inventory-item') ||
                inventoryContainer.querySelector(`#${CSS.escape(itemId)}`)?.closest('.inventory-item');

            if (itemEl) {
                itemEl.remove();
            }

            const hasItems = inventoryContainer.querySelectorAll('.inventory-item').length;
            let existingEmptyMsg = inventoryContainer.querySelector('p.empty-msg');

            if (hasItems === 0) {
                if (!existingEmptyMsg) {
                    existingEmptyMsg = document.createElement('p');
                    existingEmptyMsg.textContent = 'Aucun objet';
                    existingEmptyMsg.classList.add('empty-msg');
                    inventoryContainer.appendChild(existingEmptyMsg);
                }
            } else if (existingEmptyMsg) {
                existingEmptyMsg.remove();
            }
        }
    }

    if (from === 'shop') {
        const shopContainer = document.querySelector('.shop-interface');

        if (shopContainer) {
            const itemShopEl = shopContainer.querySelector(`[data-item-id="${CSS.escape(itemId)}"]`);

            if (itemShopEl) {
                itemShopEl.remove();
                console.log(`🏪 Objet retiré de la boutique : ${itemId}`);
            }
        }
    }
}
export function addItemToInventory(itemId) {
    // Chargement + validation initiale
    const save = loadFromLocalStorage('PlayerSave', { Playerinventory: [], equippedItems: [] });
    save.Playerinventory = Array.isArray(save.Playerinventory) ? save.Playerinventory : [];
    save.equippedItems = Array.isArray(save.equippedItems) ? save.equippedItems : [];

    // 🔍 Récupère l'objet complet
    const fullItem = getIngameItemById(itemId);
    if (fullItem && typeof fullItem === 'object') {
        // 🔁 Supprime les éventuels doublons existants
        save.Playerinventory = save.Playerinventory.filter(obj => obj.itemId !== itemId);

        // ✅ Ajoute l’objet complet
        save.Playerinventory.push(fullItem);
        console.log(`🎒 Objet complet ajouté à PlayerSave.Playerinventory : ${itemId}`);
    } else {
        console.warn(`❌ Impossible de récupérer les données complètes de l’item : ${itemId}`);
        return;
    }

    // Sauvegarde dans PlayerSave
    saveToLocalStorage('PlayerSave', save);

    // ✅ Ajout à IngameItemsData (Playerinventory + objet complet dans items[])
    const data = loadFromLocalStorage('IngameItemsData', {
        ItemsIDs: [],
        Playerinventory: [],
        equippedItems: [],
        items: []
    });

    data.Playerinventory = Array.isArray(data.Playerinventory) ? data.Playerinventory : [];
    if (!data.Playerinventory.includes(itemId)) {
        data.Playerinventory.push(itemId);
        console.log("📦 IngameItemsData.Playerinventory mis à jour.");
    }

    data.items = Array.isArray(data.items) ? data.items : [];
    data.items = data.items.filter(obj => obj.itemId !== itemId); // éviter doublons
    data.items.push(fullItem);
    console.log(`🗃️ Objet complet ajouté à IngameItemsData.items : ${itemId}`);

    saveToLocalStorage('IngameItemsData', data);

    // ✅ Affichage DOM
    const inventoryContainer = document.querySelector('.inventory-interface .inventory-content');
    DropEquipementtoInventory(inventoryContainer);
    if (!inventoryContainer) return;

    // Supprime le texte "Aucun objet"
    const emptyMsg = inventoryContainer.querySelector('p');
    if (emptyMsg && emptyMsg.textContent.includes('Aucun objet')) {
        emptyMsg.remove();
    }

    if (fullItem) {
        const itemDiv = document.createElement('div');
itemDiv.classList.add('inventory-item', `quality-${fullItem.itemQuality}`, fullItem.itemType);

        itemDiv.dataset.itemId = itemId;
        itemDiv.setAttribute('draggable', 'false');

        const img = document.createElement('img');
        img.src = fullItem.itemAsset;
        img.alt = fullItem.displayName;
        img.id = itemId;
        img.classList.add('inventory-item-icon', fullItem.functionName);
        img.setAttribute('draggable', 'true');
        setupDragAndDropItem(img, itemId);

        const label = document.createElement('span');
        label.textContent = fullItem.displayName;

        itemDiv.appendChild(img);
        itemDiv.appendChild(label);
        inventoryContainer.appendChild(itemDiv);
		DclicSlottoInventory();
		glitterStuff('.inventory-item.stuff', 3);
bindPersistentDescription(itemDiv, fullItem, itemId, 'item');
}}



export function addEntityLootToArmyA(entity, acquisition = { source: 'loot' }) {
    if (!entity || entity.type !== 'sbire') {
        console.warn("⛔ Entité invalide ou non lootable.");
        return;
    }

    const addedEntity = addEntityToArmyA(entity, 1, acquisition);
    if (!addedEntity) return null;
    console.log(`🎖️ Entité lootée ajoutée à l’armée A : ${entity.name} (serial: ${entity.serial})`);

    // DOM : affichage dans le Codex
    const armyCodexList = document.querySelector('.army-codex-list');
    if (!armyCodexList) {
        console.log("📭 Codex non affiché, affichage annulé.");
        return addedEntity;
    }

    console.log("📦 Codex détecté, tentative d'ajout visuel…");

    const enrichedArmyA = loadFromLocalStorage('selectedArmyA', []);
    console.log("🧠 Armée A enrichie chargée :", enrichedArmyA);

    const entitesMatch = enrichedArmyA.filter(e => e.serial === entity.serial && e.level.current === 1);
    const entite = entitesMatch.at(-1); // Dernière entité ajoutée

    if (!entite) {
        console.warn(`❌ Entité avec ID ${entity.id} non trouvée dans selectedArmyA.`);
        return addedEntity;
    }

    if (armyCodexList.querySelector(`#CodexEntityList_${entite.id}`)) {
        console.log(`⛔ Entrée Codex déjà présente pour l'ID ${entite.id}, aucun doublon créé.`);
        return addedEntity;
    }

    console.log(`✅ Création visuelle du codex pour ${entite.name} (ID: ${entite.id})`);

    const codexEntry = createEntityCodex(entite, armyCodexList);

    codexEntry.addEventListener('click', () => {
        console.log(`🔎 Affichage détails de l'entité ${entite.id}`);
        EntityCodexDetails(entite.id);
    });

    armyCodexList.appendChild(codexEntry);
    console.log(`🆕 Entrée ajoutée dans le DOM pour ${entite.name} (ID: ${entite.id})`);
    return addedEntity;
}
export function clicSelectItem(itemWrapper) {
    // Trouver la classe principale à utiliser pour la sélection
    const selectionClass = Array.from(itemWrapper.classList).find(cls =>
        cls === 'item-wrapper' || cls === 'codex-entity-list' || cls === 'inventory-item-wrapper' || cls === 'equipped-item-wrapper'
    );

    if (!selectionClass) return;

    // Désélectionner tous les items de la même classe
    document.querySelectorAll(`.${selectionClass}.selected`).forEach(el => {
        el.classList.remove('selected');
        el.style.animation = 'none';
        void el.offsetWidth;
        el.style.removeProperty('animation');
    });

    // Sélectionner le nouvel item
    itemWrapper.classList.add('selected');
    itemWrapper.style.animation = 'none';
    void itemWrapper.offsetWidth;
    itemWrapper.style.removeProperty('animation');

    // Activer le bouton vendeur (facultatif selon contexte)
    const sellerButton = document.querySelector('.seller-button');
    if (sellerButton) sellerButton.classList.add('buy');
}

export function createAllItems(
    item,
    {
        source,
        showCost = false,
        onDoubleClick = null
    } = {}
) {
    if (!item) return null;

    const isEntity = item.type === 'sbire';

    const itemWrapper = document.createElement('div');
    itemWrapper.classList.add('item-wrapper');

    itemWrapper.classList.add(
        isEntity
            ? 'entity'
            : `quality-${item.itemQuality}`
    );

    if (!isEntity && Array.isArray(item.itemType)) {
        item.itemType.forEach(type => {
            itemWrapper.classList.add(type);
        });
    }

    let itemId;

    if (isEntity) {
        itemId = `entity-${item.id}`;
    } else {
        const createdItem = createIngameItem(
            item.serial,
            source
        );

        if (!createdItem) return null;

        itemId = createdItem.itemId;
    }

    itemWrapper.dataset.itemId = itemId;

    const image = document.createElement('img');

    image.src = isEntity
        ? item.sprite
        : item.itemAsset;

    image.alt = isEntity
        ? item.name
        : item.displayName;

    image.classList.add('item-icon');

    if (isEntity) {
        image.classList.add(
            'iddle',
            item.class
        );
    } else {
        image.classList.add(item.functionName);
        image.id = itemId;
    }

    itemWrapper.appendChild(image);

    if (showCost) {
        const { price } = isEntity
            ? getEntityPriceAndQuality(item)
            : { price: item.itemCost };

        const cost = document.createElement('div');
        cost.classList.add('item-cost');
        cost.textContent = `${price} 🪙`;

        itemWrapper.appendChild(cost);
    }

    itemWrapper.addEventListener('click', () => {
        clicSelectItem(itemWrapper);
    });

    itemWrapper.addEventListener('dblclick', event => {
        event.preventDefault();
        event.stopPropagation();

        onDoubleClick?.(
            item,
            itemId,
            itemWrapper,
            isEntity
        );
    });

    bindPersistentDescription(
        itemWrapper,
        item,
        itemId,
        isEntity ? 'entity' : 'item'
    );

    return itemWrapper;
}
export function displayShopItems(mosaic, shopRight) {
    mosaic.innerHTML = '';

    const shuffledItems = [...ItemDetails]
        .sort(() => Math.random() - 0.5)
        .slice(0, 6);

    const allEntities = Object
        .values(entitesNestUp)
        .filter(entity => {
            return !entity.isLord && !entity.isDead;
        });

    const selectedEntities = [...allEntities]
        .sort(() => Math.random() - 0.5)
        .slice(0, Math.random() < 0.5 ? 1 : 2);

    const shopPool = [
        ...shuffledItems,
        ...selectedEntities
    ];

    shopPool.forEach(item => {
        const itemWrapper = createAllItems(item, {
            source: 'worldmap-shop',
            showCost: true,

            onDoubleClick: (
                selectedItem,
                itemId
            ) => {
                console.log(
                    '🖱️ Double clic détecté pour achat.'
                );

                BuyItems(selectedItem, itemId);
            }
        });

        if (!itemWrapper) return;

        mosaic.appendChild(itemWrapper);
    });

    const sellerButton =
        document.querySelector('.seller-button');

    if (!sellerButton) return;

    sellerButton.addEventListener('click', () => {
        const selected = document.querySelector(
            '.item-wrapper.selected'
        );

        if (!selected) {
            console.warn('❌ Aucun objet sélectionné.');
            return;
        }

        const itemId = selected.dataset.itemId;
        let item;

        if (itemId.startsWith('entity-')) {
            const entityId = itemId.split('-')[1];

            item = Object
                .values(entitesNestUp)
                .find(entity => {
                    return entity.id == entityId;
                });
        } else {
            item = getIngameItemById(itemId);
        }

        if (!item) {
            console.warn(
                `❌ Aucun objet ou entité trouvé avec l'ID : ${itemId}`
            );

            return;
        }

        BuyItems(item, itemId);

        selected.classList.remove('selected');
        selected.style.removeProperty('animation');
        sellerButton.classList.remove('buy');
    });
}
export function acquireItem(item, origin = 'unknown') {
    if (!item?.serial) {
        console.warn('❌ Objet sans serial, acquisition impossible.', item);
        return null;
    }

    const createdItem = createIngameItem(item.serial, origin);

    if (!createdItem?.itemId) {
        console.warn(
            `❌ Impossible de créer l’instance de l’objet ${item.serial}.`
        );

        return null;
    }

    addItemToInventory(createdItem.itemId);
    saveItemsData();

    console.log(
        `🎒 Objet acquis et conservé : ${createdItem.displayName} (${createdItem.itemId}, origine: ${origin})`
    );

    return createdItem;
}
export function BuyItems(item, sourceId = null) {
    if (!item) {
        console.warn('❌ Objet ou entité invalide pour achat.');
        return;
    }

    const isEntity = item.type === 'sbire';

    if (isEntity) {
        const lootEntity = {
            ...item,
            type: 'sbire',
            side: 'A',
            id: generateUniqueID()
        };

        addEntityLootToArmyA(lootEntity, {
            source: 'shop',
            sourceId
        });

        console.log(
            `🧬 Achat confirmé pour ${lootEntity.name} (ID : ${lootEntity.id})`
        );
    } else {
        const created = acquireItem(item, 'shop');

        if (!created) {
            return;
        }

        console.log(
            `🛒 Achat confirmé pour ${created.displayName} (ID : ${created.itemId})`
        );
    }

    if (sourceId) {
        removeItem(sourceId, { from: 'shop' });
    }
}
export function createEntityDescription(entity, hoveredElement, options = {}) {
    const { persistent = false } = options;

    const helperContainer = document.querySelector('.Game-helper');
    if (!helperContainer) {
        console.warn('createEntityDescription: .Game-helper introuvable');
        return;
    }

    const entityDescId = `entity-${entity.id}`;
    const className = getRawItemDescriptionClass(entityDescId);

    const existing = helperContainer.querySelector(`.${className}`);
    if (existing) existing.remove();

    const detailCard = document.createElement('div');
    detailCard.classList.add('shop-item-card', 'item-description-card', 'entity', className);
    if (persistent) detailCard.classList.add('persistent');

    detailCard.style.position = 'absolute';
    detailCard.dataset.itemId = entityDescId;

    const name = document.createElement('h3');
    name.textContent = entity.nickname ?? entity.name;
    detailCard.appendChild(name);

    const type = document.createElement('p');
    type.textContent = `Type : Entité`;
    detailCard.appendChild(type);

    const { quality } = getEntityPriceAndQuality(entity);
    const { norm, color } = getItemQualityData(quality);

    const rarity = document.createElement('p');
    rarity.innerHTML = `Qualité : <span style="color: ${color}; font-weight: bold;">${norm}</span>`;
    detailCard.appendChild(rarity);

    const level = document.createElement('p');
    level.textContent = `Niveau : ${entity.level.current}`;
    detailCard.appendChild(level);

    const hp = document.createElement('p');
    hp.textContent = `HP : ${entity.stats.HP.current} / ${entity.stats.HP.max}`;
    detailCard.appendChild(hp);

    if (entity.stats.extraLife) {
        const extralife = document.createElement('p');
        extralife.textContent = `Vie bonus : ${entity.stats.extraLife.current} / ${entity.stats.extraLife.max}`;
        detailCard.appendChild(extralife);
    }

    const stats = document.createElement('p');
    stats.textContent = `Dégâts : ${entity.stats.piercingDamage} | Vitesse : ${entity.stats.speed}`;
    detailCard.appendChild(stats);

    if (entity.classe || entity.role) {
        const role = document.createElement('p');
        role.textContent = `Rôle : ${entity.role ?? entity.classe}`;
        detailCard.appendChild(role);
    }

    positionHelperCard(detailCard, hoveredElement);
    helperContainer.appendChild(detailCard);

    return detailCard;
}

function getStatLabelFromKey(statKey) {
  const stat = stats.find(s => s.key === statKey);
  return stat ? stat.name : statKey;
}
const ITEM_DESC_MAX_PINNED = 2;
const pinnedItemDescriptions = [];
let itemDescriptionClickTimer = null;

function getItemDescriptionId(itemId) {
  return `itemDescription-${CSS.escape(String(itemId || 'empty'))}`;
}

function getRawItemDescriptionClass(itemId) {
  return `itemDescription-${String(itemId || 'empty').replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

function isEquipmentElement(el) {
    return !!el?.closest?.(
        '.inventory-item, .item-wrapper, .stuff-slot, .stuff-item-wrapper, .inventory-item-icon, .shop-item-card.item-description-card'
    );
}
function cleanupDetachedPinnedDescriptions() {
  for (let i = pinnedItemDescriptions.length - 1; i >= 0; i--) {
    const entry = pinnedItemDescriptions[i];

    if (!entry.anchor || !document.body.contains(entry.anchor)) {
      entry.card?.remove();
      pinnedItemDescriptions.splice(i, 1);
    }
  }
}

export function clearItemDescriptions() {
  const helperContainer = document.querySelector('.Game-helper');
  if (!helperContainer) return;

  helperContainer
    .querySelectorAll('.shop-item-card.item-description-card')
    .forEach(card => card.remove());

  pinnedItemDescriptions.length = 0;
}

export function removePinnedItemDescription(itemId) {
  const index = pinnedItemDescriptions.findIndex(entry => entry.itemId === itemId);
  if (index === -1) return false;

  pinnedItemDescriptions[index].card?.remove();
  pinnedItemDescriptions.splice(index, 1);
  return true;
}

export function pinItemDescription(item, itemId, anchorElement) {
  cleanupDetachedPinnedDescriptions();

  if (!item || !itemId) return;

  // Si déjà ouverte : on la vire
  if (removePinnedItemDescription(itemId)) return;

  const card = createItemDescription(item, itemId, anchorElement, {
    persistent: true
  });

  if (!card) return;

  pinnedItemDescriptions.push({
    itemId,
    card,
    anchor: anchorElement
  });

  while (pinnedItemDescriptions.length > ITEM_DESC_MAX_PINNED) {
    const removed = pinnedItemDescriptions.shift();
    removed?.card?.remove();
  }
}
export function pinEntityDescription(entity, entityId, anchorElement) {
    cleanupDetachedPinnedDescriptions();

    if (!entity || !entityId) return;

    if (removePinnedItemDescription(entityId)) return;

    const card = createEntityDescription(entity, anchorElement, {
        persistent: true
    });

    if (!card) return;

    pinnedItemDescriptions.push({
        itemId: entityId,
        card,
        anchor: anchorElement
    });

    while (pinnedItemDescriptions.length > ITEM_DESC_MAX_PINNED) {
        const removed = pinnedItemDescriptions.shift();
        removed?.card?.remove();
    }
}

export function setupEntityDescriptionClick(entityElement, entity, entityId) {
    if (!entityElement || entityElement.dataset.entityDescBound === '1') return;

    entityElement.dataset.entityDescBound = '1';

    entityElement.addEventListener('click', (event) => {
        event.stopPropagation();

        clearTimeout(itemDescriptionClickTimer);

        itemDescriptionClickTimer = setTimeout(() => {
            pinEntityDescription(entity, entityId, entityElement);
        }, 180);
    });

    entityElement.addEventListener('dblclick', (event) => {
        event.preventDefault();
        event.stopPropagation();

        clearTimeout(itemDescriptionClickTimer);
        clearItemDescriptions();
    });
}
export function setupItemDescriptionClick(itemElement, item, itemId) {
  if (!itemElement || itemElement.dataset.itemDescBound === '1') return;

  itemElement.dataset.itemDescBound = '1';

  itemElement.addEventListener('click', (event) => {
    event.stopPropagation();

    clearTimeout(itemDescriptionClickTimer);

    itemDescriptionClickTimer = setTimeout(() => {
      pinItemDescription(item, itemId, itemElement);
    }, 180);
  });

  itemElement.addEventListener('dblclick', (event) => {
    event.preventDefault();
    event.stopPropagation();

    clearTimeout(itemDescriptionClickTimer);

    // Double clic sur item déjà ouvert : on vire tout.
    clearItemDescriptions();
  });
}
export function bindPersistentDescription(element, data, id, type = 'item') {
    if (!element || !data || !id) return;
    if (element.dataset.persistentDescBound === '1') return;

    element.dataset.persistentDescBound = '1';

    element.addEventListener('mouseenter', () => {
        if (type === 'entity') {
            createEntityDescription(data, element);
        } else {
            createItemDescription(data, id, element);
        }
    });

    element.addEventListener('mouseleave', () => {
        removeItemDescription(id);
    });

    element.addEventListener('click', (event) => {
        event.stopPropagation();

        clearTimeout(itemDescriptionClickTimer);

        itemDescriptionClickTimer = setTimeout(() => {
            if (type === 'entity') {
                pinEntityDescription(data, id, element);
            } else {
                pinItemDescription(data, id, element);
            }
        }, 180);
    });

    element.addEventListener('dblclick', (event) => {
        event.preventDefault();
        event.stopPropagation();

        clearTimeout(itemDescriptionClickTimer);
        clearItemDescriptions();
    });
}
// Clic dans le vide = toutes les descriptions dégagent
if (!window.__itemDescriptionGlobalClickBound) {
  window.__itemDescriptionGlobalClickBound = true;

  document.addEventListener('click', (event) => {
    cleanupDetachedPinnedDescriptions();

    const clickedInsideDescription = event.target.closest?.('.shop-item-card.item-description-card');

    if (clickedInsideDescription) return;

    if (!isEquipmentElement(event.target)) {
      clearItemDescriptions();
    }
  });
}

export function createItemDescription(item, itemId = item?.itemId || 'empty', hoveredElement, options = {}) {
  const { persistent = false } = options;
  const helperContainer = document.querySelector('.Game-helper');
  if (!helperContainer) { 
    console.warn('createItemDescription: .Game-helper introuvable'); 
    return; 
  }

  // Empêche doublons
 const className = getRawItemDescriptionClass(itemId);
  
  const existing = helperContainer.querySelector(`.${className}`);
  if (existing) existing.remove();

  const detailCard = document.createElement('div');
  detailCard.classList.add('shop-item-card', 'item-description-card', className);
if (persistent) detailCard.classList.add('persistent');
  detailCard.style.position = 'absolute';
detailCard.dataset.itemId = itemId; 
// --- Slot vide ---
if (!item) {
  return;
}
  // --- Types robustes ---
  const types = Array.isArray(item.itemType) ? item.itemType : [item.itemType].filter(Boolean);
  types.forEach(t => detailCard.classList.add(t));

  // --- Qualité + fallback ---
  const { norm, color } = (typeof getItemQualityData === 'function'
    ? getItemQualityData(item.itemQuality)
    : { norm: '—', color: '#999' });

  const name = document.createElement('div');
  name.classList.add('item-name');
  name.style.color = color;
  name.textContent = item.displayName;

  const type = document.createElement('div');
  type.classList.add('item-type');
  type.textContent = types.length
    ? types.map(t => t === 'consumable' ? 'Objet consommable' : t === 'stuff' ? 'Équipement' : t).join(', ')
    : 'Objet';

  const quality = document.createElement('div');
  quality.classList.add('item-quality');
  quality.textContent = `Qualité : ${norm}`;

  const desc = document.createElement('div');
  desc.classList.add('item-lore');
  desc.textContent = item.itemDescription || '';

  detailCard.appendChild(name);
  detailCard.appendChild(type);
  detailCard.appendChild(quality);

  // --- Effets consommables ---
  if (Array.isArray(item.effets)) {
    let hasDescription = false;
    item.effets.forEach(effectName => {
      const effectData = Array.isArray(itemEffects) ? itemEffects.find(e => e.effectName === effectName) : null;
      if (effectData?.effectDescription && typeof generateEffectDescription === 'function') {
        const html = generateEffectDescription(effectData, null, item);
        detailCard.insertAdjacentHTML('beforeend', html);
        hasDescription = true;
      }
    });
    if (!hasDescription) {
      const unknown = document.createElement('p');
      unknown.textContent = "Effets de l'objet inconnus";
      unknown.classList.add('unknown-effect');
      detailCard.appendChild(unknown);
    }
  }

  // --- Effets stuff (bonus stat) ---
  if (types.includes('stuff') && Array.isArray(item.Stuffeffets)) {
    const attributStatsDiv = document.createElement('div');
    attributStatsDiv.classList.add('item-stats-block', 'stuff');
    item.Stuffeffets.forEach(effect => {
      if (effect?.type === 'stat-buff') {
        const { stat, value } = effect;
        const fakeEntity = { name: item.displayName, stats: { [stat]: value }, speed: 1000 };
   createUmbraBlock(
  attributStatsDiv,
  getStatLabelFromKey(stat),
  () => Number(value),
  fakeEntity,
  stat,
  false
);
      }
    });
    detailCard.appendChild(attributStatsDiv);
  }

 positionHelperCard(detailCard, hoveredElement);

  detailCard.appendChild(desc);
  helperContainer.appendChild(detailCard);
return detailCard;
}

function positionHelperCard(detailCard, hoveredElement) {
  if (!hoveredElement || !detailCard) return;

  const rect = hoveredElement.getBoundingClientRect();

  // Position initiale (en bas à droite de l’élément survolé)
  let top = rect.bottom + window.scrollY - 150; 
  let left = rect.right + window.scrollX + 5;

  // Empêcher le dépassement écran
  const maxLeft = window.innerWidth + window.scrollX - detailCard.offsetWidth - 10;
  const maxTop = window.innerHeight + window.scrollY - detailCard.offsetHeight - 10;

  detailCard.style.position = 'absolute';
  detailCard.style.left = `${Math.min(left, maxLeft)}px`;
  detailCard.style.top = `${Math.min(top, maxTop)}px`;
}


export function equippedHoverDescription() {
    const equippedItemsRaw = loadFromLocalStorage('equippedItems', {});

    const equippedItemsArray = Array.isArray(equippedItemsRaw)
        ? equippedItemsRaw
        : Object.values(equippedItemsRaw || {});

    const equippedItems = {};

    equippedItemsArray.forEach((item) => {
        if (!item) return;

        const key = item.equippedId || (item.itemId ? `e${item.itemId}` : null);
        if (!key) return;

        equippedItems[key] = item;
    });

    console.log('[Hover] Items équipés chargés par equippedId :', equippedItems);

    document.querySelectorAll('.stuff-slot').forEach((slot) => {
        const wrapper = slot.querySelector('.stuff-item-wrapper');

        let item = null;
        let itemId = 'empty';

        if (wrapper) {
            const equippedId = wrapper.dataset.stuffId;

            if (equippedId) {
                item = equippedItems[equippedId] || null;
                itemId = equippedId;
            }
        }

if (wrapper && item) {
    bindPersistentDescription(wrapper, item, itemId, 'item');
}
    });
}

export function removeItemDescription(itemId = null) {
    const helperContainer = document.querySelector('.Game-helper');
    if (!helperContainer) return;

    if (!itemId) {
        helperContainer
            .querySelectorAll('.shop-item-card.item-description-card:not(.persistent)')
            .forEach(card => card.remove());
        return;
    }

    const className = getRawItemDescriptionClass(itemId);

    helperContainer
        .querySelectorAll(`.shop-item-card.item-description-card.${className}:not(.persistent)`)
        .forEach(card => card.remove());
}
export function setupDragAndDropItem(imgElement, itemId) {
    if (!imgElement || !itemId || itemId.startsWith('http')) {
        console.warn(`❌ setupDragAndDropItem : élément ou itemId invalide :`, imgElement, itemId);
        return;
    }

    imgElement.setAttribute('draggable', 'true');

    // Nettoyage des anciens écouteurs éventuels
    imgElement.removeEventListener('dragstart', imgElement._dragStartHandler || (() => {}));
    imgElement.removeEventListener('dragend', imgElement._dragEndHandler || (() => {}));

    const dragStartHandler = (e) => {
        e.dataTransfer.setData('text/plain', itemId);
        e.dataTransfer.effectAllowed = 'shift';
        imgElement.classList.add('using');
        setLastDraggedItemId(itemId);
        console.log(`🚚 Drag lancé pour ${itemId}`);
    };

    const dragEndHandler = () => {
        imgElement.classList.remove('using');
    };

    imgElement.addEventListener('dragstart', dragStartHandler);
    imgElement.addEventListener('dragend', dragEndHandler);

    // Stocke les handlers sur l’élément pour éviter les doublons plus tard
    imgElement._dragStartHandler = dragStartHandler;
    imgElement._dragEndHandler = dragEndHandler;
}
const getDraggedItemIdFromDOM = () => {
    // Prend le premier élément draggable avec un ID au format item
    const candidates = document.querySelectorAll('img.inventory-item-icon[draggable="true"]');

    for (const el of candidates) {
        if (el.matches('.using') || document.activeElement === el || el.matches(':hover')) {
            if (el.id && /^e?i\d+-\d+$/.test(el.id)) {
                return el.id;
            }
        }
    }

    // Fallback : si aucun ne correspond, renvoie null
    return null;
};
export function enableDropZone({ element, onDrop, zoneLabel = '' }) {
    if (!element) {
        console.warn(`❌ Zone drop non trouvée (${zoneLabel})`);
        return;
    }

    // 🔍 Fonction robuste pour lire l'élément glissé dans le DOM
    const getDraggedItemIdFromDOM = () => {
        // Sélectionne tous les éléments potentiellement valides
        const candidates = document.querySelectorAll('img.inventory-item-icon[draggable="true"]');

        for (const el of candidates) {
            const valid = el.classList.contains('using') || el.matches(':hover') || document.activeElement === el;
            if (valid && el.id && /^e?i\d+-\d+$/.test(el.id)) {
                return el.id;
            }
        }

        return 'inconnu';
    };

    element.addEventListener('dragover', (e) => {
        e.preventDefault();
        const draggedItemId = getDraggedItemIdFromDOM();

        if (element.dataset.over !== 'true') {
            element.classList.add('drag-over');
            element.dataset.over = 'true';

            console.log(`🟨 dragover de ${draggedItemId} sur ${zoneLabel || element.id}`);
        }
    });

    element.addEventListener('dragleave', () => {
        const draggedItemId = getDraggedItemIdFromDOM();
        element.classList.remove('drag-over');
        element.dataset.over = 'false';

        console.log(`⬛ dragleave de ${draggedItemId} sur ${zoneLabel || element.id}`);
    });

    element.addEventListener('drop', (e) => {
        e.preventDefault();
        element.classList.remove('drag-over');
        element.dataset.over = 'false';

        const draggedItemId = e.dataTransfer.getData('text/plain');

        if (!draggedItemId || !/^e?i\d+-\d+$/.test(draggedItemId)) {
            console.warn(`❌ ID d’item invalide ou absent au drop :`, draggedItemId);
            return;
        }

        const draggedItem = document.getElementById(draggedItemId);
        if (!draggedItem) {
            console.warn(`❌ Élément DOM introuvable pour ID :`, draggedItemId);
            return;
        }

        console.log(`📥 drop sur ${zoneLabel || element.id} avec item ${draggedItemId}`);
        onDrop(e, element);
    });
}
function getItemFromDropEvent(e) {
    const itemId = e.dataTransfer?.getData('text/plain');
    
    if (!itemId || !itemId.includes('-') || itemId.startsWith('http')) {
        console.warn(`❌ itemId invalide : ${itemId}`);
        return null;
    }

    const itemElement = document.getElementById(itemId);
    const item = getIngameItemById(itemId);

    if (!itemElement || !item) {
        console.warn(`❌ Élément ou données de l’item introuvables : ${itemId}`);
        return null;
    }

    return { itemId, itemElement, item };
}


export function DropEquipementtoInventory() {
    const allSlots = document.querySelectorAll('.stuff-slot');
    console.log('🔍 Recherche de slots .stuff-slot...');
    console.log('🧾 Slots trouvés :', allSlots);

    if (!allSlots.length) {
        console.warn('⚠️ Aucun slot trouvé pour activer le drop.');
        return;
    }

    console.log(`✅ ${allSlots.length} slots détectés pour drop vers inventaire.`);

    allSlots.forEach(slot => {
        console.log(`⚙️ Réinitialisation des events sur slot : ${slot.id}`);

 const newSlot = slot.cloneNode(false); // ne garde pas les enfants (juste la structure)
newSlot.innerHTML = slot.innerHTML; // garde le contenu visuel
slot.replaceWith(newSlot);

// 🩺 Et si un item est présent dans le slot, réinitialise son drag
const img = newSlot.querySelector('img.inventory-item-icon[draggable="true"]');
if (img && img.id) {
    setupDragAndDropItem(img, img.id);
}
        const slotId = newSlot.id;

        enableDropZone({
            element: newSlot,
            zoneLabel: slotId,
            onDrop: (e, el) => {
               
			   const dropData = getItemFromDropEvent(e);
if (!dropData) return;

const { itemId, itemElement, item } = dropData;

                if (!itemElement || !item) {
                    console.warn(`❌ Données manquantes pour l'item ${itemId}`);
                    return;
                }

                const entiteId = el.id.split('-')[1];
                const rawArmy = loadFromLocalStorage('selectedArmyA', []);
                const armyA = Array.isArray(rawArmy) ? rawArmy : rawArmy.entities || [];
                const targetEntity = armyA.find(e => e.id == entiteId);

                if (!targetEntity) {
                    console.warn(`❌ Aucune entité trouvée avec ID ${entiteId}`);
                    return;
                }

                stuffInteraction({
                    mode: 'inventory-to-codex',
                    source: 'inventory',
                    target: 'codex',
                    itemElement,
                    itemData: item,
                    targetEntity,
                    targetElement: el,
                    event: e
                });
            }
        });
    });
}
export function DropFromCodexToInventory() {
    const inventoryZone = document.querySelector('.inventory-content'); // adapte si besoin

    if (!inventoryZone) {
        console.warn('❌ Zone d’inventaire introuvable');
        return;
    }

    enableDropZone({
        element: inventoryZone,
        zoneLabel: 'inventory',
onDrop: (e, el) => {
    const dropData = getItemFromDropEvent(e);
    if (!dropData) return;

    const { itemId, itemElement, item } = dropData;

    const slotElement = itemElement.closest('.stuff-slot');
    if (!slotElement) {
        console.warn(`❌ Impossible de retrouver le slot d'origine pour l’item : ${itemId}`);
        return;
    }

    const entiteId = slotElement.id.split('-')[1];
    const rawArmy = loadFromLocalStorage('selectedArmyA', []);
    const armyA = Array.isArray(rawArmy) ? rawArmy : rawArmy.entities || [];
    const targetEntity = armyA.find(e => e.id == entiteId);

    stuffInteraction({
        mode: 'codex-to-inventory',
        source: 'codex',
        target: 'inventory',
        itemElement,
        itemData: item,
        targetEntity,
        targetElement: slotElement,
        event: e
    });
}

    });
}
function detectStuffInteractionContext(itemElement) {
    const isInInventory = itemElement.closest('.inventory');
    const isInSlot = itemElement.closest('.stuff-slot');

    if (isInInventory) {
        return {
            source: 'inventory',
            target: 'codex'
        };
    } else if (isInSlot) {
        return {
            source: 'codex',
            target: 'inventory'
        };
    } else {
        return {
            source: 'unknown',
            target: 'unknown'
        };
    }
}
export function DclicSlottoInventory() {
const allIcons = document.querySelectorAll('.inventory-item-icon');

    allIcons.forEach(icon => {
        icon.addEventListener('dblclick', (e) => {
            const itemId = e.currentTarget.id;
            const itemElement = document.getElementById(itemId);
            const item = getIngameItemById(itemId);
            if (!item || !itemElement) return;

            // 🧠 Détection dynamique
            const { source, target } = detectStuffInteractionContext(itemElement);

            // 🎯 Trouver l'entité concernée (depuis stuff-slot ou sélection côté inventaire)
            const slotElement = itemElement.closest('.stuff-slot');
            const entiteId = slotElement?.id?.split('-')[1];
            const army = loadFromLocalStorage('selectedArmyA', []);
            const entity = entiteId
                ? army.find(e => e.id == entiteId)
                : army.find(e => e.isSelected); // si inventaire → entité sélectionnée

            if (!entity) {
                              return;
            }

            stuffInteraction({
                mode: 'double-click',
                source,
                target,
                itemElement,
                itemData: item,
                targetEntity: entity,
                targetElement: slotElement,
                event: e
            });
        });
    });
}

export function sanitizeItemId() {
    const playerSave = loadFromLocalStorage('PlayerSave', {});

    const seenSuffixes = new Set();
    let modified = false;

    console.group('🧹 Sécurité : Vérification des doublons dans PlayerSave');

    // Nettoyage de Playerinventory
    if (Array.isArray(playerSave.Playerinventory)) {
        const cleanedInventory = [];
        for (const item of playerSave.Playerinventory) {
            const itemId = item?.itemId;
            const suffix = itemId?.split('-')[1];
            if (!suffix) continue;

            if (seenSuffixes.has(suffix)) {
                console.warn(`⚠️ Doublon dans Playerinventory → ${itemId} supprimé`);
                modified = true;
            } else {
                seenSuffixes.add(suffix);
                cleanedInventory.push(item);
            }
        }
        playerSave.Playerinventory = cleanedInventory;
    }

    // Nettoyage de equippedItems
    if (Array.isArray(playerSave.equippedItems)) {
        const cleanedEquipped = [];
        for (const item of playerSave.equippedItems) {
            const itemId = item?.itemId;
            const suffix = itemId?.split('-')[1];
            if (!suffix) continue;

            if (seenSuffixes.has(suffix)) {
                console.warn(`⚠️ Doublon dans equippedItems → ${itemId} supprimé`);
                modified = true;
            } else {
                seenSuffixes.add(suffix);
                cleanedEquipped.push(item);
            }
        }
        playerSave.equippedItems = cleanedEquipped;
    }

    // Nettoyage de items
    if (Array.isArray(playerSave.items)) {
        const cleanedItems = [];
        for (const item of playerSave.items) {
            const itemId = item?.itemId;
            const suffix = itemId?.split('-')[1];
            if (!suffix) continue;

            if (seenSuffixes.has(suffix)) {
                console.warn(`⚠️ Doublon dans items → ${itemId} supprimé`);
                modified = true;
            } else {
                seenSuffixes.add(suffix);
                cleanedItems.push(item);
            }
        }
        playerSave.items = cleanedItems;
    }

    // 🔐 Force l'existence des trois tableaux même si absents
    playerSave.Playerinventory ??= [];
    playerSave.equippedItems ??= [];
    playerSave.items ??= [];

    if (modified) {
        saveToLocalStorage('PlayerSave', playerSave);
        console.log('✅ Nettoyage effectué. PlayerSave mis à jour.');
    } else {
        console.log('✅ Aucun doublon détecté dans PlayerSave.');
    }

    console.groupEnd();
}
