import { setDisplayStyle, setDisplayText } from "./displayBatch.js";
import { createArmorCounter, createExtraLifeCounter, createFadedLifeCounter } from "./entities.js";
// Presentation of resolved vital outcomes; never changes HP, armor, scores or persistence.
import { PopUpDamages, updateTotalHealCounter } from "./hud.js";

import { showHealingFeedback } from "../combat/effects.js";
import {
  damageImpact, damageArmorImpact, shakeImpact, brokenMagicImpact, applyEntityTint, releaseEntityTint,
} from "./animations.js";
import { syncEntityAuras } from "./auras.js";
import { setTimeout } from "../combat/clock.js";

export function presentEntityVitals(entity) {
  updateHealthBar(entity.stats.HP.current, entity.stats.HP.max,
    entity.stats.armor?.current || 0, entity.stats.armor?.max || 0, entity.id, entity.stats.HP.uncorruptedMax || 0);
}

export function presentSupportHealing(attacker, target, healedHP) {
  updateTotalHealCounter(attacker.id, attacker.totalHeal);
  presentEntityVitals(target);
  if (healedHP > 0) showHealingFeedback(target, healedHP);
}

export function presentDamageOutcome(target, { hpDamage, armorDamage, effects, content,
  sources = {}, popupType = '', nature, execution = false, critical = false }) {
  const finalPopupType = execution ? (critical ? 'execution-critical' : 'execution') : popupType;
  PopUpDamages(target, hpDamage, effects, content, sources, finalPopupType, armorDamage, nature);
}

export function presentExecutionHealing(attacker, healedHP) {
  presentEntityVitals(attacker);
  updateHPCounters(attacker.id, attacker.stats.HP.current, attacker.stats.HP.max);
  if (healedHP > 0) PopUpDamages(attacker, healedHP, 'blood-glutony', null, {}, 'blood-glutony');
}

export function presentVitalImpact(target, { broken, armored }) {
  if (broken) {
    brokenMagicImpact(target.id);
  } else if (armored) {
    damageArmorImpact(target.id);
  } else {
    damageImpact(target.id);
  }

  if (broken) {
    brokenMagicImpact(target.id);
  }

  shakeImpact(target.id);
}

export function presentBloodCrazyGain(attacker) {
  syncEntityAuras(attacker, "battle");

  const attackerCanvas = document.getElementById(`spriteCanvas_${attacker.id}`);

  if (attackerCanvas) {
    applyEntityTint(attackerCanvas, "bloodCrazy", 0.65);
  }

  const auraContainer = document.querySelector(`#auraContainer_${attacker.id}`);

  if (auraContainer && !auraContainer.querySelector(".picto-stat.bloodCrazy")) {
    const bloodCrazyAura = document.createElement("div");
    bloodCrazyAura.className = "picto-stat bloodCrazy";
    auraContainer.appendChild(bloodCrazyAura);
  }
}

export function presentBloodCrazyConsumption(attacker) {
  // Le module centralisé nettoie les FX, timers et glow de combat.
  syncEntityAuras(
    attacker,
    "battle"
  );

  // Mise à jour immédiate du Codex lorsqu’il est ouvert.
  const codexAuraContainer =
    document.getElementById(
      `auraContainer_codex_${attacker.id}`
    );

  if (codexAuraContainer) {
    syncEntityAuras(
      attacker,
      codexAuraContainer
    );
  }

  // Le pictogramme est encore créé manuellement :
  // il reste donc nettoyé ici.
  document
    .querySelectorAll(
      `#auraContainer_${attacker.id}
       .picto-stat.bloodCrazy,
       #auraContainer_codex_${attacker.id}
       .picto-stat.bloodCrazy`
    )
    .forEach((element) => {
      element.classList.add("consumed");

      setTimeout(() => {
        element.remove();
      }, 450);
    });

  const attackerCanvas =
    document.getElementById(
      `spriteCanvas_${attacker.id}`
    );

  if (attackerCanvas) {
    releaseEntityTint(
      attackerCanvas,
      "bloodCrazy"
    );
  }
}

export function presentVitalSummary({ attacker, target, totalDamageSourcesReduced,
  absorbedByArmor, damageCredited, purePiercingArmorBypass, damageApplied }) {
console.log(`
==============================
⚔️ RÉSUMÉ FINAL DÉGÂTS
==============================
👤 Attaquant : ${attacker.name}
🎯 Cible : ${target.name}
🗡️ Sources finales HP :→ Piercing : ${totalDamageSourcesReduced.piercingDamage || 0}
→ Physique : ${totalDamageSourcesReduced.physical || 0}
→ Magique : ${totalDamageSourcesReduced.magical || 0}
→ Hybride : ${totalDamageSourcesReduced.hybridalDamage || 0}

🛡️ Armor absorbée :
→ ${absorbedByArmor || 0}

📊 Dégâts crédités (armure + HP) :
→ ${damageCredited}

🗡️ Armor bypass :
→ ${purePiercingArmorBypass || 0}

❤️ HP perdus :
→ ${damageApplied || 0}

🧱 Armor restante :
→ ${target.stats?.armor?.current || 0}/${target.stats?.armor?.max || 0}

💀 HP restants :
→ ${target.stats?.HP?.current || 0}/${target.stats?.HP?.max || 0}
==============================
`);
}

export function presentDamageResolution(ctx) {
  const title =
    `📌 [FINAL] ${ctx.attacker?.name || "?"} → ${ctx.target?.name || "?"}` +
    ` | ${ctx.attack?.label || ctx.attack?.functionName || "attaque"}`;

  console.groupCollapsed(title);

  console.log("Attaque", ctx.attack);
  console.log("Entrée", ctx.input);

  if (ctx.execution?.attempted)      console.log("0) Exécution", ctx.execution);
  if (ctx.armor?.attempted)          console.log("1) Armure", ctx.armor);
  if (ctx.indestructible?.attempted) console.log("2) Indestructible", ctx.indestructible);

  console.log("3) Sources", ctx.sources);

  if (ctx.rangeRatio?.attempted) {
    console.log("3.5) RangeRatio", ctx.rangeRatio);
  }
  if (ctx.resilience?.attempted) {
    console.log("4) Résilience", ctx.resilience);
  }

  console.log("5) Résistances", ctx.resistances);

  if (ctx.esoterism?.attempted) console.log("6) Ésotérisme", ctx.esoterism);
  if (ctx.critical?.attempted) console.log("7) Critique", ctx.critical);

  console.log("8) Totaux", ctx.totals);
  console.log("9) PV", ctx.hp);

  console.log("PopUp", { popupType: ctx.popupType, popupContent: ctx.popupContent });
  console.log("Effets appliqués", ctx.effectsApplied || []);
  console.log("SelfEffects", ctx.selfEffects || []);
  console.groupEnd();
}

// Barres et compteurs : affichage des valeurs deja appliquees.
export function ensureHPDom(entityId, label = "Points de vie") {
  const containers = document.querySelectorAll(
    `.stat-container[data-stat="HP"][data-entity-id="${entityId}"]`
  );
  if (!containers.length) return;

  containers.forEach(container => {
    const existing = container.querySelector(`.entite-stat[data-stat="HP"][data-entity-id="${entityId}"]`);
    if (existing) return;

    const oldText = container.textContent.trim();
    container.textContent = "";

    const wrap = document.createElement("div");
    wrap.className = "stat-picto-valeur HP";
    wrap.innerHTML = `
      <div class="picto-stat HP"></div>
      <div class="stat-name">${label}</div>
      <div class="entite-stat" data-entity-id="${entityId}" data-stat="HP"></div>
      <div class="separator-stats-preview">&gt;</div>
      <div class="entite-stat preview is-hidden" data-entity-id="${entityId}" data-stat="HP"></div>
    `;
    container.appendChild(wrap);

    const perm = wrap.querySelector(`.entite-stat[data-stat="HP"][data-entity-id="${entityId}"]:not(.preview)`);
    const m = oldText.match(/(\d+)\s*\/\s*(\d+)/);
if (perm && m) perm.textContent = `${m[1]} / ${m[2]}`;
  });
}

export function updateHPCounters(entityId, currentHP, maxHP) {
  if (!entityId) return;

  const cur = Number(currentHP ?? 0);
  const max = Number(maxHP ?? 0);

  document
    .querySelectorAll(`.HP-counter[data-stat="HP"][data-entity-id="${entityId}"]`)
    .forEach(el => {
      setDisplayText(el, `HP : ${cur} / ${max}`);
    });
}

function ensureArmorBarDom(entityId, initialArmor = 0) {
  const existingHpBar = document.querySelector(
    `.health-bar[data-stat="hp-bar"][data-entity-id="${entityId}"]`
  ) || document.querySelector(`.health-bar[data-entity-id="${entityId}"]`);

  const barsContainer =
    document.getElementById(`HeadsupLifeBars_${entityId}`) ||
    document.getElementById(`CodexLifeBars_${entityId}`) ||
    existingHpBar?.closest?.(".life-bars-container");

  if (!barsContainer) return null;

  let armorBar = barsContainer.querySelector(
    `.armor-bar[data-stat="armor-bar"][data-entity-id="${entityId}"]`
  );
  if (armorBar) return armorBar;

  const hpBar = barsContainer.querySelector(
    `.health-bar[data-stat="hp-bar"][data-entity-id="${entityId}"]`
  ) || barsContainer.querySelector(`.health-bar[data-entity-id="${entityId}"]`) || existingHpBar;

  const sideClass =
    hpBar?.classList.contains("A") ? "A" :
    hpBar?.classList.contains("B") ? "B" : "";

  armorBar = document.createElement("div");
  armorBar.className = `armor-bar ${sideClass}`.trim();
  armorBar.dataset.stat = "armor-bar";
  armorBar.dataset.entityId = entityId;
  armorBar.dataset.prevArmor = String(initialArmor);

  const armorFill = document.createElement("div");
  armorFill.className = "armor-fill";
  armorFill.style.width = "100%";
  armorFill.style.transition = "width 0.5s ease";

  armorBar.appendChild(armorFill);

  // insertion après HP bar (HP puis Armor dans la jauge)
  if (hpBar) hpBar.insertAdjacentElement("afterend", armorBar);
  else barsContainer.appendChild(armorBar);

  return armorBar;
}

export function updateHealthBar(currentHP, maxHP, currentArmor, maxArmor, entityId, uncorruptedMax) {
  ensureHPDom(entityId);
  const healthBars = [...document.querySelectorAll(`.health-bar[data-stat="hp-bar"][data-entity-id="${entityId}"]`)];
  const originalMax = Math.max(maxHP, Number(uncorruptedMax ?? healthBars[0]?.dataset.uncorruptedMax) || 0);
  const lostCapacity = Math.max(0, originalMax - maxHP);
  for (const bar of healthBars) {
    if (uncorruptedMax !== undefined) bar.dataset.uncorruptedMax = String(uncorruptedMax || 0);
    let segment = bar.parentElement.querySelector(':scope > .corruption-capacity');
    if (!segment && lostCapacity > 0) {
      segment = document.createElement('div'); segment.className = 'corruption-capacity';
      segment.setAttribute('aria-label', 'PV maximum retirés par Corruption prismatique');
      bar.parentElement.append(segment);
    }
    if (segment) {
      setDisplayStyle(segment, 'display', lostCapacity > 0 ? '' : 'none');
      setDisplayStyle(segment, 'width', `${lostCapacity / originalMax * 100}%`);
    }
  }

  // --- 2) Clamp ---
  const validHP = Math.max(0, Math.min(currentHP, maxHP));
  const validArmor = Math.max(0, Number(currentArmor) || 0);

  updateHPCounters(entityId, validHP, maxHP);

  // ✅ CRÉATION DOM ARMOR BAR (si elle n’existe pas)
  // Tu peux mettre la condition que tu veux :
  // - maxArmor > 0 (armure robuste régénérable)
  // - validArmor > 0 (armure externe ou stuff, même non régénérable)
  if (maxArmor > 0 || validArmor > 0) ensureArmorBarDom(entityId, validArmor);

  // --- 3) Calculs de base ---
  const totalHPArmor = validHP + validArmor;
  let hpPercent, armorPercent, mode;

  if (totalHPArmor < maxHP) {
    mode = "absolu";
    hpPercent = (validHP / maxHP) * 100;
    armorPercent = (validArmor / maxHP) * 100;
  } else if (totalHPArmor === maxHP) {
    mode = "plein";
    hpPercent = (validHP / maxHP) * 100;
    armorPercent = (validArmor / maxHP) * 100;
  } else {
    mode = "normalisé";
    const total = totalHPArmor;
    hpPercent = (validHP / total) * 100;
    armorPercent = (validArmor / total) * 100;
  }

  const hpColorPercent = (validHP / maxHP) * 100;
  const availableRatio = maxHP / originalMax;
  hpPercent *= availableRatio; armorPercent *= availableRatio;

  // --- 4) ARMURE ---
  document.querySelectorAll(
    `.armor-bar[data-stat="armor-bar"][data-entity-id="${entityId}"]`
  ).forEach(armorBar => {
    const armorFill = armorBar.querySelector(".armor-fill");
    const armorText = armorBar.querySelector(
      `.armor-text[data-stat="armor-text"][data-entity-id="${entityId}"]`
    );

    if (armorFill) setDisplayStyle(armorFill, 'transition', "width 0.5s ease");

    if (validArmor <= 0) {
      setDisplayStyle(armorBar, 'display', "none");
    } else {
      setDisplayStyle(armorBar, 'display', "");
      setDisplayStyle(armorBar, 'width', `${armorPercent}%`, 'important');
      setDisplayStyle(armorBar, 'flex', `0 0 ${armorPercent}%`);
      if (armorFill) setDisplayStyle(armorFill, 'width', "100%");

      const prevArmor = Number(armorBar.dataset.prevArmor ?? validArmor);
      if (validArmor < prevArmor) (armorFill || armorBar).animate(
        [
          { backgroundColor: "rgba(255,255,255,0.7)", filter: "brightness(1.5)" },
          { filter: "brightness(1)" }
        ],
        { duration: 180, easing: "ease-out" }
      );

      armorBar.dataset.prevArmor = String(validArmor);
    }

    if (armorText) setDisplayText(armorText, `🛡️ ${validArmor}`);
  });

  // --- 5) HP ---
  healthBars.forEach(healthBar => {
    const healthFill = healthBar.querySelector(".health-fill");
    if (healthFill) setDisplayStyle(healthFill, 'transition', "width 0.5s ease, background-color 0.5s ease");
    setDisplayStyle(healthBar, 'width', `${hpPercent}%`, 'important');
    setDisplayStyle(healthBar, 'flex', `0 0 ${hpPercent}%`);
    updateHealthBarAnimation(healthBar, hpColorPercent);
  });

  // --- 6) Texte HP ---
  document.querySelectorAll(
    `.entite-stat[data-stat="HP"][data-entity-id="${entityId}"]:not(.preview):not([data-display="max"])`
  ).forEach(el => {
    if (!el.closest('.item-description-card, .item-stats-block')) setDisplayText(el, `${validHP} / ${maxHP}`);
  });

  // --- 7) Texte ARMURE ---
  document.querySelectorAll(
    `.armor-counter[data-entity-id="${entityId}"]`
  ).forEach(el => {
    if (validArmor <= 0) setDisplayStyle(el, 'display', "none");
    else {
      setDisplayStyle(el, 'display', "");
      setDisplayText(el, `🛡️ ${validArmor}`);
    }
  });

  document.querySelectorAll(
    `.entite-stat[data-stat="armor"][data-entity-id="${entityId}"]:not(.preview):not([data-display="max"])`
  ).forEach(el => {
    if (el.closest('.item-description-card, .item-stats-block')) return;
    const profileRow = el.closest(".codex-profile-battle-stat");

    if (validArmor <= 0) {
      if (profileRow) setDisplayStyle(profileRow, 'display', "none");
      else setDisplayStyle(el, 'display', "none");
      return;
    }

    if (profileRow) setDisplayStyle(profileRow, 'display', "");
    setDisplayStyle(el, 'display', "");
    setDisplayText(el, String(validArmor));
  });

  return { currentHP: validHP, currentArmor: validArmor };
}

export function updateHealthBarAnimation(healthBar, percentage) {
  const healthFill = healthBar.querySelector('.health-fill');

  // ✅ gère A/SideA et B/SideB
  const isA = healthBar.classList.contains('A') || healthBar.classList.contains('SideA');
  const isB = healthBar.classList.contains('B') || healthBar.classList.contains('SideB');

  let color;
  if (isA) {
    const red = Math.round(255 - (percentage / 100) * 255);
    const green = Math.round((percentage / 100) * 255);
    color = `rgb(${red}, ${green}, 0)`; // rouge → vert
  } else if (isB) {
    const red = Math.round(255 - (percentage / 100) * 173);
    color = `rgb(${red}, 0, 0)`; // rouge sombre
  } else {
    const red = Math.round(255 - (percentage / 100) * 255);
    const green = Math.round((percentage / 100) * 255);
    color = `rgb(${red}, ${green}, 0)`;
  }

  if (healthFill) {
    setDisplayStyle(healthFill, 'transition', 'background-color 0.5s ease');
    setDisplayStyle(healthFill, 'backgroundColor', color);
  } else {
    setDisplayStyle(healthBar, 'transition', 'background-color 0.5s ease');
    setDisplayStyle(healthBar, 'backgroundColor', color);
  }

if (percentage <= 30) {
  const maxDuration = 1.0;   // durée du clignotement à 30 % HP
  const minDuration = 0.04;  // durée minimale à 0 % HP
  const normalized = Math.max(0, Math.min(percentage / 30, 1));
  // exponent plus faible pour accélérer davantage à la fin
  const duration = minDuration + Math.pow(normalized, 1.5) * (maxDuration - minDuration);
  setDisplayStyle(healthBar, 'animation', `blink ${duration}s ease-in-out infinite`);
} else {
  setDisplayStyle(healthBar, 'animation', '');
  setDisplayStyle(healthBar, 'opacity', '1');
}

}

// Compteurs des vies supplementaires et auras associees.
export function updateBonusLifeCounters(entite) {
  if (!entite?.id) return;
  ensureExtraLifeCounter(entite);
  ensureFadedLifeCounter(entite);

  const id = entite.id;

  // ---- fadedLife (nombre, legacy objet toléré) ----
  const rawF = entite?.stats?.fadedLife;
  const faded = Math.max(
    0,
    Number(typeof rawF === "object" ? (rawF?.current ?? 0) : (rawF ?? 0)) || 0
  );

  const fadedContainers = document.querySelectorAll(`.fadedLife-counter[data-entity-id="${id}"]`);
  const fadedValues     = document.querySelectorAll(`.fadedLife-value[data-entity-id="${id}"]`);

  fadedContainers.forEach(node => {
    node.style.display = faded > 0 ? "" : "none";
  });
  fadedValues.forEach(node => {
    node.textContent = faded > 0 ? `: ${faded}` : "";
  });

// ---- eternalLife (objet {current,max}) ----
const et = entite?.stats?.eternalLife;
const etCurrent = et && typeof et === "object" ? (Number(et.current ?? 0) || 0) : 0;
const etMax     = et && typeof et === "object" ? (Number(et.max ?? 0) || 0) : 0;

const showEternal = etMax > 0;

const eternalContainers = document.querySelectorAll(`.eternalLife-counter[data-entity-id="${id}"]`);
const eternalValues     = document.querySelectorAll(`.eternalLife-value[data-entity-id="${id}"]`);

eternalContainers.forEach(node => {
  node.style.display = showEternal ? "" : "none";
});

eternalValues.forEach(node => {
  node.textContent = showEternal ? `: ${etCurrent}/${etMax}` : "";
});

  // ---- extraLife (objet {current,max} ; tolérance si nombre) ----
  const ex = entite?.stats?.extraLife;
  const exCurrent =
    ex && typeof ex === "object" ? (Number(ex.current ?? 0) || 0) :
    (typeof ex === "number" ? ex : 0);

  const exMax =
    ex && typeof ex === "object" ? (Number(ex.max ?? 0) || 0) : 0;

  const showExtra = exCurrent > 0 || exMax > 0;

  const extraContainers = document.querySelectorAll(`.extraLife-counter[data-entity-id="${id}"]`);
  const extraValues     = document.querySelectorAll(`.extraLife-value[data-entity-id="${id}"]`);

  extraContainers.forEach(node => {
    node.style.display = showExtra ? "" : "none";
  });

  extraValues.forEach(node => {
    if (!showExtra) {
      node.textContent = "";
      return;
    }
    if (exMax > 0) node.textContent = `: ${exCurrent}/${exMax}`;
    else node.textContent = `: ${exCurrent}`;
  });
  document.querySelectorAll('.codex-colomn-5[data-entity-id]').forEach(column => {
    if (column.dataset.entityId === String(id)) column._refreshLives?.(entite);
  });
  syncEntityAuras(entite, 'battle', { lifeOnly: true });
  syncEntityAuras(entite, 'codex', { lifeOnly: true });
}

function getLifeCounterContainer(entite) {
  return document.querySelector(`.life-bar-counter[data-entity-id="${entite.id}"]`);
}

function ensureArmorCounter(entite) {
  if (!entite?.id) return null;

  const id = entite.id;

  // Si le counter existe déjà, on le récupère.
  // Attention : il peut être au mauvais endroit, donc on ne return pas tout de suite.
  let node = document.querySelector(`.armor-counter[data-entity-id="${id}"]`);

  // ✅ Exception Codex :
  // Dans le codex, armor-counter doit être enfant direct de .codex-entite-infos,
  // placé avant .headsup-HP-container.
  const codexInfos = document
    .querySelector(
      `.codex-entite-infos #headsup-HP-container_${id},
       .codex-entite-infos .headsup-HP-container[data-entity-id="${id}"]`
    )
    ?.closest(".codex-entite-infos");

  if (codexInfos) {
    if (!node) {
      node = createArmorCounter(entite);
      if (!node) return null;
    }

    node.classList.add("hu");
    node.dataset.stat = "armor";
    node.dataset.entityId = id;

    const hpContainer = codexInfos.querySelector(
      `#headsup-HP-container_${id},
       .headsup-HP-container[data-entity-id="${id}"]`
    );

    if (node.parentElement !== codexInfos) {
      if (hpContainer) codexInfos.insertBefore(node, hpContainer);
      else codexInfos.appendChild(node);
    }

    return node;
  }

  // ✅ Cas normal : combat / HUD
  const wrap = getLifeCounterContainer(entite);
  if (!wrap) return node;

  // Si déjà dans le bon wrap, rien à faire
  if (wrap.querySelector(`.armor-counter[data-entity-id="${id}"]`)) {
    return wrap.querySelector(`.armor-counter[data-entity-id="${id}"]`);
  }

  if (!node) {
    node = createArmorCounter(entite);
    if (!node) return null;
  }

  node.classList.add("hu");
  node.dataset.stat = "armor";
  node.dataset.entityId = id;

  // insertion après HP si possible
  const hpNode = wrap.querySelector(`.HP-counter[data-entity-id="${id}"]`);

  if (hpNode) {
    hpNode.insertAdjacentElement("afterend", node);
  } else {
    wrap.prepend(node);
  }

  return node;
}

export function updateArmorCounter(entite) {
  if (!entite?.id) return;

  ensureArmorCounter(entite);

  const id = entite.id;
  const currentArmor = entite?.stats?.armor?.current ?? 0;
  const show         = currentArmor > 0;

  document.querySelectorAll(`.armor-counter[data-entity-id="${id}"]`).forEach(node => {
    node.style.display = show ? "" : "none";
    if (show) node.textContent = `🛡️ ${currentArmor}`;
  });
}

function ensureExtraLifeCounter(entite) {
  const wrap = getLifeCounterContainer(entite);
  if (!wrap) return;

  const id = entite.id;
  if (wrap.querySelector(`.extraLife-counter[data-entity-id="${id}"]`)) return;

  const node = createExtraLifeCounter(entite); // ✅ réutilise ta factory
  if (!node) return; // extraLife pas encore "showable"

  // Order : avant fadedLife si déjà présent
  const fadedNode = wrap.querySelector(`.fadedLife-counter[data-entity-id="${id}"]`);
  if (fadedNode) wrap.insertBefore(node, fadedNode);
  else wrap.appendChild(node);
}

function ensureFadedLifeCounter(entite) {
  const wrap = getLifeCounterContainer(entite);
  if (!wrap) return;

  const id = entite.id;
  if (wrap.querySelector(`.fadedLife-counter[data-entity-id="${id}"]`)) return;

  const node = createFadedLifeCounter(entite); // ✅ réutilise ta factory
  if (!node) return; // fadedLife pas encore "showable"

  wrap.appendChild(node);
}
