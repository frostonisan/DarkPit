// Player inventory, search, sorting, shop and battle satchel.
import { buildEssenceInventoryHelperHTML } from '../data/helpers.js';
import { cachedResourceUrl } from '../data/loaderList.js';
import { attackDetails } from '../data/attackList.js';
import { getScoredItemQuality } from '../procedural/proc-bareme.js';
import { loadFromLocalStorage, saveToLocalStorage } from "../storage/gameStorage.js";
import { normalizeStatKey } from "../entities/rules.js";
import { entites } from "../entities/runtime.js";
import { readAttackDefinitionKey, ensureEntityAttackInstances } from "../combat/attackResolution.js";
import {
  displayShopItems,
  createItemDescription,
  removeItemDescription,
  DropFromCodexToInventory,
  dropInventoryOnEntity,
  updateEntityItemDropVisual,
  setupDragAndDropItem,
  DropEquipementtoInventory,
  DclicSlottoInventory,
  getIngameItemById,
  bindPersistentDescription,
  getBattleInventoryState,
  moveBattleItem,
  dropBattleItemOnHex,
  recoverBattleItem,
  useConsumableItem,
  getLastDraggedItemId,
  setLastDraggedItemId,
  updateConsumableDropVisual,
  clearConsumableDropVisuals,
  createItemPowerValue,
} from '../items/itemManager.js';
import { calculateItemPower } from '../items/items.js';
import { glitterStuff } from '../biome/meteo.js';
import { beginDragHelperCleanup, endDragHelperCleanup } from "./drag.js";
import {
  calculateEntityLinkedEssenceAvailability,
  createEssenceSpriteHTML,
  createLinkedEssenceHelperHTML,
  createUniversalEssenceAmbianceHTML,
  createUniversalEssenceHelperHTML,
  getLinkedEssenceHelperClass,
  getUniversalEssenceHelperClass,
  getAttackEssenceSocketViewModel,
  getEssenceItemDefinition,
  loadUniversalEssenceItems,
} from "../items/essences.js";
import { getStageAccess, requireSafeMenuAccess } from "../app/state.js";
import { statsByKey } from "./statistics/helpers.js";
import {
  toggleWindowInMenuMap,
  reorderMenuMapChildren,
  MenuContainerDisplayRules,
  enforceMenuDisplayRules,
  getInventoryEntityName,
  readInventoryArmy,
  findInventoryEntityById,
} from "./navigation.js";
import { getInventoryAttackKeyCandidates } from "./attacks.js";
import { openInventoryEntityCodexTarget } from "./codex/index.js";

function createBattleSatchelView(combat = false) {
    const bag = document.createElement('section');
    bag.className = `battle-satchel battle-satchel--${combat ? 'combat' : 'inventory'}`;
    bag.setAttribute('aria-label', 'Sacoche de bataille');
    const title = document.createElement('div');
    title.className = 'battle-satchel-title';
    title.textContent = 'Inventaire de combat';
    bag.appendChild(title);
    const body = document.createElement('div');
    body.className = 'battle-satchel-body';
    const border = document.createElement('div');
    border.className = 'battle-satchel-border';
    border.setAttribute('aria-hidden', 'true');
    const borderImage = document.createElement('img');
    borderImage.src = cachedResourceUrl('./media/assets/ui/sacoche-first-border.png');
    borderImage.alt = '';
    borderImage.draggable = false;
    border.appendChild(borderImage);
    const slots = document.createElement('div');
    slots.className = 'battle-satchel-slots';
    body.append(border, slots);
    bag.appendChild(body);
    updateBattleSatchelView(bag, getBattleInventoryState().battleSlots);
    return bag;
}

function updateBattleSatchelView(bag, itemIds) {
    const slots = bag.querySelector('.battle-satchel-slots');
    while (slots.children.length > itemIds.length) {
        removeItemDescription(slots.lastElementChild.dataset.itemId);
        slots.lastElementChild.remove();
    }
    itemIds.forEach((itemId, index) => {
        let slot = slots.children[index];
        if (!slot) {
            slot = document.createElement('div');
            slot.className = 'battle-satchel-slot';
            slot.dataset.battleSlot = index;
            slot.title = `Sacoche : emplacement ${index + 1}`;
            slots.appendChild(slot);
        }
        if ((slot.dataset.itemId || '') === (itemId || '') && slot.childElementCount) return;
        if (slot.dataset.itemId) removeItemDescription(slot.dataset.itemId);
        slot.replaceChildren();
        delete slot.dataset.itemId;
        const item = itemId && getIngameItemById(itemId);
        if (item) {
            slot.dataset.itemId = itemId;
            const img = document.createElement('img');
            img.src = cachedResourceUrl(item.itemAsset);
            img.alt = item.displayName;
            img.className = 'inventory-item-icon battle-satchel-item';
            img.dataset.dragItemId = itemId;
            setupDragAndDropItem(img, itemId);
            img.addEventListener('mouseenter', () => createItemDescription(getIngameItemById(itemId), itemId, img));
            img.addEventListener('mouseleave', () => removeItemDescription(itemId));
            slot.appendChild(img);
        } else {
            const number = document.createElement('span');
            number.className = 'battle-satchel-empty';
            number.textContent = index + 1;
            slot.appendChild(number);
        }
    });
}

function refreshBattleSatchelViews(event) {
    if (event?.type === 'playerInfoUpdated' && event.detail?.key !== 'battleSlotCount') return;
    const { battleSlots } = getBattleInventoryState();
    document.querySelectorAll('.battle-satchel').forEach(bag => {
        updateBattleSatchelView(bag, battleSlots);
    });
}

function clearBattleItemDropPreview() {
    document.querySelectorAll('.battle-item-drop-target').forEach(hex => {
        hex.classList.remove('hovered', 'battle-item-drop-target');
    });
    document.querySelectorAll('.battle-item-drop-recipient').forEach(entity => {
        entity.classList.remove('battle-item-drop-recipient');
    });
}

function PlayerInventory(menuIcons) {
    if (!getStageAccess().menusAllowed) return;
    if (!menuIcons) {
        console.error("⚠️ Le conteneur menuIcons est manquant !");
        return;
    }

    if (!menuIcons.querySelector('.player-inventory-icon')) {
        const inventoryIconImg = document.createElement('img');
        inventoryIconImg.className = 'player-inventory-icon';
        inventoryIconImg.src = cachedResourceUrl('./media/assets/ui/picto-inventory.svg');
        inventoryIconImg.alt = 'Inventaire';
       inventoryIconImg.addEventListener('click', () => {
    toggleWindowInMenuMap('inventory-interface', (MenuMapContainer) => {
        createInventory(MenuMapContainer);
    });
});
        menuIcons.appendChild(inventoryIconImg);
    }
}

const PLAYER_INVENTORY_TABS = Object.freeze([
    { key: 'all', label: 'Tout' },
    { key: 'objects', label: 'Objets' },
    { key: 'equipment', label: 'Équipement' },
    { key: 'essences', label: 'Essences' },
]);

const PLAYER_INVENTORY_USED_FILTER_LABELS = Object.freeze({
    all: 'Utilisé',
    objects: 'Équipé',
    equipment: 'Équipé',
    essences: 'Enchâssée',
});

const PLAYER_INVENTORY_ESSENCE_COLORS = ['red', 'blue', 'yellow'];

const PLAYER_INVENTORY_STATE_KEY = 'PlayerInventoryState';

const PLAYER_INVENTORY_SORT_KEYS = Object.freeze(['power', 'alpha']);

function isPlayerInventoryTabKey(tabKey = '') {
    return PLAYER_INVENTORY_TABS.some(tab => tab.key === tabKey);
}

function isPlayerInventorySortKey(sortKey = '') {
    return PLAYER_INVENTORY_SORT_KEYS.includes(sortKey);
}

function getDefaultInventorySortDirection(sortKey = 'power') {
    return sortKey === 'alpha' ? 'asc' : 'desc';
}

function normalizeInventorySortDirection(direction = '', sortKey = 'power') {
    return direction === 'asc' || direction === 'desc'
        ? direction
        : getDefaultInventorySortDirection(sortKey);
}

function readPlayerInventoryState() {
    const rawState = loadFromLocalStorage(PLAYER_INVENTORY_STATE_KEY, {});
    const showUsedByTab = rawState?.showUsedByTab && typeof rawState.showUsedByTab === 'object'
        ? rawState.showUsedByTab
        : {};
    const activeTab = isPlayerInventoryTabKey(rawState?.activeTab)
        ? rawState.activeTab
        : 'all';
    const sortKey = isPlayerInventorySortKey(rawState?.sortKey)
        ? rawState.sortKey
        : 'power';

    return {
        activeTab,
        searchQuery: String(rawState?.searchQuery || ''),
        sortKey,
        sortDirection: normalizeInventorySortDirection(rawState?.sortDirection, sortKey),
        showUsedByTab: {
            all: showUsedByTab.all === true,
            objects: showUsedByTab.objects === true,
            equipment: showUsedByTab.equipment === true,
            essences: showUsedByTab.essences === true,
        },
    };
}

function savePlayerInventoryState(nextState = {}) {
    const current = readPlayerInventoryState();
    const activeTab = isPlayerInventoryTabKey(nextState.activeTab)
        ? nextState.activeTab
        : current.activeTab;
    const sortKey = isPlayerInventorySortKey(nextState.sortKey)
        ? nextState.sortKey
        : current.sortKey;
    const showUsedByTab = {
        ...current.showUsedByTab,
        ...(nextState.showUsedByTab || {}),
    };

    saveToLocalStorage(PLAYER_INVENTORY_STATE_KEY, {
        activeTab,
        searchQuery: nextState.searchQuery !== undefined
            ? String(nextState.searchQuery || '')
            : current.searchQuery,
        sortKey,
        sortDirection: normalizeInventorySortDirection(nextState.sortDirection ?? current.sortDirection, sortKey),
        showUsedByTab,
    });
}

function getSavedPlayerInventoryShowUsed(tabKey = 'all') {
    return readPlayerInventoryState().showUsedByTab[tabKey] === true;
}

function setPlayerInventoryTab(inventoryDiv, tabKey = 'all') {
    if (!inventoryDiv) return;

    const activeTab = isPlayerInventoryTabKey(tabKey) ? tabKey : 'all';
    inventoryDiv.dataset.inventoryTab = activeTab;
    inventoryDiv.dataset.showUsed = getSavedPlayerInventoryShowUsed(activeTab) ? 'true' : 'false';
    savePlayerInventoryState({ activeTab });
    renderPlayerInventoryInterface(inventoryDiv);
}

function normalizeInventorySearchValue(value = '') {
    return String(value || '')
        .toLocaleLowerCase('fr-FR')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}

function getInventoryEntryItem(entry = {}) {
    return entry?.item && typeof entry.item === 'object' ? entry.item : null;
}

function getInventoryEntryName(entry = {}) {
    if (entry.kind === 'essence') {
        const definition = entry.definition || getEssenceItemDefinition(entry.color);
        return definition?.name || `Essence ${entry.color || ''}`.trim();
    }

    const item = getInventoryEntryItem(entry);
    return item?.displayName || item?.name || entry.itemId || entry.equippedId || '';
}

function getInventoryEntryPower(entry = {}) {
    if (entry.kind !== 'item') return 0;

    const item = getInventoryEntryItem(entry);
    if (!item) return 0;

    if (Array.isArray(item.Stuffeffets)) {
        try {
            return Number(calculateItemPower(item)?.score ?? item.power ?? 0) || 0;
        } catch (error) {
            console.warn('[Inventaire] Tri puissance impossible pour item :', item, error);
        }
    }

    return Number(item.power ?? item.itemPower ?? 0) || 0;
}

function getInventoryEntryRarity(entry = {}) {
    if (entry.kind !== 'item') return 0;

    const item = getInventoryEntryItem(entry);
    return getScoredItemQuality(item);
}

function getInventoryEntrySearchText(entry = {}) {
    if (entry.kind === 'essence') {
        const definition = entry.definition || getEssenceItemDefinition(entry.color);
        return [
            'essence',
            entry.color,
            entry.source,
            definition?.name,
            definition?.infusedLabel,
            definition?.type,
            definition?.statKey,
            entry.entity ? getInventoryEntityName(entry.entity) : '',
            entry.attack?.name,
            entry.attack?.key,
            entry.slot ? `chasse ${entry.slot}` : '',
        ].filter(Boolean).join(' ');
    }

    const item = getInventoryEntryItem(entry);
    if (!item) return '';

    const effectText = Array.isArray(item.Stuffeffets)
        ? item.Stuffeffets.flatMap(effect => {
            const statKey = normalizeStatKey(effect?.stat || '');
            return [
                effect?.type,
                effect?.stat,
                statKey,
                statsByKey[statKey]?.name,
                effect?.value,
            ];
        })
        : [];

    return [
        item.displayName,
        item.name,
        item.itemDescription,
        item.itemLore,
        item.functionName,
        item.itemId,
        item.itemType,
        item.itemQuality,
        entry.used ? 'utilise equipe enchasse' : '',
        entry.owner ? getInventoryEntityName(entry.owner) : '',
        ...effectText,
    ].flat().filter(Boolean).join(' ');
}

function filterPlayerInventoryEntries(entries = [], searchQuery = '') {
    const query = normalizeInventorySearchValue(searchQuery);
    if (!query) return entries;

    const tokens = query.split(/\s+/).filter(Boolean);
    return entries.filter(entry => {
        const haystack = normalizeInventorySearchValue(getInventoryEntrySearchText(entry));
        return tokens.every(token => haystack.includes(token));
    });
}

function sortPlayerInventoryEntries(entries = [], sortKey = 'power', sortDirection = 'desc') {
    const direction = normalizeInventorySortDirection(sortDirection, sortKey) === 'asc' ? 1 : -1;

    return [...entries].sort((left, right) => {
        if (sortKey === 'alpha') {
            const nameCompare = getInventoryEntryName(left).localeCompare(
                getInventoryEntryName(right),
                'fr',
                { sensitivity: 'base', numeric: true }
            );
            if (nameCompare !== 0) return nameCompare * direction;
            return (getInventoryEntryPower(right) - getInventoryEntryPower(left));
        }

        const rarityCompare = getInventoryEntryRarity(left) - getInventoryEntryRarity(right);
        if (rarityCompare !== 0) return rarityCompare * direction;

        const powerCompare = getInventoryEntryPower(left) - getInventoryEntryPower(right);
        if (powerCompare !== 0) return powerCompare * direction;

        return getInventoryEntryName(left).localeCompare(
            getInventoryEntryName(right),
            'fr',
            { sensitivity: 'base', numeric: true }
        );
    });
}

function applyPlayerInventorySearchAndSort(entries = [], inventoryDiv) {
    const searchQuery = inventoryDiv?.dataset.searchQuery || '';
    const sortKey = isPlayerInventorySortKey(inventoryDiv?.dataset.sortKey)
        ? inventoryDiv.dataset.sortKey
        : 'power';
    const sortDirection = normalizeInventorySortDirection(inventoryDiv?.dataset.sortDirection, sortKey);

    return sortPlayerInventoryEntries(
        filterPlayerInventoryEntries(entries, searchQuery),
        sortKey,
        sortDirection
    );
}

function normalizeInventoryItemTypes(item = {}) {
    return Array.isArray(item.itemType)
        ? item.itemType.filter(Boolean)
        : [item.itemType].filter(Boolean);
}

function isInventoryStuffItem(item = {}) {
    return normalizeInventoryItemTypes(item).includes('stuff');
}

function isInventoryConsumableItem(item = {}) {
    const types = normalizeInventoryItemTypes(item);
    return types.includes('consumable') || !types.includes('stuff');
}

function getInventoryAttackName(attack = {}, index = 0) {
    return String(
        attack.displayName ||
        attack.name ||
        attack.functionName ||
        attack.attackKey ||
        `Attaque ${index + 1}`
    );
}

function makeInventoryDomId(prefix, id) {
    return `${prefix}-${String(id || 'empty').replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

function escapeInventoryHTML(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function dedupePlayerInventory(save) {
    save.Playerinventory = Array.isArray(save.Playerinventory)
        ? save.Playerinventory
        : [];

    const uniqueItemsMap = new Map();
    save.Playerinventory.forEach(item => {
        const itemId = typeof item === 'string' ? item : item?.itemId;
        if (itemId && !uniqueItemsMap.has(itemId)) {
            uniqueItemsMap.set(itemId, item);
        }
    });

    save.Playerinventory = Array.from(uniqueItemsMap.values());
    saveToLocalStorage('PlayerSave', save);
    return save.Playerinventory;
}

function getInventoryEquippedBaseItemId(equippedId = '') {
    const normalizedId = String(equippedId || '').trim();
    return normalizedId.startsWith('e') ? normalizedId.slice(1) : normalizedId;
}

function readEntityStuffInventoryRefs(entity = {}) {
    const stuff = entity?.stuff && typeof entity.stuff === 'object'
        ? entity.stuff
        : {};
    const refs = [];

    Object.entries(stuff).forEach(([slotKey, rawSlot]) => {
        const equippedIds = Array.isArray(rawSlot)
            ? rawSlot
            : [rawSlot];

        equippedIds.forEach(rawItemRef => {
            const objectRef = rawItemRef && typeof rawItemRef === 'object' ? rawItemRef : {};
            const normalizedId = String(
                typeof rawItemRef === 'string'
                    ? rawItemRef
                    : objectRef.equippedId || objectRef.itemId || objectRef.id || ''
            ).trim();
            if (!normalizedId) return;

            const equippedId = normalizedId.startsWith('e')
                ? normalizedId
                : `e${normalizedId}`;

            refs.push({
                ...objectRef,
                equippedId,
                itemId: getInventoryEquippedBaseItemId(equippedId),
                equippedTo: entity.id,
                slot: objectRef.slot || `${slotKey}-${entity.id}`,
            });
        });
    });

    return refs;
}

function readDomEquippedStuffInventoryRefs() {
    if (typeof document === 'undefined') return [];

    return [...document.querySelectorAll('.stuff-slot.equiped, .stuff-slot.equipped')]
        .map(slot => {
            const wrapper = slot.querySelector('.stuff-item-wrapper[data-stuff-id]');
            const icon = slot.querySelector('.inventory-item-icon[id]');
            const rawEquippedId = String(wrapper?.dataset?.stuffId || icon?.id || '').trim();
            if (!rawEquippedId) return null;

            const equippedId = rawEquippedId.startsWith('e') ? rawEquippedId : `e${rawEquippedId}`;
            const entityMatch = String(slot.id || '').match(/^slot\d+-(.+)$/);
            const equippedTo = entityMatch?.[1] || slot.closest('[data-entity-id]')?.dataset?.entityId || '';

            return {
                equippedId,
                itemId: getInventoryEquippedBaseItemId(equippedId),
                equippedTo,
                slot: slot.id || '',
            };
        })
        .filter(Boolean);
}

function resolveEquippedInventoryItem(rawItem = {}) {
    const equippedId = String(rawItem?.equippedId || '').trim();
    const baseItemId = String(rawItem?.itemId || getInventoryEquippedBaseItemId(equippedId) || '').trim();
    const candidates = [
        equippedId ? getIngameItemById(equippedId) : null,
        baseItemId && baseItemId !== equippedId ? getIngameItemById(baseItemId) : null,
        rawItem,
    ].filter(candidate => candidate && typeof candidate === 'object');
    const itemData = candidates.find(isInventoryStuffItem) || candidates[0] || null;

    if (!itemData || typeof itemData !== 'object') return null;

    return {
        ...itemData,
        itemId: itemData.itemId || baseItemId,
        equippedId: itemData.equippedId || equippedId,
        equippedTo: itemData.equippedTo ?? rawItem.equippedTo,
        slot: itemData.slot || rawItem.slot,
    };
}

function createEquippedStuffInventoryEntry(rawItem = {}, owner = null) {
    const item = resolveEquippedInventoryItem(rawItem);
    if (!item?.equippedId || !isInventoryStuffItem(item)) return null;

    const resolvedOwner = owner || findInventoryEntityById(item.equippedTo);

    return {
        kind: 'item',
        used: true,
        itemId: item.itemId,
        equippedId: item.equippedId,
        owner: resolvedOwner,
        item,
    };
}

function readPlayerInventoryEntries() {
    const save = loadFromLocalStorage('PlayerSave', {});
    const inventory = dedupePlayerInventory(save);
    const equippedBaseItemIds = new Set(
        readEquippedStuffInventoryEntries()
            .map(entry => entry.itemId)
            .filter(Boolean)
    );

    return inventory
        .map(entry => {
            const itemId = typeof entry === 'string' ? entry : entry?.itemId;
            if (!itemId || equippedBaseItemIds.has(itemId)) return null;

            const fullData = getIngameItemById(itemId) || (entry && typeof entry === 'object' ? entry : null);
            if (!itemId || !fullData) return null;

            return {
                kind: 'item',
                used: false,
                itemId,
                item: {
                    ...fullData,
                    itemId: fullData.itemId || itemId,
                },
            };
        })
        .filter(Boolean);
}

function readEquippedStuffInventoryEntries() {
    const byEquippedId = new Map();

    const addEntry = (rawItem, owner = null) => {
        const entry = createEquippedStuffInventoryEntry(rawItem, owner);
        if (!entry?.equippedId || !entry.owner) return;
        byEquippedId.set(entry.equippedId, entry);
    };

    readInventoryArmy().forEach(entity => {
        readEntityStuffInventoryRefs(entity).forEach(ref => {
            addEntry(ref, entity);
        });
    });

    readDomEquippedStuffInventoryRefs().forEach(ref => {
        addEntry(ref, findInventoryEntityById(ref.equippedTo));
    });

    return [...byEquippedId.values()];
}

function createEssenceInventoryEntry({ color, source, used, entity = null, attack = null, slot = null, slotIndex = null, essenceId = '' }) {
    const hyperco = entity?.attackEssenceInventory?.linkedItems?.some(item => item.id === essenceId && item.hyperco) === true;
    const definition = getEssenceItemDefinition(color);
    const displayDefinition = source === 'universal'
        ? {
            ...definition,
            name: definition.universalName || `Essence universelle ${definition.infusedLabel || definition.name}`,
            type: 'Essence universelle',
        }
        : definition;

    return {
        kind: 'essence',
        hyperco,
        color,
        source,
        used: used === true,
        entity,
        attack,
        slot,
        slotIndex,
        essenceId: String(essenceId || '').trim(),
        definition: displayDefinition,
    };
}

function readAttackEssenceInventoryEntries() {
    const entries = [];
    loadUniversalEssenceItems().forEach(item => {
        entries.push(createEssenceInventoryEntry({
            color: item.color,
            source: 'universal',
            used: false,
            essenceId: item.id,
        }));
    });

    readInventoryArmy().forEach(entity => {
        if (!entity || typeof entity !== 'object') return;

        const attacks = ensureEntityAttackInstances(entity, attackDetails);
        const linkedAvailability = calculateEntityLinkedEssenceAvailability(entity);
        const linkedItems = Array.isArray(linkedAvailability.availableItems)
            ? linkedAvailability.availableItems
            : [];

        linkedItems.forEach(item => {
            const color = item?.color;
            if (!color) return;
            entries.push(createEssenceInventoryEntry({
                color,
                source: 'linked',
                used: false,
                entity,
                essenceId: item.id,
            }));
        });

        attacks.forEach((attack, attackIndex) => {
            const attackName = getInventoryAttackName(attack, attackIndex);
            const attackKeys = getInventoryAttackKeyCandidates(attack);

            getAttackEssenceSocketViewModel(attack)
                .filter(socket => socket.color && socket.essenceId)
                .forEach(socket => {
                    entries.push(createEssenceInventoryEntry({
                        color: socket.color,
                        source: socket.essenceSource === 'inventory' ? 'universal' : 'linked',
                        used: true,
                        entity,
                        attack: {
                            key: attackKeys[0] || readAttackDefinitionKey(attack),
                            keys: attackKeys,
                            name: attackName,
                            index: attackIndex,
                            attackKey: attack.attackKey || '',
                            templateKey: attack.templateKey || '',
                            functionName: attack.functionName || '',
                            attackId: attack.attackId || '',
                            entityAttackId: attack.entityAttackId || '',
                        },
                        slot: socket.index,
                        slotIndex: socket.arrayIndex,
                        essenceId: socket.essenceId || '',
                    }));
                });
        });
    });

    return entries;
}

function setupEquippedInventoryDrag(imgElement, equippedId) {
    if (!imgElement || !equippedId) return;
    imgElement.dataset.dragItemId = equippedId;
    setupDragAndDropItem(imgElement, equippedId);
}

function createPlayerInventoryItemCard(entry) {
    const item = entry.item;
    const itemId = entry.equippedId || entry.itemId || item?.itemId;
    if (!item || !itemId) return null;

    const itemDiv = document.createElement('div');
    itemDiv.classList.add('inventory-item', `quality-${getScoredItemQuality(item)}`);
    normalizeInventoryItemTypes(item).forEach(type => itemDiv.classList.add(type));
    if (entry.used) itemDiv.classList.add('inventory-item--used', 'inventory-item--equipped');
    itemDiv.dataset.itemId = itemId;
    if (entry.equippedId) itemDiv.dataset.equippedId = entry.equippedId;
    if (entry.owner?.id) itemDiv.dataset.ownerEntityId = entry.owner.id;
    itemDiv.setAttribute('draggable', 'false');

    const img = document.createElement('img');
    img.src = cachedResourceUrl(item.itemAsset);
    img.alt = item.displayName;
    img.id = entry.used
        ? makeInventoryDomId('inventory-equipped', itemId)
        : item.itemId;
    img.classList.add('inventory-item-icon', item.functionName);

    if (entry.used && !entry.satchel) {
        setupEquippedInventoryDrag(img, entry.equippedId || itemId);
    } else {
        setupDragAndDropItem(img, item.itemId);
    }

    const label = document.createElement('span');
    label.textContent = item.displayName;

    itemDiv.appendChild(img);
    itemDiv.appendChild(label);
    itemDiv.appendChild(createItemPowerValue(item));

    if (entry.used) {
        const ownerLabel = document.createElement('small');
        ownerLabel.className = 'inventory-used-owner';
        ownerLabel.textContent = entry.owner
            ? `Équipé : ${getInventoryEntityName(entry.owner)}`
            : entry.satchel ? `Équipé : Sacoche, emplacement ${entry.slot + 1}` : 'Équipé';
        itemDiv.appendChild(ownerLabel);

        itemDiv.addEventListener('dblclick', event => {
            event.preventDefault();
            event.stopPropagation();
            if (entry.satchel) {
                const slot = document.querySelector(`.inventory-interface [data-battle-slot="${entry.slot}"]`);
                slot?.scrollIntoView({ block: 'nearest' });
                slot?.focus();
                return;
            }
            openInventoryEntityCodexTarget({
                entityId: entry.owner?.id,
                submenu: 'equipment',
            });
        });
    }

    bindPersistentDescription(itemDiv, item, itemId, 'item', {
        showEquippedActions: entry.used === true && !entry.satchel,
    });
    return itemDiv;
}

function createEssenceInventoryHelperHTML(entry) {
  return buildEssenceInventoryHelperHTML(entry, { getInventoryEntityName, createUniversalEssenceHelperHTML, createLinkedEssenceHelperHTML });
}

function createEssenceInventoryCardKey(entry, index = 0) {
    const parts = [
        'essence',
        entry.color || 'empty',
        entry.source || 'unknown',
        entry.essenceId || '',
        entry.used ? 'used' : 'free',
        entry.entity?.id ?? 'global',
        entry.attack?.entityAttackId || entry.attack?.key || entry.attack?.name || 'no-attack',
        Number.isFinite(Number(entry.attack?.index)) ? `attack-${entry.attack.index}` : 'attack-x',
        entry.slotIndex !== null && entry.slotIndex !== undefined ? `slot-${entry.slotIndex}` : `entry-${index}`,
        index,
    ];

    return parts
        .map(part => String(part ?? '').trim().replace(/[^a-zA-Z0-9_-]/g, '_'))
        .filter(Boolean)
        .join('-');
}

function openInventoryEssenceCardTarget(card) {
    if (!(card instanceof Element) || !card.classList.contains('inventory-item--socketed')) return false;

    const attackIndex = Number(card.dataset.attackIndex);
    return openInventoryEntityCodexTarget({
        entityId: card.dataset.ownerEntityId || card.dataset.entityId,
        submenu: 'attack',
        attackKey: card.dataset.attackKey || '',
        attackKeys: String(card.dataset.attackKeys || '').split('|').filter(Boolean),
        attackIndex: Number.isFinite(attackIndex) ? attackIndex : null,
        slotIndex: card.dataset.slotIndex,
    });
}

function handleInventoryEssenceCardOpenEvent(event) {
    const card = event.target?.closest?.('.inventory-interface .inventory-essence-item.inventory-item--socketed');
    if (!card) return false;

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
    }

    const opened = openInventoryEssenceCardTarget(card);
    if (!opened) {
        console.warn('[Inventaire] Double-clic essence enchâssée impossible à ouvrir :', {
            entityId: card.dataset.ownerEntityId || card.dataset.entityId,
            attackKey: card.dataset.attackKey,
            attackKeys: card.dataset.attackKeys,
            attackIndex: card.dataset.attackIndex,
            slotIndex: card.dataset.slotIndex,
        });
    }

    return opened;
}

function bindInventoryEssenceCardOpenEvents() {
    if (typeof document === 'undefined' || window.__inventoryEssenceCardOpenBound === true) return;
    window.__inventoryEssenceCardOpenBound = true;

    document.addEventListener('dblclick', handleInventoryEssenceCardOpenEvent, true);
    document.addEventListener('click', (event) => {
        if (Number(event.detail) < 2) return;
        handleInventoryEssenceCardOpenEvent(event);
    }, true);
}

function createPlayerInventoryEssenceCard(entry, index = 0) {
    const definition = entry.definition || getEssenceItemDefinition(entry.color);
    const cardKey = createEssenceInventoryCardKey(entry, index);
    const itemDiv = document.createElement('div');
    itemDiv.className = `inventory-item inventory-essence-item essence-item-card ${entry.color}`;
    itemDiv.classList.toggle('hyperco', entry.hyperco);
    if (entry.source === 'universal') {
        itemDiv.classList.add('universal', `quality-${definition.quality ?? 4}`);
    } else {
        itemDiv.classList.add('linked', 'quality-4');
    }
    if (entry.used) itemDiv.classList.add('inventory-item--used', 'inventory-item--socketed');
    itemDiv.dataset.stat = definition.statKey;
    itemDiv.dataset.hover = 'true';
    itemDiv.dataset.helperText = createEssenceInventoryHelperHTML(entry);
    if (entry.source === 'universal') {
        itemDiv.dataset.helperAmbiance = createUniversalEssenceAmbianceHTML(entry.color);
        itemDiv.dataset.helperClass = getUniversalEssenceHelperClass(entry.color);
    } else {
        itemDiv.dataset.helperClass = getLinkedEssenceHelperClass(entry.color);
    }
    itemDiv.dataset.helperKey = cardKey;
    itemDiv.dataset.essenceCardKey = cardKey;
    itemDiv.dataset.essenceSource = entry.source;
    if (entry.essenceId) itemDiv.dataset.essenceId = entry.essenceId;
    itemDiv.dataset.inventoryEssenceIndex = String(index);
    if (entry.entity?.id) {
        itemDiv.dataset.ownerEntityId = entry.entity.id;
        itemDiv.dataset.entityId = entry.entity.id;
    }
    if (entry.attack?.key) itemDiv.dataset.attackKey = entry.attack.key;
    if (Array.isArray(entry.attack?.keys) && entry.attack.keys.length) {
        itemDiv.dataset.attackKeys = entry.attack.keys.join('|');
    }
    if (Number.isFinite(Number(entry.attack?.index))) {
        itemDiv.dataset.attackIndex = String(entry.attack.index);
    }
    if (entry.slotIndex !== null && entry.slotIndex !== undefined) itemDiv.dataset.slotIndex = String(entry.slotIndex);
    itemDiv.setAttribute('draggable', 'false');

    const sprite = document.createElement('div');
    sprite.innerHTML = createEssenceSpriteHTML(definition, {
        universal: entry.source === 'universal',
        hyperco: entry.hyperco,
    });

    itemDiv.draggable = true;
    itemDiv.addEventListener('dragstart', event => {
        beginDragHelperCleanup();
        event.dataTransfer.setData('application/x-game-essence', entry.essenceId || cardKey);
        event.dataTransfer.setData('text/plain', entry.essenceId || cardKey);
    });
    itemDiv.addEventListener('dragend', endDragHelperCleanup);

    if (entry.source === 'universal') {
        const universalOrb = document.createElement('div');
        universalOrb.className = 'inventory-essence-universal-orb essenceur-purchase-orb universal';
        universalOrb.setAttribute('aria-hidden', 'true');
        universalOrb.appendChild(sprite.firstElementChild);
        itemDiv.appendChild(universalOrb);
    } else {
        itemDiv.appendChild(sprite.firstElementChild);
    }

    const label = document.createElement('span');
    label.className = 'inventory-essence-label';
    label.textContent = entry.hyperco ? 'Intelligence Hypercognitive' : entry.source === 'universal'
        ? definition.universalName || definition.name
        : definition.name;

    itemDiv.appendChild(label);

    if (entry.used || entry.entity) {
        const meta = document.createElement('small');
        meta.className = 'inventory-used-owner';
        meta.textContent = entry.used
            ? `${entry.attack?.name || 'Attaque'}${entry.slot ? ` / chasse ${entry.slot}` : ''}`
            : getInventoryEntityName(entry.entity);
        itemDiv.appendChild(meta);
    }

    if (entry.used) {
        itemDiv.addEventListener('dblclick', event => {
            event.preventDefault();
            event.stopPropagation();
            openInventoryEssenceCardTarget(itemDiv);
        });
    }

    return itemDiv;
}

function createPlayerInventoryEntries(activeTab, showUsed) {
    const inventoryEntries = readPlayerInventoryEntries();
    const equippedEntries = showUsed ? readEquippedStuffInventoryEntries() : [];
    const satchelEntries = showUsed ? getBattleInventoryState().battleSlots.flatMap((itemId, slot) => {
        const item = itemId && getIngameItemById(itemId);
        return item ? [{ kind: 'item', used: true, satchel: true, itemId, slot, item }] : [];
    }) : [];
    const essenceEntries = readAttackEssenceInventoryEntries()
        .filter(entry => !entry.used || showUsed);

    if (activeTab === 'objects') {
        return [...inventoryEntries.filter(entry => isInventoryConsumableItem(entry.item)), ...satchelEntries];
    }

    if (activeTab === 'equipment') {
        return [
            ...inventoryEntries.filter(entry => isInventoryStuffItem(entry.item)),
            ...equippedEntries,
        ];
    }

    if (activeTab === 'essences') {
        return essenceEntries;
    }

    return [
        ...inventoryEntries,
        ...essenceEntries,
        ...equippedEntries,
        ...satchelEntries,
    ];
}

function renderPlayerInventoryInterface(inventoryDiv) {
    if (!inventoryDiv) return false;

    const activeTab = inventoryDiv.dataset.inventoryTab || 'all';
    const showUsed = inventoryDiv.dataset.showUsed === 'true';
    const searchQuery = inventoryDiv.dataset.searchQuery || '';
    const sortKey = isPlayerInventorySortKey(inventoryDiv.dataset.sortKey)
        ? inventoryDiv.dataset.sortKey
        : 'power';
    const sortDirection = normalizeInventorySortDirection(inventoryDiv.dataset.sortDirection, sortKey);
    const tabs = inventoryDiv.querySelector('.inventory-tabs');
    const filter = inventoryDiv.querySelector('.inventory-filter');
    const inventoryContent = inventoryDiv.querySelector('.inventory-content');
    const searchInput = inventoryDiv.querySelector('.inventory-search-input');
    const sortSelect = inventoryDiv.querySelector('.inventory-sort-select');
    const sortDirectionButton = inventoryDiv.querySelector('.inventory-sort-direction');
    if (!tabs || !filter || !inventoryContent) return false;

    inventoryDiv.dataset.sortKey = sortKey;
    inventoryDiv.dataset.sortDirection = sortDirection;

    if (searchInput && searchInput.value !== searchQuery) {
        searchInput.value = searchQuery;
    }
    if (sortSelect) {
        sortSelect.value = sortKey;
    }
    if (sortDirectionButton) {
        sortDirectionButton.textContent = sortDirection === 'asc' ? '↑' : '↓';
        sortDirectionButton.title = sortDirection === 'asc' ? 'Ordre croissant' : 'Ordre décroissant';
        sortDirectionButton.setAttribute('aria-label', sortDirectionButton.title);
    }

    tabs.querySelectorAll('[data-inventory-tab]').forEach(button => {
        button.classList.toggle('active', button.dataset.inventoryTab === activeTab);
    });

    const filterLabel = PLAYER_INVENTORY_USED_FILTER_LABELS[activeTab] || '';
    filter.innerHTML = '';
    filter.classList.toggle('is-hidden', !filterLabel);
    if (filterLabel) {
        const label = document.createElement('label');
        label.className = 'inventory-filter-toggle';
        label.dataset.inventoryFilterToggle = 'true';

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = showUsed;
        input.defaultChecked = showUsed;
        input.dataset.inventoryShowUsed = 'true';
        input.setAttribute('aria-checked', String(showUsed));
        input.addEventListener('click', event => {
            event.stopPropagation();
            setPlayerInventoryUsedFilter(inventoryDiv, event.currentTarget.checked);
        });

        label.addEventListener('click', event => {
            if (event.target === input) return;
            event.preventDefault();
            event.stopPropagation();
            setPlayerInventoryUsedFilter(inventoryDiv, inventoryDiv.dataset.showUsed !== 'true');
        });

        const text = document.createElement('span');
        text.textContent = filterLabel;

        label.appendChild(input);
        label.appendChild(text);
        filter.appendChild(label);
    }

    inventoryContent.innerHTML = '';
    const entries = applyPlayerInventorySearchAndSort(
        createPlayerInventoryEntries(activeTab, showUsed),
        inventoryDiv
    );

    if (!entries.length) {
        const empty = document.createElement('p');
        empty.className = 'empty-msg';
        empty.textContent = searchQuery
            ? '(Aucun résultat)'
            : '(Aucun objet pour le moment)';
        inventoryContent.appendChild(empty);
    } else {
        entries.forEach((entry, index) => {
            const node = entry.kind === 'essence'
                ? createPlayerInventoryEssenceCard(entry, index)
                : createPlayerInventoryItemCard(entry);

            if (node) inventoryContent.appendChild(node);
        });
    }

    if (document.querySelector('.stuff-slot')) {
        DropEquipementtoInventory();
        DclicSlottoInventory();
    }
    DropFromCodexToInventory();
    glitterStuff('.inventory-item.stuff', 3);

    return true;
}

function setPlayerInventoryUsedFilter(inventoryDiv, checked) {
    if (!inventoryDiv) return;
    const activeTab = inventoryDiv.dataset.inventoryTab || 'all';
    inventoryDiv.dataset.showUsed = checked ? 'true' : 'false';
    savePlayerInventoryState({
        activeTab,
        showUsedByTab: {
            [activeTab]: checked === true,
        },
    });
    renderPlayerInventoryInterface(inventoryDiv);
}

function setPlayerInventorySearchQuery(inventoryDiv, searchQuery = '') {
    if (!inventoryDiv) return;
    inventoryDiv.dataset.searchQuery = String(searchQuery || '');
    savePlayerInventoryState({
        activeTab: inventoryDiv.dataset.inventoryTab || 'all',
        searchQuery: inventoryDiv.dataset.searchQuery,
        sortKey: inventoryDiv.dataset.sortKey,
        sortDirection: inventoryDiv.dataset.sortDirection,
    });
    renderPlayerInventoryInterface(inventoryDiv);
}

function setPlayerInventorySort(inventoryDiv, sortKey = 'power', sortDirection = null) {
    if (!inventoryDiv) return;

    const nextSortKey = isPlayerInventorySortKey(sortKey) ? sortKey : 'power';
    const currentSortKey = inventoryDiv.dataset.sortKey || 'power';
    const nextSortDirection = normalizeInventorySortDirection(
        sortDirection ?? (
            nextSortKey !== currentSortKey
                ? getDefaultInventorySortDirection(nextSortKey)
                : inventoryDiv.dataset.sortDirection
        ),
        nextSortKey
    );

    inventoryDiv.dataset.sortKey = nextSortKey;
    inventoryDiv.dataset.sortDirection = nextSortDirection;
    savePlayerInventoryState({
        activeTab: inventoryDiv.dataset.inventoryTab || 'all',
        searchQuery: inventoryDiv.dataset.searchQuery,
        sortKey: nextSortKey,
        sortDirection: nextSortDirection,
    });
    renderPlayerInventoryInterface(inventoryDiv);
}

function bindPlayerInventoryRealtimeRefresh() {
    if (window.__playerInventoryRealtimeRefreshBound === true) return;
    window.__playerInventoryRealtimeRefreshBound = true;

    const refresh = () => {
        if (typeof window.refreshPlayerInventoryInterface === 'function') {
            window.refreshPlayerInventoryInterface();
        }
    };

    [
        'inventoryItemsUpdated',
        'equippedItemsUpdated',
        'essenceInventoryUpdated',
        'linkedEssenceInventoryUpdated',
        'attackEssenceSocketUpdated',
        'selectedArmyAUpdated',
    ].forEach(eventName => window.addEventListener(eventName, refresh));
}

function createInventory() {
    if (!requireSafeMenuAccess()) return;
    const GameUiContainer = document.querySelector('.Game-UI');
    if (!GameUiContainer) return console.error("⚠️ '.Game-UI' introuvable.");

    let MenuMapContainer = GameUiContainer.querySelector('.menu-map-container');
    if (!MenuMapContainer) {
        MenuMapContainer = document.createElement('div');
        MenuMapContainer.classList.add('menu-map-container');
        GameUiContainer.appendChild(MenuMapContainer);
    }

    // Vérifier si l'inventaire est déjà affiché
    const existingInventory = MenuMapContainer.querySelector('.inventory-interface');
    if (existingInventory) {
        existingInventory.remove();
        if (MenuMapContainer.children.length === 0) MenuMapContainer.remove();
        return;
    }

    // Création de l'interface d'inventaire
    const inventoryDiv = document.createElement('div');
    inventoryDiv.classList.add('inventory-interface');

    const inventoryHeader = document.createElement('div');
    inventoryHeader.classList.add('inventory-header');

    const inventoryTitle = document.createElement('div');
    inventoryTitle.textContent = 'Inventaire';
	inventoryTitle.classList.add('inventory-title');

	const inventoryMenuImg = document.createElement('img');
    inventoryMenuImg.className = 'player-inventory-icon-menu';
    inventoryMenuImg.src = cachedResourceUrl('./media/assets/ui/picto-inventory.svg');
    inventoryMenuImg.alt = 'Inventaire';

    const closeButton = document.createElement('div');
  closeButton.classList.add('close-button', 'inventory');
closeButton.textContent = 'x';
closeButton.addEventListener('click', () => {
    inventoryDiv.remove();

    // Mise à jour après suppression
    requestAnimationFrame(() => {
        if (MenuMapContainer.children.length === 0) {
            MenuMapContainer.remove();
        }
        MenuContainerDisplayRules();
    });
});

    const filter = document.createElement('div');
    filter.className = 'inventory-filter';

    const inventoryTools = document.createElement('div');
    inventoryTools.className = 'inventory-tools';

    const searchInput = document.createElement('input');
    searchInput.className = 'inventory-search-input';
    searchInput.type = 'search';
    searchInput.placeholder = 'Rechercher';
    searchInput.autocomplete = 'off';
    searchInput.spellcheck = false;
    searchInput.setAttribute('aria-label', 'Rechercher un objet');

    const sortSelect = document.createElement('select');
    sortSelect.className = 'inventory-sort-select';
    sortSelect.setAttribute('aria-label', 'Trier l’inventaire');

    [
        ['power', 'Rareté'],
        ['alpha', 'A-Z'],
    ].forEach(([value, label]) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        sortSelect.appendChild(option);
    });

    const sortDirectionButton = document.createElement('button');
    sortDirectionButton.type = 'button';
    sortDirectionButton.className = 'inventory-sort-direction';

    inventoryTools.append(searchInput, sortSelect, sortDirectionButton);

	inventoryHeader.appendChild(inventoryMenuImg);
    inventoryHeader.appendChild(inventoryTitle);
    inventoryHeader.appendChild(inventoryTools);
    inventoryHeader.appendChild(filter);
	inventoryHeader.appendChild(closeButton);

    const inventoryBody = document.createElement('div');
    inventoryBody.classList.add('inventory-body');

    const tabs = document.createElement('div');
    tabs.className = 'inventory-tabs';
    PLAYER_INVENTORY_TABS.forEach(tab => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.inventoryTab = tab.key;
        button.textContent = tab.label;
        tabs.appendChild(button);
    });

    const inventoryContent = document.createElement('div');
    inventoryContent.classList.add('inventory-content');
    const savedInventoryState = readPlayerInventoryState();
    inventoryDiv.dataset.inventoryTab = savedInventoryState.activeTab;
    inventoryDiv.dataset.showUsed = savedInventoryState.showUsedByTab[savedInventoryState.activeTab] ? 'true' : 'false';
    inventoryDiv.dataset.searchQuery = savedInventoryState.searchQuery || '';
    inventoryDiv.dataset.sortKey = savedInventoryState.sortKey || 'power';
    inventoryDiv.dataset.sortDirection = savedInventoryState.sortDirection || getDefaultInventorySortDirection(savedInventoryState.sortKey);

    inventoryBody.appendChild(tabs);

    inventoryBody.appendChild(inventoryContent);
    inventoryDiv.appendChild(inventoryHeader);
    inventoryDiv.appendChild(inventoryBody);
    inventoryDiv.appendChild(createBattleSatchelView());
    MenuMapContainer.appendChild(inventoryDiv);

    inventoryDiv.addEventListener('click', (event) => {
        const filterToggle = event.target.closest?.('[data-inventory-filter-toggle="true"]');
        if (filterToggle) {
            event.stopPropagation();
            return;
        }

        const tabButton = event.target.closest?.('[data-inventory-tab]');
        if (tabButton) {
            setPlayerInventoryTab(inventoryDiv, tabButton.dataset.inventoryTab || 'all');
        }
    });

    inventoryDiv.addEventListener('change', (event) => {
        const target = event.target;
        if (target?.matches?.('input[data-inventory-show-used="true"]')) {
            setPlayerInventoryUsedFilter(inventoryDiv, target.checked);
            return;
        }

        if (target?.matches?.('.inventory-sort-select')) {
            setPlayerInventorySort(inventoryDiv, target.value);
        }
    });

    inventoryDiv.addEventListener('input', (event) => {
        const target = event.target;
        if (target?.matches?.('.inventory-search-input')) {
            setPlayerInventorySearchQuery(inventoryDiv, target.value);
        }
    });

    inventoryDiv.addEventListener('click', (event) => {
        const target = event.target;
        if (target?.matches?.('.inventory-sort-direction')) {
            event.preventDefault();
            event.stopPropagation();
            const currentDirection = normalizeInventorySortDirection(
                inventoryDiv.dataset.sortDirection,
                inventoryDiv.dataset.sortKey
            );
            setPlayerInventorySort(
                inventoryDiv,
                inventoryDiv.dataset.sortKey,
                currentDirection === 'asc' ? 'desc' : 'asc'
            );
        }
    });

    inventoryDiv.addEventListener('dblclick', (event) => {
        const essenceCard = event.target.closest?.('.inventory-essence-item.inventory-item--socketed');
        if (!essenceCard) return;

        event.preventDefault();
        event.stopPropagation();
        openInventoryEssenceCardTarget(essenceCard);
    }, true);

    renderPlayerInventoryInterface(inventoryDiv);
	reorderMenuMapChildren();
	enforceMenuDisplayRules();
}

function MapShop(menuIcons) {
    if (!getStageAccess().menusAllowed) return;
    if (!menuIcons) {
        console.error("⚠️ Le conteneur menuIcons est manquant !");
        return;
    }

    if (!menuIcons.querySelector('.shop-icon')) {
        const shopIconImg = document.createElement('img');
        shopIconImg.className = 'shop-icon';
        shopIconImg.src = cachedResourceUrl('./media/assets/ui/picto-shop.svg');
        shopIconImg.alt = 'Boutique';

      shopIconImg.addEventListener('click', () => {
    toggleWindowInMenuMap('shop-interface', (MenuMapContainer) => {
        openShopInterface(MenuMapContainer);
    });
});

        menuIcons.appendChild(shopIconImg);
    }
}

function openShopInterface() {
    if (!requireSafeMenuAccess()) return;
    const GameUiContainer = document.querySelector('.Game-UI');
    if (!GameUiContainer) return console.error("⚠️ '.Game-UI' introuvable.");

    let MenuMapContainer = GameUiContainer.querySelector('.menu-map-container');
    if (!MenuMapContainer) {
        MenuMapContainer = document.createElement('div');
        MenuMapContainer.classList.add('menu-map-container');
        GameUiContainer.appendChild(MenuMapContainer);
    }

    let existingShop = MenuMapContainer.querySelector('.shop-interface');
    if (existingShop) {
        existingShop.remove();
        if (MenuMapContainer.children.length === 0) MenuMapContainer.remove();
        return;
    }

    const shopInterface = document.createElement('div');
    shopInterface.classList.add('shop-interface');

    const shopHeader = document.createElement('div');
    shopHeader.classList.add('shop-header');

    const shopTitle = document.createElement('div');
	shopTitle.classList.add('shop-title');
    shopTitle.textContent = 'Boutique';

	const shopPicto = document.createElement('img');
    shopPicto.classList.add('shop-picto');
	shopPicto.src = cachedResourceUrl('./media/assets/ui/picto-shop.svg');
    shopPicto.alt = 'Boutique';

    const closeButton = document.createElement('div');
  closeButton.classList.add('close-button', 'shop');
closeButton.textContent = 'x';
closeButton.addEventListener('click', () => {
    shopInterface.remove();

    requestAnimationFrame(() => {
        if (MenuMapContainer.children.length === 0) {
            MenuMapContainer.remove();
        }
        MenuContainerDisplayRules();
    });
});

	shopHeader.appendChild(shopPicto);
    shopHeader.appendChild(shopTitle);
    shopHeader.appendChild(closeButton);

    const shopBody = document.createElement('div');
    shopBody.classList.add('shop-body');

    const shopLeft = document.createElement('div');
    shopLeft.classList.add('shop-left');

    const shopContent = document.createElement('div');
    shopContent.classList.add('shop-content');

	const shopContentDescritpion = document.createElement('div');
    shopContentDescritpion.classList.add('shop-content-scritpion');

    const mosaic = document.createElement('div');
    mosaic.classList.add('shop-item-mosaic');

    const shopFilters = document.createElement('form');
    shopFilters.className = 'shop-filters';
    shopFilters.setAttribute('role', 'search');
    shopFilters.setAttribute('aria-label', 'Recherche dans la boutique');
    const categories = document.createElement('div');
    categories.className = 'shop-categories';
    categories.setAttribute('role', 'radiogroup');
    categories.setAttribute('aria-label', 'Type d\'objet');
    for (const [value, text] of [['all', 'Tous'], ['consumable', 'Consommables'], ['stuff', 'Équipements'], ['entity', 'Entités']]) {
        const label = document.createElement('label');
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'shop-category';
        radio.value = value;
        radio.checked = value === 'all';
        const caption = document.createElement('span');
        caption.textContent = text;
        label.append(radio, caption);
        categories.appendChild(label);
    }
    const search = document.createElement('input');
    search.type = 'search';
    search.name = 'shop-search';
    search.className = 'shop-search';
    search.placeholder = 'Rechercher un objet ou une entité';
    search.setAttribute('aria-label', 'Rechercher un objet ou une entité');
    search.autocomplete = 'off';
    shopFilters.append(search, categories);
    shopHeader.insertBefore(shopFilters, closeButton);
    const emptyShop = document.createElement('p');
    emptyShop.className = 'shop-empty';
    emptyShop.setAttribute('role', 'status');
    emptyShop.textContent = 'Aucun résultat';
    emptyShop.hidden = true;

	shopContent.appendChild(shopContentDescritpion);
	shopContent.appendChild(mosaic);
    shopContent.appendChild(emptyShop);
    shopLeft.appendChild(shopContent);

    const shopRight = document.createElement('div');
    shopRight.classList.add('shop-right');

// Conteneur image
const imgContainer = document.createElement('div');
imgContainer.classList.add('sellerimg-container');

const sellerImg = document.createElement('img');
sellerImg.src = cachedResourceUrl('./media/sprites/seller-coquin.png');
sellerImg.alt = 'seller';
sellerImg.classList.add('iddle', 'seller');

imgContainer.appendChild(sellerImg);
shopRight.appendChild(imgContainer);

// Conteneur boutons
const buttonsContainer = document.createElement('div');
buttonsContainer.classList.add('buttons-seller');

const buyButton = document.createElement('div');
buyButton.classList.add('seller-button');
buyButton.textContent = 'acheter';

// const sellButton = document.createElement('div');
// sellButton.classList.add('seller-button');
// sellButton.textContent = 'vendre';

buttonsContainer.appendChild(buyButton);
// buttonsContainer.appendChild(sellButton);
shopRight.appendChild(buttonsContainer);

    shopBody.appendChild(shopLeft);
    shopBody.appendChild(shopRight);

    shopInterface.appendChild(shopHeader);
    shopInterface.appendChild(shopBody);
    MenuMapContainer.appendChild(shopInterface);
	reorderMenuMapChildren();
	enforceMenuDisplayRules();
    // Remplir la mosaïque avec une fonction tierce
    displayShopItems(mosaic, shopRight);
	glitterStuff('.shop-interface .item-wrapper.stuff', 3);
}

export { createBattleSatchelView, PlayerInventory, createInventory, MapShop, openShopInterface };

// Register shared handlers once, after the complete module graph is initialized.
let inventoryInitialized = false;
export function initializeInventory() {
  if (inventoryInitialized) return;
  inventoryInitialized = true;
  window.addEventListener('inventoryItemsUpdated', refreshBattleSatchelViews);

  window.addEventListener('playerInfoUpdated', refreshBattleSatchelViews);

  document.addEventListener('dragover', event => {
      if (event.target.closest?.('.battle-satchel-slot, .hex, .inventory-content')) event.preventDefault();
      clearBattleItemDropPreview();
      const recipient = event.target.closest?.('.stuff-slot, [data-dropable]');
      if (recipient) {
          if (!recipient.matches('.stuff-slot, [data-dropable="true"]')) return;
          if (updateEntityItemDropVisual(recipient, event)) return;
      }
      const directTargetBox = event.target.closest?.('[id^="Box_Entite_"]');
      const itemId = getLastDraggedItemId();
      const hex = event.target.closest?.('.hex[data-position]');
      const targetBox = directTargetBox || hex?.querySelector?.('.entite-box[id^="Box_Entite_"]');
      const target = targetBox && entites.find(entity => String(entity.id) === targetBox.id.replace('Box_Entite_', ''));
      if (hex && itemId && getStageAccess().battleActive) {
          const state = getBattleInventoryState();
          const movable = state.battleSlots.includes(itemId)
              || state.battleGroundItems.some(entry => entry.itemId === itemId);
          if (movable) {
              hex.classList.add('hovered', 'battle-item-drop-target');
              targetBox?.classList.add('battle-item-drop-recipient');
          }
      }
      if (target && itemId) updateConsumableDropVisual(targetBox, itemId, target, event);
      else clearConsumableDropVisuals();
  }, true);

  document.addEventListener('dragleave', event => {
      const recipient = event.target.closest?.('.stuff-slot, [data-dropable]');
      if (recipient && !recipient.contains(event.relatedTarget)) {
          recipient.classList.remove('drag-over', 'drop-can-equip', 'drop-no-equip');
      }
      const box = event.target.closest?.('.consumable-drop-valid, .consumable-drop-invalid');
      if (box && !box.contains(event.relatedTarget)) clearConsumableDropVisuals();
      const hex = event.target.closest?.('.battle-item-drop-target');
      if (hex && !hex.contains(event.relatedTarget)) clearBattleItemDropPreview();
  }, true);

  document.addEventListener('dragend', () => {
      clearConsumableDropVisuals();
      clearBattleItemDropPreview();
      document.querySelectorAll('.drag-over, .drop-can-equip, .drop-no-equip').forEach(node => {
          node.classList.remove('drag-over', 'drop-can-equip', 'drop-no-equip');
      });
  }, true);

  document.addEventListener('drop', event => {
      clearConsumableDropVisuals();
      clearBattleItemDropPreview();
      const recipient = event.target.closest?.('.stuff-slot, [data-dropable]');
      if (recipient) {
          const draggedId = event.dataTransfer?.getData('application/x-game-item')
              || event.dataTransfer?.getData('text/plain') || getLastDraggedItemId();
          if (draggedId && /^e?i\d+-\d+$/.test(draggedId)) {
              event.preventDefault();
              event.stopImmediatePropagation();
              recipient.classList.remove('drag-over', 'drop-can-equip', 'drop-no-equip');
              if (recipient.matches('.stuff-slot, [data-dropable="true"]')) void dropInventoryOnEntity(event, recipient);
              endDragHelperCleanup();
              setLastDraggedItemId(null);
              return;
          }
      }
      const slot = event.target.closest?.('[data-battle-slot]');
      const hex = event.target.closest?.('.hex[data-position]');
      const storage = event.target.closest?.('.inventory-interface .inventory-content');
      if (!slot && !hex && !storage) return;
      const itemId = event.dataTransfer?.getData('application/x-game-item') || event.dataTransfer?.getData('text/plain') || getLastDraggedItemId();
      const item = itemId && getIngameItemById(itemId);
      if (!slot && !item) return;
      if (hex && item && !item.itemType?.includes('consumable')) {
          if (getStageAccess().menusAllowed) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          requireSafeMenuAccess();
          return;
      }
      if (storage && !getBattleInventoryState().battleSlots.includes(itemId)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (slot) {
          if (getBattleInventoryState().battleGroundItems.some(entry => entry.itemId === itemId)) {
              recoverBattleItem(itemId, Number(slot.dataset.battleSlot));
          } else if (slot.closest('.battle-satchel--combat')) {
              requireSafeMenuAccess();
          } else {
              moveBattleItem(itemId, Number(slot.dataset.battleSlot));
          }
      } else if (storage) {
          moveBattleItem(itemId, null);
      } else {
          const entityBox = event.target.closest?.('[id^="Box_Entite_"]');
          const entity = entityBox && entites.find(entry => String(entry.id) === entityBox.id.replace('Box_Entite_', ''));
          if (entity) void useConsumableItem(itemId, entity, { ground: getBattleInventoryState().battleGroundItems.some(entry => entry.itemId === itemId) });
          else dropBattleItemOnHex(itemId, hex);
      }
      endDragHelperCleanup();
      setLastDraggedItemId(null);
  }, true);

  document.addEventListener('click', (e) => {
      const shopInterface = document.querySelector('.shop-interface');
      if (!shopInterface) return; // Ne rien faire si .shop-interface n'est pas présent

      const clickedInsideItem = e.target.closest('.item-wrapper');

      // ✅ Ne rien faire si clic sur un objet OU une entité du shop
      if (clickedInsideItem && clickedInsideItem.classList.contains('item-wrapper')) return;

      // 🔄 Supprimer toutes les cartes .shop-item-card
      shopInterface.querySelectorAll('.shop-item-card').forEach(card => card.remove());

      // 🔄 Retirer .selected sur tous les wrappers
      document.querySelectorAll('.item-wrapper.selected').forEach(el => {
          el.classList.remove('selected');
          el.style.removeProperty('animation');
      });

      // 🔄 Réinitialiser le bouton vendeur
      const sellerButton = document.querySelector('.seller-button');
      if (sellerButton) {
          sellerButton.classList.remove('buy');
      }

      console.log("🧹 Sélection annulée (clic dans le vide)");
  });

  if (typeof window !== 'undefined') {
      bindInventoryEssenceCardOpenEvents();
  }

  if (typeof window !== 'undefined') {
      window.refreshPlayerInventoryInterface = () => {
          const inventoryDiv = document.querySelector('.inventory-interface');
          return inventoryDiv ? renderPlayerInventoryInterface(inventoryDiv) : false;
      };
      bindPlayerInventoryRealtimeRefresh();
  }
}
