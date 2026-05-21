import { EffectMessage } from './attackEffectMecanics.js'; 
import { animationProjectile, animateDodge, animateIndestructibility, animateEsoterism, animateAstrality, animateAmbidextry, animationMelee } from './entitesAnimation.js'; 
import { entites, BASE_MAX_LEVEL, WILL_MAX_BONUS, maxLevel, generateUniqueID, entitesNestUp, enrichEntityStats, calculateVitalityBonus, calculateVelocityReduction, calculateDodgePercent, calculatePrecisionPercent, calculateIndestructibilityPercent, calculateAmbidextryPercent, calculateEsoterismPercent, calculateAstralityPercent, calculateRobustnessBonus, calculateBloodFuryPercent, calculateHastePercent, calculatePenetrationPercent, calculateCritChancePercent, calculateResiliencePercent,calculateLvlMaxBonus, calculateTranscendenceExtraLife, BaseDayHpRegen } from './entites.js';
import { applyDamage } from './entityAttributs.js'; 
import { stats } from './statsData.js'; 

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
		hastePercent: 0,
		hasteIntelRatio: 0,
		hastePreparation: 0,
		hasteCDReduc: 0,
		hasteRecupReduc: 0,
		hasteExecutionReduc: 0,
		hasteProjectilSpeed: 0,
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
        esoterismBonus: 0,
        astralityBonus: 0,
        bloodFuryLifestealBonus: 0,
        bloodFuryBfRatioBonus: 0,
        bloodFurySRatioBonus: 0,
        bloodFuryExecutionBonus: 0,
        bloodFuryExecSRatioBonus: 0,
        bloodFuryExecChanceBonus: 0,
        bloodFuryExecSRatio: 0,
        bloodFuryExecDamage: 0,
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
        critAgiRatioBonus: 0,
        critDamageBonus: 0,
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
		meleeExecBaseBonus: 0,
		meleeExecHasteReduc: 0,
		meleeExecStrengthBonus: 0,
		meleeExecTotalReduc: 0,
piercingRecupBaseBonus: 0,
piercingRecupHasteReduc: 0,
piercingRecupAgiBonus: 0,
piercingRecupTotalReduc: 0,	
        helpContent: "",
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
// === Indestructibility ===
if (statKey === "indestructibility") {
  const value = statValue ?? safe("indestructibility");
  result.indestructibilityBonus = calculateIndestructibilityPercentFromEntity(entite);
  result.indestructibilityStrengthReduction = caluclateIndestructibilityStrengthReduction(entite);
  result.indestructibilityReduction = caluclateIndestructibilityReduction(entite);
  result.indestructibilityReductionTotal = caluclateIndestructibilityReductionTotal(entite);
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
// === Magic Damage ===
if (statKey === "magicalDamage") {
  const hyperco = Number(getSafe(entite, "hypercognition", 0)) || 0;

  const base  = Number(statValue ?? safe("magicalDamage", 0)) || 0;
  const bonus = Number(calculateHypercognitionBonus(entite) ?? 0) || 0;
  const total = Math.round(base + bonus);

  result.magicalBaseValue = base;
  result.magicalHypercognitionBonus = bonus;
  result.calculateMagicalTotalValue = total;
  result.displayValue = total;

  if (hyperco > 0) {
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
    result.bloodFuryLifestealBonus = calculateBloodFuryPercent(entite);
    result.bloodFuryBfRatioBonus = calculateBloodFuryBFtRatio(value);
    result.bloodFurySRatioBonus = calculateBloodFuryStrengthRatio(safe("strength"));
    result.bloodFuryExecutionBonus = calculateBloodFuryExecutionPercent(entite);
    result.bloodFuryExecSRatioBonus = calculateBloodFuryExecStrengthRatio(safe("strength"));
    result.bloodFuryExecChanceBonus = calculateBloodFuryExecChanceBonus(safe("strength"));
    result.bloodFuryExecSRatio = calculateBloodFuryExecutionSRatio(result.bloodFuryExecSRatioBonus ?? 0);
    result.bloodFuryExecDamage = calculateExecutionDamage(entite);

}

// === Pénétrations ===
if (statKey === "physicalPen") {
  result.physicPenBonus = calculatePenetrationPercent(entite, "physicalPen");
}
if (statKey === "magicalPen") {
  result.magicPenBonus = calculatePenetrationPercent(entite, "magicalPen");
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
if (statKey === "criticalChance") {
  const value = statValue ?? safe("criticalChance", 0);
  result.critChanceBonus = calculateCritChancePercent(value);
  result.critAgiChanceBonus = calculateCritAgiChanceBonus(entite) ?? 0;
  result.critTotalChance = calculateCritTotalChance(entite, value) ?? 0;
  result.critRatioBonus = calculateCritRatioBonus(entite, value) ?? 0;
  result.critAgiRatioBonus = calculateCritAgiRatioBonus(entite) ?? 0;
  result.critPrecisionBonus = calculateCritPrecisionBonus(entite) ?? 0;
  result.critDamageBonus = calculateCritDamageBonus(entite, value) ?? 0;
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
const meleeExecHelperBlock = `
Les attaques de mêlée ont un bonus de <div class="picto-stat execution-time"></div><span class="execution-time">vitesse d'exécution</span> de <span class="neutral">${result.meleeExecTotalReduc}%</span>.<br>
( <div class="picto-stat strength"></div><span class="strength">${result.meleeExecStrengthBonus}%</span> force
+ <div class="picto-stat meleeAttack"></div><span class="meleeAttack">${result.meleeExecBaseBonus}%</span> mêlée
+ <div class="picto-stat haste"></div><span class="haste">${result.meleeExecHasteReduc}%</span> hâte )<br>
`;
const piercingRecupHelperBlock = `
<br>Bonus attaquante perçante : <div class="picto-stat recuperation-time"></div><span class="recuperation-time">vitesse de récupération</span> de <span class="neutral">${result.piercingRecupTotalReduc}%</span>.<br>
( <div class="picto-stat agility"></div><span class="agility">${result.piercingRecupAgiBonus}%</span> agilité
+ <div class="picto-stat piercing"></div><span class="piercing">${result.piercingRecupBaseBonus}%</span> perçante
+ <div class="picto-stat haste"></div><span class="haste">${result.piercingRecupHasteReduc}%</span> hâte )<br>
`;
const helpContent = {
	
	

meleeAttackPhysical: `
${meleeExecHelperBlock}
• Dégâts de l'attaque de mêlée : 100%.<br>
• Tous les <div class="picto-stat proc-effect"></div><span class="proc-effect">effets de déclenchements</span> peuvent se produire.
`,
meleeAttackPiercing: `
${meleeExecHelperBlock}
${piercingRecupHelperBlock}
• Dégâts de l'attaque de mêlée : 100%.<br>
• Tous les <div class="picto-stat proc-effect"></div><span class="proc-effect">effets de déclenchements</span> peuvent se produire.
`,
rangeAttackPiercing: `
${piercingRecupHelperBlock}
• Dégâts de l'attaque : 100%.<br>
`,

	
	projectileSpeed:`Vitesse des projectiles des attaques à distance pour atteindre leur cible.`,
	
		meleeAttack:`Les attaques de mélée infligent 100% des dégats.<br><br>Elles necessitent un temps d'éxecution.`,
	
	meleeAttackMagical:``,
	
	meleeAttackHybridal:`attaque melee hybride`,
	// meleeAttackPiercing: `Les <div class="picto-stat meleeAttack piercing"></div><span class="meleeAttack piercing">attaques de mêlée piercinges</span> ont un bonus de <div class="picto-stat recuperation-time"></div><span class="recuperation-time">vitesse de récupération</span> de <span class="neutral">${result.piercingRecupTotalReduc}%</span>.<br>
// ( <div class="picto-stat agility"></div><span class="agility">${result.piercingRecupAgiBonus}%</span> agilité + <div class="picto-stat meleeAttack piercing"></div><span class="meleeAttack piercing">${result.piercingRecupBaseBonus}%</span> piercing + <div class="picto-stat haste"></div><span class="haste">${result.piercingRecupHasteReduc}%</span> hâte )<br>
// • Dégâts de l'attaque : <span class="neutral">100%</span>.<br>
// • Tous les <div class="picto-stat proc-effect"></div><span class="proc-effect">effets de déclenchement</span> peuvent se produire.`,

	// rangeAttackPiercing: `Les <div class="picto-stat rangeAttack piercing"></div><span class="rangeAttack piercing">attaques perçantes à distance</span> ont un bonus de <div class="picto-stat recuperation-time"></div><span class="recuperation-time">vitesse de récupération</span> de <span class="neutral">${result.piercingRecupTotalReduc}%</span>.<br>
// ( <div class="picto-stat agility"></div><span class="agility">${result.piercingRecupAgiBonus}%</span> agilité + <div class="picto-stat rangeAttack piercing"></div><span class="rangeAttack piercing">${result.piercingRecupBaseBonus}%</span> piercing + <div class="picto-stat haste"></div><span class="haste">${result.piercingRecupHasteReduc}%</span> hâte )<br>
// • Dégâts de l'attaque : <span class="neutral">100%</span>.`,

	rangeAttackPhysical:`Les <div class="picto-stat physicalDamage"></div><span class="physical">attaques physiques</span> <div class="picto-stat rangeAttack physical"></div><span class="rangeAttack physical"> à distance</span> n'ont pas de <div class="picto-stat execution-time"></div><span class="execution-time">durée d'éxecution</span>.<br><br>• <div class="picto-stat projectile-speed"></div>Vitesse du projectile : ${result.ProjectilSpeedPercent} %.<br><br><div class="picto-stat danger"></div> <span class="danger">Attention</span> :<br><br>━ <div class="picto-stat rangeReduction"></div><span class="danger">Malus de distance</span> : Les <div class="picto-stat rangeAttack physical"></div><span class="rangeAttack physical">attaques à distance</span> font <span class="neutral">${result.calculateRangeRatioTotal} %</span> des dégats de l'attaque ( <span class="neutral">${result.calculateRangeRatioBase.toFixed(1)} %</span> + <div class="picto-stat agility"></div><span class="agility">${result.rangeAgiRatioBonus} %</span> + <div class="picto-stat precision"></div><span class="precision">${result.rangePrecisionRatioBonus} %</span> ).<br><br>━ <div class="picto-stat miss-shot"></div><span class="danger">Malus de visée</span> : Les <div class="picto-stat rangeAttack physical"></div><span class="rangeAttack physical">attaques à distance</span> ont <span class="neutral">${result.rangeAccuracyTotal} %</span> de chance d'atteindre leur cible ( <span class="neutral">${result.baseRangeAccuracy} %</span> + <div class="picto-stat agility"></div><span class="agility">${result.agiRangeAccuracy} %</span> + <div class="picto-stat precision"></div><span class="precision">${result.precisionRangeAccuracy} %</span> ).`,
	
	rangeAttackMagical: `Dégats des <div class="picto-stat magicalDamage"></div><span class="magical">attaques magiques</span> <div class="picto-stat rangeAttack magical"></div><span class="rangeAttack magicalRange" >à distance</span> : 100%.<br>• Pas de <div class="picto-stat execution-time"></div><span class="execution-time">durée d'éxecution</span>.<br>• <div class="picto-stat projectile-speed"></div>Vitesse du projectile : ${result.ProjectilSpeedPercent} %.<br><br><div class="picto-stat danger"></div> <span class="danger">Attention</span> :<br> <div class="picto-stat castReduction"></div><span class="danger">Malus d'Incantation</span> :  L'attaquant lançant une <span class="picto-stat rangeAttack magical"></span><span class="rangeAttack magicalRange">attaque à distance</span> a <span class="picto-stat brokenSpell"></span><span class="brokenSpell">${result.brokenSpellChanceTotal} %</span> ( <span class="neutral">${result.baseBrokenSpellChance} %</span> - <span class="picto-stat intelligence"></span><span class="intelligence">${result.intelBrokenSpellChanceReduc} %</span> ) de chance de <span class="picto-stat brokenSpell"></span><span class="brokenSpell">péter</span> son incantation.<br>━ Une <span class="picto-stat brokenSpell"></span><span class="brokenSpell">attaque pétée</span> échoue, et inflige <span class="picto-stat magicalDamage"></span><span class="magical">${result.brokenSpellDamageTotal} %</span> ( ( <span class="neutral">${result.baseBrokenSpellDamage} %</span> - <span class="picto-stat intelligence"></span><span class="intelligence">${result.intelBrokenSpellBaseDamageReduc} %</span> ) + <span class="picto-stat magicalDamage"></span><span class="magical">${result.magicalBrokenSpellDamageBonus} %</span> ) des dégâts du sort au lanceur.`,

	rangeAttackHybridal: `Les <div class="picto-stat hybridalDamage"></div><span class="hybridalDamage">attaques hybrides</span> <div class="picto-stat rangeAttack hybridal"></div><span class="hybridalRange">à distance</span> n'ont pas de <div class="picto-stat execution-time"></div><span class="execution-time">durée d'éxecution</span>.<br>• <div class="picto-stat projectile-speed"></div>Vitesse du projectile : ${result.ProjectilSpeedPercent} %.<br>
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
	• Les <div class="picto-stat criticalChance"></div><span class="criticalChance">coups critiques</span> sont possibles sur les <div class="picto-stat hybridalDamage"></div><span class="hybridalDamage">attaques hybrides</span>.<br>
	• <div class="picto-stat ambidextry"></div> <span class="ambidextry">Ambidextrie</span> fonctionne sur les <div class="picto-stat hybridalDamage"></div><span class="hybridalDamage">attaques hybrides</span>.<br>
	• <div class="picto-stat esoterism"></div><span class="esoterism">Ésoterisme</span> marche sur la part <div class="picto-stat magicalDamage"></div><span class="magical">magique</span> des <div class="picto-stat hybridalDamage"></div><span class="hybridalDamage">attaques hybrides</span>.<br>
	• Les <div class="picto-stat hybridalDamage"></div><span class="hybridalDamage">attaques hybrides</span> ne peuvent pas <div class="picto-stat brokenSpell"></div><span class="brokenSpell">Péter</span>.`,
	
	magicalDamage: `Les <div class="picto-stat magicalDamage"></div><span class="magical">Puissance magique</span> détermine les dégâts magiques des attaques de l'entité.<br>Bonus actuel : ${result.totalMagicalDamageHelp}.<br><br>• Les <div class="picto-stat magicalDamage"></div><span class="magicalDamage">attaques magiques</span> sont <div class="picto-stat undogeable"></div><span class="undogeable">inesquivables</span>.<br>
	- Les <div class="picto-stat criticalChance"></div><span class="criticalChance">coups critiques</span> sont impossibles sur les <div class="picto-stat magicalDamage"></div><span class="magical">attaques magiques</span>.<br>
	- <div class="picto-stat ambidextry"></div> <span class="ambidextry">Ambidextrie</span> ne fonctionne pas sur les <div class="picto-stat magicalDamage"></div><span class="magical">attaques magiques</span>.<br>
	- <div class="picto-stat castReduction"></div><span class="danger">Malus d'Incantation</span> : Les <div class="picto-stat magicalDamage"></div><span class="magical">attaques magiques</span> ont une chance de <div class="picto-stat brokenSpell"></div><span class="brokenSpell">Péter</span>, pouvant échouer, et blesser leurs lanceur.`,
	
	
	will: `La Volonté détermine la puissance de l'âme de l'entité. Une âme puissante résistera aux corruptions du monde et bénéficiera d'un potentiel élevé.<br>• L'entité possède un cycle d'éveil de <span class="will">${result.willAwakeBonus}</span> niveaux.<br><br>• Niveau maximum que l'entité peut atteindre : <span class="neutral">${result.lvlMaxEntite}</span> ( <span class="neutral">${result.lvlMaxBase}</span><span class="calcul-methode ${result.lvlMaxBonusOpClass}">${result.lvlMaxBonusOp}</span><div class="picto-stat will"></div><span class="will">${result.lvlMaxBonusAbs}</span>).`,
	magicalResistance: `La Résistance Magique réduit les dégâts magiques subis de <span class="magical">${result.reductionPercent} %</span>.`,
	physicalResistance: `La Résistance Physique réduit les dégâts physiques subis de <span class="physical">${result.reductionPercent} %</span>.`,
    magicalPen: `Les <div class="picto-stat magicalDamage"></div> <span class="magical">attaques magiques</span> de l'entité d'ignorent <span class="magical">${result.magicPenBonus} %</span> de la <div class="picto-stat picto-stat magicalResistance"></div><span class="magical">résistance magique</span> de la cible.`,
    physicalPen: `Les <div class="picto-stat physicalDamage"></div> <span class="physical">attaques physiques</span> de l'entité ignorent <span class="physical">${result.physicPenBonus} %</span> de la <div class="picto-stat picto-stat physicalResistance"></div><span class="physical">résistance physique</span> de la cible.`,
	velocity: `Améliore la <div class="picto-stat speed"></div><span class="speed">vitesse</span> de l'entite.<br>L'entité est <span class="velocity">${result.velocityReductionPercent} %</span> plus rapide.<br>La <div class="picto-stat speed"></div><span class="speed">vitesse</span> de l'entité passe de <span class="neutral">${(baseSpeedMs / 1000).toFixed(2)} s</span> à <span class="velocity">${(result.velocityAdjustedSpeedMs / 1000).toFixed(2)} s</span>.`,
	speed: ` La <div class="picto-stat speed"></div><span class="speed">vitesse</span> est la durée nécessaire à l'entité pour préparer son tour. <br>La <div class="picto-stat speed"></div><span class="speed">vitesse</span> est améliorée par la <div class="picto-stat velocity"></div><span class="velocity">vélocité</span>.<br><br>Vitesse de l'entité en milliseconde : <span class="velocity">${result.displayValueMs}</span>.`,
	vitality: `• Augmente les <span class="healthPoint">HP max</span> de l'entité.<br>Bonus actuel : <span class="healthPoint">+ ${result.vitalityBonus} HP</span>.<br><br>• Augmente la <div class="picto-stat dayHpRegen"></div><span class="dayHpRegen">récupération des HP</span> de l'entité au début de chaque jour de <div class="picto-stat vitality"></div><span class="vitality">+ ${result.HpRegenBonus}%</span> des HP max ( <div class="picto-stat dayHpRegen"></div><span class="dayHpRegen"> + ${result.HpRegenAmount} HP</span> ).`,
	haste: `Réduit de <div class="picto-stat haste"></div><span class="haste">${result.hastePreparation}%</span> ( <div class="picto-stat haste"></div><span class="haste">${result.hastePercent}</span> + <div class="picto-stat intelligence"></div><span class="intelligence">${result.hasteIntelRatio}</span> ) la durée de <div class="picto-stat preparation-time"></div><span class="timing">Préparation</span> des attaques de l'entité.<br><br>Additionnelement :<br>• Réduit de <div class="picto-stat intelligence"></div><span class="intelligence">${result.hasteCDReduc} %</span> la durée du <div class="picto-stat cooldown-time"></div><span class="timing">Cooldown</span> des attaques de l'entité.<br>• Réduit de <div class="picto-stat strength"></div><span class="strength">${result.hasteExecutionReduc} %</span> la durée de <div class="picto-stat execution-time"></div><span class="timing">l'Éxecution</span> des attaques de mélée de l'entité.<br>• Augmente de <div class="picto-stat strength"></div><span class="strength">${result.hasteProjectilSpeed} %</span> la <div class="picto-stat projectile-speed"></div><span class="timing">vitesse des projectiles</span> des attaques à distance de l'entité.<br>• Réduit de <div class="picto-stat agility"></div><span class="agility">${result.hasteRecupReduc} %</span> la durée de <div class="picto-stat recuperation-time"></div><span class="timing">Récupération</span> des attaques de l'entité.`,
	dayHpRegen: `L'entité récupère <span class="HP">${result.dayHpRegenTotal} HP</span> au début de chaque jour, si elle est vivante.<br><br>Détail : <span class="neutral">${result.dayHpRegenBase}</span> (base) + <span class="dayHpRegen">${result.dayHpRegenFromVitality}</span> (bonus <div class="picto-stat vitality"></div><span class="vitality">vitalité</span>).`,
    dodge: `Augmente les chances d’esquiver les <span class="physical">dégâts physiques</span> de <div class="picto-stat dodge"></div><span class="dodge">${result.calculateTotalDodgeBonus}%</span>( <div class="picto-stat dodge"></div><span class="dodge">${result.dodgeBonus}%</span> + <div class="picto-stat agility"></div><span class="agility">${result.agiDodgeBonus}%</span> ).<br><br><span class="stat-alerte">Les attaques purement magiques sont inesquivables.</span>`,
    precision: `Augmente les chances de toucher une cible avec des <span class="physical">dégâts physiques</span> de <span class="precision">${result.precisionBonus}%</span>.<br>Augmente les <div class="picto-stat criticalChance"></div> <span class="criticalChance">dégats critiques</span> de <div class="picto-stat precision"></div> <span class="precision">${result.critPrecisionBonus} %</span> `,
	indestructibility: `Octroie <div class="picto-stat indestructibility"></div><span class="indestructibility">${result.indestructibilityBonus}%</span> de chance de nullifier totalement une source de dégât.<br>L'entité subit <div class="picto-stat indestructibility"></div><span class="indestructibility">${result.indestructibilityReductionTotal} %</span> ( <div class="picto-stat indestructibility"></div><span class="indestructibility">${result.indestructibilityReduction}%</span> + <div class="picto-stat strength"></div><span class="strength">${result.indestructibilityStrengthReduction}%</span> ) de dégâts en moins.`,
	esoterism: `Octroie <div class="picto-stat esoterism"></div><span class="esoterism">${result.esoterismBonus}%</span> de chance de réduire de <span class="esoterism">${result.esoterismTotalReduction}%</span> ( <span class="neutral">${result.esoterismBaseReduction}%</span> + <div class="picto-stat agility"></div><span class="agility">${result.esoterismAgiReduction}%</span> ) une source de <div class="picto-stat magicalDamage"></div><span class="magicalDamage">dégâts magiques</span> subis.`,
    robustness:`Octroie <span class="armor">${result.armorBonus} points d'armure</span> à chaque début de combat à l'entité.`,
    astrality:`Octroie <div class="picto-stat astrality"></div><span class="astrality">${result.astralityTotal} %</span> ( <div class="picto-stat astrality"></div><span class="astrality">${result.astralityBonus} %</span> + <div class="picto-stat intelligence"></div><span class="intelligence">${result.intelAstralityBonus} %</span> ) de chances de survivre à <span class="healthPoint">1 HP</span> en cas de coup fatal.`,
    bloodFury:`L'entité a <span class="bloodFury">${result.bloodFuryExecutionBonus} %</span> ( <div class="picto-stat bloodFury"></div><span class="bloodFury">${result.bloodFuryBfRatioBonus} %</span> + <div class="picto-stat strength"></div><span class="strength">${result.bloodFurySRatioBonus} %</span> ) de chance d'<span class="physical">exécuter</span> une cible ayant <span class="neutral">${result.bloodFuryExecChanceBonus} %</span> ( <span class="neutral">15 %</span> + <div class="picto-stat strength"></div><span class="strength"> ${result.bloodFuryExecSRatioBonus} %</span> ) de <span class="healthPoint">HP</span> ou moins avec ses attaques au<div class="picto-stat meleeAttack"></div><span class="rangeAttack">corps à corps</span>.<br><br>Dégats de l'exécution : + <div class="picto-stat physicalDamage"></div><span class="physical">${result.bloodFuryExecDamage}</span> supplémentaires.<br>( <div class="picto-stat strength"></div><span class="physical">${result.bloodFuryExecSRatio} %</span> de <div class="picto-stat physicalDamage"></div><span class="physical">${safe("physicalDamage")}</span> )<br><br><span class="passive-stat">Compétence passive :</span> Les attaques au <div class="picto-stat  meleeAttack"></div><span class="rangeAttack">corps à corps</span> de l'entité lui proccurent <span class="bloodFury">${result.bloodFuryLifestealBonus} %</span> de <div class="picto-stat lifesteal"></div><span class="lifesteal"> vol de vie</span>.`,
    ambidextry:`L'entité à <span class="neutral">${result.ambidextryTotalChance} %</span> ( <div class="picto-stat ambidextry"></div> <span class="ambidextry">${result.ambidextryProcBonus} %</span> + <div class="picto-stat agility"></div> <span class="agility">${result.ambidextryAgiChance} %</span> ) de chance de réaliser un deuxième coup lors de son attaque.<br>Le deuxième coup fait <span class="neutral">${result.ambidextryDamageBonus} %</span> ( <span class="neutral">20 %</span> + <div class="picto-stat ambidextry"></div> <span class="ambidextry">${result.ambidextryRatioBonus} %</span> + <div class="picto-stat agility"></div> <span class="agility">${result.ambidextryAgiRatioBonus} %</span> ) du premier. Les effets du premier coup peuvent également être réapliqués.<br><br><span class="stat-alerte">L'ambidextire est impossible pour les attaques exclusivement magiques.</span>`,
	criticalChance: `L'entité a <span class="neutral">${result.critTotalChance} %</span> ( <div class="picto-stat criticalChance"></div> <span class="criticalChance">${result.critChanceBonus} %</span> + <div class="picto-stat agility"></div> <span class="agility">${result.critAgiChanceBonus} %</span> ) de chance de réaliser un coup critique.<br>Le coup critique inflige <span class="neutral">${result.critDamageBonus} %</span> ( <span class="neutral">50 %</span> + <div class="picto-stat precision"></div> <span class="precision">${result.critPrecisionBonus} %</span> + <div class="picto-stat criticalChance"></div> <span class="criticalChance">${result.critRatioBonus} %</span> + <div class="picto-stat agility"></div> <span class="agility">${result.critAgiRatioBonus} %</span> ) de dégâts supplémentaires.<br><br><span class="stat-alerte">Les coups critiques sont impossibles pour les attaques exclusivement magiques.</span>`,
	resilience: `• Les dégats des <div class="picto-stat criticalChance"></div> <span class="criticalChance">coups critiques</span> subis par l'entité sont réduits de <div class="picto-stat resilience"></div><span class="resilience">${result.resilienceCritTotalBonus} %</span> ( <div class="picto-stat resilience"></div> <span class="resilience">${result.resilienceCritBonus} %</span> + <div class="picto-stat strength"></div> <span class="strength">${result.resiStrengthCritBonus} %</span> ).<br><br>• Les <div class="picto-stat alteration"></div><span class="alteration">altérations d’état</span> subies par l'entité ont leurs effets réduits de <div class="picto-stat resilience"></div><span class="resilience">${result.resilienceAlteTotalBonus} %</span> ( <div class="picto-stat resilience"></div><span class="resilience">${result.resilienceAlteBonus} %</span> + <div class="picto-stat intelligence"></div><span class="intelligence">${result.resiIntelCritBonus} %</span> ).<br><br>• Les <div class="picto-stat alteration"></div><span class="alteration">altérations d’état</span> ont <div class="picto-stat resilience"></div><span class="resilience">${result.resilienceTotalCancelBonus} %</span> ( <div class="picto-stat resilience"></div><span class="resilience">${result.resilienceCancelBonus} %</span> + <div class="picto-stat agility"></div><span class="agility">${result.resiAgiCancelBonus} %</span> ) de chance d’échouer totalement.`,
	hypercognition: `• Confére un bonus de <div class="picto-stat magicalDamage"></div> <span class="magical">puissance magiques</span> supplémentaires aux attaques de l'entité.<br><br>Bonus de dégât actuel :<br><div class="picto-stat hypercognition"></div><span class="hypercognition">+ ${result.hypercognitionBonus}</span> de dégâts magiques ( <div class="picto-stat hypercognition"></div><span class="hypercognition">${result.hypercognitionValue}</span> + ( <div class="picto-stat intelligence"></div><span class="intelligence">${result.hypercognitionIntel}</span> × <div class="picto-stat hypercognition"></div><span class="hypercognition">${result.hypercognitionRatio}</span> ) ).<br><br>• Le bonus en dégât de l'hypercognition est traité par les attaques magiques de la même manière que la <div class="picto-stat magicalDamage"></div> <span class="magical">Puissance Magique</span> de l'entité.`,
	transcendence:`• Confère a l'entité le potentiel d'obtenir des <div class="picto-stat extraLife"></div><span class="extraLife">vies supplémentaires</span>.<br> Donne à l'entité un maximum de <div class="picto-stat extraLife"></div> <span class="transcendence">${result.transcendenceExBonus}</span> vies supplémentaires.<br><br>• L'entité a <div class="picto-stat transcendence"></div><span class="transcendence">${result.transcendenceConsoProtectionPercent}%</span> ( <div class="picto-stat transcendence"></div><span class="transcendence">${result.transcendenceConsoProtectionBase}%</span> + <div class="picto-stat intelligence"></div><span class="intelligence">${result.transcendenceConsoIntelBonus}%</span> ) de chance de ne pas consommer ses ressources de résurrection lors d'une utilisation.`,
	extraLife: `• Chaque <div class="picto-stat extraLife"></div><span class="extraLife">Vie Supplémentaire</span> réssucite l'entité avec <span class="HP">${result.extraLifeResurrectPercentTotal}%</span> de ses <div class="picto-stat HP"></div> max ( <span class="neutral">20 %</span> + <div class="picto-stat intelligence"></div> <span class="intelligence">${result.extraLifeResurrectPercentIntel}%</span> ).<br>• Hp rendus : <span class="HP">${result.extraLifeResurrectHP}</span> <div class="picto-stat HP"></div><br>• <div class="picto-stat extraLife"></div><span class="extraLife">Vie Supplémentaire</span> de l'entité: <div class="picto-stat extraLife"></div><span class="extraLife">${result.extraLifeCurrent}/${result.extraLifeMax}</span>.<br>• Les <div class="picto-stat extraLife"></div><span class="extraLife">Vies Supplémentaires</span> consommées se rechargent après quelques jours. Une fois rechargées, elles sont à nouveau utilisables.`,
	cooldownTime:`Durée de rechargement nécessaire après une attaque avant de pouvoir la réutiliser`,
	preparationTime:`Durée de préparation d'une attaque avant qu'elle ne soit lancée par l'attaquant sur sa cible.`,
	executionTime:` Durée de l'attaque de mélée pour toucher sa cible. `,
	recuperationTime:`Durée nécessaire à l'attaquant pour récupérer de son attaque, avant de se lancer dans un nouveau tour.`,
	rangeAttack: `Les <div class="picto-stat rangeAttack"></div><span class="rangeAttack">Attaques à distance</span> sont moins puissantes que les <div class="picto-stat meleeAttack"></div><span class="meleeAttack">Attaques de mélée</span>, mais l'attaquant n'a pas besoin d'attendre que le projectile touche la cible pour lancer sa prochaine attaque.<br><br>Les <div class="picto-stat rangeAttack"></div><span class="rangeAttack">Attaques à distance</span> font <span class="neutral">${result.calculateRangeRatioTotal} %</span> des dégats de l'attaque ( <span class="neutral">${result.calculateRangeRatioBase.toFixed(1)} %</span> + <div class="picto-stat agility"></div><span class="agility">${result.rangeAgiRatioBonus} %</span> + <div class="picto-stat precision"></div><span class="precision">${result.rangePrecisionRatioBonus} %</span> ).<br><br>Le projectile des attaques physiques a <span class="neutral">${result.rangeAccuracyTotal} %</span> de chance d'atteindre la cible ( <span class="neutral">${result.baseRangeAccuracy} %</span> + <div class="picto-stat agility"></div><span class="agility">${result.agiRangeAccuracy} %</span> + <div class="picto-stat precision"></div><span class="precision">${result.precisionRangeAccuracy} %</span> ).<br><br><span class="stat-alerte">La réduction de dégats des <div class="picto-stat rangeAttack"></div><span class="rangeAttack">Attaques à distance</span> ne s'applique pas aux <div class="picto-stat magicalDamage"></div><span class="magical">dégâts magiques</span>.</span><br><br>L'attaquant lançant une <div class="picto-stat magicalDamage"></div><span class="magical">attaque magique</span> <div class="picto-stat rangeAttack"></div><span class="rangeAttack">à distance</span> a <div class="picto-stat brokenSpell"></div><span class="brokenSpell">${result.brokenSpellChanceTotal} %</span> de chance de <div class="picto-stat brokenSpell"></div><span class="brokenSpell">Péter</span> son incantation ( <span class="neutral">${result.baseBrokenSpellChance} %</span> - <div class="picto-stat intelligence"></div><span class="intelligence">${result.intelBrokenSpellChanceReduc} %</span> ).<br><br>Une <div class="picto-stat brokenSpell"></div><span class="brokenSpell">attaque magique pétée</span> échoue, et inflige <div class="picto-stat magicalDamage"></div><span class="magical">${result.brokenSpellDamageTotal} %</span> ( ( <span class="neutral">${result.baseBrokenSpellDamage} %</span> - <div class="picto-stat intelligence"></div><span class="intelligence">${result.intelBrokenSpellBaseDamageReduc} %</span> ) + <div class="picto-stat magicalDamage"></div><span class="magical">${result.magicalBrokenSpellDamageBonus} %</span> ) des dégats du sort au lanceur .`,
	
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
    } else if (statMeta && statMeta.description) {
        result.helpContent = statMeta.description;
    } else {
        result.helpContent = "Aucune aide disponible pour ce type de stat.";
    }

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
  let physBase = Math.max(0, +s.physicalDamage || 0);
  let magiBase = Math.max(0, +s.magicalDamage || 0);
  let rawBase  = Math.max(0, +s.piercingDamage || 0);

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
    console.log(`Dégâts raw : ${totalDamageSources.piercingDamage}`);
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
  const dodgeStat = Number(getSafe(target, "dodge")) || 0;
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

  console.log(`🌀 ${target.name} → Esquive : ${totalDodgePercent}% (base ${baseDodgePercent}% + agi ${agiDodgePercent}%)`);
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
      indestructVFX.src = `../../media/assets/effects/indestructibility.gif?t=${Date.now()}`;
      indestructVFX.className = "effect-vfx indestructibility";
      indestructVFX.alt = `${target.name} est indestructible !`;
      indestructVFX.style.position = "absolute";
      effectsContainer.appendChild(indestructVFX);
      setTimeout(() => indestructVFX.remove(), 1200);
    }
  }

  return success;
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
      esoterismVFX.src = `../../media/assets/effects/esoterism.gif?t=${Date.now()}`;
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
      vfx.src = `../../media/assets/effects/transcendence.gif?t=${Date.now()}`;
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
      astralityVFX.src = `../../media/assets/effects/astrality.gif?t=${Date.now()}`;
      astralityVFX.className = "effect-vfx astrality";
      astralityVFX.alt = `${target.name} déclenche l'Astralité !`;
      astralityVFX.style.position = "absolute";
      effectsContainer.appendChild(astralityVFX);
      setTimeout(() => astralityVFX.remove(), 2500);
    }
  }

  return success;
}

export function attemptBloodFuryExec(attacker, target) {
  const bloodFury = getSafe(attacker, "bloodFury");
  const strength = getSafe(attacker, "strength");
  const physicalDamage = getSafe(attacker, "physicalDamage");

  if (bloodFury <= 0) return 0;

  // 🎯 Calcul des bonus
  const bloodFuryExecSRatioBonus = calculateBloodFuryExecStrengthRatio(strength);
  const bloodFuryExecChanceBonus = calculateBloodFuryExecChanceBonus(strength);
  const bloodFuryExecDamage = calculateExecutionDamage(attacker);

  // 💀 Pourcentage de PV restant de la cible
  const hpPercent = (target.stats.HP.current / target.stats.HP.max) * 100;

  // 🔥 Condition : seuil d’exécution
  if (hpPercent > bloodFuryExecChanceBonus) {
    console.log(
      `💀 [EXECUTION FAIL] ${attacker.name} → ${target.name} a ${hpPercent.toFixed(1)} % HP ` +
      `(seuil requis : ${bloodFuryExecChanceBonus} %).`
    );
    return 0;
  }

  // ✅ Exécution réussie
  console.log(
    `💀 [EXECUTION SUCCESS] ${attacker.name} exécute ${target.name} ` +
    `(${hpPercent.toFixed(1)} % HP, seuil ${bloodFuryExecChanceBonus} %).`
  );

  // ✨ Effet visuel facultatif
  try {
    if (typeof EffectMessage === "function") EffectMessage(target, "Éxecution !");
    const effectsContainer = document.getElementById(`effectsContainer_${target.id}`);
    if (effectsContainer) {
      const execVFX = document.createElement("img");
      execVFX.src = `../../media/assets/effects/bloodFuryExec.gif?t=${Date.now()}`;
      execVFX.className = "effect-vfx bloodfuryexec";
      execVFX.style.position = "absolute";
      execVFX.style.zIndex = "20";
      effectsContainer.appendChild(execVFX);
      setTimeout(() => execVFX.remove(), 2000);
    }
  } catch (e) {
    console.warn("⚠️ Effet d’exécution non chargé :", e);
  }

  // 💥 Retourne les dégâts bruts
  return Math.ceil(bloodFuryExecDamage);
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

export function calculateBloodFuryExecChanceBonus(strength) {
  const strengthRatio = calculateBloodFuryExecStrengthRatio(strength);
  return Math.ceil((15 + strengthRatio) * 100) / 100;
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
        applyDamage( target, secondHitDamage, attacker, { ...attack, isAmbidextry: true }, totalDamageSources, attack.selfEffects );
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

export function attemptRangeAccuracy(attacker, target) {
  if (!attacker) return true;

  // % 0.0..100.0 (round1 + clamp déjà gérés par calculateRangeAccuracy)
  const chance = calculateRangeAccuracy(attacker);
  const roll = round1(Math.random() * 100);

  const success = roll <= chance;

  // Debug optionnel
  attacker.lastRangeAccuracy = {
    chance,
    roll,
    success,
    targetId: target?.id,
    time: Date.now()
  };

  if (!success) {
    console.log(`MISS (Adresse) : ${attacker.name} rate ${target?.name || "la cible"} (jet ${roll}% > ${chance}%).`);
  }

  return success;
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
		ambiVFX.src = `../../media/assets/effects/ambidextry.gif?t=${Date.now()}`;
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

export function calculateCritTotalChance(entite, critValueOverride = null) {
  if (!entite) return 0;

  const critValueRaw = critValueOverride ?? getSafe(entite, "criticalChance");
  const critValue = Number(critValueRaw) || 0;

  // Si l'entité a 0 de crit, la chance totale doit rester à 0 (on ignore le bonus AGI).
  if (critValue <= 0) return 0;

  const critChanceBonus = calculateCritChancePercent(critValue);
  const critAgiChanceBonus = calculateCritAgiChanceBonus(entite);

  const total = critChanceBonus + critAgiChanceBonus;
  return Math.round(total * 10) / 10;
}


// Bonus de ratio basé sur la chance critique (50% du bonus principal)
export function calculateCritRatioBonus(entite, critValueOverride = null) {
  if (!entite) return 0;
  const critValue = Number(critValueOverride ?? getSafe(entite, "criticalChance")) || 0;

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

// Dégâts critiques bonus = 50% + précision*0.5 + bonus(critChance)*0.5 + bonus(agi)*0.4
export function calculateCritDamageBonus(entite, critValueOverride = null) {
  if (!entite) return 0;

  const base = 50;
  const critPrecisionBonus = calculateCritPrecisionBonus(entite);
  const critRatioBonus = calculateCritRatioBonus(entite, critValueOverride);
  const critAgiRatioBonus = calculateCritAgiRatioBonus(entite);

  const total = base + critPrecisionBonus + critRatioBonus + critAgiRatioBonus;
  return Math.round(total * 10) / 10;
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

  const critValue = Number(getSafe(attacker, "criticalChance")) || 0;

  const critChanceBonus = calculateCritChancePercent(critValue);
  const critAgiChanceBonus = calculateCritAgiChanceBonus(attacker);
  const critTotalChance = calculateCritTotalChance(attacker, critValue);

  const critRatioBonus = calculateCritRatioBonus(attacker, critValue);
  const critAgiRatioBonus = calculateCritAgiRatioBonus(attacker);
  const critPrecisionBonus = calculateCritPrecisionBonus(attacker);

  const critDamageBonus = calculateCritDamageBonus(attacker, critValue);

  const randomRoll = Math.random() * 100;
  const isCritical = randomRoll <= critTotalChance;

  const baseDamage = Number(totalDamage) || 0;
  const finalDamage = isCritical
    ? Math.round(baseDamage * (1 + critDamageBonus / 100))
    : baseDamage;

  return {
    isCritical,
    popupType: isCritical ? "critical" : "normal",
    finalDamage,
    critTotalChance,
    critDamageBonus,
    components: {
      critChanceBonus,
      critAgiChanceBonus,
      critRatioBonus,
      critAgiRatioBonus,
      critPrecisionBonus
    }
  };
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
      resilienceVFX.src = `../../media/assets/effects/resilience-cancel.gif?t=${Date.now()}`;
      resilienceVFX.className = "effect-vfx resilience";
      resilienceVFX.style.position = "absolute";
      resilienceVFX.style.pointerEvents = "none";
      resilienceVFX.style.zIndex = "10";
      effectsContainer.appendChild(resilienceVFX);
      setTimeout(() => resilienceVFX.remove(), 2100);
    }

    EffectMessage(target, "Résilience !");
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

  EffectMessage(target, "Résilience !");
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
  const hasHaste = hastePoints > 0; // ✅ règle : valable QUE si haste > 0

  const hasteBase = hasHaste ? (Number(calculateHastePercent(hastePoints)) || 0) : 0;

  const prepReduc = hasHaste ? clampPercent(hasteBase + calculateHasteIntelRatio(entite)) : 0;
  const cdReduc   = hasHaste ? clampPercent(calculateHasteCDReduc(entite))                : 0;
  const execReduc = hasHaste ? clampPercent(calculateHasteExecReduc(entite))              : 0;
  const recReduc  = hasHaste ? clampPercent(calculateHasteRecupReduc(entite))             : 0;

  const base = {
    cooldown:        Number(attack.cooldown) || 0,
    preparationTime: Number(attack.preparationTime) || 0,
    executionTime:   Number(attack.executionTime) || 0,
    recoveryTime:    Number(attack.recoveryTime) || 0,
  };

  const effective = {
    cooldown:        applyReducToMs(base.cooldown,        cdReduc),
    preparationTime: applyReducToMs(base.preparationTime, prepReduc),
    executionTime:   applyReducToMs(base.executionTime,   execReduc),
    recoveryTime:    applyReducToMs(base.recoveryTime,    recReduc),
  };

  const phase = {
    executionPhaseTime: attack.attackRange?.includes("range")
      ? effective.preparationTime
      : effective.executionTime,
  };

  return {
    base,
    effective,
    phase,
    reduc: { hasHaste, hastePoints, hasteBase, prepReduc, cdReduc, execReduc, recReduc },
  };
}
// export function getTranscendenceExtraLifeText(entite) {
  // const points =
    // entite?.modifierStats?.preview?.total?.intelligence ??
    // entite?.stats?.intelligence ??
    // entite?.baseStats?.intelligence ??
    // entite?.intelligence ??
    // 0;

  // const v = calculateTranscendenceExtraLife(points);
  // return v > 0 ? `+${v}` : "0";
// }

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
  const hyperco = getSafe(entite, "hypercognition") ?? 0;
  const intel   = getSafe(entite, "intelligence") ?? 0;

  // ratio basé sur hyperco
  const ratio = calculateHypercognitionRatio(hyperco);

  // nouvelle règle
  const total = hyperco + (intel * ratio);

  // arrondi à l'entier le plus proche
  return Math.round(total);
}

export function calculateMagicalTotal(entite) {
  const magicPower = getSafe(entite, "magicPower") ?? 0;

  // bonus issu de l'hypercognition (réutilise ta logique existante)
  const hyperBonus = calculateHypercognitionBonus(entite) ?? 0;

  // association : puissance magique de base + bonus hypercognition
  const total = magicPower + hyperBonus;

  // arrondi à l'entier le plus proche
  return Math.round(total);
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
      brokenVFX.src = `../../media/assets/effects/broken-spell.gif?t=${Date.now()}`;
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
      brokenVFX.src = `../../media/assets/effects/broken-spell.gif?t=${Date.now()}`;
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

export function calculatePiercingRecupBonus(attacker, attack = null) {
  return 20;
}
// Total reduction % = hasteRecupReduc + piercingRecupBonus + agiRatio (cap 95)
export function totalpiercingRecupReduction(entite, attack = null) {
  const hasteRecup = Number(calculateHasteRecupReduc(entite)) || 0;
  const piercingRecup = Number(calculatepiercingRecupBonus(entite, attack)) || 0;

  // même logique que le reste chez toi: on passe par safe("agility",0) côté display,
  // mais ici c’est une fonction générique: on attend une valeur d’agilité -> on la reçoit via attempt.
  // Donc: PAS de path entite?.stats ici.
  // => l’agilité sera injectée dans attemptpiercingRecupBonus (voir plus bas).
  // Si tu veux une version "entity aware", fais-la ailleurs, pas ici.

  // ⚠️ ici on ne peut pas deviner l’agility sans safe(), donc total se calcule dans attempt
  // => on laisse une version "entity aware" optionnelle en dessous si tu veux.
  return clampPercent(hasteRecup + piercingRecup, 0, 95);
}

export function totalPiercingRecupReductionWithAgi(entite, attack = null) {
  const hasteRecup = Number(calculateHasteRecupReduc(entite)) || 0;
  const piercingRecup = Number(calculatePiercingRecupBonus(entite, attack)) || 0;

  const agility = Number(getSafe(entite, "agility", 0)) || 0;
  const agiRecup = Number(calculateRecupAgilityRatio(agility)) || 0;

  return clampPercent(hasteRecup + piercingRecup + agiRecup, 0, 95);
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
