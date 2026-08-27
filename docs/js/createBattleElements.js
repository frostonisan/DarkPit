/**
 * Outils de création des éléments non-entités placés sur le champ de bataille.
 *
 * Ce module ne modifie pas encore createEntity.js. Lors du branchement, la
 * fonction isHexOccupied pourra aussi être appelée par createEntiteInDOM afin
 * que les entités et les Battle Elements partagent exactement la même garde.
 */

const DEFAULT_OCCUPANT_SELECTOR = [
  ".entite-box[data-position]",
  ".battle-element[data-position]",
  '[data-occupies-hex="true"][data-position]'
].join(", ");

function normalizePosition(position) {
  return typeof position === "string" ? position.trim() : "";
}

/**
 * Vérifie la forme d'un identifiant de case, par exemple "hex_12".
 */
export function isValidHexPosition(position) {
  return /^hex_\d+$/.test(normalizePosition(position));
}

/**
 * Retourne tous les occupants reconnus sur un hexagone.
 *
 * excludeElement permet de ne pas considérer un élément comme son propre
 * obstacle lors d'un futur déplacement ou repositionnement.
 */
export function getHexOccupants(
  position,
  {
    excludeElement = null,
    occupantSelector = DEFAULT_OCCUPANT_SELECTOR,
    container = document
  } = {}
) {
  const normalizedPosition = normalizePosition(position);

  if (!isValidHexPosition(normalizedPosition)) {
    return [];
  }

  const root = container instanceof Element || container === document
    ? container
    : document;

  return [...root.querySelectorAll(occupantSelector)].filter(element => {
    if (element === excludeElement) return false;
    if (element.dataset.position !== normalizedPosition) return false;
    if (element.dataset.occupiesHex === "false") return false;
    return true;
  });
}

/**
 * Indique si un hexagone est déjà occupé par une entité ou un Battle Element.
 */
export function isHexOccupied(position, options = {}) {
  const normalizedPosition = normalizePosition(position);
  const hex = getHexElement(normalizedPosition, { container: options.container });
  if (!hex) return true;

  if (getHexOccupants(normalizedPosition, options).length > 0) {
    return true;
  }

  // Même règle structurelle que les entités : un occupant est un enfant direct
  // de la case. Cela couvre aussi les éléments créés avant l'ajout des datasets.
  const directOccupant = hex.querySelector(
    ':scope > .entite-box, :scope > .battle-element, ' +
    ':scope > [data-occupies-hex="true"]'
  );

  if (directOccupant) return true;

  // Nettoyage d'un éventuel marqueur obsolète laissé par un ancien occupant.
  if (hex.classList.contains('occupied')) {
    hex.classList.remove('occupied');
  }

  return false;
}

/**
 * Retourne le premier occupant trouvé sur un hexagone.
 */
export function getHexOccupant(position, options = {}) {
  return getHexOccupants(position, options)[0] ?? null;
}

/**
 * Recherche la case correspondante dans le DOM.
 *
 * Plusieurs conventions sont supportées pour faciliter le futur branchement :
 *   <div id="hex_12">
 *   <div data-hex-id="hex_12">
 *   <div class="hex" data-position="hex_12">
 */
export function getHexElement(position, { container = document } = {}) {
  const normalizedPosition = normalizePosition(position);

  if (!isValidHexPosition(normalizedPosition)) {
    return null;
  }

  const root = container instanceof Element || container === document
    ? container
    : document;

  if (root === document) {
    const elementById = document.getElementById(normalizedPosition);
    if (elementById) return elementById;
  }

  return [...root.querySelectorAll("[data-hex-id], .hex[data-position]")]
    .find(element =>
      element.dataset.hexId === normalizedPosition ||
      element.dataset.position === normalizedPosition
    ) ?? null;
}

/**
 * Valide une tentative de placement sans modifier le DOM.
 */
export function validateBattleElementPlacement(
  position,
  {
    excludeElement = null,
    requireExistingHex = true,
    occupantSelector = DEFAULT_OCCUPANT_SELECTOR,
    container = document
  } = {}
) {
  const normalizedPosition = normalizePosition(position);

  if (!isValidHexPosition(normalizedPosition)) {
    return {
      valid: false,
      position: normalizedPosition || null,
      occupant: null,
      reason: `Position invalide : "${normalizedPosition || position}".`
    };
  }

  if (requireExistingHex && !getHexElement(normalizedPosition, { container })) {
    return {
      valid: false,
      position: normalizedPosition,
      occupant: null,
      reason: `L'hexagone "${normalizedPosition}" n'existe pas dans le DOM.`
    };
  }

  const occupant = getHexOccupant(normalizedPosition, {
    excludeElement,
    occupantSelector,
    container
  });

  if (occupant) {
    return {
      valid: false,
      position: normalizedPosition,
      occupant,
      reason:
        `L'hexagone "${normalizedPosition}" est déjà occupé par ` +
        `"${occupant.id || occupant.className || "un élément"}".`
    };
  }

  return {
    valid: true,
    position: normalizedPosition,
    occupant: null,
    reason: null
  };
}


/**
 * Retourne les hexagones appartenant à la zone neutre.
 *
 * Les marquages explicites du plateau sont prioritaires. Si le plateau ne
 * fournit aucun marqueur, la bande centrale géométrique est utilisée comme
 * zone neutre de secours.
 */
export function getNeutralHexElements({ container = document } = {}) {
  const root = container instanceof Element || container === document
    ? container
    : document;

  const allNeutralRoleHexes = [
    ...root.querySelectorAll('.hex[data-role="neutre"][data-position]')
  ].filter(hex => isValidHexPosition(hex.dataset.position));

  if (allNeutralRoleHexes.length) {
    const sidePriority = hex => {
      if (hex.classList.contains('SideB')) return 0;
      if (hex.classList.contains('Neutral')) return 1;
      if (hex.classList.contains('SideA')) return 2;
      return 3;
    };

    return allNeutralRoleHexes.sort((a, b) => {
      const priorityDiff = sidePriority(a) - sidePriority(b);
      if (priorityDiff !== 0) return priorityDiff;

      const aNumber = Number(a.dataset.position.replace('hex_', ''));
      const bNumber = Number(b.dataset.position.replace('hex_', ''));
      return aNumber - bNumber;
    });
  }

  // Compatibilité avec d'anciens plateaux ne fournissant pas data-role="neutre".
  return [...root.querySelectorAll(
    '.hex.Neutral[data-position], .hex.neutral[data-position], ' +
    '.hex[data-zone="neutral"][data-position], .hex[data-zone="neutre"][data-position]'
  )].filter(hex => isValidHexPosition(hex.dataset.position));
}

/**
 * Trouve une case libre dans la zone neutre.
 */
export function findAvailableNeutralHexPosition({ preferredPosition = null, container = document } = {}) {
  const root = container instanceof Element || container === document
    ? container
    : document;

  const neutralHexes = getNeutralHexElements({ container: root });
  if (!neutralHexes.length) return null;

  const preferred = normalizePosition(preferredPosition);
  if (preferred && isValidHexPosition(preferred)) {
    const preferredHex = getHexElement(preferred, { container: root });
    if (
      preferredHex &&
      neutralHexes.includes(preferredHex) &&
      !isHexOccupied(preferred, { container: root })
    ) {
      return preferred;
    }

    /*
     * La position sauvegardée n'est plus disponible : cherche d'abord la case
     * neutre libre la plus proche visuellement. L'ordre DOM départage deux
     * cases à distance égale et rend le choix déterministe.
     */
    if (preferredHex) {
      const preferredRect = preferredHex.getBoundingClientRect();
      const preferredX = preferredRect.left + preferredRect.width / 2;
      const preferredY = preferredRect.top + preferredRect.height / 2;

      const closestFreeHex = neutralHexes
        .map((hex, index) => {
          const rect = hex.getBoundingClientRect();
          const dx = rect.left + rect.width / 2 - preferredX;
          const dy = rect.top + rect.height / 2 - preferredY;
          return { hex, index, distance: dx * dx + dy * dy };
        })
        .filter(({ hex }) =>
          !isHexOccupied(hex.dataset.position, { container: root })
        )
        .sort((a, b) => (a.distance - b.distance) || (a.index - b.index))[0]
        ?.hex;

      return closestFreeHex?.dataset.position || null;
    }
  }

  // Sans position exploitable, utilise la première case neutre réellement libre.
  const firstFreeHex = neutralHexes.find(hex =>
    !isHexOccupied(hex.dataset.position, { container: root })
  );
  return firstFreeHex?.dataset.position || null;
}

/**
 * Crée un élément non-entité sur le champ de bataille.
 *
 * @param {object} battleElement
 * @param {string|number} battleElement.id Identifiant unique.
 * @param {string} battleElement.position Position au format "hex_N".
 * @param {string} [battleElement.type="object"] Type fonctionnel.
 * @param {string} [battleElement.name="Élément de bataille"] Nom accessible.
 * @param {string|null} [battleElement.sprite=null] URL du sprite.
 * @param {boolean} [battleElement.blocking=true] Occupe et bloque la case.
 * @param {boolean} [battleElement.draggable=false] Autorise le drag natif.
 * @param {string} [battleElement.className=""] Classes CSS supplémentaires.
 * @param {object} [options]
 * @param {Element} [options.container=document.body] Conteneur d'insertion.
 * @param {boolean} [options.requireExistingHex=true] Exige une case dans le DOM.
 * @returns {HTMLElement|null}
 */
export function createBattleElementInDOM(
  battleElement,
  {
    container = document.body,
    requireExistingHex = true,
    occupantSelector = DEFAULT_OCCUPANT_SELECTOR
  } = {}
) {
  if (!battleElement || typeof battleElement !== "object") {
    console.error("❌ Battle Element invalide.", battleElement);
    return null;
  }

  const rawId = battleElement.id;

  if (rawId === undefined || rawId === null || String(rawId).trim() === "") {
    console.error("❌ Impossible de créer un Battle Element sans identifiant.");
    return null;
  }

  if (!(container instanceof Element)) {
    console.error("❌ Le conteneur du Battle Element est invalide.", container);
    return null;
  }

  const id = String(rawId).trim();
  const domId = `BattleElement_${id}`;

  if (document.getElementById(domId)) {
    console.warn(`⚠️ Le Battle Element "${domId}" existe déjà.`);
    return null;
  }

  const placement = validateBattleElementPlacement(battleElement.position, {
    requireExistingHex,
    occupantSelector,
    container
  });

  if (!placement.valid) {
    console.warn(`⚠️ Création de "${domId}" refusée : ${placement.reason}`);
    return null;
  }

  const type =
    typeof battleElement.type === "string" && battleElement.type.trim()
      ? battleElement.type.trim()
      : "object";

  const name =
    typeof battleElement.name === "string" && battleElement.name.trim()
      ? battleElement.name.trim()
      : "Élément de bataille";

  const blocking = battleElement.blocking !== false;
  const draggable = battleElement.draggable === true;

  const element = document.createElement("div");
  element.id = domId;
  element.classList.add("battle-element", `battle-element-${type}`);

  if (
    typeof battleElement.className === "string" &&
    battleElement.className.trim()
  ) {
    element.classList.add(...battleElement.className.trim().split(/\s+/));
  }

  element.dataset.battleElementId = id;
  element.dataset.elementType = type;
  element.dataset.position = placement.position;
  element.dataset.occupiesHex = String(blocking);
  element.dataset.blocking = String(blocking);
  element.draggable = draggable;
  element.setAttribute("aria-label", name);

  const visual = document.createElement("div");
  visual.className = `battle-element-visual battle-element-visual-${type}`;

  if (typeof battleElement.sprite === "string" && battleElement.sprite.trim()) {
    const image = document.createElement("img");
    image.className = "battle-element-sprite";
    image.src = battleElement.sprite.trim();
    image.alt = name;
    image.draggable = false;

    image.addEventListener("error", () => {
      element.classList.add("sprite-error");
      console.error(
        `❌ Impossible de charger le sprite du Battle Element "${domId}".`
      );
    });

    visual.appendChild(image);
  }

  element.appendChild(visual);

  if (draggable) {
    element.addEventListener("dragstart", event => {
      if (!event.dataTransfer) return;

      event.dataTransfer.setData("text/plain", element.id);
      event.dataTransfer.setData(
        "application/x-battle-element",
        element.id
      );
    });
  }

  /*
   * Seconde vérification juste avant l'insertion. Elle protège notamment le
   * placement si un autre code a occupé la case pendant la préparation du DOM.
   */
  const finalPlacement = validateBattleElementPlacement(placement.position, {
    requireExistingHex,
    occupantSelector,
    container
  });

  if (!finalPlacement.valid) {
    console.warn(`⚠️ Insertion de "${domId}" annulée : ${finalPlacement.reason}`);
    return null;
  }

  const targetHex = getHexElement(finalPlacement.position, { container });

  if (!targetHex) {
    console.warn(`⚠️ Insertion de "${domId}" annulée : hexagone introuvable.`);
    return null;
  }

  // Même structure DOM que les entités : l'occupant est un enfant direct du .hex.
  targetHex.appendChild(element);

  if (blocking) {
    targetHex.classList.add("occupied");
  }

  return element;
}

/**
 * Retire proprement un Battle Element et libère sa case si elle ne contient
 * plus aucun occupant reconnu.
 */
export function removeBattleElementFromDOM(elementOrId) {
  const element = typeof elementOrId === "string"
    ? document.getElementById(elementOrId)
    : elementOrId;

  if (!(element instanceof Element)) return false;

  const hex = element.closest?.(".hex") ?? null;
  element.remove();

  if (hex && !hex.querySelector(DEFAULT_OCCUPANT_SELECTOR)) {
    hex.classList.remove("occupied");
  }

  return true;
}

