import { checkGameOver, stopAllIntervals, OrderEntity} from './gameState.js';
import { entites, calculateResistances, calculateBloodFuryPercent,updateEternalLifeRegenOrders, updateExtraLifeRegenOrders, syncEternalLifeCurrentFromRegen, syncExtraLifeCurrentFromRegen } from './entites.js'; 
import { updateTimerDisplay, updateKillsCounter, updateTotalDamageCounter, PopUpDamages, updateTotalHealCounter, updateScore, deductScore } from './dom.js';
import { updateHealthBar, updateHPCounters } from './UpgradeEntity.js';
import { toggleEffectClass, poison, brulure, heal, rez, lifesteal, LifestealBloodFury } from './attackEffectMecanics.js';
import { summonJarret, summonProfanation } from './summonsMecanics.js';
import { attackEffects } from './attackEffects.js';
import { attackDetails } from './attackList.js'; 
import { updateGlobalRoleSbire, TraitementRolesSbires } from './load-entity.js'; 
import { entiteCamp } from './fight.js'; 
import { saveToLocalStorage, loadFromLocalStorage } from './GameStorage.js';
import { updateEntityStatusInStorage, saveEntityHPToStorage, saveEntityextraLifeToStorage, saveEntityfadedLifeToStorage, saveEntityEternalLifeToStorage, saveEntityEternalLifeRegenToStorage, saveEntityExtraLifeRegenToStorage } from './entityUpdatesStorage.js';
import { updateSpriteUI, damageImpact, damageArmorImpact, shakeImpact } from './entitesAnimation.js';
import { toNumber, attemptAttackerDamages, attemptIndestructibility, attemptEsoterism, attemptAstrality, attemptBloodFuryExec, calculateBloodFuryExecChanceBonus, attemptCriticalHit, attemptResilience, attemptResilienceCancel, attemptResilienceCritReduction, calculateExtraLifeResurrect, attemptTranscendenceConsoProtection, calculateRangeRatio, caluclateIndestructibilityReductionTotal, calculateEsoterismtotalReduction } from './damagesCalcul.js';
import { createExtraLifeCounter, createArmorCounter, createFadedLifeCounter, syncEntityAuras } from './createEntity.js';
import { isRegenKey, toNonNegInt } from './ui.js';
// LIFE AND DEATH
// Intégrez l'appel de cette fonction dans votre fonction LifeandDeath
export function LifeandDeath(entite, attacker = null) {
  if (!entite?.stats?.HP) return;

  const statutArr = Array.isArray(entite.statut) ? entite.statut : [];
  const wasDead  = statutArr.includes("dead");
  const wasAlive = statutArr.includes("alive");

  // 0) Sécurité : statut déjà mort
  if (wasDead) {
    entite.isDEAD = true;
    entite.stats.HP.current = 0;

    console.log(`Correction: ${entite.name} était déjà mort selon son statut.`);
    updateEntityStatusInStorage(entite);

    // UI
    updateHPCounters(entite.id, 0, entite.stats.HP.max ?? 0);
    updateBonusLifeCounters(entite);

    CreateDeadSprite(entite);
    return;
  }

  // 1) Si HP <= 0 : on tente les mécaniques de survie
  const hpCur = Number(entite.stats.HP.current ?? 0) || 0;

  if (hpCur <= 0) {
    const targetElement = document.getElementById(`sbire_${entite.id}`);

    // 1.a) Cas resurrected (flag DOM)
    if (targetElement?.classList.contains("resurrected")) {
      rez(entite, attacker);
      entiteCamp(entites);
      targetElement.classList.remove("resurrected");

      // UI (le rez peut déjà le faire, mais là tu garantis la synchro)
      updateBonusLifeCounters(entite);
      updateHPCounters(entite.id, entite.stats.HP.current ?? 0, entite.stats.HP.max ?? 0);

      return;
    }

    // 1.b) fadedLife (prioritaire, détruite définitivement)
    if (attemptExtraLife(entite, { pool: "fadedLife", destroyOnUse: true })) {
      updateBonusLifeCounters(entite);
      return;
    }

    // 1.c) extraLife (réutilisable, max ne bouge pas)
    if (attemptExtraLife(entite, { pool: "extraLife", destroyOnUse: false })) {
      updateBonusLifeCounters(entite);
      return;
    }
// 1.d) eternalLife (unique)
if (attemptExtraLife(entite, { pool: "eternalLife", destroyOnUse: false })) {
  updateBonusLifeCounters(entite);
  return;
}
    // 1.e) Mort définitive
    entite.isDEAD = true;
    entite.statut = ["dead"];
    entite.stats.HP.current = 0;

    console.log(`${entite.name} est mort pour de bon (plus de vies).`);
    updateEntityStatusInStorage(entite);

    // UI
    const armorCur = entite.stats?.armor?.current ?? 0;
    const armorMax = entite.stats?.armor?.max ?? 0;

    updateHealthBar(0, entite.stats.HP.max ?? 0, armorCur, armorMax, entite.id, 0);
    updateHPCounters(entite.id, 0, entite.stats.HP.max ?? 0);
    updateBonusLifeCounters(entite);

    CreateDeadSprite(entite);

    stopAllIntervals();
    checkGameOver(entites);
    updateGlobalRoleSbire();
    TraitementRolesSbires();
    return;
  }

  // 2) Encore vivant
  entite.isDEAD = false;

  if (!wasAlive) {
    entite.statut = ["alive"];
    console.log(`${entite.name} est toujours en vie.`);
    updateEntityStatusInStorage(entite);
  }

  // UI : resync compteur (optionnel, mais propre)
  updateBonusLifeCounters(entite);

  // Réinit visuelle
  const sprite = document.getElementById(`sprite_${entite.id}`);
  const sbire  = document.getElementById(`sbire_${entite.id}`);

  if (sprite) {
    sprite.classList.remove("dead", "hbox");
    sprite.classList.add("hb");
  }
  if (sbire) {
    sbire.classList.remove("dead", "hbox");
  }
}
export function getPoolCurrent(raw) {
  if (raw && typeof raw === "object") return Math.max(0, toNumber(raw.current, 0));
  return Math.max(0, toNumber(raw, 0));
}

function consumeLifePool(entite, key, { destroyOnUse = false } = {}) {
  if (!entite?.stats) return false;

  if (key === "fadedLife") {
    const raw = entite.stats.fadedLife;
    const cur = getPoolCurrent(raw);
    if (cur <= 0) return false;

    // ✅ Protection Transcendance : résurrection OK, pas de conso (avec FX)
    if (attemptTranscendenceConsoProtection(entite)) {
      syncEntityAuras(entite, "battle");
      return true;
    }

    const next = cur - 1;

    if (typeof raw === "object") {
      if (next > 0) entite.stats.fadedLife = { ...(raw || {}), current: next };
      else delete entite.stats.fadedLife;
    } else {
      if (next > 0) entite.stats.fadedLife = next;
      else delete entite.stats.fadedLife;
    }

    saveEntityfadedLifeToStorage(entite);

    // ✅ Aura update après conso
   syncEntityAuras(entite, "battle");

    return true;
  }

  if (key === "extraLife") {
    const cur = getPoolCurrent(entite.stats.extraLife);
    if (cur <= 0) return false;

    // ✅ Protection Transcendance : résurrection OK, pas de conso (avec FX)
    if (attemptTranscendenceConsoProtection(entite)) {
      syncEntityAuras(entite, "battle");
      return true;
    }

    const ok = extraLifeConsumption(entite);

    // ✅ Aura update après conso (si ok)
    if (ok) {
     syncEntityAuras(entite, "battle");
    }

    return ok;
  }

  if (key === "eternalLife") {
    const cur = getPoolCurrent(entite.stats.eternalLife);
    if (cur <= 0) return false;

    // ✅ Protection Transcendance : résurrection OK, pas de conso (avec FX)
    if (attemptTranscendenceConsoProtection(entite)) {
     syncEntityAuras(entite, "battle");
      return true;
    }

    const ok = eternalLifeConsumption(entite);

    // ✅ Aura update après conso (si ok)
    if (ok) {
      syncEntityAuras(entite, "battle");
    }

    return ok;
  }

  return false;
}

const DEFAULT_VFX_BY_POOL = {
  extraLife: "/media/assets/effects/life.gif",
  fadedLife: "/media/assets/effects/fadedlife.gif",
  eternalLife: "/media/assets/effects/eternallife.gif", 
};

// ✅ Par défaut : extraLife est dynamique (20% + INT%) via calculateExtraLifeResurrect()
const DEFAULT_HEAL_RATIO_BY_POOL = {
  fadedLife: 0.50,   // 50%
  eternalLife: 1.00, // 100%
  extraLife: (entite) => {
    // totalPercent = 20 + (INT * 1)
    const { totalPercent } = calculateExtraLifeResurrect(entite, {
      basePercent: 20,
      perIntel: 1
    });
    return totalPercent / 100;
  }
};

function resolveHealRatio({ entite, pool, healRatio, healRatioByPool }) {
  // 1) override ponctuel
  if (typeof healRatio === "number") return healRatio;

  const entry = healRatioByPool?.[pool];

  // 2) entrée dynamique
  if (typeof entry === "function") return entry(entite);

  // 3) entrée statique
  if (typeof entry === "number") {
    // si quelqu’un force un number pour extraLife, on respecte,
    // mais tu peux supprimer ce "if" si tu veux extraLife toujours dynamique.
    return entry;
  }

  // 4) fallback solide : si extraLife et pas défini, on calcule quand même
  if (pool === "extraLife") {
    const { totalPercent } = calculateExtraLifeResurrect(entite, {
      basePercent: 20,
      perIntel: 1
    });
    return totalPercent / 100;
  }

  // 5) fallback final
  return DEFAULT_HEAL_RATIO_BY_POOL?.[pool] ?? 0;
}

export function attemptExtraLife(entite, {
  pool = "extraLife",
  destroyOnUse = false,

  healRatioByPool = DEFAULT_HEAL_RATIO_BY_POOL,
  healRatio,

  vfxByPool = DEFAULT_VFX_BY_POOL,
  vfxDuration = 1000
} = {}) {

  if (!consumeLifePool(entite, pool, { destroyOnUse })) return false;

  // ✅ ratio effectif (nombre ou fonction)
  const rawRatio = resolveHealRatio({ entite, pool, healRatio, healRatioByPool });

  // ✅ sécurités
  const maxHP = Number(entite?.stats?.HP?.max ?? 0) || 0;
  const ratio = Math.max(0, Math.min(1, Number(rawRatio) || 0));

  // Revive (au moins 1 HP si maxHP > 0)
  entite.stats.HP.current = maxHP > 0 ? Math.max(1, Math.ceil(maxHP * ratio)) : 0;
  saveEntityHPToStorage(entite);

  entite.isDEAD = false;
  entite.statut = ["alive"];
  updateEntityStatusInStorage(entite);

  // Log
  if (pool === "fadedLife") {
    const raw = entite.stats.fadedLife;
    const remain = Math.max(
      0,
      Number(typeof raw === "object" ? (raw?.current ?? 0) : (raw ?? 0)) || 0
    );
    console.log(`${entite.name} consomme une fadedLife (reste ${remain}) et revient avec ${entite.stats.HP.current} HP.`);
  } else if (pool === "eternalLife") {
    const cur = entite.stats?.eternalLife?.current ?? 0;
    const max = entite.stats?.eternalLife?.max ?? 0;
    console.log(`${entite.name} consomme une eternalLife (${cur}/${max}) et revient avec ${entite.stats.HP.current} HP.`);
  } else {
    const cur = entite.stats?.extraLife?.current ?? 0;
    const max = entite.stats?.extraLife?.max ?? 0;
    console.log(`${entite.name} consomme une extraLife (${cur}/${max}) et revient avec ${entite.stats.HP.current} HP.`);
  }

  // VFX auto selon pool + anti-cache (inline)
  const baseSrc =
    (vfxByPool && vfxByPool[pool]) ||
    (vfxByPool && vfxByPool.extraLife) ||
    DEFAULT_VFX_BY_POOL.extraLife;

  const cacheBuster = `nc=${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const vfxSrcToUse = baseSrc + (baseSrc.includes("?") ? "&" : "?") + cacheBuster;

  let effectsContainer = document.getElementById(`effectsContainer_${entite.id}`);
  if (!effectsContainer) {
    const parent = document.getElementById(`DragSprite_${entite.id}`);
    if (parent) {
      effectsContainer = document.createElement("div");
      effectsContainer.id = `effectsContainer_${entite.id}`;
      effectsContainer.className = "effects-container";
      parent.appendChild(effectsContainer);
    }
  }

  if (effectsContainer) {
    const lifeVFX = document.createElement("img");
    lifeVFX.src = vfxSrcToUse;
    lifeVFX.className = `effect-vfx life ${pool}`;
    lifeVFX.alt = `${entite.name} ressuscite !`;
    effectsContainer.appendChild(lifeVFX);
    setTimeout(() => lifeVFX.remove(), vfxDuration);
  }

  // UI
  const armorCur = entite.stats?.armor?.current ?? 0;
  const armorMax = entite.stats?.armor?.max ?? 0;

  updateHealthBar(entite.stats.HP.current, entite.stats.HP.max, armorCur, armorMax, entite.id, 0);
  updateHPCounters(entite.id, entite.stats.HP.current, entite.stats.HP.max);
  updateBonusLifeCounters(entite);

  return true;
}

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

// ---- eternalLife (objet {current,max} ; unicité) ----
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
}
function getLifeCounterContainer(entite) {
  return document.querySelector(`.life-bar-counter[data-entity-id="${entite.id}"]`);
}

// ---- ARMOR ----
function ensureArmorCounter(entite) {
  const wrap = getLifeCounterContainer(entite);
  if (!wrap) return;

  const id = entite.id;
  if (wrap.querySelector(`.armor-counter[data-entity-id="${id}"]`)) return;

  const node = createArmorCounter(entite);
  if (!node) return;

  // insertion après HP si possible
  const hpNode = wrap.querySelector(`.HP-counter[data-entity-id="${id}"]`);
  if (hpNode) hpNode.insertAdjacentElement("afterend", node);
  else wrap.prepend(node);
}

export function updateArmorCounter(entite) {
  if (!entite?.id) return;

  ensureArmorCounter(entite);

  const id = entite.id;
  const currentArmor = entite?.stats?.armor?.current ?? 0;
  const maxArmor     = entite?.stats?.armor?.max ?? 0;
  const show         = maxArmor > 0 && currentArmor > 0;

  document.querySelectorAll(`.armor-counter[data-entity-id="${id}"]`).forEach(node => {
    node.style.display = show ? "" : "none";
    if (show) node.textContent = `🛡️ ${currentArmor}`;
  });
}
export function extraLifeConsumption(entite) {
  const extra = entite?.stats?.extraLife;
  if (!extra || typeof extra !== "object") return false;

  const max = toNonNegInt(extra.max);
  const cur = toNonNegInt(extra.current);
  if (max <= 0 || cur <= 0) return false;

  // 1) -1 sur extraLife.current
  extra.current = Math.min(max, Math.max(0, cur - 1));

  // 2) Reset regen slot (le plus petit order parmi les FULL)
  const regen = entite?.extraLifeRegen;
  if (regen && typeof regen === "object") {
    const keys = Object.keys(regen).filter(isRegenKey).sort();

    // candidatures = slots FULL avec order>0
    let bestKey = null;
    let bestOrder = Infinity;

    for (const k of keys) {
      const s = regen[k];
      if (!s || typeof s !== "object") continue;

      const maxR = toNonNegInt(s.maxRegen);
      const curR = toNonNegInt(s.currentRegen);
      const ord  = toNonNegInt(s.order);

      const isFull = maxR > 0 && curR >= maxR;
      if (!isFull) continue;

      if (ord > 0 && ord < bestOrder) {
        bestOrder = ord;
        bestKey = k;
      }
    }

    // fallback sécurité : si FULL mais orders cassés/absents, on prend le premier FULL par clé (001..)
    if (!bestKey) {
      for (const k of keys) {
        const s = regen[k];
        if (!s || typeof s !== "object") continue;
        const maxR = toNonNegInt(s.maxRegen);
        const curR = toNonNegInt(s.currentRegen);
        if (maxR > 0 && curR >= maxR) {
          bestKey = k;
          break;
        }
      }
    }

    if (bestKey) {
      regen[bestKey].currentRegen = -1;
      delete regen[bestKey].order;

      // 3) recompacte orders + orderCounter (et nettoie les orders sur slots non full)
      updateExtraLifeRegenOrders(entite);

      // 4) resync (évite toute dérive)
      syncExtraLifeCurrentFromRegen(entite);
    }
  }

  // 5) persistance
  saveEntityextraLifeToStorage(entite);
  saveEntityExtraLifeRegenToStorage(entite);

  return true;
}
export function eternalLifeConsumption(entite) {
  const life = entite?.stats?.eternalLife;
  if (!life || typeof life !== "object") return false;

  // ✅ Unicité : max=1 si présent, sinon 0
  const max = toNonNegInt(life.max) > 0 ? 1 : 0;
  const cur = toNonNegInt(life.current) > 0 ? 1 : 0;
  if (max <= 0 || cur <= 0) return false;

  // 1) consomme : 1 -> 0
  life.max = 1;
  life.current = 0;

  // 2) reset regen slot unique
  const regen = entite?.eternalLifeRegen;
  if (regen && typeof regen === "object") {
    // prune tous les slots ≠ "001"
    for (const k of Object.keys(regen)) {
      if (/^\d{3}$/.test(k) && k !== "001") delete regen[k];
    }

    regen["001"] ??= {};
    const slot = regen["001"];

    if (slot && typeof slot === "object") {
      slot.maxRegen = 1;
      slot.currentRegen = -1; // ✅ comme extraLife : repart de 0 au prochain tick
      delete slot.order;
    }

    updateEternalLifeRegenOrders(entite);
    syncEternalLifeCurrentFromRegen(entite);
  }

  // 3) persistance (à adapter à tes helpers de storage)
  saveEntityEternalLifeToStorage(entite);
  saveEntityEternalLifeRegenToStorage(entite);

  return true;
}

// ---- EXTRA LIFE ----
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

// ---- FADED LIFE ----
function ensureFadedLifeCounter(entite) {
  const wrap = getLifeCounterContainer(entite);
  if (!wrap) return;

  const id = entite.id;
  if (wrap.querySelector(`.fadedLife-counter[data-entity-id="${id}"]`)) return;

  const node = createFadedLifeCounter(entite); // ✅ réutilise ta factory
  if (!node) return; // fadedLife pas encore "showable"

  wrap.appendChild(node);
}

export function loadEntitiesStatus() {
    const selectedArmy = loadFromLocalStorage('selectedArmyA', []);
    const enemyArmy = loadFromLocalStorage('ArmyB', []);

    const allEntities = [...selectedArmy, ...enemyArmy];

    allEntities.forEach(entite => {
		 entite.isInvincible = false; // Sécurité : toute entité redevient vulnérable au chargement
        let spriteElement = document.getElementById(`sprite_${entite.id}`);
        let targetElement = document.getElementById(`sbire_${entite.id}`);

        if (entite.statut.includes("dead")) {
            console.log(`💀 ${entite.name} était mort, application du statut.`);
            spriteElement?.classList.add('dead', 'hbox');
            spriteElement?.classList.remove('hb');
            targetElement?.classList.add('dead', 'hbox');
        } else {
            console.log(`✨ ${entite.name} était vivant, mise à jour.`);
            spriteElement?.classList.remove('dead', 'hbox');
            spriteElement?.classList.add('hb');
            targetElement?.classList.remove('dead', 'hbox');
        }
    });

    console.log(`✅ Statut des entités rechargé.`);
}
export function CreateDeadSprite(entite) {
    const container = document.getElementById(`DragSprite_${entite.id}`);
    if (!container) {
        console.warn(`⚠️ Aucun conteneur trouvé pour l'entité ${entite.id}`);
        return;
    }

    // 🔥 Suppression classe 'hb'
    container.classList.remove('hb');

    // 🧹 Nettoyage
    const spriteImg = document.getElementById(`sprite_${entite.id}`);
    if (spriteImg) spriteImg.remove();

    const spriteCanvas = document.getElementById(`spriteCanvas_${entite.id}`);
    if (spriteCanvas) spriteCanvas.remove();

    const previousBlood = document.getElementById(`bloodEffect_${entite.id}`);
    if (previousBlood) previousBlood.remove();

    // 🧟 Ajout canvas du sprite mort
    const canvas = document.createElement('canvas');
    canvas.id = `spriteCanvas_${entite.id}`;
    canvas.className = `dead-sprite ${entite.class} side-${entite.side} dead hbox`;
    canvas.width = 603;
    canvas.height = 328;
    container.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.src = entite.deadsprite || "/media/sprites/0-dead.png";
    img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };

    // 🩸 Animation sang
    let effectsContainer = document.getElementById(`effectsContainer_${entite.id}`);
    if (!effectsContainer) {
        effectsContainer = document.createElement('div');
        effectsContainer.id = `effectsContainer_${entite.id}`;
        effectsContainer.className = 'effects-container';
        container.appendChild(effectsContainer);
    }

    const bloodGif = document.createElement('img');
    bloodGif.src = "/media/assets/effects/death-blood.gif";
    bloodGif.className = 'effect-vfx blood';
    bloodGif.id = `bloodEffect_${entite.id}`;
    effectsContainer.appendChild(bloodGif);

    setTimeout(() => {
        bloodGif.remove();
    }, 1000);

    // ❌ Pas de classes 'dead hbox' sur les conteneurs
    const sbire = document.getElementById(`sbire_${entite.id}`);
    if (sbire) {
        sbire.classList.remove('dead', 'hbox');
    }

    const lord = document.getElementById(`lord_${entite.id}`);
    if (lord) {
        lord.classList.remove('dead', 'hbox');
    }

    // ☠️ Ajout classe .dead à Animationsprite_
    const animationSprite = document.getElementById(`Animationsprite_${entite.id}`);
    if (animationSprite) {
        animationSprite.classList.add('dead');
    }
}





//TIMER ATTAQUE ACTIVE ATTAQUANT
export function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}  // Fonction pour créer un délai.
function shouldUpdateAttackBar(phase) {
  // ✅ uniquement pendant la PREPARATION
  return phase === "preparationTime";
}

function resetAttackBar(attacker) {
  const bar = document.getElementById(`currentAttackBar_${attacker.id}`);
  if (!bar) return;

  bar.style.transition = "none";
  bar.style.width = "0%";
  void bar.offsetWidth; // paint 0%
  requestAnimationFrame(() => {
    bar.style.transition = "";
    bar.style.width = "0%";
  });
}

function updateAttackBarFromRemaining(attacker, phase, duration) {
  const bar = document.getElementById(`currentAttackBar_${attacker.id}`);
  if (!bar) return;

  const remaining = Math.max(0, Number(attacker[phase]) || 0);
  const dur = Math.max(1, Number(duration) || 1);
  const pct = Math.max(0, Math.min(1, 1 - remaining / dur));

  bar.style.width = `${(pct * 100).toFixed(2)}%`;
}

export async function runPhaseTimer(attacker, phase, duration) {
  const dur = Math.max(1, Number(duration) || 1);
  let endTime = Date.now() + dur;

  // console.log(`Timer started for phase: ${phase}, duration: ${dur}ms`);

  // ✅ Initialisation propre du remaining dès le début
  attacker[phase] = dur;
  updateTimerDisplay(attacker);

  // ✅ Barre: reset + premier affichage UNIQUEMENT si PREPARATION
  if (shouldUpdateAttackBar(phase)) {
    resetAttackBar(attacker);
    updateAttackBarFromRemaining(attacker, phase, dur);
  }

  while (Date.now() < endTime) {
    if (attacker.life <= 0) {
      console.log(`Timer stopped for phase: ${phase} because attacker life is 0`);
      const remainingBeforePause = Math.max(0, endTime - Date.now());

      stopAllIntervals();
      while (attacker.life <= 0) {
        await delay(100);
      }
      console.log(`Attacker life is back to ${attacker.life}. Timer resumed for phase: ${phase}`);
      endTime = Date.now() + remainingBeforePause;
    }

    // ✅ Update remaining AVANT le delay (évite le “préremplissage”)
    attacker[phase] = Math.max(0, endTime - Date.now());
    updateTimerDisplay(attacker);

    // ✅ Barre: UNIQUEMENT si PREPARATION
    if (shouldUpdateAttackBar(phase)) {
      updateAttackBarFromRemaining(attacker, phase, dur);
    }

    await delay(50);
  }

  // Fin
  attacker[phase] = (phase === "speedTimer") ? attacker.baseSpeedTimer : 0;
  // console.log(`Timer for phase: ${phase} has finished.`);
  updateTimerDisplay(attacker);


  return;
}


// COOLDOWN TIMER
export function updateCooldownDisplay(attacker) {
    const cooldownElementId = `cooldownDisplay${attacker.id}`;
    const cooldownElement = document.getElementById(cooldownElementId);
if (!attacker.isDEAD) {
    // Annule la mise à jour précédente si elle existe
    if (attacker.cooldownTimerId) {
        clearInterval(attacker.cooldownTimerId);
    }

    const update = () => {
        if (attacker.isDEAD) {
            if (cooldownElement) cooldownElement.textContent = 'Cooldown: N/A';
            clearInterval(attacker.cooldownTimerId);
            return;
        }

        const timeNow = Date.now();
        let timeLeft = attacker.cooldown - (timeNow - attacker.lastAttackTime);

        if (timeLeft <= 0) {
            if (cooldownElement) cooldownElement.textContent = 'Cooldown: 0s';
            clearInterval(attacker.cooldownTimerId);
        } else {
            if (cooldownElement) cooldownElement.textContent = `Cooldown: ${Math.ceil(timeLeft / 1000)}s`;
        }
    };

    // Commence les mises à jour avec setInterval
    attacker.cooldownTimerId = setInterval(update, 50);
}else{ clearInterval(attacker.cooldownTimerId);stopAllIntervals();return;}}

// WAIT FOR COOLDOWN
export async function waitForCooldown(attacker) {
	if (!attacker.isDEAD) {
    try {
        if (typeof attacker.cooldown === 'undefined' || isNaN(attacker.cooldown)) {
            attacker.cooldown = 10;
        }
        if (typeof attacker.lastAttackTime === 'undefined') {
            attacker.lastAttackTime = Date.now() - attacker.cooldown;
        }
        return new Promise((resolve, reject) => {
            const checkCooldown = () => {
                // Vérifie si l'attaquant est mort
                if (attacker.isDEAD) {
					stopAllIntervals();
                    reject(new Error("l'attaquant est mort"));
					return; // Sort immédiatement de la fonction si l'attaquant est mort
                }
                const timeNow = Date.now();
                const timePassed = timeNow - attacker.lastAttackTime;
                let timeLeft = attacker.cooldown - timePassed;
                if (timeLeft <= 0) {
                    resolve();
                } else {
                    setTimeout(checkCooldown, timeLeft);
                }
            };
            checkCooldown();
        });
    } catch (error) {
        console.error("An error occurred in waitForCooldown:", error);
        return Promise.reject(error);
    }
}else{ attacker.cooldown = 0;return;}}

// detection armure
function hasActiveArmor(target) {
  return !!(target?.stats?.armor && target.stats.armor.max > 0 && target.stats.armor.current > 0);
}
const DEBUG_RESILIENCE = true;
function logResilienceReduction(target, percent, before, after, tickCtx) {
  if (!DEBUG_RESILIENCE) return;
  const safe = v => Math.max(0, Math.floor(v || 0));

  const B = {
    raw:  safe(before.piercingDamage),
    phys: safe(before.physical),
    magi: safe(before.magical),
    hybr: safe(before.hybridalDamage),
  };
  const A = {
    raw:  safe(after.piercingDamage),
    phys: safe(after.physical),
    magi: safe(after.magical),
    hybr: safe(after.hybridalDamage),
  };
  const d = {
    raw:  B.raw  - A.raw,
    phys: B.phys - A.phys,
    magi: B.magi - A.magi,
    hybr: B.hybr - A.hybr,
  };
  const totB = B.raw + B.phys + B.magi + B.hybr;
  const totA = A.raw + A.phys + A.magi + A.hybr;
  const totD = totB - totA;

  const tickLabel = tickCtx
    ? ` [tick ${tickCtx.index + 1}/${tickCtx.total}${
        typeof tickCtx.dealBefore === 'number' ? `, deal=${tickCtx.dealBefore}` : ''
      }]`
    : '';

  console.log(`⛨ [Résilience${tickLabel}] ${target.name} : -${percent}% (pré-résistances)`);
  console.log(
    `   • Raw: ${B.raw} → ${A.raw} (−${d.raw}) | ` +
    `Phys: ${B.phys} → ${A.phys} (−${d.phys}) | ` +
    `Magi: ${B.magi} → ${A.magi} (−${d.magi}) | ` +
    `Hybr: ${B.hybr} → ${A.hybr} (−${d.hybr})`
  );
  console.log(`   • Total: ${totB} → ${totA} (−${totD})`);
}

// APPLYDAMAGES
//Éxécution → Armure → indestructibilité → Dégats Bruts + Résistances → Ésotérisme → Blood Fury → Dégâts appliqués sur HP → Astralité
export const normArr = v => Array.isArray(v) ? v : (v == null ? [] : [v]);
// -------------------- FINAL LOG HELPERS --------------------
const snapSources = (s) => ({
  piercingDamage:      Math.round(s?.piercingDamage      || 0),
  physical:       Math.round(s?.physical       || 0),
  magical:        Math.round(s?.magical        || 0),
  hybridalDamage: Math.round(s?.hybridalDamage || 0),
});

const sumSources = (s) =>
  (s?.piercingDamage || 0) + (s?.physical || 0) + (s?.magical || 0) + (s?.hybridalDamage || 0);

function logFinalDamageResolution(ctx) {
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
// -----------------------------------------------------------
export function applyDamage(
  target,
  totalDamage,
  attacker,
  currentAttack,
  totalDamageSources = {},
  selfEffects = [],
  attackType = []
) {
  if (target.isInvincible) {
    console.log(`⛔ ${target.name} est invincible, aucun effet (dégât, soin, effet) appliqué.`);
    return;
  }

  const attackTypes = normArr(currentAttack?.type);

  if (attackTypes.includes("alteration")) {
    console.log(
      `☠️ [ALTÉRATION] ${attacker.name} inflige une altération (${currentAttack.dotname || currentAttack.attacknature || "inconnu"}) à ${target.name}`
    );
  }

  let attackDetail;
  let popupContent = currentAttack?.popup || "";
  let popupType = "";

  if (typeof currentAttack === "string") {
    attackDetail = attackDetails.find((detail) => detail.functionName === currentAttack);
  } else {
    attackDetail = currentAttack || {};
  }

  const attackTargets = normArr(attackDetail?.attackTarget);
  let isAllyTarget = attackTargets.includes("ally");
  let isEnemyTarget = attackTargets.includes("enemy");

  // 🟢 SOINS
  if (isAllyTarget) {
    if (!target.isDEAD) {
      if (!attacker.totalHeal) attacker.totalHeal = 0;
      attacker.totalHeal += totalDamage;

      target.stats.HP.current = Math.min(target.stats.HP.current + totalDamage, target.stats.HP.max);
      saveEntityHPToStorage(target);
      updateTotalHealCounter(`TotalHeal_${attacker.id}`, attacker.totalHeal);
      updateHealthBar(
        target.stats.HP.current,
        target.stats.HP.max,
        target.stats.armor?.current || 0,
        target.stats.armor?.max || 0,
        target.id
      );
      updateScore(attacker, totalDamage);
      if (attackDetail.effets) attackDetail.effets.forEach((e) => applyEffect(target, e, attacker));
    }
    return;
  }

  // 🔴 ATTAQUE ENNEMIE
  if (!isEnemyTarget || target.isDEAD) {
    console.error("❌ Erreur : Cible invalide ou morte.");
    return;
  }

  // 🎯 Impact visuel
  if (hasActiveArmor(target)) damageArmorImpact(target.id);
  else damageImpact(target.id);
  shakeImpact(target.id);

  if (!attacker.totalDamage) attacker.totalDamage = 0;

  // Snapshot HP/Armor avant toute résolution dégâts HP
  const hpBefore = target.stats.HP.current;
  const armorBeforeGlobal = target.stats?.armor?.current || 0;

  // ⚔️ ÉTAPE 0 — EXECUTION BLOOD FURY (pré-dégâts)
  let totalExecutionDamage = 0;

  const attackRangeSrc =
    attackDetail?.attackRange ??
    currentAttack?.attackRange ??
    attacker?.currentAttack?.attackRange;

  const attackRangeArr = normArr(attackRangeSrc);
  const isMelee = attackRangeArr.includes("melee");

  const isRanged =
    attackRangeArr.includes("range") ||
    attackRangeArr.includes("ranged") ||
    attackRangeArr.includes("distance");

  // ✅ FINAL LOG — contexte
  const finalLog = {
    attacker: { id: attacker?.id, name: attacker?.name },
    target: { id: target?.id, name: target?.name },

    attack: {
      functionName: attackDetail?.functionName || (typeof currentAttack === "string" ? currentAttack : undefined),
      nature: attackDetail?.attacknature,
      types: attackTypes,
      label: currentAttack?.dotname || currentAttack?.name || attackDetail?.dotname || attackDetail?.name || "",
      range: attackRangeArr,
      isMelee,
      isRanged,
    },

    input: {
      totalDamageArg: totalDamage,
      hpBefore,
      hpMax: target?.stats?.HP?.max,
      armorBefore: armorBeforeGlobal,
      armorMax: target?.stats?.armor?.max || 0,
    },

    execution: { attempted: false },
    armor: { attempted: false },
    armorGate: { attempted: false },
    indestructible: { attempted: false },

    sources: {
      base: null,
      afterExecutionBonus: null,
      afterArmorGate: null,
      afterRangeRatio: null,
      afterResilience: null,
      afterResistances: null,
      afterEsoterism: null,
    },

    rangeRatio: { attempted: !!isRanged, applied: false },
    resilience: { attempted: attackTypes.includes("alteration"), applied: false },

    resistances: {},
    esoterism: { attempted: false, applied: false },
    critical: { attempted: false },

    out: {
      pipelineOut: 0,
      indReducPercent: 0,
      afterInd: 0,
      finalDamage: 0,
      hpLoss: 0,
      astralityTriggered: false,
    },

    totals: {},
    hp: {},

    popupType: null,
    popupContent,
    effectsApplied: [],
    selfEffects: normArr(selfEffects),
  };

  if (isMelee) {
    finalLog.execution.attempted = true;

    const strength = attacker?.stats?.strength || 0;
    const bloodFuryExecChanceBonus = calculateBloodFuryExecChanceBonus(strength);
    const hpPercent = (target.stats.HP.current / target.stats.HP.max) * 100;

    finalLog.execution.targetHpPercent = Number(hpPercent.toFixed(1));
    finalLog.execution.thresholdPercent = bloodFuryExecChanceBonus;

    if (hpPercent <= bloodFuryExecChanceBonus) {
      totalExecutionDamage = attemptBloodFuryExec(attacker, target);

      finalLog.execution.triggered = true;
      finalLog.execution.damage = totalExecutionDamage || 0;
    } else {
      finalLog.execution.triggered = false;
      finalLog.execution.damage = 0;
    }
  }

// ⚔️ ÉTAPE 1 — ARMURE (absorbe du BRUT, AUCUNE résistance)
let remainingDamage = totalDamage; // brut reçu (argument)
let absorbedByArmor = 0;           // ✅ à réutiliser pour popup armorGate + logs

if (target.stats?.armor && target.stats.armor.max > 0 && target.stats.armor.current > 0) {
  finalLog.armor.attempted = true;

  const armorBefore = Number(target.stats.armor.current) || 0;

  // ✅ l'armure absorbe le BRUT (sans résistances, sans indestructibilité réduction)
  const newArmor = Math.max(0, armorBefore - remainingDamage);
  absorbedByArmor = Math.max(0, armorBefore - newArmor);

  target.stats.armor.current = newArmor;

  // ✅ ce qui passe vers le pipeline HP
  remainingDamage = Math.max(0, remainingDamage - armorBefore);

  finalLog.armor.armorBefore = armorBefore;
  finalLog.armor.armorAfter  = target.stats.armor.current;
  finalLog.armor.absorbedByArmor = absorbedByArmor;
  finalLog.armor.remainingAfterArmorStep = remainingDamage;

  console.log(
    `🛡️ ${target.name} perd ${absorbedByArmor} points d'armure (${target.stats.armor.current}/${target.stats.armor.max}).`
  );

  updateHealthBar(
    target.stats.HP.current,
    target.stats.HP.max,
    target.stats.armor.current,
    target.stats.armor.max,
    target.id
  );
} else {
  finalLog.armor.attempted = false;
  finalLog.armor.absorbedByArmor = 0;
  finalLog.armor.remainingAfterArmorStep = remainingDamage;
}


  // ⚔️ ÉTAPE 2 — INDESTRUCTIBILITÉ (PROC ANNULATION) seulement si armure détruite
  if ((target.stats.armor?.current || 0) <= 0) {
    const isIndestructible = attemptIndestructibility(attacker, target);
    if (isIndestructible) {
      finalLog.indestructible.attempted = true;
      finalLog.indestructible.triggered = true;
      finalLog.indestructible.note = "Dégâts annulés (altérations/effets appliqués).";

      console.log(`🧱 ${target.name} ignore les dégâts restants (indestructible).`);

      if (attackDetail.effets) {
        attackDetail.effets.forEach((effectName) => applyEffect(target, effectName, attacker));
      }

      updateHealthBar(
        target.stats.HP.current,
        target.stats.HP.max,
        target.stats.armor?.current || 0,
        target.stats.armor?.max || 0,
        target.id
      );

      // FINAL LOG (sortie anticipée)
      finalLog.effectsApplied = [...(attackDetail.effets || [])];
      finalLog.popupType = popupType || "";
      finalLog.totals = {
        totalDamageArg: totalDamage,
        remainingAfterArmorStep: remainingDamage,
        note: "Indestructible(proc): aucun dégât HP appliqué.",
      };
      finalLog.hp = {
        hpBefore,
        hpAfter: target.stats.HP.current,
        hpMax: target.stats.HP.max,
        delta: 0,
      };

      logFinalDamageResolution(finalLog);
      return;
    }
  }

  // ⚔️ ÉTAPE 3 — CALCUL DES DÉGÂTS BRUTS (SOURCES)
  let sources;
  let rawTotal;

  const hasProvidedSources =
    totalDamageSources &&
    typeof totalDamageSources === "object" &&
    (Number(totalDamageSources.piercingDamage || 0) > 0 ||
      Number(totalDamageSources.physical || 0) > 0 ||
      Number(totalDamageSources.magical || 0) > 0 ||
      Number(totalDamageSources.hybridalDamage || 0) > 0);

  if (currentAttack?.isAmbidextry) {
    sources = { piercingDamage: 0, physical: totalDamage, magical: 0, hybridalDamage: 0 };
    rawTotal = totalDamage;
    console.log(`🌀 Ambidextrie : dégâts forcés à ${rawTotal}`);
  } else if (currentAttack?.forceDamageSources) {
    const f = currentAttack.forceDamageSources;
    sources = {
      piercingDamage: Math.max(0, Math.floor(f.piercingDamage || 0)),
      physical: Math.max(0, Math.floor(f.physical || 0)),
      magical: Math.max(0, Math.floor(f.magical || 0)),
      hybridalDamage: Math.max(0, Math.floor(f.hybridalDamage || 0)),
    };
    rawTotal = sources.piercingDamage + sources.physical + sources.magical + sources.hybridalDamage;
    console.log(`🧪 ForceDamageSources →`, sources, `total=${rawTotal}`);
  } else if (hasProvidedSources) {
    // ✅ On utilise les sources déjà calculées à l'appel (évite divergence)
    sources = {
      piercingDamage: Math.max(0, Math.floor(totalDamageSources.piercingDamage || 0)),
      physical: Math.max(0, Math.floor(totalDamageSources.physical || 0)),
      magical: Math.max(0, Math.floor(totalDamageSources.magical || 0)),
      hybridalDamage: Math.max(0, Math.floor(totalDamageSources.hybridalDamage || 0)),
    };
    rawTotal = sources.piercingDamage + sources.physical + sources.magical + sources.hybridalDamage;
  } else {
    ({ totalDamageSources: sources, totalDamage: rawTotal } = attemptAttackerDamages(attacker, attackDetail));
  }

  finalLog.sources.base = snapSources(sources);
  finalLog.totals.rawTotalBase = rawTotal;
  finalLog.totals.sumSourcesBase = sumSources(sources);

  // ✅ Bonus d’exécution (ajout aux dégâts physiques)
  if (totalExecutionDamage > 0) {
    sources.physical = (sources.physical || 0) + totalExecutionDamage;
    rawTotal =
      (sources.piercingDamage || 0) +
      (sources.physical || 0) +
      (sources.magical || 0) +
      (sources.hybridalDamage || 0);

    finalLog.sources.afterExecutionBonus = snapSources(sources);
  } else {
    finalLog.sources.afterExecutionBonus = snapSources(sources);
  }

  // ✅ PATCH ARMOR GATE : le pipeline ne traite QUE ce qui reste après l'armure
  // (armure = brut sans résistances)
  finalLog.armorGate.attempted = true;

  if (rawTotal > 0) {
    const ratio = Math.max(0, Math.min(1, (remainingDamage || 0) / rawTotal));

    finalLog.armorGate.ratio = ratio;
    finalLog.armorGate.before = snapSources(sources);

    if (ratio <= 0) {
      sources = { piercingDamage: 0, physical: 0, magical: 0, hybridalDamage: 0 };
      rawTotal = 0;
    } else if (ratio < 1) {
      sources = {
        piercingDamage: Math.round((sources.piercingDamage || 0) * ratio),
        physical: Math.round((sources.physical || 0) * ratio),
        magical: Math.round((sources.magical || 0) * ratio),
        hybridalDamage: Math.round((sources.hybridalDamage || 0) * ratio),
      };
      rawTotal =
        (sources.piercingDamage || 0) +
        (sources.physical || 0) +
        (sources.magical || 0) +
        (sources.hybridalDamage || 0);
    }

    finalLog.armorGate.after = snapSources(sources);
    finalLog.sources.afterArmorGate = snapSources(sources);
    finalLog.totals.rawTotalAfterArmorGate = rawTotal;
  } else {
    sources = { piercingDamage: 0, physical: 0, magical: 0, hybridalDamage: 0 };
    rawTotal = 0;
    finalLog.sources.afterArmorGate = snapSources(sources);
    finalLog.totals.rawTotalAfterArmorGate = 0;
  }

  // 🏹 ÉTAPE 3.5 — RANGE RATIO (sur la partie qui arrive aux HP)
  if (isRanged) {
    const rr = calculateRangeRatio(attacker); // 0..100

    finalLog.rangeRatio.rrPercent = rr;

    if (rr > 0) {
      const factor = 1 - rr / 100;

      finalLog.rangeRatio.applied = true;
      finalLog.rangeRatio.factor = factor;
      finalLog.rangeRatio.before = snapSources(sources);

      const beforeRaw = sources.piercingDamage || 0;
      const beforePhy = sources.physical || 0;

      sources.piercingDamage = Math.round(beforeRaw * factor);
      sources.physical = Math.round(beforePhy * factor);

      // hybride : réduire uniquement moitié physique
      const beforeHybrid = sources.hybridalDamage || 0;
      if (beforeHybrid > 0) {
        const physHalf = beforeHybrid / 2;
        const magHalf = beforeHybrid - physHalf;
        const physHalfReduced = Math.round(physHalf * factor);
        sources.hybridalDamage = Math.round(physHalfReduced + magHalf);
      }

      rawTotal =
        (sources.piercingDamage || 0) +
        (sources.physical || 0) +
        (sources.magical || 0) +
        (sources.hybridalDamage || 0);

      finalLog.rangeRatio.after = snapSources(sources);
      finalLog.sources.afterRangeRatio = snapSources(sources);
      finalLog.totals.rawTotalAfterRangeRatio = rawTotal;
    } else {
      finalLog.sources.afterRangeRatio = snapSources(sources);
      finalLog.rangeRatio.applied = false;
    }
  } else {
    finalLog.sources.afterRangeRatio = snapSources(sources);
  }

  // ⛨ ÉTAPE 4 — RÉSILIENCE (avant résistances) uniquement altérations
  if (attackTypes.includes("alteration")) {
    const resAttempt = attemptResilience(attacker, target, attackDetail) || {};
    const { enabled, percent } = resAttempt;

    finalLog.resilience.enabled = !!enabled;
    finalLog.resilience.percent = percent || 0;

    if (enabled && percent > 0) {
      const factor = Math.max(0, 1 - percent / 100);
      const scale = (v) => (v ? Math.round(v * factor) : 0);

      const beforeResilience = snapSources(sources);

      sources = {
        piercingDamage: scale(beforeResilience.piercingDamage),
        physical: scale(beforeResilience.physical),
        magical: scale(beforeResilience.magical),
        hybridalDamage: scale(beforeResilience.hybridalDamage),
      };

      rawTotal =
        (sources.piercingDamage || 0) +
        (sources.physical || 0) +
        (sources.magical || 0) +
        (sources.hybridalDamage || 0);

      finalLog.resilience.applied = true;
      finalLog.resilience.factor = factor;
      finalLog.resilience.before = snapSources(beforeResilience);
      finalLog.resilience.after = snapSources(sources);
      finalLog.sources.afterResilience = snapSources(sources);
      finalLog.totals.rawTotalAfterResilience = rawTotal;
    } else {
      finalLog.resilience.applied = false;
      finalLog.sources.afterResilience = snapSources(sources);
    }
  } else {
    finalLog.sources.afterResilience = snapSources(sources);
  }

  // ⚔️ ÉTAPE 5 — RÉSISTANCES (sur la partie HP uniquement)
  const { reducedpiercingDamage, reducedPhysicalDamage, reducedMagicalDamage, reducedHybridalDamage } =
    calculateResistances(target, sources, attacker);

  let totalDamageSourcesReduced = {
    piercingDamage: reducedpiercingDamage,
    physical: reducedPhysicalDamage,
    magical: reducedMagicalDamage,
    hybridalDamage: reducedHybridalDamage,
  };

  let totalReducedDamage =
    (reducedpiercingDamage || 0) +
    (reducedPhysicalDamage || 0) +
    (reducedMagicalDamage || 0) +
    (reducedHybridalDamage || 0);

  finalLog.resistances.before = snapSources(sources);
  finalLog.resistances.after = {
    piercingDamage: reducedpiercingDamage || 0,
    physical: reducedPhysicalDamage || 0,
    magical: reducedMagicalDamage || 0,
    hybridalDamage: reducedHybridalDamage || 0,
  };
  finalLog.sources.afterResistances = { ...finalLog.resistances.after };
  finalLog.totals.totalAfterResistances = totalReducedDamage;

// ⚔️ ÉTAPE 6 — ÉSOTÉRISME
const hasMagicalPart =
  (totalDamageSourcesReduced.magical || 0) > 0 ||
  (totalDamageSourcesReduced.hybridalDamage || 0) > 0;

if (target.stats?.esoterism && hasMagicalPart) {
  const beforeEso = { ...totalDamageSourcesReduced };

  const success = attemptEsoterism(attacker, target);
  finalLog.esoterism.attempted = true;
  finalLog.esoterism.success = !!success;
  finalLog.esoterism.before = { ...beforeEso };

  if (success) {
    const reductionPercent = calculateEsoterismtotalReduction(target); // ex: 40..95
    const multiplier = (100 - reductionPercent) / 100;

    // ✅ Réduction sur le magique pur
    totalDamageSourcesReduced.magical = Math.ceil((totalDamageSourcesReduced.magical || 0) * multiplier);

    // ✅ Réduction sur la partie magique de l'hybride (moitié magique uniquement)
    const beforeHybrid = totalDamageSourcesReduced.hybridalDamage || 0;
    if (beforeHybrid > 0) {
      const physHalf = beforeHybrid / 2;
      const magHalf  = beforeHybrid - physHalf;

      const magHalfReduced = Math.ceil(magHalf * multiplier);
      totalDamageSourcesReduced.hybridalDamage = Math.round(physHalf + magHalfReduced);
    }

    // ✅ Recalcul APRÈS toutes les modifs
    totalReducedDamage =
      (totalDamageSourcesReduced.piercingDamage || 0) +
      (totalDamageSourcesReduced.physical || 0) +
      (totalDamageSourcesReduced.magical || 0) +
      (totalDamageSourcesReduced.hybridalDamage || 0);

    console.log(`🪄 Ésotérisme : réduction de ${reductionPercent}% sur la part magique.`);

    finalLog.esoterism.applied = true;
    finalLog.esoterism.reductionPercent = reductionPercent;
    finalLog.esoterism.after = { ...totalDamageSourcesReduced };
    finalLog.sources.afterEsoterism = { ...totalDamageSourcesReduced };
    finalLog.totals.totalAfterEsoterism = totalReducedDamage;
  } else {
    finalLog.esoterism.applied = false;
    finalLog.esoterism.after = { ...totalDamageSourcesReduced };
    finalLog.sources.afterEsoterism = { ...totalDamageSourcesReduced };
  }
} else {
  finalLog.esoterism.attempted = false;
  finalLog.sources.afterEsoterism = { ...totalDamageSourcesReduced };
}


  // 🎯 ÉTAPE 7 — CRITICAL HIT (pas si attaque magique pure)
  const isPureMagicalAttack =
    Array.isArray(attackDetail.attacknature) && attackDetail.attacknature.includes("magicalDamage");

  if (!isPureMagicalAttack) {
    finalLog.critical.attempted = true;

    const critResult = attemptCriticalHit(attacker, target, totalReducedDamage);
    finalLog.critical.isCritical = !!critResult.isCritical;
    finalLog.critical.chance = critResult.critTotalChance;
    finalLog.critical.bonusPercent = critResult.critDamageBonus;
    finalLog.critical.before = totalReducedDamage;

    if (critResult.isCritical) {
      popupType = "critical";
      attackDetail.effets = attackDetail.effets || [];
      if (!attackDetail.effets.includes("criticalHit")) attackDetail.effets.push("criticalHit");

      totalReducedDamage = critResult.finalDamage;
      finalLog.critical.afterCrit = totalReducedDamage;

      const beforeResCrit = totalReducedDamage;
      totalReducedDamage = attemptResilienceCritReduction(attacker, target, totalReducedDamage);
      finalLog.critical.afterResilienceCritReduction = totalReducedDamage;
      finalLog.critical.resilienceCritReductionDelta = beforeResCrit - totalReducedDamage;
    } else {
      finalLog.critical.afterCrit = totalReducedDamage;
      finalLog.critical.afterResilienceCritReduction = totalReducedDamage;
      finalLog.critical.resilienceCritReductionDelta = 0;
    }
  } else {
    finalLog.critical.attempted = true;
    finalLog.critical.skippedBecauseMagicalAttack = true;
  }

  // ❤️ ÉTAPE 9 — SORTIE PIPELINE : appliquer la réduction indestructibilité (HP ONLY), puis retirer les HP
  const pipelineOut = Number(totalReducedDamage) || 0;

  // ✅ Indestructibilité-réduction uniquement si armure = 0 (et de toute façon elle ne doit jamais réduire l'armure)
  const indReduc =
    (target.stats?.armor?.current || 0) <= 0
      ? (Number(caluclateIndestructibilityReductionTotal(target)) || 0)
      : 0;

  const afterInd = indReduc > 0 ? pipelineOut * Math.max(0, 1 - indReduc / 100) : pipelineOut;

  const finalDamagePreAstrality = Math.max(0, Math.round(afterInd));
  target.stats.HP.current = Math.max(0, hpBefore - finalDamagePreAstrality);

  // ✨ ÉTAPE 10 — ASTRALITÉ (peut remonter à 1)
  let astralityTriggered = false;
  if (target.stats.HP.current <= 0 && attemptAstrality(attacker, target)) {
    target.stats.HP.current = 1;
    target.flags = target.flags || {};
    target.flags.astralityLastStand = true;
    astralityTriggered = true;
    try {
      typeof EffectMessage === "function" && EffectMessage(target, "Astralité !");
    } catch {}
  }

  // ✅ DÉGÂTS RÉELLEMENT SUBIS (vérité terrain, après astralité)
  const hpAfter = target.stats.HP.current;
  const hpLoss = hpBefore - hpAfter; // entier, capé par HP
  const damageApplied = hpLoss;      // ✅ valeur unique à utiliser pour popup/score/lifesteal

  // Debug compact
  finalLog.out.pipelineOut = pipelineOut;
  finalLog.out.indReducPercent = indReduc;
  finalLog.out.afterInd = afterInd;
  finalLog.out.finalDamage = finalDamagePreAstrality;
  finalLog.out.hpLoss = hpLoss;
  finalLog.out.astralityTriggered = astralityTriggered;

  // ❤️ ÉTAPE 8 — BLOODFURY (lifesteal) basé sur dégâts effectifs
  if (isMelee) {
    const points = attacker?.stats?.bloodFury || 0;
    if (points > 0) {
      const bloodFuryPercent = calculateBloodFuryPercent(points);
      if (bloodFuryPercent > 0 && damageApplied > 0) {
        LifestealBloodFury(attacker, target, damageApplied, bloodFuryPercent);
      }
    }
  }

  // ✅ Compteurs dégâts : basés sur damageApplied (pas totalReducedDamage)
  attacker.totalDamage += damageApplied;
  updateTotalDamageCounter(`TotalDamages_${attacker.id}`, attacker.totalDamage);

  console.log(`❤️ ${target.name} perd ${damageApplied} HP (${target.stats.HP.current}/${target.stats.HP.max}).`);

  // ⚙️ FINAL — UI & effets
  saveEntityHPToStorage(target);
const armorGate = Math.max(0, Math.round(absorbedByArmor));
  // ✅ PATCH POPUP : afficher dégâts réellement subis
  PopUpDamages(
  target,
  damageApplied,
  attackDetail.effets,
  popupContent,
  totalDamageSourcesReduced,
  popupType,
  armorGate
);
  if (attackDetail.effets) attackDetail.effets.forEach((effectName) => applyEffect(target, effectName, attacker));

  // ✅ PATCH SCORE/SELF : utiliser damageApplied
  updateScore(attacker, damageApplied);
  deductScore(target, damageApplied);
  applySelfEffects(attacker, damageApplied, selfEffects);

  updateHealthBar(
    target.stats.HP.current,
    target.stats.HP.max,
    target.stats.armor?.current || 0,
    target.stats.armor?.max || 0,
    target.id
  );

  LifeandDeath(target);

  // ✅ FINAL LOG (résolution complète)
  finalLog.popupType = popupType;
  finalLog.effectsApplied = [...(attackDetail.effets || [])];

  finalLog.totals = {
    totalDamageArg: totalDamage,
    armorStepRemainingDamage: remainingDamage,

    rawTotalBase: finalLog.totals.rawTotalBase,
    rawTotalAfterArmorGate: finalLog.totals.rawTotalAfterArmorGate,
    rawTotalAfterRangeRatio: finalLog.totals.rawTotalAfterRangeRatio,
    rawTotalAfterResilience: finalLog.totals.rawTotalAfterResilience,

    totalAfterResistances: finalLog.totals.totalAfterResistances,
    totalAfterEsoterism: finalLog.totals.totalAfterEsoterism,

    pipelineOut,
    indReduc,
    afterInd,
    finalDamagePreAstrality,
    damageApplied,
  };

  finalLog.hp = {
    hpBefore,
    hpAfter: target.stats.HP.current,
    hpMax: target.stats.HP.max,
    delta: damageApplied,
    astralityTriggered,
  };

  logFinalDamageResolution(finalLog);

  if (target.isDEAD) console.log(`${target.name} est mort suite aux dégâts infligés.`);
}

export function applySelfEffects(attacker, totalReducedDamage, selfEffects = []) {
  if (!selfEffects || selfEffects.length === 0) return;

  selfEffects.forEach(effectName => {
    const effectData = attackEffects.find(effect => effect.effectName === effectName); // 🔎 Recherche l'effet
    if (!effectData) {
      console.warn(`⚠️ Effet ${effectName} non trouvé dans attackEffects.`);
      return;
    }

    switch (effectName) {
      case 'lifesteal':
        lifesteal(attacker, totalReducedDamage, effectData); // ✅ Passe l'effet correct
        break;

      default:
        console.log(`Aucun effet spécifique trouvé pour ${effectName}.`);
        break;
    }
  });
}


export function applyDamageToDead(target, damage, attacker, currentAttack, effectName) {
    let attackDetail;
    let popupContent = currentAttack.popup || '';

    if (typeof currentAttack === 'string') {
        // Recherche du détail de l'attaque par nom si currentAttack est une chaîne
        attackDetail = attackDetails.find(detail => detail.functionName === currentAttack);
    } else {
        // Utilisation directe de currentAttack comme détail si ce n'est pas une chaîne
        attackDetail = currentAttack;
    }

    let isAllyTarget = false;
    let isEnemyTarget = false;

    // Détermination de la nature de la cible basée sur les détails de l'attaque
    if (attackDetail && attackDetail.attackTarget) {
        isAllyTarget = attackDetail.attackTarget.includes('ally');
        isEnemyTarget = attackDetail.attackTarget.includes('enemy');
    }

    if (isAllyTarget) {
        // Logique pour les attaques ciblant un allié mort 
        if (target.isDEAD) {
            console.log(`Tentative de bénédiction sur le cadavre de ${target.name} par ${attacker.name}.`);
            // Initialisation du compteur de résurrections si ce n'est pas déjà fait
            if (attacker.totalResurrects === undefined) {
                attacker.totalResurrects = 0;
            }

            // Ajout des résurrections au total
            attacker.totalResurrects += 1;
            target.stats.HP.current = Math.min(target.stats.HP.current + damage, target.stats.HP.max);
			updateScore(attacker, 2);
            // Mise à jour de l'interface utilisateur (DOM)
            // updateTotalResurrectsCounter(attacker.id, attacker.totalResurrects);

            // Application des effets supplémentaires liés à l'attaque de résurrection.
            if (attackDetail.effets) {
                attackDetail.effets.forEach(effect => {
                    applyEffect(target, effect, attacker);
                });
            }

            target.isDEAD = false; // Marquer la cible comme ressuscitée
            console.log(`${attacker.name} béni le cadavre de ${target.name} avec ${damage} points de vie.`);
        } else {
            console.log(`${target.name} est déjà vivant. La bénédiction de son cadavre échoue.`);
        }
    } else if (isEnemyTarget) {
        // Logique pour les attaques ciblant un ennemi mort (ex: profanation)
        if (attacker.totalProfanations === undefined) {
            attacker.totalProfanations = 0;
        }
        attacker.totalProfanations += 1;
        // updateTotalProfanationsCounter(`TotalProfanations_${attacker.id}`, attacker.totalProfanations);

        if (target.isDEAD) {
            // Application des dégâts ou des effets à un cadavre
            console.log(`${attacker.name} profane le cadavre de ${target.name} avec succés.`);
          updateScore(attacker, 2);
            // Application des effets de l'attaque
            if (attackDetail.effets) {
                attackDetail.effets.forEach(effect => {
                    applyEffect(target, effect, attacker);
                });
            }

            // Mise à jour de l'interface utilisateur (DOM)
            updateHealthBar(target.stats.HP.current, target.stats.HP.max, target.stats.armor?.current || 0, target.stats.armor?.max || 0, target.id);

           if (target.stats.extraLife) { updateBonusLifeCounters(`extraLife_${target.id}`, target.stats.extraLife.current, target.stats.extraLife.max);}
        } else {
            console.log(`${target.name} est vivant. La profanation échoue.`);
        }
    } else {
        console.error("Erreur : La cible de l'attaque n'est pas spécifiée correctement.");
    }
}

function summonConsommable(target, effectName, attacker) {
    console.log('DEBUG: Fonction summonConsommable sélectionnée.');
    applyEffect(target, effectName, attacker);
    // Logique spécifique pour summon-consommable
}

function summonBalise(target, effectName, attacker) {
    console.log('DEBUG: Fonction summonBalise sélectionnée.');
    applyEffect(target, effectName, attacker);
    // Logique spécifique pour summon-balise
}

function summonPresence(target, effectName, attacker) {
    console.log('DEBUG: Fonction summonPresence sélectionnée.');
    applyEffect(target, effectName, attacker);
    // Logique spécifique pour summon-presence
}

function summonEsprit(target, effectName, attacker) {
    console.log('DEBUG: Fonction summonEsprit sélectionnée.');
    applyEffect(target, effectName, attacker);
    // Logique spécifique pour summon-esprit
}

function summonEntite(target, effectName, attacker) {
    console.log('DEBUG: Fonction summonEntite sélectionnée.');
    applyEffect(target, effectName, attacker);
    // Logique spécifique pour summon-entite
}

export function applyDamageToHex(target, attacker, currentAttack) {
    const effectName = currentAttack.effets ? currentAttack.effets[0] : null;

    // Trouver l'objet d'effet correspondant dans le tableau
    const effect = attackEffects.find(e => e.effectName === effectName);
    const summontype = effect ? effect.summonType : null;

    if (!effect) {
        console.error(`Erreur: L'effet ${effectName} n'est pas défini dans attackEffects`);
        return;
    }

    try {
        console.log(`DEBUG: Application de l'effet ${effectName} de ${attacker.name} sur hex ${target.dataset.position}.`);
        
        if (summontype) {
            console.log(`DEBUG: summontype détecté : ${summontype}`);
        } else {
            console.error('DEBUG: summontype est null ou indéfini');
        }

        switch (summontype) {
            case 'summon-consommable':
                summonConsommable(target, effectName, attacker);
                break;
            case 'summon-balise':
                summonBalise(target, effectName, attacker);
                break;
            case 'summon-presence':
                summonPresence(target, effectName, attacker);
                break;
            case 'summon-esprit':
                summonEsprit(target, effectName, attacker);
                break;
            case 'summon-entite':
                summonEntite(target, effectName, attacker);
                break;
            default:
                console.error(`Type d'invocation inconnu: ${summontype}`);
        }

        target.appliedEffects = target.appliedEffects || [];
        target.appliedEffects.push({
            effectName: effectName,
            attacker: attacker.name,
            timestamp: Date.now()
        });
        console.log(`DEBUG: Effets appliqués sur hex ${target.dataset.position}:`, target.appliedEffects);

    } catch (error) {
        console.error(`Erreur lors de l'application de l'effet ${effectName} sur l'hex ${target.dataset.position}: ${error}`);
    }
}
// APPLY EFFECT
export function applyEffect(target, effectName, attacker) {
  const effect = attackEffects.find(e => e.effectName === effectName);
  if (!effect) {
    console.warn(`Effect ${effectName} not found.`);
    return;
  }

  // 👉 Vérifie si c'est une altération d'état
  const isAlteration = Array.isArray(effect?.type)
    ? effect.type.includes('alteration')
    : (typeof effect?.type === 'string' ? effect.type === 'alteration' : false);

  // 🎯 Tentative d'annulation À L'IMPACT (une seule fois)
  if (isAlteration) {
    const canceled = attemptResilienceCancel(attacker, target, effect);
    if (canceled) {
      console.log(`⛔ Altération "${effectName}" annulée à l'impact sur ${target.name}.`);
      return 'alteration_canceled'; // on sort : rien n’est appliqué, aucun tick ne sera lancé
    }
  }

  // Ajoute automatiquement la classe CSS basée sur le nom de l'effet
  toggleEffectClass(target, effectName, 'add');

  switch (effectName) {
    case 'poison':
      poison(target, effect, attacker, () => toggleEffectClass(target, effectName, 'remove'));
      break;

    case 'brulure':
      brulure(target, effect, attacker, () => toggleEffectClass(target, effectName, 'remove'));
      break;

    case 'heal':
      heal(target, effect, attacker, () => toggleEffectClass(target, effectName, 'remove'));
      break;

    case 'rez':
      rez(target, effect, attacker, () => toggleEffectClass(target, effectName, 'remove'));
      break;

    case 'summonJarret':
      summonJarret(target, effect, attacker, () => toggleEffectClass(target, effectName, 'remove'));
      break;

    case 'summonProfanation':
      summonProfanation(target, effect, attacker, () => toggleEffectClass(target, effectName, 'remove'));
      break;

    default:
      // console.log(`Aucun effet spécifique trouvé pour ${effectName}.`);
      toggleEffectClass(target, effectName, 'remove');
      break;
  }
}

export function updateCurrentAttackDisplay(entite) {
    const img = document.getElementById(`currentAttackImage_${entite.id}`);
    if (!img) return;

    const attack = attackDetails.find(a => a.attackId === entite.currentAttackId);

    if (attack) {
        img.src = attack.attackAsset || '/media/assets/ui/attack-placeholder.png';
        img.alt = attack.displayName || 'Attaque en cours';
    } else {
        img.src = '/media/assets/ui/attack-placeholder.png';
        img.alt = 'Attaque inconnue';
    }
}