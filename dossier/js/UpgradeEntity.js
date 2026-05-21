import { saveUpgradedEntity, saveToLocalStorage, purgeStatPreview } from './GameStorage.js';
import { validateAndSetNickname } from './secure.js';
import { levelDetails, calculateVitalityBonus, calculateVelocityReduction, calculateRobustnessBonus,  calculateTranscendenceExtraLife, recomputeEntityStats, maxLevel as MAX_LEVEL, BaseDayHpRegen } from '/js/entites.js';
import { cyclesData } from './cycleData.js';
import { stats as STATS_DATA } from './statsData.js';
import { toRoman } from './ui.js';
import { createUmbraBlock } from './GameInit.js';
import { toNumber, calculatewillAwakeBonus,  calculateVitalityRegenPercent,  calculateVitalityRegenAmount,  calculateTotalRegenAmount } from './damagesCalcul.js';
import { startArchup } from './meteo.js';
import { updateBonusLifeCounters, updateArmorCounter } from './entityAttributs.js';


export let playerExperience = parseInt(localStorage.getItem('playerExperience')) || 0;
const attributS = [
  { label: "Force",         key: "strength",     short: "F" },
  { label: "Agilite",       key: "agility",      short: "A" },
  { label: "Intelligence",  key: "intelligence", short: "I" },
];
// Index classes (clé normalisée)
export const CLASS_INDEX = cyclesData.reduce((acc, c) => {
  const key = String(c.key ?? '').trim().toLowerCase();
  acc[key] = { ...c, key };
  return acc;
}, {});

// Index sous-stats (par attribut + mapping type->key)
const STAT_INDEX = STATS_DATA.reduce((acc, s) => {
  const attribut = String(s.attribut ?? '').trim().toLowerCase(); // force|agilite|intelligence
  if (!acc.byattribut[attribut]) acc.byattribut[attribut] = [];
  acc.byattribut[attribut].push(s.key);
  if (!acc.typeToKey[attribut]) acc.typeToKey[attribut] = {};
  acc.typeToKey[attribut][String(s.type).trim()] = s.key;
  return acc;
}, { byattribut: { force: [], agilite: [], intelligence: [] }, typeToKey: {} });

export const DEFAULT_CYCLE = ['attaque-1', 'defense-1', 'utilitaire-1'];
const attribut_SHORT_TO_NAME = { F: 'force', A: 'agilite', I: 'intelligence' };
const KEY_TO_attributNAME    = { strength: 'force', agility: 'agilite', intelligence: 'intelligence' };
const whiteBarTimers = new Map(); // pour suivre les timers par barre

function getFallbackMaxLevel() {
  // Fallback global si l'entité n'a pas encore son .max dédié
  if (typeof MAX_LEVEL === 'number') return MAX_LEVEL;
  if (Array.isArray(levelDetails) && levelDetails.length) {
    return Math.max(...levelDetails.map(l => l.level || 0));
  }
  return 100; // dernier filet de sécurité
}

// 🔧 Utilisé par entites.js ET UpgradeEntity.js
export function ensureEntityLevelObject(entite) {
  if (!entite) return;

  const globalMax = MAX_LEVEL; // ou BASE_MAX_LEVEL + WILL_MAX_BONUS
  const raw = entite.level;

  if (raw == null || typeof raw === 'number') {
    const current = (typeof raw === 'number' && raw > 0 && !Number.isNaN(raw)) ? raw : 1;
    entite.level = { current, max: Math.max(current, globalMax) };
    return;
  }

  if (typeof raw === 'object') {
    const lvlObj = raw;
    const cur = (typeof lvlObj.current === 'number' && lvlObj.current > 0) ? lvlObj.current
              : (typeof lvlObj.level === 'number' && lvlObj.level > 0) ? lvlObj.level
              : 1;

    const mx = (typeof lvlObj.max === 'number' && lvlObj.max > 0) ? lvlObj.max : Math.max(cur, globalMax);
    entite.level = { current: cur, max: mx };
  }
}

function getEntityLevelCurrent(entite) {
  if (!entite) return 1;
  ensureEntityLevelObject(entite);
  return entite.level.current;
}

function getEntityLevelMax(entite) {
  if (!entite) return getFallbackMaxLevel();
  ensureEntityLevelObject(entite);
  return entite.level.max;
}

function setEntityLevelCurrent(entite, value) {
  if (!entite) return;
  ensureEntityLevelObject(entite);

  const max = entite.level.max;
  const clamped = Math.min(Math.max(1, value), max);

  entite.level.current = clamped;
  return clamped;
}
function ensureHPDom(entityId, label = "Points de vie") {
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
      el.textContent = `HP : ${cur} / ${max}`;
    });
}
function ensureArmorBarDom(entityId, initialArmor = 0) {
  const barsContainer = document.getElementById(`HeadsupLifeBars_${entityId}`);
  if (!barsContainer) return null;

  let armorBar = barsContainer.querySelector(
    `.armor-bar[data-stat="armor-bar"][data-entity-id="${entityId}"]`
  );
  if (armorBar) return armorBar;

  const hpBar = barsContainer.querySelector(
    `.health-bar[data-stat="hp-bar"][data-entity-id="${entityId}"]`
  ) || barsContainer.querySelector(`.health-bar[data-entity-id="${entityId}"]`);

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

export function updateHealthBar(currentHP, maxHP, currentArmor, maxArmor, entityId, incomingDamage = 0) {
  // --- 1) Application du dégât sur armure puis HP ---
  let remainingDamage = incomingDamage;

  ensureHPDom(entityId);

  if (remainingDamage > 0) {
    if (currentArmor > 0) {
      if (remainingDamage <= currentArmor) {
        currentArmor -= remainingDamage;
        remainingDamage = 0;
      } else {
        remainingDamage -= currentArmor;
        currentArmor = 0;
      }
    }
    if (remainingDamage > 0) currentHP = Math.max(0, currentHP - remainingDamage);
  }

  // --- 2) Clamp ---
  const validHP = Math.max(0, Math.min(currentHP, maxHP));
  const validArmor = Math.max(0, Math.min(currentArmor, maxArmor));

  updateHPCounters(entityId, validHP, maxHP);

  // ✅ CRÉATION DOM ARMOR BAR (si elle n’existe pas)
  // Tu peux mettre la condition que tu veux :
  // - maxArmor > 0 (armure "existe")
  // - ou (maxArmor > 0 && validArmor > 0) (armure affichée seulement si > 0)
  if (maxArmor > 0) ensureArmorBarDom(entityId, validArmor);

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

  // --- 4) ARMURE ---
  document.querySelectorAll(
    `.armor-bar[data-stat="armor-bar"][data-entity-id="${entityId}"]`
  ).forEach(armorBar => {
    const armorFill = armorBar.querySelector(".armor-fill");
    const armorText = armorBar.querySelector(
      `.armor-text[data-stat="armor-text"][data-entity-id="${entityId}"]`
    );

    if (armorFill) armorFill.style.transition = "width 0.5s ease";

    if (validArmor <= 0) {
      armorBar.style.display = "none";
    } else {
      armorBar.style.display = "";
      armorBar.style.setProperty("width", `${armorPercent}%`, "important");
      armorBar.style.flex = `0 0 ${armorPercent}%`;
      if (armorFill) armorFill.style.width = "100%";

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

    if (armorText) armorText.textContent = `🛡️ ${validArmor}`;
  });

  // --- 5) HP ---
  document.querySelectorAll(
    `.health-bar[data-stat="hp-bar"][data-entity-id="${entityId}"]`
  ).forEach(healthBar => {
    const healthFill = healthBar.querySelector(".health-fill");
    if (healthFill) healthFill.style.transition = "width 0.5s ease, background-color 0.5s ease";
    healthBar.style.setProperty("width", `${hpPercent}%`, "important");
    healthBar.style.flex = `0 0 ${hpPercent}%`;
    updateHealthBarAnimation(healthBar, hpColorPercent);
  });

  // --- 6) Texte HP ---
  document.querySelectorAll(
    `.entite-stat[data-stat="HP"][data-entity-id="${entityId}"]:not(.preview):not([data-display="max"])`
  ).forEach(el => el.textContent = `${validHP} / ${maxHP}`);

  // --- 7) Texte ARMURE (compteur) ---
  document.querySelectorAll(
    `[data-stat="armor-counter"][data-entity-id="${entityId}"]`
  ).forEach(el => {
    if (validArmor <= 0) el.style.display = "none";
    else {
      el.style.display = "";
      el.textContent = `🛡️ ${validArmor}`;
    }
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
    healthFill.style.transition = 'background-color 0.5s ease';
    healthFill.style.backgroundColor = color;
  } else {
    healthBar.style.transition = 'background-color 0.5s ease';
    healthBar.style.backgroundColor = color;
  }

if (percentage <= 30) {
  const maxDuration = 1.0;   // durée du clignotement à 30 % HP
  const minDuration = 0.04;  // durée minimale à 0 % HP
  const normalized = Math.max(0, Math.min(percentage / 30, 1));
  // exponent plus faible pour accélérer davantage à la fin
  const duration = minDuration + Math.pow(normalized, 1.5) * (maxDuration - minDuration);
  healthBar.style.animation = `blink ${duration}s ease-in-out infinite`;
} else {
  healthBar.style.animation = '';
  healthBar.style.opacity = '1';
}

}

export function updateStatsInDOM(statsObject, baseStats = {}) {
  const entityId = baseStats.id || statsObject.id || statsObject.entityId;
  if (!entityId) return;

const qAll = (stat, { preview = false } = {}) =>
  document.querySelectorAll(
    preview
      ? `.entite-stat.preview[data-stat="${stat}"][data-entity-id="${entityId}"]`
      : `.entite-stat[data-stat="${stat}"][data-entity-id="${entityId}"]:not(.preview)`
  );

const qOne = (stat, opts) => qAll(stat, opts)[0] || null;
  const toggleAttrUp = (el, on) => {
    const c = containerOf(el);
    if (!c) return;
    on ? c.setAttribute('upgraded', '') : c.removeAttribute('upgraded');
  };

  // 🔹 fonction utilitaire : gérer le "last"
  const setLastUpgraded = (containers) => {
    if (!Array.isArray(containers)) containers = [containers];

    // wipe tous les "last" avant
    const allStats = document.querySelectorAll(`.entite-stat[data-entity-id="${entityId}"]`);
    allStats.forEach((el) => {
      const c = containerOf(el);
      if (c) c.classList.remove("last");
    });

    // puis marquer tous les containers donnés
    containers.forEach(c => {
      if (c) c.classList.add("last");
    });
  };

  for (const [stat, payload] of Object.entries(statsObject)) {
    const value = (typeof payload === "object" && "value" in payload) ? payload.value : payload;
    const isNew = (typeof payload === "object" && payload.isNew);

    // --- VITALITY → met à jour HP.max ---
if (stat === "vitality") {
  const vitEl = qOne("vitality");
  const vitC = containerOf(vitEl);

  if (vitEl && vitC) {
    vitEl.textContent = value;
    if (isNew) vitC.classList.add("new");
    vitC.classList.remove("reducted");
    vitC.classList.toggle("upgraded", value > (baseStats.vitality ?? 0));
    if (value < (baseStats.vitality ?? 0)) vitC.classList.add("reducted");
  }

  if (vitC?.classList.contains("upgraded")) {
    setLastUpgraded(vitC);
  }

  continue;
}
    // --- HP normal ---
// --- HP permanent (NE DOIT PAS écraser la preview) ---
if (stat === 'HP' && typeof value === 'object') {
  ensureHPDom(entityId);

  const els = qAll('HP'); // ✅ uniquement non-preview
  if (!els.length) continue;

  const baseMax =
    typeof baseStats.HP === 'object'
      ? (baseStats.HP.max ?? 0)
      : (baseStats.HP ?? 0);

  // 1) Texte permanent
  els.forEach((el) => {
    el.textContent = `${value.current} / ${value.max}`;

    const c = containerOf(el);
    if (!c) return;

    if (isNew) c.classList.add("new");
    c.classList.remove("reducted");
    c.classList.toggle("upgraded", value.max > baseMax);
    if (value.max < baseMax) c.classList.add("reducted");
    if (c.classList.contains("upgraded")) setLastUpgraded(c);
  });

  // 2) Barres HP/armure (permanent)
  const armorCur = (typeof baseStats.armor === "object")
    ? (baseStats.armor.current ?? 0)
    : (baseStats.armor ?? 0);

  const armorMax = (typeof baseStats.armor === "object")
    ? (baseStats.armor.max ?? 0)
    : (baseStats.armor ?? 0);

  updateHealthBar(value.current, value.max, armorCur, armorMax, entityId);
  updateHPCounters(entityId, value.current, value.max);
  continue;
}

    // --- autres stats ---
    const el = qOne(stat);
    if (!el) {
      const def = STATS_DATA.find(s => s.key === stat);
      if (def) {
        const statsContainer = document.querySelector(".entity-stats-section.left");
        if (statsContainer) {
          createUmbraBlock(
            statsContainer,
            def.name,
            () => value,
            { id: entityId },
            def.key
          );
        }
      }
      continue;
    }

    const c = containerOf(el);
    if (!c) continue;

    if (isNew) c.classList.add("new");

    if (stat === 'velocity') {
      const baseSpeed = baseStats.speed ?? 1000;
      const { adjustedSpeed } = calculateVelocityReduction(value, baseSpeed);

      const velEl = qOne("velocity");
      const velC = containerOf(velEl);
      if (velEl && velC) {
        velEl.textContent = value;
        if (isNew) velC.classList.add("new");
        velC.classList.remove("reducted");
        velC.classList.toggle("upgraded", value > (baseStats.velocity ?? 0));
        if (value < (baseStats.velocity ?? 0)) velC.classList.add("reducted");
      }

      const speedEl = qOne('speed');
      const spdC = containerOf(speedEl);
      if (speedEl && spdC) {
        const sec = (Number(adjustedSpeed ?? 0) / 1000).toFixed(1);
		speedEl.textContent = `${sec} s`;
        spdC.classList.remove("reducted");
        if (adjustedSpeed < baseSpeed) {
          spdC.classList.add("upgraded");
        } else if (adjustedSpeed > baseSpeed) {
          spdC.classList.add("reducted");
        } else {
          spdC.classList.remove("upgraded", "reducted");
        }
      }

      // si velocity ou speed sont upgraded → appliquer "last" sur les deux
      if ((velC?.classList.contains("upgraded")) || (spdC?.classList.contains("upgraded"))) {
        setLastUpgraded([velC, spdC]);
      }

      continue;
    }

    // cas générique
    el.textContent = value;
    const baseValue = (baseStats && baseStats[stat] !== undefined) ? baseStats[stat] : 0;

    if (value <= 0) {
      c.classList.add('zero');
      c.classList.remove('upgraded', 'reducted', 'last');
    } else {
      c.classList.remove('zero', 'upgraded', 'reducted', 'last');

      if (value > baseValue) {
        if (stat === 'strength' || stat === 'agility' || stat === 'intelligence') {
          toggleAttrUp(el, true);
        } else {
          c.classList.add("upgraded");
          setLastUpgraded(c);
        }
      } else if (value < baseValue) {
        c.classList.add("reducted");
      }
    }
  }
}

export function syncDOMWithStats(oldStats = {}, newStats = {}, entityId) {
  if (!entityId) return;

  const changedStats = {};
  const allKeys = new Set([...Object.keys(oldStats), ...Object.keys(newStats)]);

  const isDifferent = (a, b) => {
    // simple & robuste pour tes payloads (numbers + objets HP/armor)
    if (a === b) return false;
    return JSON.stringify(a) !== JSON.stringify(b);
  };

  for (const stat of allKeys) {
    const oldVal = oldStats[stat];
    const newVal = (newStats[stat] !== undefined) ? newStats[stat] : 0;

    if (isDifferent(oldVal, newVal)) {
      changedStats[stat] = {
        value: newVal,
        isNew: !(stat in oldStats)
      };
    }
  }

  // ✅ IMPORTANT : si velocity change, on force aussi la MAJ de speed
  // (sinon ton DOM peut garder une speed obsolète)
  if ("velocity" in changedStats) {
    if (newStats.speed !== undefined) {
      changedStats.speed = {
        value: newStats.speed,
        isNew: !("speed" in oldStats)
      };
    }
  }

  updateStatsInDOM(changedStats, { id: entityId, ...oldStats });
  localStorage.setItem("entityStats", JSON.stringify(newStats));
  return changedStats; // optionnel, mais pratique en debug
}


export function createNicknameForm(entite, codexColumn) {
    let nicknameForm = document.createElement('div');
    nicknameForm.className = 'nickname-form-container';

    // H2 pour afficher le pseudo
    let nicknameDisplay = document.createElement('h2');
    nicknameDisplay.className = 'nickname-display';
    nicknameDisplay.textContent = entite.nickname || '';
    nicknameForm.appendChild(nicknameDisplay);

    // Picto éditer
    let editIcon = document.createElement('span');
    editIcon.className = 'icon edit-icon';
    editIcon.innerHTML = '&#9998;'; // Pencil symbol
    editIcon.style.visibility = 'hidden';
    editIcon.style.transition = 'opacity 2s';
    editIcon.style.opacity = '0';
    nicknameForm.appendChild(editIcon);

    // Bouton pour ajouter un surnom
    let addNicknameButton = document.createElement('div');
    addNicknameButton.className = 'new-nickname';
    addNicknameButton.textContent = 'Donner un surnom';
    addNicknameButton.style.display = entite.nickname ? 'none' : 'inline-block';
    nicknameForm.appendChild(addNicknameButton);

    // Champ de modification
    let nicknameInput = document.createElement('input');
    nicknameInput.type = 'text';
    nicknameInput.placeholder = 'Donner un surnom à votre entité';
    nicknameInput.className = 'nickname-input';
    nicknameInput.style.display = 'none';
    nicknameForm.appendChild(nicknameInput);

    // Picto valider
    let validateIcon = document.createElement('span');
    validateIcon.className = 'icon validate-icon';
    validateIcon.innerHTML = '&#10004;'; // Checkmark symbol
    validateIcon.style.display = 'none';
    nicknameForm.appendChild(validateIcon);

    // Picto effacer
    let clearIcon = document.createElement('span');
    clearIcon.className = 'icon clear-icon';
    clearIcon.innerHTML = '&#10006;'; // Cross symbol
    clearIcon.style.display = 'none';
    nicknameForm.appendChild(clearIcon);

    const toggleToEditMode = () => {
        nicknameDisplay.style.display = 'none';
        addNicknameButton.style.display = 'none';
        nicknameInput.style.display = 'inline-block';
        validateIcon.style.display = 'inline-block';
        clearIcon.style.display = 'inline-block';
        nicknameInput.value = entite.nickname || '';
        nicknameInput.focus();

        // Désactiver temporairement la transition
        editIcon.style.transition = 'none';
        editIcon.style.opacity = '0';

        // Réactiver la transition après la mise à jour de l'opacité
        setTimeout(() => {
            editIcon.style.transition = 'opacity 2s';
        });

        document.addEventListener('click', outsideClickListener);
    };

const toggleToDisplayMode = () => {
    nicknameDisplay.style.display = 'block';
    addNicknameButton.style.display = entite.nickname ? 'none' : 'inline-block';
    nicknameInput.style.display = 'none';
    validateIcon.style.display = 'none';
    clearIcon.style.display = 'none';
    nicknameDisplay.textContent = entite.nickname || '';

    // 🔄 Mise à jour de la liste Codex en temps réel
    const codexEntry = document.querySelector(`#CodexEntityList_${entite.id}`);
    if (codexEntry) {
        const nameLabel = codexEntry.querySelector('.codex-entity-name');
        if (nameLabel) {
            nameLabel.textContent = entite.nickname || entite.name;
        }
    }

    document.removeEventListener('click', outsideClickListener);
};

const outsideClickListener = (event) => {
  if (event.target === clearIcon) return; // laisser le handler clear gérer seul
  if (!nicknameForm.contains(event.target)) {
    if (nicknameInput.style.display === 'inline-block') {
      entite.nickname = nicknameInput.value.trim();
      if (validateAndSetNickname(entite, nicknameInput, nicknameDisplay)) {
        toggleToDisplayMode();
      }
    }
  }
};


    // Gestion de l'édition via hover sur le H2
    nicknameDisplay.addEventListener('mouseover', () => {
        if (entite.nickname) {
            editIcon.style.visibility = 'visible';
            editIcon.style.opacity = '1';
        }
        nicknameDisplay.style.cursor = 'pointer';
    });

    nicknameDisplay.addEventListener('mouseout', () => {
        editIcon.style.opacity = '0';
    });

    nicknameDisplay.addEventListener('click', toggleToEditMode);

    // Gestion de l'édition
    editIcon.addEventListener('click', toggleToEditMode);

    // Gestion de l'ajout de surnom
    addNicknameButton.addEventListener('click', toggleToEditMode);

    // Validation du surnom
    validateIcon.addEventListener('click', () => {
        entite.nickname = nicknameInput.value.trim();
        if (validateAndSetNickname(entite, nicknameInput, nicknameDisplay)) {
            toggleToDisplayMode(); // Quitte le mode édition seulement si le surnom est valide
        }
    });

    // Effacer le surnom
    clearIcon.addEventListener('click', () => {
        // Supprimer le pseudo quoi qu'il arrive
        entite.nickname = null;
        saveUpgradedEntity(entite); // Sauvegarder l'entité après suppression
        toggleToDisplayMode(); // Retourner au mode d'affichage
    });

    // Validation via la touche Entrée
    nicknameInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            entite.nickname = nicknameInput.value.trim();
            if (validateAndSetNickname(entite, nicknameInput, nicknameDisplay)) {
                toggleToDisplayMode(); // Quitte le mode édition seulement si le surnom est valide
            }
        }
    });

    // Ajouter le formulaire à la colonne spécifiée
    codexColumn.appendChild(nicknameForm);

    // Initialiser la visibilité des pictos
    if (entite.nickname) {
        editIcon.style.visibility = 'hidden';
    } else {
        editIcon.style.visibility = 'hidden';
    }
}
export function updateNickname(entite, newNickname, currentNickname) {
    newNickname = newNickname.trim();
    entite.nickname = newNickname;
    currentNickname.textContent = newNickname || 'Aucun surnom défini';
    console.log(`Le surnom de l'entité ID ${entite.id} a été modifié en : "${newNickname || 'Aucun'}"`);
} 

export function LevelupSignal(
  entite,
  type = 'bouton',
  { onOpen = null, section = 'Profil', parent = null } = {}
) {
  const currentLevel = getEntityLevelCurrent(entite);
  const maxLevelForEntity = getEntityLevelMax(entite);

  const nextLevelData = levelDetails.find(l => l.level === currentLevel + 1);
  const playerXP = parseInt(localStorage.getItem('playerExperience')) || 0;

  const canLevelUp = !!(
    nextLevelData &&
    currentLevel < maxLevelForEntity &&
    playerXP >= nextLevelData.cost
  );

  const el = document.createElement(type === 'bouton' ? 'div' : 'span');
  el.className = type === 'bouton' ? 'btn levelup-btn' : 'levelup-icon';

  if (type === 'bouton') {
    el.textContent = 'Monter le niveau 🡅';
  } else {
    el.innerHTML = '🡅';
    el.title = 'Monter le niveau';
  }

  // ✅ resolve parent (Element ou selector)
  const parentEl =
    parent instanceof Element ? parent :
    (typeof parent === 'string' ? document.querySelector(parent) : null);

  // ✅ si pas de level up possible, on cache et (optionnel) on retire du parent
  if (!canLevelUp) {
    if (type !== 'bouton' && parentEl) {
      parentEl.querySelectorAll('.levelup-icon').forEach(n => n.remove());
    }
    el.style.display = 'none';
    el.setAttribute('aria-hidden', 'true');
    return el;
  }

  const triggerOpen = (e) => {
    e?.stopPropagation?.();

    const statsMenuIndex = 2;
    const levelUpSubmenuIndex = 2;

    saveToLocalStorage('CodexMenuIndex', statsMenuIndex);
    saveToLocalStorage('CodexSubmenuIndex', levelUpSubmenuIndex);

    if (typeof showSection === 'function') showSection('Stats');
    if (typeof createLevelUpForm === 'function') createLevelUpForm(entite);

    if (typeof onOpen === 'function') onOpen(section);
  };

  el.style.cursor = 'pointer';
  el.tabIndex = 0;
  el.addEventListener('click', triggerOpen);
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') triggerOpen(e);
  });

  // ✅ si on a un parent cible + type icon => on mount ici (sans doublon)
  if (type !== 'bouton' && parentEl) {
    parentEl.querySelectorAll('.levelup-icon').forEach(n => n.remove());
    parentEl.appendChild(el);
  }

  return el;
}

// Fonction pour mettre à jour l'affichage de l'Experience à chaque modification
export function updateExperienceDisplay() {
    const scoringDiv = document.getElementById('score');
    if (scoringDiv) {
        scoringDiv.textContent = `Experience : ${playerExperience}`;
    }
}

function levelUpWithXP(entite, xpCost) {
    if (playerExperience >= xpCost) {
        // Retrancher l'XP du joueur
        playerExperience -= xpCost;

        // Ajouter l'XP à l'entité
        entite.experience += xpCost;

        let currentLevel = getEntityLevelCurrent(entite);
        const maxLevelForEntity = getEntityLevelMax(entite);

        let nextLevelData = levelDetails.find(level => level.level === currentLevel + 1);

        while (
          nextLevelData &&
          entite.experience >= nextLevelData.totalExperience &&
          currentLevel < maxLevelForEntity
        ) {
            currentLevel++;
            setEntityLevelCurrent(entite, currentLevel);
            nextLevelData = levelDetails.find(level => level.level === currentLevel + 1);

            console.log(`🎉 ${entite.name} est passé au niveau ${currentLevel} !`);

            const levelDisplay = document.querySelector(`#level-${entite.id}`);
            if (levelDisplay) {
                levelDisplay.textContent = `Niveau actuel : ${currentLevel}`;
            }
        }

        // Sauvegarde dans selectedArmyA
        const enrichedArmyA = JSON.parse(localStorage.getItem('selectedArmyA')) || [];
        const index = enrichedArmyA.findIndex(e => e.id === entite.id);
        if (index !== -1) {
            enrichedArmyA[index] = entite;
            localStorage.setItem('selectedArmyA', JSON.stringify(enrichedArmyA));
        }

        // Sauvegarder l'XP joueur
        localStorage.setItem('playerExperience', playerExperience);
        console.log(`Experience restante du joueur : ${playerExperience}`);

        updateExperienceDisplay();
    } else {
        console.warn("Pas assez d'Experience pour augmenter le niveau !");
    }
}

function buildCostMap(levelDetails) {
  const map = new Map();
  for (const l of levelDetails) map.set(l.level, l.cost);
  return map;
}
function costAt(costMap, level) { return costMap.get(level) ?? null; }

// DOM LVL UP
function createLevelElements(entite) {
	
	const levelUpSection = document.createElement('div');
	levelUpSection.className = 'level-up-section';

	const SoulSection = document.createElement('div');
	SoulSection.className = 'soul-section';
	SoulSection.id = `soul-section-${entite.id}`;

	// Icones Archetypes
	const ArchSection = document.createElement('div');
	ArchSection.className = 'archetype-icon-section';
	ArchSection.id = `archetype-icons-${entite.id}`;

	// On STOCKE les achieve. On NE crée PAS les icônes maintenant !
	const achievedList = (entite.Archetype && Array.isArray(entite.Archetype.achieve))
		? [...entite.Archetype.achieve]
		: [];

	// Graphique temps réel (camembert) — tout en haut
	const graphcontainer = document.createElement('div');
	graphcontainer.className = 'attribut-graph-container';
	graphcontainer.id = `soul-${entite.id}`;
	graphcontainer.classList.add("created");
	setTimeout(() => { graphcontainer.classList.remove("created"); }, 500);

	const graphCanvas = document.createElement('canvas');
	graphCanvas.width = 122;
	graphCanvas.height = 122;
	graphCanvas.className = 'attribut-graph';

	const eclipseCanvas = document.createElement('img');
	eclipseCanvas.src = '/media/assets/misc/soul-eclipsaura.webp';
	eclipseCanvas.className = 'attribut-eclipse';
	eclipseCanvas.id = 'eclipse';

	const circleSoul = document.createElement('div');
	circleSoul.className = 'attribut-circleSoul';

	const soulEntity = document.createElement('div');
	soulEntity.className = 'attribut-entitySoul';

	const entitySoulImg1 = document.createElement('img');
	entitySoulImg1.src = '/media/assets/misc/soul-entity-01.png';
	entitySoulImg1.className = 'attribut-entitySoul one';

	const entitySoulImg2 = document.createElement('img');
	entitySoulImg2.src = '/media/assets/misc/soul-entity-02.png';
	entitySoulImg2.className = 'attribut-entitySoul two';

	const entitySoulBg = document.createElement('div');
	entitySoulBg.className = 'entitySoul-bg';

	const entitySoulblack = document.createElement('div');
	entitySoulblack.className = 'black-circle';

	soulEntity.appendChild(entitySoulImg1);
	soulEntity.appendChild(entitySoulImg2);

	const soulDepth = document.createElement('div');
	soulDepth.className = 'soul-depth';

	const soulAura = document.createElement('div');
	soulAura.className = 'soul-aura';

	graphcontainer.appendChild(soulEntity);
	graphcontainer.appendChild(entitySoulBg);
	graphcontainer.appendChild(entitySoulblack);
	graphcontainer.appendChild(eclipseCanvas);
	graphcontainer.appendChild(graphCanvas);
	graphcontainer.appendChild(circleSoul);
	graphcontainer.appendChild(soulDepth);
	graphcontainer.appendChild(soulAura);

	// Archétype actif — juste en dessous du graph
	const archetypeLine = document.createElement('div');
	archetypeLine.className = 'archetype-line';
	archetypeLine.id = `archetype-line-${entite.id}`;
	
	const archetypeLabel = document.createElement('span');
	archetypeLabel.className = 'archetype-title';

	const archetypeDesc = document.createElement('p');
	archetypeDesc.className = 'archetype-description';
	archetypeDesc.textContent = '';

	// Jauge de progression
	const gaugeWrap = document.createElement('div');
	gaugeWrap.className = 'archetype-bar';

	const canvasUp = document.createElement('canvas');
	canvasUp.id = 'archup';
	canvasUp.className = 'arch-up';

	const gaugeBar = document.createElement('div');
	gaugeBar.className = 'archetype-lvl-bar';

	const gaugeFill = document.createElement('div');
	gaugeFill.className = 'archetype-level-fill';

	const gaugeLabel = document.createElement('div');
	gaugeLabel.className = 'archetype-lvl-label';
	gaugeLabel.style.opacity = '0';
	gaugeLabel.style.transition = 'opacity 250ms ease';
	gaugeLabel.style.pointerEvents = 'none';

	const showGaugeHint = () => { gaugeLabel.style.opacity = '1'; };
	const hideGaugeHint = () => { gaugeLabel.style.opacity = '0'; };

	gaugeWrap.addEventListener('mouseenter', showGaugeHint);
	gaugeWrap.addEventListener('mouseleave', hideGaugeHint);
	gaugeWrap.addEventListener('focusin',   showGaugeHint);
	gaugeWrap.addEventListener('focusout',  hideGaugeHint);

	gaugeBar.appendChild(gaugeFill);

	const gaugeMilestones = document.createElement('div');
	gaugeMilestones.className = 'archetype-milestones';
	gaugeWrap.appendChild(gaugeMilestones);

	gaugeWrap.append(gaugeBar, gaugeLabel);
	gaugeWrap.appendChild(canvasUp);

	SoulSection.appendChild(ArchSection);
	SoulSection.appendChild(graphcontainer);

	levelUpSection.appendChild(SoulSection);

	archetypeLine.appendChild(archetypeLabel);
	archetypeLine.appendChild(gaugeWrap);
	archetypeLine.appendChild(archetypeDesc);
	SoulSection.appendChild(archetypeLine);

	// Ligne Niveau
	const currentLevel = getEntityLevelCurrent(entite);

	const levelBloc = document.createElement('div');
	levelBloc.className = 'level-bloc';
	levelUpSection.appendChild(levelBloc);

	// ✅ bloc 1 (infos lvl + XP)
	const levelInfosBloc = document.createElement('div');
	levelInfosBloc.className = 'level-infos-bloc';

	// ✅ bloc 2 (boutons)
	const levelButtonsBloc = document.createElement('div');
	levelButtonsBloc.className = 'level-buttons-bloc';

	const levelLine = document.createElement('div');
	levelLine.className = 'level-line';

	const levelName = document.createElement('span');
	levelName.className = 'levelup-name';
	levelName.textContent = 'Niveau : ';

	const levelCurrent = document.createElement('span');
	levelCurrent.className = 'level-current';
	levelCurrent.textContent = currentLevel;
	levelCurrent.setAttribute('data-stat', 'lvl');

	const levelTransition = document.createElement('span');
	levelTransition.className = 'level-transi is-hidden';
	levelTransition.textContent = ' > ';

	const levelFuture = document.createElement('span');
	levelFuture.className = 'level-future is-hidden';
	levelFuture.textContent = currentLevel;

	levelLine.append(levelName, levelCurrent, levelTransition, levelFuture);

	// XP
	const XPTitle = document.createElement('p');
	XPTitle.textContent = 'Expérience :';

	const DivXpDisplay = document.createElement('div');
	DivXpDisplay.className = 'div-xp-display';
	DivXpDisplay.appendChild(XPTitle);
	const initialXPDisplay = document.createElement('p');
	initialXPDisplay.className = 'initial-xp-display';
	DivXpDisplay.appendChild(initialXPDisplay);

	const transitionXP = document.createElement('p');
	transitionXP.className = 'xp-transi is-hidden';
	transitionXP.textContent = ' > ';
	DivXpDisplay.appendChild(transitionXP);

	const playerXPDisplay = document.createElement('p');
	playerXPDisplay.className = 'xp-display is-hidden';
	DivXpDisplay.appendChild(playerXPDisplay);

	const investedXPDisplay = document.createElement('p');
	investedXPDisplay.className = 'invested-xp-display is-hidden';
	investedXPDisplay.textContent = `- 0 XP`;

	const xpCostDisplay = document.createElement('p');

	// Bloc attributs
	const attributibutUp = document.createElement('div');
	attributibutUp.className = 'attribut-up';

	// Boutons
	const levelupbuttons = document.createElement('div');
	levelupbuttons.className  = 'level-up-buttons';

	const confirmButton = document.createElement('div');
	confirmButton.textContent = 'Confirmer';
	confirmButton.className = 'confirm-button yes level is-hidden';

	const clearBtn = document.createElement('div');
	clearBtn.id = 'clear-history-btn';
	clearBtn.textContent = 'Tout effacer';
	clearBtn.className = 'confirm-button clear is-hidden';

	levelupbuttons.append(confirmButton, clearBtn);

	// ✅ Assemblage : infos dans un bloc, boutons dans un autre
	levelInfosBloc.append(
		levelLine,
		DivXpDisplay,
		investedXPDisplay,
		xpCostDisplay
	);

	levelButtonsBloc.appendChild(levelupbuttons);

	// ✅ levelBloc contient : infos, attributs, boutons
	levelBloc.append(
	attributibutUp,
		levelInfosBloc,
		
		levelButtonsBloc
	);

	// 🔥 CREATION DES ICONES APRÈS INSERTION DANS LE DOM
	requestAnimationFrame(() => {
	    achievedList.forEach(ach => {
	       createArchetypeIcon(entite, ach.key, ach.level, ach.uid);
	    });
	});

	return {
		levelUpSection,
		gauge: { wrap: gaugeWrap, bar: gaugeBar, fill: gaugeFill, label: gaugeLabel, milestones: gaugeMilestones },
		levelCurrent, levelTransition, levelFuture,
		initialXPDisplay, transitionXP, playerXPDisplay, investedXPDisplay, xpCostDisplay,
		attributibutUp,
		confirmButton, clearBtn,
		archetypeLabel,
		archetypeDesc,
		graphCanvas,
	};
}

function buildattributibutLine(attribut, baseValue) {

  const attributLine = document.createElement('div');
  attributLine.className = 'level-up-attribut-line';

  const axisLine = document.createElement('div');
  axisLine.className = 'axis-line';
  axisLine.dataset.short = attribut.short;  // "F" | "A" | "I"
  axisLine.dataset.key   = attribut.key;

  // ✅ PICto (F/A/I -> strength/agility/intelligence)
  const map = { F: 'strength', A: 'agility', I: 'intelligence' };
  const pictoName = map[attribut.short];

  const pictoWrap = document.createElement('div');
  pictoWrap.className = 'attribut-picto';
  pictoWrap.dataset.short = attribut.short;

  const picto = document.createElement('div');
  picto.className = `picto-stat ${pictoName} attribut`;

  pictoWrap.appendChild(picto);

  const label = document.createElement('div');
  label.className = 'label';
  label.textContent = attribut.label;

  const leftArrow = document.createElement('span');
  leftArrow.className = 'xp-arrow left-arrow is-hidden';
  leftArrow.textContent = '<';

  const valueDisplay = document.createElement('div');
  valueDisplay.className = 'axis-value-display';
  valueDisplay.textContent = baseValue;

  const rightArrow = document.createElement('span');
  rightArrow.className = 'xp-arrow right-arrow';
  rightArrow.textContent = '>';

  axisLine.append(label, leftArrow, valueDisplay, rightArrow);

  // ✅ ordre DOM demandé : picto d'abord, axisLine en dessous
  attributLine.append(pictoWrap, axisLine);

  // ✅ compat si ton code lit dataset sur l'élément retourné
  attributLine.dataset.short = axisLine.dataset.short;
  attributLine.dataset.key   = axisLine.dataset.key;

  return attributLine;
}



// LEVEL LOGIQUE DOM
export function createLevelUpForm(entite) {
  const dom = createLevelElements(entite);
  bindLevelUpLogic(entite, dom, levelDetails);

  const currentLevel = getEntityLevelCurrent(entite);
  const lvl = Math.max(1, Math.min(99, currentLevel)); // si tu veux garder ce clamp

  setTimeout(() => {
    soulScaling(currentLevel);
  }, 0);

  return dom.levelUpSection;
}

function soulScaling(level) {
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

// 🔄 CALCUL MUTATIONS
export function resolveMutation(cycleName, force, agilite, intelligence, investedAttrib, level = 1) {
  if (!cycleName.startsWith("mutation")) {
    return { finalName: cycleName, mutationLevel: null };
  }

  const { stratArchetype } = getArchetypeConfig();

  const total = force + agilite + intelligence;
  const mutationLevel = parseInt(cycleName.split("-")[1] || "1", 10);

  // 1️⃣ Classe réelle
  const realClass = String(
    getClassFromAttributs(force, agilite, intelligence, level)
  ).trim().toLowerCase();

  // 2️⃣ Classe verrouillée tant que pas éveillé
  const classKey = (level <= stratArchetype - 1)
    ? "egare"
    : realClass;

  // 3️⃣ Cycle actif
  const cycle = cyclesData.find(c => c.key === classKey);

  // === Hybrides / archétypes sans dom/pct
  if (!cycle || !cycle.dom || !cycle.pct) {
    const resolved =
      investedAttrib === "force"      ? `attaque-${mutationLevel}` :
      investedAttrib === "agilite"    ? `defense-${mutationLevel}` :
                                        `utilitaire-${mutationLevel}`;

    console.log(
      `[MUTATION] Classe hybride ou non-dom (${classKey}). attrib=${investedAttrib} → ${resolved}`
    );

    return { finalName: resolved, mutationLevel };
  }

  // === Archétypes purs (avec dom/pct)
  let f = force, a = agilite, i = intelligence;
  const lockedValue = Math.round(total * (cycle.pct / 100));

  if      (cycle.dom === "force")        f = Math.max(0, f - lockedValue);
  else if (cycle.dom === "agilite")      a = Math.max(0, a - lockedValue);
  else if (cycle.dom === "intelligence") i = Math.max(0, i - lockedValue);

  const rest = f + a + i;
  let secondary = null;

  if (rest > 0) {
    const arr = [
      { n: "force",        v: f },
      { n: "agilite",      v: a },
      { n: "intelligence", v: i }
    ].sort((x, y) => y.v - x.v);

    if (arr[0].v > arr[1].v) {
      secondary = arr[0].n;
    } else {
      if (arr.some(x => x.n === cycle.dom && x.v === arr[0].v)) {
        secondary = cycle.dom;
      } else {
        secondary = investedAttrib;
      }
    }
  } else {
    secondary = cycle.dom;
  }

  const finalName =
    secondary === "force"      ? `attaque-${mutationLevel}` :
    secondary === "agilite"    ? `defense-${mutationLevel}` :
                                 `utilitaire-${mutationLevel}`;

  console.log(
    `[MUTATION] Classe=${classKey} (réelle=${realClass}, dom=${cycle.dom}≥${cycle.pct}%) | F=${f}, A=${a}, I=${i} → secondaire=${secondary} → ${finalName}`
  );

  return { finalName, mutationLevel };
}

export function getClassLabel(key) {
  const meta = CLASS_INDEX[String(key ?? '').trim().toLowerCase()];
  return meta?.name || key;
}

function determineNextSubStat(attributName, counters, subHistory, currentLevel = 1) {
  const { stratArchetype } = getArchetypeConfig();

  // 1️⃣ Archetype réel
  const realKey = String(
    getClassFromAttributs(
      counters.force,
      counters.agilite,
      counters.intelligence,
      currentLevel
    )
  ).trim().toLowerCase();

  // 2️⃣ Archetype verrouillé tant que pas éveillé
  const classKey = (currentLevel < stratArchetype)
    ? "egare"
    : realKey;

  // 3️⃣ Cycle (normal ou “égaré” forcé)
  const cycle = CLASS_INDEX[classKey]?.cycle ?? DEFAULT_CYCLE;

  // 4️⃣ Index du cycle selon historique
  const idx = (subHistory[attributName]?.length ?? 0) % cycle.length;

  // 5️⃣ Résolution mutation + nom final d’étape
  const rawCycleName = String(cycle[idx]).trim();
  const { finalName: cycleName, mutationLevel } = resolveMutation(
    rawCycleName,
    counters.force,
    counters.agilite,
    counters.intelligence
  );

  // 6️⃣ Sous-stat attribuée
  const key =
    STAT_INDEX.typeToKey[attributName]?.[cycleName] ||
    STAT_INDEX.byattribut[attributName]?.[0];

  // 7️⃣ Historique
  if (!subHistory[attributName]) subHistory[attributName] = [];
  subHistory[attributName].push(key);

  // 8️⃣ Logs
  console.log("🔹 Sous-stat attribuée :");
  console.log("   Attribut :", attributName);
  console.log("   Archetype actif :", classKey);
  console.log("   (Archetype réel :", realKey, ")");
  console.log("   Cycle :", cycle);
  console.log("   Index :", idx);
  console.log("   Étape brute :", rawCycleName);
  console.log("   Étape finale :", cycleName);
  console.log("   Mutation level :", mutationLevel);
  console.log("   Clé attribuée :", key);
  console.log("   Historique :", subHistory[attributName]);

  return { key, classKey, cycleName, mutationLevel };
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
        tooltip.textContent = `${slice.label} : ${slice.value}%`;
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






// LVL UP LOGIQUE
// VALIDATION RECHERCHE ARCHETYPE
export function getCycleForKey(classKey, entite) {
  const k = String(classKey || '').trim().toLowerCase();

  // 🔥 Cas particulier : Égaré → cycle dynamique basé sur will
  if (k === 'egare') {
    const dyn = buildEgareCycle(entite);
    return Array.isArray(dyn) && dyn.length > 0 ? dyn : null;
  }

  const arr = CLASS_INDEX[k]?.cycle;
  // ⛔ pas de DEFAULT ici : si pas de cycle → null
  return Array.isArray(arr) && arr.length > 0 ? arr : null;
}

export function getCycleLenFor(name, entite) {
  const arr = getCycleForKey(name, entite);
  return arr ? arr.length : 0;
}

function hasRealCycle(name, entite) {
  return getCycleForKey(name, entite) !== null;
}
function getArchetypeConfig(entite) {
  const DEFAULT_STRAT = 12;

  // On utilise will comme "seuil d'archetype" si présent
  const will = entite?.baseStats?.will;
  const stratArchetype =
    (typeof will === 'number' && will > 0)
      ? Math.floor(will)
      : DEFAULT_STRAT;

  return { stratArchetype, will: stratArchetype };
}

// 🔁 Cycle de base d'Égaré (pattern)
const BASE_EGARE_CYCLE = ['attaque-1', 'defense-1', 'utilitaire-1'];

// Construit le cycle complet d'Égaré en fonction de la volonté de l'entité
function buildEgareCycle(entite) {
  const fallbackWill = 10; // sécurité
  const willRaw = entite?.baseStats?.will ?? fallbackWill;

  // ✅ Nouvelle durée : basée sur calculatewillAwakeBonus()
  const targetLen = calculatewillAwakeBonus(willRaw, {
    pointsPerAwakeningLevel: 2,
    minLevels: 1,
    maxLevels: 99
  });

  const base = (CLASS_INDEX.egare?.cycle && CLASS_INDEX.egare.cycle.length)
    ? CLASS_INDEX.egare.cycle
    : BASE_EGARE_CYCLE;

  const result = [];
  while (result.length < targetLen) {
    for (let i = 0; i < base.length && result.length < targetLen; i++) {
      result.push(base[i]);
    }
  }

  return result;
}

export function initArchetypeProgress(entite) {
  const progress = {};

  if (!entite || !entite.Archetype) return progress;
  const arch = entite.Archetype;

  const register = (entry) => {
    if (!entry || !entry.key) return;
    const key   = String(entry.key).toLowerCase();
    const lvl   = entry.level ?? 1;
    const stage = entry.step ?? entry.stage ?? 0;
    const uid   = entry.uid || getArchetypeUID();
    const milestoneArr = Array.isArray(entry.milestone)
      ? [...entry.milestone]
      : [];

    const existing = progress[key];
    // On garde la version la plus “avancée”
    if (!existing ||
        lvl > existing.level ||
        (lvl === existing.level && stage > existing.stage)) {
      progress[key] = {
        level: lvl,
        stage,
        uid,
        milestones: milestoneArr.slice(0, stage)
      };
    }
  };

  if (arch.current) register(arch.current);
  if (Array.isArray(arch.inProgress)) arch.inProgress.forEach(register);

  // arch.achieve reste pour state.achievedArchetypes, pas dans progress

  return progress;
}

function removeOtherLevels(obj, archetypeName, keepLevel) {
  const base = String(archetypeName).toLowerCase() + ' ';
  const keepKey = buildArchetypeKey(archetypeName, keepLevel);
  for (const key of Object.keys(obj)) {
    if (key.startsWith(base) && key !== keepKey) {
      delete obj[key]; // on enlève les niveaux obsolètes (ex. "shinobi 1")
    }
  }
}

function applyModifiers(target, modSet) {
  if (!modSet?.statLeveled) return;

  for (const [k, v] of Object.entries(modSet.statLeveled)) {
    if (isObjStat(v)) {
      target[k] = addObj(target[k], v);      // ✅ HP current/max
    } else {
      target[k] = Number(target[k] ?? 0) + Number(v ?? 0);
    }
  }
}

function getPermStats(entite) {
  // stats = déjà durable + dérivées (HP incluse)
  return entite?.stats || {};
}

function getPreviewStats(entite) {
  // preview.total = stats + preview.statLeveled (HP incluse via syncPreviewHPFromVitality)
  return entite?.modifierStats?.preview?.total || getPermStats(entite);
}
function ensureStatNodes(entiteId, key, rootEl) {
  // rootEl doit être un ELEMENT, pas document
  let container = rootEl;

  // Fallbacks intelligents si rootEl non fourni ou invalide
  if (!container || container.nodeType !== 1) {
    // Essaye de trouver un container dédié à l’entité
    container = document.querySelector(`.entity-stats-section[data-entity-id="${entiteId}"]`)
             || document.querySelector(`#stats-${entiteId}`)
             || document.body; // dernier recours, mais ÉVITE si possible
  }

  // Recherche dans le container
  let perm = container.querySelector(`.entite-stat[data-entity-id="${entiteId}"][data-stat="${key}"]:not(.preview)`);
  let prev = container.querySelector(`.entite-stat.preview[data-entity-id="${entiteId}"][data-stat="${key}"]`);

  // Crée le permanent si absent
  if (!perm) {
    perm = document.createElement('div');
    perm.className = 'entite-stat';
    perm.dataset.entityId = String(entiteId);
    perm.dataset.stat = key;
    container.insertAdjacentElement('beforeend', perm);
  }

  // Crée le preview si absent (juste après le perm)
  if (!prev) {
    prev = document.createElement('div');
    prev.className = 'entite-stat preview is-hidden';
    prev.dataset.entityId = String(entiteId);
    prev.dataset.stat = key;
    perm.insertAdjacentElement('afterend', prev);
  }

  return { perm, prev };
}
function isEntityAwakened(entite) {
  return !!(
    entite?.Archetype?.current &&
    entite.Archetype.current.key &&
    entite.Archetype.current.key !== "egare"
  );
}
function fmt(v) {
  if (isObjStat(v)) return `${Number(v.current ?? 0)} / ${Number(v.max ?? 0)}`;
  return String(v ?? "");
}
function renderStatPair(entite, key, rootEl) {
  const { perm, prev } = ensureStatNodes(entite.id, key, rootEl);

  const permStats = getPermStats(entite);
  const prevStats = getPreviewStats(entite);

  const permVal = permStats[key];
  const prevVal = prevStats[key];

  const isObj = (v) => v && typeof v === "object" && ("current" in v || "max" in v);

  const toMs = (v) => {
    if (v == null) return 0;
    if (typeof v === "number") return v;
    // tolère "2426 ms", "2.4 s", etc.
    return parseFloat(String(v).replace(",", ".")) || 0;
  };

  const isZero = (v) => {
    if (isObj(v)) return Number(v.current ?? 0) <= 0 && Number(v.max ?? 0) <= 0;
    return v == null || Number(v) <= 0;
  };

  const hasPreview =
    !!entite?.modifierStats?.preview?.statLeveled &&
    Object.keys(entite.modifierStats.preview.statLeveled).length > 0;

  // ✅ SPEED: comparaison sur la valeur BRUTE (ms), pas sur le texte formaté
  const permMs = key === "speed" ? toMs(permVal) : null;
  const prevMs = key === "speed" ? toMs(prevVal) : null;
const SPEED_DISPLAY_STEP_MS = 10; // 0.01 s = 10 ms (car toFixed(2))
const speedHasDelta =
  key === "speed" &&
  hasPreview &&
  Math.round(permMs / SPEED_DISPLAY_STEP_MS) !== Math.round(prevMs / SPEED_DISPLAY_STEP_MS);
  // ✅ affichage "MAX only" pour HP + armor (+ speed en secondes)
  const fmtKey = (v) => {
   if ((key === "HP" || key === "armor" || key === "extraLife") && isObj(v)) {
      return String(Number(v.max ?? 0));
    }
if (key === "speed") {
  const ms = toMs(v);
  return `${(ms / 1000).toFixed(2)} s`; // ✅ visuel uniquement
}
    return fmt(v);
  };

  const showPrev = hasPreview && (
    key === "speed"
      ? speedHasDelta
      : fmtKey(prevVal) !== fmtKey(permVal)
  );

  const isNew = showPrev && isZero(permVal) && !isZero(prevVal);

  // ✅ ARMOR: suppression si 0/0 sans preview
if (key === "armor" || key === "extraLife") {
  const container =
    perm.closest(".stat-container") ||
    document.querySelector(`.stat-container[data-stat="${key}"][data-entity-id="${entite.id}"]`);

  if (!showPrev && isZero(permVal)) {
    if (container) container.remove();
    return;
  }
}

  // ✅ upgraded/reducted sur container pour HP/armor
if (key === "HP" || key === "armor" || key === "extraLife") {
  const container = perm.closest(".stat-container");
  if (container) {
    const permMax = isObj(permVal) ? Number(permVal.max ?? 0) : Number(permVal ?? 0);
    const prevMax = isObj(prevVal) ? Number(prevVal.max ?? 0) : Number(prevVal ?? 0);

    const up = showPrev && prevMax > permMax;
    const down = showPrev && prevMax < permMax;

    if (up || down) {
      container.dataset.previewDelta = up ? "up" : "down";
      container.classList.toggle("upgraded", up);
      container.classList.toggle("reducted", down);
    } else if (container.dataset.previewDelta) {
      container.classList.remove("upgraded", "reducted");
      delete container.dataset.previewDelta;
    }
  }
}


  // ✅ SPEED: plus petit = mieux (basé sur ms)
  if (key === "speed") {
    const container = perm.closest(".stat-container");
    if (container) {
      const p = permMs;
      const n = prevMs;

      const up   = showPrev && n < p;
      const down = showPrev && n > p;

      if (up || down) {
        container.dataset.previewDelta = up ? "up" : "down";
        container.classList.toggle("upgraded", up);
        container.classList.toggle("reducted", down);
      } else if (container.dataset.previewDelta) {
        container.classList.remove("upgraded", "reducted");
        delete container.dataset.previewDelta;
      }
    }
  }
  if (key === "dayHpRegen") {
    const container = perm.closest(".stat-container");
    if (container) {
      const p = Number(permVal ?? 0) || 0;
      const n = Number(prevVal ?? 0) || 0;

      const up   = showPrev && n > p;
      const down = showPrev && n < p;

      if (up || down) {
        container.dataset.previewDelta = up ? "up" : "down";
        container.classList.toggle("upgraded", up);
        container.classList.toggle("reducted", down);
      } else if (container.dataset.previewDelta) {
        container.classList.remove("upgraded", "reducted");
        delete container.dataset.previewDelta;
      }
    }
  }
  // 1) Permanent
  if (isNew) {
    perm.classList.add("stat-new");
    perm.textContent = "";
  } else {
    perm.classList.remove("stat-new");
    const permTxt = fmtKey(permVal);
    if (perm.textContent !== permTxt) perm.textContent = permTxt;
  }

  // 2) Preview
  if (showPrev) {
    const prevTxt = fmtKey(prevVal);
    if (prev.textContent !== prevTxt) prev.textContent = prevTxt;
    prev.classList.remove("is-hidden");
  } else {
    prev.classList.add("is-hidden");
  }
}

function isObjStat(v) {
  return v && typeof v === "object" && ("current" in v || "max" in v);
}

function normObj(v) {
  if (typeof v === "number") return { current: v, max: v };
  return { current: Number(v?.current ?? 0), max: Number(v?.max ?? 0) };
}

function addObj(a, b) {
  const A = normObj(a);
  const B = normObj(b);
  return { current: A.current + B.current, max: A.max + B.max };
}
function getMaxHPValue(entite) {
  const hp = entite?.stats?.HP ?? entite?.baseStats?.HP;
  if (hp && typeof hp === "object") return Number(hp.max ?? 0) || 0;
  return Number(hp ?? 0) || 0;
}

function getDayHpRegenBase(entite) {
  // tolère une ancienne clé mal orthographiée
  return Math.max(
    0,
    toNumber(entite?.baseStats?.dayHpRegen ?? entite?.baseStats?.dayhpreneg ?? 0, 0)
  );
}

function getVitality(entite) {
  return toNumber(entite?.stats?.vitality ?? entite?.baseStats?.vitality ?? 0, 0);
}

function getMaxHP(entite) {
  const hp = entite?.stats?.HP ?? entite?.baseStats?.HP;
  return (hp && typeof hp === "object")
    ? toNumber(hp.max ?? 0, 0)
    : toNumber(hp ?? 0, 0);
}

export function computeDayHpRegenTotal(entite, { maxHPOverride = null, vitalityOverride = null } = {}) {
  const base = BaseDayHpRegen(entite);

  const vitality = (vitalityOverride == null) ? getVitality(entite) : toNumber(vitalityOverride, 0);
  const maxHP    = (maxHPOverride == null)    ? getMaxHP(entite)    : toNumber(maxHPOverride, 0);

  const regenPercent = calculateVitalityRegenPercent(vitality);
  const bonus = calculateVitalityRegenAmount(maxHP, regenPercent);

  const total = calculateTotalRegenAmount(base, bonus);
  return { base, bonus, total };
}
export function recomputeDayHpRegen(entite) {
  if (!entite) return;
  entite.stats ??= {};
  entite.stats.dayHpRegen = computeDayHpRegenTotal(entite).total;
}
export function syncPreviewDayHpRegenFromHPVitality(entite) {
  const preview = entite?.modifierStats?.preview;
  if (!preview?.statLeveled) return;

  preview.meta ??= {};
  preview.meta.derived ??= {};

  const dVit = toNumber(preview.statLeveled.vitality ?? 0, 0);

  let dHPMax = 0;
  const dHP = preview.statLeveled.HP;
  if (dHP && typeof dHP === "object") dHPMax = toNumber(dHP.max ?? 0, 0);

  // Rien à dériver
  if (!dVit && !dHPMax) {
    delete preview.meta.derived.dayHpRegenDelta; // cleanup au cas où
    delete preview.meta.derived.dayHpRegenFromHPVitality;
    return;
  }

  // On garde seulement un flag de dérivation (et on vire les deltas)
  delete preview.meta.derived.dayHpRegenDelta; // cleanup au cas où
  preview.meta.derived.dayHpRegenFromHPVitality = true;
}

function syncPreviewHPFromVitality(entite) {
  const preview = entite?.modifierStats?.preview;
  if (!preview?.statLeveled) return;
  if (!entite?.stats?.HP || typeof entite.stats.HP !== "object") return;

  const baseVit = Number(entite.stats.vitality ?? 0);                 // baseline (sans preview)
  const dv = Number(preview.statLeveled.vitality ?? 0);               // delta preview
  const deltaHP = calculateVitalityBonus(baseVit + dv) - calculateVitalityBonus(baseVit);

  if (!dv || deltaHP === 0) {
    delete preview.statLeveled.HP;
    return;
  }

  // ✅ pipeline classique : HP est une entrée de statLeveled (objet)
  preview.statLeveled.HP = { current: deltaHP, max: deltaHP };
}
function syncPreviewArmorFromRobustness(entite) {
  const preview = entite?.modifierStats?.preview;
  if (!preview?.statLeveled) return;

  // base = stats durables déjà calculées (comme pour HP)
  const baseRob = Number(entite.stats?.robustness ?? 0);
  const dr = Number(preview.statLeveled.robustness ?? 0);

  const deltaArmor =
    calculateRobustnessBonus(baseRob + dr) - calculateRobustnessBonus(baseRob);

  if (!dr || deltaArmor === 0) {
    delete preview.statLeveled.armor;
    return;
  }

  // ✅ armor en objet, comme HP
  preview.statLeveled.armor = { current: deltaArmor, max: deltaArmor };
}
function syncPreviewSpeedFromVelocity(entite) {
  const preview = entite?.modifierStats?.preview;
  if (!preview?.statLeveled) return;

  const dv = Number(preview.statLeveled.velocity ?? 0) || 0;

  preview.meta ??= {};
  preview.meta.derived ??= {};

  if (!dv) {
    delete preview.statLeveled.speed;
    delete preview.meta.derived.speedFromVelocity;
    return;
  }

  // baseSpeed = vitesse "de référence" avant réduction vel
  const baseSpeed = Number(entite?.baseStats?.speed ?? 1000) || 0;

  // vel permanente (déjà durable), sans preview
  const baseVel = Number(entite?.stats?.velocity ?? entite?.baseStats?.velocity ?? 0) || 0;

  // oldAdjusted = la speed actuelle (déjà réduite) => fiable et évite les dérives
  const oldAdjusted = Number(entite?.stats?.speed ?? baseSpeed) || baseSpeed;

  const newAdjusted =
    (baseSpeed > 0 && (baseVel + dv) > 0)
      ? calculateVelocityReduction(baseVel + dv, baseSpeed).adjustedSpeed
      : baseSpeed;

  const delta = newAdjusted - oldAdjusted; // négatif = mieux

  if (!delta) {
    delete preview.statLeveled.speed;
    delete preview.meta.derived.speedFromVelocity;
    return;
  }

  preview.statLeveled.speed = delta;               // float ms OK
  preview.meta.derived.speedFromVelocity = true;   // marqueur dérivé
}
export const EXTRA_LIFE_GIVEN_EVERY_MAX = 10;
function countGrantedExtraLifeCurrentFromMax(maxExtraLife, everyMax = EXTRA_LIFE_GIVEN_EVERY_MAX) {
  const m = Math.floor(Number(maxExtraLife ?? 0));
  if (m <= 0) return 0;

  const n = Math.max(1, Math.floor(Number(everyMax ?? 10)));
  // 1er current au 1er max, puis 1 current à chaque palier de n max
  return 1 + Math.floor(m / n);
}
export function giveCurrentExtraLife(beforeMax, afterMax, everyMax = EXTRA_LIFE_GIVEN_EVERY_MAX) {
  const before = countGrantedExtraLifeCurrentFromMax(beforeMax, everyMax);
  const after  = countGrantedExtraLifeCurrentFromMax(afterMax, everyMax);
  return after - before;
}

function ensureExtraLifeObj(entite) {
  if (!entite.stats) entite.stats = {};
  const v = entite.stats.extraLife;

  // accepte nombre, undefined, ou objet incomplet
  if (!v || typeof v !== "object") {
    const n = Number(v ?? 0) || 0;
    entite.stats.extraLife = { current: n, max: n };
  } else {
    entite.stats.extraLife.current = Number(v.current ?? 0) || 0;
    entite.stats.extraLife.max     = Number(v.max ?? v.current ?? 0) || 0; // ✅ max fallback
  }
}

function syncPreviewExtraLifeFromTranscendence(entite) {
  const preview = entite?.modifierStats?.preview;
  if (!preview?.statLeveled) return;

  const baseTr = Number(entite.stats?.transcendence ?? 0);
  const dtr    = Number(preview.statLeveled.transcendence ?? 0);

  const beforeMax = calculateTranscendenceExtraLife(baseTr);
  const afterMax  = calculateTranscendenceExtraLife(baseTr + dtr);

  const deltaMax = afterMax - beforeMax;

  // ✅ DELTA current selon paliers (1er point => +1 current, puis tous les N max)
  const deltaCurrent = giveCurrentExtraLife(beforeMax, afterMax, EXTRA_LIFE_GIVEN_EVERY_MAX);

  // Rien à faire → on nettoie
  if (!dtr || (deltaMax === 0 && deltaCurrent === 0)) {
    delete preview.statLeveled.extraLife;
    return;
  }

  // ✅ On met l'objet complet (current + max)
  preview.statLeveled.extraLife = {
    current: deltaCurrent,
    max: deltaMax
  };
}



function recomputeSpeedFromVelocity(entite) {
  const baseSpeed = Number(entite?.baseStats?.speed ?? 1000) || 0;
  const vel = Number(entite?.stats?.velocity ?? entite?.baseStats?.velocity ?? 0) || 0;

  const adjusted =
    (baseSpeed > 0 && vel > 0)
      ? calculateVelocityReduction(vel, baseSpeed).adjustedSpeed
      : baseSpeed;

  entite.stats ??= {};
  entite.stats.speed = adjusted;

  // (Optionnel mais utile si tu avais de vieux résidus)
  if (entite?.modifierStats?.durable?.statLeveled?.speed != null) {
    delete entite.modifierStats.durable.statLeveled.speed;
  }
}


function renderAllStats(entite, rootEl) {
  const perm = getPermStats(entite);
  for (const key of Object.keys(perm)) {
    renderStatPair(entite, key, rootEl);
  }
}

function createArchetypeIcon(entite, archetypeKey, archetypeLevel, archetypeUid) {
  if (!entite || !entite.id || !archetypeUid) return;

  const keyNorm = String(archetypeKey || "").trim().toLowerCase();

  // 🚫 RÈGLE ABSOLUE : aucun icon pour Égaré
  if (!keyNorm || keyNorm === "egare") {
    return;
  }

  const container = document.querySelector(`#archetype-icons-${entite.id}`);
  if (!container) return;

  // ⛔ ANTI-DOUBLON PAR UID
  const exists = container.querySelector(`[data-archetype-uid="${archetypeUid}"]`);
  if (exists) return;

  const icon = document.createElement("div");
  icon.classList.add("archetype-icon");

  icon.dataset.entite = entite.id;
  icon.dataset.archetypeLevel = archetypeLevel;
  icon.dataset.archetypeUid = archetypeUid;
  icon.dataset.archetypeKey = keyNorm;  // ✅ ici, jamais "egare"

  container.appendChild(icon);
}
export function ComputeStatPreview(entite) {
  if (!entite?.stats) return;

  entite.modifierStats ??= {};
  entite.modifierStats.preview ??= { statLeveled: {} };

  // 1) Deltas dérivés (ils alimentent preview.statLeveled)
  syncPreviewHPFromVitality(entite);
  syncPreviewArmorFromRobustness(entite);
  syncPreviewSpeedFromVelocity(entite);
  syncPreviewExtraLifeFromTranscendence(entite);

  const base   = entite.stats;
  const deltas = entite.modifierStats.preview.statLeveled || {};
  const total  = {};

  // 2) Base -> total
  for (const [k, v] of Object.entries(base)) {
    total[k] = isObjStat(v) ? normObj(v) : v;
  }

  // 3) Deltas -> total
  for (const [k, dv] of Object.entries(deltas)) {
    if (isObjStat(dv)) total[k] = addObj(total[k], dv);
    else total[k] = Number(total[k] ?? 0) + Number(dv ?? 0);
  }

  // 4) dayHpRegen doit être calculée avec les valeurs PREVIEW (donc total)
  total.dayHpRegen = computeDayHpRegenFromTotals(entite, total, deltas);

  entite.modifierStats.preview.total = total;
  return total;
}

function computeDayHpRegenFromTotals(entite, total, deltas) {
  // vitality et HP.max = VALEURS PREVIEW (donc total)
  const vitality = toNumber(total?.vitality ?? 0, 0);

  const hp = total?.HP;
  const maxHP =
    (hp && typeof hp === "object")
      ? toNumber(hp.max ?? 0, 0)
      : toNumber(hp ?? 0, 0);

  // Base regen "hors bonus vitality" (ta fonction existante)
  // IMPORTANT : si tu autorises une montée DIRECTE de dayHpRegen,
  // elle doit impacter la base, donc on ajoute deltas.dayHpRegen.
  const baseRegen = BaseDayHpRegen(entite) + toNumber(deltas?.dayHpRegen ?? 0, 0);

  const regenPercent = calculateVitalityRegenPercent(vitality);
  const bonus = calculateVitalityRegenAmount(maxHP, regenPercent);

  return calculateTotalRegenAmount(baseRegen, bonus);
}


function getArchetypeUID() {
  return 'arch_' + Math.random().toString(36).slice(2, 10);
}


// DETERMINATION ARCHETYPE
export function getClassFromAttributs(
  force,
  agilite,
  intelligence,
  level = 1,
  awakened = true,   // 👈 par défaut : on calcule la vraie classe
  entite = null
) {
  const { stratArchetype } = getArchetypeConfig();

  // 👉 0) Si niveau insuffisant mais NON awake :
  // On calcule quand même l'archetype normal puis on stocke
  if (!awakened) {
    const normalArchetype = getNormalArchetype(force, agilite, intelligence);
    console.log("Archetype normal (bloqué avant éveil) :", normalArchetype);
    return "egare";
  }
  // 👉 Sinon, chemin normal
  return getNormalArchetype(force, agilite, intelligence);
}

function getNormalArchetype(force, agilite, intelligence) {
  const total = force + agilite + intelligence;
  if (total === 0) return "inerte";

  // Pourcentage corrigé
  const fPct = (force / total) * 100;
  const aPct = (agilite / total) * 100;
  const iPct = (intelligence / total) * 100;

  let f = Math.round(fPct), a = Math.round(aPct), i = Math.round(iPct);
  const corr = 100 - (f + a + i);
  if (corr !== 0) {
    const arrCorr = [
      { k: "f", v: f },
      { k: "a", v: a },
      { k: "i", v: i }
    ].sort((x, y) => y.v - x.v);
    arrCorr[0].v += corr;
    f = arrCorr.find(x => x.k === "f").v;
    a = arrCorr.find(x => x.k === "a").v;
    i = arrCorr.find(x => x.k === "i").v;
  }

  // 1) Seuils cyclesData
  for (const cycle of cyclesData) {
    if (!cycle.dom || !cycle.pct) continue;
    const val = cycle.dom === "force" ? f :
                cycle.dom === "agilite" ? a : i;
    if (val >= cycle.pct) return cycle.key;
  }

  // 2) Hybrides
  if (f >= 50 && i >= 50) return "paladin";
  if (a >= 50 && f >= 50) return "berzerker";
  if (i >= 50 && a >= 50) return "fleau";
  if (f >= 40 && a >= 40) return "sanguinaire";
  if (f >= 40 && i >= 40) return "croise";
  if (a >= 40 && i >= 40) return "mangemage";

  // 3) Spécialisations
  const ordered = [
    { n: "force", v: f },
    { n: "agilite", v: a },
    { n: "intelligence", v: i }
  ].sort((x, y) => y.v - x.v);
  const [s1, s2] = ordered.map(x => x.n);
  const diff13 = ordered[0].v - ordered[2].v;

  if (diff13 >= 20) {
    if (s1 === "force" && s2 === "agilite") return "bruiser";
    if (s1 === "force" && s2 === "intelligence") return "fanatique";
    if (s1 === "agilite" && s2 === "force") return "rodeur";
    if (s1 === "agilite" && s2 === "intelligence") return "flagellateur";
    if (s1 === "intelligence" && s2 === "force") return "mysticiste";
    if (s1 === "intelligence" && s2 === "agilite") return "scrutateur";
  }

  if (diff13 >= 10) {
    if (s1 === "force") return "moloch";
    if (s1 === "agilite") return "vautour";
    if (s1 === "intelligence") return "zelote";
  }

  // 4) Équilibrés
  const max = Math.max(f, a, i);
  const min = Math.min(f, a, i);
  const d = max - min;
  if (d <= 3) return "archon";
  if (d <= 6) return "equinoxe";
  if (d <= 10) return "erudit";

  return "egare";
}

// LEVEL UP LOGIC MECHANICS
function bindLevelUpLogic(entite, dom, levelDetails) {
const ATTRIBUTE_KEYS = new Set(["strength", "agility", "intelligence"]);
const isAttributeKey = (k) => ATTRIBUTE_KEYS.has(String(k));
function refreshPreviewHP(entite) {
  syncPreviewHPFromVitality(entite);
  ComputeStatPreview(entite);
  renderStatPair(entite, "HP", nodes.statsRoot);
}
function refreshPreviewSpeed(entite) {
  syncPreviewSpeedFromVelocity(entite);
  ComputeStatPreview(entite);
  renderStatPair(entite, "velocity", nodes.statsRoot);
  renderStatPair(entite, "speed", nodes.statsRoot);
}
 const costMap = buildCostMap(levelDetails);
  const { stratArchetype } = getArchetypeConfig(entite);

  const alreadyAwakened =
    !!(entite?.Archetype?.current &&
       entite.Archetype.current.key &&
       entite.Archetype.current.key !== "egare");

  const initialLevel = getEntityLevelCurrent(entite);

  const state = {
    currentEntity: entite,
    tempLevel: initialLevel,
    tempXP: playerExperience,
    investedXP: 0,
    history: [],
    archetypeProgress: initArchetypeProgress(entite),
    touchedArchetypes: new Set(),
    stats: {
      strength: entite.stats.strength,
      agility: entite.stats.agility,
      intelligence: entite.stats.intelligence,
    },
    investmentCounters: { force: 0, agilite: 0, intelligence: 0 },
    subHistory: { force: [], agilite: [], intelligence: [] },
    xpBaseline: playerExperience,
    awakened: alreadyAwakened,
    egareCycleSnapshot: null,
    achievedArchetypes: []
  };

// 🔁 Hydrate les cycles déjà achevés depuis l'entité
if (entite.Archetype && Array.isArray(entite.Archetype.achieve)) {
  state.achievedArchetypes = entite.Archetype.achieve.map(a => ({
    key: String(a.key || "").toLowerCase(),
    level: a.level ?? 1,
    step: a.step ?? a.stage ?? 0,
    uid: a.uid || getArchetypeUID(),
    milestone: Array.isArray(a.milestone) ? [...a.milestone] : []
  }));
}


state.currentEntity = entite;
  const setInvisible = (el, inv) => el.classList.toggle('is-hidden', !!inv);

  // Cache des nœuds attributibuts (création unique)
  const nodes = {
    confirm: dom.confirmButton,
    clear: dom.clearBtn,
    cost: dom.xpCostDisplay,
    xp: {
      initial: dom.initialXPDisplay,
      player: dom.playerXPDisplay,
      invested: dom.investedXPDisplay,
      transi: dom.transitionXP,
    },
    level: {
      current: dom.levelCurrent,
      future: dom.levelFuture,
      transi: dom.levelTransition,
    },
    attributs: {},
    archetypeLabel: dom.archetypeLabel,
    archetypeDesc: dom.archetypeDesc,
    graphCtx: dom.graphCanvas?.getContext('2d'),
    gauge: dom.gauge,
  };

nodes.statsRoot =
  document.querySelector(`#codex-entity_${entite.id} .entity-stats-section.left`)
  || document.querySelector(`.entity-stats-section.left[data-entity-id="${entite.id}"]`)
  || document.querySelector(".entity-stats-section.left")
  || document.body;
  
  dom.attributibutUp.innerHTML = '';
  for (const attribut of attributS) {
    const line = buildattributibutLine(attribut, state.stats[attribut.key]);
    dom.attributibutUp.appendChild(line);
    nodes.attributs[attribut.short] = {
      line,
      left:  line.querySelector('.left-arrow'),
      right: line.querySelector('.right-arrow'),
      value: line.querySelector('.axis-value-display')
    };
  }

  function updateHeader() {
    // 💰 XP
    nodes.xp.initial.textContent  = `${state.xpBaseline}`;
    nodes.xp.player.textContent   = `${state.tempXP}`;
    nodes.xp.invested.textContent = `- ${state.xpBaseline - state.tempXP} XP`;

    const entityMaxLevel = getEntityLevelMax(entite);
    const nextCost = costAt(costMap, state.tempLevel + 1);

    nodes.cost.textContent =
      state.tempLevel >= entityMaxLevel
        ? `Niveau maximum atteint (${entityMaxLevel})`
        : (nextCost != null
            ? `Coût prochain lvl. : ${nextCost} XP`
            : `Niveau maximum atteint (${entityMaxLevel})`);

    const hasHistory = state.history.length > 0;
    setInvisible(nodes.xp.player,   !hasHistory);
    setInvisible(nodes.xp.invested, !hasHistory);
    setInvisible(nodes.xp.transi,   !hasHistory);

    const baseLevel = getEntityLevelCurrent(entite);
    nodes.level.current.textContent = baseLevel;
    nodes.level.future.textContent  = state.tempLevel;

    document
      .querySelectorAll(`[data-stat="lvl"][data-entity-id="${entite.id}"]`)
      .forEach(el => el.textContent = baseLevel);

    const raised = state.tempLevel > baseLevel;
    setInvisible(nodes.level.transi, !raised);
    setInvisible(nodes.level.future, !raised);
    nodes.level.future.classList.toggle('augmented', raised);
  }
  function updateArrows() {
    const entityMaxLevel = getEntityLevelMax(entite);
    const canUp =
      state.tempLevel < entityMaxLevel &&
      state.tempXP >= (costAt(costMap, state.tempLevel + 1) ?? Infinity);

    for (const short in nodes.attributs) {
      const a = nodes.attributs[short];
      setInvisible(a.right, !canUp);

      const last = state.history[state.history.length - 1];
      const isLast = !!last && last.short === short;
      setInvisible(a.left, !isLast);
    }
  }


  function updateButtons() {
    const hasHistory = state.history.length > 0;
    setInvisible(nodes.confirm, !hasHistory);
    setInvisible(nodes.clear,   state.history.length <= 1);
  }

   
  const GAUGE_ANIM_DELAY = 450;  // délai pour la grosse jauge seulement
  let archetypeUpdateTimeout = null;

  function getActiveArchetypeKey(levelOverride = null, statsOverride = null) {
    const s = statsOverride || state.stats;
    const fallbackLevel = getEntityLevelCurrent(entite);
    const lvl = levelOverride ?? (state.tempLevel ?? fallbackLevel);

    return String(
      getClassFromAttributs(
        s.strength,
        s.agility,
        s.intelligence,
        lvl,
        state.awakened,
        entite
      ) || ""
    ).trim().toLowerCase();
  }

  function renderAll(mode = 'normal', prevKey = null, nextKey = null) {
    // Annule un éventuel timeout en cours
    if (archetypeUpdateTimeout) {
      clearTimeout(archetypeUpdateTimeout);
      archetypeUpdateTimeout = null;
    }

    const changed =
      prevKey &&
      nextKey &&
      prevKey !== nextKey;

    // Bloc commun, toujours synchro
    updateHeader();
    updateArrows();
    updateButtons();
    updategraph(state, nodes);
    soulScaling(state.tempLevel);

    // 🔹 NOM & DESCRIPTION D’ARCHETYPE → tout de suite
    updateArchetypeBadge(state, nodes);

    // 🔹 MILESTONES (petits jalons) → tout de suite aussi
    updateArchetypeMilestones(state, nodes);

    // Pas de changement d’archetype → on met à jour la jauge normalement
    if (!changed || mode === 'normal') {
      updateArchetypeGauge(state, nodes);
      return;
    }

    // Changement d’archetype : seule la GROSSE jauge est décalée
    archetypeUpdateTimeout = setTimeout(() => {
      updateArchetypeGauge(state, nodes);
      archetypeUpdateTimeout = null;
    }, GAUGE_ANIM_DELAY);
  }

// 🔧 Applique l'éveil sur l'entité + sauvegarde
function applyAwakeningToEntity(entite, state, finalKey) {
  if (!entite || !finalKey) return;

  const awakeKey = String(finalKey).trim().toLowerCase();
  if (!awakeKey) return;

  // Sécurise la structure
  entite.Archetype ??= {
    current: null,
    inProgress: [],
    achieve: []
  };

  const arch = entite.Archetype;
  const prevCurrent = arch.current;

  // 1️⃣ Si l'ancien current est Égaré → le pousser dans achieve
  if (prevCurrent && prevCurrent.key === "egare") {
    arch.achieve = Array.isArray(arch.achieve) ? arch.achieve : [];
    arch.achieve.push({ ...prevCurrent });
  }

  // 2️⃣ Nouveau current = archetype éveillé, step 0 (cas exceptionnel)
  const newUid = getArchetypeUID();
  const newLevel = prevCurrent?.level || 1;

  const newCurrent = {
    key: awakeKey,
    level: newLevel,
    step: 0,        // 👈 tu voulais absolument step 0 juste après l’éveil
    uid: newUid
  };

  arch.current = newCurrent;

  // 3️⃣ inProgress vidé (comme dans ton exemple cible)
  arch.inProgress = [];

  // 4️⃣ Synchronise un minimum le state interne
  state.awakened = true;
  state.archetypeProgress ??= {};
  state.archetypeProgress[awakeKey] = {
    level: newLevel,
    stage: 0,
    uid: newUid
  };
  delete state.archetypeProgress.egare;

  // 5️⃣ On resauvegarde pour mettre à jour le JSON (selectedArmyA)
  if (typeof saveEntityLevelUP === "function") {
    saveEntityLevelUP(entite, state);
  }
}
  // 🔒 / 🔓 Blocage global des flèches et boutons de niveau
  function setArchetypeUIBlocked(block) {
    const arrows = document.querySelectorAll(".xp-arrow");
    const lvlButtons = document.querySelectorAll(".confirm-button");

    arrows.forEach(el => {
      el.style.pointerEvents = block ? "none" : "auto";
      el.style.opacity = block ? "0" : "1";
    });

    lvlButtons.forEach(btn => {
      btn.style.pointerEvents = block ? "none" : "auto";
      btn.style.opacity = block ? "0.2" : "1";
    });
  }
  // 🎯 Résolution complète d'un cycle terminé (normal vs éveil)
async function resolveArchetypeCycleCompletion(
  name,
  entite,
  cycleLen,
  prevLevel,
  prevStage,
  config = {}
) {
  const isAwakeningScenario =
    config.awakening ?? (name === "egare" && !state.awakened);

  const createMilestone =
    config.createMilestone ?? !isAwakeningScenario;

  const baseAnimMs = 2000;
  const extraBlockMs =
    config.extraBlockMs ?? (isAwakeningScenario ? 8000 : 0);

  const removeStrayDelayMs =
    typeof config.removeStrayDelayMs === "number"
      ? config.removeStrayDelayMs
      : baseAnimMs;

  if (typeof startArchup === "function") {
    startArchup();
  }
  await new Promise(res => setTimeout(res, baseAnimMs));

  const keyLower = String(name || "").toLowerCase();
  const curProg = state.archetypeProgress[keyLower] || {
    level: prevLevel,
    stage: cycleLen,
    uid: getArchetypeUID(),
    milestones: []
  };
  if (!Array.isArray(curProg.milestones)) curProg.milestones = [];

  const fullMilestoneArr = curProg.milestones.slice(0, cycleLen);

  let finalName = name;

  state.achievedArchetypes ??= [];

  if (isAwakeningScenario) {
    // 🌌 SCÉNARIO ÉVEIL (Égaré → X)
    const egSnapshot = {
      key: "egare",
      level: prevLevel,
      step: cycleLen,
      uid: curProg.uid || getArchetypeUID(),
      milestone: fullMilestoneArr
    };

    state.egareCycleSnapshot = egSnapshot;
    state.achievedArchetypes.push(egSnapshot);

    finalName = getClassFromAttributs(
      state.stats.strength,
      state.stats.agility,
      state.stats.intelligence,
      state.tempLevel,
      true,
      entite
    );

    if (!finalName || typeof finalName !== "string") {
      console.warn("⚠️ [Égaré] Archetype invalide → fallback oracle");
      finalName = "oracle";
    }
    finalName = finalName.trim().toLowerCase();
    console.log(`🔄 Égaré s’est transformé automatiquement en : ${finalName}`);

    delete state.archetypeProgress["egare"];

    state.archetypeProgress[finalName] = {
      level: prevLevel,
      stage: 0,
      uid: getArchetypeUID(),
      milestones: []
    };

    state.awakened = true;
    applyAwakeningToEntity(entite, state, finalName);

    state.history = [];
    state.xpBaseline = state.tempXP;
    state.investedXP = 0;

    playAwakeningExtasis(entite);

    if (removeStrayDelayMs >= 0) {
      setTimeout(() => {
        const graphContainer = findAttributGraphContainer(entite);
        if (graphContainer && graphContainer.classList.contains('stray')) {
          graphContainer.classList.remove('stray');
        }
      }, removeStrayDelayMs);
    }

  } else {
    // 🟢 SCÉNARIO NORMAL : le cycle du niveau prevLevel est terminé
    const snapshot = {
      key: keyLower,
      level: prevLevel,
      step: cycleLen,
      uid: curProg.uid || getArchetypeUID(),
      milestone: fullMilestoneArr
    };
    state.achievedArchetypes.push(snapshot);

    // passage au niveau suivant pour cet archetype
    state.archetypeProgress[keyLower] = {
      level: prevLevel + 1,
      stage: 0,
      uid: curProg.uid || getArchetypeUID(),
      milestones: []
    };
  }

  // 🎯 icône de jalon (preview) sauf en cas d’éveil
  if (createMilestone) {
    const milestoneKey   = name;
    const milestoneLevel = prevLevel;

    if (milestoneKey !== "egare") {
      const uid = `preview-${entite.id}-${milestoneKey}-${milestoneLevel}`;
      createArchetypeIcon(entite, milestoneKey, milestoneLevel, uid);

      const icon = document.querySelector(
        `#archetype-icons-${entite.id} [data-archetype-uid="${uid}"]`
      );
      if (icon) icon.classList.add("preview");
    }
  }

  setTimeout(() => {
    setArchetypeUIBlocked(false);
    state.lockArchetype = false;
    if (typeof renderAll === "function") renderAll();
  }, extraBlockMs + 1);
}

function findAttributGraphContainer(entite) {
  if (!entite || !entite.id) return null;

  // 1) Dans le codex de l'entité
  let el = document.querySelector(
    `#codex-entity_${entite.id} .attribut-graph-container`
  );

  // 2) Variante avec data-entity-id (si tu l'utilises)
  if (!el) {
    el = document.querySelector(
      `.attribut-graph-container[data-entity-id="${entite.id}"]`
    );
  }

  // 3) Fallback : n'importe quel container marqué .stray
  if (!el) {
    el = document.querySelector('.attribut-graph-container.stray');
  }

  return el;
}
async function advanceArchetypeStage(classKey, entite) {
  const name  = String(classKey || "").toLowerCase();
  const cycle = getCycleForKey(name, entite);

  if (state.lockArchetype) return;

  // 🛑 Aucun cycle : on ne fait rien
  if (!cycle) {
    return { classKey: name, level: 1, stage: 0, cycleLen: 0, skipped: true };
  }

  const cycleLen = cycle.length;

  // Progression actuelle
  const cur = state.archetypeProgress[name] || {
    level: 1,
    stage: 0,
    uid: getArchetypeUID(),
    milestones: []
  };

  if (!Array.isArray(cur.milestones)) cur.milestones = [];
  if (!cur.uid) cur.uid = getArchetypeUID();

  const prevLevel = cur.level || 1;
  const prevStage = cur.stage || 0;

  const appliedStage = prevStage + 1;
  const isLastStep   = appliedStage === cycleLen;

  let cycleName = cycle[Math.min(appliedStage, cycleLen) - 1];

  if (!isLastStep) {
    // simple avancée
    cur.level = prevLevel;
    cur.stage = appliedStage;
    state.archetypeProgress[name] = cur;
    state.touchedArchetypes.add(name);

    return {
      classKey: name,
      level: prevLevel,
      stage: appliedStage,
      cycleName,
      appliedStage,
      cycleLen,
      prevLevel,
      prevStage,
      skipped: false
    };
  }

  // 🔚 Dernier step du cycle
  state.lockArchetype = true;
  cur.level = prevLevel;
  cur.stage = cycleLen;
  state.archetypeProgress[name] = cur;
  state.touchedArchetypes.add(name);

  // Blocage UI
  setArchetypeUIBlocked(true);

  const isAwakeningScenario = (name === "egare" && !state.awakened);

  // Résolution asynchrone (éveil éventuel + snapshot)
  resolveArchetypeCycleCompletion(
    name,
    entite,
    cycleLen,
    prevLevel,
    prevStage,
    {
      awakening: isAwakeningScenario,
      removeStrayDelayMs: 5000
    }
  );

  return {
    classKey: name,
    level: prevLevel,
    stage: cycleLen,
    cycleName,
    appliedStage,
    cycleLen,
    prevLevel,
    prevStage,
    skipped: false
  };
}


function previewStats(entite) {
  // 🧩 On récupère les stats fusionnées avec les fonctions existantes
  const merged = getPreviewStats(entite);
  const statsContainer = document.querySelector(".entity-stats-section.left");

  // 🔄 Boucle sur les stats connues
  for (const [key, val] of Object.entries(merged)) {
	   if (isAttributeKey(key)) continue;
    const def = STATS_DATA.find(s => s.key === key);
    if (!def) {
      console.warn(`⚠️ [previewStats] Stat "${key}" introuvable dans STATS_DATA`);
      continue;
    }

    const isAttribut = ["strength", "agility", "intelligence"].includes(key);
    const selector = isAttribut
      ? `.stat-container[data-stat="${key}"][data-entity-id="${entite.id}"] .entite-stat`
      : `.entite-stat[data-stat="${key}"][data-entity-id="${entite.id}"]`;

    const existing = document.querySelector(selector);
if (existing) {
let displayVal = isObjStat(val) ? `${val.current} / ${val.max}` : val;

if (key === "speed") {
  const ms = parseFloat(String(val ?? 0));
  displayVal = `${(ms / 1000).toFixed(2)} s`;
}

existing.textContent = displayVal;

} else {
  console.log(`⚠️ [previewStats] Bloc DOM manquant pour "${def.key}", non recréé.`);
}
  }


  // 🔍 Debug
  console.groupCollapsed(`🔍 [previewStats] Stats preview pour entité ${entite.id}`);
  for (const [key, val] of Object.entries(merged)) console.log(`   • ${key} =`, val);
  console.groupEnd();

  return merged;
}

  // ===============================
  // 📈 INVEST
  // ===============================
  async function invest(short) {
    const entite = state.currentEntity;
    if (!entite) return;

    const entityMaxLevel = getEntityLevelMax(entite);
    const baseLevel = getEntityLevelCurrent(entite);

    if (state.tempLevel >= entityMaxLevel || baseLevel >= entityMaxLevel) {
      console.warn(`[invest] Niveau maximum (${entityMaxLevel}) atteint — montée impossible.`);
      return;
    }

    // archetype AVANT l’investissement
    const prevKey = getActiveArchetypeKey();

    const nextLevel = state.tempLevel + 1;
    if (nextLevel > entityMaxLevel) {
      console.warn(`[invest] Tentative de dépasser le niveau max (${entityMaxLevel}).`);
      return;
    }

    const c = costAt(costMap, nextLevel);
    if (c == null || state.tempXP < c) return;


    const a = nodes.attributs[short];
    if (!a) return;
    const key = a.line.dataset.key;

    // 🧮 on regarde si on est sur le DERNIER step d’Égaré avant éveil
    const egareCycleLen = getCycleLenFor('egare', entite);
    const egareProg = state.archetypeProgress['egare'] || { level: 1, stage: 0 };
    const willFinishEgareCycle =
      !state.awakened &&
      egareCycleLen > 0 &&
      egareProg.stage + 1 === egareCycleLen;

    let autoConfirmAfter = false;

    if (willFinishEgareCycle) {
      const ok = window.confirm(
        "Votre entité va s'éveiller.\n" +
        "C'est une opération irréversible.\n\n" +
        "Voulez-vous continuer ?"
      );

      if (!ok) {
        // on n’investit pas ce point
        return;
      }

      // on investit ET on auto-confirmera ensuite
      autoConfirmAfter = true;
    }

    // 💰 économie + stat principale
    state.tempXP     -= c;
    state.investedXP += c;
    state.tempLevel   = nextLevel;
    state.stats[key] += 1;
    addPreviewStat(entite, key, 1);

    // archetype APRÈS investissement (avec stats + niveau à jour)
    const nextKey = getActiveArchetypeKey();

    // progression de cycle pour l’archetype actif après l’investissement
    const info = await advanceArchetypeStage(nextKey, entite);
    let {
      level,
      stage,
      cycleName,
      appliedStage,
      cycleLen: cycleLenAfter,
      skipped,
      prevLevel,
      prevStage
    } = info;

    // 🧿 Mémorise l'attribut investi pour ce step dans la progression d'archetype
    if (!skipped && appliedStage > 0) {
      const attrName = attribut_SHORT_TO_NAME[short]; // "force" | "agilite" | "intelligence"
      if (attrName) {
        const prog = state.archetypeProgress[nextKey] || {
          level: level || 1,
          stage,
          uid: getArchetypeUID(),
          milestones: []
        };
        if (!Array.isArray(prog.milestones)) prog.milestones = [];
        // index = step - 1
        prog.milestones[appliedStage - 1] = attrName;
        state.archetypeProgress[nextKey] = prog;
      }
    }

    if (cycleName && cycleName.startsWith("mutation")) {
      cycleName = resolveMutation(
        cycleName,
        state.stats.strength,
        state.stats.agility,
        state.stats.intelligence
      ).finalName;
    }

    if (!skipped) {
      console.log(
        `→ ${nextKey}: étape ${appliedStage}/${cycleLenAfter}, type=${cycleName}, level=${level}, stageAfter=${stage}`
      );
    }

    // 🎯 Sous-stat selon archetype + stage
    let pickKey = null;

    if (!skipped) {
      const attributName = attribut_SHORT_TO_NAME[short];
      const archetypeCycle = getCycleForKey(nextKey, entite);
      let currentStageIndex;

      if (appliedStage <= cycleLenAfter) {
        currentStageIndex = appliedStage - 1;
      } else {
        currentStageIndex = cycleLenAfter - 1;
      }
      currentStageIndex = Math.max(0, Math.min(currentStageIndex, cycleLenAfter - 1));

      const stageName = archetypeCycle?.[currentStageIndex];

      pickKey =
        STAT_INDEX.typeToKey?.[nextKey]?.[stageName] ||
        STAT_INDEX.typeToKey?.[attributName]?.[stageName] ||
        null;

if (pickKey) {
  // 1) Preview de la sous-stat
  addPreviewStat(entite, pickKey, 1);
  (state.subHistory[attributName] ||= []).push(pickKey);

  // parent commun
let statParent =
  document.querySelector(`#codex-entity_${entite.id} .umbra-submenu.new.entity-stats-section`)
  || document.querySelector(`.umbra-submenu.new.entity-stats-section`)
   || nodes.statsRoot
  || document.body;
  if (!statParent) statParent = nodes.statsRoot || document.body;

  // 🔄 Assure que preview.total est à jour (robustness -> armor)
  if (typeof ComputeStatPreview === "function") ComputeStatPreview(entite);

  // -------------------------
  // 2) Création du bloc pickKey si absent
  // -------------------------
  const existingStat = document.querySelector(
    `.stat-container[data-stat="${pickKey}"][data-entity-id="${entite.id}"]`
  );

  if (!existingStat) {
    const statDef   = STATS_DATA.find(s => s.key === pickKey);
    const statLabel = statDef ? statDef.name : pickKey;

    // ✅ init valeur base (number par défaut)
    if (entite.stats[pickKey] == null) entite.stats[pickKey] = 0;

    // ✅ IMPORTANT : on passe la valeur BRUTE (number ou objet), PAS fmt()
   createUmbraBlock(
  statParent,
  statLabel,
  () => entite.stats[pickKey],
  entite,
  pickKey,   // forcedStatKey
  false,    // inlineStatName
  null,     // attribut
  true      // umbra (ou un objet umbra)
);
    markStatUpgraded(entite, pickKey);
  }

  // -------------------------
  // 3) ✅ Cas spécial : armor n’existe pas MAIS armor.max existe en preview
  // -------------------------
  const previewArmor =
    entite?.modifierStats?.preview?.statLeveled?.armor ||
    entite?.modifierStats?.preview?.total?.armor;

  const hasPreviewArmor =
    previewArmor &&
    typeof previewArmor === "object" &&
    Number(previewArmor.max ?? 0) > 0;

  const armorBlockMissing = !document.querySelector(
    `.stat-container[data-stat="armor"][data-entity-id="${entite.id}"]`
  );

  if (armorBlockMissing && hasPreviewArmor) {
    const armorDef   = STATS_DATA.find(s => s.key === "armor");
    const armorLabel = armorDef ? armorDef.name : "Armure";

    // ✅ sécurité: armor doit être un objet current/max en base
    if (!entite.stats.armor || typeof entite.stats.armor !== "object") {
      entite.stats.armor = { current: 0, max: 0 };
    }

    // ✅ callback retourne l'objet brut => ton createUmbraBlock affichera "New!"
    //    (forced + armor 0/0 => entite-stat new-stat + texte "New!")
    createUmbraBlock(
      statParent,
      armorLabel,
      () => entite.stats.armor,
      entite,
      "armor"
    );

    markStatUpgraded(entite, "armor");

    // ✅ force le rendu perm/preview (0/0 -> New! et preview 10/10)
    renderStatPair(entite, "armor", statParent);
  }
// 3bis) ✅ Cas spécial : extraLife n’existe pas MAIS extraLife est présent en preview
// -------------------------
const previewExtraLife =
  entite?.modifierStats?.preview?.statLeveled?.extraLife ||
  entite?.modifierStats?.preview?.total?.extraLife;

const extraMax =
  (previewExtraLife && typeof previewExtraLife === "object")
    ? Number(previewExtraLife.max ?? previewExtraLife.current ?? 0)
    : Number(previewExtraLife ?? 0);

const hasPreviewExtraLife = extraMax > 0;

const extraLifeBlockMissing = !document.querySelector(
  `.stat-container[data-stat="extraLife"][data-entity-id="${entite.id}"]`
);

if (extraLifeBlockMissing && hasPreviewExtraLife) {
  const extraDef   = STATS_DATA.find(s => s.key === "extraLife");
  const extraLabel = extraDef ? extraDef.name : "Vie supplémentaire";

  // ✅ sécurité: créer l'objet base même si max absent
  ensureExtraLifeObj(entite);

  createUmbraBlock(
    statParent,
    extraLabel,
    () => entite.stats.extraLife, // objet brut
    entite,
    "extraLife"
  );

  markStatUpgraded(entite, "extraLife");

  // force perm/preview (0/0 -> New! et preview +1/+1 par ex.)
  renderStatPair(entite, "extraLife", statParent);
}
} else {
  console.warn(`[invest] Pas de sous-stat trouvée pour ${nextKey} (${stageName})`);
}
    }

    // 🧾 Historique
    state.history.push({
      short,
      archetypeKey: nextKey,
      level,
      stage,
      prevLevel,
      prevStage,
      subKey: pickKey
    });

    // 🎨 UI / stats / preview...
    a.value.textContent = state.stats[key];
   if (!isAttributeKey(key)) {
  renderStatPair(entite, key, nodes.statsRoot);
}
    if (pickKey) {
  const pickBlock = document.querySelector(
    `.stat-container[data-stat="${pickKey}"][data-entity-id="${entite.id}"]`
  );
  const pickRoot = (pickBlock && pickBlock.closest(".entity-stats-section"))
    || nodes.statsRoot
    || document.body;

  renderStatPair(entite, pickKey, pickRoot);
}
    if (typeof ComputeStatPreview === "function") ComputeStatPreview(entite);

    // 👉 rendu avec gestion du délai :
    //    - si prevKey === nextKey → pas de délai
    //    - si arch change       → invest = jauge d'abord, label après
    renderAll('invest', prevKey, nextKey);

    // marquage visuel
    document.querySelectorAll('.stat-container.last-substat')
      .forEach(el => el.classList.remove('last-substat'));
    document.querySelectorAll('.stat-container.last-attribut')
      .forEach(el => el.classList.remove('last-attribut'));

    const subContainer = pickKey
      ? document.querySelector(`.stat-container[data-stat="${pickKey}"][data-entity-id="${entite.id}"]`)
      : null;
    const attrContainer = document.querySelector(
      `.stat-container[data-stat="${key}"][data-entity-id="${entite.id}"]`
    );

    if (subContainer)  subContainer.classList.add('last-substat');
    if (attrContainer) attrContainer.classList.add('last-attribut');

    if (entite.modifierStats?.preview?.statLeveled) {
      saveUpgradedEntity(entite);
      console.log(`💾 Preview sauvegardée pour ${entite.name} (${entite.id})`);
    }

    // 🔁 dernier niveau d'Égaré validé + joueur a dit oui → auto-confirm
    if (autoConfirmAfter) {
      confirmLevelUp();
    }
  }

  // ===============================
  // 📉 UNINVEST
  // ===============================
  function uninvest(short) {
    const entite = state.currentEntity;
    if (!entite) return;

    if (!state.history.length) return;

    const last = state.history[state.history.length - 1];
    if (!last || last.short !== short) return;

    const a = nodes.attributs[short];
    if (!a) return;

    const key = a.line.dataset.key;
    const backLevel = state.tempLevel;
    const c = costAt(costMap, backLevel);
    if (c == null) return;

    // archetype AVANT le désinvestissement
    const prevKey = getActiveArchetypeKey();

    // 🧹 suppression éventuelle d’icône de jalon
    const justFinishedCycle = last.stage > last.prevStage;
    if (justFinishedCycle) {
      const uidToRemove = `preview-${entite.id}-${last.archetypeKey}-${last.prevLevel}`;
      const icon = document.querySelector(
        `#archetype-icons-${entite.id} [data-archetype-uid="${uidToRemove}"]`
      );
      if (icon) icon.remove();
    }

    // ==========================
    // ROLLBACK NIVEAU
    // ==========================
    state.tempLevel  -= 1;
    state.tempXP     += c;
    state.investedXP -= c;
    state.stats[key] -= 1;
    removePreviewStat(entite, key);

    // ==========================
    // ROLLBACK ARCHETYPE
    // ==========================
	if (state.milestoneAttributes &&
        state.milestoneAttributes[last.archetypeKey]) {
      delete state.milestoneAttributes[last.archetypeKey][last.stage];
    }
    if (last.archetypeKey) {
      const prog = state.archetypeProgress[last.archetypeKey] || {
        level: last.prevLevel,
        stage: last.stage,
        uid: getArchetypeUID(),
        milestones: []
      };
      if (!Array.isArray(prog.milestones)) prog.milestones = [];

      // On efface l'attribut du step annulé
      if (last.stage != null && last.stage > 0 && last.stage <= prog.milestones.length) {
        prog.milestones[last.stage - 1] = null;
      }

      // On peut optionnellement couper la longueur au nouveau stage
      prog.milestones = prog.milestones.slice(0, last.prevStage);

      prog.level = last.prevLevel;
      prog.stage = last.prevStage;
      state.archetypeProgress[last.archetypeKey] = prog;
      state.touchedArchetypes.add(last.archetypeKey);
    }



    // ==========================
    // ROLLBACK SOUS-STAT
    // ==========================
    const attributName = attribut_SHORT_TO_NAME[short];

    if (last.subKey) {
      removePreviewStat(entite, last.subKey);

      const arr = state.subHistory[attributName];
      if (Array.isArray(arr) && arr.length) arr.pop();

      const currentVal = entite.stats[last.subKey] ?? 0;
      const previewVal = entite.modifierStats?.preview?.statLeveled?.[last.subKey] ?? 0;

      if (currentVal <= 0 && previewVal <= 0) {
        const domStat = document.querySelector(
          `.stat-container[data-stat="${last.subKey}"][data-entity-id="${entite.id}"]`
        );
        if (domStat) domStat.remove();
      }
    }

    // ==========================
    // HISTORIQUE & UI
    // ==========================
    state.history.pop();
    a.value.textContent = state.stats[key];
if (!isAttributeKey(key)) {
  renderStatPair(entite, key, nodes.statsRoot);
}
   if (last.subKey) {
  const subBlock = document.querySelector(
    `.stat-container[data-stat="${last.subKey}"][data-entity-id="${entite.id}"]`
  );
  const subRoot = (subBlock && subBlock.closest(".entity-stats-section"))
    || nodes.statsRoot
    || document.body;

  renderStatPair(entite, last.subKey, subRoot);
}
    if (typeof ComputeStatPreview === "function") ComputeStatPreview(entite);

    // archetype APRÈS le désinvestissement
    const nextKey = getActiveArchetypeKey();

    // 👉 rendu avec gestion du délai :
    //    - uninvest = archétype tout de suite, jauge après si changement
    renderAll('uninvest', prevKey, nextKey);

    // 🌟 Mise à jour du marquage visuel
    document.querySelectorAll('.stat-container.last-substat')
      .forEach(el => el.classList.remove('last-substat'));

    document.querySelectorAll('.stat-container.last-attribut')
      .forEach(el => el.classList.remove('last-attribut'));

    const prev = state.history[state.history.length - 1];
    if (prev) {
      const prevAttr = nodes.attributs[prev.short];
      if (prevAttr) {
        const prevKeyAttr = prevAttr.line.dataset.key;
        const attrContainer = document.querySelector(
          `.stat-container[data-stat="${prevKeyAttr}"][data-entity-id="${entite.id}"]`
        );
        if (attrContainer) attrContainer.classList.add('last-attribut');
      }

      if (prev.subKey) {
        const subContainer = document.querySelector(
          `.stat-container[data-stat="${prev.subKey}"][data-entity-id="${entite.id}"]`
        );
        if (subContainer) subContainer.classList.add('last-substat');
      }
    }

    if (entite.modifierStats?.preview?.statLeveled) {
      saveUpgradedEntity(entite);
    }
  }

// UPGRADE ARROW LVL ECOUTEUR
dom.levelUpSection.addEventListener('click', (e) => {
  const arrow = e.target.closest('.xp-arrow');
  if (!arrow || !dom.levelUpSection.contains(arrow)) return;

  const line = arrow.closest('.axis-line');
  const short = line?.dataset.short;
  if (!short) return;

  // 🟢 Invest / Uninvest
  if (arrow.classList.contains('right-arrow')) {
    invest(short);
  } else if (arrow.classList.contains('left-arrow')) {
    uninvest(short);
  }

  // 💾 Sauvegarde immédiate de la preview dans l'entité
  if (entite.modifierStats?.preview?.statLeveled) {
    saveUpgradedEntity(entite);
    console.log(`💾 Preview sauvegardée pour ${entite.name} (${entite.id})`);
  }
});

// Clear all : rejoue tous les uninvest dans l'ordre inverse
dom.clearBtn.addEventListener('click', () => {
  // On annule TOUT l'historique courant en déroulant les steps à l'envers
  while (state.history.length > 0) {
    const last = state.history[state.history.length - 1];
    if (!last || !last.short) break;
    uninvest(last.short);
  }

  // ❌ NE PLUS TOUCHER state.awakened ICI
  // state.awakened = isEntityAwakened(entite);  // → à supprimer

  // Recalcule la preview et rafraîchit l'UI
  if (typeof ComputeStatPreview === 'function') ComputeStatPreview(entite);
  renderAll();
});

// ✅ CONFIRMER LEVEL UP (valide les stats preview et les applique)
dom.confirmButton.addEventListener('click', () => {
  confirmLevelUp();
});

// 🟩 Ajoute la classe "upgraded"
function markStatUpgraded(entite, statKey) {
  const el = document.querySelector(
    `.stat-container[data-stat="${statKey}"][data-entity-id="${entite.id}"]`
  );
  if (el) el.classList.add('upgraded');
}

// 🟥 Retire la classe "upgraded" si la stat n’a plus de preview active
function unmarkStatUpgraded(entite, statKey) {
  const el = document.querySelector(
    `.stat-container[data-stat="${statKey}"][data-entity-id="${entite.id}"]`
  );
  const val = entite?.modifierStats?.preview?.statLeveled?.[statKey] ?? 0;
  if (el && val <= 0) el.classList.remove('upgraded');
}

function refreshPreviewVitals(entite) {
  syncPreviewHPFromVitality(entite);
  syncPreviewArmorFromRobustness(entite);
  syncPreviewExtraLifeFromTranscendence(entite);

  // dayHpRegen dérivée de HP.max + vitality
  syncPreviewDayHpRegenFromHPVitality(entite);

  ComputeStatPreview(entite);

let b;

b = document.querySelector(`.stat-container[data-stat="HP"][data-entity-id="${entite.id}"]`);
renderStatPair(entite, "HP", (b && b.closest(".entity-stats-section")) || nodes.statsRoot || document.body);

b = document.querySelector(`.stat-container[data-stat="armor"][data-entity-id="${entite.id}"]`);
renderStatPair(entite, "armor", (b && b.closest(".entity-stats-section")) || nodes.statsRoot || document.body);

b = document.querySelector(`.stat-container[data-stat="extraLife"][data-entity-id="${entite.id}"]`);
renderStatPair(entite, "extraLife", (b && b.closest(".entity-stats-section")) || nodes.statsRoot || document.body);

b = document.querySelector(`.stat-container[data-stat="dayHpRegen"][data-entity-id="${entite.id}"]`);
renderStatPair(entite, "dayHpRegen", (b && b.closest(".entity-stats-section")) || nodes.statsRoot || document.body);
}


function addPreviewStat(entite, statKey, amount = 1) {
  entite.modifierStats ??= {};
  entite.modifierStats.preview ??= { statLeveled: {} };

  entite.modifierStats.preview.statLeveled[statKey] =
    (entite.modifierStats.preview.statLeveled[statKey] ?? 0) + amount;

 if (statKey === "vitality" || statKey === "robustness" || statKey === "transcendence") refreshPreviewVitals(entite);
  else if (statKey === "velocity") refreshPreviewSpeed(entite);
  else ComputeStatPreview(entite);

  markStatUpgraded(entite, statKey);
}

function removePreviewStat(entite, statKey) {
  const sl = entite?.modifierStats?.preview?.statLeveled;
  if (!sl) return;

  const current = sl[statKey] ?? 0;
  if (current <= 1) delete sl[statKey];
  else sl[statKey] = current - 1;

   if (statKey === "vitality" || statKey === "robustness" || statKey === "transcendence") refreshPreviewVitals(entite);
  else if (statKey === "velocity") refreshPreviewSpeed(entite);
  else ComputeStatPreview(entite);


  unmarkStatUpgraded(entite, statKey);
}

function removeNewStatClasses(entite) {
  document.querySelectorAll('.entite-stat.new-stat').forEach(el => {
    const statKey = el.dataset.stat;
    const entityId = el.dataset.entityId;

    // Supprime la classe "new-stat"
    el.classList.remove('new-stat');

    // Récupère l’entité correspondante si non passée en argument
    const targetEntite = entite || (window.entites?.find(e => e.id == entityId));

    // Vérifie la valeur réelle de la stat
    const statValue =
      targetEntite?.stats?.[statKey] ??
      targetEntite?.modifierStats?.durable?.statLeveled?.[statKey] ??
      targetEntite?.modifierStats?.preview?.statLeveled?.[statKey] ??
      0;

    // Si la stat n’a plus aucune valeur → supprime le conteneur complet
    if (statValue == null || statValue <= 0) {
      const statContainer = el.closest(`.stat-container[data-stat="${statKey}"][data-entity-id="${entityId}"]`);
      if (statContainer) {
        console.log(`🗑️ Suppression stat vide '${statKey}' pour entité ${entityId}`);
        statContainer.remove();
      }
    }
  });
}


  // Init
  dom.initialXPDisplay.textContent = `${playerExperience}`;
  renderAll();
function confirmLevelUp() {
  if (!entite) return console.warn('⚠️ [confirmLevelUp] Entité manquante');

  const previewStats = entite.modifierStats?.preview?.statLeveled;
  if (!previewStats || Object.keys(previewStats).length === 0) {
    console.log(`ℹ️ [confirmLevelUp] Aucune preview à confirmer pour ${entite.name}`);
    return;
  }

  entite.modifierStats ??= {};
  entite.modifierStats.durable ??= { statLeveled: {} };

  // ✅ flags dérivés (une seule fois, plus propre)
  const isDerivedSpeed = !!entite?.modifierStats?.preview?.meta?.derived?.speedFromVelocity;
  const isDerivedDayHpRegen = !!entite?.modifierStats?.preview?.meta?.derived?.dayHpRegenFromHPVitality;

  for (const [key, val] of Object.entries(previewStats)) {

    // ✅ HP objet (current/max)
    if (key === "HP" && isObjStat(val)) {
      entite.modifierStats.durable.statLeveled.HP =
        addObj(entite.modifierStats.durable.statLeveled.HP, val);

      if (entite.stats?.HP && typeof entite.stats.HP === "object") {
        entite.stats.HP.max += Number(val.max ?? 0);
        entite.stats.HP.current += Number(val.current ?? 0);
        entite.stats.HP.current = Math.min(entite.stats.HP.current, entite.stats.HP.max);
      }
      continue;
    }

    // ✅ ARMOR objet (current/max) -> VALIDATION IMMÉDIATE
    if (key === "armor" && isObjStat(val)) {
      entite.modifierStats.durable.statLeveled.armor =
        addObj(entite.modifierStats.durable.statLeveled.armor, val);

      entite.stats ??= {};
      if (!entite.stats.armor || typeof entite.stats.armor !== "object") {
        const n = Number(entite.stats.armor ?? 0);
        entite.stats.armor = { current: n, max: n };
      }

      entite.stats.armor.max += Number(val.max ?? 0);
      entite.stats.armor.current += Number(val.current ?? 0);
      entite.stats.armor.current = Math.min(entite.stats.armor.current, entite.stats.armor.max);
      entite.stats.armor.current = Math.max(0, entite.stats.armor.current);
      entite.stats.armor.max = Math.max(0, entite.stats.armor.max);

      updateHealthBar(
        entite.stats.HP.current,
        entite.stats.HP.max,
        entite.stats.armor.current,
        entite.stats.armor.max,
        entite.id
      );

      updateArmorCounter(entite);
      continue;
    }

    // ✅ EXTRALIFE objet (current/max)
    if (key === "extraLife" && isObjStat(val)) {
      const deltaMax = Number(val.max ?? 0) || 0;
      const deltaCur = Number(val.current ?? 0) || 0;

      if (deltaMax === 0 && deltaCur === 0) continue;

      entite.modifierStats.durable.statLeveled.extraLife =
        addObj(entite.modifierStats.durable.statLeveled.extraLife, { current: deltaCur, max: deltaMax });

      entite.stats ??= {};
      ensureExtraLifeObj(entite);

      entite.stats.extraLife.max += deltaMax;
      entite.stats.extraLife.current += deltaCur;

      entite.stats.extraLife.max = Math.max(0, entite.stats.extraLife.max);
      entite.stats.extraLife.current = Math.max(0, Math.min(entite.stats.extraLife.current, entite.stats.extraLife.max));

      updateBonusLifeCounters(entite);
      updateArmorCounter(entite);
      continue;
    }

    // ✅ SPEED : si dérivée de velocity => ne pas valider
    if (key === "speed") {
      if (isDerivedSpeed) continue;

      const ds = Number(val ?? 0) || 0;
      entite.modifierStats.durable.statLeveled.speed =
        (entite.modifierStats.durable.statLeveled.speed ?? 0) + ds;

      continue;
    }

    // ✅ dayHpRegen : si dérivée de HP.max + vitality => ne pas valider
    if (key === "dayHpRegen") {
      if (isDerivedDayHpRegen) continue;
      // sinon, si tu autorises une stat dayHpRegen “directe”, elle passe en numérique standard ci-dessous
    }

    // ✅ cas numérique standard
    entite.modifierStats.durable.statLeveled[key] =
      (entite.modifierStats.durable.statLeveled[key] ?? 0) + Number(val ?? 0);

    if (typeof entite.stats?.[key] === "number") {
      entite.stats[key] += Number(val ?? 0);
    } else if (entite.stats?.[key] == null) {
      entite.stats[key] = Number(val ?? 0);
    }
  }

  // 🔁 Recalcule speed depuis velocity après validation
  recomputeSpeedFromVelocity(entite);

  // 🔁 Recalcule dayHpRegen depuis HP.max + vitality après validation
  recomputeDayHpRegen(entite);

  // 🧱 Incrément du niveau (respecte level.max propre à l’entité)
  const baseLevel = getEntityLevelCurrent(entite);
  const maxLevelForEntity = getEntityLevelMax(entite);
  const targetTempLevel = Math.min(state.tempLevel, maxLevelForEntity);
  const gainedLevels = targetTempLevel - baseLevel;

  if (gainedLevels > 0) {
    setEntityLevelCurrent(entite, baseLevel + gainedLevels);
    console.log(`⬆️ ${entite.name} gagne ${gainedLevels} niveau(x) → Niveau ${getEntityLevelCurrent(entite)}`);
  }

  // ✅ Passe les icônes preview -> leveled
  document.querySelectorAll(`#archetype-icons-${entite.id} .archetype-icon.preview`)
    .forEach(icon => {
      const oldUid = icon.dataset.archetypeUid;
      icon.dataset.archetypeUid = oldUid.replace("preview-", "leveled-");
      icon.classList.remove("preview");
      icon.classList.add("leveled");
    });

  // ✅ Nettoyage preview
  delete entite.modifierStats.preview;

  // ✅ Retire upgraded partout
  document
    .querySelectorAll(`.stat-container[data-entity-id="${entite.id}"].upgraded`)
    .forEach(el => el.classList.remove('upgraded'));

  // ✅ Reset state temporaire
  state.history    = [];
  state.investedXP = 0;
  state.tempXP     = playerExperience;
  state.tempLevel  = getEntityLevelCurrent(entite);

  // ✅ Remet les valeurs d'attributs affichées
  for (const attribut of attributS) {
    const short = attribut.short;
    nodes.attributs[short].value.textContent = entite.stats[attribut.key];
  }

  // ✅ Rerender stats
  if (typeof renderAllStats === 'function') {
    renderAllStats(entite, nodes.statsRoot);
  } else {
    Object.keys(entite.baseStats).forEach(k => renderStatPair(entite, k, nodes.statsRoot));
  }

  updateArchetypeBadge(state, nodes);
  updategraph(state, nodes);

  // ✅ HP counters + barres + compteur armure
  updateHPCounters(entite.id, entite.stats.HP.current, entite.stats.HP.max);
  updateHealthBar(
    entite.stats.HP.current,
    entite.stats.HP.max,
    entite.stats.armor?.current ?? 0,
    entite.stats.armor?.max ?? 0,
    entite.id
  );
  updateArmorCounter(entite);

  // (Optionnel mais logique si extraLife existe)
  updateBonusLifeCounters(entite);

  removeNewStatClasses(entite);
  saveEntityLevelUP(entite, state);
  if (typeof updateExperienceDisplay === 'function') updateExperienceDisplay();
  renderAll();
}

}
 
export function getArchetypeMilestones(classKey, entite) {
  const cycle = getCycleForKey(classKey, entite) || DEFAULT_CYCLE;

  if (!cycle || !Array.isArray(cycle)) return [];

  const milestones = [];

  cycle.forEach((entry, index) => {
    const match = entry.match(/-(\d+)$/);
    if (!match) return;

    const level = parseInt(match[1], 10);

    if (level === 1 || level === 2 || level === 3) {
      milestones.push({
        index,
        level,         // 2 ou 3
        stageName: entry
      });
    }
  });

  return milestones;
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
  setTimeout(() => {
    pulse.remove();
  }, 650); // légèrement > durée de l’animation
}

function updategraph(state, nodes) {
  const { strength, agility, intelligence } = state.stats;
  drawRealtimegraph(nodes.graphCtx, strength, agility, intelligence);

}
function updateArchetypeBadge(state, nodes) {
  if (!nodes.archetypeLabel) return;

  const entite = state.currentEntity;
  const { strength, agility, intelligence } = state.stats;
  const level = state.tempLevel ?? state.level ?? 1;

  // 👉 Seul vrai signal d’éveil : state.awakened
  const awakened = !!state.awakened;

  const keyLower = String(
    getClassFromAttributs(
      strength,
      agility,
      intelligence,
      level,
      awakened,   // tant que false → "egare"
      entite
    )
  ).trim().toLowerCase();

  const meta = CLASS_INDEX[keyLower];
  let name = meta?.name || "Égaré";

  // 🆕 Ajout / retrait de la classe .stray sur le graph container
  if (nodes.graphCtx?.canvas) {
    const graphContainer = nodes.graphCtx.canvas.closest('.attribut-graph-container');
    if (graphContainer) {
      if (keyLower === "egare") {
        graphContainer.classList.add("stray");
      } else {
        graphContainer.classList.remove("stray");
      }
    }
  }
  // --- fin du bloc ajouté ---

  const progress = state.archetypeProgress || {};
  const prog = progress[keyLower] || { level: 1, stage: 0 };
  const archLevel = Math.max(1, prog.level | 0);

  const prevValue = nodes.archetypeLabel.dataset.value || "";
  if (prevValue && prevValue !== name) {
    nodes.archetypeLabel.classList.add("changed");
    clearTimeout(nodes.archetypeLabel._changedTimeout);
    nodes.archetypeLabel._changedTimeout = setTimeout(() => {
      nodes.archetypeLabel.classList.remove("changed");
    }, 1500);
  }

  nodes.archetypeLabel.dataset.value = name;
  nodes.archetypeLabel.innerHTML = "";
  nodes.archetypeLabel.append(document.createTextNode(name));

  if (archLevel > 1) {
    const lvlSpan = document.createElement("span");
    lvlSpan.className = "arch-lvl-label";
    lvlSpan.textContent = " " + toRoman(archLevel);
    nodes.archetypeLabel.appendChild(lvlSpan);
  }

  if (nodes.archetypeDesc) {
    nodes.archetypeDesc.textContent = meta?.description || "";
  }
}

function updateArchetypeGauge(state, nodes) {
  if (!nodes.gauge) return;

  const entite = state.currentEntity;
  const level = state.tempLevel ?? state.level ?? 1;
  const awakened = !!state.awakened;

  const activeName = String(
    getClassFromAttributs(
      state.stats.strength,
      state.stats.agility,
      state.stats.intelligence,
      level,
      awakened,
      entite
    ) || ""
  ).trim().toLowerCase();

  const cycleLen = getCycleLenFor(activeName, entite);
  const prog = state.archetypeProgress[activeName] || { level: 1, stage: 0 };
  const nice = getClassLabel(activeName) || activeName;

  if (cycleLen === 0) {
    nodes.gauge.label.textContent = `${nice} — aucun cycle`;
    nodes.gauge.fill.style.width = '0%';
    return;
  }

  const clampedStage = Math.min(prog.stage, cycleLen);
  const pct = Math.round((clampedStage / cycleLen) * 100);

  nodes.gauge.label.textContent =
    `${nice} ${prog.level} — ${clampedStage}/${cycleLen} · ${pct}%`;

  nodes.gauge.fill.style.width = `${pct}%`;
}
function updateArchetypeMilestones(state, nodes) {
  if (!nodes.gauge?.milestones) return;

  const entite   = state.currentEntity;
  const level    = state.tempLevel ?? state.level ?? 1;
  const awakened = !!state.awakened;

  const activeName = String(
    getClassFromAttributs(
      state.stats.strength,
      state.stats.agility,
      state.stats.intelligence,
      level,
      awakened,
      entite
    ) || ""
  ).trim().toLowerCase();

  const cycle   = getCycleForKey(activeName, entite) || DEFAULT_CYCLE;
  const total   = cycle.length;
  const prog    = state.archetypeProgress[activeName] || { stage: 0, milestones: [] };
  const jalons  = getArchetypeMilestones(activeName, entite);

  const milestoneList = Array.isArray(prog.milestones) ? prog.milestones : [];

  nodes.gauge.milestones.innerHTML = "";

  jalons.forEach(j => {
    const el = document.createElement("div");
    el.className = "milestone";
    el.dataset.index = j.index;

    if (j.stageName) {
      const [nature, lvlStr] = j.stageName.split("-");
      if (nature) {
        el.classList.add(nature);
        if (lvlStr) el.classList.add(`${nature}-${lvlStr}`);
      }
	  // ✅ Shape selon la nature
if (nature === "utilitaire") el.classList.add("shape-round");
else if (nature === "defense") el.classList.add("shape-square");
else if (nature === "attaque") el.classList.add("shape-diamond");
    }

    if (j.level) el.classList.add(`lvl-${j.level}`);

    const stageNumber = j.index + 1;
    const pct = (stageNumber / total) * 100;
    el.style.left = `calc(${pct}% - 6px)`;

    if (prog.stage >= stageNumber) {
      el.classList.add("filled");

      let attrClass = milestoneList[stageNumber - 1] || null;

      // fallback : on remonte dans l'historique courant si besoin
      if (!attrClass && state.history?.length) {
        const stepEvent = state.history
          .slice()
          .reverse()
          .find(h => h.archetypeKey === activeName && h.stage === stageNumber);

        if (stepEvent && stepEvent.short) {
          attrClass = attribut_SHORT_TO_NAME[stepEvent.short];
        }
      }

      if (attrClass) {
        el.classList.add(attrClass);
        const gem = document.createElement("div");
        gem.className = `gemme ${attrClass}`;
        el.appendChild(gem);
      }

      if (prog.stage === stageNumber) {
        el.classList.add("last");
        setTimeout(() => el.classList.remove("last"), 1000);
      }
    }

    nodes.gauge.milestones.appendChild(el);
  });
}

// ARCHETYPE LVLUP SAVE LOCALSTORAGE button CONFIRM 
function saveEntityLevelUP(entite, state) {
  const { stratArchetype } = getArchetypeConfig(entite);

  // 1️⃣ Appliquer les valeurs confirmées côté entité
  const maxLevelForEntity = getEntityLevelMax(entite);
  const targetLevel = Math.min(state.tempLevel, maxLevelForEntity);
  setEntityLevelCurrent(entite, targetLevel);
  playerExperience = state.tempXP;

  entite.stats.strength     = state.stats.strength;
  entite.stats.agility      = state.stats.agility;
  entite.stats.intelligence = state.stats.intelligence;

  // 2️⃣ Classe réelle dérivée des attributs (en tenant compte de l'éveil)
  const currentLevel = getEntityLevelCurrent(entite);
  const realKey = String(
    getClassFromAttributs(
      entite.stats.strength,
      entite.stats.agility,
      entite.stats.intelligence,
      currentLevel,
      !!state.awakened,
      entite
    )
  ).trim().toLowerCase();

  // 👉 Tant qu'on n’est PAS éveillé, l'archetype actif logique reste "egare"
  const activeName = state.awakened ? realKey : "egare";

  // Sécurité : s’assurer qu’il existe une entrée pour l’actif
  state.archetypeProgress ??= {};
  if (!state.archetypeProgress[activeName]) {
    state.archetypeProgress[activeName] = {
      level: 1,
      stage: 0,
      uid: getArchetypeUID(),
      milestones: []      // interne, pas stocké tel quel sur l’entité
    };
  }

  // 🔥 Ajout des uid / milestones manquants sur tous les archetypes en progression
  for (const [key, entry] of Object.entries(state.archetypeProgress)) {
    if (!entry.uid) entry.uid = getArchetypeUID();
    if (!Array.isArray(entry.milestones)) entry.milestones = [];
  }

  const ap = state.archetypeProgress[activeName];

  // 3️⃣ On part de ce qui existe éventuellement déjà sur l’entité
  const prevArch = entite.Archetype || {};
  let achieve = Array.isArray(prevArch.achieve) ? [...prevArch.achieve] : [];

  const mergeAchieve = (snap) => {
    if (!snap || !snap.key) return;

    const key   = String(snap.key).toLowerCase();
    const level = snap.level ?? 1;
    const step  = snap.step ?? snap.stage ?? 0;
    const uid   = snap.uid || getArchetypeUID();
    const milestoneArr = Array.isArray(snap.milestone) ? [...snap.milestone] : [];

    let existing = achieve.find(a => a.key === key && a.level === level);
    if (!existing) {
      achieve.push({
        key,
        level,
        step,
        uid,
        milestone: milestoneArr
      });
    } else {
      if (!existing.uid) existing.uid = uid;
      if ((step | 0) > (existing.step | 0)) {
        existing.step = step;
      }
      if (!Array.isArray(existing.milestone) || !existing.milestone.length) {
        existing.milestone = milestoneArr;
      }
    }
  };

  // 4️⃣ Hydrate depuis les snapshots de cycles terminés
  if (state.egareCycleSnapshot) {
    mergeAchieve(state.egareCycleSnapshot);
  }
  if (Array.isArray(state.achievedArchetypes)) {
    state.achievedArchetypes.forEach(mergeAchieve);
  }

  // 5️⃣ Construction d’inProgress (en GARDANT current dedans)
  let inProgress = Object.entries(state.archetypeProgress).map(([key, val]) => {
    const lvl   = val.level | 0 || 1;
    const stage = val.stage | 0 || 0;
    const uid   = val.uid || getArchetypeUID();
    const milestonesArr = Array.isArray(val.milestones)
      ? val.milestones.slice(0, stage)
      : [];

    return {
      key,
      level: lvl,
      step: stage,
      uid,
      milestone: milestonesArr
    };
  });

  // current = archetype actif
  const current = {
    key: activeName,
    level: ap.level | 0 || 1,
    step:  ap.stage | 0 || 0,
    uid:   ap.uid,
    milestone: Array.isArray(ap.milestones)
      ? ap.milestones.slice(0, ap.stage | 0 || 0)
      : []
  };

  // ❗ On s’assure que current figure BIEN aussi dans inProgress
  const idxCurrent = inProgress.findIndex(e =>
    e.key === current.key &&
    e.level === current.level
  );
  if (idxCurrent === -1) {
    inProgress.push({ ...current });
  } else {
    inProgress[idxCurrent] = { ...current };
  }

  // 7️⃣ Affectation finale sur l’entité
  entite.Archetype = { current, inProgress, achieve };

  // 8️⃣ Nettoyage ancien format
  delete entite.archetype;
  delete entite.currentArchetype;
  delete entite.archetypeKey;

  // 9️⃣ Recalcul complet des stats définitives
  recomputeEntityStats(entite);

  // 🔟 Sauvegarde locale dans selectedArmyA + XP joueur
  const selectedArmy = JSON.parse(localStorage.getItem('selectedArmyA') || '[]');
  const idx = selectedArmy.findIndex(e => e.id === entite.id);
  if (idx !== -1) selectedArmy[idx] = entite;
  else selectedArmy.push(entite);

  // ⬇️ JSON compact (une seule ligne)
  localStorage.setItem('selectedArmyA', JSON.stringify(selectedArmy, null, 0));
  localStorage.setItem('playerExperience', playerExperience);

  // 1️⃣1️⃣ Réinitialisation de l’état temporaire
 if (state.touchedArchetypes?.clear) state.touchedArchetypes.clear();
  state.history    = [];
  state.investedXP = 0;
  state.tempLevel  = getEntityLevelCurrent(entite);

  state.awakened = !!(
    entite.Archetype?.current &&
    entite.Archetype.current.key &&
    entite.Archetype.current.key !== "egare"
  );

  state.egareCycleSnapshot = null;

  if (entite.modifierStats?.preview) {
    entite.modifierStats.preview.statLeveled = {};
  }
}



// 🔁 Timeouts par entité
const extasisTimeoutsByEntity = new Map();

// Petit helper anti-cache
function noCacheSrc(path) {
  const salt = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${path}?v=${salt}`;
}

function clearExtasisForEntity(entite) {
  if (!entite || !entite.id) return;

  const soulSection = document.getElementById(`soul-section-${entite.id}`);
  if (soulSection) {
    // On ne retire que les containers d'animation
    soulSection
      .querySelectorAll('.awakening-animation-container')
      .forEach(el => el.remove());
  }

  const timeouts = extasisTimeoutsByEntity.get(entite.id) || [];
  timeouts.forEach(id => clearTimeout(id));
  extasisTimeoutsByEntity.delete(entite.id);
}

export function playAwakeningExtasis(entite) {
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

  // 1) Premier GIF immédiatement (avec anti-cache)
  const gif1 = document.createElement('img');
  gif1.src = noCacheSrc('/media/assets/effects/extase-01.gif');
  gif1.className = 'extasis intro';
  wrapper.appendChild(gif1);

  // 2) Deuxième GIF très vite après (avec anti-cache)
  const timeoutSecondGif = setTimeout(() => {
    if (!wrapper.isConnected) return;

    const gif2 = document.createElement('img');
    gif2.src = noCacheSrc('/media/assets/effects/extase-02.gif');
    gif2.className = 'extasis end';
    wrapper.appendChild(gif2);
  }, 1);
  timeouts.push(timeoutSecondGif);

  // 3) Fin de l’animation : on enlève UNIQUEMENT le wrapper
  const timeoutRemoveAll = setTimeout(() => {
    clearExtasisForEntity(entite);
  }, 7000); // 7 s au total
  timeouts.push(timeoutRemoveAll);

  extasisTimeoutsByEntity.set(entite.id, timeouts);
}
