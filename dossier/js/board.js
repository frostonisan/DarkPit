import { scenarios } from './boardList.js';
import { positionnerEntites } from './load-entity.js';
import { hexRoles } from './role-rule.js';
import { levelBiome } from './level.js';
import { LevelUi } from './ui.js';
import { initCanvas, initDroplet, initSunray, initSnowstorm, handleMeteo, handleGroundFx } from './meteo.js';
import { createSoundManager } from './soundManager.js';
import { getOrCreateGameContainer } from './GameInit.js';

let hexesSideA = [];
let hexesNeutral = [];
let hexesSideB = [];
let matchingBiome = null;  
let currentAudioElement = null;

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
    playBiomeSound(); // Joue le son chaque fois que le biome change
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

// Fonction pour générer les éléments de décor (foreground et ground)
export function generateDecor(gameContainer, board, hexGrid) {
    // Vérifier que matchingBiome est défini avant d'utiliser ses propriétés
    if (matchingBiome && gameContainer) {
    const foreGround = document.createElement('div');
    foreGround.className = `foreground ${matchingBiome.classe}`;

    const foreGroundImage = document.createElement('img');
    foreGroundImage.className = `foreground-img ${matchingBiome.classe}`;  // Corriger la classe CSS dynamique
    // Utiliser la valeur de matchingBiome.foreground
    foreGroundImage.src = matchingBiome.foreground || 'media/decors/prison/Bas.png';
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
    Ground.style.backgroundImage = `url('${imageUrl}')`;

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
backGround.style.backgroundImage = `url('${backgroundUrl}')`;
        board.appendChild(backGround); 
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
    board.appendChild(hexGrid); // hexGrid est ajouté après le background

    boardGlobal.appendChild(board);
    gameContainer.appendChild(boardGlobal);

    // Appeler generateDecor pour ajouter les autres décors (foreground, ground)
    generateDecor(gameContainer, board, hexGrid);

    // Appeler playBiomeSound pour jouer le son du biome
    playBiomeSound();
}

// Fonction createHexGrid
export function createHexGrid() {
    const hexGrid = document.getElementById('hexGrid');
    if (!hexGrid) {
        console.error("L'élément #hexGrid est introuvable.");
        return;
    }
    hexGrid.style.overflow = 'visible';

    const { rows, cols, hexWidth, hexHeight, staggeredRowHeight, totalHexagons, scale } = calculateRowsAndCols();

    const effectiveHexWidth = hexWidth;
    const effectiveHexHeight = hexHeight;

    hexGrid.innerHTML = ''; // Effacer la grille existante

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

            const { role, span: roleSpan } = hexRoles(row, col, rows, cols, hexIdCounter, hex);
            hex.innerHTML = `<div class="socle ${role}"><div class="image-role-hex-info" ></div><div class="hex-details">${roleSpan}<span class="hex-number">${hexIdCounter}</span> - <span class="hex-coordinate">${hexCoordinate}</span></div></div>`;
            hex.setAttribute('data-role', `${role}`);
            hexIdCounter++;

            const additionalXOffset = (row % 2) ? effectiveHexWidth / 2 : 0;
            const hexLeft = col * effectiveHexWidth + additionalXOffset;
            const hexTop = row * staggeredRowHeight;

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

    // Appeler generateDecor pour ajouter le ground
    generateDecor(null, null, hexGrid);

    positionnerEntites(); 

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
    backgroundTop.style.top = scenario.backgroundTop;
    backgroundTop.style['background-size'] = scenario.backgroundSize;

    const boardGlobal = document.getElementsByClassName('board-global')[0];
    if (!boardGlobal) {
        console.error("L'élément .board-global est introuvable.");
        return;
    }
    boardGlobal.style.transform = scenario.boardGlobalTransform;
    boardGlobal.style.left = scenario.boardGlobalLeft;
    boardGlobal.style.top = scenario.boardGlobalTop;

    const { rows, cols, hexagons } = scenario;
    createHexGrid(rows, cols, hexagons);
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

