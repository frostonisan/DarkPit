import { entites } from './entites.js'; 
import { summons } from './summons.js'; 
import { dotNameElement, updateTimerDisplay, updateKillsCounter, updateTotalDamageCounter, PopUpDamages, updateTotalHealCounter, updateScore, deductScore } from './dom.js'
import { attackEffects } from './attackEffects.js';
import { applyDamage } from './entityAttributs.js';
import {updateHealthBar } from './UpgradeEntity.js';
import { saveEntityHPToStorage } from './entityUpdatesStorage.js';

export function EffectMessage(target, customText = "MISS") {
    let potentialContainers = document.querySelectorAll(`[id^="PopDow_${target.id}"]`);
    let foundContainer = null;
    for (let container of potentialContainers) {
        foundContainer = container;
        break;
    }

    if (foundContainer) {
        let messageDiv = document.createElement("div");
        messageDiv.className = "BattleText";
        messageDiv.id = `message_${target.id}`;
        messageDiv.classList.add("absolute");

        // 🔹 Gestion des différents types de message
        switch (customText) {
            case "MISS":
                messageDiv.classList.add("miss");
                messageDiv.textContent = customText;
                break;

            case "Esquive !":
                messageDiv.classList.add("dodge");
                {
                    let dodgeText = document.createElement("p");
                    dodgeText.textContent = customText;
                    messageDiv.appendChild(dodgeText);
                }
                break;

            case "Éxecution !":
                messageDiv.classList.add("bloodFury");
                {
                    let execText = document.createElement("p");
                    execText.textContent = customText;
                    messageDiv.appendChild(execText);
                }
                break;

            case "Indestructible !":
                messageDiv.classList.add("indestructibility");
                messageDiv.textContent = customText;
                break;

            case "Ambidextrie !":
                messageDiv.classList.add("ambidextry");
                messageDiv.textContent = customText;
                break;

            case "Ésotérisme !":
                messageDiv.classList.add("esoterism");
                messageDiv.textContent = customText;
                break;

            case "Astralité !":
                messageDiv.classList.add("astrality");
                messageDiv.textContent = customText;
                break;
case "Raté !":
    messageDiv.classList.add("miss");
    {
        const missIcon = document.createElement("div");
        missIcon.className = "picto-statut miss-shot";

        const missText = document.createElement("p");
        missText.textContent = customText;

        messageDiv.appendChild(missIcon);
        messageDiv.appendChild(missText);
    }
    break;
            default:
                // 🟢 Gestion automatique des messages de soin
                if (/^\+\d+\s*HP$/i.test(customText)) {
                    messageDiv.classList.add("heal");
                    messageDiv.textContent = customText;
                } else {
                    messageDiv.classList.add("generic");
                    messageDiv.textContent = customText;
                }
                break;
        }

        foundContainer.appendChild(messageDiv);

        // 🕒 Suppression automatique après 1 seconde
        setTimeout(() => {
            messageDiv.remove();
        }, 1000);
    } else {
        console.error(`🚨 Aucun conteneur PopUp trouvé pour target.id: ${target.id}.`);
    }
}

export function toggleEffectClass(target, effectName, action = 'add') {
    // Vérifie si effectName est défini et n'est pas une chaîne vide ou "none"
    if (!effectName || effectName.trim() === '' || effectName.toLowerCase() === 'none') {
        return; // Sortie anticipée si effectName n'est pas valide
    }

    const entityDiv = document.getElementById(`spriteContainer_${target.id}`);
    if (entityDiv) {
        const effectClassName = effectName.toLowerCase(); // Transforme le nom de l'effet en minuscules pour la classe
        if (action === 'add') {
            entityDiv.classList.add(effectClassName);
        } else if (action === 'remove') {
            // Supprime la classe sauf si elle est "none"
            if (effectClassName !== 'none') {
                entityDiv.classList.remove(effectClassName);
            }
        }
    }
}

// POISON
const num = v => Number.isFinite(+v) ? +v : 0;
export function poison(target, effect, attacker, onEffectEnd) {
  // --- SANITIZE des entrées ---
  const baseDot   = num(effect.effectDot);
  const physRatio = (effect.effectPhysicalRatio === 'attacker') ? 'attacker' : num(effect.effectPhysicalRatio);
  const magiRatio = (effect.effectMagicalRatio  === 'attacker') ? 'attacker' : num(effect.effectMagicalRatio);
  const duration  = Math.max(1, Math.floor(num(effect.effectDuration))); // entier ≥ 1

  const attPhys = num(attacker?.stats?.physicalDamage);
  const attMagi = num(attacker?.stats?.magicalDamage);

  // --- Calcul dynamique sécurisé ---
  let dynamicEffectDot = baseDot;

  // Physique
  if (physRatio === 'attacker') {
    dynamicEffectDot += attPhys;
    console.log(`Ajout des dégâts physiques bruts (stats.physicalDamage) : ${attPhys}`);
  } else if (physRatio > 0) {
    const physicalContribution = Math.ceil(attPhys * physRatio);
    dynamicEffectDot += physicalContribution;
    console.log(`Ajout des dégâts physiques (Ratio: ${physRatio}) : ${attPhys} * ${physRatio} = ${physicalContribution}`);
  }

  // Magique
  if (magiRatio === 'attacker') {
    dynamicEffectDot += attMagi;
    console.log(`Ajout des dégâts magiques bruts (stats.magicalDamage) : ${attMagi}`);
  } else if (magiRatio > 0) {
    const magicalContribution = Math.ceil(attMagi * magiRatio);
    dynamicEffectDot += magicalContribution;
    console.log(`Ajout des dégâts magiques (Ratio: ${magiRatio}) : ${attMagi} * ${magiRatio} = ${magicalContribution}`);
  }

  dynamicEffectDot = Math.max(0, num(dynamicEffectDot));

  // Répartition par seconde (attention à la sur-infligeance avec ceil)
  const damagePerSecond = Math.ceil(dynamicEffectDot / duration);
  console.log(`Dégâts totaux calculés pour l'effet ${effect.effectName} : ${dynamicEffectDot}`);
  console.log(`Dégâts par seconde : ${damagePerSecond} (arrondi au supérieur)`);
  console.log(`Durée totale de l'effet : ${duration} secondes`);
  console.log(`--- Résumé : Effet ${effect.effectName} inflige un total de ${dynamicEffectDot} dégâts à ${target.name} en ${duration} secondes (${damagePerSecond} par seconde). ---`);

  // Réinitialiser l'effet de poison si déjà présent
  if (target.poisonIntervalId) {
    clearInterval(target.poisonIntervalId);
    console.log(`L'effet de poison précédent sur ${target.name} est réinitialisé.`);
  }

  // Conteneur effets
  let effectsContainer = document.getElementById(`effectsContainer_${target.id}`);
  if (!effectsContainer) {
    effectsContainer = document.createElement('div');
    effectsContainer.id = `effectsContainer_${target.id}`;
    document.body.appendChild(effectsContainer);
  }

  // VFX poison
  let poisonVFX = document.getElementById(`poisonVFX_${target.id}`);
  if (!poisonVFX) {
    poisonVFX = document.createElement('img');
    poisonVFX.id = `poisonVFX_${target.id}`;
    poisonVFX.alt = `${target.name} est empoisonné !`;
    poisonVFX.className = 'effect-vfx poison';
    poisonVFX.src = '../../media/assets/effects/poison.gif';
    effectsContainer.appendChild(poisonVFX);
  }

  let elapsedSeconds = 0;

  const intervalId = setInterval(() => {
    // fin d’effet
    if (elapsedSeconds >= duration) {
      console.log(`L'effet de poison sur ${target.name} par ${attacker.name} est terminé.`);
      clearInterval(intervalId);
      onEffectEnd && onEffectEnd();
      delete target.poisonIntervalId;
      if (poisonVFX && poisonVFX.parentNode) poisonVFX.parentNode.removeChild(poisonVFX);
      return;
    }

    // cible morte
    if (target.isDEAD) {
      console.log(`${target.name} est déjà mort. Le poison de ${attacker.name} n'a aucun effet.`);
      clearInterval(intervalId);
      onEffectEnd && onEffectEnd();
      delete target.poisonIntervalId;
      if (poisonVFX && poisonVFX.parentNode) poisonVFX.parentNode.removeChild(poisonVFX);
      return;
    }

    // Tick — 1er tick arrive bien à +1s avec setInterval(…, 1000)
    const deal = Math.min(damagePerSecond, target.stats.HP.current);

    if (deal > 0) {
      applyDamage(target, deal, attacker, {
        dotname: 'Poison',
        attackTarget: ['enemy'],
        effets: null,
        popup: 'poison-dot',
        attacknature: ['magicalDamage'],
        type: ['alteration'],
        forceDamageSources: { magical: deal },                   // évite le recalcul
        debugTick: { index: elapsedSeconds, total: duration, dealBefore: deal } // logs
      });
    }

    elapsedSeconds++;
  }, 1000);

  target.poisonIntervalId = intervalId;
}


function getOrCreateDotNameElement(target) {
  const id = `dotName_${target.id}`;
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.className = 'dot-name';
    const host =
      document.getElementById(`effectsContainer_${target.id}`) ||
      document.getElementById(`spriteContainer_${target.id}`) ||
      document.body;
    host.appendChild(el);
  }
  return el;
}

export function brulure(target, effect, attacker, onEffectEnd) {
  // --- Helpers internes (tout dans la fonction) ---
  function getBurnLabel(stacks, maxStacks) {
    return (stacks >= maxStacks) ? `Brûlure Max (${maxStacks}) !` : `Brûlure ${stacks} !`;
  }
  function renderBurnLabel(target, text) {
    const pop = document.getElementById(`PopUp_${target.id}`);
    if (!pop) return;
    let txt = document.getElementById(`burnText_${target.id}`);
    if (!txt) {
      txt = document.createElement('span');
      txt.id = `burnText_${target.id}`;
      txt.className = 'BattleText brulure'; // <= classes demandées
      pop.appendChild(txt);
    } else {
      txt.className = 'BattleText brulure';
    }
    txt.textContent = text; // aucun style inline ici
  }
  // --------------------------------------------------

  // Reset éventuel
  if (target.brulureIntervalId) {
    clearTimeout(target.brulureIntervalId);
    console.log(`L'effet de brûlure précédent sur ${target.name} est réinitialisé.`);
  }

  // Conteneur VFX
  let effectsContainer = document.getElementById(`effectsContainer_${target.id}`);
  if (!effectsContainer) {
    effectsContainer = document.createElement('div');
    effectsContainer.id = `effectsContainer_${target.id}`;
    document.body.appendChild(effectsContainer);
  }
  // ancrage des absolus pour les VFX
  if (getComputedStyle(effectsContainer).position === 'static') {
    effectsContainer.style.position = 'relative';
  }
  effectsContainer.style.pointerEvents = 'none';

  // Stacks
  target.brulureStacks = target.brulureStacks || 0;
  const maxStacks = Math.max(1, Math.floor(num(effect.effectStack) || 1));
  const reachedMax = target.brulureStacks >= maxStacks;
  if (!reachedMax) target.brulureStacks++;
  const stacks = target.brulureStacks;

  // Texte (dans PopUp_${id}) avec classes, sans style inline
  renderBurnLabel(target, getBurnLabel(stacks, maxStacks));

  // VFX (uniquement si un nouveau stack est gagné)
  if (!reachedMax) {
    const brulureVFX = document.createElement('img');
    brulureVFX.id = `brulureVFX_${target.id}_${stacks}`;
    brulureVFX.alt = `${target.name} brûle !`;
    brulureVFX.className = 'effect-vfx burn';
    brulureVFX.src = '../../media/assets/effects/burn.gif';

    // Position aléatoire en pixels : left 0..100, top 80..30
    const leftPx = Math.floor(Math.random() * 101);    // 0..100 px
    const topPx  = 80 - Math.floor(Math.random() * 51); // 80..30 px

    brulureVFX.style.position = 'absolute';
    brulureVFX.style.left = `${leftPx}px`;
    brulureVFX.style.top  = `${topPx}px`;
    brulureVFX.style.userSelect = 'none';
    brulureVFX.style.pointerEvents = 'none';

    effectsContainer.appendChild(brulureVFX);
  }

  // Dégâts sur la durée
  const baseDot  = Math.max(0, num(effect.effectDot));
  const duration = Math.max(1, Math.floor(num(effect.effectDuration)));
  const totalDot = baseDot * stacks;
  const perSecExact = totalDot / duration;

  console.log(`${target.name} est brûlé pour ${duration}s par ${attacker.name} avec ${stacks} stack(s). DOT total=${totalDot}`);

  // Ticks à +1s, anti-dérive
  let acc = 0, elapsed = 0, timerId = null;
  const start = Date.now();

  function endBurn() {
    clearTimeout(timerId);
    delete target.brulureIntervalId;
    console.log(`Brûlure terminée sur ${target.name}. Tous les stacks sont perdus.`);
    target.brulureStacks = 0;
    // Clear VFX
    while (effectsContainer.firstChild) {
      effectsContainer.removeChild(effectsContainer.firstChild);
    }
    onEffectEnd && onEffectEnd();
  }

  function doTick() {
    if (target.isDEAD || elapsed >= duration) {
      endBurn();
      return;
    }

    acc += perSecExact;
    let deal = Math.floor(acc);
    acc -= deal;

    // dernier tick : vider résiduel
    if (elapsed === duration - 1) {
      deal += Math.round(acc);
      acc = 0;
    }

    if (deal > 0) {
      applyDamage(target, deal, attacker, {
        dotname: 'Brûlure',
        attackTarget: ['enemy'],
        effets: null,
        popup: 'brulure-dot',
        attacknature: ['magicalDamage'],
        type: ['alteration'],
        forceDamageSources: { magical: deal },
        debugTick: { index: elapsed, total: duration, dealBefore: deal }
      });
    }

    elapsed++;
    if (elapsed >= duration) {
      endBurn();
      return;
    }

    const nextAt = start + (elapsed + 1) * 1000;
    const delay  = Math.max(0, nextAt - Date.now());
    timerId = setTimeout(doTick, delay);
    target.brulureIntervalId = timerId;
  }

  const firstDelay = Math.max(0, start + 1000 - Date.now());
  timerId = setTimeout(doTick, firstDelay);
  target.brulureIntervalId = timerId;
}

export function heal(target) {
    // Tenter d'obtenir le conteneur principal pour les effets VFX.
    let effectsContainer = document.getElementById(`effectsContainer_${target.id}`) 
                         || document.getElementById(`codex-entity-sprite-container_${target.id}`);

    // Si aucun conteneur trouvé, ne rien faire.
    if (!effectsContainer) return;

    // Créer et configurer l'élément VFX de guérison.
    let healVFX = document.createElement('img');
    healVFX.src = '../../media/assets/effects/heal.gif'; // Assurez-vous que le chemin est correct.
    healVFX.className = 'effect-vfx heal';
    healVFX.alt = `${target.name} est soigné !`;

    // Ajouter le VFX de guérison au conteneur.
    effectsContainer.appendChild(healVFX);

    // Supprimer l'effet après 1 seconde.
    setTimeout(() => {
        healVFX.remove();
    }, 1000);
}


export function rez(target) {
    console.log(`⚡ Rez lancé sur : ${target.name}`);

    const container = document.getElementById(`spriteContainer_${target.id}`);

    // Nettoyage visuel de la mort
    const deadSprite = document.getElementById(`deadSprite_${target.id}`);
    if (deadSprite) deadSprite.remove();

    const bloodEffect = document.getElementById(`bloodEffect_${target.id}`);
    if (bloodEffect) bloodEffect.remove();

    // Réinitialisation des classes CSS
    let targetElement = document.getElementById(`sbire_${target.id}`);
    if (targetElement) {
        targetElement.classList.remove('dead', 'hbox');
        targetElement.classList.add('resurrected');
        setTimeout(() => targetElement.classList.remove('resurrected'), 3000);
    }

    // Création du nouveau sprite vivant
    const spriteImg = document.createElement('img');
    spriteImg.id = `sprite_${target.id}`;
    spriteImg.className = 'hb';
    spriteImg.src = target.originalSprite || target.sprite || "/media/sprites/default.png";
    spriteImg.alt = target.name;
    container.appendChild(spriteImg);

    // Affiche le VFX de résurrection
    let effectsContainer = document.getElementById(`effectsContainer_${target.id}`);
    if (!effectsContainer) {
        effectsContainer = document.createElement('div');
        effectsContainer.id = `effectsContainer_${target.id}`;
        effectsContainer.className = 'effects-container';
        container.appendChild(effectsContainer);
    }

    const rezVFX = document.createElement('img');
    rezVFX.src = '../../media/assets/effects/rez.gif';
    rezVFX.className = 'effect-vfx extraLife';
    rezVFX.alt = `${target.name} est ressuscité !`;
    effectsContainer.appendChild(rezVFX);

    setTimeout(() => {
        if (rezVFX.parentElement) rezVFX.remove();
    }, 1000);

    // Mise à jour des stats
    target.isDEAD = false;
    target.stats.HP.current = 10;
    target.statut = ['alive'];

    console.log(`${target.name} a été ressuscité avec ${target.stats.HP.current} HP.`);
}


export function lifesteal(attacker, totalReducedDamage, attackEffects) {
  if (!attackEffects || attackEffects.effectName !== 'lifesteal') {
    console.warn(`⚠️ lifesteal() a été appelé sans attackEffects valide.`);
    return;
  }

  console.log(`--- [Lifesteal Debug] ---`);
  console.log(`Attaquant : ${attacker.name}`);
  console.log(`Dégâts après résistances : ${totalReducedDamage}`);
  console.log(`Effect ID : ${attackEffects.effectId}`);
  console.log(`Effect Projectile : ${attackEffects.effectProjectile}`);
  console.log(`Effect Magical Ratio : ${attackEffects.effectMagicalRatio}`);

  // Calcul du vol de vie
  const baseLifesteal = Math.floor(totalReducedDamage * 0.2);
  const bonusMagicalLifesteal = Math.floor(attacker.stats.magicalDamage * attackEffects.effectMagicalRatio);
  const lifestealAmount = baseLifesteal + bonusMagicalLifesteal;

  console.log(`Base Lifesteal (20%) : ${baseLifesteal}`);
  console.log(`Bonus via magicalDamage (0.5 * ${attacker.stats.magicalDamage}) : ${bonusMagicalLifesteal}`);
  console.log(`Total HP récupérés : ${lifestealAmount}`);

  // Appliquer le soin et mise à jour de l'affichage
  attacker.stats.HP.current = Math.min(attacker.stats.HP.current + lifestealAmount, attacker.stats.HP.max);

  // ✅ APPEL DE `PopUpDamages()` POUR AFFICHER LE POP-UP DE SOIN AVEC LA CLASSE `heal-pop-up`
  PopUpDamages(attacker, lifestealAmount, "heal", "", { piercingDamage: 0, physical: 0, magical: 0, hybridalDamage: 0, heal: lifestealAmount });

  // 🏥 Mise à jour du compteur de soins
  if (attacker.totalHeal === undefined) {
    attacker.totalHeal = 0;
  }
  attacker.totalHeal += lifestealAmount;
  updateTotalHealCounter(attacker.id, attacker.totalHeal);

  // 📊 Mise à jour de la barre de vie
updateHealthBar(attacker.stats.HP.current, attacker.stats.HP.max, attacker.stats.armor?.current || 0, attacker.stats.armor?.max || 0, attacker.id);

  // 🏆 Mise à jour du score
  updateScore(attacker, lifestealAmount);

  // 🎨 Gestion des effets visuels pour le vol de vie
  const effectsContainer = document.getElementById(`effectsContainer_${attacker.id}`);

  if (effectsContainer && attackEffects.effectProjectile) {
    console.log(`Ajout d'un effet visuel de vol de vie : ${attackEffects.effectProjectile}.gif`);

    // Création de l'effet visuel
    const lifestealVFX = document.createElement('img');
    lifestealVFX.src = '../../media/assets/effects/heal.gif'; // Chemin vers l'image de vol de vie
    lifestealVFX.className = 'effect-vfx lifesteal';
    lifestealVFX.alt = `${attacker.name} bénéficie du vol de vie !`;

    // Ajout de l'effet visuel
    effectsContainer.appendChild(lifestealVFX);

    // Suppression de l'effet après 1 seconde
    setTimeout(() => {
      lifestealVFX.remove();
      console.log(`Effet visuel supprimé après 1 seconde.`);
    }, 1000);
  } else {
    console.warn(`⚠️ Aucun conteneur d'effets trouvé pour ${attacker.name} ou aucun effet visuel défini.`);
  }
}


export function LifestealBloodFury(attacker, target, hpLoss, bloodFuryPercent) {
  if (!attacker || !target) return;
  if (bloodFuryPercent <= 0) return;

  console.log("🩸 Bloodfury déclenchée juste avant la perte de HP !");

  // 💉 Calcul du soin
  const healAmount = Math.round((hpLoss * bloodFuryPercent) / 100);

  // 💚 Application du soin à l’attaquant
  if (healAmount > 0 && attacker?.stats?.HP) {
    attacker.stats.HP.current = Math.min(
      attacker.stats.HP.max,
      attacker.stats.HP.current + healAmount
    );

    saveEntityHPToStorage(attacker);
    updateHealthBar(
      attacker.stats.HP.current,
      attacker.stats.HP.max,
      attacker.stats.armor?.current || 0,
      attacker.stats.armor?.max || 0,
      attacker.id
    );
  }

  // 🩸 Effet visuel du vol de vie (à chaque proc)
  const effectsContainer = document.getElementById(`effectsContainer_${attacker.id}`);
  if (effectsContainer) {
    const lifestealVFX = document.createElement('img');
    lifestealVFX.src = `../media/assets/effects/heal.gif?t=${Date.now()}`;
    lifestealVFX.className = 'effect-vfx lifesteal';
    lifestealVFX.style.position = 'absolute';
    effectsContainer.appendChild(lifestealVFX);
    setTimeout(() => lifestealVFX.remove(), 1200);
  }

  // 💬 Message visuel (optionnel)
  try {
    typeof EffectMessage === 'function' && EffectMessage(attacker, `+${healAmount} HP`);
  } catch {}

  // 🧮 LOG DÉTAILLÉ DU CALCUL
  console.log(`💉 ${attacker.name} bénéficie du vol de vie :`);
  console.log(`   • Dégâts réels infligés à ${target.name} : ${hpLoss}`);
  console.log(`   • Pourcentage Blood Fury : ${bloodFuryPercent}%`);
  console.log(`   • Montant soigné : (${hpLoss} × ${bloodFuryPercent}%) ÷ 100 = ${healAmount}`);
  console.log(`   • HP actuel après soin : ${attacker.stats.HP.current}/${attacker.stats.HP.max}`);
}
