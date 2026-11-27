import { animationProjectile, animationMelee, getMeleeFlightVisual } from "./animations.js";
import { normArr } from "../combat/attackResolution.js";
import { attackEffects } from '../data/attackEffects.js';

function getProjectileEffectClasses(attack = {}) {
  return normArr(attack?.effets)
    .map(effectName => attackEffects.find(effect => effect.effectName === effectName)?.effectProjectile)
    .flatMap(value => Array.isArray(value) ? value : [value])
    .map(value => String(value || "").trim())
    .filter(value => value && value !== "none");
}

// The combat scheduler supplies the impact promise. Rendering only observes it.
export async function presentAttackTransport(flight, impact, { duration, isRange, options, restored }) {
  const { attacker, target, attack } = flight;
  if (isRange) {
    // The visual follows the scheduled impact, never the other way round.
    void animationProjectile(attacker, target, () => impact, {
      id: flight.id, attackId: attack.attackId, attacknature: attack.attacknature,
      executionTime: duration, effectProjectileClasses: getProjectileEffectClasses(attack),
      isLaunchedUnderMysticism: Boolean(attack.isLaunchedUnderMysticism),
      aura: options.secondHit ? 'ambidextry' : undefined,
      flight, impactPromise: impact, restoredVisual: restored?.visual,
    }).catch(error => console.error('[ProjectileVisual]', error));
    return impact;
  }
  const controller = (restored && getMeleeFlightVisual(flight.id))
    || animationMelee(attacker, target, Boolean(options.secondHit), {
      duration, flightId: flight.id, attacknature: attack.attacknature,
    });
  const status = await impact;
  // Display completion must not delay the next gameplay phase.
  void controller?.resolveImpact?.(status === 'hit');
  return status;
}
