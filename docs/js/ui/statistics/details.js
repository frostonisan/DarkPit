// Read-only stat details and HTML helpers. Formula results come from the calculation owners.
import { buildStatHelperContent } from "../../data/helpers.js";
import {
  calculateStatSources, getStatSystemResult, buildStatSystemModel, getStatSystemSourceTotals,
  getDirectingStatResult, describeStatPointLimit, withStatDisplayReads
} from "../../entities/statSystem.js";
import { stats } from "../../data/statsData.js";
import { getStatEffectMaximum, balanceData, roundBalance } from "../../data/balanceData.js";
import { isUmbraRestricted } from "../../procedural/proc-bareme.js";
import {
  getSafe, normalizeStatKey, getDisplayStatKey, calculatePenetrationPercent,
  calculateResistanceReductionPercent
} from "../../entities/rules.js";
import { getAttackNatureRules, getAttackResolutionFlags } from "../../combat/attackResolution.js";
import {
  calculateVitalityBonus, calculateVelocityReduction, calculateDodgePercent, calculatePrecisionPercent,
  calculateAstralityPercent, calculateRobustnessArmorDetails, getBloodThirstyPercent,
  calculateHastePercent, calculateLvlMaxBonus, calculateTranscendenceExtraLife, BaseDayHpRegen,
  calculateWeaponMasteryCharge, getMovementWeightMalus, getStatBeforeGeneration, getStatSystemInputs,
  getWeaponOrfevrePreviewActivePercent
} from "../../entities/runtime.js";
import { calculateHypercognitionEssenceCount } from "../../items/essenceInventory.js";
import { astralCooldownRemaining, transcendentalCooldownRemaining, indestructibilityCooldownRemaining, esoterismCooldownRemaining } from "../../combat/effects.js";
import { getEquipmentResourceCurrent, getEquipmentResourceMax } from "../../items/resourceStocks.js";
import {
  getStatContributions, getStatInputProvenance, getAttackPurity, ATTACK_TIME_REDUC_CAP, calculateTotalDodgeBonus,
  calculateIndestructibilityPercentFromEntity, caluclateIndestructibilityStrengthReduction, caluclateIndestructibilityReduction, caluclateIndestructibilityReductionTotal,
  calculateHpBattleRegenStrengthRatio, calculateHpBattleRegenIndestructibilityRatio, calculateHpBattleRegenBase, calculateHpBattleRegenPercent,
  calculateHpBattleRegenAmount, esoterismResult,
  transcendenceConsoProtection, calculateTranscendenceConsoProtectionTotal, calculateTranscendenceUmbraProtection,
  transcendenceConsoIntel, calculateTranscendentalCooldown, bloodFuryExecutionResult, calculateBloodThirstyPercent,
  calculateBloodFuryExecutionPercent,
  calculateBloodFuryTargetThreshold, calculateExecutionDamage,
  ambidextryResult, transpiercingAgiRatio, transpiercingTotal,
  criticalResult, calculateCritAgiChanceBonus, calculateCritRatioBonus, calculateCritAgiRatioBonus,
  resilienceResult, calculateResilienceStrengthCritBonus, calculateResilienceCritTotalBonus, calculateResilienceAlterationBonus,
  calculateResilienceIntelligenceAlterBonus, calculateResilienceAlterationTotalBonus, calculateResilienceCancelBonus, calculateResilienceStrengthCancelBonus,
  calculateResilienceTotalCancelBonus, calculateHindranceResistance, round1, calculateRangeRatio,
  calculateStrength, calculateAgility, calculateHasteIntelRatio, calculateHasteCDReduc,
  calculateHasteRecupReduc, calculateHastePrepReduc, calculateHasteExecReduc, calculateHasteProjectilSpeed,
  getFinalAttackCooldownReduc, getFinalAttackPreparationReduc, getFinalAttackExecutionReduc, getFinalAttackRecoveryReduc,
  getFinalAttackProjectileSpeed, calculateProjectilSpeedPercent, calculateIntelligence, toNumber,
  clampPercent, getHastePoints, applyReducToMs, getEffectiveAttackTimings,
  calculateExtraLifeResurrect, astralityResult, calculateIntelAstralityRatio, calculateAstralityTotal,
  calculateAstralCooldown, calculateAstralReturn, calculateAstralBody, calculateHypercognitionRatio,
  calculateHypercognitionBonus, calculateHypercognitionEssences, calculateCognitiveExplosionTotal, calculateMagicalTotal,
  calculateLvlMaxBaseEntite, calculateLvlMaxEntiteWithWill, calculatewillAwakeBonus, calculateVitalityRegenPercent,
  calculateVitalityRegenAmount, calculateTotalRegenAmount, baseBrokenSpellChance, intelBrokenSpellChance,
  calculateBrokenSpellChance, baseBrokenSpellDamage, intelBrokenSpellBaseDamage, magicalBrokenSpellDamage,
  calculateBrokenSpellDamage, calculateExecStrengthRatio, calculateMeleeExecBonus, totalMeleeExecReduction,
  calculatePiercingRecupBonus, calculateTranspiercingRecupBonus, calculatePiercingRecupAgiRatio, calculateTranspiercingRecupAgiRatio,
  totalPiercingRecupReductionWithAgi, totalTranspiercingRecupReductionWithAgi, getGeneratedUmbraStatDetail, getGeneratedUmbraTargetDetail,
  brutalityPercantBonus, brutalityBonus, brutalityPhysicalPowerBonus, brutalityTotalBonus,
  psionicPercantBonus, psionicBonus, psionicPMBonus, psionicTotalBonus,
  calculateMysticismBaseProcChance, calculateMysticismIntelProcChance, calculateMysticismProcChance, calculateMysticismBaseTranceDuration,
  calculateMysticismIntelTranceDuration, calculateMysticismTranceDuration, calculateMysticismBasePreparationAcceleration, calculateMysticismIntelPreparationAcceleration,
  calculateMysticismPreparationAcceleration, calculateMysticismBaseDamageBonus, calculateMysticismIntelDamageBonus, calculateMysticismTotalDamageBonus,
  vivaciteResult, equilibreResult, calculateEquilibreBaseAggroReduction, calculateEquilibreIntelAggroReduction,
  calculateEquilibreAggroBonus, calculateEquilibreAggroReduction, calculateEquilibreBaseInvisibleDetection, calculateEquilibreAgiInvisibleDetection, calculateEquilibreInvisibleDetection,
  calculateEquilibreBaseBalancedAttackChance, calculateEquilibreIntelBalancedAttackChance, calculateEquilibreAttackChance, calculateOccultismBaseInvisibilityChance,
  calculateOccultismAgiInvisibilityChance, calculateOccultismInvisibilityChance, calculateOccultismBaseTargetableChance, calculateOccultismAgiTargetableChance,
  calculateOccultismTargetableChance, calculateOccultismBaseDodgeBonus, calculateOccultismAgiDodgeBonus, calculateOccultismDodgeBonus,
  calculateOccultismBaseCritChanceBonus, calculateOccultismAgiCritChanceBonus, calculateOccultismCritChanceBonus, calculateOccultismShadowFragilityPercent,
  calculateOccultismPreparationSpeedDebuff, calculateOccultismTargetableChanceDisplay, getMovementValue, getMovementAgilityValue,
  calculateMovementMaxCharges, calculateMovementStartingChargeDetails, calculateMovementStartingChargePercent, calculateMovementStartingCharges,
  calculateMovementMarathonChance, calculateMovementTrailerChance, calculateWeaponOrfevreWeaponMastery, calculateWeaponOrfevreStrength,
  calculateWeaponOrfevreBonus, calculateWeaponMasteryTotalTrophyChance, calculateWeaponMasteryTrophyChance, calculateWeaponMasteryTrophyStrengthBonus,
  calculateChargeEquipmentSlots, weaponMasteryChargeStrenghtRatioBonus, calculateWeaponMasteryTotalChargeBonus
} from "../../combat/statistics.js";

function buildDisplayedStatModel(system, entity) {
  const model = buildStatSystemModel(system, entity);
  const armor = system.key === 'armor' ? getSafe(entity, 'armor', 0) : null;
  if (armor?.totalMax == null || armor.totalMax === model.value) return model;
  const value = Number(armor.totalMax), difference = value - model.value;
  const part = { stat: 'armor', value: Math.abs(difference), unit: '', fixed: true,
    ...(difference < 0 ? { operator: '−' } : {}) };
  return { ...model, value, parts: [...model.parts, part], contributions: [...(model.contributions || []),
    { kind: 'normal', input: 'armor', stat: 'armor', value: difference, unit: '', state: 'normal', parts: [part] }] };
}

export function isDisplayableStatContribution(contribution) {
  return Boolean(contribution?.external);
}

export function getWillBonusUI(lvlMaxBonus) {
  const bonus = Number(lvlMaxBonus) || 0;

  return {
    lvlMaxBonusAbs: Math.abs(bonus),                 // jamais de "-" ici
    lvlMaxBonusOp: bonus < 0 ? "-" : "+",            // signe affiché
    lvlMaxBonusOpClass: bonus < 0 ? "less" : "plus", // classe du signe
  };
}

export function calculateStatsDisplay(statKey, entite, statValue, options = {}) {
  return withStatDisplayReads(() => calculateStatsDisplayContent(statKey, entite, statValue, options));
}

function calculateStatsDisplayContent(statKey, entite, statValue, { nestedHelper = false, includeHelper = true } = {}) {
    // An explicit preview value must not bypass an inactive Umbra.
    if (isUmbraRestricted(entite, statKey)) statValue = 0;
    const key = normalizeStatKey(statKey);
    if (!includeHelper && (stats.some(stat => stat.key === key && stat.nature === 'umbra')
      || ['strength', 'intelligence', 'agility'].includes(key))) {
      const value = statValue ?? getSafe(entite, key, 0);
      return { displayValue: key === 'movement' ? getMovementValue(entite)
        : balanceData.generatedUmbraStats.sources[key] ? Math.max(0, Number(value) || 0) : value,
        helpContent: '', ambianceContent: '' };
    }
    let result = {
        pointLimitText: includeHelper ? describeStatPointLimit(getDirectingStatResult(entite, key)) : '',
        displayValue: statValue,
        reductionPercent: 0,
		vitalityBonus: 0,
		HpRegenBonus: 0,
		HpRegenAmount: 0,
		vitalityValue: 0,
		maxHPValue: 0,
		HpRegenCalc: "",
		hasteValue: 0,
		hastePercent: null,
		hasteIntelRatio: null,
		hastePreparation: null,
		hasteCDReduc: null,
		hasteRecupReduc: null,
		hasteExecutionReduc: null,
		hasteProjectilSpeed: null,
		attackCooldownReducTotal: 0,
attackCooldownReducBase: 0,
attackCooldownReducHaste: 0,
attackCooldownReducOther: 0,

attackPreparationReducTotal: 0,
attackPreparationReducBase: 0,
attackPreparationReducHaste: 0,
attackPreparationReducOther: 0,

attackExecutionReducTotal: 0,
attackExecutionReducBase: 0,
attackExecutionReducHaste: 0,
attackExecutionReducOther: 0,

attackRecoveryReducTotal: 0,
attackRecoveryReducBase: 0,
attackRecoveryReducHaste: 0,
attackRecoveryReducOther: 0,

attackProjectileSpeedTotal: 0,
attackProjectileSpeedBase: 0,
attackProjectileSpeedHaste: 0,
attackProjectileSpeedOther: 0,
		dayHpRegenBase: 0,
		dayHpRegenFromVitality: 0,
		dayHpRegenTotal: 0,
        armorBonus: 0,
        armorCalculation: null,
        velocityBonus: 0,
		velocityReductionPercent: 0,
		velocityAdjustedSpeedMs: 0,
		displayValueMs:0,
        dodgeBonus: 0,
        precisionBonus: 0,
        indestructibilityBonus: 0,
hpBattleRegenBase: 0,
hpBattleRegenStrengthRatio: 0,
hpBattleRegenIndestructibilityRatio: 0,
hpBattleRegenPercent: 0,
        esoterismBonus: 0,
        astralityBonus: 0,
		bloodFuryBloodThirstyBonus: 0,
		bloodFuryBloodThirstyFlatBonus: 0,
		bloodFuryBloodThirstyBfRatioBonus: 0,
		bloodFuryBloodThirstyStrengthRatioBonus: 0,
        bloodThirstyLifestealBonus: 0,
		bloodThirstyValue: 0,
        bloodFuryBfRatioBonus: 0,
        bloodFurySRatioBonus: 0,
        bloodFuryExecutionBonus: 0,
        bloodFuryExecSRatioBonus: 0,
        bloodFuryExecChanceBonus: 0,
        bloodFuryExecSRatio: 0,
        bloodFuryExecDamage: 0,
		bloodFuryExecutionChanceTotal: 0,
bloodFuryExecutionChanceFlat: 0,
bloodFuryExecutionChancePower: 0,
bloodFuryExecutionChanceStrength: 0,

bloodFuryExecutionDamageTotal: 0,
bloodFuryExecutionDamageFlat: 0,
bloodFuryExecutionDamagePercent: 0,
bloodFuryExecutionDamagePhysical: 0,
bloodFuryExecutionDamageStrengthRatio: 0,

bloodFuryTargetThresholdTotal: 0,
bloodFuryTargetThresholdFlat: 0,
bloodFuryTargetThresholdBase: 0,
bloodFuryTargetThresholdStrength: 0,

bloodThirstyTotal: 0,
        physicPenBonus: 0,
        magicPenBonus: 0,
		magicalBaseValue: 0,
		calculateMagicalTotalValue: 0,
        ambidextryBonus: 0,
        ambidextryProcBonus: 0,
        ambidextryAgiChance: 0,
        ambidextryTotalChance: 0,
        ambidextryRatioBonus: 0,
        ambidextryAgiRatioBonus: 0,
        ambidextryDamageBonus: 0,
        critChanceBonus: 0,
        critAgiChanceBonus: 0,
        critTotalChance: 0,
        critRatioBonus: 0,
        critAgiRatioBonus: null,
        critDamageBonus: null,
		resilienceBonus: 0,
		will :0,
		transcendenceExBonus :0,
		transcendenceConsoProtectionPercent: 0,
		extraLifeDisplay: null,
		extraLifeCurrent: 0,
		extraLifeMax: 0,
		calculateRangeRatioBase: 0,
		calculateRangeRatioTotal: 0,
		rangeTranspiercingAccuracyBonus: 0,
		rangeTranspiercingAccuracyTotal: 0,
		transpiercingDamageBonus: 0,
		transpiercingPowerTotal: 0,
		transpiercingPowerPiercing: 0,
		transpiercingPowerAgility: 0,
		transpiercingPowerRatio: 0,
		meleeExecBaseBonus: null,
		meleeExecHasteReduc: null,
		meleeExecStrengthBonus: null,
		meleeExecTotalReduc: null,
		piercingRecupBaseBonus: null,
		piercingRecupHasteReduc: null,
		piercingRecupAgiBonus: null,
		piercingRecupTotalReduc: null,
		psionicPercantBonus: null,
		psionicBonus: 0,
		psionicPMBonus: 0,
		psionicTotalBonus: 0,
		psionicMagicalPower: 0,
		mysticismValue: 0,
		mysticismBaseProcChance: 0,
		mysticismIntelProcChance: 0,
		mysticismProcChance: 0,
		mysticismBaseTranceDuration: 0,
		mysticismIntelTranceDuration: 0,
		mysticismTranceDuration: 0,
		mysticismBasePreparationAcceleration: 0,
		mysticismIntelPreparationAcceleration: 0,
		mysticismPreparationAcceleration: 0,
		mysticismBaseDamageBonus: 0,
		mysticismIntelDamageBonus: 0,
		mysticismDamageBonus: 0,
		equilibreValue: 0,
		equilibreBaseAggroReduction: 0,
		equilibreIntelAggroReduction: 0,
		equilibreAggroReduction: 0,
		equilibreAggroBonus: 0,
		equilibreBaseInvisibleDetection: 0,
		equilibreAgiInvisibleDetection: 0,
		equilibreInvisibleDetection: 0,
		equilibreBaseBalancedAttackChance: 0,
		equilibreIntelBalancedAttackChance: 0,
		equilibreBalancedAttackChance: 0,
		occultismValue: 0,
		occultismBaseInvisibilityChance: 0,
		occultismAgiInvisibilityChance: 0,
		occultismInvisibilityChance: 0,
		occultismBaseTargetableChance: 0,
		occultismAgiTargetableChance: 0,
		occultismTargetableChance: 0,
		occultismBaseDodgeBonus: 0,
		occultismAgiDodgeBonus: 0,
		occultismDodgeBonus: 0,
		occultismBaseCritChanceBonus: 0,
		occultismAgiCritChanceBonus: 0,
		occultismCritChanceBonus: 0,
		occultismShadowFragilityPercent: 0,
		occultismTargetableChanceDisplay: 0,
		occultismPreparationSpeedDebuff: 0,
		marathonChance: 0,
		marathonBaseChance: 0,
		marathonMovementBonus: 0,
		marathonOtherBonus: 0,
		trailerChance: 0,
		trailerBaseChance: 0,
		trailerMovementBonus: 0,
		trailerOtherBonus: 0,
		movementValue: 0,
		movementMaxCharges: 0,
		movementStartingBasePercent: 0,
		movementStartingAgiRatioCurrent: 0,
		movementStartingTotalCurrent: 0,
		movementMarathonChance: 0,
		movementTrailerChance: 0,
		movementStartingCharges: 0,
		shiftCurrent: 0,
		shiftMax: 0,
		shiftHasDefaultBase: false,
		shiftBaseMax: 0,
		shiftMovementMaxBonus: 0,
		shiftOtherMaxBonus: 0,
		shiftBaseCurrent: 0,
		shiftMovementCurrentBonus: 0,
		shiftOtherCurrentBonus: 0,
		shiftWeightScore: 0,
		shiftWeightClass: "",
		shiftWeightLabel: "",
		shiftWeightMalus: 0,
		weaponMasteryChargeBonus: 0,
		weaponMasteryChargeBrutRatioBonus: 0,
		weaponMasteryChargeStrengthRatioBonus: 0,
		weaponCollectorChance: 0,
		weaponCollectorBase: 0,
		weaponCollectorOtherBonus: 0,
		weaponOrfevreBonus: 0,
		weaponOrfevreWeaponMastery: 0,
		weaponOrfevreStrength: 0,
		weaponOrfevreChance: 0,
		weaponOrfevreBase: 0,
		weaponOrfevreOtherBonus: 0,
		weaponOrfevreStuffActiveBonus: 0,
		weaponMasteryTrophyChance: 0,
		weaponMasteryTrophyWeaponMasteryBonus: 0,
		weaponMasteryTrophyStrengthBonus: 0,
		chargeEquipmentSlots: 0,
        helpContent: "",
		ambianceContent: "",
    };

const safe = (path, fallback = 0) => getSafe(entite, path, fallback);
const autonomousInput = key => {
  const row = getStatSystemResult(entite, key);
  return row ? row.normal + row.plusApplied : Number(safe(key, 0)) || 0;
};
const canonicalStatKey = normalizeStatKey(statKey);
if (canonicalStatKey === "orfevre-detail") {
  const detail = statValue && typeof statValue === "object" ? statValue : {};
  const detailStat = normalizeStatKey(detail.stat || "");

  result.orfevreDetail = {
    stat: detailStat,
    visualStat: getDisplayStatKey(detailStat || "weaponOrfevre"),
    label: detail.label || detailStat || "Statistique",
    raw: detail.raw ?? 0,
    exactBonus: detail.exactBonus ?? 0,
    bonus: detail.bonus ?? 0,
    exactTotal: detail.exactTotal ?? 0,
    total: detail.total ?? detail.exactTotal ?? 0,
    activePercent: Number(detail.activePercent) || 0,
    preview: Boolean(detail.preview),
    previewDetail: detail.previewDetail || null,
  };

  result.displayValue = result.orfevreDetail.total;
}
const generatedUmbraTarget = getGeneratedUmbraTargetDetail(entite, canonicalStatKey, statValue);
if (generatedUmbraTarget) {
  result.generatedUmbraTarget = generatedUmbraTarget;
  result.displayValue = generatedUmbraTarget.finalValue;
}

const generatedUmbraSource = getGeneratedUmbraStatDetail(entite, canonicalStatKey, statValue);
if (generatedUmbraSource) {
  result.generatedUmbraSource = generatedUmbraSource;
  result.displayValue = generatedUmbraSource.sourceValue;
}
 // === HP ===
 const getMaxHP = () => {
  const hpMax = safe("HP.max", null);
  if (hpMax != null) return toNumber(hpMax, 0);
  return toNumber(safe("maxHP", 0), 0);
};
if (statKey === "HP") {
  const hp = safe("HP", null);
  if (hp && typeof hp === "object") {
    result.displayValue = `HP : ${hp.current}/${hp.max}`;
  }
}
// === Extra Life  ===
if (statKey === "extraLife") {
  const ex = safe("extraLife", null); // preview.total -> stats -> baseStats

  result.extraLifeCurrent =
    (ex && typeof ex === "object" && typeof ex.current === "number") ? ex.current : 0;

  result.extraLifeMax =
    (ex && typeof ex === "object" && typeof ex.max === "number") ? ex.max : 0;

  const maxOnly = (result.extraLifeMax > 0) ? String(result.extraLifeMax) : null;
  result.displayValue = maxOnly;
  result.extraLifeDisplay = maxOnly;

  const resurrect = calculateExtraLifeResurrect(entite);
  result.extraLifeResurrectHP = resurrect.restoredHP;
  result.extraLifeResurrectPercentTotal = resurrect.totalPercent;
  result.extraLifeResurrectPercentIntel = resurrect.intelPercent;
  result.extraLifeResurrectPercentRaw = resurrect.rawPercent;
  result.extraLifeMaxHP = resurrect.maxHP;
}

// === Transcendence ===
if (['transcendence', 'improvedResurrection'].includes(canonicalStatKey)) {
  result.improvedResurrection = calculateExtraLifeResurrect(entite);
  // A rechargeable life still belongs to the entity while its stock is empty.
  // A consumed faded life no longer belongs to it. Read current effective pools,
  // including equipment, rather than the catalog or the raw initial stats.
  result.resurrectionHealing = ['extraLife', 'fadedLife', 'eternalLife'].flatMap(pool => {
    const stock = entite?.stats?.[pool] ?? 0;
    const current = Math.max(0, Number(stock?.current ?? stock) || 0);
    const maximum = Math.max(0, Number(stock?.max ?? stock) || 0);
    if (!(pool === 'fadedLife' ? current > 0 : Math.max(current, maximum) > 0)) return [];
    const healing = pool === 'extraLife' ? result.improvedResurrection
      : calculateExtraLifeResurrect(entite, { basePercent: balanceData.resurrection[`${pool}Ratio`] * 100,
        perIntel: 0, maxPercent: 100 });
    return [{ pool, current, maximum, ...healing }];
  });
}
if (statKey === "transcendence") {
  const value = statValue ?? safe("transcendence");
  result.transcendenceLives = globalThis.umbraProgression.transcendenceExtraLifeDetails(value, globalThis.umbraProgression.getUmbraThreshold(entite));
  result.transcendenceExBonus = result.transcendenceLives.value;
  result.transcendenceConsoProtectionBase = transcendenceConsoProtection(value);
  result.transcendenceConsoIntelBonus = transcendenceConsoIntel(entite);
  result.transcendenceConsoProtectionPercent = calculateTranscendenceUmbraProtection(entite);
  result.transcendentalCooldown = calculateTranscendentalCooldown(entite);
}
if (['transcendence', 'transcendenceTotal', 'transcendentalCooldown'].includes(canonicalStatKey)) {
  result.transcendentalCooldown = calculateTranscendentalCooldown(entite);
  result.transcendentalUnavailableSeconds = transcendentalCooldownRemaining(entite);
}
// === Résistances ===
if (["physicalResistance", "magicalResistance"].includes(canonicalStatKey)) {
  const value = Number(statValue ?? safe(canonicalStatKey, 0)) || 0;
  result.reductionPercent = calculateResistanceReductionPercent(value);
  result.displayValue = result.reductionPercent; // cohérent UI
}
// === Pénétrations ===
if (canonicalStatKey === "physicalPen") {
  const value = Number(statValue ?? safe("physicalPen", 0)) || 0;
  result.physicPenBonus = calculatePenetrationPercent(entite, "physicalPen", value);
}
if (canonicalStatKey === "magicalPen") {
  const value = Number(statValue ?? safe("magicalPen", 0)) || 0;
  result.magicPenBonus = calculatePenetrationPercent(entite, "magicalPen", value);
}
// === Vitalité ===
if (statKey === "vitality") {
  const value = toNumber(statValue ?? safe("vitality", 0), 0);
  result.vitalityValue = value;
  result.vitalityBonus = calculateVitalityBonus(value);
  const maxHP = getMaxHP();
  result.maxHPValue = maxHP;
  result.HpRegenBonus = calculateVitalityRegenPercent(value);
  result.HpRegenAmount = calculateVitalityRegenAmount(maxHP, result.HpRegenBonus);
}
// === dayHpRegen ===
if (statKey === "dayHpRegen") {
  const base = BaseDayHpRegen(entite);
  result.dayHpRegenBase = base;
  const vitality = toNumber(safe("vitality", 0), 0);
  const maxHP = getMaxHP();
  const regenPercent = calculateVitalityRegenPercent(vitality);
  const bonus = calculateVitalityRegenAmount(maxHP, regenPercent);
  result.dayHpRegenFromVitality = bonus;
  result.dayHpRegenTotal = calculateTotalRegenAmount(base, bonus);
  result.displayValue = result.dayHpRegenTotal;
}
// === Robustesse ===
if (statKey === "robustness") {
    const value = statValue ?? safe("robustness");
    result.armorCalculation = calculateRobustnessArmorDetails(value, safe('strength'), globalThis.umbraProgression.getUmbraThreshold(entite));
    result.armorBonus = result.armorCalculation.armor;
}
// === Weapon Mastery ===
if (statKey === "weaponMastery") {
  const value = Number(statValue ?? safe("weaponMastery", 0)) || 0;

  result.weaponMasteryChargeBrutRatioBonus = calculateWeaponMasteryCharge(entite, value);
  result.weaponMasteryChargeStrengthRatioBonus = value > 0 ? weaponMasteryChargeStrenghtRatioBonus(entite) : 0;
  result.weaponMasteryChargeBonus = calculateWeaponMasteryTotalChargeBonus(entite, value);

  result.weaponOrfevreWeaponMastery = calculateWeaponOrfevreWeaponMastery(entite, value);
  result.weaponOrfevreStrength = calculateWeaponOrfevreStrength(entite);
  result.weaponOrfevreBonus = calculateWeaponOrfevreBonus(entite);
  result.weaponMasteryTrophyChance = calculateWeaponMasteryTotalTrophyChance(entite, value);
  result.weaponMasteryTrophyWeaponMasteryBonus = calculateWeaponMasteryTrophyChance(entite, value);
result.weaponMasteryTrophyStrengthBonus = value > 0 ? calculateWeaponMasteryTrophyStrengthBonus(entite) : 0;
}

// === Orfèvre armurier ===
if (statKey === "weaponOrfevre") {
  const value = Number(statValue ?? safe("weaponOrfevre") ?? 0);
  const previewStuffActive = Number(
    entite?.modifierStats?.preview?.meta?.derived?.stuffWeaponOrfevre?.activePercent
  );
  const durableStuffActive = Number(
    entite?.modifierStats?.durable?.stuff?.orfevre?.activePercent
  );

  result.weaponOrfevreChance = value;
  result.weaponOrfevreBase = Number(entite?.baseStats?.weaponOrfevre || 0);
  result.weaponOrfevreStuffActiveBonus = Number.isFinite(previewStuffActive)
    ? previewStuffActive
    : Number.isFinite(durableStuffActive)
      ? durableStuffActive
      : value;

  // Apport global de weaponMastery, sans détail des ratios
  result.weaponOrfevreWeaponMastery = Number(calculateWeaponOrfevreBonus(entite) || 0);

  result.weaponOrfevreOtherBonus = Math.max(
    0,
    result.weaponOrfevreChance -
      result.weaponOrfevreBase -
      result.weaponOrfevreWeaponMastery
  );

  result.weaponOrfevreBonus = result.weaponOrfevreChance;
}
// === Collectionneur de guerre ===
if (statKey === "weaponCollector") {
  const value = Number(statValue ?? safe("weaponCollector") ?? 0);

  result.weaponCollectorChance = value;
  result.weaponCollectorBase = Number(entite?.baseStats?.weaponCollector || 0);

  // Apport global de weaponMastery, sans détail des ratios
  result.weaponMasteryTrophyWeaponMasteryBonus = Number(calculateWeaponMasteryTotalTrophyChance(entite) || 0);

  result.weaponCollectorOtherBonus = Math.max(
    0,
    result.weaponCollectorChance -
      result.weaponCollectorBase -
      result.weaponMasteryTrophyWeaponMasteryBonus
  );

  result.weaponMasteryTrophyChance = result.weaponCollectorChance;
}
if (statKey === "charge") {
  const value = Number(statValue ?? safe("charge", 0)) || 0;
  const weaponMasteryValue = Number(safe("weaponMastery", 0)) || 0;

  result.chargeEquipmentSlots = calculateChargeEquipmentSlots(entite, value);

  result.weaponMasteryChargeBonus = weaponMasteryValue > 0
    ? calculateWeaponMasteryTotalChargeBonus(entite, weaponMasteryValue)
    : 0;
  result.weaponMasteryChargeBonus = Math.min(
    result.chargeEquipmentSlots,
    Math.max(0, result.weaponMasteryChargeBonus)
  );
}

// === Velocity ===
const vel = Number(safe("velocity", 0)) || 0;
const timingInputs = ['velocity', 'vivacite', 'speed'].includes(statKey) && entite?.baseStats ? getStatSystemInputs(entite, { combat: false }) : null;
const baseSpeedMs = Number(timingInputs?.speed ?? entite?.baseStats?.speed ?? safe("baseStats.speed", safe("speed", 1000))) || 1000;
if (statKey === 'vivacite') {
  const adjustedSpeed = Number(safe('speed', baseSpeedMs));
  result.vivaciteTiming = { baseSpeedMs, ...calculateVelocityReduction(vivaciteResult(entite, 'velocity').value, baseSpeedMs), adjustedSpeed, seconds: adjustedSpeed / 1000 };
}
if (statKey === 'agileRetreat') result.agileRetreatChance = globalThis.umbraProgression.retreatChance(vivaciteResult(entite, 'velocity').value);
if (statKey === "velocity") {
  const v = vel;
  result.displayValue = v;
  if (baseSpeedMs > 0 && v > 0) {
    const { percentage, adjustedSpeed } = calculateVelocityReduction(v, baseSpeedMs);
    result.velocityReductionPercent = Number((percentage ?? 0).toFixed(2));
    result.velocityAdjustedSpeedMs = Number(safe('speed', adjustedSpeed));
    result.velocityTimingAdjustmentMs = result.velocityAdjustedSpeedMs - adjustedSpeed;
  } else {
    result.velocityReductionPercent = 0;
    result.velocityAdjustedSpeedMs = Number(safe('speed', baseSpeedMs));
    result.velocityTimingAdjustmentMs = result.velocityAdjustedSpeedMs - baseSpeedMs;
  }}
// === Speed ===
if (statKey === "speed") {
  const finalSpeedMs = Number(safe("speed", 0)) || 0;
  result.displayValueMs = `${finalSpeedMs} ms`;          // (tu avais "secondes" alors que c’est ms)
  result.displayValue = `${(finalSpeedMs / 1000).toFixed(2)}s`;
}
// === Dodge ===
if (statKey === "dodge") {
  const value = statValue ?? safe("dodge");
  result.dodgeValue = Number(value) || 0;
  result.dodgeBonus = calculateDodgePercent(value);
  result.calculateTotalDodgeBonus = calculateTotalDodgeBonus(entite);
}

// === Precision ===
if (statKey === "precision") {
    const value = statValue ?? safe("precision");
    result.precisionBonus = calculatePrecisionPercent(value);
}
// === Occultisme ===
if (statKey === "occultism") {
  const value = Number(statValue ?? safe("occultism", 0)) || 0;
  result.occultismValue = value;
  result.occultismBaseInvisibilityChance = calculateOccultismBaseInvisibilityChance(entite);
  result.occultismAgiInvisibilityChance = calculateOccultismAgiInvisibilityChance(entite);
  result.occultismInvisibilityChance = calculateOccultismInvisibilityChance(entite);
  result.occultismBaseTargetableChance = calculateOccultismBaseTargetableChance(entite);
  result.occultismAgiTargetableChance = calculateOccultismAgiTargetableChance(entite);
  result.occultismTargetableChance = calculateOccultismTargetableChance(entite);
  result.occultismBaseDodgeBonus = calculateOccultismBaseDodgeBonus(entite);
  result.occultismAgiDodgeBonus = calculateOccultismAgiDodgeBonus(entite);
  result.occultismDodgeBonus = calculateOccultismDodgeBonus(entite);
  result.occultismBaseCritChanceBonus = calculateOccultismBaseCritChanceBonus(entite);
  result.occultismAgiCritChanceBonus = calculateOccultismAgiCritChanceBonus(entite);
  result.occultismCritChanceBonus = calculateOccultismCritChanceBonus(entite);
  result.occultismShadowFragilityPercent = calculateOccultismShadowFragilityPercent(entite);
result.occultismTargetableChanceDisplay = calculateOccultismTargetableChanceDisplay(entite);
result.occultismPreparationSpeedDebuff = calculateOccultismPreparationSpeedDebuff(entite);
  result.displayValue = value;
}

// === Indestructibility ===
if (statKey === "indestructibility") {
  const P = globalThis.umbraProgression;
  const value = Math.max(0, Number(statValue ?? safe('indestructibility')) || 0);
  const strength = Number(safe('strength', 0)) || 0, limit = P.getUmbraThreshold(entite);
  result.displayValue = value;
  result.indestructibilityChance = P.indestructibilityChanceDetails(value, limit);
  result.indestructibilitySkin = P.indestructibilityReductionDetails(value, strength, limit);
  result.indestructibilityBonus = result.indestructibilityChance.value;
  result.indestructibilityStrengthReduction = result.indestructibilitySkin.attribute.value;
  result.indestructibilityReduction = result.indestructibilitySkin.source.value;
  result.indestructibilityReductionTotal = result.indestructibilitySkin.value;
  result.indestructibilityCooldown = P.indestructibilityCooldownDetails(value, strength, undefined, limit);
  result.indestructibilityUnavailableSeconds = indestructibilityCooldownRemaining(entite);
  result.indestructibilityRegenSystem = calculateStatSources({ ...getStatSystemInputs(entite), indestructibility: value },
    'hpBattleRegen', { effective: true, seuilUmbra: limit });
  const regen = result.indestructibilityRegenSystem;
  result.hpBattleRegenBase = regen.normalApplied + regen.plusApplied;
  result.hpBattleRegenStrengthRatio = regen.bonuses[0].value;
  result.hpBattleRegenIndestructibilityRatio = regen.base;
  result.hpBattleRegenPercent = regen.value;
}
// === HP Battle Regen ===
if (statKey === "hpBattleRegen") {
  const value = Number(statValue ?? safe("hpBattleRegen", 0)) || 0;

  result.hpBattleRegenBase = calculateHpBattleRegenBase(entite);
  result.hpBattleRegenStrengthRatio = calculateHpBattleRegenStrengthRatio(entite);
  result.hpBattleRegenIndestructibilityRatio = calculateHpBattleRegenIndestructibilityRatio(entite);
  result.hpBattleRegenPercent = calculateHpBattleRegenPercent(entite);

  result.displayValue = result.hpBattleRegenPercent;
}
// === Esoterism ===
if (statKey === "esoterism") {
  const chance = esoterismResult(entite), reduction = esoterismResult(entite, 'reduction');
  const piercing = esoterismResult(entite, 'piercing');
  result.esoterismChance = chance;
  result.esoterismReduction = reduction;
  result.esoterismPiercing = piercing;
  result.esoterismBonus = chance.value;
  result.esoterismBaseReduction = reduction.base;
  result.esoterismAgiReduction = reduction.attribute.value;
  result.esoterismTotalReduction = reduction.value;
  result.esoterismPiercingChance = piercing.value;
  result.esoterismPiercingReduction = reduction.piercingValue;
  result.esoterismCooldown = esoterismResult(entite, 'cooldown');
  result.esoterismUnavailableSeconds = esoterismCooldownRemaining(entite);
}
// === Mysticisme ===
if (statKey === "mysticism") {
  const value = Number(statValue ?? safe("mysticism", 0)) || 0;
  result.mysticismValue = value;
  result.mysticismBaseProcChance = calculateMysticismBaseProcChance(entite);
  result.mysticismIntelProcChance = calculateMysticismIntelProcChance(entite);
  result.mysticismProcChance = calculateMysticismProcChance(entite);
  result.mysticismBaseTranceDuration = calculateMysticismBaseTranceDuration(entite);
  result.mysticismIntelTranceDuration = calculateMysticismIntelTranceDuration(entite);
  result.mysticismTranceDuration = calculateMysticismTranceDuration(entite);
  result.mysticismBasePreparationAcceleration = calculateMysticismBasePreparationAcceleration(entite);
  result.mysticismIntelPreparationAcceleration = calculateMysticismIntelPreparationAcceleration(entite);
  result.mysticismPreparationAcceleration = calculateMysticismPreparationAcceleration(entite);
  result.mysticismBaseDamageBonus = calculateMysticismBaseDamageBonus(entite);
  result.mysticismIntelDamageBonus = calculateMysticismIntelDamageBonus(entite);
  result.mysticismDamageBonus = calculateMysticismTotalDamageBonus(entite);
  result.displayValue = value;
}
// === Équilibre ===
if (statKey === "equilibre") {
  const value = Number(statValue ?? safe("equilibre", 0)) || 0;
  result.equilibreValue = value;
  result.equilibreBaseAggroReduction = calculateEquilibreBaseAggroReduction(entite);
  result.equilibreIntelAggroReduction = calculateEquilibreIntelAggroReduction(entite);
  result.equilibreAggroReduction = calculateEquilibreAggroReduction(entite);
  result.equilibreAggroBonus = calculateEquilibreAggroBonus(entite);
  result.equilibreBaseInvisibleDetection = calculateEquilibreBaseInvisibleDetection(entite);
  result.equilibreAgiInvisibleDetection = calculateEquilibreAgiInvisibleDetection(entite);
  result.equilibreInvisibleDetection = calculateEquilibreInvisibleDetection(entite);
  result.equilibreBaseBalancedAttackChance = calculateEquilibreBaseBalancedAttackChance(entite);
  result.equilibreIntelBalancedAttackChance = calculateEquilibreIntelBalancedAttackChance(entite);
  result.equilibreBalancedAttackChance = calculateEquilibreAttackChance(entite);
  result.displayValue = value;
}
// === Magic Damage ===
if (statKey === "magicalDamage") {
  const base = Number(statValue ?? safe("magicalDamage", 0)) || 0;
  const total = Math.round(base);

  result.magicalBaseValue = base;
  result.calculateMagicalTotalValue = total;
  result.displayValue = total;
}
// === Hypercognition ===
if (statKey === "hypercognition") {
    const value = statValue ?? safe("hypercognition", 0);
    result.hypercognitionValue = value;
    result.hypercognitionIntel = Number(safe("intelligence", 0)) || 0;
    const limit = globalThis.umbraProgression.getUmbraThreshold(entite);
    result.hypercognitionRatio = calculateHypercognitionRatio(value, limit);
    result.hypercognitionCalculation = globalThis.umbraProgression.hypercognitionExplosionDetails(value, result.hypercognitionIntel, limit);
    result.hypercognitionEssenceCalculation = globalThis.umbraProgression.hypercognitionEssenceDetails(value, limit);
    result.hypercognitionEssences = result.hypercognitionEssenceCalculation.value;
    result.hypercognitionBonus = calculateHypercognitionBonus(entite, value);
    result.hypercognitionEssenceRatio = value > 0 ? result.hypercognitionEssences * 100 / value : 0;
}

// === Haste ===
const buildAutonomousHasteStatDisplay = ({
  key,
  totalProp,
  baseProp,
  hasteProp,
  otherProp,
  hasteCalculator,
  finalCalculator
}) => {
  const total = Number(finalCalculator?.(entite) ?? statValue ?? safe(key) ?? 0) || 0;
  const base = Number(entite?.baseStats?.[key] || 0) || 0;
  const hasteValue = Number(getHastePoints(entite) || 0);
  const hasteBonus = hasteValue > 0 ? Number(hasteCalculator(entite, hasteValue) || 0) : 0;

const cappedTotal = Math.min(ATTACK_TIME_REDUC_CAP, Math.max(0, total));

result[totalProp] = round1(cappedTotal);
result[baseProp] = round1(base);
result[hasteProp] = round1(hasteBonus);
result[otherProp] = round1(Math.max(0, cappedTotal - base - hasteBonus));
};

if (statKey === "haste") {
  const value = toNumber(statValue ?? safe("haste", 0), 0);
  result.hasteValue = value;
  result.hastePercent = calculateHastePercent(value);
  result.hasteIntelRatio = calculateHasteIntelRatio(entite, value);
  result.hastePreparation = calculateHastePrepReduc(entite, value);
  result.hasteCDReduc = calculateHasteCDReduc(entite);
  result.hasteRecupReduc = calculateHasteRecupReduc(entite);
  result.hasteExecutionReduc = calculateHasteExecReduc(entite);
  result.hasteProjectilSpeed = calculateHasteProjectilSpeed(entite);
}
if (statKey === "cooldownTimeDetail") {
  const value = getHastePoints(entite);

  buildAutonomousHasteStatDisplay({
    key: "attackCooldownReduc",
    totalProp: "attackCooldownReducTotal",
    baseProp: "attackCooldownReducBase",
    hasteProp: "attackCooldownReducHaste",
    otherProp: "attackCooldownReducOther",
    hasteCalculator: calculateHasteCDReduc,
    finalCalculator: getFinalAttackCooldownReduc
  });

  result.hasteValue = value;
  result.hasteCDReduc = result.attackCooldownReducHaste;
}

if (statKey === "preparationTimeDetail") {
  const value = getHastePoints(entite);

  buildAutonomousHasteStatDisplay({
    key: "attackPreparationReduc",
    totalProp: "attackPreparationReducTotal",
    baseProp: "attackPreparationReducBase",
    hasteProp: "attackPreparationReducHaste",
    otherProp: "attackPreparationReducOther",
    hasteCalculator: calculateHastePrepReduc,
    finalCalculator: getFinalAttackPreparationReduc
  });

  result.hasteValue = value;
  result.hastePercent = value > 0 ? calculateHastePercent(value) : 0;
  result.hasteIntelRatio = value > 0 ? calculateHasteIntelRatio(entite) : 0;
  result.hastePreparation = result.attackPreparationReducHaste;
}

if (statKey === "executionTimeDetail") {
  const value = getHastePoints(entite);

  buildAutonomousHasteStatDisplay({
    key: "attackExecutionReduc",
    totalProp: "attackExecutionReducTotal",
    baseProp: "attackExecutionReducBase",
    hasteProp: "attackExecutionReducHaste",
    otherProp: "attackExecutionReducOther",
    hasteCalculator: calculateHasteExecReduc,
    finalCalculator: getFinalAttackExecutionReduc
  });

  result.hasteValue = value;

  result.hasteExecutionReduc = result.attackExecutionReducHaste;
  result.meleeExecHasteReduc = result.hasteExecutionReduc;

  result.meleeExecBaseBonus =
    Number(statValue?.reduc?.meleeExecBaseBonus ?? calculateMeleeExecBonus(entite, entite?.currentAttack)) || 0;

  result.meleeExecStrengthBonus =
    Number(
      statValue?.reduc?.meleeExecStrengthBonus ??
      calculateExecStrengthRatio(Number(safe("strength", 0)) || 0)
    ) || 0;

  result.meleeExecTotalReduc =
    Number(
      statValue?.reduc?.totalExecReduc ??
      (
        result.hasteExecutionReduc +
        result.meleeExecBaseBonus +
        result.meleeExecStrengthBonus
      )
    ) || 0;
}

if (statKey === "executionRangeTimeDetail") {
  const value = getHastePoints(entite);

  buildAutonomousHasteStatDisplay({
    key: "attackProjectileSpeed",
    totalProp: "attackProjectileSpeedTotal",
    baseProp: "attackProjectileSpeedBase",
    hasteProp: "attackProjectileSpeedHaste",
    otherProp: "attackProjectileSpeedOther",
    hasteCalculator: calculateHasteProjectilSpeed,
    finalCalculator: getFinalAttackProjectileSpeed
  });

  buildAutonomousHasteStatDisplay({
    key: "attackExecutionReduc",
    totalProp: "attackExecutionReducTotal",
    baseProp: "attackExecutionReducBase",
    hasteProp: "attackExecutionReducHaste",
    otherProp: "attackExecutionReducOther",
    hasteCalculator: calculateHasteExecReduc,
    finalCalculator: getFinalAttackExecutionReduc
  });

  result.hasteValue = value;
  result.hasteExecutionReduc = result.attackExecutionReducHaste;
  result.hasteProjectilSpeed = result.attackProjectileSpeedHaste;
}

if (statKey === "recoveryTimeDetail") {
  const value = getHastePoints(entite);

  buildAutonomousHasteStatDisplay({
    key: "attackRecoveryReduc",
    totalProp: "attackRecoveryReducTotal",
    baseProp: "attackRecoveryReducBase",
    hasteProp: "attackRecoveryReducHaste",
    otherProp: "attackRecoveryReducOther",
    hasteCalculator: calculateHasteRecupReduc,
    finalCalculator: getFinalAttackRecoveryReduc
  });

  result.hasteValue = value;
  result.hasteRecupReduc = result.attackRecoveryReducHaste;

  result.isPiercing = statValue?.reduc?.isPiercing || false;
  result.isTranspiercing = statValue?.reduc?.isTranspiercing || false;

  result.piercingRecupBaseBonus = result.isPiercing
    ? calculatePiercingRecupBonus(entite)
    : 0;

  result.piercingRecupAgiBonus = result.isPiercing
    ? calculatePiercingRecupAgiRatio(entite)
    : 0;

  result.piercingRecupTotalReduc = result.isPiercing
    ? totalPiercingRecupReductionWithAgi(entite)
    : 0;

  result.transpiercingRecupBaseBonus = result.isTranspiercing
    ? calculateTranspiercingRecupBonus(entite)
    : 0;

  result.transpiercingRecupAgiBonus = result.isTranspiercing
    ? calculateTranspiercingRecupAgiRatio(entite)
    : 0;

  result.transpiercingRecupTotalReduc = result.isTranspiercing
    ? totalTranspiercingRecupReductionWithAgi(entite)
    : 0;
}
// === SPEED REDUCTION ALL ===

if (statKey === "cooldownTime" || statKey === "attackCooldownReduc") {
  buildAutonomousHasteStatDisplay({
    key: "attackCooldownReduc",
    totalProp: "attackCooldownReducTotal",
    baseProp: "attackCooldownReducBase",
    hasteProp: "attackCooldownReducHaste",
    otherProp: "attackCooldownReducOther",
    hasteCalculator: calculateHasteCDReduc,
    finalCalculator: getFinalAttackCooldownReduc
  });
}

if (statKey === "preparationTime" || statKey === "attackPreparationReduc") {
  buildAutonomousHasteStatDisplay({
    key: "attackPreparationReduc",
    totalProp: "attackPreparationReducTotal",
    baseProp: "attackPreparationReducBase",
    hasteProp: "attackPreparationReducHaste",
    otherProp: "attackPreparationReducOther",
    hasteCalculator: calculateHastePrepReduc,
    finalCalculator: getFinalAttackPreparationReduc
  });
}

if (statKey === "executionTime" || statKey === "attackExecutionReduc") {
  buildAutonomousHasteStatDisplay({
    key: "attackExecutionReduc",
    totalProp: "attackExecutionReducTotal",
    baseProp: "attackExecutionReducBase",
    hasteProp: "attackExecutionReducHaste",
    otherProp: "attackExecutionReducOther",
    hasteCalculator: calculateHasteExecReduc,
    finalCalculator: getFinalAttackExecutionReduc
  });
}

if (statKey === "recuperationTime" || statKey === "recoveryTime" || statKey === "attackRecoveryReduc") {
  buildAutonomousHasteStatDisplay({
    key: "attackRecoveryReduc",
    totalProp: "attackRecoveryReducTotal",
    baseProp: "attackRecoveryReducBase",
    hasteProp: "attackRecoveryReducHaste",
    otherProp: "attackRecoveryReducOther",
    hasteCalculator: calculateHasteRecupReduc,
    finalCalculator: getFinalAttackRecoveryReduc
  });
}

if (statKey === "projectileTime" || statKey === "projectilSpeed" || statKey === "attackProjectileSpeed") {
  buildAutonomousHasteStatDisplay({
    key: "attackProjectileSpeed",
    totalProp: "attackProjectileSpeedTotal",
    baseProp: "attackProjectileSpeedBase",
    hasteProp: "attackProjectileSpeedHaste",
    otherProp: "attackProjectileSpeedOther",
    hasteCalculator: calculateHasteProjectilSpeed,
    finalCalculator: getFinalAttackProjectileSpeed
  });
}
// === Astrality ===
if (["astrality", "fatalSurvival", "astralCooldown", "astralReturn", "astralBody"].includes(statKey)) {
    const value = statValue ?? safe("astrality");
    result.astralityBonus = calculateAstralityPercent(value);
    result.astralReturn = calculateAstralReturn(entite);
    result.astralBody = calculateAstralBody(entite);
    result.astralUnavailableSeconds = astralCooldownRemaining(entite);
    result.astralCooldown = calculateAstralCooldown(entite);
    result.astralCooldownRemaining = astralCooldownRemaining(entite);
	result.intelAstralityBonus = calculateIntelAstralityRatio(entite);
	result.astralityTotal = calculateAstralityTotal(entite);
}
// === Resilience ===
if (["resilience", "criticalResistance", "alterationResistance", "hindranceResistance", "resilienceTotal"].includes(statKey)) {
    result.resilienceBonus = resilienceResult(entite, 'criticalResistance').base;
    result.resilienceCritBonus = result.resilienceBonus;
    result.resiStrengthCritBonus = calculateResilienceStrengthCritBonus(entite);
    result.resilienceCritTotalBonus = calculateResilienceCritTotalBonus(entite);
    result.resilienceAlteBonus = calculateResilienceAlterationBonus(entite);
    result.resiIntelCritBonus = calculateResilienceIntelligenceAlterBonus(entite);
    result.resilienceAlteTotalBonus = calculateResilienceAlterationTotalBonus(entite);
    result.resilienceHindranceBonus = calculateHindranceResistance(entite);
    result.resilienceCancelBonus = calculateResilienceCancelBonus(entite);
	result.resiStrengthCancelBonus = calculateResilienceStrengthCancelBonus(entite);
	result.resilienceTotalCancelBonus = calculateResilienceTotalCancelBonus(entite);
}
// === Blood Fury ===
if (['bloodFury', 'bloodFuryExecutionChance', 'bloodFuryExecutionDamage', 'bloodFuryTargetThreshold', 'bloodThirsty'].includes(statKey)) {
  result.bloodFuryExecution = bloodFuryExecutionResult(entite);
  result.bloodFuryExecutionBonus = result.bloodFuryExecutionChanceTotal = calculateBloodFuryExecutionPercent(entite);
  result.bloodFuryExecChanceBonus = result.bloodFuryTargetThresholdTotal = calculateBloodFuryTargetThreshold(entite);
  result.bloodFuryExecDamage = result.bloodFuryExecutionDamageTotal = calculateExecutionDamage(entite);
  result.bloodThirstyValue = result.bloodThirstyLifestealBonus = result.bloodThirstyTotal = calculateBloodThirstyPercent(entite);
}
// === Ambidextrie ===
if (statKey === "ambidextry") {
    const chance = ambidextryResult(entite), damage = ambidextryResult(entite, 'damage');
    result.ambidextryChance = chance;
    result.ambidextryDamage = damage;
    result.ambidextryBonus = result.ambidextryProcBonus = chance.source.value;
    result.ambidextryAgiChance = chance.attribute.value;
    result.ambidextryTotalChance = chance.value;
    result.ambidextryRatioBonus = damage.source.value;
    result.ambidextryAgiRatioBonus = damage.attribute.value;
    result.ambidextryDamageBonus = damage.value;
}
// Critical displays use the same direct percentages and attribution as combat.
if (["criticalPower", "criticalChance", "criticalDamage"].includes(statKey)) {
  const chance = criticalResult(entite, 'criticalChance');
  const damage = criticalResult(entite, 'criticalDamage');
  Object.assign(result, {
    critChanceBonus: chance.base, critAgiChanceBonus: chance.bonuses[0]?.value || 0,
    critPowerChanceContribution: chance.umbra > 0 ? chance.generated : 0,
    critTotalChance: chance.value, criticalChanceTotal: chance.value,
    criticalChanceFlat: chance.normalApplied + chance.plusApplied,
    criticalChanceFromPower: chance.umbra > 0 ? chance.generated : 0,
    critRatioBonus: damage.generated, critAgiRatioBonus: 0,
    critPowerDamageContribution: damage.generated,
    critDamageBonus: damage.value, criticalDamageTotal: damage.value,
    criticalDamageNative: damage.fixed, criticalDamageFlat: damage.normalApplied + damage.plusApplied,
    criticalDamageFromPower: damage.generated,
  });
}
// === Volonté ===
if (statKey === "will") {
  const value = statValue ?? safe("will", 0);
  result.willAwakeBonus = calculatewillAwakeBonus(value);
  result.lvlMaxBase   = calculateLvlMaxBaseEntite(entite);
  result.lvlMaxBonus  = calculateLvlMaxBonus(value, { baseMaxLevel: result.lvlMaxBase });
  result.lvlMaxEntite = calculateLvlMaxEntiteWithWill(entite, value);
  Object.assign(result, getWillBonusUI(result.lvlMaxBonus));
}

// === Mouvement ===
if (statKey === "movement") {
  const value = getMovementValue(entite);
  const startingDetails = calculateMovementStartingChargeDetails(entite);

  result.movementValue = value;
  result.movementMaxCharges = calculateMovementMaxCharges(entite);

  result.movementStartingTotalCurrent = startingDetails.totalCurrent;
  result.movementStartingBasePercent = startingDetails.basePercent;
  result.movementStartingAgiRatioCurrent = startingDetails.agiRatioCurrent;

  result.movementStartingChargePercent = startingDetails.totalCurrent;
  result.movementStartingCharges = calculateMovementStartingCharges(entite);
  result.movementMarathonChance = calculateMovementMarathonChance(entite);
result.movementTrailerChance = calculateMovementTrailerChance(entite);
  result.displayValue = value;
}
// === Shift ===
if (statKey === "shift") {
  const startingDetails = calculateMovementStartingChargeDetails(entite);
  result.movementMaxCharges = calculateMovementMaxCharges(entite);
  result.movementStartingTotalCurrent = startingDetails.totalCurrent;
  result.movementStartingBasePercent = startingDetails.basePercent;
  result.movementStartingAgiRatioCurrent = startingDetails.agiRatioCurrent;
  result.movementStartingCharges = calculateMovementStartingCharges(entite);
  const shift = safe("shift", null) ?? {};
  const baseShift = entite?.baseStats?.shift ?? {};
  result.shiftCurrent = Number(shift.current || 0);
  result.shiftMax = Number(shift.max || 0);
  const system = getStatSystemResult(entite, 'shift');
  const startingView = { stats: { movement: result.shiftMax, agility: safe('agility', 0) } };
  result.shiftStartingFixed = !system?.present;
  result.shiftStartingPercent = calculateMovementStartingChargePercent(startingView);
  result.shiftEquipmentCharges = getEquipmentResourceCurrent(entite, 'shift', getWeaponOrfevrePreviewActivePercent(entite));
  result.shiftSupplementalCharges = result.shiftEquipmentCharges
    + Math.max(0, Number(entite.resourceStocks?.shift?.temporary) || 0)
    + Math.max(0, Number(entite.resourceStocks?.shift?.spell) || 0);
  result.shiftNaturalStartingCharges = system?.present ? calculateMovementStartingCharges(startingView) : 0;
  result.shiftStartingCharges = result.shiftNaturalStartingCharges + result.shiftEquipmentCharges;
  result.shiftHasDefaultBase = shift?.baseDefault === true;
  result.shiftBaseMax = result.shiftHasDefaultBase ? 1 : Number(baseShift?.max || 0);
  result.shiftMovementMaxBonus = Number(result.movementMaxCharges || 0);
  result.shiftOtherMaxBonus = result.shiftMax - result.shiftBaseMax - result.shiftMovementMaxBonus;
  result.shiftBaseCurrent = Math.min(result.shiftCurrent, result.shiftBaseMax);
  result.shiftMovementCurrentBonus = Math.min( result.shiftMovementMaxBonus, Math.max(0, result.shiftCurrent - result.shiftBaseCurrent) );
  result.shiftOtherCurrentBonus = Math.max( 0, result.shiftCurrent - result.shiftBaseCurrent - result.shiftMovementCurrentBonus );
}
if (statKey === "weight" || statKey === "shift") {
  const weight = getMovementWeightMalus(entite);
  result.shiftWeightScore = weight.weight;
  result.shiftWeightClass = weight.weightClass;
  result.shiftWeightLabel = weight.label;
  result.shiftWeightMalus = weight.malus;
}

// === Marathon ===
if (statKey === "marathon") {
  const value = Number(statValue ?? safe("marathon") ?? 0);

  result.marathonChance = value;
  result.marathonBaseChance = Number(entite?.baseStats?.marathon || 0);
  result.marathonMovementBonus = Number(calculateMovementMarathonChance(entite) || 0);

  result.marathonOtherBonus = Math.max(
    0,
    result.marathonChance - result.marathonBaseChance - result.marathonMovementBonus
  );
}

// === Trailer ===
if (statKey === "trailer") {
  const value = Number(statValue ?? safe("trailer") ?? 0);

  result.trailerChance = value;
  result.trailerBaseChance = Number(entite?.baseStats?.trailer || 0);
  result.trailerMovementBonus = Number(calculateMovementTrailerChance(entite) || 0);

  result.trailerOtherBonus = Math.max(
    0,
    result.trailerChance - result.trailerBaseChance - result.trailerMovementBonus
  );
}

// === Range ===
if (statKey === "rangeAttack") {
  result.calculateRangeRatioBase = balanceData.range.ratio.basePercent;
  result.calculateRangeRatioTotal = calculateRangeRatio(entite);

  // // Adresse projectile (attaques physiques à distance)

  // Incantation pétée (attaques magiques à distance)
  result.baseBrokenSpellChance = baseBrokenSpellChance();
  result.intelBrokenSpellChanceReduc = intelBrokenSpellChance(entite);
  result.brokenSpellChanceTotal = calculateBrokenSpellChance(entite);

  result.baseBrokenSpellDamage = baseBrokenSpellDamage();
  result.intelBrokenSpellBaseDamageReduc = intelBrokenSpellBaseDamage(entite);
  result.magicalBrokenSpellDamageBonus = magicalBrokenSpellDamage(entite);
  result.brokenSpellDamageTotal = calculateBrokenSpellDamage(entite);

}
if (statKey === "rangeAttackTranspiercing" || statKey === "transpiercingPower") {
  result.calculateRangeRatioBase = balanceData.range.ratio.basePercent;
  result.calculateRangeRatioTotal = calculateRangeRatio(entite);


  result.transpiercingDamageBonus = transpiercingAgiRatio(entite);
  result.transpiercingPowerPiercing = Math.max(0, Number(getSafe(entite, "piercingDamage", 0)) || 0);
  result.transpiercingPowerAgility = Math.max(0, Number(getSafe(entite, "agility", 0)) || 0);
  result.transpiercingPowerRatio = getAttackNatureRules(entite?.currentAttack).agilityDamageRatio;
  result.transpiercingPowerTotal = transpiercingTotal(entite);
  result.transpiercingRecupBaseBonus = calculateTranspiercingRecupBonus(entite);
  result.transpiercingRecupAgiBonus = calculateTranspiercingRecupAgiRatio(entite);
  result.transpiercingRecupTotalReduc = totalTranspiercingRecupReductionWithAgi(entite);
  result.displayValue = statKey === "transpiercingPower"
    ? result.transpiercingDamageBonus
    : calculateRangeRatio(entite);
}
const isMeleeStat =
  statKey === "meleeAttackPhysical" ||
  statKey === "meleeAttackMagical"  ||
  statKey === "meleeAttackHybridal" ||
  statKey === "meleeAttackPiercing";

const isPiercingStat =
  statKey === "meleeAttackPiercing" ||
  statKey === "rangeAttackPiercing";

// --- COMMUN A TOUTE LA MELEE (exec reduc) ---
if (isMeleeStat) {
  result.meleeExecBaseBonus      = calculateMeleeExecBonus(entite, entite?.currentAttack);
  result.meleeExecHasteReduc     = getFinalAttackExecutionReduc(entite);
  result.meleeExecStrengthBonus  = calculateExecStrengthRatio(safe("strength", 0));
  result.meleeExecTotalReduc     = totalMeleeExecReduction(entite, entite?.currentAttack);
}

// --- ADDITIF SI NATURE piercing (recup reduc) ---
if (isPiercingStat) {
  result.piercingRecupBaseBonus  = calculatePiercingRecupBonus(entite, null);
  result.piercingRecupHasteReduc = calculateHasteRecupReduc(entite); // 0% si haste=0
  result.piercingRecupAgiBonus   = calculatePiercingRecupAgiRatio(entite);
  result.piercingRecupTotalReduc = totalPiercingRecupReductionWithAgi(entite, null);
}
if (statKey === "rangeAttackPhysical") {
	  result.calculateRangeRatioBase = balanceData.range.ratio.basePercent;
  result.calculateRangeRatioTotal = calculateRangeRatio(entite);
	result.ProjectilSpeedPercent = calculateProjectilSpeedPercent(entite);
}
if (statKey === "rangeAttackMagical") {
  result.baseBrokenSpellChance = baseBrokenSpellChance();
  result.intelBrokenSpellChanceReduc = intelBrokenSpellChance(entite);
  result.brokenSpellChanceTotal = calculateBrokenSpellChance(entite);
	result.ProjectilSpeedPercent = calculateProjectilSpeedPercent(entite);
  result.baseBrokenSpellDamage = baseBrokenSpellDamage();
  result.intelBrokenSpellBaseDamageReduc = intelBrokenSpellBaseDamage(entite);
  result.magicalBrokenSpellDamageBonus = magicalBrokenSpellDamage(entite);
  result.brokenSpellDamageTotal = calculateBrokenSpellDamage(entite);



}
if (statKey === "rangeAttackHybridal") {
	result.ProjectilSpeedPercent = calculateProjectilSpeedPercent(entite);
      result.calculateRangeRatioBase = balanceData.range.ratio.basePercent;
  result.calculateRangeRatioTotal = calculateRangeRatio(entite);
	result.ProjectilSpeedPercent = calculateProjectilSpeedPercent(entite);
}
if (statKey === "brokenSpell") {
  result.baseBrokenSpellChance = baseBrokenSpellChance();
  result.intelBrokenSpellChanceReduc = intelBrokenSpellChance(entite);
  result.brokenSpellChanceTotal = calculateBrokenSpellChance(entite);
  result.baseBrokenSpellDamage = baseBrokenSpellDamage();
  result.intelBrokenSpellBaseDamageReduc = intelBrokenSpellBaseDamage(entite);
  result.magicalBrokenSpellDamageBonus = magicalBrokenSpellDamage(entite);
  result.brokenSpellDamageTotal = calculateBrokenSpellDamage(entite);
  result.displayValue = result.brokenSpellChanceTotal;
}
if (statKey === "messedSpell") {
  result.baseBrokenSpellChance = baseBrokenSpellChance();
  result.intelBrokenSpellChanceReduc = intelBrokenSpellChance(entite);
  result.brokenSpellChanceTotal = calculateBrokenSpellChance(entite);
  result.baseBrokenSpellDamage = baseBrokenSpellDamage();
  result.intelBrokenSpellBaseDamageReduc = intelBrokenSpellBaseDamage(entite);
  result.magicalBrokenSpellDamageBonus = magicalBrokenSpellDamage(entite);
  result.brokenSpellDamageTotal = calculateBrokenSpellDamage(entite);
  result.displayValue = result.brokenSpellChanceTotal;
}
// === Psionique ===
if (canonicalStatKey === "psionic") {
  result.psionicPercantBonus = psionicPercantBonus(entite); // total %
  result.psionicBonus = psionicBonus(entite);               // bonus % seul
  result.psionicPMBonus = psionicPMBonus(entite);           // bonus PM
  result.psionicTotalBonus = psionicTotalBonus(entite);     // PM finale
  result.psionicMagicalPower = Math.max(0, calculateMagicalTotal(entite));
  result.displayValue = result.psionicPercantBonus;
}
if (canonicalStatKey === "brutality-old") {
  result.brutalityPercantBonus = brutalityPercantBonus(entite);              // total %
  result.brutalityBonus = brutalityBonus(entite);                            // bonus % seul
  result.brutalityPhysicalPowerBonus = brutalityPhysicalPowerBonus(entite);  // bonus dégâts physiques
  result.brutalityTotalBonus = brutalityTotalBonus(entite);                  // puissance physique finale
  result.brutalityPhysicalPower = Number(safe("physicalDamage", 0) || 0);
  result.displayValue = result.brutalityPercantBonus;
}
if (statKey === "executionMelee") {
  result.meleeExecBaseBonus = calculateMeleeExecBonus(entite);
  result.displayValue = result.meleeExecBaseBonus;
}
if (statKey === "transpiercingDamage") {
  result.hasteRecupReduc = calculateHasteRecupReduc(entite);

  result.transpiercingRecupBaseBonus = calculateTranspiercingRecupBonus(entite);
  result.transpiercingRecupAgiBonus = calculateTranspiercingRecupAgiRatio(entite);
  result.transpiercingRecupTotalReduc = totalTranspiercingRecupReductionWithAgi(entite);

  result.displayValue = result.transpiercingRecupTotalReduc;
}
if (canonicalStatKey === "piercingDamage") {
  result.hasteRecupReduc = calculateHasteRecupReduc(entite);

  result.piercingRecupBaseBonus = calculatePiercingRecupBonus(entite);
  result.piercingRecupAgiBonus = calculatePiercingRecupAgiRatio(entite);
  result.piercingRecupTotalReduc = totalPiercingRecupReductionWithAgi(entite);

  result.displayValue = result.piercingRecupTotalReduc;
}
// Display-only breakdowns. Keep the combat totals above as the source of truth.
result.helperDetails = {
  active: Object.fromEntries(['bloodFury', 'hypercognition', 'indestructibility', 'astrality', 'transcendence', 'resilience', 'weaponMastery', 'ambidextry', 'esoterism']
    .map(key => [key, Number(safe(key, 0)) > 0])),
  sources: {},
};
if (['weaponOrfevre', 'weaponCollector', 'marathon', 'trailer'].includes(statKey)) {
  const total = Number(result[`${statKey}Chance`]) || 0;
  const base = Number(result[`${statKey}BaseChance`] ?? result[`${statKey}Base`]) || 0;
  const enabled = result.helperDetails.active.weaponMastery;
  const generated = statKey === 'weaponOrfevre' ? [
    { stat: 'weaponMastery', value: enabled ? calculateWeaponOrfevreWeaponMastery(entite) : 0 },
    { stat: 'strength', value: enabled ? calculateWeaponOrfevreStrength(entite) : 0 },
  ] : statKey === 'weaponCollector' ? [
    { stat: 'weaponMastery', value: enabled ? calculateWeaponMasteryTrophyChance(entite) : 0 },
    { stat: 'strength', value: enabled ? calculateWeaponMasteryTrophyStrengthBonus(entite) : 0 },
  ] : [{ stat: 'movement', value: Number(result[`${statKey}MovementBonus`]) || 0 }];
  const remainder = total - base - generated.reduce((sum, part) => sum + part.value, 0);
  result.helperDetails.sources[statKey] = [{ stat: statKey, value: base }, ...generated, { stat: statKey, value: remainder }];
}
for (const [prefix, stat] of [
  ['attackCooldownReduc', 'cooldownTime'], ['attackPreparationReduc', 'preparationTime'],
  ['attackExecutionReduc', 'executionTime'], ['attackRecoveryReduc', 'recuperationTime'],
  ['attackProjectileSpeed', 'projectileTime'],
]) {
  const base = Number(result[`${prefix}Base`]) || 0;
  result.helperDetails.sources[prefix] = [
    { stat, value: base },
    { stat, value: (Number(safe(prefix, 0)) || 0) - base },
    { stat: 'haste', value: Number(result[`${prefix}Haste`]) || 0 },
  ];
  const systemTiming = getStatSystemResult(entite, prefix);
  if (systemTiming) {
    result.helperDetails.sources[prefix] = buildStatSystemModel(systemTiming).parts;
    result[`${prefix}Total`] = systemTiming.value;
  }
}
if (["criticalPower", "criticalChance", "criticalDamage"].includes(statKey)) {
  const power = Math.max(0, Number(safe("criticalPower", 0)) || 0);
  result.helperDetails.critical = {
    chanceFlat: Math.max(0, autonomousInput('criticalChance')),
    chancePower: criticalResult(entite, 'criticalChance').base,
    chanceAgility: power > 0 ? calculateCritAgiChanceBonus(entite) : 0,
    damageNative: balanceData.critical.damage.nativeBasePercent,
    damageFlat: Math.max(0, autonomousInput('criticalDamage')),
    damagePower: power > 0 ? calculateCritRatioBonus(entite, power) : 0,
    damageAgility: power > 0 ? calculateCritAgiRatioBonus(entite) : 0,
  };
}

if (['hpBattleRegen', 'indestructibility'].includes(statKey)) {
  result.hpBattleRegenModifier = result.hpBattleRegenPercent - result.hpBattleRegenBase
    - result.hpBattleRegenStrengthRatio - result.hpBattleRegenIndestructibilityRatio;
  result.hpBattleRegenAmount = Math.max(0, Math.round((Number(safe('HP.max', 0)) || 0) * result.hpBattleRegenPercent / 100));
}
const timingDisplayConfigs = {
  cooldownTimeDetail: ["cooldownTime", "attackCooldownReduc"],
  preparationTimeDetail: ["preparationTime", "attackPreparationReduc"],
  executionTimeDetail: ["executionTime", "attackExecutionReduc"],
  executionRangeTimeDetail: ["projectileTime", "attackExecutionReduc"],
  recoveryTimeDetail: ["recuperationTime", "attackRecoveryReduc"],
};
if (timingDisplayConfigs[statKey]) {
  const [stat, prefix] = timingDisplayConfigs[statKey];
  const attack = entite?.currentAttack || {
    attackRange: [statKey === 'executionRangeTimeDetail' ? 'range' : 'melee'],
    attacknature: [statValue?.reduc?.isTranspiercing ? 'transpiercingDamage'
      : statValue?.reduc?.isPiercing ? 'piercingDamage' : 'physicalDamage'],
  };
  const timings = getEffectiveAttackTimings(attack, entite);
  // The engine clamps each autonomous contribution before combining them.
  const groups = [{ stat: statKey === 'executionRangeTimeDetail' ? 'executionTime' : stat,
    value: result[`${prefix}Total`], parts: result.helperDetails.sources[prefix],
    sources: getStatisticSourceTotals(entite, prefix, result) }];
  if (statKey === 'executionRangeTimeDetail') groups.push({
    stat: 'projectileTime', value: timings.reduc.projectileSpeedReduc,
    parts: result.helperDetails.sources.attackProjectileSpeed,
    sources: getStatisticSourceTotals(entite, 'attackProjectileSpeed', result),
  });
  if (statKey === 'executionTimeDetail') groups.push({
    stat: 'shortRange', value: timings.reduc.meleeExecBaseBonus + timings.reduc.meleeExecStrengthBonus,
    parts: [{ stat: 'shortRange', value: timings.reduc.meleeExecBaseBonus },
      { stat: 'strength', value: timings.reduc.meleeExecStrengthBonus }],
  });
  if (statKey === 'recoveryTimeDetail' && (timings.reduc.isPiercing || timings.reduc.isTranspiercing)) {
    const transpiercing = timings.reduc.isTranspiercing;
    groups.push({ stat: transpiercing ? 'transpiercingDamage' : 'piercingDamage',
      value: timings.reduc.specificRecoveryReduc,
      parts: [{ stat: transpiercing ? 'transpiercingDamage' : 'piercingDamage',
        value: transpiercing ? calculateTranspiercingRecupBonus(entite, attack) : calculatePiercingRecupBonus(entite, attack) },
      { stat: 'agility', value: transpiercing ? calculateTranspiercingRecupAgiRatio(entite) : calculatePiercingRecupAgiRatio(entite) }],
    });
  }
  const bonus = clampPercent(groups.reduce((sum, group) => sum + (Number(group.value) || 0), 0));
  const baseMs = Number(statValue?.baseMs) || 0;
  const calculatedMs = applyReducToMs(baseMs, bonus);
  const minimumMs = statKey === 'executionTimeDetail' && getAttackResolutionFlags(attack).isMelee ? 200 : 0;
  // Attribute only the reduction actually applied, including the shared cap.
  const reductionSources = groups.flatMap(group => {
    if (group.sources) return group.sources;
    let previous = 0;
    return group.parts.map((part, index) => {
      const next = Math.min(group.value, previous + (Number(part.value) || 0));
      const value = next - previous;
      previous = next;
      return { category: index === 0 ? 'fixed' : 'stat', stat: part.stat, value, unit: ' %' };
    });
  });
  let rawReduction = 0;
  const sources = ['umbra', 'fixed', 'stat', 'equipment', 'combat'].flatMap(category =>
    reductionSources.filter(source => source.category === category).map(source => {
      const applied = value => {
        const before = clampPercent(rawReduction);
        rawReduction += Number(value) || 0;
        return Math.round((clampPercent(rawReduction) - before) * 100) / 100;
      };
      if (source.normalValue != null || source.improvedValue != null) {
        const normalValue = applied(source.normalValue);
        const improvedValue = applied(source.improvedValue);
        return { ...source, normalValue, improvedValue, value: normalValue + improvedValue };
      }
      return { ...source, value: applied(source.value) };
    })).filter(source => source.value !== 0);
  sources.push({ category: 'fixed', stat, value: baseMs / 1000, unit: ' s', duration: true });
  result.helperDetails.timing = {
    stat, groups, sources, bonus, cap: ATTACK_TIME_REDUC_CAP, baseMs, calculatedMs, minimumMs,
    effectiveMs: Math.max(minimumMs, calculatedMs),
    preparation: statKey === 'preparationTimeDetail',
  };
}
result.umbraHelperCalculations = !includeHelper ? {} : stats.some(stat => stat.key === canonicalStatKey && stat.nature === 'umbra')
  ? buildUmbraHelperCalculations(canonicalStatKey, entite, statValue, result)
  : buildAutonomousHelperCalculations(canonicalStatKey, entite, result);
if (includeHelper && (canonicalStatKey === 'vision' || canonicalStatKey === 'bullsEye')) {
  const bull = getStatSystemResult(entite, 'bullsEye') || calculateStatSources({}, 'bullsEye');
  result.bullsEyePercent = bull.chancePercent;
  const total = buildStatSystemModel(bull, entite);
  result.umbraHelperCalculations.bullsEyeTotal = total;
  const ability = total.contributions.find(part => part.kind === 'umbra');
  result.umbraHelperCalculations.bullsEyeSource = ability;
}
const system = getStatSystemResult(entite, canonicalStatKey);
if (system) {
  result.statSystem = system;
  const model = buildDisplayedStatModel(system, entite);
  result.displayValue = model.value;
  model.name = stats.find(stat => stat.key === canonicalStatKey)?.name || canonicalStatKey;
  const aliases = {
    physicalDamage: ['generatedUmbraTarget'], magicalDamage: ['generatedUmbraTarget'], piercingDamage: ['generatedUmbraTarget'],
    physicalPen: ['autonomousConversion'], magicalPen: ['autonomousConversion'],
    physicalResistance: ['autonomousConversion'], magicalResistance: ['autonomousConversion'], dodge: ['autonomousConversion'], velocity: ['autonomousConversion'],
    hpBattleRegen: ['hpBattleRegenPercent'], criticalChance: ['critTotalChance'], criticalDamage: ['critDamageBonus'],
    bloodFuryExecutionChance: ['bloodFuryExecutionBonus'], bloodFuryExecutionDamage: ['bloodFuryExecDamage'], bloodFuryTargetThreshold: ['bloodFuryExecChanceBonus'],
  };
  result.umbraHelperCalculations = Object.fromEntries(['autonomousTotal', ...(aliases[canonicalStatKey] || [])].map(key => [key, model]));
  const fields = {
    physicalResistance: ['reductionPercent'], magicalResistance: ['reductionPercent'], physicalPen: ['physicPenBonus'], magicalPen: ['magicPenBonus'],
    dodge: ['calculateTotalDodgeBonus'], velocity: ['velocityReductionPercent'],
    criticalChance: ['criticalChanceTotal', 'critTotalChance'], criticalDamage: ['criticalDamageTotal', 'critDamageBonus'],
    cognitiveExplosion: ['cognitiveExplosionTotal'], cognitiveGenerator: ['hypercognitionEssences'],
    transcendenceTotal: ['transcendenceConsoProtectionPercent'],
    attackPreparationReduc: ['attackPreparationReducTotal'], attackCooldownReduc: ['attackCooldownReducTotal'],
    attackExecutionReduc: ['attackExecutionReducTotal'], attackRecoveryReduc: ['attackRecoveryReducTotal'], attackProjectileSpeed: ['attackProjectileSpeedTotal'],
  };
  for (const field of fields[canonicalStatKey] || []) result[field] = system.value;
  if (canonicalStatKey === 'cognitiveExplosion') {
    result.cognitiveExplosionAutonomous = system.value - (result.hypercognitionCalculation?.value || 0);
  }
  if (system.resistancePoints) result.reductionPercent = system.reductionRatio * 100;
  if (system.dodgePoints) result.calculateTotalDodgeBonus = system.chancePercent;
  result.autonomousTotal = model.value;
}
if (canonicalStatKey === 'shift') {
  if (!system?.present) result.umbraHelperCalculations.autonomousTotal = {
    stat: 'shift', value: result.shiftMax, unit: '',
    parts: [{ stat: 'neutral', value: result.shiftMax, unit: '', fixed: true }],
  };
  result.umbraHelperCalculations.shiftStartingCharges = {
    stat: 'shift', value: result.shiftStartingCharges, unit: '',
    parts: [{ stat: 'shift', value: result.shiftNaturalStartingCharges, unit: '',
      ...(result.shiftStartingFixed ? { fixed: true } : { rounded: true, compact: {
        source: { stat: 'shift', value: result.shiftMax },
        multiplier: { stat: 'agility', value: result.shiftStartingPercent / 100 },
      } }),
    }, ...(result.shiftEquipmentCharges > 0 ? [{ stat: 'shift', value: result.shiftEquipmentCharges, unit: '', fixed: true }] : [])],
  };
}
if (includeHelper) Object.assign(result, buildStatHelperContent({
  nestedHelper,
  result, entite, statKey, statValue, stats, safe,
  balanceData, baseSpeedMs, roundBalance, getAttackPurity, getAttackNatureRules,
  getDisplayStatKey, normalizeStatKey, isUmbraRestricted,
  readUmbraTotal: (key, unit = '') => {
    if (['shiftStartingCharges', 'shiftStartingPercent'].includes(key)) {
      const display = calculateStatsDisplay('shift', entite, undefined, { includeHelper: false });
      return { stat: 'shift', value: display[key], unit, parts: [] };
    }
    const system = getStatSystemResult(entite, key);
    const value = getSafe(entite, key, 0);
    const amount = Number(value?.totalMax ?? value?.max ?? value?.current ?? value) || 0;
    if (system) return buildDisplayedStatModel(system, entite);
    return { stat: getDisplayStatKey(key), value: amount, unit,
      parts: [{ stat: getDisplayStatKey(key), value: amount, unit, fixed: true }] };
  },
}));
return result;
}

export function getStatImprovement(entite, statKey, effectKey = '') {
  const key = normalizeStatKey(statKey);
  const system = !effectKey && getStatSystemResult(entite, key);
  if (system) return system.state === 'normal' ? null : { source: system.origin, stat: key, state: system.state };
  const contextual = {
    mysticismPreparationAcceleration: ['mysticism', 'preparationTime'],
    mysticismDamageBonus: ['mysticism', 'mysticism'],
    occultismCritChanceBonus: ['occultism', 'criticalChance'],
    occultismDodgeBonus: ['occultism', 'dodge'],
  }[effectKey];
  if (contextual && Number(getSafe(entite, contextual[0], 0)) > 0) {
    return { source: contextual[0], stat: contextual[1], attribute: contextual[0] === 'mysticism' ? 'intelligence' : 'agility' };
  }
  const generated = Object.entries(balanceData.generatedUmbraStats.sources)
    .find(([, config]) => normalizeStatKey(config.target) === key)?.[0];
  const candidates = generated ? [generated] : ({
    criticalChance: ['criticalPower'], criticalDamage: ['criticalPower'],
    criticalResistance: ['resilience'], alterationResistance: ['resilience'], hindranceResistance: ['resilience'], resilienceTotal: ['resilience'],
    HP: ['vitality'], dayHpRegen: ['vitality'], armor: ['robustness'],
    hpBattleRegen: ['indestructibility'], bloodThirsty: ['bloodFury'],
    bloodFuryExecutionChance: ['bloodFury'], bloodFuryExecutionDamage: ['bloodFury'],
    bloodFuryTargetThreshold: ['bloodFury'], cognitiveExplosion: ['hypercognition'],
    cognitiveGenerator: ['hypercognition'], transcendenceTotal: ['transcendence'],
    extraLife: ['transcendence'], marathon: ['movement'], trailer: ['movement'], shift: ['movement'],
    weaponOrfevre: ['weaponMastery'], weaponCollector: ['weaponMastery'], charge: ['weaponMastery'],
    attackCooldownReduc: ['haste'], attackPreparationReduc: ['haste'], attackExecutionReduc: ['haste'],
    attackRecoveryReduc: ['haste'], attackProjectileSpeed: ['haste'],
  })[key] || [];
  const activeOccultism = ({ dodge: 'occultismInvisible', criticalChance: 'occultismExitCrit' })[key];
  const source = candidates.find(source => Number(getSafe(entite, source, 0)) > 0)
    || (activeOccultism && entite?.battleBoosts?.[key]?.some(boost => boost.source === activeOccultism && Number(boost.value) > 0)
      ? 'occultism' : null);
  const definition = stats.find(stat => stat.key === source);
  return definition ? { source, attribute: ({ force: 'strength', agilite: 'agility' })[definition.attribut] || definition.attribut } : null;
}

export function getStatisticSourceTotals(entity, statKey, calculated) {
  const key = normalizeStatKey(statKey);
  if (['strength', 'intelligence', 'agility'].includes(key) && getDirectingStatResult(entity, key)) {
    const durable = entity.modifierStats?.durable || {};
    const views = [
      { category: 'fixed', entity: { ...entity, modifierStats: { durable: {} } } },
      { category: 'stat', entity: { ...entity, modifierStats: { ...entity.modifierStats,
        durable: { ...durable, stuff: { byId: {} }, derived: {} } } } },
      { category: 'equipment', entity }, { category: 'combat', entity },
    ];
    let previous = 0;
    return views.map(view => {
      const total = Number(getStatSystemInputs(view.entity, { combat: view.category === 'combat' })[key]) || 0;
      const value = roundBalance(total - previous, 6);
      previous = total;
      return { category: view.category, value, stat: key, unit: '',
        provenance: getStatInputProvenance(entity, key, '', view.category) };
    }).filter(part => part.value !== 0);
  }
  if (key === 'fadedLife') {
    const state = entity?.resourceStocks?.fadedLife;
    const values = { consumable: state?.consumable || 0, equipment: getEquipmentResourceCurrent(entity, key),
      spell: state?.spell || 0, fixed: state?.natural ?? (Number(entity?.stats?.fadedLife) || 0) };
    return Object.entries(values).filter(([category, value]) => value > 0
      || (category === 'equipment' && Object.keys(state?.stuff || {}).length))
      .map(([category, value]) => ({ category, value, stat: key, unit: '' }));
  }
  if (key === 'eternalLife') {
    const base = Math.max(0, Number(getSafe(entity, key, 0)?.max) - getEquipmentResourceMax(entity, key)) || 0;
    return [{ category: 'fixed', value: base, label: 'Vies éternelles max' },
      { category: 'equipment', value: getEquipmentResourceCurrent(entity, key), label: 'Vies éternelles disponibles' }]
      .filter(source => source.value > 0 || (source.category === 'equipment' && Object.keys(entity?.resourceStocks?.[key]?.stuff || {}).length))
      .map(source => ({ ...source, stat: key, unit: '' }));
  }
  const system = getStatSystemResult(entity, key);
  if (key === 'shift') {
    const capacity = system?.present ? getStatSystemSourceTotals(entity, key)
      : [{ category: 'fixed', value: calculated.shiftMax, stat: key, unit: '' }];
    const reserves = { equipment: getEquipmentResourceCurrent(entity, key, getWeaponOrfevrePreviewActivePercent(entity)),
      consumable: entity.resourceStocks?.shift?.temporary || 0, spell: entity.resourceStocks?.shift?.spell || 0 };
    return [
      ...capacity.map(source => ({ ...source, label: 'Déplacements max', movementKind: 'max' })),
      ...Object.entries(reserves).filter(([category, value]) => value > 0
        || (category === 'equipment' && Object.keys(entity.resourceStocks?.shift?.stuff || {}).length)).map(([category, value]) =>
        ({ category, value, stat: key, unit: '', label: 'Déplacements sup.', movementKind: 'sup' })),
    ];
  }
  if (system && (key !== 'shift' || system.present)) {
    const totals = getStatSystemSourceTotals(entity, key);
    const stocks = key === 'armor' ? entity?.armorLayers?.stuff : key === 'extraLife' ? entity?.resourceStocks?.extraLife?.stuff : null;
    if (!stocks || !Object.keys(stocks).length) return totals;
    // Equipment reserves are consumable stocks, not the original capacity from stat modifiers.
    const remaining = Object.values(stocks).reduce((sum, stock) => sum + Math.max(0, Number(stock.current) || 0), 0);
    const capacity = totals.map(source => {
      if (source.category !== 'equipment' || key !== 'extraLife') return source;
      const stockMax = getEquipmentResourceMax(entity, key);
      const calculation = source.calculations?.normal;
      return { ...source, value: source.value - stockMax, normalValue: (source.normalValue ?? source.value) - stockMax,
        ...(calculation ? { calculations: { ...source.calculations, normal: { ...calculation,
          value: calculation.value - stockMax, parts: [...calculation.parts, { stat: key, value: stockMax, fixed: true, operator: '\u2212' }] } } } : {}) };
    }).filter(source => source.value !== 0);
    return [...capacity.map(source => ({ ...source,
      label: key === 'armor' ? 'Armure max' : 'Vies supplémentaires max' })),
      { category: 'equipment', value: remaining, stat: key, unit: '', remainingStock: true,
        label: key === 'armor' ? 'Armure restante' : 'Vies supplémentaires disponibles' }];
  }
  const timingTotal = ({ attackCooldownReduc: 'attackCooldownReducTotal', attackPreparationReduc: 'attackPreparationReducTotal',
    attackExecutionReduc: 'attackExecutionReducTotal', attackRecoveryReduc: 'attackRecoveryReducTotal',
    attackProjectileSpeed: 'attackProjectileSpeedTotal' })[key];
  const models = calculated.umbraHelperCalculations || {};
  const modelKey = key === 'shift' ? null : ['autonomousConversion', 'generatedUmbraTarget', 'autonomousTotal']
    .find(name => models[name]) || Object.keys(models)[0];
  const model = models[modelKey];
  const sourceModel = models.generatedUmbraTarget || model;
  const isUmbra = stats.some(stat => stat.key === key && stat.nature === 'umbra');
  const unit = model?.unit || (timingTotal ? ' %' : '');
  const outputStat = model?.stat || getDisplayStatKey(key);
  const amounts = { umbra: 0, fixed: 0, stat: 0, equipment: 0, combat: 0 };
  const signed = part => (part.operator === '−' ? -1 : 1) * Number(part.value || 0);
  const constants = (sourceModel?.parts || []).filter(part => part.fixed && part.stat === 'neutral').reduce((sum, part) => sum + signed(part), 0);
  const rounded = value => Math.round((Number(value) || 0) * 100) / 100;
  const sourceUmbra = isUmbra ? key : getStatImprovement(entity, key)?.source;
  const finish = () => Object.entries(amounts).filter(([, value]) => rounded(value) !== 0)
    .map(([category, value]) => ({ category, value: rounded(value), stat: outputStat, unit,
      ...(category === 'equipment' && !isUmbra ? { family: 'fixed' } : {}),
      provenance: category === 'umbra' && sourceUmbra ? getStatInputProvenance(entity, sourceUmbra)
        : ['fixed', 'equipment'].includes(category) && !isUmbra ? getStatInputProvenance(entity, key, unit, category) : [],
      ...(category === 'umbra' && sourceUmbra ? { umbra: sourceUmbra } : {}) }));
  if (isUmbra) {
    if (!model) return [];
    amounts.fixed = constants;
    amounts[Number(getSafe(entity, key, 0)) > 0 ? 'umbra' : 'stat'] = Number(model.value) - constants;
    return finish();
  }
  const nativeKey = ({ cooldownTime: 'attackCooldownReduc', preparationTime: 'attackPreparationReduc',
    executionTime: 'attackExecutionReduc', recuperationTime: 'attackRecoveryReduc', projectileTime: 'attackProjectileSpeed' })[key] || key;
  const nativeParts = key === 'speed' ? [] : (sourceModel?.parts || []).filter(part => part.fixed && normalizeStatKey(part.stat) === key);
  const sourceEntries = nativeParts.length ? nativeParts.flatMap(part => part.sources || []) : getStatContributions(entity, nativeKey);
  const sources = sourceEntries.filter(source => !source.source?.startsWith('Umbra :')
    && source.source !== 'Bonus dérivés' && source.source !== 'Prévisualisation');
  const capacity = value => Number(value?.max ?? value?.current ?? value) || 0;
  const fallback = key === 'weight' ? getMovementWeightMalus(entity).weight : 0;
  const actualRaw = capacity(getSafe(entity, nativeKey, fallback));
  const beforeCombat = capacity(getSafe({ ...entity, battleBoosts: {} }, nativeKey, fallback));
  const initialRaw = nativeParts.length ? actualRaw - nativeParts.reduce((sum, part) => sum + signed(part), 0)
    : key === 'shift' ? Number(calculated.shiftMovementMaxBonus) || 0 : 0;
  const category = source => source.category || (source.combat ? 'combat' : source.equipment ? 'equipment' : source.source === 'Base' ? 'fixed' : 'stat');
  const rawAt = included => {
    const active = sources.filter(source => !source.combat && included.has(category(source)));
    const flat = active.filter(source => source.mode !== 'percent').reduce((sum, source) => sum + Number(source.value || 0), 0);
    const percent = active.filter(source => source.mode === 'percent').reduce((sum, source) => sum + Number(source.value || 0), 0);
    return capacity(getStatBeforeGeneration({ baseStats: { [nativeKey]: initialRaw + flat },
      modifierStats: { durable: { level: { [nativeKey]: { percent } } } } }, nativeKey));
  };
  const all = new Set(['fixed', 'stat', 'equipment']);
  // Preview deltas and otherwise unlabelled autonomous points belong to Stat.
  const remainder = beforeCombat - rawAt(all);
  const readTotal = included => {
    const raw = rawAt(included) + (included.has('stat') ? remainder : 0);
    const original = getSafe({ ...entity, battleBoosts: {} }, nativeKey, 0);
    const value = original && typeof original === 'object' ? { ...original, max: raw, current: Math.min(capacity(original.current), raw) } : raw;
    const view = { ...entity, stats: { ...entity?.stats, ...entity?.modifierStats?.preview?.total, [nativeKey]: value },
      modifierStats: { ...entity?.modifierStats, preview: null },
      battleBoosts: { ...entity?.battleBoosts, [nativeKey]: included.has('combat') ? entity?.battleBoosts?.[nativeKey] || [] : [] } };
    if (!modelKey && !timingTotal) return key === 'weight' ? getMovementWeightMalus(view).weight : capacity(getSafe(view, nativeKey, 0));
    const display = calculateStatsDisplay(key, view, getSafe(view, key, 0));
    return Number(timingTotal ? display[timingTotal] : display.umbraHelperCalculations?.[modelKey]?.value) || 0;
  };
  const included = new Set();
  let previous = rounded(readTotal(included));
  amounts.fixed = Math.min(Math.max(0, previous), Math.max(0, constants));
  amounts[getStatImprovement(entity, key) ? 'umbra' : 'stat'] = previous - amounts.fixed;
  for (const name of ['fixed', 'stat', 'equipment', 'combat']) {
    if (!sources.some(source => category(source) === name)
      && !(name === 'stat' && remainder)
      && !(name === 'combat' && entity?.battleBoosts?.[nativeKey]?.length)) continue;
    included.add(name);
    const next = rounded(readTotal(included));
    amounts[name] += next - previous;
    previous = next;
  }
  return finish();
}

function buildAutonomousHelperCalculations(statKey, entite, result) {
  const models = {};
  const read = key => Number(getSafe(entite, key, 0)) || 0;
  const fixed = (stat, value, unit = '') => ({ stat: getDisplayStatKey(stat), value, unit, fixed: true });
  const fromUmbra = source => calculateStatsDisplay(source, entite).umbraHelperCalculations || {};
  const combine = (key, stat, sourceModel, value, autonomous, unit = '') => {
    models[key] = { stat: getDisplayStatKey(stat), value, unit,
      parts: [...(sourceModel?.parts || []), fixed(stat, autonomous, unit)] };
  };
  const token = (stat, value, unit = '', icon = stat) => ({
    stat: getDisplayStatKey(stat), value, unit, icon,
  });
  const coefficient = (stat, value, unit = '') => token(stat, String(Number(value.toPrecision(6))), unit, null);
  const signedPart = (part, value) => ({ ...part, value: Math.abs(value), ...(value < 0 ? { operator: '−' } : {}) });
  if (statKey === 'will') {
    const cfg = balanceData.level.will;
    const value = Number(result.displayValue ?? read('will')) || 0;
    const bonus = result.lvlMaxBonus;
    const parts = [
      fixed('neutral', result.lvlMaxBase),
      signedPart({
        stat: 'will', unit: '', rounded: true,
        curvePreview: {
          current: { points: value, value: bonus },
          maximum: { points: cfg.willCap,
            value: calculateLvlMaxBonus(cfg.willCap, { baseMaxLevel: result.lvlMaxBase }) },
        },
      }, bonus),
    ];
    const granted = entite?.summonOrigin?.type === 'profanation'
      ? Math.max(0, Math.floor(Number(entite.summonOrigin.generatedLevel) || 0)) : 0;
    const grantedBonus = Math.max(0, granted - (result.lvlMaxBase + bonus));
    if (grantedBonus) parts.push({ ...fixed('neutral', grantedBonus), grantedLevel: granted });
    models.levelMaximum = { stat: 'will', value: result.lvlMaxEntite, unit: '', parts,
      maximumReached: result.lvlMaxEntite >= cfg.hardMaxLevel };
  }
  if (statKey === 'speed') {
    const inputs = entite?.baseStats ? getStatSystemInputs(entite, { combat: false }) : entite?.stats || {};
    const base = Number(inputs.speed ?? 1000) || 1000;
    const velocity = vivaciteResult(entite, 'velocity').value;
    const reduction = base && velocity > 0 ? calculateVelocityReduction(velocity, base)
      : { speedReduction: 0, adjustedSpeed: base, percentage: 0 };
    const parts = [
      fixed('neutral', base, ' ms'),
      { stat: 'velocity', value: reduction.speedReduction, unit: ' ms', operator: '−', rounded: true,
        arithmetic: { terms: [
          token('velocity', velocity), '→', coefficient('velocity', reduction.percentage, ' %'), '·',
          token('speed', Math.max(0, Math.round(base)), ' ms'), '×', coefficient('velocity', reduction.percentage, ' %'),
        ] } },
    ];
    const adjustment = read('speed') - (base - reduction.speedReduction);
    if (adjustment) parts.push(signedPart(fixed('speed', adjustment, ' ms'), adjustment));
    models.speedTotal = { stat: 'speed', value: read('speed'), unit: ' ms', parts };
  }
  const generated = result.generatedUmbraTarget;
  if (generated) {
    const source = fromUmbra(generated.source).generatedUmbraSource;
    const total = generated.target === 'magicalDamage' ? result.calculateMagicalTotalValue : generated.finalValue;
    combine('generatedUmbraTarget', generated.target, source, total,
      total - (source?.value || 0));
    const converted = ({
      physicalResistance: result.reductionPercent, magicalResistance: result.reductionPercent,
      physicalPen: result.physicPenBonus, magicalPen: result.magicPenBonus,
      dodge: result.calculateTotalDodgeBonus, velocity: result.velocityReductionPercent,
    })[statKey];
    if (converted != null) models.autonomousConversion = {
      stat: getDisplayStatKey(statKey), value: converted, unit: ' %',
      maximum: getStatEffectMaximum(({ physicalResistance: 'resistanceReduction', magicalResistance: 'resistanceReduction', dodge: 'dodgeChance' })[statKey] || statKey),
      parts: [{ stat: getDisplayStatKey(statKey), value: total, unit: '',
        curvePreview: { current: { points: total, value: converted } }, rounded: true, outputUnit: ' %' }],
    };
  }
  const sourceMap = {
    criticalChance: 'criticalPower', criticalDamage: 'criticalPower',
    criticalResistance: 'resilience', alterationResistance: 'resilience', hindranceResistance: 'resilience', resilienceTotal: 'resilience',
    bloodFuryExecutionChance: 'bloodFury', bloodFuryExecutionDamage: 'bloodFury',
    bloodFuryTargetThreshold: 'bloodFury', bloodThirsty: 'bloodFury', hpBattleRegen: 'indestructibility',
    shift: 'movement',
  };
  if (sourceMap[statKey]) Object.assign(models, fromUmbra(sourceMap[statKey]));
  const combined = {
    marathon: ['movement', 'movementMarathonChance', result.marathonChance, ' %'],
    trailer: ['movement', 'movementTrailerChance', result.trailerChance, ' %'],
    weaponOrfevre: ['weaponMastery', 'weaponOrfevreBonus', result.weaponOrfevreChance, ' %'],
    weaponCollector: ['weaponMastery', 'weaponMasteryTrophyChance', result.weaponCollectorChance, ' %'],
    charge: ['weaponMastery', 'weaponMasteryChargeBonus', result.chargeEquipmentSlots, ''],
    bloodThirsty: ['bloodFury', 'bloodFuryBloodThirstyBonus', result.bloodThirstyLifestealBonus, ' %'],
    dayHpRegen: ['vitality', 'HpRegenAmount', result.dayHpRegenTotal, ''],
    cognitiveExplosion: ['hypercognition', 'hypercognitionBonus', calculateCognitiveExplosionTotal(entite), ''],
    cognitiveGenerator: ['hypercognition', 'hypercognitionEssences', calculateHypercognitionEssences(entite), ''],
    transcendenceTotal: ['transcendence', 'transcendenceConsoProtectionPercent', calculateTranscendenceConsoProtectionTotal(entite), ' %'],
  }[statKey];
  if (combined) {
    const [source, key, total, unit] = combined;
    const model = fromUmbra(source)[key];
    // New autonomous effects are raw inputs, not already-generated values.
    const autonomous = statKey === 'cognitiveGenerator' ? Math.floor(Math.max(0, read(statKey)))
      : ['cognitiveExplosion', 'transcendenceTotal'].includes(statKey)
        ? read(statKey) : Number(total) - Number(model?.value || 0);
    combine('autonomousTotal', statKey, model, total, autonomous, unit);
    const cap = statKey === 'cognitiveGenerator' ? balanceData.hypercognition.essences.maxCount
      : statKey === 'transcendenceTotal' ? balanceData.transcendence.consoProtection.maxPercent : null;
    models.autonomousTotal.maximum = cap;
    models.autonomousTotal.maximumReached = cap != null && total >= cap;
    result.autonomousTotal = total;
    result.displayValue = total;
  }
  if (statKey === 'cognitiveExplosion') {
    result.hypercognitionValue = read('hypercognition');
    result.hypercognitionIntel = read('intelligence');
    const limit = globalThis.umbraProgression.getUmbraThreshold(entite);
    result.hypercognitionRatio = calculateHypercognitionRatio(result.hypercognitionValue, limit);
    result.hypercognitionCalculation = globalThis.umbraProgression.hypercognitionExplosionDetails(result.hypercognitionValue, result.hypercognitionIntel, limit);
    result.hypercognitionBonus = calculateHypercognitionBonus(entite);
    result.cognitiveExplosionAutonomous = read('cognitiveExplosion');
    result.cognitiveExplosionTotal = calculateCognitiveExplosionTotal(entite);
  }
  const timing = {
    cooldownTime: ['hasteCDReduc', 'attackCooldownReducTotal', 'attackCooldownReduc'],
    preparationTime: ['hastePreparation', 'attackPreparationReducTotal', 'attackPreparationReduc'],
    executionTime: ['hasteExecutionReduc', 'attackExecutionReducTotal', 'attackExecutionReduc'],
    recuperationTime: ['hasteRecupReduc', 'attackRecoveryReducTotal', 'attackRecoveryReduc'],
    projectileTime: ['hasteProjectilSpeed', 'attackProjectileSpeedTotal', 'attackProjectileSpeed'],
  }[statKey];
  if (timing) {
    const [key, total, autonomous] = timing;
    combine('autonomousTotal', statKey, fromUmbra('haste')[key], result[total], read(autonomous), ' %');
  }
  if (statKey === 'HP' || statKey === 'armor' || statKey === 'extraLife') {
    const [source, key] = statKey === 'HP' ? ['vitality', 'vitalityBonus']
      : statKey === 'armor' ? ['robustness', 'armorBonus'] : ['transcendence', 'transcendenceExBonus'];
    const model = fromUmbra(source)[key];
    const value = getSafe(entite, statKey, 0);
    const total = Number(value?.max ?? value) || 0;
    combine('autonomousTotal', statKey, model, total, total - Number(model?.value || 0));
  }
  for (const model of Object.values(models)) {
    model.parts = model.parts.filter(part => part.note !== 'Bonus inactif.');
    const ownParts = model.parts.filter(part => part.stat === getDisplayStatKey(statKey) && part.identity);
    if (ownParts.length) {
      model.parts = model.parts.filter(part => !ownParts.includes(part))
        .concat(ownParts.map(part => fixed(statKey, part.value, part.unit)));
    }
    for (const part of model.parts) {
      if (!part.fixed || part.stat === 'neutral') continue;
      const sourceKey = timing && part.stat === getDisplayStatKey(statKey) ? timing[2] : normalizeStatKey(part.stat);
      part.sources = getStatContributions(entite, sourceKey).filter(source => !source.source.startsWith('Umbra :') && source.source !== 'Bonus dérivés');
      const preview = entite?.modifierStats?.preview?.total?.[sourceKey];
      const capacity = value => Number(value?.max ?? value?.current ?? value) || 0;
      const delta = preview == null ? 0 : capacity(preview) - capacity(entite?.stats?.[sourceKey]);
      if (delta) part.sources.push({ source: 'Prévisualisation', value: delta, mode: 'flat' });
    }
  }
  return models;
}

function buildUmbraHelperCalculations(statKey, entite, statValue, result) {
  if (!stats.some(stat => stat.key === statKey && stat.nature === 'umbra')) return {};

  const calculations = {};
  const percent = ' %';
  const read = key => Number(getSafe(entite, key, 0)) || 0;
  const current = read(statKey);
  const value = toNumber(statValue ?? current, 0);
  const active = current > 0;
  const token = (stat, value, unit = '') => ({ stat: getDisplayStatKey(stat), value, unit });
  const constant = (value, unit = '') => token('neutral', value, unit);
  const input = (key, value = read(key)) => token(key, value);
  const coefficient = (key, value, unit = '') => ({
    ...token(key, String(Number(value.toPrecision(6))), unit), icon: null,
  });
  const fixedTerm = (value, unit = '') => ({ ...constant(value, unit), icon: null });
  const withArithmetic = (source, terms, minimum) => {
    source.compact = null;
    source.arithmetic = { terms, ...(minimum != null ? { minimum } : {}) };
    return source;
  };
  const withSimpleProduct = (formula, source, multiplier) => Object.assign(formula, { product: { source, multiplier } });
  const bounded = (key, cap, value = read(key)) => ['min(', constant(cap), ',', 'max(', constant(0), ',', input(key, value), ')', ')'];
  const cappedProduct = (key, multiplier, maximum, value = read(key)) => {
    const formula = ['min(', constant(maximum), ',', 'max(', constant(0), ',', input(key, value), ')', '*', token(key, multiplier), ')'];
    return value >= 0 && value * multiplier <= maximum
      ? withSimpleProduct(formula, input(key, value), token(key, multiplier))
      : Object.assign(formula, { limit: { points: multiplier > 0 ? maximum / multiplier : 0, value: maximum }, sourcePoints: value });
  };
  const linear = (key, cap, maximum, value = read(key)) => {
    const formula = [...bounded(key, cap, value), '/', constant(cap), '*', constant(maximum)];
    return value >= 0 && value <= cap
      ? withSimpleProduct(formula, input(key, value), token(key, maximum / cap))
      : Object.assign(formula, { limit: { points: cap, value: maximum }, sourcePoints: value });
  };
  const eased = (key, maximum, cap, power, value = read(key)) => [
    constant(maximum), '*', '(', constant(1), '-', 'pow(', constant(1), '-', '(',
    ...bounded(key, cap, value), '/', constant(cap), ')', ',', constant(power), ')', ')',
  ];
  const part = (stat, contribution, formula, unit = percent, enabled = active) => {
    const visual = getDisplayStatKey(stat);
    const singleInput = formula.length === 1 && typeof formula[0] === 'object';
    const fixed = singleInput && visual === 'neutral';
    const identity = singleInput && visual !== 'neutral' && formula[0].stat === visual;
    const simpleProduct = formula.length === 3 && formula[1] === '*'
      && typeof formula[0] === 'object' && formula[0].stat !== 'neutral' && typeof formula[2] === 'object';
    // Coefficients come only from the formula, never from its rounded contribution.
    // Curves and thresholds without an explicit simple product have no sub-helper yet.
    const product = formula.product ?? (simpleProduct ? { source: formula[0], multiplier: formula[2] }
      : identity ? { source: formula[0], multiplier: token(stat, 1) } : null);
    return {
      stat: visual, value: enabled ? contribution : 0, unit, formula, fixed, identity,
      compact: product ? { source: product.source, multiplier: { ...product.multiplier, unit } } : null,
      ...(formula.limit ? { curvePreview: {
        current: { points: formula.sourcePoints, value: enabled ? contribution : 0 },
        maximum: { ...formula.limit, value: enabled ? formula.limit.value : 0 },
      } } : {}),
      ...(!enabled ? { note: 'Bonus inactif.' } : {}),
    };
  };
  const withMilestones = (source, countAt, maxPoints, maxCount, display = {}) => {
    source.progression = { ...display, current: { points: value, count: source.value }, next: null };
    let low = source.value > 0 ? 1 : 0;
    let high = Math.ceil(maxPoints);
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (countAt(middle) >= source.value) high = middle;
      else low = middle + 1;
    }
    source.progression.threshold = low;
    if (source.value < maxCount) {
      // Read the next whole-point milestone from the unchanged gameplay calculator.
      let low = Math.max(1, Math.floor(value) + 1);
      let high = Math.ceil(maxPoints);
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (countAt(middle) > source.value) high = middle;
        else low = middle + 1;
      }
      const count = countAt(low);
      if (low <= Math.ceil(maxPoints) && count > source.value) {
        source.progression.next = { points: low, count };
      }
    }
    return source;
  };
  const withCurvePreview = (source, points, maxPoints, maximum, label = 'Maximum') => {
    source.compact = null;
    source.identity = false;
    source.curvePreview = {
      current: { points, value: source.value },
      maximum: { points: maxPoints, value: source.note ? 0 : maximum }, label,
    };
    return source;
  };
  const roundedCalculations = new Set([
    'generatedUmbraSource', 'armorBonus', 'vitalityBonus', 'HpRegenAmount',
    'hastePreparation', 'hasteCDReduc', 'hasteExecutionReduc', 'hasteRecupReduc', 'hasteProjectilSpeed',
    'precisionBonus', 'indestructibilityBonus', 'indestructibilityReductionTotal',
    'hpBattleRegenPercent', 'astralityTotal',
    'mysticismProcChance', 'mysticismTranceDuration', 'mysticismPreparationAcceleration', 'mysticismDamageBonus',
    'equilibreAggroBonus', 'equilibreAggroReduction', 'equilibreInvisibleDetection', 'equilibreBalancedAttackChance',
    'occultismInvisibilityChance', 'occultismTargetableChance', 'occultismDodgeBonus', 'occultismCritChanceBonus',
    'critTotalChance', 'critDamageBonus', 'resilienceCritTotalBonus', 'resilienceAlteTotalBonus',
    'bloodFuryExecutionBonus', 'bloodFuryExecDamage', 'bloodFuryBloodThirstyBonus',
    'resilienceTotalCancelBonus', 'hypercognitionBonus', 'hypercognitionEssences',
    'transcendenceExBonus', 'transcendenceConsoProtectionPercent',
    'movementStartingTotalCurrent', 'movementStartingCharges', 'movementMarathonChance', 'weaponMasteryChargeBonus',
    'weaponOrfevreBonus', 'weaponMasteryTrophyChance',
  ]);
  const add = (key, stat, parts, unit = percent, total = result[key], note) => {
    for (const source of parts) {
      source.rounded = roundedCalculations.has(key) && !source.fixed && !source.identity && !source.note;
    }
    calculations[key] = { stat: getDisplayStatKey(stat), value: total, unit, parts, maximum: getStatEffectMaximum(key) };
    if (note) calculations[key].note = note;
    else if (parts.every(source => source.note === 'Bonus inactif.')) calculations[key].note = 'Bonus inactif.';
  };
  const fixedPart = (contribution, unit = percent, enabled = active) =>
    part('neutral', contribution, [constant(contribution, unit)], unit, enabled);
  const capNote = maximum => `Total plafonné à ${maximum} %.`;

  // Keep the first-point branches and the actual exponential/square-root curves.
  const curve = (key, cfg, points = read(key)) => {
    const minimum = cfg.minPercent ?? cfg.minBonus;
    const maximum = cfg.maxPercent ?? cfg.maxBonus;
    if (points === 1) return [constant(cfg.firstPointPercent ?? cfg.firstPointBonus)];
    const growth = cfg.growthDivisor != null
      ? [constant(1), '-', 'exp(', '-', input(key, points), '/', constant(cfg.growthDivisor), ')']
      : cfg.growthK != null
        ? [constant(1), '-', 'exp(', '-', constant(cfg.growthK), '*', '(', input(key, points), '-', constant(1), ')', ')']
        : ['sqrt(', 'max(', constant(0), ',', input(key, points), '-', constant(1), ')', '/', constant(cfg.divisor), ')'];
    return ['min(', constant(maximum), ',', constant(minimum), '+', '(', constant(maximum), '-', constant(minimum), ')', '*', '(', ...growth, ')', ')'];
  };
  const logistic = (x, steepness, midpoint) => [
    constant(1), '/', '(', constant(1), '+', 'exp(', '-', constant(steepness), '*', '(', x, '-', constant(midpoint), ')', ')', ')',
  ];


  if (result.generatedUmbraSource && statKey !== 'vivacite') {
    const detail = result.generatedUmbraSource;
    const total = buildStatSystemModel(getStatSystemResult(entite, detail.target) || detail.system, entite);
    total.name = detail.targetLabel.charAt(0) + detail.targetLabel.slice(1).toLocaleLowerCase('fr');
    const explain = model => ({ ...model, parts: model.parts.map(source => ({ ...source,
      formula: source.compact ? [source.compact.source, '*', source.compact.multiplier] : [token(source.stat, source.value)] })) });
    const ability = total.contributions.find(part => part.kind === 'umbra');
    calculations.generatedUmbraSource = explain(ability);
    calculations[`${detail.target}Total`] = explain(total);
    if (statKey === 'robustness') calculations.armorBonus = explain(total.contributions.find(part => part.kind === 'umbra'));
    return calculations;
  }

  switch (statKey) {
    case 'vitality': {
      const cfg = balanceData.generatedStats.vitalityHp;
      add('vitalityBonus', 'HP', [withCurvePreview(part('vitality', result.vitalityBonus,
        curve('vitality', cfg, value), '', value > 0), value, null, cfg.maxBonus)], '');
      add('HpRegenAmount', 'dayHpRegen', [part('vitality', result.HpRegenAmount, [
        input('HP', result.maxHPValue), '*', token('vitality', result.HpRegenBonus / 100),
      ], '', value > 0)], '');
      break;
    }
    case 'haste': {
      const cfg = balanceData.attackTime.hasteRatios;
      add('hastePreparation', 'haste', [
        withCurvePreview(part('haste', result.hastePercent, curve('haste', balanceData.baseUmbraCurves.haste, value), percent, value > 0),
          value, null, balanceData.baseUmbraCurves.haste.maxPercent),
        part('intelligence', result.hasteIntelRatio, linear('intelligence', cfg.statCap, cfg.intelligencePrepMaxPercent, calculateIntelligence(entite)), percent, value > 0),
      ]);
      for (const [key, source, maximum, sourceValue, enabled] of [
        ['hasteCDReduc', 'intelligence', cfg.intelligenceCooldownMaxPercent, calculateIntelligence(entite), getHastePoints(entite) > 0],
        ['hasteExecutionReduc', 'strength', cfg.strengthExecutionMaxPercent, calculateStrength(entite), getHastePoints(entite) > 0],
        ['hasteRecupReduc', 'agility', cfg.agilityRecoveryMaxPercent, calculateAgility(entite), active],
      ]) add(key, 'haste', [part(source, result[key], linear(source, cfg.statCap, maximum, sourceValue), percent, enabled)]);
      add('hasteProjectilSpeed', 'haste', [withCurvePreview(part('strength', result.hasteProjectilSpeed, [
        '(', constant(1), '/', '(', constant(1), '-', 'min(', constant(cfg.projectileSpeedCapPercent), ',',
        ...linear('strength', cfg.statCap, cfg.strengthExecutionMaxPercent, calculateStrength(entite)), ')', '/', constant(100), ')', '-', constant(1), ')', '*', constant(cfg.projectileSpeedBasePercent),
      ], percent, getHastePoints(entite) > 0), calculateStrength(entite), cfg.statCap,
        calculateHasteProjectilSpeed({ stats: { haste: current, strength: cfg.statCap } }))]);
      break;
    }
    case 'indestructibility': {
      const chance = result.indestructibilityChance, skin = result.indestructibilitySkin;
      const percentModel = (stat, detail, parts, sourcePoints, attributePoints = 0) => {
        const weight = sourcePoints * detail.sourceRatio + attributePoints * detail.attributeRatio;
        return { stat, value: detail.value, unit: percent, maximum: detail.max, rounded: false,
          parts: parts.map(source => ({ ...source, ratioDecimals: 4 })),
          note: `Score : ${sourcePoints} × ${detail.sourceRatio} + ${attributePoints} × ${detail.attributeRatio} = ${weight}. Pourcentage : ${detail.max} × ${weight} / (${detail.constant} + ${weight}).` };
      };
      calculations.indestructibilityBonus = percentModel('indestructibilityTotal', chance, [chance.source], chance.points);
      calculations.indestructibilityReductionTotal = percentModel('indestructibleSkin', skin, [skin.source, skin.attribute],
        chance.points, chance.points > 0 ? Math.max(0, read('strength')) : 0);
      const total = buildStatSystemModel(result.indestructibilityRegenSystem, entite);
      calculations.hpBattleRegenTotal = total;
      calculations.hpBattleRegenPercent = total.contributions.find(part => part.kind === 'umbra');
      const cd = result.indestructibilityCooldown;
      calculations.indestructibilityCooldown = { stat: 'indestructibilityCooldown', value: cd.weight, unit: '', parts: [
        { stat: 'strength', value: cd.weight, compact: { source: { stat: 'strength', value: cd.attributePoints },
          multiplier: { stat: 'strength', value: cd.points > 0 ? cd.attributeRatio : 0, decimals: 4 } } },
      ] };
      break;
    }
    case 'esoterism': {
      const chance = result.esoterismChance, reduction = result.esoterismReduction, piercing = result.esoterismPiercing;
      add('esoterismBonus', 'esoterismChance', [chance.source], percent, chance.value,
        `Score : points d’Ésotérisme × ${roundBalance(chance.sourceRatio, 4)}. Chance : ${chance.max} × score / (${chance.constant} + score). Minimum actif : ${balanceData.esoterism.chance.firstPointPercent} %.`);
      add('esoterismTotalReduction', 'esoterismReduction', [fixedPart(reduction.base), reduction.attribute], percent, reduction.value,
        `Score d’Agilité : ${reduction.agility} × ${roundBalance(reduction.ratio, 4)}. Réduction active : ${reduction.basePercent} + (${reduction.maxPercent} − ${reduction.basePercent}) × score / (${reduction.constant} + score).`);
      add('esoterismPiercingChance', 'esoterismPiercingChance', [piercing.attribute], percent, piercing.value,
        `Après un jet d’Ésotérisme réussi : score de Force × ${piercing.max} / (${piercing.constant} + score). Score : Force × ${roundBalance(piercing.attributeRatio, 4)}. Contre du perçant seul, la chance totale vaut chance d’Ésotérisme × chance d’extension / 100.`);
      add('esoterismPiercingReduction', 'esoterismPiercingReduction', [{ stat: 'esoterismReduction', value: reduction.piercingValue, unit: percent,
        compact: { source: { stat: 'esoterismReduction', value: reduction.value }, multiplier: { stat: 'neutral', value: balanceData.esoterism.piercing.reductionRatio } } }], percent, reduction.piercingValue,
        'La réduction perçante vaut exactement la moitié de la réduction magique ; la Force règle uniquement la chance de cette extension.');
      const cd = result.esoterismCooldown;
      calculations.esoterismCooldown = { stat: 'esoterismCooldown', value: cd.weight, unit: '', parts: [
        { stat: 'intelligence', value: cd.weight, compact: { source: { stat: 'intelligence', value: cd.attributePoints },
          multiplier: { stat: 'intelligence', value: cd.points > 0 ? cd.attributeRatio : 0, decimals: 4 } } },
      ] };
      break;
    }
    case 'mysticism':
    case 'occultism': {
      const curvedPart = (source, contribution, cfg, maximumField, calculateBonus, unit = percent, divisor = 1) => {
        const cap = cfg[`${source}Target`];
        const sourcePart = part(source, contribution / divisor, eased(source, cfg[maximumField], cap, cfg.curvePower), unit);
        sourcePart.curvePreview = {
          current: { points: read(source), value: sourcePart.value },
          maximum: { points: cap, value: active ? calculateBonus({ stats: { [statKey]: current, [source]: cap } }) / divisor : 0 },
        };
        return sourcePart;
      };
      // Each row binds the existing total, its two engine contributions and its balance curve.
      const rows = statKey === 'mysticism' ? [
        ['mysticismProcChance', 'mysticism', 'mysticismBaseProcChance', 'mysticismIntelProcChance', 'intelligence', balanceData.mysticism.proc, 'baseChancePercent', 'intelligenceMaxBonusPercent', calculateMysticismIntelProcChance],
        ['mysticismTranceDuration', 'mysticism', 'mysticismBaseTranceDuration', 'mysticismIntelTranceDuration', 'intelligence', balanceData.mysticism.trance, 'baseDurationMs', 'intelligenceMaxSeconds', calculateMysticismIntelTranceDuration, ' s', 1000],
        ['mysticismPreparationAcceleration', 'mysticism', 'mysticismBasePreparationAcceleration', 'mysticismIntelPreparationAcceleration', 'intelligence', balanceData.mysticism.preparation, 'baseAccelerationPercent', 'intelligenceMaxBonusPercent', calculateMysticismIntelPreparationAcceleration],
        ['mysticismDamageBonus', 'mysticism', 'mysticismBaseDamageBonus', 'mysticismIntelDamageBonus', 'intelligence', balanceData.mysticism.damage, 'baseBonusPercent', 'intelligenceMaxBonusPercent', calculateMysticismIntelDamageBonus],
      ] : [
        ['occultismInvisibilityChance', 'occultism', 'occultismBaseInvisibilityChance', 'occultismAgiInvisibilityChance', 'agility', balanceData.occultism.invisibility, 'baseChancePercent', 'agilityMaxBonusPercent', calculateOccultismAgiInvisibilityChance],
        ['occultismTargetableChance', 'occultism', 'occultismBaseTargetableChance', 'occultismAgiTargetableChance', 'agility', balanceData.occultism.targetable, 'baseChancePercent', 'agilityMaxBonusPercent', calculateOccultismAgiTargetableChance],
        ['occultismDodgeBonus', 'dodge', 'occultismBaseDodgeBonus', 'occultismAgiDodgeBonus', 'agility', balanceData.occultism.dodge, 'baseBonusPercent', 'agilityMaxBonusPercent', calculateOccultismAgiDodgeBonus, ''],
      ];
      for (const [key, visual, baseKey, bonusKey, source, cfg, baseField, maximumField, calculateBonus, unit = percent, divisor = 1] of rows) {
        const bonusPart = curvedPart(source, result[bonusKey], cfg, maximumField, calculateBonus, unit, divisor);
        if (key === 'occultismTargetableChance') bonusPart.operator = '−';
        add(key, visual, [
          part('neutral', result[baseKey] / divisor, [constant(cfg[baseField] / divisor, unit)], unit),
          bonusPart,
        ], unit, result[key] / divisor);
      }
      if (statKey === 'occultism') {
        const cfg = balanceData.occultism.critical;
        // The critical total uses only agility, even though a base field exists in balanceData.
        add('occultismCritChanceBonus', 'criticalChance', [curvedPart('agility', result.occultismCritChanceBonus,
          cfg, 'agilityMaxBonusPercent', calculateOccultismAgiCritChanceBonus)]);
        add('occultismPreparationSpeedDebuff', 'indiscretion', [fixedPart(balanceData.occultism.drawbacks.preparationSpeedDebuffPercent)]);
        add('occultismShadowFragilityPercent', 'fragility', [fixedPart(balanceData.occultism.drawbacks.shadowFragilityPercent)]);
      }
      break;
    }
    case 'astrality': {
      for (const target of ['fatalSurvival', 'astralBody']) {
        const total = buildStatSystemModel(astralityResult(entite, target), entite);
        calculations[`${target}Total`] = total;
        calculations[target === 'fatalSurvival' ? 'generatedUmbraSource' : 'astralBodySource'] = total.contributions.find(part => part.kind === 'umbra');
      }
      calculations.astralityTotal = calculations.fatalSurvivalTotal;
      const r = result.astralReturn, body = result.astralBody;
      calculations.astralReturnScore = { stat: 'astralReturn', value: r.weight, unit: '', parts: [
        { stat: 'strength', value: r.attributeWeight, compact: { source: { stat: 'strength', value: r.strength }, multiplier: { stat: 'strength', value: r.attributeRatio } } },
      ] };
      const cd = result.astralCooldown;
      calculations.astralCooldownScore = { stat: 'astralCooldown', value: cd.weight, unit: '', parts: [
        { stat: 'agility', value: cd.weight, compact: { source: { stat: 'agility', value: cd.agility }, multiplier: { stat: 'agility', value: cd.attributeRatio } } },
      ] };
      calculations.astralBodyDuration = { stat: 'astralBody', value: body.seconds, unit: ' s', parts: [
        { stat: 'astrality', value: body.seconds, compact: { source: { stat: 'astralBody', value: balanceData.astrality.astralBody.baseDurationSeconds }, multiplier: { stat: 'astrality', value: body.seconds > 0 ? body.ratio : 0 } } },
      ] };
      break;
    }
    case 'bloodFury': {
      for (const [target, alias] of [
        ['bloodThirsty', 'bloodFuryBloodThirstyBonus'],
        ['bloodFuryExecutionChance', 'bloodFuryExecutionBonus'],
        ['bloodFuryTargetThreshold', 'bloodFuryExecChanceBonus'],
        ['bloodFuryExecutionDamage', 'bloodFuryExecDamage'],
      ]) {
        const row = getStatSystemResult(entite, target) || calculateStatSources({ ...entite.stats,
          bloodFury: read('bloodFury'), strength: read('strength'), physicalDamage: read('physicalDamage') }, target,
          { effective: true, seuilUmbra: globalThis.umbraProgression.getUmbraThreshold(entite) });
        const total = buildStatSystemModel(row, entite);
        calculations[`${target}Total`] = total;
        calculations[alias] = total.contributions.find(part => part.kind === 'umbra');
        if (target === 'bloodThirsty') calculations.generatedUmbraSource = calculations[alias];
      }
      break;
    }
    case 'ambidextry': {
      const chance = result.ambidextryChance, damage = result.ambidextryDamage;
      add('ambidextryTotalChance', 'ambidextry', [chance.source, chance.attribute], percent, chance.value,
        chance.points > 0
          ? `Score : ${chance.points} × ${roundBalance(chance.sourceRatio, 4)} + ${chance.attribute.compact.source.value} × ${roundBalance(chance.attributeRatio, 4)}. Chance : ${chance.max} × score / (${balanceData.ambidextry.chance.constant} + score).`
          : 'Passive inactive sans Ambidextrie.');
      add('ambidextryDamageBonus', 'ambidextry', [fixedPart(damage.base), damage.source, damage.attribute], percent, damage.value,
        'Pourcentage des dégâts du premier coup. Aucun plafond.');
      break;
    }
    case 'criticalPower': {
      for (const [target, alias] of [['criticalChance', 'critTotalChance'], ['criticalDamage', 'critDamageBonus']]) {
        const total = buildStatSystemModel(criticalResult(entite, target), entite);
        calculations[`${target}Total`] = total;
        calculations[alias] = total.contributions.find(part => part.kind === 'umbra');
        if (target === 'criticalChance') calculations.generatedUmbraSource = calculations[alias];
      }
      break;
    }
    case 'vivacite': {
      for (const target of ['velocity', 'controlledSpeed']) {
        const total = buildStatSystemModel(vivaciteResult(entite, target), entite);
        calculations[`${target}Total`] = total;
        calculations[target === 'velocity' ? 'generatedUmbraSource' : 'controlledSpeedSource'] = total.contributions.find(part => part.kind === 'umbra');
      }
      const velocity = calculations.generatedUmbraSource.value;
      const base = globalThis.umbraProgression.retreatChance(0);
      const bonus = globalThis.umbraProgression.retreatChance(velocity) - base;
      calculations.agileRetreatTotal = { stat: 'agileRetreat',
        value: globalThis.umbraProgression.retreatChance(calculations.velocityTotal.value), unit: ' %',
        maximum: globalThis.umbraProgression.vivacite.retreat.maxPercent };
      calculations.agileRetreat = { stat: 'agileRetreat', value: bonus, unit: ' %', maximum: globalThis.umbraProgression.vivacite.retreat.maxPercent, parts: [
        { stat: 'velocity', value: bonus, unit: ' %', fixed: true },
      ] };
      break;
    }
    case 'equilibre': {
      for (const target of ['equilibreAggroReduction', 'equilibreAggroBonus', 'equilibreInvisibleDetection', 'equilibreBalancedAttackChance']) {
        const total = buildStatSystemModel(equilibreResult(entite, target), entite);
        calculations[`${target}Total`] = total;
        calculations[target] = total.contributions.find(part => part.kind === 'umbra');
        if (target === 'equilibreAggroReduction') calculations.generatedUmbraSource = calculations[target];
      }
      break;
    }
    case 'resilience': {
      for (const [target, alias] of [['criticalResistance', 'resilienceCritTotalBonus'],
        ['alterationResistance', 'resilienceAlteTotalBonus'], ['hindranceResistance', 'resilienceHindranceBonus'], ['resilienceTotal', 'resilienceTotalCancelBonus']]) {
        const total = buildStatSystemModel(resilienceResult(entite, target), entite);
        calculations[`${target}Total`] = total;
        calculations[alias] = total.contributions.find(part => part.kind === 'umbra');
        if (target === 'criticalResistance') calculations.generatedUmbraSource = calculations[alias];
      }
      break;
    }
    case 'hypercognition': {
      const detail = result.hypercognitionEssenceCalculation;
      const system = (value === current ? getStatSystemResult(entite, 'cognitiveExplosion') : null) || calculateStatSources({
        ...(entite?.baseStats ? getStatSystemInputs(entite) : entite?.stats),
        hypercognition: value, intelligence: result.hypercognitionIntel,
      }, 'cognitiveExplosion', { effective: true, seuilUmbra: detail.limit });
      const total = buildStatSystemModel(system, entite);
      calculations.cognitiveExplosionTotal = total;
      calculations.generatedUmbraSource = calculations.hypercognitionBonus = total.contributions.find(source => source.kind === 'umbra');
      const essencePart = part(statKey, detail.value, [input(statKey, value), '*', coefficient(statKey, detail.coefficient)], '', value >= detail.firstPoint);
      essencePart.compact.multiplier = { stat: statKey, value: detail.coefficient, decimals: 4 };
      if (detail.points >= detail.firstPoint && detail.raw < detail.firstCount) {
        essencePart.compact = null;
        essencePart.arithmetic = { terms: [input(statKey, value), '→', token('cognitiveGenerator', detail.value)], minimum: detail.firstCount };
      }
      essencePart.rounded = true;
      essencePart.rounding = 'floor';
      essencePart.note = `Ratio de base ${detail.ratio} × courbe ${detail.multiplier}. Arrondi inférieur ; première essence à ${detail.firstPoint} point. Plafond : ${detail.maxCount} essences.`;
      // The search bound follows the coefficient; it is not a point cap.
      const maxPoints = detail.ratio > 0 ? Math.ceil(Math.max(value, detail.firstPoint, detail.maxCount / detail.ratio)) : Math.ceil(value);
      add('hypercognitionEssences', 'hypercognition', [withMilestones(essencePart,
        points => calculateHypercognitionEssenceCount(points, detail.limit), maxPoints, detail.maxCount,
        { stat: 'hyperco', icon: 'essence-hyperco' })], '');
      break;
    }
    case 'transcendence': {
      const life = result.transcendenceLives;
      add('transcendenceExBonus', 'extraLife', [{ stat: 'transcendence', value: life.value,
        compact: { source: { stat: 'transcendence', value: life.points },
          multiplier: { stat: 'transcendence', value: life.points > 0 ? life.raw / life.points : 0, decimals: 4 } },
        note: `Courbe : ${life.referenceLives} × (points / ${life.referencePoints})^${life.exponent}, arrondie au plus proche, au moins une vie si active. Aucun plafond de vies. Au-delà de la limite ${life.limit}, seul le supplément de courbe conserve ${life.residualRate * 100} %.`,
      }], '');
      calculations.transcendenceExBonus.parts[0].rounded = true;
      calculations.transcendenceExBonus.parts[0].rounding = 'nearest';
      const resurrection = result.improvedResurrection;
      const baseHealing = resurrection.basePercent;
      calculations.improvedResurrection = { stat: 'improvedResurrection', value: resurrection.totalPercent,
        unit: ' %', maximum: balanceData.extraLife.resurrect.maxPercent, parts: [
          { stat: 'extraLife', value: baseHealing, unit: ' %', fixed: true },
          { stat: 'intelligence', value: resurrection.totalPercent - baseHealing, unit: ' %', fixed: true },
        ], note: `Base : ${resurrection.basePercent} %. Apport d’Intelligence avant plafond : ${resurrection.intelPercent} %. Total limité à ${balanceData.extraLife.resurrect.maxPercent} % des HP maximum.` };
      const system = getStatSystemResult(entite, 'transcendenceTotal')
        || calculateStatSources({ transcendence: current, intelligence: read('intelligence') }, 'transcendenceTotal', { effective: true, seuilUmbra: life.limit });
      const total = buildStatSystemModel(system, entite);
      calculations.transcendenceTotalTotal = total;
      calculations.transcendenceConsoProtectionPercent = {
        ...total.contributions.find(part => part.kind === 'umbra'), maximum: system.maximum,
      };
      const cd = result.transcendentalCooldown;
      calculations.transcendentalCooldown = { stat: 'transcendentalCooldown', value: cd.weight, unit: '', parts: [
        { stat: 'intelligence', value: cd.weight, compact: { source: { stat: 'intelligence', value: cd.attributePoints },
          multiplier: { stat: 'intelligence', value: cd.points > 0 ? cd.attributeRatio : 0, decimals: 4 } } },
      ] };
      break;
    }
    case 'movement': {
      const cfg = balanceData.movement.charges;
      const enabled = result.movementValue > 0;
      add('movementMaxCharges', 'shift', [part(statKey, result.movementMaxCharges, [input(statKey, result.movementValue)], '', enabled)], '');
      const agility = getMovementAgilityValue(entite);
      const startingFormula = agility >= cfg.agilityCap ? [constant(cfg.maxAgilityStartingBonusPercent)] : [
        constant(cfg.maxAgilityStartingBonusPercent), '*', '(', constant(1), '-', 'exp(', '-', input('agility', agility), '/', constant(cfg.startingSoftCapDivider), ')', ')',
      ];
      const agilityPart = part('agility', result.movementStartingAgiRatioCurrent, startingFormula, percent, enabled);
      agilityPart.curvePreview = { current: { points: agility, value: agilityPart.value } };
      add('movementStartingTotalCurrent', 'shift', [
        fixedPart(cfg.baseStartingPercent, percent, enabled),
        agilityPart,
      ], percent, result.movementStartingTotalCurrent, capNote(cfg.maxStartingPercent));
      add('movementStartingCharges', 'shift', [part(statKey, result.movementStartingCharges, withSimpleProduct([
        'min(', input('shift', result.movementMaxCharges), ',', 'ceil(', input(statKey, result.movementValue), '*',
        token('shift', result.movementStartingTotalCurrent, percent), '/', constant(100), ')', ')',
      ], input(statKey, result.movementValue), token('shift', result.movementStartingTotalCurrent / 100)), '', enabled)], '');
      add('movementMarathonChance', 'marathon', [
        fixedPart(cfg.marathonBasePercent, percent, enabled),
        part('agility', enabled ? result.movementMarathonChance - cfg.marathonBasePercent : 0,
          cappedProduct('agility', cfg.marathonAgilityRatio, cfg.chanceMaxPercent - cfg.marathonBasePercent, agility), percent, enabled),
      ]);
      add('movementTrailerChance', 'trailer', [
        fixedPart(cfg.trailerBasePercent, percent, enabled),
        part('movement', enabled ? result.movementTrailerChance - cfg.trailerBasePercent : 0,
          cappedProduct('movement', cfg.trailerMovementRatio, cfg.chanceMaxPercent - cfg.trailerBasePercent), percent, enabled),
      ]);
      calculations.movementTrailerChance.parts[1].rounded = true;
      break;
    }
    case 'weaponMastery': {
      const cfg = balanceData.weaponMastery;
      const points = Math.max(0, Math.floor(value));
      const strength = Math.max(0, Math.floor(read('strength')));
      add('weaponMasteryChargeBonus', 'charge', [
        withArithmetic(part(statKey, result.weaponMasteryChargeBrutRatioBonus,
          ['floor(', input(statKey, points), '/', constant(cfg.charge.masteryDivisor), ')', '+', constant(cfg.charge.masteryBaseBonus)], '', points > 0),
          [input(statKey, points), '×', coefficient(statKey, 1 / cfg.charge.masteryDivisor), '+', fixedTerm(cfg.charge.masteryBaseBonus)]),
        part('strength', result.weaponMasteryChargeStrengthRatioBonus, withSimpleProduct(
          ['floor(', input('strength', strength), '/', constant(cfg.charge.strengthDivisor), ')'],
          input('strength', strength), token('strength', 1 / cfg.charge.strengthDivisor)), '', value > 0),
      ], '');
      const mastery = balanceData.weaponOrfevre.fromWeaponMastery;
      const force = balanceData.weaponOrfevre.fromStrength;
      const ownedPoints = Math.max(0, Math.floor(current));
      const masteryFormula = ownedPoints <= mastery.earlyCap
        ? ['floor(', input(statKey, ownedPoints), '/', constant(mastery.earlyDivisor), ')', '+', constant(mastery.earlyBaseBonus)]
        : [constant(mastery.lateBaseBonus), '+', '(', input(statKey, ownedPoints), '-', constant(mastery.earlyCap), ')', '/', constant(mastery.lateDivisor)];
      const strengthFormula = strength <= force.earlyCap
        ? ['max(', constant(force.earlyMinBonus), ',', input('strength', strength), '/', constant(force.earlyDivisor), ')']
        : [constant(force.lateBaseBonus), '+', '(', input('strength', strength), '-', constant(force.earlyCap), ')', '/', constant(force.lateDivisor)];
      const masteryDetail = ownedPoints <= mastery.earlyCap
        ? [input(statKey, ownedPoints), '×', coefficient(statKey, 1 / mastery.earlyDivisor, percent), '+', fixedTerm(mastery.earlyBaseBonus, percent)]
        : [fixedTerm(mastery.lateBaseBonus, percent), '+', '(', input(statKey, ownedPoints), '−', fixedTerm(mastery.earlyCap), ')', '×', coefficient(statKey, 1 / mastery.lateDivisor, percent)];
      const strengthDetail = strength <= force.earlyCap
        ? [input('strength', strength), '×', coefficient('strength', 1 / force.earlyDivisor, percent)]
        : [fixedTerm(force.lateBaseBonus, percent), '+', '(', input('strength', strength), '−', fixedTerm(force.earlyCap), ')', '×', coefficient('strength', 1 / force.lateDivisor, percent)];
      add('weaponOrfevreBonus', 'weaponOrfevre', [
        withArithmetic(part(statKey, calculateWeaponOrfevreWeaponMastery(entite), masteryFormula), masteryDetail),
        withArithmetic(part('strength', result.weaponOrfevreStrength, strength > 0 ? strengthFormula : [input('strength', 0)]), strengthDetail,
          active && strength > 0 && strength <= force.earlyCap ? force.earlyMinBonus : undefined),
      ]);
      add('weaponMasteryTrophyChance', 'weaponCollector', [
        withArithmetic(part(statKey, result.weaponMasteryTrophyWeaponMasteryBonus,
          [constant(cfg.trophy.basePercent), '+', '(', input(statKey, points), '-', constant(1), ')', '*', '(', constant(cfg.trophy.masteryMaxBonusPercent), '/', constant(cfg.trophy.masteryRange), ')'], percent, points > 0),
          [fixedTerm(cfg.trophy.basePercent, percent), '+', '(', input(statKey, points), '−', fixedTerm(1), ')', '×',
            coefficient(statKey, cfg.trophy.masteryMaxBonusPercent / cfg.trophy.masteryRange, percent)]),
        part('strength', result.weaponMasteryTrophyStrengthBonus, [input('strength', strength), '*', token('strength', cfg.trophy.strengthMaxPercent / cfg.trophy.strengthCap)], percent, points > 0),
      ]);
      break;
    }
  }
  return calculations;
}
