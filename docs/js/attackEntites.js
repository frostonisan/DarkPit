import { checkGameOver, stopAllIntervals, OrderEntity } from './gameState.js';
import { entites, calculateHastePercent } from './entites.js'; // 
import { updateTimerDisplay } from './dom.js';
import { attackDetails } from './attackList.js'; 
import { runPhaseTimer, LifeandDeath, applyDamage, applyDamageToDead, applyDamageToHex, updateBonusLifeCounters } from './entityAttributs.js';
import { updateTargetStatut } from './fight.js'; 
import { animatePreparation, animateFinalPhase, animateRecuperation, animateDodge, animationProjectile, animationMelee,   mysticismBoostedAttackAnimation, mysticismAttackGif } from './entitesAnimation.js'; 
import { attemptAttackerDamages, attemptDodge, attemptRangeAccuracy, attemptMeleeAmbidextry, attemptRangeAmbidextry, calculateAmbidextryDamageBonus, AmbidextryVFX, getFinalAttackCooldownReduc, getFinalAttackPreparationReduc,getFinalAttackExecutionReduc,
getFinalAttackRecoveryReduc, calculateHasteIntelRatio, clampPercent, getHastePoints, applyReducToMs, calculateBrokenSpellDamage, calculateBrokenSpellChance, attemptRangeBrokenSpell, attemptMeleeBrokenSpell, attemptMeleeExecBonus, attemptMysticismTrance, attemptEquilibreAttack, attemptOccultismInvisibility, clearOccultismInvisibleState, calculateOccultismPreparationSpeedDebuff, applyOccultismExitCritBoost } from './damagesCalcul.js';
import { updateHealthBar } from './UpgradeEntity.js';
import { EffectMessage } from './attackEffectMecanics.js'; 
import { getAttackResolutionFlags } from './attackResolution.js';
import { battleLogs } from './battleLogs.js';

// =========================
// HASTE TIMINGS BUILDER
// =========================
async function runDynamicPreparationTimerWithMysticism(attacker, basePreparationMs) {
  const tickDelay = 50;

  let virtualProgressMs = 0;
  let lastTick = Date.now();

  const totalDuration = Math.max(1, Number(basePreparationMs) || 1);

  attacker.preparationTime = totalDuration;
  attacker.preparationProgressRatio = 0;

  updateTimerDisplay(attacker);

  let initialBar = document.getElementById(`currentAttackBar_${attacker.id}`);

  if (initialBar) {
    initialBar.style.transition = "width 0.05s linear";
    initialBar.style.width = "0%";
    initialBar.classList.remove("mysticism-accelerated", "occultism-slowed");
  }

  while (virtualProgressMs < totalDuration) {
    if (attacker.life <= 0) {
      console.log(`Timer de préparation stoppé : ${attacker.name} est mort.`);

      stopAllIntervals();

      while (attacker.life <= 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      lastTick = Date.now();
    }

    const now = Date.now();
    const deltaRealMs = now - lastTick;
    lastTick = now;

const mysticActive =
  Boolean(attacker.mysticTrance?.active) &&
  Number(attacker.mysticTrance?.endsAt || 0) >= now;

const occultismActive =
  Boolean(attacker.flags?.occultismInvisible) ||
  Boolean(attacker.isInvisible) ||
  Boolean(attacker.invisible);

const mysticismSpeedMultiplier = mysticActive
  ? Math.max(0.01, Number(attacker.mysticTrance?.speedMultiplier || 1))
  : 1;

const occultismDebuff = occultismActive
  ? Math.max(0, Number(calculateOccultismPreparationSpeedDebuff(attacker)) || 0)
  : 0;

const occultismSpeedMultiplier = occultismActive
  ? 1 / (1 + occultismDebuff / 100)
  : 1;

const rawSpeedMultiplier =
  mysticismSpeedMultiplier *
  occultismSpeedMultiplier;

const speedMultiplier = Number.isFinite(rawSpeedMultiplier)
  ? Math.max(0.01, rawSpeedMultiplier)
  : 1;

virtualProgressMs += deltaRealMs * speedMultiplier;

    if (virtualProgressMs > totalDuration) {
      virtualProgressMs = totalDuration;
    }

    const remainingMs = Math.max(0, totalDuration - virtualProgressMs);
    const progressRatio = Math.max(
      0,
      Math.min(1, virtualProgressMs / totalDuration)
    );

    attacker.preparationTime = remainingMs;
    attacker.preparationProgressRatio = progressRatio;

    updateTimerDisplay(attacker);

    const currentBar = document.getElementById(`currentAttackBar_${attacker.id}`);

    if (currentBar) {
      currentBar.style.transition = "width 0.05s linear";
      currentBar.style.width = `${(progressRatio * 100).toFixed(2)}%`;
      currentBar.classList.toggle("mysticism-accelerated", mysticActive);
currentBar.classList.toggle("occultism-slowed", occultismActive);
    }

    await new Promise(resolve => setTimeout(resolve, tickDelay));
  }

  const launchedAt = Date.now();

  const wasLaunchedUnderMysticism =
    Boolean(attacker.mysticTrance?.active) &&
    Number(attacker.mysticTrance?.endsAt || 0) >= launchedAt;

  attacker.attackLaunchedUnderMysticism = wasLaunchedUnderMysticism;

  if (attacker.currentAttack) {
    attacker.currentAttack.isLaunchedUnderMysticism = wasLaunchedUnderMysticism;
  }

  console.log(
    `🔮 Lancement sous Mysticisme : ${wasLaunchedUnderMysticism ? "OUI" : "NON"}`
  );
const equilibreAttack = attemptEquilibreAttack(attacker);
attacker.equilibreAttackDebug = equilibreAttack;
  if (attacker.mysticismTranceEndTO) {
    clearTimeout(attacker.mysticismTranceEndTO);
    attacker.mysticismTranceEndTO = null;
  }

  if (typeof attacker.stopMysticismAnimation === "function") {
    attacker.stopMysticismAnimation(true);
    attacker.stopMysticismAnimation = null;
  }

  attacker.isMysticTrance = false;

  if (attacker.mysticTrance) {
    attacker.mysticTrance.active = false;
  }

  attacker.preparationTime = 0;
  attacker.preparationProgressRatio = 1;

  updateTimerDisplay(attacker);

  const finalBar = document.getElementById(`currentAttackBar_${attacker.id}`);

  if (finalBar) {
   finalBar.classList.remove("mysticism-accelerated", "occultism-slowed");
    finalBar.style.width = "100%";
  }
}

export function buildAttackTimingsWithHaste(attacker, attack) {
  const { preparationTime, executionTime, recoveryTime, cooldown } = attack;

  const prepReducPct = clampPercent(getFinalAttackPreparationReduc(attacker));
  const cdReducPct = clampPercent(getFinalAttackCooldownReduc(attacker));
  const execReducPct = clampPercent(getFinalAttackExecutionReduc(attacker));
  const recupReducPct = clampPercent(getFinalAttackRecoveryReduc(attacker));

  const timings = {
    preparationTime: applyReducToMs(preparationTime, prepReducPct),
    executionTime: applyReducToMs(executionTime, execReducPct),
    recoveryTime: applyReducToMs(recoveryTime, recupReducPct),
    cooldown: applyReducToMs(cooldown, cdReducPct),
  };

  const hastePoints = getHastePoints(attacker);

  const debug = {
    hastePoints,
    prepReducPct,
    cdReducPct,
    execReducPct,
    recupReducPct,
    base: { preparationTime, executionTime, recoveryTime, cooldown },
    final: { ...timings },
  };

  return {
    timings,
    debug,
    reductions: {
      prepReducPct,
      cdReducPct,
      execReducPct,
      recupReducPct
    }
  };
}
function startMysticismPreparationState(attacker, basePreparationMs) {
  attacker.attackLaunchedUnderMysticism = false;
  attacker.attackBalancedNoAggro = false;

  if (attacker.currentAttack) {
    attacker.currentAttack.isLaunchedUnderMysticism = false;
    attacker.currentAttack.isBalancedNoAggro = false;
  }
  
  if (attacker.mysticismTranceEndTO) {
    clearTimeout(attacker.mysticismTranceEndTO);
    attacker.mysticismTranceEndTO = null;
  }

  const trance = attemptMysticismTrance(attacker);
  attacker.mysticismDebug = trance;

  if (!trance.success) {
    attacker.isMysticTrance = false;

    attacker.mysticTrance = {
      active: false,
      startedAt: null,
      endsAt: null,
      durationMs: 0,
      accelerationPercent: 0,
      speedMultiplier: 1,
      basePreparationMs,
    };

    return trance;
  }

  const speedMultiplier = 1 + trance.accelerationPercent / 100;
  const startedAt = Date.now();
  const endsAt = startedAt + trance.durationMs;
console.log("🔮 Mysticisme timing", {
  attacker: attacker.name,
  durationMs: trance.durationMs,
  accelerationPercent: trance.accelerationPercent,
  speedMultiplier,
  startedAt,
  endsAt,
});
  attacker.isMysticTrance = true;

  attacker.mysticTrance = {
    active: true,
    startedAt,
    endsAt,
    durationMs: trance.durationMs,
    accelerationPercent: trance.accelerationPercent,
    speedMultiplier,
    basePreparationMs,
  };

attacker.mysticismTranceEndTO = setTimeout(() => {
  if (!attacker.mysticTrance) return;

  attacker.mysticTrance.active = false;
  attacker.isMysticTrance = false;

  console.log(
    `🔮 Transe mystique terminée pour ${attacker.name} après ${Date.now() - startedAt}ms.`
  );
}, trance.durationMs);

  return trance;
}
async function runPreparationTimerWithMysticism(attacker, realPreparationDuration) {
  await runPhaseTimer(
    attacker,
    "preparationTime",
    realPreparationDuration
  );

  const now = Date.now();

  const wasLaunchedUnderMysticism =
    Boolean(attacker.mysticTrance?.active) &&
    Number(attacker.mysticTrance?.endsAt || 0) >= now;

  attacker.attackLaunchedUnderMysticism = wasLaunchedUnderMysticism;

  if (attacker.currentAttack) {
    attacker.currentAttack.isLaunchedUnderMysticism = wasLaunchedUnderMysticism;
  }

console.log(
  `🔮 Lancement sous Mysticisme : ${wasLaunchedUnderMysticism ? "OUI" : "NON"}`
);

const equilibreAttack = attemptEquilibreAttack(attacker);
attacker.equilibreAttackDebug = equilibreAttack;

  if (attacker.mysticismTranceEndTO) {
    clearTimeout(attacker.mysticismTranceEndTO);
    attacker.mysticismTranceEndTO = null;
  }

  if (typeof attacker.stopMysticismAnimation === "function") {
    attacker.stopMysticismAnimation(true);
    attacker.stopMysticismAnimation = null;
  }

  attacker.isMysticTrance = false;

  if (attacker.mysticTrance) {
    attacker.mysticTrance.active = false;
  }
}
// =========================
// ATTACK METHODS
// =========================
export const AliveattackFunctions = {};
export const DeadattackFunctions = {};
export const HexattackFunctions = {};

// =========================
// PHASES ATTACK (CIBLE VIVANTE)
// =========================
const addAliveAttackMethods = () => {
  attackDetails.forEach((attack) => {
    AliveattackFunctions[attack.functionName] = async function (
      attacker,
      target,
      tryAlternative = true
    ) {
      attacker.projectiles = attacker.projectiles || [];

const flags = getAttackResolutionFlags(attack);
const isRange = flags.isRange;
const isMelee = flags.isMelee;
let meleeAnimationController = null;

      const { attackId, displayName } = attack;

const { timings, debug } = buildAttackTimingsWithHaste(attacker, attack, {
  calculateHastePercent,
  calculateHasteIntelRatio,
});

      // Stockage debug optionnel
      attacker.hasteDebug = debug;

      // Appliquer les timings AU SEUL attacker
      attacker.preparationTime = timings.preparationTime;
      attacker.executionTime = timings.executionTime;
      attacker.recoveryTime = timings.recoveryTime;
      attacker.cooldown = timings.cooldown;

      // (optionnel) si tu veux garder les bases sans casser la hâte
      attacker.baseTimings = debug.base;

      try {
        attacker.currentAttack = attack; // current pour animation et suivi
        attacker.kills = attacker.kills || 0;
        console.log(`${attacker.name} commence ${displayName} sur ${target.name}.`);
      } catch (error) {
        console.error(`Erreur pendant l'initialisation de l'attaque : ${error}`);
        return;
      }

      //CHECK ENTITY STATUT
      const checkStatusAndGameOver = (entite) => {
        try {
          LifeandDeath(entite); // Met à jour `entite.isDEAD`
          if (entite.isDEAD) {
            const gameIsOver = checkGameOver(entites);
            if (gameIsOver) {
              console.error(`${entite.name} est mort, ce qui entraîne la fin du jeu.`);
              return; // undefined => stop
            }
            return false;
          } else {
            return true;
          }
        } catch (error) {
          console.error(`Erreur pendant la vérification du statut : ${error}`);
          return false;
        }
      };

      if (!checkStatusAndGameOver(attacker) || !checkStatusAndGameOver(target)) return;

      // =========================
      // PHASES
      // =========================

      // PREPARATION
      try {
        attacker.lastAttackTime = Date.now();
        attacker.currentPhase = "attack_1";
		
const basePreparationMs = attacker.preparationTime;

attacker.preparationProgressRatio = 0;

clearOccultismInvisibleState(attacker);

const occultismInvisibility = attemptOccultismInvisibility(attacker);
attacker.occultismInvisibilityDebug = occultismInvisibility;

startMysticismPreparationState(
  attacker,
  basePreparationMs
);

animatePreparation(
  attacker,
  attack,
  basePreparationMs
);

await runDynamicPreparationTimerWithMysticism(
  attacker,
  basePreparationMs
);

const wasOccultismInvisible =
  Boolean(attacker.flags?.occultismInvisible) ||
  Boolean(attacker.isInvisible) ||
  Boolean(attacker.invisible);

clearOccultismInvisibleState(attacker);

if (wasOccultismInvisible) {
  applyOccultismExitCritBoost(attacker);
}

        if (OrderEntity(attacker)) {
          console.warn(`🛑 Phase de préparation interrompue : ordre en cours.`);
          return;
        }

        if (!checkStatusAndGameOver(target)) {
          console.log(`${target.name} a déjà trépassé. ${attacker.name} retient son coup.`);
          return;
        }

        if (!checkStatusAndGameOver(attacker)) return;
      } catch (error) {
        clearOccultismInvisibleState(attacker);
  console.error(`Erreur pendant la phase de préparation : ${error}`);
  return;
      }

      // EXECUTION
      try {
 if (attack.isLaunchedUnderMysticism) {
    mysticismBoostedAttackAnimation(attacker.id);
	  mysticismAttackGif(attacker.id);
  }

        // =========================
        // BROKEN SPELL RANGE : UNIQUEMENT SI RANGE
        // =========================
    let actualTarget = target;
let brokenSpell = false;
let brokenSpellDamagePct = 0;

let brokenSpellChance = 0;
let brokenSpellRoll = 0;

if (flags.isRange && flags.canBrokenSpell && flags.brokenSpellMode === "range_self") {
  const broken = attemptRangeBrokenSpell(attacker, target, attack);
  if (broken?.success) {
    brokenSpell = true;
    brokenSpellDamagePct = broken.damagePct;
    brokenSpellChance = broken.chance;
    brokenSpellRoll = broken.roll;

    actualTarget = attacker; // retour sur le lanceur
  }
}

        // Définir le statut de la cible réelle en 'activeTarget'
        actualTarget.targetStatut = "activeTarget";
        if (attacker.type == "lord") {
          updateTargetStatut(attacker, actualTarget);
        }

        // =========================
        // RANGE ATTACK
        // =========================
        if (isRange) {
          console.log(`🎯 ${attacker.name} effectue une attaque à distance sur ${actualTarget.name}.`);

          const AmbidextryProjectileDelayBase = 500;

          const hasHaste = getHastePoints(attacker) > 0;
          const execReducPct = hasHaste ? calculateHasteExecReduc(attacker) : 0;

          const AmbidextryProjectileDelay = applyReducToMs(
            AmbidextryProjectileDelayBase,
            execReducPct
          );

          // Calcul des dégâts (base)
          const { totalDamageSources, totalDamage } = attemptAttackerDamages(attacker, attack);

          // Si broken spell => dégâts renvoyés au lanceur = % du total
          const finalDamage = brokenSpell
            ? Math.round((totalDamage * brokenSpellDamagePct) / 100)
            : totalDamage;

          if (brokenSpell) {
            console.warn(
              `💥 Sort pété ! => ${attacker.name} se blesse en lançant ${displayName} pour ${finalDamage} dégâts (${brokenSpellDamagePct.toFixed(
                1
              )}% de ${totalDamage}). (chance ${brokenSpellChance.toFixed(
                1
              )}% | jet ${brokenSpellRoll.toFixed(1)}%)`
            );
          }

          // Si broken spell => on coupe les selfEffects
          const selfEffectsToApply = brokenSpell ? [] : attack.selfEffects;

          // Projectile principal
const projectileData = {
  attackerId: attacker.id,
  targetId: actualTarget.id,
  attackId,
  damage: finalDamage,
  startTime: Date.now(),
  status: "in-flight",
  isLaunchedUnderMysticism: Boolean(attack?.isLaunchedUnderMysticism),
  ...(brokenSpell ? { aura: "brokenSpell" } : {}),
};

          attacker.projectiles.push(projectileData);
          console.log(`🚀 Projectile lancé :`, projectileData);

          let ambiSuccess = false;
          let secondProjectileData = null;

         
         if (flags.canAmbidextry) {
  ambiSuccess = await attemptRangeAmbidextry(
    attacker,
    actualTarget,
    attack,
    totalDamage,
    totalDamageSources
  );
            if (ambiSuccess) {
              const ambiBonus = calculateAmbidextryDamageBonus(attacker);
              const ambiDamage = Math.round((totalDamage * ambiBonus) / 100);

// 🗡️ Sources du projectile ambidextre
let ambiForceDamageSources = {
  piercingDamage: 0,
  physical: ambiDamage,
  magical: 0,
  hybridalDamage: 0,
};

// ✅ TRANSperçante pure
if (
  totalDamageSources?.piercingDamage > 0 &&
  !totalDamageSources?.physical &&
  !totalDamageSources?.magical &&
  !totalDamageSources?.hybridalDamage
) {
  ambiForceDamageSources = {
    piercingDamage: ambiDamage,
    physical: 0,
    magical: 0,
    hybridalDamage: 0,
  };

  console.log(
    `🗡️ Ambidextrie Transperçante → projectile piercing (${ambiDamage})`
  );
}

secondProjectileData = {
  attackerId: attacker.id,
  targetId: actualTarget.id,
  attackId,
  damage: ambiDamage,
  startTime: Date.now() + AmbidextryProjectileDelay,
  status: "in-flight",
  aura: "ambidextry",

  isLaunchedUnderMysticism: Boolean(attack?.isLaunchedUnderMysticism),

  forceDamageSources: ambiForceDamageSources,
};

              attacker.projectiles.push(secondProjectileData);
              console.log(
                `🚀 Deuxième projectile (ambidextrie) lancé avec un bonus de dégâts de ${ambiBonus}% → ${ambiDamage} dmg, délai ${AmbidextryProjectileDelay} ms :`,
                secondProjectileData
              );
            }
          }

          // 💥 Gestion des impacts
   const handleImpact = (proj, label, impactTarget) => async () => {
  console.log(`💥 Impact ${label} sur ${impactTarget.name}.`);

  const isBrokenSpellReturn = brokenSpell && proj === projectileData;
const projectileSources = proj?.forceDamageSources || totalDamageSources || {};

const isPurePiercingProjectile =
  Number(projectileSources.piercingDamage || 0) > 0 &&
  Number(projectileSources.physical || 0) <= 0 &&
  Number(projectileSources.magical || 0) <= 0 &&
  Number(projectileSources.hybridalDamage || 0) <= 0;
const accuracyHit = isBrokenSpellReturn
  ? true
  : flags.canMissAccuracy
    ? attemptRangeAccuracy(attacker, impactTarget, {
        transpiercing: isPurePiercingProjectile
      })
    : true;

  if (!accuracyHit) {
    proj.status = "miss";
    proj.impactTime = Date.now();
    console.log(`❌ ${label} MISS (Adresse) :`, proj);

    EffectMessage(impactTarget, "Raté !");

    updateHealthBar(
      impactTarget.stats.HP.current,
      impactTarget.stats.HP.max,
      impactTarget.stats.armor?.current || 0,
      impactTarget.stats.armor?.max || 0,
      impactTarget.id
    );
    updateBonusLifeCounters(impactTarget);
    return "miss";
  }

  const attackDodged = isBrokenSpellReturn
    ? false
    : flags.canBeDodged
      ? attemptDodge(attacker, impactTarget)
      : false;

  if (attackDodged) {
    proj.status = "dodged";
	battleLogs("attack_dodged", {
    attacker,
    target: impactTarget,
    attack
});
    console.log(`🛡️ ${label} esquivé :`, proj);

    updateHealthBar(
      impactTarget.stats.HP.current,
      impactTarget.stats.HP.max,
      impactTarget.stats.armor?.current || 0,
      impactTarget.stats.armor?.max || 0,
      impactTarget.id
    );
    updateBonusLifeCounters(impactTarget);
    return "dodged";
  }

  if (ambiSuccess && proj === projectileData) {
    AmbidextryVFX(impactTarget);
  }

  if (attack.isAmbidextry || proj === secondProjectileData) {
applyDamage(
  impactTarget,
  proj.damage,
  attacker,
{
  ...attack,
  isAmbidextry: true,
  ambidextryHitIndex: 2,
  logVariant: "ambidextry_2",
  forceDamageSources: proj.forceDamageSources,
  isLaunchedUnderMysticism: Boolean(proj?.isLaunchedUnderMysticism),
},
totalDamageSources,
  selfEffectsToApply
);
  } else {
   applyDamage(
  impactTarget,
  proj.damage,
  attacker,
{
  ...attack,
  isBrokenSpell: Boolean(brokenSpell),
  ambidextryHitIndex: ambiSuccess ? 1 : null,
  logVariant: ambiSuccess ? "ambidextry_1" : "normal",
  isLaunchedUnderMysticism: Boolean(proj?.isLaunchedUnderMysticism),
},
  totalDamageSources,
  selfEffectsToApply
);
  }

  updateHealthBar(
    impactTarget.stats.HP.current,
    impactTarget.stats.HP.max,
    impactTarget.stats.armor?.current || 0,
    impactTarget.stats.armor?.max || 0,
    impactTarget.id
  );
  updateBonusLifeCounters(impactTarget);

  proj.status = "hit";
  proj.impactTime = Date.now();
  console.log(`📊 ${label} mis à jour après impact :`, proj);

  if (!checkStatusAndGameOver(impactTarget)) checkGameOver(entites);
  return "hit";
};
          // 🚫 Si broken spell => évite une animation projectile "self"
          if (brokenSpell) {
            await handleImpact(projectileData, "Retour de sort", actualTarget)();
          } else {
            const animations = [
              animationProjectile(
                attacker,
                actualTarget,
                handleImpact(projectileData, "Projectile principal", actualTarget),
                projectileData
              ),
            ];

            if (ambiSuccess && secondProjectileData) {
              await new Promise((res) => setTimeout(res, AmbidextryProjectileDelay));
              animations.push(
                animationProjectile(
                  attacker,
                  actualTarget,
                  handleImpact(secondProjectileData, "Deuxième projectile", actualTarget),
                  secondProjectileData
                )
              );
            }

            await Promise.all(animations);
          }

          attacker.currentPhase = "attack_2";
          await runPhaseTimer(attacker, "executionTime", attacker.preparationTime); // comme chez toi
          if (OrderEntity(attacker)) {
            console.warn(`🛑 Phase d'exécution interrompue : ordre en cours.`);
            return;
          }
        }

        // =========================
        // MELEE (animation)
        // =========================
else if (isMelee) {
  console.log(`⚔️ ${attacker.name} effectue une attaque en mêlée sur ${target.name}.`);
  attacker.currentPhase = "attack_3";
  meleeAnimationController = animationMelee(attacker, target);

  // base avant hâte (très important)
  const baseExecMs = attacker.baseTimings?.executionTime ?? attack.executionTime ?? attacker.executionTime;

  const meleeExec = attemptMeleeExecBonus(attacker, attack, baseExecMs);
  attacker.meleeExecDebug = meleeExec.debug;

  await runPhaseTimer(attacker, "executionTime", meleeExec.finalExecMs);

  if (OrderEntity(attacker)) {
    console.warn(`🛑 Phase d'execution interrompue : ordre en cours.`);
    return;
  }
}
 else {
          console.warn(
            `⚠️ ${attacker.name} a une attaque inconnue en termes de portée :`,
            attack.attackRange
          );
        }

// =========================
// DEGATS MELEE
// =========================
if (isMelee) {
  // Sécurité : l'attaquant peut mourir pendant le temps d'exécution CAC
  LifeandDeath(attacker);

  if (attacker.isDEAD) {
    meleeAnimationController?.resolveImpact?.(false);
    console.log(
      `🛑 ${attacker.name} meurt avant de toucher ${target.name}. L'attaque CAC échoue.`
    );

    updateHealthBar(
      attacker.stats.HP.current,
      attacker.stats.HP.max,
      attacker.stats.armor?.current || 0,
      attacker.stats.armor?.max || 0,
      attacker.id
    );
    updateBonusLifeCounters(attacker);

    checkGameOver(entites);
    return;
  }

  // Sécurité : la cible peut mourir pendant le temps d'exécution CAC
  LifeandDeath(target);

  if (target.isDEAD) {
    meleeAnimationController?.resolveImpact?.(false);
    console.log(
      `🛑 ${attacker.name} frappe trop tard : ${target.name} est déjà mort. L'attaque échoue.`
    );

    updateHealthBar(
      target.stats.HP.current,
      target.stats.HP.max,
      target.stats.armor?.current || 0,
      target.stats.armor?.max || 0,
      target.id
    );
    updateBonusLifeCounters(target);

    checkGameOver(entites);
    return;
  }

  // DODGE
  const attackDodged = flags.canBeDodged
    ? attemptDodge(attacker, target)
    : false;

  if (attackDodged) {
	meleeAnimationController?.resolveImpact?.(false);
	  battleLogs("attack_dodged", {
    attacker,
    target,
    attack
});
    console.log(
      `🛡️ ${target.name} esquive l'attaque de ${attacker.name} ! Aucun dégât infligé.`
    );

    updateHealthBar(
      target.stats.HP.current,
      target.stats.HP.max,
      target.stats.armor?.current || 0,
      target.stats.armor?.max || 0,
      target.id
    );
    updateBonusLifeCounters(target);

    console.log(`${attacker.name} termine son attaque après esquive.`);

    try {
      LifeandDeath(attacker);

      if (!attacker.isDEAD) {
        animateRecuperation(attacker, attack);
        attacker.currentPhase = "attack_4";

        await runPhaseTimer(attacker, "recoveryTime", attacker.recoveryTime);

        if (OrderEntity(attacker)) {
          console.warn(`🛑 Phase de recuperation interrompue : ordre en cours.`);
          return;
        }

        LifeandDeath(attacker);

        if (!attacker.isDEAD) {
          if (!checkStatusAndGameOver(attacker)) return;
          updateTimerDisplay(attacker);
        } else {
          console.log(
            `${attacker.name} est mort et ne peut poursuivre la phase de récupération.`
          );
          stopAllIntervals();
          return;
        }
      } else {
        console.log(
          `${attacker.name} est déjà mort et ne peut entrer dans la phase de récupération.`
        );
        stopAllIntervals();
        return;
      }
    } catch (error) {
      console.error(`Erreur pendant la phase de récupération : ${error}`);
      return;
    }

    return;
  }

  const { totalDamageSources, totalDamage } =
    attemptAttackerDamages(attacker, attack);

  // Re-check juste avant applyDamage
  LifeandDeath(attacker);
  LifeandDeath(target);

  if (attacker.isDEAD) {
    meleeAnimationController?.resolveImpact?.(false);
    console.log(
      `🛑 ${attacker.name} meurt juste avant l'application des dégâts. L'attaque CAC échoue.`
    );
    checkGameOver(entites);
    return;
  }

  if (target.isDEAD) {
    meleeAnimationController?.resolveImpact?.(false);
    console.log(
      `🛑 ${attacker.name} attaque le cadavre de ${target.name}. Cela ne produit aucun effet.`
    );
    checkGameOver(entites);
    return;
  }

  // BROKEN SPELL MELEE
  const brokenMelee =
    flags.canBrokenSpell && flags.brokenSpellMode === "melee_double"
      ? attemptMeleeBrokenSpell(attacker, target, attack)
      : null;

  meleeAnimationController?.resolveImpact?.(true);

  if (brokenMelee?.success) {
    const brokenDamage = Math.round((totalDamage * brokenMelee.damagePct) / 100);

    console.warn(
      `💥 Sort pété ! => ${attacker.name} se blesse et blesse ${target.name} en lançant ${displayName} : ` +
        `${brokenDamage} dégâts chacun (${brokenMelee.damagePct.toFixed(
          1
        )}% de ${totalDamage}). ` +
        `(chance ${brokenMelee.chance.toFixed(1)}% | jet ${brokenMelee.roll.toFixed(1)}%)`
    );

    const noSelfEffects = [];

    applyDamage(
      target,
      brokenDamage,
      attacker,
      { ...attack, isBrokenSpell: true, brokenSpellMode: "melee_double" },
      totalDamageSources,
      noSelfEffects
    );

    applyDamage(
      attacker,
      brokenDamage,
      attacker,
      { ...attack, isBrokenSpell: true, brokenSpellMode: "melee_double" },
      totalDamageSources,
      noSelfEffects
    );

    updateHealthBar(
      target.stats.HP.current,
      target.stats.HP.max,
      target.stats.armor?.current || 0,
      target.stats.armor?.max || 0,
      target.id
    );
    updateBonusLifeCounters(target);

    updateHealthBar(
      attacker.stats.HP.current,
      attacker.stats.HP.max,
      attacker.stats.armor?.current || 0,
      attacker.stats.armor?.max || 0,
      attacker.id
    );
    updateBonusLifeCounters(attacker);

    if (!checkStatusAndGameOver(target)) checkGameOver(entites);
    if (!checkStatusAndGameOver(attacker)) return;
  } else {
    applyDamage(
      target,
      totalDamage,
      attacker,
      attack,
      totalDamageSources,
      attack.selfEffects
    );
  }

  if (flags.canAmbidextry) {
    LifeandDeath(attacker);
    LifeandDeath(target);

    if (!attacker.isDEAD && !target.isDEAD) {
      attemptMeleeAmbidextry(
        attacker,
        target,
        totalDamage,
        attack,
        totalDamageSources
      );
    }
  }
}
        // =========================
        // LAST-TARGET UPDATE (sur la cible réelle)
        // =========================
        attacker.attackBalancedNoAggro = false;

if (attacker.currentAttack) {
  attacker.currentAttack.isBalancedNoAggro = false;
}

actualTarget.targetStatut = "lastTarget";
        if (attacker.type == "lord") {
          updateTargetStatut(attacker, actualTarget);
        }

        updateHealthBar(
          actualTarget.stats.HP.current,
          actualTarget.stats.HP.max,
          actualTarget.stats.armor?.current || 0,
          actualTarget.stats.armor?.max || 0,
          actualTarget.id
        );
        updateBonusLifeCounters(actualTarget);

        if (!checkStatusAndGameOver(actualTarget)) {
          checkGameOver(entites);
        }
        if (!checkStatusAndGameOver(attacker)) return;
      } catch (error) {
        console.error(`Erreur pendant la phase d'exécution : ${error}`);
        return;
      }

      // RECUPERATION (fin standard)
      try {
        if (attacker.isDEAD) {
          console.log(
            `❌ ${attacker.name} est mort après l'attaque et ne peut entrer dans la phase de récupération.`
          );
          stopAllIntervals();
          return;
        }

        animateRecuperation(attacker, attack);
        attacker.currentPhase = "attack_5";
        await runPhaseTimer(attacker, "recoveryTime", attacker.recoveryTime);

        if (OrderEntity(attacker)) {
          console.warn(`🛑 Phase de recuperation interrompue : ordre en cours.`);
          return;
        }

        if (attacker.isDEAD) {
          console.log(`${attacker.name} est mort pendant la récupération.`);
          stopAllIntervals();
          return;
        }

        if (!checkStatusAndGameOver(attacker)) return;
        updateTimerDisplay(attacker);
      } catch (error) {
        console.error(`Erreur pendant la phase de récupération : ${error}`);
        return;
      }
    };
  });
};

addAliveAttackMethods();

//PHASES ATTACK CIBLE MORTE
const addDeadAttackMethods = () => {
    attackDetails.forEach((attack) => {
        DeadattackFunctions[attack.functionName] = async function(attacker, target, tryAlternative = true) {
            const { attackId, displayName, preparationTime, executionTime, recoveryTime, cooldown } = attack;
            try {
                attacker.currentAttack = attack; //current pour animation et suivi
                attacker.preparationTime = preparationTime;
                attacker.executionTime = executionTime;
                attacker.recoveryTime = recoveryTime;
                attacker.cooldown = cooldown;
                attacker.kills = attacker.kills || 0;
                console.log(`${attacker.name} commence ${displayName} sur une cible morte ${target.name}.`);
            } catch (error) {
                console.error(`Erreur pendant l'initialisation de l'attaque : ${error}`);
                return;
            }

         const checkStatusAndGameOver = (entite) => {
    try {
        LifeandDeath(entite); // Met à jour `entite.isDEAD` correctement
        console.log(`Statut après LifeandDeath pour ${entite.name}: isDEAD = ${entite.isDEAD}`);
        if (entite.isDEAD) {
            const gameIsOver = checkGameOver(entites); // Doit retourner un booléen
            console.log(`Check game over pour ${entite.name}: gameIsOver = ${gameIsOver}`);
            if (gameIsOver) {
                console.error(`${entite.name} est mort, ce qui entraîne la fin du jeu.`);
                return false;
            }
            return false; // L'entité est morte, et le jeu pourrait être terminé.
        } else {
            return true; // L'entité est vivante, le jeu continue.
        }
    } catch (error) {
        console.error(`Erreur pendant la vérification du statut : ${error}`);
        return false; // En cas d'erreur, considérer l'entité comme non vérifiable / jeu potentiellement terminé
    }
};

console.log(`Vérification de l'attaquant ${attacker.name} avant la phase de préparation.`);
if (!checkStatusAndGameOver(attacker)) {
    console.log(`Attaquant ${attacker.name} ne passe pas checkStatusAndGameOver.`);
    return;
}

// PREPARATION
try {
    attacker.lastAttackTime = Date.now();
    await runPhaseTimer(attacker, 'preparationTime', attacker.preparationTime);
       if (!checkStatusAndGameOver(attacker)) return;
} catch (error) {
    console.error(`Erreur pendant la phase de préparation : ${error}`);
    return;
}

// EXECUTION
try {
    await animationProjectile(attacker, target);
    await runPhaseTimer(attacker, 'executionTime', attacker.executionTime);
    let originalDamage = attacker.stats.piercingDamage;
    if (!target.isDEAD) {
        attacker.stats.piercingDamage = 0;
        console.log(`${attacker.name} lance un sort destiné à une cible morte mais ${target.name} est toujours en vie. Le sort échoue.`);
        attacker.stats.piercingDamage = originalDamage;
    } else {
        console.log(`${attacker.name} réalise son action sur le cadavre de ${target.name}.`);
        applyDamageToDead(target, attacker.stats.piercingDamage, attacker, attack);
		updateHealthBar(target.stats.HP.current, target.stats.HP.max, `healthBarDetails_${target.id}`, `healthBar_${target.id}`, `HUhealthBar_${target.id}`, `HUhealthBarCodex_${target.id}`);
        updateBonusLifeCounters(target);
        if (!checkStatusAndGameOver(target)) {
            checkGameOver(entites);
        }
    }
    if (!checkStatusAndGameOver(attacker)) return;
} catch (error) {
    console.error(`Erreur pendant la phase d'exécution de ${attacker.name} : ${error}`);
    return;
}

// RECUPERATION
try {
    if (!attacker.isDEAD) {
           await runPhaseTimer(attacker, 'recoveryTime', attacker.recoveryTime);

        if (!attacker.isDEAD) {
            if (!checkStatusAndGameOver(attacker)) return;
            updateTimerDisplay(attacker);
        } else {
            stopAllIntervals();
            return;
        }
    } else {
          stopAllIntervals();
        return;
    }
} catch (error) {
    console.error(`Erreur pendant la phase de récupération : ${error}`);
    return;
}

        };
    });
};
addDeadAttackMethods();

//PHASES ATTACK CIBLE HEX
const addHexAttackMethods = () => {
    attackDetails.forEach((attack) => {
        HexattackFunctions[attack.functionName] = async function (attacker, target) {
            const { displayName, preparationTime, executionTime, recoveryTime, cooldown } = attack;
            try {
                attacker.currentAttack = attack; // current pour animation et suivi
                attacker.preparationTime = preparationTime;
                attacker.executionTime = executionTime;
                attacker.recoveryTime = recoveryTime;
                attacker.cooldown = cooldown;
                attacker.kills = attacker.kills || 0;
                console.log(`${attacker.name} commence ${displayName} sur hex ${target.dataset.position}.`);
            } catch (error) {
                console.error(`Erreur pendant l'initialisation de l'attaque : ${error}`);
                return;
            }

            // Check Statut
            const checkStatusAndGameOver = (entite) => {
                try {
                    LifeandDeath(entite); // Met à jour `entite.isDEAD` correctement
                    if (entite.isDEAD) {
                        const gameIsOver = checkGameOver(entites); // Doit retourner un booléen
                        if (gameIsOver) {
                            console.error(`${entite.name} est mort, ce qui entraîne la fin du jeu.`);
                            return false;
                        }
                        return false; // L'entité est morte, et le jeu pourrait être terminé.
                    } else {
                        return true; // L'entité est vivante, le jeu continue.
                    }
                } catch (error) {
                    console.error(`Erreur pendant la vérification du statut : ${error}`);
                    return false; // En cas d'erreur, considérer l'entité comme non vérifiable / jeu potentiellement terminé
                }
            };

            if (!checkStatusAndGameOver(attacker)) return;

            // PREPARATION
            try {
                attacker.lastAttackTime = Date.now();
                await runPhaseTimer(attacker, 'preparationTime', attacker.preparationTime);
                if (!checkStatusAndGameOver(attacker)) return;
            } catch (error) {
                console.error(`Erreur pendant la phase de préparation : ${error}`);
                return;
            }

            // EXECUTION
            try {
                // Animation projectile
                await animationProjectile(attacker, target);
                await runPhaseTimer(attacker, 'executionTime', attacker.executionTime);
                console.log(`${attacker.name} a exécuté ${displayName} sur hex ${target.dataset.position}.`);
                applyDamageToHex(target, attacker, attack);
            } catch (error) {
                console.error(`Erreur pendant la phase d'exécution : ${error}`);
                return;
            }

            // RECUPERATION
            try {
                if (!attacker.isDEAD) {
                    await runPhaseTimer(attacker, 'recoveryTime', attacker.recoveryTime);

                    if (!attacker.isDEAD) {
                        if (!checkStatusAndGameOver(attacker)) return;
                        updateTimerDisplay(attacker);
                    } else {
                        console.log(`${attacker.name} est mort et ne peut poursuivre la phase de récupération.`);
                        stopAllIntervals();
                        return;
                    }
                } else {
                    console.log(`${attacker.name} est déjà mort et ne peut entrer dans la phase de récupération.`);
                    stopAllIntervals();
                    return;
                }
            } catch (error) {
                console.error(`Erreur pendant la phase de récupération : ${error}`);
                return;
            }
        };
    });
};
addHexAttackMethods();
