import { setTimeout, trackCombatOperation } from "../combat/clock.js";
import { enrichEntityStats, entites, generateUniqueID } from "./runtime.js";
import { refreshStageAccess, gameStarted, isBattleFinished } from "../app/state.js";
import { collectEntityResources, prepareLevelResources } from "../data/loaderList.js";
import { createEntiteInDOM } from "../rendering/entities.js";
import { toggleScanEntityListener } from "../ui/display.js";
import {
  getRoleFromHex, findNearestAvailableHex, isHexOccupied,
} from "../rendering/boardElements.js";
import { planEntityPlacements, commitEntityPlacements, entityFootprint, releaseEntityFootprint } from "../board/controller.js";
import { getHexEntity } from "../board/targets.js";
import { notifyProjectileTargetMoved } from "../rendering/animations.js";
import { saveEntityPositionState, recordEntityCombatStat, recordEntityCombatMovement, beginEntityBattleRole } from "../storage/entityStorage.js";
import {
  determineClasse, observeRoleChanges, positionnerEntites, updateCombatantTargetZones,
  updateCombatantRoleIndex,
} from "../board/deployment.js";
import { updateRoleInDOM } from "../rendering/hud.js";

const cloneEntity = (entity) => {
    if (typeof structuredClone === 'function') return structuredClone(entity);
    return JSON.parse(JSON.stringify(entity));
};

const normalizeSpawnSide = (side) => {
    const normalized = String(side || '').trim().toLowerCase();
    if (normalized === 'a' || normalized === 'sidea' || normalized === 'side-a') return 'A';
    if (normalized === 'b' || normalized === 'sideb' || normalized === 'side-b') return 'B';
    if (normalized === 'neutral' || normalized === 'neutre' || normalized === 'n') return 'neutral';
    return null;
};

const sideToHexClass = (side) => {
    if (side === 'A') return 'SideA';
    if (side === 'B') return 'SideB';
    return 'Neutral';
};

export function prepareHexForSide(hex, side) {
    if (!hex) return;
    hex.classList.remove('SideA', 'SideB', 'Neutral');
    hex.classList.add(sideToHexClass(side));
    hex.dataset.side = side;
}

function findAvailablePosition(side, entity) {
    const sideClass = sideToHexClass(side);
    const candidates = [...document.querySelectorAll('.hex[data-position]')];
    const available = candidates.filter(hex => planEntityPlacements([{entity,hex}]).valid);
    const hex = available.find(hex=>hex.classList.contains(sideClass))
        || available.find(hex=>hex.classList.contains('Neutral')) || available[0];

    return hex?.dataset.position ?? null;
}

function normalizeResources(entity, { restoreHP = true } = {}) {
    entity.stats ??= {};

    if (!entity.stats.HP || typeof entity.stats.HP !== 'object') {
        throw new Error(`HP doit être { current, max } pour l'entité ${entity.id}`);
    }

    if (restoreHP) entity.stats.HP.current = entity.stats.HP.max;

    if (typeof entity.stats.extraLife === 'number') {
        throw new Error(`extraLife doit être { current, max } pour l'entité ${entity.id}`);
    } else if (typeof entity.stats.extraLife === 'undefined') {
        entity.stats.extraLife = { current: 0, max: 0 };
    } else if (
        !entity.stats.extraLife ||
        !('current' in entity.stats.extraLife) ||
        !('max' in entity.stats.extraLife)
    ) {
        throw new Error(`extraLife mal défini pour l'entité ${entity.id}`);
    }
}

function showBoardFullAlert() {
    if (document.querySelector('.Game-UI .IngameAlert')) return;

    const gameUI = document.querySelector('.Game-UI');
    if (!gameUI) return;

    const alert = document.createElement('div');
    alert.className = 'IngameAlert';
    alert.textContent = 'Plus de places disponibles sur le board !';
    gameUI.appendChild(alert);
    setTimeout(() => alert.remove(), 3000);
}

/**
 * Insère dans le jeu une entité déjà préparée.
 */
export function spawnEntiteIngame(entity, options = {}) {
    return trackCombatOperation(spawnEntiteIngameInternal(entity, options));
}
async function spawnEntiteIngameInternal(entity, options) {
    if (!entity) throw new Error('Aucune entité fournie.');
    await prepareLevelResources(collectEntityResources(entity));

    entity.id ||= generateUniqueID();

    if (entites.some(item => String(item.id) === String(entity.id))) {
        throw new Error(`L'entité ${entity.id} existe déjà.`);
    }
    if (!entity.position) {
        throw new Error(`Position indéfinie pour l'entité ${entity.id}.`);
    }
    const landingHex = [...document.querySelectorAll('.hex[data-position]')]
        .find(hex => hex.dataset.position === entity.position);
    const landingPlan = planEntityPlacements([{entity,hex:landingHex}], {push: options.displaceOccupant === true});
    if (!landingPlan.valid) {
        throw new Error(`Case indisponible pour l'entité ${entity.id}.`);
    }

    normalizeResources(entity, options);
    entity.role = getRoleFromHex(landingHex);
    determineClasse(entity);
    const domSpawn = createEntiteInDOM(entity);
    observeRoleChanges(entity);
    toggleScanEntityListener();

    const element = domSpawn?.element || document.getElementById(`Box_Entite_${entity.id}`);
    if (!element) {
        throw new Error(`Élément DOM introuvable pour l'entité ${entity.id}.`);
    }

    // Occupy synchronously: two effects landing during sprite loading cannot stack.
    entites.push(entity);
    refreshStageAccess();
    if (!commitEntityPlacements(landingPlan, {animate:options.displaceOccupant === true})) {
        entites.splice(entites.indexOf(entity),1);element.remove();
        throw new Error('Le groupement de destination est devenu indisponible.');
    }
    for (const id of landingPlan.pushed) {
        const displaced = landingPlan.moves.get(id).entity;
        saveEntityPositionState(displaced);recordEntityCombatMovement(displaced,{forced:true});notifyProjectileTargetMoved(displaced);
    }
    updateCombatantRoleIndex();
    updateCombatantTargetZones();

    if (domSpawn?.spriteReady) {
        const spriteResult = await Promise.race([
            domSpawn.spriteReady,
            new Promise(resolve => globalThis.setTimeout(
                () => resolve({ loaded: false, error: 'Délai de chargement dépassé' }),
                10000
            ))
        ]);

        if (!spriteResult?.loaded) {
            releaseEntityFootprint(entity);
            const index = entites.indexOf(entity);
            if (index !== -1) entites.splice(index, 1);
            refreshStageAccess();
            element.remove();
            isHexOccupied(entity.position);
            updateCombatantRoleIndex();
            updateCombatantTargetZones();
            throw new Error(
                `Sprite non chargé pour l'entité ${entity.id} : ${spriteResult?.error || 'erreur inconnue'}`
            );
        }
    }

    positionnerEntites(entity);

    const targetHex = element.closest('.hex');
    if (!targetHex) {
        const entityIndex = entites.findIndex(item => item.id === entity.id);
        if (entityIndex !== -1) entites.splice(entityIndex, 1);
        refreshStageAccess();
        element.remove();
        showBoardFullAlert();
        throw new Error(`Aucune case disponible pour l'entité ${entity.id}.`);
    }

    targetHex.classList.add('occupied');
    targetHex.dataset.occupiedBy = entity.id;
    const socle = targetHex.querySelector('.socle');
    if (socle) socle.style.opacity = '1';

    const extraLife = document.getElementById(`extraLife_${entity.id}`);
    if (extraLife && entity.stats.extraLife.max === 0) {
        extraLife.style.display = 'none';
    }

    if (gameStarted && !isBattleFinished() && ['A', 'B'].includes(entity.side)) {
        recordEntityCombatStat(entity, 'battlesFought');
        beginEntityBattleRole(entity);
    }
    return entity;
}

/**
 * API commune aux créations manuelles et automatiques.
 *
 * @param {object} entityBase modèle d'entité à instancier
 * @param {object} options configuration de l'instance
 * @param {'A'|'B'} options.side côté de l'entité
 * @param {string|null} [options.position] position imposée; une case libre est
 *        choisie automatiquement quand elle est omise
 * @param {number|null} [options.level] niveau courant à imposer sans remplacer
 *        la structure level du modèle
 */
export async function createEntityIngame(entityBase, {
    side,
    position = null,
    level = null,
    displaceOccupant = false
} = {}) {
    if (!entityBase) throw new Error('Le modèle d’entité est obligatoire.');
    const spawnSide = normalizeSpawnSide(side);
    if (!spawnSide) throw new Error('Le side doit être A, B ou neutral.');

    const entity = cloneEntity(entityBase);
    entity.id = generateUniqueID();
    entity.side = spawnSide;
    entity.position = position ?? findAvailablePosition(spawnSide, entity);

    // ArmyBFactory transmet le modèle complet au pipeline. On conserve donc
    // level tel quel, sauf si l'appelant impose explicitement un niveau.
    if (level !== null) {
        if (entity.level && typeof entity.level === 'object') {
            entity.level.current = level;
        } else {
            entity.level = { current: level };
        }
    }

    if (!entity.position) {
        showBoardFullAlert();
        throw new Error(`Aucune position disponible pour le side ${spawnSide}.`);
    }

    entity.position = String(entity.position);
    const hex = [...document.querySelectorAll('.hex[data-position]')]
        .find(item => item.dataset.position === entity.position);
    if (!hex) throw new Error(`La case ${entity.position} n'existe pas.`);
    const placement = planEntityPlacements([{entity,hex}], {push:displaceOccupant});
    if (!placement.valid) throw new Error(placement.reason);

    prepareHexForSide(hex, spawnSide);
    return spawnEntiteIngame(enrichEntityStats(entity), {displaceOccupant});
}

export function makeRoomForSummon(hex) {
    if (!hex?.isConnected) return false;
    if (!isHexOccupied(hex.dataset.position)) return true;
    const occupant = getHexEntity(hex, entites);
    const box = occupant && document.getElementById(`Box_Entite_${occupant.id}`);
    const candidates = [...document.querySelectorAll('.hex[data-position]')].filter(cell =>
        cell !== hex && occupant && !entityFootprint(occupant,cell).includes(hex)
        && planEntityPlacements([{entity:occupant,hex:cell}]).valid);
    const destination = box && findNearestAvailableHex(hex,candidates,{excludeElement:box});
    if (!destination) return false;
    const from = hex.dataset.position;
    if (!commitEntityPlacements(planEntityPlacements([{entity:occupant,hex:destination}]),{animate:true})) return false;
    saveEntityPositionState(occupant);
    notifyProjectileTargetMoved(occupant);
    destination.dispatchEvent(new Event('hexOccupied'));
    console.info('[SummonDisplacement]', { entityId: occupant.id, from, to: occupant.position });
    return true;
}
