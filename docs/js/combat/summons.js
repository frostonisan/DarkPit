import { updateHealthBar } from "../rendering/vitalFeedback.js";
import { syncEntityFootprints, refreshHexOccupancy } from "../board/controller.js";
import {
  removeCombatVisualAfter, registerCombatState, isCombatInteractionBlocked, trackCombatOperation,
  notifyCombatAction, combatData, combatReference, combatTarget, setTimeout, clearTimeout, clockNow,
} from "./clock.js";


import { cachedResourceUrl } from "../data/loaderList.js";
import { entites, removedEntities, RemoveEntite } from "../entities/runtime.js";
import { summons } from "../data/summons.js";
import { getProfanationTemplate } from "../procedural/proc-bareme.js";

import { applyDamage } from "./vitals.js";
import { createEntityIngame } from "../entities/spawn.js";
import { entiteTurn } from "./loop.js";
import { gameStarted } from "../app/state.js";
import { getEntityHex, getHexEntity } from "../board/targets.js";
import { cloneCombatSnapshot } from "./snapshot.js";
import { isHexOccupied } from "../rendering/boardElements.js";
import {
  saveEntityHPToStorage,
  recordEntityConsumable,
  recordEntityCombatAmount,
  recordEntityCombatProc,
  recordEntityHealingReceived,
  getEntityCombatDetails,
  recordSummonCreated,
  recordSummonOutcome,
} from "../storage/entityStorage.js";
import { showHealingFeedback, applyAttackNatureEffect, scheduleAlterationTicks } from "./effects.js";
import { getAttackNatureRules, readAttackDefinitionsForEntity, splitAttackNatureAmount } from './attackResolution.js';
import { attackDetails } from "../data/attackList.js";
import { glitterLoot, disperseLootGlitter } from "../biome/meteo.js";
import {
  calculateProfanationSummonLevel, calculateResilienceEffectDuration, attemptResilienceCancel,
} from "./statistics.js";
import { PERMANENT_CRYSTAL_LEVELS } from "../data/permanentCrystalData.js";
import { getPermanentStatGrant } from "../items/permanentItems.js";

function getEntityConsumingHex(hexElement) {
    return getHexEntity(hexElement, entites);
}

const groundSummons = new Map();
const groundLootRemnants = new Map();
const jarretPoisonEffects = new Map();

window.addEventListener('battleStopped', () => {
    // StopGame clears runtime timers; a deposited item keeps its original deadline.
    queueMicrotask(() => groundSummons.forEach(bindGroundSummon));
});

window.addEventListener('consumableTargetReleased', event => {
    for (const record of groundSummons.values()) {
        if (String(getEntityConsumingHex(record.hex)?.id) === String(event.detail.entityId)) {
            void consumeGroundSummon(record);
        }
    }
});

function getHexZone(hex) {
    if (hex?.classList.contains('SideA')) return 'A';
    if (hex?.classList.contains('SideB')) return 'B';
    return 'neutral';
}

function getGroundSummonOnHex(hex, excludedId = null) {
    return [...groundSummons.values()].find(record => (
        !record.settled && record.hex === hex && record.id !== excludedId
    )) || null;
}

function cleanupGroundSummonHex(hex, effectClass = null) {
    if (!hex) return;
    if (!getGroundSummonOnHex(hex)) hex.classList.remove('consommable-summoned');
    if (effectClass && ![...groundSummons.values()].some(record => (
        !record.settled && record.hex === hex && record.effectClass === effectClass
    ))) {
        hex.classList.remove(effectClass);
    }
    const container = hex.querySelector(':scope > .consommable-container');
    if (container && !container.querySelector(':scope > .summon, :scope > .ground-loot-remnant')) container.remove();
    refreshHexOccupancy(hex);
}

function getGroundSummonContainer(hex) {
    let container = hex.querySelector(':scope > .consommable-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'consommable-container';
        hex.appendChild(container);
    }
    return container;
}

function groundSummonDistance(origin, hex) {
    const from = origin.getBoundingClientRect();
    const to = hex.getBoundingClientRect();
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    return dx * dx + dy * dy;
}

function isGroundSummonDestinationFree(hex, record) {
    return Boolean(
        hex?.isConnected
        && hex !== record.hex
        && !isHexOccupied(hex.dataset.position)
        && !getGroundSummonOnHex(hex, record.id)
    );
}

function findGroundSummonFallbackHex(record) {
    const allHexes = [...document.querySelectorAll('.hex[data-position]')];
    const ownerSide = record.ownerSide === 'A' || record.ownerSide === 'B'
        ? record.ownerSide
        : getHexZone(record.hex);
    const enemySide = ownerSide === 'A' ? 'B' : ownerSide === 'B' ? 'A' : null;
    const zonePriority = ownerSide === 'A' || ownerSide === 'B'
        ? [ownerSide, 'neutral', enemySide]
        : ['neutral', 'A', 'B'];

    for (const zone of zonePriority) {
        const candidates = allHexes
            .map((hex, index) => ({ hex, index }))
            .filter(({ hex }) => getHexZone(hex) === zone && isGroundSummonDestinationFree(hex, record))
            .sort((left, right) => (
                groundSummonDistance(record.hex, left.hex) - groundSummonDistance(record.hex, right.hex)
                || left.index - right.index
            ));
        if (candidates.length) return candidates[0].hex;
    }
    return null;
}

function detachGroundSummonBindings(record) {
    record.observer?.disconnect();
    record.observer = null;
    if (record.consumeHandler && record.hex) {
        record.hex.removeEventListener('hexOccupied', record.consumeHandler);
    }
    record.consumeHandler = null;
    clearTimeout(record.expiryTimer);
    record.expiryTimer = null;
    record.lifetimeAnimation?.cancel();
    record.fadeAnimation?.cancel();
}

function settleGroundSummon(record, status) {
    if (!record || record.settled) return record?.status || status;
    record.settled = true;
    record.status = status;
    recordSummonOutcome(record.attacker, {
        [status === 'consumed' ? 'consumed' : status === 'expired' ? 'expired' : 'lost']: 1,
    }, record.summonStatsOrigin || null);
    const lastHex = record.hex;
    detachGroundSummonBindings(record);
    groundSummons.delete(record.id);
    const glitter = record.node?.querySelector(':scope > .glitter-loot-container');
    if (glitter && record.node.isConnected && ['consumed', 'retrieved', 'expired', 'destroyed-no-room'].includes(status)) {
        // Keep only the loot particles alive after the item itself has gone.
        const remnant = document.createElement('div');
        remnant.className = 'ground-loot-remnant battle-ground-item-active';
        remnant.style.cssText = `position:absolute;pointer-events:none;left:${record.node.offsetLeft}px;top:${record.node.offsetTop}px;width:${record.node.offsetWidth}px;height:${record.node.offsetHeight}px;`;
        record.node.parentElement.appendChild(remnant);
        const glitterStyle = getComputedStyle(glitter);
        for (const property of ['width', 'height', 'left', 'top']) {
            glitter.style[property] = glitterStyle[property];
        }
        remnant.appendChild(glitter);
        const observer = new MutationObserver(() => {
            if (remnant.childElementCount) return;
            observer.disconnect();
            groundLootRemnants.delete(remnant);
            remnant.remove();
            cleanupGroundSummonHex(lastHex);
        });
        observer.observe(remnant, { childList: true });
        groundLootRemnants.set(remnant, observer);
        disperseLootGlitter(remnant);
    }
    record.node?.remove();
    cleanupGroundSummonHex(lastHex, record.effectClass);
    record.onSettled?.(status);
    console.info('[GroundSummon]', {
        summonId: record.id,
        status,
        position: lastHex?.dataset.position || null,
        casterId: record.attacker?.id ?? null,
    });
    return status;
}

function playWastedConsumableVfx(entity) {
    const effectsContainer = entity && document.getElementById(`effectsContainer_${entity.id}`);
    if (!effectsContainer) return;
    const vfx = document.createElement('img');
    vfx.src = cachedResourceUrl('./media/assets/effects/blood-loss.gif');
    vfx.className = 'effect-vfx blood-loss';
    vfx.alt = `${entity.name} gâche l'effet.`;
    effectsContainer.appendChild(vfx);
    removeCombatVisualAfter(vfx, 600);
}

function finishJarretPoison(entityId) {
    const active = jarretPoisonEffects.get(String(entityId));
    if (!active) return;
    clearTimeout(active.intervalId);
    active.vfx?.remove();
    jarretPoisonEffects.delete(String(entityId));
}

function applyJarretHeal(entity, record) {
    if (!entity || entity.isDEAD) {
        playWastedConsumableVfx(entity);
        return { applied: false, reason: 'dead-target' };
    }
    if (record.attack && record.attacker) {
        const attack = { ...record.attack, combatFunction: 'Support', attackTarget: ['ally'], effets: [], selfEffects: [],
            summonStatsOrigin: record.summonStatsOrigin,
            launchContextId: `${record.id}:heal`, displayName: record.summon.summonDisplayName };
        const outcome = applyDamage(entity, 5, record.attacker, attack, splitAttackNatureAmount(attack, 5));
        recordEntityCombatAmount(entity, 'consumableHealingReceived', outcome?.healedHP || 0);
        return { applied: Boolean(outcome?.hit), restored: outcome?.healedHP || 0 };
    }
    const before = Number(entity.stats?.HP?.current) || 0;
    const maximum = Number(entity.stats?.HP?.max) || before;
    entity.stats.HP.current = Math.min(maximum, before + 5);
    const restored = Math.max(0, entity.stats.HP.current - before);
    recordSummonOutcome(record.attacker, { healingDone: restored }, record.summonStatsOrigin || null);
    recordEntityCombatAmount(entity, 'consumableHealingReceived', restored);
    recordEntityHealingReceived(entity, restored);
    saveEntityHPToStorage(entity);
    updateHealthBar(entity.stats.HP.current, maximum, entity.stats.armor?.current || 0, entity.stats.armor?.max || 0, entity.id);

    showHealingFeedback(entity, restored);
    return { applied: true, restored };
}

function applyJarretPoison(entity, record, saved = null) {
    if (!entity || entity.isDEAD) {
        playWastedConsumableVfx(entity);
        return { applied: false, reason: 'dead-target' };
    }
    const totalDamage = 5;
    const baseDuration = 10;
    const durationSeconds = calculateResilienceEffectDuration(entity, { type: ['alteration'], effectDuration: baseDuration, effectDot: totalDamage });
    const source = record.attacker || {
        id: `ground-summon-${record.id}`,
        name: 'Jarret foireux',
        side: record.ownerSide,
        stats: {},
    };
    const attack = { ...(record.attack || { attacknature: ['magicalDamage'] }),
        summonStatsOrigin: record.summonStatsOrigin,
        combatFunction: 'Attaquant', attackTarget: ['enemy'], effets: [], selfEffects: [],
        launchContextId: `${record.id}:poison`, displayName: 'Jarret foireux' };
    const shares = splitAttackNatureAmount(attack, totalDamage);
    const totals = Object.fromEntries(Object.entries(shares).map(([key, value]) => [key, Math.floor(value)]));
    const ordered = Object.keys(shares).sort((a, b) => (shares[b] - totals[b]) - (shares[a] - totals[a]));
    const remainder = totalDamage - Object.values(totals).reduce((sum, value) => sum + value, 0);
    if (getAttackNatureRules(attack).profile.total) {
        for (let index = 0; index < remainder; index++) totals[ordered[index % ordered.length]]++;
    }
    // Consumption applies the signature once. Periodic poison never reapplies it or grants mastery.
    if (!saved) applyAttackNatureEffect(entity, source, attack);
    if (!saved && attemptResilienceCancel(source, entity, 'poisonConsommable')) {
        recordEntityCombatProc(entity, 'resilienceCancel');
        return { applied: false, reason: 'alteration_canceled' };
    }
    finishJarretPoison(entity.id);
    const effectsContainer = document.getElementById(`effectsContainer_${entity.id}`);
    const vfx = document.getElementById(`jarretPoisonVFX_${entity.id}`) || document.createElement('img');
    vfx.id = `jarretPoisonVFX_${entity.id}`;
    vfx.alt = `${entity.name} est empoisonné par un jarret !`;
    vfx.className = 'effect-vfx poison';
    vfx.src = cachedResourceUrl('./media/assets/effects/poison.gif');
    effectsContainer?.appendChild(vfx);

    const state = saved || { entity: entity.id, record: combatData(record), tick: {}, delivered: {}, rounding: {} };
    const active = { intervalId: null, vfx, sourceId: record.id, state };
    jarretPoisonEffects.set(String(entity.id), active);
    const delivered = state.delivered;
    const alterationRounding = state.rounding;
    scheduleAlterationTicks({
      duration: durationSeconds, state: state.tick,
      isActive: () => !entity.isDEAD,
      onTimer: id => { active.intervalId = id; },
      onEnd: () => finishJarretPoison(entity.id),
      onTick: ({ elapsed, final }) => {
        const sources = Object.fromEntries(Object.entries(totals).map(([key, value]) => {
            const cumulative = (final ? Math.round : Math.floor)(value * elapsed / baseDuration);
            const amount = Math.max(0, cumulative - (delivered[key] || 0));
            delivered[key] = cumulative;
            return [key, amount];
        }));
        const rawDamage = Object.values(sources).reduce((sum, value) => sum + value, 0);
        if (rawDamage > 0) {
            const receivedBefore = getEntityCombatDetails(entity).damageReceived;
            applyDamage(entity, rawDamage, source, {
                ...attack,
                functionName: 'jarret-poison',
                combatFunction: 'Attaquant',
                displayName: 'Jarret foireux',
                dotname: 'Poison',
                attackTarget: ['enemy'],
                type: ['alteration'],
                alterationRounding,
                effets: [],
                popup: 'poison-dot',
                forceDamageSources: sources,
            }, sources);
            recordEntityCombatAmount(entity, 'consumableDamageReceived', getEntityCombatDetails(entity).damageReceived - receivedBefore);
        }
      }
    });
    return { applied: true, totalDamage, durationSeconds };
}

function applyGroundConsumableEffect(record, entity) {
    const results = record.summon.summonEffet.map(effect => {
        if (effect === 'healConsommable') return applyJarretHeal(entity, record);
        if (effect === 'poisonConsommable') return applyJarretPoison(entity, record);
        console.warn(`Effet de consommable non géré : ${effect}`);
        return { applied: false, reason: 'unknown-effect' };
    });
    return results;
}

function consumeGroundSummon(record) {
    if (isCombatInteractionBlocked()) return Promise.resolve(false);
    const action = trackCombatOperation(applyGroundConsumption(record));
    action.then(consumed => { if (consumed) notifyCombatAction(); }, error => console.error('[GroundConsumable]', error));
    return action;
}
async function applyGroundConsumption(record) {
    if (!record || record.settled || record.consuming) return false;
    const occupant = getEntityConsumingHex(record.hex);
    if (!occupant) return false;
    if (record.consumeItem) {
        const state = JSON.stringify([occupant.id, occupant.isDEAD, occupant.statut,
            Number(occupant.stats?.HP?.current) > 0, occupant.corpseDestroyed, occupant.corpseConsumed]);
        if (record.lastRejectedState === state) return false;
        record.consuming = true;
        try {
            const result = await record.consumeItem(occupant);
            if (result?.ok) settleGroundSummon(record, 'consumed');
            else if (!result?.busy && !result?.retryable) record.lastRejectedState = state;
            return Boolean(result?.ok);
        } finally {
            record.consuming = false;
        }
    }
    if (occupant.isDEAD || Number(occupant.stats?.HP?.current) <= 0) return false;
    settleGroundSummon(record, 'consumed');
    record.effectResults = applyGroundConsumableEffect(record, occupant);
    recordEntityConsumable(occupant, {
        source: 'ground', inCombat: gameStarted, hostile: record.summon.summonEffet.includes('poisonConsommable'),
        support: record.summon.summonEffet.includes('healConsommable'),
    });
    return true;
}

function bindGroundSummon(record, { restoreVisuals = false } = {}) {
    if (!record || record.settled || !record.hex?.isConnected) return;
    detachGroundSummonBindings(record);
    record.consumeHandler = () => consumeGroundSummon(record);
    record.observer = new MutationObserver(() => {
        if (!record.node?.isConnected) settleGroundSummon(record, 'removed');
        else consumeGroundSummon(record);
    });
    record.observer.observe(record.hex, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class'],
    });
    record.hex.addEventListener('hexOccupied', record.consumeHandler);
    record.node.dataset.infinite = String(record.infinite);
    const lifetime = record.node.querySelector('.ground-item-lifetime');
    if (lifetime) lifetime.hidden = record.infinite;
    if (record.infinite) {
        consumeGroundSummon(record);
        return;
    }
    const remaining = Math.max(0, record.expiresAt - clockNow());
    if (record.itemId && !restoreVisuals) {
        let lifetime = record.node.querySelector('.ground-item-lifetime');
        if (!lifetime) {
            lifetime = document.createElement('div');
            lifetime.className = 'ground-item-lifetime';
            lifetime.setAttribute('aria-hidden', 'true');
            lifetime.appendChild(document.createElement('span'));
            record.node.appendChild(lifetime);
        }
        record.lifetimeAnimation = lifetime.firstElementChild.animate([
            { transform: `scaleX(${Math.min(1, remaining / Math.max(1, record.expiresAt - record.createdAt))})` },
            { transform: 'scaleX(0)' },
        ], { duration: remaining, fill: 'forwards' });
        const warningDuration = Math.min(5000, remaining);
        const warningStart = Math.max(0, remaining - warningDuration);
        const blinkTimes = [0, 650, 1250, 1750, 2200, 2600, 2950, 3275, 3575, 3850, 4100, 4325, 4530, 4720, 4890];
        const blinkFrames = [{ opacity: 1, offset: 0 }];
        if (warningStart > 0) blinkFrames.push({ opacity: 1, offset: warningStart / remaining });
        blinkTimes.forEach((time, index) => {
            if (time > warningDuration) return;
            if (time === 0) return;
            blinkFrames.push({
                opacity: index % 2 === 0 ? 1 : 0.3,
                offset: (warningStart + time) / remaining,
            });
        });
        blinkFrames.push({ opacity: 0, offset: 1 });
        record.fadeAnimation = record.node.querySelector('.battle-ground-item')?.animate(blinkFrames, {
            duration: remaining,
            fill: 'forwards',
            easing: 'ease-in-out',
        });
    }
    record.expiryTimer = setTimeout(() => settleGroundSummon(record, 'expired'), remaining);
    consumeGroundSummon(record);
}

function relocateGroundSummon(record, destination) {
    if (!record || record.settled || !destination) return false;
    const origin = record.hex;
    detachGroundSummonBindings(record);
    getGroundSummonContainer(destination).appendChild(record.node);
    record.hex = destination;
    record.node.dataset.position = destination.dataset.position;
    destination.classList.add('consommable-summoned');
    refreshHexOccupancy(destination);
    if (record.effectClass) destination.classList.add(record.effectClass);
    cleanupGroundSummonHex(origin, record.effectClass);
    record.onMoved?.(destination.dataset.position);
    bindGroundSummon(record);
    console.info('[GroundSummon]', {
        summonId: record.id,
        status: 'displaced',
        from: origin.dataset.position,
        to: destination.dataset.position,
    });
    return true;
}

export function summonJarret(target, effect, attacker, removeEffectCallback) {
 // Déterminer si un Jarret foireux doit être invoqué
    const isRotten = Math.random() < 0.15;
    const summonEffect = isRotten ? 'rottenjarret-summon' : effect.effectSummon;

    const summon = summons.find(s => s.summonEffect === summonEffect);
    if (!summon) {
        console.error(`Erreur: L'invocation pour ${summonEffect} n'est pas définie dans summons`);
        removeEffectCallback?.();
        return { ok: false, status: 'missing-template' };
    }
    return spawnConsumableSummon(target, summon, { attacker, effectClass: effect.effectName }, removeEffectCallback);
}

export function spawnConsumableSummon(target, summon, options = {}, removeEffectCallback) {
    const existing = options.adminId && [...groundSummons.values()].find(record => record.adminId === options.adminId);
    if (existing) return { ok: true, summonId: existing.id, position: existing.hex.dataset.position };
    const result = summonConsommable(target, summon);
    if (!result) {
        removeEffectCallback?.();
        return { ok: false, status: 'invalid-hex' };
    }
    const { summonId, hexElement } = result;
    return consommationSummon(summon, hexElement, summonId, removeEffectCallback, options);
}

export async function summonProfanation(target, effect, attacker, removeEffectCallback) {
    if (!attacker || !target?.isDEAD || target.corpseConsumed || target.corpseDestroyed) return null;
    const hex = getEntityHex(target);
    const corpseBox = document.getElementById(`Box_Entite_${target.id}`);
    if (!hex || !corpseBox || !entites.includes(target)) return null;
    const { level } = calculateProfanationSummonLevel(attacker);

    const previousConsumed = Object.getOwnPropertyDescriptor(target, 'corpseConsumed');
    const previousProfanation = Object.getOwnPropertyDescriptor(target, 'runtimeProfanation');
    const restoreRuntimeDescriptor = (key, descriptor) => {
        if (descriptor) Object.defineProperty(target, key, descriptor);
        else delete target[key];
    };
    const rollbackCorpseClaim = () => {
        restoreRuntimeDescriptor('corpseConsumed', previousConsumed);
        restoreRuntimeDescriptor('runtimeProfanation', previousProfanation);
        const removedIndex = removedEntities.findLastIndex(entity => String(entity.id) === String(target.id));
        if (removedIndex !== -1) removedEntities.splice(removedIndex, 1);
        if (!entites.includes(target)) entites.push(target);
        if (!corpseBox.isConnected) hex.appendChild(corpseBox);
        delete corpseBox.dataset.footprintReleased;
        syncEntityFootprints(hex.closest('.hex-grid, #hexGrid'));
        hex.classList.add('occupied');
        hex.dataset.occupiedBy = target.id;
    };

    // Runtime-only claim: cloning/saving the army cannot persist this temporary absence.
    Object.defineProperty(target, 'corpseConsumed', {
        value: true, writable: true, configurable: true, enumerable: false,
    });
    Object.defineProperty(target, 'runtimeProfanation', {
        value: {
            state: 'claimed', casterId: attacker.id, casterSide: attacker.side,
            position: hex.dataset.position,
        },
        writable: true, configurable: true, enumerable: false,
    });

    // Claim the corpse synchronously; another impact cannot consume it twice.
    RemoveEntite(target);
    hex.classList.remove('occupied');
    delete hex.dataset.occupiedBy;
    const template = {
        ...getProfanationTemplate(level),
        summonOrigin: {
            type: 'profanation', sourceCorpseId: target.id, sourceCorpseSide: target.side,
            casterId: attacker.id, casterSide: attacker.side,
            generatedLevel: level,
        },
    };
    try {
        const result = await summonEntite(hex, template, attacker, removeEffectCallback, null);
        if (!result) {
            rollbackCorpseClaim();
            return null;
        }
        target.runtimeProfanation.state = 'summoned';
        target.runtimeProfanation.summonId = result.summonId;
        console.info('[Profanation]', {
            corpseId: target.id, summonId: result.summonId, side: attacker.side, level,
        });
        return result;
    } catch (error) {
        rollbackCorpseClaim();
        console.error('[Profanation] Invocation annulee, cadavre restaure.', error);
        return null;
    }
}

export function inheritSummonEssences(template, originAttack) {
    const mode = template['essence-heritage'] ?? true;
    if (mode === false || !originAttack) return template;
    if (mode !== true && mode !== 'combine') throw new Error(`Mode essence-heritage invalide : ${mode}`);
    const inherited = getAttackNatureRules(originAttack).profile;
    const colors = ['red', 'blue', 'yellow'].flatMap(color => Array(inherited[color]).fill(color));
    const definitions = readAttackDefinitionsForEntity(template, attackDetails).map(definition => {
        const native = getAttackNatureRules(definition).profile;
        const nativeColors = mode === 'combine' ? ['red', 'blue', 'yellow'].flatMap(color => Array(native[color]).fill(color)) : [];
        const slots = [...nativeColors, ...colors].slice(0, 10).map((color, index) => ({
            slotId: `slot-${index + 1}`, color, linkedColor: color, kind: 'open', locked: false,
            source: 'initial-attack-family', essenceSource: 'linked',
        }));
        const copy = cloneCombatSnapshot(definition, 'summon-attack');
        for (const key of ['entityAttackId', 'entityId', 'essenceBaseProfile', 'mastery', 'nativeEssenceSlots']) delete copy[key];
        return { ...copy, essenceSlots: slots, essences: slots.map(slot => slot.color) };
    });
    return { ...template, attackDetails: definitions, attacks: definitions.map(attack => attack.functionName) };
}

summonProfanation.tacticalConsequence = [];
summonProfanation.tacticalEffects = [
    { id: 'corpse-removal', target: 'enemy-corpse', tacticalScope: 'summon', quantity: 1,
      tacticalConsequence: ['suppression', 'prolongee', 'fixe'] },
    { id: 'allied-reinforcement', target: 'summoned-ally', tacticalScope: 'summon', quantity: 1,
      tacticalConsequence: ['generation_entite', 'prolongee', 'fixe', 'proportionnel'] },
];
summonJarret.tacticalConsequence = ['generation_objet', 'differe', 'temporaire', 'fixe'];
summonJarret.tacticalScope = 'healing';

export async function summonEntite(target, template, attacker, removeEffectCallback, duration) {
    const hex = getEntityHex(target);
    if (!hex) return null;
    const summonTemplate = {
        ...inheritSummonEssences(template, attacker?.currentAttack),
        isSummonedEntity: true,
        lootPolicy: 'none',
        summonLifetime: template.summonLifetime || (Number.isFinite(duration) && duration > 0 ? 'timed' : 'map-session'),
        summonOrigin: {
            ...template.summonOrigin,
            type: template.summonOrigin?.type || 'summon',
            casterId: attacker.id,
            casterSide: attacker.side,
        },
    };
    delete summonTemplate.summonOrigin.statistics;
    const entity = await createEntityIngame(summonTemplate, {
        side: attacker.side, position: hex.dataset.position, displaceOccupant: true,
    });
    recordSummonCreated(attacker, entity, { template });
    const box = document.getElementById(`Box_Entite_${entity.id}`);
    box?.classList.add('summon-animation', 'active');
    const dragBox = box?.querySelector('.drag-box');
    if (dragBox) dragBox.draggable = false;
    // Do not await the entity's complete combat loop.
    if (gameStarted) {
        entiteTurn(entity, entites.filter(other => other.side !== entity.side))
            .catch(error => console.error('[SummonTurn]', entity.id, error));
    }
    if (Number.isFinite(duration) && duration > 0) {
        entity.summonExpiresAt = clockNow() + duration;
        bindSummonExpiry(entity, removeEffectCallback);
    }
    return { summonId: entity.id, targetElement: box };
}

function summonConsommable(target, summon) {
    const hexElement = getEntityHex(target);
    if (!hexElement) {
        console.warn('Élément parent .hex introuvable');
        return;
    }

    hexElement.classList.add('consommable-summoned');
    refreshHexOccupancy(hexElement);
    const effectsContainer = getGroundSummonContainer(hexElement);

    const uniqueId = crypto.randomUUID();
    const summonId = `summon-${summon.summonId}-${uniqueId}`;

    let summonContainer = document.createElement('div');
    summonContainer.id = summonId;
    summonContainer.className = 'entitesContainer summon';
    summonContainer.dataset.position = hexElement.dataset.position;
    summonContainer.dataset.groundSummon = 'true';

    let summonPerspective = document.createElement('div');
    summonPerspective.className = 'sprite-container';

    let summonCenter = document.createElement('div');
    summonCenter.className = 'img-container';

    let summonVFX = document.createElement(summon.statIcon ? 'div' : 'img');
    if (!summon.statIcon) summonVFX.src = cachedResourceUrl(summon.summonSprite);
    summonVFX.className = summon.summonClass;
    if (summon.statIcon) {
        summonVFX.setAttribute('role', 'img');
        summonVFX.setAttribute('aria-label', summon.summonDisplayName);
        if (summon.isPermanent) {
            summonVFX.classList.add('umbra-crystal');
            const visual = PERMANENT_CRYSTAL_LEVELS.find(entry => entry.level === summon.crystalLevel);
            summonVFX.dataset.crystalLevel = visual.level;
            const core = document.createElement('div');
            core.className = 'umbra-crystal-core';
            const layer = (src, className) => {
                const image = document.createElement('img');
                image.className = className;
                image.src = cachedResourceUrl(src);
                image.alt = '';
                image.draggable = false;
                return image;
            };
            const back = layer(visual.back, 'umbra-crystal-layer umbra-crystal-back');
            const pictoWrap = document.createElement('div');
            pictoWrap.className = 'umbra-crystal-picto-wrap';
            const picto = document.createElement('div');
            picto.className = `umbra-crystal-picto picto-stat ${summon.statIcon}`;
            pictoWrap.appendChild(picto);
            const front = layer(visual.front, 'umbra-crystal-layer umbra-crystal-front');
            core.append(front, pictoWrap, back);
            summonVFX.appendChild(core);
            visual.parts.forEach((src, index) => {
                const part = layer(src, 'umbra-crystal-part');
                part.dataset.crystalPart = index + 1;
                summonVFX.appendChild(part);
            });
        } else summonVFX.classList.add('picto-stat', summon.statIcon);
    } else summonVFX.alt = `${summon.summonDisplayName} lancé sur ${target.dataset.position}`;

    summonCenter.appendChild(summonVFX);
    summonPerspective.appendChild(summonCenter);
    summonContainer.appendChild(summonPerspective);
    effectsContainer.appendChild(summonContainer);

    return { summonId, hexElement };
}

export function consommationSummon(
    summon,
    hexElement,
    summonId,
    removeEffectCallback,
    { attacker = null, effectClass = null, expiresAt = null, consumeItem = null, onSettled = null, onMoved = null, itemId = null,
        infinite = false, adminSpawn = false, adminId = null } = {}
) {
    const node = document.getElementById(summonId);
    if (!node || !hexElement?.isConnected) {
        node?.remove();
        cleanupGroundSummonHex(hexElement);
        removeEffectCallback?.();
        return { ok: false, status: 'invalid-ground-summon' };
    }

    const previous = getGroundSummonOnHex(hexElement, summonId);
    let displaced = null;
    if (previous) {
        const destination = findGroundSummonFallbackHex(previous);
        if (destination) {
            relocateGroundSummon(previous, destination);
            displaced = { summonId: previous.id, status: 'displaced', position: destination.dataset.position };
        } else {
            settleGroundSummon(previous, 'destroyed-no-room');
            displaced = { summonId: previous.id, status: 'destroyed-no-room', position: null };
        }
    }

    const durationMs = Math.max(0, Number(summon.summonDuration) || 0) * 1000;
    const record = {
        id: summonId,
        node,
        hex: hexElement,
        summon,
        attacker,
        attack: attacker?.currentAttack ? cloneCombatSnapshot(attacker.currentAttack, 'ground-summon-attack') : null,
        ownerSide: attacker?.side || getHexZone(hexElement),
        createdAt: clockNow(),
        expiresAt: infinite ? null : expiresAt ?? clockNow() + durationMs,
        durationMs, infinite, adminSpawn, adminId,
        consumeItem, onSettled, onMoved, itemId,
        effectClass,
        settled: false,
        status: 'placed',
    };
    groundSummons.set(record.id, record);
    if (!itemId && !consumeItem) recordSummonCreated(attacker, record, { kind: 'consumables', template: summon });
    if (itemId) {
        node.dataset.itemId = itemId;
    }
    node.classList.add('battle-ground-item-active');
    glitterLoot(node, {
        count: 8, sizeMin: 12, sizeMax: 23,
        durationMin: 3, durationMax: 7, moveX: 25, moveYMin: 25, moveYMax: 60,
        containerClass: 'ground-item-glitter',
    });
    hexElement.classList.add('consommable-summoned');
    refreshHexOccupancy(hexElement);
    if (effectClass) hexElement.classList.add(effectClass);
    bindGroundSummon(record);
    return {
        ok: true,
        status: record.status,
        summonId: record.id,
        position: record.hex.dataset.position,
        displaced,
    };
}

export function placeGroundItem(hex, item, { expiresAt, infinite = false, durationMs = Math.max(0, expiresAt - clockNow()), consume, settled, moved, setupDrag }) {
    if (!hex?.isConnected || !item?.itemId) return false;
    const existing = [...groundSummons.values()].find(record => record.itemId === item.itemId && !record.settled);
    if (existing) {
        Object.assign(existing, { consumeItem: consume, onSettled: settled, onMoved: moved });
        setupDrag?.(existing.node?.querySelector('.battle-ground-item'));
        return true;
    }
    const summon = {
        summonId: item.itemId, summonSprite: item.itemAsset,
        statIcon: item.statIcon,
        isPermanent: item.itemType?.includes('permanent'),
        crystalLevel: getPermanentStatGrant(item)?.crystalLevel,
        summonClass: 'battle-ground-item', summonDisplayName: item.displayName,
        summonDuration: durationMs / 1000,
    };
    const result = summonConsommable(hex, summon);
    if (!result) return false;
    const placed = consommationSummon(summon, hex, result.summonId, null, {
        attacker: { side: 'A' }, itemId: item.itemId, expiresAt,
        infinite, adminSpawn: item.origin === 'admin-spawn',
        consumeItem: consume, onSettled: settled, onMoved: moved,
    }).ok;
    if (placed) setupDrag?.(document.getElementById(result.summonId)?.querySelector('.battle-ground-item'));
    return placed;
}

export function setAdminGroundSummonsInfinite(infinite) {
    const now = clockNow();
    for (const record of groundSummons.values()) {
        if (!record.adminSpawn || record.settled) continue;
        record.infinite = infinite;
        record.createdAt = now;
        record.expiresAt = infinite ? null : now + record.durationMs;
        bindGroundSummon(record);
    }
}

export function releaseGroundItem(itemId) {
    const record = [...groundSummons.values()].find(entry => entry.itemId === itemId && !entry.settled);
    if (record) settleGroundSummon(record, 'retrieved');
}

export function clearGroundItems() {
    for (const [node, observer] of groundLootRemnants) {
        const hex = node.closest('.hex');
        observer.disconnect();
        node.remove();
        cleanupGroundSummonHex(hex);
    }
    groundLootRemnants.clear();
    for (const record of [...groundSummons.values()]) settleGroundSummon(record, 'level-exit');
    for (const entityId of jarretPoisonEffects.keys()) finishJarretPoison(entityId);
}

function bindSummonExpiry(entity, onEnd) {
    setTimeout(() => {
        const hex = getEntityHex(entity);
        entity.isDEAD = true; RemoveEntite(entity);
        if (hex) isHexOccupied(hex.dataset.position);
        onEnd?.();
    }, Math.max(0, entity.summonExpiresAt - clockNow()));
}
registerCombatState('ground', () => ({
    records: [...groundSummons.values()].map(record => ({ ...combatData(record), hex: combatReference(record.hex) })),
    poisons: [...jarretPoisonEffects.values()].map(active => active.state),
}), async (saved, { entities }) => {
    groundSummons.clear(); jarretPoisonEffects.clear();
    for (const data of saved.records) {
        const record = { ...data, node: document.getElementById(data.id), hex: combatTarget(data.hex, entities),
            attacker: entities.find(e => e.id === data.attacker?.id) || data.attacker,
            observer: null, lifetimeAnimation: null, fadeAnimation: null, expiryTimer: null };
        groundSummons.set(record.id, record);
        bindGroundSummon(record, { restoreVisuals: true });
    }
    // Rebind inventory operations to the existing nodes without respawning/rewarding them.
    const items = await import("../items/itemManager.js");
    items.restoreBattleGroundItems();
    for (const state of saved.poisons) {
        const entity = entities.find(e => e.id === state.entity);
        if (entity) applyJarretPoison(entity, state.record, state);
    }
    for (const entity of entities) if (entity.summonExpiresAt && !entity.isDEAD) bindSummonExpiry(entity);
});
window.addEventListener('combatResumed', () => {
    for (const record of groundSummons.values()) void consumeGroundSummon(record);
});
