import { attackDetails } from '/js/attackList.js';
import { resetFullGame, loadFromLocalStorage, saveToLocalStorage, armyAConfig, getOrCreateGameID, loadCurrentGameData, saveCurrentGameData, setCurrentLevel, purgeStatPreview } from './GameStorage.js';
import { createSoundManager, createSoundControls } from '/js/soundManager.js';
import { selectRandomEntitiesForSideB } from './ArmyBFactory.js';
import { generateArmyA } from './ArmyAFactory.js';
import { createNicknameForm, updateNickname, createLevelUpForm, playerExperience, updateExperienceDisplay, LevelupSignal, getClassLabel,  getCycleForKey,  getCycleLenFor,  getArchetypeMilestones } from './UpgradeEntity.js';
import { attackEffects } from './attackEffects.js';
import { generateUniqueID, entitesNestUp, enrichEntityStats, calculatePhysicalPenPercent, calculateMagicalPenPercent, calculateHastePercent, calculateBloodFuryPercent, calculateEsoterismPercent, calculateTranscendenceExtraLife} from './entites.js';
import { AdminButtons } from './admin.js';
import { launchCurrentLevelFromStorage } from './newgame.js';
import { isEntiteAlive } from './game.js';
import { ItemDetails } from './itemList.js';
import { displayShopItems,  createItemDescription, removeItemDescription, DropFromCodexToInventory, DropInventorytoCodex, setupDragAndDropItem, DropEquipementtoInventory, DclicSlottoInventory, sanitizeItemId, getIngameItemById, equippedHoverDescription } from './itemManager.js';
import { glitterStuff } from './meteo.js';
import { stats } from './statsData.js';
import { createLifeBars, createLifeCounter, syncEntityAuras } from './createEntity.js';
import { toNumber, getSafe, calculateStatsDisplay, calculateStatGraphValue, calculateResistanceReductionPercent, calculateMagicalTotal, calculateHastePrepReduc, calculateHasteExecReduc, calculateHasteCDReduc, calculateHasteRecupReduc, calculateHasteProjectilSpeed, getEffectiveAttackTimings, calculateCritTotalChance, calculateCritDamageBonus, calculateAmbidextryTotalChance, calculateAmbidextryDamageBonus, calculateBloodFuryExecutionPercent, calculateBloodFuryExecChanceBonus, calculateExecutionDamage, calculateHypercognitionBonus, calculateRangeRatio, calculateTotalDodgeBonus, calculateResilienceCritTotalBonus, calculateResilienceTotalCancelBonus, calculateResilienceAlterationTotalBonus, caluclateIndestructibilityReductionTotal, calculateIndestructibilityPercentFromEntity, calculateAstralityTotal, calculateTranscendenceConsoProtectionTotal, calculateTotalRegenAmount, calculateRangeAccuracy, calculateBrokenSpellDamage, calculateBrokenSpellChance, totalMeleeExecReduction, totalPiercingRecupReductionWithAgi } from './damagesCalcul.js';
import { cyclesData } from './cycleData.js';
import { toRoman, isRegenKey, toNonNegInt, goldTitle } from './ui.js';
import { normArr } from './entityAttributs.js';

window.updateExperienceDisplay = updateExperienceDisplay;
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const CODEX_MENU_KEY = 'CodexMenuIndex';
const CODEX_SUBMENU_KEY = 'CodexSubmenuIndex';
// Map pour stocker les timers de suppression
const helperTimers = new Map();

function getCodexMenuIndex() {
  const v = loadFromLocalStorage(CODEX_MENU_KEY, 1);
  return Number.isInteger(v) && v >= 1 ? v : 1;
}
function setCodexMenuIndex(idx1) {
  if (!Number.isInteger(idx1) || idx1 < 1) idx1 = 1;
  saveToLocalStorage(CODEX_MENU_KEY, idx1);
}

function getCodexSubmenuIndex() {
  const v = loadFromLocalStorage(CODEX_SUBMENU_KEY, 1);
  return Number.isInteger(v) && v >= 1 ? v : 1;
}
function setCodexSubmenuIndex(idx1) {
  if (!Number.isInteger(idx1) || idx1 < 1) idx1 = 1;
  saveToLocalStorage(CODEX_SUBMENU_KEY, idx1);
}

// util: renvoie l'index 1-based de l'enfant actif selon un sélecteur
function activeIndex1Based(parent, itemSelector, activeClass='active') {
  const items = Array.from(parent.querySelectorAll(itemSelector));
  const i0 = items.findIndex(el => el.classList.contains(activeClass));
  return i0 >= 0 ? i0 + 1 : 1;
}


export function detectPageReload() {
    let isTrueReload = false;

    const navigation = performance.getEntriesByType('navigation')[0];

    // 🔄 Cas 1 : F5, Ctrl+R, bouton de rechargement
    if (navigation && navigation.type === 'reload') {
        isTrueReload = true;
    } else if (performance.navigation && performance.navigation.type === 1) {
        isTrueReload = true; // Fallback anciens navigateurs
    }

    // 🔄 Cas 2 : Nouvelle session = nouvel onglet ou après fermeture complète
    if (!sessionStorage.getItem('hasSession')) {
        isTrueReload = true;
        sessionStorage.setItem('hasSession', 'true');
    }

    // 🔄 Cas 3 : Changement d’URL
    const currentUrl = window.location.href;
    const storedUrl = sessionStorage.getItem('loadedUrl');

    if (storedUrl && storedUrl !== currentUrl) {
        console.log(`📍 URL changée :\n- Avant : ${storedUrl}\n- Maintenant : ${currentUrl}`);
        isTrueReload = true;
    }

    // 🧠 Mémorise toujours la dernière URL
    sessionStorage.setItem('loadedUrl', currentUrl);

    if (isTrueReload) {
        console.log('🔄 Détection : RELOAD / ONGLET FERMÉ / CHANGEMENT D’URL / NOUVEL ONGLET');
        // 🧹 Appel automatique de purgeStatPreview sur toutes les entités
        purgeStatPreview();
    } else {
        console.log('✅ Navigation fluide (SPA ou retour standard)');
    }

    return isTrueReload;
}

export function markPageLoaded() {
    sessionStorage.setItem('pageAlreadyLoaded', 'true');
}

export function createGameContainer() {
    // helper
    let gameHelper = document.createElement('div');
    gameHelper.className = 'Game-helper';
    document.body.appendChild(gameHelper);

    // Game windows
    let gameWindows = document.getElementById('game-windows');
    if (!gameWindows) {
        gameWindows = document.createElement('div');
        gameWindows.id = 'game-windows';
        document.body.appendChild(gameWindows);
    }

    // Game container
    let gameContainer = document.getElementById('game-container');
    if (!gameContainer) {
        gameContainer = document.createElement('div');
        gameContainer.id = 'game-container';
        gameWindows.appendChild(gameContainer);
    }

    // Worldmap
    const worldmap = document.createElement('img');
    worldmap.src = './media/worldmap.jpg';
    worldmap.classList.add('worldmap');
    gameContainer.appendChild(worldmap);
}

export function getOrCreateWorldMapID() {
    let worldMapID = localStorage.getItem('worldmap_id');

    // Si la worldmapID n’existe pas encore, on la génère
    if (!worldMapID) {
        worldMapID = generateUniqueID(); // générera un ID unique numérique
        localStorage.setItem('worldmap_id', worldMapID);
        console.log(`🗺️ Nouvelle worldmap_id générée : ${worldMapID}`);
    } else {
        console.log(`🗺️ worldmap_id existante : ${worldMapID}`);
    }

    // ✅ Correction ici : utiliser bien worldMapID (et pas worldmapID)
    if (!window.levelRunning || window.levelRunning === 'worldmap') {
        setCurrentLevel(worldMapID);
    }

    return parseInt(worldMapID, 10);
}

const currentGameID = getOrCreateGameID(); // Obligatoire au tout début
console.log(`Partie en cours trouvée : ${currentGameID}`);

// Charger les données de la partie
const currentGameData = loadCurrentGameData();
if (!currentGameData) {
    console.warn("Aucune donnée de partie trouvée, initialisation avec saveCurrentGameData()");
    saveCurrentGameData();
} else {
    console.log(`${currentGameID} chargée avec succès`);
}

// Initialisation et exposition des données globales
const gameUI = document.querySelector('.Game-UI');


export function GameUi() {
	
	const currentGameData = JSON.parse(localStorage.getItem('currentGameData')) || {};
	const playerExperience = currentGameData.experience || 0;
    const GameContainer = document.querySelector('#game-container');
    if (!GameContainer) {
        console.error("⚠️ Erreur : '#game-container' est introuvable !");
        return;
    }

    // Vérifier ou créer .Game-UI
    let GameUI = document.querySelector('.Game-UI');
    if (!GameUI) {
        GameUI = document.createElement('div');
        GameUI.className = 'Game-UI';
        GameContainer.appendChild(GameUI);
    }

    // Supprimer les anciens éléments pour éviter la duplication
    const oldScoringUI = GameUI.querySelector('.scoring-ui');
    if (oldScoringUI) oldScoringUI.remove();

    // Création du scoring
    const scoringUiDiv = document.createElement('div');
    scoringUiDiv.className = 'scoring-ui';
	
	const xpPic = document.createElement('div');
    xpPic.className = 'scoring-experience';

    const xpimg1 = document.createElement('img');
    xpimg1.src = '/media/assets/ui/experience-01.png';
    xpimg1.className = 'experience-01';

    const xpimg2 = document.createElement('img');
    xpimg2.src = '/media/assets/ui/experience-02.png';
    xpimg2.className = 'experience-02';

    const scoringDiv = document.createElement('div');
    scoringDiv.className = 'scoring';
    scoringDiv.id = 'score';
    scoringDiv.textContent = `Experience : ${playerExperience}`;

    xpPic.appendChild(xpimg1);
    xpPic.appendChild(xpimg2);
    scoringUiDiv.appendChild(xpPic);
    scoringUiDiv.appendChild(scoringDiv);
    GameUI.appendChild(scoringUiDiv);
	createDayCounter(GameUI);


    // ✅ Créer menu-player-icons si absent
    let menuIcons = GameUI.querySelector('.menu-player-icons');
    if (!menuIcons) {
        menuIcons = document.createElement('div');
        menuIcons.className = 'menu-player-icons';
        GameUI.appendChild(menuIcons);
    }

    // Ajout des icônes dans menuIcons
    if (!menuIcons.querySelector('.settings-icon')) {
        createSettingsMenu(menuIcons);
    }
    if (!menuIcons.querySelector('.shop-icon')) {
        MapShop(menuIcons);
    }
	if (!menuIcons.querySelector('.player-inventory-icon')) {
    PlayerInventory(menuIcons);
}
    if (!menuIcons.querySelector('.army-codex-icon')) {
        PlayerArmyCodex(menuIcons);
    }

    updateExperienceDisplay();
}


function createDayCounter(GameUI) {
    const currentDay = Number.parseInt(localStorage.getItem('gameDay'), 10) || 1;

    const dayCounter = document.createElement('div');
    dayCounter.className = 'day-counter';

    // si tu veux garder ton inline style de transition
    dayCounter.style.transition = 'opacity 0.8s, transform 0.8s';
    dayCounter.style.opacity = '1';
    dayCounter.style.transform = 'scale(1)';

    const daySigil = document.createElement('div');
    daySigil.className = 'day-sigil';

    const dayStack = document.createElement('div');
    dayStack.className = 'day-stack';

    const dayLabel = document.createElement('div');
    dayLabel.className = 'day-label';
    dayLabel.textContent = 'JOUR';

    const dayValue = document.createElement('div');
    dayValue.className = 'day-value';
    dayValue.textContent = String(currentDay);

    dayStack.appendChild(dayLabel);
    dayStack.appendChild(dayValue);

    dayCounter.appendChild(daySigil);
    dayCounter.appendChild(dayStack);

    GameUI.appendChild(dayCounter);
}

export function generateAttackDescription(attack, attacker) {

    const statsSource = attacker.stats ?? attacker.baseStats ?? {};

    // === Hypercognition pipeline ===
    const hyperco = Number(statsSource.hypercognition || 0);
    const hypercoBonus = hyperco > 0 ? calculateHypercognitionBonus(attacker) : 0;

    // === Nature pipeline UI ===
    let attackNatureClass = attack.attacknature?.[0] || 'neutral';

    // physical → hybridalDamage si hypercognition
    if (hyperco > 0 && attackNatureClass === "physicalDamage") {
        attackNatureClass = "hybridalDamage";
    }

    // === Bases ===
    let physicalBaseDamage = statsSource.physicalDamage || 0;
    let magicalBaseDamage = statsSource.magicalDamage || 0;

    // === Pipeline Hyperco : boost magique ===
    if (hyperco > 0) {
        magicalBaseDamage += hypercoBonus;
    }

    const totalpiercingDamage = statsSource.piercingDamage || 0;

    const physicalBonusDamage = attack.physicalRatio
        ? Math.ceil((statsSource.physicalDamage || 0) * attack.physicalRatio)
        : 0;

    const magicalBonusDamage = attack.magicalRatio
        ? Math.ceil((statsSource.magicalDamage || 0) * attack.magicalRatio)
        : 0;

    const totalPhysicalDamage = physicalBaseDamage + physicalBonusDamage;
    const totalMagicalDamage = magicalBaseDamage + magicalBonusDamage;

    const totalHybridalDamage = totalPhysicalDamage + totalMagicalDamage;
    const totalExecutionDamage = totalHybridalDamage + totalpiercingDamage;

    // === Effets secondaires ===
    const effectDot = attack.effectDot || 0;
    const effectMagicalRatio = attack.effectMagicalRatio || 0;
    const effectPhysicalRatio = attack.effectPhysicalRatio || 0;
    const effectDuration = attack.effectDuration || 0;

    // === Construction du bloc {$totalDamage} ===
    let totalDamage = '';

    // ---------------- PERCANTE ----------------
    if (attack.baseDamage) {
        totalDamage += `
            <div class="showdetails damage">
                <div class="picto-stat piercingDamage"></div>
                <span class="piercingDamage total-damage major">${totalpiercingDamage}</span>
            </div>
            <div class="detail total-damage simple">
                <span class="detail-damage-legend">Détails dégâts Bruts :</span>
                <span class="piercingDamage total-damage">${totalpiercingDamage}</span>
            </div>
        `;
    }


// ---------------- HYBRIDE ----------------
if (attackNatureClass === 'hybridalDamage') {

const physicalRatioText = attack.physicalRatio
  ? `<span class="physicalDamage">${Math.ceil(attack.physicalRatio * 100)}%</span> de la puissance physique (<span class="physicalDamage"> + <div class="minor-icon picto-stat physicalDamage "></div> ${physicalBonusDamage}</span>)`
  : '';

const magicalRatioText = attack.magicalRatio
  ? `<span class="magicalDamage">${Math.ceil(attack.magicalRatio * 100)}%</span> de la puissance magique ( <span class="magicalDamage">+ <div class="minor-icon picto-stat magicalDamage "></div>${magicalBonusDamage}</span>)`
  : '';


    totalDamage += `
    <div class="showdetails damage damage-block">
        <div class="picto-stat hybridalDamage"></div>
        <span class="hybridalDamage total-damage damage-total major">${totalHybridalDamage}</span>
    </div>

    <div class="detail total-damage damage-table">
        <span class="detail-damage-legend">Détail dégâts Hybrides :</span>

        <!-- PHYSIQUE -->
        <span class="detail-hybridalDamage damage-line">

            <div class="picto-stat physicalDamage major-icon"></div>
            <span class="physicalDamage total-damage damage-total">${totalPhysicalDamage}</span>

            <span class="ponctuation damage-ponctuation">:</span>

            <div class="minor-icon picto-stat physicalDamage "></div>
            <span class="physicalDamage power-damage damage-source">${statsSource.physicalDamage}</span>

            ${
                attack.physicalRatio
                ? `
                <span class="ponctuation damage-ponctuation">+</span>
                <span class="damage-ratio physicalDamage">
                    ${physicalRatioText}
                </span>`
                : ''
            }
        </span>

        <!-- Separator -->
        <span class="detail-hybridalDamage damage-line">+</span>

        <!-- MAGIQUE -->
        <span class="detail-hybridalDamage damage-line">

            <div class="picto-stat magicalDamage major-icon"></div>
            <span class="magicalDamage total-damage damage-total">${totalMagicalDamage}</span>

            <span class="ponctuation damage-ponctuation">:</span>

            <div class="magicalDamage power-damage damage-source">
                <div class="picto-stat magicalDamage minor-icon"></div>
                <span>${statsSource.magicalDamage}</span>
            </div>

            ${
                hyperco > 0
                ? `
                <span class="ponctuation damage-ponctuation">+</span>
                <span class="bonus hypercognition power-damage damage-bonus">
                    <div class="picto-stat hypercognition minor-icon"></div>
                    <span>${hypercoBonus}</span>
                </span>`
                : ''
            }

            ${
                attack.magicalRatio
                ? `
                <span class="ponctuation damage-ponctuation">+</span>
                <span class="bonus magicalDamage power-damage damage-bonus">
                    ${magicalRatioText}
                </span>`
                : ''
            }

        </span>
    </div>
    `;
}
    // ---------------- PHYSIQUE ----------------
else if (attackNatureClass === 'physicalDamage') {
    totalDamage += `
    <div class="showdetails damage damage-block">
        <div class="picto-stat physicalDamage"></div>
        <span class="physicalDamage total-damage major damage-total">
            ${totalPhysicalDamage + magicalBonusDamage}
        </span>
    </div>

    <div class="detail total-damage damage-table">
        <span class="detail-damage-legend">Détail dégâts Physiques :</span>

        <span class="physicalDamage power-damage damage-source">
            ${statsSource.physicalDamage}
        </span>

        ${
            attack.physicalRatio
                ? `<span class="bonus physicalDamage power-damage damage-bonus">
                        + ${Math.ceil(attack.physicalRatio * 100)}% (${physicalBonusDamage})
                   </span>`
                : ''
        }

        ${
            attack.magicalRatio
                ? `<span class="bonus magicalDamage power-damage damage-bonus">
                        + ${Math.ceil(attack.magicalRatio * 100)}% (${magicalBonusDamage})
                   </span>`
                : ''
        }
    </div>`;
}

    // ---------------- MAGIQUE (HYPERCO INSIDE) ----------------
else if (attackNatureClass === 'magicalDamage') {
    totalDamage += `
    <div class="showdetails damage damage-block">
        <div class="picto-stat magicalDamage"></div>
        <span class="magicalDamage total-damage major damage-total">
            ${totalMagicalDamage + physicalBonusDamage}
        </span>
    </div>

    <div class="detail total-damage damage-table">
        <span class="detail-damage-legend">Détail dégâts Magiques :</span>

        <span class="magicalDamage power-damage damage-source">
            ${statsSource.magicalDamage}
        </span>

        ${
            hyperco > 0
            ? `<span class="bonus hypercognition power-damage damage-bonus">
                    <div class="picto-stat hypercognition"></div>
                    +${hypercoBonus} Hypercognition
               </span>`
            : ''
        }

        ${
            attack.magicalRatio
                ? `<span class="bonus magicalDamage power-damage damage-bonus">
                    + ${Math.ceil(attack.magicalRatio * 100)}% (${magicalBonusDamage})
                   </span>`
                : ''
        }

        ${
            attack.physicalRatio
                ? `<span class="bonus physicalDamage power-damage damage-bonus">
                    + ${Math.ceil(attack.physicalRatio * 100)}% (${physicalBonusDamage})
                   </span>`
                : ''
        }
    </div>`;
}

    // ---------------- NEUTRALE ----------------
    else {
        totalDamage += `
        <div class="picto-stat neutral"></div>
        <span class="neutral total-damage">${totalHybridalDamage}</span>
        de dégâts neutres.
        `;
    }

    // Remplacement dynamique des tokens
    let dynamicDescription = attack.attackDescription;
    const replacements = {
        '{$totalDamage}': totalDamage,
        '{physicalDamage}': statsSource.physicalDamage || 0,
        '{magicalDamage}': statsSource.magicalDamage || 0,
        '{effectDot}': effectDot,
        '{effectDuration}': effectDuration,
        '{totalExecutionDamage}': totalExecutionDamage
    };

    for (const [key, value] of Object.entries(replacements)) {
        dynamicDescription = dynamicDescription.replaceAll(key, value);
    }

    // Éval des expressions [...]
    dynamicDescription = dynamicDescription.replace(/\[([^\]]+)\]/g, (_, expr) => {
        try {
            const result = Function('"use strict"; return (' + expr + ')')();
            return Math.round(result);
        } catch {
            return expr;
        }
    });

    return `
        <div class="attack-description">
            ${dynamicDescription}
        </div>
    `;
}


export function generateEffectDescription(effect, attacker, item) {
    const dotValue = Math.ceil(effect.effectDot || 0);

    const getTotalDamagesBlock = () => {
        if (!item) return '';

        const types = [
            { key: 'MagicDamage', className: 'magicalDamage' },
            { key: 'physicalDamage', className: 'physicalDamage' },
            { key: 'hybridalDamage', className: 'hybridalDamage' },
            { key: 'piercingDamage', className: 'piercingDamage' }
        ];

        const segments = types
            .filter(type => item[type.key] != null && item[type.key] > 0)
            .map(type => {
                return `<div class="picto-stat ${type.className}"></div><span class="${type.className} total-damage major">${item[type.key]}</span>`;
            });

        // 🔥 Ajout HealAmount si aucun dégât, ou en complément si souhaité
        if ((segments.length === 0) && item.HealAmount > 0) {
            segments.push(`<div class="picto-stat heal"></div><span class="heal total-damage major">${item.HealAmount}</span>`);
        }

        if (segments.length === 0) return '';
        return `<div class="showdetails damage">${segments.join(' + ')}</div>`;
    };

    const map = {
        '{MagicDamage}': item?.MagicDamage > 0 ? `
            <div class="showdetails damage">
                <div class="picto-stat magicalDamage"></div>
                <span class="magicalDamage total-damage major">${item.MagicDamage}</span>
            </div>
        ` : '',

        '{physicalDamage}': item?.physicalDamage > 0 ? `
            <div class="showdetails damage">
                <div class="picto-stat physicalDamage"></div>
                <span class="physicalDamage total-damage major">${item.physicalDamage}</span>
            </div>
        ` : '',

        '{piercingDamage}': item?.piercingDamage > 0 ? `
            <div class="showdetails damage">
                <div class="picto-stat piercingDamage"></div>
                <span class="piercingDamage total-damage major">${item.piercingDamage}</span>
            </div>
        ` : '',

        '{hybridalDamage}': item?.hybridalDamage > 0 ? `
            <div class="showdetails damage">
                <div class="picto-stat hybridalDamage"></div>
                <span class="hybridalDamage total-damage major">${item.hybridalDamage}</span>
            </div>
        ` : '',

        '{HealAmount}': item?.HealAmount > 0 ? `
            <div class="showdetails damage">
                <div class="picto-stat healing"></div>
                <span class="healing total-damage major">${item.HealAmount}</span>
            </div>
        ` : '',

        '{TotalDamages}': getTotalDamagesBlock(),

        '{effectDot}': dotValue > 0 ? `<span class="dot power-damage">${dotValue}</span>` : '',
        '{effectDuration}': effect.effectDuration ? `<span class="duration power-damage">${effect.effectDuration}</span>` : '',
        '{effectStack}': effect.effectStack ? `<span class="stack power-damage">${effect.effectStack}</span>` : '',

        '{effectDotResult}': dotValue > 0 ? `
            <span class="dot total-damage major">
                <div class="picto-stat dot"></div>${dotValue}
            </span>` : ''
    };

    let description = effect.effectDescription;
    for (const key in map) {
        description = description.replaceAll(key, map[key]);
    }

    return `
        <div class="effect-description">
            ${description}
        </div>
    `;
}

const updateNicknameInBrowser = (id, nickname) => {
    // Trouver l'entité dans selectedArmyA
    const entity = selectedArmyA.find(ent => ent.id === id);
    if (entity) {
        // Mettre à jour uniquement le nickname
        entity.nickname = nickname;
        console.log(`Surnom mis à jour : ${entity.name} est maintenant "${entity.nickname}"`, entity);

        // Sauvegarder selectedArmyA directement dans le localStorage
        saveToLocalStorage('selectedArmyA', selectedArmyA);

        console.log('Nickname mis à jour et sauvegardé dans le localStorage.');
    } else {
        console.warn(`Aucune entité trouvée avec l'ID ${id}.`);
    }
};

// Rendre la fonction disponible dans la console
window.updateNicknameInBrowser = updateNicknameInBrowser;
const loadedArmyA = loadFromLocalStorage('selectedArmyA', []);
window.selectedArmyA = loadedArmyA; // Expose la version chargée globalement
console.log('selectedArmyA rechargé depuis le localStorage :', selectedArmyA);
export const helperEntityByRoot = new WeakMap();

export function bindHelperEntity(rootEl, entity) {
  if (rootEl instanceof Element && entity) {
    helperEntityByRoot.set(rootEl, entity);
  }
}

export function getBoundHelperEntity(fromEl) {
  if (!(fromEl instanceof Element)) return null;

  // Le helper est déclenché depuis des éléments internes,
  // on remonte au root du bloc d’attaque
  const root = fromEl.closest(".attack-details");
  if (!root) return null;

  return helperEntityByRoot.get(root) || null;
}
export function AttackDetailInfos(attack, entity, fromMulti = false) {
  if (!attack) return document.createElement("div");

  // ✅ Normalisations (évite les crash .join / .includes)
  const attackTargets = normArr(attack?.attackTarget);     // ["ally"|"enemy"|"hexa"...]
  const displayName = attack?.displayName || "Inconnu";
  const deadTargetInfo = normArr(attack?.deadTarget).includes("yes") ? " mort" : "";

  let attackDetailinfos = "Inconnu";
  if (attackTargets.includes("ally")) attackDetailinfos = "Allié";
  else if (attackTargets.includes("enemy")) attackDetailinfos = "Ennemi";
  else if (attackTargets.includes("hexa")) attackDetailinfos = "Case";

  const attackDetailsDiv = document.createElement("div");
  attackDetailsDiv.className = `attack-details ${attackTargets.join(" ")}`.trim();

  bindHelperEntity(attackDetailsDiv, entity);

  // Titre (hors multi)
  if (!fromMulti) {
    const attackTitleName = document.createElement("div");
    attackTitleName.className = "attack-loot-name";
    attackTitleName.textContent = `${displayName}`;
    attackDetailsDiv.appendChild(attackTitleName);
  }

  // Image attaque
  const attackImageContainer = document.createElement("div");
  attackImageContainer.className = "attack-image-container";

  const attackImgComplete = document.createElement("div");
  attackImgComplete.className = "attack-img-complete";

  const attackImg = document.createElement("img");
  attackImg.src = attack.attackAsset;
  attackImg.className = `attackElement-asset-spell ${attackTargets.join(" ")}`.trim();
  attackImg.classList.add("attack-image");

  const pictoTarget = document.createElement("div");
  pictoTarget.className = `picto-target-attack-detail ${attackTargets.join(" ")}`.trim();

  attackImgComplete.appendChild(attackImg);
  attackImgComplete.appendChild(pictoTarget);
  attackImageContainer.appendChild(attackImgComplete);

  const attackDetailsColumn = document.createElement("div");
  attackDetailsColumn.className = "attack-details-colomne";

  const attackMoreDetails = document.createElement("div");
  attackMoreDetails.className = "attack-more-details";

  // ===========================================================
  // 🟪 PIPELINE HYPERCOGNITION (affichage UI)
  // ===========================================================
  const hypercoValue = Number(entity?.stats?.hypercognition || 0);

  // Copie locale de la nature réelle (array)
  let displayNature = normArr(attack?.attacknature);

  // Si hyperco > 0 → Physique devient Hybride
  if (hypercoValue > 0 && displayNature.includes("physicalDamage")) {
    console.log("⚡ Hypercognition détectée → affichage HYBRIDE");
    displayNature = ["hybridalDamage"];
  }

  // ===========================================================
  // 🟫 TYPE D'ATTAQUE
  // ===========================================================
  const attackTypeDiv = document.createElement("div");
  attackTypeDiv.className = "ciblage-attack-detail-infos";

  // ✅ NEW RULE : perçante = stat piercingDamage de l'entité (plus de baseDamage)
  const rawStat = Math.max(0, +entity?.stats?.piercingDamage || 0);
  const isPiercing = rawStat > 0;

  let parts = [];

  if (displayNature.includes("physicalDamage")) {
    parts.push(`
      <div class="attack-nature" data-stat="physicalDamage" data-hover="true">
        <div class="picto-stat physicalDamage"></div>
        <div class="physicalDamage">Physique</div>
      </div>
    `);
  } else if (displayNature.includes("magicalDamage")) {
    parts.push(`
      <div class="attack-nature" data-stat="magicalDamage" data-hover="true">
        <div class="picto-stat magicalDamage"></div>
        <div class="magicalDamage">Magique</div>
      </div>
    `);
  } else if (displayNature.includes("hybridalDamage")) {
    parts.push(`
      <div class="attack-nature" data-stat="hybridalDamage" data-hover="true">
        <div class="picto-stat hybridalDamage"></div>
        <div class="hybridalDamage">Hybride</div>
      </div>
    `);
  }

  // Piercing
  if (isPiercing) {
    if (parts.length > 0) parts.push(`<span class="et-separator"> et </span>`);
    parts.push(`
      <div class="attack-nature" data-stat="piercingDamage" data-hover="true">
        <div class="picto-stat piercingDamage"></div>
        <div class="piercingDamage">Perçante</div>
      </div>
    `);
  }

  // Default
  if (parts.length === 0) {
    parts.push(`
      <div class="picto-stat unknownDamage"></div>
      <div class="unknownDamage">Inconnue</div>
    `);
  }

  attackTypeDiv.innerHTML = `
    <div class="attack-type-container">
      <span class="attack-info-type">Type d'attaque :</span>
      ${parts.join("")}
    </div>
  `;

  // ===========================================================
  // PORTÉE
  // ===========================================================
 const rangeDiv = attackNatureRange(attack, displayNature, entity);

  // ===========================================================
  // CIBLAGE
  // ===========================================================
  const targetingInfoDiv = document.createElement("div");
  targetingInfoDiv.className = "ciblage-attack-detail-infos";
  targetingInfoDiv.innerHTML = `Ciblage : <strong>${attackDetailinfos}${deadTargetInfo}</strong>`;

  if (fromMulti) {
    const attackTitleClone = document.createElement("div");
    attackTitleClone.className = "attack-loot-name";
    attackTitleClone.textContent = `${displayName}`;
    attackMoreDetails.appendChild(attackTitleClone);
  }

  // Description dynamique
  const dynamicDescription = generateAttackDescription(attack, entity);
  const attackDescriptionParagraph = document.createElement("p");
  attackDescriptionParagraph.innerHTML = dynamicDescription;

  // Ajout au DOM
  attackMoreDetails.appendChild(attackTypeDiv);
  attackMoreDetails.appendChild(rangeDiv);
  attackMoreDetails.appendChild(targetingInfoDiv);
  attackMoreDetails.appendChild(attackDescriptionParagraph);

  // ===========================================================
  // TIMINGS (valeurs effectives selon l'entité)
  // ===========================================================
  const attackMoreDetailsReveal = document.createElement("div");
  attackMoreDetailsReveal.className = "attack-more-details-reveal";

  const timingsPicto = document.createElement("div");
  timingsPicto.className = "attack-timings-picto";

  const cooldownDiv = document.createElement("div");
  cooldownDiv.className = "timers-detail";

  const preparationTimeDiv = document.createElement("div");
  preparationTimeDiv.className = "timers-detail";

  const executionTimeDiv = document.createElement("div");
  executionTimeDiv.className = "timers-detail";

  const recoveryTimeDiv = document.createElement("div");
  recoveryTimeDiv.className = "timers-detail";

  // Calcul timings effectifs
  const timings = getEffectiveAttackTimings(attack, entity);
  const fmt = (ms) => `${((Number(ms) || 0) / 1000).toFixed(2)}s`;

  cooldownDiv.innerHTML = `Cooldown :<br/>${fmt(timings.effective.cooldown)}
    <span class="timing-base">(${fmt(timings.base.cooldown)})</span>`;

  preparationTimeDiv.innerHTML = `Préparation :<br/>${fmt(timings.effective.preparationTime)}
    <span class="timing-base">(${fmt(timings.base.preparationTime)})</span>`;

  // ✅ Execution : range = projectile
  const attackRangeArr = normArr(attack?.attackRange);
  if (attackRangeArr.includes("range") || attackRangeArr.includes("ranged") || attackRangeArr.includes("distance")) {
    executionTimeDiv.innerHTML = `
      Vitesse projectile :<br/>${fmt(timings.effective.executionTime)}
      <span class="timing-base">(${fmt(timings.base.executionTime)})</span>
    `;
  } else {
    executionTimeDiv.innerHTML = `Exécution :<br/>${fmt(timings.effective.executionTime)}
      <span class="timing-base">(${fmt(timings.base.executionTime)})</span>`;
  }

  recoveryTimeDiv.innerHTML = `Récupération :<br/>${fmt(timings.effective.recoveryTime)}
    <span class="timing-base">(${fmt(timings.base.recoveryTime)})</span>`;

  // Append timings
  attackMoreDetailsReveal.appendChild(timingsPicto);
  attackMoreDetailsReveal.appendChild(cooldownDiv);
  attackMoreDetailsReveal.appendChild(preparationTimeDiv);
  attackMoreDetailsReveal.appendChild(executionTimeDiv);
  attackMoreDetailsReveal.appendChild(recoveryTimeDiv);

  // Layout multi vs normal
  if (fromMulti) {
    attackMoreDetails.prepend(attackImageContainer); // image au-dessus des infos
  } else {
    attackDetailsColumn.appendChild(attackImageContainer);
  }

  attackDetailsColumn.appendChild(attackMoreDetails);

  attackDetailsDiv.appendChild(attackDetailsColumn);
  attackDetailsDiv.appendChild(attackMoreDetailsReveal);

  return attackDetailsDiv;
}

export function attackNatureRange(attack, displayNature = [], entity = null) {
  const toArr = (v) => (Array.isArray(v) ? v.filter(Boolean) : v ? [v] : []);

  const natures = toArr(displayNature);

  // ✅ Détection nature de base (hors piercing)
  const hasPhysical = natures.includes("physicalDamage");
  const hasMagical  = natures.includes("magicalDamage");
  const hasHybridal = natures.includes("hybridalDamage");
  const hasBaseNature = hasPhysical || hasMagical || hasHybridal;

  // Nature -> suffix pour data-stat
  let natureSuffix = "Unknown";
  if (hasPhysical) natureSuffix = "Physical";
  else if (hasMagical) natureSuffix = "Magical";
  else if (hasHybridal) natureSuffix = "Hybridal";

  // Nature -> classe profil (sur .attack-range)
  let natureClass = "unknown";
  if (natureSuffix === "Physical") natureClass = "physical";
  else if (natureSuffix === "Magical") natureClass = "magical";
  else if (natureSuffix === "Hybridal") natureClass = "hybridal";

  // ✅ Piercing = stat de l'entité
  const piercingStat = Math.max(0, +entity?.stats?.piercingDamage || 0);
  const hasPiercing = piercingStat > 0;

  // Portée -> clé (normalisée)
  const rangeArr = toArr(attack?.attackRange);

  let rangeLabel = "—";
  let rangeKey = ""; // meleeAttack | rangeAttack

  if (rangeArr.includes("melee")) {
    rangeLabel = "Corps à corps";
    rangeKey = "meleeAttack";
  } else if (rangeArr.includes("range") || rangeArr.includes("ranged") || rangeArr.includes("distance")) {
    rangeLabel = "Distance";
    rangeKey = "rangeAttack";
  }

  // ✅ CAS 1 : piercing seul → data-stat = meleeAttackPiercing / rangeAttackPiercing
  const isOnlyPiercing = hasPiercing && !hasBaseNature;

  let dataStat = `${rangeKey}${natureSuffix}`; // ex: meleeAttackHybridal
  let addStat = "";                            // ex: meleeAttackPiercing (additif)
  let extraLabelHtml = "";                     // "perçante"
  let extraClass = "";                         // class "piercing"

  if (isOnlyPiercing) {
    dataStat = `${rangeKey}Piercing`;
    natureClass = "piercing"; // optionnel mais utile pour le CSS/tooltip
  } else if (hasPiercing && hasBaseNature) {
    // ✅ CAS 2 : piercing + nature → additif
    addStat = `${rangeKey}Piercing`;
    extraClass = "piercing";
    extraLabelHtml = ` <span class="attack-range-addon">perçante</span>`;
  }

  const rangeWrapperClass = ["attack-range", natureClass, extraClass]
    .filter(Boolean)
    .join(" ");

  const rangeDiv = document.createElement("div");
  rangeDiv.className = "ciblage-attack-detail-infos";

  // ✅ data-addstat = lisible par tes fonctions pour additionner les effets piercing
  rangeDiv.innerHTML = `
    Portée :
    <div class="${rangeWrapperClass}"
         data-hover="true"
         data-stat="${dataStat}"
         ${addStat ? `data-addstat="${addStat}"` : ""}>
      <div class="picto-stat ${rangeKey}" data-stat="${dataStat}"></div>
      <span class="attack-range-type ${rangeKey}">${rangeLabel}</span>${extraLabelHtml}
    </div>
  `;

  return rangeDiv;
}

export function MultiAttackDisplay(entite) {
    if (!entite.attacks || entite.attacks.length <= 1) return document.createElement('div');

    const wrapper = document.createElement('div');
    wrapper.className = 'entite-attack-container multi-attacks';

    const topBlock = document.createElement('div');
    topBlock.className = 'attack-details-multi multi-attacks';

    const bottomBlock = document.createElement('div');
    bottomBlock.className = 'attack-imgs multi-attacks';

    // On garde une référence vers toutes les images pour les gérer facilement
    const imgRefs = [];

    entite.attacks.forEach((attackName, index) => {
        const attack = attackDetails.find(a => a.functionName === attackName);
        if (!attack) return;

        const attackImageContainer = document.createElement('div');
        attackImageContainer.className = 'attack-image-container';

        const attackLabel = document.createElement('div');
        attackLabel.className = 'attack-loot-name';
        attackLabel.textContent = attack.displayName;

        const attackImgComplete = document.createElement('div');
        attackImgComplete.className = 'attack-img-complete';

        const img = document.createElement('img');
        img.src = attack.attackAsset || '/media/assets/spells/auto-attack-spell-art.jpg';
        img.className = `attackElement-asset-spell ${attack.attackTarget.join(' ')} attack-image`;
        img.alt = attack.displayName;

        const pictoTarget = document.createElement('div');
        pictoTarget.className = `picto-target-attack-detail ${attack.attackTarget.join(' ')}`;

        // Gestion du focus au clic
        img.addEventListener('click', () => {
            // Nettoyer le topBlock
            topBlock.innerHTML = '';

            // Enlever le focus de toutes les images
            imgRefs.forEach(imgEl => imgEl.classList.remove('focus'));

            // Ajouter la classe focus à l'image cliquée
            img.classList.add('focus');

            // Ajouter la nouvelle description avec la classe focus
            const detail = AttackDetailInfos(attack, entite, true);
            detail.classList.add('focus');
            topBlock.appendChild(detail);
        });

        // Focus par défaut sur la première attaque
        if (index === 0) {
            const detail = AttackDetailInfos(attack, entite, true);
            detail.classList.add('focus');
            topBlock.appendChild(detail);
            img.classList.add('focus');
        }

        attackImgComplete.appendChild(img);
        attackImgComplete.appendChild(pictoTarget);

        attackImageContainer.appendChild(attackImgComplete);
        attackImageContainer.appendChild(attackLabel);

        bottomBlock.appendChild(attackImageContainer);

        imgRefs.push(img); // on stocke la référence
    });

    wrapper.appendChild(topBlock);
    wrapper.appendChild(bottomBlock);

    return wrapper;
}


const statsByKey = Object.fromEntries(stats.map(s => [s.key, s]));

function normalizeLabel(str) {
  return String(str)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // enlève accents
    .replace(/\s+/g, " ")
    .trim();
}

function findStatKeyFromLabel(label) {
  const target = normalizeLabel(label);
  const match = stats.find(s => normalizeLabel(s.name) === target);
  return match?.key || null;
}

// Transforme "utilitaire-2" => { category:"utilitaire", level:2 }
function umbraDetection(statKey) {
  const def = statsByKey[statKey];
  if (!def) return null;
  if (!def.attribut) return null;          // pas d'umbra pour "special"
  if (!def.type || !def.type.includes("-")) return null;

  const [category, lvlStr] = def.type.split("-");
  const level = parseInt(lvlStr, 10);

  if (!category || !Number.isFinite(level)) return null;

  return {
    attribut: def.attribut,   // "force" | "intelligence" | "agilite"
    category,                 // "attaque" | "defense" | "utilitaire"
    level                     // 1..3
  };
}

function umbraCreation({ attribut, category, level }, filled = true) {
  const milestone = document.createElement("div");
  milestone.className = `milestone ${category} lvl-${level} ${filled ? "filled" : ""} ${attribut}`.trim();

  const gemme = document.createElement("div");
  gemme.className = `gemme ${attribut}`;

  milestone.appendChild(gemme);
  return milestone;
}


export function createUmbraBlock(
  parentDiv,
  statName,
  statValueCallback,
  entite,
  forcedStatKey = null,
  inlineStatName = false,
  attribut = null,
  umbra = null // ✅ NEW (optionnel)
) {
  // ✅ Overload: si le 5e param est un bool => c'est le flag umbra, pas forcedStatKey
  const umbraEnabled =
    typeof forcedStatKey === "boolean" ? forcedStatKey : Boolean(umbra);
  if (typeof forcedStatKey === "boolean") forcedStatKey = null;

  const statValue = statValueCallback();
  let statKey = "stat";
  const fnString = statValueCallback.toString();

  // === Détection du bon statKey ===
  if (forcedStatKey) {
    statKey = forcedStatKey;
  } else if (
    fnString.includes("entite.stats.physicalDamage") &&
    fnString.includes("entite.stats.magicalDamage")
  ) {
    statKey = "hybridalDamage";
  } else if (
    fnString.includes("entite.stats.HP.current") &&
    fnString.includes("entite.stats.HP.max")
  ) {
    statKey = "HP";
  } else if (fnString.includes("entite.stats.speed")) {
    statKey = "speed";
  } else {
    const match = fnString.match(/\.stats\??\.([a-zA-Z0-9_]+)/);
    if (match) statKey = match[1];
  }

  // === Helpers ===
  const isObjStatValue = (v) =>
    v && typeof v === "object" && ("current" in v || "max" in v);

  const isZeroValue = (v) => {
    if (isObjStatValue(v)) {
      const c = Number(v.current ?? 0);
      const m = Number(v.max ?? 0);
      return c <= 0 && m <= 0;
    }
    const n = Number(v);
    return v == null || Number.isNaN(n) ? true : n <= 0;
  };

  // === Filtrage ===
  const isForced = Boolean(forcedStatKey);
  const isZeroStat = isZeroValue(statValue);

  if (!isForced && isZeroStat && statKey !== "HP" && statKey !== "extraLife") {
    return;
  }

  // ✅ Calcul et helper text
  const computed = calculateStatsDisplay(statKey, entite, statValue);

  // ✅ Règle : dans le codex/menus, HP & armor = affichage MAX-only
  const isMaxOnlyStat = statKey === "HP" || statKey === "armor";

  let displayValue = isMaxOnlyStat
    ? isObjStatValue(statValue)
      ? String(Number(statValue.max ?? 0))
      : String(statValue ?? 0)
    : computed.displayValue;

  // ✅ FORCAGE AFFICHAGE SPEED (ms -> s)
  if (statKey === "speed") {
    const ms = Number(statValue ?? 0);
    const safe = Number.isFinite(ms) ? ms : 0;
    displayValue = `${(safe / 1000).toFixed(2)} s`;
  }

  // ✅ Opt-in hover helper (absent => false)
  const enableHover = (el) => {
    if (el) el.dataset.hover = "true"; // ou el.setAttribute("data-hover","true")
  };

  // === DOM ===
  const statDiv = document.createElement("div");
  statDiv.className = `${statKey}-stat stat-container`;
  statDiv.dataset.stat = statKey;
  enableHover(statDiv); // ✅ IMPORTANT

  if (entite && entite.id) statDiv.dataset.entityId = entite.id;
  statDiv.dataset.helperText = computed.helpContent;

  const pictoContainer = document.createElement("div");
  pictoContainer.className = `stat-picto-valeur ${statKey}`;

  const picto = document.createElement("div");
  picto.className = `picto-stat ${statKey}`;
  if (["strength", "agility", "intelligence"].includes(statKey)) {
    picto.classList.add("attribut");
  }

  // (optionnel) si tu veux que le hover marche DIRECTEMENT sur l’icône :
  // picto.dataset.stat = statKey;
  // enableHover(picto);
  // if (entite && entite.id) picto.dataset.entityId = entite.id;

  const valueDiv = document.createElement("div");
  valueDiv.dataset.stat = statKey;
  enableHover(valueDiv); // ✅ IMPORTANT
  if (entite && entite.id) valueDiv.dataset.entityId = entite.id;

  // 🔒 Flag crucial : permet à updateHealthBar() de NE PAS écraser ce bloc
  if (isMaxOnlyStat) valueDiv.dataset.display = "max";

  if (isForced && isZeroStat) {
    valueDiv.className = "entite-stat stat-new new-stat";
    valueDiv.textContent = "";
  } else {
    valueDiv.className = "entite-stat";
    valueDiv.textContent = displayValue;
  }

  // === Preview (toujours créée)
  const valueDivPreview = document.createElement("div");
  valueDivPreview.className = "entite-stat preview is-hidden";
  valueDivPreview.textContent = displayValue;
  valueDivPreview.dataset.stat = statKey;
  enableHover(valueDivPreview); // ✅ IMPORTANT
  if (entite && entite.id) valueDivPreview.dataset.entityId = entite.id;

  if (statKey === "speed") {
    const ms = Number(statValue ?? 0);
    const rawMs = String(Number.isFinite(ms) ? ms : 0);
    valueDiv.dataset.rawMs = rawMs;
    valueDivPreview.dataset.rawMs = rawMs;
  }
  if (isMaxOnlyStat) valueDivPreview.dataset.display = "max";

  const separatorDivPreview = document.createElement("div");
  separatorDivPreview.className = "separator-stats-preview";
  separatorDivPreview.textContent = ">";

  // ✅ Helper milestone wrapper
  const appendUmbraMilestone = (targetEl) => {
    if (!umbraEnabled) return;
    if (typeof umbraDetection !== "function") return;
    if (typeof umbraCreation !== "function") return;

    const profile = umbraDetection(statKey);
    if (!profile) return;

    const wrap = document.createElement("div");
    wrap.className = "umbra-milestone";
    wrap.appendChild(umbraCreation(profile));

    targetEl.appendChild(wrap);
  };

  // === Gestion spéciale des attributs ===
  if (attribut) {
    const attributPicto = document.createElement("div");
    attributPicto.className = "attribut-picto";

    // ✅ milestone (wrappé) AVANT le picto
    appendUmbraMilestone(attributPicto);

    attributPicto.appendChild(picto);

    const nameDiv = document.createElement("div");
    nameDiv.className = "stat-name";
    nameDiv.textContent = statName;

    const valueGroup = document.createElement("div");
    valueGroup.className = "attribut-value-group";
    valueGroup.appendChild(valueDiv);
    valueGroup.appendChild(separatorDivPreview);
    valueGroup.appendChild(valueDivPreview);

    pictoContainer.appendChild(nameDiv);
    pictoContainer.appendChild(valueGroup);
    statDiv.appendChild(attributPicto);
    statDiv.appendChild(pictoContainer);

    parentDiv.appendChild(statDiv);
    return;
  }

  // === Présentation standard ===
  // ✅ milestone (wrappé) AVANT le picto
  appendUmbraMilestone(pictoContainer);

  pictoContainer.appendChild(picto);

  if (!inlineStatName && statName && statName.trim()) {
    const nameDiv = document.createElement("div");
    nameDiv.className = "stat-name";
    nameDiv.textContent = statName;
    pictoContainer.appendChild(nameDiv);
  }

  pictoContainer.appendChild(valueDiv);
  pictoContainer.appendChild(separatorDivPreview);
  pictoContainer.appendChild(valueDivPreview);

  statDiv.appendChild(pictoContainer);
  parentDiv.appendChild(statDiv);
}

// 1) Délimitation: on prend #game-windows si présent (idéal si ta “fenêtre” fait 1536x676)
//    sinon fallback sur une fenêtre 1536x676 à partir du scroll.
function getGameBoundsRect() {
  const boundsEl = document.getElementById("game-windows"); // ou "game-container" si c’est ça ta fenêtre
  if (boundsEl) {
    const r = boundsEl.getBoundingClientRect();
    return {
      left: r.left + window.scrollX,
      top: r.top + window.scrollY,
      right: r.right + window.scrollX,
      bottom: r.bottom + window.scrollY,
    };
  }

  // Fallback demandé (1536x676)
  const left = window.scrollX;
  const top = window.scrollY;
  return { left, top, right: left + 1536, bottom: top + 676 };
}

// 2) Positionne le helper pour qu’il reste entièrement dans la “fenêtre”
function placeHelperInBounds(helperEl, anchorEl, { offset = 5, margin = 8 } = {}) {
  const bounds = getGameBoundsRect();
  const anchor = anchorEl.getBoundingClientRect();

  // Position “naturelle” (en dessous, aligné à gauche)
  let top = anchor.bottom + window.scrollY + offset;
  let left = anchor.left + window.scrollX;

  // Empêche un helper trop large de forcer un overflow horizontal
  const boundsWidth = (bounds.right - bounds.left);
  helperEl.style.maxWidth = `${Math.max(50, boundsWidth - margin * 2)}px`;
  helperEl.style.whiteSpace = "normal";

  // Mesure après insertion dans le DOM
  const hRect = helperEl.getBoundingClientRect();
  const helperW = hRect.width;
  const helperH = hRect.height;

  // Si ça déborde en bas, on tente au-dessus (si ça rentre)
  const wouldOverflowBottom = (top + helperH) > (bounds.bottom - margin);
  const aboveTop = anchor.top + window.scrollY - helperH - offset;
  const canPlaceAbove = aboveTop >= (bounds.top + margin);
  if (wouldOverflowBottom && canPlaceAbove) {
    top = aboveTop;
  }

  // Clamp horizontal
  const minLeft = bounds.left + margin;
  const maxLeft = bounds.right - margin - helperW;
  left = Math.min(Math.max(left, minLeft), maxLeft);

  // Clamp vertical
  const minTop = bounds.top + margin;
  const maxTop = bounds.bottom - margin - helperH;
  top = Math.min(Math.max(top, minTop), maxTop);

  helperEl.style.top = `${top}px`;
  helperEl.style.left = `${left}px`;
}

const HELPER_GLOBAL_ENTITY_ID = "__global__";

// Host = élément qui déclenche le hover (stat-container prioritaire, sinon [data-stat])
function getStatHost(target) {
  if (!(target instanceof Element)) return null;
  return target.closest(".stat-container") || target.closest("[data-stat]");
}

// entityId : priorité au host, puis ancestor, puis globals, sinon "__global__"
function resolveEntityId(host) {
  const id =
    host?.dataset?.entityId ||
    host?.closest?.("[data-entity-id]")?.dataset?.entityId ||
    window.focusedEntity?.id ||
    window.selectedEntity?.id ||
    window.currentEntity?.id ||
    HELPER_GLOBAL_ENTITY_ID;

  return String(id);
}

function findEntityById(army, entityId) {
  if (!Array.isArray(army) || !entityId || entityId === HELPER_GLOBAL_ENTITY_ID) return null;

  // Compare robuste string/string (et compat si un côté est number)
  return (
    army.find(ent => String(ent?.id) === String(entityId)) ||
    army.find(ent => String(ent?.id) === String(Number(entityId)))
  );
}


// ---------------------------
// 2) Cache localStorage (optionnel mais conseillé)
// ---------------------------
const ArmyACache = (() => {
  let raw = null;
  let parsed = [];
  return {
    get() {
      const next = localStorage.getItem("selectedArmyA") || "[]";
      if (next !== raw) {
        raw = next;
        try { parsed = JSON.parse(next) || []; } catch { parsed = []; }
      }
      return parsed;
    },
    invalidate() { raw = null; },
  };
})();

// ---------------------------
// 3) Utilitaires
// ---------------------------
const cssEscape = (s) => {
  // CSS.escape n'est pas dispo partout
  if (window.CSS && typeof CSS.escape === "function") return CSS.escape(String(s));
  return String(s).replace(/["\\]/g, "\\$&");
};

// UID stable par root DOM (quand pas d'entityId)
let __helperRootCounter = 0;
function getOrCreateRootUid(rootEl) {
  if (!(rootEl instanceof Element)) return "no-root";
  if (!rootEl.dataset.helperRootUid) {
    __helperRootCounter += 1;
    rootEl.dataset.helperRootUid = `root-${__helperRootCounter}`;
  }
  return rootEl.dataset.helperRootUid;
}

// Valeur de stat : support des paths via getSafe (ton système)
function getStatValue(entity, statKey) {
  if (!entity) return null;
  return getSafe(entity, statKey, null);
}

// =====================================================
// ✅ Handler mouseover
// =====================================================
document.addEventListener("mouseover", (e) => {
  if (!(e.target instanceof Element)) return;

  // Ignore le tooltip lui-même (évite boucle)
  if (e.target.closest(".stat-hover")) return;

  // Récupère le host survolé
  const host = getStatHost(e.target);
  if (!host) return;
// ✅ garde-fou : opt-in obligatoire
if (!isHelperHoverEnabled(host)) return;
  const statKey = String(host.dataset.stat || "").trim();
  if (!statKey) return;

  // Root du bloc (utile pour entity binding + UID stable)
  const rootAttack = host.closest(".attack-details");
  const rootUid = rootAttack ? getOrCreateRootUid(rootAttack) : "no-attack-root";

  // 1) Entité : d'abord via binding DOM (AttackDetailInfos), sinon via localStorage (armée A)
  let entity = getBoundHelperEntity(host);

  // entityId : si tu as un id réel, sinon rootUid
  let entityId = "";

  // Si l'entité est bindée, tente de prendre un id stable si dispo
  if (entity) {
    entityId =
      String(
        entity?.id ??
        entity?.uniqueId ??
        entity?.entityId ??
        entity?.serial ??
        ""
      );
  }

  // Fallback localStorage si pas d'entité bindée
  if (!entity) {
    const lsEntityId = resolveEntityId(host); // ta logique existante (armée A)
    if (lsEntityId != null) {
      entityId = String(lsEntityId);
      const armyA = ArmyACache.get();
      entity = findEntityById(armyA, entityId) || null;
    }
  }

  // Si toujours pas d'entityId, on utilise rootUid pour éviter collisions
  const entityUid = entityId || rootUid;

  const helperId = `${statKey}-${entityUid}`;

  // Timers: si on revient dessus, on annule la fermeture
  if (helperTimers && helperTimers.has(helperId)) {
    clearTimeout(helperTimers.get(helperId));
    helperTimers.delete(helperId);
  }

  // Évite doublon (même stat + même entityUid)
  const sel = `.stat-hover[data-stat="${cssEscape(statKey)}"][data-entity-uid="${cssEscape(entityUid)}"]`;
  if (document.querySelector(sel)) return;

  // Valeur de stat (optionnelle)
  const statValue = getStatValue(entity, statKey);

  // Texte helper (calculateStatsDisplay doit contenir helpContent[statKey])
  const calculated = calculateStatsDisplay(statKey, entity || null, statValue);
  const helperHTML =
    calculated?.helpContent || "Aucune aide disponible pour ce type de stat.";

  const container = document.querySelector(".Game-helper");
  if (!container) return;

  const statHelper = document.createElement("div");
  statHelper.className = "stat-hover";
  statHelper.dataset.stat = statKey;
  statHelper.dataset.entityUid = entityUid; // ✅ clé anti-doublon (stable)

  // Si tu veux quand même exposer entityId “réel” quand il existe
  if (entityId) statHelper.dataset.entityId = entityId;

  statHelper.innerHTML = helperHTML;

  Object.assign(statHelper.style, {
    position: "absolute",
    opacity: "0",
    transition: "opacity 1s ease",
    pointerEvents: "none", // ✅ le tooltip n'intercepte pas le hover
  });

  // Positionnement basé sur le host
  const rect = host.getBoundingClientRect();
  statHelper.style.top = `${rect.bottom + window.scrollY + 5}px`;
  statHelper.style.left = `${rect.left + window.scrollX}px`;

  container.appendChild(statHelper);

  // Clamp dans l’écran si tu l’as
  try { placeHelperInBounds(statHelper, host, { offset: 5, margin: 8 }); } catch {}

  requestAnimationFrame(() => {
    statHelper.style.opacity = "1";
  });
});

// ✅ Masquage du helper avec délai de tolérance
// =====================================================
// ✅ Mouseout (fermeture) – adapté au nouveau mapping
// =====================================================


function resolveEntityUidForHost(host) {
  // Root du bloc d’attaque (si présent)
  const rootAttack = host.closest(".attack-details");
  const rootUid = rootAttack ? getOrCreateRootUid(rootAttack) : "no-attack-root";

  // 1) Entité bindée (AttackDetailInfos)
  const boundEntity = getBoundHelperEntity(host);

  // 2) ID stable si dispo
  let entityId = "";
  if (boundEntity) {
    entityId = String(
      boundEntity?.id ??
      boundEntity?.uniqueId ??
      boundEntity?.entityId ??
      boundEntity?.serial ??
      ""
    );
  }

  // 3) Fallback localStorage (armée A)
  if (!entityId) {
    const lsEntityId = resolveEntityId(host);
    if (lsEntityId != null) entityId = String(lsEntityId);
  }

  // 4) UID final (anti-doublon + fermeture)
  const entityUid = entityId || rootUid;

  return { entityUid, entityId };
}

document.addEventListener(
  "mouseout",
  (e) => {
    if (!(e.target instanceof Element)) return;

    // Ignore les tooltips eux-mêmes (normalement pointerEvents none, mais safe)
    if (e.target.closest(".stat-hover")) return;

  const host = getStatHost(e.target);
if (!host) return;

if (!isHelperHoverEnabled(host)) return;

    // Si on bouge vers un enfant/parent dans le même host → ne rien faire
    if (e.relatedTarget instanceof Element && host.contains(e.relatedTarget)) return;

    const statKey = String(host.dataset.stat || "").trim();
    if (!statKey) return;

    const { entityUid, entityId } = resolveEntityUidForHost(host);
    const helperId = `${statKey}-${entityUid}`;

    // Cible le helper selon le nouveau dataset
    let statHelper = document.querySelector(
      `.stat-hover[data-stat="${cssEscape(statKey)}"][data-entity-uid="${cssEscape(entityUid)}"]`
    );

    // Fallback si un ancien helper data-entity-id traîne encore
    if (!statHelper && entityId) {
      statHelper = document.querySelector(
        `.stat-hover[data-stat="${cssEscape(statKey)}"][data-entity-id="${cssEscape(entityId)}"]`
      );
    }

    if (!statHelper) return;

    // Si un timer existe déjà pour ce helperId, on le remplace proprement
    if (helperTimers.has(helperId)) {
      clearTimeout(helperTimers.get(helperId));
      helperTimers.delete(helperId);
    }

    const timer = setTimeout(() => {
      statHelper.style.transition = "opacity 1s ease";
      statHelper.style.opacity = "0";

      // supprime après la fin réelle du fade
      setTimeout(() => {
        if (statHelper && statHelper.parentNode) statHelper.remove();
      }, 1100);

      helperTimers.delete(helperId);
    }, 200);

    helperTimers.set(helperId, timer);
  },
  true
);

function isHelperHoverEnabled(el) {
  if (!(el instanceof Element)) return false;

  // On vérifie sur le host direct (celui qui porte data-stat)
  const v = el.getAttribute("data-hover");

  // Absent => false
  if (v === null) return false;

  // Présent sans valeur => true (ex: <div data-hover></div>)
  if (v === "") return true;

  // Sinon interprétation string
  const s = String(v).trim().toLowerCase();
  if (["true", "1", "yes", "y", "on"].includes(s)) return true;
  if (["false", "0", "no", "n", "off"].includes(s)) return false;

  // Valeur bizarre => par défaut true (ou false si tu veux être strict)
  return true;
}

document.addEventListener('click', (e) => {
    const shopInterface = document.querySelector('.shop-interface');
    if (!shopInterface) return; // Ne rien faire si .shop-interface n'est pas présent

    const clickedInsideItem = e.target.closest('.shop-item-wrapper');
    
    // ✅ Ne rien faire si clic sur un objet OU une entité du shop
    if (clickedInsideItem && clickedInsideItem.classList.contains('shop-item-wrapper')) return;

    // 🔄 Supprimer toutes les cartes .shop-item-card
    shopInterface.querySelectorAll('.shop-item-card').forEach(card => card.remove());

    // 🔄 Retirer .selected sur tous les wrappers
    document.querySelectorAll('.shop-item-wrapper.selected').forEach(el => {
        el.classList.remove('selected');
        el.style.removeProperty('animation');
    });

    // 🔄 Réinitialiser le bouton vendeur
    const sellerButton = document.querySelector('.seller-button');
    if (sellerButton) {
        sellerButton.classList.remove('buy');
    }

    console.log("🧹 Sélection annulée (clic dans le vide)");
});
// Fonction pour afficher les entités dans le conteneur spécifié
export function EntityNewGameStarter(entityIds, containerId) {
    // Cacher .settings-menu s'il existe

    const settingsMenu = document.querySelector('.settings-menu');
    const iconMenu = document.querySelector('.settings-icon');
    
    if (settingsMenu) {
        settingsMenu.style.display = 'none';
       }
    
    // Cacher .settings-icon s'il existe
    if (iconMenu) {
        iconMenu.style.display = 'none';
         }

    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Conteneur avec l'ID ${containerId} introuvable.`);
        return;
    }

    if (container.querySelector('.entitylootContainer')) {
        console.log("Conteneur entitylootContainer déjà existant. Exécution évitée.");
        return;
    }

    const entitylootContainer = document.createElement('div');
    entitylootContainer.className = 'entitylootContainer';
    container.appendChild(entitylootContainer);

// Créer l'élément <p>
const paragraph = document.createElement("p");

// Ajouter le contenu textuel
paragraph.textContent = "Choisissez une Entité";

// Appliquer les styles
paragraph.style.position = "absolute";
paragraph.style.marginTop = "6px";
paragraph.style.fontSize = "17px";

// Ajouter l'élément au DOM (par exemple, dans le body)
entitylootContainer.appendChild(paragraph);


    entityIds.forEach((id, index) => {
        const entity = entitesNestUp.find(e => e.id === id);
        if (!entity) {
            console.warn(`Entité avec l'ID ${id} introuvable dans entitesNestUp.`);
            return;
        }
enrichEntityStats(entity);
        // Créer la structure de chaque entité
        const entityLootWrapper = document.createElement('div');
        entityLootWrapper.id = `entity-loot-${index + 1}`;
		entityLootWrapper.className = `entity-loot-colomne`;



        const entityDiv = document.createElement('div');
        entityDiv.className = `entity-loot ${entity.role}`;
        entityDiv.id = `entity-loot_${entity.id}`;

        const entityImgContainer = document.createElement('div');
        entityImgContainer.className = 'entityLoot-img-container';
        entityDiv.appendChild(entityImgContainer);

       const img = document.createElement('div');
		img.style.backgroundImage = `url('${entity.sprite}')`;
		img.className = `entite-loot-img ${entity.class}`;
		img.style.top = 'auto';

        const nameSpan = document.createElement('h2');
        nameSpan.className = 'entite-loot-name';
        nameSpan.textContent = entity.name;

        entityImgContainer.appendChild(img);
        entityImgContainer.appendChild(nameSpan);
        entityLootWrapper.appendChild(entityDiv);

        // Conteneur de détails de l'entité
        const entityDetailDiv = document.createElement('div');
        entityDetailDiv.id = `entity-detail_${entity.id}`;
        entityDetailDiv.className = 'entity-loot-detail';

        // Section de base de l'entité (description et stats)
        const entityDetailsDiv = document.createElement('div');
        entityDetailsDiv.className = 'entity-details';

        const descriptionDiv = document.createElement('div');
        descriptionDiv.textContent = entity.description;
		descriptionDiv.className = 'entityLoot-description';
        entityDetailsDiv.appendChild(descriptionDiv);

        const entityStatsDiv = document.createElement('div');
        entityStatsDiv.className = 'entity-details-stats';

createUmbraBlock(entityStatsDiv, '', () => (entity.stats?.physicalDamage ?? entity.baseStats?.physicalDamage));
createUmbraBlock(entityStatsDiv, '', () => (entity.stats?.magicalDamage ?? entity.baseStats?.magicalDamage));
createUmbraBlock(entityStatsDiv, '', () => entity.stats.piercingDamage);
createUmbraBlock(entityStatsDiv, '', () => (entity.stats?.physicalResistance ?? entity.baseStats?.physicalResistance));
createUmbraBlock(entityStatsDiv, '', () => (entity.stats?.magicalResistance ?? entity.baseStats?.magicalResistance));


       // Création du bloc pour les HP
// Affichage des HP
const hpDiv = document.createElement('div');
const hpData = entity.stats?.HP;
hpDiv.setAttribute('data-stat', 'HP');
hpDiv.setAttribute('data-entity-id', entity.id);
if (hpData && typeof hpData === 'object') {
    hpDiv.textContent = `HP : ${hpData.max}`;
} else {
    const fallbackHP = entity.baseStats?.HP ?? '—';
    hpDiv.textContent = `HP : ${fallbackHP}`;
}
hpDiv.className = 'entite-stat HP-starter';
entityStatsDiv.appendChild(hpDiv);

const extraLifeData = entity.stats?.extraLife;

if (extraLifeData && (typeof extraLifeData === "object" || typeof extraLifeData === "number")) {
  createUmbraBlock(entityStatsDiv, "Vie Bonus :", () => {
    const extraLife = entity.stats?.extraLife;

    // Cas objet: { current, max }
    if (extraLife && typeof extraLife === "object") {
      const current = extraLife.current;
      const max = extraLife.max;

      const hasCurrent = typeof current === "number" && current > 0;
      const hasMax = typeof max === "number" && max > 0;

      // si current et max => "current/max"
      if (hasCurrent && hasMax) return `${current}/${max}`;

      // si current existe mais max invalide (<=0, null, etc.) => "current"
      if (hasCurrent) return `${current}`;

      // sinon, si pas de current mais max valide => "max"
      if (hasMax) return `${max}`;

      return null;
    }

    // Cas fallback: valeur simple (considérée comme "current")
    if (typeof extraLife === "number" && extraLife > 0) return `${extraLife}`;

    return null;
  });
}



// Création du bloc pour la vitesse
const speedDiv = document.createElement('div');
const speedValue = entity.stats?.speed ?? entity.baseStats?.speed ?? null;
speedDiv.textContent = speedValue != null
    ? `Vitesse : ${(speedValue / 1000).toFixed(2)}s`
    : 'Vitesse : —';
speedDiv.className = 'entite-stat';
entityStatsDiv.appendChild(speedDiv);

        entityDetailsDiv.appendChild(entityStatsDiv);
        entityDetailDiv.appendChild(entityDetailsDiv);

        // Ajout des informations d'attaque
entity.attacks.forEach(attackName => {
    const attack = attackDetails.find(a => a.functionName === attackName);
    if (attack) {
        const attackDetailsDiv = AttackDetailInfos(attack, entity);
        entityDetailDiv.appendChild(attackDetailsDiv);
    }
});

        // Ajouter les détails de l'entité au wrapper principal
        entityLootWrapper.appendChild(entityDetailDiv);
        entitylootContainer.appendChild(entityLootWrapper);
		
		entityDiv.addEventListener('mouseover', () => {
		entityDetailDiv.style.opacity = '1';
		entityDiv.style.transform = 'scale(1.02)';
	
});

		entityDiv.addEventListener('mouseout', () => {
		entityDetailDiv.style.opacity = '0';
		entityDiv.style.transform = 'scale(0.8)';
});

entityDetailDiv.addEventListener('mouseover', () => {
    entityDetailDiv.style.opacity = '1';
    entityDiv.style.transform = 'scale(1.02)';
});
entityDetailDiv.addEventListener('mouseout', () => {
    entityDetailDiv.style.opacity = '0';
    entityDiv.style.transform = 'scale(0.8)';
});

    });

    // Ajouter un écouteur sur chaque entité pour confirmer la sélection
    document.querySelectorAll('.entity-loot').forEach(entityLoot => {
        entityLoot.addEventListener('click', function() {
            const entityId = parseInt(entityLoot.id.split('_')[1], 10);
            const entity = entitesNestUp.find(e => e.id === entityId);
            if (!entity) {
                console.warn(`Entité avec l'ID ${entityId} introuvable dans entitesNestUp.`);
                return;
            }
            showConfirmation(entity);
        });
    });
}

export function initializeArmyConfig() {
    // ✅ Priorité : armée déjà en mémoire ?
    if (window.selectedArmyA && window.selectedArmyA.length > 0) {
        console.log("✅ Armée A déjà chargée en mémoire. Initialisation évitée.");
        return;
    }

    // 🧪 Tentative de chargement depuis le localStorage
    const selectedArmyA = loadFromLocalStorage('selectedArmyA', []);
    if (selectedArmyA && selectedArmyA.length > 0) {
        window.selectedArmyA = selectedArmyA;
        console.log("✅ Armée A chargée depuis le localStorage. Initialisation évitée.");
        return;
    }

    // 🚨 Sinon, démarrage du processus de sélection
    console.log("❌ Aucune armée détectée. Démarrage de la sélection d'entités de départ.");

    // 🔢 Liste des serials disponibles (tu peux en mettre autant que tu veux)
    let defaultEntitySerials = [11];

    // 🧮 Sélection pondérée par le power
    if (defaultEntitySerials.length > 3) {
        // Récupère les entités correspondantes
        const entitiesPool = defaultEntitySerials
            .map(serial => entitesNestUp.find(e => e.serial === serial))
            .filter(e => e);

        // Calcule un poids inversement proportionnel au power
        const weights = entitiesPool.map(e => 1 / Math.max(1, e.power));

        // Fonction pour choisir une entité selon le poids
        const pickWeighted = (pool, weights) => {
            const totalWeight = weights.reduce((a, b) => a + b, 0);
            const r = Math.random() * totalWeight;
            let cum = 0;
            for (let i = 0; i < pool.length; i++) {
                cum += weights[i];
                if (r <= cum) return pool[i];
            }
            return pool[pool.length - 1];
        };

        // Sélectionne 3 entités uniques selon le poids
        const chosenEntities = [];
        const chosenSerials = [];

        while (chosenEntities.length < 3 && entitiesPool.length > 0) {
            const entity = pickWeighted(entitiesPool, weights);
            chosenEntities.push(entity);
            chosenSerials.push(entity.serial);

            // Supprime l'entité choisie du pool
            const index = entitiesPool.indexOf(entity);
            entitiesPool.splice(index, 1);
            weights.splice(index, 1);
        }

        defaultEntitySerials = chosenSerials;
    }

    // 🧱 Création des entités
    if (!document.querySelector('.entitylootContainer')) {
        const defaultEntityIds = defaultEntitySerials
            .map(serial => {
                const entity = entitesNestUp.find(e => e.serial === serial);
                return entity ? entity.id : null;
            })
            .filter(id => id !== null);

        EntityNewGameStarter(defaultEntityIds, 'game-container');
        console.log("🎯 Starters choisis :", defaultEntitySerials);
    } else {
        console.log("ℹ️ Conteneur d'entités déjà présent. Exécution évitée.");
    }
}

// Fonction pour afficher une confirmation de sélection d'entité
export function showConfirmation(entity) {
	    let gameUI = document.querySelector('.Game-UI');
    if (! gameUI) {
         gameUI = document.createElement('div');
         gameUI.className = 'Game-UI';
        GameContainer.appendChild( gameUI);
    }
	
	
    const confirmationModal = document.createElement('div');
    confirmationModal.id = 'confirmation-modal';
    confirmationModal.className = 'confirmation-Modal';
    const confirmationContent = document.createElement('div');
    confirmationContent.className = 'confirmation-content';
    confirmationContent.innerHTML = `
        <p class="confirm-question">Êtes-vous sûr de sélectionner <strong>${entity.name}</strong> pour commencer votre aventure ?<br>Vous ne pourrez plus faire marche arrière.</p>
        <span id="confirm-choice" class="confirm-button yes">Oui, je suis sûr !</span>
        <span id="cancel-choice" class="confirm-button no">Non, je réfléchis encore un peu...</span>
    `;

    confirmationModal.appendChild(confirmationContent);
    gameUI.appendChild(confirmationModal);

    setTimeout(() => {
        const confirmButton = document.getElementById('confirm-choice');
        const cancelButton = document.getElementById('cancel-choice');

        confirmButton?.addEventListener('click', function () {
            console.log("Confirmation de sélection d'entité acceptée.");

            // Réinitialiser armyAConfig et ajouter le starter sélectionné
            let armyAConfig = { lordId: null, squireIds: [] };

            if (entity.type === 'sbire') {
                armyAConfig.squireIds.push(entity.id);
            } else if (entity.type === 'lord') {
                armyAConfig.lordId = entity.id;
            }

            // Sauvegarder la nouvelle configuration de l'armée
            saveToLocalStorage('armyAConfig', armyAConfig);

            // Générer et remplacer l'armée enrichie
           let enrichedArmyA = generateArmyA(armyAConfig, entitesNestUp);

// ✅ Appliquer enrichEntityStats sur chaque entité sélectionnée
enrichedArmyA = enrichedArmyA.map(ent => enrichEntityStats(ent));

saveToLocalStorage('selectedArmyA', enrichedArmyA);
purgeStatPreview();
            console.log("Nouvelle armée enrichie sauvegardée :", enrichedArmyA);

            // Fermer le modal et supprimer le conteneur de sélection
            gameUI.removeChild(confirmationModal);

            const entitylootContainer = document.querySelector('.entitylootContainer');
            if (entitylootContainer) {
                entitylootContainer.remove();
            }

            // Rendre à nouveau visibles `.settings-menu` et `.settings-icon`
            const settingsMenu = document.querySelector('.settings-menu');
            const iconMenu = document.querySelector('.settings-icon');
            if (iconMenu) iconMenu.style.display = 'block';
        });

        cancelButton?.addEventListener('click', function () {
            console.log("Sélection d'entité annulée.");
            gameUI.removeChild(confirmationModal);

            // Rendre à nouveau visibles `.settings-menu` et `.settings-icon`
            const settingsMenu = document.querySelector('.settings-menu');
            const iconMenu = document.querySelector('.settings-icon');
        });
    }, 10);
}





//NEWGAME
// Reste armee A
export function ResetGameStages() {
    // Charger les données actuelles des stages
    const gameStages = loadFromLocalStorage('GameStages', { stages: [] });

    // Vérifier s'il y a des stages à supprimer
    if (gameStages.stages.length > 0) {
        console.log(`Suppression de ${gameStages.stages.length} stages.`);
        // Réinitialiser les données GameStages uniquement si la fonction est appelée explicitement
        saveToLocalStorage('GameStages', { stages: [] });
        console.log("GameStages a été réinitialisé.");
    } else {
        console.log("Aucun stage à supprimer.");
    }
}
// Reste armees B
export function ResetEntitesB() {
    // Supprimer la clé ArmyB du local storage
    localStorage.removeItem('ArmyB');

    // Recréer une structure vide pour ArmyB
    const emptyArmyBData = { armies: {} };
    saveToLocalStorage('ArmyB', emptyArmyBData);

    console.log('🔄 Toutes les armées B ont été réinitialisées et le cache a été nettoyé.');
}
// Reset XP
export function ResetXp() {
    // Supprimer la clé playerExperience du local storage
    localStorage.removeItem('playerExperience');

    // Recréer une structure dédiée pour l'expérience
    const playerXpData = { experience: 0 };
    saveToLocalStorage('playerExperience', playerXpData);

    console.log('🔄 Expérience du joueur réinitialisée à zéro.');

    // Mettre à jour l'affichage de l'expérience dans le jeu si nécessaire
    const scoringDiv = document.getElementById('score');
    if (scoringDiv) {
        scoringDiv.textContent = 'Experience : 0';
    }
}
export function ResetGameDay() {
    localStorage.setItem('gameDay', 1);
    console.log('🔄 Compteur de jour réinitialisé à 1.');
}

// Gestion de la nouvelle partie
document.addEventListener('click', function (event) {
    if (event.target && event.target.id === 'new-game') {
        console.log("Clic détecté sur Nouvelle Partie");

        const selectedArmyA = loadFromLocalStorage('selectedArmyA', []);

        if (selectedArmyA && selectedArmyA.length > 0) {
            console.log("Armée A existante. Affichage du modal.");

            const confirmationModal = document.createElement('div');
            confirmationModal.id = 'confirmation-modal';
            confirmationModal.className = 'confirmation-Modal';

            const confirmationContent = document.createElement('div');
            confirmationContent.className = 'confirmation-content';
            confirmationContent.innerHTML = `
                <p class="confirm-question">Si vous démarrez une nouvelle partie, toute votre progression sera perdue.<br>Confirmez-vous votre choix ?</p>
                <span id="confirm-new-game" class="confirm-button yes">Oui</span>
                <span id="cancel-new-game" class="confirm-button no">Non</span>
            `;

            confirmationModal.appendChild(confirmationContent);

            const gameUI = document.querySelector('.Game-UI') || document.body;
            const confirmationBackdrop = document.createElement('div');
            confirmationBackdrop.id = 'confirmation-backdrop';
            gameUI.appendChild(confirmationBackdrop);

            setTimeout(() => {
                confirmationBackdrop.classList.add('visible');
            }, 500);

            gameUI.appendChild(confirmationModal);

            requestAnimationFrame(() => {
                document.getElementById('confirm-new-game')?.addEventListener('click', function () {
                    console.log("Nouvelle partie confirmée.");
                    resetFullGame();

                    gameUI.removeChild(confirmationModal);
                    gameUI.removeChild(confirmationBackdrop);

                    playLoadingAnimation('reset');
                });

                document.getElementById('cancel-new-game')?.addEventListener('click', function () {
                    console.log("Nouvelle partie annulée.");
                    gameUI.removeChild(confirmationModal);
                    gameUI.removeChild(confirmationBackdrop);
                });
            });

        } else {
            console.log("Aucune armée détectée. Démarrage direct.");
            initializeArmyConfig();
        }
    }
});

export function getOrCreateGameContainer() {
    const gameWindows = document.getElementById('game-windows');
    if (!gameWindows) {
        console.error("❌ 'game-windows' introuvable, impossible de créer 'game-container'.");
        return null;
    }

    let gameContainer = document.getElementById('game-container');
    if (!gameContainer) {
        console.warn("⚠️ #game-container manquant, création automatique.");
        gameContainer = document.createElement('div');
        gameContainer.id = 'game-container';
        gameWindows.appendChild(gameContainer); // ✅ Correct : enfant de #game-windows
    }
    return gameContainer;
}


export function playLoadingAnimation(type) {
    localStorage.setItem('loadingAnimation', type);
    createBlackOverlay(type); // On peut passer le type pour adapter le comportement
    window.location.reload();
}


function triggerAnimation(type) {
    const settings = {
        newgame: {
            showSkull: true,
            showAbandon: true,
            abandonText: 'Nouvelle partie',
            abandonDelay: 1500
        },
        reset: {
            showSkull: false,
            showAbandon: true,
            abandonText: 'Partie abandonnée',
            abandonDelay: 500 // plus rapide pour le reset
        },
        gameover: {
            showSkull: true,
            showAbandon: false
        }
        // Tu peux ajouter ici autant de types que tu veux
    };

    const config = settings[type];

    if (!config) {
        console.warn('Type d’animation inconnu :', type);
        return;
    }

    if (config.showSkull) createSkullElement();
    if (config.showAbandon) createAbandonMessage(config.abandonText, config.abandonDelay);
}

function createBlackOverlay(type) {
    const overlay = document.createElement('div');
    overlay.id = 'black-overlay';
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('fade-in'));

    const baseDuration = (type === 'reset') ? 3000 : 9000;

    setTimeout(() => overlay.classList.remove('fade-in'), baseDuration);
    setTimeout(() => overlay.remove(), baseDuration + 3000);
}

function createSkullElement() {
    const skull = document.createElement('div');
    skull.id = 'skull-animation';
    document.body.appendChild(skull);

    requestAnimationFrame(() => skull.classList.add('fade-in'));

    setTimeout(() => {
        skull.classList.remove('fade-in');
        skull.classList.add('fade-out');
    }, 3500);

    setTimeout(() => skull.remove(), 8500);
}

function createAbandonMessage(text = 'Partie abandonnée', delay = 1500) {
    const abandonMsg = document.createElement('div');
    abandonMsg.className = 'abandon-message';
    abandonMsg.textContent = text;
    document.body.appendChild(abandonMsg);

    setTimeout(() => abandonMsg.classList.add('fade-in'), delay);
    setTimeout(() => abandonMsg.classList.remove('fade-in'), delay + 2500);
    setTimeout(() => abandonMsg.remove(), delay + 4500);
}

function initializeGameOnLoad() {
    console.log("📥 Document chargé. Initialisation du jeu...");

    const currentLevel = localStorage.getItem('currentLevel');
    const worldMapID = localStorage.getItem('worldmap_id');

    if (!currentLevel || String(currentLevel) === String(worldMapID)) {
        // Cas 1 : Le joueur est sur la worldmap
        const generatedWorldMapID = getOrCreateWorldMapID();
        setCurrentLevel(generatedWorldMapID);
        console.log(`🌍 Reload détecté : joueur sur la World Map => currentLevel = ${generatedWorldMapID}`);
    } else {
        // Cas 2 : Le joueur est dans un niveau
        console.log(`🧭 Reload détecté : joueur sur un niveau => currentLevel = ${currentLevel}`);
		launchCurrentLevelFromStorage()
    }

    createGameContainer();
    GameUi();
    AdminButtons();
    initializeArmyConfig();
	sanitizeItemId();
	// sanitizeEquippedItems();
	// sanitizeGlobalEquipement();

    const animationType = localStorage.getItem('loadingAnimation');
    if (animationType) {
        localStorage.removeItem('loadingAnimation');
        triggerAnimation(animationType);
    }

    const gameWindows = document.getElementById('game-windows');
    if (gameWindows) {
        gameWindows.style.opacity = 0;
        gameWindows.style.transition = 'opacity 3s ease';
        requestAnimationFrame(() => {
            gameWindows.style.opacity = 1;
            gameWindows.classList.add('fade-in');
        });
    } else {
        console.warn("⚠️ #game-windows introuvable dans le DOM.");
    }
}


document.addEventListener('DOMContentLoaded', () => {
    const reloaded = detectPageReload(); // ❗ On détecte vraiment le reload cette fois
    console.log(`✅ Page Reload détecté ? ${reloaded}`);
    initializeGameOnLoad();
    markPageLoaded(); 
});

// GESTION MENUS

function toggleWindowInMenuMap(selectorClass, createContentCallback) {
    const GameUiContainer = document.querySelector('.Game-UI');
    let MenuMapContainer = GameUiContainer.querySelector('.menu-map-container');

    if (!MenuMapContainer) {
        MenuMapContainer = document.createElement('div');
        MenuMapContainer.classList.add('menu-map-container');
        GameUiContainer.appendChild(MenuMapContainer);
    }

    const existingContent = MenuMapContainer.querySelector(`.${selectorClass}`);

    if (existingContent) {
        existingContent.remove();

        if (MenuMapContainer.children.length === 0) {
            MenuMapContainer.remove();
        }

        // ✅ Mettre à jour l'état d'affichage même après suppression
        MenuContainerDisplayRules();
        return;
    }

   createContentCallback(MenuMapContainer);

requestAnimationFrame(() => {
    reorderMenuMapChildren();
    MenuContainerDisplayRules();
	enforceMenuDisplayRules();
});
}
function reorderMenuMapChildren() {
    const container = document.querySelector('.menu-map-container');
    if (!container) return;

    const order = [ 'shop-interface', 'inventory-interface', 'codex-entity-scan', 'army-codex-list'];

    order.forEach(className => {
        const el = container.querySelector(`.${className}`);
        if (el) container.appendChild(el); // le déplace en dernier = ordre
    });
}
export function MenuContainerDisplayRules() {
    const menuMap = document.querySelector('.menu-map-container');
    if (!menuMap) return;

    // Supprimer toutes les classes existantes x-menus
    menuMap.classList.remove('one-menus', 'two-menus', 'three-menus', 'four-menus', 'five-menus');

    // Compter tous les enfants visibles de menuMap (hors display: none)
    const visibleChildren = Array.from(menuMap.children).filter(el => {
        return el.offsetParent !== null;
    });

    const count = visibleChildren.length;

    const labelMap = ['zero', 'one', 'two', 'three', 'four', 'five'];
    if (count >= 1 && count <= 5) {
        menuMap.classList.add(`${labelMap[count]}-menus`);
    }
	 const soulSection = document.querySelector('.soul-section');
    if (soulSection) {
        if (menuMap.classList.contains('three-menus')) {
            soulSection.style.transform = 'scale(0.8)';
        } else {
            soulSection.style.transform = '';
        }
    }
}
export function enforceMenuDisplayRules() {
    const container = document.querySelector('.menu-map-container');
    if (!container) return;

    const shop = container.querySelector('.shop-interface');
    const inventory = container.querySelector('.inventory-interface');
    const codexScans = Array.from(container.querySelectorAll('.codex-entity-scan'));
    const armyCodex = container.querySelector('.army-codex-list');

    const hasShop = !!shop;
    const hasInventory = !!inventory;
    const hasArmyCodex = !!armyCodex;
    const codexCount = codexScans.length;

    const totalMenus = [
        ...container.querySelectorAll(
            '.shop-interface, .inventory-interface, .codex-entity-scan, .army-codex-list'
        )
    ].length;

    console.log("DEBUG →", { hasShop, hasInventory, hasArmyCodex, codexCount, totalMenus });

    // 🔴 Règle 1 — Cas interdit : trop de menus ouverts
    if (hasShop && hasInventory && hasArmyCodex && codexCount >= 2) {
        console.log("Règle 1 → trop de menus, on ferme les codex");
        codexScans.forEach(c => c.remove());
        reorderMenuMapChildren();
        MenuContainerDisplayRules();
        return;
    }

    // ⚖️ Règle 2 — inventaire + armyCodex + codex → si shop apparaît, on ferme inventaire
    if (hasShop && hasInventory && hasArmyCodex && codexCount > 0) {
        console.log("Règle 2 → ouverture shop → on ferme inventory");
        if (inventory) inventory.remove();
        reorderMenuMapChildren();
        MenuContainerDisplayRules();
        return;
    }

    // ⚖️ Règle 3 — shop + armyCodex + codex → si inventaire apparaît, on ferme shop
    if (hasInventory && hasShop && hasArmyCodex && codexCount > 0) {
        console.log("Règle 3 → ouverture inventory → on ferme shop");
        if (shop) shop.remove();
        reorderMenuMapChildren();
        MenuContainerDisplayRules();
        return;
    }

    // 🔄 Règle 4 — si shop + inventory + army visibles → on ferme les codex
    if (hasShop && hasInventory && hasArmyCodex && codexCount > 0) {
        console.log("Règle 4 → shop + inventory + army → on ferme les codex");
        codexScans.forEach(c => c.remove());
        reorderMenuMapChildren();
        MenuContainerDisplayRules();
        return;
    }
}




export function PlayerInventory(menuIcons) {
    if (!menuIcons) {
        console.error("⚠️ Le conteneur menuIcons est manquant !");
        return;
    }

    if (!menuIcons.querySelector('.player-inventory-icon')) {
        const inventoryIconImg = document.createElement('img');
        inventoryIconImg.className = 'player-inventory-icon';
        inventoryIconImg.src = '/media/assets/ui/picto-inventory.svg';
        inventoryIconImg.alt = 'Inventaire';
       inventoryIconImg.addEventListener('click', () => {
    toggleWindowInMenuMap('inventory-interface', (MenuMapContainer) => {
        createInventory(MenuMapContainer);
    });
});
        menuIcons.appendChild(inventoryIconImg);
    }
}


export function createInventory() {
    const GameUiContainer = document.querySelector('.Game-UI');
    if (!GameUiContainer) return console.error("⚠️ '.Game-UI' introuvable.");

    let MenuMapContainer = GameUiContainer.querySelector('.menu-map-container');
    if (!MenuMapContainer) {
        MenuMapContainer = document.createElement('div');
        MenuMapContainer.classList.add('menu-map-container');
        GameUiContainer.appendChild(MenuMapContainer);
    }

    // Vérifier si l'inventaire est déjà affiché
    const existingInventory = MenuMapContainer.querySelector('.inventory-interface');
    if (existingInventory) {
        existingInventory.remove();
        if (MenuMapContainer.children.length === 0) MenuMapContainer.remove();
        return;
    }

    // Création de l'interface d'inventaire
    const inventoryDiv = document.createElement('div');
    inventoryDiv.classList.add('inventory-interface');

    const inventoryHeader = document.createElement('div');
    inventoryHeader.classList.add('inventory-header');

    const inventoryTitle = document.createElement('div');
    inventoryTitle.textContent = 'Inventaire';
	inventoryTitle.classList.add('inventory-title');

	const inventoryMenuImg = document.createElement('img');
    inventoryMenuImg.className = 'player-inventory-icon-menu';
    inventoryMenuImg.src = '/media/assets/ui/picto-inventory.svg';
    inventoryMenuImg.alt = 'Inventaire';

    const closeButton = document.createElement('div');
  closeButton.classList.add('close-button', 'inventory');
closeButton.textContent = 'x';
closeButton.addEventListener('click', () => {
    inventoryDiv.remove();

    // Mise à jour après suppression
    requestAnimationFrame(() => {
        if (MenuMapContainer.children.length === 0) {
            MenuMapContainer.remove();
        }
        MenuContainerDisplayRules();
    });
});

	inventoryHeader.appendChild(inventoryMenuImg);
    inventoryHeader.appendChild(inventoryTitle);
	inventoryHeader.appendChild(closeButton);

    const inventoryBody = document.createElement('div');
    inventoryBody.classList.add('inventory-body');

    const inventoryContent = document.createElement('div');
    inventoryContent.classList.add('inventory-content');
    const save = loadFromLocalStorage('PlayerSave', {});
save.Playerinventory = save.Playerinventory || [];
// Supprimer les doublons par itemId (en gardant le premier trouvé)
const uniqueItemsMap = new Map();
save.Playerinventory.forEach(item => {
    if (!uniqueItemsMap.has(item.itemId)) {
        uniqueItemsMap.set(item.itemId, item);
    }
});
save.Playerinventory = Array.from(uniqueItemsMap.values());
saveToLocalStorage('PlayerSave', save); // On met à jour la sauvegarde
if (save.Playerinventory.length === 0) {
    inventoryContent.innerHTML = `<p>(Aucun objet pour le moment)</p>`;
} else {
    save.Playerinventory.forEach(item => {
        const fullData = getIngameItemById(item.itemId);
        if (!fullData) {
            console.warn(`❌ Objet introuvable dans IngameItems : ${item.itemId}`);
            return;
        }

        const itemDiv = document.createElement('div');
        itemDiv.classList.add('inventory-item', `quality-${fullData.itemQuality}`);
		if (fullData.itemType) itemDiv.classList.add(fullData.itemType);
        itemDiv.dataset.itemId = item.itemId;
        itemDiv.setAttribute('draggable', 'false');

        const img = document.createElement('img');
        img.src = fullData.itemAsset;
        img.alt = fullData.displayName;
        img.id = item.itemId;
        img.classList.add('inventory-item-icon', fullData.functionName);
        img.setAttribute('draggable', 'true');
        setupDragAndDropItem(img, item.itemId);

        const label = document.createElement('span');
        label.textContent = fullData.displayName;

        itemDiv.appendChild(img);
        itemDiv.appendChild(label);
        inventoryContent.appendChild(itemDiv);
		
itemDiv.addEventListener('mouseenter', () => {
    createItemDescription(fullData, item.itemId, itemDiv);
});

itemDiv.addEventListener('mouseleave', () => {
    removeItemDescription(item.itemId); // on passe l’ID
});

    });
}

    inventoryBody.appendChild(inventoryContent);
    inventoryDiv.appendChild(inventoryHeader);
    inventoryDiv.appendChild(inventoryBody);
    MenuMapContainer.appendChild(inventoryDiv);
	reorderMenuMapChildren();
	enforceMenuDisplayRules();
	DropEquipementtoInventory();
	DropFromCodexToInventory();
	DclicSlottoInventory();
	glitterStuff('.inventory-item.stuff', 3);
}


export function MapShop(menuIcons) {
    if (!menuIcons) {
        console.error("⚠️ Le conteneur menuIcons est manquant !");
        return;
    }

    if (!menuIcons.querySelector('.shop-icon')) {
        const shopIconImg = document.createElement('img');
        shopIconImg.className = 'shop-icon';
        shopIconImg.src = '/media/assets/ui/picto-shop.svg';
        shopIconImg.alt = 'Boutique';
		
      shopIconImg.addEventListener('click', () => {
    toggleWindowInMenuMap('shop-interface', (MenuMapContainer) => {
        openShopInterface(MenuMapContainer);
    });
});


		
        menuIcons.appendChild(shopIconImg);
    }
}

export function openShopInterface() {
    const GameUiContainer = document.querySelector('.Game-UI');
    if (!GameUiContainer) return console.error("⚠️ '.Game-UI' introuvable.");

    let MenuMapContainer = GameUiContainer.querySelector('.menu-map-container');
    if (!MenuMapContainer) {
        MenuMapContainer = document.createElement('div');
        MenuMapContainer.classList.add('menu-map-container');
        GameUiContainer.appendChild(MenuMapContainer);
    }

    let existingShop = MenuMapContainer.querySelector('.shop-interface');
    if (existingShop) {
        existingShop.remove();
        if (MenuMapContainer.children.length === 0) MenuMapContainer.remove();
        return;
    }

    const shopInterface = document.createElement('div');
    shopInterface.classList.add('shop-interface');

    const shopHeader = document.createElement('div');
    shopHeader.classList.add('shop-header');

    const shopTitle = document.createElement('div');
	shopTitle.classList.add('shop-title');
    shopTitle.textContent = 'Boutique';

	const shopPicto = document.createElement('img');
    shopPicto.classList.add('shop-picto');
	shopPicto.src = '/media/assets/ui/picto-shop.svg';
    shopPicto.alt = 'Boutique';

    const closeButton = document.createElement('div');
  closeButton.classList.add('close-button', 'shop');
closeButton.textContent = 'x';
closeButton.addEventListener('click', () => {
    shopInterface.remove();

    requestAnimationFrame(() => {
        if (MenuMapContainer.children.length === 0) {
            MenuMapContainer.remove();
        }
        MenuContainerDisplayRules();
    });
});

	shopHeader.appendChild(shopPicto);
    shopHeader.appendChild(shopTitle);
    shopHeader.appendChild(closeButton);

    const shopBody = document.createElement('div');
    shopBody.classList.add('shop-body');
   
    const shopLeft = document.createElement('div');
    shopLeft.classList.add('shop-left');
   
    const shopContent = document.createElement('div');
    shopContent.classList.add('shop-content');

	const shopContentDescritpion = document.createElement('div');
    shopContentDescritpion.classList.add('shop-content-scritpion');

    const mosaic = document.createElement('div');
    mosaic.classList.add('shop-item-mosaic');
	
	shopContent.appendChild(shopContentDescritpion);
	shopContent.appendChild(mosaic);
    shopLeft.appendChild(shopContent);

    const shopRight = document.createElement('div');
    shopRight.classList.add('shop-right');
    

// Conteneur image
const imgContainer = document.createElement('div');
imgContainer.classList.add('sellerimg-container');

const sellerImg = document.createElement('img');
sellerImg.src = '/media/sprites/seller-coquin.png';
sellerImg.alt = 'seller';
sellerImg.classList.add('iddle', 'seller');

imgContainer.appendChild(sellerImg);
shopRight.appendChild(imgContainer);

// Conteneur boutons
const buttonsContainer = document.createElement('div');
buttonsContainer.classList.add('buttons-seller');

const buyButton = document.createElement('div');
buyButton.classList.add('seller-button');
buyButton.textContent = 'acheter';

// const sellButton = document.createElement('div');
// sellButton.classList.add('seller-button');
// sellButton.textContent = 'vendre';

buttonsContainer.appendChild(buyButton);
// buttonsContainer.appendChild(sellButton);
shopRight.appendChild(buttonsContainer);

    shopBody.appendChild(shopLeft);
    shopBody.appendChild(shopRight);

    shopInterface.appendChild(shopHeader);
    shopInterface.appendChild(shopBody);
    MenuMapContainer.appendChild(shopInterface);
	reorderMenuMapChildren();
	enforceMenuDisplayRules();
    // Remplir la mosaïque avec une fonction tierce
    displayShopItems(mosaic, shopRight);
	glitterStuff('.shop-item-wrapper.stuff', 3);
}

function createSettingsMenu() {
    const gameUI = document.querySelector('.Game-UI');
    if (!gameUI) {
        console.error("⚠️ Erreur : '.Game-UI' n'existe pas encore dans le DOM !");
        return;
    }

    // Vérifier si les éléments existent déjà
    if (gameUI.querySelector('.settings-icon') || gameUI.querySelector('.settings-menu')) {
        console.log("Le menu des paramètres existe déjà.");
        return;
    }

    const settingsIcon = document.createElement('div');
    settingsIcon.className = 'settings-icon';

    const settingsMenu = document.createElement('div');
    settingsMenu.className = 'settings-menu';
    settingsMenu.style.display = 'none';

    const closeButton = document.createElement('div');
    closeButton.className = 'settings-menu-close';
    closeButton.innerText = '×';
    closeButton.onclick = () => settingsMenu.style.display = 'none';

    settingsMenu.appendChild(closeButton);

    const options = [
        { text: 'Nouvelle partie', id: 'new-game' },
        { text: 'Charger une partie', id: 'load-game' },
    ];

    options.forEach(option => {
        const optionButton = document.createElement('div');
        optionButton.className = 'option-button';
        optionButton.id = option.id;
        optionButton.innerText = option.text;
        settingsMenu.appendChild(optionButton);
    });

    createSoundControls(settingsMenu);

    gameUI.appendChild(settingsIcon);
    gameUI.appendChild(settingsMenu);

    settingsIcon.onclick = () => {
        settingsMenu.style.display = settingsMenu.style.display === 'none' ? 'flex' : 'none';
    };
}
function buildSoulSection(entite) {
  const hasHybridAttack = entite.attacks.some(attackName => {
    const attack = attackDetails.find(a => a.functionName === attackName);
    return attack && attack.attacknature.includes('hybridalDamage');
  });

  const sectionDiv = document.createElement('div');
  sectionDiv.className = 'section-content soul';

  const detailSubstats = document.createElement('div');
  detailSubstats.className = 'entity-stats-section sub-stat';

  const detailstatsDiv2 = document.createElement('div');
  detailstatsDiv2.className = 'entity-stats-section right';

  const detailstatsDiv3 = document.createElement('div');
  detailstatsDiv3.className = 'entity-stats-section middle';

  const detailstatsDiv4 = document.createElement('div');
  detailstatsDiv4.className = 'entity-stats-section left';

  const statTitleSection2 = goldTitle('Umbras', 'p');

  // RIGHT
  createUmbraBlock(detailstatsDiv2, 'Puissance Physique', () => entite.stats.physicalDamage, entite);
  createUmbraBlock(detailstatsDiv2, 'Résistance Physique', () => entite.stats.physicalResistance, entite);
  createUmbraBlock(detailstatsDiv2, 'Vitalité', () => entite.stats.vitality, entite);
  createUmbraBlock(detailstatsDiv2, 'Pénétration physique', () => entite.stats.physicalPen, entite);
  createUmbraBlock(detailstatsDiv2, 'Robustesse', () => entite.stats.robustness, entite);
  createUmbraBlock(detailstatsDiv2, 'Résilience', () => entite.stats.resilience, entite);
  createUmbraBlock(detailstatsDiv2, 'Fureur Sanguinaire', () => entite.stats.bloodFury, entite);
  createUmbraBlock(detailstatsDiv2, 'Indestructibilité', () => entite.stats.indestructibility, entite);
  createUmbraBlock(detailstatsDiv2, 'Charge', () => entite.stats.charge, entite);

  // MIDDLE
  createUmbraBlock(detailstatsDiv3, 'Puissance Magique', () => entite.stats.magicalDamage, entite);
  createUmbraBlock(detailstatsDiv3, 'Résistance Magique', () => entite.stats.magicalResistance, entite);
  createUmbraBlock(detailstatsDiv3, 'Hâte', () => entite.stats.haste, entite);
  createUmbraBlock(detailstatsDiv3, 'Pénétration magique', () => entite.stats.magicalPen, entite);
  createUmbraBlock(detailstatsDiv3, 'Astralité', () => entite.stats.astrality, entite);
  createUmbraBlock(detailstatsDiv3, 'Équilibre', () => entite.stats.equilibre, entite);
  createUmbraBlock(detailstatsDiv3, 'Hypercognition', () => entite.stats.hypercognition, entite);
  createUmbraBlock(detailstatsDiv3, 'Transcendance', () => entite.stats.transcendence, entite);
  createUmbraBlock(detailstatsDiv3, 'Mysticisme', () => entite.stats.mysticism, entite);

  // LEFT
  createUmbraBlock(detailstatsDiv4, 'Puissance Perçante', () => entite.stats.piercingDamage, entite);
  createUmbraBlock(detailstatsDiv4, 'Ésquive', () => entite.stats.dodge, entite);
  createUmbraBlock(detailstatsDiv4, 'Précision', () => entite.stats.precision, entite);
  createUmbraBlock(detailstatsDiv4, 'Coup critique', () => entite.stats.criticalChance, entite);
  createUmbraBlock(detailstatsDiv4, 'Ésotérisme', () => entite.stats.esoterism, entite);
  createUmbraBlock(detailstatsDiv4, 'Vélocité', () => entite.stats.velocity, entite);
  createUmbraBlock(detailstatsDiv4, 'Ambidextrie', () => entite.stats.ambidextry, entite);
  createUmbraBlock(detailstatsDiv4, 'Occultisme', () => entite.stats.occultism, entite);
  createUmbraBlock(detailstatsDiv4, 'Mouvement', () => entite.stats.movement, entite);

  sectionDiv.appendChild(statTitleSection2);
  sectionDiv.appendChild(detailSubstats);

  detailSubstats.appendChild(detailstatsDiv2);
  detailSubstats.appendChild(detailstatsDiv3);
  detailSubstats.appendChild(detailstatsDiv4);

  return sectionDiv;
}

export function createEntityCodex(entite, parentDiv) {
    const codexEntry = document.createElement('div');
    codexEntry.classList.add('codex-entity-list');
    codexEntry.id = `CodexEntityList_${entite.id}`;

    // Bloc Niveau
  const levelDiv = document.createElement('div');
levelDiv.classList.add('codex-Level');

const levelP = document.createElement('p');
levelP.classList.add('level-codex-number', 'lvl');
levelP.setAttribute('data-stat', 'lvl');
levelP.setAttribute("data-entity-id", entite.id);
levelP.textContent = `${entite.level.current}`;
levelDiv.appendChild(levelP);

    // Bloc Sprite
const spriteImgContainer = document.createElement('div');
spriteImgContainer.classList.add('codex-entity-sprite-container');
spriteImgContainer.id = `codex-entity-sprite-container_${entite.id}`;
requestAnimationFrame(() => {
  LevelupSignal(entite, 'icon', {
    parent: `#codex-entity-sprite-container_${entite.id}`
  });
});

   
    const spriteImg = document.createElement('img');
    spriteImg.src = entite.sprite || '/media/assets/misc/default-entity.png';
    spriteImg.alt = entite.name;
    spriteImg.classList.add('codex-entity-sprite');
    spriteImgContainer.appendChild(spriteImg);

    // Bloc Infos
    const entiteInfos = document.createElement('div');
    entiteInfos.classList.add('codex-entite-infos');

    const textInfos = document.createElement('div');
    textInfos.classList.add('codex-text-infos');
    const nameP = document.createElement('p');
    nameP.classList.add('codex-entity-name');
    nameP.textContent = entite.nickname ?? entite.name;
    textInfos.appendChild(nameP);
    entiteInfos.appendChild(textInfos);

    // HP
 // 🧩 HEADSUP — HP + Armor unifiés
const headsupHP = document.createElement('div');
headsupHP.classList.add('headsup-HP-container', entite.side || 'A', entite.type || 'sbire');
headsupHP.id = `headsup-HP-container_${entite.id}`;

// ✅ Création via la fonction unifiée
const lifeBarsHeadsup = createLifeBars(entite);
if (lifeBarsHeadsup) {
  lifeBarsHeadsup.id = `HeadsupLifeBars_${entite.id}`;
  lifeBarsHeadsup.classList.add('headsup');
  headsupHP.appendChild(lifeBarsHeadsup);
}

// 🧮 Ajout du compteur texte (optionnel)
const lifeCounter = createLifeCounter(entite);
if (lifeCounter) {
  headsupHP.appendChild(lifeCounter);
}
entiteInfos.appendChild(headsupHP);


    codexEntry.appendChild(spriteImgContainer);
	codexEntry.appendChild(levelDiv);
    codexEntry.appendChild(entiteInfos);

codexEntry.addEventListener('click', (event) => {
    EntityCodexDetails(entite.id, event.shiftKey);
});

DropInventorytoCodex(codexEntry, entite.id);
    parentDiv.appendChild(codexEntry);
	return codexEntry;
}


function createCodexEntityView(entite) {
    const codexEntityView = document.createElement('div');
    codexEntityView.className = 'codex-entity-view';
	codexEntityView.setAttribute('data-id', entite.id);
    // Image / sprite
  if (entite.sprite) {
    const detailsImageDiv = document.createElement('div');
    detailsImageDiv.className = 'codex-scan-image-container';
	detailsImageDiv.id = `codex-image_${entite.id}`;

    const entiteDetailsImage = document.createElement('img');
    entiteDetailsImage.className = `codex-scan-image iddle ${entite.class}`;
    entiteDetailsImage.src = entite.sprite;

    // Aura Container
    let AuraContainer = document.createElement('div');
    AuraContainer.id = `auraContainer_codex_${entite.id}`;
    AuraContainer.className = `aura-container codex side-${entite.side} ${entite.class}`;

    // AJOUTS
	detailsImageDiv.appendChild(AuraContainer);  
    detailsImageDiv.appendChild(entiteDetailsImage);
    codexEntityView.appendChild(detailsImageDiv);
	if (entite.stats.hypercognition > 0) {
    detailsImageDiv.classList.add("hypercognition-aura");
}
}
    // Nom
    if (entite.name) {
        const entityNameH2 = document.createElement('h2');
        entityNameH2.className = 'codex-scan-name';
        entityNameH2.textContent = `${entite.name}`;
        codexEntityView.appendChild(entityNameH2);
    }

    // Surnom (form)
    createNicknameForm(entite, codexEntityView);


  // 🧩 HP + Armor bar (heads-up codex)
const CodexhealthBarEntite = document.createElement('div');
CodexhealthBarEntite.className = 'codex-entite-HP';

const HUhealthBarContainer = document.createElement('div');
HUhealthBarContainer.className = `headsup-HP-container ${entite.side} ${entite.type}`;
HUhealthBarContainer.id = `headsup-HP-container_${entite.id}`;

// 🧱 Utilisation de la fonction unifiée
const lifeBarsCodex = createLifeBars(entite);
if (lifeBarsCodex) {
  lifeBarsCodex.id = `CodexLifeBars_${entite.id}`;
  lifeBarsCodex.classList.add('codex');
  HUhealthBarContainer.appendChild(lifeBarsCodex);
}


// 🧮 Création du conteneur global pour HP + Armure
const lifeCounter = createLifeCounter(entite);
if (lifeCounter) {
  HUhealthBarContainer.appendChild(lifeCounter);
}


// Injection dans le conteneur principal
CodexhealthBarEntite.appendChild(HUhealthBarContainer);

    codexEntityView.appendChild(CodexhealthBarEntite);

    // Stuff
    createStuffDom(entite, codexEntityView);

    return codexEntityView;
}
let cleanupTopLinesClass = null;

function setupLinesClassByChildren(containerEl, { onlyVisible = true } = {}) {
  if (!containerEl) return () => {};

  const LINE_CLASSES = ["oneline", "twoline", "threeline", "fourline", "fiveline", "sixline", "sevenline"];
  const SPECIAL_CONTAINER_CLASS = "four-exact";
  const SPECIAL_CHILD_CLASS = "slot-5";
  let rafId = 0;

  const isVisible = (el) => {
    if (!onlyVisible) return true;
    if (!(el instanceof HTMLElement)) return false;
    if (el.hidden) return false;
    const cs = getComputedStyle(el);
    return cs.display !== "none" && cs.visibility !== "hidden";
  };

  const getLineClass = (count) => {
    if (count >= 1 && count <= 3) return "oneline";
    if (count >= 4 && count <= 6) return "twoline";
    if (count >= 7 && count <= 9) return "threeline";
    if (count >= 10 && count <= 12) return "fourline";
    if (count >= 13 && count <= 15) return "fiveline";
	if (count >= 16 && count <= 18) return "sixline";
	if (count >= 16) return "sevenline";
    return "";
  };

  const update = () => {
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      const allChildren = Array.from(containerEl.children);
      const visibleChildren = allChildren.filter(isVisible);
      const count = visibleChildren.length;

      // Reset classes container
      containerEl.classList.remove(...LINE_CLASSES, SPECIAL_CONTAINER_CLASS);

      // Reset children special
      allChildren.forEach((ch) => ch.classList.remove(SPECIAL_CHILD_CLASS));

      // Apply line class
      const cls = getLineClass(count);
      if (cls) containerEl.classList.add(cls);

      // ✅ Exception: 4 visibles -> 3 en ligne 1, le 4e centré en ligne 2 (position 5)
      if (count === 4) {
        containerEl.classList.add(SPECIAL_CONTAINER_CLASS);
        visibleChildren[3].classList.add(SPECIAL_CHILD_CLASS);
      }
    });
  };

  const mo = new MutationObserver(update);
  mo.observe(containerEl, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "style", "hidden"],
  });

  update();

  return () => {
    cancelAnimationFrame(rafId);
    mo.disconnect();
  };
}
function createStatSection({ sectionClass, titleText, titleClass = "" }) {
  // Bloc section (ex: "stat-section-codex attack")
  const section = document.createElement("div");
  section.className = `stat-section-codex ${sectionClass}`.trim();

  // Titre (ex: "stat-title-type attack")
  const titleWrap = document.createElement("div");
  titleWrap.className = `stat-title-type ${titleClass}`.trim();

  const titlePicto = document.createElement("div");
  titlePicto.className = "picto";

  const title = document.createElement("div");
  title.className = "title";
  title.textContent = titleText;

  titleWrap.append(titlePicto, title);
  section.appendChild(titleWrap);

  return section;
}
function statTitle({
  statClass,
  title,
  wrapperClass = "titre",
  pictoBaseClass = "picto-stat",
  nameClass = "stat-type",
}) {
  const wrapper = document.createElement("div");
  wrapper.classList.add(wrapperClass);
  if (statClass) wrapper.classList.add(statClass);

  // const picto = document.createElement("div");
  // picto.classList.add(pictoBaseClass);
  // if (statClass) picto.classList.add(statClass);

  const name = document.createElement("div");
  name.classList.add(nameClass);
  name.textContent = title;

 wrapper.append(name);
  // wrapper.append(picto);
  return wrapper;
}
function createCodexStatLine({ statClass, entite, calculatorName, content }) {
  const valeur = getStatValue(entite, calculatorName);

  const line = document.createElement("div");
  line.classList.add("codex-stat-line", statClass);

  // content = string libre contenant "${valeur}" (littéral), on remplace
  line.textContent = String(content).replaceAll("${valeur}", String(valeur));

  return line;
}
export function calculateMeleeExecutionPercent(entite) {
  const reduc = calculateHasteExecReduc(entite); // 0..25 (points de %)
  const execPercent = 100 - reduc;               // ex: reduc=1 => 99
  return clamp(execPercent, 0, 100);
}
// Registre des calculateurs
const STAT_CALCULATORS = {
 calculateMagicalTotal,
 calculateMeleeExecutionPercent,
 calculateCritTotalChance, calculateCritDamageBonus,
 calculateAmbidextryTotalChance, calculateAmbidextryDamageBonus,
 calculateBloodFuryExecutionPercent, calculateBloodFuryExecChanceBonus, calculateExecutionDamage,
 calculateBloodFuryPercent,
 calculatePhysicalPenPercent,
 calculateMagicalPenPercent,
 calculateHypercognitionBonus,
 calculateRangeRatio,
 calculateTotalDodgeBonus,
 calculateResilienceCritTotalBonus, calculateResilienceTotalCancelBonus, calculateResilienceAlterationTotalBonus,
 caluclateIndestructibilityReductionTotal, calculateIndestructibilityPercentFromEntity,
 calculateAstralityTotal,
 calculateTranscendenceConsoProtectionTotal, calculateTranscendenceExtraLife,
 calculateEsoterismPercent,
 calculateTotalRegenAmount,
calculateHastePrepReduc, calculateHasteExecReduc, calculateHasteCDReduc, calculateHasteRecupReduc, calculateHasteProjectilSpeed,
calculateRangeAccuracy,
calculateBrokenSpellDamage, calculateBrokenSpellChance,
totalMeleeExecReduction,
totalPiercingRecupReductionWithAgi,
};

function createFullStatDom({
  stat,
  label,
  value: valueTemplate,
  entite = null,
  calculatorName = null,
  showZero = false,
  dataStat = null, // override data-stat
}) {
  const entityId = entite?.id != null ? String(entite.id) : "";

  // ✅ Opt-in hover helper (absence => false)
  const enableHover = (node) => {
    if (node instanceof HTMLElement) node.dataset.hover = "true";
  };

  // clé réellement utilisée dans data-stat
  const dataStatKey =
    (typeof dataStat === "string" && dataStat.trim().length > 0)
      ? dataStat.trim()
      : stat;

  // --- value "simple" : si value est fourni ET ne contient pas ${value}, on affiche value tel quel
  const hasValue =
    valueTemplate !== null &&
    valueTemplate !== undefined &&
    String(valueTemplate).length > 0;

  const isTemplate =
    hasValue &&
    typeof valueTemplate === "string" &&
    valueTemplate.includes("${value}");

  const isManualValue = hasValue && !isTemplate;

  const readStatValue = () =>
    entite?.modifierStats?.preview?.total?.[stat] ??
    entite?.stats?.[stat] ??
    entite?.baseStats?.[stat] ??
    entite?.[stat] ??
    0;

  let rawValue;

  if (calculatorName) {
    if (typeof calculatorName === "function") {
      rawValue = entite ? calculatorName(entite) : 0;
    } else {
      const fn = STAT_CALCULATORS[calculatorName];
      if (typeof fn !== "function") {
        throw new Error(`Calculator introuvable: "${calculatorName}"`);
      }
      rawValue = entite ? fn(entite, stat) : 0;
    }
  } else {
    rawValue = readStatValue();
  }

  if (stat === "physicalResistance" || stat === "magicalResistance") {
    rawValue = calculateResistanceReductionPercent(rawValue);
  }

  // ✅ Filtre "zéro" uniquement si on dépend de rawValue (pas de value manuel)
  if (!showZero && !isManualValue) {
    const n =
      typeof rawValue === "number"
        ? rawValue
        : typeof rawValue === "string"
          ? Number(rawValue.replace(",", ".").replace(/[^0-9.\-]/g, ""))
          : NaN;

    if (!Number.isNaN(n) && n === 0) return document.createDocumentFragment();
  }

  // ✅ Rendu : value manuel = affichage direct ; template = remplace ${value} ; sinon rawValue
  const renderedValue = hasValue
    ? (isTemplate
        ? valueTemplate.replaceAll("${value}", String(rawValue))
        : String(valueTemplate))
    : String(rawValue);

  const root = document.createElement("div");
  root.className = `${stat}-stat stat-container`;
  root.setAttribute("data-stat", dataStatKey);
  enableHover(root); // ✅ IMPORTANT
  if (entityId) root.setAttribute("data-entity-id", entityId);

  const wrap = document.createElement("div");
  wrap.className = `stat-picto-valeur ${stat}`;

  const picto = document.createElement("div");
  picto.className = `picto-stat ${stat}`;


  const name = document.createElement("div");
  name.className = "stat-name";
  name.textContent = label;


  const mainVal = document.createElement("div");
  mainVal.className = "entite-stat";
  mainVal.setAttribute("data-stat", dataStatKey);
  enableHover(mainVal); // ✅ IMPORTANT
  if (entityId) mainVal.setAttribute("data-entity-id", entityId);
  mainVal.textContent = renderedValue;

  wrap.append(picto, name, mainVal);
  root.appendChild(wrap);

  return root;
}

function buildSoulSubStatBlock(entite) {
  // ✅ copie du bloc Soul : .entity-stats-section.sub-stat (sans modifier Soul)
  const detailSubstats = document.createElement("div");
  detailSubstats.className = "entity-stats-section sub-stat";

  const detailstatsDiv2 = document.createElement("div");
  detailstatsDiv2.className = "entity-stats-section right";

  const detailstatsDiv3 = document.createElement("div");
  detailstatsDiv3.className = "entity-stats-section middle";

  const detailstatsDiv4 = document.createElement("div");
  detailstatsDiv4.className = "entity-stats-section left";

  // --- RIGHT (copie Soul) ---
  createUmbraBlock(detailstatsDiv2, "Puissance Physique", () => entite.stats.physicalDamage, entite);
  createUmbraBlock(detailstatsDiv2, "Résistance Physique", () => entite.stats.physicalResistance, entite);
  createUmbraBlock(detailstatsDiv2, "Vitalité", () => entite.stats.vitality, entite);

  createUmbraBlock(detailstatsDiv2, "Pénétration physique", () => entite.stats.physicalPen, entite);
  createUmbraBlock(detailstatsDiv2, "Robustesse", () => entite.stats.robustness, entite);
  createUmbraBlock(detailstatsDiv2, "Résilience", () => entite.stats.resilience, entite);

  createUmbraBlock(detailstatsDiv2, "Fureur Sanguinaire", () => entite.stats.bloodFury, entite);
  createUmbraBlock(detailstatsDiv2, "Indestructibilité", () => entite.stats.indestructibility, entite);
  createUmbraBlock(detailstatsDiv2, "Charge", () => entite.stats.charge, entite);

  // --- MIDDLE (copie Soul) ---
  createUmbraBlock(detailstatsDiv3, "Puissance Magique", () => entite.stats.magicalDamage, entite);
  createUmbraBlock(detailstatsDiv3, "Résistance Magique", () => entite.stats.magicalResistance, entite);
  createUmbraBlock(detailstatsDiv3, "Hâte", () => entite.stats.haste, entite);

  createUmbraBlock(detailstatsDiv3, "Pénétration magique", () => entite.stats.magicalPen, entite);
  createUmbraBlock(detailstatsDiv3, "Astralité", () => entite.stats.astrality, entite);
  createUmbraBlock(detailstatsDiv3, "Équilibre", () => entite.stats.equilibre, entite);

  createUmbraBlock(detailstatsDiv3, "Hypercognition", () => entite.stats.hypercognition, entite);
  createUmbraBlock(detailstatsDiv3, "Transcendance", () => entite.stats.transcendence, entite);
  createUmbraBlock(detailstatsDiv3, "Mysticisme", () => entite.stats.mysticism, entite);

  // --- LEFT (copie Soul) ---
  createUmbraBlock(detailstatsDiv4, "Puissance Perçante", () => entite.stats.piercingDamage, entite);
  createUmbraBlock(detailstatsDiv4, "Ésquive", () => entite.stats.dodge, entite);
  createUmbraBlock(detailstatsDiv4, "Précision", () => entite.stats.precision, entite);

  createUmbraBlock(detailstatsDiv4, "Coup critique", () => entite.stats.criticalChance, entite);
  createUmbraBlock(detailstatsDiv4, "Ésotérisme", () => entite.stats.esoterism, entite);
  createUmbraBlock(detailstatsDiv4, "Vélocité", () => entite.stats.velocity, entite);

  createUmbraBlock(detailstatsDiv4, "Ambidextrie", () => entite.stats.ambidextry, entite);
  createUmbraBlock(detailstatsDiv4, "Occultisme", () => entite.stats.occultism, entite);
  createUmbraBlock(detailstatsDiv4, "Mouvement", () => entite.stats.movement, entite);

  detailSubstats.appendChild(detailstatsDiv2);
  detailSubstats.appendChild(detailstatsDiv3);
  detailSubstats.appendChild(detailstatsDiv4);

  return detailSubstats;
}
const CODEX_SECTION_CLASSES = [
  "section-profil",
  "section-stats",
  "section-soul",
  "section-informations"
];

function setCodexActiveSectionClass(codexRootEl, section) {
  if (!codexRootEl) return;

  // normalisation
  const key = String(section || "").trim().toLowerCase();

  // purge
  codexRootEl.classList.remove(...CODEX_SECTION_CLASSES);

  // apply
  if (key === "profil") codexRootEl.classList.add("section-profil");
  else if (key === "stats") codexRootEl.classList.add("section-stats");
  else if (key === "soul") codexRootEl.classList.add("section-soul");
  else if (key === "informations") codexRootEl.classList.add("section-informations");
}
const hasOwn = (obj, key) =>
  obj != null && Object.prototype.hasOwnProperty.call(obj, key);

function entityHasKey(entite, key) {
  if (!entite || !key) return false;

  const sources = [
    entite?.modifierStats?.preview?.total,
    entite?.stats,
    entite?.baseStats,
    entite,
  ];

  return sources.some(src => hasOwn(src, key));
}

function readEntityKey(entite, key) {
  return (
    entite?.modifierStats?.preview?.total?.[key] ??
    entite?.stats?.[key] ??
    entite?.baseStats?.[key] ??
    entite?.[key] ??
    0
  );
}

function createValideStatDom(opts = {}) {
  const { entite, stat, originKey = null, calculatorName } = opts;

  // 1) clé à vérifier (gating)
  const keyToCheck =
    (typeof originKey === "string" && originKey.trim().length > 0)
      ? originKey.trim()
      : stat;

  if (!entityHasKey(entite, keyToCheck)) {
    return document.createDocumentFragment();
  }

  // 2) si c'est une stat "virtuelle" (stat n'existe pas), on injecte la valeur de originKey au calculator
  const statExists = entityHasKey(entite, stat);

  if (!statExists && originKey && typeof calculatorName === "string") {
    const fn = STAT_CALCULATORS[calculatorName];
    if (typeof fn !== "function") {
      throw new Error(`Calculator introuvable: "${calculatorName}"`);
    }

    return createFullStatDom({
      ...opts,
      calculatorName: (e) => fn(e, readEntityKey(e, originKey)),
    });
  }

  // 3) sinon comportement normal
  return createFullStatDom(opts);
}

export function  createCodexEntityScan(entite, container, codexId, positionClass = '') {
	const selectedArmy = loadFromLocalStorage('selectedArmyA', []);
    entite = selectedArmy.find(e => e.id === entite.id) || entite;
    let entityClasse = 'Inconnu';
    let entityNecro = '';

    const firstAttack = attackDetails.find(a => a.functionName === entite.attacks[0]);
    if (firstAttack) {
        if (firstAttack.attackTarget.includes('enemy')) {
            entityClasse = 'Attaquant';
        } else if (firstAttack.attackTarget.includes('ally')) {
            entityClasse = 'Support';
        } else if (firstAttack.attackTarget.includes('hexa')) {
            entityClasse = 'Invocateur';
        }

        if (firstAttack.deadTarget && firstAttack.deadTarget.includes('yes')) {
            entityNecro = 'Nécro';
        }
    }
    const codexDiv = document.createElement('div');
    codexDiv.classList.add('codex-entity-scan', entityClasse.toLowerCase());
    if (positionClass) codexDiv.classList.add(positionClass);
    codexDiv.id = codexId;

    let closeButton = document.createElement('div');
    closeButton.className = 'close-button';
    closeButton.innerHTML = '&times;';
	closeButton.addEventListener('click', () => {
    const closingId = codexDiv.id.split('_')[1];

    // ✅ Fermeture centralisée
    closeEntityCodex(closingId);
	removeItemDescription();
    // ✅ Réorganisation de l’UI après suppression
    requestAnimationFrame(() => {
        reorderMenuMapChildren();
        MenuContainerDisplayRules();
        enforceMenuDisplayRules();

        // Vérifie le nombre restant de codex
        const MenuMapContainer = document.querySelector('.menu-map-container');
        const codexRemaining = Array.from(MenuMapContainer.querySelectorAll('.codex-entity-scan'));
        const armyCodex = document.querySelector('.army-codex-list');

        if (codexRemaining.length <= 1) {
            codexRemaining.forEach(c => c.classList.remove('left', 'right', 'dual-view'));
            if (armyCodex) armyCodex.classList.remove('dual');
        }
        MenuContainerDisplayRules();
    });
});
    codexDiv.appendChild(closeButton);
	let codexColumn1 = document.createElement('div');
    codexColumn1.className = 'codex-colomn-1';
	const codexEntityView = createCodexEntityView(entite);
    codexColumn1.appendChild(codexEntityView);
	
function ensureCodexAuraContainer() {
  // ✅ UNIQUEMENT dans la vue directe
  const viewRoot = codexColumn1.querySelector(
    `.codex-entity-view[data-id="${entite.id}"]`
  );
  if (!viewRoot) return null;

  const imageContainer = viewRoot.querySelector(".codex-scan-image-container");
  if (!imageContainer) return null;

  // Overlay stable
  imageContainer.style.position = "relative";

  let aura = imageContainer.querySelector(`#auraContainer_codex_${entite.id}`);
  if (!aura) {
    aura = document.createElement("div");
    aura.id = `auraContainer_codex_${entite.id}`;
    aura.className = `aura-container codex side-${entite.side} ${entite.class}`;
    // ✅ important : dans le container image, pas ailleurs
    imageContainer.prepend(aura);
  } else {
    aura.className = `aura-container codex side-${entite.side} ${entite.class}`;
  }

  aura.style.position = "absolute";
  // aura.style.inset = "0";
  aura.style.pointerEvents = "none";

  return aura;
}

let AuraContainer = ensureCodexAuraContainer();
if (AuraContainer) {
  requestAnimationFrame(() => syncEntityAuras(entite, AuraContainer));
}
    let codexColumn4 = document.createElement('div');
    codexColumn4.className = 'codex-colomn-4';

    let codexColumn2 = document.createElement('div');
    codexColumn2.className = 'codex-colomn-2';

    const sections = ['Profil', 'Stats', 'Soul', 'Informations'];
    let codexColumn3 = document.createElement('div');
    codexColumn3.className = 'codex-colomn-3';

function showSection(section) {
  // ✅ refresh entite depuis storage
  const selectedArmy = loadFromLocalStorage("selectedArmyA", []);
  entite = selectedArmy.find(e => e.id === entite.id) || entite;

  // ✅ stats-view ON uniquement sur la section Stats, OFF sinon
  const codexRoot = document.getElementById(codexId) || codexDiv; // codexId = "codex-entity_..."
  setCodexActiveSectionClass(codexRoot, section);

  if (cleanupTopLinesClass) {
    cleanupTopLinesClass();
    cleanupTopLinesClass = null;
  }

  codexColumn3.innerHTML = "";

  const sectionDiv = document.createElement("div");
  sectionDiv.className = `section-content ${section.toLowerCase()}`;

  // ✅ menu state
  codexColumn2.querySelectorAll(".codex-inner-menu").forEach(btn => {
    btn.classList.toggle("active", btn.textContent.trim() === section);
  });
  const menuIdx1 = activeIndex1Based(codexColumn2, ".codex-inner-menu");
  setCodexMenuIndex(menuIdx1);
  // =========================
  // INFORMATIONS
  // =========================
  if (section === "Informations") {
    ensureDirectEntityView(codexColumn1, entite);
    toggleCodexSideColumns(section, codexColumn1, entite);

    const entityDescription = document.createElement("p");
    entityDescription.className = "entity-lore codex";
    entityDescription.innerHTML = entite.lore || "Donnée sur l'Entité insuffisante";
    sectionDiv.appendChild(entityDescription);
  }

  // =========================
  // PROFIL
  // =========================
  if (section === "Profil") {
    ensureDirectEntityView(codexColumn1, entite);
    toggleCodexSideColumns(section, codexColumn1, entite);

    const entityStatsDiv = document.createElement("div");
    entityStatsDiv.className = "entity-details-stats";

    const StatDiv = document.createElement("h3");
    StatDiv.className = "entite-stat-title";
    StatDiv.textContent = "Informations";
    entityStatsDiv.appendChild(StatDiv);

    const StatEntityInfos = document.createElement("div");
    StatEntityInfos.className = "entite-stat-infos";

    const StatEntityNameLvl = document.createElement("div");
    StatEntityNameLvl.className = "entite-stat-name-level";

    const StatEntityName = document.createElement("div");
    StatEntityName.textContent = `${entite.name}`;
    StatEntityName.className = "entite-stat-name";

    const StatEntityLvl = document.createElement("div");
    StatEntityLvl.textContent = ` - Level ${entite.level.current}`;
    StatEntityLvl.className = "entite-stat-level";

    StatEntityNameLvl.appendChild(StatEntityName);
    StatEntityNameLvl.appendChild(StatEntityLvl);

    StatEntityInfos.appendChild(StatEntityNameLvl);
    StatEntityInfos.appendChild(
      LevelupSignal(entite, "bouton", { onOpen: (s) => showSection(s), section: "Soul" })
    );

    entityStatsDiv.appendChild(StatEntityInfos);

    const roleTypeDiv = document.createElement("div");
    roleTypeDiv.className = "entite-role-type";
    roleTypeDiv.textContent =
      `Classe : ${entityNecro} ${entityClasse} | Rôle recommandé : ${entite.role} | Type : ${entite.type}`;
    entityStatsDiv.appendChild(roleTypeDiv);

    const DetailStatsDiv = document.createElement("div");
    DetailStatsDiv.className = "codex-detailStats";

    const attributStatsDiv = document.createElement("div");
    attributStatsDiv.className = "codex-attributStats";

    const damageStatsDiv = document.createElement("div");
    damageStatsDiv.className = "codex-attributStats";

    const hpDiv = document.createElement("div");
    hpDiv.className = "entite-stat";
    hpDiv.setAttribute("data-stat", "HP");
    hpDiv.setAttribute("data-entity-id", entite.id);
    hpDiv.textContent = `HP : ${entite.stats.HP.max}`;
    attributStatsDiv.appendChild(hpDiv);

    const speedDiv = document.createElement("div");
    speedDiv.className = "entite-stat";
    speedDiv.textContent = `Vitesse : ${(entite.stats.speed / 1000).toFixed(2)}s`;
    attributStatsDiv.appendChild(speedDiv);

    createUmbraBlock(damageStatsDiv, "Puissance Physique :", () => entite.stats.physicalDamage);
    createUmbraBlock(damageStatsDiv, "Puissance Magique :", () => entite.stats.magicalDamage);
    createUmbraBlock(damageStatsDiv, "Puissance Perçante :", () => entite.stats.piercingDamage);
    createUmbraBlock(attributStatsDiv, "Résistance Physique :", () => entite.stats.physicalResistance);
    createUmbraBlock(attributStatsDiv, "Résistance Magique :", () => entite.stats.magicalResistance);

    DetailStatsDiv.appendChild(attributStatsDiv);
    DetailStatsDiv.appendChild(damageStatsDiv);
    entityStatsDiv.appendChild(DetailStatsDiv);

    const separatorDiv = document.createElement("div");
    separatorDiv.className = "separator";
    entityStatsDiv.appendChild(separatorDiv);

    sectionDiv.appendChild(entityStatsDiv);

    const attack = attackDetails.find(a => a.functionName === entite.attacks[0]);
    if (attack) {
      const attackDetailsDiv = AttackDetailInfos(attack, entite);
      sectionDiv.appendChild(attackDetailsDiv);
    }

  }
// =========================
// STATS 
// =========================
if (section === "Stats") {
  removeDirectEntityView(codexColumn1);

  // ✅ 1) Dans Stats, on veut le menu de Soul en colonne 1
  toggleCodexSideColumns("Stats", codexColumn1, entite);

  const statsBlock = document.createElement("div");
  statsBlock.className = "codex-attack-stat-block";

  // ✅ 2) Bouton toggle + contenu sub-stat (copié de Soul)
  const subStatToggle = document.createElement("div");
  subStatToggle.className = "codex-substat-toggle";

  const subStatContainer = document.createElement("div");
  subStatContainer.className = "codex-substat-container";
  // subStatContainer.style.display = "none"; // toggle simple sans CSS obligatoire

  // construit le bloc sub-stat (copie Soul)
  subStatContainer.appendChild(buildSoulSection(entite));


// État initial
// État initial : mode "stat"
codexColumn3.classList.add("stat");
codexColumn3.classList.remove("umbra");

subStatToggle.addEventListener("click", () => {
  const willShowUmbras = codexColumn3.classList.contains("stat");

  codexColumn3.classList.toggle("umbra", willShowUmbras);
  codexColumn3.classList.toggle("stat", !willShowUmbras);

  // optionnel : style du bouton
  subStatToggle.classList.toggle("show-stats", willShowUmbras);
});

 const statTitleAttribut = goldTitle('Attributs', 'p');

  const attributheader = document.createElement("div");
  attributheader.className = "entity-stats-section attributs";
  
  createUmbraBlock(attributheader, 'Force', () => entite.stats.strength, entite, null, false, 'attribut');
  createUmbraBlock(attributheader, 'Intelligence', () => entite.stats.intelligence, entite, null, false, 'attribut');
  createUmbraBlock(attributheader, 'Agilité', () => entite.stats.agility, entite, null, false, 'attribut');
  
 const statTitleStats = goldTitle('Statistiques', 'p');

  // ----------------------- ATTACK ----------------------- //
  const attackBlock = createStatSection({
    sectionClass: "attack",
    titleText: "Attaque",
    titleClass: "attack",
  });

  const frag = document.createDocumentFragment();

  frag.appendChild(statTitle({ statClass: "physicalDamage", title: "Attaques physiques :" }));

  // frag.appendChild(createValideStatDom({ stat: "execution-time", label: "Durée d'Exécution :", value: "${value} %", entite, calculatorName: (e) => clamp(100 - calculateHasteExecReduc(e), 0, 100), dataStat: "executionTime", }));
  // frag.appendChild(createValideStatDom({ stat: "meleeAttack", label: "Dégats :", value: "100 %", entite }));
  // frag.appendChild(statTitle({ statClass: "rangeAttack", title: "Attaques à distance :" }));
  // frag.appendChild( createValideStatDom({ stat: "rangeAttack", label: "Vitesse des projectiles :", value: "+ ${value} %", entite, calculatorName: "calculateHasteProjectilSpeed",dataStat: "projectileSpeed", })
  // );
  // frag.appendChild( createValideStatDom({ stat: "rangeAttack", label: "Chance d'atteindre la cible :", value: "${value} %", entite, calculatorName: "calculateRangeAccuracy", dataStat: "executionTime", }) );
  // frag.appendChild( createValideStatDom({ stat: "rangeAttack", label: "Dégats des projectiles :", value: "${value} %", entite, calculatorName: "calculateRangeRatio", dataStat: "executionTime", }) );
  // frag.appendChild(createValideStatDom({ stat: "rangeAttack", label: "Attaque à distance : ", value: "${value} %", entite, calculatorName: "calculateRangeRatio" }));
  // frag.appendChild(statTitle({ statClass: "meleeAttack", title: "Attaques de mélée :" }));
  // frag.appendChild(statTitle({ statClass: "rangeAttack", title: "Attaques à distance :" }));
  // frag.appendChild(createValideStatDom({ stat: "brokenSpell", label: "Chance de péter une attaque magique : ", value: "${value} %", entite, calculatorName: "calculateBrokenSpellChance" }));
  // frag.appendChild(createValideStatDom({ stat: "brokenSpell", label: "Dégats Attaque pétée : ", value: "${value} % de l'attaque", entite, calculatorName: "calculateBrokenSpellDamage" }));




  frag.appendChild(createValideStatDom({ stat: "physicalDamage", label: "Puissance Physique : ", value: "${value}", entite }));
  frag.appendChild(createValideStatDom({ stat: "piercingDamage", label: "Puissance Perçante : ", value: "${value}", entite }));


  frag.appendChild(createValideStatDom({ stat: "physicalPen", label: "Pénétration résistance physique : ", value: "${value} %", entite, calculatorName: "calculatePhysicalPenPercent" }));

  frag.appendChild(createValideStatDom({ stat: "criticalChance", label: "Chance de coup Critique : ", value: "${value} %", entite, calculatorName: "calculateCritTotalChance" }));
  frag.appendChild(createValideStatDom({ stat: "criticalChance", label: "Dégats des coups critiques : ", value: "+ ${value} %", entite, calculatorName: "calculateCritDamageBonus" }));

  frag.appendChild(createValideStatDom({ stat: "ambidextry", label: "Chance de 2éme coup : ", value: "${value} %", entite, calculatorName: "calculateAmbidextryTotalChance" }));
  frag.appendChild(createValideStatDom({ stat: "ambidextry", label: "Dégats du 2éme coup : ", value: "${value} %", entite, calculatorName: "calculateAmbidextryDamageBonus" }));

  frag.appendChild(createValideStatDom({ stat: "bloodFury", label: "Chance d'éxecution : ", value: "${value} %", entite, calculatorName: "calculateBloodFuryExecutionPercent" }));
  frag.appendChild(createValideStatDom({ stat: "bloodFury", label: "Dégats de l'éxecution : ", value: "+ ${value}", entite, calculatorName: "calculateExecutionDamage" }));
  frag.appendChild(createValideStatDom({ stat: "bloodFury", label: "Vulnérabilité de la cible : ", value: "${value} % de ses HP", entite, calculatorName: "calculateBloodFuryExecChanceBonus" }));
  frag.appendChild(createValideStatDom({ stat: "lifesteal", label: "Vol de vie : ", value: "${value} %", entite, calculatorName: "calculateBloodFuryPercent" }));

  frag.appendChild(statTitle({ statClass: "magicalDamage", title: "Attaques magiques :" }));
  frag.appendChild(createValideStatDom({ stat: "magicalDamage", label: "Puissance Magique : ", value: "${value}", entite, calculatorName: "calculateMagicalTotal" }));
  frag.appendChild(createValideStatDom({ stat: "magicalPen", label: "Pénétration résistance magique : ", value: "${value} %", entite, calculatorName: "calculateMagicalPenPercent" }));
  frag.appendChild(createValideStatDom({ stat: "hypercognition", label: "Bonus puissance magique : ", value: "+ ${value} ", entite, calculatorName: "calculateHypercognitionBonus" }));

  attackBlock.appendChild(frag);

  // ----------------------- DEFENCE ----------------------- //
  const defenceBlock = createStatSection({ sectionClass: "defence", titleText: "Défense", titleClass: "defence" });

  defenceBlock.appendChild(createValideStatDom({ stat: "physicalResistance", label: "Réduction dégats physiques : ", value: "${value} %", entite }));
  defenceBlock.appendChild(createValideStatDom({ stat: "magicalResistance", label: "Réduction dégats magiques : ", value: "${value} %", entite }));
  defenceBlock.appendChild(createValideStatDom({ stat: "dodge", label: "Chance d'esquive : ", value: "${value} %", entite, calculatorName: "calculateTotalDodgeBonus" }));
  defenceBlock.appendChild(createValideStatDom({ stat: "resilience", label: "Réduction des dégats critiques : ", value: "${value} %", entite, calculatorName: "calculateResilienceCritTotalBonus" }));
  defenceBlock.appendChild(createValideStatDom({ stat: "resilience", label: "Réduction des altérations d'état : ", value: "${value} %", entite, calculatorName: "calculateResilienceAlterationTotalBonus" }));
  defenceBlock.appendChild(createValideStatDom({ stat: "resilience", label: "Chance de Résilience : ", value: "${value} %", entite, calculatorName: "calculateResilienceTotalCancelBonus" }));
  defenceBlock.appendChild(createValideStatDom({ stat: "indestructibility", label: "Chance d'Indestructibilité : ", value: "${value} %", entite, calculatorName: "calculateIndestructibilityPercentFromEntity" }));
  defenceBlock.appendChild(createValideStatDom({ stat: "indestructibility", label: "Réduction de tous les dégats : ", value: "${value} %", entite, calculatorName: "caluclateIndestructibilityReductionTotal" }));
  defenceBlock.appendChild(createValideStatDom({ stat: "astrality", label: "Chance d'Astralité : ", value: "${value} %", entite, calculatorName: "calculateAstralityTotal" }));
  defenceBlock.appendChild(createValideStatDom({ stat: "esoterism", label: "Chance d'Ésotérisme : ", value: "${value} %", entite, calculatorName: "calculateEsoterismPercent" }));
  defenceBlock.appendChild(createValideStatDom({ stat: "transcendence", label: "Chance de Transcendance : ", value: "${value} %", entite, calculatorName: "calculateTranscendenceConsoProtectionTotal" }));
  defenceBlock.appendChild(createValideStatDom({
    stat: "extraLife",
    label: "Vies sup transcandée : ",
    value: "${value}",
    entite,
    calculatorName: (e) => {
      const points =
        e?.modifierStats?.preview?.total?.transcendence ??
        e?.stats?.transcendence ??
        e?.baseStats?.transcendence ??
        e?.transcendence ??
        0;
      return calculateTranscendenceExtraLife(points);
    },
  }));

  // ----------------------- UTILITAIRE ----------------------- //
  const utilitaireBlock = createStatSection({ sectionClass: "utilitaire", titleText: "Utilitaire", titleClass: "utilitaire" });

  utilitaireBlock.appendChild(createValideStatDom({ stat: "HP", label: "HP max :", value: "${value}", entite, calculatorName: (e) => e?.stats.HP.max ?? 0 }));
  utilitaireBlock.appendChild(createValideStatDom({
    stat: "dayHpRegen",
    label: "HP recup / jour :",
    value: "+ ${value} HP",
    entite,
    calculatorName: (e) => {
      const baseRegen =
        e?.modifierStats?.preview?.total?.dayHpRegen ??
        e?.stats?.dayHpRegen ??
        e?.baseStats?.dayHpRegen ??
        e?.dayHpRegen ??
        0;
      const bonusRegen =
        e?.modifierStats?.preview?.derived?.dayHpRegen ??
        e?.modifierStats?.durable?.derived?.dayHpRegen ??
        0;
      return calculateTotalRegenAmount(baseRegen, bonusRegen);
    },
  }));
  utilitaireBlock.appendChild(createValideStatDom({
    stat: "speed",
    label: "Vitesse de tour :",
    value: "${value} s",
    entite,
    showZero: true,
    calculatorName: (e) => {
      const ms = e?.modifierStats?.preview?.total?.speed ?? e?.stats?.speed ?? e?.baseStats?.speed ?? 0;
      return (Number(ms) || 0) / 1000;
    },
  }));
    createUmbraBlock(utilitaireBlock, 'Volonté', () => entite.stats.will, entite);
utilitaireBlock.appendChild(createValideStatDom({ stat: "cooldown-time", originKey: "haste", label: "Durée de Cooldown :", value: "- ${value} %", entite, calculatorName: "calculateHasteCDReduc", dataStat: "cooldownTime" })); 
utilitaireBlock.appendChild(createValideStatDom({ stat: "preparation-time", originKey: "haste", label: "Durée de Préparation :", value: "- ${value} %", entite, calculatorName: "calculateHastePrepReduc", dataStat: "preparationTime" }));
 utilitaireBlock.appendChild(createValideStatDom({ stat: "execution-time", originKey: "haste", label: "Durée d'Exécution :", value: "- ${value} %", entite, calculatorName: "calculateHasteExecReduc", dataStat: "executionTime" }));
 utilitaireBlock.appendChild(createValideStatDom({ stat: "recuperation-time", originKey: "haste", label: "Durée de Récupération :", value: "- ${value} %", entite, calculatorName: "calculateHasteRecupReduc", dataStat: "recuperationTime" }));
 utilitaireBlock.appendChild(createValideStatDom({ stat: "projectile-speed", originKey: "haste", label: "Vitesse des projectiles :", value: "+ ${value} %", entite, calculatorName: "calculateHasteProjectilSpeed", dataStat: "projectileSpeed" }));
 
   const allStatBlock = document.createElement("div");
  allStatBlock.className = "entity-stats-title statistiques";
  
 
 allStatBlock.append(attackBlock, defenceBlock, utilitaireBlock);

  sectionDiv.appendChild(statTitleAttribut);
    sectionDiv.appendChild(attributheader);
  statsBlock.append(statTitleStats, allStatBlock);
  sectionDiv.appendChild(subStatToggle);
  sectionDiv.appendChild(subStatContainer);
  sectionDiv.appendChild(statsBlock);
}

  // =========================
  // SOUL
  // =========================
if (section === 'Soul') {
  removeDirectEntityView(codexColumn1);
	toggleCodexSideColumns(section, codexColumn1, entite);

  const levelUpFormEl = createLevelUpForm(entite); // ✅ Element
  sectionDiv.appendChild(levelUpFormEl);

}
  // ✅ append unique (une seule fois)
  codexColumn3.appendChild(sectionDiv);

  // ✅ refresh aura container car codexColumn1 a pu changer
  AuraContainer = ensureCodexAuraContainer();
  if (AuraContainer) requestAnimationFrame(() => syncEntityAuras(entite, AuraContainer));
}

sections.forEach(section => {
    let buttonDiv = document.createElement('div');
    buttonDiv.className = 'codex-inner-menu';

    let spanElement = document.createElement('span');

    // Classes personnalisées selon le nom de la section
    if (section === 'Profil') {
        spanElement.className = 'codex-picto-menu-entity codex-profil';
    } else if (section === 'Stats') {
        spanElement.className = 'codex-picto-menu-entity codex-stat';
    } else if (section === 'Soul') {
        spanElement.className = 'codex-picto-menu-entity codex-soul';
     } else if (section === 'Informations') {
        spanElement.className = 'codex-picto-menu-entity codex-lore';
    }

    buttonDiv.appendChild(spanElement);
    buttonDiv.appendChild(document.createTextNode(section));
    buttonDiv.addEventListener('click', () => showSection(section));
    codexColumn2.appendChild(buttonDiv);
});
	
    codexColumn4.appendChild(codexColumn2);
    codexColumn4.appendChild(codexColumn3);
	codexDiv.appendChild(codexColumn1);
	codexDiv.appendChild(codexColumn4);
    container.appendChild(codexDiv);
	
// --- Restauration globale: on ouvre l'onglet n° codexMenu ---
const menuButtons = Array.from(codexColumn2.querySelectorAll('.codex-inner-menu'));
const wantedMenuIdx1 = getCodexMenuIndex();
const safeMenuIdx0 = Math.min(Math.max(wantedMenuIdx1 - 1, 0), Math.max(0, menuButtons.length - 1));
(menuButtons[safeMenuIdx0] || menuButtons[0]).click();
	
	requestAnimationFrame(() => {
	equippedHoverDescription()
    reorderMenuMapChildren();
    MenuContainerDisplayRules();
	enforceMenuDisplayRules();
});
}

function ensureDirectEntityView(codexColumn1, entite) {
  let direct = codexColumn1.querySelector(':scope > .codex-entity-view');
  if (!direct) {
    direct = createCodexEntityView(entite);
    codexColumn1.appendChild(direct);
  }
}

function removeDirectEntityView(codexColumn1) {
  const direct = codexColumn1.querySelector(':scope > .codex-entity-view');
  if (direct) direct.remove();
}

function toggleCodexSideColumns(section, codexColumn1, entite) {
  if (!codexColumn1) return;

  // Nettoyage systématique (évite doublons / états foireux)
  codexColumn1.querySelector(".codex-colomn-5")?.remove();
  codexColumn1.querySelector(".codex-colomn-6")?.remove();

  if (section === "Stats") {
    createStatsSubmenu(codexColumn1, entite); // doit créer .codex-colomn-5
  } else if (section === "Soul") {
    createSoulSubmenu(codexColumn1, entite);  // crée .codex-colomn-6
  }
}

function tagUmbraStatContainer(statContainer, statKey) {
  if (!statContainer) return;
  if (typeof statKey !== "string" || !statKey) return;

  const meta = umbraDetection(statKey);
  if (!meta) return;

  statContainer.dataset.stat = statKey;
  statContainer.dataset.umbra = "1";
  statContainer.dataset.attribut = meta.attribut;
  statContainer.dataset.category = meta.category;
  statContainer.dataset.level = String(meta.level);
}
export function createUmbraBlockTagged(parent, label, getterFn, entity, statKeyOrUmbra) {
  const before = parent.querySelectorAll(".stat-container").length;

  const enableHover = (node) => {
    if (node instanceof HTMLElement) node.dataset.hover = "true";
  };

  // 1) Appel createUmbraBlock (compat string/bool)
  const maybeEl = createUmbraBlock(parent, label, getterFn, entity, statKeyOrUmbra);

  // 2) Résolution statKey pour tag umbra
  let resolvedKey = null;
  if (typeof statKeyOrUmbra === "string" && statKeyOrUmbra.trim()) {
    resolvedKey = statKeyOrUmbra.trim();
  } else if (typeof findStatKeyFromLabel === "function") {
    resolvedKey = findStatKeyFromLabel(label) || null;
  }

  // 3) Récupère l’élément créé
  let el = null;
  if (maybeEl instanceof HTMLElement) {
    el = maybeEl;
  } else {
    const afterEls = parent.querySelectorAll(".stat-container");
    if (afterEls.length > before) el = afterEls[afterEls.length - 1] || null;
  }

  // 4) ✅ Ajoute data-hover="true" sur tout ce qui porte data-stat dans ce bloc
  if (el) {
    // Si le root porte data-stat
    if (el.hasAttribute("data-stat")) enableHover(el);

    // Tous les descendants data-stat (valueDiv, preview, etc.)
    el.querySelectorAll("[data-stat]").forEach(enableHover);
  }

  // 5) Tag umbra
  if (el && resolvedKey) tagUmbraStatContainer(el, resolvedKey);

  return el;
}

function createSoulSubmenu(codexColumn1, entite) {
  const col6 = document.createElement("div");
  col6.className = "codex-colomn-6";
  codexColumn1.appendChild(col6);

  const NewUmbra = document.createElement("div");
  NewUmbra.className = "umbra-submenu new entity-stats-section";
  col6.appendChild(NewUmbra);

  const UmbraDiv1 = document.createElement("div");
  UmbraDiv1.className = "umbra-submenu entity-stats-section";
  col6.appendChild(UmbraDiv1);

  UmbraDiv1.appendChild(createEntityStatsTitleNode("Umbras"));

  // ✅ Barre de filtres (avec bouton Réinitialiser)
  const filterBar = createUmbraFilterBar(UmbraDiv1);
  UmbraDiv1.appendChild(filterBar);

  const umbra = true;

  // Force
  createUmbraBlockTagged(UmbraDiv1, 'Puissance Physique', () => entite.stats.physicalDamage, entite, umbra);
  createUmbraBlockTagged(UmbraDiv1, 'Résistance Physique', () => entite.stats.physicalResistance, entite, umbra);
  createUmbraBlockTagged(UmbraDiv1, 'Vitalité', () => entite.stats.vitality, entite, umbra);
  createUmbraBlockTagged(UmbraDiv1, 'Pénétration physique', () => entite.stats.physicalPen, entite, umbra);
  createUmbraBlockTagged(UmbraDiv1, 'Robustesse', () => entite.stats.robustness, entite, umbra);
  createUmbraBlockTagged(UmbraDiv1, 'Résilience', () => entite.stats.resilience, entite, umbra);
  createUmbraBlockTagged(UmbraDiv1, 'Fureur Sanguinaire', () => entite.stats.bloodFury, entite, umbra);
  createUmbraBlockTagged(UmbraDiv1, 'Indestructibilité', () => entite.stats.indestructibility, entite, umbra);
  createUmbraBlockTagged(UmbraDiv1, 'Charge', () => entite.stats.charge, entite, umbra);

  // Intel
  createUmbraBlockTagged(UmbraDiv1, 'Puissance Magique', () => entite.stats.magicalDamage, entite, umbra);
  createUmbraBlockTagged(UmbraDiv1, 'Résistance Magique', () => entite.stats.magicalResistance, entite, umbra);
  createUmbraBlockTagged(UmbraDiv1, 'Hâte', () => entite.stats.haste, entite, umbra);
  createUmbraBlockTagged(UmbraDiv1, 'Pénétration magique', () => entite.stats.magicalPen, entite, umbra);
  createUmbraBlockTagged(UmbraDiv1, 'Astralité', () => entite.stats.astrality, entite, umbra);
  createUmbraBlockTagged(UmbraDiv1, 'Équilibre', () => entite.stats.equilibre, entite, umbra);
  createUmbraBlockTagged(UmbraDiv1, 'Hypercognition', () => entite.stats.hypercognition, entite, umbra);
  createUmbraBlockTagged(UmbraDiv1, 'Transcendance', () => entite.stats.transcendence, entite, umbra);
  createUmbraBlockTagged(UmbraDiv1, 'Mysticisme', () => entite.stats.mysticism, entite, umbra);

  // Agi
  createUmbraBlockTagged(UmbraDiv1, 'Puissance Perçante', () => entite.stats.piercingDamage, entite, umbra);
  createUmbraBlockTagged(UmbraDiv1, 'Ésquive', () => entite.stats.dodge, entite, umbra);
  createUmbraBlockTagged(UmbraDiv1, 'Précision', () => entite.stats.precision, entite, umbra);
  createUmbraBlockTagged(UmbraDiv1, 'Coup critique', () => entite.stats.criticalChance, entite, umbra);
  createUmbraBlockTagged(UmbraDiv1, 'Ésotérisme', () => entite.stats.esoterism, entite, umbra);
  createUmbraBlockTagged(UmbraDiv1, 'Vélocité', () => entite.stats.velocity, entite, umbra);
  createUmbraBlockTagged(UmbraDiv1, 'Ambidextrie', () => entite.stats.ambidextry, entite, umbra);
  createUmbraBlockTagged(UmbraDiv1, 'Occultisme', () => entite.stats.occultism, entite, umbra);
  createUmbraBlockTagged(UmbraDiv1, 'Mouvement', () => entite.stats.movement, entite, umbra);

  // ✅ Important : initialise l’état (cache les checkboxes inexistantes + affiche tout)
  syncUmbraFilters(UmbraDiv1, filterBar);

  return col6;
}

// =========================
// Helpers
// =========================
function getAllUmbraItems(scope) {
  return [...scope.querySelectorAll('.stat-container[data-umbra="1"]')];
}

function getGroupInputs(bar, groupName) {
  return [...bar.querySelectorAll(`input[type="checkbox"][data-group="${groupName}"]`)];
}

function getCheckedSet(bar, groupName) {
  const inputs = bar.querySelectorAll(`input[type="checkbox"][data-group="${groupName}"]:checked`);
  return new Set([...inputs].map(i => i.value));
}

function setCheckboxVisible(input, visible) {
  const label = input.closest("label");
  if (!label) return;
  label.style.display = visible ? "" : "none";
}

function setCheckboxEnabled(input, enabled) {
  input.disabled = !enabled;
  const label = input.closest("label");
  if (!label) return;
  label.style.opacity = enabled ? "" : "0.5";
}

// Match d’un item vs sets (intersection sur groupes actifs)
function itemMatches(item, { attrs, lvls, cats }) {
  const okAttr = attrs.size ? attrs.has(item.dataset.attribut) : true;
  const okLvl  = lvls.size  ? lvls.has(item.dataset.level)    : true;
  const okCat  = cats.size  ? cats.has(item.dataset.category) : true;
  return okAttr && okLvl && okCat;
}

// =========================
// 1) Application du filtre sur les items (display none)
// =========================
function applyUmbraFilters(scope, bar) {
  const attrs = getCheckedSet(bar, "attr");
  const lvls  = getCheckedSet(bar, "lvl");
  const cats  = getCheckedSet(bar, "cat");

  const items = getAllUmbraItems(scope);

  items.forEach(item => {
    const show = itemMatches(item, { attrs, lvls, cats });
    if (show) item.style.removeProperty("display");
    else item.style.display = "none";
  });
}

// =========================
// 2) Mise à jour des facettes (mask des checkboxes impossibles)
//    Logique : pour un groupe donné, on calcule quelles valeurs sont possibles
//    en tenant compte des autres groupes déjà sélectionnés.
// =========================
function updateUmbraFacetAvailability(scope, bar) {
  const items = getAllUmbraItems(scope);

  const current = {
    attrs: getCheckedSet(bar, "attr"),
    lvls:  getCheckedSet(bar, "lvl"),
    cats:  getCheckedSet(bar, "cat"),
  };

  // Pour chaque groupe, on calcule le "univers possible" si on ignore ce groupe,
  // puis on en déduit quelles valeurs existent.
  const facetDefs = [
    { group: "attr", datasetKey: "attribut", otherSets: () => ({
      attrs: new Set(), // ignore attr group
      lvls: current.lvls,
      cats: current.cats,
    })},
    { group: "lvl", datasetKey: "level", otherSets: () => ({
      attrs: current.attrs,
      lvls: new Set(),  // ignore lvl group
      cats: current.cats,
    })},
    { group: "cat", datasetKey: "category", otherSets: () => ({
      attrs: current.attrs,
      lvls: current.lvls,
      cats: new Set(),  // ignore cat group
    })},
  ];

  facetDefs.forEach(def => {
    const baseFilter = def.otherSets();

    // items "possibles" selon les autres groupes (sans restriction de ce groupe)
    const possibleItems = items.filter(it => itemMatches(it, baseFilter));

    // Quelles valeurs du groupe existent dans possibleItems ?
    const possibleValues = new Set(
      possibleItems.map(it => it.dataset[def.datasetKey]).filter(Boolean)
    );

    // Applique mask display none sur les checkboxes dont la valeur est impossible
    const inputs = getGroupInputs(bar, def.group);

    inputs.forEach(input => {
      const exists = possibleValues.has(input.value);

      // Si inexistante => on cache le checkbox (display none)
      setCheckboxVisible(input, exists);

      // Si la checkbox est cochée mais devenue inexistante, on la décoche (sinon état bloqué)
      if (!exists && input.checked) input.checked = false;
    });
  });
}

// =========================
// 3) Sync globale : on filtre + on met à jour les facettes
// =========================
function syncUmbraFilters(scope, bar) {
  // 1) met à jour facettes d’abord (peut décocher des trucs)
  updateUmbraFacetAvailability(scope, bar);
  // 2) applique le filtre avec l’état final
  applyUmbraFilters(scope, bar);
}

// =========================
// 4) Barre de filtres + bouton Réinitialiser (décoche tout)
// =========================
function createUmbraFilterBar(scope) {
  const bar = document.createElement("div");
  bar.className = "umbra-filters";

  const makeGroup = (titleText, items) => {
    const group = document.createElement("div");
    group.className = "umbra-filter-group";

    const title = document.createElement("div");
    title.className = "umbra-filter-title";
    title.textContent = titleText;
    group.appendChild(title);

    items.forEach(({ groupName, value, label }) => {
      const wrap = document.createElement("label");
      wrap.className = "umbra-filter-item";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = value;
      input.dataset.group = groupName;

      const txt = document.createElement("span");
      txt.textContent = label;

      wrap.appendChild(input);
      wrap.appendChild(txt);
      group.appendChild(wrap);
    });

    return group;
  };

  bar.appendChild(
    makeGroup("Attribut", [
      { groupName: "attr", value: "force",        label: "Force" },
      { groupName: "attr", value: "intelligence", label: "Intel" },
      { groupName: "attr", value: "agilite",      label: "Agilité" },
    ])
  );

  bar.appendChild(
    makeGroup("Niveau", [
      { groupName: "lvl", value: "1", label: "Lvl 1" },
      { groupName: "lvl", value: "2", label: "Lvl 2" },
      { groupName: "lvl", value: "3", label: "Lvl 3" },
    ])
  );

  bar.appendChild(
    makeGroup("Type", [
      { groupName: "cat", value: "attaque",    label: "Attaque" },
      { groupName: "cat", value: "defense",    label: "Défense" },
      { groupName: "cat", value: "utilitaire", label: "Utilitaire" },
    ])
  );

  // ✅ bouton reset
  const resetWrap = document.createElement("div");
  resetWrap.className = "umbra-filter-reset";

  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "umbra-reset-btn";
  resetBtn.textContent = "Réinitialiser";

  resetBtn.addEventListener("click", () => {
    // décoche tout (même ceux cachés)
    bar.querySelectorAll('input[type="checkbox"]').forEach(i => (i.checked = false));
    // remet l’état : toutes les facettes visibles selon dataset global, et items affichés
    syncUmbraFilters(scope, bar);
  });

  resetWrap.appendChild(resetBtn);
  bar.appendChild(resetWrap);

  // events
  bar.addEventListener("change", () => syncUmbraFilters(scope, bar));

  return bar;
}

// function toggleDirectEntityView(codexColumn1, entite) {
  // // enfant DIRECT uniquement
  // const direct = codexColumn1.querySelector(':scope > .codex-entity-view');
  // if (direct) {
    // direct.remove();
  // } else {
    // const view = createCodexEntityView(entite);
    // if (!view) return;
    // if (!view.classList.contains('codex-entity-view')) {
      // view.classList.add('codex-entity-view'); // au cas où la fabrique ne l’ajoute pas
    // }
    // codexColumn1.appendChild(view);
  // }
// }
function createStatsSubmenu(codexColumn1, entite) {
  let col5 = codexColumn1.querySelector('.codex-colomn-5');
  if (!col5) {
    col5 = document.createElement('div');
    col5.className = 'codex-colomn-5';
    codexColumn1.appendChild(col5);
  }

  // ✅ helpers life checks (number | object | array)
  const hasAtLeastOne = (v) => {
    if (v == null) return false;
    if (Array.isArray(v)) return v.length >= 1;
    if (typeof v === 'number') return Number.isFinite(v) && v >= 1;
    if (typeof v === 'object') {
      const n = Number(v.max ?? v.value ?? v.current ?? v.count ?? 0);
      return Number.isFinite(n) && n >= 1;
    }
    return false;
  };

  // ✅ helpers "has any attacks"
  const hasAny = (v) => {
    if (v == null) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'object') return Object.keys(v).length > 0;
    return false;
  };

  // ✅ condition extraLife OR fadedLife OR eternalLife
  const showExtraLifeMenu =
    hasAtLeastOne(entite?.stats?.extraLife) ||
    hasAtLeastOne(entite?.stats?.fadedLife) ||
    hasAtLeastOne(entite?.stats?.eternalLife);

  // ✅ condition attack submenu
  const showAttackMenu =
    hasAny(entite?.attacks) ||
    hasAny(entite?.attackDetails);

  // --- helpers submenu items ---
  function makePictoItem(pictoClass) {
    const item = document.createElement('div');
    item.className = 'profil-inner-menu';

    const picto = document.createElement('div');
    picto.className = `codex-picto-menu-entity ${pictoClass}`;

    item.appendChild(picto);
    return item;
  }
  // 2) sous-menu
  let submenu = col5.querySelector('.codex-profil-submenu');

  // Création (1 seule fois)
  if (!submenu) {
    submenu = document.createElement('div');
    submenu.className = 'codex-profil-submenu';

    const pictos = ['picto-entity'];
    if (showAttackMenu) pictos.push('picto-attack');          // ✅ NEW
    pictos.push('picto-graph', 'picto-archetype-list');
    if (showExtraLifeMenu) pictos.push('picto-extralife');

    pictos.forEach(pictoClass => submenu.appendChild(makePictoItem(pictoClass)));
    col5.appendChild(submenu);
  } else {
    // ✅ Sync si le submenu existe déjà (add/remove du picto attack)
    const existingAttack = submenu.querySelector('.codex-picto-menu-entity.picto-attack');
    if (showAttackMenu && !existingAttack) {
      // insert avant graph si possible, sinon append
      const graph = submenu.querySelector('.codex-picto-menu-entity.picto-graph');
      const node = makePictoItem('picto-attack');
      if (graph?.closest('.profil-inner-menu')) {
        submenu.insertBefore(node, graph.closest('.profil-inner-menu'));
      } else {
        submenu.appendChild(node);
      }
    }
    if (!showAttackMenu && existingAttack) {
      existingAttack.closest('.profil-inner-menu')?.remove();
    }

    // ✅ Sync si le submenu existe déjà (add/remove du picto extraLife)
    const existing = submenu.querySelector('.codex-picto-menu-entity.picto-extralife');
    if (showExtraLifeMenu && !existing) {
      submenu.appendChild(makePictoItem('picto-extralife'));
    }
    if (!showExtraLifeMenu && existing) {
      existing.closest('.profil-inner-menu')?.remove();
    }
  }

  // 3) profil-title
  let titleDiv = col5.querySelector('.codex-profil-title');
  if (!titleDiv) {
    titleDiv = document.createElement('div');
    titleDiv.className = 'codex-profil-title';
    col5.insertBefore(titleDiv, submenu);
  }

  function updateProfilTitle() {
    const nickname = entite.nickname ? entite.nickname : null;
    const name = entite.name;
    const labelName = nickname ? `${nickname}, ${name}` : name;

    if (col5.querySelector('.codex-picto-menu-entity.picto-entity.active')) {
      titleDiv.textContent = `Équipement - ${labelName}`;
    } else if (col5.querySelector('.codex-picto-menu-entity.picto-attack.active')) { // ✅ NEW
      titleDiv.textContent = `Attaques - ${labelName}`;
    } else if (col5.querySelector('.codex-picto-menu-entity.picto-graph.active')) {
      titleDiv.textContent = `Graphiques - ${labelName}`;
    } else if (col5.querySelector('.codex-picto-menu-entity.picto-archetype-list.active')) {
      titleDiv.textContent = `Archétypes - ${labelName}`;
    } else if (col5.querySelector('.codex-picto-menu-entity.picto-extralife.active')) {
      titleDiv.textContent = `Résurrections - ${labelName}`;
    } else {
      titleDiv.textContent = '';
    }
  }

  // --- helpers ---
  const qAll = (sel, root = submenu) => Array.from(root.querySelectorAll(sel));

  function clearCol5Views() {
    Array.from(col5.children).forEach(child => {
      if (child !== submenu && child !== titleDiv) child.remove();
    });
  }

  function handlePicto(pictoEl) {
    qAll('.codex-picto-menu-entity.active').forEach(n => n.classList.remove('active'));
    pictoEl.classList.add('active');

    const allPictos = Array.from(submenu.querySelectorAll('.codex-picto-menu-entity'));
    const idx1 = allPictos.indexOf(pictoEl) + 1;
    setCodexSubmenuIndex(idx1);

    removeDirectEntityView(codexColumn1);
    clearCol5Views();
// ==============================
// SUBMENU : Équipement / Profil
// ==============================
if (pictoEl.classList.contains('picto-entity')) {
  const node = createProfilSubmenu(entite);
  if (node) col5.appendChild(node);

  // ==============================
  // SUBMENU : Attaques
  // ==============================
} else if (pictoEl.classList.contains('picto-attack')) {
  const node = createAttackSubmenu(entite, attackDetails, { compact: true });
  if (node) {
    col5.appendChild(node);
    if (typeof node._initAttack === 'function') node._initAttack();
  }

  const infosNode = createAttackSubmenuInfos(entite, attackDetails, { compact: true });
  if (infosNode) {
    const attackContainer =
      node?.querySelector('.sub-menu-stat.attack-submenu') || node;

    if (attackContainer) {
      attackContainer.appendChild(infosNode);
    } else {
      // fallback si jamais node est null ou ne contient pas le container attendu
      col5.appendChild(infosNode);
    }

    if (typeof infosNode._initAttack === 'function') infosNode._initAttack();
  }



  // ==============================
  // SUBMENU : Graphiques
  // ==============================
} else if (pictoEl.classList.contains('picto-graph')) {
  const graphNode = createStatGraphView(entite, stats);
  if (graphNode) {
    col5.appendChild(graphNode);
    if (typeof graphNode._initGraph === 'function') graphNode._initGraph();
  }

  // ==============================
  // SUBMENU : Archétypes
  // ==============================
} else if (pictoEl.classList.contains('picto-archetype-list')) {
  const listNode = createArchetypesList(entite);
  if (listNode) col5.appendChild(listNode);

  // ==============================
  // SUBMENU : Résurrections / Extra life
  // ==============================
} else if (pictoEl.classList.contains('picto-extralife')) {
  const node = createExtraLifeView(entite);
  if (node) col5.appendChild(node);
}

// Mise à jour du titre (col5)
updateProfilTitle();
  }

  // délégation: un seul listener
  submenu.onclick = (e) => {
    const picto = e.target.closest('.codex-picto-menu-entity');
    if (!picto || !submenu.contains(picto)) return;
    handlePicto(picto);
  };

  // état par défaut
  qAll('.codex-picto-menu-entity.active').forEach(n => n.classList.remove('active'));
  clearCol5Views();

  const allPictos = Array.from(submenu.querySelectorAll('.codex-picto-menu-entity'));
  const wantedSubIdx1 = getCodexSubmenuIndex();
  const safeSubIdx0 = Math.min(Math.max(wantedSubIdx1 - 1, 0), Math.max(0, allPictos.length - 1));
  const defaultPicto = allPictos[safeSubIdx0] || allPictos[0];
  if (defaultPicto) handlePicto(defaultPicto);
}

function normalizeAttacks(entity) {
  // Priorité à attackDetails si c’est ta source “riche”
  if (Array.isArray(entity?.attackDetails) && entity.attackDetails.length) return entity.attackDetails;

  if (entity?.attackDetails && typeof entity.attackDetails === 'object') {
    const vals = Object.values(entity.attackDetails).filter(Boolean);
    if (vals.length) return vals;
  }

  if (Array.isArray(entity?.attacks) && entity.attacks.length) return entity.attacks;

  return [];
}

function getFadedLifeCount(entite) {
  const raw = entite?.stats?.fadedLife ?? entite?.fadedLife;
  // tolère legacy objet {current}
  if (raw && typeof raw === "object") return toNonNegInt(raw.current);
  return toNonNegInt(raw);
}

// Désync générique (durée + phase)
function desyncVars(el, baseDuration, durationJitter = 0, maxDelay = null) {
  const dur = baseDuration + (Math.random() * 2 - 1) * durationJitter;
  const delayRange = (maxDelay ?? dur);
  const phase = Math.random() * delayRange;

  el.style.setProperty("--desync-duration", `${dur.toFixed(3)}s`);
  el.style.setProperty("--desync-delay", `${(-phase).toFixed(3)}s`);
}

function createFadedLivesNode(entite) {
  const count = getFadedLifeCount(entite);
  if (count <= 0) return null;

  const wrap = document.createElement("div");
  wrap.className = "faded-lives";

  for (let i = 0; i < count; i++) {
    const life = document.createElement("div");
    life.className = "faded-life";

    // active l’animation (le CSS .faded-life.animate gère animation-name)
    life.classList.add("animate");

    // très rapide : durée fixe 0.468s + delay aléatoire large (type -1.315s)
    desyncAnimate(life, 0.468, 0.0, 2.0);

    wrap.appendChild(life);
  }

  return wrap;
}


function hasEternalLife(entite) {
  const raw = entite?.stats?.eternalLife ?? entite?.eternalLife;
  if (raw == null) return false;

  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw >= 1;
  }

  if (typeof raw === "object") {
    // Possédée si un "max/value/count" >= 1, OU si la clé current existe (même à 0)
    const maxish = toNonNegInt(raw.max ?? raw.value ?? raw.count ?? 0);
    if (maxish >= 1) return true;
    if (Object.prototype.hasOwnProperty.call(raw, "current")) return true;
  }

  return false;
}

function getEternalLifeCount(entite) {
  const raw = entite?.stats?.eternalLife ?? entite?.eternalLife;
  // tolère legacy objet {current}
  if (raw && typeof raw === "object") return toNonNegInt(raw.current);
  return toNonNegInt(raw);
}

function createEntityStatsTitleNode(text) {
  const title = document.createElement("div");
  title.className = "entity-stats-title attribut";
  title.innerHTML = `
    <div class="gold-line"></div>
    <p class="title">${text}</p>
    <div class="gold-line"></div>
  `;
  return title;
}

function createResuBilanItem({ pictoClass, text }) {
  const item = document.createElement("div");
  item.className = "resu-bilan-item";
  item.innerHTML = `
    <div class="picto-stat ${pictoClass}"></div>
    <div class="resu-bilan-text">${text}</div>
  `;
  return item;
}

function createResuBilanBlock({ eternalCur, extraCur, extraMax, fadedCount }) {
  const block = document.createElement("div");
  block.className = "resu-bilan";

  const applyBilanAnim = (item, pictoClass) => {
    const picto = item.querySelector(`.${pictoClass}`);
    if (!picto) return;

    // FadedLife : très rapide
    if (pictoClass === "fadedLife") {
      picto.classList.add("animate", "desync-animate", "float-drift");
      picto.style.setProperty("--desync-duration", "0.468s");
      picto.style.setProperty("--desync-delay", `${-(Math.random() * 2.0).toFixed(3)}s`);
      return;
    }

    // ExtraLife : lévitation (désync standard)
    if (pictoClass === "extraLife") {
      picto.classList.add("animate", "desync-animate", "float-levitate");
      desyncAnimate(picto, 4.2, 0.5);
      return;
    }
  };

  // FadedLife : si > 0 (EN PREMIER)
  if (toNonNegInt(fadedCount) > 0) {
    const item = createResuBilanItem({
      pictoClass: "fadedLife",
      text: `x ${toNonNegInt(fadedCount)}`
    });
    applyBilanAnim(item, "fadedLife");
    block.appendChild(item);
  }

  // ExtraLife : seulement si utilisable (>0) (ENSUITE)
  if (toNonNegInt(extraCur) > 0) {
    const item = createResuBilanItem({
      pictoClass: "extraLife",
      text: `x ${toNonNegInt(extraCur)}`
    });
    applyBilanAnim(item, "extraLife");
    block.appendChild(item);
  }

  // EternalLife : seulement si > 0 (EN DERNIER)
  if (toNonNegInt(eternalCur) > 0) {
    block.appendChild(
      createResuBilanItem({
        pictoClass: "eternalLife animate",
        text: `x ${toNonNegInt(eternalCur)}`
      })
    );
  }

  return block;
}

function createRegenStatutNode(entite) {
  const div = document.createElement("div");
  div.className = "regen-statut";

  const alive = isEntiteAlive(entite);
  div.textContent = alive ? "Restauration active" : "Restauration inactive - L'entité est morte.";

  // (optionnel mais pratique pour le CSS)
  div.classList.add(alive ? "is-alive" : "is-dead");

  return div;
}

function createBlockTitle(text, cls = "") {
  const h3 = document.createElement("h3");
  h3.className = `resu-subtitle ${cls}`.trim();
  h3.textContent = text;
  return h3;
}
function withBlockSubtitle(block, subtitleText) {
  if (!subtitleText) return block;

  const sub = document.createElement("h4");
  sub.className = "resu-block-subtitle";
  sub.textContent = subtitleText;

  // ✅ si un titre existe déjà, on place le sous-titre juste après
  const title = block.querySelector(":scope > .resu-subtitle");
  if (title) {
    title.insertAdjacentElement("afterend", sub);
  } else {
    block.prepend(sub);
  }

  return block;
}
function createEternalLifeBlock(entite) {
  const block = document.createElement("div");
  block.className = "resu-block resu-block--eternal";
  block.appendChild(createBlockTitle("Vie Éternelle"));
  withBlockSubtitle(block, "Une seule peut être possédée.");

  const eternalCur = getEternalLifeCount(entite);
  const isReady = toNonNegInt(eternalCur) > 0;

  const row = document.createElement("div");
  row.className = "resu-eternal-row";

  const card = document.createElement("div");
  card.className = "resu-eternal-card";

  const picto = document.createElement("div");
  picto.className = "picto-stat eternalLife";
if (isReady) picto.classList.add("fill", "animate");

  const fill = document.createElement("div");
  fill.className = "eternalFill";

if (isReady) {
  picto.classList.add("fill");
  fill.classList.add("fill");
} else {
  picto.classList.add("inactive");
  fill.classList.add("inactive"); // <- demandé
}
 
  card.appendChild(picto);
  card.appendChild(fill);

  const status = document.createElement("p");
status.className = "eternal-life-status";
status.textContent = isReady ? "Prête" : "Non disponible";

// ✅ ajoute la classe "inactive" si non disponible
if (!isReady) status.classList.add("inactive");

row.appendChild(card);
row.appendChild(status);

  block.appendChild(row);

  return block;
}

function createBlockMarker(text) {
  const p = document.createElement("div");
  p.className = "resu-block-marker"; // style léger
  p.textContent = text;
  return p;
}
function createExtraLifeBlock({ extraCur, extraMax, regen }) {
  const block = document.createElement("div");
  block.className = "resu-block resu-block--extra";

  const keys = Object.keys(regen)
    .filter(isRegenKey)
    .filter(k => Number.parseInt(k, 10) <= extraMax)
    .sort((a, b) => Number(a) - Number(b)); // tri numérique

  const slots = keys.map(k => {
    const s = regen[k] && typeof regen[k] === "object" ? regen[k] : {};
    const maxR = toNonNegInt(s.maxRegen);

    const curRaw = Math.floor(Number(s.currentRegen ?? 0) || 0);
    const curR = Math.max(0, curRaw);

    const isFull = maxR > 0 && curR >= maxR;
    const daysLeft = maxR > 0 ? Math.max(0, maxR - curR) : Number.POSITIVE_INFINITY;

    return { key: k, maxR, curR, isFull, daysLeft };
  });

  // ✅ PRÊTES (full) : ordre "charge la plus rapide -> la plus longue" = maxR croissant
  const available = slots
    .filter(s => s.isFull)
    .sort((a, b) => (a.maxR - b.maxR) || a.key.localeCompare(b.key));

  // ✅ EN CHARGE : comme avant (jours restants d'abord)
  const recharging = slots
    .filter(s => !s.isFull)
    .sort((a, b) =>
      (a.daysLeft - b.daysLeft) ||
      (a.maxR - b.maxR) ||
      a.key.localeCompare(b.key)
    );

  block.appendChild(
    createBlockTitle(`Vies Supplémentaires : ${toNonNegInt(extraCur)}/${toNonNegInt(extraMax)}`)
  );
  withBlockSubtitle(block, `Prêtes : ${toNonNegInt(extraCur)}`);

  // ✅ Disponibles : même taille pour toutes
  const availableWrap = document.createElement("div");
  availableWrap.className = "ex-slots-available";
  available.forEach(s => {
    const node = createExtraLifeSlotNode(
      { curR: s.curR, maxR: s.maxR, isFull: true },
      { size: "mini" } // <- même taille ; mets "main" si tu veux toutes grandes
    );
    availableWrap.appendChild(node);
  });
  block.appendChild(availableWrap);

  // ✅ EN CHARGE : conservé comme avant
  const inChargeCount = Math.max(0, toNonNegInt(extraMax) - toNonNegInt(extraCur));
  block.appendChild(createBlockMarker(`En charge : ${inChargeCount}`));

  const rechargeWrap = document.createElement("div");
  rechargeWrap.className = "ex-slots-recharging";
  recharging.forEach(s => {
    const node = createExtraLifeSlotNode(
      { curR: s.curR, maxR: s.maxR, isFull: false },
      { size: "mini" }
    );
    rechargeWrap.appendChild(node);
  });
  block.appendChild(rechargeWrap);

  return block;
}

function createFadedLifeBlock(entite) {
  const block = document.createElement("div");
  block.className = "resu-block resu-block--faded";

  const fadedCount = getFadedLifeCount(entite);

  // ✅ Sous-titre demandé (compteur)
  block.appendChild(createBlockTitle(`Vies fanées : ${toNonNegInt(fadedCount)}`));

  // Visuel seulement si >0 (tes div côte à côte)
  const fadedNode = createFadedLivesNode(entite);
  if (fadedNode) block.appendChild(fadedNode);

  return block;
}
function createResuBilanSection(entite, { extraCur, extraMax }) {
  const eternalCur = getEternalLifeCount(entite);
  const fadedCount = getFadedLifeCount(entite);

  // ✅ somme demandée : faded + eternal + extraCur
  const totalResu =
    toNonNegInt(fadedCount) +
    toNonNegInt(eternalCur) +
    toNonNegInt(extraCur);

  const wrap = document.createElement("div");
  wrap.className = "resu-block resu-bilan-section";

  // ✅ sous-titre bilan
  wrap.appendChild(createBlockTitle(`Total disponible : ${totalResu}`));

  // ✅ bloc bilan (icônes)
  wrap.appendChild(
    createResuBilanBlock({
      eternalCur,
      extraCur,
      extraMax,
      fadedCount
    })
  );

  return wrap;
}
// ===================================================
// PROFIL
// ===================================================
function createProfilSubmenu(entite) {
  const wrapper = document.createElement('div'); wrapper.classList.add('sub-menu-stat', 'profile-stat');
  const header = document.createElement('div'); header.className = 'sub-menu-stat__header'; header.appendChild(createEntityStatsTitleNode("Équipement / Profil"));
  const body = document.createElement('div'); body.className = 'sub-menu-stat__body';
  const node = createCodexEntityView(entite); if (node) body.appendChild(node);
  wrapper.appendChild(header); wrapper.appendChild(body);
  return wrapper;
}

// ===================================================
// ATTACK (helpers)
// ===================================================
function getCurrentAttack(entite, attackDetails) { const fn = entite?.attacks?.[0]; if (!fn) return null; return attackDetails?.find(a => a.functionName === fn) ?? null; }

function resolveAttackRangeType(attack) {
  const r = Array.isArray(attack?.attackRange) ? attack.attackRange : [attack?.attackRange].filter(Boolean);
  if (r.includes("range") || r.includes("ranged") || r.includes("distance")) return "range";
  return "melee";
}

function resolveAttackNatureType(attack, entite) {
  const n = Array.isArray(attack?.attacknature) ? attack.attacknature : [];

  const hasMagical  = n.includes("magicalDamage");
  const hasPhysical = n.includes("physicalDamage");
  const hasHybridal = n.includes("hybridalDamage");

  const piercing = Math.max(0, +entite?.stats?.piercingDamage || 0) > 0;

  // Base nature prioritaire
  if (hasMagical) return "magicalDamage";
  if (hasPhysical) return "physicalDamage";
  if (hasHybridal) return "hybridalDamage";

  // ✅ Si pas de base nature MAIS piercing actif => "attaque pure perçante"
  if (piercing) return "piercingDamage";

  return null;
}

// ===================================================
// ATTACK submenu (details)
// ===================================================
function createAttackSubmenu(entite, attackDetails, { compact = true } = {}) {
  const wrapper = document.createElement('div'); wrapper.className = 'sub-menu-stat attack-submenu';
  const header = document.createElement('div'); header.className = 'submenu-header'; header.appendChild(createEntityStatsTitleNode("Statistiques d'attaque")); wrapper.appendChild(header);

  const attack = getCurrentAttack(entite, attackDetails); if (!attack) return wrapper;
  wrapper._attack = attack;

  const node = AttackDetailInfos(attack, entite, compact); if (!node) return wrapper;
  wrapper.appendChild(node);

  wrapper._initAttack = () => { if (typeof node._initAttack === 'function') node._initAttack(); };
  return wrapper;
}

// ===================================================
// MAPPING EXACT (attackRange + attacknature)
// ===================================================
const ATTACK_SUBMENU_MAP = {
  melee: {
    common: (frag, entite) => {
      frag.appendChild(
        createFullStatDom({
          stat: "execution-time",
          label: "Durée d'Exécution de mélée:",
          value: "${value} %",
          entite,
          calculatorName: (e) => clamp(100 - totalMeleeExecReduction(e), 0, 100),
          dataStat: "executionTime",
        })
      );

      frag.appendChild(
        createFullStatDom({
          stat: "meleeAttack",
          label: "Dégats :",
          value: "100 %",
          entite,
        })
      );
    },

    magicalDamage: (frag, entite) => {
      frag.appendChild(
        createFullStatDom({
          stat: "brokenSpell",
          label: "Chance de péter une attaque magique : ",
          value: "${value} %",
          entite,
          calculatorName: "calculateBrokenSpellChance",
        })
      );

      frag.appendChild(
        createFullStatDom({
          stat: "brokenSpell",
          label: "Dégats Attaque pétée : ",
          value: "${value} % de l'attaque",
          entite,
          calculatorName: "calculateBrokenSpellDamage",
        })
      );
    },

    physicalDamage: (frag, entite) => {
      /* melee + physicalDamage : rien de plus */
    },

    hybridalDamage: (frag, entite) => {
      /* melee + hybridalDamage : rien de plus */
    },

    piercingDamage: (frag, entite) => {
      frag.appendChild(
        createFullStatDom({
          stat: "piercingDamage",
          label: "Réduction récupération (perçante) :",
          value: "- ${value} %",
          entite,
          calculatorName: totalPiercingRecupReductionWithAgi,
          dataStat: "recoveryTime",
        })
      );
    },
  },

  range: {
    common: (frag, entite) => {
      frag.appendChild(
        createFullStatDom({
          stat: "rangeAttack",
          label: "Vitesse des projectiles :",
          value: "+ ${value} %",
          entite,
          calculatorName: "calculateHasteProjectilSpeed",
          dataStat: "projectileSpeed",
        })
      );
    },

    physicalDamage: (frag, entite) => {
      frag.appendChild(
        createFullStatDom({
          stat: "rangeAttack",
          label: "Chance d'atteindre la cible :",
          value: "${value} %",
          entite,
          calculatorName: "calculateRangeAccuracy",
          dataStat: "executionTime",
        })
      );

      frag.appendChild(
        createFullStatDom({
          stat: "rangeAttack",
          label: "Dégats des projectiles :",
          value: "${value} %",
          entite,
          calculatorName: "calculateRangeRatio",
          dataStat: "executionTime",
        })
      );
    },

    magicalDamage: (frag, entite) => {
      frag.appendChild(
        createFullStatDom({
          stat: "brokenSpell",
          label: "Chance de péter une attaque magique : ",
          value: "${value} %",
          entite,
          calculatorName: "calculateBrokenSpellChance",
        })
      );

      frag.appendChild(
        createFullStatDom({
          stat: "brokenSpell",
          label: "Dégats Attaque pétée : ",
          value: "${value} % de l'attaque",
          entite,
          calculatorName: "calculateBrokenSpellDamage",
        })
      );
    },

    hybridalDamage: (frag, entite) => {
      frag.appendChild(
        createFullStatDom({
          stat: "rangeAttack",
          label: "Chance d'atteindre la cible :",
          value: "${value} %",
          entite,
          calculatorName: "calculateRangeAccuracy",
          dataStat: "executionTime",
        })
      );

      frag.appendChild(
        createFullStatDom({
          stat: "rangeAttack",
          label: "Dégats des projectiles :",
          value: "${value} %",
          entite,
          calculatorName: "calculateRangeRatio",
          dataStat: "executionTime",
        })
      );
    },

    piercingDamage: (frag, entite) => {
      frag.appendChild(
        createFullStatDom({
          stat: "piercingDamage",
          label: "Réduction récupération (perçante) :",
          value: "- ${value} %",
          entite,
          calculatorName: totalPiercingRecupReductionWithAgi, // ✅ même fonction (ou mets la tienne)
          dataStat: "recoveryTime",
        })
      );
    },
  },
};

// ===================================================
// BUILDER : (melee|range) -> common + (magicalDamage|physicalDamage|hybridalDamage)
// ===================================================
function attackSubmenuInfos(rangeType, natureType, entite) {
  const frag = document.createDocumentFragment();
  const r = (rangeType === 'range') ? 'range' : 'melee';
  const bucket = ATTACK_SUBMENU_MAP[r];
  if (!bucket) return frag;

  if (typeof bucket.common === 'function') bucket.common(frag, entite);

  // ✅ Base nature
  if (natureType && typeof bucket[natureType] === 'function') {
    bucket[natureType](frag, entite);
  }

  // ✅ Additif piercing si l'entité a piercingDamage > 0
  const hasPiercing = Math.max(0, +entite?.stats?.piercingDamage || 0) > 0;

  // - si attaque pure perçante => natureType est déjà "piercingDamage"
  // - si attaque base + perçante => on ajoute bucket.piercingDamage en plus
  if (hasPiercing && natureType !== "piercingDamage" && typeof bucket.piercingDamage === "function") {
    bucket.piercingDamage(frag, entite);
  }

  return frag;
}

// ===================================================
// ATTACK submenu (infos)
// ===================================================
function createAttackSubmenuInfos(entite, attackDetails, { compact = true } = {}) {
  const attack = getCurrentAttack(entite, attackDetails);
  if (!attack) return null;

  const rangeType = resolveAttackRangeType(attack);
  const natureType = resolveAttackNatureType(attack, entite); // ✅ ici

  const frag = attackSubmenuInfos(rangeType, natureType, entite);
  if (!frag.childNodes.length) return null;

  const root = document.createElement('div');
  root.className = 'attack-submenu-infos' + (compact ? ' compact' : '');
  const header = document.createElement('div');
  header.className = 'submenu-header';
  root.appendChild(header);
  root.appendChild(frag);

  return root;
}

function createExtraLifeView(entite) {
  const extra = entite?.stats?.extraLife ?? entite?.extraLife;
  const regen = entite?.extraLifeRegen;

  const extraMax = toNonNegInt(extra?.max ?? 0);
  const extraCur = toNonNegInt(extra?.current ?? 0);

  const eternalCur = getEternalLifeCount(entite);
  const fadedCount = getFadedLifeCount(entite);

  const hasExtra   = extraMax >= 1 && regen && typeof regen === "object";
  const hasEternal = hasEternalLife(entite);
  const hasFaded   = fadedCount > 0;

  if (!hasExtra && !hasEternal && !hasFaded) return null;


const root = document.createElement("div");
root.className = "sub-menu-stat submenu-resurrections";

// ✅ état vivant/mort => classe active/inactive
const alive = isEntiteAlive(entite);
root.classList.add(alive ? "active" : "inactive");

root.appendChild(createEntityStatsTitleNode("Résurrections"));
root.appendChild(createRegenStatutNode(entite));
  // Bilan (reste en haut)
  root.appendChild(createResuBilanSection(entite, { extraCur, extraMax }));

  // ✅ Ordre demandé des blocs dans le menu :
  if (hasFaded) {
    root.appendChild(createFadedLifeBlock(entite));
  }

  if (hasExtra) {
    root.appendChild(createExtraLifeBlock({ extraCur, extraMax, regen }));
  }

  if (hasEternal) {
    root.appendChild(createEternalLifeBlock(entite));
  }

  return root;
}
function desyncAnimate(el, baseDuration, durationJitter, maxDelay = null) {
  const dur = baseDuration + (Math.random() * 2 - 1) * durationJitter;
  const delayRange = (maxDelay ?? dur);      // si maxDelay fourni, on l'utilise
  const phase = Math.random() * delayRange;  // pour avoir des delays type -1.315s

  el.style.setProperty("--desync-duration", `${dur.toFixed(3)}s`);
  el.style.setProperty("--desync-delay", `${(-phase).toFixed(3)}s`);
}

function createExtraLifeSlotNode({ curR, maxR, isFull }, { size = "main" } = {}) {
  const card = document.createElement("div");
  card.className = `ex-slot ex-slot--${size} ${isFull ? "ex-slot--full" : "ex-slot--progress"}`;

  const ringWrap = document.createElement("div");
  ringWrap.className = "ex-ring-wrap";

  // --- helpers ---
  const toInt = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.floor(n) : 0;
  };

  

  // gap adaptatif : dépend du nombre de segments
  // - perSeg = angle de base d'un segment
  // - gap = perSeg * ratio, borné
  const computeGapDeg = (total, { ratio = 0.22, min = 2.5, max = 12 } = {}) => {
    const t = Math.max(1, toInt(total));
    const perSeg = 360 / t;
    return clamp(perSeg * ratio, min, max);
  };

  const maxRInt = Math.max(0, toInt(maxR));
  const curRInt = toInt(curR);

  // ✅ clamp UI : curR peut être -1 → visuellement 0 segments remplis
  const filled = Math.max(0, Math.min(maxRInt, curRInt));
  const total  = Math.max(1, maxRInt);

  // --- sizing : 3 premiers grands, le reste = 50% ---
  const MAIN_SIZE = 120;
  const MINI_SCALE = 0.50;

  const ringSize = size === "main"
    ? MAIN_SIZE
    : Math.max(44, Math.round(MAIN_SIZE * MINI_SCALE)); // 50% (avec un min de lisibilité)

  const MAIN_THICKNESS = 10;
  const ringThickness = size === "main"
    ? MAIN_THICKNESS
    : Math.max(4, Math.round(MAIN_THICKNESS * MINI_SCALE)); // 50%

  // gap adaptatif (mini un poil plus serré pour rester lisible)
  const gapDeg = size === "main"
    ? computeGapDeg(total, { ratio: 0.24, min: 3,   max: 14 })
    : computeGapDeg(total, { ratio: 0.20, min: 2.5, max: 12 });

  const pad = size === "main" ? 6 : 4;

  const svg = createSegmentedRingSVG({
    filled,
    total,
    size: ringSize,
    thickness: ringThickness, // ✅ largeur “radiale” des segments
    gapDeg,                   // ✅ espaces “angulaires” adaptatifs
    padding: pad,
    ariaLabel: `Régénération ${filled}/${total}`
  });
  svg.classList.add("ex-ring-svg");

  const core = document.createElement("div");
  core.className = "ex-core";
const picto = document.createElement("div");
picto.className = `ex-picto ${isFull ? "ex-picto--ready" : "ex-picto--wait"}`;

// anime uniquement si "ready"
if (isFull) {
  picto.classList.add("animate");          // ou garde tes classes si ton CSS en dépend
  // picto.classList.add("animate", "desync-animate", "float-levitate");

  // levitate : durée ~4.2s, léger jitter
  desyncAnimate(picto, 4.2, 0.5);
}

  core.appendChild(picto);

  ringWrap.appendChild(svg);
  ringWrap.appendChild(core);

const label = document.createElement("div");
label.className = "ex-label";

if (isFull) {
  const line1 = document.createElement("div");
  line1.className = "ex-label-line ex-label-line--ready";
  line1.textContent = "Prête !";

  const line2 = document.createElement("div");
  line2.className = "ex-label-line ex-label-line--count";
  line2.textContent = `${filled}/${total}`;

  label.appendChild(line1);
  label.appendChild(line2);
} else {
  label.textContent = `${filled}/${total}`;
}



  card.appendChild(ringWrap);
  card.appendChild(label);

  return card;
}

function polarToCartesian(cx, cy, r, angleDeg) {
  // 0° en haut
  const a = (angleDeg - 90) * Math.PI / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function describeDonutSegment(cx, cy, rOuter, rInner, startAngle, endAngle) {
  const outerStart = polarToCartesian(cx, cy, rOuter, startAngle);
  const outerEnd   = polarToCartesian(cx, cy, rOuter, endAngle);
  const innerEnd   = polarToCartesian(cx, cy, rInner, endAngle);
  const innerStart = polarToCartesian(cx, cy, rInner, startAngle);

  const delta = ((endAngle - startAngle) % 360 + 360) % 360;
  const largeArcFlag = delta > 180 ? "1" : "0";

  return [
    "M", outerStart.x, outerStart.y,
    "A", rOuter, rOuter, 0, largeArcFlag, 1, outerEnd.x, outerEnd.y,
    "L", innerEnd.x, innerEnd.y,
    "A", rInner, rInner, 0, largeArcFlag, 0, innerStart.x, innerStart.y,
    "Z"
  ].join(" ");
}


function createSegmentedRingSVG({
  filled = 0,
  total = 1,
  size = 120,
  thickness = 16,
  gapDeg = 2,
  padding = 6,
  ariaLabel = ""
} = {}) {
  const svgNS = "http://www.w3.org/2000/svg";

  const Y = Math.max(1, Math.floor(Number(total) || 1));
  const X = Math.max(0, Math.min(Y, Math.floor(Number(filled) || 0)));

  const s = Math.max(40, Math.floor(Number(size) || 120));
  const cx = s / 2;
  const cy = s / 2;

  const t = Math.max(2, Math.floor(Number(thickness) || 16));
  const pad = Math.max(0, Math.floor(Number(padding) || 0));

  const rOuter = (s / 2) - pad;
  const rInner = Math.max(1, rOuter - t);

  const segAngle = 360 / Y;
  const halfGap = Math.max(0, Number(gapDeg) || 0) / 2;

  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${s} ${s}`);
  svg.setAttribute("width", String(s));
  svg.setAttribute("height", String(s));
  svg.setAttribute("shape-rendering", "geometricPrecision");
  if (ariaLabel) svg.setAttribute("aria-label", ariaLabel);
  svg.setAttribute("role", "img");

  for (let i = 0; i < Y; i++) {
    const start = i * segAngle + halfGap;
    const end   = (i + 1) * segAngle - halfGap;
    if (end <= start) continue;

    const p = document.createElementNS(svgNS, "path");
    p.setAttribute("d", describeDonutSegment(cx, cy, rOuter, rInner, start, end));
    p.setAttribute("class", i < X ? "ex-fill" : "ex-empty");
    svg.appendChild(p);
  }

  return svg;
}

function createStatGraphView(entite, statDefinitions) {
  if (!entite || !entite.stats) return null;

  const graphValues = calculateStatGraphValue(entite.stats, statDefinitions);

  const root = document.createElement('div');
  root.className = 'sub-menu-stat submenu-graph';

  const header = document.createElement('div');
  header.className = 'codex-graph-header';

  
   header.appendChild(createEntityStatsTitleNode("Profil de l'entité"));
  

  const sub = document.createElement('p');
  sub.className = 'codex-graph-subtitle';
  sub.textContent = 'Graphique représenatnt le profil Attaque / Defence / Utilitaire basé sur les stats actuelles de cette entité.';

  
  header.appendChild(sub);
  root.appendChild(header);

  const canvasWrapper = document.createElement('div');
  canvasWrapper.className = 'codex-graph-canvas-wrapper';

  const canvas = document.createElement('canvas');
  canvas.className = 'codex-graph-canvas';
  canvasWrapper.appendChild(canvas);
  
  const labelsLayer = document.createElement('div');
labelsLayer.className = 'codex-graph-axis-labels';
canvasWrapper.appendChild(labelsLayer);

  
  root.appendChild(canvasWrapper);

  const legend = document.createElement('div');
  legend.className = 'codex-graph-legend';

const makeBtn = (key, label) => {
  const b = document.createElement('button');   // au lieu d'un <div>
  b.type = 'button';
  b.className = `graph-legend-item active graph-legend-${key}`;
  b.dataset.key = key;

  // Icône + label
  b.innerHTML = `
    <span class="graph-legend-icon"></span>
    <span class="graph-legend-label">${label}</span>
  `;

  return b;
};

legend.appendChild(makeBtn('att', 'Attaque'));
legend.appendChild(makeBtn('def', 'Défense'));
legend.appendChild(makeBtn('uti', 'Utilitaire'));

  root.appendChild(legend);

  // ✅ on stocke une fonction d'init à appeler APRÈS appendChild
  root._initGraph = () => {
   initStatRadar(canvas, graphValues, legend, labelsLayer);
  };

  return root;
}

function isSameArchetype(a, b) {
  if (!a || !b) return false;
  const keyA = String(a.key || '').trim().toLowerCase();
  const keyB = String(b.key || '').trim().toLowerCase();
  const lvlA = a.level || 1;
  const lvlB = b.level || 1;
  return keyA === keyB && lvlA === lvlB;
}

function getArchetypeProgressInfo(archEntry, entite) {
  if (!archEntry) {
    return { stage: 0, cycleLen: 0, ratio: 0 };
  }

  const keyLower = String(archEntry.key || '').trim().toLowerCase();

  let cycleLen = 0;
  if (typeof getCycleLenFor === 'function') {
    cycleLen = getCycleLenFor(keyLower, entite) || 0;
  }

  // Fallback si on n'a pas de cycleLen propre
  if (!cycleLen) {
    const stepFallback = archEntry.step || 0;
    const mileFallback = Array.isArray(archEntry.milestone)
      ? archEntry.milestone.length
      : 0;
    const bestFallback = Math.max(stepFallback, mileFallback, 1);
    cycleLen = bestFallback;
  }

  let stage = Math.max(
    0,
    archEntry.step || 0,
    Array.isArray(archEntry.milestone) ? archEntry.milestone.length : 0
  );

  stage = Math.min(stage, cycleLen);

  const ratio = cycleLen ? stage / cycleLen : 0;

  return { stage, cycleLen, ratio };
}

function createArchetypesList(entite) {
  const wrapper = document.createElement('div');
  wrapper.classList.add('sub-menu-stat', 'archetype-stat'); // commune + spécifique

  // Header
  const header = document.createElement('div');
  header.className = 'sub-menu-stat__header';
  header.appendChild(createEntityStatsTitleNode("Archétypes de l'entité"));
  wrapper.appendChild(header);

  // Body
  const body = document.createElement('div');
  body.className = 'sub-menu-stat__body';
  wrapper.appendChild(body);

  const arche = entite?.Archetype || {};
  const rawCurrent = arche.current || null;
  const rawInProgress = Array.isArray(arche.inProgress) ? arche.inProgress.slice() : [];
  const rawAchieve = Array.isArray(arche.achieve) ? arche.achieve.slice() : [];

  if (!rawCurrent && rawInProgress.length === 0 && rawAchieve.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'archetype-empty';
    empty.textContent = "L'entité n'a entamé aucun archétype.";
    body.appendChild(empty);
    return wrapper;
  }

  const current = rawCurrent;

  const inProgress = rawInProgress
    .map(entry => ({ entry, info: getArchetypeProgressInfo(entry, entite) }))
    .filter(obj => obj.info.stage > 0)
    .sort((a, b) => b.info.ratio - a.info.ratio)
    .map(obj => obj.entry);

  const achieve = rawAchieve
    .map(entry => ({ entry, info: getArchetypeProgressInfo(entry, entite) }))
    .filter(obj => obj.info.stage > 0)
    .map(obj => obj.entry);

  function addSection(titleText, items, type) {
    if (!items || items.length === 0) return;

    const sectionHeader = document.createElement('div');
    sectionHeader.className = 'archetype-section';

    const title = document.createElement('p');
    title.className = 'title';
    title.textContent = titleText;

    const goldLine = document.createElement('div');
    goldLine.className = 'gold-line';

    sectionHeader.appendChild(title);
    sectionHeader.appendChild(goldLine);
    body.appendChild(sectionHeader);

    const section = document.createElement('div');
    section.className = `archetype-section-content archetype-section-content--${type}`;

    items.forEach(entry => {
      const line = createArchetypeLine(entite, entry, type);
      section.appendChild(line);
    });

    body.appendChild(section);
  }

  if (current) addSection('ARCHETYPE EN COURS :', [current], 'current');
  if (inProgress.length) addSection('ARCHETYPES EN PROGRÈS :', inProgress, 'progress');
  if (achieve.length) addSection('ARCHETYPES ACQUIS :', achieve, 'achieve');

  return wrapper;
}

function createArchetypeLine(entite, archEntry, type) {
  const line = document.createElement('div');
  line.className = `archetype-line archetype-line--${type}`;

  // Nom de l'archétype (COLOSSE II, FANATIQUE I, etc.)
  const label = document.createElement('span');
  label.className = 'archetype-title';
  label.textContent = getArchetypeDisplayName(archEntry);
  line.appendChild(label);

  // Jauge compacte (pas de graph circulaire ici)
  const gaugeWrap = document.createElement('div');
  gaugeWrap.className = 'archetype-bar archetype-bar--list';

  const gaugeBar = document.createElement('div');
  gaugeBar.className = 'archetype-lvl-bar';

  const gaugeFill = document.createElement('div');
  gaugeFill.className = 'archetype-level-fill';

  gaugeBar.appendChild(gaugeFill);

  const gaugeMilestones = document.createElement('div');
  gaugeMilestones.className = 'archetype-milestones';

  const gaugeLabel = document.createElement('div');
  gaugeLabel.className = 'archetype-lvl-label';
  gaugeLabel.style.opacity = '0';
  gaugeLabel.style.transition = 'opacity 250ms ease';
  gaugeLabel.style.pointerEvents = 'none';

  const showGaugeHint = () => { gaugeLabel.style.opacity = '1'; };
  const hideGaugeHint = () => { gaugeLabel.style.opacity = '0'; };

  gaugeWrap.addEventListener('mouseenter', showGaugeHint);
  gaugeWrap.addEventListener('mouseleave', hideGaugeHint);
  gaugeWrap.addEventListener('focusin', showGaugeHint);
  gaugeWrap.addEventListener('focusout', hideGaugeHint);

  gaugeWrap.appendChild(gaugeBar);
  gaugeWrap.appendChild(gaugeMilestones);
  gaugeWrap.appendChild(gaugeLabel);

  line.appendChild(gaugeWrap);

  // Remplissage de la jauge + milestones en fonction de step / cycle
  fillArchetypeLineGauge(entite, archEntry, {
    fill: gaugeFill,
    label: gaugeLabel,
    milestones: gaugeMilestones
  }, type);

  return line;
}
function getArchetypeDisplayName(archEntry) {
  const key = String(archEntry.key || '').trim().toLowerCase();

  // Nom "propre" via CLASS_INDEX / cyclesData
  let baseName = getClassLabel(key) || key;

  const level = archEntry.level || 1;
  let suffix = '';

  if (level > 1) {
    suffix = ' ' + (typeof toRoman === 'function' ? toRoman(level) : level);
  }

  return (baseName + suffix).toUpperCase();
}

function fillArchetypeLineGauge(entite, archEntry, nodes, type) {
  if (!archEntry || !nodes) return;

  const keyLower = String(archEntry.key || '').trim().toLowerCase();
  const level    = archEntry.level || 1;

  // 1) Longueur du cycle (Titan → 25, etc.)
  let cycleLen = getCycleLenFor(keyLower, entite) || 0;

  // Si pour une raison quelconque on n'a pas de cycle,
  // on tombe sur un fallback basé sur le step ou la longueur de milestone.
  if (!cycleLen) {
    const stepFallback  = archEntry.step || 0;
    const mileFallback  = Array.isArray(archEntry.milestone) ? archEntry.milestone.length : 0;
    const bestFallback  = Math.max(stepFallback, mileFallback, 1);
    cycleLen = bestFallback;
  }

  // 2) Étapes complétées
  let stage = Math.max(
    0,
    archEntry.step || 0,
    Array.isArray(archEntry.milestone) ? archEntry.milestone.length : 0
  );

  // Un archétype "achieve" est toujours considéré comme 100%
  if (type === 'achieve') {
    stage = cycleLen;
  }

  const clampedStage = Math.min(stage, cycleLen);
  const pct = cycleLen ? Math.round((clampedStage / cycleLen) * 100) : 0;

  // ---- FILL ----
  if (nodes.fill) {
    nodes.fill.style.width = `${pct}%`;
  }

  // ---- LABEL (hover) ----
  if (nodes.label) {
    let nice = getClassLabel(keyLower) || keyLower;
    let romanPart = '';

    if (level > 1) {
      romanPart = (typeof toRoman === 'function')
        ? ' ' + toRoman(level)
        : ' ' + level;
    }

    nodes.label.textContent =
      `${nice}${romanPart} — ${clampedStage}/${cycleLen} · ${pct}%`;
  }

  // ---- MILESTONES (lvl 2 / lvl 3 + gemmes d'attribut) ----
  if (nodes.milestones) {
    nodes.milestones.innerHTML = '';

    const cycle = getCycleForKey(keyLower, entite) || [];
    const total = cycle.length || cycleLen;

    // Jalons théoriques (où se trouvent les lvl 2 / lvl 3 dans le cycle)
    const jalons = getArchetypeMilestones(keyLower, entite) || [];
    if (!Array.isArray(jalons) || !jalons.length) {
      // Pas de lvl2/lvl3 -> pas de jalon visuel
      return;
    }

    // Séquence d'attributs réellement investis pour cet archétype
    const investedArr = Array.isArray(archEntry.milestone)
      ? archEntry.milestone
      : [];

    jalons.forEach(j => {
      const idx = j.index ?? 0;      // index de la step dans le cycle (0-based)
      const lvl = j.level ?? null;   // 2 ou 3
      const stageNumber = idx + 1;   // step humaine (1-based)

      const el = document.createElement('div');
      el.className = 'milestone';
      el.dataset.index = String(idx);

      // Nature + classe détaillée (attaque-2, defense-3, utilitaire-2, etc.)
      if (j.stageName) {
        const [nature, lvlStr] = j.stageName.split('-'); // ex: "defense-3"
        if (nature) {
          el.classList.add(nature); // "attaque" | "defense" | "utilitaire" ...
          if (lvlStr) {
            el.classList.add(`${nature}-${lvlStr}`); // "defense-3"
          }
        }
      }

      // Classe générique de niveau : "lvl-2", "lvl-3"
      if (lvl) {
        el.dataset.level = lvl;
        el.classList.add(`lvl-${lvl}`);
      }

      // Position sur la barre
      const posPct = (stageNumber / total) * 100;
      el.style.left = `calc(${posPct}% - 6px)`;

      // Est-ce que cette étape est atteinte ?
      const isReached = (type === 'achieve') || (clampedStage >= stageNumber);
      if (isReached) {
        el.classList.add('filled');

        // Attribut investi à cette step (force / agilite / intelligence)
        const rawAttr = investedArr[stageNumber - 1]; // 0-based dans milestone[]
        if (rawAttr) {
          const attrClass = String(rawAttr).toLowerCase(); // "force","agilite","intelligence"

          // Classe sur le jalon (utile pour le CSS : .milestone.force, .milestone.agilite...)
          el.classList.add(attrClass);

          // Gemme enfant
          const gem = document.createElement('div');
          gem.className = `gemme ${attrClass}`; // ex : "gemme force"
          el.appendChild(gem);
        }
      }

      nodes.milestones.appendChild(el);
    });
  }
}

function closeEntityCodex(entiteId = null) {
    const MenuMapContainer = document.querySelector('.menu-map-container');
    if (!MenuMapContainer) return;
	
    // Si un ID précis est donné → on ferme seulement ce codex
    if (entiteId) {
        const codexToClose = MenuMapContainer.querySelectorAll(`#codex-entity_${entiteId}`);
        codexToClose.forEach(el => el.remove());
		purgeStatPreview(entiteId)
    } 
    // Sinon → on ferme tous les codex
    else {
        const allCodex = MenuMapContainer.querySelectorAll('.codex-entity-scan');
        allCodex.forEach(el => el.remove());
		purgeStatPreview(entiteId)
    }

    // Nettoyage des états actifs
    document.querySelectorAll('.codex-entity-list').forEach(el => el.classList.remove('active'));
}

function closeArmyCodexList() {
    const armyCodex = document.querySelector('.army-codex-list');
    if (!armyCodex) return;
    // Retirer les classes d’état
    armyCodex.classList.remove('dual');
}

export function PlayerArmyCodex(menuIcons) {
    if (!menuIcons) {
              return;
    }

    // Vérifier si l'icône existe déjà
    if (menuIcons.querySelector('.army-codex-icon')) {
        console.log("L'icône du Codex de l'armée existe déjà.");
        return;
    }

    // Création de l'icône
    const pictogram = document.createElement('img');
    pictogram.src = '/media/assets/ui/picto-banner.svg';
    pictogram.alt = 'Codex de l’armée';
    pictogram.classList.add('army-codex-icon');

    // Ajout à menuIcons
    menuIcons.appendChild(pictogram);

    // Gestion du clic
pictogram.addEventListener('click', () => {
    toggleWindowInMenuMap('army-codex-list', (MenuMapContainer) => {
        createCodex(MenuMapContainer);
    });
});
    function createCodex(MenuMapContainer) {

  let codexDiv = MenuMapContainer.querySelector('.army-codex-list');
    if (!codexDiv) {
        codexDiv = document.createElement('div');
        codexDiv.classList.add('army-codex-list');
        MenuMapContainer.appendChild(codexDiv);
		reorderMenuMapChildren();
		enforceMenuDisplayRules();
    }


        // Récupération des entités enrichies de l'armée A
        const selectedArmyA = loadFromLocalStorage('selectedArmyA', []);
        if (selectedArmyA.length === 0) {
            const emptyMessage = document.createElement('p');
            emptyMessage.textContent = 'Aucune entité trouvée dans votre armée.';
            emptyMessage.classList.add('codex-empty-message');
            codexDiv.appendChild(emptyMessage);
            return;
        }

        // Création du titre pour la liste des entités
        const heading = document.createElement('h2');
        heading.textContent = 'Vos Entités';
        heading.classList.add('codex-entity-title');
        codexDiv.appendChild(heading);

        // Remplir la div codex avec les noms, sprites, et détails des entités
selectedArmyA.forEach(entite => {
    createEntityCodex(entite, codexDiv);
});

        // Ajouter un événement pour afficher les détails de l'entité au clic
        document.querySelectorAll('.codex-entity-list').forEach(item => {
            item.addEventListener('click', (event) => {
                const entiteId = parseInt(event.currentTarget.id.split('_')[1], 10);
                EntityCodexDetails(entiteId);
            });
        });
    }
}

// Ajout d'un écouteur d'événement pour détecter le clic sur les éléments CodexEntityList
document.addEventListener('click', (event) => {
    const targetElement = event.target.closest('[id^="CodexEntityList_"]');
    if (targetElement) {
        const entiteId = parseInt(targetElement.id.split('_')[1], 10);
        EntityCodexDetails(entiteId, event.shiftKey); // ← important
    }
});

export function EntityCodexDetails(entiteId, shiftKey = false) {
	const armyCodex = document.querySelector('.army-codex-list');
    const enrichedArmyA = loadFromLocalStorage('selectedArmyA', []);
    const entite = enrichedArmyA.find(e => e.id === entiteId);
    if (!entite) return;

    const GameUiContainer = document.querySelector('.Game-UI');
    let MenuMapContainer = GameUiContainer.querySelector('.menu-map-container');

    if (!MenuMapContainer) {
        MenuMapContainer = document.createElement('div');
        MenuMapContainer.classList.add('menu-map-container');
        GameUiContainer.appendChild(MenuMapContainer);
    }

    const allCodex = Array.from(MenuMapContainer.querySelectorAll('.codex-entity-scan'));
    const codexForThisEntity = allCodex.filter(c => c.id === `codex-entity_${entiteId}`);
    const isAlreadyOpen = codexForThisEntity.length > 0;

    // ⇧ SHIFT + CLIC
    if (shiftKey) {
        if (isAlreadyOpen) {
            // Si déjà ouvert → ne rien faire
            return;
        }

        if (allCodex.length === 0) {
            // Aucun codex affiché → ShiftClic ne fait rien
            return;
        }

        if (allCodex.length === 1) {
            // Un seul codex affiché → passer en double vue
            allCodex[0].classList.remove('right', 'left');
            allCodex[0].classList.add('left');

            createCodexEntityScan(entite, MenuMapContainer, `codex-entity_${entiteId}`, 'right');
        }

        else if (allCodex.length === 2) {
            // Deux codex affichés → faire glisser le right en left et ajouter un nouveau right
            const leftCodex = allCodex.find(c => c.classList.contains('left'));
            const rightCodex = allCodex.find(c => c.classList.contains('right'));

            if (leftCodex) leftCodex.remove();
            if (rightCodex) {
                rightCodex.classList.remove('right');
                rightCodex.classList.add('left');
            }

            createCodexEntityScan(entite, MenuMapContainer, `codex-entity_${entiteId}`, 'right');
        }
   // Mise à jour des classes .dual-view army-codex-list

const codexNow = Array.from(MenuMapContainer.querySelectorAll('.codex-entity-scan'));

if (codexNow.length === 2) {
    codexNow.forEach(c => c.classList.add('dual-view'));
    if (armyCodex) armyCodex.classList.add('dual');
} else {
    codexNow.forEach(c => c.classList.remove('dual-view'));
    if (armyCodex) armyCodex.classList.remove('dual');
}

// Marquer tous les codex affichés comme actifs dans la liste
const allDisplayedCodex = Array.from(MenuMapContainer.querySelectorAll('.codex-entity-scan'));
document.querySelectorAll('.codex-entity-list').forEach(el => el.classList.remove('active'));
allDisplayedCodex.forEach(codex => {
    const id = codex.id.split('_')[1];
    const listItem = document.getElementById(`CodexEntityList_${id}`);
    if (listItem) listItem.classList.add('active');
});

        reorderMenuMapChildren();
        MenuContainerDisplayRules();
		enforceMenuDisplayRules();
        return;
    }

    // CLIC NORMAL (non-shift)
if (isAlreadyOpen) {
    closeEntityCodex(entiteId);
    closeArmyCodexList();

    MenuContainerDisplayRules();
    return;
}

    // Sinon : fermer tous les codex, puis ouvrir celui demandé
    closeEntityCodex();

    createCodexEntityScan(entite, MenuMapContainer, `codex-entity_${entiteId}`);
	
    requestAnimationFrame(() => {
        reorderMenuMapChildren();
        MenuContainerDisplayRules();
		enforceMenuDisplayRules();
    });

    const selected = document.getElementById(`CodexEntityList_${entiteId}`);
    if (selected) selected.classList.add('active');
}


export function createStuffDom(entite, codexEntityView) {
    console.group(`🧱 createStuffDom : ${entite.name} (ID: ${entite.id})`);

    const chargeCount = entite.stats?.charge || 0;
    console.log(`→ Nombre de slots prévus (charge) : ${chargeCount}`);
    const stuffData = entite.stuff || {};

    const entityEquipement = document.createElement('div');
    entityEquipement.className = 'entity-equipement';
    entityEquipement.id = `equipment-${entite.id}`;

for (let i = 1; i <= chargeCount; i++) {
    const slotKey = `slot${i}`;
    const slotId = `${slotKey}-${entite.id}`;
    const slot = document.createElement('div');
    slot.className = `stuff-slot container-${i}`;
    slot.id = slotId;

    const itemArray = stuffData[slotKey];
    const hasEquip = Array.isArray(itemArray) && itemArray.length > 0;

if (hasEquip) {
    const rawItemId = itemArray[0];
    const itemData = getItemDataById(rawItemId);

    console.log(`📦 ${slotKey} → équipé avec : ${rawItemId}`);

    if (itemData) {
        const qualityClass = `quality-${itemData.itemQuality ?? 0}`;
        const wrapper = document.createElement('div');
        wrapper.classList.add('stuff-item-wrapper', qualityClass);
        wrapper.dataset.stuffId = rawItemId;

        const itemImg = document.createElement('img');
        itemImg.src = itemData.itemAsset;
        itemImg.alt = itemData.displayName;
        itemImg.id = itemData.itemId;
        itemImg.classList.add('inventory-item-icon', itemData.functionName);
        itemImg.setAttribute('draggable', 'true');

        itemImg.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', itemData.itemId);
            e.dataTransfer.effectAllowed = 'move';
            itemImg.classList.add('using');
            console.log(`🚚 Drag depuis slot (createStuffDom) pour ${itemData.itemId}`);
        });

        itemImg.addEventListener('dragend', () => {
            itemImg.classList.remove('using');
        });

        wrapper.appendChild(itemImg);
        slot.appendChild(wrapper);
        slot.classList.add('equiped'); // ✅ Ajoute la classe si équipé

        console.log(`🎯 ${slotKey} DOM rempli avec ${itemData.displayName}`);
    } else {
        console.warn(`❌ ${slotKey} → AUCUN item trouvé avec l'ID ${rawItemId}`);
        slot.classList.remove('equiped'); // 🔁 Par sécurité si incohérence
    }
	
} else {
    console.log(`🕳️ ${slotKey} → slot vide`);
    slot.classList.remove('equiped'); // ✅ Supprime la classe si vide
}


    entityEquipement.appendChild(slot);
}


    codexEntityView.appendChild(entityEquipement);
    console.log(`→ DOM .entity-equipement injecté pour ${entite.name}`);

    console.groupEnd();

    requestAnimationFrame(() => {
		DropEquipementtoInventory();
        DclicSlottoInventory();
    });
}
function getItemDataById(equippedId) {
    let equippedItems = loadFromLocalStorage('equippedItems', {});

    // 🔧 Patch automatique si format tableau corrompu :
    if (Array.isArray(equippedItems)) {
        const patched = {};
        for (const item of equippedItems) {
            if (item && item.equippedId) patched[item.equippedId] = item;
        }
        equippedItems = patched;
        saveToLocalStorage('equippedItems', equippedItems);
        console.warn('⚠️ equippedItems était un tableau, patché en objet');
    }

    const cleanId = equippedId.replace(/^e/, ''); // "ei13-358845" → "i13-358845"
    const item = equippedItems[equippedId];

    if (!item) {
        console.warn(`🛑 getItemDataById → Aucune donnée trouvée pour itemId: ${equippedId} (nettoyé: ${cleanId})`);
    }

    return item;
}
function initStatRadar(canvas, graphValues, legendRoot) {
  if (!canvas) return;

  // ✅ si ré-init, on nettoie
  canvas._disposeRadar?.();

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // ✅ Canvas FIXE 300x300 (CSS + DPR)
  const CSS_SIZE = 300;
  const dpr = window.devicePixelRatio || 1;

   canvas.width = Math.round(CSS_SIZE * dpr);
  canvas.height = Math.round(CSS_SIZE * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // --- axes ---
  // ordre : Force (haut), Intelligence (bas-droite), Agilité (bas-gauche)
  const axisLabels = ["Force", "Intelligence", "Agilité"];
  const axisColors = ["#AC0000", "#0098FF", "#FFAE00"]; // couleurs du TEXTE uniquement

  const axisIcons = [
    { src: "/media/assets/ui/picto-strength.svg" },
    { src: "/media/assets/ui/picto-intel.svg" },
    { src: "/media/assets/ui/picto-agility.svg" },
  ];

  const axisAngles = [
    -Math.PI / 2,
    -Math.PI / 2 + (2 * Math.PI / 3),
    -Math.PI / 2 + (4 * Math.PI / 3),
  ];

  // ✅ traits axes neutres (plus de traits colorés)
  const AXIS_LINE_COLOR = "rgba(55,65,81,0.55)";

  // Offsets des labels (tes valeurs)
  const offsetByAxis = [
    { x: 0, y: 4 },     // Force
    { x: -16, y: 10 },  // Intelligence
    { x: 16, y: 10 },   // Agilité
  ];

  // --- datasets ---
  const datasetsConfig = [
    { key: "att", name: "Attaque",    stroke: "rgba(214,55,0,0.95)",  fill: "rgba(214,55,0,0.20)" },
    { key: "def", name: "Défense",    stroke: "rgba(0,0,184,0.95)",   fill: "rgba(0,0,184,0.20)" },
    { key: "uti", name: "Utilitaire", stroke: "rgba(163,0,211,0.95)", fill: "rgba(163,0,211,0.20)" },
  ];

  const categoryByKey = { att: "attaque", def: "defense", uti: "utilitaire" };
  const hiddenKeys = new Set();

  const safeNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  // ✅ IMPORTANT : ordre values aligné avec axes = [Force, Intelligence, Agilité]
  function buildDatasets() {
    return datasetsConfig.map((cfg) => {
      const cat = categoryByKey[cfg.key];

      const vFor = safeNum(graphValues?.force?.[cat]);
      const vInt = safeNum(graphValues?.intelligence?.[cat]);
      const vAgi = safeNum(graphValues?.agilite?.[cat]);

      return { ...cfg, values: [vFor, vInt, vAgi] };
    });
  }

  // --- pictos chargés ---
  let iconsReady = false;
  let iconsToLoad = axisIcons.length;

  axisIcons.forEach((icon) => {
    const img = new Image();
    img.src = icon.src;
    icon.img = img;

    const done = () => {
      iconsToLoad--;
      if (iconsToLoad <= 0) {
        iconsReady = true;
        drawRadar();
      }
    };

    img.onload = done;
    img.onerror = done;
  });

  function drawGrid(cx, cy, radius) {
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(55,65,81,0.35)";
    const steps = 5;

    for (let s = 1; s <= steps; s++) {
      const r = (radius * s) / steps;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const ang = axisAngles[i];
        const x = cx + Math.cos(ang) * r;
        const y = cy + Math.sin(ang) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawAxes(cx, cy, radius) {
    ctx.save();
    ctx.lineWidth = 1.4;

    const labelRadius = radius * 1.25;
    const iconSize = 20;
    const padding = 6;

    ctx.font = '12px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";

    for (let i = 0; i < 3; i++) {
      const ang = axisAngles[i];
      const label = axisLabels[i];
      const off = offsetByAxis[i] || { x: 0, y: 0 };

      // 1) Axe (NEUTRE)
      const x = cx + Math.cos(ang) * radius;
      const y = cy + Math.sin(ang) * radius;

      ctx.beginPath();
      ctx.strokeStyle = AXIS_LINE_COLOR;
      ctx.moveTo(cx, cy);
      ctx.lineTo(x, y);
      ctx.stroke();

      // 2) Label + picto
      let lx = cx + Math.cos(ang) * labelRadius + off.x;
      let ly = cy + Math.sin(ang) * labelRadius + off.y;

      let textX = lx;
      const textY = ly;

      if (iconsReady) {
        const textWidth = ctx.measureText(label).width;
        const totalWidth = iconSize + padding + textWidth;

        const startX = lx - totalWidth / 2;

        const ix = startX;
        const iy = ly - iconSize / 2;
        ctx.drawImage(axisIcons[i].img, ix, iy, iconSize, iconSize);

        textX = startX + iconSize + padding;
      } else {
        const textWidth = ctx.measureText(label).width;
        textX = lx - textWidth / 2;
      }

      ctx.fillStyle = axisColors[i];
      ctx.fillText(label, textX, textY);
    }

    ctx.restore();
  }

  function drawDataset(cx, cy, radius, dataset, globalMax) {
    const valuesNorm = dataset.values.map((v) => {
      const safe = Math.max(0, safeNum(v));
      return globalMax > 0 ? safe / globalMax : 0;
    });

    ctx.save();
    ctx.beginPath();

    for (let i = 0; i < 3; i++) {
      const r = radius * valuesNorm[i];
      const ang = axisAngles[i];
      const x = cx + Math.cos(ang) * r;
      const y = cy + Math.sin(ang) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    ctx.closePath();
    ctx.fillStyle = dataset.fill;
    ctx.strokeStyle = dataset.stroke;
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();

    for (let i = 0; i < 3; i++) {
      const r = radius * valuesNorm[i];
      const ang = axisAngles[i];
      const x = cx + Math.cos(ang) * r;
      const y = cy + Math.sin(ang) * r;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = dataset.stroke;
      ctx.fill();
    }

    ctx.restore();
  }

  // ✅ centrage vertical réel : on calcule la bbox (grille + labels) et on centre dans 300px
  function computeCyForCenteredBBox({ h, radius, labelRadius, iconSize, fontSize, pad }) {
    const blockHalf = Math.max(iconSize / 2, fontSize / 2);

    // extents constants (sans cy) :
    // - radar triangle/grille : y min = -radius (Force en haut), y max = +0.5*radius (axes bas à sin=0.5)
    let topConst = -radius;
    let bottomConst = 0.5 * radius;

    for (let i = 0; i < 3; i++) {
      const ang = axisAngles[i];
      const offY = (offsetByAxis[i]?.y ?? 0);
      const base = Math.sin(ang) * labelRadius + offY;
      topConst = Math.min(topConst, base - blockHalf);
      bottomConst = Math.max(bottomConst, base + blockHalf);
    }

    // bboxMid = cy + (topConst+bottomConst)/2
    const bboxMidConst = (topConst + bottomConst) / 2;
    let cy = (h / 2) - bboxMidConst;

    // clamp anti-coupe (pad)
    const minCy = pad - topConst;
    const maxCy = (h - pad) - bottomConst;
    cy = Math.max(minCy, Math.min(maxCy, cy));

    return cy;
  }

  function drawRadar() {
    const w = CSS_SIZE;
    const h = CSS_SIZE;

    ctx.clearRect(0, 0, w, h);

    const radius = Math.min(w, h) * 0.30;
    const labelRadius = radius * 1.25;

    const cx = w / 2;

    // ✅ centrage auto (au lieu de pousser en haut/bas)
    const cy = computeCyForCenteredBBox({
      h,
      radius,
      labelRadius,
      iconSize: 20,
      fontSize: 12,
      pad: 10
    });

    const datasets = buildDatasets();

    let globalMax = 0;
    let anyVisible = false;

    datasets.forEach((ds) => {
      if (hiddenKeys.has(ds.key)) return;
      anyVisible = true;
      ds.values.forEach((v) => { if (v > globalMax) globalMax = v; });
    });

    if (!anyVisible || globalMax <= 0) globalMax = 1;

    drawGrid(cx, cy, radius);

    datasets.forEach((ds) => {
      if (!hiddenKeys.has(ds.key)) drawDataset(cx, cy, radius, ds, globalMax);
    });

    drawAxes(cx, cy, radius);
  }

  // --- listeners légende (cleanup) ---
  const ac = new AbortController();
  const { signal } = ac;

  if (legendRoot) {
    legendRoot.querySelectorAll(".graph-legend-item").forEach((btn) => {
      const key = btn.dataset.key;
      btn.addEventListener("click", () => {
        if (!key) return;
        if (hiddenKeys.has(key)) {
          hiddenKeys.delete(key);
          btn.classList.add("active");
        } else {
          hiddenKeys.add(key);
          btn.classList.remove("active");
        }
        drawRadar();
      }, { signal });
    });
  }

  // rendu initial
  drawRadar();

  // dispose
  canvas._disposeRadar = () => ac.abort();
}
