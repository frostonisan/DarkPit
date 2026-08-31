import { checkGameOver, stopAllIntervals, OrderEntity} from './gameState.js';
import { entites, calculateResistances, getBloodThirstyPercent,updateEternalLifeRegenOrders, updateExtraLifeRegenOrders, syncEternalLifeCurrentFromRegen, syncExtraLifeCurrentFromRegen } from './entites.js'; 
import { updateTimerDisplay, updateKillsCounter, updateTotalDamageCounter, PopUpDamages, updateTotalHealCounter, updateScore, deductScore } from './dom.js';
import { updateHealthBar, updateHPCounters } from './UpgradeEntity.js';
import { EffectMessage, toggleEffectClass, poison, brulure, heal, rez, lifesteal, LifestealBloodFury } from './attackEffectMecanics.js';
import { summonJarret, summonProfanation } from './summonsMecanics.js';
import { attackEffects } from './attackEffects.js';
import { attackDetails } from './attackList.js'; 
import { updateGlobalRoleSbire, TraitementRolesSbires } from './load-entity.js'; 
import { entiteCamp } from './fight.js'; 
import { saveToLocalStorage, loadFromLocalStorage } from './GameStorage.js';
import { updateEntityStatusInStorage, saveEntityHPToStorage, saveEntityextraLifeToStorage, saveEntityfadedLifeToStorage, saveEntityEternalLifeToStorage, saveEntityEternalLifeRegenToStorage, saveEntityExtraLifeRegenToStorage, saveEntityArmorState } from './entityUpdatesStorage.js';
import { updateSpriteUI, damageImpact, damageArmorImpact, shakeImpact,  brokenMagicImpact, applyEntityTint, releaseEntityTint, renderEntityTint } from './entitesAnimation.js';
import { toNumber, attemptAttackerDamages, attemptIndestructibility, attemptEsoterism, attemptAstrality, attemptBloodFuryExec, calculateBloodFuryExecChanceBonus, calculateBloodFuryExecutionPercent, attemptCriticalHit, attemptResilience, attemptResilienceCancel, attemptResilienceCritReduction, calculateExtraLifeResurrect, attemptTranscendenceConsoProtection, calculateRangeRatio, caluclateIndestructibilityReductionTotal, calculateEsoterismtotalReduction, calculateMysticismTotalDamageBonus, calculateOccultismShadowFragilityPercent } from './damagesCalcul.js';
import { createExtraLifeCounter, createArmorCounter, createFadedLifeCounter, stabilizeDeadEntityVisual } from './createEntity.js';
import { isRegenKey, toNonNegInt } from './ui.js';
import { getAttackResolutionFlags } from './attackResolution.js';
import { battleLogs } from './battleLogs.js';
import { syncEntityAuras, cleanupEntityAuras } from "./entitesAura.js";
import { createCorpseLoot } from './loot.js';

const ADMIN_INVINCIBLE_MODE_STORAGE_KEY = 'DarkPitAdminInvincibleMode';

function isAdminInvincibleModeEnabled() {
  return window.levelRunning === 'admin'
    && (
      window.__adminInvincibleMode === true
      || localStorage.getItem(ADMIN_INVINCIBLE_MODE_STORAGE_KEY) === 'true'
    );
}

function restoreAdminInvincibleEntity(entite) {
  const maxHP = Math.max(1, Number(entite.stats.HP.max ?? 0) || 1);
  entite.stats.HP.current = maxHP;
  entite.isDEAD = false;
  entite.statut = ['alive'];
  entite.hasDeathBeenLogged = false;
  entite.hasAlreadyDeadBeenLogged = false;

  const armorCur = entite.stats?.armor?.current ?? 0;
  const armorMax = entite.stats?.armor?.max ?? 0;
  saveEntityHPToStorage(entite);
  updateEntityStatusInStorage(entite);
  updateHealthBar(maxHP, maxHP, armorCur, armorMax, entite.id, 0);
  updateHPCounters(entite.id, maxHP, maxHP);
  updateBonusLifeCounters(entite);
}

// LIFE AND DEATH
// Intégrez l'appel de cette fonction dans votre fonction LifeandDeath
export function LifeandDeath(entite, attacker = null) {
  if (!entite?.stats?.HP) return;

  const statutArr = Array.isArray(entite.statut) ? entite.statut : [];
  const wasDead  = statutArr.includes("dead");
  const wasAlive = statutArr.includes("alive");
  const hpCur = Number(entite.stats.HP.current ?? 0) || 0;

  // Si HP <= 0, les mécaniques de survie passent TOUJOURS avant la mort.
  // Ne jamais retourner sur la seule base de statut/isDEAD/ancien log : ces
  // marqueurs peuvent avoir été posés avant cet appel ou provenir du stockage.
  if (hpCur <= 0) {
    if (isAdminInvincibleModeEnabled()) {
      restoreAdminInvincibleEntity(entite);
      console.log(`🛡️ Mode invincible admin : ${entite.name} récupère tous ses HP.`);
      return;
    }

    const targetElement = document.getElementById(`sbire_${entite.id}`);

    // 1.a) Cas resurrected (flag DOM)
    if (targetElement?.classList.contains("resurrected")) {
      rez(entite, attacker);
      entiteCamp(entites);
      targetElement.classList.remove("resurrected");

      // Une résurrection ouvre un nouveau cycle de vie/mort.
      entite.hasDeathBeenLogged = false;
      entite.hasAlreadyDeadBeenLogged = false;

      // UI (le rez peut déjà le faire, mais là tu garantis la synchro)
      updateBonusLifeCounters(entite);
      updateHPCounters(entite.id, entite.stats.HP.current ?? 0, entite.stats.HP.max ?? 0);

      return;
    }

    // 1.b) fadedLife (prioritaire, détruite définitivement)
if (attemptExtraLife(entite, { pool: "fadedLife", destroyOnUse: true })) {
  battleLogs("extra_life_used", {
    entity: entite,
    lifeType: "fadedLife",
    hpRestored: entite.stats.HP.current
  });

  updateBonusLifeCounters(entite);
  return;
}
    // 1.c) extraLife (réutilisable, max ne bouge pas)
if (attemptExtraLife(entite, { pool: "extraLife", destroyOnUse: false })) {
  battleLogs("extra_life_used", {
    entity: entite,
    lifeType: "extraLife",
    hpRestored: entite.stats.HP.current
  });

  updateBonusLifeCounters(entite);
  return;
}
// 1.d) eternalLife (unique)
if (attemptExtraLife(entite, { pool: "eternalLife", destroyOnUse: false })) {
  battleLogs("extra_life_used", {
    entity: entite,
    lifeType: "eternalLife",
    hpRestored: entite.stats.HP.current
  });

  updateBonusLifeCounters(entite);
  return;
}

// L'entité était déjà un cadavre finalisé et aucune nouvelle vie n'est prête.
// On garde l'appel idempotent, mais seulement APRÈS les tentatives de survie.
if (wasDead && entite.isDEAD === true && entite.hasDeathBeenLogged === true) {
  entite.stats.HP.current = 0;
  updateHPCounters(entite.id, 0, entite.stats.HP.max ?? 0);
  updateBonusLifeCounters(entite);
  const deadCanvas = document.getElementById(`spriteCanvas_${entite.id}`);
  if (!deadCanvas?.classList.contains("dead-sprite")) {
    CreateDeadSprite(entite, { playDeathBlood: false });
  }
  createCorpseLoot(entite);
  return;
}

// Mort définitive : aucune réserve de vie n'a pu être consommée.
if (entite.flags?.bloodCrazyNextExecution) {
  consumeBloodCrazy(entite);
}

entite.isDEAD = true;
entite.statut = ["dead"];
entite.stats.HP.current = 0;
if (!entite.hasDeathBeenLogged) {
  battleLogs("entity_death", { entity: entite });
  entite.hasDeathBeenLogged = true;
}
    console.log(`${entite.name} est mort pour de bon (plus de vies).`);
    updateEntityStatusInStorage(entite);

    // UI
    const armorCur = entite.stats?.armor?.current ?? 0;
    const armorMax = entite.stats?.armor?.max ?? 0;

    updateHealthBar(0, entite.stats.HP.max ?? 0, armorCur, armorMax, entite.id, 0);
    updateHPCounters(entite.id, 0, entite.stats.HP.max ?? 0);
    updateBonusLifeCounters(entite);

    cleanupEntityAuras(entite);
    CreateDeadSprite(entite);
    createCorpseLoot(entite);

    // Une mort individuelle ne stoppe pas le combat. La résolution centrale décide
    // immédiatement si cette mort termine réellement le combat.
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


function getLifePoolCurrent(raw) {
  const value = raw && typeof raw === "object" ? raw.current : raw;
  return Math.max(0, Number(value ?? 0) || 0);
}

function consumeLifePool(entite, key, { destroyOnUse = false } = {}) {
  if (!entite?.stats) return false;

  if (key === "fadedLife") {
    const raw = entite.stats.fadedLife;
    const cur = getLifePoolCurrent(raw);
    if (cur <= 0) return false;

    // ✅ Protection Transcendance : résurrection OK, pas de conso (avec FX)
    if (attemptTranscendenceConsoProtection(entite)) {
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

    return true;
  }

  if (key === "extraLife") {
    const cur = getLifePoolCurrent(entite.stats.extraLife);
    if (cur <= 0) return false;

    // ✅ Protection Transcendance : résurrection OK, pas de conso (avec FX)
    if (attemptTranscendenceConsoProtection(entite)) {
      return true;
    }

    const ok = extraLifeConsumption(entite);

    return ok;
  }

  if (key === "eternalLife") {
    const cur = getLifePoolCurrent(entite.stats.eternalLife);
    if (cur <= 0) return false;

    // ✅ Protection Transcendance : résurrection OK, pas de conso (avec FX)
    if (attemptTranscendenceConsoProtection(entite)) {
      return true;
    }

    const ok = eternalLifeConsumption(entite);

    return ok;
  }

  return false;
}

const DEFAULT_VFX_BY_POOL = {
  extraLife: "./media/assets/effects/life.gif",
  fadedLife: "./media/assets/effects/fadedlife.gif",
  eternalLife: "./media/assets/effects/eternallife.gif",
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
  // Si une vie a été obtenue après une mort finalisée, la prochaine mort doit
  // pouvoir être journalisée normalement.
  entite.hasDeathBeenLogged = false;
  entite.hasAlreadyDeadBeenLogged = false;
  updateEntityStatusInStorage(entite);

  // Synchroniser seulement APRÈS avoir restauré HP/isDEAD/statut.
  // Avant, syncEntityAuras voyait HP=0 et supprimait toutes les auras.
  syncEntityAuras(entite, "battle");
  syncEntityAuras(entite, "codex");

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
  const maxArmor     = entite?.stats?.armor?.max ?? 0;
  const show         = maxArmor > 0 && currentArmor > 0;

  document.querySelectorAll(`.armor-counter[data-entity-id="${id}"]`).forEach(node => {
    node.style.display = show ? "" : "none";
    if (show) node.textContent = `🛡️ ${currentArmor}`;
  });
}
export function extraLifeConsumption(entite) {
  const extra = entite?.stats?.extraLife;
  if (!extra) return false;

  // Anciennes sauvegardes : extraLife pouvait être stockée comme un nombre.
  if (typeof extra !== "object") {
    const cur = toNonNegInt(extra);
    if (cur <= 0) return false;

    entite.stats.extraLife = Math.max(0, cur - 1);
    saveEntityextraLifeToStorage(entite);
    return true;
  }

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
  if (!life) return false;

  // Tolérance pour les sauvegardes legacy au format 0/1.
  if (typeof life !== "object") {
    if (toNonNegInt(life) <= 0) return false;

    entite.stats.eternalLife = 0;
    saveEntityEternalLifeToStorage(entite);
    return true;
  }

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
export function CreateDeadSprite(entite, { playDeathBlood = true } = {}) {
    return stabilizeDeadEntityVisual(entite, { playDeathBlood });
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

function applyMysticismBonusToSources(sources, attacker, currentAttack) {
    if (!currentAttack?.isLaunchedUnderMysticism) {
        return {
            sources,
            applied: false,
            bonusPercent: 0,
        };
    }

    const bonusPercent = calculateMysticismTotalDamageBonus(attacker);

    if (bonusPercent <= 0) {
        return {
            sources,
            applied: false,
            bonusPercent: 0,
        };
    }

    const bonusSources = {
        piercingDamage: Math.round((sources.piercingDamage || 0) * bonusPercent / 100),
        physical: Math.round((sources.physical || 0) * bonusPercent / 100),
        magical: Math.round((sources.magical || 0) * bonusPercent / 100),
        hybridalDamage: Math.round((sources.hybridalDamage || 0) * bonusPercent / 100),
    };

    return {
        sources: {
            piercingDamage: (sources.piercingDamage || 0) + bonusSources.piercingDamage,
            physical: (sources.physical || 0) + bonusSources.physical,
            magical: (sources.magical || 0) + bonusSources.magical,
            hybridalDamage: (sources.hybridalDamage || 0) + bonusSources.hybridalDamage,
        },
        applied: true,
        bonusPercent,
        bonusSources,
    };
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
function buildDamageResolutionBattleLog(ctx) {
  return {
    attacker: ctx.attackerFull || ctx.attacker,
    target: ctx.targetFull || ctx.target,
    attack: ctx.attack,

    damage: ctx.totals?.finalDamagePreAstrality ?? ctx.hp?.delta ?? 0,
    damageSources:
      ctx.sources?.afterOccultismFragility ||
      ctx.sources?.afterEsoterism ||
      ctx.sources?.afterResistances ||
      {},

    armorAbsorbed: ctx.armor?.absorbedByArmor || 0,

    armor: {
      absorbed: ctx.armor?.absorbedByArmor || 0,
    },

    modifiers: ctx.attackModifiers || {},

    effects: {
      applied: ctx.effectsApplied || [],
      self: ctx.selfEffects || [],
    },
  };
}
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
const hpDamage = ctx.hp?.delta || 0;
const armorAbsorbed = ctx.armor?.absorbedByArmor || 0;

const modifiers = ctx.attackModifiers || {};

const damageResolutionLog = buildDamageResolutionBattleLog(ctx);

if (
  damageResolutionLog.damage > 0 ||
  damageResolutionLog.armor.absorbed > 0 ||
  damageResolutionLog.modifiers.indestructible
) {
  battleLogs("damage_resolution", damageResolutionLog);
}
  console.groupEnd();
}
// ---------------APPLY DAMAGE----------------------

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

  const flags = getAttackResolutionFlags(attackDetail);

  const attackTargets = normArr(attackDetail?.attackTarget);
  let isAllyTarget = attackTargets.includes("ally");
  let isEnemyTarget = attackTargets.includes("enemy");

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

  if (!isEnemyTarget || target.isDEAD) {
    console.error("❌ Erreur : Cible invalide ou morte.");
    return;
  }

const isBrokenMagicAttack =
  Boolean(attackDetail?.isBrokenSpell || currentAttack?.isBrokenSpell) &&
  (
    normArr(attackDetail?.attacknature).includes("magicalDamage") ||
    Number(totalDamageSources?.magical || 0) > 0
  );

if (isBrokenMagicAttack) {
  brokenMagicImpact(target.id);
} else if (hasActiveArmor(target)) {
  damageArmorImpact(target.id);
} else {
  damageImpact(target.id);
}

if (isBrokenMagicAttack) {
  brokenMagicImpact(target.id);
}

shakeImpact(target.id);

  if (!attacker.totalDamage) attacker.totalDamage = 0;
if (!attacker.totalAggroDamage) attacker.totalAggroDamage = 0;

  const hpBefore = target.stats.HP.current;
  const armorBeforeGlobal = target.stats?.armor?.current || 0;

  let totalExecutionDamage = 0;

  const attackRangeArr = flags.ranges;
  const isMelee = flags.isMelee;
  const isRanged = flags.isRange;

  const finalLog = {
	  attackerFull: attacker,
		targetFull: target,
attackModifiers: {
  critical: false,
  execution: false,
  bloodCrazy: false,
  mysticism: false,
  esoterism: false,
  occultismFragility: false,
  armorAbsorbed: 0,
  armorBypass: false,
  indestructible: false,
  astrality: false,
  lifesteal: 0
},
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
  logVariant: currentAttack?.logVariant || "normal",
  ambidextryHitIndex: currentAttack?.ambidextryHitIndex || null,
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
  afterMysticism: null,
  afterExecutionBonus: null,
  afterArmorGate: null,
  afterRangeRatio: null,
  afterResilience: null,
  afterResistances: null,
  afterEsoterism: null,
afterOccultismFragility: null,
},

    rangeRatio: { attempted: !!isRanged, applied: false },
    resilience: { attempted: attackTypes.includes("alteration"), applied: false },

    resistances: {},
    esoterism: { attempted: false, applied: false },
	occultismFragility: { attempted: false, applied: false },
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
const hasBloodCrazy = Boolean(attacker.flags?.bloodCrazyNextExecution);

finalLog.execution.bloodCrazy = hasBloodCrazy;

if (hasBloodCrazy) {
  finalLog.attackModifiers.bloodCrazy = true;
  finalLog.attackModifiers.bloodCrazyConsumed = true;
}

if (flags.canBloodFuryExec) {
  finalLog.execution.attempted = true;

  const strength = attacker?.stats?.strength || 0;
  const bloodFuryExecChanceBonus = calculateBloodFuryExecChanceBonus(strength);
  const hpPercent = (target.stats.HP.current / target.stats.HP.max) * 100;

  finalLog.execution.targetHpPercent = Number(hpPercent.toFixed(1));
  finalLog.execution.thresholdPercent = bloodFuryExecChanceBonus;

  const canTryByHp = hpPercent <= bloodFuryExecChanceBonus;
  const canTryByBloodCrazy = hasBloodCrazy;

  if (canTryByHp || canTryByBloodCrazy) {
    totalExecutionDamage = attemptBloodFuryExec(attacker, target, {
      ignoreHpThreshold: canTryByBloodCrazy
    });

    finalLog.execution.triggered = totalExecutionDamage > 0;
    finalLog.execution.damage = totalExecutionDamage || 0;

    if (hasBloodCrazy) {
      if (totalExecutionDamage > 0) {
        finalLog.attackModifiers.bloodCrazySuccess = true;
      } else {
        finalLog.attackModifiers.bloodCrazyFail = true;
        finalLog.attackModifiers.bloodCrazyFailReason = "proc_failed";
      }
    }
  } else {
    finalLog.execution.triggered = false;
    finalLog.execution.damage = 0;
  }
} else {
  finalLog.execution.attempted = hasBloodCrazy;
  finalLog.execution.triggered = false;
  finalLog.execution.damage = 0;
  finalLog.execution.skippedByAttackRules = true;

  if (hasBloodCrazy) {
    finalLog.attackModifiers.bloodCrazyFail = true;
    finalLog.attackModifiers.bloodCrazyFailReason = "incompatible_attack";
  }
}

if (hasBloodCrazy) {
  consumeBloodCrazy(attacker);
}
  const readIncomingSourcesForArmorGate = () => {
    if (currentAttack?.forceDamageSources) {
      const f = currentAttack.forceDamageSources;
      return {
        piercingDamage: Math.max(0, Math.floor(f.piercingDamage || 0)),
        physical: Math.max(0, Math.floor(f.physical || 0)),
        magical: Math.max(0, Math.floor(f.magical || 0)),
        hybridalDamage: Math.max(0, Math.floor(f.hybridalDamage || 0)),
      };
    }

    if (
      totalDamageSources &&
      typeof totalDamageSources === "object" &&
      (
        Number(totalDamageSources.piercingDamage || 0) > 0 ||
        Number(totalDamageSources.physical || 0) > 0 ||
        Number(totalDamageSources.magical || 0) > 0 ||
        Number(totalDamageSources.hybridalDamage || 0) > 0
      )
    ) {
      return {
        piercingDamage: Math.max(0, Math.floor(totalDamageSources.piercingDamage || 0)),
        physical: Math.max(0, Math.floor(totalDamageSources.physical || 0)),
        magical: Math.max(0, Math.floor(totalDamageSources.magical || 0)),
        hybridalDamage: Math.max(0, Math.floor(totalDamageSources.hybridalDamage || 0)),
      };
    }

    if (
      !flags.hasPhysical &&
      !flags.hasMagical &&
      !flags.hasHybridal &&
      (flags.hasPiercing || Number(attacker?.stats?.piercingDamage || 0) > 0)
    ) {
      return {
        piercingDamage: Math.max(0, Math.floor(totalDamage || 0)),
        physical: 0,
        magical: 0,
        hybridalDamage: 0,
      };
    }

    return { piercingDamage: 0, physical: 0, magical: 0, hybridalDamage: 0 };
  };

  const incomingArmorSources = readIncomingSourcesForArmorGate();

  const isPurePiercingIncoming =
    incomingArmorSources.piercingDamage > 0 &&
    incomingArmorSources.physical <= 0 &&
    incomingArmorSources.magical <= 0 &&
    incomingArmorSources.hybridalDamage <= 0;

const purePiercingArmorBypass =
  isPurePiercingIncoming &&
  (flags.canBypassArmorGate || (!flags.hasPhysical && !flags.hasMagical && !flags.hasHybridal))
    ? incomingArmorSources.piercingDamage
    : 0;
  let remainingDamage = Math.max(0, totalDamage - purePiercingArmorBypass);

  if (purePiercingArmorBypass > 0) {
	  finalLog.attackModifiers.armorBypass = true;
    console.log(
      `🗡️ TRANSPERÇANTE : ${purePiercingArmorBypass} dégâts piercing traversent l'armor gate.`
    );

    finalLog.armorGate.bypass = {
      enabled: true,
      type: "purePiercing",
      amount: purePiercingArmorBypass,
    };
  }

  let absorbedByArmor = 0;

  if (target.stats?.armor && target.stats.armor.max > 0 && target.stats.armor.current > 0) {
    finalLog.armor.attempted = true;

    const armorBefore = Number(target.stats.armor.current) || 0;

    const newArmor = Math.max(0, armorBefore - remainingDamage);
    absorbedByArmor = Math.max(0, armorBefore - newArmor);

    target.stats.armor.current = newArmor;
saveEntityArmorState(target);

    remainingDamage = Math.max(0, remainingDamage - armorBefore);

    finalLog.armor.armorBefore = armorBefore;
    finalLog.armor.armorAfter = target.stats.armor.current;
    finalLog.armor.absorbedByArmor = absorbedByArmor;
    finalLog.armor.remainingAfterArmorStep = remainingDamage;
finalLog.attackModifiers.armorAbsorbed = absorbedByArmor;
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

  if ((target.stats.armor?.current || 0) <= 0) {
    const isIndestructible = attemptIndestructibility(attacker, target);
    if (isIndestructible) {
		finalLog.attackModifiers.indestructible = true;
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

  let sources;
  let rawTotal;

  const hasProvidedSources =
    totalDamageSources &&
    typeof totalDamageSources === "object" &&
    (
      Number(totalDamageSources.piercingDamage || 0) > 0 ||
      Number(totalDamageSources.physical || 0) > 0 ||
      Number(totalDamageSources.magical || 0) > 0 ||
      Number(totalDamageSources.hybridalDamage || 0) > 0
    );

  if (currentAttack?.isAmbidextry) {
    if (currentAttack?.forceDamageSources) {
      const f = currentAttack.forceDamageSources;
      sources = {
        piercingDamage: Math.max(0, Math.floor(f.piercingDamage || 0)),
        physical: Math.max(0, Math.floor(f.physical || 0)),
        magical: Math.max(0, Math.floor(f.magical || 0)),
        hybridalDamage: Math.max(0, Math.floor(f.hybridalDamage || 0)),
      };
    } else {
      sources = {
        piercingDamage: 0,
        physical: Math.max(0, Math.floor(totalDamage || 0)),
        magical: 0,
        hybridalDamage: 0,
      };
    }

    rawTotal =
      (sources.piercingDamage || 0) +
      (sources.physical || 0) +
      (sources.magical || 0) +
      (sources.hybridalDamage || 0);

    console.log(`🌀 Ambidextrie : sources forcées`, sources, `total=${rawTotal}`);
  } else if (currentAttack?.forceDamageSources) {
    const f = currentAttack.forceDamageSources;
    sources = {
      piercingDamage: Math.max(0, Math.floor(f.piercingDamage || 0)),
      physical: Math.max(0, Math.floor(f.physical || 0)),
      magical: Math.max(0, Math.floor(f.magical || 0)),
      hybridalDamage: Math.max(0, Math.floor(f.hybridalDamage || 0)),
    };

    rawTotal =
      (sources.piercingDamage || 0) +
      (sources.physical || 0) +
      (sources.magical || 0) +
      (sources.hybridalDamage || 0);

    console.log(`🧪 ForceDamageSources → total=${rawTotal}`, sources);
  } else if (hasProvidedSources) {
    sources = {
      piercingDamage: Math.max(0, Math.floor(totalDamageSources.piercingDamage || 0)),
      physical: Math.max(0, Math.floor(totalDamageSources.physical || 0)),
      magical: Math.max(0, Math.floor(totalDamageSources.magical || 0)),
      hybridalDamage: Math.max(0, Math.floor(totalDamageSources.hybridalDamage || 0)),
    };

    rawTotal =
      (sources.piercingDamage || 0) +
      (sources.physical || 0) +
      (sources.magical || 0) +
      (sources.hybridalDamage || 0);
  } else {
    ({ totalDamageSources: sources, totalDamage: rawTotal } = attemptAttackerDamages(attacker, attackDetail));
  }

finalLog.sources.base = snapSources(sources);
finalLog.totals.rawTotalBase = rawTotal;
finalLog.totals.sumSourcesBase = sumSources(sources);

const mysticismBonusResult = applyMysticismBonusToSources(
  sources,
  attacker,
  currentAttack
);

if (mysticismBonusResult.applied) {
	finalLog.attackModifiers.mysticism = true;
  sources = mysticismBonusResult.sources;

  rawTotal =
    (sources.piercingDamage || 0) +
    (sources.physical || 0) +
    (sources.magical || 0) +
    (sources.hybridalDamage || 0);

  const rawTotalBeforeMysticism = finalLog.totals.rawTotalBase || 0;
  const extraMysticismDamage = Math.max(0, rawTotal - rawTotalBeforeMysticism);

  if (
    extraMysticismDamage > 0 &&
    purePiercingArmorBypass <= 0 &&
    target.stats?.armor?.current > 0
  ) {
    const armorBeforeMysticismExtra = Number(target.stats.armor.current) || 0;

    const extraAbsorbedByArmor = Math.min(
      armorBeforeMysticismExtra,
      extraMysticismDamage
    );

    target.stats.armor.current = Math.max(
      0,
      armorBeforeMysticismExtra - extraAbsorbedByArmor
    );

saveEntityArmorState(target);
    absorbedByArmor += extraAbsorbedByArmor;
    remainingDamage += Math.max(0, extraMysticismDamage - extraAbsorbedByArmor);

    finalLog.armor.mysticismExtra = {
      extraMysticismDamage,
      ignoredArmor: false,
      armorBefore: armorBeforeMysticismExtra,
      absorbedByArmor: extraAbsorbedByArmor,
      armorAfter: target.stats.armor.current,
      remainingDamageAfterExtra: remainingDamage,
    };
  } else {
    remainingDamage += extraMysticismDamage;

    finalLog.armor.mysticismExtra = {
      extraMysticismDamage,
      ignoredArmor: purePiercingArmorBypass > 0,
      absorbedByArmor: 0,
      armorAfter: target.stats?.armor?.current || 0,
      remainingDamageAfterExtra: remainingDamage,
    };
  }

  finalLog.mysticism = {
    attempted: true,
    applied: true,
    bonusPercent: mysticismBonusResult.bonusPercent,
    bonusSources: mysticismBonusResult.bonusSources,
    after: snapSources(sources),
  };

  finalLog.sources.afterMysticism = snapSources(sources);
  finalLog.totals.rawTotalAfterMysticism = rawTotal;
  finalLog.totals.sumSourcesAfterMysticism = sumSources(sources);
  finalLog.totals.extraMysticismDamage = extraMysticismDamage;
  finalLog.totals.remainingDamageAfterMysticism = remainingDamage;

  console.log(
    `🔮 Mysticisme dégâts : +${mysticismBonusResult.bonusPercent}%`,
    {
      bonusSources: mysticismBonusResult.bonusSources,
      afterMysticism: finalLog.sources.afterMysticism,
      rawTotalAfterMysticism: rawTotal,
      extraMysticismDamage,
      armorMysticismExtra: finalLog.armor.mysticismExtra,
      remainingDamageAfterMysticism: remainingDamage,
    }
  );
} else {
  finalLog.mysticism = {
    attempted: !!currentAttack?.isLaunchedUnderMysticism,
    applied: false,
    bonusPercent: mysticismBonusResult.bonusPercent || 0,
  };

  finalLog.sources.afterMysticism = snapSources(sources);
  finalLog.totals.rawTotalAfterMysticism = rawTotal;
  finalLog.totals.sumSourcesAfterMysticism = sumSources(sources);
  finalLog.totals.extraMysticismDamage = 0;
  finalLog.totals.remainingDamageAfterMysticism = remainingDamage;
}

if (totalExecutionDamage > 0) {
  finalLog.attackModifiers.execution = true;

  sources.physical = (sources.physical || 0) + totalExecutionDamage;

  // IMPORTANT : sinon l'armorGate ratio écrase le bonus
  remainingDamage += totalExecutionDamage;

  rawTotal =
    (sources.piercingDamage || 0) +
    (sources.physical || 0) +
    (sources.magical || 0) +
    (sources.hybridalDamage || 0);

  finalLog.sources.afterExecutionBonus = snapSources(sources);
  finalLog.totals.remainingDamageAfterExecutionBonus = remainingDamage;
} else {
    finalLog.sources.afterExecutionBonus = snapSources(sources);
  }

  if (purePiercingArmorBypass > 0) {
    sources.piercingDamage = Math.max(
      0,
      (sources.piercingDamage || 0) - purePiercingArmorBypass
    );

    rawTotal =
      (sources.piercingDamage || 0) +
      (sources.physical || 0) +
      (sources.magical || 0) +
      (sources.hybridalDamage || 0);

    finalLog.armorGate.beforeBypassExtraction = snapSources(sources);

    console.log(
      `🗡️ TRANSPERÇANTE : extraction avant armor gate (${purePiercingArmorBypass})`
    );
  }

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

  if (purePiercingArmorBypass > 0) {
    sources.piercingDamage = (sources.piercingDamage || 0) + purePiercingArmorBypass;

    rawTotal =
      (sources.piercingDamage || 0) +
      (sources.physical || 0) +
      (sources.magical || 0) +
      (sources.hybridalDamage || 0);

    finalLog.armorGate.afterBypassReinject = snapSources(sources);
    finalLog.sources.afterArmorGate = snapSources(sources);
    finalLog.totals.rawTotalAfterArmorGate = rawTotal;
  }

  if (flags.applyRangeRatio) {
    const rr = calculateRangeRatio(attacker);

    finalLog.rangeRatio.rrPercent = rr;

    if (rr > 0) {
      const factor = 1 - rr / 100;

      finalLog.rangeRatio.applied = true;
      finalLog.rangeRatio.factor = factor;
      finalLog.rangeRatio.before = snapSources(sources);

      if (flags.applyRangeRatioToPiercing) {
        sources.piercingDamage = Math.round((sources.piercingDamage || 0) * factor);
      }

      if (flags.applyRangeRatioToPhysical) {
        sources.physical = Math.round((sources.physical || 0) * factor);
      }

      if (flags.applyRangeRatioToHybridPhysicalHalf) {
        const beforeHybrid = sources.hybridalDamage || 0;

        if (beforeHybrid > 0) {
          const physHalf = beforeHybrid / 2;
          const magHalf = beforeHybrid - physHalf;
          const physHalfReduced = Math.round(physHalf * factor);
          sources.hybridalDamage = Math.round(physHalfReduced + magHalf);
        }
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

  const {
    reducedpiercingDamage,
    reducedPhysicalDamage,
    reducedMagicalDamage,
    reducedHybridalDamage,
  } = calculateResistances(target, sources, attacker);

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
	finalLog.attackModifiers.esoterism = true;	
      const reductionPercent = calculateEsoterismtotalReduction(target);
      const multiplier = (100 - reductionPercent) / 100;

      totalDamageSourcesReduced.magical = Math.ceil((totalDamageSourcesReduced.magical || 0) * multiplier);

      const beforeHybrid = totalDamageSourcesReduced.hybridalDamage || 0;
      if (beforeHybrid > 0) {
        const physHalf = beforeHybrid / 2;
        const magHalf = beforeHybrid - physHalf;

        const magHalfReduced = Math.ceil(magHalf * multiplier);
        totalDamageSourcesReduced.hybridalDamage = Math.round(physHalf + magHalfReduced);
      }

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
  
  const targetIsOccultismInvisible =
    Boolean(target.flags?.occultismInvisible) ||
    Boolean(target.isInvisible) ||
    Boolean(target.invisible);

  const occultismFragilityPercent = targetIsOccultismInvisible
    ? Number(calculateOccultismShadowFragilityPercent(target)) || 0
    : 0;

  if (targetIsOccultismInvisible && occultismFragilityPercent > 0) {
	  finalLog.attackModifiers.occultismFragility = true;
    const multiplier = 1 + occultismFragilityPercent / 100;
    const beforeOccultismFragility = { ...totalDamageSourcesReduced };
    const beforeOccultismFragilityTotal = totalReducedDamage;

    totalDamageSourcesReduced = {
      piercingDamage: Math.round((totalDamageSourcesReduced.piercingDamage || 0) * multiplier),
      physical: Math.round((totalDamageSourcesReduced.physical || 0) * multiplier),
      magical: Math.round((totalDamageSourcesReduced.magical || 0) * multiplier),
      hybridalDamage: Math.round((totalDamageSourcesReduced.hybridalDamage || 0) * multiplier),
    };

    totalReducedDamage =
      (totalDamageSourcesReduced.piercingDamage || 0) +
      (totalDamageSourcesReduced.physical || 0) +
      (totalDamageSourcesReduced.magical || 0) +
      (totalDamageSourcesReduced.hybridalDamage || 0);

    finalLog.occultismFragility.attempted = true;
    finalLog.occultismFragility.applied = true;
    finalLog.occultismFragility.percent = occultismFragilityPercent;
    finalLog.occultismFragility.multiplier = multiplier;
    finalLog.occultismFragility.before = beforeOccultismFragility;
    finalLog.occultismFragility.after = { ...totalDamageSourcesReduced };
    finalLog.occultismFragility.beforeTotal = beforeOccultismFragilityTotal;
    finalLog.occultismFragility.afterTotal = totalReducedDamage;

    finalLog.sources.afterOccultismFragility = { ...totalDamageSourcesReduced };
    finalLog.totals.totalAfterOccultismFragility = totalReducedDamage;

    console.log(
      `🌑 Fragilité des ombres : ${target.name} est invisible → dégâts reçus +${occultismFragilityPercent}% (${beforeOccultismFragilityTotal} → ${totalReducedDamage}).`
    );
	EffectMessage(target, "Fragilité !");
  } else {
    finalLog.occultismFragility.attempted = targetIsOccultismInvisible;
    finalLog.occultismFragility.applied = false;
    finalLog.occultismFragility.percent = occultismFragilityPercent;
    finalLog.sources.afterOccultismFragility = { ...totalDamageSourcesReduced };
  }
  if (flags.canCrit) {
    finalLog.critical.attempted = true;

    const critResult = attemptCriticalHit(attacker, target, totalReducedDamage);
    finalLog.critical.isCritical = !!critResult.isCritical;
    finalLog.critical.chance = critResult.critTotalChance;
    finalLog.critical.bonusPercent = critResult.critDamageBonus;
    finalLog.critical.before = totalReducedDamage;

    if (critResult.isCritical) {
		 finalLog.attackModifiers.critical = true;
      popupType = "critical";
      attackDetail.effets = attackDetail.effets || [];
      if (!attackDetail.effets.includes("criticalHit")) {
        attackDetail.effets.push("criticalHit");
      }

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
    finalLog.critical.attempted = false;
    finalLog.critical.skippedByAttackRules = true;
  }

  const pipelineOut = Number(totalReducedDamage) || 0;

  const indReduc =
    (target.stats?.armor?.current || 0) <= 0
      ? (Number(caluclateIndestructibilityReductionTotal(target)) || 0)
      : 0;

  const afterInd = indReduc > 0 ? pipelineOut * Math.max(0, 1 - indReduc / 100) : pipelineOut;

  const finalDamagePreAstrality = Math.max(0, Math.round(afterInd));
  target.stats.HP.current = Math.max(0, hpBefore - finalDamagePreAstrality);

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

  const hpAfter = target.stats.HP.current;
  const hpLoss = hpBefore - hpAfter;
  const damageApplied = hpLoss;

const overkillDamage = finalDamagePreAstrality - damageApplied;

if (
  target.stats.HP.current <= 0 &&
  overkillDamage > 0 &&
  overkillDamage >= hpBefore * 1.5
) {
  finalLog.attackModifiers.overkill = {
    excess: overkillDamage,
    hpBefore,
  };
   EffectMessage(target, "OVERKILL !");
} if (
  finalLog.attackModifiers.execution &&
  target.stats.HP.current <= 0
) {
  attacker.flags = attacker.flags || {};
  attacker.flags.bloodCrazyNextExecution = true;
  finalLog.attackModifiers.bloodCrazyGain = true;

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
// Voracité sanguinaire
if (
  finalLog.attackModifiers.execution &&
  finalLog.attackModifiers.overkill
) {
  const hp = attacker?.stats?.HP;

  if (hp && typeof hp === "object") {
    const hpBeforeGlutony = Number(hp.current) || 0;
    const hpMaxGlutony = Number(hp.max) || 0;

    hp.current = hpMaxGlutony;

    const healGlutony = Math.max(0, hpMaxGlutony - hpBeforeGlutony);

    finalLog.attackModifiers.bloodGlutony = true;
    finalLog.attackModifiers.bloodGlutonyHeal = healGlutony;

    saveEntityHPToStorage(attacker);

    updateHealthBar(
      attacker.stats.HP.current,
      attacker.stats.HP.max,
      attacker.stats.armor?.current || 0,
      attacker.stats.armor?.max || 0,
      attacker.id
    );

    updateHPCounters(
      attacker.id,
      attacker.stats.HP.current,
      attacker.stats.HP.max
    );

    if (healGlutony > 0) {
      PopUpDamages(
        attacker,
        healGlutony,
        "blood-glutony",
        null,
        {},
        "blood-glutony"
      );
    }
  }
}
  finalLog.out.pipelineOut = pipelineOut;
  finalLog.out.indReducPercent = indReduc;
  finalLog.out.afterInd = afterInd;
  finalLog.out.finalDamage = finalDamagePreAstrality;
  finalLog.out.hpLoss = hpLoss;
  finalLog.out.astralityTriggered = astralityTriggered;
finalLog.attackModifiers.astrality = astralityTriggered;

if (flags.canBloodThirsty) {
  const bloodThirstyPoints = Number(attacker?.stats?.bloodThirsty || 0);

  if (bloodThirstyPoints > 0 && damageApplied > 0) {
    const bloodThirstyPercent = getBloodThirstyPercent(bloodThirstyPoints);

    if (bloodThirstyPercent > 0) {
      const hpBeforeBloodThirsty =
        attacker?.stats?.HP?.current ?? attacker?.stats?.HP ?? 0;

      LifestealBloodFury(
        attacker,
        target,
        damageApplied,
        bloodThirstyPercent
      );

      const hpAfterBloodThirsty =
        attacker?.stats?.HP?.current ?? attacker?.stats?.HP ?? 0;

      const bloodThirstyHeal = Math.max(
        0,
        hpAfterBloodThirsty - hpBeforeBloodThirsty
      );

      if (bloodThirstyHeal > 0) {
        finalLog.attackModifiers.bloodThirstyHeal = bloodThirstyHeal;
      }
    }
  }
}
  attacker.totalDamage += damageApplied;

const balancedNoAggro =
  Boolean(attacker.attackBalancedNoAggro) ||
  Boolean(attacker.currentAttack?.isBalancedNoAggro);

const aggroDamageApplied = balancedNoAggro ? 0 : damageApplied;

attacker.totalAggroDamage += aggroDamageApplied;

if (balancedNoAggro && damageApplied > 0) {
  console.log(
    `⚖️ ${attacker.name} génère 0 aggro avec Attaque équilibrée (${damageApplied} dégâts ignorés pour l'aggro).`
  );
}

updateTotalDamageCounter(`TotalDamages_${attacker.id}`, attacker.totalDamage);

  console.log(`❤️ ${target.name} perd ${damageApplied} HP (${target.stats.HP.current}/${target.stats.HP.max}).`);

  saveEntityHPToStorage(target);

  const armorGate = Math.max(0, Math.round(absorbedByArmor));
const isExecutionCritical =
  finalLog.attackModifiers.execution &&
  finalLog.attackModifiers.critical;

const finalPopupType = isExecutionCritical
  ? "execution-critical"
  : popupType;
  
PopUpDamages(
  target,
  finalDamagePreAstrality,
  attackDetail.effets,
  popupContent,
  totalDamageSourcesReduced,
  finalPopupType,
  armorGate
);

  if (attackDetail.effets) {
    attackDetail.effets.forEach((effectName) => applyEffect(target, effectName, attacker));
  }

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

  LifeandDeath(target, attacker);

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


  logFinalDamageResolution(finalLog);

  if (target.isDEAD) {
    console.log(`${target.name} est mort suite aux dégâts infligés.`);
  }
}

function consumeBloodCrazy(attacker) {
  if (!attacker) {
    return;
  }

  attacker.flags = attacker.flags || {};

  if (!attacker.flags.bloodCrazyNextExecution) {
    return;
  }

  attacker.flags.bloodCrazyNextExecution = false;

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
        img.src = attack.attackAsset
            ? `${attack.attackAsset}-ld.jpg`
            : '';

        img.alt = attack.displayName || 'Attaque en cours';
    } else {
        img.src = '';
        img.alt = 'Attaque inconnue';
    }
}
