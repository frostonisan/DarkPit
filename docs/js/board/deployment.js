import { battleLogs } from "../combat/journal.js";
import {
  calculateMovementMaxCharges, calculateMovementStartingCharges, getMarathonChance, getMovementValue,
  getTrailerChance, attemptAlterationResistance,
} from "../combat/statistics.js";
import { balanceData } from "../data/balanceData.js";
import { refillNaturalMovement, spendMovementCharges } from "../items/resourceStocks.js";
import { canEntityProc, isEntityMovementBlocked } from "../combat/control.js";
import {
  getMovementWeightMalus, entites,
} from "../entities/runtime.js";
import { entityFootprint, planEntityPlacements, commitEntityPlacements } from "./controller.js";
import { refreshStageAccess } from "../app/state.js";
import { attackDetails } from "../data/attackList.js";
import { readEntityCombatProfile } from "../combat/attackResolution.js";
import { isNonLordCombatant } from "../entities/rules.js";
import { clearBattleTargetDisplays, updateEntityAttackTargetDisplay } from "../rendering/hud.js";

// COMPTAGE DES ROLES
export let GlobalCombatantRoles = {
    sideA: [],
    sideB: []
};

export function logPositionsAndAnalyze() {
    return positionnerEntites();
}

// POSITION DANS LE DOM
export function positionnerEntites(newEntite = null, { previousCoordinates = new Map() } = {}) {
    const hexes = [...document.querySelectorAll('#hexGrid .hex[data-position]')];
    if (!hexes.length) return [];
    const byPosition = new Map(hexes.map(hex => [hex.dataset.position, hex]));
    const entries = (newEntite ? [newEntite] : entites)
        .map(entity => ({ entity, element: document.getElementById(`Box_Entite_${entity.id}`) })).filter(e => e.element);
    const movingIds = new Set(entries.map(({entity}) => String(entity.id))), occupied = new Set(), assignments = new Map();
    const sideClass = entity => entity.side === 'A' ? 'SideA' : entity.side === 'B' ? 'SideB' : 'Neutral';
    const allowed = (entity, hex) => hex.classList.contains(sideClass(entity)) || hex.classList.contains('Neutral');
    for (const other of entites) {
        if (movingIds.has(String(other.id))) continue;
        entityFootprint(other).forEach(hex => occupied.add(hex));
    }
    for (const hex of hexes) if (hex.classList.contains('consommable-summoned') || hex.querySelector(':scope > .battle-element, :scope > [data-occupies-hex="true"]')) occupied.add(hex);
    const fits = (entity, hex) => {
        const cells = entityFootprint(entity, hex);
        return cells.length && cells.every(cell => !occupied.has(cell) && allowed(entity, cell));
    };
    const reserve = (entity, hex) => { assignments.set(entity, hex); entityFootprint(entity, hex).forEach(cell => occupied.add(cell)); };
    for (const {entity} of entries) {
        const hex = byPosition.get(entity.position);
        const canKeep = hex && (hex.classList.contains(sideClass(entity)) || (hex.classList.contains('Neutral') &&
            (newEntite || previousCoordinates.get(entity.position)?.side === 'Neutral' || document.getElementById(`Box_Entite_${entity.id}`)?.parentElement === hex)));
        if (canKeep && fits(entity, hex)) reserve(entity, hex);
    }
    for (const {entity} of entries) {
        if (assignments.has(entity)) continue;
        const current = byPosition.get(entity.position), own = hexes.filter(hex => hex.classList.contains(sideClass(entity)));
        const origin = previousCoordinates.get(entity.position) || (current && {row:Number(current.dataset.row), col:Number(current.dataset.col)}) || {
            row:own.reduce((n,h)=>n+Number(h.dataset.row),0)/(own.length||1), col:own.reduce((n,h)=>n+Number(h.dataset.col),0)/(own.length||1)
        };
        const distance = hex => (Number(hex.dataset.col)+(Number(hex.dataset.row)%2)/2-origin.col-(origin.row%2)/2)**2 + .75*(Number(hex.dataset.row)-origin.row)**2;
        const available = own.filter(hex => fits(entity,hex)).sort((a,b)=>distance(a)-distance(b));
        const roles = (Array.isArray(entity.role)?entity.role:[entity.role]).map(role=>role==='gueux'?'neutre':role);
        let target = roles.map(role=>available.find(hex=>hex.dataset.role===role)).find(Boolean) || available[0];
        target ||= hexes.filter(hex=>hex.classList.contains('Neutral')&&fits(entity,hex)).sort((a,b)=>distance(a)-distance(b))[0];
        if (!target) { console.warn('Aucun placement complet pour', entity.name || entity.id); return []; }
        reserve(entity,target);
    }
    if (!assignments.size) return [];
    const plan = planEntityPlacements([...assignments].map(([entity,hex])=>({entity,hex})));
    return commitEntityPlacements(plan) ? [...assignments.keys()] : [];
}

// POSITIONNEMENT ET CALCUL
export function handlePositionsAndLogs() {
    return positionnerEntites();
}

// ECOUTEUR DEVENEMENT POUR MODIFICATION DE ROLES
	// ACTUALISTATION DU STOCKAGE DANS LA VARIABLE POUR LES SBIRES
export function updateCombatantRoleIndex() {
GlobalCombatantRoles = {
    sideA: entites
        .filter(entite => 
            entite.side === 'A' && 
            (entite.stats.HP?.current > 0 || entite.life > 0) && 
            isNonLordCombatant(entite)
        )
        .map(entite => ({
            name: entite.name || entite.type,
            role: entite.role || 'aucun',
            id: entite.id || 'inconnue',
            classe: entite.classe || 'aucune',
            type: entite.type
        })),

    sideB: entites
        .filter(entite => 
            entite.side === 'B' && 
            (entite.stats.HP?.current > 0 || entite.life > 0) && 
            isNonLordCombatant(entite)
        )
        .map(entite => ({
            name: entite.name || entite.type,
            role: entite.role || 'aucun',
            id: entite.id || 'inconnue',
            classe: entite.classe || 'aucune',
            type: entite.type
        }))
};

    // console.log('Rôles des combattants pour chaque côté:', GlobalCombatantRoles);
}
export function determineClasse(entite) {
    const profile = readEntityCombatProfile(entite, attackDetails);
    entite.classe = profile.combatFunction;
    entite.canTargetDead = profile.domains.includes('necro');
}

// Mettre à jour les classes pour toutes les entités
export function updateEntiteClasses() {
    entites.forEach(entite => determineClasse(entite));
}

export function updateCombatantTargetZones() {
    refreshStageAccess();
    const roleCounts = { sideA: {}, sideB: {} };
    for (const entity of entites) {
        if (entity.isDEAD) continue;
        const counts = roleCounts[`side${entity.side}`];
        if (counts && isNonLordCombatant(entity)) counts[entity.role] = (counts[entity.role] || 0) + 1;
        updateEntityAttackTargetDisplay(entity);
    }
    return roleCounts;
}

export function observeRoleChanges() {
    const observer = new MutationObserver(mutations => {
        let roleChanged = false;

        mutations.forEach(mutation => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                const target = mutation.target;
                const newRoleClass = Array.from(target.classList).find(cls => cls.startsWith('role-'));
                if (newRoleClass) {
                    const roleName = newRoleClass.split('-')[1];
                    const entityId = target.id.slice(target.id.lastIndexOf('_') + 1);

                    // Utiliser les priorités correctes en fonction du rôle et de la classe
                    const entite = entites.find(entite => entite.id == entityId);
                    if (entite) {
                        entite.role = roleName;
                        roleChanged = true;
                    }

                    // Mettre à jour la classe de l'élément ScanEntity
                    const entityScan = document.getElementById(`ScanEntity_${entityId}`);
                    if (entityScan) {
                        entityScan.classList.add('entite-details', roleName);

                    }
                }
            }
        });

        // Mettre à jour l'index des combattants une seule fois après toutes les mutations.
        if (roleChanged) {
            updateCombatantRoleIndex();
            updateCombatantTargetZones();
        }
    });

    const boxes = document.querySelectorAll('.entite-box');
    boxes.forEach(box => observer.observe(box, { attributes: true }));
}

window.addEventListener('entityCombatSideChanged', () => {
    clearBattleTargetDisplays();
    updateCombatantRoleIndex();
    updateCombatantTargetZones();
});

// Charges de deplacement : initialisation, recharge et consommation sans affichage.
export function ensureMovementState(entite, { reset = false } = {}) {
  if (!entite) return { current: 0, max: 0 };
  if (!entite.stats) entite.stats = {};

  const rawShift = entite.stats.shift;
  const hasShiftObject = rawShift && typeof rawShift === "object";

  const movementMax = Math.max(0, Math.round(calculateMovementMaxCharges(entite)));

  const max = hasShiftObject
    ? Math.max(0, Math.round(Number(rawShift.max) || 0))
    : movementMax;

  if (reset || !hasShiftObject) {
    entite.stats.shift = {
      ...(rawShift?.baseDefault ? { baseDefault: true } : {}),
      current: hasShiftObject
        ? Math.round(Number(rawShift.current) || 0)
        : calculateMovementStartingCharges(entite),
      max,
    };

    return entite.stats.shift;
  }

  entite.stats.shift.max = max;
  entite.stats.shift.current = Math.round(Number(entite.stats.shift.current) || 0);
  return entite.stats.shift;
}

function initializeMovementStateAtBattleStart(entite) {
  const movement = ensureMovementState(entite, { reset: true });
  return movement;
}

export function initializeAllMovementStatesAtBattleStart(entityList = entites) {
  if (!Array.isArray(entityList)) return [];
  return entityList.map(entite => initializeMovementStateAtBattleStart(entite));
}

export function refillEntityMovement(entite, amount = balanceData.movement.charges.refillBaseAmount) {
  const movement = ensureMovementState(entite);

  if (movement.max <= 0) {
    return movement;
  }

  const before = movement.current;

  const isAlreadyFull = movement.current >= movement.max;

  const trailer = isAlreadyFull
    ? { success: false, chance: 0, roll: null, disabled: true, reason: "movement-full" }
    : attemptMovementTrailer(entite);

  const refillAmount = trailer.success
    ? balanceData.movement.charges.trailerRefillAmount
    : Math.max(0, Math.round(Number(amount) || 0));
  refillNaturalMovement(entite, refillAmount);

  movement.trailer = trailer;

  if (movement.current > before && before < movement.max && movement.current <= movement.max) {
    battleLogs("trail_move_generated", { entity: entite });
  }

  console.log(
    `👣 Recharge mouvement : ${entite.name} ${before}/${movement.max} → ${movement.current}/${movement.max}`
  );

  return movement;
}

export function attemptMovementMarathon(entite) {
  if (!canEntityProc(entite)) return { success: false, chance: 0, roll: null };
  const chance = Math.max(
    0,
    Math.min(balanceData.movement.charges.chanceMaxPercent, Number(getMarathonChance(entite)) || 0)
  );
  if (chance <= 0) {
    return {
      success: false,
      chance,
      roll: null,
    };
  }

  const roll = Math.random() * 100;
  const success = roll < chance;

  console.log(
    `🏃 Marathonien : ${entite.name} | ${chance}% | roll ${roll.toFixed(2)} → ${
      success ? "✅ déplacement gratuit" : "❌ charge consommée"
    }`
  );

  return {
    success,
    chance,
    roll: Number(roll.toFixed(2)),
  };
}

export function attemptMovementTrailer(entite) {
  if (!canEntityProc(entite)) return { success: false, chance: 0, roll: null };
  const movementValue = getMovementValue(entite);

  if (movementValue <= 0) {
    return {
      success: false,
      chance: 0,
      roll: null,
      disabled: true,
    };
  }

  const chance = Math.max(
    0,
    Math.min(balanceData.movement.charges.chanceMaxPercent, Number(getTrailerChance(entite)) || 0)
  );

  if (chance <= 0) {
    return {
      success: false,
      chance,
      roll: null,
    };
  }

  const roll = Math.random() * 100;
  const success = roll < chance;

  return {
    success,
    chance,
    roll: Number(roll.toFixed(2)),
  };
}

export function consumeEntityMovement(entite, amount = 1) {
  const rawMovement = entite?.stats?.shift;
  if (isEntityMovementBlocked(entite)) return { allowed: false, consumed: false, reason: 'immobilised', movement: rawMovement };

  if (
    !rawMovement ||
    typeof rawMovement !== "object" ||
    rawMovement.current == null ||
    Number(rawMovement.current) < 1
  ) {
    return {
      allowed: false,
      consumed: false,
      reason: "not-enough-current-movement",
      movement: rawMovement || { current: 0, max: 0 },
    };
  }

  const movement = ensureMovementState(entite);

  const marathon = attemptMovementMarathon(entite);

  if (marathon.success) {
    return {
      allowed: true,
      consumed: false,
      reason: "marathon",
      movement,
      marathon,
    };
  }

  const weight = getMovementWeightMalus(entite);
  const weightResistance = weight.shiftCostModifier > 0
    ? attemptAlterationResistance(entite, entite, { type: ['entrave'], effectName: 'weight', increasesMovementCost: true }) : null;
  const cost = Math.max(1, Math.round(Number(amount) || 1))
    + (weightResistance?.canceled ? 0 : Number(weight?.shiftCostModifier || 0));

  const before = movement.current;
  spendMovementCharges(entite, cost);

  console.log(
    `👣 Mouvement consommé : ${entite.name} ${before}/${movement.max} → ${movement.current}/${movement.max} coût ${cost}`
  );

  return {
    allowed: true,
    consumed: true,
    reason: "consumed",
    movement,
    marathon,
    cost,
    weight,
    weightResistance,
  };
}
