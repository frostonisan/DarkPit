import { AttackerSbireTargetPriority, AllySbireTargetPriority } from './role-rule.js';
import { calculateOccultismTargetableChanceDisplay, calculateEquilibreInvisibleDetection } from './damagesCalcul.js';
import { EffectMessage } from './attackEffectMecanics.js';

export function sbireFocusEnemy(attacker, validTargets, attackerRole, defenserRole) {
  let availableTargets = validTargets.filter(target => target && !target.isDEAD);
  let selectedTarget = null;

  while (availableTargets.length > 0) {
    selectedTarget = selectSbireFocusEnemyCandidate(
      attacker,
      availableTargets,
      attackerRole,
      defenserRole
    );

    if (!selectedTarget) {
      return null;
    }

    const occultismTargetEscape = attemptOccultismTargetEscape(
      attacker,
      selectedTarget,
      availableTargets
    );

    if (!occultismTargetEscape.escaped) {
      console.log(
        `🎯 ${attacker?.name || "Attaquant"} cible ${selectedTarget.name}`
      );

      return selectedTarget;
    }

    availableTargets = occultismTargetEscape.alternatives;
  }

  return selectedTarget;
}

export function sbireFocusAlly(attacker, allies, attackerRole) {
    let validAlliesFiltered = [];
    let attackerName = attacker.name || 'Attaquant inconnu'; // Supposant que le nom de l'attaquant soit disponible

    // Obtenir les priorités de cibles alliées pour le rôle de l'attaquant
    const priorities = AllySbireTargetPriority[attackerRole] || [];

    // Filtrer les alliés valides selon les priorités
    for (let role of priorities) {
        validAlliesFiltered = allies.filter(ally => ally.role.includes(role) && !ally.isDEAD);
        // console.log(`${attackerName} est un ${attackerRole}. ${role} en vie : ${validAlliesFiltered.length}`);
        if (validAlliesFiltered.length > 0) {
            break;
        }
    }

    // Si aucune des cibles alliées spécifiques n'est trouvée, utiliser les alliés initiaux
    if (validAlliesFiltered.length === 0) {
        validAlliesFiltered = allies;
        // console.log(`Utilisation des alliés initiaux. Alliés valides : ${validAlliesFiltered.length}`);
    }

    // Logique de sélection aléatoire parmi les alliés valides
    const randomIndex = Math.floor(Math.random() * validAlliesFiltered.length);
    const selectedAlly = validAlliesFiltered[randomIndex];

    // console.log(`${attackerName} est un ${attackerRole}. Il choisit d'aider ${selectedAlly.name}, qui est un ${selectedAlly.role}.`);

    return selectedAlly;
}
// SBIRE FOCUS DEAD ALLY
export function sbireFocusDeadAlly(attacker, deadAllies, attackerRole) {
    let validAlliesFiltered = [];
    const attackerName = attacker.name || 'Attaquant inconnu';
    const priorities = AllySbireTargetPriority[attackerRole] || [];

    for (let role of priorities) {
        validAlliesFiltered = deadAllies.filter(ally => ally.role.includes(role));
        // console.log(`${attackerName} est un ${attackerRole}. ${role} mort : ${validAlliesFiltered.length}`);
        if (validAlliesFiltered.length > 0) {
            break;
        }
    }

    if (validAlliesFiltered.length === 0) {
        validAlliesFiltered = deadAllies;
        console.log(`Utilisation des alliés morts initiaux. Alliés valides : ${validAlliesFiltered.length}`);
    }

    const randomIndex = Math.floor(Math.random() * validAlliesFiltered.length);
    const selectedAlly = validAlliesFiltered[randomIndex];

    console.log(`${attackerName} est un ${attackerRole}. Il choisit d'aider ${selectedAlly.name}, qui est un ${selectedAlly.role}.`);

    return selectedAlly;
}

// SBIRE FOCUS DEAD ENEMY
export function sbireFocusDeadEnemy(attacker, deadEnemies, attackerRole) {
    let validEnnemiesFiltered = [];
    const attackerName = attacker.name || 'Attaquant inconnu';
    const priorities = AttackerSbireTargetPriority[attackerRole] || [];

    for (let role of priorities) {
        validEnnemiesFiltered = deadEnemies.filter(ally => ally.role.includes(role));
        console.log(`${attackerName} est un ${attackerRole}. ${role} mort : ${validEnnemiesFiltered.length}`);
        if (validEnnemiesFiltered.length > 0) {
            break;
        }
    }

    if (validEnnemiesFiltered.length === 0) {
        validEnnemiesFiltered = deadEnemies;
        console.log(`Utilisation des ennemis morts initiaux. Ennemis valides : ${validEnnemiesFiltered.length}`);
    }

    const randomIndex = Math.floor(Math.random() * validEnnemiesFiltered.length);
    const selectedEnemy = validEnnemiesFiltered[randomIndex];

    console.log(`${attackerName} est un ${attackerRole}. Il choisit de profanner ${selectedEnemy.name}, qui est un ${selectedEnemy.role}.`);

    return selectedEnemy;
}

function isOccultismInvisibleTarget(target) {
  return (
    Boolean(target?.flags?.occultismInvisible) ||
    Boolean(target?.isInvisible) ||
    Boolean(target?.invisible)
  );
}

function getTargetHpCurrent(target) {
  return Number(target?.stats?.HP?.current ?? target?.stats?.HP ?? Infinity);
}

function getRoles(target) {
  return Array.isArray(target?.role)
    ? target.role
    : [target?.role].filter(Boolean);
}

function attemptOccultismTargetEscape(attacker, target, availableTargets) {
  if (!target || !isOccultismInvisibleTarget(target)) {
    return {
      escaped: false,
      alternatives: availableTargets,
    };
  }

  const alternatives = availableTargets.filter(candidate =>
    candidate &&
    !candidate.isDEAD &&
    candidate.id !== target.id
  );

  if (alternatives.length === 0) {
    console.log(
      `🌑 ${target.name} est invisible, mais reste ciblée car elle est seule.`
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
    `🌑 Ciblage occulte : ${attacker?.name || "Attaquant"} tente de cibler ${target.name} ` +
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
function selectSbireFocusEnemyCandidate(attacker, validTargets, attackerRole, defenserRole) {
  let validTargetsFiltered = [];
  const priorities = AttackerSbireTargetPriority[attackerRole] || [];

  for (let role of priorities) {
    validTargetsFiltered = validTargets.filter(target => {
      const roles = getRoles(target);
      return roles.includes(role) && !target.isDEAD;
    });

    if (validTargetsFiltered.length > 0) {
      break;
    }
  }

  if (validTargetsFiltered.length === 0) {
    validTargetsFiltered = validTargets.filter(target => !target.isDEAD);
  }

  let selectedTarget = null;

  if (defenserRole === "gueux") {
    const gueuxTargets = validTargetsFiltered.filter(target => {
      const roles = getRoles(target);
      return roles.includes("gueux") && !target.isDEAD;
    });

    if (gueuxTargets.length > 0) {
      selectedTarget = gueuxTargets.reduce((weakest, current) => {
        return getTargetHpCurrent(weakest) < getTargetHpCurrent(current)
          ? weakest
          : current;
      }, gueuxTargets[0]);
    }
  }

  if (!selectedTarget && validTargetsFiltered.length > 0) {
    selectedTarget = validTargetsFiltered[
      Math.floor(Math.random() * validTargetsFiltered.length)
    ];
  }

  return selectedTarget;
}