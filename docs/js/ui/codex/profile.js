import { createMovementDisplay } from "../../rendering/hud.js";
import { getOpenViewRoots } from '../viewRoots.js';
import { ensureMovementState } from "../../board/deployment.js";
import { cachedResourceUrl } from "../../data/loaderList.js";
import { getScoredItemQuality } from "../../procedural/proc-bareme.js";
import { loadFromLocalStorage, getEquippedItemById } from "../../storage/gameStorage.js";
import { normalizeStatKey, getSafe, getDisplayStatKey } from "../../entities/rules.js";
import { getEquipmentSlotKeys } from "../../entities/runtime.js";
import {
  DropFromCodexToInventory, setupDragAndDropItem, DropEquipementtoInventory, DclicSlottoInventory,
  getIngameItemById, equippedHoverDescription, bindPersistentDescription, createItemPowerValue,
} from "../../items/itemManager.js";
import { glitterStuff } from "../../biome/meteo.js";
import { stats } from "../../data/statsData.js";
import {
  createEntityStatsTitleNode, createEntityPowerValue, createEntityRateSummary, tagUmbraStatContainer,
} from "../statistics/components.js";
import { buildDefenseHpHelper, buildRoleDurationHelper, HELPER_TEXT } from "../../data/helpers.js";
import { attackDetails } from "../../data/attackList.js";
import {
  getAttackResolutionFlags, getAttackNatureRules, resolveAttackDefinitionForEntity,
} from "../../combat/attackResolution.js";

import { calculateStatsDisplay } from "../statistics/details.js";
import { getEntityCombatDetails, COMBAT_ROLES } from "../../storage/entityStorage.js";
import { createNicknameForm } from "../../entities/progression.js";
import {
  createLifeBars, createLifeCounter, createArmorCounter, createMovementCounter,
} from "../../rendering/entities.js";
import { normArr } from "../../combat/vitals.js";
import { entitesLore } from "../../data/entityLore.js";
import { statsByKey, umbraDetection } from "../statistics/helpers.js";

// Profil du Codex : equipements, emplacements, inventaire associe et fiche de l’entite.

function getInventoryEntryItemId(entry) {
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object") return entry.itemId || null;
  return null;
}

function isStuffInventoryItem(item) {
  const types = Array.isArray(item?.itemType)
    ? item.itemType
    : [item?.itemType].filter(Boolean);

  return types.includes("stuff");
}

function getCodexStuffInventoryItems() {
  const playerSave = loadFromLocalStorage("PlayerSave", { Playerinventory: [] });
  const inventory = Array.isArray(playerSave.Playerinventory)
    ? playerSave.Playerinventory
    : [];
  const byId = new Map();

  inventory.forEach(entry => {
    const itemId = getInventoryEntryItemId(entry);
    if (!itemId || byId.has(itemId)) return;

    const item = typeof entry === "object" && entry?.itemId
      ? entry
      : getIngameItemById(itemId);

    if (!item || !isStuffInventoryItem(item)) return;
    byId.set(itemId, item);
  });

  return Array.from(byId.values());
}

function getStatNameFromKey(statKey) {
  const canonicalKey = normalizeStatKey(statKey);
  const found = stats.find(stat => normalizeStatKey(stat.key) === canonicalKey);
  return found?.name || statKey;
}

function getCodexEquipmentItemShortName(item) {
  const deltas = buildCodexEquipmentItemDeltas(item);
  const entries = Object.entries(deltas);

  if (entries.length === 1) {
    const [stat, value] = entries[0];
    const sign = Number(value) > 0 ? "+" : "";
    return `${sign}${value} ${getStatNameFromKey(stat)}`;
  }

  return item.displayName || item.name || "Équipement";
}

function buildCodexEquipmentItemDeltas(item) {
  const deltas = {};

  if (!Array.isArray(item?.Stuffeffets)) return deltas;

  item.Stuffeffets.forEach(effect => {
    const stat = normalizeStatKey(effect?.stat);
    const value = Number(effect?.value);
    if (!stat || !Number.isFinite(value)) return;
    deltas[stat] = (Number(deltas[stat]) || 0) + value;
  });

  return deltas;
}

function createCodexEquipmentInventoryItem(item, entite) {
  if (!item?.itemId) return null;

  const itemNode = document.createElement("div");
  itemNode.classList.add("inventory-item", "codex-equipment-inventory-item");
  itemNode.dataset.itemId = item.itemId;
  itemNode.dataset.entityId = entite.id;
  itemNode.setAttribute("draggable", "false");

  const types = Array.isArray(item.itemType)
    ? item.itemType
    : [item.itemType].filter(Boolean);
  types.forEach(type => itemNode.classList.add(type));
  itemNode.classList.add(`quality-${getScoredItemQuality(item)}`);

  const img = document.createElement("img");
  img.src = cachedResourceUrl(item.itemAsset);
  img.alt = item.displayName || item.name || "Équipement";
  img.id = item.itemId;
  img.classList.add("inventory-item-icon");
  if (item.functionName) img.classList.add(item.functionName);
  img.setAttribute("draggable", "true");

  setupDragAndDropItem(img, item.itemId);

  const label = document.createElement("span");
  label.className = "codex-equipment-inventory-item-name";
  label.textContent = getCodexEquipmentItemShortName(item);

  itemNode.append(img, label, createItemPowerValue(item));
  bindPersistentDescription(itemNode, item, item.itemId, "item");

  return itemNode;
}

function renderCodexEquipmentInventoryGrid(grid, entite) {
  if (!grid || !entite) return;

  grid.innerHTML = "";
  const stuffItems = getCodexStuffInventoryItems();

  if (!stuffItems.length) {
    const empty = document.createElement("p");
    empty.className = "codex-equipment-inventory-empty";
    empty.textContent = "Aucun équipement disponible.";
    grid.appendChild(empty);
  } else {
    stuffItems.forEach(item => {
      const itemNode = createCodexEquipmentInventoryItem(item, entite);
      if (itemNode) grid.appendChild(itemNode);
    });
  }

  requestAnimationFrame(() => {
    DropFromCodexToInventory();
    DclicSlottoInventory();
    glitterStuff(".codex-equipment-inventory-item.stuff", 3);
  });
}

function refreshCodexEquipmentInventory(entiteOrId = null) {
  if (typeof document === "undefined") return;

  const targetId = typeof entiteOrId === "object"
    ? entiteOrId?.id
    : entiteOrId;
  const selectedArmy = loadFromLocalStorage("selectedArmyA", []);

  document
    .querySelectorAll(".codex-equipment-inventory-grid[data-entity-id]")
    .forEach(grid => {
      if (targetId && String(grid.dataset.entityId) !== String(targetId)) return;

      const entite =
        (typeof entiteOrId === "object" && String(entiteOrId?.id) === String(grid.dataset.entityId))
          ? entiteOrId
          : selectedArmy.find(entity => String(entity?.id) === String(grid.dataset.entityId));

      renderCodexEquipmentInventoryGrid(grid, entite);
    });
}

function getCodexStableEquipmentCharge(entite) {
  // Les emplacements proteges restent accessibles meme avec une dette de Charge.
  return getEquipmentSlotKeys(entite).length;
}

function createEquipmentSubmenu(entite) {
  if (getCodexStableEquipmentCharge(entite) <= 0) return null;

  const wrapper = document.createElement("div");
  wrapper.classList.add("sub-menu-stat", "equipment-stat");

  const header = document.createElement("div");
  header.className = "sub-menu-stat__header";
  header.appendChild(createEntityStatsTitleNode("Équipement"));
  wrapper.appendChild(header);

  const body = document.createElement("div");
  body.className = "sub-menu-stat__body codex-equipment-body";

  const slotsPanel = document.createElement("div");
  slotsPanel.className = "codex-equipment-slots-panel";
  createStuffDom(entite, slotsPanel);

  const inventoryPanel = document.createElement("div");
  inventoryPanel.className = "codex-equipment-inventory-panel";

  const inventoryHead = document.createElement("div");
  inventoryHead.className = "codex-equipment-inventory-head";

  const bagIcon = document.createElement("div");
  bagIcon.className = "codex-equipment-inventory-icon";

  const inventoryTitle = document.createElement("p");
  inventoryTitle.className = "codex-equipment-inventory-title";
  inventoryTitle.textContent = "Équipement dans l'inventaire";

  inventoryHead.append(bagIcon, inventoryTitle);

  const inventoryGrid = document.createElement("div");
  inventoryGrid.className = "inventory-content codex-equipment-inventory-grid";
  inventoryGrid.dataset.entityId = entite.id;

  inventoryPanel.append(inventoryHead, inventoryGrid);
  body.append(slotsPanel, inventoryPanel);
  wrapper.appendChild(body);

  renderCodexEquipmentInventoryGrid(inventoryGrid, entite);

  return wrapper;
}

function createStuffDom(entite, codexEntityView) {
    console.group(`🧱 createStuffDom : ${entite.name} (ID: ${entite.id})`);

    const slotKeys = getEquipmentSlotKeys(entite);
    const chargeCount = slotKeys.length;
    console.log(`→ Nombre de slots prévus (charge) : ${chargeCount}`);
    const stuffData = entite.stuff || {};

    const entityEquipement = document.createElement('div');
    entityEquipement.className = 'entity-equipement';
    entityEquipement.id = `equipment-${entite.id}`;

for (const slotKey of slotKeys) {
    const i = Number(slotKey.slice(4));
    const slotId = `${slotKey}-${entite.id}`;
    const slot = document.createElement('div');
    slot.className = `stuff-slot container-${i}`;
    slot.id = slotId;

    const itemArray = stuffData[slotKey];
    const hasEquip = Array.isArray(itemArray) && itemArray.length > 0;

if (hasEquip) {
    const rawItemId = itemArray[0];
    const itemData = getItemDataById(rawItemId);

    console.log(`📦 ${slotKey} → équipé avec : ${rawItemId}`);

    if (itemData) {
        const qualityClass = `quality-${getScoredItemQuality(itemData)}`;
        const wrapper = document.createElement('div');
        wrapper.classList.add('stuff-item-wrapper', qualityClass);
        wrapper.dataset.stuffId = rawItemId;

        const itemImg = document.createElement('img');
        itemImg.src = cachedResourceUrl(itemData.itemAsset);
        itemImg.alt = itemData.displayName;
        itemImg.id = rawItemId;
        itemImg.classList.add('inventory-item-icon', itemData.functionName);
        itemImg.setAttribute('draggable', 'true');

itemImg.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', rawItemId);
    e.dataTransfer.effectAllowed = 'move';
    itemImg.classList.add('using');
    console.log(`🚚 Drag depuis slot (createStuffDom) pour ${rawItemId}`);
});

        itemImg.addEventListener('dragend', () => {
            itemImg.classList.remove('using');
        });

        wrapper.appendChild(itemImg);
        slot.appendChild(wrapper);
        slot.classList.add('equiped'); // ✅ Ajoute la classe si équipé

        console.log(`🎯 ${slotKey} DOM rempli avec ${itemData.displayName}`);
    } else {
        console.warn(`❌ ${slotKey} → AUCUN item trouvé avec l'ID ${rawItemId}`);
        slot.classList.remove('equiped'); // 🔁 Par sécurité si incohérence
    }

} else {
    console.log(`🕳️ ${slotKey} → slot vide`);
    slot.classList.remove('equiped');

    // Helper uniquement sur les slots générés vides
    if (!slot.classList.contains("equiped")) {
        slot.dataset.stat = "stuffSlot";
        slot.dataset.hover = "true";
        slot.dataset.entityId = entite.id;
    }
}

    entityEquipement.appendChild(slot);
}

    if (codexEntityView) {
      codexEntityView.appendChild(entityEquipement);
      console.log(`→ DOM .entity-equipement injecté pour ${entite.name}`);
    }

    console.groupEnd();

    requestAnimationFrame(() => {
		DropEquipementtoInventory();
        DclicSlottoInventory();
        equippedHoverDescription();
    });

    return entityEquipement;
}

function getItemDataById(equippedId) {
    const item = getEquippedItemById(equippedId);

    if (!item) {
        console.warn(`🛑 getItemDataById → Aucun item équipé trouvé pour equippedId: ${equippedId}`);
    }

    return item;
}

export { createStuffDom, getCodexStableEquipmentCharge, createEquipmentSubmenu };

// Register shared handlers once, after the complete module graph is initialized.
let equipmentInitialized = false;
export function initializeEquipment() {
  if (equipmentInitialized) return;
  equipmentInitialized = true;
  if (typeof window !== "undefined") {
    window.refreshCodexEquipmentInventory = refreshCodexEquipmentInventory;
  }
}

// Entity profiles, combat records, lore and stat graphs.

const CODEX_PROFILE_TOP_UMBRA_LIMIT = 5;

const CODEX_PROFILE_ATTACK_STAT_KEYS = ["physicalDamage", "magicalDamage", "piercingDamage", "hybridalDamage"];

const CODEX_PROFILE_RESISTANCE_STAT_KEYS = ["physicalResistance", "magicalResistance"];

const CODEX_PROFILE_SIGNATURE_COLUMN_COUNT = 3;

const CODEX_PROFILE_SIGNATURE_MIN_CATEGORY_SHARE = 0.05;

const CODEX_PROFILE_SIGNATURE_CONTINUATION_FACTOR = 0.25;

const CODEX_PROFILE_SIGNATURE_LABELS = {
  attaque: "Attaque",
  defense: "Défense",
  utilitaire: "Soutien",
};

function getCodexProfileConfirmedEntity(entite) {
  if (!entite) return entite;

  return {
    ...entite,
    modifierStats: entite.modifierStats
      ? { ...entite.modifierStats, preview: undefined }
      : undefined,
  };
}

function readCodexProfileValue(entite, path, fallback = 0) {
  return getSafe(getCodexProfileConfirmedEntity(entite), path, fallback);
}

function getCodexProfileStatName(statKey, fallback = statKey) {
  return statsByKey[statKey]?.name || fallback;
}

function getCodexProfileResolvedAttacks(entite) {
  const resolved = [];
  const addAttack = (attack) => {
    if (!attack) return;
    const def = resolveAttackDefinitionForEntity(entite, attack, attackDetails);
    if (def) resolved.push(def);
  };

  if (Array.isArray(entite?.attackDetails)) {
    entite.attackDetails.forEach(addAttack);
  } else if (entite?.attackDetails && typeof entite.attackDetails === "object") {
    Object.values(entite.attackDetails).forEach(addAttack);
  }

  if (Array.isArray(entite?.attacks)) entite.attacks.forEach(addAttack);

  const seen = new Set();
  return resolved.filter((attack) => {
    const id =
      attack?.functionName ||
      attack?.attackId ||
      attack?.displayName ||
      JSON.stringify(attack?.attacknature || []);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function getCodexProfileAttackNatureSet(entite) {
  const natures = new Set();

  getCodexProfileResolvedAttacks(entite).forEach((attack) => {
    const attackNatures = Array.isArray(attack?.attacknature)
      ? attack.attacknature
      : [attack?.attacknature].filter(Boolean);

    attackNatures.forEach((nature) => {
      if (nature) natures.add(nature);
    });

    if (attackNatures.includes("hybridalDamage")) {
      natures.add("physicalDamage");
      natures.add("magicalDamage");
    }

    if (attackNatures.includes("transpiercingDamage")) {
      natures.add("piercingDamage");
    }
  });

  return natures;
}

function isCodexProfileAttackStatUsed(statKey, attackNatures) {
  if (statKey === "physicalDamage") {
    return attackNatures.has("physicalDamage") || attackNatures.has("hybridalDamage");
  }
  if (statKey === "magicalDamage") {
    return attackNatures.has("magicalDamage") || attackNatures.has("hybridalDamage");
  }
  if (statKey === "piercingDamage") {
    return attackNatures.has("piercingDamage") || attackNatures.has("transpiercingDamage");
  }
  if (statKey === "hybridalDamage") {
    return attackNatures.has("hybridalDamage");
  }
  return false;
}

function readCodexProfileAttackStatValue(entite, statKey, attackNatures) {
  const directValue = readCodexProfileValue(entite, statKey, 0);

  if (statKey === "hybridalDamage" && isCodexProfileAttackStatUsed(statKey, attackNatures)) {
    const directNumber = toCodexProfileNumber(directValue);
    if (directNumber > 0) return directValue;

    return (
      toCodexProfileNumber(readCodexProfileValue(entite, "physicalDamage", 0)) +
      toCodexProfileNumber(readCodexProfileValue(entite, "magicalDamage", 0))
    );
  }

  return directValue;
}

function getCodexProfileAttackRangeSet(entite) {
  const ranges = new Set();

  getCodexProfileResolvedAttacks(entite).forEach((attack) => {
    const attackRanges = Array.isArray(attack?.attackRange)
      ? attack.attackRange
      : [attack?.attackRange].filter(Boolean);

    attackRanges.forEach((range) => {
      if (range) ranges.add(range);
    });
  });

  return ranges;
}

function getCodexProfileEssentialStatKeys(entite) {
  const keys = new Set(CODEX_PROFILE_RESISTANCE_STAT_KEYS);
  getCodexProfileAttackStatEntries(entite).forEach(entry => keys.add(entry.key));
  return keys;
}

function getCodexProfileUmbraRelevance(def, meta, entite, attackNatures, attackRanges) {
  const key = def?.key;
  const hasAttack = attackNatures.size > 0;
  const hasMelee = attackRanges.has("melee");
  const hasPhysicalLike =
    attackNatures.has("physicalDamage") ||
    attackNatures.has("hybridalDamage") ||
    attackNatures.has("piercingDamage") ||
    attackNatures.has("transpiercingDamage");
  const hasMagicalLike =
    attackNatures.has("magicalDamage") ||
    attackNatures.has("hybridalDamage");

  if (key === "brutality") return hasPhysicalLike ? 1.35 : 0.45;
  if (key === "inflexion") return hasMagicalLike ? 1.35 : 0.45;
  if (key === "vigueur") return hasPhysicalLike ? 1.25 : 0.55;
  if (key === "esprit") return hasMagicalLike ? 1.25 : 0.55;
  if (key === "finesse") return hasPhysicalLike ? 1.2 : 0.55;
  if (key === "vivacite") return 1.15;
  if (key === "constitution" || key === "integrite" || key === "adresse") return 1.12;
  if (key === "hypercognition") return hasAttack ? 1.25 : 0.75;
  if (key === "bloodFury") return hasPhysicalLike ? (hasMelee ? 1.35 : 0.85) : 0.35;
  if (key === "criticalPower" || key === "ambidextry") return hasPhysicalLike ? 1.2 : 0.35;
  if (key === "haste" || key === "mysticism") return hasAttack ? 1.2 : 0.8;
  if (key === "movement" || key === "weaponMastery") return 1.15;
  if (key === "robustness" || key === "vitality" || key === "indestructibility") return 1.12;
  if (key === "astrality" || key === "transcendence") return 1.08;
  if (meta?.category === "attaque" && !hasAttack) return 0.8;

  return 1;
}

function compareCodexProfileSignatureEntries(a, b) {
  if (a.level !== b.level) return b.level - a.level;
  if (a.score !== b.score) return b.score - a.score;
  if (a.value !== b.value) return b.value - a.value;

  return String(a.label).localeCompare(String(b.label), "fr");
}

function getCodexProfileSignatureEntries(entite, excludedKeys = getCodexProfileEssentialStatKeys(entite)) {
  const attackNatures = getCodexProfileAttackNatureSet(entite);
  const attackRanges = getCodexProfileAttackRangeSet(entite);

  return stats
    .map((def) => {
      if (def?.nature !== "umbra") return null;
      if (excludedKeys.has(def.key)) return null;

      const meta = umbraDetection(def.key);
      if (!meta) return null;

      const rawValue = readCodexProfileValue(entite, def.key, 0);
      const value = toCodexProfileNumber(rawValue);
      if (value <= 0) return null;

      const level = Number(meta.level) || 0;
      const normalizedValue = Math.log1p(value);
      const levelWeight = 1 + Math.max(0, level - 1) * 0.18;
      const relevance = getCodexProfileUmbraRelevance(def, meta, entite, attackNatures, attackRanges);
      const score = normalizedValue * levelWeight * relevance;

      return {
        def,
        key: def.key,
        label: def.name || def.key,
        category: meta.category,
        level,
        value,
        score,
      };
    })
    .filter(Boolean)
    .sort(compareCodexProfileSignatureEntries);
}

function toCodexProfileNumber(value) {
  if (value && typeof value === "object") {
    const current = Number(value.current ?? 0) || 0;
    const max = Number(value.max ?? current) || 0;
    return Math.max(current, max);
  }

  if (typeof value === "string") {
    const parsed = Number(value.replace(",", ".").replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return Number(value ?? 0) || 0;
}

function getCodexProfileSignatureModel(entite) {
  const entries = getCodexProfileSignatureEntries(entite);
  const byCategory = new Map();

  entries.forEach((entry) => {
    if (!byCategory.has(entry.category)) byCategory.set(entry.category, []);
    byCategory.get(entry.category).push(entry);
  });

  const totalScore = entries.reduce((sum, entry) => sum + entry.score, 0);
  const categories = [...byCategory.entries()]
    .map(([category, categoryEntries]) => {
      const score = categoryEntries.reduce((sum, entry) => sum + entry.score, 0);
      return {
        category,
        entries: categoryEntries.sort(compareCodexProfileSignatureEntries),
        score,
        share: totalScore > 0 ? score / totalScore : 0,
      };
    })
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return String(CODEX_PROFILE_SIGNATURE_LABELS[a.category] || a.category)
        .localeCompare(String(CODEX_PROFILE_SIGNATURE_LABELS[b.category] || b.category), "fr");
    });

  const pages = [];
  categories.forEach((summary, categoryIndex) => {
    if (categoryIndex > 0 && summary.share < CODEX_PROFILE_SIGNATURE_MIN_CATEGORY_SHARE) return;

    const pageCount = Math.min(
      2,
      Math.ceil(summary.entries.length / CODEX_PROFILE_TOP_UMBRA_LIMIT)
    );

    for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
      const start = pageIndex * CODEX_PROFILE_TOP_UMBRA_LIMIT;
      const pageEntries = summary.entries.slice(start, start + CODEX_PROFILE_TOP_UMBRA_LIMIT);
      if (!pageEntries.length) continue;

      pages.push({
        category: summary.category,
        pageIndex,
        entries: pageEntries,
        share: summary.share,
        pageScore: summary.share * (pageIndex === 0 ? 1 : CODEX_PROFILE_SIGNATURE_CONTINUATION_FACTOR),
      });
    }
  });

  const selectedPages = pages
    .sort((a, b) => {
      if (a.pageScore !== b.pageScore) return b.pageScore - a.pageScore;
      if (a.share !== b.share) return b.share - a.share;
      return a.pageIndex - b.pageIndex;
    })
    .slice(0, CODEX_PROFILE_SIGNATURE_COLUMN_COUNT)
    .sort((a, b) => {
      const aCategoryIndex = categories.findIndex(summary => summary.category === a.category);
      const bCategoryIndex = categories.findIndex(summary => summary.category === b.category);
      if (aCategoryIndex !== bCategoryIndex) return aCategoryIndex - bCategoryIndex;
      return a.pageIndex - b.pageIndex;
    });

  return {
    entries,
    categories,
    pages: selectedPages,
    dominantCategory: categories[0]?.category || null,
  };
}

function getCodexProfileSignatureTitle(page, model) {
  const base = CODEX_PROFILE_SIGNATURE_LABELS[page.category] || page.category;

  if (page.pageIndex > 0) return `${base} suite`;
  if (page.category === model.dominantCategory && page.share >= 0.55) return `${base} dominante`;

  return base;
}

function createCodexProfilePanel(title, className = "") {
  const panel = document.createElement("div");
  panel.className = `codex-profile-panel ${className}`.trim();

  const header = document.createElement("div");
  header.className = "codex-profile-panel-title";
  header.textContent = title;
  panel.appendChild(header);

  return panel;
}

function createCodexProfileBattleRow(entite, statKey, label, value, {
  showZero = false,
  rowClass = "",
  displayValue = null
} = {}) {
  const visualStatKey = getDisplayStatKey(statKey);
  const score = toCodexProfileNumber(value);
  if (!showZero && score <= 0) return null;
  const statName = label || getCodexProfileStatName(statKey);

  const row = document.createElement("div");
  row.className = `codex-profile-battle-stat ${visualStatKey}-profile-stat ${rowClass}`.trim();
  row.dataset.stat = statKey;
  row.dataset.hover = "true";
  if (entite?.id != null) row.dataset.entityId = entite.id;

  // The helper is calculated from the current entity when hovered.

  const picto = document.createElement("div");
  picto.className = `picto-stat ${visualStatKey}`;

  const name = document.createElement("div");
  name.className = "stat-name";
  name.textContent = statName;

  const statValue = document.createElement("div");
  statValue.className = "entite-stat";
  statValue.dataset.stat = statKey;
  statValue.dataset.hover = "true";
  if (entite?.id != null) statValue.dataset.entityId = entite.id;
  statValue.textContent = String(displayValue ?? value);

  row.append(picto, name, statValue);
  return row;
}

function formatCodexLifePool(pool, fallback = null) {
  if (pool && typeof pool === "object") {
    const current = Number(pool.current ?? 0) || 0;
    const max = Number(pool.max ?? current) || 0;
    return max > 0 || current > 0 ? `${current} / ${max}` : fallback;
  }

  const value = Number(pool ?? 0) || 0;
  return value > 0 ? String(value) : fallback;
}

function appendCodexProfileBattleConsumables(panel, entite) {
  const displayEntity = getCodexProfileConfirmedEntity(entite);
  const hpCurrent = Math.max(0, Number(readCodexProfileValue(entite, "HP.current", 0)) || 0);
  const hpMax = Math.max(0, Number(readCodexProfileValue(entite, "HP.max", 0)) || 0);
  const hpRow = createCodexProfileBattleRow(entite, "HP", getCodexProfileStatName("HP"), `${hpCurrent} / ${hpMax}`, { showZero: true });
  if (hpRow) panel.appendChild(hpRow);

  const armorCurrent = Math.max(0, Number(readCodexProfileValue(entite, "armor.current", 0)) || 0);
  const armorRow = createCodexProfileBattleRow(entite, "armor", getCodexProfileStatName("armor"), armorCurrent);
  if (armorRow) panel.appendChild(armorRow);

  const speed = Number(readCodexProfileValue(entite, "speed", 0)) || 0;
  const speedRow = createCodexProfileBattleRow(entite, "speed", getCodexProfileStatName("speed"), `${(speed / 1000).toFixed(2)}s`, { showZero: true });
  if (speedRow) panel.appendChild(speedRow);

  ensureMovementState(displayEntity);
  const shift = displayEntity?.stats?.shift;
  const shiftRow = createCodexProfileBattleRow(
    entite,
    "shift",
    getCodexProfileStatName("shift"),
    `${Number(shift?.current ?? 0) || 0} / ${Number(shift?.max ?? 0) || 0}`,
    { showZero: true }
  );
  if (shiftRow) {
    const valueNode = shiftRow.querySelector(".entite-stat");
    const movementDisplay = createMovementDisplay(displayEntity);
    if (valueNode) valueNode.replaceWith(movementDisplay);
    panel.appendChild(shiftRow);
  }

  [
    ["extraLife", getCodexProfileStatName("extraLife")],
    ["fadedLife", getCodexProfileStatName("fadedLife")],
    ["eternalLife", getCodexProfileStatName("eternalLife")],
  ].forEach(([key, label]) => {
    const value = formatCodexLifePool(readCodexProfileValue(entite, key, null));
    const row = value ? createCodexProfileBattleRow(entite, key, label, value) : null;
    if (row) panel.appendChild(row);
  });

  const hpBattleRegen = Math.max(0, Number(readCodexProfileValue(entite, "hpBattleRegen", 0)) || 0);
  const hpBattleRegenRow = createCodexProfileBattleRow(entite, "hpBattleRegen", getCodexProfileStatName("hpBattleRegen"), hpBattleRegen);
  if (hpBattleRegenRow) panel.appendChild(hpBattleRegenRow);
}

function createCodexProfileBattlePanel(entite, { detailed = false } = {}) {
  const panel = createCodexProfilePanel("Combat", "codex-profile-panel--battle");
  appendCodexProfileBattleConsumables(panel, entite);
  panel.appendChild(createCodexProfileGroupTitle("Bilan cumulé"));
  const summary = [
    ["kills", "Éliminations"],
    ["totalDamage", "Dégâts infligés"],
    ["totalHeal", "Soins prodigués"],
  ];
  const details = getEntityCombatDetails(entite);
  for (const [key, label] of [...summary,
    ['damageReceived', 'Dégâts encaissés'],
    ['healingReceived', 'Soins reçus'],
    ["deaths", "Morts"],
    ["battlesFought", "Combats menés"],
    ...(detailed ? [
    ["resurrections", "Résurrections"],
    ["overkills", "Overkills"],
    ["extraLivesUsed", "Vies supplémentaires consommées"],
    ] : []),
  ]) {
    panel.appendChild(createCodexProfileBattleRow(entite, key, label,
      Math.max(0, Number(details[key] ?? entite?.[key]) || 0), { showZero: true }));
  }
  return panel;
}

const CODEX_COMBAT_SHOW_ALL_STATS = true;

const CODEX_COMBAT_NATURES = [
  ['physicalDamage', 'Physique', ['physical']],
  ['magicalDamage', 'Magique', ['magical']],
  ['transpiercingDamage', 'Perçante', ['piercing']],
  ['hybridalDamage', 'Hybride', ['physical', 'magical']],
  ['physicalPiercingDamage', 'Cinétique', ['physical', 'piercing']],
  ['magicalPiercingDamage', 'Spectrale', ['magical', 'piercing']],
  ['hybridalPiercingDamage', 'Prismatique', ['physical', 'magical', 'piercing']],
  ['inerte', 'Inerte', []],
];

function createCombatRecordRow(label, value, className = '') {
  const row = document.createElement('div');
  row.className = `codex-combat-row ${className}`.trim();
  const name = document.createElement('span');
  name.textContent = label;
  const amount = document.createElement('span');
  amount.textContent = String(value);
  row.append(name, amount);
  return row;
}

function createCombatRecordGroup(title, className = '') {
  const group = document.createElement('section');
  group.className = `codex-combat-group ${className}`.trim();
  const heading = document.createElement('h3');
  heading.textContent = title;
  group.appendChild(heading);
  return group;
}

function createCombatRecordSubgroup(title, headingTag = 'h4') {
  const group = document.createElement('section');
  group.className = 'codex-combat-subgroup';
  const heading = document.createElement(headingTag);
  heading.textContent = title;
  group.appendChild(heading);
  return group;
}

function getCombatRecordAttackNature(attack) {
  const resolved = getAttackNatureRules(attack).stat;
  if (resolved !== 'neutral') return resolved;
  const declared = new Set(normArr(attack?.attacknature));
  for (const [key, , parts] of CODEX_COMBAT_NATURES) {
    if (parts.length > 1 && declared.has(key)) return key;
  }
  const physical = declared.has('physicalDamage');
  const magical = declared.has('magicalDamage');
  const piercing = declared.has('transpiercingDamage') || declared.has('piercingDamage');
  if (physical && magical && piercing) return 'hybridalPiercingDamage';
  if (physical && magical) return 'hybridalDamage';
  if (physical && piercing) return 'physicalPiercingDamage';
  if (magical && piercing) return 'magicalPiercingDamage';
  return physical ? 'physicalDamage' : magical ? 'magicalDamage'
    : piercing ? 'transpiercingDamage' : 'neutral';
}

function createCodexCombatRecord(entite) {
  const details = getEntityCombatDetails(entite);
  const section = document.createElement('section');
  section.className = 'codex-combat-record';
  const header = document.createElement('header');
  header.className = 'codex-combat-header';
  const title = document.createElement('h2');
  title.textContent = 'Statistiques de combat';
  header.appendChild(title);
  section.appendChild(header);

  const ownedAttacks = getCodexProfileResolvedAttacks(entite);
  const offensiveAttacks = ownedAttacks.filter(item => item.combatFunction !== 'Support');
  const ownedNatures = new Set(offensiveAttacks.map(getCombatRecordAttackNature));
  const hasStat = (...keys) => keys.some(key => Number(getSafe(entite, key, 0)) > 0);
  const hasHistory = Number(entite?.battlesFought) > 0;
  const addMetric = (group, label, value, visible = false, className = '') => {
    if (CODEX_COMBAT_SHOW_ALL_STATS || Number(value) > 0 || visible) {
      group.appendChild(createCombatRecordRow(label, value ?? 0, className));
    }
  };

  const overview = document.createElement('div');
  overview.className = 'codex-combat-columns codex-combat-overview';
  const attackSummary = createCombatRecordGroup('Attaque', 'codex-combat-theme codex-combat-theme--attack');
  addMetric(attackSummary, 'Dégâts infligés', entite?.totalDamage || 0, offensiveAttacks.length > 0);
  addMetric(attackSummary, 'Aux HP', details.hpDamageDealt, false, 'codex-combat-row--sub');
  addMetric(attackSummary, "À l'armure", details.armorDamageDealt, false, 'codex-combat-row--sub');
  addMetric(attackSummary, 'Soins prodigués', entite?.totalHeal || 0,
    ownedAttacks.some(item => item.combatFunction === 'Support'));
  const ranges = [
    ['melee', 'Corps à corps'], ['ranged', 'À distance'], ['other', 'Autres sources'],
  ];
  for (const [key, label] of ranges.filter(([key]) => CODEX_COMBAT_SHOW_ALL_STATS || key !== 'other')) {
    const rangeGroup = createCombatRecordSubgroup(label);
    rangeGroup.classList.add('codex-combat-group--range');
    rangeGroup.dataset.range = key;
    const owned = ownedAttacks.filter(item => {
      const flags = getAttackResolutionFlags(item);
      return key === 'melee' ? flags.isMelee : key === 'ranged' ? flags.isRange : false;
    });
    addMetric(rangeGroup, 'Dégâts', details.damageByRange[key],
      owned.some(item => item.combatFunction !== 'Support'));
    addMetric(rangeGroup, 'Soins', details.healingByRange[key],
      owned.some(item => item.combatFunction === 'Support'));
    if (rangeGroup.childElementCount > 1) attackSummary.appendChild(rangeGroup);
  }
  if (attackSummary.childElementCount > 1) overview.appendChild(attackSummary);

  const distribution = createCombatRecordGroup('Répartition des dégâts', 'codex-combat-group--distribution');
  const damageBreakdown = document.createElement('div');
  damageBreakdown.className = 'codex-combat-breakdown';
  const byNature = createCombatRecordSubgroup('Par nature');
  const natureColumns = document.createElement('div');
  natureColumns.className = 'codex-combat-columns';
  for (const [part, label] of [['physical', 'Physique'], ['magical', 'Magique'], ['piercing', 'Perçant']]) {
    const sources = CODEX_COMBAT_NATURES.filter(([, , parts]) => parts.includes(part));
    const total = sources.reduce((sum, [key]) => sum + (Number(details.damageByNature[key]?.[part]) || 0), 0);
    if (!CODEX_COMBAT_SHOW_ALL_STATS && !total && !sources.some(([key]) => ownedNatures.has(key))) continue;
    const pureNature = sources.find(([, , parts]) => parts.length === 1)[0];
    const block = document.createElement('div');
    block.className = `codex-combat-breakdown-block codex-combat-component--${part} codex-combat-nature--${pureNature}`;
    block.appendChild(createCombatRecordRow(label, total, 'codex-combat-row--total'));
    for (const [key, sourceLabel] of sources) {
      const value = Number(details.damageByNature[key]?.[part]) || 0;
      if (!CODEX_COMBAT_SHOW_ALL_STATS && !value && !ownedNatures.has(key)) continue;
      const sourceName = key === `${part}Damage` || (part === 'piercing' && key === 'transpiercingDamage')
        ? (part === 'piercing' ? 'Seul' : 'Seule')
        : `Via ${sourceLabel}`;
      block.appendChild(createCombatRecordRow(sourceName, value, 'codex-combat-row--sub'));
    }
    natureColumns.appendChild(block);
  }
  for (const [key, label, parts] of CODEX_COMBAT_NATURES.filter(([, , parts]) => parts.length !== 1)) {
    const entry = details.damageByNature[key];
    const total = Number(entry?.total) || 0;
    if (!CODEX_COMBAT_SHOW_ALL_STATS && !total && !ownedNatures.has(key)) continue;
    const block = document.createElement('div');
    block.className = `codex-combat-breakdown-block codex-combat-nature--${key}`;
    block.appendChild(createCombatRecordRow(label, total, 'codex-combat-row--total'));
    if (key === 'inerte') {
      const reduction = details.inertPhysicalReduction + details.inertMagicalReduction;
      const percent = details.inertResistanceInput > 0 ? reduction * 100 / details.inertResistanceInput : 0;
      for (const [name, value] of [
        ['Soumis aux résistances', details.inertResistanceInput],
        ['Réduction physique', details.inertPhysicalReduction],
        ['Réduction magique', details.inertMagicalReduction],
        ['Réduction totale', `${reduction} (${formatCodexProfilePercentValue(percent)})`],
      ]) block.appendChild(createCombatRecordRow(name, value, 'codex-combat-row--sub'));
      block.title = HELPER_TEXT.inertReduction;
    }
    for (const part of parts) {
      block.appendChild(createCombatRecordRow(`Part ${part === 'physical' ? 'physique' : part === 'magical' ? 'magique' : 'perçante'}`,
        Number(entry?.[part]) || 0, 'codex-combat-row--sub'));
    }
    natureColumns.appendChild(block);
  }
  const unclassified = Number(details.damageByNature.unclassified?.total) || 0;
  addMetric(natureColumns, 'Non ventilés', unclassified);
  if (natureColumns.childElementCount) {
    byNature.appendChild(natureColumns);
    damageBreakdown.appendChild(byNature);
  }
  if (damageBreakdown.childElementCount) {
    distribution.appendChild(damageBreakdown);
    section.appendChild(distribution);
  }

  const offense = createCombatRecordGroup('Effets offensifs', 'codex-combat-group--offense');
  const offenseResults = createCombatRecordSubgroup('Dégâts (points)');
  const offenseProcs = createCombatRecordGroup('Déclenchements offensifs', 'codex-combat-counts--offense');
  addMetric(offenseResults, 'Dégâts des coups critiques', details.criticalDamage);
  addMetric(offenseResults, 'Dont PV supplémentaires dus au critique', details.criticalBonusDamage, false, 'codex-combat-row--sub');
  addMetric(offenseResults, "Dégâts des coups d'exécution", details.executionDamage);
  addMetric(offenseResults, "Dégâts d'ambidextrie", details.ambidextryDamage);
  addMetric(offenseResults, 'Dégâts des attaques utilisant des essences hypercognitives', details.hypercognitionDamage);
  if (details.criticalDamage > 0 || details.executionDamage > 0 || details.ambidextryDamage > 0) {
    const convention = document.createElement('p');
    convention.className = 'codex-combat-convention';
    convention.textContent = 'Ces sous-totaux sont déjà compris dans les dégâts infligés et peuvent se recouper.';
    offenseResults.appendChild(convention);
  }

  const defense = createCombatRecordGroup('Défense', 'codex-combat-theme codex-combat-theme--defense');
  addMetric(defense, 'Dégâts encaissés', details.damageReceived, hasHistory);
  addMetric(defense, 'HP perdus', details.hpDamageReceived, false, 'codex-combat-row--sub');
  addMetric(defense, 'Armure absorbée', details.armorDamageReceived, false, 'codex-combat-row--sub');
  addMetric(defense, 'Soins reçus', details.healingReceived, hasHistory);
  const protections = createCombatRecordSubgroup('HP préservés');
  for (const [key, label] of [
    ['indestructible', 'Dégâts annulés'], ['indestructibility', 'Dégâts réduits'],
    ['astrality', 'Astralité'], ['esoterism', 'Ésotérisme'], ['dodge', 'Esquive'],
    ['resilience', 'Dégâts des altérations réduits'], ['resilienceCrit', 'Dégâts critiques réduits'],
  ]) {
    if (key === 'indestructible') protections.appendChild(createCombatRecordRow('Indestructibilité', ''));
    if (key === 'resilience') protections.appendChild(createCombatRecordRow('Résilience', ''));
    addMetric(protections, label, details.defenseHp[key] || 0, false,
      ['indestructible', 'indestructibility', 'resilience', 'resilienceCrit'].includes(key) ? 'codex-combat-row--sub' : '');
    const row = protections.lastElementChild;
    if (row?.classList.contains('codex-combat-row')) row.title = buildDefenseHpHelper(key);
  }
  if (protections.childElementCount > 1) defense.appendChild(protections);
  const defenseCounts = createCombatRecordGroup('Déclenchements défensifs', 'codex-combat-counts--defense');
  const survival = createCombatRecordSubgroup('Survie');
  addMetric(survival, 'Vies supplémentaires consommées', entite?.extraLivesUsed || 0);
  addMetric(survival, 'Supplémentaires', details.livesUsed.extraLife || 0, false, 'codex-combat-row--sub');
  addMetric(survival, 'Fanées', details.livesUsed.fadedLife || 0, false, 'codex-combat-row--sub');
  addMetric(survival, 'Éternelles', details.livesUsed.eternalLife || 0, false, 'codex-combat-row--sub');
  const defenseProcs = createCombatRecordSubgroup('Protections (nombre)');

  const utility = createCombatRecordGroup('Utilitaire', 'codex-combat-theme codex-combat-theme--utility');
  addMetric(utility, 'HP régénérés en combat', details.battleHpRegenerated);
  addMetric(utility, 'HP récupérés au début des journées', details.dailyHpRecovered);
  addMetric(utility, 'PV restaurés par vol de vie', details.lifeStealHealed);
  addMetric(utility, "Soins d'ambidextrie", details.ambidextryHealing);
  const utilityCounts = createCombatRecordGroup('Déclenchements utilitaires', 'codex-combat-counts--utility');
  const mobility = createCombatRecordSubgroup('Mouvement');
  mobility.classList.add('codex-combat-movement');
  addMetric(mobility, 'Déplacements', details.movements, hasHistory);
  addMetric(mobility, 'Dont marathon', details.marathonMovements, hasStat('marathon'), 'codex-combat-row--sub');
  addMetric(mobility, 'Dont forcés', details.forcedMovements, false, 'codex-combat-row--sub');
  addMetric(mobility, 'Projectiles physiques évités', details.physicalProjectilesAvoided);
  const utilityProcs = createCombatRecordSubgroup('Compétences');
  const escapes = createCombatRecordSubgroup('Fuite');
  addMetric(escapes, 'Tentatives', details.fleeAttempts);
  addMetric(escapes, 'Réussies', details.fleeSuccesses);
  addMetric(escapes, 'Échouées', details.fleeFailures);
  const penalties = createCombatRecordGroup('Malus', 'codex-combat-group--penalties');
  const shadowPenalties = createCombatRecordSubgroup('Occultisme');
  addMetric(shadowPenalties, 'HP perdus par Fragilité des ombres', details.defenseHp.occultismFragility || 0);
  const movementPenalties = createCombatRecordSubgroup('Mouvement');
  addMetric(movementPenalties, 'Déplacements refusés : réserve épuisée', details.blockedMovements);
  addMetric(movementPenalties, 'Déplacements ayant entamé la réserve négative', details.negativeMovements);

  const procGroups = {
    critical: [offenseProcs, 'Impacts critiques avec dégâts', ['criticalPower', 'criticalChance']],
    execution: [offenseProcs, "Impacts avec exécution", ['bloodFuryExecutionChance']],
    lifesteal: [offenseProcs, 'Restaurations par vol de vie', ['bloodFury', 'bloodThirsty']],
    ambidextry: [offenseProcs, 'Seconds coups lancés', ['ambidextry']],
    mysticism: [offenseProcs, 'Transes mystiques', ['mysticism']],
    bloodCrazy: [offenseProcs, 'Exécutions par Démence sanguinaire', ['bloodFury']],
    bloodGlutony: [offenseProcs, 'Voracités déclenchées', ['bloodThirsty']],
    equilibre: [offenseProcs, 'Attaques équilibrées', ['equilibre']],
    brokenSpell: [offenseProcs, 'Sorts brisés', []],
    indestructible: [defenseProcs, 'Indestructibilités', ['indestructibility']],
    astrality: [defenseProcs, 'Astralités', ['astrality']],
    esoterism: [defenseProcs, 'Ésotérismes', ['esoterism']],
    dodge: [defenseProcs, 'Esquives', ['dodge']],
    resilience: [defenseProcs, 'Résiliences', ['resilience']],
    resilienceCrit: [defenseProcs, 'Critiques atténués', ['resilience']],
    resilienceCancel: [defenseProcs, 'Altérations annulées', ['resilience']],
    hindranceResistance: [defenseProcs, 'Entraves résistées', ['resilience', 'hindranceResistance']],
    occultismFragility: [shadowPenalties, 'Fragilités des ombres subies', ['occultism']],
    occultismSlow: [shadowPenalties, 'Préparations ralenties', ['occultism']],
    swap: [mobility, 'Échanges de place', []],
    trailer: [mobility, 'Trailer', ['trailer']],
    occultism: [defenseProcs, 'Occultismes', ['occultism']],
  };
  for (const [key, [fallbackGroup, label, statKeys]] of Object.entries(procGroups)) {
    const category = [key, ...statKeys].map(statKey => stats.find(stat => stat.key === statKey)?.type?.split('-')[0])
      .find(type => ['attaque', 'defense', 'utilitaire'].includes(type));
    const group = [mobility, shadowPenalties].includes(fallbackGroup) ? fallbackGroup
      : { attaque: offenseProcs, defense: defenseProcs, utilitaire: utilityProcs }[category] || fallbackGroup;
    addMetric(group, label, details.procs[key] ?? 0, group !== offenseProcs && hasStat(...statKeys));
  }
  for (const [key, value] of Object.entries(details.procs)) {
    if (key === 'marathon' || Object.hasOwn(procGroups, key)) continue; // Marathon already has its movement counter.
    const definition = stats.find(stat => stat.key === key);
    const category = definition?.type?.split('-')[0];
    const group = { attaque: offenseProcs, defense: defenseProcs, utilitaire: utilityProcs }[category] || utilityProcs;
    addMetric(group, definition?.name || key, value);
  }
  addMetric(mobility, 'Charges de déplacement gagnées en bonus', details.trailerCharges, false, 'codex-combat-row--sub');
  utility.append(mobility, escapes);
  const offenseColumns = document.createElement('div');
  offenseColumns.className = 'codex-combat-offense-columns';
  if (offenseResults.childElementCount > 1) offenseColumns.appendChild(offenseResults);
  if (offenseColumns.childElementCount) {
    offense.appendChild(offenseColumns);
    section.appendChild(offense);
  }
  const counts = document.createElement('div');
  counts.className = 'codex-combat-columns codex-combat-counts';
  if (offenseProcs.childElementCount > 1) counts.appendChild(offenseProcs);
  for (const [group, subgroups] of [[defenseCounts, [survival, defenseProcs]], [utilityCounts, [utilityProcs]]]) {
    for (const subgroup of subgroups) {
      if (subgroup.childElementCount > 1) group.appendChild(subgroup);
    }
    if (group.childElementCount > 1) counts.appendChild(group);
  }
  if (defense.childElementCount > 1) overview.appendChild(defense);
  if (utility.childElementCount > 1) overview.appendChild(utility);
  if (overview.childElementCount) header.after(overview, createCodexInvocationsRecord(entite));
  if (counts.childElementCount) section.appendChild(counts);
  const penaltyColumns = document.createElement('div');
  penaltyColumns.className = 'codex-combat-columns';
  penaltyColumns.append(shadowPenalties, movementPenalties);
  penalties.appendChild(penaltyColumns);
  section.appendChild(penalties);
  if (entite?.type === 'sbire') {
    const roleNames = { gueux: 'Gueux', tank: 'Tank', fantassin: 'Fantassin', mage: 'Mage' };
    const roles = createCombatRecordGroup('Rôles en combat', 'codex-combat-group--roles');
    const longest = Math.max(...COMBAT_ROLES.map(role => details.roles[role].durationMs));
    const mostPlayed = document.createElement('p');
    mostPlayed.className = 'codex-combat-convention';
    mostPlayed.textContent = `Rôle le plus joué : ${longest > 0
      ? COMBAT_ROLES.filter(role => details.roles[role].durationMs === longest).map(role => roleNames[role]).join(' / ')
      : 'Aucun'}`;
    mostPlayed.title = HELPER_TEXT.roleDuration;
    roles.appendChild(mostPlayed);
    const table = document.createElement('table');
    table.className = 'codex-combat-role-table';
    const head = table.createTHead().insertRow();
    for (const label of ['Rôle', 'Combats', 'Dégâts infligés', 'Dégâts encaissés']) {
      const cell = document.createElement('th'); cell.scope = 'col'; cell.textContent = label; head.appendChild(cell);
    }
    const body = table.createTBody();
    for (const role of COMBAT_ROLES) {
      const row = body.insertRow();
      row.dataset.role = role;
      row.title = buildRoleDurationHelper(Math.floor(details.roles[role].durationMs / 1000));
      const label = document.createElement('th'); label.scope = 'row'; label.textContent = roleNames[role]; row.appendChild(label);
      for (const key of ['battles', 'damageDealt', 'damageReceived']) row.insertCell().textContent = details.roles[role][key];
    }
    roles.appendChild(table);
    section.appendChild(roles);
  }
  const career = document.createElement('div');
  career.className = 'codex-combat-columns codex-combat-career';
  const feats = createCombatRecordGroup('Faits de guerre', 'codex-combat-group--feats');
  for (const [key, label] of [['kills', 'Éliminations'], ['overkills', 'Overkills'], ['deaths', 'Morts'],
    ['resurrections', 'Résurrections'], ['battlesFought', 'Combats menés']]) addMetric(feats, label, entite?.[key] || 0);
  const acquisition = createCombatRecordSubgroup('Obtention');
  const acquiredDay = Number(entite?.acquisition?.gameDay);
  const today = Math.max(1, Number(loadFromLocalStorage('gameDay', 1)) || 1);
  const sourceNames = { loot: 'Butin', quest: 'Quête', shop: 'Boutique', starter: 'Armée initiale',
    initial: 'Armée initiale', event: 'Événement', summon: 'Invocation', admin: 'Administration' };
  addMetric(acquisition, 'Jours possédés', acquiredDay > 0 ? Math.max(0, today - acquiredDay) : 'Non renseigné');
  addMetric(acquisition, "Jour d'obtention", acquiredDay > 0 ? `Jour ${acquiredDay}` : 'Non renseigné');
  addMetric(acquisition, "Source d'obtention", sourceNames[entite?.acquisition?.source] || 'Non renseignée');
  feats.appendChild(acquisition);
  const progression = createCombatRecordGroup('Progression', 'codex-combat-group--progression');
  addMetric(progression, 'XP possédée', Math.max(0, Number(entite?.experience) || 0));
  addMetric(progression, 'XP dépensée au total', details.lifetime.experienceSpent);
  addMetric(progression, 'Niveau maximal atteint', details.lifetime.maxLevelReached);
  addMetric(progression, 'Archétypes terminés', details.lifetime.archetypesCompleted);
  const objects = createCombatRecordGroup('Objets', 'codex-combat-group--items');
  const equipment = getEquipmentSlotKeys(entite).flatMap(key => entite.stuff?.[key] || []).filter(Boolean);
  addMetric(objects, 'Objets équipés', new Set(equipment).size);
  addMetric(objects, 'Consommables utilisés sur cette entité', details.consumablesUsed);
  for (const [key, label] of [['consumablesGround', 'Via le terrain'], ['consumablesPouch', 'Via la sacoche'],
    ['consumablesInventory', "Via l'inventaire"], ['consumablesHostile', 'Hostiles'], ['consumablesSupport', 'De soutien']]) {
    addMetric(objects, label, details[key], false, 'codex-combat-row--sub');
    const combatKey = { consumablesGround: 'consumablesCombatGround', consumablesPouch: 'consumablesCombatPouch' }[key];
    if (combatKey) addMetric(objects, 'Dont en combat', details[combatKey], false, 'codex-combat-row--sub');
  }
  addMetric(objects, 'Dégâts reçus des consommables', details.consumableDamageReceived);
  addMetric(objects, 'Soins reçus des consommables', details.consumableHealingReceived);
  const days = createCombatRecordGroup('Journées', 'codex-combat-group--days');
  days.title = HELPER_TEXT.dayState;
  addMetric(days, 'Journées passées vivante', details.lifetime.daysAlive);
  addMetric(days, "Maximum d'affilée", details.lifetime.longestAliveStreak, false, 'codex-combat-row--sub');
  addMetric(days, 'Journées passées décédée', details.lifetime.daysDead);
  addMetric(days, "Maximum d'affilée", details.lifetime.longestDeadStreak, false, 'codex-combat-row--sub');
  career.append(feats, progression, objects, days);
  section.appendChild(career);
  return section;
}

function createCodexInvocationsRecord(entite) {
  const { summons } = getEntityCombatDetails(entite);
  const section = createCombatRecordGroup('Invocations', 'codex-summons-record');
  const sum = (entries, metric) => entries.reduce((total, entry) => total + entry[metric], 0);
  const format = value => Number(value.toFixed(1)).toLocaleString('fr-FR');
  const best = (entries, metric, unit) => {
    const max = Math.max(0, ...entries.map(metric));
    return max > 0 ? `${entries.filter(entry => Math.abs(metric(entry) - max) < 1e-9)
      .map(entry => entry.name).join(' / ')} (${format(max)} ${unit})` : 'Aucune';
  };
  for (const [kind, label] of [['entities', 'Entités invoquées'], ['consumables', 'Consommables invoqués']]) {
    const entries = Object.values(summons[kind]);
    const kindSection = createCombatRecordSubgroup(label);
    kindSection.classList.add('codex-summons-kind');
    const columns = document.createElement('div');
    columns.className = 'codex-combat-columns codex-summons-groups';
    const summary = createCombatRecordSubgroup('Bilan', 'h5');
    summary.classList.add('codex-summons-summary');
    summary.dataset.summonKind = kind;
    summary.append(createCombatRecordRow('Total invoqué', sum(entries, 'count')));
    if (kind === 'entities') {
      summary.append(createCombatRecordRow('La plus invoquée', best(entries, entry => entry.count, 'invocations')));
      const resistant = createCombatRecordRow('La plus résistante', best(entries, entry => entry.count ? entry.damageReceived / entry.count : 0, 'encaissés / invocation'));
      resistant.title = HELPER_TEXT.summonResistance;
      summary.append(resistant);
      if (entries.length > 1) summary.append(createCombatRecordRow('La plus meurtrière', best(entries, entry => entry.kills, 'éliminations')));
    } else {
      summary.append(createCombatRecordRow('Consommés', sum(entries, 'consumed')),
        createCombatRecordRow('Expirés sans consommation', sum(entries, 'expired')),
        createCombatRecordRow('Retirés sans consommation', sum(entries, 'lost')));
    }
    columns.appendChild(summary);
    const groups = [['Attaquant', kind === 'entities' ? 'Attaquant' : 'Hostiles'], ['Support', 'Support']];
    if (entries.some(entry => entry.combatFunction === 'Arbitre')) groups.push(['Arbitre', 'Arbitre']);
    for (const [combatFunction, groupLabel] of groups) {
      const selected = entries.filter(entry => entry.combatFunction === combatFunction);
      const group = createCombatRecordSubgroup(groupLabel, 'h5');
      group.dataset.summonKind = kind;
      group.dataset.combatFunction = combatFunction;
      const metrics = [['count', 'Invoqués'], ['damageDealt', 'Dégâts infligés'], ['healingDone', 'Soins prodigués'], ['kills', 'Éliminations']];
      for (const [key, metricLabel] of metrics) group.append(createCombatRecordRow(metricLabel, sum(selected, key)));
      for (const entry of selected) {
        const detail = createCombatRecordSubgroup(entry.name, 'h6');
        detail.dataset.summonName = entry.name;
        for (const [key, metricLabel] of metrics) {
          detail.append(createCombatRecordRow(metricLabel, entry[key]));
          if (key !== 'damageDealt') continue;
          for (const [natureKey, natureLabel] of CODEX_COMBAT_NATURES) {
            detail.append(createCombatRecordRow(natureLabel, entry.damageByNature[natureKey] || 0, 'codex-combat-row--sub'));
          }
          if (entry.damageByNature.unclassified > 0) detail.append(createCombatRecordRow('Non ventilés', entry.damageByNature.unclassified, 'codex-combat-row--sub'));
        }
        const extra = kind === 'entities'
          ? [['damageReceived', 'Dégâts encaissés'], ['healingReceived', 'Soins reçus'], ['deaths', 'Morts']]
          : [['consumed', 'Consommés'], ['expired', 'Expirés'], ['lost', 'Retirés sans consommation']];
        for (const [key, metricLabel] of extra) detail.append(createCombatRecordRow(metricLabel, entry[key]));
        group.append(detail);
      }
      columns.append(group);
    }
    kindSection.appendChild(columns);
    section.appendChild(kindSection);
  }
  return section;
}

function createCodexInformationBattlePage(entite) {
  const page = document.createElement('div');
  page.className = 'codex-information-battle';
  page.dataset.entityId = entite.id;
  page.dataset.mode = 'combat';
  const { ambianceDiv } = createEntityLore(entite);
  ambianceDiv.setAttribute('aria-hidden', 'true');
  page.appendChild(ambianceDiv);
  page.appendChild(createCodexCombatRecord(entite));
  return page;
}

function formatCodexProfilePercentValue(value) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "0%";
  return `${Number.isInteger(n) ? n : Number(n.toFixed(1))}%`;
}

function createCodexProfileGroupTitle(label) {
  const title = document.createElement("div");
  title.className = "codex-profile-stat-group-title";
  title.textContent = label;
  return title;
}

function createCodexProfilePrimaryStatRow(entite, statKey, {
  showZero = false,
  value = null,
  displayMode = "raw"
} = {}) {
  const rawValue = value ?? readCodexProfileValue(entite, statKey, 0);
  const displayEntity = getCodexProfileConfirmedEntity(entite);
  const computed = displayMode === 'raw' ? null
    : calculateStatsDisplay(statKey, displayEntity, rawValue, { includeHelper: false });
  let displayValue = rawValue;

  if (displayMode === "computed") {
    displayValue = computed?.displayValue ?? formatCodexProfileStatValue(rawValue);
  }

  if (displayMode === "percent") {
    displayValue = formatCodexProfilePercentValue(computed?.displayValue ?? rawValue);
  }

  return createCodexProfileBattleRow(
    entite,
    statKey,
    getCodexProfileStatName(statKey),
    rawValue,
    {
      showZero,
      rowClass: "codex-profile-primary-stat",
      displayValue
    }
  );
}

function getCodexProfileAttackStatEntries(entite) {
  const attackNatures = getCodexProfileAttackNatureSet(entite);

  return CODEX_PROFILE_ATTACK_STAT_KEYS
    .map((key) => {
      const used = isCodexProfileAttackStatUsed(key, attackNatures);
      const value = readCodexProfileAttackStatValue(entite, key, attackNatures);
      const directValue = readCodexProfileValue(entite, key, 0);
      const important = toCodexProfileNumber(directValue) > 0;

      if (!used && !important) return null;

      return {
        key,
        value,
        showZero: used,
        displayMode: key === "magicalDamage" ? "computed" : "raw",
      };
    })
    .filter(Boolean);
}

function createCodexProfileEssentialPanel(entite) {
  const panel = createCodexProfilePanel("Essentiel", "codex-profile-panel--essential");
  const attackEntries = getCodexProfileAttackStatEntries(entite);

  if (attackEntries.length) {
    panel.appendChild(createCodexProfileGroupTitle("Dégâts"));
    attackEntries.forEach(({ key, value, showZero, displayMode }) => {
      const row = createCodexProfilePrimaryStatRow(entite, key, { value, showZero, displayMode });
      if (row) panel.appendChild(row);
    });
  }

  panel.appendChild(createCodexProfileGroupTitle("Résistances"));
  CODEX_PROFILE_RESISTANCE_STAT_KEYS.forEach((key) => {
    const row = createCodexProfilePrimaryStatRow(entite, key, {
      showZero: true,
      displayMode: "percent",
    });
    if (row) panel.appendChild(row);
  });

  return panel;
}

function formatCodexProfileStatValue(value) {
  if (value && typeof value === "object") {
    const current = Number(value.current ?? 0) || 0;
    const max = Number(value.max ?? current) || 0;
    return max > 0 || current > 0 ? `${current} / ${max}` : "0";
  }

  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) return String(value ?? "");
  return Number.isInteger(number) ? String(number) : String(Number(number.toFixed(2)));
}

function createCodexProfileUmbraRow(entite, entry) {
  const { def, key, level } = entry;
  const displayEntity = getCodexProfileConfirmedEntity(entite);
  const rawValue = readCodexProfileValue(entite, key, 0);
  const computed = calculateStatsDisplay(key, displayEntity, rawValue, { includeHelper: false });
  const displayValue = computed?.displayValue ?? formatCodexProfileStatValue(rawValue);

  const row = document.createElement("div");
  row.className = `codex-profile-umbra-stat stat-container ${key}-stat lvl-${level}`;
  row.dataset.stat = key;
  row.dataset.hover = "true";
  row.dataset.statName = def.name || key;
  if (entite?.id != null) row.dataset.entityId = entite.id;
  if (computed?.helpContent) row.dataset.helperText = computed.helpContent;
  tagUmbraStatContainer(row, key);

  const picto = document.createElement("div");
  picto.className = `picto-stat ${key}`;

  const value = document.createElement("div");
  value.className = "entite-stat";
  value.dataset.stat = key;
  value.dataset.hover = "true";
  if (entite?.id != null) value.dataset.entityId = entite.id;
  value.textContent = String(displayValue);

  row.append(picto, value);
  return row;
}

function createCodexProfileSignaturePanel(entite, page, model) {
  const title = getCodexProfileSignatureTitle(page, model);
  const panel = createCodexProfilePanel(
    title,
    `codex-profile-signature-panel codex-profile-panel--${page.category}`
  );

  panel.dataset.category = page.category;
  panel.dataset.share = String(Math.round(page.share * 100));
  panel.dataset.page = String(page.pageIndex + 1);

  page.entries.forEach((entry) => {
    panel.appendChild(createCodexProfileUmbraRow(entite, entry));
  });

  return panel;
}

function createCodexProfileSignatureGrid(entite) {
  const model = getCodexProfileSignatureModel(entite);
  const grid = document.createElement("div");
  grid.className = "codex-profile-umbra-grid codex-profile-signature-grid";

  model.pages.forEach((page) => {
    grid.appendChild(createCodexProfileSignaturePanel(entite, page, model));
  });

  return grid;
}

function stripCodexProfileIconTitles(root) {
  root?.querySelectorAll?.(".picto-stat[title], .picto[title]").forEach((picto) => {
    picto.removeAttribute("title");
  });
}

function createCodexProfileSummary(entite) {
  const wrapper = document.createElement("div");
  wrapper.className = "codex-detailStats codex-profile-summary";

  const title = createEntityStatsTitleNode("Statistiques principales");
  title.classList.add("codex-profile-summary-title");
  wrapper.appendChild(title);

  const mainGrid = document.createElement("div");
  mainGrid.className = "codex-profile-main-grid";

  const signatureGrid = createCodexProfileSignatureGrid(entite);

  mainGrid.append(createCodexProfileBattlePanel(entite), createCodexProfileEssentialPanel(entite), signatureGrid);
  wrapper.append(mainGrid);
  wrapper.appendChild(createEntityRateSummary(entite));
  stripCodexProfileIconTitles(wrapper);

  return wrapper;
}

function codexProfileSummaryBelongsToEntity(summary, entityId) {
  if (!summary || !entityId) return false;

  return Array.from(summary.querySelectorAll("[data-entity-id]"))
    .some(node => String(node.dataset.entityId) === String(entityId));
}

function clearCodexProfileSummaryHelpers(entityId) {
  if (!entityId) return;

  document.querySelectorAll(".stat-hover").forEach((helper) => {
    if (helper.dataset.umbraPinned === 'true' || helper.hasAttribute('data-umbra-detail')) return;
    if (
      String(helper.dataset.entityId || "") === String(entityId) ||
      String(helper.dataset.entityUid || "") === String(entityId)
    ) {
      helper.remove();
    }
  });
}

function refreshCodexProfileSummary(entite) {
  if (!entite?.id) return false;
  if (typeof document === "undefined") return false;

  const summaries = getOpenViewRoots('codexSummary')
    .filter(summary => codexProfileSummaryBelongsToEntity(summary, entite.id));

  if (!summaries.length) return false;

  clearCodexProfileSummaryHelpers(entite.id);

  summaries.forEach((summary) => {
    summary.replaceWith(createCodexProfileSummary(entite));
  });

  return true;
}

function createCodexEntityView(entite, options = {}) {
    const { showEquipment = true } = options;
    const codexEntityView = document.createElement('div');
    codexEntityView.className = 'codex-entity-view';
	codexEntityView.setAttribute('data-id', entite.id);
    // Image / sprite
  if (entite.sprite) {
    const detailsImageDiv = document.createElement('div');
    detailsImageDiv.className = 'codex-scan-image-container';
	detailsImageDiv.id = `codex-image_${entite.id}`;

    const entiteDetailsImage = document.createElement('img');
    entiteDetailsImage.className = `codex-scan-image iddle ${entite.class}`;
    entiteDetailsImage.dataset.dropable = 'true';
    entiteDetailsImage.dataset.entityId = entite.id;
    entiteDetailsImage.src = cachedResourceUrl(entite.sprite);

    // Aura Container
    let AuraContainer = document.createElement('div');
    AuraContainer.id = `auraContainer_codex_${entite.id}`;
    AuraContainer.className = `aura-container codex side-${entite.side} ${entite.class}`;

    // AJOUTS
// AJOUTS
detailsImageDiv.appendChild(AuraContainer);
detailsImageDiv.appendChild(entiteDetailsImage);
codexEntityView.appendChild(detailsImageDiv);

}
    // Nom
    if (entite.name) {
        const entityNameH2 = document.createElement('h2');
        entityNameH2.className = 'codex-scan-name';
        entityNameH2.textContent = `${entite.name}`;
        entityNameH2.appendChild(createEntityPowerValue(entite));
        codexEntityView.appendChild(entityNameH2);
    }

    // Surnom (form)
    createNicknameForm(entite, codexEntityView);

  // 🧩 HP + Armor bar (heads-up codex)
const CodexhealthBarEntite = document.createElement('div');
CodexhealthBarEntite.className = 'codex-entite-HP';

const HUhealthBarContainer = document.createElement('div');
HUhealthBarContainer.className = `headsup-HP-container ${entite.side} ${entite.type}`;
HUhealthBarContainer.id = `headsup-HP-container_${entite.id}`;

// 🧱 Utilisation de la fonction unifiée
const lifeBarsCodex = createLifeBars(entite);
if (lifeBarsCodex) {
  lifeBarsCodex.id = `CodexLifeBars_${entite.id}`;
  lifeBarsCodex.classList.add('codex');
  HUhealthBarContainer.appendChild(lifeBarsCodex);
}

// 🧮 Création du conteneur global pour HP + Armure
const battleStats = document.createElement("div");
battleStats.className = "battle-stats";
battleStats.dataset.entityId = entite.id;

const lifeCounter = createLifeCounter(entite);
if (lifeCounter) {
  battleStats.appendChild(lifeCounter);
}

const armorCounter = createArmorCounter(entite);
if (armorCounter) {
  battleStats.appendChild(armorCounter);
}

const movementCounter = createMovementCounter(entite);
if (movementCounter) {
  battleStats.appendChild(movementCounter);
}

battleStats.querySelectorAll("[data-stat]").forEach(el => {
  el.dataset.hover = "true";
});

if (battleStats.children.length > 0) {
  HUhealthBarContainer.appendChild(battleStats);
}
// Injection dans le conteneur principal
CodexhealthBarEntite.appendChild(HUhealthBarContainer);

    codexEntityView.appendChild(CodexhealthBarEntite);

    // Stuff
    if (showEquipment) {
      createStuffDom(entite, codexEntityView);
    }

    return codexEntityView;
}

function ensureDirectEntityView(codexColumn1, entite) {
  let direct = codexColumn1.querySelector(':scope > .codex-entity-view');
  if (!direct) {
    direct = createCodexEntityView(entite);
    codexColumn1.appendChild(direct);
  }
}

function removeDirectEntityView(codexColumn1) {
  const direct = codexColumn1.querySelector(':scope > .codex-entity-view');
  if (direct) direct.remove();
}

function createProfilSubmenu(entite) {
  const wrapper = document.createElement('div'); wrapper.classList.add('sub-menu-stat', 'profile-stat');
  const header = document.createElement('div'); header.className = 'sub-menu-stat__header'; header.appendChild(createEntityStatsTitleNode("Profil"));
  const body = document.createElement('div'); body.className = 'sub-menu-stat__body';
  const node = createCodexEntityView(entite, { showEquipment: false }); if (node) body.appendChild(node);
  wrapper.appendChild(header); wrapper.appendChild(body);
  return wrapper;
}

function initStatRadar(canvas, graphValues, legendRoot) {
  if (!canvas) return;

  // ✅ si ré-init, on nettoie
  canvas._disposeRadar?.();

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // ✅ Canvas FIXE 300x300 (CSS + DPR)
  const CSS_SIZE = 300;
  const dpr = window.devicePixelRatio || 1;

   canvas.width = Math.round(CSS_SIZE * dpr);
  canvas.height = Math.round(CSS_SIZE * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // --- axes ---
  // ordre : Force (haut), Intelligence (bas-droite), Agilité (bas-gauche)
  const axisLabels = ["Force", "Intelligence", "Agilité"];
  const axisColors = ["#AC0000", "#0098FF", "#FFAE00"]; // couleurs du TEXTE uniquement

  const axisIcons = [
    { src: "./media/assets/ui/picto-strength.svg" },
    { src: "./media/assets/ui/picto-intel.svg" },
    { src: "./media/assets/ui/picto-agility.svg" },
  ];

  const axisAngles = [
    -Math.PI / 2,
    -Math.PI / 2 + (2 * Math.PI / 3),
    -Math.PI / 2 + (4 * Math.PI / 3),
  ];

  // ✅ traits axes neutres (plus de traits colorés)
  const AXIS_LINE_COLOR = "rgba(55,65,81,0.55)";

  // Offsets des labels (tes valeurs)
  const offsetByAxis = [
    { x: 0, y: 4 },     // Force
    { x: -16, y: 10 },  // Intelligence
    { x: 16, y: 10 },   // Agilité
  ];

  // --- datasets ---
  const datasetsConfig = [
    { key: "att", name: "Attaque",    stroke: "rgba(214,55,0,0.95)",  fill: "rgba(214,55,0,0.20)" },
    { key: "def", name: "Défense",    stroke: "rgba(0,0,184,0.95)",   fill: "rgba(0,0,184,0.20)" },
    { key: "uti", name: "Utilitaire", stroke: "rgba(163,0,211,0.95)", fill: "rgba(163,0,211,0.20)" },
  ];

  const categoryByKey = { att: "attaque", def: "defense", uti: "utilitaire" };
  const hiddenKeys = new Set();

  const safeNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  // ✅ IMPORTANT : ordre values aligné avec axes = [Force, Intelligence, Agilité]
  function buildDatasets() {
    return datasetsConfig.map((cfg) => {
      const cat = categoryByKey[cfg.key];

      const vFor = safeNum(graphValues?.force?.[cat]);
      const vInt = safeNum(graphValues?.intelligence?.[cat]);
      const vAgi = safeNum(graphValues?.agilite?.[cat]);

      return { ...cfg, values: [vFor, vInt, vAgi] };
    });
  }

  // --- pictos chargés ---
  let iconsReady = false;
  let iconsToLoad = axisIcons.length;

  axisIcons.forEach((icon) => {
    const img = new Image();
    img.src = cachedResourceUrl(icon.src);
    icon.img = img;

    const done = () => {
      iconsToLoad--;
      if (iconsToLoad <= 0) {
        iconsReady = true;
        drawRadar();
      }
    };

    img.onload = done;
    img.onerror = done;
  });

  function drawGrid(cx, cy, radius) {
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(55,65,81,0.35)";
    const steps = 5;

    for (let s = 1; s <= steps; s++) {
      const r = (radius * s) / steps;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const ang = axisAngles[i];
        const x = cx + Math.cos(ang) * r;
        const y = cy + Math.sin(ang) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawAxes(cx, cy, radius) {
    ctx.save();
    ctx.lineWidth = 1.4;

    const labelRadius = radius * 1.25;
    const iconSize = 20;
    const padding = 6;

    ctx.font = '12px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";

    for (let i = 0; i < 3; i++) {
      const ang = axisAngles[i];
      const label = axisLabels[i];
      const off = offsetByAxis[i] || { x: 0, y: 0 };

      // 1) Axe (NEUTRE)
      const x = cx + Math.cos(ang) * radius;
      const y = cy + Math.sin(ang) * radius;

      ctx.beginPath();
      ctx.strokeStyle = AXIS_LINE_COLOR;
      ctx.moveTo(cx, cy);
      ctx.lineTo(x, y);
      ctx.stroke();

      // 2) Label + picto
      let lx = cx + Math.cos(ang) * labelRadius + off.x;
      let ly = cy + Math.sin(ang) * labelRadius + off.y;

      let textX = lx;
      const textY = ly;

      if (iconsReady) {
        const textWidth = ctx.measureText(label).width;
        const totalWidth = iconSize + padding + textWidth;

        const startX = lx - totalWidth / 2;

        const ix = startX;
        const iy = ly - iconSize / 2;
        ctx.drawImage(axisIcons[i].img, ix, iy, iconSize, iconSize);

        textX = startX + iconSize + padding;
      } else {
        const textWidth = ctx.measureText(label).width;
        textX = lx - textWidth / 2;
      }

      ctx.fillStyle = axisColors[i];
      ctx.fillText(label, textX, textY);
    }

    ctx.restore();
  }

  function drawDataset(cx, cy, radius, dataset, globalMax) {
    const valuesNorm = dataset.values.map((v) => {
      const safe = Math.max(0, safeNum(v));
      return globalMax > 0 ? safe / globalMax : 0;
    });

    ctx.save();
    ctx.beginPath();

    for (let i = 0; i < 3; i++) {
      const r = radius * valuesNorm[i];
      const ang = axisAngles[i];
      const x = cx + Math.cos(ang) * r;
      const y = cy + Math.sin(ang) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    ctx.closePath();
    ctx.fillStyle = dataset.fill;
    ctx.strokeStyle = dataset.stroke;
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();

    for (let i = 0; i < 3; i++) {
      const r = radius * valuesNorm[i];
      const ang = axisAngles[i];
      const x = cx + Math.cos(ang) * r;
      const y = cy + Math.sin(ang) * r;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = dataset.stroke;
      ctx.fill();
    }

    ctx.restore();
  }

  // ✅ centrage vertical réel : on calcule la bbox (grille + labels) et on centre dans 300px
  function computeCyForCenteredBBox({ h, radius, labelRadius, iconSize, fontSize, pad }) {
    const blockHalf = Math.max(iconSize / 2, fontSize / 2);

    // extents constants (sans cy) :
    // - radar triangle/grille : y min = -radius (Force en haut), y max = +0.5*radius (axes bas à sin=0.5)
    let topConst = -radius;
    let bottomConst = 0.5 * radius;

    for (let i = 0; i < 3; i++) {
      const ang = axisAngles[i];
      const offY = (offsetByAxis[i]?.y ?? 0);
      const base = Math.sin(ang) * labelRadius + offY;
      topConst = Math.min(topConst, base - blockHalf);
      bottomConst = Math.max(bottomConst, base + blockHalf);
    }

    // bboxMid = cy + (topConst+bottomConst)/2
    const bboxMidConst = (topConst + bottomConst) / 2;
    let cy = (h / 2) - bboxMidConst;

    // clamp anti-coupe (pad)
    const minCy = pad - topConst;
    const maxCy = (h - pad) - bottomConst;
    cy = Math.max(minCy, Math.min(maxCy, cy));

    return cy;
  }

  function drawRadar() {
    const w = CSS_SIZE;
    const h = CSS_SIZE;

    ctx.clearRect(0, 0, w, h);

    const radius = Math.min(w, h) * 0.30;
    const labelRadius = radius * 1.25;

    const cx = w / 2;

    // ✅ centrage auto (au lieu de pousser en haut/bas)
    const cy = computeCyForCenteredBBox({
      h,
      radius,
      labelRadius,
      iconSize: 20,
      fontSize: 12,
      pad: 10
    });

    const datasets = buildDatasets();

    let globalMax = 0;
    let anyVisible = false;

    datasets.forEach((ds) => {
      if (hiddenKeys.has(ds.key)) return;
      anyVisible = true;
      ds.values.forEach((v) => { if (v > globalMax) globalMax = v; });
    });

    if (!anyVisible || globalMax <= 0) globalMax = 1;

    drawGrid(cx, cy, radius);

    datasets.forEach((ds) => {
      if (!hiddenKeys.has(ds.key)) drawDataset(cx, cy, radius, ds, globalMax);
    });

    drawAxes(cx, cy, radius);
  }

  // --- listeners légende (cleanup) ---
  const ac = new AbortController();
  const { signal } = ac;

  if (legendRoot) {
    legendRoot.querySelectorAll(".graph-legend-item").forEach((btn) => {
      const key = btn.dataset.key;
      btn.addEventListener("click", () => {
        if (!key) return;
        if (hiddenKeys.has(key)) {
          hiddenKeys.delete(key);
          btn.classList.add("active");
        } else {
          hiddenKeys.add(key);
          btn.classList.remove("active");
        }
        drawRadar();
      }, { signal });
    });
  }

  // rendu initial
  drawRadar();

  // dispose
  canvas._disposeRadar = () => ac.abort();
}

function createEntityLore(entite) {
  const DEFAULT_LORE = "Données manquantes sur l'entité...";
  const DEFAULT_IMAGE = "./media/lore/entites/lore-unknown.jpg";

  const entityClass = entite?.class;

  const loreData = entityClass
    ? entitesLore.find(loreItem => loreItem.class === entityClass)
    : null;

  const loreText = loreData?.lore || DEFAULT_LORE;
  const loreImage = loreData?.ambiance || DEFAULT_IMAGE;

  const textDiv = document.createElement("div");
  textDiv.className = "entity-lore-text codex";
  textDiv.innerHTML = loreText;

  const ambianceDiv = document.createElement("div");
  ambianceDiv.className = "entity-lore-ambiance codex";

  const img = document.createElement("img");
  img.className = "entity-lore-image";
  img.src = cachedResourceUrl(loreImage);
  img.alt = `Ambiance lore - ${entityClass || "entité inconnue"}`;

  img.onerror = () => {
    img.src = cachedResourceUrl(DEFAULT_IMAGE);
  };

  ambianceDiv.appendChild(img);

  return {
    textDiv,
    ambianceDiv
  };
}

export {
  createCodexCombatRecord,
  createCodexInvocationsRecord,
  refreshCodexProfileSummary,
  createCodexInformationBattlePage,
  createCodexProfileSummary,
  createCodexEntityView,
  ensureDirectEntityView,
  removeDirectEntityView,
  createProfilSubmenu,
  initStatRadar,
  createEntityLore,
};

// Register shared handlers once, after the complete module graph is initialized.
let initialized = false;
export function initializeCodexProfile() {
  if (initialized) return;
  initialized = true;
  if (typeof window !== "undefined") {
    window.refreshCodexProfileSummary = refreshCodexProfileSummary;
    window.addEventListener("entityCombatStatsChanged", ({ detail }) => {
      if (detail?.entity) refreshCodexProfileSummary(detail.entity);
      if (detail?.entity?.id != null) {
        getOpenViewRoots('codexBattle').forEach(page => {
          if (String(page.dataset.entityId) === String(detail.entity.id)) {
            const updated = createCodexInformationBattlePage(detail.entity);
            page.replaceChildren(...updated.childNodes);
          }
        });
      }
    });
  }
}
