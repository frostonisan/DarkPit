import { entites, RemoveEntite } from './entites.js';
import { runPhaseTimer, LifeandDeath } from './entityAttributs.js';
import { stopAllIntervals, setOrderSide, getOrderSide } from './gameState.js';
import { RunawayAnimation, playRunawaySuccessAnimation, orderAnimation, runawayInfosBulle } from './entitesAnimation.js';

export const fledEntities = [];
// Variables globales entites fuites 
let remainingRunaways = 0;
let successfulRunaways = 0;

export async function launchOrderCycleForSide(side, orderType) {
    setOrderSide(side);
    stopAllIntervals();

   entites.forEach(entite => LifeandDeath(entite)); // mise à jour des statuts vitaux

const executants = entites.filter(e => e.side === side && !e.isDEAD);

    if (executants.length === 0) {
        console.warn(`❌ Aucun survivant côté ${side} pour exécuter un ordre.`);
        return;
    }

    console.log(`🏃‍ Les entités du camp ${side} reçoivent l'ordre : ${orderType}`);

    // INITIALISATION SPÉCIALE POUR LA FUITE
    if (orderType === 'runaway') {
        remainingRunaways = executants.length;
        successfulRunaways = 0;
    }

    // Lancer tous les cycles en parallèle
    const promises = executants.map(entite => startOrderCycle(entite, orderType));
    await Promise.all(promises);
}

export async function startOrderCycle(entite, orderType) {
    const speedTotal = entite.stats.speed || 1000;
    const speedRestant = entite.speedTimer || 0;
    let pourcentageRempli = Math.floor(((speedTotal - speedRestant) / speedTotal) * 100);

    console.log(`🔁 Cycle d'Ordre rejoint pour ${entite.name} (ID: ${entite.id})`);
    console.log(`⏳ [DEBUT] Jauge ATB à ${pourcentageRempli}% (${speedTotal - speedRestant}ms / ${speedTotal}ms)`);

    const phase = entite.currentPhase || 'inconnue';
    console.warn(`🚫 L'ordre "${orderType}" interrompt ${entite.name} pendant la phase : [${phase}]`);


    // Enregistrer la jauge actuelle avant l'ordre (si besoin ailleurs)
    entite.ATBfillBeforeOrder = ((speedTotal - speedRestant) / speedTotal) * 100;

    // Réinitialisation de la jauge
  entite.speedTimer = 0;
entite.preparationTime = 0;
entite.executionTime = 0;
entite.recoveryTime = 0;
entite.cooldownTimer = 0;
entite.hasResetOrderTimers = true;

    // === PHASE 1 : Décision de l'ordre ===
    entite.orderPhase = 'orderDecision';
    entite.orderDecisionTimer = 2000;
    entite.recoveryTime = entite.orderDecisionTimer;
    entite.maxRecoveryTime = entite.orderDecisionTimer;

    console.log(`🧠 [DEBUT] Phase "1" pour ${entite.name} (${entite.orderDecisionTimer}ms)`);
	orderAnimation(entite);
    await runPhaseTimer(entite, 'recoveryTime', entite.orderDecisionTimer);
    console.log(`🧠 [FIN] Phase "1 Ordre" terminée pour ${entite.name}`);


    // === PHASE 2 : Exécution de l'ordre ===
    console.log(`🚀 ORDRE lancé pour ${entite.name} (ID: ${entite.id})`);
    console.log(`🕒 [DEBUT] Phase "2" (${entite.stats.speed}ms)`);
entite.orderPhase = 'orderExecution';
entite.orderExecutionTime = entite.stats.speed;
entite.maxOrderExecutionTime = entite.stats.speed;

if (orderType === 'runaway') {
    RunawayAnimation(entite);
	runawayInfosBulle(entite, 'preparation');
}
const percentRempli = (entite.speedTimer || 0) / entite.stats.speed;
const adjustedExecutionTime = entite.stats.speed * (1 - percentRempli);
entite.orderExecutionTime = adjustedExecutionTime;
entite.maxOrderExecutionTime = entite.orderExecutionTime;

    await runPhaseTimer(entite, 'orderExecutionTime', adjustedExecutionTime);

  console.log(`🕒 [DEBUT] Phase "2" (${entite.stats.speed}ms) fin`);
    // Mise à jour visuelle forcée (au cas où)
    const atbBar = document.querySelector(`#atbFill_${entite.id}`);
    if (atbBar) {
        atbBar.style.width = "100%";
        console.log(`🛠️ DOM mis à jour pour ATB de ${entite.name} → 100%`);
    }

// === PHASE 3 : Execution ===
if (entite.orderPhase === 'orderExecution') {
	console.log(`🕒 [DEBUT] Phase "3" debut ${entite.stats.speed}ms)`);
	
	// === CHOIX DE L'ORDRE ===
	if (orderType === 'runaway') {
		console.log(`🕒 [DEBUT] Phase "3" order type`); 
			
			RunawayFunction(entite); 
			console.log(`🕒 [DEBUT] Phase "3" fin ${entite.stats.speed}ms)`);
			}
		} else {console.warn(`⚠️ ${entite.name} n'est plus en phase de fuite au moment de déclencher la phase 3. Ignoré.`);
}}

async function attemptRunaway(entite) {
    const velocity = entite.stats?.velocity || 0;
    const evade = entite.stats?.evade || 0;

    const roll = Math.random() * 100;
    const total = roll + velocity + (evade * 1.5);

    console.log(`🎲 Jet de fuite pour ${entite.name} :`);
    console.log(`   ➤ Jet de base : ${roll.toFixed(2)}`);
    console.log(`   ➤ Bonus velocity : ${velocity}`);
    console.log(`   ➤ Bonus evade ×1.5 : ${(evade * 1.5).toFixed(2)}`);
    console.log(`   ➤ Total = ${total.toFixed(2)} (⛳ seuil = 50)`);

    return total > 50;
}

export async function RunawayFunction(entite) {
    const success = await attemptRunaway(entite);

    if (success) {
        console.log(`✅ ${entite.name} a réussi à fuir.`);
		runawayInfosBulle(entite, 'success'); 
        registerSuccessfulRunaway(entite);
    } else {
        console.warn(`❌ Fuite échouée pour ${entite.name}. Lancement de runawayLoop...`);
		runawayInfosBulle(entite, 'fail'); 
        await runawayLoop(entite);
    }
}



function registerSuccessfulRunaway(entite) {
    if (entite.isDEAD) {
        console.warn(`💀 ${entite.name} est déjà mort(e). Fuite ignorée.`);
        remainingRunaways -= 1;
        checkRunawayEnd();
        return;
    }

    console.log(`✅ ${entite.name} a réussi à fuir.`);

    entite.hasFled = true;                      // ✅ On marque l'entité
    fledEntities.push(entite);                  // ✅ On stocke la référence
    successfulRunaways += 1;
    remainingRunaways -= 1;

    RemoveEntite(entite, 'runaway');            // ⛔️ Doit venir **après**
    checkRunawayEnd();
}
function checkRunawayEnd() {
    if (remainingRunaways <= 0) {
        console.log(`🏁 Tous les candidats à la fuite ont fini leur cycle.`);
        if (successfulRunaways > 0) {
            console.log(`➡️ Au moins une fuite réussie ! Déclenchement animation de fin...`);
            playRunawaySuccessAnimation(); // ← ici tu peux appeler quitCurrentLevel() dedans
        } else {
            console.log(`❌ Aucune fuite réussie. On reste dans le niveau.`);
        }
    }
}

async function runawayLoop(entite) {
	if (entite.isDEAD) {
    console.warn(`💀 ${entite.name} est mort(e) pendant la boucle de fuite.`);
    remainingRunaways -= 1;
    checkRunawayEnd();
    return;
}
    console.log(`♻️ Boucle de fuite pour ${entite.name} (ID: ${entite.id})`);

    // === PHASE 1 : Récupération (vidange ATB)
    entite.orderPhase = 'runawayRecovery';
    entite.runawayLoopRecuperation = entite.stats.speed;
    entite.recoveryTime = entite.runawayLoopRecuperation;
    entite.maxRecoveryTime = entite.runawayLoopRecuperation;
    runawayInfosBulle(entite, 'fail');
    console.log(`⏳ Phase 1 [runawayRecovery] → ${entite.runawayLoopRecuperation}ms`);
    await runPhaseTimer(entite, 'recoveryTime', entite.runawayLoopRecuperation);

    // === PHASE 2 : Préparation (remplissage ATB)
    entite.orderPhase = 'runawayPreparation';
    entite.runawayLoopPreparation = entite.stats.speed;
    entite.preparationTime = entite.runawayLoopPreparation;
    entite.maxPreparationTime = entite.runawayLoopPreparation;
    entite.speedTimer = entite.runawayLoopPreparation;

    console.log(`⚙️ Phase 2 [runawayPreparation] → ${entite.runawayLoopPreparation}ms`);
    runawayInfosBulle(entite, 'preparation');
    await runPhaseTimer(entite, 'speedTimer', entite.runawayLoopPreparation);

    // 🔴 Nettoyage manuel de l’infobulle "preparation"
    const prepInfo = document.querySelector(`#effectsContainer_${entite.id} .runaway-info.preparation`);
    if (prepInfo) prepInfo.remove();

    // === PHASE 3 : Exécution (tentative de fuite)
    entite.orderPhase = 'runawayExecution';
    entite.orderExecutionTime = entite.stats.speed;
    entite.maxOrderExecutionTime = entite.stats.speed;

    console.log(`🎯 Phase 3 [runawayExecution] → tentative de fuite`);
	if (entite.isDEAD) {
    console.warn(`💀 ${entite.name} est mort(e) juste avant une nouvelle tentative.`);
    remainingRunaways -= 1;
    checkRunawayEnd();
    return;
}
    const success = await attemptRunaway(entite);

    if (success) {
        console.log(`✅ Fuite réussie pendant runawayLoop pour ${entite.name}`);
		runawayInfosBulle(entite, 'success');
        registerSuccessfulRunaway(entite);
    } else {
        console.warn(`❌ Fuite échouée pour ${entite.name}. Reprise de la boucle...`);
		runawayInfosBulle(entite, 'fail');
        await runawayLoop(entite);
    }
}
