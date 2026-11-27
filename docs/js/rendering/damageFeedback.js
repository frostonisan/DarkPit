// Damage feedback consumes resolved results. It owns messages, diagnostic text and VFX.
import { removeCombatVisualAfter, setTimeout, requestAnimationFrame } from "../combat/clock.js";
import { playCachedGif } from '../data/loaderList.js';
import { EffectMessage } from "../combat/effects.js";
import { animateDodge, animateIndestructibility, animateEsoterism, animateAmbidextry, damageImpact } from "./animations.js";
const round1 = value => Math.round((Number(value) || 0) * 10) / 10;

export function AmbidextryVFX(target) {
	try {
		if (typeof EffectMessage === "function") EffectMessage(target, "Ambidextrie !");
		if (typeof animateAmbidextry === "function") animateAmbidextry(target.id);

		const effectsContainer = document.getElementById(`effectsContainer_${target.id}`);
		if (!effectsContainer) return;

		const ambiVFX = document.createElement("img");
		playCachedGif(ambiVFX, `./media/assets/effects/ambidextry.gif`);
		ambiVFX.className = "effect-vfx ambidextry";
		Object.assign(ambiVFX.style, {
			position: "absolute",
			top: "50%",
			left: "50%",
			transform: "translate(-50%, -50%)",
			zIndex: "20",
			opacity: "0",
			transition: "opacity 0.2s ease-in-out"
		});

		effectsContainer.appendChild(ambiVFX);
		requestAnimationFrame(() => (ambiVFX.style.opacity = "1"));

		setTimeout(() => {
			ambiVFX.style.opacity = "0";
			removeCombatVisualAfter(ambiVFX, 200);
		}, 1800);
	} catch (vfxError) {
		console.warn(`⚠️ Erreur lors de l’affichage du VFX d’ambidextrie :`, vfxError);
	}
}

export function showResilienceCancellation(target, kind) {
  if (kind === 'resilienceCancel') {
    const effectsContainer = document.getElementById(`effectsContainer_${target.id}`);
    if (effectsContainer) {
      const resilienceVFX = document.createElement("img");
      playCachedGif(resilienceVFX, `./media/assets/effects/resilience-cancel.gif`);
      resilienceVFX.className = "effect-vfx resilience";
      resilienceVFX.style.position = "absolute";
      resilienceVFX.style.pointerEvents = "none";
      resilienceVFX.style.zIndex = "10";
      effectsContainer.appendChild(resilienceVFX);
      removeCombatVisualAfter(resilienceVFX, 2100);
    }

  }
  const stat = kind === 'resilienceCancel' ? 'resilienceTotal' : 'hindranceResistance';
  const line = document.createElement('div');
  line.className = `effect-message-line ${stat}`;
  const icon = document.createElement('span');
  icon.className = `picto-stat ${stat}`;
  icon.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span');
  label.className = stat;
  label.textContent = kind === 'resilienceCancel' ? 'Résilience totale !' : 'Entrave résistée !';
  line.append(icon, label);
  EffectMessage(target, line, stat);
}

export function attemptBattleRegen(target, hpRestored) {
  if (!target || hpRestored <= 0) return;

  let container = document.getElementById(`effectsContainer_${target.id}`);

  if (!container) {
    const sprite = document.getElementById(`spriteContainer_${target.id}`);
    if (!sprite) return;

    container = document.createElement("div");
    container.id = `effectsContainer_${target.id}`;
    container.className = "effects-container";
    sprite.appendChild(container);
  }

  const vfx = document.createElement("div");
  vfx.className = "battle-regen-hp-vfx";

  vfx.innerHTML = `
    <img src="./media/assets/ui/picto-battle-regen-hp.svg" alt="">
    <span class="healthPoint">+${hpRestored} HP</span>
  `;

  container.appendChild(vfx);
  removeCombatVisualAfter(vfx, 1200);
}

export function reportAttackDamage(preview) {
  const { attacker: a, attack: atk, details, sourcesBeforeModifiers, sources, totalDamage } = preview;

  console.log(
    `--- Calcul des dégâts pour ${a.name} utilisant ${atk.displayName || atk.functionName || "unknown"} ---`
  );

  if (details.physical.intensifier > 0) {
    console.log(
      `BRUTALITÉ-OLD : ${details.physical.stat} PP + ${details.physical.intensifier} bonus = ${details.physical.base}`
    );
  }

  if (details.magical.intensifier > 0) {
    console.log(
      `INTELLECT : ${details.magical.stat} PM + ${details.magical.intensifier} bonus = ${details.magical.base}`
    );
  }

  if (details.piercing.active) {
    if (details.piercing.isPureTranspiercing) {
      console.log(
        `TRANSPERCEMENT : ${details.piercing.stat} piercing + ${details.piercing.agilityBonus} agilité = ${details.piercing.total}`
      );
    } else {
      console.log(`Dégâts raw : ${details.piercing.total}`);
    }
  }

  if (details.hybridal.active) {
    console.log(
      `HYBRID SPLIT @BUILD ${a.name} → phys=${details.hybridal.physicalPart} | mag=${details.hybridal.magicalPart} | total=${details.hybridal.total}`
    );
  }

  if (details.physical.active) {
    console.log(`Dégâts physiques = ${details.physical.total}`, details.physical);
  }

  if (details.magical.active) {
    console.log(`Dégâts magiques = ${details.magical.total}`, details.magical);
  }

  console.log(`Détails des dégâts (avant mods):`, sourcesBeforeModifiers);
  console.log(`Détails des dégâts (après mods):`, sources, `→ total=${totalDamage}`);

}

export function presentDodgeResult(attacker, target, { partial, boostedDodgeFlat, boostedDodgePercent, baseDodgePercent, totalDodgePercent, precisionPercent, adjustedDodgeChance, adjustedHitChance, roll, dodgeSuccess }) {
  const boostedDodgeLabel = [
    boostedDodgeFlat ? `boost dodge +${round1(boostedDodgeFlat)}` : "",
    boostedDodgePercent ? `boost dodge +${round1(boostedDodgePercent)}%` : "",
  ].filter(Boolean).join(" | ");
  console.log(
  `🌀 ${target.name} → Esquive : ${totalDodgePercent}% ` +
  `(stat ${baseDodgePercent}%` +
  `${boostedDodgeLabel ? ` | ${boostedDodgeLabel}` : ""})`
);
  console.log(`🎯 ${attacker.name} → Précision : ${precisionPercent}%`);
  console.log(`⚖️ Esquive finale : ${adjustedDodgeChance}% | Chance de toucher : ${adjustedHitChance}%`);
  console.log(`🎲 Jet : ${roll.toFixed(2)} → ${dodgeSuccess ? "✅ ESQUIVE RÉUSSIE" : "💥 TOUCHE"}`);

  if (dodgeSuccess) {
    animateDodge(target.id);
    EffectMessage(target, partial ? 'Esquive partielle !' : 'Esquive !');
  }


}

export function presentIndestructibilityResult(target, { indestructPercent, minIndestructFloor, roll, success }) {
  console.log(`💠 ${target.name} → Indestructibilité : ${indestructPercent.toFixed(2)}% (plancher ${minIndestructFloor}%)`);
  console.log(`🎲 Jet : ${roll.toFixed(2)} → ${success ? "✅ INDESTRUCTIBLE" : "❌ ÉCHEC"}`);

  if (success) {
    animateIndestructibility(target.id);
    EffectMessage(target, "Indestructible !");
    const effectsContainer = document.getElementById(`effectsContainer_${target.id}`);
    if (effectsContainer) {
      const indestructVFX = document.createElement("img");
      playCachedGif(indestructVFX, `./media/assets/effects/indestructibility.gif`);
      indestructVFX.className = "effect-vfx indestructibility";
      indestructVFX.alt = `${target.name} est indestructible !`;
      indestructVFX.style.position = "absolute";
      effectsContainer.appendChild(indestructVFX);
      removeCombatVisualAfter(indestructVFX, 1200);
    }
  }


}

export function presentEsoterismResult(target, { esoterismPercent, roll, success }) {
  console.log(`🔮 ${target.name} → Ésotérisme : ${esoterismPercent.toFixed(2)}%`);
  console.log(`🎲 Jet : ${roll.toFixed(2)} → ${success ? "✅ RÉUSSITE" : "❌ ÉCHEC"}`);

  if (success) {
    animateEsoterism(target.id);
    EffectMessage(target, "Ésotérisme !");
    const effectsContainer = document.getElementById(`effectsContainer_${target.id}`);
    if (effectsContainer) {
      const esoterismVFX = document.createElement("img");
      playCachedGif(esoterismVFX, `./media/assets/effects/esoterism.gif`);
      esoterismVFX.className = "effect-vfx esoterism";
      esoterismVFX.alt = `${target.name} réduit les dégâts magiques !`;
      esoterismVFX.style.position = "absolute";
      effectsContainer.appendChild(esoterismVFX);
      removeCombatVisualAfter(esoterismVFX, 2100);
    }
  }


}

export function presentEsoterismInactive(target) {
    console.log(`🔮 ${target.name} → Ésotérisme : 0% (aucun plancher)`);
}

export function reportCriticalRoll(attacker, { critTotalChance, randomRoll, isCritical, occultismCritBoost }) {
console.log(
  `💥 ${attacker.name} → Critique : ${critTotalChance}% | roll ${randomRoll.toFixed(2)} → ${
    isCritical ? "✅ CRITIQUE" : "❌ normal"
  }${occultismCritBoost > 0 ? ` | Occultisme +${occultismCritBoost}%` : ""}`
);
}

export function reportConsumedCriticalBoost(attacker, occultismCritBoost) {
console.log(
      `🌑 Critique occulte consommé : ${attacker.name} | +${occultismCritBoost}%`
    );
}

export function presentExecutionImpact(target) {
  try {
    const effectsContainer = document.getElementById(`effectsContainer_${target.id}`);

    if (effectsContainer) {
      const procVFX = document.createElement("img");
      procVFX.className = "effect-vfx bloodfuryexec";
      procVFX.style.position = "absolute";
      procVFX.style.zIndex = "20";
      effectsContainer.appendChild(procVFX);
      const loadingTimeout = removeCombatVisualAfter(procVFX, 2000);
      procVFX.addEventListener('load', () => {
        loadingTimeout.cancel();
        // 18 frames: one 570 ms cycle, starting when the GIF is ready.
        removeCombatVisualAfter(procVFX, 570);
      }, { once: true });
      procVFX.addEventListener('error', () => {
        loadingTimeout.cancel();
        procVFX.remove();
      }, { once: true });
      playCachedGif(procVFX, `./media/assets/effects/bloodFuryExec.gif`);
    }

    damageImpact(target.id, {
      effectName: "damage-explode",
      src: "./media/assets/effects/damage-execution.gif",
      className: "blood-impact damage-explode",
      lifetime: 1450, // 1,500 ms GIF cycle, including the impact helper's 50 ms cleanup delay.
      offsetY: "10px",
      randomBloodImpact: false,
    });
  } catch (e) {
    console.warn("⚠️ Effet d’exécution non chargé :", e);
  }


}

export function presentBrokenSpell(entite, pct) {


    const effectsContainer = document.getElementById(`effectsContainer_${entite.id}`);
    if (effectsContainer) {
      const brokenVFX = document.createElement("img");
      playCachedGif(brokenVFX, `./media/assets/effects/broken-spell.gif`);
      brokenVFX.className = "effect-vfx broken-spell";
      brokenVFX.style.position = "absolute";
      brokenVFX.style.pointerEvents = "none";
      brokenVFX.style.zIndex = "10";
      effectsContainer.appendChild(brokenVFX);
      removeCombatVisualAfter(brokenVFX, 2100);
    }

    EffectMessage(entite, `Sort brisé ! (-${pct.toFixed(1)}%)`);

}
