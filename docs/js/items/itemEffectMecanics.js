import { ensureMovementState } from "../board/deployment.js";
import { updateMovementDisplay } from "../rendering/hud.js";
import { updateHealthBar, updateBonusLifeCounters } from "../rendering/vitalFeedback.js";
import {
  removeCombatVisualAfter, setTimeout,
} from "../combat/clock.js";
import {
  itemSaveEntityHPToStorage,
  recordEntityCombatAmount,
  recordEntityHealingReceived,
  recordEntityDamageReceived,
  saveEntireEntityToStorage,
  saveEntityMovementState,
  saveEntityfadedLifeToStorage,
} from "../storage/entityStorage.js";
import { itemEffects } from './itemEffects.js';
import { showHealingFeedback, toggleEffectClass, rez } from "../combat/effects.js";
import { LifeandDeath } from "../combat/vitals.js";
import { addMovementCharges, addFadedLife } from './resourceStocks.js';
import { getStageAccess, refreshStageAccess } from "../app/state.js";
import { calculateResistances, recomputeEntityStats } from "../entities/runtime.js";
import { getPermanentStatGrant } from './permanentItems.js';
import { loadFromLocalStorage } from "../storage/gameStorage.js";
import { showGamePopupMessage, showStatGainFeedback } from "../ui/display.js";
import { syncDOMWithStats } from "../ui/statistics/components.js";

export function calculateItemDamages(target, effect, item) {
    if (!target || !target.stats.HP) {
        console.warn(`❌ Cible invalide pour calcul des dégâts.`);
        return 0;
    }

   const totalDamageSources = {
    piercingDamage: item?.piercingDamage ?? 0,
    physical: item?.physicalDamage ?? 0,
    magical: item?.MagicDamage ?? 0,
    hybridalDamage: item?.hybridalDamage ?? 0
};

    const totalBefore = Object.values(totalDamageSources).reduce((sum, val) => sum + val, 0);
    if (totalBefore <= 0) {
        console.log(`🪶 Aucun dommage à calculer pour ${effect.effectName}.`);
        return 0;
    }

    const reduced = calculateResistances(target, totalDamageSources);

    const totalAfter =
        reduced.reducedpiercingDamage +
        reduced.reducedPhysicalDamage +
        reduced.reducedMagicalDamage +
        reduced.reducedHybridalDamage;

    if (totalAfter <= 0) {
        console.log(`🛡️ Tous les dégâts de ${effect.effectName} ont été absorbés.`);
    }

    return totalAfter;
}

function isLivingItemTarget(target) {
    return Number(target?.stats?.HP?.current) > 0 &&
        !target.isDEAD && !target.statut?.includes('dead');
}

const implementedConsumableEffects = new Set(['itemHeal', 'itemDamage', 'itemRez', 'itemResetProgression', 'itemMovement', 'itemFadedLife', 'itemExtraLife', 'itemEternalLife', 'itemPermanentStat']);

export function hasImplementedConsumableEffects(item) {
    return Array.isArray(item?.effets) && item.effets.length > 0 && item.effets.every(name =>
        implementedConsumableEffects.has(name) && itemEffects.some(effect => effect.effectName === name));
}

export function validateConsumableUse(target, item) {
    if (!hasImplementedConsumableEffects(item)) return { ok: false, message: 'Effets de cet objet pas encore disponibles.' };
    if (!target?.stats?.HP) return { ok: false, message: 'Cible indisponible.' };
    let alive = isLivingItemTarget(target);
    let hp = Number(target.stats.HP.current);
    const max = Number(target.stats.HP.max);
    if (!Number.isFinite(hp) || !Number.isFinite(max) || max <= 0) return { ok: false, message: 'Points de vie invalides.' };
    const steps = [];
    for (const name of item.effets || []) {
        if (name === 'itemRez') {
            if (alive) return { ok: false, message: 'Cette entité est déjà vivante.' };
            if (!target.isDEAD || hp > 0) return { ok: false, message: 'La mort de cette entité n’est pas encore résolue.' };
            if (target.corpseDestroyed || target.corpseConsumed) return { ok: false, message: 'Ce cadavre ne peut plus être ressuscité.' };
            alive = true;
        } else if (!alive) {
            return { ok: false, message: 'Ce consommable ne peut pas être utilisé sur une entité morte.' };
        }
        if (name === 'itemResetProgression' && !getStageAccess().menusAllowed) {
            return { ok: false, message: 'Non utilisable en combat.' };
        }
        if (name === 'itemResetProgression' && Number(target.level?.current ?? target.level ?? 1) <= 1) {
            return { ok: false, reason: 'already-pure', message: 'Votre entité est déjà pure. Impossible de la purifier.' };
        }
        let amount = 0;
        if (name === 'itemPermanentStat') {
            const grant = getPermanentStatGrant(item);
            if (!grant || !target.baseStats) return { ok: false, message: 'Statistique permanente invalide.' };
            amount = grant.amount;
        }
        if (name === 'itemHeal') amount = Number(item.HealAmount ?? item.MagicDamage ?? 15);
        if (name === 'itemDamage') amount = calculateItemDamages(target, itemEffects.find(effect => effect.effectName === name), item);
        if (name === 'itemRez') amount = Number(item.HealAmount ?? item.MagicDamage ?? Math.floor(max * 0.1)) || 30;
        if (name === 'itemMovement') amount = Number(item.MovementAmount);
        if (name === 'itemFadedLife') amount = Number(item.FadedLifeAmount);
        if (name === 'itemExtraLife') amount = Number(item.ExtraLifeAmount);
        if (name === 'itemEternalLife') amount = Number(item.EternalLifeAmount);
        if (!Number.isFinite(amount) || amount < 0) return { ok: false, message: 'Valeur de consommable invalide.' };
        if (['itemMovement', 'itemFadedLife', 'itemExtraLife', 'itemEternalLife'].includes(name) && (!Number.isInteger(amount) || amount < 1)) {
            return { ok: false, message: 'Nombre de charges invalide.' };
        }
        const before = hp;
        if (name === 'itemHeal') hp = Math.min(max, hp + amount);
        if (name === 'itemDamage') hp = Math.max(0, hp - amount);
        if (name === 'itemRez') hp = Math.min(max, Math.max(1, amount));
        alive = hp > 0;
        steps.push({ name, amount, before, hp });
    }
    return { ok: true, steps };
}

function itemFeedback(callback, pending) {
    if (pending) { pending.push(callback); return; }
    try { callback(); }
    catch (error) { console.error('[ConsumableFeedback]', error); }
}

export async function itemApplyEffect(target, effectName, item, { canApply = () => true, commit = () => true, step, feedback } = {}) {
    const effet = itemEffects.find(e => e.effectName === effectName);
    if (!effet) {
        console.warn(`❌ Effet d’objet ${effectName} introuvable.`);
        return { ok: false, message: 'Effet de consommable inconnu.' };
    }
    if (!target?.stats?.HP || !canApply()) {
        return { ok: false, message: 'Objet ou cible indisponible.' };
    }
    if (effectName !== 'itemRez' && !isLivingItemTarget(target)) {
        return { ok: false, message: 'Ce consommable ne peut pas être utilisé sur une entité morte.' };
    }

    if (effectName === 'itemResetProgression') {
        return itemResetProgression(target, item, canApply, commit);
    }

    if (!step) {
        const prepared = validateConsumableUse(target, { ...item, effets: [effectName] });
        if (!prepared.ok) return prepared;
        step = prepared.steps[0];
    }
    if (!commit()) return { ok: false, message: 'Objet indisponible.' };
    itemFeedback(() => toggleEffectClass(target, effectName, 'add'), feedback);
    try {
        switch (effectName) {
            case 'itemPermanentStat': {
                const grant = getPermanentStatGrant(item);
                const oldStats = structuredClone(target.stats);
                const base = target.baseStats[grant.key];
                const fallback = grant.key === 'speed' ? 1000 : 0;
                const value = (Number(base?.max ?? base?.current ?? base ?? fallback) || 0) + grant.amount;
                target.baseStats[grant.key] = base && typeof base === 'object'
                    ? { ...base, [base.max != null ? 'max' : 'current']: value }
                    : value;
                if (item.serial === 'umbra-crystal') {
                    target.baseStatSources ??= {};
                    target.baseStatSources.crystal ??= {};
                    target.baseStatSources.crystal[grant.key] = (Number(target.baseStatSources.crystal[grant.key]) || 0) + grant.amount;
                }
                if (grant.key === 'fadedLife') addFadedLife(target, grant.amount, 'natural');
                recomputeEntityStats(target, { skipReverseArchetype: true });
                saveEntireEntityToStorage(target);
                itemFeedback(() => {
                    syncDOMWithStats(oldStats, target.stats, target.id, target);
                    updateBonusLifeCounters(target);
                    showStatGainFeedback(target, [{ stat: grant.key, amount: grant.amount, unit: grant.unit }]);
                    window.dispatchEvent(new CustomEvent('selectedArmyAUpdated', {
                        detail: { source: 'permanent-item', entityId: target.id, entite: target },
                    }));
                }, feedback);
                return { ok: true, amount: grant.amount, stat: grant.key };
            }
            case 'itemHeal':
                return itemHeal(target, effet, item, null, { step, feedback });
            case 'itemDamage':
                return itemDamage(target, effet, item, null, { step, feedback });
            case 'itemRez':
                return itemRez(target, effet, item, null, { step, feedback });
            case 'itemMovement': {
                ensureMovementState(target);
                const amount = addMovementCharges(target, step.amount);
                saveEntityMovementState(target);
                itemFeedback(() => {
                    updateMovementDisplay(target);
                    showStatGainFeedback(target, [{ stat: 'shift', amount, unit: ' ch. sup.' }]);
                }, feedback);
                return { ok: true, amount };
            }
            case 'itemExtraLife':
            case 'itemEternalLife':
            case 'itemFadedLife': {
                addFadedLife(target, step.amount, 'consumable');
                saveEntityfadedLifeToStorage(target);
                itemFeedback(() => {
                    updateBonusLifeCounters(target);
                    showStatGainFeedback(target, [{ stat: 'fadedLife', amount: step.amount }]);
                }, feedback);
                return { ok: true, amount: step.amount };
            }
            default:
                return { ok: false, message: 'Effet de consommable indisponible.' };
        }
    } finally {
        itemFeedback(() => toggleEffectClass(target, effectName, 'remove'), feedback);
    }
}

async function itemResetProgression(target, item, canApply, commit) {
    const hasProgression = entity => Number(entity?.level?.current ?? entity?.level ?? 1) > 1;
    const alreadyPure = {
        ok: false,
        reason: 'already-pure',
        message: 'Votre entité est déjà pure. Impossible de la purifier.',
    };
    // Load the reset service only on use: it also depends on the item/UI modules.
    const { previewEntityReset, resetEntityProgression } = await import("../entities/progression.js");
    const getCurrentTarget = () => {
        const army = loadFromLocalStorage('selectedArmyA', []);
        return Array.isArray(army) ? army.find(entity => String(entity.id) === String(target.id)) : null;
    };
    const previewTarget = getCurrentTarget();
    if (!isLivingItemTarget(previewTarget) || !canApply()) {
        return { ok: false, message: 'L’Anima nécessite un objet disponible et une entité vivante.' };
    }
    if (!hasProgression(previewTarget)) return alreadyPure;
    const preview = await previewEntityReset(previewTarget);
    if (!preview?.ok) return preview || { ok: false };

    const message = document.createElement('div');
    message.innerHTML = `
        <p>Vous êtes sur le point de consommer une
            <span class="anima-reset-item"><img class="anima-reset-item-icon" alt=""><span class="quality-divine">Anima ombilicale</span></span>
            présente dans votre inventaire pour purifier <span data-purification-entity></span>.<br>
            Elle retombera au niveau 1 et perdra de nombreuses statistiques.<br>
            Cette opération est irréversible.
        </p>
        <p>Vous récupérerez <strong data-purification-xp></strong> d’expérience au cours du processus.<br>
            Voulez-vous continuer cet acte charitable ?
        </p>
    `;
    // Keep save data out of the HTML template while allowing rich confirmation markup.
    message.querySelector('[data-purification-entity]').textContent = previewTarget.nickname || previewTarget.name || 'cette entité';
    message.querySelector('[data-purification-xp]').textContent = `${preview.refundXP} points`;
    message.querySelector('.anima-reset-item-icon').src = item.itemAsset;

    const accepted = await showGamePopupMessage({
        mode: 'manual',
        tone: 'warning',
        key: `anima-reset-${target.id}`,
        className: 'anima-reset-confirm',
        title: `Purifier ${previewTarget.nickname || previewTarget.name || 'cette entité'} ?`,
        message,
        focusSelector: 'button',
        actions: [
            { label: 'Annuler', value: false },
            { label: 'Purifier et consommer', value: true, primary: true },
        ],
    });
    if (accepted !== true) return { ok: false, cancelled: true };

    const currentTarget = getCurrentTarget();
    if (!isLivingItemTarget(currentTarget) || !canApply()) {
        return { ok: false, message: 'L’objet ou l’entité vivante n’est plus disponible. Anima conservée.' };
    }
    if (!hasProgression(currentTarget)) return alreadyPure;
    const currentPreview = await previewEntityReset(currentTarget);
    if (!currentPreview?.ok) return currentPreview || { ok: false };
    const sameIds = key => JSON.stringify([...(preview[key] || [])].sort()) ===
        JSON.stringify([...(currentPreview[key] || [])].sort());
    if (currentPreview.refundXP !== preview.refundXP ||
        currentPreview.refundPercent !== preview.refundPercent ||
        !sameIds('removedEssenceIds') || !sameIds('returnedEquipmentIds')) {
        return { ok: false, message: 'La progression a changé. Réutilisez l’Anima pour confirmer le nouvel aperçu.' };
    }

    if (!commit()) return { ok: false, message: 'Objet indisponible.' };
    const result = await resetEntityProgression(currentTarget, { refundExperience: true });
    if (result?.ok) Object.assign(target, currentTarget);
    return result;
}
export function playItemEffectVFX(target, effet) {
    const container = document.getElementById(`effectsContainer_${target.id}`) || document.getElementById(`codex-entity-sprite-container_${target.id}`);
    if (!container) {
        console.warn(`❌ Aucun container DOM trouvé pour codex-entity-sprite-container_${target.id}`);
        return;
    }

    if (!effet.effectVFX || !effet.VFXduration) {
        console.warn(`⚠️ Aucun VFX défini pour ${effet.effectName}.`);
        return;
    }

    const duration = parseInt(effet.VFXduration, 10);
    if (isNaN(duration)) {
        console.warn(`❌ VFXduration invalide pour ${effet.effectName} : ${effet.VFXduration}`);
        return;
    }

    const vfx = document.createElement('img');
    vfx.src = effet.effectVFX;
    // vfx.alt = effet.effectName;
    vfx.className = `itemeffectVfx effect-vfx ${effet.effectName}`;

    container.appendChild(vfx);
    console.log(`🎞️ VFX affiché : ${effet.effectVFX} (durée ${duration}ms)`);

    removeCombatVisualAfter(vfx, duration);
}


export function itemHeal(target, effect, item, onComplete, { step, feedback } = {}) {
    if (!target?.stats?.HP) {
        console.warn(`❌ Cible invalide pour le soin.`);
        return { ok: false, message: 'Cible invalide pour le soin.' };
    }

    if (target.stats.HP.current <= 0) {
        console.warn(`⚰️ ${target.name} est mort(e). Soin annulé.`);
        return { ok: false, message: 'Une entité morte ne peut pas être soignée.' };
    }

   const amount = item?.HealAmount ?? item?.MagicDamage ?? 15;

    const hpBeforeHeal = Number(target.stats.HP.current) || 0;
    target.stats.HP.current = step?.hp ?? Math.min(target.stats.HP.max, hpBeforeHeal + amount);
    const restoredHP = Math.max(0, target.stats.HP.current - hpBeforeHeal);
    recordEntityCombatAmount(target, 'consumableHealingReceived', restoredHP);
    recordEntityHealingReceived(target, restoredHP);
    itemSaveEntityHPToStorage(target);
    itemFeedback(() => {
        updateHealthBar(target.stats.HP.current, target.stats.HP.max, target.stats.armor?.current || 0, target.stats.armor?.max || 0, target.id);
        showHealingFeedback(target, Math.max(0, target.stats.HP.current - hpBeforeHeal));
    }, feedback);

    if (onComplete) onComplete();
    return { ok: true };
}

export function itemDamage(target, effect, item, onComplete, { step, feedback } = {}) {
    if (!target?.stats?.HP) {
        console.warn(`❌ Cible invalide pour dégâts.`);
        return { ok: false, message: 'Cible invalide pour les dégâts.' };
    }
    if (!isLivingItemTarget(target)) return { ok: false, message: 'Cette entité est déjà morte.' };

    const totalAfter = step?.amount ?? calculateItemDamages(target, effect, item);

    if (totalAfter <= 0) return { ok: true };

    const hpBefore = Number(target.stats.HP.current) || 0;
    target.stats.HP.current = step?.hp ?? Math.max(0, hpBefore - totalAfter);
    const hpLost = Math.max(0, hpBefore - target.stats.HP.current);
    recordEntityCombatAmount(target, 'consumableDamageReceived', hpLost);
    recordEntityDamageReceived(target, hpLost);
    itemSaveEntityHPToStorage(target);
    LifeandDeath(target);
    refreshStageAccess();
    console.log(`💢 ${target.name} subit ${totalAfter} dégâts via objet.`);

    itemFeedback(() => {
        updateHealthBar(target.stats.HP.current, target.stats.HP.max, target.stats.armor?.current || 0, target.stats.armor?.max || 0, target.id);
        playItemEffectVFX(target, effect);
    }, feedback);
    if (onComplete) onComplete();
    return { ok: true };
}

export function itemRez(target, effect, item, onComplete, { step, feedback } = {}) {
    if (!target?.stats?.HP) {
        console.warn(`❌ Cible invalide pour résurrection.`);
        return { ok: false, message: 'Cible invalide pour la résurrection.' };
    }

    if (target.stats.HP.current > 0 || target.corpseDestroyed || target.corpseConsumed) {
        console.warn(`⚠️ ${target.name} est déjà vivant(e). Résurrection annulée.`);
        return { ok: false, message: 'Cette entité est déjà vivante.' };
    }

    console.log(`🕊️ Tentative de résurrection de ${target.name} (ID: ${target.id})`);

    // 1. Déterminer la valeur de résurrection
   const amount = step?.amount ?? ((item?.HealAmount ?? item?.MagicDamage ?? Math.floor(target.stats.HP.max * 0.1)) || 30);

    console.log(`🔧 Calcul des PV restaurés : ${amount}`);

    if (!rez(target, { restoredHP: amount, feedback })) return { ok: false, message: 'Ce cadavre ne peut plus être ressuscité.' };
    recordEntityCombatAmount(target, 'consumableHealingReceived', target.stats.HP.current);
    refreshStageAccess();

    // 5. Sauvegarde dans le localStorage
    try {
        saveEntireEntityToStorage(target);
        console.log(`📥 Données sauvegardées dans le localStorage pour ${target.name}`);
    } catch (err) {
        console.error(`❌ Erreur lors de la sauvegarde de ${target.name} :`, err);
        return { ok: false, message: 'La résurrection n’a pas pu être sauvegardée.' };
    }

    // 6. Mise à jour visuelle de la barre de vie
    itemFeedback(() => {
        updateHealthBar(target.stats.HP.current, target.stats.HP.max, target.stats.armor?.current || 0, target.stats.armor?.max || 0, target.id);
        playItemEffectVFX(target, effect);
    }, feedback);

    // 7. Affichage du VFX de résurrection
    console.log(`✅ Résurrection terminée pour ${target.name} (ID: ${target.id})`);

    if (onComplete) onComplete();
    return { ok: true };
}
