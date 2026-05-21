import { updateEntiteClasses, logPositionsAndAnalyze, observeRoleChanges, updateGlobalRoleSbire, TraitementRolesSbires } from './load-entity.js';
import { entites, injectSavedEntities, syncExtraLifeCurrentFromRegen, updateExtraLifeRegenOrders, updateEternalLifeRegenOrders, syncEternalLifeCurrentFromRegen } from './entites.js';
import { entiteCamp, initFightEntites } from './fight.js';
import { getStyleProperties, calculerPointsHexagone, genererSvgHexagone, setupBoard, StageLoading } from './board.js';
import { createEntiteInDOM } from './createEntity.js';
import { HideGenerateLevelButton, toggleScanEntityListener, HexButtonVisibility, parallaxEffect, loadStageAnimation, helperDisplay, isRegenKey, toNonNegInt } from './ui.js';
import { screenLoadOptions } from './loaderList.js';
import { saveCurrentGameData, loadFromLocalStorage, saveToLocalStorage, getOrCreateGameID, setCurrentLevel, purgeStatPreview} from './GameStorage.js';
import { startGame, StopGame, stopAllIntervals, setOrderSide } from './gameState.js';
import { launchOrderCycleForSide } from './BattleOrder.js';

let selectedBiome = null;
let selectedDifficulty = null;

// ✅ Chargement du jeu 
export async function launchLevel({ biome, difficulty, levelId }) {
    if (levelId) {
        setCurrentLevel(levelId); // 🔥 assure que currentLevel correspond au vrai niveau lancé
    }

    updateSelectedBiome(biome);
    updateSelectedDifficulty(difficulty);
    await loadGame();
}
function updateSelectedBiome(biome) {
    const gameStages = loadFromLocalStorage('GameStages', { stages: [] });
    const existingStage = gameStages.stages.find(stage => stage.biome_serial === biome);
    selectedBiome = existingStage ? existingStage.biome_serial : biome;
    document.dispatchEvent(new CustomEvent('biomeUpdated', { detail: selectedBiome }));
}

function updateSelectedDifficulty(difficulty) {
    const gameStages = loadFromLocalStorage('GameStages', { stages: [] });
    const stageIndex = gameStages.stages.findIndex(stage => stage.biome_serial === selectedBiome);
    if (stageIndex !== -1) {
        gameStages.stages[stageIndex].difficulty = difficulty;
        saveToLocalStorage('GameStages', gameStages);
        selectedDifficulty = difficulty;
    }
    document.dispatchEvent(new CustomEvent('difficultyUpdated', { detail: selectedDifficulty }));
}

function getRandomScreenLoad() {
    return screenLoadOptions[Math.floor(Math.random() * screenLoadOptions.length)];
}

function LoadingScreen() {
    const screen = getRandomScreenLoad();
	    // ✅ Vérifie si #game-windows existe
    let gameWindows = document.getElementById('game-windows');
    if (!gameWindows) {
        console.warn("⚠️ #game-windows introuvable, création automatique...");
        gameWindows = document.createElement('div');
        gameWindows.id = 'game-windows';
        document.body.appendChild(gameWindows);
    }

    const loadingScreen = document.createElement('div');
    loadingScreen.id = 'loadingScreen';
    loadingScreen.className = 'loading-screen';
    loadingScreen.style.backgroundColor = screen.backgroundColor;

    const hud = document.createElement('div');
    hud.className = 'loading-bar-hud';

    const desc = document.createElement('div');
    desc.className = 'loadingDescritpion';
    desc.innerHTML = `<h2 class="loadingTitle">${screen.titleContent}</h2><p class="loadingText">${screen.textContent}</p>`;

    const progressBarContainer = document.createElement('div');
    progressBarContainer.className = 'loading-bar-container';

    const progressBar = document.createElement('div');
    progressBar.id = 'loadingProgressBar';
    progressBar.className = 'loading-bar';
    progressBar.style.width = '0%';

    const percentText = document.createElement('span');
    percentText.className = 'pourcent-progressbar';
    percentText.textContent = '0%';

    progressBar.appendChild(percentText);
    progressBarContainer.appendChild(progressBar);

    const startMessage = document.createElement('h2');
    startMessage.className = 'loading-h2';
    startMessage.textContent = 'Chargement en cours...';

    hud.append(desc, progressBarContainer, startMessage);
    loadingScreen.appendChild(hud);

    if (screen.imageSrc) {
        const img = new Image();
        img.src = screen.imageSrc;
        img.className = 'loading-pic';
        img.onload = () => loadingScreen.appendChild(img);
    }

    document.getElementById('game-windows').appendChild(loadingScreen);

    return { progressBar, percentText, startMessage, loadingScreen };
}

function updateProgressBar(progress) {
    const bar = document.getElementById('loadingProgressBar');
    const text = document.querySelector('.pourcent-progressbar');
    if (bar) bar.style.width = `${progress}%`;
    if (text) text.textContent = `${progress}%`;
}

function displayStartMessage(startMessage, loadingScreen) {
    setTimeout(() => {
        startMessage.textContent = "Cliquer sur l'écran pour démarrer";
        startMessage.classList.add('loaded');

        loadingScreen.addEventListener('click', () => {
            loadingScreen.style.transition = 'opacity 0.5s ease';
            loadingScreen.style.opacity = '0';
            loadStageAnimation();

            setTimeout(() => {
                loadingScreen.remove();

                // 🔘 Création du bouton "Lancer les combats"
                const startButton = document.createElement('div');
                startButton.id = 'startButton';
                startButton.className = 'launch-combat-button';
                startButton.textContent = 'Lancer les combats';

                // 🔗 Lier l'action au clic
startButton.addEventListener('click', () => {
    startGame();
    startButton.style.pointerEvents = 'none';
    startButton.style.opacity = '0.5'; // Visuellement il semble désactivé
});

                // 💡 Apparition douce
                startButton.style.opacity = '0';
                startButton.style.transition = 'opacity 2s ease';

                // 🎯 Insertion dans .Game-UI
                const gameUi = document.querySelector('.Game-UI');
                if (gameUi) {
                    gameUi.appendChild(startButton);
                    // ⚙️ Déclenchement de l'animation d'opacité
                    requestAnimationFrame(() => {
                        startButton.style.opacity = '1';
                    });
                } else {
                    console.warn("Élément .Game-UI introuvable, bouton non ajouté.");
                }
            }, 500);
        });
    }, 1000);
}

async function loadGame() {
    try {
		injectSavedEntities();
        initFightEntites();

		console.log("🔍 Vérif entites avant tout :");
entites.forEach(ent => {
    console.log(`   ${ent.name} - nickname: ${ent.nickname} - stuff:`, ent.stuff);
});
        const { startMessage, loadingScreen } = LoadingScreen();
		purgeStatPreview();
        StageLoading();
        updateEntiteClasses();
        entiteCamp(entites);
	
        const totalItems = entites.length + 3;
		setOrderSide(false);
        let loadedItems = 0;
        const increment = () => {
            loadedItems++;
            const progress = Math.floor((loadedItems / totalItems) * 100);
            updateProgressBar(progress);
            if (progress >= 100) displayStartMessage(startMessage, loadingScreen);
        };

        await Promise.all(entites.map(entite => loadSprite(entite).then(increment)));

        entites.forEach(entite => createEntiteInDOM(entite));
logPositionsAndAnalyze();
observeRoleChanges();
updateGlobalRoleSbire();
TraitementRolesSbires(); 
        

        const entityCount = entites.length;
        getStyleProperties();
        calculerPointsHexagone();
        genererSvgHexagone();
        setupBoard(entityCount);
        parallaxEffect();
        HideGenerateLevelButton();
        toggleScanEntityListener();
        helperDisplay();
        HexButtonVisibility();
		increment(); increment(); increment(); // fin des tâches
	    // createQuitButton();
    } catch (err) {
        console.error("Erreur lors du chargement :", err);
    }
}

function loadSprite(entite) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = entite.sprite;
        img.onload = () => resolve(entite);
        img.onerror = reject;
    });
}

export function createQuitButton() {
    const btn = document.createElement('div');
    btn.className = 'quit-level-button';
    btn.textContent = 'Quitter le niveau';
    btn.addEventListener('click', QuitCurrentLevel);
    document.getElementById('game-windows').appendChild(btn);
}

export function createOrderButton(orderType, buttonText, buttonClass = 'order-button') {
    const btn = document.createElement('div');
    btn.className = buttonClass;
    btn.setAttribute('data-order', orderType);
    btn.textContent = buttonText;

    btn.addEventListener('click', () => {
        console.warn(`⚡ Ordre "${orderType}" déclenché pour le camp A !`);
        stopAllIntervals();
        launchOrderCycleForSide('A', orderType); 
        // Animation de disparition
        btn.style.transition = 'opacity 0.5s ease';
        btn.style.opacity = '0';

        setTimeout(() => {
            btn.remove();
        }, 500);
    });

    document.querySelector('.Game-UI').appendChild(btn);
}

function getGameDay() {
  const raw = localStorage.getItem('gameDay');
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

function setGameDay(day) {
  localStorage.setItem('gameDay', String(day));
}

export function nextDay(increment = 1, { animate = true } = {}) {
  const previousDay = getGameDay();
  const deltaDays = Math.max(0, Math.floor(Number(increment) || 0));
  const newDay = previousDay + deltaDays;

  setGameDay(newDay);
  console.log(`📅 Nouveau jour : ${newDay} (ajout de ${deltaDays} jour(s))`);

  // ✅ tick regen (localStorage)
  if (deltaDays > 0) {
    bumpExtraLifeRegenInStorage(deltaDays, newDay);
    bumpEternalLifeRegenInStorage(deltaDays, newDay); 
	  bumpDayHpRegenInStorage(deltaDays); 
  }

  if (animate) updateDayDisplayAnimated(newDay, previousDay);

  return { previousDay, newDay, deltaDays };
}


let dayAnimTimeoutA = null;
let dayAnimTimeoutB = null;

export function updateDayDisplayAnimated(newDay, previousDay) {
  const dayDiv = document.querySelector(".day-counter");
  if (!dayDiv) return;

  const dayValue = dayDiv.querySelector(".day-value");
  if (!dayValue) {
    // IMPORTANT : ne surtout pas faire dayDiv.textContent ici (ça détruit la structure)
    console.warn("⚠️ .day-counter trouvé mais .day-value absent -> aucune mise à jour.");
    return;
  }

  // Stopper une animation en cours (évite les chevauchements)
  if (dayAnimTimeoutA) clearTimeout(dayAnimTimeoutA);
  if (dayAnimTimeoutB) clearTimeout(dayAnimTimeoutB);
  dayAnimTimeoutA = null;
  dayAnimTimeoutB = null;

  // État initial : afficher le jour précédent uniquement via .day-value
  dayDiv.style.transition = "none";
  dayDiv.style.opacity = "1";
  dayDiv.style.transform = "scale(1)";
  dayValue.textContent = String(previousDay);

  // Reflow pour appliquer les styles avant transition
  dayDiv.offsetHeight;

  // Même logique d’animation que ton ancienne version
  dayAnimTimeoutA = setTimeout(() => {
    dayDiv.style.transition = "opacity 0.8s, transform 0.8s";
    dayDiv.style.opacity = "0";
    dayDiv.style.transform = "scale(0.8)";

    dayAnimTimeoutB = setTimeout(() => {
      dayDiv.style.transition = "none";
      dayValue.textContent = String(newDay); // ✅ SEULE MODIF DU JOUR
      dayDiv.style.opacity = "1";
      dayDiv.style.transform = "scale(1)";

      dayDiv.offsetHeight; // reflow (optionnel)
      dayDiv.style.transition = "opacity 0.8s, transform 0.8s";
    }, 800);
  }, 2000);
}

function bumpExtraLifeRegenOnEntity(entite, deltaDays, dayNow) {
  const regen = entite?.extraLifeRegen;
  if (!regen || typeof regen !== "object") return false;

  let changed = false;

  // ✅ lastUpdate doit être persisté même si rien ne bouge
  if (regen.lastUpdate !== dayNow) {
    regen.lastUpdate = dayNow;
    changed = true;
  }

  // ⛔️ STOP : pas de regen si l'entité est morte
  if (!isEntiteAlive(entite)) {
    return changed; // on garde seulement le tampon lastUpdate
  }

  // incrément regen
  for (const k of Object.keys(regen)) {
    if (!/^\d{3}$/.test(k)) continue;

    const slot = regen[k];
    if (!slot || typeof slot !== "object") continue;

    const maxRegen = toNonNegInt(slot.maxRegen);
    let curRegen = toNonNegInt(slot.currentRegen);

    if (curRegen > maxRegen) {
      slot.currentRegen = maxRegen;
      changed = true;
      continue;
    }

    if (curRegen < maxRegen) {
      const next = Math.min(maxRegen, curRegen + deltaDays);
      if (next !== curRegen) {
        slot.currentRegen = next;
        changed = true;
      }
    }
  }

  if (updateExtraLifeRegenOrders(entite)) changed = true;
  if (syncExtraLifeCurrentFromRegen(entite)) changed = true;

  return changed;
}

export function bumpExtraLifeRegenInStorage(deltaDays = 1, dayNow = 1) {
  const d = Math.max(0, toNonNegInt(deltaDays));
  if (d <= 0) return { changedA: false, changedB: false };

  // --- Army A ---
  const selectedArmyA = loadFromLocalStorage("selectedArmyA", []);
  let changedA = false;

  if (Array.isArray(selectedArmyA)) {
    for (const e of selectedArmyA) {
      if (bumpExtraLifeRegenOnEntity(e, d, dayNow)) changedA = true;
    }
    if (changedA) saveToLocalStorage("selectedArmyA", selectedArmyA);
  }

  // --- Army B ---
  const armyBData = loadFromLocalStorage("ArmyB", { armies: {} });
  let changedB = false;

  if (armyBData && typeof armyBData === "object" && armyBData.armies && typeof armyBData.armies === "object") {
    for (const armyKey of Object.keys(armyBData.armies)) {
      const army = armyBData.armies[armyKey];
      const entities = army?.entities;
      if (!Array.isArray(entities)) continue;

      for (const e of entities) {
        if (bumpExtraLifeRegenOnEntity(e, d, dayNow)) changedB = true;
      }
    }
    if (changedB) saveToLocalStorage("ArmyB", armyBData);
  }

  // Optionnel : si tu veux aussi “tamponner” PlayerSave / gameData après le tick
  if (changedA || changedB) {
    saveCurrentGameData();
  }

  return { changedA, changedB };
}

export function isEntiteAlive(entite) {
  const hp = entite?.stats?.HP?.current;

  // ✅ Si on a une valeur HP fiable, elle tranche.
  if (typeof hp === "number") {
    if (hp <= 0) return false;
  }

  const st = entite?.statut;

  // dead prioritaire
  if (Array.isArray(st)) {
    if (st.includes("dead")) return false;
    if (st.includes("alive")) return true;
  } else if (typeof st === "string") {
    if (st === "dead") return false;
    if (st === "alive") return true;
  }

  // fallback final (si ni HP ni statut exploitable)
  return true;
}

function bumpEternalLifeRegenOnEntity(entite, deltaDays, dayNow) {
  const regen = entite?.eternalLifeRegen;
  if (!regen || typeof regen !== "object") return false;

  let changed = false;

  if (regen.lastUpdate !== dayNow) {
    regen.lastUpdate = dayNow;
    changed = true;
  }

  // ⛔️ STOP : pas de regen si l'entité est morte
  if (!isEntiteAlive(entite)) {
    return changed; // on garde seulement le tampon lastUpdate
  }

  // ✅ Unicité : prune immédiatement
  for (const k of Object.keys(regen)) {
    if (/^\d{3}$/.test(k) && k !== "001") {
      delete regen[k];
      changed = true;
    }
  }

  const slot = regen["001"];
  if (!slot || typeof slot !== "object") return changed;

  const maxRegen = 1;
  if (slot.maxRegen !== maxRegen) {
    slot.maxRegen = maxRegen;
    changed = true;
  }

  let cur = toNonNegInt(slot.currentRegen);
  if (cur > 1) {
    slot.currentRegen = 1;
    changed = true;
    cur = 1;
  }

  if (cur < 1) {
    const next = Math.min(1, cur + toNonNegInt(deltaDays));
    if (next !== cur) {
      slot.currentRegen = next;
      changed = true;
    }
  }

  if (updateEternalLifeRegenOrders(entite)) changed = true;
  if (syncEternalLifeCurrentFromRegen(entite)) changed = true;

  return changed;
}

export function bumpEternalLifeRegenInStorage(deltaDays = 1, dayNow = 1) {
  const d = Math.max(0, toNonNegInt(deltaDays));
  if (d <= 0) return { changedA: false, changedB: false };

  // --- Army A ---
  const selectedArmyA = loadFromLocalStorage("selectedArmyA", []);
  let changedA = false;

  if (Array.isArray(selectedArmyA)) {
    for (const e of selectedArmyA) {
      if (bumpEternalLifeRegenOnEntity(e, d, dayNow)) changedA = true;
    }
    if (changedA) saveToLocalStorage("selectedArmyA", selectedArmyA);
  }

  // --- Army B ---
  const armyBData = loadFromLocalStorage("ArmyB", { armies: {} });
  let changedB = false;

  if (armyBData && typeof armyBData === "object" && armyBData.armies && typeof armyBData.armies === "object") {
    for (const armyKey of Object.keys(armyBData.armies)) {
      const army = armyBData.armies[armyKey];
      const entities = army?.entities;
      if (!Array.isArray(entities)) continue;

      for (const e of entities) {
        if (bumpEternalLifeRegenOnEntity(e, d, dayNow)) changedB = true;
      }
    }
    if (changedB) saveToLocalStorage("ArmyB", armyBData);
  }

  if (changedA || changedB) {
    saveCurrentGameData();
  }

  return { changedA, changedB };
}
function bumpDayHpRegenOnEntity(entite, deltaDays = 1) {
  if (!entite || !entite.stats) return false;

  // ⛔️ pas de heal si morte
  if (!isEntiteAlive(entite)) return false;

  const hpObj = entite.stats.HP;
  if (!hpObj || typeof hpObj !== "object") return false;

  const maxHP = toNonNegInt(hpObj.max);
  const curHP = toNonNegInt(hpObj.current);

  if (maxHP <= 0) return false;

  const perDay = toNonNegInt(entite.stats.dayHpRegen ?? 0);
  if (perDay <= 0) return false;

  const d = Math.max(0, toNonNegInt(deltaDays));
  if (d <= 0) return false;

  const heal = perDay * d;
  const nextHP = Math.min(maxHP, curHP + heal);

  if (nextHP !== curHP) {
    entite.stats.HP.current = nextHP;
    return true;
  }

  return false;
}

export function bumpDayHpRegenInStorage(deltaDays = 1) {
  const d = Math.max(0, toNonNegInt(deltaDays));
  if (d <= 0) return { changedA: false, changedB: false };

  // --- Army A ---
  const selectedArmyA = loadFromLocalStorage("selectedArmyA", []);
  let changedA = false;

  if (Array.isArray(selectedArmyA)) {
    for (const e of selectedArmyA) {
      if (bumpDayHpRegenOnEntity(e, d)) changedA = true;
    }
    if (changedA) saveToLocalStorage("selectedArmyA", selectedArmyA);
  }

  // --- Army B ---
  const armyBData = loadFromLocalStorage("ArmyB", { armies: {} });
  let changedB = false;

  if (armyBData && typeof armyBData === "object" && armyBData.armies && typeof armyBData.armies === "object") {
    for (const armyKey of Object.keys(armyBData.armies)) {
      const army = armyBData.armies[armyKey];
      const entities = army?.entities;
      if (!Array.isArray(entities)) continue;

      for (const e of entities) {
        if (bumpDayHpRegenOnEntity(e, d)) changedB = true;
      }
    }
    if (changedB) saveToLocalStorage("ArmyB", armyBData);
  }

  // (Optionnel) aussi sur les entités live en mémoire (si une session est en cours)
  if (Array.isArray(entites)) {
    for (const e of entites) bumpDayHpRegenOnEntity(e, d);
  }

  if (changedA || changedB) saveCurrentGameData();

  return { changedA, changedB };
}

export function QuitCurrentLevel() {
  // ⛔ Anti double-clic / double event
  if (window.__QUIT_LEVEL_LOCK__) return;
  window.__QUIT_LEVEL_LOCK__ = true;

  try {
    console.log("🚪 Le joueur quitte le niveau...");
    StopGame();

    // ─────────────────────────────────────────────
    // 1) SAUVEGARDES
    // ─────────────────────────────────────────────

    // 🔒 Sauvegarde Armée A
    if (!window.selectedArmyA || window.selectedArmyA.length === 0) {
      const restored = loadFromLocalStorage("selectedArmyA");
      if (restored?.length) {
        window.selectedArmyA = restored;
        console.log("🔁 Armée A restaurée depuis le localStorage avant sauvegarde.");
      }
    }
    const updatedArmyA = loadFromLocalStorage("selectedArmyA", []);
    saveToLocalStorage("selectedArmyA", updatedArmyA);
    window.selectedArmyA = updatedArmyA;

    // 🔒 Sauvegarde Armée B
    if (window.selectedArmyB && window.ArmyB_id) {
      saveToLocalStorage(`ArmyB-${window.ArmyB_id}`, window.selectedArmyB);
      console.log(`📦 Armée B (ArmyB-${window.ArmyB_id}) sauvegardée.`);
    } else {
      console.warn("⚠️ Aucune armée B trouvée à sauvegarder.");
    }

    // ─────────────────────────────────────────────
    // 2) PURGE TOTALE DU BODY (SAUF #game-windows)
    // ─────────────────────────────────────────────
    purgeBodyExceptGameWindows();

    // ─────────────────────────────────────────────
    // 3) RESET STRICT DE #game-windows
    // ─────────────────────────────────────────────
    const gameWindows = document.getElementById("game-windows");
    if (!gameWindows) {
      console.warn("⚠️ game-windows introuvable...");
      return;
    }

    // On conserve uniquement l’élément d’ID (si présent)
    const gameIdDisplay = document.getElementById("game-id-display");
    if (gameIdDisplay) gameIdDisplay.remove();

    // Reset complet
    gameWindows.innerHTML = "";

    // Ré-injection de l’ID display
    if (gameIdDisplay) gameWindows.appendChild(gameIdDisplay);

    // Recrée un container clean
    const container = document.createElement("div");
    container.id = "game-container";
    gameWindows.appendChild(container);

    // ─────────────────────────────────────────────
    // 4) GESTION DU JOUR + RETOUR WORLDMAP
    // ─────────────────────────────────────────────
    let previousDay = parseInt(localStorage.getItem("gameDay"), 10) || 1;
    let newDay = previousDay;

    const worldmap_id = localStorage.getItem("worldmap_id");
    if (worldmap_id) {
      setCurrentLevel(worldmap_id);

      // Capture AVANT incrément
      previousDay = parseInt(localStorage.getItem("gameDay"), 10) || 1;

      nextDay();
      purgeStatPreview();

      // Nouveau jour
      newDay = parseInt(localStorage.getItem("gameDay"), 10) || 1;

      window.levelRunning = "worldmap";
      console.log(`🌍 Retour à la World Map (currentLevel = ${worldmap_id})`);
    } else {
      console.error("❌ worldmap_id manquant, impossible de revenir sur la carte !");
    }

    // ─────────────────────────────────────────────
    // 5) REBUILD UI WORLDMAP (UNE SEULE FOIS)
    // ─────────────────────────────────────────────
Promise.all([
  import("./admin.js"),
  import("./GameInit.js"),
  import("./newgame.js")
])
.then(([admin, gameInit, newgame]) => {
  console.log("🔄 Carte relancée !");

  // 1) Toujours d’abord : structure DOM (helper + game-windows + container)
  gameInit.createGameContainer();

  // 2) Ensuite seulement : UI qui dépend du container
  gameInit.GameUi();
  gameInit.initializeArmyConfig();
  gameInit.PlayerArmyCodex();

  // 3) Admin + boutons + tooltips ensuite
  admin.AdminButtons();

  newgame.determineAndGenerateButtons();
  newgame.initializeTooltips();
  newgame.initializeButtonClicks();
  newgame.applyLevelStatusClasses();

  updateDayDisplayAnimated(newDay, previousDay);
})
.catch(err => {
  console.error("❌ Erreur lors du rebuild World Map :", err);
}).finally(() => {
      window.__QUIT_LEVEL_LOCK__ = false;
    });

  } catch (e) {
    console.error("❌ QuitCurrentLevel a crash :", e);
    window.__QUIT_LEVEL_LOCK__ = false;
  }
}


// ─────────────────────────────────────────────
// PURGE : conserve uniquement #game-windows dans <body>
// ─────────────────────────────────────────────
function purgeBodyExceptGameWindows() {
  const gw = document.getElementById("game-windows");
  if (!gw) return;

  [...document.body.children].forEach(node => {
    if (node !== gw) node.remove();
  });
}


import './dragndrop.js';
