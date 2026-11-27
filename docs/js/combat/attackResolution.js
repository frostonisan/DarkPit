import { splitDamageByNature } from "./damageRules.js";
import { ATTACK_POWER_RATIO_FIELDS, ATTACK_ARRAY_KEYS, ATTACK_RUNTIME_STATE_KEYS, ENTITY_ATTACK_MODIFIER_LAYERS, ATTACK_ESSENCE_CONTENT_SOURCES, ATTACK_NATURE_TO_ESSENCE_COLORS, ATTACK_ESSENCE_COLOR_ALIASES } from "../data/attackList.js";
export { ENTITY_ATTACK_MODIFIER_LAYERS } from "../data/attackList.js";
import { isCombatInteractionBlocked, notifyCombatAction } from "./clock.js";
import { registerCombatState } from "./clock.js";
import { setTimeout, clearTimeout, clockNow } from "./clock.js";
import { combatNow } from "./timeline.js";
import { balanceData } from "../data/balanceData.js";
import { ATTACK_ESSENCE_COLORS, ATTACK_ESSENCE_MAX_SLOTS, ATTACK_ESSENCE_SLOT_SOURCES } from "../data/attackList.js";
export { ATTACK_ESSENCE_COLORS, ATTACK_ESSENCE_MAX_SLOTS, ATTACK_ESSENCE_SLOT_SOURCES } from "../data/attackList.js";
import { resolveAttackEffects } from "../data/attackEffects.js";
import { getAttackControlValue, clearManualControlOverride } from "./control.js";
import {
  ensureEntityAttackEssenceIdentities,
  initializeEntityEssenceOwnership,
  releaseRemovedAttackEssences,
} from "../items/essenceInventory.js";
import { assertAttackCombatDefinition, analyzeEntityCombatProfile } from "../entities/rules.js";

// Attack mastery and its socket rewards.
export function masteryLevelCost(level) {
  const cfg = balanceData.attackMastery;
  return cfg.firstLevelCost + (level - 1) * cfg.costIncrease;
}

export function masteryPointsForLevel(level) {
  let points = 0;
  for (let n = 1; n < Math.min(level, balanceData.attackMastery.maxLevel); n++) points += masteryLevelCost(n);
  return points;
}

export function getAttackMastery(attack) {
  const maxLevel = balanceData.attackMastery.maxLevel;
  const initial = masteryPointsForLevel(Math.max(1, attack?.essenceBaseProfile?.slots?.length || attack?.essenceSlots?.length || 1));
  const points = Math.min(masteryPointsForLevel(maxLevel), Math.max(0, Math.floor(Number(attack?.mastery?.points ?? initial) || 0)));
  let level = 1;
  while (level < maxLevel && points >= masteryPointsForLevel(level + 1)) level++;
  const current = points - masteryPointsForLevel(level);
  const cost = level < maxLevel ? masteryLevelCost(level) : 0;
  return { points, level, current, cost, remaining: Math.max(0, cost - current), maxed: level === maxLevel };
}

export function syncAttackMastery(entity, attack) {
  const progress = getAttackMastery(attack);
  const grantedLevel = attack.mastery?.level ?? attack.essenceSlots?.length ?? 0;
  attack.mastery = { points: progress.points, level: progress.level };
  attack.essenceSlots ||= [];
  // Removed sockets stay removed; only a newly reached mastery level grants one.
  for (let level = grantedLevel + 1; level <= progress.level; level++) {
    attack.essenceSlots.push({ slotId: `mastery-${level}`, source: 'attack-mastery', kind: 'open', locked: false,
      color: null, essenceSource: '', linkedColor: '' });
  }
  attack.essenceSlotCount = attack.essenceSlots.length;
  return progress;
}

export function awardAttackMastery(entity, attack, { launch = false, impact = false, critical = false, periodic = false } = {}) {
  if (!entity || entity.isDEAD || !(entity.stats?.HP?.current > 0) || periodic) return null;
  const owned = entity.attackDetails?.find(candidate => candidate.entityAttackId === attack?.entityAttackId);
  if (!owned) return null;
  const gains = balanceData.attackMastery.gains;
  const amount = (launch ? gains.launch : 0) + (impact ? gains.impact : 0) + (impact && critical ? gains.critical : 0);
  const before = getAttackMastery(owned);
  if (!amount || before.maxed) return null;
  owned.mastery = { ...owned.mastery, points: before.points + amount };
  const after = syncAttackMastery(entity, owned);
  ensureEntityAttackEssenceIdentities(entity, owned);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('attackMasteryChanged', {
    detail: { entity, attack: owned, before, after, gained: after.points - before.points },
  }));
  return after;
}

// Attack selection, priorities and cooldown state.
// Battle-only clocks and selection credits never enter serialized entity data.
const runtimes = new Map();
// UI subscribers may arrive while a circular import is still initializing.
// Keep their shared registry lazy; never overwrite subscriptions afterwards.
var listeners;
function attackSelectionListeners() {
  return listeners ??= new Set();
}
export function attackSelectionKey(attack) {
  return String(attack?.attackKey || attack?.functionName || '');
}

export function subscribeAttackSelection(listener) {
  const subscribers = attackSelectionListeners();
  subscribers.add(listener);
  return () => subscribers.delete(listener);
}

// Entity-scoped notifications use the same mutation boundary as the attack editor,
// progression and temporary modifiers. No polling or deep object observers.
export function subscribeEntityAttackEffects(entity, listener) {
  const read = () => readAttackDefinitionsForEntity(entity);
  const signature = attacks => JSON.stringify(attacks.map(attack =>
    [readAttackDefinitionKey(attack), attack.resolvedEffects, attack.resolvedSelfEffects]));
  let previous = signature(read());
  return subscribeAttackSelection(changed => {
    if (changed !== entity) return;
    const attacks = read(), next = signature(attacks);
    if (next === previous) return;
    previous = next;
    listener({ entity, attacks, effectTypes: [...new Set(attacks.flatMap(attack => attack.effectTypes))] });
  });
}

export function notifyAttackSelection(entity, reason = 'change') {
  for (const listener of attackSelectionListeners()) listener(entity, reason);
}

export function normalizeAttackSelection(entity, attacks) {
  const keys = attacks.map(attackSelectionKey);
  if (keys.some(key => !key) || new Set(keys).size !== keys.length) {
    throw new TypeError('Chaque attaque doit posseder une cle unique.');
  }
  const config = entity.attackSelection || { priorityMode: 'auto', priorities: {} };
  const rank = key => Number(config.priorities?.[key]) || Infinity;
  const sorted = keys.slice().sort((a, b) => rank(a) - rank(b));
  const manualRank = key => Number(config.manualPriorities?.[key]) || Infinity;
  const manual = keys.slice().sort((a, b) => manualRank(a) - manualRank(b));
  entity.attackSelection = {
    priorityMode: config.priorityMode === 'manual' ? 'manual' : 'auto',
    priorities: Object.fromEntries(sorted.map((key, index) => [key, index + 1])),
    disabled: Object.fromEntries(keys.filter(key => config.disabled?.[key] === true).map(key => [key, true])),
    manualPriorities: config.manualPriorities
      ? Object.fromEntries(manual.map((key, index) => [key, index + 1])) : null,
  };
  return entity.attackSelection;
}

function runtime(entity) {
  const id = String(entity.id);
  if (!runtimes.has(id)) runtimes.set(id, { attacks: new Map(), signature: '', activeKey: null });
  return runtimes.get(id);
}

export function syncAttackSelection(entity, attacks) {
  const config = normalizeAttackSelection(entity, attacks);
  const state = runtime(entity);
  const keys = attacks.map(attackSelectionKey);
  const signature = JSON.stringify([config.priorityMode, keys, config.priorities, config.disabled]);
  for (const key of state.attacks.keys()) if (!keys.includes(key)) state.attacks.delete(key);
  for (const key of keys) {
    if (!state.attacks.has(key)) state.attacks.set(key, { credit: 0, lastUsedAt: null, readyAt: 0 });
  }
  // A changed roster/weight distribution starts a fresh fair rotation, preserving clocks.
  if (state.signature !== signature) {
    for (const entry of state.attacks.values()) entry.credit = 0;
    state.signature = signature;
  }
  return state;
}

export function getAttackRuntime(entity, attack) {
  const entry = runtimes.get(String(entity.id))?.attacks.get(attackSelectionKey(attack));
  if (entry) updateSleepingCooldown(entity, entry);
  return entry || { credit: 0, lastUsedAt: null, readyAt: 0 };
}

function updateSleepingCooldown(entity, entry, now = combatNow()) {
  const from = entry.sleepCheckedAt ?? entry.lastUsedAt ?? now;
  let cursor = from;
  for (const interval of [...(entity.controlIntervals?.sommeil || [])].sort((a,b) => a.start - b.start)) {
    const start = Math.max(cursor, interval.start), end = Math.min(now, interval.end);
    if (end > start && start < entry.readyAt) entry.readyAt += end - start;
    cursor = Math.max(cursor, end);
  }
  entry.sleepCheckedAt = now;
}

export function setAttackPriority(entity, attacks, key, rank) {
  if (isCombatInteractionBlocked()) return false;
  const config = normalizeAttackSelection(entity, attacks);
  if (!Object.hasOwn(config.priorities, key) || !Number.isInteger(rank) || rank < 1 || rank > attacks.length) return false;
  for (const candidate of Object.keys(config.priorities)) config.priorities[candidate] = getAttackControlValue(entity, 'priorities', candidate, config.priorities[candidate]);
  clearManualControlOverride(entity, 'priorities');
  const oldRank = config.priorities[key];
  const other = Object.keys(config.priorities).find(candidate => config.priorities[candidate] === rank);
  config.priorities[key] = rank;
  if (other && other !== key) config.priorities[other] = oldRank;
  config.priorityMode = 'manual';
  config.manualPriorities = { ...config.priorities };
  syncAttackSelection(entity, attacks);
  notifyAttackSelection(entity);
  notifyCombatAction();
  return true;
}

export function setAttackPrioritiesAutomatic(entity, attacks, cooldownFor = attack => attack?.cooldown) {
  if (isCombatInteractionBlocked()) return false;
  clearManualControlOverride(entity, 'priorities');
  const config = normalizeAttackSelection(entity, attacks);
  if (config.priorityMode === 'manual') config.manualPriorities = { ...config.priorities };
  const ordered = attacks
    .map((attack, index) => ({ key: attackSelectionKey(attack), index, cooldown: Math.max(0, Number(cooldownFor(attack)) || 0) }))
    .sort((a, b) => b.cooldown - a.cooldown || a.index - b.index);
  config.priorities = Object.fromEntries(ordered.map(({ key }, index) => [key, index + 1]));
  config.priorityMode = 'auto';
  syncAttackSelection(entity, attacks);
  notifyAttackSelection(entity);
  notifyCombatAction();
  return config;
}

export function restoreManualAttackPriorities(entity, attacks) {
  if (isCombatInteractionBlocked()) return false;
  clearManualControlOverride(entity, 'priorities');
  const config = normalizeAttackSelection(entity, attacks);
  config.priorities = { ...(config.manualPriorities || config.priorities) };
  config.manualPriorities = { ...config.priorities };
  config.priorityMode = 'manual';
  syncAttackSelection(entity, attacks);
  notifyAttackSelection(entity);
  notifyCombatAction();
  return entity.attackSelection;
}

export function setAllAttacksEnabled(entity, attacks, enabled) {
  if (isCombatInteractionBlocked()) return false;
  clearManualControlOverride(entity, 'disabled');
  const config = normalizeAttackSelection(entity, attacks);
  config.disabled = enabled ? {} : Object.fromEntries(attacks.map(attack => [attackSelectionKey(attack), true]));
  syncAttackSelection(entity, attacks);
  notifyAttackSelection(entity);
  notifyCombatAction();
}

export function setAttackEnabled(entity, attacks, key, enabled) {
  if (isCombatInteractionBlocked()) return false;
  const config = normalizeAttackSelection(entity, attacks);
  if (!Object.hasOwn(config.priorities, key)) return false;
  clearManualControlOverride(entity, 'disabled', [key]);
  if (enabled) delete config.disabled[key];
  else config.disabled[key] = true;
  syncAttackSelection(entity, attacks);
  notifyAttackSelection(entity);
  notifyCombatAction();
  return true;
}

export function describeAttackChoices(entity, attacks, cooldownFor, now = combatNow()) {
  const config = normalizeAttackSelection(entity, attacks);
  if (config.priorityMode === 'auto') {
    const ordered = attacks
      .map((attack, index) => ({ key: attackSelectionKey(attack), index, cooldown: Math.max(0, Number(cooldownFor(attack)) || 0) }))
      .sort((a, b) => b.cooldown - a.cooldown || a.index - b.index);
    config.priorities = Object.fromEntries(ordered.map(({ key }, index) => [key, index + 1]));
  }
  const state = syncAttackSelection(entity, attacks);
  return attacks.map((attack, index) => {
    const key = attackSelectionKey(attack);
    const clock = state.attacks.get(key);
    updateSleepingCooldown(entity, clock, now);
    const priority = getAttackControlValue(entity, 'priorities', key, config.priorities[key]);
    const interrupted = entity._interruptedAttackKey === key;
    return { attack, key, index, priority, disabled: getAttackControlValue(entity, 'disabled', key, config.disabled[key] === true),
      weight: attacks.length + 1 - priority,
      cooldown: Math.max(0, Number(cooldownFor(attack)) || 0),
      ...clock, readyAt: interrupted ? now : clock.readyAt, remaining: interrupted ? 0 : Math.max(0, clock.readyAt - now),
    };
  });
}

export function compareAttackChoices(entity, a, b) {
  return (b.credit + b.weight) - (a.credit + a.weight)
    || a.priority - b.priority
    || a.index - b.index;
}

export function predictNextAttack(entity, choices) {
  return choices.filter(choice => !choice.disabled).sort((a, b) => a.readyAt - b.readyAt || compareAttackChoices(entity, a, b))[0] || null;
}

export function commitAttackChoice(entity, participants, chosenKey) {
  const state = runtime(entity);
  if (!participants.some(choice => choice.key === chosenKey)) return;
  const total = participants.reduce((sum, choice) => sum + choice.weight, 0);
  for (const choice of participants) {
    const entry = state.attacks.get(choice.key);
    if (entry) entry.credit += choice.weight - (choice.key === chosenKey ? total : 0);
  }
  state.activeKey = chosenKey;
}

export function startAttackCooldown(entity, attack, duration, now = combatNow()) {
  const state = runtime(entity);
  const key = attackSelectionKey(attack);
  const entry = state.attacks.get(key) || { credit: 0 };
  const restarted = entity._interruptedAttackKey === key;
  delete entity._interruptedAttackKey;
  if (!restarted) Object.assign(entry, { lastUsedAt: now, readyAt: now + Math.max(0, Number(duration) || 0), sleepCheckedAt: now });
  state.attacks.set(key, entry);
  state.activeKey = key;
  notifyAttackSelection(entity, 'cooldown-start');
  notifyCombatAction();
  return entry.readyAt;
}

export function resetAttackSelectionRuntime() {
  runtimes.clear();
  notifyAttackSelection(null);
}

// Attack definitions, fixed ratios, natures and entity-owned instances.
export function normArr(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "string") return [value].filter(Boolean);
  return [];
}

export function getAttackResolutionFlags(attack = {}) {
  const ranges = normArr(attack.attackRange);
  const nature = getAttackNatureRules(attack);
  const natures = nature.natures;

  const isRange =
    ranges.includes("range") ||
    ranges.includes("ranged") ||
    ranges.includes("distance");
  const isMelee = ranges.includes("melee") || ranges.length === 0;

  const hasPhysical = natures.includes("physicalDamage");
  const hasMagical = natures.includes("magicalDamage");
  const hasHybridal = natures.includes("hybridalDamage");
  const hasPiercing =
    natures.includes("piercingDamage") ||
    natures.includes("transpiercingDamage");

  const natureCount =
    Number(hasPhysical) +
    Number(hasMagical) +
    Number(hasHybridal) +
    Number(hasPiercing);

  const hasEssence = nature.profile.total > 0 && !attack.natureEffectSecondary;
  const isPurePhysical = hasPhysical && natureCount === 1 && hasEssence;
  const isPureMagical = hasMagical && natureCount === 1 && hasEssence;
  const isPureHybridal = hasHybridal && natureCount === 1;
  const isPurePiercing = hasPiercing && natureCount === 1 && hasEssence;
  const canBrokenSpell = isPureMagical && attack.combatFunction === 'Attaquant'
    && !normArr(attack.deadTarget).includes('yes');

  const hasPhysicalBehavior =
    hasPhysical ||
    hasHybridal ||
    hasPiercing;

  const hasMagicalBehavior =
    hasMagical ||
    hasHybridal;

  return {
    ranges,
    natures,

    isMelee,
    isRange,

    hasPhysical,
    hasMagical,
    hasHybridal,
    hasPiercing,

    isPurePhysical,
    isPureMagical,
    isPureHybridal,
    isPurePiercing,

    // =========================
    // ARCHETYPES
    // =========================
    isPurePhysicalBrutality: isPurePhysical,
    isPureMagicalPsionique: isPureMagical,
    isPureMagicalIntellect: isPureMagical,
    isTranspiercing: isPurePiercing,

    hasPhysicalBehavior,
    hasMagicalBehavior,

    // =========================
    // ATTACK ENTITES
    // =========================
    canMissAccuracy: false,

    isUndodgeable: attack.isUndodgeable === true || (hasMagical && !hasPhysicalBehavior),
    canBeDodged: attack.combatFunction !== 'Support' && attack.isUndodgeable !== true
      && !(hasMagical && !hasPhysicalBehavior),

    canBrokenSpell,
    brokenSpellMode: canBrokenSpell
      ? isRange
        ? "range_self"
        : isMelee
          ? "melee_double"
          : null
      : null,

    canAmbidextry: !attack.natureEffectSecondary,

    // =========================
    // APPLY DAMAGE
    // =========================
    canCrit: (!attack.natureEffectSecondary || attack.criticalExplosion === true)
      && !normArr(attack.type).includes('alteration'),

    canBloodFuryExec:
      isMelee && !attack.natureEffectSecondary,

    canBloodFuryLifesteal:
      !attack.natureEffectSecondary,

	canBloodThirsty:
	  !attack.natureEffectSecondary || attack.criticalBurn === true || attack.criticalExplosion === true,
  
    canBypassArmorGate: isPurePiercing,
    armorBypassPercent: nature.armorBypassPercent,
    applyRangeRatio: isRange && nature.key !== 'prism' && (hasPhysicalBehavior || nature.isInert),
    applyRangeRatioToPiercing: isRange && nature.key !== 'prism' && hasPiercing,
    applyRangeRatioToPhysical: isRange && nature.key !== 'prism' && (hasPhysical || hasHybridal || nature.isInert),
    applyRangeRatioToHybridPhysicalHalf: isRange && nature.key !== 'prism' && hasHybridal,

    applyEsoterismToMagical: hasMagical,
    applyEsoterismToHybridMagicalHalf: hasHybridal,
  };
}



function readAttackPowerRatio(attack, field) {
  if (!Object.prototype.hasOwnProperty.call(attack, field)) return undefined;
  const value = attack[field];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new TypeError(`Ratio invalide ${field} pour ${readAttackDefinitionKey(attack) || 'attaque'} : ${value}`);
  }
  return value;
}

export function getAttackPowerRatios(attack = {}) {
  return Object.fromEntries(Object.entries(ATTACK_POWER_RATIO_FIELDS)
    .map(([source, field]) => [source, readAttackPowerRatio(attack, field) ?? 0]));
}

export function isAttackSublime(attack = {}) {
  const { colors } = getAttackNatureRules(attack);
  const ratios = getAttackPowerRatios(attack);
  return colors.length > 0 && [
    ['physical', 'red'], ['magical', 'blue'], ['piercing', 'yellow'],
  ].every(([source, color]) => (ratios[source] > 0) === colors.includes(color));
}

export function initializeAttackPowerRatios(attack, { random = Math.random } = {}) {
  const fields = Object.values(ATTACK_POWER_RATIO_FIELDS);
  const declared = fields.map(field => readAttackPowerRatio(attack, field));
  if (normArr(attack.attacknature).includes('inerte') && declared.every(value => value === undefined)) {
    throw new TypeError(`Ratios explicites requis pour l'attaque Inerte ${readAttackDefinitionKey(attack) || ''}`);
  }
  if (declared.every(value => value !== undefined)) return attack;

  const colors = getAttackEssenceColorsFromNatures(attack.attacknature);
  const nativeColors = ['red', 'blue', 'yellow'];
  const missing = fields.filter((field, index) => declared[index] === undefined && colors.includes(nativeColors[index]));
  const fractions = declared.filter(value => value !== undefined).map(decimalFraction);
  // Complete the original definition once, preserving explicit zeros and decimal precision.
  const unit = fractions.reduce((largest, part) => part.denominator > largest ? part.denominator : largest, 10n);
  const used = fractions.reduce((sum, part) => sum + part.units * (unit / part.denominator), 0n);
  const remainder = used < unit ? unit - used : 0n;
  const ratios = Object.fromEntries(fields.map((field, index) => [field, declared[index] ?? 0]));
  if (missing.length && remainder > 0n) {
    const count = BigInt(missing.length);
    const share = remainder / count;
    const extra = Number(remainder % count);
    if (extra) {
      for (let index = missing.length - 1; index > 0; index--) {
        const other = Math.floor(random() * (index + 1));
        [missing[index], missing[other]] = [missing[other], missing[index]];
      }
    }
    const places = unit.toString().length - 1;
    missing.forEach((field, index) => {
      ratios[field] = Number(`${share + (index < extra ? 1n : 0n)}e-${places}`);
    });
  }
  Object.assign(attack, ratios);
  return attack;
}

export function readAttackDefinitionKey(value) {
  if (value && typeof value === "object") {
    return String(
      value.key ||
      value.attackKey ||
      value.templateKey ||
      value.functionName ||
      value.attackId ||
      value.displayName ||
      ""
    ).trim();
  }

  return String(value || "").trim();
}









function normalizeAttackEssenceContentSource(source = "") {
  return String(source || "");
}

function readLinkedAttackEssenceColor(slot = {}) {
  return normalizeAttackEssenceColor(slot?.color);
}





function hasOwn(value, key) {
  return Boolean(value && Object.prototype.hasOwnProperty.call(value, key));
}

function normalizeEssenceLookupKey(value) {
  return String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function pushUnique(target, value) {
  if (value && !target.includes(value)) target.push(value);
}

export function normalizeAttackEssenceColor(value) {
  if (value && typeof value === "object") {
    const fromEssence = value.essence && typeof value.essence === "object"
      ? value.essence.color
        ?? value.essence.essenceColor
        ?? value.essence.nature
        ?? value.essence.key
        ?? value.essence.type
      : value.essence;

    return normalizeAttackEssenceColor(
      value.color
      ?? value.essenceColor
      ?? fromEssence
      ?? value.nature
      ?? value.attacknature
      ?? value.attackNature
      ?? value.stat
      ?? value.key
      ?? value.type
    );
  }

  const lookup = normalizeEssenceLookupKey(value);
  return ATTACK_ESSENCE_COLOR_ALIASES[lookup] || "";
}

function normalizeAttackEssenceEntries(value) {
  const values = Array.isArray(value) ? value : [value];
  return values
    .map(entry => normalizeAttackEssenceColor(entry))
    .filter(Boolean);
}

export function getAttackEssenceColorsFromNatures(natures = []) {
  const colors = [];
  normArr(natures).forEach(nature => {
    const mapped = ATTACK_NATURE_TO_ESSENCE_COLORS[nature];
    if (mapped) {
      mapped.forEach(color => pushUnique(colors, color));
      return;
    }

    pushUnique(colors, normalizeAttackEssenceColor(nature));
  });

  return colors;
}

function resolveAttackNaturesFromEssenceColors(colors = [], fallbackNatures = []) {
  const activeColors = normalizeAttackEssenceEntries(colors);
  if (!activeColors.length) return ['inerte'];

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

  return normalizeAttackArrayValue(fallbackNatures);
}

// Nature chooses properties; the existing damage and defense calculators remain authoritative.
export function getAttackNatureRules(attack = {}) {
  attack = attack || {};
  const profile = getAttackEssenceProfile(attack);
  const colors = ['red', 'blue', 'yellow'].filter(color => profile[color] > 0);
  const pure = colors.length === 1 ? colors[0] : null;
  const level = pure ? Math.min(balanceData.attackPurity.maxLevel, profile.total) : 0;
  const combinationLevel = colors.length ? Math.min(...colors.map(color => profile[color])) : 0;
  const progress = level ? (level - 1) / (balanceData.attackPurity.maxLevel - 1) : 0;
  const cfg = balanceData.attackNature;
  const support = attack.combatFunction === 'Support';
  const secondary = Boolean(attack.natureEffectSecondary);
  const natures = secondary ? normArr(attack.attacknature)
    : resolveAttackNaturesFromEssenceColors(colors);
  const key = !colors.length ? 'none' : pure || (colors.length === 3 ? 'prism'
    : !profile.yellow ? 'hybrid' : profile.red ? 'physical-piercing' : 'magical-piercing');
  const [label, stat] = {
    none: ['Inerte', 'inerte'], red: ['Physique', 'physicalDamage'],
    blue: ['Magique', 'magicalDamage'], yellow: ['Transperçante', 'transpiercingDamage'],
    hybrid: ['Hybride', 'hybridalDamage'], prism: ['Prismatique', 'hybridalPiercingDamage'],
    'physical-piercing': ['Cinétique', 'physicalPiercingDamage'],
    'magical-piercing': ['Spectrale', 'magicalPiercingDamage'],
  }[key];
  let signature = null;
  if (!secondary && colors.length > 1) {
    if (key === 'hybrid') signature = { key: 'resonance', label: 'Résonance', stat, level: combinationLevel };
    else if (key === 'prism') signature = {
      key: support ? 'effusion' : 'discharge', label: support ? 'Effusion convergente' : 'Décharge convergente',
      stat, level: combinationLevel, percent: cfg.convergence.percent + (combinationLevel - 1) * cfg.convergence.perLevel,
    };
    else {
      const base = profile.red ? 'rupture' : 'dissolution';
      const id = support ? profile.red ? 'consolidation' : 'cohesion' : base;
      signature = { ...cfg[base], key: id, label: { rupture: 'Rupture', dissolution: 'Dissolution', consolidation: 'Consolidation', cohesion: 'Cohésion' }[id],
        stat, level: combinationLevel, cap: support ? cfg[base].supportCap : cfg[base].cap,
        amount: cfg[base].amount + (combinationLevel - 1) * cfg[base].perLevel,
        resistance: profile.red ? 'physicalResistance' : 'magicalResistance', sign: support ? 1 : -1 };
    }
  }
  return { profile, colors, pure, level, combinationLevel, key, label, stat, natures, signature,
    isInert: !secondary && colors.length === 0,
    purityBonus: !secondary && pure && pure !== 'yellow'
      ? Math.ceil(progress * balanceData.attackPurity.maxBaseBonus)
      : 0,
    armorBypassPercent: !secondary && pure === 'yellow' ? Math.min(100, level * cfg.armorBypassPerLevel) : 0,
    agilityDamageRatio: !secondary && pure === 'yellow' ? (cfg.transpiercingAgility.minPercent + progress * (cfg.transpiercingAgility.maxPercent - cfg.transpiercingAgility.minPercent)) / 100 : 0,
    recoveryExtra: !secondary && profile.yellow ? (Math.min(10, profile.yellow) - 1) * cfg.recoveryExtraMax / 9 : 0,
    overloadReduction: !secondary && pure === 'blue' ? progress * cfg.overloadReductionMax : 0,
  };
}

function decimalFraction(value) {
  const [mantissa, exponent = '0'] = String(value).split('e');
  const places = (mantissa.split('.')[1]?.length || 0) - Number(exponent);
  const units = BigInt(mantissa.replace('.', ''));
  return { units: places < 0 ? units * 10n ** BigInt(-places) : units, denominator: places > 0 ? 10n ** BigInt(places) : 1n };
}

export function getAttackResonance(attack, physicalPower, magicalPower) {
  const nature = getAttackNatureRules(attack);
  const cfg = balanceData.attackNature.resonance;
  const physical = Number.isFinite(Number(physicalPower)) ? Math.max(0, Number(physicalPower)) : 0;
  const magical = Number.isFinite(Number(magicalPower)) ? Math.max(0, Number(magicalPower)) : 0;
  const proximity = Math.max(physical, magical) > 0 ? Math.min(physical, magical) / Math.max(physical, magical) : 0;
  const eligible = nature.signature?.key === 'resonance' && physical > 0 && magical > 0 && proximity >= cfg.threshold;
  const perfect = eligible && physical === magical;
  const cap = cfg.normalCap + (nature.combinationLevel - 1) * cfg.capPerLevel;
  const percent = !eligible ? 0 : perfect ? cap + cfg.perfectJump
    : cfg.startPercent + (cap - cfg.startPercent) * (proximity - cfg.threshold) / (1 - cfg.threshold);
  const reference = nature.profile.total ? (physical * nature.profile.red + magical * nature.profile.blue) / nature.profile.total : 0;
  let bonus = 0;
  if (eligible) {
    // Decimal arithmetic until the final floor avoids losing one point at exact boundaries.
    const pp = decimalFraction(physical), pm = decimalFraction(magical);
    const unit = pp.denominator > pm.denominator ? pp.denominator : pm.denominator;
    const p = pp.units * (unit / pp.denominator), m = pm.units * (unit / pm.denominator);
    const min = p < m ? p : m, max = p > m ? p : m;
    const threshold = decimalFraction(cfg.threshold);
    const rates = [cfg.startPercent, cap, cfg.perfectJump].map(decimalFraction);
    const rateUnit = rates.reduce((largest, rate) => rate.denominator > largest ? rate.denominator : largest, 1n);
    const [start, ceiling, jump] = rates.map(rate => rate.units * (rateUnit / rate.denominator));
    const span = threshold.denominator - threshold.units;
    const numerator = perfect ? ceiling + jump
      : start * span * max + (ceiling - start) * (threshold.denominator * min - threshold.units * max);
    const denominator = perfect ? rateUnit : rateUnit * span * max;
    bonus = Number((p * BigInt(nature.profile.red) + m * BigInt(nature.profile.blue)) * numerator
      / (unit * BigInt(nature.profile.total) * denominator * 100n));
  }
  return { eligible, perfect, proximity, percent, bonus, reference };
}

export function splitAttackNatureAmount(attack, amount) {
  return splitDamageByNature(getAttackNatureRules(attack), amount);
}

// A single dodge removes only the non-magical part of an impact.
export function splitDodgeDamageSources(sources) {
  const physical = Math.max(0, Number(sources.physical) || 0);
  const magical = Math.max(0, Number(sources.magical) || 0);
  const piercing = Math.max(0, Number(sources.piercingDamage) || 0);
  const hybrid = Math.max(0, Number(sources.hybridalDamage) || 0);
  const split = balanceData.resistance.hybrid.splitRatio;
  return {
    avoided: { physical: physical + hybrid * split, magical: 0, piercingDamage: piercing, hybridalDamage: 0 },
    remaining: { physical: 0, magical: magical + hybrid * (1 - split), piercingDamage: 0, hybridalDamage: 0 },
  };
}

function readAttackTemplateKey(attack) {
  return String(
    attack?.templateKey
    || attack?.attackKey
    || attack?.functionName
    || readAttackDefinitionKey(attack)
    || ""
  ).trim();
}

function sanitizeAttackInstanceSegment(value, fallback) {
  const normalized = String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || fallback;
}

function buildEntityAttackInstanceId(entity, attack, index = 0) {
  const owner = sanitizeAttackInstanceSegment(
    entity?.id
    ?? entity?.uid
    ?? entity?.serial
    ?? entity?.class
    ?? entity?.name,
    "entity"
  );
  const attackKey = sanitizeAttackInstanceSegment(
    readAttackTemplateKey(attack),
    `attack-${index + 1}`
  );

  return `entityAttack-${owner}-${attackKey}-${index + 1}`;
}

function isAttackFamilySlotSource(slot) {
  return slot?.source === ATTACK_ESSENCE_SLOT_SOURCES.INITIAL_FAMILY;
}

function getInitialAttackFamilyColors(attack) {
  const colors = getAttackEssenceColorsFromNatures(attack?.attacknature);
  return colors.slice(0, ATTACK_ESSENCE_MAX_SLOTS);
}

function getDefaultAttackEssenceContentSource(slot = {}, color = "") {
  if (slot.essenceSource) return normalizeAttackEssenceContentSource(slot.essenceSource);
  if (!color) return "";

  return ATTACK_ESSENCE_CONTENT_SOURCES.LINKED;
}

function getAttackEssenceColorConfig(attack, options = {}) {
  if (Array.isArray(attack.essenceSlots)) {
    return { colors: attack.essenceSlots.map(slot => normalizeAttackEssenceColor(slot?.color)).filter(Boolean), source: ATTACK_ESSENCE_SLOT_SOURCES.CONFIGURED };
  }
  if (hasOwn(attack, "essences")) {
    return {
      colors: normalizeAttackEssenceEntries(attack.essences),
      source: ATTACK_ESSENCE_SLOT_SOURCES.CONFIGURED,
    };
  }

  if (hasOwn(attack, "defaultEssences")) {
    return {
      colors: normalizeAttackEssenceEntries(attack.defaultEssences),
      source: "template",
    };
  }

  return {
    colors: getInitialAttackFamilyColors(attack),
    source: ATTACK_ESSENCE_SLOT_SOURCES.INITIAL_FAMILY,
  };
}

function normalizeAttackEssenceSlots(rawSlots, colors = [], source = ATTACK_ESSENCE_SLOT_SOURCES.CONFIGURED) {
  if (typeof rawSlots === "number") {
    const count = Math.min(ATTACK_ESSENCE_MAX_SLOTS, Math.max(0, Math.floor(rawSlots)));
    return Array.from({ length: count }, (_, index) => ({
      slotId: `slot-${index + 1}`,
      kind: "open",
      locked: false,
      color: colors[index] || null,
      source,
    }));
  }

  if (Array.isArray(rawSlots)) {
    const slots = rawSlots.slice(0, ATTACK_ESSENCE_MAX_SLOTS).map((slot, index) => {
      if (slot && typeof slot === "object") {
        const color = normalizeAttackEssenceColor(slot);
        const rawKind = String(slot.kind || slot.type || "open");
        const slotSource = slot.source || source;
        const slotKind = rawKind;
        const essenceSource = getDefaultAttackEssenceContentSource({
          ...slot,
          kind: slotKind,
          source: slotSource,
        }, color);
        const linkedColor = normalizeAttackEssenceColor(
          readLinkedAttackEssenceColor(slot) ||
          (
            isAttackFamilySlotSource({ ...slot, source: slotSource })
              ? color
              : ""
          )
        );
        const essenceId = String(slot.essenceId || "").trim();

        return {
          slotId: String(slot.slotId || slot.id || `slot-${index + 1}`),
          ...(slot.socketId ? { socketId: String(slot.socketId) } : {}),
          kind: slotKind,
          locked: typeof slot.locked === "boolean" ? slot.locked : Boolean(slot.locked),
          color: color || null,
          ...(slot.active === false ? { active: false } : {}),
          ...(slot.hyperco && color === 'blue' ? { hyperco: true } : {}),
          source: slotSource,
          essenceSource,
          linkedColor,
          ...(color && essenceId ? { essenceId } : {}),
          ...(slot.unlockId ? { unlockId: slot.unlockId } : {}),
        };
      }

      const color = normalizeAttackEssenceColor(slot) || colors[index] || "";
      return {
        slotId: `slot-${index + 1}`,
        kind: "open",
        locked: false,
        color: color || null,
        source,
        essenceSource: color ? getDefaultAttackEssenceContentSource({ source }, color) : "",
        linkedColor: isAttackFamilySlotSource({ source }) ? color || "" : "",
      };
    }).filter(slot => !(
      slot.source === ATTACK_ESSENCE_SLOT_SOURCES.EMPTY &&
      !slot.color &&
      !slot.unlockId
    ));

    const baseLength = slots.length;
    colors.slice(baseLength, ATTACK_ESSENCE_MAX_SLOTS).forEach((color, offset) => {
      slots.push({
        slotId: `slot-${baseLength + offset + 1}`,
        kind: "open",
        locked: false,
        color,
        source,
        essenceSource: color ? getDefaultAttackEssenceContentSource({ source }, color) : "",
        linkedColor: isAttackFamilySlotSource({ source }) ? color || "" : "",
      });
    });

    return slots;
  }

  return colors.slice(0, ATTACK_ESSENCE_MAX_SLOTS).map((color, index) => ({
    slotId: `slot-${index + 1}`,
    kind: "open",
    locked: false,
    color,
    source,
    essenceSource: color ? getDefaultAttackEssenceContentSource({ source }, color) : "",
    linkedColor: isAttackFamilySlotSource({ source }) ? color || "" : "",
  }));
}

export function getAttackEssenceProfile(attack = {}) {
  const colors = Array.isArray(attack.essenceSlots)
    ? attack.essenceSlots.filter(slot => slot?.active !== false).slice(0, 10).map(slot => normalizeAttackEssenceColor(slot?.color)).filter(Boolean)
    : hasOwn(attack, 'essences')
      ? normalizeAttackEssenceEntries(attack.essences).slice(0, ATTACK_ESSENCE_MAX_SLOTS)
      : getAttackEssenceColorsFromNatures(attack.attacknature);

  return colors.reduce((profile, color) => {
    profile[color] = (profile[color] || 0) + 1;
    profile.total += 1;
    return profile;
  }, {
    [ATTACK_ESSENCE_COLORS.RED]: 0,
    [ATTACK_ESSENCE_COLORS.BLUE]: 0,
    [ATTACK_ESSENCE_COLORS.YELLOW]: 0,
    total: 0,
  });
}

function createAttackEssenceBaseProfile(attack = {}, entity = null) {
  const baseSlots = Array.isArray(attack.essenceSlots) ? attack.essenceSlots : [];
  const natures = [...new Set(normArr(attack.attacknature))];
  const essenceColors = baseSlots
    .map(slot => normalizeAttackEssenceColor(slot?.color))
    .filter(Boolean);
  const entityId = entity?.id ?? entity?.uid ?? entity?.serial ?? null;
  const attackKey = String(attack.entityAttackId || attack.attackKey || attack.templateKey || "attack");
  const profile = {
    version: 1,
    id: `${attackKey}:base`,
    source: "entity-attack-base",
    capture: "initial-generation",
    entityId,
    attackKey,
    entityAttackId: String(attack.entityAttackId || ""),
    templateKey: String(attack.templateKey || ""),
    natures,
    essenceColors,
    slots: baseSlots.map((slot, index) => ({
      slotId: String(slot?.slotId || slot?.id || `slot-${index + 1}`),
      color: normalizeAttackEssenceColor(slot?.color) || null,
      source: String(slot?.source || ""),
      essenceSource: String(slot?.essenceSource || ""),
      kind: String(slot?.kind || "open"),
      locked: Boolean(slot?.locked),
    })),
    createdAt: clockNow(),
  };
  profile.line = [
    "source=entity-attack-base",
    `capture=${profile.capture}`,
    entityId !== null ? `entite=${entityId}` : "",
    `attaque=${attackKey}`,
    natures.length ? `natures=${natures.join(",")}` : "",
    essenceColors.length ? `essences=${essenceColors.join(",")}` : "",
  ].filter(Boolean).join(" | ");
  return profile;
}

function ensureAttackEssenceBaseProfile(attack = {}, entity = null) {
  if (
    attack.essenceBaseProfile &&
    typeof attack.essenceBaseProfile === "object" &&
    Array.isArray(attack.essenceBaseProfile.natures) &&
    Array.isArray(attack.essenceBaseProfile.essenceColors)
  ) {
    return attack.essenceBaseProfile;
  }

  attack.essenceBaseProfile = createAttackEssenceBaseProfile(attack, entity);
  return attack.essenceBaseProfile;
}

function syncAttackEssenceModel(attack, options = {}) {
  if (!attack || typeof attack !== "object") return attack;

  attack.entityAttackModelVersion = 1;
  attack.attackKey ||= attack.functionName || readAttackDefinitionKey(attack);
  attack.templateKey ||= attack.functionName || attack.attackKey || attack.attackId || null;
  attack.entityAttackId ||= buildEntityAttackInstanceId(options.entity, attack, options.index || 0);

  const { colors, source } = getAttackEssenceColorConfig(attack, options);
  const hasConfiguredSlots = hasOwn(attack, "essenceSlots");
  const hasDefaultSlots = !hasConfiguredSlots && hasOwn(attack, "defaultEssenceSlots");
  const rawSlots = hasConfiguredSlots
    ? attack.essenceSlots
    : hasDefaultSlots
      ? attack.defaultEssenceSlots
      : undefined;
  const slotSource = hasConfiguredSlots
    ? ATTACK_ESSENCE_SLOT_SOURCES.CONFIGURED
    : hasDefaultSlots
      ? "template"
      : source;

  attack.essenceSlots = normalizeAttackEssenceSlots(rawSlots, colors, slotSource);
  if (!options.readOnly) {
    // Snapshot and allocate identities only on creation or a committed write.
    syncAttackMastery(options.entity, attack);
    ensureAttackEssenceBaseProfile(attack, options.entity);
    ensureEntityAttackEssenceIdentities(options.entity, attack);
  }
  attack.essences = attack.essenceSlots
    .filter(slot => slot.active !== false)
    .map(slot => normalizeAttackEssenceColor(slot?.color))
    .filter(Boolean);
  attack.essenceSlotCount = attack.essenceSlots.length;
  attack.essenceProfile = getAttackEssenceProfile(attack);
  attack.attacknature = resolveAttackNaturesFromEssenceColors(attack.essences, attack.attacknature);

  return attack;
}

function cloneAttackPlainData(value) {
  if (!value || typeof value !== "object") return value;
  try {
    if (typeof structuredClone === "function") return structuredClone(value);
  } catch {}

  return JSON.parse(JSON.stringify(value));
}

export function normalizeAttackArrayValue(value) {
  if (Array.isArray(value)) {
    return value
      .map(entry => String(entry ?? "").trim())
      .filter(Boolean);
  }

  const normalized = String(value ?? "").trim();
  return normalized ? [normalized] : [];
}

function findCatalogAttackDefinition(value, catalog = []) {
  const key = readAttackDefinitionKey(value);
  if (!key || !Array.isArray(catalog)) return null;

  return catalog.find(candidate => (
    readAttackDefinitionKey(candidate) === key ||
    candidate?.functionName === key ||
    candidate?.attackId === key ||
    candidate?.displayName === key
  )) || null;
}

function collectEntityAttackOverrides(entity) {
  const overrides = [];
  const raw = entity?.attackDetails;

  if (Array.isArray(raw)) {
    raw.forEach(entry => {
      if (entry && typeof entry === "object") overrides.push(entry);
    });
  } else if (raw && typeof raw === "object") {
    Object.values(raw).forEach(entry => {
      if (entry && typeof entry === "object") overrides.push(entry);
    });
  }

  return overrides;
}

function getAttackModifierLayerName(layer, durationMs = null) {
  const normalized = String(layer || "").trim().toLowerCase();
  if (normalized === ENTITY_ATTACK_MODIFIER_LAYERS.DURABLE) {
    return ENTITY_ATTACK_MODIFIER_LAYERS.DURABLE;
  }
  if (normalized === ENTITY_ATTACK_MODIFIER_LAYERS.TEMPORARY) {
    return ENTITY_ATTACK_MODIFIER_LAYERS.TEMPORARY;
  }
  return Number.isFinite(Number(durationMs))
    ? ENTITY_ATTACK_MODIFIER_LAYERS.TEMPORARY
    : ENTITY_ATTACK_MODIFIER_LAYERS.DURABLE;
}

function ensureEntityAttackModifierLayer(entity, layer) {
  entity.modifierAttacks ??= {};
  entity.modifierAttacks[layer] ??= {};
  entity.modifierAttacks[layer].byId ??= {};
  return entity.modifierAttacks[layer].byId;
}

function normalizeAttackPatch(patch = {}) {
  if (!patch || typeof patch !== "object") return {};

  const clone = cloneAttackPlainData(patch) || {};
  ATTACK_RUNTIME_STATE_KEYS.forEach(key => {
    delete clone[key];
  });

  ATTACK_ARRAY_KEYS.forEach(key => {
    if (clone[key] !== undefined) {
      clone[key] = normalizeAttackArrayValue(clone[key]);
    }
  });

  if (clone.effets && clone.effets.length > 1 && clone.effets.includes("none")) {
    clone.effets = clone.effets.filter(value => value !== "none");
  }

  return clone;
}

function attackPatchHasEssenceFields(patch = {}) {
  return [
    "essences",
    "defaultEssences",
    "essenceSlots",
    "defaultEssenceSlots",
  ].some(key => hasOwn(patch, key));
}

function getAttackModifierSourceId(sourceId, attackKey, layer) {
  const normalized = String(sourceId || "").trim();
  if (normalized) return normalized;
  return `${layer}:${attackKey || "attack"}:${clockNow()}:${Math.random().toString(36).slice(2)}`;
}

export function clearExpiredEntityAttackModifiers(entity, now = clockNow()) {
  if (!entity?.modifierAttacks) return 0;

  let removed = 0;
  Object.values(ENTITY_ATTACK_MODIFIER_LAYERS).forEach(layer => {
    const byId = entity.modifierAttacks?.[layer]?.byId;
    if (!byId || typeof byId !== "object") return;

    Object.entries(byId).forEach(([sourceId, source]) => {
      const expiresAt = Number(source?.expiresAt);
      if (!Number.isFinite(expiresAt) || expiresAt > now) return;
      delete byId[sourceId];
      removed += 1;
    });
  });

  if (removed) {
    refreshEntityAttackTraits(entity);
    refreshEntityCurrentAttackDefinition(entity);
    notifyAttackSelection(entity);
  notifyCombatAction();
  }
  return removed;
}

var modifierExpiryTimers;
function scheduleAttackModifierExpiry(entity) {
  // Entity templates may reach this function before this module is evaluated.
  modifierExpiryTimers ??= new WeakMap();
  clearTimeout(modifierExpiryTimers.get(entity));
  modifierExpiryTimers.delete(entity);
  const deadlines = Object.values(entity.modifierAttacks || {})
    .flatMap(layer => Object.values(layer?.byId || {}))
    .map(source => Number(source.expiresAt)).filter(Number.isFinite);
  if (!deadlines.length) return;
  const timer = setTimeout(() => {
    clearExpiredEntityAttackModifiers(entity);
    scheduleAttackModifierExpiry(entity);
  }, Math.min(2147483647, Math.max(1, Math.min(...deadlines) - clockNow())));
  modifierExpiryTimers.set(entity, timer);
}

function collectEntityAttackModifierPatches(entity, attackKey, now = clockNow()) {
  if (!entity?.modifierAttacks) return [];

  clearExpiredEntityAttackModifiers(entity, now);

  const patches = [];
  [
    ENTITY_ATTACK_MODIFIER_LAYERS.DURABLE,
    ENTITY_ATTACK_MODIFIER_LAYERS.TEMPORARY,
  ].forEach(layer => {
    const byId = entity.modifierAttacks?.[layer]?.byId;
    if (!byId || typeof byId !== "object") return;

    Object.values(byId)
      .filter(source => source && typeof source === "object")
      .filter(source => {
        const key = String(source.attackKey || "").trim();
        return key === "*" || key === attackKey;
      })
      .sort((first, second) => (
        Number(first.priority || 0) - Number(second.priority || 0)
        || Number(first.createdAt || 0) - Number(second.createdAt || 0)
      ))
      .forEach(source => {
        patches.push(normalizeAttackPatch(source.patch || {}));
      });
  });

  return patches;
}

function mergeAttackPatches(...patches) {
  const merged = Object.assign({}, ...patches);
  merged.effectOverrides = {};
  for (const patch of patches) for (const [name, effect] of Object.entries(patch?.effectOverrides || {})) {
    merged.effectOverrides[name] = { ...merged.effectOverrides[name], ...effect };
  }
  merged.selfEffectOverrides = {};
  for (const patch of patches) for (const [name, effect] of Object.entries(patch?.selfEffectOverrides || {}))
    merged.selfEffectOverrides[name] = { ...merged.selfEffectOverrides[name], ...effect };
  return merged;
}

export function normalizeAttackDefinitionForEntity(value, catalog = [], options = {}) {
  const catalogAttack = value?.entityAttackId ? null : findCatalogAttackDefinition(value, catalog);
  const sourceAttack = value && typeof value === "object"
    ? cloneAttackPlainData({ ...(catalogAttack || {}), ...value })
    : (catalogAttack ? cloneAttackPlainData(catalogAttack) : null);

  if (!sourceAttack || typeof sourceAttack !== "object") return null;

  if (options.stripRuntime !== false) {
    ATTACK_RUNTIME_STATE_KEYS.forEach(key => {
      delete sourceAttack[key];
    });
  }

  ATTACK_ARRAY_KEYS.forEach(key => {
    if (sourceAttack[key] !== undefined) {
      sourceAttack[key] = normalizeAttackArrayValue(sourceAttack[key]);
    }
  });

  sourceAttack.attackTarget = normalizeAttackArrayValue(sourceAttack.attackTarget);
  sourceAttack.attackRange = normalizeAttackArrayValue(sourceAttack.attackRange);
  sourceAttack.attacknature = normalizeAttackArrayValue(sourceAttack.attacknature);
  sourceAttack.effets = normalizeAttackArrayValue(sourceAttack.effets);
  sourceAttack.selfEffects = normalizeAttackArrayValue(sourceAttack.selfEffects);
  sourceAttack.deadTarget = normalizeAttackArrayValue(sourceAttack.deadTarget);
  sourceAttack.attackKey ||= sourceAttack.functionName;

  if (!sourceAttack.effets.length) sourceAttack.effets = ["none"];

  assertAttackCombatDefinition(sourceAttack);
  if (!options.readOnly && !sourceAttack.entityAttackId && !sourceAttack.attacknature.length && !attackPatchHasEssenceFields(sourceAttack)) {
    const colors = Object.entries(ATTACK_POWER_RATIO_FIELDS).map(([power, field]) =>
      Number(sourceAttack[field]) > 0 ? { physical: 'red', magical: 'blue', piercing: 'yellow' }[power] : null).filter(Boolean);
    if (colors.length) sourceAttack.attacknature = resolveAttackNaturesFromEssenceColors(colors);
  }
  if (!options.readOnly) initializeAttackPowerRatios(sourceAttack);
  resolveAttackEffects(sourceAttack);
  return options.readOnly && !options.projectEssences ? sourceAttack : syncAttackEssenceModel(sourceAttack, options);
}

function findEntityAttackSource(entity, value, catalog) {
  const key = readAttackDefinitionKey(value);
  const matches = candidate => {
    if (!candidate || typeof candidate !== "object") return false;
    return readAttackDefinitionKey(candidate) === key ||
      candidate.functionName === key ||
      candidate.attackId === key ||
      candidate.displayName === key;
  };

  const override = collectEntityAttackOverrides(entity).find(matches);
  // The catalogue initializes templates only. Owned instances are complete and
  // never inherit a later catalogue change during gameplay.
  const source = override || (value && typeof value === 'object' ? value : null)
    || (!Array.isArray(entity?.attackDetails) ? findCatalogAttackDefinition(value, catalog) : null);
  return { key, override, source };
}

// The HUD only needs these two fields. Keep the same source/patch precedence
// and expiry boundary without cloning and normalizing an entire combat attack.
export function resolveEntityAttackDisplayName(entity, value, catalog = []) {
  if (value && typeof value === 'object') {
    const attack = resolveAttackDefinitionForEntity(entity, value, catalog);
    return attack?.displayName || attack?.name || '...';
  }
  const { key, source } = findEntityAttackSource(entity, value, catalog);
  if (!source) return '...';
  let { displayName, name } = source;
  for (const patch of collectEntityAttackModifierPatches(entity, key)) {
    if (Object.hasOwn(patch, 'displayName')) displayName = patch.displayName;
    if (Object.hasOwn(patch, 'name')) name = patch.name;
  }
  return displayName || name || '...';
}

export function resolveAttackDefinitionForEntity(entity, value, catalog = [], options = {}) {
  const { key, override, source } = findEntityAttackSource(entity, value, catalog);
  if (!source) return null;
  const modifierPatches = options.includeModifiers === false
    ? []
    : collectEntityAttackModifierPatches(entity, key);
  const hasEssenceModifierPatch = modifierPatches.some(attackPatchHasEssenceFields);
  const resolutionOptions = {
    ...options,
    entity,
    readOnly: true,
    projectEssences: hasEssenceModifierPatch,
    preferConfiguredEssences:
      options.preferConfiguredEssences === true || hasEssenceModifierPatch,
  };

  if (value && typeof value === "object") {
    const hasRuntimeState = ATTACK_RUNTIME_STATE_KEYS.some(key =>
      Object.prototype.hasOwnProperty.call(value, key)
    );

    if (hasRuntimeState) {
      return normalizeAttackDefinitionForEntity(mergeAttackPatches(source, ...modifierPatches, value), [], { ...resolutionOptions, stripRuntime: false });
    }

    return normalizeAttackDefinitionForEntity(mergeAttackPatches(source, value, override || {}, ...modifierPatches), [], resolutionOptions);
  }

  return normalizeAttackDefinitionForEntity(mergeAttackPatches(source, ...modifierPatches), [], resolutionOptions);
}

export function readAttackDefinitionsForEntity(entity, catalog = [], options = {}) {
  const result = [];
  const seen = new Set();

  const add = value => {
    // Normalization allocates native essence IDs; skip duplicate references first.
    const sourceKey = readAttackDefinitionKey(value);
    if (!sourceKey || seen.has(sourceKey)) return;
    const attack = resolveAttackDefinitionForEntity(entity, value, catalog, { ...options, index: result.length });
    if (!attack) return;

    const key = readAttackDefinitionKey(attack);
    if (!key || seen.has(key)) return;

    seen.add(key);
    seen.add(sourceKey);
    result.push(attack);
  };

  if (Array.isArray(entity?.attackDetails)) {
    entity.attackDetails.forEach(add);
  } else if (Array.isArray(entity?.attacks)) {
    entity.attacks.forEach(add);
  }

  return result;
}

export function readEntityCombatProfile(entity, catalog = []) {
  return analyzeEntityCombatProfile(entity, readAttackDefinitionsForEntity(entity, catalog));
}

function refreshEntityAttackTraits(entity) {
  const attacks = readAttackDefinitionsForEntity(entity);
  entity.attackEffectTypes = [...new Set(attacks.flatMap(attack => attack.effectTypes))];
  const functions = new Set(attacks.map(attack => attack.combatFunction));
  entity.classe = functions.size > 1 ? 'Arbitre' : attacks[0]?.combatFunction;
  entity.canTargetDead = attacks.some(attack => attack.deadTarget.includes('yes'));
}

export function refreshEntityCurrentAttackDefinition(entity, catalog = [], options = {}) {
  if (!entity) return null;

  const preferred = options.preferredAttack
    ?? entity.currentAttack
    ?? entity.currentAttackId
    ?? entity.attacks?.[0]
    ?? entity.attackDetails?.[0]
    ?? null;

  const preferredKey = readAttackDefinitionKey(preferred);
  const ownedPreferred = collectEntityAttackOverrides(entity).find(attack => readAttackDefinitionKey(attack) === preferredKey);
  const attack = resolveAttackDefinitionForEntity(entity, ownedPreferred?.attackKey || ownedPreferred?.functionName, catalog)
    || readAttackDefinitionsForEntity(entity, catalog)[0]
    || null;

  entity.currentAttackId = attack?.functionName || attack?.attackId || null;
  entity.currentAttack = attack || null;

  return attack;
}

export function setEntityAttackDefinitions(entity, nextAttacks = [], catalog = [], options = {}) {
  if (!entity) return [];

  const seen = new Set();
  const definitions = [];
  const previous = entity.attackDetails || [];
  const initialGeneration = !Array.isArray(entity.nativeAttacks);

  (Array.isArray(nextAttacks) ? nextAttacks : [nextAttacks]).forEach(value => {
    const sourceKey = readAttackDefinitionKey(findCatalogAttackDefinition(value, catalog) || value);
    if (!sourceKey || seen.has(sourceKey)) return;
    const existing = previous.find(attack => readAttackDefinitionKey(attack) === sourceKey);
    let input = value;
    if (!value?.entityAttackId && existing) input = typeof value === 'object'
      ? { ...existing, ...cloneAttackPlainData(value), entityAttackId: existing.entityAttackId,
        mastery: existing.mastery, essenceSlots: value.essenceSlots ?? existing.essenceSlots,
        essenceBaseProfile: existing.essenceBaseProfile } : existing;
    else if (!value?.entityAttackId && !initialGeneration) {
      const template = typeof value === 'object' ? value : findCatalogAttackDefinition(value, catalog);
      input = { ...cloneAttackPlainData(template), mastery: { points: 0 },
        essenceSlots: [{ slotId: 'slot-1', kind: 'open', color: getInitialAttackFamilyColors(template)[0] || null, source: 'initial-attack-family' }],
        entityAttackId: `entityAttack-${entity.id}-${crypto.randomUUID()}` };
    }
    const attack = normalizeAttackDefinitionForEntity(input, input?.entityAttackId ? [] : catalog, {
      ...options,
      entity,
      index: definitions.length,
    });
    const key = readAttackDefinitionKey(attack);
    if (!attack || !key || seen.has(key)) return;

    seen.add(key);
    seen.add(sourceKey);
    definitions.push(attack);
  });

  entity.attackDetails = definitions;
  const removedIds = new Set(previous.filter(old => !definitions.some(next => next.entityAttackId === old.entityAttackId)).map(old => old.entityAttackId));
  if (removedIds.size) {
    releaseRemovedAttackEssences(entity, removedIds);
    definitions.forEach(attack => syncAttackEssenceModel(attack, { entity }));
  }
  if (initialGeneration) entity.nativeAttacks = cloneAttackPlainData(definitions);
  entity.attacks = definitions
    .map(attack => attack.functionName || readAttackDefinitionKey(attack))
    .filter(Boolean);
  normalizeAttackSelection(entity, definitions);
  refreshEntityAttackTraits(entity);
  scheduleAttackModifierExpiry(entity);

  refreshEntityCurrentAttackDefinition(entity, catalog, {
    preferredAttack: options.preferredAttack,
  });
  notifyAttackSelection(entity);
  notifyCombatAction();

  return definitions;
}

export function ensureEntityAttackInstances(entity, catalog = [], options = {}) {
  if (!entity) return [];
  initializeEntityEssenceOwnership(entity);

  const owned = collectEntityAttackOverrides(entity);
  if (!owned.length || owned.some(attack => !attack.entityAttackId)) {
    const templates = (entity.attacks || []).map(ref => {
      const key = readAttackDefinitionKey(findCatalogAttackDefinition(ref, catalog) || ref);
      return owned.find(attack => readAttackDefinitionKey(attack) === key) || ref;
    });
    owned.forEach(attack => {
      if (!templates.some(ref => readAttackDefinitionKey(ref) === readAttackDefinitionKey(attack))) templates.push(attack);
    });
    return templates.length ? setEntityAttackDefinitions(entity, templates, catalog, options) : [];
  }

  const currentDefinitions = readAttackDefinitionsForEntity(entity, catalog, {
    includeModifiers: false,
  });
  const sourceAttacks = currentDefinitions;

  if (!sourceAttacks.length) return [];

  return setEntityAttackDefinitions(entity, sourceAttacks, catalog, {
    ...options,
    preferredAttack:
      options.preferredAttack
      ?? entity.currentAttack
      ?? entity.currentAttackId
      ?? sourceAttacks[0],
  });
}

export function updateEntityAttackDefinition(entity, attackRef, patch = {}, catalog = []) {
  if (!entity) return null;

  const currentAttacks = readAttackDefinitionsForEntity(entity, catalog, {
    includeModifiers: false,
  });
  const key = readAttackDefinitionKey(attackRef);
  const index = currentAttacks.findIndex(candidate => (
    readAttackDefinitionKey(candidate) === key ||
    candidate.functionName === key ||
    candidate.attackId === key ||
    candidate.displayName === key
  ));

  const baseAttack = index >= 0
    ? currentAttacks[index]
    : normalizeAttackDefinitionForEntity(attackRef, catalog, { entity, index: currentAttacks.length });

  if (!baseAttack) return null;

  const nextAttack = normalizeAttackDefinitionForEntity(
    mergeAttackPatches(baseAttack, patch),
    catalog,
    {
      entity,
      index: index >= 0 ? index : currentAttacks.length,
      preferConfiguredEssences: attackPatchHasEssenceFields(patch),
    }
  );
  if (!nextAttack) return null;

  const nextAttacks = currentAttacks.slice();
  if (index >= 0) nextAttacks[index] = nextAttack;
  else nextAttacks.push(nextAttack);

  setEntityAttackDefinitions(entity, nextAttacks, catalog, {
    preferredAttack: nextAttack,
  });

  return nextAttack;
}

export function applyEntityAttackModifier(entity, attackRef, patch = {}, catalog = [], options = {}) {
  if (!entity) return null;

  const baseAttack = resolveAttackDefinitionForEntity(entity, attackRef, catalog, {
    includeModifiers: false,
  });
  const attackKey = readAttackDefinitionKey(baseAttack || attackRef);
  if (!baseAttack || !attackKey) return null;

  const durationMs = Number(options.durationMs);
  const now = Number(options.now) || clockNow();
  const layer = getAttackModifierLayerName(options.layer, durationMs);
  const byId = ensureEntityAttackModifierLayer(entity, layer);
  const sourceId = getAttackModifierSourceId(options.sourceId, attackKey, layer);

  const source = {
    sourceId,
    attackKey: options.allAttacks === true ? "*" : attackKey,
    label: options.label || sourceId,
    layer,
    patch: normalizeAttackPatch(patch),
    priority: Number(options.priority || 0) || 0,
    createdAt: now,
    ...(layer === ENTITY_ATTACK_MODIFIER_LAYERS.TEMPORARY && Number.isFinite(durationMs)
      ? { expiresAt: now + Math.max(0, durationMs) }
      : {}),
  };

  assertAttackCombatDefinition({ ...baseAttack, ...source.patch });
  byId[sourceId] = source;
  refreshEntityAttackTraits(entity);
  scheduleAttackModifierExpiry(entity);
  refreshEntityCurrentAttackDefinition(entity, catalog, { preferredAttack: attackKey });
  notifyAttackSelection(entity);
  notifyCombatAction();

  return {
    source,
    attack: resolveAttackDefinitionForEntity(entity, attackKey, catalog),
  };
}

export function removeEntityAttackModifier(entity, sourceId, catalog = []) {
  if (!entity?.modifierAttacks || !sourceId) return false;

  let removed = false;
  Object.values(ENTITY_ATTACK_MODIFIER_LAYERS).forEach(layer => {
    const byId = entity.modifierAttacks?.[layer]?.byId;
    if (byId && Object.prototype.hasOwnProperty.call(byId, sourceId)) {
      delete byId[sourceId];
      removed = true;
    }
  });

  if (removed) {
    scheduleAttackModifierExpiry(entity);
    refreshEntityAttackTraits(entity);
    refreshEntityCurrentAttackDefinition(entity, catalog);
    notifyAttackSelection(entity);
  notifyCombatAction();
  }
  return removed;
}

export function applyEntityAttackPatch(entity, attackRef, patch = {}, catalog = [], options = {}) {
  if (
    options.layer ||
    options.sourceId ||
    options.durationMs !== undefined ||
    options.asModifier === true
  ) {
    return applyEntityAttackModifier(entity, attackRef, patch, catalog, options)?.attack || null;
  }

  return updateEntityAttackDefinition(entity, attackRef, patch, catalog);
}

export function applyEntityAttackNatureChange(entity, attackRef, patch = {}, catalog = [], options = {}) {
  const naturePatch = {};

  if (Object.prototype.hasOwnProperty.call(patch, "attackRange")) {
    naturePatch.attackRange = normalizeAttackArrayValue(patch.attackRange);
  }

  if (Object.prototype.hasOwnProperty.call(patch, "attacknature")) {
    naturePatch.attacknature = normalizeAttackArrayValue(patch.attacknature);
  }

  return applyEntityAttackPatch(entity, attackRef, naturePatch, catalog, options);
}

registerCombatState('modifiers', () => true, (_, { entities }) => {
  entities.forEach(scheduleAttackModifierExpiry);
});
