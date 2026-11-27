import {
  updateRoleInDOM, updateMovementDisplay,
} from "../rendering/hud.js";
import { consumeEntityMovement, positionnerEntites } from "./deployment.js";
import { ENTITY_SIZE_OPTIONS, entitySizeInCells, createBoardState, footprintCells, chooseFootprintRole,
  putBoardOccupant, removeBoardOccupant, boardOccupantsAt, applyBoardPlacements,
  snapshotBoardState, offsetToAxial, axialDistance } from "./model.js";
import { planBoardPlacements } from "./placementRules.js";
import { getBoardGeometry as geometry, gridForHex as gridFor, invalidateBoardGeometry,
  getFootprintElements, getFootprintCenter, getOccupantView, getPlacementViews,
  readHexCoordinates, projectBoardCell } from "../rendering/boardAdapter.js";
import { registerCombatState, notifyCombatAction } from "../combat/clock.js";
import { scenarios } from "../data/boardList.js";
import { cachedResourceUrl } from "../data/loaderList.js";
import { levelBiome } from "../biome/level.js";
import {
  LevelUi, getOrCreateGameContainer,
} from "../ui/display.js";
import {
  clearBiomeEffects, initCanvas, initDroplet, initSunray, initSnowstorm, handleMeteo, handleGroundFx,
} from "../biome/meteo.js";
import { createSoundManager } from "../rendering/sound.js";
import { entites } from "../entities/runtime.js";
import { saveEntityPositionState, recordEntityCombatMovement, recordEntityCombatProc } from "../storage/entityStorage.js";
import { notifyProjectileTargetMoved } from "../rendering/animations.js";
import { notifyTargetGeometryChanged } from "../rendering/projectileGeometry.js";
import {
  hexRoles, findNearestAvailableHex,
} from "../rendering/boardElements.js";
import { attemptAlterationResistance } from "../combat/statistics.js";
import { isEntityMovementBlocked } from "../combat/control.js";

let hexesSideA = [];
let hexesNeutral = [];
let hexesSideB = [];
let matchingBiome = null;  
let currentAudioElement = null;

export const BOARD_SIZE_OPTIONS = Object.freeze([
    Object.freeze({ key: 'small', label: 'Small', scenarioIndex: 0 }),
    Object.freeze({ key: 'medium', label: 'Medium', scenarioIndex: 1 }),
    Object.freeze({ key: 'large', label: 'Large', scenarioIndex: 2 })
]);

function playBiomeSound() {
    if (currentAudioElement) {
        currentAudioElement.remove(); // Supprimer l'ancien son avant d'en charger un nouveau
    }

    if (matchingBiome && matchingBiome.sound) {
        currentAudioElement = createSoundManager(matchingBiome.sound);
    } else {
        console.log("Aucun son d'ambiance défini pour ce biome.");
    }
}

document.addEventListener('biomeUpdated', (event) => {
    const selectedBiome = event.detail;
    matchingBiome = levelBiome.find(biome => biome.classe === selectedBiome);
    // StageLoading starts playback after the level resources are ready.
});

document.addEventListener('biomeUpdated', (event) => {
    const selectedBiome = event.detail;
    // console.log('Le biome mis à jour est :', selectedBiome);

    // Chercher un niveau avec une classe correspondante
    matchingBiome = levelBiome.find(biome => biome.classe === selectedBiome);

    if (matchingBiome) {
        // console.log('Le biome correspondant dans levelBiome est :', matchingBiome);
    } else {
        console.log('Aucun biome correspondant trouvé dans levelBiome.');
    }
});

export function applyBiomeRealtime(biomeClass, options = {}) {
    const selectedBiome = levelBiome.find(biome => biome.classe === biomeClass);
    if (!selectedBiome) {
        console.warn(`Biome admin introuvable : ${biomeClass}`);
        return false;
    }

    matchingBiome = selectedBiome;
    clearBiomeEffects();

    document.querySelectorAll('.background, .foreground').forEach(element => element.remove());
    document.querySelectorAll('#hexGrid > .ground').forEach(element => element.remove());

    const gameContainer = getOrCreateGameContainer();
    const board = document.querySelector('.board');
    const hexGrid = document.getElementById('hexGrid');
    const requestedScenario = getBoardSizeScenario(options.size);

    addBackground(board);
    if (requestedScenario) {
        applyBoardDecorLayout(requestedScenario);
        createHexGrid(getGridConfigForScenario(requestedScenario));
        generateDecor(gameContainer, null, null);
    } else {
        applyCurrentBoardDecorLayout();
        generateDecor(gameContainer, null, hexGrid);
    }
    playBiomeSound();

    document.dispatchEvent(new CustomEvent('adminBiomeChanged', {
        detail: {
            biome: selectedBiome,
            ...(requestedScenario ? { size: options.size, scenario: requestedScenario } : {})
        }
    }));

    return true;
}

// Fonction pour générer les éléments de décor (foreground et ground)
export function generateDecor(gameContainer, board, hexGrid) {
    // Vérifier que matchingBiome est défini avant d'utiliser ses propriétés
    if (matchingBiome && gameContainer) {
    const foreGround = document.createElement('div');
    foreGround.className = `foreground ${matchingBiome.classe}`;

    const foreGroundImage = document.createElement('img');
    foreGroundImage.className = `foreground-img ${matchingBiome.classe}`;  // Corriger la classe CSS dynamique
    // Utiliser la valeur de matchingBiome.foreground
    foreGroundImage.src = cachedResourceUrl(matchingBiome.foreground || 'media/decors/prison/foreground.png');
    foreGround.appendChild(foreGroundImage);

    const foreGroundColor = document.createElement('div');
    foreGroundColor.className = `foreground-color ${matchingBiome.classe}`;  // Corriger la classe CSS dynamique
    // Utiliser la couleur du foreground
    foreGroundColor.style.backgroundColor = matchingBiome.foreground_color || 'defaultColor';
    foreGround.appendChild(foreGroundColor);

    gameContainer.appendChild(foreGround);
}

if (hexGrid) {
    // Création de l'élément ground
    const Ground = document.createElement('div');
    Ground.className = `ground ${matchingBiome.classe}`;
    hexGrid.appendChild(Ground);

    // Appliquer l'image de fond avec l'URL du biome
    const imageUrl = matchingBiome.ground;
    Ground.style.backgroundImage = `url('${cachedResourceUrl(imageUrl)}')`;

      // GROUND FX
    if (matchingBiome.ground_fx) {
        // Appliquer les effets "ground_fx" spécifiquement
        handleGroundFx(matchingBiome.ground_fx, matchingBiome.classe);
    }

    // METEO
    if (matchingBiome.meteo) {
        // Appliquer la météo spécifiquement
        handleMeteo(matchingBiome.meteo, matchingBiome.classe);
    }
}

}

// Fonction pour ajouter le background dans .board
export function addBackground(board) {
    // DECORS BACKGROUND
    if (matchingBiome && board) {
   const backGround = document.createElement('div');
backGround.className = `background ${matchingBiome.classe}`;

// matchingBiome.background contient l'URL de l'image
const backgroundUrl = matchingBiome.background;

// Appliquer l'image de fond avec l'URL du biome
backGround.style.backgroundImage = `url('${cachedResourceUrl(backgroundUrl)}')`;
        const hexGrid = board.querySelector(':scope > #hexGrid');
        if (hexGrid) board.insertBefore(backGround, hexGrid);
        else board.appendChild(backGround);
    }
}

// Fonction StageLoading
export function StageLoading() {
    const gameContainer = getOrCreateGameContainer();
    LevelUi();
    
    const boardGlobal = document.createElement('div');
    boardGlobal.className = 'board-global';

    const board = document.createElement('div');
    board.className = 'board';

    // Appeler addBackground pour ajouter le background dans .board
    addBackground(board);

    const hexGrid = document.createElement('div');
	 hexGrid.id = 'hexGrid';
    hexGrid.className = 'hex-grid';
    board.appendChild(hexGrid); // hexGrid est ajouté après le background

    boardGlobal.appendChild(board);
    gameContainer.appendChild(boardGlobal);

    // Appeler generateDecor pour ajouter les autres décors (foreground, ground)
    generateDecor(gameContainer, board, hexGrid);

    // Appeler playBiomeSound pour jouer le son du biome
    playBiomeSound();
}

// Fonction createHexGrid
export function createHexGrid(forcedGridConfig = null) {
    const hexGrid = document.getElementById('hexGrid');
    if (!hexGrid) {
        console.error("L'élément #hexGrid est introuvable.");
        return;
    }
    hexGrid.style.overflow = 'visible';

    const { rows, cols, hexWidth, hexHeight, staggeredRowHeight, totalHexagons, scale } = forcedGridConfig || calculateRowsAndCols();

    const effectiveHexWidth = hexWidth;
    const effectiveHexHeight = hexHeight;

    const previousCoordinates = new Map([...hexGrid.querySelectorAll('.hex[data-position]')]
        .map(hex => [hex.dataset.position, { row: Number(hex.dataset.row), col: Number(hex.dataset.col),
            side: hex.classList.contains('Neutral') ? 'Neutral' : hex.classList.contains('SideA') ? 'SideA' : 'SideB' }]));
    const previousBoxes = [...hexGrid.querySelectorAll('[id^="Box_Entite_"]')].map(box => ({box,parent:box.parentElement}));
    const previousNodes = [...hexGrid.childNodes];
    clearFootprintAnimations();
    // Keep sprites, canvases and listeners alive while replacing their old hexes.
    hexGrid.querySelectorAll('[id^="Box_Entite_"]').forEach(box => hexGrid.parentElement.appendChild(box));
    hexGrid.innerHTML = '';

    let hexIdCounter = 1; // Commencer la numérotation à 1

    // Réinitialiser les tableaux
    hexesSideA = [];
    hexesNeutral = [];
    hexesSideB = [];

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            if (hexIdCounter > totalHexagons) break;

            const hexCoordinate = `${String.fromCharCode(65 + col)}${row + 1}`;
            const hex = document.createElement('div');
            hex.classList.add('hex');
            hex.setAttribute('data-position', `hex_${hexIdCounter}`);
            // Coordonnées logiques conservées sur le DOM pour les sélections spatiales.
            hex.dataset.coordinate = hexCoordinate;
            hex.dataset.row = String(row);
            hex.dataset.col = String(col);

            const { role, span: roleSpan } = hexRoles(row, col, rows, cols, hexIdCounter, hex);
            hex.innerHTML = `<div class="socle ${role}"><div class="image-role-hex-info" ></div><div class="hex-details">${roleSpan}<span class="hex-number">${hexIdCounter}</span> - <span class="hex-coordinate">${hexCoordinate}</span></div></div>`;
            hex.setAttribute('data-role', `${role}`);
            hexIdCounter++;

            const {x:hexLeft,y:hexTop}=projectBoardCell(row,col,effectiveHexWidth,staggeredRowHeight);

            hex.style.position = 'absolute';
            hex.style.left = `${hexLeft}px`;
            hex.style.top = `${hexTop}px`;

            const sideAWidth = Math.floor(cols * 0.4);
            const neutralWidth = Math.floor(cols * 0.2);

            if (col < sideAWidth) {
                hex.classList.add('SideA');
                hexesSideA.push(hex);
            } else if (col < sideAWidth + neutralWidth) {
                hex.classList.add('Neutral');
                hexesNeutral.push(hex);
            } else {
                hex.classList.add('SideB');
                hexesSideB.push(hex);
            }

            hexGrid.appendChild(hex);
        }
    }

    invalidateFootprintGeometry(hexGrid);
    const placed = positionnerEntites(null, { previousCoordinates });
    if (previousBoxes.length && placed.length < previousBoxes.length) {
        // A smaller terrain must not strand a large entity outside its cells.
        hexGrid.replaceChildren(...previousNodes);
        for (const {box,parent} of previousBoxes) parent.append(box);
        invalidateFootprintGeometry(hexGrid);syncEntityFootprints(hexGrid);
        hexesSideA = [...hexGrid.querySelectorAll('.hex.SideA')];
        hexesSideB = [...hexGrid.querySelectorAll('.hex.SideB')];
        hexesNeutral = [...hexGrid.querySelectorAll('.hex.Neutral')];
        console.warn('Taille du terrain conservée : les entités ne tiennent pas entièrement.');
        return false;
    }
    generateDecor(null, null, hexGrid);

    // Une reconstruction peut déplacer plusieurs cibles d'un seul coup.
    // Une notification unique recalcule seulement les projectiles encore actifs.
    document.dispatchEvent(new Event('projectileTargetsMoved'));

    const event = new Event('hexGridCreated');
    document.dispatchEvent(event);
}

// Fonction getStyleProperties
export function getStyleProperties() {
    const style = getComputedStyle(document.documentElement);
    const r = parseFloat(style.getPropertyValue('--r')) || 1;
    const ow = parseFloat(style.getPropertyValue('--ow')) || 130;
    const oh = parseFloat(style.getPropertyValue('--oh')) || 150;
    const spacing = parseFloat(style.getPropertyValue('--s')) || 0;
    const strokeColor = style.getPropertyValue('--stroke-color').trim() || 'red';
    const strokeWidth = style.getPropertyValue('--stroke-width').trim() || '2px';
    const fillColor = style.getPropertyValue('--fill-color').trim() || 'none';
	const screenHeight = parseFloat(style.getPropertyValue('--screen-h')) || '1080px';
	const screenWidth = parseFloat(style.getPropertyValue('--screen-w')) || '1920px';

    return { r, ow, oh, spacing, strokeColor, strokeWidth, fillColor, screenHeight, screenWidth };
}

// Fonction calculerPointsHexagone
export function calculerPointsHexagone(width, height) {
    const points = [
        width / 2, 0,
        width, height / 4,
        width, 3 * height / 4,
        width / 2, height,
        0, 3 * height / 4,
        0, height / 4
    ].join(' ');
    return points;
}

// Fonction genererSvgHexagone
export function genererSvgHexagone() {
    const { r, ow, oh, strokeColor, strokeWidth, fillColor } = getStyleProperties();
    const width = ow * r;
    const height = oh * r;
    const pointsHexagone = calculerPointsHexagone(width, height);
    const svgData = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><polygon points="${pointsHexagone}" stroke="${strokeColor}" stroke-width="${strokeWidth}" fill="${fillColor}"/></svg>`;
    return `url('data:image/svg+xml;utf8,${svgData}')`;
}

// Fonction getScenario
export function getScenario(entityCount) {
    return scenarios.find(scenario => entityCount >= scenario.minEntities && entityCount <= scenario.maxEntities);
}

export function getBoardSizeOptions() {
    return BOARD_SIZE_OPTIONS.map(option => ({
        ...option,
        scenario: scenarios[option.scenarioIndex] || null
    })).filter(option => option.scenario);
}

function getBoardSizeScenario(sizeKey) {
    if (!sizeKey) return null;
    const option = BOARD_SIZE_OPTIONS.find(candidate => candidate.key === sizeKey);
    return option ? scenarios[option.scenarioIndex] || null : null;
}

function getGridConfigForScenario(scenario) {
    const { r, ow, oh, spacing } = getStyleProperties();
    let { hexagons, rows, cols, scale } = scenario;
    const totalNeededHexagons = rows * cols;
    if (totalNeededHexagons > hexagons) {
        hexagons = totalNeededHexagons;
    }

    const hexWidth = ow * r + spacing;
    const hexHeight = oh * r + spacing;
    const staggeredRowHeight = hexHeight * 0.75;

    return {
        rows,
        cols,
        hexWidth,
        hexHeight,
        staggeredRowHeight,
        totalHexagons: hexagons,
        scale
    };
}

function getScenarioForCurrentBoard() {
    const boardGlobal = document.getElementsByClassName('board-global')[0];
    if (boardGlobal) {
        const currentTransform = boardGlobal.style.transform;
        const currentLeft = boardGlobal.style.left;
        const currentTop = boardGlobal.style.top;
        const layoutScenario = scenarios.find(scenario => (
            scenario.boardGlobalTransform === currentTransform &&
            scenario.boardGlobalLeft === currentLeft &&
            scenario.boardGlobalTop === currentTop
        ));
        if (layoutScenario) return layoutScenario;
    }

    const hexCount = document.querySelectorAll('#hexGrid > .hex').length;
    if (hexCount > 0) {
        return scenarios.find(scenario => (
            Math.min(Number(scenario.hexagons) || 0, Number(scenario.rows) * Number(scenario.cols)) === hexCount
        ));
    }

    const entityCount = document.querySelectorAll('[id^="Box_Entite_"]').length;
    return getScenario(entityCount);
}

function applyBoardDecorLayout(scenario) {
    if (!scenario) return false;

    const backgroundTop = document.getElementsByClassName('background')[0];
    if (backgroundTop) {
        backgroundTop.style.top = scenario.backgroundTop;
        backgroundTop.style['background-size'] = scenario.backgroundSize;
    }

    const boardGlobal = document.getElementsByClassName('board-global')[0];
    if (boardGlobal) {
        boardGlobal.style.transform = scenario.boardGlobalTransform;
        boardGlobal.style.left = scenario.boardGlobalLeft;
        boardGlobal.style.top = scenario.boardGlobalTop;
    }

    return Boolean(backgroundTop || boardGlobal);
}

export function applyCurrentBoardDecorLayout() {
    let scenario = getScenarioForCurrentBoard();

    if (!scenario) {
        console.warn("Aucun scénario trouvé pour le plateau courant. Application du scénario par défaut.");
        scenario = scenarios.find(s => s.hexagons === 150);
    }

    return applyBoardDecorLayout(scenario);
}

// Fonction calculateRowsAndCols
export function calculateRowsAndCols() {
    const { r, ow, oh, spacing, screenHeight, screenWidth } = getStyleProperties();
    
    const entityCount = document.querySelectorAll('[id^="Box_Entite_"]').length;
    console.log("Nombre total d'entités :", entityCount);
    let scenario = getScenario(entityCount);

    if (!scenario) {
        console.warn("Aucun scénario trouvé pour le nombre d'entités donné. Application du scénario par défaut.");
        scenario = scenarios.find(s => s.hexagons === 150);
    }

    let { hexagons, rows, cols, scale } = scenario;

    const totalNeededHexagons = rows * cols;
    if (totalNeededHexagons > hexagons) {
        hexagons = totalNeededHexagons;
        console.log("Nombre total de hexagons :", hexagons); 
    }

    const hexWidth = ow * r + spacing;
    const hexHeight = oh * r + spacing;
    const staggeredRowHeight = hexHeight * 0.75;

    return {
        rows,
        cols,
        hexWidth,
        hexHeight,
        staggeredRowHeight,
        totalHexagons: hexagons,
        scale
    };
}

// Fonction getHexes
export function getHexes() {
    return {
        hexesSideA,
        hexesNeutral,
        hexesSideB
    };
}

// Fonction setupBoard
export function setupBoard(entityCount) {
    let scenario = getScenario(entityCount);

    if (!scenario) {
        console.warn("Aucun scénario trouvé pour le nombre d'entités donné. Application du scénario par défaut.");
        scenario = scenarios.find(s => s.hexagons === 150);
    }

    const backgroundTop = document.getElementsByClassName('background')[0];
    if (!backgroundTop) {
        console.error("L'élément .background est introuvable.");
        return;
    }
    const boardGlobal = document.getElementsByClassName('board-global')[0];
    if (!boardGlobal) {
        console.error("L'élément .board-global est introuvable.");
        return;
    }
    applyBoardDecorLayout(scenario);

    createHexGrid(getGridConfigForScenario(scenario));
}

// Fonction calculateHexes
export function calculateHexes(side) {
    const allHexes = [...hexesSideA, ...hexesNeutral, ...hexesSideB];

    const availableHexes = allHexes.filter(hex => {
        const isOccupied = hex.classList.contains('occupied');
        const isSideA = hex.classList.contains('SideA');
        const isSideB = hex.classList.contains('SideB');
        const isNeutral = hex.classList.contains('Neutral');

        if (isOccupied) return false;
        if (side === 'A' && (isSideB || isNeutral)) return false;
        if (side === 'B' && (isSideA || isNeutral)) return false;
        if (side === 'neutral' && (isSideA || isSideB)) return false;

        return true;
    });

    const availableHexTypes = {};
    availableHexes.forEach(hex => {
        const role = hex.getAttribute('data-role');
        if (role) {
            if (!availableHexTypes[role]) {
                availableHexTypes[role] = [];
            }
            availableHexTypes[role].push(hex.getAttribute('data-position'));
        }
    });

    return { availableHexes, availableHexTypes };
}

/**
 * Retourne les positions des hexagones disponibles les plus pertinentes pour
 * une zone donnée du plateau. Le résultat utilise le format interne `hex_N`,
 * directement compatible avec `createEntityIngame({ position })`.
 *
 * @param {'A'|'B'|'sideA'|'sideB'|'neutral'|'neutre'} side
 * @param {'top'|'middle'|'bottom'|'start'|'center'|'end'|'all'} line
 * @param {'start'|'middle'|'center'|'end'|'all'} column
 * @param {number} count
 * @returns {string[]} positions `hex_N`, triées de la plus pertinente à la moins pertinente
 */
export function hexCoordonne(
    side,
    line = 'middle',
    column = 'center',
    count = 1
) {
    const normalizedSide = String(side ?? '').trim().toLowerCase();
    const sideClass = (() => {
        if (['a', 'sidea', 'armya'].includes(normalizedSide)) return 'SideA';
        if (['b', 'sideb', 'armyb'].includes(normalizedSide)) return 'SideB';
        if (['neutral', 'neutre', 'n'].includes(normalizedSide)) return 'Neutral';
        return null;
    })();

    if (!sideClass) {
        console.warn(`[board] hexCoordonne : side invalide "${side}".`);
        return [];
    }

    const requestedCount = Math.max(0, Math.floor(Number(count) || 0));
    if (requestedCount === 0) return [];

    const allSideHexes = [...document.querySelectorAll(`#hexGrid .hex.${sideClass}[data-position]`)];
    const candidates = allSideHexes.filter((hex) => !hex.classList.contains('occupied'));
    if (candidates.length === 0) return [];

    // Compatibilité avec une grille déjà créée avant l'ajout des datasets row/col.
    // On peut reconstruire row/col depuis le texte A1, B2... si nécessaire.
    const readCoordinate = (hex) => {
        let row = Number(hex.dataset.row);
        let col = Number(hex.dataset.col);

        if (!Number.isFinite(row) || !Number.isFinite(col)) {
            const label = hex.dataset.coordinate
                || hex.querySelector('.hex-coordinate')?.textContent?.trim()
                || '';
            const match = /^([A-Z]+)(\\d+)$/i.exec(label);
            if (match) {
                const letters = match[1].toUpperCase();
                col = [...letters].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0) - 1;
                row = Number(match[2]) - 1;
            }
        }

        return { row, col };
    };

    const sideGeometry = allSideHexes
        .map((hex) => ({ hex, ...readCoordinate(hex) }))
        .filter(({ row, col }) => Number.isFinite(row) && Number.isFinite(col));

    const candidateGeometry = candidates
        .map((hex) => ({ hex, ...readCoordinate(hex) }))
        .filter(({ row, col }) => Number.isFinite(row) && Number.isFinite(col));

    if (candidateGeometry.length === 0 || sideGeometry.length === 0) return [];

    const boardHexes = [...document.querySelectorAll('#hexGrid .hex[data-position]')]
        .map((hex) => ({ hex, ...readCoordinate(hex) }))
        .filter(({ row, col }) => Number.isFinite(row) && Number.isFinite(col));

    const rows = boardHexes.length
        ? Math.max(...boardHexes.map(({ row }) => row)) + 1
        : Math.max(...sideGeometry.map(({ row }) => row)) + 1;
    const cols = boardHexes.length
        ? Math.max(...boardHexes.map(({ col }) => col)) + 1
        : Math.max(...sideGeometry.map(({ col }) => col)) + 1;

    const sideMinCol = Math.min(...sideGeometry.map(({ col }) => col));
    const sideMaxCol = Math.max(...sideGeometry.map(({ col }) => col));
    const boardCenterRow = (rows - 1) / 2;
    const boardCenterCol = (cols - 1) / 2;

    const normalizedLine = String(line ?? 'middle').trim().toLowerCase();
    const normalizedColumn = String(column ?? 'center').trim().toLowerCase();

    const targetRow = (() => {
        if (['top', 'start'].includes(normalizedLine)) return 0;
        if (['bottom', 'end'].includes(normalizedLine)) return rows - 1;
        // `all` utilise le milieu comme point de tri sans exclure aucune ligne.
        return boardCenterRow;
    })();

    const targetCol = (() => {
        if (normalizedColumn === 'start') return sideMinCol;
        if (normalizedColumn === 'end') return sideMaxCol;
        // middle / center / all : centre horizontal du side demandé.
        return (sideMinCol + sideMaxCol) / 2;
    })();

    // Coordonnées 2D normalisées conformes au placement visuel de createHexGrid :
    // une ligne sur deux est décalée de 1/2 case et l'écart vertical vaut 0.75.
    const toPoint = projectBoardCell;

    const targetPoint = toPoint(targetRow, targetCol);
    const boardCenterPoint = toPoint(boardCenterRow, boardCenterCol);

    const scored = candidateGeometry.map(({ hex, row, col }) => {
        const point = toPoint(row, col);
        const distanceTarget = Math.hypot(point.x - targetPoint.x, point.y - targetPoint.y);
        const distanceBoardCenter = Math.hypot(
            point.x - boardCenterPoint.x,
            point.y - boardCenterPoint.y
        );

        return {
            hex,
            row,
            col,
            distanceTarget,
            distanceBoardCenter
        };
    });

    scored.sort((a, b) => {
        const targetDelta = a.distanceTarget - b.distanceTarget;
        if (Math.abs(targetDelta) > 1e-9) return targetDelta;

        // À pertinence égale, favoriser la case la plus proche du centre global.
        const centerDelta = a.distanceBoardCenter - b.distanceBoardCenter;
        if (Math.abs(centerDelta) > 1e-9) return centerDelta;

        // Départage stable et déterministe.
        if (a.row !== b.row) return a.row - b.row;
        return a.col - b.col;
    });

    return scored
        .slice(0, requestedCount)
        .map(({ hex }) => hex.dataset.position)
        .filter(Boolean);
}

registerCombatState('board', () => ({ matchingBiome }), saved => {
    matchingBiome = saved.matchingBiome;
    hexesSideA = [...document.querySelectorAll('#hexGrid .hex.SideA')];
    hexesSideB = [...document.querySelectorAll('#hexGrid .hex.SideB')];
    hexesNeutral = [...document.querySelectorAll('#hexGrid .hex.Neutral')];
});

// Tailles, groupements, occupation et placement des entités.
// Elementary hexes stay in the existing board. A footprint is one logical occupant.
export { ENTITY_SIZE_OPTIONS, entitySizeInCells } from "./model.js";
const SCALES = { 1: 1, 2: 1.35, 3: 1.65, 6: 2.5 };
const occupancyRegistries = new WeakMap(), motions = new Map();
let smokeSequence = 0;
const boxFor = entity => document.getElementById(`Box_Entite_${entity?.id}`);
export function invalidateFootprintGeometry(grid) {
  if(grid) { invalidateBoardGeometry(grid); occupancyRegistries.delete(grid); }
}

export function entityFootprint(entity, anchor=boxFor(entity)?.closest('.hex'), size=entitySizeInCells(entity)) {
  return getFootprintElements(anchor, size);
}
// Runtime-only occupancy, rebuilt once from the restored board. All spatial
// mutations update this index synchronously, before their gameplay notifications.
// No timer or DOM observer scans the board during combat.
function removeOccupant(registry, record) {
  if (!record) return;
  removeBoardOccupant(registry.model, record.id);
  registry.views.delete(record.id);
}

function registerEntityOccupant(registry,entity,box,anchor) {
  const id=String(entity.id);
  removeOccupant(registry,registry.model.occupants.get(id));
  if(!anchor || box.dataset.footprintReleased==='true') return;
  const size=entitySizeInCells(entity);
  putBoardOccupant(registry.model,{id,anchor:anchor.dataset.position,size,
    members:footprintCells(registry.model.geometry,anchor.dataset.position,size),movable:true});
  registry.views.set(id,{entity,box});
}
function registerHexObjects(registry,hex) {
  const id=`object:${hex.dataset.position}`;
  removeOccupant(registry,registry.model.occupants.get(id));
  const nodes=[...hex.children].filter(node=>node.dataset.occupiesHex!=='false'
    && node.matches('.battle-element, [data-occupies-hex="true"]')&&!node.matches('.entite-box'));
  if(nodes.length || hex.classList.contains('consommable-summoned')) {
    putBoardOccupant(registry.model,{id,anchor:hex.dataset.position,size:1,
      members:[hex.dataset.position],movable:false,groundConsumable:nodes.length===0});
    registry.views.set(id,{nodes});
  }
}
export function rebuildBoardOccupancy(grid=document.getElementById('hexGrid')) {
  if(!grid) return null;
  const data=geometry(grid), registry={geometry:data,model:createBoardState(data.model),views:new Map()};
  occupancyRegistries.set(grid,registry);
  const entitiesById=new Map(entites.map(entity=>[String(entity.id),entity]));
  for(const box of grid.querySelectorAll('.entite-box')) {
    const anchor=box.closest('.hex');
    const id=box.id.replace('Box_Entite_','');
    const entity=entitiesById.get(id)||{id,sizeInCells:Number(box.dataset.sizeInCells)||1};
    registerEntityOccupant(registry,entity,box,anchor);
  }
  for(const hex of registry.geometry.cells) registerHexObjects(registry,hex);
  return registry;
}
function boardOccupancy(grid) {
  if(!grid) return null;
  const registry=occupancyRegistries.get(grid);
  return registry?.geometry===geometry(grid)?registry:rebuildBoardOccupancy(grid);
}
// Called by object/consumable creation, relocation and removal. Only this cell's
// direct objects are read; sprite animation and popup mutations are irrelevant.
export function refreshHexOccupancy(hex) {
  if(hex?.isConnected) registerHexObjects(boardOccupancy(gridFor(hex)),hex);
}
export function getBoardHex(position,root=document) {
  const grid=root===document?document.getElementById('hexGrid'):root;
  if(!grid?.matches?.('.hex-grid, #hexGrid')) return null;
  return geometry(grid).byPosition.get(position)||null;
}
export function getFootprintOccupants(hex,excludeElement=null) {
  if(!hex) return [];
  const registry=boardOccupancy(gridFor(hex));
  const records=boardOccupantsAt(registry?.model,hex.dataset.position);
  const entities=[],objects=[];
  for(const record of records) {
    const view=registry.views.get(record.id);
    if(record.movable) {
      if(view.box!==excludeElement && view.box.dataset.occupiesHex!=='false') entities.push(view.box);
    } else for(const node of view.nodes) if(node!==excludeElement) objects.push(node);
  }
  return [...entities,...objects];
}
export function getFootprintOccupant(hex, excludeElement=null) {
  return getFootprintOccupants(hex,excludeElement)[0]||null;
}
function center(members) { return getFootprintCenter(members); }
export function footprintRole(members, previous='gueux') {
  const order=['gueux','tank','fantassin','mage'];
  const roles=members.map(hex=>order.includes(hex.dataset.role)?hex.dataset.role:
    order.find(name=>hex.classList.contains(`${name}-role`)||hex.querySelector('.socle')?.classList.contains(name))||'gueux');
  return chooseFootprintRole(roles,previous);
}
// Pure planning: neither a resisted nor an impossible application changes size, occupants or roles.
export function planEntityPlacements(requests,{push=false,allowedCell=()=>true,allowGroundConsumables=false}={}) {
  if(!requests.length) return {valid:false,reason:'Aucun placement.'};
  const grid=gridFor(requests[0].hex),registry=boardOccupancy(grid);
  if(!registry) return {valid:false,reason:'Terrain introuvable.'};
  const entities=new Map([...registry.views].filter(([,view])=>view.entity).map(([id,view])=>[id,view.entity]));
  for(const {entity} of requests) entities.set(String(entity.id),entity);
  const logicalRequests=requests.map(({entity,hex,size=entitySizeInCells(entity)})=>({id:String(entity.id),size,
    anchor:hex?.isConnected&&gridFor(hex)===grid?hex.dataset.position:null}));
  const logical=planBoardPlacements(registry.model,logicalRequests,{push,allowGroundConsumables,
    allowedCell:(id,cell)=>allowedCell(entities.get(id),registry.geometry.byPosition.get(cell))});
  if(!logical.valid) return logical;
  return {valid:true,grid,moves:getPlacementViews(registry,logical,entities),pushed:logical.pushed,
    allowGroundConsumables,logical};
}

export function getBoardSnapshot(grid=document.getElementById('hexGrid')) {
  const registry=boardOccupancy(grid);
  return registry?snapshotBoardState(registry.model):null;
}
function ensureStyles() {
  if(document.getElementById('entity-footprint-styles')) return;
  const style=document.createElement('style');style.id='entity-footprint-styles';style.textContent=`
    .entity-size-layer{transform:scale(var(--entity-size-scale,1));transform-origin:center var(--entity-foot-y,120px);transition:transform 160ms ease-out}
    .entity-footprint-overlay{position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible;pointer-events:none}
    .entity-footprint-smoke{position:absolute;left:50%;top:50px;width:110px;height:auto;transform:translate(-50%,-70%);pointer-events:none;z-index:1000}
    @media(prefers-reduced-motion:reduce){.entity-size-layer{transition:none}}
  `;document.head.append(style);
}
export function applyEntitySizeVisual(entity) {
  const box=boxFor(entity);if(!box) return;
  ensureStyles();box.dataset.sizeInCells=entitySizeInCells(entity);
  const sprite=document.getElementById(`spriteContainer_${entity.id}`);
  if(!sprite || !box.contains(sprite)) return;
  let layer=sprite.parentElement;
  if(!layer.classList.contains('entity-size-layer')) {
    layer=document.createElement('div');layer.className='entity-size-layer';sprite.before(layer);layer.append(sprite);
    const frame=box.querySelector('.sprite'),animation=box.querySelector('.animation-sprite');
    if(frame) {const css=getComputedStyle(frame);layer.style.setProperty('--entity-foot-y',`${(parseFloat(css.height)||120)+(parseFloat(css.top)||0)+(parseFloat(animation&&getComputedStyle(animation).top)||0)}px`);}
  }
  layer.style.setProperty('--entity-size-scale',SCALES[entitySizeInCells(entity)]);
  box.style.setProperty('--entity-size-scale',SCALES[entitySizeInCells(entity)]);
}
function outline(members) {
  const edges=new Map(),data=geometry(gridFor(members[0]));
  const vertex=p=>p.map(v=>v.toFixed(2)).join(',');
  for(const hex of members) {
    const p=data.points.get(hex),w=hex.offsetWidth,h=hex.offsetHeight;
    const corners=[[.5,0],[1,.25],[1,.75],[.5,1],[0,.75],[0,.25]].map(([x,y])=>[p.x+x*w,p.y+y*h]);
    for(let i=0;i<6;i++) {const a=corners[i],b=corners[(i+1)%6],id=[vertex(a),vertex(b)].sort().join('|');if(edges.has(id)) edges.delete(id);else edges.set(id,`M${a}L${b}`);}
  }
  return [...edges.values()].join('');
}
function footprintOverlay(grid) {
  ensureStyles();
  let overlay=grid.querySelector(':scope > .entity-footprint-overlay');
  if(!overlay) {overlay=document.createElementNS('http://www.w3.org/2000/svg','svg');overlay.classList.add('entity-footprint-overlay');overlay.setAttribute('aria-hidden','true');grid.append(overlay);}
  return overlay;
}
function syncOccupiedCells(registry,cells) {
  for(const hex of cells) {
    const records=boardOccupantsAt(registry.model,hex.dataset.position);
    const occupant=records.find(record=>record.movable);
    if(occupant) {
      hex.dataset.footprintOwner=occupant.id;hex.dataset.occupiedBy=occupant.id;hex.classList.add('occupied');
      hex.querySelector('.socle')?.style.removeProperty('opacity');
    } else if(hex.dataset.footprintOwner) {
      delete hex.dataset.footprintOwner;delete hex.dataset.occupiedBy;
      if(!records.length) hex.classList.remove('occupied');
    }
  }
}
function renderEntityFootprints(grid,occupants) {
  const overlay=footprintOverlay(grid),data=geometry(grid);
  for(const occupant of occupants) {
    if(!occupant.movable || !occupant.members.length) continue;
    const {box,entity,members}=occupant,origin=data.points.get(occupant.anchor),p=center(members);
    box.dataset.occupiedPositions=members.map(hex=>hex.dataset.position).join(' ');
    box.style.left=`${p.x-origin.x}px`;box.style.top=`${p.y-origin.y}px`;
    entity.role=footprintRole(members,entity.role);updateRoleInDOM(entity);applyEntitySizeVisual(entity);
    let path=overlay.querySelector(`[data-footprint-entity="${CSS.escape(occupant.id)}"]`);
    if(members.length>1) {
      if(!path) {path=document.createElementNS(overlay.namespaceURI,'path');path.dataset.footprintEntity=entity.id;overlay.append(path);}
      path.setAttribute('d',outline(members));path.setAttribute('fill','none');path.setAttribute('stroke',entity.side==='B'?'#ee9292':'#ebd68c');path.setAttribute('stroke-width','3');
    } else path?.remove();
  }
}
export function syncEntityFootprints(grid=document.getElementById('hexGrid')) {
  if(!grid) return;
  const registry=rebuildBoardOccupancy(grid);
  footprintOverlay(grid).replaceChildren();
  syncOccupiedCells(registry,registry.geometry.cells);
  renderEntityFootprints(grid,[...registry.model.occupants.keys()].map(id=>getOccupantView(registry,id)));
}
function visibleOrigin(entity) {
  const motion=motions.get(String(entity.id));
  if(motion) {const t=motion.animation.effect?.getComputedTiming?.().progress ?? 1;return {x:motion.from.x+(motion.to.x-motion.from.x)*t,y:motion.from.y+(motion.to.y-motion.from.y)*t};}
  const members=entityFootprint(entity);return members.length?center(members):null;
}
function clearMotion(id) {const motion=motions.get(String(id));if(!motion) return;globalThis.clearTimeout(motion.timer);motion.animation.cancel();motion.smoke.remove();motions.delete(String(id));notifyTargetGeometryChanged(motion.box);}
export function clearFootprintAnimations() {for(const id of motions.keys()) clearMotion(id);}
export function releaseEntityFootprint(entity) {
  const box=boxFor(entity),grid=gridFor(box?.closest('.hex'));clearMotion(entity.id);
  const registry=boardOccupancy(grid),record=registry?getOccupantView(registry,String(entity.id)):null;
  if(box) {box.dataset.footprintReleased='true';delete box.dataset.occupiedPositions;}
  if(!grid) return;
  removeOccupant(registry,record);
  for(const hex of record?.members||[]) if(hex.dataset.footprintOwner===String(entity.id)) {
    delete hex.dataset.footprintOwner;delete hex.dataset.occupiedBy;
    if(!getFootprintOccupant(hex)) hex.classList.remove('occupied');
  }
  grid.querySelector(`[data-footprint-entity="${entity.id}"]`)?.remove();
}
function animatePlacement(entity,from) {
  if(!from || globalThis.__combatSimulation || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box=boxFor(entity),to=center(entityFootprint(entity));if(!box || Math.hypot(from.x-to.x,from.y-to.y)<.1) return;
  const animation=box.animate([{transform:`translate(${from.x-to.x}px,${from.y-to.y}px)`},{transform:'translate(0px,0px)'}],{duration:420,easing:'cubic-bezier(.22,.65,.3,1)',fill:'both'});
  const smoke=new Image();smoke.className='entity-footprint-smoke';smoke.alt='';smoke.src=new URL(`../../media/assets/effects/dodge-smoke.gif#push-${++smokeSequence}`,import.meta.url).href;
  (box.querySelector('.drag-box')||box).append(smoke);
  const motion={animation,from,to,smoke,box,timer:0};motions.set(String(entity.id),motion);
  notifyTargetGeometryChanged(box);
  motion.timer=globalThis.setTimeout(()=>{if(motions.get(String(entity.id))===motion) clearMotion(entity.id);},600);
}
export function commitEntityPlacements(plan,{animate=false,persist=false,notify=false,forced=false}={}) {
  if(!plan?.valid) return false;
  const requests=[...plan.moves.values()],check=planEntityPlacements(requests,{allowGroundConsumables:plan.allowGroundConsumables===true});
  if(!check.valid || requests.some(({entity})=>!boxFor(entity))) return false;
  const starts=new Map(requests.map(({entity})=>[String(entity.id),visibleOrigin(entity)]));
  const registry=boardOccupancy(plan.grid),dirtyCells=new Set();
  // Publish the entire logical move before updating the HTML views or notifying combat.
  for(const {entity} of requests) {
    const previous=getOccupantView(registry,String(entity.id));
    previous?.members.forEach(hex=>dirtyCells.add(hex));
  }
  applyBoardPlacements(registry.model,check.logical);
  for(const {entity,hex,size} of requests) {
    const box=boxFor(entity);clearMotion(entity.id);entity.sizeInCells=size;
    entity.position=entity.battlePosition=box.dataset.position=hex.dataset.position;
    hex.append(box);
    if(box.dataset.footprintReleased==='true') removeOccupant(registry,{id:String(entity.id)});
    else registry.views.set(String(entity.id),{entity,box});
    entityFootprint(entity,hex).forEach(cell=>dirtyCells.add(cell));
  }
  syncOccupiedCells(registry,dirtyCells);
  renderEntityFootprints(plan.grid,requests.map(({entity})=>getOccupantView(registry,String(entity.id))).filter(Boolean));
  for(const {entity,hex} of requests) {
    if(persist) saveEntityPositionState(entity);
    if(notify) {notifyProjectileTargetMoved(entity);if(forced) recordEntityCombatMovement(entity,{forced:true});}
    hex.dispatchEvent(new Event('hexOccupied'));
    if(animate) animatePlacement(entity,starts.get(String(entity.id)));
    notifyTargetGeometryChanged(boxFor(entity));
  }
  return true;
}
export function setEntitySizeInCells(entity,size,{push=true,animate=true,temporary=false}={}) {
  size=Number(size);
  if(!ENTITY_SIZE_OPTIONS.includes(size)) return {valid:false,reason:'Taille invalide : 1, 2, 3 ou 6 cases.'};
  const baseSize=size;
  if(!temporary && entity._gigantismBaseSize != null) size=Math.max(size,...Object.values(entity.controlEffects||{})
    .filter(state=>state.kind==='gigantisme').map(state=>state.effect.effectSize));
  const updateBase=()=>{if(!temporary && entity._gigantismBaseSize != null) entity._gigantismBaseSize=baseSize;};
  const anchor=boxFor(entity)?.closest('.hex');
  if(!anchor) {entity.sizeInCells=size;updateBase();return {valid:true};}
  if(entitySizeInCells(entity)===size) {updateBase();return {valid:true};}
  const plan=planEntityPlacements([{entity,hex:anchor,size}],{push});
  if(!plan.valid) return plan;
  if(!commitEntityPlacements(plan,{animate,persist:!temporary})) return {valid:false,reason:'Le placement a changé.'};
  updateBase();
  for(const id of plan.pushed) {const other=plan.moves.get(id).entity;recordEntityCombatMovement(other,{forced:true});notifyProjectileTargetMoved(other);}
  document.dispatchEvent(new Event('projectileTargetsMoved'));
  return plan;
}
export function groupedHexDistance(first,second) {
  const members=hex=>{const box=getFootprintOccupant(hex);const entity=box&&entites.find(e=>String(e.id)===box.id.replace('Box_Entite_',''));return entity?entityFootprint(entity):[hex];};
  return footprintDistance(members(first),members(second));
}
export function footprintDistance(first,second) {
  let best=Infinity;
  for(const a of first) for(const b of second) {
    const c1=readHexCoordinates(a),c2=readHexCoordinates(b);
    best=Math.min(best,axialDistance(offsetToAxial(c1.row,c1.col),offsetToAxial(c2.row,c2.col)));
  }
  return best;
}
document.addEventListener('visibilitychange',()=>{if(document.hidden) clearFootprintAnimations();});

// Déplacements provoqués par les effets : Grab, mouvement aléatoire et swap.
// Odd-row offset coordinates used by createHexGrid, converted to cube distance.
export function hexDistance(first, second) {
  const a=readHexCoordinates(first),b=readHexCoordinates(second);
  if(![a.row,a.col,b.row,b.col].every(Number.isFinite)) return Infinity;
  return axialDistance(offsetToAxial(a.row,a.col),offsetToAxial(b.row,b.col));
}

function commitPositions(moves, effect = null) {
  const plan = planEntityPlacements(moves);
  if (!plan.valid) return false;
  const prepared = moves.map(({ entity, hex }) => ({ entity, hex,
    box: document.getElementById(`Box_Entite_${entity.id}`) }));
  if (prepared.some(({ box, hex }) => !box || !hex?.isConnected)) return false;
  if (!commitEntityPlacements(plan, { animate: true })) return false;
  for (const { entity, hex } of prepared) {
    hex.classList.add('occupied', `Side${entity.side}`);
    hex.dataset.occupiedBy = entity.id;
    saveEntityPositionState(entity);
    recordEntityCombatMovement(entity, { forced: true });
    notifyProjectileTargetMoved(entity, effect);
    hex.dispatchEvent(new Event('hexOccupied'));
  }
  notifyCombatAction();
  return true;
}

export function pullEntityToward(target, attacker, distance = 5, effect = null) {
  const origin = document.getElementById(`Box_Entite_${target.id}`)?.closest('.hex');
  const anchor = document.getElementById(`Box_Entite_${attacker.id}`)?.closest('.hex');
  if (!origin || !anchor || origin === anchor) return false;
  const grid = origin.closest('.hex-grid') || origin.parentElement;
  const attackerCells = entityFootprint(attacker, anchor);
  const separation = footprintDistance(entityFootprint(target, origin), attackerCells);
  const candidates = [...grid.querySelectorAll('.hex[data-position]')].filter(hex =>
    hex !== origin && hexDistance(origin, hex) <= Math.max(0, Math.floor(distance))
    && footprintDistance(entityFootprint(target, hex), attackerCells) < separation
    && planEntityPlacements([{entity:target,hex}]).valid);
  // Exactly the free-cell proximity selector used by chest/summon placement.
  const destination = findNearestAvailableHex(anchor, candidates, { excludeElement: document.getElementById(`Box_Entite_${target.id}`) });
  return destination ? commitPositions([{ entity: target, hex: destination }], effect) : false;
}

export function moveEntityRandomly(entity, random = Math.random, effect = null) {
  if (isEntityMovementBlocked(entity) || entity.hasFled || entity.isDEAD) return false;
  const origin = document.getElementById(`Box_Entite_${entity.id}`)?.closest('.hex');
  const grid = origin?.closest('.hex-grid') || origin?.parentElement;
  if (!grid) return false;
  const cells = [...grid.querySelectorAll('.hex[data-position]')].filter(hex =>
    hexDistance(origin, hex) === 1 && planEntityPlacements([{entity,hex}]).valid);
  if (!cells.length || !consumeEntityMovement(entity).allowed) return false;
  updateMovementDisplay(entity);
  return commitPositions([{ entity, hex: cells[Math.min(cells.length-1, Math.floor(random()*cells.length))] }], effect);
}

export function swapEntitiesFromEffect(attacker, first, second, effect = { type: ['entrave'], forcedMovement: true }) {
  if (!first || !second || first === second || first.isDEAD || second.isDEAD) return false;
  const a = document.getElementById(`Box_Entite_${first.id}`)?.closest('.hex');
  const b = document.getElementById(`Box_Entite_${second.id}`)?.closest('.hex');
  if (!a || !b || a === b) return false;
  // Validate both differently sized footprints before resistance rolls or any mutation.
  if (!planEntityPlacements([{entity:first,hex:b},{entity:second,hex:a}]).valid) return false;
  // All resistance checks precede both position changes and consume no movement.
  for (const entity of [first, second]) {
    const resistance = attemptAlterationResistance(attacker, entity, effect);
    if (resistance.canceled) {
      recordEntityCombatProc(entity, resistance.kind);
      return false;
    }
  }
  return commitPositions([{ entity: first, hex: b }, { entity: second, hex: a }], effect);
}
