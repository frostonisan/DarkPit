import { loadFromLocalStorage, saveToLocalStorage, addToEquippedItemsStorage, removeFromEquippedItemsStorage, saveUpgradedEntity  } from './GameStorage.js';
import { setLastDraggedItemId, getLastDraggedItemId, removeItem, addItemToInventory, DclicSlottoInventory,equippedHoverDescription } from './itemManager.js';
import { entites, upsertStuffModifier, removeStuffModifier, recomputeEntityStats, calculateVelocityReduction } from './entites.js';
import { syncDOMWithStats } from './UpgradeEntity.js';
export function stuffInteraction({
    mode,
    source,
    target,
    itemElement,
    itemData,
    targetEntity,
    targetElement,
    event
}) {
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
        case 'inventory-to-codex':
            console.log("CASE : inventory-to-codex ⚙️ Équipement via drag depuis inventaire vers entité");

            // 🛑 Vérifie que le slot est vide
            if (targetElement && targetElement.children.length === 0) {
                const slotId = targetElement.id;
                equip({
                    item: itemData,
                    targetEntity,
                    slotId
                });
            } else {
                console.warn("🛑 Le slot cible n'est pas vide. Action ignorée.");
            }
            break;

// DOUBLE CLIC 
      case 'double-click':
    console.log("CASE : double-click ⚙️ Équipement ou déséquipement via double-clic");

    const slotId = targetElement?.id;
    if (slotId && targetEntity?.stuff?.[slotId.split('-')[0]]) {
        unequip({ slotId, targetEntity });
    } else {
        console.warn("🛑 Aucun item à déséquiper sur ce slot.");
    }
    break


// SLOT TO INVENTORY
      case 'codex-to-inventory':
    console.log("CASE : codex-to-inventory ⚙️ Retrait d'équipement vers inventaire");

  
if (targetEntity && targetElement?.id) {
    unequip({
        slotId: targetElement.id,
        targetEntity
    });

    targetElement.innerHTML = '';
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
































// Convertit la définition d'un item en delta pour entite.modifierStats.durable.stuff.byId[equippedId]
function buildStuffDelta(item) {
  const delta = {};
  const effects = Array.isArray(item?.Stuffeffets) ? item.Stuffeffets : [];

  for (const eff of effects) {
    if (!eff || eff.type !== 'stat-buff') continue;

    const stat = eff.stat;
    const val  = eff.value;

    // Support des modes { flat } ou { percent } selon tes datas éventuelles
    // Priorité: eff.mode === 'percent' ou eff.valueType === 'percent' -> pourcentage
    const isPercent = eff.mode === 'percent' || eff.valueType === 'percent' || eff.percent === true;

    if (!stat || typeof val !== 'number') continue;

    if (isPercent) {
      // Plusieurs buffs pourcent sur la même stat s'additionnent
      if (!delta[stat] || typeof delta[stat] !== 'object') delta[stat] = {};
      delta[stat].percent = (delta[stat].percent ?? 0) + val;
    } else {
      // Addition flat par défaut
      const cur = delta[stat];
      if (typeof cur === 'number') {
        delta[stat] = cur + val;
      } else if (cur && typeof cur === 'object') {
        cur.flat = (cur.flat ?? 0) + val;
        delta[stat] = cur;
      } else {
        delta[stat] = val; // nombre = flat
      }
    }
  }
  return delta;
}


// CONDITION D'EQUIPEMENT
function canEquip(item, entity) {
    return item.itemType && item.itemType.includes('stuff');
	
	   // // Optionnel : niveau requis
    // if (item.requiredLevel && entity.level < item.requiredLevel) return false;
}

export function equip({ item, targetEntity, slotId }) {
  console.groupCollapsed(`🔧 Équipement de l'item ${item.serial} sur l'entité ${targetEntity.id}`);

  // 1. Validation
  if (!canEquip(item, targetEntity)) {
    console.warn(`❌ ${targetEntity.name} ne peut pas équiper ${item.displayName}.`);
    console.groupEnd();
    return;
  }

  // 2. Slot DOM
  const slotElement = document.getElementById(slotId);
  if (!slotElement) {
    console.warn(`❌ Slot DOM introuvable : ${slotId}`);
    console.groupEnd();
    return;
  }

  // 3. Construction item équipé
  const itemId = item.itemId;
  if (!itemId) {
    console.error("❌ itemId manquant !");
    return;
  }

  const equippedId = `e${itemId}`;
  const fullEquippedItem = {
    ...item,
    equippedId,
    equippedTo: targetEntity.id,
    slot: slotId,
    equippedAt: Date.now(),
  };

  // 4. Sauvegarde dans equippedItems
  const equippedItems = loadFromLocalStorage('equippedItems', {});
  equippedItems[equippedId] = fullEquippedItem;
  saveToLocalStorage('equippedItems', equippedItems);

  console.log(`🧩 ${equippedId} sauvegardé dans equippedItems`);

// 5. Affichage visuel dans slot
slotElement.innerHTML = '';

const existingImg = document.getElementById(itemId); // ← base "i..."
const qualityClass = `quality-${item.itemQuality ?? 0}`;
const wrapper = document.createElement('div');
wrapper.classList.add('stuff-item-wrapper', qualityClass);
wrapper.dataset.stuffId = equippedId;

if (existingImg) {
  existingImg.id = equippedId; // ✅ toujours "e..." quand équipé (DOM)
  wrapper.appendChild(existingImg);
  slotElement.appendChild(wrapper);
  DclicSlottoInventory();
  console.log(`🖼️ Élément déplacé dans le slot ${slotId}`);
} else {
  const itemImg = document.createElement('img');
  itemImg.src = item.itemAsset;
  itemImg.alt = item.displayName;
  itemImg.id = equippedId; // ✅ créé directement en "e..."
  itemImg.classList.add('inventory-item-icon', item.functionName);
  itemImg.setAttribute('draggable', 'true');

  wrapper.appendChild(itemImg);
  slotElement.appendChild(wrapper);
  console.warn(`🔄 Élément recréé pour ${slotId}`);
  DclicSlottoInventory();
}

slotElement.classList.add('equiped');
  // 6. Retrait de l'inventaire + stockage de l'ID dans .stuff
  addToEquippedItemsStorage(equippedId, fullEquippedItem);
  removeItem(itemId, { from: 'inventory' });

  const slotKey = slotId.split('-')[0]; // ex: slot1 → "slot1"
  if (!targetEntity.stuff) targetEntity.stuff = {};
  targetEntity.stuff[slotKey] = [equippedId];
// 8. Application des effets via modifierStats + recompute, mise à jour DOM et sauvegardes
const oldStats = structuredClone(targetEntity.stats);

// Construire le delta depuis l'item et l’appliquer sur le slot via equippedId
const delta = buildStuffDelta(item);
// upsertStuffModifier fait: entite.modifierStats.durable.stuff.byId[equippedId] = delta; puis recomputeEntityStats(entite)
upsertStuffModifier(targetEntity, equippedId, delta);

// Sync DOM (diff uniquement)
syncDOMWithStats(oldStats, targetEntity.stats, targetEntity.id);
equippedHoverDescription();

// HP.current > HP.max ? clamp
if (targetEntity.stats.HP?.current > targetEntity.stats.HP?.max) {
  targetEntity.stats.HP.current = targetEntity.stats.HP.max;
}

// Sauvegarde dans selectedArmyA (remplacement complet de l'entité)
const updatedArmyFinal = loadFromLocalStorage('selectedArmyA', []).map(ent => {
  return ent.id === targetEntity.id ? targetEntity : ent;
});
saveToLocalStorage('selectedArmyA', updatedArmyFinal);

console.log(`📊 Modifiers appliqués et stats recalculées pour ${targetEntity.name}`);
saveUpgradedEntity(targetEntity);

// MàJ du tableau runtime entites
const entiteIndex = entites.findIndex(e => e.id === targetEntity.id);
if (entiteIndex !== -1) {
  entites[entiteIndex] = targetEntity;
  console.log(`📦 Mise à jour de entites[${entiteIndex}] pour ${targetEntity.name}`);
}

console.groupEnd();
}

export function unequip({ slotId, targetEntity }) {
  console.groupCollapsed("♻️ Fonction unequip() appelée");

const equippedStore = loadFromLocalStorage('equippedItems', {}); // objet clé → item
const slotKey = slotId.split('-')[0];
const equippedId = targetEntity?.stuff?.[slotKey]?.[0];
const oldStats = structuredClone(targetEntity.stats);

if (!equippedId) {
  console.warn(`❌ Aucun equippedId dans le slot ${slotId}`);
  console.groupEnd();
  return;
}
const slotElement = document.getElementById(slotId);
if (slotElement) {
  slotElement.innerHTML = '';
  slotElement.classList.remove('equiped');
  console.log(`🧼 Slot DOM ${slotId} vidé`);
}
// Récupère l'item équipé proprement
let item = equippedStore?.[equippedId];
// fallback (si le store est un tableau ou autre format legacy)
if (!item && equippedStore && typeof equippedStore === 'object') {
  const vals = Array.isArray(equippedStore) ? equippedStore : Object.values(equippedStore);
  item = vals.find(i => i?.equippedId === equippedId);
}
if (!item) {
  console.warn(`❌ Impossible de retrouver l'item via equippedId=${equippedId}`);
}

// 🧼 Nettoyage du slot dans l'entité
delete targetEntity.stuff[slotKey];
console.log(`🧼 Slot "${slotKey}" nettoyé pour l'entité ${targetEntity.id}`);

// 💾 Mise à jour de selectedArmyA (structure stuff uniquement)
const army = loadFromLocalStorage('selectedArmyA', []);
const updatedArmy = army.map(ent => {
  if (ent.id === targetEntity.id) {
    if (ent.stuff && ent.stuff[slotKey]) delete ent.stuff[slotKey];
  }
  return ent;
});
saveToLocalStorage('selectedArmyA', updatedArmy);
console.log(`💽 selectedArmyA mis à jour`);

// 🧹 Suppression côté stockage equippedItems (+ le storage réajoute déjà l'item base)
const cleanedItemId = removeFromEquippedItemsStorage(equippedId);
console.log(`🧹 Nettoyage equippedItems via removeFromEquippedItemsStorage(${equippedId}) → ${cleanedItemId}`);

const equippedObj = loadFromLocalStorage('equippedItems', {});
if (equippedObj && typeof equippedObj === 'object') {
  delete equippedObj[equippedId];
  saveToLocalStorage('equippedItems', equippedObj);
  console.log(`🧹 ${equippedId} supprimé de equippedItems (objet-clé)`);
}

// 🔁 Retrait du modifier du stuff puis recompute → sync DOM
removeStuffModifier(targetEntity, equippedId);
syncDOMWithStats(oldStats, targetEntity.stats, targetEntity.id);
console.log(`📊 Stats recalculées pour ${targetEntity.name} après déséquipement`);

// ✅ Sauvegarde finale de l'entité mise à jour dans selectedArmyA
const finalArmy = loadFromLocalStorage('selectedArmyA', []).map(ent => {
  return ent.id === targetEntity.id ? targetEntity : ent;
});
saveToLocalStorage('selectedArmyA', finalArmy);
console.log(`💾 selectedArmyA mis à jour avec les stats corrigées`);

// 🎒 Inventaire: ID base "i..." garanti, et pas de double ajout
// 🎒 Réajout dans l’inventaire (temps réel si l’UI est ouverte)
const baseItemId = (item?.itemId || equippedId).replace(/^e/, ''); // → "i..."
const inventoryContainer = document.querySelector('.inventory-interface .inventory-content');

// UI visible ?
const isInventoryOpen = !!(inventoryContainer && inventoryContainer.offsetParent !== null);

// Éviter les doublons DOM : déjà une icône avec cet id ?
const alreadyInDOM = document.getElementById(baseItemId);

if (isInventoryOpen) {
  if (!alreadyInDOM) {
    // ⚠️ addItemToInventory met aussi à jour PlayerSave/IngameItemsData,
    // mais il dédoublonne avant de pousser → safe.
    addItemToInventory(baseItemId);
    console.log(`📦 ${baseItemId} ajouté visuellement à l’inventaire (UI ouverte)`);
  } else {
    console.log(`ℹ️ ${baseItemId} déjà présent dans le DOM de l’inventaire`);
  }
} else {
  console.log(`🧭 Inventaire fermé → ajout seulement côté sauvegarde (via removeFromEquippedItemsStorage)`);
}
// MàJ runtime
const entiteIndex = entites.findIndex(e => e.id === targetEntity.id);
if (entiteIndex !== -1) {
  entites[entiteIndex] = targetEntity;
  saveUpgradedEntity(targetEntity);
  console.log(`📦 Mise à jour de entites[${entiteIndex}] après déséquipement`);
}

console.groupEnd();
}

