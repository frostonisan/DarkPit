import { updateHealthBar } from './UpgradeEntity.js';
import { applyItemHPChange } from './entityUpdatesStorage.js';
import { itemEffects } from './itemEffects.js';
import { toggleEffectClass } from './attackEffectMecanics.js';
import { itemSaveEntityHPToStorage, saveEntireEntityToStorage } from './entityUpdatesStorage.js';
import { calculateResistances } from './entites.js';

export function calculateItemDamages(target, effect, item) {
    if (!target || !target.stats.HP) {
        console.warn(`❌ Cible invalide pour calcul des dégâts.`);
        return 0;
    }

   const totalDamageSources = {
    raw: item?.piercingDamage ?? 0,
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

export function itemApplyEffect(target, effectName, item) {
    const effet = itemEffects.find(e => e.effectName === effectName);
    if (!effet) {
        console.warn(`❌ Effet d’objet ${effectName} introuvable.`);
        return;
    }

    // CSS anim
    toggleEffectClass(target, effectName, 'add');

    // Applique la fonction spécifique à l’effet
   switch (effectName) {
    case 'itemHeal':
        itemHeal(target, effet, item, () => toggleEffectClass(target, effectName, 'remove'));
        break;

    case 'itemDamage':
        itemDamage(target, effet, item, () => toggleEffectClass(target, effectName, 'remove'));
        break;

    case 'itemRez':
        itemRez(target, effet, item, () => toggleEffectClass(target, effectName, 'remove'));
        break;

    default:
        console.warn(`⚠️ Aucun effet spécifique prévu pour ${effectName}.`);
        toggleEffectClass(target, effectName, 'remove');
        break;
}
}
export function playItemEffectVFX(target, effet) {
    const container = document.getElementById(`codex-entity-sprite-container_${target.id}`);
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

    setTimeout(() => vfx.remove(), duration);
}


export function itemHeal(target, effect, item, onComplete) {
    if (!target || !target.stats.HP) {
        console.warn(`❌ Cible invalide pour le soin.`);
        return;
    }

    if (target.stats.HP.current <= 0) {
        console.warn(`⚰️ ${target.name} est mort(e). Soin annulé.`);
        return;
    }

   const amount = item?.HealAmount ?? item?.MagicDamage ?? 15;

    applyItemHPChange(target, +amount);
    playItemEffectVFX(target, effect);

    if (onComplete) onComplete();
}

export function itemDamage(target, effect, item, onComplete) {
    if (!target || !target.stats.HP) {
        console.warn(`❌ Cible invalide pour dégâts.`);
        return;
    }

    const totalAfter = calculateItemDamages(target, effect, item);

    if (totalAfter <= 0) return;

    applyItemHPChange(target, -totalAfter);
    console.log(`💢 ${target.name} subit ${totalAfter} dégâts via objet.`);

    playItemEffectVFX(target, effect);
    if (onComplete) onComplete();
}

export function itemRez(target, effect, item, onComplete) {
    if (!target || !target.stats.HP) {
        console.warn(`❌ Cible invalide pour résurrection.`);
        return;
    }

    if (target.stats.HP.current > 0) {
        console.warn(`⚠️ ${target.name} est déjà vivant(e). Résurrection annulée.`);
        return;
    }

    console.log(`🕊️ Tentative de résurrection de ${target.name} (ID: ${target.id})`);

    // 1. Déterminer la valeur de résurrection
   const amount = (item?.HealAmount ?? item?.MagicDamage ?? Math.floor(target.stats.HP.max * 0.1)) || 30;

    console.log(`🔧 Calcul des PV restaurés : ${amount}`);

    // 2. Appliquer la vie restaurée
    target.stats.HP.current = Math.min(amount, target.stats.HP.max);
    console.log(`💉 HP après résurrection : ${target.stats.HP.current}/${target.stats.HP.max}`);

    // 3. Marquer comme vivant
    target.isDEAD = false;

    // 4. Mise à jour du statut
    const previousStatut = [...target.statut];
    target.statut = target.statut.filter(s => s !== "dead");
    if (!target.statut.includes("alive")) target.statut.push("alive");

    console.log(`♻️ Statut mis à jour : ${previousStatut.join(", ")} → ${target.statut.join(", ")}`);

    // 5. Sauvegarde dans le localStorage
    try {
        saveEntireEntityToStorage(target);
        console.log(`📥 Données sauvegardées dans le localStorage pour ${target.name}`);
    } catch (err) {
        console.error(`❌ Erreur lors de la sauvegarde de ${target.name} :`, err);
    }

    // 6. Mise à jour visuelle de la barre de vie
   updateHealthBar(target.stats.HP.current, target.stats.HP.max, target.stats.armor?.current || 0, target.stats.armor?.max || 0, target.id);

    // 7. Affichage du VFX de résurrection
     playItemEffectVFX(target, effect);
    console.log(`✅ Résurrection terminée pour ${target.name} (ID: ${target.id})`);

    if (onComplete) onComplete();
}
