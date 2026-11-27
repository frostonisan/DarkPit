// HP and armor-gate arithmetic. Callers supply resolved defenses and decide when to commit.
import { reduceCriticalSupplement } from './damageRules.js';

export function calculateHpDamage(hpBefore, damage, indestructibility = 0) {
  const pipelineOut = Number(damage) || 0;
  const afterInd = indestructibility > 0
    ? pipelineOut * Math.max(0, 1 - indestructibility / 100) : pipelineOut;
  const finalDamage = Math.max(0, Math.round(afterInd));
  const hpAfter = Math.max(0, hpBefore - finalDamage);
  return { hpBefore, hpAfter, pipelineOut, afterInd, finalDamage, hpLoss: hpBefore - hpAfter };
}

export function calculateHpHealing(current, max, amount) {
  const hpBefore = Number(current) || 0;
  const hpAfter = Math.min(hpBefore + Math.max(0, Number(amount) || 0), max);
  return { hpBefore, hpAfter, healedHP: Math.max(0, hpAfter - hpBefore) };
}

export function calculateFullHpRestoration(current, max) {
  const hpBefore = Number(current) || 0;
  const hpAfter = Number(max) || 0;
  return { hpBefore, hpAfter, healedHP: Math.max(0, hpAfter - hpBefore) };
}

export function calculateDamageAccounting({ hpBefore, hpAfter, armorBefore, armorAfter,
  finalDamage, damageBeforeCritical, indestructibility, critical, astrality }) {
  const damageApplied = hpBefore - hpAfter;
  const armorDamageApplied = Math.max(0, Math.round(armorBefore - (Number(armorAfter) || 0)));
  const baseHitWithoutCritical = Math.min(hpBefore, Math.max(0, Math.round(
    damageBeforeCritical * Math.max(0, 1 - indestructibility / 100))));
  const criticalBonusCredited = critical
    ? Math.max(0, damageApplied - Math.min(baseHitWithoutCritical, astrality ? hpBefore - 1 : hpBefore)) : 0;
  return { damageApplied, armorDamageApplied, damageCredited: damageApplied + armorDamageApplied,
    criticalBonusCredited, overkillDamage: finalDamage - damageApplied };
}

export function calculateArmorBypass(sources, flags) {
  const purePiercing = sources.piercingDamage > 0 && sources.physical <= 0
    && sources.magical <= 0 && sources.hybridalDamage <= 0;
  return purePiercing && flags.canBypassArmorGate ? sources.piercingDamage * flags.armorBypassPercent / 100 : 0;
}

const sum = sources => (sources.piercingDamage || 0) + (sources.physical || 0)
  + (sources.magical || 0) + (sources.hybridalDamage || 0);
const emptySources = () => ({ piercingDamage: 0, physical: 0, magical: 0, hybridalDamage: 0 });

export function calculateArmorGate(input, rawTotal, remainingDamage, bypass = 0) {
  let sources = { ...input };
  let beforeBypassExtraction;
  if (bypass > 0) {
    sources.piercingDamage = Math.max(0, (sources.piercingDamage || 0) - bypass);
    rawTotal = sum(sources);
    beforeBypassExtraction = { ...sources };
  }
  const attempted = rawTotal > 0;
  const ratio = attempted ? Math.max(0, Math.min(1, (remainingDamage || 0) / rawTotal)) : null;
  const before = attempted ? { ...sources } : null;
  if (!attempted || ratio <= 0) {
    sources = emptySources();
    rawTotal = 0;
  } else if (ratio < 1) {
    sources = Object.fromEntries(Object.keys(emptySources()).map(key => [key, Math.round((sources[key] || 0) * ratio)]));
    rawTotal = sum(sources);
  }
  const after = { ...sources };
  if (bypass > 0) {
    sources.piercingDamage = (sources.piercingDamage || 0) + bypass;
    rawTotal = sum(sources);
  }
  return { sources, rawTotal, attempted, ratio, before, after, beforeBypassExtraction };
}

export function calculateResilienceSources(input, percent, carry) {
  const factor = Math.max(0, 1 - percent / 100);
  const nextCarry = carry ? { ...carry } : undefined;
  const sources = Object.fromEntries(Object.entries(input).map(([key, value]) => {
    if (!value) return [key, 0];
    const exact = Math.round(value) * factor + (carry?.[key] || 0);
    const rounded = Math.round(exact);
    if (nextCarry) nextCarry[key] = exact - rounded;
    return [key, rounded];
  }));
  return { sources, carry: nextCarry, factor };
}

export function calculateEsoterismSources(input, percent, piercingPercent = 0) {
  const sources = { ...input };
  const factor = (100 - percent) / 100;
  if (piercingPercent > 0) sources.piercingDamage = Math.ceil((sources.piercingDamage || 0) * (100 - piercingPercent) / 100);
  sources.magical = Math.ceil((sources.magical || 0) * factor);
  const hybrid = sources.hybridalDamage || 0;
  if (hybrid > 0 && percent > 0) {
    const physicalHalf = hybrid / 2;
    sources.hybridalDamage = Math.round(physicalHalf + Math.ceil((hybrid - physicalHalf) * factor));
  }
  return sources;
}

export function calculateFragilitySources(input, percent) {
  const multiplier = 1 + percent / 100;
  return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, Math.round((value || 0) * multiplier)]));
}

// Counterfactual statistics replay: resolved sources and modifiers only, no rolls or effects.
export function calculateDefensiveHpTotal(reducedSources, modifiers = {}) {
  let sources = { ...reducedSources };
  if (modifiers.esoterism > 0 || modifiers.esoterismPiercing > 0) sources = calculateEsoterismSources(sources, modifiers.esoterism || 0, modifiers.esoterismPiercing || 0);
  if (modifiers.occultismFragility > 0) sources = calculateFragilitySources(sources, modifiers.occultismFragility);
  const normalDamage = sum(sources);
  let total = normalDamage;
  if (modifiers.critical) total = Math.round(total * (1 + (modifiers.criticalBonus || 0) / 100));
  if (modifiers.critical && modifiers.resilienceCrit > 0) total = reduceCriticalSupplement(total, normalDamage, modifiers.resilienceCrit);
  return Math.max(0, Math.round(total * Math.max(0, 1 - (modifiers.indestructibility || 0) / 100)));
}

export function finalizeHpDamage(outcome, hpAfter) {
  return { ...outcome, hpAfter, hpLoss: outcome.hpBefore - hpAfter };
}
