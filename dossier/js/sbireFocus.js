import { AttackerSbireTargetPriority, AllySbireTargetPriority } from './role-rule.js';

export function sbireFocusEnemy(attacker, validTargets, attackerRole, defenserRole) {
    let validTargetsFiltered = [];
    let attackerName = attacker.name || 'Attaquant inconnu';

    // Obtenir les priorités de cibles pour le rôle de l'attaquant
    const priorities = AttackerSbireTargetPriority[attackerRole] || [];

    // Filtrer les cibles valides selon les priorités
    for (let role of priorities) {
        validTargetsFiltered = validTargets.filter(target => {
            if (Array.isArray(target.role)) {
                return target.role.includes(role) && !target.isDEAD;
            } else {
                return target.role === role && !target.isDEAD;
            }
        });

        // console.log(`${attackerName} est un ${attackerRole}. ${role} en vie : ${validTargetsFiltered.length}`);
        // console.log('Cibles filtrées:', validTargetsFiltered); // Journal des cibles filtrées
        if (validTargetsFiltered.length > 0) {
            break;
        }
    }

    // Si aucune des cibles spécifiques n'est trouvée, utiliser les cibles initiales
    if (validTargetsFiltered.length === 0) {
        validTargetsFiltered = validTargets.filter(target => !target.isDEAD);
        // console.log(`Utilisation des cibles initiales. Cibles valides : ${validTargetsFiltered.length}`);
    }

    // Logique de sélection aléatoire parmi les cibles valides
    let selectedTarget;

    // Vérifier si la cible choisie est un "gueux"
    if (defenserRole === 'gueux') {
        // Filtrer les cibles valides pour ne prendre que les "gueux"
        const gueuxTargets = validTargetsFiltered.filter(target => Array.isArray(target.role) ? target.role.includes('gueux') : target.role === 'gueux');
        if (gueuxTargets.length > 0) {
            // Trouver le "gueux" avec le moins de points de vie
            let weakestGueux = gueuxTargets.reduce((weakest, current) => weakest.stats.HP < current.stats.HP ? weakest : current, gueuxTargets[0]);
            // console.log(`${attackerName} est un ${attackerRole}. Il choisit d'attaquer ${weakestGueux.name}, qui est un gueux avec le moins de points de vie : ${weakestGueux.stats.HP}.`);
            selectedTarget = weakestGueux;
        }
    }

    // Si la cible choisie n'est pas un "gueux" ou si aucun "gueux" n'a été trouvé, sélectionner aléatoirement parmi les cibles valides restantes
    if (!selectedTarget) {
        selectedTarget = validTargetsFiltered[Math.floor(Math.random() * validTargetsFiltered.length)];
        // console.log(`${attackerName} est un ${attackerRole}. Il choisit d'attaquer ${selectedTarget.name}, qui est un ${selectedTarget.role}.`);
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