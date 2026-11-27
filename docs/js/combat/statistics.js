import { reportAttackDamage, presentDodgeResult, presentIndestructibilityResult, presentEsoterismResult,
  presentEsoterismInactive, reportCriticalRoll, reportConsumedCriticalBoost, presentExecutionImpact,
  presentBrokenSpell, showResilienceCancellation } from "../rendering/damageFeedback.js";
import {
  DAMAGE_SOURCE_KEYS, roundAttackDamageSources, calculateDamageComposition, reduceCriticalSupplement,
  resolveCriticalDamage
} from "./damageRules.js";
import {
  removeCombatVisualAfter, setTimeout, clockNow,
} from "./clock.js";
import { isCombatEnemy, getControlState, canEntityProc } from "./control.js";

import { POWER_RATE_HELPER_TEXT, buildPowerRateAssumption } from "../data/helpers.js";
import {
  calculateStatSources, getStatSystemResult, STAT_SYSTEM_ORIGINS, getProgressiveRatio,
  getDirectingStatResult, calculateProgressivePower, withStatReadSnapshot, getUmbraThreshold
} from "../entities/statSystem.js";
import { stats as statDefinitions, stats } from "../data/statsData.js";
import { balanceData, easeOutPowerRatio, roundBalance } from "../data/balanceData.js";
import { isUmbraRestricted, POWER_RULES, evaluateActionRates, evaluateEntityPower, buildPowerAction,
  readOwnedPowerAttacks, getProfanationTemplate, summarizePowerSamples, createPowerRandom, getPowerStatDefinition,
  evaluateEncounterPower, TACTICAL_RULES, collectTacticalConsequences, evaluateTacticalPower,
  evaluateAttackPowerFromRates } from "../procedural/proc-bareme.js";
import { getAttackEffectHandler } from "./vitals.js";
import { inheritSummonEssences } from "./summons.js";
import { buildReverseArchetypePlan, getAutoReverseArchetypeCandidates } from "../entities/archetypes.js";
import { attackDetails as powerAttackCatalog } from "../data/attackList.js";
import {
  getSafe, normalizeStatKey, entityBattleBooste, getEntityBattleBoostValue,
  getDisplayStatKey, getBattleEntityElement
} from "../entities/rules.js";
import {
  getAttackEssenceProfile, getAttackNatureRules, getAttackResolutionFlags, getAttackPowerRatios,
  initializeAttackPowerRatios, getAttackMastery, getAttackResonance, normArr
} from './attackResolution.js';
import {
  entites, BASE_MAX_LEVEL, maxLevel,
  projectEntityForPower, calculateDodgePercent, calculatePrecisionPercent, calculateIndestructibilityPercent,
  calculateHastePercent, calculateLvlMaxBonus,
  calculateWeaponMasteryCharge, getMovementWeightMalus, getStatSystemInputs, getWeaponOrfevrePreviewActivePercent,
  buildWeaponOrfevreStuffModifiersById, isBeneficialStuffNumber
} from "../entities/runtime.js";
import { getEquippedItemById, loadEquippedItems } from "../storage/gameStorage.js";
import { playCachedGif } from "../data/loaderList.js";
import { calculateCognitiveEssenceCount } from "../items/essenceInventory.js";
import { EffectMessage, isAstralReturnActive, astralCooldownRemaining, startAstralCooldown,
  transcendentalCooldownRemaining, startTranscendentalCooldown,
  esoterismCooldownRemaining, startEsoterismCooldown,
  indestructibilityCooldownRemaining, startIndestructibilityCooldown } from "./effects.js";
import { animateAstrality, animateMysticism, animateOccultism } from "../rendering/animations.js";
import { battleLogs } from "./journal.js";

import { attackEffects } from "../data/attackEffects.js";

// Attack stat contributions and essence affinity.
const projectedAttack = Symbol('projected-attack');
const attributeColor = { force: 'red', intelligence: 'blue', agilite: 'yellow' };
const number = value => typeof value === 'number' ? value : Number(value?.flat ?? value?.max ?? value?.current) || 0;

export function getStatContributions(entity, stat, { resolveLabels = true, includePreview = false, includePlus = false } = {}) {
  const key = normalizeStatKey(stat);
  const durable = entity?.modifierStats?.durable || {};
  const result = [];
  const add = (value, source, id = '', equipment = false, external = false) => {
    if (number(value)) result.push({ value: number(value), mode: 'flat', source, id, equipment, external });
    if (value?.percent) result.push({ value: Number(value.percent), mode: 'percent', source, id, equipment, external });
  };
  const pointLimited = resolveLabels && (['strength', 'intelligence', 'agility'].includes(key)
    || statDefinitions.some(definition => definition.key === key && definition.nature === 'umbra'));
  const crystal = pointLimited ? number(entity?.baseStatSources?.crystal?.[key]) : 0;
  add(crystal ? number(entity?.baseStats?.[key]) - crystal : entity?.baseStats?.[key], 'Base');
  if (crystal) add(crystal, 'Cristaux');
  for (const [layer, label] of [['level', 'Niveaux'], ['adminLevel', 'Niveaux admin'], ['archetype', 'Archétype'], ['statLeveled', 'Progression']]) {
    add(durable[layer]?.[key], label);
  }
  if (includePreview) add(entity?.modifierStats?.preview?.statLeveled?.[key], 'Prévision');
  const previewStuff = includePreview && durable.stuff?.orfevre && Object.keys(entity?.modifierStats?.preview?.statLeveled || {}).length
    ? buildWeaponOrfevreStuffModifiersById(durable.stuff?.byId || {}, getWeaponOrfevrePreviewActivePercent(entity)) : null;
  const byId = previewStuff?.byId || durable.stuff?.orfevre?.effectiveById || durable.stuff?.byId || {};
  for (const [id, delta] of Object.entries(byId)) {
    if (delta[key] !== undefined) {
      const start = result.length;
      add(delta[key], (resolveLabels && getEquippedItemById(id)?.displayName) || 'Équipement', id, true, true);
      const detail = previewStuff ? previewStuff.detailsById?.[id]?.[key] : durable.stuff?.orfevre?.byId?.[id]?.[key];
      if (detail) for (const entry of result.slice(start)) {
        entry.rawValue = entry.mode === 'percent' ? Number(detail.raw?.percent) || 0 : number(detail.raw);
        entry.orfevreBonus = entry.mode === 'percent' ? Number(detail.bonus?.percent) || 0 : number(detail.bonus);
        entry.orfevrePercent = detail.activePercent;
      }
    }
  }
  const generatedSource = Object.entries(balanceData.generatedUmbraStats.sources).find(([, cfg]) => cfg.target === key)?.[0];
  add(durable.derived?.[key], generatedSource
    ? `Umbra : ${statDefinitions.find(stat => stat.key === generatedSource)?.name || generatedSource}` : 'Bonus dérivés');
  for (const boost of entity?.battleBoosts?.[key] || []) {
    if (boost.value) result.push({ value: boost.value, mode: boost.mode, source: boost.source || 'Effet de combat', id: boost.id, equipment: false, external: true, combat: true });
  }
  const pointResult = pointLimited ? getDirectingStatResult(entity, key) : null;
  const baseKey = key.replace(/Plus$/, '');
  for (const source of result) {
    source.stat = getDisplayStatKey(baseKey);
    source.state = key === baseKey ? 'normal' : '+';
    source.category = source.combat ? 'combat' : source.equipment ? 'equipment'
      : ['Base', 'Cristaux'].includes(source.source) ? 'fixed'
        : source.source === 'Bonus dérivés' || source.source.startsWith('Umbra :') ? 'umbra' : 'stat';
    if (['strength', 'agility', 'intelligence', 'will'].includes(baseKey)) source.displayState = 'attribute';
    if (source.equipment) {
      source.provenance = 'equipment';
      source.displayState ||= statDefinitions.find(stat => normalizeStatKey(stat.key) === baseKey)?.nature === 'umbra' ? 'umbra' : source.state;
    }
    if (pointLimited) {
      source.improvementKind = source.source === 'Cristaux' ? 'intense' : source.external || source.source === 'Niveaux admin' ? 'external' : 'standard';
      source.underflow = pointResult?.[source.improvementKind === 'intense' ? 'crystalUnderflow' : source.improvementKind === 'external' ? 'otherUnderflow' : 'naturalUnderflow'] || 0;
      if (source.source === 'Cristaux') source.provenance = 'crystal';
    }
    source.malus = source.source !== 'Base' && source.category !== 'umbra' && !isBeneficialStuffNumber(baseKey, source.value);
  }
  if (includePlus && Object.hasOwn(STAT_SYSTEM_ORIGINS, key)) {
    result.push(...getStatContributions(entity, `${key}Plus`, { resolveLabels, includePreview }));
  }
  return result;
}

export function getStatInputProvenance(entity, key, unit = '', category = null) {
  key = normalizeStatKey(key);
  const baseKey = key.replace(/Plus$/, '');
  const name = baseKey === 'shift' ? 'Déplacements max' : statDefinitions.find(stat => normalizeStatKey(stat.key) === baseKey)?.name;
  return getStatContributions(entity, key, { includePlus: true, includePreview: true })
    .filter(source => (source.provenance || source.malus) && (!category || source.category === category))
    .map(source => ({ ...source, name, unit }));
}

function equipmentUmbraValue(entity, key) {
  if (isUmbraRestricted(entity, key)) return 0;
  const stuff = entity?.modifierStats?.durable?.stuff;
  const byId = stuff?.orfevre?.effectiveById || stuff?.byId || {};
  // With no equipment contribution, its effective share is exactly zero.
  // Avoid building provenance for every unrelated stat and reading its threshold.
  if (!Object.values(byId).some(delta => number(delta[key]) || delta[key]?.percent)) return 0;
  const entries = getStatContributions(entity, key, { resolveLabels: false }).filter(entry => entry.equipment);
  const flat = entries.filter(entry => entry.mode === 'flat').reduce((sum, entry) => sum + entry.value, 0);
  const percent = entries.filter(entry => entry.mode === 'percent').reduce((sum, entry) => sum + entry.value, 0);
  const points = getDirectingStatResult(entity, key);
  if (points) {
    // Preserve the effective equipment share after the owner's common threshold.
    const totalExternal = points.other;
    const rawEquipment = flat * (1 + percent / 100);
    return Math.max(0, totalExternal > 0 ? rawEquipment * points.otherApplied / totalExternal : rawEquipment);
  }
  return Math.max(0, Math.round(flat * (1 + percent / 100)));
}

export function getAttackUmbraAccess(entity, attack) {
  const profile = getAttackEssenceProfile(attack);
  const pure = ['red', 'blue', 'yellow'].filter(color => profile[color] > 0).length === 1;
  return withStatReadSnapshot(() => statDefinitions.filter(stat => stat.key !== 'hypercognition' && stat.nature === 'umbra' && stat.type?.startsWith('attaque-'))
    .map(stat => {
      const color = attributeColor[stat.attribut];
      const tier = Number(stat.type.split('-')[1]);
      const count = profile[color] || 0;
      const compatible = count > 0 && (pure || count >= tier);
      const owned = Math.max(0, Number(getSafe(entity, stat.key, 0)) || 0);
      const equipment = profile.total > 0 ? equipmentUmbraValue(entity, stat.key) : 0;
      return { ...stat, color, tier, count, pure, compatible, owned, equipment,
        usable: owned > 0 && (compatible || equipment > 0),
        value: compatible ? owned : equipment };
    }));
}

export function getAttackPurity(attack) {
  const nature = getAttackNatureRules(attack || {});
  return { level: nature.level, color: nature.pure, bonus: nature.purityBonus };
}

// The view only changes attack calculations. HP, defenses and resource writes stay on the owner.
export function createAttackStatView(entity, attack = entity?.currentAttack) {
  if (!entity || !attack || entity[projectedAttack] === attack) return entity;
  const original = entity.modifierStats?.preview?.total || entity.stats || {};
  const stats = { ...original };
  const modifiers = entity.modifierStats;
  const access = getAttackUmbraAccess(entity, attack);
  for (const entry of access) {
    if (entry.compatible) continue;
    stats[entry.key] = entry.equipment;
    const generated = balanceData.generatedUmbraStats.sources[entry.key];
    if (generated) {
      const before = calculateGeneratedUmbraStatBonus({ stats: original }, entry.key);
      const after = calculateGeneratedUmbraStatBonus({ stats }, entry.key);
      const percent = getStatContributions(entity, generated.target, { resolveLabels: false }).filter(source => source.mode === 'percent')
        .reduce((sum, source) => sum + source.value, 0);
      stats[generated.target] = Math.max(0, (Number(original[generated.target]) || 0) - Math.round((before - after) * (1 + percent / 100)));
    }

  }
  const battleBoosts = { ...entity.battleBoosts };
  for (const entry of access) if (!entry.compatible) delete battleBoosts[entry.key];
  if (getAttackNatureRules(attack).isInert) {
    stats.hypercognition = 0;
    delete battleBoosts.hypercognition;
  }
  return new Proxy(entity, {
    get: (owner, key) => key === projectedAttack ? attack : key === 'stats' ? stats
      : key === '_statSystemOverrides' ? Object.fromEntries([...access.filter(entry => !entry.compatible).map(entry => [entry.key, entry.equipment]),
        ...(getAttackNatureRules(attack).isInert ? [['hypercognition', 0]] : [])])
      : key === 'currentAttack' ? attack : key === 'battleBoosts' ? battleBoosts
      : key === 'modifierStats' ? { ...modifiers, preview: modifiers?.preview ? { ...modifiers.preview, total: stats } : undefined } : owner[key],
  });
}

// Combat stat adapters and runtime decisions; read-only stat helpers live in ui/statistics/details.js.
export {
  calculateResistanceReductionPercent,
  calculateResistances,
} from "../entities/rules.js";

export {
  getSafe,
  entityBattleBooste,
  getEntityBattleBoostValue,
} from "../entities/rules.js";

export const ATTACK_TIME_REDUC_CAP = balanceData.attackTime.reductionCapPercent;



// Autonomous points are added after the Umbra calculation, never fed into its ratios.


// Presentation only: values come from the engine; formula tokens describe their inputs.
// Formulas contain no equality sign: discrete contributions and capped totals are authoritative.


export const attackDamageModifiers = []; // { id, priority, match(ctx), apply(ctx) -> { sources? , clamp0? } }


export function registerAttackDamageModifier(mod) {
  attackDamageModifiers.push(mod);
  attackDamageModifiers.sort((a,b) => (a.priority||0) - (b.priority||0));
}
export function runAttackDamageModifiers(ctx) {
  let sources = { ...ctx.sources };
  let flags = {};
  for (const mod of attackDamageModifiers) {
    if (mod.match && mod.match(ctx) === false) continue;
    const res = mod.apply({ ...ctx, sources }) || {};
    if (res.sources) sources = res.sources;
    if (res.flags) flags = { ...flags, ...res.flags };
  }
  return { sources, flags };
}

export function calculateAttackDamagePreview(attacker, attack) {
  const a = createAttackStatView(attacker || {}, attack);
  const atk = attack || {};
  const natureRules = getAttackNatureRules(atk);
  const flags = getAttackResolutionFlags(atk);
  const physicalDamageBase = Math.max(0, Number(getSafe(a, "physicalDamage", 0)) || 0);
  const magicalDamageBase = Math.max(0, calculateMagicalTotal(a));
  const piercingDamageBase = Math.max(0, Number(getSafe(a, "piercingDamage", 0)) || 0);
  const resonance = getAttackResonance(atk, physicalDamageBase, magicalDamageBase);
  const { details, sources: totalDamageSources } = calculateDamageComposition({
    attack: atk, natureRules, flags, physicalDamageBase, magicalDamageBase, piercingDamageBase, resonance,
    physicalBase: flags.isPurePhysicalBrutality ? brutalityTotalBonus(a) : physicalDamageBase,
    magicalBase: flags.isPureMagicalPsionique ? psionicTotalBonus(a) : magicalDamageBase,
    agility: Math.max(0, Number(getSafe(a, "agility", 0)) || 0),
    transpiercingBonus: flags.isTranspiercing ? transpiercingAgiRatio(a) : 0,
    hypercognitionBonus: calculateCognitiveExplosionTotal(a),
    powerRatios: getAttackPowerRatios(atk),
    inertRatioReductionPercent: balanceData.attackNature.inertRatioReductionPercent,
  });
  const { sources: moddedSources } = runAttackDamageModifiers({
    phase: "pre-resolve",
    attacker: a,
    attack: atk,
    sources: totalDamageSources,
  });

  const finalSources = roundAttackDamageSources(moddedSources);

  const totalDamage = DAMAGE_SOURCE_KEYS.reduce((n, key) => n + (finalSources[key] || 0), 0);

  return {
    attacker: a,
    attack: atk,
    flags,
    details,
    sourcesBeforeModifiers: roundAttackDamageSources(totalDamageSources),
    sources: finalSources,
    totalDamage,
  };
}

// --- calcul des dégâts par source + pipeline ---
export function attemptAttackerDamages(attacker, attack) {
  const preview = calculateAttackDamagePreview(attacker, attack);
  reportAttackDamage(preview);
  return { totalDamageSources: preview.sources, totalDamage: preview.totalDamage };
}

export function attemptResilience(attacker, target, attackDetail) {
  // Ne s’applique qu’aux altérations
  const types = Array.isArray(attackDetail?.type) ? attackDetail.type : (attackDetail?.type ? [attackDetail.type] : []);
  const isAlteration = types.includes('alteration');
  if (!isAlteration) return { enabled: false, percent: 0 };

  // Calcule le pourcentage de réduction propre à la cible
  let percent = Number(calculateResilienceAlterationTotalBonus(target)) || 0;

  // The common stat calculator already bounds the final percentage.
  if (percent < 0) percent = 0;
  if (percent === 0) {
    console.log(`⛨ ${target.name} → Résilience altérations : 0%`);
    return { enabled: false, percent: 0 };
  }

  console.log(`⛨ ${target.name} → Résilience altérations (base + INT) : ${percent}%`);
  return { enabled: true, percent };
}

export function calculateTotalDodgeBonus(entite) {
  const system = getStatSystemResult(entite, 'dodge');
  if (system) return system.chancePercent;
  if (!entite) return 0;

  const dodgePoints = Number(getSafe(entite, "dodge")) || 0;
  if (dodgePoints <= 0) return 0;

  return calculateDodgePercent(dodgePoints);
}

export function attemptDodge(attacker, target, { partial = false, precisionBonus = 0 } = {}) {
  if (!canEntityProc(target)) return false;
  const dodgeStat = Number(getSafe(target, "dodge")) || 0;
  const precisionStat = (Number(getSafe(attacker, "precision")) || 0) + precisionBonus;
  const boostedDodgeFlat = Number(getEntityBattleBoostValue(target, "dodge", "flat")) || 0;
  const boostedDodgePercent = Number(getEntityBattleBoostValue(target, "dodge", "percent")) || 0;


  const baseDodgePercent = calculateTotalDodgeBonus(target);
  const totalDodgePercent = dodgeStat > 0 ? baseDodgePercent : 0;

  const precisionPercent = calculatePrecisionPercent(precisionStat);

  const adjustedDodgeChance = Math.max(0, totalDodgePercent * (1 - precisionPercent / 100));
  const adjustedHitChance = 100 - adjustedDodgeChance;

  const roll = Math.random() * 100;
  const dodgeSuccess = roll < adjustedDodgeChance;

  presentDodgeResult(attacker, target, { partial, boostedDodgeFlat, boostedDodgePercent, baseDodgePercent, totalDodgePercent, precisionPercent, adjustedDodgeChance, adjustedHitChance, roll, dodgeSuccess });

  return dodgeSuccess;
}
export function calculateIndestructibilityPercentFromEntity(entite) {
  const points = Number(getSafe(entite, "indestructibility")) || 0;
  return calculateIndestructibilityPercent(points, getUmbraThreshold(entite));
}
export function calculateIndestructibilityReductionDetails(entite) {
  return globalThis.umbraProgression.indestructibilityReductionDetails(
    getSafe(entite, 'indestructibility', 0), getSafe(entite, 'strength', 0), getUmbraThreshold(entite));
}
export function caluclateIndestructibilityStrengthReduction(entite) {
  return calculateIndestructibilityReductionDetails(entite).attribute.value;
}
export function caluclateIndestructibilityReduction(entite) {
  return calculateIndestructibilityReductionDetails(entite).source.value;
}
export function caluclateIndestructibilityReductionTotal(entite) {
  return calculateIndestructibilityReductionDetails(entite).value;
}
export function calculateIndestructibilityCooldown(entite) {
  return globalThis.umbraProgression.indestructibilityCooldownDetails(
    getSafe(entite, 'indestructibility', 0), getSafe(entite, 'strength', 0), undefined, getUmbraThreshold(entite));
}

export function attemptIndestructibility(attacker, target, rng = Math.random) {
  if (!canEntityProc(target) || indestructibilityCooldownRemaining(target) > 0) return false;
  const points = getSafe(target, "indestructibility");
  if (points <= 0) return false;
  const indestructPercent = calculateIndestructibilityPercent(points, getUmbraThreshold(target));
  const roll = rng() * 100;
  const success = roll < indestructPercent;
  if (success) startIndestructibilityCooldown(target);
  presentIndestructibilityResult(target, { indestructPercent, minIndestructFloor: 0, roll, success });

  return success;
}

// ================================
// RÉGÉNÉRATION DE COMBAT
// ================================

export function calculateHpBattleRegenStrengthRatio(entite) {
  return calculateHpBattleRegenDetails(entite).attribute.value;
}
export function calculateHpBattleRegenIndestructibilityRatio(entite) {
  return calculateHpBattleRegenDetails(entite).source.value;
}
function calculateHpBattleRegenDetails(entite) {
  return globalThis.umbraProgression.indestructibilityRegenDetails(getSafe(entite, 'indestructibility', 0),
    getSafe(entite, 'strength', 0), 0, 0, undefined, getUmbraThreshold(entite));
}

export function calculateHpBattleRegenGenerated(entite) {
  if (!entite) return 0;
  return calculateHpBattleRegenDetails(entite).generated;
}

export function calculateHpBattleRegenBase(entite) {
  if (!entite) return 0;
  const finalValue = Math.max(0, Number(getSafe(entite, "hpBattleRegen")) || 0);
  const generatedValue = calculateHpBattleRegenGenerated(entite);
  return Math.max(0, finalValue - generatedValue);
}

export function calculateHpBattleRegenPercent(entite) {
  if (!entite) return 0;
  return Math.max(0, Math.min(balanceData.regeneration.battleHp.maxPercent, Number(getSafe(entite, "hpBattleRegen")) || 0));
}

export function calculateHpBattleRegenAmount(entite) {
  if (!entite) return 0;
  const maxHp = Math.max(0, Number(getSafe(entite, "HP.max", 0)) || 0);
  if (maxHp <= 0) return 0;
  const regenPercent = calculateHpBattleRegenPercent(entite);
  if (regenPercent <= 0) return 0;
  return Math.max(0, Math.round(maxHp * regenPercent / 100));
}
// === ESOTERISM ===

export function esoterismResult(entity, effect = 'chance') {
  return withStatReadSnapshot(() => {
    const P = globalThis.umbraProgression, points = getSafe(entity, 'esoterism', 0), limit = getUmbraThreshold(entity);
    if (effect === 'reduction') return P.esoterismReductionDetails(points, points > 0 ? getSafe(entity, 'agility', 0) : 0, limit);
    if (effect === 'piercing') return P.esoterismPiercingDetails(points, points > 0 ? getSafe(entity, 'strength', 0) : 0, limit);
    if (effect === 'cooldown') return P.esoterismCooldownDetails(points, points > 0 ? getSafe(entity, 'intelligence', 0) : 0, undefined, limit);
    return P.esoterismChanceDetails(points, limit);
  });
}
export function calculateEsoterismAgiRatio(entity) { return esoterismResult(entity, 'reduction').attribute.value; }
export function calculateEsoterismBaseReduction() { return balanceData.esoterism.reduction.basePercent; }
export function calculateEsoterismtotalReduction(entity) { return esoterismResult(entity, 'reduction').value; }
export function calculateEsoterismChance(entity, points = getSafe(entity, 'esoterism', 0)) {
  return globalThis.umbraProgression.esoterismChanceDetails(points, getUmbraThreshold(entity)).value;
}
// One Umbra roll, then a Force roll only when piercing damage is present.
// Pure piercing can trigger protection; failure to protect consumes no cooldown.
export function resolveEsoterismProtection(attacker, target, { magical = true, piercing = false, rng = Math.random } = {}) {
  const result = { attempted: false, success: false, magicalReduction: 0, piercingReduction: 0 };
  if ((!magical && !piercing) || !canEntityProc(target) || esoterismCooldownRemaining(target) > 0) return result;
  return withStatReadSnapshot(() => {
    const points = getSafe(target, 'esoterism', 0);
    if (!(points > 0)) { presentEsoterismInactive(target); return result; }
    result.attempted = true;
    const esoterismPercent = calculateEsoterismChance(target, points), roll = rng() * 100;
    const proc = roll < esoterismPercent;
    const piercingChance = proc && piercing ? esoterismResult(target, 'piercing').value : 0;
    const protectPiercing = piercingChance > 0 && rng() * 100 < piercingChance;
    result.success = proc && (magical || protectPiercing);
    if (result.success) {
      const reduction = esoterismResult(target, 'reduction');
      result.magicalReduction = magical ? reduction.value : 0;
      result.piercingReduction = protectPiercing ? reduction.piercingValue : 0;
      startEsoterismCooldown(target);
    }
    presentEsoterismResult(target, { esoterismPercent, roll, success: result.success });
    return result;
  });
}
export function attemptEsoterism(attacker, target, rng = Math.random) {
  return resolveEsoterismProtection(attacker, target, { rng }).success;
}
// === Transcendence ===
export function attemptTranscendenceConsoProtection(entite, rng = Math.random, config = {}) {
  if (!canEntityProc(entite) || transcendentalCooldownRemaining(entite) > 0) return false;
  const p = calculateTranscendenceConsoProtectionTotal(entite); // %

  if (p <= 0) return false;

  const roll = rng() * 100;
  const success = roll < p;

  console.log(`✨ ${entite.name} → Transcendance (protection conso) : ${p.toFixed(2)}%`);
  console.log(`🎲 Jet : ${roll.toFixed(2)} → ${success ? "✅ PROTECTION" : "❌ ÉCHEC"}`);

  if (success) {
    startTranscendentalCooldown(entite);
    EffectMessage(entite, "Transcendance !");

    const effectsContainer = document.getElementById(`effectsContainer_${entite.id}`);
    if (effectsContainer) {
      const vfx = document.createElement("img");
      playCachedGif(vfx, `./media/assets/effects/transcendence.gif`);
      vfx.className = "effect-vfx transcendence";
      vfx.style.opacity = "1";
      vfx.style.transition = "opacity 0.7s linear"; // 4.5 - 3.8 = 0.7
      effectsContainer.appendChild(vfx);

      // 🔻 À 3.8s, on lance le fade-out (1 → 0 jusqu'à 4.5s)
      setTimeout(() => {
        vfx.style.opacity = "0";
      }, 3500);

      // 🧹 On retire à 4.5s
      removeCombatVisualAfter(vfx, 4500);
    }
  }

  return success;
}

export function transcendenceConsoProtection(entiteOrValue, config = {}) {
  const points = typeof entiteOrValue === 'number' ? entiteOrValue : getSafe(entiteOrValue, 'transcendence', 0);
  return globalThis.umbraProgression.transcendenceDetails(points, 0,
    { ...balanceData.transcendence.consoProtection, ...config }, getUmbraThreshold(entiteOrValue)).percent;
}
export function calculateTranscendenceConsoProtectionTotal(entite) {
  const system = getStatSystemResult(entite, 'transcendenceTotal');
  if (system) return system.value;
  const autonomous = Number(getSafe(entite, 'transcendenceTotal', 0)) || 0;
  const cfg = balanceData.transcendence.consoProtection;
  return clamp(calculateTranscendenceUmbraProtection(entite) + autonomous, 0, cfg.maxPercent);
}

export function calculateTranscendenceUmbraProtection(entite) {
  return globalThis.umbraProgression.transcendenceDetails(getSafe(entite, 'transcendence', 0),
    getSafe(entite, 'intelligence', 0), undefined, getUmbraThreshold(entite)).percent;
}
export function transcendenceConsoIntel(entite) {
  return calculateTranscendenceUmbraProtection(entite) - transcendenceConsoProtection(entite);
}
export function calculateTranscendentalCooldown(entite) {
  return globalThis.umbraProgression.transcendenceCooldownDetails(getSafe(entite, 'transcendence', 0),
    getSafe(entite, 'intelligence', 0), undefined, getUmbraThreshold(entite));
}

// === ASTRALITY ===
export function attemptAstrality(attacker, target) {
  if (!canEntityProc(target)) return false;
  if (isAstralReturnActive(target) || astralCooldownRemaining(target) > 0) return false;
  const chance = calculateAstralityTotal(target);
  if (!(chance > 0) || Math.random() * 100 >= chance) return false;
  startAstralCooldown(target);
  animateAstrality(target.id);
  const effectsContainer = document.getElementById(`effectsContainer_${target.id}`);
  if (effectsContainer) {
    const astralityVFX = document.createElement("img");
    playCachedGif(astralityVFX, `./media/assets/effects/astrality.gif`);
    astralityVFX.className = "effect-vfx astrality";
    astralityVFX.alt = `${target.name} déclenche l'Astralité !`;
    astralityVFX.style.position = "absolute";
    effectsContainer.appendChild(astralityVFX);
    removeCombatVisualAfter(astralityVFX, 2500);
  }
  return true;
}

export function attemptBloodFuryExec(attacker, target, options = {}) {
  if (!canEntityProc(attacker)) return 0;
  const ignoreHpThreshold = Boolean(options.ignoreHpThreshold);

  const execution = bloodFuryExecutionResult(attacker);
  const bloodFuryExecChanceBonus = execution.threshold.percent;
  const bloodFuryExecDamage = execution.damage.value;
  const bloodFuryProcChance = execution.chance.percent;

  if (bloodFuryExecChanceBonus <= 0 || bloodFuryExecDamage <= 0 || bloodFuryProcChance <= 0) {
    return 0;
  }

  const targetHP = getSafe(target, "HP", null);
  const targetCurrentHP = Number(targetHP?.current ?? 0) || 0;
  const targetMaxHP = Number(targetHP?.max ?? 0) || 0;
  const hpPercent = targetMaxHP > 0 ? (targetCurrentHP / targetMaxHP) * 100 : 100;

  if (!ignoreHpThreshold && hpPercent > bloodFuryExecChanceBonus) {
    console.log(
      `💀 [EXECUTION FAIL HP] ${attacker.name} → ${target.name} a ${hpPercent.toFixed(1)} % HP ` +
      `(seuil requis : ${bloodFuryExecChanceBonus} %).`
    );
    return 0;
  }

  const roll = Math.random() * 100;

  if (roll > bloodFuryProcChance) {
    console.log(
      `💀 [EXECUTION FAIL PROC] ${attacker.name} rate l'exécution sur ${target.name} ` +
      `(${roll.toFixed(1)} > ${bloodFuryProcChance} %).`
    );
    return 0;
  }

  console.log(
    `💀 [EXECUTION SUCCESS] ${attacker.name} exécute ${target.name} ` +
    `(${hpPercent.toFixed(1)} % HP, seuil ${bloodFuryExecChanceBonus} %, proc ${bloodFuryProcChance} %).`
  );

  presentExecutionImpact(target);

  return Math.ceil(bloodFuryExecDamage);
}

export function bloodFuryExecutionResult(entity) {
  return withStatReadSnapshot(() => globalThis.umbraProgression.bloodFuryExecutionDetails(
    getSafe(entity, 'bloodFury', 0), getSafe(entity, 'strength', 0),
    getSafe(entity, 'physicalDamage', 0), getUmbraThreshold(entity)));
}

export function calculateBloodThirstyPercent(entityOrValue, strength = null) {
  if (typeof entityOrValue === 'number') {
    return strength === null ? Math.max(0, Math.min(balanceData.blood.thirsty.maxPercent, entityOrValue))
      : globalThis.umbraProgression.bloodThirstyDetails(entityOrValue, strength).value;
  }
  const system = getStatSystemResult(entityOrValue, 'bloodThirsty');
  if (system) return system.value;
  return globalThis.umbraProgression.bloodThirstyDetails(getSafe(entityOrValue, 'bloodFury', 0),
    getSafe(entityOrValue, 'strength', 0), getSafe(entityOrValue, 'bloodThirsty', 0),
    getSafe(entityOrValue, 'bloodThirstyPlus', 0), undefined, getUmbraThreshold(entityOrValue)).value;
}

export function calculateBloodFuryExecutionPercent(entity) {
  return getStatSystemResult(entity, 'bloodFuryExecutionChance')?.value ?? bloodFuryExecutionResult(entity).chance.percent;
}

export function calculateBloodFuryTargetThreshold(entity) {
  return getStatSystemResult(entity, 'bloodFuryTargetThreshold')?.value ?? bloodFuryExecutionResult(entity).threshold.percent;
}

export function calculateExecutionDamage(entity) {
  return getStatSystemResult(entity, 'bloodFuryExecutionDamage')?.value ?? bloodFuryExecutionResult(entity).damage.value;
}

export function ambidextryResult(entity, effect = 'chance') {
  return withStatReadSnapshot(() => {
    const points = getSafe(entity, 'ambidextry', 0), agility = points > 0 ? getSafe(entity, 'agility', 0) : 0;
    const limit = getUmbraThreshold(entity);
    return effect === 'damage'
      ? globalThis.umbraProgression.ambidextryDamageDetails(points, agility, limit)
      : globalThis.umbraProgression.ambidextryChanceDetails(points, agility, limit);
  });
}

export function calculateAmbidextryProcBonus(entity) { return ambidextryResult(entity).source.value; }
export function calculateAmbidextryAgiChance(entity) { return ambidextryResult(entity).attribute.value; }
export function calculateAmbidextryTotalChance(entity) { return ambidextryResult(entity).value; }
export function calculateAmbidextryRatioBonus(entity) { return ambidextryResult(entity, 'damage').source.value; }
export function calculateAmbidextryAgiRatioBonus(entity) { return ambidextryResult(entity, 'damage').attribute.value; }
export function calculateAmbidextryDamageBonus(entity) { return ambidextryResult(entity, 'damage').value; }

export function calculateInvisibleTargetAvoidChance(attacker, precisionBonus = 0) {
  const precision = calculatePrecisionPercent((Number(getSafe(attacker, 'precision', 0)) || 0) + precisionBonus);
  return balanceData.occultism.forcedTarget.avoidChancePercent * (1 - precision / 100);
}

export function attemptInvisibleTargetAccuracy(attacker, target, precisionBonus = 0) {
  const avoidChance = calculateInvisibleTargetAvoidChance(attacker, precisionBonus);
  const roll = Math.random() * 100;
  const success = roll >= avoidChance;
  attacker.lastInvisibleAccuracy = { avoidChance, hitChance: 100 - avoidChance, roll, success, targetId: target?.id };
  return success;
}

export function transpiercingAgiRatio(entite) {
  const agility = Math.max(0, Number(getSafe(entite, "agility", 0)) || 0);
  return Math.floor(agility * getAttackNatureRules(entite?.currentAttack).agilityDamageRatio);
}

export function transpiercingTotal(entite) {
  const piercingPower = Math.max(0, Number(getSafe(entite, "piercingDamage", 0)) || 0);

  return transpiercingAgiRatio(entite) + piercingPower;
}

export function criticalResult(entity, key, override = null) {
  if (!entity) return calculateStatSources({}, key);
  if (override == null) {
    const system = getStatSystemResult(entity, key);
    if (system) return system;
  }
  const inputs = entity.baseStats ? getStatSystemInputs(entity) : entity.stats || {};
  return calculateStatSources(override == null ? inputs : { ...inputs, criticalPower: override }, key, { effective: true, seuilUmbra: getUmbraThreshold(entity) });
}

export function calculateCritAgiChanceBonus(entity) {
  return criticalResult(entity, 'criticalChance').bonuses[0]?.value || 0;
}
export function calculateCritTotalChance(entity, override = null) {
  return criticalResult(entity, 'criticalChance', override).value;
}
export function calculateCritRatioBonus(entity, override = null) {
  return criticalResult(entity, 'criticalDamage', override).generated;
}
export function calculateCritAgiRatioBonus() { return 0; }
export function calculateCritDamageBonus(entity, override = null) {
  return criticalResult(entity, 'criticalDamage', override).value;
}
export function attemptCriticalHit(attacker, target, totalDamage) {
  if (!attacker || !canEntityProc(attacker)) {
    return {
      isCritical: false,
      popupType: "normal",
      finalDamage: Number(totalDamage) || 0,
      critTotalChance: 0,
      critDamageBonus: 0,
      components: {}
    };
  }

  const critValue = Number(getSafe(attacker, "criticalPower")) || 0;
  const occultismCritBoost = getEntityBattleBoostValue(attacker, "criticalChance", "flat");

  const critChanceBonus = criticalResult(attacker, 'criticalChance').base;

  const critAgiChanceBonus = critValue > 0
    ? calculateCritAgiChanceBonus(attacker)
    : 0;

  const critTotalChance = calculateCritTotalChance(attacker, critValue);

  const critRatioBonus = calculateCritRatioBonus(attacker, critValue);
  const critAgiRatioBonus = calculateCritAgiRatioBonus(attacker);

  const critDamageBonus = calculateCritDamageBonus(attacker, critValue);

  const randomRoll = Math.random() * 100;
  const { isCritical, finalDamage } = resolveCriticalDamage(totalDamage, critTotalChance, critDamageBonus, randomRoll);
reportCriticalRoll(attacker, { critTotalChance, randomRoll, isCritical, occultismCritBoost });
  if (
    occultismCritBoost > 0 &&
    typeof attacker.removeOccultismCritBoost === "function"
  ) {
    attacker.removeOccultismCritBoost();
    attacker.removeOccultismCritBoost = null;

    reportConsumedCriticalBoost(attacker, occultismCritBoost);
  }

  return {
    isCritical,
    popupType: isCritical ? "critical" : "normal",
    finalDamage,
    critTotalChance,
    critDamageBonus,
    components: {
      critChanceBonus,
      critAgiChanceBonus,
      occultismCritBoost,
      critRatioBonus,
      critAgiRatioBonus,
    }
  };
}

// One decision per impact, shared with accuracy and damage. No source stat mutation.
export function rollAttackCritical(attacker, target, attack) {
  if (!getAttackResolutionFlags(attack).canCrit) return { isCritical: false, bonus: 0, precision: 0 };
  const roll = attemptCriticalHit(attacker, target, 0);
  const reduction = Math.max(0, Math.min(100, calculateResilienceCritTotalBonus(target)));
  const bonus = roll.isCritical ? Math.max(0, roll.critDamageBonus) * (1 - reduction / 100) : 0;
  return { ...roll, bonus, reduction, precision: getAttackNatureRules(attack).key === 'red' ? bonus / 10 : 0 };
}

// =========================
// CRITIQUES AUTONOMES
// =========================

export function getFinalCriticalChanceFlat(entite) {
  return Math.max(
    0,
    Number(getSafe(entite, "criticalChance", 0)) || 0
  );
}

export function getFinalCriticalDamageFlat(entite) {
  return Math.max(
    0,
    Number(getSafe(entite, "criticalDamage", 0)) || 0
  );
}

export function resilienceResult(entity, key) {
  const system = getStatSystemResult(entity, key);
  if (system) return system;
  const inputs = entity?.baseStats ? getStatSystemInputs(entity) : entity?.stats || {};
  return calculateStatSources(inputs, key, { effective: true, seuilUmbra: getUmbraThreshold(entity) });
}
export function calculateResilienceStrengthCritBonus(entity) {
  return resilienceResult(entity, 'criticalResistance').bonuses[0]?.value || 0;
}
export function calculateResilienceCritTotalBonus(entity) {
  return resilienceResult(entity, 'criticalResistance').value;
}
export function calculateResilienceAlterationBonus(entity) {
  return resilienceResult(entity, 'alterationResistance').base;
}
export function calculateResilienceIntelligenceAlterBonus(entity) {
  return resilienceResult(entity, 'alterationResistance').bonuses[0]?.value || 0;
}
export function calculateResilienceAlterationTotalBonus(entity) {
  return resilienceResult(entity, 'alterationResistance').value;
}
export function calculateResilienceCancelBonus(entity) {
  const row = resilienceResult(entity, 'resilienceTotal');
  return globalThis.umbraProgression.resilienceCancelDetails(row.umbra, 0, undefined, getUmbraThreshold(entity)).percent;
}
export function calculateResilienceStrengthCancelBonus(entity) {
  return resilienceResult(entity, 'resilienceTotal').generated - calculateResilienceCancelBonus(entity);
}
export function calculateResilienceTotalCancelBonus(entity) {
  return resilienceResult(entity, 'resilienceTotal').value;
}
export function calculateHindranceResistance(entity) {
  return resilienceResult(entity, 'hindranceResistance').value;
}
export function isHindranceEffect(effect, attacker = null, target = null) {
  const types = Array.isArray(effect?.type) ? effect.type : [effect?.type];
  if (effect?.blocksMovement || effect?.increasesMovementCost) return true;
  if (effect?.forcedMovement && attacker && target) {
    return Boolean(attacker._folieAtLaunch || getControlState(attacker, 'folie'))
      || attacker !== target && isCombatEnemy(attacker, target);
  }
  return types.includes('entrave') || effect?.forcedMovement === true;
}
export function isAlterationEffect(effect) {
  const types = Array.isArray(effect?.type) ? effect.type : [effect?.type];
  return types.includes('alteration');
}
export function calculateResilienceEffectIntensity(target, value) {
  return (Number(value) || 0) * (1 - calculateResilienceAlterationTotalBonus(target) / 100);
}
export function calculateResilienceEffectDuration(target, effect, handler) {
  const duration = Number(effect?.effectDuration);
  const damaging = Number(effect?.effectDot) > 0 || effect?.effectPhysicalRatio === 'attacker'
    || effect?.effectMagicalRatio === 'attacker' || Number(effect?.effectPhysicalRatio) > 0
    || Number(effect?.effectMagicalRatio) > 0 || handler?.tacticalScope === 'damage';
  // The effect's explicit type alone controls mitigation, not its attack's aggregated categories.
  if (![].concat(effect?.type || []).includes('alteration') || damaging || !Number.isFinite(duration) || duration <= 0) return effect?.effectDuration;
  return duration * (1 - calculateResilienceAlterationTotalBonus(target) / 100);
}
export function prepareResilienceEffect(target, effect, handler) {
  if (!isAlterationEffect(effect)) return effect;
  // One mitigation per effect: DoT damage in applyDamage, otherwise duration here.
  return { ...effect, baseEffectDuration: effect.effectDuration,
    effectDuration: calculateResilienceEffectDuration(target, effect, handler) };
}
export function rollAlterationResistance(target, effect, random = Math.random, attacker = null) {
  if (!canEntityProc(target)) return { canceled: false, kind: null };
  const hindrance = isHindranceEffect(effect, attacker, target);
  if (![].concat(effect?.type || []).includes('alteration') && !hindrance) return { canceled: false, kind: null };
  const totalChance = calculateResilienceTotalCancelBonus(target);
  if (random() * 100 < totalChance) return { canceled: true, kind: 'resilienceCancel', chance: totalChance };
  if (hindrance) {
    const chance = calculateHindranceResistance(target);
    if (random() * 100 < chance) return { canceled: true, kind: 'hindranceResistance', chance };
  }
  return { canceled: false, kind: null };
}
export function attemptAlterationResistance(attacker, target, effect) {
  const result = rollAlterationResistance(target, effect, Math.random, attacker);
  if (result.canceled) showResilienceCancellation(target, result.kind);
  return result;
}
export function getAlterationTiming(target, effect) {
  const baseDuration = Math.max(0, Number(effect.baseEffectDuration ?? effect.effectDuration) || 0);
  const duration = Math.max(0, Number(effect.baseEffectDuration == null
    ? calculateResilienceEffectDuration(target, effect) : effect.effectDuration) || 0);
  return { baseDuration, duration };
}

export function attemptResilienceCancel(attacker, target, effect) {
  if (!canEntityProc(target)) return false;
  // Lecture du bonus de résilience pur
  const chance = calculateResilienceTotalCancelBonus(target);
  const roll = Math.random() * 100;
  const success = roll < chance;

  console.log(
    `⛨ [Cancel Alté] ${target.name} — chance ${chance.toFixed(2)}% | jet ${roll.toFixed(2)} → ${success ? "✅ ANNULÉE" : "❌ passe"}`
  );

  if (success) showResilienceCancellation(target, 'resilienceCancel');
  return success;
}

export function attemptResilienceCritReduction(attacker, target, damage, normalDamage = damage) {
  return reduceCriticalSupplement(damage, normalDamage, calculateResilienceCritTotalBonus(target));
}
export const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10;

export function calculateBullsEyePercent(entite) {
  const system = getStatSystemResult(entite, 'bullsEye');
  return system?.value ?? Math.max(0, Math.min(balanceData.vision.bullsEyeCurve.maxPercent, Number(getSafe(entite, 'bullsEye', 0)) || 0));
}

export function getRangePenaltyDetails(entite, attack = entite?.currentAttack) {
  if (attack?.rangePenaltyAtLaunch) return { ...attack.rangePenaltyAtLaunch };
  const cfg = balanceData.range.ratio;
  const flags = attack ? getAttackResolutionFlags(attack) : null;
  // effectiveExecutionTime is captured at launch. Preview definitions need their reductions applied once.
  const executionMs = attack ? Math.max(0, Number(attack.effectiveExecutionTime
    ?? getEffectiveAttackTimings(attack.baseTimings ? { ...attack, ...attack.baseTimings } : attack, entite).effective.executionTime) || 0) : 0;
  const durationRatio = Math.min(1, executionMs / Math.max(1, cfg.executionAtMaximumMs));
  const basePenalty = cfg.basePercent + (cfg.maxPercent - cfg.basePercent) * durationRatio;
  const bullsEyePercent = calculateBullsEyePercent(entite);
  const applicable = !!flags?.applyRangeRatio && attack.combatFunction !== 'Support';
  return { executionMs, basePenalty, bullsEyePercent, applicable,
    penalty: applicable ? basePenalty * (1 - bullsEyePercent / 100) : 0 };
}

export function calculateRangeRatio(entite, attack = entite?.currentAttack) {
  return getRangePenaltyDetails(entite, attack).penalty;
}

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

const scalePercentRounded = (stat, statMax, percentMax) => {
  const s = Number(stat) || 0;
  const raw = (clamp(s, 0, statMax) / statMax) * percentMax;
  return Math.round(raw); // 0.4 -> 0 / 0.5 -> 1
};

export function calculateStrength(entite) {
  const v = (getSafe(entite, "strength") ?? 0);
  return parseFloat(Number(v).toFixed(2));
}

export function calculateAgility(entite) {
  const v = (getSafe(entite, "agility") ?? 0);
  return parseFloat(Number(v).toFixed(2));
}

// 0 intel -> 0% ; 150 intel -> 30%
export function calculateHasteIntelRatio(entite, hasteValue = null) {
  const cfg = balanceData.attackTime.hasteRatios;
  const effectiveHaste = Number(hasteValue ?? getHastePoints(entite)) || 0;
  if (effectiveHaste <= 0) return 0;
  const intel = calculateIntelligence(entite);
  return scalePercentRounded(intel, cfg.statCap, cfg.intelligencePrepMaxPercent);
}

export function calculateHasteCDReduc(entite) {
  const cfg = balanceData.attackTime.hasteRatios;
  if (getHastePoints(entite) <= 0) return 0;
  const intel = calculateIntelligence(entite);
  return scalePercentRounded(intel, cfg.statCap, cfg.intelligenceCooldownMaxPercent);
}

export function calculateHasteRecupReduc(entite) {
  const cfg = balanceData.attackTime.hasteRatios;
  const haste = Number(getSafe(entite, "haste", 0)) || 0;
  if (haste <= 0) return 0;

  const agi = calculateAgility(entite);
  return scalePercentRounded(agi, cfg.statCap, cfg.agilityRecoveryMaxPercent);
}

export function calculateHastePrepReduc(entite, hasteValue) {
  const effectiveHaste = Number(hasteValue ?? getHastePoints(entite)) || 0;
  if (effectiveHaste <= 0) return 0;

  const hastePct = Number(calculateHastePercent(effectiveHaste)) || 0;
  const intelPct = Number(calculateHasteIntelRatio(entite, effectiveHaste)) || 0;
  return round1(hastePct + intelPct);
}

export function calculateHasteExecReduc(entite) {
  const cfg = balanceData.attackTime.hasteRatios;
  if (getHastePoints(entite) <= 0) return 0;
  const str = calculateStrength(entite);
  return scalePercentRounded(str, cfg.statCap, cfg.strengthExecutionMaxPercent);
}
export function calculateHasteProjectilSpeed(entite) {
  const cfg = balanceData.attackTime.hasteRatios;
  if (getHastePoints(entite) <= 0) return 0;
  const reducPct = Number(calculateHasteExecReduc(entite)); // 0..25 (ex: 1 = 1%)
  if (!Number.isFinite(reducPct)) return 0;

  const clampedPct = Math.max(0, Math.min(reducPct, cfg.projectileSpeedCapPercent));
  const r = clampedPct / 100; // ratio 0..0.95

  const speedBonusPct = (1 / (1 - r) - 1) * cfg.projectileSpeedBasePercent;

  return roundBalance(speedBonusPct, cfg.projectileSpeedDecimals);
}

export function getFinalAttackCooldownReduc(entite) {
  const system = getStatSystemResult(entite, 'attackCooldownReduc');
  if (system) return system.value;
  const direct = Number(getSafe(entite, "attackCooldownReduc", 0)) || 0;
  const haste = Number(getSafe(entite, "haste", 0)) > 0 ? Number(calculateHasteCDReduc(entite)) || 0 : 0;
  return round1(Math.min(ATTACK_TIME_REDUC_CAP, Math.max(0, direct + haste)));
}

export function getFinalAttackPreparationReduc(entite) {
  const system = getStatSystemResult(entite, 'attackPreparationReduc');
  if (system) return system.value;
  const direct = Number(getSafe(entite, "attackPreparationReduc", 0)) || 0;
  const hasteValue = Number(getSafe(entite, "haste", 0)) || 0;
  const haste = hasteValue > 0 ? Number(calculateHastePrepReduc(entite, hasteValue)) || 0 : 0;
  return round1(Math.min(ATTACK_TIME_REDUC_CAP, Math.max(0, direct + haste)));
}

export function getFinalAttackExecutionReduc(entite) {
  const system = getStatSystemResult(entite, 'attackExecutionReduc');
  if (system) return system.value;
  const direct = Number(getSafe(entite, "attackExecutionReduc", 0)) || 0;
  const haste = Number(getSafe(entite, "haste", 0)) > 0 ? Number(calculateHasteExecReduc(entite)) || 0 : 0;
  return round1(Math.min(ATTACK_TIME_REDUC_CAP, Math.max(0, direct + haste)));
}

export function getFinalAttackRecoveryReduc(entite) {
  const system = getStatSystemResult(entite, 'attackRecoveryReduc');
  if (system) return system.value;
  const direct = Number(getSafe(entite, "attackRecoveryReduc", 0)) || 0;
  const haste = Number(getSafe(entite, "haste", 0)) > 0 ? Number(calculateHasteRecupReduc(entite)) || 0 : 0;
  return round1(Math.min(ATTACK_TIME_REDUC_CAP, Math.max(0, direct + haste)));
}
export function speedBonusToReducPercent(speedBonus) {
  const cfg = balanceData.attackTime.hasteRatios;
  const bonus = Math.max(0, Number(speedBonus) || 0);
  if (bonus <= 0) return 0;
  return round1((bonus / (cfg.projectileSpeedBasePercent + bonus)) * cfg.projectileSpeedBasePercent);
}
export function getFinalAttackProjectileSpeed(entite) {
  const system = getStatSystemResult(entite, 'attackProjectileSpeed');
  if (system) return system.value;
  const direct = Number(getSafe(entite, "attackProjectileSpeed", 0)) || 0;
  const haste = Number(getSafe(entite, "haste", 0)) > 0 ? Number(calculateHasteProjectilSpeed(entite)) || 0 : 0;
  return round1(Math.min(ATTACK_TIME_REDUC_CAP, Math.max(0, direct + haste)));
}

export function calculateProjectilSpeedPercent(entite) {
  const cfg = balanceData.attackTime.hasteRatios;
  const bonusPct = Number(getFinalAttackProjectileSpeed(entite)); // ex: 3 -> +3%
  if (!Number.isFinite(bonusPct)) return cfg.projectileSpeedBasePercent;

  const totalPct = cfg.projectileSpeedBasePercent + bonusPct;
  return roundBalance(totalPct, cfg.projectileSpeedDecimals);
}

export function calculateIntelligence(entite) {
  return parseFloat((getSafe(entite, "intelligence") ?? 0).toFixed(2));
}
export function toNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
export const clampPercent = (p, min = 0, max = balanceData.attackTime.reductionCapPercent) => {
  const upper = max ?? balanceData.attackTime.reductionCapPercent;
  const n = Number(p);
  if (!Number.isFinite(n)) return min;
  return Math.min(upper, Math.max(min, n));
};

export function getHastePoints(entite) {
  const h = getSafe(entite, "haste", null);
  if (typeof h === "number") return h;
  if (h && typeof h === "object") return Number(h.current ?? h.value ?? h.points ?? 0) || 0;
  return Number(entite?.haste ?? entite?.hastePoints ?? 0) || 0;
}

export const applyReducToMs = (baseMs, reducPercent) => {
  const ms = Number(baseMs) || 0;
  const p = clampPercent(reducPercent, 0, balanceData.attackTime.reductionCapPercent);
  return Math.max(0, Math.round(ms * (1 - p / 100)));
};

// ✅ UI + debug : timings effectifs
export function getEffectiveAttackTimings(attack, entite) {
  return withStatReadSnapshot(() => readEffectiveAttackTimings(attack, entite));
}

function readEffectiveAttackTimings(attack, entite) {
  const hastePoints = getHastePoints(entite);
  const hasHaste = hastePoints > 0;

  const hasteBase = hasHaste ? (Number(calculateHastePercent(hastePoints)) || 0) : 0;

const prepReduc = clampPercent(getFinalAttackPreparationReduc(entite));
const cdReduc   = clampPercent(getFinalAttackCooldownReduc(entite));
const execReduc = clampPercent(getFinalAttackExecutionReduc(entite));
const recReduc  = clampPercent(getFinalAttackRecoveryReduc(entite));

  const base = {
    cooldown:        Number(attack.cooldown) || 0,
    preparationTime: Number(attack.preparationTime) || 0,
    executionTime:   Number(attack.executionTime) || 0,
    recoveryTime:    Number(attack.recoveryTime) || 0,
  };

  const { isMelee: isMeleeAttack, isRange: isRangeAttack } = getAttackResolutionFlags(attack);

  const attackNatures = getAttackNatureRules(attack).natures;

  const hasEssence = getAttackNatureRules(attack).profile.total > 0;
  const hasPiercingRecoveryBonus = hasEssence && (
    attackNatures.includes("piercingDamage") ||
    attackNatures.includes("transpiercingDamage"));
	
const hasBaseNature =
  attackNatures.includes("physicalDamage") ||
  attackNatures.includes("magicalDamage") ||
  attackNatures.includes("hybridalDamage");

const hasPiercingNature =
  attackNatures.includes("piercingDamage") ||
  attackNatures.includes("transpiercingDamage");

const isTranspiercing = getAttackResolutionFlags(attack).isTranspiercing;

const isPiercing =
  hasEssence && hasPiercingNature &&
  !isTranspiercing;
  const meleeExecBaseBonus = isMeleeAttack ? calculateMeleeExecBonus(entite, attack) : 0;
  const meleeExecStrengthBonus = isMeleeAttack
    ? calculateExecStrengthRatio(Number(getSafe(entite, "strength", 0)) || 0)
    : 0;
  const projectileSpeedReduc = isRangeAttack
    ? clampPercent(getFinalAttackProjectileSpeed(entite))
    : 0;

  const totalExecReduc = isRangeAttack
    ? clampPercent(execReduc + projectileSpeedReduc)
    : isMeleeAttack
      ? clampPercent(execReduc + meleeExecBaseBonus + meleeExecStrengthBonus)
      : execReduc;

const piercingRecupReduc = isPiercing
  ? totalPiercingRecupReductionWithAgi(entite, attack)
  : 0;

const transpiercingRecupReduc = isTranspiercing
  ? totalTranspiercingRecupReductionWithAgi(entite, attack)
  : 0;
  
const specificRecoveryReduc = isTranspiercing
  ? transpiercingRecupReduc
  : isPiercing
    ? piercingRecupReduc
    : 0;

const totalRecoveryReduc = clampPercent(
  recReduc + specificRecoveryReduc,
  0,
  balanceData.attackTime.reductionCapPercent
);
	
  const effective = {
    cooldown:        applyReducToMs(base.cooldown, cdReduc),
    preparationTime: applyReducToMs(base.preparationTime, prepReduc),
    executionTime:   applyReducToMs(base.executionTime, totalExecReduc),
    recoveryTime:    applyReducToMs(base.recoveryTime, totalRecoveryReduc),
  };

  const phase = {
    executionPhaseTime: isRangeAttack
      ? effective.preparationTime
      : effective.executionTime,
  };

  return {
    base,
    effective,
    impactExecutionTime: isMeleeAttack ? Math.max(200, effective.executionTime) : effective.executionTime,
    phase,
    reduc: {
      hasHaste,
      hastePoints,
      hasteBase,

      prepReduc,
      cdReduc,

      execReduc,
      projectileSpeedReduc,
      meleeExecBaseBonus,
      meleeExecStrengthBonus,
      totalExecReduc,

      recReduc,
       isPiercing,
  isTranspiercing,

  piercingRecupReduc,
  transpiercingRecupReduc,
  specificRecoveryReduc,

  totalRecoveryReduc,
    },
  };
}

function isDirectAttackRateEligible(attack, entity, combatFunction) {
  if (!entity || !attack || attack.combatFunction !== combatFunction) return false;
  const targets = normArr(attack?.attackTarget);
  const flags = getAttackResolutionFlags(attack);
  const effects = normArr(attack?.effets);
  const hasExcludedEffect = effects.some(name => {
    const effect = attackEffects.find(entry => entry.effectName === name);
    return !effect || (Number(effect.effectDot) > 0 && Number(effect.effectDuration) > 0)
      || Boolean(effect.summonType || effect.effectSummon)
      || (combatFunction === 'Support' && !['none', 'heal'].includes(name));
  });
  return !(!targets.includes(combatFunction === 'Support' ? 'ally' : 'enemy')
    || targets.includes('hexa') || normArr(attack?.deadTarget).includes('yes')
    || normArr(attack?.type).includes('alteration') || attack?.natureEffectSecondary
    || (!flags.isMelee && !flags.isRange) || hasExcludedEffect
    || (Number(attack.effectDot) > 0 && Number(attack.effectDuration) > 0));
}

// Pure expectation over repeated cycles, shared by damage and direct healing.
function calculateDirectAttackRate(attack, entity) {
  const flags = getAttackResolutionFlags(attack);
  const view = createAttackStatView(entity, attack);
  const amount = Math.max(0, Number(calculateAttackDamagePreview(view, attack).totalDamage) || 0);
  const { effective: timings, reduc } = getEffectiveAttackTimings(attack, view);
  const speed = Math.max(1, Number(getSafe(view, 'speed', 1000)) || 1000);
  if (![amount, speed, ...Object.values(timings)].every(Number.isFinite)) return null;
  const prep = timings.preparationTime;
  const execution = flags.isMelee ? Math.max(200, timings.executionTime)
    : timings.executionTime > 0 ? timings.executionTime : 1000;
  const recovery = timings.recoveryTime;
  const cooldown = timings.cooldown;
  const baseCycle = Math.max(1, cooldown, prep + recovery + speed + (flags.isMelee ? execution : 0));

  const critChance = flags.canCrit ? Math.min(1, Math.max(0, calculateCritTotalChance(view) / 100)) : 0;
  const critBonus = flags.canCrit ? calculateCritDamageBonus(view) : 0;
  const expectedCrit = amount => amount + critChance * (Math.round(amount * (1 + critBonus / 100)) - amount);
  const declaredNatures = normArr(attack.attacknature);
  const canBreak = flags.canBrokenSpell && declaredNatures.includes('magicalDamage')
    && !declaredNatures.includes('physicalDamage') && !declaredNatures.includes('hybridDamage');
  const brokenChance = canBreak ? Math.min(1, Math.max(0, calculateBrokenSpellChance(view) / 100)) : 0;
  const brokenAmount = flags.isMelee && brokenChance > 0
    ? Math.round(amount * calculateBrokenSpellDamage(view) / 100) : 0;
  const ambidextryChance = flags.canAmbidextry
    ? Math.min(1, Math.max(0, calculateAmbidextryTotalChance(view) / 100)) : 0;
  const secondAmount = Math.round(amount * calculateAmbidextryDamageBonus(view) / 100);
  const secondDelay = applyReducToMs(500, reduc.totalExecReduc);
  const secondExecution = flags.isMelee ? Math.max(120, timings.executionTime) : 0;
  const doubleCycle = flags.isMelee
    ? Math.max(baseCycle, cooldown, prep + Math.max(execution, secondDelay + secondExecution) + recovery + speed)
    : baseCycle;

  const directAmount = (1 - brokenChance) * expectedCrit(amount) + brokenChance * expectedCrit(brokenAmount);
  const procAmount = (1 - brokenChance) * ambidextryChance * expectedCrit(secondAmount);
  const expectedAmount = directAmount + procAmount;
  const expectedCycle = baseCycle + (1 - brokenChance) * ambidextryChance * (doubleCycle - baseCycle);
  if (![expectedAmount, expectedCycle].every(Number.isFinite)) return null;
  const projectedCycles = 100;
  return {
    perSecond: expectedAmount * 1000 / expectedCycle,
    perMinute: expectedAmount * 60000 / expectedCycle,
    expectedAmount,
    directAmount,
    procAmount,
    expectedCycle,
    projectedCycles,
    projectedDuration: projectedCycles * expectedCycle,
    expectedProcs: projectedCycles * (1 - brokenChance) * ambidextryChance,
    critChance,
    ambidextryChance,
    brokenChance,
    baseCycle,
    doubleCycle,
    secondDelay,
    firstImpact: speed + prep + execution,
    speed,
    timings,
    range: flags.isRange ? 'distance' : 'melee',
  };
}

const profanationPowerSamples = new Map();

export function getPowerConfigurationSignature() {
  const seen = new WeakSet();
  return JSON.stringify([POWER_RULES, TACTICAL_RULES, powerAttackCatalog, attackEffects,
    attackEffects.map(effect => {
      const handler = getAttackEffectHandler(effect.effectName) || getAttackEffectHandler(effect.effectName, { self: true });
      return [handler?.tacticalConsequence, handler?.tacticalEffects, handler?.tacticalScope, handler?.tacticalMechanics];
    })], (key, value) => {
      if (value && typeof value === 'object') {
        if (seen.has(value)) return '[reference]';
        seen.add(value);
      }
      return value;
    });
}

function estimateProfanationPowerRates(entity, attack, context) {
  const levelResult = calculateProfanationSummonLevel(entity, attack);
  const level = typeof levelResult === 'number' ? levelResult : levelResult.level;
  const template = inheritSummonEssences(getProfanationTemplate(level), attack);
  const definitionKey = JSON.stringify(['profanation', level, template.attackDetails]);
  if (context.depth >= TACTICAL_RULES.maxDepth || context.path.includes(definitionKey) || context.budget.remaining <= 0) {
    return { dps: 0, hps: 0, nonRatePower: 0, inheritedTacticalPower: 0, samples: 0, level, incomplete: true,
      convention: POWER_RATE_HELPER_TEXT.summonLimit };
  }
  const key = `${getPowerConfigurationSignature()}:${definitionKey}`;
  if (profanationPowerSamples.has(key)) return profanationPowerSamples.get(key);
  const candidates = level > 1 ? getAutoReverseArchetypeCandidates(template, level - 1) : [];
  const samples = (candidates.length ? candidates : [null]).map(archetype => {
    const clone = { ...structuredClone(template), reverseArchetype: archetype,
      Archetype: { current: { key: 'egare', step: 0 }, achieve: [], inProgress: [] } };
    const plan = archetype ? buildReverseArchetypePlan(clone, { preview: true }) : null;
    if (plan) {
      clone.Archetype = plan.archetypeState;
      clone.modifierStats = { durable: { statLeveled: plan.delta } };
    }
    const projected = projectEntityForPower(clone);
    const rates = calculateEntityRates(projected, { depth: context.depth + 1,
      path: [...context.path, definitionKey], budget: context.budget });
    const own = evaluateEntityPower(projected);
    const nonRatePower = own.details.filter(row => row.unit !== 'premium').reduce((sum, row) => sum + row.score, 0);
    const fixedPower = own.details.filter(row => row.unit === 'premium').reduce((sum, row) => sum + row.score, 0);
    return { ...rates, archetype: archetype || 'egare',
      nonRatePower: nonRatePower + rates.summonNonRatePower,
      inheritedTacticalPower: fixedPower + rates.tactical.floor + rates.tactical.bonus + rates.inheritedTacticalPower
        + Math.max(0, rates.attackCount - 1) * POWER_RULES.premiums.additionalAttack
        + rates.unmeasured.length * POWER_RULES.unknownCoefficient };
  });
  const average = key => samples.reduce((sum, sample) => sum + sample[key], 0) / samples.length;
  const result = { ...summarizePowerSamples(samples), level,
    nonRatePower: average('nonRatePower'), inheritedTacticalPower: average('inheritedTacticalPower'),
    tacticalSamples: samples.map(sample => ({ archetype: sample.archetype, nonRatePower: sample.nonRatePower,
      inheritedTacticalPower: sample.inheritedTacticalPower, tactical: sample.tactical,
      incomplete: sample.incomplete, unmeasured: sample.unmeasured })),
    convention: POWER_RATE_HELPER_TEXT.profanation };
  if (profanationPowerSamples.size >= 250) profanationPowerSamples.clear();
  if (!result.incomplete) profanationPowerSamples.set(key, result);
  return result;
}

function inferredAttackConsequences(attack, directRate) {
  const targets = normArr(attack.attackTarget);
  const flags = getAttackResolutionFlags(attack);
  const { colors, signature } = getAttackNatureRules(attack);
  const ratios = getAttackPowerRatios(attack);
  const harmony = (ratios.physical > 0 && colors.includes('red')) || (ratios.magical > 0 && colors.includes('blue'))
    || (ratios.piercing > 0 && colors.includes('yellow'));
  const tacticalConsequence = [targets.includes('hexa') ? 'terrain' : 'entite',
    ...(targets.includes('enemy') ? ['ennemi'] : []), ...(targets.includes('ally') ? ['allie'] : []),
    ...(!targets.includes('hexa') ? [normArr(attack.deadTarget).includes('yes') ? 'mort' : 'vivant'] : []),
    flags.isRange ? 'distance' : 'melee', ...(harmony ? ['harmonie'] : [])];
  const result = [{ tacticalConsequence }, { tacticalConsequence: ['maitrise'], quantity: getAttackMastery(attack).level }];
  if (directRate) result.push({ tacticalScope: attack.combatFunction === 'Support' ? 'healing' : 'damage',
    tacticalConsequence: ['direct', attack.combatFunction === 'Support' ? 'soin' : 'degats', 'proportionnel'] });
  // Resonance is already included in direct power. Other signatures depend on the target.
  if (signature && signature.key !== 'resonance') result.push({ id: `nature:${signature.key}`,
    tacticalId: `nature:${signature.key}`, tacticalScope: 'attack',
    tacticalConsequence: signature.resistance
      ? ['direct', 'temporaire', 'fixe', signature.sign > 0 ? 'renforcement' : 'affaiblissement']
      : ['direct', 'proportionnel', signature.key === 'effusion' ? 'soin' : 'degats'] });
  return result;
}

export function calculateEntityRates(entity, { depth = 0, path = [], budget = { remaining: TACTICAL_RULES.maxNodes } } = {}) {
  const attacks = readOwnedPowerAttacks(entity, powerAttackCatalog);
  const assumptions = [];
  const unmeasured = [];
  const tacticalResults = new Map();
  let resurrectionCount = 0;
  const actions = attacks.map((attack, index) => {
    try {
      if (--budget.remaining < 0) throw new Error('Limite du parcours des attaques');
      if (attack.unresolvedPower) throw new Error('Définition d’attaque introuvable');
      initializeAttackPowerRatios(attack, { random: createPowerRandom(attack.entityAttackId || attack.functionName || index) });
      const view = createAttackStatView(entity, attack);
      let rate = calculateDirectAttackDps(attack, entity) || calculateDirectAttackHps(attack, entity);
      // DOT payloads remain separately flagged; their ordinary impact is still measurable.
      if (!rate && attack.combatFunction === 'Attaquant' && normArr(attack.attackTarget).includes('enemy')
        && !normArr(attack.deadTarget).includes('yes') && !normArr(attack.attackTarget).includes('hexa')) {
        const direct = calculateDirectAttackRate(attack, entity);
        if (direct) rate = { ...direct, expectedDamage: direct.expectedAmount };
      }
      const { effective } = getEffectiveAttackTimings(attack, view);
      const action = buildPowerAction(attack, rate, effective, getSafe(view, 'speed', 1000), getAttackResolutionFlags(attack));
      action.order = index;
      const collected = collectTacticalConsequences(attack, { effects: attackEffects, mechanicFor: getAttackEffectHandler,
        inferred: inferredAttackConsequences(attack, rate), source: action.key });
      tacticalResults.set(action.key, collected);
      const effects = normArr(attack.effets);
      if (effects.includes('rez')) resurrectionCount++;
      if (effects.includes('summonProfanation')) {
        const estimate = estimateProfanationPowerRates(entity, attack, { depth, path, budget });
        action.summon = { ...estimate, durationMs: 60000, maxActive: 1 };
        action.approximate = true;
        assumptions.push({ key: action.key, ...estimate });
      } else if (effects.includes('summonJarret')) {
        action.healing = 5 * 0.85;
        action.approximate = true;
        assumptions.push({ key: action.key, convention: POWER_RATE_HELPER_TEXT.jarret });
      } else if (!rate && !effects.includes('rez')) {
        unmeasured.push(action.key);
      }
      for (const name of [...effects, ...normArr(attack.selfEffects)]) {
        if (['poison', 'brulure', 'lifesteal'].includes(name)) {
          unmeasured.push(`${action.key}:${name}`);
          assumptions.push({ key: action.key, convention: buildPowerRateAssumption('secondary', name) });
        }
      }
      const signature = getAttackNatureRules(attack).signature;
      if (signature && signature.key !== 'resonance') {
        unmeasured.push(`${action.key}:nature:${signature.key}`);
        assumptions.push({ key: action.key, convention: buildPowerRateAssumption('targetDependent', signature.label) });
      }
      if (collected.incomplete) unmeasured.push(`${action.key}:tactical`);
      return action;
    } catch (error) {
      const key = attack.entityAttackId || attack.attackKey || attack.functionName || `attack-${index}`;
      unmeasured.push(key);
      assumptions.push({ key, convention: buildPowerRateAssumption('error', key, error.message) });
      return null;
    }
  }).filter(Boolean);
  // Use the same credit/weight convention as automatic combat selection.
  const ordered = [...actions].sort((a, b) => b.cooldownMs - a.cooldownMs || a.order - b.order);
  for (const action of actions) action.weight = actions.length - ordered.indexOf(action);
  const result = evaluateActionRates(actions, { horizonMs: actions.some(action => action.summon) ? 60000 : null });
  const tactical = { floor: 0, bonus: 0, rows: [], diagnostics: [], incomplete: false };
  let summonNonRatePower = 0;
  let inheritedTacticalPower = 0;
  for (const action of actions) {
    const contribution = result.actions.find(entry => entry.key === action.key) || {};
    const nonRatePower = (action.summon?.nonRatePower || 0) * (contribution.summonPresence || 0);
    summonNonRatePower += nonRatePower;
    inheritedTacticalPower += (action.summon?.inheritedTacticalPower || 0) * (contribution.summonPresence || 0);
    const basis = { damage: (contribution.dps || 0) * POWER_RULES.dpsCoefficient,
      healing: (contribution.hps || 0) * POWER_RULES.hpsCoefficient,
      summon: (contribution.summonDps || 0) * POWER_RULES.dpsCoefficient
        + (contribution.summonHps || 0) * POWER_RULES.hpsCoefficient + nonRatePower };
    basis.attack = basis.damage + basis.healing + basis.summon;
    const evaluated = evaluateTacticalPower(tacticalResults.get(action.key), basis, { covered: ['dps', 'hps'] });
    tactical.floor += evaluated.floor;
    tactical.bonus += evaluated.bonus;
    tactical.rows.push(...evaluated.rows);
    tactical.diagnostics.push(...evaluated.diagnostics);
    tactical.incomplete ||= evaluated.incomplete;
    if (evaluated.incomplete) unmeasured.push(`${action.key}:tactical`);
  }
  return { ...result, attackCount: attacks.length, resurrectionCount, assumptions, unmeasured: [...new Set(unmeasured)],
    tactical, summonNonRatePower, inheritedTacticalPower,
    incomplete: result.incomplete || tactical.incomplete || unmeasured.length > 0 || assumptions.some(entry => entry.incomplete),
    convention: POWER_RATE_HELPER_TEXT.entity };
}

export function calculateEntityPower(entity, { equipment = null } = {}) {
  const ownedIds = new Set(Object.values(entity?.stuff || {}).flat().filter(id => typeof id === 'string'));
  const equipped = (equipment || loadEquippedItems()).filter(item => ownedIds.has(item?.equippedId));
  const rates = calculateEntityRates(entity);
  const intrinsicEntity = entity.baseStats ? projectEntityForPower(entity) : entity;
  rates.intrinsic = calculateEntityRates(intrinsicEntity);
  return evaluateEntityPower(entity, { equipment: equipped, rates });
}

export function calculateAttackPower(attack, entity) {
  const projected = { ...entity, attackDetails: [attack] };
  const rates = calculateEntityRates(projected);
  return evaluateAttackPowerFromRates(rates);
}

export function calculateArmyPower(army = []) {
  const equipment = loadEquippedItems();
  return evaluateEncounterPower(army.map(entity => ({ entity, power: calculateEntityPower(entity, { equipment }) })));
}

export function calculateDirectAttackDps(attack, entity) {
  if (!isDirectAttackRateEligible(attack, entity, 'Attaquant')) return null;
  const rate = calculateDirectAttackRate(attack, entity);
  return rate && { ...rate, dps: rate.perSecond, damagePerMinute: rate.perMinute,
    expectedDamage: rate.expectedAmount, directDamage: rate.directAmount, procDamage: rate.procAmount };
}

export function calculateDirectAttackHps(attack, entity) {
  if (!isDirectAttackRateEligible(attack, entity, 'Support')) return null;
  const rate = calculateDirectAttackRate(attack, entity);
  const signature = getAttackNatureRules(attack).signature;
  return rate && { ...rate, hps: rate.perSecond, healingPerMinute: rate.perMinute,
    expectedHealing: rate.expectedAmount, directHealing: rate.directAmount, procHealing: rate.procAmount,
    targetDependentHealing: signature?.key === 'effusion'
      ? { label: signature.label, percent: signature.percent } : null };
}


// Max HP en "temps réel": priorité à HP.max, puis maxHP, puis quelques fallbacks
export function calculateExtraLifeMaxHP(entite) {
  const candidates = [
    "HP.max",
    "maxHP",
    "stats.HP.max",
    "stats.maxHP",
    "baseStats.maxHP",
    "stats.baseStats.maxHP"
  ];

  for (const path of candidates) {
    const val = getSafe(entite, path, null);
    const n = toNumber(val, null);
    if (n !== null && n > 0) return n;
  }
  return 0;
}


// 20% fixe
export function calculateExtraLifeBasePercent(config = {}) {
  const cfg = {
    ...balanceData.extraLife.resurrect,
    ...config,
  };
  return parseFloat(toNumber(cfg.basePercent, balanceData.extraLife.resurrect.basePercent).toFixed(cfg.decimals));
}

export function calculateExtraLifeIntelPercent(entite, config = {}) {
  if (!(getSafe(entite, 'transcendence', 0) > 0)) return 0;
  const cfg = {
    ...balanceData.extraLife.resurrect,
    ...config,
  };
  const intelligencePercentPerPoint =
    config.intelligencePercentPerPoint ??
    config.perIntel ??
    cfg.intelligencePercentPerPoint;
  const maxIntelligencePercent =
    config.maxIntelligencePercent ??
    config.maxIntelPercent ??
    cfg.maxIntelligencePercent;

  const intel = calculateIntelligence(entite);
  const raw = intel * toNumber(intelligencePercentPerPoint, balanceData.extraLife.resurrect.intelligencePercentPerPoint);
  const capped = Math.min(raw, toNumber(maxIntelligencePercent, balanceData.extraLife.resurrect.maxIntelligencePercent));

  return parseFloat(capped.toFixed(cfg.decimals));
}

// Y : 20% + Z%
export function calculateExtraLifeTotalPercent(entite, config = {}) {
  const cfg = {
    ...balanceData.extraLife.resurrect,
    ...config,
  };
  const base = calculateExtraLifeBasePercent(config);
  const intelP = calculateExtraLifeIntelPercent(entite, config);
  return Math.max(0, Math.min(cfg.maxPercent, parseFloat((base + intelP).toFixed(cfg.decimals))));
}

// X : maxHP * Y%
export function calculateExtraLifeRestoredHP(entite, config = {}) {
  const maxHP = calculateExtraLifeMaxHP(entite);
  const totalP = calculateExtraLifeTotalPercent(entite, config);
  return maxHP > 0 ? Math.max(1, Math.ceil(maxHP * (totalP / 100))) : 0;
}

// Agrégateur
export function calculateExtraLifeResurrect(entite, config = {}) {
  const cfg = {
    ...balanceData.extraLife.resurrect,
    ...config,
  };
  const maxHP = calculateExtraLifeMaxHP(entite);
  const basePercent = calculateExtraLifeBasePercent(config);
  const intelPercent = calculateExtraLifeIntelPercent(entite, config);
  const rawPercent = parseFloat((basePercent + intelPercent).toFixed(cfg.decimals));
  const totalPercent = calculateExtraLifeTotalPercent(entite, config);
  const restoredHP = calculateExtraLifeRestoredHP(entite, config);

  return { maxHP, basePercent, intelPercent, rawPercent, totalPercent, restoredHP };
}

const trunc2 = (n) => Math.trunc(n * 100) / 100;

export function astralityResult(entity, key = 'fatalSurvival') {
  return getStatSystemResult(entity, key) || calculateStatSources(entity?.baseStats ? getStatSystemInputs(entity)
    : { ...entity?.stats, astrality: getSafe(entity, 'astrality', 0) }, key, { effective: true, seuilUmbra: getUmbraThreshold(entity) });
}
export function calculateIntelAstralityRatio(entity) { return astralityResult(entity).bonuses[0]?.value || 0; }
export function calculateAstralityTotal(entity) { return astralityResult(entity).value; }
export function calculateAstralCooldown(entity) {
  return globalThis.umbraProgression.astralCooldownDetails(getSafe(entity, 'astrality', 0), getSafe(entity, 'agility', 0), undefined, getUmbraThreshold(entity));
}
export function calculateAstralReturn(entity) {
  return globalThis.umbraProgression.astralReturnDetails(getSafe(entity, 'astrality', 0), getSafe(entity, 'strength', 0), getSafe(entity, 'HP', 0), getSafe(entity, 'agility', 0), undefined, getUmbraThreshold(entity));
}
export function calculateAstralBody(entity) {
  return globalThis.umbraProgression.astralBodyDetails(getSafe(entity, 'astrality', 0), getSafe(entity, 'intelligence', 0), undefined, getUmbraThreshold(entity));
}

export function calculateHypercognitionRatio(value, limit) {
  return globalThis.umbraProgression.getProgressiveRatio(value, 'hypercognition', limit);
}

export function calculateHypercognitionBonus(entite, value = getSafe(entite, 'hypercognition', 0)) {
  const hyperco = Number(value) || 0;
  if (hyperco <= 0) return 0;
  const intelligence = Number(getSafe(entite, 'intelligence', 0)) || 0;
  return globalThis.umbraProgression.hypercognitionExplosionDetails(hyperco, intelligence, getUmbraThreshold(entite)).value;
}

export function calculateHypercognitionEssences(entite) {
  return calculateCognitiveEssenceCount(entite);
}
export function calculateCognitiveExplosionTotal(entite) {
  const system = getStatSystemResult(entite, 'cognitiveExplosion');
  if (system) return system.value;
  return Math.max(0, calculateHypercognitionBonus(entite) + (Number(getSafe(entite, 'cognitiveExplosion', 0)) || 0));
}
export function calculateMagicalTotal(entite) {
  const magicalDamage = Number(getSafe(entite, "magicalDamage", 0)) || 0;
  return Math.round(magicalDamage);
}

export function calculateProfanationSummonLevel(entite, attack = entite?.currentAttack) {
  const rawCasterLevel = Number(entite?.level?.current ?? entite?.level);
  const casterLevel = Number.isFinite(rawCasterLevel) ? Math.max(1, Math.floor(rawCasterLevel)) : 1;
  const rawIntelligence = Number(getSafe(entite, 'intelligence', 0));
  const intelligence = Number.isFinite(rawIntelligence) ? Math.max(0, rawIntelligence) : 0;
  const rawRatio = Number(attack?.summonLevelIntelligenceRatio ?? 0.2);
  const ratio = Number.isFinite(rawRatio) ? Math.max(0, rawRatio) : 0.2;
  const maxLevel = Math.min(balanceData.level.will.hardMaxLevel, balanceData.level.progression.tableMaxLevel);
  const rawLevel = intelligence > 0 && ratio > 0 ? casterLevel * ratio * intelligence : 0;
  // Bound before flooring: the reverse-archetype loop must never receive an unbounded budget.
  const level = Math.max(1, Math.floor(Number(Math.min(maxLevel, rawLevel).toFixed(10))));
  return { level, casterLevel, intelligence, ratio, maxLevel };
}

export function calculateLvlMaxBaseEntite(entite, config = {}) {
  const { baseMaxLevel = BASE_MAX_LEVEL } = {
    ...balanceData.level.will,
    ...config,
  };

  const rawBase = Number(getSafe(entite, "level.baseMax", NaN));
  if (Number.isFinite(rawBase)) return Math.max(0, Math.floor(rawBase));

  return baseMaxLevel;
}

export function calculateLvlMaxEntiteWithWill(entite, willValue, config = {}) {
  const base = calculateLvlMaxBaseEntite(entite, config);
  const bonus = calculateLvlMaxBonus(willValue, { ...config, baseMaxLevel: base });
  // Profanation grants a generation level, independent of the summon's own will.
  const grantedLevel = entite?.summonOrigin?.type === 'profanation'
    ? Math.max(0, Math.floor(Number(entite.summonOrigin.generatedLevel) || 0)) : 0;
  return Math.max(0, Math.min(Math.max(base + bonus, grantedLevel), config.hardMaxLevel ?? balanceData.level.will.hardMaxLevel ?? maxLevel));
}

export function calculateLvlMaxEntite(entite, config = {}) {
  const will = getSafe(entite, "stats.will", null) ?? getSafe(entite, "will", 0);
  return calculateLvlMaxEntiteWithWill(entite, will, config);
}

export function calculatewillAwakeBonus(value, config = {}) {
  const cfg = {
    ...balanceData.level.will,
    ...config,
  };
  const {
    pointsPerAwakeningLevel,
    minAwakeningLevels,
    maxAwakeningLevels,
  } = cfg;

  const v   = Math.max(0, Number(value) || 0);
  const raw = Math.ceil(v / pointsPerAwakeningLevel);

  const clamped = Math.max(minAwakeningLevels, Math.min(maxAwakeningLevels, raw));
  return clamped;
}

const LEVEL_WEIGHTS = balanceData.statGraph.levelWeights;

function normalizeNumber(v) {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}
// 0 → 150 vitalité => 0% → 5% (cap à 5% au-delà)
export function calculateVitalityRegenPercent(vitality, config = {}) {
  const { maxVitality, maxPercent, decimals } = {
    ...balanceData.regeneration.vitalityDayHp,
    ...config,
  };

  const v = Math.max(0, toNumber(vitality, 0));
  const clamped = Math.min(v, maxVitality);

  const percent = (clamped / maxVitality) * maxPercent; // linéaire
  return parseFloat(percent.toFixed(decimals));
}

export function calculateVitalityRegenAmount(maxHP, regenPercent) {
  const hp = Math.max(0, toNumber(maxHP, 0));
  const p  = Math.max(0, toNumber(regenPercent, 0));

  // Bonus vitalité = 0 si pas de HP exploitable ou pas de %
  if (hp === 0 || p === 0) return 0;

  const raw = hp * (p / 100);

  // Arrondi au plus proche (0.5 -> supérieur), toujours entier >= 0
  return Math.max(0, Math.round(raw));
}

export function calculateTotalRegenAmount(baseRegenAmount, bonusRegenAmount = 0) {
  let base = Math.max(0, Math.round(toNumber(baseRegenAmount, 0)));
  if (base === 0) base = balanceData.regeneration.vitalityDayHp.minTotalBaseAmount;

  const bonus = Math.max(0, Math.round(toNumber(bonusRegenAmount, 0)));
  return base + bonus;
}

export function calculateStatGraphValue(entiteStats, statDefinitions) {
  // Résultat
  const result = {
    force:       { attaque: 0, defense: 0, utilitaire: 0 },
    intelligence:{ attaque: 0, defense: 0, utilitaire: 0 },
    agilite:     { attaque: 0, defense: 0, utilitaire: 0 },
  };

  // Mapping spécial non présent dans les définitions “normales”
  const specialGraphMapping = {
    HP: {
      attribut: "force",
      type: "utilitaire-0.5", // HP.max => force / utilitaire-0.5
      valuePath: "max",
    },
    armor: {
      attribut: "force",
      type: "defense-0.5",
      valuePath: "current",
    },
    extraLife: {
      attribut: "intelligence",
      type: "utilitaire-3", // extraLife.max => intel / utilitaire-3
      valuePath: "max",
    },
  };

  // Index des définitions par key
  const configByKey = (Array.isArray(statDefinitions) ? statDefinitions : []).reduce((acc, def) => {
    if (!def || !def.key) return acc;
    if (!acc[def.key]) acc[def.key] = [];
    acc[def.key].push(def);
    return acc;
  }, {});

  const ignoredKeys = new Set(["strength", "agility", "intelligence", "will", "speed"]);

  // Sécurité : si entiteStats n’est pas un objet, on sort
  if (!entiteStats || typeof entiteStats !== "object") {
    console.warn("[calculateStatGraphValue] entiteStats invalide :", entiteStats);
    return result;
  }

  for (const [key, rawValue] of Object.entries(entiteStats)) {
    // 1) ignorés d’office
    if (ignoredKeys.has(key)) continue;

    // 2) Cas spéciaux (HP, armor, extraLife)
    if (specialGraphMapping[key]) {
      const mapping = specialGraphMapping[key];
      let numeric = 0;

      if (rawValue && typeof rawValue === "object" && mapping.valuePath in rawValue) {
        numeric = normalizeNumber(rawValue[mapping.valuePath]);
      }

      if (!numeric) continue;

      const [category, levelStr] = mapping.type.split("-");
      const weight = getPowerStatDefinition(key, mapping).coefficient;

      if (!weight) continue;
      if (result[mapping.attribut]?.[category] === undefined) continue;

      const score = numeric * weight;
      result[mapping.attribut][category] += score;
      continue;
    }

    // 3) Stats classiques
    let numericValue = rawValue;

    // Si c’est un objet {current, max}, on prend max
    if (rawValue && typeof rawValue === "object" && "max" in rawValue) {
      numericValue = rawValue.max;
    }

    numericValue = normalizeNumber(numericValue);
    if (!numericValue) continue;

    const defs = configByKey[key];
    if (!defs || !defs.length) continue;

    for (const def of defs) {
      const attribut = def.attribut; // "force" / "intelligence" / "agilite" ou null

      if (!attribut || !result[attribut]) continue;

      const typeStr = def.type; // "attaque-1", "defense-2", etc.
      if (!typeStr || !typeStr.includes("-")) continue;

      const [category, levelStr] = typeStr.split("-");
      const bucket = result[attribut][category];
      if (bucket === undefined) continue;

      const weight = getPowerStatDefinition(key, def).coefficient;
      if (!weight) continue;

      const score = numericValue * weight;
      result[attribut][category] += score;
    }
  }

  // Debug (tu peux enlever après vérif)
  console.log("[calculateStatGraphValue] stats =", entiteStats);
  console.log("[calculateStatGraphValue] result =", result);

  return result;
}
// === Broken Spell (range magical) ===

// Base : 30.0 (%)
export function baseBrokenSpellChance() {
  return balanceData.brokenSpell.chance.basePercent;
}

export function intelBrokenSpellChance(entite) {
  if (!entite) return 0.0;
  const cfg = balanceData.brokenSpell.chance;
  const intel = Number(getSafe(entite, "intelligence")) || 0;

  const eased = easeOutPowerRatio(intel, cfg.intelligenceCap, cfg.curvePower);

  const reduc = cfg.intelligenceMaxReductionPercent * eased;
  return roundBalance(clamp(reduc, 0, cfg.intelligenceMaxReductionPercent), cfg.decimals);
}

export function calculateBrokenSpellChance(entite) {
  const cfg = balanceData.brokenSpell.chance;
  const base = baseBrokenSpellChance();
  const reduc = entite ? intelBrokenSpellChance(entite) : 0.0;
  const purityMultiplier = 1 - getAttackNatureRules(entite?.currentAttack).overloadReduction / 100;
  return roundBalance(clamp(base - reduc, 0, cfg.maxPercent) * purityMultiplier, cfg.decimals);
}

export function baseBrokenSpellDamage() {
  return balanceData.brokenSpell.damage.basePercent;
}

export function intelBrokenSpellBaseDamage(entite) {
  if (!entite) return 0.0;
  const cfg = balanceData.brokenSpell.damage;
  const intel = Number(getSafe(entite, "intelligence")) || 0;

  const eased = easeOutPowerRatio(intel, cfg.intelligenceCap, cfg.curvePower);

  const reduc = cfg.intelligenceMaxReductionPercent * eased;
  return roundBalance(clamp(reduc, 0, cfg.intelligenceMaxReductionPercent), cfg.decimals);
}

export function magicalBrokenSpellDamage(entite) {
  if (!entite) return 0.0;
  const cfg = balanceData.brokenSpell.damage;

  // adapte ici si ta stat s'appelle différemment
  const magicAttack =
    Number(getSafe(entite, "magicAttack")) ||
    Number(getSafe(entite, "magicalAttack")) ||
    Number(getSafe(entite, "magicPower")) ||
    Number(getSafe(entite, "magicalPower")) ||
    0;

  const eased = easeOutPowerRatio(magicAttack, cfg.magicalPowerCap, cfg.curvePower);

  const bonus = cfg.magicalPowerMaxBonusPercent * eased;
  return roundBalance(clamp(bonus, 0, cfg.magicalPowerMaxBonusPercent), cfg.decimals);
}

export function calculateBrokenSpellDamage(entite) {
  if (!entite) return 0.0;
  const cfg = balanceData.brokenSpell.damage;

  const total =
    (baseBrokenSpellDamage() - intelBrokenSpellBaseDamage(entite)) +
    magicalBrokenSpellDamage(entite);

  return roundBalance(clamp(total, 0, cfg.maxPercent), cfg.decimals);
}
export function attemptRangeBrokenSpell(attacker, target, attack) {
  // Garde-fous
  if (!attacker || !attack || !canEntityProc(attacker)) {
    return { success: false, damagePct: 0, roll: 0, chance: 0 };
  }

  // Conditions d’éligibilité : range + magique exclusif
  const isRange = attack.attackRange && attack.attackRange.includes("range");
  const n = Array.isArray(attack.attacknature) ? attack.attacknature : [];
  const isMagicalOnly =
    n.includes("magicalDamage") &&
    !n.includes("physicalDamage") &&
    !n.includes("hybridDamage"); // si tu utilises ce tag

  if (!isRange || !isMagicalOnly) {
    return { success: false, damagePct: 0, roll: 0, chance: 0 };
  }

  // Jet
  const chance = calculateBrokenSpellChance(attacker); // 0..100 (1 décimale)
  const roll = Math.random() * 100;
  const success = roll < chance;

  console.log(
    `💥 [Broken Spell] ${attacker.name}${target?.name ? ` → ${target.name}` : ""} — chance ${chance.toFixed(
      1
    )}% | jet ${roll.toFixed(1)} → ${success ? "✅ PÈTE (retour)" : "❌ ok"}`
  );

  // Si ça pète : on calcule le % de dégâts renvoyés + VFX sur le lanceur
  let damagePct = 0;

  if (success) {
    damagePct = calculateBrokenSpellDamage(attacker); // 0..100 (1 décimale)

    presentBrokenSpell(attacker, damagePct);
  }

  return { success, damagePct, roll, chance };
}
export function attemptMeleeBrokenSpell(attacker, target, attack) {
  if (!attacker || !attack || !canEntityProc(attacker)) {
    return { success: false, damagePct: 0, roll: 0, chance: 0 };
  }

  // Conditions : melee + magique exclusif
  const isMelee = attack.attackRange && attack.attackRange.includes("melee");
  const n = Array.isArray(attack.attacknature) ? attack.attacknature : [];
  const isMagicalOnly =
    n.includes("magicalDamage") &&
    !n.includes("physicalDamage") &&
    !n.includes("hybridDamage");

  if (!isMelee || !isMagicalOnly) {
    return { success: false, damagePct: 0, roll: 0, chance: 0 };
  }

  const chance = calculateBrokenSpellChance(attacker); // 0..100
  const roll = Math.random() * 100;
  const success = roll < chance;

  console.log(
    `💥 [Broken Spell MELEE] ${attacker.name}${target?.name ? ` → ${target.name}` : ""} — chance ${chance.toFixed(
      1
    )}% | jet ${roll.toFixed(1)} → ${success ? "✅ PÈTE (double hit)" : "❌ ok"}`
  );

  let damagePct = 0;

  // helper : applique VFX + message sur une entité donnée


  if (success) {
    damagePct = calculateBrokenSpellDamage(attacker); // 0..100

    // VFX + message sur le lanceur ET la cible (si cible valide)
    if (attacker?.id) presentBrokenSpell(attacker, damagePct);
    if (target && target.id !== attacker.id) {
      if (target?.id) presentBrokenSpell(target, damagePct);
    }
  }

  return { success, damagePct, roll, chance };
}


// MELEE GENERAL BONUS
// 0 STR -> 0%
// 150 STR -> 10% max
// bonus entier, arrondi inférieur
export function calculateExecStrengthRatio(strength) {
  const cfg = balanceData.melee.execution;
  const str = Math.max(0, Number(strength) || 0);
  if (str === 0) return 0;

  const ratio = (str / cfg.strengthCap) * cfg.strengthMaxPercent;
  const capped = Math.min(ratio, cfg.strengthMaxPercent);
  return Math.floor(capped);
}

export function calculateMeleeExecBonus(attacker, ctx) {
  if (ctx && typeof ctx === 'object' && getAttackNatureRules(ctx).isInert) return 0;
  const cfg = balanceData.melee.execution;
  let bonus = cfg.basePercent;

  // ctx peut être : statKey (string) OU attack (object)
  const type =
    (typeof ctx === "string")
      ? ctx
      : (ctx?.statKey || ctx?.key || ctx?.attackKey || ctx?.type || null);

  if (type === "meleeAttackMagical") bonus += cfg.magicalTypeBonus;
  if (type === "meleeAttackHybridal") bonus += cfg.hybridalTypeBonus;
  if (type === "meleeAttackpiercing") bonus += cfg.piercingTypeBonus;

  return Math.floor(bonus); // entier
}

export function totalMeleeExecReduction(entite, ctx = null) {
  const attackExecutionReduc = Number(getFinalAttackExecutionReduc(entite)) || 0;
  const meleeReduc = Number(calculateMeleeExecBonus(entite, ctx)) || 0;

  const strength = Number(getSafe(entite, "strength", 0)) || 0;
  const strengthReduc = Number(calculateExecStrengthRatio(strength)) || 0;

  return clampPercent(attackExecutionReduc + meleeReduc + strengthReduc, 0, balanceData.attackTime.reductionCapPercent);
}

export function attemptMeleeExecBonus(attacker, attack, baseExecMs) {
  const base = Number(baseExecMs) || 0;

  const attackTimeCap = balanceData.attackTime.reductionCapPercent;
  const attackExecutionReduc = clampPercent(
    Number(getFinalAttackExecutionReduc(attacker)) || 0,
    0,
    attackTimeCap
  );
  const hasteReduc = clampPercent(Number(calculateHasteExecReduc(attacker)) || 0, 0, attackTimeCap);
  const directExecReduc = Math.max(0, attackExecutionReduc - hasteReduc);
  const meleeReduc = clampPercent(Number(calculateMeleeExecBonus(attacker, attack)) || 0, 0, attackTimeCap);

  const strength = Number(getSafe(attacker, "strength", 0)) || 0;
  const strengthReduc = clampPercent(
    Number(calculateExecStrengthRatio(strength)) || 0,
    0,
    balanceData.melee.execution.strengthMaxPercent
  );

  const totalReduc = clampPercent(attackExecutionReduc + meleeReduc + strengthReduc, 0, attackTimeCap);
  const finalExecMs = applyReducToMs(base, totalReduc);

  return {
    applied: totalReduc > 0,
    totalReduc,
    baseExecMs: base,
    finalExecMs,
    debug: {
      baseExecMs: base,
      attackExecutionReduc,
      directExecReduc,
      hasteReduc,
      meleeReduc,
      strengthReduc,
      totalReduc,
      finalExecMs
    },
  };
}
// piercing GENERAL BONUS (RECUP)
// 0 AGI -> 0%
// 150 AGI -> 10% max
// bonus entier, arrondi inférieur
export function calculateRecupAgilityRatio(agility) {
  const cfg = balanceData.piercing.recovery;
  const agi = Math.max(0, Number(agility) || 0);
  if (agi === 0) return 0;

  const ratio = (agi / cfg.agilityCap) * cfg.agilityMaxPercent;
  const capped = Math.min(ratio, cfg.agilityMaxPercent);
  return Math.floor(capped);
}

export function calculatePiercingRecupBonus(entite, attack = null) {
  return balanceData.piercing.recovery.piercingBasePercent + getAttackNatureRules(attack || entite?.currentAttack).recoveryExtra;
}

export function calculateTranspiercingRecupBonus(entite, attack = null) {
  return balanceData.piercing.recovery.transpiercingBasePercent + getAttackNatureRules(attack || entite?.currentAttack).recoveryExtra;
}

export function calculatePiercingRecupAgiRatio(entite) {
  const cfg = balanceData.piercing.recovery;
  const agility = Number(getSafe(entite, "agility", 0)) || 0;

  return Math.round(cfg.agilityMaxPercent * (agility / (agility + cfg.agilitySoftCapDivider)));
}

export function calculateTranspiercingRecupAgiRatio(entite) {
  const cfg = balanceData.piercing.recovery;
  const agility = Math.max(0, Number(getSafe(entite, "agility", 0)) || 0);

  return Math.round(cfg.transpiercingAgilityMultiplier * Math.log1p(agility / cfg.transpiercingAgilityDivider));
}
export function totalPiercingRecupReductionWithAgi(entite, attack = null) {
  const piercingRecup = Number(calculatePiercingRecupBonus(entite, attack)) || 0;
  const agiRecup = Number(calculatePiercingRecupAgiRatio(entite)) || 0;
  return clampPercent(piercingRecup + agiRecup, 0, balanceData.piercing.recovery.maxReductionPercent);
}

export function totalTranspiercingRecupReductionWithAgi(entite, attack = null) {
  const transpiercingRecup = Number(calculateTranspiercingRecupBonus(entite, attack)) || 0;
  const agiRecup = Number(calculateTranspiercingRecupAgiRatio(entite)) || 0;
  return clampPercent(transpiercingRecup + agiRecup, 0, balanceData.piercing.recovery.maxReductionPercent);
}

export function attemptPiercingRecupBonus(attacker, attack, baseRecupMs) {
  const base = Number(baseRecupMs) || 0;

  const maxReduction = balanceData.piercing.recovery.maxReductionPercent;
  const hasteRecup = clampPercent(Number(calculateHasteRecupReduc(attacker)) || 0, 0, maxReduction);
  const piercingRecup = clampPercent(Number(calculatePiercingRecupBonus(attacker, attack)) || 0, 0, maxReduction);

  const agility = Number(getSafe(attacker, "agility", 0)) || 0;
  const agiRecup = clampPercent(Number(calculateRecupAgilityRatio(agility)) || 0, 0, balanceData.piercing.recovery.agilityMaxPercent);

  const totalReduc = clampPercent(hasteRecup + piercingRecup + agiRecup, 0, maxReduction);
  const finalRecupMs = applyReducToMs(base, totalReduc);

  return {
    applied: totalReduc > 0,
    totalReduc,
    baseRecupMs: base,
    finalRecupMs,
    debug: {
      baseRecupMs: base,
      hasteRecup,
      piercingRecup,
      agility,
      agiRecup,
      totalReduc,
      finalRecupMs,
    },
  };
}

function getGeneratedUmbraStatsConfig() {
  return balanceData.generatedUmbraStats || { tiers: [], sources: {} };
}

export function getGeneratedUmbraStatConfigs() {
  const cfg = getGeneratedUmbraStatsConfig();
  const sources = cfg.sources && typeof cfg.sources === "object" ? cfg.sources : {};

  return Object.entries(sources).reduce((acc, [sourceKey, sourceCfg]) => {
    const source = normalizeStatKey(sourceKey);
    const target = normalizeStatKey(sourceCfg?.target);
    const attribute = normalizeStatKey(sourceCfg?.attribute);
    if (!source || !target || !attribute) return acc;

    acc[source] = {
      source,
      target,
      attribute,
      progressive: !!sourceCfg.progressive,
      ratioPercent: !!sourceCfg.ratioPercent,
      maxPercent: Number(sourceCfg.maxPercent) || 0,
      constant: Math.max(0, Number(sourceCfg.constant) || 0),
      flatPerPoint: Number(sourceCfg.flatPerPoint) || 0,
      decimals: Math.max(0, Number(sourceCfg.decimals ?? 0) || 0),
      tiers: Array.isArray(sourceCfg.tiers) ? sourceCfg.tiers : cfg.tiers,
      ratios: sourceCfg.ratios ? {
        source: Math.max(0, Number(sourceCfg.ratios.source ?? 1) || 0),
        attribute: Math.max(0, Number(sourceCfg.ratios.attribute) || 0),
      } : null,
    };
    return acc;
  }, {});
}

export function getGeneratedUmbraSourceKeys() {
  return Object.keys(getGeneratedUmbraStatConfigs());
}

export function getGeneratedUmbraTargetKeys() {
  return [
    ...new Set(
      Object.values(getGeneratedUmbraStatConfigs())
        .map(cfg => cfg.target)
        .filter(Boolean)
    ),
  ];
}

export function getGeneratedUmbraSourceForTarget(targetKey) {
  const target = normalizeStatKey(targetKey);
  return Object.values(getGeneratedUmbraStatConfigs())
    .find(cfg => cfg.target === target)?.source || null;
}

export function getGeneratedUmbraStatConfig(sourceKey) {
  return getGeneratedUmbraStatConfigs()[normalizeStatKey(sourceKey)] || null;
}

export function getGeneratedUmbraStatTier(sourceKey, attributeValue) {
  const cfg = getGeneratedUmbraStatConfig(sourceKey);
  const attribute = Math.max(0, Number(attributeValue) || 0);
  const tiers = Array.isArray(cfg?.tiers) ? cfg.tiers : [];

  return tiers.find((tier) => {
    const min = Number(tier.minAttribute ?? 0) || 0;
    const rawMax = tier.maxAttribute === Infinity
      ? Infinity
      : Number(tier.maxAttribute ?? Infinity);
    const max = Number.isFinite(rawMax) ? rawMax : Infinity;
    return attribute >= min && attribute <= max;
  }) || tiers[0] || { minAttribute: 0, maxAttribute: Infinity, multiplier: 0 };
}

export function calculateGeneratedUmbraStatRatio(entite, sourceKey, attributeOverride = null) {
  const cfg = getGeneratedUmbraStatConfig(sourceKey);
  if (!cfg) return 0;
  if (cfg.progressive || cfg.ratioPercent) return cfg.ratios.source * getProgressiveRatio(getSafe(entite, cfg.source, 0), cfg.source, getUmbraThreshold(entite));
  if (cfg.ratios) return cfg.ratios.source;

  const attributeValue = Math.max(
    0,
    Number(attributeOverride ?? getSafe(entite, cfg.attribute, 0)) || 0
  );

  return Number(getGeneratedUmbraStatTier(sourceKey, attributeValue)?.multiplier ?? 0) || 0;
}

export function calculateGeneratedUmbraStatBonus(
  entite,
  sourceKey,
  sourceOverride = null,
  attributeOverride = null
) {
  const cfg = getGeneratedUmbraStatConfig(sourceKey);
  if (!cfg) return 0;

  const sourceValue = Math.max(
    0,
    Number(sourceOverride ?? getSafe(entite, cfg.source, 0)) || 0
  );
  if (sourceValue <= 0) return 0;

  if (cfg.ratioPercent) return globalThis.umbraProgression.vivaciteDetails(cfg.target, sourceValue,
    Number(attributeOverride ?? getSafe(entite, cfg.attribute, 0)) || 0, 0, 0, undefined, getUmbraThreshold(entite)).generated;
  if (cfg.progressive) return calculateProgressivePower(sourceValue,
    Number(attributeOverride ?? getSafe(entite, cfg.attribute, 0)) || 0, cfg, cfg.source, getUmbraThreshold(entite));

  const ratio = calculateGeneratedUmbraStatRatio(entite, cfg.source, attributeOverride);
  const attributeBonus = cfg.ratios
    ? Math.max(0, Number(attributeOverride ?? getSafe(entite, cfg.attribute, 0)) || 0) * cfg.ratios.attribute
    : 0;
  const factor = 10 ** cfg.decimals;
  const bonus = Math.round((sourceValue * ratio + attributeBonus) * factor) / factor;

  return Object.is(bonus, -0) ? 0 : bonus;
}

export function calculateGeneratedUmbraStats(entite) {
  const generated = {};

  for (const cfg of Object.values(getGeneratedUmbraStatConfigs())) {
    const bonus = calculateGeneratedUmbraStatBonus(entite, cfg.source);
    if (bonus > 0) {
      generated[cfg.target] = (Number(generated[cfg.target]) || 0) + bonus;
    }
  }

  return generated;
}

function getGeneratedUmbraStatName(statKey) {
  const key = normalizeStatKey(statKey);
  return stats.find(stat => normalizeStatKey(stat.key) === key)?.name || key;
}

export function getGeneratedUmbraStatDetail(
  entite,
  sourceKey,
  sourceOverride = null,
  attributeOverride = null
) {
  const cfg = getGeneratedUmbraStatConfig(sourceKey);
  if (!cfg) return null;

  const sourceValue = Math.max(
    0,
    Number(sourceOverride ?? getSafe(entite, cfg.source, 0)) || 0
  );
  const attributeValue = Math.max(
    0,
    Number(attributeOverride ?? getSafe(entite, cfg.attribute, 0)) || 0
  );
  const tier = cfg.ratios ? null : getGeneratedUmbraStatTier(cfg.source, attributeValue);
  const ratio = cfg.progressive ? cfg.ratios.source * getProgressiveRatio(sourceValue, cfg.source, getUmbraThreshold(entite))
    : calculateGeneratedUmbraStatRatio(entite, cfg.source, attributeValue);
  const bonus = calculateGeneratedUmbraStatBonus(entite, cfg.source, sourceValue, attributeValue);
  const factor = 10 ** cfg.decimals;
  const system = calculateStatSources({ [cfg.source]: sourceValue, [cfg.attribute]: attributeValue }, cfg.target, { effective: true, seuilUmbra: getUmbraThreshold(entite) });
  const sourceBonus = cfg.progressive || cfg.ratioPercent ? system.base : cfg.ratios ? Math.round(sourceValue * ratio * factor) / factor : sourceValue;

  return {
    ...cfg,
    sourceValue,
    attributeValue,
    tier,
    ratio,
    bonus,
    system,
    flatBonus: system.umbraFlat,
    sourceBonus,
    attributeBonus: bonus - sourceBonus - system.umbraFlat,
    sourceLabel: getGeneratedUmbraStatName(cfg.source),
    targetLabel: getGeneratedUmbraStatName(cfg.target),
    attributeLabel: getGeneratedUmbraStatName(cfg.attribute),
  };
}

export function getGeneratedUmbraTargetDetail(entite, targetKey, finalOverride = null) {
  const target = normalizeStatKey(targetKey);
  const source = getGeneratedUmbraSourceForTarget(target);
  if (!source) return null;

  const detail = getGeneratedUmbraStatDetail(entite, source);
  if (!detail) return null;

  const pool = getSafe(entite, target, 0);
  const finalValue = Math.max(0, number(finalOverride ?? (target === 'armor'
    ? pool?.totalMax ?? getStatSystemResult(entite, target)?.value ?? pool : pool)));
  const generatedBonus = Math.min(finalValue, Math.max(0, Number(detail.bonus) || 0));

  return {
    ...detail,
    finalValue,
    generatedBonus,
    autonomousValue: Math.max(0, finalValue - generatedBonus),
  };
}

export function brutalityPercantBonus(entite) {
  const cfg = balanceData.damageIntensifiers.brutality;
  const strength = Math.max(0, Number(getSafe(entite, "strength", 0)) || 0);
  const base = cfg.piercingBasePercent + getAttackPurity(entite?.currentAttack).bonus;
  const ratioBonus = brutalityBonus(entite);
  return Math.round(base + ratioBonus);
}

export function brutalityBonus(entite) {
  const cfg = balanceData.damageIntensifiers.brutality;
  const strength = Math.max(0, Number(getSafe(entite, "strength", 0)) || 0);
  return Math.max(cfg.minBonus, Math.round(cfg.maxRatioPercent * (strength / (strength + cfg.softCapDivider))));
}

export function brutalityPhysicalPowerBonus(entite) {
  const physicalPower = Math.max(0, Number(getSafe(entite, "physicalDamage", 0)) || 0);
  const ratioBonusPercent = brutalityBonus(entite) + getAttackPurity(entite?.currentAttack).bonus;
  return Math.max(balanceData.damageIntensifiers.brutality.minBonus, Math.round(physicalPower * (ratioBonusPercent / 100)) );
}

export function brutalityTotalBonus(entite) {
  const physicalPower = Math.max(0, Number(getSafe(entite, "physicalDamage", 0)) || 0);
  return physicalPower + brutalityPhysicalPowerBonus(entite);
}
function getPsionicDamageIntensifierConfig() {
  return balanceData.damageIntensifiers.psionic
    || balanceData.damageIntensifiers.intellect;
}

export function psionicPercantBonus(entite) {
  const cfg = getPsionicDamageIntensifierConfig();
  const base = cfg.piercingBasePercent + getAttackPurity(entite?.currentAttack).bonus;
  const ratioBonus = psionicBonus(entite);
  return Math.round(base + ratioBonus);
}

export function psionicBonus(entite) {
  const cfg = getPsionicDamageIntensifierConfig();
  const intelligence = Math.max(0, Number(getSafe(entite, "intelligence", 0)) || 0);
  return Math.max(cfg.minBonus, Math.round(cfg.maxRatioPercent * (intelligence / (intelligence + cfg.softCapDivider))));
}

export function psionicPMBonus(entite) {
  const magicalPower = Math.max(0, calculateMagicalTotal(entite));
  const ratioBonusPercent = psionicBonus(entite) + getAttackPurity(entite?.currentAttack).bonus;

  return Math.max(
    getPsionicDamageIntensifierConfig().minBonus,
    Math.round(magicalPower * (ratioBonusPercent / 100))
  );
}

export function psionicTotalBonus(entite) {
  const magicalPower = Math.max(0, calculateMagicalTotal(entite));

  return magicalPower + psionicPMBonus(entite);
}

export const intellectPercantBonus = psionicPercantBonus;
export const intellectBonus = psionicBonus;
export const intellectPMBonus = psionicPMBonus;
export const intellectTotalBonus = psionicTotalBonus;

export function attemptMysticismTrance(entite) {
  const chance = canEntityProc(entite) ? calculateMysticismProcChance(entite) : 0;

  if (chance <= 0) {
    return {
      success: false,
      chance: 0,
      roll: null,
      durationMs: 0,
      accelerationPercent: 0,
    };
  }

  const roll = Math.random() * 100;
  const success = roll < chance;

  const durationMs = success ? calculateMysticismTranceDuration(entite) : 0;
  const accelerationPercent = success
    ? calculateMysticismPreparationAcceleration(entite)
    : 0;

  console.log(
    `🔮 ${entite.name} → Mysticisme : ${chance}% | roll ${roll.toFixed(2)} → ${
      success ? "✅ TRANSE" : "❌ échec"
    }`
  );

  if (success) {
    const stopMysticismAnimation = animateMysticism(entite.id, durationMs);

    if (typeof stopMysticismAnimation === "function") {
      entite.stopMysticismAnimation = stopMysticismAnimation;
    }

    EffectMessage(entite, "Transe mystique !");
  }

  return {
    success,
    chance,
    roll: Number(roll.toFixed(2)),
    durationMs,
    accelerationPercent,
  };
}
function getMysticismValue(entite) {
  return Number(getSafe(entite, "mysticism", 0)) || 0;
}

function getIntelligenceValue(entite) {
  return Number(getSafe(entite, "intelligence", 0)) || 0;
}

function roundMysticismValue(value, decimals = balanceData.mysticism.proc.decimals) {
  return roundBalance(value, decimals);
}

function calculateMysticismSoftCapBonus(intelligence, maxBonus, targetIntel, curvePower = 2) {
  const intel = Math.max(0, Number(intelligence) || 0);
  const ratio = Math.min(intel / targetIntel, 1);
  return maxBonus * (1 - Math.pow(1 - ratio, curvePower));
}

export function calculateMysticismBaseProcChance(entite) {
  return getMysticismValue(entite) > 0 ? balanceData.mysticism.proc.baseChancePercent : 0;
}

export function calculateMysticismIntelProcChance(entite) {
  const cfg = balanceData.mysticism.proc;
  if (getMysticismValue(entite) <= 0) return 0;
  return roundMysticismValue(
    calculateMysticismSoftCapBonus(getIntelligenceValue(entite), cfg.intelligenceMaxBonusPercent, cfg.intelligenceTarget, cfg.curvePower),
    cfg.decimals
  );
}

export function calculateMysticismProcChance(entite) {
  const cfg = balanceData.mysticism.proc;
  if (getMysticismValue(entite) <= 0) return 0;
  return roundMysticismValue(
    calculateMysticismBaseProcChance(entite) + calculateMysticismIntelProcChance(entite),
    cfg.totalDecimals
  );
}

export function calculateMysticismBaseTranceDuration(entite) {
  return getMysticismValue(entite) > 0 ? balanceData.mysticism.trance.baseDurationMs : 0;
}

export function calculateMysticismIntelTranceDuration(entite) {
  const cfg = balanceData.mysticism.trance;
  if (getMysticismValue(entite) <= 0) return 0;
  return Math.round(
    calculateMysticismSoftCapBonus(getIntelligenceValue(entite), cfg.intelligenceMaxSeconds, cfg.intelligenceTarget, cfg.curvePower) * 1000
  );
}

export function calculateMysticismTranceDuration(entite) {
  if (getMysticismValue(entite) <= 0) return 0;
  return calculateMysticismBaseTranceDuration(entite) + calculateMysticismIntelTranceDuration(entite);
}

export function calculateMysticismBasePreparationAcceleration(entite) {
  return getMysticismValue(entite) > 0 ? balanceData.mysticism.preparation.baseAccelerationPercent : 0;
}

export function calculateMysticismIntelPreparationAcceleration(entite) {
  const cfg = balanceData.mysticism.preparation;
  if (getMysticismValue(entite) <= 0) return 0;
  return roundMysticismValue(
    calculateMysticismSoftCapBonus(getIntelligenceValue(entite), cfg.intelligenceMaxBonusPercent, cfg.intelligenceTarget, cfg.curvePower),
    cfg.decimals
  );
}

export function calculateMysticismPreparationAcceleration(entite) {
  const cfg = balanceData.mysticism.preparation;
  if (getMysticismValue(entite) <= 0) return 0;
  return roundMysticismValue(
    calculateMysticismBasePreparationAcceleration(entite) +
      calculateMysticismIntelPreparationAcceleration(entite),
    cfg.decimals
  );
}

export function calculateMysticismBaseDamageBonus(entite) {
  return getMysticismValue(entite) > 0 ? balanceData.mysticism.damage.baseBonusPercent : 0;
}

export function calculateMysticismIntelDamageBonus(entite) {
  const cfg = balanceData.mysticism.damage;
  if (getMysticismValue(entite) <= 0) return 0;
  return roundMysticismValue(
    calculateMysticismSoftCapBonus(getIntelligenceValue(entite), cfg.intelligenceMaxBonusPercent, cfg.intelligenceTarget, cfg.curvePower),
    cfg.decimals
  );
}

export function calculateMysticismTotalDamageBonus(attacker) {
  const cfg = balanceData.mysticism.damage;
  if (getMysticismValue(attacker) <= 0) return 0;
  return roundMysticismValue(
    calculateMysticismBaseDamageBonus(attacker) + calculateMysticismIntelDamageBonus(attacker),
    cfg.decimals
  );
}
export function vivaciteResult(entity, key) {
  const system = getStatSystemResult(entity, key);
  if (system) return system;
  const inputs = entity?.baseStats ? getStatSystemInputs(entity) : { ...entity?.stats, vivacite: getSafe(entity, 'vivacite', 0) };
  return calculateStatSources(inputs, key, { effective: true, seuilUmbra: getUmbraThreshold(entity) });
}
export function calculateControlledSpeed(entity) { return vivaciteResult(entity, 'controlledSpeed').value; }
export function calculateAgileRetreatChance(entity) { return globalThis.umbraProgression.retreatChance(vivaciteResult(entity, 'velocity').value); }
export function equilibreResult(entity, key) {
  const system = getStatSystemResult(entity, key);
  if (system) return system;
  const inputs = entity?.baseStats ? getStatSystemInputs(entity)
    : { ...entity?.stats, equilibre: getSafe(entity, 'equilibre', 0) };
  return calculateStatSources(inputs, key, { effective: true, seuilUmbra: getUmbraThreshold(entity) });
}
export function calculateEquilibreBaseAggroReduction(entity) {
  return equilibreResult(entity, 'equilibreAggroReduction').base;
}
export function calculateEquilibreIntelAggroReduction(entity) {
  return equilibreResult(entity, 'equilibreAggroReduction').bonuses[0]?.value || 0;
}
export function calculateEquilibreAggroReduction(entity) {
  return equilibreResult(entity, 'equilibreAggroReduction').value;
}
export function calculateEquilibreBaseInvisibleDetection(entity) {
  return equilibreResult(entity, 'equilibreInvisibleDetection').base;
}
export function calculateEquilibreAgiInvisibleDetection(entity) {
  return equilibreResult(entity, 'equilibreInvisibleDetection').bonuses[0]?.value || 0;
}
export function calculateEquilibreInvisibleDetection(entity) {
  return equilibreResult(entity, 'equilibreInvisibleDetection').value;
}
export function calculateEquilibreBaseBalancedAttackChance(entity) {
  return globalThis.umbraProgression.balancedAttackDetails(equilibreResult(entity, 'equilibreBalancedAttackChance').umbra, 0, undefined, getUmbraThreshold(entity)).percent;
}
export function calculateEquilibreIntelBalancedAttackChance(entity) {
  return equilibreResult(entity, 'equilibreBalancedAttackChance').generated - calculateEquilibreBaseBalancedAttackChance(entity);
}
export function calculateEquilibreAttackChance(entity) {
  return equilibreResult(entity, 'equilibreBalancedAttackChance').value;
}
export function attemptEquilibreAttack(entite) {
  const chance = canEntityProc(entite) ? calculateEquilibreAttackChance(entite) : 0;

  if (chance <= 0) {
    entite.attackBalancedNoAggro = false;
    return { success: false, chance: 0, roll: null };
  }

  const roll = Math.random() * 100;
  const success = roll < chance;

  entite.attackBalancedNoAggro = success;

  if (entite.currentAttack) {
    entite.currentAttack.isBalancedNoAggro = success;
  }

  console.log(
    `⚖️ ${entite.name} → Attaque équilibrée : ${chance}% | roll ${roll.toFixed(2)} → ${
      success ? "✅ 0 aggro" : "❌ aggro normale"
    }`
  );

  if (success) {
    const sprite = document.getElementById(`DragSprite_${entite.id}`);
    let effectsContainer = document.getElementById(`effectsContainer_${entite.id}`);

    if (!effectsContainer && sprite?.parentNode) {
      effectsContainer = document.createElement("div");
      effectsContainer.id = `effectsContainer_${entite.id}`;
      effectsContainer.className = "effects-container";
      sprite.parentNode.appendChild(effectsContainer);
    }

    if (effectsContainer) {
      const balanceVFX = document.createElement("img");
      playCachedGif(balanceVFX, `./media/assets/effects/balance-strike.gif`);
      balanceVFX.className = "effect-vfx balance-strike";
      balanceVFX.alt = "";
      balanceVFX.style.position = "absolute";
      balanceVFX.style.pointerEvents = "none";
      balanceVFX.style.zIndex = "12";

      effectsContainer.appendChild(balanceVFX);
      removeCombatVisualAfter(balanceVFX, 3500);
    }

    EffectMessage(entite, "Attaque équilibrée !");
  }

  return {
    success,
    chance,
    roll: Number(roll.toFixed(2)),
  };
}
const FORCED_INVISIBLE_TARGET_ACCURACY_FLAG = "forcedInvisibleTargetAccuracy";

export function isOccultismInvisibleTarget(target) {
  return (
    Boolean(target?.flags?.occultismInvisible) ||
    Boolean(target?.isInvisible) ||
    Boolean(target?.invisible)
  );
}

export function markForcedInvisibleTargetAccuracy(attacker, target, source = "targeting") {
  if (!attacker || !target || target.id == null || !isOccultismInvisibleTarget(target)) return;

  if (!attacker.flags || typeof attacker.flags !== "object") {
    attacker.flags = {};
  }

  attacker.flags[FORCED_INVISIBLE_TARGET_ACCURACY_FLAG] = {
    targetId: String(target.id),
    source,
    createdAt: clockNow(),
  };
}

export function clearForcedInvisibleTargetAccuracy(attacker, target = null) {
  const marker = attacker?.flags?.[FORCED_INVISIBLE_TARGET_ACCURACY_FLAG];
  if (!marker) return;

  if (target?.id != null && String(marker.targetId) !== String(target.id)) {
    return;
  }

  delete attacker.flags[FORCED_INVISIBLE_TARGET_ACCURACY_FLAG];
}

export function shouldApplyForcedInvisibleTargetAccuracy(attacker, target) {
  const marker = attacker?.flags?.[FORCED_INVISIBLE_TARGET_ACCURACY_FLAG];
  if (!marker || !target || target.id == null) return false;
  if (String(marker.targetId) !== String(target.id)) return false;

  return isOccultismInvisibleTarget(target);
}

function getOccultismValue(entite) {
  return Number(getSafe(entite, "occultism", 0)) || 0;
}

function getOccultismAgilityValue(entite) {
  return Number(getSafe(entite, "agility", 0)) || 0;
}

function roundOccultismValue(value, decimals = balanceData.occultism.invisibility.decimals) {
  return roundBalance(value, decimals);
}

function calculateOccultismSoftCapBonus(value, maxBonus, targetValue, curvePower = 2) {
  const v = Math.max(0, Number(value) || 0);
  const ratio = Math.min(v / targetValue, 1);
  return maxBonus * (1 - Math.pow(1 - ratio, curvePower));
}

export function calculateOccultismBaseInvisibilityChance(entite) {
  return getOccultismValue(entite) > 0 ? balanceData.occultism.invisibility.baseChancePercent : 0;
}

export function calculateOccultismAgiInvisibilityChance(entite) {
  const cfg = balanceData.occultism.invisibility;
  if (getOccultismValue(entite) <= 0) return 0;
  return roundOccultismValue(
    calculateOccultismSoftCapBonus(getOccultismAgilityValue(entite), cfg.agilityMaxBonusPercent, cfg.agilityTarget, cfg.curvePower),
    cfg.decimals
  );
}

export function calculateOccultismInvisibilityChance(entite) {
  const cfg = balanceData.occultism.invisibility;
  if (getOccultismValue(entite) <= 0) return 0;
  return roundOccultismValue(
    calculateOccultismBaseInvisibilityChance(entite) +
      calculateOccultismAgiInvisibilityChance(entite),
    cfg.decimals
  );
}

export function calculateOccultismBaseTargetableChance(entite) {
  return getOccultismValue(entite) > 0 ? balanceData.occultism.targetable.baseChancePercent : 0;
}

export function calculateOccultismAgiTargetableChance(entite) {
  const cfg = balanceData.occultism.targetable;
  if (getOccultismValue(entite) <= 0) return 0;
  return roundOccultismValue(
    calculateOccultismSoftCapBonus(getOccultismAgilityValue(entite), cfg.agilityMaxBonusPercent, cfg.agilityTarget, cfg.curvePower),
    cfg.decimals
  );
}

export function calculateOccultismTargetableChance(entite) {
  const cfg = balanceData.occultism.targetable;
  if (getOccultismValue(entite) <= 0) return 0;
  return roundOccultismValue(
    calculateOccultismBaseTargetableChance(entite) -
      calculateOccultismAgiTargetableChance(entite),
    cfg.decimals
  );
}

export function calculateOccultismBaseDodgeBonus(entite) {
  return getOccultismValue(entite) > 0 ? balanceData.occultism.dodge.baseBonusPercent : 0;
}

export function calculateOccultismAgiDodgeBonus(entite) {
  const cfg = balanceData.occultism.dodge;
  if (getOccultismValue(entite) <= 0) return 0;

  return Math.round(
    calculateOccultismSoftCapBonus(getOccultismAgilityValue(entite), cfg.agilityMaxBonusPercent, cfg.agilityTarget, cfg.curvePower)
  );
}

export function calculateOccultismDodgeBonus(entite) {
  if (getOccultismValue(entite) <= 0) return 0;

  return Math.round(
    calculateOccultismBaseDodgeBonus(entite) +
    calculateOccultismAgiDodgeBonus(entite)
  );
}

export function calculateOccultismBaseCritChanceBonus(entite) {
  return balanceData.occultism.critical.baseChanceBonusPercent;
}

export function calculateOccultismAgiCritChanceBonus(entite) {
  const cfg = balanceData.occultism.critical;
  if (getOccultismValue(entite) <= 0) return 0;
  return roundOccultismValue(
    calculateOccultismSoftCapBonus(getOccultismAgilityValue(entite), cfg.agilityMaxBonusPercent, cfg.agilityTarget, cfg.curvePower),
    cfg.decimals
  );
}

export function calculateOccultismCritChanceBonus(entite) {
  const cfg = balanceData.occultism.critical;
  if (getOccultismValue(entite) <= 0) return 0;
  return roundOccultismValue(
    calculateOccultismAgiCritChanceBonus(entite),
    cfg.decimals
  );
}
export function calculateOccultismShadowFragilityPercent(entite) {
  return getOccultismValue(entite) > 0 ? balanceData.occultism.drawbacks.shadowFragilityPercent : 0;
}
export function calculateOccultismPreparationSpeedDebuff(entite) {
  return getOccultismValue(entite) > 0 ? balanceData.occultism.drawbacks.preparationSpeedDebuffPercent : 0;
}
export function calculateOccultismTargetableChanceDisplay(entite) {
  const cfg = balanceData.occultism.targetable;
  if (getOccultismValue(entite) <= 0) return 0;
  return roundOccultismValue(cfg.displayBasePercent - calculateOccultismTargetableChance(entite), cfg.decimals);
}

function getOccultismDomNodes(entite) {
  const id = entite?.id;
  if (!id) return [];

  return [
    getBattleEntityElement(entite),
    document.getElementById(`DragSprite_${id}`),
    document.getElementById(`spriteCanvas_${id}`),
    document.getElementById(`Animationsprite_${id}`),
  ].filter(Boolean);
}

export function setOccultismInvisibleState(entite) {
  if (!entite) return;

  entite.isInvisible = true;
  entite.invisible = true;

  entite.flags = entite.flags || {};
  entite.flags.occultismInvisible = true;

  getOccultismDomNodes(entite).forEach(node => {
    node.classList.add("invisible", "occultism-invisible");
    node.dataset.invisible = "true";
  });
}

export function clearOccultismInvisibleState(entite) {
  if (!entite) return;

  entite.isInvisible = false;
  entite.invisible = false;

  if (entite.flags) {
    entite.flags.occultismInvisible = false;
  }

if (typeof entite.stopOccultismAnimation === "function") {
  entite.stopOccultismAnimation();
  entite.stopOccultismAnimation = null;
}

if (typeof entite.removeOccultismDodgeBoost === "function") {
  entite.removeOccultismDodgeBoost();
  entite.removeOccultismDodgeBoost = null;
}

  getOccultismDomNodes(entite).forEach(node => {
    if (node.classList.contains("invisible") || node.classList.contains("occultism-invisible")) {
      node.classList.remove("invisible", "occultism-invisible");
    }
    if (node.hasAttribute('data-invisible')) delete node.dataset.invisible;
  });
}
export function attemptOccultismInvisibility(entite) {
  const chance = canEntityProc(entite) ? calculateOccultismInvisibilityChance(entite) : 0;

  if (chance <= 0) {
    return { success: false, chance: 0, roll: null };
  }

  const roll = Math.random() * 100;
  const success = roll < chance;

  console.log(
    `🌑 ${entite.name} → Occultisme : ${chance}% | roll ${roll.toFixed(2)} → ${
      success ? "✅ INVISIBLE jusqu'à la fin de la préparation" : "❌ visible"
    }`
  );

  if (success) {
    setOccultismInvisibleState(entite);
if (typeof entite.removeOccultismDodgeBoost === "function") {
  entite.removeOccultismDodgeBoost();
  entite.removeOccultismDodgeBoost = null;
}

const dodgeBoost = entityBattleBooste(entite, {
  stat: "dodge",
  value: calculateOccultismDodgeBonus(entite),
  source: "occultismInvisible",
  mode: "flat",
  durationMs: null,
  stackable: false,
});

entite.removeOccultismDodgeBoost = dodgeBoost.remove;
    if (typeof entite.stopOccultismAnimation === "function") {
      entite.stopOccultismAnimation();
      entite.stopOccultismAnimation = null;
    }

    entite.stopOccultismAnimation = animateOccultism(entite.id);

    EffectMessage(entite, "Invisible !");
  }
  return {
    success,
    chance,
    roll: Number(roll.toFixed(2)),
  };
}
export function applyOccultismExitCritBoost(entite) {
  if (!entite) {
    return { applied: false, remove: () => {} };
  }

  const critBonus = Number(calculateOccultismCritChanceBonus(entite)) || 0;

  if (critBonus <= 0) {
    return { applied: false, remove: () => {} };
  }

  if (typeof entite.removeOccultismCritBoost === "function") {
    entite.removeOccultismCritBoost();
    entite.removeOccultismCritBoost = null;
  }

  const critBoost = entityBattleBooste(entite, {
    stat: "criticalChance",
    value: critBonus,
    source: "occultismExitCrit",
    mode: "flat",
    durationMs: null,
    stackable: false,
  });

  entite.removeOccultismCritBoost = critBoost.remove;

  console.log(
    `🌑 Critique occulte appliqué : ${entite.name} | +${critBonus}% chance critique prochaine attaque`
  );

  return critBoost;
}

export function getMovementValue(entite) {
  const movement = getSafe(entite, "movement", 0);

  if (movement && typeof movement === "object") {
    return Math.max(
      0,
      Math.round(Number(movement.max ?? movement.value ?? movement.current ?? 0) || 0)
    );
  }

  return Math.max(0, Math.round(Number(movement) || 0));
}

export function getMovementAgilityValue(entite) {
  return Math.max(0, Number(getSafe(entite, "agility", 0)) || 0);
}

function calculateMovementAgilityPercent(entite) {
  const movementValue = getMovementValue(entite);
  const cfg = balanceData.movement.charges;

  if (movementValue <= 0) return 0;

  const agility = getMovementAgilityValue(entite);
  const percent = (agility / cfg.marathonAgilityCap) * cfg.marathonMaxPercent;

  return Math.max(0, Math.min(cfg.marathonMaxPercent, Math.round(percent)));
}

export function calculateMovementMaxCharges(entite) {
  return getMovementValue(entite);
}
export function calculateMovementStartingChargeDetails(entite) {
  const cfg = balanceData.movement.charges;
  const maxCharges = calculateMovementMaxCharges(entite);

  if (maxCharges <= 0) {
    return {
      totalCurrent: 0,
      basePercent: 0,
      agiRatioCurrent: 0,
    };
  }

  const agility = getMovementAgilityValue(entite);

  const basePercent = cfg.baseStartingPercent;
  const maxAgilityBonusPercent = cfg.maxAgilityStartingBonusPercent;
  const agilityHardCap = cfg.agilityCap;
  const softCapDivider = cfg.startingSoftCapDivider;

  const agiRatioCurrent =
    agility >= agilityHardCap
      ? maxAgilityBonusPercent
      : maxAgilityBonusPercent * (1 - Math.exp(-agility / softCapDivider));

  const totalCurrent = Math.min(cfg.maxStartingPercent, basePercent + agiRatioCurrent);

  return {
    totalCurrent: Math.round(totalCurrent),
    basePercent,
    agiRatioCurrent: Math.round(agiRatioCurrent),
  };
}

export function calculateMovementStartingChargePercent(entite) {
  return calculateMovementStartingChargeDetails(entite).totalCurrent;
}

export function calculateMovementStartingCharges(entite) {
  const maxCharges = calculateMovementMaxCharges(entite);
  const percent = calculateMovementStartingChargePercent(entite);

  if (maxCharges <= 0) return 0;

  return Math.max(0, Math.min(maxCharges, Math.ceil(maxCharges * percent / 100)));
}

export function calculateShiftDailyStartingCharges(entite) {
  const shift = entite?.stats?.shift;
  if (!shift || shift.baseDefault) return 0;
  return calculateMovementStartingCharges({ stats: {
    movement: shift.max,
    agility: entite.stats.agility,
  } });
}

export function calculateMovementMarathonChance(entite) {
  if (getMovementValue(entite) <= 0) return 0;
  const cfg = balanceData.movement.charges;
  return Math.min(cfg.chanceMaxPercent, Math.floor(cfg.marathonBasePercent
    + Math.max(0, Number(getSafe(entite, 'agility', 0)) || 0) * cfg.marathonAgilityRatio));
}

// export function calculateMovementTrailerChance(entite) {
  // const agility = Math.max(0, Number(getSafe(entite, "agility", 0)) || 0);

  // return Math.min(100, Math.round((agility / 150) * 10));
// }
export function calculateMovementTrailerChance(entite) {
  const movementValue = getMovementValue(entite);
  if (movementValue <= 0) return 0;

  const cfg = balanceData.movement.charges;
  return Math.min(cfg.chanceMaxPercent, Math.floor(cfg.trailerBasePercent + movementValue * cfg.trailerMovementRatio));
}

export function getMarathonChance(entiteOrValue) {
  return Number(
    typeof entiteOrValue === "number"
      ? entiteOrValue
      : getSafe(entiteOrValue, "marathon", 0)
  ) || 0;
}

export function getTrailerChance(entiteOrValue) {
  return Number(
    typeof entiteOrValue === "number"
      ? entiteOrValue
      : getSafe(entiteOrValue, "trailer", 0)
  ) || 0;
}

export function calculateWeaponOrfevreWeaponMastery(entite, value) {
  const cfg = balanceData.weaponOrfevre.fromWeaponMastery;
  const weaponMastery = Math.max(
    0,
    Math.floor(Number(value ?? getSafe(entite, "weaponMastery", 0)) || 0)
  );

  if (weaponMastery <= 0) return 0;

  if (weaponMastery <= cfg.earlyCap) {
    return Math.floor(weaponMastery / cfg.earlyDivisor) + cfg.earlyBaseBonus;
  }

  return cfg.lateBaseBonus + Math.round((weaponMastery - cfg.earlyCap) / cfg.lateDivisor);
}

export function calculateWeaponOrfevreStrength(entite, value) {
  const cfg = balanceData.weaponOrfevre.fromStrength;
  const strength = Math.max(
    0,
    Math.floor(Number(value ?? getSafe(entite, "strength", 0)) || 0)
  );

  if (strength <= 0) return 0;

  if (strength <= cfg.earlyCap) {
    return Math.max(cfg.earlyMinBonus, Math.round(strength / cfg.earlyDivisor));
  }

  return cfg.lateBaseBonus + Math.round((strength - cfg.earlyCap) / cfg.lateDivisor);
}

export function calculateWeaponOrfevreBonus(entite) {
  const weaponMastery = Number(getSafe(entite, "weaponMastery", 0)) || 0;
  if (weaponMastery <= 0) return 0;

  const weaponMasteryBonus = calculateWeaponOrfevreWeaponMastery(entite);
  const strengthBonus = calculateWeaponOrfevreStrength(entite);

  return weaponMasteryBonus + strengthBonus;
}

export function calculateWeaponMasteryTotalTrophyChance(entite, value) {
  const weaponMasteryValue = Math.max(
    0,
    Math.floor(Number(value ?? getSafe(entite, "weaponMastery", 0)) || 0)
  );

  if (weaponMasteryValue <= 0) return 0;

  return (
    calculateWeaponMasteryTrophyChance(entite, weaponMasteryValue) +
    calculateWeaponMasteryTrophyStrengthBonus(entite)
  );
}
export function calculateWeaponMasteryTrophyChance(entite, value) {
  const cfg = balanceData.weaponMastery.trophy;
  const weaponMastery = Math.max(
    0,
    Math.floor(Number(value ?? getSafe(entite, "weaponMastery", 0)) || 0)
  );

  if (weaponMastery <= 0) return 0;

  return cfg.basePercent + Math.round((weaponMastery - 1) * (cfg.masteryMaxBonusPercent / cfg.masteryRange));
}
export function calculateWeaponMasteryTrophyStrengthBonus(entite, value) {
  const cfg = balanceData.weaponMastery.trophy;
  const strength = Math.max(
    0,
    Math.floor(Number(value ?? getSafe(entite, "strength", 0)) || 0)
  );

  if (strength <= 0) return 0;

  return Math.round(strength * (cfg.strengthMaxPercent / cfg.strengthCap));
}
export function getFinalWeaponOrfevreBonus(entite) {
  return Number(getSafe(entite, "weaponOrfevre", 0)) || 0;
}

export function getFinalWeaponCollectorBonus(entite) {
  return Number(getSafe(entite, "weaponCollector", 0)) || 0;
}
export function calculateChargeEquipmentSlots(entite, value) {
  return Math.max(
    0,
    Math.round(Number(value ?? getSafe(entite, "charge", 0)) || 0)
  );
}
export function weaponMasteryChargeStrenghtRatioBonus(entite, value) {
  const cfg = balanceData.weaponMastery.charge;
  const sourceValue =
    value ??
    (typeof entite === "number" ? entite : getSafe(entite, "strength", 0));

  const strength = Math.max(
    0,
    Math.floor(Number(sourceValue) || 0)
  );

  return Math.floor(strength / cfg.strengthDivisor);
}
export function calculateWeaponMasteryTotalChargeBonus(entite, value) {
  const weaponMasteryValue = Number(value ?? getSafe(entite, "weaponMastery", 0)) || 0;

  if (weaponMasteryValue <= 0) return 0;

  return (
    calculateWeaponMasteryCharge(entite, weaponMasteryValue) +
    weaponMasteryChargeStrenghtRatioBonus(entite)
  );
}
