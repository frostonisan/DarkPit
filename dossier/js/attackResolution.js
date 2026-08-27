export function normArr(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "string") return [value].filter(Boolean);
  return [];
}

export function getAttackResolutionFlags(attack = {}) {
  const ranges = normArr(attack.attackRange);
  const natures = normArr(attack.attacknature);

  const isMelee = ranges.includes("melee");
  const isRange =
    ranges.includes("range") ||
    ranges.includes("ranged") ||
    ranges.includes("distance");

  const hasPhysical = natures.includes("physicalDamage");
  const hasMagical = natures.includes("magicalDamage");
  const hasHybridal = natures.includes("hybridalDamage");
  const hasPiercing = natures.includes("piercingDamage");

  const natureCount =
    Number(hasPhysical) +
    Number(hasMagical) +
    Number(hasHybridal) +
    Number(hasPiercing);

  const isPurePhysical = hasPhysical && natureCount === 1;
  const isPureMagical = hasMagical && natureCount === 1;
  const isPureHybridal = hasHybridal && natureCount === 1;
  const isPurePiercing = hasPiercing && natureCount === 1;

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
    isPureMagicalIntellect: isPureMagical,
    isTranspiercing: isPurePiercing,

    hasPhysicalBehavior,
    hasMagicalBehavior,

    // =========================
    // ATTACK ENTITES
    // =========================
    canMissAccuracy: isRange && !isPureMagical,

    isUndodgeable: isPureMagical,
    canBeDodged: !isPureMagical,
    dodgeMode: isPureMagical
      ? "none"
      : isPurePiercing
        ? "hard"
        : "normal",

    canBrokenSpell: isPureMagical,
    brokenSpellMode: isPureMagical
      ? isRange
        ? "range_self"
        : isMelee
          ? "melee_double"
          : null
      : null,

    canAmbidextry: !isPureMagical,

    // =========================
    // APPLY DAMAGE
    // =========================
    canCrit: !isPureMagical,

    canBloodFuryExec:
      isMelee &&
      !isPureMagical &&
      !isPurePiercing,

    canBloodFuryLifesteal:
      isMelee &&
      !isPureMagical &&
      !isPurePiercing,

	canBloodThirsty:
	  hasPhysical ||
	  hasHybridal ||
	  hasPiercing,
  
    canBypassArmorGate: isPurePiercing,
    applyRangeRatio: isRange,
    applyRangeRatioToPiercing: isRange && hasPiercing,
    applyRangeRatioToPhysical: isRange && hasPhysical,
    applyRangeRatioToHybridPhysicalHalf: isRange && hasHybridal,

    applyEsoterismToMagical: hasMagical,
    applyEsoterismToHybridMagicalHalf: hasHybridal,
  };
}