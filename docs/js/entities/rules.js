import { STAT_INDEX } from '../data/statsData.js';
export { STAT_INDEX } from '../data/statsData.js';
import { DEFAULT_CYCLE, ARCHETYPE_ATTRIBUTS, ATTRIBUT_TO_STAT_KEY, STAT_KEY_TO_ATTRIBUT, CLASS_INDEX, BASE_EGARE_CYCLE } from '../data/cycleData.js';
export { DEFAULT_CYCLE, ARCHETYPE_ATTRIBUTS, ATTRIBUT_TO_STAT_KEY, STAT_KEY_TO_ATTRIBUT, CLASS_INDEX } from '../data/cycleData.js';
import { VALID_COMBAT_FUNCTIONS } from '../data/attackList.js';
import { registerCombatState } from "../combat/clock.js";
import { setTimeout, clearTimeout, clockNow } from "../combat/clock.js";
import { buildCombatProfileHelper } from '../data/helpers.js';
import { getStatSystemResult, getDirectingStatResult, getEntityVelocityTiming } from './statSystem.js';
import { syncEntityEssenceRewards } from "../items/essenceInventory.js";
import { balanceData } from "../data/balanceData.js";
import { cyclesData } from "../data/cycleData.js";
import { stats as STATS_DATA, STAT_KEY_ALIASES, STAT_KEY_DISPLAY, BOOSTABLE_POOL_STAT_KEYS } from "../data/statsData.js";
import { isUmbraRestricted } from '../procedural/proc-bareme.js';
import { calculateRobustnessBonus, syncEntityRobustnessArmorCapacity } from '../items/armor.js';

// Entity identity and targeting roles.
export const ENTITY_TYPE = Object.freeze({
    MINION: 'sbire',
    LORD: 'lord',
});

const VALID_ENTITY_TYPES = new Set(Object.values(ENTITY_TYPE));


export function assertEntityType(entity) {
    const type = entity?.type;
    if (!VALID_ENTITY_TYPES.has(type)) {
        throw new TypeError(`Type d'entité invalide : ${String(type)}.`);
    }
    return type;
}

export function isLord(entity) {
    return entity?.type === ENTITY_TYPE.LORD;
}

export function isNonLordCombatant(entity) {
    return entity?.type === ENTITY_TYPE.MINION;
}

export function getBattleEntityDomPrefix(entity) {
    return assertEntityType(entity);
}

export function getBattleEntityDomId(entity) {
    if (entity?.id == null || entity.id === '') {
        throw new TypeError("Une entité de combat doit posséder un id.");
    }
    return `${getBattleEntityDomPrefix(entity)}_${entity.id}`;
}

export function getBattleEntityElement(entity) {
    if (typeof document === 'undefined') return null;
    return document.getElementById(getBattleEntityDomId(entity));
}

export function assertEntityTargetingIdentity(entity, attacks) {
    assertEntityType(entity);
    if (!Array.isArray(attacks) || attacks.length === 0) {
        throw new TypeError(`${entity.name || entity.id} doit posséder au moins une attaque valide.`);
    }

    attacks.forEach(assertAttackCombatDefinition);

    return true;
}

export function assertAttackCombatDefinition(attack) {
    const name = attack?.functionName || attack?.attackKey || 'sans nom';
    if (!VALID_COMBAT_FUNCTIONS.has(attack?.combatFunction)) {
        throw new TypeError(`L'attaque ${name} doit déclarer combatFunction (Attaquant ou Support).`);
    }
    for (const [key, allowed] of [
        ['attackTarget', ['ally', 'enemy', 'hexa']],
        ['attackRange', ['melee', 'range']],
    ]) {
        if (!Array.isArray(attack[key]) || !attack[key].length || attack[key].some(value => !allowed.includes(value))) {
            throw new TypeError(`L'attaque ${name} possède un ${key} invalide.`);
        }
    }
    return true;
}

// Stat names and modifier maps.
function cloneStatModifierValue(value) {
  if (value && typeof value === "object") {
    return structuredClone(value);
  }

  return value;
}

function isObjectStatDelta(value) {
  return value && typeof value === "object" && ("current" in value || "max" in value);
}

function toObjectStatDelta(value) {
  if (isObjectStatDelta(value)) {
    const current = Number(value.current ?? value.max ?? 0) || 0;
    const max = Number(value.max ?? value.current ?? 0) || 0;
    return { current, max };
  }

  const n = Number(value) || 0;
  return { current: n, max: n };
}

function toFlatPercentDelta(value) {
  if (typeof value === "number") {
    return { flat: Number(value) || 0, percent: 0 };
  }

  return {
    flat: Number(value?.flat ?? 0) || 0,
    percent: Number(value?.percent ?? 0) || 0,
  };
}

export function normalizeStatKey(key) {
  const raw = String(key || "").trim();
  if (!raw) return raw;
  if (raw.endsWith('+')) return `${normalizeStatKey(raw.slice(0, -1))}Plus`;
  if (raw.endsWith('Plus')) return `${normalizeStatKey(raw.slice(0, -4))}Plus`;
  return STAT_KEY_ALIASES[raw] || raw;
}

export function getDisplayStatKey(key) {
  const canonical = normalizeStatKey(key);
  if (canonical.endsWith('Plus')) return getDisplayStatKey(canonical.slice(0, -4));
  return STAT_KEY_DISPLAY[canonical] || canonical;
}

export function normalizeStatPath(path) {
  const raw = String(path || "").trim();
  if (!raw) return raw;

  const normalizeRoot = (statPath) => {
    const parts = String(statPath || "").split(".");
    parts[0] = normalizeStatKey(parts[0]);
    return parts.join(".");
  };

  if (raw.startsWith("stats.")) {
    return `stats.${normalizeRoot(raw.slice("stats.".length))}`;
  }

  if (raw.startsWith("baseStats.")) {
    return `baseStats.${normalizeRoot(raw.slice("baseStats.".length))}`;
  }

  return normalizeRoot(raw);
}

export function addStatModifierValue(existing, incoming) {
  if (incoming === undefined || incoming === null) {
    return cloneStatModifierValue(existing);
  }

  if (existing === undefined || existing === null) {
    return cloneStatModifierValue(incoming);
  }

  if (isObjectStatDelta(existing) || isObjectStatDelta(incoming)) {
    const a = toObjectStatDelta(existing);
    const b = toObjectStatDelta(incoming);
    return {
      current: a.current + b.current,
      max: a.max + b.max,
    };
  }

  if (
    (existing && typeof existing === "object") ||
    (incoming && typeof incoming === "object")
  ) {
    const a = toFlatPercentDelta(existing);
    const b = toFlatPercentDelta(incoming);
    const out = {};
    if (a.flat + b.flat) out.flat = a.flat + b.flat;
    if (a.percent + b.percent) out.percent = a.percent + b.percent;
    return out;
  }

  return (Number(existing) || 0) + (Number(incoming) || 0);
}

export function normalizeStatModifierMap(map = {}) {
  const normalized = {};

  for (const [key, value] of Object.entries(map || {})) {
    const statKey = normalizeStatKey(key);
    if (!statKey) continue;
    normalized[statKey] = addStatModifierValue(normalized[statKey], value);
  }

  return normalized;
}

export function normalizeStatModifierMapInPlace(map) {
  if (!map || typeof map !== "object") return map;

  const normalized = normalizeStatModifierMap(map);

  for (const key of Object.keys(map)) {
    delete map[key];
  }

  Object.assign(map, normalized);
  return map;
}

// Stat access and temporary battle boosts.
function getByPath(obj, path) {
  return String(path).split(".").reduce((acc, key) => acc?.[key], obj);
}

function getBattleBoostStatKey(path) {
  const rawPath = String(path || "");
  if (!rawPath || rawPath.startsWith("baseStats.")) return null;

  const statPath = normalizeStatPath(
    rawPath.startsWith("stats.")
      ? rawPath.slice("stats.".length)
      : rawPath
  );

  if (!statPath.includes(".")) return normalizeStatKey(statPath) || null;

  const [root, child] = statPath.split(".");
  const normalizedRoot = normalizeStatKey(root);
  if (child === "max" && BOOSTABLE_POOL_STAT_KEYS.has(normalizedRoot)) return normalizedRoot;

  return null;
}

export function getEntityBattleBoostValue(entite, stat, mode = "flat") {
  if (isUmbraRestricted(entite, stat)) return 0;
  const statKey = normalizeStatKey(stat);
  if (!entite?.battleBoosts?.[statKey]) return 0;

  return entite.battleBoosts[statKey]
    .filter(boost => boost.mode === mode)
    .reduce((total, boost) => total + (Number(boost.value) || 0), 0);
}

function applyBattleBoostsToSafeValue(entite, path, value) {
  const stat = getBattleBoostStatKey(path);
  // These capacities are reconciled into the live pools on effect changes.
  if (BOOSTABLE_POOL_STAT_KEYS.has(stat) && String(path).endsWith('.max')) return value;
  if (!stat || typeof value !== "number" || !Number.isFinite(value)) {
    return value;
  }

  const flat = getEntityBattleBoostValue(entite, stat, "flat");
  const percent = getEntityBattleBoostValue(entite, stat, "percent");
  if (!flat && !percent) return value;

  const boosted = (value + flat) * (1 + percent / 100);
  if (['strength', 'agility', 'intelligence'].includes(stat)) return boosted;
  return Math.max(0, boosted);
}

export function getSafe(entite, path, fallback = 0) {
  if (path == null) return fallback;
  if (isUmbraRestricted(entite, String(path).replace(/^baseStats\./, ''))) return 0;

  const rawPath = normalizeStatPath(path);
  const systemKey = rawPath.replace(/^stats\./, '');
  if (systemKey === 'speed') {
    const timing = getEntityVelocityTiming(entite);
    if (timing) return applyBattleBoostsToSafeValue(entite, rawPath, timing.adjustedSpeed);
  }
  const directing = getDirectingStatResult(entite, systemKey);
  if (directing) return directing.value;
  if (!['HP', 'armor', 'extraLife', 'shift'].includes(systemKey)) {
    const system = getStatSystemResult(entite, systemKey);
    if (system) return system.value;
  }
  const previewPaths = [rawPath];
  const statsPaths = [rawPath];
  const baseStatsPaths = [rawPath];

  if (rawPath.startsWith("stats.")) {
    const statPath = rawPath.slice("stats.".length);
    previewPaths.unshift(statPath);
    statsPaths.unshift(statPath);
  }

  if (rawPath.startsWith("baseStats.")) {
    baseStatsPaths.unshift(rawPath.slice("baseStats.".length));
  }

  const sources = [
    [entite?.modifierStats?.preview?.total, [...new Set(previewPaths)]],
    [entite?.stats, [...new Set(statsPaths)]],
    [entite?.baseStats, [...new Set(baseStatsPaths)]],
  ];

  for (const [source, paths] of sources) {
    for (const candidate of paths) {
      const value = getByPath(source, candidate);
      if (value !== undefined && value !== null) {
        return applyBattleBoostsToSafeValue(entite, rawPath, value);
      }
    }
  }

  const directValue = getByPath(entite, rawPath);
  return applyBattleBoostsToSafeValue(entite, rawPath, directValue ?? fallback);
}

export function entityBattleBooste(entite, {
  stat,
  value = 0,
  source = "unknown",
  mode = "flat",
  durationMs = null,
  stackable = true,
} = {}) {
  const statKey = normalizeStatKey(stat);

  if (!entite || !statKey) {
    return {
      applied: false,
      remove: () => {},
    };
  }

  const boostValue = Number(value) || 0;
  const confirmedGainValue = () => getSafe({ ...entite, modifierStats: null }, statKey, 0);
  const valueBefore = confirmedGainValue();
  const syncArmorCapacity = () => {
    if (statKey !== 'strength' && statKey !== 'robustness') return;
    const confirmed = { ...entite, modifierStats: null };
    syncEntityRobustnessArmorCapacity(entite, calculateRobustnessBonus(
      getSafe(confirmed, 'robustness', 0), getSafe(confirmed, 'strength', 0), globalThis.umbraProgression.getUmbraThreshold(confirmed)
    ));
  };
  const boostId = `${source}_${statKey}_${clockNow()}_${Math.random().toString(16).slice(2)}`;

  entite.battleBoosts = entite.battleBoosts || {};
  entite.battleBoosts[statKey] ??= [];

  if (!stackable) {
    entite.battleBoosts[statKey]
      .filter(boost => boost.source === source)
      .forEach(boost => {
        if (typeof boost.remove === "function") boost.remove({ syncArmor: false });
      });

    entite.battleBoosts[statKey] = (entite.battleBoosts[statKey] || [])
      .filter(boost => boost.source !== source);
  }

  const boost = {
    id: boostId,
    stat: statKey,
    value: boostValue,
    source,
    mode,
    createdAt: clockNow(),
    expiresAt: durationMs === null ? null : clockNow() + Math.max(0, Number(durationMs) || 0),
    timeout: null,
    remove: null,
  };

  const removeBoost = ({ syncArmor = true } = {}) => {
    if (!entite.battleBoosts?.[statKey]) return;

    if (boost.timeout) {
      clearTimeout(boost.timeout);
      boost.timeout = null;
    }

    entite.battleBoosts[statKey] = entite.battleBoosts[statKey]
      .filter(activeBoost => activeBoost.id !== boostId);

    if (entite.battleBoosts[statKey].length === 0) {
      delete entite.battleBoosts[statKey];
    }
    if (statKey === 'hypercognition' || statKey === 'cognitiveGenerator') syncEntityEssenceRewards(entite);
    if (syncArmor) syncArmorCapacity();

    console.log(
      `Battle boost retire : ${entite.name} | ${statKey} ${boostValue >= 0 ? "+" : ""}${boostValue} | source=${source}`
    );
  };

  boost.remove = removeBoost;
  entite.battleBoosts[statKey].push(boost);
  if (statKey === 'hypercognition' || statKey === 'cognitiveGenerator') syncEntityEssenceRewards(entite);
  syncArmorCapacity();

  if (durationMs !== null) {
    boost.timeout = setTimeout(removeBoost, Math.max(0, Number(durationMs) || 0));
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('entityStatsGained', {
    detail: { entity: entite, gains: [{ stat: statKey, amount: confirmedGainValue() - valueBefore }] },
  }));

  console.log(
    `Battle boost applique : ${entite.name} | ${statKey} ${boostValue >= 0 ? "+" : ""}${boostValue} | source=${source}`
  );

  return {
    applied: true,
    id: boostId,
    stat: statKey,
    value: boostValue,
    source,
    mode,
    remove: removeBoost,
  };
}

// Resistances and penetration.
const toPositiveNumber = (value) => Math.max(0, Number(value) || 0);

function getResistanceConstant(override = null) {
  return Number(override ?? balanceData.resistance.reductionCurve.constant) ||
    balanceData.resistance.reductionCurve.constant;
}

function calculateResistanceReductionRatio(resistanceValue, resistanceConstant = null) {
  const constant = getResistanceConstant(resistanceConstant);
  const maxRatio = (Number(balanceData.resistance.reductionCurve.maxPercent) || 99) / 100;
  const resistance = toPositiveNumber(resistanceValue);

  if (resistance <= 0) return 0;

  return Math.max(
    0,
    Math.min(maxRatio - Number.EPSILON * maxRatio, (resistance / (resistance + constant)) * maxRatio)
  );
}

export function calculateResistanceReductionPercent(resistanceValue, resistanceConstant = null) {
  return Math.ceil(calculateResistanceReductionRatio(resistanceValue, resistanceConstant) * 100);
}

export function calculatePenetrationPercent(entite, statKey, valueOverride = null) {
  const system = getStatSystemResult(entite, statKey);
  if (system) return system.value;
  const cfg = balanceData.penetration.curve;
  const penValue = Number(valueOverride ?? getSafe(entite, statKey, 0)) || 0;

  if (penValue === 1) return cfg.exactOnePercent;

  const ratio = 1 / (1 + Math.exp(-cfg.steepness * (penValue - cfg.midpoint)));
  const minVal = 1 / (1 + Math.exp(-cfg.steepness * (0 - cfg.midpoint)));
  const maxVal = 1 / (1 + Math.exp(-cfg.steepness * (cfg.maxStat - cfg.midpoint)));
  const normalized = (ratio - minVal) / (maxVal - minVal);

  return Math.round(Math.max(0, Math.min(1, normalized)) * cfg.maxPercent);
}

export function calculatePhysicalPenPercent(entite) {
  return calculatePenetrationPercent(entite, "physicalPen");
}

export function calculateMagicalPenPercent(entite) {
  return calculatePenetrationPercent(entite, "magicalPen");
}

function applyPenetration(resistance, penetrationPercent) {
  return Math.max(0, toPositiveNumber(resistance) * (1 - toPositiveNumber(penetrationPercent) / 100));
}

function reduceDamage(damage, resistance) {
  const amount = toPositiveNumber(damage);
  if (amount <= 0) return 0;

  return Math.floor(amount * (1 - calculateResistanceReductionRatio(resistance)));
}

export function calculateResistances(target, totalDamageSources = {}, attacker = null, { inert = false } = {}) {
  const physicalResistanceBase = toPositiveNumber(getSafe(target, "physicalResistance", 0));
  const magicalResistanceBase = toPositiveNumber(getSafe(target, "magicalResistance", 0));

  const physicalPenPercent = attacker ? calculatePhysicalPenPercent(attacker) : 0;
  const magicalPenPercent = attacker ? calculateMagicalPenPercent(attacker) : 0;

  const physicalResistance = applyPenetration(physicalResistanceBase, physicalPenPercent);
  const magicalResistance = applyPenetration(magicalResistanceBase, magicalPenPercent);
  const reduction = (key, penetration, fallback) => {
    const constant = globalThis.umbraProgression.getResistanceConstant(key);
    const system = getStatSystemResult(target, key);
    if (!system) return calculateResistanceReductionRatio(fallback, constant);
    const retained = Math.max(0, 1 - penetration / 100);
    if (system.resistancePoints) return globalThis.umbraProgression.resistanceReductionRatio(system.value * retained, constant);
    const generated = calculateResistanceReductionRatio(system.generated * retained, constant);
    return Math.min(balanceData.resistance.reductionCurve.maxPercent / 100, Math.max(0, generated + (system.normal + system.plusApplied + system.umbraFlat) * retained / 100));
  };
  const physicalRatio = reduction('physicalResistance', physicalPenPercent, physicalResistance);
  const magicalRatio = reduction('magicalResistance', magicalPenPercent, magicalResistance);
  const physicalDamageAfter = damage => Math.floor(toPositiveNumber(damage) * (1 - physicalRatio));
  const magicalDamageAfter = damage => Math.floor(toPositiveNumber(damage) * (1 - magicalRatio));

  const piercingDamage = toPositiveNumber(totalDamageSources.piercingDamage);
  const physical = toPositiveNumber(totalDamageSources.physical);
  const magical = toPositiveNumber(totalDamageSources.magical);
  const hybridalDamage = toPositiveNumber(totalDamageSources.hybridalDamage);

  let reducedHybrid = 0;

  if (hybridalDamage > 0) {
    const physicalSplit = Math.max(0, Math.min(1, Number(balanceData.resistance.hybrid.splitRatio) || 0.5));
    const hybridPhysicalPart = hybridalDamage * physicalSplit;
    const hybridMagicalPart = hybridalDamage - hybridPhysicalPart;

    reducedHybrid =
      physicalDamageAfter(hybridPhysicalPart) +
      magicalDamageAfter(hybridMagicalPart);
  }

  const afterPhysical = physicalDamageAfter(physical);
  const afterMagical = inert ? magicalDamageAfter(afterPhysical) : afterPhysical;
  return {
    reducedpiercingDamage: piercingDamage,
    reducedPhysicalDamage: afterMagical,
    reducedMagicalDamage: magicalDamageAfter(magical),
    reducedHybridalDamage: reducedHybrid,
    details: {
      inert: inert ? { before: physical, afterPhysical, afterMagical } : null,
      physicalResistanceBase,
      magicalResistanceBase,
      physicalPenPercent,
      magicalPenPercent,
      physicalResistance,
      magicalResistance,
      physicalReductionPercent: Number((physicalRatio * 100).toFixed(2)),
      magicalReductionPercent: Math.ceil(magicalRatio * 100),
    },
  };
}

// Combat capabilities derived from the entity's attacks.
export function describeAttackCombat(attack) {
    const targets = attack.attackTarget || [];
    const domains = [];
    if (targets.some(target => target === 'ally' || target === 'enemy')) {
        domains.push(attack.deadTarget?.includes('yes') ? 'necro' : 'combattant');
    }
    if (targets.includes('hexa')) domains.push('invocateur');
    return { domains, combatFunction: attack.combatFunction, ranges: [...(attack.attackRange || [])] };
}

const DOMAIN_LABELS = {
    combattant: 'Combattant', invocateur: 'Invocateur', necro: 'Nécro',
    'invocateur-combattant': 'Invo-combattant',
    'necro-combattant': 'Nécro-combattant',
    'necro-invocateur': 'Nécro-invocateur',
    'necro-invocateur-combattant': 'Nécro-invo-combattant',
};

// A projection of the whole owned kit, never of cooldowns or current targets.
export function analyzeEntityCombatProfile(entity, attacks) {
    assertEntityTargetingIdentity(entity, attacks);
    const descriptions = attacks.map(describeAttackCombat);
    const domains = ['necro', 'invocateur', 'combattant']
        .filter(domain => descriptions.some(attack => attack.domains.includes(domain)));
    const functions = [...new Set(descriptions.map(attack => attack.combatFunction))];
    const ranges = ['melee', 'range'].filter(range => descriptions.some(attack => attack.ranges.includes(range)));
    const combatFunction = functions.length > 1 ? 'Arbitre' : functions[0];
    const range = ranges.length > 1 ? 'multi' : ranges[0];
    const rankLabel = entity.type === 'lord' ? 'Lord' : 'Sbire';
    const rangeLabel = { melee: 'de mêlée', range: 'à distance', multi: 'multi-portée' }[range];
    const label = `${rankLabel} ${DOMAIN_LABELS[domains.join('-')]} ${combatFunction} ${rangeLabel}`;
    const classes = [`rank-${entity.type}`, ...domains.map(domain => `domain-${domain}`),
        `function-${combatFunction.toLowerCase()}`, `range-${range}`, combatFunction];
    const helper = buildCombatProfileHelper({ entity, domains, attacks, describeAttackCombat, range, combatFunction, label });
    return { rank: entity.type, domains, combatFunction, range, label, classes, helper };
}

// Archetype cycles, milestones and progression rules.













// This cache can be requested while the entity catalogue is initializing.
// Do not reset it after an earlier request through a circular importer.
var archetypeTargetRatiosCache;

function readArchetypeNumber(value, fallback = 0) {
  if (value && typeof value === 'object') {
    return Number(value.max ?? value.current ?? fallback) || fallback;
  }

  return Number(value ?? fallback) || fallback;
}

function readArchetypeFoundationStat(entite, statKey, fallback = 0) {
  return readArchetypeNumber(entite?.baseStats?.[statKey], fallback) +
    readArchetypeNumber(entite?.modifierStats?.durable?.adminLevel?.[statKey], 0);
}

export function normalizeArchetypeKey(key) {
  return String(key ?? '').trim().toLowerCase();
}

export function isKnownArchetypeKey(key) {
  return !!CLASS_INDEX[normalizeArchetypeKey(key)];
}

export function ensureEntityLevelObject(entite, options = {}) {
  if (!entite) return;

  const defaultMax = balanceData.level.progression.tableMaxLevel;
  const globalMax = Math.max(1, Math.floor(Number(options.maxLevel ?? defaultMax) || defaultMax));
  const raw = entite.level;

  if (raw == null || typeof raw === 'number') {
    const current =
      (typeof raw === 'number' && raw > 0 && !Number.isNaN(raw))
        ? raw
        : 1;
    entite.level = { current, max: Math.max(current, globalMax) };
    return;
  }

  if (typeof raw === 'object') {
    const cur =
      (typeof raw.current === 'number' && raw.current > 0) ? raw.current :
      (typeof raw.level === 'number' && raw.level > 0) ? raw.level :
      1;
    const mx =
      (typeof raw.max === 'number' && raw.max > 0)
        ? raw.max
        : Math.max(cur, globalMax);

    entite.level = { ...raw, current: cur, max: mx };
  }
}

export function getArchetypeUID() {
  return 'arch_' + Math.random().toString(36).slice(2, 10);
}

export function calculateAwakeningStepCount(value, config = {}) {
  const cfg = {
    ...balanceData.level.will,
    ...config,
  };
  const {
    pointsPerAwakeningLevel,
    minAwakeningLevels,
    maxAwakeningLevels,
  } = cfg;
  const minLevels = config.minLevels ?? minAwakeningLevels;
  const maxLevels = config.maxLevels ?? maxAwakeningLevels;

  const v = Math.max(0, Number(value) || 0);
  const raw = Math.ceil(v / pointsPerAwakeningLevel);
  return Math.max(minLevels, Math.min(maxLevels, raw));
}

export function getArchetypeConfig(entite) {
  const DEFAULT_STRAT = balanceData.archetype.defaultStratWill;
  const will = readArchetypeFoundationStat(entite, 'will', 0);
  const stratArchetype = will > 0
    ? Math.floor(will)
    : DEFAULT_STRAT;

  return { stratArchetype, will: stratArchetype };
}

export function buildEgareCycle(entite) {
  const fallbackWill = balanceData.archetype.egareFallbackWill;
  const willRaw = readArchetypeFoundationStat(entite, 'will', fallbackWill);
  const targetLen = calculateAwakeningStepCount(willRaw, {
    ...balanceData.level.will,
  });

  const base = (CLASS_INDEX.egare?.cycle && CLASS_INDEX.egare.cycle.length)
    ? CLASS_INDEX.egare.cycle
    : BASE_EGARE_CYCLE;

  const result = [];
  while (result.length < targetLen) {
    for (let i = 0; i < base.length && result.length < targetLen; i++) {
      result.push(base[i]);
    }
  }

  return result;
}

export function getCycleForKey(classKey, entite) {
  const k = normalizeArchetypeKey(classKey);

  if (k === 'egare') {
    const dyn = buildEgareCycle(entite);
    return Array.isArray(dyn) && dyn.length > 0 ? dyn : null;
  }

  const arr = CLASS_INDEX[k]?.cycle;
  return Array.isArray(arr) && arr.length > 0 ? arr : null;
}

export function getCycleLenFor(name, entite) {
  const arr = getCycleForKey(name, entite);
  return arr ? arr.length : 0;
}

export function getClassLabel(key) {
  const meta = CLASS_INDEX[normalizeArchetypeKey(key)];
  return meta?.name || key;
}

function roundPercentTriple(fPct, aPct, iPct) {
  let f = Math.round(fPct);
  let a = Math.round(aPct);
  let i = Math.round(iPct);
  const corr = balanceData.archetype.ratioTotalPercent - (f + a + i);

  if (corr !== 0) {
    const arrCorr = [
      { k: 'f', v: f },
      { k: 'a', v: a },
      { k: 'i', v: i },
    ].sort((x, y) => y.v - x.v);

    arrCorr[0].v += corr;
    f = arrCorr.find(x => x.k === 'f').v;
    a = arrCorr.find(x => x.k === 'a').v;
    i = arrCorr.find(x => x.k === 'i').v;
  }

  return { f, a, i };
}

export function getNormalArchetype(force, agilite, intelligence) {
  const fRaw = Math.max(0, Number(force) || 0);
  const aRaw = Math.max(0, Number(agilite) || 0);
  const iRaw = Math.max(0, Number(intelligence) || 0);
  const total = fRaw + aRaw + iRaw;

  if (total === 0) return 'inerte';

  const { f, a, i } = roundPercentTriple(
    (fRaw / total) * 100,
    (aRaw / total) * 100,
    (iRaw / total) * 100
  );

  for (const cycle of cyclesData) {
    if (!cycle.dom || !cycle.pct) continue;
    const val =
      cycle.dom === 'force' ? f :
      cycle.dom === 'agilite' ? a :
      i;

    if (val >= cycle.pct) return cycle.key;
  }

  if (f >= 50 && i >= 50) return 'paladin';
  if (a >= 50 && f >= 50) return 'berzerker';
  if (i >= 50 && a >= 50) return 'fleau';
  if (f >= 40 && a >= 40) return 'sanguinaire';
  if (f >= 40 && i >= 40) return 'croise';
  if (a >= 40 && i >= 40) return 'mangemage';

  const ordered = [
    { n: 'force', v: f },
    { n: 'agilite', v: a },
    { n: 'intelligence', v: i },
  ].sort((x, y) => y.v - x.v);
  const [s1, s2] = ordered.map(x => x.n);
  const diff13 = ordered[0].v - ordered[2].v;

  if (diff13 >= 20) {
    if (s1 === 'force' && s2 === 'agilite') return 'bruiser';
    if (s1 === 'force' && s2 === 'intelligence') return 'fanatique';
    if (s1 === 'agilite' && s2 === 'force') return 'rodeur';
    if (s1 === 'agilite' && s2 === 'intelligence') return 'flagellateur';
    if (s1 === 'intelligence' && s2 === 'force') return 'mysticiste';
    if (s1 === 'intelligence' && s2 === 'agilite') return 'scrutateur';
  }

  if (diff13 >= 10) {
    if (s1 === 'force') return 'moloch';
    if (s1 === 'agilite') return 'vautour';
    if (s1 === 'intelligence') return 'zelote';
  }

  const max = Math.max(f, a, i);
  const min = Math.min(f, a, i);
  const d = max - min;
  if (d <= 3) return 'archon';
  if (d <= 6) return 'equinoxe';
  if (d <= 10) return 'erudit';

  return 'egare';
}

export function getClassFromAttributs(
  force,
  agilite,
  intelligence,
  level = 1,
  awakened = true,
  entite = null
) {
  if (!awakened || entite?.archetypeFrozen === true) {
    return 'egare';
  }

  return getNormalArchetype(force, agilite, intelligence);
}

export function resolveMutation(
  cycleName,
  force,
  agilite,
  intelligence,
  investedAttrib,
  level = 1,
  entite = null,
  awakened = null
) {
  if (!String(cycleName || '').startsWith('mutation')) {
    return { finalName: cycleName, mutationLevel: null };
  }

  const { stratArchetype } = getArchetypeConfig(entite);
  const fRaw = Math.max(0, Number(force) || 0);
  const aRaw = Math.max(0, Number(agilite) || 0);
  const iRaw = Math.max(0, Number(intelligence) || 0);
  const total = fRaw + aRaw + iRaw;
  const mutationLevel = parseInt(String(cycleName).split('-')[1] || '1', 10);
  const realClass = normalizeArchetypeKey(
    getClassFromAttributs(fRaw, aRaw, iRaw, level, true, entite)
  );
  const isAwakened =
    typeof awakened === 'boolean'
      ? awakened
      : level > stratArchetype - 1;
  const classKey = isAwakened ? realClass : 'egare';
  const cycle = cyclesData.find(c => c.key === classKey);

  if (!cycle || !cycle.dom || !cycle.pct) {
    const resolved =
      investedAttrib === 'force' ? `attaque-${mutationLevel}` :
      investedAttrib === 'agilite' ? `defense-${mutationLevel}` :
      `utilitaire-${mutationLevel}`;

    return { finalName: resolved, mutationLevel };
  }

  let f = fRaw;
  let a = aRaw;
  let i = iRaw;
  const lockedValue = Math.round(total * (cycle.pct / 100));

  if (cycle.dom === 'force') f = Math.max(0, f - lockedValue);
  else if (cycle.dom === 'agilite') a = Math.max(0, a - lockedValue);
  else if (cycle.dom === 'intelligence') i = Math.max(0, i - lockedValue);

  const rest = f + a + i;
  let secondary = null;

  if (rest > 0) {
    const arr = [
      { n: 'force', v: f },
      { n: 'agilite', v: a },
      { n: 'intelligence', v: i },
    ].sort((x, y) => y.v - x.v);

    if (arr[0].v > arr[1].v) {
      secondary = arr[0].n;
    } else if (arr.some(x => x.n === cycle.dom && x.v === arr[0].v)) {
      secondary = cycle.dom;
    } else {
      secondary = investedAttrib;
    }
  } else {
    secondary = cycle.dom;
  }

  const finalName =
    secondary === 'force' ? `attaque-${mutationLevel}` :
    secondary === 'agilite' ? `defense-${mutationLevel}` :
    `utilitaire-${mutationLevel}`;

  return { finalName, mutationLevel };
}

export function getStatKeyForArchetypeStep({
  archetypeKey,
  investedAttribut,
  stageName,
} = {}) {
  const stage = String(stageName || '').trim();
  if (!stage) return null;

  return (
    STAT_INDEX.typeToKey?.[normalizeArchetypeKey(archetypeKey)]?.[stage] ||
    STAT_INDEX.typeToKey?.[investedAttribut]?.[stage] ||
    null
  );
}

export function getArchetypeMilestones(classKey, entite) {
  const cycle = getCycleForKey(classKey, entite) || DEFAULT_CYCLE;
  if (!cycle || !Array.isArray(cycle)) return [];

  const milestones = [];
  cycle.forEach((entry, index) => {
    const match = String(entry).match(/-(\d+)$/);
    if (!match) return;

    const level = parseInt(match[1], 10);
    if (level === 1 || level === 2 || level === 3) {
      milestones.push({
        index,
        level,
        stageName: entry,
      });
    }
  });

  return milestones;
}

function buildArchetypeTargetRatios() {
  const acc = {};
  const totalPercent = balanceData.archetype.ratioTotalPercent;

  for (let f = 0; f <= totalPercent; f++) {
    for (let a = 0; a <= totalPercent - f; a++) {
      const i = totalPercent - f - a;
      const key = normalizeArchetypeKey(getNormalArchetype(f, a, i));
      acc[key] ??= { count: 0, force: 0, agilite: 0, intelligence: 0 };
      acc[key].count += 1;
      acc[key].force += f;
      acc[key].agilite += a;
      acc[key].intelligence += i;
    }
  }

  const ratios = {};
  for (const [key, value] of Object.entries(acc)) {
    const count = Math.max(1, value.count);
    ratios[key] = {
      force: value.force / count / totalPercent,
      agilite: value.agilite / count / totalPercent,
      intelligence: value.intelligence / count / totalPercent,
    };
  }

  ratios.inerte ??= { force: 1 / 3, agilite: 1 / 3, intelligence: 1 / 3 };
  ratios.egare ??= { force: 1 / 3, agilite: 1 / 3, intelligence: 1 / 3 };
  return ratios;
}

export function getArchetypeTargetRatios(key) {
  archetypeTargetRatiosCache ??= buildArchetypeTargetRatios();
  return archetypeTargetRatiosCache[normalizeArchetypeKey(key)] || null;
}

registerCombatState('boosts', () => true, (_, { entities }) => {
  for (const entity of entities) for (const [stat, boosts] of Object.entries(entity.battleBoosts || {})) {
    for (const boost of boosts) {
      boost.remove = ({ syncArmor = true } = {}) => {
        clearTimeout(boost.timeout);
        if (!entity.battleBoosts?.[stat]) return;
        entity.battleBoosts[stat] = entity.battleBoosts[stat].filter(b => b.id !== boost.id);
        if (!entity.battleBoosts[stat].length) delete entity.battleBoosts[stat];
        if (stat === 'hypercognition' || stat === 'cognitiveGenerator') syncEntityEssenceRewards(entity);
        if (syncArmor && (stat === 'strength' || stat === 'robustness')) {
          const confirmed = { ...entity, modifierStats: null };
          syncEntityRobustnessArmorCapacity(entity, calculateRobustnessBonus(
            getSafe(confirmed, 'robustness', 0), getSafe(confirmed, 'strength', 0), globalThis.umbraProgression.getUmbraThreshold(confirmed)));
        }
      };
      boost.timeout = boost.expiresAt === null ? null : setTimeout(boost.remove, Math.max(0, boost.expiresAt - clockNow()));
    }
  }
});
