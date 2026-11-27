// Deterministic damage arithmetic. Inputs are resolved stats, nature rules and explicit rolls.
// This module neither reads entities nor triggers presentation or random draws.
export const DAMAGE_SOURCE_KEYS = Object.freeze(["piercingDamage", "physical", "magical", "hybridalDamage"]);

export function splitDamageByNature(nature, amount) {
  const { profile, key } = nature;
  const value = Math.max(0, Number(amount) || 0);
  const sources = { physical: 0, magical: 0, piercingDamage: 0, hybridalDamage: 0 };
  if (key === 'hybrid') sources.hybridalDamage = value;
  // Inert hits use the existing physical transport channel, with both defenses at resolution.
  else if (key === 'none') sources.physical = value;
  else if (profile.total) {
    sources.physical = value * profile.red / profile.total;
    sources.magical = value * profile.blue / profile.total;
    sources.piercingDamage = value * profile.yellow / profile.total;
  }
  return sources;
}

export function roundAttackDamageSources(sources) {
  const parts = DAMAGE_SOURCE_KEYS.map(key => {
    const number = Number(sources?.[key]);
    const value = Number.isFinite(number) ? Math.max(0, number) : 0;
    return { key, value, whole: Math.floor(value) };
  });
  const sum = parts.reduce((total, part) => total + part.value, 0);
  const epsilon = Math.min(1e-9, Number.EPSILON * Math.max(1, sum) * parts.length);
  let remaining = Math.floor(sum + epsilon) - parts.reduce((total, part) => total + part.whole, 0);
  // One floor on the total; assign the residual points to the largest fractional parts.
  parts.sort((first, second) => (second.value - second.whole) - (first.value - first.whole));
  for (const part of parts) {
    if (remaining <= 0) break;
    part.whole++;
    remaining--;
  }
  return Object.fromEntries(parts.map(part => [part.key, part.whole]));
}

export function buildScaledDamageSources(sources, targetTotal) {
  const total = Math.max(0, Math.round(Number(targetTotal) || 0));
  const cleanSources = Object.fromEntries(
    DAMAGE_SOURCE_KEYS.map(key => [key, Math.max(0, Number(sources?.[key] || 0))])
  );
  const sourceTotal = DAMAGE_SOURCE_KEYS.reduce((sum, key) => sum + cleanSources[key], 0);

  if (total <= 0) {
    return { piercingDamage: 0, physical: 0, magical: 0, hybridalDamage: 0 };
  }

  if (sourceTotal <= 0) {
    return { piercingDamage: 0, physical: total, magical: 0, hybridalDamage: 0 };
  }

  const parts = DAMAGE_SOURCE_KEYS.map(key => {
    const exact = (cleanSources[key] / sourceTotal) * total;
    const value = Math.floor(exact);
    return {
      key,
      exact,
      value,
      remainder: exact - value,
    };
  });

  let assigned = parts.reduce((sum, part) => sum + part.value, 0);
  let missing = total - assigned;

  parts
    .slice()
    .sort((a, b) => b.remainder - a.remainder)
    .forEach(part => {
      if (missing <= 0) return;
      part.value += 1;
      missing -= 1;
    });

  return Object.fromEntries(
    DAMAGE_SOURCE_KEYS.map(key => [
      key,
      parts.find(part => part.key === key)?.value || 0,
    ])
  );
}

export function reduceCriticalSupplement(damage, normalDamage, reductionPercent) {
  const base = Math.max(0, Math.min(damage, Number(normalDamage) || 0));
  const supplement = Math.max(0, damage - base);
  return Math.max(base, Math.round(base + supplement * (1 - Math.max(0, Math.min(100, reductionPercent)) / 100)));
}

export function resolveCriticalDamage(totalDamage, chance, bonusPercent, roll) {
  const isCritical = chance > 0 && roll < chance;
  const baseDamage = Number(totalDamage) || 0;
  const scaled = baseDamage * (1 + bonusPercent / 100);
  return { isCritical, finalDamage: isCritical
    ? Math.round(scaled + Number.EPSILON * Math.max(1, scaled) * 4) : baseDamage };
}

export function calculateDamageComposition({ attack: atk, natureRules, flags, physicalDamageBase, magicalDamageBase,
  piercingDamageBase, physicalBase, magicalBase, agility, transpiercingBonus, hypercognitionBonus,
  powerRatios, resonance, inertRatioReductionPercent }) {
  const nature = natureRules.natures;
  let physBase = physicalBase, magiBase = magicalBase;
  if (resonance.bonus > 0) {
    physBase += resonance.bonus * natureRules.profile.red / natureRules.profile.total;
    magiBase += resonance.bonus * natureRules.profile.blue / natureRules.profile.total;
  }

  const isPureTranspiercing = flags.isTranspiercing;

  const rawBase = piercingDamageBase;

  const ratioMultiplier = natureRules.isInert
    ? 1 - inertRatioReductionPercent / 100
    : 1;
  const physRatio = powerRatios.physical * ratioMultiplier;
  const magiRatio = powerRatios.magical * ratioMultiplier;
  const pierceRatio = powerRatios.piercing * ratioMultiplier;


  let totalDamageSources = {
    piercingDamage: 0,
    physical: 0,
    magical: 0,
    hybridalDamage: 0,
  };

  const details = {
    nature: natureRules,
    resonance,
    declaredNatures: Array.isArray(atk.attacknature)
      ? [...atk.attacknature]
      : [atk.attacknature].filter(Boolean),
    effectiveNatures: nature,
    flags,
    ratios: {
      physicalRatio: physRatio,
      magicalRatio: magiRatio,
      piercingRatio: pierceRatio,
    },
    physical: {
      active: false,
      stat: physicalDamageBase,
      base: physBase,
      intensifier: Math.max(0, physBase - physicalDamageBase),
      physicalRatio: physRatio,
      total: 0,
    },
    magical: {
      active: false,
      stat: magicalDamageBase,
      base: magiBase,
      intensifier: Math.max(0, magiBase - magicalDamageBase),
      magicalRatio: magiRatio,
      total: 0,
    },
    piercing: {
      active: false,
      stat: piercingDamageBase,
      isPureTranspiercing,
      agility: agility,
      agilityRatio: isPureTranspiercing
        ? natureRules.agilityDamageRatio
        : 0,
      agilityBonus: isPureTranspiercing ? transpiercingBonus : 0,
      piercingRatio: pierceRatio,
      total: 0,
    },
    hybridal: {
      active: false,
      physicalPart: 0,
      magicalPart: 0,
      total: 0,
      magicalStatTotal: 0,
      roundingNote: "",
    },
  };

  const physicalPower = physBase * physRatio;
  const magicalPower = magiBase * magiRatio;
  const piercingPower = rawBase * pierceRatio;
  const resonanceOnly = resonance.bonus > 0 && !physRatio && !magiRatio ? resonance.bonus : 0;
  // Flat contribution: never multiplied by a power ratio or allowed to change the output nature.

  const produced = Math.max(0, physicalPower + magicalPower + piercingPower + resonanceOnly + transpiercingBonus + hypercognitionBonus);

  details.physical.total = physicalPower;
  details.magical.total = magicalPower;
  details.piercing.total = piercingPower;
  details.powers = { physical: physBase, magical: magiBase, piercing: rawBase };
  details.powerSources = { physical: physicalPower, magical: magicalPower, piercing: piercingPower,
    resonance: resonanceOnly, transpiercing: transpiercingBonus, hypercognition: hypercognitionBonus };

  if (natureRules.profile.total || natureRules.isInert) {
    totalDamageSources = splitDamageByNature(natureRules, produced);
  } else if (nature.includes('hybridalDamage')) {
    totalDamageSources.hybridalDamage = produced;
  } else if (nature.includes('physicalDamage')) {
    totalDamageSources.physical = produced;
  } else if (nature.includes('magicalDamage')) {
    totalDamageSources.magical = produced;
  } else if (nature.includes('piercingDamage') || nature.includes('transpiercingDamage')) {
    totalDamageSources.piercingDamage = produced;
  }

  details.physical.active = totalDamageSources.physical > 0;
  details.magical.active = totalDamageSources.magical > 0;
  details.piercing.active = totalDamageSources.piercingDamage > 0;
  details.physical.total = totalDamageSources.physical;
  details.magical.total = totalDamageSources.magical;
  details.piercing.total = totalDamageSources.piercingDamage;
  details.hybridal.active = totalDamageSources.hybridalDamage > 0;
  details.hybridal.physicalPart = totalDamageSources.hybridalDamage / 2;
  details.hybridal.magicalPart = totalDamageSources.hybridalDamage / 2;
  details.hybridal.total = totalDamageSources.hybridalDamage;
  details.compositionRouted = natureRules.key === 'hybrid' || natureRules.colors.length > 1
    || (transpiercingBonus > 0 && piercingPower <= 0)
    || (physicalPower > 0 && !details.physical.active)
    || (magicalPower > 0 && !details.magical.active)
    || (piercingPower > 0 && !details.piercing.active);

  return { details, sources: totalDamageSources };
}
