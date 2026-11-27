import {
  addToEquippedItemsStorage,
  removeFromEquippedItemsStorage,
  saveUpgradedEntity,
  getEquippedItemById,
  purgeStatPreview,
} from "../storage/gameStorage.js";
import {
  removeItem,
  addItemToInventory,
  DclicSlottoInventory,
  DropEquipementtoInventory,
  equippedHoverDescription,
  getBattleInventoryState,
} from "./itemManager.js";
import {
  entites,
  removeStuffModifier,
  recomputeEntityStats,
  getEquipmentSlotKeys,
} from "../entities/runtime.js";
import { showStatGainsFromDiff } from "../ui/display.js";
import { beginDragHelperCleanup, endDragHelperCleanup } from "../ui/drag.js";
import { requireSafeMenuAccess } from "../app/state.js";
import { ensureStuffArmorReserve } from './armor.js';
import { ensureStuffResourceStocks, getEquipmentResourceCurrent } from './resourceStocks.js';
import { persistEquippedResourceStocks } from "../storage/entityStorage.js";
import { getScoredItemQuality } from '../procedural/proc-bareme.js';
import { syncDOMWithStats } from "../ui/statistics/components.js";

export function stuffInteraction({
    mode,
    source,
    target,
    itemElement,
    itemData,
    sourceEntity,
    targetEntity,
    targetElement,
    event
}) {
    if (!requireSafeMenuAccess()) return false;
    console.groupCollapsed(`🧠 Appel à stuffInteraction (mode: ${mode})`);

    console.log(`📌 Source : ${source}`);
    console.log(`🎯 Cible : ${target}`);
  if (targetEntity) {
    console.log(`🪪 ID de l'entité ciblée : ${targetEntity.id}`);
} else if (mode === 'codex-to-inventory') {
    console.log(`🪪 ID de l'entité ciblée : (aucune - cible = inventaire)`);
} else {
    console.warn(`🪪 ID de l'entité ciblée : ❌ introuvable`);
}
    if (targetElement) {
    console.log(`🧱 Élément DOM du slot ciblé :`, targetElement);
} else if (mode === 'codex-to-inventory') {
    console.log(`🧱 Élément DOM du slot ciblé : (aucun - cible = inventaire)`);
} else {
    console.warn(`🧱 Élément DOM du slot ciblé : ❌ undefined`);
}

    console.log(`🎁 Élément DOM de l'item :`, itemElement);
    console.log(`📦 Données de l'item :`, itemData);
    console.log(`🧍 Entité cible :`, targetEntity);
    console.log(`📨 Event drop/clic :`, event);

    switch (mode) {
		
// INVENTORY TO SLOT 		
        case 'inventory-to-codex': {
            console.log("CASE : inventory-to-codex ⚙️ Équipement via drag depuis inventaire vers entité");

            const slotElement = getUsableTargetSlot(targetElement, targetEntity);

            if (slotElement) {
                const slotId = slotElement.id;
                console.groupEnd();
                return equip({
                    item: itemData,
                    sourceEntity,
                    targetEntity,
                    slotId,
                    slotElement
                });
            } else {
                console.warn("🛑 Aucun slot libre ciblable. Action ignorée.");
                showNoFreeEquipmentSlotMessage(targetEntity);
            }
            break;
        }

// DOUBLE CLIC 
      case 'double-click': {
    console.log("CASE : double-click ⚙️ Équipement ou déséquipement via double-clic");

    const slotElement = targetElement?.closest?.('.stuff-slot') || targetElement;
    const slotId = slotElement?.id;

    if (source === 'codex' && slotId && targetEntity?.stuff?.[slotId.split('-')[0]]?.length) {
        unequip({ slotId, targetEntity, slotElement });
        break;
    }

    if (source === 'inventory' && itemData && targetEntity) {
        const freeSlot = findFirstFreeSlotElement(targetEntity);

        if (!freeSlot) {
            console.warn(`🛑 Aucun slot libre pour ${targetEntity.name}.`);
            showNoFreeEquipmentSlotMessage(targetEntity);
            break;
        }

        equip({
            item: itemData,
            targetEntity,
            slotId: freeSlot.id,
            slotElement: freeSlot
        });
        break;
    }

    console.warn("🛑 Aucun équipement/déséquipement possible via double-clic.");
    break;
      }


// SLOT TO INVENTORY
      case 'codex-to-inventory':
    console.log("CASE : codex-to-inventory ⚙️ Retrait d'équipement vers inventaire");

  
const slotElement = targetElement?.closest?.('.stuff-slot') || targetElement;

if (targetEntity && slotElement?.id) {
    unequip({
        slotId: slotElement.id,
        targetEntity,
        slotElement
    });
} else {
        console.warn("🛑 Impossible de retirer l'item : slot ou entité invalide.");
    }
    break;


        default:
            console.warn("❓ Mode inconnu dans stuffInteraction");
            break;
    }

    console.groupEnd();
}
































function persistEquippedEntity(targetEntity) {
  persistEquippedResourceStocks(targetEntity);
  const entiteIndex = entites.findIndex(e => e.id === targetEntity.id);

  if (entiteIndex !== -1) {
    entites[entiteIndex] = targetEntity;
    console.log(`📦 Mise à jour de entites[${entiteIndex}] pour ${targetEntity.name}`);
  }

  saveUpgradedEntity(targetEntity);
}


// CONDITION D'EQUIPEMENT
function canEquip(item, entity) {
    return item.itemType && item.itemType.includes('stuff');
	
	   // // Optionnel : niveau requis
    // if (item.requiredLevel && entity.level < item.requiredLevel) return false;
}

function getSlotKey(slotId) {
  return typeof slotId === 'string' ? slotId.split('-')[0] : null;
}

function getSlotIndex(slotElement) {
  const match = slotElement?.id?.match(/^slot(\d+)-/);
  return match ? Number(match[1]) : 0;
}

function isEmptySlot(slotElement, entity) {
  if (!slotElement) return false;

  const slotKey = getSlotKey(slotElement.id);
  const storedIds = slotKey ? entity?.stuff?.[slotKey] : null;

  return (
    getEquipmentSlotKeys(entity).includes(slotKey) &&
    !slotElement.classList.contains('equiped') &&
    slotElement.children.length === 0 &&
    (!Array.isArray(storedIds) || storedIds.length === 0)
  );
}

function findFirstFreeSlotIdForEntityData(entity) {
  if (!entity?.id) return null;

  for (const slotKey of getEquipmentSlotKeys(entity)) {
    const storedIds = entity?.stuff?.[slotKey];
    if (!Array.isArray(storedIds) || storedIds.length === 0) {
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

function findFirstFreeSlotElement(entity) {
  if (!entity?.id) return null;

  const container = document.getElementById(`equipment-${entity.id}`);
  if (!container) {
    return createGhostTargetSlot(findFirstFreeSlotIdForEntityData(entity));
  }

  const slots = Array.from(container.querySelectorAll('.stuff-slot'))
    .sort((a, b) => getSlotIndex(a) - getSlotIndex(b));

  return slots.find(slot => isEmptySlot(slot, entity)) ||
    createGhostTargetSlot(findFirstFreeSlotIdForEntityData(entity));
}

function getUsableTargetSlot(targetElement, targetEntity) {
  const slotElement = targetElement?.closest?.('.stuff-slot') || targetElement;

  if (slotElement?.classList?.contains('stuff-slot')) {
    return slotElement.id === `${getSlotKey(slotElement.id)}-${targetEntity?.id}`
      && getEquipmentSlotKeys(targetEntity).includes(getSlotKey(slotElement.id)) ? slotElement : null;
  }

  return findFirstFreeSlotElement(targetEntity);
}

function showEquipmentDropMessage(message, title = 'Équipement impossible') {
  if (typeof window !== 'undefined' && typeof window.showEquipmentDropMessage === 'function') {
    window.showEquipmentDropMessage(message, title);
    return;
  }

  if (typeof window !== 'undefined' && typeof window.showGamePopupMessage === 'function') {
    window.showGamePopupMessage({
      mode: 'auto',
      tone: 'passive',
      key: 'equipment-transfer',
      title,
      message,
      duration: 2000,
      fadeMs: 1500,
    });
    return;
  }

  if (typeof document === 'undefined') return;

  const host = document.querySelector('.Game-helper') || document.body;
  document.querySelectorAll('.inventory-transfer-message').forEach(node => node.remove());

  const panel = document.createElement('div');
  panel.className = 'inventory-transfer-confirm inventory-transfer-message';
  panel.setAttribute('role', 'status');
  panel.setAttribute('aria-live', 'polite');

  const titleNode = document.createElement('div');
  titleNode.className = 'inventory-transfer-confirm-title';
  titleNode.textContent = title;

  const text = document.createElement('div');
  text.className = 'inventory-transfer-confirm-text';
  text.textContent = message;

  panel.appendChild(titleNode);
  panel.appendChild(text);
  host.appendChild(panel);

  window.setTimeout(() => {
    if (!panel.isConnected) return;
    panel.classList.add('is-leaving');
  }, 3500);

  window.setTimeout(() => {
    panel.remove();
  }, 5000);
}

function showNoFreeEquipmentSlotMessage(targetEntity) {
  const name = targetEntity?.nickname || targetEntity?.name || 'Cette entité';
  showEquipmentDropMessage(`${name} ne possède pas de place d'équipement libre.`);
}

function applyEquippedDragHandlers(itemImg, equippedId) {
  if (!itemImg || !equippedId) return;

  if (itemImg._dragStartHandler) {
    itemImg.removeEventListener('dragstart', itemImg._dragStartHandler);
  }
  if (itemImg._dragEndHandler) {
    itemImg.removeEventListener('dragend', itemImg._dragEndHandler);
  }

  const dragStartHandler = (e) => {
    beginDragHelperCleanup();
    e.dataTransfer.setData('text/plain', equippedId);
    e.dataTransfer.effectAllowed = 'move';
    itemImg.classList.add('using');
  };

  const dragEndHandler = () => {
    itemImg.classList.remove('using');
    endDragHelperCleanup();
  };

  itemImg.addEventListener('dragstart', dragStartHandler);
  itemImg.addEventListener('dragend', dragEndHandler);
  itemImg._dragStartHandler = dragStartHandler;
  itemImg._dragEndHandler = dragEndHandler;
}

function prepareEquippedSlotDom(slotElement, item, equippedId) {
  if (!slotElement || !item || !equippedId) return;

  const qualityClass = `quality-${getScoredItemQuality(item)}`;
  const wrapper = document.createElement('div');
  wrapper.classList.add('stuff-item-wrapper', qualityClass);
  wrapper.dataset.stuffId = equippedId;

  const existingImg = document.getElementById(item.itemId) || document.getElementById(equippedId);
  const itemImg = existingImg || document.createElement('img');

  itemImg.src = item.itemAsset;
  itemImg.alt = item.displayName;
  itemImg.id = equippedId;
  itemImg.classList.add('inventory-item-icon', item.functionName);
  itemImg.setAttribute('draggable', 'true');
  applyEquippedDragHandlers(itemImg, equippedId);

  wrapper.appendChild(itemImg);

  slotElement.innerHTML = '';
  slotElement.appendChild(wrapper);
  slotElement.classList.add('equiped');
  delete slotElement.dataset.stat;
  delete slotElement.dataset.hover;
  delete slotElement.dataset.entityId;
}

function markSlotEmpty(slotElement, entityId) {
  if (!slotElement) return;

  slotElement.innerHTML = '';
  slotElement.classList.remove('equiped');
  slotElement.dataset.stat = 'stuffSlot';
  slotElement.dataset.hover = 'true';
  slotElement.dataset.entityId = entityId;
}

function syncEquipmentSlotsDom(entity) {
  if (!entity?.id) return;
  if (typeof document === "undefined") return;

  const containers = Array.from(document.querySelectorAll(".entity-equipement"))
    .filter(container => container.id === `equipment-${entity.id}`);

  if (!containers.length) return;

  const slotKeys = getEquipmentSlotKeys(entity);

  containers.forEach((container) => {
    for (const slotKey of slotKeys) {
      const i = Number(slotKey.slice(4));
      const slotId = `${slotKey}-${entity.id}`;
      let slot = Array.from(container.querySelectorAll(".stuff-slot"))
        .find(node => node.id === slotId);

      if (!slot) {
        slot = document.createElement('div');
        slot.className = `stuff-slot container-${i}`;
        slot.id = slotId;
        container.appendChild(slot);
      }

      const equippedId = Array.isArray(entity.stuff?.[slotKey])
        ? entity.stuff[slotKey][0]
        : null;
      const item = equippedId ? getEquippedItemById(equippedId) : null;

      if (equippedId && item) {
        prepareEquippedSlotDom(slot, item, equippedId);
      } else {
        markSlotEmpty(slot, entity.id);
      }
    }

    Array.from(container.querySelectorAll('.stuff-slot')).forEach(slot => {
      if (!slotKeys.includes(getSlotKey(slot.id))) slot.remove();
    });
  });

  DropEquipementtoInventory();
  DclicSlottoInventory();
  equippedHoverDescription();
}

function hasOpenCodexProfileSummary(entity) {
  if (!entity?.id) return false;
  if (typeof document === "undefined") return false;

  return Array.from(document.querySelectorAll(".codex-profile-summary"))
    .some(summary => Array.from(summary.querySelectorAll("[data-entity-id]"))
      .some(node => String(node.dataset.entityId) === String(entity.id)));
}

function isCodexProfileEquipmentContext(slotElement, entity) {
  if (!slotElement || !entity?.id) return false;
  if (!hasOpenCodexProfileSummary(entity)) return false;

  return Boolean(
    slotElement.closest?.(".sub-menu-stat.profile-stat") ||
    slotElement.closest?.(".sub-menu-stat.equipment-stat") ||
    slotElement.closest?.(".codex-entity-view")
  );
}

function refreshCodexProfileSummaryAfterEquipmentChange(entity, shouldRefresh) {
  if (!shouldRefresh || typeof window === "undefined") return;

  const refreshSummary = window.refreshCodexProfileSummary;
  if (typeof refreshSummary === "function") {
    refreshSummary(entity);
  }
}

function refreshCodexEquipmentInventoryAfterEquipmentChange(entity) {
  if (typeof window === "undefined") return;

  const refreshInventory = window.refreshCodexEquipmentInventory;
  if (typeof refreshInventory === "function") {
    refreshInventory(entity);
  }
}

function clearEquipmentPreviewDomState(entityId) {
  if (!entityId || typeof document === "undefined") return;

  const entitySelector = globalThis.CSS?.escape
    ? CSS.escape(String(entityId))
    : String(entityId).replace(/["\\]/g, "\\$&");

  document
    .querySelectorAll(`.entite-stat.preview[data-entity-id="${entitySelector}"]`)
    .forEach((node) => {
      node.textContent = "";
      node.classList.add("is-hidden");
    });

  document
    .querySelectorAll(
      `.stat-container[data-entity-id="${entitySelector}"], ` +
      `.codex-profile-battle-stat[data-entity-id="${entitySelector}"], ` +
      `.codex-profile-umbra-stat[data-entity-id="${entitySelector}"]`
    )
    .forEach((node) => {
      node.classList.remove("upgraded", "reducted", "new", "has-preview", "last-substat", "last-attribut");
      delete node.dataset.previewDelta;
      node
        .querySelectorAll?.(".entite-stat:not(.preview)")
        .forEach(valueNode => valueNode.classList.remove("new-stat", "stat-new"));
    });
}

function prepareEntityForEquipmentStatDiff(entity) {
  if (!entity?.modifierStats?.preview) return;

  purgeStatPreview(entity.id);
  delete entity.modifierStats.preview;
  recomputeEntityStats(entity);
  clearEquipmentPreviewDomState(entity.id);

  console.log(`🧹 Preview level-up purgée avant changement d'équipement pour ${entity.name || entity.id}`);
}

export function equip({ item, targetEntity, slotId, slotElement: providedSlotElement = null, sourceEntity = null }) {
  if (!requireSafeMenuAccess() || !canEquip(item, targetEntity) || !item.itemId) return false;
  const slotKey = getSlotKey(slotId);
  if (slotId !== `${slotKey}-${targetEntity?.id}` || !getEquipmentSlotKeys(targetEntity).includes(slotKey)) return false;
  const equippedId = item.equippedId || `e${item.itemId}`;
  persistEquippedResourceStocks(targetEntity);
  if (sourceEntity) persistEquippedResourceStocks(sourceEntity);
  const existing = getEquippedItemById(equippedId);
  const sourceKey = existing && getSlotKey(existing.slot);
  if (existing) {
    if (!sourceEntity || String(existing.equippedTo) !== String(sourceEntity.id)
        || sourceEntity.stuff?.[sourceKey]?.[0] !== equippedId) return false;
    item = existing;
    if (String(sourceEntity.id) === String(targetEntity.id)) {
      sourceEntity = targetEntity;
      if (sourceKey === slotKey) return true;
    }
  } else {
    if (sourceEntity || !getBattleInventoryState().Playerinventory.some(entry =>
        (typeof entry === 'string' ? entry : entry.itemId) === item.itemId)) return false;
  }
  const replacedId = targetEntity.stuff?.[slotKey]?.[0];
  const replaced = replacedId ? getEquippedItemById(replacedId) : null;
  if (replacedId && (!replaced || String(replaced.equippedTo) !== String(targetEntity.id)
      || replaced.slot !== slotId)) return false;
  const affected = [...new Set([targetEntity, sourceEntity].filter(Boolean))];
  const snapshots = new Map();
  for (const entity of affected) {
    prepareEntityForEquipmentStatDiff(entity);
    snapshots.set(entity, {
      stats: structuredClone(entity.stats || {}),
      extraShift: getEquipmentResourceCurrent(entity, 'shift'),
      modifiers: structuredClone(entity.modifierStats || {}),
      refresh: hasOpenCodexProfileSummary(entity),
    });
  }
  if (!getEquipmentSlotKeys(targetEntity).includes(slotKey)
      || (targetEntity.stuff[slotKey]?.[0] || null) !== (replacedId || null)
      || (sourceEntity && sourceEntity.stuff?.[sourceKey]?.[0] !== equippedId)) return false;
  const slotElement = providedSlotElement?.closest?.('.stuff-slot') || providedSlotElement
    || document.getElementById(slotId) || createGhostTargetSlot(slotId);

  // Set both owners before recomputing: a swap must not briefly remove HP or resource bonuses.
  if (sourceEntity) sourceEntity.stuff[sourceKey] = [];
  if (replaced && !sourceEntity) removeFromEquippedItemsStorage(replacedId);
  if (replaced && sourceEntity) {
    addToEquippedItemsStorage(replacedId, {
      ...replaced, equippedTo: sourceEntity.id, slot: `${sourceKey}-${sourceEntity.id}`,
    });
    sourceEntity.stuff[sourceKey] = [replacedId];
  }
  const fullEquippedItem = {
    ...item, equippedId, equippedTo: targetEntity.id, slot: slotId,
    equippedAt: item.equippedAt || Date.now(),
  };
  ensureStuffArmorReserve(fullEquippedItem);
  ensureStuffResourceStocks(fullEquippedItem);
  addToEquippedItemsStorage(equippedId, fullEquippedItem);
  targetEntity.stuff[slotKey] = [equippedId];
  if (!sourceEntity) removeItem(item.itemId, { from: 'inventory' });
  prepareEquippedSlotDom(slotElement, fullEquippedItem, equippedId);

  for (const entity of affected) {
    const previous = snapshots.get(entity);
    recomputeEntityStats(entity);
    if (entity.stats.HP?.current > entity.stats.HP?.max) entity.stats.HP.current = entity.stats.HP.max;
    persistEquippedEntity(entity);
    refreshCodexProfileSummaryAfterEquipmentChange(entity, previous.refresh);
    syncDOMWithStats(previous.stats, entity.stats, entity.id, entity, {
      oldModifierStats: previous.modifiers,
      newModifierStats: structuredClone(entity.modifierStats || {}),
    });
    syncEquipmentSlotsDom(entity);
    refreshCodexEquipmentInventoryAfterEquipmentChange(entity);
    showStatGainsFromDiff(entity, previous.stats, entity.stats,
      getEquipmentResourceCurrent(entity, 'shift') - previous.extraShift);
  }
  return true;
}

export function unequip({ slotId, targetEntity, slotElement: providedSlotElement = null }) {
  console.groupCollapsed("♻️ Fonction unequip() appelée");

const slotKey = slotId.split('-')[0];
const equippedId = targetEntity?.stuff?.[slotKey]?.[0];

if (!equippedId) {
  console.warn(`❌ Aucun equippedId dans le slot ${slotId}`);
  console.groupEnd();
  return;
}

prepareEntityForEquipmentStatDiff(targetEntity);
persistEquippedResourceStocks(targetEntity);
const oldStats = structuredClone(targetEntity.stats || {});
const oldExtraShift = getEquipmentResourceCurrent(targetEntity, 'shift');
const oldModifierStats = structuredClone(targetEntity.modifierStats || {});

const slotElement = providedSlotElement?.closest?.('.stuff-slot') || providedSlotElement || document.getElementById(slotId);
const shouldRefreshProfileSummary = isCodexProfileEquipmentContext(slotElement, targetEntity);
if (slotElement) {
  slotElement.innerHTML = '';
  slotElement.classList.remove('equiped');
  console.log(`🧼 Slot DOM ${slotId} vidé`);
}
// Récupère l'item équipé proprement.
let item = getEquippedItemById(equippedId);
if (!item) {
  console.warn(`❌ Impossible de retrouver l'item via equippedId=${equippedId}`);
}

// 🧼 Nettoyage du slot dans l'entité
delete targetEntity.stuff[slotKey];
console.log(`🧼 Slot "${slotKey}" nettoyé pour l'entité ${targetEntity.id}`);

// 🧹 Suppression côté stockage equippedItems (+ le storage réajoute déjà l'item base)
const cleanedItemId = removeFromEquippedItemsStorage(equippedId);
console.log(`🧹 Nettoyage equippedItems via removeFromEquippedItemsStorage(${equippedId}) → ${cleanedItemId}`);


// 🔁 Retrait du modifier du stuff puis recompute → sync DOM
removeStuffModifier(targetEntity, equippedId);
refreshCodexProfileSummaryAfterEquipmentChange(targetEntity, shouldRefreshProfileSummary);
syncDOMWithStats(oldStats, targetEntity.stats, targetEntity.id, targetEntity, {
  oldModifierStats,
  newModifierStats: structuredClone(targetEntity.modifierStats || {}),
});
syncEquipmentSlotsDom(targetEntity);
showStatGainsFromDiff(targetEntity, oldStats, targetEntity.stats,
  getEquipmentResourceCurrent(targetEntity, 'shift') - oldExtraShift);
console.log(`📊 Stats recalculées pour ${targetEntity.name} après déséquipement`);

// 🎒 Inventaire: ID base garanti par l'item équipé, et pas de double ajout
// 🎒 Réajout dans l’inventaire (temps réel si l’UI est ouverte)
const baseItemId = item?.itemId || cleanedItemId;
const inventoryContainer = document.querySelector('.inventory-interface .inventory-content');

// UI visible ?
const isInventoryOpen = !!(inventoryContainer && inventoryContainer.offsetParent !== null);

// Éviter les doublons DOM : déjà une icône avec cet id ?
const alreadyInDOM = baseItemId ? document.getElementById(baseItemId) : null;

if (baseItemId && isInventoryOpen) {
  if (!alreadyInDOM) {
    // ⚠️ addItemToInventory met aussi à jour PlayerSave/IngameItemsData,
    // mais il dédoublonne avant de pousser → safe.
    addItemToInventory(baseItemId);
    console.log(`📦 ${baseItemId} ajouté visuellement à l’inventaire (UI ouverte)`);
  } else {
    console.log(`ℹ️ ${baseItemId} déjà présent dans le DOM de l’inventaire`);
  }
} else if (!baseItemId) {
  console.warn(`⚠️ Aucun itemId canonique retrouvé pour ${equippedId}`);
} else {
  console.log(`🧭 Inventaire fermé → ajout seulement côté sauvegarde (via removeFromEquippedItemsStorage)`);
}
// MàJ runtime
persistEquippedEntity(targetEntity);
refreshCodexEquipmentInventoryAfterEquipmentChange(targetEntity);

console.groupEnd();
}

