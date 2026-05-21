import { loadFromLocalStorage, saveToLocalStorage, armyAConfig, saveCurrentGameData } from './GameStorage.js';
import { entitesNest } from './entitesNest.js';
import { selectRandomEntitiesForSideB, selectScriptedEntitiesForSideB, selectAdminEntitiesForSideB } from './ArmyBFactory.js';
import { generateArmyA } from './ArmyAFactory.js';
import { ensureEntityLevelObject } from './UpgradeEntity.js';
import { toNumber, calculateLvlMaxBaseEntite, calculateLvlMaxEntiteWithWill, calculateVitalityRegenPercent, calculateVitalityRegenAmount, calculateTotalRegenAmount } from './damagesCalcul.js';
import { saveEntityextraLifeToStorage } from './entityUpdatesStorage.js';
import { isRegenKey, toNonNegInt } from './ui.js';
// 📦 Données
export let entites = [];          // ✅ export live-binding (tu peux le réassigner)
export const removedEntities = []; // ✅ idem
let matchingDifficulty = null;

// 📈 Paramètres XP/Niveau
const baseValue = 50;
const increaseRate = 10;

// Max de table (jeu) : couvre toutes les entités (base 100 + bonus Will max 99)
export const BASE_MAX_LEVEL = 100;
export const WILL_MAX_BONUS = 150;
export const maxLevel = BASE_MAX_LEVEL + WILL_MAX_BONUS;

export const levelDetails = calculateLevelCosts(baseValue, maxLevel, increaseRate);


const EXTRA_LIFE_REGEN_BASE = 3;
const EXTRA_LIFE_REGEN_STEP = 3;

function getGameDaySafe() {
  const raw = localStorage.getItem("gameDay");
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

function pad3(i) {
  return String(i).padStart(3, "0");
}

// Exemple : lecture stricte depuis entite.baseStats (aucun bonus, aucun preview)
export function BaseDayHpRegen(entite) {
  const baseStats = entite?.baseStats ?? {};
  const durable   = entite?.modifierStats?.durable?.statLeveled ?? {};

  const base = toNumber(baseStats.dayHpRegen ?? baseStats.dayhpreneg ?? 0, 0);
  const dur  = toNumber(durable.dayHpRegen ?? 0, 0);

  return Math.max(0, base + dur);
}

function ensureExtraLifeRegen(entite, extraLifeObj, config = {}) {
  const {
    baseMaxRegen = EXTRA_LIFE_REGEN_BASE,
    step = EXTRA_LIFE_REGEN_STEP,
    prune = true,
    preserveExisting = true,
  } = config;

  const day = getGameDaySafe();

  const max = toNonNegInt(extraLifeObj?.max ?? 0);
  const cur = Math.min(toNonNegInt(extraLifeObj?.current ?? max), max);

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
  entite.extraLifeRegen.lastUpdate = day;
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
      if (/^\d{3}$/.test(k)) {
        const idx = Number.parseInt(k, 10);
        if (idx > max) delete entite.extraLifeRegen[k];
      }
    }
  }
}
function ensureEternalLifeRegen(entite, eternalLifeObj, config = {}) {
  const { prune = true, preserveExisting = true } = config;

  const day = getGameDaySafe();

  // ✅ Unicité : max = 0 ou 1
  const max = (toNonNegInt(eternalLifeObj?.max ?? 0) > 0) ? 1 : 0;
  const cur = max > 0 && toNonNegInt(eternalLifeObj?.current ?? 1) > 0 ? 1 : 0;

  if (max <= 0) {
    if (prune) delete entite.eternalLifeRegen;
    return;
  }

  const isNewBlock = !entite.eternalLifeRegen || typeof entite.eternalLifeRegen !== "object";

  if (isNewBlock) {
    entite.eternalLifeRegen = { firstUpdate: day, lastUpdate: day };
  } else {
    entite.eternalLifeRegen.firstUpdate ??= day;
    entite.eternalLifeRegen.lastUpdate = day;
  }

  const key = "001";
  const wantedMaxRegen = 1;

  const prev = entite.eternalLifeRegen[key];

  if (preserveExisting && prev && typeof prev === "object") {
    const next = {
      ...prev,
      currentRegen: toNonNegInt(prev.currentRegen),
      maxRegen: wantedMaxRegen,
    };
    if (next.currentRegen > next.maxRegen) next.currentRegen = next.maxRegen;
    entite.eternalLifeRegen[key] = next;
  } else {
    const prevObj = (prev && typeof prev === "object") ? prev : {};
    entite.eternalLifeRegen[key] = {
      ...prevObj,
      currentRegen: cur ? 1 : 0, // full si possédée
      maxRegen: 1,
    };
  }

  // ✅ Prune : supprimer toutes les autres clés numériques
  if (prune) {
    for (const k of Object.keys(entite.eternalLifeRegen)) {
      if (isRegenKey(k) && k !== "001") delete entite.eternalLifeRegen[k];
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
  const extra = entite?.stats?.extraLife;
  const regen = entite?.extraLifeRegen;

  if (!extra || typeof extra !== "object") return false;
  if (!regen || typeof regen !== "object") return false;

  const max = toNonNegInt(extra.max);
  if (max <= 0) return false;

  let full = 0;

  for (const k of Object.keys(regen)) {
    if (!isRegenKey(k)) continue;

    const slot = regen[k];
    if (!slot || typeof slot !== "object") continue;

    const maxRegen = toNonNegInt(slot.maxRegen);
    if (maxRegen <= 0) continue;

    let curRegen = toNonNegInt(slot.currentRegen);

    // Clamp sécurité
    if (curRegen > maxRegen) {
      curRegen = maxRegen;
      slot.currentRegen = curRegen;
    }

    if (curRegen >= maxRegen) full++;
  }

  // Clamp à extra.max
  const synced = Math.min(full, max);

  const prev = toNonNegInt(extra.current);
  if (prev !== synced) {
    extra.current = synced;
    return true;
  }

  return false;
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
  const eternal = entite?.stats?.eternalLife;
  const regen = entite?.eternalLifeRegen;

  if (!eternal || typeof eternal !== "object") return false;
  if (!regen || typeof regen !== "object") return false;

  const max = toNonNegInt(eternal.max);
  if (max <= 0) return false;

  let full = 0;

  for (const k of Object.keys(regen)) {
    if (!isRegenKey(k)) continue;

    const slot = regen[k];
    if (!slot || typeof slot !== "object") continue;

    // ✅ EternalLife : maxRegen toujours 1
    if (slot.maxRegen !== 1) {
      slot.maxRegen = 1;
      // pas de "changed" ici car la fonction retourne seulement si eternal.current change,
      // mais tu peux le gérer si tu veux.
    }

    const maxRegen = 1;

    let curRegen = toNonNegInt(slot.currentRegen);

    // Clamp sécurité
    if (curRegen > maxRegen) {
      curRegen = maxRegen;
      slot.currentRegen = curRegen;
    }

    if (curRegen >= maxRegen) full++;
  }

  // Clamp à eternal.max
  const synced = Math.min(full, max);

  const prev = toNonNegInt(eternal.current);
  if (prev !== synced) {
    eternal.current = synced;
    return true;
  }

  return false;
}

export function calculateLvlMaxBonus(willValue, config = {}) {
  const base = config.baseMaxLevel ?? BASE_MAX_LEVEL; // base réelle de l'entité
  const wMax = config.willMaxBonus ?? WILL_MAX_BONUS; // 150

  const w = Math.max(1, Math.min(Math.floor(Number(willValue) || 0), wMax));

  // lvlMin à Will=1 (65 si base=100)
  const lvlMin = Math.round(base * 0.65);

  let lvlMaxFromWill;

  if (w <= 80) {
    // 1 -> lvlMin ; 80 -> base
    const t = (w - 1) / 79;
    lvlMaxFromWill = lvlMin + (base - lvlMin) * t;
  } else {
    // 80 -> base ; 150 -> WILL_MAX_BONUS (150)
    // easing quadratique : montée encore significative jusqu'au bout (soft cap large)
    const t = (w - 80) / 70;         // 0..1
    const eased = 1 - (1 - t) * (1 - t); // easeOutQuad
    lvlMaxFromWill = base + (WILL_MAX_BONUS - base) * eased;
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


// 🔄 Préparation des entités
export const entitesNestUp = entitesNest.map(ent => enrichEntityStats({ ...ent }));
window.entitesNestUp = entitesNestUp;

function initModifierStats(entite) {
  if (!entite.modifierStats) {
    entite.modifierStats = {
      durable: {
        stuff: { byId: {} },
        level: {},
        archetype: {},
        statLeveled: {},
        derived: {} // ✅ NEW
      }
    };
  } else {
    entite.modifierStats.durable ??= {};
    entite.modifierStats.durable.stuff ??= { byId: {} };
    entite.modifierStats.durable.stuff.byId ??= {};
    entite.modifierStats.durable.level ??= {};
    entite.modifierStats.durable.statLeveled ??= {};
    entite.modifierStats.durable.archetype ??= {};
    entite.modifierStats.durable.derived ??= {}; // ✅ NEW
  }
}

// 2) Accumulation générique de valeurs (supporte number ou {flat, percent})
function accumulateModifier(target, mod) {
  if (!mod) return;
  for (const k of Object.keys(mod)) {
    const v = mod[k];
    if (typeof v === 'number') {
      target.flat[k] = (target.flat[k] ?? 0) + v;
    } else if (v && typeof v === 'object') {
      if (typeof v.flat === 'number') {
        target.flat[k] = (target.flat[k] ?? 0) + v.flat;
      }
      if (typeof v.percent === 'number') {
        target.percent[k] = (target.percent[k] ?? 0) + v.percent;
      }
    }
  }
}

function aggregateDurableModifiers(modifierStats, { includeDerived = true } = {}) {
  const acc = { flat: {}, percent: {} };
  if (!modifierStats) return acc;

  if (modifierStats.durable?.level) accumulateModifier(acc, modifierStats.durable.level);
  if (modifierStats.durable?.archetype) accumulateModifier(acc, modifierStats.durable.archetype);

  const byId = modifierStats.durable?.stuff?.byId || {};
  for (const itemId of Object.keys(byId)) accumulateModifier(acc, byId[itemId]);

  if (modifierStats.durable?.statLeveled) accumulateModifier(acc, modifierStats.durable.statLeveled);

  if (includeDerived && modifierStats.durable?.derived) {
    accumulateModifier(acc, modifierStats.durable.derived);
  }

  return acc;
}

function applyModifiers(baseStats = {}, modifierStats, { includeDerived = true } = {}) {
  const base = structuredClone(baseStats);
  const { flat, percent } = aggregateDurableModifiers(modifierStats, { includeDerived });

  for (const k of Object.keys(flat)) {
    const baseVal = typeof base[k] === 'number' ? base[k] : 0;
    base[k] = baseVal + flat[k];
  }

  for (const k of Object.keys(percent)) {
    const baseVal = typeof base[k] === 'number' ? base[k] : 0;
    base[k] = Math.round(baseVal * (1 + percent[k] / 100));
  }

  return base;
}
function refreshDerivedDurable(entite, baseStats) {
  initModifierStats(entite);

  const primary = applyModifiers(baseStats, entite.modifierStats, { includeDerived: false });

  const vit = primary.vitality ?? 0;
  const rob = primary.robustness ?? 0;

  const hpBonus = calculateVitalityBonus(vit);
  if (hpBonus > 0) entite.modifierStats.durable.derived.HP = hpBonus;
  else delete entite.modifierStats.durable.derived.HP;

  const armorBonus = calculateRobustnessBonus(rob);
  if (armorBonus > 0) entite.modifierStats.durable.derived.armor = armorBonus;
  else delete entite.modifierStats.durable.derived.armor;

  // ✅ NEW : transcendence → extraLife (flat)
  const transPts = getTranscendencePoints(primary);
  const extraLifeBonus = calculateTranscendenceExtraLife(transPts);

  if (extraLifeBonus > 0) entite.modifierStats.durable.derived.extraLife = extraLifeBonus;
  else delete entite.modifierStats.durable.derived.extraLife;
}

function normalizeEternalLifeSource(src) {
  // ✅ Une seule eternalLife possible : 0 ou 1
  if (typeof src === "number") {
    return toNonNegInt(src) > 0 ? { current: 1, max: 1 } : null;
  }

  if (src && typeof src === "object") {
    const maxRaw = toNonNegInt(src.max ?? src.current ?? 0);
    if (maxRaw <= 0) return null;

    const curRaw = toNonNegInt(src.current ?? 1);
    return { current: curRaw > 0 ? 1 : 0, max: 1 };
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
function computeFinalStats(
  basePlusMods,
  oldHPCurrent,
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

  const newHpCurrent = (typeof oldHPCurrent === "number")
    ? Math.min(oldHPCurrent, newHpMax)
    : newHpMax;

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

  const modExtra = toNonNegInt(basePlusMods.extraLife ?? 0);
  const extraMax = baseExtraMax + modExtra;

  const prevExtraCur =
    (prevExtraLifeObj && typeof prevExtraLifeObj === "object")
      ? toNonNegInt(prevExtraLifeObj.current)
      : null;

  let extraCur;
  if (prevExtraCur !== null) extraCur = Math.min(prevExtraCur, extraMax);
  else if (explicitExtraCurrent !== null) extraCur = Math.min(explicitExtraCurrent, extraMax);
  else extraCur = Math.min(baseExtraCur + modExtra, extraMax);

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

  if (prevFadedCur !== null) fadedCur = Math.min(prevFadedCur, fadedCur);

  if (fadedCur > 0) out.fadedLife = fadedCur;
  else delete out.fadedLife;

  // --- ETERNAL LIFE (max=1 si présent) ---
  const baseEternal = normalizeEternalLifeSource(baseEternalLifeSrc);
  const modEternalRaw = toNonNegInt(basePlusMods.eternalLife ?? 0);
  const hasEternal = !!baseEternal || modEternalRaw > 0;

  const eternalMax = hasEternal ? 1 : 0;

  const prevEternalCur =
    (prevEternalLifeObj && typeof prevEternalLifeObj === "object")
      ? (toNonNegInt(prevEternalLifeObj.current) > 0 ? 1 : 0)
      : null;

  let eternalCur = hasEternal ? 1 : 0;

  if (prevEternalCur !== null) eternalCur = Math.min(prevEternalCur, eternalMax);
  eternalCur = eternalCur > 0 ? 1 : 0;

  if (eternalMax > 0) out.eternalLife = { current: eternalCur, max: 1 };
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
export function recomputeEntityStats(entite) {
  if (!entite) return entite;

  ensureEntityLevelObject(entite);
  entite.level.baseMax ??= calculateLvlMaxBaseEntite(entite, { baseMaxLevel: BASE_MAX_LEVEL });

  const baseStatsRaw = entite.baseStats || {};

  // ✅ Sources “life pools”
  const baseEternalLifeSrc = baseStatsRaw.eternalLife;
  const baseExtraLifeSrc   = baseStatsRaw.extraLife;
  const baseFadedLifeSrc   = baseStatsRaw.fadedLife;

  // ✅ baseStats.dayHpRegen (ou legacy)
  const baseDayHpRegenSrc = baseStatsRaw.dayHpRegen ?? baseStatsRaw.dayhpreneg ?? 0;

  // ✅ On retire ces clés du flux “stats num”
  const baseStats = structuredClone(baseStatsRaw);
  delete baseStats.extraLife;
  delete baseStats.fadedLife;
  delete baseStats.eternalLife;

  // ✅ derived durable (HP issu de Vitalité, armor issu de Robustness, etc.)
  refreshDerivedDurable(entite, baseStats);

  // ✅ basePlusMods (HP inclut derived.HP via modifierStats.durable.derived)
  const basePlusMods = applyModifiers(baseStats, entite.modifierStats);

  const prevCurrentHP    = entite?.stats?.HP?.current;
  const prevCurrentArmor = entite?.stats?.armor?.current;

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
      : undefined;

  const computed = computeFinalStats(
    basePlusMods,
    prevCurrentHP,
    prevCurrentArmor,
    prevExtraLifeObj,
    prevEternalLifeObj,
    prevFadedLifeNumber,
    baseExtraLifeSrc,
    baseEternalLifeSrc,
    baseFadedLifeSrc,
    baseDayHpRegenSrc // ✅ NEW
  );

  entite.stats = computed;

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
  entite.level.max = calculateLvlMaxEntiteWithWill(entite, will, { baseMaxLevel: BASE_MAX_LEVEL });
  entite.level.current = Math.min(entite.level.current, entite.level.max);

  // --- STUFF SLOTS ---
  const finalCharge = basePlusMods.charge ?? baseStats.charge ?? 0;
  normalizeStuffSlots(entite, finalCharge, { preserve: true });

  entite.statut ??= ["alive"];
  return entite;
}

// 7) Helpers pour manipuler proprement les sources de modifiers
export function setLevelModifier(entite, deltaObj) {
  initModifierStats(entite);
  entite.modifierStats.durable.level = { ...(entite.modifierStats.durable.level || {}), ...deltaObj };
  return recomputeEntityStats(entite);
}

export function setArchetypeModifier(entite, deltaObj) {
  initModifierStats(entite);
  entite.modifierStats.durable.archetype = { ...(entite.modifierStats.durable.archetype || {}), ...deltaObj };
  return recomputeEntityStats(entite);
}

export function upsertStuffModifier(entite, itemId, deltaObj) {
  initModifierStats(entite);
  entite.modifierStats.durable.stuff.byId[itemId] = { ...(entite.modifierStats.durable.stuff.byId[itemId] || {}), ...deltaObj };
  return recomputeEntityStats(entite);
}

export function removeStuffModifier(entite, itemId) {
  if (entite?.modifierStats?.durable?.stuff?.byId?.[itemId]) {
    delete entite.modifierStats.durable.stuff.byId[itemId];
    return recomputeEntityStats(entite);
  }
  return entite;
}


export function enrichEntityStats(entite) {
  if (!entite) return entite;

  entite.baseStats ??= {};                 // ✅ IMPORTANT
  entite.baseStats.will ??= entite.will ?? 0;

  ensureEntityLevelObject(entite);
  const currentLevel = entite.level.current || 1;

  initModifierStats(entite);

  if (currentLevel > 1) {
    const lv = currentLevel - 1;
    const levelDelta = {};
    if (Object.keys(levelDelta).length) setLevelModifier(entite, levelDelta);
    else recomputeEntityStats(entite);     // ✅ évite un setLevelModifier inutile
  } else {
    recomputeEntityStats(entite);
  }

  return entite;
}

// 🧰 Charge stuff — PRÉSERVE le contenu existant par défaut
export function normalizeStuffSlots(entity, charge = 0, { preserve = true } = {}) {
  const prev = (entity.stuff && typeof entity.stuff === 'object') ? entity.stuff : {};
  const slots = preserve ? { ...prev } : {};

  for (let i = 1; i <= (charge || 0); i++) {
    const slotKey = `slot${i}`;
    if (!(slotKey in slots)) {
      slots[slotKey] = Array.isArray(prev[slotKey]) ? prev[slotKey] : [];
    }
  }
  entity.stuff = slots;
}
export function calculateResistances(target, totalDamageSources, attacker = null) {
    const RESISTANCE_CONSTANT = 70;

    // 🧱 Récupération des résistances de base
    let physicalResistance = target.stats.physicalResistance || 0;
    let magicalResistance = target.stats.magicalResistance || 0;

    // ⚔️ Application de la pénétration globale (si attaquant fourni)
    let armorPenPercent = 0;
    let magicPenPercent = 0;

    if (attacker) {
        armorPenPercent = calculatePenetrationPercent(attacker.stats?.physicalPen ?? attacker.stats?.physicPen ?? 0);
        magicPenPercent = calculatePenetrationPercent(attacker.stats?.magicalPen ?? attacker.stats?.magicPen ?? 0);

        physicalResistance = Math.max(0, physicalResistance * (1 - armorPenPercent / 100));
        magicalResistance = Math.max(0, magicalResistance * (1 - magicPenPercent / 100));

        console.log(
            `⚙️ [PÉNÉTRATION] ${attacker.name} réduit les résistances de ${target.name} :\n` +
            `→ Physique : -${armorPenPercent}% → ${physicalResistance.toFixed(1)} restants\n` +
            `→ Magique : -${magicPenPercent}% → ${magicalResistance.toFixed(1)} restants`
        );
    }

    // 🧮 Conversion en réduction réelle (formule LoL-like)
    const physicalReduction = physicalResistance / (physicalResistance + RESISTANCE_CONSTANT);
    const magicalReduction = magicalResistance / (magicalResistance + RESISTANCE_CONSTANT);

    // 🧱 Dégâts bruts
    const piercingDamage = totalDamageSources.piercingDamage || 0;
    const physical = totalDamageSources.physical || 0;
    const magical = totalDamageSources.magical || 0;
    const hybridalDamage = totalDamageSources.hybridalDamage || 0;

    // 🔻 Application de la réduction pour chaque type
    const reducedPhysical = physical > 0 ? Math.floor(physical * (1 - physicalReduction)) : 0;
    const reducedMagical = magical > 0 ? Math.floor(magical * (1 - magicalReduction)) : 0;

    // ⚗️ Dégâts hybrides : application séparée des résistances et pénétrations
    let reducedHybrid = 0;
    if (hybridalDamage > 0) {
        const half = hybridalDamage / 2;

        // On recalcul les résistances spécifiques à la portion hybride :
        let hybridPhysicalRes = target.stats.physicalResistance || 0;
        let hybridMagicalRes = target.stats.magicalResistance || 0;

        // Application des pénétrations pour chaque moitié
        if (attacker) {
            hybridPhysicalRes = Math.max(0, hybridPhysicalRes * (1 - armorPenPercent / 100));
            hybridMagicalRes = Math.max(0, hybridMagicalRes * (1 - magicPenPercent / 100));
        }

        // Conversion en réductions réelles
        const hybridPhysicalReduction = hybridPhysicalRes / (hybridPhysicalRes + RESISTANCE_CONSTANT);
        const hybridMagicalReduction = hybridMagicalRes / (hybridMagicalRes + RESISTANCE_CONSTANT);

        // Application des réductions sur chaque moitié
        const reducedPhysicalHalf = Math.floor(half * (1 - hybridPhysicalReduction));
        const reducedMagicalHalf = Math.floor(half * (1 - hybridMagicalReduction));

        reducedHybrid = reducedPhysicalHalf + reducedMagicalHalf;

        console.log(
            `💥 [HYBRIDE] ${target.name} subit des résistances mixtes :\n` +
            `→ Physique moitié : ${reducedPhysicalHalf}/${half}\n` +
            `→ Magique moitié : ${reducedMagicalHalf}/${half}`
        );
    }

    // 🧾 Retour des valeurs réduites
    return {
        reducedpiercingDamage: piercingDamage,
        reducedPhysicalDamage: reducedPhysical,
        reducedMagicalDamage: reducedMagical,
        reducedHybridalDamage: reducedHybrid
    };
}

export function calculatePhysicalPenPercent(entite) {
  return calculatePenetrationPercent(entite, "physicalPen");
}

export function calculateMagicalPenPercent(entite) {
  return calculatePenetrationPercent(entite, "magicalPen");
}


export function calculatePenetrationPercent(entite, statKey) {
  const penValue = Number(
    entite?.modifierStats?.preview?.total?.[statKey] ??
    entite?.stats?.[statKey] ??
    entite?.baseStats?.[statKey] ??
    entite?.[statKey] ??
    0
  ) || 0;

  // Exception demandée
  if (penValue === 1) return 1;

  const maxPen = 150;
  const steepness = 0.045;
  const midpoint = 60;

  const ratio = 1 / (1 + Math.exp(-steepness * (penValue - midpoint)));

  const minVal = 1 / (1 + Math.exp(-steepness * (0 - midpoint)));
  const maxVal = 1 / (1 + Math.exp(-steepness * (maxPen - midpoint)));
  const normalized = (ratio - minVal) / (maxVal - minVal);

  return Math.round(normalized * 100);
}

export function calculateResiliencePercent(resiValue) {
  const v = Math.max(0, resiValue);

  // Early: 1% par point jusqu'à 10
  if (v <= 10) return Math.round(v);

  const maxResi = 150;
  if (v >= maxResi) return 100;

  // Normalisation 10..150 -> 0..1
  const t = (v - 10) / (maxResi - 10);
  const inv = 1 - t;

  // k règle la "lenteur" : plus k est grand, plus ça monte tard (plus doux)
  const k = 2;

  // Courbe (0..1), arithmétique ultra simple
  const f = t / (t + k * inv * inv);

  const percent = 10 + 90 * f;
  return Math.round(percent);
}

export function calculateCritChancePercent(critValue) {
  const maxCrit = 150;
  const steepness = 0.045; // pente adoucie pour ralentir après le soft cap
  const midpoint = 65;     // accélération principale avant le soft cap (~90)
  
  // Formule logistique
  const ratio = 1 / (1 + Math.exp(-steepness * (critValue - midpoint)));

  // Normalisation (0 → 0, 150 → 1)
  const minVal = 1 / (1 + Math.exp(-steepness * (0 - midpoint)));
  const maxVal = 1 / (1 + Math.exp(-steepness * (maxCrit - midpoint)));
  const normalized = (ratio - minVal) / (maxVal - minVal);

  // Conversion en pourcentage
  const critChance = normalized * 100;

  // Arrondi au dixième
  return Math.round(critChance * 10) / 10;
}


export function calculateVitalityBonus(vitality) {
  if (vitality <= 0) return 0;
  if (vitality === 1) return 10;

  const min = 10;
  const max = 400;
  const k = 0.02;

  const bonus = min + (max - min) * (1 - Math.exp(-k * (vitality - 1)));
  return Math.min(Math.ceil(bonus), max);
}

// ⏱️ Réduction de vitesse par vélocité (ms ENTIERES)
export function calculateVelocityReduction(velocity, baseSpeed, config = {}) {
  const {
    linearUntil = 30,
    softCapVelocity = 150,
    maxReduction = 0.65,
    k = 0.015,
  } = config;

  const vRaw = Number(velocity);
  const sRaw = Number(baseSpeed);

  const v = Number.isFinite(vRaw) ? Math.max(0, vRaw) : 0;

  // ✅ on force la base speed en ms entière
  const s = Number.isFinite(sRaw) ? Math.max(0, Math.round(sRaw)) : 0;

  if (s <= 0) {
    return { adjustedSpeed: 0, speedReduction: 0, reductionRatio: 0, percentage: 0, seconds: 0 };
  }

  const vClamped = Math.min(v, softCapVelocity);

  let reductionRatio = 0;

  // 1) Linéaire
  if (vClamped <= linearUntil) {
    reductionRatio = vClamped / 100;
  }
  // 2) Courbe
  else {
    const startRatio = linearUntil / 100;           // 0.30
    const remaining = maxReduction - startRatio;    // 0.35
    const span = softCapVelocity - linearUntil;     // 120
    const x = vClamped - linearUntil;

    const denom = 1 - Math.exp(-k * span);
    const t = denom > 0 ? (1 - Math.exp(-k * x)) / denom : 0;

    reductionRatio = startRatio + remaining * t;
  }

  // Clamp sécurité
  reductionRatio = Math.min(maxReduction, Math.max(0, reductionRatio));

  // ✅ calcul float puis ARRONDI ms
  const adjustedFloat = s * (1 - reductionRatio);
  const adjustedSpeed = Math.max(1, Math.round(adjustedFloat));

  // ✅ speedReduction cohérente avec l’arrondi
  const speedReduction = Math.max(0, s - adjustedSpeed);

  return {
    adjustedSpeed,                    // int ms
    speedReduction,                   // int ms
    reductionRatio,                   // float 0..0.65
    percentage: reductionRatio * 100, // float %
    seconds: adjustedSpeed / 1000     // float s
  };
}

function getTranscendencePoints(basePlusMods) {
  const v = Number(basePlusMods?.transcendence ?? 0);
  return Math.max(0, Number.isFinite(v) ? v : 0);
}
export function calculateTranscendenceExtraLife(points) {
  const p = Math.max(0, Number(points) || 0);
  if (p === 0) return 0;
  const CAP = 150;
  const MAX = 7;
  // Exposant choisi pour avoir ~2 à 10, ~3 à 30, ~4 à 50, ~5 à 80, ~6 à 100
  const EXP = 0.4626;
  if (p >= CAP) return MAX;
  const raw = MAX * Math.pow(p / CAP, EXP); // 0.. < 7
  let value = Math.round(raw);
  // Forcer 1 dès que p > 0
  value = Math.max(1, value);
  // Réserver 7 à 150+
  if (value >= MAX) value = MAX - 1;
  return value;
}

export function calculateDodgePercent(points) {
  if (points <= 0) return 0;
  if (points === 1) return 5;

  const min = 5;
  const max = 80 * 0.9; 
  const k = 0.02;

  const percent = min + (max - min) * (1 - Math.exp(-k * (points - 1)));
  return Math.min(Number(percent.toFixed(1)), max);
}

export function calculatePrecisionPercent(points) {
  if (points <= 0) return 0;
  if (points === 1) return 5;

  const min = 5;
  const max = 80;
  const k = 0.025;

  const percent = min + (max - min) * (1 - Math.exp(-k * (points - 1)));
  return Math.min(Number(percent.toFixed(1)), max);
}

export function calculateIndestructibilityPercent(points) {
  if (points <= 0) return 0;
  if (points === 1) return 3;

  // Croissance lente avec plafonnement à 30 %
  const percent = 3 + 27 * (1 - Math.exp(-points / 50)); // asymptotique lente
  return Math.min(Number(percent.toFixed(2)), 30);
}

export function calculateHastePercent(points) {
  if (points <= 0) return 0;

  // Démarrage un peu perceptible dès 1 point
  if (points === 1) return 1.5;

  // Croissance lente avec plafonnement à 35 % (0 à 150 pts)
  // - points/70 : montée progressive, sans atteindre trop vite le cap
  const percent = 1.5 + 33.5 * (1 - Math.exp(-points / 70));

  return Math.min(Number(percent.toFixed(2)), 35);
}

export function calculateAmbidextryPercent(points) {
  if (points <= 0) return 0;
  if (points === 1) return 5;

  const min = 5;
  const max = 50;
  const k = 0.02;

  const percent = min + (max - min) * (1 - Math.exp(-k * (points - 1)));
  return Math.min(Number(percent.toFixed(1)), max);
}
export function calculateEsoterismPercent(entite, pointsOverride) {
  if (!entite) return 0;

  const points =
    Number(pointsOverride ?? getSafe(entite, "esoterism") ?? getSafe(entite, "stats.esoterism")) || 0;

  if (points <= 0) return 0;
  if (points === 1) return 2;

  const min = 2;
  const max = 73;
  const basePercent = min + (max - min) * Math.sqrt((points - 1) / 100);

  // arrondi entier au plus proche (0-4 => inférieur, 5-9 => supérieur), puis cap
  return Math.min(Math.round(basePercent), max);
}

export function calculateRobustnessBonus(robustness) {
  if (robustness <= 0) return 0;
  if (robustness === 1) return 10;

  const min = 10;
  const max = 250;
  const k = 0.02;

  const bonus = min + (max - min) * (1 - Math.exp(-k * (robustness - 1)));
  return Math.min(Math.ceil(bonus), max);
}

export function calculateAstralityPercent(points) {
  if (points <= 0) return 0;
  if (points === 1) return 2;

  const min = 2;
  const max = 40; // plafond à 40
  const base = min + (max - min) * Math.sqrt((points - 1) / 100);

  return Math.min(Math.round(base * 10) / 10, max);
}


export function calculateBloodFuryPercent(entite) {
  const points = Number(entite?.bloodFury ?? entite?.stats?.bloodFury ?? 0) || 0;

  if (points <= 0) return 0;
  if (points === 1) return 4;

  const min = 4;
  const max = 30;
  const base = min + (max - min) * Math.sqrt((points - 1) / 150);

  return Math.min(Math.ceil(base), max);
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

function assignExperienceFromLevel(entity) {
  ensureEntityLevelObject(entity);

  const currentLevel = getEntityCurrentLevel(entity);
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
            if (!alreadyEnriched) {
                enrichEntityStats(ent);
                console.warn(`⚠️ Entité "${ent.name}" n'était pas enrichie → enrichie à la volée.`);
            } else {
                console.log(`✅ Entité "${ent.name}" déjà enrichie → aucun écrasement effectué.`);
            }
        });
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
    if (entiteIndex !== -1) {
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

