// Shared menu placement and navigation memory. No screen construction.
import { loadFromLocalStorage, saveToLocalStorage } from "../storage/gameStorage.js";
import { attackSelectionKey } from "../combat/attackResolution.js";
import { closeAttackEssenceSocketPopups } from "../items/essences.js";
import { requireSafeMenuAccess } from "../app/state.js";

const CODEX_MENU_KEY = 'CodexMenuIndex';

const CODEX_SUBMENU_KEY = 'CodexSubmenuIndex';

const CODEX_SUBSTAT_MODE_KEY = "CodexSubstatMode";

const CODEX_FOCUSED_ATTACKS_KEY = 'CodexFocusedAttacks';

const codexNavigationViews = new Map();

const lastCodexNavigationViews = new Map();

function bindCodexNavigationMemory(root, entityId) {
  const owner = String(entityId);
  if (!codexNavigationViews.has(owner)) codexNavigationViews.set(owner, new Map());
  const views = codexNavigationViews.get(owner);
  let section = '', restoring = false, replaying = false, generation = 0;
  const pathFor = node => {
    const path = [];
    while (node && node !== root) {
      const tag = node.tagName.toLowerCase();
      const siblings = [...node.parentElement.children].filter(child => child.tagName === node.tagName);
      path.unshift(`${tag}:nth-of-type(${siblings.indexOf(node) + 1})`);
      node = node.parentElement;
    }
    return path.join(' > ');
  };
  const capture = () => {
    if (!section || restoring || !root.isConnected) return;
    const previous = views.get(section);
    const scrolls = {};
    for (const path of Object.keys(previous?.scrolls || {})) {
      const node = root.querySelector(path);
      if (node) scrolls[path] = [node.scrollLeft, node.scrollTop];
    }
    for (const node of root.querySelectorAll('*')) {
      if (node.scrollTop || node.scrollLeft) scrolls[pathFor(node)] = [node.scrollLeft, node.scrollTop];
    }
    const state = {
      scrolls,
      searches: [...root.querySelectorAll('input[type="search"]')].map(node => [pathFor(node), node.value]),
      filters: [...root.querySelectorAll('.umbra-filters input[data-group]')]
        .map(node => [pathFor(node), node.checked]),
      filterPanels: [...root.querySelectorAll('.umbra-filtres-container')]
        .map(node => [pathFor(node), node.style.display === 'block']),
      tabs: [...root.querySelectorAll('.section-content .codex-substat-toggle [data-mode].active')]
        .map(node => pathFor(node)),
      details: [...root.querySelectorAll('details')].map(node => [pathFor(node), node.open]),
    };
    views.set(section, state);
    lastCodexNavigationViews.set(section, state);
  };
  const restore = name => {
    section = name;
    root.dataset.navigationSection = name;
    const saved = views.get(name) || lastCodexNavigationViews.get(name);
    const ticket = ++generation;
    restoring = true;
    root.dataset.navigationRestoring = 'true';
    requestAnimationFrame(() => {
      if (!root.isConnected || ticket !== generation) return;
      if (saved) {
        for (const path of saved.tabs) {
          const tab = root.querySelector(path);
          if (tab?.matches('[data-mode]') && !tab.classList.contains('active')) {
            replaying = true;
            try { tab.click(); }
            finally { replaying = false; }
          }
        }
        for (const [path, value] of saved.searches) {
          const input = root.querySelector(path);
          if (input?.matches('input[type="search"]')) {
            input.value = value;
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
        for (const [path, checked] of saved.filters) {
          const input = root.querySelector(path);
          if (input?.matches('.umbra-filters input[data-group]')) input.checked = checked;
        }
        root.querySelectorAll('.umbra-filters').forEach(bar => bar.dispatchEvent(new Event('change', { bubbles: true })));
        for (const [path, open] of saved.filterPanels) {
          const panel = root.querySelector(path);
          if (!panel?.matches('.umbra-filtres-container')) continue;
          panel.style.display = open ? 'block' : 'none';
          panel.parentElement.querySelector('.umbra-filtre-title')?.classList.toggle('active', open);
        }
        for (const [path, open] of saved.details) {
          const node = root.querySelector(path);
          if (node?.matches('details')) node.open = open;
        }
      }
      requestAnimationFrame(() => {
        if (!root.isConnected || ticket !== generation) return;
        for (const [path, [left, top]] of Object.entries(saved?.scrolls || {})) {
          const node = root.querySelector(path);
          if (node) { node.scrollLeft = left; node.scrollTop = top; }
        }
        restoring = false;
        root.dataset.navigationRestoring = 'false';
        capture();
      });
    });
  };
  root.addEventListener('scroll', capture, true);
  root.addEventListener('input', capture);
  root.addEventListener('change', capture);
  root.addEventListener('click', event => {
    // A fresh tab choice takes priority over a still-pending restoration.
    if (restoring && !replaying && event.target.closest('.codex-substat-toggle [data-mode]')) {
      generation++;
      restoring = false;
      root.dataset.navigationRestoring = 'false';
    }
    capture();
  });
  return { capture, restore };
}

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

function getCodexFocusedAttackKey(entite) {
  const saved = loadFromLocalStorage(CODEX_FOCUSED_ATTACKS_KEY, {});
  return saved && typeof saved === 'object' && !Array.isArray(saved)
    ? String(saved[entite?.id] || '') : '';
}

function setCodexFocusedAttackKey(entite, attack) {
  const key = attackSelectionKey(attack);
  if (!entite?.id || !key) return;
  const saved = loadFromLocalStorage(CODEX_FOCUSED_ATTACKS_KEY, {});
  const focused = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
  if (focused[entite.id] === key) return;
  saveToLocalStorage(CODEX_FOCUSED_ATTACKS_KEY, { ...focused, [entite.id]: key });
}

function getCodexSubstatMode() {
  const mode = loadFromLocalStorage(CODEX_SUBSTAT_MODE_KEY, "stat");
  return ["stat", "umbra"].includes(mode) ? mode : "stat";
}

function setCodexSubstatMode(mode) {
  if (!["stat", "umbra"].includes(mode)) mode = "stat";
  saveToLocalStorage(CODEX_SUBSTAT_MODE_KEY, mode);
}

function createCodexSubstatTab({ mode, iconClass, title }) {
  const tab = document.createElement('button');
  tab.type = 'button';
  tab.className = `codex-substat-tab codex-substat-tab--${mode}`;
  tab.dataset.mode = mode;
  tab.title = title;
  tab.setAttribute('aria-label', title);
  const icon = document.createElement('span');
  icon.className = `codex-picto-menu-entity ${iconClass}`;
  icon.setAttribute('aria-hidden', 'true');
  tab.appendChild(icon);
  return tab;
}

function activeIndex1Based(parent, itemSelector, activeClass='active') {
  const items = Array.from(parent.querySelectorAll(itemSelector));
  const i0 = items.findIndex(el => el.classList.contains(activeClass));
  return i0 >= 0 ? i0 + 1 : 1;
}

function toggleWindowInMenuMap(selectorClass, createContentCallback) {
    if (!requireSafeMenuAccess()) return;
    closeAttackEssenceSocketPopups();
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

    const order = [ 'shop-interface', 'inventory-interface', 'essenceur-interface', 'codex-entity-scan', 'army-codex-list'];

    order.forEach(className => {
        const el = container.querySelector(`.${className}`);
        if (el) container.appendChild(el); // le déplace en dernier = ordre
    });
}

function MenuContainerDisplayRules() {
    const menuMap = document.querySelector('.menu-map-container');
    if (!menuMap) return;

    // Supprimer toutes les classes existantes x-menus
    menuMap.classList.remove('one-menus', 'two-menus', 'three-menus', 'four-menus', 'five-menus', 'six-menus');

    // Compter tous les enfants visibles de menuMap (hors display: none)
    const visibleChildren = Array.from(menuMap.children).filter(el => {
        return el.offsetParent !== null;
    });

    const count = visibleChildren.length;

    const labelMap = ['zero', 'one', 'two', 'three', 'four', 'five', 'six'];
    if (count >= 1 && count <= 6) {
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

function enforceMenuDisplayRules() {
    const container = document.querySelector('.menu-map-container');
    if (!container) return;

    const shop = container.querySelector('.shop-interface');
    const inventory = container.querySelector('.inventory-interface');
    const essenceur = container.querySelector('.essenceur-interface');
    const codexScans = Array.from(container.querySelectorAll('.codex-entity-scan'));
    const armyCodex = container.querySelector('.army-codex-list');

    const hasShop = !!shop;
    const hasInventory = !!inventory;
    const hasEssenceur = !!essenceur;
    const hasArmyCodex = !!armyCodex;
    const codexCount = codexScans.length;

    const totalMenus = [
        ...container.querySelectorAll(
            '.shop-interface, .inventory-interface, .essenceur-interface, .codex-entity-scan, .army-codex-list'
        )
    ].length;

    console.log("DEBUG →", { hasShop, hasInventory, hasEssenceur, hasArmyCodex, codexCount, totalMenus });

    // 🔴 Règle 1 — Cas interdit : trop de menus ouverts
    if (hasShop && hasInventory && hasArmyCodex && codexCount >= 2) {
        console.log("Règle 1 → trop de menus, on ferme les codex");
        closeAttackEssenceSocketPopups();
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
        closeAttackEssenceSocketPopups();
        codexScans.forEach(c => c.remove());
        reorderMenuMapChildren();
        MenuContainerDisplayRules();
        return;
    }
}

let pendingInventoryCodexAttackTarget = null;

function getInventoryEntityName(entity = {}) {
    return String(entity?.nickname || entity?.name || `Entité ${entity?.id ?? ''}`).trim();
}

function getPendingInventoryCodexAttackTarget(entite = {}) {
    if (!pendingInventoryCodexAttackTarget) return null;
    if (String(pendingInventoryCodexAttackTarget.entityId || '') !== String(entite?.id || '')) return null;
    return pendingInventoryCodexAttackTarget;
}

function clearPendingInventoryCodexAttackTarget(target = null) {
    if (!target || pendingInventoryCodexAttackTarget === target) {
        pendingInventoryCodexAttackTarget = null;
    }
}

function mergeInventoryArmySources(...sources) {
    const byId = new Map();
    const withoutId = [];

    sources.forEach(source => {
        if (!Array.isArray(source)) return;

        source.forEach(entity => {
            if (!entity || typeof entity !== 'object') return;

            const id = entity.id ?? entity.uid ?? entity.serial ?? null;
            if (id === null || id === undefined || id === '') {
                withoutId.push(entity);
                return;
            }

            byId.set(String(id), entity);
        });
    });

    return [
        ...byId.values(),
        ...withoutId,
    ];
}

function readInventoryArmy() {
    const storedArmy = loadFromLocalStorage('selectedArmyA', []);
    const liveArmy = typeof window !== 'undefined' && Array.isArray(window.selectedArmyA)
        ? window.selectedArmyA
        : [];

    return mergeInventoryArmySources(liveArmy, storedArmy);
}

function findInventoryEntityById(entityId) {
    if (!entityId) return null;
    const id = String(entityId);
    return readInventoryArmy().find(entity => String(entity?.id) === id) || null;
}

function setPendingInventoryCodexAttackTarget(target) { pendingInventoryCodexAttackTarget = target; }

export {
  MenuContainerDisplayRules,
  enforceMenuDisplayRules,
  bindCodexNavigationMemory,
  getCodexMenuIndex,
  setCodexMenuIndex,
  getCodexSubmenuIndex,
  setCodexSubmenuIndex,
  getCodexFocusedAttackKey,
  setCodexFocusedAttackKey,
  getCodexSubstatMode,
  setCodexSubstatMode,
  createCodexSubstatTab,
  activeIndex1Based,
  toggleWindowInMenuMap,
  reorderMenuMapChildren,
  pendingInventoryCodexAttackTarget,
  getInventoryEntityName,
  getPendingInventoryCodexAttackTarget,
  clearPendingInventoryCodexAttackTarget,
  readInventoryArmy,
  findInventoryEntityById,
  setPendingInventoryCodexAttackTarget,
};
