import { balanceData as B, roundBalance } from '../data/balanceData.js';
import { stats as STATS_DATA } from '../data/statsData.js';
import * as D from "../combat/statistics.js";
import * as E from "./runtime.js";
import { calculatePenetrationPercent, calculateResistanceReductionPercent, getDisplayStatKey } from "./rules.js";
import { calculateHypercognitionEssenceCount } from "../items/essenceInventory.js";

// The existing entity catalogue is enriched while its module graph initializes.
// Runtime source reads start once those numerical modules have finished loading.
var statSystemReady;

// Reuse reads only within one synchronous, read-only calculation.
// Nothing survives the call: edits, previews and live balance settings stay fresh.
let displayReadCache = null;
let displayReadRules = null;
export function withStatReadSnapshot(read) {
  if (displayReadCache) return read();
  displayReadCache = new WeakMap();
  try { return read(); }
  finally { displayReadCache = null; displayReadRules = null; }
}
export { withStatReadSnapshot as withStatDisplayReads };
function statDisplayRead(entity) {
  if (!displayReadCache || !entity || typeof entity !== 'object') return null;
  let entry = displayReadCache.get(entity);
  if (!entry) {
    entry = { inputs: E.getStatSystemInputs(entity), results: new Map() };
    displayReadCache.set(entity, entry);
  }
  return entry;
}

export const STAT_SYSTEM_ORIGINS = Object.freeze({
  physicalDamage: 'vigueur', magicalDamage: 'esprit', piercingDamage: 'finesse',
  physicalPen: 'brutality', magicalPen: 'inflexion', physicalResistance: 'constitution',
  magicalResistance: 'integrite', dodge: 'adresse', velocity: 'vivacite', precision: 'vision', bullsEye: 'vision',
  controlledSpeed: 'vivacite', fatalSurvival: 'astrality', astralBody: 'astrality',
  armor: 'robustness', HP: 'vitality', dayHpRegen: 'vitality',
  cognitiveExplosion: 'hypercognition', cognitiveGenerator: 'hypercognition',
  extraLife: 'transcendence', transcendenceTotal: 'transcendence',
  criticalChance: 'criticalPower', criticalDamage: 'criticalPower',
  criticalResistance: 'resilience', alterationResistance: 'resilience', hindranceResistance: 'resilience', resilienceTotal: 'resilience',
  equilibreAggroReduction: 'equilibre', equilibreInvisibleDetection: 'equilibre', equilibreBalancedAttackChance: 'equilibre',
  bloodFuryExecutionChance: 'bloodFury', bloodFuryTargetThreshold: 'bloodFury',
  bloodFuryExecutionDamage: 'bloodFury', bloodThirsty: 'bloodFury',
  hpBattleRegen: 'indestructibility', attackCooldownReduc: 'haste',
  attackPreparationReduc: 'haste', attackExecutionReduc: 'haste',
  attackRecoveryReduc: 'haste', attackProjectileSpeed: 'haste',
  shift: 'movement', marathon: 'movement', trailer: 'movement',
  charge: 'weaponMastery', weaponOrfevre: 'weaponMastery', weaponCollector: 'weaponMastery',
});

const percentages = new Set(['physicalPen', 'magicalPen', 'physicalResistance', 'magicalResistance',
  'dodge', 'velocity', 'controlledSpeed', 'fatalSurvival', 'astralBody', 'transcendenceTotal', 'criticalChance', 'criticalDamage',
  'criticalResistance', 'alterationResistance', 'hindranceResistance', 'resilienceTotal',
  'equilibreAggroReduction', 'equilibreInvisibleDetection', 'equilibreBalancedAttackChance',
  'bloodFuryExecutionChance', 'bloodFuryTargetThreshold', 'bloodThirsty', 'hpBattleRegen',
  'attackCooldownReduc', 'attackPreparationReduc', 'attackExecutionReduc', 'attackRecoveryReduc',
  'attackProjectileSpeed', 'marathon', 'trailer', 'weaponOrfevre', 'weaponCollector']);
function capacity(value) { return Number(value?.max ?? value?.current ?? value) || 0; }
function round(value) { return roundBalance(value, 6); }
const clamp = (value, maximum = Infinity, minimum = 0) => Math.max(minimum, Math.min(maximum, value));
const term = (stat, value, detail = {}) => ({ stat, value, ...detail });
const product = (ctx, stat, coefficient, rounding = value => value) => term(stat,
  rounding(ctx.read(stat) * coefficient), { rounded: true,
    compact: { source: { stat, value: ctx.read(stat) }, multiplier: { stat, value: coefficient } } });

// Source metadata travels with a calculation, never into the entity save.
export const STAT_POINT_INPUTS = Symbol('stat-point-inputs');
export function isStatSystemReady() { return !!statSystemReady; }
export function getProgressiveStatKeys() {
  return globalThis.umbraProgression.getProgressiveStatKeys();
}
// Toutes les Umbras du catalogue partagent le seuil de leur propriétaire.
// Les trois attributs suivent aussi la limite du propriétaire.
var umbraStatKeys;
function getUmbraStatKeys() {
  return umbraStatKeys ??= new Set(STATS_DATA.filter(stat => stat.nature === 'umbra').map(stat => stat.key));
}
var pointLimitedProgressiveKeys, pointLimitedKeys;
function readPointLimitedKeys() {
  const progressive = getProgressiveStatKeys();
  if (!pointLimitedProgressiveKeys || progressive.length !== pointLimitedProgressiveKeys.length
    || progressive.some((key, index) => key !== pointLimitedProgressiveKeys[index])) {
    pointLimitedProgressiveKeys = progressive;
    pointLimitedKeys = new Set([...progressive, ...getUmbraStatKeys()]);
  }
  return pointLimitedKeys;
}
export function getPointLimitedStatKeys() {
  return [...readPointLimitedKeys()];
}
export function getUmbraThreshold(entity) {
  return globalThis.umbraProgression.getUmbraThreshold(entity);
}
export function getStatPointThreshold(entity, key) {
  return getUmbraThreshold(entity);
}
export function calculateProgressivePower(source, attribute, cfg, origin, limit) {
  return globalThis.umbraProgression.calculateProgressivePower(source, attribute, cfg, origin, limit);
}
export function calculateStatPointLimit(natural, other = 0, crystal = 0, threshold) {
  return globalThis.umbraProgression.calculateStatPointLimit(natural, other, crystal, threshold);
}
// Reuse the formatter: constructing an Intl formatter for every number dominates
// repeated stat/preview calculations. This holds no entity or balance data.
var statPointNumberFormatter;
export function describeStatPointLimit(points) {
  if (points?.limit == null) return '';
  statPointNumberFormatter ??= new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 6 });
  const f = n => statPointNumberFormatter.format(Number(n.toFixed(6)));
  return `Seuil ${f(points.limit)} : naturels ${f(points.natural)} → ${f(points.naturalApplied)}, `
    + `bonus externes ${f(points.other)} → ${f(points.otherApplied)}${points.crystal ? `, cristaux ${f(points.crystal)} → ${f(points.crystalApplied)}` : ''} ; total ${f(points.value)} points. `
    + `Au-delà : niveaux ${f(points.levelRate * 100)} %, équipements et buffs ${f(points.otherRate * 100)} %. Cristaux ${f(points.crystalRate * 100)} %. Sous zéro : naturels ${f(points.levelRate * 100)} %, externes ${f(points.otherRate * 100)} %, cristaux ${f(points.crystalRate * 100)} %.`;
}
export function getProgressiveRatio(points, stat, limit) {
  return globalThis.umbraProgression.getProgressiveRatio(points, stat, limit);
}
function progressivePowerPart(stat, points, base, enabled = true, limit) {
  return globalThis.umbraProgression.progressivePowerPart(stat, points, base, enabled, limit);
}

export function getDirectingStatResult(entity, key) {
  if (!statSystemReady || !entity?.baseStats || entity._statSystemFormula
    || (!getUmbraStatKeys().has(key) && !readPointLimitedKeys().has(key))) return null;
  const inputs = statDisplayRead(entity)?.inputs || E.getStatSystemInputs(entity);
  if (!Object.hasOwn(inputs, key)) return null;
  return { ...inputs[STAT_POINT_INPUTS]?.[key], value: capacity(inputs[key]) };
}

// Definitions call the existing barèmes. Only source pooling is new.
function makeRules() {
  const rules = new Map();
  const add = (key, rule) => rules.set(key, rule);
  const addProgressive = (key, origin, cfg) => add(key, {
    base: c => progressivePowerPart(origin, c.umbra, cfg.ratios.source, true, c.limit).value,
    bonus: c => [progressivePowerPart(cfg.attribute, c.read(cfg.attribute), cfg.ratios.attribute, c.umbra > 0, c.limit)],
    flat: c => c.umbra * cfg.flatPerPoint, finish: round, sharedFlat: true, progressive: cfg,
  });
  for (const [origin, cfg] of Object.entries(B.generatedUmbraStats.sources)) {
    if (cfg.ratioPercent) { add(cfg.target, { ratioPercent: true, attribute: cfg.attribute, vivacite: true }); continue; }
    if (cfg.progressive) {
      addProgressive(cfg.target, origin, cfg);
      continue;
    }
    const convert = ({
      physicalPen: value => calculatePenetrationPercent(null, 'physicalPen', value),
      magicalPen: value => calculatePenetrationPercent(null, 'magicalPen', value),
      physicalResistance: calculateResistanceReductionPercent,
      magicalResistance: calculateResistanceReductionPercent,
      dodge: E.calculateDodgePercent,
    })[cfg.target];
    add(cfg.target, { base: c => c.umbra * cfg.ratios.source,
      bonus: c => [product(c, cfg.attribute, cfg.ratios.attribute)],
      convert: convert && (value => convert(roundBalance(value, cfg.decimals))),
      finish: value => roundBalance(value, convert ? 6 : cfg.decimals),
      max: convert ? 99 : Infinity,
      sourceRatio: cfg.ratios.source, sharedFlat: true });
  }
  add('bullsEye', { directPercentage: true });
  add('HP', { base: c => E.calculateVitalityBonus(c.umbra), finish: Math.ceil });
  add('dayHpRegen', { fixed: B.regeneration.vitalityDayHp.minTotalBaseAmount,
    bonus: c => [product(c, 'HP', D.calculateVitalityRegenPercent(c.umbra) / 100, Math.round)], finish: Math.floor });
  addProgressive('cognitiveExplosion', 'hypercognition', B.hypercognition.explosion);
  add('cognitiveGenerator', { base: c => calculateHypercognitionEssenceCount(c.umbra, c.limit), finish: Math.floor,
    finishTotal: Math.floor, max: B.hypercognition.essences.maxCount });
  add('extraLife', { base: c => E.calculateTranscendenceExtraLife(c.umbra, c.limit), finish: Math.floor });
  add('transcendenceTotal', { directPercentage: true });
  add('fatalSurvival', { ratioPercent: true, attribute: 'intelligence', astrality: true });
  add('astralBody', { ratioPercent: true, attribute: 'intelligence', astrality: true });
  add('criticalChance', { critical: true });
  add('criticalDamage', { critical: true });
  add('criticalResistance', { ratioPercent: true, attribute: 'strength' });
  add('alterationResistance', { ratioPercent: true, attribute: 'intelligence' });
  add('hindranceResistance', { ratioPercent: true, attribute: 'agility' });
  add('resilienceTotal', { directPercentage: true });
  add('controlledSpeed', { directPercentage: true, requiresUmbra: true });
  add('equilibreAggroReduction', { ratioPercent: true, attribute: 'intelligence', equilibre: true });
  add('equilibreInvisibleDetection', { ratioPercent: true, attribute: 'agility', equilibre: true });
  add('equilibreBalancedAttackChance', { directPercentage: true });
  for (const key of ['bloodFuryExecutionChance', 'bloodFuryTargetThreshold', 'bloodFuryExecutionDamage']) {
    add(key, { bloodExecution: true });
  }
  add('bloodThirsty', { ratioPercent: true, attribute: 'strength', bloodThirsty: true });
  add('hpBattleRegen', { ratioPercent: true, attribute: 'strength', battleRegen: true });
  for (const [key, attribute, fn] of [
    ['attackCooldownReduc', 'intelligence', 'calculateHasteCDReduc'],
    ['attackPreparationReduc', 'intelligence', 'calculateHasteIntelRatio'],
    ['attackExecutionReduc', 'strength', 'calculateHasteExecReduc'],
    ['attackRecoveryReduc', 'agility', 'calculateHasteRecupReduc'],
    ['attackProjectileSpeed', 'strength', 'calculateHasteProjectilSpeed'],
  ]) add(key, { base: c => key === 'attackPreparationReduc' ? E.calculateHastePercent(c.umbra) : 0,
    bonus: c => {
      const cfg = B.attackTime.hasteRatios;
      const value = D[fn]({ ...c.view, stats: { ...c.view.stats, haste: Math.max(1, c.umbra) } });
      const maximum = ({ attackCooldownReduc: cfg.intelligenceCooldownMaxPercent, attackPreparationReduc: cfg.intelligencePrepMaxPercent,
        attackExecutionReduc: cfg.strengthExecutionMaxPercent, attackRecoveryReduc: cfg.agilityRecoveryMaxPercent })[key];
      return [term(attribute, value, maximum != null && c.read(attribute) <= cfg.statCap
        ? { compact: { source: { stat: attribute, value: c.read(attribute) }, multiplier: { stat: attribute, value: maximum / cfg.statCap } } } : {})];
    },
    max: B.attackTime.reductionCapPercent, finish: v => roundBalance(v, 1) });
  add('shift', { base: c => Math.floor(c.umbra), finish: Math.floor });
  add('marathon', { fixed: B.movement.charges.marathonBasePercent,
    bonus: c => [product(c, 'agility', B.movement.charges.marathonAgilityRatio, Math.floor)], max: B.movement.charges.chanceMaxPercent, finish: Math.floor });
  add('trailer', { fixed: B.movement.charges.trailerBasePercent,
    bonus: c => [product(c, 'movement', B.movement.charges.trailerMovementRatio, Math.floor)], max: B.movement.charges.chanceMaxPercent, finish: Math.floor });
  add('charge', { fixed: B.weaponMastery.charge.masteryBaseBonus,
    base: c => Math.floor(c.umbra / B.weaponMastery.charge.masteryDivisor),
    bonus: c => [product(c, 'strength', 1 / B.weaponMastery.charge.strengthDivisor, Math.floor)], finish: Math.floor,
    // Keep equipment debt; slot allocation separately enforces a nonnegative capacity.
    min: -Infinity });
  add('weaponOrfevre', { fixed: B.weaponOrfevre.fromWeaponMastery.earlyBaseBonus,
    base: c => c.umbra > 0 ? D.calculateWeaponOrfevreWeaponMastery(c.view) - B.weaponOrfevre.fromWeaponMastery.earlyBaseBonus : 0,
    bonus: c => [term('strength', D.calculateWeaponOrfevreStrength(c.view))] });
  add('weaponCollector', { fixed: B.weaponMastery.trophy.basePercent,
    base: c => c.umbra > 0 ? D.calculateWeaponMasteryTrophyChance(c.view) - B.weaponMastery.trophy.basePercent : 0,
    bonus: c => [term('strength', D.calculateWeaponMasteryTrophyStrengthBonus(c.view))] });
  return rules;
}

export function calculateStatSources(inputs, requestedKey = null, { effective = false, seuilUmbra } = {}) {
  if (!effective && !inputs[STAT_POINT_INPUTS]) {
    inputs = { ...inputs };
    const details = {};
    for (const key of getPointLimitedStatKeys()) if (Object.hasOwn(inputs, key)) {
      details[key] = calculateStatPointLimit(capacity(inputs[key]), 0, 0, getStatPointThreshold({ seuilUmbra }, key));
      inputs[key] = details[key].value;
    }
    inputs[STAT_POINT_INPUTS] = details;
  }
  // Definitions depend on configuration, not on the entity or requested key.
  // Share them only inside the existing synchronous, read-only snapshot.
  const rules = displayReadCache ? (displayReadRules ??= makeRules()) : makeRules();
  const results = new Map();
  const resolving = new Set();
  const evaluate = key => {
    if (results.has(key)) return results.get(key);
    const rule = rules.get(key);
    if (!rule) return { value: capacity(inputs[key]) };
    if (resolving.has(key)) throw new Error(`Stat dependency cycle: ${key}`);
    resolving.add(key);
    const uniquePassive = STATS_DATA.some(stat => stat.key === key && stat.uniquePassive);
    // Unique passives have no displayed +/X variants, but manual admin inputs
    // remain valid sources while balancing the game.
    const normal = capacity(inputs[key]);
    const plus = capacity(inputs[`${key}Plus`]);
    const origin = STAT_SYSTEM_ORIGINS[key];
    const umbra = Math.max(0, capacity(inputs[origin]));
    const improved = plus > 0 || umbra > 0;
    const limit = inputs[STAT_POINT_INPUTS]?.[origin]?.limit ?? getUmbraThreshold({ seuilUmbra });
    const ctx = { key, normal, plus, umbra, limit, read: stat => evaluate(stat).value,
      view: { stats: inputs, _statSystemFormula: true, seuilUmbra: limit } };
    if (rule.bloodExecution) {
      const execution = globalThis.umbraProgression.bloodFuryExecutionDetails(umbra, ctx.read('strength'),
        key === 'bloodFuryExecutionDamage' ? ctx.read('physicalDamage') : 0, limit);
      const value = key === 'bloodFuryExecutionChance' ? execution.chance.percent
        : key === 'bloodFuryTargetThreshold' ? execution.threshold.percent : execution.damage.value;
      const maximum = key === 'bloodFuryExecutionChance' ? execution.chance.max
        : key === 'bloodFuryTargetThreshold' ? execution.threshold.maxPercent : undefined;
      const row = { key, origin, normal: 0, plus: 0, umbra, uniquePassive: true, bloodExecution: execution,
        value, unit: key === 'bloodFuryExecutionDamage' ? '' : ' %', state: 'normal',
        base: value, generated: value, conversion: value, enhanced: value, fixed: 0, umbraFlat: 0,
        normalApplied: 0, plusApplied: 0, bonuses: [], attributeConversion: 0,
        present: umbra > 0, maximum, maximumReached: false, rounded: key === 'bloodFuryExecutionDamage',
        pointLimit: inputs[STAT_POINT_INPUTS]?.[origin] };
      results.set(key, row); resolving.delete(key); return row;
    }
    if (rule.critical || rule.ratioPercent) {
      const chance = key !== 'criticalDamage';
      const detail = rule.astrality ? (key === 'astralBody'
        ? globalThis.umbraProgression.astralBodyDetails(umbra, ctx.read('intelligence'), undefined, limit)
        : globalThis.umbraProgression.astralityChanceDetails(umbra, ctx.read('intelligence'), normal, plus, undefined, limit))
        : rule.bloodThirsty ? globalThis.umbraProgression.bloodThirstyDetails(umbra, ctx.read('strength'), normal, plus, undefined, limit)
        : rule.battleRegen ? globalThis.umbraProgression.indestructibilityRegenDetails(umbra, ctx.read('strength'), normal, plus, undefined, limit)
        : rule.ratioPercent ? globalThis.umbraProgression[rule.vivacite ? 'vivaciteDetails' : rule.equilibre ? 'equilibreDetails' : 'resilienceDetails'](key, umbra, ctx.read(rule.attribute), normal, plus, undefined, limit)
        : chance ? globalThis.umbraProgression.criticalChanceDetails(umbra, ctx.read('agility'), normal, plus, undefined, limit)
        : globalThis.umbraProgression.criticalDamageDetails(umbra, limit);
      const fixed = chance ? 0 : B.critical.damage.nativeBasePercent;
      const generated = chance ? detail.generated : detail.value;
      const value = chance ? detail.value : Math.max(0, fixed + normal + plus + generated);
      const parts = chance ? [detail.source, detail.attribute] : [detail];
      const row = { key, origin, normal, plus, umbra, uniquePassive, critical: !!rule.critical, ratioPercent: !!rule.ratioPercent,
        ...(rule.bloodThirsty ? { ratioCurve: { ...detail, points: umbra, attributePoints: ctx.read('strength') } } : {}),
        value, unit: ' %', state: uniquePassive ? 'normal' : umbra > 0 ? 'X' : plus > 0 ? '+' : 'normal',
        fixed, generated, conversion: generated, enhanced: chance ? value - detail.normalApplied : generated + fixed + plus,
        normalApplied: chance ? detail.normalApplied : value - fixed - generated - plus,
        plusApplied: chance ? detail.plusApplied : plus,
        base: parts[0].value, bonuses: chance ? [parts[1]] : [], criticalParts: parts,
        umbraFlat: 0, attributeConversion: 0, present: normal !== 0 || plus !== 0 || umbra > 0,
        rounded: !chance, maximum: chance ? detail.max : undefined, maximumReached: chance && value >= detail.max,
        pointLimit: inputs[STAT_POINT_INPUTS]?.[origin] };
      results.set(key, row); resolving.delete(key); return row;
    }
    if (rule.directPercentage) {
      const curve = key === 'transcendenceTotal'
        ? globalThis.umbraProgression.transcendenceDetails(umbra, ctx.read('intelligence'), undefined, limit)
        : key === 'resilienceTotal'
        ? globalThis.umbraProgression.resilienceCancelDetails(umbra, ctx.read('strength'), undefined, limit)
        : key === 'equilibreBalancedAttackChance' ? globalThis.umbraProgression.balancedAttackDetails(umbra, ctx.read('intelligence'), undefined, limit)
        : key === 'controlledSpeed' ? globalThis.umbraProgression.controlledSpeedDetails(umbra, ctx.read('agility'), undefined, limit)
        : globalThis.umbraProgression.bullsEyeDetails(umbra, ctx.read('agility'), undefined, limit);
      const enabled = !rule.requiresUmbra || umbra > 0;
      const fixed = enabled ? clamp(curve.percent + normal, curve.max) : 0;
      const total = enabled ? clamp(curve.percent + normal + plus, curve.max) : 0;
      const pooled = { total, normal: fixed - curve.percent, plus: total - fixed };
      const row = { key, origin, normal, plus, umbra, uniquePassive, directPercentage: true,
        value: pooled.total, chancePercent: pooled.total, unit: ' %', state: 'normal',
        normalApplied: pooled.normal, plusApplied: pooled.plus, enhanced: curve.percent + pooled.plus,
        base: curve.percent, generated: curve.percent, conversion: curve.percent,
        fixed: 0, umbraFlat: 0, bonuses: [], attributeConversion: 0,
        present: normal !== 0 || plus !== 0 || umbra > 0, maximum: curve.max, maximumReached: pooled.total >= curve.max,
        rounded: false, converted: false, passiveCurve: curve,
        pointLimit: inputs[STAT_POINT_INPUTS]?.[origin], attributePointLimit: inputs[STAT_POINT_INPUTS]?.[curve.attribute || 'agility'] };
      results.set(key, row); resolving.delete(key); return row;
    }
    const base = improved && rule.base ? rule.base(ctx) : 0;
    const fixed = improved ? rule.fixed || 0 : 0;
    const bonuses = improved && rule.bonus ? rule.bonus(ctx) : [];
    for (const part of bonuses) if (!part.compact && !part.curvePreview && !part.arithmetic) {
      part.curvePreview = { current: { points: ctx.read(part.stat), value: part.value } };
    }
    const generated = base + fixed + bonuses.reduce((sum, part) => sum + part.value, 0);
    const conversion = rule.convert ? rule.convert(generated) : generated;
    const plusApplied = plus;
    const umbraFlat = rule.flat ? round(rule.flat(ctx)) : 0;
    // Direct gains share the output unit; only the generated ratio contribution is rounded.
    const enhancedInput = rule.sharedFlat ? plusApplied + umbraFlat + (rule.finish || round)(conversion)
      : improved ? (rule.finish || round)(plusApplied + conversion) : 0;
    const enhanced = key === 'armor' ? Math.round(enhancedInput) : rule.sharedFlat ? Math.min(enhancedInput, rule.max ?? Infinity)
      : clamp(enhancedInput, rule.max);
    const total = normal + (rule.sharedFlat && key !== 'armor' ? enhancedInput : enhanced);
    const value = round(clamp(key === 'armor' ? Math.round(total) : rule.finishTotal ? rule.finishTotal(total) : total, rule.max, rule.min));
    // Composition labels never alter the pooled improvement or its ratios.
    const state = uniquePassive ? 'normal' : rule.sharedFlat ? umbra > 0 ? 'X' : plus > 0 ? '+' : 'normal' : umbra > 0
      ? plus > 0 ? normal !== 0 ? 'Ω' : '◆' : normal !== 0 ? '◇' : '+'
      : plus > 0 ? normal !== 0 ? 'X' : '+' : 'normal';
    const attributePoints = bonuses.reduce((sum, part) => sum + part.value, 0);
    const attributeConversion = rule.sharedFlat && plus > 0
      ? (key === 'armor' ? Math.round : rule.finish || round)(rule.convert ? rule.convert(attributePoints) : attributePoints) : 0;
    const progression = rule.progressive ? {
      source: progressivePowerPart(origin, umbra, rule.progressive.ratios.source, true, limit),
      attribute: bonuses[0], sourcePoints: inputs[STAT_POINT_INPUTS]?.[origin],
      attributePoints: inputs[STAT_POINT_INPUTS]?.[rule.progressive.attribute],
      limit: inputs[STAT_POINT_INPUTS]?.[origin]?.limit ?? getUmbraThreshold({ seuilUmbra }),
    } : null;
    if (progression) {
      progression.source.note += ' ' + describeStatPointLimit(progression.sourcePoints);
      if (bonuses[0]) bonuses[0].note += ' ' + describeStatPointLimit(progression.attributePoints);
    }
    const row = { key, origin, normal, plus, plusApplied, umbra, umbraFlat, base, fixed, bonuses, generated, conversion, enhanced, value, progression,
      attributeConversion, uniquePassive,
      normalApplied: round(value - enhanced), state,
      present: normal !== 0 || plus !== 0 || umbra > 0, maximum: rule.max, maximumReached: value >= (rule.max ?? Infinity),
      unit: percentages.has(key) && !rule.progressive?.resistance && !rule.progressive?.dodge ? ' %' : '',
      ...(rule.progressive?.dodge ? { dodgePoints: true, chancePercent: globalThis.umbraProgression.dodgeChancePercent(value) } : {}),
      ...(rule.progressive?.precision ? { precisionPoints: true, chancePercent: E.calculatePrecisionPercent(value) } : {}),
      ...(rule.progressive?.resistance ? { resistancePoints: true,
        reductionRatio: globalThis.umbraProgression.resistanceReductionRatio(value,
          globalThis.umbraProgression.getResistanceConstant(key)) } : {}),
      converted: !!rule.convert, sourceRatio: progression?.source.coefficient ?? rule.sourceRatio,
      rounded: !!rule.finish || !!rule.convert };
    results.set(key, row);
    resolving.delete(key);
    return row;
  };
  if (requestedKey) return evaluate(requestedKey);
  for (const key of rules.keys()) evaluate(key);
  return results;
}

export function getEntityVelocityTiming(entity) {
  if (!statSystemReady || !entity?.baseStats || entity._statSystemFormula) return null;
  const inputs = statDisplayRead(entity)?.inputs || E.getStatSystemInputs(entity);
  const velocity = calculateStatSources(inputs, 'velocity');
  if (!velocity.present) return null;
  const base = E.getStatSystemInputs(entity, { combat: false });
  // Flat/percentage combat speed modifiers still apply after Vélocité in getSafe.
  return globalThis.umbraProgression.velocityTiming(velocity.value, capacity(base.speed) || 1000);
}

export function getStatSystemResult(entity, key) {
  if (!statSystemReady || !entity?.baseStats || entity._statSystemFormula || !STAT_SYSTEM_ORIGINS[key]) return null;
  const cached = statDisplayRead(entity);
  if (cached?.results.has(key)) return cached.results.get(key);
  const row = calculateStatSources(cached?.inputs || E.getStatSystemInputs(entity), key);
  const preview = entity.modifierStats?.preview?.statLeveled;
  const changed = preview && [key, `${key}Plus`, row.origin].some(source => Object.hasOwn(preview, source));
  const result = row.critical || row.ratioPercent || row.bloodExecution || row.present || (changed && key !== 'dayHpRegen') ? row : null;
  cached?.results.set(key, result);
  return result;
}

// Pool capacities remain ordinary game pools; source evaluation never restores spent resources.
export function applyStatSystemTotals(entity, totals, inputs) {
  if (!statSystemReady) return totals;
  for (const key of getPointLimitedStatKeys()) if (Object.hasOwn(inputs, key)) totals[key] = capacity(inputs[key]);
  for (const row of calculateStatSources(inputs).values()) {
    // Regeneration is optional: keep absent sources absent in stored entities.
    // The live model still returns zero, including after removing the last source.
    if (row.key === 'hpBattleRegen' && !row.present) { delete totals[row.key]; continue; }
    if (row.critical || row.ratioPercent || row.bloodExecution || ['resilienceTotal', 'equilibreBalancedAttackChance', 'controlledSpeed'].includes(row.key)) { totals[row.key] = row.value; continue; }
    if (!row.present) {
      const preview = entity.modifierStats?.preview?.statLeveled;
      if (preview && [row.key, `${row.key}Plus`, row.origin].some(key => Object.hasOwn(preview, key))) {
        if (row.key === 'dayHpRegen') totals[row.key] = B.regeneration.vitalityDayHp.minTotalBaseAmount;
        else if (row.key === 'armor') {
          const stuffMax = totals.armor?.stuffMax || 0;
          totals.armor = { ...totals.armor, max: 0, current: Math.min(totals.armor?.current || 0, stuffMax),
            totalMax: stuffMax, externalMax: 0, robustnessMax: 0, regenMax: 0 };
        } else if (row.key === 'extraLife') totals.extraLife = { current: 0, max: 0 };
        else if (row.key === 'shift') totals.shift = { current: Number(entity.stats?.shift?.current) || 0, max: 1, baseDefault: true };
        else if (row.key === 'HP') totals.HP = { current: Math.min(totals.HP?.current || 0, 1), max: 1 };
        else totals[row.key] = 0;
      }
      continue;
    }
    if (['HP', 'armor', 'extraLife', 'shift'].includes(row.key)) {
      const previous = totals[row.key];
      const max = row.key === 'HP' ? Math.max(1, row.value) : row.value;
      const owned = entity.stats?.[row.key];
      const initial = entity.baseStats?.[row.key];
      // The preview has already applied the armor granted by the proposed level-up.
      const current = row.key === 'armor' && previous && typeof previous === 'object' ? previous.current
        : owned && typeof owned === 'object' ? owned.current
        : initial && typeof initial === 'object' && initial.current != null ? initial.current
        : row.key === 'shift' ? D.calculateMovementStartingCharges({ stats: { ...inputs, movement: max } }) : max;
      const remaining = row.key === 'shift' ? Number(current) || 0 : Math.min(capacity(current), max);
      totals[row.key] = previous && typeof previous === 'object'
        ? { ...previous, max, current: remaining }
        : { max, current: remaining };
      if (row.key === 'shift') delete totals.shift.baseDefault;
      if (row.key === 'armor' && previous?.totalMax != null) {
        const robustnessMax = row.umbra > 0 ? Math.max(0, Math.round(row.generated + row.umbraFlat)) : 0;
        Object.assign(totals.armor, { max: robustnessMax, robustnessMax, regenMax: robustnessMax,
          externalMax: max - robustnessMax, totalMax: max + (previous.stuffMax || 0), current: previous.current });
      }
    } else totals[row.key] = row.value;
  }
  const velocity = calculateStatSources(inputs, 'velocity');
  if (velocity.present) totals.speed = globalThis.umbraProgression.velocityTiming(velocity.value, capacity(inputs.speed) || 1000).adjustedSpeed;
  return totals;
}

function autonomousContributions(entity, key) {
  return D.getStatContributions(entity, key, { resolveLabels: false })
    .filter(source => !source.source.startsWith('Umbra :') && source.source !== 'Bonus dérivés')
    .map(source => ({ ...source, key }));
}

function autonomousSourceParts(entity, key, value) {
  const sources = autonomousContributions(entity, key);
  const parts = [];
  const add = (category, value) => {
    const existing = parts.find(part => part.category === category);
    if (existing) existing.value = round(existing.value + value);
    else if (value) parts.push({ category, value: round(value) });
  };
  let flat = 0, percent = 0, previous = 0;
  for (const category of ['fixed', 'stat', 'equipment']) {
    for (const source of sources.filter(source => source.category === category)) {
      if (source.mode === 'percent') percent += source.value;
      else flat += source.value;
    }
    const next = percent ? Math.round(flat * (1 + percent / 100)) : flat;
    add(category, next - previous);
    previous = next;
  }
  // Preview and combat modifiers follow durable sources, as in getStatSystemInputs.
  const apply = (category, delta) => {
    const flat = typeof delta === 'number' ? delta : capacity(delta?.flat ?? delta?.max ?? delta?.current);
    const next = (previous + flat) * (1 + (Number(delta?.percent) || 0) / 100);
    add(category, next - previous);
    previous = next;
  };
  if (entity?.modifierStats?.preview?.statLeveled) {
    apply('stat', entity.modifierStats.preview.statLeveled[key]);
    if (entity.modifierStats.durable?.stuff?.orfevre) apply('equipment', E.getWeaponOrfevreStuffPreviewDelta(entity)?.[key]);
  }
  const combat = sources.filter(source => source.category === 'combat');
  apply('combat', {
    flat: combat.filter(source => source.mode !== 'percent').reduce((sum, source) => sum + source.value, 0),
    percent: combat.filter(source => source.mode === 'percent').reduce((sum, source) => sum + source.value, 0),
  });
  add('stat', value - previous);
  return parts.filter(part => part.value);
}

export function buildStatSystemModel(row, entity = null) {
  const family = B.generatedUmbraStats.sources[row.origin]
    || (row.key === 'cognitiveExplosion' ? B.hypercognition.explosion : null);
  const stat = getDisplayStatKey(row.key);
  if (row.bloodExecution) {
    const e = row.bloodExecution;
    const chance = row.key === 'bloodFuryExecutionChance', threshold = row.key === 'bloodFuryTargetThreshold';
    const c = chance ? e.chance : threshold ? e.threshold : e.damage;
    const parts = chance ? [{ stat: row.origin, value: row.value, unit: row.unit,
      compact: { source: { stat: row.origin, value: e.points }, multiplier: { stat: 'strength', value: c.ratio, decimals: 4 } } }]
      : threshold ? [
        { stat: 'neutral', value: e.active ? c.basePercent : 0, unit: row.unit, fixed: true },
        { stat: row.origin, value: e.active ? row.value - c.basePercent : 0, unit: row.unit,
          compact: { source: { stat: row.origin, value: e.points }, multiplier: { stat: row.origin, value: e.active ? (row.value - c.basePercent) / e.points : 0, decimals: 4 } } },
      ] : [{ stat: 'physicalDamage', value: row.value, rounded: true,
        compact: { source: { stat: 'physicalDamage', value: c.physicalDamage }, multiplier: { stat: 'strength', value: c.percent / 100, decimals: 4 } } }];
    const score = chance ? e.points * B.blood.furyExecution.chance.sourceRatio * c.curveRatio : c.weight;
    const note = !e.active ? 'Fureur sanguinaire inactive : Exécution indisponible.' : chance
      ? `Score : ${e.points} Fureur × ${B.blood.furyExecution.chance.sourceRatio} × ${c.curveRatio} (courbe de Force) = ${score}. Chance : ${c.max} × ${score} / (${c.constant} + ${score}) = ${c.percent} %.`
      : threshold ? `Score : ${e.points} Fureur × ${c.sourceRatio} = ${score}. Seuil : ${c.basePercent} + (${c.maxPercent} − ${c.basePercent}) × ${score} / (${c.constant} + ${score}) = ${c.percent} % des HP maximum.`
      : `Score : ${e.strength} Force × ${c.attributeRatio} = ${score}. Bonus : ${c.basePercent} + (${c.maxPercent} − ${c.basePercent}) × ${score} / (${c.constant} + ${score}) = ${c.percent} % de PP. Dégâts : ${c.physicalDamage} × ${c.percent} / 100, arrondis au supérieur.`;
    const improvement = { stat, value: row.value, unit: row.unit, parts, note, execution: e, maximum: row.maximum, rounded: row.rounded };
    const contribution = { ...improvement, kind: 'umbra', input: row.origin, umbra: row.origin, state: 'normal' };
    return { ...improvement, system: row, improvement, contributions: [contribution] };
  }
  if (row.critical || row.ratioPercent) {
    const sourceParts = row.criticalParts.map(part => ({ ...part, unit: row.unit }));
    const c = row.ratioCurve;
    const score = c ? c.points * c.sourceRatio + (row.umbra > 0 || row.plus > 0 ? c.attributePoints * c.attributeRatio : 0) : 0;
    const note = c ? `Score : ${c.points} Fureur × ${c.sourceRatio} + ${row.umbra > 0 || row.plus > 0 ? c.attributePoints : 0} Force × ${c.attributeRatio} = ${score}. Renforcement : ${c.max} × ${score} / (${c.constant} + ${score}) = ${c.generated} %. Les bonus fixes s’ajoutent une fois, dans la limite de ${c.max} %.` : '';
    const component = (kind, input, value, parts, state = 'normal') => ({ kind, input, stat, value, parts, state, unit: row.unit, maximum: row.maximum,
      ...(note && (kind === 'umbra' || kind === 'plus') ? { note } : {}),
      ...(kind === 'umbra' ? { umbra: row.origin } : {}) });
    const flat = value => [{ stat, value, unit: row.unit, fixed: true }];
    const contributions = [
      component('umbra', row.origin, row.umbra > 0 ? row.generated : 0, row.umbra > 0 ? sourceParts : [], row.uniquePassive ? 'normal' : 'X'),
      component('plus', `${row.key}Plus`, row.plusApplied + (row.umbra > 0 ? 0 : row.generated),
        [...flat(row.plusApplied), ...(row.umbra > 0 ? [] : sourceParts)], row.uniquePassive ? 'normal' : '+'),
      component('normal', row.key, row.normalApplied, flat(row.normalApplied)),
      component('native', null, row.fixed, [{ stat: 'neutral', value: row.fixed, unit: row.unit, fixed: true }]),
    ];
    return { stat, value: row.value, unit: row.unit, system: row, contributions, ...(note ? { note } : {}),
      improvement: { stat, value: row.generated, unit: row.unit, parts: sourceParts, ...(note ? { note } : {}) },
      parts: contributions.filter(part => part.value !== 0).flatMap(part => part.parts),
      maximum: row.maximum, maximumReached: row.maximumReached, rounded: row.rounded };
  }
  if (row.directPercentage) {
    const source = { stat: row.origin, value: row.generated, unit: row.unit, passiveCurve: row.passiveCurve,
      curvePreview: { current: { points: row.umbra, value: row.generated } } };
    const improvement = { stat, value: row.generated, unit: row.unit, parts: [source], passiveCurve: row.passiveCurve };
    const component = (kind, input, value, parts) => ({ kind, input, stat, value, unit: row.unit, parts, state: 'normal', maximum: row.maximum,
      ...(kind === 'umbra' ? { umbra: row.origin, passiveCurve: row.passiveCurve } : {}) });
    const contributions = [component('umbra', row.origin, row.generated, [source]),
      component('normal', row.key, row.normalApplied, [{ stat, value: row.normalApplied, unit: row.unit, fixed: true }]),
      component('plus', `${row.key}Plus`, row.plusApplied, [{ stat, value: row.plusApplied, unit: row.unit, fixed: true }])];
    return { stat, value: row.value, unit: row.unit, system: row, improvement, contributions,
      parts: contributions.filter(part => part.value !== 0).flatMap(part => part.parts),
      maximum: row.maximum, maximumReached: row.maximumReached, rounded: false };
  }
  const generatedUnit = row.converted ? '' : row.unit;
  const generatedParts = [];
  if (row.umbra && row.progression) generatedParts.push({ ...row.progression.source, unit: generatedUnit });
  else if (row.umbra) generatedParts.push({ stat: row.origin, value: row.base, unit: generatedUnit,
    ...(row.sourceRatio == null ? { curvePreview: { current: { points: row.umbra, value: row.base } } }
      : { compact: { source: { stat: row.origin, value: row.umbra }, multiplier: { stat: row.origin, value: row.sourceRatio } } }) });
  if (row.fixed) generatedParts.push({ stat: 'neutral', value: row.fixed, unit: generatedUnit, fixed: true });
  generatedParts.push(...row.bonuses.map(part => ({ ...part, unit: generatedUnit })));
  if (family?.ratioDecimals != null) for (const part of generatedParts) part.ratioDecimals = family.ratioDecimals;
  const improvement = { stat, unit: generatedUnit, parts: generatedParts,
    value: row.converted ? roundBalance(row.generated, B.generatedUmbraStats.sources[row.origin].decimals) : row.generated };
  const parts = [];
  const giftPart = row.umbraFlat ? { stat, value: row.umbraFlat, unit: row.unit, fixed: true } : null;
  if (row.normal !== 0) parts.push({ stat, value: row.normalApplied, unit: row.unit, fixed: true });
  if (row.plusApplied !== 0) parts.push({ stat, value: row.plusApplied, unit: row.unit, fixed: true });
  if (giftPart) parts.push(giftPart);
  if (row.converted && row.state !== 'normal') {
    parts.push({ stat: row.origin, value: row.conversion, unit: row.unit, rounded: true,
      arithmetic: { terms: [{ stat: row.origin, value: row.generated }, '→', { stat, value: row.conversion, unit: row.unit }] } });
  } else {
    parts.push(...generatedParts);
  }
  const difference = round(row.value - parts.reduce((sum, part) => sum + part.value, 0));
  if (difference) parts.push({ stat: 'neutral', value: Math.abs(difference), operator: difference < 0 ? '−' : '+', unit: row.unit, fixed: true,
    ...(family ? { roundingAdjustment: true } : {}) });
  if (parts.length && row.state !== 'normal' && row.rounded) parts[0].rounded = true;
  const sourceGroups = entity ? {
    normal: autonomousSourceParts(entity, row.key, row.normal),
    improved: autonomousSourceParts(entity, `${row.key}Plus`, row.plus),
  } : null;
  let contributions;
  if (family) {
    // Stat+ owns the attribute ratio once; the Umbra owns the remaining gain.
    // For percentage curves, subtract the converted attribute-only baseline.
    const attribute = row.progression && row.umbra > 0 ? 0 : row.attributeConversion;
    const plusValue = row.plus > 0 ? Math.min(row.plusApplied + attribute, row.enhanced) : row.plusApplied;
    const attributeModel = { stat, unit: '', parts: row.bonuses,
      value: roundBalance(row.bonuses.reduce((sum, part) => sum + part.value, 0), family.decimals) };
    const convertedPart = (source, value, calculation, operator = '+') => ({ stat: source, value, unit: row.unit, calculation, operator });
    const flatParts = (key, value) => {
      const raw = entity ? D.getStatContributions(entity, key, { resolveLabels: false, includePreview: true })
        .filter(source => source.category !== 'umbra') : [];
      const sources = raw.length && raw.every(source => source.mode !== 'percent') && round(raw.reduce((sum, part) => sum + part.value, 0)) === round(value)
        ? raw : entity ? autonomousSourceParts(entity, key, value) : [];
      return (sources.length ? sources : [{ value }]).map(part => ({ stat, value: part.value, unit: row.unit, fixed: true, malus: part.value < 0 }));
    };
    const component = (kind, input, value, componentParts) => {
      const terms = componentParts.filter(part => part.value !== 0 || !part.fixed);
      const adjustment = round(value - terms.reduce((sum, part) => sum + (part.operator === '−' ? -part.value : part.value), 0));
      if (adjustment) terms.push({ stat: 'neutral', value: Math.abs(adjustment), operator: adjustment < 0 ? '−' : '+', unit: row.unit, fixed: true, rounded: true,
        roundingAdjustment: kind !== 'normal' });
      return { kind, input, stat, value: round(value), unit: row.unit, parts: terms, maximum: row.maximum, maximumReached: row.maximumReached,
        state: row.uniquePassive || kind === 'normal' ? 'normal' : kind === 'umbra' ? 'X' : '+', ...(kind === 'umbra' ? { umbra: row.origin } : {}) };
    };
    contributions = [
      component('umbra', row.origin, row.enhanced - plusValue,
        row.converted ? [convertedPart(row.origin, row.conversion, improvement),
          ...(attribute ? [convertedPart(family.attribute, attribute, attributeModel, '−')] : [])]
          : row.progression && row.umbra > 0 ? [...generatedParts, ...(giftPart ? [giftPart] : [])]
            : generatedParts.filter(part => row.plus <= 0 || part.stat === row.origin)),
      component('plus', `${row.key}Plus`, plusValue,
        [...flatParts(`${row.key}Plus`, row.plusApplied), ...(row.plus > 0 && !(row.progression && row.umbra > 0)
          ? row.converted ? [convertedPart(family.attribute, attribute, attributeModel)] : row.bonuses : [])]),
      component('normal', row.key, row.normalApplied, flatParts(row.key, row.normal)),
    ];
  }
  return { stat, value: row.value, unit: row.unit, parts, system: row, sourceGroups, improvement, contributions,
    maximum: row.maximum, maximumReached: row.maximumReached, rounded: row.state !== 'normal' && row.rounded };
}

export function getStatSystemSourceTotals(entity, key) {
  const inputs = statDisplayRead(entity)?.inputs || E.getStatSystemInputs(entity);
  const final = calculateStatSources(inputs, key);
  if (B.generatedUmbraStats.sources[final.origin] || final.progression || final.critical || final.key === 'bloodThirsty' || final.bloodExecution) {
    return buildStatSystemModel(final, entity).contributions.filter(part => part.value !== 0).map(part => ({
      category: ['normal', 'native'].includes(part.kind) ? 'fixed' : part.kind,
      stat: part.stat, unit: part.unit, value: part.value, exclusive: true,
      normalValue: ['normal', 'native'].includes(part.kind) ? part.value : 0,
      improvedValue: ['normal', 'native'].includes(part.kind) ? 0 : part.value,
      calculations: { normal: { stat: part.stat, unit: part.unit, value: 0, parts: [] },
        improved: { stat: part.stat, unit: part.unit, value: 0, parts: [] },
        [['normal', 'native'].includes(part.kind) ? 'normal' : 'improved']: part },
      provenance: (part.input ? D.getStatInputProvenance(entity, part.input, part.kind === 'umbra' ? '' : part.unit) : [])
        .filter(source => source.state === (part.kind === 'plus' ? '+' : 'normal')),
      ...(part.umbra ? { umbra: part.umbra } : {}),
    }));
  }
  const sourceKeys = [key, `${key}Plus`];
  const contributions = sourceKeys.flatMap(sourceKey => autonomousSourceParts(entity, sourceKey, capacity(inputs[sourceKey]))
    .map(part => ({ ...part, key: sourceKey })));
  const totals = [];
  const active = new Set();
  const amount = sourceKey => contributions.filter(source => source.key === sourceKey && active.has(source.category))
    .reduce((sum, source) => sum + source.value, 0);
  const calculation = (category, before, after, kind) => {
    const stat = getDisplayStatKey(key);
    const component = row => {
      if (!row) return [];
      if (kind === 'normal') return [{ stat, value: row.normalApplied, unit: row.unit, fixed: true }];
      const model = buildStatSystemModel({ ...row, normal: 0, normalApplied: 0, value: row.enhanced });
      return model.parts.map(part => part.arithmetic && row.converted
        ? { ...part, calculation: model.improvement } : part);
    };
    const current = component(after);
    const previous = component(before);
    const parts = [];
    const signature = ({ rounded, ...value }) => JSON.stringify(value);
    // Cancel unchanged ratios. A later source only owns its actual increment.
    for (const part of current) {
      const match = previous.findIndex(other => signature(other) === signature(part));
      if (match >= 0) previous.splice(match, 1);
      else parts.push(part);
    }
    parts.push(...previous.map(part => ({ ...part, operator: part.operator === '\u2212' ? '+' : '\u2212' })));
    const sourceKey = kind === 'normal' ? key : `${key}Plus`;
    const fixed = parts.filter(part => part.fixed && part.stat === stat);
    const delta = round(fixed.reduce((sum, part) => sum + (part.operator === '\u2212' ? -part.value : part.value), 0));
    const raw = D.getStatContributions(entity, sourceKey, { resolveLabels: false, includePreview: true })
      .filter(source => source.category === category);
    const inputs = raw.length && raw.every(source => source.mode !== 'percent')
      && round(raw.reduce((sum, source) => sum + source.value, 0)) === delta
      ? raw.map(source => ({ stat, value: source.value, unit: after.unit, fixed: true, state: kind === 'normal' ? 'normal' : '+' }))
      : [{ stat, value: delta, unit: after.unit, fixed: true, state: kind === 'normal' ? 'normal' : '+' }];
    return { stat, unit: after.unit, parts: [...inputs, ...parts.filter(part => !fixed.includes(part))].filter(part => part.value !== 0),
      value: round(kind === 'normal' ? after.normalApplied - (before?.normalApplied || 0) : after.enhanced - (before?.enhanced || 0)) };
  };
  const add = (category, before, after) => {
    const normalValue = after.normalApplied - (before?.normalApplied || 0);
    const improvedValue = after.enhanced - (before?.enhanced || 0);
    const value = round(normalValue + improvedValue);
    if (value) totals.push({ category, value, normalValue: round(normalValue), improvedValue: round(improvedValue), stat: getDisplayStatKey(key), unit: final.unit,
      calculations: { normal: calculation(category, before, after, 'normal'), improved: calculation(category, before, after, 'improved') },
      ...(category === 'equipment' ? { family: 'fixed' } : {}),
      provenance: category === 'umbra' && final.umbra > 0 ? D.getStatInputProvenance(entity, final.origin)
        : ['fixed', 'equipment'].includes(category) ? D.getStatInputProvenance(entity, key, final.unit, category) : [],
      ...(category === 'umbra' && final.umbra > 0 ? { umbra: final.origin } : {}) });
  };
  let previous = calculateStatSources({ ...inputs, [key]: 0, [`${key}Plus`]: 0 }, key);
  add('umbra', null, previous);
  for (const category of ['fixed', 'stat', 'equipment', 'combat']) {
    active.add(category);
    const candidate = { ...inputs };
    for (const sourceKey of sourceKeys) candidate[sourceKey] = amount(sourceKey);
    const next = calculateStatSources(candidate, key);
    add(category, previous, next);
    previous = next;
  }
  return totals;
}

statSystemReady = true;
