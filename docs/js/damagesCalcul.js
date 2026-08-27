import { EffectMessage } from './attackEffectMecanics.js'; 
import { animationProjectile, animateDodge, animateIndestructibility, animateEsoterism, animateAstrality, animateAmbidextry, animationMelee,animateMysticism, animateOccultism } from './entitesAnimation.js'; 
import { entites, BASE_MAX_LEVEL, WILL_MAX_BONUS, maxLevel, generateUniqueID, entitesNestUp, enrichEntityStats, calculateVitalityBonus, calculateVelocityReduction, calculateDodgePercent, calculatePrecisionPercent, calculateIndestructibilityPercent, calculateAmbidextryPercent, calculateEsoterismPercent, calculateAstralityPercent, calculateRobustnessBonus, getBloodThirstyPercent, calculateHastePercent, calculatePenetrationPercent, calculateCritChancePercent, calculateResiliencePercent,calculateLvlMaxBonus, calculateTranscendenceExtraLife, BaseDayHpRegen, calculateWeaponMasteryCharge, getMovementWeightConfig, getMovementWeightMalus } from './entites.js';
import { applyDamage } from './entityAttributs.js'; 
import { stats } from './statsData.js'; 
import { getAttackResolutionFlags, normArr } from './attackResolution.js';
import { damageImpact } from "./entitesAnimation.js";
import { battleLogs } from './battleLogs.js';

export const ATTACK_TIME_REDUC_CAP = 95;
const capAttackTimeReducDisplay = (value) => {
  const raw = Math.max(0, Number(value) || 0);
  const capped = Math.min(ATTACK_TIME_REDUC_CAP, raw);

  return {
    raw,
    value: round1(capped),
    isCapped: raw > ATTACK_TIME_REDUC_CAP
  };
};

const formatCapSuffix = (capInfo) =>
  capInfo?.isCapped ? ` <span class="neutral">(max)</span>` : "";
function getByPath(obj, path) {
  return String(path).split(".").reduce((acc, k) => acc?.[k], obj);
}

export function getSafe(entite, path, fallback = 0) {
  return (
    getByPath(entite?.modifierStats?.preview?.total, path) ??
    getByPath(entite?.stats, path) ??
    getByPath(entite?.baseStats, path) ??
    fallback
  );
}
export function entityBattleBooste(entite, {
  stat,
  value = 0,
  source = "unknown",
  mode = "flat",
  durationMs = null,
  stackable = true,
} = {}) {
  if (!entite || !stat) {
    return {
      applied: false,
      remove: () => {},
    };
  }

  const boostValue = Number(value) || 0;
  const boostId = `${source}_${stat}_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  entite.battleBoosts = entite.battleBoosts || {};

  if (!entite.battleBoosts[stat]) {
    entite.battleBoosts[stat] = [];
  }

  if (!stackable) {
    entite.battleBoosts[stat]
      .filter(boost => boost.source === source)
      .forEach(boost => {
        if (typeof boost.remove === "function") boost.remove();
      });

    entite.battleBoosts[stat] = entite.battleBoosts[stat]
      .filter(boost => boost.source !== source);
  }

  const boost = {
    id: boostId,
    stat,
    value: boostValue,
    source,
    mode,
    createdAt: Date.now(),
    timeout: null,
    remove: null,
  };

  const removeBoost = () => {
    if (!entite.battleBoosts?.[stat]) return;

    if (boost.timeout) {
      clearTimeout(boost.timeout);
      boost.timeout = null;
    }

    entite.battleBoosts[stat] = entite.battleBoosts[stat]
      .filter(activeBoost => activeBoost.id !== boostId);

    if (entite.battleBoosts[stat].length === 0) {
      delete entite.battleBoosts[stat];
    }

    console.log(
      `📉 Battle boost retiré : ${entite.name} | ${stat} ${boostValue >= 0 ? "+" : ""}${boostValue} | source=${source}`
    );
  };

  boost.remove = removeBoost;

  entite.battleBoosts[stat].push(boost);

  if (durationMs !== null) {
    boost.timeout = setTimeout(removeBoost, Math.max(0, Number(durationMs) || 0));
  }

  console.log(
    `📈 Battle boost appliqué : ${entite.name} | ${stat} ${boostValue >= 0 ? "+" : ""}${boostValue} | source=${source}`
  );

  return {
    applied: true,
    id: boostId,
    stat,
    value: boostValue,
    source,
    mode,
    remove: removeBoost,
  };
}
export function getEntityBattleBoostValue(entite, stat, mode = "flat") {
  if (!entite?.battleBoosts?.[stat]) return 0;

  return entite.battleBoosts[stat]
    .filter(boost => boost.mode === mode)
    .reduce((total, boost) => total + (Number(boost.value) || 0), 0);
}

export function getWillBonusUI(lvlMaxBonus) {
  const bonus = Number(lvlMaxBonus) || 0;

  return {
    lvlMaxBonusAbs: Math.abs(bonus),                 // jamais de "-" ici
    lvlMaxBonusOp: bonus < 0 ? "-" : "+",            // signe affiché
    lvlMaxBonusOpClass: bonus < 0 ? "less" : "plus", // classe du signe
  };
}

export function calculateStatsDisplay(statKey, entite, statValue) {
    let result = {
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
bloodFuryExecutionChancePower: 0,
bloodFuryExecutionChanceStrength: 0,

bloodFuryExecutionDamageTotal: 0,
bloodFuryExecutionDamagePercent: 0,
bloodFuryExecutionDamagePhysical: 0,
bloodFuryExecutionDamageStrengthRatio: 0,

bloodFuryTargetThresholdTotal: 0,
bloodFuryTargetThresholdBase: 0,
bloodFuryTargetThresholdStrength: 0,

bloodThirstyTotal: 0,
        physicPenBonus: 0,
        magicPenBonus: 0,
		magicalBaseValue: 0,
		magicalHypercognitionBonus: 0,
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
        critPrecisionBonus: 0,
		resilienceBonus: 0,
		hypercognitionBonus :0,
		will :0,
		transcendenceExBonus :0,
		transcendenceConsoProtectionPercent: 0,
		extraLifeDisplay: null, 
		extraLifeCurrent: 0,  
		extraLifeMax: 0,    
		calculateRangeRatioBase: 0,
		rangeAgiRatioBonus: 0,
		rangePrecisionRatioBonus: 0,
		calculateRangeRatioTotal: 0,
		meleeExecBaseBonus: null,
		meleeExecHasteReduc: null,
		meleeExecStrengthBonus: null,
		meleeExecTotalReduc: null,
		piercingRecupBaseBonus: null,
		piercingRecupHasteReduc: null,
		piercingRecupAgiBonus: null,
		piercingRecupTotalReduc: null,	
		intellectPercantBonus: null,
		intellectBonus: 0,
		intellectTotalBonus: 0,
		intellectMagicalPower: 0,
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
		weaponMasteryTrophyChance: 0,
		weaponMasteryTrophyWeaponMasteryBonus: 0,
		weaponMasteryTrophyStrengthBonus: 0,
		chargeEquipmentSlots: 0,
        helpContent: "",
		ambianceContent: "",
    };

const safe = (path, fallback = 0) => getSafe(entite, path, fallback);
 // === HP ===
 const getMaxHP = () => {
  const hpMax = safe("HP.max", null);
  if (hpMax != null) return toNumber(hpMax, 0);
  return toNumber(safe("maxHP", 0), 0);
};
if (statKey === "HP") {
  const hp = entite?.modifierStats?.preview?.total?.HP ?? entite?.stats?.HP;
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
}

// === Transcendence ===
if (statKey === "transcendence") {
  const value = statValue ?? safe("transcendence");
  result.transcendenceExBonus = calculateTranscendenceExtraLife(value);
  result.transcendenceConsoProtectionBase = transcendenceConsoProtection(value);
  result.transcendenceConsoIntelBonus = transcendenceConsoIntel(entite);
  result.transcendenceConsoProtectionPercent = calculateTranscendenceConsoProtectionTotal(entite);
}
// === Résistances ===
if (["physicalResistance", "magicalResistance"].includes(statKey)) {
  const value = Number(statValue ?? safe(statKey, 0)) || 0;
  result.reductionPercent = calculateResistanceReductionPercent(value);
  result.displayValue = result.reductionPercent; // cohérent UI
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
    result.armorBonus = calculateRobustnessBonus(value);
}
// === Weapon Mastery ===
if (statKey === "weaponMastery") {
  const value = Number(statValue ?? safe("weaponMastery", 0)) || 0;

  result.weaponMasteryChargeBrutRatioBonus = calculateWeaponMasteryCharge(entite, value);
  result.weaponMasteryChargeStrengthRatioBonus = weaponMasteryChargeStrenghtRatioBonus(entite);
  result.weaponMasteryChargeBonus = calculateWeaponMasteryTotalChargeBonus(entite, value);

  result.weaponOrfevreWeaponMastery = calculateWeaponOrfevreWeaponMastery(entite, value);
  result.weaponOrfevreStrength = calculateWeaponOrfevreStrength(entite);
  result.weaponOrfevreBonus = calculateWeaponOrfevreBonus(entite);
  result.weaponMasteryTrophyChance = calculateWeaponMasteryTotalTrophyChance(entite, value);
  result.weaponMasteryTrophyWeaponMasteryBonus = calculateWeaponMasteryTrophyChance(entite, value);
result.weaponMasteryTrophyStrengthBonus = calculateWeaponMasteryTrophyStrengthBonus(entite);
}

// === Orfèvre armurier ===
if (statKey === "weaponOrfevre") {
  const value = Number(statValue ?? safe("weaponOrfevre") ?? 0);

  result.weaponOrfevreChance = value;
  result.weaponOrfevreBase = Number(entite?.baseStats?.weaponOrfevre || 0);

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
}

// === Velocity ===
const vel = Number(safe("velocity", 0)) || 0;
const baseSpeedMs = Number(entite?.baseStats?.speed ?? safe("baseStats.speed", safe("speed", 0))) || 0;
if (statKey === "velocity") {
  const v = vel;
  result.displayValue = v;
  if (baseSpeedMs > 0 && v > 0) {
    const { percentage, adjustedSpeed } = calculateVelocityReduction(v, baseSpeedMs);
    result.velocityReductionPercent = Number((percentage ?? 0).toFixed(2));
    result.velocityAdjustedSpeedMs = adjustedSpeed;
  } else {
    result.velocityReductionPercent = 0;
    result.velocityAdjustedSpeedMs = baseSpeedMs;
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
  result.dodgeBonus = calculateDodgePercent(value);
  result.agiDodgeBonus = value > 0 ? agiDodgeRatioBonus(entite) : 0; // clé: 0 si dodge=0
  result.calculateTotalDodgeBonus = calculateTotalDodgeBonus(entite);
}

// === Precision ===
if (statKey === "precision") {
    const value = statValue ?? safe("precision");
    result.precisionBonus = calculatePrecisionPercent(value);
	  result.critPrecisionBonus = calculateCritPrecisionBonus(entite) ?? 0;
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
  const value = statValue ?? safe("indestructibility");

  result.indestructibilityBonus = calculateIndestructibilityPercentFromEntity(entite);
  result.indestructibilityStrengthReduction = caluclateIndestructibilityStrengthReduction(entite);
  result.indestructibilityReduction = caluclateIndestructibilityReduction(entite);
  result.indestructibilityReductionTotal = caluclateIndestructibilityReductionTotal(entite);

  result.hpBattleRegenBase = calculateHpBattleRegenBase(entite);
  result.hpBattleRegenStrengthRatio = calculateHpBattleRegenStrengthRatio(entite);
  result.hpBattleRegenIndestructibilityRatio = calculateHpBattleRegenIndestructibilityRatio(entite);
  result.hpBattleRegenPercent = calculateHpBattleRegenPercent(entite);
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
  const points = Number(statValue ?? safe("esoterism")) || 0;

  // A) Chance de proc (dépend des points d'ésotérisme)
  result.esoterismBonus = calculateEsoterismPercent(entite, points); 
  result.esoterismBaseReduction = calculateEsoterismBaseReduction(); 
  result.esoterismAgiReduction = calculateEsoterismAgiRatio(entite); 
  result.esoterismTotalReduction = calculateEsoterismtotalReduction(entite); 
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
  const hyperco = Number(getSafe(entite, "hypercognition", 0)) || 0;

  const base = Number(statValue ?? safe("magicalDamage", 0)) || 0;
  const bonus = hyperco > 0
    ? Number(calculateHypercognitionBonus(entite) ?? 0) || 0
    : 0;

  const total = Math.round(base + bonus);

  result.magicalBaseValue = base;
  result.magicalHypercognitionBonus = bonus;
  result.calculateMagicalTotalValue = total;
  result.displayValue = total;

  if (hyperco > 0 && bonus > 0) {
    result.totalMagicalDamageHelp = `<div class="picto-stat magicalDamage"></div><span class="magical">${total}</span>
    ( <div class="picto-stat magicalDamage"></div> <span class="magical">${base}</span> + <div class="picto-stat hypercognition"></div><span class="hypercognition">${bonus}</span>)`;
  } else {
    result.totalMagicalDamageHelp = `<div class="picto-stat magicalDamage"></div><span class="magical">${base}</span>`;
  }
}
// === Hypercognition ===
if (statKey === "hypercognition") {
    const value = statValue ?? safe("hypercognition", 0);
    result.hypercognitionValue = value; 
    result.hypercognitionRatio = calculateHypercognitionRatio(value);
    result.hypercognitionIntel = calculateIntelligence(entite);
    result.hypercognitionBonus = calculateHypercognitionBonus(entite);
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
  result.hasteIntelRatio = calculateHasteIntelRatio(entite);
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
    Number(statValue?.reduc?.meleeExecBaseBonus ?? calculateMeleeExecBonus(entite)) || 0;

  result.meleeExecStrengthBonus =
    Number(
      statValue?.reduc?.meleeExecStrengthBonus ??
      calculateExecStrengthRatio(entite?.stats?.strength || entite?.stats?.strenght || 0)
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
if (statKey === "astrality") {
    const value = statValue ?? safe("astrality");
    result.astralityBonus = calculateAstralityPercent(value);
	result.intelAstralityBonus = calculateIntelAstralityRatio(entite);
	result.astralityTotal = calculateAstralityTotal(entite);
}
// === Resilience ===
if (statKey === "resilience") {
    const value = statValue ?? safe("resilience", 0);
    const strength = safe("strength", 0);
    const intelligence = safe("intelligence", 0);
    result.resilienceBonus = calculateResiliencePercent(value);
    result.resilienceCritBonus = result.resilienceBonus;
    result.resiStrengthCritBonus = calculateResilienceStrengthCritBonus(entite);
    result.resilienceCritTotalBonus = calculateResilienceCritTotalBonus(entite);
    result.resilienceAlteBonus = calculateResilienceAlterationBonus(entite);
    result.resiIntelCritBonus = calculateResilienceIntelligenceAlterBonus(entite);
    result.resilienceAlteTotalBonus = calculateResilienceAlterationTotalBonus(entite);
    result.resilienceCancelBonus = calculateResilienceCancelBonus(entite);
	result.resiAgiCancelBonus = calculateResiAgiCancelBonus(entite);
	result.resilienceTotalCancelBonus = calculateResilienceTotalCancelBonus(entite);
}
// === Blood Fury ===
if (statKey === "bloodFury") {
    const value = statValue ?? safe("bloodFury");

    result.bloodFuryBfRatioBonus = calculateBloodFuryBFtRatio(value);
    result.bloodFurySRatioBonus = calculateBloodFuryStrengthRatio(safe("strength"));
    result.bloodFuryExecutionBonus = calculateBloodFuryExecutionPercent(entite);

    result.bloodFuryExecSRatioBonus = calculateBloodFuryExecStrengthRatio(safe("strength"));
    result.bloodFuryExecChanceBonus = calculateBloodFuryExecChanceBonus(safe("strength"));
    result.bloodFuryExecSRatio = calculateBloodFuryExecutionSRatio(result.bloodFuryExecSRatioBonus ?? 0);
    result.bloodFuryExecDamage = calculateExecutionDamage(entite);

    result.bloodFuryBloodThirstyFlatBonus = calculateBloodThirstyFlat();
    result.bloodFuryBloodThirstyBfRatioBonus = calculateBloodThirstyBFRatio(value);
    result.bloodFuryBloodThirstyStrengthRatioBonus = calculateBloodThirstyStrengthRatio(safe("strength"));

    result.bloodFuryBloodThirstyBonus =
        result.bloodFuryBloodThirstyFlatBonus +
        result.bloodFuryBloodThirstyBfRatioBonus +
        result.bloodFuryBloodThirstyStrengthRatioBonus;
}
if (statKey === "bloodFuryExecutionChance") {
  const bloodFury = Math.max(0, Number(safe("bloodFury", 0)) || 0);
  const strength = Math.max(0, Number(safe("strength", 0)) || 0);

  result.bloodFuryExecutionChancePower =
    bloodFury > 0 ? calculateBloodFuryBFtRatio(bloodFury) : 0;

  result.bloodFuryExecutionChanceStrength =
    bloodFury > 0 ? calculateBloodFuryStrengthRatio(strength) : 0;

  result.bloodFuryExecutionChanceTotal =
    calculateBloodFuryExecutionPercent(entite);
}

if (statKey === "bloodFuryExecutionDamage") {
  const bloodFury = Math.max(0, Number(safe("bloodFury", 0)) || 0);
  const strength = Math.max(0, Number(safe("strength", 0)) || 0);
  const physicalDamage = Math.max(0, Number(safe("physicalDamage", 0)) || 0);

  const strengthRatio =
    bloodFury > 0 ? calculateBloodFuryExecStrengthRatio(strength) : 0;

  const executionPercent =
    bloodFury > 0 ? calculateBloodFuryExecutionSRatio(strengthRatio) : 0;

  result.bloodFuryExecutionDamageStrengthRatio = strengthRatio;
  result.bloodFuryExecutionDamagePercent = executionPercent;
  result.bloodFuryExecutionDamagePhysical = physicalDamage;
  result.bloodFuryExecutionDamageTotal = calculateExecutionDamage(entite);
}

if (statKey === "bloodFuryTargetThreshold") {
  const strength = Math.max(
    0,
    Number(safe("strength", 0)) || 0
  );

  result.bloodFuryTargetThresholdTotal =
    calculateBloodFuryExecChanceBonus(strength);

  result.bloodFuryTargetThresholdBase =
    result.bloodFuryTargetThresholdTotal;

  result.bloodFuryTargetThresholdStrength = 0;
}
if (statKey === "bloodThirsty") {
  const value = Math.max(
    0,
    Number(statValue ?? safe("bloodThirsty", 0)) || 0
  );

  result.bloodThirstyValue = value;
  result.bloodThirstyLifestealBonus = getBloodThirstyPercent(value);
  result.bloodThirstyTotal = result.bloodThirstyLifestealBonus;
}
// === Ambidextrie ===
if (statKey === "ambidextry") {
    const value = statValue ?? safe("ambidextry");
    result.ambidextryBonus = calculateAmbidextryPercent(value);
    result.ambidextryProcBonus = calculateAmbidextryProcBonus(entite) ?? 0;
    result.ambidextryAgiChance = calculateAmbidextryAgiChance(entite) ?? 0;
    result.ambidextryTotalChance = calculateAmbidextryTotalChance(entite) ?? 0;
    result.ambidextryRatioBonus = calculateAmbidextryRatioBonus(entite) ?? 0;
    result.ambidextryAgiRatioBonus = calculateAmbidextryAgiRatioBonus(entite) ?? 0;
    result.ambidextryDamageBonus = calculateAmbidextryDamageBonus(entite) ?? 0;
}
// === Coups critiques ===
// === PUISSANCE CRITIQUE / UMBRA ===
if (statKey === "criticalPower") {
  const value = Math.max(0, Number(statValue ?? safe("criticalPower", 0)) || 0);

  // =========================
  // APPORT CHANCE DE L'UMBRA
  // =========================
  result.critChanceBonus = value > 0 ? Number(calculateCritChancePercent(value)) || 0 : 0;
  result.critAgiChanceBonus = value > 0 ? Number(calculateCritAgiChanceBonus(entite)) || 0 : 0;
  result.critPowerChanceContribution = round1(result.critChanceBonus + result.critAgiChanceBonus);

  // Total réel : Umbra + criticalChance brut
  result.critTotalChance = Number(calculateCritTotalChance(entite)) || 0;

  // =========================
  // APPORT DÉGÂTS DE L'UMBRA
  // =========================
  result.critPrecisionBonus = value > 0 ? Number(calculateCritPrecisionBonus(entite)) || 0 : 0;
  result.critRatioBonus = value > 0 ? Number(calculateCritRatioBonus(entite, value)) || 0 : 0;
  result.critAgiRatioBonus = value > 0 ? Number(calculateCritAgiRatioBonus(entite)) || 0 : 0;
  result.critPowerDamageContribution = round1(result.critPrecisionBonus + result.critRatioBonus + result.critAgiRatioBonus);

  // Total réel : 50 natif + Umbra + criticalDamage brut
  result.critDamageBonus = Number(calculateCritDamageBonus(entite)) || 0;
}
// =========================
// CHANCE CRITIQUE TOTALE
// =========================
if (statKey === "criticalChance") {
  const criticalPowerValue = Math.max(0, Number(safe("criticalPower", 0)) || 0);
  const flat = Math.max(0, Number(safe("criticalChance", 0)) || 0);
  const fromPower = criticalPowerValue > 0 ? round1(calculateCritChancePercent(criticalPowerValue) + calculateCritAgiChanceBonus(entite)) : 0;
  result.criticalChanceFlat = round1(flat);
  result.criticalChanceFromPower = round1(fromPower);
  result.criticalChanceTotal = round1(flat + fromPower);
}

// =========================
// DÉGÂTS CRITIQUES TOTAUX
// =========================
if (statKey === "criticalDamage") {
  const criticalPowerValue = Math.max(0, Number(safe("criticalPower", 0)) || 0);
  const flat = Math.max(0, Number(safe("criticalDamage", 0)) || 0);
  const native = 50;
  const fromPower = criticalPowerValue > 0 ? round1(calculateCritPrecisionBonus(entite) + calculateCritRatioBonus(entite, criticalPowerValue) + calculateCritAgiRatioBonus(entite)) : 0;
  result.criticalDamageNative = native;
  result.criticalDamageFlat = round1(flat);
  result.criticalDamageFromPower = round1(fromPower);
  result.criticalDamageTotal = round1(native + flat + fromPower);
}
// === Volonté ===
if (statKey === "will") {
  const value = statValue ?? safe("will", 0);
  result.willAwakeBonus = calculatewillAwakeBonus(value);
  result.lvlMaxBonus  = calculateLvlMaxBonus(value);          
  result.lvlMaxBase   = calculateLvlMaxBaseEntite(entite);
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
  const shift = entite?.stats?.shift ?? {};
  const baseShift = entite?.baseStats?.shift ?? {};
  result.shiftCurrent = Number(shift.current || 0);
  result.shiftMax = Number(shift.max || 0);
  result.shiftHasDefaultBase = shift?.baseDefault === true;
  result.shiftBaseMax = result.shiftHasDefaultBase ? 1 : Number(baseShift?.max || 0);
  result.shiftMovementMaxBonus = Number(result.movementMaxCharges || 0);
  result.shiftOtherMaxBonus = Math.max( 0, result.shiftMax - result.shiftBaseMax - result.shiftMovementMaxBonus );
  result.shiftBaseCurrent = Math.min(result.shiftCurrent, result.shiftBaseMax);
  result.shiftMovementCurrentBonus = Math.min( result.shiftMovementMaxBonus, Math.max(0, result.shiftCurrent - result.shiftBaseCurrent) );
  result.shiftOtherCurrentBonus = Math.max( 0, result.shiftCurrent - result.shiftBaseCurrent - result.shiftMovementCurrentBonus );
  const weight = getMovementWeightMalus(entite);

result.shiftWeightScore = weight.score;
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
  result.calculateRangeRatioBase = basecalculateRangeRatio();
  result.rangeAgiRatioBonus = rangeAgiRatio(entite);
  result.rangePrecisionRatioBonus = rangePrecisionRatio(entite);
  result.calculateRangeRatioTotal = calculateRangeRatio(entite);

  // // Adresse projectile (attaques physiques à distance)
  result.baseRangeAccuracy = baseRangeAccuracy();
  result.agiRangeAccuracy = agiRangeAccuracy(entite);
  result.precisionRangeAccuracy = precisionRangeAccuracy(entite);
  result.rangeAccuracyTotal = calculateRangeAccuracy(entite);

  // Incantation pétée (attaques magiques à distance)
  result.baseBrokenSpellChance = baseBrokenSpellChance();
  result.intelBrokenSpellChanceReduc = intelBrokenSpellChance(entite);
  result.brokenSpellChanceTotal = calculateBrokenSpellChance(entite);

  result.baseBrokenSpellDamage = baseBrokenSpellDamage();
  result.intelBrokenSpellBaseDamageReduc = intelBrokenSpellBaseDamage(entite);
  result.magicalBrokenSpellDamageBonus = magicalBrokenSpellDamage(entite);
  result.brokenSpellDamageTotal = calculateBrokenSpellDamage(entite);

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
  result.meleeExecBaseBonus      = calculateMeleeExecBonus(entite, null);
  result.meleeExecHasteReduc     = calculateHasteExecReduc(entite);
  result.meleeExecStrengthBonus  = calculateExecStrengthRatio(safe("strength", 0));
  result.meleeExecTotalReduc     = totalMeleeExecReduction(entite, null);
}

// --- ADDITIF SI NATURE piercing (recup reduc) ---
if (isPiercingStat) {
  result.piercingRecupBaseBonus  = calculatePiercingRecupBonus(entite, null);
  result.piercingRecupHasteReduc = calculateHasteRecupReduc(entite); // 0% si haste=0
  result.piercingRecupAgiBonus   = calculateRecupAgilityRatio(safe("agility", 0));
  result.piercingRecupTotalReduc = totalPiercingRecupReductionWithAgi(entite, null);
}
if (statKey === "rangeAttackPhysical") {
	  result.calculateRangeRatioBase = basecalculateRangeRatio();
  result.rangeAgiRatioBonus = rangeAgiRatio(entite);
  result.rangePrecisionRatioBonus = rangePrecisionRatio(entite);
  result.calculateRangeRatioTotal = calculateRangeRatio(entite);
	result.ProjectilSpeedPercent = calculateProjectilSpeedPercent(entite);
  result.baseRangeAccuracy = baseRangeAccuracy();
  result.agiRangeAccuracy = agiRangeAccuracy(entite);
  result.precisionRangeAccuracy = precisionRangeAccuracy(entite);
  result.rangeAccuracyTotal = calculateRangeAccuracy(entite);
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
  result.baseRangeAccuracy = baseRangeAccuracy();
  result.agiRangeAccuracy = agiRangeAccuracy(entite);
  result.precisionRangeAccuracy = precisionRangeAccuracy(entite);
  result.rangeAccuracyTotal = calculateRangeAccuracy(entite);
  result.rangeHybridalRangeRatio = calculateHybridalRangeRatio(entite);
  result.rangeHybridBasePenalty = baseHybridRangePenalty();                 // = basecalculateRangeRatio() * 0.5
result.rangeHybridAgiPenalty = hybridAgiRangePenalty(entite);             // = rangeAgiRatio(entite) * 0.5
result.rangeHybridPrecisionPenalty = hybridPrecisionRangePenalty(entite); // = rangePrecisionRatio(entite) * 0.5
result.rangeHybridalRangeRatio = calculateHybridalRangeRatio(entite);     // 100 - totalPenalty
result.rangeHybridalRangeRatio = calculateHybridalRangeRatio(entite);
   	  result.calculateRangeRatioBase = basecalculateRangeRatio();
  result.rangeAgiRatioBonus = rangeAgiRatio(entite);
  result.rangePrecisionRatioBonus = rangePrecisionRatio(entite);
  result.calculateRangeRatioTotal = calculateRangeRatio(entite);
	result.ProjectilSpeedPercent = calculateProjectilSpeedPercent(entite);
  result.baseRangeAccuracy = baseRangeAccuracy();
  result.agiRangeAccuracy = agiRangeAccuracy(entite);
  result.precisionRangeAccuracy = precisionRangeAccuracy(entite);
  result.rangeAccuracyTotal = calculateRangeAccuracy(entite);
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
// === Intellect ===
if (statKey === "intellect") {
  result.intellectPercantBonus = intellectPercantBonus(entite); // total %
  result.intellectBonus = intellectBonus(entite);               // bonus % seul
  result.intellectPMBonus = intellectPMBonus(entite);           // bonus PM
  result.intellectTotalBonus = intellectTotalBonus(entite);     // PM finale
  result.intellectMagicalPower = Number(entite?.stats?.magicalDamage || 0);
  result.displayValue = result.intellectPercantBonus;
}
if (statKey === "brutality") {
  result.brutalityPercantBonus = brutalityPercantBonus(entite);              // total %
  result.brutalityBonus = brutalityBonus(entite);                            // bonus % seul
  result.brutalityPhysicalPowerBonus = brutalityPhysicalPowerBonus(entite);  // bonus dégâts physiques
  result.brutalityTotalBonus = brutalityTotalBonus(entite);                  // puissance physique finale
  result.brutalityPhysicalPower = Number(entite?.stats?.physicalDamage || 0);
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
if (statKey === "piercingDamage") {
  result.hasteRecupReduc = calculateHasteRecupReduc(entite);

  result.piercingRecupBaseBonus = calculatePiercingRecupBonus(entite);
  result.piercingRecupAgiBonus = calculatePiercingRecupAgiRatio(entite);
  result.piercingRecupTotalReduc = totalPiercingRecupReductionWithAgi(entite);

  result.displayValue = result.piercingRecupTotalReduc;
}
// SI VALEUR ABSENTE ON AFFICHE RIEN
const hasValue = (value) => {
  return value !== undefined && value !== null && !Number.isNaN(Number(value));
};
const hasPositiveValue = (value) => {
  return hasValue(value) && Number(value) > 0;
};

const formatPercent = (value) => {
  const number = Number(value) || 0;
  return Number.isInteger(number) ? `${number}%` : `${number.toFixed(1)}%`;
};

const formatSeconds = (ms) => {
  const number = Number(ms) || 0;
  return `${(number / 1000).toFixed(2)} scd`;
};

const percentToMs = (baseMs, percent) => {
  return Math.round((Number(baseMs) || 0) * ((Number(percent) || 0) / 100));
};

const hasStatPoints = (statName) => {
  return Number(safe(statName, 0)) > 0;
};
const bonusPart = (condition, html) => condition ? html : "";

const joinBonusParts = (parts) => {
  const filtered = parts.filter(Boolean);
  return filtered.length ? filtered.join(" + ") : "";
};
// VARIABLES CONDITIONNELLES
// VARIABLES CONDITIONNELLES TIMING

const getTimingBaseMs = () => Number(statValue?.baseMs || 0);
const getTimingEffectiveMs = () => Number(statValue?.effectiveMs || 0);
const hasActiveHaste = hasStatPoints("haste");
// =====================
// SPEED MODIFICATION
// =====================  
const formatMaxRawPercent = (rawValue, className = "less-bonus") => {
  const raw = Math.max(0, Number(rawValue) || 0);

  return raw > ATTACK_TIME_REDUC_CAP
    ? `<span class="cap-max">max.</span>(<span class="${className}">-${formatPercent(raw)}</span>)`
    : `<span class="${className}">-${formatPercent(raw)}</span>`;
};

const buildAutonomousHasteDetailLine = ({
  statClass,
  total,
  base,
  haste,
  other,
  suffix = "%",
  sign = "",
  cap = ATTACK_TIME_REDUC_CAP
}) => {
  const capInfo = capAttackTimeReducDisplay(total);
  const totalDisplay = capInfo.value;

  const baseInfo = capAttackTimeReducDisplay(base);
  const hasteInfo = capAttackTimeReducDisplay(haste);
  const otherInfo = capAttackTimeReducDisplay(other);

  const parts = [
    bonusPart(
      hasPositiveValue(baseInfo.raw),
      `<div class="picto-stat ${statClass}"></div><span class="neutral">${baseInfo.value} ${suffix}</span>${formatCapSuffix(baseInfo)} base`
    ),

    bonusPart(
      hasPositiveValue(otherInfo.raw),
      `<div class="picto-stat ${statClass}"></div><span class="${statClass}">${otherInfo.value} ${suffix}</span>${formatCapSuffix(otherInfo)} équipement / autres`
    ),

    bonusPart(
      hasPositiveValue(hasteInfo.raw),
      `<div class="picto-stat haste"></div><span class="haste">${hasteInfo.value} ${suffix}</span>${formatCapSuffix(hasteInfo)} Hâte`
    )
  ].filter(Boolean);

  return parts.length
    ? `<div class="picto-stat ${statClass}"></div><span class="${statClass}">${sign}${totalDisplay} ${suffix}</span>${formatCapSuffix(capInfo)}
       ( ${parts.join(` <span class="calcul-methode more">+</span> `)} )`
    : "";
};
const attackCooldownReducDetailLine = buildAutonomousHasteDetailLine({
  statClass: "cooldownTime",
  total: result.attackCooldownReducTotal,
  base: result.attackCooldownReducBase,
  haste: result.attackCooldownReducHaste,
  other: result.attackCooldownReducOther,
  sign: "-",
  cap: ATTACK_TIME_REDUC_CAP,
});

const attackPreparationReducDetailLine = buildAutonomousHasteDetailLine({
  statClass: "preparationTime",
  total: result.attackPreparationReducTotal,
  base: result.attackPreparationReducBase,
  haste: result.attackPreparationReducHaste,
  other: result.attackPreparationReducOther,
  sign: "-",
  cap: ATTACK_TIME_REDUC_CAP,
});

const attackExecutionReducDetailLine = buildAutonomousHasteDetailLine({
  statClass: "executionTime",
  total: result.attackExecutionReducTotal,
  base: result.attackExecutionReducBase,
  haste: result.attackExecutionReducHaste,
  other: result.attackExecutionReducOther,
  sign: "-",
  cap: ATTACK_TIME_REDUC_CAP,
});

const attackRecoveryReducDetailLine = buildAutonomousHasteDetailLine({
  statClass: "recuperationTime",
  total: result.attackRecoveryReducTotal,
  base: result.attackRecoveryReducBase,
  haste: result.attackRecoveryReducHaste,
  other: result.attackRecoveryReducOther,
  sign: "-",
  cap: ATTACK_TIME_REDUC_CAP,
});

const attackProjectileSpeedDetailLine = buildAutonomousHasteDetailLine({
  statClass: "projectileTime",
  total: result.attackProjectileSpeedTotal,
  base: result.attackProjectileSpeedBase,
  haste: result.attackProjectileSpeedHaste,
  other: result.attackProjectileSpeedOther,
  sign: "+",
  cap: ATTACK_TIME_REDUC_CAP,
});

// =====================
// COOLDOWN
// =====================
const cooldownBaseMs = getTimingBaseMs();
const cooldownEffectiveMs = getTimingEffectiveMs();

const cooldownBaseDirectRaw = Math.max(0, Number(result.attackCooldownReducBase || 0));
const cooldownHasteRaw = Math.max(0, Number(result.attackCooldownReducHaste || 0));
const cooldownOtherRaw = Math.max(0, Number(result.attackCooldownReducOther || 0));

const cooldownRawTotalReducPercent =
  cooldownBaseDirectRaw +
  cooldownOtherRaw +
  cooldownHasteRaw;

const cooldownTotalReducPercent = clampPercent(cooldownRawTotalReducPercent);
const cooldownIsCapped = cooldownRawTotalReducPercent > ATTACK_TIME_REDUC_CAP;

const cooldownTotalReducMs = percentToMs(cooldownBaseMs, cooldownTotalReducPercent);

const cooldownDetailLines = [
  bonusPart(
    hasPositiveValue(cooldownBaseDirectRaw),
    `• Bonus <div class="picto-stat cooldownTime"></div><span class="cooldownTime">entité</span> :
    ${formatMaxRawPercent(cooldownBaseDirectRaw)}.<br>`
  ),

  bonusPart(
    hasPositiveValue(cooldownOtherRaw),
    `• Bonus <div class="picto-stat cooldownTime"></div><span class="cooldownTime">équipement / autres</span> :
    ${formatMaxRawPercent(cooldownOtherRaw)}.<br>`
  ),

  bonusPart(
    hasPositiveValue(cooldownHasteRaw),
    `• Bonus <div class="picto-stat haste"></div><span class="haste">Hâte</span> :
    <span class="less-bonus">-${formatPercent(cooldownHasteRaw)}</span>
    ( <span class="less-bonus">-${formatSeconds(percentToMs(cooldownBaseMs, cooldownHasteRaw))}</span> )<br>`
  )
].filter(Boolean).join("");

const cooldownTimeDetailHelper = `<i>Temps nécessaire avant que l'attaque puisse être relancée.</i><br><br>
Durée de cooldown : <div class="picto-stat cooldownTime"></div><span class="cooldownTime">${formatSeconds(cooldownEffectiveMs)}</span><br><br>${
  hasPositiveValue(cooldownTotalReducPercent)
    ? `base <span class="neutral">${formatSeconds(cooldownBaseMs)}</span> 
- <span class="less-bonus">${formatPercent(cooldownTotalReducPercent)}</span>${
        cooldownIsCapped ? ` <span class="cap-max">max.</span>` : ""
      } ( <span class="less-bonus">${formatSeconds(cooldownTotalReducMs)}</span> )<br><br>`
    : ""
}${
  cooldownDetailLines ? `Détail :<br>${cooldownDetailLines}` : ""
}`;
// =====================
// PRÉPARATION
// =====================
const preparationBaseMs = getTimingBaseMs();
const preparationEffectiveMs = getTimingEffectiveMs();

const preparationBaseDirectRaw = Math.max(0, Number(result.attackPreparationReducBase || 0));
const preparationHasteRaw = Math.max(0, Number(result.attackPreparationReducHaste || 0));
const preparationOtherRaw = Math.max(0, Number(result.attackPreparationReducOther || 0));

const preparationRawTotalReducPercent =
  preparationBaseDirectRaw +
  preparationOtherRaw +
  preparationHasteRaw;

const preparationTotalReducPercent = clampPercent(preparationRawTotalReducPercent);
const preparationIsCapped = preparationRawTotalReducPercent > ATTACK_TIME_REDUC_CAP;

const preparationTotalReducMs = percentToMs(preparationBaseMs, preparationTotalReducPercent);

const preparationDetailLines = [
  bonusPart(
    hasPositiveValue(preparationBaseDirectRaw),
    `• Bonus <div class="picto-stat preparationTime"></div><span class="preparationTime">entité</span> :
    ${formatMaxRawPercent(preparationBaseDirectRaw)}.<br>`
  ),

  bonusPart(
    hasPositiveValue(preparationOtherRaw),
    `• Bonus <div class="picto-stat preparationTime"></div><span class="preparationTime">équipement / autres</span> :
    ${formatMaxRawPercent(preparationOtherRaw)}.<br>`
  ),

  bonusPart(
    hasPositiveValue(preparationHasteRaw),
    `• Bonus <div class="picto-stat haste"></div><span class="haste">Hâte</span> :
    <span class="less-bonus">-${formatPercent(preparationHasteRaw)}</span>
    ( <span class="less-bonus">-${formatSeconds(percentToMs(preparationBaseMs, preparationHasteRaw))}</span> )<br>`
  )
].filter(Boolean).join("");

const preparationTimeDetailHelper = `<i>Temps nécessaire avant que l'attaque soit lancée.</i><br><br>
Durée de préparation : <div class="picto-stat preparationTime"></div><span class="preparationTime">${formatSeconds(preparationEffectiveMs)}</span><br><br>${
  hasPositiveValue(preparationTotalReducPercent)
    ? `base <span class="neutral">- ${formatSeconds(preparationBaseMs)}</span> 
- <span class="less-bonus">- ${formatPercent(preparationTotalReducPercent)}</span>${
        preparationIsCapped ? ` <span class="cap-max">max.</span>` : ""
      } ( <span class="less-bonus">${formatSeconds(preparationTotalReducMs)}</span> )<br><br>`
    : ""
}${
  preparationDetailLines ? `Détail :<br>${preparationDetailLines}` : ""
}`;
// =====================
// EXÉCUTION
// =====================
const executionBaseMs = getTimingBaseMs();
const executionEffectiveMs = getTimingEffectiveMs();

const executionBaseDirectRaw = Math.max(0, Number(result.attackExecutionReducBase || 0));
const executionHasteRaw = Math.max(0, Number(result.attackExecutionReducHaste || 0));
const executionOtherRaw = Math.max(0, Number(result.attackExecutionReducOther || 0));

const executionMeleeBaseRaw = Math.max(0, Number(result.meleeExecBaseBonus || 0));
const executionStrengthRaw = Math.max(0, Number(result.meleeExecStrengthBonus || 0));

const executionRawTotalReducPercent =
  executionBaseDirectRaw +
  executionOtherRaw +
  executionHasteRaw +
  executionMeleeBaseRaw +
  executionStrengthRaw;

const executionTotalReducPercent = clampPercent(executionRawTotalReducPercent);
const executionIsCapped = executionRawTotalReducPercent > ATTACK_TIME_REDUC_CAP;

const executionTotalReducMs = percentToMs(executionBaseMs, executionTotalReducPercent);


const executionDetailLines = [
  bonusPart(
    hasPositiveValue(executionBaseDirectRaw),
    `• Bonus <div class="picto-stat executionTime"></div><span class="executionTime">entité</span> :
    ${formatMaxRawPercent(executionBaseDirectRaw)}.<br>`
  ),

  bonusPart(
    hasPositiveValue(executionOtherRaw),
    `• Bonus <div class="picto-stat executionTime"></div><span class="executionTime">équipement / autres</span> :
    ${formatMaxRawPercent(executionOtherRaw)}.<br>`
  ),

  bonusPart(
    hasPositiveValue(executionHasteRaw),
    `• Bonus <div class="picto-stat haste"></div><span class="haste">Hâte</span> :
    <span class="less-bonus">-${formatPercent(executionHasteRaw)}</span>
    ( <span class="less-bonus">-${formatSeconds(percentToMs(executionBaseMs, executionHasteRaw))}</span> )<br>`
  ),

bonusPart(
  hasPositiveValue(executionMeleeBaseRaw),
  `• Bonus <div class="picto-stat shortRange"></div><span class="shortRange">Courte portée</span> :
  <span class="less-bonus">-${formatPercent(executionMeleeBaseRaw)}</span>
  ( <span class="less-bonus">-${formatSeconds(percentToMs(executionBaseMs, executionMeleeBaseRaw))}</span> )<br>`
),

  bonusPart(
    hasPositiveValue(executionStrengthRaw),
    `• Bonus <div class="picto-stat strength"></div><span class="strength">Force</span> :
    <span class="less-bonus">-${formatPercent(executionStrengthRaw)}</span>
    ( <span class="less-bonus">-${formatSeconds(percentToMs(executionBaseMs, executionStrengthRaw))}</span> )<br>`
  )
].filter(Boolean).join("");

const executionTimeDetailHelper = `<i>Temps nécessaire pour porter l'attaque après la préparation.</i><br><br>
Durée d'exécution : <div class="picto-stat executionTime"></div><span class="executionTime">${formatSeconds(executionEffectiveMs)}</span><br><br>${
  hasPositiveValue(executionTotalReducPercent)
    ? `base <span class="neutral">${formatSeconds(executionBaseMs)}</span> 
- <span class="less-bonus">- ${formatPercent(executionTotalReducPercent)}</span>${
        executionIsCapped ? ` <span class="cap-max">max.</span>` : ""
      } ( <span class="less-bonus">${formatSeconds(executionTotalReducMs)}</span> )<br><br>`
    : ""
}${
  executionDetailLines ? `Détail :<br>${executionDetailLines}` : ""
}`;
// =====================
// VITESSE PROJECTILE
// =====================
const projectileBaseMs = getTimingBaseMs();
const projectileEffectiveMs = getTimingEffectiveMs();

const projectileTimeBaseRaw = Math.max(0, Number(result.attackProjectileSpeedBase || 0));
const projectileTimeHasteRaw = Math.max(0, Number(result.attackProjectileSpeedHaste || 0));
const projectileTimeOtherRaw = Math.max(0, Number(result.attackProjectileSpeedOther || 0));

const projectileTimeRawTotalPercent =
  projectileTimeBaseRaw +
  projectileTimeOtherRaw +
  projectileTimeHasteRaw;

const projectileTimeBonusPercent = Math.min(
  ATTACK_TIME_REDUC_CAP,
  projectileTimeRawTotalPercent
);

const projectileTimeIsCapped =
  projectileTimeRawTotalPercent > ATTACK_TIME_REDUC_CAP;

const projectileTimeReducPercent = speedBonusToReducPercent(projectileTimeBonusPercent);

const projectileTimeTotalMs = percentToMs(projectileBaseMs, projectileTimeReducPercent);

const formatMaxRawMorePercent = (rawValue) => {
  const raw = Math.max(0, Number(rawValue) || 0);

  return raw > ATTACK_TIME_REDUC_CAP
    ? `<span class="cap-max">max.</span>(<span class="more-bonus">+${formatPercent(raw)}</span>)`
    : `<span class="more-bonus">+${formatPercent(raw)}</span>`;
};

const projectileDetailLines = [
  bonusPart(
    hasPositiveValue(projectileTimeBaseRaw),
    `• Bonus <div class="picto-stat projectileTime"></div><span class="projectileTime">entité</span> :
    ${formatMaxRawMorePercent(projectileTimeBaseRaw)}.<br>`
  ),

  bonusPart(
    hasPositiveValue(projectileTimeOtherRaw),
    `• Bonus <div class="picto-stat projectileTime"></div><span class="projectileTime">équipement / autres</span> :
    ${formatMaxRawMorePercent(projectileTimeOtherRaw)}.<br>`
  ),

  bonusPart(
    hasPositiveValue(projectileTimeHasteRaw),
    `• Bonus <div class="picto-stat haste"></div><span class="haste">Hâte</span> :
    <span class="more-bonus">+${formatPercent(projectileTimeHasteRaw)}</span>
    ( <span class="less-bonus">-${formatSeconds(percentToMs(projectileBaseMs, speedBonusToReducPercent(projectileTimeHasteRaw)))}</span> )<br>`
  )
].filter(Boolean).join("");

const executionRangeTimeDetailHelper = `<i>Augmente la vitesse du projectile et réduit son temps de trajet effectif.</i><br><br>
Vitesse projectile : <div class="picto-stat projectileTime"></div><span class="projectileTime">+${formatPercent(projectileTimeBonusPercent)}</span>${
  projectileTimeIsCapped ? ` <span class="cap-max">max.</span>` : ""
}<br><br>${
  hasPositiveValue(projectileTimeBonusPercent)
    ? `base <span class="neutral">${formatSeconds(projectileBaseMs)}</span> 
- <span class="less-bonus">${formatPercent(projectileTimeReducPercent)}</span>
( <span class="less-bonus">${formatSeconds(projectileTimeTotalMs)}</span> )<br><br>`
    : ""
}${
  projectileDetailLines ? `détail :<br>${projectileDetailLines}` : ""
}`;

// =====================
// RÉCUPÉRATION
// =====================
const recoveryBaseMs = getTimingBaseMs();
const recoveryEffectiveMs = getTimingEffectiveMs();

const recoveryBaseDirectRaw = Math.max(0, Number(result.attackRecoveryReducBase || 0));
const recoveryHasteRaw = Math.max(0, Number(result.attackRecoveryReducHaste || 0));
const recoveryOtherRaw = Math.max(0, Number(result.attackRecoveryReducOther || 0));

const recoveryPiercingBaseRaw = Math.max(0, Number(result.piercingRecupBaseBonus || 0));
const recoveryPiercingAgiRaw = Math.max(0, Number(result.piercingRecupAgiBonus || 0));
const recoveryTranspiercingBaseRaw = Math.max(0, Number(result.transpiercingRecupBaseBonus || 0));
const recoveryTranspiercingAgiRaw = Math.max(0, Number(result.transpiercingRecupAgiBonus || 0));

const recoveryRawTotalReducPercent =
  recoveryBaseDirectRaw +
  recoveryOtherRaw +
  recoveryHasteRaw +
  recoveryPiercingBaseRaw +
  recoveryPiercingAgiRaw +
  recoveryTranspiercingBaseRaw +
  recoveryTranspiercingAgiRaw;

const recoveryTotalReducPercent = clampPercent(recoveryRawTotalReducPercent);
const recoveryIsCapped = recoveryRawTotalReducPercent > ATTACK_TIME_REDUC_CAP;

const recoveryTotalReducMs = percentToMs(
  recoveryBaseMs,
  recoveryTotalReducPercent
);

const recoveryTimeDetailLines = [

  bonusPart(
    hasPositiveValue(recoveryBaseDirectRaw),
    `• Bonus <div class="picto-stat recuperationTime"></div><span class="recuperationTime">entité</span> :
    ${formatMaxRawPercent(recoveryBaseDirectRaw)}.<br>`
  ),

  bonusPart(
    hasPositiveValue(recoveryOtherRaw),
    `• Bonus <div class="picto-stat recuperationTime"></div><span class="recuperationTime">équipement / autres</span> :
    ${formatMaxRawPercent(recoveryOtherRaw)}.<br>`
  ),

  bonusPart(
    hasPositiveValue(recoveryHasteRaw),
    `• Bonus <div class="picto-stat haste"></div><span class="haste">Hâte</span> :
    <span class="less-bonus">-${formatPercent(recoveryHasteRaw)}</span>
    ( <span class="less-bonus">-${formatSeconds(percentToMs(recoveryBaseMs, recoveryHasteRaw))}</span> )<br>`
  ),

  bonusPart(
    hasPositiveValue(recoveryPiercingBaseRaw),
    `• Bonus <div class="picto-stat piercingDamage"></div><span class="piercingDamage">Transperçant</span> :
    <span class="less-bonus">-${formatPercent(recoveryPiercingBaseRaw)}</span>
    ( <span class="less-bonus">-${formatSeconds(percentToMs(recoveryBaseMs, recoveryPiercingBaseRaw))}</span> )<br>`
  ),

  bonusPart(
    hasPositiveValue(recoveryPiercingAgiRaw),
    `• Bonus <div class="picto-stat agility"></div><span class="agility">Agilité</span> :
    <span class="less-bonus">-${formatPercent(recoveryPiercingAgiRaw)}</span>
    ( <span class="less-bonus">-${formatSeconds(percentToMs(recoveryBaseMs, recoveryPiercingAgiRaw))}</span> )<br>`
  ),

  bonusPart(
    hasPositiveValue(recoveryTranspiercingBaseRaw),
    `• Bonus <div class="picto-stat transpiercingDamage"></div><span class="transpiercingDamage">Ultra-transperçant</span> :
    <span class="less-bonus">-${formatPercent(recoveryTranspiercingBaseRaw)}</span>
    ( <span class="less-bonus">-${formatSeconds(percentToMs(recoveryBaseMs, recoveryTranspiercingBaseRaw))}</span> )<br>`
  ),

  bonusPart(
    hasPositiveValue(recoveryTranspiercingAgiRaw),
    `• Bonus <div class="picto-stat agility"></div><span class="agility">Agilité</span> :
    <span class="less-bonus">-${formatPercent(recoveryTranspiercingAgiRaw)}</span>
    ( <span class="less-bonus">-${formatSeconds(percentToMs(recoveryBaseMs, recoveryTranspiercingAgiRaw))}</span> )<br>`
  )

].filter(Boolean).join("");

const recoveryTimeDetailHelper = `<i>Temps nécessaire après l'exécution de l'attaque avant de pouvoir agir à nouveau.</i><br><br>

Durée de récupération : <div class="picto-stat recuperationTime"></div><span class="recuperationTime">${formatSeconds(recoveryEffectiveMs)}</span><br><br>${
hasPositiveValue(recoveryTotalReducPercent)
? `base <span class="neutral">${formatSeconds(recoveryBaseMs)}</span>
- <span class="less-bonus">${formatPercent(recoveryTotalReducPercent)}</span>${
recoveryIsCapped ? ` <span class="cap-max">max.</span>` : ""
}
( <span class="less-bonus">${formatSeconds(recoveryTotalReducMs)}</span> )<br><br>`
: ""
}${
recoveryTimeDetailLines
? `détail :<br>${recoveryTimeDetailLines}`
: ""
}`;

// COURTE PORTEE
const meleeExecParts = joinBonusParts([
  bonusPart(
    hasPositiveValue(result.meleeExecBaseBonus),
    `<div class="picto-stat meleeAttack"></div><span class="meleeAttack">${formatPercent(result.meleeExecBaseBonus)}</span> mêlée`
  ),
  bonusPart(
    hasPositiveValue(result.meleeExecStrengthBonus),
    `<div class="picto-stat strength"></div><span class="strength">${formatPercent(result.meleeExecStrengthBonus)}</span> force`
  ),
  bonusPart(
    hasPositiveValue(result.meleeExecHasteReduc),
    `<div class="picto-stat haste"></div><span class="haste">${formatPercent(result.meleeExecHasteReduc)}</span> hâte`
  )
]);

const meleeExecHelperBlock = hasPositiveValue(result.meleeExecTotalReduc) ? `
Les attaques de mêlée ont un bonus de <div class="picto-stat executionTime"></div><span class="executionTime">vitesse d'exécution</span> de <span class="neutral">${formatPercent(result.meleeExecTotalReduc)}</span>.<br>
${meleeExecParts ? `( ${meleeExecParts} )<br>` : ""}
` : "";
const piercingRecupParts = joinBonusParts([
  bonusPart(
    hasValue(result.piercingRecupAgiBonus),
    `<div class="picto-stat agility"></div><span class="agility">${result.piercingRecupAgiBonus}%</span> agilité`
  ),
  bonusPart(
    hasValue(result.piercingRecupBaseBonus),
    `<div class="picto-stat piercing"></div><span class="piercing">${result.piercingRecupBaseBonus}%</span> perçante`
  ),
  bonusPart(
    hasValue(result.piercingRecupHasteReduc),
    `<div class="picto-stat haste"></div><span class="haste">${result.piercingRecupHasteReduc}%</span> hâte`
  )
]);

const piercingRecupHelperBlock = hasValue(result.piercingRecupTotalReduc) ? `
<br>Bonus attaque perçante : <div class="picto-stat recuperationTime"></div><span class="recuperationTime">vitesse de récupération</span> de <span class="neutral">${result.piercingRecupTotalReduc}%</span>.<br>
${piercingRecupParts ? `( ${piercingRecupParts} )<br>` : ""}
` : "";
const hasMeleeExecHelper = Number(result.meleeExecTotalReduc || 0) > 0;

const recoveryHasteHelperBlock = Number(result.hasteRecupReduc || 0) > 0 ? `
<div class="picto-stat haste"></div><span class="haste">Hâte</span> réduit la récupération de <span class="haste">${result.hasteRecupReduc}%</span>.<br>
` : "";

const recoveryPiercingHelperBlock =
  result.isPiercing ? `
Bonus <div class="picto-stat piercingDamage"></div><span class="piercingDamage">perçant</span> :
<span class="neutral">-${result.piercingRecupTotalReduc}%</span>
( <span class="piercingDamage">${result.piercingRecupBaseBonus}%</span> base
+ <div class="picto-stat agility"></div><span class="agility">${result.piercingRecupAgiBonus}%</span> agilité ).<br>
` : "";
const recoveryTranspiercingHelperBlock =
  result.isTranspiercing ? `
Bonus <div class="picto-stat transpiercingDamage"></div><span class="transpiercingDamage">transperçant</span> :
<span class="neutral">-${result.transpiercingRecupTotalReduc}%</span>
( <span class="transpiercingDamage">${result.transpiercingRecupBaseBonus}%</span> base
+ <div class="picto-stat agility"></div><span class="agility">${result.transpiercingRecupAgiBonus}%</span> agilité progressive ).<br>
` : "";


// =========================
// DÉTAIL CHANCE CRITIQUE
// =========================
const criticalChanceSourceParts = joinBonusParts([
  bonusPart(
    hasPositiveValue(result.criticalChanceFlat),
    `<div class="picto-stat criticalChance"></div><span class="criticalChance">+${formatPercent(result.criticalChanceFlat)}</span> brut`
  ),

  bonusPart(
    hasPositiveValue(result.criticalChanceFromPower),
    `<div class="picto-stat criticalPower"></div><span class="criticalPower">+${formatPercent(result.criticalChanceFromPower)}</span> Puissance critique`
  )
]);

const criticalChanceDetailLine =
  criticalChanceSourceParts
    ? `( ${criticalChanceSourceParts} )`
    : "";
// =========================
// DÉTAIL DÉGÂTS CRITIQUES
// =========================
const criticalDamageSourceParts = joinBonusParts([
  bonusPart(
    hasPositiveValue(result.criticalDamageNative),
    `<span class="neutral">${formatPercent(result.criticalDamageNative)}</span>`
  ),

  bonusPart(
    hasPositiveValue(result.criticalDamageFlat),
    `<div class="picto-stat criticalDamage"></div><span class="criticalDamage">+${formatPercent(result.criticalDamageFlat)}</span> brut`
  ),

  bonusPart(
    hasPositiveValue(result.criticalDamageFromPower),
    `<div class="picto-stat criticalPower"></div><span class="criticalPower">+${formatPercent(result.criticalDamageFromPower)}</span> Puissance critique`
  )
]);

const criticalDamageDetailLine =
  criticalDamageSourceParts
    ? `( ${criticalDamageSourceParts} )`
    : "";
// =====================
// CHARGE
// ===================== 
const chargeNaturalSlots = result.chargeEquipmentSlots - result.weaponMasteryChargeBonus;

const chargeSourceHelper = result.weaponMasteryChargeBonus > 0
  ? ` ( <div class="picto-stat armorSlot"></div><span class="armorSlot">${chargeNaturalSlots}</span> + <div class="picto-stat weaponMastery"></div><span class="weaponMastery">${result.weaponMasteryChargeBonus}</span> )`
  : ` ( <div class="picto-stat armorSlot"></div><span class="armorSlot">${chargeNaturalSlots}</span> )`;
 // =====================
// ORFEVRE + LOOT
// =====================  
 const weaponOrfevreSourceParts = [
  bonusPart(
    hasPositiveValue(result.weaponOrfevreBase),
    `<div class="picto-stat weaponOrfevre"></div><span class="neutral">${result.weaponOrfevreBase} %</span> base`
  ),

  bonusPart(
    hasPositiveValue(result.weaponOrfevreWeaponMastery),
    `<div class="picto-stat weaponMastery"></div><span class="weaponMastery">${result.weaponOrfevreWeaponMastery} %</span>`
  ),

  bonusPart(
    hasPositiveValue(result.weaponOrfevreOtherBonus),
    `<div class="picto-stat weaponOrfevre"></div><span class="weaponOrfevre">${result.weaponOrfevreOtherBonus} %</span>`
  )
].filter(Boolean);

const weaponOrfevreDetailLine = weaponOrfevreSourceParts.length
  ? `<div class="picto-stat weaponOrfevre"></div><span class="weaponOrfevre">${result.weaponOrfevreChance} %</span>
     ( ${weaponOrfevreSourceParts.join(` <span class="calcul-methode more">+</span> `)} )`
  : "";

const weaponCollectorSourceParts = [
  bonusPart(
    hasPositiveValue(result.weaponCollectorBase),
    `<div class="picto-stat weaponCollector"></div><span class="neutral">${result.weaponCollectorBase} %</span> base`
  ),

  bonusPart(
    hasPositiveValue(result.weaponMasteryTrophyWeaponMasteryBonus),
    `<div class="picto-stat weaponMastery"></div><span class="weaponMastery">${result.weaponMasteryTrophyWeaponMasteryBonus} %</span>`
  ),

  bonusPart(
    hasPositiveValue(result.weaponCollectorOtherBonus),
    `<div class="picto-stat weaponCollector"></div><span class="weaponCollector">${result.weaponCollectorOtherBonus} %</span>`
  )
].filter(Boolean);

const weaponCollectorDetailLine = weaponCollectorSourceParts.length
  ? `<div class="picto-stat weaponCollector"></div><span class="weaponCollector">${result.weaponCollectorChance} %</span>
     ( ${weaponCollectorSourceParts.join(` <span class="calcul-methode more">+</span> `)} )`
  : ""; 
  
// SHIFT CONDITIONNAL HELPER
const shiftStartingDetail =
  hasPositiveValue(result.movementStartingAgiRatioCurrent) ? `Déplacement au début du combat : <div class="picto-stat shift"></div><span class="shift">${result.movementStartingCharges} / ${result.movementMaxCharges}</span><br>
( <div class="picto-stat shift-base"></div><span class="neutral">${result.movementStartingBasePercent} % base</span> <span class="calcul-methode more"> + </span>
<div class="picto-stat agility"></div><span class="agility">${result.movementStartingAgiRatioCurrent} %</span> = <span class="shift">${result.movementStartingTotalCurrent} %</span> )<br>` : `
Déplacement au début du combat :
<div class="picto-stat shift"></div><span class="shift">${result.movementStartingCharges} / ${result.movementMaxCharges}</span><br>
( <div class="picto-stat shift-base"></div><span class="neutral">${result.movementStartingBasePercent} % base</span> )<br>`;

const shiftDetailHelper = ` Déplacements :
<div class="picto-stat shift"></div><span class="shift">${result.shiftCurrent} / ${result.shiftMax}</span><br><br>
Les charges de déplacement permettent à l'entité de se déplacer pendant le combat.<br><br>

Déplacement de départ :
<div class="picto-stat shift"></div><span class="shift">${result.shiftCurrent}</span><br>
( <div class="picto-stat shift-base"></div><span class="neutral">${result.shiftBaseCurrent} base </span> ${ hasPositiveValue(result.shiftMovementCurrentBonus) ? `<span class="calcul-methode more"> + </span><div class="picto-stat movement"></div><span class="movement">${result.shiftMovementCurrentBonus}</span>` : "" } ${ hasPositiveValue(result.shiftOtherCurrentBonus) ? `<span class="calcul-methode more"> + </span><div class="picto-stat shift"></div><span class="shift">${result.shiftOtherCurrentBonus}</span>` : ""} )<br>

Déplacement max. :
<div class="picto-stat shift"></div><span class="shift">${result.shiftMax}</span><br>
( <div class="picto-stat shift-base"></div><span class="neutral">${result.shiftBaseMax} base </span>${ hasPositiveValue(result.shiftMovementMaxBonus) ? `<span class="calcul-methode more"> + </span><div class="picto-stat movement"></div><span class="movement">${result.shiftMovementMaxBonus}</span>` : ""}
${ hasPositiveValue(result.shiftOtherMaxBonus) ? `<span class="calcul-methode more"> + </span><div class="picto-stat shift"></div><span class="shift">${result.shiftOtherMaxBonus}</span>` : ""})<br>
${shiftStartingDetail}<br>
Les charges de déplacement se régénèrent automatiquement au début de chaque tour.<br><br>
<div class="picto-stat picto-malus-hp"></div><span class="danger">Malus Sac à HP</span> :
<div class="picto-stat ${result.shiftWeightClass}"></div>
<span class="${result.shiftWeightClass}">${result.shiftWeightLabel}</span>.<br>
Cette entité consomme <span class="shift">${1 + result.shiftWeightMalus}</span><div class="picto-stat shift"></div> à chaque déplacement
( <span class="neutral">1</span> base${
  result.shiftWeightMalus > 0
    ? ` <span class="calcul-methode more">+</span> <div class="picto-stat ${result.shiftWeightClass}"></div>
<span class="${result.shiftWeightClass}">${result.shiftWeightMalus}</span>.`
    : ""
} ).<br>
`;

// =====================
// SHIFT CONDITIAL HELPER
// =====================
const marathonSourceParts = [
  bonusPart(hasPositiveValue(result.marathonBaseChance), `<div class="picto-stat marathon-base"></div><span class="neutral">${result.marathonBaseChance} %</span>`),
  bonusPart(hasPositiveValue(result.marathonMovementBonus), `<div class="picto-stat movement"></div><span class="movement">${result.marathonMovementBonus} %</span>`),
  bonusPart(hasPositiveValue(result.marathonOtherBonus), `<div class="picto-stat marathon"></div><span class="marathon">${result.marathonOtherBonus} %</span>`)
].filter(Boolean);

const marathonDetailLine = marathonSourceParts.length ? `<div class="picto-stat marathon"></div><span class="marathon">${result.marathonChance} %</span> ( ${marathonSourceParts.join(` <span class="calcul-methode more">+</span> `)} )` : "";

const trailerSourceParts = [
  bonusPart(hasPositiveValue(result.trailerBaseChance), `<div class="picto-stat trailer-base"></div><span class="neutral">${result.trailerBaseChance} %</span>`),
  bonusPart(hasPositiveValue(result.trailerMovementBonus), `<div class="picto-stat movement"></div><span class="movement">${result.trailerMovementBonus} %</span>`),
  bonusPart(hasPositiveValue(result.trailerOtherBonus), `<div class="picto-stat trailer"></div><span class="trailer">${result.trailerOtherBonus} %</span>`)
].filter(Boolean);

const trailerDetailLine = trailerSourceParts.length ? `<div class="picto-stat trailer"></div><span class="trailer">${result.trailerChance} %</span> ( ${trailerSourceParts.join(` <span class="calcul-methode more">+</span> `)} )` : "";
// -------------  //   
// BT conditionnal //
// ------------- // 
const bloodFuryExecutionChanceParts = joinBonusParts([
  bonusPart(hasPositiveValue(result.bloodFuryExecutionChancePower), `<div class="picto-stat bloodFury"></div><span class="bloodFury">${formatPercent(result.bloodFuryExecutionChancePower)}</span> Fureur sanguinaire`),
  bonusPart(hasPositiveValue(result.bloodFuryExecutionChanceStrength), `<div class="picto-stat strength"></div><span class="strength">${formatPercent(result.bloodFuryExecutionChanceStrength)}</span> Force`)
]);

const bloodFuryExecutionChanceDetailLine = bloodFuryExecutionChanceParts ? `( ${bloodFuryExecutionChanceParts} )` : "";

const bloodFuryExecutionDamageParts = joinBonusParts([
  bonusPart(hasPositiveValue(result.bloodFuryExecutionDamagePhysical), `<div class="picto-stat physicalDamage"></div><span class="physical">${result.bloodFuryExecutionDamagePhysical}</span> dégâts physiques`),
  bonusPart(hasPositiveValue(result.bloodFuryExecutionDamagePercent), `<div class="picto-stat strength"></div><span class="strength">${formatPercent(result.bloodFuryExecutionDamagePercent)}</span> multiplicateur d'exécution`)
]);

const bloodFuryExecutionDamageDetailLine = bloodFuryExecutionDamageParts ? `( ${bloodFuryExecutionDamageParts} )` : "";

const bloodFuryTargetThresholdParts = joinBonusParts([
  bonusPart(hasPositiveValue(result.bloodFuryTargetThresholdBase), `<span class="neutral">${formatPercent(result.bloodFuryTargetThresholdBase)}</span>`),
  bonusPart(hasPositiveValue(result.bloodFuryTargetThresholdStrength), `<div class="picto-stat strength"></div><span class="strength">${formatPercent(result.bloodFuryTargetThresholdStrength)}</span> Force`)
]);

const bloodFuryTargetThresholdDetailLine = bloodFuryTargetThresholdParts ? `( ${bloodFuryTargetThresholdParts} )` : "";

// -------------  //   
// BATTLE HP REGEN conditionnel //
// ------------- // 
const hpBattleRegenNaturalSource = Math.max(0, Number(result.hpBattleRegenBase) || 0);
const hpBattleRegenIndestructibilitySource = Math.max(0, Number(result.hpBattleRegenStrengthRatio) || 0) + Math.max(0, Number(result.hpBattleRegenIndestructibilityRatio) || 0);

const hpBattleRegenSourceParts = [
  bonusPart(hasPositiveValue(hpBattleRegenNaturalSource), `<div class="picto-stat hpBattleRegen"></div><span class="hpBattleRegen">${hpBattleRegenNaturalSource}%</span>`),
  bonusPart(hasPositiveValue(hpBattleRegenIndestructibilitySource), `<div class="picto-stat indestructibility"></div><span class="indestructibility">${hpBattleRegenIndestructibilitySource}%</span>`)
].filter(Boolean);

const hpBattleRegenDetailLine = hpBattleRegenSourceParts.join(` <span class="calcul-methode more">+</span> `);
// ------------- //   
// TEXTE HELPER //
// ------------- //   
const helpContent = {
meleeAttackPhysical: `${meleeExecHelperBlock}• Dégâts de l'attaque de mêlée : 100%.<br>• Tous les <div class="picto-stat proc-effect"></div><span class="proc-effect">effets de déclenchements</span> peuvent se produire.`,
meleeAttackPiercing: `${meleeExecHelperBlock} ${piercingRecupHelperBlock}• Dégâts de l'attaque de mêlée : 100%.<br>• Tous les <div class="picto-stat proc-effect"></div><span class="proc-effect">effets de déclenchements</span> peuvent se produire.`,
rangeAttackPiercing: `${piercingRecupHelperBlock}• Dégâts de l'attaque : 100%.<br>`,

	
	meleeAttack:`Les attaques de mélée infligent 100% des dégats.<br><br>Elles necessitent un temps d'exécution.`,
	
	meleeAttackMagical:``,
	
	meleeAttackHybridal:`attaque melee hybride`,
	// meleeAttackPiercing: `Les <div class="picto-stat meleeAttack piercing"></div><span class="meleeAttack piercing">attaques de mêlée piercinges</span> ont un bonus de <div class="picto-stat recuperationTime"></div><span class="recuperationTime">vitesse de récupération</span> de <span class="neutral">${result.piercingRecupTotalReduc}%</span>.<br>
// ( <div class="picto-stat agility"></div><span class="agility">${result.piercingRecupAgiBonus}%</span> agilité + <div class="picto-stat meleeAttack piercing"></div><span class="meleeAttack piercing">${result.piercingRecupBaseBonus}%</span> piercing + <div class="picto-stat haste"></div><span class="haste">${result.piercingRecupHasteReduc}%</span> hâte )<br>
// • Dégâts de l'attaque : <span class="neutral">100%</span>.<br>
// • Tous les <div class="picto-stat proc-effect"></div><span class="proc-effect">effets de déclenchement</span> peuvent se produire.`,

	// rangeAttackPiercing: `Les <div class="picto-stat rangeAttack piercing"></div><span class="rangeAttack piercing">attaques perçantes à distance</span> ont un bonus de <div class="picto-stat recuperationTime"></div><span class="recuperationTime">vitesse de récupération</span> de <span class="neutral">${result.piercingRecupTotalReduc}%</span>.<br>
// ( <div class="picto-stat agility"></div><span class="agility">${result.piercingRecupAgiBonus}%</span> agilité + <div class="picto-stat rangeAttack piercing"></div><span class="rangeAttack piercing">${result.piercingRecupBaseBonus}%</span> piercing + <div class="picto-stat haste"></div><span class="haste">${result.piercingRecupHasteReduc}%</span> hâte )<br>
// • Dégâts de l'attaque : <span class="neutral">100%</span>.`,

	rangeAttackPhysical:`Les <div class="picto-stat physicalDamage"></div><span class="physical">attaques physiques</span> <div class="picto-stat rangeAttack physical"></div><span class="rangeAttack physical"> à distance</span> n'ont pas de <div class="picto-stat executionTime"></div><span class="executionTime">durée d'exécution</span>.<br><br>• <div class="picto-stat projectileTime"></div>Vitesse du projectile : ${result.ProjectilSpeedPercent} %.<br><br><div class="picto-stat danger"></div> <span class="danger">Attention</span> :<br><br>━ <div class="picto-stat rangeReduction"></div><span class="danger">Malus de distance</span> : Les <div class="picto-stat rangeAttack physical"></div><span class="rangeAttack physical">attaques à distance</span> font <span class="neutral">${result.calculateRangeRatioTotal} %</span> des dégats de l'attaque ( <span class="neutral">${result.calculateRangeRatioBase.toFixed(1)} %</span> + <div class="picto-stat agility"></div><span class="agility">${result.rangeAgiRatioBonus} %</span> + <div class="picto-stat precision"></div><span class="precision">${result.rangePrecisionRatioBonus} %</span> ).<br><br>━ <div class="picto-stat miss-shot"></div><span class="danger">Malus de visée</span> : Les <div class="picto-stat rangeAttack physical"></div><span class="rangeAttack physical">attaques à distance</span> ont <span class="neutral">${result.rangeAccuracyTotal} %</span> de chance d'atteindre leur cible ( <span class="neutral">${result.baseRangeAccuracy} %</span> + <div class="picto-stat agility"></div><span class="agility">${result.agiRangeAccuracy} %</span> + <div class="picto-stat precision"></div><span class="precision">${result.precisionRangeAccuracy} %</span> ).`,
	
	rangeAttackMagical: `Dégats des <div class="picto-stat magicalDamage"></div><span class="magical">attaques magiques</span> <div class="picto-stat rangeAttack magical"></div><span class="rangeAttack magicalRange" >à distance</span> : 100%.<br>• Pas de <div class="picto-stat executionTime"></div><span class="executionTime">durée d'exécution</span>.<br>• <div class="picto-stat projectileTime"></div>Vitesse du projectile : ${result.ProjectilSpeedPercent} %.<br><br><div class="picto-stat danger"></div> <span class="danger">Attention</span> :<br> <div class="picto-stat castReduction"></div><span class="danger">Malus d'Incantation</span> :  L'attaquant lançant une <span class="picto-stat rangeAttack magical"></span><span class="rangeAttack magicalRange">attaque à distance</span> a <span class="picto-stat brokenSpell"></span><span class="brokenSpell">${result.brokenSpellChanceTotal} %</span> ( <span class="neutral">${result.baseBrokenSpellChance} %</span> - <span class="picto-stat intelligence"></span><span class="intelligence">${result.intelBrokenSpellChanceReduc} %</span> ) de chance de <span class="picto-stat brokenSpell"></span><span class="brokenSpell">péter</span> son incantation.<br>━ Une <span class="picto-stat brokenSpell"></span><span class="brokenSpell">attaque pétée</span> échoue, et inflige <span class="picto-stat magicalDamage"></span><span class="magical">${result.brokenSpellDamageTotal} %</span> ( ( <span class="neutral">${result.baseBrokenSpellDamage} %</span> - <span class="picto-stat intelligence"></span><span class="intelligence">${result.intelBrokenSpellBaseDamageReduc} %</span> ) + <span class="picto-stat magicalDamage"></span><span class="magical">${result.magicalBrokenSpellDamageBonus} %</span> ) des dégâts du sort au lanceur.`,

	rangeAttackHybridal: `Les <div class="picto-stat hybridalDamage"></div><span class="hybridalDamage">attaques hybrides</span> <div class="picto-stat rangeAttack hybridal"></div><span class="hybridalRange">à distance</span> n'ont pas de <div class="picto-stat executionTime"></div><span class="executionTime">durée d'exécution</span>.<br>• <div class="picto-stat projectileTime"></div>Vitesse du projectile : ${result.ProjectilSpeedPercent} %.<br>
	<div class="picto-stat danger"></div> <span class="danger">Attention</span> :<br>
━ <div class="picto-stat rangeReduction"></div><span class="danger">Malus de distance</span> : S’applique <span class="danger">uniquement</span> sur la partie <div class="picto-stat physicalDamage"></div><span class="physical">physique</span> de l’attaque hybride.<br>
Les dégâts font <span class="neutral">${result.rangeHybridalRangeRatio}%</span>
( 100% - ( <span class="neutral">${result.rangeHybridBasePenalty}%</span>
+ <div class="picto-stat agility"></div><span class="agility">${result.rangeHybridAgiPenalty}%</span>
+ <div class="picto-stat precision"></div><span class="precision">${result.rangeHybridPrecisionPenalty}%</span> ) )
des dégâts de l'attaque.<br>
━ <div class="picto-stat miss-shot"></div><span class="danger">Malus de visée</span> : Le projectile des <div class="picto-stat rangeAttack  hybridal"></div><span class="hybridalRange">attaques à distance</span> a <span class="neutral">${result.rangeAccuracyTotal} %</span> de chance d'atteindre la cible ( <span class="neutral">${result.baseRangeAccuracy} %</span> + <div class="picto-stat agility"></div><span class="agility">${result.agiRangeAccuracy} %</span> + <div class="picto-stat precision"></div><span class="precision">${result.precisionRangeAccuracy} %</span> ).`,

	physicalDamage:`Les attaques physiques utilisent la puissance physique de l'attaquant.<br>Elles sont esquivables.<br>• Les coup critiques sont possibles.`,
	
    hybridalDamage: `• La <div class="picto-stat hybridalDamage"></div><span class="hybridalDamage">puissance hybride</span> est la fusion de la <div class="picto-stat physicalDamage"></div><span class="physical">puissance physique</span> et de la <div class="picto-stat magicalDamage"></div><span class="magical">puissance magiques</span>.<br>
	• Les dégats <div class="picto-stat hybridalDamage"></div><span class="hybridalDamage">hybride</span> entrainent <span class="neutral">50%</span> de dégats <div class="picto-stat physicalDamage"></div><span class="physical"> physique</span> et <span class="neutral">50%</span> de dégats <div class="picto-stat magicalDamage"></div><span class="magical">magiques</span> à la cible.<br>
	• La cible utilise <span class="neutral">50%</span> de sa <div class="picto-stat physicalResistance"></div><span class="physicalResistance">résistance physique</span> et <span class="neutral">50%</span> de sa <div class="picto-stat magicalResistance"></div><span class="magicalResistance">résistance magique</span> pour résister aux dégats hybrides. <br>
	• L'attaquant utilise <span class="neutral">50%</span> de sa <div class="picto-stat physicalPen"></div><span class="physicalPen">pénétration physique</span></div> et <span class="neutral">50%</span> de sa <div class="picto-stat magicalPen"></div><span class="magicalPen">pénétration magique</span> pour pénétrer les résistances de sa cible.<br>
	• Les <div class="picto-stat hybridalDamage"></div><span class="hybridalDamage">attaques hybrides</span> sont <div class="picto-stat dodge"></div><span class="dodge">esquivables</span>.<br>
	• Les <div class="picto-stat criticalPower"></div><span class="criticalPower">coups critiques</span> sont possibles sur les <div class="picto-stat hybridalDamage"></div><span class="hybridalDamage">attaques hybrides</span>.<br>
	• <div class="picto-stat ambidextry"></div> <span class="ambidextry">Ambidextrie</span> fonctionne sur les <div class="picto-stat hybridalDamage"></div><span class="hybridalDamage">attaques hybrides</span>.<br>
	• <div class="picto-stat esoterism"></div><span class="esoterism">Ésoterisme</span> marche sur la part <div class="picto-stat magicalDamage"></div><span class="magical">magique</span> des <div class="picto-stat hybridalDamage"></div><span class="hybridalDamage">attaques hybrides</span>.<br>
	• Les <div class="picto-stat hybridalDamage"></div><span class="hybridalDamage">attaques hybrides</span> ne peuvent pas <div class="picto-stat brokenSpell"></div><span class="brokenSpell">Péter</span>.`,
	
	magicalDamage: `Les <div class="picto-stat magicalDamage"></div><span class="magical">Puissance magique</span> détermine les dégâts magiques des attaques de l'entité.<br>Bonus actuel : ${result.totalMagicalDamageHelp}.<br><br>• Les <div class="picto-stat magicalDamage"></div><span class="magicalDamage">attaques magiques</span> sont <div class="picto-stat undogeable"></div><span class="undogeable">inesquivables</span>.<br>
	- Les <div class="picto-stat criticalPower"></div><span class="criticalPower">coups critiques</span> sont impossibles sur les <div class="picto-stat magicalDamage"></div><span class="magical">attaques magiques</span>.<br>
	- <div class="picto-stat ambidextry"></div> <span class="ambidextry">Ambidextrie</span> ne fonctionne pas sur les <div class="picto-stat magicalDamage"></div><span class="magical">attaques magiques</span>.<br>
	- <div class="picto-stat castReduction"></div><span class="danger">Malus d'Incantation</span> : Les <div class="picto-stat magicalDamage"></div><span class="magical">attaques magiques</span> ont une chance de <div class="picto-stat brokenSpell"></div><span class="brokenSpell">Péter</span>, pouvant échouer, et blesser leurs lanceur.`,
	
	piercingPower:`La puissance perçante determine les dégats des attaques perçantes. Si une entité posséde de la puissance perçante, cela peut alterer la nature de son attaque. Une entité qui utilise uniquement la puissance perçante produira une attaque transperçante.`,
	
	will: `La <div class="picto-stat will"></div> <span class="will">Volonté</span> détermine la puissance de l'âme de l'entité. Une âme puissante résistera aux corruptions du monde et bénéficiera d'un potentiel élevé.<br>• L'entité possède un cycle d'éveil de <span class="will">${result.willAwakeBonus}</span> niveaux.<br><br>• Niveau maximum que l'entité peut atteindre : <span class="neutral">${result.lvlMaxEntite}</span> ( <span class="neutral">${result.lvlMaxBase}</span><span class="calcul-methode ${result.lvlMaxBonusOpClass}">${result.lvlMaxBonusOp}</span><div class="picto-stat will"></div><span class="will">${result.lvlMaxBonusAbs}</span>).`,
	magicalResistance: `La Résistance Magique réduit les dégâts magiques subis de <span class="magical">${result.reductionPercent} %</span>.`,
	physicalResistance: `La Résistance Physique réduit les dégâts physiques subis de <span class="physical">${result.reductionPercent} %</span>.`,
    magicalPen: `Les <div class="picto-stat magicalDamage"></div> <span class="magical">attaques magiques</span> de l'entité d'ignorent <span class="magical">${result.magicPenBonus} %</span> de la <div class="picto-stat picto-stat magicalResistance"></div><span class="magical">résistance magique</span> de la cible.`,
    physicalPen: `Les <div class="picto-stat physicalDamage"></div> <span class="physical">attaques physiques</span> de l'entité ignorent <span class="physical">${result.physicPenBonus} %</span> de la <div class="picto-stat picto-stat physicalResistance"></div><span class="physical">résistance physique</span> de la cible.`,
	velocity: `Améliore la <div class="picto-stat speed"></div><span class="speed">vitesse</span> de l'entite.<br>L'entité est <span class="velocity">${result.velocityReductionPercent} %</span> plus rapide.<br>La <div class="picto-stat speed"></div><span class="speed">vitesse</span> de l'entité passe de <span class="neutral">${(baseSpeedMs / 1000).toFixed(2)} s</span> à <span class="velocity">${(result.velocityAdjustedSpeedMs / 1000).toFixed(2)} s</span>.`,
	speed: ` La <div class="picto-stat speed"></div><span class="speed">vitesse</span> est la durée nécessaire à l'entité pour préparer son tour. <br>La <div class="picto-stat speed"></div><span class="speed">vitesse</span> est améliorée par la <div class="picto-stat velocity"></div><span class="velocity">vélocité</span>.<br><br>Vitesse de l'entité en milliseconde : <span class="velocity">${result.displayValueMs}</span>.`,
	HP: `Les <div class="picto-stat HP"></div><span class="HP">points de vie</span> de l'entité determinent combien elle peut encaisser de dégats avant de mourir.<br>Ils determinent aussi le<div class="picto-stat picto-malus-hp"></div><span class="danger">poids de l'entité</span>.`,
	weight: `Le poids influence les déplacements de l'entité.<br> Une entité lourde pourra compenser son poids avec de l'agilité. Alors qu'une entité agile manquera de force pour déplacer un corps massif. Quand aux intellectuels, ils préférent réfléchir que se déplacer inutilement...`,
	vitality: `• Augmente les <span class="healthPoint">HP max</span> de l'entité.<br>Bonus actuel : <span class="healthPoint">+ ${result.vitalityBonus} HP</span>.<br><br>• Augmente la <div class="picto-stat dayHpRegen"></div><span class="dayHpRegen">récupération des HP</span> de l'entité au début de chaque <div class="picto-stat day"></div><span class="day">journée</span> de <div class="picto-stat vitality"></div><span class="vitality">+ ${result.HpRegenBonus}%</span> des HP max ( <div class="picto-stat dayHpRegen"></div><span class="dayHpRegen"> + ${result.HpRegenAmount} HP</span> ).`,
	haste: `Réduit de <div class="picto-stat haste"></div><span class="haste">${result.hastePreparation}%</span> ( <div class="picto-stat haste"></div><span class="haste">${result.hastePercent}</span> + <div class="picto-stat intelligence"></div><span class="intelligence">${result.hasteIntelRatio}</span> ) la durée de <div class="picto-stat preparationTime"></div><span class="timing">Préparation</span> des attaques de l'entité.<br><br>Additionnelement :<br>• Réduit de <div class="picto-stat intelligence"></div><span class="intelligence">${result.hasteCDReduc} %</span> la durée du <div class="picto-stat cooldownTime"></div><span class="timing">Cooldown</span> des attaques de l'entité.<br>• Réduit de <div class="picto-stat strength"></div><span class="strength">${result.hasteExecutionReduc} %</span> la durée de <div class="picto-stat executionTime"></div><span class="timing">l'exécution</span> des attaques de mélée de l'entité.<br>• Augmente de <div class="picto-stat strength"></div><span class="strength">${result.hasteProjectilSpeed} %</span> la <div class="picto-stat projectileTime"></div><span class="timing">vitesse des projectiles</span> des attaques à distance de l'entité.<br>• Réduit de <div class="picto-stat agility"></div><span class="agility">${result.hasteRecupReduc} %</span> la durée de <div class="picto-stat recuperationTime"></div><span class="timing">Récupération</span> des attaques de l'entité.`,
	
cooldownTimeDetail: cooldownTimeDetailHelper,
preparationTimeDetail: preparationTimeDetailHelper,
executionTimeDetail: executionTimeDetailHelper,
executionRangeTimeDetail: executionRangeTimeDetailHelper,
recoveryTimeDetail: recoveryTimeDetailHelper,

	cooldownTime: `<div class="picto-stat cooldownTime"></div><span class="cooldownTime">Réduction de cooldown</span> :
Réduit la durée de cooldown des attaques de <span class="cooldownTime">-${result.attackCooldownReducTotal} %</span>.<br><br>
${attackCooldownReducDetailLine ? `Source :<br>${attackCooldownReducDetailLine}` : ""}`,

preparationTime: `<div class="picto-stat preparationTime"></div><span class="preparationTime">Réduction de préparation</span> :
Réduit la durée de préparation des attaques de <span class="preparationTime">-${result.attackPreparationReducTotal} %</span>.<br><br>
${attackPreparationReducDetailLine ? `Source :<br>${attackPreparationReducDetailLine}` : ""}`,

executionTime: `<div class="picto-stat executionTime"></div><span class="executionTime">Réduction d'exécution</span> :
Réduit la durée d'exécution des attaques de <span class="executionTime">-${result.attackExecutionReducTotal} %</span>.<br><br>
${attackExecutionReducDetailLine ? `Source :<br>${attackExecutionReducDetailLine}` : ""}`,

recuperationTime: `<div class="picto-stat recuperationTime"></div><span class="recuperationTime">Réduction de récupération</span> :
Réduit la durée de récupération des attaques de <span class="recuperationTime">-${result.attackRecoveryReducTotal} %</span>.<br><br>
${attackRecoveryReducDetailLine ? `Source :<br>${attackRecoveryReducDetailLine}` : ""}`,

projectileTime: `<div class="picto-stat projectileTime"></div><span class="projectileTime">Vitesse des projectiles</span> :
Augmente la vitesse des projectiles de <span class="projectileTime">+${result.attackProjectileSpeedTotal} %</span>.<br><br>
${attackProjectileSpeedDetailLine ? `Source :<br>${attackProjectileSpeedDetailLine}` : ""}`,

	piercingDamage: `Les attaques <div class="picto-stat piercingDamage"></div><span class="piercingDamage">perçantes</span> réduisent la récupération de <span class="neutral">${result.piercingRecupTotalReduc}%</span>.<br> ( <span class="piercingDamage">${result.piercingRecupBaseBonus}%</span> base + <div class="picto-stat agility"></div><span class="agility">${result.piercingRecupAgiBonus} %</span> + <div class="picto-stat haste"></div><span class="haste">${result.hasteRecupReduc}%</span> hâte )`,
	transpiercingDamage: `Les attaques <div class="picto-stat transpiercingDamage"></div><span class="transpiercingDamage">transperçantes</span> réduisent la <class="picto-stat recuperationTime"></div> période de récupération de l'attaque de <span class="neutral">${result.transpiercingRecupTotalReduc} %</span> ( <span class="transpiercingDamage">${result.transpiercingRecupBaseBonus}%</span> + <div class="picto-stat agility"></div><span class="agility">${result.transpiercingRecupAgiBonus}%</span> agilité progressive + <div class="picto-stat haste"></div><span class="haste">${result.hasteRecupReduc} %</span> hâte )`,
	dayHpRegen: `L'entité récupère <span class="HP">${result.dayHpRegenTotal} HP</span> au début de chaque <div class="picto-stat day"></div><span class="day">journée</span>, si elle est vivante.<br><br>Détail : <span class="neutral">${result.dayHpRegenBase}</span> (base) + <span class="dayHpRegen">${result.dayHpRegenFromVitality}</span> (bonus <div class="picto-stat vitality"></div><span class="vitality">vitalité</span>).`,
    dodge: `Augmente les chances d’esquiver les <span class="physical">dégâts physiques</span> de <div class="picto-stat dodge"></div><span class="dodge">${result.calculateTotalDodgeBonus}%</span>( <div class="picto-stat dodge"></div><span class="dodge">${result.dodgeBonus}%</span> + <div class="picto-stat agility"></div><span class="agility">${result.agiDodgeBonus}%</span> ).<br><br><span class="stat-alerte">Les attaques purement magiques sont inesquivables.</span>`,
    precision: `Augmente les chances de toucher une cible avec des <span class="physical">dégâts physiques</span> de <span class="precision">${result.precisionBonus}%</span>.<br>Augmente les <div class="picto-stat criticalPower"></div> <span class="criticalPower">dégats critiques</span> de <div class="picto-stat precision"></div> <span class="precision">${result.critPrecisionBonus} %</span> `,
indestructibility: `Octroie <div class="picto-stat indestructibility"></div><span class="indestructibility">${result.indestructibilityBonus}%</span> de chance de nullifier totalement une source de dégât.<br>L'entité subit <div class="picto-stat indestructibility"></div><span class="indestructibility">${result.indestructibilityReductionTotal}%</span> ( <div class="picto-stat indestructibility"></div><span class="indestructibility">${result.indestructibilityReduction}%</span> + <div class="picto-stat strength"></div><span class="strength">${result.indestructibilityStrengthReduction}%</span> ) de dégâts en moins.<br><br><div class="picto-stat hpBattleRegen"></div><span class="hpBattleRegen">Régénération de Combat +</span> : Au début de son tour, l'entité récupère <div class="picto-stat hpBattleRegen"></div><span class="hpBattleRegen">${result.hpBattleRegenPercent}%</span> de ses HP max ( ${hasPositiveValue(result.hpBattleRegenBase) ? `<div class="picto-stat hpBattleRegen"></div><span class="hpBattleRegen">${result.hpBattleRegenBase}%</span><span class="calcul-methode more">+</span>` : ""}<div class="picto-stat strength"></div><span class="strength">${result.hpBattleRegenStrengthRatio}%</span><span class="calcul-methode more">+</span><div class="picto-stat indestructibility"></div><span class="indestructibility">${result.hpBattleRegenIndestructibilityRatio}%</span> ).`,
hpBattleRegen: `<div class="picto-stat hpBattleRegen"></div><span class="hpBattleRegen">Régénération de Combat</span> :
Au début de son tour, l'entité récupère <div class="picto-stat hpBattleRegen"></div><span class="hpBattleRegen">${result.hpBattleRegenPercent}% de ses HP max</span>.<br><br>
${hpBattleRegenDetailLine ? `Source :<br>${hpBattleRegenDetailLine}` : ""}`,
	esoterism: `Octroie <div class="picto-stat esoterism"></div><span class="esoterism">${result.esoterismBonus}%</span> de chance de réduire de <span class="esoterism">${result.esoterismTotalReduction}%</span> ( <span class="neutral">${result.esoterismBaseReduction}%</span> + <div class="picto-stat agility"></div><span class="agility">${result.esoterismAgiReduction}%</span> ) une source de <div class="picto-stat magicalDamage"></div><span class="magicalDamage">dégâts magiques</span> subis.`,
	mysticism: `Le <div class="picto-stat mysticism"></div><span class="mysticism">Mysticisme</span>peut déclencher une <span class="mysticism">transe mystique</span> pendant la préparation de l’attaque.<br><br>Chance d'entrer en transe :<span class="mysticism">${result.mysticismProcChance} %</span> ( <span class="neutral">${result.mysticismBaseProcChance} %</span> <span class="calcul-methode more">+</span> <div class="picto-stat intelligence"></div><span class="intelligence">${result.mysticismIntelProcChance} %</span>).<br>
	Durée de la transe : <span class="mysticism">${formatSeconds(result.mysticismTranceDuration)}</span> ( <span class="neutral">${formatSeconds(result.mysticismBaseTranceDuration)}</span> <span class="calcul-methode more">+</span> <div class="picto-stat intelligence"></div><span class="intelligence">${formatSeconds(result.mysticismIntelTranceDuration)}</span>).<br>
	Accélération de préparation pendant la transe : <span class="more">+ ${result.mysticismPreparationAcceleration} %</span> ( <span class="neutral">${result.mysticismBasePreparationAcceleration} %</span> <span class="calcul-methode more">+</span> <div class="picto-stat intelligence"></div><span class="intelligence">${result.mysticismIntelPreparationAcceleration} %</span> ).<br>
	Si l’attaque est lancée pendant la transe, elle gagne : <span class="more">+ ${result.mysticismDamageBonus} %</span> dégâts ( <span class="neutral">${result.mysticismBaseDamageBonus} %</span>  <span class="calcul-methode more">+</span> <div class="picto-stat intelligence"></div><span class="intelligence">${result.mysticismIntelDamageBonus} %</span>).`,
	equilibre: `L’<div class="picto-stat equilibre"></div><span class="equilibre">Équilibre</span> stabilise l’entité et limite les perturbations qu’elle provoque en combat.<br><br>
	• Réduction de l’<div class="picto-stat aggro"></div><span class="aggro">aggro</span> générée par les dégâts :<span class="equilibre">${result.equilibreAggroReduction} %</span> ( <span class="neutral">${result.equilibreBaseAggroReduction} %</span> <span class="calcul-methode more">+</span> <div class="picto-stat intelligence"></div><span class="intelligence">${result.equilibreIntelAggroReduction} %</span>).<br><br>
	• <div class="picto-stat balance-view"></div><span class="balance-view">Perseption équilibrée</span> : Chance de voir les entités invisibles :
	<span class="equilibre">${result.equilibreInvisibleDetection} %</span> ( <span class="neutral">${result.equilibreBaseInvisibleDetection} %</span> <span class="calcul-methode more">+</span> <div class="picto-stat agility"></div><span class="agility">${result.equilibreAgiInvisibleDetection} %</span> ).<br><br>
	• <div class="picto-stat balance-strike"></div><span class="balance-strike">Attaque équilibrée</span> : <span class="equilibre">${result.equilibreBalancedAttackChance} %</span>( <span class="neutral">${result.equilibreBaseBalancedAttackChance} %</span> <span class="calcul-methode more">+</span> <div class="picto-stat intelligence"></div><span class="intelligence">${result.equilibreIntelBalancedAttackChance} %</span> ) de chance que la prochaine attaque génère <div class="picto-stat aggro"></div><span class="aggro">0 aggro</span>.`,
	robustness:`Octroie <div class="picto-stat armor"></div><span class="armor">${result.armorBonus} points d'armure</span> à chaque début de combat à l'entité.<br>L'<div class="picto-stat armor"></div><span class="armor">armure</span> est régénérée à chaque début de <div class="picto-stat day"></div><span class="day">journée</span>`,
	armor:`L'<div class="picto-stat armor"></div><span class="armor">armure</span> protège les points de vie de l'entité de presque toutes sources de dégats.<br>L'<div class="picto-stat armor"></div><span class="armor">armure</span> est régénérée automatiquement à chaque début de <div class="picto-stat day"></div><span class="day">journée</span>.`,
    astrality:`Octroie <div class="picto-stat astrality"></div><span class="astrality">${result.astralityTotal} %</span> ( <div class="picto-stat astrality"></div><span class="astrality">${result.astralityBonus} %</span> + <div class="picto-stat intelligence"></div><span class="intelligence">${result.intelAstralityBonus} %</span> ) de chances de survivre à <span class="healthPoint">1 HP</span> en cas de coup fatal.`,
    bloodFury:`L'entité a <span class="bloodFury">${result.bloodFuryExecutionBonus} %</span> ( <div class="picto-stat bloodFury"></div><span class="bloodFury">${result.bloodFuryBfRatioBonus} %</span> + <div class="picto-stat strength"></div><span class="strength">${result.bloodFurySRatioBonus} %</span> ) de chance d'<span class="physical">exécuter</span> une cible ayant <span class="neutral">${result.bloodFuryExecChanceBonus} %</span> ( <span class="neutral">15 %</span> + <div class="picto-stat strength"></div><span class="strength"> ${result.bloodFuryExecSRatioBonus} %</span> ) de <span class="healthPoint">HP</span> ou moins avec ses attaques au<div class="picto-stat meleeAttack"></div><span class="rangeAttack">corps à corps</span>.<br><br>Dégats de l'exécution : + <div class="picto-stat physicalDamage"></div><span class="physical">${result.bloodFuryExecDamage}</span> supplémentaires.<br>( <div class="picto-stat strength"></div><span class="physical">${result.bloodFuryExecSRatio} %</span> de <div class="picto-stat physicalDamage"></div><span class="physical">${safe("physicalDamage")}</span> ).
<br><br><div class="picto-stat bloodThirsty"></div><span class="bloodThirsty">Soif de sang</span> : La <div class="picto-stat bloodFury"></div><span class="bloodFury">Fureur sanguinaire</span> fournit <div class="picto-stat bloodThirsty"></div><span class="bloodThirsty">+ ${result.bloodFuryBloodThirstyBonus} %</span> de <span class="bloodThirsty">Soif de sang</span>.<br>
( <span class="neutral">${result.bloodFuryBloodThirstyFlatBonus} %</span> + <div class="picto-stat bloodFury"></div><span class="bloodFury">${result.bloodFuryBloodThirstyBfRatioBonus} %</span> + <div class="picto-stat strength"></div><span class="strength">${result.bloodFuryBloodThirstyStrengthRatioBonus} %</span> ).<br><br>
	<div class="picto-stat bloodCrazy"></div><span class="bloodCrazy">Démence sanguinaire</span> : Si la cible est tuée à la suite d'une Éxecution, la prochaine attaque pourra éxecuter la cible sans qu'elle soit vulnérable.<br><br><div class="picto-stat bloodGlutony"></div><span class="bloodGlutony">Voracité sanguinaire</span> : Si l'Exécution donne lieux à un <div class="picto-stat overkill"></div> l'attaquant regagne 100 % de ses <span class="healthPoint">HP</span>.`,
	bloodThirsty: `Les attaques physiques de l'entité lui procurent <span class="bloodThirsty">${result.bloodThirstyLifestealBonus} %</span> de <div class="picto-stat lifesteal"></div><span class="lifesteal">vol de vie</span> sur les <span class="healthPoint">HP</span> réellement infligés.<br><br>Fonctionne avec :<br>• <div class="picto-stat physicalDamage"></div><span class="physical">dégâts physiques</span><br>• <div class="picto-stat piercingDamage"></div><span class="piercing">dégâts perforants</span><br>• <div class="picto-stat hybridalDamage"></div><span class="hybridal">dégâts hybrides</span><br><br>Ne fonctionne pas si aucun <span class="healthPoint">HP</span> réel n'est perdu par la cible.`,

bloodFuryExecutionChance: `<div class="picto-stat bloodFury"></div><span class="bloodFury">Chance d'exécution</span><br><br>Détermine la probabilité qu'une attaque valide déclenche une <span class="physical">Exécution</span> sur une cible vulnérable.<br><br>Total : <span class="bloodFury">${formatPercent(result.bloodFuryExecutionChanceTotal)}</span>.<br><br>${bloodFuryExecutionChanceDetailLine ? `Détail :<br>${bloodFuryExecutionChanceDetailLine}` : ""}`,

bloodFuryTargetThreshold: `<div class="picto-stat healthPoint"></div><span class="healthPoint">Vulnérabilité à l'exécution</span><br><br>Une cible devient vulnérable à l'Exécution lorsque ses <span class="healthPoint">HP</span> sont inférieurs ou égaux à :<br><br>Total : <span class="neutral">${formatPercent(result.bloodFuryTargetThresholdTotal)}</span> de ses <span class="healthPoint">HP</span> maximum.<br><br>${bloodFuryTargetThresholdDetailLine ? `Détail :<br>${bloodFuryTargetThresholdDetailLine}` : ""}`,

bloodFuryExecutionDamage: `<div class="picto-stat physicalDamage"></div><span class="physical">Dégâts d'exécution</span><br><br>Détermine les dégâts physiques supplémentaires infligés lorsqu'une <span class="physical">Exécution</span> réussit.<br><br>Total : <div class="picto-stat physicalDamage"></div><span class="physical">+ ${result.bloodFuryExecutionDamageTotal}</span> dégâts.<br><br>${bloodFuryExecutionDamageDetailLine ? `Détail :<br>${bloodFuryExecutionDamageDetailLine}` : ""}`,
    ambidextry:`L'entité à <span class="neutral">${result.ambidextryTotalChance} %</span> ( <div class="picto-stat ambidextry"></div> <span class="ambidextry">${result.ambidextryProcBonus} %</span> + <div class="picto-stat agility"></div> <span class="agility">${result.ambidextryAgiChance} %</span> ) de chance de réaliser un deuxième coup lors de son attaque.<br><br>Le deuxième coup fait <span class="neutral">${result.ambidextryDamageBonus} %</span> ( <span class="neutral">20 %</span> + <div class="picto-stat ambidextry"></div> <span class="ambidextry">${result.ambidextryRatioBonus} %</span> + <div class="picto-stat agility"></div> <span class="agility">${result.ambidextryAgiRatioBonus} %</span> ) du premier. Les effets du premier coup peuvent également être réapliqués.<br><br><span class="stat-alerte">L'ambidextire est impossible pour les attaques exclusivement magiques.</span>`,
	criticalPower: `<div class="picto-stat criticalPower"></div><span class="criticalPower">Puissance critique</span><br><br><div class="picto-stat criticalChance"></div><span class="criticalPower">Critique chance +</span> : L'Umbra apporte <span class="neutral">+${formatPercent(result.critPowerChanceContribution)}</span> de chance de coup critique.<br>(<div class="picto-stat criticalPower"></div><span class="criticalPower">${formatPercent(result.critChanceBonus)}</span> Puissance critique + <div class="picto-stat agility"></div><span class="agility">${formatPercent(result.critAgiChanceBonus)}</span> Agilité).<br>Total : <div class="picto-stat criticalChance"></div><span class="criticalChance">${formatPercent(result.critTotalChance)}</span> de chance de coup critique.<br><br><div class="picto-stat criticalDamage"></div><span class="criticalPower">Critique dégâts +</span> : L'Umbra apporte <span class="neutral">+${formatPercent(result.critPowerDamageContribution)}</span> de dégâts critiques.<br>(<div class="picto-stat precision"></div><span class="precision">${formatPercent(result.critPrecisionBonus)}</span> Précision + <div class="picto-stat criticalPower"></div><span class="criticalPower">${formatPercent(result.critRatioBonus)}</span> Puissance critique + <div class="picto-stat agility"></div><span class="agility">${formatPercent(result.critAgiRatioBonus)}</span> Agilité).<br>Total : <div class="picto-stat criticalDamage"></div><span class="criticalDamage">+${formatPercent(result.critDamageBonus)}</span> de dégâts critiques.<br><br><span class="stat-alerte">Les coups critiques sont impossibles pour les attaques exclusivement magiques.</span>`,
criticalDamage: `<div class="picto-stat criticalDamage"></div><span class="criticalDamage">Dégâts des coups critiques</span> :

Les coups critiques infligent <span class="criticalDamage">+${formatPercent(result.criticalDamageTotal)}</span> de dégâts supplémentaires.<br><br>

${criticalDamageDetailLine ? `Source :<br>${criticalDamageDetailLine}` : ""}`,
criticalChance: `<div class="picto-stat criticalChance"></div><span class="criticalChance">Chance de coup critique</span> :<br><br>

L'entité possède
<div class="picto-stat criticalChance"></div>
<span class="criticalChance">${formatPercent(result.criticalChanceTotal)}</span>
de chance d'infliger un coup critique.<br><br>

${criticalChanceDetailLine
  ? `Source :<br>${criticalChanceDetailLine}`
  : ""}`,
	resilience: `• Les dégats des <div class="picto-stat criticalPower"></div> <span class="criticalPower">coups critiques</span> subis par l'entité sont réduits de <div class="picto-stat resilience"></div><span class="resilience">${result.resilienceCritTotalBonus} %</span> ( <div class="picto-stat resilience"></div> <span class="resilience">${result.resilienceCritBonus} %</span> + <div class="picto-stat strength"></div> <span class="strength">${result.resiStrengthCritBonus} %</span> ).<br><br>• Les <div class="picto-stat alteration"></div><span class="alteration">altérations d’état</span> subies par l'entité ont leurs effets réduits de <div class="picto-stat resilience"></div><span class="resilience">${result.resilienceAlteTotalBonus} %</span> ( <div class="picto-stat resilience"></div><span class="resilience">${result.resilienceAlteBonus} %</span> + <div class="picto-stat intelligence"></div><span class="intelligence">${result.resiIntelCritBonus} %</span> ).<br><br>• Les <div class="picto-stat alteration"></div><span class="alteration">altérations d’état</span> ont <div class="picto-stat resilience"></div><span class="resilience">${result.resilienceTotalCancelBonus} %</span> ( <div class="picto-stat resilience"></div><span class="resilience">${result.resilienceCancelBonus} %</span> + <div class="picto-stat agility"></div><span class="agility">${result.resiAgiCancelBonus} %</span> ) de chance d’échouer totalement.`,
	hypercognition: `• Confére un bonus de <div class="picto-stat magicalDamage"></div> <span class="magical">puissance magiques</span> supplémentaires aux attaques de l'entité.<br><br>Bonus de dégât actuel :<br><div class="picto-stat hypercognition"></div><span class="hypercognition">+ ${result.hypercognitionBonus}</span> de dégâts magiques ( <div class="picto-stat hypercognition"></div><span class="hypercognition">${result.hypercognitionValue}</span> + ( <div class="picto-stat intelligence"></div><span class="intelligence">${result.hypercognitionIntel}</span> × <div class="picto-stat hypercognition"></div><span class="hypercognition">${result.hypercognitionRatio}</span> ) ).<br><br>• Le bonus en dégât de l'hypercognition est traité par les attaques magiques de la même manière que la <div class="picto-stat magicalDamage"></div> <span class="magical">Puissance Magique</span> de l'entité.`,
	transcendence:`• Confère a l'entité le potentiel d'obtenir des <div class="picto-stat extraLife"></div><span class="extraLife">vies supplémentaires</span>.<br> Donne à l'entité un maximum de <div class="picto-stat extraLife"></div> <span class="transcendence">${result.transcendenceExBonus}</span> vies supplémentaires.<br><br>• L'entité a <div class="picto-stat transcendence"></div><span class="transcendence">${result.transcendenceConsoProtectionPercent}%</span> ( <div class="picto-stat transcendence"></div><span class="transcendence">${result.transcendenceConsoProtectionBase}%</span> + <div class="picto-stat intelligence"></div><span class="intelligence">${result.transcendenceConsoIntelBonus}%</span> ) de chance de ne pas consommer ses ressources de résurrection lors d'une utilisation.`,
	extraLife: `Lorsque l'entité est sur le point de mourir, elle consomme cette Vie pour continuer à se battre.<br><br>Chaque <div class="picto-stat extraLife"></div><span class="extraLife">Vie Supplémentaire</span> consommée réssucite l'entité avec <span class="HP">${result.extraLifeResurrectPercentTotal}%</span> de ses <div class="picto-stat HP"></div> max ( <span class="neutral">20 %</span> + <div class="picto-stat intelligence"></div> <span class="intelligence">${result.extraLifeResurrectPercentIntel}%</span> ).<br>• Hp rendus : <span class="HP">${result.extraLifeResurrectHP}</span> <div class="picto-stat HP"></div><br>• <div class="picto-stat extraLife"></div><span class="extraLife">Vie Supplémentaire</span> de l'entité: <div class="picto-stat extraLife"></div><span class="extraLife">${result.extraLifeCurrent}/${result.extraLifeMax}</span>.<br>Les <div class="picto-stat extraLife"></div><span class="extraLife">Vies Supplémentaires</span> consommées se rechargent après quelques <div class="picto-stat day"></div><span class="day">journées</span>, si l'entité est encore en v. Une fois rechargées, elles sont à nouveau utilisables.`,
	fadedLife : `Lorsque l'entité est sur le point de mourir, elle consomme cette Vie pour continuer à se battre.<br><br>Chaque <div class="picto-stat fadedLife"></div><span class="fadedLife">Vies fannées</span> consommées restaurent 50 % des <div class="picto-stat HP"></div> de l'entité et l'empéche de mourir.<br>Les <div class="picto-stat fadedLife"></div><span class="fadedLife">Vies fannées</span> consommées sont définitivement perdues.`,
	eternalLife :`Lorsque l'entité est sur le point de mourir, elle consomme cette Vie pour continuer à se battre.<br><br>La <div class="picto-stat eternalLife"></div><span class="eternalLife">Vie Éternelle</span> consommée restaure 100 % des <div class="picto-stat HP"></div> de l'entité et l'empéche de mourir.<br>La <div class="picto-stat eternalLife"></div><span class="eternalLife">Vie Éternelle</span> se régénére chaque nouvelle<div class="picto-stat day"></div><span class="day">journée</span>, si l'entité est encore en vie.<br>Une entité ne peut posséder qu'une unique<div class="picto-stat eternalLife"></div><span class="eternalLife">Vie Éternelle</span>.`,
	

	

	rangeAttack: `Les <div class="picto-stat rangeAttack"></div><span class="rangeAttack">Attaques à distance</span> sont moins puissantes que les <div class="picto-stat meleeAttack"></div><span class="meleeAttack">Attaques de mélée</span>, mais l'attaquant n'a pas besoin d'attendre que le projectile touche la cible pour lancer sa prochaine attaque.<br><br>Les <div class="picto-stat rangeAttack"></div><span class="rangeAttack">Attaques à distance</span> font <span class="neutral">${result.calculateRangeRatioTotal} %</span> des dégats de l'attaque ( <span class="neutral">${result.calculateRangeRatioBase.toFixed(1)} %</span> + <div class="picto-stat agility"></div><span class="agility">${result.rangeAgiRatioBonus} %</span> + <div class="picto-stat precision"></div><span class="precision">${result.rangePrecisionRatioBonus} %</span> ).<br><br>Le projectile des attaques physiques a <span class="neutral">${result.rangeAccuracyTotal} %</span> de chance d'atteindre la cible ( <span class="neutral">${result.baseRangeAccuracy} %</span> + <div class="picto-stat agility"></div><span class="agility">${result.agiRangeAccuracy} %</span> + <div class="picto-stat precision"></div><span class="precision">${result.precisionRangeAccuracy} %</span> ).<br><br><span class="stat-alerte">La réduction de dégats des <div class="picto-stat rangeAttack"></div><span class="rangeAttack">Attaques à distance</span> ne s'applique pas aux <div class="picto-stat magicalDamage"></div><span class="magical">dégâts magiques</span>.</span><br><br>L'attaquant lançant une <div class="picto-stat magicalDamage"></div><span class="magical">attaque magique</span> <div class="picto-stat rangeAttack"></div><span class="rangeAttack">à distance</span> a <div class="picto-stat brokenSpell"></div><span class="brokenSpell">${result.brokenSpellChanceTotal} %</span> de chance de <div class="picto-stat brokenSpell"></div><span class="brokenSpell">Péter</span> son incantation ( <span class="neutral">${result.baseBrokenSpellChance} %</span> - <div class="picto-stat intelligence"></div><span class="intelligence">${result.intelBrokenSpellChanceReduc} %</span> ).<br><br>Une <div class="picto-stat brokenSpell"></div><span class="brokenSpell">attaque magique pétée</span> échoue, et inflige <div class="picto-stat magicalDamage"></div><span class="magical">${result.brokenSpellDamageTotal} %</span> ( ( <span class="neutral">${result.baseBrokenSpellDamage} %</span> - <div class="picto-stat intelligence"></div><span class="intelligence">${result.intelBrokenSpellBaseDamageReduc} %</span> ) + <div class="picto-stat magicalDamage"></div><span class="magical">${result.magicalBrokenSpellDamageBonus} %</span> ) des dégats du sort au lanceur .`,
	intellect: `L'attaque utilise <div class="picto-stat intellect"></div><span class="intellect">${result.intellectPercantBonus}%</span> ( <span class="neutral">100%</span> + <div class="picto-stat intelligence"></div><span class="intelligence">${result.intellectBonus}%</span>) de la <div class="picto-stat magicalDamage"></div><span class="magicalDamage">puissance magique</span> de l'attaquant, soit <div class="picto-stat magicalDamage"></div><span class="magicalDamage">+${result.intellectPMBonus}</span> bonus.<br>Totale prise en compte par l'attaque : <div class="picto-stat magicalDamage"></div><span class="magicalDamage">${result.intellectTotalBonus}</span>.`,
	brutality: `L'attaque utilise <div class="picto-stat brutality"></div><span class="brutality">${result.brutalityPercantBonus}%</span> ( <span class="neutral">100%</span> + <div class="picto-stat strength"></div><span class="strength">${result.brutalityBonus}%</span> ) de la <div class="picto-stat physicalDamage"></div><span class="physicalDamage">puissance physique</span> de l'attaquant, soit <div class="picto-stat physicalDamage"></div><span class="physicalDamage">+${result.brutalityPhysicalPowerBonus}</span> bonus.<br>Puissance physique totale prise en compte par l'attaque : <div class="picto-stat physicalDamage"></div><span class="physicalDamage">${result.brutalityTotalBonus}</span>.`,
	brokenSpell: `L'attaque a <div class="picto-stat brokenSpell"></div><span class="brokenSpell">${result.brokenSpellChanceTotal}%</span> ( <span class="neutral">${result.baseBrokenSpellChance}%</span> - <div class="picto-stat intelligence"></div><span class="intelligence">${result.intelBrokenSpellChanceReduc}%</span> ) de chance de <div class="picto-stat brokenSpell"></div><span class="brokenSpell">Péter</span>.<br>Une <div class="picto-stat brokenSpell"></div><span class="brokenSpell">attaque pétée</span> échoue et inflige <div class="picto-stat magicalDamage"></div><span class="magicalDamage">${result.brokenSpellDamageTotal}%</span> des dégâts de l'attaque à l'attaquant ( <span class="neutral">${result.baseBrokenSpellDamage}%</span> - <div class="picto-stat intelligence"></div><span class="intelligence">${result.intelBrokenSpellBaseDamageReduc}%</span> + <div class="picto-stat magicalDamage"></div><span class="magicalDamage">${result.magicalBrokenSpellDamageBonus}%</span> ).`,
	messedSpell: `L'attaque a <div class="picto-stat messedSpell"></div><span class="messedSpell">${result.brokenSpellChanceTotal}%</span> ( <span class="neutral">${result.baseBrokenSpellChance}%</span> - <div class="picto-stat intelligence"></div><span class="intelligence">${result.intelBrokenSpellChanceReduc}%</span> ) de chance de <div class="picto-stat messedSpell"></div><span class="messedSpell">foirer</span>.<br>Une <div class="picto-stat messedSpell"></div><span class="messedSpell">attaque foirée</span> inflige <div class="picto-stat magicalDamage"></div><span class="magicalDamage">${result.brokenSpellDamageTotal}%</span> des dégâts de l'attaque à la cible Et à l'attaquant.`,
	undogeable: `L'attaque ne peut pas être <div class="picto-stat dodge"></div><span class="dodge">esquivée</span> par la cible. D'aucune manière.`,
	perforation: `Les dégâts de cette attaque ignorent totalement l'<div class="picto-stat armor"></div> <span class="armor">armure</span> de la cible.`,
	executionMelee: `Les attaques au <div class="picto-stat meleeAttack"></div><span class="meleeAttack">corps à corps</span> ont un bonus de <div class="picto-stat executionTime"></div><span class="executionTime">${result.meleeExecBaseBonus}%</span> sur la vitesse d'exécution.`,
	occultism: `L’<div class="picto-stat occultism"></div><span class="occultism">Occultisme</span> accorde la maîtrise des arts occultes de l’assassinat. L’entité a une chance de devenir invisible afin de préparer une attaque puissante.<br><br>
• L’entité a <div class="picto-stat occultism"></div><span class="occultism">${result.occultismInvisibilityChance} %</span> ( <span class="neutral">${result.occultismBaseInvisibilityChance} %</span> <span class="calcul-methode more">+</span> <div class="picto-stat agility"></div><span class="agility">${result.occultismAgiInvisibilityChance} %</span> ) de chance de devenir invisible en préparant son attaque.<br>
• L'attaque préaparée par l’entité aura <div class="picto-stat agility"></div><span class="agility">+ ${result.occultismCritChanceBonus} %</span> de chance de <div class="picto-stat criticalPower"></div><span class="criticalPower">coup critique</span> bonus.<br><br>
• En état d'<div class="picto-stat occultism"></div><span class="occultism">Invisibilité Occulte</span>, l’entité est difficile à cibler.<br>
Chance d’être prise pour cible : <span class="more">- ${result.occultismTargetableChanceDisplay} %</span> ( <span class="neutral">${100 - result.occultismBaseTargetableChance} %</span><span class="calcul-methode more"> - </span><div class="picto-stat agility"></div><span class="agility">${result.occultismAgiTargetableChance} %</span> ).<br>
• Elle bénéficie d’un bonus temporaire de <div class="picto-stat dodge"></div><span class="dodge"><span class="more">+ ${result.occultismDodgeBonus}</span> esquive</span> ( <span class="neutral">${result.occultismBaseDodgeBonus}</span> <span class="calcul-methode more">+</span> <div class="picto-stat agility"></div><span class="agility">${result.occultismAgiDodgeBonus}</span> ).<br><br>
• <div class="picto-stat indiscretion"></div><span class="indiscretion">Malus de Discrétion</span> : Pendant l’<div class="picto-stat occultism"></div><span class="occultism">Invisibilité Occulte</span>, la <div class="picto-stat preparationTime"></div>durée de préparation de l’attaque est réduite de <span class="less">- ${result.occultismPreparationSpeedDebuff} % </span>.<br>
• <div class="picto-stat fragility"></div><span class="fragility">Malus de Fragilité des Ombres</span> : l’entité est plus vulnérable. Tous les dégâts reçus augmentent de <span class="less">${result.occultismShadowFragilityPercent} %</span> pendant l’invisibilité.
`,
movement: `Le <div class="picto-stat movement"></div><span class="movement">Mouvement</span>
améliore les capacités de déplacement de l'entité pendant les combats.<br><br>
Bonus charge de déplacement : <div class="picto-stat shift"></div><span class="shift">+ ${result.movementMaxCharges}
charges de déplacement</span> ( <span class="movement">+ 1</span> <div class="picto-stat shift"></div><span class="shift">charge de déplacement</span> par niveau de <div class="picto-stat movement"></div><span class="movement">mouvement</span> ).<br><br>
Bonus déplacement au début du combat : <div class="picto-stat agility"></div><span class="agility">${result.movementStartingTotalCurrent} %</span> de ses <div class="picto-stat shift"></div><span class="shift">charges de déplacement</span> disponibles ( <span class="neutral">${result.movementStartingBasePercent} %</span> <span class="calcul-methode more">+</span> <div class="picto-stat agility"></div><span class="agility">${result.movementStartingAgiRatioCurrent} %</span>), soit <div class="picto-stat shift"></div><span class="shift">${result.movementStartingCharges} / ${result.movementMaxCharges} charges de déplacement</span>.<br><br>
<div class="picto-stat marathon"></div><span class="marathon">Marathonien + :</span> + <div class="picto-stat agility"></div><span class="agility">${result.movementMarathonChance} %</span> de chance de ne pas consommer de <div class="picto-stat shift"></div><span class="shift">charge de déplacement</span> lors d'un mouvement.<br><div class="picto-stat trailer"></div><span class="trailer">Trailer + :</span> + <div class="picto-stat agility"></div><span class="agility">${result.movementTrailerChance} %</span> de chance de gagner <div class="picto-stat shift"></div><span class="shift">2 charges de déplacement</span> au lieu d'une, au début de son tour.`,
marathon: `<div class="picto-stat marathon"></div><span class="marathon">Marathonien</span> :
L'entité possède <span class="marathon">${result.marathonChance} %</span> de chance de ne pas consommer de <div class="picto-stat shift"></div><span class="shift">charge de déplacement</span> lorsqu'elle se déplace.<br><br>
${ marathonDetailLine ? `Source :<br>${marathonDetailLine}` : ""}`,
trailer: `<div class="picto-stat trailer"></div><span class="trailer">Trailer</span> :
Au début de son tour, l'entité possède <span class="trailer">${result.trailerChance} %</span> de chance de gagner <div class="picto-stat shift"></div><span class="shift">2 charges de déplacement</span> au lieu d'une.<br><br>
${ trailerDetailLine ? `Source :<br>${trailerDetailLine}` : ""}`,
shift: shiftDetailHelper,
weaponMastery: `La <div class="picto-stat weaponMastery"></div><span class="weaponMastery">Maîtrise d'arme</span> représente l'art de choisir, porter et exploiter l'équipement de guerre.<br><br>
• <div class="picto-stat armorSlot"></div><span class="charge">Charge</span> : l'entité gagne <div class="picto-stat armorSlot"></div><span class="charge">+ ${result.weaponMasteryChargeBonus}</span>  emplacement(s) d'équipement.<br>( <div class="picto-stat weaponMastery" ></div><span class="weaponMastery">${result.weaponMasteryChargeBrutRatioBonus}</span> + <div class="picto-stat strength"></div><span class="strength">${result.weaponMasteryChargeStrengthRatioBonus}</span> ) <br>
• <div class="picto-stat weaponOrfevre"></div><span class="weaponOrfevre">Orfèvre armurier</span> + : les équipements portés sont plus efficaces de <span class="weaponOrfevre">${result.weaponOrfevreBonus} %</span> ( <div class="picto-stat weaponMastery"></div><span class="weaponMastery">${result.weaponOrfevreWeaponMastery} %</span> + <div class="picto-stat strength"></div><span class="strength">${result.weaponOrfevreStrength} %</span> ).<br>
• <div class="picto-stat weaponCollector"></div><span class="weaponCollector">Collectionneur de guerre</span> + : quand l'entité est victorieuse, elle augmente les chances de trouver des équipements dans les butins de guerre de <span class="weaponCollector">+${result.weaponMasteryTrophyChance} %</span> ( <div class="picto-stat weaponMastery"></div><span class="weaponMastery">${result.weaponMasteryTrophyWeaponMasteryBonus} %</span> + <div class="picto-stat strength"></div><span class="strength">${result.weaponMasteryTrophyStrengthBonus} %</span> ).`,
weaponOrfevre: `<div class="picto-stat weaponOrfevre"></div><span class="weaponOrfevre">Orfèvre armurier</span> :
Les équipements portés sont plus efficaces de <span class="weaponOrfevre">${result.weaponOrfevreChance} %</span>.<br><br>
${weaponOrfevreDetailLine ? `Source :<br>${weaponOrfevreDetailLine}` : ""}`,
weaponCollector: `<div class="picto-stat weaponCollector"></div><span class="weaponCollector">Collectionneur de guerre</span> :
Quand l'entité est victorieuse, elle augmente les chances de trouver des équipements dans les butins de guerre de <span class="weaponCollector">+${result.weaponCollectorChance} %</span>.<br><br>
${weaponCollectorDetailLine ? `Source :<br>${weaponCollectorDetailLine}` : ""}`,
charge: `La <div class="picto-stat charge"></div><span class="charge">Charge</span> détermine le nombre d'emplacements d'équipement disponibles pour l'entité.<br><br>Emplacements d'équipement de l'entité : <span class="charge">${result.chargeEquipmentSlots}</span>${chargeSourceHelper}.`,
stuffSlot: `Emplacement d'équipement vide.<br>Vous pouvez équiper un équipement dans cet emplacement en réalisant un <div class="picto-stat dragNdrop"></div><span class="dragNdrop">Drag&Drop</span> de l'équipement que vous souhaitez équiper, depuis l'inventaire vers l'emplacement d'équipement vide.<br>Faites un <div class="picto-stat doubleclic"></div><span class="doubleclic">Double clic</span> pour déséquiper.<br>`,
};

const ambianceContent = {
  bloodFury: `Une rage ancienne pulse dans le sang. Chaque blessure ouverte appelle une fin plus brutale.`,
  vitality: `La chair refuse de céder. Chaque souffle maintient l’entité un peu plus longtemps dans le combat.`,
  physicalDamage: `La force brute parle sans détour. Ce qui résiste finit par rompre.`,
  weaponMastery: `Les armes révèlent leur véritable puissance entre les mains de ceux qui savent les écouter.`,
  movement: `Rien ne sert de courir, il faut partir à temps... Mais c'est bien aussi de courir vite !`,
  haste: `Certaines cultures mettent la ponctualité au centre de leur savoir-faire. D'autres, font tout simplement l'inverse, et placent tout leur savoir-faire bien avant la ponctualité...`,
  hypercognition: `Consumé par des savoirs interdits, le cerveau de son porteur est prêt à exploser, condamné à rassasier une faim de savoir insatiable.`,
  bloodThirsty: `Chaque plaie ouverte nourrit la suivante. Le sang versé refuse d'être perdu.`,
};

    const statMeta = Array.isArray(stats)
        ? stats.find(s => s.key === statKey)
        : null;

    // 🧠 Priorité :
    // 1) Texte spécifique dans helpContent
    // 2) description de `stats`
    // 3) message générique
    if (helpContent[statKey]) {
        result.helpContent = helpContent[statKey];
} else if (statMeta?.description) {
    result.helpContent = statMeta.description;
} else {
    result.helpContent = helpContent[statKey] || "";
}
result.ambianceContent = ambianceContent[statKey] || "";
return result;
}

export function calculateResistanceReductionPercent(resistanceValue, RESISTANCE_CONSTANT = 70) {
  const r = Number(resistanceValue) || 0;
  if (r <= 0) return 0;

  const percent = (r / (r + RESISTANCE_CONSTANT)) * 100;

  // ✅ identique à: 100 - floor(100*(1 - reduction))
  return Math.max(0, Math.min(100, Math.ceil(percent)));
}
export function calculateResistances(target, totalDamageSources) {
    const RESISTANCE_CONSTANT = 70;

    const physicalResistance = target.stats.physicalResistance || 0;
    const physicalReduction = physicalResistance / (physicalResistance + RESISTANCE_CONSTANT);

    const magicalResistance = target.stats.magicalResistance || 0;
    const magicalReduction = magicalResistance / (magicalResistance + RESISTANCE_CONSTANT);

    // Récupération des dégâts initiaux
    const piercingDamage = totalDamageSources.piercingDamage || 0;
    const physical = totalDamageSources.physical || 0;
    const magical = totalDamageSources.magical || 0;
    const hybridalDamage = totalDamageSources.hybridalDamage || 0;

    // Calcul des dégâts réduits
    let reducedPhysical = physical > 0 ? Math.floor(physical * (1 - physicalReduction)) : 0;
    let reducedMagical = magical > 0 ? Math.floor(magical * (1 - magicalReduction)) : 0;

    let reducedHybrid = 0;
    if (hybridalDamage > 0) {
        const half = hybridalDamage / 2;
        const reducedMagicalHalf = Math.floor(half * (1 - magicalReduction));
        const reducedPhysicalHalf = Math.floor(half * (1 - physicalReduction));
        reducedHybrid = reducedMagicalHalf + reducedPhysicalHalf;
    }

    // 💬 Log détaillé
    // console.log(`📊 Calcul des résistances pour ${target.name}`);
    // if (physical > 0) {
        // console.log(`  🛡️ Physique : ${physical} → ${reducedPhysical} (${(physicalReduction * 100).toFixed(1)}% résistant)`);
    // }
    // if (magical > 0) {
        // console.log(`  🔮 Magique : ${magical} → ${reducedMagical} (${(magicalReduction * 100).toFixed(1)}% résistant)`);
    // }
    // if (hybridalDamage > 0) {
        // console.log(`  ⚔️ Hybride : ${hybridalDamage} → ${reducedHybrid} (moitié magique/physique avec résistances)`);
    // }
    // if (piercingDamage > 0) {
        // console.log(`  💥 Brut : ${piercingDamage} (pas de réduction)`);
    // }

    return {
        reducedpiercingDamage: piercingDamage,
        reducedPhysicalDamage: reducedPhysical,
        reducedMagicalDamage: reducedMagical,
        reducedHybridalDamage: reducedHybrid
    };
}

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
// --- calcul des dégâts par source + pipeline ---
export function attemptAttackerDamages(attacker, attack) {
  // garde & normalisation
  const a = attacker || {};
  const s = a.stats || {};
  const atk = attack || {};

  // Lecture de la nature d’attaque (toujours en array)
  let nature = Array.isArray(atk.attacknature)
    ? [...atk.attacknature]
    : [atk.attacknature].filter(Boolean);

  // --- BASES PAR DÉFAUT ---
const flags = getAttackResolutionFlags(atk);

// --- BASES PAR DÉFAUT ---
let physBase = flags.isPurePhysicalBrutality
  ? brutalityTotalBonus(a)
  : Math.max(0, +s.physicalDamage || 0);

let magiBase = flags.isPureMagicalIntellect
  ? intellectTotalBonus(a)
  : Math.max(0, +s.magicalDamage || 0);
  if (flags.isPurePhysicalBrutality) {
  console.log(
    `💪 BRUTALITÉ : ${s.physicalDamage || 0} PP + ${brutalityBonus(a)} bonus = ${physBase}`
  );
}

if (flags.isPureMagicalIntellect) {
  console.log(
    `🧠 INTELLECT : ${s.magicalDamage || 0} PM + ${intellectBonus(a)} bonus = ${magiBase}`
  );
}
  const hasBaseNature =
  nature.includes("physicalDamage") ||
  nature.includes("magicalDamage") ||
  nature.includes("hybridalDamage");

const isPureTranspiercing =
  !hasBaseNature &&
  Math.max(0, +s.piercingDamage || 0) > 0;

let rawBase = isPureTranspiercing
  ? transpiercingTotal(a)
  : Math.max(0, +s.piercingDamage || 0);

  const magiBaseBeforeHyperco = magiBase;

  const physRatio = Math.max(0, +atk.physicalRatio || 0);
  const magiRatio = Math.max(0, +atk.magicalRatio || 0);

  // ===========================================================
  // 🔥 RÈGLE HYPERCOGNITION : SI hyperco > 0 → appliquer override
  // ===========================================================
  const hyperco = +(s.hypercognition || 0);
  const hypercoBase = hyperco > 0 ? Math.max(0, hyperco) : 0;

  if (hypercoBase > 0) {
    magiBase += hypercoBase;

    // ➤ Toute attaque physique devient HYBRIDE
    if (nature.includes("physicalDamage")) {
      nature = ["hybridalDamage"];
      console.log(`⚡ Hypercognition>0 → Transformation physicalDamage → hybridalDamage`);
    }

    console.log(
      `🧠 [HYPERCOGNITION] ${a.name} +${hypercoBase} sur base magique : ` +
      `${magiBaseBeforeHyperco} → ${magiBase} (magicalDamage + hyperco)`
    );
  }
  // ===========================================================

  // sources initiales
  let totalDamageSources = {
    piercingDamage: 0,
    physical: 0,
    magical: 0,
    hybridalDamage: 0,
  };

  console.log(
    `--- Calcul des dégâts pour ${a.name} utilisant ${atk.displayName || atk.functionName || "unknown"} ---`
  );

  // ✅ RAW (toujours actif si la stat existe)
  totalDamageSources.piercingDamage = Math.ceil(rawBase);
if (totalDamageSources.piercingDamage > 0) {

  if (isPureTranspiercing) {

    console.log(
      `🗡️ TRANSPERCEMENT : ` +
      `${s.piercingDamage || 0} piercing + ` +
      `${transpiercingAgiRatio(a)} agilité = ` +
      `${totalDamageSources.piercingDamage}`
    );

  } else {

    console.log(`Dégâts raw : ${totalDamageSources.piercingDamage}`);

  }
}
  // Détection hybride
  const hasHybrid = nature.includes("hybridalDamage");

  // --- HYBRIDE ---
  if (hasHybrid) {
    const phys = physBase + Math.ceil(physBase * physRatio);

    // total magique (base magique déjà inclut hyperco si hyperco>0)
    const magiBonusTotal = Math.ceil(magiBase * magiRatio);
    const magi = magiBase + magiBonusTotal;

    // Décomposition “PM vs hyperco” pour affichage
    const magStatBase = magiBaseBeforeHyperco;
    const magStatBonus = Math.ceil(magStatBase * magiRatio);
    const magStatTotal = magStatBase + magStatBonus;

    const hypercoBonus = Math.ceil(hypercoBase * magiRatio);
    const hypercoTotal = hypercoBase + hypercoBonus;

    const decomposedBonus = magStatBonus + hypercoBonus;
    const roundingNote =
      decomposedBonus !== magiBonusTotal
        ? ` ⚠️ (arrondi: ceil((base+hyperco)*ratio)=${magiBonusTotal} vs ceil(base*ratio)+ceil(hyperco*ratio)=${decomposedBonus})`
        : "";

    // Optionnel: utile pour debug / split (mais n'est PAS renvoyé dans finalSources)
    totalDamageSources.hybridParts = { physical: phys, magical: magi };

    totalDamageSources.hybridalDamage = Math.max(0, phys + magi);

    console.log(
      `⚔️ [HYBRID SPLIT @BUILD] ${a.name} → phys=${phys} (base=${physBase}, ratio=${physRatio}) | ` +
      `mag=${magi} = ${magStatTotal} (PM: ${magStatBase}+${magStatBonus}) + ` +
      `${hypercoTotal} (hyperco: ${hypercoBase}+${hypercoBonus})${roundingNote} | ` +
      `total=${totalDamageSources.hybridalDamage}`
    );
  }

  // --- PHYSIQUE --- (seulement si pas hybride)
  if (!hasHybrid && nature.includes("physicalDamage")) {
    const physBonus = physRatio > 0 ? Math.ceil(physBase * physRatio) : 0;
    const crossFromMag = magiRatio > 0 ? Math.ceil(magiBase * magiRatio) : 0;

    totalDamageSources.physical = Math.max(0, physBase + physBonus + crossFromMag);

    console.log(
      `Dégâts physiques = ${physBase}` +
      (physBonus ? ` + (${physBase} * ${physRatio})` : "") +
      (crossFromMag ? ` + (${magiBase} * ${magiRatio})` : "") +
      ` = ${totalDamageSources.physical}`
    );
  }

  // --- MAGIQUE --- (seulement si pas hybride)
  if (!hasHybrid && nature.includes("magicalDamage")) {
    const magiBonus = magiRatio > 0 ? Math.ceil(magiBase * magiRatio) : 0;
    const crossFromPhys = physRatio > 0 ? Math.ceil(physBase * physRatio) : 0;

    totalDamageSources.magical = Math.max(0, magiBase + magiBonus + crossFromPhys);

    console.log(
      `Dégâts magiques = ${magiBase}` +
      (magiBonus ? ` + (${magiBase} * ${magiRatio})` : "") +
      (crossFromPhys ? ` + (${physBase} * ${physRatio})` : "") +
      ` = ${totalDamageSources.magical}`
    );
  }

  console.log(`Détails des dégâts (avant mods):`, totalDamageSources);

  // Hook externe
  const { sources: moddedSources } = runAttackDamageModifiers({
    phase: "pre-resolve",
    attacker: a,
    attack: atk,
    sources: totalDamageSources,
  });

  const safe = (v) => Math.max(0, Math.floor(+v || 0));

  // ✅ ce sont les seules clés qui comptent en sortie
  const finalSources = {
    piercingDamage:      safe(moddedSources?.piercingDamage),
    physical:       safe(moddedSources?.physical),
    magical:        safe(moddedSources?.magical),
    hybridalDamage: safe(moddedSources?.hybridalDamage),
  };

  const totalDamage = Object.values(finalSources).reduce((n, v) => n + v, 0);

  console.log(`Détails des dégâts (après mods):`, finalSources, `→ total=${totalDamage}`);

  return { totalDamageSources: finalSources, totalDamage };
}

export function attemptResilience(attacker, target, attackDetail) {
  // Ne s’applique qu’aux altérations
  const types = Array.isArray(attackDetail?.type) ? attackDetail.type : (attackDetail?.type ? [attackDetail.type] : []);
  const isAlteration = types.includes('alteration');
  if (!isAlteration) return { enabled: false, percent: 0 };

  // Calcule le pourcentage de réduction propre à la cible
  let percent = Number(calculateResilienceAlterationTotalBonus(target)) || 0;

  // Sécurités (évite valeurs négatives / absurdes). Cap optionnel à 80% pour gameplay.
  if (percent < 0) percent = 0;
  if (percent === 0) {
    console.log(`⛨ ${target.name} → Résilience altérations : 0%`);
    return { enabled: false, percent: 0 };
  }

  console.log(`⛨ ${target.name} → Résilience altérations (base + INT) : ${percent}%`);
  return { enabled: true, percent };
}


export function agiDodgeRatioBonus(entite) {
  if (!entite) return 0;

  // adapte getSafe à ton helper (getSafe / safe / etc.)
  const agility = Number(getSafe(entite, "agility")) || 0;

  const bonus = agility * 0.4;     // même logique que ton crit
  return Math.min(round1(bonus), 15);
}

// 3) Total : 0 si stat dodge = 0
// Total : 0 si stat dodge = 0
export function calculateTotalDodgeBonus(entite) {
  if (!entite) return 0;

  const dodgePoints = Number(getSafe(entite, "dodge")) || 0;
  if (dodgePoints <= 0) return 0;

  const base = calculateDodgePercent(dodgePoints);
  const agi = agiDodgeRatioBonus(entite);

  return round1(base + agi);
  // optionnel si tu veux un cap global :
  // return Math.min(round1(base + agi), 100);
}

export function attemptDodge(attacker, target) {
  const baseDodgeStat = Number(getSafe(target, "dodge")) || 0;
const boostedDodgeStat = getEntityBattleBoostValue(target, "dodge", "flat");
const dodgeStat = baseDodgeStat + boostedDodgeStat;
  const precisionStat = Number(getSafe(attacker, "precision")) || 0;

  const baseDodgePercent = calculateDodgePercent(dodgeStat);
  const agiDodgePercent = dodgeStat > 0 ? agiDodgeRatioBonus(target) : 0; // IMPORTANT
  const totalDodgePercent = dodgeStat > 0 ? Math.round((baseDodgePercent + agiDodgePercent) * 10) / 10 : 0;

  const precisionPercent = calculatePrecisionPercent(precisionStat);

  let minDodgeFloor = 2;
  if (dodgeStat > 20 && dodgeStat <= 60) minDodgeFloor = 4;
  else if (dodgeStat > 60 && dodgeStat <= 100) minDodgeFloor = 6;
  else if (dodgeStat > 100) minDodgeFloor = 8;

  let minPrecisionFloor = 2;
  if (precisionStat > 20 && precisionStat <= 50) minPrecisionFloor = 4;
  else if (precisionStat > 50 && precisionStat <= 80) minPrecisionFloor = 6;
  else if (precisionStat > 80) minPrecisionFloor = 8;

  // Dodge impactée par la précision
  let adjustedDodgeChance = totalDodgePercent * (1 - precisionPercent / 100);

  // Plancher dodge
  adjustedDodgeChance = Math.max(minDodgeFloor, adjustedDodgeChance);

  // Garantir un "hit chance" minimum cohérent (évite dodge > 100 - floorPrecision)
  adjustedDodgeChance = Math.min(adjustedDodgeChance, 100 - minPrecisionFloor);

  const adjustedHitChance = Math.max(minPrecisionFloor, 100 - adjustedDodgeChance);

  const roll = Math.random() * 100;
  const dodgeSuccess = roll < adjustedDodgeChance;

  console.log(
  `🌀 ${target.name} → Esquive : ${totalDodgePercent}% ` +
  `(base ${baseDodgePercent}% + agi ${agiDodgePercent}%` +
  `${boostedDodgeStat ? ` | boost dodge +${boostedDodgeStat}` : ""})`
);
  console.log(`🎯 ${attacker.name} → Précision : ${precisionPercent}%`);
  console.log(`⚖️ Esquive finale : ${adjustedDodgeChance.toFixed(1)}% | Touché garanti min : ${adjustedHitChance.toFixed(1)}%`);
  console.log(`🎲 Jet : ${roll.toFixed(2)} → ${dodgeSuccess ? "✅ ESQUIVE RÉUSSIE" : "💥 TOUCHE"}`);

  if (dodgeSuccess) {
    animateDodge(target.id);
    EffectMessage(target, "Esquive !");
  }

  return dodgeSuccess;
}
const toMax1Decimal = (n) => {
  // évite les artefacts flottants (ex: 1.999999999)
  const v = Math.round(n * 10) / 10;
  return Number.isInteger(v) ? v : v;
};
export function calculateIndestructibilityPercentFromEntity(entite) {
  const points = Number(getSafe(entite, "indestructibility")) || 0;
  return calculateIndestructibilityPercent(points);
}
export function caluclateIndestructibilityStrengthReduction(entite) {
  if (!entite) return 0;

  const strength = Number(getSafe(entite, "strength")) || 0;
  if (strength <= 0) return 0;

  const capped = Math.min(strength, 150);
  const pct = (capped / 150) * 10;

  return toMax1Decimal(pct);
}

// Indestructibility: 0 -> 0% ; 150 -> 5%
export function caluclateIndestructibilityReduction(entite) {
  if (!entite) return 0;

  const ind = Number(getSafe(entite, "indestructibility")) || 0;
  if (ind <= 0) return 0;

  const capped = Math.min(ind, 150);
  const pct = (capped / 150) * 5;

  return toMax1Decimal(pct);
}
export function caluclateIndestructibilityReductionTotal(entite) {
  if (!entite) return 0;

  const ind = Number(getSafe(entite, "indestructibility")) || 0;
  if (ind <= 0) return 0;

  const total =
    caluclateIndestructibilityReduction(entite) +
    caluclateIndestructibilityStrengthReduction(entite);

  return toMax1Decimal(total);
}

export function attemptIndestructibility(attacker, target) {
  const points = getSafe(target, "indestructibility");
  const indestructPercent = calculateIndestructibilityPercent(points);

  let minIndestructFloor = 0;
  if (points > 0 && points <= 20) minIndestructFloor = 2;
  else if (points > 20 && points <= 60) minIndestructFloor = 4;
  else if (points > 60 && points <= 100) minIndestructFloor = 6;
  else if (points > 100) minIndestructFloor = 8;

  if (points <= 0) {
    // console.log(`💠 ${target.name} → Indestructibilité : 0% (aucun plancher)`);
    return false;
  }

  const roll = Math.random() * 100;
  const success = roll < Math.max(minIndestructFloor, indestructPercent);

  console.log(`💠 ${target.name} → Indestructibilité : ${indestructPercent.toFixed(2)}% (plancher ${minIndestructFloor}%)`);
  console.log(`🎲 Jet : ${roll.toFixed(2)} → ${success ? "✅ INDESTRUCTIBLE" : "❌ ÉCHEC"}`);

  if (success) {
    animateIndestructibility(target.id);
    EffectMessage(target, "Indestructible !");
    const effectsContainer = document.getElementById(`effectsContainer_${target.id}`);
    if (effectsContainer) {
      const indestructVFX = document.createElement("img");
      indestructVFX.src = `./media/assets/effects/indestructibility.gif?t=${Date.now()}`;
      indestructVFX.className = "effect-vfx indestructibility";
      indestructVFX.alt = `${target.name} est indestructible !`;
      indestructVFX.style.position = "absolute";
      effectsContainer.appendChild(indestructVFX);
      setTimeout(() => indestructVFX.remove(), 1200);
    }
  }

  return success;
}

// ================================
// RÉGÉNÉRATION DE COMBAT
// ================================

export function calculateHpBattleRegenStrengthRatio(entite) {
  if (!entite) return 0;
  const indestructibility = Math.max(0, Number(getSafe(entite, "indestructibility")) || 0);

  // La Force ne génère de régénération que si
  // l'entité possède Indestructibilité.
  if (indestructibility <= 0) return 0;

  const strength = Math.max(0, Number(getSafe(entite, "strength")) || 0);
  if (strength <= 0) return 0;

  const cappedStrength = Math.min(strength, 150);
  const ratio = (cappedStrength / 150) * 5;
  return Math.max(0, Math.min(5, Math.round(ratio)));
}
export function calculateHpBattleRegenIndestructibilityRatio(entite) {
  if (!entite) return 0;
  const indestructibility = Math.max(0, Number(getSafe(entite, "indestructibility")) || 0);
  if (indestructibility <= 0) return 0;

  const cappedIndestructibility = Math.min(indestructibility, 150);
  const ratio = 1 + ((cappedIndestructibility - 1) / 149) * 9;
  return Math.max(1, Math.min(10, Math.round(ratio)));
}

export function calculateHpBattleRegenGenerated(entite) {
  if (!entite) return 0;
  return Math.max(0, calculateHpBattleRegenStrengthRatio(entite) + calculateHpBattleRegenIndestructibilityRatio(entite));
}

export function calculateHpBattleRegenBase(entite) {
  if (!entite) return 0;
  const finalValue = Math.max(0, Number(getSafe(entite, "hpBattleRegen")) || 0);
  const generatedValue = calculateHpBattleRegenGenerated(entite);
  return Math.max(0, finalValue - generatedValue);
}

export function calculateHpBattleRegenPercent(entite) {
  if (!entite) return 0;
  return Math.max(0, Math.round(Number(getSafe(entite, "hpBattleRegen")) || 0));
}

export function calculateHpBattleRegenAmount(entite) {
  if (!entite) return 0;
  const maxHp = Math.max(0, Number(entite?.stats?.HP?.max) || 0);
  if (maxHp <= 0) return 0;
  const regenPercent = calculateHpBattleRegenPercent(entite);
  if (regenPercent <= 0) return 0;
  return Math.max(0, Math.round(maxHp * regenPercent / 100));
}
// === ESOTERISM ===

export function calculateEsoterismAgiRatio(entite) {
  if (!entite) return 0;

  const agi = Number(getSafe(entite, "agility") ?? getSafe(entite, "stats.agility")) || 0;

  const cap = 150;
  const t = clamp(agi, 0, cap) / cap; // 0..1
  const p = 2;
  const eased = 1 - Math.pow(1 - t, p);

  const maxBonus = 55;
  const raw = clamp(maxBonus * eased, 0, maxBonus);

  // arrondi entier au plus proche (0-4 => inférieur, 5-9 => supérieur)
  return Math.round(raw);
}
export function calculateEsoterismBaseReduction() {
  return 40;
}

export function calculateEsoterismtotalReduction(entite) {
  // Tout est déjà entier : 40 + (0..55) => 40..95
  return calculateEsoterismBaseReduction() + calculateEsoterismAgiRatio(entite);
}
export function attemptEsoterism(attacker, target) {
  const points = getSafe(target, "esoterism");
  const esoterismPercent = calculateEsoterismPercent(points);

  let minEsoterismFloor = 0;
  if (points > 0 && points <= 20) minEsoterismFloor = 2;
  else if (points > 20 && points <= 60) minEsoterismFloor = 4;
  else if (points > 60 && points <= 100) minEsoterismFloor = 6;
  else if (points > 100) minEsoterismFloor = 8;

  if (points <= 0) {
    console.log(`🔮 ${target.name} → Ésotérisme : 0% (aucun plancher)`);
    return false;
  }

  const roll = Math.random() * 100;
  const success = roll < Math.max(minEsoterismFloor, esoterismPercent);

  console.log(`🔮 ${target.name} → Ésotérisme : ${esoterismPercent.toFixed(2)}%`);
  console.log(`🎲 Jet : ${roll.toFixed(2)} → ${success ? "✅ RÉUSSITE" : "❌ ÉCHEC"}`);

  if (success) {
    animateEsoterism(target.id);
    EffectMessage(target, "Ésotérisme !");
    const effectsContainer = document.getElementById(`effectsContainer_${target.id}`);
    if (effectsContainer) {
      const esoterismVFX = document.createElement("img");
      esoterismVFX.src = `./media/assets/effects/esoterism.gif?t=${Date.now()}`;
      esoterismVFX.className = "effect-vfx esoterism";
      esoterismVFX.alt = `${target.name} réduit les dégâts magiques !`;
      esoterismVFX.style.position = "absolute";
      effectsContainer.appendChild(esoterismVFX);
      setTimeout(() => esoterismVFX.remove(), 2100);
    }
  }

  return success;
}
// === Transcendence ===
export function attemptTranscendenceConsoProtection(entite, rng = Math.random, config = {}) {
  // Total = base (transcendence points) + bonus intel
  const p = calculateTranscendenceConsoProtectionTotal(entite); // %

  if (p <= 0) return false;

  const roll = rng() * 100;
  const success = roll < p;

  console.log(`✨ ${entite.name} → Transcendance (protection conso) : ${p.toFixed(2)}%`);
  console.log(`🎲 Jet : ${roll.toFixed(2)} → ${success ? "✅ PROTECTION" : "❌ ÉCHEC"}`);

  if (success) {
    EffectMessage(entite, "Transcendance !");

    const effectsContainer = document.getElementById(`effectsContainer_${entite.id}`);
    if (effectsContainer) {
      const vfx = document.createElement("img");
      vfx.src = `./media/assets/effects/transcendence.gif?t=${Date.now()}`;
      vfx.className = "effect-vfx transcendence";
      vfx.style.opacity = "1";
      vfx.style.transition = "opacity 0.7s linear"; // 4.5 - 3.8 = 0.7
      effectsContainer.appendChild(vfx);

      // 🔻 À 3.8s, on lance le fade-out (1 → 0 jusqu'à 4.5s)
      setTimeout(() => {
        vfx.style.opacity = "0";
      }, 3500);

      // 🧹 On retire à 4.5s
      setTimeout(() => vfx.remove(), 4500);
    }
  }

  return success;
}

export function transcendenceConsoProtection(entiteOrValue, config = {}) {
  const {
    refTranscendence = 150,
    refPercent = 5,
    maxPercent = 100,
  } = config;

  const t =
    typeof entiteOrValue === "number"
      ? entiteOrValue
      : (getSafe(entiteOrValue, "stats.transcendence", null) ??
         getSafe(entiteOrValue, "transcendence", 0));

  const transcendence = Math.max(0, toNumber(t, 0));
  const rawPercent = (transcendence / Math.max(1, refTranscendence)) * refPercent;
  const capped = Math.min(rawPercent, maxPercent);

  // ✅ 2 décimales SANS ARRONDI
  return trunc2(capped);
}
export function calculateTranscendenceConsoProtectionTotal(entite) {
  if (!entite) return 0.00;

  const points = Number(getSafe(entite, "transcendence")) || 0;
  if (points <= 0) return 0.00;

  const base = transcendenceConsoProtection(points);
  const intelBonus = transcendenceConsoIntel(entite);

  const total = clamp(base + intelBonus, 0, 100);

  // 2 décimales (float)
  return Math.round(total * 100) / 100;
}
export function transcendenceConsoIntel(entite) {
  if (!entite) return 0.00;
  const intel = Number(getSafe(entite, "intelligence")) || 0;

  const t = clamp(intel, 0, 150) / 150; // 0..1
  const p = 2;
  const eased = 1 - Math.pow(1 - t, p);

  const bonus = 5 * eased;
  const clamped = clamp(bonus, 0, 5);

  // 2 décimales max
  return Math.round(clamped * 100) / 100;
}

// === ASTRALITY ===
export function attemptAstrality(attacker, target) {
  const points = Number(getSafe(target, "astrality")) || 0;
  const astralityPercent = calculateAstralityTotal(target);

  let minAstralityFloor = 0;
  if (points > 0 && points <= 20) minAstralityFloor = 2;
  else if (points > 20 && points <= 60) minAstralityFloor = 4;
  else if (points > 60 && points <= 100) minAstralityFloor = 6;
  else if (points > 100) minAstralityFloor = 8;

  if (points <= 0) {
    console.log(`✨ ${target?.name ?? "Défenseur"} → Astralité : 0% (aucun plancher)`);
    return false;
  }

  const roll = Math.random() * 100;
  const success = roll < Math.max(minAstralityFloor, astralityPercent);

  console.log(`✨ ${target?.name ?? "Défenseur"} → Astralité : ${astralityPercent.toFixed(2)}%`);
  console.log(`🎲 Jet : ${roll.toFixed(2)} → ${success ? "✅ PROC ASTRALITÉ" : "❌ ÉCHEC"}`);

  if (success) {
    try { typeof animateAstrality === "function" && animateAstrality(target.id); } catch {}
    try { typeof EffectMessage === "function" && EffectMessage(target, "Astralité !"); } catch {}

    const effectsContainer = document.getElementById(`effectsContainer_${target.id}`);
    if (effectsContainer) {
      const astralityVFX = document.createElement("img");
      astralityVFX.src = `./media/assets/effects/astrality.gif?t=${Date.now()}`;
      astralityVFX.className = "effect-vfx astrality";
      astralityVFX.alt = `${target.name} déclenche l'Astralité !`;
      astralityVFX.style.position = "absolute";
      effectsContainer.appendChild(astralityVFX);
      setTimeout(() => astralityVFX.remove(), 2500);
    }
  }

  return success;
}

export function attemptBloodFuryExec(attacker, target, options = {}) {
  const ignoreHpThreshold = Boolean(options.ignoreHpThreshold);

  const bloodFury = getSafe(attacker, "bloodFury");
  const strength = getSafe(attacker, "strength");

  if (bloodFury <= 0) return 0;

  const bloodFuryExecChanceBonus = calculateBloodFuryExecChanceBonus(strength);
  const bloodFuryExecDamage = calculateExecutionDamage(attacker);
  const bloodFuryProcChance = calculateBloodFuryExecutionPercent(attacker);

  const hpPercent = (target.stats.HP.current / target.stats.HP.max) * 100;

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

  try {
    const effectsContainer = document.getElementById(`effectsContainer_${target.id}`);

    if (effectsContainer) {
      const procVFX = document.createElement("img");
      procVFX.src = `./media/assets/effects/bloodFuryExec.gif?t=${Date.now()}`;
      procVFX.className = "effect-vfx bloodfuryexec";
      procVFX.style.position = "absolute";
      procVFX.style.zIndex = "20";
      effectsContainer.appendChild(procVFX);

      setTimeout(() => procVFX.remove(), 2000);
    }

    damageImpact(target.id, {
      effectName: "damage-explode",
      src: "./media/assets/effects/damage-execution.gif",
      className: "blood-impact damage-explode",
      lifetime: 2000,
      offsetY: "10px",
      randomBloodImpact: false,
    });
  } catch (e) {
    console.warn("⚠️ Effet d’exécution non chargé :", e);
  }

  return Math.ceil(bloodFuryExecDamage);
}

export function calculateBloodThirstyFlat() {
  return 3;
}

export function calculateBloodThirstyBFRatio(bloodFury) {
  const bf = Number(bloodFury || 0);
  return Math.round((bf / 150) * 30);
}

export function calculateBloodThirstyStrengthRatio(strength) {
  const str = Number(strength || 0);
  return Math.round((str / 150) * 15);
}

export function calculateBloodThirstyPercent(entiteOrValue, strengthValue = null) {
  // Si on donne un nombre seul, c’est une BT finale directe.
  if (typeof entiteOrValue === "number" && strengthValue === null) {
    return Number(entiteOrValue || 0);
  }

  const bloodFury =
    typeof entiteOrValue === "number"
      ? Number(entiteOrValue || 0)
      : Number(entiteOrValue?.bloodFury ?? entiteOrValue?.stats?.bloodFury ?? 0);

  const strength =
    strengthValue !== null
      ? Number(strengthValue || 0)
      : Number(entiteOrValue?.strength ?? entiteOrValue?.stats?.strength ?? 0);

  if (bloodFury <= 0) return 0;

  return (
    calculateBloodThirstyFlat() +
    calculateBloodThirstyBFRatio(bloodFury) +
    calculateBloodThirstyStrengthRatio(strength)
  );
}


export function calculateBloodFuryBFtRatio(bloodFury) {
  const bf = Math.max(0, Number(bloodFury) || 0);
  if (bf === 0) return 0;
  const base = 5 + 15 * Math.sqrt(bf / 150);
  return Math.min(Math.ceil(base * 100) / 100, 20);
}

export function calculateBloodFuryStrengthRatio(strength) {
  const str = Math.max(0, Number(strength) || 0);
  const bonus = str * 0.5;
  return Math.ceil(bonus * 100) / 100;
}

export function calculateBloodFuryExecutionPercent(entite) {
  const bloodFury = Math.max(0, Number(getSafe(entite, "bloodFury", 0)) || 0);
  if (bloodFury <= 0) return 0;

  const strength = Math.max(0, Number(getSafe(entite, "strength", 0)) || 0);

  const bfRatio = calculateBloodFuryBFtRatio(bloodFury);
  const strRatio = calculateBloodFuryStrengthRatio(strength);

  return Math.ceil((bfRatio + strRatio) * 100) / 100;
}


export function calculateBloodFuryExecStrengthRatio(strength) {
  const str = Math.max(0, Number(strength) || 0);
  if (str === 0) return 0;
  const ratio = (str / 150) * 5;
  const capped = Math.min(ratio, 5);
  return Math.ceil(capped * 100) / 100;
}

// export function calculateBloodFuryExecChanceBonus(strength) {
  // const strengthRatio = calculateBloodFuryExecStrengthRatio(strength);
  // return Math.ceil((15 + strengthRatio) * 100) / 100;
// }
export function calculateBloodFuryExecChanceBonus(strength) {
  return 80;
}
export function calculateBloodFuryExecutionSRatio(bloodFuryExecSRatioBonus) {
  const bonus = bloodFuryExecSRatioBonus || 0;
  return Math.ceil(200 + (200 * bonus));
}

export function calculateExecutionDamage(entite) {
  const bloodFury = Math.max(0, Number(getSafe(entite, "bloodFury", 0)) || 0);
  if (bloodFury <= 0) return 0;

  const strength = Math.max(0, Number(getSafe(entite, "strength", 0)) || 0);
  const bloodFuryExecSRatioBonus = calculateBloodFuryExecStrengthRatio(strength);

  const baseMultiplier = 2.0;
  const physicalDamage = Math.max(0, Number(getSafe(entite, "physicalDamage", 0)) || 0);

  const execPercent = calculateBloodFuryExecutionSRatio(bloodFuryExecSRatioBonus);
  const percentMultiplier = execPercent / 100;

  return Math.ceil(baseMultiplier * (percentMultiplier * physicalDamage));
}

export function calculateAmbidextryProcBonus(entite) {
  const ambidextryValue = getSafe(entite, "ambidextry");
  return calculateAmbidextryPercent(ambidextryValue || 0);
}

// Chance additionnelle via l'agilité
export function calculateAmbidextryAgiChance(entite) {
  const agility = getSafe(entite, "agility");
  const bonus = (agility || 0) * 0.4 / 100;
  return Math.ceil(bonus * 100);
}

// Chance totale de double attaque (ambidextry + agilité)
export function calculateAmbidextryTotalChance(entite) {
  const ambidextryProcBonus = calculateAmbidextryProcBonus(entite);

  // Si la base est à 0, on force le total à 0 (on ignore le bonus AGI).
  if (!ambidextryProcBonus || ambidextryProcBonus <= 0) return 0;

  const ambidextryAgiProcBonus = calculateAmbidextryAgiChance(entite);
  return ambidextryProcBonus + ambidextryAgiProcBonus;
}

// Ratio de dégâts du second coup (lié à ambidextry)
export function calculateAmbidextryRatioBonus(entite) {
  const ambidextryValue = getSafe(entite, "ambidextry");
  const base = calculateAmbidextryPercent(ambidextryValue || 0);
  return Math.ceil(base * 0.4);
}

// Ratio additionnel selon l’agilité
export function calculateAmbidextryAgiRatioBonus(entite) {
  const agility = getSafe(entite, "agility");
  const ratio = (agility || 0) * 0.5 / 100;
  return Math.ceil(ratio * 100);
}

// Total des dégâts de la double attaque (ratio total)
export function calculateAmbidextryDamageBonus(entite) {
  const ambidextryRatioBonus = calculateAmbidextryRatioBonus(entite);
  const ambidextryAgiRatioBonus = calculateAmbidextryAgiRatioBonus(entite);
  return 20 + ambidextryRatioBonus + ambidextryAgiRatioBonus;
}


export function attemptMeleeAmbidextry(attacker, target, totalDamage, attack, totalDamageSources) {
    try {
        // 🚫 Ne rien faire si l’attaque est purement magique
        if (attack.damageType && attack.damageType.toLowerCase() === "magical") {
            console.log(`✨ ${attacker.name} ne peut pas déclencher d’ambidextrie sur une attaque magique.`);
            return;
        }

        const ambidextryChance = calculateAmbidextryTotalChance(attacker);
        const roll = Math.random() * 100;

        if (roll < ambidextryChance) {
            console.log(`💥 ${attacker.name} déclenche une double attaque ! (${roll.toFixed(2)} < ${ambidextryChance.toFixed(2)}%)`);

            // 🌀 Animation spéciale pour l'ambidextrie
            animationMelee(attacker, target, true);

            // ✨ Effet visuel
         AmbidextryVFX(target);

            // 🕐 Lancement du second coup
            setTimeout(() => {
                if (!attacker.isDEAD && !target.isDEAD) {
                    const damageBonusPercent = calculateAmbidextryDamageBonus(attacker);

                    // ✅ Calcule le nouveau totalDamage pour le second coup
                    const secondHitDamage = totalDamage * (damageBonusPercent / 100);

                    console.log(
                        `⚔️ ${attacker.name} inflige un second coup d'ambidextrie (${damageBonusPercent.toFixed(1)}% des dégâts du premier coup) à ${target.name} : ${secondHitDamage.toFixed(2)} dégâts.`
                    );
                    // ✅ Appel applydamage avec attack 'speciale'
applyDamage(
    target,
    secondHitDamage,
    attacker,
    {
        ...attack,
        isAmbidextry: true,
        logVariant: "ambidextry_second_hit",
        ambidextryHitIndex: 2,
    },
    totalDamageSources,
    attack.selfEffects
);
                } else {
                    console.log(`❌ Double attaque annulée (attaquant ou cible morte).`);
                }
            }, 500);
        } else {
            // console.log(`🎲 ${attacker.name} ne déclenche pas d'attaque ambidextre (${roll.toFixed(2)} ≥ ${ambidextryChance.toFixed(2)}%)`);
        }
    } catch (error) {
        console.error(`Erreur pendant la vérification d’ambidextrie pour ${attacker.name} :`, error);
    }
}

export function attemptRangeAccuracy(attacker, target, options = {}) {
  if (!attacker) return true;

  const baseChance = calculateRangeAccuracy(attacker);

  const transpiercingBonus = options.transpiercing
    ? calculateTranspiercingAccuracyBonus(attacker)
    : 0;

  const chance = Math.min(100, round1(baseChance + transpiercingBonus));
  const roll = round1(Math.random() * 100);

  const success = roll <= chance;

  attacker.lastRangeAccuracy = {
    baseChance,
    transpiercingBonus,
    chance,
    roll,
    success,
    targetId: target?.id,
    time: Date.now()
  };

  if (!success) {
    console.log(
      `MISS (Adresse) : ${attacker.name} rate ${target?.name || "la cible"} ` +
      `(jet ${roll}% > ${chance}% | base ${baseChance}% + transperçante ${transpiercingBonus}%).`
    );
  } else if (options.transpiercing) {
    console.log(
      `🎯 Transperçante Accuracy : ${chance}% ` +
      `(base ${baseChance}% + bonus piercing ${transpiercingBonus}%, jet ${roll}%).`
    );
  }

  return success;
} 
export function calculateTranspiercingAccuracyBonus(attacker) {
  const piercingPower = Math.max(0, Number(attacker?.stats?.piercingDamage || 0));

  // Réglage simple :
  // 1 piercingDamage = +1% accuracy
  // cap à +40%
  return Math.min(40, piercingPower);
}

export function transpiercingAgiRatio(entite) {
  const agility = Math.max(0, Number(entite?.stats?.agility || 0));

  // 80% de l'agilité, entier
  return Math.round(agility * 0.8);
}

export function transpiercingTotal(entite) {
  const piercingPower = Math.max(0, Number(entite?.stats?.piercingDamage || 0));

  return transpiercingAgiRatio(entite) + piercingPower;
}

export async function attemptRangeAmbidextry(attacker, target, attack, totalDamage, totalDamageSources) {
    try {
        const ambiChance = calculateAmbidextryTotalChance(attacker);
        const roll = Math.random() * 100;

        if (roll >= ambiChance) {
            console.log(`🎲 ${attacker.name} ne déclenche pas d'ambidextrie (${roll.toFixed(2)} ≥ ${ambiChance.toFixed(2)}%)`);
            return false; // ❌ Ambidextrie échouée
        }

        // 💥 Ambidextrie réussie
        console.log(`💥 ${attacker.name} déclenche une double attaque à distance ! (${roll.toFixed(2)} < ${ambiChance.toFixed(2)}%)`);
		
        const ambiBonus = calculateAmbidextryDamageBonus(attacker);
        const ambiDamage = (totalDamage * ambiBonus) / 100;

        return true; // ✅ Ambidextrie réussie
    } catch (error) {
        console.error(`Erreur lors du déclenchement de l’ambidextrie à distance pour ${attacker.name} :`, error);
        return false;
    }
}

export function AmbidextryVFX(target) {
	try {
		if (typeof EffectMessage === "function") EffectMessage(target, "Ambidextrie !");
		if (typeof animateAmbidextry === "function") animateAmbidextry(target.id);

		const effectsContainer = document.getElementById(`effectsContainer_${target.id}`);
		if (!effectsContainer) return;

		const ambiVFX = document.createElement("img");
		ambiVFX.src = `./media/assets/effects/ambidextry.gif?t=${Date.now()}`;
		ambiVFX.className = "effect-vfx ambidextry";
		Object.assign(ambiVFX.style, {
			position: "absolute",
			top: "50%",
			left: "50%",
			transform: "translate(-50%, -50%)",
			zIndex: "20",
			opacity: "0",
			transition: "opacity 0.2s ease-in-out"
		});

		effectsContainer.appendChild(ambiVFX);
		requestAnimationFrame(() => (ambiVFX.style.opacity = "1"));

		setTimeout(() => {
			ambiVFX.style.opacity = "0";
			setTimeout(() => ambiVFX.remove(), 200);
		}, 1800);
	} catch (vfxError) {
		console.warn(`⚠️ Erreur lors de l’affichage du VFX d’ambidextrie :`, vfxError);
	}
}


export function calculateCritAgiChanceBonus(entite) {
  if (!entite) return 0;
  const agility = Number(getSafe(entite, "agility")) || 0;

  const bonus = agility * 0.3; // 0.3% / point
  return Math.round(bonus * 10) / 10;
}

export function calculateCritTotalChance(
  entite,
  criticalPowerOverride = null
) {
  if (!entite) return 0;

  const criticalPowerValue = Math.max(
    0,
    Number(
      criticalPowerOverride ??
      getSafe(entite, "criticalPower", 0)
    ) || 0
  );

  const flatCriticalChance = Math.max(
    0,
    Number(getSafe(entite, "criticalChance", 0)) || 0
  );

  const criticalPowerChance =
    criticalPowerValue > 0
      ? (
          calculateCritChancePercent(criticalPowerValue) +
          calculateCritAgiChanceBonus(entite)
        )
      : 0;

  return round1(
    flatCriticalChance +
    criticalPowerChance
  );
}
// Bonus de ratio basé sur la chance critique (50% du bonus principal)
export function calculateCritRatioBonus(entite, critValueOverride = null) {
  if (!entite) return 0;
  const critValue = Number(critValueOverride ?? getSafe(entite, "criticalPower")) || 0;

  const base = calculateCritChancePercent(critValue);
  const bonus = base * 0.5;
  return Math.round(bonus * 10) / 10;
}

// Bonus ratio via agilité (0.4% par point)
export function calculateCritAgiRatioBonus(entite) {
  if (!entite) return 0;
  const agility = Number(getSafe(entite, "agility")) || 0;

  const bonus = agility * 0.4;
  return Math.round(bonus * 10) / 10;
}

// Bonus via précision (50% de la précision)
export function calculateCritPrecisionBonus(entite) {
  if (!entite) return 0;
  const precision = Number(getSafe(entite, "precision")) || 0;

  const bonus = precision * 0.5;
  return Math.round(bonus * 10) / 10;
}

export function calculateCritDamageBonus(
  entite,
  criticalPowerOverride = null
) {
  if (!entite) return 0;

  const criticalPowerValue = Math.max(
    0,
    Number(
      criticalPowerOverride ??
      getSafe(entite, "criticalPower", 0)
    ) || 0
  );

  const nativeBase = 50;

  const flatCriticalDamage = Math.max(
    0,
    Number(getSafe(entite, "criticalDamage", 0)) || 0
  );

  const criticalPowerDamage =
    criticalPowerValue > 0
      ? (
          calculateCritPrecisionBonus(entite) +
          calculateCritRatioBonus(entite, criticalPowerValue) +
          calculateCritAgiRatioBonus(entite)
        )
      : 0;

  return round1(
    nativeBase +
    flatCriticalDamage +
    criticalPowerDamage
  );
}
export function attemptCriticalHit(attacker, target, totalDamage) {
  if (!attacker) {
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
  const occultismCritBoost = getEntityBattleBoostValue(attacker, "criticalPower", "percent");

  const critChanceBonus = critValue > 0
    ? calculateCritChancePercent(critValue)
    : 0;

  const critAgiChanceBonus = critValue > 0
    ? calculateCritAgiChanceBonus(attacker)
    : 0;

  const critTotalChance = calculateCritTotalChance(attacker, critValue);

  const critRatioBonus = calculateCritRatioBonus(attacker, critValue);
  const critAgiRatioBonus = calculateCritAgiRatioBonus(attacker);
  const critPrecisionBonus = calculateCritPrecisionBonus(attacker);

  const critDamageBonus = calculateCritDamageBonus(attacker, critValue);

  const randomRoll = Math.random() * 100;
  const isCritical = randomRoll <= critTotalChance;
console.log(
  `💥 ${attacker.name} → Critique : ${critTotalChance}% | roll ${randomRoll.toFixed(2)} → ${
    isCritical ? "✅ CRITIQUE" : "❌ normal"
  }${occultismCritBoost > 0 ? ` | Occultisme +${occultismCritBoost}%` : ""}`
);
  const baseDamage = Number(totalDamage) || 0;
  const finalDamage = isCritical
    ? Math.round(baseDamage * (1 + critDamageBonus / 100))
    : baseDamage;

  if (
    occultismCritBoost > 0 &&
    typeof attacker.removeOccultismCritBoost === "function"
  ) {
    attacker.removeOccultismCritBoost();
    attacker.removeOccultismCritBoost = null;

    console.log(
      `🌑 Critique occulte consommé : ${attacker.name} | +${occultismCritBoost}%`
    );
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
      critPrecisionBonus
    }
  };
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




// 🧱 Résilience — Bloc complet
// 🎯 2. Bonus Force : ajoute jusqu’à +50 % à 150 de Force
export function calculateResilienceStrengthCritBonus(entite) {
  const strength = getSafe(entite, "strength");
  const ratio = Math.min(50, (strength / 150) * 50); // progression linéaire
  return Math.round(ratio);
}

// 🎯 3. Total Crit Damage Reduction (base + Force)
export function calculateResilienceCritTotalBonus(entite) {
  const base = calculateResiliencePercent(getSafe(entite, "resilience"));
  const strBonus = calculateResilienceStrengthCritBonus(entite);
  const total = base + strBonus;
  return Math.round(total);
}

// 🎯 4. Réduction des altérations — 30 % max avec la résilience
export function calculateResilienceAlterationBonus(entite) {
  const resilience = Number(getSafe(entite, "resilience")) || 0;
  if (resilience <= 1) return 3; // minimum visible dès le début

  const maxResi = 150;

  const minBonus = 3;     // à bas resi
  const maxBonus = 30;    // cap à haut resi

  const softCapResi = 70;
  // Calage: ~25 à resi=50 (arrondi au dixième)
  const softCapBonus = 27;

  const r = Math.min(resilience, maxResi);

  let bonus;

  if (r <= softCapResi) {
    // Phase 1: linéaire (monte fort)
    const t = r / softCapResi; // 0..1
    bonus = minBonus + t * (softCapBonus - minBonus);
  } else {
    // Phase 2: rendements décroissants (ease-out)
    const u = (r - softCapResi) / (maxResi - softCapResi); // 0..1
    const easeOut = u * (2 - u); // 0..1
    bonus = softCapBonus + easeOut * (maxBonus - softCapBonus);
  }

  // Arrondi au dixième
  return Math.round(bonus * 10) / 10;
}

// 🎯 5. Bonus Intelligence : jusqu’à +70 % à 150 INT, progression douce
export function calculateResilienceIntelligenceAlterBonus(entite) {
  const intelligence = getSafe(entite, "intelligence");
  const maxInt = 150;
  const ratio = Math.pow(intelligence / maxInt, 0.85); // progression douce
  const percent = ratio * 70;
  return Math.round(percent * 10) / 10;
}

// 🎯 6. Total Altération Reduction (base + Intelligence)
export function calculateResilienceAlterationTotalBonus(entite) {
  const base = calculateResilienceAlterationBonus(entite);
  const intBonus = calculateResilienceIntelligenceAlterBonus(entite);
  const total = base + intBonus;
  return Math.round(total * 10) / 10;
}

// 🎯 7. Chance d’annulation totale : 0.3 % → 5 %
export function calculateResilienceCancelBonus(entite) {
  const resilience = Number(getSafe(entite, "resilience")) || 0;
  if (resilience <= 0) return 0;

  const maxResi = 150;

  const minBonus = 0.3;
  const maxBonus = 15;

  const softCapResi = 70;
  const softCapBonus = 10.5; // réglage simple (70 -> 10.5, 150 -> 15)

  const r = Math.min(resilience, maxResi);

  let bonus;
  if (r <= softCapResi) {
    const t = r / softCapResi; // 0..1
    bonus = minBonus + t * (softCapBonus - minBonus);
  } else {
    const u = (r - softCapResi) / (maxResi - softCapResi); // 0..1
    const easeOut = u * (2 - u); // 0..1
    bonus = softCapBonus + easeOut * (maxBonus - softCapBonus);
  }

  return round1(bonus);
}


export function calculateResiAgiCancelBonus(entite) {
  if (!entite) return 0;

  const agility = Number(getSafe(entite, "agility")) || 0;
  if (agility <= 0) return 0;

  const ratio = 5 / 150; // = 0.033333...
  const bonus = agility * ratio;

  // Cap optionnel (garde la même logique que tes autres bonus)
  return Math.min(round1(bonus), 15);
}

// Total : 0 si resilience = 0, sinon base(resilience) + bonus agi
export function calculateResilienceTotalCancelBonus(entite) {
  if (!entite) return 0;

  const resilience = Number(getSafe(entite, "resilience")) || 0;
  if (resilience <= 0) return 0;

  const base = calculateResilienceCancelBonus(entite); // <-- entite, pas "resilience"
  const agiBonus = calculateResiAgiCancelBonus(entite);

  return round1(base + agiBonus);
  // optionnel cap global :
  // return Math.min(round1(base + agiBonus), 100);
}
export function attemptResilienceCancel(attacker, target, effect) {
  // Lecture du bonus de résilience pur
  const chance = calculateResilienceTotalCancelBonus(target); // entre 0.3 % et 5 %, selon la résilience
  const roll = Math.random() * 100;
  const success = roll < chance;

  console.log(
    `⛨ [Cancel Alté] ${target.name} — chance ${chance.toFixed(2)}% | jet ${roll.toFixed(2)} → ${success ? "✅ ANNULÉE" : "❌ passe"}`
  );

  // Si la résilience réussit → VFX sur la target
  if (success) {
    const effectsContainer = document.getElementById(`effectsContainer_${target.id}`);
    if (effectsContainer) {
      const resilienceVFX = document.createElement("img");
      resilienceVFX.src = `./media/assets/effects/resilience-cancel.gif?t=${Date.now()}`;
      resilienceVFX.className = "effect-vfx resilience";
      resilienceVFX.style.position = "absolute";
      resilienceVFX.style.pointerEvents = "none";
      resilienceVFX.style.zIndex = "10";
      effectsContainer.appendChild(resilienceVFX);
      setTimeout(() => resilienceVFX.remove(), 2100);
    }

    EffectMessage(target, "Résilience Totale!");
  }

  return success; // true = altération annulée
}

export function attemptResilienceCritReduction(attacker, target, damage) {
  const resilience = getSafe(target, "resilience") || 0;

  // Si la cible n’a aucune résilience, pas de réduction
  if (resilience <= 0) return damage;

  // Calcul du pourcentage total de réduction via la résilience
  const reductionPercent = calculateResilienceCritTotalBonus(target); // ex: 32 (%)
  const reductionFactor = Math.max(0, 1 - (reductionPercent / 100)); // convertit en facteur multiplicatif

  // Application de la réduction
  const reducedDamage = Math.round(damage * reductionFactor);

  console.log(
    `🛡️ [Résilience Crit] ${target.name} — résilience ${resilience} → -${reductionPercent}% dégâts critiques (${damage} → ${reducedDamage}).`
  );

  // EffectMessage(target, "Résilience !");
  return reducedDamage;
}
const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10;

// Base fixe : 50.0
export function basecalculateRangeRatio() {
  return 30.0;
}

// Bonus via agilité : 0.0 → 20.0 (agi 0 → 150), linéaire, 1 décimale
export function rangeAgiRatio(entite) {
  if (!entite) return 0.0;
  const agility = Number(getSafe(entite, "agility")) || 0;

  const t = clamp(agility, 0, 150) / 150;   // 0..1
  const bonus = 20 * t;                     // float
  return round1(clamp(bonus, 0, 20));       // 0.0..20.0
}

export function rangePrecisionRatio(entite) {
  if (!entite) return 0.0;
  const precision = Number(getSafe(entite, "precision")) || 0;

  const t = clamp(precision, 0, 150) / 150; // 0..1
  const p = 2;
  const eased = 1 - Math.pow(1 - t, p);

  const bonus = 40 * eased;                 // float
  return round1(clamp(bonus, 0, 40));       // 0.0..40.0
}


export function calculateRangeRatio(entite) {
  if (!entite) return 0.0;

  const total =
    basecalculateRangeRatio() +
    rangeAgiRatio(entite) +
    rangePrecisionRatio(entite);

  return round1(clamp(total, 0, 100)); 
}

export function baseRangeAccuracy() {
  return 49.0;
}

export function agiRangeAccuracy(entite) {
  if (!entite) return 0.0;
  const agility = Number(getSafe(entite, "agility")) || 0;

  const t = clamp(agility, 0, 150) / 150; // 0..1
  const p = 2;
  const eased = 1 - Math.pow(1 - t, p);

  const bonus = 15 * eased;
  return round1(clamp(bonus, 0, 15));     // 0.0..15.0
}

export function precisionRangeAccuracy(entite) {
  if (!entite) return 0.0;
  const precision = Number(getSafe(entite, "precision")) || 0;

  const t = clamp(precision, 0, 150) / 150; // 0..1
  const p = 2;
  const eased = 1 - Math.pow(1 - t, p);

  const bonus = 50 * eased;
  return round1(clamp(bonus, 0, 50));     // 0.0..50.0
}

export function calculateRangeAccuracy(entite) {
  if (!entite) return 0.0;

  const total =
    baseRangeAccuracy() +
    agiRangeAccuracy(entite) +
    precisionRangeAccuracy(entite);

  return round1(clamp(total, 0, 100));    // 0.0..100.0
}
export function baseHybridRangePenalty() {
  const base = basecalculateRangeRatio();      // ex: 30.0
  return round1(clamp(base * 0.5, 0, 50));     // ex: 15.0
}

export function hybridAgiRangePenalty(entite) {
  const agi = rangeAgiRatio(entite);           // 0..20
  return round1(clamp(agi * 0.5, 0, 10));      // 0..10
}

export function hybridPrecisionRangePenalty(entite) {
  const prec = rangePrecisionRatio(entite);    // 0..40
  return round1(clamp(prec * 0.5, 0, 20));     // 0..20
}

// Total du malus "effectif" sur l’attaque complète (max 50)
export function calculateHybridalRangePenalty(entite) {
  if (!entite) return 0.0;

  const total =
    baseHybridRangePenalty() +
    hybridAgiRangePenalty(entite) +
    hybridPrecisionRangePenalty(entite);

  return round1(clamp(total, 0, 50));
}

// Ratio final : 100% -> 50%

export function calculateHybridalRangeRatio(entite) {
  if (!entite) return 0.0;

  const rangeRatio = calculateRangeRatio(entite); // 0..100
  const total = 100 - (rangeRatio * 0.5);         // 100..50

  return round1(clamp(total, 0, 100));
}
export function calculateHypercognitionRatio(value, config = {}) {
  const {
    maxValue = 150,
    maxOutput = 3,
    midpoint = 50,
    steepness = 0.045
  } = config;

  const logistic = (x) => 1 / (1 + Math.exp(-steepness * (x - midpoint)));

  const minVal = logistic(0);
  const maxVal = logistic(maxValue);
  const normalized = (logistic(value) - minVal) / (maxVal - minVal);

  let output = normalized * maxOutput;

  const refAt1 = ((logistic(1) - minVal) / (maxVal - minVal)) * maxOutput;
  const scale = (maxOutput - 0.5) / (maxOutput - refAt1);

  output = 0.5 + (output - refAt1) * scale;

  return parseFloat(Math.min(Math.max(output, 0), maxOutput).toFixed(2));
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
export function calculateHasteIntelRatio(entite) {
  const intel = calculateIntelligence(entite);
  return scalePercentRounded(intel, 150, 30);
}

// 0 intel -> 0% ; 150 intel -> 25%
export function calculateHasteCDReduc(entite) {
  const intel = calculateIntelligence(entite);
  return scalePercentRounded(intel, 150, 25);
}

// 0 agilité -> 0% ; 150 agilité -> 25%
export function calculateHasteRecupReduc(entite) {
  const haste = Number(getSafe(entite, "haste", 0)) || 0;
  if (haste <= 0) return 0;

  const agi = calculateAgility(entite);
  return scalePercentRounded(agi, 150, 25);
}

export function calculateHastePrepReduc(entite, hasteValue) {
  const hastePct = Number(calculateHastePercent(hasteValue)) || 0;
  const intelPct = Number(calculateHasteIntelRatio(entite)) || 0;
  return round1(hastePct + intelPct);
}

// 0 force -> 0% ; 150 force -> 25%
export function calculateHasteExecReduc(entite) {
  const str = calculateStrength(entite);
  return scalePercentRounded(str, 150, 25);
}
export function calculateHasteProjectilSpeed(entite) {
  const reducPct = Number(calculateHasteExecReduc(entite)); // 0..25 (ex: 1 = 1%)
  if (!Number.isFinite(reducPct)) return 0;

  // sécurité
  const clampedPct = Math.max(0, Math.min(reducPct, 95)); // 95 max si tu veux éviter l'infini
  const r = clampedPct / 100; // ratio 0..0.95

  const speedBonusPct = (1 / (1 - r) - 1) * 100;

  return Math.round(speedBonusPct * 100) / 100; // 2 décimales
}

export function getFinalAttackCooldownReduc(entite) {
  const direct = Number(getSafe(entite, "attackCooldownReduc", 0)) || 0;
  const haste = Number(getSafe(entite, "haste", 0)) > 0 ? Number(calculateHasteCDReduc(entite)) || 0 : 0;
  return round1(Math.min(ATTACK_TIME_REDUC_CAP, Math.max(0, direct + haste)));
}

export function getFinalAttackPreparationReduc(entite) {
  const direct = Number(getSafe(entite, "attackPreparationReduc", 0)) || 0;
  const hasteValue = Number(getSafe(entite, "haste", 0)) || 0;
  const haste = hasteValue > 0 ? Number(calculateHastePrepReduc(entite, hasteValue)) || 0 : 0;
  return round1(Math.min(ATTACK_TIME_REDUC_CAP, Math.max(0, direct + haste)));
}

export function getFinalAttackExecutionReduc(entite) {
  const direct = Number(getSafe(entite, "attackExecutionReduc", 0)) || 0;
  const haste = Number(getSafe(entite, "haste", 0)) > 0 ? Number(calculateHasteExecReduc(entite)) || 0 : 0;
  return round1(Math.min(ATTACK_TIME_REDUC_CAP, Math.max(0, direct + haste)));
}

export function getFinalAttackRecoveryReduc(entite) {
  const direct = Number(getSafe(entite, "attackRecoveryReduc", 0)) || 0;
  const haste = Number(getSafe(entite, "haste", 0)) > 0 ? Number(calculateHasteRecupReduc(entite)) || 0 : 0;
  return round1(Math.min(ATTACK_TIME_REDUC_CAP, Math.max(0, direct + haste)));
}
export function speedBonusToReducPercent(speedBonus) {
  const bonus = Math.max(0, Number(speedBonus) || 0);
  if (bonus <= 0) return 0;
  return round1((bonus / (100 + bonus)) * 100);
}
export function getFinalAttackProjectileSpeed(entite) {
  const direct = Number(getSafe(entite, "attackProjectileSpeed", 0)) || 0;
  const haste = Number(getSafe(entite, "haste", 0)) > 0 ? Number(calculateHasteProjectilSpeed(entite)) || 0 : 0;
  return round1(Math.min(ATTACK_TIME_REDUC_CAP, Math.max(0, direct + haste)));
}

export function calculateProjectilSpeedPercent(entite) {
  const bonusPct = Number(calculateHasteProjectilSpeed(entite)); // ex: 3 -> +3%
  if (!Number.isFinite(bonusPct)) return 100;

  const totalPct = 100 + bonusPct; // ex: 103
  return Math.round(totalPct * 100) / 100; // 2 décimales
}


export function calculateIntelligence(entite) {
  return parseFloat((getSafe(entite, "intelligence") ?? 0).toFixed(2));
}
export const toNumber = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
export const clampPercent = (p, min = 0, max = 95) => {
  const n = Number(p);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
};

export const getHastePoints = (entite) => {
  const h = entite?.stats?.haste;
  if (typeof h === "number") return h;
  if (h && typeof h === "object") return Number(h.current ?? h.value ?? h.points ?? 0) || 0;
  return Number(entite?.haste ?? entite?.hastePoints ?? 0) || 0;
};

export const applyReducToMs = (baseMs, reducPercent) => {
  const ms = Number(baseMs) || 0;
  const p = clampPercent(reducPercent, 0, 95);
  return Math.max(0, Math.round(ms * (1 - p / 100)));
};

// ✅ UI + debug : timings effectifs
export function getEffectiveAttackTimings(attack, entite) {
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

  const attackRangeArr = normArr(attack?.attackRange);
  const isMeleeAttack = attackRangeArr.includes("melee");
  const isRangeAttack =
    attackRangeArr.includes("range") ||
    attackRangeArr.includes("ranged") ||
    attackRangeArr.includes("distance");

  const attackNatures = normArr(attack?.attacknature);

  const hasPiercingRecoveryBonus =
    attackNatures.includes("piercingDamage") ||
    attackNatures.includes("transpiercingDamage") ||
    Number(entite?.stats?.piercingDamage || 0) > 0;
	
const hasBaseNature =
  attackNatures.includes("physicalDamage") ||
  attackNatures.includes("magicalDamage") ||
  attackNatures.includes("hybridalDamage");

const hasEntityPiercing =
  Number(entite?.stats?.piercingDamage || 0) > 0;

const isTranspiercing =
  attackNatures.includes("transpiercingDamage") ||
  (hasEntityPiercing && !hasBaseNature);

const isPiercing =
  !isTranspiercing &&
  (
    attackNatures.includes("piercingDamage") ||
    hasEntityPiercing
  );
  const meleeExecBaseBonus = isMeleeAttack ? calculateMeleeExecBonus(entite, attack) : 0;
  const meleeExecStrengthBonus = isMeleeAttack
    ? calculateExecStrengthRatio(entite?.stats?.strength || entite?.stats?.strenght || 0)
    : 0;

  const totalExecReduc = isMeleeAttack
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
  95
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
    phase,
    reduc: {
      hasHaste,
      hastePoints,
      hasteBase,

      prepReduc,
      cdReduc,

      execReduc,
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
  const { basePercent = 20 } = config;
  return parseFloat(toNumber(basePercent, 20).toFixed(1));
}

// Z : 1 INT = 1% (par défaut)
export function calculateExtraLifeIntelPercent(entite, config = {}) {
  const { perIntel = 1, maxIntelPercent = 999 } = config;

  const intel = calculateIntelligence(entite);
  const raw = intel * toNumber(perIntel, 1);
  const capped = Math.min(raw, toNumber(maxIntelPercent, 999));

  return parseFloat(capped.toFixed(1));
}

// Y : 20% + Z%
export function calculateExtraLifeTotalPercent(entite, config = {}) {
  const base = calculateExtraLifeBasePercent(config);
  const intelP = calculateExtraLifeIntelPercent(entite, config);
  return parseFloat((base + intelP).toFixed(1));
}

// X : maxHP * Y%
export function calculateExtraLifeRestoredHP(entite, config = {}) {
  const maxHP = calculateExtraLifeMaxHP(entite);
  const totalP = calculateExtraLifeTotalPercent(entite, config);
  return Math.round(maxHP * (totalP / 100));
}

// Agrégateur
export function calculateExtraLifeResurrect(entite, config = {}) {
  const maxHP = calculateExtraLifeMaxHP(entite);
  const basePercent = calculateExtraLifeBasePercent(config);                 
  const intelPercent = calculateExtraLifeIntelPercent(entite, config);       
  const totalPercent = parseFloat((basePercent + intelPercent).toFixed(1));  
  const restoredHP = Math.round(maxHP * (totalPercent / 100));               

  return { maxHP, basePercent, intelPercent, totalPercent, restoredHP };
}

const trunc2 = (n) => Math.trunc(n * 100) / 100;

export function calculateIntelAstralityRatio(entite) {
  if (!entite) return 0.0;
  const intel = Number(getSafe(entite, "intelligence")) || 0;
  const cap = 150;                      // intelligence à partir de laquelle on atteint le max
  const t = clamp(intel, 0, cap) / cap; // 0..1
  const p = 2;                          // courbe ease-out (p=2) ; augmente p pour accentuer le early
  const eased = 1 - Math.pow(1 - t, p);
  const maxBonus = 60;
  const bonus = maxBonus * eased;       // 0.0..60.0
  return round1(clamp(bonus, 0, maxBonus));
}

export function calculateAstralityTotal(entite) {
  if (!entite) return 0.0;

  const astralityPoints = Number(getSafe(entite, "astrality")) || 0; // points
  if (astralityPoints <= 0) return 0.0; // si 0 astrality, total = 0 (ignore intelBonus)

  const intelBonus = calculateIntelAstralityRatio(entite);           // 0..20
  const basePercent = calculateAstralityPercent(astralityPoints);    // 0..60

  return round1(intelBonus + basePercent);
}


export function calculateHypercognitionBonus(entite) {
  const hyperco = Number(getSafe(entite, "hypercognition", 0)) || 0;

  // ✅ Si l'entité n'a pas d'hypercognition, elle ne doit donner AUCUN bonus.
  if (hyperco <= 0) return 0;

  const intel = Number(getSafe(entite, "intelligence", 0)) || 0;
  const ratio = calculateHypercognitionRatio(hyperco);

  const total = hyperco + (intel * ratio);

  return Math.round(total);
}
export function calculateMagicalTotal(entite) {
  const magicalDamage = Number(getSafe(entite, "magicalDamage", 0)) || 0;
  const hyperBonus = Number(calculateHypercognitionBonus(entite) ?? 0) || 0;

  return Math.round(magicalDamage + hyperBonus);
}
export function calculateLvlMaxBaseEntite(entite, config = {}) {
  const { baseMaxLevel = BASE_MAX_LEVEL } = config;

  const rawBase = Number(getSafe(entite, "level.baseMax", NaN));
  if (Number.isFinite(rawBase)) return Math.max(0, Math.floor(rawBase));

  // compat ancien format : level.max était la base
  const legacy = Number(getSafe(entite, "level.max", NaN));
  if (Number.isFinite(legacy)) return Math.max(0, Math.floor(legacy));

  return baseMaxLevel;
}

export function calculateLvlMaxEntiteWithWill(entite, willValue, config = {}) {
  const base = calculateLvlMaxBaseEntite(entite, config);
  const bonus = calculateLvlMaxBonus(willValue, { ...config, baseMaxLevel: base });

  return Math.max(0, Math.min(base + bonus, config.hardMaxLevel ?? maxLevel));
}

export function calculateLvlMaxEntite(entite, config = {}) {
  const will = getSafe(entite, "stats.will", null) ?? getSafe(entite, "will", 0);
  return calculateLvlMaxEntiteWithWill(entite, will, config);
}

export function calculatewillAwakeBonus(value, config = {}) {
  const {
    pointsPerAwakeningLevel = 2,
    minLevels              = 1,
    maxLevels              = 99
  } = config;

  const v   = Math.max(0, Number(value) || 0);
  const raw = Math.ceil(v / pointsPerAwakeningLevel);

  const clamped = Math.max(minLevels, Math.min(maxLevels, raw));
  return clamped;
}


const LEVEL_WEIGHTS = {
  "0.5": 0.5,
  "1": 1,
  "2": 3,
  "3": 5,
};

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
  const { maxVitality = 150, maxPercent = 5, decimals = 2 } = config;

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
  if (base === 0) base = 1;

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
      type: "defense-0.5", // armor.max => force / defense-0.5
      valuePath: "max",
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
      const weight = LEVEL_WEIGHTS[levelStr];

      if (!weight) continue;
      if (!result[mapping.attribut] || !result[mapping.attribut][category]) continue;

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

      const weight = LEVEL_WEIGHTS[levelStr];
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
  return 30.0;
}

// Réduction via intelligence : 0.0 → 30.0 (intel 0 → 100), cap à 30 dès 100 intel, lente vers la fin, 1 décimale
export function intelBrokenSpellChance(entite) {
  if (!entite) return 0.0;
  const intel = Number(getSafe(entite, "intelligence")) || 0;

  const t = clamp(intel, 0, 100) / 100; // 0..1 (cap à 100)
  const p = 2;
  const eased = 1 - Math.pow(1 - t, p);

  const reduc = 30 * eased;
  return round1(clamp(reduc, 0, 30));   // 0.0..30.0
}

// Total : 0.0..100.0 (1 décimale) => chance que l'incantation pète
export function calculateBrokenSpellChance(entite) {
  const base = baseBrokenSpellChance();
  const reduc = entite ? intelBrokenSpellChance(entite) : 0.0;
  return round1(clamp(base - reduc, 0, 100));
}

// Base : 15.0 (%)
export function baseBrokenSpellDamage() {
  return 15.0;
}

// Réduction base via intelligence : 0.0 → 15.0 (intel 0 → 150), lente vers la fin, 1 décimale
export function intelBrokenSpellBaseDamage(entite) {
  if (!entite) return 0.0;
  const intel = Number(getSafe(entite, "intelligence")) || 0;

  const t = clamp(intel, 0, 150) / 150; // 0..1
  const p = 2;
  const eased = 1 - Math.pow(1 - t, p);

  const reduc = 15 * eased;
  return round1(clamp(reduc, 0, 15));   // 0.0..15.0
}

// Bonus via attaque magique : 0.0 → 30.0 (magic 0 → 150), lente vers la fin, 1 décimale
export function magicalBrokenSpellDamage(entite) {
  if (!entite) return 0.0;

  // adapte ici si ta stat s'appelle différemment
  const magicAttack =
    Number(getSafe(entite, "magicAttack")) ||
    Number(getSafe(entite, "magicalAttack")) ||
    Number(getSafe(entite, "magicPower")) ||
    Number(getSafe(entite, "magicalPower")) ||
    0;

  const t = clamp(magicAttack, 0, 150) / 150; // 0..1
  const p = 2;
  const eased = 1 - Math.pow(1 - t, p);

  const bonus = 30 * eased;
  return round1(clamp(bonus, 0, 30));   // 0.0..30.0
}

// Total : 0.0..100.0 (1 décimale) => % des dégâts du sort renvoyés au lanceur si incantation pétée
export function calculateBrokenSpellDamage(entite) {
  if (!entite) return 0.0;

  const total =
    (baseBrokenSpellDamage() - intelBrokenSpellBaseDamage(entite)) +
    magicalBrokenSpellDamage(entite);

  return round1(clamp(total, 0, 100));  // 0.0..100.0
}
export function attemptRangeBrokenSpell(attacker, target, attack) {
  // Garde-fous
  if (!attacker || !attack) {
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

    // VFX sur le lanceur
    const effectsContainer = document.getElementById(`effectsContainer_${attacker.id}`);
    if (effectsContainer) {
      const brokenVFX = document.createElement("img");

      // ⚠️ adapte le nom/chemin du gif à ton projet
      brokenVFX.src = `./media/assets/effects/broken-spell.gif?t=${Date.now()}`;
      brokenVFX.className = "effect-vfx broken-spell";
      brokenVFX.style.position = "absolute";
      brokenVFX.style.pointerEvents = "none";
      brokenVFX.style.zIndex = "10";

      effectsContainer.appendChild(brokenVFX);
      setTimeout(() => brokenVFX.remove(), 2100);
    }

    // Message visuel
    EffectMessage(attacker, `Sort brisé ! (-${damagePct.toFixed(1)}%)`);
  }

  return { success, damagePct, roll, chance };
}
export function attemptMeleeBrokenSpell(attacker, target, attack) {
  if (!attacker || !attack) {
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
  const applyBrokenSpellFeedback = (entite, pct) => {
    if (!entite?.id) return;

    const effectsContainer = document.getElementById(`effectsContainer_${entite.id}`);
    if (effectsContainer) {
      const brokenVFX = document.createElement("img");
      brokenVFX.src = `./media/assets/effects/broken-spell.gif?t=${Date.now()}`;
      brokenVFX.className = "effect-vfx broken-spell";
      brokenVFX.style.position = "absolute";
      brokenVFX.style.pointerEvents = "none";
      brokenVFX.style.zIndex = "10";
      effectsContainer.appendChild(brokenVFX);
      setTimeout(() => brokenVFX.remove(), 2100);
    }

    EffectMessage(entite, `Sort brisé ! (-${pct.toFixed(1)}%)`);
  };

  if (success) {
    damagePct = calculateBrokenSpellDamage(attacker); // 0..100

    // VFX + message sur le lanceur ET la cible (si cible valide)
    applyBrokenSpellFeedback(attacker, damagePct);
    if (target && target.id !== attacker.id) {
      applyBrokenSpellFeedback(target, damagePct);
    }
  }

  return { success, damagePct, roll, chance };
}


// MELEE GENERAL BONUS
// 0 STR -> 0%
// 150 STR -> 10% max
// bonus entier, arrondi inférieur
export function calculateExecStrengthRatio(strength) {
  const str = Math.max(0, Number(strength) || 0);
  if (str === 0) return 0;

  const ratio = (str / 150) * 10;     // 150 -> 10
  const capped = Math.min(ratio, 10); // cap 10
  return Math.floor(capped);          // entier, arrondi inférieur
}

export function calculateMeleeExecBonus(attacker, ctx) {
  // base mêlée
  let bonus = 20;

  // ctx peut être : statKey (string) OU attack (object)
  const type =
    (typeof ctx === "string")
      ? ctx
      : (ctx?.statKey || ctx?.key || ctx?.attackKey || ctx?.type || null);

  // additifs par type (à toi de régler les valeurs)
  if (type === "meleeAttackMagical")  bonus += 0;
  if (type === "meleeAttackHybridal") bonus += 0;
  if (type === "meleeAttackpiercing")   bonus += 0;

  return Math.floor(bonus); // entier
}

export function totalMeleeExecReduction(entite, ctx = null) {
  const hasteReduc = Number(calculateHasteExecReduc(entite)) || 0;
  const meleeReduc = Number(calculateMeleeExecBonus(entite, ctx)) || 0;

  const strength = Number(getSafe(entite, "strength", 0)) || 0;
  const strengthReduc = Number(calculateExecStrengthRatio(strength)) || 0;

  return clampPercent(hasteReduc + meleeReduc + strengthReduc, 0, 95);
}


export function attemptMeleeExecBonus(attacker, attack, baseExecMs) {
  const base = Number(baseExecMs) || 0;

  const hasteReduc = clampPercent(Number(calculateHasteExecReduc(attacker)) || 0, 0, 95);
  const meleeReduc = clampPercent(Number(calculateMeleeExecBonus(attacker, attack)) || 0, 0, 95);

  const strength = Number(getSafe(attacker, "strength", 0)) || 0;
  const strengthReduc = clampPercent(Number(calculateExecStrengthRatio(strength)) || 0, 0, 10);

  const totalReduc = clampPercent(hasteReduc + meleeReduc + strengthReduc, 0, 95);
  const finalExecMs = applyReducToMs(base, totalReduc);

  return {
    applied: totalReduc > 0,
    totalReduc,
    baseExecMs: base,
    finalExecMs,
    debug: { baseExecMs: base, hasteReduc, meleeReduc, strengthReduc, totalReduc, finalExecMs },
  };
}
// piercing GENERAL BONUS (RECUP)
// 0 AGI -> 0%
// 150 AGI -> 10% max
// bonus entier, arrondi inférieur
export function calculateRecupAgilityRatio(agility) {
  const agi = Math.max(0, Number(agility) || 0);
  if (agi === 0) return 0;

  const ratio = (agi / 150) * 10;      // 150 -> 10
  const capped = Math.min(ratio, 10);  // cap 10
  return Math.floor(capped);           // entier, arrondi inférieur
}

export function calculatePiercingRecupBonus(entite, attack = null) {
  return 5; // perçant additif
}

export function calculateTranspiercingRecupBonus(entite, attack = null) {
  return 10; // transperçant pur
}

export function calculatePiercingRecupAgiRatio(entite) {
  const agility = Number(getSafe(entite, "agility", 0)) || 0;

  // soft cap vers +10%
  return Math.round(10 * (agility / (agility + 80)));
}

export function calculateTranspiercingRecupAgiRatio(entite) {
  const agility = Math.max(0, Number(getSafe(entite, "agility", 0)) || 0);

  // Progression continue, mais ralentissante.
  return Math.round(6 * Math.log1p(agility / 10));
}
export function totalPiercingRecupReductionWithAgi(entite, attack = null) {
  const piercingRecup = Number(calculatePiercingRecupBonus(entite, attack)) || 0;
  const agiRecup = Number(calculatePiercingRecupAgiRatio(entite)) || 0;
  return clampPercent(piercingRecup + agiRecup, 0, 95);
}

export function totalTranspiercingRecupReductionWithAgi(entite, attack = null) {
  const transpiercingRecup = Number(calculateTranspiercingRecupBonus(entite, attack)) || 0;
  const agiRecup = Number(calculateTranspiercingRecupAgiRatio(entite)) || 0;
  return clampPercent(transpiercingRecup + agiRecup, 0, 95);
}

export function attemptPiercingRecupBonus(attacker, attack, baseRecupMs) {
  const base = Number(baseRecupMs) || 0;

  const hasteRecup = clampPercent(Number(calculateHasteRecupReduc(attacker)) || 0, 0, 95);
  const piercingRecup = clampPercent(Number(calculatePiercingRecupBonus(attacker, attack)) || 0, 0, 95);

  const agility = Number(getSafe(attacker, "agility", 0)) || 0;
  const agiRecup = clampPercent(Number(calculateRecupAgilityRatio(agility)) || 0, 0, 10);

  const totalReduc = clampPercent(hasteRecup + piercingRecup + agiRecup, 0, 95);
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

export function brutalityPercantBonus(entite) {
  const strength = Math.max(0, Number(entite?.stats?.strenght || entite?.stats?.strength || 0));
  const base = 100;
  const ratioBonus = brutalityBonus(entite);
  return Math.round(base + ratioBonus);
}

export function brutalityBonus(entite) {
  const strength = Math.max(0, Number(entite?.stats?.strenght || entite?.stats?.strength || 0));
  return Math.max( 1, Math.round(10 * (strength / (strength + 50))));
}

export function brutalityPhysicalPowerBonus(entite) {
  const physicalPower = Math.max(0, Number(entite?.stats?.physicalDamage || 0));
  const ratioBonusPercent = brutalityBonus(entite);
  return Math.max( 1, Math.round(physicalPower * (ratioBonusPercent / 100)) );
}

export function brutalityTotalBonus(entite) {
  const physicalPower = Math.max(0, Number(entite?.stats?.physicalDamage || 0));
  return physicalPower + brutalityPhysicalPowerBonus(entite);
}
export function intellectPercantBonus(entite) {
  const intelligence = Math.max(0, Number(entite?.stats?.intelligence || 0));
  const base = 100;
  const ratioBonus = intellectBonus(entite);
  return Math.round(base + ratioBonus);
}

export function intellectBonus(entite) {
  const intelligence = Math.max(0, Number(entite?.stats?.intelligence || 0));
  return Math.max( 1, Math.round(10 * (intelligence / (intelligence + 50))));
}

export function intellectPMBonus(entite) {
  const magicalPower = Math.max(0, Number(entite?.stats?.magicalDamage || 0));
  const ratioBonusPercent = intellectBonus(entite);

  return Math.max(
    1,
    Math.round(magicalPower * (ratioBonusPercent / 100))
  );
}

export function intellectTotalBonus(entite) {
  const magicalPower = Math.max(0, Number(entite?.stats?.magicalDamage || 0));

  return magicalPower + intellectPMBonus(entite);
}

export function attemptMysticismTrance(entite) {
  const chance = calculateMysticismProcChance(entite);

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

function roundMysticismValue(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function calculateMysticismSoftCapBonus(intelligence, maxBonus, targetIntel, curvePower = 2) {
  const intel = Math.max(0, Number(intelligence) || 0);
  const ratio = Math.min(intel / targetIntel, 1);
  return maxBonus * (1 - Math.pow(1 - ratio, curvePower));
}

export function calculateMysticismBaseProcChance(entite) {
  return getMysticismValue(entite) > 0 ? 5 : 0;
}

export function calculateMysticismIntelProcChance(entite) {
  if (getMysticismValue(entite) <= 0) return 0;
  return roundMysticismValue(
    calculateMysticismSoftCapBonus(getIntelligenceValue(entite), 15, 150, 2),
    2
  );
}

export function calculateMysticismProcChance(entite) {
  if (getMysticismValue(entite) <= 0) return 0;
  return roundMysticismValue(
    calculateMysticismBaseProcChance(entite) + calculateMysticismIntelProcChance(entite),
    50
  );
}

export function calculateMysticismBaseTranceDuration(entite) {
  return getMysticismValue(entite) > 0 ? 2000 : 0;
}

export function calculateMysticismIntelTranceDuration(entite) {
  if (getMysticismValue(entite) <= 0) return 0;
  return Math.round(
    calculateMysticismSoftCapBonus(getIntelligenceValue(entite), 10, 150, 3) * 1000
  );
}

export function calculateMysticismTranceDuration(entite) {
  if (getMysticismValue(entite) <= 0) return 0;
  return calculateMysticismBaseTranceDuration(entite) + calculateMysticismIntelTranceDuration(entite);
}

export function calculateMysticismBasePreparationAcceleration(entite) {
  return getMysticismValue(entite) > 0 ? 100 : 0;
}

export function calculateMysticismIntelPreparationAcceleration(entite) {
  if (getMysticismValue(entite) <= 0) return 0;
  return roundMysticismValue(
    calculateMysticismSoftCapBonus(getIntelligenceValue(entite), 100, 150, 2),
    2
  );
}

export function calculateMysticismPreparationAcceleration(entite) {
  if (getMysticismValue(entite) <= 0) return 0;
  return roundMysticismValue(
    calculateMysticismBasePreparationAcceleration(entite) +
      calculateMysticismIntelPreparationAcceleration(entite),
    2
  );
}

export function calculateMysticismBaseDamageBonus(entite) {
  return getMysticismValue(entite) > 0 ? 10 : 0;
}

export function calculateMysticismIntelDamageBonus(entite) {
  if (getMysticismValue(entite) <= 0) return 0;
  return roundMysticismValue(
    calculateMysticismSoftCapBonus(getIntelligenceValue(entite), 50, 150, 2),
    2
  );
}

export function calculateMysticismTotalDamageBonus(attacker) {
  if (getMysticismValue(attacker) <= 0) return 0;
  return roundMysticismValue(
    calculateMysticismBaseDamageBonus(attacker) + calculateMysticismIntelDamageBonus(attacker),
    2
  );
}
function getEquilibreValue(entite) {
  return Number(getSafe(entite, "equilibre", 0)) || 0;
}

function getEquilibreIntelligenceValue(entite) {
  return Number(getSafe(entite, "intelligence", 0)) || 0;
}
function getEquilibreAgilityValue(entite) {
  return Number(getSafe(entite, "agility", 0)) || 0;
}
function roundEquilibreValue(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function calculateEquilibreSoftCapBonus(value, maxBonus, targetValue, curvePower = 2) {
  const v = Math.max(0, Number(value) || 0);
  const ratio = Math.min(v / targetValue, 1);
  return maxBonus * (1 - Math.pow(1 - ratio, curvePower));
}

export function calculateEquilibreBaseAggroReduction(entite) {
  return getEquilibreValue(entite) > 0 ? 5 : 0;
}

export function calculateEquilibreIntelAggroReduction(entite) {
  if (getEquilibreValue(entite) <= 0) return 0;
  return roundEquilibreValue(
    calculateEquilibreSoftCapBonus(getEquilibreIntelligenceValue(entite), 20, 150, 2),
    2
  );
}

export function calculateEquilibreAggroReduction(entite) {
  if (getEquilibreValue(entite) <= 0) return 0;
  return roundEquilibreValue(
    calculateEquilibreBaseAggroReduction(entite) +
      calculateEquilibreIntelAggroReduction(entite),
    2
  );
}

export function calculateEquilibreBaseInvisibleDetection(entite) {
  return getEquilibreValue(entite) > 0 ? 5 : 0;
}

export function calculateEquilibreAgiInvisibleDetection(entite) {
  if (getEquilibreValue(entite) <= 0) return 0;

  return roundEquilibreValue(
    calculateEquilibreSoftCapBonus(getEquilibreAgilityValue(entite), 25, 150, 2),
    2
  );
}
export function calculateEquilibreInvisibleDetection(entite) {
  if (getEquilibreValue(entite) <= 0) return 0;

  return roundEquilibreValue(
    calculateEquilibreBaseInvisibleDetection(entite) +
      calculateEquilibreAgiInvisibleDetection(entite),
    2
  );
}
export function calculateEquilibreBaseBalancedAttackChance(entite) {
  return getEquilibreValue(entite) > 0 ? 50 : 0;
}

export function calculateEquilibreIntelBalancedAttackChance(entite) {
  if (getEquilibreValue(entite) <= 0) return 0;
  return roundEquilibreValue(
    calculateEquilibreSoftCapBonus(getEquilibreIntelligenceValue(entite), 7, 150, 2),
    2
  );
}

export function calculateEquilibreAttackChance(entite) {
  if (getEquilibreValue(entite) <= 0) return 0;
  return roundEquilibreValue(
    calculateEquilibreBaseBalancedAttackChance(entite) +
      calculateEquilibreIntelBalancedAttackChance(entite),
    2
  );
}
export function attemptEquilibreAttack(entite) {
  const chance = calculateEquilibreAttackChance(entite);

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
      balanceVFX.src = `/media/assets/effects/balance-strike.gif?t=${Date.now()}`;
      balanceVFX.className = "effect-vfx balance-strike";
      balanceVFX.alt = "";
      balanceVFX.style.position = "absolute";
      balanceVFX.style.pointerEvents = "none";
      balanceVFX.style.zIndex = "12";

      effectsContainer.appendChild(balanceVFX);
      setTimeout(() => balanceVFX.remove(), 3500);
    }

    EffectMessage(entite, "Attaque équilibrée !");
  }

  return {
    success,
    chance,
    roll: Number(roll.toFixed(2)),
  };
}
function getOccultismValue(entite) {
  return Number(getSafe(entite, "occultism", 0)) || 0;
}

function getOccultismAgilityValue(entite) {
  return Number(getSafe(entite, "agility", 0)) || 0;
}

function roundOccultismValue(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function calculateOccultismSoftCapBonus(value, maxBonus, targetValue, curvePower = 2) {
  const v = Math.max(0, Number(value) || 0);
  const ratio = Math.min(v / targetValue, 1);
  return maxBonus * (1 - Math.pow(1 - ratio, curvePower));
}

export function calculateOccultismBaseInvisibilityChance(entite) {
  return getOccultismValue(entite) > 0 ? 50 : 0;
}

export function calculateOccultismAgiInvisibilityChance(entite) {
  if (getOccultismValue(entite) <= 0) return 0;
  return roundOccultismValue(
    calculateOccultismSoftCapBonus(getOccultismAgilityValue(entite), 15, 150, 2),
    2
  );
}

export function calculateOccultismInvisibilityChance(entite) {
  if (getOccultismValue(entite) <= 0) return 0;
  return roundOccultismValue(
    calculateOccultismBaseInvisibilityChance(entite) +
      calculateOccultismAgiInvisibilityChance(entite),
    2
  );
}

export function calculateOccultismBaseTargetableChance(entite) {
  return getOccultismValue(entite) > 0 ? 10 : 0;
}

export function calculateOccultismAgiTargetableChance(entite) {
  if (getOccultismValue(entite) <= 0) return 0;
  return roundOccultismValue(
    calculateOccultismSoftCapBonus(getOccultismAgilityValue(entite), 10, 150, 2),
    2
  );
}

export function calculateOccultismTargetableChance(entite) {
  if (getOccultismValue(entite) <= 0) return 0;
  return roundOccultismValue(
    calculateOccultismBaseTargetableChance(entite) +
      calculateOccultismAgiTargetableChance(entite),
    2
  );
}

export function calculateOccultismBaseDodgeBonus(entite) {
  return getOccultismValue(entite) > 0 ? 50 : 0;
}

export function calculateOccultismAgiDodgeBonus(entite) {
  if (getOccultismValue(entite) <= 0) return 0;

  return Math.round(
    calculateOccultismSoftCapBonus(getOccultismAgilityValue(entite), 25, 150, 2)
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
  return 0;
}

export function calculateOccultismAgiCritChanceBonus(entite) {
  if (getOccultismValue(entite) <= 0) return 0;
  return roundOccultismValue(
    calculateOccultismSoftCapBonus(getOccultismAgilityValue(entite), 25, 150, 2),
    2
  );
}

export function calculateOccultismCritChanceBonus(entite) {
  if (getOccultismValue(entite) <= 0) return 0;
  return roundOccultismValue(
    calculateOccultismAgiCritChanceBonus(entite),
    2
  );
}
export function calculateOccultismShadowFragilityPercent(entite) {
  return getOccultismValue(entite) > 0 ? 100 : 0;
}
export function calculateOccultismPreparationSpeedDebuff(entite) {
  return getOccultismValue(entite) > 0 ? 100 : 0;
}
export function calculateOccultismTargetableChanceDisplay(entite) {
  if (getOccultismValue(entite) <= 0) return 0;
  return roundOccultismValue(100 - calculateOccultismTargetableChance(entite), 2);
}

function getOccultismDomNodes(entite) {
  const id = entite?.id;
  if (!id) return [];

  return [
    document.getElementById(`sbire_${id}`),
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
    node.classList.remove("invisible", "occultism-invisible");
    delete node.dataset.invisible;
  });
}
export function attemptOccultismInvisibility(entite) {
  const chance = calculateOccultismInvisibilityChance(entite);

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
    stat: "criticalPower",
    value: critBonus,
    source: "occultismExitCrit",
    mode: "percent",
    durationMs: null,
    stackable: false,
  });

  entite.removeOccultismCritBoost = critBoost.remove;

  console.log(
    `🌑 Critique occulte appliqué : ${entite.name} | +${critBonus}% chance critique prochaine attaque`
  );

  return critBoost;
}

function getMovementValue(entite) {
  const movement = getSafe(entite, "movement", 0);

  if (movement && typeof movement === "object") {
    return Math.max(
      0,
      Math.round(Number(movement.max ?? movement.value ?? movement.current ?? 0) || 0)
    );
  }

  return Math.max(0, Math.round(Number(movement) || 0));
}

function getMovementAgilityValue(entite) {
  return Math.max(0, Number(getSafe(entite, "agility", 0)) || 0);
}

function calculateMovementAgilityPercent(entite) {
  const movementValue = getMovementValue(entite);

  if (movementValue <= 0) return 0;

  const agility = getMovementAgilityValue(entite);
  const percent = (agility / 150) * 100;

  return Math.max(0, Math.min(100, Math.round(percent)));
}

export function calculateMovementMaxCharges(entite) {
  return getMovementValue(entite);
}
export function calculateMovementStartingChargeDetails(entite) {
  const maxCharges = calculateMovementMaxCharges(entite);

  if (maxCharges <= 0) {
    return {
      totalCurrent: 0,
      basePercent: 0,
      agiRatioCurrent: 0,
    };
  }

  const agility = getMovementAgilityValue(entite);

  const basePercent = 30;
  const maxAgilityBonusPercent = 70;
  const agilityHardCap = 150;
  const softCapDivider = 50;

  const agiRatioCurrent =
    agility >= agilityHardCap
      ? maxAgilityBonusPercent
      : maxAgilityBonusPercent * (1 - Math.exp(-agility / softCapDivider));

  const totalCurrent = Math.min(100, basePercent + agiRatioCurrent);

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

export function calculateMovementMarathonChance(entite) {
  return calculateMovementAgilityPercent(entite);
}

// export function calculateMovementTrailerChance(entite) {
  // const agility = Math.max(0, Number(getSafe(entite, "agility", 0)) || 0);

  // return Math.min(100, Math.round((agility / 150) * 10));
// }
export function calculateMovementTrailerChance(entite) {
  const movementValue = getMovementValue(entite);
  if (movementValue <= 0) return 0;

  // Valeur fixe temporaire pour tests dev
  return 70;
}

export function ensureMovementState(entite, { reset = false } = {}) {
  if (!entite) return { current: 0, max: 0 };
  if (!entite.stats) entite.stats = {};

  const rawShift = entite.stats.shift;
  const hasShiftObject = rawShift && typeof rawShift === "object";

  const movementMax = Math.max(0, Math.round(calculateMovementMaxCharges(entite)));

  const max = hasShiftObject
    ? Math.max(0, Math.round(Number(rawShift.max) || 0))
    : movementMax;

  if (reset || !hasShiftObject) {
    entite.stats.shift = {
      current: hasShiftObject
  ? Math.round(Number(rawShift.current) || 0)
  : calculateMovementStartingCharges(entite),
      max,
    };

    return entite.stats.shift;
  }

  entite.stats.shift.max = max;
entite.stats.shift.current = Math.round(Number(entite.stats.shift.current) || 0);
  return entite.stats.shift;
}

 function initializeMovementStateAtBattleStart(entite) {
  const movement = ensureMovementState(entite, { reset: true });
  updateMovementDisplay(entite);
  return movement;
}

export function initializeAllMovementStatesAtBattleStart(entityList = entites) {
  if (!Array.isArray(entityList)) return [];
  return entityList.map(entite => initializeMovementStateAtBattleStart(entite));
}

export function updateMovementDisplay(entite) {
  if (!entite?.id) return;

  const rawMovement = entite?.stats?.shift;
  if (!rawMovement || typeof rawMovement !== "object") return;

  const previousCurrent = Number(rawMovement._lastDisplayedCurrent ?? rawMovement.current);

  const current = Math.round(Number(rawMovement.current) || 0);
  const max = Math.max(0, Math.round(Number(rawMovement.max) || 0));

  rawMovement.current = current;
  rawMovement.max = max;

  const hasGeneratedMove =
  current > previousCurrent &&
  previousCurrent < max &&
  current <= max;

  document
    .querySelectorAll(`[data-movement-entity-id="${entite.id}"]`)
    .forEach(el => {
      let counterSpan = el.querySelector(".counter-shift");

      if (!counterSpan) {
        counterSpan = document.createElement("span");
        counterSpan.className = "counter-shift hu";
        el.appendChild(counterSpan);
      }

      counterSpan.innerHTML = `: <span class="current-shift current">${current}</span>
        /
        <span class="current-shift max">${max}</span>
      `;

      const currentSpan = counterSpan.querySelector(".current-shift.current");
	  if (currentSpan) {
  currentSpan.classList.toggle("negative-shift", current < 0);
}

      if (hasGeneratedMove && currentSpan) {
        battleLogs("trail_move_generated", {
          entity: entite
        });

        currentSpan.classList.remove("bounce-shift");
        void currentSpan.offsetWidth;
        currentSpan.classList.add("bounce-shift");

        setTimeout(() => {
          currentSpan.classList.remove("bounce-shift");
        }, 500);
      }

      el.classList.toggle("empty", current <= 0);
      el.classList.toggle("full", current >= max && max > 0);
    });

  rawMovement._lastDisplayedCurrent = current;
}
export function createMovementDisplay(entite) {
  const movement = ensureMovementState(entite);

  const wrapper = document.createElement("div");
  wrapper.className = "movement-charge-display";
  wrapper.setAttribute("data-movement-entity-id", entite.id);
  wrapper.textContent = `${movement.current}/${movement.max}`;

  if (movement.current <= 0) wrapper.classList.add("empty");
  if (movement.current >= movement.max && movement.max > 0) wrapper.classList.add("full");

  return wrapper;
}
export function animateMoveCounter(counterElement) {
    if (!counterElement) return;

    counterElement.classList.remove("counter-pop");
    void counterElement.offsetWidth;
    counterElement.classList.add("counter-pop");
}
export function refillEntityMovement(entite, amount = 1) {
  const movement = ensureMovementState(entite);

  if (movement.max <= 0) {
    updateMovementDisplay(entite);
    return movement;
  }

  const before = movement.current;

const isAlreadyFull = movement.current >= movement.max;

const trailer = isAlreadyFull
  ? { success: false, chance: 0, roll: null, disabled: true, reason: "movement-full" }
  : attemptMovementTrailer(entite);

const refillAmount = trailer.success ? 2 : Math.max(0, Math.round(Number(amount) || 0));
movement.current = Math.min(
  movement.max,
  movement.current + refillAmount
);

movement.trailer = trailer;

  updateMovementDisplay(entite);

if (movement.current !== before && trailer.success) {
  document
    .querySelectorAll(`[data-movement-entity-id="${entite.id}"] .counter-shift.hu`)
    .forEach(currentValue => {
      currentValue.classList.remove("trailer-proc-highlight");
      void currentValue.offsetWidth;
      currentValue.classList.add("trailer-proc-highlight");

      setTimeout(() => {
        currentValue.classList.remove("trailer-proc-highlight");
      }, 1000);
    });
}
  console.log(
    `👣 Recharge mouvement : ${entite.name} ${before}/${movement.max} → ${movement.current}/${movement.max}`
  );

  return movement;
}
export function attemptMovementMarathon(entite) {
  // const chance = Math.max(
    // 0,
    // Math.min(100, Number(calculateMovementMarathonChance(entite)) || 0)
  // );
const chance = Math.max(
  0,
  Math.min(100, Number(getMarathonChance(entite)) || 0)
);
  if (chance <= 0) {
    return {
      success: false,
      chance,
      roll: null,
    };
  }

  const roll = Math.random() * 100;
  const success = roll < chance;

  console.log(
    `🏃 Marathonien : ${entite.name} | ${chance}% | roll ${roll.toFixed(2)} → ${
      success ? "✅ déplacement gratuit" : "❌ charge consommée"
    }`
  );

  return {
    success,
    chance,
    roll: Number(roll.toFixed(2)),
  };
}


export function attemptMovementTrailer(entite) {
  const movementValue = getMovementValue(entite);

  if (movementValue <= 0) {
    return {
      success: false,
      chance: 0,
      roll: null,
      disabled: true,
    };
  }

const chance = Math.max(
  0,
  Math.min(100, Number(getTrailerChance(entite)) || 0)
);

  if (chance <= 0) {
    return {
      success: false,
      chance,
      roll: null,
    };
  }

  const roll = Math.random() * 100;
  const success = roll < chance;

  return {
    success,
    chance,
    roll: Number(roll.toFixed(2)),
  };
}

export function getMarathonChance(entiteOrValue) {
  return Number(
    typeof entiteOrValue === "number"
      ? entiteOrValue
      : entiteOrValue?.stats?.marathon ?? entiteOrValue?.marathon ?? 0
  ) || 0;
}

export function getTrailerChance(entiteOrValue) {
  return Number(
    typeof entiteOrValue === "number"
      ? entiteOrValue
      : entiteOrValue?.stats?.trailer ?? entiteOrValue?.trailer ?? 0
  ) || 0;
}

export function consumeEntityMovement(entite, amount = 1) {
  const rawMovement = entite?.stats?.shift;

  if (
    !rawMovement ||
    typeof rawMovement !== "object" ||
    rawMovement.current == null ||
    Number(rawMovement.current) < 1
  ) {
    return {
      allowed: false,
      consumed: false,
      reason: "not-enough-current-movement",
      movement: rawMovement || { current: 0, max: 0 },
    };
  }

  const movement = ensureMovementState(entite);

  const marathon = attemptMovementMarathon(entite);

  if (marathon.success) {
    updateMovementDisplay(entite);

    return {
      allowed: true,
      consumed: false,
      reason: "marathon",
      movement,
      marathon,
    };
  }

  const weight = getMovementWeightMalus(entite);
  const cost = Math.max(1, Math.round(Number(amount) || 1)) + Number(weight?.shiftCostModifier || 0);

  const before = movement.current;
  movement.current = movement.current - cost;

  updateMovementDisplay(entite);

  console.log(
    `👣 Mouvement consommé : ${entite.name} ${before}/${movement.max} → ${movement.current}/${movement.max} coût ${cost}`
  );

  return {
    allowed: true,
    consumed: true,
    reason: "consumed",
    movement,
    marathon,
    cost,
    weight,
  };
}
export function calculateWeaponOrfevreWeaponMastery(entite, value) {
  const weaponMastery = Math.max(
    0,
    Math.floor(Number(value ?? getSafe(entite, "weaponMastery", 0)) || 0)
  );

  if (weaponMastery <= 0) return 0;

  if (weaponMastery <= 120) {
    return Math.floor(weaponMastery / 5) + 1;
  }

  return 25 + Math.round((weaponMastery - 120) / 10);
}

export function calculateWeaponOrfevreStrength(entite, value) {
  const strength = Math.max(
    0,
    Math.floor(Number(value ?? getSafe(entite, "strength", 0)) || 0)
  );

  if (strength <= 0) return 0;

  if (strength <= 100) {
    return Math.max(1, Math.round(strength / 10));
  }

  return 10 + Math.round((strength - 100) / 20);
}

export function calculateWeaponOrfevreBonus(entite) {
  const weaponMastery = Number(entite?.stats?.weaponMastery ?? entite?.weaponMastery ?? 0) || 0;
  const weaponOrfevre = Number(entite?.stats?.weaponOrfevre ?? entite?.weaponOrfevre ?? 0) || 0;

  if (weaponMastery <= 0 && weaponOrfevre <= 0) return 0;

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
  const weaponMastery = Math.max(
    0,
    Math.floor(Number(value ?? getSafe(entite, "weaponMastery", 0)) || 0)
  );

  if (weaponMastery <= 0) return 0;

  return 5 + Math.round((weaponMastery - 1) * (30 / 149));
}
export function calculateWeaponMasteryTrophyStrengthBonus(entite, value) {
  const strength = Math.max(
    0,
    Math.floor(Number(value ?? getSafe(entite, "strength", 0)) || 0)
  );

  if (strength <= 0) return 0;

  return Math.round(strength * (5 / 150));
}
export function getFinalWeaponOrfevreBonus(entite) {
  return Number(getSafe(entite, "weaponOrfevre", 0)) || 0;
}

export function getFinalWeaponCollectorBonus(entite) {
  return Number(getSafe(entite, "weaponCollector", 0)) || 0;
}
export function calculateChargeEquipmentSlots(entite, value) {
  return Number(value ?? getSafe(entite, "charge", 0)) || 0;
}
export function weaponMasteryChargeStrenghtRatioBonus(entite, value) {
  const strength = Math.max(
    0,
    Math.floor(Number(value ?? entite?.strength ?? entite?.stats?.strength ?? 0) || 0)
  );

  return Math.floor(strength / 20);
}
export function calculateWeaponMasteryTotalChargeBonus(entite, value) {
  const weaponMasteryValue = Number(value ?? getSafe(entite, "weaponMastery", 0)) || 0;

  if (weaponMasteryValue <= 0) return 0;

  return (
    calculateWeaponMasteryCharge(entite, weaponMasteryValue) +
    weaponMasteryChargeStrenghtRatioBonus(entite)
  );
}
export function attemptBattleRegen(target, hpRestored) {
  if (!target || hpRestored <= 0) return;

  let container = document.getElementById(`effectsContainer_${target.id}`);

  if (!container) {
    const sprite = document.getElementById(`spriteContainer_${target.id}`);
    if (!sprite) return;

    container = document.createElement("div");
    container.id = `effectsContainer_${target.id}`;
    container.className = "effects-container";
    sprite.appendChild(container);
  }

  const vfx = document.createElement("div");
  vfx.className = "battle-regen-hp-vfx";

  vfx.innerHTML = `
    <img src="./media/assets/ui/picto-battle-regen-hp.svg" alt="">
    <span class="healthPoint">+${hpRestored} HP</span>
  `;

  container.appendChild(vfx);
  setTimeout(() => vfx.remove(), 1200);
}