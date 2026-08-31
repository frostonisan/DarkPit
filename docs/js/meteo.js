let meteoPaused = false;
let animationFrameId = null;
let activeEffects = {}; // Stocke les données de chaque effet météo

export function clearBiomeEffects() {
    if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    activeEffects = {};
    document.getElementById('meteo-fx')?.remove();
    document.getElementById('ground-fx')?.remove();
}

document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
        meteoPaused = true;
        cancelAnimationFrame(animationFrameId);
    } else {
        meteoPaused = false;
        animate();
    }
});

// Fonction générique pour initialiser un canvas si non existant
export function initCanvas(parentElement, canvasId, initFunction) {
    let existingCanvas = document.getElementById(canvasId);
    if (!existingCanvas) {
        const canvas = document.createElement('canvas');
        canvas.id = canvasId;
        canvas.width = 1536; // Largeur fixe
        canvas.height = 676; // Hauteur fixe
        parentElement.appendChild(canvas);
        initFunction(canvasId); // Appeler la fonction d'initialisation spécifique
    } else {
        console.log(`Un canvas pour ${canvasId} existe déjà.`);
    }
}

function animate() {
    if (meteoPaused) return;

    Object.keys(activeEffects).forEach(effect => {
        const { ctx, elements, update, draw } = activeEffects[effect];

        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        elements.forEach(element => {
            update(element);
            draw(ctx, element);
        });
    });

    animationFrameId = requestAnimationFrame(animate);
}

export function handleMeteo(meteoString, biomeClass) {
    // Récupérer ou créer la div parente "meteo-fx"
	let gameContainer = document.getElementById('game-windows');
    let existingMeteo = document.getElementById('meteo-fx');
    if (!existingMeteo) {
        existingMeteo = document.createElement('div');
        existingMeteo.id = 'meteo-fx';
        existingMeteo.className = `meteo-fx ${biomeClass}`;
        gameContainer.appendChild(existingMeteo); 
    }

    // Diviser les types de météo
    let meteoTypes = meteoString.split(',').map(type => type.trim());

    // Gérer les effets météo
    meteoTypes.forEach(meteoType => {
        // Vérifier si l'effet météo existe déjà dans la div parente
        let meteoElement = document.getElementById(`meteo-${meteoType}`);

        if (!meteoElement) {
            const meteo = document.createElement('div');
            meteo.id = `meteo-${meteoType}`;
            meteo.className = `meteo ${meteoType} ${biomeClass}`;
            existingMeteo.appendChild(meteo);

            // Appliquer les effets météo en fonction du type
            switch (meteoType) {
                case 'snowstorm':
                    initCanvas(meteo, 'snowCanvas', initSnowstorm);
                    break;
                case 'sunray':
                    initCanvas(meteo, 'sunrayCanvas', initSunray);
                    break;
                case 'waterDrop':  // Nouveau cas pour l'effet "waterDrop"
                    initCanvas(meteo, 'waterDropCanvas', initWaterDrop); // Initialiser le canvas pour les gouttes d'eau
                    break;
                default:
                    console.log(`Aucun effet météo spécifique pour: ${meteoType}`);
                    break;
            }
        } else {
            // console.log(`Un élément météo pour ${meteoType} existe déjà.`);
        }
    });
}

// Gestion des effets de sol (ground_fx)
export function handleGroundFx(groundFxString, biomeClass) {
    const hexGrid = document.getElementById('hexGrid');

    if (hexGrid) {
        // Récupérer ou créer la div parente "ground-fx"
        let groundFxContainer = document.getElementById('ground-fx');
        if (!groundFxContainer) {
            groundFxContainer = document.createElement('div');
            groundFxContainer.id = 'ground-fx';
            groundFxContainer.className = `ground-fx-container ${biomeClass}`;
            hexGrid.appendChild(groundFxContainer);
        }

        // Diviser les types de ground_fx
        let groundFxTypes = groundFxString.split(',').map(type => type.trim());

        // Gérer les effets ground FX
        groundFxTypes.forEach(groundFxType => {
            let groundFxElement = document.getElementById(`ground-fx-${groundFxType}`);

            if (!groundFxElement) {
                const groundFx = document.createElement('div');
                groundFx.id = `ground-fx-${groundFxType}`;
                groundFx.className = `ground-fx ${groundFxType} ${biomeClass}`;
                groundFxContainer.appendChild(groundFx);

                switch (groundFxType) {
                    case 'droplet':
                        initCanvas(groundFx, 'dropletCanvas', initDroplet);
                        break;
                    case 'swampFog':
                        swampFog(); // Appel à la fonction swampFog pour ajouter les éléments
                        break;
                    default:
                        console.log(`Aucun effet de sol spécifique pour: ${groundFxType}`);
                        break;
                }
            } else {
                console.log(`Un effet ground FX pour ${groundFxType} existe déjà.`);
            }
        });
 }
}

// FX TEMPETE DE NEIGE
export function initSnowstorm(canvasId) {
    const canvas = document.getElementById(canvasId);
    const ctx = canvas.getContext('2d');


    class Particle {
        constructor() {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * canvas.height;
            this.speedX = Math.random() * 3 + 2;
            this.speedY = Math.random() * 2 - 1;
            this.size = Math.random() * 3 + 1;
            this.alpha = Math.random();
        }

        update() {
            this.x += this.speedX;
            this.y += this.speedY;

            if (this.x > canvas.width || this.y > canvas.height || this.y < 0) {
                this.x = 0;
                this.y = Math.random() * canvas.height;
                this.speedX = Math.random() * 3 + 2;
            }
        }

        draw(ctx) {
            ctx.globalAlpha = this.alpha;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        }
    }

    // Ajoute l’effet météo dans `activeEffects`
    activeEffects.snowstorm = {
        ctx,
        elements: Array.from({ length: 800 }, () => new Particle()),
        update: element => element.update(),
        draw: (ctx, element) => element.draw(ctx),
    };

    animate();
}

//SUN EFFECT
export function initSunray(canvasId) {
    const canvas = document.getElementById(canvasId);
    const ctx = canvas.getContext('2d');



    // Constantes pour la configuration des rayons
    const commonAngle = Math.PI / 6;
    const numberOfRays = 50;
    const minFadeInSpeed = 0.002;
    const maxFadeInSpeed = 0.005;
    const minFadeOutSpeed = 0.002;
    const maxFadeOutSpeed = 0.005;
    const minLength = 80;
    const maxLength = 330;
    const yOffset = -30;

    // Classe pour représenter un rayon de soleil
    class SunRay {
        constructor() {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * yOffset;
            this.length = Math.random() * (maxLength - minLength) + minLength;
            this.width = Math.random() * 20 + 5;
            this.opacity = 0;
            this.fadeInSpeed = Math.random() * (maxFadeInSpeed - minFadeInSpeed) + minFadeInSpeed;
            this.fadeOutSpeed = Math.random() * (maxFadeOutSpeed - minFadeOutSpeed) + minFadeOutSpeed;
            this.appearing = true;
        }

        update() {
            if (this.appearing) {
                this.opacity += this.fadeInSpeed;
                if (this.opacity >= 0.7) this.appearing = false;
            } else {
                this.opacity -= this.fadeOutSpeed;
                if (this.opacity <= 0) this.reset();
            }
        }

        reset() {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * yOffset;
            this.length = Math.random() * (maxLength - minLength) + minLength;
            this.width = Math.random() * 20 + 5;
            this.opacity = 0;
            this.appearing = true;
        }

        draw(ctx) {
            ctx.save();
            ctx.globalAlpha = this.opacity;
            ctx.translate(this.x, this.y);
            ctx.rotate(commonAngle);

            const gradient = ctx.createLinearGradient(0, 0, 0, this.length);
            gradient.addColorStop(0, `rgba(255, 255, 255, ${this.opacity})`);
            gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.1)');
            gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, this.width, this.length);
            ctx.restore();
        }
    }

    // Ajoute l’effet "sunray" dans `activeEffects`
    activeEffects.sunray = {
        ctx,
        elements: Array.from({ length: numberOfRays }, () => new SunRay()),
        update: element => element.update(),
        draw: (ctx, element) => element.draw(ctx),
    };

    animate(); // Lancer l'animation globale
}

//DROPLET
export function initDroplet(canvasId) {
    const canvas = document.getElementById(canvasId);

    if (!canvas) {
        console.error(`Le canvas avec l'ID '${canvasId}' n'a pas été trouvé.`);
        return;
    }

    const ctx = canvas.getContext('2d');

    function resizeCanvas() {
        canvas.width = 4000; // Largeur plus grande
        canvas.height = 600;  // Hauteur plus grande
    }

    resizeCanvas();

    let circles = [];
    let numberOfCircles = 1;
    let rippleDuration = 2000;
    let animationFrameId = null;

    class Circle {
        constructor(x, y) {
            this.x = x;
            this.y = y;
            this.radius = 0;
            this.opacity = 1;
            this.maxRadius = Math.random() * 50 + 50;
            this.growthRate = this.maxRadius / (rippleDuration / 60);
            this.fadeRate = 1 / (rippleDuration / 60);
        }

        draw() {
            if (this.opacity > 0) {
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2, false);
                ctx.strokeStyle = `rgba(255, 255, 255, ${this.opacity})`;
                ctx.stroke();
            }
        }

        update() {
            if (this.radius < this.maxRadius) {
                this.radius += this.growthRate;
                this.opacity -= this.fadeRate;
            } else {
                this.opacity = 0;
            }
        }
    }

    function generateCircles() {
        for (let i = 0; i < numberOfCircles; i++) {
            const x = Math.random() * canvas.width;
            const y = Math.random() * canvas.height;
            circles.push(new Circle(x, y));
        }
    }

    function animate() {
        if (document.hidden) return;  // Stop si la fenêtre est inactive

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        for (let i = 0; i < circles.length; i++) {
            circles[i].update();
            circles[i].draw();
            if (circles[i].opacity <= 0) {
                circles.splice(i, 1);
                i--;
            }
        }
        animationFrameId = requestAnimationFrame(animate);
    }

    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => resizeCanvas(), 200);
    });

    setInterval(() => {
        if (!document.hidden) generateCircles(); // Pas de génération si inactif
    }, 500);

    document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
            cancelAnimationFrame(animationFrameId);
        } else {
            animate();
        }
    });

    animate();
}


function swampFog() {
    // Récupérer l'élément parent #ground-fx
    const groundFX = document.getElementById('ground-fx');

    if (!groundFX) {
        console.error('Le parent #ground-fx est introuvable dans le DOM');
        return;
    }

    // // Appliquer un dégradé d'opacité progressif du haut vers le bas sur 50px
    // const fadeMaskStyle = 'linear-gradient(to bottom, rgba(0, 0, 0, 0) 0px, rgba(0, 0, 0, 1) 50px)';

    // Créer le premier élément div
    const groundMisc1 = document.createElement('div');
    groundMisc1.classList.add('ground-fx', 'swampFog');
    groundMisc1.style.backgroundImage = 'url("./media/assets/meteo/swampFog-01.png")';
    // groundMisc1.style.maskImage = fadeMaskStyle; // Appliquer le dégradé inverse pour l'opacité
    // groundMisc1.style.webkitMaskImage = fadeMaskStyle; // Compatibilité avec Webkit

    // Créer le deuxième élément div
    const groundMisc2 = document.createElement('div');
    groundMisc2.classList.add('ground-fx', 'swampFog2');
    groundMisc2.style.backgroundImage = 'url("./media/assets/meteo/swampFog-02.png")';
    // groundMisc2.style.maskImage = fadeMaskStyle; // Appliquer le dégradé inverse pour l'opacité
    // groundMisc2.style.webkitMaskImage = fadeMaskStyle; // Compatibilité avec Webkit

    // Ajouter les deux éléments sous #hexgrid
    groundFX.appendChild(groundMisc1);
    groundFX.appendChild(groundMisc2);
}

export function initWaterDrop(canvasId, options) {
    const canvas = document.getElementById(canvasId);
    const ctx = canvas.getContext('2d');

    // Options par défaut
    const defaults = {
        dropsPerMinute: 10,       // Nombre de gouttes par minute
        minSize: 1,               // Taille minimale des gouttes
        maxSize: 3,               // Taille maximale des gouttes
        dropOpacity: 0.9,         // Opacité initiale des gouttes
        dropColor: '#ffffff',     // Couleur des gouttes (par défaut blanc)
        maxFallDistance: 325,     // Distance maximale de chute pour la plus petite goutte
        blurAmount: 1,            // Niveau de flou
        baseSpeed: 2              // Vitesse de base des gouttes
    };

    // Fusion des options par défaut avec celles passées en argument
    const settings = { ...defaults, ...options };

    const drops = [];
    let lastDropTime = 0;
    const dropInterval = 60000 / settings.dropsPerMinute;

    // Fonction pour créer une goutte
    function createDrop() {
        const size = Math.random() * (settings.maxSize - settings.minSize) + settings.minSize;
        const x = Math.random() * canvas.width;
        
        // Calculer une distance de chute plus longue pour les gouttes plus grosses
        const sizeFactor = size / settings.maxSize; // Proportion de la taille de la goutte
        const fallDistance = settings.maxFallDistance * (0.5 + sizeFactor); // Plus grosse = chute plus longue

        const drop = {
            x,
            y: 0,
            size,
            speed: settings.baseSpeed * (fallDistance / 100), // Vitesse proportionnelle à la distance
            opacity: settings.dropOpacity,
            color: settings.dropColor,
            fallDistance,
            blur: settings.blurAmount,
        };
        drops.push(drop);
    }

    // Fonction pour dessiner une goutte sous forme d'ovale (goutte étirée verticalement)
    function drawOval(x, y, width, height, color, opacity) {
        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.ellipse(x, y, width, height, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // Fonction pour appliquer l'effet de flou
    function applyBlur(blur) {
        ctx.filter = `blur(${blur}px)`;
    }

    // Fonction pour mettre à jour la position des gouttes
    function updateDrops() {
        const currentTime = Date.now();
        if (currentTime - lastDropTime >= dropInterval) {
            createDrop();
            lastDropTime = currentTime;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        for (let i = drops.length - 1; i >= 0; i--) {
            const drop = drops[i];
            drop.y += drop.speed;

            // Appliquer l'effet de flou
            applyBlur(drop.blur);

            // Calculer la nouvelle opacité pour le fondu
            const fadeOutStart = drop.fallDistance * 0.8;
            if (drop.y > fadeOutStart) {
                drop.opacity -= 0.02; // Réduire l'opacité
                if (drop.opacity < 0) drop.opacity = 0; // Éviter les valeurs négatives
            }

            // Dessiner la goutte sous forme d'ovale (étirée verticalement)
            const ovalWidth = drop.size;  // Largeur du cercle
            const ovalHeight = drop.size * 2; // Hauteur étirée
            drawOval(drop.x, drop.y, ovalWidth, ovalHeight, drop.color, drop.opacity);

            // Supprimer la goutte si elle atteint la fin de sa chute ou devient invisible
            if (drop.y > drop.fallDistance || drop.opacity <= 0) {
                drops.splice(i, 1); // Supprimer la goutte du tableau
            }
        }

        // Réinitialiser le filtre de flou
        ctx.filter = 'none';

        requestAnimationFrame(updateDrops);
    }

    // Démarrer l'animation
    updateDrops();
}


export function glitterStuff(selector, maxGlitters = 4) {
  const baseSpeed = 2000;
  const variation = (4 - maxGlitters) * 0.4;
  const glitterSpeed = Math.round(baseSpeed * (1 + variation));

  const targets = document.querySelectorAll(selector);

  targets.forEach(element => {
    let container = element.querySelector('.glitter-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'glitter-container';
      element.appendChild(container);
    }

    function spawnGlitter() {
      if (container.querySelectorAll('.glitter').length >= maxGlitters) return;

      const glitter = document.createElement('div');
      glitter.className = 'glitter';

      // Variation aléatoire de la vitesse ±10%
      const speedFactor = 0.9 + Math.random() * 0.4;
      const thisGlitterSpeed = Math.round(glitterSpeed * speedFactor);
      glitter.style.setProperty('--speed', `${thisGlitterSpeed}ms`);

      // Variation aléatoire de la taille ±10%
      const baseSize = 15;
      const sizeFactor = 0.9 + Math.random() * 0.2;
      const size = Math.round(baseSize * sizeFactor);
      glitter.style.width = `${size}px`;
      glitter.style.height = `${size}px`;

      const w = container.offsetWidth - size;
      const h = container.offsetHeight - size;
      glitter.style.left = `${Math.random() * w}px`;
      glitter.style.top = `${Math.random() * h}px`;

      container.appendChild(glitter);
      setTimeout(() => glitter.remove(), thisGlitterSpeed);
    }

    // Fonction récursive avec variation d'intervalle ±10%
    function loopSpawn() {
      spawnGlitter();

      const baseInterval = glitterSpeed / maxGlitters;
      const intervalFactor = 0.9 + Math.random() * 0.4; // ±10%
      const nextInterval = Math.round(baseInterval * intervalFactor);

      setTimeout(loopSpawn, nextInterval);
    }

    loopSpawn();
  });
}

export function glitterLoot(selector, maxGlitters = 15) {
  const random = (min, max) => Math.random() * (max - min) + min;

  document.querySelectorAll(selector).forEach(element => {
    let container = element.querySelector(
      ':scope > .glitter-loot-container'
    );

    if (!container) {
      container = document.createElement('div');
      container.className = 'glitter-loot-container';
      element.appendChild(container);
    }

    if (container.dataset.initialized === 'true') return;
    container.dataset.initialized = 'true';

    const fragment = document.createDocumentFragment();

    for (let i = 0; i < maxGlitters; i++) {
      const glitter = document.createElement('img');

      Object.assign(glitter, {
        className: 'glitter-loot',
        src: './media/assets/misc/glitter-loot.svg',
        alt: '',
        draggable: false
      });

      glitter.setAttribute('aria-hidden', 'true');

      const properties = {
        '--size': `${random(15, 35)}px`,
        '--x': `${random(8, 92)}%`,
        '--y': `${random(25, 90)}%`,
        '--duration': `${random(3, 7)}s`,
        '--delay': `${random(-7, 0)}s`,
        '--move-x': `${random(-55, 55)}px`,
        '--move-y': `${random(50, 150)}px`,
        '--rotation': `${random(-180, 180)}deg`
      };

      Object.entries(properties).forEach(([property, value]) => {
        glitter.style.setProperty(property, value);
      });

      fragment.appendChild(glitter);
    }

    container.appendChild(fragment);
  });
}

export function disperseLootGlitter(target, {
  maxGlitters = 12,
  durationMin = 4200,
  durationMax = 5200,
  fadeDelay = null,
  fadeDuration = null
} = {}) {
  const random = (min, max) => Math.random() * (max - min) + min;
  const parseTime = (value, fallback) => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const text = String(value ?? '').trim();
    if (!text) return fallback;
    const numeric = Number.parseFloat(text);
    if (!Number.isFinite(numeric)) return fallback;
    return text.endsWith('ms') ? numeric : text.endsWith('s') ? numeric * 1000 : numeric;
  };
  const elements = typeof target === 'string'
    ? document.querySelectorAll(target)
    : target instanceof Element
      ? [target]
      : [];

  elements.forEach((element) => {
    if (!element || element.dataset.glitterDispersing === 'true') return;

    const container = element.matches?.('.glitter-loot-container')
      ? element
      : element.querySelector('.glitter-loot-container');
    if (!container || container.classList.contains('is-dispersing')) return;

    const sourceGlitters = [...container.querySelectorAll(':scope > .glitter-loot')].slice(0, maxGlitters);
    if (sourceGlitters.length === 0) {
      return;
    }

    element.dataset.glitterDispersing = 'true';
    container.classList.add('is-dispersing');
    container.classList.remove('is-fading');
    const style = getComputedStyle(container);
    const resolvedFadeDelay = parseTime(fadeDelay ?? style.getPropertyValue('--glitter-dispersal-fade-delay'), 3000);
    const resolvedFadeDuration = parseTime(fadeDuration ?? style.getPropertyValue('--glitter-dispersal-fade-duration'), 2000);

    const hostRect = container.getBoundingClientRect();
    const centerX = hostRect.width / 2;
    const centerY = hostRect.height / 2;

    sourceGlitters.forEach((sourceGlitter) => {
      const sourceRect = sourceGlitter.getBoundingClientRect();
      const x = sourceRect.left - hostRect.left + sourceRect.width / 2;
      const y = sourceRect.top - hostRect.top + sourceRect.height / 2;
      const angle = Math.atan2(y - centerY, x - centerX) + random(-0.16, 0.16);
      const directionX = Math.cos(angle) || random(-1, 1);
      const directionY = Math.sin(angle) || random(-1, 1);
      const distance = random(80, 150);
      const duration = random(durationMin, durationMax);

      sourceGlitter.classList.add('is-dispersing');
      sourceGlitter.style.setProperty('--x', `${x}px`);
      sourceGlitter.style.setProperty('--y', `${y}px`);
      sourceGlitter.style.setProperty('--burst-x', `${directionX * distance}px`);
      sourceGlitter.style.setProperty('--burst-y', `${directionY * distance}px`);
      sourceGlitter.style.setProperty('--burst-rotation', `${random(-220, 220)}deg`);
      sourceGlitter.style.setProperty('--burst-duration', `${duration}ms`);
    });

    setTimeout(() => {
      container.classList.add('is-fading');
    }, resolvedFadeDelay);

    setTimeout(() => {
      container.remove();
      delete element.dataset.glitterDispersing;
    }, resolvedFadeDelay + resolvedFadeDuration);
  });
}


export function startArchup() {

  const canvas = document.getElementById('archup');
  const ctx = canvas.getContext('2d');

  // Dimension simple du canvas
  canvas.width  = 800;
  canvas.height = 800;

  let particles = [];
  let phase = 0; 
  let t = 0;

  function resetAnimation(){
    phase = 1;
    t = 0;
    particles = [];
  }

  function createExplosion(){
    const x = canvas.width / 2;
    const y = canvas.height / 2;
    for(let i = 0; i < 200; i++){
      particles.push({
        x, y,
        vx: (Math.random() * 4 - 2) * 5,
        vy: (Math.random() * 4 - 2) * 5,
        life: 1,
        size: Math.random() * 4 + 2
      });
    }
  }

  function animate(){
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const x = canvas.width / 2;
    const y = canvas.height / 2;

    if(phase === 1){ // FLARE
      t += 0.03;
      const flareW = Math.min(400 / 2, t * 200);
      const flareH = 10;
      const g = ctx.createLinearGradient(x - flareW, y, x + flareW, y);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.5, 'rgba(255,215,120,0.8)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - flareW, y - flareH / 2, flareW * 2, flareH);

      if(t > 2) phase = 2;
    }

    if(phase === 2){ // SPHERE APPEAR
      t += 0.03;
      const radius = Math.min(200 / 5, t * 20);

      const grad = ctx.createRadialGradient(x, y, 0, x, y, radius * 3);
      grad.addColorStop(0, 'rgba(255,220,120,0.9)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;

      ctx.beginPath();
      ctx.arc(x, y, radius * 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'white';
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();

      if(radius >= 200 / 5){
        phase = 3;
        createExplosion();
      }
    }

    if(phase === 3){ // EXPLOSION
      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.02;

        ctx.fillStyle = `rgba(255,220,120,${p.life})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      });

      particles = particles.filter(p => p.life > 0);

      if(particles.length === 0){
        return; // STOP
      }
    }

    requestAnimationFrame(animate);
  }

  resetAnimation();
  animate();
}
