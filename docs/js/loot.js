import { hexCoordonne } from "./board.js";
// modularized-loot/loot/chest-source.js
import { disperseLootGlitter, glitterLoot } from "./meteo.js";
import { createBattleElementInDOM, isHexOccupied, removeBattleElementFromDOM } from "./createBattleElements.js";
import { createAllItems } from "./itemManager.js";
import { getEntityLoot as getEntityLoot2 } from "./GameStorage.js";
import { damageImpact } from "./entitesAnimation.js";
import { getChestStorage, saveToLocalStorage, CHESTS_STORAGE_KEY, getVisibleHexes } from "./GameStorage.js";

// modularized-loot/loot/trace.js
var LOOT_TRACE_PREFIX = "[LOOT TRACE]";
function createLootTraceId(sourceId, action = "action") {
  const randomPart = globalThis.crypto?.randomUUID?.().slice(0, 8) ?? Math.random().toString(36).slice(2, 10);
  return `${String(sourceId || "unknown")}::${action}::${Date.now()}::${randomPart}`;
}
function summarizeLootSource(source) {
  const summary = {};
  for (const category of ["entities", "stuff", "consommables"]) {
    const list = Array.isArray(source?.loot?.[category]) ? source.loot[category] : [];
    summary[category] = list.map((entry) => ({
      lootInstanceId: entry?.lootInstanceId ?? null,
      itemId: entry?.itemId ?? null,
      entityLootId: entry?.entityLootId ?? null,
      collected: entry?.collected === true,
      name: entry?.displayName ?? entry?.itemName ?? entry?.name ?? null
    }));
  }
  return summary;
}
function lootTrace(level, message, payload = {}) {
  const method = typeof console[level] === "function" ? level : "log";
  console[method](`${LOOT_TRACE_PREFIX} ${message}`, payload);
}

// modularized-loot/loot/storage.js
var CORPSE_LOOT_STORAGE_KEY = "PersistentCorpseLootSources";
var CRACKED_CHEST_SPRITE_URL = "./media/assets/misc/chest-cracked.png";
var CRACKED_CHEST_OPENED_SPRITE_URL = "./media/assets/misc/chest-cracked-opened.png";
var categories = ["entities", "stuff", "consommables"];
function emptyLoot() {
  return { entities: [], stuff: [], consommables: [] };
}
function compactCorpseReward(entry, category) {
  if (!entry) return null;
  const common = {
    lootInstanceId: entry.lootInstanceId ?? null,
    lootType: entry.lootType ?? (category === "entities" ? "entity" : category === "stuff" ? "stuff" : "consumable"),
    collected: entry.collected === true
  };
  if (entry.collectedAt) common.collectedAt = entry.collectedAt;
  if (category === "entities") {
    return {
      ...common,
      entityLootId: entry.entityLootId ?? null,
      sourceEntityId: entry.sourceEntityId ?? entry.embeddedEntity?.id ?? null,
      sourceSerial: entry.sourceSerial ?? entry.embeddedEntity?.serial ?? null
    };
  }
  return {
    ...common,
    itemId: entry.itemId ?? entry.sourceId ?? entry.id ?? null,
    sourceId: entry.sourceId ?? entry.itemId ?? entry.id ?? null
  };
}
function compactCorpseSource(source) {
  if (!source) return null;
  const metadata = source.metadata || {};
  const compact = {
    id: source.id,
    sourceType: "corpse",
    level: String(source.level ?? source.stageId ?? ""),
    stageId: String(source.stageId ?? source.level ?? ""),
    statut: source.statut === "destroyed" ? "looted" : source.statut,
    createdAt: source.createdAt ?? null,
    updatedAt: source.updatedAt ?? null,
    openedAt: source.openedAt ?? null,
    lootedAt: source.lootedAt ?? null,
    lootGeneratedAt: source.lootGeneratedAt ?? null,
    metadata: {
      sourceEntityId: metadata.sourceEntityId ?? source.sourceEntityId ?? null,
      sourceEntityTemplateId: metadata.sourceEntityTemplateId ?? null,
      sourceEntitySerial: metadata.sourceEntitySerial ?? null,
      sourceEntityName: metadata.sourceEntityName ?? source.sourceEntityName ?? null,
      battlePosition: metadata.battlePosition ?? source.battlePosition ?? null,
      examinedAt: metadata.examinedAt ?? null,
      searchedAt: metadata.searchedAt ?? null
    },
    loot: emptyLoot()
  };
  for (const category of categories) {
    compact.loot[category] = (source.loot?.[category] || [])
      .map((entry) => compactCorpseReward(entry, category))
      .filter(Boolean);
  }
  return compact;
}
function readCorpseStorage() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CORPSE_LOOT_STORAGE_KEY) || "{}");
    return {
      version: 2,
      corpses: Array.isArray(parsed?.corpses) ? parsed.corpses.map(compactCorpseSource).filter(Boolean) : []
    };
  } catch (error) {
    lootTrace("error", "Stockage des cadavres illisible", { error });
    return { version: 2, corpses: [] };
  }
}
function writeCorpseStorage(storage) {
  const compactStorage = {
    version: 2,
    corpses: (storage?.corpses || []).map(compactCorpseSource).filter(Boolean)
  };
  try {
    localStorage.setItem(CORPSE_LOOT_STORAGE_KEY, JSON.stringify(compactStorage));
    return true;
  } catch (error) {
    const quotaExceeded = error?.name === "QuotaExceededError" || error?.code === 22 || error?.code === 1014;
    lootTrace("error", quotaExceeded ? "Quota dépassé pendant la sauvegarde compacte des cadavres" : "Échec de sauvegarde des cadavres", {
      error,
      corpseCount: compactStorage.corpses.length
    });
    return false;
  }
}
function migrateCorpseStorageToCompactFormat() {
  const rawStorage = localStorage.getItem(CORPSE_LOOT_STORAGE_KEY);
  if (!rawStorage) return true;
  try {
    const parsed = JSON.parse(rawStorage);
    const alreadyCompact = parsed?.version === 2
      && !rawStorage.includes('"entitySnapshot"')
      && !rawStorage.includes('"embeddedEntity"');
    if (alreadyCompact) return true;
    return writeCorpseStorage({
      version: 2,
      corpses: Array.isArray(parsed?.corpses) ? parsed.corpses : []
    });
  } catch (error) {
    lootTrace("error", "Migration du stockage des cadavres impossible", { error });
    return false;
  }
}
function getActiveStageId() {
  return String(window.currentStageId ?? localStorage.getItem("currentStageId") ?? "");
}
function normalizeLootBattleSide(side) {
  const normalized = String(side || "").trim().toLowerCase();
  if (normalized === "a" || normalized === "sidea" || normalized === "side-a") return "A";
  if (normalized === "b" || normalized === "sideb" || normalized === "side-b") return "B";
  return "neutral";
}
function normalizeLootSource(source, fallbackType = "chest") {
  if (!source) return null;
  source.sourceType ||= fallbackType;
  source.level = String(source.level ?? source.stageId ?? "");
  source.stageId = String(source.stageId ?? source.level ?? "");
  source.loot ||= emptyLoot();
  for (const category of categories) {
    if (!Array.isArray(source.loot[category])) source.loot[category] = [];
  }
  if (source.sourceType === "corpse" && source.statut === "destroyed") {
    source.statut = "looted";
  }
  if (source.sourceType !== "corpse") {
    source.openingCount = Math.max(0, Number.parseInt(source.openingCount, 10) || 0);
    source.criticalAttempts = Math.max(0, Number.parseInt(source.criticalAttempts, 10) || 0);
    const storedDurabilityState = String(source.durabilityState || "").toLowerCase();
    source.durabilityState = source.statut === "destroyed" || storedDurabilityState === "destroyed"
      ? "destroyed"
      : storedDurabilityState === "critical"
        ? "critical"
        : "normal";
    const legacyImmediateDestruction = Number(source.durabilityVersion || 1) < 3
      && source.durabilityState === "destroyed"
      && source.criticalAttempts === 1
      && source.criticalAt
      && source.destroyedAt
      && String(source.criticalAt) === String(source.destroyedAt)
      && categories.some((category) => (source.loot?.[category] || []).some(
        (reward) => reward?.collected !== true
      ));
    if (legacyImmediateDestruction) {
      source.durabilityState = "critical";
      source.statut = source.openedAt ? "opened" : "created";
      source.criticalAttempts = 0;
      source.repairedImmediateDestructionAt = (/* @__PURE__ */ new Date()).toISOString();
      delete source.destroyedAt;
      delete source.lastDestructionChance;
      delete source.lastDestructionRoll;
      for (const category of categories) {
        for (const reward of source.loot?.[category] || []) {
          delete reward.lost;
          delete reward.lostAt;
        }
      }
    }
    const legacyFirstOpeningCritical = Number(source.durabilityVersion || 1) < 3
      && source.durabilityState === "critical"
      && source.openingCount === 1
      && source.criticalAttempts === 0
      && categories.some((category) => (source.loot?.[category] || []).some(
        (reward) => reward?.collected !== true
      ));
    if (legacyFirstOpeningCritical) {
      source.durabilityState = "normal";
      source.repairedFirstOpeningCriticalAt = (/* @__PURE__ */ new Date()).toISOString();
      delete source.criticalAt;
      delete source.lastCriticalChance;
      delete source.lastCriticalRoll;
    }
    source.durabilityVersion = 3;
    if (source.durabilityState === "destroyed") source.statut = "destroyed";
  }
  return source;
}
function isCorpseSource(source) {
  return source?.sourceType === "corpse";
}
function isChestSource(source) {
  return Boolean(source) && !isCorpseSource(source);
}
function listPersistentCorpses(stageId = null) {
  return readCorpseStorage().corpses.map((source) => normalizeLootSource(source, "corpse")).filter((source) => stageId == null || String(source.stageId) === String(stageId));
}
function resolveLootSource(sourceOrId) {
  if (!sourceOrId) return null;
  if (typeof sourceOrId === "object") {
    return normalizeLootSource(sourceOrId, sourceOrId.sourceType || "chest");
  }
  const id = String(sourceOrId);
  const corpse = readCorpseStorage().corpses.find((source) => String(source.id) === id);
  if (corpse) return normalizeLootSource(corpse, "corpse");
  const chest = getChestStorage().chests.find((source) => String(source.id) === id);
  return normalizeLootSource(chest, "chest");
}
function saveLootSource(source) {
  source = normalizeLootSource(source, source?.sourceType || "chest");
  if (!source?.id) return false;
  source.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  if (isCorpseSource(source)) {
    const storage2 = readCorpseStorage();
    const index2 = storage2.corpses.findIndex((entry) => String(entry.id) === String(source.id));
    const compactSource = compactCorpseSource(source);
    if (index2 >= 0) storage2.corpses[index2] = compactSource;
    else storage2.corpses.push(compactSource);
    return writeCorpseStorage(storage2);
  }
  const storage = getChestStorage();
  const index = storage.chests.findIndex((entry) => String(entry.id) === String(source.id));
  if (index >= 0) storage.chests[index] = source;
  else storage.chests.push(source);
  saveToLocalStorage(CHESTS_STORAGE_KEY, storage);
  return true;
}
function sourceHasRemainingLoot(source) {
  if (isChestSource(source) && source.durabilityState === "destroyed") return false;
  return categories.some(
    (category) => (source?.loot?.[category] || []).some((entry) => (
      entry?.collected !== true && entry?.lost !== true
    ))
  );
}
function sourceHasUncollectedLoot(source) {
  return categories.some(
    (category) => (source?.loot?.[category] || []).some((entry) => (
      entry?.collected !== true && entry?.lost !== true
    ))
  );
}
function sourceHasLostLoot(source) {
  return categories.some(
    (category) => (source?.loot?.[category] || []).some((entry) => entry?.lost === true)
  );
}
function markLootLossGlitterPlayed(source) {
  source.metadata ||= {};
  if (source.metadata.lootLossGlitterPlayedAt) return false;
  source.metadata.lootLossGlitterPlayedAt = (/* @__PURE__ */ new Date()).toISOString();
  saveLootSource(source);
  return true;
}
function markLootEmptyGlitterPlayed(source) {
  source.metadata ||= {};
  if (source.metadata.lootEmptyGlitterPlayedAt) return false;
  source.metadata.lootEmptyGlitterPlayedAt = (/* @__PURE__ */ new Date()).toISOString();
  saveLootSource(source);
  return true;
}
function ensureChestGlitter(container) {
  if (!container) return null;
  let glitter = container.querySelector(":scope > .glitter-loot-container");
  if (glitter) return glitter;
  const battleElement = getBattleElement(container);
  if (battleElement?.id) {
    glitterLoot(`#${CSS.escape(battleElement.id)} > .chest-container`);
    glitter = container.querySelector(":scope > .glitter-loot-container");
  }
  return glitter;
}
function playLootEmptyGlitter(source) {
  if (!source || source.statut !== "looted") return false;

  if (isChestSource(source)) {
    const container = document.querySelector(
      `.chest-container[data-chest-id="${CSS.escape(String(source.id))}"]`
    );
    if (!ensureChestGlitter(container)) return false;
    if (!markLootEmptyGlitterPlayed(source)) return false;
    disperseLootGlitter(container);
    return true;
  }

  if (isCorpseSource(source)) {
    const entityBox = findCorpseEntityBox(source);
    if (!entityBox || !ensureCorpseGlitter(source, entityBox)) return false;
    if (!markLootEmptyGlitterPlayed(source)) return false;
    disperseLootGlitter(entityBox);
    return true;
  }

  return false;
}
function inspectLootSource(sourceId, lootInstanceId) {
  const source = resolveLootSource(sourceId);
  if (!source) return { success: false, reason: "source_not_found" };
  if (isChestSource(source) && source.durabilityState === "destroyed") {
    return { success: false, reason: "source_destroyed", source };
  }
  for (const category of categories) {
    const loot = source.loot[category].find(
      (entry) => String(entry?.lootInstanceId) === String(lootInstanceId) && entry?.collected !== true
    );
    if (loot) return { success: true, source, loot, category };
  }
  return { success: false, reason: "loot_not_found", source };
}
function openLootSource(sourceId) {
  const source = resolveLootSource(sourceId);
  if (!source || source.statut === "looted" || source.statut === "destroyed") return source;
  if (isChestSource(source) && source.statut === "locked") return null;
  if (source.openedAt && source.statut === "opened") return source;
  source.openedAt ??= (/* @__PURE__ */ new Date()).toISOString();
  source.statut = "opened";
  saveLootSource(source);
  return source;
}
function collectLootSource(sourceId, lootInstanceId) {
  const inspected = inspectLootSource(sourceId, lootInstanceId);
  if (!inspected.success) return inspected;
  inspected.loot.collected = true;
  inspected.loot.collectedAt = (/* @__PURE__ */ new Date()).toISOString();
  inspected.source.statut = sourceHasRemainingLoot(inspected.source) ? "opened" : "looted";
  if (inspected.source.statut === "looted") {
    inspected.source.lootedAt = (/* @__PURE__ */ new Date()).toISOString();
  }
  saveLootSource(inspected.source);
  return {
    success: true,
    source: inspected.source,
    collected: inspected.loot,
    category: inspected.category
  };
}
function restoreLootSource(sourceId, collectionResult) {
  const source = resolveLootSource(sourceId);
  const lootInstanceId = collectionResult?.collected?.lootInstanceId;
  if (!source || !lootInstanceId) return { success: false, source };
  for (const category of categories) {
    const loot = source.loot[category].find(
      (entry) => String(entry?.lootInstanceId) === String(lootInstanceId)
    );
    if (!loot) continue;
    loot.collected = false;
    delete loot.collectedAt;
    source.statut = "opened";
    delete source.lootedAt;
    saveLootSource(source);
    return { success: true, source, restored: loot };
  }
  return { success: false, source };
}

// modularized-loot/loot/reward-assignment.js
import { entitesNestUp } from "./entites.js";
import { addEntityToArmyA } from "./ArmyAFactory.js";
import { getEntityLoot } from "./GameStorage.js";
import { acquireItem } from "./itemManager.js";
function readPlayerInventorySnapshot() {
  try {
    const playerSave = JSON.parse(localStorage.getItem("PlayerSave") || "{}");
    const inventory = Array.isArray(playerSave?.Playerinventory) ? playerSave.Playerinventory : [];
    return {
      playerSave,
      inventory,
      ids: inventory.map((entry) => String(entry?.itemId ?? entry ?? "")).filter(Boolean)
    };
  } catch (error) {
    lootTrace("error", "PlayerSave illisible", { error });
    return null;
  }
}
function secureAcquiredItemId(beforeSnapshot, sourceItemId, context) {
  const afterSnapshot = readPlayerInventorySnapshot();
  if (!beforeSnapshot || !afterSnapshot) return false;
  const beforeLength = beforeSnapshot.inventory.length;
  const addedItems = afterSnapshot.inventory.slice(beforeLength);
  if (addedItems.length !== 1) {
    lootTrace("error", "Inventaire incoh\xE9rent apr\xE8s attribution", {
      ...context,
      beforeLength,
      afterLength: afterSnapshot.inventory.length,
      addedCount: addedItems.length
    });
    return false;
  }
  const addedItem = addedItems[0];
  const generatedId = String(addedItem?.itemId ?? "");
  const existingIds = new Set(beforeSnapshot.ids);
  if (generatedId && !existingIds.has(generatedId)) return true;
  const originalId = String(sourceItemId ?? "");
  if (!originalId || existingIds.has(originalId)) {
    afterSnapshot.inventory.splice(beforeLength, 1);
    afterSnapshot.playerSave.Playerinventory = afterSnapshot.inventory;
    localStorage.setItem("PlayerSave", JSON.stringify(afterSnapshot.playerSave));
    return false;
  }
  addedItem.itemId = originalId;
  afterSnapshot.playerSave.Playerinventory = afterSnapshot.inventory;
  localStorage.setItem("PlayerSave", JSON.stringify(afterSnapshot.playerSave));
  return true;
}
function giveEntityReward(entityReference, source, traceId = null) {
  traceId ||= createLootTraceId(source?.id, "entity-assignment");
  try {
    const entityLootId = entityReference?.entityLootId ?? entityReference?.lootInstanceId ?? entityReference?.id;
    const resolvedEntity = entityReference?.embeddedEntity || (entityLootId ? getEntityLoot(entityLootId) : null) || entityReference;
    const sourceEntityId = resolvedEntity?.sourceEntityId ?? entityReference?.sourceEntityId ?? null;
    const sourceSerial = resolvedEntity?.sourceSerial ?? entityReference?.sourceSerial ?? null;
    const template = entitesNestUp.find(
      (candidate) => sourceEntityId != null && String(candidate?.id) === String(sourceEntityId) || sourceSerial != null && String(candidate?.serial) === String(sourceSerial)
    ) || null;
    const entity = template ? {
      ...template,
      ...resolvedEntity,
      id: template.id,
      serial: template.serial ?? resolvedEntity?.serial,
      entityLootId
    } : resolvedEntity;
    if (!entity) return false;
    const entityForArmyA = {
      ...entity,
      side: "A",
      isDEAD: false,
      statut: Array.isArray(entity.statut) ? entity.statut.filter((status) => status !== "dead") : []
    };
    if (entityForArmyA.stats?.HP && typeof entityForArmyA.stats.HP === "object") {
      entityForArmyA.stats = {
        ...entityForArmyA.stats,
        HP: {
          ...entityForArmyA.stats.HP,
          current: entityForArmyA.stats.HP.max ?? entityForArmyA.stats.HP.current
        }
      };
    }
    const result = addEntityToArmyA(entityForArmyA, 1, {
      source: "loot",
      sourceId: source?.id ?? null,
      eventId: source?.eventId ?? source?.metadata?.eventId ?? null
    });
    lootTrace(result === false ? "error" : "log", "Attribution entit\xE9", {
      traceId,
      sourceId: source?.id,
      sourceType: source?.sourceType,
      entityLootId,
      success: result !== false
    });
    return result !== false;
  } catch (error) {
    lootTrace("error", "Exception pendant l\u2019attribution de l\u2019entit\xE9", {
      traceId,
      sourceId: source?.id,
      error
    });
    return false;
  }
}
function giveItemReward(item, source, traceId = null) {
  traceId ||= createLootTraceId(source?.id, "item-assignment");
  if (!item || !source) return false;
  const itemReferenceId = item.itemId ?? item.sourceId ?? item.id;
  const itemTemplate = ItemDetails.find((candidate) => String(candidate?.itemId ?? candidate?.id) === String(itemReferenceId)) || null;
  const resolvedItem = itemTemplate ? { ...itemTemplate, ...item } : item;
  const inventoryItem = {
    ...resolvedItem,
    origin: "loot",
    sourceLootId: source.id,
    sourceLootType: source.sourceType,
    sourceStageId: String(source.stageId ?? source.level ?? ""),
    collected: true,
    collectedAt: resolvedItem.collectedAt ?? (/* @__PURE__ */ new Date()).toISOString()
  };
  const beforeSnapshot = readPlayerInventorySnapshot();
  if (!beforeSnapshot) return false;
  try {
    const acquired = Boolean(acquireItem(inventoryItem, "loot"));
    const secured = acquired && secureAcquiredItemId(
      beforeSnapshot,
      resolvedItem.itemId ?? resolvedItem.sourceId,
      { traceId, sourceId: source.id, sourceType: source.sourceType }
    );
    lootTrace(secured ? "log" : "error", "Attribution objet", {
      traceId,
      sourceId: source.id,
      sourceType: source.sourceType,
      lootType: resolvedItem.lootType,
      success: secured
    });
    return secured;
  } catch (error) {
    lootTrace("error", "Exception pendant l\u2019attribution de l\u2019objet", {
      traceId,
      sourceId: source.id,
      error
    });
    return false;
  }
}
function assignLootReward(reward, source, traceId = null) {
  const isEntity = reward?.lootType === "entity" || Boolean(reward?.entityLootId) || Boolean(reward?.embeddedEntity);
  return isEntity ? giveEntityReward(reward, source, traceId) : giveItemReward(reward, source, traceId);
}

// modularized-loot/loot/interface.js
var collectingLootKeys = /* @__PURE__ */ new Set();
function getRenderableLoot(source) {
  const entities = source.loot.entities.map((reference) => {
    const entity = reference.embeddedEntity
      || getEntityLoot2(reference.entityLootId)
      || entitesNestUp2.find((candidate) => (
        reference.sourceEntityId != null && String(candidate?.id) === String(reference.sourceEntityId)
      ) || (
        reference.sourceSerial != null && String(candidate?.serial) === String(reference.sourceSerial)
      ));
    if (!entity) return null;
    return {
      ...entity,
      ...reference,
      lootInstanceId: reference.lootInstanceId || reference.entityLootId,
      entityLootId: reference.entityLootId,
      lootType: "entity"
    };
  }).filter(Boolean);
  const hydrateItem = (reference) => {
    const referenceId = reference?.itemId ?? reference?.sourceId ?? reference?.id;
    const template = ItemDetails.find((candidate) => String(candidate?.itemId ?? candidate?.id) === String(referenceId));
    return template ? { ...template, ...reference } : reference;
  };
  return [
    ...entities,
    ...source.loot.stuff.map(hydrateItem),
    ...source.loot.consommables.map(hydrateItem)
  ].filter((reward) => reward?.collected !== true && reward?.lost !== true);
}
function spawnCorpseBloodImpacts(interfaceElement) {
  if (!interfaceElement?.classList.contains("corpse")) return;
  const parent = interfaceElement;
  if (!parent) return;
  const gifByVariant = {
    1: "./media/assets/effects/blood-impact-3.gif",
    2: "./media/assets/effects/blood-impact-5.gif",
    3: "./media/assets/effects/blood-impact-4.gif",
    4: "./media/assets/effects/blood-impact-1.gif"
  };
  const positionVariants = [1, 2, 3, 4];
  for (let index = positionVariants.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [positionVariants[index], positionVariants[randomIndex]] = [positionVariants[randomIndex], positionVariants[index]];
  }
  parent.querySelectorAll(":scope > .corspe-interface-fx").forEach((effect) => effect.remove());
  const effects = [];
  const replayToken = `${Date.now()}-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
  for (let index = 0; index < 3; index += 1) {
    const positionVariant = positionVariants[index];
    const effect = document.createElement("div");
    effect.className = `corspe-interface-fx fx-${positionVariant}`;
    effect.style.backgroundImage = `url("${gifByVariant[positionVariant]}?loot-replay=${replayToken}-${index}")`;
    effect.setAttribute("aria-hidden", "true");
    parent.appendChild(effect);
    effects.push(effect);
  }
  let cleanupDone = false;
  let cleanupTimer = null;
  const cleanupEffects = () => {
    if (cleanupDone) return;
    cleanupDone = true;
    if (cleanupTimer !== null) clearTimeout(cleanupTimer);
    effects.forEach((effect) => effect.remove());
  };
  interfaceElement._cleanupCorpseBloodImpacts = cleanupEffects;
  cleanupTimer = setTimeout(cleanupEffects, 2500);
}
var PLAYER_INFO_STORAGE_KEY = "playerInfo.json";
function incrementKilledCockroachCounter() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PLAYER_INFO_STORAGE_KEY) || "{}");
    const playerInfo = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    const currentCount = Math.max(0, Number.parseInt(playerInfo.cockroaches, 10) || 0);
    playerInfo.cockroaches = currentCount + 1;
    playerInfo.lastUpdated = (/* @__PURE__ */ new Date()).toISOString();
    localStorage.setItem(PLAYER_INFO_STORAGE_KEY, JSON.stringify(playerInfo));
    window.dispatchEvent(new CustomEvent("playerInfoUpdated", {
      detail: {
        key: "cockroaches",
        value: playerInfo.cockroaches,
        playerInfo
      }
    }));
    return playerInfo.cockroaches;
  } catch (error) {
    lootTrace("error", "Impossible de sauvegarder le compteur de cafards", { error });
    return null;
  }
}
function calculateCockroachExperience(elapsedMs, escapeDelayMs) {
  const safeLifetime = Math.max(1, Number(escapeDelayMs) || 1);
  const progress = Math.max(0, Math.min(0.999999, (Number(elapsedMs) || 0) / safeLifetime));
  return Math.max(1, 10 - Math.floor(progress * 10));
}
function requestPlayerExperienceGain(amount, source = "chest-cockroach") {
  const experience = Math.max(0, Math.floor(Number(amount) || 0));
  if (experience <= 0) return 0;
  window.dispatchEvent(new CustomEvent("playerExperienceRequested", {
    detail: { amount: experience, source }
  }));
  return experience;
}
function rollChestCockroachCount(firstOpening = false) {
  const multiplier = firstOpening ? 2 : 1;
  const roll = Math.random() * 100;
  if (roll < 1 * multiplier) return 4;
  if (roll < 6 * multiplier) return 3;
  if (roll < 16 * multiplier) return 2;
  if (roll < 46 * multiplier) return 1;
  return 0;
}
function spawnChestCockroach(interfaceElement, options = {}) {
  if (!interfaceElement?.isConnected || interfaceElement.classList.contains("corpse")) return null;
  const lootBody = options.lootBody || interfaceElement.querySelector(":scope > .loot-body");
  if (!lootBody) return null;
  if (options.single !== true) {
    lootBody.querySelectorAll(":scope > .chest-cockroach-fx").forEach((effect) => effect.remove());
    const count = rollChestCockroachCount(options.firstOpening === true);
    const previousBodyPosition = lootBody.style.position;
    const positionedByLoot = getComputedStyle(lootBody).position === "static";
    if (positionedByLoot) lootBody.style.position = "relative";
    const instances = [];
    for (let index = 0; index < count; index += 1) {
      const instance = spawnChestCockroach(interfaceElement, {
        single: true,
        lootBody,
        index
      });
      if (instance) instances.push(instance);
    }
    let allCleaned = false;
    interfaceElement._cleanupChestCockroach = () => {
      if (allCleaned) return;
      allCleaned = true;
      instances.forEach((instance) => instance.cleanup());
      lootBody.querySelectorAll(":scope > .chest-cockroach-fx").forEach((effect) => effect.remove());
      if (positionedByLoot && lootBody.style.position === "relative") {
        lootBody.style.position = previousBodyPosition;
      }
    };
    return instances.map((instance) => instance.element);
  }
  const cockroach = document.createElement("img");
  cockroach.className = "chest-cockroach-fx";
  cockroach.src = "./media/assets/effects/cafard.gif";
  cockroach.alt = "";
  cockroach.draggable = false;
  cockroach.tabIndex = 0;
  cockroach.setAttribute("role", "button");
  cockroach.setAttribute("aria-label", "Arrêter le cafard");
  Object.assign(cockroach.style, {
    position: "absolute",
    left: "0",
    top: "0",
    width: "56px",
    height: "auto",
    cursor: "pointer",
    pointerEvents: "auto",
    userSelect: "none",
    willChange: "transform",
    zIndex: "100"
  });
  lootBody.appendChild(cockroach);
  const spawnedAt = performance.now();
  const escapeDelayMs = 3000 + Math.random() * 7000;
  const effectWidth = 56;
  const effectHeight = 40;
  const bodyWidth = Math.max(effectWidth, lootBody.clientWidth);
  const bodyHeight = Math.max(effectHeight, lootBody.clientHeight);
  const startsOnLeft = Math.random() < 0.5;
  let x = startsOnLeft ? 0 : bodyWidth - effectWidth;
  let y = Math.random() * Math.max(0, bodyHeight - effectHeight);
  let angle = (startsOnLeft ? 0 : Math.PI) + (Math.random() - 0.5) * 0.8;
  const orientationOffset = 180;
  cockroach.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${angle * 180 / Math.PI + orientationOffset}deg)`;
  let curvature = 0;
  let previousTime = 0;
  let modeTime = 0;
  let totalTime = 0;
  let nextModeAt = 2 + Math.random() * 2;
  let modeIndex = Math.floor(Math.random() * 4);
  let moving = true;
  let cleaned = false;
  let animationFrame = null;
  let escapeTimer = null;
  const modes = [
    () => 1.15,
    (time) => Math.sin(time * 1.55) * 2.1,
    (time) => Math.sin(time * 0.8) * 1.35,
    (time) => Math.sin(time) + Math.sin(time * 0.37) * 0.55
  ];
  const chooseNextMode = () => {
    const previousMode = modeIndex;
    do modeIndex = Math.floor(Math.random() * modes.length);
    while (modeIndex === previousMode);
    modeTime = 0;
    nextModeAt = 2 + Math.random() * 3;
  };
  const animateCockroach = (time) => {
    if (!moving || cleaned || !cockroach.isConnected) return;
    if (!previousTime) previousTime = time;
    const delta = Math.min((time - previousTime) / 1000, 0.04);
    previousTime = time;
    modeTime += delta;
    totalTime += delta;
    if (modeTime > nextModeAt) chooseNextMode();
    let targetCurvature = modes[modeIndex](modeTime);
    const currentWidth = Math.max(effectWidth, lootBody.clientWidth);
    const currentHeight = Math.max(effectHeight, lootBody.clientHeight);
    const margin = Math.min(70, currentWidth / 3, currentHeight / 3);
    if (x < margin || x > currentWidth - effectWidth - margin || y < margin || y > currentHeight - effectHeight - margin) {
      const towardCenter = Math.atan2(currentHeight / 2 - y, currentWidth / 2 - x);
      const angleDifference = Math.atan2(Math.sin(towardCenter - angle), Math.cos(towardCenter - angle));
      targetCurvature = Math.max(-2.4, Math.min(2.4, angleDifference * 2));
    }
    curvature += (targetCurvature - curvature) * Math.min(1, delta * 1.5);
    angle += curvature * delta;
    const pulse = 0.5 - 0.5 * Math.cos(totalTime * Math.PI * 2 / 2.6);
    const speed = 250 + pulse * 90;
    x += Math.cos(angle) * speed * delta;
    y += Math.sin(angle) * speed * delta;
    x = Math.max(0, Math.min(currentWidth - effectWidth, x));
    y = Math.max(0, Math.min(currentHeight - effectHeight, y));
    cockroach.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${angle * 180 / Math.PI + orientationOffset}deg)`;
    animationFrame = requestAnimationFrame(animateCockroach);
  };
  const stopCockroach = (event) => {
    event?.preventDefault();
    event?.stopPropagation();
    if (!moving) return;
    moving = false;
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    animationFrame = null;
    if (escapeTimer !== null) clearTimeout(escapeTimer);
    escapeTimer = null;
    incrementKilledCockroachCounter();
    const elapsedMs = Math.max(0, performance.now() - spawnedAt);
    const experience = calculateCockroachExperience(elapsedMs, escapeDelayMs);
    requestPlayerExperienceGain(experience);
    cockroach.dataset.experienceAwarded = String(experience);
    cockroach.src = "./media/assets/effects/dead-cafard.png";
    cockroach.classList.add("arrete");
    cockroach.removeAttribute("tabindex");
    cockroach.style.cursor = "default";
    cockroach.style.willChange = "auto";
  };
  const handleCockroachKeydown = (event) => {
    if (event.key === "Enter" || event.key === " ") stopCockroach(event);
  };
  cockroach.addEventListener("click", stopCockroach);
  cockroach.addEventListener("keydown", handleCockroachKeydown);
  const cleanupCockroach = () => {
    if (cleaned) return;
    cleaned = true;
    moving = false;
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    if (escapeTimer !== null) clearTimeout(escapeTimer);
    animationFrame = null;
    escapeTimer = null;
    cockroach.removeEventListener("click", stopCockroach);
    cockroach.removeEventListener("keydown", handleCockroachKeydown);
    cockroach.remove();
  };
  escapeTimer = setTimeout(cleanupCockroach, escapeDelayMs);
  animationFrame = requestAnimationFrame(animateCockroach);
  return { element: cockroach, cleanup: cleanupCockroach };
}
function requestLootInterfaceClose(interfaceElement) {
  if (!interfaceElement?.isConnected) return false;
  if (typeof interfaceElement._closeLootInterface === "function") {
    interfaceElement._closeLootInterface();
    return true;
  }
  const closeButton = interfaceElement.querySelector(".close-loot");
  if (closeButton) {
    closeButton.click();
    return true;
  }
  interfaceElement.remove();
  return true;
}

/**
 * Ferme toutes les interfaces de butin actuellement ouvertes.
 * Le même nettoyage est utilisé pour les coffres et les cadavres.
 */
export function closeOpenLootInterfaces() {
  const activeInterfaces = [...document.querySelectorAll(".loot-interface")];
  let closedCount = 0;

  activeInterfaces.forEach((interfaceElement) => {
    if (requestLootInterfaceClose(interfaceElement)) closedCount += 1;
  });

  return closedCount;
}

function openLootSourceInterface(sourceOrId, options = {}) {
  const source = resolveLootSource(sourceOrId);
  if (!source) return null;
  if (isChestSource(source) && source.durabilityState === "destroyed") return null;
  const gameUI = document.querySelector(".Game-UI");
  if (!gameUI) return null;
  const activeInterfaces = [...document.querySelectorAll(".loot-interface")];
  const togglingCurrentSource = activeInterfaces.some(
    (element) => String(element.dataset.lootSourceId) === String(source.id)
  );
  activeInterfaces.forEach(requestLootInterfaceClose);
  if (togglingCurrentSource) return null;
  const interfaceElement = document.createElement("div");
  interfaceElement.className = "loot-interface";
  if (isCorpseSource(source)) interfaceElement.classList.add("corpse");
  else interfaceElement.classList.add("chest");
  interfaceElement.dataset.lootSourceId = String(source.id);
  interfaceElement.dataset.chestId = String(source.id);
  interfaceElement.dataset.sourceType = source.sourceType;
  interfaceElement.dataset.chestLevel = String(source.stageId);
  const body = document.createElement("div");
  body.className = "loot-body";
  const title = document.createElement("div");
  title.className = "loot-title";
  const titleText = document.createElement("div");
  titleText.className = "loot-title-text";
  titleText.textContent = isCorpseSource(source) ? `D\xE9pouille de ${source.metadata?.sourceEntityName || source.sourceEntityName || "l\u2019ennemi"}` : "Contenu du coffre";
  title.appendChild(titleText);
  const content = document.createElement("div");
  content.className = "loot-content";
  const description = document.createElement("div");
  description.className = "loot-description";
  const mosaic = document.createElement("div");
  mosaic.className = "loot-item-mosaic";
  content.append(description, mosaic);
  const actions = document.createElement("div");
  actions.className = "loot-actions";
  const collectSelectedButton = document.createElement("button");
  collectSelectedButton.type = "button";
  collectSelectedButton.className = "loot-action-button collect-selected";
  collectSelectedButton.textContent = "Ramasser";
  collectSelectedButton.hidden = true;
  collectSelectedButton.disabled = true;
  const collectAllButton = document.createElement("button");
  collectAllButton.type = "button";
  collectAllButton.className = "loot-action-button collect-all";
  collectAllButton.textContent = "Tout ramasser";
  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "loot-action-button close-loot";
  closeButton.textContent = isCorpseSource(source) ? "Fermer" : "Fermer le coffre";
  actions.append(collectSelectedButton, collectAllButton, closeButton);
  if (isCorpseSource(source)) {
    body.append(title, content, actions);
    interfaceElement.appendChild(body);
  } else {
    title.appendChild(description);
    body.append(content, actions);
    interfaceElement.append(title, body);
  }
  gameUI.appendChild(interfaceElement);
  if (isCorpseSource(source)) spawnCorpseBloodImpacts(interfaceElement);
  else spawnChestCockroach(interfaceElement, { firstOpening: options.firstOpening === true });
  let interfaceClosed = false;
  let disconnectObserver = null;
  const closeLootInterface = () => {
    if (interfaceClosed) return;
    interfaceClosed = true;
    disconnectObserver?.disconnect();
    disconnectObserver = null;
    interfaceElement._cleanupCorpseBloodImpacts?.();
    interfaceElement._cleanupChestCockroach?.();
    interfaceElement.remove();
    try {
      options.onClose?.(resolveLootSource(source.id));
    } catch (error) {
      lootTrace("error", "Erreur pendant la fermeture de l’interface de loot", {
        sourceId: source.id,
        sourceType: source.sourceType,
        error
      });
    }
  };
  interfaceElement._closeLootInterface = closeLootInterface;
  closeButton.addEventListener("click", closeLootInterface);
  if (typeof MutationObserver !== "undefined" && document.body) {
    disconnectObserver = new MutationObserver(() => {
      if (!interfaceElement.isConnected) closeLootInterface();
    });
    disconnectObserver.observe(document.body, { childList: true, subtree: true });
  }
  displayLootRewards(source, mosaic, description, {
    collectSelectedButton,
    collectAllButton,
    onUpdated: options.onUpdated,
    onLooted: options.onLooted
  });
  return interfaceElement;
}
function displayLootRewards(source, mosaic, description, controls) {
  const traceId = createLootTraceId(source.id, "interface");
  const rewards = getRenderableLoot(source);
  const entries = /* @__PURE__ */ new Map();
  let selectedId = null;
  let collectionInProgress = false;
  const selectReward = (lootInstanceId) => {
    selectedId = lootInstanceId || null;
    for (const [id, entry] of entries) {
      const selected = id === selectedId;
      entry.wrapper.classList.toggle("selected", selected);
      entry.wrapper.setAttribute("aria-selected", String(selected));
    }
    controls.collectSelectedButton.hidden = !selectedId;
    controls.collectSelectedButton.disabled = !selectedId || collectionInProgress;
  };
  const updateState = (message) => {
    const hasRemaining = entries.size > 0;
    controls.collectAllButton.disabled = !hasRemaining || collectionInProgress;
    if (!hasRemaining) {
      selectReward(null);
      description.textContent = message || (isCorpseSource(source) ? "Le cadavre ne contient plus rien." : "Le coffre est vide.");
    }
  };
  const collectReward = (lootInstanceId) => {
    const key = `${source.id}::${lootInstanceId}`;
    const itemTraceId = createLootTraceId(source.id, `collect-${lootInstanceId}`);
    if (collectingLootKeys.has(key)) return false;
    collectingLootKeys.add(key);
    try {
      const entry = entries.get(lootInstanceId);
      if (!entry) return false;
      const inspected = inspectLootSource(source.id, lootInstanceId);
      if (!inspected.success) return false;
      const result = collectLootSource(source.id, lootInstanceId);
      if (!result.success) return false;
      if (!assignLootReward(result.collected, result.source, itemTraceId)) {
        restoreLootSource(source.id, result);
        lootTrace("warn", "Attribution annul\xE9e et loot restaur\xE9", {
          traceId: itemTraceId,
          sourceId: source.id,
          lootInstanceId
        });
        return false;
      }
      entries.delete(lootInstanceId);
      entry.wrapper.remove();
      if (selectedId === lootInstanceId) selectReward(null);
      const isEntity = result.category === "entities";
      description.textContent = isEntity ? `${entry.reward.name || "Une entit\xE9"} a rejoint ton arm\xE9e.` : `${entry.reward.displayName || entry.reward.itemName || entry.reward.name || "Un objet"} a \xE9t\xE9 ajout\xE9 \xE0 ton inventaire.`;
      if (result.source.statut === "looted") {
        playLootEmptyGlitter(result.source);
      }
      controls.onUpdated?.(result.source);
      if (result.source.statut === "looted") controls.onLooted?.(result.source);
      updateState();
      return true;
    } finally {
      collectingLootKeys.delete(key);
    }
  };
  description.textContent = rewards.length ? "S\xE9lectionne une r\xE9compense, ou double-clique pour la ramasser." : isCorpseSource(source) ? "Le cadavre est vide." : "Le coffre est vide.";
  lootTrace("log", "Contenu de la source affich\xE9", {
    traceId,
    sourceId: source.id,
    sourceType: source.sourceType,
    loot: summarizeLootSource(source)
  });
  for (const reward of rewards) {
    const wrapper = createAllItems(reward, {
      source: "worldmap-loot",
      showCost: false,
      onDoubleClick: () => collectReward(reward.lootInstanceId)
    });
    if (!wrapper) continue;
    wrapper.classList.add("loot-item-wrapper");
    wrapper.dataset.lootInstanceId = reward.lootInstanceId;
    wrapper.setAttribute("role", "option");
    wrapper.setAttribute("aria-selected", "false");
    entries.set(reward.lootInstanceId, { reward, wrapper });
    wrapper.addEventListener("click", () => selectReward(reward.lootInstanceId));
    mosaic.appendChild(wrapper);
  }
  controls.collectSelectedButton.addEventListener("click", () => {
    if (selectedId) collectReward(selectedId);
  });
  controls.collectAllButton.addEventListener("click", () => {
    if (collectionInProgress || !entries.size) return;
    collectionInProgress = true;
    controls.collectSelectedButton.disabled = true;
    controls.collectAllButton.disabled = true;
    for (const id of [...entries.keys()]) {
      collectReward(id);
    }
    collectionInProgress = false;
    controls.collectSelectedButton.disabled = !selectedId;
    updateState("Tout le contenu a \xE9t\xE9 ramass\xE9.");
  });
  updateState();
}

// modularized-loot/loot/reward-generator.js
import { entitesNestUp as entitesNestUp2, entites } from "./entites.js";
import { ItemDetails } from "./itemList.js";
function randomId(prefix) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}
function randomEntry(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  return entries[Math.floor(Math.random() * entries.length)] ?? null;
}
function createEntityPool() {
  const sideBSerials = new Set(
    entites.filter((entity) => entity?.side === "B").map((entity) => entity?.serial)
  );
  const contextualPool = entitesNestUp2.filter((entity) => sideBSerials.has(entity?.serial));
  return contextualPool.length ? contextualPool : entitesNestUp2;
}
function createItemPool(itemType) {
  return ItemDetails.filter(
    (item) => Array.isArray(item?.itemType) && item.itemType.includes(itemType)
  );
}
function createEntityReward(sourceId) {
  const entity = randomEntry(createEntityPool());
  if (!entity) return null;
  const lootInstanceId = randomId(`${sourceId}-entity`);
  return {
    lootInstanceId,
    entityLootId: randomId("el"),
    sourceEntityId: entity.id ?? null,
    sourceSerial: entity.serial ?? null,
    lootType: "entity",
    collected: false
  };
}
function createItemReward(sourceId, itemType) {
  const item = randomEntry(createItemPool(itemType));
  if (!item) return null;
  return {
    lootInstanceId: randomId(`${sourceId}-${itemType}`),
    itemId: item.itemId ?? item.id ?? null,
    sourceId: item.itemId ?? item.id ?? null,
    lootType: itemType,
    collected: false
  };
}
function generateSimpleLootBundle(sourceId) {
  const entity = createEntityReward(sourceId);
  const equipment = createItemReward(sourceId, "stuff");
  const consumable = createItemReward(sourceId, "consumable");
  if (!entity || !equipment || !consumable) {
    lootTrace("error", "G\xE9n\xE9ration incompl\xE8te : un pool de r\xE9compenses est vide", {
      sourceId,
      entityGenerated: Boolean(entity),
      equipmentGenerated: Boolean(equipment),
      consumableGenerated: Boolean(consumable)
    });
  }
  return {
    entities: entity ? [entity] : [],
    stuff: equipment ? [equipment] : [],
    consommables: consumable ? [consumable] : []
  };
}
function ensureSimpleLootBundle(source) {
  if (!source) return null;
  const currentLoot = source.loot || {};
  const hasExistingLoot = ["entities", "stuff", "consommables"].some(
    (category) => Array.isArray(currentLoot[category]) && currentLoot[category].length > 0
  );
  if (!hasExistingLoot) {
    source.loot = generateSimpleLootBundle(source.id);
  } else {
    source.loot = {
      entities: Array.isArray(currentLoot.entities) ? currentLoot.entities : [],
      stuff: Array.isArray(currentLoot.stuff) ? currentLoot.stuff : [],
      consommables: Array.isArray(currentLoot.consommables) ? currentLoot.consommables : []
    };
  }
  source.lootGeneratedAt ??= (/* @__PURE__ */ new Date()).toISOString();
  return source;
}

// modularized-loot/loot/chest-source.js
var openingSourceIds = /* @__PURE__ */ new Set();
var pendingStageChests = /* @__PURE__ */ new Map();
var renderObserver = null;
var interactionInstalled = false;
var chestCanvasOriginalImages = /* @__PURE__ */ new WeakMap();
var chestCanvasAnimationFrames = /* @__PURE__ */ new WeakMap();
var chestCanvasBackgroundDescriptors = /* @__PURE__ */ new WeakMap();
function resolveChestOpeningDurability(source) {
  source = normalizeLootSource(source, "chest");
  if (!isChestSource(source)) return { allowed: false, reason: "not_a_chest", source };
  if (source.statut === "locked") return { allowed: false, reason: "locked", source };
  if (source.statut === "looted") return { allowed: false, reason: "looted", source };
  if (source.durabilityState === "destroyed" || source.statut === "destroyed") {
    return { allowed: false, reason: "destroyed", destroyed: true, source };
  }

  const checkedAt = (/* @__PURE__ */ new Date()).toISOString();
  source.openingCount += 1;
  source.lastDurabilityCheckAt = checkedAt;
  let enteredCritical = false;
  let criticalChance = null;
  let criticalRoll = null;

  if (source.durabilityState === "normal") {
    criticalChance = source.openingCount === 1
      ? 0
      : source.openingCount >= 10
        ? 1
        : (source.openingCount - 1) * 0.1;
    criticalRoll = Math.random();
    source.lastCriticalChance = criticalChance;
    source.lastCriticalRoll = criticalRoll;
    if (criticalRoll < criticalChance) {
      source.durabilityState = "critical";
      source.criticalAt ??= checkedAt;
      enteredCritical = true;
    }
  }

  let destructionChance = null;
  let destructionRoll = null;
  let destroyed = false;
  if (source.durabilityState === "critical" && !enteredCritical) {
    source.criticalAttempts += 1;
    destructionChance = Math.min(1, 0.5 + (source.criticalAttempts - 1) * 0.05);
    destructionRoll = Math.random();
    source.lastDestructionChance = destructionChance;
    source.lastDestructionRoll = destructionRoll;
    if (destructionRoll < destructionChance) {
      destroyed = true;
      source.durabilityState = "destroyed";
      source.statut = "destroyed";
      source.destroyedAt = checkedAt;
      for (const category of categories) {
        for (const reward of source.loot?.[category] || []) {
          if (reward?.collected === true) continue;
          reward.lost = true;
          reward.lostAt = checkedAt;
        }
      }
    }
  }

  saveLootSource(source);
  return {
    allowed: !destroyed,
    source,
    enteredCritical,
    destroyed,
    openingCount: source.openingCount,
    criticalChance,
    criticalRoll,
    criticalAttempts: source.criticalAttempts,
    destructionChance,
    destructionRoll
  };
}
function getLockedChestSpriteUrl(currentSpriteUrl) {
  const sourceUrl = String(currentSpriteUrl || "").trim();
  if (!sourceUrl) return sourceUrl;
  return sourceUrl.replace(
    /[^/?#]+(?=([?#].*)?$)/,
    "chest-locked.png"
  );
}
function getCssBackgroundDescriptor(element) {
  const candidates = [
    getComputedStyle(element),
    getComputedStyle(element, "::before"),
    getComputedStyle(element, "::after")
  ];
  for (const style of candidates) {
    const match = String(style.backgroundImage || "").match(/^url\(["']?(.*?)["']?\)$/);
    if (!match?.[1]) continue;
    return {
      url: match[1],
      size: style.backgroundSize || "auto",
      position: style.backgroundPosition || "50% 50%"
    };
  }
  return null;
}
function parseBackgroundAxis(value, freeSpace) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "left" || normalized === "top") return 0;
  if (normalized === "center") return freeSpace / 2;
  if (normalized === "right" || normalized === "bottom") return freeSpace;
  if (normalized.endsWith("%")) {
    return freeSpace * (parseFloat(normalized) / 100);
  }
  if (normalized.endsWith("px")) return parseFloat(normalized) || 0;
  const numeric = parseFloat(normalized);
  return Number.isFinite(numeric) ? numeric : freeSpace / 2;
}
function computeBackgroundDrawRect(image, width, height, descriptor) {
  const naturalWidth = image.naturalWidth || image.width || width;
  const naturalHeight = image.naturalHeight || image.height || height;
  const sizeParts = String(descriptor.size || "auto").trim().split(/\s+/);
  let drawWidth = naturalWidth;
  let drawHeight = naturalHeight;
  if (sizeParts[0] === "cover" || sizeParts[0] === "contain") {
    const ratio = sizeParts[0] === "cover" ? Math.max(width / naturalWidth, height / naturalHeight) : Math.min(width / naturalWidth, height / naturalHeight);
    drawWidth = naturalWidth * ratio;
    drawHeight = naturalHeight * ratio;
  } else {
    const resolveSize = (token, reference) => {
      if (!token || token === "auto") return null;
      if (token.endsWith("%")) return reference * (parseFloat(token) / 100);
      if (token.endsWith("px")) return parseFloat(token);
      const numeric = parseFloat(token);
      return Number.isFinite(numeric) ? numeric : null;
    };
    const requestedWidth = resolveSize(sizeParts[0], width);
    const requestedHeight = resolveSize(sizeParts[1], height);
    if (requestedWidth !== null && requestedHeight !== null) {
      drawWidth = requestedWidth;
      drawHeight = requestedHeight;
    } else if (requestedWidth !== null) {
      drawWidth = requestedWidth;
      drawHeight = naturalHeight * (requestedWidth / naturalWidth);
    } else if (requestedHeight !== null) {
      drawHeight = requestedHeight;
      drawWidth = naturalWidth * (requestedHeight / naturalHeight);
    }
  }
  const positionParts = String(descriptor.position || "50% 50%").trim().split(/\s+/);
  return {
    x: parseBackgroundAxis(positionParts[0] || "50%", width - drawWidth),
    y: parseBackgroundAxis(positionParts[1] || "50%", height - drawHeight),
    width: drawWidth,
    height: drawHeight
  };
}
async function refreshChestCanvasSprite(canvas) {
  if (!(canvas instanceof HTMLCanvasElement) || !canvas.isConnected) return null;
  const cssWidth = Math.max(1, Math.round(canvas.offsetWidth || 1));
  const cssHeight = Math.max(1, Math.round(canvas.offsetHeight || 1));
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  let descriptor = getCssBackgroundDescriptor(canvas);
  if (descriptor?.url && canvas.matches(".chest-loot.locked")) {
    descriptor = {
      ...descriptor,
      url: getLockedChestSpriteUrl(descriptor.url)
    };
  }
  if (descriptor) chestCanvasBackgroundDescriptors.set(canvas, descriptor);
  else descriptor = chestCanvasBackgroundDescriptors.get(canvas);
  if (!descriptor?.url) return null;
  const pixelWidth = Math.max(1, Math.round(cssWidth * dpr));
  const pixelHeight = Math.max(1, Math.round(cssHeight * dpr));
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
  const image = new Image();
  image.src = descriptor.url;
  try {
    await image.decode();
  } catch {
    await new Promise((resolve) => {
      image.onload = resolve;
      image.onerror = resolve;
    });
  }
  if (!image.naturalWidth || !canvas.isConnected) return null;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, cssWidth, cssHeight);
  const draw = computeBackgroundDrawRect(image, cssWidth, cssHeight, descriptor);
  context.drawImage(image, draw.x, draw.y, draw.width, draw.height);
  context.setTransform(1, 0, 0, 1, 0, 0);
  chestCanvasOriginalImages.set(
    canvas,
    context.getImageData(0, 0, canvas.width, canvas.height)
  );
  canvas.style.backgroundImage = "none";
  if (getComputedStyle(canvas).display === "inline") {
    canvas.style.display = "block";
  }
  return canvas;
}
function scheduleChestCanvasRefresh(canvas) {
  if (!(canvas instanceof HTMLCanvasElement)) return;
  requestAnimationFrame(() => requestAnimationFrame(() => refreshChestCanvasSprite(canvas)));
}
function entiteTint(canvas, color = "255, 0, 0", opacity = 0.6) {
  const context = canvas?.getContext?.("2d");
  const original = chestCanvasOriginalImages.get(canvas);
  if (!context || !original) return false;
  context.putImageData(original, 0, 0);
  context.save();
  context.globalCompositeOperation = "source-atop";
  context.fillStyle = `rgba(${color}, ${opacity})`;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.restore();
  return true;
}
function releaseChestTint(canvas) {
  const context = canvas?.getContext?.("2d");
  const original = chestCanvasOriginalImages.get(canvas);
  if (context && original) context.putImageData(original, 0, 0);
}
function getHexPositionValue(hex) {
  return String(hex?.id || hex?.dataset?.hexId || hex?.dataset?.position || "").trim();
}
function getBattleElement(element) {
  if (!element) return null;
  if (element.matches?.('.battle-element[data-element-type="passive"]')) return element;
  return element.closest?.('.battle-element[data-element-type="passive"]') ?? null;
}
function getChestContainer(chestUiId) {
  const root = document.getElementById(chestUiId);
  if (!root) return null;
  if (root.matches?.(".chest-container")) return root;
  return root.querySelector?.(".chest-container") ?? null;
}
function removeChestElement(element) {
  const battleElement = getBattleElement(element);
  const vacatedHex = battleElement?.closest?.(".hex") || null;
  if (battleElement) removeBattleElementFromDOM(battleElement);
  else element?.remove();
  restoreVacatedHexSocleOpacity(vacatedHex);
}

function destroySingleChest(sourceOrId, {
  destroyedAt = (/* @__PURE__ */ new Date()).toISOString(),
  reason = "external"
} = {}) {
  const source = normalizeLootSource(resolveLootSource(sourceOrId), "chest");
  if (!isChestSource(source)) {
    return { success: false, reason: "not_a_chest", source };
  }

  const sourceId = String(source.id);
  let lostLootCount = 0;
  source.durabilityState = "destroyed";
  source.statut = "destroyed";
  source.destroyedAt = destroyedAt;
  source.destructionReason = reason;

  for (const category of categories) {
    for (const reward of source.loot?.[category] || []) {
      if (reward?.collected === true || reward?.lost === true) continue;
      reward.lost = true;
      reward.lostAt = destroyedAt;
      lostLootCount += 1;
    }
  }

  saveLootSource(source);
  openingSourceIds.delete(sourceId);

  document.querySelectorAll(
    `.loot-interface[data-loot-source-id="${CSS.escape(sourceId)}"]`
  ).forEach(requestLootInterfaceClose);

  document.querySelectorAll(
    `.chest-container[data-chest-id="${CSS.escape(sourceId)}"]`
  ).forEach((container) => {
    if (lostLootCount > 0) disperseLootGlitter(container);
    container.dataset.opening = "false";
    const visual = container.querySelector(":scope > .chest-animation > .chest-sprite")
      || container.querySelector(":scope > .chest-animation");
    visual?._criticalChestAnimation?.cancel?.();
    syncChestState(source, container);
  });

  lootTrace("log", "Coffre détruit", {
    traceId: createLootTraceId(sourceId, "destroy"),
    sourceId,
    reason,
    lostLootCount
  });

  return { success: true, source, lostLootCount };
}

function resolveStageDestructionId(sourceOrId) {
  if (typeof sourceOrId === "string" && sourceOrId.trim().toLowerCase() === "stage") {
    return getActiveStageId();
  }

  if (!sourceOrId || typeof sourceOrId !== "object") return null;

  // Un coffre passé directement reste traité par le comportement historique.
  if (sourceOrId.sourceType === "chest" || sourceOrId.loot || sourceOrId.durabilityState) {
    return null;
  }

  const explicitlyStage = String(sourceOrId.type ?? sourceOrId.sourceType ?? "")
    .trim()
    .toLowerCase() === "stage";
  const stageId = sourceOrId.stageId
    ?? sourceOrId.levelId
    ?? sourceOrId.level
    ?? sourceOrId.id
    ?? (explicitlyStage ? getActiveStageId() : null);

  return stageId == null || String(stageId).trim() === ""
    ? null
    : String(stageId);
}

export function destroyChest(sourceOrId, {
  destroyedAt = (/* @__PURE__ */ new Date()).toISOString(),
  reason = "external"
} = {}) {
  const stageId = resolveStageDestructionId(sourceOrId);

  // Comportement historique inchangé : un coffre ou son id.
  if (stageId == null) {
    return destroySingleChest(sourceOrId, { destroyedAt, reason });
  }

  if (!stageId) {
    return {
      success: false,
      reason: "stage_not_found",
      stageId,
      sources: [],
      destroyedChestCount: 0,
      lostLootCount: 0
    };
  }

  const stageChests = getChestStorage().chests.filter((chest) => (
    String(chest?.stageId ?? chest?.level ?? "") === String(stageId)
  ));
  const results = stageChests.map((chest) => destroySingleChest(chest, {
    destroyedAt,
    reason
  }));

  const successfulResults = results.filter((result) => result?.success === true);
  const lostLootCount = successfulResults.reduce(
    (total, result) => total + (Number(result.lostLootCount) || 0),
    0
  );

  lootTrace("log", "Coffres du stage détruits", {
    stageId: String(stageId),
    reason,
    destroyedChestCount: successfulResults.length,
    lostLootCount
  });

  return {
    success: results.every((result) => result?.success === true),
    stageId: String(stageId),
    sources: successfulResults.map((result) => result.source),
    results,
    destroyedChestCount: successfulResults.length,
    lostLootCount
  };
}

function removeForeignStageChests(activeStageId = getActiveStageId()) {
  document.querySelectorAll(".chest-container[data-chest-level]").forEach((element) => {
    if (String(element.dataset.chestLevel) !== String(activeStageId)) {
      removeChestElement(element);
    }
  });
}
function persistBattlePosition(source, position) {
  if (!source || !position) return;
  source.battlePosition = String(position);
  source.metadata ||= {};
  source.metadata.battlePosition = String(position);
  saveLootSource(source);
}
function findUnlockedPosition(grid, currentPosition = null) {
  if (!grid) return null;

  // Un coffre déverrouillé appartient à la zone neutre,
  // au milieu des lignes et au centre des colonnes.
  return hexCoordonne("neutral", "middle", "center", 1)?.[0] ?? null;
}
function moveChestToHex(source, container, position) {
  const battleElement = getBattleElement(container);
  const grid = battleElement?.closest(".hex-grid");
  if (!battleElement || !grid || !position) return false;
  const target = grid.querySelector(
    `#${CSS.escape(position)}, [data-hex-id="${CSS.escape(position)}"], .hex[data-position="${CSS.escape(position)}"]`
  );
  if (!target) return false;
  const oldHex = battleElement.parentElement?.matches?.(".hex") ? battleElement.parentElement : null;
  const lockedCanvas = container.querySelector("canvas.chest-loot.locked");
  if (lockedCanvas && oldHex && oldHex !== target) {
    container._lockedChestPreviousHex = oldHex;
  }
  if (battleElement.parentElement !== target) target.appendChild(battleElement);
  battleElement.dataset.position = position;
  target.classList.add("occupied");
  if (oldHex && oldHex !== target && !oldHex.querySelector("[data-position]")) {
    oldHex.classList.remove("occupied");
  }
  persistBattlePosition(source, position);
  return true;
}
export function restoreVacatedHexSocleOpacity(hex) {
  if (!hex || getVisibleHexes() !== false) return false;
  const socles = [...hex.querySelectorAll(".socle")];
  socles.forEach((socle) => {
    socle.style.opacity = "0";
  });
  return socles.length > 0;
}
function ensureSprite(source, container) {
  const sprite = container?.querySelector(":scope > .chest-animation > .chest-sprite");
  if (!sprite) return null;
  const shouldBeCanvas = source.statut === "locked";
  const current = sprite.querySelector(":scope > .chest-loot");
  if (current && current instanceof HTMLCanvasElement === shouldBeCanvas) return current;
  const removingLockedCanvas = current instanceof HTMLCanvasElement && current.classList.contains("locked") && !shouldBeCanvas;
  const previousHex = container._lockedChestPreviousHex
    || getBattleElement(container)?.parentElement?.closest?.(".hex")
    || null;
  const replacement = document.createElement(shouldBeCanvas ? "canvas" : "div");
  replacement.className = current?.className || "chest-loot";
  if (shouldBeCanvas) replacement.id = `chestCanvas_${source.id}`;
  replacement.setAttribute("aria-hidden", "true");
  current ? current.replaceWith(replacement) : sprite.appendChild(replacement);
  if (removingLockedCanvas) {
    restoreVacatedHexSocleOpacity(previousHex);
    delete container._lockedChestPreviousHex;
  }
  return replacement;
}
function syncChestGlitter(source, container) {
  const locked = source.statut === "locked";
  const destroyed = source.durabilityState === "destroyed" || source.statut === "destroyed";
  const remaining = sourceHasRemainingLoot(source);
  if (!locked && !destroyed && remaining) {
    const battleElement = getBattleElement(container);
    if (battleElement?.id) {
      glitterLoot(`#${CSS.escape(battleElement.id)} > .chest-container`);
    }
  } else {
    container.querySelectorAll(":scope > .glitter-loot-container:not(.is-dispersing)").forEach((glitter) => glitter.remove());
  }
}
function syncChestState(source, container = null) {
  container ||= document.querySelector(
    `.chest-container[data-chest-id="${CSS.escape(String(source.id))}"]`
  );
  if (!container) return;
  const loot = ensureSprite(source, container);
  const locked = source.statut === "locked";
  const looted = source.statut === "looted";
  const destroyed = source.durabilityState === "destroyed" || source.statut === "destroyed";
  const critical = source.durabilityState === "critical" && !looted && !destroyed;
  const remaining = sourceHasRemainingLoot(source);
  container.dataset.chestStatus = source.statut;
  container.dataset.durabilityState = source.durabilityState;
  container.dataset.openingCount = String(source.openingCount);
  container.dataset.criticalAttempts = String(source.criticalAttempts);
  container.classList.toggle("locked", locked);
  container.classList.toggle("critical", critical);
  container.classList.toggle("cracked", critical);
  container.classList.toggle("destroyed", destroyed || looted);
  container.classList.toggle("looted", looted);
  loot?.classList.toggle("locked", locked);
  loot?.classList.toggle("critical", critical);
  loot?.classList.toggle("cracked", critical);
  loot?.classList.toggle("destroyed", destroyed || looted);
  loot?.classList.toggle("looted", looted);
  loot?.classList.toggle("lootable", !locked && !destroyed && remaining);
  loot?.classList.toggle("never-opened", !locked && !destroyed && remaining && !source.openedAt);
  if (loot && !(loot instanceof HTMLCanvasElement)) {
    if (critical) {
      loot.style.setProperty("background-image", `url("${CRACKED_CHEST_SPRITE_URL}")`, "important");
    } else {
      loot.style.removeProperty("background-image");
    }
  }
  if (loot instanceof HTMLCanvasElement) scheduleChestCanvasRefresh(loot);
  const entrancePending = container.dataset.chestEntrancePending === "true";
  if (sourceHasLostLoot(source) && markLootLossGlitterPlayed(source)) {
    disperseLootGlitter(container);
  }
  if (entrancePending) {
    container.querySelectorAll(":scope > .glitter-loot-container:not(.is-dispersing)").forEach((glitter) => glitter.remove());
  } else {
    syncChestGlitter(source, container);
  }
}
function spawnInPlace(container) {
  const animation = container.querySelector(":scope > .chest-animation");
  if (!animation) return;
  animation.animate(
    [{ opacity: 0, transform: "scale(.92)" }, { opacity: 1, transform: "scale(1)" }],
    { duration: 180, easing: "ease-out" }
  );
}
function waitForChestCssAnimation(element, fallbackMs) {
  return new Promise((resolve) => {
    if (!element?.isConnected) return resolve();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      element.removeEventListener("animationend", onEnd);
      element.removeEventListener("animationcancel", onEnd);
      clearTimeout(timer);
      resolve();
    };
    const onEnd = (event) => {
      if (event.target === element) finish();
    };
    const timer = setTimeout(finish, fallbackMs + 100);
    element.addEventListener("animationend", onEnd);
    element.addEventListener("animationcancel", onEnd);
  });
}
function spawnChestGlitterAfterEntrance(container, entranceFinished) {
  return entranceFinished.then(() => {
    if (!container.isConnected) return;
    delete container.dataset.chestEntrancePending;
    const source = resolveLootSource(container.dataset.chestId);
    if (source) syncChestGlitter(source, container);
  });
}
function runLockedChestVibrationCycle(canvas, visual, {
  duration = 420,
  tintColor = "255, 0, 0",
  tintOpacity = 0.6,
  tintEnabled = true
} = {}) {
  if (!canvas?.isConnected || !visual?.isConnected || !visual.animate) {
    return Promise.resolve();
  }

  visual._lockedRefusalAnimation?.cancel?.();

  const previousTransform = visual.style.transform;
  const previousWillChange = visual.style.willChange;
  visual.style.willChange = "transform";

  // Motif STRICTEMENT identique au clic sur un coffre locked.
  const shake = visual.animate([
    { transform: `${previousTransform || ""} translateX(0)` },
    { transform: `${previousTransform || ""} translateX(-8px)` },
    { transform: `${previousTransform || ""} translateX(8px)` },
    { transform: `${previousTransform || ""} translateX(-6px)` },
    { transform: `${previousTransform || ""} translateX(5px)` },
    { transform: `${previousTransform || ""} translateX(-2px)` },
    { transform: `${previousTransform || ""} translateX(0)` }
  ], { duration, easing: "ease-out" });

  visual._lockedRefusalAnimation = shake;
  const start = performance.now();

  const tintFrame = (now) => {
    if (!canvas.isConnected || visual._lockedRefusalAnimation !== shake) return;
    const progress = Math.min((now - start) / duration, 1);
    // Même pulse de teinte que le clic. Certains cycles peuvent volontairement
    // ne pas teinter afin de réduire le nombre de clignotements sans toucher à la vibration.
    if (tintEnabled) {
      entiteTint(canvas, tintColor, Math.sin(progress * Math.PI) * tintOpacity);
    }
    if (progress < 1) {
      chestCanvasAnimationFrames.set(canvas, requestAnimationFrame(tintFrame));
    }
  };
  chestCanvasAnimationFrames.set(canvas, requestAnimationFrame(tintFrame));

  return new Promise((resolve) => {
    const restore = () => {
      if (visual._lockedRefusalAnimation === shake) {
        visual.style.transform = previousTransform;
        visual.style.willChange = previousWillChange;
        visual._lockedRefusalAnimation = null;
      }
      const frameId = chestCanvasAnimationFrames.get(canvas);
      if (frameId) cancelAnimationFrame(frameId);
      chestCanvasAnimationFrames.delete(canvas);
      releaseChestTint(canvas);
      resolve();
    };
    shake.addEventListener("finish", restore, { once: true });
    shake.addEventListener("cancel", restore, { once: true });
  });
}

async function unlockingChestAnimation(container) {
  if (!container?.isConnected) return false;
  if (container._unlockingChestPromise) return container._unlockingChestPromise;

  const run = (async () => {
    const sprite = container.querySelector(":scope > .chest-animation > .chest-sprite");
    const lockedChest = sprite?.querySelector(":scope > canvas.chest-loot.locked");
    if (!sprite || !lockedChest) return false;

    const oldFrame = chestCanvasAnimationFrames.get(lockedChest);
    if (oldFrame) {
      cancelAnimationFrame(oldFrame);
      chestCanvasAnimationFrames.delete(lockedChest);
    }

    await refreshChestCanvasSprite(lockedChest);
    if (!chestCanvasOriginalImages.has(lockedChest)) return false;

    // 1,2 seconde : même vibration que le clic, répétée de plus en plus vite.
    // Les proportions entre les cycles restent identiques : seule la durée totale est compressée.
    const preUnlockDurationMs = 1000;
    const rawAcceleratingCycles = [420, 360, 300, 250, 210, 175, 145, 120];
    const rawTotal = rawAcceleratingCycles.reduce((sum, value) => sum + value, 0);
    const acceleratingCycles = rawAcceleratingCycles.map((value) =>
      value * preUnlockDurationMs / rawTotal
    );

    // 6 flashes de teinte sur 8 vibrations : ~25 % de clignotements en moins,
    // sans modifier la fréquence ni l'accélération de la vibration.
    const tintCycleMask = [true, false, true, false, true, false, true, false, ];

    for (let cycleIndex = 0; cycleIndex < acceleratingCycles.length; cycleIndex += 1) {
      const duration = acceleratingCycles[cycleIndex];
      if (!lockedChest.isConnected || !container.isConnected) return false;
      await runLockedChestVibrationCycle(lockedChest, sprite, {
        duration,
        tintColor: "254, 255, 226",
        tintOpacity: 0.35,
        tintEnabled: tintCycleMask[cycleIndex] !== false
      });
    }

    if (!lockedChest.isConnected || !container.isConnected) return false;

    const unlocking = document.createElement("div");
    unlocking.className = "chest-loot unlocking chest-unlocking-animation";
    unlocking.setAttribute("aria-hidden", "true");

    lockedChest.replaceWith(unlocking);
    releaseChestTint(lockedChest);

await new Promise((resolve) => setTimeout(resolve, 1200));

unlocking.remove();


    return true;
  })();

  container._unlockingChestPromise = run;
  try {
    return await run;
  } finally {
    if (container._unlockingChestPromise === run) {
      delete container._unlockingChestPromise;
    }
  }
}

function animateChestCriticalTransition(source, container) {
  if (!container?.isConnected) return syncChestState(source, container);
  const visual = container.querySelector(":scope > .chest-animation > .chest-sprite")
    || container.querySelector(":scope > .chest-animation");
  if (!visual?.animate) return syncChestState(source, container);
  visual._criticalChestAnimation?.cancel?.();
  const computedTransform = getComputedStyle(visual).transform;
  const baseTransform = computedTransform === "none" ? "" : computedTransform;
  const transformAt = (offset) => `${baseTransform} translate3d(${offset}px, 0, 0)`.trim();
  const shake = visual.animate([
    { transform: transformAt(0) },
    { transform: transformAt(-7) },
    { transform: transformAt(7) },
    { transform: transformAt(-6) },
    { transform: transformAt(5) },
    { transform: transformAt(-3) },
    { transform: transformAt(2) },
    { transform: transformAt(0) }
  ], {
    duration: 420,
    easing: "ease-out"
  });
  visual._criticalChestAnimation = shake;
  let finalized = false;
  const applyCrackedSprite = () => {
    if (finalized) return;
    finalized = true;
    if (visual._criticalChestAnimation === shake) {
      visual._criticalChestAnimation = null;
    }
    if (container.isConnected) syncChestState(source, container);
  };
  shake.addEventListener("finish", applyCrackedSprite, { once: true });
  shake.addEventListener("cancel", applyCrackedSprite, { once: true });
  return shake;
}
async function animateLockedRefusal(container) {
  if (!container?.isConnected) return;
  const canvas = container.querySelector("canvas.chest-loot.locked");
  const visual = container.querySelector(":scope > .chest-animation > .chest-sprite") || canvas;
  if (!canvas || !visual) return;

  const oldFrame = chestCanvasAnimationFrames.get(canvas);
  if (oldFrame) {
    cancelAnimationFrame(oldFrame);
    chestCanvasAnimationFrames.delete(canvas);
  }

  await refreshChestCanvasSprite(canvas);
  if (!chestCanvasOriginalImages.has(canvas)) return;

  // Le clic et le pré-unlock passent désormais par EXACTEMENT la même vibration.
  await runLockedChestVibrationCycle(canvas, visual, {
    duration: 420,
    tintColor: "255, 0, 0",
    tintOpacity: 0.6
  });
}
function setVisualPhase(chestUiId, phase) {
  const container = getChestContainer(chestUiId);
  const loot = container?.querySelector(".chest-loot");
  if (!loot) return;
  loot.classList.remove(
    "opening",
    "lootable",
    "never-opened",
    "is-looted",
    "is-prepared",
    "is-opened"
  );
  loot.classList.add(phase);
  const source = resolveLootSource(container.dataset.chestId);
  const critical = source?.durabilityState === "critical"
    && source?.statut !== "looted"
    && source?.statut !== "destroyed";
  if (critical && !(loot instanceof HTMLCanvasElement)) {
    const spriteUrl = phase === "is-opened"
      ? CRACKED_CHEST_OPENED_SPRITE_URL
      : CRACKED_CHEST_SPRITE_URL;
    loot.style.setProperty("background-image", `url("${spriteUrl}")`, "important");
  }
}
export function OpeningChest(chestUiId) {
  setVisualPhase(chestUiId, "is-looted");
}
export function PreparedChest(chestUiId) {
  setVisualPhase(chestUiId, "is-prepared");
}
export function OpenedChest(chestUiId) {
  setVisualPhase(chestUiId, "is-opened");
}
function restoreChestAfterInterfaceClose(source, container) {
  if (!source) return;
  if (!container?.isConnected) {
    createChestLoot(source, { spawnMode: "in-place" });
    return;
  }
  const loot = container.querySelector(".chest-loot");
  loot?.classList.remove("opening", "is-looted", "is-prepared", "is-opened");
  syncChestState(source, container);
}
function handleChestClick(event) {
  const lootElement = event.target?.closest?.(".chest-loot");
  const container = lootElement?.closest?.(".chest-container[data-chest-id]");
  if (!container) return;
  const sourceId = String(container.dataset.chestId || "");
  const source = resolveLootSource(sourceId);
  if (!isChestSource(source)) return;
  event.preventDefault();
  event.stopPropagation();
  if (source.statut === "locked") {
    animateLockedRefusal(container);
    return;
  }
  if (source.statut === "looted" || source.statut === "destroyed" || source.durabilityState === "destroyed") {
    syncChestState(source, container);
    return;
  }
  const existingInterface = document.querySelector(
    `.loot-interface[data-loot-source-id="${CSS.escape(sourceId)}"]`
  );
  if (existingInterface) {
    requestLootInterfaceClose(existingInterface);
    openingSourceIds.delete(sourceId);
    container.dataset.opening = "false";
    return;
  }
  if (openingSourceIds.has(sourceId) && container.dataset.opening !== "true") {
    openingSourceIds.delete(sourceId);
  }
  document.querySelectorAll(".loot-interface").forEach(requestLootInterfaceClose);
  if (openingSourceIds.has(sourceId)) return;
  const traceId = createLootTraceId(sourceId, "open");
  const firstOpening = !source.openedAt;
  const durability = resolveChestOpeningDurability(source);
  const durabilitySource = durability.source || source;
  if (durability.enteredCritical && !durability.destroyed) {
    animateChestCriticalTransition(durabilitySource, container);
  } else {
    syncChestState(durabilitySource, container);
  }
  lootTrace("log", "Jet de durabilité du coffre", {
    traceId,
    sourceId,
    openingCount: durability.openingCount,
    enteredCritical: durability.enteredCritical,
    criticalChance: durability.criticalChance,
    criticalRoll: durability.criticalRoll,
    criticalAttempts: durability.criticalAttempts,
    destructionChance: durability.destructionChance,
    destructionRoll: durability.destructionRoll,
    destroyed: durability.destroyed
  });
  if (!durability.allowed) {
    openingSourceIds.delete(sourceId);
    container.dataset.opening = "false";
    return;
  }
  const opened = openLootSource(sourceId);
  if (!opened) return;
  openingSourceIds.add(sourceId);
  container.dataset.opening = "true";
  lootTrace("log", "Ouverture coffre", {
    traceId,
    sourceId,
    firstOpening,
    loot: summarizeLootSource(opened)
  });
  const showInterface = () => {
    if (!container.isConnected) {
      openingSourceIds.delete(sourceId);
      return;
    }
    const battleElement = getBattleElement(container);
    const position = getHexPositionValue(
      battleElement?.parentElement?.matches?.(".hex") ? battleElement.parentElement : null
    ) || battleElement?.dataset?.position || opened.battlePosition;
    if (position) persistBattlePosition(opened, position);
    const openedInterface = openLootSourceInterface(sourceId, {
      firstOpening,
      onClose: (current) => {
        openingSourceIds.delete(sourceId);
        container.dataset.opening = "false";
        restoreChestAfterInterfaceClose(current, container);
      },
      onLooted: (current) => {
        restoreChestAfterInterfaceClose(current, container);
      }
    });
    if (openedInterface) {
      container.dataset.opening = "false";
    } else {
      openingSourceIds.delete(sourceId);
      restoreChestAfterInterfaceClose(resolveLootSource(sourceId), container);
    }
  };
  const uiId = getBattleElement(container)?.id || container.id;
  if (!firstOpening) {
    setTimeout(() => {
      if (!container.isConnected) {
        openingSourceIds.delete(sourceId);
        return;
      }
      OpenedChest(uiId);
      setTimeout(showInterface, 1e3);
    }, 500);
    return;
  }
  setTimeout(() => {
    if (!container.isConnected) {
      openingSourceIds.delete(sourceId);
      return;
    }
    OpeningChest(uiId);
    setTimeout(() => {
      if (!container.isConnected) {
        openingSourceIds.delete(sourceId);
        return;
      }
      PreparedChest(uiId);
      setTimeout(() => {
        if (!container.isConnected) {
          openingSourceIds.delete(sourceId);
          return;
        }
        OpenedChest(uiId);
        setTimeout(showInterface, 1e3);
      }, 1300);
    }, 2e3);
  }, 500);
}
function ensureInteraction() {
  if (interactionInstalled) return;
  interactionInstalled = true;
  document.addEventListener("click", handleChestClick, true);
}
export function createChestLoot(sourceOrId, {
  spawnMode = "auto",
  stageId = null
} = {}) {
  const source = normalizeLootSource(resolveLootSource(sourceOrId), "chest");
  if (!isChestSource(source)) return null;
  const hadGenerationDate = Boolean(source.lootGeneratedAt);
  if (source.statut !== "destroyed" && source.statut !== "looted") {
    ensureSimpleLootBundle(source);
  }
  if (!hadGenerationDate) saveLootSource(source);
  const activeStageId = getActiveStageId();
  const requestedStageId = String(stageId ?? activeStageId);
  if (!activeStageId || requestedStageId !== activeStageId || String(source.stageId) !== activeStageId) return null;
  removeForeignStageChests(activeStageId);
  const grids = document.querySelectorAll(".hex-grid");
  const grid = grids[grids.length - 1];
  if (!grid) return null;
  const escapedId = CSS.escape(String(source.id));
  const existing = grid.querySelector(
    `.chest-container[data-chest-id="${escapedId}"]`
  );
  if (existing) {
    ensureInteraction();
    syncChestState(source, existing);
    return existing;
  }
  const existingBattleElement = grid.querySelector(
    `[data-battle-element-id="stage-chest-${escapedId}"], #chest-ui-${escapedId}`
  );
  if (existingBattleElement) removeBattleElementFromDOM(existingBattleElement);
  const preferredPosition = String(
    source.battlePosition ?? source.metadata?.battlePosition ?? ""
  ).trim() || null;

  const chestSide = normalizeLootBattleSide(source.metadata?.side ?? source.side);

  const [defaultPosition] = source.statut === "locked"
    ? hexCoordonne(chestSide === "neutral" ? "B" : chestSide, "top", "end", 1)
    : hexCoordonne(chestSide, "middle", "center", 1);
  const position = preferredPosition && !isHexOccupied(preferredPosition)
    ? preferredPosition
    : defaultPosition;

  if (!position) return null;
  const battleElement = createBattleElementInDOM({
    id: `stage-chest-${source.id}`,
    position,
    type: "passive",
    name: "Coffre de r\xE9compense",
    blocking: true,
    draggable: false,
    className: "chest-battle-element"
  }, { container: grid, requireExistingHex: true });
  if (!battleElement) return null;
  persistBattlePosition(source, position);
  battleElement.id = `chest-ui-${source.id}`;
  Object.assign(battleElement.dataset, {
    entityType: "passive",
    side: chestSide,
    targetable: "false",
    movable: "false",
    draggable: "false"
  });
  battleElement.querySelector(":scope > .battle-element-visual")?.remove();
  const container = document.createElement("div");
  container.className = "chest-container passive-entity chest-passive";
  Object.assign(container.dataset, {
    chestId: String(source.id),
    chestLevel: String(source.stageId),
    chestStatus: String(source.statut),
    lootSource: "stage-chest",
    sourceType: "chest",
    opening: "false"
  });
  const animation = document.createElement("div");
  animation.className = "chest-animation";
  const sprite = document.createElement("div");
  sprite.className = "chest-sprite hb";
  const loot = document.createElement(source.statut === "locked" ? "canvas" : "div");
  loot.className = "chest-loot";
  if (source.statut === "locked") loot.id = `chestCanvas_${source.id}`;
  loot.setAttribute("aria-hidden", "true");
  sprite.appendChild(loot);
  animation.appendChild(sprite);
  container.appendChild(animation);
  battleElement.appendChild(container);
  battleElement.addEventListener("dragstart", (event) => event.preventDefault());
  ensureInteraction();
  const mode = spawnMode === "auto" ? source.statut === "created" ? "initial" : "in-place" : spawnMode;
  if (mode === "initial") container.dataset.chestEntrancePending = "true";
  syncChestState(source, container);
  if (mode === "initial") {
    const entranceAnimation = container.querySelector(":scope > .chest-animation");
    const entranceFinished = waitForChestCssAnimation(entranceAnimation, 2500);
    container.classList.add("entrance");
    setTimeout(() => container.isConnected && container.classList.remove("entrance"), 2e3);
    spawnChestGlitterAfterEntrance(container, entranceFinished);
  } else {
    spawnInPlace(container);
  }
  return container;
}
function renderPendingChests() {
  const activeStageId = getActiveStageId();
  if (!activeStageId) return false;
  const gameUIs = document.querySelectorAll(".Game-UI");
  if (!gameUIs.length) return false;
  const now = Date.now();
  for (const [id, pending] of pendingStageChests) {
    if (pending.expiresAt <= now || String(pending.source.stageId) !== activeStageId) {
      pendingStageChests.delete(id);
      continue;
    }
    if (createChestLoot(id, {
      spawnMode: pending.spawnMode,
      stageId: activeStageId
    })) pendingStageChests.delete(id);
  }
  return true;
}
function ensureRenderObserver() {
  if (renderObserver || typeof MutationObserver === "undefined") return;
  renderObserver = new MutationObserver(() => {
    renderPendingChests();
    if (!pendingStageChests.size) {
      renderObserver.disconnect();
      renderObserver = null;
    }
  });
  renderObserver.observe(document.documentElement, { childList: true, subtree: true });
}
export function renderLoadedChests(chests, {
  spawnMode = "in-place",
  stageId = null
} = {}) {
  const activeStageId = getActiveStageId();
  const requestedStageId = String(stageId ?? activeStageId);
  if (!Array.isArray(chests) || !activeStageId || requestedStageId !== activeStageId) return;
  for (const chest of chests) {
    const source = normalizeLootSource(chest, "chest");
    saveLootSource(source);
    if (String(source.stageId) !== activeStageId) continue;
    pendingStageChests.set(source.id, {
      source,
      spawnMode,
      expiresAt: Date.now() + 3500
    });
  }
  if (!renderPendingChests()) {
    ensureRenderObserver();
    [0, 50, 150, 300, 600, 1e3, 1500, 2200, 3200].forEach(
      (delay) => setTimeout(renderPendingChests, delay)
    );
  }
}
function installChestEvents() {
  ensureInteraction();
  window.addEventListener("stageVictoryChestUnlocked", async (event) => {
    const announced = event.detail?.chest;
    const source = announced?.id ? resolveLootSource(announced.id) : null;
    if (!isChestSource(source) || source.statut === "locked") return;
    const container = document.querySelector(
      `.chest-container[data-chest-id="${CSS.escape(String(source.id))}"]`
    );
    if (!container) {
      renderLoadedChests([source], {
        stageId: event.detail?.stageId ?? source.stageId,
        spawnMode: "initial"
      });
      return;
    }
    const battleElement = getBattleElement(container);
    const grid = battleElement?.closest(".hex-grid");
    const oldHex = battleElement?.parentElement?.matches?.(".hex")
      ? battleElement.parentElement
      : null;
    const currentPosition = getHexPositionValue(oldHex)
      || battleElement?.dataset?.position
      || source.battlePosition;
    const position = findUnlockedPosition(grid, currentPosition);

    // 1. Le chest locked disparaît sur son ancienne case.
    // 2. Le sprite chest-unlocking apparaît au même endroit et dans le même parent.
    // 3. Il disparaît définitivement.
    // 4. Seulement ensuite, le socle de l'ancienne case est masqué et le chest closed arrive.
    await unlockingChestAnimation(container);
    restoreVacatedHexSocleOpacity(oldHex);

    if (!container.isConnected) return;
    if (position) moveChestToHex(source, container, position);
    container.dataset.chestEntrancePending = "true";
    syncChestState(source, container);
    const entranceAnimation = container.querySelector(":scope > .chest-animation");
    const entranceFinished = waitForChestCssAnimation(entranceAnimation, 2500);
    container.classList.remove("entrance");
    void container.offsetWidth;
    container.classList.add("entrance");
    setTimeout(() => container.isConnected && container.classList.remove("entrance"), 2100);
    spawnChestGlitterAfterEntrance(container, entranceFinished);
  });
  window.addEventListener("stageChestsLoaded", (event) => {
    renderLoadedChests(event.detail?.chests || [], {
      stageId: event.detail?.stageId,
      spawnMode: event.detail?.spawnMode || "in-place"
    });
  });
}

// modularized-loot/loot/corpse-source.js
import { disperseLootGlitter as disperseLootGlitter2, glitterLoot as glitterLoot2 } from "./meteo.js";
var interactionInstalled2 = false;
var restoreObserver = null;
var corpseRenderScheduled = false;
var corpseToggleTimestamps = /* @__PURE__ */ new Map();
var corpseAttachRetryTimers = /* @__PURE__ */ new Map();
var CORPSE_TOGGLE_COOLDOWN_MS = 500;
function acceptCorpseToggle(sourceId) {
  const now = performance.now();
  const previous = corpseToggleTimestamps.get(sourceId) ?? -Infinity;
  if (now - previous < CORPSE_TOGGLE_COOLDOWN_MS) return false;
  corpseToggleTimestamps.set(sourceId, now);
  return true;
}
function entityInstanceId(entity) {
  return entity?.uid ?? entity?.instanceId ?? entity?.battleId ?? entity?.id ?? entity?.serial ?? null;
}
function corpseDisplayName(source) {
  return source?.metadata?.sourceEntityName || source?.sourceEntityName || source?.metadata?.sourceEntityId || "inconnue";
}
function findCorpseEntityBox(source) {
  const entityId = source?.metadata?.sourceEntityId ?? source?.sourceEntityId;
  if (entityId == null) return null;
  return document.getElementById(`Box_Entite_${entityId}`) || document.querySelector(`[data-entity-instance-id="${CSS.escape(String(entityId))}"]`);
}
function getCorpseEffectsContainer(entityBox, source) {
  if (!entityBox) return null;

  const entityId = source?.metadata?.sourceEntityId ?? source?.sourceEntityId;
  let effectsContainer = entityId == null
    ? entityBox.querySelector(".effects-container")
    : entityBox.querySelector(`#effectsContainer_${CSS.escape(String(entityId))}`);

  if (!effectsContainer) {
    effectsContainer = document.createElement("div");
    effectsContainer.className = "effects-container";
    if (entityId != null) effectsContainer.id = `effectsContainer_${entityId}`;
    (entityBox.querySelector(":scope > .drag-box") || entityBox).appendChild(effectsContainer);
  }

  return effectsContainer;
}
function forceCorpseOpacity(entityBox) {
  if (!entityBox) return;

  const visualElements = [
    entityBox,
    entityBox.querySelector(".sprite-container"),
    entityBox.querySelector(".animation-sprite"),
    entityBox.querySelector('[id^="DragSprite_"]'),
    entityBox.querySelector(".dead-sprite")
  ];

  visualElements.filter(Boolean).forEach((element) => {
    element.style.setProperty("opacity", "1", "important");
    element.style.setProperty("visibility", "visible", "important");
  });
}
function glitterHost(entityBox, source) {
  const effectsContainer = getCorpseEffectsContainer(entityBox, source);
  if (!effectsContainer) return null;

  let host = effectsContainer.querySelector(":scope > .corpse-lootable");
  if (!host) {
    host = document.createElement("div");
    host.className = "corpse-lootable";
    host.id = `corpse-lootable-${source.id}`;
    host.setAttribute("aria-hidden", "true");
    effectsContainer.appendChild(host);
  }
  return host;
}
function playCorpseLootClickImpact(source, entityBox) {
  if (!isCorpseSource(source) || !entityBox) return false;
  forceCorpseOpacity(entityBox);
  const corpseCanvas = entityBox.querySelector('[id^="spriteCanvas_"].dead-sprite');
  const targetId = corpseCanvas?.id?.slice("spriteCanvas_".length)
    || source.metadata?.sourceEntityId
    || source.sourceEntityId;
  if (targetId == null || !corpseCanvas) return false;

  try {
    damageImpact(targetId, {
      randomBloodImpact: true,
      skipCanvasTint: false
    });
    forceCorpseOpacity(entityBox);
    setTimeout(() => forceCorpseOpacity(entityBox), 50);
    setTimeout(() => forceCorpseOpacity(entityBox), 250);
    setTimeout(() => forceCorpseOpacity(entityBox), 800);
    return true;
  } catch (error) {
    lootTrace("warn", "Impact de loot sur le canvas du cadavre impossible", {
      sourceId: source.id,
      targetId,
      error
    });
    forceCorpseOpacity(entityBox);
    return false;
  }
}
function removeGlitter(entityBox) {
  entityBox?.querySelectorAll(".glitter-loot-container:not(.is-dispersing)").forEach((glitter) => glitter.remove());
  entityBox?.querySelectorAll(".corpse-lootable").forEach((host) => {
    if (!host.querySelector(":scope > .glitter-loot-container.is-dispersing")) host.remove();
  });
}
export function disperseLootSourceGlitter(sourceOrId) {
  const source = typeof sourceOrId === "string"
    ? resolveLootSource(sourceOrId)
    : sourceOrId;
  if (!source || !sourceHasUncollectedLoot(source)) return false;

  if (isChestSource(source)) {
    const container = document.querySelector(
      `.chest-container[data-chest-id="${CSS.escape(String(source.id))}"]`
    );
    if (!container) return false;
    disperseLootGlitter(container);
    return true;
  }

  if (isCorpseSource(source)) {
    const entityBox = findCorpseEntityBox(source);
    if (!entityBox) return false;
    disperseLootGlitter2(entityBox);
    return true;
  }

  return false;
}
function ensureCorpseGlitter(source, entityBox) {
  const host = glitterHost(entityBox, source);
  if (!host) return null;
  entityBox.querySelectorAll(".glitter-loot-container").forEach((glitter) => {
    if (glitter.parentElement !== host) glitter.remove();
  });
  let glitter = host.querySelector(":scope > .glitter-loot-container");
  if (glitter) return glitter;
  if (!host.id) host.id = `corpse-lootable-${source.id}`;
  glitterLoot2(`#${CSS.escape(host.id)}`);
  glitter = host.querySelector(":scope > .glitter-loot-container");
  if (!glitter) {
    glitter = document.createElement("div");
    glitter.className = "glitter-loot-container";
    glitter.setAttribute("aria-hidden", "true");
    host.appendChild(glitter);
  }
  return glitter;
}
function syncCorpseState(source, entityBox = null) {
  if (!isCorpseSource(source)) return null;
  entityBox ||= findCorpseEntityBox(source);
  if (!entityBox) return null;
  forceCorpseOpacity(entityBox);
  const remaining = sourceHasRemainingLoot(source);
  entityBox.dataset.corpseLootId = String(source.id);
  entityBox.dataset.lootSourceType = "corpse";
  entityBox.style.cursor = remaining ? "pointer" : "default";
  entityBox.title = remaining ? `Fouiller le corps de ${corpseDisplayName(source)}` : `Corps de ${corpseDisplayName(source)} d\xE9j\xE0 fouill\xE9`;
  if (sourceHasLostLoot(source) && markLootLossGlitterPlayed(source)) {
    disperseLootGlitter2(entityBox);
  }
  if (remaining) {
    ensureCorpseGlitter(source, entityBox);
  } else {
    removeGlitter(entityBox);
  }
  return entityBox;
}
function attachCorpse(source, attempt = 0) {
  const sourceId = String(source?.id || "");
  const entityBox = findCorpseEntityBox(source);
  if (!entityBox) {
    if (attempt < 20 && sourceId && !corpseAttachRetryTimers.has(sourceId)) {
      const timer = setTimeout(() => {
        corpseAttachRetryTimers.delete(sourceId);
        attachCorpse(source, attempt + 1);
      }, 100);
      corpseAttachRetryTimers.set(sourceId, timer);
    }
    return null;
  }
  const retryTimer = corpseAttachRetryTimers.get(sourceId);
  if (retryTimer != null) clearTimeout(retryTimer);
  corpseAttachRetryTimers.delete(sourceId);
  return syncCorpseState(source, entityBox);
}
function handleCorpseClick(event) {
  const entityBox = event.target?.closest?.("[data-corpse-loot-id]");
  if (!entityBox) return;
  const sourceId = String(entityBox.dataset.corpseLootId || "");
  const source = resolveLootSource(sourceId);
  if (!isCorpseSource(source)) return;
  event.preventDefault();
  event.stopPropagation();
  if (!acceptCorpseToggle(sourceId)) return;
  const existingInterface = document.querySelector(
    `.loot-interface[data-loot-source-id="${CSS.escape(sourceId)}"]`
  );
  if (existingInterface) {
    requestLootInterfaceClose(existingInterface);
    return;
  }
  document.querySelectorAll(".loot-interface").forEach(requestLootInterfaceClose);
  const firstExamination = !source.metadata?.examinedAt;
  const openingTransition = source.statut !== "opened" && source.statut !== "looted";
  source.metadata ||= {};
  source.metadata.examinedAt ??= (/* @__PURE__ */ new Date()).toISOString();
  const opened = openLootSource(source) || source;
  if (firstExamination && !openingTransition) saveLootSource(opened);
  const openedInterface = openLootSourceInterface(sourceId, {
    onUpdated: (current) => syncCorpseState(current, entityBox),
    onLooted: (current) => {
      current.metadata ||= {};
      current.metadata.searchedAt ??= (/* @__PURE__ */ new Date()).toISOString();
      saveLootSource(current);
      syncCorpseState(current, entityBox);
    }
  });
  if (openedInterface && event.isTrusted) {
    playCorpseLootClickImpact(opened, entityBox);
  }
}
function ensureInteraction2() {
  if (interactionInstalled2) return;
  interactionInstalled2 = true;
  document.addEventListener("click", handleCorpseClick, true);
}
export function createCorpseLoot(entity) {
  if (!entity || (entity.side !== "B" && entity.eventSpawnedCorpse !== true) || !Array.isArray(entity.statut) || !entity.statut.includes("dead")) return null;
  const stageId = getActiveStageId() || "battle";
  const instanceId = entityInstanceId(entity);
  if (instanceId == null) return null;
  const corpseId = `corpse-${stageId}-${String(instanceId)}`;
  const existing = resolveLootSource(corpseId);
  if (isCorpseSource(existing)) {
    ensureInteraction2();
    attachCorpse(existing);
    return existing;
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const hasReward = entity.hasReward !== false && entity.eventReward !== false;
  const source = {
    id: corpseId,
    sourceType: "corpse",
    level: String(stageId),
    stageId: String(stageId),
    statut: hasReward ? "created" : "looted",
    createdAt: now,
    updatedAt: now,
    metadata: {
      sourceEntityId: String(instanceId),
      sourceEntityTemplateId: entity.id ?? null,
      sourceEntitySerial: entity.serial ?? null,
      sourceEntityName: entity.name || entity.nom || entity.serial || "Ennemi",
      battlePosition: entity.battlePosition ?? entity.position ?? null
    },
    loot: { entities: [], stuff: [], consommables: [] }
  };
  if (hasReward) ensureSimpleLootBundle(source);
  saveLootSource(source);
  ensureInteraction2();
  attachCorpse(source);
  lootTrace("log", "Cadavre persistant cr\xE9\xE9", {
    traceId: createLootTraceId(source.id, "corpse-created"),
    sourceId: source.id,
    stageId
  });
  window.dispatchEvent(new CustomEvent("armyBCorpseLootCreated", {
    detail: { corpse: source, entity }
  }));
  return source;
}
export function renderPersistentCorpses(stageId = getActiveStageId()) {
  ensureInteraction2();
  const sources = listPersistentCorpses(stageId);
  for (const source of sources) attachCorpse(source);
  return sources;
}
function schedulePersistentCorpseRender() {
  if (corpseRenderScheduled) return;
  corpseRenderScheduled = true;
  requestAnimationFrame(() => {
    corpseRenderScheduled = false;
    renderPersistentCorpses();
  });
}
function ensureRestoreObserver() {
  if (restoreObserver || typeof MutationObserver === "undefined") return;
  restoreObserver = new MutationObserver((mutations) => {
    const entitySelector = '[id^="Box_Entite_"], [data-entity-instance-id]';
    const entityDomAdded = mutations.some((mutation) => [...mutation.addedNodes].some((node) => {
      if (node?.nodeType !== 1 || node.closest?.(".loot-interface")) return false;
      if (node.matches?.(entitySelector)) return true;
      return [...(node.querySelectorAll?.(entitySelector) || [])].some(
        (candidate) => !candidate.closest(".loot-interface")
      );
    }));
    if (entityDomAdded) schedulePersistentCorpseRender();
  });
  restoreObserver.observe(document.documentElement, { childList: true, subtree: true });
}
export function clearCorpseLoot() {
  return renderPersistentCorpses();
}
function installCorpseEvents() {
  migrateCorpseStorageToCompactFormat();
  ensureInteraction2();
  ensureRestoreObserver();
  window.addEventListener("stageChestsLoaded", (event) => {
    renderPersistentCorpses(event.detail?.stageId ?? getActiveStageId());
  });
  window.addEventListener("armyBRendered", () => renderPersistentCorpses());
}

// modularized-loot/loot.js
installChestEvents();
installCorpseEvents();
export function openChestLootInterface(sourceOrId, options = {}) {
  return openLootSourceInterface(sourceOrId, options);
}
export function rewardPlayerA(sourceId = "legacy-loot") {
  return generateSimpleLootBundle(sourceId);
}
