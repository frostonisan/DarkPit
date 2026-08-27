import { applyEntityTint, releaseEntityTint } from "./entitesAnimation.js";

/*
 * entitesAura.js
 *
 * Système centralisé des auras d’entités.
 *
 * API publique :
 * - getAuraPoolCurrent(entite, poolName)
 * - syncEntityAuras(entite, sourceOrContainer)
 */

// ============================================================
// 1. OUTILS GÉNÉRIQUES ET CONTEXTE
// ============================================================

export function getAuraPoolCurrent(entite, poolName) {
  if (!entite || !poolName) {
    return 0;
  }

  const stats = entite.stats || {};

  const value = Number(
    stats[poolName] ??
    entite[poolName] ??
    0
  );

  return Number.isFinite(value)
    ? Math.max(0, value)
    : 0;
}


function isElement(node) {
  return Boolean(
    node &&
    typeof node === "object" &&
    node.nodeType === 1
  );
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
  return container?.id || "aura";
}

// ============================================================
// 2. FX ALÉATOIRES
// ============================================================

const BATTLE_RANDOM_AURA_FX_SIZE = Object.freeze({
  width: 48,
  height: 48
});

// Un état distinct par instance d'entité : deux entités du même modèle peuvent
// ainsi jouer simultanément la même aura sans partager timer ni calque.
const activeRandomAuraStates = new WeakMap();

const RANDOM_AURA_FX = {
  hypercognition: {
    enabled: entite =>
      Number(entite?.stats?.hypercognition ?? 0) > 0,

    intervalValue: entite =>
      Number(entite?.stats?.hypercognition ?? 0),

    layerClassName: "hypercognition",
    fxClassName: "hypercognition-aura-fx",
    duration: 2000,
    variation: 0.1,
    sizeRatio: 0.5,
    codexSizeMultiplier: 0.55,
    minVisualScale: 0.5,
    maxVisualScale: 1,
    preserveRatio: false,
    randomRotation: true,

    paths: [
      "./media/assets/effects/hypercognition-01.gif",
      "./media/assets/effects/hypercognition-02.gif",
      "./media/assets/effects/hypercognition-03.gif"
    ]
  },

  battleHpRegen: {
    enabled: entite =>
      Number(entite?.stats?.hpBattleRegen ?? 0) > 0,

    intervalValue: entite =>
      Number(entite?.stats?.hpBattleRegen ?? 0),

    layerClassName: "battleHpRegen",
    fxClassName: "battleHpRegen-aura-fx",
    duration: 2000,
    variation: 0.1,
    sizeRatio: 0.17,
    codexSizeMultiplier: 0.55,
    minVisualScale: 1,
    maxVisualScale: 1,
    preserveRatio: true,
    randomRotation: false,

    paths: [
      "./media/assets/effects/hp-battle-regen.gif"
    ]
  },

  bloodCrazy: {
    enabled: entite =>
      Boolean(entite?.flags?.bloodCrazyNextExecution),

    intervalValue: entite =>
      Number(entite?.stats?.physicalDamage ?? 0),

    layerClassName: "bloodCrazy-fx",
    fxClassName: "bloodCrazy-aura-fx",
    duration: 2000,
    variation: 0.25,
    sizeRatio: 1,
    codexSizeMultiplier: 0.55,
    minVisualScale: 0.5,
    maxVisualScale: 1,
    preserveRatio: false,
    randomRotation: true,

    paths: [
      "./media/assets/effects/hypercognition-01.gif",
      "./media/assets/effects/hypercognition-02.gif",
      "./media/assets/effects/hypercognition-03.gif"
    ]
  }
};

function toFiniteNumber(value, fallback = 0) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue)
    ? numericValue
    : fallback;
}

function isCodexAuraContainer(entite, container) {
  if (!container) {
    return false;
  }

  return (
    container.id === `auraContainer_codex_${entite?.id}` ||
    container.classList.contains("codex") ||
    Boolean(
      container.closest(
        ".codex-scan-image-container, .codex-entity-scan"
      )
    )
  );
}

function variationPercent(base, percent) {
  const min = base * (1 - percent);
  const max = base * (1 + percent);
  return Math.random() * (max - min) + min;
}

function getAuraIntervalByStat(value) {
  const stat = toFiniteNumber(value);

  if (stat <= 0) {
    return 0;
  }

  if (stat >= 150) {
    return 500;
  }

  const progression = (stat - 1) / 149;
  return 3000 - progression * 500;
}

function chooseRandomPath(paths) {
  if (!Array.isArray(paths) || paths.length === 0) {
    return null;
  }

  return paths[Math.floor(Math.random() * paths.length)];
}

function getRandomVisualScale(config) {
  const minScale = toFiniteNumber(
    config.minVisualScale,
    1
  );

  const maxScale = toFiniteNumber(
    config.maxVisualScale,
    minScale
  );

  return minScale + Math.random() * Math.max(0, maxScale - minScale);
}

function getAuraFxSize(entite, container, config) {
  const { w, h } = getSpriteBoxFromAuraContainer(
    entite,
    container
  );

  const entityBaseSize = Math.max(
    1,
    toFiniteNumber(w),
    toFiniteNumber(h)
  );

  const sizeRatio = Math.max(
    0,
    toFiniteNumber(config.sizeRatio, 1)
  );

  const codexMultiplier = isCodexAuraContainer(
    entite,
    container
  )
    ? Math.max(
        0,
        toFiniteNumber(config.codexSizeMultiplier, 1)
      )
    : 1;

  return Math.max(
    1,
    entityBaseSize * sizeRatio * codexMultiplier
  );
}

function getRandomAuraState(entite, auraName, contextKey) {
  let entityStates = activeRandomAuraStates.get(entite);

  if (!entityStates) {
    entityStates = new Map();
    activeRandomAuraStates.set(entite, entityStates);
  }

  const stateKey = `${auraName}::${contextKey}`;
  let state = entityStates.get(stateKey);

  if (!state) {
    state = { timeoutId: null, layer: null };
    entityStates.set(stateKey, state);
  }

  return { entityStates, stateKey, state };
}

function clearRandomAuraState(entite, entityStates, stateKey, state) {
  if (state.timeoutId !== null) {
    clearTimeout(state.timeoutId);
    state.timeoutId = null;
  }

  state.layer?.remove?.();
  state.layer = null;
  entityStates.delete(stateKey);

  if (entityStates.size === 0) {
    activeRandomAuraStates.delete(entite);
  }
}

function cleanupRandomAuraStates(entite) {
  const entityStates = activeRandomAuraStates.get(entite);
  if (!entityStates) return;

  for (const state of entityStates.values()) {
    if (state.timeoutId !== null) clearTimeout(state.timeoutId);
    state.layer?.remove?.();
  }

  activeRandomAuraStates.delete(entite);
}

function getOrCreateRandomAuraLayer(
  container,
  state,
  config
) {
  let layer = state.layer;

  if (layer && !container.contains(layer)) {
    layer = null;
  }

  if (!layer) {
    const layers = container.querySelectorAll(
      `:scope > .aura-fx.${config.layerClassName}`
    );

    if (layers.length) {
      layer = layers[0];

      for (let index = 1; index < layers.length; index += 1) {
        layers[index].remove();
      }
    }
  }

  if (!layer) {
    layer = document.createElement("div");
    layer.className = `aura-fx ${config.layerClassName}`;
    container.appendChild(layer);
  }

  state.layer = layer;
  return layer;
}

function spawnRandomAuraFx(entite, container, layer, config) {
  const path = chooseRandomPath(config.paths);

  if (!path) {
    return;
  }

  const fx = document.createElement("img");
  const codexContext = isCodexAuraContainer(entite, container);
  const fxSize = codexContext
    ? getAuraFxSize(entite, container, config)
    : null;
  const visualScale = getRandomVisualScale(config);
  const rotation = config.randomRotation
    ? Math.random() * 360
    : 0;

  fx.src = `${path}?t=${performance.now()}`;
  fx.className = config.fxClassName || "";
  fx.style.position = "absolute";
  fx.style.pointerEvents = "none";
  if (codexContext) {
    fx.style.width = `${fxSize}px`;
    fx.style.height = config.preserveRatio
      ? "auto"
      : `${fxSize}px`;
  } else {
    fx.style.width = `${BATTLE_RANDOM_AURA_FX_SIZE.width}px`;
    fx.style.height = `${BATTLE_RANDOM_AURA_FX_SIZE.height}px`;
    fx.style.maxWidth = `${BATTLE_RANDOM_AURA_FX_SIZE.width}px`;
    fx.style.maxHeight = `${BATTLE_RANDOM_AURA_FX_SIZE.height}px`;
    fx.style.objectFit = "contain";
  }
  fx.style.transform =
    `rotate(${rotation}deg) scale(${visualScale})`;

  const layerRect = layer.getBoundingClientRect();
  const displayedWidth = (codexContext ? fxSize : BATTLE_RANDOM_AURA_FX_SIZE.width) * visualScale;
  const displayedHeight = (codexContext ? fxSize : BATTLE_RANDOM_AURA_FX_SIZE.height) * visualScale;
  fx.style.left = `${Math.random() * Math.max(0, layerRect.width - displayedWidth)}px`;
  fx.style.top = `${Math.random() * Math.max(0, layerRect.height - displayedHeight)}px`;

  layer.appendChild(fx);

  window.setTimeout(
    () => fx.remove(),
    toFiniteNumber(config.duration, 2000)
  );
}

function syncRandomAuraFx(
  entite,
  container,
  contextKey,
  auraName,
  config
) {
  const { entityStates, stateKey, state } = getRandomAuraState(
    entite,
    auraName,
    contextKey
  );

  const stop = () => {
    clearRandomAuraState(entite, entityStates, stateKey, state);
  };

  if (!config.enabled(entite)) {
    stop();
    return;
  }

  if (state.timeoutId !== null) {
    return;
  }

  const layer = getOrCreateRandomAuraLayer(
    container,
    state,
    config
  );

  const loop = () => {
    if (
      !document.body.contains(container) ||
      !document.body.contains(layer) ||
      !config.enabled(entite)
    ) {
      stop();
      return;
    }

    spawnRandomAuraFx(
      entite,
      container,
      layer,
      config
    );

    const intervalValue =
      config.intervalValue?.(entite) ?? 0;

    const dynamicInterval = getAuraIntervalByStat(
      intervalValue
    );

    state.timeoutId = window.setTimeout(
      loop,
      variationPercent(
        dynamicInterval,
        toFiniteNumber(config.variation)
      )
    );
  };

  loop();
}

function syncConfiguredRandomAuras(
  entite,
  container,
  contextKey
) {
  for (const [auraName, config] of Object.entries(RANDOM_AURA_FX)) {
    syncRandomAuraFx(
      entite,
      container,
      contextKey,
      auraName,
      config
    );
  }
}

// ============================================================
// 3. AURAS DE VIE
// ============================================================

const LIFE_AURA_MAP = {
  eternalLife: { icon:"./media/assets/effects/picto-aura-eternallife.svg", sizeR:0.55, offsetR:0.00, ampR:0.05, floatDur:1800, z:7 },
  extraLife:   { icon:"./media/assets/effects/picto-aura-extralife.svg",   sizeR:0.45, offsetR:0.06, ampR:0.045,floatDur:1900, z:6 },
  fadedLife:   { icon:"./media/assets/effects/picto-aura-fadedlife.svg",   sizeR:0.35, offsetR:0.12, ampR:0.04, floatDur:2000, z:5 }
};


function getSpriteBoxFromAuraContainer(entite, auraContainer) {
  if (!auraContainer) {
    return { w: 64, h: 64 };
  }

  const isCodex =
    auraContainer.id === `auraContainer_codex_${entite?.id}` ||
    auraContainer.classList.contains("codex") ||
    Boolean(
      auraContainer.closest(
        ".codex-scan-image-container, .codex-entity-scan"
      )
    );

  // =========================
  // CODEX
  // =========================
  if (isCodex) {
    const codexImage =
      document.getElementById(
        `codex-image_${entite?.id}`
      ) ||
      auraContainer
        .closest(
          ".codex-scan-image-container, .codex-entity-scan"
        )
        ?.querySelector("img.codex-scan-image");

    if (codexImage) {
      const rect = codexImage.getBoundingClientRect();

      /*
       * On utilise uniquement la taille affichée.
       * naturalWidth représente la taille du fichier source,
       * pas la taille réelle dans le Codex.
       */
      if (rect.width > 0 && rect.height > 0) {
        return {
          w: rect.width,
          h: rect.height
        };
      }

      const computed = getComputedStyle(codexImage);
      const computedWidth =
        parseFloat(computed.width) || 0;
      const computedHeight =
        parseFloat(computed.height) || 0;

      if (
        computedWidth > 0 &&
        computedHeight > 0
      ) {
        return {
          w: computedWidth,
          h: computedHeight
        };
      }
    }

    const parent =
      auraContainer.closest(
        ".codex-scan-image-container"
      ) ||
      auraContainer.parentElement;

    const parentRect =
      parent?.getBoundingClientRect();

    if (
      parentRect?.width > 0 &&
      parentRect?.height > 0
    ) {
      return {
        w: parentRect.width,
        h: parentRect.height
      };
    }

    return { w: 64, h: 64 };
  }

  // =========================
  // COMBAT
  // =========================
  const dragSprite = document.getElementById(
    `DragSprite_${entite?.id}`
  );

  const spriteContainer = document.getElementById(
    `spriteContainer_${entite?.id}`
  );

  const battleElement =
    dragSprite ||
    spriteContainer ||
    auraContainer.parentElement ||
    auraContainer;

  const battleRect =
    battleElement.getBoundingClientRect();

  return {
    w: battleRect.width || 64,
    h: battleRect.height || 64
  };
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
const isAlive = (entite?.stats?.HP?.current ?? 0) > 0;

if (!isAlive) {
  const root = entite[rootKey];
  if (root?.remove) root.remove();
  entite[rootKey] = null;

  for (const k of Object.keys(LIFE_AURA_MAP)) {
    const elKey = `_lifeAuraEl_${k}_${ctxKey}`;
    const node = entite[elKey];
    if (node?.remove) node.remove();
    entite[elKey] = null;
  }

  return;
}
  const activeKeys = LIFE_AURA_ORDER.filter(
    (k) => getAuraPoolCurrent(entite, k) > 0
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
    const cur = getAuraPoolCurrent(entite, key);

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



// ============================================================
// 4. GLOW DYNAMIQUE
// ============================================================

const AURA_GLOW_CONFIG = {
  hypercognition: {
    enabled: entite =>
      Number(entite?.stats?.hypercognition ?? 0) > 0,

    color: "#C100AFCC",
    priority: 3,
    mode: "normal"
  },

  battleHpRegen: {
    enabled: entite =>
      Number(entite?.stats?.hpBattleRegen ?? 0) > 0,

    color: "#d60000",
    priority: 3,
    mode: "normal"
  },

  bloodCrazy: {
    enabled: entite =>
      Boolean(entite?.flags?.bloodCrazyNextExecution),

    color: "#FF2020CC",

    // Aura prioritaire : efface immédiatement les autres
    priority: 1,
    mode: "exclusive"
  },

  /*
  Exemple d'une aura dominante :
  elle est ajoutée aux autres, mais elle joue en premier.
  */
// shieldAura: {
  // enabled: entite =>
    // Number(entite?.stats?.armor?.current ?? 0) > 0,

  // color: "#30B7FFCC",
  // priority: 2,
  // mode: "dominant"
// }
};

// ============================================================
// 5. API PUBLIQUE
// ============================================================

export function cleanupEntityAuras(entite) {
  if (!entite) return;

  cleanupRandomAuraStates(entite);

  const entityId = String(entite.id ?? "");

  for (const key of Object.keys(entite)) {
    if (key.startsWith("_randomAuraTimeout_")) {
      if (entite[key]) clearTimeout(entite[key]);
      entite[key] = null;
    }

    if (
      key.startsWith("_randomAuraLayer_") ||
      key.startsWith("_lifeAurasRoot_") ||
      key.startsWith("_lifeAuraEl_") ||
      key.startsWith("_dynamicAuraGlowStyle_")
    ) {
      entite[key]?.remove?.();
      entite[key] = null;
    }

    if (key.startsWith("_dynamicAuraGlowClass_")) {
      const className = entite[key];
      if (className) {
        document.querySelectorAll(`.${className}`).forEach(node => {
          node.classList.remove(className);
        });
      }
      entite[key] = null;
    }

    if (
      key.startsWith("_dynamicAuraGlowSignature_") ||
      key.startsWith("_dynamicAuraGlowTarget_") ||
      key.startsWith("_lifeAuraBase_")
    ) {
      entite[key] = null;
    }
  }

  const containers = [
    document.getElementById(`auraContainer_${entityId}`),
    document.getElementById(`auraContainer_codex_${entityId}`)
  ].filter(Boolean);

  for (const container of containers) {
    container.querySelectorAll(
      ".aura-fx, .life-aura-anim, .shield-sweep-layer"
    ).forEach(node => node.remove());
  }

  document.querySelectorAll(
    `[class*="dynamic-aura-glow-${sanitizeAuraCssId(entityId)}-"]`
  ).forEach(node => {
    [...node.classList]
      .filter(name => name.startsWith(`dynamic-aura-glow-${sanitizeAuraCssId(entityId)}-`))
      .forEach(name => node.classList.remove(name));
  });

  document.querySelectorAll(
    `style[id^="dynamicAuraGlowStyle_${sanitizeAuraCssId(entityId)}_"]`
  ).forEach(style => style.remove());

  const armorAnimation = activeArmorTintAnimations.get(entityId);
  if (armorAnimation) {
    armorAnimation.stopped = true;
    if (armorAnimation.animationFrameId != null) {
      cancelAnimationFrame(armorAnimation.animationFrameId);
    }
    releaseEntityTint(armorAnimation.canvas, "armorActive");
    activeArmorTintAnimations.delete(entityId);
  }

  const canvas = document.getElementById(`spriteCanvas_${entityId}`);
  if (canvas) releaseEntityTint(canvas, "armorActive");
}

export function syncEntityAuras(
  entite,
  sourceOrContainer = "battle"
) {
  if (!entite?.stats) {
    return;
  }

  const isDead =
    entite.isDEAD === true ||
    entite.statut?.includes?.("dead") ||
    Number(entite.stats?.HP?.current ?? 0) <= 0;

  if (isDead) {
    cleanupEntityAuras(entite);
    return;
  }

  /*
   * Même pipeline que le tint des dégâts : applyEntityTint() redessine la
   * couleur en source-atop sans modifier l'opacité CSS du canvas.
   */
  syncArmorEntityTint(entite);

  const container = resolveAuraContainer(
    entite,
    sourceOrContainer
  );

  if (!container) {
    return;
  }

  const ctxKey = getAuraContextKey(container);

  syncConfiguredRandomAuras(
    entite,
    container,
    ctxKey
  );

  updateLifeAurasInContainer(
    entite,
    container,
    ctxKey
  );

  syncEntityAuraGlow(
    entite,
    container,
    ctxKey
  );

  syncShieldSweep(
    entite,
    container,
    ctxKey
  );
}
function sanitizeAuraCssId(value) {
  return String(value ?? "unknown")
    .replace(/[^a-zA-Z0-9_-]/g, "_");
}


function getActiveAuraGlows(entite) {
  const activeAuras = Object.entries(AURA_GLOW_CONFIG)
    .filter(([, cfg]) => cfg.enabled(entite))
    .map(([name, cfg]) => ({
      name,
      color: cfg.color,
      priority: Number(cfg.priority ?? 3),
      mode: cfg.mode ?? "normal"
    }));

  if (!activeAuras.length) {
    return [];
  }

  // Priorité 1 : l'aura exclusive supprime toutes les autres.
  const exclusiveAuras = activeAuras
    .filter(aura => aura.mode === "exclusive")
    .sort((a, b) => a.priority - b.priority);

  if (exclusiveAuras.length) {
    return [exclusiveAuras[0]];
  }

  // Priorité 2 : les dominantes jouent au premier tick.
  // Les auras normales viennent ensuite.
  return activeAuras.sort((a, b) => {
    const aDominant = a.mode === "dominant";
    const bDominant = b.mode === "dominant";

    if (aDominant !== bDominant) {
      return aDominant ? -1 : 1;
    }

    return a.priority - b.priority;
  });
}

function buildAuraGlowKeyframes(animationName, activeAuras) {
  if (!activeAuras.length) {
    return "";
  }

  // Une seule aura : pulsation simple.
  if (activeAuras.length === 1) {
    const color = activeAuras[0].color;

    return `
      @keyframes ${animationName} {
       0%, 100% {
  filter:
    drop-shadow(0 0 4px ${color}70)
    drop-shadow(0 0 10px ${color}35)
    drop-shadow(0 0 18px ${color}18);
}

50% {
  filter:
    drop-shadow(0 0 6px ${color}85)
    drop-shadow(0 0 14px ${color}45)
    drop-shadow(0 0 24px ${color}22);
}
      }
    `;
  }

  const steps = [];
  const count = activeAuras.length;

  activeAuras.forEach((aura, index) => {
    const startPercent = (index / count) * 100;
    const peakPercent = ((index + 0.5) / count) * 100;

    steps.push(`
      ${startPercent.toFixed(2)}% {
        filter: drop-shadow(0 0 3px ${aura.color});
      }
    `);

    steps.push(`
      ${peakPercent.toFixed(2)}% {
        filter: drop-shadow(0 0 7px ${aura.color});
      }
    `);
  });

  steps.push(`
    100% {
      filter: drop-shadow(
        0 0 3px
        ${activeAuras[0].color}
      );
    }
  `);

  return `
    @keyframes ${animationName} {
      ${steps.join("\n")}
    }
  `;
}
function syncEntityAuraGlow(entite, container, ctxKey) {
  const target = getAuraGlowTarget(entite, container);

  if (!target) {
    return;
  }

  const safeEntityId = sanitizeAuraCssId(entite.id);
  const safeContextId = sanitizeAuraCssId(ctxKey);

  /*
   * Nettoie les anciennes classes dynamiques qui auraient été
   * placées par erreur sur une icône, un GIF ou une autre image.
   */
  const wronglyTargetedElements = container.querySelectorAll(
    `[class*="dynamic-aura-glow-${safeEntityId}-"]`
  );

  for (const element of wronglyTargetedElements) {
    if (element === target) {
      continue;
    }

    const classesToRemove = [...element.classList]
      .filter(className =>
        className.startsWith(
          `dynamic-aura-glow-${safeEntityId}-`
        )
      );

    if (classesToRemove.length) {
      element.classList.remove(...classesToRemove);
    }
  }

  const activeAuras = getActiveAuraGlows(entite);

  const className =
    `dynamic-aura-glow-${safeEntityId}-${safeContextId}`;

  const animationName =
    `dynamicAuraGlow_${safeEntityId}_${safeContextId}`;

  const styleId =
    `dynamicAuraGlowStyle_${safeEntityId}_${safeContextId}`;

  const classKey =
    `_dynamicAuraGlowClass_${ctxKey}`;

  const styleKey =
    `_dynamicAuraGlowStyle_${ctxKey}`;

  const signatureKey =
    `_dynamicAuraGlowSignature_${ctxKey}`;

  const targetKey =
    `_dynamicAuraGlowTarget_${ctxKey}`;

  const previousClass = entite[classKey];
  const previousStyle = entite[styleKey];
  const previousTarget = entite[targetKey];

  /*
   * Si la cible a changé, retire la classe de l'ancienne cible.
   */
  if (
    previousTarget &&
    previousTarget !== target &&
    previousClass
  ) {
    previousTarget.classList?.remove(previousClass);
  }

  /*
   * Aucune aura active :
   * suppression totale de la classe et du CSS dynamique.
   */
  if (!activeAuras.length) {
    target.classList.remove(className);

    if (previousClass) {
      target.classList.remove(previousClass);
    }

    if (previousTarget && previousClass) {
      previousTarget.classList?.remove(previousClass);
    }

    if (previousStyle?.remove) {
      previousStyle.remove();
    }

    document.getElementById(styleId)?.remove();

    entite[classKey] = null;
    entite[styleKey] = null;
    entite[signatureKey] = null;
    entite[targetKey] = null;

    return;
  }

  /*
   * La signature change dès qu'une aura apparaît,
   * disparaît ou change de priorité/mode/couleur.
   */
  const signature = activeAuras
    .map(aura =>
      [
        aura.name,
        aura.color,
        aura.priority,
        aura.mode
      ].join(":")
    )
    .join("|");

  /*
   * Si rien n'a changé, on conserve le style existant.
   */
  if (
    entite[signatureKey] === signature &&
    document.getElementById(styleId)
  ) {
    if (
      previousClass &&
      previousClass !== className
    ) {
      target.classList.remove(previousClass);
    }

    target.classList.add(className);

    entite[classKey] = className;
    entite[targetKey] = target;

    return;
  }

  /*
   * Nettoyage de l'ancien système dynamique.
   */
  if (
    previousClass &&
    previousClass !== className
  ) {
    target.classList.remove(previousClass);
  }

  if (previousStyle?.remove) {
    previousStyle.remove();
  }

  document.getElementById(styleId)?.remove();

  /*
   * Génération du nouveau CSS dynamique.
   */
  const style = document.createElement("style");

  style.id = styleId;

style.textContent = `
  .${className}:not(.aura-container) {
    animation:
      ${animationName}
      5s
      ease-in-out
      infinite !important;

    will-change: filter;
  }

  ${buildAuraGlowKeyframes(
    animationName,
    activeAuras
  )}
`;

  document.head.appendChild(style);

  /*
   * Force le navigateur à redémarrer l'animation à 0 %.
   * Une aura dominante apparaît donc bien au premier tick.
   */
  target.classList.remove(className);
  void target.offsetWidth;
  target.classList.add(className);

  entite[classKey] = className;
  entite[styleKey] = style;
  entite[signatureKey] = signature;
  entite[targetKey] = target;
}
function getAuraGlowTarget(entite, container) {
  if (!container) {
    return null;
  }

  const isCodex =
    container.id === `auraContainer_codex_${entite.id}` ||
    container.classList.contains("codex") ||
    Boolean(
      container.closest(
        ".codex-scan-image-container, .codex-entity-scan"
      )
    );

  // =========================
  // CODEX
  // =========================
  if (isCodex) {
    const codexImageContainer = container.closest(
      ".codex-scan-image-container"
    );

    if (codexImageContainer) {
      return codexImageContainer;
    }

    const codexEntityScan = container.closest(
      ".codex-entity-scan"
    );

    if (codexEntityScan) {
      return codexEntityScan;
    }

    const codexImage = document.getElementById(
      `codex-image_${entite.id}`
    );

    if (codexImage) {
      return (
        codexImage.closest(".codex-scan-image-container") ||
        codexImage.closest(".codex-entity-scan") ||
        codexImage.parentElement ||
        codexImage
      );
    }

    return container.parentElement || container;
  }

  // =========================
  // COMBAT
  // =========================
  const spriteContainer = document.getElementById(
    `spriteContainer_${entite.id}`
  );

  if (spriteContainer) {
    return spriteContainer;
  }

  const dragSprite = document.getElementById(
    `DragSprite_${entite.id}`
  );

  if (dragSprite) {
    return dragSprite;
  }

  // =========================
  // AUTRES VUES
  // =========================
  return container.parentElement || container;
}

function ensureShieldSweepStyles() {
  if (document.getElementById("shieldSweepStyles")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "shieldSweepStyles";

  style.textContent = `
  .shield-sweep-layer {
    position: absolute;
    overflow: hidden;
    pointer-events: none;
    z-index: 20;

    /*
     * On réduit légèrement la zone de l'effet.
     * Le reflet ne remplit plus toute la boîte du sprite.
     */
   

    /*
     * Premier masque : silhouette du sprite.
     * Deuxième masque : fondu sur les quatre bords.
     */
    -webkit-mask-image:
      var(--shield-mask),
      linear-gradient(
        to right,
        transparent 0%,
        black 14%,
        black 86%,
        transparent 100%
      ),
      linear-gradient(
        to bottom,
        transparent 0%,
        black 12%,
        black 88%,
        transparent 100%
      );

    mask-image:
      var(--shield-mask),
      linear-gradient(
        to right,
        transparent 0%,
        black 14%,
        black 86%,
        transparent 100%
      ),
      linear-gradient(
        to bottom,
        transparent 0%,
        black 12%,
        black 88%,
        transparent 100%
      );

    -webkit-mask-repeat:
      no-repeat,
      no-repeat,
      no-repeat;

    mask-repeat:
      no-repeat,
      no-repeat,
      no-repeat;

    -webkit-mask-position:
      center,
      center,
      center;

    mask-position:
      center,
      center,
      center;

    -webkit-mask-size:
      contain,
      100% 100%,
      100% 100%;

    mask-size:
      contain,
      100% 100%,
      100% 100%;

    /*
     * Les trois masques sont combinés.
     */
    -webkit-mask-composite:
      source-in,
      source-in;

    mask-composite:
      intersect,
      intersect;
  }

  .shield-sweep-layer::after {
    content: "";
    position: absolute;

    top: -45%;
    left: -100%;

    width: 42%;
    height: 190%;

    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(150, 215, 255, 0.02) 12%,
      rgba(180, 225, 255, 0.14) 28%,
      rgba(230, 250, 255, 0.72) 50%,
      rgba(180, 225, 255, 0.14) 72%,
      rgba(150, 215, 255, 0.02) 88%,
      transparent 100%
    );

    transform: rotate(20deg);

   animation:
  shieldSweepReflection
  var(--shield-duration, 4s)
  ease-in-out
  var(--shield-delay, 0s)
  infinite;
  }

  @keyframes shieldSweepReflection {
    0% {
      left: -100%;
    }

    55%,
    100% {
      left: 150%;
    }
  }
`;

  document.head.appendChild(style);
}
function syncShieldSweep(
  entite,
  container,
  ctxKey
) {
  ensureShieldSweepStyles();

  const armorCurrent = Number(
    entite?.stats?.armor?.current ?? 0
  );

  const isCodex =
    container?.classList?.contains("codex") ||
    container?.id?.startsWith("auraContainer_codex_");

  let spriteRoot = null;
  let spriteElement = null;

  if (isCodex) {
    spriteRoot = document.getElementById(
      `codex-image_${entite.id}`
    );

    spriteElement = spriteRoot?.querySelector(
      ":scope > .codex-scan-image"
    );
  } else {
    spriteRoot = document.getElementById(
      `DragSprite_${entite.id}`
    );

    spriteElement = document.getElementById(
      `spriteCanvas_${entite.id}`
    );
  }

  if (!spriteRoot || !spriteElement) {
    return;
  }

  /*
   * Une seule couche autorisée dans ce sprite.
   */
  const existingLayers = [
    ...spriteRoot.querySelectorAll(
      ":scope > .shield-sweep-layer"
    )
  ];

  /*
   * Si l'armure est vide, suppression de toutes les couches.
   */
  if (armorCurrent <= 0) {
    existingLayers.forEach(layer => layer.remove());
    return;
  }

  let effect = existingLayers[0] ?? null;

  /*
   * Nettoyage immédiat des anciens doublons.
   */
  existingLayers
    .slice(1)
    .forEach(layer => layer.remove());

  if (!effect) {
    effect = document.createElement("div");
    effect.className = "shield-sweep-layer";
    spriteRoot.appendChild(effect);
  }
if (!effect.dataset.animationConfigured) {
  const duration = 3200 + Math.random() * 2400;
  const delay = -(Math.random() * duration);

  effect.style.setProperty(
    "--shield-duration",
    `${Math.round(duration)}ms`
  );

  effect.style.setProperty(
    "--shield-delay",
    `${Math.round(delay)}ms`
  );

  effect.dataset.animationConfigured = "true";
}
  effect.style.left = "0px";
  effect.style.top = "0px";
  effect.style.width = "100%";
  effect.style.height = "100%";

  const spritePath = isCodex
    ? spriteElement.currentSrc || spriteElement.src
    : entite.sprite || "";

  if (!spritePath) {
    effect.remove();
    return;
  }

  const escapedPath = String(spritePath)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');

  effect.style.setProperty(
    "--shield-mask",
    `url("${escapedPath}")`
  );
}
const activeArmorTintAnimations = new Map();

/**
 * Active ou désactive la teinte bleutée clignotante de l'armure.
 *
 * Une seule boucle requestAnimationFrame est autorisée
 * par entité afin d'éviter les animations empilées.
 */
export function syncArmorEntityTint(entite) {
if (entite?.id == null) {
  return;
}
  const entityId = String(entite.id);

  const canvas = document.getElementById(
    `spriteCanvas_${entityId}`
  );

  const armorCurrent = Number(
    entite?.stats?.armor?.current ?? 0
  );

  const existingAnimation =
    activeArmorTintAnimations.get(entityId);

  /*
   * Armure absente ou sprite inexistant :
   * arrêt et nettoyage de l'effet.
   */
  if (!canvas || armorCurrent <= 0) {
    if (existingAnimation) {
      existingAnimation.stopped = true;
      cancelAnimationFrame(
        existingAnimation.animationFrameId
      );

      activeArmorTintAnimations.delete(entityId);
    }

    if (canvas) {
      releaseEntityTint(canvas, "armorActive");
    }

    return;
  }

  /*
   * Une animation existe déjà :
   * on ne crée surtout pas une seconde boucle.
   */
  if (
    existingAnimation &&
    !existingAnimation.stopped &&
    existingAnimation.canvas === canvas
  ) {
    return;
  }

  /*
   * Nettoyage d'une éventuelle ancienne animation
   * liée à un canvas remplacé.
   */
  if (existingAnimation) {
    existingAnimation.stopped = true;
    cancelAnimationFrame(
      existingAnimation.animationFrameId
    );
  }

  const animationState = {
    canvas,
    stopped: false,
    animationFrameId: null,
    startedAt: performance.now(),
  };

  activeArmorTintAnimations.set(
    entityId,
    animationState
  );

  const minimumOpacity = 0.08;
  const maximumOpacity = 0.42;

  /*
   * Durée d'un cycle complet :
   * plus la valeur est grande, plus le clignotement est lent.
   */
  const cycleDuration = 1800;

  function animateArmorTint(now) {
    if (animationState.stopped) {
      return;
    }

    /*
     * Le sprite a été supprimé ou remplacé.
     */
    if (
      !canvas.isConnected ||
      document.getElementById(
        `spriteCanvas_${entityId}`
      ) !== canvas
    ) {
      animationState.stopped = true;

      releaseEntityTint(
        canvas,
        "armorActive"
      );

      activeArmorTintAnimations.delete(
        entityId
      );

      return;
    }

    /*
     * On relit l'entité à chaque frame :
     * dès que l'armure tombe à zéro, la teinte disparaît.
     */
    const currentArmor = Number(
      entite?.stats?.armor?.current ?? 0
    );

    if (currentArmor <= 0) {
      animationState.stopped = true;

      releaseEntityTint(
        canvas,
        "armorActive"
      );

      activeArmorTintAnimations.delete(
        entityId
      );

      return;
    }

    const elapsed =
      now - animationState.startedAt;

    /*
     * Oscillation douce comprise entre 0 et 1.
     */
    const pulse =
      (Math.sin(
        (elapsed / cycleDuration) *
        Math.PI *
        2
      ) + 1) / 2;

    const opacity =
      minimumOpacity +
      pulse *
      (maximumOpacity - minimumOpacity);

    applyEntityTint(
      canvas,
      "armorActive",
      opacity
    );

    animationState.animationFrameId =
      requestAnimationFrame(
        animateArmorTint
      );
  }

  animationState.animationFrameId =
    requestAnimationFrame(
      animateArmorTint
    );
}
