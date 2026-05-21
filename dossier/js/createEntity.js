import { updateRoleInDOM} from './load-entity.js'; 
import { IngameListingFocus, AttackerSbireTargetPriority, AllySbireTargetPriority } from './role-rule.js';
import { createUmbraBlock, AttackDetailInfos, MultiAttackDisplay, createStuffDom } from './GameInit.js';
import { entites } from './entites.js'; 
import { attackDetails } from './attackList.js';
import { adjustFontSize } from './ui.js';
import { updateHealthBar } from './UpgradeEntity.js';
import { getPoolCurrent } from './entityAttributs.js';

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

export function createArmorCounter(entite) {
  const currentArmor = entite?.stats?.armor?.current ?? 0;
  const maxArmor     = entite?.stats?.armor?.max ?? 0;

  // Affichage uniquement si l’armure existe réellement et est > 0
  if (!(maxArmor > 0 && currentArmor > 0)) return null;

  const node = document.createElement("div");
  node.className = "armor-counter hu"; // "hu" si tu veux la même typo que tes autres compteurs
  node.dataset.stat = "armor-counter";
  node.dataset.entityId = entite.id;

  node.textContent = `🛡️ ${currentArmor}`; // conforme à ton exemple
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
  fadedLifeCounterContainer.dataset.stat = "fadedLife-counter";
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
  extraLifeCounterContainer.dataset.stat = "extraLife-counter";
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

  // Unicité : affichage uniquement si la stat existe et max>0
  const etMax =
    et && typeof et === "object" ? (Number(et.max ?? 0) || 0) : 0;

  if (!(etMax > 0)) return null;

  const etCurrent =
    et && typeof et === "object" ? (Number(et.current ?? 0) || 0) : 0;

  // Clamp sécurité (0/1)
  const cur = etCurrent > 0 ? 1 : 0;
  const max = 1;

  const eternalLifeCounterContainer = document.createElement("div");
  eternalLifeCounterContainer.className = "eternalLife-counter";
  eternalLifeCounterContainer.dataset.stat = "eternalLife-counter";
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

  const armor = createArmorCounter(entite);
  if (armor) lifeCounterContainer.appendChild(armor);

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
  const validArmor = Math.max(0, Math.min(ArmorCurrent, ArmorMax));

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
  if (validArmor > 0 && ArmorMax > 0) {
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
    updateHealthBar(HPcurrent, HPmax, ArmorCurrent, ArmorMax, entite.id, 0);
  });

  return container;
}

export function createEntiteInDOM(entite) {
    // console.log('// EXEC createEntiteInDOM');

    const entiteBox = document.createElement('div');
    entiteBox.id = `Box_Entite_${entite.id}`;
    entiteBox.className = `entite-box side-${entite.side} role-${entite.role}`;
    entiteBox.setAttribute('data-position', `hex_${15 + entite.id - 2}`);
    entiteBox.addEventListener('dragstart', event => event.dataTransfer.setData('text', entiteBox.id));
    updateRoleInDOM(entite, entiteBox);

	const castAnimation = document.createElement('div');
    castAnimation.id = `Cast_Animation_${entite.id}`;
    castAnimation.className = `cast-animation-container`;
	entiteBox.appendChild(castAnimation);

    const dragBox = document.createElement('div');
    dragBox.className = 'drag-box';
    dragBox.addEventListener('dragstart', event => {
        event.dataTransfer.setData('text', entiteBox.id);
        console.log('Started dragging:', entiteBox.id);
    });

   
    let entityDiv = document.createElement('div');
    entityDiv.id = `${entite.type}_${entite.id}`;
    entityDiv.className = `entitesContainer ${entite.type} ${entite.side}`;
	entityDiv.dataset.entityclasse = `${entite.classe}`;

    let spriteContainer = document.createElement('div');
    spriteContainer.id = `spriteContainer_${entite.id}`;
    spriteContainer.className = `sprite-container ${entite.side}`;

if (entite.stats.hypercognition > 0) {
    spriteContainer.classList.add("hypercognition-aura");
}

    let effectsContainer = document.createElement('div');
    effectsContainer.id = `effectsContainer_${entite.id}`;
    effectsContainer.className = 'effects-container';
    dragBox.appendChild(effectsContainer);


    let imgSide = document.createElement('div');
    imgSide.id = `imgContainer_${entite.id}`
    imgSide.className = `img-container img-side-${entite.side} ${entite.type}`;
    spriteContainer.appendChild(imgSide);


// SPRITE ENTITE - Conteneur d'animation
let spriteAnimation = document.createElement('div');
spriteAnimation.id = `Animationsprite_${entite.id}`;
spriteAnimation.className = `animation-sprite ${entite.class} side-${entite.side}`;
imgSide.appendChild(spriteAnimation);

// Création de la div .sprite
let spriteDiv = document.createElement('div');
spriteDiv.className = `sprite side-${entite.side} ${entite.class} hb iddle`;
spriteDiv.id = `DragSprite_${entite.id}`;
spriteDiv.setAttribute('draggable', 'true'); // Rend la div draggable

// Aura Conteneur 
let AuraContainer = document.createElement('div');
AuraContainer.id = `auraContainer_${entite.id}`;
AuraContainer.className = `aura-container side-${entite.side} ${entite.class}`;
spriteAnimation.appendChild(AuraContainer);
syncEntityAuras(entite, AuraContainer);

// Création du canvas
let canvas = document.createElement('canvas');
canvas.id = `spriteCanvas_${entite.id}`;
canvas.width = 500;
canvas.height = 500;
canvas.className = `sprite-canvas side-${entite.side} ${entite.class}`;

// Ajout du canvas dans la div .sprite
spriteDiv.appendChild(canvas);

// Ajout de la div .sprite dans #Animationsprite_
setTimeout(() => {
    let animSprite = document.getElementById(`Animationsprite_${entite.id}`);
    if (animSprite) {
        animSprite.appendChild(spriteDiv);
        console.log("✅ Div .sprite ajoutée à Animationsprite_ avec le canvas :", canvas.id);
    } else {
        console.error("❌ Animationsprite_ introuvable !");
    }
}, 50);

// Récupération du contexte du canvas
let ctx = canvas.getContext('2d');

if (!ctx) {
    console.error("❌ Impossible d'obtenir le contexte 2D !");
}


// Chargement du sprite et dessin
let spriteEntite = new Image();

if (entite.stats.HP.current <= 0) {
    spriteEntite.src = entite.deadsprite || "/media/sprites/0-dead.png";

    // ✅ Ajout des classes si entité morte
    canvas.classList.add('dead', 'hbox');
    spriteDiv.classList.add('dead', 'hbox');
} else {
    spriteEntite.src = entite.sprite;
}

spriteEntite.onload = function() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(spriteEntite, 0, 0, canvas.width, canvas.height);
};

spriteEntite.onerror = function() {
    console.error("❌ Erreur chargement image :", spriteEntite.src);
};

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
	let roleContainer = document.createElement('div');
    roleContainer.id = `roleContainer_${entite.id}`;
    roleContainer.className = `role-img-container ${entite.type} ${entite.side}`;
    hudIngame.appendChild(roleContainer);
		
    let roleImg = document.createElement('div');
    roleImg.id = `role-img_${entite.id}`; 
    roleImg.alt =`${entite.name} est un ${entite.role}`; 
    roleImg.className = `role-img role-${entite.role} ${entite.type}`;
    roleContainer.appendChild(roleImg);

    let roleImgHud = document.createElement('div');
    roleImgHud.className = `role-img-hud ${entite.type}`;;
   	roleContainer.appendChild(roleImgHud);
	
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
	
    statusBar.appendChild(healthBarContainer);

	const atbUI = CreateATBEntity(entite);
	statusBar.appendChild(atbUI);
	
	currentAttackTimers(entite, hudIngame);
	
    entiteBox.appendChild(hudIngame);
    entiteBox.appendChild(dragBox);
    dragBox.appendChild(entityDiv);
	
setTimeout(() => {
    let animSprite = document.getElementById(`Animationsprite_${entite.id}`);
    if (animSprite) {
        animSprite.appendChild(spriteDiv);

        console.log("✅ Div .sprite ajoutée :", canvas.id);

        // 🎇 FX PERSISTANTS – Hypercognition après création du sprite

    } else {
        console.error("❌ Animationsprite_ introuvable !");
    }
}, 50);
    document.body.appendChild(entiteBox);
	    requestAnimationFrame(() => syncEntityAuras(entite, "battle"));
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
PortraitEntite.src = `${entite.portrait}`;

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

let entiteClasse = `${entite.classe}`;
let entiteClasseParts = entiteClasse.split(" "); // Séparer par espace pour obtenir le préfixe et le type de classe
let necroMode = entiteClasseParts.includes("Necro"); // Vérifier si "Necro" est présent

// Définir le type principal de la classe (Support, Attaquant, etc.)
let typeClasse = necroMode ? entiteClasseParts[1] : entiteClasseParts[0];

let listingFocusContent;

// Appliquer la logique de priorité en fonction du type de classe
if (typeClasse === "Support") {
    listingFocusContent = IngameListingFocus(entite.role, AllySbireTargetPriority, necroMode);
} else if (typeClasse === "Attaquant" || typeClasse === "Invocateur") {
    listingFocusContent = IngameListingFocus(entite.role, AttackerSbireTargetPriority, necroMode);
} else {
    console.error(`Erreur: classe non supportée '${entite.classe}' pour l'entité avec ID ${entite.id}. Type de classe : ${typeClasse}`);
    listingFocusContent = 'Classe non supportée';
}

// // Logique additionnelle pour les entités de type "Necro" : cibler les entités mortes
// if (necroMode) {
    // listingFocusContent += `<div class="necro-target-detail">Cibler uniquement les entités mortes</div>`;
    // // Vous pouvez aussi ajuster la logique pour prioriser des cibles spécifiques mortes ici
// }

// console.log(listingFocusContent);

// ENTITY SCAN
// Image details
let detailsImageDiv = document.createElement('div');
detailsImageDiv.className = 'details-image';
detailsImageDiv.style.position = "relative"; // ✅ pour overlay aura

let entiteDetailsImageDiv = document.createElement('div');
entiteDetailsImageDiv.className = 'entite-details-image';
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

if (entite.classe === 'Invocateur') {
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
        atbScanFill.style.width = realATB.style.width;
        requestAnimationFrame(syncScanATB);
    };
    requestAnimationFrame(syncScanATB);
	

// Focus listing
let focusListingDiv = document.createElement('div');
focusListingDiv.className = `flisting-${entite.type} focus-${entite.type} focus-listing ${entite.classe}`;
focusListingDiv.id = `listing_${entite.id}`;

// Si l'entité est de type 'lord', ajoute la structure de base pour les cibles
if (entite.type === 'lord') {
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
if (entityRoleContainerDiv && entityRoleContainerDiv.classList.contains('Necro')) {
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
entityClassP.textContent = `${entite.classe}`;

let entityRoleBadgeContainerDiv = document.createElement('div');
entityRoleBadgeContainerDiv.className = `entity-role-BadgeContainer ${entite.classe}`;

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
    const attack = attackDetails.find(a => a.functionName === attackName);
    return attack && attack.attacknature.includes('hybridalDamage');
});

const haspiercingDamageAttack = (Math.max(0, +entite?.stats?.piercingDamage || 0) > 0);


// Ajout des dégâts physiques et magiques
createUmbraBlock(entiteStatColomnDiv, "", () => entite.stats.physicalDamage, entite);
createUmbraBlock(entiteStatColomnDiv, "", () => entite.stats.magicalDamage, entite);
if (hasHybridAttack) {
    createUmbraBlock(entiteStatColomnDiv, "", () => entite.stats.magicalDamage + entite.stats.physicalDamage , entite);
}
if (entite.stats.piercingDamage > 0 && haspiercingDamageAttack) {
    createUmbraBlock(entiteStatColomnDiv, "", () => entite.stats.piercingDamage, entite);
}
createUmbraBlock(entiteStatColomnDiv, "", () => entite.stats.physicalResistance, entite);
createUmbraBlock(entiteStatColomnDiv, "", () => entite.stats.magicalResistance, entite);
if (entite.stats?.extraLife?.current > 0) {
    createUmbraBlock(entiteStatColomnDiv, "", () => entite.stats.extraLife.current, entite);
}
createUmbraBlock(entiteStatColomnDiv, "", () => entite.stats.vitality, entite);
createUmbraBlock(entiteStatColomnDiv, "", () => entite.stats.dodge, entite);
createUmbraBlock(entiteStatColomnDiv, "", () => entite.stats.precision, entite);
createUmbraBlock(entiteStatColomnDiv, "", () => entite.stats.velocity, entite);

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
combatDataStrong.textContent = 'Données de combat';
let killsDiv = document.createElement('div');
killsDiv.id = `Kills_${entite.id}`;
killsDiv.textContent = `Kills : ${entite.kills}`;
let totalDamageDiv = document.createElement('div');
totalDamageDiv.id = `TotalDamages_${entite.id}`;
totalDamageDiv.textContent = `Dégats totaux : ${entite.totalDamage}`;
let totalHealDiv = document.createElement('div');
totalHealDiv.id = `TotalHeal_${entite.id}`;
totalHealDiv.textContent = `Soins totaux : ${entite.totalHeal}`;
entiteDetailColomn1Div.appendChild(combatDataStrong);
entiteDetailColomn1Div.appendChild(killsDiv);
entiteDetailColomn1Div.appendChild(totalDamageDiv);
entiteDetailColomn1Div.appendChild(totalHealDiv);

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

// Ajout des attaques via AttackDetailInfos()
if (entite.attacks.length === 1) {
    // Affichage simple pour l’unique attaque
    const attack = attackDetails.find(a => a.functionName === entite.attacks[0]);
    if (attack) {
        const attackDetailsDivElement = AttackDetailInfos(attack, entite);
        attackContainer.appendChild(attackDetailsDivElement);
    }
} else if (entite.attacks.length > 1) {
    const multiAttackDisplay = MultiAttackDisplay(entite);
    attackContainer.appendChild(multiAttackDisplay);
}

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

	}
	
function currentAttackTimers(entite, container) {
    const attackTimers = document.createElement('div');
    attackTimers.id = `attackTimers_${entite.id}`;
    attackTimers.className = 'attaque-timers';

    const visualGroup = document.createElement('div');
    visualGroup.className = `active-attack-visual ${entite.classe}`;

    const attack = attackDetails.find(a => a.attackId === entite.currentAttackId);
    const currentAttackImage = document.createElement('img');
    currentAttackImage.id = `currentAttackImage_${entite.id}`;
    currentAttackImage.className = 'attack-image';
    currentAttackImage.src = attack?.attackAsset || '';
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

export function CreateATBEntity(entite) {
    const SpeedInterface = document.createElement('div');
    SpeedInterface.id = `SpeedInterface_${entite.id}`;
    SpeedInterface.className = 'speed-interface';

    const atbJauge = document.createElement('div');
    atbJauge.id = `atbJauge_${entite.id}`;
    atbJauge.className = 'atb-container';

    const atbFill = document.createElement('div');
    atbFill.id = `atbFill_${entite.id}`;
    atbFill.className = 'atb-fill';

    atbJauge.appendChild(atbFill);
    SpeedInterface.appendChild(atbJauge);

    return SpeedInterface; // On retourne l'élément DOM complet
}
// =========================
// AURA SYSTEM (GENERIC)
// 2 auras pour l’instant :
// - Hypercognition (FX aléatoires en boucle)
// - Life halos (eternal/extra/faded)
// Appel unique : syncEntityAuras(entite, AuraContainer) ou syncEntityAuras(entite, "battle")
// =========================

function getSpriteBox(entite, auraContainer) {
  // Codex: image
  const codexRoot = auraContainer.closest(".codex-entity-scan") || auraContainer.parentElement;
  const img = codexRoot?.querySelector("img.codex-scan-image");

  if (img) {
    const r = img.getBoundingClientRect();
    return { w: r.width || img.naturalWidth || 64, h: r.height || img.naturalHeight || 64 };
  }

  // Battle fallback: auraContainer est déjà overlay sur le sprite
  const r = auraContainer.getBoundingClientRect();
  return { w: r.width || 64, h: r.height || 64 };
}
// ---------- HELPERS ----------
function isElement(node) {
  return !!node && typeof node === "object" && node.nodeType === 1;
}
function resolveAuraContainer(entite, sourceOrContainer = "battle") {
  // ✅ si on passe un container direct
  if (isElement(sourceOrContainer)) {
    // IMPORTANT : il lui faut un id stable
    if (!sourceOrContainer.id) sourceOrContainer.id = `auraContainer_direct_${entite.id}`;
    return sourceOrContainer;
  }

  // ✅ sinon on résout via id attendu
  const id =
    sourceOrContainer === "codex"
      ? `auraContainer_codex_${entite.id}`
      : `auraContainer_${entite.id}`;

  return document.getElementById(id);
}

function getAuraContextKey(container) {
  return container?.id || "aura"; // ✅ clé stable
}

// =========================
// 1) HYPERCOGNITION (refactor : accepte container direct)
// =========================
const HYPERCOG = {
  FX_DURATION: 2000,
  FX_BASE_INTERVAL: 2000,
  FX_VARIATION: 0.10,
  FX_PATHS: [
    "/media/assets/effects/hypercognition-01.gif",
    "/media/assets/effects/hypercognition-02.gif",
    "/media/assets/effects/hypercognition-03.gif"
  ]
};

function variationPercent(base, percent) {
  const min = base * (1 - percent);
  const max = base * (1 + percent);
  return Math.random() * (max - min) + min;
}

function ensureHypercognitionLayer(entite, container, ctxKey) {
  const layerKey = `_auraLayer_hypercognition_${ctxKey}`;
  let layer = entite[layerKey];

  // 1) si le cache pointe vers un node mort, on invalide
  if (layer && !container.contains(layer)) layer = null;

  // 2) adoption DOM : si une layer existe déjà, on la réutilise
  if (!layer) {
    const layers = container.querySelectorAll(":scope > .aura-fx.hypercognition");
    if (layers.length) {
      layer = layers[0];
      // cleanup sécurité : supprime d'éventuels doublons
      for (let i = 1; i < layers.length; i++) layers[i].remove();
    }
  }

  // 3) création seulement si aucune layer n'existe
  if (!layer) {
    layer = document.createElement("div");
    layer.className = "aura-fx hypercognition";
    container.appendChild(layer);
  }

  entite[layerKey] = layer;
  return layer;
}

function stopHypercognition(entite, ctxKey) {
  const timeoutKey = `_hypercognitionTimeout_${ctxKey}`;
  if (entite[timeoutKey]) {
    clearTimeout(entite[timeoutKey]);
    entite[timeoutKey] = null;
  }

  const layerKey = `_auraLayer_hypercognition_${ctxKey}`;
  const layer = entite[layerKey];
  if (layer) {
    layer.remove();
    entite[layerKey] = null;
  }
}

function startHypercognition(entite, container, ctxKey) {
  const timeoutKey = `_hypercognitionTimeout_${ctxKey}`;

  // déjà actif
  if (entite[timeoutKey]) return;

  const layer = ensureHypercognitionLayer(entite, container, ctxKey);

  function spawnFx() {
    const fx = document.createElement("img");
    const chosenFx = HYPERCOG.FX_PATHS[Math.floor(Math.random() * HYPERCOG.FX_PATHS.length)];

    fx.src = `${chosenFx}?t=${performance.now()}`;
    fx.className = "hypercognition-aura-fx";
    fx.style.position = "absolute";
    fx.style.pointerEvents = "none";
    fx.style.width = "64px";
    fx.style.height = "64px";

    const rect = layer.getBoundingClientRect();
    fx.style.left = Math.random() * rect.width + "px";
    fx.style.top  = Math.random() * rect.height + "px";

    const rotation = Math.random() * 360;
    const scale = 0.5 + Math.random() * 0.5;
    fx.style.transform = `rotate(${rotation}deg) scale(${scale})`;

    layer.appendChild(fx);
    setTimeout(() => fx.remove(), HYPERCOG.FX_DURATION);
  }

  function loopSpawn() {
    // stop si container/layer n’existent plus
    if (!document.body.contains(container) || !document.body.contains(layer)) {
      stopHypercognition(entite, ctxKey);
      return;
    }

    spawnFx();

    const nextDelay = variationPercent(HYPERCOG.FX_BASE_INTERVAL, HYPERCOG.FX_VARIATION);
    entite[timeoutKey] = setTimeout(loopSpawn, nextDelay);
  }

  loopSpawn();
}

function syncHypercognitionAura(entite, container, ctxKey) {
  const points = Number(entite?.stats?.hypercognition ?? 0) || 0;
  if (points > 0) startHypercognition(entite, container, ctxKey);
  else stopHypercognition(entite, ctxKey);
}


// =========================
// 2) LIFE HALOS (ton système actuel, rendu idempotent + cleanup root si vide)
// =========================
const LIFE_AURA_MAP = {
  eternalLife: { icon:"/media/assets/effects/picto-aura-eternallife.svg", sizeR:0.55, offsetR:0.00, ampR:0.05, floatDur:1800, z:7 },
  extraLife:   { icon:"/media/assets/effects/picto-aura-extralife.svg",   sizeR:0.45, offsetR:0.06, ampR:0.045,floatDur:1900, z:6 },
  fadedLife:   { icon:"/media/assets/effects/picto-aura-fadedlife.svg",   sizeR:0.35, offsetR:0.12, ampR:0.04, floatDur:2000, z:5 }
};


function getSpriteBoxFromAuraContainer(entite, auraContainer) {
  const dragEl  = document.getElementById(`DragSprite_${entite?.id}`);
  const codexEl = document.getElementById(`codex-image_${entite?.id}`);
  const el = dragEl || codexEl;

  if (el) {
    const r = el.getBoundingClientRect();
    const img = el.tagName === "IMG" ? el : el.querySelector?.("img");
    return {
      w: r.width || img?.naturalWidth || 64,
      h: r.height || img?.naturalHeight || 64
    };
  }

  const codexRoot = auraContainer.closest(".codex-entity-scan") || auraContainer.parentElement;
  const img = codexRoot?.querySelector("img.codex-scan-image");
  if (img) {
    const r = img.getBoundingClientRect();
    return { w: r.width || img.naturalWidth || 64, h: r.height || img.naturalHeight || 64 };
  }

  const r = auraContainer.getBoundingClientRect();
  return { w: r.width || 64, h: r.height || 64 };
}

function ensureLifeAuraStyles() {
  if (document.getElementById("lifeAuraStyles")) return;

  const style = document.createElement("style");
  style.id = "lifeAuraStyles";
  style.textContent = `
    .life-aura-wrap { position:absolute; left:50%; top:0; pointer-events:none; }
    .life-aura-img  { display:block; width:100%; height:100%; pointer-events:none; }

    @keyframes lifeAuraFloat {
      0%   { transform: translateY(0px); }
      50%  { transform: translateY(calc(-1 * var(--amp))); }
      100% { transform: translateY(0px); }
    }

    .life-aura-img {
      animation-name: lifeAuraFloat;
      animation-timing-function: ease-in-out;
      animation-iteration-count: infinite;
      will-change: transform;
    }
  `;
  document.head.appendChild(style);
}
const LIFE_AURA_ORDER = ["fadedLife", "extraLife", "eternalLife"];
const AURA_REF_BASE = 120;      // taille “référence” (px)
const AURA_INV_EXP  = 1.15;     // >1 => plus c’est grand, plus ça rétrécit
const AURA_MIN_F    = 0.45;     // clamp
const AURA_MAX_F    = 1.35;

function getInverseAuraScale(base) {
  const f = Math.pow(AURA_REF_BASE / Math.max(1, base), AURA_INV_EXP);
  return Math.min(AURA_MAX_F, Math.max(AURA_MIN_F, f));
}

function getOrInitLifeAuraBase(entite, container, ctxKey) {
  const baseKey = `_lifeAuraBase_${ctxKey}`;

  // ✅ Base figée : si déjà définie, on ne la recalcule jamais
  const existing = entite[baseKey];
  if (Number.isFinite(existing) && existing > 0) return existing;

  const { w, h } = getSpriteBoxFromAuraContainer(entite, container);
  const base = Math.max(w, h) || 64;
  entite[baseKey] = base;
  return base;
}
function updateLifeAurasInContainer(entite, container, ctxKey) {
  ensureLifeAuraStyles();

  const isNode = (v) => !!v && typeof v === "object" && typeof v.nodeType === "number";
  const isEl   = (v) => isNode(v) && v.nodeType === 1;

  // Si container n’est pas un Element, on ne peut rien faire proprement
  if (!isEl(container)) return;

  const rootKey = `_lifeAurasRoot_${ctxKey}`;

  const activeKeys = LIFE_AURA_ORDER.filter(
    (k) => getPoolCurrent(entite?.stats?.[k]) > 0
  );

  // Rien d’actif => cleanup
  if (activeKeys.length === 0) {
    const root = entite[rootKey];
    if (isEl(root)) root.remove();
    entite[rootKey] = null;

    for (const k of Object.keys(LIFE_AURA_MAP)) {
      const elKey = `_lifeAuraEl_${k}_${ctxKey}`;
      const node = entite[elKey];
      if (isEl(node)) node.remove();
      entite[elKey] = null;
    }
    return;
  }

  let root = entite[rootKey];
  let dirtyOrder = false;

  // Purge si root n’est pas un vrai Element (ou s’il n’est plus sous container)
  if (!isEl(root) || root.parentNode !== container) {
    root = null;
    entite[rootKey] = null;
  }

  if (!root) {
    const roots = container.querySelectorAll(":scope > .aura-fx.life-sup");
    if (roots.length) {
      root = roots[0];
      for (let i = 1; i < roots.length; i++) roots[i].remove();
      dirtyOrder = true;
    } else {
      root = document.createElement("div");
      root.className = "aura-fx life-sup";
      container.appendChild(root);
      dirtyOrder = true;
    }
    entite[rootKey] = root;
  }

  const base = getOrInitLifeAuraBase(entite, container, ctxKey);
  const inv = getInverseAuraScale(base);

  for (const key of LIFE_AURA_ORDER) {
    const cfg = LIFE_AURA_MAP[key];
    const cur = getPoolCurrent(entite?.stats?.[key]);

    const elKey = `_lifeAuraEl_${key}_${ctxKey}`;
    let existingAnim = entite[elKey];

    // Purge si la “référence” n’est pas un Element
    if (existingAnim && !isEl(existingAnim)) {
      entite[elKey] = null;
      existingAnim = null;
      dirtyOrder = true;
    }

    if (cur <= 0) {
      if (existingAnim) {
        existingAnim.remove();
        entite[elKey] = null;
        dirtyOrder = true;
      }
      continue;
    }

    // Déjà créée => rattache si nécessaire
    if (existingAnim) {
      if (existingAnim.parentNode !== root) {
        root.appendChild(existingAnim);
        dirtyOrder = true;
      }
      continue;
    }

    // Adoption DOM si déjà présent
    const domExisting = root.querySelector(`.life-aura-anim.anim-${key}`);
    if (domExisting) {
      entite[elKey] = domExisting;
      continue;
    }

    // Création
    const sizePx   = Math.round(base * (cfg.sizeR ?? 0.5)   * inv);
    const offsetPx = Math.round(base * (cfg.offsetR ?? 0.0) * inv);
    const ampPx    = Math.max(2, Math.round(base * (cfg.ampR ?? 0.05) * inv));

    const anim = document.createElement("div");
    anim.className = `life-aura-anim anim-${key}`;

    const wrap = document.createElement("div");
    wrap.className = `life-aura-wrap life-aura-wrap--${key}`;
    wrap.style.transform = `translate(-50%, -45%) translateY(${offsetPx}px)`;
    wrap.style.zIndex = String(cfg.z ?? 5);

    const img = document.createElement("img");
    img.className = `life-aura-img life-aura-img--${key}`;
    img.src = `${cfg.icon}?t=${performance.now()}`;
    img.style.width = `${sizePx}px`;
    img.style.height = `${sizePx}px`;
    img.style.setProperty("--amp", `${ampPx}px`);
    img.style.animationDuration = `${cfg.floatDur ?? 2000}ms`;

    wrap.appendChild(img);
    anim.appendChild(wrap);
    root.appendChild(anim);

    entite[elKey] = anim;
    dirtyOrder = true;
  }

  // Ré-ordonnancement : appendChild suffit (et évite contains)
  if (dirtyOrder) {
    for (const key of LIFE_AURA_ORDER) {
      const elKey = `_lifeAuraEl_${key}_${ctxKey}`;
      const node = entite[elKey];
      if (isEl(node)) root.appendChild(node);
    }
  }
}


// =========================
// ✅ FONCTION GÉNÉRALE UNIQUE
// =========================
export function syncEntityAuras(entite, sourceOrContainer = "battle") {
  if (!entite?.stats) return;

  const container = resolveAuraContainer(entite, sourceOrContainer);
  if (!container) return;

  const ctxKey = getAuraContextKey(container); // ✅ toujours container.id

  syncHypercognitionAura(entite, container, ctxKey);
  updateLifeAurasInContainer(entite, container, ctxKey);
}
