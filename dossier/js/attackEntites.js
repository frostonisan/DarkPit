import { checkGameOver, stopAllIntervals, OrderEntity } from './gameState.js';
import { entites, calculateHastePercent } from './entites.js'; // 
import { updateTimerDisplay } from './dom.js';
import { attackDetails } from './attackList.js'; 
import { runPhaseTimer, LifeandDeath, applyDamage, applyDamageToDead, applyDamageToHex, updateBonusLifeCounters } from './entityAttributs.js';
import { updateTargetStatut } from './fight.js'; 
import { animatePreparation, animateFinalPhase, animateRecuperation, animateDodge, animationProjectile, animationMelee  } from './entitesAnimation.js'; 
import { attemptAttackerDamages, attemptDodge, attemptRangeAccuracy, attemptMeleeAmbidextry, attemptRangeAmbidextry, calculateAmbidextryDamageBonus, AmbidextryVFX, calculateHasteExecReduc, calculateHasteRecupReduc, calculateHasteCDReduc, calculateHasteIntelRatio, clampPercent, getHastePoints, applyReducToMs, calculateBrokenSpellDamage, calculateBrokenSpellChance, attemptRangeBrokenSpell, attemptMeleeBrokenSpell, attemptMeleeExecBonus } from './damagesCalcul.js';
import { updateHealthBar } from './UpgradeEntity.js';
import { EffectMessage } from './attackEffectMecanics.js'; 

// =========================
// HELPERS (portée + nature)
// =========================
export const isRangeAttack = (attack) => {
  const r = attack?.attackRange;
  if (Array.isArray(r)) return r.includes("range");
  if (typeof r === "string") return r.includes("range");
  return false;
};

export const isMeleeAttack = (attack) => {
  const r = attack?.attackRange;
  if (Array.isArray(r)) return r.includes("melee");
  if (typeof r === "string") return r.includes("melee");
  return false;
};


export const isPureMagicalAttack = (attack) => {
  const n = attack?.attacknature;
  return Array.isArray(n) && n.length === 1 && n[0] === "magicalDamage";
};

// =========================
// HASTE TIMINGS BUILDER
// =========================
export function buildAttackTimingsWithHaste(attacker, attack, fns) {
  const {
    calculateHastePercent,
    calculateHasteIntelRatio,
    calculateHasteCDReduc,
    calculateHasteExecReduc,
    calculateHasteRecupReduc,
  } = fns;

  const { preparationTime, executionTime, recoveryTime, cooldown } = attack;

  const hastePoints = getHastePoints(attacker);
  const hasHaste = hastePoints > 0;

  const hastePercent = hasHaste ? calculateHastePercent(hastePoints) : 0;
  const hasteIntel = hasHaste ? calculateHasteIntelRatio(attacker) : 0;

  const prepReducPct = hasHaste ? clampPercent(hastePercent + hasteIntel) : 0;
  const cdReducPct = hasHaste ? clampPercent(calculateHasteCDReduc(attacker)) : 0;
  const execReducPct = hasHaste ? clampPercent(calculateHasteExecReduc(attacker)) : 0;
  const recupReducPct = hasHaste ? clampPercent(calculateHasteRecupReduc(attacker)) : 0;

  const timings = {
    preparationTime: applyReducToMs(preparationTime, prepReducPct),
    executionTime: applyReducToMs(executionTime, execReducPct),
    recoveryTime: applyReducToMs(recoveryTime, recupReducPct),
    cooldown: applyReducToMs(cooldown, cdReducPct),
  };

  const debug = {
    hasHaste,
    hastePoints,
    hastePercent,
    hasteIntel,
    prepReducPct,
    cdReducPct,
    execReducPct,
    recupReducPct,
    base: { preparationTime, executionTime, recoveryTime, cooldown },
    final: { ...timings },
  };

  return { timings, debug, reductions: { prepReducPct, cdReducPct, execReducPct, recupReducPct } };
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

      const { attackId, displayName } = attack;

      const { timings, debug } = buildAttackTimingsWithHaste(attacker, attack, {
        calculateHastePercent,
        calculateHasteIntelRatio,
        calculateHasteCDReduc,
        calculateHasteExecReduc,
        calculateHasteRecupReduc,
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
        animatePreparation(attacker, attack);
        await runPhaseTimer(attacker, "preparationTime", attacker.preparationTime);

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
        console.error(`Erreur pendant la phase de préparation : ${error}`);
        return;
      }

      // EXECUTION
      try {
        const isRange = isRangeAttack(attack);
        const isMelee = isMeleeAttack(attack);

        // =========================
        // BROKEN SPELL RANGE : UNIQUEMENT SI RANGE
        // =========================
    let actualTarget = target;
let brokenSpell = false;
let brokenSpellDamagePct = 0;

let brokenSpellChance = 0;
let brokenSpellRoll = 0;

if (isRange && isPureMagicalAttack(attack)) {
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
            ...(brokenSpell ? { aura: "brokenSpell" } : {}),
          };

          attacker.projectiles.push(projectileData);
          console.log(`🚀 Projectile lancé :`, projectileData);

          let ambiSuccess = false;
          let secondProjectileData = null;

          // 🚫 Ambidextrie BLOQUÉE uniquement si attacknature === ["magicalDamage"]
          if (!isPureMagicalAttack(attack)) {
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

              secondProjectileData = {
                attackerId: attacker.id,
                targetId: actualTarget.id,
                attackId,
                damage: ambiDamage,
                startTime: Date.now() + AmbidextryProjectileDelay,
                status: "in-flight",
                aura: "ambidextry",
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

            // Accuracy : uniquement si pas pure magical
            const mustRollAccuracy = !isPureMagicalAttack(attack);
            const accuracyHit = mustRollAccuracy
              ? attemptRangeAccuracy(attacker, impactTarget)
              : true;

            // MISS
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
              return;
            }

            // DODGE : uniquement si pas pure magical
            const attackDodged = isPureMagicalAttack(attack)
              ? false
              : attemptDodge(attacker, impactTarget);

            if (attackDodged) {
              proj.status = "dodged";
              console.log(`🛡️ ${label} esquivé :`, proj);

              updateHealthBar(
                impactTarget.stats.HP.current,
                impactTarget.stats.HP.max,
                impactTarget.stats.armor?.current || 0,
                impactTarget.stats.armor?.max || 0,
                impactTarget.id
              );
              updateBonusLifeCounters(impactTarget);
              return;
            }

            // Ambidextry VFX
            if (ambiSuccess && proj === projectileData) {
              AmbidextryVFX(impactTarget);
            }

            // Dégâts
            if (attack.isAmbidextry || proj === secondProjectileData) {
              applyDamage(
                impactTarget,
                proj.damage,
                attacker,
                { ...attack, isAmbidextry: true },
                totalDamageSources,
                selfEffectsToApply
              );
            } else {
              applyDamage(
                impactTarget,
                proj.damage,
                attacker,
                brokenSpell ? { ...attack, isBrokenSpell: true } : attack,
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
  animationMelee(attacker, target);

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
          // DODGE : uniquement si pas pure magical
          const attackDodged = isPureMagicalAttack(attack)
            ? false
            : attemptDodge(attacker, target);

          if (attackDodged) {
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

            // Récupération immédiate après esquive (comme ton comportement)
            try {
              if (!attacker.isDEAD) {
                animateRecuperation(attacker, attack);
                attacker.currentPhase = "attack_4";
                await runPhaseTimer(attacker, "recoveryTime", attacker.recoveryTime);

                if (OrderEntity(attacker)) {
                  console.warn(`🛑 Phase de recuperation interrompue : ordre en cours.`);
                  return;
                }

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

          const { totalDamageSources, totalDamage } = attemptAttackerDamages(attacker, attack);

          if (target.isDEAD) {
            console.log(
              `${attacker.name} attaque le cadavre de ${target.name}. Cela ne produit aucun effet.`
            );
          } else {
            // BROKEN SPELL MELEE (double hit)
			const brokenMelee = isPureMagicalAttack(attack)
  ? attemptMeleeBrokenSpell(attacker, target, attack)
  : null;

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

              // Cible prend les dégâts du pétage
              applyDamage(
                target,
                brokenDamage,
                attacker,
                { ...attack, isBrokenSpell: true, brokenSpellMode: "melee_double" },
                totalDamageSources,
                noSelfEffects
              );

              // Lanceur prend les mêmes dégâts
              applyDamage(
                attacker,
                brokenDamage,
                attacker,
                { ...attack, isBrokenSpell: true, brokenSpellMode: "melee_double" },
                totalDamageSources,
                noSelfEffects
              );

              // UI des deux
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
              // comportement normal
              applyDamage(target, totalDamage, attacker, attack, totalDamageSources, attack.selfEffects);
            }

            // Ambidextrie melee BLOQUÉE uniquement si pure magical
            if (!isPureMagicalAttack(attack)) {
              attemptMeleeAmbidextry(attacker, target, totalDamage, attack, totalDamageSources);
            }
          }
        }

        // =========================
        // LAST-TARGET UPDATE (sur la cible réelle)
        // =========================
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
