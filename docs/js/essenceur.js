import {
  ATTACK_ESSENCE_COLORS,
  ATTACK_ESSENCE_MAX_SLOTS,
  ATTACK_ESSENCE_SLOT_SOURCES,
  ensureEntityAttackInstances,
  getAttackEssenceColorsFromNatures,
  normalizeAttackEssenceColor,
  readAttackDefinitionKey,
} from "./attackResolution.js";

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
    infusedLabel: "force",
    type: "Essence",
    statKey: "attackEssenceRed",
    spriteClass: "strength",
  },
  [ATTACK_ESSENCE_COLORS.BLUE]: {
    name: "Essence d'Intelligence",
    infusedLabel: "intelligence",
    type: "Essence",
    statKey: "attackEssenceBlue",
    spriteClass: "intelligence",
  },
  [ATTACK_ESSENCE_COLORS.YELLOW]: {
    name: "Essence d'Agilité",
    infusedLabel: "agilité",
    type: "Essence",
    statKey: "attackEssenceYellow",
    spriteClass: "agility",
  },
});

const ESSENCE_INVENTORY_PLAYER_SAVE_KEY = "attackEssenceInventory";
const ENTITY_LINKED_ESSENCE_INVENTORY_KEY = "attackEssenceInventory";
const ESSENCE_SOURCE_INVENTORY = "inventory";
const ESSENCE_SOURCE_LINKED = "linked";
const ESSENCE_SOURCE_LEGACY_FREE = "legacy-free";
const EMPTY_ESSENCE_HELPER_STAT = "attackEssenceEmpty";
const ESSENCE_COLORS = [
  ATTACK_ESSENCE_COLORS.RED,
  ATTACK_ESSENCE_COLORS.BLUE,
  ATTACK_ESSENCE_COLORS.YELLOW,
];
const ATTACK_ESSENCE_SOCKET_COLUMN_ORDER = [3, 2, 4, 1];

const ESSENCE_SPRITE_SOURCES = Object.freeze({
  strength: {
    back: "/media/assets/misc/essence-strength-02.png",
    front: "/media/assets/misc/essence-strength-03.png",
    backMin: "/media/assets/misc/essence-strength-02-min.png",
    frontMin: "/media/assets/misc/essence-strength-03-min.png",
    backClass: "essence-strength-02",
    frontClass: "essence-strength-03",
  },
  intelligence: {
    back: "/media/assets/misc/essence-agility-02.png",
    front: "/media/assets/misc/essence-agility-03.png",
    backMin: "/media/assets/misc/essence-agility-02-min.png",
    frontMin: "/media/assets/misc/essence-agility-03-min.png",
    backClass: "essence-agility-02",
    frontClass: "essence-agility-03",
  },
  agility: {
    back: "/media/assets/misc/essence-agility-02.png",
    front: "/media/assets/misc/essence-agility-03.png",
    backMin: "/media/assets/misc/essence-agility-02-min.png",
    frontMin: "/media/assets/misc/essence-agility-03-min.png",
    backClass: "essence-agility-02",
    frontClass: "essence-agility-03",
  },
  default: {
    back: "/media/assets/misc/essence-agility-02.png",
    front: "/media/assets/misc/essence-agility-03.png",
    backMin: "/media/assets/misc/essence-agility-02-min.png",
    frontMin: "/media/assets/misc/essence-agility-03-min.png",
    backClass: "essence-agility-02",
    frontClass: "essence-agility-03",
  },
});

function normalizeEssenceSource(source = "") {
  const normalized = String(source || "");
  return normalized === "native"
    ? ESSENCE_SOURCE_LINKED
    : normalized;
}

function readLinkedEssenceColor(slot = {}) {
  return normalizeColor(slot?.linkedColor ?? slot?.nativeColor);
}

function isInitialAttackFamilySlot(slot = {}) {
  const source = String(slot.source || "");
  return source === ATTACK_ESSENCE_SLOT_SOURCES.INITIAL_FAMILY ||
    source === ATTACK_ESSENCE_SLOT_SOURCES.LEGACY_NATURE ||
    slot.kind === "native";
}

const LINKED_LEVEL_THREE_UMBRA_ESSENCES = Object.freeze([
  { statKey: "bloodFury", color: ATTACK_ESSENCE_COLORS.RED, label: "Fureur sanguinaire" },
  { statKey: "indestructibility", color: ATTACK_ESSENCE_COLORS.RED, label: "Indestructibilite" },
  { statKey: "weaponMastery", color: ATTACK_ESSENCE_COLORS.RED, label: "Maitrise d'arme" },
  { statKey: "hypercognition", color: ATTACK_ESSENCE_COLORS.BLUE, label: "Hypercognition" },
  { statKey: "transcendence", color: ATTACK_ESSENCE_COLORS.BLUE, label: "Transcendance" },
  { statKey: "mysticism", color: ATTACK_ESSENCE_COLORS.BLUE, label: "Mysticisme" },
  { statKey: "ambidextry", color: ATTACK_ESSENCE_COLORS.YELLOW, label: "Ambidextrie" },
  { statKey: "occultism", color: ATTACK_ESSENCE_COLORS.YELLOW, label: "Occultisme" },
  { statKey: "movement", color: ATTACK_ESSENCE_COLORS.YELLOW, label: "Mouvement" },
]);
const LINKED_ESSENCE_MODIFIER_SOURCES = Object.freeze([
  "archetype",
  "level",
  "adminLevel",
  "statLeveled",
]);

const EFFECT_DEFINITIONS = [
  {
    id: "physical-damage",
    name: "Degats physiques",
    icon: "physicalDamage",
    condition: "Essence rouge",
    description: "Ajoute une source physique a l'attaque.",
    ratio: "part rouge / total essences",
    isAvailable: state => state.red > 0,
  },
  {
    id: "vigueur",
    name: "Vigueur",
    icon: "vigueur",
    condition: "Essence rouge",
    description: "Umbra offensive Force niveau 1 : puissance physique.",
    ratio: "flat physique + ratio Force",
    isAvailable: state => state.red > 0,
  },
  {
    id: "brutality",
    name: "Brutalite",
    icon: "brutality",
    condition: "Essence rouge",
    description: "Umbra offensive Force niveau 2 : penetration physique.",
    ratio: "physicalPen + ratio Force",
    isAvailable: state => state.red > 0,
  },
  {
    id: "bloodFury",
    name: "Fureur sanguinaire",
    icon: "bloodFury",
    condition: "Essence rouge",
    description: "Umbra offensive Force niveau 3 : execution et vol de vie.",
    ratio: "seuil, chance et degats d'execution",
    isAvailable: state => state.red > 0,
  },
  {
    id: "magical-damage",
    name: "Degats magiques",
    icon: "magicalDamage",
    condition: "Essence bleue",
    description: "Ajoute une source magique a l'attaque.",
    ratio: "part bleue / total essences",
    isAvailable: state => state.blue > 0,
  },
  {
    id: "esprit",
    name: "Esprit",
    icon: "esprit",
    condition: "Essence bleue",
    description: "Umbra offensive Intelligence niveau 1 : puissance magique.",
    ratio: "flat magique + ratio Intelligence",
    isAvailable: state => state.blue > 0,
  },
  {
    id: "inflexion",
    name: "Inflexion",
    icon: "inflexion",
    condition: "Essence bleue",
    description: "Umbra offensive Intelligence niveau 2 : penetration magique.",
    ratio: "magicalPen + ratio Intelligence",
    isAvailable: state => state.blue > 0,
  },
  {
    id: "hypercognition",
    name: "Hypercognition",
    icon: "hypercognition",
    condition: "Option active",
    description: "Ajoute une essence magique virtuelle a l'attaque.",
    ratio: "+1 essence bleue hors chasse",
    isAvailable: state => state.hypercognitionBonus > 0,
  },
  {
    id: "piercing-damage",
    name: "Degats percants",
    icon: "piercingDamage",
    condition: "Essence jaune",
    description: "Ajoute une source percante a l'attaque.",
    ratio: "part jaune / total essences",
    isAvailable: state => state.yellow > 0,
  },
  {
    id: "finesse",
    name: "Finesse",
    icon: "finesse",
    condition: "Essence jaune",
    description: "Umbra offensive Agilite niveau 1 : puissance percante.",
    ratio: "flat percant + ratio Agilite",
    isAvailable: state => state.yellow > 0,
  },
  {
    id: "critical",
    name: "Coup critique",
    icon: "criticalPower",
    condition: "Essence jaune et non pure magique",
    description: "Umbra offensive Agilite niveau 2 : critique.",
    ratio: "criticalPower + Agilite + Precision",
    isAvailable: state => state.yellow > 0 && !state.isPureMagical,
  },
  {
    id: "ambidextry",
    name: "Ambidextrie",
    icon: "ambidextry",
    condition: "Essence jaune et non pure magique",
    description: "Umbra offensive Agilite niveau 3 : second coup.",
    ratio: "chance + degats du second coup",
    isAvailable: state => state.yellow > 0 && !state.isPureMagical,
  },
  {
    id: "piercing-recovery",
    name: "Recuperation percante",
    icon: "recuperationTime",
    condition: "Essence jaune",
    description: "Reduit la recuperation si l'attaque possede une part percante.",
    ratio: "piercing recovery + Agilite",
    isAvailable: state => state.yellow > 0,
  },
  {
    id: "transpiercing",
    name: "Transpercement",
    icon: "transpiercingDamage",
    condition: "Pure jaune",
    description: "Une attaque purement percante devient transpercante.",
    ratio: "piercingDamage + ratio Agilite",
    isAvailable: state => state.isPureYellow,
  },
  {
    id: "perforation",
    name: "Perforation",
    icon: "perforation",
    condition: "Pure jaune",
    description: "Ignore l'armure sur une attaque purement percante.",
    ratio: "actif uniquement en purete jaune",
    isAvailable: state => state.isPureYellow,
  },
  {
    id: "brutality-old",
    name: "Brutalite-old",
    icon: "brutality-old",
    condition: "Pure rouge",
    description: "Intensifie l'attaque purement physique.",
    ratio: "physicalDamage + ratio Force",
    isAvailable: state => state.isPureRed,
  },
  {
    id: "intellect",
    name: "Intellect",
    icon: "intellect",
    condition: "Pure bleue",
    description: "Intensifie l'attaque purement magique.",
    ratio: "magicalDamage + ratio Intelligence",
    isAvailable: state => state.isPureMagical,
  },
  {
    id: "broken-spell",
    name: "Foirage magique",
    icon: "brokenSpell",
    condition: "Pure bleue",
    description: "Risque propre aux attaques purement magiques.",
    ratio: "chance pilotee par Intelligence",
    isAvailable: state => state.isPureMagical,
  },
  {
    id: "undogeable",
    name: "Inesquivable",
    icon: "undogeable",
    condition: "Pure bleue",
    description: "Ignore l'esquive.",
    ratio: "pas de jet dodge",
    isAvailable: state => state.isPureMagical,
  },
  {
    id: "range-penalty",
    name: "Malus distance",
    icon: "rangeAttack",
    condition: "Distance et source physique/percante",
    description: "Les projectiles physiques ou percants subissent le ratio distance.",
    ratio: "calculateRangeRatio",
    isAvailable: state => state.range === "range" && (state.red > 0 || state.yellow > 0),
  },
  {
    id: "accuracy",
    name: "Chance d'atteindre",
    icon: "miss-shot",
    condition: "Distance et non pure magique",
    description: "Jet de precision des projectiles.",
    ratio: "calculateRangeAccuracy",
    isAvailable: state => state.range === "range" && !state.isPureMagical,
  },
  {
    id: "projectile-speed",
    name: "Vitesse projectile",
    icon: "executionTime",
    condition: "Distance",
    description: "Le temps d'execution pilote le trajet du projectile.",
    ratio: "executionTime + projectileTime",
    isAvailable: state => state.range === "range",
  },
  {
    id: "short-range",
    name: "Courte portee",
    icon: "meleeAttack",
    condition: "Melee",
    description: "Bonus d'execution natif du corps a corps.",
    ratio: "base melee + Force",
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

export function loadEssenceInventory() {
  const save = loadPlayerSaveForEssences();
  return normalizeEssenceInventory(save[ESSENCE_INVENTORY_PLAYER_SAVE_KEY]);
}

export function saveEssenceInventory(inventory = {}) {
  const save = loadPlayerSaveForEssences();
  const nextInventory = normalizeEssenceInventory(inventory);
  save[ESSENCE_INVENTORY_PLAYER_SAVE_KEY] = nextInventory;
  savePlayerSaveForEssences(save);

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("essenceInventoryUpdated", {
      detail: { inventory: { ...nextInventory } },
    }));
  }

  return nextInventory;
}

export function grantEssencesToInventory(delta = {}) {
  const inventory = loadEssenceInventory();
  ESSENCE_COLORS.forEach(color => {
    inventory[color] = Math.max(
      0,
      Math.floor(Number(inventory[color]) || 0) + Math.floor(Number(delta[color]) || 0)
    );
  });
  return saveEssenceInventory(inventory);
}

function normalizeAttackNatureList(value = []) {
  if (Array.isArray(value)) return value.map(entry => String(entry ?? "").trim()).filter(Boolean);
  const normalized = String(value ?? "").trim();
  return normalized ? [normalized] : [];
}

function getDefaultEssenceSource(slot = {}, color = "") {
  if (slot.essenceSource) return normalizeEssenceSource(slot.essenceSource);
  if (!color) return "";

  if (isInitialAttackFamilySlot(slot)) {
    return ESSENCE_SOURCE_LINKED;
  }

  const source = String(slot.source || "");
  if (source === ATTACK_ESSENCE_SLOT_SOURCES.CONFIGURED) {
    return ESSENCE_SOURCE_LEGACY_FREE;
  }

  return "";
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
    const slotSource = slot?.source || (
      rawKind === "native"
        ? ATTACK_ESSENCE_SLOT_SOURCES.INITIAL_FAMILY
        : "configured"
    );
    const slotKind = rawKind === "native" ? "open" : rawKind;
    const sourceSlot = slot && typeof slot === "object"
      ? { ...slot, kind: slotKind, source: slotSource }
      : { kind: slotKind, source: slotSource };
    const essenceSource = getDefaultEssenceSource(sourceSlot, active ? color : "");
    const linkedColor = normalizeColor(
      readLinkedEssenceColor(slot) ||
      (
        isInitialAttackFamilySlot(sourceSlot)
          ? color
          : ""
      )
    );

    return {
      slotId: String(slot?.slotId || slot?.id || `slot-${index + 1}`),
      kind: slotKind,
      locked: Boolean(slot?.locked),
      active,
      color: active ? color : "",
      source: slotSource,
      unlockId: slot?.unlockId || "",
      essenceSource,
      linkedColor,
    };
  });

  while (options.fillToMax === true && slots.length < maxSlots) {
    slots.push({
      slotId: `slot-${slots.length + 1}`,
      kind: "open",
      locked: false,
      active: false,
      color: "",
      source: "configured",
      unlockId: "",
      essenceSource: "",
      linkedColor: "",
    });
  }

  return slots;
}

function getActiveEssenceColorsFromConfig(config = {}) {
  return getNormalizedConfigSlots(config)
    .filter(slot => slot.active && slot.color)
    .map(slot => slot.color);
}

function countActiveEssenceSlots(config = {}) {
  return getNormalizedConfigSlots(config)
    .filter(slot => slot.active && slot.color)
    .length;
}

function canClearEssenceSlot(config = {}, slotIndex = 0) {
  const slots = getNormalizedConfigSlots(config);
  const index = Math.max(0, Math.floor(Number(slotIndex) || 0));
  const slot = slots[index];
  if (!slot || slot.locked || !slot.active || !slot.color) return false;
  return countActiveEssenceSlots({ slots }) > 1;
}

function hasActiveEssenceNature(config = {}) {
  return countActiveEssenceSlots(config) > 0;
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

function countEssencesInSlotsBySource(slots = [], source = "") {
  const wantedSource = normalizeEssenceSource(source);
  return getNormalizedConfigSlots({ slots }).reduce((counts, slot) => {
    if (
      slot.active &&
      slot.color &&
        normalizeEssenceSource(slot.essenceSource) === wantedSource
    ) {
      counts[slot.color] = (counts[slot.color] || 0) + 1;
    }
    return counts;
  }, normalizeEssenceInventory());
}

function readPlainNumber(value) {
  if (value && typeof value === "object") {
    if (Number.isFinite(Number(value.value))) return Number(value.value);
    if (Number.isFinite(Number(value.max))) return Number(value.max);
    if (Number.isFinite(Number(value.current))) return Number(value.current);
    return 0;
  }

  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function readInvestedModifierAmount(entity, statKey) {
  const durable = entity?.modifierStats?.durable || {};
  return LINKED_ESSENCE_MODIFIER_SOURCES.reduce((sum, sourceKey) => {
    const source = durable?.[sourceKey];
    if (!source || typeof source !== "object") return sum;
    return sum + Math.max(0, readPlainNumber(source[statKey]));
  }, 0);
}

function calculateGeneratedLinkedEssenceTotals(entity = {}) {
  const totals = normalizeEssenceInventory();
  const details = [];

  LINKED_LEVEL_THREE_UMBRA_ESSENCES.forEach(rule => {
    const amount = readInvestedModifierAmount(entity, rule.statKey);
    if (amount <= 0) return;

    totals[rule.color] = (totals[rule.color] || 0) + 1;
    details.push({
      ...rule,
      amount,
      count: 1,
    });
  });

  return { totals, details };
}

function readStoredLinkedEssenceInventory(entity = {}) {
  return normalizeEssenceInventory(entity?.[ENTITY_LINKED_ESSENCE_INVENTORY_KEY]?.linked);
}

function calculateInitialLinkedEssenceTotals(entity = {}) {
  const totals = normalizeEssenceInventory();

  normalizeAttackListForEssenceAccounting(entity).forEach(attack => {
    getEssenceurSlotsFromAttack(attack).forEach(slot => {
      const linkedColor = readLinkedEssenceColor(slot);
      if (!linkedColor) return;
      totals[linkedColor] = (totals[linkedColor] || 0) + 1;
    });
  });

  return totals;
}

export function calculateLinkedEssenceTotals(entity = {}) {
  const generated = calculateGeneratedLinkedEssenceTotals(entity);
  const stored = readStoredLinkedEssenceInventory(entity);
  const initial = calculateInitialLinkedEssenceTotals(entity);
  const totals = normalizeEssenceInventory();

  ESSENCE_COLORS.forEach(color => {
    totals[color] =
      Math.max(generated.totals[color] || 0, stored[color] || 0) +
      (initial[color] || 0);
  });

  return {
    totals,
    details: generated.details,
    generated,
    stored,
    initial,
  };
}

export function syncEntityLinkedEssenceInventory(entity = {}) {
  if (!entity || typeof entity !== "object") {
    return calculateLinkedEssenceTotals(entity);
  }

  const generated = calculateGeneratedLinkedEssenceTotals(entity);
  entity[ENTITY_LINKED_ESSENCE_INVENTORY_KEY] ??= {};
  entity[ENTITY_LINKED_ESSENCE_INVENTORY_KEY].linked = { ...generated.totals };
  entity[ENTITY_LINKED_ESSENCE_INVENTORY_KEY].linkedDetails = generated.details.map(detail => ({ ...detail }));

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("linkedEssenceInventoryUpdated", {
      detail: {
        entityId: entity.id ?? null,
        inventory: { ...generated.totals },
        details: generated.details.map(detail => ({ ...detail })),
      },
    }));
  }

  return calculateLinkedEssenceTotals(entity);
}

function normalizeAttackListForEssenceAccounting(entity = {}) {
  const raw = entity?.attackDetails;
  if (Array.isArray(raw)) return raw.filter(attack => attack && typeof attack === "object");
  if (raw && typeof raw === "object") {
    return Object.values(raw).filter(attack => attack && typeof attack === "object");
  }
  return [];
}

function getAttackAccountingKey(attack = {}) {
  return readAttackDefinitionKey(attack);
}

function countEntityEssencesBySource(entity = {}, source = "", options = {}) {
  const counts = normalizeEssenceInventory();
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

      if (
        slot.active &&
        slot.color &&
        normalizeEssenceSource(slot.essenceSource) === source
      ) {
        counts[slot.color] = (counts[slot.color] || 0) + 1;
      }
    });
  });

  return counts;
}

export function calculateEntityLinkedEssenceAvailability(entity = {}) {
  const linkedTotals = calculateLinkedEssenceTotals(entity);
  const linkedEquipped = countEntityEssencesBySource(entity, ESSENCE_SOURCE_LINKED);
  const linkedAvailable = normalizeEssenceInventory();

  ESSENCE_COLORS.forEach(color => {
    linkedAvailable[color] = Math.max(
      0,
      (linkedTotals.totals[color] || 0) - (linkedEquipped[color] || 0)
    );
  });

  return {
    available: linkedAvailable,
    total: linkedTotals.totals,
    equipped: linkedEquipped,
    details: linkedTotals.details,
  };
}

export function getAttackEssenceAvailabilityForSlot(entity = {}, attack = {}, slotIndex = 0) {
  const slots = getEssenceurSlotsFromAttack(attack);
  const normalizedSlotIndex = Math.max(0, Math.floor(Number(slotIndex) || 0));
  const currentSlot = slots[normalizedSlotIndex] || null;
  const universal = normalizeEssenceInventory(loadEssenceInventory());
  const linkedInventory = calculateEntityLinkedEssenceAvailability(entity);

  return {
    linked: linkedInventory.available,
    universal,
    linkedTotals: linkedInventory.total,
    linkedEquipped: linkedInventory.equipped,
    linkedDetails: linkedInventory.details,
    currentSlot,
    canClearCurrentSlot: canClearEssenceSlot({ slots }, normalizedSlotIndex),
  };
}

export function previewEssenceInventoryTransaction(previousSlots = [], nextSlots = [], inventory = loadEssenceInventory()) {
  const normalizedInventory = normalizeEssenceInventory(inventory);
  const previousCounts = countInventoryEssencesInSlots(previousSlots);
  const nextCounts = countInventoryEssencesInSlots(nextSlots);
  const after = { ...normalizedInventory };
  const missing = {};

  ESSENCE_COLORS.forEach(color => {
    after[color] += previousCounts[color] || 0;
    after[color] -= nextCounts[color] || 0;
    if (after[color] < 0) {
      missing[color] = Math.abs(after[color]);
    }
  });

  return {
    ok: Object.keys(missing).length === 0,
    before: normalizedInventory,
    after,
    previousCounts,
    nextCounts,
    missing,
  };
}

export function commitEssenceInventoryTransaction(previousSlots = [], nextSlots = []) {
  const transaction = previewEssenceInventoryTransaction(previousSlots, nextSlots);
  if (!transaction.ok) return transaction;

  const nextInventory = {};
  ESSENCE_COLORS.forEach(color => {
    nextInventory[color] = Math.max(0, transaction.after[color] || 0);
  });

  return {
    ...transaction,
    after: saveEssenceInventory(nextInventory),
  };
}

export function previewAttackEssenceEquipTransaction({
  entity = {},
  attackKey = "",
  previousSlots = [],
  nextSlots = [],
  inventory = loadEssenceInventory(),
} = {}) {
  const universal = previewEssenceInventoryTransaction(previousSlots, nextSlots, inventory);
  const linkedTotals = calculateLinkedEssenceTotals(entity);
  const linkedEquippedElsewhere = countEntityEssencesBySource(entity, ESSENCE_SOURCE_LINKED, {
    excludedAttackKey: String(attackKey || ""),
  });
  const linkedNext = countEssencesInSlotsBySource(nextSlots, ESSENCE_SOURCE_LINKED);
  const linkedAfter = normalizeEssenceInventory();
  const linkedMissing = {};

  ESSENCE_COLORS.forEach(color => {
    linkedAfter[color] =
      (linkedTotals.totals[color] || 0) -
      (linkedEquippedElsewhere[color] || 0) -
      (linkedNext[color] || 0);

    if (linkedAfter[color] < 0) {
      linkedMissing[color] = Math.abs(linkedAfter[color]);
    }
  });

  return {
    ok: universal.ok && Object.keys(linkedMissing).length === 0,
    universal,
    linked: {
      total: linkedTotals.totals,
      details: linkedTotals.details,
      equippedElsewhere: linkedEquippedElsewhere,
      nextCounts: linkedNext,
      after: linkedAfter,
      missing: linkedMissing,
    },
  };
}

export function commitAttackEssenceEquipTransaction(args = {}) {
  const transaction = previewAttackEssenceEquipTransaction(args);
  if (!transaction.ok) return transaction;

  const committedUniversal = commitEssenceInventoryTransaction(
    args.previousSlots || [],
    args.nextSlots || []
  );

  return {
    ...transaction,
    universal: committedUniversal,
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

function hasOwn(value, key) {
  return Boolean(value && Object.prototype.hasOwnProperty.call(value, key));
}

export function getEssenceurSlotsFromAttack(attack = {}, maxSlots = MAX_ESSENCEUR_SLOTS) {
  if (Array.isArray(attack?.essenceSlots)) {
    return getNormalizedConfigSlots({ slots: attack.essenceSlots }, maxSlots).map(slot => {
      const comesFromLegacyNature =
        slot.source === "legacy-attacknature";

      return comesFromLegacyNature
        ? { ...slot, kind: "open", locked: false }
        : slot;
    });
  }

  const hasConfiguredEssences = hasOwn(attack, "essences") || hasOwn(attack, "defaultEssences");
  const rawEssences = hasOwn(attack, "essences") ? attack.essences : attack.defaultEssences;
  const natureColors = getAttackEssenceColorsFromNatures(attack?.attacknature);
  const essenceColors = hasConfiguredEssences && Array.isArray(rawEssences) && rawEssences.length > 0
    ? rawEssences.map(color => normalizeColor(color)).filter(Boolean)
    : natureColors;

  return getNormalizedConfigSlots({
    slots: essenceColors.slice(0, maxSlots).map((color, index) => ({
      slotId: `slot-${index + 1}`,
      kind: "open",
      locked: false,
      active: true,
      color,
      source: Array.isArray(attack?.essences) && attack.essences.length > 0
        ? "configured"
        : "legacy-attacknature",
    })),
  }, maxSlots);
}

export function getEssenceurConfigFromAttack(attack = {}, entity = null, options = {}) {
  const range = normalizeRange(
    Array.isArray(attack?.attackRange)
      ? attack.attackRange[0]
      : attack?.attackRange
  );
  const hypercognitionValue = getEntityStatValue(entity, "hypercognition");
  const hypercognitionAvailable = hypercognitionValue > 0;
  const hypercognition =
    attack?.essenceHypercognitionEnabled !== undefined
      ? attack.essenceHypercognitionEnabled === true && hypercognitionAvailable
      : hypercognitionAvailable;

  const slots = getEssenceurSlotsFromAttack(attack, options.maxSlots || MAX_ESSENCEUR_SLOTS);

  return {
    attackKey: readAttackDefinitionKey(attack),
    attackLabel: getAttackDisplayLabel(attack),
    slots,
    initialSlots: slots,
    range,
    initialRange: range,
    hypercognition,
    hypercognitionAvailable,
  };
}

export function resolveAttackNatureFromEssenceurConfig(config = {}, fallbackNature = []) {
  const activeColors = getActiveEssenceColorsFromConfig(config);
  if (!activeColors.length) {
    return normalizeAttackNatureList(fallbackNature);
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
    const color = slot.active && slot.color ? slot.color : null;
    const essenceSource = normalizeEssenceSource(slot.essenceSource);
    const source = [
      ATTACK_ESSENCE_SLOT_SOURCES.ARCHETYPE_ACHIEVE,
      ATTACK_ESSENCE_SLOT_SOURCES.INITIAL_FAMILY,
      ATTACK_ESSENCE_SLOT_SOURCES.LEGACY_NATURE,
    ].includes(slot.source)
      ? slot.source
      : ATTACK_ESSENCE_SLOT_SOURCES.CONFIGURED;
    return {
      slotId: slot.slotId || `slot-${index + 1}`,
      kind: slot.kind || "open",
      locked: Boolean(slot.locked),
      color,
      source,
      essenceSource: color ? essenceSource || ESSENCE_SOURCE_INVENTORY : "",
      linkedColor: slot.linkedColor || "",
      ...(slot.unlockId ? { unlockId: slot.unlockId } : {}),
    };
  });
  const essences = slots.map(slot => normalizeColor(slot.color)).filter(Boolean);

  return {
    essenceSlots: slots,
    essenceSlotCount: slots.length,
    essences,
    essenceHypercognitionEnabled: config.hypercognition === true,
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

export function buildAttackEssenceSocketPatch(attack = {}, slotIndex = 0, color = "", essenceSource = ESSENCE_SOURCE_INVENTORY, entity = null) {
  const config = getEssenceurConfigFromAttack(attack, entity);
  const slots = getNormalizedConfigSlots(config);
  const index = Math.max(0, Math.floor(Number(slotIndex) || 0));
  const currentSlot = slots[index];
  if (!currentSlot || currentSlot.locked) return null;

  const source = normalizeEssenceSource(essenceSource);
  const requestedColor = normalizeColor(color);
  const nextColor = requestedColor;

  if (!nextColor && !canClearEssenceSlot({ slots }, index)) {
    return {
      ok: false,
      message: "Impossible de vider la derniere nature de l'attaque.",
    };
  }

  slots[index] = {
    ...currentSlot,
    active: Boolean(nextColor),
    color: nextColor || "",
    essenceSource: nextColor
      ? source || ESSENCE_SOURCE_INVENTORY
      : "",
  };

  const nextConfig = { ...config, slots };
  const patch = buildAttackEssencePatch(nextConfig, attack);

  return {
    attackKey: readAttackDefinitionKey(attack),
    index,
    previousEssenceSlots: config.slots.map(slot => ({ ...slot })),
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
      kind: slot.kind || "open",
      locked: Boolean(slot.locked),
      active: Boolean(slot.active && color),
      color,
      source: slot.source || "configured",
      essenceSource: slot.essenceSource || "",
      linkedColor: readLinkedEssenceColor(slot),
      label: color ? COLOR_LABELS[color] || color : "Vide",
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
  };
}

export function createEssenceSpriteHTML(colorOrDefinition = "", options = {}) {
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

  return `
    <div class="${spriteRootClass}" aria-hidden="true">
      <div class="essence-item-sprite-nature ${spriteClass}">
        <img src="${backSrc}" class="essence-item-sprite-img ${spriteSources.backClass}" alt="">
        <img src="${frontSrc}" class="essence-item-sprite-img ${spriteSources.frontClass}" alt="">
      </div>
    </div>
  `;
}

function getAttackEssenceSocketGridPosition(index = 0) {
  const safeIndex = Math.max(0, Math.floor(Number(index) || 0));
  return {
    column: ATTACK_ESSENCE_SOCKET_COLUMN_ORDER[
      safeIndex % ATTACK_ESSENCE_SOCKET_COLUMN_ORDER.length
    ],
    row: Math.floor(safeIndex / ATTACK_ESSENCE_SOCKET_COLUMN_ORDER.length) + 1,
  };
}

function createEssenceItemInnerHTML(color = "", count = 0, options = {}) {
  const definition = getEssenceItemDefinition(color);
  const countAttribute = options.countAttribute
    ? ` ${options.countAttribute}="${normalizeColor(color)}"`
    : "";
  const actionHTML = options.actionHTML || "";

  return `
    ${createEssenceSpriteHTML(definition)}
    <span class="essence-item-text">
      <span class="essence-item-name">${definition.name}</span>
      <span class="essence-item-type">${definition.type}</span>
    </span>
    <strong class="essence-item-count"${countAttribute}>${Math.max(0, count)}</strong>
    ${actionHTML}
  `;
}

function createPopupEquippedEssenceElement(color = "", options = {}) {
  const normalizedColor = normalizeColor(color);
  const definition = getEssenceItemDefinition(normalizedColor);
  const root = document.createElement("div");
  root.className = normalizedColor
    ? `attack-essence-popup-equipped ${normalizedColor}`
    : "attack-essence-popup-equipped is-empty";

  if (normalizedColor) {
    root.dataset.stat = definition.statKey;
    root.dataset.hover = "true";
  } else {
    root.dataset.stat = EMPTY_ESSENCE_HELPER_STAT;
    root.dataset.hover = "true";
  }

  root.innerHTML = `
    <div class="attack-essence-popup-head">
      <span>Chasse ${Math.max(1, Number(options.slotIndex) || 1)}</span>
      <button type="button" class="attack-essence-popup-close" aria-label="Fermer">x</button>
    </div>
    <div class="attack-essence-equipped-orb">
      ${createEssenceSpriteHTML(definition, { empty: !normalizedColor })}
    </div>
    <div class="attack-essence-equipped-label">
      Essence infusée : <span>${normalizedColor ? definition.infusedLabel : "vide"}</span>
    </div>
    <div class="separation-line golden attack-essence-popup-separator"></div>
  `;

  return root;
}

function closeAttackEssenceSocketPopups() {
  if (typeof document === "undefined") return;
  document.querySelectorAll(".attack-essence-popup").forEach(popup => {
    if (typeof popup._attackEssenceCleanup === "function") {
      popup._attackEssenceCleanup();
    }
    popup.remove();
  });
}

function positionAttackEssencePopup(popup, anchor) {
  if (!popup || !anchor?.getBoundingClientRect) return;

  const rect = anchor.getBoundingClientRect();
  const margin = 8;
  const width = Math.min(520, Math.max(240, window.innerWidth - margin * 2));
  popup.style.width = `${width}px`;

  let left = rect.left + rect.width / 2 - width / 2;
  left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));

  popup.style.left = `${left}px`;
  popup.style.top = `${Math.min(rect.bottom + margin, window.innerHeight - margin)}px`;

  requestAnimationFrame(() => {
    const popupRect = popup.getBoundingClientRect();
    if (popupRect.bottom <= window.innerHeight - margin) return;
    const top = Math.max(margin, rect.top - popupRect.height - margin);
    popup.style.top = `${top}px`;
  });
}

function getEssenceCount(counts = {}, color = "") {
  return Math.max(0, Math.floor(Number(counts?.[color]) || 0));
}

function getTotalEssenceCount(counts = {}) {
  return ESSENCE_COLORS.reduce((total, color) => total + getEssenceCount(counts, color), 0);
}

function createPopupEssenceButton({ color, source, index = 0, label }) {
  const definition = getEssenceItemDefinition(color);
  const button = document.createElement("button");
  button.type = "button";
  button.className = `attack-essence-popup-token essence-item-card ${color}`;
  button.dataset.essencePopupColor = color;
  button.dataset.essencePopupSource = source;
  button.dataset.essencePopupIndex = String(index);
  button.dataset.essenceAvailable = "true";
  button.dataset.stat = definition.statKey;
  button.dataset.hover = "true";
  button.setAttribute("aria-disabled", "false");
  button.setAttribute("aria-label", `${label || definition.name} disponible`);
  button.innerHTML = `
    ${createEssenceSpriteHTML(definition)}
    <span class="essence-item-name">${definition.name}</span>
  `;
  return button;
}

function appendPopupEssenceSection(root, title, source, counts = {}, options = {}) {
  const totalCount = getTotalEssenceCount(counts);
  if (options.hideWhenEmpty === true && totalCount <= 0) return false;

  const section = document.createElement("div");
  section.className = `attack-essence-popup-section ${source}`;

  const head = document.createElement("div");
  head.className = "attack-essence-popup-section-title";
  head.textContent = title;

  const tokens = document.createElement("div");
  tokens.className = "attack-essence-popup-tokens";

  ESSENCE_COLORS.forEach(color => {
    const count = getEssenceCount(counts, color);
    for (let index = 0; index < count; index += 1) {
      tokens.appendChild(createPopupEssenceButton({
        color,
        source,
        index,
        label: COLOR_LABELS[color],
      }));
    }
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

export function openAttackEssenceSocketPopup({
  anchor,
  attack = {},
  entity = {},
  slotIndex = 0,
  onApply = null,
} = {}) {
  if (typeof document === "undefined" || !anchor) return null;

  closeAttackEssenceSocketPopups();

  const normalizedSlotIndex = Math.max(0, Math.floor(Number(slotIndex) || 0));
  let activeAttack = attack;
  let activeEntity = entity;
  const initialAvailability = getAttackEssenceAvailabilityForSlot(activeEntity, activeAttack, normalizedSlotIndex);
  if (!initialAvailability.currentSlot || initialAvailability.currentSlot.locked) return null;

  const popup = document.createElement("div");
  popup.className = "attack-essence-popup";
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

  const renderPopupContent = (statusMessage = lastStatusMessage, statusState = lastStatusState) => {
    const availability = getAttackEssenceAvailabilityForSlot(activeEntity, activeAttack, normalizedSlotIndex);
    const currentSlot = availability.currentSlot;
    if (!currentSlot || currentSlot.locked) return false;

    const currentColor = normalizeColor(currentSlot.color);
    popup.dataset.attackKey = readAttackDefinitionKey(activeAttack);
    popup.dataset.slotIndex = String(normalizedSlotIndex);
    popupContainer.innerHTML = "";

    popupContainer.appendChild(createPopupEquippedEssenceElement(currentColor, {
      slotIndex: normalizedSlotIndex + 1,
    }));
    const hasLinkedEssences = appendPopupEssenceSection(
      popupContainer,
      "Essences liées à l'entité disponibles :",
      ESSENCE_SOURCE_LINKED,
      availability.linked,
      { hideWhenEmpty: true }
    );
    const hasUniversalEssences = appendPopupEssenceSection(
      popupContainer,
      "Essences universelles disponibles :",
      ESSENCE_SOURCE_INVENTORY,
      availability.universal,
      { hideWhenEmpty: true }
    );

    if (!hasLinkedEssences && !hasUniversalEssences) {
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
    return true;
  };

  if (!renderPopupContent()) return null;

  const applyChoice = async ({ color, source }) => {
    if (typeof onApply !== "function") {
      setLocalStatus("Sauvegarde non branchee.", "error");
      return;
    }

    setLocalStatus("Sertissage...", "pending");

    try {
      const result = await onApply({
        entity: activeEntity,
        attack: activeAttack,
        attackKey: readAttackDefinitionKey(activeAttack),
        slotIndex: normalizedSlotIndex,
        color,
        essenceSource: source,
      });

      if (result?.ok === false) {
        setLocalStatus(result.message || "Sertissage refuse.", "error");
        return;
      }

      activeEntity = result?.entity || activeEntity;
      activeAttack = result?.attack || activeAttack;

      const updatedAvailability = getAttackEssenceAvailabilityForSlot(
        activeEntity,
        activeAttack,
        normalizedSlotIndex
      );
      const updatedSlot = updatedAvailability.currentSlot || {};
      const normalizedColor = normalizeColor(updatedSlot.color || color);
      const normalizedSource = normalizeEssenceSource(updatedSlot.essenceSource || source);
      anchor.dataset.color = normalizedColor || "empty";
      anchor.dataset.active = normalizedColor ? "true" : "false";
      anchor.dataset.source = updatedSlot.source || anchor.dataset.source || "";
      anchor.dataset.essenceSource = normalizedColor ? normalizedSource : "";
      anchor.dataset.linkedColor = readLinkedEssenceColor(updatedSlot) || "";
      anchor.innerHTML = normalizedColor
        ? createEssenceSpriteHTML(normalizedColor, { mini: true })
        : createEssenceSpriteHTML("", { empty: true, mini: true });
      if (normalizedColor) {
        anchor.dataset.stat = getEssenceItemDefinition(normalizedColor).statKey;
        anchor.dataset.hover = "true";
      } else {
        anchor.dataset.stat = EMPTY_ESSENCE_HELPER_STAT;
        anchor.dataset.hover = "true";
      }

      const successMessage = normalizedColor
        ? (result?.message || "Essence sertie.")
        : "Chasse videe.";
      renderPopupContent(successMessage, "");
    } catch (error) {
      console.error("Erreur sertissage essence :", error);
      setLocalStatus("Erreur pendant le sertissage.", "error");
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
      if (!color || !source || token.dataset.essenceAvailable !== "true") return;
      applyChoice({ color, source });
      return;
    }

    const action = event.target.closest?.("[data-essence-popup-action]");
    if (!action || action.disabled) return;

    if (action.dataset.essencePopupAction === "clear") {
      applyChoice({ color: "", source: "" });
    }
  });

  document.body.appendChild(popup);
  positionAttackEssencePopup(popup, anchor);

  return popup;
}

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
  if (options.entity?.id !== undefined) root.dataset.entityId = String(options.entity.id);

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
    dot.dataset.column = String(gridPosition.column);
    dot.dataset.row = String(gridPosition.row);
    dot.dataset.color = socket.active ? socket.color : "empty";
    dot.dataset.active = socket.active ? "true" : "false";
    dot.dataset.kind = socket.kind;
    dot.dataset.locked = socket.locked ? "true" : "false";
    dot.dataset.source = socket.source;
    dot.dataset.essenceSource = socket.essenceSource;
    dot.dataset.linkedColor = socket.linkedColor;
    if (socket.active && socket.color) {
      dot.dataset.stat = getEssenceItemDefinition(socket.color).statKey;
      dot.dataset.hover = "true";
      dot.innerHTML = createEssenceSpriteHTML(socket.color, { mini: true });
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
  if (!state.total) return "Aucune";
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
  if (!preview?.total) return "miss-shot";
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
  const hypercognitionActive =
    config.hypercognition === true &&
    config.hypercognitionAvailable !== false;
  const activeSlots = slots
    .map(slot => ({
      active: Boolean(slot?.active),
      color: normalizeColor(slot?.color ?? slot?.key ?? slot),
    }))
    .filter(slot => slot.active && slot.color);

  const baseRed = activeSlots.filter(slot => slot.color === ATTACK_ESSENCE_COLORS.RED).length;
  const baseBlue = activeSlots.filter(slot => slot.color === ATTACK_ESSENCE_COLORS.BLUE).length;
  const baseYellow = activeSlots.filter(slot => slot.color === ATTACK_ESSENCE_COLORS.YELLOW).length;
  const hypercognitionBonus = hypercognitionActive && activeSlots.length > 0 ? 1 : 0;
  const red = baseRed;
  const blue = baseBlue + hypercognitionBonus;
  const yellow = baseYellow;
  const total = red + blue + yellow;

  const state = {
    range,
    slots,
    activeSlotCount: activeSlots.length,
    hypercognition: hypercognitionActive,
    hypercognitionBonus,
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
  card.dataset.kind = slot.kind || "open";
  card.dataset.locked = slot.locked ? "true" : "false";
  card.dataset.source = slot.source || "configured";
  card.dataset.unlockId = slot.unlockId || "";
  card.dataset.essenceSource = normalizeEssenceSource(slot.essenceSource);
  card.dataset.linkedColor = readLinkedEssenceColor(slot) || "";
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

function setSlotCardColor(slotCard, color) {
  if (!slotCard || slotCard.dataset.locked === "true") return false;
  const normalizedColor = normalizeColor(color);
  const activeInput = slotCard.querySelector(".essenceur-slot-active");
  const select = slotCard.querySelector(".essenceur-slot-select");

  if (activeInput) activeInput.checked = Boolean(normalizedColor);
  if (select) select.value = normalizedColor;
  slotCard.dataset.active = normalizedColor ? "true" : "false";
  slotCard.dataset.color = normalizedColor;
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

function isSlotCardDatasetActive(slotCard) {
  return slotCard?.dataset.active === "true" && Boolean(normalizeColor(slotCard.dataset.color));
}

function countActiveSlotCards(root) {
  return Array.from(root?.querySelectorAll?.(".essenceur-slot-card") || [])
    .filter(isSlotCardActive)
    .length;
}

function countDatasetActiveSlotCards(root) {
  return Array.from(root?.querySelectorAll?.(".essenceur-slot-card") || [])
    .filter(isSlotCardDatasetActive)
    .length;
}

function wouldClearLastNatureFromPreviousState(root, slotCard, nextActive, nextColor) {
  const wasActive = isSlotCardDatasetActive(slotCard);
  const nextHasNature = nextActive && Boolean(normalizeColor(nextColor));
  return wasActive && !nextHasNature && countDatasetActiveSlotCards(root) <= 1;
}

function restoreSlotCardDatasetState(slotCard) {
  if (!slotCard) return;
  const previousColor = normalizeColor(slotCard.dataset.color);
  const previousActive = slotCard.dataset.active === "true" && Boolean(previousColor);
  const activeInput = slotCard.querySelector(".essenceur-slot-active");
  const select = slotCard.querySelector(".essenceur-slot-select");

  if (activeInput) activeInput.checked = previousActive;
  if (select) select.value = previousColor;
}

function syncSlotCardClearGuards(root) {
  const cards = Array.from(root?.querySelectorAll?.(".essenceur-slot-card") || []);
  const activeCount = countActiveSlotCards(root);

  cards.forEach(card => {
    const locked = card.dataset.locked === "true";
    const active = isSlotCardActive(card);
    const isLastActiveNature = active && activeCount <= 1;
    const clearButton = card.querySelector(".essenceur-slot-clear");
    const activeInput = card.querySelector(".essenceur-slot-active");
    const select = card.querySelector(".essenceur-slot-select");

    if (clearButton) {
      clearButton.disabled = locked || !active || isLastActiveNature;
      clearButton.dataset.lastNatureGuard = isLastActiveNature ? "true" : "false";
    }
    if (activeInput) {
      activeInput.disabled = locked || isLastActiveNature;
    }
    if (select) {
      select.disabled = locked;
    }
  });
}

function clearSlotCard(root, slotCard) {
  if (slotCard && !wouldClearLastNatureFromPreviousState(root, slotCard, false, "")) {
    return setSlotCardColor(slotCard, "");
  }

  setApplyStatus(root, "Impossible de vider la derniere nature de l'attaque.", "error");
  restoreSlotCardDatasetState(slotCard);
  syncSlotCardClearGuards(root);
  return false;
}

function equipColorOnSelectedSlot(root, color) {
  const slotCard = getSelectedSlotCard(root);
  if (!slotCard) return false;
  selectSlotCard(root, slotCard);
  return setSlotCardColor(slotCard, color);
}

function renderEssenceInventory(root) {
  const inventoryRoot = root.querySelector("[data-essenceur-inventory]");
  if (!inventoryRoot) return;

  const inventory = loadEssenceInventory();
  inventoryRoot.innerHTML = `
    <div class="essenceur-inventory-head">
      <span>Essences universelles</span>
      <span class="essenceur-inventory-hint">clic ou glisser vers une chasse</span>
    </div>
    <div class="essenceur-inventory-tokens">
      ${ESSENCE_COLORS.map(color => `
        <div
          class="essenceur-inventory-token essence-item-card ${color}${inventory[color] > 0 ? "" : " is-empty"}"
          draggable="${inventory[color] > 0 ? "true" : "false"}"
          data-essenceur-inventory-color="${color}"
          data-essence-available="${inventory[color] > 0 ? "true" : "false"}"
          data-stat="${getEssenceItemDefinition(color).statKey}"
          data-hover="true"
          role="button"
          tabindex="0"
          aria-label="${getEssenceItemDefinition(color).name} ${Math.max(0, inventory[color])} disponible"
        >
          ${createEssenceItemInnerHTML(color, inventory[color], {
            countAttribute: "data-essenceur-inventory-count",
            actionHTML: `<button type="button" data-essenceur-buy="${color}">+1</button>`,
          })}
        </div>
      `).join("")}
    </div>
  `;
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
    const originalColor = normalizeColor(card.dataset.originalColor);
    let essenceSource = "";

    if (active && color) {
      if (linkedColor && color === linkedColor) {
        essenceSource = ESSENCE_SOURCE_LINKED;
      } else if (
        previousEssenceSource === ESSENCE_SOURCE_LEGACY_FREE &&
        color === originalColor
      ) {
        essenceSource = ESSENCE_SOURCE_LEGACY_FREE;
      } else if (
        previousEssenceSource === ESSENCE_SOURCE_INVENTORY &&
        color === originalColor
      ) {
        essenceSource = ESSENCE_SOURCE_INVENTORY;
      } else if (
        previousEssenceSource === ESSENCE_SOURCE_LINKED &&
        color === originalColor
      ) {
        essenceSource = ESSENCE_SOURCE_LINKED;
      } else {
        essenceSource = ESSENCE_SOURCE_INVENTORY;
      }
    }

    return {
      slotId: card.dataset.slotId || `slot-${card.dataset.slot || ""}`,
      kind: card.dataset.kind || "open",
      locked: card.dataset.locked === "true",
      source: card.dataset.source || "configured",
      unlockId: card.dataset.unlockId || "",
      active: active && Boolean(color),
      color,
      essenceSource,
      linkedColor,
    };
  });

  return {
    slots,
    range: root.querySelector("[data-essenceur-range]")?.value || "melee",
    hypercognition: (() => {
      const input = root.querySelector("[data-essenceur-hypercognition]");
      return input?.checked === true && input?.disabled !== true;
    })(),
    hypercognitionAvailable:
      root.querySelector("[data-essenceur-hypercognition]")?.disabled === true ? false : undefined,
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

  const hyperInput = root.querySelector("[data-essenceur-hypercognition]");
  if (hyperInput && config.hypercognition !== undefined) {
    const available = config.hypercognitionAvailable !== false;
    hyperInput.disabled = !available;
    hyperInput.checked = available && config.hypercognition === true;
  }

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
    {
      active: preview.hypercognitionBonus > 0,
      html: `${makePicto("hypercognition")} Hypercognition : +1 essence bleue`,
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
    `${preview.slotCount}/9 chasses possedees - ${preview.activeSlotCount} equipees${preview.hypercognitionBonus ? " + hypercognition" : ""}`
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

  const state = readStateFromRoot(root);
  if (!hasActiveEssenceNature(state)) {
    setApplyStatus(root, "Impossible de sauvegarder une attaque sans nature.", "error");
    updateInterface(root);
    return;
  }

  const preview = calculateEssenceurPreview(state);
  const patch = buildAttackEssencePatch(state, attackOption.attack);
  const previousEssenceSlots = Array.isArray(attackOption.attack.essenceSlots)
    ? attackOption.attack.essenceSlots.map(slot => ({ ...slot }))
    : [];
  const inventoryTransaction = previewAttackEssenceEquipTransaction({
    entity: target.entity,
    attackKey: attackOption.attackKey,
    previousSlots: previousEssenceSlots,
    nextSlots: patch.essenceSlots || [],
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
    setApplyStatus(root, `Essences manquantes : ${missingText}.`, "error");
    return;
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
    });

    if (result?.entity) target.entity = result.entity;
    if (result?.attack) {
      attackOption.attack = result.attack;
      attackOption.attackKey = readAttackDefinitionKey(result.attack) || attackOption.attackKey;
      attackOption.label = getAttackDisplayLabel(result.attack);
    }

    if (result?.ok !== false) {
      commitAttackEssenceEquipTransaction({
        entity: result?.entity || target.entity,
        attackKey: attackOption.attackKey,
        previousSlots: previousEssenceSlots,
        nextSlots: patch.essenceSlots || [],
      });
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

    <div class="essenceur-body">
      <section class="essenceur-panel essenceur-builder-panel" aria-label="Constructeur d'essences">
        <div class="essenceur-panel-header">
          <h2 class="essenceur-panel-title">Chasses</h2>
          <span class="essenceur-panel-hint">9 ouvertes max</span>
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
          <label class="essenceur-switch">
            <input data-essenceur-hypercognition type="checkbox" checked>
            <span>Hypercognition</span>
          </label>
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
  `;

  renderEssenceInventory(root);

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

  const hyperInput = root.querySelector("[data-essenceur-hypercognition]");
  if (hyperInput && options.hypercognition !== undefined) {
    hyperInput.checked = options.hypercognition === true;
  }

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

      if (!nextColor && wouldClearLastNatureFromPreviousState(root, slotCard, false, "")) {
        restoreSlotCardDatasetState(slotCard);
        setApplyStatus(root, "Impossible de vider la derniere nature de l'attaque.", "error");
        updateInterface(root);
        return;
      }

      if (activeInput) activeInput.checked = Boolean(nextColor);
    }
    if (slotCard && target.matches(".essenceur-slot-active") && !target.checked) {
      const select = slotCard.querySelector(".essenceur-slot-select");
      if (wouldClearLastNatureFromPreviousState(root, slotCard, false, "")) {
        target.checked = true;
        setApplyStatus(root, "Impossible de vider la derniere nature de l'attaque.", "error");
        updateInterface(root);
        return;
      }
      if (select) select.value = "";
    }

    if (
      target.matches(".essenceur-slot-select") ||
      target.matches(".essenceur-slot-active") ||
      target.matches("[data-essenceur-range]") ||
      target.matches("[data-essenceur-hypercognition]")
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
    if (!color) return;

    event.preventDefault();
    slotCard.classList.remove("drag-over");
    selectSlotCard(root, slotCard);
    setSlotCardColor(slotCard, color);
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

    const applyButton = event.target.closest?.("[data-essenceur-apply]");
    if (applyButton) {
      await applyCurrentAttackEssences(root, options, targets);
      return;
    }

    const buyButton = event.target.closest?.("[data-essenceur-buy]");
    if (buyButton) {
      const color = normalizeColor(buyButton.dataset.essenceurBuy);
      if (color) {
        grantEssencesToInventory({ [color]: 1 });
        renderEssenceInventory(root);
        setApplyStatus(root, `${COLOR_LABELS[color]} +1 dans l'inventaire.`, "ok");
      }
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
      if (
        color &&
        inventoryToken.dataset.essenceAvailable === "true" &&
        equipColorOnSelectedSlot(root, color)
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
    const onEssenceInventoryUpdated = () => renderEssenceInventory(root);
    window.addEventListener("essenceInventoryUpdated", onEssenceInventoryUpdated);
    root.addEventListener("essenceur:destroy", () => {
      window.removeEventListener("essenceInventoryUpdated", onEssenceInventoryUpdated);
    }, { once: true });
  }

  return root;
}
