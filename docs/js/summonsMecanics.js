import { entites, RemoveEntite } from './entites.js'; 
import { summons } from './summons.js';
import { createAttackElementsForEntity } from './dom.js';
import { updateHealthBar } from './UpgradeEntity.js';
import { applyDamage } from './entityAttributs.js';
import { createEntiteInDOM } from './createEntity.js';
import { getRoleFromHex } from './role-rule.js';
import { entiteTurn } from './fight.js';
import { toggleScanEntityListener } from './ui.js';
import { updateRoleInDOM, updateGlobalRoleSbire, TraitementRolesSbires, observeRoleChanges, determineClasse } from './load-entity.js';

function getEntityConsumingHex(hexElement) {
    const entiteBox = hexElement.querySelector('.entite-box');
    if (!entiteBox) return null;
    const entiteId = parseInt(entiteBox.id.replace('Box_Entite_', ''));
    console.log(`DEBUG: ID de l'entité consommant l'hex: ${entiteId}`);
    return entites.find(e => e.id === entiteId);
}

export function summonJarret(target, effect, attacker, removeEffectCallback) {
 // Déterminer si un Jarret foireux doit être invoqué
    const isRotten = Math.random() < 0.15;
    const summonEffect = isRotten ? 'rottenjarret-summon' : effect.effectSummon;

    const summon = summons.find(s => s.summonEffect === summonEffect);
    if (!summon) {
        console.error(`Erreur: L'invocation pour ${summonEffect} n'est pas définie dans summons`);
        return;
    }
    const { summonId, hexElement } = summonConsommable(target, summon);
    consommationSummon(summon, hexElement, summonId, removeEffectCallback);
}

export function summonProfanation(target, effect, attacker, removeEffectCallback) {
    const newEntite = {
        id: `0001`,
        classe: [],
        side: attacker.side,
        role: '',
        class: 'aberration-profanee',
        name: 'Aberration Profanée',
        sprite: "../../media/sprites/aberration-profanee.png",
        type: 'sbire',
        HP: 10,
        life: 1,
        damage: 10,
        speed: 1000,
        portrait: "../../media/portrait/aberration-profanee.jpg",
        kills: 0,
        totalDamage: 0,
        totalHeal: 0,
        attacks: ['autoAttack'],
    };

    const duration = 5000000; // Durée en millisecondes

    return summonEntite(target, newEntite, attacker, removeEffectCallback, duration);
}

export async function summonEntite(target, newEntite, attacker, removeEffectCallback, duration) {
    const elementId = `spriteContainer_${target.id}`;
    const targetElement = document.getElementById(elementId);

    if (!targetElement) {
        console.warn(`Élément cible avec l'ID "${elementId}" introuvable`);
        return;
    }

    targetElement.classList.add('consommable-summoned');

    const hexElement = targetElement.closest('.hex');
    if (!hexElement) {
        console.warn('Élément parent .hex introuvable');
        return;
    }
    const targetPosition = hexElement.getAttribute('data-position');
    if (!targetPosition) {
        console.warn('Position de la cible (hex) introuvable');
        return;
    }
    console.log(`Position de la cible (hex) : ${targetPosition}`);

    // Assigner l'ID unique à l'entité invoquée
    newEntite.id = `${target.id}s${newEntite.id || generateUniqueID()}`;
    newEntite.position = targetPosition;
    
    initializeEntitiesAttributs(newEntite);

    // Normalisation des HP et extraLife
    newEntite.stats.HP = { current: newEntite.stats.HP?.current ?? newEntite.stats.HP, max: newEntite.stats.HP?.max ?? newEntite.stats.HP };
    newEntite.stats.extraLife = { current: newEntite.stats.extraLife?.current ?? 0, max: newEntite.stats.extraLife?.max ?? 0 };

    determineClasse(newEntite);
    TraitementRolesSbires(newEntite);
    createEntiteInDOM(newEntite);
    createAttackElementsForEntity(newEntite);
    updateGlobalRoleSbire(newEntite);
    observeRoleChanges(newEntite);
    toggleScanEntityListener();

    console.log('Création de l\'entité avec les propriétés : ', newEntite);

    setTimeout(async () => {
        const summonedElement = document.getElementById(`Box_Entite_${newEntite.id}`);
        const hexTargetElement = document.querySelector(`.hex[data-position="${targetPosition}"]`);

        if (summonedElement) {
            summonedElement.classList.add('summon-animation');

            const spriteElement = summonedElement.querySelector('.sprite');
            if (spriteElement) {
                spriteElement.className = `sprite ${newEntite.class} hb side-${newEntite.side} ${newEntite.role}`;
                spriteElement.setAttribute('data-entitename', newEntite.class);
            }

            const dragBoxElement = summonedElement.querySelector('.drag-box');
            if (dragBoxElement) {
                dragBoxElement.id = 'summoned-entity';
                dragBoxElement.setAttribute('draggable', 'false');
            }

            const HPElement = summonedElement.querySelector('.stats.HP');
            const lifeElement = summonedElement.querySelector('.extraLife');

            if (HPElement) {
                HPElement.textContent = `HP: ${newEntite.stats.HP.current}`;
            }
            if (lifeElement) {
                lifeElement.textContent = `Life: ${newEntite.stats.extraLife.current}`;
            }
        }

        if (hexTargetElement) {
            hexTargetElement.classList.remove('SideA', 'SideB', 'SideNeutral');
            hexTargetElement.classList.add(`Side${newEntite.side}`);
        }

        if (summonedElement && hexTargetElement) {
            hexTargetElement.appendChild(summonedElement);
            hexTargetElement.classList.add('occupied');

            newEntite.role = getRoleFromHex(hexTargetElement);
            updateRoleInDOM(newEntite);
            summonedElement.setAttribute('data-position', targetPosition);

            setTimeout(() => {
                summonedElement.classList.add('active');
            }, 50);

            // Supprimer l'entité source du tableau et du DOM
           RemoveEntite(target);

            // Ajouter la nouvelle entité invoquée dans le tableau global
            entites.push(newEntite);

            // Démarrer le tour de l'entité invoquée
            await entiteTurn(newEntite, entites.filter(e => e.side !== newEntite.side));
        }

        // Retirer l'entité invoquée après la durée spécifiée
        setTimeout(() => {
            if (summonedElement) {
                summonedElement.remove();
            }
            if (targetElement.classList.contains('entity-summoned')) {
                targetElement.classList.remove('entity-summoned');
            }
            // Supprimer l'entité invoquée du tableau global
            const index = entites.findIndex(e => e.id === newEntite.id);
            if (index !== -1) {
                entites.splice(index, 1);
            }
        }, duration);

        // Ajouter l'effet "undead" à l'entité parent, si elle existe
        const parentElement = document.getElementById(`sbire_${target.id}`);
        if (parentElement) {
            parentElement.classList.add('undead');
        }
    }, 50);

    return { summonId: newEntite.id, targetElement };
}




function summonConsommable(target, summon) {
    const hexElement = target.closest('.hex');
    if (!hexElement) {
        console.warn('Élément parent .hex introuvable');
        return;
    }

    hexElement.classList.add('consommable-summoned');
    console.log(`DEBUG: Classe "consommable-summoned" ajoutée à l'hex: ${hexElement.dataset.position}`);

    let effectsContainer = target.querySelector('.consommable-container');
    if (!effectsContainer) {
        effectsContainer = document.createElement('div');
        effectsContainer.className = 'consommable-container';
        target.appendChild(effectsContainer);
    }

    const uniqueId = Date.now();
    const summonId = `summon-${summon.summonId}-${uniqueId}`;

    let summonContainer = document.createElement('div');
    summonContainer.id = summonId;
    summonContainer.className = 'entitesContainer summon';

    let summonPerspective = document.createElement('div');
    summonPerspective.className = 'sprite-container';

    let summonCenter = document.createElement('div');
    summonCenter.className = 'img-container';

    let summonVFX = document.createElement('img');
    summonVFX.src = summon.summonSprite;
    summonVFX.className = summon.summonClass;
    summonVFX.alt = `${summon.summonDisplayName} lancé sur ${target.dataset.position}`;
    summon.summonPosition = target.dataset.position;

    summonCenter.appendChild(summonVFX);
    summonPerspective.appendChild(summonCenter);
    summonContainer.appendChild(summonPerspective);
    effectsContainer.appendChild(summonContainer);

    const duration = summon.summonDuration * 1000;

    setTimeout(() => {
        if (summonContainer) {
            summonContainer.remove();
        }
        if (hexElement.classList.contains('consommable-summoned')) {
            hexElement.classList.remove('consommable-summoned');
        }
        console.log(`DEBUG: Classe "consommable-summoned" supprimée de l'hex après durée: ${hexElement.dataset.position}`);
    }, duration);

    return { summonId, hexElement };
}

export function consommationSummon(summon, hexElement, summonId, removeEffectCallback) {
    // Vérification initiale si le hex est déjà occupé
    const initialCheck = () => {
        if (hexElement.classList.contains('occupied')) {
            processConsumption();
        } else {
            // Ajouter un écouteur d'événements pour détecter les changements de classe
            const observer = new MutationObserver((mutationsList) => {
                for (const mutation of mutationsList) {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                        if (hexElement.classList.contains('occupied')) {
                            processConsumption();
                            observer.disconnect();
                        }
                    }
                }
            });
            observer.observe(hexElement, { attributes: true });
        }
    };

    const processConsumption = () => {
        const entityConsuming = getEntityConsumingHex(hexElement);
        console.log(`DEBUG: Hex occupé détecté. Entité consommatrice : ${entityConsuming ? entityConsuming.name : 'aucune'}`);
        
        // Vérifier et gérer l'état 'consommable-summoned'
        if (hexElement.classList.contains('consommable-summoned')) {
            hexElement.classList.remove('consommable-summoned');
            hexElement.classList.add('consumed');
            console.log(`DEBUG: Classe "consommable-summoned" supprimée et classe "consumed" ajoutée à l'hex: ${hexElement.dataset.position}`);
            
            // Faire disparaître le summon instantanément
            const summonContainer = document.getElementById(summonId);
            if (summonContainer) {
                summonContainer.remove();
                console.log(`DEBUG: Summon ${summonId} supprimé du DOM`);
            }

            // Supprimer la classe 'consumed' après 3 secondes
            setTimeout(() => {
                hexElement.classList.remove('consumed');
                console.log(`DEBUG: Classe "consumed" supprimée de l'hex après 3 secondes: ${hexElement.dataset.position}`);
            }, 3000);
        }

        // Appliquer l'effet de consommation si applicable
        if (summon.summonType === 'consommable' && entityConsuming) {
            applyConsommableEffect(summon, entityConsuming, summonId);
        }
    };

    // Appeler la vérification initiale
    initialCheck();

    // Planifier la suppression de l'effet après la durée du summon
    setTimeout(() => {
        if (hexElement.classList.contains('occupied')) {
            hexElement.classList.remove('occupied');
        }
        removeEffectCallback();
    }, summon.summonDuration * 1000);
}

function applyConsommableEffect(summon, entity, summonId) {
    summon.summonEffet.forEach(effect => {
        console.log(`DEBUG: Application de l'effet ${effect} sur ${entity ? entity.name : 'aucune entité'}`);
        switch (effect) {
            case 'healConsommable':
                healConsommable(entity, summonId);
                break;
			 case 'poisonConsommable':
                poisonConsommable(entity, summonId);
                break;	
            //autres effets ici
            default:
                console.warn(`Effet non géré: ${effect}`);
        }
    });
}

function healConsommable(entity, summonId) {
    const healAmount = 5;
    if (entity&& !entity.isDEAD) {
        if (!entity.healedBySummons) {
            entity.healedBySummons = new Set();
        }
        if (!entity.healedBySummons.has(summonId)) {
            entity.stats.HP.current = Math.min(entity.stats.HP.current + healAmount, entity.stats.HP.max);
            entity.healedBySummons.add(summonId);
          updateHealthBar(entity.stats.HP.current, entity.stats.HP.max, entity.stats.armor?.current || 0, entity.stats.armor?.max || 0, entity.id);

            console.log(`DEBUG: ${entity.name} a été soigné par ${healAmount} HP. HP actuel: ${entity.stats.HP}`);

            // Créer et configurer l'élément VFX de guérison
            const effectsContainer = document.getElementById(`effectsContainer_${entity.id}`);
            if (effectsContainer) {
                const healVFX = document.createElement('img');
                healVFX.src = '../../media/assets/effects/heal.gif'; // Assurez-vous que le chemin est correct
                healVFX.className = 'effect-vfx heal';
                healVFX.alt = `${entity.name} est soigné !`;

                // Ajouter le VFX de guérison au conteneur d'effets
                effectsContainer.appendChild(healVFX);

                // Supprimer l'effet de guérison après 1 seconde
                setTimeout(() => {
                    healVFX.remove(); // Utilisez .remove() pour une syntaxe plus concise
                }, 1000); // 1000 millisecondes = 1 secondes
            } else {
                console.warn(`DEBUG: Conteneur d'effets non trouvé pour l'entité ID: ${entity.id}`);
            }
        } else {
            console.log(`DEBUG: ${entity.name} a déjà été soigné par cette invocation.`);
        }
    } else {
		  const effectsContainer = document.getElementById(`effectsContainer_${entity.id}`);
            if (effectsContainer) {
                const healVFX = document.createElement('img');
                healVFX.src = '../../media/assets/effects/blood-loss.gif'; // Assurez-vous que le chemin est correct
                healVFX.className = 'effect-vfx blood-loss';
                healVFX.alt = `${entity.name} gache l'effet.`;

                // Ajouter le VFX de guérison au conteneur d'effets
                effectsContainer.appendChild(healVFX);

                // Supprimer l'effet de guérison après 1 seconde
                setTimeout(() => {
                    healVFX.remove(); // Utilisez .remove() pour une syntaxe plus concise
			}, 600); }// 1000 millisecondes = 1 secondes
        console.warn('DEBUG: Aucune entité à soigner.');
    }
}

function poisonConsommable(entity, summonId) {
    const poisonDamage = 5;
    if (entity && !entity.isDEAD) {
        if (!entity.poisonedBySummons) {
            entity.poisonedBySummons = new Set();
        }
        if (!entity.poisonedBySummons.has(summonId)) {
            entity.poisonedBySummons.add(summonId);

            // Calcul du DPS (Dommage Par Seconde)
            const poisonDuration = 10; // Durée du poison en secondes
            const damagePerSecond = Math.round(poisonDamage / poisonDuration);

            console.log(`${entity.name} est empoisonné par le Jarret foireux pour ${poisonDuration} secondes.`);

            if (entity.poisonIntervalId) {
                clearInterval(entity.poisonIntervalId);
                console.log(`L'effet de poison précédent sur ${entity.name} est réinitialisé.`);
            }

            let effectsContainer = document.getElementById(`effectsContainer_${entity.id}`);
            if (!effectsContainer) {
                effectsContainer = document.createElement('div');
                effectsContainer.id = `effectsContainer_${entity.id}`;
                document.body.appendChild(effectsContainer);
            }

            let poisonVFX = document.getElementById(`poisonVFX_${entity.id}`);
            if (!poisonVFX) {
                poisonVFX = document.createElement('img');
                poisonVFX.id = `poisonVFX_${entity.id}`;
                poisonVFX.alt = `${entity.name} est empoisonné !`;
                poisonVFX.className = 'effect-vfx poison';
                poisonVFX.src = '../../media/assets/effects/poison.gif';
                effectsContainer.appendChild(poisonVFX);
            } else {
                console.log(`L'effet de poison visuel existe déjà sur ${entity.name}.`);
            }

            let elapsedSeconds = 0;
            const intervalId = setInterval(() => {
                if (elapsedSeconds >= poisonDuration) {
                    console.log(`L'effet de poison sur ${entity.name} est terminé.`);
                    clearInterval(intervalId);
                    delete entity.poisonIntervalId;
                    if (poisonVFX && poisonVFX.parentNode) {
                        poisonVFX.parentNode.removeChild(poisonVFX);
                    }
                    return;
                }

             if (!entity.isDEAD) {
    const damageThisSecond = Math.min(damagePerSecond, entity.stats.HP.current);
    applyDamage(entity, damageThisSecond, { name: 'Jarret foireux' }, { dotname: 'Poison', attackTarget: 'enemy', effets: null, popup: 'poison-dot' });
} else {
                    console.log(`${entity.name} est déjà mort. Le poison du Jarret foireux n'a aucun effet.`);
                    clearInterval(intervalId);
                    delete entity.poisonIntervalId;
                    if (poisonVFX && poisonVFX.parentNode) {
                        poisonVFX.parentNode.removeChild(poisonVFX);
                    }
                }

                elapsedSeconds++;
            }, 1000);

            entity.poisonIntervalId = intervalId;
        } else {
            console.log(`DEBUG: ${entity.name} est déjà empoisonné par cette invocation.`);
        }
    } else {
        const effectsContainer = document.getElementById(`effectsContainer_${entity.id}`);
        if (effectsContainer) {
            const poisonVFX = document.createElement('img');
            poisonVFX.src = '../../media/assets/effects/blood-loss.gif';
            poisonVFX.className = 'effect-vfx blood-loss';
            poisonVFX.alt = `${entity.name} gâche l'effet.`;
            effectsContainer.appendChild(poisonVFX);
            setTimeout(() => {
                poisonVFX.remove();
            }, 600);
        }
        console.warn('DEBUG: Aucune entité à empoisonner.');
    }
}