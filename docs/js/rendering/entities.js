import { flushCombatDisplay } from "./displayBatch.js";
import {
  updateRoleInDOM, getBattleTargetAttack, updateEntityAttackTargetDisplay, applyCombatProfileView,
  IngameListingFocus, renderMovementCounter, getLevelBattleStats,
} from "./hud.js";
import { updateHealthBar } from "./vitalFeedback.js";
import { entitySizeInCells, applyEntitySizeVisual } from "../board/controller.js";
import { calibrateEntityVisuals } from "./popups.js";
import { setTimeout, requestAnimationFrame } from "../combat/clock.js";
import { cachedResourceImage, cachedResourceUrl, playCachedGif } from "../data/loaderList.js";
import { determineClasse } from "../board/deployment.js";
import { AttackerSbireTargetPriority, AllySbireTargetPriority } from "../combat/roles.js";
import { createUmbraBlock } from "../ui/statistics/components.js";
import { createEntityAttackDisplay } from "../ui/attacks.js";
import { createStuffDom } from "../ui/codex/profile.js";
import { entites } from "../entities/runtime.js";
import { attackDetails } from "../data/attackList.js";
import { resolveAttackDefinitionForEntity } from "../combat/attackResolution.js";
import { adjustFontSize } from "../ui/display.js";
import { syncEntityAuras, cleanupEntityAuras, getAuraPoolCurrent } from "./auras.js";
import {
  getSafe,
  assertEntityType,
  getBattleEntityDomId,
  getBattleEntityElement,
  isLord,
} from "../entities/rules.js";

export function createHPCounter(entite) {
  if (!entite?.stats?.HP) return null;

  const currentHP = entite.stats.HP?.current ?? 0;
  const maxHP = entite.stats.HP?.max ?? 0;

  const HPCounter = document.createElement("div");
  HPCounter.className = "HP-counter hu";
  HPCounter.dataset.stat = "HP";
  HPCounter.dataset.entityId = entite.id;
  HPCounter.textContent = `HP : ${currentHP} / ${maxHP}`;

  return HPCounter;
}

export function createMovementCounter(entite) {
  const shift = entite?.stats?.shift;
  if (!shift) return null;

  const movementCounter = document.createElement("div");
  movementCounter.className = "movement-counter hu";
  movementCounter.dataset.stat = "shift";
  movementCounter.dataset.entityId = entite.id;
  movementCounter.dataset.movementEntityId = entite.id;

  const movementPicto = document.createElement("div");
  movementPicto.className = "picto-stat shift";

  movementCounter.appendChild(movementPicto);
  renderMovementCounter(movementCounter, entite);

  return movementCounter;
}
export function createArmorCounter(entite) {
  const currentArmor = entite?.stats?.armor?.current ?? 0;

  // Affichage uniquement si l’armure existe réellement et est > 0
  if (!(currentArmor > 0)) return null;

  const node = document.createElement("div");
  node.className = "armor-counter hu"; // "hu" si tu veux la même typo que tes autres compteurs
  node.dataset.stat = "armor";
  node.dataset.entityId = entite.id;

  node.textContent = `🛡️ : ${currentArmor}`; // conforme à ton exemple
  return node;
}

export function createFadedLifeCounter(entite) {
  const raw = entite?.stats?.fadedLife;

  const value = Math.max(
    0,
    Number(typeof raw === "object" ? (raw?.current ?? 0) : (raw ?? 0)) || 0
  );

  if (value <= 0) return null;

  const fadedLifeCounterContainer = document.createElement("div");
  fadedLifeCounterContainer.className = "fadedLife-counter";
  fadedLifeCounterContainer.dataset.stat = "fadedLife";
  fadedLifeCounterContainer.dataset.entityId = entite.id;

  const pictoFadedDiv = document.createElement("div");
  pictoFadedDiv.className = "picto-stat fadedLife";

  const fadedLifeValueDiv = document.createElement("div");
  fadedLifeValueDiv.className = "fadedLife-value hu";
  fadedLifeValueDiv.dataset.stat = "fadedLife-value";
  fadedLifeValueDiv.dataset.entityId = entite.id;
  fadedLifeValueDiv.textContent = `: ${value}`;

  fadedLifeCounterContainer.appendChild(pictoFadedDiv);
  fadedLifeCounterContainer.appendChild(fadedLifeValueDiv);

  return fadedLifeCounterContainer;
}

export function createExtraLifeCounter(entite) {
  const ex = entite?.stats?.extraLife;

  const exCurrent =
    ex && typeof ex === "object"
      ? (ex.current ?? 0)
      : (typeof ex === "number" ? ex : 0);

  const exMax =
    ex && typeof ex === "object"
      ? (ex.max ?? 0)
      : 0;

  const hasCurrent = typeof exCurrent === "number" && exCurrent > 0;
  const hasMax = typeof exMax === "number" && exMax > 0;

  // - current/max si max valide
  // - current seul si max invalide
  // - rien si aucun des deux
  if (!(hasCurrent || hasMax)) return null;

  const extraLifeCounterContainer = document.createElement("div");
  extraLifeCounterContainer.className = "extraLife-counter";
  extraLifeCounterContainer.dataset.stat = "extraLife";
  extraLifeCounterContainer.dataset.entityId = entite.id;

  // ✅ même convention que tes stats
  const pictoExDiv = document.createElement("div");
  pictoExDiv.className = "picto-stat extraLife";

  const exValueDiv = document.createElement("div");
  exValueDiv.className = "extraLife-value hu";
  exValueDiv.dataset.stat = "extraLife-value";
  exValueDiv.dataset.entityId = entite.id;

  if (hasMax) exValueDiv.textContent = `: ${exCurrent}/${exMax}`;
  else if (hasCurrent) exValueDiv.textContent = `: ${exCurrent}`;
  else exValueDiv.textContent = `: ${exMax}`; // optionnel

  extraLifeCounterContainer.appendChild(pictoExDiv);
  extraLifeCounterContainer.appendChild(exValueDiv);

  return extraLifeCounterContainer;
}

export function createEternalLifeCounter(entite) {
  const et = entite?.stats?.eternalLife;

  // Keep depleted rechargeable lives visible.
  const etMax =
    et && typeof et === "object" ? (Number(et.max ?? 0) || 0) : 0;

  if (!(etMax > 0)) return null;

  const etCurrent =
    et && typeof et === "object" ? (Number(et.current ?? 0) || 0) : 0;

  const max = Math.max(0, Math.floor(etMax));
  const cur = Math.min(max, Math.max(0, Math.floor(etCurrent)));

  const eternalLifeCounterContainer = document.createElement("div");
  eternalLifeCounterContainer.className = "eternalLife-counter";
  eternalLifeCounterContainer.dataset.stat = "eternalLife";
  eternalLifeCounterContainer.dataset.entityId = entite.id;

  const pictoEtDiv = document.createElement("div");
  pictoEtDiv.className = "picto-stat eternalLife";

  const etValueDiv = document.createElement("div");
  etValueDiv.className = "eternalLife-value hu";
  etValueDiv.dataset.stat = "eternalLife-value";
  etValueDiv.dataset.entityId = entite.id;

  etValueDiv.textContent = `: ${cur}/${max}`;

  eternalLifeCounterContainer.appendChild(pictoEtDiv);
  eternalLifeCounterContainer.appendChild(etValueDiv);

  return eternalLifeCounterContainer;
}

export function createLifeCounter(entite) {
  if (!entite?.stats?.HP) return null;

  const lifeCounterContainer = document.createElement("div");
  lifeCounterContainer.className = "life-bar-counter";
  lifeCounterContainer.dataset.entityId = entite.id;

  // const hp = createHPCounter(entite);
  // if (hp) lifeCounterContainer.appendChild(hp);

  const fadedLife = createFadedLifeCounter(entite);
  if (fadedLife) lifeCounterContainer.appendChild(fadedLife);

  const extraLife = createExtraLifeCounter(entite);
  if (extraLife) lifeCounterContainer.appendChild(extraLife);

  const eternalLife = createEternalLifeCounter(entite);
  if (eternalLife) lifeCounterContainer.appendChild(eternalLife);


  return lifeCounterContainer;
}

export function createLifeBars(entite, { context = null } = {}) {
  if (!entite?.stats?.HP) return null;

  const HPcurrent = entite.stats.HP.current ?? 0;
  const HPmax = entite.stats.HP.max ?? 1;
  const ArmorCurrent = entite.stats.armor?.current ?? 0;
  const ArmorMax = entite.stats.armor?.max ?? 0;

  const validHP = Math.max(0, Math.min(HPcurrent, HPmax));
  const validArmor = Math.max(0, Number(ArmorCurrent) || 0);

  const total = HPmax + validArmor;
  const hpPortion = total > 0 ? (validHP / total) * 100 : 0;
  const armorPortion = total > 0 ? (validArmor / total) * 100 : 0;

  const container = document.createElement('div');
  container.className = 'life-bars-container';
  if (context) container.classList.add(context);

  container.style.display = 'flex';
  container.style.position = 'relative';
  container.style.width = '100%';

  // ✅ HP COUNTER DANS LE CONTAINER (comme ton exemple)
  const hpText = createHPCounter(entite);
  if (hpText) container.appendChild(hpText);

  // HEALTH BAR
  const healthBar = document.createElement('div');
  healthBar.className = `health-bar ${entite.side}`;
  healthBar.dataset.stat = 'hp-bar';
  healthBar.dataset.entityId = entite.id;
  healthBar.style.flex = `0 0 ${hpPortion}%`;
  healthBar.style.width = `${hpPortion}%`;

  const healthFill = document.createElement('div');
  healthFill.className = 'health-fill';
  healthFill.style.width = '100%';

  healthBar.appendChild(healthFill);
  container.appendChild(healthBar);

  // ARMOR BAR
  {
    const armorBar = document.createElement('div');
    armorBar.className = `armor-bar ${entite.side}`;
    armorBar.dataset.stat = 'armor-bar';
    armorBar.dataset.entityId = entite.id;
    armorBar.style.flex = `0 0 ${armorPortion}%`;
    armorBar.style.width = `${armorPortion}%`;

    const armorFill = document.createElement('div');
    armorFill.className = 'armor-fill';
    armorFill.style.width = '100%';

    armorBar.appendChild(armorFill);
    container.appendChild(armorBar);
  }

  queueMicrotask(() => {
    updateHealthBar(HPcurrent, HPmax, ArmorCurrent, ArmorMax, entite.id, entite.stats.HP.uncorruptedMax || 0);
  });

  return container;
}

function stopDeadEntityAnimations(entite) {
  flushCombatDisplay();
  const entityBox = document.getElementById(`Box_Entite_${entite.id}`);
  if (!entityBox) return;

  cleanupEntityAuras(entite);

  entityBox.querySelectorAll('[id^="auraContainer_"], .aura-container').forEach((aura) => {
    aura.replaceChildren();
    aura.setAttribute('aria-hidden', 'true');
  });

  if (typeof entityBox.getAnimations === 'function') {
    entityBox.getAnimations({ subtree: true }).forEach((animation) => {
      const target = animation.effect?.target;
      if (target?.closest?.('.effects-container')) return;
      animation.cancel();
      if (target?.style) {
        target.style.setProperty('animation', 'none', 'important');
        target.style.setProperty('transition', 'none', 'important');
      }
    });
  }

  entityBox.querySelectorAll(
    `[id^="Animationsprite_${entite.id}"], #DragSprite_${entite.id}, #spriteCanvas_${entite.id}`
  ).forEach((element) => {
    element.style.setProperty('animation', 'none', 'important');
    element.style.setProperty('transition', 'none', 'important');
  });
}

function forceDeadEntityOpacity(entite, entityBox, container, canvas = null) {
  const animationSprite = document.getElementById(`Animationsprite_${entite.id}`);
  const spriteContainer = document.getElementById(`spriteContainer_${entite.id}`);

  [entityBox, spriteContainer, animationSprite, container, canvas]
    .filter(Boolean)
    .forEach((element) => {
      element.style.setProperty('opacity', '1', 'important');
      element.style.setProperty('visibility', 'visible', 'important');
    });
}

export function stabilizeDeadEntityVisual(entite, { playDeathBlood = false } = {}) {
  if (!entite) return null;

  entite.isDEAD = true;
  entite.statut = ['dead'];
  if (entite?.stats?.HP) entite.stats.HP.current = 0;

  const entityBox = document.getElementById(`Box_Entite_${entite.id}`);
  const container = document.getElementById(`DragSprite_${entite.id}`);
  if (!container) {
    console.warn(`⚠️ Aucun conteneur trouvé pour l'entité ${entite.id}`);
    return null;
  }

  // Une fois le canvas du cadavre créé, il devient immuable. Les mises à jour
  // du loot et du glitter ne doivent plus toucher à son DOM ni à ses animations.
  let canvas = document.getElementById(`spriteCanvas_${entite.id}`);
  const alreadyCanonical = canvas?.classList.contains('dead-sprite')
    && canvas.width === 603
    && canvas.height === 328;

  if (alreadyCanonical) {
    forceDeadEntityOpacity(entite, entityBox, container, canvas);
    return canvas;
  }

  stopDeadEntityAnimations(entite);

  entityBox?.classList.remove('dead', 'corpse', 'no-animation');
  if (entityBox) entityBox.style.pointerEvents = '';

  container.classList.remove('hb', 'dead', 'hbox');
  const spriteImg = document.getElementById(`sprite_${entite.id}`);
  spriteImg?.remove();

  canvas?.remove();
  canvas = document.createElement('canvas');
  canvas.id = `spriteCanvas_${entite.id}`;
  canvas.className = `dead-sprite ${entite.class} side-${entite.side} dead hbox`;
  canvas.width = 603;
  canvas.height = 328;
  container.appendChild(canvas);

  const context = canvas.getContext('2d');
  const deadSprite = new Image();
  deadSprite.onload = () => {
    if (!canvas.isConnected || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(deadSprite, 0, 0, canvas.width, canvas.height);
    forceDeadEntityOpacity(entite, entityBox, container, canvas);
  };
  deadSprite.src = cachedResourceUrl(entite.deadsprite || entite.DeadSprite || './media/sprites/0-dead.png');

  forceDeadEntityOpacity(entite, entityBox, container, canvas);

  const animationSprite = document.getElementById(`Animationsprite_${entite.id}`);
  animationSprite?.classList.add('dead');
  animationSprite?.classList.remove('no-animation');

  const spriteContainer = document.getElementById(`spriteContainer_${entite.id}`);
  if (entite.side === 'B' && spriteContainer && !spriteContainer.style.transform) {
    spriteContainer.style.transform = 'scaleX(-1)';
  }

  getBattleEntityElement(entite)?.classList.remove('dead', 'hbox');

  let effectsContainer = document.getElementById(`effectsContainer_${entite.id}`);
  if (!effectsContainer) {
    const effectsHost = entityBox?.querySelector(':scope > .drag-box') || container;
    effectsContainer = document.createElement('div');
    effectsContainer.id = `effectsContainer_${entite.id}`;
    effectsContainer.className = 'effects-container';
    effectsHost.appendChild(effectsContainer);
  }

  if (playDeathBlood) {
    document.getElementById(`bloodEffect_${entite.id}`)?.remove();
    const bloodGif = document.createElement('img');
    playCachedGif(bloodGif, './media/assets/effects/death-blood.gif');
    bloodGif.className = 'effect-vfx blood';
    bloodGif.id = `bloodEffect_${entite.id}`;
    effectsContainer.appendChild(bloodGif);
    setTimeout(() => bloodGif.remove(), 1000);
  }

  return canvas;
}

export function getEntitySpriteSource(entite) {
    const dead = entite?.isDEAD === true || entite?.statut?.includes?.('dead')
      || Number(entite?.stats?.HP?.current ?? 0) <= 0;
    return dead ? entite.deadsprite || entite.DeadSprite || './media/sprites/0-dead.png' : entite.sprite;
}

export function createEntiteInDOM(entite, { spriteImage = null } = {}) {
    entite.sizeInCells = entitySizeInCells(entite);
    // console.log('// EXEC createEntiteInDOM');

    assertEntityType(entite);
    determineClasse(entite);

    const entityStartsDead =
      entite?.isDEAD === true ||
      entite?.statut?.includes?.("dead") ||
      Number(entite?.stats?.HP?.current ?? 0) <= 0;

    if (entityStartsDead) {
      entite.isDEAD = true;
      entite.isSurprised = false;
      entite.statut = ["dead"];
      if (entite?.stats?.HP) entite.stats.HP.current = 0;
      cleanupEntityAuras(entite);
    }

    const entiteBox = document.createElement('div');
    entiteBox.id = `Box_Entite_${entite.id}`;
    entiteBox.className = `entite-box side-${entite.side} role-${entite.role}`;
    if (entityStartsDead) {
      entiteBox.dataset.dead = 'true';
    }
    entiteBox.setAttribute( "data-position", entite.position || `hex_${15 + entite.id - 2}`);
    // entiteBox.draggable = !entityStartsDead;
    if (!entityStartsDead) {
      entiteBox.addEventListener('dragstart', event => event.dataTransfer.setData('text', entiteBox.id));
    }
    updateRoleInDOM(entite, entiteBox);

	const castAnimation = document.createElement('div');
    castAnimation.id = `Cast_Animation_${entite.id}`;
    castAnimation.className = `cast-animation-container`;
	entiteBox.appendChild(castAnimation);

    const dragBox = document.createElement('div');
    dragBox.className = 'drag-box';
    dragBox.draggable = !entityStartsDead;
    if (!entityStartsDead) {
      dragBox.addEventListener('dragstart', event => {
          event.dataTransfer.setData('text', entiteBox.id);
          console.log('Started dragging:', entiteBox.id);
      });
    }

   
    let entityDiv = document.createElement('div');
    entityDiv.id = getBattleEntityDomId(entite);
    entityDiv.dataset.entityId = entite.id;
    entityDiv.className = `entitesContainer ${entite.type} ${entite.side}`;
	entityDiv.dataset.entityclasse = `${entite.classe}`;
    applyCombatProfileView(entityDiv, entite);
	entityDiv.dataset.entityType = entite.type;
    const initialAttack = getBattleTargetAttack(entite);
    if (initialAttack) {
        entityDiv.dataset.attackFunction = initialAttack.combatFunction;
        entityDiv.dataset.attackDomain = initialAttack.attackTarget[0] === 'hexa' ? 'invocateur'
            : initialAttack.deadTarget?.includes('yes') ? 'necro' : 'combattant';
    }

    let spriteContainer = document.createElement('div');
    spriteContainer.id = `spriteContainer_${entite.id}`;
    spriteContainer.className = `sprite-container ${entite.side}`;
    spriteContainer.dataset.dropable = 'true';
    spriteContainer.dataset.entityId = entite.id;


    let effectsContainer = document.createElement('div');
    effectsContainer.id = `effectsContainer_${entite.id}`;
    effectsContainer.className = 'effects-container';
    dragBox.appendChild(effectsContainer);


    let imgSide = document.createElement('div');
    imgSide.id = `imgContainer_${entite.id}`
    imgSide.className = `img-container img-side-${entite.side} ${entite.type}`;
    if (!entityStartsDead && entite.isSurprised === true) {
      imgSide.classList.add('surprised');
    }
    spriteContainer.appendChild(imgSide);


// SPRITE ENTITE - Conteneur d'animation
let spriteAnimation = document.createElement('div');
spriteAnimation.id = `Animationsprite_${entite.id}`;
spriteAnimation.className = entityStartsDead
  ? `animation-sprite ${entite.class} side-${entite.side} dead`
  : `animation-sprite ${entite.class} side-${entite.side}`;
imgSide.appendChild(spriteAnimation);

// Création de la div .sprite
let spriteDiv = document.createElement('div');
spriteDiv.className = `sprite side-${entite.side} ${entite.class} hb iddle`;
spriteDiv.id = `DragSprite_${entite.id}`;
spriteDiv.dataset.dropable = 'true';
spriteDiv.dataset.entityId = entite.id;
spriteDiv.setAttribute('draggable', entityStartsDead ? 'false' : 'true');
if (entityStartsDead) spriteDiv.classList.remove('hb');

// Aura Conteneur 
let AuraContainer = document.createElement('div');
AuraContainer.id = `auraContainer_${entite.id}`;
AuraContainer.className = `aura-container side-${entite.side} ${entite.class}`;
spriteAnimation.appendChild(AuraContainer);


// Création du canvas
let canvas = document.createElement('canvas');
canvas.id = `spriteCanvas_${entite.id}`;
canvas.width = entityStartsDead ? 603 : 500;
canvas.height = entityStartsDead ? 328 : 500;
canvas.className = entityStartsDead
  ? `dead-sprite ${entite.class} side-${entite.side} dead hbox`
  : `sprite-canvas side-${entite.side} ${entite.class}`;

// Ajout du canvas dans la div .sprite
spriteDiv.appendChild(canvas);

// Le canvas rejoint immédiatement l'arbre de l'entité. Aucun timer n'est
// nécessaire : l'arbre complet sera connecté lorsque entiteBox rejoindra body.
spriteAnimation.appendChild(spriteDiv);

// Récupération du contexte du canvas
let ctx = canvas.getContext('2d');

if (!ctx) {
    console.error("❌ Impossible d'obtenir le contexte 2D !");
}


// Chargement du sprite et dessin
const spriteSource = getEntitySpriteSource(entite);
spriteImage ||= cachedResourceImage(spriteSource);
const spriteEntite = spriteImage?.complete && spriteImage.naturalWidth > 0
  && spriteImage.src === new URL(cachedResourceUrl(spriteSource), document.baseURI).href ? spriteImage : new Image();
spriteEntite.fetchPriority = 'high';
let resolveSpriteReady;
const spriteReady = new Promise((resolve) => {
  resolveSpriteReady = resolve;
});

/*
 * IMPORTANT :
 * on installe les événements AVANT d'affecter src.
 * Sinon une image déjà en cache peut charger
 * avant l'enregistrement du onload.
 */
spriteEntite.onload = function () {
  if (!ctx) {
    resolveSpriteReady({ loaded: false, canvas, error: 'Contexte 2D indisponible' });
    return;
  }

  try {
    ctx.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
    );

    ctx.drawImage(
        spriteEntite,
        0,
        0,
        canvas.width,
        canvas.height
    );
  } catch (error) {
    console.error(`❌ Dessin du sprite impossible pour ${entite.id}`, error);
    resolveSpriteReady({ loaded: false, canvas, error: error.message });
    return;
  }

    /*
     * La synchronisation des effets arrive uniquement
     * après que le sprite réel a été dessiné.
     */
    if (!entityStartsDead) {
      const syncAuras = () => {
        if (!AuraContainer.isConnected) return;
        try {
          syncEntityAuras(entite, AuraContainer);
        } catch (error) {
          // Une aura défaillante ne doit jamais annuler le dessin du sprite.
          console.error(`❌ Synchronisation des auras impossible pour ${entite.id}`, error);
        }
      };
      if (AuraContainer.isConnected) syncAuras();
      else queueMicrotask(syncAuras);
    }

    resolveSpriteReady({ loaded: true, canvas, image: spriteEntite });
};

spriteEntite.onerror = function () {
    console.error(
        "❌ Erreur chargement image :",
        spriteEntite.src
    );
    resolveSpriteReady({
      loaded: false,
      canvas,
      error: `Image inaccessible : ${spriteEntite.src}`
    });
};

/*
 * Détermination du sprite après installation du onload.
 */
const isDead = entityStartsDead;

if (!isDead) {
    canvas.classList.remove(
        "dead",
        "hbox"
    );

    spriteDiv.classList.remove(
        "dead",
        "hbox"
    );

}
if (!spriteSource) {
    console.error(`Sprite non defini pour l'entite ${entite.id}`);
    resolveSpriteReady({ loaded: false, canvas, error: 'Sprite non defini' });
} else if (spriteEntite.complete && spriteEntite.naturalWidth > 0) {
    spriteEntite.onload();
} else {
    spriteEntite.src = cachedResourceUrl(spriteSource);
}
// SPRITE TARGET INFOS
 let TargetInfos = document.createElement('div');
 TargetInfos.id = `TargetInfos_${entite.id}`; 
 TargetInfos.className = `TargetInfos ${entite.classe}`;
  imgSide.appendChild(TargetInfos);

    entityDiv.appendChild(spriteContainer);

    let hudIngame = document.createElement('div');
    hudIngame.id = `hudIngame_${entite.id}`;
    hudIngame.className = `hud-ingame ${entite.side}`;

// ROLE HUD
	const roleTypeClasses = entite.type;
	let roleContainer = document.createElement('div');
    roleContainer.id = `roleContainer_${entite.id}`;
    roleContainer.className = `role-img-container ${roleTypeClasses} ${entite.side}`;
    hudIngame.appendChild(roleContainer);
		
    let roleImg = document.createElement('div');
    roleImg.id = `role-img_${entite.id}`; 
    roleImg.alt =`${entite.name} est un ${entite.role}`; 
    roleImg.className = `role-img role-${entite.role} ${roleTypeClasses}`;
    roleContainer.appendChild(roleImg);

    let roleImgHud = document.createElement('div');
    roleImgHud.className = `role-img-hud ${roleTypeClasses}`;
   	roleContainer.appendChild(roleImgHud);
	
const levelDiv = document.createElement("div");
levelDiv.className = "entity-level hu";
levelDiv.dataset.entityId = entite.id;
levelDiv.textContent = `${entite.level?.current ?? entite.level ?? 1}`;

hudIngame.appendChild(levelDiv);
	
// TARGET HUD	
	let TargetroleContainer = document.createElement('div');
    TargetroleContainer.id = `TargetroleContainer_${entite.id}`;
    TargetroleContainer.className = `target-role-img-container ${entite.type} ${entite.side} ${entite.classe}`;
    hudIngame.appendChild(TargetroleContainer);
	
	let TargetImg = document.createElement('div');
	TargetImg.className = `target-picto-hud ${entite.classe}`;
    TargetroleContainer.appendChild(TargetImg);
	
    let TargetroleImg = document.createElement('div');
    TargetroleImg.id = `Targetrole-img_${entite.id}`; 
    TargetroleImg.alt =`${entite.name} est un ${entite.role}`; 
    TargetroleImg.className = `role-img role-${entite.role} ${entite.type}`;
    TargetroleContainer.appendChild(TargetroleImg);

	let TargetRoleImgHud = document.createElement('div');
	TargetRoleImgHud.className = `targetrole-img-hud ${entite.type}`;
	TargetroleContainer.appendChild(TargetRoleImgHud);


// 🩸🛡️ Création du conteneur principal
const healthBarContainer = document.createElement('div');
healthBarContainer.className = 'health-bar-container';

// Création de la barre de vie + d’armure combinée
const lifeBarsContainer = createLifeBars(entite);
if (lifeBarsContainer) {
  healthBarContainer.appendChild(lifeBarsContainer);
}


    let entityPopUpTop = document.createElement('div');
    entityPopUpTop.id = `PopUp_${entite.id}`;
    entityPopUpTop.className = 'pop-up-txt';
    entityDiv.appendChild(entityPopUpTop);
	  let entityPopDown = document.createElement('div');
    entityPopDown.id = `PopDow_${entite.id}`;
    entityPopDown.className = 'pop-down-txt';
    entityDiv.appendChild(entityPopDown);
		
    let statusBar = document.createElement('div');
    statusBar.id = `statusBar_${entite.id}`;
    statusBar.className = `status-bar ${entite.type}`;
    hudIngame.appendChild(statusBar);
	
const movementCounter = createMovementCounter(entite);
if (movementCounter) {
  statusBar.appendChild(movementCounter);
}

statusBar.appendChild(healthBarContainer);
	const atbUI = CreateATBEntity(entite);
	statusBar.appendChild(atbUI);
	
	currentAttackTimers(entite, hudIngame);
	
    entiteBox.appendChild(hudIngame);
    entiteBox.appendChild(dragBox);
    dragBox.appendChild(entityDiv);
    updateEntityAttackTargetDisplay(entite);
    document.body.appendChild(entiteBox);
    applyEntitySizeVisual(entite);
    calibrateEntityVisuals(spriteDiv, spriteContainer.parentElement, entityPopUpTop, entityPopDown,
      { auraHost: AuraContainer, effectsHost: effectsContainer });
    if (entityStartsDead) {
      setTimeout(() => {
        if (entiteBox.isConnected && (entite.isDEAD || entite.statut?.includes('dead')
            || Number(entite.stats?.HP?.current) <= 0)) {
          stabilizeDeadEntityVisual(entite, { playDeathBlood: false });
        }
      }, 60);
    }

    return { element: entiteBox, canvas, spriteReady };
}

export function createHeadUpInDom(entityId) {
	  // Recherche de l'entité correspondant à l'ID fourni
   const entite = entites.find(e => e.id === Number(entityId));
    
    // Si aucune entité ne correspond à cet ID, on quitte la fonction
    if (!entite) {
        console.error(`Entité avec l'ID ${entityId} non trouvée.`);
        return;
    }
// Vérifier si gameContainer est bien défini
const gameContainer = document.getElementById('game-container'); 

// Vérifier si .AllEntitiesHud existe déjà dans #game-container
let allEntitiesHud = gameContainer.querySelector('.AllEntitiesHud');

if (!allEntitiesHud) {
    allEntitiesHud = document.createElement('div');
    allEntitiesHud.className = 'AllEntitiesHud';
    gameContainer.appendChild(allEntitiesHud);
}

// Vérifier si le HUD global existe déjà dans AllEntitiesHud
let HeadsupGlobal = allEntitiesHud.querySelector('.headsup-hud.global');
if (!HeadsupGlobal) {
    HeadsupGlobal = document.createElement('div');
    HeadsupGlobal.classList.add('headsup-hud', 'global');
    
    // Créer les conteneurs pour chaque côté du HUD
    const sideAHeadsup = document.createElement('div');
    sideAHeadsup.classList.add('headsup-hud-side', 'side-A');
    
    const sideBHeadsup = document.createElement('div');
    sideBHeadsup.classList.add('headsup-hud-side', 'side-B');

    // Ajouter les côtés au conteneur principal
    HeadsupGlobal.appendChild(sideAHeadsup);
    HeadsupGlobal.appendChild(sideBHeadsup);

    // Ajouter le HUD global au conteneur AllEntitiesHud
    allEntitiesHud.appendChild(HeadsupGlobal);
}


// Reference the side containers
let sideA = document.querySelector('.headsup-hud-side.side-A');
let sideB = document.querySelector('.headsup-hud-side.side-B');

// Create the HUD container for the entity
let HUContainer = document.createElement('div');
HUContainer.className = `headsup-container ${entite.side}`;
HUContainer.id = `headsup-container_${entite.id}`;

let PortraitContainer = document.createElement('div');
PortraitContainer.className = `portrait-container ${entite.type}`;
PortraitContainer.id = `portrait-container_${entite.id}`;
PortraitContainer.dataset.dropable = 'true';
PortraitContainer.dataset.entityId = entite.id;

let PortraitCadre = document.createElement('div');
PortraitCadre.alt = `Cadre du portrait du ${entite.name}`; 
PortraitCadre.className = `portrait-cadre ${entite.side} ${entite.type}`;

let PortraitRole = document.createElement('div');
PortraitRole.id = `rolePortrait_${entite.id}`;
PortraitRole.alt = `Role du ${entite.name}`; 
PortraitRole.className = `hud-portrait-role role-${entite.role} ${entite.type}`;

let PortraitEntite = document.createElement('img');
PortraitEntite.id = `portrait_${entite.id}`; 
PortraitEntite.alt = `Portrait du ${entite.name}`; 
PortraitEntite.className = `portrait-sprite side-${entite.side}`;
PortraitEntite.dataset.dropable = 'true';
PortraitEntite.dataset.entityId = entite.id;
PortraitEntite.src = cachedResourceUrl(`${entite.portrait}`);

PortraitContainer.appendChild(PortraitCadre);
PortraitContainer.appendChild(PortraitRole);
PortraitContainer.appendChild(PortraitEntite);
HUContainer.appendChild(PortraitContainer);

let HUInfos = document.createElement('div');
HUInfos.className = `HUInfos`;
HUContainer.appendChild(HUInfos);

let name = document.createElement('div');
name.id = `name_${entite.id}`;
name.className = `name name-${entite.type} auto-resize-text`; // Ajout de la classe pour resize

// Affichage : id > Nom/Pseudo : nickname > name > 'Entité inconnue'
name.textContent = `${entite.id} - ` + (entite.nickname ?? entite.name ?? 'Entité inconnue');

HUInfos.appendChild(name);
adjustFontSize(name);

let HUhealthBarContainer = document.createElement('div');
HUhealthBarContainer.className = `headsup-HP-container ${entite.side} ${entite.type}`;
HUhealthBarContainer.id = `headsup-HP-container_${entite.id}`;
HUInfos.appendChild(HUhealthBarContainer);

// ATB HUD
// Clonage visuel de la vraie jauge ATB
const realATBFill = document.getElementById(`atbFill_${entite.id}`);

if (realATBFill) {
    const atbHudBarContainer = document.createElement('div');
    atbHudBarContainer.id = `HUATB_${entite.id}`;
    atbHudBarContainer.className = 'headsup-atb-container';

    // Clone sans les événements
    const atbHudFill = realATBFill.cloneNode(false);
    atbHudFill.id = `HUATBfill_${entite.id}`;
    atbHudFill.className = 'headsup-atb-fill';

    atbHudBarContainer.appendChild(atbHudFill);
    HUInfos.appendChild(atbHudBarContainer);

    // Synchronisation dynamique (option 1)
    const syncATB = () => {
        if (!atbHudFill.isConnected || !realATBFill.isConnected) return;
        atbHudFill.style.width = realATBFill.style.width;
        requestAnimationFrame(syncATB);
    };
    requestAnimationFrame(syncATB);
}


// const lifeCounter = createLifeCounter(entite);
// if (lifeCounter) {
  // HUhealthBarContainer.appendChild(lifeCounter);
// }

// let vitalCounter = document.createElement('div');
// vitalCounter.id = `vitalCounter_${entite.id}`;
// vitalCounter.className = 'vital-counter';

// if (entite.stats?.extraLife && typeof entite.stats.extraLife === 'object') {
    // let extraLife = document.createElement('div');
    // extraLife.id = `extraLife_${entite.id}`;
    // extraLife.className = 'extraLife';
    // extraLife.textContent = `Vie : ${entite.stats.extraLife.current} / ${entite.stats.extraLife.max}`;
    // vitalCounter.appendChild(extraLife);
    // HUInfos.appendChild(vitalCounter);
// }

const lifeBarsHUD = createLifeBars(entite, { context: 'headsup' });
if (lifeBarsHUD) {
  lifeBarsHUD.id = `HeadsupLifeBars_${entite.id}`;
  HUhealthBarContainer.appendChild(lifeBarsHUD);
}

// Append the entity HUD container to the appropriate side
if (entite.side === 'B') {
    sideB.appendChild(HUContainer);
} else if (entite.side === 'A') {
    sideA.appendChild(HUContainer);
}}

export function createEntiteScanInDOM(entityId) {
    // Recherche de l'entité correspondant à l'ID fourni
    const entite = entites.find(e => e.id === entityId);
    
    // Si aucune entité ne correspond à cet ID, on quitte la fonction
    if (!entite) {
        console.error(`Entité avec l'ID ${entityId} non trouvée.`);
        return;
    }
  function getEncodedURL(url) {
        return url.split('/').map(encodeURIComponent).join('/');
    }
    const encodedURL = getEncodedURL(entite.sprite);

    let entityScan = document.createElement('div');
    entityScan.id = `ScanEntity_${entite.id}`;
    entityScan.className = `entite-details`;
    entite.kills = entite.kills || 0;
    entite.totalDamage = entite.totalDamage || 0;
    entite.totalHeal = entite.totalHeal || 0;

const shownAttack = getBattleTargetAttack(entite);
const isHexAttack = shownAttack?.attackTarget?.includes('hexa');
const listingFocusContent = isHexAttack ? '' : IngameListingFocus(entite.role,
    shownAttack?.attackTarget?.includes('enemy') ? AttackerSbireTargetPriority : AllySbireTargetPriority);
const combatProfile = applyCombatProfileView(entityScan, entite);

// ENTITY SCAN
// Image details
let detailsImageDiv = document.createElement('div');
detailsImageDiv.className = 'details-image';
detailsImageDiv.style.position = "relative"; // ✅ pour overlay aura

let entiteDetailsImageDiv = document.createElement('div');
entiteDetailsImageDiv.className = 'entite-details-image';
entiteDetailsImageDiv.dataset.dropable = 'true';
entiteDetailsImageDiv.dataset.entityId = entite.id;
entiteDetailsImageDiv.style.backgroundImage = `url('${encodedURL}')`;
detailsImageDiv.appendChild(entiteDetailsImageDiv);

// Entity side info
let entityCampP = document.createElement('p');
entityCampP.className = `entity-type-info entity-camp ${entite.side}`;
entityCampP.textContent = `Camp ${entite.side}`;
entityScan.appendChild(entityCampP);

// Close button
let closeScanSpan = document.createElement('span');
closeScanSpan.id = `closeScan_${entite.id}`;
closeScanSpan.className = 'close-scanentity';
closeScanSpan.textContent = 'X';
entityScan.appendChild(closeScanSpan);

// Créer le conteneur principal
let entitePrioPhraseDiv = document.createElement('div');
entitePrioPhraseDiv.id = `entitePrioPhrase_${entite.id}`;
entitePrioPhraseDiv.className = 'entite-prio-phrase';


// Créer le texte principal
let entitePrioPhraseStrong = document.createElement('div');
entitePrioPhraseStrong.className = 'entite-prio-phrase-help';

if (isHexAttack) {
    entitePrioPhraseStrong.innerHTML = `Cases disponibles au ciblage de l'<div class="Invocateur-txt-color">Invocateur</div> :`;
}

// Ajouter le texte principal à la div
entitePrioPhraseDiv.appendChild(entitePrioPhraseStrong);

// 🎯 Créer et remplir la div de zone cible
const targetZoneDiv = document.createElement('div');
targetZoneDiv.className = 'target-zone-role-display';
const targetZoneName = entite.targetZone || 'aucune';
targetZoneDiv.innerHTML = `<span class="target-zone-name">${targetZoneName}</span> ciblé en priorité.`;

// Ajouter à la div principale
entitePrioPhraseDiv.appendChild(targetZoneDiv);

// Injecter dans le DOM
// entityScan.appendChild(entitePrioPhraseDiv);

// Create the parent div
let scanControlDiv = document.createElement('div');
scanControlDiv.id = `scan-control_${entite.id}`;
scanControlDiv.className = 'scan-control';
entityScan.appendChild(scanControlDiv);

// Info button
let detailScanSpan = document.createElement('span');
detailScanSpan.id = `detailScan_${entite.id}`;
detailScanSpan.className = 'detail-scanentity';
scanControlDiv.appendChild(detailScanSpan);

let loreScanSpan = document.createElement('span');
loreScanSpan.id = `loreScan_${entite.id}`;
loreScanSpan.className = 'lore-scanentity';
scanControlDiv.appendChild(loreScanSpan);

let targetScanSpan = document.createElement('span');
targetScanSpan.id = `targetScan_${entite.id}`;
targetScanSpan.className = 'target-scanentity';
scanControlDiv.appendChild(targetScanSpan);

// Entity name info
let entityNameH2 = document.createElement('h2');
entityNameH2.className = 'entity-name-info';
entityNameH2.innerHTML = `lvl. ${entite.level.current} - ${entite.name}`;

// // Entity level info
// let entityLevelH2 = document.createElement('h2');
// entityLevelH2.className = 'entity-name-info';
// entityLevelH2.textContent = `lvl. ${entite.level.current}`;

let entityNickNameH2 = document.createElement('h2');
entityNickNameH2.className = 'entity-nickname-info';
if (entite.nickname) {
    entityNickNameH2.textContent = `${entite.nickname}`;
}

// Health bar container
let healthBarContainerDiv = document.createElement('div');
healthBarContainerDiv.className = 'health-bar-container details';


// (Optionnel) Ajoute aussi les compteurs HP + Armure à côté
const lifeCounter = createLifeCounter(entite);
if (lifeCounter) {
  healthBarContainerDiv.appendChild(lifeCounter);
}

// 🧩 Création et ajout des barres de vie + armure
const lifeBars = createLifeBars(entite);
if (lifeBars) {
  healthBarContainerDiv.appendChild(lifeBars);
}



// CLONE VISUEL DE LA JAUGE ATB POUR LE SCAN
const realATB = document.getElementById(`atbFill_${entite.id}`);

const atbTimer = document.createElement('div');
atbTimer.id = `speedTimer_${entite.id}`;
atbTimer.className = 'atb-scan-counter';
atbTimer.innerHTML = 'ATB :<br>0.0 / 0.0s';

    const atbScanContainer = document.createElement('div');
    atbScanContainer.id = `scanATB_${entite.id}`;
    atbScanContainer.className = 'atb-scan-container';

    const atbScanFill = realATB.cloneNode(false); // clone visuel
    atbScanFill.id = `scanATBFill_${entite.id}`;
    atbScanFill.className = 'atb-scan-fill';

	atbScanContainer.appendChild(atbTimer);
    atbScanContainer.appendChild(atbScanFill);
    
    // Animation continue en sync
    const syncScanATB = () => {
        if (!atbScanFill.isConnected || !realATB.isConnected) return;
        atbScanFill.style.width = realATB.style.width;
        requestAnimationFrame(syncScanATB);
    };
    requestAnimationFrame(syncScanATB);
	

// Focus listing
let focusListingDiv = document.createElement('div');
focusListingDiv.className = `flisting-${entite.type} focus-${entite.type} focus-listing ${entite.classe}`;
focusListingDiv.id = `listing_${entite.id}`;

// Si l'entité est de type 'lord', ajoute la structure de base pour les cibles
if (isLord(entite)) {
    // Créer la div pour les cibles "no-target"
    const noTargetContainer = document.createElement('div');
    noTargetContainer.className = 'listing-focus-lord-no-target';

    // Créer la div intérieure avec les classes spécifiées
    const innerDiv = document.createElement('div');
    innerDiv.className = 'lord-target-pic no-target';

    // Ajouter la div intérieure au conteneur "no-target"
    noTargetContainer.appendChild(innerDiv);

    // Créer le message "Pas de cible pour le moment"
    const noTargetMessage = document.createElement('div');
    noTargetMessage.className = 'no-target-message';
    noTargetMessage.textContent = 'Pas de cible pour le moment';

    // Ajouter le message "Pas de cible pour le moment" au conteneur "no-target"
    noTargetContainer.appendChild(noTargetMessage);

    // Ajouter le conteneur "no-target" au focusListingDiv
    focusListingDiv.appendChild(noTargetContainer);
}

// Insérer le contenu généré, si applicable
focusListingDiv.innerHTML += `${listingFocusContent}`;

// Ajouter le focusListingDiv au parent spécifié
entityScan.appendChild(focusListingDiv);
// END FOCUS LISTING

// Entity type info
let entityTypeStrong = document.createElement('strong');
entityTypeStrong.className = 'entity-type-info';
entityTypeStrong.textContent = `${entite.type}`;
entityScan.appendChild(entityTypeStrong);

// Entity role container
let entityRoleContainerDiv = document.createElement('div');
entityRoleContainerDiv.className = `entity-role-container ${entite.classe}`;
let entityRolePictoDiv = document.createElement('div');
entityRolePictoDiv.className = `entity-role-picto role-${entite.role}`;
if (combatProfile.domains.includes('necro')) {
    let entityNecroPictoDiv = document.createElement('div');
    entityNecroPictoDiv.className = `entity-Necro-picto`;
    entityRoleContainerDiv.appendChild(entityNecroPictoDiv);
}
let entityRoleHexastone = document.createElement('div');
entityRoleHexastone.className = `RoleHexastone ${entite.classe}`;
entityRoleContainerDiv.appendChild(entityRolePictoDiv);

let entityRoleTitleStrong = document.createElement('strong');
let entityRoleTitleDiv = document.createElement('div');
entityRoleTitleDiv.className = 'entity-role-title';
entityRoleTitleDiv.textContent = `${entite.role} `;

let entityClassP = document.createElement('p');
entityClassP.className = `entity-type-info entity-class ${entite.classe}`;
applyCombatProfileView(entityClassP, entite, { text: true, helper: true });

let entityRoleBadgeContainerDiv = document.createElement('div');
entityRoleBadgeContainerDiv.className = `entity-role-BadgeContainer ${entite.classe}`;
applyCombatProfileView(entityRoleBadgeContainerDiv, entite);
applyCombatProfileView(entityRoleContainerDiv, entite);
applyCombatProfileView(entityRoleHexastone, entite);

entityRoleContainerDiv.appendChild(entityRolePictoDiv);
entityRoleTitleStrong.appendChild(entityRoleTitleDiv);
entityRoleContainerDiv.appendChild(entityClassP);
entityRoleContainerDiv.appendChild(entityRoleTitleStrong);
entityRoleBadgeContainerDiv.appendChild(entityRoleContainerDiv);
entityRoleBadgeContainerDiv.appendChild(entityRoleHexastone);

// Entity detail columns
let entiteDetailColumnsDiv = document.createElement('div');
entiteDetailColumnsDiv.className = 'entite-detail-colomns';

// ENTITY STATS
let entiteDetailColomn2Div = document.createElement('div');
entiteDetailColomn2Div.className = 'entite-detail-colomn-2';

let entiteStatColomnDiv = document.createElement('div');
entiteStatColomnDiv.className = 'entite-stat-colomn';

let basicAttributesStrong = document.createElement('strong');
basicAttributesStrong.textContent = 'Attributs de base';
basicAttributesStrong.className = 'entite-stat-title';


// Vérification des types d'attaques
const hasHybridAttack = entite.attacks.some(attackName => {
    const attack = resolveAttackDefinitionForEntity(entite, attackName, attackDetails);
    return attack && attack.attacknature.includes('hybridalDamage');
});

const piercingDamageValue = Math.max(0, Number(getSafe(entite, "piercingDamage", 0)) || 0);
const haspiercingDamageAttack = piercingDamageValue > 0;


// Ajout des dégâts physiques et magiques
createUmbraBlock(entiteStatColomnDiv, "", () => getSafe(entite, "physicalDamage", 0), entite, "physicalDamage");
createUmbraBlock(entiteStatColomnDiv, "", () => getSafe(entite, "magicalDamage", 0), entite, "magicalDamage");
if (hasHybridAttack) {
    createUmbraBlock(entiteStatColomnDiv, "", () => getSafe(entite, "magicalDamage", 0) + getSafe(entite, "physicalDamage", 0), entite, "hybridalDamage");
}
if (piercingDamageValue > 0 && haspiercingDamageAttack) {
    createUmbraBlock(entiteStatColomnDiv, "", () => getSafe(entite, "piercingDamage", 0), entite, "piercingDamage");
}
createUmbraBlock(entiteStatColomnDiv, "", () => getSafe(entite, "physicalResistance", 0), entite, "physicalResistance");
createUmbraBlock(entiteStatColomnDiv, "", () => getSafe(entite, "magicalResistance", 0), entite, "magicalResistance");
if (entite.stats?.extraLife?.current > 0) {
    createUmbraBlock(entiteStatColomnDiv, "", () => entite.stats.extraLife.current, entite);
}
createUmbraBlock(entiteStatColomnDiv, "", () => getSafe(entite, "vitality", 0), entite, "vitality");
createUmbraBlock(entiteStatColomnDiv, "", () => getSafe(entite, "dodge", 0), entite, "dodge");
createUmbraBlock(entiteStatColomnDiv, "", () => getSafe(entite, "vision", 0), entite, "vision");
createUmbraBlock(entiteStatColomnDiv, "", () => getSafe(entite, "velocity", 0), entite, "velocity");

// Suppression des divs vides
[...entiteStatColomnDiv.children].forEach(child => {
    if (child.innerHTML.trim() === '') {
        console.log('Suppression de la div vide:', child);
        child.remove();
    }
});

// Ajout des éléments dans la structure principale
entiteDetailColomn2Div.appendChild(basicAttributesStrong);
entiteDetailColomn2Div.appendChild(entiteStatColomnDiv);


let entiteDetailColomn1Div = document.createElement('div');
entiteDetailColomn1Div.className = 'entite-detail-colomn-1';
let combatDataStrong = document.createElement('strong');
combatDataStrong.textContent = 'Combat du niveau';
const levelBattleStats = getLevelBattleStats(entite);
let killsDiv = document.createElement('div');
killsDiv.id = `Kills_${entite.id}`;
killsDiv.textContent = `Kills : ${levelBattleStats.kills}`;
let totalDamageDiv = document.createElement('div');
totalDamageDiv.id = `TotalDamages_${entite.id}`;
totalDamageDiv.textContent = `Dégâts : ${levelBattleStats.totalDamage}`;
let totalHealDiv = document.createElement('div');
totalHealDiv.id = `TotalHeal_${entite.id}`;
totalHealDiv.textContent = `Soins : ${levelBattleStats.totalHeal}`;
entiteDetailColomn1Div.appendChild(combatDataStrong);
entiteDetailColomn1Div.appendChild(killsDiv);
entiteDetailColomn1Div.appendChild(totalDamageDiv);
entiteDetailColomn1Div.appendChild(totalHealDiv);
for (const [key, label] of [
    ['deaths', 'Morts'],
    ['resurrections', 'Résurrections'],
    ['overkills', 'Overkills'],
    ['battlesFought', 'Combats menés'],
    ['extraLivesUsed', 'Vies supplémentaires consommées'],
]) {
    const row = document.createElement('div');
    row.textContent = `${label} : `;
    const value = document.createElement('span');
    value.dataset.levelBattleStat = key;
    value.dataset.entityId = entite.id;
    value.textContent = levelBattleStats[key];
    row.appendChild(value);
    entiteDetailColomn1Div.appendChild(row);
}

entiteDetailColumnsDiv.appendChild(entiteDetailColomn2Div);
entiteDetailColumnsDiv.appendChild(entiteDetailColomn1Div);
entityScan.appendChild(entiteDetailColumnsDiv);

// Attack details
let attackDetailsDiv = document.createElement('div');
attackDetailsDiv.className = `attack-details-activetimers`;
attackDetailsDiv.id = `attackTimers_${entite.id}`;  

// Conteneur des attaques
const attackContainer = document.createElement('div');
attackContainer.className = 'entite-attack-container';

attackContainer.appendChild(createEntityAttackDisplay(entite, { presentation: 'combat' }));

// Sélectionner ou créer la div AllEntitiesHud
var allEntitiesHud = document.querySelector('.AllEntitiesHud');

// Créer ou sélectionner la div .AllEntitiesScan à l'intérieur de AllEntitiesHud
var allEntitiesScan = document.querySelector('.AllEntitiesHud .AllEntitiesScan');

if (!allEntitiesScan) {
    allEntitiesScan = document.createElement('div');
    allEntitiesScan.className = 'AllEntitiesScan';
    allEntitiesHud.appendChild(allEntitiesScan);
}

let activAttackInfos = document.createElement('div');
activAttackInfos.className = `active-attack-infos`;
activAttackInfos.id = `ActiveAttackInfos_${entite.id}`;  

activAttackInfos.appendChild(entitePrioPhraseDiv);
// currentAttackTimers(entite, activAttackInfos);


// Ajouter les entityScan directement à .AllEntitiesScan
allEntitiesScan.appendChild(entityScan);
updateEntityAttackTargetDisplay(entite);
// Créer le conteneur principal pour les détails de l'entité
let entityScanContainer = document.createElement('div');
entityScanContainer.className = 'entite-details-Container';
entityScanContainer.id = `entiteDetailsContainer_${entite.id}`;


let entityLoreContainer = document.createElement('div');
entityLoreContainer.className = 'entite-lore-Container';
entityLoreContainer.id = `entiteLoreContainer_${entite.id}`;

// Ajouter tous les éléments déjà créés dans ce conteneur
entityScanContainer.appendChild(detailsImageDiv);
entityScanContainer.appendChild(entityCampP);
entityScanContainer.appendChild(entityNickNameH2);
entityScanContainer.appendChild(entityNameH2);
healthBarContainerDiv.appendChild(lifeBars);
entityScanContainer.appendChild(atbScanContainer);
entityScanContainer.appendChild(healthBarContainerDiv);
entityScanContainer.appendChild(atbScanContainer);
entityScanContainer.appendChild(activAttackInfos);
entityScanContainer.appendChild(entityTypeStrong);
entityScanContainer.appendChild(entityRoleBadgeContainerDiv);
entityScanContainer.appendChild(entiteDetailColumnsDiv);
entityScanContainer.appendChild(attackDetailsDiv);
entityScanContainer.appendChild(attackContainer);

// 🧰 Injection des stuffs
let codexColumn1 = document.createElement('div');
codexColumn1.className = 'stuff-battle';
codexColumn1.id = `stuffBattle_${entite.id}`;
createStuffDom(entite, codexColumn1);
entityScan.appendChild(codexColumn1);


// LORE
let clonedEntityNameH2 = entityNameH2.cloneNode(true);
clonedEntityNameH2.classList.add('lore');
entityLoreContainer.appendChild(clonedEntityNameH2);

let loreText = document.createElement('span');
loreText.className = 'lore-entite';

if (entite && entite.lore) {
    loreText.innerHTML = `<span class="lettrine">${entite.lore.charAt(0)}</span>${entite.lore.slice(1)}`;
} else {
    loreText.innerHTML = 'Données insuffisantes sur l\'Entité. Pour le moment...';
}

entityLoreContainer.appendChild(loreText);
entityScan.appendChild(entityScanContainer);
entityScan.appendChild(entityLoreContainer);
entityScan.appendChild(closeScanSpan);
allEntitiesScan.appendChild(entityScan);
updateRoleInDOM(entite);
updateEntityAttackTargetDisplay(entite);

	}
	
function currentAttackTimers(entite, container) {
    const attackTimers = document.createElement('div');
    attackTimers.id = `attackTimers_${entite.id}`;
    attackTimers.className = 'attaque-timers';

    const visualGroup = document.createElement('div');
    visualGroup.className = `active-attack-visual ${entite.classe}`;

    const attack = resolveAttackDefinitionForEntity(
        entite,
        entite.currentAttackId || entite.attacks?.[0],
        attackDetails
    );
    const currentAttackImage = document.createElement('img');
    currentAttackImage.id = `currentAttackImage_${entite.id}`;
    currentAttackImage.className = 'attack-image';
    currentAttackImage.src = cachedResourceUrl(attack?.attackAsset
    ? `${attack.attackAsset}-ld.jpg`
    : '');
    currentAttackImage.alt = attack?.displayName || '';
    visualGroup.appendChild(currentAttackImage);

    const timingsWrapper = document.createElement('div');
    timingsWrapper.className = 'active-attack-timings';

    const attackBarContainer = document.createElement('div');
    attackBarContainer.className = 'attack-bar-container';

    const attackBarFill = document.createElement('div');
    attackBarFill.id = `currentAttackBar_${entite.id}`;
    attackBarFill.className = `attack-bar-fill empty ${entite.classe}`;
    attackBarFill.style.width = '0%';

    attackBarContainer.appendChild(attackBarFill);

    const timerGroup = document.createElement('div');
    timerGroup.className = 'active-attack-text';

    const makeTimerBlock = (idSuffix, label) => {
        const div = document.createElement('div');
        div.id = `${idSuffix}_${entite.id}`;
        div.className = 'attaque-timers-active';
        div.innerHTML = `${label} :<br>0.0 / 0.0s`;
        return div;
    };

    const timerBlocks = {
        cooldown: makeTimerBlock('cooldownDisplay', 'Cooldown'),
        preparation: makeTimerBlock('preparationTimer', 'Preparation'),
        execution: makeTimerBlock('executionTimer', 'Execution'),
        recovery: makeTimerBlock('recoveryTimer', 'Recovery'),
    };
	
const battlePreparationDiv = document.createElement('div');
battlePreparationDiv.classList.add('battle-timer-display');
battlePreparationDiv.id = `battlePreparation_${entite.id}`;
battlePreparationDiv.textContent = '...'; // contenu temporaire ou vide

timerBlocks.Battlepreparation = battlePreparationDiv;
    // timerGroup.appendChild(timerBlocks.cooldown);
timerGroup.appendChild(timerBlocks.Battlepreparation);
    // timerGroup.appendChild(timerBlocks.execution);
    // timerGroup.appendChild(timerBlocks.recovery);

    // 🔄 Changement ici : on ajoute timerGroup dans attackBarContainer
    attackBarContainer.appendChild(timerGroup);
    timingsWrapper.appendChild(attackBarContainer);
    visualGroup.appendChild(timingsWrapper);
    attackTimers.appendChild(visualGroup);
    container.appendChild(attackTimers);
}

export function CreateATBEntity(entite, { mirror = false } = {}) {
    const suffix = mirror ? `combat_${entite.id}` : entite.id;
    const SpeedInterface = document.createElement('div');
    SpeedInterface.id = `SpeedInterface_${suffix}`;
    SpeedInterface.className = 'speed-interface';

    const atbJauge = document.createElement('div');
    atbJauge.id = `atbJauge_${suffix}`;
    atbJauge.className = 'atb-container';

    const atbFill = document.createElement('div');
    atbFill.id = `atbFill_${suffix}`;
    atbFill.className = 'atb-fill';

    atbJauge.appendChild(atbFill);
    SpeedInterface.appendChild(atbJauge);

    if (mirror) {
        const source = document.getElementById(`SpeedInterface_${entite.id}`);
        const sourceFill = document.getElementById(`atbFill_${entite.id}`);
        const sourceBox = document.getElementById(`Box_Entite_${entite.id}`);
        // Reuse the board ATB's resolved state, including orders and search pulses.
        const observer = new MutationObserver(() => {
            SpeedInterface.className = source?.className || 'speed-interface';
            for (const state of ['entity-target-searching', 'entity-target-search-failed', 'entity-cooldown-waiting']) {
                SpeedInterface.classList.toggle(state, Boolean(sourceBox?.classList.contains(state)));
            }
            atbFill.className = sourceFill?.className || 'atb-fill';
            atbFill.style.cssText = sourceFill?.style.cssText || '';
        });
        SpeedInterface.className = source?.className || 'speed-interface';
        for (const state of ['entity-target-searching', 'entity-target-search-failed', 'entity-cooldown-waiting']) {
            SpeedInterface.classList.toggle(state, Boolean(sourceBox?.classList.contains(state)));
        }
        atbFill.className = sourceFill?.className || 'atb-fill';
        atbFill.style.cssText = sourceFill?.style.cssText || '';
        if (source) observer.observe(source, { attributes: true, subtree: true, attributeFilter: ['class', 'style'] });
        if (sourceBox) observer.observe(sourceBox, { attributes: true, attributeFilter: ['class'] });
        SpeedInterface.dispose = () => observer.disconnect();
    }

    return SpeedInterface; // On retourne l'élément DOM complet
}
