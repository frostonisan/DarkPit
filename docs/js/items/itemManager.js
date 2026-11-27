import { overlayBounds, overlayRect } from '../ui/viewport.js';
import { clockNow, isCombatInteractionBlocked, trackCombatAction, notifyCombatAction } from "../combat/clock.js";
import { gameStorage as localStorage } from "../storage/sessionStorage.js";
import {
  appendItemHelperHeader, buildImprovementHelperFooter, appendItemEffectHelpers,
  appendEntityHelperContent, renderStuffContributionValue, renderItemStatHelperRow,
  appendOrfevreHelperDetail, generateEffectDescription,
} from "../data/helpers.js";
import { cachedResourceUrl } from "../data/loaderList.js";
import { ItemDetails } from '../data/itemList.js';
import { summons } from '../data/summons.js';
import { createIngameItem, calculateItemPower } from './items.js';
import { createUmbraCrystal } from './permanentItems.js';
import { hexCoordonne } from "../board/controller.js";
import {
  loadFromLocalStorage, saveToLocalStorage, saveItemsData, normalizeEquippedItems, getEquippedItemsById,
  loadEquippedItems, getCurrentLevel, loadPlayerInfo, savePlayerInfo, isAdminMode,
  spendPlayerExperience, creditPlayerExperience, saveCurrentGameData,
} from "../storage/gameStorage.js";
import {
  entites,
  entitesNestUp,
  generateUniqueID,
  buildStuffModifierDelta,
  getStuffWeaponOrfevreBoostDetails,
  getWeaponOrfevrePreviewActivePercent,
  getWeaponOrfevreStuffActivePercent,
  getEquipmentSlotKeys,
} from "../entities/runtime.js";
import { addEntityToArmyA, canRecruitEntity } from "../entities/armies.js";
import { createEntityCodex } from "../ui/codex/index.js";
import { createEntityPowerValue, cachedDisplayPower, schedulePowerRefresh } from "../ui/statistics/components.js";
import { refreshStatHelper } from "../ui/statistics/helpers.js";
import { itemApplyEffect, validateConsumableUse, hasImplementedConsumableEffects } from './itemEffectMecanics.js';
import { itemEffects } from './itemEffects.js';
import { EquipedEntityItems, recordEntityConsumable } from "../storage/entityStorage.js";
import { stuffInteraction } from './equipement.js';
import { glitterStuff } from '../biome/meteo.js';
import { stats } from '../data/statsData.js';
import {
  beginDragHelperCleanup,
  clearDragTransientHelpers,
  DRAG_HELPER_CLEANUP_EVENT,
  endDragHelperCleanup,
  isDragDropActive,
} from "../ui/drag.js";
import { getDisplayStatKey, normalizeStatKey, isNonLordCombatant, isLord } from "../entities/rules.js";
import { showGamePopupMessage } from "../ui/display.js";
import { getStageAccess, requireSafeMenuAccess, gameStarted } from "../app/state.js";
import { placeGroundItem, clearGroundItems, releaseGroundItem, spawnConsumableSummon, setAdminGroundSummonsInfinite } from "../combat/summons.js";
import { ensureStuffArmorReserve } from './armor.js';
import { getStuffResourceStocks, stripStuffResourceModifiers, getEffectiveMovementStock } from './resourceStocks.js';
import { getScoredItemQuality, isUmbraRestricted, getPowerBreakdownLines } from '../procedural/proc-bareme.js';
import { applyCombatProfileView } from "../rendering/hud.js";

let activeShop = null;

window.addEventListener('adminModeChanged', () => {
  if (activeShop?.mosaic.isConnected) {
    displayShopItems(activeShop.mosaic, activeShop.shopRight);
  }
  document.querySelectorAll('[data-shop-price]').forEach(node => {
    node.hidden = isAdminMode();
  });
});

function readCurrentPowerItem(item) {
  const equipped = item.equippedId ? getEquippedItemsById()[item.equippedId] : null;
  return equipped || loadFromLocalStorage('IngameItems', []).find(entry => entry.itemId === item.itemId)
    || (item.itemId ? getIngameItemById(item.itemId) : null) || item;
}

export function createItemPowerValue(item) {
  const value = document.createElement('small');
  value.className = 'item-power-value';
  value.dataset.adminPower = 'item-value';
  value.dataset.refreshPower = 'true';
  value._refreshPower = () => {
    value.hidden = !isAdminMode();
    if (value.hidden) return;
    const live = readCurrentPowerItem(item);
    const result = cachedDisplayPower(value, 'item', live, () => calculateItemPower(live));
    const text = formatStuffNumber(result.score);
    if (value.textContent !== text) value.textContent = text;
    value.setAttribute('aria-label', `Power : ${value.textContent}`);
  };
  value._refreshPower();
  schedulePowerRefresh();
  return value;
}

export function getIngameItemById(itemId) {
  if (!itemId || typeof itemId !== 'string') {
    console.warn(`❌ itemId invalide :`, itemId);
    return null;
  }

  const asArray = (raw) => Array.isArray(raw) ? raw : [];

  const data = loadFromLocalStorage('IngameItemsData', {
    items: [], Playerinventory: [], equippedItems: []
  });
  const player = loadFromLocalStorage('PlayerSave', {
    Playerinventory: [], equippedItems: [], items: []
  });

  const equippedItems = loadEquippedItems();
  const ingameItems = loadFromLocalStorage('IngameItems', []);

  const pool = [
    ...asArray(data.items),
    ...asArray(player.Playerinventory),
    ...normalizeEquippedItems(player.equippedItems),
    ...asArray(player.items),
    ...equippedItems,
    ...asArray(ingameItems),
  ].filter(Boolean);

  const found = pool.find(it =>
    it && (it.itemId === itemId || it.equippedId === itemId)
  );
  if (found) return found;

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
        7: { norm: 'Divin', color: '#b9fff3', class: 'quality-divine' },
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

function loadSelectedArmyA() {
    const army = loadFromLocalStorage('selectedArmyA', []);
    return Array.isArray(army) ? army : [];
}

function findArmyEntityById(entiteId) {
    if (!entiteId) return null;
    return loadSelectedArmyA().find(e => e.id == entiteId) || null;
}

function isStuffItemData(item) {
    const types = Array.isArray(item?.itemType)
        ? item.itemType
        : [item?.itemType].filter(Boolean);

    return types.includes('stuff');
}

function refreshCodexEquipmentInventoryPanels(item = null) {
    if (item && !isStuffItemData(item)) return;

    if (
        typeof window !== 'undefined' &&
        typeof window.refreshCodexEquipmentInventory === 'function'
    ) {
        window.refreshCodexEquipmentInventory();
    }
}

function getVisibleCodexEntityId() {
    const equipmentGrid = document.querySelector(
        '.sub-menu-stat.equipment-stat .codex-equipment-inventory-grid[data-entity-id]'
    );
    if (equipmentGrid?.dataset?.entityId) return equipmentGrid.dataset.entityId;

    const equipmentSubmenu = document.querySelector(
        '.sub-menu-stat.equipment-stat .entity-equipement[id^="equipment-"]'
    );
    if (equipmentSubmenu?.id) return equipmentSubmenu.id.replace('equipment-', '');

    const profileView = document.querySelector(
        '.sub-menu-stat.profile-stat .codex-entity-view[data-id]'
    );
    if (profileView?.dataset?.id) return profileView.dataset.id;

    const profileEquipment = document.querySelector(
        '.sub-menu-stat.profile-stat .entity-equipement[id^="equipment-"]'
    );
    if (profileEquipment?.id) return profileEquipment.id.replace('equipment-', '');

    const visibleCodexView = document.querySelector('.codex-entity-view[data-id]');
    if (visibleCodexView?.dataset?.id) return visibleCodexView.dataset.id;

    const visibleEquipment = document.querySelector('.entity-equipement[id^="equipment-"]');
    if (visibleEquipment?.id) return visibleEquipment.id.replace('equipment-', '');

    return null;
}

function findEntityForStuffInteraction(itemElement) {
    const slotElement = itemElement?.closest?.('.stuff-slot');
    const inventoryGrid = itemElement?.closest?.(
        '.codex-equipment-inventory-grid[data-entity-id]'
    );
    const entiteId =
        slotElement?.id?.split('-')[1] ||
        inventoryGrid?.dataset?.entityId ||
        getVisibleCodexEntityId();
    const entityFromDom = findArmyEntityById(entiteId);
    if (entityFromDom) return entityFromDom;

    return loadSelectedArmyA().find(e => e.isSelected) || null;
}

const EQUIPPED_STUFF_TRANSFER_CONFIRM_KEY = 'inventoryEquippedStuffTransferConfirmHidden';

function notifyInventoryItemsUpdated(reason, detail = {}) {
    if (typeof window === 'undefined') return;

    window.dispatchEvent(new CustomEvent('inventoryItemsUpdated', {
        detail: {
            reason,
            ...detail,
        },
    }));
}

function showEquipmentDropMessage(message, title = 'Équipement impossible') {
    showGamePopupMessage({
        mode: 'auto',
        tone: 'passive',
        key: 'equipment-transfer',
        title,
        message,
        duration: 2000,
        fadeMs: 1500,
    });
}

if (typeof window !== 'undefined') {
    window.showEquipmentDropMessage = showEquipmentDropMessage;
}

function showNoFreeEquipmentSlotMessage(targetEntity) {
    const name = targetEntity?.nickname || targetEntity?.name || 'Cette entité';
    showEquipmentDropMessage(`${name} ne possède pas de place d'équipement libre.`);
}

function getSlotKeyFromSlotId(slotId) {
    return typeof slotId === 'string' ? slotId.split('-')[0] : null;
}

function findEquippedSlotIdOnEntity(entity, equippedItem) {
    if (equippedItem?.slot) return equippedItem.slot;

    const equippedId = equippedItem?.equippedId;
    if (!entity?.stuff || !equippedId) return null;

    const slotKey = Object.keys(entity.stuff).find(key =>
        Array.isArray(entity.stuff[key]) &&
        entity.stuff[key].includes(equippedId)
    );

    return slotKey ? `${slotKey}-${entity.id}` : null;
}

function getSourceSlotElementForEquippedItem(entity, equippedItem) {
    const slotId = findEquippedSlotIdOnEntity(entity, equippedItem);
    if (!slotId) return null;

    const existingSlot = document.getElementById(slotId);
    if (existingSlot) return existingSlot;

    const ghostSlot = document.createElement('div');
    ghostSlot.id = slotId;
    ghostSlot.className = 'stuff-slot equiped';
    return ghostSlot;
}

function isStuffSlotEmptyForTransfer(slotElement, entity) {
    if (!slotElement) return false;

    const slotKey = getSlotKeyFromSlotId(slotElement.id);
    const stored = slotKey ? entity?.stuff?.[slotKey] : null;

    return (
        getEquipmentSlotKeys(entity).includes(slotKey) &&
        !slotElement.classList.contains('equiped') &&
        slotElement.children.length === 0 &&
        (!Array.isArray(stored) || stored.length === 0)
    );
}

function findFirstFreeSlotIdForEntityData(entity) {
    for (const slotKey of getEquipmentSlotKeys(entity)) {
        const stored = entity?.stuff?.[slotKey];
        if (!Array.isArray(stored) || stored.length === 0) {
            return `${slotKey}-${entity.id}`;
        }
    }

    return null;
}

function createGhostTargetSlot(slotId) {
    if (!slotId) return null;
    const ghostSlot = document.createElement('div');
    ghostSlot.id = slotId;
    ghostSlot.className = 'stuff-slot';
    return ghostSlot;
}

function getTargetSlotForEquippedStuffTransfer(targetElement, targetEntity) {
    const directSlot = targetElement?.closest?.('.stuff-slot') || targetElement;

    if (directSlot?.classList?.contains('stuff-slot')) {
        return directSlot.id === `${getSlotKeyFromSlotId(directSlot.id)}-${targetEntity?.id}`
            && getEquipmentSlotKeys(targetEntity).includes(getSlotKeyFromSlotId(directSlot.id))
            ? directSlot
            : null;
    }

    const container = document.getElementById(`equipment-${targetEntity?.id}`);
    if (!container) {
        return createGhostTargetSlot(findFirstFreeSlotIdForEntityData(targetEntity));
    }

    const visibleSlot = Array.from(container.querySelectorAll('.stuff-slot'))
        .sort((a, b) => {
            const aIndex = Number(a.id.match(/^slot(\d+)-/)?.[1] || 0);
            const bIndex = Number(b.id.match(/^slot(\d+)-/)?.[1] || 0);
            return aIndex - bIndex;
        })
        .find(slot => isStuffSlotEmptyForTransfer(slot, targetEntity)) || null;

    return visibleSlot || createGhostTargetSlot(findFirstFreeSlotIdForEntityData(targetEntity));
}

function getCodexEntryEntityId(element) {
    const codexEntry = element?.closest?.('[id^="CodexEntityList_"]') || element;
    const match = codexEntry?.id?.match(/^CodexEntityList_(.+)$/);
    return match?.[1] || null;
}

function resolveEquipmentDropEntity(element, fallbackEntityId = null) {
    const slot = element?.closest?.('.stuff-slot') || element;
    const slotEntityId = slot?.classList?.contains('stuff-slot')
        ? slot.id?.split('-')[1]
        : null;
    const entityId = slotEntityId || element?.closest?.('[data-entity-id]')?.dataset.entityId
        || getCodexEntryEntityId(element) || fallbackEntityId;
    return entites.find(entity => String(entity.id) === String(entityId)) || findArmyEntityById(entityId);
}

function getDraggedItemIdFromEvent(event = null) {
    return (
        event?.dataTransfer?.getData?.('application/x-game-item') ||
        event?.dataTransfer?.getData?.('text/plain') ||
        getDraggedItemIdFromDOM() ||
        getLastDraggedItemId()
    );
}

function getDraggedItemDataFromEvent(event = null) {
    const itemId = getDraggedItemIdFromEvent(event);
    if (!itemId || !/^e?i\d+-\d+$/.test(itemId)) {
        return { itemId: null, item: null };
    }

    return {
        itemId,
        item: getIngameItemById(itemId),
    };
}

function escapeSelectorValue(value) {
    return globalThis.CSS?.escape
        ? CSS.escape(String(value))
        : String(value).replace(/["\\]/g, '\\$&');
}

function findDraggedItemElementById(itemId) {
    if (!itemId) return null;

    const escapedId = escapeSelectorValue(itemId);
    return (
        document.querySelector(`img.inventory-item-icon.using[data-drag-item-id="${escapedId}"]`) ||
        document.querySelector(`img.inventory-item-icon[data-drag-item-id="${escapedId}"]`) ||
        document.querySelector(`[data-equipped-id="${escapedId}"] img.inventory-item-icon.using`) ||
        document.querySelector(`[data-equipped-id="${escapedId}"] img.inventory-item-icon`) ||
        document.querySelector(`img.inventory-item-icon.using[id="${escapedId}"]`) ||
        document.getElementById(itemId)
    );
}

function clearEquipmentDropVisual(element) {
    element?.classList?.remove('drop-can-equip', 'drop-no-equip');
}

function updateEquipmentDropVisual(element, event = null, fallbackEntityId = null) {
    clearEquipmentDropVisual(element);

    const { item } = getDraggedItemDataFromEvent(event);
    if (!isStuffItemData(item)) return null;

    const slot = element?.closest?.('.stuff-slot') || element;
    const codexEntry = element?.closest?.('[id^="CodexEntityList_"]') || element;
    const isEquipmentDropSurface =
        Boolean(slot?.classList?.contains('stuff-slot')) ||
        element?.dataset?.dropable === 'true' ||
        Boolean(codexEntry?.id?.startsWith?.('CodexEntityList_'));

    if (!isEquipmentDropSurface) return null;

    const targetEntity = resolveEquipmentDropEntity(element, fallbackEntityId);
    const targetSlot = getTargetSlotForEquippedStuffTransfer(element, targetEntity);
    const canEquip = Boolean(getStageAccess().menusAllowed && targetEntity
        && findArmyEntityById(targetEntity.id) && getEquipmentSlotKeys(targetEntity).length
        && (!slot?.classList?.contains('stuff-slot') || targetSlot));

    element?.classList?.toggle('drop-can-equip', canEquip);
    element?.classList?.toggle('drop-no-equip', !canEquip);
    if (event?.dataTransfer) event.dataTransfer.dropEffect = canEquip ? 'move' : 'none';

    return { targetEntity, targetSlot, canEquip };
}

function shouldSkipEquippedStuffTransferConfirm() {
    try {
        return localStorage.getItem(EQUIPPED_STUFF_TRANSFER_CONFIRM_KEY) === 'true';
    } catch {
        return false;
    }
}

function rememberSkipEquippedStuffTransferConfirm(value) {
    try {
        if (value) localStorage.setItem(EQUIPPED_STUFF_TRANSFER_CONFIRM_KEY, 'true');
    } catch {}
}

function confirmEquippedStuffTransfer({ item, sourceEntity, targetEntity, replacedItem = null }) {
    if (shouldSkipEquippedStuffTransferConfirm()) {
        return Promise.resolve(true);
    }

    const checkboxLabel = document.createElement('label');
    checkboxLabel.className = 'inventory-transfer-confirm-skip';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    const checkboxText = document.createElement('span');
    checkboxText.textContent = 'Ne plus afficher';
    checkboxLabel.appendChild(checkbox);
    checkboxLabel.appendChild(checkboxText);

    return showGamePopupMessage({
        mode: 'manual',
        tone: 'normal',
        key: 'equipment-transfer',
        title: replacedItem ? 'Échanger des équipements' : 'Déplacer un équipement',
        message:
            `Vous allez déséquiper ${item.displayName || 'cet équipement'} de ` +
            `${sourceEntity?.nickname || sourceEntity?.name || 'cette entité'} pour équiper ` +
            `${targetEntity?.nickname || targetEntity?.name || 'cette entité'}.` +
            (replacedItem ? ` ${replacedItem.displayName} sera équipé par ${sourceEntity.nickname || sourceEntity.name}.` : ''),
        extraContent: checkboxLabel,
        actions: [
            { label: 'Annuler', value: false },
            { label: 'Confirmer', value: true, primary: true },
        ],
    }).then(accepted => {
        rememberSkipEquippedStuffTransferConfirm(checkbox.checked && accepted);
        return Boolean(accepted);
    });
}

function isEquippedStuffDrag(itemId, item) {
    return Boolean(
        item?.equippedId ||
        (typeof itemId === 'string' && itemId.startsWith('ei'))
    ) && isStuffItemData(item);
}

async function unequipEquippedStuffFromOwner(equippedItem, itemElement, event) {
    if (!requireSafeMenuAccess()) return false;
    const sourceEntity = findArmyEntityById(equippedItem?.equippedTo);
    if (!sourceEntity) {
        console.warn('❌ Porteur de l’équipement introuvable.');
        return false;
    }

    const sourceSlot = getSourceSlotElementForEquippedItem(sourceEntity, equippedItem);
    if (!sourceSlot?.id) {
        console.warn('❌ Slot source introuvable pour déséquiper.');
        return false;
    }

    stuffInteraction({
        mode: 'codex-to-inventory',
        source: 'codex',
        target: 'inventory',
        itemElement,
        itemData: equippedItem,
        targetEntity: sourceEntity,
        targetElement: sourceSlot,
        event,
    });

    notifyInventoryItemsUpdated('equipped-stuff-unequipped', {
        itemId: equippedItem.itemId,
        equippedId: equippedItem.equippedId,
        sourceEntityId: sourceEntity.id,
    });

    if (typeof window !== 'undefined' && typeof window.refreshPlayerInventoryInterface === 'function') {
        window.refreshPlayerInventoryInterface();
    }

    return true;
}

const pendingEquipmentTransfers = new Set();

async function transferEquippedStuffToEntity({
    equippedItem, itemElement, targetEntity, targetElement, event,
} = {}) {
    if (!requireSafeMenuAccess() || !findArmyEntityById(targetEntity?.id)) return false;
    const itemId = equippedItem?.equippedId || equippedItem?.itemId;
    if (!itemId || pendingEquipmentTransfers.has(itemId)) return false;
    pendingEquipmentTransfers.add(itemId);
    try {
        const sourceId = equippedItem.equippedTo;
        const sourceEntity = sourceId
            ? entites.find(entity => String(entity.id) === String(sourceId)) || findArmyEntityById(sourceId)
            : null;
        if (sourceId && !sourceEntity) return false;
        if (String(sourceEntity?.id) === String(targetEntity.id) && !targetElement?.closest?.('.stuff-slot')) return true;
        let targetSlot = getTargetSlotForEquippedStuffTransfer(targetElement, targetEntity);
        let selectedReplacementId;
        let replacementConfirmed = false;
        if (!targetSlot) {
            if (targetElement?.closest?.('.stuff-slot')) return false;
            const keys = getEquipmentSlotKeys(targetEntity);
            if (!keys.length) { showNoFreeEquipmentSlotMessage(targetEntity); return false; }
            const label = document.createElement('label');
            label.className = 'equipment-swap-choice';
            label.textContent = 'Équipement à remplacer : ';
            const select = document.createElement('select');
            select.setAttribute('aria-label', 'Équipement à remplacer');
            for (const key of keys) {
                const occupant = getEquippedItemsById()[targetEntity.stuff[key]?.[0]];
                if (!occupant) continue;
                const option = document.createElement('option');
                option.value = key;
                option.dataset.equippedId = occupant.equippedId;
                option.textContent = occupant.displayName || 'Équipement';
                select.appendChild(option);
            }
            if (!select.options.length) return false;
            label.appendChild(select);
            const accepted = await showGamePopupMessage({
                mode: 'manual', tone: 'normal', key: 'equipment-transfer',
                title: 'Remplacer un équipement', extraContent: label,
                message: sourceEntity
                    ? `L’équipement choisi sera transféré à ${sourceEntity.nickname || sourceEntity.name}.`
                    : 'L’équipement choisi retournera dans votre inventaire.',
                actions: [
                    { label: 'Annuler', value: false },
                    { label: 'Échanger', value: true, primary: true },
                ],
            });
            if (!accepted) return false;
            replacementConfirmed = true;
            selectedReplacementId = select.selectedOptions[0]?.dataset.equippedId;
            targetSlot = document.getElementById(`${select.value}-${targetEntity.id}`)
                || createGhostTargetSlot(`${select.value}-${targetEntity.id}`);
        }
        const slotKey = getSlotKeyFromSlotId(targetSlot.id);
        const replacedId = selectedReplacementId || targetEntity.stuff?.[slotKey]?.[0] || null;
        if (sourceEntity && !replacementConfirmed && String(sourceEntity.id) !== String(targetEntity.id)) {
            if (!(await confirmEquippedStuffTransfer({
                item: equippedItem, sourceEntity, targetEntity, replacedItem: getEquippedItemsById()[replacedId],
            }))) return false;
        }
        if (!requireSafeMenuAccess()) return false;
        const currentTarget = entites.find(entity => String(entity.id) === String(targetEntity.id))
            || findArmyEntityById(targetEntity.id);
        const currentItem = sourceEntity ? getEquippedItemsById()[itemId] : getIngameItemById(itemId);
        if (!currentTarget || !findArmyEntityById(currentTarget.id) || !currentItem
            || (sourceEntity && !findArmyEntityById(sourceEntity.id))
            || (currentTarget.stuff?.[slotKey]?.[0] || null) !== replacedId
            || (sourceEntity && String(currentItem.equippedTo) !== String(sourceEntity.id))) return false;
        const currentSource = sourceEntity && (String(sourceEntity.id) === String(currentTarget.id)
            ? currentTarget
            : entites.find(entity => String(entity.id) === String(sourceEntity.id)) || findArmyEntityById(sourceEntity.id));
        const result = stuffInteraction({
            mode: 'inventory-to-codex', source: sourceEntity ? 'codex' : 'inventory',
            target: 'codex', itemElement, itemData: currentItem, sourceEntity: currentSource,
            targetEntity: currentTarget, targetElement: targetSlot, event,
        });
        if (!result) return false;
        notifyInventoryItemsUpdated('equipped-stuff-transferred', {
            itemId: currentItem.itemId, sourceEntityId: currentSource?.id, targetEntityId: currentTarget.id,
        });
        window.refreshPlayerInventoryInterface?.();
        return true;
    } finally {
        pendingEquipmentTransfers.delete(itemId);
    }
}

const pendingConsumableItems = new Set();
const pendingConsumableTargets = new Set();

export const BATTLE_ITEM_GROUND_DURATION_MS = 20000;
const isGroundItemUnexpired = entry => entry?.infinite === true || entry?.expiresAt > clockNow();

export function isBattleConsumable(item) {
    return getBattleItemEligibility(item).ok;
}

export function getBattleItemEligibility(item) {
    const allowed = Boolean(item?.itemType?.includes('consumable') &&
        !item.itemType.includes('stuff') && !item.itemType.includes('essence') &&
        !item.effets?.includes('itemResetProgression') && item.battleUsable !== false);
    if (!allowed) return { ok: false, message: 'Impossible de transporter en combat.' };
    if (!hasImplementedConsumableEffects(item)) return { ok: false, message: 'Impossible de transporter en combat : les effets de cet objet ne sont pas encore disponibles.' };
    return { ok: true };
}

const inventoryEntryId = entry => typeof entry === 'string' ? entry : entry?.itemId;

export function getBattleInventoryState() {
    const save = loadFromLocalStorage('PlayerSave', {});
    const count = loadPlayerInfo().battleSlotCount;
    return {
        ...save,
        Playerinventory: Array.isArray(save.Playerinventory) ? save.Playerinventory : [],
        battleSlots: Array.from({ length: Math.max(count, save.battleSlots?.length || 0) }, (_, index) => save.battleSlots?.[index] || null),
        battleGroundItems: Array.isArray(save.battleGroundItems) ? save.battleGroundItems : [],
        adminGroundSummons: Array.isArray(save.adminGroundSummons) ? save.adminGroundSummons : [],
    };
}

function itemLocations(save) {
    return [
        ...(save.Playerinventory || []).map(entry => ({ id: inventoryEntryId(entry), location: 'inventory' })),
        ...(save.battleSlots || []).flatMap((id, index) => id ? [{ id, location: `satchel:${index}` }] : []),
        ...(save.battleGroundItems || []).map(entry => ({ id: entry.itemId, location: `ground:${entry.stageId}:${entry.position}` })),
        ...(save.equippedItems || []).map(entry => ({ id: entry.itemId, location: `equipment:${entry.equippedId}` })),
    ];
}

export function validateBattleInventoryState(save = getBattleInventoryState(), slotCount = loadPlayerInfo().battleSlotCount) {
    const registry = loadFromLocalStorage('IngameItems', []);
    if (!Array.isArray(registry) || registry.some(item => !item || typeof item.itemId !== 'string')) {
        return { ok: false, message: 'Registre des objets invalide.' };
    }
    const registryCounts = new Map();
    for (const item of registry) registryCounts.set(item.itemId, (registryCounts.get(item.itemId) || 0) + 1);
    const ids = new Set();
    for (const { id, location } of itemLocations(save)) {
        const equipped = location.startsWith('equipment:');
        if (!id || (!equipped && registryCounts.get(id) !== 1)) {
            return { ok: false, message: `ID d'objet absent ou ambigu : ${id}.` };
        }
        if (ids.has(id)) return { ok: false, message: `Objet présent à plusieurs emplacements : ${id}.` };
        ids.add(id);
    }
    if (save.battleSlots.length !== slotCount) return { ok: false, message: 'Capacité de sacoche incohérente.' };
    return { ok: true };
}

function checkBattleInventory(save) {
    const result = validateBattleInventoryState(save);
    if (!result.ok) {
        console.error('[BattleInventory]', { result: 'rejected', reason: result.message });
        showConsumableFailure(result.message);
    }
    return result.ok;
}

function saveBattleInventoryState(save, action, itemId = null, { notify = true, slotCount } = {}) {
    const valid = validateBattleInventoryState(save, slotCount);
    if (!valid.ok) { showConsumableFailure(valid.message); return false; }
    const before = new Map(itemLocations(loadFromLocalStorage('PlayerSave', {})).map(entry => [entry.id, entry.location]));
    const after = new Map(itemLocations(save).map(entry => [entry.id, entry.location]));
    try { saveToLocalStorage('PlayerSave', save); }
    catch (error) {
        console.error('[BattleInventory]', { action, itemId, result: 'rejected', reason: 'storage-write', error });
        showConsumableFailure('Enregistrement impossible. Action non effectuée.');
        return false;
    }
    const operationId = `btx-${crypto.randomUUID()}`;
    for (const id of new Set([...before.keys(), ...after.keys()])) {
        if (before.get(id) !== after.get(id)) console.info('[BattleInventory]', {
            operationId, itemId: id, from: before.get(id) || null, to: after.get(id) || null, reason: action, result: 'committed',
        });
    }
    try { saveItemsData(); }
    catch (error) { console.error('[BattleInventory] Export non actualisé, PlayerSave fait foi.', error); }
    notifyCombatAction();
    if (notify) notifyInventoryItemsUpdated(action, { itemId });
    return true;
}

export function setBattleSlotCount(value, { admin = false } = {}) {
    if (!admin && !requireSafeMenuAccess()) return false;
    return resizeBattleSlots(value);
}

function resizeBattleSlots(value) {
    const count = Number(value);
    if (!Number.isInteger(count) || count < 0 || count > 24) return false;
    const save = getBattleInventoryState();
    if (!checkBattleInventory(save)) return false;
    if (save.battleSlots.some(id => pendingConsumableItems.has(id))) return false;
    for (const id of save.battleSlots.slice(count).filter(Boolean)) {
        const item = getIngameItemById(id);
        if (!item) return false;
        save.Playerinventory.push(item);
    }
    save.battleSlots = Array.from({ length: count }, (_, index) => save.battleSlots[index] || null);
    const info = loadPlayerInfo();
    info.battleSlotCount = count;
    if (!saveBattleInventoryState(save, 'capacity', null, { slotCount: count, notify: false })) return false;
    savePlayerInfo(info, { updatedKey: 'battleSlotCount' });
    notifyInventoryItemsUpdated('capacity');
    return true;
}

export function moveBattleItem(itemId, slotIndex = null) {
    if (!requireSafeMenuAccess() || pendingConsumableItems.has(itemId)) return false;
    const item = getIngameItemById(itemId);
    if (item?.groundOnly) return false;
    const eligibility = getBattleItemEligibility(item);
    if (!eligibility.ok) {
        showConsumableFailure(eligibility.message);
        return false;
    }
    const save = getBattleInventoryState();
    if (!checkBattleInventory(save)) return false;
    const source = save.battleSlots.indexOf(itemId);
    const inventoryIndex = save.Playerinventory.findIndex(entry => inventoryEntryId(entry) === itemId);
    if (source < 0 && inventoryIndex < 0) return false;
    if (slotIndex === null) {
        if (source < 0) return false;
        save.battleSlots[source] = null;
        save.Playerinventory.push(item);
    } else {
        if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= save.battleSlots.length) return false;
        const previous = save.battleSlots[slotIndex];
        if (source === slotIndex || pendingConsumableItems.has(previous)) return false;
        if (source >= 0) save.battleSlots[source] = previous;
        else {
            const displaced = previous && getIngameItemById(previous);
            if (previous && !displaced) return false;
            save.Playerinventory.splice(inventoryIndex, 1);
            if (displaced) save.Playerinventory.push(displaced);
        }
        save.battleSlots[slotIndex] = itemId;
    }
    return saveBattleInventoryState(save, 'move', itemId);
}

function consumableSourceAvailable(itemId, { ground = false } = {}) {
    const access = getStageAccess();
    if (access.unavailable) return false;
    const save = getBattleInventoryState();
    const item = getIngameItemById(itemId);
    if (access.inStage && access.threatened && !access.admin && !access.battleActive && (
        ground || save.battleSlots.includes(itemId)
    )) return false;
    if (ground) return isBattleConsumable(item) && save.battleGroundItems.some(entry =>
        entry.itemId === itemId && String(entry.stageId) === String(getCurrentLevel()) && isGroundItemUnexpired(entry));
    if (save.battleSlots.includes(itemId)) return isBattleConsumable(item);
    return access.menusAllowed && isConsumableInInventory(itemId);
}

function showStoredGroundItem(entry) {
    const item = getIngameItemById(entry.itemId);
    const hex = document.querySelector(`.hex[data-position="${CSS.escape(String(entry.position))}"]`);
    if (!hex || !isBattleConsumable(item)) return false;
    return placeGroundItem(hex, item, {
        expiresAt: entry.expiresAt,
        infinite: entry.infinite === true,
        durationMs: BATTLE_ITEM_GROUND_DURATION_MS,
        consume: target => useConsumableItem(entry.itemId, target, { ground: true, silent: true }),
        settled: status => {
            if (status !== 'consumed' && status !== 'retrieved') {
                const save = getBattleInventoryState();
                save.battleGroundItems = save.battleGroundItems.filter(record => record.itemId !== entry.itemId);
                if (saveBattleInventoryState(save, status, entry.itemId)) removeItem(entry.itemId);
            }
        },
        moved: position => {
            const save = getBattleInventoryState();
            const stored = save.battleGroundItems.find(record => record.itemId === entry.itemId);
            if (stored) {
                stored.position = position;
                saveBattleInventoryState(save, 'ground-displaced', entry.itemId);
            }
        },
        setupDrag: img => {
            if (!img) return;
            bindPersistentDescription(img, item, item.itemId, 'item');
            if (item.groundOnly) return;
            img.dataset.dragItemId = entry.itemId;
            setupDragAndDropItem(img, entry.itemId);
        },
    });
}

export function dropBattleItemOnHex(itemId, hex) {
    const access = getStageAccess();
    if (!access.battleActive || access.unavailable || !hex?.isConnected || !hex.matches('.hex[data-position]')) return false;
    if (pendingConsumableItems.has(itemId)) return false;
    const save = getBattleInventoryState();
    if (!checkBattleInventory(save)) return false;
    const index = save.battleSlots.indexOf(itemId);
    if (index < 0 || !isBattleConsumable(getIngameItemById(itemId))) return false;
    const entry = { itemId, position: hex.dataset.position, stageId: getCurrentLevel(), expiresAt: clockNow() + BATTLE_ITEM_GROUND_DURATION_MS };
    save.battleSlots[index] = null;
    save.battleGroundItems.push(entry);
    if (!saveBattleInventoryState(save, 'ground-placed', itemId)) return false;
    return showStoredGroundItem(entry);
}

export function recoverBattleItem(itemId, slotIndex) {
    if (getIngameItemById(itemId)?.groundOnly) return false;
    const access = getStageAccess();
    if (!access.battleActive || access.unavailable || pendingConsumableItems.has(itemId)) return false;
    const save = getBattleInventoryState();
    if (!checkBattleInventory(save) || !Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= save.battleSlots.length) return false;
    const entry = save.battleGroundItems.find(record => record.itemId === itemId);
    if (!entry || !isGroundItemUnexpired(entry) || String(entry.stageId) !== String(getCurrentLevel())) return false;
    if (!isBattleConsumable(getIngameItemById(itemId))) return false;
    const hex = document.querySelector(`.hex[data-position="${CSS.escape(entry.position)}"]`);
    if (!hex?.isConnected) return false;
    const previous = save.battleSlots[slotIndex];
    if (pendingConsumableItems.has(previous) || (previous && !isBattleConsumable(getIngameItemById(previous)))) return false;
    save.battleGroundItems = save.battleGroundItems.filter(record => record.itemId !== itemId);
    save.battleSlots[slotIndex] = itemId;
    const replacement = previous ? { itemId: previous, position: entry.position, stageId: entry.stageId, expiresAt: clockNow() + BATTLE_ITEM_GROUND_DURATION_MS } : null;
    if (replacement) save.battleGroundItems.push(replacement);
    if (!saveBattleInventoryState(save, 'ground-recovered', itemId)) return false;
    releaseGroundItem(itemId);
    if (replacement) showStoredGroundItem(replacement);
    return true;
}

export function restoreBattleGroundItems() {
    const access = getStageAccess();
    const stage = loadFromLocalStorage('GameStages', { stages: [] }).stages
        .find(stage => String(stage.id) === String(getCurrentLevel()));
    const adminStage = isAdminMode() && stage?.level_type === 'admin';
    if (!access.inStage || access.unavailable || (!adminStage && !access.battleActive && (!stage?.victory || access.threatened))) return;
    for (const entry of getBattleInventoryState().battleGroundItems) {
        if (!isGroundItemUnexpired(entry) || String(entry.stageId) !== String(getCurrentLevel()) || !showStoredGroundItem(entry)) {
            releaseGroundItem(entry.itemId);
            removeItem(entry.itemId);
        }
    }
    if (adminStage) {
        const save = getBattleInventoryState();
        save.adminGroundSummons = save.adminGroundSummons.filter(entry => isGroundItemUnexpired(entry)
            && String(entry.stageId) === String(getCurrentLevel()));
        if (saveBattleInventoryState(save, 'admin-ground-restored')) {
            save.adminGroundSummons.forEach(showStoredAdminGroundSummon);
        }
    }
}

window.addEventListener('battleStarted', restoreBattleGroundItems);

// Register a newly created item on the ground without routing it through the satchel.
export function spawnBattleGroundItem(item, hex, action = 'ground-spawned', { infinite = false } = {}) {
    if (!item?.itemId || !isBattleConsumable(item) || !hex?.isConnected
        || !hex.matches('#hexGrid .hex[data-position]') || !getCurrentLevel()) return false;
    const save = getBattleInventoryState();
    if (!checkBattleInventory(save) || itemLocations(save).some(entry => entry.id === item.itemId)) return false;
    const entry = { itemId: item.itemId, position: hex.dataset.position, stageId: String(getCurrentLevel()),
        infinite, expiresAt: infinite ? null : clockNow() + BATTLE_ITEM_GROUND_DURATION_MS };
    save.battleGroundItems.push(entry);
    if (!saveBattleInventoryState(save, action, item.itemId) || !showStoredGroundItem(entry)) {
        removeItem(item.itemId);
        return false;
    }
    return true;
}

function showStoredAdminGroundSummon(entry) {
    const summon = summons.find(row => row.summonEffect === entry.summonEffect && row.summonType === 'consommable');
    const hex = document.querySelector(`#hexGrid .hex[data-position="${CSS.escape(String(entry.position))}"]`);
    if (!summon || !hex) return false;
    return spawnConsumableSummon(hex, summon, {
        adminId: entry.id, adminSpawn: true, infinite: entry.infinite === true, expiresAt: entry.expiresAt,
        effectClass: summon.summonEffect,
        onSettled: () => {
            const save = getBattleInventoryState();
            save.adminGroundSummons = save.adminGroundSummons.filter(row => row.id !== entry.id);
            saveBattleInventoryState(save, 'admin-summon-settled');
        },
        onMoved: position => {
            const save = getBattleInventoryState();
            const stored = save.adminGroundSummons.find(row => row.id === entry.id);
            if (stored) {
                stored.position = position;
                saveBattleInventoryState(save, 'admin-summon-displaced');
            }
        },
    }).ok;
}

export function spawnAdminGroundSummon(summonEffect, hex, { infinite = false } = {}) {
    if (!isAdminMode() || window.levelRunning !== 'admin' || !hex?.matches('#hexGrid .hex[data-position]')) return false;
    const summon = summons.find(row => row.summonEffect === summonEffect && row.summonType === 'consommable');
    if (!summon) return false;
    const save = getBattleInventoryState();
    const entry = { id: crypto.randomUUID(), summonEffect, position: hex.dataset.position, stageId: String(getCurrentLevel()),
        infinite, expiresAt: infinite ? null : clockNow() + summon.summonDuration * 1000 };
    save.adminGroundSummons.push(entry);
    if (!saveBattleInventoryState(save, 'admin-summon-spawned')) return false;
    if (showStoredAdminGroundSummon(entry)) return true;
    const updated = getBattleInventoryState();
    updated.adminGroundSummons = updated.adminGroundSummons.filter(row => row.id !== entry.id);
    saveBattleInventoryState(updated, 'admin-summon-rejected');
    return false;
}

export function setAdminGroundItemsInfinite(infinite) {
    if (!isAdminMode() || window.levelRunning !== 'admin') return false;
    const save = getBattleInventoryState();
    const now = clockNow();
    for (const entry of [...save.battleGroundItems, ...save.adminGroundSummons]) {
        if (String(entry.stageId) !== String(getCurrentLevel())) continue;
        const native = entry.summonEffect && summons.find(row => row.summonEffect === entry.summonEffect);
        if (!native && getIngameItemById(entry.itemId)?.origin !== 'admin-spawn') continue;
        entry.infinite = infinite;
        entry.expiresAt = infinite ? null : now + (native ? native.summonDuration * 1000 : BATTLE_ITEM_GROUND_DURATION_MS);
    }
    if (!saveBattleInventoryState(save, 'admin-ground-infinite')) return false;
    setAdminGroundSummonsInfinite(infinite);
    return true;
}

window.addEventListener('stageVictoryRegistered', ({ detail }) => {
    const stage = detail?.stage;
    if (stage?.permanentReward !== true || String(stage.id) !== String(getCurrentLevel())) return;
    const count = document.querySelectorAll('#hexGrid .hex').length;
    const positions = ['neutral', 'A', 'B'].flatMap(side => hexCoordonne(side, 'middle', 'center', count));
    const position = positions.find(position => !document.querySelector(
        `.hex[data-position="${CSS.escape(position)}"] .chest-container`));
    const hex = position && document.querySelector(`.hex[data-position="${CSS.escape(position)}"]`);
    if (!hex) return;
    const save = getBattleInventoryState();
    if (!checkBattleInventory(save)) return;
    const item = createUmbraCrystal({ origin: `stage:${stage.id}` });
    if (!item) return;
    if (!spawnBattleGroundItem(item, hex, 'permanent-reward')) removeItem(item.itemId);
});

export function clearBattleGroundItems() {
    clearGroundItems();
    for (const entry of getBattleInventoryState().battleGroundItems) removeItem(entry.itemId);
    const save = getBattleInventoryState();
    if (save.adminGroundSummons.length) {
        save.adminGroundSummons = [];
        saveBattleInventoryState(save, 'admin-ground-cleared');
    }
}

function isConsumableInInventory(itemId) {
    const inventory = loadFromLocalStorage('PlayerSave', {}).Playerinventory;
    return Array.isArray(inventory) && inventory.some(entry =>
        (typeof entry === 'string' ? entry : entry?.itemId) === itemId
    );
}

function showConsumableFailure(message) {
    showGamePopupMessage({
        mode: 'auto',
        tone: 'warning',
        key: 'consumable-failure',
        title: 'Utilisation impossible',
        message,
    });
}

export function previewConsumableItemUse(itemId, targetEntity, options = {}) {
    if (isCombatInteractionBlocked()) return { ok: false, retryable: true, message: 'Combat en pause absolue.' };
    if (!itemId || targetEntity?.id == null) return { ok: false, message: 'Cible indisponible.' };
    const targetId = String(targetEntity.id);
    if (!getStageAccess().menusAllowed) {
        targetEntity = entites.find(entity => String(entity.id) === targetId);
        if (!targetEntity) return { ok: false, message: 'Cible indisponible.' };
    }
    if (pendingConsumableItems.has(itemId) || pendingConsumableTargets.has(targetId)) {
        return { ok: false, busy: true, message: 'Une consommation est déjà en cours.' };
    }
    const item = getIngameItemById(itemId);
    if (!consumableSourceAvailable(itemId, options) || !item?.itemType?.includes('consumable')) {
        return { ok: false, message: 'Objet indisponible dans cet emplacement.' };
    }
    return { ...validateConsumableUse(targetEntity, item), item, target: targetEntity };
}

export function clearConsumableDropVisuals() {
    document.querySelectorAll('.consumable-drop-valid, .consumable-drop-invalid').forEach(node => {
        node.classList.remove('consumable-drop-valid', 'consumable-drop-invalid');
        delete node.dataset.consumableDropMessage;
    });
}

export function updateConsumableDropVisual(node, itemId, target, event) {
    const item = getIngameItemById(itemId);
    if (!item?.itemType?.includes('consumable')) return;
    const ground = getBattleInventoryState().battleGroundItems.some(entry => entry.itemId === itemId);
    const result = previewConsumableItemUse(itemId, target, { ground });
    clearConsumableDropVisuals();
    node.classList.add(result.ok ? 'consumable-drop-valid' : 'consumable-drop-invalid');
    node.dataset.consumableDropMessage = result.ok ? 'Consommer' : result.message;
    if (event?.dataTransfer) event.dataTransfer.dropEffect = result.ok ? 'move' : 'none';
}

export async function useConsumableItem(itemId, targetEntity, options = {}) {
    if (isCombatInteractionBlocked()) return { ok: false, retryable: true, message: 'Combat en pause absolue.' };
    const targetId = String(targetEntity?.id ?? '');
    if (!itemId || !targetId) return { ok: false };
    if (!getStageAccess().menusAllowed) {
        targetEntity = entites.find(entity => String(entity.id) === targetId);
        if (!targetEntity) return { ok: false, message: 'Cible indisponible.' };
    }
    if (pendingConsumableItems.has(itemId) || pendingConsumableTargets.has(targetId)) {
        return { ok: false, busy: true };
    }
    const prepared = previewConsumableItemUse(itemId, targetEntity, options);
    if (!prepared.ok) {
        if (!options.silent) {
            if (!getStageAccess().menusAllowed && !consumableSourceAvailable(itemId, options)) requireSafeMenuAccess();
            else showConsumableFailure(prepared.message);
        }
        return prepared;
    }
    if (!checkBattleInventory(getBattleInventoryState())) return { ok: false, message: 'Registre des objets incohérent.' };
    targetEntity = prepared.target;
    const item = prepared.item;
    const consumableSource = options.ground ? 'ground'
        : getBattleInventoryState().battleSlots.includes(itemId) ? 'pouch' : 'inventory';
    const consumedInCombat = gameStarted;
    const feedback = [];
    let spent = false, finishAction;
    const commit = () => {
        if (spent) return true;
        if (!consumableSourceAvailable(itemId, options)) return false;
        const save = getBattleInventoryState();
        if (!checkBattleInventory(save)) return false;
        save.Playerinventory = save.Playerinventory.filter(entry => inventoryEntryId(entry) !== itemId);
        save.battleSlots = save.battleSlots.map(id => id === itemId ? null : id);
        save.battleGroundItems = save.battleGroundItems.filter(entry => entry.itemId !== itemId);
        spent = saveBattleInventoryState(save, `consumed-by:${targetId}`, itemId, { notify: false });
        if (spent) trackCombatAction(new Promise(resolve => { finishAction = resolve; }));
        return spent;
    };
    pendingConsumableItems.add(itemId);
    pendingConsumableTargets.add(targetId);
    try {
        let result;
        for (const step of prepared.steps) {
            result = await itemApplyEffect(targetEntity, step.name, item, {
                canApply: () => spent || consumableSourceAvailable(itemId, options),
                commit, step, feedback,
            });
            if (result?.ok !== true) {
                if (result?.message && !result.cancelled && !options.silent) showConsumableFailure(result.message);
                return spent ? { ok: true, warning: result?.message, consumed: true } : (result || { ok: false });
            }
        }
        return result;
    } catch (error) {
        console.error('Impossible d’utiliser le consommable :', error);
        const message = spent ? 'Objet consommé, mais une étape de son application a échoué.' : 'L’utilisation a échoué avant consommation. Objet conservé.';
        if (!options.silent) showConsumableFailure(message);
        return { ok: spent, consumed: spent, warning: spent ? message : undefined, message };
    } finally {
        if (spent) {
            try {
                recordEntityConsumable(targetEntity, {
                    source: consumableSource, inCombat: consumedInCombat,
                    hostile: item.effets.includes('itemDamage'),
                    support: item.effets.some(effect => ['itemHeal', 'itemRez', 'itemResetProgression', 'itemMovement', 'itemFadedLife', 'itemPermanentStat'].includes(effect)),
                });
            } catch (error) {
                console.error('[BattleInventory] Statistiques du consommable non sauvegardees.', { itemId, error });
            }
            try { removeItem(itemId, { from: 'inventory' }); }
            catch (error) { console.error('[BattleInventory] Objet déjà dépensé, nettoyage secondaire incomplet.', { itemId, error }); }
        }
        for (const render of feedback) {
            try { render(); }
            catch (error) { console.error('[ConsumableFeedback] Effet acquis, affichage incomplet.', { itemId, error }); }
        }
        pendingConsumableItems.delete(itemId);
        pendingConsumableTargets.delete(targetId);
        finishAction?.();
        queueMicrotask(() => window.dispatchEvent(new CustomEvent('consumableTargetReleased', { detail: { entityId: targetId } })));
    }
}

export function DropInventorytoCodex(codexEntry, entiteId) {
    codexEntry.dataset.dropable = 'true';
    codexEntry.dataset.entityId = entiteId;
}

export function updateEntityItemDropVisual(element, event) {
    if (!element.matches('.stuff-slot, [data-dropable="true"]')) return false;
    const { itemId, item } = getDraggedItemDataFromEvent(event);
    if (!item) return false;
    const target = resolveEquipmentDropEntity(element);
    if (!target) return false;
    event.preventDefault();
    element.classList.add('drag-over');
    if (isStuffItemData(item)) updateEquipmentDropVisual(element, event);
    else updateConsumableDropVisual(element, itemId, target, event);
    return true;
}

export async function dropInventoryOnEntity(event, element) {
    if (!element.matches('.stuff-slot, [data-dropable="true"]')) return false;
    const { itemId, item } = getDraggedItemDataFromEvent(event);
    if (!item) return false;
    const targetEntity = resolveEquipmentDropEntity(element);
    if (!targetEntity) return false;
    const itemElement = findDraggedItemElementById(itemId);
    if (item.itemType?.includes('consumable')) {
        return useConsumableItem(itemId, targetEntity, {
            ground: getBattleInventoryState().battleGroundItems.some(entry => entry.itemId === itemId),
        });
    }
    if (isStuffItemData(item)) {
        return transferEquippedStuffToEntity({
            equippedItem: item, itemElement, targetEntity, targetElement: element, event,
        });
    }
    return false;
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
        battleSlots: (data.battleSlots || []).map(id => id === itemId ? null : id),
        battleGroundItems: (data.battleGroundItems || []).filter(entry => entry.itemId !== itemId),

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
        playerSave.battleSlots = (playerSave.battleSlots || []).map(id => id === itemId ? null : id);
        playerSave.battleGroundItems = (playerSave.battleGroundItems || []).filter(entry => entry.itemId !== itemId);

        // IMPORTANT :
        // Ne pas toucher à playerSave.equippedItems ici.
        // L'équipement/déséquipement doit être géré par equipement.js.
        saveToLocalStorage('PlayerSave', playerSave);

        console.log(`🔄 PlayerSave synchronisé : suppression de ${itemId} uniquement côté inventaire/items.`);
    }

    // ==== 3) Source globale IngameItems ====
    const ingameItems = loadFromLocalStorage('IngameItems', []);
    if (Array.isArray(ingameItems) && ingameItems.length) {
        const cleaned = dropByItemId(ingameItems);

        if (cleaned.length !== ingameItems.length) {
            saveToLocalStorage('IngameItems', cleaned);
            console.log(`🧹 Suppression dans IngameItems de ${itemId}`);
        }
    }

    notifyInventoryItemsUpdated('remove-item', { itemId, from });

    if (
        from === 'inventory' &&
        typeof window !== 'undefined' &&
        typeof window.refreshPlayerInventoryInterface === 'function' &&
        window.refreshPlayerInventoryInterface()
    ) {
        return;
    }

    // IMPORTANT :
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
            if (activeShop?.mosaic.isConnected) {
                applyShopFilters(activeShop.mosaic, activeShop.shopRight);
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
        save.Playerinventory = save.Playerinventory.filter(obj => {
            const id = typeof obj === 'string' ? obj : obj?.itemId;
            return id !== itemId;
        });

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
    refreshCodexEquipmentInventoryPanels(fullItem);
    notifyInventoryItemsUpdated('add-item', { itemId });

    if (
        typeof window !== 'undefined' &&
        typeof window.refreshPlayerInventoryInterface === 'function' &&
        window.refreshPlayerInventoryInterface()
    ) {
        return;
    }

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
itemDiv.classList.add('inventory-item', `quality-${getScoredItemQuality(fullItem)}`, fullItem.itemType);

        itemDiv.dataset.itemId = itemId;
        itemDiv.setAttribute('draggable', 'false');

        const img = document.createElement('img');
        img.src = cachedResourceUrl(fullItem.itemAsset);
        img.alt = fullItem.displayName;
        img.id = itemId;
        img.classList.add('inventory-item-icon', fullItem.functionName);
        img.setAttribute('draggable', 'true');
        setupDragAndDropItem(img, itemId);

        const label = document.createElement('span');
        label.textContent = fullItem.displayName;

        itemDiv.appendChild(img);
        itemDiv.appendChild(label);
        itemDiv.appendChild(createItemPowerValue(fullItem));
        inventoryContainer.appendChild(itemDiv);
		DclicSlottoInventory();
		glitterStuff('.inventory-item.stuff', 3);
bindPersistentDescription(itemDiv, fullItem, itemId, 'item');
}}

export function addEntityLootToArmyA(entity, acquisition = { source: 'loot' }) {
    if (!canRecruitEntity(entity, acquisition)) {
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

    // The inventory's delegated click listener also handles freshly recruited entities.
    createEntityCodex(entite, armyCodexList);
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

    const isEntity = isNonLordCombatant(item) || isLord(item);

    const itemWrapper = document.createElement('div');
    itemWrapper.classList.add('item-wrapper');

    itemWrapper.classList.add(
        isEntity
            ? 'entity'
            : `quality-${getScoredItemQuality(item)}`
    );

    if (!isEntity && Array.isArray(item.itemType)) {
        item.itemType.forEach(type => {
            itemWrapper.classList.add(type);
        });
    }

    let itemId;
    let displayedItem = item;

    if (isEntity) {
        itemId = `entity-${item.id}`;
    } else {
        const createdItem = createIngameItem(
            item.serial,
            source
        );

        if (!createdItem) return null;

        itemId = createdItem.itemId;
        displayedItem = createdItem;
    }

    itemWrapper.dataset.itemId = itemId;
    if (isEntity && source === 'worldmap-shop') itemWrapper._shopEntity = item;

    const image = document.createElement('img');

    image.src = isEntity
        ? item.sprite
        : item.itemAsset;

    image.alt = isEntity
        ? item.name
        : item.displayName;

    image.classList.add('item-icon');

    if (isEntity) {
        image.dataset.dropable = 'true';
        image.dataset.entityId = item.id;
        image.classList.add(
            'iddle',
            item.class
        );
    } else {
        image.classList.add(item.functionName);
        image.id = itemId;
    }

    itemWrapper.appendChild(image);

    const caption = document.createElement('div');
    caption.className = 'item-admin-caption';
    caption.dataset.adminPower = 'item-caption';
    caption.hidden = !isAdminMode();
    const name = document.createElement('span');
    name.className = 'item-admin-name';
    name.textContent = isEntity ? item.nickname || item.name : item.displayName;
    caption.append(name, isEntity ? createEntityPowerValue(item) : createItemPowerValue(displayedItem));
    itemWrapper.appendChild(caption);

    if (showCost) {
        const { price } = isEntity
            ? getEntityPriceAndQuality(item)
            : { price: item.itemCost };

        const cost = document.createElement('div');
        cost.classList.add('item-cost');
        cost.dataset.shopPrice = String(price);
        cost.textContent = `${price} XP`;
        cost.hidden = isAdminMode();

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
function normalizeShopSearch(value) {
    return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr').trim();
}

function applyShopFilters(mosaic, shopRight) {
    const content = mosaic.closest('.shop-content');
    const filters = mosaic.closest('.shop-interface')?.querySelector('.shop-header > .shop-filters');
    if (!filters) return;
    const category = filters.querySelector('[name="shop-category"]:checked')?.value || 'all';
    const words = normalizeShopSearch(filters.elements.namedItem('shop-search')?.value || '').split(/\s+/).filter(Boolean);
    let visible = 0;
    clearTimeout(itemDescriptionClickTimer);
    for (const item of mosaic.querySelectorAll(':scope > .item-wrapper')) {
        item.hidden = (category !== 'all' && item.dataset.shopCategory !== category)
            || !words.every(word => item.dataset.shopSearch.includes(word));
        if (!item.hidden) {
            visible++;
            continue;
        }
        item.classList.remove('selected');
        item.style.removeProperty('animation');
        removePinnedItemDescription(item.dataset.itemId);
        removeItemDescription(item.dataset.itemId);
    }
    const empty = content.querySelector('.shop-empty');
    if (empty) empty.hidden = visible > 0;
    shopRight?.querySelector('.seller-button')?.classList.toggle('buy', Boolean(mosaic.querySelector('.item-wrapper.selected:not([hidden])')));
}

export function displayShopItems(mosaic, shopRight) {
    activeShop = { mosaic, shopRight };
    mosaic.innerHTML = '';

    const admin = isAdminMode();
    const upgrades = !admin && loadPlayerInfo().battleSlotCount < 24
        ? ItemDetails.filter(item => item.battleSlotBonus > 0)
        : [];
    const shuffledItems = admin ? ItemDetails : ItemDetails.filter(item => !item.battleSlotBonus)
        .sort(() => Math.random() - 0.5)
        .slice(0, Math.max(0, 6 - upgrades.length));

    const allEntities = Object.values(entitesNestUp);
    const seenEntities = new Set();
    const selectedEntities = admin
        ? allEntities.filter(entity => {
            if (!isNonLordCombatant(entity) && !isLord(entity)) return false;
            // Catalogue IDs and serials are shared by distinct test variants.
            const key = JSON.stringify([entity.type, entity.name]);
            if (seenEntities.has(key)) return false;
            seenEntities.add(key);
            return true;
        })
        : allEntities.filter(entity => isNonLordCombatant(entity) && !entity.isDead)
            .sort(() => Math.random() - 0.5)
            .slice(0, Math.random() < 0.5 ? 1 : 2);

    const shopPool = [
        ...upgrades,
        ...shuffledItems,
        ...selectedEntities.map(entity => ({ ...structuredClone(entity), id: generateUniqueID() }))
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
        const isEntity = isNonLordCombatant(item) || isLord(item);
        itemWrapper.dataset.shopCategory = isEntity ? 'entity'
            : item.itemType?.includes('stuff') ? 'stuff'
            : item.itemType?.includes('consumable') ? 'consumable' : 'other';
        itemWrapper.dataset.shopSearch = normalizeShopSearch(
            [item.displayName, item.name, item.nickname, item.itemDescription].filter(Boolean).join(' ')
        );
        mosaic.appendChild(itemWrapper);
    });

    const filters = mosaic.closest('.shop-interface')?.querySelector('.shop-header > .shop-filters');
    if (filters) {
        filters.oninput = () => applyShopFilters(mosaic, shopRight);
        filters.onsubmit = event => {
            event.preventDefault();
            applyShopFilters(mosaic, shopRight);
        };
    }
    applyShopFilters(mosaic, shopRight);

    const sellerButton =
        shopRight?.querySelector('.seller-button');

    if (!sellerButton || sellerButton.dataset.shopBuyBound === 'true') return;
    sellerButton.dataset.shopBuyBound = 'true';

    sellerButton.addEventListener('click', () => {
        const selected = mosaic.querySelector(
            '.item-wrapper.selected:not([hidden])'
        );

        if (!selected) {
            console.warn('❌ Aucun objet sélectionné.');
            return;
        }

        const itemId = selected.dataset.itemId;
        let item;

        if (itemId.startsWith('entity-')) {
            item = selected._shopEntity;
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

    const template = ItemDetails.find(entry => entry.serial === item.serial);
    if (template?.battleSlotBonus > 0) {
        const count = loadPlayerInfo().battleSlotCount + template.battleSlotBonus;
        if (count > 24) {
            showGamePopupMessage({ mode: 'auto', tone: 'warning', key: 'satchel-capacity',
                title: 'Sacoche complète', message: 'Votre sacoche possède déjà 24 emplacements.', duration: 2500 });
            return null;
        }
        // A permanent unlock has no owned item instance, even when awarded during battle.
        if (!resizeBattleSlots(count)) return null;
        showGamePopupMessage({ mode: 'auto', tone: 'passive', key: 'satchel-capacity',
            title: 'Sacoche agrandie', message: `Un emplacement ajouté. Votre sacoche possède ${count} emplacements.`, duration: 2500 });
        return { ...template, origin, appliedBattleSlots: template.battleSlotBonus };
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
    if (!requireSafeMenuAccess()) return false;
    if (!item) {
        console.warn('❌ Objet ou entité invalide pour achat.');
        return;
    }

    const isEntity = isNonLordCombatant(item) || isLord(item);
    if (isEntity && !canRecruitEntity(item, { source: 'shop' })) return false;
    if (isEntity && sourceId) {
        const offer = activeShop?.mosaic.querySelector(`[data-item-id="${CSS.escape(sourceId)}"]`);
        if (offer?._shopEntity !== item) return false;
    }
    if (!isEntity && sourceId && !getIngameItemById(sourceId)) return false;
    const template = isEntity ? item : ItemDetails.find(entry => entry.serial === item.serial);
    if (!template) return false;
    const price = Number(isEntity ? getEntityPriceAndQuality(template).price : template.itemCost);
    if (!Number.isFinite(price) || price < 0) return false;
    const payment = isAdminMode() ? { admin: 0, normal: 0 } : spendPlayerExperience(price);
    if (!payment) {
        showGamePopupMessage({ mode: 'auto', tone: 'warning', key: 'shop-insufficient-xp',
            title: 'XP insuffisante', message: `Cet achat coûte ${price} XP.`, duration: 2500 });
        return false;
    }
    const refund = () => {
        if (payment.admin) creditPlayerExperience(payment.admin, { admin: true });
        if (payment.normal) creditPlayerExperience(payment.normal);
    };

    if (isEntity) {
        const lootEntity = {
            ...item,
            type: item.type,
            side: 'A',
            id: generateUniqueID()
        };

        const added = addEntityLootToArmyA(lootEntity, {
            source: 'shop',
            sourceId
        });
        if (!added) { refund(); return false; }

        console.log(
            `🧬 Achat confirmé pour ${lootEntity.name} (ID : ${lootEntity.id})`
        );
    } else {
        const created = acquireItem(item, 'shop');

        if (!created) {
            refund();
            return false;
        }

        console.log(
            `🛒 Achat confirmé pour ${created.displayName} (ID : ${created.itemId})`
        );
    }

    if (sourceId) {
        removeItem(sourceId, { from: 'shop' });
    }
    saveCurrentGameData();
    return true;
}
export function createEntityDescription(entity, hoveredElement, options = {}) {
    const { persistent = false } = options;
    if (!persistent && isDragDropActive()) {
        clearDragTransientHelpers();
        return;
    }

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

    appendEntityHelperContent({
      entity, detailCard, createEntityPowerValue,
      getEntityPriceAndQuality, getItemQualityData, applyCombatProfileView,
    });
    detailCard.style.visibility = 'hidden';
    helperContainer.appendChild(detailCard);
    positionHelperCard(detailCard, hoveredElement);
    detailCard.style.visibility = '';

    return detailCard;
}

function getStatLabelFromKey(statKey) {
  const canonicalKey = normalizeStatKey(statKey);
  const improved = canonicalKey?.endsWith('Plus');
  const baseKey = improved ? canonicalKey.slice(0, -4) : canonicalKey;
  const stat = stats.find(s => normalizeStatKey(s.key) === baseKey);
  return stat ? `${stat.name}${improved ? ' +' : ''}` : statKey;
}

function findLiveArmyEntityById(entiteId) {
  if (!entiteId) return null;
  const id = String(entiteId);
  if (getStageAccess().inStage) {
    const combatEntity = entites.find(entity => String(entity?.id) === id);
    if (combatEntity) return combatEntity;
  }
  const pools = [
    Array.isArray(window.selectedArmyA) ? window.selectedArmyA : null,
    Array.isArray(window.entites) ? window.entites : null,
    Array.isArray(entites) ? entites : null,
    Array.isArray(entitesNestUp) ? entitesNestUp : null,
    loadSelectedArmyA(),
  ].filter(Boolean);

  for (const pool of pools) {
    const found = pool.find(entity => String(entity?.id) === id);
    if (found) return found;
  }

  return null;
}

function getEquipmentEntityIdFromElement(element) {
  const slot = element?.closest?.('.stuff-slot');
  const slotMatch = slot?.id?.match(/^slot\d+-(.+)$/);
  if (slotMatch) return slotMatch[1];

  const equipment = element?.closest?.('.entity-equipement[id^="equipment-"]');
  if (equipment?.id) return equipment.id.replace('equipment-', '');

  const entityNode = element?.closest?.('[data-entity-id]');
  return entityNode?.dataset?.entityId || null;
}

function resolveStuffOwnerEntity(item, itemId, hoveredElement) {
  const isEquippedContext =
    Boolean(item?.equippedTo) ||
    Boolean(item?.equippedId) ||
    String(itemId || "").startsWith("e") ||
    Boolean(hoveredElement?.closest?.('.stuff-slot.equiped, .stuff-item-wrapper'));

  if (!isEquippedContext) return null;

  const ownerId =
    item?.equippedTo ||
    getEquipmentEntityIdFromElement(hoveredElement);

  return findLiveArmyEntityById(ownerId);
}

function isObjectStuffStatValue(value) {
  return value && typeof value === "object" && ("current" in value || "max" in value);
}

function formatStuffNumber(value) {
  const n = Number(value) || 0;
  if (!Number.isFinite(n)) return "0";
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 100) / 100).replace(/\.0+$/, "");
}

function formatSignedStuffNumber(value, { signedZero = false } = {}) {
  const n = Number(value) || 0;
  const sign = n > 0 || (signedZero && n === 0) ? "+" : "";
  return `${sign}${formatStuffNumber(n)}`;
}

function formatStuffContribution(value, { signed = true, signedZero = false } = {}) {
  if (isObjectStuffStatValue(value)) {
    const current = Number(value.current ?? value.max ?? 0) || 0;
    const max = Number(value.max ?? value.current ?? 0) || 0;
    if (current !== max) {
      return signed
        ? `${formatSignedStuffNumber(current, { signedZero })} / ${formatSignedStuffNumber(max, { signedZero })}`
        : `${formatStuffNumber(current)} / ${formatStuffNumber(max)}`;
    }

    return signed ? formatSignedStuffNumber(max, { signedZero }) : formatStuffNumber(max);
  }

  if (value && typeof value === "object") {
    const parts = [];
    const hasFlat = Boolean(Number(value.flat ?? 0));
    const hasPercent = Boolean(Number(value.percent ?? 0));

    if (hasFlat || (signedZero && !hasPercent)) {
      parts.push(signed ? formatSignedStuffNumber(value.flat, { signedZero }) : formatStuffNumber(value.flat));
    }
    if (hasPercent) {
      const formatted = signed
        ? formatSignedStuffNumber(value.percent, { signedZero })
        : formatStuffNumber(value.percent);
      parts.push(`${formatted}%`);
    }
    return parts.length ? parts.join(" / ") : signed && signedZero ? "+0" : "0";
  }

  return signed ? formatSignedStuffNumber(value, { signedZero }) : formatStuffNumber(value);
}

function createStuffPicto(statKey) {
  const picto = document.createElement('div');
  picto.className = `picto-stat ${getDisplayStatKey(statKey)}`;
  return picto;
}

function createItemPowerDebugBlock(item) {
  const line = document.createElement("details");
  line.className = "item-power-dev-line";
  line.dataset.itemPowerDebug = "true";
  line.dataset.adminPower = 'item';
  line.dataset.refreshPower = 'true';
  const heading = document.createElement('summary');
  const content = document.createElement('pre');
  line.append(heading, content);
  line._refreshPower = () => {
    line.hidden = !isAdminMode();
    if (line.hidden) return;
    const live = readCurrentPowerItem(item);
    const result = cachedDisplayPower(line, 'item', live, () => calculateItemPower(live));
    const title = `Power : ${formatStuffNumber(result.score)} · Niveau équivalent ${result.equivalentLevel}`;
    if (heading.textContent !== title) heading.textContent = title;
    const text = getPowerBreakdownLines(result).join('\n');
    if (content.textContent !== text) content.textContent = text;
  };
  line.addEventListener('toggle', () => { if (line.open) line._refreshPower(); });
  line._refreshPower();
  schedulePowerRefresh();
  return line;
}

function getStuffBoostDetailForStat(boostDetails, stat) {
  return boostDetails?.details?.[stat] || null;
}

function isZeroStuffContribution(value) {
  if (isObjectStuffStatValue(value)) {
    return (
      Math.abs(Number(value.current ?? 0) || 0) < 0.000001 &&
      Math.abs(Number(value.max ?? 0) || 0) < 0.000001
    );
  }

  if (value && typeof value === "object") {
    return (
      Math.abs(Number(value.flat ?? 0) || 0) < 0.000001 &&
      Math.abs(Number(value.percent ?? 0) || 0) < 0.000001
    );
  }

  return Math.abs(Number(value ?? 0) || 0) < 0.000001;
}

function hasVisibleOrfevreExactBonus(detail) {
  return Boolean(
    detail &&
    Number(detail.activePercent || 0) > 0 &&
    !isZeroStuffContribution(detail.exactBonus)
  );
}

function appendStuffContributionValue(target, value, boostDetail = null, rawValue = null, stat = null, { signed = true, unit = null } = {}) {
  return renderStuffContributionValue(target, value, boostDetail, rawValue, stat, { hasVisibleOrfevreExactBonus, formatStuffContribution, createStuffPicto, getDisplayStatKey, signed, unit });
}

function buildStuffOrfevreDetailPayload(stat, label, detail, previewDetail = null, { preview = false } = {}) {
  return JSON.stringify({
    stat,
    label,
    raw: detail.raw,
    exactBonus: detail.exactBonus,
    bonus: detail.bonus,
    exactTotal: detail.exactTotal,
    total: detail.total,
    activePercent: detail.activePercent,
    preview,
    previewDetail: previewDetail
      ? {
          raw: previewDetail.raw,
          exactBonus: previewDetail.exactBonus,
          bonus: previewDetail.bonus,
          exactTotal: previewDetail.exactTotal,
          total: previewDetail.total,
          activePercent: previewDetail.activePercent,
        }
      : null,
  });
}

function appendStuffOrfevreBoostDetail(parent, {
  stat,
  label,
  detail,
  previewDetail = null,
  ownerEntity = null,
  preview = false,
} = {}) {
  if (!detail) return;

appendOrfevreHelperDetail({ preview, buildStuffOrfevreDetailPayload, stat, label, detail, previewDetail, ownerEntity, formatStuffContribution, createStuffPicto, getDisplayStatKey, parent });

}

function appendItemStatRow(parent, {
  stat,
  label,
  rawValue,
  totalValue,
  boostDetail,
  previewBoostDetail,
  isPreviewPrimary = false,
  isMalus = false,
  powerScore = 0,
  ownerEntity,
  armorReserve = null,
  resourceReserve = null,
  lifeSlot = null,
  retainOrfevreDetail = false,
  signed = true,
  unit = null,
}) {
  const isUmbra = stats.some(definition => definition.key === normalizeStatKey(stat) && definition.nature === 'umbra');
  return renderItemStatHelperRow(parent, { stat, label, rawValue, totalValue, boostDetail, previewBoostDetail, ownerEntity, isPreviewPrimary, isMalus, powerScore, armorReserve, resourceReserve, lifeSlot, retainOrfevreDetail, isUmbra, signed, unit }, { getDisplayStatKey, isUmbraRestricted, hasVisibleOrfevreExactBonus, createStuffPicto, appendStuffContributionValue, appendStuffOrfevreBoostDetail });
}

function getStuffContributionNumericValue(value) {
  if (isObjectStuffStatValue(value)) {
    const current = Number(value.current ?? 0) || 0;
    const max = Number(value.max ?? current) || 0;
    return Math.abs(max) >= Math.abs(current) ? max : current;
  }

  if (value && typeof value === "object") {
    return (Number(value.flat ?? 0) || 0) + (Number(value.percent ?? 0) || 0);
  }

  return Number(value ?? 0) || 0;
}

function getItemPowerDetailsByStat(item) {
  const result = calculateItemPower(item);
  const detailsByStat = new Map();

  for (const detail of result?.details || []) {
    const stat = normalizeStatKey(detail.stat);
    if (!stat) continue;

    const current = detailsByStat.get(stat) || {
      score: 0,
      absoluteScore: 0,
      details: [],
    };

    const score = Number(detail.score) || 0;
    current.score += score;
    current.absoluteScore += Math.abs(score);
    current.details.push(detail);
    detailsByStat.set(stat, current);
  }

  return detailsByStat;
}

function createStuffStatSection(className) {
  const section = document.createElement("div");
  section.className = `stuff-stat-section ${className}`;
  return section;
}

function appendStuffStatRows(parent, item, itemId, hoveredElement, ownerEntity = resolveStuffOwnerEntity(item, itemId, hoveredElement), openDetailRows = []) {
  ensureStuffArmorReserve(item);
  const rawDelta = stripStuffResourceModifiers(buildStuffModifierDelta(item));
  if (rawDelta.shift && typeof rawDelta.shift === 'object' && 'max' in rawDelta.shift) rawDelta.shift = rawDelta.shift.max;
  const currentPercent = ownerEntity
    ? getWeaponOrfevreStuffActivePercent(ownerEntity)
    : 0;
  const previewPercent = ownerEntity
    ? getWeaponOrfevrePreviewActivePercent(ownerEntity)
    : 0;
  const boostDetails = ownerEntity
    ? getStuffWeaponOrfevreBoostDetails(ownerEntity, rawDelta, { activePercent: currentPercent })
    : null;
  const hasPreviewOrfevre = ownerEntity && formatStuffNumber(previewPercent) !== formatStuffNumber(currentPercent);
  const previewBoostDetails = hasPreviewOrfevre
    ? getStuffWeaponOrfevreBoostDetails(ownerEntity, rawDelta, { activePercent: previewPercent })
    : null;

  parent.dataset.weaponOrfevreActive = String(currentPercent || 0);
  if (hasPreviewOrfevre) {
    parent.dataset.weaponOrfevrePreview = "true";
  }

  const powerDetailsByStat = getItemPowerDetailsByStat(item);
  const rows = [];

  for (const [stat, rawValue] of Object.entries(rawDelta)) {
    if (['extraLife', 'eternalLife'].includes(stat) && getStuffResourceStocks(item)[stat]) continue;
    const normalizedStat = normalizeStatKey(stat);
    const armorLayer = normalizedStat === "armor" && ownerEntity?.armorLayers?.stuff && item?.equippedId
      ? ownerEntity.armorLayers.stuff[item.equippedId]
      : null;
    const armorReserve = normalizedStat === "armor" && (armorLayer || item?.armorReserve)
      ? {
          current: Math.max(0, Number(armorLayer?.current ?? item.armorReserve.current) || 0),
          max: Math.max(0, Number(armorLayer?.max ?? item.armorReserve.max) || 0),
          orfevreBonus: Math.max(0, Number(armorLayer?.orfevre?.current ?? 0) || 0),
          reserve: true,
        }
      : null;
    const boostDetail = armorReserve ? null : getStuffBoostDetailForStat(boostDetails, stat);
    const previewBoostDetail = armorReserve ? null : getStuffBoostDetailForStat(previewBoostDetails, stat);
    const isPreviewPrimary = !boostDetail && Boolean(previewBoostDetail);
    const displayBoostDetail = boostDetail || previewBoostDetail || null;
    const totalValue = armorReserve || (displayBoostDetail?.total ?? rawValue);
    const powerDetail = powerDetailsByStat.get(normalizedStat);
    const powerScore = Number(powerDetail?.score ?? 0) || 0;
    const numericValue = getStuffContributionNumericValue(totalValue);
    const isMalus = powerScore < 0 || (powerScore === 0 && numericValue < 0);

    rows.push({
      stat,
      label: getDisplayStatKey(stat) === 'shift' ? `Déplacements max${stat.endsWith('Plus') ? ' +' : ''}` : getStatLabelFromKey(stat),
      rawValue,
      totalValue,
      boostDetail: displayBoostDetail,
      previewBoostDetail: isPreviewPrimary ? null : previewBoostDetail,
      isPreviewPrimary,
      isMalus,
      powerScore,
      orderScore: powerDetail?.absoluteScore ?? Math.abs(powerScore || numericValue),
      ownerEntity,
      armorReserve,
    });
  }

  for (const [stat, stored] of Object.entries(getStuffResourceStocks(item))) {
    const owned = ownerEntity?.resourceStocks?.[stat]?.stuff?.[item.equippedId] || stored;
    const stock = stat === 'shift' ? getEffectiveMovementStock(owned, currentPercent) : owned;
    if (['extraLife', 'eternalLife'].includes(stat)) {
      for (const [id, timer] of Object.entries(stock.regen)) {
        const resourceReserve = { current: Number(timer.currentRegen >= timer.maxRegen), max: 1, reserve: true };
        rows.push({ stat, label: stat === 'extraLife' ? 'Vie supplémentaire' : 'Vie éternelle',
          rawValue: 1, totalValue: resourceReserve, resourceReserve, lifeSlot: { id, ...timer },
          ownerEntity, powerScore: 0, isMalus: false });
      }
      continue;
    }
    const resourceReserve = { ...stock, reserve: true };
    const movementDetail = stat === 'shift' && ownerEntity
      ? getStuffBoostDetailForStat(getStuffWeaponOrfevreBoostDetails(ownerEntity,
        { shift: stock.reserve.preciseCurrent }, { activePercent: currentPercent }), 'shift') : null;
    const movementPreview = stat === 'shift' && hasPreviewOrfevre
      ? getStuffBoostDetailForStat(getStuffWeaponOrfevreBoostDetails(ownerEntity,
        { shift: stock.reserve.preciseCurrent }, { activePercent: previewPercent }), 'shift') : null;
    rows.push({ stat, label: stat === 'shift' ? 'Déplacements sup.' : getStatLabelFromKey(stat),
      rawValue: stock.reserve?.preciseCurrent ?? stock.max, totalValue: resourceReserve, resourceReserve,
      boostDetail: movementDetail, previewBoostDetail: movementPreview,
      ownerEntity, orderScore: stock.max, powerScore: 0, isMalus: false });
  }

  const sortByPowerDesc = (a, b) => {
    const byPower = (Number(b.orderScore) || 0) - (Number(a.orderScore) || 0);
    if (byPower) return byPower;
    return String(a.label).localeCompare(String(b.label), "fr");
  };

  const lifeOrder = ['eternalLife', 'extraLife', 'fadedLife'];
  const lifeRows = rows.filter(row => row.resourceReserve && lifeOrder.includes(row.stat)).sort((a, b) =>
    lifeOrder.indexOf(a.stat) - lifeOrder.indexOf(b.stat)
    || (a.lifeSlot?.maxRegen || 0) - (b.lifeSlot?.maxRegen || 0)
    || String(a.lifeSlot?.id || '').localeCompare(String(b.lifeSlot?.id || ''), 'fr', { numeric: true }));
  const bonusRows = rows.filter(row => !row.isMalus && !lifeRows.includes(row)).sort(sortByPowerDesc).concat(lifeRows);
  const malusRows = rows.filter(row => row.isMalus).sort(sortByPowerDesc);

  const appendRows = (targetRows, sectionClass) => {
    if (!targetRows.length) return;
    const section = createStuffStatSection(sectionClass);
    for (const row of targetRows) {
      row.retainOrfevreDetail = openDetailRows.some(oldRow => oldRow.dataset.stat === row.stat
        && oldRow.classList.contains('stuff-stat-resource-reserve') === Boolean(row.resourceReserve));
      // An already-open detail must also display zero when the bonus or stock disappears.
      if (row.retainOrfevreDetail && !row.boostDetail) {
        row.boostDetail = { stat: row.stat, raw: row.rawValue, bonus: 0, exactBonus: 0,
          exactTotal: row.rawValue, total: row.resourceReserve ? row.resourceReserve.current : row.totalValue,
          activePercent: currentPercent };
      }
      appendItemStatRow(section, row);
    }
    parent.appendChild(section);
  };

  appendRows(bonusRows, "stuff-stat-section--bonus");
  appendRows(malusRows, "stuff-stat-section--malus");
}
const ITEM_DESC_MAX_PINNED = 2;
const pinnedItemDescriptions = [];
let itemDescriptionClickTimer = null;

if (typeof document !== "undefined") {
  document.addEventListener(DRAG_HELPER_CLEANUP_EVENT, () => {
    clearTimeout(itemDescriptionClickTimer);
    itemDescriptionClickTimer = null;
  });
}

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
    const equippedId = entry.card?.dataset.equippedId;
    if (equippedId && getEquippedItemsById()[equippedId]) {
      // Slot contents are rebuilt during swaps; the pinned card belongs to the item.
      entry.anchor = document.querySelector(`.stuff-item-wrapper[data-stuff-id="${CSS.escape(equippedId)}"]`)
        || document.getElementById(equippedId) || entry.anchor;
      continue;
    }

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

export function pinItemDescription(item, itemId, anchorElement, options = {}) {
  cleanupDetachedPinnedDescriptions();

  if (!item || !itemId) return;

  // Si déjà ouverte : on la vire
  if (removePinnedItemDescription(itemId)) return;

  const card = createItemDescription(item, itemId, anchorElement, {
    ...options,
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
    if (!entityElement || entityElement._entityDescBound === true) return;

    entityElement._entityDescBound = true;
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
export function setupItemDescriptionClick(itemElement, item, itemId, options = {}) {
  if (!itemElement || itemElement._itemDescBound === true) return;

  itemElement._itemDescBound = true;
  itemElement.dataset.itemDescBound = '1';

  itemElement.addEventListener('click', (event) => {
    event.stopPropagation();

    clearTimeout(itemDescriptionClickTimer);

    itemDescriptionClickTimer = setTimeout(() => {
      pinItemDescription(item, itemId, itemElement, options);
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
export function bindPersistentDescription(element, data, id, type = 'item', options = {}) {
    if (!element || !data || !id) return;
    if (element._persistentDescBound === true) return;

    element._persistentDescBound = true;
    element.dataset.persistentDescBound = '1';

    element.addEventListener('mouseenter', () => {
        if (type === 'entity') {
            createEntityDescription(data, element);
        } else {
            createItemDescription(data, id, element, options);
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
                pinItemDescription(data, id, element, options);
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
  const { persistent = false, showEquippedActions = false } = options;
  if (!persistent && isDragDropActive()) {
    clearDragTransientHelpers();
    return;
  }

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
  // Slot listeners outlive charge consumption; read the current equipped item.
  if (item.equippedId) item = getEquippedItemsById()[item.equippedId] || item;
  if (item.equippedId) detailCard.dataset.equippedId = item.equippedId;
  // --- Types robustes ---
  const types = Array.isArray(item.itemType) ? item.itemType : [item.itemType].filter(Boolean);
  types.forEach(t => detailCard.classList.add(t));

  // --- Qualité + fallback ---
  const { norm, color } = (typeof getItemQualityData === 'function'
    ? getItemQualityData(getScoredItemQuality(item))
    : { norm: '—', color: '#999' });

  const desc = appendItemHelperHeader({ color, item, types, norm, detailCard, isBattleConsumable });
  const ownerEntity = types.includes('stuff')
    ? resolveStuffOwnerEntity(item, itemId, hoveredElement)
    : null;

  if (showEquippedActions && types.includes('stuff') && item?.equippedId && ownerEntity) {
    const equippedContext = document.createElement('div');
    equippedContext.className = 'item-equipped-context';
    equippedContext.textContent = `Équipé par : ${ownerEntity.nickname || ownerEntity.name || ownerEntity.id}`;

    const unequipButton = document.createElement('button');
    unequipButton.type = 'button';
    unequipButton.className = 'item-equipped-unequip-button';
    unequipButton.textContent = `Déséquiper de ${ownerEntity.nickname || ownerEntity.name || 'l’entité'}`;
    unequipButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      void unequipEquippedStuffFromOwner(item, hoveredElement, event).then((ok) => {
        if (ok) detailCard.remove();
      });
    });

    detailCard.appendChild(equippedContext);
    detailCard.appendChild(unequipButton);
  }

  appendItemEffectHelpers({ item, itemEffects, generateEffectDescription, detailCard, appendStatRow: appendItemStatRow });
  // --- Effets stuff (bonus stat) ---
  if (types.includes('stuff') && Array.isArray(item.Stuffeffets)) {
    const attributStatsDiv = document.createElement('div');
    attributStatsDiv.classList.add('item-stats-block', 'stuff');
    appendStuffStatRows(attributStatsDiv, item, itemId, hoveredElement);
    detailCard.appendChild(attributStatsDiv);
    if (item.equippedId) {
      detailCard._refreshEquipment = (entity, equippedItems) => {
        const currentItem = equippedItems[item.equippedId];
        if (!currentItem) return;
        const ownerId = currentItem.equippedTo || getEquipmentEntityIdFromElement(hoveredElement);
        if (entity && String(entity.id) !== String(ownerId)) return;
        const liveOwner = entity || resolveStuffOwnerEntity(currentItem, itemId, hoveredElement);
        item = currentItem;
        const equippedContext = detailCard.querySelector('.item-equipped-context');
        const unequipButton = detailCard.querySelector('.item-equipped-unequip-button');
        if (equippedContext && liveOwner) equippedContext.textContent = `Équipé par : ${liveOwner.nickname || liveOwner.name || liveOwner.id}`;
        if (unequipButton && liveOwner) unequipButton.textContent = `Déséquiper de ${liveOwner.nickname || liveOwner.name || 'l’entité'}`;
        const openHelpers = [...document.querySelectorAll('.stat-hover')]
          .filter(helper => attributStatsDiv.contains(helper._helperHost));
        const openDetailRows = openHelpers.filter(helper => helper._helperHost.hasAttribute('data-orfevre-detail'))
          .map(helper => helper._helperHost.closest('.stuff-stat-row'));
        const next = document.createElement('div');
        appendStuffStatRows(next, currentItem, itemId, hoveredElement, liveOwner, openDetailRows);
        const nextHosts = new Map();
        const nextRows = [...next.querySelectorAll('.stuff-stat-row')];
        for (const oldRow of attributStatsDiv.querySelectorAll('.stuff-stat-row')) {
          const newRow = nextRows.find(row => row.dataset.stat === oldRow.dataset.stat
            && row.dataset.resourceLifeId === oldRow.dataset.resourceLifeId
            && row.classList.contains('stuff-stat-resource-reserve') === oldRow.classList.contains('stuff-stat-resource-reserve'));
          if (!newRow) continue;
          // Match each life separately, as well as maximum and supplemental stock.
          for (const oldHost of [oldRow, ...oldRow.querySelectorAll('[data-orfevre-detail]')]) {
            const newHost = oldHost === oldRow ? newRow : newRow.querySelector('[data-orfevre-detail]');
            if (!newHost) continue;
            for (const key of ['helperKey', 'helperRootUid']) {
              if (oldHost.dataset[key]) newHost.dataset[key] = oldHost.dataset[key];
            }
            nextHosts.set(oldHost, newHost);
          }
        }
        if (next.innerHTML === attributStatsDiv.innerHTML) return;
        attributStatsDiv.dataset.weaponOrfevreActive = next.dataset.weaponOrfevreActive;
        if (next.dataset.weaponOrfevrePreview) attributStatsDiv.dataset.weaponOrfevrePreview = 'true';
        else delete attributStatsDiv.dataset.weaponOrfevrePreview;
        attributStatsDiv.replaceChildren(...next.childNodes);
        for (const helper of openHelpers) {
          const host = nextHosts.get(helper._helperHost);
          if (host) refreshStatHelper(helper, host, liveOwner);
          else helper.remove();
        }
      };
    }
  }

  const powerDebug = createItemPowerDebugBlock(item);
  if (powerDebug) detailCard.appendChild(powerDebug);

  detailCard.appendChild(desc);
  if (types.includes('permanent') && item.permanentStat) detailCard.insertAdjacentHTML('beforeend', buildImprovementHelperFooter('intense'));
  else if (types.includes('stuff') && item.Stuffeffets?.some(effect => globalThis.umbraProgression.getProgressiveStatKeys().includes(effect.stat))) {
    detailCard.insertAdjacentHTML('beforeend', buildImprovementHelperFooter('external'));
  }
  detailCard.style.visibility = 'hidden';
  helperContainer.appendChild(detailCard);
  positionHelperCard(detailCard, hoveredElement);
  detailCard.style.visibility = '';
return detailCard;
}

for (const eventName of ['equippedItemsUpdated', 'selectedArmyAUpdated']) window.addEventListener(eventName, ({ detail }) => {
  const cards = [...document.querySelectorAll('.item-description-card')]
    .filter(card => typeof card._refreshEquipment === 'function');
  if (!cards.length) return;
  const equippedItems = getEquippedItemsById();
  cards.forEach(card => card._refreshEquipment(detail?.entity || detail?.entite, equippedItems));
});

function positionHelperCard(detailCard, hoveredElement) {
  if (!hoveredElement || !detailCard) return;

  const rect = overlayRect(detailCard, hoveredElement);
  const bounds = overlayBounds(detailCard);

  const style = getComputedStyle(detailCard);
  const horizontal = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
    + parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth);
  const vertical = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
    + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
  detailCard.style.position = 'fixed';
  detailCard.style.maxWidth = `${Math.max(1, bounds.right - 20 - horizontal)}px`;
  detailCard.style.maxHeight = `${Math.max(1, bounds.bottom - 20 - vertical)}px`;
  detailCard.style.overflowY = 'auto';
  const maxLeft = bounds.right - detailCard.offsetWidth - 10;
  const maxTop = bounds.bottom - detailCard.offsetHeight - 10;
  let left = rect.right + 5;
  let top = rect.bottom - 150;
  if (left > maxLeft) {
    left = rect.left - detailCard.offsetWidth - 5;
    if (left < 10) {
      left = Math.min(rect.left, maxLeft);
      top = rect.top - detailCard.offsetHeight - 5;
      if (top < 10) top = rect.bottom + 5;
    }
  }
  detailCard.style.left = `${Math.max(10, Math.min(left, maxLeft))}px`;
  detailCard.style.top = `${Math.max(10, Math.min(top, maxTop))}px`;
}

export function equippedHoverDescription() {
    const equippedItems = getEquippedItemsById();

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
        const save = getBattleInventoryState();
        const ground = save.battleGroundItems.some(entry => entry.itemId === itemId && isGroundItemUnexpired(entry) && String(entry.stageId) === String(getCurrentLevel()));
        if (!getStageAccess().menusAllowed && !save.battleSlots.includes(itemId) && !ground) {
            e.preventDefault();
            requireSafeMenuAccess();
            return;
        }
        beginDragHelperCleanup();
        e.dataTransfer.setData('text/plain', itemId);
        e.dataTransfer.setData('application/x-game-item', itemId);
        e.dataTransfer.effectAllowed = 'move';
        imgElement.classList.add('using');
        setLastDraggedItemId(itemId);
        console.log(`🚚 Drag lancé pour ${itemId}`);
    };

    const dragEndHandler = () => {
        imgElement.classList.remove('using');
        setLastDraggedItemId(null);
        endDragHelperCleanup();
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
        if (isDragDropActive()) clearDragTransientHelpers();
        const draggedItemId = getDraggedItemIdFromDOM();

        if (element.dataset.over !== 'true') {
            element.classList.add('drag-over');
            element.dataset.over = 'true';
            updateEquipmentDropVisual(element, e);

            console.log(`🟨 dragover de ${draggedItemId} sur ${zoneLabel || element.id}`);
        }
    });

    element.addEventListener('dragleave', () => {
        const draggedItemId = getDraggedItemIdFromDOM();
        element.classList.remove('drag-over');
        clearEquipmentDropVisual(element);
        element.dataset.over = 'false';

        console.log(`⬛ dragleave de ${draggedItemId} sur ${zoneLabel || element.id}`);
    });

    element.addEventListener('drop', (e) => {
        e.preventDefault();
        endDragHelperCleanup();
        element.classList.remove('drag-over');
        clearEquipmentDropVisual(element);
        element.dataset.over = 'false';

        const draggedItemId = e.dataTransfer.getData('text/plain');

        if (!draggedItemId || !/^e?i\d+-\d+$/.test(draggedItemId)) {
            console.warn(`❌ ID d’item invalide ou absent au drop :`, draggedItemId);
            return;
        }

        const draggedItem =
            document.getElementById(draggedItemId) ||
            document.querySelector(`[data-drag-item-id="${CSS.escape(draggedItemId)}"]`) ||
            document.querySelector(`[data-equipped-id="${CSS.escape(draggedItemId)}"] .inventory-item-icon`);
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

    let itemElement = findDraggedItemElementById(itemId);
    const item = getIngameItemById(itemId);

    if (!itemElement || !item) {
        console.warn(`❌ Élément ou données de l’item introuvables : ${itemId}`);
        return null;
    }

    return { itemId, itemElement, item };
}

export function DropEquipementtoInventory() {
    document.querySelectorAll('.stuff-slot img.inventory-item-icon[draggable="true"]').forEach(img => {
        if (img.id) setupDragAndDropItem(img, img.id);
    });
    equippedHoverDescription();
}
export function DropFromCodexToInventory() {
    const inventoryZones = Array.from(document.querySelectorAll('.inventory-content'));

    if (!inventoryZones.length) {
        console.warn('❌ Zone d’inventaire introuvable');
        return;
    }

    inventoryZones.forEach(inventoryZone => {
        if (inventoryZone._dropFromCodexBound === true) return;
        inventoryZone._dropFromCodexBound = true;

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
    const targetEntity = findArmyEntityById(entiteId);

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
    });
}
function detectStuffInteractionContext(itemElement) {
    const isInSlot = itemElement.closest('.stuff-slot');
    const isInInventory = itemElement.closest(
        '.inventory-interface .inventory-content, .inventory-content, .inventory-item'
    );

    if (isInSlot) {
        return {
            source: 'codex',
            target: 'inventory'
        };
    } else if (isInInventory) {
        return {
            source: 'inventory',
            target: 'codex'
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
        if (icon._dblclickSlotInventoryBound) return;
        icon._dblclickSlotInventoryBound = true;

        icon.addEventListener('dblclick', (e) => {
            const itemId = e.currentTarget.id;
            const itemElement = e.currentTarget;
            const item = getIngameItemById(itemId);
            if (!item || !itemElement) return;

            // 🧠 Détection dynamique
            const { source, target } = detectStuffInteractionContext(itemElement);

            // 🎯 Trouver l'entité concernée (depuis stuff-slot ou sélection côté inventaire)
            const targetSlotElement = itemElement.closest('.stuff-slot');
            const entity = findEntityForStuffInteraction(itemElement);

            if (!entity) {
                console.warn("❌ Aucune entité cible trouvée pour le double-clic équipement.");
                return;
            }

            if (item.itemType?.includes('consumable')) {
                void useConsumableItem(itemId, entity);
                return;
            }

            stuffInteraction({
                mode: 'double-click',
                source,
                target,
                itemElement,
                itemData: item,
                targetEntity: entity,
                targetElement: targetSlotElement,
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
    const normalizedEquippedItems = normalizeEquippedItems(playerSave.equippedItems);
    if (!Array.isArray(playerSave.equippedItems)) {
        modified = true;
    }

    const cleanedEquipped = [];
    for (const item of normalizedEquippedItems) {
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
