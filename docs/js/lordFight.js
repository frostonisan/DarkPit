import { listingFocusLord } from './role-rule.js'; 
import { calculateEquilibreAggroReduction, calculateEquilibreInvisibleDetection, calculateOccultismTargetableChanceDisplay } from './damagesCalcul.js';
import { EffectMessage } from './attackEffectMecanics.js';

export let globalTargetName = null;
function isOccultismInvisibleTarget(target) {
  return (
    Boolean(target?.flags?.occultismInvisible) ||
    Boolean(target?.isInvisible) ||
    Boolean(target?.invisible)
  );
}

function getHpCurrent(entity) {
  return Number(entity?.stats?.HP?.current ?? entity?.stats?.HP ?? Infinity);
}

function calculateLordAggroEntry(entity) {
  const totalDamage = entity.totalAggroDamage ?? entity.totalDamage ?? 0;
  const totalHeal = entity.totalHeal || 0;
  const totalKills = entity.kills || 0;

  const aggroReduction = Math.max(
    0,
    Math.min(100, Number(calculateEquilibreAggroReduction(entity)) || 0)
  );

  const aggroDamage = totalDamage * (1 - aggroReduction / 100);
  const aggroHeal = totalHeal * 1.1;
  const aggroKills = totalKills * 2;

  const roles = Array.isArray(entity.role)
    ? entity.role
    : [entity.role].filter(Boolean);

  let aggroRole = 1.0;

  if (roles.includes('tank')) {
    aggroRole = 1.6;
  } else if (roles.includes('gueux')) {
    aggroRole = 1.2;
  }

  const aggroScore = (aggroDamage + aggroHeal + aggroKills) * aggroRole;

  return {
    name: entity.name,
    id: entity.id,
    portrait: entity.portrait,
    totalDamage,
    totalHeal,
    kills: totalKills,
    aggroDamage,
    rawDamageAggro: totalDamage,
    aggroReduction,
    aggroScore,
    aggroRole,
    role: roles,
    isDEAD: entity.isDEAD,
    entity,
  };
}

function selectLordTargetCandidate(defendingEntities) {
  const livingEntries = defendingEntities
    .filter(entity => entity && !entity.isDEAD)
    .map(calculateLordAggroEntry);

  if (livingEntries.length === 0) {
    return {
      selectedEntry: null,
      allEntitiesAggro: [],
    };
  }

  let selectedEntry = livingEntries.reduce((best, current) => {
    if (current.aggroScore > best.aggroScore) return current;
    if (current.aggroScore < best.aggroScore) return best;

    return getHpCurrent(current.entity) < getHpCurrent(best.entity)
      ? current
      : best;
  }, livingEntries[0]);

  const allEntitiesAggro = [...livingEntries].sort(
    (a, b) => b.aggroScore - a.aggroScore
  );

  return {
    selectedEntry,
    allEntitiesAggro,
  };
}

function attemptLordOccultismTargetEscape(attacker, selectedEntry, availableEntities) {
  const target = selectedEntry?.entity;

  if (!target || !isOccultismInvisibleTarget(target)) {
    return {
      escaped: false,
      alternatives: availableEntities,
    };
  }

  const alternatives = availableEntities.filter(entity =>
    entity &&
    !entity.isDEAD &&
    entity.id !== target.id
  );

  if (alternatives.length === 0) {
    console.log(
      `🌑 ${target.name} est invisible, mais reste ciblée par le lord car elle est seule.`
    );

    return {
      escaped: false,
      alternatives,
    };
  }

  const baseEscapeChance = Math.max(
    0,
    Math.min(100, Number(calculateOccultismTargetableChanceDisplay(target)) || 0)
  );

  const detectionChance = Math.max(
    0,
    Math.min(100, Number(calculateEquilibreInvisibleDetection(attacker)) || 0)
  );

  const escapeChance = Math.max(
    0,
    Math.min(100, baseEscapeChance - detectionChance)
  );

  if (escapeChance <= 0) {
    console.log(
      `🌑 Ciblage occulte lord : ${attacker?.name || "Lord"} détecte ${target.name} ` +
      `| invisibilité ${baseEscapeChance}% - détection ${detectionChance}% = 0% d’évitement`
    );

    if (detectionChance > 0) {
      EffectMessage(attacker, "Perseption équilibrée !");
    }

    return {
      escaped: false,
      alternatives,
    };
  }

  const roll = Math.random() * 100;
  const escaped = roll < escapeChance;

  console.log(
    `🌑 Ciblage occulte lord : ${attacker?.name || "Lord"} tente de cibler ${target.name} ` +
    `| invisibilité ${baseEscapeChance}% - détection ${detectionChance}% = évitement ${escapeChance}% ` +
    `| roll ${roll.toFixed(2)} → ` +
    `${escaped ? "✅ cible perdue" : "❌ cible conservée"}`
  );

  if (!escaped && detectionChance > 0) {
    EffectMessage(attacker, "Perseption équilibrée !");
  }

  return {
    escaped,
    alternatives,
    roll: Number(roll.toFixed(2)),
    escapeChance,
  };
}
// LORD TARGET
export function lordEnemyTarget(defendingEntities, deadEnemies, resolve, attacker) {
  const attackerName = attacker?.name || "Lord inconnu";
  const attackerId = attacker?.id;

  let availableEntities = defendingEntities.filter(entity => entity && !entity.isDEAD);

  let selectedEntry = null;
  let allEntitiesAggro = [];

  while (availableEntities.length > 0) {
    const selection = selectLordTargetCandidate(availableEntities);

    selectedEntry = selection.selectedEntry;
    allEntitiesAggro = selection.allEntitiesAggro;

    if (!selectedEntry) {
      break;
    }

    const occultismTargetEscape = attemptLordOccultismTargetEscape(
      attacker,
      selectedEntry,
      availableEntities
    );

    if (!occultismTargetEscape.escaped) {
      break;
    }

    availableEntities = occultismTargetEscape.alternatives;
  }

  const selectedTarget = selectedEntry;
  globalTargetName = selectedTarget ? selectedTarget.name : null;

  if (selectedTarget) {
    const targetEntityInDefendingEntities = defendingEntities.find(
      e => e.id === selectedTarget.id
    );

    if (targetEntityInDefendingEntities) {
      targetEntityInDefendingEntities.status = 'new-target';
      console.log(
        `NEW TARGET : Nom: ${targetEntityInDefendingEntities.name} Statut: ${targetEntityInDefendingEntities.status}`
      );
    }
  }

  allEntitiesAggro.sort((a, b) => b.aggroScore - a.aggroScore);

  if (selectedTarget) {
    console.log(
      `${attackerName} commence son attaque sur ${selectedTarget.name} ` +
      `(car ${selectedTarget.name} a le plus gros score d'aggro : ${selectedTarget.aggroScore.toFixed(2)}pts)`
    );

    const targetEntity = defendingEntities.find(e => e.id === selectedTarget.id);

    allEntitiesAggro.forEach(entity => {
      console.log(
        `Score d'aggro de ${entity.name} (Role: ${Array.isArray(entity.role) ? entity.role.join(', ') : entity.role}) : ` +
        `Dégâts - ${entity.aggroDamage.toFixed(2)}pts ` +
        `(base ${entity.rawDamageAggro}pts, réduction ${entity.aggroReduction}%), ` +
        `Soins - ${entity.totalHeal}pts, ` +
        `Kills - ${entity.kills}, ` +
        `Multiplicateur rôle - x${entity.aggroRole}, ` +
        `Score d'aggro - ${entity.aggroScore.toFixed(2)}pts`
      );
    });

    updateLordRoleImg(attackerId, targetEntity);
    listingFocusLord(attackerId, allEntitiesAggro);
  } else {
    console.log(`${attackerName} n'a trouvé aucune cible valide pour l'attaque.`);
    updateLordRoleImg(null);
  }

  resolve(defendingEntities.find(e => e.id === (selectedTarget ? selectedTarget.id : null)));
}

// LORD ATTACK
export function lordAttackEnemy(attacker) {
    if (!attacker.attacks || attacker.attacks.length === 0) {
        console.error("Aucune attaque disponible pour cet attaquant.");
        return null; // Assure que la fonction renvoie null si aucune attaque n'est disponible
    }
    const attackIndex = Math.floor(Math.random() * attacker.attacks.length);
    return attacker.attacks[attackIndex];
}

// LORD IMAGE TARGET HUD
export function updateLordRoleImg(attackerId, targetEntity) {
    // Sélectionne l'élément avec l'id 'role-img_{attackerId}'
    const lordRoleImg = document.getElementById(`Targetrole-img_${attackerId}`);

    if (lordRoleImg) {
        if (targetEntity && targetEntity.portrait) {
            // Met à jour le background-image avec l'URL du portrait de la cible
            lordRoleImg.style.backgroundImage = `url('${targetEntity.portrait}')`;
            lordRoleImg.style.backgroundSize = 'cover'; // Optionnel : Ajuste la taille de l'image
            lordRoleImg.style.backgroundPosition = 'center'; // Optionnel : Centre l'image
            
            // Ajoute l'attribut data-target avec l'id de la cible
            lordRoleImg.setAttribute('data-target', targetEntity.id);
        } else {
            // Si aucune cible ou portrait, réinitialise le background-image
            lordRoleImg.style.backgroundImage = '';

            // Supprime l'attribut data-target si présent
            lordRoleImg.removeAttribute('data-target');
        }
    } else {
        console.warn(`L'élément avec l'id 'role-img_${attackerId}' n'a pas été trouvé dans le DOM.`);
    }
}


