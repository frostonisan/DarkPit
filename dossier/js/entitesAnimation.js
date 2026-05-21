import { EffectMessage } from './attackEffectMecanics.js'; 
import { QuitCurrentLevel } from './game.js';

let originalImages = {};

// export function setAllEntitiesToIddle(entities) {
    // entities.forEach(entity => {
        // const dragSprite = document.getElementById(`DragSprite_${entity.id}`);
        // if (dragSprite) {
            // dragSprite.classList.add("iddle");
        // }
    // });
// }

export function addIddle(sprite) {
    if (sprite && !sprite.classList.contains("iddle")) {
        sprite.classList.add("iddle");
    }
}

export function removeIddle(sprite) {
    if (sprite && sprite.classList.contains("iddle")) {
        sprite.classList.remove("iddle");
    }
}


// TEINTER CANVAS
export function entiteTinter(canvas, color, opacity = 0.6) {
    let ctx = canvas.getContext('2d');
    if (!ctx) {
        console.error(`❌ Impossible d'obtenir le contexte 2D pour canvas id: ${canvas.id}`);
        return;
    }

    // Restauration de l'image de base
    if (originalImages[canvas.id]) {
        ctx.putImageData(originalImages[canvas.id], 0, 0);
    }

    // Application de la teinte
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = `rgba(${color}, ${opacity})`; // color peut être "255, 0, 0" ou "255,255,0" etc.
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
}


const originalImageCache = new WeakMap();

// 💥 Pulsation de teinte pour signaler un impact
export function damageImpact(targetId) {
  const canvas = document.getElementById(`spriteCanvas_${targetId}`);
  if (!canvas) {
    console.warn(`⚠️ Canvas non trouvé pour targetId: ${targetId}`);
    return;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.error(`❌ Impossible d'obtenir le contexte 2D pour ${targetId}`);
    return;
  }

  // Capture initiale (une seule fois par canvas)
  if (!originalImageCache.has(canvas)) {
    try {
      originalImageCache.set(
        canvas,
        ctx.getImageData(0, 0, canvas.width, canvas.height)
      );
    } catch (e) {
      console.error("❌ getImageData a échoué :", e);
      return;
    }
  }

  // Effet sang : spawn une fois
  const effectsContainer = document.getElementById(`effectsContainer_${targetId}`);
  const idx = Math.floor(Math.random() * 4) + 1;

  // 👉 Ajoute la classe fx-X
  const fxClass = `fx-${idx}`;

  spawnEffectGif(effectsContainer, {
    className: `blood-impact ${fxClass}`,
    src: `/media/assets/effects/blood-impact-${idx}.gif`,
    lifetime: 800,
    offsetY: "10px"
  });

  const duration = 800;           // ms
  const maxOpacity = 0.6;         // pic de teinte
  let stopped = false;


  function restoreAndStop() {
    if (stopped) return;
    stopped = true;
    const img = originalImageCache.get(canvas);
    if (img) ctx.putImageData(img, 0, 0);
    // console.log(`✅ Fin de l'animation damageImpact pour ${targetId}`);
  }

  // Animation basée sur le temps (pulse sinusoïdal)
  let start;
  function animate(ts) {
    if (stopped) return;
    if (!document.body.contains(canvas)) return restoreAndStop(); // canvas retiré du DOM
    if (start === undefined) start = ts;

    const t = ts - start;
    const progress = Math.min(t / duration, 1); // 0 → 1
    const opacity = Math.sin(progress * Math.PI) * maxOpacity; // 0 → pic → 0

    // Applique la teinte rouge
    entiteTinter(canvas, "255, 0, 0", opacity);

    if (progress >= 1) return restoreAndStop();
    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
}

// Helper (inchangé sauf qu’on ne l’appelle plus à chaque frame)
function spawnEffectGif(container, { className, src, lifetime = 800, offsetY = null }) {
  if (!container) return;
  let img = container.querySelector(`.${className}`);
  if (!img) {
    img = document.createElement("img");
    img.className = className;
      container.appendChild(img);
  }
  img.src = `${src}?t=${Date.now()}`; // force le redémarrage du GIF
  

  clearTimeout(img._armorImpactTO);
  img._armorImpactTO = setTimeout(() => {
    if (img && img.parentNode) img.parentNode.removeChild(img);
  }, lifetime + 50);
}

// === Ta fonction existante, avec l’injection du GIF ===
export function damageArmorImpact(targetId) {
    const canvas = document.getElementById(`spriteCanvas_${targetId}`);
    if (!canvas) {
        console.warn(`⚠️ Canvas non trouvé pour targetId: ${targetId}`);
        return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
        console.error(`❌ Impossible d'obtenir le contexte 2D pour ${targetId}`);
        return;
    }

    // 🔹 GIF d'impact d’armure
    const effectsContainer = document.getElementById(`effectsContainer_${targetId}`);
    spawnEffectGif(effectsContainer, {
        className: "armorImpactGif",
        src: "/media/assets/effects/armor-impact.gif",
        lifetime: 800, // doit matcher la durée de l’effet ci-dessous
    });

    // 🧊 Sauvegarde initiale
    if (!window.originalImages) window.originalImages = {};
    if (!originalImages[canvas.id]) {
        originalImages[canvas.id] = ctx.getImageData(0, 0, canvas.width, canvas.height);
    }

    let opacity = 0;
    const fadeSpeed = 0.08;
    const duration = 800;  // 👈 même durée que le GIF
    const startTime = Date.now();
    let fadeIn = true;

    console.log(`⚔️ Début de l'animation Armor Impact sur ${targetId}`);

    // 🔹 Effet de vibration métallique
    canvas.style.transition = "transform 0.1s ease-in-out, filter 0.2s ease-in-out";
    let pulseUp = true;
    const pulseInterval = setInterval(() => {
        canvas.style.transform = pulseUp ? "scale(1.05) rotate(0.5deg)" : "scale(1) rotate(-0.5deg)";
        pulseUp = !pulseUp;
    }, 100);

    function animate() {
        const elapsed = Date.now() - startTime;

        if (elapsed > duration) {
            clearInterval(pulseInterval);
            canvas.style.transform = "scale(1)";
            canvas.style.filter = "none";
            ctx.putImageData(originalImages[canvas.id], 0, 0);
            console.log(`✅ Fin de l'animation Armor Impact pour ${targetId}`);
            return;
        }

        // 💠 Teinte bleue avec éclat argenté
        entiteTinter(canvas, "79, 112, 179", opacity); // #4f70b3

        // ✨ Lueur argentée dynamique
        const glowIntensity = 0.5 + Math.sin(elapsed / 80) * 0.5;
        canvas.style.filter = `drop-shadow(0 0 ${6 * glowIntensity}px rgba(180, 200, 255, ${glowIntensity})) 
                               brightness(${1 + glowIntensity * 0.3})`;

        // 🔁 Fade in/out
        if (fadeIn) {
            opacity += fadeSpeed;
            if (opacity >= 0.6) fadeIn = false;
        } else {
            opacity -= fadeSpeed;
            if (opacity <= 0) fadeIn = true;
        }

        requestAnimationFrame(animate);
    }

    animate();
}

export function animateAmbidextry(targetId) {
    const canvas = document.getElementById(`spriteCanvas_${targetId}`);
    if (!canvas) {
        console.warn(`⚠️ Canvas non trouvé pour targetId: ${targetId}`);
        return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
        console.error(`❌ Impossible d'obtenir le contexte 2D pour ${targetId}`);
        return;
    }

    // 🧩 Sauvegarde du sprite original
    if (!window.originalImages) window.originalImages = {};
    if (!originalImages[canvas.id]) {
        originalImages[canvas.id] = ctx.getImageData(0, 0, canvas.width, canvas.height);
    }

    let opacity = 0;
    const fadeSpeed = 0.15;
    const blinkCount = 2; // 👈 nombre de clignotements
    let completedBlinks = 0;
    let fadeIn = true;



    function animate() {
        if (completedBlinks >= blinkCount) {
            ctx.putImageData(originalImages[canvas.id], 0, 0);
            canvas.style.filter = "none";
           
            return;
        }

        // 💛 Teinte jaune vif #edff00
        entiteTinter(canvas, "237, 255, 0", opacity);

        // ✨ Lueur légère
        const glow = 0.3 + opacity * 0.7;
        canvas.style.filter = `drop-shadow(0 0 ${8 * glow}px rgba(237,255,0,${glow})) brightness(${1 + glow * 0.5})`;

        // 🔁 Gestion du fade
        if (fadeIn) {
            opacity += fadeSpeed;
            if (opacity >= 0.8) fadeIn = false;
        } else {
            opacity -= fadeSpeed;
            if (opacity <= 0) {
                fadeIn = true;
                completedBlinks++;
            }
        }

        requestAnimationFrame(animate);
    }

    animate();
}

export function shakeImpact(targetId) {
    let spriteContainer = document.getElementById(`spriteContainer_${targetId}`);
    if (!spriteContainer) {
        console.warn(`⚠️ SpriteContainer non trouvé pour targetId: ${targetId}`);
        return;
    }

    let duration = 200; // ✅ 200ms pour une secousse courte et impactante
    let startTime = Date.now();
    let intensity = 2; // ✅ Amplitude de rotation (±2°)
    let jumpHeight = 2; // ✅ Hauteur du saut (5px)

    // 🔄 Détection de Side B (inversé)
    let isSideB = !spriteContainer.classList.contains("A"); // Si pas "A", c'est "B"
    let direction = isSideB ? -1 : 1; // ✅ Inversion pour Side B
    let jumpDirection = 1; // ✅ Direction du saut (haut/bas)

       function animate() {
        let elapsed = Date.now() - startTime;

        if (elapsed > duration) {
            spriteContainer.style.transform = isSideB ? "scaleX(-1)" : ""; // ✅ Remet l'entité droite, garde scaleX(-1) si Side B
            spriteContainer.style.top = ""; // ✅ Remet en position normale
           return;
        }

        let angle = direction * intensity;
        let jumpOffset = jumpDirection * jumpHeight;

        // ✅ Appliquer scaleX(-1) pour Side B + rotation + effet de saut
        spriteContainer.style.transform = isSideB ? `rotate(${angle}deg) scaleX(-1)` : `rotate(${angle}deg)`;
        spriteContainer.style.top = `${jumpOffset}px`;

        // ✅ Inversion de la rotation et du saut
        direction *= -1;
        jumpDirection *= -1;

        // 🔄 Vitesse progressive : plus rapide au début, plus lent à la fin
        let timeStep = Math.max(30, 80 - (elapsed / duration) * 50);  

        setTimeout(animate, timeStep);
    }

    animate();
}
// DEAD SPRITE ANIMATION
export function updateSpriteUI(entity) {
    // On ne fait l'animation que si l'entité est morte
    if (!entity.isDEAD) return;

    const container = document.getElementById(`spriteContainer_${entity.id}`);
    if (!container) return;

    // Vérifie si l'effet de sang a déjà été affiché
    if (document.getElementById(`bloodEffect_${entity.id}`)) return;

    // Créez le conteneur d'effets si nécessaire
    let effectsContainer = document.getElementById(`effectsContainer_${entity.id}`);
    if (!effectsContainer) {
        effectsContainer = document.createElement('div');
        effectsContainer.id = `effectsContainer_${entity.id}`;
        effectsContainer.className = 'effects-container';
        container.appendChild(effectsContainer);
    }

    // Créez et affichez le gif de sang
    let bloodGif = document.createElement('img');
    bloodGif.src = "/media/assets/effects/death-blood.gif";
    bloodGif.className = 'effect-vfx death-blood';
    bloodGif.id = `bloodEffect_${entity.id}`; // 🩸 pour éviter le doublon
    effectsContainer.appendChild(bloodGif);

    // Retirer le gif après l'animation
    setTimeout(() => {
        bloodGif.remove();
    }, 1000);
}

// 💠 Fonction d'animation d'indestructibilité (pulsation orange)
export function animateIndestructibility(targetId) {
    const canvas = document.getElementById(`spriteCanvas_${targetId}`);
    if (!canvas) {
        console.warn(`⚠️ Canvas non trouvé pour targetId: ${targetId}`);
        return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
        console.error(`❌ Impossible d'obtenir le contexte 2D pour ${targetId}`);
        return;
    }

    // 🛑 Capture initiale si pas encore faite
    if (!originalImages[canvas.id]) {
        originalImages[canvas.id] = ctx.getImageData(0, 0, canvas.width, canvas.height);
    }

    let opacity = 0;
    let fadeSpeed = 0.08;
    let duration = 2000; // durée totale de 2 secondes
    let startTime = Date.now();
    let fadeIn = true;

    console.log(`🟠 Début de l'animation indestructibilité sur ${targetId}`);

    // 🔹 Appliquer un effet de pulsation (zoom léger)
    canvas.style.transition = "transform 0.15s ease-in-out";
    let pulseUp = true;
    const pulseInterval = setInterval(() => {
        canvas.style.transform = pulseUp ? "scale(1.06)" : "scale(1)";
        pulseUp = !pulseUp;
    }, 150);

    function animate() {
        const elapsed = Date.now() - startTime;

        if (elapsed > duration) {
            // 🔄 Fin : restauration complète et reset
            clearInterval(pulseInterval);
            canvas.style.transform = "scale(1)";
            ctx.putImageData(originalImages[canvas.id], 0, 0);
            console.log(`✅ Fin de l'animation indestructibilité pour ${targetId}`);
            return;
        }

        // 🔸 Teinte orange pulsante
        entiteTinter(canvas, "255, 120, 0", opacity);

        if (fadeIn) {
            opacity += fadeSpeed;
            if (opacity >= 0.6) fadeIn = false;
        } else {
            opacity -= fadeSpeed;
            if (opacity <= 0) fadeIn = true;
        }

        requestAnimationFrame(animate);
    }

    animate();
}

export function animateEsoterism(targetId) {
    const canvas = document.getElementById(`spriteCanvas_${targetId}`);
    if (!canvas) {
        console.warn(`⚠️ Canvas non trouvé pour targetId: ${targetId}`);
        return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
        console.error(`❌ Impossible d'obtenir le contexte 2D pour ${targetId}`);
        return;
    }

    // 🛑 Capture initiale si pas encore faite
    if (!originalImages[canvas.id]) {
        originalImages[canvas.id] = ctx.getImageData(0, 0, canvas.width, canvas.height);
    }

    let opacity = 0;
    const fadeSpeed = 0.05; // un peu plus doux
    const duration = 2200;  // durée légèrement plus longue
    const startTime = Date.now();
    let fadeIn = true;

    console.log(`🔮 Début de l'animation Ésotérisme sur ${targetId}`);

    // 🔹 Pulsation subtile, effet calme
    canvas.style.transition = "transform 0.25s ease-in-out";
    let pulseUp = true;
    const pulseInterval = setInterval(() => {
        canvas.style.transform = pulseUp ? "scale(1.04)" : "scale(1)";
        pulseUp = !pulseUp;
    }, 250);

    function animate() {
        const elapsed = Date.now() - startTime;

        if (elapsed > duration) {
            // 🔄 Fin : restauration complète
            clearInterval(pulseInterval);
            canvas.style.transform = "scale(1)";
            ctx.putImageData(originalImages[canvas.id], 0, 0);
            console.log(`✅ Fin de l'animation Ésotérisme pour ${targetId}`);
            return;
        }

        // 🌸 Teinte rose douce
        entiteTinter(canvas, "255, 184, 227", opacity); // #FFB8E3

        if (fadeIn) {
            opacity += fadeSpeed;
            if (opacity >= 0.5) fadeIn = false;
        } else {
            opacity -= fadeSpeed;
            if (opacity <= 0) fadeIn = true;
        }

        requestAnimationFrame(animate);
    }

    animate();
}
export function animateAstrality(targetId) {
  const canvas = document.getElementById(`spriteCanvas_${targetId}`);
  if (!canvas) {
    console.warn(`⚠️ Canvas non trouvé pour targetId: ${targetId}`);
    return;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    console.error(`❌ Impossible d'obtenir le contexte 2D pour ${targetId}`);
    return;
  }

  // 🛑 Capture initiale si pas encore faite
  if (!originalImages[canvas.id]) {
    originalImages[canvas.id] = ctx.getImageData(0, 0, canvas.width, canvas.height);
  }

  const duration = 1500; // 1.5 s
  const start = performance.now();

  // Performance hint
  const prevWillChange = canvas.style.willChange;
  canvas.style.willChange = "opacity";

  console.log(`✨ Début animation Astralité (fade + tint) sur ${targetId}`);

  // Ease (optionnel mais plus smooth)
  const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);

  function frame(now) {
    const elapsed = now - start;
    const t = Math.min(1, elapsed / duration);

    // Opacité: 0.3 → 1.0
    const opacity = 0.3 + 0.7 * easeOutCubic(t);

    // Reset puis tint constant (C0D4FF)
    ctx.putImageData(originalImages[canvas.id], 0, 0);
    // #C0D4FF -> "192, 212, 255"
    entiteTinter(canvas, "192, 212, 255", 0.45);

    // Appliquer style (pas de transform)
    canvas.style.opacity = opacity.toFixed(3);

    if (t < 1) {
      requestAnimationFrame(frame);
    } else {
      // Restauration finale (image d'origine), opacité 1
      ctx.putImageData(originalImages[canvas.id], 0, 0);
      canvas.style.opacity = "1";
      canvas.style.willChange = prevWillChange || "";
      console.log(`✅ Fin animation Astralité pour ${targetId}`);
    }
  }

  // État initial de la fade
  canvas.style.opacity = "0.3";
  requestAnimationFrame(frame);
}

export function animateDodge(entityId) {
    let sprite = document.getElementById(`imgContainer_${entityId}`);
    if (!sprite) return;

    let isSideB = sprite.classList.contains("img-side-B");

    sprite.style.transition = "left 0.1s ease-out, right 0.1s ease-out, transform 0.1s ease-out"; 
    sprite.style.position = "relative"; // Assurer que `left` et `right` fonctionnent

    if (isSideB) {
        sprite.style.right = "60px"; // Décalage plus grand pour Side B
        sprite.style.left = ""; // Assurer que left ne perturbe pas
        sprite.style.transform = "rotate(10deg)"; 
    } else {
        sprite.style.left = "-60px"; // Décalage pour Side A
        sprite.style.right = ""; // Assurer que right ne perturbe pas
        sprite.style.transform = "rotate(10deg)";
    }

    setTimeout(() => {
        // Retour rapide et fluide
        sprite.style.transition = "left 0.3s ease-out, right 0.3s ease-out, transform 0.3s ease-out"; 
        sprite.style.left = isSideB ? "" : "0px"; // Réinitialisation Side A
        sprite.style.right = isSideB ? "0px" : ""; // Réinitialisation Side B
        sprite.style.transform = "rotate(0deg)"; // Retour à la normale
    }, 100);
}

export function animatePreparation(entity, attack) {
    let castContainer = document.getElementById(`Cast_Animation_${entity.id}`);
    if (!castContainer) {
        console.warn(`⚠️ Impossible de trouver #Cast_Animation_${entity.id}, l'animation ne sera pas affichée.`);
        return;
    }

    // Supprimer une ancienne animation de cast si elle existe
    let existingCast = document.getElementById(`cast_${entity.id}`);
    if (existingCast) existingCast.remove();

    // Création de la div contenant l'animation
    let castEffectDiv = document.createElement("div");
    castEffectDiv.id = `castEffect_${entity.id}`;
    castEffectDiv.className = `cast-preparation-container ${attack.functionName} side-${entity.side}`;
    castContainer.appendChild(castEffectDiv);

    // Création de l'image d'animation de cast
    let castImg = document.createElement("img");
    castImg.id = `cast_${entity.id}`;
    castImg.src = attack.castingAsset;
    castImg.className = `cast ${attack.functionName}`;
    castEffectDiv.appendChild(castImg);

    // Sélection du sprite
    let sprite = document.getElementById(`DragSprite_${entity.id}`);
    if (!sprite) {
        console.warn(`⚠️ Impossible de trouver #DragSprite_${entity.id}, annulation de l'animation.`);
        castEffectDiv.remove();
        return;
    }

    // 🔻 Retirer la classe "iddle"
    removeIddle(sprite);

    let startTime = Date.now();
    let duration = entity.preparationTime;
    let frameRate = 1000 / 30;
    let direction = 1;
    let maxBackward = -6;
    let phase = 0;
    let rotationStopped = false;

    function updateAnimation() {
        let elapsed = Date.now() - startTime;
        let progress = elapsed / duration;

        if (progress >= 1) {
            sprite.style.transform = "";
            return;
        }

        if (progress >= 0.85 && !rotationStopped) {
            rotationStopped = true;
            if (castImg.classList.contains("boulassefeu")) {
                castImg.style.animation = "pulsateFlame 1.5s ease-in-out infinite alternate";
            }
        }

        let maxIntensity = 0.3 + progress * 1.5;
        let intensity = Math.sin(progress * Math.PI) * maxIntensity;
        let easingFactor = Math.pow(progress, 1.8);
        let translateBackward = maxBackward * easingFactor;

        if (progress > (phase + 1) / 5) {
            phase++;
            maxBackward *= 1.4;
        }

        let translateX = direction * intensity + translateBackward;
        direction *= -1;

        sprite.style.transform = `translateX(${translateX}px)`;

        setTimeout(() => requestAnimationFrame(updateAnimation), frameRate);
    }

    requestAnimationFrame(updateAnimation);

    // Lancer l’animation finale une seconde avant la fin
    setTimeout(() => {
        animateFinalPhase(castImg);
    }, entity.preparationTime - 1000);

    // Nettoyage et retour à l'état idle
    setTimeout(() => {
        if (castEffectDiv) castEffectDiv.remove();
        sprite.style.transform = "";
        addIddle(sprite); // ✅ Remettre la classe "iddle"
    }, entity.preparationTime + 2000);
}

export function animateFinalPhase(castImg) {
    let finalStartTime = Date.now();
    let finalDuration = 1000; // Durée de l’animation finale (1s)
    let frameRate = 1000 / 30;
    let direction = 1; // Sens du tremblement

    function finalAnimation() {
        let elapsed = Date.now() - finalStartTime;
        let progress = elapsed / finalDuration;

        if (progress >= 1) {
            castImg.style.transform = ""; // Fin de l'animation finale
            castImg.style.filter = "";
            return;
        }

        // // **Tremblement rapide et intense**
        // let maxShake = 5; 
        // let intensity = Math.sin(progress * Math.PI * 6) * maxShake; // ✅ Plus nerveux

        // **Effet de "charge" → glow + scale-up**
        let scaleUp = 1 + progress * 0.2; // Grossissement progressif
        let brightness = 1 + progress * 1; // Lueur blanche

        castImg.style.transform = `scale(${scaleUp})`;
		// castImg.style.transform = `scale(${scaleUp}) translateX(${direction * intensity}px)`;

        castImg.style.filter = `brightness(${brightness})`;

        direction *= -1;

        setTimeout(() => requestAnimationFrame(finalAnimation), frameRate);
    }

    requestAnimationFrame(finalAnimation);

    // ✅ Ajoute **l'effet de scale et disparition finale** après la fin
    setTimeout(() => {
        castImg.style.transition = "transform 0.3s ease-in-out, opacity 0.3s ease-in-out";
        castImg.style.transform = "scale(1.5)";
        castImg.style.opacity = "0";
    }, finalDuration);
}

export function animateRecuperation(entity, attack) {
    // console.log(`🎬 Tentative d'animation de récupération pour ${entity.name} (ID: ${entity.id}, Side: ${entity.side})`);

    let sprite = document.getElementById(`DragSprite_${entity.id}`);
    let effectsContainer = document.getElementById(`effectsContainer_${entity.id}`);

    // Vérifications de base
    if (!sprite) {
        console.warn(`⚠️ Impossible de trouver #DragSprite_${entity.id}, annulation de l'animation.`);
        return;
    }

    // 🔻 Retirer la classe iddle au début
    removeIddle(sprite);

    if (!effectsContainer) {
        console.warn(`⚠️ Impossible de trouver #effectsContainer_${entity.id}, création dynamique.`);
        effectsContainer = document.createElement("div");
        effectsContainer.id = `effectsContainer_${entity.id}`;
        effectsContainer.className = "effects-container";
        sprite.parentNode.appendChild(effectsContainer);
    }

    if (entity.recoveryTime === undefined || entity.recoveryTime <= 0) {
        console.warn(`⏳ ${entity.name} (Side ${entity.side}) a un recoveryTime invalide: ${entity.recoveryTime}`);
        return;
    }

    // console.log(`✅ ${entity.name} (Side ${entity.side}) commence sa récupération (${entity.recoveryTime}ms)`);

    let startTime = Date.now();
    let duration = entity.recoveryTime;
    let frameRate = 1000 / 30;
    let maxVerticalMove = 3;
    let maxHorizontalMove = 1.5;
    let opacityMin = 0.65;
    let opacityMax = 0.95;

    let RecoveryGif = document.createElement("img");
    RecoveryGif.src = "/media/assets/effects/recovery.gif";
    RecoveryGif.style.opacity = "0";
    RecoveryGif.className = "recoveryGif";
    effectsContainer.appendChild(RecoveryGif);

    setTimeout(() => {
        RecoveryGif.style.opacity = "1";
    }, 50);

    function updateAnimation() {
        let elapsed = Date.now() - startTime;
        let progress = elapsed / duration;

if (progress >= 1) {
    sprite.style.transform = ""; // Réinitialiser la position
    RecoveryGif.style.opacity = "0";
    setTimeout(() => {
        RecoveryGif.remove();
    }, 300);

    return;
}

        let breathingSpeed = 0.002;
        let verticalMove = Math.sin(elapsed * breathingSpeed * Math.PI * 2) * maxVerticalMove;
        let horizontalMove = Math.sin(elapsed * breathingSpeed * Math.PI) * maxHorizontalMove;

        let opacity = opacityMin + ((Math.cos(elapsed * breathingSpeed * Math.PI * 2) + 1) / 2) * (opacityMax - opacityMin);

        sprite.style.transform = `translate(${horizontalMove.toFixed(2)}px, ${verticalMove.toFixed(2)}px)`;
        sprite.style.opacity = opacity.toFixed(2);

        setTimeout(() => requestAnimationFrame(updateAnimation), frameRate);
    }

    requestAnimationFrame(updateAnimation);

    setTimeout(() => {
        sprite.style.transform = "";
        sprite.style.opacity = "1";

        // ✅ Remise de la classe iddle à la fin
        addIddle(sprite);

        // console.log(`🔄 [RESET] ${entity.name} récupère sa posture normale et retourne en iddle.`);
    }, entity.recoveryTime);
}


export async function animationProjectile(attackerObj, targetObj, onHit, projectileData = null) {
    const attackerPrefix = attackerObj.type === 'lord' ? 'lord' : 'sbire';
    let targetPrefix = targetObj.nodeType === 1 && targetObj.classList.contains('hex') ? 'hex' : (targetObj.type === 'lord' ? 'lord' : 'sbire');

    let source = document.getElementById(`${attackerPrefix}_${attackerObj.id}`);
    let cible = targetPrefix === 'hex' ? targetObj : document.getElementById(`${targetPrefix}_${targetObj.id}`);

    if (!source || !cible) {
        console.error("Source ou cible introuvable");
        return;
    }

    const projectileId = `projectile_${attackerObj.id}_${Date.now()}`;
   const projectile = {
    id: projectileId,
    attackerId: attackerObj.id,
    targetId: targetObj.id,
    attackId: attackerObj.currentAttack.attackId,
    damage: 0,
    startTime: Date.now(),
    status: "in-flight"
};


    attackerObj.projectiles.push(projectileData);

const projectileParent = document.createElement('div');
projectileParent.className = 'projectile-parent';
projectileParent.id = projectileId;

// ✅ Classe(s) basées sur l'attaque de l'entité (PAS sur attackDetails global)
const natures = attackerObj?.currentAttack?.attacknature;

if (Array.isArray(natures)) {
  natures.forEach((n) => {
    const cls = String(n)
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '-');
    projectileParent.classList.add(cls);
  });
}
    const projectileChild = document.createElement('div');
    projectileChild.className = `projectile ${attackerPrefix}-projectile`.trim();
// 💡 Appliquer une lueur si le projectile a une aura spéciale
if (projectileData && projectileData.aura === "ambidextry") {
	projectileChild.style.filter = "drop-shadow(0 0 6px #edff00) drop-shadow(0 0 12px #edff00)";
}
    projectileParent.appendChild(projectileChild);
    document.body.appendChild(projectileParent);

    let posXStart = source.getBoundingClientRect().left + source.offsetWidth / 2;
    let posYStart = source.getBoundingClientRect().top + source.offsetHeight / 2;

    Object.assign(projectileParent.style, {
        position: 'absolute',
        left: `${posXStart}px`,
        top: `${posYStart}px`,
        visibility: 'visible',
    });

    const executionTime = attackerObj.currentAttack.executionTime || 1000;
    let startTime = null;

    function animerProjectile(timestamp) {
        if (!startTime) startTime = timestamp;
        const elapsedTime = timestamp - startTime;
        const remainingTime = executionTime - elapsedTime;

        let cibleActuelle = targetPrefix === 'hex' ? targetObj : document.getElementById(`${targetPrefix}_${targetObj.id}`);
        if (!cibleActuelle) {
            console.error("Cible perdue pendant le vol du projectile !");
            projectileParent.remove();
            return;
        }

        let posXCurrent = parseFloat(projectileParent.style.left);
        let posYCurrent = parseFloat(projectileParent.style.top);

        let posXEnd = cibleActuelle.getBoundingClientRect().left + cibleActuelle.offsetWidth / 2;
        let posYEnd = cibleActuelle.getBoundingClientRect().top + cibleActuelle.offsetHeight / 2;

        let dx = posXEnd - posXCurrent;
        let dy = posYEnd - posYCurrent;
        let distanceRestante = Math.sqrt(dx * dx + dy * dy);

        if (distanceRestante < 5 || remainingTime <= 0) {
            projectileParent.style.left = `${posXEnd}px`;
            projectileParent.style.top = `${posYEnd}px`;

            const impactDiv = document.createElement('div');
            impactDiv.className = `projectile-impacte ${attackerPrefix}-impacte`.trim();
            Object.assign(impactDiv.style, {
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                visibility: 'visible',
            });
            projectileParent.appendChild(impactDiv);

            if (typeof onHit === "function") {
                onHit();
            }

            let storedProjectile = attackerObj.projectiles.find(p => p.id === projectileId);
            if (storedProjectile) {
                storedProjectile.status = "hit";
                storedProjectile.impactTime = Date.now();
            }

            setTimeout(() => {
                projectileParent.remove();
                cleanupOldProjectiles(attackerObj);
            }, 80);
        } else {
            // ✅ Ajustement dynamique de la vitesse pour arriver pile au bon moment
            let vitesse = distanceRestante / (remainingTime / 16); 

            let directionX = dx / distanceRestante;
            let directionY = dy / distanceRestante;

            projectileParent.style.left = `${posXCurrent + directionX * vitesse}px`;
            projectileParent.style.top = `${posYCurrent + directionY * vitesse}px`;

            requestAnimationFrame(animerProjectile);
        }
    }

    requestAnimationFrame(animerProjectile);
}

function cleanupOldProjectiles(attackerObj) {
    const now = Date.now();
    attackerObj.projectiles = attackerObj.projectiles.filter(p => p.status === "in-flight" || (now - p.impactTime < 5000));
}
export function animationMelee(attacker, target, isAmbidextry = false) {
    // console.log(`⚔️ Animation MELEE pour ${attacker.name} → ${target.name}${isAmbidextry ? " (AMBIDEXTRIE)" : ""}`);

    // Durée spéciale si ambidextry
    const baseDuration = isAmbidextry ? 600 : attacker.executionTime || 1000;
    const chargeTime = baseDuration * 0.15;
    const impactTime = baseDuration * 0.7;

    const chargeDistance = 160;
    const scaleBase = 0.7;

    const sprite = document.getElementById(`DragSprite_${attacker.id}`);
    if (!sprite) return console.warn(`⚠️ DragSprite_${attacker.id} introuvable`);
    sprite.classList.remove("iddle");

    const isSideB = sprite.classList.contains("side-B");
    const direction = isSideB ? -1 : 1;

    // === FX Container ===
    let fxContainer = document.querySelector(".BattleFX");
    if (!fxContainer) {
        fxContainer = document.createElement("div");
        fxContainer.className = "BattleFX";
        Object.assign(fxContainer.style, {
            position: "absolute",
            top: "0",
            left: "0",
            width: "100%",
            height: "100%",
            pointerEvents: "none",
        });
        document.body.appendChild(fxContainer);
    }

    // === Canvas ===
    const attackerCanvas = document.querySelector(`#spriteCanvas_${attacker.id}`);
    const targetCanvas = document.querySelector(`#spriteCanvas_${target.id}`);
    if (!attackerCanvas || !targetCanvas) {
        console.warn("Canvas introuvable pour animationMelee.");
        return;
    }

    // === Clone ===
    const clone = attackerCanvas.cloneNode(true);
    clone.id = `meleeClone_${attacker.id}_${target.id}`;
    Object.assign(clone.style, {
        position: "absolute",
        zIndex: "9999",
        pointerEvents: "none",
        transform: `scale(${scaleBase})`,
        opacity: "0",
    });
    fxContainer.appendChild(clone);

    // === Dessin du clone ===
    try {
        const ctx = clone.getContext("2d");
        const spriteEntite = new Image();
        spriteEntite.src = attacker.sprite;
        spriteEntite.onload = () => {
            ctx.clearRect(0, 0, clone.width, clone.height);
            if (isSideB) {
                ctx.save();
                ctx.translate(clone.width, 0);
                ctx.scale(-1, 1);
                ctx.drawImage(spriteEntite, 0, 0, clone.width, clone.height);
                ctx.restore();
            } else {
                ctx.drawImage(spriteEntite, 0, 0, clone.width, clone.height);
            }
        };
    } catch (e) {
        console.error("Erreur dessin sprite :", e);
    }

    // === Positions ===
    const attackerRect = attackerCanvas.getBoundingClientRect();
    const targetRect = targetCanvas.getBoundingClientRect();
    const startX = attackerRect.left + attackerRect.width / 2;
    const startY = attackerRect.top + attackerRect.height / 2;
    const targetX = targetRect.left + targetRect.width / 2;
    const targetY = targetRect.top + targetRect.height / 2;

    let deltaX = targetX - startX;
    let deltaY = targetY - startY;

    // --- dépassement léger de la cible ---
    const overshootFactor = 1.15;
    deltaX *= overshootFactor;
    deltaY *= overshootFactor;

    // === Position initiale ===
    clone.style.left = `${startX - attackerRect.width / 2}px`;
    clone.style.top = `${startY - attackerRect.height / 2}px`;

    // === Étape 1 : Charge + retour immédiat ===
    sprite.style.transition = `transform ${chargeTime}ms cubic-bezier(0.8, 0, 0.2, 1)`;
    sprite.style.transform = `translateX(${direction * chargeDistance}px) scale(1.1)`;

    setTimeout(() => {
        sprite.style.transition = `transform ${chargeTime * 0.6}ms ease-out`;
        sprite.style.transform = `translateX(0) scale(1)`;
    }, chargeTime * 0.6);

    // === Étape 2 : Le clone traverse la cible ===
    setTimeout(() => {
        clone.style.transition = "opacity 100ms linear";
        clone.style.opacity = "1";

        clone.animate(
            [
                { transform: `scale(${scaleBase}) translate(0, 0)` },
                { transform: `scale(${scaleBase * 1.1}) translate(${deltaX}px, ${deltaY}px)` },
            ],
            {
                duration: impactTime,
                easing: "cubic-bezier(0.6, 0, 0.4, 1)",
                fill: "forwards",
            }
        );

        setTimeout(() => {
            clone.style.transition = "opacity 200ms linear";
            clone.style.opacity = "0";
        }, impactTime - 150);
    }, chargeTime);

    // === Nettoyage ===
    setTimeout(() => clone.remove(), baseDuration + 300);
}

export function RunawayAnimation(entite) {
    const imgContainer = document.getElementById(`imgContainer_${entite.id}`);
    const sprite = document.getElementById(`DragSprite_${entite.id}`);
    let effectsContainer = document.getElementById(`effectsContainer_${entite.id}`);

    if (!sprite || !imgContainer) {
        console.warn(`⚠️ Élément manquant pour ${entite.name} (${entite.id})`);
        return;
    }

    // Crée le container d'effets s'il n'existe pas
    if (!effectsContainer) {
        console.warn(`⚠️ #effectsContainer_${entite.id} introuvable. Création.`);
        effectsContainer = document.createElement("div");
        effectsContainer.id = `effectsContainer_${entite.id}`;
        effectsContainer.className = "effects-container";
        sprite.parentNode?.appendChild(effectsContainer);
    }

    // Appliquer le flip horizontal
    imgContainer.classList.add('flip-horizontal');

    // Remplacer 'iddle' par 'runaway'
    sprite.classList.remove('iddle');
    sprite.classList.add('runaway');

    // Ajouter recovery.gif une seule fois
    if (!effectsContainer.querySelector('.recoveryGif')) {
        const recoveryGif = document.createElement("img");
        recoveryGif.src = "/media/assets/effects/recovery.gif";
        recoveryGif.style.opacity = "1";
        recoveryGif.className = "recoveryGif";
        effectsContainer.appendChild(recoveryGif);
    }

    // Lancer l'animation de fuite
    sprite.classList.add('runaway-animate');
}

export function runawayInfosBulle(entite, type) {
    const effectsContainer = document.getElementById(`effectsContainer_${entite.id}`);
    const statusBar = document.getElementById(`statusBar_${entite.id}`);

    if (!effectsContainer) {
        console.warn(`⚠️ effectsContainer introuvable pour ${entite.name}`);
        return;
    }

    if (!statusBar) {
        console.warn(`⚠️ statusBar introuvable pour ${entite.name}`);
        return;
    }

    // Supprime l'ancienne bulle si présente
    const existingInfo = effectsContainer.querySelector('.runaway-info');
    if (existingInfo) existingInfo.remove();

    // Supprime les anciens textes de fuite
    const existingText = statusBar.querySelector('.hudbattletexte.runaway');
    if (existingText) existingText.remove();

    const infoBulle = document.createElement("div");
    infoBulle.classList.add("runaway-info");

    if (['preparation', 'fail', 'success'].includes(type)) {
        infoBulle.classList.add(type);
    } else {
        console.warn(`⚠️ Type inconnu dans runawayInfosBulle : ${type}`);
    }

    effectsContainer.appendChild(infoBulle);

    // === Création du texte HUD ===
    const texteRunaway = document.createElement("div");
    texteRunaway.classList.add("hudbattletexte", "runaway");
    texteRunaway.innerText = {
        preparation: "Fuite en cours...",
        fail: "Fuite échouée !",
        success: "Fuite réussie !"
    }[type] || "";
    statusBar.appendChild(texteRunaway);

    // === Nettoyage ===
    if (type === 'fail') {
        setTimeout(() => {
            infoBulle.remove();
            texteRunaway.remove();
        }, 2500);
    }

    if (type === 'success') {
        const duration = entite.runawayLoopRecuperation || entite.stats.speed || 1000;
        setTimeout(() => {
            infoBulle.remove();
            texteRunaway.remove();
        }, duration);
    }

    if (type === 'preparation' || type === 'success') {
        const checkInterval = setInterval(() => {
            if (entite.isDEAD) {
                infoBulle.remove();
                texteRunaway.remove();
                clearInterval(checkInterval);
            }
        }, 200);
    }
}


export function playRunawaySuccessAnimation() {
    // 1. Afficher le message
    const message = document.createElement('div');
    message.textContent = 'Fuite réussie !';
    message.classList.add('IngameAlert', 'runaway-msg');
    document.body.appendChild(message);

    // 2. Attendre 2 secondes
    setTimeout(() => {
        // 3. Créer le fond noir
        const overlay = document.createElement('div');
        overlay.classList.add('fade-to-black');
        document.body.appendChild(overlay);

        // 4. Supprimer le message de fuite
        message.remove();

        // 5. Attendre que le fondu soit terminé (1s) avant de quitter le niveau
        setTimeout(() => {
            QuitCurrentLevel();

            // 6. Faire disparaître le fond noir avec fondu
            overlay.classList.add('fade-out');
           setTimeout(() => {
    overlay.remove();
}, 2000);
 }, 1000); // Fin du fondu noir (1s)
 }, 2000); // Délai après affichage du message (2s)
}

export function orderAnimation(entite) {
    console.log(`🎬 Animation de compréhension d'ordre pour ${entite.name} (ID: ${entite.id})`);

    const effectsContainer = document.getElementById(`effectsContainer_${entite.id}`);
    if (!effectsContainer) {
        console.warn(`⚠️ Aucun container d'effets pour ${entite.name} (ID: ${entite.id})`);
        return;
    }

    const exclamation = document.createElement('div');
    exclamation.classList.add('order-exclamation');
    exclamation.textContent = '!';

    effectsContainer.appendChild(exclamation);

    const canvas = document.getElementById(`spriteCanvas_${entite.id}`);
    const ctx = canvas?.getContext('2d');
    const duration = entite.orderDecisionTimer || 2000;
    const intervalSpeed = 80;

    // 🎞️ Clignotement pendant toute la durée de l’ordre
    if (canvas && ctx) {
        let visible = false;

        if (!originalImages[canvas.id]) {
            originalImages[canvas.id] = ctx.getImageData(0, 0, canvas.width, canvas.height);
        }

        const interval = setInterval(() => {
            if (visible) {
                ctx.putImageData(originalImages[canvas.id], 0, 0);
            } else {
                entiteTinter(canvas, "255, 255, 255", 0.3);
            }
            visible = !visible;
        }, intervalSpeed);

        setTimeout(() => {
            clearInterval(interval);
            ctx.putImageData(originalImages[canvas.id], 0, 0);
        }, duration);
    }

    // 🤸 Animation de sautillement : remplacement de classe
    const sprite = document.getElementById(`DragSprite_${entite.id}`);
    if (sprite) {
        sprite.classList.remove('iddle');
        sprite.classList.add('order');

        // Nettoyage après la durée
        setTimeout(() => {
            sprite.classList.remove('order');
        }, duration);
    }

    // Suppression du !
    setTimeout(() => {
        exclamation.remove();
        console.log(`🧹 Fin de l'animation d'ordre pour ${entite.name}`);
    }, duration);
}