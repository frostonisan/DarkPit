import { entites } from './entites.js';
import { attackDetails } from './attackList.js'; 
import { gameStarted } from './gameState.js';


// TIMERS ENTITES
export function updateTimerDisplay(entite) {
  const updateElementTextContent = (elementId, text) => {
    const element = document.getElementById(elementId);
    if (element) element.innerHTML = text;
};
// ✅ Classes d'état sur la SpeedInterface : preparation / execution / recuperation
const speedInterface = document.getElementById(`SpeedInterface_${entite.id}`);
if (speedInterface) {
  const isPreparation = entite.preparationTime > 0;
  const isExecution = entite.executionTime > 0;
  const isRecuperation = entite.recoveryTime > 0 && entite.executionTime === 0;

  speedInterface.classList.toggle("preparation", isPreparation);
  speedInterface.classList.toggle("execution", isExecution);
  speedInterface.classList.toggle("recuperation", isRecuperation);
}
    const updateATBFill = (percent) => {
        const atbFillElement = document.getElementById(`atbFill_${entite.id}`);
        if (atbFillElement) {
            atbFillElement.style.width = `${percent}%`;
        }
    };

    if (entite.speedTimer === undefined) {
        entite.speedTimer = 0;
    }

    const ATBfillIn = () => {
        if (entite.isATBFull) return;

        const maxSpeedTimer = entite.stats.speed;
        let currentPercent = ((maxSpeedTimer - entite.speedTimer) / maxSpeedTimer) * 100;

        entite.isATBFull = currentPercent >= 100;
        updateATBFill(Math.min(100, currentPercent));
    };

    const ATBfillOut = () => {
        if (entite.recoveryTime > 0) {
            if (typeof entite.maxRecoveryTime === 'undefined' || entite.maxRecoveryTime <= 0) {
                entite.maxRecoveryTime = entite.recoveryTime;
            }
            let currentPercent = (entite.recoveryTime / entite.maxRecoveryTime) * 100;
            updateATBFill(Math.max(0, currentPercent));
        }
    };

const ATBfillRunaway = () => {
    // orderDecision : descente fluide de ATB vers 0
    if (entite.orderPhase === 'orderDecision' && entite.recoveryTime > 0 && entite.maxRecoveryTime > 0) {
        const percent = (entite.recoveryTime / entite.maxRecoveryTime) * (entite.ATBfillBeforeOrder || 100);
        updateATBFill(Math.max(0, percent));
        return;
    }

    // orderExecution : remplissage fluide vers 100%
    if (entite.orderPhase === 'orderExecution' && entite.orderExecutionTime > 0 && entite.maxOrderExecutionTime > 0) {
        const percent = ((entite.maxOrderExecutionTime - entite.orderExecutionTime) / entite.maxOrderExecutionTime) * 100;
        updateATBFill(Math.min(100, percent));
        return;
    }
};

// Spécial ATB pour la phase runawayPreparation
// === PHASE SPÉCIALE : runawayRecovery → vidange
if (entite.orderPhase === 'runawayRecovery') {
    const max = entite.maxRecoveryTime || entite.runawayLoopRecuperation || entite.stats.speed;
    const percent = (entite.recoveryTime / max) * 100;
    updateATBFill(Math.max(0, percent));
    return;
}

// === PHASE SPÉCIALE : runawayPreparation → remplissage
if (entite.orderPhase === 'runawayPreparation') {
    const max = entite.maxPreparationTime || entite.runawayLoopPreparation || entite.stats.speed;
    const filled = max - entite.speedTimer;
    const percent = (filled / max) * 100;
    updateATBFill(Math.min(100, percent));
    return;
}

    // === 🟦 PHASES CLASSIQUES ===
    if (entite.orderPhase !== 'orderDecision' && entite.orderPhase !== 'orderExecution') {
 if (entite.speedTimer > 0) ATBfillIn();

    if (entite.preparationTime > 0 || entite.executionTime > 0) {
        const img = document.getElementById(`currentAttackImage_${entite.id}`);
        if (img) img.classList.remove('attack-executed');
        updateATBFill(100);
    } else if (
        entite.speedTimer === 0 &&
        entite.preparationTime === 0 &&
        entite.executionTime === 0 &&
        entite.recoveryTime === 0
    ) {
        updateATBFill(100);
    }

if (entite.executionTime === 0 && entite.recoveryTime > 0) {
    ATBfillOut();

    if (entite.wasInExecution) {
        const img = document.getElementById(`currentAttackImage_${entite.id}`);
        if (img) img.classList.add('attack-executed');
        entite.wasInExecution = false;
    }

    // ✅ Suppression systématique pendant récupération
    const img = document.getElementById(`currentAttackImage_${entite.id}`);
  }
       if (
    entite.speedTimer === 0 &&
    entite.preparationTime === 0 &&
    entite.executionTime === 0 &&
    entite.recoveryTime === 0
) {
    entite.speedTimer = entite.stats.speed;
    entite.rangeExecutedFlag = false; // 🔁 reset du déclencheur
}
    }

    // === 🟥 PHASES DE FUITE ===
    if (entite.orderPhase === 'orderDecision' || entite.orderPhase === 'orderExecution') {
        ATBfillRunaway();
    }

// === 🟥 JAUGE ATTAQUE ===
const updateCurrentAttackBar = () => {
   const el = document.getElementById(`currentAttackBar_${entite.id}`);
    if (!el || !entite.currentAttack) return;

    const { preparationTime, executionTime, recoveryTime } = entite.currentAttack;

    // Préparation → remplissage jaune
if (entite.preparationTime > 0) {
  const percent = ((preparationTime - entite.preparationTime) / preparationTime) * 100;
  el.style.width = `${Math.min(100, percent)}%`;
  el.className = 'attack-bar-fill preparation';

  // Détection attaque à distance
  const isRange = entite.currentAttack?.attackRange?.includes('range');
  const isAboutToEnd = entite.preparationTime <= 50; // marge de sécurité si t’as un timer précis (en ms)

if (isRange && isAboutToEnd && !entite.rangeExecutedFlag) {
    const img = document.getElementById(`currentAttackImage_${entite.id}`);
    if (img) img.classList.remove('attack-executed'); // ✅ suppression pour les attaques à distance
    entite.rangeExecutedFlag = true;
}

  return;
}

// Exécution → full bar rouge
if (entite.executionTime > 0) {
    el.style.width = '100%';
    el.className = 'attack-bar-fill execution';

    const execTime = Number(entite.executionTime) || 0;
    const execMax = Number(entite.currentAttack?.executionTime) || 1;
    const ratio = Math.max(0, Math.min(1, execTime / execMax));
    const duration = 0.05 + (1.5 - 0.05) * ratio;
el.style.animationDuration = `${duration}s`;

    // 👇 Ici ! On note que l'entité est actuellement en exécution
    entite.wasInExecution = true;

    return;
}
    //Récupération → vidange verte
    if (entite.recoveryTime > 0) {
		
        // const percent = (entite.recoveryTime / recoveryTime) * 100;
        // el.style.width = `${Math.max(0, percent)}%`;
        el.className = 'attack-bar-fill recovery';
        return;
    }

    // Par défaut (aucune phase en cours)
    el.style.width = '0%';
    el.className = 'attack-bar-fill empty';
};

    // === 🟨 AFFICHAGE DES TIMERS ===
  updateElementTextContent(`speedTimer_${entite.id}`, `ATB : ${isNaN(entite.speedTimer) ? "0.0" : (entite.speedTimer / 1000).toFixed(1)}s`);

const prepTime = isNaN(entite.preparationTime) ? 0 : (entite.preparationTime / 1000).toFixed(1);
const execTime = isNaN(entite.executionTime) ? 0 : (entite.executionTime / 1000).toFixed(1);
const currentAttack = attackDetails.find(a => a.attackId === entite.currentAttackId);
const attackDisplayName = currentAttack?.displayName || currentAttack?.name || '...';

const battlePrepEl = document.getElementById(`battlePreparation_${entite.id}`);
if (battlePrepEl) {
  battlePrepEl.innerHTML = `
    <span class="timer-activeattack attackname">${attackDisplayName}</span>
    <span class="timer-activeattack preparation" id="attackPrep_${entite.id}">${prepTime}s</span>
    <span class="timer-activeattack execution" id="attackExec_${entite.id}" style="display: none;">${execTime}s</span>
  `;
}


const prepCurrent = isNaN(entite.preparationTime) ? 0 : (entite.preparationTime / 1000).toFixed(1);
const prepMax = entite.currentAttack?.preparationTime ? (entite.currentAttack.preparationTime / 1000).toFixed(1) : '0.0';
updateElementTextContent(`preparationTimer_${entite.id}`, `Preparation: ${prepCurrent} / ${prepMax}s`);

const execCurrent = isNaN(entite.executionTime) ? 0 : (entite.executionTime / 1000).toFixed(1);
const execMax = entite.currentAttack?.executionTime ? (entite.currentAttack.executionTime / 1000).toFixed(1) : '0.0';
updateElementTextContent(`executionTimer_${entite.id}`, `Execution: ${execCurrent} / ${execMax}s`);

const cooldownCurrent = isNaN(entite.cooldownTimer) ? 0 : (entite.cooldownTimer / 1000).toFixed(1);
const cooldownMax = entite.currentAttack?.cooldown ? (entite.currentAttack.cooldown / 1000).toFixed(1) : '0.0';
updateElementTextContent(`cooldownDisplay_${entite.id}`, `Cooldown: ${cooldownCurrent} / ${cooldownMax}s`);

const recoveryCurrent = isNaN(entite.recoveryTime) ? 0 : (entite.recoveryTime / 1000).toFixed(1);
const recoveryMax = entite.currentAttack?.recoveryTime ? (entite.currentAttack.recoveryTime / 1000).toFixed(1) : '0.0';
updateElementTextContent(`recoveryTimer_${entite.id}`, `Recovery: ${recoveryCurrent} / ${recoveryMax}s`);

	
updateCurrentAttackBar();


const prepSpan = document.getElementById(`attackPrep_${entite.id}`);
const execSpan = document.getElementById(`attackExec_${entite.id}`);

if (prepSpan && execSpan) {
  if (entite.preparationTime > 0) {
    prepSpan.style.display = 'inline';
    execSpan.style.display = 'none';
  } else if (entite.executionTime > 0) {
    prepSpan.style.display = 'none';
    execSpan.style.display = 'inline';
  } else {
    // si aucune des deux phases n'est active
    prepSpan.style.display = 'none';
    execSpan.style.display = 'none';
  }
}
}


// KILLS COUNTER
export function updateKillsCounter(killsCounterId, kills) {
    // Récupère l'élément du DOM basé sur l'ID fourni, qui devrait être de la forme "Kills_<sbireId>"
    const killsCounterElement = document.getElementById(killsCounterId);
    if (killsCounterElement) {
        // Vérifie si `kills` est `undefined` et utilise 0 comme valeur par défaut
        const killsDisplay = kills !== undefined ? kills : 0;
        // Met à jour le contenu textuel de l'élément avec le nombre de kills ou 0 si `kills` est `undefined`.
        killsCounterElement.textContent = `Kills : ${killsDisplay}`;
    }
}

// TOTAL DAMAGES COUNTER
export function updateTotalDamageCounter(TotalDamageCounterId, totalDamage) {
    // Récupère l'élément du DOM basé sur l'ID fourni, qui devrait être de la forme "Kills_<sbireId>"
    const TotalDamageCounterElement = document.getElementById(TotalDamageCounterId);
    if (TotalDamageCounterElement) {
        // Vérifie si `kills` est `undefined` et utilise 0 comme valeur par défaut
        const TotalDamageCounterDisplay = totalDamage ;
        // Met à jour le contenu textuel de l'élément avec le nombre de kills ou 0 si `kills` est `undefined`.
        TotalDamageCounterElement.textContent = `Dégats totaux : ${TotalDamageCounterDisplay}`;
    }
}

// TOTAL HEAL COUNTER
export function updateTotalHealCounter(entityId, totalHeal) {
    // Construire l'ID basé sur l'ID de l'entité
    const totalHealCounterId = `TotalHeal_${entityId}`;

    // Récupérer l'élément du DOM
    const totalHealCounterElement = document.getElementById(totalHealCounterId);
    if (totalHealCounterElement) {
        // Mettre à jour le texte de l'élément avec le total des soins
        totalHealCounterElement.textContent = `Soins totaux : ${totalHeal}`;
    } else {
        // console.error(`Élément avec l'ID ${totalHealCounterId} introuvable.`);
        return;
    }
}





// DOM TIMERS ATTAQUES
export function createAttackElementsForEntity(entites) {
    // Trouver l'élément conteneur où ajouter les attaques (par exemple, un élément avec l'ID de l'entité)
    const entityContainer = document.getElementById(`entiteDetailsContainer_${entites.id}`);
    if (!entityContainer) {
        console.error(`Conteneur pour l'entité ${entites.id} non trouvé.`);
        return;
    }
    entites.attacks.forEach(attackName => {
        const attackDetail = attackDetails.find(detail => detail.functionName === attackName);
        if (!attackDetail) {
            console.error(`Détails non trouvés pour l'attaque ${attackName}.`);
            return;
        }

        // Vérifiez le contenu de attackDetail.attackTarget
        // console.log(`Cible de l'attaque ${attackDetail.functionName} : ${attackDetail.attackTarget}`);

        let attackDetailinfos;

        if (attackDetail.attackTarget.includes('ally')) {
            attackDetailinfos = 'Allié';
        } else if (attackDetail.attackTarget.includes('enemy')) {
            attackDetailinfos = 'Ennemi';
        } else if (attackDetail.attackTarget.includes('hexa')) {
            attackDetailinfos = 'Case';
        } else {
            attackDetailinfos = 'Inconnu';
        }

        // Vérifiez le contenu de deadTarget
        let deadTargetInfo = '';
        if (attackDetail.deadTarget && attackDetail.deadTarget.includes('yes')) {
            deadTargetInfo = ' mort';
        }

        // Créer un élément pour l'attaque
        const attackElement = document.createElement('div');
        attackElement.className = 'attack-details';
        attackElement.innerHTML = `
            <div class="attackElement-attaque" id='attackElement-attaque_${attackDetail.attackId}'>
                <div class="attackElement_partie-1">
                    <img src='${attackDetail.attackAsset}' class="attackElement-asset-spell ${attackDetail.attackTarget}";><div class="picto-target-attack-detail ${attackDetail.attackTarget}"></div>
               </div> 
                <div class="attackElement_partie-2">
                    <p class="attackElement-timers">
                        <div class="attack-name-detail ${attackDetail.attackTarget.join(' ')}">${attackDetail.displayName}</div>
                        <i>Ciblage :<strong class="ciblage-attack-detail-infos"> ${attackDetailinfos}${deadTargetInfo}</strong></i><br/>
                        <i>Cooldown : ${attackDetail.cooldown / 1000}s</i><br/>
                        <i>Préparation : ${attackDetail.preparationTime / 1000}s</i><br/>
                        <i>Exécution : ${attackDetail.executionTime / 1000}s</i><br/>
                        <i>Récupération : ${attackDetail.recoveryTime / 1000}s</i>
                    </p>
                </div>
            </div>
            <p class="attack-description-detail">${attackDetail.attackDescription}</p>
        `;
        // Ajouter cet élément au conteneur de l'entité
        entityContainer.appendChild(attackElement);
    });
}



export let dotNameElement;

export function PopUpDamages(
  target,
  damage,                  // HP réellement perdus (damageApplied)
  effectName,
  popupContent,
  totalDamageSources = {},  // breakdown post-résistances (HP part)
  popupType = "normal",
  armorGate = 0             // armure tankée (absorbedByArmor)
) {
  if (!totalDamageSources || typeof totalDamageSources !== "object") {
    console.error("totalDamageSources est manquant ou invalide dans PopUpDamages.");
    totalDamageSources = {};
  }

  const entityContainer = document.getElementById(`PopUp_${target.id}`);
  if (!entityContainer) return;

  const hpLoss = Math.max(0, Math.round(Number(damage) || 0));
  const armorLoss = Math.max(0, Math.round(Number(armorGate) || 0));

  const effectClass = effectName ? `${effectName}-pop-up` : "generic-pop-up";
  const isCritical = popupType === "critical";
  const popupClass = isCritical ? "popup-critical" : "popup-normal";

  // ✅ CAS UNIQUE où 0 NE DOIT PAS S’AFFICHER :
  // Armure encaisse 100% => afficher uniquement l’armure
  if (armorLoss > 0 && hpLoss === 0) {
    const el = document.createElement("div");
    el.className = `damage-popup ${effectClass} armor ${popupClass}`;
    el.textContent = armorLoss;
    entityContainer.appendChild(el);
    setTimeout(() => el.remove(), isCritical ? 1500 : 1000);
    return;
  }

  // ✅ Si dégâts effectifs = 0 (pas d’armure absorbée non plus) => afficher 0
  if (armorLoss === 0 && hpLoss === 0) {
    if (isCritical) {
      const critElement = document.createElement("div");
      critElement.className = `damage-popup ${popupClass} ${effectClass}`;
      critElement.innerHTML = `
        <div class="picto-stat criticalChance"></div>
        <span class="critical-text">0 !</span>
      `;
      entityContainer.appendChild(critElement);
      critElement.style.transform = "scale(1.3)";
      setTimeout(() => (critElement.style.transform = "scale(1)"), 100);
      setTimeout(() => critElement.remove(), 1500);
      return;
    }

    const el = document.createElement("div");
    el.className = `damage-popup total-damage ${effectClass} ${popupClass}`;
    el.textContent = 0;
    entityContainer.appendChild(el);
    setTimeout(() => el.remove(), 1000);
    return;
  }

  // Types actifs (jamais de 0 en détail)
  const activeTypes = Object.entries(totalDamageSources)
    .filter(([_, value]) => Number(value) > 0);

  // ✅ Critique : afficher uniquement le total (pas de détails à 0)
  if (isCritical) {
    const totalShown = hpLoss + armorLoss; // (armorLoss=0 ici, sinon armor-only aurait return)
    const critElement = document.createElement("div");
    critElement.className = `damage-popup ${popupClass} ${effectClass}`;
    critElement.innerHTML = `
      <div class="picto-stat criticalChance"></div>
      <span class="critical-text">${totalShown} !</span>
    `;
    entityContainer.appendChild(critElement);
    critElement.style.transform = "scale(1.3)";
    setTimeout(() => (critElement.style.transform = "scale(1)"), 100);
    setTimeout(() => critElement.remove(), 1500);
    return;
  }

  // ✅ Normal : si un seul type et pas d’armure => popup simple
  if (armorLoss === 0 && activeTypes.length === 1) {
    const [type, value] = activeTypes[0];
    const el = document.createElement("div");
    el.className = `damage-popup ${effectClass} ${type} ${popupClass}`;
    el.textContent = value;
    entityContainer.appendChild(el);
    setTimeout(() => el.remove(), 1000);
    return;
  }

  // ✅ Sinon : total + détails (armure si >0 + types actifs)
  const totalShown = hpLoss + armorLoss;

  const totalElement = document.createElement("div");
  totalElement.className = `damage-popup total-damage ${effectClass} ${popupClass}`;
  totalElement.textContent = totalShown;
  entityContainer.appendChild(totalElement);

  const details = [];
  if (armorLoss > 0) details.push(["armor", armorLoss]);
  for (const [type, value] of activeTypes) details.push([type, value]);

  const numberOfTypes = details.length;

  details.forEach(([type, value], index) => {
    const el = document.createElement("div");
    el.className = `damage-popup ${effectClass} ${type} detail detail-${index + 1} detail-total-${numberOfTypes}`;
    el.textContent = value;
    entityContainer.appendChild(el);
  });

  setTimeout(() => {
    totalElement.remove();
    entityContainer.querySelectorAll(".damage-popup.detail").forEach(el => el.remove());
  }, 1000);
}

function CleardotName(element, delai) {
    setTimeout(() => {
        element.remove();
    }, delai);
}


// SCORING
let scoreSideA = 0;
let scoreSideB = 0;

// Function to update the score display for side A
function updateScoreDisplay() {
  document.getElementById('score').textContent = 'Score : ' + scoreSideA;
}

// Function to update the score
export function updateScore(attacker, points) {
  if (attacker.side === 'A') {
    scoreSideA += points;
  } else if (attacker.side === 'B') {
    scoreSideB += points;
  }
  updateScoreDisplay();
}

export function deductScore(target, points) {
  if (target.side === 'A') {
    scoreSideA -= points;
  } else if (target.side === 'B') {
    scoreSideB -= points;
  }
  updateScoreDisplay();
}

