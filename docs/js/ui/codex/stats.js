import { getLifeSlots } from "../../items/resourceStocks.js";
import { buildLifeSlotHelper, buildMilestoneEssenceHelper } from "../../data/helpers.js";
import { attackDetails } from "../../data/attackList.js";
import {
  getArchetypeConfig, getClassFromAttributs, CLASS_INDEX, DEFAULT_CYCLE, getSafe, getDisplayStatKey,
  normalizeStatKey,
} from "../../entities/rules.js";
import { resolveAttackDefinitionForEntity } from "../../combat/attackResolution.js";
import { calculateStatGraphValue } from "../../combat/statistics.js";
import {
  prepareLevelUpInvestment, applyLevelUpInvestmentCost, resolveLevelUpReward,
  refundLevelUpInvestmentCost, restoreLevelUpArchetypeStage, completeLevelUpArchetypeCycle,
  snapshotLevelUpSaveState, refreshLevelUpStateAfterSave, getActiveLevelUpArchetypeKey,
  getSkippedLevelUpArchetypeStage, advanceLevelUpArchetypeStage, addLevelUpPreviewStat,
  removeLevelUpPreviewStat, applyLevelUpPreview, createLevelUpDraft, getEntityLevelCurrent,
  getEntityLevelMax, playerExperience, ComputeStatPreview, buildCostMap, getLevelUpAttributes,
  attributS, costAt, getPreviewStats, isObjStat, attribut_SHORT_TO_NAME, getConfirmedStatValue,
  saveEntityLevelUP, getClassLabel, getCycleForKey, getCycleLenFor, getArchetypeMilestones,
} from "../../entities/progression.js";
import { isEntiteAlive } from "../../app/stages.js";
import {
  stats as STATS_DATA, stats,
} from "../../data/statsData.js";
import {
  showStatGainsFromDiff, toRoman, toNonNegInt, goldTitle,
} from "../display.js";
import { closeAttackEssenceSocketPopups, updateMilestoneEssenceElement } from "../../items/essences.js";
import { getMilestoneEssenceColor } from "../../items/essenceInventory.js";
import {
  closeOpenHelpers, clamp, bindHelperEntity,
} from "../statistics/helpers.js";
import { getCodexSubmenuIndex, setCodexSubmenuIndex } from "../navigation.js";
import {
  refreshConfirmedLevelDom, renderStatPair, refreshActiveStatPreview, clearEntityStatDeltaClasses,
  isLevelUpNewStatsArea, ZERO_VALUE_VISIBLE_STAT_KEYS, renderAllStats, refreshDisplayedPowers,
  createUmbraBlock, createUmbraBlockTagged, createEntityStatsTitleNode, createBlockTitle,
  withBlockSubtitle, createBlockMarker,
} from "../statistics/components.js";
import {
  removeDirectEntityView, createProfilSubmenu, initStatRadar, getCodexStableEquipmentCharge,
  createEquipmentSubmenu,
} from "./profile.js";
import { createAttackReadOnlyOverview } from "../attacks.js";
import { levelDetails, getStatMalusSources } from "../../entities/runtime.js";
import {
  getAvailablePlayerExperience, saveToLocalStorage, loadFromLocalStorage, saveUpgradedEntity,
} from "../../storage/gameStorage.js";
import { soulScaling, updategraph, playAwakeningExtasis } from "../../rendering/animations.js";
import { startArchup } from "../../biome/meteo.js";
import {
  updateHPCounters, updateHealthBar, updateArmorCounter, updateBonusLifeCounters,
} from "../../rendering/vitalFeedback.js";

// Codex statistics, resources, soul and archetype progression panels.

function buildSoulSection(entite) {
  const hasHybridAttack = entite.attacks.some(attackName => {
    const attack = resolveAttackDefinitionForEntity(entite, attackName, attackDetails);
    return attack && attack.attacknature.includes('hybridalDamage');
  });

  const sectionDiv = document.createElement('div');
  sectionDiv.className = 'section-content soul';
  if (entite?.id != null) sectionDiv.dataset.entityId = entite.id;

  const detailSubstats = document.createElement('div');
  detailSubstats.className = 'entity-stats-section sub-stat';
  if (entite?.id != null) detailSubstats.dataset.entityId = entite.id;

  const detailstatsDiv2 = document.createElement('div');
  detailstatsDiv2.className = 'entity-stats-section right';

  const detailstatsDiv3 = document.createElement('div');
  detailstatsDiv3.className = 'entity-stats-section middle';

  const detailstatsDiv4 = document.createElement('div');
  detailstatsDiv4.className = 'entity-stats-section left';

  const statTitleSection2 = goldTitle('Umbras', 'p');

  // RIGHT
  createUmbraBlock(detailstatsDiv2, 'Vigueur', () => getSafe(entite, "vigueur", 0), entite, "vigueur");
  createUmbraBlock(detailstatsDiv2, 'Constitution', () => getSafe(entite, "constitution", 0), entite, "constitution");
  createUmbraBlock(detailstatsDiv2, 'Vitalité', () => getSafe(entite, "vitality", 0), entite, "vitality");
  createUmbraBlock(detailstatsDiv2, 'Brutalité', () => getSafe(entite, "brutality", 0), entite, "brutality");
  createUmbraBlock(detailstatsDiv2, 'Robustesse', () => getSafe(entite, "robustness", 0), entite, "robustness");
  createUmbraBlock(detailstatsDiv2, 'Résilience', () => getSafe(entite, "resilience", 0), entite, "resilience");
  createUmbraBlock(detailstatsDiv2, 'Fureur Sanguinaire', () => getSafe(entite, "bloodFury", 0), entite, "bloodFury");
  createUmbraBlock(detailstatsDiv2, 'Indestructibilité', () => getSafe(entite, "indestructibility", 0), entite, "indestructibility");
  createUmbraBlock(detailstatsDiv2, 'Maîtrise d\'arme', () => getSafe(entite, "weaponMastery", 0), entite, "weaponMastery");

  // MIDDLE
  createUmbraBlock(detailstatsDiv3, 'Esprit', () => getSafe(entite, "esprit", 0), entite, "esprit");
  createUmbraBlock(detailstatsDiv3, 'Intégrité', () => getSafe(entite, "integrite", 0), entite, "integrite");
  createUmbraBlock(detailstatsDiv3, 'Hâte', () => getSafe(entite, "haste", 0), entite, "haste");
  createUmbraBlock(detailstatsDiv3, 'Inflexion', () => getSafe(entite, "inflexion", 0), entite, "inflexion");
  createUmbraBlock(detailstatsDiv3, 'Astralité', () => getSafe(entite, "astrality", 0), entite, "astrality");
  createUmbraBlock(detailstatsDiv3, 'Équilibre', () => getSafe(entite, "equilibre", 0), entite, "equilibre");
  createUmbraBlock(detailstatsDiv3, 'Hypercognition', () => getSafe(entite, "hypercognition", 0), entite, "hypercognition");
  createUmbraBlock(detailstatsDiv3, 'Transcendance', () => getSafe(entite, "transcendence", 0), entite, "transcendence");
  createUmbraBlock(detailstatsDiv3, 'Mysticisme', () => getSafe(entite, "mysticism", 0), entite, "mysticism");

  // LEFT
  createUmbraBlock(detailstatsDiv4, 'Finesse', () => getSafe(entite, "finesse", 0), entite, "finesse");
  createUmbraBlock(detailstatsDiv4, 'Adresse', () => getSafe(entite, "adresse", 0), entite, "adresse");
  createUmbraBlock(detailstatsDiv4, 'Vision', () => getSafe(entite, "vision", 0), entite, "vision");
  createUmbraBlock(detailstatsDiv4, 'Puissance critique', () => getSafe(entite, "criticalPower", 0), entite, "criticalPower");
  createUmbraBlock(detailstatsDiv4, 'Ésotérisme', () => getSafe(entite, "esoterism", 0), entite, "esoterism");
  createUmbraBlock(detailstatsDiv4, 'Vivacité', () => getSafe(entite, "vivacite", 0), entite, "vivacite");
  createUmbraBlock(detailstatsDiv4, 'Ambidextrie', () => getSafe(entite, "ambidextry", 0), entite, "ambidextry");
  createUmbraBlock(detailstatsDiv4, 'Occultisme', () => getSafe(entite, "occultism", 0), entite, "occultism");
  createUmbraBlock(detailstatsDiv4, 'Mouvement', () => getSafe(entite, "movement", 0), entite, "movement");

  sectionDiv.appendChild(statTitleSection2);
  sectionDiv.appendChild(detailSubstats);

  detailSubstats.appendChild(detailstatsDiv2);
  detailSubstats.appendChild(detailstatsDiv3);
  detailSubstats.appendChild(detailstatsDiv4);

  return sectionDiv;
}

function createCodexUmbraSubstatNodes(entite) {
  const soulSection = buildSoulSection(entite);
  if (!soulSection.querySelector('.entity-stats-section.sub-stat .stat-container')) {
    const empty = document.createElement('p');
    empty.className = 'codex-umbra-empty';
    empty.textContent = "L'entité ne sait pas ce qu'est une Umbra.";
    return [empty];
  }

  const umbraStatTitleAttribut = goldTitle('Attributs', 'p');

  const umbraAttributheader = document.createElement("div");
  umbraAttributheader.className = "entity-stats-section attributs umbra-attributs";
  if (entite?.id != null) umbraAttributheader.dataset.entityId = entite.id;

  createUmbraBlock(umbraAttributheader, 'Force', () => getSafe(entite, "strength", 0), entite, "strength", false, 'attribut');
  createUmbraBlock(umbraAttributheader, 'Intelligence', () => getSafe(entite, "intelligence", 0), entite, "intelligence", false, 'attribut');
  createUmbraBlock(umbraAttributheader, 'Agilité', () => getSafe(entite, "agility", 0), entite, "agility", false, 'attribut');

  return [
    umbraStatTitleAttribut,
    umbraAttributheader,
    soulSection,
  ];
}

function readCodexUmbraSnapshotValue(statsSnapshot, statKey) {
  if (!statsSnapshot || !statKey) return 0;
  const canonical = normalizeStatKey(statKey);
  const value =
    statsSnapshot[statKey] !== undefined
      ? statsSnapshot[statKey]
      : statsSnapshot[canonical];

  if (value && typeof value === "object") {
    return Number(value.max ?? value.current ?? 0) || 0;
  }

  return Number(value ?? 0) || 0;
}

function collectCodexUmbraPanelRenderedStats(panel, entityId) {
  const renderedStats = new Set();
  if (!panel || !entityId) return renderedStats;

  const escapedEntityId = globalThis.CSS?.escape
    ? CSS.escape(String(entityId))
    : String(entityId).replace(/["\\]/g, "\\$&");

  panel
    .querySelectorAll(`.stat-container[data-entity-id="${escapedEntityId}"][data-stat]`)
    .forEach((container) => {
      const statKey = normalizeStatKey(container.dataset.stat);
      if (!statKey) return;
      renderedStats.add(statKey);
      renderedStats.add(getDisplayStatKey(statKey));
    });

  return renderedStats;
}

function applyCodexUmbraPanelDiff(panel, entite, { oldStats = null, newStats = null, renderedBefore = null } = {}) {
  if (!panel || !entite?.id || !oldStats) return;

  const currentStats = newStats || entite.stats || {};
  const escapedEntityId = globalThis.CSS?.escape
    ? CSS.escape(String(entite.id))
    : String(entite.id).replace(/["\\]/g, "\\$&");

  panel
    .querySelectorAll(`.stat-container[data-entity-id="${escapedEntityId}"][data-stat]`)
    .forEach((container) => {
      const statKey = normalizeStatKey(container.dataset.stat);
      if (!statKey) return;

      const before = readCodexUmbraSnapshotValue(oldStats, statKey);
      const after = readCodexUmbraSnapshotValue(currentStats, statKey);
      const valueEls = container.querySelectorAll(".entite-stat:not(.preview)");

      container.classList.remove("upgraded", "reducted", "new", "last");
      valueEls.forEach(el => el.classList.remove("new-stat", "stat-new"));

      if (after > before) {
        container.classList.add("upgraded");

        if (!renderedBefore?.has(statKey)) {
          container.classList.add("new");
          valueEls.forEach(el => el.classList.add("new-stat"));
        }
      } else if (after < before) {
        container.classList.add("reducted");
      }
    });
}

function renderCodexUmbraSubstatPanel(panel, entite, options = {}) {
  if (!panel || !entite?.id) return;
  const renderedBefore = collectCodexUmbraPanelRenderedStats(panel, entite.id);
  panel.dataset.entityId = entite.id;
  bindHelperEntity(panel, entite);
  panel.replaceChildren(...createCodexUmbraSubstatNodes(entite));
  applyCodexUmbraPanelDiff(panel, entite, { ...options, renderedBefore });
}

function codexUmbraPanelBelongsToEntity(panel, entityId) {
  if (!panel || !entityId) return false;
  if (String(panel.dataset.entityId || "") === String(entityId)) return true;

  return Array.from(panel.querySelectorAll("[data-entity-id]"))
    .some(node => String(node.dataset.entityId) === String(entityId));
}

function refreshCodexUmbraPanel(entite, options = {}) {
  if (!entite?.id || typeof document === "undefined") return false;
  document.querySelectorAll('.codex-colomn-5[data-entity-id]').forEach(column => {
    if (column.dataset.entityId === String(entite.id)) column._refreshLives?.(entite);
  });

  // Equipment and level changes already converge here through syncDOMWithStats.
  const rates = [...document.querySelectorAll('.attack-rate-preview, .entity-rate-summary')]
    .filter(row => row.dataset.entityId === String(entite.id));
  rates.forEach(row => row._refreshRate?.(entite));
  refreshDisplayedPowers(entite);
  const descriptions = [...document.querySelectorAll('.attack-description-wrapper')]
    .filter(row => row.dataset.entityId === String(entite.id));
  descriptions.forEach(row => row._refreshDescription?.(entite));
  const panels = Array.from(
    document.querySelectorAll(".codex-substat-container.codex-substat-panel--umbra")
  ).filter(panel => codexUmbraPanelBelongsToEntity(panel, entite.id));

  if (!panels.length) return rates.length > 0 || descriptions.length > 0;

  panels.forEach(panel => renderCodexUmbraSubstatPanel(panel, entite, options));
  return true;
}

function buildSoulSubStatBlock(entite) {
  // ✅ copie du bloc Soul : .entity-stats-section.sub-stat (sans modifier Soul)
  const detailSubstats = document.createElement("div");
  detailSubstats.className = "entity-stats-section sub-stat";

  const detailstatsDiv2 = document.createElement("div");
  detailstatsDiv2.className = "entity-stats-section right";

  const detailstatsDiv3 = document.createElement("div");
  detailstatsDiv3.className = "entity-stats-section middle";

  const detailstatsDiv4 = document.createElement("div");
  detailstatsDiv4.className = "entity-stats-section left";

  // --- RIGHT (copie Soul) ---
  createUmbraBlock(detailstatsDiv2, "Vigueur", () => getSafe(entite, "vigueur", 0), entite, "vigueur");
  createUmbraBlock(detailstatsDiv2, "Constitution", () => getSafe(entite, "constitution", 0), entite, "constitution");
  createUmbraBlock(detailstatsDiv2, "Vitalité", () => getSafe(entite, "vitality", 0), entite, "vitality");

  createUmbraBlock(detailstatsDiv2, "Brutalité", () => getSafe(entite, "brutality", 0), entite, "brutality");
  createUmbraBlock(detailstatsDiv2, "Robustesse", () => getSafe(entite, "robustness", 0), entite, "robustness");
  createUmbraBlock(detailstatsDiv2, "Résilience", () => getSafe(entite, "resilience", 0), entite, "resilience");

  createUmbraBlock(detailstatsDiv2, "Fureur Sanguinaire", () => getSafe(entite, "bloodFury", 0), entite, "bloodFury");
  createUmbraBlock(detailstatsDiv2, "Indestructibilité", () => getSafe(entite, "indestructibility", 0), entite, "indestructibility");
  createUmbraBlock(detailstatsDiv2, "Maîtrise d\'arme", () => getSafe(entite, "weaponMastery", 0), entite, "weaponMastery");

  // --- MIDDLE (copie Soul) ---
  createUmbraBlock(detailstatsDiv3, "Esprit", () => getSafe(entite, "esprit", 0), entite, "esprit");
  createUmbraBlock(detailstatsDiv3, "Intégrité", () => getSafe(entite, "integrite", 0), entite, "integrite");
  createUmbraBlock(detailstatsDiv3, "Hâte", () => getSafe(entite, "haste", 0), entite, "haste");

  createUmbraBlock(detailstatsDiv3, "Inflexion", () => getSafe(entite, "inflexion", 0), entite, "inflexion");
  createUmbraBlock(detailstatsDiv3, "Astralité", () => getSafe(entite, "astrality", 0), entite, "astrality");
  createUmbraBlock(detailstatsDiv3, "Équilibre", () => getSafe(entite, "equilibre", 0), entite, "equilibre");

  createUmbraBlock(detailstatsDiv3, "Hypercognition", () => getSafe(entite, "hypercognition", 0), entite, "hypercognition");
  createUmbraBlock(detailstatsDiv3, "Transcendance", () => getSafe(entite, "transcendence", 0), entite, "transcendence");
  createUmbraBlock(detailstatsDiv3, "Mysticisme", () => getSafe(entite, "mysticism", 0), entite, "mysticism");

  // --- LEFT (copie Soul) ---
  createUmbraBlock(detailstatsDiv4, "Finesse", () => getSafe(entite, "finesse", 0), entite, "finesse");
  createUmbraBlock(detailstatsDiv4, "Adresse", () => getSafe(entite, "adresse", 0), entite, "adresse");
  createUmbraBlock(detailstatsDiv4, "Vision", () => getSafe(entite, "vision", 0), entite, "vision");

  createUmbraBlock(detailstatsDiv4, "Puissance critique", () => getSafe(entite, "criticalPower", 0), entite, "criticalPower");
  createUmbraBlock(detailstatsDiv4, "Ésotérisme", () => getSafe(entite, "esoterism", 0), entite, "esoterism");
  createUmbraBlock(detailstatsDiv4, "Vivacité", () => getSafe(entite, "vivacite", 0), entite, "vivacite");

  createUmbraBlock(detailstatsDiv4, "Ambidextrie", () => getSafe(entite, "ambidextry", 0), entite, "ambidextry");
  createUmbraBlock(detailstatsDiv4, "Occultisme", () => getSafe(entite, "occultism", 0), entite, "occultism");
  createUmbraBlock(detailstatsDiv4, "Mouvement", () => getSafe(entite, "movement", 0), entite, "movement");

  detailSubstats.appendChild(detailstatsDiv2);
  detailSubstats.appendChild(detailstatsDiv3);
  detailSubstats.appendChild(detailstatsDiv4);

  return detailSubstats;
}

function createSoulSubmenu(codexColumn1, entite) {
  const col6 = document.createElement("div");
  col6.className = "codex-colomn-6";
  codexColumn1.appendChild(col6);
  const previewRows = document.createElement('div');
  previewRows.className = 'umbra-submenu new entity-stats-section soul-stats-panels';
  bindHelperEntity(previewRows, entite);
  col6.appendChild(previewRows);

  const UmbraDiv1 = document.createElement("div");
  UmbraDiv1.className = "umbra-submenu entity-stats-section soul-umbras";
  bindHelperEntity(UmbraDiv1, entite);
  previewRows.appendChild(UmbraDiv1);

  UmbraDiv1.appendChild(createEntityStatsTitleNode("Umbras"));

// afficher masquer les filtres

const UmbraFiltreCont = document.createElement("div");
  UmbraFiltreCont.className = "umbra-filtre-container";
  UmbraDiv1.appendChild(UmbraFiltreCont);

 const UmbraFiltrePic = document.createElement("div");
  UmbraFiltrePic.className = "umbra-filtre-pic";
  UmbraFiltreCont.appendChild(UmbraFiltrePic);

	const UmbraFiltreTitle = document.createElement("div");
  UmbraFiltreTitle.className = "umbra-filtre-title";
  UmbraFiltreTitle.textContent = "Filtrer les Umbras :";
	UmbraFiltreCont.appendChild(UmbraFiltreTitle);

const UmbraFiltre = document.createElement("div");
UmbraFiltre.className = "umbra-filtres-container";
UmbraFiltre.style.display = "none"; // <- important
UmbraDiv1.appendChild(UmbraFiltre);

  // ✅ Barre de filtres (avec bouton Réinitialiser)
  const filterBar = createUmbraFilterBar(UmbraDiv1);
  UmbraFiltre.appendChild(filterBar);
 // toggle afficher / masquer
  UmbraFiltreTitle.addEventListener("click", () => {

    const isVisible = UmbraFiltre.style.display === "block";

    UmbraFiltre.style.display = isVisible
      ? "none"
      : "block";

    UmbraFiltreTitle.classList.toggle("active", !isVisible);
  });

  const umbra = true;
  const inheritedStats = document.createElement('div');
  inheritedStats.className = 'entity-stats-section soul-inherited-stats';
  inheritedStats.appendChild(createEntityStatsTitleNode('Stats héritées'));
  const inheritedList = document.createElement('div');
  inheritedList.className = 'soul-inherited-stats-list';
  inheritedStats.appendChild(inheritedList);
  previewRows.appendChild(inheritedStats);
  // Force
  createUmbraBlockTagged(UmbraDiv1, 'Vigueur', () => getSafe(entite, "vigueur", 0), entite, "vigueur", umbra);
  createUmbraBlockTagged(UmbraDiv1, 'Constitution', () => getSafe(entite, "constitution", 0), entite, "constitution", umbra);
  createUmbraBlockTagged(UmbraDiv1, 'Vitalité', () => getSafe(entite, "vitality", 0), entite, "vitality", umbra);
  createUmbraBlockTagged(UmbraDiv1, 'Brutalité', () => getSafe(entite, "brutality", 0), entite, "brutality", umbra);
  createUmbraBlockTagged(UmbraDiv1, 'Robustesse', () => getSafe(entite, "robustness", 0), entite, "robustness", umbra);
  createUmbraBlockTagged(UmbraDiv1, 'Résilience', () => getSafe(entite, "resilience", 0), entite, "resilience", umbra);
  createUmbraBlockTagged(UmbraDiv1, 'Fureur Sanguinaire', () => getSafe(entite, "bloodFury", 0), entite, "bloodFury", umbra);
  createUmbraBlockTagged(UmbraDiv1, 'Indestructibilité', () => getSafe(entite, "indestructibility", 0), entite, "indestructibility", umbra);
  createUmbraBlockTagged(UmbraDiv1, 'Maîtrise d\'arme', () => getSafe(entite, "weaponMastery", 0), entite, "weaponMastery", umbra);

  // Intel
  createUmbraBlockTagged(UmbraDiv1, 'Esprit', () => getSafe(entite, "esprit", 0), entite, "esprit", umbra);
  createUmbraBlockTagged(UmbraDiv1, 'Intégrité', () => getSafe(entite, "integrite", 0), entite, "integrite", umbra);
  createUmbraBlockTagged(UmbraDiv1, 'Hâte', () => getSafe(entite, "haste", 0), entite, "haste", umbra);
  createUmbraBlockTagged(UmbraDiv1, 'Inflexion', () => getSafe(entite, "inflexion", 0), entite, "inflexion", umbra);
  createUmbraBlockTagged(UmbraDiv1, 'Astralité', () => getSafe(entite, "astrality", 0), entite, "astrality", umbra);
  createUmbraBlockTagged(UmbraDiv1, 'Équilibre', () => getSafe(entite, "equilibre", 0), entite, "equilibre", umbra);
  createUmbraBlockTagged(UmbraDiv1, 'Hypercognition', () => getSafe(entite, "hypercognition", 0), entite, "hypercognition", umbra);
  createUmbraBlockTagged(UmbraDiv1, 'Transcendance', () => getSafe(entite, "transcendence", 0), entite, "transcendence", umbra);
  createUmbraBlockTagged(UmbraDiv1, 'Mysticisme', () => getSafe(entite, "mysticism", 0), entite, "mysticism", umbra);

  // Agi
  createUmbraBlockTagged(UmbraDiv1, 'Finesse', () => getSafe(entite, "finesse", 0), entite, "finesse", umbra);
  createUmbraBlockTagged(UmbraDiv1, 'Adresse', () => getSafe(entite, "adresse", 0), entite, "adresse", umbra);
  createUmbraBlockTagged(UmbraDiv1, 'Vision', () => getSafe(entite, "vision", 0), entite, "vision", umbra);
  createUmbraBlockTagged(UmbraDiv1, 'Puissance critique', () => getSafe(entite, "criticalPower", 0), entite, "criticalPower", umbra);
  createUmbraBlockTagged(UmbraDiv1, 'Ésotérisme', () => getSafe(entite, "esoterism", 0), entite, "esoterism", umbra);
  createUmbraBlockTagged(UmbraDiv1, 'Vivacité', () => getSafe(entite, "vivacite", 0), entite, "vivacite", umbra);
  createUmbraBlockTagged(UmbraDiv1, 'Ambidextrie', () => getSafe(entite, "ambidextry", 0), entite, "ambidextry", umbra);
  createUmbraBlockTagged(UmbraDiv1, 'Occultisme', () => getSafe(entite, "occultism", 0), entite, "occultism", umbra);
  createUmbraBlockTagged(UmbraDiv1, 'Mouvement', () => getSafe(entite, "movement", 0), entite, "movement", umbra);

  // ✅ Important : initialise l’état (cache les checkboxes inexistantes + affiche tout)
  syncUmbraFilters(UmbraDiv1, filterBar);

  return col6;
}

function getAllUmbraItems(scope) {
  return [...scope.querySelectorAll('.stat-container[data-umbra="1"]')];
}

function getGroupInputs(bar, groupName) {
  return [...bar.querySelectorAll(`input[type="checkbox"][data-group="${groupName}"]`)];
}

function getCheckedSet(bar, groupName) {
  const inputs = bar.querySelectorAll(`input[type="checkbox"][data-group="${groupName}"]:checked`);
  return new Set([...inputs].map(i => i.value));
}

function setCheckboxVisible(input, visible) {
  const label = input.closest("label");
  if (!label) return;
  label.style.display = visible ? "" : "none";
}

function setCheckboxEnabled(input, enabled) {
  input.disabled = !enabled;
  const label = input.closest("label");
  if (!label) return;
  label.style.opacity = enabled ? "" : "0.5";
}

function itemMatches(item, { attrs, lvls, cats }) {
  const okAttr = attrs.size ? attrs.has(item.dataset.attribut) : true;
  const okLvl  = lvls.size  ? lvls.has(item.dataset.level)    : true;
  const okCat  = cats.size  ? cats.has(item.dataset.category) : true;
  return okAttr && okLvl && okCat;
}

function applyUmbraFilters(scope, bar) {
  const attrs = getCheckedSet(bar, "attr");
  const lvls  = getCheckedSet(bar, "lvl");
  const cats  = getCheckedSet(bar, "cat");

  const items = getAllUmbraItems(scope);

  items.forEach(item => {
    const show = itemMatches(item, { attrs, lvls, cats });
    if (show) item.style.removeProperty("display");
    else item.style.display = "none";
  });
}

function updateUmbraFacetAvailability(scope, bar) {
  const items = getAllUmbraItems(scope);

  const current = {
    attrs: getCheckedSet(bar, "attr"),
    lvls:  getCheckedSet(bar, "lvl"),
    cats:  getCheckedSet(bar, "cat"),
  };

  // Pour chaque groupe, on calcule le "univers possible" si on ignore ce groupe,
  // puis on en déduit quelles valeurs existent.
  const facetDefs = [
    { group: "attr", datasetKey: "attribut", otherSets: () => ({
      attrs: new Set(), // ignore attr group
      lvls: current.lvls,
      cats: current.cats,
    })},
    { group: "lvl", datasetKey: "level", otherSets: () => ({
      attrs: current.attrs,
      lvls: new Set(),  // ignore lvl group
      cats: current.cats,
    })},
    { group: "cat", datasetKey: "category", otherSets: () => ({
      attrs: current.attrs,
      lvls: current.lvls,
      cats: new Set(),  // ignore cat group
    })},
  ];

  facetDefs.forEach(def => {
    const baseFilter = def.otherSets();

    // items "possibles" selon les autres groupes (sans restriction de ce groupe)
    const possibleItems = items.filter(it => itemMatches(it, baseFilter));

    // Quelles valeurs du groupe existent dans possibleItems ?
    const possibleValues = new Set(
      possibleItems.map(it => it.dataset[def.datasetKey]).filter(Boolean)
    );

    // Applique mask display none sur les checkboxes dont la valeur est impossible
    const inputs = getGroupInputs(bar, def.group);

    inputs.forEach(input => {
      const exists = possibleValues.has(input.value);

      // Si inexistante => on cache le checkbox (display none)
      setCheckboxVisible(input, exists);

      // Si la checkbox est cochée mais devenue inexistante, on la décoche (sinon état bloqué)
      if (!exists && input.checked) input.checked = false;
    });
  });
}

function syncUmbraFilters(scope, bar) {
  // 1) met à jour facettes d’abord (peut décocher des trucs)
  updateUmbraFacetAvailability(scope, bar);
  // 2) applique le filtre avec l’état final
  applyUmbraFilters(scope, bar);
}

function createUmbraFilterBar(scope) {
  const bar = document.createElement("div");
  bar.className = "umbra-filters";

  const makeGroup = (titleText, items) => {
    const group = document.createElement("div");
    group.className = "umbra-filter-group";

    const title = document.createElement("div");
    title.className = "umbra-filter-title";
    title.textContent = titleText;
    group.appendChild(title);

    items.forEach(({ groupName, value, label, iconClass }) => {
      const wrap = document.createElement("label");
      wrap.className = "umbra-filter-item";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = value;
      input.dataset.group = groupName;

      const icon = document.createElement("i");
      icon.className = `umbra-filter-picto ${iconClass}`;

      const txt = document.createElement("span");
      txt.textContent = label;

      wrap.append(input, icon, txt);
      group.appendChild(wrap);
    });

    return group;
  };

  bar.appendChild(makeGroup("Attribut", [
    { groupName: "attr", value: "force", label: "Force", iconClass: "strength" },
    { groupName: "attr", value: "intelligence", label: "Intel", iconClass: "intelligence" },
    { groupName: "attr", value: "agilite", label: "Agilité", iconClass: "agility" },
  ]));

  bar.appendChild(makeGroup("Niveau", [
    { groupName: "lvl", value: "1", label: "Lvl 1", iconClass: "level" },
    { groupName: "lvl", value: "2", label: "Lvl 2", iconClass: "level" },
    { groupName: "lvl", value: "3", label: "Lvl 3", iconClass: "level" },
  ]));

  bar.appendChild(makeGroup("Type", [
    { groupName: "cat", value: "attaque", label: "Attaque", iconClass: "attack" },
    { groupName: "cat", value: "defense", label: "Défense", iconClass: "defence" },
    { groupName: "cat", value: "utilitaire", label: "Utilitaire", iconClass: "utilitaire" },
  ]));

  const resetWrap = document.createElement("div");
  resetWrap.className = "umbra-filter-reset";
  resetWrap.style.display = "none";

  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "umbra-reset-btn";
  resetBtn.textContent = "Réinitialiser";

  const updateResetVisibility = () => {
    const hasActiveFilter = [...bar.querySelectorAll('input[type="checkbox"]')]
      .some(input => input.checked === true);

    resetWrap.style.display = hasActiveFilter ? "flex" : "none";
  };

  resetBtn.addEventListener("click", () => {
    bar.querySelectorAll('input[type="checkbox"]').forEach(input => {
      input.checked = false;
    });

    syncUmbraFilters(scope, bar);
    updateResetVisibility();
  });

  resetWrap.appendChild(resetBtn);
  bar.appendChild(resetWrap);

  bar.addEventListener("change", () => {
    syncUmbraFilters(scope, bar);
    updateResetVisibility();
  });

  updateResetVisibility();

  return bar;
}

function createStatsSubmenu(codexColumn1, entite, { onOpenAttack = null } = {}) {
  let col5 = codexColumn1.querySelector('.codex-colomn-5');
  if (!col5) {
    col5 = document.createElement('div');
    col5.className = 'codex-colomn-5';
    codexColumn1.appendChild(col5);
  }
  col5.dataset.entityId = entite.id;

  // ✅ helpers life checks (number | object | array)
  const hasAtLeastOne = (v) => {
    if (v == null) return false;
    if (Array.isArray(v)) return v.length >= 1;
    if (typeof v === 'number') return Number.isFinite(v) && v >= 1;
    if (typeof v === 'object') {
      const n = Number(v.max ?? v.value ?? v.current ?? v.count ?? 0);
      return Number.isFinite(n) && n >= 1;
    }
    return false;
  };

  // ✅ helpers "has any attacks"
  const hasAny = (v) => {
    if (v == null) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'object') return Object.keys(v).length > 0;
    return false;
  };

  // ✅ condition extraLife OR fadedLife OR eternalLife
  const showExtraLifeMenu =
    hasAtLeastOne(entite?.stats?.extraLife) ||
    hasAtLeastOne(entite?.stats?.fadedLife) ||
    hasAtLeastOne(entite?.stats?.eternalLife);

  // ✅ condition attack submenu
  const showAttackMenu =
    hasAny(entite?.attacks) ||
    hasAny(entite?.attackDetails);

  const showEquipmentMenu = getCodexStableEquipmentCharge(entite) > 0;

  // --- helpers submenu items ---
  function makePictoItem(pictoClass) {
    const item = document.createElement('div');
    item.className = 'profil-inner-menu';

    const picto = document.createElement('div');
    picto.className = `codex-picto-menu-entity ${pictoClass}`;

    item.appendChild(picto);
    return item;
  }
  // 2) sous-menu
  let submenu = col5.querySelector('.codex-profil-submenu');

  // Création (1 seule fois)
  if (!submenu) {
    submenu = document.createElement('div');
    submenu.className = 'codex-profil-submenu';

    const pictos = ['picto-entity'];
    if (showEquipmentMenu) pictos.push('picto-equipment');
    if (showAttackMenu) pictos.push('picto-attack');          // ✅ NEW
    pictos.push('picto-graph');
    if (showExtraLifeMenu) pictos.push('picto-extralife');

    pictos.forEach(pictoClass => submenu.appendChild(makePictoItem(pictoClass)));
    col5.appendChild(submenu);
  } else {
    // ✅ Sync si le submenu existe déjà (add/remove du picto attack)
    const existingAttack = submenu.querySelector('.codex-picto-menu-entity.picto-attack');
    if (showAttackMenu && !existingAttack) {
      // insert avant graph si possible, sinon append
      const graph = submenu.querySelector('.codex-picto-menu-entity.picto-graph');
      const node = makePictoItem('picto-attack');
      if (graph?.closest('.profil-inner-menu')) {
        submenu.insertBefore(node, graph.closest('.profil-inner-menu'));
      } else {
        submenu.appendChild(node);
      }
    }
    if (!showAttackMenu && existingAttack) {
      existingAttack.closest('.profil-inner-menu')?.remove();
    }

    const existingEquipment = submenu.querySelector('.codex-picto-menu-entity.picto-equipment');
    if (showEquipmentMenu && !existingEquipment) {
      const attack = submenu.querySelector('.codex-picto-menu-entity.picto-attack');
      const graph = submenu.querySelector('.codex-picto-menu-entity.picto-graph');
      const node = makePictoItem('picto-equipment');
      const anchor = attack?.closest('.profil-inner-menu') || graph?.closest('.profil-inner-menu');
      if (anchor) {
        submenu.insertBefore(node, anchor);
      } else {
        submenu.appendChild(node);
      }
    }
    if (!showEquipmentMenu && existingEquipment) {
      existingEquipment.closest('.profil-inner-menu')?.remove();
    }

    // ✅ Sync si le submenu existe déjà (add/remove du picto extraLife)
    const existing = submenu.querySelector('.codex-picto-menu-entity.picto-extralife');
    if (showExtraLifeMenu && !existing) {
      submenu.appendChild(makePictoItem('picto-extralife'));
    }
    if (!showExtraLifeMenu && existing) {
      existing.closest('.profil-inner-menu')?.remove();
    }
  }

  // 3) profil-title
  let titleDiv = col5.querySelector('.codex-profil-title');
  if (!titleDiv) {
    titleDiv = document.createElement('div');
    titleDiv.className = 'codex-profil-title';
    col5.insertBefore(titleDiv, submenu);
  }

  function updateProfilTitle() {
    const nickname = entite.nickname ? entite.nickname : null;
    const name = entite.name;
    const labelName = nickname ? `${nickname}, ${name}` : name;

    if (col5.querySelector('.codex-picto-menu-entity.picto-entity.active')) {
      titleDiv.textContent = `Profil - ${labelName}`;
    } else if (col5.querySelector('.codex-picto-menu-entity.picto-equipment.active')) {
      titleDiv.textContent = `Équipement - ${labelName}`;
    } else if (col5.querySelector('.codex-picto-menu-entity.picto-attack.active')) { // ✅ NEW
      titleDiv.textContent = `Attaques - ${labelName}`;
    } else if (col5.querySelector('.codex-picto-menu-entity.picto-graph.active')) {
      titleDiv.textContent = `Graphiques - ${labelName}`;
    } else if (col5.querySelector('.codex-picto-menu-entity.picto-archetype-list.active')) {
      titleDiv.textContent = `Archétypes - ${labelName}`;
    } else if (col5.querySelector('.codex-picto-menu-entity.picto-extralife.active')) {
      titleDiv.textContent = `Résurrections - ${labelName}`;
    } else {
      titleDiv.textContent = '';
    }
  }

  // --- helpers ---
  const qAll = (sel, root = submenu) => Array.from(root.querySelectorAll(sel));

  function clearCol5Views() {
    closeAttackEssenceSocketPopups();
    Array.from(col5.children).forEach(child => {
      if (child !== submenu && child !== titleDiv) child.remove();
    });
  }

  function handlePicto(pictoEl) {
    qAll('.codex-picto-menu-entity.active').forEach(n => n.classList.remove('active'));
    pictoEl.classList.add('active');

    const allPictos = Array.from(submenu.querySelectorAll('.codex-picto-menu-entity'));
    const idx1 = allPictos.indexOf(pictoEl) + 1;
    setCodexSubmenuIndex(idx1);

    removeDirectEntityView(codexColumn1);
    clearCol5Views();
// ==============================
// SUBMENU : Profil
// ==============================
if (pictoEl.classList.contains('picto-entity')) {
  const node = createProfilSubmenu(entite);
  if (node) col5.appendChild(node);

  // ==============================
  // SUBMENU : Équipement
  // ==============================
} else if (pictoEl.classList.contains('picto-equipment')) {
  if (!showEquipmentMenu) {
    const profilePicto = submenu.querySelector('.codex-picto-menu-entity.picto-entity');
    if (profilePicto) handlePicto(profilePicto);
    return;
  }
  const node = createEquipmentSubmenu(entite);
  if (node) col5.appendChild(node);

  // ==============================
  // SUBMENU : Attaques
  // ==============================
} else if (pictoEl.classList.contains('picto-attack')) {
  const node = createAttackReadOnlyOverview(entite, { variant: 'stats', onOpenAttack });
  if (node) {
    col5.appendChild(node);
  }

  // ==============================
  // SUBMENU : Graphiques
  // ==============================
} else if (pictoEl.classList.contains('picto-graph')) {
  const graphNode = createStatGraphView(entite, stats);
  if (graphNode) {
    col5.appendChild(graphNode);
    if (typeof graphNode._initGraph === 'function') graphNode._initGraph();
  }

  // ==============================
  // SUBMENU : Résurrections / Extra life
  // ==============================
} else if (pictoEl.classList.contains('picto-extralife')) {
  const node = createExtraLifeView(entite);
  if (node) col5.appendChild(node);
}

// Mise à jour du titre (col5)
updateProfilTitle();
  }

  // délégation: un seul listener
  submenu.onclick = (e) => {
    const picto = e.target.closest('.codex-picto-menu-entity');
    if (!picto || !submenu.contains(picto)) return;
    handlePicto(picto);
  };

  col5._refreshLives = current => {
    entite = current;
    const visible = ['extraLife', 'fadedLife', 'eternalLife'].some(key => hasAtLeastOne(entite.stats?.[key]));
    const existing = submenu.querySelector('.picto-extralife');
    const active = existing?.classList.contains('active');
    if (visible && !existing) submenu.appendChild(makePictoItem('picto-extralife'));
    if (!visible && existing) existing.closest('.profil-inner-menu').remove();
    if (active) handlePicto(visible ? existing : submenu.querySelector('.picto-entity'));
  };

  // état par défaut
  qAll('.codex-picto-menu-entity.active').forEach(n => n.classList.remove('active'));
  clearCol5Views();

  const allPictos = Array.from(submenu.querySelectorAll('.codex-picto-menu-entity'));
  const wantedSubIdx1 = getCodexSubmenuIndex();
  const safeSubIdx0 = !showEquipmentMenu && wantedSubIdx1 === 2
    ? 0
    : Math.min(Math.max(wantedSubIdx1 - 1, 0), Math.max(0, allPictos.length - 1));
  const defaultPicto = allPictos[safeSubIdx0] || allPictos[0];
  if (defaultPicto) handlePicto(defaultPicto);
}

function normalizeAttacks(entity) {
  // Priorité à attackDetails si c’est ta source “riche”
  if (Array.isArray(entity?.attackDetails) && entity.attackDetails.length) return entity.attackDetails;

  if (entity?.attackDetails && typeof entity.attackDetails === 'object') {
    const vals = Object.values(entity.attackDetails).filter(Boolean);
    if (vals.length) return vals;
  }

  if (Array.isArray(entity?.attacks) && entity.attacks.length) return entity.attacks;

  return [];
}

function getFadedLifeCount(entite) {
  const raw = entite?.stats?.fadedLife ?? entite?.fadedLife;
  // tolère legacy objet {current}
  if (raw && typeof raw === "object") return toNonNegInt(raw.current);
  return toNonNegInt(raw);
}

function desyncVars(el, baseDuration, durationJitter = 0, maxDelay = null) {
  const dur = baseDuration + (Math.random() * 2 - 1) * durationJitter;
  const delayRange = (maxDelay ?? dur);
  const phase = Math.random() * delayRange;

  el.style.setProperty("--desync-duration", `${dur.toFixed(3)}s`);
  el.style.setProperty("--desync-delay", `${(-phase).toFixed(3)}s`);
}

function createSoulGraphPanel(entite, progressionForm) {
  const wrapper = document.createElement('div');
  wrapper.classList.add('sub-menu-stat', 'soul-stat', 'soul-stat-graph-panel');

  const header = document.createElement('div');
  header.className = 'sub-menu-stat__header';
  header.appendChild(createEntityStatsTitleNode("Soul"));
  wrapper.appendChild(header);

  const body = document.createElement('div');
  body.className = 'sub-menu-stat__body soul-graph-body';
  wrapper.appendChild(body);

  if (progressionForm?.querySelector('.attribut-graph-container')) {
    body.appendChild(progressionForm);
  } else {
    const empty = document.createElement('p');
    empty.className = 'soul-empty';
    empty.textContent = "Graph Soul introuvable.";
    body.appendChild(empty);
  }

  body.appendChild(createSoulAttributDistribution(entite));

  return wrapper;
}

function createSoulAttributDistribution(entite) {
  const strength = Number(getSafe(entite, "strength", 0)) || 0;
  const agility = Number(getSafe(entite, "agility", 0)) || 0;
  const intelligence = Number(getSafe(entite, "intelligence", 0)) || 0;

  const total = strength + agility + intelligence;

  const percent = (value) => {
    if (total <= 0) return 0;
    return Math.round((value / total) * 100);
  };

  const activeArchetype = entite?.Archetype?.current || null;
  const archetypeName = activeArchetype
    ? getArchetypeDisplayName(activeArchetype)
    : "ÉGARÉ";

  const wrapper = document.createElement('div');
  wrapper.className = 'soul-attribut-distribution';

  const title = document.createElement('p');
  title.className = 'gold-title';
  title.textContent = activeArchetype
  ? `Soul de ${archetypeName}`
  : "Soul égarée";
  wrapper.appendChild(title);

  // const subtitle = document.createElement('p');
  // subtitle.className = 'soul-attribut-distribution-subtitle';
  // subtitle.textContent = "Répartition des attributs de l’âme";
  // wrapper.appendChild(subtitle);

  const list = document.createElement('div');
  list.className = 'soul-attribut-distribution-list';
  wrapper.appendChild(list);

  const addLine = ({ key, label, value }) => {
    const pct = percent(value);

    const row = document.createElement('div');
    row.className = `soul-attribut-row soul-attribut-row--${key}`;

    const top = document.createElement('div');
    top.className = 'soul-attribut-row-top';

    const name = document.createElement('span');
    name.className = 'soul-attribut-name';
    name.textContent = label;

    const amount = document.createElement('span');
    amount.className = 'soul-attribut-percent';
    amount.textContent = ` ${pct} %`;

    top.append(name, amount);

    const bar = document.createElement('div');
    bar.className = 'soul-attribut-bar';

    const fill = document.createElement('div');
    fill.className = 'soul-attribut-bar-fill';
    fill.style.width = ` ${pct} %`;

    bar.appendChild(fill);
    row.append(top, bar);
    list.appendChild(row);
  };

  addLine({ key: 'strength', label: 'Force :', value: strength });
  addLine({ key: 'agility', label: 'Agilité :', value: agility });
  addLine({ key: 'intelligence', label: 'Intelligence :', value: intelligence });

  return wrapper;
}

function createFadedLivesNode(entite) {
  const count = getFadedLifeCount(entite);
  if (count <= 0) return null;

  const wrap = document.createElement("div");
  wrap.className = "faded-lives";

  for (let i = 0; i < count; i++) {
    const life = document.createElement("div");
    life.className = "faded-life";

    // active l’animation (le CSS .faded-life.animate gère animation-name)
    life.classList.add("animate");

    // très rapide : durée fixe 0.468s + delay aléatoire large (type -1.315s)
    desyncAnimate(life, 0.468, 0.0, 2.0);

    wrap.appendChild(life);
  }

  return wrap;
}

function hasEternalLife(entite) {
  const raw = entite?.stats?.eternalLife ?? entite?.eternalLife;
  if (raw == null) return false;

  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw >= 1;
  }

  if (typeof raw === "object") {
    // Possédée si un "max/value/count" >= 1, OU si la clé current existe (même à 0)
    const maxish = toNonNegInt(raw.max ?? raw.value ?? raw.count ?? 0);
    if (maxish >= 1) return true;
    if (Object.prototype.hasOwnProperty.call(raw, "current")) return true;
  }

  return false;
}

function getEternalLifeCount(entite) {
  const raw = entite?.stats?.eternalLife ?? entite?.eternalLife;
  // tolère legacy objet {current}
  if (raw && typeof raw === "object") return toNonNegInt(raw.current);
  return toNonNegInt(raw);
}

function createResuBilanItem({ pictoClass, text }) {
  const item = document.createElement("div");
  item.className = "resu-bilan-item";
  item.innerHTML = `
    <div class="picto-stat ${pictoClass}"></div>
    <div class="resu-bilan-text">${text}</div>
  `;
  return item;
}

function createResuBilanBlock({ eternalCur, extraCur, extraMax, fadedCount }) {
  const block = document.createElement("div");
  block.className = "resu-bilan";

  const applyBilanAnim = (item, pictoClass) => {
    const picto = item.querySelector(`.${pictoClass}`);
    if (!picto) return;

    // FadedLife : très rapide
    if (pictoClass === "fadedLife") {
      picto.classList.add("animate", "desync-animate", "float-drift");
      picto.style.setProperty("--desync-duration", "0.468s");
      picto.style.setProperty("--desync-delay", `${-(Math.random() * 2.0).toFixed(3)}s`);
      return;
    }

    // ExtraLife : lévitation (désync standard)
    if (pictoClass === "extraLife") {
      picto.classList.add("animate", "desync-animate", "float-levitate");
      desyncAnimate(picto, 4.2, 0.5);
      return;
    }
  };

  // FadedLife : si > 0 (EN PREMIER)
  if (toNonNegInt(fadedCount) > 0) {
    const item = createResuBilanItem({
      pictoClass: "fadedLife",
      text: `x ${toNonNegInt(fadedCount)}`
    });
    applyBilanAnim(item, "fadedLife");
    block.appendChild(item);
  }

  // ExtraLife : seulement si utilisable (>0) (ENSUITE)
  if (toNonNegInt(extraCur) > 0) {
    const item = createResuBilanItem({
      pictoClass: "extraLife",
      text: `x ${toNonNegInt(extraCur)}`
    });
    applyBilanAnim(item, "extraLife");
    block.appendChild(item);
  }

  // EternalLife : seulement si > 0 (EN DERNIER)
  if (toNonNegInt(eternalCur) > 0) {
    block.appendChild(
      createResuBilanItem({
        pictoClass: "eternalLife animate",
        text: `x ${toNonNegInt(eternalCur)}`
      })
    );
  }

  return block;
}

function createRegenStatutNode(entite) {
  const div = document.createElement("div");
  div.className = "regen-statut";

  const alive = isEntiteAlive(entite);
  div.textContent = alive ? "Restauration active" : "Restauration inactive - L'entité est morte.";

  // (optionnel mais pratique pour le CSS)
  div.classList.add(alive ? "is-alive" : "is-dead");

  return div;
}

function createEternalLifeBlock(entite) {
  return createExtraLifeBlock(entite, 'eternalLife');
}

function createExtraLifeBlock(entite, stat = 'extraLife') {
  const block = document.createElement('div');
  block.className = `resu-block resu-block--${stat === 'extraLife' ? 'extra' : 'eternal'}`;
  const pool = entite.stats[stat];
  const title = createBlockTitle(`${stat === 'extraLife' ? 'Vies Supplémentaires' : 'Vies Éternelles'} : ${pool.current}/${pool.max}`, stat);
  const icon = document.createElement('span');
  icon.className = `picto-stat ${stat}`;
  title.prepend(icon);
  block.appendChild(title);
  withBlockSubtitle(block, 'Recharge en parallèle');
  const slots = getLifeSlots(entite, stat).map(entry => ({ ...entry,
    isFull: entry.slot.currentRegen >= entry.slot.maxRegen }));
  const available = slots.filter(entry => entry.isFull);
  const recharging = slots.filter(entry => !entry.isFull).sort((a, b) =>
    (a.slot.maxRegen - a.slot.currentRegen) - (b.slot.maxRegen - b.slot.currentRegen));
  const precedingLife = Number(entite.stats.fadedLife) > 0 || (stat === 'eternalLife' && entite.stats.extraLife?.current > 0);
  for (const [entries, ready] of [[available, true], [recharging, false]]) {
    block.appendChild(createBlockMarker(`${ready ? 'Prêtes' : 'En charge'} : ${entries.length}`));
    const wrap = document.createElement('div');
    wrap.className = ready ? 'ex-slots-available' : 'ex-slots-recharging';
    for (const entry of entries) {
      const next = ready && entry === available[0] && !precedingLife;
      const node = createExtraLifeSlotNode({
        curR: entry.slot.currentRegen, maxR: entry.slot.maxRegen, isFull: ready,
      }, { size: 'mini' });
      node.classList.toggle('ex-slot--equipment', entry.source === 'stuff');
      node.classList.toggle('ex-slot--next', next);
      node.dataset.stat = stat;
      node.dataset.hover = 'true';
      node.dataset.entityId = entite.id;
      node.dataset.lifeSource = entry.source;
      node.dataset.equippedId = entry.equippedId || '';
      const position = entry.equippedId ? Object.keys(entite.stuff)
        .find(key => entite.stuff[key]?.includes(entry.equippedId))?.replace('slot', '') : '';
      node.dataset.helperText = buildLifeSlotHelper({ stat, source: entry.source, position,
        current: entry.slot.currentRegen, duration: entry.slot.maxRegen, isReady: ready, next, alive: isEntiteAlive(entite) });
      const picto = node.querySelector('.ex-picto');
      if (stat === 'eternalLife') picto.className = `ex-picto picto-stat eternalLife${ready ? '' : ' ex-picto--wait'}`;
      const source = document.createElement('small');
      source.className = entry.source === 'stuff' ? 'life-equipment-source' : 'life-natural-source';
      source.textContent = entry.source === 'stuff' ? `Équipement ${position}` : 'Naturelle';
      node.appendChild(source);
      if (next) {
        const marker = document.createElement('small');
        marker.className = 'life-next-source';
        marker.textContent = 'Prochaine consommée';
        node.appendChild(marker);
      }
      wrap.appendChild(node);
    }
    block.appendChild(wrap);
  }
  return block;
}

function createFadedLifeBlock(entite) {
  const block = document.createElement("div");
  block.className = "resu-block resu-block--faded";

  const fadedCount = getFadedLifeCount(entite);

  // ✅ Sous-titre demandé (compteur)
  block.appendChild(createBlockTitle(`Vies fanées : ${toNonNegInt(fadedCount)}`));

  // Visuel seulement si >0 (tes div côte à côte)
  const fadedNode = createFadedLivesNode(entite);
  if (fadedNode) block.appendChild(fadedNode);

  return block;
}

function createResuBilanSection(entite, { extraCur, extraMax }) {
  const eternalCur = getEternalLifeCount(entite);
  const fadedCount = getFadedLifeCount(entite);

  // ✅ somme demandée : faded + eternal + extraCur
  const totalResu =
    toNonNegInt(fadedCount) +
    toNonNegInt(eternalCur) +
    toNonNegInt(extraCur);

  const wrap = document.createElement("div");
  wrap.className = "resu-block resu-bilan-section";

  // ✅ sous-titre bilan
  wrap.appendChild(createBlockTitle(`Total disponible : ${totalResu}`));

  // ✅ bloc bilan (icônes)
  wrap.appendChild(
    createResuBilanBlock({
      eternalCur,
      extraCur,
      extraMax,
      fadedCount
    })
  );

  return wrap;
}

function createExtraLifeView(entite) {
  const extra = entite?.stats?.extraLife ?? entite?.extraLife;
  const regen = entite?.extraLifeRegen;

  const extraMax = toNonNegInt(extra?.max ?? 0);
  const extraCur = toNonNegInt(extra?.current ?? 0);

  const eternalCur = getEternalLifeCount(entite);
  const fadedCount = getFadedLifeCount(entite);

  const hasExtra   = extraMax >= 1;
  const hasEternal = hasEternalLife(entite);
  const hasFaded   = fadedCount > 0;

  if (!hasExtra && !hasEternal && !hasFaded) return null;

const root = document.createElement("div");
root.className = "sub-menu-stat submenu-resurrections";
root.dataset.entityId = entite.id;
bindHelperEntity(root, entite);

// ✅ état vivant/mort => classe active/inactive
const alive = isEntiteAlive(entite);
root.classList.add(alive ? "active" : "inactive");

root.appendChild(createEntityStatsTitleNode("Résurrections"));
root.appendChild(createRegenStatutNode(entite));
  // Bilan (reste en haut)
  root.appendChild(createResuBilanSection(entite, { extraCur, extraMax }));

  // ✅ Ordre demandé des blocs dans le menu :
  if (hasFaded) {
    root.appendChild(createFadedLifeBlock(entite));
  }

  if (hasExtra) {
    root.appendChild(createExtraLifeBlock(entite));
  }

  if (hasEternal) {
    root.appendChild(createEternalLifeBlock(entite));
  }

  return root;
}

function desyncAnimate(el, baseDuration, durationJitter, maxDelay = null) {
  const dur = baseDuration + (Math.random() * 2 - 1) * durationJitter;
  const delayRange = (maxDelay ?? dur);      // si maxDelay fourni, on l'utilise
  const phase = Math.random() * delayRange;  // pour avoir des delays type -1.315s

  el.style.setProperty("--desync-duration", `${dur.toFixed(3)}s`);
  el.style.setProperty("--desync-delay", `${(-phase).toFixed(3)}s`);
}

function createExtraLifeSlotNode({ curR, maxR, isFull }, { size = "main" } = {}) {
  const card = document.createElement("div");
  card.className = `ex-slot ex-slot--${size} ${isFull ? "ex-slot--full" : "ex-slot--progress"}`;

  const ringWrap = document.createElement("div");
  ringWrap.className = "ex-ring-wrap";

  // --- helpers ---
  const toInt = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.floor(n) : 0;
  };

  // gap adaptatif : dépend du nombre de segments
  // - perSeg = angle de base d'un segment
  // - gap = perSeg * ratio, borné
  const computeGapDeg = (total, { ratio = 0.22, min = 2.5, max = 12 } = {}) => {
    const t = Math.max(1, toInt(total));
    const perSeg = 360 / t;
    return clamp(perSeg * ratio, min, max);
  };

  const maxRInt = Math.max(0, toInt(maxR));
  const curRInt = toInt(curR);

  // ✅ clamp UI : curR peut être -1 → visuellement 0 segments remplis
  const filled = Math.max(0, Math.min(maxRInt, curRInt));
  const total  = Math.max(1, maxRInt);

  // --- sizing : 3 premiers grands, le reste = 50% ---
  const MAIN_SIZE = 120;
  const MINI_SCALE = 0.50;

  const ringSize = size === "main"
    ? MAIN_SIZE
    : Math.max(44, Math.round(MAIN_SIZE * MINI_SCALE)); // 50% (avec un min de lisibilité)

  const MAIN_THICKNESS = 10;
  const ringThickness = size === "main"
    ? MAIN_THICKNESS
    : Math.max(4, Math.round(MAIN_THICKNESS * MINI_SCALE)); // 50%

  // gap adaptatif (mini un poil plus serré pour rester lisible)
  const gapDeg = size === "main"
    ? computeGapDeg(total, { ratio: 0.24, min: 3,   max: 14 })
    : computeGapDeg(total, { ratio: 0.20, min: 2.5, max: 12 });

  const pad = size === "main" ? 6 : 4;

  const svg = createSegmentedRingSVG({
    filled,
    total,
    size: ringSize,
    thickness: ringThickness, // ✅ largeur “radiale” des segments
    gapDeg,                   // ✅ espaces “angulaires” adaptatifs
    padding: pad,
    ariaLabel: `Régénération ${filled}/${total}`
  });
  svg.classList.add("ex-ring-svg");

  const core = document.createElement("div");
  core.className = "ex-core";
const picto = document.createElement("div");
picto.className = `ex-picto ${isFull ? "ex-picto--ready" : "ex-picto--wait"}`;

// anime uniquement si "ready"
if (isFull) {
  picto.classList.add("animate");          // ou garde tes classes si ton CSS en dépend
  // picto.classList.add("animate", "desync-animate", "float-levitate");

  // levitate : durée ~4.2s, léger jitter
  desyncAnimate(picto, 4.2, 0.5);
}

  core.appendChild(picto);

  ringWrap.appendChild(svg);
  ringWrap.appendChild(core);

const label = document.createElement("div");
label.className = "ex-label";

if (isFull) {
  const line1 = document.createElement("div");
  line1.className = "ex-label-line ex-label-line--ready";
  line1.textContent = "Prête !";

  const line2 = document.createElement("div");
  line2.className = "ex-label-line ex-label-line--count";
  line2.textContent = `${filled}/${total}`;

  label.appendChild(line1);
  label.appendChild(line2);
} else {
  label.textContent = `${filled}/${total}`;
}

  card.appendChild(ringWrap);
  card.appendChild(label);

  return card;
}

function polarToCartesian(cx, cy, r, angleDeg) {
  // 0° en haut
  const a = (angleDeg - 90) * Math.PI / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function describeDonutSegment(cx, cy, rOuter, rInner, startAngle, endAngle) {
  const outerStart = polarToCartesian(cx, cy, rOuter, startAngle);
  const outerEnd   = polarToCartesian(cx, cy, rOuter, endAngle);
  const innerEnd   = polarToCartesian(cx, cy, rInner, endAngle);
  const innerStart = polarToCartesian(cx, cy, rInner, startAngle);

  const delta = ((endAngle - startAngle) % 360 + 360) % 360;
  const largeArcFlag = delta > 180 ? "1" : "0";

  return [
    "M", outerStart.x, outerStart.y,
    "A", rOuter, rOuter, 0, largeArcFlag, 1, outerEnd.x, outerEnd.y,
    "L", innerEnd.x, innerEnd.y,
    "A", rInner, rInner, 0, largeArcFlag, 0, innerStart.x, innerStart.y,
    "Z"
  ].join(" ");
}

function createSegmentedRingSVG({
  filled = 0,
  total = 1,
  size = 120,
  thickness = 16,
  gapDeg = 2,
  padding = 6,
  ariaLabel = ""
} = {}) {
  const svgNS = "http://www.w3.org/2000/svg";

  const Y = Math.max(1, Math.floor(Number(total) || 1));
  const X = Math.max(0, Math.min(Y, Math.floor(Number(filled) || 0)));

  const s = Math.max(40, Math.floor(Number(size) || 120));
  const cx = s / 2;
  const cy = s / 2;

  const t = Math.max(2, Math.floor(Number(thickness) || 16));
  const pad = Math.max(0, Math.floor(Number(padding) || 0));

  const rOuter = (s / 2) - pad;
  const rInner = Math.max(1, rOuter - t);

  const segAngle = 360 / Y;
  const halfGap = Math.max(0, Number(gapDeg) || 0) / 2;

  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${s} ${s}`);
  svg.setAttribute("width", String(s));
  svg.setAttribute("height", String(s));
  svg.setAttribute("shape-rendering", "geometricPrecision");
  if (ariaLabel) svg.setAttribute("aria-label", ariaLabel);
  svg.setAttribute("role", "img");

  for (let i = 0; i < Y; i++) {
    const start = i * segAngle + halfGap;
    const end   = (i + 1) * segAngle - halfGap;
    if (end <= start) continue;

    const p = document.createElementNS(svgNS, "path");
    p.setAttribute("d", describeDonutSegment(cx, cy, rOuter, rInner, start, end));
    p.setAttribute("class", i < X ? "ex-fill" : "ex-empty");
    svg.appendChild(p);
  }

  return svg;
}

function createStatGraphView(entite, statDefinitions) {
  if (!entite || !entite.stats) return null;

  const graphValues = calculateStatGraphValue(entite.stats, statDefinitions);

  const root = document.createElement('div');
  root.className = 'sub-menu-stat submenu-graph';

  const header = document.createElement('div');
  header.className = 'codex-graph-header';

   header.appendChild(createEntityStatsTitleNode("Profil de l'entité"));

  const sub = document.createElement('p');
  sub.className = 'codex-graph-subtitle';
  sub.textContent = 'Graphique représenatnt le profil Attaque / Defence / Utilitaire basé sur les stats actuelles de cette entité.';

  header.appendChild(sub);
  root.appendChild(header);

  const canvasWrapper = document.createElement('div');
  canvasWrapper.className = 'codex-graph-canvas-wrapper';

  const canvas = document.createElement('canvas');
  canvas.className = 'codex-graph-canvas';
  canvasWrapper.appendChild(canvas);

  const labelsLayer = document.createElement('div');
labelsLayer.className = 'codex-graph-axis-labels';
canvasWrapper.appendChild(labelsLayer);

  root.appendChild(canvasWrapper);

  const legend = document.createElement('div');
  legend.className = 'codex-graph-legend';

const makeBtn = (key, label) => {
  const b = document.createElement('button');   // au lieu d'un <div>
  b.type = 'button';
  b.className = `graph-legend-item active graph-legend-${key}`;
  b.dataset.key = key;

  // Icône + label
  b.innerHTML = `
    <span class="graph-legend-icon"></span>
    <span class="graph-legend-label">${label}</span>
  `;

  return b;
};

legend.appendChild(makeBtn('att', 'Attaque'));
legend.appendChild(makeBtn('def', 'Défense'));
legend.appendChild(makeBtn('uti', 'Utilitaire'));

  root.appendChild(legend);

  // ✅ on stocke une fonction d'init à appeler APRÈS appendChild
  root._initGraph = () => {
   initStatRadar(canvas, graphValues, legend, labelsLayer);
  };

  return root;
}

function isSameArchetype(a, b) {
  if (!a || !b) return false;
  const keyA = String(a.key || '').trim().toLowerCase();
  const keyB = String(b.key || '').trim().toLowerCase();
  const lvlA = a.level || 1;
  const lvlB = b.level || 1;
  return keyA === keyB && lvlA === lvlB;
}

function getArchetypeProgressInfo(archEntry, entite) {
  if (!archEntry) {
    return { stage: 0, cycleLen: 0, ratio: 0 };
  }

  const keyLower = String(archEntry.key || '').trim().toLowerCase();

  let cycleLen = 0;
  if (typeof getCycleLenFor === 'function') {
    cycleLen = getCycleLenFor(keyLower, entite) || 0;
  }

  // Fallback si on n'a pas de cycleLen propre
  if (!cycleLen) {
    const stepFallback = archEntry.step || 0;
    const mileFallback = Array.isArray(archEntry.milestone)
      ? archEntry.milestone.length
      : 0;
    const bestFallback = Math.max(stepFallback, mileFallback, 1);
    cycleLen = bestFallback;
  }

  let stage = Math.max(
    0,
    archEntry.step || 0,
    Array.isArray(archEntry.milestone) ? archEntry.milestone.length : 0
  );

  stage = Math.min(stage, cycleLen);

  const ratio = cycleLen ? stage / cycleLen : 0;

  return { stage, cycleLen, ratio };
}

function createArchetypesList(entite) {
  const wrapper = document.createElement('div');
  wrapper.classList.add('sub-menu-stat', 'archetype-stat'); // commune + spécifique

  // Header
  const header = document.createElement('div');
  header.className = 'sub-menu-stat__header';
  header.appendChild(createEntityStatsTitleNode("Archétypes de l'entité"));
  wrapper.appendChild(header);

  // Body
  const body = document.createElement('div');
  body.className = 'sub-menu-stat__body';
  wrapper.appendChild(body);

  const arche = entite?.Archetype || {};
  const rawCurrent = arche.current || null;
  const rawInProgress = Array.isArray(arche.inProgress) ? arche.inProgress.slice() : [];
  const rawAchieve = Array.isArray(arche.achieve) ? arche.achieve.slice() : [];

  if (!rawCurrent && rawInProgress.length === 0 && rawAchieve.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'archetype-empty';
    empty.textContent = "L'entité n'a entamé aucun archétype.";
    body.appendChild(empty);
    return wrapper;
  }

  const current = rawCurrent;

  const inProgress = rawInProgress
    .map(entry => ({ entry, info: getArchetypeProgressInfo(entry, entite) }))
    .filter(obj => obj.info.stage > 0)
    .sort((a, b) => b.info.ratio - a.info.ratio)
    .map(obj => obj.entry);

  const achieve = rawAchieve
    .map(entry => ({ entry, info: getArchetypeProgressInfo(entry, entite) }))
    .filter(obj => obj.info.stage > 0)
    .map(obj => obj.entry);

  function addSection(titleText, items, type) {
    if (!items || items.length === 0) return;

    const sectionHeader = document.createElement('div');
    sectionHeader.className = 'archetype-section';

    const title = document.createElement('p');
    title.className = 'title';
    title.textContent = titleText;

    sectionHeader.appendChild(title);
    body.appendChild(sectionHeader);

    const section = document.createElement('div');
    section.className = `archetype-section-content archetype-section-content--${type}`;

    items.forEach(entry => {
      const line = createArchetypeLine(entite, entry, type);
      section.appendChild(line);
    });

    body.appendChild(section);
  }

  if (current) addSection('ARCHETYPE EN COURS :', [current], 'current');
  if (inProgress.length) addSection('ARCHETYPES EN PROGRÈS :', inProgress, 'progress');
  if (achieve.length) addSection('ARCHETYPES ACQUIS :', achieve, 'achieve');

  return wrapper;
}

function createCurrentArchetypesList(entite) {
  const wrapper = document.createElement('div');
  wrapper.classList.add('sub-menu-stat', 'archetype-stat', 'archetype-stat-current-only');

  const header = document.createElement('div');
  header.className = 'sub-menu-stat__header';
  header.appendChild(createEntityStatsTitleNode("Archétypes en cours"));
  wrapper.appendChild(header);

  const body = document.createElement('div');
  body.className = 'sub-menu-stat__body';
  wrapper.appendChild(body);

  const arche = entite?.Archetype || {};
  const rawCurrent = arche.current || null;
  const rawInProgress = Array.isArray(arche.inProgress) ? arche.inProgress.slice() : [];

  const items = [];

  if (rawCurrent) {
    items.push({ entry: rawCurrent, type: 'current' });
  }

  rawInProgress
    .map(entry => ({ entry, info: getArchetypeProgressInfo(entry, entite) }))
    .filter(obj => obj.info.stage > 0)
    .sort((a, b) => b.info.ratio - a.info.ratio)
    .forEach(obj => items.push({ entry: obj.entry, type: 'progress' }));

  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'archetype-empty';
    empty.textContent = "Aucun archétype en cours.";
    body.appendChild(empty);
    return wrapper;
  }

  const sectionHeader = document.createElement('div');
  sectionHeader.className = 'archetype-section';

  const title = document.createElement('p');
  title.className = 'title';
  title.textContent = 'ARCHETYPES EN COURS :';

  const goldLine = document.createElement('div');
  goldLine.className = 'separation-line golden';

  sectionHeader.appendChild(title);
  sectionHeader.appendChild(goldLine);
  body.appendChild(sectionHeader);

  const section = document.createElement('div');
  section.className = 'archetype-section-content archetype-section-content--current-tabs';

  items.forEach(({ entry, type }) => {
    section.appendChild(createArchetypeLine(entite, entry, type));
  });

  body.appendChild(section);

  return wrapper;
}

function createArchetypeLine(entite, archEntry, type) {
  const line = document.createElement('div');
  line.className = `archetype-line archetype-line--${type}`;

  // Nom de l'archétype (COLOSSE II, FANATIQUE I, etc.)
  const label = document.createElement('span');
  label.className = 'archetype-title';
  label.textContent = getArchetypeDisplayName(archEntry);
  line.appendChild(label);

  // Jauge compacte (pas de graph circulaire ici)
  const gaugeWrap = document.createElement('div');
  gaugeWrap.className = 'archetype-bar archetype-bar--list';

  const gaugeBar = document.createElement('div');
  gaugeBar.className = 'archetype-lvl-bar';

  const gaugeFill = document.createElement('div');
  gaugeFill.className = 'archetype-level-fill';

  gaugeBar.appendChild(gaugeFill);

  const gaugeMilestones = document.createElement('div');
  gaugeMilestones.className = 'archetype-milestones';

  const gaugeLabel = document.createElement('div');
  gaugeLabel.className = 'archetype-lvl-label';
  gaugeLabel.style.opacity = '0';
  gaugeLabel.style.transition = 'opacity 250ms ease';
  gaugeLabel.style.pointerEvents = 'none';

  const showGaugeHint = () => { gaugeLabel.style.opacity = '1'; };
  const hideGaugeHint = () => { gaugeLabel.style.opacity = '0'; };

  gaugeWrap.addEventListener('mouseenter', showGaugeHint);
  gaugeWrap.addEventListener('mouseleave', hideGaugeHint);
  gaugeWrap.addEventListener('focusin', showGaugeHint);
  gaugeWrap.addEventListener('focusout', hideGaugeHint);

  gaugeWrap.appendChild(gaugeBar);
  gaugeWrap.appendChild(gaugeMilestones);
  gaugeWrap.appendChild(gaugeLabel);

  line.appendChild(gaugeWrap);

  // Remplissage de la jauge + milestones en fonction de step / cycle
  fillArchetypeLineGauge(entite, archEntry, {
    fill: gaugeFill,
    label: gaugeLabel,
    milestones: gaugeMilestones
  }, type);

  return line;
}

function getArchetypeDisplayName(archEntry) {
  const key = String(archEntry.key || '').trim().toLowerCase();

  // Nom "propre" via CLASS_INDEX / cyclesData
  let baseName = getClassLabel(key) || key;

  const level = archEntry.level || 1;
  let suffix = '';

  if (level > 1) {
    suffix = ' ' + (typeof toRoman === 'function' ? toRoman(level) : level);
  }

  return (baseName + suffix).toUpperCase();
}

function fillArchetypeLineGauge(entite, archEntry, nodes, type) {
  if (!archEntry || !nodes) return;

  const keyLower = String(archEntry.key || '').trim().toLowerCase();
  const level    = archEntry.level || 1;

  // 1) Longueur du cycle (Titan → 25, etc.)
  let cycleLen = getCycleLenFor(keyLower, entite) || 0;

  // Si pour une raison quelconque on n'a pas de cycle,
  // on tombe sur un fallback basé sur le step ou la longueur de milestone.
  if (!cycleLen) {
    const stepFallback  = archEntry.step || 0;
    const mileFallback  = Array.isArray(archEntry.milestone) ? archEntry.milestone.length : 0;
    const bestFallback  = Math.max(stepFallback, mileFallback, 1);
    cycleLen = bestFallback;
  }

  // 2) Étapes complétées
  let stage = Math.max(
    0,
    archEntry.step || 0,
    Array.isArray(archEntry.milestone) ? archEntry.milestone.length : 0
  );

  // Un archétype "achieve" est toujours considéré comme 100%
  if (type === 'achieve') {
    stage = cycleLen;
  }

  const clampedStage = Math.min(stage, cycleLen);
  const pct = cycleLen ? Math.round((clampedStage / cycleLen) * 100) : 0;

  // ---- FILL ----
  if (nodes.fill) {
    nodes.fill.style.width = `${pct}%`;
  }

  // ---- LABEL (hover) ----
  if (nodes.label) {
    let nice = getClassLabel(keyLower) || keyLower;
    let romanPart = '';

    if (level > 1) {
      romanPart = (typeof toRoman === 'function')
        ? ' ' + toRoman(level)
        : ' ' + level;
    }

    nodes.label.textContent =
      `${nice}${romanPart} — ${clampedStage}/${cycleLen} · ${pct}%`;
  }

  // ---- MILESTONES (lvl 2 / lvl 3 + gemmes d'attribut) ----
  if (nodes.milestones) {
    const existingMilestones = new Map([...nodes.milestones.children]
      .map(el => [el.dataset.index, el]));

    const cycle = getCycleForKey(keyLower, entite) || [];
    const total = cycle.length || cycleLen;

    // Jalons théoriques (où se trouvent les lvl 2 / lvl 3 dans le cycle)
    const jalons = getArchetypeMilestones(keyLower, entite) || [];
    if (!Array.isArray(jalons) || !jalons.length) {
      // Pas de lvl2/lvl3 -> pas de jalon visuel
      existingMilestones.forEach(el => el.remove());
      return;
    }

    // Séquence d'attributs réellement investis pour cet archétype
    const investedArr = Array.isArray(archEntry.milestone)
      ? archEntry.milestone
      : [];

    jalons.forEach(j => {
      const idx = j.index ?? 0;      // index de la step dans le cycle (0-based)
      const lvl = j.level ?? null;   // 2 ou 3
      const stageNumber = idx + 1;   // step humaine (1-based)

      const el = existingMilestones.get(String(idx)) || document.createElement('div');
      existingMilestones.delete(String(idx));
      el.className = 'milestone';
      el.dataset.index = String(idx);
      el.querySelector('.gemme')?.remove();

      // Nature + classe détaillée (attaque-2, defense-3, utilitaire-2, etc.)
      if (j.stageName) {
        const [nature, lvlStr] = j.stageName.split('-'); // ex: "defense-3"
        if (nature) {
          el.classList.add(nature); // "attaque" | "defense" | "utilitaire" ...
          if (lvlStr) {
            el.classList.add(`${nature}-${lvlStr}`); // "defense-3"
          }
        }
      }

      // Classe générique de niveau : "lvl-2", "lvl-3"
      if (lvl) {
        el.dataset.level = lvl;
        el.classList.add(`lvl-${lvl}`);
      }

      // Position sur la barre
      const posPct = (stageNumber / total) * 100;
      el.style.left = `calc(${posPct}% - 6px)`;

      // Est-ce que cette étape est atteinte ?
      const isReached = (type === 'achieve') || (clampedStage >= stageNumber);
      if (isReached) {
        el.classList.add('filled');

        // Attribut investi à cette step (force / agilite / intelligence)
        const rawAttr = investedArr[stageNumber - 1]; // 0-based dans milestone[]
        if (rawAttr) {
          const attrClass = String(rawAttr).toLowerCase(); // "force","agilite","intelligence"

          // Classe sur le jalon (utile pour le CSS : .milestone.force, .milestone.agilite...)
          el.classList.add(attrClass);

          // Gemme enfant
          if (lvl !== 3) {
            const gem = document.createElement('div');
            gem.className = `gemme ${attrClass}`;
            el.appendChild(gem);
          }
        }
      }

      if (lvl === 3) {
        const color = isReached ? getMilestoneEssenceColor(investedArr[stageNumber - 1]) : "";
        el.classList.add('has-essence-reward');
        el.dataset.essenceRewardColor = color || 'neutral';
        updateMilestoneEssenceElement(el, color);
        el.title = buildMilestoneEssenceHelper(Boolean(color));
      } else {
        el.querySelector('.milestone-essence')?.remove();
        delete el.dataset.essenceRewardColor;
        el.removeAttribute('title');
      }
      if (el.parentElement !== nodes.milestones) nodes.milestones.appendChild(el);
    });
    existingMilestones.forEach(el => el.remove());
  }
}

export {
  refreshCodexUmbraPanel,
  renderCodexUmbraSubstatPanel,
  createSoulSubmenu,
  createStatsSubmenu,
  createSoulGraphPanel,
  createArchetypesList,
};

// Register shared handlers once, after the complete module graph is initialized.
let initialized = false;
export function initializeCodexStats() {
  if (initialized) return;
  initialized = true;
  if (typeof window !== "undefined") {
    window.refreshCodexUmbraPanel = refreshCodexUmbraPanel;
  }
}

// Formulaires de progression : solde, choix des points et presentation des archetypes.
export function LevelupSignal(
  entite,
  type = 'bouton',
  { onOpen = null, section = 'Profil', parent = null } = {}
) {
  const currentLevel = getEntityLevelCurrent(entite);
  const maxLevelForEntity = getEntityLevelMax(entite);

  const nextLevelData = levelDetails.find(l => l.level === currentLevel + 1);
  const playerXP = getAvailablePlayerExperience();

  const canLevelUp = !!(
    nextLevelData &&
    currentLevel < maxLevelForEntity &&
    playerXP >= nextLevelData.cost
  );

  const el = document.createElement(type === 'bouton' ? 'div' : 'span');
  el.className = type === 'bouton' ? 'btn levelup-btn' : 'levelup-icon';

  if (type === 'bouton') {
    el.textContent = 'Monter le niveau 🡅';
  } else {
    el.innerHTML = '🡅';
    el.title = 'Monter le niveau';
  }

  // ✅ resolve parent (Element ou selector)
  const parentEl =
    parent instanceof Element ? parent :
    (typeof parent === 'string' ? document.querySelector(parent) : null);

  // ✅ si pas de level up possible, on cache et (optionnel) on retire du parent
  if (!canLevelUp) {
    if (type !== 'bouton' && parentEl) {
      parentEl.querySelectorAll('.levelup-icon').forEach(n => n.remove());
    }
    el.style.display = 'none';
    el.setAttribute('aria-hidden', 'true');
    return el;
  }

  const triggerOpen = (e) => {
    e?.stopPropagation?.();

    const statsMenuIndex = 2;
    const levelUpSubmenuIndex = 2;

    saveToLocalStorage('CodexMenuIndex', statsMenuIndex);
    saveToLocalStorage('CodexSubmenuIndex', levelUpSubmenuIndex);

    if (typeof showSection === 'function') showSection('Stats');
    if (typeof createLevelUpForm === 'function') createLevelUpForm(entite);

    if (typeof onOpen === 'function') onOpen(section);
  };

  el.style.cursor = 'pointer';
  el.tabIndex = 0;
  el.addEventListener('click', triggerOpen);
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') triggerOpen(e);
  });

  // ✅ si on a un parent cible + type icon => on mount ici (sans doublon)
if (type !== 'bouton' && parentEl) {
  parentEl.querySelectorAll('.levelup-icon').forEach(n => n.remove());

  const soulPicto = parentEl.querySelector('.codex-soul');

  if (soulPicto) {
    soulPicto.insertAdjacentElement('afterend', el);
    soulPicto.insertAdjacentText('afterend', ' ');
  } else {
    parentEl.appendChild(el);
  }
}

  return el;
}

export function updateExperienceDisplay() {
    const scoringDiv = document.getElementById('score');
    if (scoringDiv) {
        scoringDiv.textContent = `Experience : ${playerExperience}`;
    }
}

function createLevelElements(entite) {

	const levelUpSection = document.createElement('div');
	levelUpSection.className = 'level-up-section';

	const SoulSection = document.createElement('div');
	SoulSection.className = 'soul-section';
	SoulSection.id = `soul-section-${entite.id}`;

	// Icones Archetypes
	const ArchSection = document.createElement('div');
	ArchSection.className = 'archetype-icon-section';
	ArchSection.id = `archetype-icons-${entite.id}`;

	// On STOCKE les achieve. On NE crée PAS les icônes maintenant !
	const achievedList = (entite.Archetype && Array.isArray(entite.Archetype.achieve))
		? [...entite.Archetype.achieve]
		: [];

	// Graphique temps réel (camembert) — tout en haut
	const graphcontainer = document.createElement('div');
	graphcontainer.className = 'attribut-graph-container';
	graphcontainer.id = `soul-${entite.id}`;
	graphcontainer.classList.add("created");
	setTimeout(() => { graphcontainer.classList.remove("created"); }, 500);

	const graphCanvas = document.createElement('canvas');
	graphCanvas.width = 122;
	graphCanvas.height = 122;
	graphCanvas.className = 'attribut-graph';

	const eclipseCanvas = document.createElement('img');
	eclipseCanvas.src = './media/assets/misc/soul-eclipsaura.webp';
	eclipseCanvas.className = 'attribut-eclipse';
	eclipseCanvas.id = 'eclipse';

	const circleSoul = document.createElement('div');
	circleSoul.className = 'attribut-circleSoul';

	const soulEntity = document.createElement('div');
	soulEntity.className = 'attribut-entitySoul';

	const entitySoulImg1 = document.createElement('img');
	entitySoulImg1.src = './media/assets/misc/soul-entity-01.png';
	entitySoulImg1.className = 'attribut-entitySoul one';

	const entitySoulImg2 = document.createElement('img');
	entitySoulImg2.src = './media/assets/misc/soul-entity-02.png';
	entitySoulImg2.className = 'attribut-entitySoul two';

	const entitySoulBg = document.createElement('div');
	entitySoulBg.className = 'entitySoul-bg';

	const entitySoulblack = document.createElement('div');
	entitySoulblack.className = 'black-circle';

	soulEntity.appendChild(entitySoulImg1);
	soulEntity.appendChild(entitySoulImg2);

	const soulDepth = document.createElement('div');
	soulDepth.className = 'soul-depth';

	const soulAura = document.createElement('div');
	soulAura.className = 'soul-aura';

	graphcontainer.appendChild(soulEntity);
	graphcontainer.appendChild(entitySoulBg);
	graphcontainer.appendChild(entitySoulblack);
	graphcontainer.appendChild(eclipseCanvas);
	graphcontainer.appendChild(graphCanvas);
	graphcontainer.appendChild(circleSoul);
	graphcontainer.appendChild(soulDepth);
	graphcontainer.appendChild(soulAura);

	// Archétype actif — juste en dessous du graph
	const archetypeLine = document.createElement('div');
	archetypeLine.className = 'archetype-line';
	archetypeLine.id = `archetype-line-${entite.id}`;

	const archetypeLabel = document.createElement('span');
	archetypeLabel.className = 'archetype-title';

	const archetypeDesc = document.createElement('p');
	archetypeDesc.className = 'archetype-description';
	archetypeDesc.textContent = '';

	// Jauge de progression
	const gaugeWrap = document.createElement('div');
	gaugeWrap.className = 'archetype-bar';

	const canvasUp = document.createElement('canvas');
	canvasUp.id = 'archup';
	canvasUp.className = 'arch-up';

	const gaugeBar = document.createElement('div');
	gaugeBar.className = 'archetype-lvl-bar';

	const gaugeFill = document.createElement('div');
	gaugeFill.className = 'archetype-level-fill';

	const gaugeLabel = document.createElement('div');
	gaugeLabel.className = 'archetype-lvl-label';
	gaugeLabel.style.opacity = '0';
	gaugeLabel.style.transition = 'opacity 250ms ease';
	gaugeLabel.style.pointerEvents = 'none';

	const showGaugeHint = () => { gaugeLabel.style.opacity = '1'; };
	const hideGaugeHint = () => { gaugeLabel.style.opacity = '0'; };

	gaugeWrap.addEventListener('mouseenter', showGaugeHint);
	gaugeWrap.addEventListener('mouseleave', hideGaugeHint);
	gaugeWrap.addEventListener('focusin',   showGaugeHint);
	gaugeWrap.addEventListener('focusout',  hideGaugeHint);

	gaugeBar.appendChild(gaugeFill);

	const gaugeMilestones = document.createElement('div');
	gaugeMilestones.className = 'archetype-milestones';
	gaugeWrap.appendChild(gaugeMilestones);

	gaugeWrap.append(gaugeBar, gaugeLabel);
	gaugeWrap.appendChild(canvasUp);

	SoulSection.appendChild(ArchSection);
	SoulSection.appendChild(graphcontainer);

	levelUpSection.appendChild(SoulSection);

	archetypeLine.appendChild(archetypeLabel);
	archetypeLine.appendChild(gaugeWrap);
	archetypeLine.appendChild(archetypeDesc);
	SoulSection.appendChild(archetypeLine);

	// Ligne Niveau
	const currentLevel = getEntityLevelCurrent(entite);

	const levelBloc = document.createElement('div');
	levelBloc.className = 'level-bloc';
	levelUpSection.appendChild(levelBloc);

	// ✅ bloc 1 (infos lvl + XP)
	const levelInfosBloc = document.createElement('div');
	levelInfosBloc.className = 'level-infos-bloc';

	// ✅ bloc 2 (boutons)
	const levelButtonsBloc = document.createElement('div');
	levelButtonsBloc.className = 'level-buttons-bloc';

	const levelLine = document.createElement('div');
	levelLine.className = 'level-line';

	const levelName = document.createElement('span');
	levelName.className = 'levelup-name';
	levelName.textContent = 'Niveau : ';

	const levelCurrent = document.createElement('span');
	levelCurrent.className = 'level-current';
	levelCurrent.textContent = currentLevel;
	levelCurrent.setAttribute('data-stat', 'lvl');

	const levelTransition = document.createElement('span');
	levelTransition.className = 'level-transi is-hidden';
	levelTransition.textContent = ' > ';

	const levelFuture = document.createElement('span');
	levelFuture.className = 'level-future is-hidden';
	levelFuture.textContent = currentLevel;

	levelLine.append(levelName, levelCurrent, levelTransition, levelFuture);

	// XP
	const XPTitle = document.createElement('p');
	XPTitle.textContent = 'Expérience :';

	const DivXpDisplay = document.createElement('div');
	DivXpDisplay.className = 'div-xp-display';
	DivXpDisplay.appendChild(XPTitle);
	const initialXPDisplay = document.createElement('p');
	initialXPDisplay.className = 'initial-xp-display';
	DivXpDisplay.appendChild(initialXPDisplay);

	const transitionXP = document.createElement('p');
	transitionXP.className = 'xp-transi is-hidden';
	transitionXP.textContent = ' > ';
	DivXpDisplay.appendChild(transitionXP);

	const playerXPDisplay = document.createElement('p');
	playerXPDisplay.className = 'xp-display is-hidden';
	DivXpDisplay.appendChild(playerXPDisplay);

	const investedXPDisplay = document.createElement('p');
	investedXPDisplay.className = 'invested-xp-display is-hidden';
	investedXPDisplay.textContent = `- 0 XP`;

	const xpCostDisplay = document.createElement('p');

	// Bloc attributs
	const attributibutUp = document.createElement('div');
	attributibutUp.className = 'attribut-up';

	// Boutons
	const levelupbuttons = document.createElement('div');
	levelupbuttons.className  = 'level-up-buttons';

	const confirmButton = document.createElement('div');
	confirmButton.textContent = 'Confirmer';
	confirmButton.className = 'confirm-button yes level is-hidden';

	const clearBtn = document.createElement('div');
	clearBtn.id = 'clear-history-btn';
	clearBtn.textContent = 'Réinitialiser';
	clearBtn.className = 'confirm-button clear is-hidden';

	levelupbuttons.append(confirmButton, clearBtn);

	// ✅ Assemblage : infos dans un bloc, boutons dans un autre
	levelInfosBloc.append(
		levelLine,
		DivXpDisplay,
		investedXPDisplay,
		xpCostDisplay
	);

	levelButtonsBloc.appendChild(levelupbuttons);

	// ✅ levelBloc contient : infos, attributs, boutons
	levelBloc.append(
	attributibutUp,
		levelInfosBloc,

		levelButtonsBloc
	);

	// 🔥 CREATION DES ICONES APRÈS INSERTION DANS LE DOM
	requestAnimationFrame(() => {
	    achievedList.forEach(ach => {
	       createArchetypeIcon(entite, ach.key, ach.level, ach.uid);
	    });
	});

	return {
		levelUpSection,
		gauge: { wrap: gaugeWrap, bar: gaugeBar, fill: gaugeFill, label: gaugeLabel, milestones: gaugeMilestones },
		levelCurrent, levelTransition, levelFuture,
		initialXPDisplay, transitionXP, playerXPDisplay, investedXPDisplay, xpCostDisplay,
		attributibutUp,
		confirmButton, clearBtn,
		archetypeLabel,
		archetypeDesc,
		graphCanvas,
	};
}

function buildattributibutLine(attribut, baseValue, entite) {

  const attributLine = document.createElement('div');
  attributLine.className = 'level-up-attribut-line';

  const axisLine = document.createElement('div');
  axisLine.className = 'axis-line';
  axisLine.dataset.short = attribut.short;  // "F" | "A" | "I"
  axisLine.dataset.key   = attribut.key;

  // ✅ PICto (F/A/I -> strength/agility/intelligence)
  const map = { F: 'strength', A: 'agility', I: 'intelligence' };
  const pictoName = map[attribut.short];

  const pictoWrap = document.createElement('div');
  pictoWrap.className = 'attribut-picto';
  pictoWrap.dataset.short = attribut.short;
  Object.assign(pictoWrap.dataset, { stat: attribut.key, entityId: String(entite.id), hover: 'true', attributeHelper: 'true' });
  pictoWrap.tabIndex = 0;
  pictoWrap.setAttribute('role', 'button');
  pictoWrap.setAttribute('aria-label', attribut.label);
  bindHelperEntity(pictoWrap, entite);

  const picto = document.createElement('div');
  picto.className = `picto-stat ${pictoName} attribut`;

  pictoWrap.appendChild(picto);

  const label = document.createElement('div');
  label.className = 'label';
  label.textContent = attribut.label;

  const leftArrow = document.createElement('span');
  leftArrow.className = 'xp-arrow left-arrow is-hidden';
  leftArrow.textContent = '<';

  const valueDisplay = document.createElement('div');
  valueDisplay.className = 'axis-value-display';
  valueDisplay.textContent = baseValue;

  const rightArrow = document.createElement('span');
  rightArrow.className = 'xp-arrow right-arrow';
  rightArrow.textContent = '>';

  axisLine.append(label, leftArrow, valueDisplay, rightArrow);

  // ✅ ordre DOM demandé : picto d'abord, axisLine en dessous
  attributLine.append(pictoWrap, axisLine);

  // ✅ compat si ton code lit dataset sur l'élément retourné
  attributLine.dataset.short = axisLine.dataset.short;
  attributLine.dataset.key   = axisLine.dataset.key;

  return attributLine;
}

function findAvailableAnimaId() {
  const player = loadFromLocalStorage('PlayerSave', {});
  const items = loadFromLocalStorage('IngameItemsData', {}).items || [];
  const inventory = Array.isArray(player.Playerinventory) ? player.Playerinventory : [];
  for (const entry of inventory) {
    const item = typeof entry === 'string' ? items.find(candidate => candidate.itemId === entry) : entry;
    if (item?.functionName === 'AnimaOmbilicale' && item.itemType?.includes('consumable')) return item.itemId;
  }
  return null;
}

function refreshPurificationButtons() {
  const available = Boolean(findAvailableAnimaId());
  const army = loadFromLocalStorage('selectedArmyA', []);
  document.querySelectorAll('.level-purify-button').forEach(button => {
    const entity = Array.isArray(army)
      ? army.find(entry => String(entry.id) === button.dataset.entityId)
      : null;
    const level = entity ? getEntityLevelCurrent(entity) : Number(button.dataset.entityLevel);
    button.hidden = !available || !(level > 1);
  });
}

let purificationInventoryListenerBound = false;

function createPurificationButton(entity, form, purificationHost = null) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'level-purify-button';
  button.dataset.entityId = String(entity.id);
  button.dataset.entityLevel = String(getEntityLevelCurrent(entity));
  button.textContent = `Purifier ${entity.nickname || entity.name}`;
  button.hidden = !findAvailableAnimaId() || !(getEntityLevelCurrent(entity) > 1);
  if (!purificationInventoryListenerBound) {
    window.addEventListener('inventoryItemsUpdated', refreshPurificationButtons);
    window.addEventListener('selectedArmyAUpdated', refreshPurificationButtons);
    purificationInventoryListenerBound = true;
  }
  button.addEventListener('click', async () => {
    if (button.disabled) return;
    const itemId = findAvailableAnimaId();
    if (!itemId) { refreshPurificationButtons(); return; }
    button.disabled = true;
    try {
      const { useConsumableItem } = await import("../../items/itemManager.js");
      const result = await useConsumableItem(itemId, entity);
      // The codex may already have rebuilt its form during purification.
      if (result?.ok && form.isConnected) {
        form.replaceWith(createLevelUpForm(entity, { purificationHost }));
      }
    } finally {
      button.disabled = false;
      refreshPurificationButtons();
    }
  });
  return button;
}

export function createLevelUpForm(entite, { purificationHost = null } = {}) {
  const dom = createLevelElements(entite);
  bindHelperEntity(dom.levelUpSection, entite);
  bindLevelUpLogic(entite, dom, levelDetails);
  const host = purificationHost || dom.levelUpSection;
  host.querySelectorAll(':scope > .level-purify-button').forEach(button => button.remove());
  host.prepend(createPurificationButton(entite, dom.levelUpSection, purificationHost));

  const currentLevel = getEntityLevelCurrent(entite);
  const lvl = Math.max(1, Math.min(99, currentLevel)); // si tu veux garder ce clamp

  setTimeout(() => {
    soulScaling(currentLevel);
  }, 0);

  return dom.levelUpSection;
}

function createArchetypeIcon(entite, archetypeKey, archetypeLevel, archetypeUid) {
  if (!entite || !entite.id || !archetypeUid) return;

  const keyNorm = String(archetypeKey || "").trim().toLowerCase();

  // 🚫 RÈGLE ABSOLUE : aucun icon pour Égaré
  if (!keyNorm || keyNorm === "egare") {
    return;
  }

  const container = document.querySelector(`#archetype-icons-${entite.id}`);
  if (!container) return;

  // ⛔ ANTI-DOUBLON PAR UID
  const exists = container.querySelector(`[data-archetype-uid="${archetypeUid}"]`);
  if (exists) return;

  const icon = document.createElement("div");
  icon.classList.add("archetype-icon");

  icon.dataset.entite = entite.id;
  icon.dataset.archetypeLevel = archetypeLevel;
  icon.dataset.archetypeUid = archetypeUid;
  icon.dataset.archetypeKey = keyNorm;  // ✅ ici, jamais "egare"

  container.appendChild(icon);
}

function bindLevelUpLogic(entite, dom, levelDetails) {
const ATTRIBUTE_KEYS = new Set(["strength", "agility", "intelligence"]);
const isAttributeKey = (k) => ATTRIBUTE_KEYS.has(String(k));
function refreshPreviewHP(entite) {
  ComputeStatPreview(entite);
  renderStatPair(entite, "HP", nodes.statsRoot);
}
function refreshPreviewSpeed(entite) {
  ComputeStatPreview(entite);
  renderStatPair(entite, "velocity", nodes.statsRoot);
  renderStatPair(entite, "speed", nodes.statsRoot);
}
 const costMap = buildCostMap(levelDetails);
  const { stratArchetype } = getArchetypeConfig(entite);

  const state = createLevelUpDraft(entite);
  const setInvisible = (el, inv) => el.classList.toggle('is-hidden', !!inv);

  // Cache des nœuds attributibuts (création unique)
  const nodes = {
    confirm: dom.confirmButton,
    clear: dom.clearBtn,
    cost: dom.xpCostDisplay,
    xp: {
      initial: dom.initialXPDisplay,
      player: dom.playerXPDisplay,
      invested: dom.investedXPDisplay,
      transi: dom.transitionXP,
    },
    level: {
      current: dom.levelCurrent,
      future: dom.levelFuture,
      transi: dom.levelTransition,
    },
    attributs: {},
    archetypeLabel: dom.archetypeLabel,
    archetypeDesc: dom.archetypeDesc,
    graphCtx: dom.graphCanvas?.getContext('2d'),
    gauge: dom.gauge,
  };

nodes.statsRoot =
  document.querySelector(`#codex-entity_${entite.id} .entity-stats-section.left`)
  || document.querySelector(`.entity-stats-section.left[data-entity-id="${entite.id}"]`)
  || document.querySelector(".entity-stats-section.left")
  || document.body;

  dom.attributibutUp.innerHTML = '';
  for (const attribut of attributS) {
    const line = buildattributibutLine(attribut, state.stats[attribut.key], entite);
    dom.attributibutUp.appendChild(line);
    nodes.attributs[attribut.short] = {
      line,
      left:  line.querySelector('.left-arrow'),
      right: line.querySelector('.right-arrow'),
      value: line.querySelector('.axis-value-display')
    };
  }

  function updateHeader() {
    // 💰 XP
    nodes.xp.initial.textContent  = `${state.xpBaseline}`;
    nodes.xp.player.textContent   = `${state.tempXP}`;
    nodes.xp.invested.textContent = `- ${state.xpBaseline - state.tempXP} XP`;

    const entityMaxLevel = getEntityLevelMax(entite);
    const nextCost = costAt(costMap, state.tempLevel + 1);

    nodes.cost.textContent =
      state.tempLevel >= entityMaxLevel
        ? `Niveau maximum atteint (${entityMaxLevel})`
        : (nextCost != null
            ? `Coût prochain lvl. : ${nextCost} XP`
            : `Niveau maximum atteint (${entityMaxLevel})`);

    const hasHistory = state.history.length > 0;
    setInvisible(nodes.xp.player,   !hasHistory);
    setInvisible(nodes.xp.invested, !hasHistory);
    setInvisible(nodes.xp.transi,   !hasHistory);

    const baseLevel = getEntityLevelCurrent(entite);
    nodes.level.current.textContent = baseLevel;
    nodes.level.future.textContent  = state.tempLevel;

    document
      .querySelectorAll(`[data-stat="lvl"][data-entity-id="${entite.id}"]`)
      .forEach(el => el.textContent = baseLevel);

    const raised = state.tempLevel > baseLevel;
    setInvisible(nodes.level.transi, !raised);
    setInvisible(nodes.level.future, !raised);
    nodes.level.future.classList.toggle('augmented', raised);
  }
  function updateArrows() {
    const entityMaxLevel = getEntityLevelMax(entite);
    const canUp =
      state.tempLevel < entityMaxLevel &&
      state.tempXP >= (costAt(costMap, state.tempLevel + 1) ?? Infinity);

    for (const short in nodes.attributs) {
      const a = nodes.attributs[short];
      setInvisible(a.right, !canUp);
      a.line.classList.toggle('can-invest', canUp);
      a.line.querySelector('.axis-line')?.classList.toggle('can-invest', canUp);

      const last = state.history[state.history.length - 1];
      const isLast = !!last && last.short === short;
      setInvisible(a.left, !isLast);
      a.line.classList.toggle('can-uninvest', isLast);
      a.line.querySelector('.axis-line')?.classList.toggle('can-uninvest', isLast);
    }
  }


  function updateButtons() {
    const hasHistory = state.history.length > 0;
    setInvisible(nodes.confirm, !hasHistory);
    setInvisible(nodes.clear,   state.history.length <= 1);
  }


  const GAUGE_ANIM_DELAY = 450;  // délai pour la grosse jauge seulement
  let archetypeUpdateTimeout = null;
  let awakeningPresentationPending = false;

  function getActiveArchetypeKey(levelOverride = null, statsOverride = null) {
  return getActiveLevelUpArchetypeKey(state, entite, levelOverride, statsOverride);
}

  function renderAll(mode = 'normal', prevKey = null, nextKey = null) {
    // Annule un éventuel timeout en cours
    if (archetypeUpdateTimeout) {
      clearTimeout(archetypeUpdateTimeout);
      archetypeUpdateTimeout = null;
    }

    const changed =
      prevKey &&
      nextKey &&
      prevKey !== nextKey;

    // Bloc commun, toujours synchro
    updateHeader();
    updateArrows();
    updateButtons();
    updategraph(state, nodes);
    soulScaling(state.tempLevel);

    // Progress is saved immediately; the first awakened archetype is revealed with the GIF.
    if (awakeningPresentationPending) return;

    // 🔹 NOM & DESCRIPTION D’ARCHETYPE → tout de suite
    updateArchetypeBadge(state, nodes);

    // 🔹 MILESTONES (petits jalons) → tout de suite aussi
    updateArchetypeMilestones(state, nodes);

    // Pas de changement d’archetype → on met à jour la jauge normalement
    if (!changed || mode === 'normal') {
      updateArchetypeGauge(state, nodes);
      return;
    }

    // Changement d’archetype : seule la GROSSE jauge est décalée
    archetypeUpdateTimeout = setTimeout(() => {
      updateArchetypeGauge(state, nodes);
      archetypeUpdateTimeout = null;
    }, GAUGE_ANIM_DELAY);
  }

  dom.levelUpSection._refreshStats = current => {
    if (String(current?.id) !== String(entite.id) || !current.baseStats || !current.stats) return;
    if (current !== entite) {
      // Rebase the open draft on committed gains while keeping its choices and investment history.
      for (const key of ['baseStats', 'baseStatSources', 'stats', 'stuff', 'resourceStocks',
        'armorLayers', 'extraLifeRegen', 'eternalLifeRegen']) {
        if (current[key] === undefined) delete entite[key];
        else entite[key] = structuredClone(current[key]);
      }
      entite.modifierStats ??= {};
      entite.modifierStats.durable = structuredClone(current.modifierStats?.durable || {});
      entite.battleBoosts = current.battleBoosts;
      if (entite.level && typeof entite.level === 'object') entite.level.max = current.level?.max ?? entite.level.max;
    }
    const root = dom.levelUpSection.closest('.codex-entity-scan') || dom.levelUpSection;
    refreshActiveStatPreview(entite, root);
    state.stats = getLevelUpAttributes(entite, true);
    for (const attribut of attributS) nodes.attributs[attribut.short].value.textContent = state.stats[attribut.key];
    renderAll();
  };

// Prepare l'etat eveille avant la confirmation synchrone des niveaux.

  // 🔒 / 🔓 Blocage global des flèches et boutons de niveau
  function setArchetypeUIBlocked(block) {
    const arrows = dom.levelUpSection.querySelectorAll(".xp-arrow");
    const lvlButtons = dom.levelUpSection.querySelectorAll(".confirm-button");

    arrows.forEach(el => {
      el.style.pointerEvents = block ? "none" : "auto";
      el.style.opacity = block ? "0" : "1";
    });

    lvlButtons.forEach(btn => {
      btn.style.pointerEvents = block ? "none" : "auto";
      btn.style.opacity = block ? "0.2" : "1";
    });
  }
  // 🎯 Résolution complète d'un cycle terminé (normal vs éveil)
async function resolveArchetypeCycleCompletion(
  name,
  entite,
  cycleLen,
  prevLevel,
  prevStage,
  config = {}
) {
  const isAwakeningScenario =
    entite.archetypeFrozen !== true && (config.awakening ?? (name === "egare" && !state.awakened));
  if (entite.archetypeFrozen === true && name === 'egare') {
    completeLevelUpArchetypeCycle(state, entite, name, cycleLen, prevLevel, false);
    return;
  }

  const createMilestone =
    config.createMilestone ?? !isAwakeningScenario;

  const baseAnimMs = 2000;
  const extraBlockMs =
    config.extraBlockMs ?? (isAwakeningScenario ? 8000 : 0);

  if (!isAwakeningScenario) {
    if (typeof startArchup === "function") startArchup();
    await new Promise(res => setTimeout(res, baseAnimMs));
    if (!dom.levelUpSection.isConnected) return;
  }

  if (isAwakeningScenario) awakeningPresentationPending = true;
  completeLevelUpArchetypeCycle(state, entite, name, cycleLen, prevLevel, isAwakeningScenario);
  if (isAwakeningScenario) {
    const graphContainer = dom.levelUpSection.querySelector('.attribut-graph-container');
    // Hide the frame before confirmation can remove the stray styling.
    graphContainer?.classList.add('awakening-frame-pending');
    // Commit before any timer: closing, navigating or reloading cannot interrupt awakening.
    confirmLevelUp();
    graphContainer?.classList.add('stray');
    setArchetypeUIBlocked(true);
    if (typeof startArchup === "function") startArchup();
    await new Promise(res => setTimeout(res, baseAnimMs));
    if (!dom.levelUpSection.isConnected) return;

    playAwakeningExtasis(entite, { onReveal: () => {
      if (dom.levelUpSection.isConnected) graphContainer?.classList.remove('stray');
    } });

    // Reveal the archetype two seconds before controls return, independently of the frame.
    setTimeout(() => {
      if (!dom.levelUpSection.isConnected) return;
      awakeningPresentationPending = false;
      renderAll();
      setArchetypeUIBlocked(true);
    }, Math.max(0, extraBlockMs - 2000));

  }

  // 🎯 icône de jalon (preview) sauf en cas d’éveil
  if (createMilestone) {
    const milestoneKey   = name;
    const milestoneLevel = prevLevel;

    if (milestoneKey !== "egare") {
      const uid = `preview-${entite.id}-${milestoneKey}-${milestoneLevel}`;
      createArchetypeIcon(entite, milestoneKey, milestoneLevel, uid);

      const icon = document.querySelector(
        `#archetype-icons-${entite.id} [data-archetype-uid="${uid}"]`
      );
      if (icon) icon.classList.add("preview");
    }
  }

  setTimeout(() => {
    state.lockArchetype = false;
    if (!dom.levelUpSection.isConnected) return;
    setArchetypeUIBlocked(false);
    if (typeof renderAll === "function") renderAll();
  }, extraBlockMs + 1);
}

function getSkippedArchetypeStageInfo(classKey, entite, reason = "skipped") {
  return getSkippedLevelUpArchetypeStage(state, classKey, entite, reason);
}

function advanceArchetypeStage(classKey, entite) {
  const result = advanceLevelUpArchetypeStage(state, classKey, entite);
  if (result?.completed) setArchetypeUIBlocked(true);
  return result;
}


function previewStats(entite) {
  // 🧩 On récupère les stats fusionnées avec les fonctions existantes
  const merged = getPreviewStats(entite);
  const statsContainer = document.querySelector(".entity-stats-section.left");

  // 🔄 Boucle sur les stats connues
  for (const [key, val] of Object.entries(merged)) {
	   if (isAttributeKey(key)) continue;
    const def = STATS_DATA.find(s => s.key === key);
    if (!def) {
      console.warn(`⚠️ [previewStats] Stat "${key}" introuvable dans STATS_DATA`);
      continue;
    }

    const isAttribut = ["strength", "agility", "intelligence"].includes(key);
    const selector = isAttribut
      ? `.stat-container[data-stat="${key}"][data-entity-id="${entite.id}"] .entite-stat`
      : `.entite-stat[data-stat="${key}"][data-entity-id="${entite.id}"]`;

    const existing = document.querySelector(selector);
if (existing) {
let displayVal = isObjStat(val) ? `${val.current} / ${val.max}` : val;

if (key === "speed") {
  const ms = parseFloat(String(val ?? 0));
  displayVal = `${(ms / 1000).toFixed(2)} s`;
}

existing.textContent = displayVal;

} else {
  console.log(`⚠️ [previewStats] Bloc DOM manquant pour "${def.key}", non recréé.`);
}
  }


  // 🔍 Debug
  console.groupCollapsed(`🔍 [previewStats] Stats preview pour entité ${entite.id}`);
  for (const [key, val] of Object.entries(merged)) console.log(`   • ${key} =`, val);
  console.groupEnd();

  return merged;
}

  // ===============================
  // 📈 INVEST
  // ===============================
  function invest(short) {
    const investment = prepareLevelUpInvestment(state, costMap);
    if (!investment) return;
    const { entite, prevKey, nextLevel, cost: c, willFinishEgareCycle } = investment;
    const a = nodes.attributs[short];
    if (!a) return;
    const key = a.line.dataset.key;

    let autoConfirmAfter = false;

    if (willFinishEgareCycle) {
      const ok = window.confirm(
        "Votre entité va s'éveiller.\n" +
        "C'est une opération irréversible.\n\n" +
        "Voulez-vous continuer ?"
      );

      if (!ok) {
        // on n’investit pas ce point
        return;
      }

      // on investit ET on auto-confirmera ensuite
      autoConfirmAfter = true;
    }

    clearEntityStatDeltaClasses(entite.id);

    closeOpenHelpers();

    // 💰 économie + stat principale
    applyLevelUpInvestmentCost(state, c, nextLevel);
    addPreviewStat(entite, key, 1);
    state.stats = getLevelUpAttributes(entite, true);

    // archetype APRÈS investissement (avec stats + niveau à jour)
    const nextKey = getActiveArchetypeKey();

    // progression de cycle pour l’archetype actif après l’investissement
    const info =
      advanceArchetypeStage(nextKey, entite) ||
      getSkippedArchetypeStageInfo(nextKey, entite, "missing-info");
    let {
      level,
      stage,
      cycleName,
      appliedStage,
      cycleLen: cycleLenAfter,
      skipped,
      prevLevel,
      prevStage
    } = info;

    const reward = resolveLevelUpReward(state, short, nextKey, info);
    const { pickKey } = reward;
    if (!skipped) {
      const { attributName, stageName } = reward;
if (pickKey) {
  // 1) Preview de la sous-stat
  addPreviewStat(entite, pickKey, 1);
  (state.subHistory[attributName] ||= []).push(pickKey);

  // parent commun
let statParent =
  document.querySelector(`#codex-entity_${entite.id} .umbra-submenu.new.entity-stats-section`)
  || document.querySelector(`.umbra-submenu.new.entity-stats-section`)
   || nodes.statsRoot
  || document.body;
  if (!statParent) statParent = nodes.statsRoot || document.body;

  // addPreviewStat has already refreshed preview.total, including armor.

  // -------------------------
  // 2) Création du bloc pickKey si absent
  // -------------------------
  const existingStat = document.querySelector(
    `.stat-container[data-stat="${pickKey}"][data-entity-id="${entite.id}"]`
  );

  if (!existingStat) {
    const statDef   = STATS_DATA.find(s => s.key === pickKey);
    const statLabel = statDef ? statDef.name : pickKey;

    // ✅ init valeur base (number par défaut)
    if (entite.stats[pickKey] == null) entite.stats[pickKey] = 0;

    // ✅ IMPORTANT : on passe la valeur BRUTE (number ou objet), PAS fmt()
   createUmbraBlock(
  statParent,
  statLabel,
  () => entite.stats[pickKey],
  entite,
  pickKey,   // forcedStatKey
  false,    // inlineStatName
  null,     // attribut
  true,     // umbra (ou un objet umbra)
  { showMissingAsNew: true, newLineContext: "preview" }
);
    markStatUpgraded(entite, pickKey);
  }

  // -------------------------
  // 3) ✅ Cas spécial : armor n’existe pas MAIS armor.max existe en preview
  // -------------------------
 const previewArmor = entite?.modifierStats?.preview?.generated?.armor;

const hasArmorDelta =
  previewArmor &&
  typeof previewArmor === "object" &&
  (
    Number(previewArmor.current ?? 0) !== 0 ||
    Number(previewArmor.max ?? 0) !== 0
  );

const armorBlockMissing = !document.querySelector(
  `.stat-container[data-stat="armor"][data-entity-id="${entite.id}"]`
);

if (armorBlockMissing && hasArmorDelta) {
  const armorDef = STATS_DATA.find(s => s.key === "armor");
  const armorLabel = armorDef ? armorDef.name : "Armure";

  const permanentArmor =
    entite.stats?.armor && typeof entite.stats.armor === "object"
      ? entite.stats.armor
      : { current: 0, max: 0 };

  createUmbraBlock(
    statParent,
    armorLabel,
    () => permanentArmor,
    entite,
    "armor",
    false,
    null,
    false,
    { showMissingAsNew: true, newLineContext: "preview" }
  );

  renderStatPair(entite, "armor", statParent);
}
// -------------------------
// 3bis) ✅ Cas spécial : extraLife n’existe pas MAIS extraLife est présent en preview
// -------------------------
const previewExtraLife = entite?.modifierStats?.preview?.generated?.extraLife;

const hasExtraLifeDelta =
  previewExtraLife &&
  typeof previewExtraLife === "object" &&
  (
    Number(previewExtraLife.current ?? 0) !== 0 ||
    Number(previewExtraLife.max ?? 0) !== 0
  );

const extraLifeBlockMissing = !document.querySelector(
  `.stat-container[data-stat="extraLife"][data-entity-id="${entite.id}"]`
);

if (extraLifeBlockMissing && hasExtraLifeDelta) {
  const extraDef = STATS_DATA.find(s => s.key === "extraLife");
  const extraLabel = extraDef ? extraDef.name : "Vie supplémentaire";

  const permanentExtraLife =
    entite.stats?.extraLife && typeof entite.stats.extraLife === "object"
      ? entite.stats.extraLife
      : { current: 0, max: 0 };

  createUmbraBlock(
    statParent,
    extraLabel,
    () => permanentExtraLife,
    entite,
    "extraLife",
    false,
    null,
    false,
    { showMissingAsNew: true, newLineContext: "preview" }
  );

  renderStatPair(entite, "extraLife", statParent);
}

// -------------------------
// 3ter) ✅ Cas spécial : charge n’existe pas MAIS charge est présente en preview
// -------------------------
const previewCharge =
  entite?.modifierStats?.preview?.total?.charge;
const permanentCharge = Number(entite.stats?.charge ?? 0) || 0;

const hasChargeDelta = Number(previewCharge ?? permanentCharge) !== permanentCharge;

const chargeBlockMissing = !document.querySelector(
  `.stat-container[data-stat="charge"][data-entity-id="${entite.id}"]`
);

if (chargeBlockMissing && hasChargeDelta) {
  const chargeDef = STATS_DATA.find(s => s.key === "charge");
  const chargeLabel = chargeDef ? chargeDef.name : "Charge";

  createUmbraBlock(
    statParent,
    chargeLabel,
    () => permanentCharge,
    entite,
    "charge",
    false,
    null,
    false,
    { showMissingAsNew: true, newLineContext: "preview" }
  );

  renderStatPair(entite, "charge", statParent);
}
} else {
  console.warn(`[invest] Pas de sous-stat trouvée pour ${nextKey} (${stageName})`);
}


    }

    // 🧾 Historique
    state.history.push({
      short,
      archetypeKey: nextKey,
      level,
      stage,
      prevLevel,
      prevStage,
      subKey: pickKey
    });

    // 🎨 UI / stats / preview...
    a.value.textContent = state.stats[key];
   if (!isAttributeKey(key)) {
  renderStatPair(entite, key, nodes.statsRoot);
}
    if (pickKey) {
  const pickBlock = document.querySelector(`.stat-container[data-stat="${pickKey}"][data-entity-id="${entite.id}"]`);
  const pickRoot = pickBlock?.closest(".entity-stats-section") || nodes.statsRoot || document.body;
  renderStatPair(entite, pickKey, pickRoot);
}

refreshActiveStatPreview(entite, nodes.statsRoot, { recalculate: false });

/*
 * Si strength ou indestructibility ont changé,
 * hpBattleRegen doit être immédiatement recalculée et affichée.
 */
refreshPreviewHpBattleRegen(entite, nodes.statsRoot);

    // 👉 rendu avec gestion du délai :
    //    - si prevKey === nextKey → pas de délai
    //    - si arch change       → invest = jauge d'abord, label après
    renderAll('invest', prevKey, nextKey);

    // marquage visuel
    document.querySelectorAll('.stat-container.last-substat')
      .forEach(el => el.classList.remove('last-substat'));
    document.querySelectorAll('.stat-container.last-attribut')
      .forEach(el => el.classList.remove('last-attribut'));

    const subContainer = pickKey
      ? document.querySelector(`.stat-container[data-stat="${pickKey}"][data-entity-id="${entite.id}"]`)
      : null;
    const attrContainer = document.querySelector(
      `.stat-container[data-stat="${key}"][data-entity-id="${entite.id}"]`
    );

    if (subContainer)  subContainer.classList.add('last-substat');
    if (attrContainer) attrContainer.classList.add('last-attribut');

    if (entite.modifierStats?.preview?.statLeveled) {
      saveUpgradedEntity(entite);
      console.log(`💾 Preview sauvegardée pour ${entite.name} (${entite.id})`);
    }

    // Resolve only once the final point, its sub-stat and milestone are complete.
    if (info.completed) {
      void resolveArchetypeCycleCompletion(nextKey, entite, cycleLenAfter, prevLevel, prevStage, {
        awakening: autoConfirmAfter,
      });
    }
  }

  // ===============================
  // 📉 UNINVEST
  // ===============================
  function uninvest(short) {
    const entite = state.currentEntity;
    if (!entite) return;

    if (!state.history.length) return;

    const last = state.history[state.history.length - 1];
    if (!last || last.short !== short) return;

    const a = nodes.attributs[short];
    if (!a) return;

    const key = a.line.dataset.key;
    const backLevel = state.tempLevel;
    const c = costAt(costMap, backLevel);
    if (c == null) return;

    closeOpenHelpers();
    clearEntityStatDeltaClasses(entite.id);

    // archetype AVANT le désinvestissement
    const prevKey = getActiveArchetypeKey();

    // 🧹 suppression éventuelle d’icône de jalon
    const justFinishedCycle = last.stage > last.prevStage;
    if (justFinishedCycle) {
      const uidToRemove = `preview-${entite.id}-${last.archetypeKey}-${last.prevLevel}`;
      const icon = document.querySelector(
        `#archetype-icons-${entite.id} [data-archetype-uid="${uidToRemove}"]`
      );
      if (icon) icon.remove();
    }

    // ==========================
    // ROLLBACK NIVEAU
    // ==========================
    refundLevelUpInvestmentCost(state, c);
    removePreviewStat(entite, key);
    state.stats = getLevelUpAttributes(entite, true);

    // ==========================
    // ROLLBACK ARCHETYPE
    // ==========================
    restoreLevelUpArchetypeStage(state, last);

    // ==========================
    // ROLLBACK SOUS-STAT
    // ==========================
    const attributName = attribut_SHORT_TO_NAME[short];

    if (last.subKey) {
      removePreviewStat(entite, last.subKey);

      const arr = state.subHistory[attributName];
      if (Array.isArray(arr) && arr.length) arr.pop();

      const currentVal = entite.stats[last.subKey] ?? 0;
      const previewVal = entite.modifierStats?.preview?.statLeveled?.[last.subKey] ?? 0;

      if (currentVal <= 0 && previewVal <= 0) {
        const domStat = document.querySelector(
          `.stat-container[data-stat="${last.subKey}"][data-entity-id="${entite.id}"]`
        );
        if (domStat) domStat.remove();
      }
    }

    // ==========================
    // HISTORIQUE & UI
    // ==========================
    state.history.pop();
    a.value.textContent = state.stats[key];
if (!isAttributeKey(key)) {
  renderStatPair(entite, key, nodes.statsRoot);
}
   if (last.subKey) {
  const subBlock = document.querySelector(
    `.stat-container[data-stat="${last.subKey}"][data-entity-id="${entite.id}"]`
  );
  const subRoot = (subBlock && subBlock.closest(".entity-stats-section"))
    || nodes.statsRoot
    || document.body;

  renderStatPair(entite, last.subKey, subRoot);
}
refreshActiveStatPreview(entite, nodes.statsRoot, { recalculate: false });

refreshPreviewHpBattleRegen(
  entite,
  nodes.statsRoot
);

    // archetype APRÈS le désinvestissement
    const nextKey = getActiveArchetypeKey();

    // 👉 rendu avec gestion du délai :
    //    - uninvest = archétype tout de suite, jauge après si changement
    renderAll('uninvest', prevKey, nextKey);

    // 🌟 Mise à jour du marquage visuel
    document.querySelectorAll('.stat-container.last-substat')
      .forEach(el => el.classList.remove('last-substat'));

    document.querySelectorAll('.stat-container.last-attribut')
      .forEach(el => el.classList.remove('last-attribut'));

    const prev = state.history[state.history.length - 1];
    if (prev) {
      const prevAttr = nodes.attributs[prev.short];
      if (prevAttr) {
        const prevKeyAttr = prevAttr.line.dataset.key;
        const attrContainer = document.querySelector(
          `.stat-container[data-stat="${prevKeyAttr}"][data-entity-id="${entite.id}"]`
        );
        if (attrContainer) attrContainer.classList.add('last-attribut');
      }

      if (prev.subKey) {
        const subContainer = document.querySelector(
          `.stat-container[data-stat="${prev.subKey}"][data-entity-id="${entite.id}"]`
        );
        if (subContainer) subContainer.classList.add('last-substat');
      }
    }

    if (entite.modifierStats?.preview?.statLeveled) {
      saveUpgradedEntity(entite);
    }
  }

// UPGRADE ARROW LVL ECOUTEUR
dom.levelUpSection.addEventListener('click', (e) => {
  const arrow = e.target.closest('.xp-arrow');
  if (!arrow || !dom.levelUpSection.contains(arrow)) return;

  const line = arrow.closest('.axis-line');
  const short = line?.dataset.short;
  if (!short) return;

  // 🟢 Invest / Uninvest
  if (arrow.classList.contains('right-arrow')) {
    invest(short);
  } else if (arrow.classList.contains('left-arrow')) {
    uninvest(short);
  }

  // invest/uninvest already save the updated draft once.
});

// Clear all : rejoue tous les uninvest dans l'ordre inverse
dom.clearBtn.addEventListener('click', () => {
  closeOpenHelpers();
  // On annule TOUT l'historique courant en déroulant les steps à l'envers
  while (state.history.length > 0) {
    const last = state.history[state.history.length - 1];
    if (!last || !last.short) break;
    uninvest(last.short);
  }

  // ❌ NE PLUS TOUCHER state.awakened ICI
  // state.awakened = isEntityAwakened(entite);  // → à supprimer

  // Recalcule la preview et rafraîchit l'UI
  refreshActiveStatPreview(entite, nodes.statsRoot);
  renderAll();
});

// ✅ CONFIRMER LEVEL UP (valide les stats preview et les applique)
dom.confirmButton.addEventListener('click', () => {
  confirmLevelUp();
});

// Rafraîchit le marqueur visuel via comparaison permanent/preview.
function markStatUpgraded(entite, statKey) {
  const block = document.querySelector(
    `.stat-container[data-stat="${statKey}"][data-entity-id="${entite.id}"]`
  );
  if (!block) return;
  renderStatPair(
    entite,
    statKey,
    block.closest(".entity-stats-section") || nodes.statsRoot || document.body
  );
}

// Même logique au retrait : le rendu décide entre up/down/égal.
function unmarkStatUpgraded(entite, statKey) {
  const block = document.querySelector(
    `.stat-container[data-stat="${statKey}"][data-entity-id="${entite.id}"]`
  );
  if (!block) return;
  renderStatPair(
    entite,
    statKey,
    block.closest(".entity-stats-section") || nodes.statsRoot || document.body
  );
}
function refreshPreviewHpBattleRegen(entite, fallbackRoot = null) {
  if (!entite) return;
  const total = entite?.modifierStats?.preview?.total;
  const previewHpBattleRegen = Math.max(0, Number(total?.hpBattleRegen) || 0);
  const permanentHpBattleRegen = Math.max(0, getConfirmedStatValue(entite, "hpBattleRegen", 0));
  let block = document.querySelector(`.stat-container[data-stat="hpBattleRegen"][data-entity-id="${entite.id}"]`);
  const statParent = block?.closest(".entity-stats-section") || fallbackRoot || document.querySelector(`#codex-entity_${entite.id} .umbra-submenu.new.entity-stats-section`) || document.querySelector(`.umbra-submenu.new.entity-stats-section`) || nodes.statsRoot || document.body;

  /*
   * La stat peut apparaître pour la première fois parce que
   * la preview vient de donner de l'indestructibilité.
   */
  if (!block && previewHpBattleRegen > 0) {
    const statDef = STATS_DATA.find(stat => stat.key === "hpBattleRegen");
    const statLabel = statDef?.name || "Régénération de combat";
    createUmbraBlock(
      statParent,
      statLabel,
      () => permanentHpBattleRegen,
      entite,
      "hpBattleRegen",
      false,
      null,
      true,
      { showMissingAsNew: true, newLineContext: "preview" }
    );
    block = document.querySelector(`.stat-container[data-stat="hpBattleRegen"][data-entity-id="${entite.id}"]`);
  }

  if (!block) return;
  const root = block.closest(".entity-stats-section") || statParent;
  renderStatPair(entite, "hpBattleRegen", root);

  /*
   * Si la stat n'existe ni en permanent ni en preview,
   * on retire le bloc créé temporairement.
   */
  if (previewHpBattleRegen <= 0 && permanentHpBattleRegen <= 0) block.remove();
}
function refreshPreviewVitals(entite) {
  ComputeStatPreview(entite);

  let b;

  b = document.querySelector(`.stat-container[data-stat="HP"][data-entity-id="${entite.id}"]`);
  renderStatPair(entite, "HP", b?.closest(".entity-stats-section") || nodes.statsRoot || document.body);

  b = document.querySelector(`.stat-container[data-stat="armor"][data-entity-id="${entite.id}"]`);
  renderStatPair(entite, "armor", b?.closest(".entity-stats-section") || nodes.statsRoot || document.body);

  b = document.querySelector(`.stat-container[data-stat="extraLife"][data-entity-id="${entite.id}"]`);
  renderStatPair(entite, "extraLife", b?.closest(".entity-stats-section") || nodes.statsRoot || document.body);

  b = document.querySelector(`.stat-container[data-stat="charge"][data-entity-id="${entite.id}"]`);
  renderStatPair(entite, "charge", b?.closest(".entity-stats-section") || nodes.statsRoot || document.body);

  b = document.querySelector(`.stat-container[data-stat="dayHpRegen"][data-entity-id="${entite.id}"]`);
  renderStatPair(entite, "dayHpRegen", b?.closest(".entity-stats-section") || nodes.statsRoot || document.body);

  refreshPreviewHpBattleRegen(entite, nodes.statsRoot);
}

function addPreviewStat(entite, statKey, amount = 1) {
  statKey = addLevelUpPreviewStat(entite, statKey, amount);
  if (!statKey) return;

  if (
    statKey === "vitality" ||
    statKey === "robustness" ||
    statKey === "transcendence" ||
    statKey === "weaponMastery" ||
    statKey === "strength" ||
    statKey === "indestructibility" ||
    statKey === "hpBattleRegen"
  ) {
    refreshPreviewVitals(entite);
  } else if (statKey === "velocity") {
    refreshPreviewSpeed(entite);
  } else {
    ComputeStatPreview(entite);
  }

  markStatUpgraded(entite, statKey);
}

function removePreviewStat(entite, statKey, amount = 1) {
  statKey = removeLevelUpPreviewStat(entite, statKey, amount);
  if (!statKey) return;

  if (
    statKey === "vitality" ||
    statKey === "robustness" ||
    statKey === "transcendence" ||
    statKey === "weaponMastery" ||
    statKey === "strength" ||
    statKey === "indestructibility" ||
    statKey === "hpBattleRegen"
  ) {
    refreshPreviewVitals(entite);
  } else if (statKey === "velocity") {
    refreshPreviewSpeed(entite);
  } else {
    ComputeStatPreview(entite);
  }

  unmarkStatUpgraded(entite, statKey);
}
function removeNewStatClasses(entite) {
  const entitySelector = entite?.id
    ? `.stat-container[data-entity-id="${entite.id}"].new`
    : ".stat-container.new";

  document.querySelectorAll(entitySelector).forEach(el => {
    if (isLevelUpNewStatsArea(el)) {
      el.classList.remove("new");
      delete el.dataset.statLineCreatedAsNew;
    }
  });

  document.querySelectorAll('.entite-stat.new-stat').forEach(el => {
    const statKey = el.dataset.stat;
    const entityId = el.dataset.entityId;

    // Supprime la classe "new-stat"
    el.classList.remove('new-stat');

    // Récupère l’entité correspondante si non passée en argument
    const targetEntite = entite || (window.entites?.find(e => e.id == entityId));

    // Vérifie la valeur réelle de la stat
    const statValue =
      targetEntite?.stats?.[statKey] ??
      targetEntite?.modifierStats?.durable?.statLeveled?.[statKey] ??
      targetEntite?.modifierStats?.preview?.statLeveled?.[statKey] ??
      0;

    // Si la stat n’a plus aucune valeur → supprime le conteneur complet
    if ((statValue == null || statValue <= 0) && !ZERO_VALUE_VISIBLE_STAT_KEYS.has(normalizeStatKey(statKey))
      && !getStatMalusSources(targetEntite, statKey).length) {
      const statContainer = el.closest(`.stat-container[data-stat="${statKey}"][data-entity-id="${entityId}"]`);
      if (statContainer) {
        console.log(`🗑️ Suppression stat vide '${statKey}' pour entité ${entityId}`);
        statContainer.remove();
      }
    }
  });
}








  // Init
  dom.initialXPDisplay.textContent = `${playerExperience}`;
  renderAll();
function confirmLevelUp() {
  closeOpenHelpers();
  const confirmation = applyLevelUpPreview(entite, state);
  if (!confirmation) return;
  if (confirmation.error === 'insufficient-xp') {
    window.alert('XP insuffisante. Annulez la prévisualisation ou réactivez le mode admin.');
    return;
  }
  const { payment, statsBeforeConfirm } = confirmation;

  // ✅ Passe les icônes preview -> leveled
  document.querySelectorAll(`#archetype-icons-${entite.id} .archetype-icon.preview`)
    .forEach(icon => {
      const oldUid = icon.dataset.archetypeUid;
      icon.dataset.archetypeUid = oldUid.replace("preview-", "leveled-");
      icon.classList.remove("preview");
      icon.classList.add("leveled");
    });

  // ✅ Nettoyage preview
  delete entite.modifierStats.preview;

  // ✅ Retire upgraded partout
  document
    .querySelectorAll(`.stat-container[data-entity-id="${entite.id}"].upgraded`)
    .forEach(el => el.classList.remove('upgraded'));

  const saveState = snapshotLevelUpSaveState(state);
  saveState.tempLevel = getEntityLevelCurrent(entite);
  saveEntityLevelUP(entite, saveState, payment);
  refreshConfirmedLevelDom(entite);
  refreshLevelUpStateAfterSave(state, entite);

  // ✅ Remet les valeurs d'attributs affichées
  for (const attribut of attributS) {
    const short = attribut.short;
    nodes.attributs[short].value.textContent = state.stats[attribut.key];
  }

  // ✅ Rerender stats
  if (typeof renderAllStats === 'function') {
    renderAllStats(entite, nodes.statsRoot);
  } else {
    Object.keys(entite.baseStats).forEach(k => renderStatPair(entite, k, nodes.statsRoot));
  }

  if (!awakeningPresentationPending) updateArchetypeBadge(state, nodes);
  updategraph(state, nodes);

  // ✅ HP counters + barres + compteur armure
  updateHPCounters(entite.id, entite.stats.HP.current, entite.stats.HP.max);
  updateHealthBar(
    entite.stats.HP.current,
    entite.stats.HP.max,
    entite.stats.armor?.current ?? 0,
    entite.stats.armor?.max ?? 0,
    entite.id
  );
  updateArmorCounter(entite);

  // (Optionnel mais logique si extraLife existe)
  updateBonusLifeCounters(entite);

  if (typeof window !== "undefined" && typeof window.refreshCodexUmbraPanel === "function") {
    window.refreshCodexUmbraPanel(entite, {
      oldStats: statsBeforeConfirm,
      newStats: entite.stats,
    });
  }

  removeNewStatClasses(entite);
  if (typeof updateExperienceDisplay === 'function') updateExperienceDisplay();
  renderAll();
  showStatGainsFromDiff(entite, statsBeforeConfirm);
}

}

function updateArchetypeBadge(state, nodes) {
  if (!nodes.archetypeLabel) return;

  const entite = state.currentEntity;
  const { strength, agility, intelligence } = state.stats;
  const level = state.tempLevel ?? state.level ?? 1;

  // 👉 Seul vrai signal d’éveil : state.awakened
  const awakened = !!state.awakened;

  const keyLower = String(
    getClassFromAttributs(
      strength,
      agility,
      intelligence,
      level,
      awakened,   // tant que false → "egare"
      entite
    )
  ).trim().toLowerCase();

  const meta = CLASS_INDEX[keyLower];
  let name = meta?.name || "Égaré";

  // 🆕 Ajout / retrait de la classe .stray sur le graph container
  if (nodes.graphCtx?.canvas) {
    const graphContainer = nodes.graphCtx.canvas.closest('.attribut-graph-container');
    if (graphContainer) {
      if (keyLower === "egare") {
        graphContainer.classList.add("stray");
      } else {
        graphContainer.classList.remove("stray");
      }
    }
  }
  // --- fin du bloc ajouté ---

  const progress = state.archetypeProgress || {};
  const prog = progress[keyLower] || { level: 1, stage: 0 };
  const archLevel = Math.max(1, prog.level | 0);

  const prevValue = nodes.archetypeLabel.dataset.value || "";
  if (prevValue && prevValue !== name) {
    nodes.archetypeLabel.classList.add("changed");
    clearTimeout(nodes.archetypeLabel._changedTimeout);
    nodes.archetypeLabel._changedTimeout = setTimeout(() => {
      nodes.archetypeLabel.classList.remove("changed");
    }, 1500);
  }

  nodes.archetypeLabel.dataset.value = name;
  nodes.archetypeLabel.innerHTML = "";
  nodes.archetypeLabel.append(document.createTextNode(name));

  if (archLevel > 1) {
    const lvlSpan = document.createElement("span");
    lvlSpan.className = "arch-lvl-label";
    lvlSpan.textContent = " " + toRoman(archLevel);
    nodes.archetypeLabel.appendChild(lvlSpan);
  }

  if (nodes.archetypeDesc) {
    nodes.archetypeDesc.textContent = meta?.description || "";
  }
}

function updateArchetypeGauge(state, nodes) {
  if (!nodes.gauge) return;

  const entite = state.currentEntity;
  const level = state.tempLevel ?? state.level ?? 1;
  const awakened = !!state.awakened;

  const activeName = String(
    getClassFromAttributs(
      state.stats.strength,
      state.stats.agility,
      state.stats.intelligence,
      level,
      awakened,
      entite
    ) || ""
  ).trim().toLowerCase();

  const cycleLen = getCycleLenFor(activeName, entite);
  const prog = state.archetypeProgress[activeName] || { level: 1, stage: 0 };
  const nice = getClassLabel(activeName) || activeName;

  if (cycleLen === 0) {
    nodes.gauge.label.textContent = `${nice} — aucun cycle`;
    nodes.gauge.fill.style.width = '0%';
    return;
  }

  const clampedStage = Math.min(prog.stage, cycleLen);
  const pct = Math.round((clampedStage / cycleLen) * 100);

  nodes.gauge.label.textContent =
    `${nice} ${prog.level} — ${clampedStage}/${cycleLen} · ${pct}%`;

  nodes.gauge.fill.style.width = `${pct}%`;
}

function updateArchetypeMilestones(state, nodes) {
  if (!nodes.gauge?.milestones) return;

  const entite   = state.currentEntity;
  const level    = state.tempLevel ?? state.level ?? 1;
  const awakened = !!state.awakened;

  const activeName = String(
    getClassFromAttributs(
      state.stats.strength,
      state.stats.agility,
      state.stats.intelligence,
      level,
      awakened,
      entite
    ) || ""
  ).trim().toLowerCase();

  const cycle   = getCycleForKey(activeName, entite) || DEFAULT_CYCLE;
  const total   = cycle.length;
  const prog    = state.archetypeProgress[activeName] || { stage: 0, milestones: [] };
  const jalons  = getArchetypeMilestones(activeName, entite);

  const milestoneList = Array.isArray(prog.milestones) ? prog.milestones : [];

  // Keep mounted spheres and their animation timelines while levels are adjusted.
  const existingMilestones = new Map([...nodes.gauge.milestones.children]
    .map(el => [el.dataset.index, el]));

  jalons.forEach(j => {
    const el = existingMilestones.get(String(j.index)) || document.createElement("div");
    existingMilestones.delete(String(j.index));
    el.className = "milestone";
    el.dataset.index = j.index;
    el.querySelector('.gemme')?.remove();

    if (j.stageName) {
      const [nature, lvlStr] = j.stageName.split("-");
      if (nature) {
        el.classList.add(nature);
        if (lvlStr) el.classList.add(`${nature}-${lvlStr}`);
      }
	  // ✅ Shape selon la nature
if (nature === "utilitaire") el.classList.add("shape-round");
else if (nature === "defense") el.classList.add("shape-square");
else if (nature === "attaque") el.classList.add("shape-diamond");
    }

    if (j.level) el.classList.add(`lvl-${j.level}`);

    const stageNumber = j.index + 1;
    const pct = (stageNumber / total) * 100;
    el.style.left = `calc(${pct}% - 6px)`;
    let rewardAttribute = null;

    if (prog.stage >= stageNumber) {
      el.classList.add("filled");

      let attrClass = milestoneList[stageNumber - 1] || null;

      // fallback : on remonte dans l'historique courant si besoin
      if (!attrClass && state.history?.length) {
        const stepEvent = state.history
          .slice()
          .reverse()
          .find(h => h.archetypeKey === activeName && h.stage === stageNumber);

        if (stepEvent && stepEvent.short) {
          attrClass = attribut_SHORT_TO_NAME[stepEvent.short];
        }
      }

      if (attrClass) {
        rewardAttribute = attrClass;
        el.classList.add(attrClass);
        if (j.level !== 3) {
          const gem = document.createElement("div");
          gem.className = `gemme ${attrClass}`;
          el.appendChild(gem);
        }
      }

      if (prog.stage === stageNumber) {
        el.classList.add("last");
        setTimeout(() => el.classList.remove("last"), 1000);
      }
    }

    if (j.level === 3) {
      el.classList.add("has-essence-reward");
      const rewardColor = getMilestoneEssenceColor(rewardAttribute);
      updateMilestoneEssenceElement(el, rewardColor);
      el.dataset.essenceRewardColor = rewardColor || "neutral";
      el.title = buildMilestoneEssenceHelper(Boolean(rewardColor), { preview: true });
    } else {
      el.querySelector('.milestone-essence')?.remove();
      delete el.dataset.essenceRewardColor;
      el.removeAttribute('title');
    }
    if (el.parentElement !== nodes.gauge.milestones) nodes.gauge.milestones.appendChild(el);
  });
  existingMilestones.forEach(el => el.remove());
}
