import { releaseEntityFootprint } from "../board/controller.js";
import { removeCombatVisualAfter } from "../combat/clock.js";
import { setTimeout } from "../combat/clock.js";
import { gameStorage as localStorage } from "../storage/sessionStorage.js";
import { filterRestrictedUmbras } from "../procedural/proc-bareme.js";
import { calculateStatSources, applyStatSystemTotals, getStatSystemResult, getPointLimitedStatKeys, getStatPointThreshold, getUmbraThreshold, calculateStatPointLimit, STAT_POINT_INPUTS, isStatSystemReady } from "./statSystem.js";
import {
  loadFromLocalStorage,
  saveToLocalStorage,
  armyAConfig,
  saveCurrentGameData,
  getEquippedItemById,
  loadEquippedItems,
  removeFromEquippedItemsStorage,
} from "../storage/gameStorage.js";
import { entitesNest } from "../data/entityTemplates.js";
import { selectRandomEntitiesForSideB, selectScriptedEntitiesForSideB } from "./armies.js";
import { selectAdminEntitiesForSideB } from "../debug/admin.js";
import { generateArmyA } from "./armies.js";
import { ensureEntityAttackInstances } from "../combat/attackResolution.js";
import { syncEntityEssenceRewards } from "../items/essenceInventory.js";
import { attackDetails } from "../data/attackList.js";
import {
  toNumber,
  calculateLvlMaxBaseEntite,
  calculateLvlMaxEntiteWithWill,
  calculateVitalityRegenPercent,
  calculateVitalityRegenAmount,
  calculateTotalRegenAmount,
  calculateMovementStartingCharges,
  weaponMasteryChargeStrenghtRatioBonus,
  calculateMovementMarathonChance,
  calculateMovementTrailerChance,
  calculateWeaponOrfevreWeaponMastery,
  calculateWeaponOrfevreStrength,
  calculateWeaponMasteryTrophyChance,
  calculateWeaponMasteryTrophyStrengthBonus,
  calculateHastePrepReduc,
  calculateHasteCDReduc,
  calculateHasteExecReduc,
  calculateHasteProjectilSpeed,
  calculateHasteRecupReduc,
  calculateGeneratedUmbraStats,
  getGeneratedUmbraTargetKeys,
  calculateHpBattleRegenStrengthRatio,
  calculateHpBattleRegenIndestructibilityRatio,
  getStatContributions,
} from "../combat/statistics.js";
import { saveEntityextraLifeToStorage, endEntityBattleRole } from "../storage/entityStorage.js";
import { isRegenKey, toNonNegInt } from "../ui/display.js";
import {
  getSafe,
  ensureEntityLevelObject as ensureCoreEntityLevelObject,
  getArchetypeUID,
  getClassFromAttributs,
  normalizeStatKey,
  normalizeStatModifierMap,
  normalizeStatModifierMapInPlace,
} from "./rules.js";
import { buildReverseArchetypePlan, hasReverseArchetypeConfig } from "./archetypes.js";
import { balanceData, roundBalance } from "../data/balanceData.js";
import {
  ensureStuffArmorReserve,
  stripStuffArmorModifier,
  syncEntityArmorLayers,
} from "../items/armor.js";
import { stripStuffResourceModifiers, syncEntityResourceStocks, getEquipmentResourceMax, getEquipmentResourceCurrent, syncLifeCurrent } from "../items/resourceStocks.js";
export { calculateRobustnessBonus, calculateRobustnessArmorDetails } from "../items/armor.js";
export {
  calculateResistanceReductionPercent,
  calculateResistances,
  calculatePhysicalPenPercent,
  calculateMagicalPenPercent,
  calculatePenetrationPercent,
} from "./rules.js";

// 📦 Données
export let entites = [];          // ✅ export live-binding (tu peux le réassigner)
export const removedEntities = []; // ✅ idem
let matchingDifficulty = null;

// 📈 Paramètres XP/Niveau
const levelProgressionBalance = balanceData.level.progression;
const levelWillBalance = balanceData.level.will;
const baseValue = levelProgressionBalance.baseXpCost;
const increaseRate = levelProgressionBalance.increaseRatePercent;

// Max de table (jeu) : couvre toutes les entités (base 100 + bonus Will max 99)
export const BASE_MAX_LEVEL = levelWillBalance.baseMaxLevel;
export const WILL_MAX_BONUS = levelWillBalance.targetMaxLevelAtWillCap;
export const maxLevel = levelProgressionBalance.tableMaxLevel;

export const levelDetails = calculateLevelCosts(baseValue, maxLevel, increaseRate);

function ensureEntityLevelObject(entity) {
  return ensureCoreEntityLevelObject(entity, { maxLevel });
}


const EXTRA_LIFE_REGEN_BASE = balanceData.regeneration.extraLife.baseMaxRegen;
const EXTRA_LIFE_REGEN_STEP = balanceData.regeneration.extraLife.step;
const ATTACK_TIME_REDUC_CAP = balanceData.attackTime.reductionCapPercent;

function getGameDaySafe() {
  const raw = localStorage.getItem("gameDay");
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

function pad3(i) {
  return String(i).padStart(3, "0");
}

export const ENTITY_ACQUISITION_COUNTER_KEY = 'entityAcquisitionCounter';
export const ENTITY_ACQUISITION_SOURCES = Object.freeze([
  'initial',
  'loot',
  'shop',
  'quest',
  'event',
  'admin',
  'legacy',
  'unknown'
]);

function normalizeEntityAcquisitionSource(source) {
  const normalized = String(source || 'unknown').trim().toLowerCase();
  return normalized || 'unknown';
}

function normalizeEntityAcquisitionReference(value) {
  return value == null || value === '' ? null : String(value);
}

function acquisitionOrder(value) {
  const order = Number.parseInt(value, 10);
  return Number.isInteger(order) && order > 0 ? order : 0;
}

function getStoredArmyAEntities() {
  const stored = loadFromLocalStorage('selectedArmyA', []);
  if (Array.isArray(stored)) return stored;
  return Array.isArray(stored?.entities) ? stored.entities : [];
}

function getHighestEntityAcquisitionOrder() {
  const gameData = loadFromLocalStorage('gameData', {});
  const storedCounter = acquisitionOrder(
    gameData?.[ENTITY_ACQUISITION_COUNTER_KEY]
  );
  const knownEntities = getStoredArmyAEntities();
  const highestEntityOrder = knownEntities.reduce(
    (highest, entity) => Math.max(
      highest,
      acquisitionOrder(entity?.acquisition?.order)
    ),
    0
  );
  return Math.max(storedCounter, highestEntityOrder);
}

function saveEntityAcquisitionCounter(order) {
  const normalizedOrder = acquisitionOrder(order);
  const gameData = loadFromLocalStorage('gameData', {});
  const currentOrder = acquisitionOrder(
    gameData?.[ENTITY_ACQUISITION_COUNTER_KEY]
  );
  if (currentOrder >= normalizedOrder) return currentOrder;

  saveToLocalStorage('gameData', {
    ...gameData,
    [ENTITY_ACQUISITION_COUNTER_KEY]: normalizedOrder
  });
  return normalizedOrder;
}

/**
 * Marque une instance au moment où elle rejoint l'armée A.
 * Une acquisition déjà enregistrée est normalisée mais jamais remplacée.
 */
export function registerEntityAcquisition(entity, {
  source = 'unknown',
  sourceId = null,
  eventId = null,
  acquiredAt = null
} = {}) {
  if (!entity || typeof entity !== 'object') return null;

  const previous = entity.acquisition && typeof entity.acquisition === 'object'
    ? entity.acquisition
    : null;
  const previousOrder = acquisitionOrder(previous?.order);
  const order = previousOrder || (getHighestEntityAcquisitionOrder() + 1);

  entity.acquisition = {
    ...(previous || {}),
    order,
    gameDay: previous?.gameDay ?? Math.max(1, Number(loadFromLocalStorage('gameDay', 1)) || 1),
    acquiredAt: typeof previous?.acquiredAt === 'string' && previous.acquiredAt
      ? previous.acquiredAt
      : typeof acquiredAt === 'string' && acquiredAt
        ? acquiredAt
        : new Date().toISOString(),
    source: normalizeEntityAcquisitionSource(previous?.source || source),
    sourceId: normalizeEntityAcquisitionReference(
      previous?.sourceId ?? sourceId
    ),
    eventId: normalizeEntityAcquisitionReference(
      previous?.eventId ?? eventId
    )
  };

  saveEntityAcquisitionCounter(order);
  return entity;
}

/**
 * Migration idempotente des anciennes sauvegardes.
 * Les entités sans historique suivent l'ordre actuel de selectedArmyA.
 */
export function migrateEntityAcquisitions(entities, {
  source = 'legacy',
  acquiredAt = new Date().toISOString()
} = {}) {
  if (!Array.isArray(entities)) return 0;
  let changed = 0;

  entities.forEach((entity) => {
    const before = JSON.stringify(entity?.acquisition ?? null);
    registerEntityAcquisition(entity, { source, acquiredAt });
    if (JSON.stringify(entity?.acquisition ?? null) !== before) changed += 1;
  });

  return changed;
}

// Exemple : lecture stricte depuis entite.baseStats (aucun bonus, aucun preview)
export function BaseDayHpRegen(entite) {
  const baseStats = entite?.baseStats ?? {};
  const durable   = entite?.modifierStats?.durable?.statLeveled ?? {};

  const base = toNumber(baseStats.dayHpRegen ?? 0, 0);
  const dur  = toNumber(durable.dayHpRegen ?? 0, 0);

  return Math.max(0, base + dur);
}

export function ensureExtraLifeRegen(entite, extraLifeObj, config = {}) {
  const {
    baseMaxRegen = EXTRA_LIFE_REGEN_BASE,
    step = EXTRA_LIFE_REGEN_STEP,
    prune = true,
    preserveExisting = true,
  } = config;

  const day = getGameDaySafe();

  const max = Math.max(0, toNonNegInt(extraLifeObj?.max ?? 0) - getEquipmentResourceMax(entite, 'extraLife'));
  const cur = Math.min(Math.max(0, toNonNegInt(extraLifeObj?.current ?? max) - getEquipmentResourceCurrent(entite, 'extraLife')), max);

  // Pas d'extraLife => option : nettoyer
  if (max <= 0) {
    if (prune) delete entite.extraLifeRegen;
    return;
  }

  const isNewBlock = !entite.extraLifeRegen || typeof entite.extraLifeRegen !== "object";

if (isNewBlock) {
  entite.extraLifeRegen = { firstUpdate: day, lastUpdate: day };
} else {
  entite.extraLifeRegen.firstUpdate ??= day;
  entite.extraLifeRegen.lastUpdate ??= day;
}

for (let i = 1; i <= max; i++) {
  const key = pad3(i);
  const wantedMaxRegen = baseMaxRegen + (i - 1) * step; // 3,6,9,...

  const prev = entite.extraLifeRegen[key];

  // ✅ Si déjà présent et qu'on préserve, on garde currentRegen + order, on met à jour maxRegen
  if (preserveExisting && prev && typeof prev === "object") {
    const next = {
      ...prev, // ✅ conserve order
      currentRegen: toNonNegInt(prev.currentRegen),
      maxRegen: wantedMaxRegen,
    };

    if (next.currentRegen > next.maxRegen) next.currentRegen = next.maxRegen;

    entite.extraLifeRegen[key] = next;
    continue;
  }

const prevObj = (prev && typeof prev === "object") ? prev : {};

entite.extraLifeRegen[key] = {
  ...prevObj,
  currentRegen: (i <= cur) ? wantedMaxRegen : 0,
  maxRegen: wantedMaxRegen,
};
}
  // Prune des entrées > max
  if (prune) {
    for (const k of Object.keys(entite.extraLifeRegen)) {
      if (/^\d{3,}$/.test(k)) {
        const idx = Number.parseInt(k, 10);
        if (idx > max) delete entite.extraLifeRegen[k];
      }
    }
  }
}
export function ensureEternalLifeRegen(entite, eternalLifeObj, config = {}) {
  const { prune = true, preserveExisting = true } = config;

  const day = getGameDaySafe();

  const max = Math.max(0, toNonNegInt(eternalLifeObj?.max) - getEquipmentResourceMax(entite, 'eternalLife'));
  const cur = Math.min(max, Math.max(0, toNonNegInt(eternalLifeObj?.current) - getEquipmentResourceCurrent(entite, 'eternalLife')));

  if (max <= 0) {
    if (prune) delete entite.eternalLifeRegen;
    return;
  }

  const isNewBlock = !entite.eternalLifeRegen || typeof entite.eternalLifeRegen !== "object";

  if (isNewBlock) {
    entite.eternalLifeRegen = { firstUpdate: day, lastUpdate: day };
  } else {
    entite.eternalLifeRegen.firstUpdate ??= day;
    entite.eternalLifeRegen.lastUpdate ??= day;
  }

  for (let index = 1; index <= max; index++) {
    const key = pad3(index);
    const prev = entite.eternalLifeRegen[key];
    entite.eternalLifeRegen[key] = {
      ...(prev && typeof prev === 'object' ? prev : {}),
      currentRegen: preserveExisting && prev ? Math.min(1, toNonNegInt(prev.currentRegen)) : Number(index <= cur),
      maxRegen: 1,
    };
  }
  if (prune) {
    for (const k of Object.keys(entite.eternalLifeRegen)) {
      if (isRegenKey(k) && Number(k) > max) delete entite.eternalLifeRegen[k];
    }
  }
}

export function updateExtraLifeRegenOrders(entite) {
  const regen = entite?.extraLifeRegen;
  if (!regen || typeof regen !== "object") return false;

  const keys = Object.keys(regen).filter(isRegenKey).sort();

  // compteur = max(orderCounter, max(order existant))
  let counter = toNonNegInt(regen.orderCounter);

  for (const k of keys) {
    const ord = toNonNegInt(regen[k]?.order);
    if (ord > counter) counter = ord;
  }

  let changed = false;

  for (const k of keys) {
    const slot = regen[k];
    if (!slot || typeof slot !== "object") continue;

    const maxR = toNonNegInt(slot.maxRegen);
    const curR = toNonNegInt(slot.currentRegen);

    const isFull = maxR > 0 && curR >= maxR;
    const hasOrder = toNonNegInt(slot.order) > 0;

    if (isFull) slot.readySince ??= getGameDaySafe();
    else { delete slot.readySince; delete slot.order; }

    if (isFull && !hasOrder) {
      counter += 1;
      slot.order = counter;
      changed = true;
    }
  }

  // n'écrire orderCounter que si utile
  if (counter > 0) {
    if (regen.orderCounter !== counter) {
      regen.orderCounter = counter;
      changed = true;
    }
  } else {
    if ("orderCounter" in regen) {
      delete regen.orderCounter;
      changed = true;
    }
  }

  return changed;
}

export function syncExtraLifeCurrentFromRegen(entite) {
  return syncLifeCurrent(entite, 'extraLife');
}


export function updateEternalLifeRegenOrders(entite) {
  const regen = entite?.eternalLifeRegen;
  if (!regen || typeof regen !== "object") return false;

  const keys = Object.keys(regen).filter(isRegenKey).sort();

  // compteur = max(orderCounter, max(order existant))
  let counter = toNonNegInt(regen.orderCounter);

  for (const k of keys) {
    const ord = toNonNegInt(regen[k]?.order);
    if (ord > counter) counter = ord;
  }

  let changed = false;

  for (const k of keys) {
    const slot = regen[k];
    if (!slot || typeof slot !== "object") continue;

    // ✅ EternalLife : cycle fixe => maxRegen = 1
    if (slot.maxRegen !== 1) {
      slot.maxRegen = 1;
      changed = true;
    }

    const maxR = 1;
    const curR = toNonNegInt(slot.currentRegen);

    const isFull = curR >= maxR;
    const hasOrder = toNonNegInt(slot.order) > 0;

    if (isFull) slot.readySince ??= getGameDaySafe();
    else { delete slot.readySince; delete slot.order; }

    if (isFull && !hasOrder) {
      counter += 1;
      slot.order = counter;
      changed = true;
    }
  }

  // n'écrire orderCounter que si utile
  if (counter > 0) {
    if (regen.orderCounter !== counter) {
      regen.orderCounter = counter;
      changed = true;
    }
  } else {
    if ("orderCounter" in regen) {
      delete regen.orderCounter;
      changed = true;
    }
  }

  return changed;
}

export function syncEternalLifeCurrentFromRegen(entite) {
  return syncLifeCurrent(entite, 'eternalLife');
}



export function calculateLvlMaxBonus(willValue, config = {}) {
  const cfg = {
    ...levelWillBalance,
    ...config,
  };
  const base = cfg.baseMaxLevel ?? BASE_MAX_LEVEL;
  const wMax = config.willCap ?? config.willMaxBonus ?? cfg.willCap;
  const pivotWill = cfg.pivotWill;
  const targetMaxLevelAtWillCap = cfg.targetMaxLevelAtWillCap ?? WILL_MAX_BONUS;

  const w = Math.max(1, Math.min(Math.floor(Number(willValue) || 0), wMax));

  const lvlMin = Math.round(base * cfg.minLevelRatioAtWillOne);

  let lvlMaxFromWill;

  if (w <= pivotWill) {
    const t = (w - 1) / cfg.prePivotSpan;
    lvlMaxFromWill = lvlMin + (base - lvlMin) * t;
  } else {
    const t = (w - pivotWill) / cfg.postPivotSpan;
    const eased = 1 - (1 - t) * (1 - t); // easeOutQuad
    lvlMaxFromWill = base + (targetMaxLevelAtWillCap - base) * eased;
  }

  return Math.round(lvlMaxFromWill - base);
}


// 🧱 Helpers de niveau (format { current, max })
function getEntityCurrentLevel(entity) {
  // Garantit la présence de level.current / level.max
  ensureEntityLevelObject(entity);

  // Compatibilité avec d'anciens formats numériques
  const raw = (entity.level && typeof entity.level === 'object')
    ? entity.level.current
    : entity.level;

  const lvl = typeof raw === 'number' && !Number.isNaN(raw) ? raw : 1;
  return Math.max(1, Math.min(lvl, entity.level?.max ?? maxLevel));
}

function setEntityCurrentLevel(entity, newLevel) {
  ensureEntityLevelObject(entity);

  const maxForEntity = entity.level?.max ?? maxLevel;
  const safeLevel = Math.max(1, Math.min(maxForEntity, newLevel || 1));

  entity.level.current = safeLevel;
  return entity;
}

const OBJECT_STAT_KEYS = new Set(["HP", "armor", "extraLife", "shift"]);
const GENERATED_UMBRA_TARGET_KEYS = getGeneratedUmbraTargetKeys();
const GENERATED_STAT_KEYS = new Set([
  "HP",
  "armor",
  "extraLife",
  ...GENERATED_UMBRA_TARGET_KEYS,
  "speed",
  "charge",
  "weaponOrfevre",
  "weaponCollector",
  "bloodThirsty",
  "marathon",
  "trailer",
  "weight",
  "dayHpRegen",
]);
const WEAPON_ORFEVRE_AMPLIFICATION_CONFIG =
  balanceData.weaponOrfevre.equipmentAmplification || {};
const WEAPON_ORFEVRE_DETAIL_PRECISION =
  WEAPON_ORFEVRE_AMPLIFICATION_CONFIG.detailPrecision || 100;
const WEAPON_ORFEVRE_EFFECTIVE_PRECISION =
  WEAPON_ORFEVRE_AMPLIFICATION_CONFIG.effectivePrecision || 1;
const LOWER_IS_BETTER_STUFF_KEYS = new Set(["speed", "weight"]);

// 🔄 Préparation des entités
export const entitesNestUp = entitesNest.map(ent => enrichEntityStats({ ...ent }));
window.entitesNestUp = entitesNestUp;

function initModifierStats(entite) {
  if (!entite.modifierStats) {
    entite.modifierStats = {
      durable: {
        stuff: { byId: {}, orfevre: { activePercent: 0, byId: {} } },
        level: {},
        adminLevel: {},
        archetype: {},
        archetypeMeta: null,
        statLeveled: {},
        derived: {} // ✅ NEW
      }
    };
  } else {
    entite.modifierStats.durable ??= {};
    entite.modifierStats.durable.stuff ??= { byId: {} };
    entite.modifierStats.durable.stuff.byId ??= {};
    entite.modifierStats.durable.stuff.orfevre ??= { activePercent: 0, byId: {} };
    entite.modifierStats.durable.stuff.orfevre.byId ??= {};
    entite.modifierStats.durable.level ??= {};
    entite.modifierStats.durable.adminLevel ??= {};
    entite.modifierStats.durable.statLeveled ??= {};
    entite.modifierStats.durable.archetype ??= {};
    entite.modifierStats.durable.archetypeMeta ??= null;
    entite.modifierStats.durable.derived ??= {}; // ✅ NEW
  }
}

function normalizeBattleBoostsInPlace(entite) {
  const battleBoosts = entite?.battleBoosts;
  if (!battleBoosts || typeof battleBoosts !== "object") return;

  const normalized = {};

  for (const [key, boosts] of Object.entries(battleBoosts)) {
    const statKey = normalizeStatKey(key);
    if (!statKey) continue;

    const list = Array.isArray(boosts) ? boosts : [];
    normalized[statKey] ??= [];
    list.forEach(boost => {
      if (!boost || typeof boost !== "object") return;
      normalized[statKey].push({
        ...boost,
        stat: statKey,
      });
    });
  }

  entite.battleBoosts = normalized;
}

function normalizeEntityStatSources(entite) {
  if (!entite) return;

  if (entite.baseStats) normalizeStatModifierMapInPlace(entite.baseStats);

  const durable = entite.modifierStats?.durable;
  if (durable?.level) normalizeStatModifierMapInPlace(durable.level);
  if (durable?.adminLevel) normalizeStatModifierMapInPlace(durable.adminLevel);
  if (durable?.archetype) normalizeStatModifierMapInPlace(durable.archetype);
  if (durable?.statLeveled) normalizeStatModifierMapInPlace(durable.statLeveled);
  if (durable?.derived) normalizeStatModifierMapInPlace(durable.derived);

  const stuffById = durable?.stuff?.byId;
  if (stuffById && typeof stuffById === "object") {
    for (const key of Object.keys(stuffById)) {
      stuffById[key] = normalizeStatModifierMap(stuffById[key]);
    }
  }

  const preview = entite.modifierStats?.preview;
  if (preview?.statLeveled) normalizeStatModifierMapInPlace(preview.statLeveled);
  if (preview?.generated) normalizeStatModifierMapInPlace(preview.generated);
  if (preview?.total) normalizeStatModifierMapInPlace(preview.total);

  normalizeBattleBoostsInPlace(entite);
}

function isReverseArchetypeGenerated(entite) {
  return entite?.modifierStats?.durable?.archetypeMeta?.source === "reverseArchetype";
}

function hasConfirmedLevelUpStats(entite) {
  const statLeveled = entite?.modifierStats?.durable?.statLeveled;
  if (!statLeveled || typeof statLeveled !== "object") return false;

  return Object.values(statLeveled).some(value => {
    if (value && typeof value === "object") {
      return (Number(value.current ?? 0) || 0) !== 0 ||
        (Number(value.max ?? 0) || 0) !== 0;
    }

    return (Number(value ?? 0) || 0) !== 0;
  });
}

function hasConfirmedManualLevelUp(entite) {
  const meta = entite?.modifierStats?.durable?.levelUpMeta;
  if (!meta || meta.source !== "manualLevelUp") return false;

  const confirmedLevel = Number(meta.confirmedLevel ?? 0) || 0;
  const reverseMeta = entite?.modifierStats?.durable?.archetypeMeta || {};
  const reverseBaseLevel =
    Number(
      reverseMeta.level ??
      reverseMeta.requestedLevel ??
      meta.reverseBaseLevel ??
      0
    ) || 0;

  return confirmedLevel > Math.max(0, reverseBaseLevel);
}

function clearReverseArchetypeGeneration(entite) {
  if (!isReverseArchetypeGenerated(entite)) return;

  entite.modifierStats.durable.archetype = {};
  entite.modifierStats.durable.archetypeMeta = null;

  if (entite?.Archetype?.meta?.source === "reverseArchetype") {
    delete entite.Archetype;
  }
}

function applyReverseArchetypeGeneration(entite, options = {}) {
  initModifierStats(entite);

  if (
    options.forceReverseArchetype !== true &&
    (hasConfirmedLevelUpStats(entite) || hasConfirmedManualLevelUp(entite))
  ) {
    // Manual investments already account for these levels; preserve only the generation baseline.
    return null;
  }

  const plan = buildReverseArchetypePlan(entite, options);
  if (!plan) {
    clearReverseArchetypeGeneration(entite);
    return null;
  }

  entite.modifierStats.durable.archetype = plan.delta;
  entite.modifierStats.durable.archetypeMeta = plan.meta;
  entite.Archetype = {
    ...plan.archetypeState,
    meta: plan.meta,
  };
  assignExperienceFromLevel(entite, plan.meta.level);

  return plan;
}

function getArchetypeEntryStep(entry) {
  return Number(entry?.step ?? entry?.stage ?? 0) || 0;
}

function isManualArchetypeHistoryEntry(entry) {
  if (!entry || !entry.key) return false;
  if (getArchetypeEntryStep(entry) > 0) return true;
  return Array.isArray(entry.milestone) && entry.milestone.some(Boolean);
}

function normalizeArchetypeHistoryEntry(entry, keyOverride = null) {
  if (!entry) return null;
  const key = String(keyOverride ?? entry.key ?? "").trim().toLowerCase();
  if (!key) return null;

  const step = getArchetypeEntryStep(entry);
  const milestone = Array.isArray(entry.milestone)
    ? entry.milestone.slice(0, step)
    : [];

  return {
    key,
    level: Number(entry.level ?? 1) || 1,
    step,
    uid: entry.uid || getArchetypeUID(),
    milestone,
  };
}

function findBestManualArchetypeEntry(arch, key) {
  const targetKey = String(key || "").trim().toLowerCase();
  if (!targetKey) return null;

  const candidates = [];
  if (arch?.current?.key === targetKey && isManualArchetypeHistoryEntry(arch.current)) {
    candidates.push(arch.current);
  }
  if (Array.isArray(arch?.inProgress)) {
    candidates.push(
      ...arch.inProgress.filter(entry =>
        String(entry?.key || "").trim().toLowerCase() === targetKey &&
        isManualArchetypeHistoryEntry(entry)
      )
    );
  }

  return candidates
    .map(entry => normalizeArchetypeHistoryEntry(entry, targetKey))
    .filter(Boolean)
    .sort((a, b) =>
      (b.level - a.level) ||
      (b.step - a.step)
    )[0] || null;
}

function hasAwakenedArchetypeState(arch) {
  const nonEgare = (entry) => {
    const key = String(entry?.key || "").trim().toLowerCase();
    return !!key && key !== "egare";
  };

  if (nonEgare(arch?.current)) return true;
  if (Array.isArray(arch?.inProgress) && arch.inProgress.some(nonEgare)) return true;
  if (Array.isArray(arch?.achieve) && arch.achieve.some(entry =>
    nonEgare(entry) || String(entry?.key || "").trim().toLowerCase() === "egare"
  )) {
    return true;
  }

  return false;
}

function collectManualInProgressEntries(arch, currentEntry = null) {
  const byKeyLevel = new Map();
  const add = (entry) => {
    if (!isManualArchetypeHistoryEntry(entry)) return;
    const normalized = normalizeArchetypeHistoryEntry(entry);
    if (!normalized) return;

    const id = `${normalized.key}:${normalized.level}`;
    const existing = byKeyLevel.get(id);
    if (
      !existing ||
      normalized.step > existing.step ||
      (normalized.step === existing.step && normalized.milestone.length > existing.milestone.length)
    ) {
      byKeyLevel.set(id, normalized);
    }
  };

  if (Array.isArray(arch?.inProgress)) arch.inProgress.forEach(add);
  add(currentEntry);

  return [...byKeyLevel.values()];
}

function getEffectiveCurrentArchetypeLevel(arch, key, previousCurrent = null) {
  const targetKey = String(key || "").trim().toLowerCase();

  if (String(previousCurrent?.key || "").trim().toLowerCase() === targetKey) {
    return Number(previousCurrent.level ?? 1) || 1;
  }

  const achievedLevels = Array.isArray(arch?.achieve)
    ? arch.achieve
        .filter(entry => String(entry?.key || "").trim().toLowerCase() === targetKey)
        .map(entry => Number(entry?.level ?? 0) || 0)
    : [];

  const highestAchieved = Math.max(0, ...achievedLevels);
  return highestAchieved > 0 ? highestAchieved + 1 : 1;
}

export function resolveEffectiveArchetypeKey(entite, statsOverride = null, levelOverride = null) {
  if (entite?.archetypeFrozen === true) return 'egare';
  const stats = statsOverride || entite?.stats || {};
  const source = { ...entite, stats, modifierStats: { ...entite?.modifierStats, preview: null } };
  const arch = entite?.Archetype || null;
  const awakened = hasAwakenedArchetypeState(arch);
  const level = levelOverride ?? entite?.level?.current ?? 1;

  return String(
    getClassFromAttributs(
      getSafe(source, "strength", 0),
      getSafe(source, "agility", 0),
      getSafe(source, "intelligence", 0),
      level,
      awakened,
      entite
    ) || "egare"
  ).trim().toLowerCase();
}

export function syncEffectiveArchetypeCurrent(entite, statsOverride = null) {
  if (!entite?.Archetype) return entite;
  if (entite.Archetype?.meta?.source === "reverseArchetype") return entite;

  const arch = entite.Archetype;
  const effectiveKey = resolveEffectiveArchetypeKey(entite, statsOverride);
  const manualCurrent = findBestManualArchetypeEntry(arch, effectiveKey);
  const previousCurrent = arch.current || null;

  const current = manualCurrent || {
    key: effectiveKey,
    level: getEffectiveCurrentArchetypeLevel(arch, effectiveKey, previousCurrent),
    step: 0,
    uid:
      String(previousCurrent?.key || "").trim().toLowerCase() === effectiveKey
        ? (previousCurrent.uid || getArchetypeUID())
        : getArchetypeUID(),
    milestone: [],
  };

  arch.current = current;
  arch.inProgress = collectManualInProgressEntries(arch, current);
  if (Array.isArray(arch.achieve)) {
    arch.achieve = arch.achieve
      .filter(isManualArchetypeHistoryEntry)
      .map(entry => normalizeArchetypeHistoryEntry(entry))
      .filter(Boolean);
  } else {
    arch.achieve = [];
  }

  return entite;
}

// 2) Accumulation générique de valeurs (supporte number ou {flat, percent})
function isObjectStatDelta(value) {
  return value && typeof value === "object" && ("current" in value || "max" in value);
}

function toObjectStatDelta(value) {
  if (typeof value === "number") {
    return { current: value, max: value };
  }

  return {
    current: Number(value?.current ?? value?.max ?? 0) || 0,
    max: Number(value?.max ?? value?.current ?? 0) || 0,
  };
}

function addObjectStatDelta(a, b) {
  const left = toObjectStatDelta(a ?? 0);
  const right = toObjectStatDelta(b ?? 0);

  return {
    current: left.current + right.current,
    max: left.max + right.max,
  };
}

function removeGeneratedStatsFromDurableLeveled(entite) {
  const statLeveled = entite?.modifierStats?.durable?.statLeveled;
  if (!statLeveled) return;

  // Autonomous values live here too; generated bonuses stay in durable.derived.
  for (const key of ['speed', 'weight']) {
    delete statLeveled[key];
  }
}

function statCapacityValue(value) {
  if (value && typeof value === "object") {
    return Number(value.max ?? value.current ?? 0) || 0;
  }

  return Number(value ?? 0) || 0;
}

function readSnapshotStatCapacity(entity, key, fallback = 0) {
  return statCapacityValue(
    entity?.stats?.[key] ??
    entity?.baseStats?.[key] ??
    fallback
  );
}

function addFlatModifierDelta(delta, stat, value) {
  stat = normalizeStatKey(stat);
  const val = Number(value) || 0;
  if (!stat || !val) return;

  if (OBJECT_STAT_KEYS.has(stat)) {
    delta[stat] = addObjectStatDelta(delta[stat], val);
    return;
  }

  const current = delta[stat];
  if (typeof current === "number") {
    delta[stat] = current + val;
  } else if (current && typeof current === "object") {
    current.flat = (current.flat ?? 0) + val;
    delta[stat] = current;
  } else {
    delta[stat] = val;
  }
}

function addPercentModifierDelta(delta, stat, value) {
  stat = normalizeStatKey(stat);
  const val = Number(value) || 0;
  if (!stat || !val) return;

  const current = delta[stat];
  if (!current || typeof current !== "object") {
    delta[stat] = {};
    if (typeof current === "number") {
      delta[stat].flat = current;
    }
  }

  delta[stat].percent = (delta[stat].percent ?? 0) + val;
}

export function buildStuffModifierDelta(item) {
  const delta = {};
  const effects = Array.isArray(item?.Stuffeffets) ? item.Stuffeffets : [];

  for (const eff of effects) {
    if (!eff || (eff.type !== "stat-buff" && eff.type !== "stat-malus")) continue;

    const sourceStat = normalizeStatKey(eff.stat);
    const stat = sourceStat && eff.variant === '+' && !sourceStat.endsWith('Plus') ? `${sourceStat}Plus` : sourceStat;
    const sign = eff.type === "stat-malus" ? -1 : 1;
    const value = stat === 'shift' && isObjectStatDelta(eff.value)
      ? { current: (Number(eff.value.current) || 0) * sign, max: (Number(eff.value.max) || 0) * sign }
      : multiplyStuffEffectValue(eff.value, sign);
    if (!stat) continue;

    if (isObjectStatDelta(value)) {
      delta[stat] = addObjectStatDelta(delta[stat], value);
      continue;
    }

    if (value && typeof value === "object") {
      if (typeof value.flat === "number") {
        addFlatModifierDelta(delta, stat, value.flat);
      }
      if (typeof value.percent === "number") {
        addPercentModifierDelta(delta, stat, value.percent);
      }
      continue;
    }

    const isPercent =
      eff.mode === "percent" ||
      eff.valueType === "percent" ||
      eff.percent === true;

    if (isPercent) {
      addPercentModifierDelta(delta, stat, value);
    } else {
      addFlatModifierDelta(delta, stat, value);
    }
  }

  return delta;
}

function multiplyStuffEffectValue(value, multiplier = 1) {
  const factor = Number(multiplier) || 1;

  if (isObjectStatDelta(value)) {
    return {
      current: (Number(value.current ?? value.max ?? 0) || 0) * factor,
      max: (Number(value.max ?? value.current ?? 0) || 0) * factor,
    };
  }

  if (value && typeof value === "object") {
    const out = {};
    if (typeof value.flat === "number") out.flat = value.flat * factor;
    if (typeof value.percent === "number") out.percent = value.percent * factor;
    return out;
  }

  return (Number(value) || 0) * factor;
}

function roundToPrecision(value, precision = 1) {
  const n = Number(value) || 0;
  if (!Number.isFinite(n)) return 0;
  const factor = Math.max(1, Number(precision) || 1);
  const rounded = Math.round(n * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function roundWeaponOrfevreContribution(value) {
  return roundToPrecision(value, WEAPON_ORFEVRE_DETAIL_PRECISION);
}

function roundWeaponOrfevreEffectiveContribution(value) {
  return roundToPrecision(value, WEAPON_ORFEVRE_EFFECTIVE_PRECISION);
}

function getPositiveWeaponOrfevrePercent(percent) {
  const value = Number(percent) || 0;
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function isBeneficialStuffNumber(stat, value) {
  const raw = Number(value) || 0;
  const statKey = normalizeStatKey(stat);

  if (LOWER_IS_BETTER_STUFF_KEYS.has(statKey)) {
    return raw < 0;
  }

  return raw > 0;
}

function adjustStuffNumberByWeaponOrfevre(value, activePercent, { effective = true, stat = null } = {}) {
  const raw = Number(value) || 0;
  if (!raw || activePercent <= 0) {
    return roundWeaponOrfevreContribution(raw);
  }

  const beneficial = isBeneficialStuffNumber(stat, raw);
  // Same active Orfevre calculation and rounding; penalties approach zero without becoming bonuses.
  const boosted = raw * (beneficial ? 1 + activePercent / 100 : Math.max(0, 1 - activePercent / 100));
  return effective
    ? roundWeaponOrfevreEffectiveContribution(boosted)
    : roundWeaponOrfevreContribution(boosted);
}

function cloneModifierValue(value) {
  if (typeof value === "number") {
    return roundWeaponOrfevreContribution(value);
  }

  if (isObjectStatDelta(value)) {
    return {
      current: roundWeaponOrfevreContribution(value.current ?? value.max ?? 0),
      max: roundWeaponOrfevreContribution(value.max ?? value.current ?? 0),
    };
  }

  if (value && typeof value === "object") {
    const out = {};
    if (typeof value.flat === "number") {
      out.flat = roundWeaponOrfevreContribution(value.flat);
    }
    if (typeof value.percent === "number") {
      out.percent = roundWeaponOrfevreContribution(value.percent);
    }
    return out;
  }

  return 0;
}

function isZeroModifierValue(value) {
  if (typeof value === "number") {
    return Math.abs(value) < 0.000001;
  }

  if (isObjectStatDelta(value)) {
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

  return true;
}

function scaleStuffModifierValueByWeaponOrfevre(value, activePercent, options = {}) {
  if (typeof value === "number") {
    return adjustStuffNumberByWeaponOrfevre(value, activePercent, options);
  }

  if (isObjectStatDelta(value)) {
    return {
      current: adjustStuffNumberByWeaponOrfevre(value.current ?? value.max ?? 0, activePercent, options),
      max: adjustStuffNumberByWeaponOrfevre(value.max ?? value.current ?? 0, activePercent, options),
    };
  }

  if (value && typeof value === "object") {
    const out = {};
    if (typeof value.flat === "number") {
      out.flat = adjustStuffNumberByWeaponOrfevre(value.flat, activePercent, options);
    }
    if (typeof value.percent === "number") {
      out.percent = adjustStuffNumberByWeaponOrfevre(value.percent, activePercent, options);
    }
    return out;
  }

  return 0;
}

function subtractModifierValue(nextValue, previousValue) {
  if (isObjectStatDelta(nextValue) || isObjectStatDelta(previousValue)) {
    const next = toObjectStatDelta(nextValue ?? 0);
    const previous = toObjectStatDelta(previousValue ?? 0);
    return {
      current: roundWeaponOrfevreContribution(next.current - previous.current),
      max: roundWeaponOrfevreContribution(next.max - previous.max),
    };
  }

  if (
    (nextValue && typeof nextValue === "object") ||
    (previousValue && typeof previousValue === "object")
  ) {
    const toFlatPercent = (value) => {
      if (typeof value === "number") {
        return { flat: value, percent: 0 };
      }
      return cloneModifierValue(value);
    };
    const next = toFlatPercent(nextValue);
    const previous = toFlatPercent(previousValue);
    const out = {};
    const flat = roundWeaponOrfevreContribution(
      (Number(next.flat ?? 0) || 0) - (Number(previous.flat ?? 0) || 0)
    );
    const percent = roundWeaponOrfevreContribution(
      (Number(next.percent ?? 0) || 0) - (Number(previous.percent ?? 0) || 0)
    );

    if (flat) out.flat = flat;
    if (percent) out.percent = percent;
    return out;
  }

  return roundWeaponOrfevreContribution(
    (Number(nextValue ?? 0) || 0) - (Number(previousValue ?? 0) || 0)
  );
}

function addModifierValueToDelta(delta, stat, value) {
  stat = normalizeStatKey(stat);
  if (!stat || isZeroModifierValue(value)) return;

  if (typeof value === "number") {
    addFlatModifierDelta(delta, stat, value);
    return;
  }

  if (isObjectStatDelta(value)) {
    delta[stat] = addObjectStatDelta(delta[stat], value);
    return;
  }

  if (value && typeof value === "object") {
    if (typeof value.flat === "number") {
      addFlatModifierDelta(delta, stat, value.flat);
    }
    if (typeof value.percent === "number") {
      addPercentModifierDelta(delta, stat, value.percent);
    }
  }
}

export function calculateWeaponOrfevreActivePercentFromStats(stats = {}) {
  if (Number(stats.weaponOrfevrePlus) > 0) return calculateStatSources(stats, 'weaponOrfevre', { effective: true }).value;
  const directOrfevre = Math.max(0, Number(stats?.weaponOrfevre ?? 0) || 0);
  const weaponMasteryValue = Math.max(0, Number(stats?.weaponMastery ?? 0) || 0);

  if (weaponMasteryValue <= 0) {
    return roundWeaponOrfevreContribution(directOrfevre);
  }

  const masteryBonus =
    Number(calculateWeaponOrfevreWeaponMastery(null, weaponMasteryValue) || 0) +
    Number(calculateWeaponOrfevreStrength(null, Math.max(0, Number(stats?.strength ?? 0) || 0)) || 0);

  return roundWeaponOrfevreContribution(directOrfevre + masteryBonus);
}

export function buildWeaponOrfevreStuffModifier(rawDelta = {}, activePercent = 0) {
  const percent = getPositiveWeaponOrfevrePercent(activePercent);
  const canonicalRawDelta = normalizeStatModifierMap(rawDelta || {});
  const effective = {};
  const bonus = {};
  const details = {};

  for (const [stat, rawValue] of Object.entries(canonicalRawDelta)) {
    const raw = cloneModifierValue(rawValue);
    if (['extraLife', 'eternalLife'].includes(stat)) {
      effective[stat] = raw;
      continue;
    }
    const total = scaleStuffModifierValueByWeaponOrfevre(rawValue, percent, { stat });
    const exactTotal = scaleStuffModifierValueByWeaponOrfevre(rawValue, percent, { effective: false, stat });
    const extra = subtractModifierValue(total, raw);
    const exactExtra = subtractModifierValue(exactTotal, raw);

    if (!isZeroModifierValue(total)) effective[stat] = total;
    if (!isZeroModifierValue(extra)) bonus[stat] = extra;

    if (percent > 0 && !isZeroModifierValue(raw)) {
      details[stat] = {
        stat,
        raw,
        bonus: extra,
        exactBonus: exactExtra,
        exactTotal,
        total,
        activePercent: percent,
      };
    }
  }

  return { activePercent: percent, raw: structuredClone(canonicalRawDelta), effective, bonus, details };
}

export function buildWeaponOrfevreStuffModifiersById(rawById = {}, activePercent = 0) {
  const percent = getPositiveWeaponOrfevrePercent(activePercent);
  const byId = {};
  const bonusById = {};
  const detailsById = {};

  for (const [equippedId, rawDelta] of Object.entries(rawById || {})) {
    const computed = buildWeaponOrfevreStuffModifier(normalizeStatModifierMap(rawDelta), percent);

    if (Object.keys(computed.effective).length > 0) {
      byId[equippedId] = computed.effective;
    }
    if (Object.keys(computed.bonus).length > 0) {
      bonusById[equippedId] = computed.bonus;
    }
    if (Object.keys(computed.details).length > 0) {
      detailsById[equippedId] = computed.details;
    }
  }

  return { activePercent: percent, byId, bonusById, detailsById };
}

function setWeaponOrfevreStuffMeta(entite, computedStuff, sourceStats) {
  initModifierStats(entite);
  entite.modifierStats.durable.stuff.orfevre = {
    activePercent: computedStuff.activePercent,
    source: {
      weaponOrfevre: roundWeaponOrfevreContribution(sourceStats?.weaponOrfevre ?? 0),
      weaponOrfevrePlus: roundWeaponOrfevreContribution(sourceStats?.weaponOrfevrePlus ?? 0),
      weaponMastery: roundWeaponOrfevreContribution(sourceStats?.weaponMastery ?? 0),
      strength: roundWeaponOrfevreContribution(sourceStats?.strength ?? 0),
    },
    byId: computedStuff.detailsById,
    bonusById: computedStuff.bonusById,
    effectiveById: computedStuff.byId,
  };
}

export function getWeaponOrfevreStuffActivePercent(entite) {
  return getPositiveWeaponOrfevrePercent(
    entite?.modifierStats?.durable?.stuff?.orfevre?.activePercent ?? 0
  );
}

export function getWeaponOrfevrePreviewActivePercent(entite) {
  const source =
    entite?.modifierStats?.durable?.stuff?.orfevre?.source ||
    {
      weaponOrfevre: entite?.stats?.weaponOrfevre ?? 0,
      weaponMastery: entite?.stats?.weaponMastery ?? 0,
      strength: entite?.stats?.strength ?? 0,
    };
  const preview = normalizeStatModifierMap(entite?.modifierStats?.preview?.statLeveled || {});
  let previewStrength = Number(source.strength) || 0;
  if (preview.strength != null) {
    const raw = applyModifiers(entite.baseStats, entite.modifierStats, { includeDerived: false,
      stuffByIdOverride: entite.modifierStats?.durable?.stuff?.byId || {} });
    const delta = preview.strength;
    raw.strength = (statCapacityValue(raw.strength) + (typeof delta === 'number' ? delta : Number(delta.flat) || 0))
      * (1 + (Number(delta?.percent) || 0) / 100);
    applyDirectingPointLimits(entite, raw, { preview: true });
    previewStrength = Number(raw.strength) || 0;
  }

  return calculateWeaponOrfevreActivePercentFromStats({
    weaponOrfevrePlus: (Number(source.weaponOrfevrePlus) || 0) + (Number(preview.weaponOrfevrePlus) || 0),
    weaponOrfevre:
      (Number(source.weaponOrfevre ?? 0) || 0) +
      (Number(preview.weaponOrfevre ?? 0) || 0),
    weaponMastery:
      (Number(source.weaponMastery ?? 0) || 0) +
      (Number(preview.weaponMastery ?? 0) || 0),
    strength: previewStrength,
  });
}

export function getStuffWeaponOrfevreBoostDetails(entite, itemOrDelta, options = {}) {
  const activePercent =
    options.activePercent !== undefined
      ? options.activePercent
      : getWeaponOrfevrePreviewActivePercent(entite);
  const rawDelta = Array.isArray(itemOrDelta?.Stuffeffets)
    ? buildStuffModifierDelta(itemOrDelta)
    : (itemOrDelta || {});

  return buildWeaponOrfevreStuffModifier(rawDelta, activePercent);
}

export function getWeaponOrfevreStuffPreviewDelta(entite, previewActivePercent = null) {
  if (!entite) return {};
  initModifierStats(entite);

  const currentPercent = getWeaponOrfevreStuffActivePercent(entite);
  const nextPercent =
    previewActivePercent === null || previewActivePercent === undefined
      ? getWeaponOrfevrePreviewActivePercent(entite)
      : previewActivePercent;

  if (roundWeaponOrfevreContribution(currentPercent) === roundWeaponOrfevreContribution(nextPercent)) {
    return {};
  }

  const rawById = entite?.modifierStats?.durable?.stuff?.byId || {};
  const currentStuff = buildWeaponOrfevreStuffModifiersById(rawById, currentPercent).byId;
  const previewStuff = buildWeaponOrfevreStuffModifiersById(rawById, nextPercent).byId;
  const delta = {};
  const ids = new Set([
    ...Object.keys(currentStuff),
    ...Object.keys(previewStuff),
  ]);

  for (const equippedId of ids) {
    const currentDelta = currentStuff[equippedId] || {};
    const previewDelta = previewStuff[equippedId] || {};
    const stats = new Set([
      ...Object.keys(currentDelta),
      ...Object.keys(previewDelta),
    ]);

    for (const stat of stats) {
      const diff = subtractModifierValue(previewDelta[stat], currentDelta[stat]);
      addModifierValueToDelta(delta, stat, diff);
    }
  }

  return delta;
}

function accumulateModifier(target, mod) {
  if (!mod) return;
  for (const k of Object.keys(mod)) {
    const statKey = normalizeStatKey(k);
    if (!statKey) continue;
    const v = mod[k];
    if (typeof v === 'number') {
      target.flat[statKey] = (target.flat[statKey] ?? 0) + v;
    } else if (v && typeof v === 'object') {
      if (isObjectStatDelta(v)) {
        target.object[statKey] = addObjectStatDelta(target.object[statKey], v);
      }
      if (typeof v.flat === 'number') {
        target.flat[statKey] = (target.flat[statKey] ?? 0) + v.flat;
      }
      if (typeof v.percent === 'number') {
        target.percent[statKey] = (target.percent[statKey] ?? 0) + v.percent;
      }
    }
  }
}

function aggregateDurableModifiers(modifierStats, { includeDerived = true, stuffByIdOverride = null } = {}) {
  const acc = { flat: {}, percent: {}, object: {} };
  if (!modifierStats) return acc;

  if (modifierStats.durable?.level) accumulateModifier(acc, modifierStats.durable.level);
  if (modifierStats.durable?.adminLevel) accumulateModifier(acc, modifierStats.durable.adminLevel);
  if (modifierStats.durable?.archetype) accumulateModifier(acc, modifierStats.durable.archetype);

  const byId = stuffByIdOverride ?? modifierStats.durable?.stuff?.byId ?? {};
  for (const itemId of Object.keys(byId)) accumulateModifier(acc, byId[itemId]);

  if (modifierStats.durable?.statLeveled) accumulateModifier(acc, modifierStats.durable.statLeveled);

  if (includeDerived && modifierStats.durable?.derived) {
    accumulateModifier(acc, modifierStats.durable.derived);
  }

  return acc;
}

function applyModifiers(baseStats = {}, modifierStats, { includeDerived = true, stuffByIdOverride = null, readOnly = false } = {}) {
  // Read-only projections replace top-level values; object deltas also produce
  // new objects. Cloning every reserve is needed only for writable entity stats.
  const base = readOnly ? { ...baseStats } : structuredClone(baseStats);
  const { flat, percent, object } = aggregateDurableModifiers(
    modifierStats,
    { includeDerived, stuffByIdOverride }
  );

  for (const k of Object.keys(flat)) {
    const baseVal = statCapacityValue(base[k]);
    base[k] = baseVal + flat[k];
  }

  for (const k of Object.keys(percent)) {
    const baseVal = statCapacityValue(base[k]);
    base[k] = Math.round(baseVal * (1 + percent[k] / 100));
  }

  for (const k of Object.keys(object)) {
    const delta = object[k];

    if (k === "shift") {
      base[k] = addObjectStatDelta(base[k], delta);
      continue;
    }

    if (OBJECT_STAT_KEYS.has(k)) {
      base[k] = statCapacityValue(base[k]) + Number(delta.max ?? delta.current ?? 0);
      continue;
    }

    base[k] = statCapacityValue(base[k]) + Number(delta.max ?? delta.current ?? 0);
  }

  return base;
}

// Read-only input for helpers: reuse the modifier pipeline before generated stats.
export function getStatBeforeGeneration(entity, key, fallback = 0) {
  const values = applyModifiers(entity?.baseStats || {}, entity?.modifierStats, {
    stuffByIdOverride: entity?.modifierStats?.durable?.stuff?.orfevre?.effectiveById ?? null,
  });
  return values[key] ?? fallback;
}

// Levels/archetypes are natural; equipment/admin/buffs are external;
// permanent crystals retain their own full-strength source. Stored gains stay raw.
function applyDirectingPointLimits(entity, values, { preview = false } = {}) {
  const durable = entity?.modifierStats?.durable || {};
  const naturalBase = { ...entity?.baseStats };
  for (const key of getPointLimitedStatKeys()) {
    naturalBase[key] = statCapacityValue(naturalBase[key]) - statCapacityValue(entity?.baseStatSources?.crystal?.[key]);
  }
  const natural = applyModifiers(naturalBase, { durable: {
    level: durable.level, archetype: durable.archetype, statLeveled: durable.statLeveled,
  } }, { includeDerived: false, readOnly: true });
  const details = {};
  for (const key of getPointLimitedStatKeys()) {
    if (!Object.hasOwn(values, key)) continue;
    const delta = preview ? entity?.modifierStats?.preview?.statLeveled?.[key] : 0;
    const flat = typeof delta === 'number' ? delta : statCapacityValue(delta?.flat ?? delta?.max ?? delta?.current);
    const points = (statCapacityValue(natural[key]) + flat) * (1 + (Number(delta?.percent) || 0) / 100);
    const crystal = statCapacityValue(entity?.baseStatSources?.crystal?.[key]);
    details[key] = calculateStatPointLimit(points, statCapacityValue(values[key]) - points - crystal, crystal, getStatPointThreshold(entity, key));
    values[key] = details[key].value;
  }
  if (isStatSystemReady()) values[STAT_POINT_INPUTS] = details;
  return values;
}

// Returned inputs are a read-only projection, never an editable entity reserve.
// Compare the actual source values, including in-place edits and balance settings.
// No frame/time-based cache: a buff or admin edit is visible on the very next read.
var statInputReads;
export function getStatSystemInputs(entity, { preview = true, combat = true } = {}) {
  const durable = entity?.modifierStats?.durable || {};
  const canReuse = entity && isStatSystemReady()
    && !(preview && entity.modifierStats?.preview?.statLeveled && durable.stuff?.orfevre);
  const mode = (preview ? 1 : 0) + (combat ? 2 : 0);
  const signature = canReuse ? JSON.stringify([
    entity.baseStats, entity.baseStatSources, durable.level, durable.adminLevel,
    durable.archetype, durable.statLeveled, durable.stuff?.byId, durable.stuff?.orfevre?.effectiveById,
    preview ? entity.modifierStats?.preview?.statLeveled : null,
    combat ? entity.battleBoosts : null, entity.Archetype, entity.archetypeFrozen,
    entity.seuilUmbra, entity._statSystemOverrides, balanceData.generatedUmbraStats.progression,
    getPointLimitedStatKeys(),
  ]) : null;
  const previous = canReuse && statInputReads?.get(entity)?.get(mode);
  if (previous && previous.signature === signature) return { ...previous.values };
  const values = applyModifiers(entity?.baseStats || {}, entity?.modifierStats, {
    includeDerived: false,
    stuffByIdOverride: durable.stuff?.orfevre?.effectiveById ?? null,
    readOnly: true,
  });
  const add = (key, delta) => {
    const current = statCapacityValue(values[key]);
    const flat = typeof delta === 'number' ? delta : statCapacityValue(delta?.flat ?? delta?.max ?? delta?.current);
    values[key] = (current + flat) * (1 + (Number(delta?.percent) || 0) / 100);
  };
  if (preview) {
    for (const [key, delta] of Object.entries(entity?.modifierStats?.preview?.statLeveled || {})) add(key, delta);
    if (entity?.modifierStats?.preview?.statLeveled && durable.stuff?.orfevre) {
      for (const [key, delta] of Object.entries(getWeaponOrfevreStuffPreviewDelta(entity))) add(key, delta);
    }
  }
  if (combat) for (const [key, boosts] of Object.entries(entity?.battleBoosts || {})) {
    const flat = boosts.filter(boost => boost.mode === 'flat').reduce((sum, boost) => sum + (Number(boost.value) || 0), 0);
    const percent = boosts.filter(boost => boost.mode === 'percent').reduce((sum, boost) => sum + (Number(boost.value) || 0), 0);
    add(key, { flat, percent });
  }
  Object.assign(values, filterRestrictedUmbras(entity, values));
  applyDirectingPointLimits(entity, values, { preview });
  // Attack views provide already evaluated, restricted source values.
  Object.assign(values, entity?._statSystemOverrides);
  if (canReuse) {
    statInputReads ??= new WeakMap();
    let modes = statInputReads.get(entity);
    if (!modes) { modes = new Map(); statInputReads.set(entity, modes); }
    modes.set(mode, { signature, values: { ...values } });
  }
  return values;
}

function findStuffItemData(equippedId, equippedItems) {
  if (!equippedId || typeof equippedId !== "string" || !equippedId.startsWith("e")) {
    return null;
  }

  return getEquippedItemById(equippedId, equippedItems);
}

function normalizeEquippedModifierId(itemId) {
  if (!itemId || typeof itemId !== "string" || !itemId.startsWith("e")) return null;
  return itemId;
}

export function syncEntityStuffModifiers(entite, { equippedItems } = {}) {
  if (!entite) return entite;

  initModifierStats(entite);

  const sourceStuff =
    entite.stuff && typeof entite.stuff === "object"
      ? entite.stuff
      : {};
  const normalizedStuff = {};
  const slotEquippedIds = new Set();

  for (const [slotKey, rawSlot] of Object.entries(sourceStuff)) {
    const rawIds = Array.isArray(rawSlot)
      ? rawSlot
      : [];
    const normalizedIds = rawIds
      .map(normalizeEquippedModifierId)
      .filter(Boolean);

    normalizedStuff[slotKey] = normalizedIds;
    normalizedIds.forEach(equippedId => slotEquippedIds.add(equippedId));
  }

  entite.stuff = normalizedStuff;

  const nextById = {};

  for (const equippedId of slotEquippedIds) {
    const item = findStuffItemData(equippedId, equippedItems);
    if (!item) continue;
    ensureStuffArmorReserve(item);

    const delta = stripStuffResourceModifiers(stripStuffArmorModifier(buildStuffModifierDelta(item)));

    if (delta && Object.keys(delta).length > 0) {
      nextById[equippedId] = delta;
    }
  }

  entite.modifierStats.durable.stuff.byId = nextById;

  return entite;
}

function refreshDerivedDurable(entite, baseStats, { stuffByIdOverride = null } = {}) {
  initModifierStats(entite);

  const primary = applyModifiers(
    baseStats,
    entite.modifierStats,
    { includeDerived: false, stuffByIdOverride }
  );

  Object.assign(primary, filterRestrictedUmbras(entite, primary));
  applyDirectingPointLimits(entite, primary);
  const vit = primary.vitality ?? 0;
  const generatedUmbraStats = calculateGeneratedUmbraStats({ stats: primary });

  for (const key of GENERATED_UMBRA_TARGET_KEYS) {
    const value = Number(generatedUmbraStats[key] || 0);
    if (value > 0) {
      entite.modifierStats.durable.derived[key] = value;
    } else {
      delete entite.modifierStats.durable.derived[key];
    }
  }

  const hpBonus = calculateVitalityBonus(vit);
  if (hpBonus > 0) entite.modifierStats.durable.derived.HP = hpBonus;
  else delete entite.modifierStats.durable.derived.HP;

  // transcendence → extraLife (flat)
  const transPts = getTranscendencePoints(primary);
  const extraLifeBonus = calculateTranscendenceExtraLife(transPts, getUmbraThreshold(entite));

  if (extraLifeBonus > 0) entite.modifierStats.durable.derived.extraLife = extraLifeBonus;
  else delete entite.modifierStats.durable.derived.extraLife;
  
const weaponMasteryPts = Number(primary.weaponMastery ?? 0) || 0;
const strengthPts = Number(primary.strength ?? 0) || 0;

const chargeBonus = weaponMasteryPts > 0
  ? calculateWeaponMasteryCharge(null, weaponMasteryPts) +
    weaponMasteryChargeStrenghtRatioBonus(null, strengthPts)
  : 0;

if (chargeBonus > 0) {
  entite.modifierStats.durable.derived.charge = chargeBonus;
} else {
  delete entite.modifierStats.durable.derived.charge;
}
}

function normalizeEternalLifeSource(src) {
  if (typeof src === "number") {
    const count = toNonNegInt(src);
    return count > 0 ? { current: count, max: count } : null;
  }

  if (src && typeof src === "object") {
    const maxRaw = toNonNegInt(src.max ?? src.current ?? 0);
    if (maxRaw <= 0) return null;

    const curRaw = toNonNegInt(src.current ?? maxRaw);
    return { current: Math.min(curRaw, maxRaw), max: maxRaw };
  }

  return null;
}

function normalizeExtraLifeSource(src) {
  if (typeof src === "number") {
    const n = toNonNegInt(src);
    return n > 0 ? { current: n, max: n } : null;
  }

  if (src && typeof src === "object") {
    const max = toNonNegInt(src.max ?? src.current ?? 0);
    if (max <= 0) return null;

    const curRaw = toNonNegInt(src.current ?? max);
    const cur = Math.min(curRaw, max);

    // ✅ garder même si cur === 0
    return { current: cur, max };
  }

  return null;
}

function normalizeFadedLifeSource(src) {
  // src = number ou {current} → on retourne un INT >=0
  if (typeof src === "number") return toNonNegInt(src);

  if (src && typeof src === "object") {
    return toNonNegInt(src.current ?? 0);
  }

  return 0;
}
export function rescaleHPCurrent(previousHP, nextMax) {
  const max = Math.max(1, Math.round(Number(nextMax) || 1));
  const current = previousHP?.current;
  if (!Number.isFinite(current)) return max;
  if (current <= 0) return 0;
  const oldMax = previousHP?.max;
  if (!Number.isFinite(oldMax) || oldMax <= 0) return Math.min(current, max);
  if (oldMax === max) return Math.min(current, max);
  // Integer HP, without killing a living entity through rounding alone.
  return Math.min(max, Math.max(1, Math.round(Math.min(1, current / oldMax) * max)));
}

function computeFinalStats(
  basePlusMods,
  previousHP,
  oldArmorCurrent,
  prevExtraLifeObj,
  prevEternalLifeObj,
  prevFadedLifeNumber,
  baseExtraLifeSrc,
  baseEternalLifeSrc,
  baseFadedLifeSrc,
  baseDayHpRegenSrc = 0 // ✅ baseStats.dayHpRegen (ou 0 si absent)
) {
  const out = structuredClone(basePlusMods);

  if (typeof out.extraLife === "number") delete out.extraLife;
  if (typeof out.eternalLife === "number") delete out.eternalLife;
  if (typeof out.fadedLife === "number") delete out.fadedLife;

  // --- HP (HP.max FINAL après bonus Vitalité/derived déjà inclus dans basePlusMods.HP) ---
  const hpMaxRaw = Math.max(1, Math.round(basePlusMods.HP ?? 1));
  const newHpMax = hpMaxRaw;

  const newHpCurrent = rescaleHPCurrent(previousHP, newHpMax);

  out.HP = { current: newHpCurrent, max: newHpMax };

  // --- DAY HP REGEN (baseStats.dayHpRegen + bonus Vitalité indexé sur HP.max FINAL) ---
  const dayHpRegenBase = Math.max(0, Math.round(toNumber(baseDayHpRegenSrc ?? 0, 0)));

  const vitality = Math.max(0, toNumber(basePlusMods.vitality ?? 0, 0)); // ✅ vitalité finale (mods inclus)
  const regenPercent = calculateVitalityRegenPercent(vitality);          // ✅ %
  const dayHpRegenFromVitality = calculateVitalityRegenAmount(out.HP.max, regenPercent); // ✅ bonus HP

  out.dayHpRegen = calculateTotalRegenAmount(dayHpRegenBase, dayHpRegenFromVitality);   // ✅ total
  // ⚠️ on garde dayHpRegen même si 0 (pas de delete)

  // --- ARMOR ---
  const armorMaxRaw = Math.max(0, Math.round(basePlusMods.armor ?? 0));
  if (armorMaxRaw > 0) {
    const armorCur = (typeof oldArmorCurrent === "number")
      ? Math.min(oldArmorCurrent, armorMaxRaw)
      : armorMaxRaw;

    out.armor = { current: armorCur, max: armorMaxRaw };
  } else {
    if (out.armor && typeof out.armor === "object") delete out.armor;
  }
// --- MOVEMENT / SHIFT ---
const hasMovementStat =
  basePlusMods.movement !== undefined &&
  basePlusMods.movement !== null &&
  Number(basePlusMods.movement) > 0;

const movementValue = hasMovementStat
  ? Math.max(0, Math.round(Number(basePlusMods.movement) || 0))
  : 0;

const baseShift = basePlusMods.shift;

const hasShiftObject =
  baseShift &&
  typeof baseShift === "object";

const baseShiftCurrent = hasShiftObject
  ? Math.max(0, Math.round(Number(baseShift.current) || 0))
  : null;

const baseShiftMax = hasShiftObject
  ? Math.max(0, Math.round(Number(baseShift.max) || 0))
  : null;

out.movement = movementValue;

if (hasMovementStat && hasShiftObject) {
  out.shift = {
    current: baseShiftCurrent + movementValue,
    max: baseShiftMax + movementValue,
  };
} else if (hasMovementStat && !hasShiftObject) {
  const autoShift = calculateMovementStartingCharges({
    stats: {
      ...out,
      movement: movementValue,
    },
  });

  out.shift = {
    current: Math.min(autoShift, movementValue),
    max: movementValue,
  };
} else if (!hasMovementStat && hasShiftObject) {
  out.shift = {
    current: baseShiftCurrent,
    max: baseShiftMax,
  };
} else {
  out.shift = {
    current: 0,
    max: 1,
    baseDefault: true,
  };
}
  // --- EXTRA LIFE ---
  const hasOwn = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);

  const explicitExtraCurrent =
    (baseExtraLifeSrc && typeof baseExtraLifeSrc === "object" && hasOwn(baseExtraLifeSrc, "current"))
      ? toNonNegInt(baseExtraLifeSrc.current)
      : null;

  const baseExtraNorm = normalizeExtraLifeSource(baseExtraLifeSrc);

  const baseExtraMax =
    baseExtraNorm?.max ??
    ((baseExtraLifeSrc && typeof baseExtraLifeSrc === "object" && hasOwn(baseExtraLifeSrc, "max"))
      ? toNonNegInt(baseExtraLifeSrc.max)
      : 0);

  const baseExtraCur = baseExtraNorm?.current ?? 0;

  // Preserve reductions until they have been applied to the native life pool.
  const modExtra = Number(basePlusMods.extraLife) || 0;
  const extraMax = toNonNegInt(baseExtraMax + modExtra);

  const prevExtraCur =
    (prevExtraLifeObj && typeof prevExtraLifeObj === "object")
      ? toNonNegInt(prevExtraLifeObj.current)
      : null;

  let extraCur;
  if (prevExtraCur !== null) extraCur = Math.min(prevExtraCur, extraMax);
  else if (explicitExtraCurrent !== null) extraCur = Math.min(explicitExtraCurrent, extraMax);
  else extraCur = Math.min(toNonNegInt(baseExtraCur + modExtra), extraMax);

  if (extraCur > extraMax) extraCur = extraMax;

  if (extraMax > 0) out.extraLife = { current: extraCur, max: extraMax };
  else delete out.extraLife;

  // --- FADED LIFE ---
  const baseFaded = normalizeFadedLifeSource(baseFadedLifeSrc);
  const modFaded  = toNonNegInt(basePlusMods.fadedLife ?? 0);

  let fadedCur = baseFaded + modFaded;

  const prevFadedCur = (typeof prevFadedLifeNumber === "number")
    ? toNonNegInt(prevFadedLifeNumber)
    : null;

  if (prevFadedCur !== null) fadedCur = prevFadedCur;

  if (fadedCur > 0) out.fadedLife = fadedCur;
  else delete out.fadedLife;

  // --- ETERNAL LIFE ---
  const baseEternal = normalizeEternalLifeSource(baseEternalLifeSrc);
  const modEternalRaw = toNonNegInt(basePlusMods.eternalLife ?? 0);

  const eternalMax = (baseEternal?.max || 0) + modEternalRaw;

  const prevEternalCur =
    (prevEternalLifeObj && typeof prevEternalLifeObj === "object")
      ? toNonNegInt(prevEternalLifeObj.current)
      : null;

  let eternalCur = (baseEternal?.current || 0) + modEternalRaw;

  if (prevEternalCur !== null) eternalCur = Math.min(prevEternalCur, eternalMax);

  if (eternalMax > 0) out.eternalLife = { current: eternalCur, max: eternalMax };
  else delete out.eternalLife;

  // --- SPEED / VELOCITY ---
  const baseSpeed = basePlusMods.speed ?? 1000;
  const velocity = basePlusMods.velocity ?? 0;

  if (velocity > 0 && baseSpeed) {
    const { adjustedSpeed } = calculateVelocityReduction(velocity, baseSpeed);
    out.speed = adjustedSpeed;
  } else {
    out.speed = baseSpeed;
  }

  return out;
}

// 6) Recalcule et stocke entite.stats à partir de baseStats + modifierStats
export function projectEntityForPower(entity) {
  const projected = { ...entity, baseStats: structuredClone(entity.baseStats || entity.stats || {}),
    modifierStats: structuredClone(entity.modifierStats || {}), battleBoosts: {}, stuff: {} };
  initModifierStats(projected);
  projected.modifierStats.durable.stuff = { byId: {} };
  projected.modifierStats.preview = {};
  projected.modifierStats.temp = {};
  const base = structuredClone(projected.baseStats);
  refreshDerivedDurable(projected, base, { stuffByIdOverride: {} });
  const values = filterRestrictedUmbras(projected, applyModifiers(base, projected.modifierStats, { stuffByIdOverride: {} }));
  projected.stats = computeFinalStats(values, null, undefined, null, null, undefined,
    base.extraLife, base.eternalLife, base.fadedLife, base.dayHpRegen || 0);
  applyStatSystemTotals(projected, projected.stats, getStatSystemInputs(projected, { preview: false, combat: false }));
  return projected;
}

export function recomputeEntityStats(entite, options = {}) {
  if (!entite) return entite;
  entite.seuilUmbra = getUmbraThreshold(entite);
  entite.archetypeFrozen = entite.archetypeFrozen === true;
  if (entite.archetypeFrozen && entite.Archetype?.current) entite.Archetype.current.key = 'egare';

  const { persistEquipment = true } = options;
  const equippedItems = options.equippedItems ?? (persistEquipment
    ? loadEquippedItems()
    : loadFromLocalStorage('equippedItems', []));
  const hpBeforeRecompute = options.hpBeforeRecompute ?? (entite.stats?.HP ? { ...entite.stats.HP } : null);
  const resourceStatsBeforeRecompute = entite.stats;
  const recomputeOptions = { ...options, persistEquipment, equippedItems, hpBeforeRecompute };

  initModifierStats(entite);
  normalizeEntityStatSources(entite);
  removeGeneratedStatsFromDurableLeveled(entite);

  ensureEntityLevelObject(entite);
  ensureEntityAttackInstances(entite, attackDetails);
  entite.level.baseMax ??= calculateLvlMaxBaseEntite(entite, { baseMaxLevel: BASE_MAX_LEVEL });

  const baseStatsRaw = entite.baseStats || {};
  syncEntityStuffModifiers(entite, { equippedItems });
  if (!options.skipReverseArchetype) {
    applyReverseArchetypeGeneration(entite, { maxLevel: entite.level.max });
  }
  ensureEntityAttackInstances(entite, attackDetails);

  // ✅ Sources “life pools”
  const baseEternalLifeSrc = baseStatsRaw.eternalLife;
  const baseExtraLifeSrc   = baseStatsRaw.extraLife;
  const baseFadedLifeSrc   = baseStatsRaw.fadedLife;

  // ✅ baseStats.dayHpRegen (ou legacy)
  const baseDayHpRegenSrc = baseStatsRaw.dayHpRegen ?? 0;

  // ✅ On retire ces clés du flux “stats num”
  const baseStats = structuredClone(baseStatsRaw);
  delete baseStats.extraLife;
  delete baseStats.fadedLife;
  delete baseStats.eternalLife;

  /*
   * Passe 1 : stuff brut uniquement.
   * Elle fixe le pourcentage Orfèvre actif avant amplification, en incluant
   * les apports bruts du stuff en weaponMastery, strength et weaponOrfevre.
   */
  refreshDerivedDurable(entite, baseStats);
  const rawBasePlusMods = applyModifiers(baseStats, entite.modifierStats);
  Object.assign(rawBasePlusMods, filterRestrictedUmbras(entite, rawBasePlusMods));
  applyDirectingPointLimits(entite, rawBasePlusMods);
  const weaponOrfevreSourceStats = {
    weaponOrfevre: rawBasePlusMods.weaponOrfevre ?? 0,
    weaponOrfevrePlus: rawBasePlusMods.weaponOrfevrePlus ?? 0,
    weaponMastery: rawBasePlusMods.weaponMastery ?? 0,
    strength: rawBasePlusMods.strength ?? 0,
  };
  const weaponOrfevreStuffPercent =
    calculateWeaponOrfevreActivePercentFromStats(weaponOrfevreSourceStats);
  const effectiveStuff = buildWeaponOrfevreStuffModifiersById(
    entite.modifierStats.durable.stuff.byId,
    weaponOrfevreStuffPercent
  );
  setWeaponOrfevreStuffMeta(entite, effectiveStuff, weaponOrfevreSourceStats);

  /*
   * Passe 2 : même socle, mais avec les contributions positives du stuff
   * amplifiées une seule fois par le pourcentage fixé en passe 1.
   */
  refreshDerivedDurable(entite, baseStats, { stuffByIdOverride: effectiveStuff.byId });

  // ✅ basePlusMods (HP inclut derived.HP via modifierStats.durable.derived)
  const basePlusMods = applyModifiers(
    baseStats,
    entite.modifierStats,
    { stuffByIdOverride: effectiveStuff.byId }
  );
  Object.assign(basePlusMods, filterRestrictedUmbras(entite, basePlusMods));
  applyDirectingPointLimits(entite, basePlusMods);
  
  const capAttackTimeReducStats = (stats) => {
  [
    "attackCooldownReduc",
    "attackPreparationReduc",
    "attackExecutionReduc",
    "attackRecoveryReduc",
  "attackProjectileSpeed"
  ].forEach(key => {
    if (stats[key] === undefined) return;
    stats[key] = Math.min(ATTACK_TIME_REDUC_CAP, Math.max(0, Number(stats[key]) || 0));
  });
};

capAttackTimeReducStats(basePlusMods);
  
  basePlusMods.weight =
  calculateGeneratedWeight({ ...entite, stats: basePlusMods }) +
  Number(basePlusMods.weight || 0);
  
  basePlusMods.marathon =
  Number(basePlusMods.marathon || 0) +
  Number(calculateMovementMarathonChance({ stats: basePlusMods }) || 0);

basePlusMods.trailer =
  Number(basePlusMods.trailer || 0) +
  Number(calculateMovementTrailerChance({ stats: basePlusMods }) || 0);
  
const weaponMasteryValue = Number(basePlusMods.weaponMastery || 0);

if (weaponMasteryValue > 0) {
  basePlusMods.weaponOrfevre =
    Number(basePlusMods.weaponOrfevre || 0) +
    Number(calculateWeaponOrfevreWeaponMastery({ stats: basePlusMods }, weaponMasteryValue) || 0) +
    Number(calculateWeaponOrfevreStrength({ stats: basePlusMods }) || 0);

  basePlusMods.weaponCollector =
    Number(basePlusMods.weaponCollector || 0) +
    Number(calculateWeaponMasteryTrophyChance({ stats: basePlusMods }, weaponMasteryValue) || 0) +
    Number(calculateWeaponMasteryTrophyStrengthBonus({ stats: basePlusMods }) || 0);
}

// const hasteValue = Number(basePlusMods.haste || 0);

// if (hasteValue > 0) {
  // basePlusMods.attackCooldownReduc =
    // Number(basePlusMods.attackCooldownReduc || 0) +
    // Number(calculateHasteCDReduc({ stats: basePlusMods }) || 0);

  // basePlusMods.attackPreparationReduc =
    // Number(basePlusMods.attackPreparationReduc || 0) +
    // Number(calculateHastePrepReduc({ stats: basePlusMods }, hasteValue) || 0);

  // basePlusMods.attackExecutionReduc =
    // Number(basePlusMods.attackExecutionReduc || 0) +
    // Number(calculateHasteExecReduc({ stats: basePlusMods }) || 0);

  // basePlusMods.attackProjectileSpeed =
    // Number(basePlusMods.attackProjectileSpeed || 0) +
    // Number(calculateHasteProjectilSpeed({ stats: basePlusMods }) || 0);

  // basePlusMods.attackRecoveryReduc =
    // Number(basePlusMods.attackRecoveryReduc || 0) +
    // Number(calculateHasteRecupReduc({ stats: basePlusMods }) || 0);
// }

const hpBattleRegenEntity = { ...entite, stats: basePlusMods };
const nativeHpBattleRegen = Math.max(0, Number(basePlusMods.hpBattleRegen) || 0);
const indestructibility = Math.max(0, Number(basePlusMods.indestructibility) || 0);
let generatedHpBattleRegen = 0;

if (indestructibility > 0) generatedHpBattleRegen = Math.max(0, Number(calculateHpBattleRegenStrengthRatio(hpBattleRegenEntity)) || 0) + Math.max(0, Number(calculateHpBattleRegenIndestructibilityRatio(hpBattleRegenEntity)) || 0);

const finalHpBattleRegen = nativeHpBattleRegen + generatedHpBattleRegen;

if (finalHpBattleRegen > 0) basePlusMods.hpBattleRegen = finalHpBattleRegen;
else delete basePlusMods.hpBattleRegen;

  const prevCurrentArmor = entite?.stats?.armor?.current;
  const prevMaxArmor = entite?.stats?.armor?.max;

  const prevEternalLifeObj =
    (entite?.stats?.eternalLife && typeof entite.stats.eternalLife === "object")
      ? entite.stats.eternalLife
      : null;

  const prevExtraLifeObj =
    (entite?.stats?.extraLife && typeof entite.stats.extraLife === "object")
      ? entite.stats.extraLife
      : null;

  const prevFadedLifeNumber =
    (typeof entite?.stats?.fadedLife === "number")
      ? entite.stats.fadedLife
      : (entite?.stats?.HP && typeof entite.stats.HP === "object" ? 0 : undefined);

  const computed = computeFinalStats(
    basePlusMods,
    hpBeforeRecompute,
    prevCurrentArmor,
    prevExtraLifeObj,
    prevEternalLifeObj,
    prevFadedLifeNumber,
    baseExtraLifeSrc,
    baseEternalLifeSrc,
    baseFadedLifeSrc,
    baseDayHpRegenSrc // ✅ NEW
  );

  applyStatSystemTotals(entite, computed, getStatSystemInputs(entite, { preview: false, combat: false }));
  // A blank admin test entity has no implicit daily regeneration; explicit gains still apply.
  if (entite.adminZeroBaseline && !basePlusMods.vitality && !basePlusMods.dayHpRegen && !basePlusMods.dayHpRegenPlus) {
    computed.dayHpRegen = 0;
  }
  // Armor is a live pool: retain active capacity buffs before reconciling its remaining layers.
  const activeArmor = getStatSystemResult({ ...entite,
    modifierStats: { ...entite.modifierStats, preview: {} } }, 'armor');
  if (activeArmor?.present) computed.armor = { ...computed.armor, max: activeArmor.value };
  // Temporary stat effects also affect live resource capacities. Keep spent
  // resources spent; HP alone follows its existing percentage-preserving rule.
  if (Object.values(entite.battleBoosts || {}).some(boosts => boosts.length)) {
    const activeInputs = getStatSystemInputs(entite, { preview: false });
    for (const key of ['HP', 'extraLife', 'shift']) {
      const active = calculateStatSources(activeInputs, key);
      if (!active.present && key !== 'HP' && !entite.battleBoosts?.[key]) continue;
      const max = key === 'HP' ? Math.max(1, active.value) : Math.max(0, active.value);
      computed[key] = { ...computed[key], max, current: Math.min(Number(computed[key]?.current) || 0, max) };
    }
  }
  computed.HP.current = rescaleHPCurrent(hpBeforeRecompute, computed.HP.max);
  entite.stats = computed;
  syncEntityResourceStocks(entite, equippedItems, resourceStatsBeforeRecompute, getGameDaySafe());
  syncEntityArmorLayers(entite, {
    equippedItems,
    previousArmorCurrent: prevCurrentArmor,
    previousArmorMax: prevMaxArmor,
    robustnessArmorMax: activeArmor?.umbra > 0 ? activeArmor.generated + activeArmor.umbraFlat : 0,
  });

  // --- REGEN BLOCKS (EternalLife) ---
  ensureEternalLifeRegen(entite, entite.stats?.eternalLife, {
    prune: true,
    preserveExisting: true,
  });
  updateEternalLifeRegenOrders(entite);
  syncEternalLifeCurrentFromRegen(entite);

  // --- REGEN BLOCKS (ExtraLife) ---
  ensureExtraLifeRegen(entite, entite.stats?.extraLife, {
    baseMaxRegen: EXTRA_LIFE_REGEN_BASE,
    step: EXTRA_LIFE_REGEN_STEP,
    prune: true,
    preserveExisting: true,
  });
  updateExtraLifeRegenOrders(entite);
  syncExtraLifeCurrentFromRegen(entite);

  // --- LEVEL MAX (Will) ---
  const will = basePlusMods.will ?? entite.baseStats?.will ?? entite.will ?? 0;
  const previousLevelCurrent = entite.level.current;
  entite.level.max = calculateLvlMaxEntiteWithWill(entite, will, { baseMaxLevel: BASE_MAX_LEVEL });
  entite.level.current = Math.min(entite.level.current, entite.level.max);

  if (
    hasReverseArchetypeConfig(entite) &&
    entite.level.current !== previousLevelCurrent
  ) {
    if (!options.skipReverseArchetype) {
      applyReverseArchetypeGeneration(entite, { maxLevel: entite.level.max });
    }
    return recomputeEntityStats(entite, recomputeOptions);
  }

  // --- STUFF SLOTS ---
  const finalCharge = entite.stats.charge ?? baseStats.charge ?? 0;
  const protectedIds = options.protectChargeMalus === false ? new Set()
    : getChargeMalusEquipmentIds(entite, effectiveStuff.byId);
  const slotNormalization = normalizeStuffSlots(entite, finalCharge, { preserve: true, persistEquipment, protectedIds });
  if (slotNormalization.changed) {
    return recomputeEntityStats(entite, recomputeOptions);
  }

  syncEffectiveArchetypeCurrent(entite);
  syncEntityEssenceRewards(entite);

  entite.statut ??= ["alive"];
  return entite;
}

// 7) Helpers pour manipuler proprement les sources de modifiers
export function setLevelModifier(entite, deltaObj) {
  initModifierStats(entite);
  entite.modifierStats.durable.level = {
    ...(entite.modifierStats.durable.level || {}),
    ...normalizeStatModifierMap(deltaObj),
  };
  return recomputeEntityStats(entite);
}

export function setArchetypeModifier(entite, deltaObj) {
  initModifierStats(entite);
  entite.modifierStats.durable.archetype = {
    ...(entite.modifierStats.durable.archetype || {}),
    ...normalizeStatModifierMap(deltaObj),
  };
  return recomputeEntityStats(entite);
}

export function upsertStuffModifier(entite, itemId, deltaObj) {
  initModifierStats(entite);
  const equippedId = normalizeEquippedModifierId(itemId);
  if (!equippedId) return entite;

  const delta = normalizeStatModifierMap(stripStuffResourceModifiers(stripStuffArmorModifier(deltaObj)));

  if (Object.keys(delta).length > 0) {
    entite.modifierStats.durable.stuff.byId[equippedId] = {
      ...(entite.modifierStats.durable.stuff.byId[equippedId] || {}),
      ...delta
    };
  } else {
    delete entite.modifierStats.durable.stuff.byId[equippedId];
  }
  return recomputeEntityStats(entite);
}

export function removeStuffModifier(entite, itemId) {
  const equippedId = normalizeEquippedModifierId(itemId);

  if (equippedId && entite?.modifierStats?.durable?.stuff?.byId?.[equippedId]) {
    delete entite.modifierStats.durable.stuff.byId[equippedId];
    return recomputeEntityStats(entite);
  }
  return entite;
}


export function enrichEntityStats(entite) {
  if (!entite) return entite;

  entite.baseStats ??= {};                 // ✅ IMPORTANT
  entite.baseStats.will ??= entite.will ?? 0;

  ensureEntityLevelObject(entite);
  initModifierStats(entite);
  recomputeEntityStats(entite);

  return entite;
}

function modifierParts(value) {
  if (typeof value === 'number') return [{ value, mode: 'flat' }];
  if (!value || typeof value !== 'object') return [];
  const capacityKey = value.max !== undefined ? 'max' : 'current';
  return ['flat', 'percent', capacityKey].filter(key => Number.isFinite(value[key]))
    .map(key => ({ value: Number(value[key]), mode: key === 'percent' ? 'percent' : 'flat' }));
}

function negativeModifierParts(value) {
  return modifierParts(value).filter(part => part.value < 0);
}

export function getStatMalusSources(entity, stat) {
  const key = normalizeStatKey(stat);
  const sources = getStatContributions(entity, key, { includePreview: true, includePlus: true }).filter(source => source.malus);
  if (!sources.length) return sources;
  const unit = key === 'speed' ? ' ms' : getStatSystemResult(entity, key)?.unit || '';
  return sources.map(source => ({ ...source, unit }));
}

function getChargeMalusEquipmentIds(entity, byId) {
  const protectedIds = new Set();
  const generatedCharge = overrides => {
    const primary = applyModifiers(entity.baseStats, entity.modifierStats, { includeDerived: false, stuffByIdOverride: overrides });
    return Number(primary.weaponMastery) > 0
      ? calculateWeaponMasteryCharge(null, primary.weaponMastery) + weaponMasteryChargeStrenghtRatioBonus(null, primary.strength || 0)
      : 0;
  };
  const currentGenerated = generatedCharge(byId);
  for (const [id, delta] of Object.entries(byId)) {
    if (negativeModifierParts(delta.charge).length) { protectedIds.add(id); continue; }
    const withoutMalus = { ...delta };
    let indirect = false;
    for (const key of ['strength', 'weaponMastery']) {
      if (!negativeModifierParts(delta[key]).length) continue;
      indirect = true;
      withoutMalus[key] = typeof delta[key] === 'number' ? 0
        : Object.fromEntries(Object.entries(delta[key]).map(([part, value]) => [part, Math.max(0, Number(value) || 0)]));
    }
    if (indirect && generatedCharge({ ...byId, [id]: withoutMalus }) > currentGenerated) protectedIds.add(id);
  }
  return protectedIds;
}

export function getEquipmentSlotKeys(entity) {
  return Object.keys(entity?.stuff || {}).filter(key => /^slot\d+$/.test(key))
    .sort((a, b) => Number(a.slice(4)) - Number(b.slice(4)));
}

export function normalizeStuffSlots(entity, charge = 0, { preserve = true, persistEquipment = true, protectedIds = new Set() } = {}) {
  const prev = (entity.stuff && typeof entity.stuff === 'object') ? entity.stuff : {};
  const slotCount = Math.max(0, Math.round(Number(charge) || 0));
  const slots = {};
  const allowed = new Set();
  const removedEquippedIds = [];
  if (preserve) {
    for (const slotKey of getEquipmentSlotKeys(entity)) {
      if (prev[slotKey]?.some(id => protectedIds.has(id))) allowed.add(slotKey);
    }
  }
  for (let i = 1; allowed.size < slotCount; i++) allowed.add(`slot${i}`);

  const collectRemovedIds = (rawSlot) => {
    const ids = Array.isArray(rawSlot) ? rawSlot : [];
    ids
      .filter(id => typeof id === "string" && id.startsWith("e"))
      .forEach(id => removedEquippedIds.push(id));
  };

  for (const slotKey of allowed) {

    const ids = preserve && Array.isArray(prev[slotKey])
      ? prev[slotKey].filter(id => typeof id === "string" && id.startsWith("e"))
      : [];

    slots[slotKey] = ids.slice(0, 1);
    ids.slice(1).forEach(id => removedEquippedIds.push(id));
  }

  if (preserve) {
    for (const [slotKey, rawSlot] of Object.entries(prev)
      .sort(([a], [b]) => Number(b.slice(4)) - Number(a.slice(4)))) {
      if (!allowed.has(slotKey)) {
        if (removedEquippedIds.length === 0) collectRemovedIds(rawSlot);
        else if (Array.isArray(rawSlot) && rawSlot.length) slots[slotKey] = rawSlot;
      }
    }
  }

  entity.stuff = slots;

  const uniqueRemovedEquippedIds = [...new Set(removedEquippedIds)];
  for (const equippedId of uniqueRemovedEquippedIds) {
    delete entity.modifierStats?.durable?.stuff?.byId?.[equippedId];
    if (persistEquipment) removeFromEquippedItemsStorage(equippedId);
  }

  return {
    changed: uniqueRemovedEquippedIds.length > 0,
    removedEquippedIds: uniqueRemovedEquippedIds,
  };
}
export function getMovementWeightConfig() {
  return { ...balanceData.movement.weight };
}
export function calculateGeneratedWeight(entity, config = {}) {
  if (entity?.adminZeroBaseline && readSnapshotStatCapacity(entity, 'HP', 1) <= 1
      && ['strength', 'agility', 'intelligence'].every(key => !readSnapshotStatCapacity(entity, key, 0))) return 0;
  const {
    weightMultiplier,
    strengthRelayThreshold,
    strengthRelayRatio,
    intelligenceRatio,
    strengthPassiveRatio,
    minCarryingPower,
  } = {
    ...getMovementWeightConfig(),
    ...config,
  };

  const hpMax = Math.max(1, readSnapshotStatCapacity(entity, "HP", 1));

  const level = Math.max(
    1,
    Number(entity?.level?.current ?? entity?.level ?? 1) || 1
  );

  const strength = Math.max(1, readSnapshotStatCapacity(entity, "strength", 1));

  const agility = Math.max(1, readSnapshotStatCapacity(entity, "agility", 1));

  const intelligence = Math.max(0, readSnapshotStatCapacity(entity, "intelligence", 0));

  const hpPerLevel = hpMax / level;

  const strengthCanRelayAgility = agility <= strength / strengthRelayThreshold;

  const agilityFromStrength = strengthCanRelayAgility
    ? strength * strengthRelayRatio
    : 0;

  const agilityFromIntelligence = intelligence * intelligenceRatio;

  const effectiveAgility =
    Math.max(agility, agilityFromStrength) +
    agilityFromIntelligence +
    strength * strengthPassiveRatio;

  const carryingPower = Math.max(minCarryingPower, effectiveAgility);
  const weightIndex = hpPerLevel / carryingPower;

  return Math.max(0, Math.min(100, Math.round(weightIndex * weightMultiplier)));
}
export function getMovementWeightMalus(entity, config = {}) {
  const cfg = {
    ...getMovementWeightConfig(),
    ...config,
  };

  const weight = Math.max(
    0,
    Math.min(
      100,
      Number(getSafe(entity, "weight", calculateGeneratedWeight(entity))) || 0
    )
  );

  let weightClass = "feather-weight";
  let label = "Poids plume";
  let malus = 0;

  if (weight >= cfg.heavyLimit) {
    weightClass = "super-heavy-weight";
    label = "Poids grotesque";
    malus = cfg.superHeavyMalus;
  } else if (weight >= cfg.middleLimit) {
    weightClass = "heavy-weight";
    label = "Poids lourd";
    malus = cfg.heavyMalus;
  } else if (weight >= cfg.lightLimit) {
    weightClass = "middle-weight";
    label = "Poids moyen";
    malus = cfg.middleMalus;
  } else if (weight >= cfg.featherLimit) {
    weightClass = "light-weight";
    label = "Poids léger";
    malus = 0;
  }

  return {
    weight,
    weightClass,
    label,
    malus,
    hasShiftWeightMalus: malus > 0,
    shiftCostModifier: malus,
  };
}


export function calculateResiliencePercent(resiValue) {
  return globalThis.umbraProgression.resilienceDetails('criticalResistance', resiValue).value;
}

export function calculateCritChancePercent(critValue) {
  return globalThis.umbraProgression.criticalChanceDetails(critValue).value;
}


export function calculateVitalityBonus(vitality) {
  if (vitality <= 0) return 0;
  const cfg = balanceData.generatedStats.vitalityHp;
  if (vitality === 1) return cfg.firstPointBonus;

  const min = cfg.minBonus;
  const max = cfg.maxBonus;
  const k = cfg.growthK;

  const bonus = min + (max - min) * (1 - Math.exp(-k * (vitality - 1)));
  return Math.min(Math.ceil(bonus), max);
}

// ⏱️ Réduction de vitesse par vélocité (ms ENTIERES)
export function calculateVelocityReduction(velocity, baseSpeed) {
  // Vélocité is already the final percentage; all consumers share this timing.
  return globalThis.umbraProgression.velocityTiming(velocity, baseSpeed);
}

function getTranscendencePoints(basePlusMods) {
  const v = Number(basePlusMods?.transcendence ?? 0);
  return Math.max(0, Number.isFinite(v) ? v : 0);
}
export function calculateTranscendenceExtraLife(points, limit) {
  return globalThis.umbraProgression.transcendenceExtraLifeDetails(points, limit).value;
}

export function calculateWeaponMasteryCharge(entite, value) {
  const cfg = balanceData.weaponMastery.charge;
  const sourceValue =
    value ??
    (typeof entite === "number" ? entite : getSafe(entite, "weaponMastery", 0));

  const weaponMastery = Math.max(
    0,
    Math.floor(Number(sourceValue) || 0)
  );

  if (weaponMastery <= 0) return 0;

  return Math.floor(weaponMastery / cfg.masteryDivisor) + cfg.masteryBaseBonus;
}
export function getBloodThirstyPercent(valueOrEntite) {
  return Number(
    typeof valueOrEntite === "number"
      ? valueOrEntite
      : getSafe(valueOrEntite, "bloodThirsty", 0)
  ) || 0;
}
export function calculateDodgePercent(points) {
  return globalThis.umbraProgression.dodgeChancePercent(points);
}

export function calculatePrecisionPercent(points) {
  return globalThis.umbraProgression.precisionPercent(points);
}

export function calculateIndestructibilityPercent(points, limit) {
  return globalThis.umbraProgression.indestructibilityChanceDetails(points, limit).value;
}

export function calculateHastePercent(points) {
  if (points <= 0) return 0;
  const cfg = balanceData.baseUmbraCurves.haste;

  if (points === 1) return cfg.firstPointPercent;

  const percent = cfg.minPercent +
    (cfg.maxPercent - cfg.minPercent) *
    (1 - Math.exp(-points / cfg.growthDivisor));

  return Math.min(Number(percent.toFixed(cfg.decimals)), cfg.maxPercent);
}

export function calculateEsoterismPercent(entity, pointsOverride) {
  if (!entity) return 0;
  const P = globalThis.umbraProgression;
  return P.esoterismChanceDetails(pointsOverride ?? getSafe(entity, 'esoterism', 0), P.getUmbraThreshold(entity)).value;
}
export function calculateAstralityPercent(points) {
  return globalThis.umbraProgression.astralityChanceDetails(points).value;
}

// 📈 Courbe XP par niveau
function calculateLevelCosts(baseValue, maxLevel, increaseRate) {
    let levels = [];
    let cumulative = 0;
    let current = baseValue;

    for (let lvl = 2; lvl <= maxLevel; lvl++) {
        const cost = Math.ceil(current);
        cumulative += cost;
        levels.push({ level: lvl, cost, totalExperience: cumulative });
        current *= 1 + increaseRate / 100;
    }

    return levels;
}

// 🧠 Attribution niveaux/XP
function assignLevelFromExperience(entity) {
  ensureEntityLevelObject(entity);

  let level = 1;
  const exp = entity.experience || 0;

  for (let i = 0; i < levelDetails.length; i++) {
    if (exp >= levelDetails[i].totalExperience) {
      level = levelDetails[i].level;
    } else {
      break;
    }
  }

  setEntityCurrentLevel(entity, level);
  return entity;
}

function assignExperienceFromLevel(entity, generatedLevel = getEntityCurrentLevel(entity)) {
  ensureEntityLevelObject(entity);

  const currentLevel = generatedLevel;
  const levelData = levelDetails.find(l => l.level === currentLevel);

  entity.experience = levelData?.totalExperience || 0;
  return entity;
}

function enrichEntityLevels(entities) {
  entities.forEach(e => {
    ensureEntityLevelObject(e);

    if (e.experience) {
      // XP non nulle → on déduit le niveau
      assignLevelFromExperience(e);
    } else {
      // Pas d’XP (0, null, undefined) → on déduit l’XP du niveau courant
      assignExperienceFromLevel(e);
    }
  });
}


// 📦 Génération des entités A
function EntitiesA() {
    console.groupCollapsed('📦 Chargement des entités A');

    let selected = loadFromLocalStorage('selectedArmyA', []);
    const fromStorage = selected.length > 0;
    let refreshedReverseArchetypes = 0;

    if (!fromStorage) {
        console.log('📁 Aucun selectedArmyA trouvé dans le localStorage. Génération de l\'armée A à partir de armyAConfig.');
        const config = loadFromLocalStorage('armyAConfig', armyAConfig);
        selected = generateArmyA(config, entitesNestUp);

        enrichEntityLevels(selected);

        selected.forEach(ent => {
            enrichEntityStats(ent);
            console.log(`✨ Entité "${ent.name}" enrichie (génération neuve).`);
        });

        saveToLocalStorage('selectedArmyA', selected);
        console.log('💾 selectedArmyA sauvegardé avec les entités enrichies.');
    } else {
        console.log(`📁 ${selected.length} entité(s) chargée(s) depuis le localStorage.`);

        enrichEntityLevels(selected); // mise à jour XP/level

        selected.forEach(ent => {
            const alreadyEnriched = ent?.stats?.HP?.max && ent?.stuff && typeof ent.stuff === 'object';
            const shouldRefreshReverseArchetype = hasReverseArchetypeConfig(ent);
            if (!alreadyEnriched || shouldRefreshReverseArchetype) {
                enrichEntityStats(ent);
                if (shouldRefreshReverseArchetype) refreshedReverseArchetypes += 1;
                console.warn(
                    shouldRefreshReverseArchetype
                        ? `🔁 Entité "${ent.name}" recalculée depuis reverseArchetype.`
                        : `⚠️ Entité "${ent.name}" n'était pas enrichie → enrichie à la volée.`
                );
            } else {
                console.log(`✅ Entité "${ent.name}" déjà enrichie → aucun écrasement effectué.`);
            }
        });
    }

    const migratedAcquisitions = migrateEntityAcquisitions(selected, {
        source: fromStorage ? 'legacy' : 'initial'
    });
    if (migratedAcquisitions > 0 || refreshedReverseArchetypes > 0) {
        saveToLocalStorage('selectedArmyA', selected);

        if (refreshedReverseArchetypes > 0) {
            console.log(`💾 ${refreshedReverseArchetypes} entité(s) reverseArchetype resauvegardée(s).`);
        }

        if (migratedAcquisitions > 0) {
            console.log(
                '🧾 ' + migratedAcquisitions
                + " acquisition(s) d'entité enregistrée(s)."
            );
        }
    }

    console.groupEnd();
    return selected;
}


// 📦 Génération des entités B
function EntitiesB(totalPoints, moyennePower, maxUtilisation, variation, difficulte, lordcount) {
    let currentStageId = window.currentStageId || localStorage.getItem('currentLevel');
    if (!currentStageId) {
        console.error("❌ Aucun ID de stage défini.");
        return [];
    }

    window.currentStageId = currentStageId;

    const armyBData = loadFromLocalStorage('ArmyB', { armies: {} });
    const key = `ArmyB_${currentStageId}`;
    const existingArmyB = armyBData.armies[key];

    // Si déjà sauvegardée, on renvoie direct
    if (existingArmyB?.entities?.length) return existingArmyB.entities;

    // Sinon, on agit selon le mode
    switch (window.levelRunning) {
        case 'randomized': {
            const selected = selectRandomEntitiesForSideB(entitesNestUp, totalPoints, moyennePower, maxUtilisation, variation, difficulte, lordcount);
            assignUniqueIDToEntities(selected);
            armyBData.armies[key] = { ArmyB_id: key, entities: selected };
            saveToLocalStorage('ArmyB', armyBData);
            return selected;
        }

        case 'scripted': {
            const selected = selectScriptedEntitiesForSideB(entitesNestUp);
            assignUniqueIDToEntities(selected);
            armyBData.armies[key] = { ArmyB_id: key, entities: selected };
            saveToLocalStorage('ArmyB', armyBData);
            return selected;
        }

        case 'admin': {
            // ✅ Ouvre l'UI admin (spawn interactif) mais NE sauvegarde PAS ici
            selectAdminEntitiesForSideB(entitesNestUp);
            return []; // l'armée sera persistantée par l'UI admin
        }

        default:
            console.warn(`⚠️ Niveau non reconnu : ${window.levelRunning}`);
            return [];
    }
}

// 🎮 Génération finale
function generateEntities(totalPoints, moyennePower, maxUtilisation, variation, difficulte, lordcount) {
  if (!matchingDifficulty) return;

  const selectedEntitiesA = EntitiesA();
  const selectedEntitiesB = EntitiesB(totalPoints, moyennePower, maxUtilisation, variation, difficulte, lordcount);

  enrichEntityLevels(selectedEntitiesB);

  // ✅ Recompose les stats des B (HP, speed via velocity, etc.)
  selectedEntitiesB.forEach(recomputeEntityStats);

  assignUniqueIDToEntities([...selectedEntitiesA, ...selectedEntitiesB]);

  entites = [...selectedEntitiesA, ...selectedEntitiesB];
  saveCurrentGameData();
}

// 🔐 ID
export function generateUniqueID() {
    const existing = getStoredGameIDs();
    let id;
    do { id = Math.floor(Math.random() * 1_000_000); } while (existing.includes(id));
    existing.push(id);
    saveGameIDs(existing);
    return id;
}

export function assignUniqueIDToEntities(entities) {
  if (!entities) return;

  // If caller passed a single entity object, wrap it.
  if (!Array.isArray(entities)) {
    // If it's array-like (NodeList, arguments, etc.), convert it.
    if (typeof entities.length === "number") {
      entities = Array.from(entities);
    } else {
      entities = [entities];
    }
  }

  entities.forEach(e => {
    if (e && !e.id) e.id = generateUniqueID();
  });
}


function getStoredGameIDs() {
    try {
        return JSON.parse(localStorage.getItem("gameData"))?.gameIDs || [];
    } catch {
        return [];
    }
}


function saveGameIDs(gameIDs) {
    const cleaned = [...new Set(gameIDs.map(id => parseInt(id.toString().replace('Game_', ''), 10)).filter(Boolean))];
    const data = {
        ...(JSON.parse(localStorage.getItem("gameData")) || {}),
        gameIDs: cleaned,
        lastUpdated: new Date().toISOString()
    };
    localStorage.setItem("gameData", JSON.stringify(data));
}

// 🔄 Listener sur la difficulté
document.addEventListener('difficultyUpdated', (event) => {
    const diff = event.detail;
    matchingDifficulty = diff;

    generateEntities(
        +diff.totalpoints,
        +diff.moyennepower,
        +diff.maxutilisation,
        +diff.variation,
        +diff.difficulte,
        +diff.lord
    );
});

export function RemoveEntite(entite, mode = null) {
    if (!entite || !entite.id) {
        console.warn('RemoveEntite : entité invalide ou sans ID.');
        return;
    }

    const entiteIndex = entites.findIndex(e => e.id === entite.id);
    releaseEntityFootprint(entite);
    if (entiteIndex !== -1) {
        endEntityBattleRole(entite, { pause: true });
        const removedEntity = entites.splice(entiteIndex, 1)[0];
        removedEntities.push(removedEntity);
        console.log(`🗑️ RemoveEntite : ${removedEntity.name || removedEntity.id} supprimée du tableau.`);
    } else {
        console.warn(`RemoveEntite : ${entite.id} non trouvée dans le tableau.`);
    }

    const sprite = document.getElementById(`Animationsprite_${entite.id}`);
    const box = document.getElementById(`Box_Entite_${entite.id}`);
    const effects = document.getElementById(`effectsContainer_${entite.id}`);

    if (sprite && mode === 'runaway') {
        entite.isInvincible = true;
        sprite.style.transition = 'opacity 2s ease, transform 2s ease';
        sprite.style.opacity = '0';
        sprite.style.transform = 'translateX(100px)';
        if (effects) {
            effects.style.transition = 'opacity 2s ease, transform 2s ease';
            effects.style.opacity = '0';
            effects.style.transform = 'translateX(-100px)';
        }
    }

    if (box) {
        if (mode === 'runaway') {
            removeCombatVisualAfter(box, 2000);
            setTimeout(() => {
                box.remove();
                entite.isInvincible = false;
                console.log(`✴️ RemoveEntite (runaway) : Box_Entite_${entite.id} retirée du DOM.`);
            }, 2000);
        } else {
            box.remove();
            console.log(`✅ RemoveEntite : Box_Entite_${entite.id} retirée du DOM.`);
        }
    } else {
        console.warn(`⚠️ RemoveEntite : Box_Entite_${entite.id} introuvable.`);
    }
}

export function injectSavedEntities() {
    const saved = loadFromLocalStorage('selectedArmyA', []);
    console.groupCollapsed("inject 🔁 Injection des entités sauvegardées dans `entites`");

    if (!saved || !saved.length) {
        console.warn("inject ⚠️ Aucun élément trouvé dans selectedArmyA.");
        console.groupEnd();
        return;
    }

    saved.forEach(savedEnt => {
        const idx = entites.findIndex(e => e.id === savedEnt.id);

        // Injection ou ajout
        if (idx !== -1) {
            console.log(`inject 🔄 Remplacement de l'entité "${savedEnt.name}" (ID ${savedEnt.id})`);
            entites[idx] = savedEnt;
        } else {
            console.log(`inject ➕ Nouvelle entité ajoutée : "${savedEnt.name}" (ID ${savedEnt.id})`);
            entites.push(savedEnt);
        }

        // Vérification stuff
        const stuff = savedEnt.stuff || {};
        const hasStuff =
            Object.values(stuff).some(slot => Array.isArray(slot) && slot.length > 0);

        // Résumé état
               console.log(` inject  → Surnom : ${savedEnt.nickname || 'Aucun'}`);

        // Normalisation du niveau pour l'affichage (current/max)
        ensureEntityLevelObject(savedEnt);
        const displayLevel = savedEnt.level?.current ?? savedEnt.level ?? 1;
        console.log(` inject  → Niveau : ${displayLevel}`);

        console.log(` inject  → Stuff :`, hasStuff ? stuff : 'Aucun équipement assigné');

        // 🔁 Activation du watcher
        if (savedEnt.stuff) {
            watchStuff(savedEnt);
        }
    });

    console.groupEnd();
}

function watchStuff(entite) {
  Object.keys(entite.stuff).forEach(slot => {
    const descriptor = Object.getOwnPropertyDescriptor(entite.stuff, slot);
    if (descriptor && descriptor.get) return; // déjà défini

    let original = entite.stuff[slot];
    Object.defineProperty(entite.stuff, slot, {
      configurable: true,
      enumerable: true,
      set(value) {
        console.trace(`watch stuff ⚠️ Slot ${slot} écrasé avec :`, value);
        original = value;
      },
      get() {
        return original;
      }
    });
  });
}

