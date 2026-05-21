import { checkGameOver, stopAllIntervals } from './gameState.js';
import { runPhaseTimer, updateTimerDisplay } from './dom.js';
import { attackDetails } from './attackList.js'; 

export const attackFunctions = {};

// Fonction pour ajouter dynamiquement des méthodes basées sur attackDetails
const addAttackMethods = () => {
  attackDetails.forEach((attack) => {
    attackFunctions[attack.functionName] = async function(attacker, target, tryAlternative = true) {
      // Utilisation directe de l'objet 'attack' pour accéder aux détails de l'attaque
      const { attackId, displayName, preparationTime, executionTime, recoveryTime, cooldown } = attack;
      attacker.preparationTime = preparationTime;
      attacker.executionTime = executionTime;
      attacker.recoveryTime = recoveryTime;
      attacker.cooldown = cooldown;

      console.log(`${attacker.name} commence ${displayName} sur ${target.name}.`);

      // CHECK STATUTS
      const checkStatusBeforePhase = () => {
          if (attacker.hp <= 0) {
              console.log(`${attacker.name} est déjà mort.`);
              stopAllIntervals();
              return false; // Indique que l'action doit être arrêtée
          }
          if (target.hp <= 0) {
              console.log(`${target.name} est déjà morte. ${attacker.name} a attaqué un tas de viande morte.`);
              if (checkGameOver(entities)) { // Correction ici aussi
                  console.log("Le jeu est terminé !");
                  stopAllIntervals();
              }
              return false; // Indique que l'action doit être arrêtée
          }
          return true; // Indique que l'action peut continuer
      };

      if (!checkStatusBeforePhase()) return;

      // COOLDOWN
      attacker.lastAttackTime = Date.now();

      if (!checkStatusBeforePhase()) return;

      // PREPARATION
      await runPhaseTimer(attacker, 'preparationTime', attacker.preparationTime);
      if (!checkStatusBeforePhase()) return;

      // EXECUTION
      await runPhaseTimer(attacker, 'executionTime', attacker.executionTime);
      if (!checkStatusBeforePhase()) return;

      console.log(`${attacker.name} inflige ${attacker.stats.piercingDamage} points de dégâts à ${target.name}.`);
      target.hp -= attacker.stats.piercingDamage;

      if (!checkStatusBeforePhase()) return;

      // RECUPERATION
      await runPhaseTimer(attacker, 'recoveryTime', attacker.recoveryTime);
      if (attacker.hp <= 0) {
          stopAllIntervals();
          return;
      }

      // Mise à jour finale des timers si nécessaire
      updateTimerDisplay(attacker);
    };
  });
};

addAttackMethods();
