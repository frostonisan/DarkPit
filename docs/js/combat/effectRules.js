import { balanceData } from "../data/balanceData.js";

export const EFFECT_APPLICATION_MODES = Object.freeze({ cumul: 'Cumul', refresh: 'Rafraîchit', replace: 'Remplace' });
export const burnRules = () => balanceData.effectRules.burn;
export const effectProvenance = (attacker, attack, effect) => JSON.stringify([
  String(attacker.id), String(attack?.entityAttackId || attack?.attackKey || attack?.attackId || attack?.functionName || 'direct'),
  effect.effectName, effect.selfApplication === true,
]);
export const effectRuntimeKey = (target, effect) => `${target.id}:${effect.effectName}:${encodeURIComponent(effect.provenance)}`;

// A shared fire retains the origin of each contribution for quotas and damage attribution.
export function feedBurn(state, effect, attackerId, now, rules = burnRules()) {
  const source = state.sources[effect.provenance] ||= { attacker: attackerId, values: [] };
  source.sourceLabel = effect.sourceLabel; source.sourcePortrait = effect.sourcePortrait;
  source.capacity = Math.max(1, Math.floor(effect.effectStack));
  source.values = source.values.slice(0, source.capacity);
  const power = Math.max(0, effect.effectDot);
  if (source.values.length < source.capacity) source.values.push(power);
  else {
    const weakest = Math.min(...source.values);
    if (power > weakest) source.values[source.values.indexOf(weakest)] = power;
  }
  state.expiresAt = now + rules.maintenanceSeconds * 1000;
  state.decayReference = null;
}
export const burnPower = state => Object.values(state.sources).reduce((sum, source) => sum + source.values.reduce((a,b) => a+b, 0), 0);
export function burnExpiresAt(state) {
  const power = burnPower(state), keep = 1 - state.rules.lossPercent / 100;
  const threshold = (state.decayReference ?? power) * state.rules.extinctionPercent / 100;
  const cycles = power > 0 && keep > 0 && keep < 1
    ? Math.max(1, Math.floor(Math.log(threshold / power) / Math.log(keep)) + 1) : 1;
  return state.expiresAt + (cycles - 1) * state.rules.maintenanceSeconds * 1000;
}
export function decayBurn(state, rules = burnRules()) {
  state.decayReference ??= burnPower(state);
  for (const source of Object.values(state.sources)) source.values = source.values.map(value => value * (1 - rules.lossPercent / 100));
  state.expiresAt += rules.maintenanceSeconds * 1000;
  return burnPower(state) > 0 && burnPower(state) >= state.decayReference * rules.extinctionPercent / 100;
}
