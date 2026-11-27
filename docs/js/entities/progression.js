import { gameStorage as localStorage } from "../storage/sessionStorage.js";
import { applyStatSystemTotals, STAT_SYSTEM_ORIGINS, getPointLimitedStatKeys } from "./statSystem.js";
import {
  getStatSystemInputs, entites, recomputeEntityStats, updateExtraLifeRegenOrders,
  updateEternalLifeRegenOrders, rescaleHPCurrent, levelDetails, calculateVitalityBonus,
  calculateVelocityReduction, calculateRobustnessBonus, calculateTranscendenceExtraLife,
  maxLevel as MAX_LEVEL, BaseDayHpRegen, calculateWeaponMasteryCharge,
  calculateGeneratedWeight, getWeaponOrfevrePreviewActivePercent,
  getWeaponOrfevreStuffPreviewDelta,
} from "./runtime.js";
import { getEquipmentResourceCurrent, syncLifeCurrent } from "../items/resourceStocks.js";
import {
  loadFromLocalStorage, saveToLocalStorage, removeFromEquippedItemsStorage, saveUpgradedEntity,
  getAvailablePlayerExperience, spendPlayerExperience, creditPlayerExperience,
} from "../storage/gameStorage.js";
import { resetEntityAttackEssences } from "../items/essenceInventory.js";
import { syncEntityLinkedEssenceInventory } from "../items/essences.js";
import {
  getSafe, CLASS_INDEX, DEFAULT_CYCLE, STAT_INDEX,
  ensureEntityLevelObject as ensureCoreEntityLevelObject, getArchetypeConfig, getArchetypeMilestones,
  getArchetypeUID, getClassFromAttributs, getClassLabel, getCycleForKey, getCycleLenFor,
  resolveMutation, normalizeStatKey, normalizeStatModifierMapInPlace,
} from "./rules.js";
import { validateAndSetNickname } from "./names.js";
import { refreshResetDom } from "../ui/statistics/components.js";
import {
  toNumber, calculateVitalityRegenPercent, calculateVitalityRegenAmount, calculateTotalRegenAmount,
  calculateHpBattleRegenStrengthRatio, calculateHpBattleRegenIndestructibilityRatio,
  weaponMasteryChargeStrenghtRatioBonus, calculateWeaponOrfevreWeaponMastery,
  calculateWeaponOrfevreStrength, calculateWeaponMasteryTrophyChance,
  calculateWeaponMasteryTrophyStrengthBonus, calculateMovementMarathonChance,
  calculateMovementTrailerChance, calculateGeneratedUmbraStats, getGeneratedUmbraTargetKeys,
} from "../combat/statistics.js";
import { recordEntityProgression, countCompletedArchetypes } from "../storage/entityStorage.js";
import { grantEntityRobustnessArmor } from "../items/armor.js";
import { updateExperienceDisplay } from "../ui/codex/stats.js";

// Reset progression and restore the entity's native state.
const RESET_FIELDS = [
  'level', 'experience', 'modifierStats', 'Archetype',
  'stats', 'stuff', 'extraLifeRegen', 'eternalLifeRegen', 'resourceStocks',
  'attackDetails', 'attacks', 'currentAttack', 'currentAttackId', 'attackEssenceInventory',
  'nativeAttacks', 'modifierAttacks', 'attackSelection',
];

function clonePlainData(value, ancestors = new Set()) {
  if (typeof value === 'function' || typeof value === 'symbol') return undefined;
  if (!value || typeof value !== 'object') return value;
  if (ancestors.has(value)) return undefined;
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype
      && Object.getPrototypeOf(value) !== null) return undefined;
  ancestors.add(value);
  const copy = Array.isArray(value) ? [] : {};
  for (const [key, entry] of Object.entries(value)) {
    const cloned = clonePlainData(entry, ancestors);
    if (cloned !== undefined) copy[key] = cloned;
  }
  ancestors.delete(value);
  return copy;
}

function rejectReset(message) {
  return { ok: false, refundXP: 0, refundPercent: 0, removedEssenceIds: [], returnedEquipmentIds: [], message };
}

function validateReset(entity) {
  if (!entity || entity.id == null || !entity.baseStats || !entity.stats?.HP) {
    return rejectReset('Entite introuvable ou statistiques absentes.');
  }
  if (entity.isDEAD || entity.isDead || entity.statut?.includes('dead') || !(Number(entity.stats.HP.current) > 0)) {
    return rejectReset('Une entite morte ne peut pas etre remise a zero.');
  }
  return null;
}

function equipmentIds(entity) {
  return new Set(Object.entries(entity.stuff || {})
    .sort(([a], [b]) => Number(b.slice(4)) - Number(a.slice(4)))
    .flatMap(([, ids]) => ids).filter(id => typeof id === 'string'));
}

function clearProgression(entity) {
  entity.level = { ...entity.level, current: 1 };
  entity.experience = 0;
  entity.modifierStats ??= {};
  entity.modifierStats.durable ??= {};
  const durable = entity.modifierStats.durable;
  for (const key of ['level', 'adminLevel', 'statLeveled', 'archetype', 'derived']) durable[key] = {};
  durable.archetypeMeta = null;
  delete durable.levelUpMeta;
  delete entity.modifierStats.preview;
  entity.Archetype = {
    current: { key: 'egare', level: 1, step: 0, milestone: [] },
    inProgress: [],
    achieve: [],
  };
}

function restoreResetResources(entity, fadedLife) {
  entity.stats.HP.current = entity.stats.HP.max;
  // Faded lives are consumable charges, never a refillable pool.
  const remaining = fadedLife + getEquipmentResourceCurrent(entity, 'fadedLife');
  if (remaining > 0) entity.stats.fadedLife = remaining;
  else delete entity.stats.fadedLife;
  for (const key of ['extraLife', 'eternalLife']) {
    const pool = entity.stats[key];
    if (!pool) continue;
    pool.current = pool.max;
    for (const [slotKey, slot] of Object.entries(entity[`${key}Regen`] || {})) {
      if (/^\d{3}$/.test(slotKey)) slot.currentRegen = slot.maxRegen;
    }
    syncLifeCurrent(entity, key);
  }
  updateExtraLifeRegenOrders(entity);
  updateEternalLifeRegenOrders(entity);
}

export function previewEntityReset(entity) {
  const rejected = validateReset(entity);
  if (rejected) return rejected;

  // The refund uses committed stats, including battle boosts, never a level-up preview.
  const committed = { ...entity, modifierStats: { durable: entity.modifierStats?.durable } };
  const will = Number(getSafe(committed, 'will', 0)) || 0;
  const refundPercent = 30 + will;
  const investedXP = Math.max(0, Number(entity.experience) || 0);
  const refundXP = Math.floor(investedXP * refundPercent / 100);
  const projection = clonePlainData(entity);
  const beforeEquipment = equipmentIds(projection);
  const fadedLife = Math.max(0, (Number(entity.stats.fadedLife) || 0) - getEquipmentResourceCurrent(entity, 'fadedLife'));

  clearProgression(projection);
  const essenceReset = resetEntityAttackEssences(projection);
  if (!essenceReset.ok) return rejectReset(essenceReset.message);
  recomputeEntityStats(projection, { persistEquipment: false, protectChargeMalus: false });
  restoreResetResources(projection, fadedLife);
  const keptEquipment = equipmentIds(projection);

  return {
    ok: true,
    refundXP,
    refundPercent,
    removedEssenceIds: essenceReset.removedEssenceIds,
    returnedEquipmentIds: [...beforeEquipment].filter(id => !keptEquipment.has(id)),
    message: 'Entite remise au niveau 1.',
    projection,
  };
}

function applyProjection(target, projection) {
  const data = clonePlainData(projection);
  for (const key of RESET_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(data, key)) target[key] = data[key];
    else delete target[key];
  }
  // Keep the current attack attached to its live definition.
  target.currentAttack = target.attackDetails?.find(attack => (
    (attack.functionName || attack.attackId) === target.currentAttackId
  )) || target.currentAttack;
}

function persistAndSyncReset(entity) {
  const sameId = candidate => candidate && String(candidate.id) === String(entity.id);
  const saved = clonePlainData(entity);
  const armyA = loadFromLocalStorage('selectedArmyA', []);
  const inArmyA = Array.isArray(armyA) && armyA.some(sameId);
  if (inArmyA) saveToLocalStorage('selectedArmyA', armyA.map(entry => sameId(entry) ? saved : entry));

  const armyB = loadFromLocalStorage('ArmyB', { armies: {} });
  let changedArmyB = false;
  for (const army of Object.values(armyB?.armies || {})) {
    if (!Array.isArray(army.entities) || !army.entities.some(sameId)) continue;
    army.entities = army.entities.map(entry => sameId(entry) ? saved : entry);
    changedArmyB = true;
  }
  if (changedArmyB) saveToLocalStorage('ArmyB', armyB);

  const pools = [entites];
  if (typeof window !== 'undefined') pools.push(window.entites, window.selectedArmyA, window.selectedArmyB);
  for (const pool of pools) {
    if (!Array.isArray(pool)) continue;
    for (const copy of pool) {
      if (copy !== entity && sameId(copy)) applyProjection(copy, entity);
    }
  }
  return inArmyA;
}

export async function resetEntityProgression(entity, { refundExperience = true } = {}) {
  const rejected = validateReset(entity);
  if (rejected) return rejected;
  // Resolve the combat and Codex UI at call time.
  const entityApi = await import("../combat/vitals.js");
  const codexApi = await import("../ui/codex/index.js");
  const preview = previewEntityReset(entity);
  if (!preview.ok) return preview;
  const { projection, ...result } = preview;
  const oldStats = clonePlainData(entity.stats);
  const adminShare = Math.min(1, Math.max(0, Number(entity.adminExperienceSpent) || 0) / Math.max(1, Number(entity.experience) || 0));
  if (!refundExperience) result.refundXP = 0;

  recordEntityProgression(entity);
  applyProjection(entity, projection);
  entity.adminExperienceSpent = 0;
  for (const id of result.returnedEquipmentIds) removeFromEquippedItemsStorage(id);
  syncEntityLinkedEssenceInventory(entity);
  const inArmyA = persistAndSyncReset(entity);
  if (refundExperience) {
    const adminRefund = Math.floor(result.refundXP * adminShare);
    creditPlayerExperience(adminRefund, { admin: true });
    creditPlayerExperience(result.refundXP - adminRefund);
  }
  try {
    refreshResetDom(entity, oldStats, entityApi, codexApi);
  } catch (error) {
    // A cosmetic failure must not report a committed reset as a failed item use.
    console.warn('Entity reset: affichage a rafraichir.', error);
  }
  if (typeof window !== 'undefined') {
    const detail = { source: 'entity-reset', entityId: entity.id, entite: entity, ...result };
    if (inArmyA) window.dispatchEvent(new CustomEvent('selectedArmyAUpdated', { detail }));
    window.dispatchEvent(new CustomEvent('entityProgressionReset', { detail }));
  }
  return result;
}

// Progression : experience, niveaux, previsions et confirmation.
export {
  CLASS_INDEX,
  DEFAULT_CYCLE,
  getArchetypeMilestones,
  getClassFromAttributs,
  getClassLabel,
  getCycleForKey,
  getCycleLenFor,
  resolveMutation,
};

export let playerExperience = getAvailablePlayerExperience();

export function setPlayerExperience(value) {
  const numericValue = Number(value);
  const next = Number.isFinite(numericValue) ? Math.max(0, Math.floor(numericValue)) : 0;
  const delta = next - getAvailablePlayerExperience();
  if (delta >= 0) creditPlayerExperience(delta);
  else spendPlayerExperience(-delta);
  playerExperience = getAvailablePlayerExperience();
  updateExperienceDisplay();
  return playerExperience;
}

for (const event of ['adminModeChanged', 'playerWalletChanged', 'playerExperienceUpdated']) {
  window.addEventListener(event, () => {
    playerExperience = getAvailablePlayerExperience();
    updateExperienceDisplay();
  });
}

export const attributS = [
  { label: "Force",         key: "strength",     short: "F" },
  { label: "Agilite",       key: "agility",      short: "A" },
  { label: "Intelligence",  key: "intelligence", short: "I" },
];
export const attribut_SHORT_TO_NAME = { F: 'force', A: 'agilite', I: 'intelligence' };
const KEY_TO_attributNAME    = { strength: 'force', agility: 'agilite', intelligence: 'intelligence' };
const whiteBarTimers = new Map(); // pour suivre les timers par barre

const GENERATED_UMBRA_TARGET_KEYS = getGeneratedUmbraTargetKeys();
const PREVIEW_GENERATED_ONLY_KEYS = new Set([
  "HP",
  "armor",
  "extraLife",
  ...GENERATED_UMBRA_TARGET_KEYS,
  "speed",
  "charge",
  "weaponOrfevre",
  "weaponCollector",
  "bloodThirsty",
  "marathon",
  "trailer",
  "weight",
  "dayHpRegen",
]);

function cloneLevelUpPlainData(value, fallback = null) {
  if (value === undefined) return fallback;

  const seen = new WeakSet();

  try {
    const json = JSON.stringify(value, (_key, val) => {
      if (typeof val === "function" || typeof val === "symbol") return undefined;

      if (val && typeof val === "object") {
        if (typeof Node !== "undefined" && val instanceof Node) return undefined;
        if (seen.has(val)) return undefined;
        seen.add(val);
      }

      return val;
    });

    return json == null ? fallback : JSON.parse(json);
  } catch (_) {
    // Certains objets vivants du jeu peuvent embarquer du DOM. Pour les
    // snapshots internes, on tente tout de même une copie native en repli.
  }

  try {
    return structuredClone(value);
  } catch (_) {
    return fallback;
  }
}

function getLevelUpEntityId(value) {
  const id = value && typeof value === "object" ? value.id : value;
  return id == null ? "" : String(id);
}

function isSameLevelUpEntityId(a, b) {
  const left = getLevelUpEntityId(a);
  const right = getLevelUpEntityId(b);
  return !!left && !!right && left === right;
}

function upsertLevelUpEntityById(list, entity) {
  if (!Array.isArray(list) || !entity) return -1;

  const entityId = getLevelUpEntityId(entity);
  if (!entityId) return -1;

  let targetIndex = list.findIndex(entry => isSameLevelUpEntityId(entry, entity));

  if (targetIndex === -1) {
    list.push(entity);
    targetIndex = list.length - 1;
  } else {
    list[targetIndex] = entity;
  }

  for (let i = list.length - 1; i >= 0; i--) {
    if (i === targetIndex || getLevelUpEntityId(list[i]) !== entityId) continue;
    list.splice(i, 1);
    if (i < targetIndex) targetIndex -= 1;
  }

  return targetIndex;
}

function syncLevelUpArrayInPlace(target, source) {
  if (!Array.isArray(target) || !Array.isArray(source)) return;
  target.splice(0, target.length, ...source.map(entry => cloneLevelUpPlainData(entry, entry)));
}

function syncLevelUpEntityObject(target, source) {
  if (!target || !source || target === source) return;

  Object.keys(target).forEach(key => {
    if (!(key in source)) delete target[key];
  });
  Object.assign(target, cloneLevelUpPlainData(source, source));
}

function syncLevelUpEntityInPool(pool, entity) {
  if (!Array.isArray(pool) || !entity) return false;

  const idx = pool.findIndex(entry => isSameLevelUpEntityId(entry, entity));
  if (idx === -1) return false;

  syncLevelUpEntityObject(pool[idx], entity);
  return true;
}

function persistConfirmedLevelUpEntity(entite) {
  if (!entite?.id) return;

  let selectedArmy = [];
  try {
    const rawArmy = JSON.parse(localStorage.getItem("selectedArmyA") || "[]");
    selectedArmy = Array.isArray(rawArmy) ? rawArmy : [];
  } catch (_) {
    selectedArmy = [];
  }

  const storedEntite = cloneLevelUpPlainData(entite, entite);
  if (storedEntite?.level && typeof storedEntite.level === "object") {
    storedEntite.level.current = getEntityLevelCurrent(entite);
  }
  upsertLevelUpEntityById(selectedArmy, storedEntite);

  saveToLocalStorage("selectedArmyA", selectedArmy);

  if (typeof window !== "undefined") {
    if (Array.isArray(window.selectedArmyA)) {
      syncLevelUpArrayInPlace(window.selectedArmyA, selectedArmy);
    } else {
      window.selectedArmyA = selectedArmy.map(entry => cloneLevelUpPlainData(entry, entry));
    }

    syncLevelUpEntityInPool(window.entites, storedEntite);
    syncLevelUpEntityInPool(window.selectedArmyB, storedEntite);

    window.dispatchEvent(new CustomEvent("selectedArmyAUpdated", {
      detail: {
        source: "level-up",
        entityId: storedEntite.id,
        entite: storedEntite
      }
    }));
  }

  syncLevelUpEntityInPool(entites, storedEntite);
}

function markConfirmedLevelUpMeta(entite, targetLevel) {
  if (!entite) return;

  entite.modifierStats ??= {};
  entite.modifierStats.durable ??= {};

  const durable = entite.modifierStats.durable;
  const previousMeta = durable.levelUpMeta || {};
  const reverseMeta = durable.archetypeMeta || {};
  const confirmedLevel =
    Number(targetLevel ?? getEntityLevelCurrent(entite)) ||
    getEntityLevelCurrent(entite);
  const reverseBaseLevel =
    Number(
      reverseMeta.level ??
      reverseMeta.requestedLevel ??
      previousMeta.reverseBaseLevel ??
      0
    ) || 0;

  durable.levelUpMeta = {
    ...previousMeta,
    source: "manualLevelUp",
    confirmedLevel,
    reverseBaseLevel,
  };
}

function getFallbackMaxLevel() {
  // Fallback global si l'entité n'a pas encore son .max dédié
  if (typeof MAX_LEVEL === 'number') return MAX_LEVEL;
  if (Array.isArray(levelDetails) && levelDetails.length) {
    return Math.max(...levelDetails.map(l => l.level || 0));
  }
  return 100; // dernier filet de sécurité
}

// Acces au niveau : les regles communes vivent dans entities/rules.js.
export function ensureEntityLevelObject(entite) {
  return ensureCoreEntityLevelObject(entite, { maxLevel: getFallbackMaxLevel() });
}

export function getEntityLevelCurrent(entite) {
  if (!entite) return 1;
  ensureEntityLevelObject(entite);
  return entite.level.current;
}

export function getEntityLevelMax(entite) {
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

// Achat direct de niveaux : cout, application et notification du solde.

function levelUpWithXP(entite, xpCost) {
    playerExperience = getAvailablePlayerExperience();
    if (playerExperience >= xpCost) {
        // Retrancher l'XP du joueur
        const payment = spendPlayerExperience(xpCost);
        if (!payment) return;
        entite.adminExperienceSpent = (Number(entite.adminExperienceSpent) || 0) + payment.admin;
        playerExperience = getAvailablePlayerExperience();

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

        recordEntityProgression(entite, { experienceSpent: xpCost });
        // Sauvegarde dans selectedArmyA
        const enrichedArmyA = JSON.parse(localStorage.getItem('selectedArmyA')) || [];
        const index = enrichedArmyA.findIndex(e => e.id === entite.id);
        if (index !== -1) {
            enrichedArmyA[index] = entite;
            localStorage.setItem('selectedArmyA', JSON.stringify(enrichedArmyA));
        }

        // Sauvegarder l'XP joueur
        console.log(`Experience restante du joueur : ${playerExperience}`);

        updateExperienceDisplay();
    } else {
        console.warn("Pas assez d'Experience pour augmenter le niveau !");
    }
}

export function buildCostMap(levelDetails) {
  const map = new Map();
  for (const l of levelDetails) map.set(l.level, l.cost);
  return map;
}
export function costAt(costMap, level) { return costMap.get(level) ?? null; }



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
    const key = normalizeStatKey(k);
    if (!key) continue;

    if (isObjStat(v)) {
      target[key] = addObj(target[key], v);      // ✅ HP current/max
    } else {
      target[key] = Number(target[key] ?? 0) + Number(v ?? 0);
    }
  }
}

export function getPermStats(entite) {
  // stats = déjà durable + dérivées (HP incluse)
  return entite?.stats || {};
}

export function getPreviewStats(entite) {
  // preview.total = stats + preview.statLeveled + preview.generated
  return entite?.modifierStats?.preview?.total || getPermStats(entite);
}

function ensurePreviewGenerated(entite) {
  entite.modifierStats ??= {};
  entite.modifierStats.preview ??= { statLeveled: {} };
  entite.modifierStats.preview.statLeveled ??= {};
  entite.modifierStats.preview.generated ??= {};
  return entite.modifierStats.preview.generated;
}

function isZeroPreviewDelta(value) {
  if (isObjStat(value)) {
    return (
      Number(value.current ?? 0) === 0 &&
      Number(value.max ?? 0) === 0
    );
  }

  if (value && typeof value === "object") {
    return (
      Number(value.flat ?? 0) === 0 &&
      Number(value.percent ?? 0) === 0
    );
  }

  return Number(value ?? 0) === 0;
}

function normalizeFlatPercentDelta(value) {
  if (typeof value === "number") {
    return {
      flat: Number(value) || 0,
      percent: 0,
    };
  }

  return {
    flat: Number(value?.flat ?? 0) || 0,
    percent: Number(value?.percent ?? 0) || 0,
  };
}

function setPreviewGeneratedStat(entite, key, value) {
  key = normalizeStatKey(key);
  if (!entite || !key) return;

  const generated = ensurePreviewGenerated(entite);

  if (isZeroPreviewDelta(value)) {
    delete generated[key];
    return;
  }

  generated[key] = isObjStat(value)
    ? normObj(value)
    : value && typeof value === "object"
      ? normalizeFlatPercentDelta(value)
      : Number(value ?? 0);
}

function addPreviewGeneratedStat(entite, key, value) {
  key = normalizeStatKey(key);
  if (!entite || !key || isZeroPreviewDelta(value)) return;

  const generated = ensurePreviewGenerated(entite);
  const current = generated[key];
  let next;

  if (isObjStat(current) || isObjStat(value)) {
    next = addObj(current, value);
  } else if (
    (current && typeof current === "object") ||
    (value && typeof value === "object")
  ) {
    const a = normalizeFlatPercentDelta(current);
    const b = normalizeFlatPercentDelta(value);
    next = {
      flat: a.flat + b.flat,
      percent: a.percent + b.percent,
    };
  } else {
    next = (Number(current ?? 0) || 0) + (Number(value ?? 0) || 0);
  }

  setPreviewGeneratedStat(entite, key, next);
}

function clearPreviewGeneratedStat(entite, key) {
  key = normalizeStatKey(key);
  const generated = entite?.modifierStats?.preview?.generated;
  if (!generated || !key) return;
  delete generated[key];
}

function clearPreviewGeneratedStats(entite) {
  if (!entite?.modifierStats?.preview) return;
  entite.modifierStats.preview.generated = {};
}

function removeGeneratedStatsFromPreviewLeveled(entite) {
  const statLeveled = entite?.modifierStats?.preview?.statLeveled;
  if (!statLeveled) return;

  normalizeStatModifierMapInPlace(statLeveled);

  for (const key of PREVIEW_GENERATED_ONLY_KEYS) {
    if (STAT_SYSTEM_ORIGINS[key]) continue;
    delete statLeveled[key];
  }
}

function applyPreviewDelta(target, key, delta) {
  key = normalizeStatKey(key);
  if (!target || !key) return;

  if (key === "shift") {
    const rawDelta = isObjStat(delta)
      ? Number(delta.max ?? delta.current ?? 0)
      : Number(delta ?? 0);
    const shift = isObjStat(target.shift)
      ? normObj(target.shift)
      : normObj(Number(target.shift ?? 0) || 0);

    target.shift = {
      current: Math.max(0, shift.current + rawDelta),
      max: Math.max(0, shift.max + rawDelta),
    };
    return;
  }

  if (isObjStat(delta)) {
    target[key] = addObj(target[key], delta);
    return;
  }

  if (delta && typeof delta === "object") {
    const flat = Number(delta.flat ?? 0) || 0;
    const percent = Number(delta.percent ?? 0) || 0;
    const baseValue = Number(target[key] ?? 0) || 0;
    const afterFlat = baseValue + flat;
    target[key] = percent
      ? afterFlat * (1 + percent / 100)
      : afterFlat;
    return;
  }

  target[key] =
    Number(target[key] ?? 0) +
    Number(delta ?? 0);
}

function applyPreviewDeltaSet(target, deltas = {}, { skip = new Set() } = {}) {
  normalizeStatModifierMapInPlace(deltas);
  for (const [key, delta] of Object.entries(deltas || {})) {
    if (skip.has(key)) continue;
    applyPreviewDelta(target, key, delta);
  }
}

function isEntityAwakened(entite) {
  return !!(
    entite?.Archetype?.current &&
    entite.Archetype.current.key &&
    entite.Archetype.current.key !== "egare"
  );
}

export function isObjStat(v) {
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

export function getConfirmedStatValue(entite, key, fallback = 0) {
  const value = entite?.stats?.[key] ?? entite?.baseStats?.[key] ?? fallback;
  if (value && typeof value === "object") {
    return Number(value.max ?? value.current ?? fallback) || 0;
  }

  return Number(value ?? fallback) || 0;
}

export function getLevelUpAttributes(entite, includePreview = false) {
  const source = includePreview ? entite : {
    ...entite,
    modifierStats: { ...entite.modifierStats, preview: null },
  };
  return Object.fromEntries(['strength', 'agility', 'intelligence']
    .map(key => [key, Number(getSafe(source, key, 0)) || 0]));
}

function applyCurrentPoolDelta(entite, key, delta) {
  const currentDelta = Number(delta?.current ?? 0) || 0;
  if (!currentDelta || !entite?.stats?.[key] || typeof entite.stats[key] !== "object") {
    return;
  }

  const pool = entite.stats[key];
  const max = Number(pool.max ?? 0) || 0;
  pool.current = Math.max(
    0,
    Math.min(max, (Number(pool.current ?? 0) || 0) + currentDelta)
  );
}

function applyConfirmedGeneratedPoolDeltas(entite, generated = {}) {
  grantEntityRobustnessArmor(entite, generated.armor?.current);
  applyCurrentPoolDelta(entite, "extraLife", generated.extraLife);
}
function getMaxHPValue(entite) {
  const hp = entite?.stats?.HP ?? entite?.baseStats?.HP;
  if (hp && typeof hp === "object") return Number(hp.max ?? 0) || 0;
  return Number(hp ?? 0) || 0;
}

function syncPreviewHPFromVitality(entite) {
  const preview = entite?.modifierStats?.preview;
  if (!preview?.statLeveled) return;
  if (!entite?.stats?.HP || typeof entite.stats.HP !== "object") return;

  const generated = ensurePreviewGenerated(entite);
  delete preview.statLeveled.HP;

  const baseVit = getConfirmedStatValue(entite, "vitality", 0);       // baseline (sans preview)
  const dv = Number(preview.statLeveled.vitality ?? 0);               // delta preview
  const deltaHP = calculateVitalityBonus(baseVit + dv) - calculateVitalityBonus(baseVit);

  if (!dv || deltaHP === 0) {
    delete generated.HP;
    delete preview.meta?.derived?.hpFromVitality;
    return;
  }

  generated.HP = { current: deltaHP, max: deltaHP };
  preview.meta ??= {};
  preview.meta.derived ??= {};
  preview.meta.derived.hpFromVitality = true;
}
function syncPreviewArmorFromRobustness(entite) {
  const preview = entite?.modifierStats?.preview;
  if (!preview?.statLeveled) return;

  const generated = ensurePreviewGenerated(entite);
  delete preview.statLeveled.armor;

  // base = stats durables déjà calculées (comme pour HP)
  const baseRob = getConfirmedStatValue(entite, "robustness", 0);
  const dr = Number(preview.statLeveled.robustness ?? 0);
  const baseStrength = getConfirmedStatValue(entite, "strength", 0);
  const ds = Number(preview.statLeveled.strength ?? 0);

  const deltaArmor =
    calculateRobustnessBonus(baseRob + dr, baseStrength + ds, globalThis.umbraProgression.getUmbraThreshold(entite)) - calculateRobustnessBonus(baseRob, baseStrength, globalThis.umbraProgression.getUmbraThreshold(entite));

  if (deltaArmor === 0) {
    delete generated.armor;
    delete preview.meta?.derived?.armorFromRobustness;
    return;
  }

  generated.armor = { current: deltaArmor, max: deltaArmor };
  preview.meta ??= {};
  preview.meta.derived ??= {};
  preview.meta.derived.armorFromRobustness = true;
}
function syncPreviewSpeedFromVelocity(entite) {
  const preview = entite?.modifierStats?.preview;
  if (!preview?.statLeveled) return;

  const generated = ensurePreviewGenerated(entite);
  delete preview.statLeveled.speed;

  const dv = Number(preview.statLeveled.velocity ?? 0) || 0;

  preview.meta ??= {};
  preview.meta.derived ??= {};

  if (!dv) {
    delete generated.speed;
    delete preview.meta.derived.speedFromVelocity;
    return;
  }

  // baseSpeed = vitesse "de référence" avant réduction vel
  const baseSpeed = Number(entite?.baseStats?.speed ?? 1000) || 0;

  // vel permanente (déjà durable), sans preview
  const baseVel = getConfirmedStatValue(entite, "velocity", 0);

  // oldAdjusted = la speed actuelle (déjà réduite) => fiable et évite les dérives
  const oldAdjusted = getConfirmedStatValue(entite, "speed", baseSpeed) || baseSpeed;

  const newAdjusted =
    (baseSpeed > 0 && (baseVel + dv) > 0)
      ? calculateVelocityReduction(baseVel + dv, baseSpeed).adjustedSpeed
      : baseSpeed;

  const delta = newAdjusted - oldAdjusted; // négatif = mieux

  if (!delta) {
    delete generated.speed;
    delete preview.meta.derived.speedFromVelocity;
    return;
  }

  generated.speed = delta;                         // float ms OK
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

function syncPreviewExtraLifeFromTranscendence(entite) {
  const preview = entite?.modifierStats?.preview;
  if (!preview?.statLeveled) return;

  const generated = ensurePreviewGenerated(entite);
  delete preview.statLeveled.extraLife;

  const baseTr = Number(entite.stats?.transcendence ?? 0);
  const dtr    = Number(preview.statLeveled.transcendence ?? 0);

  const beforeMax = calculateTranscendenceExtraLife(baseTr, globalThis.umbraProgression.getUmbraThreshold(entite));
  const afterMax  = calculateTranscendenceExtraLife(baseTr + dtr, globalThis.umbraProgression.getUmbraThreshold(entite));

  const deltaMax = afterMax - beforeMax;

  // ✅ DELTA current selon paliers (1er point => +1 current, puis tous les N max)
  const deltaCurrent = giveCurrentExtraLife(beforeMax, afterMax, EXTRA_LIFE_GIVEN_EVERY_MAX);

  // Rien à faire → on nettoie
  if (!dtr || (deltaMax === 0 && deltaCurrent === 0)) {
    delete generated.extraLife;
    delete preview.meta?.derived?.extraLifeFromTranscendence;
    return;
  }

  generated.extraLife = {
    current: deltaCurrent,
    max: deltaMax
  };
  preview.meta ??= {};
  preview.meta.derived ??= {};
  preview.meta.derived.extraLifeFromTranscendence = true;
}

function syncPreviewGeneratedDeltaFromTotals(entite, total, key, delta, metaKey) {
  const preview = entite?.modifierStats?.preview;
  if (!preview || !total) return;

  if (isZeroPreviewDelta(delta)) {
    if (!ensurePreviewGenerated(entite)[key]) {
      clearPreviewGeneratedStat(entite, key);
    }
    if (metaKey) delete preview.meta?.derived?.[metaKey];
    return;
  }

  addPreviewGeneratedStat(entite, key, delta);
  applyPreviewDelta(total, key, delta);

  if (metaKey) {
    preview.meta ??= {};
    preview.meta.derived ??= {};
    preview.meta.derived[metaKey] = true;
  }
}

function syncPreviewCoreDerivedFromTotals(entite, total) {
  const preview = entite?.modifierStats?.preview;
  if (!preview?.statLeveled || !total) return;

  delete preview.statLeveled.HP;
  delete preview.statLeveled.armor;
  delete preview.statLeveled.speed;
  delete preview.statLeveled.extraLife;

  const baseVit = getConfirmedStatValue(entite, "vitality", 0);
  const nextVit = Math.max(0, Number(total.vitality ?? baseVit) || 0);
  const deltaHP = calculateVitalityBonus(nextVit) - calculateVitalityBonus(baseVit);

  syncPreviewGeneratedDeltaFromTotals(
    entite,
    total,
    "HP",
    deltaHP
      ? {
          current: deltaHP > 0 ? deltaHP : 0,
          max: deltaHP,
        }
      : 0,
    "hpFromVitality"
  );

  const baseRob = getConfirmedStatValue(entite, "robustness", 0);
  const nextRob = Math.max(0, Number(total.robustness ?? baseRob) || 0);
  const baseStrength = getConfirmedStatValue(entite, "strength", 0);
  const nextStrength = Math.max(0, Number(total.strength ?? baseStrength) || 0);
  const deltaArmor = calculateRobustnessBonus(nextRob, nextStrength, globalThis.umbraProgression.getUmbraThreshold(entite)) - calculateRobustnessBonus(baseRob, baseStrength, globalThis.umbraProgression.getUmbraThreshold(entite));

  syncPreviewGeneratedDeltaFromTotals(
    entite,
    total,
    "armor",
    deltaArmor
      ? {
          current: deltaArmor > 0 ? deltaArmor : 0,
          max: deltaArmor,
        }
      : 0,
    "armorFromRobustness"
  );

  const baseTr = Math.max(0, getConfirmedStatValue(entite, "transcendence", 0));
  const nextTr = Math.max(0, Number(total.transcendence ?? baseTr) || 0);
  const beforeExtraMax = calculateTranscendenceExtraLife(baseTr, globalThis.umbraProgression.getUmbraThreshold(entite));
  const afterExtraMax = calculateTranscendenceExtraLife(nextTr, globalThis.umbraProgression.getUmbraThreshold(entite));
  const deltaExtraMax = afterExtraMax - beforeExtraMax;
  const deltaExtraCurrent = giveCurrentExtraLife(
    beforeExtraMax,
    afterExtraMax,
    EXTRA_LIFE_GIVEN_EVERY_MAX
  );

  syncPreviewGeneratedDeltaFromTotals(
    entite,
    total,
    "extraLife",
    (deltaExtraMax || deltaExtraCurrent)
      ? {
          current: deltaExtraCurrent,
          max: deltaExtraMax,
        }
      : 0,
    "extraLifeFromTranscendence"
  );

  const baseSpeed = Number(entite?.baseStats?.speed ?? 1000) || 0;
  const oldAdjusted = getConfirmedStatValue(entite, "speed", baseSpeed) || baseSpeed;
  const nextVel = Math.max(0, Number(total.velocity ?? 0) || 0);
  const newAdjusted =
    baseSpeed > 0 && nextVel > 0
      ? calculateVelocityReduction(nextVel, baseSpeed).adjustedSpeed
      : baseSpeed;
  const speedDelta = newAdjusted - oldAdjusted;

  syncPreviewGeneratedDeltaFromTotals(
    entite,
    total,
    "speed",
    speedDelta,
    "speedFromVelocity"
  );
}

function applyPreviewWeaponOrfevreStuffDelta(entite, total) {
  const preview = entite?.modifierStats?.preview;
  if (!preview || !total) return;

  const previewActivePercent = getWeaponOrfevrePreviewActivePercent(entite);
  const stuffDelta = getWeaponOrfevreStuffPreviewDelta(entite, previewActivePercent);
  const entries = Object.entries(stuffDelta);

  if (!entries.length) {
    delete preview.meta?.derived?.stuffWeaponOrfevre;
    return;
  }

  for (const [key, delta] of entries) {
    applyPreviewDelta(total, key, delta);
    addPreviewGeneratedStat(entite, key, delta);
  }

  preview.meta ??= {};
  preview.meta.derived ??= {};
  preview.meta.derived.stuffWeaponOrfevre = {
    activePercent: previewActivePercent,
    delta: stuffDelta,
  };
}

function getPreviewNumber(stats, key) {
  return Math.max(0, Number(stats?.[key] ?? 0) || 0);
}

function calculateGeneratedChargeFromStats(stats) {
  const weaponMastery = getPreviewNumber(stats, "weaponMastery");
  if (weaponMastery <= 0) return 0;

  return (
    Number(calculateWeaponMasteryCharge(null, weaponMastery) || 0) +
    Number(weaponMasteryChargeStrenghtRatioBonus(null, getPreviewNumber(stats, "strength")) || 0)
  );
}

function calculateGeneratedWeaponOrfevreFromStats(stats) {
  const weaponMastery = getPreviewNumber(stats, "weaponMastery");
  if (weaponMastery <= 0) return 0;

  return (
    Number(calculateWeaponOrfevreWeaponMastery(null, weaponMastery) || 0) +
    Number(calculateWeaponOrfevreStrength(null, getPreviewNumber(stats, "strength")) || 0)
  );
}

function calculateGeneratedWeaponCollectorFromStats(stats) {
  const weaponMastery = getPreviewNumber(stats, "weaponMastery");
  if (weaponMastery <= 0) return 0;

  return (
    Number(calculateWeaponMasteryTrophyChance(null, weaponMastery) || 0) +
    Number(calculateWeaponMasteryTrophyStrengthBonus(null, getPreviewNumber(stats, "strength")) || 0)
  );
}

function calculateGeneratedMarathonFromStats(stats) {
  return Number(calculateMovementMarathonChance({ stats }) || 0);
}

function calculateGeneratedTrailerFromStats(stats) {
  return Number(calculateMovementTrailerChance({ stats }) || 0);
}

function calculateGeneratedWeightFromStats(stats, entite) {
  return Number(calculateGeneratedWeight({ ...entite, stats }) || 0);
}

function calculateGeneratedUmbraTargetFromStats(stats, targetKey) {
  const generated = calculateGeneratedUmbraStats({ stats });
  return Number(generated?.[targetKey] || 0);
}

function sanitizeChargePreviewDelta(entite) {
  const previewStats = entite?.modifierStats?.preview?.statLeveled;
  if (!previewStats) return;

  normalizeStatModifierMapInPlace(previewStats);

  const chargeDelta = previewStats.charge;
  if (typeof chargeDelta === "number" && chargeDelta < 0) {
    delete previewStats.charge;
  }
}

function applyGeneratedStat(entite, total, key, calculator) {
  const currentStats = entite?.stats || {};
  const currentGenerated = Number(calculator(currentStats, entite) || 0);
  const nextGenerated = Number(calculator(total, entite) || 0);
  const currentFinal = Number(currentStats?.[key] ?? 0) || 0;
  const previewBeforeGeneratedDelta = Number(total?.[key] ?? currentFinal) || 0;
  const generatedDelta = nextGenerated - currentGenerated;
  const nextFinal = Math.max(0, previewBeforeGeneratedDelta + generatedDelta);

  if (nextFinal || currentFinal || previewBeforeGeneratedDelta) {
    total[key] = nextFinal;
  } else {
    delete total[key];
  }

  addPreviewGeneratedStat(entite, key, generatedDelta);
  return generatedDelta;
}

function syncPreviewShiftFromMovement(entite, total) {
  const oldMovement = Math.max(0, Math.round(Number(entite?.stats?.movement ?? 0) || 0));
  const newMovement = Math.max(0, Math.round(Number(total?.movement ?? 0) || 0));

  if (oldMovement === newMovement) return;

  const previewShift = total?.shift;
  const oldShift = entite?.stats?.shift;
  const shiftSource =
    previewShift && typeof previewShift === "object"
      ? previewShift
      : oldShift;
  const hasShift = shiftSource && typeof shiftSource === "object";
  const oldCurrent = hasShift
    ? Math.max(0, Math.round(Number(shiftSource.current) || 0))
    : 0;
  const oldMax = hasShift
    ? Math.max(0, Math.round(Number(shiftSource.max) || 0))
    : oldMovement;

  if (newMovement > 0) {
    const deltaMax = newMovement - oldMovement;
    const max = Math.max(0, oldMax + deltaMax);
    const current = Math.max(
      0,
      Math.min(oldCurrent + Math.max(0, deltaMax), max)
    );

    total.shift = { current, max };
    return;
  }

  total.shift = { current: 0, max: 1, baseDefault: true };
}

function applyGeneratedPreviewStats(entite, total) {
  const preview = entite?.modifierStats?.preview;
  if (!preview || !total) return;

  preview.meta ??= {};
  preview.meta.derived ??= {};

  const chargeDelta = applyGeneratedStat(
    entite,
    total,
    "charge",
    calculateGeneratedChargeFromStats
  );

  if (chargeDelta) {
    preview.meta.derived.chargeFromWeaponMastery = true;
    preview.meta.derived.chargeDelta = chargeDelta;
  } else {
    delete preview.meta.derived.chargeFromWeaponMastery;
    delete preview.meta.derived.chargeDelta;
  }

  applyGeneratedStat(
    entite,
    total,
    "weaponOrfevre",
    calculateGeneratedWeaponOrfevreFromStats
  );

  applyGeneratedStat(
    entite,
    total,
    "weaponCollector",
    calculateGeneratedWeaponCollectorFromStats
  );

  applyGeneratedStat(
    entite,
    total,
    "marathon",
    calculateGeneratedMarathonFromStats
  );

  applyGeneratedStat(
    entite,
    total,
    "trailer",
    calculateGeneratedTrailerFromStats
  );

  GENERATED_UMBRA_TARGET_KEYS.forEach((targetKey) => {
    if (targetKey === 'armor') return; // Handled by the existing current/max pool preview.
    applyGeneratedStat(
      entite,
      total,
      targetKey,
      (stats) => calculateGeneratedUmbraTargetFromStats(stats, targetKey)
    );
  });

  applyGeneratedStat(
    entite,
    total,
    "weight",
    calculateGeneratedWeightFromStats
  );

  syncPreviewShiftFromMovement(entite, total);
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

function computeHpBattleRegenFromTotals(entite, total, deltas) {
  const nativeHpBattleRegen = Math.max(0, getConfirmedStatValue(entite, "hpBattleRegen", 0));
  const permanentIndestructibility = Math.max(0, getConfirmedStatValue(entite, "indestructibility", 0));
  const previewIndestructibility = Math.max(0, Number(total?.indestructibility) || 0);
  const permanentStrength = Math.max(0, getConfirmedStatValue(entite, "strength", 0));
  const previewStrength = Math.max(0, Number(total?.strength) || 0);

  /*
   * On retire d'abord la génération permanente déjà incluse
   * dans entite.stats.hpBattleRegen.
   */
  const permanentGenerated = permanentIndestructibility > 0 ? Math.max(0, Number(calculateHpBattleRegenStrengthRatio({ ...entite, stats: { ...entite.stats, strength: permanentStrength, indestructibility: permanentIndestructibility } })) || 0) + Math.max(0, Number(calculateHpBattleRegenIndestructibilityRatio({ ...entite, stats: { ...entite.stats, strength: permanentStrength, indestructibility: permanentIndestructibility } })) || 0) : 0;
  const nativeOnly = Math.max(0, nativeHpBattleRegen - permanentGenerated);
  const previewEntity = { ...entite, stats: { ...total, strength: previewStrength, indestructibility: previewIndestructibility } };
  const previewGenerated = previewIndestructibility > 0 ? Math.max(0, Number(calculateHpBattleRegenStrengthRatio(previewEntity)) || 0) + Math.max(0, Number(calculateHpBattleRegenIndestructibilityRatio(previewEntity)) || 0) : 0;

  const directHpBattleRegenDelta = Math.max(
  0,
  Number(deltas?.hpBattleRegen) || 0
);

return Math.max(
  0,
  nativeOnly +
  directHpBattleRegenDelta +
  previewGenerated
);
}
export function ComputeStatPreview(entite) {
  if (!entite?.stats) return;

  entite.modifierStats ??= {};
  entite.modifierStats.preview ??= {
    statLeveled: {}
  };

  entite.modifierStats.preview.statLeveled ??= {};
  normalizeStatModifierMapInPlace(entite.modifierStats.preview.statLeveled);
  const sourceDeltas = Object.fromEntries(Object.entries(entite.modifierStats.preview.statLeveled)
    .filter(([key]) => STAT_SYSTEM_ORIGINS[key]));
  if (entite.modifierStats.preview.generated) {
    normalizeStatModifierMapInPlace(entite.modifierStats.preview.generated);
  }

  clearPreviewGeneratedStats(entite);
  removeGeneratedStatsFromPreviewLeveled(entite);
  sanitizeChargePreviewDelta(entite);

  const base = entite.stats;
  const deltas =
    entite.modifierStats.preview.statLeveled || {};

  const total = {};

  // 2) Copie des stats permanentes.
  for (const [k, v] of Object.entries(base)) {
    total[k] = isObjStat(v)
      ? normObj(v)
      : v;
  }

  // 3) Application des deltas de level-up.
  applyPreviewDeltaSet(total, deltas, { skip: PREVIEW_GENERATED_ONLY_KEYS });

  // 4) Écart de stuff boosté si Orfèvre change dans l'aperçu.
  applyPreviewWeaponOrfevreStuffDelta(entite, total);
  const directingInputs = getStatSystemInputs(entite);
  for (const key of getPointLimitedStatKeys()) if (Object.hasOwn(directingInputs, key)) total[key] = directingInputs[key];

  // 5) Dérivés classiques recalculés depuis les totaux déjà prévisualisés.
  syncPreviewCoreDerivedFromTotals(entite, total);

  // 6) Régénération journalière avec les valeurs preview.
  const dayHpRegenBeforeGenerated = Number(total.dayHpRegen ?? 0) || 0;
  total.dayHpRegen =
    computeDayHpRegenFromTotals(
      entite,
      total,
      deltas
    );
  const dayHpRegenGeneratedDelta =
    (Number(total.dayHpRegen ?? 0) || 0) -
    dayHpRegenBeforeGenerated;

  addPreviewGeneratedStat(entite, "dayHpRegen", dayHpRegenGeneratedDelta);

  // 7) Régénération de combat avec strength et indestructibility preview.
  const previewHpBattleRegen =
    computeHpBattleRegenFromTotals(
      entite,
      total,
      deltas
    );

  if (previewHpBattleRegen > 0) {
    total.hpBattleRegen =
      previewHpBattleRegen;
  } else {
    delete total.hpBattleRegen;
  }

  // 8) Dérivés complets identiques au recalcul final, mais seulement dans l'aperçu.
  applyGeneratedPreviewStats(entite, total);
  Object.assign(entite.modifierStats.preview.statLeveled, sourceDeltas);
  applyStatSystemTotals(entite, total, getStatSystemInputs(entite));

  if (total.shift) {
    total.shift.current = Number(base.shift?.current || 0)
      - getEquipmentResourceCurrent(entite, 'shift')
      + getEquipmentResourceCurrent(entite, 'shift', getWeaponOrfevrePreviewActivePercent(entite));
  }

  if (total.HP && typeof total.HP === 'object') {
    total.HP.max = Math.max(1, Math.round(Number(total.HP.max) || 1));
    total.HP.current = rescaleHPCurrent(base.HP, total.HP.max);
    const generatedHP = entite.modifierStats.preview.generated?.HP;
    if (generatedHP && typeof generatedHP === 'object') {
      generatedHP.current = total.HP.current - base.HP.current;
    }
  }

  entite.modifierStats.preview.total = total;

  return total;
}


// Sauvegarde de la progression confirmee et de ses archetypes.
export function saveEntityLevelUP(entite, state, payment) {
  const completedBefore = countCompletedArchetypes(entite);
  const experienceSpent = Math.max(0, Number(state.xpBaseline ?? playerExperience) - (Number(state.tempXP) || 0));
  if (!payment) return false;
  entite.adminExperienceSpent = (Number(entite.adminExperienceSpent) || 0) + payment.admin;
  const hasManualArchetypeStep = (entry) => {
    if (!entry || !entry.key) return false;
    const step = Number(entry.step ?? entry.stage ?? 0) || 0;
    if (step > 0) return true;
    return Array.isArray(entry.milestone) && entry.milestone.some(Boolean);
  };

  const toStoredArchetypeEntry = (key, val) => {
    const step = Number(val.step ?? val.stage ?? 0) || 0;
    const milestonesArr = Array.isArray(val.milestone)
      ? val.milestone.slice(0, step)
      : Array.isArray(val.milestones)
        ? val.milestones.slice(0, step)
        : [];

    return {
      key: String(key ?? val.key ?? "").toLowerCase(),
      level: Number(val.level ?? 1) || 1,
      step,
      uid: val.uid || getArchetypeUID(),
      milestone: milestonesArr
    };
  };

  // 1️⃣ Appliquer les valeurs confirmées côté entité
  const maxLevelForEntity = getEntityLevelMax(entite);
  const targetLevel = Math.min(state.tempLevel, maxLevelForEntity);
  setEntityLevelCurrent(entite, targetLevel);
  entite.experience = Math.max(0, Number(entite.experience) || 0) +
    experienceSpent;
  playerExperience = getAvailablePlayerExperience();

  const confirmedStats = {
    strength: Number(state.stats?.strength ?? entite.stats?.strength ?? entite.baseStats?.strength ?? 0) || 0,
    agility: Number(state.stats?.agility ?? entite.stats?.agility ?? entite.baseStats?.agility ?? 0) || 0,
    intelligence: Number(state.stats?.intelligence ?? entite.stats?.intelligence ?? entite.baseStats?.intelligence ?? 0) || 0,
  };

  // 2️⃣ Classe réelle dérivée des attributs (en tenant compte de l'éveil)
  const currentLevel = getEntityLevelCurrent(entite);
  const realKey = String(
    getClassFromAttributs(
      confirmedStats.strength,
      confirmedStats.agility,
      confirmedStats.intelligence,
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

    const storedSnap = { key, level, step, uid, milestone: milestoneArr };
    if (!hasManualArchetypeStep(storedSnap)) return;

    let existing = achieve.find(a => a.key === key && a.level === level);
    if (!existing) {
      achieve.push(storedSnap);
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

  achieve = achieve
    .filter(hasManualArchetypeStep)
    .map(entry => toStoredArchetypeEntry(entry.key, entry));

  // 5️⃣ Construction d’inProgress : uniquement les archétypes ayant reçu
  // au moins un point manuel de level-up. Un basculement par stuff reste
  // visible en current, mais ne crée pas d'historique gratuit.
  let inProgress = Object.entries(state.archetypeProgress)
    .map(([key, val]) => toStoredArchetypeEntry(key, val))
    .filter(hasManualArchetypeStep);

  // current = archetype actif
  const current = toStoredArchetypeEntry(activeName, ap);

  // Si current a vraiment reçu un point, il appartient aussi à l'historique.
  // Sinon il reste un état effectif pur, typiquement obtenu par équipement.
  if (hasManualArchetypeStep(current)) {
    const idxCurrent = inProgress.findIndex(e =>
      e.key === current.key &&
      e.level === current.level
    );
    if (idxCurrent === -1) {
      inProgress.push({ ...current });
    } else {
      inProgress[idxCurrent] = { ...current };
    }
  }

  // 7️⃣ Affectation finale sur l’entité
  entite.Archetype = { current, inProgress, achieve };

  // 8️⃣ Nettoyage ancien format
  delete entite.archetype;
  delete entite.currentArchetype;
  delete entite.archetypeKey;

  // 9️⃣ Recalcul complet des stats définitives
  markConfirmedLevelUpMeta(entite, targetLevel);
  recomputeEntityStats(entite, { skipReverseArchetype: true });
  setEntityLevelCurrent(entite, targetLevel);
  markConfirmedLevelUpMeta(entite, getEntityLevelCurrent(entite));
  syncEntityLinkedEssenceInventory(entite);

  // 🔟 Sauvegarde locale + synchro des copies vivantes
  recordEntityProgression(entite, { experienceSpent, completedBefore });
  persistConfirmedLevelUpEntity(entite);

  // 1️⃣1️⃣ Réinitialisation de l’état temporaire
 if (state.touchedArchetypes?.clear) state.touchedArchetypes.clear();
  state.history    = [];
  state.investedXP = 0;
  state.tempLevel  = getEntityLevelCurrent(entite);

  state.awakened = entite.archetypeFrozen !== true && !!(
    entite.Archetype?.current &&
    entite.Archetype.current.key &&
    entite.Archetype.current.key !== "egare"
  );

  state.egareCycleSnapshot = null;

  if (entite.modifierStats?.preview) {
    entite.modifierStats.preview.statLeveled = {};
  }
}



// Etat temporaire de la montee de niveau et instantanes de sauvegarde.
export function createLevelUpDraft(entite, availableExperience = playerExperience) {
  const alreadyAwakened =
    !!(entite?.Archetype?.current &&
       entite.Archetype.current.key &&
       entite.Archetype.current.key !== "egare");

  const initialLevel = getEntityLevelCurrent(entite);

  const state = {
    currentEntity: entite,
    tempLevel: initialLevel,
    tempXP: availableExperience,
    investedXP: 0,
    history: [],
    archetypeProgress: initArchetypeProgress(entite),
    touchedArchetypes: new Set(),
    stats: getLevelUpAttributes(entite),
    investmentCounters: { force: 0, agilite: 0, intelligence: 0 },
    subHistory: { force: [], agilite: [], intelligence: [] },
    xpBaseline: availableExperience,
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
  return state;
}

function cloneLevelUpArray(array) {
  return Array.isArray(array)
    ? array.map(entry => cloneLevelUpPlainData(entry, entry)).filter(Boolean)
    : [];
}

export function snapshotLevelUpSaveState(state) {
  const touchedArchetypes = state?.touchedArchetypes instanceof Set
    ? new Set(Array.from(state.touchedArchetypes))
    : new Set();

  return {
    tempLevel: Number(state?.tempLevel ?? 1) || 1,
    xpBaseline: Number(state?.xpBaseline ?? playerExperience) || 0,
    tempXP: Number(state?.tempXP ?? playerExperience) || 0,
    investedXP: Number(state?.investedXP ?? 0) || 0,
    stats: cloneLevelUpPlainData(state?.stats, {}),
    archetypeProgress: cloneLevelUpPlainData(state?.archetypeProgress, {}),
    touchedArchetypes,
    awakened: !!state?.awakened,
    egareCycleSnapshot: cloneLevelUpPlainData(state?.egareCycleSnapshot, null),
    achievedArchetypes: cloneLevelUpArray(state?.achievedArchetypes),
    history: cloneLevelUpArray(state?.history),
    investmentCounters: cloneLevelUpPlainData(state?.investmentCounters, {
      force: 0,
      agilite: 0,
      intelligence: 0
    }),
    subHistory: cloneLevelUpPlainData(state?.subHistory, {
      force: [],
      agilite: [],
      intelligence: []
    })
  };
}

export function refreshLevelUpStateAfterSave(state, entite) {
  if (!state || !entite) return;

  state.archetypeProgress = initArchetypeProgress(entite);
  state.achievedArchetypes = Array.isArray(entite.Archetype?.achieve)
    ? entite.Archetype.achieve.map(a => ({
        key: String(a.key || "").toLowerCase(),
        level: a.level ?? 1,
        step: a.step ?? a.stage ?? 0,
        uid: a.uid || getArchetypeUID(),
        milestone: Array.isArray(a.milestone) ? [...a.milestone] : []
      }))
    : [];

  state.history = [];
  state.investedXP = 0;
  state.tempXP = playerExperience;
  state.xpBaseline = playerExperience;
  state.tempLevel = getEntityLevelCurrent(entite);
  state.stats = getLevelUpAttributes(entite);
  state.investmentCounters = { force: 0, agilite: 0, intelligence: 0 };
  state.subHistory = { force: [], agilite: [], intelligence: [] };
  state.egareCycleSnapshot = null;
  state.awakened = entite.archetypeFrozen !== true && !!(
    entite.Archetype?.current &&
    entite.Archetype.current.key &&
    entite.Archetype.current.key !== "egare"
  );

  if (state.touchedArchetypes?.clear) state.touchedArchetypes.clear();
}

// Investissement et annulation : couts, points et preconditions.
export function prepareLevelUpInvestment(state, costMap) {
  const entite = state.currentEntity;
  if (!entite) return;

  if (state.lockArchetype) {
    console.warn("[invest] Transition d'archétype en cours — investissement ignoré.");
    return;
  }

  const entityMaxLevel = getEntityLevelMax(entite);
  const baseLevel = getEntityLevelCurrent(entite);

  if (state.tempLevel >= entityMaxLevel || baseLevel >= entityMaxLevel) {
    console.warn(`[invest] Niveau maximum (${entityMaxLevel}) atteint — montée impossible.`);
    return;
  }

  // archetype AVANT l’investissement
  const prevKey = getActiveLevelUpArchetypeKey(state, entite);

  const nextLevel = state.tempLevel + 1;
  if (nextLevel > entityMaxLevel) {
    console.warn(`[invest] Tentative de dépasser le niveau max (${entityMaxLevel}).`);
    return;
  }

  const c = costAt(costMap, nextLevel);
  if (c == null || state.tempXP < c) return;


  // 🧮 on regarde si on est sur le DERNIER step d’Égaré avant éveil
  const egareCycleLen = getCycleLenFor('egare', entite);
  const egareProg = state.archetypeProgress['egare'] || { level: 1, stage: 0 };
  const willFinishEgareCycle =
    entite.archetypeFrozen !== true &&
    !state.awakened &&
    egareCycleLen > 0 &&
    egareProg.stage + 1 === egareCycleLen;

  return { entite, prevKey, nextLevel, cost: c, willFinishEgareCycle };
}

export function applyLevelUpInvestmentCost(state, c, nextLevel) {
  state.tempXP     -= c;
  state.investedXP += c;
  state.tempLevel   = nextLevel;
}

export function addLevelUpPreviewStat(entite, statKey, amount = 1) {
  statKey = normalizeStatKey(statKey);
  if (!entite || !statKey) return;

  entite.modifierStats ??= {};
  entite.modifierStats.preview ??= {
    statLeveled: {}
  };
  entite.modifierStats.preview.statLeveled ??= {};

  const currentValue =
    Number(
      entite.modifierStats.preview.statLeveled[statKey]
    ) || 0;

  const nextValue =
    currentValue +
    (Number(amount) || 0);

  if (nextValue !== 0) {
    entite.modifierStats.preview.statLeveled[statKey] =
      nextValue;
  } else {
    delete entite.modifierStats.preview.statLeveled[statKey];
  }

  return statKey;
}

export function removeLevelUpPreviewStat(entite, statKey, amount = 1) {
  statKey = normalizeStatKey(statKey);
  if (!entite || !statKey) return;

  const statLeveled =
    entite?.modifierStats?.preview?.statLeveled;

  if (!statLeveled) return;

  const currentValue =
    Number(statLeveled[statKey]) || 0;

  const nextValue =
    currentValue -
    Math.max(0, Number(amount) || 0);

  if (nextValue > 0) {
    statLeveled[statKey] = nextValue;
  } else {
    delete statLeveled[statKey];
  }

  return statKey;
}

export function refundLevelUpInvestmentCost(state, c) {
  state.tempLevel  -= 1;
  state.tempXP     += c;
  state.investedXP -= c;
}

// Progression des archetypes et attribution des recompenses.
export function getActiveLevelUpArchetypeKey(state, entite, levelOverride = null, statsOverride = null) {
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

export function getSkippedLevelUpArchetypeStage(state, classKey, entite, reason = "skipped") {
  const name = String(classKey || "").toLowerCase();
  const current = state.archetypeProgress[name] || { level: 1, stage: 0 };
  const level = Number(current.level ?? 1) || 1;
  const stage = Number(current.stage ?? 0) || 0;

  return {
    classKey: name,
    level,
    stage,
    cycleName: null,
    appliedStage: 0,
    cycleLen: getCycleLenFor(name, entite) || 0,
    prevLevel: level,
    prevStage: stage,
    skipped: true,
    reason
  };
}

export function advanceLevelUpArchetypeStage(state, classKey, entite) {
  const name  = String(classKey || "").toLowerCase();
  const cycle = getCycleForKey(name, entite);

  if (state.lockArchetype) {
    return getSkippedLevelUpArchetypeStage(state, name, entite, "locked");
  }

  // 🛑 Aucun cycle : on ne fait rien
  if (!cycle) {
    return getSkippedLevelUpArchetypeStage(state, name, entite, "no-cycle");
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

  return {
    completed: true,
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

export function resolveLevelUpReward(state, short, nextKey, info) {
  const entite = state.currentEntity;
  let { level, stage, cycleName, appliedStage, cycleLen: cycleLenAfter, skipped } = info;
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

    return { pickKey, attributName, stageName };
  }
  return { pickKey, attributName: null, stageName: null };
}

export function restoreLevelUpArchetypeStage(state, last) {
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

}

// Application de l'eveil et confirmation des choix avant leur sauvegarde.
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

  // Le cycle complet, dernier attribut inclus, sera sauvegarde depuis state.

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

  // confirmLevelUp persiste ensemble niveaux, XP, statistiques et archetype.
}

export function completeLevelUpArchetypeCycle(state, entite, name, cycleLen, prevLevel, isAwakeningScenario) {
  if (entite.archetypeFrozen === true && name === 'egare') {
    state.awakened = false;
    state.archetypeProgress.egare = { level: prevLevel + 1, stage: 0, uid: getArchetypeUID(), milestones: [] };
    return;
  }

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

  return finalName;
}

export function applyLevelUpPreview(entite, state) {
  if (!entite) return console.warn('⚠️ [confirmLevelUp] Entité manquante');

  const previewStats = entite.modifierStats?.preview?.statLeveled;
  normalizeStatModifierMapInPlace(previewStats);
  if (!previewStats || Object.keys(previewStats).length === 0) {
    console.log(`ℹ️ [confirmLevelUp] Aucune preview à confirmer pour ${entite.name}`);
    return;
  }

  const experienceSpent = Math.max(0, Number(state.xpBaseline) - Number(state.tempXP));
  const payment = spendPlayerExperience(experienceSpent);
  if (!payment) {
    return { error: 'insufficient-xp' };
  }

  entite.modifierStats ??= {};
  entite.modifierStats.durable ??= { statLeveled: {} };
  entite.modifierStats.durable.statLeveled ??= {};

  ComputeStatPreview(entite);
  const confirmedGenerated = structuredClone(
    entite.modifierStats?.preview?.generated || {}
  );
  const statsBeforeConfirm = structuredClone(entite.stats || {});
  removeGeneratedStatsFromPreviewLeveled(entite);

  for (const [key, val] of Object.entries(previewStats)) {
    if (PREVIEW_GENERATED_ONLY_KEYS.has(key) && !STAT_SYSTEM_ORIGINS[key]) continue;
    if (isZeroPreviewDelta(val)) continue;

    if (isObjStat(val)) {
      entite.modifierStats.durable.statLeveled[key] =
        addObj(entite.modifierStats.durable.statLeveled[key], val);
      continue;
    }

    entite.modifierStats.durable.statLeveled[key] =
      (Number(entite.modifierStats.durable.statLeveled[key] ?? 0) || 0) +
      Number(val ?? 0);
  }

  // 🧱 Incrément du niveau (respecte level.max propre à l’entité)
  const baseLevel = getEntityLevelCurrent(entite);
  const maxLevelForEntity = getEntityLevelMax(entite);
  const targetTempLevel = Math.min(state.tempLevel, maxLevelForEntity);
  const gainedLevels = targetTempLevel - baseLevel;

  if (gainedLevels > 0) {
    setEntityLevelCurrent(entite, baseLevel + gainedLevels);
    console.log(`⬆️ ${entite.name} gagne ${gainedLevels} niveau(x) → Niveau ${getEntityLevelCurrent(entite)}`);
  }

  markConfirmedLevelUpMeta(entite, getEntityLevelCurrent(entite));
  recomputeEntityStats(entite, { skipReverseArchetype: true });
  setEntityLevelCurrent(entite, targetTempLevel);
  markConfirmedLevelUpMeta(entite, getEntityLevelCurrent(entite));
  applyConfirmedGeneratedPoolDeltas(entite, confirmedGenerated);
  syncEntityLinkedEssenceInventory(entite);

  return { payment, statsBeforeConfirm };
}
