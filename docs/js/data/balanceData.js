import './umbraProgression.js';

export const balanceData = {
    effectRules: { burn: { tickSeconds: 1, maintenanceSeconds: 5, lossPercent: 60, extinctionPercent: 30 } },
  attackMastery: {
    maxLevel: 10,
    firstLevelCost: 100,
    costIncrease: 50,
    gains: { launch: 1, impact: 1, critical: 1 },
  },
  attackPurity: { maxLevel: 10, maxBaseBonus: 15 },
  attackNature: {
    inertRatioReductionPercent: 30,
    armorBypassPerLevel: 10,
    transpiercingAgility: { minPercent: 5, maxPercent: 30 },
    recoveryExtraMax: 5,
    overloadReductionMax: 50,
    resonance: { threshold: 0.3, startPercent: 5, normalCap: 30, capPerLevel: 2.5, perfectJump: 10 },
    rupture: { amount: 5, perLevel: 1, cap: 10, supportCap: 5, durationMs: 8000 },
    dissolution: { amount: 5, perLevel: 1, cap: 10, supportCap: 5, durationMs: 8000 },
    convergence: { percent: 1.5, perLevel: 0.5 },
  },
  level: {
    // Pilote calculateLevelCosts et la table d'XP : coût de départ, croissance par niveau,
    // et profondeur maximale de la table disponible pour toutes les entités.
    progression: {
      baseXpCost: 50,
      increaseRatePercent: 10,
      tableMaxLevel: 250,
    },

    // Pilote calculateLvlMaxBonus/calculateLvlMaxEntiteWithWill et calculatewillAwakeBonus :
    // la volonté détermine le niveau maximal atteignable et le nombre d'étapes d'éveil.
    will: {
      baseMaxLevel: 100,
      willCap: 150,
      minLevelRatioAtWillOne: 0.65,
      pivotWill: 80,
      prePivotSpan: 79,
      postPivotSpan: 70,
      targetMaxLevelAtWillCap: 150,
      hardMaxLevel: 250,
      pointsPerAwakeningLevel: 2,
      minAwakeningLevels: 1,
      maxAwakeningLevels: 99,
    },
  },

  regeneration: {
    // Pilote ensureExtraLifeRegen/ensureEternalLifeRegen :
    // cadence de régénération journalière progressive des charges de résurrection.
    extraLife: {
      baseMaxRegen: 3,
      step: 3,
    },

    // Pilote calculateVitalityRegenPercent/calculateVitalityRegenAmount/calculateTotalRegenAmount :
    // conversion de la vitalité en régénération journalière additionnelle.
    vitalityDayHp: {
      maxVitality: 150,
      maxPercent: 5,
      decimals: 2,
      minTotalBaseAmount: 1,
    },

    // Pilote calculateHpBattleRegen* :
    // Indestructibilité débloque une régénération de combat, renforcée par Force et Indestructibilité.
    battleHp: globalThis.umbraProgression.indestructibility.regeneration,
  },

  generatedStats: {
    // Pilote calculateVitalityBonus : transforme la vitalité en HP max bonus.
    vitalityHp: {
      firstPointBonus: 10,
      minBonus: 10,
      maxBonus: 400,
      growthK: 0.02,
    },

    // Armure X + don direct ; mêmes réglages dans le jeu et Index 14 / Maj.
    robustnessArmor: globalThis.umbraProgression.sources.robustness,

    // Pilote calculateTranscendenceExtraLife :
    // conversion des points de Transcendance en vies supplémentaires.
    transcendenceExtraLife: globalThis.umbraProgression.transcendence.extraLife,

    // Pilote calculateVelocityReduction : conversion de Vélocité en réduction du délai de tour.
    velocityTurnSpeed: globalThis.umbraProgression.vivacite.velocity,
  },

  baseUmbraCurves: {
    // Pilote calculateDodgePercent : conversion des points d'Esquive en chance brute.
    dodge: globalThis.umbraProgression.dodgeCurve,

    // Pilote calculatePrecisionPercent : conversion de Précision en réduction d'esquive adverse.
    precision: globalThis.umbraProgression.precisionCurve,

    // Pilote calculateIndestructibilityPercent : chance brute d'Indestructibilité.
    indestructibility: globalThis.umbraProgression.indestructibility.chance,

    // Pilote calculateHastePercent : réduction de préparation donnée par Hâte avant ratios.
    haste: {
      firstPointPercent: 1.5,
      minPercent: 1.5,
      maxPercent: 35,
      growthDivisor: 70,
      decimals: 2,
    },

    // Pilote calculateEsoterismPercent : chance brute d'Esotérisme.
    esoterism: globalThis.umbraProgression.esoterism.chance,
  },

  attackTime: {
    // Pilote les calculateHaste*/getFinalAttack*/applyReducToMs :
    // toutes les réductions de temps d'attaque partagent ce cap.
    reductionCapPercent: 95,

    // Pilote les ratios secondaires de Hâte vers préparation/cooldown/exécution/récupération/projectiles.
    hasteRatios: {
      statCap: 150,
      intelligencePrepMaxPercent: 30,
      intelligenceCooldownMaxPercent: 25,
      agilityRecoveryMaxPercent: 25,
      strengthExecutionMaxPercent: 25,
      projectileSpeedCapPercent: 95,
      projectileSpeedBasePercent: 100,
      projectileSpeedDecimals: 2,
    },
  },

  attackDamage: {
    // Pilote les helpers de nature d'attaque et les bases de dégâts :
    // pourcentage de dégâts conservé avant modificateurs spécifiques.
    basePercent: 100,
  },

  generatedUmbraStats: {
    // Réglages communs aux trois puissances. Les points restent stockés bruts :
    // la limite s'applique au cumul, suivant leur provenance, lors du calcul.
    // Source commune avec le mode Maj d’index-14 (réglages dans umbraProgression.js).
    progression: globalThis.umbraProgression.progression,
    // Pilote calculateGeneratedUmbra* :
    // Chaque Umbra additionne sa contribution et celle de son attribut.
    tiers: [
      { minAttribute: 1, maxAttribute: 29, multiplier: 1.5 },
      { minAttribute: 30, maxAttribute: 59, multiplier: 2.5 },
      { minAttribute: 60, maxAttribute: 89, multiplier: 3.5 },
      { minAttribute: 90, maxAttribute: Infinity, multiplier: 4.5 },
    ],
    sources: {
      vigueur: globalThis.umbraProgression.sources.vigueur,
      robustness: globalThis.umbraProgression.sources.robustness,
      esprit: globalThis.umbraProgression.sources.esprit,
      finesse: globalThis.umbraProgression.sources.finesse,
      adresse: globalThis.umbraProgression.sources.adresse,
      vision: globalThis.umbraProgression.sources.vision,
      brutality: {
        target: "physicalPen",
        attribute: "strength",
        decimals: 0,
        ratios: { source: 1, attribute: 0.5 },
      },
      inflexion: {
        target: "magicalPen",
        attribute: "intelligence",
        decimals: 0,
        ratios: { source: 1, attribute: 0.5 },
      },
      vivacite: globalThis.umbraProgression.vivacite.velocity,
      constitution: globalThis.umbraProgression.sources.constitution,
      integrite: globalThis.umbraProgression.sources.integrite,
    },
  },

  damageIntensifiers: {
    // Pilote Fracassante : Force augmente légèrement la puissance physique des attaques physiques pures.
    brutality: {
      piercingBasePercent: 100,
      maxRatioPercent: 10,
      softCapDivider: 50,
      minBonus: 1,
    },

    // Pilote Psionique : Intelligence augmente légèrement la puissance magique des attaques magiques pures.
    psionic: {
      piercingBasePercent: 100,
      maxRatioPercent: 10,
      softCapDivider: 50,
      minBonus: 1,
    },
  },

  resistance: {
    piercing: { constant: 100, increase: 1.2, decrease: 0.9 },
    // Pilote calculateResistanceReductionPercent/calculateResistances :
    // formule de réduction type r / (r + constante), puis split hybride.
    reductionCurve: globalThis.umbraProgression.resistanceCurve,
    hybrid: {
      splitRatio: 0.5,
    },
  },

  penetration: {
    // Pilote calculatePenetrationPercent : courbe logistique de pénétration physique/magique.
    curve: {
      exactOnePercent: 1,
      maxStat: 150,
      steepness: 0.045,
      midpoint: 60,
      maxPercent: 99,
    },
  },

  critical: globalThis.umbraProgression.critical,


  indestructibility: globalThis.umbraProgression.indestructibility,

  esoterism: globalThis.umbraProgression.esoterism,
  transcendence: globalThis.umbraProgression.transcendence,

  astrality: globalThis.umbraProgression.astrality,

  blood: globalThis.umbraProgression.blood,

  ambidextry: globalThis.umbraProgression.ambidextry,

  vision: globalThis.umbraProgression.vision,
  range: {
    // Perte avant Bull’s Eye, selon la durée effective du projectile au lancement.
    ratio: {
      basePercent: 25,
      maxPercent: 50,
      executionAtMaximumMs: 10000,
      hybridPenaltyRatio: 0.5,
    },
  },

  brokenSpell: {
    // Pilote calculateBrokenSpellChance/calculateBrokenSpellDamage :
    // risque d'incantation brisée et dégâts retournés au lanceur.
    chance: {
      basePercent: 30,
      intelligenceCap: 100,
      intelligenceMaxReductionPercent: 30,
      curvePower: 2,
      maxPercent: 99,
      decimals: 1,
    },
    damage: {
      basePercent: 15,
      intelligenceCap: 150,
      intelligenceMaxReductionPercent: 15,
      magicalPowerCap: 150,
      magicalPowerMaxBonusPercent: 30,
      curvePower: 2,
      maxPercent: 99,
      decimals: 1,
    },
  },

  melee: {
    // Pilote calculateExecStrengthRatio/calculateMeleeExecBonus/totalMeleeExecReduction :
    // accélération native de mêlée, renforcée par la Force.
    execution: {
      basePercent: 20,
      strengthCap: 150,
      strengthMaxPercent: 10,
      magicalTypeBonus: 0,
      hybridalTypeBonus: 0,
      piercingTypeBonus: 0,
    },
  },

  piercing: {
    // Pilote calculatePiercingRecup* et attemptPiercingRecupBonus :
    // réduction de récupération apportée par les attaques perçantes et l'Agilité.
    recovery: {
      piercingBasePercent: 5,
      transpiercingBasePercent: 10,
      agilityCap: 150,
      agilityMaxPercent: 10,
      agilitySoftCapDivider: 80,
      transpiercingAgilityMultiplier: 6,
      transpiercingAgilityDivider: 10,
      maxReductionPercent: 95,
    },

    // Pilote transpiercingAgiRatio/transpiercingTotal :
    // transpercement pur : dégâts perçants renforcés par Agilité.
    transpiercing: {
      agilityDamageRatio: 0.8,
    },
  },

  hypercognition: globalThis.umbraProgression.hypercognition,

  resurrection: { fadedLifeRatio: 0.50, eternalLifeRatio: 1 },

  extraLife: {
    // Pilote calculateExtraLifeResurrect* : HP rendus lors d'une résurrection extraLife.
    resurrect: {
      basePercent: 20,
      intelligencePercentPerPoint: 1,
      maxPercent: 99,
      maxIntelligencePercent: 999,
      decimals: 1,
    },
  },

  statGraph: {
    // Pilote calculateStatGraphValue : pondération des stats dans le graphe de profil/build.
    levelWeights: {
      "0.5": 0.5,
      "1": 1,
      "2": 3,
      "3": 5,
    },
  },

  archetype: {
    // Pilote archetypeCore/reverseArchetype :
    // valeurs de secours et normalisation des proportions Force/Agilité/Intelligence.
    defaultStratWill: 12,
    egareFallbackWill: 10,
    ratioTotalPercent: 100,
  },

  movement: {
    // Pilote calculateMovementStartingCharge* et calculateMovementMarathonChance :
    // charges de déplacement initiales et chances liées au mouvement.
    charges: {
      agilityCap: 150,
      baseStartingPercent: 30,
      maxAgilityStartingBonusPercent: 70,
      maxStartingPercent: 99,
      startingSoftCapDivider: 50,
      chanceMaxPercent: 99,
      marathonAgilityCap: 150,
      marathonMaxPercent: 99,
      trailerBasePercent: 3,
      trailerMovementRatio: 0.6,
      marathonBasePercent: 5,
      marathonAgilityRatio: 0.3,
      refillBaseAmount: 1,
      trailerRefillAmount: 2,
    },

    // Pilote calculateGeneratedWeight/getMovementWeightMalus :
    // poids généré, relais Force/Intelligence et malus de coût de déplacement.
    weight: {
      weightMultiplier: 20,
      strengthRelayThreshold: 3,
      strengthRelayRatio: 0.5,
      intelligenceRatio: 1 / 3,
      strengthPassiveRatio: 0,
      minCarryingPower: 1,
      featherLimit: 20,
      lightLimit: 40,
      middleLimit: 60,
      heavyLimit: 80,
      middleMalus: 1,
      heavyMalus: 2,
      superHeavyMalus: 3,
    },
  },

  weaponMastery: {
    // Pilote calculateWeaponMasteryCharge/weaponMasteryChargeStrenghtRatioBonus :
    // Maîtrise d'arme et Force augmentent les emplacements d'équipement.
    charge: {
      masteryDivisor: 10,
      masteryBaseBonus: 1,
      strengthDivisor: 20,
    },

    // Pilote calculateWeaponMasteryTrophy* :
    // Maîtrise d'arme et Force alimentent le collectionneur/trophée.
    trophy: {
      basePercent: 5,
      masteryMaxBonusPercent: 30,
      masteryRange: 149,
      strengthCap: 150,
      strengthMaxPercent: 5,
    },
  },

  weaponOrfevre: {
    // Pilote calculateWeaponOrfevre* et l'amplification des contributions positives de stuff :
    // Orfèvre actif booste les stats d'équipement une seule fois, à partir de la valeur avant amplification.
    equipmentAmplification: {
      detailPrecision: 100,
      effectivePrecision: 1,
    },
    fromWeaponMastery: {
      earlyCap: 120,
      earlyDivisor: 5,
      earlyBaseBonus: 1,
      lateBaseBonus: 25,
      lateDivisor: 10,
    },
    fromStrength: {
      earlyCap: 100,
      earlyDivisor: 10,
      earlyMinBonus: 1,
      lateBaseBonus: 10,
      lateDivisor: 20,
    },
  },

  mysticism: {
    // Pilote calculateMysticism* et attemptMysticismTrance :
    // proc, durée, accélération de préparation et bonus dégâts pendant la transe mystique.
    proc: {
      baseChancePercent: 5,
      intelligenceMaxBonusPercent: 15,
      intelligenceTarget: 150,
      curvePower: 2,
      decimals: 2,
      totalDecimals: 50,
    },
    trance: {
      baseDurationMs: 2000,
      intelligenceMaxSeconds: 10,
      intelligenceTarget: 150,
      curvePower: 3,
    },
    preparation: {
      baseAccelerationPercent: 100,
      intelligenceMaxBonusPercent: 99,
      intelligenceTarget: 150,
      curvePower: 2,
      decimals: 2,
    },
    damage: {
      baseBonusPercent: 10,
      intelligenceMaxBonusPercent: 50,
      intelligenceTarget: 150,
      curvePower: 2,
      decimals: 2,
    },
  },

  equilibre: globalThis.umbraProgression.equilibre,
  vivacite: globalThis.umbraProgression.vivacite,

  occultism: {
    // Pilote calculateOccultism* et les buffs temporaires d'invisibilité :
    // invisibilité, ciblabilité, esquive bonus, critique de sortie et fragilité d'ombre.
    invisibility: {
      baseChancePercent: 50,
      agilityMaxBonusPercent: 15,
      agilityTarget: 150,
      curvePower: 2,
      decimals: 2,
    },
    targetable: {
      baseChancePercent: 10,
      agilityMaxBonusPercent: 10,
      agilityTarget: 150,
      curvePower: 2,
      displayBasePercent: 100,
      decimals: 2,
    },
    forcedTarget: { avoidChancePercent: 50 },
    dodge: {
      baseBonusPercent: 50,
      agilityMaxBonusPercent: 25,
      agilityTarget: 150,
      curvePower: 2,
    },
    critical: {
      baseChanceBonusPercent: 0,
      agilityMaxBonusPercent: 25,
      agilityTarget: 150,
      curvePower: 2,
      decimals: 2,
    },
    drawbacks: {
      shadowFragilityPercent: 100,
      preparationSpeedDebuffPercent: 100,
    },
  },

  resilience: globalThis.umbraProgression.resilience,

};

// Explicit effect/contribution ceilings only. Point scores and uncapped totals
// deliberately have no entry. Values are read live from their owning settings.
export function getStatEffectMaximum(key) {
  const b = balanceData, p = globalThis.umbraProgression;
  switch (key) {
    case 'dodgeChance': return p.dodgeCurve.maxPercent;
    case 'precisionChance': return p.precisionCurve.maxPercent;
    case 'resistanceReduction': return p.resistanceCurve.maxPercent;
    case 'physicalPen': case 'magicalPen': return b.penetration.curve.maxPercent;
    case 'criticalChance': case 'critTotalChance': return p.critical.chanceCurve.maxPercent;
    case 'bullsEye': return p.bullsEyeCurve.maxPercent;
    case 'fatalSurvival': case 'astralityTotal': return p.astrality.fatalSurvival.maxPercent;
    case 'astralBody': return p.astrality.astralBody.maxPercent;
    case 'astralReturn': return p.astrality.astralReturn.maxPercent;
    case 'criticalResistance': case 'resilienceCritTotalBonus': return p.resilience.criticalResistance.maxPercent;
    case 'alterationResistance': case 'resilienceAlteTotalBonus': return p.resilience.alterationResistance.maxPercent;
    case 'hindranceResistance': case 'resilienceHindranceBonus': return p.resilience.hindranceResistance.maxPercent;
    case 'resilienceTotal': case 'resilienceTotalCancelBonus': return p.resilience.resilienceTotal.maxPercent;
    case 'equilibreAggroBonus': case 'equilibreAggroReduction': case 'equilibreInvisibleDetection': case 'equilibreBalancedAttackChance': return p.equilibre[key].maxPercent;
    case 'velocity': case 'controlledSpeed': return p.vivacite[key].maxPercent;
    case 'agileRetreat': return p.vivacite.retreat.maxPercent;
    case 'transcendenceTotal': case 'transcendenceConsoProtectionPercent': return b.transcendence.consoProtection.maxPercent;
    case 'cognitiveGenerator': case 'hypercognitionEssences': return b.hypercognition.essences.maxCount;
    case 'indestructibilityTotal': case 'indestructibilityBonus': return b.indestructibility.chance.maxPercent;
    case 'indestructibleSkin': case 'indestructibilityReductionTotal': return b.indestructibility.reduction.maxPercent;
    case 'hpBattleRegen': case 'hpBattleRegenPercent': return b.indestructibility.regeneration.maxPercent;
    case 'bloodThirsty': case 'bloodFuryBloodThirstyBonus': return b.blood.thirsty.maxPercent;
    case 'bloodFuryExecutionChance': case 'bloodFuryExecutionBonus': return b.blood.furyExecution.chance.maxPercent;
    case 'bloodFuryTargetThreshold': case 'bloodFuryExecChanceBonus': return b.blood.furyExecution.threshold.maxPercent;
    case 'esoterismChance': case 'esoterismBonus': return b.esoterism.chance.maxPercent;
    case 'esoterismPiercingChance': return b.esoterism.piercing.maxPercent;
    case 'esoterismReduction': case 'esoterismTotalReduction': return b.esoterism.reduction.maxPercent;
    case 'esoterismPiercingReduction': return b.esoterism.reduction.maxPercent * b.esoterism.piercing.reductionRatio;
    case 'ambidextryTotalChance': return b.ambidextry.chance.maxPercent;
    case 'marathon': case 'trailer': case 'movementMarathonChance': case 'movementTrailerChance': return b.movement.charges.chanceMaxPercent;
    case 'movementStartingTotalCurrent': return b.movement.charges.maxStartingPercent;
    case 'attackCooldownReduc': case 'attackPreparationReduc': case 'attackExecutionReduc': case 'attackRecoveryReduc': case 'attackProjectileSpeed': return b.attackTime.reductionCapPercent;
    case 'vitalityBonus': return b.generatedStats.vitalityHp.maxBonus;
    default: return undefined;
  }
}

export function getBalance(path, fallback = undefined) {
  if (!path) return fallback;

  const value = String(path)
    .split(".")
    .reduce((current, key) => current?.[key], balanceData);

  return value === undefined ? fallback : value;
}

export function getBalanceConfig(path, fallback = {}) {
  const value = getBalance(path, fallback);
  return value && typeof value === "object" ? value : fallback;
}

export function roundBalance(value, decimals = 0) {
  const n = Number(value) || 0;
  const factor = 10 ** Math.max(0, Number(decimals) || 0);
  const rounded = Math.round(n * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function clampBalance(value, min = 0, max = 100) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export function easeOutPowerRatio(value, cap, curvePower = 2) {
  const capped = clampBalance(value, 0, cap);
  const ratio = cap > 0 ? capped / cap : 0;
  return 1 - Math.pow(1 - ratio, curvePower);
}

export default balanceData;
