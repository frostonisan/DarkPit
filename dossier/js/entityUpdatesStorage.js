import { saveToLocalStorage, loadFromLocalStorage, saveCurrentGameData } from './GameStorage.js';
import { toggleEffectClass } from './attackEffectMecanics.js';
import { updateHealthBar } from './UpgradeEntity.js';
import { toNonNegInt } from './ui.js';
import { calculateMovementStartingCharges, calculateHpBattleRegenAmount, attemptBattleRegen } from "./damagesCalcul.js";
import { battleLogs } from "./battleLogs.js";
import { syncEntityAuras } from "./entitesAura.js";
export function getCorrectedArmyB(armyBId) {
    const allArmyB = loadFromLocalStorage('ArmyB', { armies: {} });
    let armyBContainer = allArmyB.armies?.[armyBId];

    if (!armyBContainer) {
        console.warn(`⚠️ Aucune armée trouvée pour ${armyBId}.`);
        return { armyB: [], allArmyB };
    }

    // Si on a un objet avec .entities => OK
    if (Array.isArray(armyBContainer.entities)) {
        return { armyB: armyBContainer.entities, allArmyB };
    }

    // Si c’est un tableau brut (erreur historique) => conversion
    if (Array.isArray(armyBContainer)) {
        console.log(`♻️ Correction: ArmyB ${armyBId} est un tableau brut, conversion...`);
        allArmyB.armies[armyBId] = {
            ArmyB_id: armyBId,
            entities: armyBContainer
        };
        saveToLocalStorage('ArmyB', allArmyB);
        return { armyB: armyBContainer, allArmyB };
    }

    console.warn(`⚠️ Structure inconnue pour ${armyBId}, retour d’un tableau vide.`);
    allArmyB.armies[armyBId] = {
        ArmyB_id: armyBId,
        entities: []
    };
    saveToLocalStorage('ArmyB', allArmyB);
    return { armyB: [], allArmyB };
}

export function updateEntityStatusInStorage(entite) {
    const armyBId = window.currentStageId ? `ArmyB_${window.currentStageId}` : null;
    if (!armyBId) {
        console.warn(`⚠️ currentStageId non défini, impossible de trouver ArmyB.`);
        return;
    }

    const { armyB, allArmyB } = getCorrectedArmyB(armyBId);
    const entityInArmyB = armyB.find(e => e.id === entite.id);

    if (entityInArmyB) {
        entityInArmyB.statut = entite.statut;
        allArmyB.armies[armyBId].entities = armyB;
        saveToLocalStorage('ArmyB', allArmyB);
        console.log(`📌 Statut mis à jour pour ${entite.name} (Side B): ${entite.statut}`);
        return;
    }

    // Fallback côté A
    const selectedArmy = loadFromLocalStorage('selectedArmyA', []);
    const entityInSelectedArmy = selectedArmy.find(e => e.id === entite.id);

    if (entityInSelectedArmy) {
        entityInSelectedArmy.statut = entite.statut;
        saveToLocalStorage('selectedArmyA', selectedArmy);
        console.log(`📌 Statut mis à jour pour ${entite.name} (Side A): ${entite.statut}`);
        return;
    }

    console.warn(`⚠️ Entité ${entite.name} non trouvée dans ArmyB ni ArmyA.`);
}

export function applyItemHPChange(target, variation) {
    if (!target || !target.stats.HP) return;
    if (target.stats.HP.current <= 0) return;

    target.stats.HP.current = Math.max(0, Math.min(target.stats.HP.current + variation, target.stats.HP.max));

    itemSaveEntityHPToStorage(target);

   updateHealthBar(target.stats.HP.current, target.stats.HP.max, target.stats.armor?.current || 0, target.stats.armor?.max || 0, target.id);

}

export function itemSaveEntityHPToStorage(entite) {
    let saved = false;

    // Recherche dans toutes les armées B
    const allArmyB = loadFromLocalStorage('ArmyB');
    if (allArmyB?.armies) {
        for (const [armyId, armyData] of Object.entries(allArmyB.armies)) {
            const entityInArmy = armyData.entities?.find(e => e.id === entite.id);
            if (entityInArmy) {
                entityInArmy.stats.HP = { current: entite.stats.HP.current, max: entite.stats.HP.max };
                saveToLocalStorage('ArmyB', allArmyB);
                console.log(`🩸 HP (objet) mis à jour pour ${entite.name} dans ArmyB (${armyId})`);
                saved = true;
                break;
            }
        }
    }

    // Fallback : recherche dans Army A
    if (!saved) {
        const selectedArmyA = loadFromLocalStorage('selectedArmyA', []);
        const entityInArmyA = selectedArmyA.find(e => e.id === entite.id);
        if (entityInArmyA) {
            entityInArmyA.stats.HP = { current: entite.stats.HP.current, max: entite.stats.HP.max };
            saveToLocalStorage('selectedArmyA', selectedArmyA);
            console.log(`🩸 HP (objet) mis à jour pour ${entite.name} dans ArmyA`);
            saved = true;
        }
    }

    // Rien trouvé nulle part
    if (!saved) {
        console.warn(`⚠️ HP non sauvegardés : ${entite.name} non trouvé dans ArmyA ni ArmyB.`);
    }
}

export function saveEntityHPToStorage(entite) {
    const armyBId = window.currentStageId ? `ArmyB_${window.currentStageId}` : null;
    if (!armyBId) {
        console.warn(`⚠️ currentStageId non défini, impossible de trouver ArmyB.`);
        return;
    }

    const { armyB, allArmyB } = getCorrectedArmyB(armyBId);
    const entityInArmyB = armyB.find(e => e.id === entite.id);

    if (entityInArmyB) {
        entityInArmyB.stats.HP = { current: entite.stats.HP.current, max: entite.stats.HP.max };
        allArmyB.armies[armyBId].entities = armyB;
        saveToLocalStorage('ArmyB', allArmyB);
        console.log(`🩸 HP mis à jour pour ${entite.name} (Side B) : ${entite.stats.HP.current}/${entite.stats.HP.max}`);
        return;
    }

    // Fallback côté A
    const selectedArmy = loadFromLocalStorage('selectedArmyA', []);
    const entityInSelectedArmy = selectedArmy.find(e => e.id === entite.id);

    if (entityInSelectedArmy) {
        entityInSelectedArmy.stats.HP = { current: entite.stats.HP.current, max: entite.stats.HP.max };
        saveToLocalStorage('selectedArmyA', selectedArmy);
        console.log(`🩸 HP mis à jour pour ${entite.name} (Side A) : ${entite.stats.HP.current}/${entite.stats.HP.max}`);
        return;
    }

    console.warn(`⚠️ Entité ${entite.name} non trouvée dans ArmyB ni ArmyA.`);
}

function setLifePoolOnEntity(entityObj, entite, key) {
  if (!entityObj.stats) entityObj.stats = {};
  // ✅ eternalLife = {current,max} mais UNICITÉ (0/1)
  if (key === "eternalLife") {
    const src = entite?.stats?.eternalLife;

    const has = toNonNegInt(src?.max ?? src?.current ?? 0) > 0;
    if (!has) {
      delete entityObj.stats.eternalLife;
      return;
    }

    const cur = toNonNegInt(src?.current ?? 1) > 0 ? 1 : 0;
    entityObj.stats.eternalLife = { current: cur, max: 1 };
    return;
  }
  // ✅ fadedLife = nombre (pas d'objet, pas de max)
  if (key === "fadedLife") {
    const v = Math.max(0, Number(entite?.stats?.fadedLife ?? 0) || 0);

    if (v > 0) entityObj.stats.fadedLife = v;
    else delete entityObj.stats.fadedLife;

    return;
  }

  // ✅ extraLife = {current,max} avec sécurité current<=max, et suppression si max=0
  const src = entite?.stats?.[key];
  const max = Math.max(0, Number(src?.max ?? 0) || 0);
  const cur = Math.max(0, Math.min(Number(src?.current ?? 0) || 0, max));

  if (max <= 0) {
    delete entityObj.stats[key];
  } else {
    entityObj.stats[key] = { current: cur, max };
  }
}

export function saveEntityLifePoolToStorage(entite, key) {
  const armyBId = window.currentStageId ? `ArmyB_${window.currentStageId}` : null;

  // 1) Tentative Side B si possible
  if (armyBId) {
    const { armyB, allArmyB } = getCorrectedArmyB(armyBId);
    const entityInArmyB = armyB.find(e => e.id === entite.id);

    if (entityInArmyB) {
      setLifePoolOnEntity(entityInArmyB, entite, key);
      allArmyB.armies[armyBId].entities = armyB;
      saveToLocalStorage('ArmyB', allArmyB);
      return;
    }
  } else {
    console.warn(`⚠️ currentStageId non défini, skip Side B pour ${key}.`);
  }

  // 2) Fallback Side A
  const selectedArmy = loadFromLocalStorage('selectedArmyA', []);
  const entityInSelectedArmy = selectedArmy.find(e => e.id === entite.id);

  if (entityInSelectedArmy) {
    setLifePoolOnEntity(entityInSelectedArmy, entite, key);
    saveToLocalStorage('selectedArmyA', selectedArmy);
    return;
  }

  console.warn(`⚠️ Entité ${entite.name} non trouvée dans ArmyB ni ArmyA (${key}).`);
}
export function saveEntityExtraLifeRegenToStorage(entite) {
  if (!entite?.id) return false;

  let changed = false;

  // --- Army A ---
  const selectedArmyA = loadFromLocalStorage("selectedArmyA", []);
  if (Array.isArray(selectedArmyA)) {
    const idx = selectedArmyA.findIndex(e => e?.id === entite.id);
    if (idx !== -1) {
      selectedArmyA[idx].extraLifeRegen = entite.extraLifeRegen;
      saveToLocalStorage("selectedArmyA", selectedArmyA);
      changed = true;
    }
  }

  // --- Army B (stockées dans ArmyB.armies.*.entities) ---
  const armyBData = loadFromLocalStorage("ArmyB", { armies: {} });
  if (armyBData?.armies && typeof armyBData.armies === "object") {
    let touchedB = false;

    for (const armyKey of Object.keys(armyBData.armies)) {
      const entities = armyBData.armies[armyKey]?.entities;
      if (!Array.isArray(entities)) continue;

      const idx = entities.findIndex(e => e?.id === entite.id);
      if (idx !== -1) {
        entities[idx].extraLifeRegen = entite.extraLifeRegen;
        touchedB = true;
      }
    }

    if (touchedB) {
      saveToLocalStorage("ArmyB", armyBData);
      changed = true;
    }
  }

  if (changed) saveCurrentGameData();
  return changed;
}
export function saveEntityextraLifeToStorage(entite) {
  return saveEntityLifePoolToStorage(entite, 'extraLife');
}
export function saveEntityfadedLifeToStorage(entite) {
  return saveEntityLifePoolToStorage(entite, 'fadedLife');
}
export function saveEntityEternalLifeToStorage(entite) {
  return saveEntityLifePoolToStorage(entite, 'eternalLife');
}
export function saveEntityEternalLifeRegenToStorage(entite) {
  if (!entite?.id) return false;

  let changed = false;

  // --- Army A ---
  const selectedArmyA = loadFromLocalStorage("selectedArmyA", []);
  if (Array.isArray(selectedArmyA)) {
    const idx = selectedArmyA.findIndex(e => e?.id === entite.id);
    if (idx !== -1) {
      selectedArmyA[idx].eternalLifeRegen = entite.eternalLifeRegen;
      saveToLocalStorage("selectedArmyA", selectedArmyA);
      changed = true;
    }
  }

  // --- Army B ---
  const armyBData = loadFromLocalStorage("ArmyB", { armies: {} });
  if (armyBData?.armies && typeof armyBData.armies === "object") {
    let touchedB = false;

    for (const armyKey of Object.keys(armyBData.armies)) {
      const entities = armyBData.armies[armyKey]?.entities;
      if (!Array.isArray(entities)) continue;

      const idx = entities.findIndex(e => e?.id === entite.id);
      if (idx !== -1) {
        entities[idx].eternalLifeRegen = entite.eternalLifeRegen;
        touchedB = true;
      }
    }

    if (touchedB) {
      saveToLocalStorage("ArmyB", armyBData);
      changed = true;
    }
  }

  if (changed) saveCurrentGameData();
  return changed;
}

export function saveEntireEntityToStorage(entite) {
    let saved = false;

    // 1. Sauvegarde côté ArmyB
    const allArmyB = loadFromLocalStorage('ArmyB');
    if (allArmyB?.armies) {
        for (const [armyId, armyData] of Object.entries(allArmyB.armies)) {
            const entityInArmy = armyData.entities?.find(e => e.id === entite.id);
            if (entityInArmy) {
                allArmyB.armies[armyId].entities = armyData.entities.map(e =>
                    e.id === entite.id ? structuredClone(entite) : e
                );
                saveToLocalStorage('ArmyB', allArmyB);
                console.log(`💾 Entité ${entite.name} mise à jour entièrement dans ArmyB (${armyId})`);
                saved = true;
                break;
            }
        }
    }

    // 2. Fallback côté ArmyA
    if (!saved) {
        const selectedArmyA = loadFromLocalStorage('selectedArmyA', []);
        const index = selectedArmyA.findIndex(e => e.id === entite.id);
        if (index !== -1) {
            selectedArmyA[index] = structuredClone(entite);
            saveToLocalStorage('selectedArmyA', selectedArmyA);
            console.log(`💾 Entité ${entite.name} mise à jour entièrement dans ArmyA`);
            saved = true;
        }
    }

    if (!saved) {
        console.warn(`⚠️ Entité ${entite.name} non trouvée dans ArmyA ni ArmyB.`);
    }
}

export function EquipedEntityItems(entiteId, equippedItemId) {
    const armyA = loadFromLocalStorage('selectedArmyA', []);
    const index = armyA.findIndex(e => e.id === entiteId);

    if (index === -1) {
        console.warn(`❌ Entité avec ID ${entiteId} introuvable dans ArmyA`);
        return;
    }

    const targetEntity = armyA[index];

    if (!targetEntity.stuff) {
        targetEntity.stuff = {};
    }

    // Initialisation correcte des slots si absent
    const charge = targetEntity.stats?.charge || 0;
    for (let i = 1; i <= charge; i++) {
        const key = `slot${i}`;
        if (!targetEntity.stuff[key]) {
            targetEntity.stuff[key] = [];
        }
    }

    // Vérifie que l'item n'est pas déjà équipé dans n'importe quel slot
    const allItemsEquipped = Object.values(targetEntity.stuff).flat();
    if (allItemsEquipped.includes(equippedItemId)) {
        console.warn(`⛔ L’objet ${equippedItemId} est déjà présent dans le stuff de ${targetEntity.name}`);
        return;
    }

    // Trouve le premier slot avec de la place (ex : vide ou selon une limite définie)
    let selectedSlot = null;
    for (let i = 1; i <= charge; i++) {
        const key = `slot${i}`;
        if (targetEntity.stuff[key].length === 0) {
            selectedSlot = key;
            break;
        }
    }

    if (!selectedSlot) {
        console.warn("⛔ Aucun slot libre pour ajouter l'objet");
        return;
    }

    // Ajout de l’objet dans le slot sélectionné
    targetEntity.stuff[selectedSlot].push(equippedItemId);

    // Mise à jour et sauvegarde
    armyA[index] = targetEntity;
    saveToLocalStorage('selectedArmyA', armyA);

    console.log(`🧷 Objet ${equippedItemId} ajouté au ${selectedSlot} de ${targetEntity.name} (ID ${targetEntity.id})`);
}

export function saveEntityArmorState(entite) {
  if (!entite?.id || !entite?.stats?.armor) {
    return;
  }

  const armorSave = {
    current: Math.max(
      0,
      Math.round(
        Number(entite.stats.armor.current) || 0
      )
    ),

    max: Math.max(
      0,
      Math.round(
        Number(entite.stats.armor.max) || 0
      )
    ),
  };

  entite.stats.armor.current =
    armorSave.current;

  entite.stats.armor.max =
    armorSave.max;

  syncEntityAuras(entite, "battle");

  const armyBId = window.currentStageId
    ? `ArmyB_${window.currentStageId}`
    : null;

  // 1. Tentative Side B
  if (armyBId) {
    const { armyB, allArmyB } =
      getCorrectedArmyB(armyBId);

    const entityInArmyB = armyB.find(
      entity =>
        Number(entity.id) === Number(entite.id)
    );

    if (entityInArmyB) {
      entityInArmyB.stats =
        entityInArmyB.stats || {};

      entityInArmyB.stats.armor = {
        ...armorSave
      };

      allArmyB.armies[armyBId].entities = armyB;

      saveToLocalStorage(
        "ArmyB",
        allArmyB
      );

      console.log(
        `🛡️ Armor sauvegardée pour ${entite.name} Side B : ` +
        `${armorSave.current}/${armorSave.max}`
      );

      return;
    }
  }

  // 2. Fallback Side A
  const selectedArmyA = loadFromLocalStorage(
    "selectedArmyA",
    []
  );

  const entityInArmyA = selectedArmyA.find(
    entity =>
      Number(entity.id) === Number(entite.id)
  );

  if (entityInArmyA) {
    entityInArmyA.stats =
      entityInArmyA.stats || {};

    entityInArmyA.stats.armor = {
      ...armorSave
    };

    saveToLocalStorage(
      "selectedArmyA",
      selectedArmyA
    );

    console.log(
      `🛡️ Armor sauvegardée pour ${entite.name} Side A : ` +
      `${armorSave.current}/${armorSave.max}`
    );

    return;
  }

  console.warn(
    `⚠️ Armor non sauvegardée : ${entite.name} ` +
    `non trouvé dans ArmyA ni ArmyB.`
  );
}

export function resetStoredArmorCurrentToMax() {
  const selectedArmyA = loadFromLocalStorage("selectedArmyA", []);

  selectedArmyA.forEach(entite => {
    if (!entite?.stats?.armor) return;
    entite.stats.armor.current = Math.max(0, Math.round(Number(entite.stats.armor.max) || 0));
  });

  saveToLocalStorage("selectedArmyA", selectedArmyA);

  const armyBData = loadFromLocalStorage("ArmyB", { armies: {} });

  Object.values(armyBData.armies || {}).forEach(armyContainer => {
    const entities = armyContainer?.entities;
    if (!Array.isArray(entities)) return;

    entities.forEach(entite => {
      if (!entite?.stats?.armor) return;
      entite.stats.armor.current = Math.max(0, Math.round(Number(entite.stats.armor.max) || 0));
    });
  });

  saveToLocalStorage("ArmyB", armyBData);

  console.log("🛡️ Worldmap chargée : armor.current restauré au max pour ArmyA et ArmyB.");
}
export function applyHpBattleRegenAtTurnStart(entite) {
  if (!entite?.stats?.HP) return 0;
  const currentHP = Math.max(0, Number(entite.stats.HP.current) || 0);
  const maxHP = Math.max(0, Number(entite.stats.HP.max) || 0);
  if (maxHP <= 0 || currentHP <= 0 || currentHP >= maxHP) return 0;
  const regenAmount = Math.max(0, Number(calculateHpBattleRegenAmount(entite)) || 0);
  if (regenAmount <= 0) return 0;
  const newHP = Math.min(maxHP, currentHP + regenAmount);
  const hpRestored = Math.max(0, newHP - currentHP);
  if (hpRestored <= 0) return 0;
  entite.stats.HP.current = newHP;
  saveEntityHPToStorage(entite, newHP);
  updateHealthBar(newHP, maxHP, entite.stats?.armor?.current || 0, entite.stats?.armor?.max || 0, entite.id);
  battleLogs("entity_battle_regen", { entity: entite, hpRestored });
  attemptBattleRegen(entite, hpRestored);

  return hpRestored;
}
export function saveEntityMovementState(entite) {
  if (!entite?.id || !entite?.stats?.shift) return;

  const shiftSave = {
    current: Math.max(0, Math.round(Number(entite.stats.shift.current) || 0)),
    max: Math.max(0, Math.round(Number(entite.stats.shift.max) || 0)),
  };

  const selectedArmyA = loadFromLocalStorage("selectedArmyA", []);
  const indexA = selectedArmyA.findIndex(e => Number(e.id) === Number(entite.id));

  if (indexA !== -1) {
    selectedArmyA[indexA].stats = selectedArmyA[indexA].stats || {};
    selectedArmyA[indexA].stats.shift = shiftSave;
    saveToLocalStorage("selectedArmyA", selectedArmyA);
    return;
  }

  const currentStageId =
    window.currentStageId ||
    localStorage.getItem("currentLevel") ||
    localStorage.getItem("levelRunning");

  if (!currentStageId) return;

  const armyBKey = `ArmyB_${currentStageId}`;
  const armyB = loadFromLocalStorage(armyBKey, null);

  if (!armyB?.entities?.length) return;

  const indexB = armyB.entities.findIndex(e => Number(e.id) === Number(entite.id));

  if (indexB !== -1) {
    armyB.entities[indexB].stats = armyB.entities[indexB].stats || {};
    armyB.entities[indexB].stats.shift = shiftSave;
    saveToLocalStorage(armyBKey, armyB);
  }
}
export function resetStoredShiftCurrentToStartingCharges() {
  const resetShift = entite => {
    if (!entite?.stats?.shift) return;

    entite.stats.shift.current = calculateMovementStartingCharges(entite);
  };

  const selectedArmyA = loadFromLocalStorage("selectedArmyA", []);

  if (Array.isArray(selectedArmyA)) {
    selectedArmyA.forEach(resetShift);
    saveToLocalStorage("selectedArmyA", selectedArmyA);
  }

  const armyBData = loadFromLocalStorage("ArmyB", { armies: {} });

  Object.values(armyBData.armies || {}).forEach(armyContainer => {
    const entities = armyContainer?.entities;
    if (!Array.isArray(entities)) return;

    entities.forEach(resetShift);
  });

  saveToLocalStorage("ArmyB", armyBData);

  console.log("🏃 Worldmap chargée : shift.current restauré aux charges de départ pour ArmyA et ArmyB.");
}
export function saveEntityPositionState(entite) {
  if (!entite?.id) return;

  const positionSave = entite.position || "";

  // Army A
  const selectedArmyA = loadFromLocalStorage("selectedArmyA", []);
  const indexA = selectedArmyA.findIndex(e => Number(e.id) === Number(entite.id));

  if (indexA !== -1) {
    selectedArmyA[indexA].position = positionSave;
    saveToLocalStorage("selectedArmyA", selectedArmyA);
    console.log(`📍 Position sauvegardée Side A : ${entite.name} -> ${positionSave}`);
    return;
  }

  // Army B
  const armyBData = loadFromLocalStorage("ArmyB", { armies: {} });

  for (const [armyBId, armyContainer] of Object.entries(armyBData.armies || {})) {
    const entities = armyContainer?.entities;
    if (!Array.isArray(entities)) continue;

    const indexB = entities.findIndex(e => Number(e.id) === Number(entite.id));

    if (indexB !== -1) {
      entities[indexB].position = positionSave;
      armyBData.armies[armyBId].entities = entities;
      saveToLocalStorage("ArmyB", armyBData);

      console.log(`📍 Position sauvegardée Side B : ${entite.name} -> ${positionSave}`);
      return;
    }
  }

  console.warn(`⚠️ Position non sauvegardée : ${entite.name} introuvable ArmyA/ArmyB.`);
}

export function saveAllEntityPositionsState(entityList = []) {
  if (!Array.isArray(entityList)) return;

  entityList.forEach(entite => {
    saveEntityPositionState(entite);
  });
}