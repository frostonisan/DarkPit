import { getAttackEffectDefinition, EFFECT_PARAMETER_SCHEMAS, resolveAttackEffects } from "../data/attackEffects.js";
import { getSafe } from "../entities/rules.js";
import { getProgressiveRatio, getUmbraThreshold } from "../entities/statSystem.js";
import { burnRules } from './effectRules.js';

// Values are evaluated once per application. Descriptions/admin use the same evaluator.
export function calculateEffectParameter(value, schema, source) {
  if (schema.choices) return Object.hasOwn(schema.choices, value)
    ? (typeof schema.default === 'number' ? Number(value) : value) : schema.default;
  const formula = value && typeof value === 'object' ? value : { flat: value };
  let result = Number(formula.flat);
  if (!Number.isFinite(result)) result = schema.default;
  for (const term of formula.ratios || []) {
    const raw = getSafe(source, term.stat, 0);
    const stat = Number(raw && typeof raw === 'object' ? raw.current ?? raw.value ?? 0 : raw) || 0;
    const coefficient = Number(term.coefficient);
    if (!Number.isFinite(coefficient)) continue;
    result += stat * coefficient * (term.curve === 'progressive' ? getProgressiveRatio(stat, term.stat, getUmbraThreshold(source)) : 1);
  }
  result = Math.max(schema.min ?? 0, Math.min(schema.max ?? Infinity, result));
  return schema.integer ? Math.round(result) : result;
}

export function evaluateAttackEffect(effect, source) {
  if (!effect) return null;
  const result = { ...effect };
  if (effect.effectName === 'brulure') {
    result.effectDuration = burnRules().maintenanceSeconds;
    result.effectTickInterval = burnRules().tickSeconds;
  }
  for (const [key, schema] of Object.entries(EFFECT_PARAMETER_SCHEMAS[effect.effectName] || {})) {
    result[key] = calculateEffectParameter(effect.parameterFormulas?.[key] ?? effect[key], schema, source);
  }
  if (effect.effectName === 'insolence') result.effectMaxInterval = Math.max(result.effectMinInterval, result.effectMaxInterval);
  if (effect.statKey) result.effectUnit = result.effectModifierMode === 'percent' ? '%' : 'points';
  return result;
}

export function previewAttackEffects(attack, source, self = false) {
  const resolved = resolveAttackEffects({ ...attack });
  return (self ? resolved.resolvedSelfEffects : resolved.resolvedEffects).map(effect => evaluateAttackEffect(effect, source));
}

export function defaultEffect(name, source) {
  return evaluateAttackEffect(getAttackEffectDefinition(name), source);
}
