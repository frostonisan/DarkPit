import { getStatSystemResult } from "../../entities/statSystem.js";
import { HELPER_TEXT } from "../../data/helpers.js";
import { cachedResourceUrl } from "../../data/loaderList.js";
import { attackDetails } from "../../data/attackList.js";
import { balanceData } from "../../data/balanceData.js";
import { isAdminMode, loadFromLocalStorage, purgeStatPreview } from "../../storage/gameStorage.js";
import { getSafe } from "../../entities/rules.js";
import { entites, calculateTranscendenceExtraLife, getMovementWeightMalus, getStatMalusSources } from "../../entities/runtime.js";
import { attackSelectionKey } from "../../combat/attackResolution.js";
import { calculateTotalRegenAmount, calculateMysticismTranceDuration } from "../../combat/statistics.js";
import { setAdminSelectedEntity, closeAdminEntityFormOnly } from "../../debug/admin.js";
import {
  removeItemDescription,
  DropInventorytoCodex,
  equippedHoverDescription,
  clearItemDescriptions,
} from "../../items/itemManager.js";
import { createLifeBars, createLifeCounter, createArmorCounter, createMovementCounter } from "../../rendering/entities.js";
import { goldTitle } from "../display.js";
import { syncEntityAuras } from "../../rendering/auras.js";
import { closeAttackEssenceSocketPopups } from "../../items/essences.js";
import { getStageAccess, requireSafeMenuAccess } from "../../app/state.js";
import {
  bindCodexNavigationMemory,
  getCodexMenuIndex,
  setCodexMenuIndex,
  setCodexSubmenuIndex,
  getCodexSubstatMode,
  setCodexSubstatMode,
  createCodexSubstatTab,
  activeIndex1Based,
  toggleWindowInMenuMap,
  reorderMenuMapChildren,
  MenuContainerDisplayRules,
  enforceMenuDisplayRules,
  pendingInventoryCodexAttackTarget,
  clearPendingInventoryCodexAttackTarget,
  findInventoryEntityById,
  setPendingInventoryCodexAttackTarget,
} from "../navigation.js";
import { bindHelperEntity, getBoundHelperEntity } from "../statistics/helpers.js";
import {
  createEntityPowerValue, createUmbraBlock, createStatSection, finalizeCodexStatSection,
  removeEmptyCodexStatGroup, statTitle, createFullStatDom, entityHasKey, readEntityKey,
  createValideStatDom,
} from "../statistics/components.js";
import {
  createCodexInformationBattlePage, createCodexProfileSummary, createCodexEntityView,
  ensureDirectEntityView, removeDirectEntityView, createEntityLore, getCodexStableEquipmentCharge,
} from "./profile.js";
import {
  normalizeInventoryLookupValue,
  getInventoryAttackKeyCandidates,
  createAttackReadOnlyOverview,
  createAttackSubmenu,
} from "../attacks.js";
import {
  createLevelUpForm, LevelupSignal, renderCodexUmbraSubstatPanel, createSoulSubmenu, createStatsSubmenu,
  createSoulGraphPanel, createArchetypesList,
} from "./stats.js";
import { applyCombatProfileView } from "../../rendering/hud.js";

// Army and entity Codex navigation, composition and focused attack routing.

function escapeInventorySelectorValue(value = '') {
    const text = String(value ?? '');
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
        return CSS.escape(text);
    }
    return text.replace(/["\\]/g, '\\$&');
}

function closeMenusForInventoryCodexJump() {
    closeAttackEssenceSocketPopups();
    clearItemDescriptions();
    document.querySelectorAll('.stat-hover').forEach(node => node.remove());

    const menuMap = document.querySelector('.menu-map-container');
    if (!menuMap) return null;

    menuMap
        .querySelectorAll('.inventory-interface, .shop-interface, .essenceur-interface, .army-codex-list, .codex-entity-scan')
        .forEach(node => node.remove());

    return menuMap;
}

function getInventoryCodexSubmenuIndex(entite, submenu) {
    if (submenu === 'equipment') return 2;
    if (submenu === 'attack') {
        return getCodexStableEquipmentCharge(entite) > 0 ? 3 : 2;
    }
    return 1;
}

function normalizeInventoryCodexAttackTarget(attackTarget = {}, slotIndex = null) {
    const target = attackTarget && typeof attackTarget === 'object' && !Array.isArray(attackTarget)
        ? attackTarget
        : { key: attackTarget };
    const attackIndex = Number(target.attackIndex ?? target.index);
    const resolvedSlotIndex = target.slotIndex ?? slotIndex;

    return {
        keys: getInventoryAttackKeyCandidates(target),
        attackIndex: Number.isFinite(attackIndex) ? Math.max(0, Math.floor(attackIndex)) : null,
        slotIndex: Math.max(0, Math.floor(Number(resolvedSlotIndex) || 0)),
    };
}

function findInventoryCodexAttackSocketRoots(codexRoot, target) {
    if (!codexRoot) return [];

    const roots = Array.from(codexRoot.querySelectorAll('[data-attack-essence-sockets="true"]'));
    if (!roots.length) return [];

    const filterByAttackIndex = (candidates) => {
        if (target.attackIndex === null) return candidates;
        return candidates.filter(root => Number(root.dataset.attackIndex) === target.attackIndex);
    };
    const keySet = new Set(target.keys.map(normalizeInventoryLookupValue).filter(Boolean));
    const keyedRoots = roots.filter(root => keySet.has(normalizeInventoryLookupValue(root.dataset.attackKey)));
    const indexedKeyedRoots = filterByAttackIndex(keyedRoots);
    if (indexedKeyedRoots.length) return indexedKeyedRoots;
    if (keyedRoots.length) return keyedRoots;

    const indexedRoots = filterByAttackIndex(roots);
    if (indexedRoots.length) return indexedRoots;

    if (target.attackIndex !== null) {
        const thumbRoots = roots.filter(root => root.classList.contains('attack-essence-sockets--thumb'));
        const detailRoots = roots.filter(root => root.classList.contains('attack-essence-sockets--detail'));
        return [
            thumbRoots[target.attackIndex],
            detailRoots[target.attackIndex],
            roots[target.attackIndex],
        ].filter(Boolean);
    }

    return roots;
}

function findInventoryCodexSocketInRoots(roots, slotIndex, preferDetail = true) {
    const normalizedSlotIndex = Math.max(0, Math.floor(Number(slotIndex) || 0));
    const oneBasedIndex = normalizedSlotIndex + 1;
    const sortedRoots = [...roots].sort((a, b) => {
        if (!preferDetail) return 0;
        const aDetail = a.classList.contains('attack-essence-sockets--detail') ? 0 : 1;
        const bDetail = b.classList.contains('attack-essence-sockets--detail') ? 0 : 1;
        return aDetail - bDetail;
    });

    for (const root of sortedRoots) {
        const socket = root.querySelector(`[data-slot-index="${normalizedSlotIndex}"]`)
            || root.querySelector(`[data-index="${oneBasedIndex}"]`);
        if (socket) return { root, socket };
    }

    return null;
}

function clickInventoryCodexAttackThumb(root) {
    const container = root?.closest('.attack-image-container');
    const attackImage = container?.querySelector('.attack-image');
    if (!attackImage) return false;

    attackImage.click();
    return true;
}

function openAttackEssencePopupInCodex(codexRoot, attackTarget = {}, slotIndex = null) {
    if (!codexRoot) return false;

    const target = normalizeInventoryCodexAttackTarget(attackTarget, slotIndex);
    const roots = findInventoryCodexAttackSocketRoots(codexRoot, target);
    if (!roots.length) return false;

    const directDetail = findInventoryCodexSocketInRoots(
        roots.filter(root => root.classList.contains('attack-essence-sockets--detail')),
        target.slotIndex,
        true
    );
    if (directDetail?.socket) {
        directDetail.socket.click();
        return true;
    }

    const thumbRoot = roots.find(root => root.classList.contains('attack-essence-sockets--thumb'));
    if (thumbRoot && clickInventoryCodexAttackThumb(thumbRoot)) {
        requestAnimationFrame(() => {
            const refreshedRoots = findInventoryCodexAttackSocketRoots(codexRoot, target);
            const refreshedSocket = findInventoryCodexSocketInRoots(refreshedRoots, target.slotIndex, true)
                || findInventoryCodexSocketInRoots([thumbRoot], target.slotIndex, false);
            refreshedSocket?.socket?.click();
        });
        return true;
    }

    const fallback = findInventoryCodexSocketInRoots(roots, target.slotIndex, true);
    if (!fallback?.socket) return false;

    fallback.socket.click();
    return true;
}

function scheduleOpenAttackEssencePopupInCodex(codexRoot, attackTarget, maxAttempts = 8) {
    let attempts = Math.max(1, Math.floor(Number(maxAttempts) || 1));

    const tryOpen = () => {
        if (!codexRoot?.isConnected) {
            clearPendingInventoryCodexAttackTarget(attackTarget);
            return;
        }
        if (openAttackEssencePopupInCodex(codexRoot, attackTarget)) {
            clearPendingInventoryCodexAttackTarget(attackTarget);
            return;
        }

        attempts -= 1;
        if (attempts > 0) {
            requestAnimationFrame(tryOpen);
        } else {
            clearPendingInventoryCodexAttackTarget(attackTarget);
        }
    };

    tryOpen();
}

function selectInventoryCodexStatsSubmenu(codexRoot, submenu = 'equipment') {
    if (!codexRoot) return false;

    const pictoClass = submenu === 'attack' ? 'picto-attack' : 'picto-equipment';
    const picto = codexRoot.querySelector(`.codex-picto-menu-entity.${pictoClass}`);
    if (!picto) return false;

    if (!picto.classList.contains('active')) {
        picto.click();
    }

    return true;
}

function openInventoryEntityCodexTarget({
    entityId,
    submenu = 'equipment',
    attackKey = '',
    attackKeys = [],
    attackIndex = null,
    slotIndex = null,
} = {}) {
    const entite = findInventoryEntityById(entityId);
    if (!entite) return false;

    const gameUi = document.querySelector('.Game-UI');
    if (!gameUi) return false;

    let menuMap = gameUi.querySelector('.menu-map-container');
    if (!menuMap) {
        menuMap = document.createElement('div');
        menuMap.className = 'menu-map-container';
        gameUi.appendChild(menuMap);
    }

    closeMenusForInventoryCodexJump();
    menuMap = gameUi.querySelector('.menu-map-container') || menuMap;

    const attackTarget = {
        entityId: entite.id,
        key: attackKey,
        keys: attackKeys,
        attackIndex,
        slotIndex,
    };
    setPendingInventoryCodexAttackTarget(submenu === 'attack' ? attackTarget : null);

    setCodexMenuIndex(submenu === 'attack' ? 2 : 3);
    if (submenu !== 'attack') setCodexSubmenuIndex(getInventoryCodexSubmenuIndex(entite, submenu));

    createCodexEntityScan(entite, menuMap, `codex-entity_${entite.id}`);

    requestAnimationFrame(() => {
        const codexRoot = document.getElementById(`codex-entity_${entite.id}`);
        if (submenu !== 'attack') selectInventoryCodexStatsSubmenu(codexRoot, submenu);

        reorderMenuMapChildren();
        MenuContainerDisplayRules();
        enforceMenuDisplayRules();

        if (submenu !== 'attack') return;

        requestAnimationFrame(() => {
            const refreshedCodexRoot = document.getElementById(`codex-entity_${entite.id}`);
            scheduleOpenAttackEssencePopupInCodex(refreshedCodexRoot, attackTarget);
        });
    });

    return true;
}

function createEntityCodex(entite, parentDiv) {
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
spriteImgContainer.dataset.dropable = 'true';
spriteImgContainer.dataset.entityId = entite.id;
requestAnimationFrame(() => {
  LevelupSignal(entite, 'icon', {
    parent: `#codex-entity-sprite-container_${entite.id}`
  });
});

    const spriteImg = document.createElement('img');
    spriteImg.src = cachedResourceUrl(entite.sprite || entite.portrait || './media/portrait/unknown.jpg');
    spriteImg.alt = entite.name;
    spriteImg.classList.add('codex-entity-sprite');
    spriteImg.dataset.dropable = 'true';
    spriteImg.dataset.entityId = entite.id;
    spriteImgContainer.appendChild(spriteImg);

    // Bloc Infos
    const entiteInfos = document.createElement('div');
    entiteInfos.classList.add('codex-entite-infos');

    const textInfos = document.createElement('div');
    textInfos.classList.add('codex-text-infos');
    const nameP = document.createElement('p');
    nameP.classList.add('codex-entity-name');
    nameP.textContent = entite.nickname ?? entite.name;
    const nameRow = document.createElement('div');
    nameRow.className = 'entity-power-name-row';
    nameRow.append(nameP, createEntityPowerValue(entite));
    textInfos.appendChild(nameRow);
    entiteInfos.appendChild(textInfos);
entiteInfos.appendChild(textInfos);

const armorCounter = createArmorCounter(entite);
if (armorCounter) {
  entiteInfos.appendChild(armorCounter);
}
    // HP
 // 🧩 HEADSUP — HP + Armor unifiés
const headsupHP = document.createElement('div');
headsupHP.classList.add('headsup-HP-container', entite.side || 'A', entite.type);
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
  const movementCounter = createMovementCounter(entite);
  if (movementCounter) lifeCounter.appendChild(movementCounter);
  headsupHP.appendChild(lifeCounter);
}
entiteInfos.appendChild(headsupHP);

    codexEntry.appendChild(spriteImgContainer);
	codexEntry.appendChild(levelDiv);
    codexEntry.appendChild(entiteInfos);

DropInventorytoCodex(codexEntry, entite.id);
    parentDiv.appendChild(codexEntry);
	return codexEntry;
}

let cleanupTopLinesClass = null;

const CODEX_SECTION_CLASSES = [
  "section-profil",
  "section-stats",
  "section-attaques",
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
  else if (key === "attaques") codexRootEl.classList.add("section-attaques");
  else if (key === "soul") codexRootEl.classList.add("section-soul");
  else if (key === "informations") codexRootEl.classList.add("section-informations");
}

function getCurrentCodexEntity(entity) {
  const matches = candidate => String(candidate?.id) === String(entity?.id);
  // Admin board entities may only exist in memory (including Side B).
  // A cached Codex copy or saved army must not hide their validated edits.
  if (getStageAccess().admin) {
    const live = entites.find(matches);
    if (live) return live;
  }
  return loadFromLocalStorage('selectedArmyA', []).find(matches) || entity;
}

function  createCodexEntityScan(entite, container, codexId, positionClass = '') {
    entite = getCurrentCodexEntity(entite);
    const codexDiv = document.createElement('div');
    const navigationMemory = bindCodexNavigationMemory(codexDiv, entite.id);
    if (isAdminMode()) setAdminSelectedEntity(entite.id);
    codexDiv.addEventListener('pointerdown', () => {
        if (isAdminMode()) setAdminSelectedEntity(entite.id);
    });
    codexDiv.classList.add('codex-entity-scan', entite.type);
    applyCombatProfileView(codexDiv, entite);
    if (positionClass) codexDiv.classList.add(positionClass);
    codexDiv.id = codexId;
    bindHelperEntity(codexDiv, entite);

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
const syncCodexAuras = () => {
  const auraContainer =
    ensureCodexAuraContainer();

  if (!auraContainer?.isConnected) {
    return;
  }

  syncEntityAuras(
    entite,
    auraContainer
  );
};

let AuraContainer = ensureCodexAuraContainer();

requestAnimationFrame(() => {
  requestAnimationFrame(syncCodexAuras);
});

const codexImage = document.querySelector(
  `.codex-entity-view[data-id="${entite.id}"]
   img.codex-scan-image`
);

if (codexImage) {
  if (codexImage.complete) {
    requestAnimationFrame(syncCodexAuras);
  } else {
    codexImage.addEventListener(
      "load",
      syncCodexAuras,
      { once: true }
    );
  }
}

let codexColumn4 = document.createElement('div');
    codexColumn4.className = 'codex-colomn-4';

    let codexColumn2 = document.createElement('div');
    codexColumn2.className = 'codex-colomn-2';

  const sections = ['Profil', 'Attaques', 'Stats', 'Soul', 'Informations'];
  let informationMode = 'history';
    let codexColumn3 = document.createElement('div');
    codexColumn3.className = 'codex-colomn-3';
function getActiveCodexInnerSection(codexColumn2) {
  const activeBtn = codexColumn2.querySelector(".codex-inner-menu.active");
  if (!activeBtn) return null;

  return [...activeBtn.childNodes]
    .filter(node => node.nodeType === Node.TEXT_NODE)
    .map(node => node.textContent.trim())
    .join("");
}

function hasLevelUpPreview(entite) {
  const preview = entite?.modifierStats?.preview;
  const statLeveled = preview?.statLeveled;

  return !!(
    preview &&
    statLeveled &&
    Object.keys(statLeveled).length > 0
  );
}

function purgeLevelUpPreviewOnSoulExit(entite, codexColumn2, nextSection) {
  const currentSection = getActiveCodexInnerSection(codexColumn2);

  // On ne purge que si on quitte Soul vers un autre onglet
  if (currentSection !== "Soul") return;
  if (nextSection === "Soul") return;

  // Si aucun brouillon de level-up n'existe, rien à faire
  if (!hasLevelUpPreview(entite)) return;

  console.log("🧹 Sortie de Soul sans validation : purge preview level-up", {
    entiteId: entite.id,
    name: entite.name,
    nextSection
  });

  // 1. Purge mémoire immédiate
  if (entite.modifierStats?.preview) {
    delete entite.modifierStats.preview;
  }

  // 2. Purge localStorage / selectedArmyA
  purgeStatPreview(entite.id);

  // 3. Nettoyage visuel de sécurité si des nodes existent encore
  document
    .querySelectorAll(`#codex-entity_${entite.id} .entite-stat.preview`)
    .forEach(el => {
      el.textContent = "";
      el.classList.add("is-hidden");
    });

  document
    .querySelectorAll(`#codex-entity_${entite.id} .stat-container`)
    .forEach(el => {
      el.classList.remove("upgraded", "reducted", "has-preview", "last-substat", "last-attribut");
      delete el.dataset.previewDelta;
    });

  document
    .querySelectorAll(`#archetype-icons-${entite.id} .archetype-icon.preview`)
    .forEach(el => el.remove());
}
function openCodexAttackDetail(attack, attackIndex = null, slotIndex = null) {
  const attackTarget = {
    entityId: entite.id,
    key: attackSelectionKey(attack),
    keys: getInventoryAttackKeyCandidates(attack),
    attackIndex,
    slotIndex,
  };
  setPendingInventoryCodexAttackTarget(attackTarget);
  setCodexMenuIndex(2);
  showSection('Attaques');

  if (slotIndex == null) {
    clearPendingInventoryCodexAttackTarget(attackTarget);
    return;
  }

  requestAnimationFrame(() => scheduleOpenAttackEssencePopupInCodex(codexDiv, attackTarget));
}
function showSection(section) {
  navigationMemory.capture();
  closeAttackEssenceSocketPopups();
  entite = getCurrentCodexEntity(entite);

  // ✅ stats-view ON uniquement sur la section Stats, OFF sinon
  const codexRoot = document.getElementById(codexId) || codexDiv; // codexId = "codex-entity_..."
  bindHelperEntity(codexRoot, entite);
  setCodexActiveSectionClass(codexRoot, section);
  codexRoot.classList.remove('battle-stats-view');
  purgeLevelUpPreviewOnSoulExit(entite, codexColumn2, section);
  if (cleanupTopLinesClass) {
    cleanupTopLinesClass();
    cleanupTopLinesClass = null;
  }

  codexColumn3.querySelector('.attack-submenu')?._dispose?.();
  codexColumn3.innerHTML = "";
  codexColumn3.classList.remove('stat', 'umbra', 'archetype', 'soul');

  const sectionDiv = document.createElement("div");
  sectionDiv.className = `section-content ${section.toLowerCase()}`;

// ✅ menu state
codexColumn2.querySelectorAll(".codex-inner-menu").forEach(btn => {
  const cleanText = [...btn.childNodes]
    .filter(node => node.nodeType === Node.TEXT_NODE)
    .map(node => node.textContent.trim())
    .join("");

  btn.classList.toggle("active", cleanText === section);
});

// ✅ injecte le level up icon
const soulMenuEl = codexColumn2.querySelector('.codex-inner-menu:has(.codex-soul)');

LevelupSignal(entite, 'icon', {
  section: 'Soul',
  parent: soulMenuEl,
  onOpen: (s) => showSection(s)
});

  const menuIdx1 = activeIndex1Based(codexColumn2, ".codex-inner-menu");
  setCodexMenuIndex(menuIdx1);
  // =========================
  // INFORMATIONS
  // =========================
if (section === "Informations") {
  resetCodexColumn1(codexColumn1);
  toggleCodexSideColumns(section, codexColumn1, entite, { onOpenAttack: openCodexAttackDetail });

  const { textDiv, ambianceDiv } = createEntityLore(entite);
  codexColumn1.appendChild(ambianceDiv);

  const tabs = document.createElement('div');
  tabs.className = 'codex-substat-toggle codex-substat-tabs-vertical codex-information-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Informations de l’entité');
  const historyTab = createCodexSubstatTab({ mode: 'history', iconClass: 'picto-histoire', title: 'Histoire' });
  const combatTab = createCodexSubstatTab({ mode: 'combat', iconClass: 'picto-battlestat', title: 'Statistiques de combat' });
  historyTab.id = `codex-information-history-tab-${entite.id}`;
  combatTab.id = `codex-information-combat-tab-${entite.id}`;
  historyTab.setAttribute('role', 'tab');
  combatTab.setAttribute('role', 'tab');
  tabs.append(historyTab, combatTab);

  const historyPage = document.createElement('div');
  historyPage.className = 'codex-information-history';
  historyPage.setAttribute('role', 'tabpanel');
  historyPage.setAttribute('aria-labelledby', historyTab.id);

  const entityName = document.createElement("h3");
  entityName.className = "codex-entity-name-only";
  entityName.textContent =
    entite?.name ||
    entite?.nom ||
    entite?.class ||
    "Entité inconnue";
  entityName.appendChild(createEntityPowerValue(entite));

  const goldline = document.createElement("div");
  goldline.className = "separation-line golden";

  historyPage.append(entityName, goldline, textDiv);
  const battlePage = createCodexInformationBattlePage(entite);
  battlePage.setAttribute('role', 'tabpanel');
  battlePage.setAttribute('aria-labelledby', combatTab.id);
  sectionDiv.append(tabs, historyPage, battlePage);

  const setInformationMode = mode => {
    const selected = mode === 'combat' ? 'combat' : 'history';
    codexRoot.classList.toggle('battle-stats-view', selected !== 'history');
    for (const [key, tab, page] of [['history', historyTab, historyPage], ['combat', combatTab, battlePage]]) {
      page.hidden = key !== selected;
      tab.classList.toggle('active', key === selected);
      tab.setAttribute('aria-selected', String(key === selected));
    }
    informationMode = selected;
  };
  historyTab.addEventListener('click', () => setInformationMode('history'));
  combatTab.addEventListener('click', () => setInformationMode('combat'));
  setInformationMode(informationMode);
}
 // =========================
  // PROFIL
  // =========================
  if (section === "Profil") {
	resetCodexColumn1(codexColumn1);
    ensureDirectEntityView(codexColumn1, entite);
    toggleCodexSideColumns(section, codexColumn1, entite, { onOpenAttack: openCodexAttackDetail });

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
    StatEntityName.appendChild(createEntityPowerValue(entite));
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
    applyCombatProfileView(roleTypeDiv, entite, { text: true, helper: true });
    if (entite.archetypeFrozen === true) {
      const frozen = document.createElement('span');
      frozen.className = 'entity-frozen-badge';
      frozen.textContent = 'Figée';
      frozen.title = HELPER_TEXT.frozenEntity;
      roleTypeDiv.appendChild(frozen);
    }
    entityStatsDiv.appendChild(roleTypeDiv);

    entityStatsDiv.appendChild(createCodexProfileSummary(entite));

    const separatorDiv = document.createElement("div");
    separatorDiv.className = "separator";
    entityStatsDiv.appendChild(separatorDiv);

    sectionDiv.appendChild(entityStatsDiv);

    sectionDiv.appendChild(createAttackReadOnlyOverview(entite, {
      variant: 'profile',
      onOpenAttack: openCodexAttackDetail,
    }));

  }
// =========================
// STATS 
// =========================
if (section === "Stats") {
  resetCodexColumn1(codexColumn1);
  removeDirectEntityView(codexColumn1);

  // ✅ 1) Dans Stats, on veut le menu de Soul en colonne 1
  toggleCodexSideColumns("Stats", codexColumn1, entite, { onOpenAttack: openCodexAttackDetail });

  const statsBlock = document.createElement("div");
  statsBlock.className = "codex-attack-stat-block";
  const subStatToggle = document.createElement("div");
  subStatToggle.className = "codex-substat-toggle codex-substat-tabs-vertical";

  const statTab = createCodexSubstatTab({
    mode: "stat",
    iconClass: "picto-stat-percent",
    title: "Voir les statistiques",
    text: ""
  });

  const umbraTab = createCodexSubstatTab({
    mode: "umbra",
    iconClass: "picto-umbra",
    title: "Voir les Umbras",
    text: ""
  });

  subStatToggle.append(statTab, umbraTab);

  const subStatContainer = document.createElement("div");
subStatContainer.className = "codex-substat-container codex-substat-panel codex-substat-panel--umbra";
subStatContainer.dataset.entityId = entite.id;

const setStatsPanelMode = (mode) => {
  const isStat = mode === "stat";
  const isUmbra = mode === "umbra";

  // Build only the requested view, using the latest entity on its first visit.
  entite = getCurrentCodexEntity(getBoundHelperEntity(codexDiv) || entite);
  bindHelperEntity(codexDiv, entite);
  if (isStat && !statsBlock.firstElementChild) buildStatsPanel();
  if (isUmbra && !subStatContainer.firstElementChild) renderCodexUmbraSubstatPanel(subStatContainer, entite);

  codexColumn3.classList.toggle("stat", isStat);
  codexColumn3.classList.toggle("umbra", isUmbra);

  statsBlock.style.display = isStat ? "" : "none";
  subStatContainer.style.display = isUmbra ? "" : "none";

  [statTab, umbraTab].forEach(tab => {
    tab.classList.toggle("active", tab.dataset.mode === mode);
  });

  setCodexSubstatMode(mode);
};
  statTab.addEventListener("click", () => setStatsPanelMode("stat"));
  umbraTab.addEventListener("click", () => setStatsPanelMode("umbra"));

  function buildStatsPanel() {
  const statTitleAttribut = goldTitle('Attributs', 'p');

  const attributheader = document.createElement("div");
  attributheader.className = "entity-stats-section attributs";

  createUmbraBlock(attributheader, 'Force', () => getSafe(entite, "strength", 0), entite, "strength", false, 'attribut');
  createUmbraBlock(attributheader, 'Intelligence', () => getSafe(entite, "intelligence", 0), entite, "intelligence", false, 'attribut');
  createUmbraBlock(attributheader, 'Agilité', () => getSafe(entite, "agility", 0), entite, "agility", false, 'attribut');

  const statTitleStats = goldTitle('Statistiques', 'p');

  // ----------------------- ATTACK ----------------------- //
  const attackBlock = createStatSection({
    sectionClass: "attack",
    titleText: "Attaque",
    titleClass: "attack",
  });

  const frag = document.createDocumentFragment();

  frag.appendChild(statTitle({ statClass: "physicalDamage", title: "Attaques physiques :" }));

  frag.appendChild(createValideStatDom({ stat: "physicalDamage", label: "Puissance Physique : ", value: "${value}", entite }));
  frag.appendChild(  createValideStatDom({
    stat: "piercingDamage",
    label: "Puissance Perçante : ",
    value: "${value}",
    entite,
    dataStat: "piercingDamage",
  }));

  frag.appendChild(createValideStatDom({ stat: "physicalPen", label: "Pénétration résistance physique : ", value: "${value} %", entite, calculatorName: "calculatePhysicalPenPercent" }));

const criticalPowerValue = Number(readEntityKey(entite, "criticalPower")) || 0;
const criticalChanceValue = Number(readEntityKey(entite, "criticalChance")) || 0;
const criticalDamageValue = Number(readEntityKey(entite, "criticalDamage")) || 0;

const hasCriticalPower = criticalPowerValue > 0 || getStatMalusSources(entite, 'criticalPower').length > 0;
const hasCriticalChance = criticalChanceValue > 0 || getStatMalusSources(entite, 'criticalChance').length > 0;
const hasCriticalDamage = criticalDamageValue > 0 || getStatMalusSources(entite, 'criticalDamage').length > 0;

if (hasCriticalPower || hasCriticalChance) {
  frag.appendChild(createValideStatDom({
    stat: "criticalChance",
    originKey: hasCriticalChance ? "criticalChance" : "criticalPower",
    label: "Chance de coup critique :",
    value: "${value} %",
    entite,
    calculatorName: "calculateCritTotalChance",
    dataStat: "criticalChance"
  }));
}

if (hasCriticalPower || hasCriticalChance || hasCriticalDamage && criticalDamageValue !== balanceData.critical.damage.nativeBasePercent) {
  frag.appendChild(createValideStatDom({
    stat: "criticalDamage",
    originKey: hasCriticalDamage ? "criticalDamage" : "criticalPower",
    label: "Dégâts des coups critiques :",
    value: "+ ${value} %",
    entite,
    calculatorName: "calculateCritDamageBonus",
    dataStat: "criticalDamage"
  }));
}
  frag.appendChild(createValideStatDom({ stat: "ambidextry", label: "Chance de deuxième coup : ", value: "${value} %", entite, calculatorName: "calculateAmbidextryTotalChance" }));
  frag.appendChild(createValideStatDom({ stat: "ambidextry", label: "Dégâts du deuxième coup : ", value: "${value} %", entite, calculatorName: "calculateAmbidextryDamageBonus" }));

const bloodFuryValue = Number(readEntityKey(entite, "bloodFury")) || 0;
const bloodFuryExecutionChanceValue = Number(readEntityKey(entite, "bloodFuryExecutionChance")) || 0;
const bloodFuryExecutionDamageValue = Number(readEntityKey(entite, "bloodFuryExecutionDamage")) || 0;
const bloodFuryTargetThresholdValue = Number(readEntityKey(entite, "bloodFuryTargetThreshold")) || 0;

if (bloodFuryValue > 0 || bloodFuryExecutionChanceValue > 0 || getStatMalusSources(entite, 'bloodFuryExecutionChance').length) {
  frag.appendChild(createValideStatDom({
    stat: "bloodFuryExecutionChance",
    originKey: bloodFuryExecutionChanceValue > 0 ? "bloodFuryExecutionChance" : "bloodFury",
    label: "Chance d'exécution :",
    value: "${value} %",
    entite,
    calculatorName: "calculateBloodFuryExecutionPercent",
    dataStat: "bloodFuryExecutionChance"
  }));
}

if (bloodFuryValue > 0 || bloodFuryExecutionDamageValue > 0 || getStatMalusSources(entite, 'bloodFuryExecutionDamage').length) {
  frag.appendChild(createValideStatDom({
    stat: "bloodFuryExecutionDamage",
    originKey: bloodFuryExecutionDamageValue > 0 ? "bloodFuryExecutionDamage" : "bloodFury",
    label: "Dégâts de l'exécution :",
    value: "+ ${value}",
    entite,
    calculatorName: "calculateExecutionDamage",
    dataStat: "bloodFuryExecutionDamage"
  }));
}

if (bloodFuryValue > 0 || bloodFuryTargetThresholdValue > 0 || getStatMalusSources(entite, 'bloodFuryTargetThreshold').length) {
  frag.appendChild(createValideStatDom({
    stat: "bloodFuryTargetThreshold",
    originKey: bloodFuryTargetThresholdValue > 0 ? "bloodFuryTargetThreshold" : "bloodFury",
    label: "Vulnérabilité de la cible :",
    value: "${value} % de ses HP",
    entite,
    calculatorName: "calculateBloodFuryTargetThreshold",
    dataStat: "bloodFuryTargetThreshold"
  }));
}

frag.appendChild(createValideStatDom({
  stat: "bloodThirsty",
  originKey: "bloodThirsty",
  label: "Soif de sang :",
  value: "${value} %",
  entite,
  calculatorName: "getBloodThirstyPercent",
  dataStat: "bloodThirsty"
}));
  frag.appendChild(statTitle({ statClass: "magicalDamage", title: "Attaques magiques :" }));
  frag.appendChild(createValideStatDom({ stat: "magicalDamage", label: "Puissance Magique : ", value: "${value}", entite, calculatorName: "calculateMagicalTotal" }));
  frag.appendChild(createValideStatDom({ stat: "magicalPen", label: "Pénétration résistance magique : ", value: "${value} %", entite, calculatorName: "calculateMagicalPenPercent" }));
  frag.appendChild(createValideStatDom({ stat: "cognitiveExplosion", label: "Explosion cognitive : ", value: "+ ${value}", entite, calculatorName: "calculateCognitiveExplosionTotal" }));
  frag.appendChild(createValideStatDom({ stat: "cognitiveGenerator", label: "Générateur cognitif : ", value: "+ ${value}", entite, calculatorName: "calculateHypercognitionEssences" }));

  attackBlock.appendChild(frag);
  removeEmptyCodexStatGroup(attackBlock, 'physicalDamage');
  removeEmptyCodexStatGroup(attackBlock, 'magicalDamage');

  attackBlock.appendChild(createValideStatDom({ stat: 'precision', label: 'Précision : ', value: '${value} %', entite,
    calculatorName: e => getStatSystemResult(e, 'precision')?.chancePercent || 0 }));
  attackBlock.appendChild(createValideStatDom({ stat: 'bullsEye', label: 'Bull’s Eye : ', value: '${value} %', entite,
    calculatorName: 'calculateBullsEyePercent' }));
  finalizeCodexStatSection(attackBlock, "L'entité n'a pas de statistiques offensives.");

  // ----------------------- DEFENCE ----------------------- //
  const defenceBlock = createStatSection({ sectionClass: "defence", titleText: "Défense", titleClass: "defence" });

  defenceBlock.appendChild(createValideStatDom({ stat: "physicalResistance", label: "Réduction dégats physiques : ", value: "${value} %", entite }));
  defenceBlock.appendChild(createValideStatDom({ stat: "magicalResistance", label: "Réduction dégats magiques : ", value: "${value} %", entite }));
  defenceBlock.appendChild(createValideStatDom({ stat: "dodge", label: "Chance d'esquive : ", value: "${value} %", entite, calculatorName: "calculateTotalDodgeBonus" }));
  defenceBlock.appendChild(createValideStatDom({ stat: "criticalResistance", label: "Résistance aux critiques : ", value: "${value} %", entite }));
  defenceBlock.appendChild(createValideStatDom({ stat: "alterationResistance", label: "Résistance aux altérations : ", value: "${value} %", entite }));
  defenceBlock.appendChild(createValideStatDom({ stat: "hindranceResistance", label: "Résistance aux entraves : ", value: "${value} %", entite }));
  defenceBlock.appendChild(createValideStatDom({ stat: "resilienceTotal", label: "Résilience totale : ", value: "${value} %", entite }));
  defenceBlock.appendChild(createValideStatDom({ stat: "indestructibility", label: "Chance d'Indestructibilité totale : ", value: "${value} %", entite, calculatorName: "calculateIndestructibilityPercentFromEntity" }));
  defenceBlock.appendChild(createValideStatDom({ stat: "indestructibility", label: "Réduction de tous les dégats : ", value: "${value} %", entite, calculatorName: "caluclateIndestructibilityReductionTotal" }));
defenceBlock.appendChild(createValideStatDom({
  stat: "hpBattleRegen",
  originKey: "indestructibility",
  label: "Régénération de Combat : ",
  value: "${value} % des HP max / tour",
  entite,
  calculatorName: "calculateHpBattleRegenPercent",
  dataStat: "hpBattleRegen"
}));
  defenceBlock.appendChild(createValideStatDom({ stat: "fatalSurvival", label: "Survie fatale : ", value: "${value} %", entite, calculatorName: "calculateAstralityTotal" }));
  defenceBlock.appendChild(createValideStatDom({ stat: "esoterism", label: "Chance d'Ésotérisme : ", value: "${value} %", entite, calculatorName: "calculateEsoterismPercent" }));
  defenceBlock.appendChild(createValideStatDom({ stat: "esoterism", label: "Réduction des dégâts par Ésotérisme : ", value: "${value} %", entite, calculatorName: "calculateEsoterismtotalReduction" }));
  defenceBlock.appendChild(createValideStatDom({ stat: "transcendenceTotal", label: "Transcendance totale : ", value: "${value} %", entite, calculatorName: "calculateTranscendenceConsoProtectionTotal" }));
  defenceBlock.appendChild(createValideStatDom({
    stat: "extraLife",
    label: "Vies transcendées : ",
    value: "${value}",
    entite,
    calculatorName: (e) => {
      const system = getStatSystemResult(e, 'extraLife');
      if (system) return system.value;
      const points =
        e?.modifierStats?.preview?.total?.transcendence ??
        e?.stats?.transcendence ??
        e?.baseStats?.transcendence ??
        e?.transcendence ??
        0;
      return calculateTranscendenceExtraLife(points, globalThis.umbraProgression.getUmbraThreshold(e));
    },
  }));
defenceBlock.appendChild(createValideStatDom({
  stat: "occultism",
  label: "Chance d'invisibilité :",
  value: "${value} %",
  entite,
  calculatorName: "calculateOccultismInvisibilityChance"
}));

defenceBlock.appendChild(createValideStatDom({
  stat: "occultism",
  label: "Évitement du ciblage :",
  value: "${value} %",
  entite,
  calculatorName: "calculateOccultismTargetableChanceDisplay"
}));

// defenceBlock.appendChild(createValideStatDom({
  // stat: "occultism",
  // label: "Bonus esquive invisible :",
  // value: "+ ${value}",
  // entite,
  // calculatorName: "calculateOccultismDodgeBonus"
// }));

defenceBlock.appendChild(createValideStatDom({
  stat: "occultism",
  label: "Bonus critique prochaine attaque :",
  value: "+ ${value} %",
  entite,
  calculatorName: "calculateOccultismCritChanceBonus"
}));

// defenceBlock.appendChild(createValideStatDom({
  // stat: "occultism",
  // label: "Fragilité des ombres :",
  // value: "+ ${value} % dégâts reçus",
  // entite,
  // calculatorName: "calculateOccultismShadowFragilityPercent"
// }));
  // ----------------------- UTILITAIRE ----------------------- //
  const utilitaireBlock = createStatSection({ sectionClass: "utilitaire", titleText: "Utilitaire", titleClass: "utilitaire" });

utilitaireBlock.appendChild(createValideStatDom({
  stat: "will",
  label: "Lvl max",
  value: "${value}",
  entite,
  calculatorName: "calculateLvlMaxEntiteWithWill"
}));
function createWeightStatDom(entite) {
  const weight = getMovementWeightMalus(entite);

  if (!weight || !weight.weightClass || !weight.label) {
    return document.createDocumentFragment();
  }

  const qualifier = String(weight.label || "")
  .replace(/^Poids\s+/i, "")
  .replace(/^./, c => c.toUpperCase());

  return createFullStatDom({
    stat: 'weight',
    label: "Poids :",
    value: qualifier,
    entite,
    dataStat: "weight",
    showZero: true,
  });
}utilitaireBlock.appendChild(createWeightStatDom(entite));
function createShiftStatDom(entite) {
  if (!entityHasKey(entite, "shift")) {
    return document.createDocumentFragment();
  }

  const shift = entite?.stats?.shift ?? { current: 0, max: 0 };

  return createFullStatDom({
    stat: "shift",
    label: "Déplacements :",
    value: `${Number(shift.current || 0)} / ${Number(shift.max || 0)}`,
    entite,
    showZero: true,
  });
} utilitaireBlock.appendChild(createShiftStatDom(entite));
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
      const ms = getSafe(e, 'speed', 0);
      return (Number(ms) || 0) / 1000;
    },
  }));

  utilitaireBlock.appendChild(createValideStatDom({ stat: 'velocity', label: 'Vélocité :', value: '${value} %', entite }));
  utilitaireBlock.appendChild(createValideStatDom({ stat: 'controlledSpeed', label: 'Vitesse contrôlée :', value: '${value} %', entite }));
  utilitaireBlock.appendChild(createValideStatDom({ stat: 'agileRetreat', label: 'Retraite agile :', value: '${value} %', entite,
    originKey: 'velocity', calculatorName: 'calculateAgileRetreatChance' }));
	utilitaireBlock.appendChild(createValideStatDom({
  stat: "equilibreAggroReduction",
  label: "Réduction d'aggro :",
  value: "- ${value} %",
  entite
}));

utilitaireBlock.appendChild(createValideStatDom({
  stat: "equilibreAggroBonus",
  label: "Présence équilibrée :",
  value: "+ ${value} %",
  entite
}));
utilitaireBlock.appendChild(createValideStatDom({
  stat: "equilibreInvisibleDetection",
  label: "Perception équilibrée :",
  value: "${value} %",
  entite
}));
utilitaireBlock.appendChild(createValideStatDom({
  stat: "equilibreBalancedAttackChance",
  label: "Attaque équilibrée :",
  value: "${value} %",
  entite
}));
	utilitaireBlock.appendChild(createValideStatDom({
  stat: "mysticism",
  label: "Chance d'entrer en transe mystique :",
  value: "${value} %",
  entite,
  calculatorName: "calculateMysticismProcChance"
}));

utilitaireBlock.appendChild(createValideStatDom({
  stat: "mysticism",
  label: "Durée de la transe mystique :",
  helperEffect: "mysticismTranceDuration",
  value: "${value} scd",
  entite,
  calculatorName: (e) =>
    ((Number(calculateMysticismTranceDuration(e)) || 0) / 1000)
      .toFixed(1)
      .replace(/\.0$/, "")
}));

utilitaireBlock.appendChild(createValideStatDom({
  stat: "mysticism",
  label: "Bonus vitesse mystique :",
  value: "+ ${value} %",
  entite,
  calculatorName: "calculateMysticismPreparationAcceleration"
}));

utilitaireBlock.appendChild(createValideStatDom({
  stat: "mysticism",
  label: "Bonus attaque mystique :",
  value: "+ ${value} % de dégâts de l'attaque",
  entite,
  calculatorName: "calculateMysticismTotalDamageBonus"
}));

// utilitaireBlock.appendChild(createValideStatDom({
  // stat: "movement",
  // label: "Déplacements au début du tour :",
  // value: "${value}",
  // entite,
  // calculatorName: "calculateMovementStartingCharges"
// }));
utilitaireBlock.appendChild(createValideStatDom({
  stat: "marathon",
  label: "Marathonien :",
  value: "${value} %",
  entite,
  calculatorName: "getMarathonChance"
}));
utilitaireBlock.appendChild(createValideStatDom({
  stat: "trailer",
  label: "Trailer :",
  value: "${value} %",
  entite,
  calculatorName: "getTrailerChance"
}));

utilitaireBlock.appendChild(createValideStatDom({
  stat: "weaponOrfevre",
  label: "Efficacité des équipements :",
  value: "+ ${value}%",
  entite,
  calculatorName: "getFinalWeaponOrfevreBonus",
  dataStat: "weaponOrfevre"
}));

utilitaireBlock.appendChild(createValideStatDom({
  stat: "weaponCollector",
  label: "Butins d'équipement :",
  value: "+ ${value}%",
  entite,
 calculatorName: "getFinalWeaponCollectorBonus",
  dataStat: "weaponCollector"
}));

utilitaireBlock.appendChild(createValideStatDom({
  stat: "charge",
  label: "Charge :",
  value: "${value}",
  entite,
  dataStat: "charge"
}));
const speedStats = [
  {
    stat: "cooldownTime",
    originKey: "attackCooldownReduc",
    label: "Durée de Cooldown :",
    value: "- ${value} %",
    calculatorName: "getFinalAttackCooldownReduc",
    dataStat: "cooldownTime"
  },
  {
    stat: "preparationTime",
    originKey: "attackPreparationReduc",
    label: "Durée de Préparation :",
    value: "- ${value} %",
    calculatorName: "getFinalAttackPreparationReduc",
    dataStat: "preparationTime"
  },
  {
    stat: "executionTime",
    originKey: "attackExecutionReduc",
    label: "Durée d'Exécution :",
    value: "- ${value} %",
    calculatorName: "getFinalAttackExecutionReduc",
    dataStat: "executionTime"
  },
  {
    stat: "recuperationTime",
    originKey: "attackRecoveryReduc",
    label: "Durée de Récupération :",
    value: "- ${value} %",
    calculatorName: "getFinalAttackRecoveryReduc",
    dataStat: "recuperationTime"
  },
  {
    stat: "projectileTime",
    originKey: "attackProjectileSpeed",
    label: "Vitesse des projectiles :",
    value: "+ ${value} %",
    calculatorName: "getFinalAttackProjectileSpeed",
    dataStat: "projectileTime"
  }
];

speedStats.forEach(opts => {
  const directExists = entityHasKey(entite, opts.originKey);
  const hasteExists = entityHasKey(entite, "haste");

  if (!directExists && !hasteExists) return;

  utilitaireBlock.appendChild(createValideStatDom({
    ...opts,
    originKey: directExists ? opts.originKey : "haste",
    entite
  }));
});

   const allStatBlock = document.createElement("div");
  allStatBlock.className = "entity-stats-title statistiques";
  finalizeCodexStatSection(defenceBlock, "L'entité n'a pas de statistiques défensives.");
  finalizeCodexStatSection(utilitaireBlock, "L'entité n'a pas de statistiques utilitaires.");

allStatBlock.append(attackBlock, defenceBlock, utilitaireBlock);

statsBlock.append(statTitleAttribut, attributheader, statTitleStats, allStatBlock);
  }

sectionDiv.appendChild(subStatToggle);
sectionDiv.appendChild(subStatContainer);
sectionDiv.appendChild(statsBlock);

setStatsPanelMode(getCodexSubstatMode());
}

  // =========================
  // ATTAQUES
  // =========================
if (section === 'Attaques') {
    resetCodexColumn1(codexColumn1);
    const attackContext = document.createElement('div');
    attackContext.className = 'codex-attack-context';
    codexColumn1.appendChild(attackContext);
    toggleCodexSideColumns(section, codexColumn1, entite, { onOpenAttack: openCodexAttackDetail });
    const entityName = document.createElement('div');
    entityName.className = 'codex-attacks-entity-name';
    entityName.textContent = entite.nickname || entite.name;
    entityName.appendChild(createEntityPowerValue(entite));
    sectionDiv.appendChild(entityName);
    const attacks = createAttackSubmenu(entite, attackDetails, { compact: false, contextHost: attackContext });
    sectionDiv.appendChild(attacks);
    attacks._initAttack?.();
}
  // =========================
  // SOUL
  // =========================
if (section === 'Soul') {
    resetCodexColumn1(codexColumn1);
    removeDirectEntityView(codexColumn1);
	toggleCodexSideColumns(section, codexColumn1, entite, { onOpenAttack: openCodexAttackDetail });

  const tabs = document.createElement('div');
  tabs.className = 'codex-substat-toggle codex-substat-tabs-vertical codex-soul-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Soul et progression');
  let progressionForm;
  const modes = [
    ['progression', 'picto-stat-percent', 'Progression', panel => createLevelUpForm(entite, { purificationHost: panel })],
    ['soul', 'codex-soul', 'Voir Soul', () => createSoulGraphPanel(entite, progressionForm)],
    ['archetype', 'picto-archetype-list', 'Voir tous les archétypes', () => createArchetypesList(entite)],
  ];
  const views = modes.map(([mode, iconClass, title, build]) => {
    const tab = createCodexSubstatTab({ mode, iconClass, title });
    tab.id = `codex-soul-${mode}-tab-${entite.id}`;
    tab.setAttribute('role', 'tab');
    const panel = document.createElement('div');
    panel.className = `codex-substat-panel codex-substat-panel--${mode}`;
    panel.id = `codex-soul-${mode}-panel-${entite.id}`;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', tab.id);
    tab.setAttribute('aria-controls', panel.id);
    tabs.appendChild(tab);
    return { mode, tab, panel, build, built: false };
  });
  sectionDiv.append(tabs, ...views.map(view => view.panel));
  const setSoulMode = mode => {
    const selected = views.find(view => view.mode === mode) || views[0];
    const progression = views[0];
    if (!progression.built) {
      progressionForm = progression.build(progression.panel);
      progression.panel.appendChild(progressionForm);
      progression.built = true;
    }
    for (const view of views) {
      const active = view === selected;
      view.panel.hidden = !active;
      view.tab.classList.toggle('active', active);
      view.tab.setAttribute('aria-selected', String(active));
    }
    // Keep the form and graph together so awakening callbacks retain their original DOM.
    if (selected === progression) {
      progression.panel.appendChild(progressionForm);
    } else {
      selected.panel.replaceChildren(selected.build(selected.panel));
    }
  };
  views.forEach(view => view.tab.addEventListener('click', () => setSoulMode(view.mode)));
  setSoulMode('progression');

}
  // ✅ append unique (une seule fois)
  codexColumn3.appendChild(sectionDiv);
  navigationMemory.restore(section);

  // ✅ refresh aura container car codexColumn1 a pu changer
  AuraContainer = ensureCodexAuraContainer();
  if (AuraContainer) requestAnimationFrame(() => syncEntityAuras(entite, AuraContainer));
}
function resetCodexColumn1(codexColumn1) {
  codexColumn1.innerHTML = "";
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
    } else if (section === 'Attaques') {
        spanElement.className = 'codex-picto-menu-entity codex-attacks';
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

    // Preserve the original menu's flow space without tying its position to a content column.
    const menuSpacer = document.createElement('div');
    menuSpacer.className = 'codex-menu-spacer';
    menuSpacer.setAttribute('aria-hidden', 'true');
    codexColumn4.appendChild(menuSpacer);
    codexDiv.appendChild(codexColumn2);
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

return codexDiv;
}

function toggleCodexSideColumns(section, codexColumn1, entite, { onOpenAttack = null } = {}) {
  if (!codexColumn1) return;

  // Nettoyage systématique (évite doublons / états foireux)
  codexColumn1.querySelector(".codex-colomn-5")?.remove();
  codexColumn1.querySelector(".codex-colomn-6")?.remove();

  if (section === "Stats") {
    createStatsSubmenu(codexColumn1, entite, { onOpenAttack }); // doit créer .codex-colomn-5
  } else if (section === "Soul") {
    createSoulSubmenu(codexColumn1, entite);  // crée .codex-colomn-6
  }
}

function closeEntityCodex(entiteId = null) {
    closeAttackEssenceSocketPopups();
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

function closePlayerArmyCodex() {
    const armyCodex = document.querySelector('.army-codex-list');
    if (!armyCodex) return;
    const container = armyCodex.parentElement;
    armyCodex.remove();
    if (container?.classList.contains('menu-map-container') && !container.children.length) container.remove();
    MenuContainerDisplayRules();
}

function PlayerArmyCodex(menuIcons) {
    if (!getStageAccess().menusAllowed) return;
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
    pictogram.src = cachedResourceUrl('./media/assets/ui/picto-banner.svg');
    pictogram.alt = 'Codex de l’armée';
    pictogram.classList.add('army-codex-icon');

    // Ajout à menuIcons
    menuIcons.appendChild(pictogram);

    // Gestion du clic
pictogram.addEventListener('click', () => {
    toggleWindowInMenuMap('army-codex-list', (MenuMapContainer) => {
        closeAdminEntityFormOnly();
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

    }
}

function EntityCodexDetails(entiteId, shiftKey = false) {
    if (!requireSafeMenuAccess()) return;
	const armyCodex = document.querySelector('.army-codex-list');
    const enrichedArmyA = loadFromLocalStorage('selectedArmyA', []);
    const entite = enrichedArmyA.find(e => String(e?.id) === String(entiteId));
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

export {
  createEntityCodex,
  createCodexEntityScan,
  closePlayerArmyCodex,
  PlayerArmyCodex,
  EntityCodexDetails,
  openInventoryEntityCodexTarget,
};

// Register shared handlers once, after the complete module graph is initialized.
let initialized = false;
export function initializeCodex() {
  if (initialized) return;
  initialized = true;
  document.addEventListener('click', (event) => {
      const targetElement = event.target.closest('[id^="CodexEntityList_"]');
      if (targetElement) {
          const entiteId = parseInt(targetElement.id.split('_')[1], 10);
          EntityCodexDetails(entiteId, event.shiftKey); // ← important
      }
  });
}
