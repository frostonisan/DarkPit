import { ensureGameShell, overlayBounds, overlayRect } from '../ui/viewport.js';
import { gameStorage as localStorage } from "../storage/sessionStorage.js";
import { isAdminMode } from "../storage/gameStorage.js";
import {
  createUniversalEssenceAmbianceHTML,
  renderUniversalEssenceHelperHTML,
  renderLinkedEssenceHelperHTML,
  ESSENCE_EFFECT_HELPERS,
} from "../data/helpers.js";
import { requireSafeMenuAccess } from "../app/state.js";
import { ATTACK_ESSENCE_COLORS, ATTACK_ESSENCE_MAX_SLOTS, ATTACK_ESSENCE_SLOT_SOURCES } from "../data/attackList.js";
import {
  ensureEntityAttackInstances,
  normalizeAttackEssenceColor,
  readAttackDefinitionKey,
} from "../combat/attackResolution.js";
import {
  appendEntityEssenceHistory,
  countUniversalEssenceItems,
  createEssenceTransactionId,
  createLinkedEssenceItem,
  createUniversalEssenceItem,
  ensureEntityEssenceIdentities,
  syncEntityEssenceRewards,
  getEssenceLedgerSchemaVersion,
  isAttackEssenceSocketIdForEntity,
  isLinkedEssenceIdForEntity,
  sanitizeEssenceOwnerId,
  validateUniversalEssenceItems,
} from "./essenceInventory.js";
import { showGamePopupMessage } from "../ui/display.js";

const MAX_ESSENCEUR_SLOTS = ATTACK_ESSENCE_MAX_SLOTS;

const COLOR_LABELS = Object.freeze({
  [ATTACK_ESSENCE_COLORS.RED]: "Rouge",
  [ATTACK_ESSENCE_COLORS.BLUE]: "Bleu",
  [ATTACK_ESSENCE_COLORS.YELLOW]: "Jaune",
});

const COLOR_OPTIONS = [
  { key: "", label: "Aucune" },
  { key: ATTACK_ESSENCE_COLORS.RED, label: COLOR_LABELS[ATTACK_ESSENCE_COLORS.RED] },
  { key: ATTACK_ESSENCE_COLORS.BLUE, label: COLOR_LABELS[ATTACK_ESSENCE_COLORS.BLUE] },
  { key: ATTACK_ESSENCE_COLORS.YELLOW, label: COLOR_LABELS[ATTACK_ESSENCE_COLORS.YELLOW] },
];

const ESSENCE_ITEM_DEFINITIONS = Object.freeze({
  [ATTACK_ESSENCE_COLORS.RED]: {
    name: "Essence de Force",
    universalName: "Essence universelle de Force",
    infusedLabel: "force",
    type: "Essence",
    statKey: "attackEssenceRed",
    spriteClass: "strength",
    quality: 5,
    qualityLabel: "Légendaire",
    qualityColor: "#ffb400",
    attributeLabel: "Force",
    attackNatureLabel: "physique",
    attackNatureClass: "physicalDamage",
  },
  [ATTACK_ESSENCE_COLORS.BLUE]: {
    name: "Essence d'Intelligence",
    universalName: "Essence universelle d'Intelligence",
    infusedLabel: "intelligence",
    type: "Essence",
    statKey: "attackEssenceBlue",
    spriteClass: "intelligence",
    quality: 5,
    qualityLabel: "Légendaire",
    qualityColor: "#ffb400",
    attributeLabel: "Intelligence",
    attackNatureLabel: "magique",
    attackNatureClass: "magicalDamage",
  },
  [ATTACK_ESSENCE_COLORS.YELLOW]: {
    name: "Essence d'Agilité",
    universalName: "Essence universelle d'Agilité",
    infusedLabel: "agilité",
    type: "Essence",
    statKey: "attackEssenceYellow",
    spriteClass: "agility",
    quality: 5,
    qualityLabel: "Légendaire",
    qualityColor: "#ffb400",
    attributeLabel: "Agilité",
    attackNatureLabel: "perçante",
    attackNatureClass: "piercingDamage",
  },
});

const ESSENCE_PURCHASE_PRICES = Object.freeze({
  [ATTACK_ESSENCE_COLORS.RED]: 12000,
  [ATTACK_ESSENCE_COLORS.BLUE]: 12000,
  [ATTACK_ESSENCE_COLORS.YELLOW]: 12000,
});
const LINKED_ESSENCE_QUALITY = Object.freeze({
  quality: 4,
  qualityLabel: "Épique",
  qualityColor: "#c000ff",
});

const ESSENCE_INVENTORY_PLAYER_SAVE_KEY = "attackEssenceInventory";
const ENTITY_LINKED_ESSENCE_INVENTORY_KEY = "attackEssenceInventory";
const ENTITY_BOUND_ESSENCE_ITEMS_KEY = "linkedItems";
const ESSENCE_SOURCE_INVENTORY = "inventory";
const ESSENCE_SOURCE_LINKED = "linked";
const EMPTY_ESSENCE_HELPER_STAT = "attackEssenceEmpty";
const ESSENCE_COLORS = [
  ATTACK_ESSENCE_COLORS.RED,
  ATTACK_ESSENCE_COLORS.BLUE,
  ATTACK_ESSENCE_COLORS.YELLOW,
];
const ATTACK_ESSENCE_SOCKET_GRID_POSITIONS = Object.freeze([
  { column: 3, row: 1 },
  { column: 3, row: 2 },
  { column: 3, row: 3 },
  { column: 2, row: 1 },
  { column: 2, row: 2 },
  { column: 2, row: 3 },
  { column: 4, row: 1 },
  { column: 4, row: 2 },
  { column: 1, row: 1 },
  { column: 1, row: 2 },
]);

const ESSENCE_MIN_ASSET_VERSION = "20260918-orbs";
const versionMiniEssenceAsset = src => `${src}?v=${ESSENCE_MIN_ASSET_VERSION}`;

const ESSENCE_SPRITE_SOURCES = Object.freeze({
  strength: {
    back: "media/assets/misc/essence-strength-02.png",
    front: "media/assets/misc/essence-strength-03.png",
    backMin: versionMiniEssenceAsset("media/assets/misc/essence-strength-02-min.png"),
    frontMin: versionMiniEssenceAsset("media/assets/misc/essence-strength-03-min.png"),
    backClass: "essence-strength-02",
    frontClass: "essence-strength-03",
  },
  intelligence: {
    back: "media/assets/misc/essence-agility-02.png",
    front: "media/assets/misc/essence-agility-03-min.png",
    backMin: versionMiniEssenceAsset("media/assets/misc/essence-agility-02-min.png"),
    frontMin: versionMiniEssenceAsset("media/assets/misc/essence-agility-03-min.png"),
    backClass: "essence-agility-02",
    frontClass: "essence-agility-03",
  },
  agility: {
    back: "media/assets/misc/essence-agility-02.png",
    front: "media/assets/misc/essence-agility-03-min.png",
    backMin: versionMiniEssenceAsset("media/assets/misc/essence-agility-02-min.png"),
    frontMin: versionMiniEssenceAsset("media/assets/misc/essence-agility-03-min.png"),
    backClass: "essence-agility-02",
    frontClass: "essence-agility-03",
  },
  default: {
    back: "media/assets/misc/essence-agility-02.png",
    front: "media/assets/misc/essence-agility-03-min.png",
    backMin: versionMiniEssenceAsset("media/assets/misc/essence-agility-02-min.png"),
    frontMin: versionMiniEssenceAsset("media/assets/misc/essence-agility-03-min.png"),
    backClass: "essence-agility-02",
    frontClass: "essence-agility-03",
  },
});

function normalizeEssenceSource(source = "") {
  return String(source || "");
}

function readLinkedEssenceColor(slot = {}) {
  return normalizeColor(slot?.linkedColor);
}

function readEssenceInstanceId(slot = {}) {
  return String(slot?.essenceId || "").trim();
}

function isInitialAttackFamilySlot(slot = {}) {
  return slot.source === ATTACK_ESSENCE_SLOT_SOURCES.INITIAL_FAMILY;
}

const EFFECT_DEFINITIONS = [
  {
    id: "physical-damage",
    ...ESSENCE_EFFECT_HELPERS["physical-damage"],
    isAvailable: state => state.red > 0,
  },
  {
    id: "vigueur",
    ...ESSENCE_EFFECT_HELPERS["vigueur"],
    isAvailable: state => state.red > 0,
  },
  {
    id: "brutality",
    ...ESSENCE_EFFECT_HELPERS["brutality"],
    isAvailable: state => state.red > 0,
  },
  {
    id: "bloodFury",
    ...ESSENCE_EFFECT_HELPERS["bloodFury"],
    isAvailable: state => state.red > 0,
  },
  {
    id: "magical-damage",
    ...ESSENCE_EFFECT_HELPERS["magical-damage"],
    isAvailable: state => state.blue > 0,
  },
  {
    id: "esprit",
    ...ESSENCE_EFFECT_HELPERS["esprit"],
    isAvailable: state => state.blue > 0,
  },
  {
    id: "inflexion",
    ...ESSENCE_EFFECT_HELPERS["inflexion"],
    isAvailable: state => state.blue > 0,
  },
  {
    id: "piercing-damage",
    ...ESSENCE_EFFECT_HELPERS["piercing-damage"],
    isAvailable: state => state.yellow > 0,
  },
  {
    id: "finesse",
    ...ESSENCE_EFFECT_HELPERS["finesse"],
    isAvailable: state => state.yellow > 0,
  },
  {
    id: "critical",
    ...ESSENCE_EFFECT_HELPERS["critical"],
    isAvailable: state => state.yellow > 0 && !state.isPureMagical,
  },
  {
    id: "ambidextry",
    ...ESSENCE_EFFECT_HELPERS["ambidextry"],
    isAvailable: state => state.yellow > 0 && !state.isPureMagical,
  },
  {
    id: "piercing-recovery",
    ...ESSENCE_EFFECT_HELPERS["piercing-recovery"],
    isAvailable: state => state.yellow > 0,
  },
  {
    id: "transpiercing",
    ...ESSENCE_EFFECT_HELPERS["transpiercing"],
    isAvailable: state => state.isPureYellow,
  },
  {
    id: "perforation",
    ...ESSENCE_EFFECT_HELPERS["perforation"],
    isAvailable: state => state.isPureYellow,
  },
  {
    id: "fracass",
    ...ESSENCE_EFFECT_HELPERS["fracass"],
    isAvailable: state => state.isPureRed,
  },
  {
    id: "psionic",
    ...ESSENCE_EFFECT_HELPERS["psionic"],
    isAvailable: state => state.isPureMagical,
  },
  {
    id: "messed-spell",
    ...ESSENCE_EFFECT_HELPERS["messed-spell"],
    isAvailable: state => state.range === "melee" && state.isPureMagical,
  },
  {
    id: "broken-spell",
    ...ESSENCE_EFFECT_HELPERS["broken-spell"],
    isAvailable: state => state.range === "range" && state.isPureMagical,
  },
  {
    id: "undogeable",
    ...ESSENCE_EFFECT_HELPERS["undogeable"],
    isAvailable: state => state.isPureMagical,
  },
  {
    id: "range-penalty",
    ...ESSENCE_EFFECT_HELPERS["range-penalty"],
    isAvailable: state => state.range === "range" && (state.red > 0 || state.yellow > 0),
  },
  {
    id: "accuracy",
    ...ESSENCE_EFFECT_HELPERS["accuracy"],
    isAvailable: state => state.range === "range" && !state.isPureMagical,
  },
  {
    id: "projectile-speed",
    ...ESSENCE_EFFECT_HELPERS["projectile-speed"],
    isAvailable: state => state.range === "range",
  },
  {
    id: "short-range",
    ...ESSENCE_EFFECT_HELPERS["short-range"],
    isAvailable: state => state.range === "melee",
  },
];

export function normalizeEssenceurColor(value) {
  return normalizeAttackEssenceColor(value);
}

function normalizeColor(value) {
  return normalizeEssenceurColor(value);
}

export function normalizeEssenceurRange(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  return raw === "distance" || raw === "range" || raw === "ranged" ? "range" : "melee";
}

function normalizeRange(value) {
  return normalizeEssenceurRange(value);
}

function canUseLocalStorage() {
  return typeof localStorage !== "undefined";
}

function safeParseStorageJson(raw, fallback = {}) {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function loadPlayerSaveForEssences() {
  if (!canUseLocalStorage()) return {};
  return safeParseStorageJson(localStorage.getItem("PlayerSave"), {});
}

function savePlayerSaveForEssences(save) {
  if (!canUseLocalStorage()) return save;
  localStorage.setItem("PlayerSave", JSON.stringify(save || {}));
  return save;
}

export function normalizeEssenceInventory(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  return ESSENCE_COLORS.reduce((inventory, color) => {
    inventory[color] = Math.max(0, Math.floor(Number(source[color]) || 0));
    return inventory;
  }, {});
}

function notifyUniversalEssenceInventory(store, reason = "save") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("essenceInventoryUpdated", {
    detail: {
      inventory: countUniversalEssenceItems(store.universalItems),
      items: store.universalItems.map(item => ({ ...item })),
      reason,
    },
  }));
}

function saveUniversalEssenceStore(store = {}, options = {}) {
  const universalItems = Array.isArray(store.universalItems) ? store.universalItems : [];
  const audit = validateUniversalEssenceItems(universalItems);
  if (!audit.ok) {
    throw new Error(`Inventaire universel invalide : ${audit.errors.map(error => error.code).join(", ")}`);
  }
  const currentStore = { schemaVersion: getEssenceLedgerSchemaVersion(), universalItems };
  const save = loadPlayerSaveForEssences();
  save[ESSENCE_INVENTORY_PLAYER_SAVE_KEY] = currentStore;
  savePlayerSaveForEssences(save);
  if (options.notify !== false) notifyUniversalEssenceInventory(currentStore, options.reason);
  return currentStore;
}

function loadUniversalEssenceStore() {
  const rawStore = loadPlayerSaveForEssences()[ESSENCE_INVENTORY_PLAYER_SAVE_KEY];
  return {
    schemaVersion: getEssenceLedgerSchemaVersion(),
    universalItems: Array.isArray(rawStore?.universalItems) ? rawStore.universalItems : [],
  };
}

export function loadUniversalEssenceItems() {
  return loadUniversalEssenceStore().universalItems.map(item => ({ ...item }));
}

export function loadEssenceInventory() {
  return countUniversalEssenceItems(loadUniversalEssenceStore().universalItems);
}

export function grantEssencesToInventory(delta = {}, options = {}) {
  const store = loadUniversalEssenceStore();
  const createdItems = [];
  ESSENCE_COLORS.forEach(color => {
    const amount = Math.max(0, Math.floor(Number(delta[color]) || 0));
    for (let index = 0; index < amount; index += 1) {
      const item = createUniversalEssenceItem(color, {
        origin: options.origin || "grant",
        provenanceSource: options.provenanceSource,
        provenanceContext: options.provenanceContext,
      });
      if (item) {
        store.universalItems.push(item);
        createdItems.push(item);
      }
    }
  });
  const saved = saveUniversalEssenceStore(store, { reason: options.reason || options.origin || "grant" });
  console.info("[EssenceLedger] Essences universelles ajoutées.", {
    ids: createdItems.map(item => item.id),
    inventory: countUniversalEssenceItems(saved.universalItems),
  });
  return countUniversalEssenceItems(saved.universalItems);
}

function normalizeAttackNatureList(value = []) {
  if (Array.isArray(value)) return value.map(entry => String(entry ?? "").trim()).filter(Boolean);
  const normalized = String(value ?? "").trim();
  return normalized ? [normalized] : [];
}

function getDefaultEssenceSource(slot = {}, color = "") {
  if (!color) return "";
  return normalizeEssenceSource(slot.essenceSource) || ESSENCE_SOURCE_LINKED;
}

function getNormalizedConfigSlots(config = {}, maxSlots = MAX_ESSENCEUR_SLOTS, options = {}) {
  const rawSlots = Array.isArray(config.slots)
    ? config.slots
    : Array.isArray(config.initialSlots)
      ? config.initialSlots
      : [];

  const slots = rawSlots.slice(0, maxSlots).map((slot, index) => {
    const color = normalizeColor(slot?.color ?? slot?.key ?? slot);
    const active = slot && typeof slot === "object"
      ? slot.active !== false && Boolean(color)
      : Boolean(color);
    const rawKind = slot && typeof slot === "object"
      ? String(slot.kind || slot.type || "open")
      : "open";
    const slotSource = slot?.source || "configured";
    const slotKind = rawKind;
    const sourceSlot = slot && typeof slot === "object"
      ? { ...slot, kind: slotKind, source: slotSource }
      : { kind: slotKind, source: slotSource };
    const essenceSource = getDefaultEssenceSource(sourceSlot, color);
    const linkedColor = normalizeColor(
      readLinkedEssenceColor(slot) ||
      (
        isInitialAttackFamilySlot(sourceSlot)
          ? color
          : ""
      )
    );

    return {
      ...(slot && typeof slot === "object" ? slot : {}),
      slotId: String(slot?.slotId || slot?.id || `slot-${index + 1}`),
      socketId: String(slot?.socketId || ""),
      kind: slotKind,
      locked: Boolean(slot?.locked),
      active,
      color,
      source: slotSource,
      unlockId: slot?.unlockId || "",
      essenceSource,
      linkedColor,
      essenceId: readEssenceInstanceId(slot),
    };
  });

  while (options.fillToMax === true && slots.length < maxSlots) {
    slots.push({
      slotId: `slot-${slots.length + 1}`,
      socketId: "",
      kind: "open",
      locked: false,
      active: false,
      color: "",
      source: "configured",
      unlockId: "",
      essenceSource: "",
      linkedColor: "",
      essenceId: "",
    });
  }

  return slots;
}

function getActiveEssenceColorsFromConfig(config = {}) {
  return getNormalizedConfigSlots(config)
    .filter(slot => slot.active && slot.color)
    .map(slot => slot.color);
}

function canClearEssenceSlot(config = {}, slotIndex = 0) {
  const slots = getNormalizedConfigSlots(config);
  const index = Math.max(0, Math.floor(Number(slotIndex) || 0));
  const slot = slots[index];
  if (!slot || slot.locked || !slot.color) return false;
  return true;
}

function countInventoryEssencesInSlots(slots = []) {
  return getNormalizedConfigSlots({ slots }).reduce((counts, slot) => {
    if (
      slot.active &&
      slot.color &&
      slot.essenceSource === ESSENCE_SOURCE_INVENTORY
    ) {
      counts[slot.color] = (counts[slot.color] || 0) + 1;
    }
    return counts;
  }, normalizeEssenceInventory());
}

function hasInventoryEssenceSlots(slots = []) {
  return ESSENCE_COLORS.some(color => countInventoryEssencesInSlots(slots)[color] > 0);
}

function bindUniversalEssenceSlot(slot = {}) {
  const color = normalizeColor(slot?.color);
  if (
    slot?.active &&
    color &&
    normalizeEssenceSource(slot?.essenceSource) === ESSENCE_SOURCE_INVENTORY
  ) {
    return {
      ...slot,
      color,
      essenceSource: ESSENCE_SOURCE_LINKED,
      linkedColor: color,
      essenceId: readEssenceInstanceId(slot),
    };
  }

  return { ...slot };
}

function bindUniversalEssenceSlots(slots = []) {
  return getNormalizedConfigSlots({ slots }).map(bindUniversalEssenceSlot);
}

function getEntityEssenceOwnerId(entity = {}) {
  return sanitizeEssenceOwnerId(entity?.id ?? entity?.uid ?? entity?.serial ?? "entity");
}

function createBoundLinkedEssenceItem(entity = {}, color = "", options = {}) {
  const normalizedColor = normalizeColor(color);
  if (!normalizedColor) return null;
  return createLinkedEssenceItem(entity?.id ?? getEntityEssenceOwnerId(entity), normalizedColor, {
    ...options,
    sourceUniversalId: options.sourceUniversalId,
    id: options.id,
    origin: options.origin || "linked-return",
  });
}

function getEntityEssenceInventoryState(entity = {}) {
  if (!entity || typeof entity !== "object") return {};
  entity[ENTITY_LINKED_ESSENCE_INVENTORY_KEY] ??= {};
  return entity[ENTITY_LINKED_ESSENCE_INVENTORY_KEY];
}

function countLinkedItemsByColor(items = []) {
  return (Array.isArray(items) ? items : []).reduce((counts, item) => {
    const color = normalizeColor(item?.color);
    if (color) counts[color] += 1;
    return counts;
  }, normalizeEssenceInventory());
}

function synchronizeLinkedEssenceItemStates(entity = {}, items = []) {
  const refsById = new Map();
  normalizeAttackListForEssenceAccounting(entity).forEach((attack, attackIndex) => {
    const attackKey = getStableAttackEssenceKey(attack, `attack-${attackIndex + 1}`);
    getEssenceurSlotsFromAttack(attack).forEach((slot, slotIndex) => {
      const id = readEssenceInstanceId(slot);
      if (!id || normalizeEssenceSource(slot.essenceSource) !== ESSENCE_SOURCE_LINKED) return;
      refsById.set(id, { attackKey, slotIndex });
    });
  });

  const synchronized = (Array.isArray(items) ? items : []).map(item => {
    const ref = refsById.get(String(item?.id || ""));
    return {
      ...item,
      state: ref ? "socketed" : "available",
      attackKey: ref?.attackKey || "",
      slotIndex: ref ? ref.slotIndex : null,
    };
  });
  getEntityEssenceInventoryState(entity)[ENTITY_BOUND_ESSENCE_ITEMS_KEY] = synchronized;
  return synchronized;
}

function ensureEntityLinkedEssenceItems(entity = {}) {
  ensureEntityEssenceIdentities(entity, normalizeAttackListForEssenceAccounting(entity));
  const items = syncEntityEssenceRewards(entity);
  return synchronizeLinkedEssenceItemStates(entity, items);
}

function getLinkedEssenceDetails(items = []) {
  return items.filter(item => item.provenance?.source === "umbra-level-three").map(item => ({
    ...item.provenance.context,
    rewardId: item.provenance.rewardId,
    id: item.id,
    color: item.color,
    statKey: item.provenance?.umbraStatKey || "",
    label: item.provenance?.umbraStatKey || "",
    count: 1,
    amount: 1,
    provenance: item.provenance,
  }));
}

export function calculateLinkedEssenceTotals(entity = {}) {
  const items = ensureEntityLinkedEssenceItems(entity);
  const totals = countLinkedItemsByColor(items);
  const details = getLinkedEssenceDetails(items);
  return { totals, details, items: items.map(item => ({ ...item })) };
}

export function validateEntityEssenceLedger(entity = {}) {
  const inventoryState = entity?.[ENTITY_LINKED_ESSENCE_INVENTORY_KEY] || {};
  const items = Array.isArray(inventoryState[ENTITY_BOUND_ESSENCE_ITEMS_KEY])
    ? inventoryState[ENTITY_BOUND_ESSENCE_ITEMS_KEY]
    : [];
  const errors = [];
  if (!Array.isArray(inventoryState[ENTITY_BOUND_ESSENCE_ITEMS_KEY])) {
    errors.push({ code: "missing-linked-items" });
  }
  if (String(inventoryState.ownerEntityId) !== String(entity.id)) {
    errors.push({ code: "invalid-ledger-owner" });
  }
  const itemById = new Map();
  const socketRefs = new Map();
  const socketIds = new Set();

  items.forEach(item => {
    const id = String(item?.id || "").trim();
    const color = normalizeColor(item?.color);
    if (!id || !isLinkedEssenceIdForEntity(id, entity?.id)) {
      errors.push({ code: "invalid-linked-id", id, color });
      return;
    }
    if (!color) errors.push({ code: "invalid-linked-color", id });
    if (
      item.type !== "linked" ||
      String(item.ownerEntityId) !== String(entity.id) ||
      String(item.boundTo) !== String(entity.id)
    ) errors.push({ code: "invalid-linked-owner", id });
    if (item.state !== "available" && item.state !== "socketed") {
      errors.push({ code: "invalid-linked-state", id });
    }
    if (itemById.has(id)) errors.push({ code: "duplicate-linked-id", id });
    itemById.set(id, item);
  });

  normalizeAttackListForEssenceAccounting(entity).forEach((attack, attackIndex) => {
    const attackKey = getStableAttackEssenceKey(attack, `attack-${attackIndex + 1}`);
    if (!Array.isArray(attack.essenceSlots) || attack.essenceSlots.length > MAX_ESSENCEUR_SLOTS) {
      errors.push({ code: "invalid-socket-list", attackKey });
      return;
    }
    getEssenceurSlotsFromAttack(attack).forEach((slot, slotIndex) => {
      const rawSlot = attack.essenceSlots[slotIndex];
      if (!rawSlot?.slotId || (rawSlot.color && !normalizeColor(rawSlot.color))) {
        errors.push({ code: "invalid-socket", attackKey, slotIndex });
      }
      const socketId = String(slot?.socketId || "").trim();
      if (!isAttackEssenceSocketIdForEntity(socketId, entity?.id)) {
        errors.push({ code: "invalid-socket-id", socketId, attackKey, slotIndex });
      } else if (socketIds.has(socketId)) {
        errors.push({ code: "duplicate-socket-id", socketId, attackKey, slotIndex });
      } else {
        socketIds.add(socketId);
      }

      if (!slot.color && !readEssenceInstanceId(rawSlot)) {
        return;
      }
      if (normalizeEssenceSource(slot.essenceSource) !== ESSENCE_SOURCE_LINKED) {
        errors.push({ code: "invalid-socket-source", attackKey, slotIndex });
      }
      const id = readEssenceInstanceId(slot);
      const color = readLinkedEssenceColor(slot);
      if (!id) {
        errors.push({ code: "socket-without-id", attackKey, slotIndex });
        return;
      }
      if (socketRefs.has(id)) {
        errors.push({ code: "linked-id-in-multiple-sockets", id, attackKey, slotIndex });
      }
      socketRefs.set(id, { attackKey, slotIndex, color });
      const item = itemById.get(id);
      if (!item) {
        errors.push({ code: "dangling-socket-id", id, attackKey, slotIndex });
      } else if (normalizeColor(item.color) !== color || normalizeColor(item.color) !== slot.color) {
        errors.push({ code: "socket-color-mismatch", id, attackKey, slotIndex });
      }
    });
  });

  items.forEach(item => {
    if (!item || typeof item !== "object") return;
    const ref = socketRefs.get(String(item.id));
    if (item.state === "socketed" && !ref) {
      errors.push({ code: "socketed-item-without-socket", id: item.id });
    }
    if (item.state !== "socketed" && ref) {
      errors.push({ code: "available-item-in-socket", id: item.id });
    }
    if (ref && (item.attackKey !== ref.attackKey || item.slotIndex !== ref.slotIndex)) {
      errors.push({ code: "linked-socket-location-mismatch", id: item.id });
    }
  });

  return {
    ok: errors.length === 0,
    errors,
    itemCount: items.length,
    socketCount: socketRefs.size,
    definedSocketCount: socketIds.size,
  };
}

function getEquippedLinkedEssenceRefs(entity = {}, options = {}) {
  const refs = [];
  const excludedAttackKey = options.excludedAttackKey
    ? String(options.excludedAttackKey)
    : "";
  const excludedSlotIndex = Number.isInteger(options.excludedSlotIndex)
    ? options.excludedSlotIndex
    : null;

  normalizeAttackListForEssenceAccounting(entity).forEach(attack => {
    const attackKey = getAttackAccountingKey(attack);
    const slots = getEssenceurSlotsFromAttack(attack);

    slots.forEach((slot, index) => {
      if (
        excludedAttackKey &&
        attackKey === excludedAttackKey &&
        (excludedSlotIndex === null || excludedSlotIndex === index)
      ) {
        return;
      }

      const color = readLinkedEssenceColor(slot);
      if (
        !color ||
        normalizeEssenceSource(slot.essenceSource) !== ESSENCE_SOURCE_LINKED
      ) {
        return;
      }

      refs.push({
        id: readEssenceInstanceId(slot),
        color,
        attack,
        attackKey,
        slotIndex: index,
        initial: isInitialAttackFamilySlot(slot),
      });
    });
  });

  return refs;
}

export function readEntityLinkedEssenceItems(entity = {}) {
  return ensureEntityLinkedEssenceItems(entity).map(item => ({ ...item }));
}

export function syncEntityLinkedEssenceInventory(entity = {}) {
  const result = calculateLinkedEssenceTotals(entity);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("linkedEssenceInventoryUpdated", {
      detail: {
        entityId: entity.id ?? null,
        inventory: { ...result.totals },
        details: result.details,
      },
    }));
  }
  return result;
}

function normalizeAttackListForEssenceAccounting(entity = {}) {
  const raw = entity?.attackDetails;
  if (Array.isArray(raw)) return raw.filter(attack => attack && typeof attack === "object");
  if (raw && typeof raw === "object") {
    return Object.values(raw).filter(attack => attack && typeof attack === "object");
  }
  return [];
}

function getStableAttackEssenceKey(attack = {}, fallback = "") {
  return String(
    attack?.entityAttackId ||
    readAttackDefinitionKey(attack) ||
    attack?.attackKey ||
    attack?.templateKey ||
    attack?.functionName ||
    fallback ||
    "attack"
  );
}

function findEntityAttackByEssenceKey(entity = {}, attackKey = "") {
  const wantedKey = String(attackKey || "");
  if (!wantedKey) return null;
  const attacks = normalizeAttackListForEssenceAccounting(entity);
  const instance = attacks.find(attack => attack.entityAttackId === wantedKey);
  if (instance) return instance;
  const matches = attacks.filter(attack => (
    readAttackDefinitionKey(attack) === wantedKey ||
    attack.attackKey === wantedKey ||
    attack.templateKey === wantedKey ||
    attack.functionName === wantedKey
  ));
  return matches.length === 1 ? matches[0] : null;
}

function getAttackAccountingKey(attack = {}) {
  return getStableAttackEssenceKey(attack);
}

export function calculateEntityLinkedEssenceAvailability(entity = {}) {
  const linkedTotals = calculateLinkedEssenceTotals(entity);
  const availableItems = linkedTotals.items.filter(item => item.state === "available");
  const equippedItems = linkedTotals.items.filter(item => item.state === "socketed");
  const availableItemsByColor = Object.fromEntries(
    ESSENCE_COLORS.map(color => [color, availableItems.filter(item => item.color === color)])
  );
  return {
    available: countLinkedItemsByColor(availableItems),
    availableItems,
    availableItemsByColor,
    total: linkedTotals.totals,
    equipped: countLinkedItemsByColor(equippedItems),
    equippedRefs: getEquippedLinkedEssenceRefs(entity),
    details: linkedTotals.details,
  };
}

export function getAttackEssenceAvailabilityForSlot(entity = {}, attack = {}, slotIndex = 0) {
  const linkedInventory = calculateEntityLinkedEssenceAvailability(entity);
  const slots = getEssenceurSlotsFromAttack(attack);
  const normalizedSlotIndex = Math.max(0, Math.floor(Number(slotIndex) || 0));
  const currentSlot = slots[normalizedSlotIndex] || null;
  const universalItems = loadUniversalEssenceItems();
  const universal = countUniversalEssenceItems(universalItems);

  return {
    linked: linkedInventory.available,
    availableItems: linkedInventory.availableItems,
    availableItemsByColor: linkedInventory.availableItemsByColor,
    universal,
    universalItems,
    linkedTotals: linkedInventory.total,
    linkedEquipped: linkedInventory.equipped,
    linkedDetails: linkedInventory.details,
    currentSlot,
    canClearCurrentSlot: canClearEssenceSlot({ slots }, normalizedSlotIndex),
  };
}

function sameEssenceSlot(left = {}, right = {}) {
  return ["socketId", "slotId", "kind", "locked", "source", "unlockId", "active", "color", "essenceSource", "essenceId"]
    .every(key => left[key] === right[key]);
}

export function previewAttackEssenceEquipTransaction({
  entity = {},
  attackKey = "",
  previousSlots = [],
  nextSlots = [],
  stagedNextSlots = nextSlots,
} = {}) {
  const reject = message => ({ ok: false, message });
  const targetAttack = findEntityAttackByEssenceKey(entity, attackKey);
  if (!targetAttack) return reject("Entite ou attaque introuvable.");
  const audit = validateEntityEssenceLedger(entity);
  if (!audit.ok) return reject(`Registre d'essences invalide : ${audit.errors.map(error => error.code).join(", ")}`);

  const actual = getEssenceurSlotsFromAttack(targetAttack);
  if (
    !Array.isArray(previousSlots) || !Array.isArray(stagedNextSlots) ||
    previousSlots.length !== actual.length || stagedNextSlots.length !== actual.length ||
    !actual.length || actual.length > MAX_ESSENCEUR_SLOTS
  ) return reject("Les chasses de l'attaque ont change.");
  const previous = getNormalizedConfigSlots({ slots: previousSlots });
  const staged = getNormalizedConfigSlots({ slots: stagedNextSlots });
  if (actual.some((slot, index) => !sameEssenceSlot(slot, previous[index]))) {
    return reject("L'attaque a change depuis la selection.");
  }

  const items = entity[ENTITY_LINKED_ESSENCE_INVENTORY_KEY][ENTITY_BOUND_ESSENCE_ITEMS_KEY];
  const itemById = new Map(items.map(item => [item.id, item]));
  const universalItems = loadUniversalEssenceItems();
  if (!validateUniversalEssenceItems(universalItems).ok) return reject("Inventaire universel invalide.");
  const universalById = new Map(universalItems.map(item => [item.id, item]));
  const equippedElsewhere = new Set();
  normalizeAttackListForEssenceAccounting(entity).forEach(attack => {
    if (attack === targetAttack) return;
    getEssenceurSlotsFromAttack(attack).forEach(slot => {
      if (slot.essenceId) equippedElsewhere.add(slot.essenceId);
    });
  });

  const usedIds = new Set();
  const bindings = [];
  const finalNextSlots = [];
  const universalMissing = normalizeEssenceInventory();
  const linkedMissing = normalizeEssenceInventory();
  for (let index = 0; index < staged.length; index += 1) {
    const slot = staged[index];
    const original = actual[index];
    if (["socketId", "slotId", "kind", "locked", "source", "unlockId"].some(key => slot[key] !== original[key])) {
      return reject("Le sertissage ne peut pas modifier les chasses.");
    }
    if (original.locked && !sameEssenceSlot(original, slot)) return reject("Cette chasse est verrouillee.");
    const rawSlot = stagedNextSlots[index];
    if (rawSlot?.color && !normalizeColor(rawSlot.color)) return reject("Couleur d'essence invalide.");
    if (!slot.color) {
      if (readEssenceInstanceId(rawSlot) || rawSlot?.color) return reject("Une chasse vide ne peut pas referencer une essence.");
      finalNextSlots.push({
        ...targetAttack.essenceSlots[index],
        active: false, color: "", linkedColor: "", essenceSource: "", essenceId: "", hyperco: false,
      });
      continue;
    }

    const id = readEssenceInstanceId(slot);
    if (!id || usedIds.has(id)) return reject("Chaque essence doit avoir un ID unique et possede.");
    usedIds.add(id);
    const source = normalizeEssenceSource(slot.essenceSource);
    if (source === ESSENCE_SOURCE_INVENTORY) {
      const universalItem = universalById.get(id);
      if (!universalItem || universalItem.color !== slot.color || universalItem.state !== "available") {
        universalMissing[slot.color] += 1;
        continue;
      }
      // Allocate a new owned object; the universal's original provenance stays intact.
      const linkedItem = createBoundLinkedEssenceItem(entity, slot.color, {
        origin: "universal-binding",
        provenance: {
          ...universalItem.provenance,
          origin: "universal-binding",
          parentUniversalId: id,
          conversion: "universal-binding",
          sourceContext: universalItem.provenance?.context,
          context: {
            entityId: entity.id,
            attackKey: getStableAttackEssenceKey(targetAttack),
            entityAttackId: targetAttack.entityAttackId,
            socketId: original.socketId,
            slotId: original.slotId,
          },
        },
        provenanceSource: universalItem.provenance?.source,
        parentUniversalId: id,
        sourceProvenanceContext: universalItem.provenance?.context,
        provenanceConversion: "universal-binding",
        refreshProvenanceLine: true,
        provenanceContext: {
          entityId: entity.id,
          attackKey: getStableAttackEssenceKey(targetAttack),
          entityAttackId: targetAttack.entityAttackId,
          socketId: original.socketId,
          slotId: original.slotId,
        },
      });
      linkedItem.sourceUniversalId = id;
      if (itemById.has(linkedItem.id) || bindings.some(binding => binding.linkedItem.id === linkedItem.id)) {
        return reject("ID d'essence deja utilise.");
      }
      bindings.push({ slotIndex: index, color: slot.color, universalId: id, linkedId: linkedItem.id, linkedItem });
      finalNextSlots.push({
        ...targetAttack.essenceSlots[index],
        active: slot.active, color: slot.color, linkedColor: slot.color,
        essenceSource: ESSENCE_SOURCE_LINKED, essenceId: linkedItem.id,
        hyperco: false,
      });
    } else if (source === ESSENCE_SOURCE_LINKED) {
      const item = itemById.get(id);
      if (!item || item.color !== slot.color || equippedElsewhere.has(id)) {
        linkedMissing[slot.color] += 1;
        continue;
      }
      finalNextSlots.push({
        ...targetAttack.essenceSlots[index],
        active: slot.active, color: slot.color, linkedColor: slot.color,
        essenceSource: ESSENCE_SOURCE_LINKED, essenceId: id,
        hyperco: item.hyperco === true,
      });
    } else {
      return reject("Source d'essence invalide.");
    }
  }

  if (ESSENCE_COLORS.some(color => universalMissing[color] || linkedMissing[color])) {
    return {
      ok: false,
      message: "Essence absente, deja equipee ou de couleur incorrecte.",
      universal: { missing: universalMissing },
      linked: { missing: linkedMissing },
    };
  }

  const nextItems = [...items, ...bindings.map(binding => binding.linkedItem)];
  const refs = new Map();
  const nextAttacks = normalizeAttackListForEssenceAccounting(entity).map(attack => (
    attack === targetAttack ? { ...attack, essenceSlots: finalNextSlots } : attack
  ));
  nextAttacks.forEach(attack => getEssenceurSlotsFromAttack(attack).forEach((slot, slotIndex) => {
    if (slot.essenceId) refs.set(slot.essenceId, { attackKey: getStableAttackEssenceKey(attack), slotIndex });
  }));
  const finalItems = nextItems.map(item => ({
    ...item,
    state: refs.has(item.id) ? "socketed" : "available",
    attackKey: refs.get(item.id)?.attackKey || "",
    slotIndex: refs.get(item.id)?.slotIndex ?? null,
  }));
  const integrity = validateEntityEssenceLedger({
    ...entity,
    attackDetails: nextAttacks,
    [ENTITY_LINKED_ESSENCE_INVENTORY_KEY]: {
      ...entity[ENTITY_LINKED_ESSENCE_INVENTORY_KEY],
      [ENTITY_BOUND_ESSENCE_ITEMS_KEY]: finalItems,
    },
  });
  if (!integrity.ok) return reject(`Sertissage invalide : ${integrity.errors.map(error => error.code).join(", ")}`);
  const consumedIds = bindings.map(binding => binding.universalId);
  const remainingUniversalItems = universalItems.filter(item => !consumedIds.includes(item.id));
  const added = countLinkedItemsByColor(bindings.map(binding => binding.linkedItem));
  return {
    ok: true,
    finalNextSlots,
    finalItems,
    remainingUniversalItems,
    integrity,
    universal: {
      before: countUniversalEssenceItems(universalItems),
      after: countUniversalEssenceItems(remainingUniversalItems),
      missing: universalMissing,
      bindings,
      consumedIds,
    },
    universalBindings: { added, total: added },
    linked: {
      total: countLinkedItemsByColor(items),
      details: getLinkedEssenceDetails(items),
      after: countLinkedItemsByColor(finalItems.filter(item => item.state === "available")),
      missing: linkedMissing,
    },
  };
}

export function commitAttackEssenceEquipTransaction(args = {}) {
  if (!requireSafeMenuAccess()) return { ok: false, message: 'Une menace est proche.' };
  // Revalidate current IDs and sockets, including after an asynchronous UI confirmation.
  const transaction = previewAttackEssenceEquipTransaction(args);
  if (!transaction.ok) return transaction;
  const targetAttack = findEntityAttackByEssenceKey(args.entity, args.attackKey);
  const finalIds = new Set(transaction.finalNextSlots.filter(slot => slot.active).map(slot => slot.essenceId));
  const returnedIds = new Set(getEssenceurSlotsFromAttack(targetAttack)
    .filter(slot => slot.active && !finalIds.has(slot.essenceId)).map(slot => slot.essenceId));
  const returnedItems = transaction.finalItems.filter(item => returnedIds.has(item.id));
  const boundIds = new Set(transaction.universal.bindings.map(binding => binding.linkedId));
  const universalBoundItems = transaction.finalItems.filter(item => boundIds.has(item.id));
  const universalStore = {
    schemaVersion: getEssenceLedgerSchemaVersion(),
    universalItems: transaction.remainingUniversalItems,
  };

  // Persist the validated universal debit before publishing in-memory changes or events.
  if (transaction.universal.consumedIds.length) {
    try {
      saveUniversalEssenceStore(universalStore, { notify: false });
    } catch (error) {
      return { ok: false, message: error?.message || "Sauvegarde des essences impossible.", error };
    }
  }
  targetAttack.essenceSlots = transaction.finalNextSlots;
  args.entity[ENTITY_LINKED_ESSENCE_INVENTORY_KEY][ENTITY_BOUND_ESSENCE_ITEMS_KEY] = transaction.finalItems;
  appendEntityEssenceHistory(args.entity, {
    transactionId: createEssenceTransactionId(),
    action: universalBoundItems.length ? "bind-universal" : "move-linked",
    attackKey: getStableAttackEssenceKey(targetAttack),
    returnedEssenceIds: returnedItems.map(item => item.id),
    boundUniversalIds: transaction.universal.consumedIds,
    socketedEssenceIds: [...finalIds],
  });
  if (transaction.universal.consumedIds.length) notifyUniversalEssenceInventory(universalStore, "bind-universal");
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("linkedEssenceInventoryUpdated", {
      detail: {
        entityId: args.entity.id,
        inventory: countLinkedItemsByColor(transaction.finalItems),
        reason: "equip",
      },
    }));
  }
  return {
    ...transaction,
    linkedReturned: countLinkedItemsByColor(returnedItems),
    linkedReturnedItems: returnedItems,
    universalBoundItems,
    attack: targetAttack,
  };
}

function getEntityStatValue(entity, key) {
  return Number(
    entity?.stats?.[key]
    ?? entity?.modifierStats?.[key]
    ?? entity?.baseStats?.[key]
    ?? entity?.[key]
    ?? 0
  ) || 0;
}

function getAttackDisplayLabel(attack = {}, index = 0) {
  const label = String(
    attack.displayName ||
    attack.name ||
    attack.functionName ||
    attack.attackKey ||
    attack.attackId ||
    `Attaque ${index + 1}`
  ).trim();

  return label || `Attaque ${index + 1}`;
}

function getEntityDisplayLabel(entity = {}, index = 0) {
  const label = String(
    entity.nickname ||
    entity.name ||
    entity.class ||
    `Entite ${index + 1}`
  ).trim();
  const id = entity.id ?? entity.uid ?? entity.serial ?? "";
  return id !== "" ? `${label} #${id}` : label;
}

function getEntityEssenceOwnerLabel(entity = {}) {
  return String(entity?.nickname || entity?.name || entity?.class || "").trim();
}

export function getEssenceurSlotsFromAttack(attack = {}, maxSlots = MAX_ESSENCEUR_SLOTS) {
  return getNormalizedConfigSlots({ slots: attack.essenceSlots || [] }, maxSlots);
}

export function getEssenceurConfigFromAttack(attack = {}, entity = null, options = {}) {
  const range = normalizeRange(
    Array.isArray(attack?.attackRange)
      ? attack.attackRange[0]
      : attack?.attackRange
  );

  const slots = getEssenceurSlotsFromAttack(attack, options.maxSlots || MAX_ESSENCEUR_SLOTS);

  return {
    attackKey: readAttackDefinitionKey(attack),
    attackLabel: getAttackDisplayLabel(attack),
    slots,
    initialSlots: slots,
    range,
    initialRange: range,
  };
}

export function resolveAttackNatureFromEssenceurConfig(config = {}, fallbackNature = []) {
  const activeColors = getActiveEssenceColorsFromConfig(config);
  if (!activeColors.length) {
    return ['inerte'];
  }

  const hasRed = activeColors.includes(ATTACK_ESSENCE_COLORS.RED);
  const hasBlue = activeColors.includes(ATTACK_ESSENCE_COLORS.BLUE);
  const hasYellow = activeColors.includes(ATTACK_ESSENCE_COLORS.YELLOW);

  if (hasRed && hasBlue) {
    return hasYellow ? ["hybridalDamage", "piercingDamage"] : ["hybridalDamage"];
  }
  if (hasRed) {
    return hasYellow ? ["physicalDamage", "piercingDamage"] : ["physicalDamage"];
  }
  if (hasBlue) {
    return hasYellow ? ["magicalDamage", "piercingDamage"] : ["magicalDamage"];
  }
  if (hasYellow) return ["piercingDamage"];

  return normalizeAttackNatureList(fallbackNature);
}

export function buildAttackEssencePatch(config = {}, baseAttack = {}) {
  const slots = getNormalizedConfigSlots(config).map((slot, index) => {
    const color = slot.color || null;
    const essenceSource = normalizeEssenceSource(slot.essenceSource);
    return {
      ...slot,
      slotId: slot.slotId || `slot-${index + 1}`,
      socketId: slot.socketId || "",
      kind: slot.kind || "open",
      locked: Boolean(slot.locked),
      active: Boolean(slot.active && color),
      color,
      source: slot.source || ATTACK_ESSENCE_SLOT_SOURCES.CONFIGURED,
      essenceSource: color ? essenceSource || ESSENCE_SOURCE_INVENTORY : "",
      linkedColor: color && essenceSource === ESSENCE_SOURCE_LINKED
        ? color
        : color
          ? slot.linkedColor || ""
          : "",
      essenceId: color ? readEssenceInstanceId(slot) : "",
      ...(slot.unlockId ? { unlockId: slot.unlockId } : {}),
    };
  });
  const essences = slots.filter(slot => slot.active).map(slot => normalizeColor(slot.color)).filter(Boolean);

  return {
    essenceSlots: slots,
    essenceSlotCount: slots.length,
    essences,
    attackRange: [normalizeRange(
      config.range
      ?? (Array.isArray(baseAttack?.attackRange) ? baseAttack.attackRange[0] : baseAttack?.attackRange)
    )],
    attacknature: resolveAttackNatureFromEssenceurConfig(
      { ...config, slots },
      baseAttack?.attacknature
    ),
  };
}

function bindUniversalPatchEssences(patch = {}) {
  return {
    ...patch,
    essenceSlots: bindUniversalEssenceSlots(patch.essenceSlots || []),
  };
}

export function buildAttackEssenceSocketPatch(
  attack = {},
  slotIndex = 0,
  color = "",
  essenceSource = ESSENCE_SOURCE_INVENTORY,
  entity = null,
  essenceId = ""
) {
  const config = getEssenceurConfigFromAttack(attack, entity);
  const previousSlots = getNormalizedConfigSlots(config);
  const slots = bindUniversalEssenceSlots(previousSlots);
  const index = Math.max(0, Math.floor(Number(slotIndex) || 0));
  const currentSlot = slots[index];
  if (!currentSlot || currentSlot.locked) return null;

  const source = normalizeEssenceSource(essenceSource);
  const requestedColor = normalizeColor(color);
  const nextColor = requestedColor;
  const requestedEssenceId = String(essenceId || "").trim();

  if (!nextColor && !canClearEssenceSlot({ slots }, index)) {
    return {
      ok: false,
      message: "Cette chasse ne peut pas être vidée.",
    };
  }

  slots[index] = {
    ...currentSlot,
    active: Boolean(nextColor),
    color: nextColor || "",
    essenceSource: nextColor
      ? source || ESSENCE_SOURCE_INVENTORY
      : "",
    linkedColor: nextColor && (
      source === ESSENCE_SOURCE_LINKED ||
      source === ESSENCE_SOURCE_INVENTORY
    )
      ? nextColor
      : "",
    essenceId: nextColor
      ? requestedEssenceId ||
        (
          normalizeColor(currentSlot.color) === nextColor &&
          source === normalizeEssenceSource(currentSlot.essenceSource)
            ? readEssenceInstanceId(currentSlot)
            : ""
        )
      : "",
  };

  const nextConfig = { ...config, slots };
  const stagedPatch = buildAttackEssencePatch(nextConfig, attack);
  const patch = bindUniversalPatchEssences(stagedPatch);

  return {
    attackKey: readAttackDefinitionKey(attack),
    index,
    previousEssenceSlots: previousSlots.map(slot => ({ ...slot })),
    stagedNextEssenceSlots: stagedPatch.essenceSlots || [],
    nextEssenceSlots: patch.essenceSlots || [],
    patch,
    state: nextConfig,
    preview: calculateEssenceurPreview(nextConfig),
  };
}

export function createEssenceurTargetOptions(entities = [], catalog = []) {
  return (Array.isArray(entities) ? entities : [])
    .map((entity, entityIndex) => {
      const attacks = ensureEntityAttackInstances(entity, catalog)
        .map((attack, attackIndex) => ({
          attackKey: readAttackDefinitionKey(attack),
          label: getAttackDisplayLabel(attack, attackIndex),
          attack,
        }))
        .filter(option => option.attackKey);

      return {
        entityId: String(entity?.id ?? entity?.uid ?? entity?.serial ?? entityIndex),
        label: getEntityDisplayLabel(entity, entityIndex),
        entity,
        attacks,
      };
    })
    .filter(target => target.attacks.length > 0);
}

export function getAttackEssenceSocketViewModel(attack = {}, maxSlots = MAX_ESSENCEUR_SLOTS) {
  return getEssenceurSlotsFromAttack(attack, maxSlots).map((slot, index) => {
    const color = normalizeColor(slot.color);
    return {
      arrayIndex: index,
      index: index + 1,
      slotId: slot.slotId || `slot-${index + 1}`,
      socketId: slot.socketId || "",
      kind: slot.kind || "open",
      locked: Boolean(slot.locked),
      active: Boolean(slot.active && color),
      color,
      source: slot.source || "configured",
      essenceSource: slot.essenceSource || "",
      linkedColor: readLinkedEssenceColor(slot),
      essenceId: readEssenceInstanceId(slot),
      label: color ? COLOR_LABELS[color] || color : "Vide",
      hyperco: slot.hyperco === true,
    };
  });
}

export function getEssenceItemDefinition(color = "") {
  return ESSENCE_ITEM_DEFINITIONS[normalizeColor(color)] || {
    name: "Essence inconnue",
    infusedLabel: "inconnue",
    type: "Essence",
    statKey: "attackEssenceUnknown",
    spriteClass: "miss-shot",
    quality: 4,
    qualityLabel: "Épique",
    qualityColor: "#c000ff",
    attributeLabel: "Inconnue",
    attackNatureLabel: "inconnue",
    attackNatureClass: "neutral",
  };
}

function escapeEssenceHTML(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeEssenceAttribute(value = "") {
  return escapeEssenceHTML(value).replace(/`/g, "&#96;");
}

export function getUniversalEssenceHelperClass(color = "") {
  const normalizedColor = normalizeColor(color);
  return `essence-universal-hover ${normalizedColor || "unknown"}`;
}

export function getLinkedEssenceHelperClass(color = "") {
  const normalizedColor = normalizeColor(color);
  return `essence-linked-hover ${normalizedColor || "unknown"}`;
}

export { createUniversalEssenceAmbianceHTML } from "../data/helpers.js";





export function createUniversalEssenceHelperHTML(color = "") {
  const normalizedColor = normalizeColor(color);
  return renderUniversalEssenceHelperHTML(normalizedColor, getEssenceItemDefinition(normalizedColor));
}

export function createLinkedEssenceHelperHTML(color = "", options = {}) {
  const normalizedColor = normalizeColor(color);
  return renderLinkedEssenceHelperHTML(normalizedColor, getEssenceItemDefinition(normalizedColor), options, LINKED_ESSENCE_QUALITY);
}

export function createEssenceSpriteHTML(colorOrDefinition = "", options = {}) {
  bindEssenceSpriteFallback();

  const definition = typeof colorOrDefinition === "string"
    ? getEssenceItemDefinition(colorOrDefinition)
    : colorOrDefinition || getEssenceItemDefinition("");
  const isEmpty = options.empty === true;
  const isMini = options.mini === true;
  const spriteClass = isEmpty ? "empty" : definition.spriteClass;
  const spriteSources = ESSENCE_SPRITE_SOURCES[spriteClass] || ESSENCE_SPRITE_SOURCES.default;
  const spriteRootClass = `essence-item-sprite${isEmpty ? " empty" : ""}${isMini ? " mini" : ""}`;

  if (isEmpty) {
    return `
      <div class="${spriteRootClass}" aria-hidden="true">
        <div class="essence-item-sprite-nature empty"></div>
      </div>
    `;
  }

  const backSrc = isMini ? (spriteSources.backMin || spriteSources.back) : spriteSources.back;
  const frontSrc = isMini ? (spriteSources.frontMin || spriteSources.front) : spriteSources.front;
  const backFallback = spriteSources.backMin && spriteSources.backMin !== backSrc ? spriteSources.backMin : "";
  const frontFallback = spriteSources.frontMin && spriteSources.frontMin !== frontSrc ? spriteSources.frontMin : "";
  const universalExtraLayer = options.universal === true && !isMini
    ? `<img src="${spriteSources.frontMin || frontSrc}" class="essence-item-sprite-img ${spriteSources.frontClass} essence-universal-extra-layer" data-fallback-src="${frontFallback}" alt="" style="animation: essenceSpriteBackPulse 5s ease-in-out infinite, essenceSpriteBackSpin 10s linear infinite;">`
    : "";

  return `
    <div class="${spriteRootClass}" aria-hidden="true">
      <div class="essence-item-sprite-nature ${spriteClass}${options.hyperco ? ' hyperco' : ''}">
        <img src="${backSrc}" class="essence-item-sprite-img ${spriteSources.backClass}" data-fallback-src="${backFallback}" alt="">
        ${isMini ? "" : `<img src="${frontSrc}" class="essence-item-sprite-img ${spriteSources.frontClass}" data-fallback-src="${frontFallback}" alt="">`}
        ${universalExtraLayer}
      </div>
    </div>
  `;
}

function createMilestoneEssenceElement(color = "") {
  const rewardColor = normalizeColor(color);
  const orb = document.createElement("div");
  orb.className = `milestone-essence essence-item-card linked ${rewardColor || "yellow"}${rewardColor ? "" : " neutral-essence"}`;
  orb.innerHTML = createEssenceSpriteHTML(rewardColor || "yellow", { mini: true });

  // Independent periods and starting phases keep the spheres from moving in unison.
  const motions = [
    ["float", 5500, 8000],
    ["front-pulse", 12000, 18000],
    ["front-spin", 28000, 42000],
    ["back-pulse", 14000, 20000],
    ["back-spin", 42000, 60000],
  ];
  motions.forEach(([name, min, max]) => {
    const duration = min + Math.random() * (max - min);
    orb.style.setProperty(`--essence-${name}-duration`, `${duration}ms`);
    orb.style.setProperty(`--essence-${name}-delay`, `${-Math.random() * duration}ms`);
  });
  return orb;
}

export function updateMilestoneEssenceElement(milestone, color = "") {
  const existing = milestone.querySelector('.milestone-essence');
  if (!existing) {
    const orb = createMilestoneEssenceElement(color);
    milestone.appendChild(orb);
    return orb;
  }

  const rewardColor = normalizeColor(color);
  existing.className = `milestone-essence essence-item-card linked ${rewardColor || "yellow"}${rewardColor ? "" : " neutral-essence"}`;
  const { spriteClass } = getEssenceItemDefinition(rewardColor || "yellow");
  const sources = ESSENCE_SPRITE_SOURCES[spriteClass] || ESSENCE_SPRITE_SOURCES.default;
  existing.querySelector('.essence-item-sprite-nature').className = `essence-item-sprite-nature ${spriteClass}`;
  const image = existing.querySelector('img');
  const src = sources.backMin || sources.back;
  if (image.getAttribute('src') !== src) image.src = src;
  image.className = `essence-item-sprite-img ${sources.backClass}`;
  return existing;
}

function bindEssenceSpriteFallback() {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  if (window.__essenceSpriteFallbackBound === true) return;

  window.__essenceSpriteFallbackBound = true;
  document.addEventListener("error", event => {
    const img = event.target;
    if (!(img instanceof HTMLImageElement)) return;
    if (!img.classList.contains("essence-item-sprite-img")) return;

    const fallbackSrc = String(img.dataset.fallbackSrc || "").trim();
    if (!fallbackSrc) return;

    img.dataset.fallbackSrc = "";
    img.src = fallbackSrc;
  }, true);
}

function getAttackEssenceSocketGridPosition(index = 0) {
  const safeIndex = Math.max(0, Math.floor(Number(index) || 0));
  return ATTACK_ESSENCE_SOCKET_GRID_POSITIONS[safeIndex]
    || ATTACK_ESSENCE_SOCKET_GRID_POSITIONS[ATTACK_ESSENCE_SOCKET_GRID_POSITIONS.length - 1]
    || { column: 3, row: 1 };
}

function createEssenceItemInnerHTML(color = "", count = 0, options = {}) {
  const definition = getEssenceItemDefinition(color);
  const displayName = options.universal === true
    ? definition.universalName || definition.name
    : definition.name;
  const displayType = options.universal === true
    ? "Essence universelle"
    : definition.type;
  const countAttribute = options.countAttribute
    ? ` ${options.countAttribute}="${normalizeColor(color)}"`
    : "";
  const actionHTML = options.actionHTML || "";
  const countHTML = options.showCount === false
    ? ""
    : `<strong class="essence-item-count"${countAttribute}>${Math.max(0, count)}</strong>`;

  return `
    ${createEssenceSpriteHTML(definition, { universal: options.universal === true })}
    <span class="essence-item-text">
      <span class="essence-item-name">${displayName}</span>
      <span class="essence-item-type">${displayType}</span>
    </span>
    ${countHTML}
    ${actionHTML}
  `;
}

function createPopupEquippedEssenceElement(color = "", options = {}) {
  const normalizedColor = normalizeColor(color);
  const definition = getEssenceItemDefinition(normalizedColor);
  const normalizedSource = normalizeEssenceSource(options.source || "");
  const sourceClass = normalizedSource === ESSENCE_SOURCE_INVENTORY
    ? " universal"
    : normalizedSource === ESSENCE_SOURCE_LINKED
      ? " linked"
      : "";
  const infusedLabelHTML = normalizedColor
    ? `
      <div class="picto-stat ${definition.spriteClass}" aria-hidden="true"></div>
      <span class="attack-essence-equipped-name ${definition.spriteClass}${options.hyperco ? ' hyperco' : ''}">${definition.infusedLabel}${options.hyperco ? ' Hypercognitive' : ''}</span>
    `
    : `<span class="attack-essence-equipped-name is-empty">vide</span>`;
  const root = document.createElement("div");
  root.className = normalizedColor
    ? `attack-essence-popup-equipped ${normalizedColor}${sourceClass}${options.hyperco ? ' hyperco' : ''}`
    : "attack-essence-popup-equipped is-empty";

  root.innerHTML = `
    <div class="attack-essence-popup-head">
      <span>Chasse ${Math.max(1, Number(options.slotIndex) || 1)}</span>
      <button type="button" class="attack-essence-popup-close" aria-label="Fermer">x</button>
    </div>
    <div class="attack-essence-equipped-orb">
      ${createEssenceSpriteHTML(definition, {
        empty: !normalizedColor,
        universal: false,
        hyperco: options.hyperco,
      })}
    </div>
    <div class="attack-essence-equipped-label">
      Essence infusée : ${infusedLabelHTML}
    </div>
    <div class="separation-line golden attack-essence-popup-separator"></div>
  `;

  const context = document.createElement("div");
  context.className = "attack-essence-popup-context";
  const ownerName = document.createElement("span");
  ownerName.className = "attack-essence-popup-owner";
  ownerName.textContent = `Propriétaire : ${options.entityName || getEntityEssenceOwnerLabel(options.entity) || "Inconnu"}`;
  const attackName = document.createElement("span");
  attackName.className = "attack-essence-popup-attack";
  attackName.textContent = `Attaque : ${options.attackName || getAttackDisplayLabel(options.attack)}`;
  context.append(ownerName, attackName);
  root.querySelector(".attack-essence-popup-head").after(context);

  const helperTarget = root.querySelector('.essence-item-sprite');
  if (normalizedColor) {
    helperTarget.dataset.stat = definition.statKey;
    helperTarget.dataset.hover = "true";
    if (normalizedSource === ESSENCE_SOURCE_INVENTORY) {
      helperTarget.dataset.helperText = createUniversalEssenceHelperHTML(normalizedColor);
      helperTarget.dataset.helperAmbiance = createUniversalEssenceAmbianceHTML(normalizedColor);
      helperTarget.dataset.helperClass = getUniversalEssenceHelperClass(normalizedColor);
    } else if (normalizedSource === ESSENCE_SOURCE_LINKED) {
      helperTarget.dataset.helperText = createLinkedEssenceHelperHTML(normalizedColor, {
        hyperco: options.hyperco,
        entityName: options.entityName || (options.entity ? getEntityEssenceOwnerLabel(options.entity) : ""),
        attackName: options.attackName || (options.attack ? getAttackDisplayLabel(options.attack) : ""),
        slot: options.slotIndex,
        used: true,
      });
      helperTarget.dataset.helperClass = getLinkedEssenceHelperClass(normalizedColor);
    }
  } else {
    helperTarget.dataset.stat = EMPTY_ESSENCE_HELPER_STAT;
    helperTarget.dataset.hover = "true";
  }

  return root;
}

let attackEssencePopupCloseSuppressionDepth = 0;

function invalidateEssenceHoverHelpers() {
  if (typeof document === "undefined") return;
  document.dispatchEvent(new CustomEvent("essenceHoverHelpersInvalidated"));
}

export function preserveAttackEssenceSocketPopups(callback) {
  attackEssencePopupCloseSuppressionDepth += 1;
  try {
    return typeof callback === "function" ? callback() : undefined;
  } finally {
    attackEssencePopupCloseSuppressionDepth = Math.max(
      0,
      attackEssencePopupCloseSuppressionDepth - 1
    );
  }
}

export function closeAttackEssenceSocketPopups() {
  if (typeof document === "undefined") return;
  if (attackEssencePopupCloseSuppressionDepth > 0) return;
  invalidateEssenceHoverHelpers();
  document.querySelectorAll(".attack-essence-popup").forEach(popup => {
    if (typeof popup._attackEssenceCleanup === "function") {
      popup._attackEssenceCleanup();
    }
    popup.remove();
  });
  document.querySelectorAll(".attack-essence-popup-backdrop").forEach(backdrop => backdrop.remove());
}

function positionAttackEssencePopup(popup, anchor) {
  if (!popup || !anchor?.getBoundingClientRect) return;

  const rect = overlayRect(popup, anchor);
  const bounds = overlayBounds(popup);
  const margin = 8;
  const width = Math.min(520, Math.max(240, bounds.right - margin * 2));
  popup.style.width = `${width}px`;

  let left = rect.left + rect.width / 2 - width / 2;
  left = Math.max(margin, Math.min(left, bounds.right - width - margin));

  popup.style.left = `${left}px`;
  popup.style.top = `${Math.min(rect.bottom + margin, bounds.bottom - margin)}px`;

  requestAnimationFrame(() => {
    const popupRect = overlayRect(popup, popup);
    if (popupRect.bottom <= bounds.bottom - margin) return;
    const top = Math.max(margin, rect.top - popupRect.height - margin);
    popup.style.top = `${top}px`;
  });
}

function createPopupEssenceButton({ color, source, index = 0, label, entity, essenceId = "", origin = "" }) {
  const hyperco = entity?.attackEssenceInventory?.linkedItems?.some(item => item.id === essenceId && item.hyperco) === true;
  const definition = getEssenceItemDefinition(color);
  const normalizedSource = normalizeEssenceSource(source);
  const isUniversal = normalizedSource === ESSENCE_SOURCE_INVENTORY;
  const qualityClass = isUniversal
    ? `quality-${Math.max(0, Number(definition.quality) || 4)}`
    : `quality-${LINKED_ESSENCE_QUALITY.quality}`;
  const displayName = hyperco ? 'Intelligence Hypercognitive' : isUniversal
    ? definition.universalName || definition.name
    : definition.name;
  const button = document.createElement("button");
  button.type = "button";
  button.className = `attack-essence-popup-token essence-item-card ${isUniversal ? "universal" : "linked"} ${qualityClass} ${color}`;
  button.classList.toggle('hyperco', hyperco);
  button.dataset.essencePopupColor = color;
  button.dataset.essencePopupSource = source;
  button.dataset.essencePopupIndex = String(index);
  button.dataset.essenceId = String(essenceId || "").trim();
  button.dataset.essenceOrigin = String(origin || "").trim();
  button.dataset.essenceAvailable = "true";
  button.dataset.stat = definition.statKey;
  button.dataset.hover = "true";
  button.setAttribute("aria-disabled", "false");
  button.setAttribute("aria-label", `${label || displayName} disponible`);
  if (isUniversal) {
    button.dataset.helperText = createUniversalEssenceHelperHTML(color);
    button.dataset.helperAmbiance = createUniversalEssenceAmbianceHTML(color);
    button.dataset.helperClass = getUniversalEssenceHelperClass(color);
  } else if (normalizedSource === ESSENCE_SOURCE_LINKED) {
    button.dataset.helperText = createLinkedEssenceHelperHTML(color, {
      hyperco,
      entityName: entity ? getEntityEssenceOwnerLabel(entity) : "",
      used: false,
    });
    button.dataset.helperClass = getLinkedEssenceHelperClass(color);
  }
  const spriteHTML = createEssenceSpriteHTML(definition, { universal: isUniversal, hyperco });
  button.innerHTML = `
    ${isUniversal
      ? `<div class="attack-essence-universal-orb essenceur-purchase-orb universal" aria-hidden="true">${spriteHTML}</div>`
      : spriteHTML}
    <span class="essence-item-name">${displayName}</span>
  `;
  return button;
}

function appendPopupEssenceSection(root, title, source, counts = {}, options = {}) {
  const sourceItems = Array.isArray(options.items)
    ? options.items.filter(item => normalizeColor(item?.color))
    : [];
  const totalCount = sourceItems.length;
  if (options.hideWhenEmpty === true && totalCount <= 0) return false;

  const section = document.createElement("div");
  section.className = `attack-essence-popup-section ${source}`;

  const head = document.createElement("div");
  head.className = "attack-essence-popup-section-title";
  head.textContent = title;

  const tokens = document.createElement("div");
  tokens.className = "attack-essence-popup-tokens";

  sourceItems.forEach((item, index) => {
    const color = normalizeColor(item.color);
    tokens.appendChild(createPopupEssenceButton({
      color,
      source,
      index,
      label: COLOR_LABELS[color],
      entity: options.entity,
      essenceId: item.id,
      origin: item.origin,
    }));
  });

  if (!tokens.children.length) {
    tokens.classList.add("is-empty");
  }

  section.append(head, tokens);
  root.appendChild(section);
  return true;
}

function createPopupActionButton(label, action, disabled = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "attack-essence-popup-action";
  button.dataset.essencePopupAction = action;
  button.disabled = disabled;
  button.textContent = label;
  return button;
}

function setAttackEssencePopupStatus(root, message = "", state = "") {
  const status = root.querySelector("[data-essence-popup-status]");
  if (!status) return;
  status.textContent = message;
  status.dataset.state = state;
}

function confirmUniversalEssenceBinding({ entity = {}, color = "" } = {}) {
  if (typeof document === "undefined") return Promise.resolve(true);

  const normalizedColor = normalizeColor(color);
  const definition = getEssenceItemDefinition(normalizedColor);
  const entityName = entity?.nickname || entity?.name || entity?.class || "cette entité";
  const essenceName = definition.universalName || definition.name || "cette essence universelle";

  return showGamePopupMessage({
    mode: "manual",
    tone: "warning",
    key: "essence-bind",
    title: "Lier une essence universelle",
    message: `En enchâssant ${essenceName}, elle sera définitivement liée à ${entityName}.`,
    className: "essence-bind-confirm",
    actions: [
      { label: "Annuler", value: false },
      { label: "Continuer", value: true, primary: true },
    ],
  }).then(Boolean);
}

export function openAttackEssenceSocketPopup({
  anchor,
  attack = {},
  entity = {},
  slotIndex = 0,
  onApply = null,
} = {}) {
  if (typeof document === "undefined" || !anchor) return null;
  if (!requireSafeMenuAccess()) return null;

  closeAttackEssenceSocketPopups();

  const normalizedSlotIndex = Math.max(0, Math.floor(Number(slotIndex) || 0));
  let activeAnchor = anchor;
  let activeAttack = attack;
  let activeEntity = entity;
  let isApplyingChoice = false;
  let keepOpenWithoutAnchor = false;
  const initialCodexId = anchor.closest?.('[id^="codex-entity_"]')?.id || "";
  const initialSocketsClassName = anchor.closest?.("[data-attack-essence-sockets]")?.className || "";
  const initialAvailability = getAttackEssenceAvailabilityForSlot(activeEntity, activeAttack, normalizedSlotIndex);
  if (!initialAvailability.currentSlot || initialAvailability.currentSlot.locked) return null;

  const popup = document.createElement("div");
  popup.className = "attack-essence-popup";
  popup.setAttribute("role", "dialog");
  popup.setAttribute("aria-modal", "true");
  popup.setAttribute("aria-label", `Chasse de ${getAttackDisplayLabel(activeAttack)} · ${getEntityEssenceOwnerLabel(activeEntity)}`);
  const popupContainer = document.createElement("div");
  popupContainer.className = "attack-essence-popup-container essence-item-card";
  popup.appendChild(popupContainer);
  let lastStatusMessage = "";
  let lastStatusState = "";

  const setLocalStatus = (message = "", state = "") => {
    lastStatusMessage = message;
    lastStatusState = state;
    setAttackEssencePopupStatus(popupContainer, message, state);
  };

  const findRenderedAnchor = () => {
    const scope = initialCodexId
      ? document.getElementById(initialCodexId)
      : document;
    if (!scope) return null;

    const wantedAttackKey = String(readAttackDefinitionKey(activeAttack) || popup.dataset.attackKey || "");
    const wantedEntityId = String(activeEntity?.id ?? "");
    const candidates = Array.from(scope.querySelectorAll(".attack-essence-socket[data-slot-index]"));
    const matching = candidates.filter(candidate => {
      if (Number(candidate.dataset.slotIndex) !== normalizedSlotIndex) return false;
      const sockets = candidate.closest("[data-attack-essence-sockets]");
      if (!sockets) return false;
      if (wantedAttackKey && String(sockets.dataset.attackKey || "") !== wantedAttackKey) return false;
      if (wantedEntityId && String(sockets.dataset.entityId || "") !== wantedEntityId) return false;
      return true;
    });

    return matching.find(candidate => (
      candidate.closest("[data-attack-essence-sockets]")?.className === initialSocketsClassName
    )) || matching[0] || null;
  };

  const recoverRenderedAnchor = async () => {
    if (activeAnchor?.isConnected && document.body.contains(activeAnchor)) return activeAnchor;

    let replacement = findRenderedAnchor();
    if (!replacement && typeof requestAnimationFrame === "function") {
      await new Promise(resolve => requestAnimationFrame(resolve));
      replacement = findRenderedAnchor();
    }

    if (replacement) {
      activeAnchor = replacement;
      keepOpenWithoutAnchor = false;
    } else {
      keepOpenWithoutAnchor = true;
    }
    return replacement;
  };

  const renderPopupContent = (statusMessage = lastStatusMessage, statusState = lastStatusState) => {
    const availability = getAttackEssenceAvailabilityForSlot(activeEntity, activeAttack, normalizedSlotIndex);
    const currentSlot = availability.currentSlot;
    if (!currentSlot || currentSlot.locked) return false;

    const currentColor = normalizeColor(currentSlot.color);
    popup.dataset.attackKey = readAttackDefinitionKey(activeAttack);
    popup.dataset.slotIndex = String(normalizedSlotIndex);
    const previousScrollTop = popup.scrollTop;
    invalidateEssenceHoverHelpers();
    popupContainer.innerHTML = "";

    popupContainer.appendChild(createPopupEquippedEssenceElement(currentColor, {
      slotIndex: normalizedSlotIndex + 1,
      source: currentSlot.essenceSource,
      hyperco: currentSlot.hyperco,
      entity: activeEntity,
      attack: activeAttack,
    }));
    if (isAdminMode()) {
      const section = document.createElement('div');
      section.className = 'attack-essence-popup-section admin-infinite-essences';
      const title = document.createElement('div');
      title.className = 'attack-essence-popup-section-title';
      title.textContent = 'Admin · Essences illimitées';
      const tokens = document.createElement('div');
      tokens.className = 'attack-essence-popup-tokens';
      Object.keys(COLOR_LABELS).forEach(color => {
        const token = createPopupEssenceButton({ color, source: ESSENCE_SOURCE_LINKED, entity: activeEntity });
        token.dataset.adminInfinite = 'true';
        token.setAttribute('aria-label', `${COLOR_LABELS[color]} · illimité`);
        token.querySelector('.essence-item-name').textContent += ' ∞';
        tokens.appendChild(token);
      });
      section.append(title, tokens);
      popupContainer.appendChild(section);
    }
    const hasLinkedEssences = appendPopupEssenceSection(
      popupContainer,
      "Essences liées à l'entité disponibles :",
      ESSENCE_SOURCE_LINKED,
      availability.linked,
      {
        hideWhenEmpty: true,
        entity: activeEntity,
        items: availability.availableItems,
      }
    );
    const hasUniversalEssences = appendPopupEssenceSection(
      popupContainer,
      "Essences universelles disponibles :",
      ESSENCE_SOURCE_INVENTORY,
      availability.universal,
      {
        hideWhenEmpty: true,
        items: availability.universalItems,
      }
    );

    if (!isAdminMode() && !hasLinkedEssences && !hasUniversalEssences) {
      const emptyMessage = document.createElement("div");
      emptyMessage.className = "attack-essence-popup-empty-message";
      emptyMessage.textContent = "Vous n'avez pas d'autres essences pour le moment.";
      popupContainer.appendChild(emptyMessage);
    }

    const actions = document.createElement("div");
    actions.className = "attack-essence-popup-actions";
    if (availability.canClearCurrentSlot) {
      actions.appendChild(createPopupActionButton("Vider", "clear", false));
    }
    popupContainer.appendChild(actions);

    const status = document.createElement("div");
    status.className = "attack-essence-popup-status";
    status.dataset.essencePopupStatus = "true";
    popupContainer.appendChild(status);
    lastStatusMessage = statusMessage;
    lastStatusState = statusState;
    setAttackEssencePopupStatus(popupContainer, statusMessage, statusState);
    popup.scrollTop = previousScrollTop;
    return true;
  };

  if (!renderPopupContent()) return null;

  const applyChoice = async ({ color, source, essenceId = "", adminInfinite = false }) => {
    if (typeof onApply !== "function") {
      setLocalStatus("Sauvegarde non branchee.", "error");
      return;
    }

    const normalizedSource = normalizeEssenceSource(source);
    const normalizedChoiceColor = normalizeColor(color);
    if (normalizedSource === ESSENCE_SOURCE_INVENTORY && normalizedChoiceColor) {
      const accepted = await confirmUniversalEssenceBinding({
        entity: activeEntity,
        color: normalizedChoiceColor,
      });
      if (!accepted) {
        setLocalStatus("Liaison annulee.", "warning");
        return;
      }
    }

    isApplyingChoice = true;
    setLocalStatus("Sertissage...", "pending");

    try {
      const result = await onApply({
        entity: activeEntity,
        attack: activeAttack,
        attackKey: readAttackDefinitionKey(activeAttack),
        slotIndex: normalizedSlotIndex,
        color,
        essenceSource: source,
        essenceId,
        adminInfinite,
      });

      if (result?.ok === false) {
        setLocalStatus(result.message || "Sertissage refuse.", "error");
        return;
      }

      activeEntity = result?.entity || activeEntity;
      activeAttack = result?.attack || activeAttack;
      await recoverRenderedAnchor();

      const updatedAvailability = getAttackEssenceAvailabilityForSlot(
        activeEntity,
        activeAttack,
        normalizedSlotIndex
      );
      const updatedSlot = updatedAvailability.currentSlot || {};
      const normalizedColor = normalizeColor(updatedSlot.color || color);
      const normalizedSource = normalizeEssenceSource(updatedSlot.essenceSource || source);
      if (activeAnchor) {
        activeAnchor.dataset.color = normalizedColor || "empty";
        activeAnchor.dataset.active = normalizedColor ? "true" : "false";
        activeAnchor.dataset.source = updatedSlot.source || activeAnchor.dataset.source || "";
        activeAnchor.dataset.essenceSource = normalizedColor ? normalizedSource : "";
        activeAnchor.dataset.linkedColor = readLinkedEssenceColor(updatedSlot) || "";
        activeAnchor.dataset.essenceId = readEssenceInstanceId(updatedSlot) || "";
        activeAnchor.classList.toggle('hyperco', Boolean(normalizedColor && updatedSlot.hyperco));
        delete activeAnchor.dataset.helperText;
        delete activeAnchor.dataset.helperClass;
        if (normalizedColor && updatedSlot.hyperco) {
          activeAnchor.dataset.helperText = createLinkedEssenceHelperHTML(normalizedColor, {
            hyperco: true,
            entityName: getEntityEssenceOwnerLabel(activeEntity),
            attackName: getAttackDisplayLabel(activeAttack),
            slot: normalizedSlotIndex + 1,
            used: true,
          });
          activeAnchor.dataset.helperClass = getLinkedEssenceHelperClass(normalizedColor);
        }
        activeAnchor.innerHTML = normalizedColor
          ? createEssenceSpriteHTML(normalizedColor, { mini: true, hyperco: updatedSlot.hyperco })
          : createEssenceSpriteHTML("", { empty: true, mini: true });
        if (normalizedColor) {
          activeAnchor.dataset.stat = getEssenceItemDefinition(normalizedColor).statKey;
          activeAnchor.dataset.hover = "true";
        } else {
          activeAnchor.dataset.stat = EMPTY_ESSENCE_HELPER_STAT;
          activeAnchor.dataset.hover = "true";
        }
      }

      const successMessage = normalizedColor
        ? (result?.message || "Essence sertie.")
        : "Chasse videe.";
      renderPopupContent(successMessage, "");
      if (activeAnchor?.isConnected) positionAttackEssencePopup(popup, activeAnchor);
    } catch (error) {
      console.error("Erreur sertissage essence :", error);
      setLocalStatus("Erreur pendant le sertissage.", "error");
    } finally {
      isApplyingChoice = false;
    }
  };

  popup.addEventListener("click", event => {
    event.stopPropagation();

    if (event.target.closest?.(".attack-essence-popup-close")) {
      closeAttackEssenceSocketPopups();
      return;
    }

    const token = event.target.closest?.("[data-essence-popup-color]");
    if (token) {
      const color = normalizeColor(token.dataset.essencePopupColor);
      const source = String(token.dataset.essencePopupSource || "");
      const essenceId = String(token.dataset.essenceId || "").trim();
      if (!color || !source || token.dataset.essenceAvailable !== "true") return;
      applyChoice({ color, source, essenceId, adminInfinite: token.dataset.adminInfinite === 'true' });
      return;
    }

    const action = event.target.closest?.("[data-essence-popup-action]");
    if (!action || action.disabled) return;

    if (action.dataset.essencePopupAction === "clear") {
      applyChoice({ color: "", source: "" });
    }
  });

  let gameHelper = document.querySelector(".Game-helper");
  if (!gameHelper) {
    gameHelper = document.createElement("div");
    gameHelper.className = "Game-helper";
    ensureGameShell().append(gameHelper);
  }
  const backdrop = document.createElement("div");
  backdrop.className = "attack-essence-popup-backdrop";
  backdrop.setAttribute("aria-hidden", "true");
  backdrop.addEventListener("click", closeAttackEssenceSocketPopups);
  gameHelper.append(backdrop, popup);
  positionAttackEssencePopup(popup, activeAnchor);

  const onEscape = event => {
    if (event.key !== "Escape" || document.querySelector(".game-popup-layer--manual")) return;
    event.preventDefault();
    closeAttackEssenceSocketPopups();
  };
  document.addEventListener("keydown", onEscape);

  let anchorObserver = null;
  let animationFrameId = 0;
  const onPopupEssenceInventoryUpdated = () => {
    if (!popup.isConnected) return;
    renderPopupContent(lastStatusMessage, lastStatusState);
  };
  const closeIfAnchorIsGone = () => {
    animationFrameId = 0;
    if (!popup.isConnected) {
      popup._attackEssenceCleanup?.();
      return;
    }
    if (!activeAnchor?.isConnected || !document.body.contains(activeAnchor)) {
      if (isApplyingChoice || keepOpenWithoutAnchor) return;
      closeAttackEssenceSocketPopups();
    }
  };

  if (typeof MutationObserver !== "undefined" && document.body) {
    anchorObserver = new MutationObserver(() => {
      if (animationFrameId) return;
      animationFrameId = requestAnimationFrame(closeIfAnchorIsGone);
    });
    anchorObserver.observe(document.body, { childList: true, subtree: true });
  }

  if (typeof window !== "undefined") {
    window.addEventListener("essenceInventoryUpdated", onPopupEssenceInventoryUpdated);
    window.addEventListener("adminModeChanged", onPopupEssenceInventoryUpdated);
  }

  popup._attackEssenceCleanup = () => {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    animationFrameId = 0;
    anchorObserver?.disconnect();
    anchorObserver = null;
    backdrop.remove();
    document.removeEventListener("keydown", onEscape);
    if (typeof window !== "undefined") {
      window.removeEventListener("essenceInventoryUpdated", onPopupEssenceInventoryUpdated);
      window.removeEventListener("adminModeChanged", onPopupEssenceInventoryUpdated);
    }
  };

  return popup;
}

const socketViews = new WeakMap();

if (typeof window !== "undefined") window.addEventListener("attackMasteryChanged", ({ detail }) => {
  if (detail.after.level <= detail.before.level) return;
  document.querySelectorAll('[data-attack-essence-sockets="true"]').forEach(root => {
    const view = socketViews.get(root);
    if (!view || String(view.entity?.id) !== String(detail.entity.id) || view.attackId !== detail.attack.entityAttackId) return;
    const next = createAttackEssenceSocketsElement(detail.attack, { ...view.options, entity: detail.entity });
    const existing = new Set([...root.children].map(dot => dot.dataset.socketId));
    // Keep existing nodes (and their ongoing animations/popups) intact.
    root.append(...[...next.children].filter(dot => !existing.has(dot.dataset.socketId)));
    root.classList.toggle("is-empty", !root.children.length);
  });
});

export function createAttackEssenceSocketsElement(attack = {}, options = {}) {
  const sockets = getAttackEssenceSocketViewModel(
    attack,
    Number(options.maxSlots) || MAX_ESSENCEUR_SLOTS
  );
  const root = document.createElement("div");
  root.className = "attack-essence-sockets";
  if (!sockets.length) root.classList.add("is-empty");
  if (options.compact) root.classList.add("compact");
  if (options.position) root.classList.add(`attack-essence-sockets--${options.position}`);
  root.dataset.attackEssenceSockets = "true";
  root.dataset.attackKey = readAttackDefinitionKey(attack);
  if (options.attackIndex !== undefined && options.attackIndex !== null) {
    root.dataset.attackIndex = String(options.attackIndex);
  }
  if (options.entity?.id !== undefined) root.dataset.entityId = String(options.entity.id);
  socketViews.set(root, { entity: options.entity, attackId: attack.entityAttackId, options });

  sockets.forEach((socket, renderIndex) => {
    const gridPosition = getAttackEssenceSocketGridPosition(renderIndex);
    const dot = document.createElement("span");
    dot.className = [
      "attack-essence-socket",
      `attack-essence-socket--col-${gridPosition.column}`,
      `attack-essence-socket--row-${Math.min(3, gridPosition.row)}`,
    ].join(" ");
    dot.dataset.index = String(socket.index);
    dot.dataset.slotIndex = String(socket.arrayIndex);
    dot.dataset.socketId = socket.socketId || "";
    dot.dataset.column = String(gridPosition.column);
    dot.dataset.row = String(gridPosition.row);
    dot.dataset.color = socket.active ? socket.color : "empty";
    dot.dataset.active = socket.active ? "true" : "false";
    dot.dataset.kind = socket.kind;
    dot.dataset.locked = socket.locked ? "true" : "false";
    dot.dataset.source = socket.source;
    dot.dataset.essenceSource = socket.essenceSource;
    dot.dataset.linkedColor = socket.linkedColor;
    dot.dataset.essenceId = socket.essenceId || "";
    if (socket.active && socket.color) {
      dot.dataset.stat = getEssenceItemDefinition(socket.color).statKey;
      dot.dataset.hover = "true";
      dot.classList.toggle('hyperco', socket.hyperco);
      dot.innerHTML = createEssenceSpriteHTML(socket.color, { mini: true, hyperco: socket.hyperco });
      if (socket.hyperco) {
        dot.dataset.helperText = createLinkedEssenceHelperHTML(socket.color, {
          hyperco: true,
          entityName: getEntityEssenceOwnerLabel(options.entity),
          attackName: getAttackDisplayLabel(attack),
          slot: socket.index,
          used: true,
        });
        dot.dataset.helperClass = getLinkedEssenceHelperClass(socket.color);
      }
    } else {
      dot.dataset.stat = EMPTY_ESSENCE_HELPER_STAT;
      dot.dataset.hover = "true";
      dot.innerHTML = createEssenceSpriteHTML("", { empty: true, mini: true });
    }
    dot.tabIndex = socket.locked ? -1 : 0;
    dot.setAttribute("role", "button");
    dot.setAttribute("aria-label", `Chasse ${socket.index} ${socket.label}`);
    dot.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      if (typeof options.onSocketClick === "function") {
        options.onSocketClick({ anchor: dot, attack, entity: options.entity || {}, socket, slotIndex: socket.arrayIndex });
        return;
      }
      openAttackEssenceSocketPopup({
        anchor: dot,
        attack,
        entity: options.entity || {},
        slotIndex: socket.arrayIndex,
        onApply: options.onApplyEssence,
      });
    });
    dot.addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      dot.click();
    });
    root.appendChild(dot);
  });

  return root;
}

function pct(value, total) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function makePicto(className) {
  return `<span class="picto-stat ${className}" aria-hidden="true"></span>`;
}

function getDominantLabel(state) {
  if (!state.total) return "Aucune";
  const entries = [
    [ATTACK_ESSENCE_COLORS.RED, state.red],
    [ATTACK_ESSENCE_COLORS.BLUE, state.blue],
    [ATTACK_ESSENCE_COLORS.YELLOW, state.yellow],
  ];
  const max = Math.max(...entries.map(([, value]) => value));
  return entries
    .filter(([, value]) => value === max)
    .map(([color]) => COLOR_LABELS[color])
    .join(" + ");
}

function resolveNatureLabel(state) {
  if (!state.total) return "Inerte";
  if (state.isPureYellow) return "Pure percante / transpercante";
  if (state.isPureRed) return "Pure physique";
  if (state.isPureMagical) return "Pure magique";
  if (state.red > 0 && state.blue > 0 && state.yellow > 0) return "Hybride percante";
  if (state.red > 0 && state.blue > 0) return "Hybride physique-magique";
  if (state.red > 0 && state.yellow > 0) return "Physique percante";
  if (state.blue > 0 && state.yellow > 0) return "Magique percante";
  if (state.red > 0) return "Physique";
  if (state.blue > 0) return "Magique";
  if (state.yellow > 0) return "Percante";
  return "Aucune";
}

function getEssenceurNatureIcon(preview) {
  if (!preview?.total) return "inerte";
  if (preview.red > 0 && preview.blue > 0 && preview.yellow > 0) return "hybridalPiercingDamage";
  if (preview.red > 0 && preview.blue > 0) return "hybridalDamage";
  if (preview.red > 0 && preview.yellow > 0) return "physicalPiercingDamage";
  if (preview.blue > 0 && preview.yellow > 0) return "magicalPiercingDamage";
  if (preview.isPureYellow) return "transpiercingDamage";
  if (preview.red > 0) return "physicalDamage";
  if (preview.blue > 0) return "magicalDamage";
  if (preview.yellow > 0) return "piercingDamage";
  return "miss-shot";
}

export function calculateEssenceurPreview(config = {}) {
  const range = normalizeRange(config.range);
  const slots = getNormalizedConfigSlots(config);
  const activeSlots = slots
    .map(slot => ({
      active: Boolean(slot?.active),
      color: normalizeColor(slot?.color ?? slot?.key ?? slot),
    }))
    .filter(slot => slot.active && slot.color);

  const baseRed = activeSlots.filter(slot => slot.color === ATTACK_ESSENCE_COLORS.RED).length;
  const baseBlue = activeSlots.filter(slot => slot.color === ATTACK_ESSENCE_COLORS.BLUE).length;
  const baseYellow = activeSlots.filter(slot => slot.color === ATTACK_ESSENCE_COLORS.YELLOW).length;
  const red = baseRed;
  const blue = baseBlue;
  const yellow = baseYellow;
  const total = red + blue + yellow;

  const state = {
    range,
    slots,
    activeSlotCount: activeSlots.length,
    baseRed,
    baseBlue,
    baseYellow,
    red,
    blue,
    yellow,
    total,
    slotCount: slots.length,
    isPureRed: red > 0 && blue === 0 && yellow === 0,
    isPureMagical: blue > 0 && red === 0 && yellow === 0,
    isPureYellow: yellow > 0 && red === 0 && blue === 0,
  };

  const availableEffects = EFFECT_DEFINITIONS
    .map(effect => ({ ...effect, available: Boolean(effect.isAvailable(state)) }))
    .filter(effect => effect.available)
    .map(({ isAvailable, ...effect }) => effect);

  return {
    ...state,
    rangeLabel: range === "range" ? "Distance" : "Melee",
    natureLabel: resolveNatureLabel(state),
    dominantLabel: getDominantLabel(state),
    shares: {
      red: pct(red, total),
      blue: pct(blue, total),
      yellow: pct(yellow, total),
    },
    natureIcon: getEssenceurNatureIcon(state),
    availableEffects,
    allEffects: EFFECT_DEFINITIONS.map(effect => {
      const available = Boolean(effect.isAvailable(state));
      const { isAvailable, ...publicEffect } = effect;
      return { ...publicEffect, available };
    }),
  };
}

function createSlot(index, initialColor = "", slot = {}) {
  const card = document.createElement("div");
  card.className = "essenceur-slot-card";
  card.dataset.slot = String(index);
  card.dataset.slotId = slot.slotId || `slot-${index}`;
  card.dataset.socketId = slot.socketId || "";
  card.dataset.kind = slot.kind || "open";
  card.dataset.locked = slot.locked ? "true" : "false";
  card.dataset.source = slot.source || "configured";
  card.dataset.unlockId = slot.unlockId || "";
  card.dataset.essenceSource = normalizeEssenceSource(slot.essenceSource);
  card.dataset.linkedColor = readLinkedEssenceColor(slot) || "";
  card.dataset.essenceId = readEssenceInstanceId(slot) || "";
  card.dataset.originalColor = initialColor;
  card.dataset.active = initialColor ? "true" : "false";
  card.dataset.color = initialColor;
  card.tabIndex = 0;

  const number = document.createElement("div");
  number.className = "essenceur-slot-number";
  number.textContent = String(index);

  const main = document.createElement("div");
  main.className = "essenceur-slot-main";

  const head = document.createElement("label");
  head.className = "essenceur-slot-head";

  const headText = document.createElement("span");
  headText.textContent = "Active";

  const activeInput = document.createElement("input");
  activeInput.className = "essenceur-slot-active";
  activeInput.type = "checkbox";
  activeInput.checked = Boolean(initialColor);
  activeInput.disabled = Boolean(slot.locked);
  activeInput.setAttribute("aria-label", `Activer essence ${index}`);

  const select = document.createElement("select");
  select.className = "essenceur-slot-select";
  select.setAttribute("aria-label", `Nature essence ${index}`);

  COLOR_OPTIONS.forEach(optionData => {
    const option = document.createElement("option");
    option.value = optionData.key;
    option.textContent = optionData.label;
    select.appendChild(option);
  });
  select.value = initialColor;
  select.disabled = Boolean(slot.locked);

  const clearButton = document.createElement("button");
  clearButton.className = "essenceur-slot-clear";
  clearButton.type = "button";
  clearButton.dataset.essenceurSlotClear = "true";
  clearButton.textContent = "Vider";
  clearButton.disabled = Boolean(slot.locked);

  head.append(headText, activeInput);
  main.append(head, select, clearButton);
  card.append(number, main);

  return card;
}

function getSelectedSlotCard(root) {
  return root.querySelector(".essenceur-slot-card.is-selected")
    || root.querySelector(".essenceur-slot-card:not([data-locked='true'])");
}

function selectSlotCard(root, slotCard) {
  if (!slotCard || slotCard.dataset.locked === "true") return;
  root.querySelectorAll(".essenceur-slot-card.is-selected").forEach(card => {
    card.classList.remove("is-selected");
  });
  slotCard.classList.add("is-selected");
}

function setSlotCardColor(slotCard, color, options = {}) {
  if (!slotCard || slotCard.dataset.locked === "true") return false;
  const normalizedColor = normalizeColor(color);
  const activeInput = slotCard.querySelector(".essenceur-slot-active");
  const select = slotCard.querySelector(".essenceur-slot-select");
  const pendingSource = normalizeEssenceSource(options.pendingEssenceSource || "");
  const pendingEssenceId = String(options.pendingEssenceId || "").trim();

  if (activeInput) activeInput.checked = Boolean(normalizedColor);
  if (select) select.value = normalizedColor;
  slotCard.dataset.active = normalizedColor ? "true" : "false";
  slotCard.dataset.color = normalizedColor;
  if (normalizeColor(slotCard.dataset.originalColor) !== normalizedColor) {
    slotCard.dataset.essenceId = "";
  }
  if (normalizedColor && pendingSource) {
    slotCard.dataset.pendingEssenceSource = pendingSource;
    slotCard.dataset.pendingEssenceColor = normalizedColor;
    slotCard.dataset.pendingEssenceId = pendingEssenceId;
  } else {
    delete slotCard.dataset.pendingEssenceSource;
    delete slotCard.dataset.pendingEssenceColor;
    delete slotCard.dataset.pendingEssenceId;
  }
  return true;
}

function getSlotCardColor(slotCard) {
  return normalizeColor(
    slotCard?.querySelector(".essenceur-slot-select")?.value
    ?? slotCard?.dataset.color
    ?? ""
  );
}

function isSlotCardActive(slotCard) {
  return slotCard?.querySelector(".essenceur-slot-active")?.checked === true
    && Boolean(getSlotCardColor(slotCard));
}

function syncSlotCardClearGuards(root) {
  const cards = Array.from(root?.querySelectorAll?.(".essenceur-slot-card") || []);

  cards.forEach(card => {
    const locked = card.dataset.locked === "true";
    const active = isSlotCardActive(card);
    const clearButton = card.querySelector(".essenceur-slot-clear");
    const activeInput = card.querySelector(".essenceur-slot-active");
    const select = card.querySelector(".essenceur-slot-select");

    if (clearButton) {
      clearButton.disabled = locked || !active;
    }
    if (activeInput) {
      activeInput.disabled = locked;
    }
    if (select) {
      select.disabled = locked;
    }
  });
}

function clearSlotCard(root, slotCard) {
  return slotCard?.dataset.locked !== 'true' && setSlotCardColor(slotCard, '');
}

function equipColorOnSelectedSlot(root, color, essenceId = "") {
  const slotCard = getSelectedSlotCard(root);
  if (!slotCard) return false;
  selectSlotCard(root, slotCard);
  return setSlotCardColor(slotCard, color, {
    pendingEssenceSource: ESSENCE_SOURCE_INVENTORY,
    pendingEssenceId: essenceId,
  });
}

function getEssencePurchasePrice(color = "") {
  const normalizedColor = normalizeColor(color);
  return Math.max(0, Math.floor(Number(ESSENCE_PURCHASE_PRICES[normalizedColor]) || 0));
}

function setPurchaseStatus(root, message = "", state = "") {
  const status = root.querySelector("[data-essenceur-purchase-status]");
  if (!status) return;
  status.textContent = message;
  status.dataset.state = state;
}

function renderEssencePurchaseShop(root) {
  const shopRoot = root.querySelector("[data-essenceur-purchase-shop]");
  if (!shopRoot) return;

  shopRoot.innerHTML = ESSENCE_COLORS.map(color => {
    const definition = getEssenceItemDefinition(color);
    const price = getEssencePurchasePrice(color);
    const universalName = definition.universalName || `Essence universelle ${definition.infusedLabel || definition.name}`;
    const helperHTML = createUniversalEssenceHelperHTML(color);
    const helperClass = getUniversalEssenceHelperClass(color);
    const qualityClass = `quality-${Math.max(0, Number(definition.quality) || 4)}`;

    return `
      <div
        class="essenceur-purchase-card item-wrapper essence-item-card universal ${qualityClass} ${color}"
        data-essenceur-purchase-color="${color}"
        data-stat="${definition.statKey}"
        data-hover="true"
        data-helper-text="${escapeEssenceAttribute(helperHTML)}"
        data-helper-ambiance="${escapeEssenceAttribute(createUniversalEssenceAmbianceHTML(color))}"
        data-helper-class="${escapeEssenceAttribute(helperClass)}"
        title="${universalName}"
        aria-label="${universalName} - ${price} pieces"
        role="button"
        tabindex="0"
        draggable="false"
      >
        <div class="item-icon essenceur-purchase-orb universal" aria-hidden="true">
          ${createEssenceSpriteHTML(definition, { universal: true })}
        </div>
        <div class="item-cost essenceur-purchase-cost">
          <span>${price}</span>
          <span class="essenceur-purchase-coin" aria-hidden="true">🪙</span>
        </div>
      </div>
    `;
  }).join("");
}

function selectEssencePurchaseCard(root, card) {
  if (!root || !card) return;

  root.querySelectorAll(".essenceur-purchase-card.selected").forEach(selected => {
    selected.classList.remove("selected");
  });

  card.classList.add("selected");
  const color = normalizeColor(card.dataset.essenceurPurchaseColor);
  const buyButton = root.querySelector("[data-essenceur-purchase-confirm]");
  if (buyButton) {
    buyButton.classList.toggle("buy", Boolean(color));
    buyButton.dataset.essenceurPurchaseConfirm = color || "";
  }
  if (color) setPurchaseStatus(root, `${COLOR_LABELS[color]} selectionnee.`, "pending");
}

function clearEssencePurchaseSelection(root) {
  if (!root) return;
  root.querySelectorAll(".essenceur-purchase-card.selected").forEach(selected => {
    selected.classList.remove("selected");
  });

  const buyButton = root.querySelector("[data-essenceur-purchase-confirm]");
  if (buyButton) {
    buyButton.classList.remove("buy");
    buyButton.dataset.essenceurPurchaseConfirm = "";
  }
}

function getSelectedEssencePurchaseColor(root, fallbackColor = "") {
  const normalizedFallback = normalizeColor(fallbackColor);
  if (normalizedFallback) return normalizedFallback;

  const selectedCard = root?.querySelector?.(".essenceur-purchase-card.selected[data-essenceur-purchase-color]");
  return normalizeColor(selectedCard?.dataset?.essenceurPurchaseColor);
}

function purchaseUniversalEssence(root, color = "") {
  if (!requireSafeMenuAccess()) return;
  const normalizedColor = getSelectedEssencePurchaseColor(root, color);
  if (!normalizedColor) {
    setPurchaseStatus(root, "Selectionne une essence a acheter.", "error");
    return false;
  }

  grantEssencesToInventory({ [normalizedColor]: 1 }, {
    origin: "shop-purchase",
    provenanceSource: "universal-shop",
    provenanceContext: { shop: "essenceur" },
  });
  renderEssenceInventory(root);
  renderEssencePurchaseShop(root);
  clearEssencePurchaseSelection(root);
  setPurchaseStatus(root, `${COLOR_LABELS[normalizedColor]} +1 dans l'inventaire universel.`, "ok");
  setApplyStatus(root, `${COLOR_LABELS[normalizedColor]} +1 dans l'inventaire universel.`, "ok");
  return true;
}

function setEssenceurTab(root, tabKey = "infuse") {
  const activeTab = tabKey === "purchase" ? "purchase" : "infuse";
  root.dataset.essenceurTab = activeTab;

  root.querySelectorAll("[data-essenceur-tab]").forEach(button => {
    const isActive = button.dataset.essenceurTab === activeTab;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
  });

  root.querySelectorAll("[data-essenceur-tab-panel]").forEach(panel => {
    panel.classList.toggle("is-hidden", panel.dataset.essenceurTabPanel !== activeTab);
  });
}

function renderEssenceInventory(root) {
  const inventoryRoot = root.querySelector("[data-essenceur-inventory]");
  if (!inventoryRoot) return;

  const universalItems = loadUniversalEssenceItems();
  inventoryRoot.innerHTML = `
    <div class="essenceur-inventory-head">
      <span>Essences universelles</span>
      <span class="essenceur-inventory-hint">clic ou glisser vers une chasse</span>
    </div>
    <div class="essenceur-inventory-tokens">
      ${universalItems.map(item => {
        const color = normalizeColor(item.color);
        const definition = getEssenceItemDefinition(color);
        const qualityClass = `quality-${Math.max(0, Number(definition.quality) || 4)}`;
        return `
        <div
          class="essenceur-inventory-token essence-item-card universal ${qualityClass} ${color}"
          draggable="true"
          data-essenceur-inventory-color="${color}"
          data-essence-id="${escapeEssenceAttribute(item.id)}"
          data-essence-available="true"
          data-stat="${definition.statKey}"
          data-hover="true"
          data-helper-text="${escapeEssenceAttribute(createUniversalEssenceHelperHTML(color))}"
          data-helper-ambiance="${escapeEssenceAttribute(createUniversalEssenceAmbianceHTML(color))}"
          data-helper-class="${escapeEssenceAttribute(getUniversalEssenceHelperClass(color))}"
          role="button"
          tabindex="0"
          aria-label="${definition.universalName || definition.name} disponible"
        >
          ${createEssenceItemInnerHTML(color, 1, {
            universal: true,
            showCount: false,
          })}
        </div>
      `;
      }).join("")}
    </div>
  `;

  renderEssencePurchaseShop(root);
}

function renderSlotCards(root, config = {}) {
  const slotsRoot = root.querySelector("[data-essenceur-slots]");
  if (!slotsRoot) return;

  const slots = getNormalizedConfigSlots(config);
  slotsRoot.innerHTML = "";

  if (!slots.length) {
    const empty = document.createElement("div");
    empty.className = "essenceur-no-slots";
    empty.textContent = "Aucune chasse débloquée.";
    slotsRoot.appendChild(empty);
    return;
  }

  slots.forEach((slot, index) => {
    const color = slot.active ? normalizeColor(slot.color) : "";
    const slotCard = createSlot(index + 1, color, slot);
    slotsRoot.appendChild(slotCard);
    if (index === 0) selectSlotCard(root, slotCard);
  });
}

export function readEssenceurState(root) {
  const slots = Array.from(root.querySelectorAll(".essenceur-slot-card")).map(card => {
    const active = card.querySelector(".essenceur-slot-active")?.checked === true;
    const color = normalizeColor(card.querySelector(".essenceur-slot-select")?.value);
    const previousEssenceSource = normalizeEssenceSource(card.dataset.essenceSource);
    const linkedColor = normalizeColor(card.dataset.linkedColor);
    const essenceId = String(card.dataset.essenceId || "").trim();
    const originalColor = normalizeColor(card.dataset.originalColor);
    const pendingEssenceSource = normalizeEssenceSource(card.dataset.pendingEssenceSource);
    const pendingEssenceColor = normalizeColor(card.dataset.pendingEssenceColor);
    const pendingEssenceId = String(card.dataset.pendingEssenceId || "").trim();
    let essenceSource = "";

    if (active && color) {
      if (pendingEssenceSource === ESSENCE_SOURCE_INVENTORY && color === pendingEssenceColor) {
        essenceSource = ESSENCE_SOURCE_INVENTORY;
      } else if (linkedColor && color === linkedColor) {
        essenceSource = ESSENCE_SOURCE_LINKED;
      } else if (
        previousEssenceSource === ESSENCE_SOURCE_LINKED &&
        color === originalColor
      ) {
        essenceSource = ESSENCE_SOURCE_LINKED;
      } else {
        essenceSource = ESSENCE_SOURCE_LINKED;
      }
    }

    return {
      slotId: card.dataset.slotId || `slot-${card.dataset.slot || ""}`,
      socketId: card.dataset.socketId || "",
      kind: card.dataset.kind || "open",
      locked: card.dataset.locked === "true",
      source: card.dataset.source || "configured",
      unlockId: card.dataset.unlockId || "",
      active: active && Boolean(color),
      color,
      essenceSource,
      linkedColor: active && color && (
        essenceSource === ESSENCE_SOURCE_LINKED ||
        essenceSource === ESSENCE_SOURCE_INVENTORY
      )
        ? color
        : "",
      essenceId: active && color
        ? pendingEssenceSource === ESSENCE_SOURCE_INVENTORY && color === pendingEssenceColor
          ? pendingEssenceId
          : originalColor === color
            ? essenceId
            : ""
        : "",
    };
  });

  return {
    slots,
    range: root.querySelector("[data-essenceur-range]")?.value || "melee",
  };
}

function readStateFromRoot(root) {
  return readEssenceurState(root);
}

export function writeEssenceurState(root, config = {}) {
  renderSlotCards(root, config);
  renderEssenceInventory(root);

  const rangeInput = root.querySelector("[data-essenceur-range]");
  if (rangeInput) rangeInput.value = normalizeRange(config.range ?? config.initialRange);


  updateInterface(root);
}

function updateSlots(root, preview) {
  root.querySelectorAll(".essenceur-slot-card").forEach((card, index) => {
    const slot = preview.slots[index] || {};
    card.dataset.active = slot.active && slot.color ? "true" : "false";
    card.dataset.color = slot.active ? slot.color : "";
  });
}

function setText(root, selector, value) {
  const node = root.querySelector(selector);
  if (node) node.textContent = value;
}

function renderAttackPreview(root, preview) {
  const natureParts = [];
  if (preview.red > 0) {
    natureParts.push(`${makePicto("physicalDamage")} Phys ${preview.shares.red}%`);
  }
  if (preview.blue > 0) {
    natureParts.push(`${makePicto("magicalDamage")} Mag ${preview.shares.blue}%`);
  }
  if (preview.yellow > 0) {
    natureParts.push(`${makePicto("piercingDamage")} Perc ${preview.shares.yellow}%`);
  }

  const rangeIcon = preview.range === "range" ? "rangeAttack" : "meleeAttack";
  const lines = [
    {
      active: true,
      html: `${makePicto(rangeIcon)} Portee : ${preview.rangeLabel}`,
    },
    {
      active: preview.total > 0,
      html: `${makePicto(preview.natureIcon)} Type : ${preview.natureLabel}`,
    },
    {
      active: preview.total > 0,
      html: natureParts.length ? natureParts.join(" / ") : "Aucune essence active",
    },
  ];

  const target = root.querySelector("[data-essenceur-attack-preview]");
  if (!target) return;
  target.innerHTML = lines
    .map(line => `<div class="essenceur-attack-line${line.active ? " active" : ""}">${line.html}</div>`)
    .join("");
}

function renderEffects(root, preview) {
  const body = root.querySelector("[data-essenceur-effects]");
  if (!body) return;

  body.innerHTML = preview.allEffects.map(effect => `
    <tr class="${effect.available ? "essenceur-effect-available" : "essenceur-effect-disabled"}">
      <td>
        <div class="essenceur-effect-name">
          ${makePicto(effect.icon)}
          <span>${effect.name}</span>
        </div>
      </td>
      <td><span class="essenceur-tag ${effect.available ? "ok" : "no"}">${effect.available ? "Oui" : "Non"}</span></td>
      <td>${effect.condition}</td>
      <td>${effect.description}</td>
      <td>${effect.ratio}</td>
    </tr>
  `).join("");
}

function updateInterface(root) {
  const preview = calculateEssenceurPreview(readStateFromRoot(root));
  updateSlots(root, preview);

  setText(root, "[data-essenceur-effective-nature]", preview.natureLabel);
  setText(root, "[data-essenceur-dominant]", preview.dominantLabel);
  setText(
    root,
    "[data-essenceur-profile]",
    `Rouge ${preview.red} / Bleu ${preview.blue} / Jaune ${preview.yellow}`
  );
  setText(root, "[data-essenceur-available-count]", String(preview.availableEffects.length));
  setText(
    root,
    "[data-essenceur-status]",
    `${preview.slotCount}/${MAX_ESSENCEUR_SLOTS} chasses possedees - ${preview.activeSlotCount} equipees`
  );

  const bars = [
    ["red", preview.shares.red],
    ["blue", preview.shares.blue],
    ["yellow", preview.shares.yellow],
  ];
  bars.forEach(([color, value]) => {
    const fill = root.querySelector(`[data-essenceur-bar="${color}"]`);
    const label = root.querySelector(`[data-essenceur-share="${color}"]`);
    if (fill) fill.style.width = `${value}%`;
    if (label) label.textContent = `${value}%`;
  });

  renderAttackPreview(root, preview);
  renderEffects(root, preview);
  syncSlotCardClearGuards(root);
}

function applyPreset(root, name) {
  const presets = {
    "red-blue": [
      ATTACK_ESSENCE_COLORS.RED,
      ATTACK_ESSENCE_COLORS.RED,
      ATTACK_ESSENCE_COLORS.RED,
      ATTACK_ESSENCE_COLORS.BLUE,
      "",
      "",
      "",
      "",
      "",
    ],
    "pure-yellow": [
      ATTACK_ESSENCE_COLORS.YELLOW,
      ATTACK_ESSENCE_COLORS.YELLOW,
      ATTACK_ESSENCE_COLORS.YELLOW,
      "",
      "",
      "",
      "",
      "",
      "",
    ],
    tri: [
      ATTACK_ESSENCE_COLORS.RED,
      ATTACK_ESSENCE_COLORS.RED,
      ATTACK_ESSENCE_COLORS.RED,
      ATTACK_ESSENCE_COLORS.BLUE,
      ATTACK_ESSENCE_COLORS.BLUE,
      ATTACK_ESSENCE_COLORS.YELLOW,
      ATTACK_ESSENCE_COLORS.YELLOW,
      "",
      "",
    ],
    reset: ["", "", "", "", "", "", "", "", ""],
  };

  const colors = presets[name] || presets.reset;
  root.querySelectorAll(".essenceur-slot-card").forEach((card, index) => {
    const color = colors[index] || "";
    const activeInput = card.querySelector(".essenceur-slot-active");
    const select = card.querySelector(".essenceur-slot-select");
    if (activeInput) activeInput.checked = Boolean(color);
    if (select) select.value = color;
  });

  updateInterface(root);
}

function setApplyStatus(root, message = "", state = "") {
  const status = root.querySelector("[data-essenceur-apply-status]");
  if (!status) return;
  status.textContent = message;
  status.dataset.state = state;
}

function populateAttackSelect(root, target) {
  const select = root.querySelector("[data-essenceur-attack]");
  if (!select) return;

  select.innerHTML = "";
  const attacks = Array.isArray(target?.attacks) ? target.attacks : [];
  attacks.forEach((attackOption, index) => {
    const option = document.createElement("option");
    option.value = attackOption.attackKey;
    option.textContent = attackOption.label || `Attaque ${index + 1}`;
    select.appendChild(option);
  });
}

function getSelectedEssenceurTarget(root, targets = []) {
  const entitySelect = root.querySelector("[data-essenceur-entity]");
  const attackSelect = root.querySelector("[data-essenceur-attack]");
  const entityId = entitySelect?.value;
  const target = targets.find(entry => entry.entityId === entityId) || targets[0] || null;
  const attacks = Array.isArray(target?.attacks) ? target.attacks : [];
  const attackKey = attackSelect?.value;
  const attackOption = attacks.find(entry => entry.attackKey === attackKey) || attacks[0] || null;

  return { target, attackOption };
}

function loadSelectedAttackIntoInterface(root, targets = []) {
  const { target, attackOption } = getSelectedEssenceurTarget(root, targets);

  if (!target || !attackOption?.attack) {
    setApplyStatus(root, "Aucune attaque disponible.", "warning");
    return;
  }

  const config = getEssenceurConfigFromAttack(attackOption.attack, target.entity);
  writeEssenceurState(root, config);
  setApplyStatus(root, `${attackOption.label} chargee.`, "ready");
}

function populateTargetControls(root, targets = [], options = {}) {
  const controls = root.querySelector("[data-essenceur-target-controls]");
  const entitySelect = root.querySelector("[data-essenceur-entity]");
  if (!controls || !entitySelect) return;

  if (!targets.length) {
    controls.classList.add("is-hidden");
    return;
  }

  controls.classList.remove("is-hidden");
  entitySelect.innerHTML = "";

  targets.forEach((target, index) => {
    const option = document.createElement("option");
    option.value = target.entityId;
    option.textContent = target.label || `Entite ${index + 1}`;
    entitySelect.appendChild(option);
  });

  const requestedEntityId = options.initialEntityId !== undefined
    ? String(options.initialEntityId)
    : "";
  if (requestedEntityId && targets.some(target => target.entityId === requestedEntityId)) {
    entitySelect.value = requestedEntityId;
  }

  const selectedTarget = getSelectedEssenceurTarget(root, targets).target;
  populateAttackSelect(root, selectedTarget);

  const attackSelect = root.querySelector("[data-essenceur-attack]");
  const requestedAttackKey = options.initialAttackKey ? String(options.initialAttackKey) : "";
  if (
    attackSelect &&
    requestedAttackKey &&
    Array.from(attackSelect.options).some(option => option.value === requestedAttackKey)
  ) {
    attackSelect.value = requestedAttackKey;
  }

  loadSelectedAttackIntoInterface(root, targets);
}

function resolveEssenceurSelectionIds(config, entity, attack) {
  const slots = getNormalizedConfigSlots(config);
  const reservedIds = new Set(slots.filter(slot => slot.active).map(readEssenceInstanceId).filter(Boolean));
  const equippedOnAttack = new Set(getEssenceurSlotsFromAttack(attack).map(readEssenceInstanceId).filter(Boolean));
  const items = readEntityLinkedEssenceItems(entity);
  const universalItems = loadUniversalEssenceItems();
  return {
    ...config,
    slots: slots.map(slot => {
      if (!slot.active || slot.essenceId) return slot;
      const candidates = slot.essenceSource === ESSENCE_SOURCE_INVENTORY ? universalItems : items;
      const item = candidates.find(candidate => (
        candidate.color === slot.color &&
        !reservedIds.has(candidate.id) &&
        (candidate.state === "available" || equippedOnAttack.has(candidate.id))
      ));
      if (!item) return slot;
      reservedIds.add(item.id);
      return { ...slot, essenceId: item.id };
    }),
  };
}

async function applyCurrentAttackEssences(root, options = {}, targets = []) {
  if (typeof options.onApply !== "function") {
    setApplyStatus(root, "Aucune sauvegarde branchee.", "warning");
    return;
  }

  const { target, attackOption } = getSelectedEssenceurTarget(root, targets);
  if (!target || !attackOption?.attack) {
    setApplyStatus(root, "Selection invalide.", "error");
    return;
  }

  const state = resolveEssenceurSelectionIds(readStateFromRoot(root), target.entity, attackOption.attack);

  const preview = calculateEssenceurPreview(state);
  const stagedPatch = buildAttackEssencePatch(state, attackOption.attack);
  const patch = bindUniversalPatchEssences(stagedPatch);
  const previousEssenceSlots = Array.isArray(attackOption.attack.essenceSlots)
    ? attackOption.attack.essenceSlots.map(slot => ({ ...slot }))
    : [];
  const inventoryTransaction = previewAttackEssenceEquipTransaction({
    entity: target.entity,
    attackKey: attackOption.attackKey,
    previousSlots: previousEssenceSlots,
    nextSlots: patch.essenceSlots || [],
    stagedNextSlots: stagedPatch.essenceSlots || [],
  });
  const applyButton = root.querySelector("[data-essenceur-apply]");

  if (!inventoryTransaction.ok) {
    const universalMissing = inventoryTransaction.universal?.missing || {};
    const linkedMissing = inventoryTransaction.linked?.missing || {};
    const missingText = [
      ...ESSENCE_COLORS
        .filter(color => universalMissing[color])
        .map(color => `${COLOR_LABELS[color]} universelle x${universalMissing[color]}`),
      ...ESSENCE_COLORS
        .filter(color => linkedMissing[color])
        .map(color => `${COLOR_LABELS[color]} liee x${linkedMissing[color]}`),
    ].join(" / ");
    setApplyStatus(root, inventoryTransaction.message || `Essences manquantes : ${missingText}.`, "error");
    return;
  }

  if (hasInventoryEssenceSlots(stagedPatch.essenceSlots || [])) {
    const accepted = await confirmUniversalEssenceBinding({
      entity: target.entity,
      color: ESSENCE_COLORS.find(color => inventoryTransaction.universalBindings?.added?.[color] > 0) || "",
    });
    if (!accepted) {
      setApplyStatus(root, "Liaison annulee.", "warning");
      return;
    }
  }

  if (applyButton) applyButton.disabled = true;
  setApplyStatus(root, "Application...", "pending");

  try {
    const result = await options.onApply({
      entityId: target.entityId,
      entity: target.entity,
      attackKey: attackOption.attackKey,
      attack: attackOption.attack,
      patch,
      state,
      preview,
      essenceTransaction: inventoryTransaction,
      previousEssenceSlots,
      nextEssenceSlots: patch.essenceSlots || [],
      stagedNextEssenceSlots: stagedPatch.essenceSlots || [],
    });

    if (result?.entity) target.entity = result.entity;
    if (result?.attack) {
      attackOption.attack = result.attack;
      attackOption.attackKey = readAttackDefinitionKey(result.attack) || attackOption.attackKey;
      attackOption.label = getAttackDisplayLabel(result.attack);
    }

    if (result?.ok !== false && result?.essenceTransactionCommitted !== true) {
      const committed = commitAttackEssenceEquipTransaction({
        entity: result?.entity || target.entity,
        attackKey: attackOption.attackKey,
        preparedTransaction: inventoryTransaction,
        previousSlots: previousEssenceSlots,
        nextSlots: patch.essenceSlots || [],
        stagedNextSlots: stagedPatch.essenceSlots || [],
      });
      if (!committed.ok) {
        setApplyStatus(root, committed.message || "Sertissage refuse.", "error");
        return;
      }
      renderEssenceInventory(root);
      writeEssenceurState(root, getEssenceurConfigFromAttack(result?.attack || attackOption.attack, result?.entity || target.entity));
    }

    setApplyStatus(root, result?.message || "Attaque sauvegardee.", result?.ok === false ? "error" : "ok");
  } catch (error) {
    console.error("Erreur Encensseur :", error);
    setApplyStatus(root, "Erreur pendant la sauvegarde.", "error");
  } finally {
    if (applyButton) applyButton.disabled = false;
  }
}

export function createEssenceurInterface(options = {}) {
  if (!requireSafeMenuAccess()) return null;
  const root = document.createElement("div");
  root.className = "essenceur-interface";
  const targets = Array.isArray(options.targets) ? options.targets : [];
  root.dataset.gameplayMode = targets.length > 0 ? "true" : "false";

  root.innerHTML = `
    <div class="essenceur-header">
      <span class="essenceur-picto" aria-hidden="true"></span>
      <div class="essenceur-title">Encensseur</div>
      <button class="close-button essenceur-close" type="button" aria-label="Fermer l'Encensseur">x</button>
    </div>

    <div class="essenceur-tabs" role="tablist" aria-label="Navigation de l'Encensseur">
      <button class="essenceur-tab-button active" type="button" data-essenceur-tab="infuse" role="tab" aria-selected="true">Encenser une attaque</button>
      <button class="essenceur-tab-button" type="button" data-essenceur-tab="purchase" role="tab" aria-selected="false">Achat d'essence</button>
    </div>

    <div class="essenceur-body" data-essenceur-tab-panel="infuse">
      <section class="essenceur-panel essenceur-builder-panel" aria-label="Constructeur d'essences">
        <div class="essenceur-panel-header">
          <h2 class="essenceur-panel-title">Chasses</h2>
          <span class="essenceur-panel-hint">10 ouvertes max</span>
        </div>

        <div class="essenceur-target-controls is-hidden" data-essenceur-target-controls>
          <div class="essenceur-field">
            <label>Entite</label>
            <select data-essenceur-entity></select>
          </div>
          <div class="essenceur-field">
            <label>Attaque</label>
            <select data-essenceur-attack></select>
          </div>
          <button class="essenceur-apply-button" type="button" data-essenceur-apply>Appliquer</button>
          <span class="essenceur-apply-status" data-essenceur-apply-status></span>
        </div>

        <div class="essenceur-controls">
          <div class="essenceur-field">
            <label>Portee</label>
            <select data-essenceur-range>
              <option value="melee">Melee</option>
              <option value="range">Distance</option>
            </select>
          </div>
        </div>

        <div class="essenceur-toolbar" aria-label="Presets">
          <button type="button" data-essenceur-preset="red-blue">3 rouge + 1 bleu</button>
          <button type="button" data-essenceur-preset="pure-yellow">Pure jaune</button>
          <button type="button" data-essenceur-preset="tri">3 couleurs</button>
          <button type="button" data-essenceur-preset="reset">Reset</button>
        </div>

        <div class="essenceur-inventory" data-essenceur-inventory></div>

        <div class="essenceur-slot-grid" data-essenceur-slots aria-label="Essences"></div>
      </section>

      <section class="essenceur-panel essenceur-result-panel" aria-label="Resultat">
        <div class="essenceur-panel-header">
          <h2 class="essenceur-panel-title">Resultat</h2>
          <span class="essenceur-panel-hint" data-essenceur-status aria-live="polite"></span>
        </div>

        <div class="essenceur-summary-grid">
          <div class="essenceur-metric">
            <div class="essenceur-metric-label">Nature effective</div>
            <div class="essenceur-metric-value small" data-essenceur-effective-nature>Aucune</div>
          </div>
          <div class="essenceur-metric">
            <div class="essenceur-metric-label">Dominante</div>
            <div class="essenceur-metric-value" data-essenceur-dominant>Aucune</div>
          </div>
          <div class="essenceur-metric">
            <div class="essenceur-metric-label">Profil</div>
            <div class="essenceur-metric-value small" data-essenceur-profile>Rouge 0 / Bleu 0 / Jaune 0</div>
          </div>
          <div class="essenceur-metric">
            <div class="essenceur-metric-label">Effets disponibles</div>
            <div class="essenceur-metric-value" data-essenceur-available-count>0</div>
          </div>
        </div>

        <div class="essenceur-bars" aria-label="Parts de degats">
          <div class="essenceur-bar-row">
            <div class="essenceur-bar-label">${makePicto("physicalDamage")} Phys</div>
            <div class="essenceur-bar-track"><div class="essenceur-bar-fill red" data-essenceur-bar="red"></div></div>
            <div data-essenceur-share="red">0%</div>
          </div>
          <div class="essenceur-bar-row">
            <div class="essenceur-bar-label">${makePicto("magicalDamage")} Mag</div>
            <div class="essenceur-bar-track"><div class="essenceur-bar-fill blue" data-essenceur-bar="blue"></div></div>
            <div data-essenceur-share="blue">0%</div>
          </div>
          <div class="essenceur-bar-row">
            <div class="essenceur-bar-label">${makePicto("piercingDamage")} Perc</div>
            <div class="essenceur-bar-track"><div class="essenceur-bar-fill yellow" data-essenceur-bar="yellow"></div></div>
            <div data-essenceur-share="yellow">0%</div>
          </div>
        </div>

        <div class="essenceur-attack-preview" data-essenceur-attack-preview aria-label="Apercu attaque"></div>

        <div class="essenceur-effect-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Effet disponible</th>
                <th>Etat</th>
                <th>Condition</th>
                <th>Description courte</th>
                <th>Ratio / regle</th>
              </tr>
            </thead>
            <tbody data-essenceur-effects></tbody>
          </table>
        </div>
      </section>
    </div>

    <div class="essenceur-purchase-body is-hidden" data-essenceur-tab-panel="purchase">
      <section class="essenceur-panel essenceur-purchase-panel" aria-label="Achat d'essences universelles">
        <div class="essenceur-panel-header">
          <h2 class="essenceur-panel-title">Achat d'essence</h2>
          <span class="essenceur-panel-hint">Essences universelles</span>
        </div>
        <div class="essenceur-purchase-intro">
          Ces essences rejoignent l'inventaire universel du joueur. Elles pourront ensuite etre enchassees dans une attaque, puis seront liees a l'entite qui les utilise.
        </div>
        <div class="essenceur-purchase-shop" data-essenceur-purchase-shop></div>
        <div class="essenceur-purchase-actions">
          <button class="seller-button essenceur-purchase-confirm" type="button" data-essenceur-purchase-confirm>Acheter</button>
          <div class="essenceur-purchase-status" data-essenceur-purchase-status aria-live="polite"></div>
        </div>
      </section>
    </div>
  `;

  renderEssenceInventory(root);
  renderEssencePurchaseShop(root);
  setEssenceurTab(root, "infuse");

  const slotsRoot = root.querySelector("[data-essenceur-slots]");
  const initialSlots = Array.isArray(options.initialSlots) ? options.initialSlots : [];
  if (!targets.length) {
    const demoSlots = initialSlots.length
      ? getNormalizedConfigSlots({ slots: initialSlots }, MAX_ESSENCEUR_SLOTS, { fillToMax: true })
      : getNormalizedConfigSlots({ slots: [] }, MAX_ESSENCEUR_SLOTS, { fillToMax: true });

    demoSlots.forEach((slot, index) => {
      const initialColor = slot.active ? normalizeColor(slot.color) : "";
      slotsRoot?.appendChild(createSlot(index + 1, initialColor, slot));
    });
  }

  const rangeInput = root.querySelector("[data-essenceur-range]");
  if (rangeInput) rangeInput.value = normalizeRange(options.initialRange);


  root.addEventListener("change", event => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.matches("[data-essenceur-entity]")) {
      populateAttackSelect(root, getSelectedEssenceurTarget(root, targets).target);
      loadSelectedAttackIntoInterface(root, targets);
      return;
    }

    if (target.matches("[data-essenceur-attack]")) {
      loadSelectedAttackIntoInterface(root, targets);
      return;
    }

    const slotCard = target.closest(".essenceur-slot-card");
    if (slotCard) selectSlotCard(root, slotCard);
    if (slotCard && target.matches(".essenceur-slot-select")) {
      const nextColor = normalizeColor(target.value);
      const activeInput = slotCard.querySelector(".essenceur-slot-active");
      delete slotCard.dataset.pendingEssenceSource;
      delete slotCard.dataset.pendingEssenceColor;
      delete slotCard.dataset.pendingEssenceId;


      if (activeInput) activeInput.checked = Boolean(nextColor);
    }
    if (slotCard && target.matches(".essenceur-slot-active") && !target.checked) {
      const select = slotCard.querySelector(".essenceur-slot-select");
      delete slotCard.dataset.pendingEssenceSource;
      delete slotCard.dataset.pendingEssenceColor;
      delete slotCard.dataset.pendingEssenceId;
      if (select) select.value = "";
    }

    if (
      target.matches(".essenceur-slot-select") ||
      target.matches(".essenceur-slot-active") ||
      target.matches("[data-essenceur-range]")
    ) {
      setApplyStatus(root, targets.length ? "Modification non appliquee." : "", targets.length ? "pending" : "");
      updateInterface(root);
    }
  });

  root.addEventListener("dragstart", event => {
    const token = event.target.closest?.("[data-essenceur-inventory-color]");
    if (!token) return;

    const color = normalizeColor(token.dataset.essenceurInventoryColor);
    if (!color || token.dataset.essenceAvailable !== "true") {
      event.preventDefault();
      return;
    }

    event.dataTransfer?.setData("application/x-essence-color", color);
    event.dataTransfer?.setData("application/x-essence-id", String(token.dataset.essenceId || ""));
    event.dataTransfer?.setData("text/plain", color);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";
  });

  root.addEventListener("dragover", event => {
    const slotCard = event.target.closest?.(".essenceur-slot-card");
    if (!slotCard || slotCard.dataset.locked === "true") return;
    event.preventDefault();
    slotCard.classList.add("drag-over");
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  });

  root.addEventListener("dragleave", event => {
    const slotCard = event.target.closest?.(".essenceur-slot-card");
    if (slotCard) slotCard.classList.remove("drag-over");
  });

  root.addEventListener("drop", event => {
    const slotCard = event.target.closest?.(".essenceur-slot-card");
    if (!slotCard || slotCard.dataset.locked === "true") return;

    const color = normalizeColor(
      event.dataTransfer?.getData("application/x-essence-color") ||
      event.dataTransfer?.getData("text/plain")
    );
    const essenceId = String(event.dataTransfer?.getData("application/x-essence-id") || "").trim();
    if (!color) return;

    event.preventDefault();
    slotCard.classList.remove("drag-over");
    selectSlotCard(root, slotCard);
    setSlotCardColor(slotCard, color, {
      pendingEssenceSource: ESSENCE_SOURCE_INVENTORY,
      pendingEssenceId: essenceId,
    });
    setApplyStatus(root, targets.length ? "Modification non appliquee." : "", targets.length ? "pending" : "");
    updateInterface(root);
  });

  root.addEventListener("click", async event => {
    const closeButton = event.target.closest?.(".essenceur-close");
    if (closeButton) {
      root.dispatchEvent(new CustomEvent("essenceur:destroy"));
      if (typeof options.onClose === "function") options.onClose(root);
      else root.remove();
      return;
    }

    const tabButton = event.target.closest?.("[data-essenceur-tab]");
    if (tabButton) {
      setEssenceurTab(root, tabButton.dataset.essenceurTab);
      return;
    }

    const applyButton = event.target.closest?.("[data-essenceur-apply]");
    if (applyButton) {
      await applyCurrentAttackEssences(root, options, targets);
      return;
    }

    const purchaseConfirmButton = event.target.closest?.("[data-essenceur-purchase-confirm]");
    if (purchaseConfirmButton) {
      purchaseUniversalEssence(root, purchaseConfirmButton.dataset.essenceurPurchaseConfirm || "");
      return;
    }

    const purchaseCard = event.target.closest?.(".essenceur-purchase-card[data-essenceur-purchase-color]");
    if (purchaseCard) {
      selectEssencePurchaseCard(root, purchaseCard);
      return;
    }

    const clearButton = event.target.closest?.("[data-essenceur-slot-clear]");
    if (clearButton) {
      const slotCard = clearButton.closest(".essenceur-slot-card");
      if (slotCard) {
        selectSlotCard(root, slotCard);
        const cleared = clearSlotCard(root, slotCard);
        if (cleared) {
          setApplyStatus(root, targets.length ? "Modification non appliquee." : "", targets.length ? "pending" : "");
        }
        updateInterface(root);
      }
      return;
    }

    const inventoryToken = event.target.closest?.("[data-essenceur-inventory-color]");
    if (inventoryToken) {
      const color = normalizeColor(inventoryToken.dataset.essenceurInventoryColor);
      const essenceId = String(inventoryToken.dataset.essenceId || "").trim();
      if (
        color &&
        inventoryToken.dataset.essenceAvailable === "true" &&
        equipColorOnSelectedSlot(root, color, essenceId)
      ) {
        setApplyStatus(root, targets.length ? "Modification non appliquee." : "", targets.length ? "pending" : "");
        updateInterface(root);
      }
      return;
    }

    const clickedSlot = event.target.closest?.(".essenceur-slot-card");
    if (clickedSlot) {
      selectSlotCard(root, clickedSlot);
      return;
    }

    const presetButton = event.target.closest?.("[data-essenceur-preset]");
    if (!presetButton) return;
    applyPreset(root, presetButton.dataset.essenceurPreset);
    setApplyStatus(root, targets.length ? "Preset non applique." : "", targets.length ? "pending" : "");
  });

  root.addEventListener("dblclick", event => {
    const purchaseCard = event.target.closest?.(".essenceur-purchase-card[data-essenceur-purchase-color]");
    if (!purchaseCard) return;

    event.preventDefault();
    event.stopPropagation();
    purchaseUniversalEssence(root, purchaseCard.dataset.essenceurPurchaseColor);
  });

  root.addEventListener("keydown", event => {
    if (event.key !== "Enter" && event.key !== " ") return;

    const purchaseCard = event.target.closest?.(".essenceur-purchase-card[data-essenceur-purchase-color]");
    if (!purchaseCard) return;

    event.preventDefault();
    selectEssencePurchaseCard(root, purchaseCard);
    if (event.key === "Enter") {
      purchaseUniversalEssence(root, purchaseCard.dataset.essenceurPurchaseColor);
    }
  });

  if (targets.length > 0) {
    root.querySelector(".essenceur-builder-panel")?.classList.add("has-targets");
    populateTargetControls(root, targets, options);
  } else if (initialSlots.length > 0) {
    updateInterface(root);
  } else {
    applyPreset(root, options.initialPreset || "red-blue");
  }

  root.updateEssenceur = () => updateInterface(root);
  root.readEssenceurState = () => readEssenceurState(root);
  root.writeEssenceurState = config => writeEssenceurState(root, config);

  if (typeof window !== "undefined") {
    const onEssenceInventoryUpdated = () => {
      renderEssenceInventory(root);
      renderEssencePurchaseShop(root);
    };
    window.addEventListener("essenceInventoryUpdated", onEssenceInventoryUpdated);
    root.addEventListener("essenceur:destroy", () => {
      window.removeEventListener("essenceInventoryUpdated", onEssenceInventoryUpdated);
    }, { once: true });
  }

  return root;
}
