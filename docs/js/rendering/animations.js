import { screenEffectHost, screenEffectRect, ensureGameShell } from '../ui/viewport.js';
import { applyEnergyProjectile, colorMeleeTrail, attackTone, createMagicProjectileTrail } from './attackAppearance.js';
import { createProjectileTrail, removeProjectileTrail, updateMagicTrail, updatePhysicalTrail,
    scheduleProjectileFrame, cancelProjectileFrames, clearProjectileTrails } from './projectileTrails.js';
import { flushCombatDisplay } from "./displayBatch.js";
import { setProjectileTransform, setDecorativeStyle, readProjectileTargetRect, trackProjectileGeometry, invalidateProjectileGeometry, notifyTargetGeometryChanged, clearProjectileGeometry } from './projectileGeometry.js';
import { applyMovementDestabilisation, wakeFromMovement } from "../combat/effects.js";
import {
  setIntervalFrom, remainingCombatTimer, registerCombatState, removeCombatVisualAfter, setTimeout,
  clearTimeout, setInterval, clearInterval, requestAnimationFrame, cancelAnimationFrame, clockNow,
} from "../combat/clock.js";
import { playCachedGif, cachedResourceUrl } from "../data/loaderList.js";
import { QuitCurrentLevel } from "../app/stages.js";
import { getSafe, getBattleEntityDomPrefix, getBattleEntityElement } from "../entities/rules.js";
import { getAttackResolutionFlags } from "../combat/attackResolution.js";
import { buildStatGraphHelper } from "../data/helpers.js";

const originalImages = new WeakMap();
const canvasRuns = new Map();
let canvasRunSequence = 0;
function beginCanvasRun(name, entityId, options, saved) {
  const record = { key: saved?.key || ++canvasRunSequence, name, entityId, options,
    nextAt: saved?.nextAt, capture: null };
  canvasRunSequence = Math.max(canvasRunSequence, record.key);
  canvasRuns.set(record.key, record); return record;
}
function finishCanvasRun(record) { canvasRuns.delete(record.key); }
const targetSearchPulseTimers = new Map();

function getTargetSearchIndicator(entite) {
  const container = document.getElementById(`effectsContainer_${entite?.id}`);
  if (!container || !entite?.id) return null;

  let indicator = document.getElementById(`targetSearchIndicator_${entite.id}`);
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = `targetSearchIndicator_${entite.id}`;
    indicator.className = 'target-search-indicator';
    indicator.setAttribute('aria-hidden', 'true');
    container.appendChild(indicator);
  }
  return indicator;
}

export function setTargetSearchVisual(entite, state = 'clear') {
  const box = document.getElementById(`Box_Entite_${entite?.id}`);
  box?.classList.toggle('entity-target-searching', state === 'searching');
  box?.classList.toggle('entity-target-search-failed', state === 'failed');
  box?.classList.toggle('entity-cooldown-waiting', state === 'cooldown');

  if (state === 'clear') {
    const id = String(entite?.id ?? '');
    for (const prefix of ['atbFill_', 'HUATBfill_', 'scanATBFill_']) {
      document.getElementById(prefix + id)?.classList.remove('cooldown-wait-pulse');
    }
    document.getElementById(`targetSearchIndicator_${entite?.id}`)?.remove();
    return;
  }

  const indicator = getTargetSearchIndicator(entite);
  if (!indicator) return;
  indicator.className = `target-search-indicator target-search-indicator--${state}`;
}

export function pulseTargetSearchAtb(entite, mode = 'search') {
  const id = String(entite?.id ?? '');
  if (!id) return;
  clearTimeout(targetSearchPulseTimers.get(id));

  const bars = [
    document.getElementById(`atbFill_${id}`),
    document.getElementById(`HUATBfill_${id}`),
    document.getElementById(`scanATBFill_${id}`),
  ].filter(Boolean);

  bars.forEach(bar => flushCombatDisplay(bar));
  const restarting = bars.some(bar => bar.classList.contains('target-search-pulse')
    || bar.classList.contains('cooldown-wait-pulse'));
  bars.forEach(bar => bar.classList.remove('target-search-pulse', 'cooldown-wait-pulse'));
  // A new pulse needs no layout read. Only an existing animation must restart.
  if (restarting) void bars[0].offsetWidth;
  bars.forEach(bar => bar.classList.add(mode === 'cooldown' ? 'cooldown-wait-pulse' : 'target-search-pulse'));

  targetSearchPulseTimers.set(id, setTimeout(() => {
    bars.forEach(bar => bar.classList.remove('target-search-pulse', 'cooldown-wait-pulse'));
    targetSearchPulseTimers.delete(id);
  }, 460));
}

const ENTITY_TINTS = {
	
  indestructibility: {
    color: "255, 120, 0",
    priority: 98,
  },
movementImpossible: {
  color: "255, 0, 0",
  priority: 97,
},
  brokenMagicImpact: {
    color: "162, 0, 255",
    priority: 92,
  },
    mysticismBoostedAttack: {
    color: "210, 245, 255",
    priority: 91,
  },
  damageImpact: {
    color: "255, 0, 0",
    priority: 90,
  },

  armorImpact: {
    color: "79, 112, 179",
    priority: 80,
  },
bloodCrazy: {
  color: "20, 0, 0",
  priority: 79,
},
  ambidextry: {
    color: "237, 255, 0",
    priority: 70,
  },

  astrality: {
    color: "192, 212, 255",
    priority: 65,
  },

  esoterism: {
    color: "255, 184, 227",
    priority: 60,
  },

  mysticism: {
    color: "79, 112, 179",
    priority: 55,
  },
occultism: {
    color: "120, 120, 120",
    priority: 54,
  },
armorActive: {
    color: "70, 165, 225",
    priority: 51,
  },
  order: {
    color: "255, 255, 255",
    priority: 50,
  },
};

const activeEntityTints = new WeakMap();
const activeSnapshotDamageImpacts = new WeakMap();
const damageImpacts = new WeakMap();
const impactPoses = new WeakMap();
const impactShakes = new WeakMap();
const brokenMagicImpacts = new WeakMap();

// Concurrent hit effects share the pose from BEFORE the first hit. A later hit
// must never save another shake's temporary rotation as its resting position.
function acquireImpactPose(node, saved = {}) {
    if (!node) return null;
    let pose = impactPoses.get(node);
    if (!pose) {
        pose = {
            previousTransform: saved.previousTransform ?? node.style.transform,
            previousTop: saved.previousTop ?? node.style.top,
            previousTransition: saved.previousTransition ?? node.style.transition,
            previousWillChange: saved.previousWillChange ?? node.style.willChange,
            users: 0,
        };
        impactPoses.set(node, pose);
    }
    pose.users++;
    return pose;
}

function releaseImpactPose(node, pose) {
    if (!pose || impactPoses.get(node) !== pose || --pose.users > 0) return;
    node.style.transform = pose.previousTransform;
    node.style.top = pose.previousTop;
    node.style.transition = pose.previousTransition;
    node.style.willChange = pose.previousWillChange;
    impactPoses.delete(node);
}

function trackImpactVibration(node, animation) {
    node._damageImpactVibration = animation;
    const release = () => {
        if (node._damageImpactVibration === animation) node._damageImpactVibration = null;
    };
    animation.addEventListener('finish', release, { once: true });
    animation.addEventListener('cancel', release, { once: true });
    return animation;
}
const activeMeleeAnimations = new Map();
const meleeOriginalVisibilityLocks = new Map();
const meleeOriginalRecoveryAnimations = new Map();
const meleePostRecoveryOpacityLocks = new WeakMap();
let meleeAnimationSequence = 0;
let projectileCleanupToken = 0;
const meleeTrailPool = [];
const MELEE_ORIGINAL_RECOVERY_DURATION = 750;

// Courbes position/temps dérivées de vitesses continues. La deuxième colonne
// garde un freinage léger sur les trajets compacts ; la troisième accentue le
// freinage étalé autour du milieu des longues courses. Toutes deux repartent
// progressivement puis accélèrent franchement devant la cible.
const MELEE_CHARGE_MOTION_SAMPLES = Object.freeze([
  [0, 0, 0],
  [0.05, 0.023797, 0.017481],
  [0.1, 0.060922, 0.058322],
  [0.14, 0.099669, 0.102149],
  [0.18, 0.140731, 0.15005],
  [0.22, 0.184792, 0.205236],
  [0.26, 0.232496, 0.266422],
  [0.3, 0.281972, 0.328192],
  [0.35, 0.342381, 0.399708],
  [0.4, 0.398548, 0.460376],
  [0.45, 0.448985, 0.50814],
  [0.5, 0.493558, 0.543882],
  [0.58, 0.556219, 0.58666],
  [0.64, 0.602674, 0.620625],
  [0.7, 0.654361, 0.662176],
  [0.76, 0.710258, 0.708024],
  [0.82, 0.770339, 0.76094],
  [0.86, 0.814521, 0.800643],
  [0.9, 0.860582, 0.84338],
  [0.94, 0.910952, 0.896916],
  [0.97, 0.953829, 0.945895],
  [1, 1, 1],
]);

function interpolateMeleeMotionValue(offset, stops) {
  if (!stops.length || offset <= stops[0][0]) return stops[0]?.[1] ?? 0;

  for (let index = 1; index < stops.length; index += 1) {
    const [nextOffset, nextValue] = stops[index];
    if (offset > nextOffset) continue;

    const [previousOffset, previousValue] = stops[index - 1];
    const span = nextOffset - previousOffset;
    const ratio = span > 0 ? (offset - previousOffset) / span : 1;
    return previousValue + (nextValue - previousValue) * ratio;
  }

  return stops[stops.length - 1][1];
}

const DEFAULT_SPEED_TRAIL_FILAMENTS = Object.freeze([
  { top: "14%", right: "3%", width: "74%", height: "1px", opacity: "0.72" },
  { top: "48%", right: "0", width: "100%", height: "2px", opacity: "0.95" },
  { top: "78%", right: "9%", width: "61%", height: "1px", opacity: "0.58" },
]);

function configureSpeedTrail(trail, options = {}) {
  const {
    className = "melee-motion-trail",
    style = {},
    filamentSpecs = DEFAULT_SPEED_TRAIL_FILAMENTS,
  } = options;

  trail.className = className;
  trail.setAttribute("aria-hidden", "true");
  Object.assign(trail.style, {
    position: "absolute",
    zIndex: "9998",
    pointerEvents: "none",
    borderRadius: "50% 20% 20% 50%",
    background: "linear-gradient(90deg, rgba(255, 245, 190, 0) 0%, rgba(255, 240, 175, 0.12) 34%, rgba(255, 246, 205, 0.52) 78%, rgba(255, 255, 235, 0.78) 100%)",
    transformOrigin: "right center",
    overflow: "visible",
    opacity: "0",
    willChange: "transform, opacity",
    ...style,
  });

  if (!trail._filaments) {
    trail._filaments = filamentSpecs.map(spec => {
      const filament = document.createElement("i");
      Object.assign(filament.style, {
        position: "absolute",
        display: "block",
        top: spec.top,
        right: spec.right,
        width: spec.width,
        height: spec.height,
        borderRadius: "999px",
        background: "linear-gradient(90deg, rgba(255, 240, 170, 0) 0%, rgba(255, 244, 195, 0.54) 68%, rgba(255, 255, 238, 1) 100%)",
        opacity: spec.opacity,
        pointerEvents: "none",
      });
      trail.appendChild(filament);
      return filament;
    });
  }

  return trail;
}

export function createSpeedTrail(parent = null, options = {}) {
  const trail = configureSpeedTrail(document.createElement("div"), options);

  if (parent?.appendChild) {
    parent.appendChild(trail);
  }

  return trail;
}

function acquireMeleeTrail(parent) {
  const pooledTrail = meleeTrailPool.pop();
  const trail = pooledTrail
    ? configureSpeedTrail(pooledTrail)
    : createSpeedTrail();

  parent.appendChild(trail);
  return trail;
}

function releaseMeleeTrail(trail, animationsCancelled = false) {
  if (!trail) return;
  if (!animationsCancelled) trail.getAnimations().forEach(animation => animation.cancel());
  trail.classList.remove("ambidextry-melee-trail");
  trail.style.boxShadow = "";
  trail.style.filter = "";
  trail.remove();
  if (meleeTrailPool.length < 12) meleeTrailPool.push(trail);
}

function acquireMeleeImpactFx(parent) {
  const layer = document.createElement("div");
  layer.className = "melee-impact-fx";
  Object.assign(layer.style, {
    position: "absolute",
    width: "0",
    height: "0",
    zIndex: "10001",
    pointerEvents: "none",
  });

  const ring = document.createElement("div");
  ring.className = "melee-impact-ring";
  Object.assign(ring.style, {
    position: "absolute",
    left: "-26px",
    top: "-26px",
    width: "52px",
    height: "52px",
    border: "4px solid rgba(255, 238, 155, 1)",
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(255, 250, 205, 0.55) 0%, rgba(255, 224, 120, 0.18) 42%, rgba(255, 224, 120, 0) 70%)",
    opacity: "0",
    willChange: "transform, opacity",
  });
  layer.appendChild(ring);

  const particles = [];
  for (let index = 0; index < 6; index += 1) {
    const particle = document.createElement("i");
    Object.assign(particle.style, {
      position: "absolute",
      left: "-4px",
      top: "-2px",
      width: "8px",
      height: "5px",
      borderRadius: "2px",
      background: "rgba(255, 248, 200, 1)",
      opacity: "0",
      willChange: "transform, opacity",
    });
    layer.appendChild(particle);
    particles.push(particle);
  }

  layer._ring = ring;
  layer._particles = particles;
  layer._animations = [];
  layer.style.display = "block";
  parent.appendChild(layer);
  return layer;
}

function releaseMeleeImpactFx(layer) {
  if (!layer) return;
  layer._animations?.splice(0).forEach(animation => animation.cancel());
  layer.remove();
}

function playMeleeImpactFx(parent, targetElement, x, y, unitX, unitY, duration, elapsed = 0) {
  const layer = acquireMeleeImpactFx(parent);
  layer.style.left = `${x}px`;
  layer.style.top = `${y}px`;

  const animations = layer._animations;
  animations.push(layer._ring.animate(
    [
      { opacity: 1, transform: "scale(0.12)" },
      { opacity: 0.92, transform: "scale(0.48)", offset: 0.16 },
      { opacity: 0, transform: "scale(2.8)" },
    ],
    { duration: duration * 0.92, easing: "cubic-bezier(0.1, 0.6, 0.2, 1)" }
  ));

  const baseAngle = Math.atan2(unitY, unitX);
  layer._particles.forEach((particle, index) => {
    const spread = -1.15 + (index / (layer._particles.length - 1)) * 2.3;
    const angle = baseAngle + spread;
    const distance = 34 + (index % 3) * 12;
    const particleX = Math.cos(angle) * distance;
    const particleY = Math.sin(angle) * distance;

    animations.push(particle.animate(
      [
        { opacity: 1, transform: "translate3d(0, 0, 0) rotate(0deg)" },
        { opacity: 0.92, offset: 0.48 },
        {
          opacity: 0,
          transform: `translate3d(${particleX}px, ${particleY}px, 0) rotate(${150 + index * 37}deg)`,
        },
      ],
      {
        duration: duration * (0.96 + (index % 2) * 0.12),
        easing: "cubic-bezier(0.1, 0.55, 0.25, 1)",
      }
    ));
  });

  if (targetElement?.animate) {
    targetElement._damageImpactVibration?.cancel();
    const computedTransform = getComputedStyle(targetElement).transform;
    const baseTransform = computedTransform === "none" ? "" : computedTransform;
    const shakeX = Math.max(3, Math.abs(unitX) * 8);
    const shakeY = Math.max(2, Math.abs(unitY) * 5);
    const transformAt = (xOffset, yOffset) =>
      `${baseTransform} translate3d(${xOffset}px, ${yOffset}px, 0)`.trim();

    animations.push(trackImpactVibration(targetElement, targetElement.animate(
      [
        { transform: transformAt(0, 0) },
        { transform: transformAt(unitX * shakeX, unitY * shakeY), offset: 0.12 },
        { transform: transformAt(-unitX * shakeX * 0.8, -unitY * shakeY * 0.8), offset: 0.34 },
        { transform: transformAt(unitX * shakeX * 0.5, unitY * shakeY * 0.5), offset: 0.58 },
        { transform: transformAt(-unitX * shakeX * 0.2, -unitY * shakeY * 0.2), offset: 0.78 },
        { transform: transformAt(0, 0) },
      ],
      { duration: duration * 0.86, easing: "ease-out" }
    )));
  }

  // A congested frame must not restart an already elapsed portion of the hit.
  if (elapsed > 0) animations.forEach(animation => { animation.currentTime = elapsed; });
  return layer;
}

function registerActiveMeleeAnimation(attackerId, controller) {
  const key = String(attackerId);
  let controllers = activeMeleeAnimations.get(key);
  if (!controllers) {
    controllers = new Set();
    activeMeleeAnimations.set(key, controllers);
  }
  controllers.add(controller);
}

function unregisterActiveMeleeAnimation(attackerId, controller) {
  const key = String(attackerId);
  const controllers = activeMeleeAnimations.get(key);
  if (!controllers) return;

  controllers.delete(controller);
  if (controllers.size === 0) activeMeleeAnimations.delete(key);
}

function cancelActiveMeleeAnimations(attackerId) {
  const controllers = activeMeleeAnimations.get(String(attackerId));
  if (!controllers) return;
  [...controllers].forEach(controller => controller?.cancel?.());
}

function lockMeleePostRecoveryOpacity(attackerId, sprite) {
  const key = String(attackerId);
  const currentSprite = document.getElementById(`DragSprite_${key}`)
    || sprite
    || null;
  if (!currentSprite?.isConnected) return false;

  if (!meleePostRecoveryOpacityLocks.has(currentSprite)) {
    meleePostRecoveryOpacityLocks.set(currentSprite, {
      value: currentSprite.style.getPropertyValue("opacity"),
      priority: currentSprite.style.getPropertyPriority("opacity"),
    });
  }

  // Important volontairement : les animations CSS de .iddle ne doivent plus
  // pouvoir reprendre opacity après le retour CAC 0 -> 1.
  currentSprite.style.setProperty("opacity", "1", "important");
  return true;
}

function unlockMeleePostRecoveryOpacity(attackerId, sprite) {
  const key = String(attackerId);
  const currentSprite = document.getElementById(`DragSprite_${key}`)
    || sprite
    || null;
  if (!currentSprite) return false;

  const previous = meleePostRecoveryOpacityLocks.get(currentSprite);
  if (!previous) return false;

  meleePostRecoveryOpacityLocks.delete(currentSprite);
  if (previous.value) {
    currentSprite.style.setProperty("opacity", previous.value, previous.priority || "");
  } else {
    currentSprite.style.removeProperty("opacity");
  }
  return true;
}

function isMeleePostRecoveryOpacityLocked(sprite) {
  return Boolean(sprite && meleePostRecoveryOpacityLocks.has(sprite));
}

function cancelMeleeOriginalRecovery(attackerId, forceVisible = false) {
  const key = String(attackerId);
  const recovery = meleeOriginalRecoveryAnimations.get(key);

  if (recovery) {
    meleeOriginalRecoveryAnimations.delete(key);
    recovery.cancelled = true;
    if (recovery.rafId && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(recovery.rafId);
    }
    clearTimeout(recovery.timeoutId);
    recovery.deathObserver?.disconnect();

    const recoverySprite = document.getElementById(`DragSprite_${key}`)
      || recovery.sprite
      || null;
    if (recoverySprite?.isConnected) {
      if (recovery.previousTransition) {
        recoverySprite.style.setProperty(
          "transition",
          recovery.previousTransition,
          recovery.previousTransitionPriority || ""
        );
      } else {
        recoverySprite.style.removeProperty("transition");
      }
    }
  }

  if (forceVisible) {
    const currentSprite = document.getElementById(`DragSprite_${key}`)
      || recovery?.sprite
      || null;
    if (currentSprite?.isConnected) {
      // Pas de transition CSS parasite : la visibilité forcée est instantanée.
      currentSprite.style.setProperty("opacity", "1", "important");
    }
  }

  return Boolean(recovery);
}

function startMeleeOriginalRecovery(
  attackerId,
  sprite,
  duration = MELEE_ORIGINAL_RECOVERY_DURATION,
  saved = null
) {
  const key = String(attackerId);
  cancelMeleeOriginalRecovery(key);

  const initialSprite = document.getElementById(`DragSprite_${key}`)
    || sprite
    || null;
  if (!initialSprite?.isConnected) return false;

  const safeDuration = Math.max(
    1,
    Number(duration) || MELEE_ORIGINAL_RECOVERY_DURATION
  );

  // IMPORTANT : on n'utilise volontairement NI transition CSS NI WAAPI pour
  // l'opacité du retour CAC. Sinon, à la fin d'un fill/cancel, le CSS peut
  // reprendre la main et rejouer un second 0 -> 1.
  const previousTransition = initialSprite.style.getPropertyValue("transition");
  const previousTransitionPriority = initialSprite.style.getPropertyPriority("transition");
  initialSprite.style.setProperty("transition", "none", "important");
  if (!saved) initialSprite.style.setProperty("opacity", "0", "important");

  const recovery = {
    cancelled: false,
    deathObserver: null,
    rafId: 0,
    sprite: initialSprite,
    startTime: saved?.startTime ?? null, duration: safeDuration,
    timeoutId: null,
    previousTransition: saved?.previousTransition ?? previousTransition,
    previousTransitionPriority: saved?.previousTransitionPriority ?? previousTransitionPriority,
  };

  const getSprite = () => document.getElementById(`DragSprite_${key}`)
    || (initialSprite.isConnected ? initialSprite : null);

  const restoreTransition = (currentSprite) => {
    if (!currentSprite?.isConnected) return;
    if (recovery.previousTransition) {
      currentSprite.style.setProperty(
        "transition",
        recovery.previousTransition,
        recovery.previousTransitionPriority || ""
      );
    } else {
      currentSprite.style.removeProperty("transition");
    }
  };

  const finishRecovery = () => {
    if (recovery.cancelled) return;
    if (meleeOriginalRecoveryAnimations.get(key) !== recovery) return;

    meleeOriginalRecoveryAnimations.delete(key);
    recovery.cancelled = true;
    if (recovery.rafId && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(recovery.rafId);
      recovery.rafId = 0;
    }
    clearTimeout(recovery.timeoutId);
    recovery.deathObserver?.disconnect();

    const finalSprite = getSprite();
    if (finalSprite?.isConnected) {
      // L'ordre est volontaire : 1 est verrouillé AVANT de rendre les
      // transitions/classes au sprite. Il ne peut donc pas repartir vers 0.
      finalSprite.style.setProperty("opacity", "1", "important");
      lockMeleePostRecoveryOpacity(key, finalSprite);
      restoreTransition(finalSprite);
      addIddle(finalSprite);
    }
  };

  const step = (timestamp) => {
    if (recovery.cancelled) return;
    if (meleeOriginalRecoveryAnimations.get(key) !== recovery) return;

    if (recovery.startTime === null) recovery.startTime = timestamp;
    const progress = Math.min(1, (timestamp - recovery.startTime) / safeDuration);
    // ease-out cubic : retour doux, mais UNE SEULE montée 0 -> 1.
    const eased = 1 - Math.pow(1 - progress, 3);
    const currentSprite = getSprite();

    if (currentSprite?.isConnected) {
      currentSprite.style.setProperty("transition", "none", "important");
      currentSprite.style.setProperty("opacity", eased.toFixed(4), "important");
    }

    if (progress >= 1) {
      finishRecovery();
      return;
    }

    recovery.rafId = requestAnimationFrame(step);
  };

  const attackerBox = document.getElementById(`Box_Entite_${key}`);
  if (attackerBox && typeof MutationObserver !== "undefined") {
    recovery.deathObserver = new MutationObserver(() => {
      if (attackerBox.dataset.dead !== "true") return;
      cancelMeleeOriginalRecovery(key, true);

      const deadSprite = document.getElementById(`DragSprite_${key}`);
      const deadCanvas = document.getElementById(`spriteCanvas_${key}`);
      for (const element of [deadSprite, deadCanvas]) {
        if (!element?.isConnected) continue;
        element.hidden = false;
        element.style.setProperty("opacity", "1", "important");
        element.style.visibility = "visible";
        if (element.style.display === "none") element.style.display = "";
      }
    });
    recovery.deathObserver.observe(attackerBox, {
      attributes: true,
      attributeFilter: ["data-dead"],
    });
  }

  meleeOriginalRecoveryAnimations.set(key, recovery);

  if (typeof requestAnimationFrame === "function") {
    recovery.rafId = requestAnimationFrame(step);
  } else {
    // Fallback ancien navigateur : pas de clignotement, retour direct à 1.
    initialSprite.style.setProperty("opacity", "1", "important");
    finishRecovery();
  }

  // Filet de sécurité uniquement : il termine le même cycle, il n'en démarre jamais un second.
  recovery.timeoutId = setTimeout(finishRecovery, Math.max(0, safeDuration + 120 - (saved?.startTime ? clockNow() - saved.startTime : 0)));
  return true;
}

function acquireMeleeOriginalVisibility(attackerId, sprite) {
  const key = String(attackerId);
  const recoveryWasActive = cancelMeleeOriginalRecovery(key);
  let state = meleeOriginalVisibilityLocks.get(key);
  if (!state) {
    state = {
      sprite,
      originalOpacity: recoveryWasActive ? "1" : sprite.style.opacity,
      locks: new Set(),
    };
    meleeOriginalVisibilityLocks.set(key, state);
  } else if (sprite?.isConnected) {
    state.sprite = sprite;
  }

  const token = Symbol(`melee-visibility-${key}`);
  state.locks.add(token);
  sprite.style.setProperty("opacity", "0", "important");
  return token;
}

function releaseMeleeOriginalVisibility(
  attackerId,
  token,
  forceVisible = false,
  deferRestore = false
) {
  const key = String(attackerId);
  if (forceVisible) cancelMeleeOriginalRecovery(key, true);
  const state = meleeOriginalVisibilityLocks.get(key);
  const currentSprite = document.getElementById(`DragSprite_${key}`)
    || state?.sprite
    || null;

  if (!state) {
    if (forceVisible && currentSprite?.isConnected) currentSprite.style.opacity = "1";
    return false;
  }

  if (forceVisible) state.locks.clear();
  else if (token) state.locks.delete(token);

  if (state.locks.size > 0) {
    if (currentSprite?.isConnected) currentSprite.style.setProperty("opacity", "0", "important");
    return true;
  }

  meleeOriginalVisibilityLocks.delete(key);
  if (currentSprite?.isConnected) {
    if (forceVisible) {
      currentSprite.style.setProperty("opacity", "1", "important");
    } else if (deferRestore) {
      currentSprite.style.setProperty("opacity", "0", "important");
    } else if (state.originalOpacity) {
      currentSprite.style.setProperty("opacity", state.originalOpacity, "");
    } else {
      currentSprite.style.removeProperty("opacity");
    }
  }
  return false;
}

function hasMeleeOriginalVisibilityLock(attackerId) {
  return (meleeOriginalVisibilityLocks.get(String(attackerId))?.locks.size || 0) > 0;
}

function showMeleeOriginalForImpact(targetId, duration) {
  const controllers = activeMeleeAnimations.get(String(targetId));
  if (!controllers) return false;

  const orderedControllers = [...controllers];
  for (let index = orderedControllers.length - 1; index >= 0; index -= 1) {
    if (orderedControllers[index]?.showOriginalForImpact?.(duration)) return true;
  }
  return false;
}

function createCanvasSnapshot(canvas) {
  const snapshot = document.createElement("canvas");
  snapshot.width = canvas.width;
  snapshot.height = canvas.height;
  const snapshotContext = snapshot.getContext("2d");
  if (!snapshotContext) return null;
  snapshotContext.drawImage(canvas, 0, 0, snapshot.width, snapshot.height);
  return snapshot;
}

function restoreCanvasSnapshot(canvas, context, snapshot) {
  if (!canvas || !context || !snapshot) return false;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(snapshot, 0, 0, canvas.width, canvas.height);
  return true;
}

function getNeutralMeleeCloneSource(canvas) {
  if (!canvas) return null;

  // Les impacts qui restaurent leur propre snapshot ne passent pas toujours
  // par le registre de teintes. Leur source neutre reste donc prioritaire.
  const activeDamageSnapshot = activeSnapshotDamageImpacts.get(canvas);
  return activeDamageSnapshot?.neutralSource
    || originalImages.get(canvas)
    || canvas;
}

function getCanvasTintStore(canvas) {
  if (!activeEntityTints.has(canvas)) {
    activeEntityTints.set(canvas, new Map());
  }

  return activeEntityTints.get(canvas);
}

function ensureOriginalCanvasImage(canvas) {
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    console.error(`❌ Impossible d'obtenir le contexte 2D pour canvas id: ${canvas.id}`);
    return null;
  }

  const cachedImage = originalImages.get(canvas);
  const canvasSizeChanged = cachedImage
    && (cachedImage.width !== canvas.width || cachedImage.height !== canvas.height);

  if (!cachedImage || canvasSizeChanged) {
    try {
      const snapshot = createCanvasSnapshot(canvas);
      if (!snapshot) return null;
      originalImages.set(canvas, snapshot);
    } catch (error) {
      console.warn(`⚠️ Snapshot du canvas impossible pour ${canvas.id}`, error);
      return null;
    }
    if (canvasSizeChanged) {
      activeEntityTints.delete(canvas);
    }
  }

  return ctx;
}

export function renderEntityTint(canvas) {
  const ctx = ensureOriginalCanvasImage(canvas);
  if (!ctx) return;

  const tintStore = activeEntityTints.get(canvas);

  restoreCanvasSnapshot(canvas, ctx, originalImages.get(canvas));

  if (!tintStore || tintStore.size === 0) {
    return;
  }

  let dominantTint = null;

  for (const tint of tintStore.values()) {
    if (
      !dominantTint ||
      tint.priority > dominantTint.priority ||
      (
        tint.priority === dominantTint.priority &&
        tint.updatedAt > dominantTint.updatedAt
      )
    ) {
      dominantTint = tint;
    }
  }

  if (!dominantTint) return;

  ctx.save();
  ctx.globalCompositeOperation = "source-atop";
  ctx.fillStyle = `rgba(${dominantTint.color}, ${dominantTint.opacity})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

export function applyEntityTint(canvas, tintName, opacity = 0.6) {
  if (!canvas) return;

  const tintConfig = ENTITY_TINTS[tintName];

  if (!tintConfig) {
    console.warn(`⚠️ Teinte inconnue : ${tintName}`);
    return;
  }

  const tintStore = getCanvasTintStore(canvas);

  tintStore.set(tintName, {
    name: tintName,
    color: tintConfig.color,
    priority: tintConfig.priority,
    opacity,
    updatedAt: clockNow(),
  });

  renderEntityTint(canvas);
}

export function releaseEntityTint(canvas, tintName) {
  if (!canvas) return;

  const tintStore = activeEntityTints.get(canvas);

  if (!tintStore) {
    renderEntityTint(canvas);
    return;
  }

  tintStore.delete(tintName);

  if (tintStore.size === 0) {
    activeEntityTints.delete(canvas);
  }

  renderEntityTint(canvas);
}

export function clearEntityTints(canvas) {
  if (!canvas) return;

  activeEntityTints.delete(canvas);
  renderEntityTint(canvas);
}

export function addIddle(sprite) {
    if (sprite && !sprite.classList.contains("iddle")) {
        sprite.classList.add("iddle");
    }
}

export function removeIddle(sprite) {
    if (sprite && sprite.classList.contains("iddle")) {
        sprite.classList.remove("iddle");
    }
}


// TEINTER CANVAS
export function entiteTinter(canvas, color, opacity = 0.6) {
  let ctx = canvas.getContext('2d');
  if (!ctx) {
    console.error(`❌ Impossible d'obtenir le contexte 2D pour canvas id: ${canvas.id}`);
    return;
  }

  if (originalImages.has(canvas)) {
    restoreCanvasSnapshot(canvas, ctx, originalImages.get(canvas));
  }

  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = `rgba(${color}, ${opacity})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

// 💥 Pulsation de teinte pour signaler un impact
export function damageImpact(targetId, options = {}, saved = null) {
  const visualRun = beginCanvasRun('damageImpact', targetId, options, saved);
  const {
    effectName = "blood-impact",
    src = null,
    className = "",
    lifetime = 800,
    offsetY = "10px",
    randomBloodImpact = true,
    preserveCanvasSnapshot = false,
    skipCanvasTint = false,
  } = options;

  const canvas = document.getElementById(`spriteCanvas_${targetId}`);
  if (!canvas) {
    finishCanvasRun(visualRun);
    console.warn(`⚠️ Canvas non trouvé pour targetId: ${targetId}`);
    return;
  }

  if (!saved) showMeleeOriginalForImpact(targetId, lifetime);

  const ctx = skipCanvasTint ? null : canvas.getContext("2d");
  if (!skipCanvasTint && !ctx) {
    finishCanvasRun(visualRun);
    console.error(`❌ Impossible d'obtenir le contexte 2D pour ${targetId}`);
    return;
  }

  if (!skipCanvasTint) damageImpacts.get(canvas)?.();

  let canvasSnapshot = null;
  if (!skipCanvasTint && preserveCanvasSnapshot) {
    activeSnapshotDamageImpacts.get(canvas)?.stop?.();
    try {
      canvasSnapshot = createCanvasSnapshot(canvas);
    } catch (error) {
      console.error("❌ Instantané du canvas impossible :", error);
    }
  }

  const effectsContainer = document.getElementById(`effectsContainer_${targetId}`);

  let finalSrc = src;
  let finalClassName = className;

  if (!saved && !finalSrc && randomBloodImpact) {
    const idx = Math.floor(Math.random() * 4) + 1;
    finalSrc = `./media/assets/effects/blood-impact-${idx}.gif`;
    finalClassName = `blood-impact fx-${idx}`;
  }

  if (!finalSrc) {
    finalSrc = `./media/assets/effects/${effectName}.gif`;
    finalClassName = finalClassName || effectName;
  }

  if (!saved) spawnEffectGif(effectsContainer, {
    className: finalClassName,
    src: finalSrc,
    lifetime,
    offsetY,
  });

  // Pour les cadavres, l'impact visuel reste entièrement dans le conteneur
  // d'effets : aucune lecture, teinte ou réécriture du canvas du sprite.
  if (skipCanvasTint) {
    finishCanvasRun(visualRun);
    const vibrationTarget = document.getElementById(`Animationsprite_${targetId}`)
      || canvas.parentElement;
    if (vibrationTarget?.animate) {
      vibrationTarget._damageImpactVibration?.cancel?.();
      const computedTransform = getComputedStyle(vibrationTarget).transform;
      const baseTransform = computedTransform === "none" ? "" : computedTransform;
      const transformAt = (offset) => `${baseTransform} translate3d(${offset}px, 0, 0)`.trim();
      const vibration = vibrationTarget.animate([
        { transform: transformAt(0) },
        { transform: transformAt(-3) },
        { transform: transformAt(3) },
        { transform: transformAt(-2) },
        { transform: transformAt(2) },
        { transform: transformAt(0) }
      ], {
        duration: 170,
        easing: "ease-out"
      });
      trackImpactVibration(vibrationTarget, vibration);
    }
    return;
  }

  const duration = 800;
  const maxOpacity = 0.6;
  let stopped = false;
  let snapshotController = null;
  let animationFrame = null;

  function restoreAndStop() {
    finishCanvasRun(visualRun);
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(animationFrame);
    if (damageImpacts.get(canvas) === restoreAndStop) damageImpacts.delete(canvas);
    if (canvasSnapshot) {
      restoreCanvasSnapshot(canvas, ctx, canvasSnapshot);
      if (activeSnapshotDamageImpacts.get(canvas) === snapshotController) {
        activeSnapshotDamageImpacts.delete(canvas);
      }
    } else {
      releaseEntityTint(canvas, "damageImpact");
    }
  }

  if (canvasSnapshot) {
    snapshotController = {
      stop: restoreAndStop,
      neutralSource: originalImages.get(canvas) || canvasSnapshot,
    };
    activeSnapshotDamageImpacts.set(canvas, snapshotController);
  }

  let start = saved?.state?.start;

  function animate(ts) {
    if (stopped) return;
    if (!document.body.contains(canvas)) return restoreAndStop();
    if (start === undefined) start = ts;

    const t = ts - start;
    const progress = Math.min(t / duration, 1);
    const opacity = Math.sin(progress * Math.PI) * maxOpacity;

    if (canvasSnapshot) {
      restoreCanvasSnapshot(canvas, ctx, canvasSnapshot);
      ctx.save();
      ctx.globalCompositeOperation = "source-atop";
      ctx.fillStyle = `rgba(255, 0, 0, ${opacity})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    } else {
      applyEntityTint(canvas, "damageImpact", opacity);
    }

    if (progress >= 1) return restoreAndStop();
    animationFrame = requestAnimationFrame(animate);
  }


  damageImpacts.set(canvas, restoreAndStop);
  visualRun.stop = restoreAndStop;
  visualRun.capture = () => ({ start });
  animationFrame = requestAnimationFrame(animate);
}
export function brokenMagicImpact(targetId, saved = null) {
  const visualRun = beginCanvasRun('brokenMagicImpact', targetId, null, saved);
  const canvas = document.getElementById(`spriteCanvas_${targetId}`);
  const spriteContainer = document.getElementById(`spriteContainer_${targetId}`);

  if (!canvas) {
    finishCanvasRun(visualRun);
    console.warn(`⚠️ Canvas non trouvé pour brokenMagicImpact targetId: ${targetId}`);
    return;
  }

  brokenMagicImpacts.get(canvas)?.();
  const pose = acquireImpactPose(spriteContainer, saved?.state);
  let animationFrame = null;

  if (!saved) showMeleeOriginalForImpact(targetId, 350);

  const duration = 350;
  const blinkInterval = 55;
  const maxOpacity = 0.85;

  let startTime = saved?.state?.startTime ?? (clockNow());
  let stopped = false;

  const previousTransform = pose?.previousTransform ?? "";
  const previousTransition = pose?.previousTransition ?? "";
  const previousWillChange = pose?.previousWillChange ?? "";

  if (spriteContainer) {
    spriteContainer.style.transition = "transform 0.08s ease-in-out";
    spriteContainer.style.willChange = "transform";
  }

  function restoreAndStop() {
    finishCanvasRun(visualRun);
    if (stopped) return;

    stopped = true;
    cancelAnimationFrame(animationFrame);
    if (brokenMagicImpacts.get(canvas) === restoreAndStop) brokenMagicImpacts.delete(canvas);

    releaseEntityTint(canvas, "brokenMagicImpact");

    releaseImpactPose(spriteContainer, pose);
  }

  function animate(ts) {
    if (stopped) return;

    if (
      spriteContainer?.closest('[data-dead="true"]') ||
      spriteContainer?.querySelector('.dead-sprite, canvas.dead')
    ) {
      restoreAndStop();
      return;
    }

    if (!document.body.contains(canvas)) {
      restoreAndStop();
      return;
    }

    const elapsed = ts - startTime;
    const progress = Math.min(elapsed / duration, 1);

    const blink = Math.sin((elapsed / blinkInterval) * Math.PI);
    const opacity = Math.abs(blink) * maxOpacity;

    applyEntityTint(canvas, "brokenMagicImpact", opacity);

if (spriteContainer) {
  const isSideB =
    spriteContainer.classList.contains("side-B") ||
    spriteContainer.classList.contains("B") ||
    spriteContainer.classList.contains("sideB");

  const rotateA = 0.08;
  const rotateB = 0;

  const rotationDirection = isSideB ? -1 : 1;

  const rotateValue =
    Math.sin(progress * Math.PI * 4) > 0
      ? rotateA * rotationDirection
      : rotateB;

  spriteContainer.style.transform = isSideB
    ? `rotate(${rotateValue}turn) scaleX(-1)`
    : `rotate(${rotateValue}turn)`;
}
    if (progress >= 1) {
      restoreAndStop();
      return;
    }

    animationFrame = requestAnimationFrame(animate);
  }


  brokenMagicImpacts.set(canvas, restoreAndStop);
  visualRun.stop = restoreAndStop;
  visualRun.capture = () => ({ startTime, previousTransform, previousTop: pose?.previousTop,
    previousTransition, previousWillChange });
  animationFrame = requestAnimationFrame(animate);
}
// Helper (inchangé sauf qu’on ne l’appelle plus à chaque frame)
function spawnEffectGif(container, { className, src, lifetime = 800, offsetY = null }) {
  if (!container) return;
  const selector = className.trim().split(/\s+/).map(name => `.${CSS.escape(name)}`).join('');
  let img = container.querySelector(selector);
  if (!img) {
    img = document.createElement("img");
    img.className = className;
      container.appendChild(img);
  }
  playCachedGif(img, `${src}`); // force le redémarrage du GIF
  

  img._armorImpactTO?.cancel?.();
  img._armorImpactTO = removeCombatVisualAfter(img, lifetime + 50);
}
export function mysticismBoostedAttackAnimation(attackerId, saved = null) {
  const visualRun = beginCanvasRun('mysticismBoostedAttackAnimation', attackerId, null, saved);
  const canvas = document.getElementById(`spriteCanvas_${attackerId}`);
  const sprite = document.getElementById(`DragSprite_${attackerId}`);

  if (!canvas) {
    console.warn(`⚠️ Canvas non trouvé pour mysticismBoostedAttackAnimation attackerId: ${attackerId}`);
    return;
  }

  const duration = 900;
  const pulses = 2;
  const maxOpacity = 0.55;
  const maxScale = 1.055;
  const maxRotation = 2.5;

  const previousCanvasTransform = saved?.state?.previousCanvasTransform ?? (canvas.style.transform || "");
  const previousCanvasFilter = saved?.state?.previousCanvasFilter ?? (canvas.style.filter || "");
  const previousCanvasTransition = saved?.state?.previousCanvasTransition ?? (canvas.style.transition || "");
  const previousCanvasWillChange = saved?.state?.previousCanvasWillChange ?? (canvas.style.willChange || "");

  const isSideB =
    sprite?.classList.contains("side-B") ||
    sprite?.classList.contains("B") ||
    sprite?.classList.contains("sideB");

  const direction = saved?.state?.direction ?? (isSideB ? -1 : 1);

  let startTime = saved?.state?.startTime ?? (clockNow());
  let stopped = false;

  canvas.style.transition = "none";
  canvas.style.willChange = "transform, filter";

  function restoreAndStop() {
    finishCanvasRun(visualRun);
    if (stopped) return;

    stopped = true;

    releaseEntityTint(canvas, "mysticismBoostedAttack");

    canvas.style.transform = previousCanvasTransform;
    canvas.style.filter = previousCanvasFilter;
    canvas.style.transition = previousCanvasTransition;
    canvas.style.willChange = previousCanvasWillChange;
  }

  function animate(now) {
    if (stopped) return;

    if (!document.body.contains(canvas)) {
      restoreAndStop();
      return;
    }

    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);

    const pulse = Math.abs(Math.sin(progress * Math.PI * pulses));
    const fade = 1 - progress;

    const opacity = pulse * maxOpacity * fade;
    const scale = 1 + pulse * (maxScale - 1);
    const rotation = Math.sin(progress * Math.PI * pulses * 2) * maxRotation * direction * fade;

    applyEntityTint(canvas, "mysticismBoostedAttack", opacity);

    canvas.style.transform = `
      ${previousCanvasTransform}
      scale(${scale.toFixed(3)})
      rotate(${rotation.toFixed(2)}deg)
    `;

    canvas.style.filter = `
      ${previousCanvasFilter}
      drop-shadow(0 0 ${6 + pulse * 10}px rgba(210, 245, 255, ${0.35 + opacity}))
      brightness(${1 + pulse * 0.35})
    `;

    if (progress >= 1) {
      restoreAndStop();
      return;
    }

    requestAnimationFrame(animate);
  }


  visualRun.capture = () => ({ previousCanvasTransform, previousCanvasFilter, previousCanvasTransition, previousCanvasWillChange, direction, startTime });
  requestAnimationFrame(animate);
}
// === Ta fonction existante, avec l’injection du GIF ===
export function damageArmorImpact(targetId, saved = null) {
  const visualRun = beginCanvasRun('damageArmorImpact', targetId, null, saved);
    const canvas = document.getElementById(`spriteCanvas_${targetId}`);
    if (!canvas) {
        console.warn(`⚠️ Canvas non trouvé pour targetId: ${targetId}`);
        return;
    }

    if (!saved) showMeleeOriginalForImpact(targetId, 800);

    const ctx = canvas.getContext("2d");
    if (!ctx) {
        console.error(`❌ Impossible d'obtenir le contexte 2D pour ${targetId}`);
        return;
    }

    const effectsContainer = document.getElementById(`effectsContainer_${targetId}`);
    if (!saved) spawnEffectGif(effectsContainer, {
        className: "armorImpactGif",
        src: "./media/assets/effects/armor-impact.gif",
        lifetime: 800,
    });

    if (!window.originalImages) window.originalImages = {};
    if (!originalImages.has(canvas)) {
        originalImages.set(canvas, createCanvasSnapshot(canvas));
    }

    let opacity = saved?.state?.opacity ?? (0);
    const fadeSpeed = 0.08;
    const duration = 800;
    const startTime = saved?.state?.startTime ?? (clockNow());
    let fadeIn = saved?.state?.fadeIn ?? (true);

    console.log(`⚔️ Début de l'animation Armor Impact sur ${targetId}`);

    canvas.style.transition = "transform 0.1s ease-in-out, filter 0.2s ease-in-out";

    let pulseUp = saved?.state?.pulseUp ?? (true);
    const pulseInterval = setIntervalFrom(() => {
        canvas.style.transform = pulseUp
            ? "scale(1.05) rotate(0.5deg)"
            : "scale(1) rotate(-0.5deg)";
        pulseUp = !pulseUp;
    }, 100, saved?.pulseRemaining);

    function stopArmorImpact() {
    finishCanvasRun(visualRun);
        clearInterval(pulseInterval);
        canvas.style.transform = "scale(1)";
        canvas.style.filter = "none";
        releaseEntityTint(canvas, "armorImpact");
        console.log(`✅ Fin de l'animation Armor Impact pour ${targetId}`);
    }

    function animate() {
        const elapsed = clockNow() - startTime;

        if (elapsed > duration) {
            stopArmorImpact();
            return;
        }

        // 💠 Teinte bleue avec hiérarchie
        applyEntityTint(canvas, "armorImpact", opacity);

        // ✨ Lueur argentée dynamique
        const glowIntensity = 0.5 + Math.sin(elapsed / 80) * 0.5;
        canvas.style.filter = `drop-shadow(0 0 ${6 * glowIntensity}px rgba(180, 200, 255, ${glowIntensity}))
                               brightness(${1 + glowIntensity * 0.3})`;

        if (fadeIn) {
            opacity += fadeSpeed;
            if (opacity >= 0.6) fadeIn = false;
        } else {
            opacity -= fadeSpeed;
            if (opacity <= 0) fadeIn = true;
        }

        requestAnimationFrame(animate);
    }


  visualRun.capture = () => ({ opacity, startTime, fadeIn, pulseUp });
  visualRun.pulseRemaining = () => remainingCombatTimer(pulseInterval);
    if (saved) requestAnimationFrame(animate);
    else animate();
}
export function animateAmbidextry(targetId, saved = null) {
  const visualRun = beginCanvasRun('animateAmbidextry', targetId, null, saved);
    const canvas = document.getElementById(`spriteCanvas_${targetId}`);
    if (!canvas) {
        console.warn(`⚠️ Canvas non trouvé pour targetId: ${targetId}`);
        return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
        console.error(`❌ Impossible d'obtenir le contexte 2D pour ${targetId}`);
        return;
    }

    // 🧩 Sauvegarde du sprite original
    if (!window.originalImages) window.originalImages = {};
    if (!originalImages.has(canvas)) {
        originalImages.set(canvas, createCanvasSnapshot(canvas));
    }

    let opacity = saved?.state?.opacity ?? (0);
    const fadeSpeed = 0.15;
    const blinkCount = 2;
    let completedBlinks = saved?.state?.completedBlinks ?? (0);
    let fadeIn = saved?.state?.fadeIn ?? (true);

    function stopAmbidextry() {
    finishCanvasRun(visualRun);
        releaseEntityTint(canvas, "ambidextry");
        canvas.style.filter = "none";
    }

    function animate() {
        if (completedBlinks >= blinkCount) {
            stopAmbidextry();
            return;
        }

        // 💛 Teinte jaune vif avec hiérarchie
        applyEntityTint(canvas, "ambidextry", opacity);

        // ✨ Lueur légère
        const glow = 0.3 + opacity * 0.7;
        canvas.style.filter = `drop-shadow(0 0 ${8 * glow}px rgba(237,255,0,${glow})) brightness(${1 + glow * 0.5})`;

        // 🔁 Gestion du fade
        if (fadeIn) {
            opacity += fadeSpeed;
            if (opacity >= 0.8) fadeIn = false;
        } else {
            opacity -= fadeSpeed;
            if (opacity <= 0) {
                fadeIn = true;
                completedBlinks++;
            }
        }

        requestAnimationFrame(animate);
    }


  visualRun.capture = () => ({ opacity, completedBlinks, fadeIn });
    if (saved) requestAnimationFrame(animate);
    else animate();
}
export function shakeImpact(targetId, saved = null) {
  const visualRun = beginCanvasRun('shakeImpact', targetId, null, saved);
    const spriteContainer = document.getElementById(`spriteContainer_${targetId}`);

    if (!spriteContainer) {
        finishCanvasRun(visualRun);
        console.warn(`⚠️ SpriteContainer non trouvé pour targetId: ${targetId}`);
        return;
    }

    impactShakes.get(spriteContainer)?.();
    const pose = acquireImpactPose(spriteContainer, saved?.state);
    let stopped = false, timer = null;

    const duration = 200;
    const startTime = saved?.state?.startTime ?? (clockNow());
    const intensity = 2;
    const jumpHeight = 2;

    const { previousTransform, previousTop, previousTransition, previousWillChange } = pose;

    const isSideB = !spriteContainer.classList.contains("A");

    let direction = saved?.state?.direction ?? (isSideB ? -1 : 1);
    let jumpDirection = saved?.state?.jumpDirection ?? (1);

    spriteContainer.style.willChange = "transform, top";

    function stopShakeImpact() {
        if (stopped) return;
        stopped = true;
        clearTimeout(timer);
    finishCanvasRun(visualRun);
        if (impactShakes.get(spriteContainer) === stopShakeImpact) impactShakes.delete(spriteContainer);
        releaseImpactPose(spriteContainer, pose);
    }

    function animate() {
        if (stopped) return;
        if (
            !spriteContainer.isConnected ||
            spriteContainer.closest('[data-dead="true"]') ||
            spriteContainer.querySelector('.dead-sprite, canvas.dead')
        ) {
            stopShakeImpact();
            return;
        }

        const elapsed = clockNow() - startTime;

        if (elapsed > duration) {
            stopShakeImpact();
            return;
        }

        const angle = direction * intensity;
        const jumpOffset = jumpDirection * jumpHeight;

        spriteContainer.style.transform = isSideB
            ? `rotate(${angle}deg) scaleX(-1)`
            : `rotate(${angle}deg)`;

        spriteContainer.style.top = `${jumpOffset}px`;

        direction *= -1;
        jumpDirection *= -1;

        const timeStep = Math.max(30, 80 - (elapsed / duration) * 50);

        visualRun.nextAt = clockNow() + timeStep;
        timer = setTimeout(animate, timeStep);
    }


  visualRun.capture = () => ({ startTime, previousTransform, previousTop, previousTransition, previousWillChange, direction, jumpDirection });
    impactShakes.set(spriteContainer, stopShakeImpact);
    visualRun.stop = stopShakeImpact;
    if (saved) timer = setTimeout(animate, Math.max(0, saved.nextAt - clockNow()));
    else animate();
}
// DEAD SPRITE ANIMATION
export function updateSpriteUI(entity) {
    if (!entity.isDEAD) return;

    const container = document.getElementById(`spriteContainer_${entity.id}`);
    if (!container) return;

    if (document.getElementById(`bloodEffect_${entity.id}`)) return;

    let effectsContainer = document.getElementById(`effectsContainer_${entity.id}`);

    if (!effectsContainer) {
        effectsContainer = document.createElement("div");
        effectsContainer.id = `effectsContainer_${entity.id}`;
        effectsContainer.className = "effects-container";
        container.appendChild(effectsContainer);
    }

    const bloodGif = document.createElement("img");
    playCachedGif(bloodGif, `./media/assets/effects/death-blood.gif`);
    bloodGif.className = "effect-vfx death-blood";
    bloodGif.id = `bloodEffect_${entity.id}`;

    effectsContainer.appendChild(bloodGif);

    setTimeout(() => {
        if (bloodGif && bloodGif.parentNode) {
            bloodGif.remove();
        }
    }, 1000);
}
// 💠 Fonction d'animation d'indestructibilité (pulsation orange)
export function animateIndestructibility(targetId, saved = null) {
  const visualRun = beginCanvasRun('animateIndestructibility', targetId, null, saved);
    const canvas = document.getElementById(`spriteCanvas_${targetId}`);
    if (!canvas) {
        console.warn(`⚠️ Canvas non trouvé pour targetId: ${targetId}`);
        return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
        console.error(`❌ Impossible d'obtenir le contexte 2D pour ${targetId}`);
        return;
    }

    if (!originalImages.has(canvas)) {
        originalImages.set(canvas, createCanvasSnapshot(canvas));
    }

    let opacity = saved?.state?.opacity ?? (0);
    const fadeSpeed = 0.08;
    const duration = 2000;
    const startTime = saved?.state?.startTime ?? (clockNow());
    let fadeIn = saved?.state?.fadeIn ?? (true);

    const previousTransform = saved?.state?.previousTransform ?? (canvas.style.transform);
    const previousTransition = saved?.state?.previousTransition ?? (canvas.style.transition);

    console.log(`🟠 Début de l'animation indestructibilité sur ${targetId}`);

    canvas.style.transition = "transform 0.15s ease-in-out";

    let pulseUp = saved?.state?.pulseUp ?? (true);

    const pulseInterval = setIntervalFrom(() => {
        canvas.style.transform = pulseUp ? "scale(1.06)" : "scale(1)";
        pulseUp = !pulseUp;
    }, 150, saved?.pulseRemaining);

    function stopIndestructibility() {
    finishCanvasRun(visualRun);
        clearInterval(pulseInterval);

        canvas.style.transform = previousTransform || "scale(1)";
        canvas.style.transition = previousTransition || "";

        releaseEntityTint(canvas, "indestructibility");

        console.log(`✅ Fin de l'animation indestructibilité pour ${targetId}`);
    }

    function animate() {
        const elapsed = clockNow() - startTime;

        if (elapsed > duration) {
            stopIndestructibility();
            return;
        }

        // 🔸 Teinte orange avec hiérarchie
        applyEntityTint(canvas, "indestructibility", opacity);

        if (fadeIn) {
            opacity += fadeSpeed;
            if (opacity >= 0.6) fadeIn = false;
        } else {
            opacity -= fadeSpeed;
            if (opacity <= 0) fadeIn = true;
        }

        requestAnimationFrame(animate);
    }


  visualRun.capture = () => ({ opacity, startTime, fadeIn, previousTransform, previousTransition, pulseUp });
  visualRun.pulseRemaining = () => remainingCombatTimer(pulseInterval);
    if (saved) requestAnimationFrame(animate);
    else animate();
}
export function animateEsoterism(targetId, saved = null) {
  const visualRun = beginCanvasRun('animateEsoterism', targetId, null, saved);
    const canvas = document.getElementById(`spriteCanvas_${targetId}`);
    if (!canvas) {
        console.warn(`⚠️ Canvas non trouvé pour targetId: ${targetId}`);
        return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
        console.error(`❌ Impossible d'obtenir le contexte 2D pour ${targetId}`);
        return;
    }

    if (!originalImages.has(canvas)) {
        originalImages.set(canvas, createCanvasSnapshot(canvas));
    }

    let opacity = saved?.state?.opacity ?? (0);
    const fadeSpeed = 0.05;
    const duration = 2200;
    const startTime = saved?.state?.startTime ?? (clockNow());
    let fadeIn = saved?.state?.fadeIn ?? (true);

    const previousTransform = saved?.state?.previousTransform ?? (canvas.style.transform);
    const previousTransition = saved?.state?.previousTransition ?? (canvas.style.transition);

    console.log(`🔮 Début de l'animation Ésotérisme sur ${targetId}`);

    canvas.style.transition = "transform 0.25s ease-in-out";

    let pulseUp = saved?.state?.pulseUp ?? (true);

    const pulseInterval = setIntervalFrom(() => {
        canvas.style.transform = pulseUp ? "scale(1.04)" : "scale(1)";
        pulseUp = !pulseUp;
    }, 250, saved?.pulseRemaining);

    function stopEsoterism() {
    finishCanvasRun(visualRun);
        clearInterval(pulseInterval);

        canvas.style.transform = previousTransform || "scale(1)";
        canvas.style.transition = previousTransition || "";

        releaseEntityTint(canvas, "esoterism");

        console.log(`✅ Fin de l'animation Ésotérisme pour ${targetId}`);
    }

    function animate() {
        const elapsed = clockNow() - startTime;

        if (elapsed > duration) {
            stopEsoterism();
            return;
        }

        // 🌸 Teinte rose douce avec hiérarchie
        applyEntityTint(canvas, "esoterism", opacity);

        if (fadeIn) {
            opacity += fadeSpeed;
            if (opacity >= 0.5) fadeIn = false;
        } else {
            opacity -= fadeSpeed;
            if (opacity <= 0) fadeIn = true;
        }

        requestAnimationFrame(animate);
    }


  visualRun.capture = () => ({ opacity, startTime, fadeIn, previousTransform, previousTransition, pulseUp });
  visualRun.pulseRemaining = () => remainingCombatTimer(pulseInterval);
    if (saved) requestAnimationFrame(animate);
    else animate();
}

export function animateAstrality(targetId, saved = null) {
  const visualRun = beginCanvasRun('animateAstrality', targetId, null, saved);
  const canvas = document.getElementById(`spriteCanvas_${targetId}`);

  if (!canvas) {
    console.warn(`⚠️ Canvas non trouvé pour targetId: ${targetId}`);
    return;
  }

  const ctx = canvas.getContext("2d");

  if (!ctx) {
    console.error(`❌ Impossible d'obtenir le contexte 2D pour ${targetId}`);
    return;
  }

  if (!originalImages.has(canvas)) {
    originalImages.set(canvas, createCanvasSnapshot(canvas));
  }

  const duration = 1500;
  const start = saved?.state?.start ?? (clockNow());

  const previousOpacity = saved?.state?.previousOpacity ?? (canvas.style.opacity);
  const previousWillChange = saved?.state?.previousWillChange ?? (canvas.style.willChange);

  canvas.style.opacity = "0.3";
  canvas.style.willChange = "opacity";

  console.log(`✨ Début animation Astralité sur ${targetId}`);

  const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);

  function stopAstrality() {
    finishCanvasRun(visualRun);
    releaseEntityTint(canvas, "astrality");

    canvas.style.opacity = previousOpacity || "1";
    canvas.style.willChange = previousWillChange || "";

    console.log(`✅ Fin animation Astralité pour ${targetId}`);
  }

  function frame(now) {
    const elapsed = now - start;
    const t = Math.min(1, elapsed / duration);

    const visualOpacity = 0.3 + 0.7 * easeOutCubic(t);

    applyEntityTint(canvas, "astrality", 0.45);

    canvas.style.opacity = visualOpacity.toFixed(3);

    if (t < 1) {
      requestAnimationFrame(frame);
      return;
    }

    stopAstrality();
  }


  visualRun.capture = () => ({ start, previousOpacity, previousWillChange });
  requestAnimationFrame(frame);
}

export function animateDodge(entityId, saved = null) {
    const visualRun = beginCanvasRun('animateDodge', entityId, {}, saved);
    const startedAt = saved?.state.startedAt ?? clockNow();
    const sprite = document.getElementById(`imgContainer_${entityId}`);
    if (!sprite) return;

    const isSideB = sprite.classList.contains("img-side-B");

    const previousTransition = saved?.state.previousTransition ?? sprite.style.transition;
    const previousPosition = saved?.state.previousPosition ?? sprite.style.position;
    const previousLeft = saved?.state.previousLeft ?? sprite.style.left;
    const previousRight = saved?.state.previousRight ?? sprite.style.right;
    const previousTransform = saved?.state.previousTransform ?? sprite.style.transform;

    visualRun.capture = () => ({ startedAt, previousTransition, previousPosition, previousLeft, previousRight, previousTransform });
    if (!saved) {
    sprite.style.transition = "left 0.1s ease-out, right 0.1s ease-out, transform 0.1s ease-out";
    sprite.style.position = "relative";

    if (isSideB) {
        sprite.style.right = "60px";
        sprite.style.left = "";
        sprite.style.transform = "rotate(10deg)";
    } else {
        sprite.style.left = "-60px";
        sprite.style.right = "";
        sprite.style.transform = "rotate(10deg)";
    }

    }
    const restoreStyle = () => {
        finishCanvasRun(visualRun);
        Object.assign(sprite.style, { transition: previousTransition, position: previousPosition, left: previousLeft, right: previousRight, transform: previousTransform });
    };
    if (saved && clockNow() >= startedAt + 100) {
        setTimeout(restoreStyle, Math.max(0, startedAt + 400 - clockNow()));
        return;
    }
    setTimeout(() => {
        sprite.style.transition = "left 0.3s ease-out, right 0.3s ease-out, transform 0.3s ease-out";

        if (isSideB) {
            sprite.style.right = previousRight || "0px";
            sprite.style.left = previousLeft || "";
        } else {
            sprite.style.left = previousLeft || "0px";
            sprite.style.right = previousRight || "";
        }

        sprite.style.transform = previousTransform || "rotate(0deg)";

        setTimeout(restoreStyle, 300);
    }, Math.max(0, startedAt + 100 - clockNow()));
}

// Production casting nodes own their base filter through --cast-filter-base.
// Editor/custom nodes still resolve their computed filter at the phase boundary.
const cssCastingFilters = new WeakSet();

export function getAttackCastingVisual(attack) {
  if (typeof attack.castingAsset === 'string' && attack.castingAsset.trim()) {
    return { asset: attack.castingAsset, className: '' };
  }
  const flags = getAttackResolutionFlags(attack);
  if (!flags.hasMagicalBehavior) {
    return { asset: './media/assets/effects/castingfx-base.gif', className: 'cast-default' };
  }
  const tone = attack.attackTarget?.includes('hexa') ? 'invocateur'
    : flags.hasHybridal || flags.hasPhysical || flags.hasPiercing ? 'hybrid'
    : attack.combatFunction === 'Support' ? 'support' : 'magical';
  return { asset: './media/assets/effects/magic-circle.png', className: `cast-default-circle cast-tone-${tone}` };
}

export function animatePreparation(entity, attack, forcedDuration = null) {
  // A preparation owns the transient pose. Stop an older loop before reading
  // the neutral transform so overlapping actions can never preserve a lean.
  entity.stopPreparationAnimation?.();
  const saved = entity._preparationVisual;

  const castContainer = document.getElementById(`Cast_Animation_${entity.id}`);

  if (!castContainer) {
    console.warn(`⚠️ Impossible de trouver #Cast_Animation_${entity.id}, l'animation ne sera pas affichée.`);
    return null;
  }

  const existingCast = document.getElementById(`cast_${entity.id}`);

  if (existingCast && !saved) {
    existingCast.remove();
  }

  const existingCastEffect = document.getElementById(`castEffect_${entity.id}`);

  if (existingCastEffect && !saved) {
    existingCastEffect.remove();
  }

  const castEffectDiv = saved && existingCastEffect || document.createElement("div");
  castEffectDiv.id = `castEffect_${entity.id}`;
  castEffectDiv.className = `cast-preparation-container ${attack.functionName} side-${entity.side}`;
  castContainer.appendChild(castEffectDiv);

  const castImg = saved && existingCast || document.createElement("img");
  castImg.id = `cast_${entity.id}`;
  const castingVisual = getAttackCastingVisual(attack);
  if (!saved) castImg.src = cachedResourceUrl(castingVisual.asset);
  castImg.className = `cast ${attack.functionName} ${castingVisual.className}`;
  cssCastingFilters.add(castImg);
  castEffectDiv.appendChild(castImg);

  const sprite = document.getElementById(`DragSprite_${entity.id}`);

  if (!sprite) {
    console.warn(`⚠️ Impossible de trouver #DragSprite_${entity.id}, annulation de l'animation.`);
    castEffectDiv.remove();
    return null;
  }

  const previousTransform = saved?.previousTransform ?? sprite.style.transform;
  const previousWillChange = saved?.previousWillChange ?? sprite.style.willChange;

  removeIddle(sprite);

  const frameRate = 1000 / 30;

  let direction = saved?.direction ?? 1;
  let maxBackward = saved?.maxBackward ?? -6;
  let phase = saved?.phase ?? 0;
  let finalPhaseStarted = saved?.finalPhaseStarted ?? false;
  let cleanupPlanned = false;
  let stopped = false;

  const state = entity._preparationVisual = saved || { previousTransform, previousWillChange };
  sprite.style.willChange = "transform";
  if (saved?.final) animateFinalPhase(castImg, saved.final);

  function stopPreparationAnimation() {
    if (stopped) return;

    stopped = true; delete entity._preparationVisual;

    if (castEffectDiv && castEffectDiv.parentNode) {
      castEffectDiv.remove();
    }

    sprite.style.transform = previousTransform || "";
    sprite.style.willChange = previousWillChange || "";

    addIddle(sprite);

    if (entity.stopPreparationAnimation === stopPreparationAnimation) {
      entity.stopPreparationAnimation = null;
    }
  }

  entity.stopPreparationAnimation = stopPreparationAnimation;

  function getDynamicProgress() {
    const progress = Number(entity.preparationProgressRatio);

    if (Number.isFinite(progress)) {
      return Math.max(0, Math.min(1, progress));
    }

    return 0;
  }

  function updateAnimation() {
    if (stopped) return;

    if (!document.body.contains(sprite)) {
      stopPreparationAnimation();
      return;
    }

    const progress = getDynamicProgress();

    if (progress >= 0.85 && !finalPhaseStarted) {
      finalPhaseStarted = true;

      if (castImg.classList.contains("boulassefeu")) {
        castImg.style.animation = "pulsateFlame 1.5s ease-in-out infinite alternate";
      }

      state.final = animateFinalPhase(castImg);
    }

    if (progress >= 1) {
      sprite.style.transform = previousTransform || "";

      if (!cleanupPlanned) {
        cleanupPlanned = true;

        setTimeout(() => {
          stopPreparationAnimation();
        }, 2000);
      }

      return;
    }

    const maxIntensity = 0.3 + progress * 1.5;
    const intensity = Math.sin(progress * Math.PI) * maxIntensity;
    const easingFactor = Math.pow(progress, 1.8);
    const translateBackward = maxBackward * easingFactor;

    if (progress > (phase + 1) / 5) {
      phase++;
      maxBackward *= 1.4;
    }

    const translateX = direction * intensity + translateBackward;
    direction *= -1;
    Object.assign(state, { direction, maxBackward, phase, finalPhaseStarted });

    setDecorativeStyle(sprite, 'transform', `translateX(${translateX}px)`);

    setTimeout(() => {
      requestAnimationFrame(updateAnimation);
    }, frameRate);
  }

  requestAnimationFrame(updateAnimation);
  return stopPreparationAnimation;
}
export function animateFinalPhase(castImg, saved = null) {
    if (!castImg) return;

    const finalStartTime = saved?.finalStartTime ?? clockNow();
    const finalDuration = 1000;
    const frameRate = 1000 / 30;

    const previousTransform = saved?.previousTransform ?? castImg.style.transform;
    const previousFilter = saved?.previousFilter ?? castImg.style.filter;
    const castingFilter = saved?.castingFilter
      ?? (cssCastingFilters.has(castImg) && !castImg.style.filter
        ? 'var(--cast-filter-base,)' : getComputedStyle(castImg).filter);
    const previousTransition = saved?.previousTransition ?? castImg.style.transition;
    const previousOpacity = saved?.previousOpacity ?? castImg.style.opacity;
    const previousWillChange = saved?.previousWillChange ?? castImg.style.willChange;

    castImg.style.willChange = "transform, filter, opacity";

    function finalAnimation() {
        const elapsed = clockNow() - finalStartTime;
        const progress = elapsed / finalDuration;

        if (progress >= 1) {
            castImg.style.transform = previousTransform || "";
            castImg.style.filter = previousFilter || "";
            return;
        }

        const scaleUp = 1 + progress * 0.2;
        const brightness = 1 + progress;

        setDecorativeStyle(castImg, 'transform', `scale(${scaleUp})`);
        setDecorativeStyle(castImg, 'filter', `${castingFilter === 'none' ? '' : castingFilter} brightness(${brightness})`);

        setTimeout(() => {
            requestAnimationFrame(finalAnimation);
        }, frameRate);
    }

    requestAnimationFrame(finalAnimation);

    setTimeout(() => {
        if (!castImg || !castImg.parentNode) return;

        castImg.style.transition = "transform 0.3s ease-in-out, opacity 0.3s ease-in-out";
        castImg.style.transform = "scale(1.5)";
        castImg.style.opacity = "0";
    }, Math.max(0, finalStartTime + finalDuration - clockNow()));

    setTimeout(() => {
        if (!castImg) return;

        castImg.style.transform = previousTransform || "";
        castImg.style.filter = previousFilter || "";
        castImg.style.transition = previousTransition || "";
        castImg.style.opacity = previousOpacity || "";
        castImg.style.willChange = previousWillChange || "";
    }, Math.max(0, finalStartTime + finalDuration + 350 - clockNow()));
    return { finalStartTime, previousTransform, previousFilter, castingFilter, previousTransition, previousOpacity, previousWillChange };
}

export function animateRecuperation(entity, attack) {
    const sprite = document.getElementById(`DragSprite_${entity.id}`);
    let effectsContainer = document.getElementById(`effectsContainer_${entity.id}`);

    if (!sprite) {
        console.warn(`⚠️ Impossible de trouver #DragSprite_${entity.id}, annulation de l'animation.`);
        return;
    }

    if (entity.recoveryTime === undefined || entity.recoveryTime <= 0) {
        console.warn(`⏳ ${entity.name} (Side ${entity.side}) a un recoveryTime invalide: ${entity.recoveryTime}`);
        return;
    }

    removeIddle(sprite);

    if (!effectsContainer) {
        console.warn(`⚠️ Impossible de trouver #effectsContainer_${entity.id}, création dynamique.`);
        effectsContainer = document.createElement("div");
        effectsContainer.id = `effectsContainer_${entity.id}`;
        effectsContainer.className = "effects-container";
        sprite.parentNode.appendChild(effectsContainer);
    }

    const saved = entity._recoveryVisual;
    const entityTrackingId = String(entity.id);
    const previousTransform = saved?.previousTransform ?? sprite.style.transform;
    const previousScale = saved?.previousScale ?? sprite.style.scale;
    const previousWillChange = saved?.previousWillChange ?? sprite.style.willChange;

    const startTime = saved?.startTime ?? clockNow();
    const duration = saved?.duration ?? entity.recoveryTime;
    entity._recoveryVisual = { startTime, duration, previousTransform, previousScale, previousWillChange };
    const frameRate = 1000 / 30;

    const maxVerticalMove = 3;
    const maxHorizontalMove = 1.5;
    const recoveryScaleMin = 0.8;
    const recoveryScaleMax = 1;

    let stopped = false;

    const recoveryGif = saved && effectsContainer.querySelector(".recoveryGif") || document.createElement("img");
    if (!saved) playCachedGif(recoveryGif, `./media/assets/effects/recovery.gif`);
    if (!saved) recoveryGif.style.opacity = "0";
    recoveryGif.className = "recoveryGif";
    effectsContainer.appendChild(recoveryGif);

    // La récupération ne gère JAMAIS l'opacité du sprite.
    // Le CAC / la charge restent seuls propriétaires de cette propriété.
    sprite.style.willChange = "transform, scale";

    setTimeout(() => {
        if (recoveryGif && recoveryGif.parentNode) {
            recoveryGif.style.opacity = "1";
        }
    }, Math.max(0, startTime + 50 - clockNow()));

    function stopRecuperation() {
        if (stopped) return;
        stopped = true; delete entity._recoveryVisual;
        if (entity.stopRecoveryAnimation === stopRecuperation) entity.stopRecoveryAnimation = null;

        sprite.style.transform = previousTransform || "";
        sprite.style.scale = previousScale || "";
        sprite.style.willChange = previousWillChange || "";

        recoveryGif.style.opacity = "0";

        if (entity.battleStopped) recoveryGif.remove();
        else setTimeout(() => {
            if (recoveryGif && recoveryGif.parentNode) {
                recoveryGif.remove();
            }
        }, 300);

        const meleeStillOwnsVisualState =
            hasMeleeOriginalVisibilityLock(entityTrackingId)
            || meleeOriginalRecoveryAnimations.has(entityTrackingId)
            || Boolean(activeMeleeAnimations.get(entityTrackingId)?.size);

        if (!meleeStillOwnsVisualState) addIddle(sprite);
    }

    function updateAnimation() {
        if (stopped) return;

        const elapsed = clockNow() - startTime;
        const progress = elapsed / duration;

        if (progress >= 1) {
            stopRecuperation();
            return;
        }

        const breathingSpeed = 0.002;
        const verticalMove =
            Math.sin(elapsed * breathingSpeed * Math.PI * 2) * maxVerticalMove;

        const horizontalMove =
            Math.sin(elapsed * breathingSpeed * Math.PI) * maxHorizontalMove;

        // Pulsation régulière 1 -> 0.8 -> 1, sans toucher à opacity.
        const recoveryScale =
            recoveryScaleMin +
            ((Math.cos(elapsed * breathingSpeed * Math.PI * 2) + 1) / 2) *
            (recoveryScaleMax - recoveryScaleMin);

        setDecorativeStyle(sprite, 'transform', `translate(${horizontalMove.toFixed(2)}px, ${verticalMove.toFixed(2)}px)`);
        setDecorativeStyle(sprite, 'scale', recoveryScale.toFixed(3));

        setTimeout(() => {
            requestAnimationFrame(updateAnimation);
        }, frameRate);
    }

    entity.stopRecoveryAnimation = stopRecuperation;
    requestAnimationFrame(updateAnimation);
    return stopRecuperation;
}

const projectileTargetFollowers = new Map();

function refreshProjectileFollowers(record) {
    // A movement publishes one position sample to all followers of this target.
    // Each follower still samples its own combat clock and flight state.
    const positionStamp = performance.now();
    for (const follower of record.followers) {
        follower.refreshTargetPosition(clockNow(), positionStamp);
    }
}

function registerProjectileFollower(key, targetId, follower) {
    let record = projectileTargetFollowers.get(key);
    if (!record) {
        record = { key, targetId, followers: new Set() };
        projectileTargetFollowers.set(key, record);
    }

    record.followers.add(follower);
    follower.refreshTargetPosition(clockNow());
}

function unregisterProjectileFollower(key, follower) {
    const record = projectileTargetFollowers.get(key);
    if (!record) return;

    record.followers.delete(follower);
    if (record.followers.size > 0) return;

    projectileTargetFollowers.delete(key);
}

export function notifyProjectileTargetMoved(targetOrId, movementEffect = null, movementOrigin = 'automatic') {
    if (targetOrId && typeof targetOrId === 'object') applyMovementDestabilisation(targetOrId, movementEffect, movementOrigin);
    if (targetOrId && typeof targetOrId === 'object') wakeFromMovement(targetOrId);
    let targetId = targetOrId;
    if (targetOrId?.nodeType === 1) {
        const domId = String(targetOrId.id || "");
        const entityIdMatch = domId.match(/^(?:Box_Entite_|sbire_|lord_)(.+)$/);
        targetId = entityIdMatch?.[1]
            ?? targetOrId.dataset?.entityId
            ?? targetOrId.dataset?.position
            ?? domId;
    } else if (targetOrId && typeof targetOrId === "object") {
        targetId = targetOrId.id
            ?? targetOrId.dataset?.entityId
            ?? targetOrId.dataset?.position;
    }
    if (targetId == null) return 0;
    notifyTargetGeometryChanged(document.getElementById(`Box_Entite_${targetId}`)
        || (targetOrId?.nodeType === 1 ? targetOrId : null));

    let refreshed = 0;
    for (const record of projectileTargetFollowers.values()) {
        if (String(record.targetId) !== String(targetId)) continue;
        refreshProjectileFollowers(record);
        refreshed += record.followers.size;
    }
    window.dispatchEvent(new CustomEvent('entityCombatInteraction', {
        detail: { entity: targetOrId?.stats ? targetOrId : null, entityId: targetId, kind: 'movement' },
    }));
    return refreshed;
}

export function notifyAllProjectileTargetsMoved() {
    invalidateProjectileGeometry();
    let refreshed = 0;
    for (const record of projectileTargetFollowers.values()) {
        refreshProjectileFollowers(record);
        refreshed += record.followers.size;
    }
    return refreshed;
}

if (typeof document !== "undefined") {
    document.addEventListener("projectileTargetsMoved", () => {
        notifyAllProjectileTargetsMoved();
    });
}

export function disperseMagicalProjectile(projectileParent, projectileChild, direction = {}, options = {}) {
    if (!projectileParent?.isConnected) return Promise.resolve();

    const rawX = Number(direction.x) || 0;
    const rawY = Number(direction.y) || 0;
    const magnitude = Math.hypot(rawX, rawY) || 1;
    const directionX = rawX / magnitude;
    const directionY = rawY / magnitude;
    const baseAngle = Math.atan2(directionY, directionX);
    const particleColor = projectileChild?.classList.contains('heal-fx')
        ? '#00f6ff'
        : projectileChild?.classList.contains('rez-fx')
            ? '#ccfff3'
            : projectileParent.classList.contains('hybridalDamage')
                ? '#d600ae'
                : '#8f5dff';

    const sourceRect = screenEffectRect((projectileChild || projectileParent).getBoundingClientRect());
    const effect = document.createElement('span');
    effect.className = 'magic-projectile-dispersion';
    effect.dataset.projectileId = String(projectileParent.id || 'projectile');
    effect.style.setProperty('--magic-dispel-color', particleColor);
    effect.style.left = `${sourceRect.left + sourceRect.width / 2}px`;
    effect.style.top = `${sourceRect.top + sourceRect.height / 2}px`;
    screenEffectHost().appendChild(effect);

    if (!options.preserveProjectile && projectileChild) projectileChild.style.opacity = '0';

    const particleCount = 7;
    const particleAnimations = Array.from({ length: particleCount }, (_, index) => {
        const particle = document.createElement('span');
        particle.className = 'magic-projectile-dispel-particle';
        const spread = -0.75 + (1.5 * index / (particleCount - 1)) + (Math.random() - 0.5) * 0.16;
        const angle = baseAngle + spread;
        const distance = 56 + Math.random() * 48;
        const travelX = Math.cos(angle) * distance;
        const travelY = Math.sin(angle) * distance;
        const size = 4 + Math.random() * 3;
        particle.style.width = `${size}px`;
        particle.style.height = `${size}px`;
        effect.appendChild(particle);

        const animation = particle.animate([
            { transform: 'translate(-50%, -50%) translate3d(0, 0, 0) scale(1)', opacity: 1 },
            { transform: `translate(-50%, -50%) translate3d(${travelX * 0.62}px, ${travelY * 0.62}px, 0) scale(.82)`, opacity: .86, offset: .46 },
            { transform: `translate(-50%, -50%) translate3d(${travelX * 0.88}px, ${travelY * 0.88}px, 0) scale(.5)`, opacity: .42, offset: .78 },
            { transform: `translate(-50%, -50%) translate3d(${travelX}px, ${travelY}px, 0) scale(.12)`, opacity: 0 },
        ], {
            duration: 480 + Math.random() * 210,
            delay: (index % 3) * 14,
            easing: 'linear',
            fill: 'forwards',
        });
        return animation.finished.catch(() => undefined);
    });

    return Promise.all(particleAnimations).finally(() => effect.remove());
}

function convertMixedProjectileToRemnant(projectileParent, remnantNature = 'physical') {
    if (!projectileParent?.isConnected || projectileParent.classList.contains('mixed-projectile-remnant')) return;

    projectileParent.classList.remove('energy-projectile');
    const child = projectileParent.querySelector('.projectile');
    if (child) {
        child.style.removeProperty('--energy-texture');
        child.style.removeProperty('transform');
    }
    const piercing = remnantNature === 'piercing';
    projectileParent.classList.remove('hybridalDamage', 'magicalDamage', 'magicalPiercingDamage');
    projectileParent.classList.add(
        'mixed-projectile-remnant',
        piercing ? 'piercingDamage' : 'physicalDamage',
        piercing ? 'mixed-piercing-remnant' : 'hybrid-physical-remnant'
    );
}

export async function animationProjectile(attackerObj, targetObj, onHit, projectileData = null) {
    const attackerPrefix = getBattleEntityDomPrefix(attackerObj);

    const targetPrefix =
        targetObj.nodeType === 1 && targetObj.classList.contains("hex")
            ? "hex"
            : getBattleEntityDomPrefix(targetObj);

    const source = getBattleEntityElement(attackerObj);
    const cible =
        targetPrefix === "hex"
            ? targetObj
            : getBattleEntityElement(targetObj);

    if (!source || !cible) {
        console.error("Source ou cible introuvable");
        return "cancelled";
    }

    if (!Array.isArray(attackerObj.projectiles)) {
        attackerObj.projectiles = [];
    }

    const projectileId = projectileData?.id || `projectile_${crypto.randomUUID()}`;
    const projectileToken = projectileCleanupToken;
    // Runtime references stay in the closure, never in serializable entity data.
    const { flight: flightContext, impactPromise, restoredVisual, ...projectileRecord } = projectileData || {};

    const projectile = {
        ...projectileRecord,
        flightMode: flightContext?.mode,
        id: projectileId,
        attackerId: attackerObj.id,
        targetId: targetObj.id,
        attackId: projectileData?.attackId ?? attackerObj.currentAttack?.attackId,
        damage: projectileData?.damage || 0,
        startTime: clockNow(),
        status: "in-flight",
    };
    const projectileVisualClasses = [
        projectile.effectProjectile,
        projectile.effectProjectileClass,
        ...(Array.isArray(projectile.effectProjectileClasses)
            ? projectile.effectProjectileClasses
            : []),
    ]
        .flatMap((value) => Array.isArray(value) ? value : [value])
        .map((value) => String(value || "").trim())
        .filter((value) => value && value !== "none");

    attackerObj.projectiles = attackerObj.projectiles.filter(p => p.id !== projectileId);
    attackerObj.projectiles.push(projectile);
    if (restoredVisual) document.getElementById(projectileId)?.remove();

    const projectileParent = document.createElement("div");
    projectileParent.className = "projectile-parent";
    projectileParent.id = projectileId;
    projectileVisualClasses.forEach((cls) => projectileParent.classList.add(cls));

    const natures = projectileData?.attacknature
        ?? projectileData?.natures
        ?? attackerObj?.currentAttack?.attacknature;

    if (Array.isArray(natures)) {
        natures.forEach((nature) => {
            const cls = String(nature)
                .trim()
                .replace(/[^a-zA-Z0-9_-]/g, "-");

            if (cls) projectileParent.classList.add(cls);
        });
    }

  const projectileChild = document.createElement("div");
projectileChild.className = `projectile ${attackerPrefix}-projectile`.trim();
projectileVisualClasses.forEach((cls) => projectileChild.classList.add(cls));

const projectileFilters = [];

if (projectile.aura === "ambidextry") {
  projectileChild.classList.add("ambidextry-aura");
  projectileFilters.push(
    "drop-shadow(0 0 6px #edff00)",
    "drop-shadow(0 0 12px #edff00)"
  );
}

if (projectile.isLaunchedUnderMysticism) {
  projectileChild.classList.add("mysticism-aura");
  projectileParent.classList.add("mysticism-projectile");

  projectileFilters.push(
    "drop-shadow(0 0 6px rgba(255,255,255,1))",
    "drop-shadow(0 0 14px rgba(210,235,255,0.95))",
    "drop-shadow(0 0 26px rgba(160,210,255,0.85))",
    "brightness(1.8)"
  );
}

if (projectileFilters.length > 0) {
  projectileChild.style.filter = projectileFilters.join(" ");
}

projectileParent.appendChild(projectileChild);
const energyVisual = applyEnergyProjectile(projectileParent, projectileChild, natures, flightContext?.mode);
const magicalFlight = energyVisual || ['magical', 'mixed', 'triple'].includes(flightContext?.mode)
    || ['magicalDamage', 'hybridalDamage', 'magicalPiercingDamage', 'hybridalPiercingDamage'].includes(attackTone(natures).nature);
let trail = null;
function usePhysicalSpeedTrail(trailNatures = natures) {
    projectileParent.classList.add('physical-projectile');
    if (!trail?.visual.classList.contains('projectile-speed-trail')) {
        removeProjectileTrail(trail);
        const visual = createSpeedTrail(null, {
            className: 'projectile-speed-trail',
            style: { left: '-96px', top: '-6px', width: '96px', height: '12px', zIndex: '0', willChange: 'auto' },
        });
        trail = createProjectileTrail(projectileParent, visual);
    }
    colorMeleeTrail(trail.visual, trailNatures);
}
if (magicalFlight && !flightContext?.guidanceLost && !restoredVisual?.curve) {
    trail = createProjectileTrail(projectileParent, createMagicProjectileTrail(projectileChild, natures));
} else {
    usePhysicalSpeedTrail(flightContext?.guidanceLost
        ? [flightContext.remnantNature === 'piercing' ? 'piercingDamage' : 'physicalDamage'] : natures);
}
const orientHead = projectileChild.classList.contains('deadshot-fx');
let energyDirectionX = null, energyDirectionY = null;
function orientProjectileHead(x, y) {
    // Round cores do not need a transform write. Preserve illustrated spins.
    if (!orientHead) return;
    if (x === energyDirectionX && y === energyDirectionY) return;
    energyDirectionX = x; energyDirectionY = y;
    setDecorativeStyle(projectileChild, 'transform', `matrix(${x}, ${y}, ${-y}, ${x}, 0, 0)`);
}

    const startRect = screenEffectRect(source.getBoundingClientRect());

    const posXStart = startRect.left + startRect.width / 2;
    const posYStart = startRect.top + startRect.height / 2;
    let posXCurrent = restoredVisual?.x ?? posXStart;
    let posYCurrent = restoredVisual?.y ?? posYStart;

    Object.assign(projectileParent.style, {
        position: "absolute",
        left: "0px",
        top: "0px",
        transform: `translate3d(${posXCurrent}px, ${posYCurrent}px, 0)`,
        willChange: "transform",
        visibility: "visible",
    });

    const configuredExecutionTime = Number(
        projectile.executionTime
        ?? projectile.travelDuration
        ?? projectile.duration
        ?? attackerObj.currentAttack?.executionTime
        ?? attackerObj.executionTime
        ?? 1000
    );
    const executionTime = Number.isFinite(configuredExecutionTime) && configuredExecutionTime > 0
        ? configuredExecutionTime
        : 1000;
    let startTime = restoredVisual?.startTime ?? (impactPromise ? clockNow() : null);
    let scheduledImpactSettled = false;
    impactPromise?.then(() => { scheduledImpactSettled = true; }, () => { scheduledImpactSettled = true; });
    let cachedTargetElement = null;
    let cachedTargetX = null;
    let cachedTargetY = null;
    let cachedTargetRect = null;
    let curve = restoredVisual?.curve ?? null;
    let travelDistance = restoredVisual?.travelDistance ?? 0;
    let paintedX = restoredVisual?.paintedX ?? posXCurrent;
    let paintedY = restoredVisual?.paintedY ?? posYCurrent;
    let paintElapsed = restoredVisual?.paintElapsed ?? 0;
    let paintedEndX = null, paintedEndY = null;
    let lastDirectionX = restoredVisual?.dx ?? 1;
    let lastDirectionY = restoredVisual?.dy ?? 0;
    const targetTrackingId = targetPrefix === "hex"
        ? (targetObj.dataset?.position ?? targetObj.id ?? "hex")
        : targetObj.id;
    const targetTrackingKey = `${targetPrefix}:${String(targetTrackingId)}`;

    function paintProjectile(elapsedTime, directionX, directionY) {
        paintElapsed = elapsedTime; paintedEndX = cachedTargetX; paintedEndY = cachedTargetY;
        const progress = Math.min(1, Math.max(0, elapsedTime / executionTime));
        if (curve) {
            const duration = Math.max(1, executionTime - curve.at);
            const p = Math.min(1, Math.max(0, (elapsedTime - curve.at) / duration));
            paintedX = curve.x + (cachedTargetX - curve.x) * p;
            paintedY = curve.y + (cachedTargetY - curve.y) * p - 4 * curve.height * p * (1 - p);
            const distance = Math.hypot(cachedTargetX - curve.x, cachedTargetY - curve.y) || 1;
            updatePhysicalTrail(trail, curve, cachedTargetX, cachedTargetY, p, Math.min(p, 112 / distance, 180 / duration));
            orientProjectileHead(trail.ny, -trail.nx);
        } else {
            paintedX = posXCurrent;
            paintedY = posYCurrent;
            updateMagicTrail(trail, paintedX, paintedY, directionX, directionY,
                Math.min(96, travelDistance * progress));
            orientProjectileHead(directionX, directionY);
        }
        setProjectileTransform(projectileParent,
            `translate3d(${paintedX}px, ${paintedY}px, 0)`);
    }

    function saveProjectilePose() {
        // Only visual data. Logical movement and scheduled impacts stay intact.
        projectile.visual = { x: posXCurrent, y: posYCurrent, startTime, dx: lastDirectionX, dy: lastDirectionY,
            curve, travelDistance, paintedX, paintedY, paintElapsed, paintedEndX, paintedEndY };
    }

    function getCurrentTargetElement() {
        const flight = projectileData?.flight;
        flight?.sample?.();
        if (flight?.mode === 'physical') return flight.aimedHex;
        if (flight?.mode === 'mixed' && flight.guidanceLost) return flight.lockedHex;
        if (targetPrefix === "hex") return targetObj;
        return getBattleEntityElement(targetObj);
    }

    function refreshTargetPosition(timestamp = clockNow(), renderFrameStamp) {
        const currentTarget = getCurrentTargetElement();
        if (!currentTarget) return false;

        const rect = readProjectileTargetRect(currentTarget, renderFrameStamp);
        if (currentTarget === cachedTargetElement && rect === cachedTargetRect) return true;
        const targetRect = screenEffectRect(rect);
        cachedTargetRect = rect;
        cachedTargetElement = currentTarget;
        cachedTargetX = targetRect.left + targetRect.width / 2;
        cachedTargetY = targetRect.top + targetRect.height / 2;
        return true;
    }

    const projectileFollower = {
        getTargetElement: getCurrentTargetElement,
        refreshTargetPosition
    };

    const releaseGeometry = trackProjectileGeometry(projectileParent, () => cachedTargetElement);
    let flightSettled = false;
    let resolveFlight = null;
    let rejectFlight = null;
    const flightDone = new Promise((resolve, reject) => {
        resolveFlight = resolve;
        rejectFlight = reject;
    });

    function finishFlight(result = "removed", error = null) {
        if (flightSettled) return;
        flightSettled = true;
        removeProjectileTrail(trail);
        releaseGeometry();
        if (error) {
            rejectFlight?.(error);
            return;
        }
        resolveFlight?.(result);
    }

    function removeProjectile(result = "removed", error = null) {
        projectile.status = result;
        projectile.impactTime = clockNow();
        unregisterProjectileFollower(targetTrackingKey, projectileFollower);
        if (projectileParent && projectileParent.parentNode) {
            projectileParent.remove();
        }

        cleanupOldProjectiles(attackerObj);
        finishFlight(result, error);
    }

    async function animerProjectile(timestamp, renderFrameStamp) {
        if (projectileToken !== projectileCleanupToken || !projectileParent?.isConnected) {
            removeProjectile();
            return;
        }

        const flight = projectileData?.flight;
        if (flight?.consumeMagicalLoss?.()) {
            disperseMagicalProjectile(projectileParent, projectileChild, {
                x: lastDirectionX,
                y: lastDirectionY,
            }, { preserveProjectile: true }).catch(() => undefined);
            convertMixedProjectileToRemnant(projectileParent, flight.remnantNature);
            refreshTargetPosition(timestamp, renderFrameStamp);
            curve = { x: paintedX, y: paintedY, at: Math.max(0, timestamp - (startTime ?? timestamp)),
                height: Math.min(60, Math.hypot(cachedTargetX - paintedX, cachedTargetY - paintedY) * .12) };
            usePhysicalSpeedTrail([flight.remnantNature === 'piercing' ? 'piercingDamage' : 'physicalDamage']);
        }

        if (flight?.cancelled()) {
            removeProjectileTrail(trail);
            releaseGeometry();
            projectile.status = 'dispelled';
            unregisterProjectileFollower(targetTrackingKey, projectileFollower);
            const magicalCasterDispel = flight.mode === 'magical'
                && flight.casterLost
                && !flight.expired();
            if (magicalCasterDispel) {
                disperseMagicalProjectile(projectileParent, projectileChild, {
                    x: lastDirectionX,
                    y: lastDirectionY,
                }).catch(() => undefined);
                removeProjectile('dispelled');
                return;
            } else {
                removeCombatVisualAfter(projectileParent, 180);
                const fade = projectileParent.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: 'forwards' });
                try { await fade.finished; } catch { /* Battle cleanup may cancel the fade. */ }
            }
            removeProjectile('dispelled');
            return;
        }
        // Homing also works during continuous movement, not only after a drop.
        refreshTargetPosition(timestamp, renderFrameStamp);

        if (!startTime) startTime = timestamp;

        const elapsedTime = timestamp - startTime;
        const remainingTime = executionTime - elapsedTime;

        if (!cachedTargetElement?.isConnected) {
            console.error("Cible perdue pendant le vol du projectile !");
            removeProjectile();
            return;
        }

        const posXEnd = cachedTargetX;
        const posYEnd = cachedTargetY;

        const dx = posXEnd - posXCurrent;
        const dy = posYEnd - posYCurrent;

        const distanceRestante = Math.sqrt(dx * dx + dy * dy);

        if (impactPromise ? scheduledImpactSettled : distanceRestante < 5 || remainingTime <= 0) {
            removeProjectileTrail(trail);
            posXCurrent = posXEnd;
            posYCurrent = posYEnd;
            setProjectileTransform(projectileParent, `translate3d(${posXEnd}px, ${posYEnd}px, 0)`);
            releaseGeometry();
            unregisterProjectileFollower(targetTrackingKey, projectileFollower);

            let impactResult = "hit";
            if (typeof onHit === "function") {
                try {
                    impactResult = await onHit() || projectileData?.status || "hit";
                } catch (error) {
                    console.error("Erreur pendant l'impact du projectile :", error);
                    const storedProjectile = attackerObj.projectiles.find(
                        (p) => p.id === projectileId
                    );

                    if (storedProjectile) {
                        storedProjectile.status = "error";
                        storedProjectile.impactTime = clockNow();
                    }

                    removeProjectile("error", error);
                    return;
                }
            }

            const storedProjectile = attackerObj.projectiles.find(
                (p) => p.id === projectileId
            );

            if (storedProjectile) {
                storedProjectile.status = impactResult;
                storedProjectile.impactTime = clockNow();
            }

            if (impactResult === "miss" || impactResult === "dodged") {
                const travelX = posXEnd - posXStart;
                const travelY = posYEnd - posYStart;
                const travelDistance = Math.hypot(travelX, travelY) || 1;
                const directionX = travelX / travelDistance;
                const directionY = travelY / travelDistance;
                const targetRect = screenEffectRect(cachedTargetElement.getBoundingClientRect());
                const overshootDistance = Math.max(
                    63,
                    Math.hypot(targetRect.width, targetRect.height) * 0.875
                );
                const passX = posXEnd + directionX * overshootDistance;
                const passY = posYEnd + directionY * overshootDistance;

                const passAnimation = projectileParent.animate(
                    [
                        { transform: `translate3d(${posXEnd}px, ${posYEnd}px, 0)`, opacity: "1" },
                        { transform: `translate3d(${passX}px, ${passY}px, 0)`, opacity: "0" },
                    ],
                    {
                        duration: 220,
                        easing: "linear",
                        fill: "forwards",
                    }
                );

                removeCombatVisualAfter(projectileParent, 220);
                try {
                    await passAnimation.finished;
                } catch {
                    // Le projectile a été supprimé avant la fin de son dépassement.
                }
                removeProjectile(impactResult);
                return;
            }

            const impactDiv = document.createElement("div");
            impactDiv.className = `projectile-impacte ${attackerPrefix}-impacte`.trim();
            projectileVisualClasses.forEach((cls) => impactDiv.classList.add(cls));

            Object.assign(impactDiv.style, {
                position: "absolute",
                left: "50%",
                top: "50%",
                transform: "translate(-50%, -50%)",
                visibility: "visible",
            });

            projectileParent.appendChild(impactDiv);

            removeCombatVisualAfter(projectileParent, 80);
            setTimeout(() => removeProjectile(impactResult), 80);
            return;
        }

        const safeRemainingTime = Math.max(16, remainingTime);
        const vitesse = distanceRestante / (safeRemainingTime / 16);

        const directionX = distanceRestante > 0 ? dx / distanceRestante : lastDirectionX;
        const directionY = distanceRestante > 0 ? dy / distanceRestante : lastDirectionY;
        lastDirectionX = directionX;
        lastDirectionY = directionY;

        posXCurrent += directionX * vitesse;
        posYCurrent += directionY * vitesse;
        paintProjectile(elapsedTime, directionX, directionY);

        saveProjectilePose();
        scheduleProjectileFrame(animerProjectile);
    }

    refreshTargetPosition();
    const initialDX = cachedTargetX - posXCurrent, initialDY = cachedTargetY - posYCurrent;
    const initialDistance = Math.hypot(initialDX, initialDY);
    travelDistance = restoredVisual?.travelDistance ?? initialDistance;
    if (!curve && (!magicalFlight || flightContext?.guidanceLost)) {
        curve = { x: posXStart, y: posYStart, at: 0, height: Math.min(60, initialDistance * .12) };
    }
    const currentEndX = cachedTargetX, currentEndY = cachedTargetY;
    if (restoredVisual?.paintedEndX != null) {
        cachedTargetX = restoredVisual.paintedEndX; cachedTargetY = restoredVisual.paintedEndY;
    }
    paintProjectile(restoredVisual?.paintElapsed ?? (startTime === null ? 0 : clockNow() - startTime),
        restoredVisual ? lastDirectionX : initialDistance ? initialDX / initialDistance : lastDirectionX,
        restoredVisual ? lastDirectionY : initialDistance ? initialDY / initialDistance : lastDirectionY);
    cachedTargetX = currentEndX; cachedTargetY = currentEndY;
    saveProjectilePose();
    // Measure source and target before inserting our own overlay. No extra
    // layout between these reads; moving targets are still sampled every frame.
    screenEffectHost().appendChild(projectileParent);
    if (projectileData?.flight?.mode !== 'physical') {
        registerProjectileFollower(targetTrackingKey, targetTrackingId, projectileFollower);
    }
    scheduleProjectileFrame(animerProjectile);
    return flightDone;
}

export function clearProjectileEffects(entityList = []) {
    clearProjectileTrails();
    clearProjectileGeometry();
    projectileCleanupToken += 1;
    projectileTargetFollowers.clear();

    document.querySelectorAll('.projectile-parent, .projectile-impacte, .magic-projectile-dispersion, .melee-clone-death-blood')
        .forEach(element => element.remove());
    cancelProjectileFrames();

    [...activeMeleeAnimations.values()]
        .flatMap(controllers => [...controllers])
        .forEach(controller => controller?.cancel?.());
    activeMeleeAnimations.clear();
    meleeOriginalVisibilityLocks.clear();
    [...meleeOriginalRecoveryAnimations.keys()]
        .forEach(key => cancelMeleeOriginalRecovery(key, true));

    document.querySelectorAll(
        '.BattleFX > .melee-impact-fx, .BattleFX > .melee-motion-trail, .BattleFX > canvas[id^="meleeClone_"]'
    )
        .forEach(element => {
            element.getAnimations?.().forEach(animation => animation.cancel());
            element.remove();
        });

    document.querySelectorAll('.BattleFX').forEach(container => {
        container.getAnimations?.({ subtree: true }).forEach(animation => animation.cancel());
        container.replaceChildren();
        container.remove();
    });

    if (!Array.isArray(entityList)) return;

    entityList.forEach(entity => {
        if (Array.isArray(entity?.projectiles)) {
            entity.projectiles.length = 0;
        }
    });
}

function cleanupOldProjectiles(attackerObj) {
    if (!attackerObj || !Array.isArray(attackerObj.projectiles)) {
        return;
    }

    const now = clockNow();

    attackerObj.projectiles = attackerObj.projectiles.filter((projectile) => {
        if (!projectile) return false;

        if (projectile.status === "in-flight") {
            return true;
        }

        if (projectile.status === "hit" && projectile.impactTime) {
            return now - projectile.impactTime < 5000;
        }

        return false;
    });
}
export async function finishMeleeCloneOnDeath(clone, frozenTransform) {
    if (!clone?.isConnected) return;
    const transform = frozenTransform && frozenTransform !== 'none' ? frozenTransform : clone.style.transform;
    clone.style.transform = transform;
    clone.style.opacity = '1';
    clone.classList.add('melee-clone-death');
    const context = clone.getContext?.('2d');
    if (context) {
        context.save();
        context.globalCompositeOperation = 'source-atop';
        context.fillStyle = 'rgba(220, 0, 0, 0.75)';
        context.fillRect(0, 0, clone.width, clone.height);
        context.restore();
    }
    const shake = clone.animate([
        { transform: `${transform} translate(0, 0)` },
        { transform: `${transform} translate(-2px, 1px)` },
        { transform: `${transform} translate(2px, -1px)` },
        { transform: `${transform} translate(0, 0)` },
    ], { duration: 100, iterations: 10 });
    try { await shake.finished; } catch { return; }
    if (!clone.isConnected) return;
    const rect = screenEffectRect(clone.getBoundingClientRect());
    const blood = document.createElement('img');
    playCachedGif(blood, `./media/assets/effects/death-blood.gif`);
    blood.className = 'melee-clone-death-blood';
    Object.assign(blood.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    screenEffectHost().appendChild(blood);
    clone.remove();
    removeCombatVisualAfter(blood, 700);
}

export function animationMelee(attacker, target, isAmbidextry = false, timingOptions = {}) {
    const readPositiveDuration = (value) => {
        const duration = Number(value);
        return Number.isFinite(duration) && duration > 0 ? duration : null;
    };
    const options = timingOptions && typeof timingOptions === "object"
        ? timingOptions
        : {};
    const saved = options.resume || null;
    const selectedTrailNatures = options.attacknature ?? attacker.currentAttack?.attacknature ?? [];
    const trailNatures = Array.isArray(selectedTrailNatures) ? [...selectedTrailNatures] : selectedTrailNatures;
    const visualStartedAt = saved?.startedAt ?? clockNow();
    const elapsed = saved ? Math.max(0, clockNow() - visualStartedAt) : 0;
    let replaying = Boolean(saved), replayTime = 0;
    const replayQueue = [];
    const animate = (node, frames, timing) => {
        const animation = node.animate(frames, timing);
        if (replaying) animation.currentTime = Math.max(0, elapsed - replayTime);
        return animation;
    };
    const entityExecutionDuration = readPositiveDuration(attacker.executionTime);
    const currentAttackDuration = readPositiveDuration(attacker.currentAttack?.executionTime);
    const standardDuration = entityExecutionDuration ?? currentAttackDuration ?? 1000;

    let activeAmbidextryProjectileDuration = null;
    if (isAmbidextry && Array.isArray(attacker.projectiles)) {
        for (let index = attacker.projectiles.length - 1; index >= 0; index -= 1) {
            const projectile = attacker.projectiles[index];
            if (projectile?.aura !== "ambidextry") continue;
            if (projectile.status && projectile.status !== "in-flight") continue;

            activeAmbidextryProjectileDuration = readPositiveDuration(
                projectile.executionTime
                ?? projectile.travelDuration
                ?? projectile.duration
            );
            if (activeAmbidextryProjectileDuration !== null) break;
        }
    }

    const requestedDuration = readPositiveDuration(
        options.duration ?? options.executionTime
    );
    const configuredAmbidextryDuration = readPositiveDuration(
        options.ambidextryDuration
        ?? attacker.currentAttack?.ambidextryExecutionTime
        ?? attacker.ambidextryExecutionTime
    );
    const configuredSpeedMultiplier = Number(
        options.ambidextrySpeedMultiplier
        ?? attacker.currentAttack?.ambidextrySpeedMultiplier
        ?? attacker.ambidextrySpeedMultiplier
        ?? 0.6
    );
    const ambidextrySpeedMultiplier = Number.isFinite(configuredSpeedMultiplier)
        ? Math.min(1, Math.max(0.15, configuredSpeedMultiplier))
        : 0.6;
    const currentAttackAlreadyAccelerated =
        currentAttackDuration !== null
        && entityExecutionDuration !== null
        && currentAttackDuration < entityExecutionDuration;

    const synchronizedAmbidextryDuration =
        requestedDuration
        ?? activeAmbidextryProjectileDuration
        ?? configuredAmbidextryDuration
        ?? (currentAttackAlreadyAccelerated ? currentAttackDuration : null)
        ?? standardDuration * ambidextrySpeedMultiplier;
    const baseDuration = Math.max(
        isAmbidextry ? 120 : 200,
        isAmbidextry
            ? synchronizedAmbidextryDuration
            : (requestedDuration ?? standardDuration)
    );
    const attackerTrackingId = String(attacker.id);
    if (!isAmbidextry) cancelActiveMeleeAnimations(attackerTrackingId);
    const chargeDuration = baseDuration * (isAmbidextry ? 0.18 : 0.35);
    const voidDuration = baseDuration * (isAmbidextry ? 0.02 : 0.05);
    const cloneDuration = baseDuration - chargeDuration - voidDuration;
    const originalRecoveryDuration = MELEE_ORIGINAL_RECOVERY_DURATION;
    const impactDuration = Math.min(180, Math.max(120, baseDuration * 0.14));
    // Bake the disappearance into the browser animation. The damage callback
    // may be delayed by the combat queue; holding the last travel frame until
    // that callback used to stack opaque clones on crowded targets.
    const animateCloneTravel = (node, frames, duration, easing) => {
        const totalDuration = duration + impactDuration;
        const travelFraction = duration / totalDuration;
        return animate(node, [
            ...frames.map((frame, index) => ({
                ...frame,
                offset: (frame.offset ?? index / (frames.length - 1)) * travelFraction,
                easing: frame.easing ?? easing,
            })),
            { ...frames[frames.length - 1], opacity: "0", offset: 1, easing: "linear" },
        ], { duration: totalDuration, easing: "linear", fill: "forwards" });
    };
    const cloneStartDelay = chargeDuration + voidDuration;
    const impactResolutionGrace = isAmbidextry
        ? Math.min(140, Math.max(60, baseDuration * 0.2))
        : 2000;
    const scaleBase = 1;

    const sprite = document.getElementById(`DragSprite_${attacker.id}`);
    if (!sprite) {
        console.warn(`⚠️ DragSprite_${attacker.id} introuvable`);
        return;
    }

    // Une nouvelle attaque CAC est le seul moment où l'on libère le verrou
    // post-restauration. On retire d'abord .iddle pour ne jamais lire une
    // éventuelle frame CSS d'opacité comme opacité de départ de la charge.
    sprite.classList.remove("iddle");
    unlockMeleePostRecoveryOpacity(attackerTrackingId, sprite);

    const originalRecoveryWasActive = meleeOriginalRecoveryAnimations.has(
        attackerTrackingId
    );
    const previousSpriteTransform = saved?.previousSpriteTransform ?? sprite.style.transform;
    const previousSpriteTransition = saved?.previousSpriteTransition ?? sprite.style.transition;
    const previousSpriteWillChange = saved?.previousSpriteWillChange ?? sprite.style.willChange;
    const previousSpriteOpacity = saved?.previousSpriteOpacity ?? (originalRecoveryWasActive
        ? "1"
        : sprite.style.opacity);
    let visibleSpriteOpacity = saved?.visibleSpriteOpacity ?? (originalRecoveryWasActive
        ? 1
        : (Number.parseFloat(getComputedStyle(sprite).opacity) || 1));

    sprite.style.willChange = "transform, opacity";

    const spriteContainer = document.getElementById(`spriteContainer_${attacker.id}`);
    const isSideB =
        String(attacker.side ?? "").toUpperCase() === "B" ||
        sprite.classList.contains("side-B") ||
        sprite.classList.contains("sideB") ||
        sprite.classList.contains("B") ||
        spriteContainer?.classList.contains("side-B") ||
        spriteContainer?.classList.contains("sideB") ||
        spriteContainer?.classList.contains("B");

    let fxContainer = document.querySelector(".BattleFX");

    if (!fxContainer) {
        fxContainer = document.createElement("div");
        fxContainer.className = "BattleFX";
        Object.assign(fxContainer.style, {
            position: "absolute",
            top: "0",
            left: "0",
            width: "100%",
            height: "100%",
            pointerEvents: "none",
        });
        screenEffectHost().appendChild(fxContainer);
    }

    Object.assign(fxContainer.style, {
        zIndex: "9998",
        overflow: "visible",
        pointerEvents: "none",
    });

    const attackerCanvas = document.querySelector(`#spriteCanvas_${attacker.id}`);
    const getCurrentMeleeTargetCanvas = () =>
        document.querySelector(`#spriteCanvas_${target.id}`);
    const targetCanvas = getCurrentMeleeTargetCanvas();

    if (!attackerCanvas || !targetCanvas) {
        console.warn("Canvas introuvable pour animationMelee.");

        sprite.style.transform = previousSpriteTransform || "";
        sprite.style.transition = previousSpriteTransition || "";
        sprite.style.willChange = previousSpriteWillChange || "";
        sprite.classList.add("iddle");

        return;
    }

    const attackerRect = saved?.attackerRect ?? screenEffectRect(attackerCanvas.getBoundingClientRect());
    const initialTargetRect = saved?.initialTargetRect ?? screenEffectRect(targetCanvas.getBoundingClientRect());
    const startX = attackerRect.left + attackerRect.width / 2;
    const startY = attackerRect.top + attackerRect.height / 2;
    const initialDeltaX = initialTargetRect.left + initialTargetRect.width / 2 - startX;
    const initialDeltaY = initialTargetRect.top + initialTargetRect.height / 2 - startY;
    const initialDistance = Math.hypot(initialDeltaX, initialDeltaY);
    const longTravelFactor = Math.min(
        1,
        Math.max(0, (initialDistance - 220) / 520)
    );
    const cruiseSpriteOpacity = 1 - longTravelFactor * 0.36;
    const speedTrailPeakOpacity = 0.72 + longTravelFactor * 0.12;
    const speedTrailPeakStretch = 1.1 + longTravelFactor * 0.38;
    const configuredCloseRangeThreshold = Number(options.closeRangeThreshold);
    const automaticCloseRangeThreshold = Math.min(
        64,
        Math.max(
            28,
            Math.min(attackerRect.width, initialTargetRect.width) * 0.42
        )
    );
    const closeRangeThreshold = Number.isFinite(configuredCloseRangeThreshold)
        && configuredCloseRangeThreshold >= 0
        ? configuredCloseRangeThreshold
        : automaticCloseRangeThreshold;
    const isCloseRangeCharge = saved?.isCloseRangeCharge ?? (options.closeRangeCharge !== false
        && initialDistance <= closeRangeThreshold
        && !hasMeleeOriginalVisibilityLock(attackerTrackingId)
        && !(activeMeleeAnimations.get(attackerTrackingId)?.size));

    if (isCloseRangeCharge && originalRecoveryWasActive) {
        cancelMeleeOriginalRecovery(attackerTrackingId, true);
        visibleSpriteOpacity = 1;
    }

    let clone = null;
    let trail = null;
    if (!isCloseRangeCharge) {
        const meleeAnimationId = ++meleeAnimationSequence;
        const neutralCloneSource = getNeutralMeleeCloneSource(attackerCanvas);
        clone = saved?.cloneId && document.getElementById(saved.cloneId) || document.createElement("canvas");
        clone.getAnimations().forEach(a => a.cancel());
        clone.width = attackerCanvas.width;
        clone.height = attackerCanvas.height;
        clone.id = saved?.cloneId || `meleeClone_${attacker.id}_${target.id}_${meleeAnimationId}`;

        if (isAmbidextry) {
            clone.classList.add("ambidextry-aura", "ambidextry-melee-clone");
        }

        Object.assign(clone.style, {
            position: "absolute",
            left: `${startX - attackerRect.width / 2}px`,
            top: `${startY - attackerRect.height / 2}px`,
            width: `${attackerRect.width}px`,
            height: `${attackerRect.height}px`,
            zIndex: "9999",
            pointerEvents: "none",
            transform: "translate3d(0, 0, 0) scale(1)",
            opacity: "0",
            willChange: "transform, opacity",
            filter: isAmbidextry
                ? "drop-shadow(0 0 7px rgba(237,255,0,0.9)) drop-shadow(0 0 15px rgba(237,255,0,0.55)) brightness(1.22)"
                : "none",
            mixBlendMode: "normal",
            animation: "none",
            transition: "none",
            imageRendering: getComputedStyle(attackerCanvas).imageRendering || "auto",
        });

        fxContainer.appendChild(clone);

        try {
            const ctx = clone.getContext("2d");
            ctx.clearRect(0, 0, clone.width, clone.height);

            if (isSideB) {
                ctx.save();
                ctx.translate(clone.width, 0);
                ctx.scale(-1, 1);
                ctx.drawImage(neutralCloneSource, 0, 0, clone.width, clone.height);
                ctx.restore();
            } else {
                ctx.drawImage(neutralCloneSource, 0, 0, clone.width, clone.height);
            }
        } catch (error) {
            console.error("Erreur dessin sprite :", error);
        }

        // Apparition instantanée : le clone passe de 0 à 1 sans fondu.
        clone.style.opacity = "1";

        trail = saved?.trailId && document.getElementById(saved.trailId) || acquireMeleeTrail(fxContainer);
        trail.id ||= `meleeTrail_${clone.id}`;
        // Only restored DOM can carry animations not owned by this run.
        if (saved?.trailId) trail.getAnimations().forEach(a => a.cancel());
        const trailTone = colorMeleeTrail(trail, trailNatures);
        if (isAmbidextry) {
            trail.classList.add("ambidextry-melee-trail");
            trail.style.boxShadow = `0 0 14px ${trailTone.color}6b`;
        }
        trail.style.zIndex = String(
            Math.max(0, (Number.parseInt(clone.style.zIndex, 10) || 9999) - 1)
        );
        const trailWidth = Math.min(
            176,
            Math.max(
                60,
                attackerRect.width * (1.1 + longTravelFactor * 0.55)
            )
        );
        const trailHeight = Math.min(
            20,
            Math.max(
                8,
                attackerRect.height * (0.14 + longTravelFactor * 0.04)
            )
        );
        Object.assign(trail.style, {
            left: `${startX - trailWidth}px`,
            top: `${startY - trailHeight / 2}px`,
            width: `${trailWidth}px`,
            height: `${trailHeight}px`,
        });
    }
    let deltaX = 0;
    let deltaY = 0;
    let chargeAnimation = null;
    let cloneAnimation = null;
    let cloneFadeAnimation = null;
    let trailAnimation = null;
    let trailFadeAnimation = null;
    let impactRevealAnimation = null;
    let impactFxLayer = null;
    let chargeAnimationEndAt = 0;
    let cloneAnimationEndAt = 0;
    let originalVisibilityToken = null;
    let deathObserver = null;
    let deathWatchFrame = 0;
    let deathAbortInProgress = false;
    let cleaned = false;
    let trajectoryActive = true;
    let impactArrivalReady = false;
    let impactOutcome = saved?.impactOutcome ?? null;
    let impactPlayed = false;
    let meleeController = null;
    let impactStartSettled = false;
    let resolveImpactStart = null;
    const impactStartPromise = new Promise((resolve) => {
        resolveImpactStart = resolve;
    });
    const scheduledTimeouts = new Set();
    const targetPrefix = getBattleEntityDomPrefix(target);
    const targetTrackingKey = `${targetPrefix}:${String(target.id)}`;

    const settleImpactStart = (value = false) => {
        if (impactStartSettled) return;
        impactStartSettled = true;
        resolveImpactStart?.(value);
    };

    const getCloseRangeTransform = (
        progress,
        scaleX = 1,
        scaleY = 1,
        rotation = 0
    ) => {
        const localX = isSideB ? -deltaX : deltaX;
        const localRotation = isSideB ? -rotation : rotation;
        return `translate3d(${localX * progress}px, ${deltaY * progress}px, 0) rotate(${localRotation}deg) scaleX(${scaleX}) scaleY(${scaleY})`;
    };
    const getChargeEndTransform = () => isCloseRangeCharge
        ? getCloseRangeTransform(0.18, 1.035, 1.02)
        : `translate3d(${(isSideB ? -deltaX : deltaX) * 0.4}px, ${deltaY * 0.4}px, 0) scale(1.06)`;
    const getCloseRangeImpactTransform = () =>
        getCloseRangeTransform(0.62, 1.08, 0.96);
    const getCloneTravelTransform = (progress, scale = scaleBase) => {
        return `translate3d(${deltaX * progress}px, ${deltaY * progress}px, 0) scale(${scale})`;
    };
    const getCloneEndTransform = () =>
        `translate3d(${deltaX}px, ${deltaY}px, 0) scale(${scaleBase * 1.1})`;
    const getTrailTransform = (progress, stretch = 1) => {
        const angle = Math.atan2(deltaY, deltaX) * 180 / Math.PI;
        return `translate3d(${deltaX * progress}px, ${deltaY * progress}px, 0) rotate(${angle}deg) scaleX(${stretch})`;
    };

    const schedule = (callback, delay) => {
        if (replaying) {
            const at = replayTime + delay;
            if (at <= elapsed) { replayQueue.push({ callback, at }); return null; }
            delay = at - elapsed;
        }
        const timeoutId = setTimeout(() => {
            scheduledTimeouts.delete(timeoutId);
            callback();
        }, delay);
        scheduledTimeouts.add(timeoutId);
        return timeoutId;
    };

    const attackerBox = document.getElementById(`Box_Entite_${attacker.id}`);
    const getCurrentAttackerSprite = () =>
        document.getElementById(`DragSprite_${attacker.id}`)
        || (sprite.isConnected ? sprite : null);
    const getCurrentAttackerCanvas = () =>
        document.getElementById(`spriteCanvas_${attacker.id}`)
        || (attackerCanvas.isConnected ? attackerCanvas : null);
    const attackerIsDead = () => {
        const currentBox = document.getElementById(`Box_Entite_${attacker.id}`)
            || attackerBox;
        const currentSprite = getCurrentAttackerSprite();
        const currentCanvas = getCurrentAttackerCanvas();
        const currentSpriteContainer = document.getElementById(
            `spriteContainer_${attacker.id}`
        );

        return Boolean(
            attacker.isDEAD
            || currentBox?.dataset.dead === "true"
            || currentSprite?.dataset.dead === "true"
            || currentCanvas?.dataset.dead === "true"
            || currentSprite?.classList.contains("dead-sprite")
            || currentCanvas?.classList.contains("dead-sprite")
            || currentCanvas?.classList.contains("dead")
            || currentSpriteContainer?.querySelector?.(".dead-sprite, canvas.dead")
        );
    };

    const forceDeadMeleeVisualVisible = () => {
        const currentSprite = getCurrentAttackerSprite();
        const currentCanvas = getCurrentAttackerCanvas();

        for (const element of [currentSprite, currentCanvas]) {
            if (!element?.isConnected) continue;
            element.hidden = false;
            element.style.opacity = "1";
            element.style.visibility = "visible";
            if (element.style.display === "none") element.style.display = "";
        }
    };

    const startOriginalRecoveryAfterPreparation = () => {
        trajectoryActive = false;
        if (isCloseRangeCharge || !originalVisibilityToken) return false;

        // Même ordre que dans la version de référence : aucune animation
        // précédente ne doit rester propriétaire de l’opacité au retour.
        chargeAnimation?.cancel();
        chargeAnimation = null;
        chargeAnimationEndAt = 0;
        impactRevealAnimation?.cancel();
        impactRevealAnimation = null;

        const originalStillHidden = releaseMeleeOriginalVisibility(
            attackerTrackingId,
            originalVisibilityToken,
            false,
            true
        );
        originalVisibilityToken = null;

        if (originalStillHidden) return false;

        const currentSprite = getCurrentAttackerSprite();
        if (currentSprite === sprite) {
            sprite.style.transform = previousSpriteTransform || "";
            sprite.style.transition = previousSpriteTransition || "";
            sprite.style.willChange = previousSpriteWillChange || "";
        }

        if (attackerIsDead()) {
            cancelMeleeOriginalRecovery(attackerTrackingId, true);
            forceDeadMeleeVisualVisible();
        } else if (currentSprite?.isConnected) {
            startMeleeOriginalRecovery(
                attackerTrackingId,
                currentSprite,
                originalRecoveryDuration,
                replaying ? { startTime: visualStartedAt + replayTime } : null
            );
        }
        return true;
    };

    const cleanup = (restoreOriginal = true) => {
        if (cleaned) return;
        cleaned = true;
        settleImpactStart(false);

        for (const timeoutId of scheduledTimeouts) clearTimeout(timeoutId);
        scheduledTimeouts.clear();

        chargeAnimation?.cancel();
        cloneAnimation?.cancel();
        cloneFadeAnimation?.cancel();
        trailAnimation?.cancel();
        trailFadeAnimation?.cancel();
        impactRevealAnimation?.cancel();
        releaseMeleeImpactFx(impactFxLayer);
        impactFxLayer = null;

        unregisterActiveMeleeAnimation(attackerTrackingId, meleeController);

        unregisterProjectileFollower(targetTrackingKey, meleeFollower);
        deathObserver?.disconnect();
        deathObserver = null;
        if (deathWatchFrame && typeof cancelAnimationFrame === "function") {
            cancelAnimationFrame(deathWatchFrame);
            deathWatchFrame = 0;
        }

        const dead = attackerIsDead();
        let originalStillHidden = hasMeleeOriginalVisibilityLock(attackerTrackingId);
        if (dead) {
            originalStillHidden = releaseMeleeOriginalVisibility(
                attackerTrackingId,
                originalVisibilityToken,
                true
            );
        } else if (originalVisibilityToken) {
            originalStillHidden = releaseMeleeOriginalVisibility(
                attackerTrackingId,
                originalVisibilityToken
            );
        }
        originalVisibilityToken = null;

        // Restore the current DOM sprite, not only the node captured before a
        // possible death rerender. This keeps replacement corpse canvases visible.
        const currentSprite = getCurrentAttackerSprite();
        const originalRecoveryActive =
            meleeOriginalRecoveryAnimations.has(attackerTrackingId);
        if (currentSprite?.isConnected) {
            if (currentSprite === sprite) {
                sprite.style.transform = previousSpriteTransform || "";
                // Ne surtout pas réactiver une transition CSS pendant le 0 -> 1 CAC.
                // startMeleeOriginalRecovery la restaurera lui-même APRES avoir verrouillé opacity à 1.
                if (!originalRecoveryActive) {
                    sprite.style.transition = previousSpriteTransition || "";
                }
                sprite.style.willChange = previousSpriteWillChange || "";
            }

            if (dead) currentSprite.style.setProperty("opacity", "1", "important");
            else if (!isCloseRangeCharge && !originalStillHidden) {
                // Ne jamais couper le fondu de 350 ms sur une attaque rapide.
                // Sans fondu actif, la sortie reste malgré tout garantie à 1.
                if (
                    !meleeOriginalRecoveryAnimations.has(attackerTrackingId)
                    && !isMeleePostRecoveryOpacityLocked(currentSprite)
                ) {
                    currentSprite.style.opacity = "1";
                }
            } else if (isCloseRangeCharge && !originalStillHidden) {
                currentSprite.style.opacity = previousSpriteOpacity || "";
            }

            if (!dead) {
                if (restoreOriginal && !originalStillHidden && !originalRecoveryActive) {
                    currentSprite.classList.add("iddle");
                } else {
                    currentSprite.classList.remove("iddle");
                }
            }
        }

        clone?.remove();
        releaseMeleeTrail(trail, true);

        if (dead) {
            forceDeadMeleeVisualVisible();
            if (typeof requestAnimationFrame === "function") {
                requestAnimationFrame(forceDeadMeleeVisualVisible);
            }
            setTimeout(forceDeadMeleeVisualVisible, 50);
        }
    };

    const abortMeleeCloneOnDeath = () => {
        if (cleaned || deathAbortInProgress) return;
        const frozenTransform = clone?.isConnected ? getComputedStyle(clone).transform : null;
        deathAbortInProgress = true;
        trajectoryActive = false;
        settleImpactStart(false);

        for (const timeoutId of scheduledTimeouts) clearTimeout(timeoutId);
        scheduledTimeouts.clear();
        unregisterProjectileFollower(targetTrackingKey, meleeFollower);

        chargeAnimation?.cancel();
        chargeAnimation = null;
        cloneAnimation?.cancel();
        cloneAnimation = null;
        trailAnimation?.cancel();
        trailAnimation = null;
        trailFadeAnimation?.cancel();
        trailFadeAnimation = null;
        impactRevealAnimation?.cancel();
        impactRevealAnimation = null;

        if (trail) {
            trail.style.opacity = "0";
            releaseMeleeTrail(trail, true);
            trail = null;
        }

        if (clone?.isConnected && !isCloseRangeCharge) {
            cloneFadeAnimation?.cancel();
            forceDeadMeleeVisualVisible();
            finishMeleeCloneOnDeath(clone, frozenTransform).finally(() => cleanup(false));
            return;
        }
        cleanup(false);
    };

    meleeController = {
        flightId: options.flightId,
        snapshot: () => ({ attacker: attacker.id, target: target.id, isAmbidextry,
            options: { duration: baseDuration, flightId: options.flightId, attacknature: trailNatures },
            resume: { startedAt: visualStartedAt, cloneId: clone?.id, trailId: trail?.id,
                previousSpriteTransform, previousSpriteTransition, previousSpriteWillChange,
                previousSpriteOpacity, visibleSpriteOpacity, isCloseRangeCharge, impactOutcome,
                attackerRect: { left: attackerRect.left, top: attackerRect.top, width: attackerRect.width, height: attackerRect.height },
                initialTargetRect: { left: initialTargetRect.left, top: initialTargetRect.top, width: initialTargetRect.width, height: initialTargetRect.height } } }),
        cancel: () => cleanup(!attackerIsDead()),
        abortOnDeath: abortMeleeCloneOnDeath,
        resolveImpact(didHit) {
            if (cleaned) {
                settleImpactStart(false);
                return impactStartPromise;
            }
            if (impactPlayed) return impactStartPromise;
            impactOutcome = Boolean(didHit);
            if (impactArrivalReady) playResolvedImpact();
            return impactStartPromise;
        },
        waitForImpactStart: () => impactStartPromise,
        showOriginalForImpact(duration = 800) {
            if (!trajectoryActive || cleaned || attackerIsDead() || !sprite.isConnected) return false;
            if (isCloseRangeCharge) return false;

            impactRevealAnimation?.cancel();

            const safeDuration = Math.max(120, Number(duration) || 800);
            const translucentOpacity = Math.min(0.45, visibleSpriteOpacity * 0.45);
            const currentOpacity = Number.parseFloat(getComputedStyle(sprite).opacity) || 0;
            const startingOpacity = Math.min(translucentOpacity, currentOpacity);
            const originalTransform = previousSpriteTransform || "none";

            impactRevealAnimation = animate(sprite,
                [
                    {
                        transform: originalTransform,
                        opacity: String(startingOpacity),
                        offset: 0,
                    },
                    {
                        transform: originalTransform,
                        opacity: String(translucentOpacity),
                        offset: 0.12,
                    },
                    {
                        transform: originalTransform,
                        opacity: String(translucentOpacity),
                        offset: 0.72,
                    },
                    {
                        transform: originalTransform,
                        opacity: "0",
                        offset: 1,
                    },
                ],
                {
                    duration: safeDuration,
                    easing: "linear",
                }
            );

            const revealAnimation = impactRevealAnimation;
            const releaseReveal = () => {
                if (impactRevealAnimation === revealAnimation) {
                    impactRevealAnimation = null;
                }
            };
            revealAnimation.addEventListener("finish", releaseReveal, { once: true });
            revealAnimation.addEventListener("cancel", releaseReveal, { once: true });
            return true;
        }
    };

    registerActiveMeleeAnimation(attackerTrackingId, meleeController);

    const meleeFollower = {
        getTargetElement: getCurrentMeleeTargetCanvas,
        refreshTargetPosition(timestamp = clockNow()) {
            const currentTargetCanvas = getCurrentMeleeTargetCanvas();
            if (!currentTargetCanvas) return false;

            const currentTargetRect = screenEffectRect(currentTargetCanvas.getBoundingClientRect());
            const nextDeltaX = (
                currentTargetRect.left + currentTargetRect.width / 2 - startX
            );
            const nextDeltaY = (
                currentTargetRect.top + currentTargetRect.height / 2 - startY
            );

            const targetMoved =
                Math.abs(nextDeltaX - deltaX) > 0.5 ||
                Math.abs(nextDeltaY - deltaY) > 0.5;

            deltaX = nextDeltaX;
            deltaY = nextDeltaY;

            if (targetMoved && chargeAnimation && chargeAnimationEndAt > timestamp) {
                const currentStyle = getComputedStyle(sprite);
                const remainingDuration = Math.max(16, chargeAnimationEndAt - timestamp);

                chargeAnimation.cancel();
                chargeAnimation = animate(sprite,
                    [
                        {
                            transform: currentStyle.transform,
                            opacity: currentStyle.opacity,
                        },
                        {
                            transform: getChargeEndTransform(),
                            opacity: isCloseRangeCharge
                                ? String(visibleSpriteOpacity)
                                : "0",
                        },
                    ],
                    {
                        duration: remainingDuration,
                        easing: "cubic-bezier(0.8, 0, 0.2, 1)",
                        fill: "forwards",
                    }
                );
            }

            if (targetMoved && cloneAnimation && cloneAnimationEndAt > timestamp) {
                const trajectoryElement = isCloseRangeCharge ? sprite : clone;
                if (!trajectoryElement) return false;
                const currentStyle = getComputedStyle(trajectoryElement);
                const remainingDuration = Math.max(16, cloneAnimationEndAt - timestamp);

                cloneAnimation.cancel();
                const frames =
                    [
                        {
                            transform: currentStyle.transform,
                            opacity: currentStyle.opacity,
                        },
                        {
                            transform: isCloseRangeCharge
                                ? getCloseRangeImpactTransform()
                                : getCloneEndTransform(),
                            opacity: isCloseRangeCharge
                                ? String(visibleSpriteOpacity)
                                : "1",
                        },
                    ];
                cloneAnimation = isCloseRangeCharge
                    ? animate(trajectoryElement, frames, {
                        duration: remainingDuration,
                        easing: "cubic-bezier(0.12, 0.7, 0.18, 1)",
                        fill: "forwards",
                    })
                    : animateCloneTravel(trajectoryElement, frames, remainingDuration,
                        "cubic-bezier(0.12, 0.7, 0.18, 1)");

                if (trailAnimation) {
                    const currentTrailStyle = getComputedStyle(trail);
                    trailAnimation.cancel();
                    trailAnimation = animateCloneTravel(trail,
                        [
                            {
                                transform: currentTrailStyle.transform,
                                opacity: currentTrailStyle.opacity,
                            },
                            {
                                transform: getTrailTransform(1, 0.82),
                                opacity: "0.42",
                            },
                        ],
                        remainingDuration, "cubic-bezier(0.12, 0.7, 0.18, 1)"
                    );
                }

            }
            return true;
        }
    };

    meleeFollower.refreshTargetPosition();
    registerProjectileFollower(targetTrackingKey, target.id, meleeFollower);

    if (attackerIsDead()) {
        abortMeleeCloneOnDeath();
        return meleeController;
    }

    if (isCloseRangeCharge) {
        chargeAnimationEndAt = clockNow() + chargeDuration - (replaying ? elapsed - replayTime : 0);
        chargeAnimation = animate(sprite,
            [
                {
                    transform: previousSpriteTransform || "none",
                    opacity: String(visibleSpriteOpacity),
                    offset: 0,
                },
                {
                    transform: getChargeEndTransform(),
                    opacity: String(visibleSpriteOpacity),
                    offset: 0.72,
                },
                {
                    transform: getChargeEndTransform(),
                    opacity: String(visibleSpriteOpacity),
                    offset: 1,
                },
            ],
            {
                duration: chargeDuration,
                easing: "cubic-bezier(0.8, 0, 0.2, 1)",
                fill: "forwards",
            }
        );

        schedule(() => {
            if (cleaned || attackerIsDead() || !sprite.isConnected) {
                cleanup(false);
                return;
            }

            cloneAnimationEndAt = clockNow() + cloneDuration - (replaying ? elapsed - replayTime : 0);
            cloneAnimation = animate(sprite,
                [
                    {
                        transform: getChargeEndTransform(),
                        opacity: String(visibleSpriteOpacity),
                        offset: 0,
                    },
                    {
                        transform: getCloseRangeTransform(0.3, 1.04, 1),
                        opacity: String(visibleSpriteOpacity),
                        offset: 0.25,
                    },
                    {
                        transform: getCloseRangeTransform(0.5, 1.08, 0.96),
                        opacity: String(visibleSpriteOpacity),
                        offset: 0.7,
                    },
                    {
                        transform: getCloseRangeImpactTransform(),
                        opacity: String(visibleSpriteOpacity),
                        offset: 1,
                    },
                ],
                {
                    duration: cloneDuration,
                    easing: "cubic-bezier(0.2, 0.55, 0.55, 1)",
                    fill: "forwards",
                }
            );
        }, cloneStartDelay);
    } else {
        const tractionOpacity = 1 - longTravelFactor * 0.1;
        const burstEntryOpacity = Math.min(1, cruiseSpriteOpacity + 0.12);
        const decelerationMidOpacity = Math.min(1, cruiseSpriteOpacity + 0.06);
        const decelerationLateOpacity = Math.min(1, cruiseSpriteOpacity + 0.13);
        const settleOpacity = Math.min(1, cruiseSpriteOpacity + 0.22);
        const finalTrailOpacity = Math.min(0.92, speedTrailPeakOpacity * 1.06);
        const adaptiveMotionSamples = MELEE_CHARGE_MOTION_SAMPLES.map(
            ([offset, compactProgress, longProgress]) => [
                offset,
                compactProgress
                    + (longProgress - compactProgress) * longTravelFactor,
            ]
        );

        const cloneScaleStops = [
            [0, 1],
            [0.14, 1.045],
            [0.28, 0.96],
            [0.58, 1.04],
            [0.72, 1],
            [0.86, 0.97],
            [0.94, 0.94],
            [1, 1.1],
        ];
        const cloneOpacityStops = [
            [0, 1],
            [0.14, tractionOpacity],
            [0.28, cruiseSpriteOpacity],
            [0.58, settleOpacity],
            [0.72, decelerationMidOpacity],
            [0.86, burstEntryOpacity],
            [0.94, decelerationLateOpacity],
            [1, 1],
        ];
        const trailStretchStops = [
            [0, 0.42],
            [0.14, 0.75],
            [0.28, speedTrailPeakStretch],
            [0.58, 0.62],
            [0.72, 0.86],
            [0.86, speedTrailPeakStretch * 0.9],
            [0.94, speedTrailPeakStretch * 1.08],
            [0.97, speedTrailPeakStretch * 1.18],
            [1, 0.62],
        ];
        const trailOpacityStops = [
            [0, 0.18],
            [0.14, 0.45],
            [0.28, speedTrailPeakOpacity * 0.9],
            [0.58, 0.36],
            [0.72, 0.52],
            [0.86, speedTrailPeakOpacity * 0.86],
            [0.94, speedTrailPeakOpacity],
            [0.97, finalTrailOpacity],
            [1, 0.32],
        ];

        const cloneMotionKeyframes = adaptiveMotionSamples.map(
            ([offset, progress]) => ({
                transform: getCloneTravelTransform(
                    progress,
                    interpolateMeleeMotionValue(offset, cloneScaleStops)
                ),
                opacity: String(
                    interpolateMeleeMotionValue(offset, cloneOpacityStops)
                ),
                offset,
                easing: "linear",
            })
        );
        const trailMotionKeyframes = adaptiveMotionSamples.map(
            ([offset, progress]) => ({
                transform: getTrailTransform(
                    progress,
                    interpolateMeleeMotionValue(offset, trailStretchStops)
                ),
                opacity: String(
                    interpolateMeleeMotionValue(offset, trailOpacityStops)
                ),
                offset,
                easing: "linear",
            })
        );

        cloneAnimationEndAt = clockNow() + baseDuration - (replaying ? elapsed - replayTime : 0);
        cloneAnimation = animateCloneTravel(clone,
            cloneMotionKeyframes,
            baseDuration, "linear"
        );

        trailAnimation = animateCloneTravel(trail,
            trailMotionKeyframes,
            baseDuration, "linear"
        );

        originalVisibilityToken = acquireMeleeOriginalVisibility(
            attackerTrackingId,
            sprite
        );

        schedule(() => {
            if (cleaned || attackerIsDead()) {
                cleanup(false);
                return;
            }
            startOriginalRecoveryAfterPreparation();
        }, chargeDuration);
    }

    function playResolvedImpact() {
        if (cleaned || impactPlayed || !impactArrivalReady || impactOutcome === null) return;
        impactPlayed = true;
        settleImpactStart(impactOutcome);
        trajectoryActive = false;
        unregisterProjectileFollower(targetTrackingKey, meleeFollower);
        const resolvedImpactDuration = impactOutcome
            ? impactDuration
            : Math.max(90, impactDuration * 0.75);
        const impactElapsed = Math.max(0, clockNow() - visualStartedAt - baseDuration);
        if (impactElapsed >= resolvedImpactDuration) {
            // Damage has its own lifetime. A late result still applies in the
            // engine, but must not replay an expired visual over newer attacks.
            cleanup(!attackerIsDead());
            return;
        }

        if (!isCloseRangeCharge) {
            sprite.style.transform = previousSpriteTransform || "";
        }
        chargeAnimation?.cancel();
        chargeAnimation = null;

        const distance = Math.hypot(deltaX, deltaY) || 1;
        const unitX = deltaX / distance;
        const unitY = deltaY / distance;
        if (impactOutcome) {
            const sideRotation = unitX < 0 ? 1 : -1;
            const targetImpactElement = document.getElementById(`Animationsprite_${target.id}`)
                || document.getElementById(`spriteContainer_${target.id}`)
                || getCurrentMeleeTargetCanvas();

            impactFxLayer = playMeleeImpactFx(
                fxContainer,
                targetImpactElement,
                startX + deltaX,
                startY + deltaY,
                unitX,
                unitY,
                impactDuration,
                impactElapsed
            );

            if (isCloseRangeCharge) {
                cloneFadeAnimation = animate(sprite,
                    [
                        {
                            transform: getCloseRangeImpactTransform(),
                            opacity: String(visibleSpriteOpacity),
                            offset: 0,
                        },
                        {
                            transform: getCloseRangeTransform(0.68, 0.68, 1.22),
                            opacity: String(visibleSpriteOpacity),
                            offset: 0.14,
                        },
                        {
                            transform: getCloseRangeTransform(0.24, 1.12, 0.9, -5),
                            opacity: String(visibleSpriteOpacity),
                            offset: 0.46,
                        },
                        {
                            transform: getCloseRangeTransform(0.08, 0.98, 1.03, 2),
                            opacity: String(visibleSpriteOpacity),
                            offset: 0.8,
                        },
                        {
                            transform: previousSpriteTransform || "none",
                            opacity: String(visibleSpriteOpacity),
                            offset: 1,
                        },
                    ],
                    {
                        duration: impactDuration,
                        easing: "cubic-bezier(0.17, 0.67, 0.22, 1.25)",
                        fill: "forwards",
                    }
                );
            } else {
                cloneFadeAnimation = animate(clone,
                    [
                        { transform: getCloneEndTransform(), opacity: "1", offset: 0 },
                        {
                            transform: `translate3d(${deltaX + unitX * 10}px, ${deltaY + unitY * 10}px, 0) scaleX(${scaleBase * 0.25}) scaleY(${scaleBase * 1.55})`,
                            opacity: "1",
                            offset: 0.14,
                        },
                        {
                            transform: `translate3d(${deltaX - unitX * 28}px, ${deltaY - unitY * 28}px, 0) rotate(${sideRotation * 12}deg) scaleX(${scaleBase * 1.18}) scaleY(${scaleBase * 0.85})`,
                            opacity: "1",
                            offset: 0.46,
                        },
                        {
                            transform: `translate3d(${deltaX - unitX * 10}px, ${deltaY - unitY * 10}px, 0) rotate(${sideRotation * -3}deg) scale(${scaleBase})`,
                            opacity: "0.9",
                            offset: 0.8,
                        },
                        {
                            transform: `translate3d(${deltaX - unitX * 9}px, ${deltaY - unitY * 9}px, 0) scale(${scaleBase})`,
                            opacity: "0",
                            offset: 1,
                        },
                    ],
                    {
                        duration: impactDuration,
                        easing: "cubic-bezier(0.17, 0.67, 0.22, 1.25)",
                        fill: "forwards",
                    }
                );
            }
        } else {
            if (isCloseRangeCharge) {
                cloneFadeAnimation = animate(sprite,
                    [
                        {
                            transform: getCloseRangeImpactTransform(),
                            opacity: String(visibleSpriteOpacity),
                        },
                        {
                            transform: getCloseRangeTransform(0.28, 1.02, 0.98),
                            opacity: String(visibleSpriteOpacity),
                            offset: 0.45,
                        },
                        {
                            transform: previousSpriteTransform || "none",
                            opacity: String(visibleSpriteOpacity),
                        },
                    ],
                    {
                        duration: resolvedImpactDuration,
                        easing: "ease-out",
                        fill: "forwards",
                    }
                );
            } else {
                cloneFadeAnimation = animate(clone,
                    [
                        { transform: getCloneEndTransform(), opacity: "1" },
                        {
                            transform: `translate3d(${deltaX + unitX * 26}px, ${deltaY + unitY * 26}px, 0) scale(${scaleBase})`,
                            opacity: "0",
                        },
                    ],
                    {
                        duration: resolvedImpactDuration,
                        easing: "linear",
                        fill: "forwards",
                    }
                );
            }
        }

        if (trail) {
            const trailStyleAtImpact = getComputedStyle(trail);
            trailAnimation?.cancel();
            trailFadeAnimation = animate(trail,
                [
                    {
                        transform: trailStyleAtImpact.transform,
                        opacity: trailStyleAtImpact.opacity,
                    },
                    {
                        transform: getTrailTransform(1, 0.45),
                        opacity: "0",
                    },
                ],
                {
                    duration: Math.max(80, impactDuration * 0.7),
                    easing: "ease-out",
                    fill: "forwards",
                }
            );
        }
        if (impactElapsed > 0) {
            cloneFadeAnimation.currentTime = impactElapsed;
            if (trailFadeAnimation) trailFadeAnimation.currentTime = impactElapsed;
        }
        schedule(() => cleanup(!attackerIsDead()), replaying
            ? resolvedImpactDuration
            : resolvedImpactDuration - impactElapsed);
    }

    schedule(() => {
        if (cleaned || attackerIsDead()) {
            cleanup(false);
            return;
        }
        impactArrivalReady = true;
        playResolvedImpact();
    }, baseDuration);

    schedule(() => {
        if (!impactPlayed && !cleaned) {
            impactOutcome = false;
            impactArrivalReady = true;
            playResolvedImpact();
        }
    }, baseDuration + impactResolutionGrace);

    if (attackerBox && typeof MutationObserver !== "undefined") {
        deathObserver = new MutationObserver(() => {
            if (attackerIsDead()) abortMeleeCloneOnDeath();
        });
        deathObserver.observe(attackerBox, {
            attributes: true,
            attributeFilter: ["data-dead"]
        });
    }

    if (typeof requestAnimationFrame === "function") {
        const watchAttackerDeath = () => {
            if (cleaned || deathAbortInProgress) return;
            if (attackerIsDead()) {
                abortMeleeCloneOnDeath();
                return;
            }
            deathWatchFrame = requestAnimationFrame(watchAttackerDeath);
        };
        deathWatchFrame = requestAnimationFrame(watchAttackerDeath);
    }
    while (replayQueue.length) {
        replayQueue.sort((a, b) => a.at - b.at);
        const next = replayQueue.shift(); replayTime = next.at; next.callback();
    }
    replaying = false;
    return meleeController;
}
export function RunawayAnimation(entite) {
    const imgContainer = document.getElementById(`imgContainer_${entite.id}`);
    const sprite = document.getElementById(`DragSprite_${entite.id}`);
    let effectsContainer = document.getElementById(`effectsContainer_${entite.id}`);

    if (!sprite || !imgContainer) {
        console.warn(`⚠️ Élément manquant pour ${entite.name} (${entite.id})`);
        return;
    }

    if (!effectsContainer) {
        console.warn(`⚠️ #effectsContainer_${entite.id} introuvable. Création.`);
        effectsContainer = document.createElement("div");
        effectsContainer.id = `effectsContainer_${entite.id}`;
        effectsContainer.className = "effects-container";
        sprite.parentNode?.appendChild(effectsContainer);
    }

    imgContainer.classList.add("flip-horizontal");

    sprite.classList.remove("iddle");
    sprite.classList.add("runaway");

    let recoveryGif = effectsContainer.querySelector(".recoveryGif");

    if (!recoveryGif) {
        recoveryGif = document.createElement("img");
        recoveryGif.className = "recoveryGif";
        recoveryGif.style.opacity = "1";
        effectsContainer.appendChild(recoveryGif);
    }

    playCachedGif(recoveryGif, `./media/assets/effects/recovery.gif`);

    sprite.classList.add("runaway-animate");
}

export function runawayInfosBulle(entite, type) {
    const effectsContainer = document.getElementById(`effectsContainer_${entite.id}`);
    const statusBar = document.getElementById(`statusBar_${entite.id}`);

    if (!effectsContainer) {
        console.warn(`⚠️ effectsContainer introuvable pour ${entite.name}`);
        return;
    }

    if (!statusBar) {
        console.warn(`⚠️ statusBar introuvable pour ${entite.name}`);
        return;
    }

    // Supprime l'ancienne bulle si présente
    const existingInfo = effectsContainer.querySelector('.runaway-info');
    if (existingInfo) existingInfo.remove();

    // Supprime les anciens textes de fuite
    const existingText = statusBar.querySelector('.hudbattletexte.runaway');
    if (existingText) existingText.remove();

    const infoBulle = document.createElement("div");
    infoBulle.classList.add("runaway-info");

    if (['preparation', 'fail', 'success'].includes(type)) {
        infoBulle.classList.add(type);
    } else {
        console.warn(`⚠️ Type inconnu dans runawayInfosBulle : ${type}`);
    }

    effectsContainer.appendChild(infoBulle);

    // === Création du texte HUD ===
    const texteRunaway = document.createElement("div");
    texteRunaway.classList.add("hudbattletexte", "runaway");
    texteRunaway.innerText = {
        preparation: "Fuite en cours...",
        fail: "Fuite échouée !",
        success: "Fuite réussie !"
    }[type] || "";
    statusBar.appendChild(texteRunaway);

    // === Nettoyage ===
    if (type === 'fail') {
        setTimeout(() => {
            infoBulle.remove();
            texteRunaway.remove();
        }, 2500);
        removeCombatVisualAfter(infoBulle, 2500); removeCombatVisualAfter(texteRunaway, 2500);
    }

    if (type === 'success') {
        const duration = entite.runawayLoopRecuperation || Number(getSafe(entite, "speed", 1000)) || 1000;
        setTimeout(() => {
            infoBulle.remove();
            texteRunaway.remove();
        }, duration);
    }

    if (type === 'preparation' || type === 'success') {
        const checkInterval = setInterval(() => {
            if (entite.isDEAD || !infoBulle.isConnected || !texteRunaway.isConnected) {
                infoBulle.remove();
                texteRunaway.remove();
                clearInterval(checkInterval);
            }
        }, 200);
    }
}


export function playRunawaySuccessAnimation() {
    // 1. Afficher le message
    const message = document.createElement('div');
    message.textContent = 'Fuite réussie !';
    message.classList.add('IngameAlert', 'runaway-msg');
    ensureGameShell().appendChild(message);

    // 2. Attendre 2 secondes
    setTimeout(() => {
        // 3. Créer le fond noir
        const overlay = document.createElement('div');
        overlay.classList.add('fade-to-black');
        ensureGameShell().appendChild(overlay);

        // 4. Supprimer le message de fuite
        message.remove();

        // 5. Attendre que le fondu soit terminé (1s) avant de quitter le niveau
        setTimeout(() => {
            QuitCurrentLevel();

            // 6. Faire disparaître le fond noir avec fondu
            overlay.classList.add('fade-out');
           setTimeout(() => {
    overlay.remove();
}, 2000);
 }, 1000); // Fin du fondu noir (1s)
 }, 2000); // Délai après affichage du message (2s)
}

export function orderAnimation(entite, saved = null) {
    entite.stopOrderAnimation?.();
    const effects = document.getElementById(`effectsContainer_${entite.id}`);
    if (!effects) return;
    const run = beginCanvasRun('orderAnimation', entite.id, {}, saved);
    const endAt = saved?.state.endAt ?? clockNow() + (entite.orderDecisionTimer || 2000);
    let visible = saved?.state.visible ?? false;
    let exclamation = saved && effects.querySelector('.order-exclamation');
    if (!exclamation) {
        exclamation = document.createElement('div'); exclamation.className = 'order-exclamation';
        exclamation.textContent = '!'; effects.append(exclamation);
    }
    const canvas = document.getElementById(`spriteCanvas_${entite.id}`), ctx = canvas?.getContext('2d');
    if (canvas && !originalImages.has(canvas)) originalImages.set(canvas, createCanvasSnapshot(canvas));
    const interval = setIntervalFrom(() => {
        if (canvas && ctx) {
            if (visible) restoreCanvasSnapshot(canvas, ctx, originalImages.get(canvas));
            else entiteTinter(canvas, '255, 255, 255', 0.3);
            visible = !visible;
        }
    }, 80, saved?.pulseRemaining ?? 80);
    run.capture = () => ({ endAt, visible }); run.pulseRemaining = () => remainingCombatTimer(interval);
    const sprite = document.getElementById(`DragSprite_${entite.id}`);
    sprite?.classList.remove('iddle'); sprite?.classList.add('order');
    removeCombatVisualAfter(exclamation, Math.max(0, endAt - clockNow()));
    const timeout = setTimeout(() => stop(), Math.max(0, endAt - clockNow()));
    function stop() {
        clearTimeout(timeout);
        clearInterval(interval); finishCanvasRun(run);
        if (canvas && ctx) restoreCanvasSnapshot(canvas, ctx, originalImages.get(canvas));
        exclamation.remove();
        sprite?.classList.remove('order');
        if (entite.stopOrderAnimation === stop) delete entite.stopOrderAnimation;
    }
    entite.stopOrderAnimation = stop;
    return stop;
}
export function animateMysticism(targetId, tranceDuration, saved = null) {
  const visualRun = beginCanvasRun('animateMysticism', targetId, { tranceDuration }, saved);
  const safeTranceDuration = Number(tranceDuration) || 0;

  if (safeTranceDuration <= 0) {
    console.warn(`⚠️ Durée Mysticisme invalide pour ${targetId} : ${tranceDuration}`);
    return null;
  }

  const canvas = document.getElementById(`spriteCanvas_${targetId}`);

  if (!canvas) {
    console.warn(`⚠️ Canvas non trouvé pour Mysticisme : ${targetId}`);
    return null;
  }

  const ctx = canvas.getContext("2d");

  if (!ctx) {
    console.error(`❌ Impossible d'obtenir le contexte 2D pour Mysticisme : ${targetId}`);
    return null;
  }

  if (!originalImages.has(canvas)) {
    originalImages.set(canvas, createCanvasSnapshot(canvas));
  }

  const sprite = document.getElementById(`DragSprite_${targetId}`);

  let effectsContainer = document.getElementById(`effectsContainer_${targetId}`);

  if (!effectsContainer) {
    if (!sprite || !sprite.parentNode) {
      console.warn(`⚠️ Impossible de créer effectsContainer pour Mysticisme : ${targetId}`);
      return null;
    }

    effectsContainer = document.createElement("div");
    effectsContainer.id = `effectsContainer_${targetId}`;
    effectsContainer.className = "effects-container";
    sprite.parentNode.appendChild(effectsContainer);
  }

const entryDuration = 50;
const entryStartTime = saved?.state?.entryStartTime ?? (clockNow());
const maxEntryOpacity = 0.6;
const tranceTintMinOpacity = 0.16;
const tranceTintMaxOpacity = 0.34;
const fadeOutDuration = 50;

  let stopped = false;
  let mysticismVFX = null;
  let autoStopTimeout = null;
  let fadeOutTimeout = null;
  let entryFrame = null;
  let tranceFrame = null;

  const previousFilter = saved?.state?.previousFilter ?? (canvas.style.filter);
const previousTransition = saved?.state?.previousTransition ?? (canvas.style.transition);
const previousWillChange = saved?.state?.previousWillChange ?? (canvas.style.willChange);
const previousCanvasTransform = saved?.state?.previousCanvasTransform ?? (canvas.style.transform);
const previousCanvasOpacity = saved?.state?.previousCanvasOpacity ?? (canvas.style.opacity);

  canvas.style.transition = "filter 0.2s ease-in-out";
  canvas.style.willChange = "filter, transform";

function restoreCanvasEffects() {
  releaseEntityTint(canvas, "mysticism");

  canvas.style.filter = previousFilter || "";
  canvas.style.transition = previousTransition || "";
  canvas.style.willChange = previousWillChange || "";
  canvas.style.opacity = previousCanvasOpacity || "1";
}

  function restoreMysticismMotion() {
    canvas.style.transform = previousCanvasTransform || "";
  }

  function removeExistingMysticismVFX() {
    const existingMysticismVFX = effectsContainer.querySelector(".effect-vfx.mysticism");

    if (existingMysticismVFX) {
      clearTimeout(existingMysticismVFX._mysticismTO);
      existingMysticismVFX.remove();
    }
  }

  function stopMysticismVFX(withFade = true) {
    finishCanvasRun(visualRun);
    if (stopped) return;
    stopped = true;

    if (entryFrame) {
      cancelAnimationFrame(entryFrame);
      entryFrame = null;
    }

    if (tranceFrame) {
      cancelAnimationFrame(tranceFrame);
      tranceFrame = null;
    }

    clearTimeout(autoStopTimeout);
    clearTimeout(fadeOutTimeout);

    restoreCanvasEffects();
    restoreMysticismMotion();

    if (!mysticismVFX || !mysticismVFX.parentNode) return;

    if (!withFade) {
      mysticismVFX.remove();
      return;
    }

    mysticismVFX.classList.remove("mysticism-pop");
    mysticismVFX.classList.add("mysticism-fade-out");

    fadeOutTimeout = setTimeout(() => {
      if (mysticismVFX && mysticismVFX.parentNode) {
        mysticismVFX.remove();
      }
    }, fadeOutDuration);
  }

  function startMysticismVFX() {
    removeExistingMysticismVFX();

    mysticismVFX = document.createElement("img");
    playCachedGif(mysticismVFX, `./media/assets/effects/mysticism.gif`);
    mysticismVFX.className = "effect-vfx mysticism mysticism-pop";
    mysticismVFX.alt = "Transe mystique";
    mysticismVFX.style.position = "absolute";

    effectsContainer.appendChild(mysticismVFX);

mysticismVFX._mysticismTO = setTimeout(() => {
  stopMysticismVFX(false);
}, safeTranceDuration);
    autoStopTimeout = mysticismVFX._mysticismTO;

    console.log(
      `🔮 VFX Mysticisme lancé instantanément sur ${targetId} pendant ${safeTranceDuration}ms`
    );
  }

  function animateEntry(now) {
    if (stopped) return;

    const elapsed = now - entryStartTime;
    const progress = Math.min(elapsed / entryDuration, 1);

    const opacity = Math.sin(progress * Math.PI) * maxEntryOpacity;

    applyEntityTint(canvas, "mysticism", opacity);

    canvas.style.filter = `
      drop-shadow(0 0 ${8 + opacity * 12}px rgba(79, 112, 179, ${0.35 + opacity}))
      brightness(${1 + opacity * 0.35})
    `;

    if (progress < 1) {
      entryFrame = requestAnimationFrame(animateEntry);
      return;
    }
  }

  function animateTrance(now) {
    if (stopped) return;

    const elapsed = now - entryStartTime;

    if (elapsed >= safeTranceDuration) {
      return;
    }

    const blinkSpeed = 0.004;
    const pulseSpeed = 0.0035;

    const blink = (Math.sin(elapsed * blinkSpeed * Math.PI * 2) + 1) / 2;
    const pulse = (Math.sin(elapsed * pulseSpeed * Math.PI * 2) + 1) / 2;

    const opacity =
      tranceTintMinOpacity +
      blink * (tranceTintMaxOpacity - tranceTintMinOpacity);

    const scale = 1 - pulse * 0.1;

    applyEntityTint(canvas, "mysticism", opacity);

    canvas.style.filter = `
      drop-shadow(0 0 ${6 + opacity * 10}px rgba(79, 112, 179, ${0.25 + opacity}))
      brightness(${1 + opacity * 0.25})
    `;

    canvas.style.transform = `scale(${scale.toFixed(3)})`;

    tranceFrame = requestAnimationFrame(animateTrance);
  }

  if (saved) {
    mysticismVFX = effectsContainer.querySelector('.effect-vfx.mysticism');
    autoStopTimeout = setTimeout(() => stopMysticismVFX(false), Math.max(0, entryStartTime + safeTranceDuration - clockNow()));
  } else startMysticismVFX();
  visualRun.capture = () => ({ entryStartTime, previousFilter, previousTransition, previousWillChange, previousCanvasTransform, previousCanvasOpacity });
  entryFrame = requestAnimationFrame(animateEntry);
  tranceFrame = requestAnimationFrame(animateTrance);

  return stopMysticismVFX;
}
export function mysticismAttackGif(attackerId) {
  const sprite = document.getElementById(`DragSprite_${attackerId}`);

  if (!sprite) {
    console.warn(`⚠️ Sprite non trouvé pour mysticismAttackGif attackerId: ${attackerId}`);
    return;
  }

  let effectsContainer = document.getElementById(`effectsContainer_${attackerId}`);

  if (!effectsContainer) {
    if (!sprite.parentNode) {
      console.warn(`⚠️ Impossible de créer effectsContainer pour mysticismAttackGif : ${attackerId}`);
      return;
    }

    effectsContainer = document.createElement("div");
    effectsContainer.id = `effectsContainer_${attackerId}`;
    effectsContainer.className = "effects-container";
    sprite.parentNode.appendChild(effectsContainer);
  }

  const existingGif = effectsContainer.querySelector(".effect-vfx.mysticism-attack");

  if (existingGif) {
    existingGif.remove();
  }

  const isSideB =
    sprite.classList.contains("side-B") ||
    sprite.classList.contains("B") ||
    sprite.classList.contains("sideB");

  const gif = document.createElement("img");
  playCachedGif(gif, `./media/assets/effects/mysticism-attack.gif`);
  gif.className = "effect-vfx mysticism-attack";
  gif.alt = "";

  gif.style.position = "absolute";
  gif.style.pointerEvents = "none";

  if (isSideB) {
    gif.classList.add("side-b");
  }

  effectsContainer.appendChild(gif);

  setTimeout(() => {
    if (gif && gif.parentNode) {
      gif.remove();
    }
  }, 1500);
}
export function animateOccultism(targetId, saved = null) {
  const run = beginCanvasRun('animateOccultism', targetId, {}, saved);
  const canvas = document.getElementById(`spriteCanvas_${targetId}`);
  const sprite = document.getElementById(`DragSprite_${targetId}`);

  if (!canvas && !sprite) {
    console.warn(`⚠️ Aucun élément trouvé pour Occultisme : ${targetId}`);
    return null;
  }

  const previousSpriteFilter = saved?.state.previousSpriteFilter ?? (sprite?.style.filter || "");
  const previousSpriteTransition = saved?.state.previousSpriteTransition ?? (sprite?.style.transition || "");
  const previousSpriteWillChange = saved?.state.previousSpriteWillChange ?? (sprite?.style.willChange || "");

  let stopped = false;
  run.capture = () => ({ previousSpriteFilter, previousSpriteTransition, previousSpriteWillChange });

  if (sprite && !saved) {
    sprite.classList.add("occultism-invisible-visual");
    sprite.style.transition = "filter 0.15s ease-in-out, opacity 0.15s ease-in-out";
    sprite.style.willChange = "filter, opacity";
    sprite.style.filter = `${previousSpriteFilter} grayscale(1) saturate(0.25) brightness(0.75)`.trim();
  }

  if (canvas && !saved) {
    canvas.classList.add("occultism-invisible-visual");
    applyEntityTint(canvas, "occultism", 0.22);
  }

  return function stopOccultismAnimation() {
    if (stopped) return;
    stopped = true; finishCanvasRun(run);

    if (canvas) {
      releaseEntityTint(canvas, "occultism");
      canvas.classList.remove("occultism-invisible-visual");
    }

    if (sprite) {
      sprite.classList.remove("occultism-invisible-visual");
      sprite.style.filter = previousSpriteFilter;
      sprite.style.transition = previousSpriteTransition;
      sprite.style.willChange = previousSpriteWillChange;
    }
  };
}

export async function destructionItemAnimation({
  canvas = null,
  shakeTarget = null,
  impactDuration = 1000,
  tintName = 'damageImpact',
  tintOpacity = 0.6
} = {}) {
  const safeImpactDuration = Math.max(0, Number(impactDuration) || 0);
  const target = shakeTarget || canvas;
  let shakeAnimation = null;
  if (target?.animate && safeImpactDuration > 0) {
    const computedTransform = getComputedStyle(target).transform;
    const baseTransform = computedTransform === 'none' ? '' : computedTransform;
    const transformAt = (x = 0, y = 0, rotation = 0) => {
      const impactTransform = `translate3d(${x}px, ${y}px, 0) rotate(${rotation}deg)`;
      return baseTransform ? `${impactTransform} ${baseTransform}` : impactTransform;
    };
    shakeAnimation = target.animate([
      { transform: transformAt(0, 0, 0) },
      { transform: transformAt(-3, -1, -1.2) },
      { transform: transformAt(3, 1, 1.2) },
      { transform: transformAt(-4, 0, -1.5) },
      { transform: transformAt(4, -1, 1.5) },
      { transform: transformAt(-2, 1, -0.8) },
      { transform: transformAt(2, 0, 0.8) },
      { transform: transformAt(0, 0, 0) }
    ], {
      duration: safeImpactDuration,
      easing: 'linear',
      iterations: 1
    });
  }
  if (canvas && safeImpactDuration > 0) applyEntityTint(canvas, tintName, tintOpacity);
  await Promise.allSettled([
    shakeAnimation?.finished ?? Promise.resolve(),
    new Promise((resolve) => setTimeout(resolve, safeImpactDuration))
  ]);
  if (canvas) releaseEntityTint(canvas, tintName);
  return { completed: true, canvas, shakeTarget: target };
}

export function getMeleeFlightVisual(flightId) {
    return [...activeMeleeAnimations.values()].flatMap(set => [...set]).find(c => c.flightId === flightId);
}
registerCombatState('melee', () => ({
    active: [...activeMeleeAnimations.values()].flatMap(set => [...set]).map(c => c.snapshot()),
    recoveries: [...meleeOriginalRecoveryAnimations].map(([id, r]) => ({ id, startTime: r.startTime,
        duration: r.duration, previousTransition: r.previousTransition, previousTransitionPriority: r.previousTransitionPriority })),
}), (saved, { entities }) => {
    activeMeleeAnimations.clear(); meleeOriginalRecoveryAnimations.clear();
    for (const entry of saved.active) {
        const attacker = entities.find(e => e.id === entry.attacker), target = entities.find(e => e.id === entry.target);
        if (attacker && target) animationMelee(attacker, target, entry.isAmbidextry, { ...entry.options, resume: entry.resume });
    }
    for (const entry of saved.recoveries) {
        const sprite = document.getElementById(`DragSprite_${entry.id}`);
        if (sprite) startMeleeOriginalRecovery(entry.id, sprite, entry.duration, entry);
    }
});

registerCombatState('canvas-visuals', () => ({
    originals: [...document.querySelectorAll('canvas')].filter(c => c.id && originalImages.has(c)).map(c => ({
        id: c.id, image: originalImages.get(c).toDataURL(), tints: [...(activeEntityTints.get(c) || [])],
    })),
    runs: [...canvasRuns.values()].filter(r => r.capture && document.getElementById(`Box_Entite_${r.entityId}`)).map(r => ({ key: r.key, name: r.name,
        entityId: r.entityId, options: r.options, state: r.capture(), nextAt: r.nextAt, pulseRemaining: r.pulseRemaining?.() })),
}), async saved => {
    canvasRuns.clear();
    await Promise.all(saved.originals.map(async entry => {
        const canvas = document.getElementById(entry.id); if (!canvas) return;
        const image = new Image(); image.src = entry.image; await image.decode();
        const original = document.createElement('canvas'); original.width = image.naturalWidth; original.height = image.naturalHeight;
        original.getContext('2d').drawImage(image, 0, 0);
        originalImages.set(canvas, original); activeEntityTints.set(canvas, new Map(entry.tints));
    }));
    const functions = { damageImpact, brokenMagicImpact, mysticismBoostedAttackAnimation, damageArmorImpact,
        animateAmbidextry, shakeImpact, animateIndestructibility, animateEsoterism, animateAstrality, animateDodge };
    for (const run of saved.runs) {
        if (run.name === 'orderAnimation') orderAnimation({ id: run.entityId }, run);
        else if (run.name === 'animateOccultism') {
            const stop = animateOccultism(run.entityId, run);
            window.dispatchEvent(new CustomEvent('restoredOccultismAnimation', { detail: { entityId: run.entityId, stop } }));
        }
        else if (run.name === 'animateMysticism') {
            const stop = animateMysticism(run.entityId, run.options.tranceDuration, run);
            window.dispatchEvent(new CustomEvent('restoredMysticismAnimation', { detail: { entityId: run.entityId, stop } }));
        }
        else if (run.name === 'damageImpact') damageImpact(run.entityId, run.options, run);
        else functions[run.name]?.(run.entityId, run);
    }
});

for (const type of ['battleStopped', 'stageInterfaceClosing']) window.addEventListener(type, () => {
    for (const run of [...canvasRuns.values()]) run.stop?.();
    canvasRuns.clear();
});


// Presentation de la progression : ame, graphe et effets d'eveil.
// Ces effets d'interface utilisent globalThis pour rester independants de la pause du combat.
export function soulScaling(level) {
  const element = document.getElementById('eclipse');
  const soul = document.querySelector('.attribut-entitySoul');
  const soulTwo = document.querySelector('.attribut-entitySoul.two');

  // clamp 1..99
  level = Math.max(1, Math.min(100, level));
  const isMax = level === 100;

  const opacityMin = 0.6, opacityMax = 0.8;
  const scaleMin = 0.5, scaleMax = 0.9;

  // taille entitySoul
  const sizeMin = 30; // px
  const sizeMax = 85; // px
  const sizeMaxLevel99 = 125; // statut spécial level max

  // soulTwo scaling
  const soulTwoMin = 0.1;
  const soulTwoMax = 0.8;

  const ratio = (level - 1) / 98;

  const opacity = opacityMin + (opacityMax - opacityMin) * ratio;
  const scale = scaleMin + (scaleMax - scaleMin) * ratio;
  let size = sizeMin + (sizeMax - sizeMin) * ratio;

  // filter scaling (100% → 120%)
  const satPct = isMax ? 120 : 100 + 20 * ratio;
  const ctrPct = isMax ? 120 : 100 + 20 * ratio;

  const soulTwoValue = soulTwoMin + (soulTwoMax - soulTwoMin) * ratio;

  if (element) {
    element.style.opacity = (isMax ? opacityMax : opacity).toFixed(3);
    element.style.transform = `scale(${(isMax ? scaleMax : scale).toFixed(3)})`;
  }

  if (soul) {
    if (isMax) {
      soul.style.width = `${sizeMaxLevel99}px`;
      soul.style.height = `${sizeMaxLevel99}px`;
    } else {
      soul.style.width = `${size.toFixed(1)}px`;
      soul.style.height = `${size.toFixed(1)}px`;
    }
    soul.style.filter = `saturate(${satPct.toFixed(1)}%) contrast(${ctrPct.toFixed(1)}%)`;
  }

  if (soulTwo) {
    soulTwo.style.opacity = (isMax ? soulTwoMax : soulTwoValue).toFixed(3);
  }
}


function roundTripleTo100(fPct, aPct, iPct) {
  let f = Math.round(fPct), a = Math.round(aPct), i = Math.round(iPct);
  let corr = 100 - (f + a + i);
  if (corr !== 0) {
    const arr = [{k:'f',v:f},{k:'a',v:a},{k:'i',v:i}].sort((x,y)=>y.v-x.v);
    arr[0].v += corr; f = arr.find(x=>x.k==='f').v; a = arr.find(x=>x.k==='a').v; i = arr.find(x=>x.k==='i').v;
  }
  return { f, a, i };
}


function normalizeAngle(a) {
  // Ramène un angle dans [0, 2π)
  return (a + 2 * Math.PI) % (2 * Math.PI);
}


function drawRealtimegraph(ctx, strength, agility, intelligence, hoverSlice = null) {
  if (!ctx) return;
  const canvas = ctx.canvas;
  const total = strength + agility + intelligence;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (total <= 0) return;

  const { f, a, i } = roundTripleTo100(
    (strength / total) * 100,
    (agility / total) * 100,
    (intelligence / total) * 100
  );

  const sections = [
    { label: 'Force',        value: f, color: '#870000' },
    { label: 'Agilité',      value: a, color: '#ffde00' },
    { label: 'Intelligence', value: i, color: '#001a66' }
  ];

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const r  = Math.min(cx, cy) - 6;

  let currentAngle = -Math.PI / 2;

  sections.forEach(sec => {
    const slice = (sec.value / 100) * 2 * Math.PI;
    const start = currentAngle;
    const end   = currentAngle + slice;

    sec.start = normalizeAngle(start);
    sec.end   = normalizeAngle(end);

    ctx.save();

    // ⚡ Si hover actif et ce n’est PAS la portion survolée → désaturation
    if (hoverSlice && hoverSlice.label !== sec.label) {
      ctx.filter = "grayscale(100%)";
    }

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, start, end);
    ctx.closePath();
    ctx.fillStyle = sec.color;
    ctx.fill();

    ctx.restore();

    currentAngle = end;
  });

  // --- Tooltip ---
  let tooltip = document.querySelector('.graph-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.className = 'graph-tooltip';
    document.body.appendChild(tooltip);
  }

  canvas.onmousemove = e => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - cx;
    const y = e.clientY - rect.top - cy;
    const dist = Math.sqrt(x * x + y * y);

    if (dist <= r) {
      let ang = normalizeAngle(Math.atan2(y, x));

      const slice = sections.find(sec => {
        if (sec.start < sec.end) {
          return ang >= sec.start && ang < sec.end;
        } else {
          return ang >= sec.start || ang < sec.end;
        }
      });

      if (slice) {
        tooltip.textContent = buildStatGraphHelper(slice);
        tooltip.style.left = e.pageX + 10 + 'px';
        tooltip.style.top  = e.pageY + 10 + 'px';
        tooltip.style.display = 'block';

        // redraw en mode focus
        drawRealtimegraph(ctx, strength, agility, intelligence, slice);
        return;
      }
    }
    tooltip.style.display = 'none';
    drawRealtimegraph(ctx, strength, agility, intelligence, null);
  };

  canvas.onmouseleave = () => {
    tooltip.style.display = 'none';
    drawRealtimegraph(ctx, strength, agility, intelligence, null);
  };
}


function animateMilestone(jalonIndex, nodes) {
  const milestone = nodes.gauge.milestones.querySelector(
    `.milestone[data-index="${jalonIndex}"]`
  );
  if (!milestone) return;

  // Supprimons les anciens pulses éventuels
  milestone.querySelectorAll(".milestone-pulse").forEach(e => e.remove());

  // Ajoute le conteneur pulse
  const pulse = document.createElement("div");
  pulse.className = "milestone-pulse";
  milestone.appendChild(pulse);

  // Auto-suppression après animation
  globalThis.setTimeout(() => {
    pulse.remove();
  }, 650); // légèrement > durée de l’animation
}


export function updategraph(state, nodes) {
  const { strength, agility, intelligence } = state.stats;
  drawRealtimegraph(nodes.graphCtx, strength, agility, intelligence);

}


const extasisTimeoutsByEntity = new Map();


function noCacheSrc(path) {
  const salt = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${path}?v=${salt}`;
}


function clearExtasisForEntity(entite) {
  if (!entite || !entite.id) return;

  const soulSection = document.getElementById(`soul-section-${entite.id}`);
  if (soulSection) {
    soulSection.querySelectorAll('.awakening-frame-pending')
      .forEach(el => el.classList.remove('awakening-frame-pending'));
    // On ne retire que les containers d'animation
    soulSection
      .querySelectorAll('.awakening-animation-container')
      .forEach(el => el.remove());
  }

  const timeouts = extasisTimeoutsByEntity.get(entite.id) || [];
  timeouts.forEach(id => globalThis.clearTimeout(id));
  extasisTimeoutsByEntity.delete(entite.id);
}


export function playAwakeningExtasis(entite, { onReveal } = {}) {
  if (!entite || !entite.id) return;

  const soulSection = document.getElementById(`soul-section-${entite.id}`);
  if (!soulSection) return;

  // Nettoie toute ancienne animation pour CETTE entité
  clearExtasisForEntity(entite);

  // Container dédié à l’animation (seul élément supprimé à la fin)
  const wrapper = document.createElement('div');
  wrapper.className = 'awakening-animation-container';
  soulSection.appendChild(wrapper);

  const timeouts = [];
  const graphContainer = soulSection.querySelector('.attribut-graph-container');
  if (graphContainer) {
    graphContainer.classList.add('awakening-frame-pending');
    timeouts.push(globalThis.setTimeout(() => {
      if (!wrapper.isConnected) return;
      graphContainer.classList.remove('awakening-frame-pending');
      onReveal?.();
    }, 4000));
  }

  // 1) Premier GIF immédiatement (avec anti-cache)
  const gif1 = document.createElement('img');
  gif1.src = noCacheSrc('./media/assets/effects/extase-01.gif');
  gif1.className = 'extasis intro';
  wrapper.appendChild(gif1);

  // 2) Deuxième GIF très vite après (avec anti-cache)
  const timeoutSecondGif = globalThis.setTimeout(() => {
    if (!wrapper.isConnected) return;

    const gif2 = document.createElement('img');
    gif2.src = noCacheSrc('./media/assets/effects/extase-02.gif');
    gif2.className = 'extasis end';
    wrapper.appendChild(gif2);
  }, 1);
  timeouts.push(timeoutSecondGif);

  // 3) Fin de l’animation : on enlève UNIQUEMENT le wrapper
  const timeoutRemoveAll = globalThis.setTimeout(() => {
    clearExtasisForEntity(entite);
  }, 7000); // 7 s au total
  timeouts.push(timeoutRemoveAll);

  extasisTimeoutsByEntity.set(entite.id, timeouts);
}
