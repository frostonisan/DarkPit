import { enrichEntityStats, entites, generateUniqueID } from './entites.js';
import { createEntiteInDOM } from './createEntity.js';
import { toggleScanEntityListener } from './ui.js';
import {
    determineClasse,
    observeRoleChanges,
    positionnerEntites,
    TraitementRolesSbires,
    updateGlobalRoleSbire
} from './load-entity.js';

const cloneEntity = (entity) => {
    if (typeof structuredClone === 'function') return structuredClone(entity);
    return JSON.parse(JSON.stringify(entity));
};

const sideToHexClass = (side) => (side === 'A' ? 'SideA' : 'SideB');

function prepareHexForSide(hex, side) {
    if (!hex) return;
    hex.classList.remove('SideA', 'SideB');
    hex.classList.add(sideToHexClass(side));
    hex.dataset.side = side;
}

function findAvailablePosition(side) {
    const sideClass = sideToHexClass(side);
    const hex =
        document.querySelector(`.hex.${sideClass}:not(.occupied)`) ||
        document.querySelector('.hex.Neutral:not(.occupied)') ||
        document.querySelector('.hex:not(.occupied)');

    return hex?.dataset.position ?? null;
}

function normalizeResources(entity) {
    entity.stats ??= {};

    if (typeof entity.stats.HP === 'number') {
        entity.stats.HP = { current: entity.stats.HP, max: entity.stats.HP };
    } else if (!entity.stats.HP || typeof entity.stats.HP !== 'object') {
        entity.stats.HP = { current: 1, max: 1 };
    } else {
        entity.stats.HP.current = entity.stats.HP.max;
    }

    if (typeof entity.stats.extraLife === 'number') {
        entity.stats.extraLife = {
            current: entity.stats.extraLife,
            max: entity.stats.extraLife
        };
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
 * Cette fonction reste exportée pour préserver les anciens appels.
 */
export async function  (entity) {
    if (!entity) throw new Error('Aucune entité fournie.');

    entity.id ||= generateUniqueID();

    if (entites.some(item => String(item.id) === String(entity.id))) {
        throw new Error(`L'entité ${entity.id} existe déjà.`);
    }
    if (!entity.position) {
        throw new Error(`Position indéfinie pour l'entité ${entity.id}.`);
    }

    normalizeResources(entity);
    determineClasse(entity);
    TraitementRolesSbires(entity);
    const domSpawn = createEntiteInDOM(entity);
    updateGlobalRoleSbire(entity);
    observeRoleChanges(entity);
    toggleScanEntityListener();

    const element = domSpawn?.element || document.getElementById(`Box_Entite_${entity.id}`);
    if (!element) {
        throw new Error(`Élément DOM introuvable pour l'entité ${entity.id}.`);
    }

    if (domSpawn?.spriteReady) {
        const spriteResult = await Promise.race([
            domSpawn.spriteReady,
            new Promise(resolve => setTimeout(
                () => resolve({ loaded: false, error: 'Délai de chargement dépassé' }),
                10000
            ))
        ]);

        if (!spriteResult?.loaded) {
            element.remove();
            throw new Error(
                `Sprite non chargé pour l'entité ${entity.id} : ${spriteResult?.error || 'erreur inconnue'}`
            );
        }
    }

    entites.push(entity);
    positionnerEntites(entity);

    const targetHex = element.closest('.hex');
    if (!targetHex) {
        const entityIndex = entites.findIndex(item => item.id === entity.id);
        if (entityIndex !== -1) entites.splice(entityIndex, 1);
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
    level = null
} = {}) {
    if (!entityBase) throw new Error('Le modèle d’entité est obligatoire.');
    if (side !== 'A' && side !== 'B') throw new Error('Le side doit être A ou B.');

    const entity = cloneEntity(entityBase);
    entity.id = generateUniqueID();
    entity.side = side;
    entity.position = position ?? findAvailablePosition(side);

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
        throw new Error(`Aucune position disponible pour le side ${side}.`);
    }

    entity.position = String(entity.position);
    const hex = [...document.querySelectorAll('.hex[data-position]')]
        .find(item => item.dataset.position === entity.position);
    if (!hex) throw new Error(`La case ${entity.position} n'existe pas.`);
    if (hex.classList.contains('occupied')) {
        throw new Error(`La case ${entity.position} est déjà occupée.`);
    }

    prepareHexForSide(hex, side);
    return spawnEntiteIngame(enrichEntityStats(entity));
}
