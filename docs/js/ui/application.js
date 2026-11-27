import { ensureGameShell, layoutGameShell, scheduleGameLayout } from './viewport.js';
import {
  applyCombatProfileView, createMovementDisplay,
} from "../rendering/hud.js";
import { ensureMovementState } from "../board/deployment.js";
import { gameStorage as localStorage } from "../storage/sessionStorage.js";
import { cachedResourceUrl } from '../data/loaderList.js';
import {
  resetFullGame,
  loadFromLocalStorage,
  saveToLocalStorage,
  setCurrentLevel,
  purgeStatPreview,
  loadPlayerInfo,
  savePlayerInfo,
} from "../storage/gameStorage.js";
import { assertEntityType, isLord, getSafe } from "../entities/rules.js";
import { generateUniqueID, entitesNestUp, enrichEntityStats } from "../entities/runtime.js";
import { hideCombatAttackControlPanel, createEntityAttackDisplay } from "./attacks.js";
import { createSoundControls } from "../rendering/sound.js";
import { generateArmyA } from "../entities/armies.js";
import { clearItemDescriptions, setLastDraggedItemId } from '../items/itemManager.js';
import { resetParallaxView, dismissGamePopups } from "./display.js";
import {
  getBattleLogsIndex,
  renderBattleBookList,
  renderBattleBookReport,
  clearAllBattleLogs,
} from "../combat/journal.js";
import { endDragHelperCleanup } from "./drag.js";
import { closeAttackEssenceSocketPopups } from "../items/essences.js";
import { getStageAccess, refreshStageAccess, requireSafeMenuAccess } from "../app/state.js";
import { createBattleSatchelView, PlayerInventory, MapShop } from './inventory.js';
import {
  createEntityPowerValue, createUmbraBlock,
} from "./statistics/components.js";
import { PlayerEssenceur } from "./essences.js";
import { PlayerArmyCodex } from "./codex/index.js";
import { updateExperienceDisplay } from "./codex/stats.js";

// Application shell, starter selection, settings and stage menu lifecycle.

function detectPageReload() {
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

function markPageLoaded() {
    sessionStorage.setItem('pageAlreadyLoaded', 'true');
}

const isTouchScreen = () => window.matchMedia('(pointer: coarse)').matches;
let landscapeLockPending = false;
let landscapeLockAttempted = false;
async function requestLandscapeLock() {
    if (!isTouchScreen() || landscapeLockPending || typeof screen.orientation?.lock !== 'function') return;
    landscapeLockPending = true;
    landscapeLockAttempted = true;
    try {
        if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
            await document.documentElement.requestFullscreen();
        }
        await screen.orientation.lock('landscape');
    } catch {
        // CSS rotation already displays the landscape frame when native locking is unavailable.
    } finally {
        landscapeLockPending = false;
        scheduleGameLayout();
    }
}

function createGameContainer() {
    document.body.classList.add('game-viewport');
    const shell = ensureGameShell();
    let gameWindows = document.getElementById('game-windows');
    if (!gameWindows) {
        gameWindows = document.createElement('div');
        gameWindows.id = 'game-windows';
    }
    if (gameWindows.parentElement !== shell) shell.prepend(gameWindows);
    let gameHelper = document.querySelector('.Game-helper');
    if (!gameHelper) {
        gameHelper = document.createElement('div');
        gameHelper.className = 'Game-helper';
    }
    if (gameHelper.parentElement !== shell) shell.append(gameHelper);

    let gameContainer = gameWindows.querySelector(':scope > #game-container');

    if (!gameContainer) {
        const misplacedContainer = document.getElementById('game-container');

        if (misplacedContainer) {
            gameWindows.appendChild(misplacedContainer);
            gameContainer = misplacedContainer;
        } else {
            gameContainer = document.createElement('div');
            gameContainer.id = 'game-container';
            gameWindows.appendChild(gameContainer);
        }
    }

    // Une seule worldmap, uniquement dans #game-container.
    let worldmap = gameContainer.querySelector(':scope > .worldmap');
    if (!worldmap) {
        worldmap = document.createElement('img');
        worldmap.src = cachedResourceUrl('./media/worldmap.jpg');
        worldmap.classList.add('worldmap');
        gameContainer.prepend(worldmap);
    }

    layoutGameShell();
    return gameContainer;
}

function getOrCreateWorldMapID() {
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

const gameUI = document.querySelector('.Game-UI');

function GameUi() {

    if (loadFromLocalStorage('playerInfo.json', {}).battleSlotCount == null) savePlayerInfo(loadPlayerInfo());

	const currentGameData = JSON.parse(localStorage.getItem('currentGameData')) || {};
	const playerExperience = currentGameData.experience || 0;
    const GameContainer = document.querySelector('#game-container');
    if (!GameContainer) {
        console.error("⚠️ Erreur : '#game-container' est introuvable !");
        return;
    }

    // Vérifier ou créer .Game-UI dans son parent canonique.
    let GameUI = GameContainer.querySelector(':scope > .Game-UI');

    if (!GameUI) {
        const misplacedGameUI = document.querySelector('.Game-UI');

        if (misplacedGameUI) {
            GameContainer.appendChild(misplacedGameUI);
            GameUI = misplacedGameUI;
        } else {
            GameUI = document.createElement('div');
            GameUI.className = 'Game-UI';
            GameContainer.appendChild(GameUI);
        }
    }

    // Supprimer les anciens éléments pour éviter la duplication
    const oldScoringUI = GameUI.querySelector('.scoring-ui');
    const adminResetLevelButton = document.getElementById('admin-reset-level-button');
    if (oldScoringUI) oldScoringUI.remove();

    // Création du scoring
    const scoringUiDiv = document.createElement('div');
    scoringUiDiv.className = 'scoring-ui';

	const xpPic = document.createElement('div');
    xpPic.className = 'scoring-experience';

    const xpimg1 = document.createElement('img');
    xpimg1.src = cachedResourceUrl('./media/assets/ui/experience-01.png');
    xpimg1.className = 'experience-01';

    const xpimg2 = document.createElement('img');
    xpimg2.src = cachedResourceUrl('./media/assets/ui/experience-02.png');
    xpimg2.className = 'experience-02';

    const scoringDiv = document.createElement('div');
    scoringDiv.className = 'scoring';
    scoringDiv.id = 'score';
    scoringDiv.textContent = `Experience : ${playerExperience}`;

    xpPic.appendChild(xpimg1);
    xpPic.appendChild(xpimg2);
    scoringUiDiv.appendChild(xpPic);
    scoringUiDiv.appendChild(scoringDiv);
    if (adminResetLevelButton) scoringUiDiv.appendChild(adminResetLevelButton);
    GameUI.appendChild(scoringUiDiv);
	createDayCounter(GameUI);

    // Groupe unique des contrôles de vue : voir les hex, masquer les hex,
    // restaurer la perspective.
    let viewControls = GameUI.querySelector(':scope > .view-controls');
    if (!viewControls) {
        viewControls = document.createElement('div');
        viewControls.className = 'view-controls';
        GameUI.appendChild(viewControls);
    }

    // Garantit qu'il n'existe qu'un seul groupe, sous .Game-UI.
    document.querySelectorAll('.view-controls').forEach(other => {
        if (other === viewControls) return;

        other.querySelectorAll('.seehex-button, .hidehex-button, .reset-view-button, .battle-log-button')
            .forEach(control => {
                const className = control.classList[0];
                if (!viewControls.querySelector(`.${className}`)) {
                    viewControls.appendChild(control);
                }
            });

        other.remove();
    });

    if (!viewControls.querySelector('.reset-view-button')) {
        createResetViewButton(viewControls);
    }

    // Le reset de perspective doit toujours être tout à droite.
    const resetViewControl = viewControls.querySelector('.reset-view-button');
    if (resetViewControl) {
        viewControls.appendChild(resetViewControl);
    }

    // ✅ Créer menu-player-icons si absent
    let menuIcons = GameUI.querySelector('.menu-player-icons');
    if (!menuIcons) {
        menuIcons = document.createElement('div');
        menuIcons.className = 'menu-player-icons';
        GameUI.appendChild(menuIcons);
    }

    // Settings share the responsive shell and survive combat UI reconstruction.
if (
    !document.querySelector('#game-shell > .master-menu > .settings-icon') ||
    !document.querySelector('#game-shell > .master-menu > .settings-menu')
) {
    createSettingsMenu();
}
    syncStagePlayerInterface();
    updateExperienceDisplay();
}

const restrictedMenuSelectors = '.inventory-interface, .shop-interface, .essenceur-interface, .army-codex-list, .codex-entity-scan, #battle-book-window, .attack-essence-popup';

function closeStagePlayerMenus() {
    closeAttackEssenceSocketPopups();
    clearItemDescriptions();
    dismissGamePopups();
    endDragHelperCleanup();
    setLastDraggedItemId(null);
    document.querySelectorAll(`${restrictedMenuSelectors}, .stat-hover`).forEach(node => node.remove());
    document.querySelectorAll('.menu-map-container:empty').forEach(node => node.remove());
}

function syncStagePlayerInterface() {
    const access = getStageAccess();
    const host = document.querySelector('.Game-UI');
    const existingBag = document.querySelector('.battle-satchel--combat');
    const bagWasRevealedInStage = Boolean(existingBag && access.inStage);
    const showBag = host && !access.unavailable && !document.getElementById('loadingScreen')
        && (access.battleActive || bagWasRevealedInStage);
    if (showBag) {
        const bag = existingBag || createBattleSatchelView(true);
        if (bag.parentElement !== host) host.appendChild(bag);
        if (!existingBag) bag.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 2000, easing: 'ease' });
    } else existingBag?.remove();
    if (!host) return;
    let icons = host.querySelector('.menu-player-icons');
    if (!access.menusAllowed) {
        icons?.remove();
        closeStagePlayerMenus();
    } else {
        if (!icons) {
            icons = document.createElement('div');
            icons.className = 'menu-player-icons';
            host.appendChild(icons);
        }
        if (!icons.querySelector('.shop-icon')) MapShop(icons);
        if (!icons.querySelector('.player-inventory-icon')) PlayerInventory(icons);
        if (!icons.querySelector('.essenceur-icon')) PlayerEssenceur(icons);
        if (!icons.querySelector('.army-codex-icon')) PlayerArmyCodex(icons);
        if (!icons.querySelector('.battle-book-icon')) createBattleBook(icons);
    }
}

function createResetViewButton(parent) {
    const button = document.createElement('div');

   button.className = 'reset-view-button picto-ui';
    button.style.opacity = '0';
    button.style.transition = 'opacity 180ms ease';
    button.style.pointerEvents = 'none';
    const resetView = () => resetParallaxView();
    button.addEventListener('click', resetView);
    button.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            resetView();
        }
    });

    parent.appendChild(button);
}

function createBattleBook(menuIcons) {
    if (!getStageAccess().menusAllowed) return;
      const battleBookIcon = document.createElement('img');
    battleBookIcon.className = 'battle-book-icon';
    battleBookIcon.id = 'battle-book-display';
    battleBookIcon.src = cachedResourceUrl('./media/assets/ui/picto-battle-book.svg');
    battleBookIcon.alt = 'journal des combats';

    menuIcons.appendChild(battleBookIcon);

    battleBookIcon.addEventListener('click', () => {
        toggleBattleBookWindow();
    });
}

function toggleBattleBookWindow() {
    let existingWindow = document.getElementById('battle-book-window');

    if (existingWindow) {
        existingWindow.remove();
        return;
    }

    createBattleBookWindow({
        openLastBattleLog: true
    });
}

function createBattleBookWindow(options = {}) {
    if (!requireSafeMenuAccess()) return;
    const {
        openLastBattleLog = false
    } = options;

    const gameUI = document.querySelector('.Game-helper');

    if (!gameUI) {
        console.warn("Aucune div .Game-UI trouvée pour BattleBook.");
        return;
    }

    const battleBookWindow = document.createElement('div');
    battleBookWindow.id = 'battle-book-window';
    battleBookWindow.className = 'battle-book-window';

    battleBookWindow.innerHTML = `
        <span class="close-helper" id="close-battle-book-button">X</span>

        <div class="battle-book-content">
            <div class="battle-book-left-column">
                <div class="battle-book-title">Journaux</div>
                <div class="battle-book-list"></div>
            </div>

            <div class="battle-book-right-column">
                <div class="battle-book-title">Rapport</div>
                <div class="battle-book-report-content">
                    Sélectionnez un journal.
                </div>
            </div>
        </div>
    `;

    gameUI.appendChild(battleBookWindow);

    document
        .getElementById('close-battle-book-button')
        .addEventListener('click', () => {
            battleBookWindow.remove();
        });

    renderBattleBookList();

    if (openLastBattleLog) {
        openLastBattleLogReport();
    }
}

function openLastBattleLogReport() {
    const index = getBattleLogsIndex();

    if (!index?.logs?.length) return;

    const lastLog = index.logs[index.logs.length - 1];

    renderBattleBookReport(lastLog.key);

    const lastButton = document.querySelector(
        `.battle-book-log-item[data-log-key="${lastLog.key}"]`
    );

    if (lastButton) {
        lastButton.classList.add('active');
    }
}

function createDayCounter(GameUI) {
    const currentDay = Number.parseInt(localStorage.getItem('gameDay'), 10) || 1;

    const dayCounters = [...GameUI.querySelectorAll(':scope > .day-counter')];
    const dayCounter = dayCounters[0] || document.createElement('div');
    dayCounter.className = 'day-counter';
    dayCounters.slice(1).forEach((element) => element.remove());
    dayCounter.replaceChildren();

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

const updateNicknameInBrowser = (id, nickname) => {
    // Trouver l'entité dans selectedArmyA
    const selectedArmy = Array.isArray(window.selectedArmyA)
        ? window.selectedArmyA
        : [];
    const entity = selectedArmy.find(ent => ent.id === id);
    if (entity) {
        // Mettre à jour uniquement le nickname
        entity.nickname = nickname;
        console.log(`Surnom mis à jour : ${entity.name} est maintenant "${entity.nickname}"`, entity);

        // Sauvegarder selectedArmyA directement dans le localStorage
        saveToLocalStorage('selectedArmyA', selectedArmy);

        console.log('Nickname mis à jour et sauvegardé dans le localStorage.');
    } else {
        console.warn(`Aucune entité trouvée avec l'ID ${id}.`);
    }
};

function EntityNewGameStarter(entityIds, containerId) {
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
    const paragraph = document.createElement('p');
    paragraph.className = 'starter-selection-title';
    paragraph.textContent = 'Choisissez une Entité';
    entitylootContainer.appendChild(paragraph);

    let selectedCard = null;
    let validated = false;
    const pinStarter = wrapper => {
        if (validated) return;
        selectedCard = wrapper;
        entitylootContainer.querySelectorAll('.entity-loot-colomne').forEach(card => {
            const selected = card === wrapper;
            card.classList.toggle('is-selected', selected);
            card.classList.remove('is-previewed');
            card.querySelector('.entity-loot').setAttribute('aria-pressed', String(selected));
            card.querySelector('.starter-select-button').hidden = !selected;
        });
    };
    const validateStarter = entity => {
        if (validated || !entitylootContainer.isConnected) return;
        validated = true;
        entitylootContainer.querySelectorAll('.starter-select-button').forEach(button => { button.disabled = true; });
        try {
            selectStarterEntity(entity);
            entitylootContainer.remove();
            document.querySelectorAll('.stat-hover').forEach(helper => helper.remove());
            if (iconMenu) iconMenu.style.display = 'block';
        } catch (error) {
            validated = false;
            entitylootContainer.querySelectorAll('.starter-select-button').forEach(button => { button.disabled = false; });
            paragraph.textContent = "La sélection n'a pas pu être enregistrée. Réessayez.";
            console.error('[Starter] Échec de la sélection.', error);
        }
    };

    entityIds.forEach((id, index) => {
        const template = entitesNestUp.find(e => e.id === id);
        if (!template) {
            console.warn(`Entité avec l'ID ${id} introuvable dans entitesNestUp.`);
            return;
        }
        const entity = enrichEntityStats(structuredClone(template));
        // Créer la structure de chaque entité
        const entityLootWrapper = document.createElement('div');
        entityLootWrapper.id = `entity-loot-${index + 1}`;
		entityLootWrapper.className = `entity-loot-colomne`;

        const entityDiv = document.createElement('div');
        entityDiv.className = 'entity-loot';
        applyCombatProfileView(entityDiv, entity);
        entityDiv.id = `entity-loot_${entity.id}`;
        entityDiv.tabIndex = 0;
        entityDiv.setAttribute('role', 'button');
        entityDiv.setAttribute('aria-label', `Consulter ${entity.name}`);
        entityDiv.setAttribute('aria-pressed', 'false');
        entityDiv.setAttribute('aria-controls', `entity-detail_${entity.id}`);

        const entityImgContainer = document.createElement('div');
        entityImgContainer.className = 'entityLoot-img-container';
        entityDiv.appendChild(entityImgContainer);

       const img = document.createElement('div');
		img.style.backgroundImage = `url('${entity.sprite}')`;
		img.className = `entite-loot-img ${entity.class}`;
		img.dataset.dropable = 'true';
		img.dataset.entityId = entity.id;
		img.style.top = 'auto';

        const nameSpan = document.createElement('h2');
        nameSpan.className = 'entite-loot-name';
        nameSpan.textContent = entity.name;
        nameSpan.appendChild(createEntityPowerValue(entity));

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

createUmbraBlock(entityStatsDiv, '', () => getSafe(entity, "physicalDamage", 0), entity, "physicalDamage");
createUmbraBlock(entityStatsDiv, '', () => getSafe(entity, "magicalDamage", 0), entity, "magicalDamage");
createUmbraBlock(entityStatsDiv, '', () => getSafe(entity, "piercingDamage", 0), entity, "piercingDamage");
createUmbraBlock(entityStatsDiv, '', () => getSafe(entity, "physicalResistance", 0), entity, "physicalResistance");
createUmbraBlock(entityStatsDiv, '', () => getSafe(entity, "magicalResistance", 0), entity, "magicalResistance");

       // Création du bloc pour les HP
// Affichage des HP
const hpDiv = document.createElement('div');
hpDiv.setAttribute('data-stat', 'HP');
hpDiv.setAttribute('data-entity-id', entity.id);
hpDiv.textContent = `HP : ${getSafe(entity, "HP.max", 0)}`;
hpDiv.className = 'entite-stat HP-starter';
entityStatsDiv.appendChild(hpDiv);

const extraLifeData = entity.stats?.extraLife;

if (extraLifeData && typeof extraLifeData === "object") {
  createUmbraBlock(entityStatsDiv, "Vie Bonus :", () => {
    const extraLife = entity.stats?.extraLife;

    if (extraLife && typeof extraLife === "object") {
      const current = extraLife.current;
      const max = getSafe(entity, "extraLife.max", extraLife.max);

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

    return null;
  }, entity, "extraLife");
}

// Création du bloc pour la vitesse
const speedDiv = document.createElement('div');
const speedValue = getSafe(entity, "speed", null);
speedDiv.textContent = speedValue != null
    ? `Vitesse : ${(speedValue / 1000).toFixed(2)}s`
    : 'Vitesse : —';
speedDiv.className = 'entite-stat';
entityStatsDiv.appendChild(speedDiv);

ensureMovementState(entity);

const movementDiv = document.createElement('div');
movementDiv.className = 'entite-stat movement-ingame-stat';
movementDiv.innerHTML = `Déplacements : `;

const movementValue = createMovementDisplay(entity);
movementDiv.appendChild(movementValue);

entityStatsDiv.appendChild(movementDiv);

        entityDetailsDiv.appendChild(entityStatsDiv);
        entityDetailDiv.appendChild(entityDetailsDiv);

        entityDetailDiv.appendChild(createEntityAttackDisplay(entity, { presentation: 'starter' }));

        const selectButton = document.createElement('button');
        selectButton.type = 'button';
        selectButton.className = 'starter-select-button';
        selectButton.textContent = 'Sélectionner';
        selectButton.setAttribute('aria-label', `Sélectionner ${entity.name}`);
        selectButton.hidden = true;
        selectButton.addEventListener('click', event => {
            event.stopPropagation();
            validateStarter(template);
        });
        entityDetailDiv.append(selectButton);

        // Ajouter les détails de l'entité au wrapper principal
        entityLootWrapper.appendChild(entityDetailDiv);
        entitylootContainer.appendChild(entityLootWrapper);
        entityDiv.addEventListener('click', () => pinStarter(entityLootWrapper));
        entityDiv.addEventListener('dblclick', event => {
            event.preventDefault();
            event.stopPropagation();
            validateStarter(template);
        });
        entityDiv.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            pinStarter(entityLootWrapper);
        });
        entityLootWrapper.addEventListener('mouseenter', () => {
            if (!selectedCard) entityLootWrapper.classList.add('is-previewed');
        });
        entityLootWrapper.addEventListener('mouseleave', () => {
            entityLootWrapper.classList.remove('is-previewed');
        });
    });
}

function initializeArmyConfig() {
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
    let defaultEntitySerials = [11,1];

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

function selectStarterEntity(entity) {
    const armyConfig = {
        lordId: null,
        lordNickname: null,
        unitIds: [],
        unitNicknames: {},
        experience: 0,
    };
    assertEntityType(entity);
    if (isLord(entity)) armyConfig.lordId = entity.id;
    else armyConfig.unitIds.push(entity.id);

    const army = generateArmyA(armyConfig, entitesNestUp);
    saveToLocalStorage('armyAConfig', armyConfig);
    saveToLocalStorage('selectedArmyA', army);
    window.selectedArmyA = army;
}

function ResetGameStages() {
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

function ResetEntitesB() {
    // Supprimer la clé ArmyB du local storage
    localStorage.removeItem('ArmyB');

    // Recréer une structure vide pour ArmyB
    const emptyArmyBData = { armies: {} };
    saveToLocalStorage('ArmyB', emptyArmyBData);

    console.log('🔄 Toutes les armées B ont été réinitialisées et le cache a été nettoyé.');
}

function ResetXp() {
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

function ResetGameDay() {
    localStorage.setItem('gameDay', 1);
    console.log('🔄 Compteur de jour réinitialisé à 1.');
}

function playLoadingAnimation(type) {
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
    ensureGameShell().appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('fade-in'));

    const baseDuration = (type === 'reset') ? 3000 : 9000;

    setTimeout(() => overlay.classList.remove('fade-in'), baseDuration);
    setTimeout(() => overlay.remove(), baseDuration + 3000);
}

function createSkullElement() {
    const skull = document.createElement('div');
    skull.id = 'skull-animation';
    ensureGameShell().appendChild(skull);

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
    ensureGameShell().appendChild(abandonMsg);

    setTimeout(() => abandonMsg.classList.add('fade-in'), delay);
    setTimeout(() => abandonMsg.classList.remove('fade-in'), delay + 2500);
    setTimeout(() => abandonMsg.remove(), delay + 4500);
}

function createSettingsMenu() {
    const gameUI = document.querySelector('.Game-UI');
    if (!gameUI) {
        console.error("⚠️ Erreur : '.Game-UI' n'existe pas encore dans le DOM !");
        return;
    }

    let masterMenu = document.querySelector('#game-shell > .master-menu');
    if (!masterMenu) {
        masterMenu = document.createElement('div');
        masterMenu.className = 'master-menu';
        ensureGameShell().appendChild(masterMenu);
    }

    let settingsIcon = masterMenu.querySelector(':scope > .settings-icon');
    if (!settingsIcon) {
        settingsIcon = document.createElement('div');
        settingsIcon.className = 'settings-icon';
        masterMenu.appendChild(settingsIcon);
    }

    let settingsMenu = masterMenu.querySelector(':scope > .settings-menu');

    if (!settingsMenu) {
        // Nettoyage défensif d'un éventuel ancien menu encore rattaché ailleurs.
        document.querySelectorAll('.settings-menu').forEach(menu => {
            if (menu !== settingsMenu && menu.parentElement !== gameUI) {
                menu.remove();
            }
        });

        settingsMenu = document.createElement('div');
        settingsMenu.className = 'settings-menu';
        settingsMenu.style.display = 'none';

        const closeButton = document.createElement('div');
        closeButton.className = 'settings-menu-close';
        closeButton.innerText = '×';
        closeButton.onclick = () => {
            const currentMenu = document.querySelector('#game-shell > .master-menu > .settings-menu');
            if (currentMenu) currentMenu.style.display = 'none';
        };

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
        masterMenu.appendChild(settingsMenu);
    }

    // Toujours rebrancher le clic sur le menu ACTUEL. Ainsi, si .Game-UI a été
    // détruite/recréée pendant le combat, l'icône ne conserve jamais une
    // référence vers un ancien settingsMenu détaché du DOM.
    settingsIcon.onclick = () => {
    closeAttackEssenceSocketPopups();
    let currentMenu = document.querySelector('#game-shell > .master-menu > .settings-menu');

if (!currentMenu) {
    createSettingsMenu();
    currentMenu = document.querySelector('#game-shell > .master-menu > .settings-menu');
}

        if (!currentMenu) {
            console.warn("⚠️ settings-menu introuvable au clic sur settings-icon.");
            return;
        }

        const isHidden =
            currentMenu.style.display === 'none' ||
            getComputedStyle(currentMenu).display === 'none';

        currentMenu.style.display = isHidden ? 'flex' : 'none';
    };
}

export {
  detectPageReload,
  markPageLoaded,
  createGameContainer,
  getOrCreateWorldMapID,
  GameUi,
  closeStagePlayerMenus,
  syncStagePlayerInterface,
  createResetViewButton,
  createBattleBook,
  EntityNewGameStarter,
  initializeArmyConfig,
  ResetGameStages,
  ResetEntitesB,
  ResetXp,
  ResetGameDay,
  playLoadingAnimation,
  triggerAnimation,
};

// Register shared handlers once, after the complete module graph is initialized.
let initialized = false;
export function initializePlayerMenus() {
  if (initialized) return;
  initialized = true;
  window.addEventListener('resize', scheduleGameLayout);
  window.addEventListener('orientationchange', scheduleGameLayout);
  window.addEventListener('pageshow', scheduleGameLayout);
  screen.orientation?.addEventListener('change', scheduleGameLayout);
  document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement) landscapeLockAttempted = false;
      scheduleGameLayout();
  });
  document.addEventListener('click', event => {
      if (!landscapeLockAttempted) void requestLandscapeLock();
  }, { capture: true });
  window.visualViewport?.addEventListener('resize', scheduleGameLayout);
  window.visualViewport?.addEventListener('scroll', scheduleGameLayout);
  window.updateExperienceDisplay = updateExperienceDisplay;

  window.addEventListener('stageInterfaceClosing', () => {
      closeStagePlayerMenus();
      hideCombatAttackControlPanel();
      document.querySelector('.battle-satchel--combat')?.remove();
      document.querySelectorAll('.entite-details').forEach(node => node.remove());
      document.querySelectorAll('.settings-menu').forEach(node => { node.style.display = 'none'; });
  });

  window.addEventListener('stageAccessChanged', syncStagePlayerInterface);

  window.addEventListener('stageBattleControlsReady', syncStagePlayerInterface);

  window.addEventListener('battleStarted', syncStagePlayerInterface);

  window.addEventListener('battleResolved', refreshStageAccess);

  window.addEventListener('battleStopped', () => queueMicrotask(refreshStageAccess));

  for (const name of ['click', 'dblclick', 'dragstart', 'drop', 'change', 'keydown']) {
      document.addEventListener(name, event => {
          if (getStageAccess().menusAllowed || !event.target.closest?.(restrictedMenuSelectors)) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          closeStagePlayerMenus();
          requireSafeMenuAccess();
      }, true);
  }

  window.updateNicknameInBrowser = updateNicknameInBrowser;

  // WebKit mobile needs a click listener on body to emit clicks for delegated
  // controls such as the Codex rows. Reuse the settings handler for that root.
  document.body.addEventListener('click', function (event) {
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

              let masterMenu = document.querySelector('#game-shell > .master-menu');
              if (!masterMenu) {
                  masterMenu = document.createElement('div');
                  masterMenu.className = 'master-menu';
                  ensureGameShell().appendChild(masterMenu);
              }

              const confirmationBackdrop = document.createElement('div');
              confirmationBackdrop.id = 'confirmation-backdrop';
              masterMenu.appendChild(confirmationBackdrop);

              setTimeout(() => {
                  confirmationBackdrop.classList.add('visible');
              }, 500);

              masterMenu.appendChild(confirmationModal);

              requestAnimationFrame(() => {
        document.getElementById('confirm-new-game')?.addEventListener('click', function () {
      console.log("Nouvelle partie confirmée.");

      clearAllBattleLogs();
      resetFullGame();

      confirmationModal.remove();
      confirmationBackdrop.remove();

      playLoadingAnimation('reset');
  });

                  document.getElementById('cancel-new-game')?.addEventListener('click', function () {
                      console.log("Nouvelle partie annulée.");
                      confirmationModal.remove();
                      confirmationBackdrop.remove();
                  });
              });

         } else {
      console.log("Aucune armée détectée. Démarrage direct.");

      clearAllBattleLogs();
      initializeArmyConfig();
  }
      }
  });
}
