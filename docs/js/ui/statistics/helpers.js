import { overlayBounds, overlayPoint, overlayRect } from '../viewport.js';
// Stat helper ownership, positioning, focus, nested details and live refresh.
import { gameStorage as localStorage } from "../../storage/sessionStorage.js";
import { readStatisticCalculationPreferences, statisticCalculationChoiceKey,
  saveStatisticCalculationChoice, saveStatisticCalculationDefault } from '../../storage/statisticPreferences.js';
import { getStatSystemResult, STAT_SYSTEM_ORIGINS } from "../../entities/statSystem.js";
import {
  buildAttackPurityHelper,
  buildHypercognitionBonusHelper,
  buildAutonomousConversionHelper,
  buildAutonomousCalculationHelper,
  buildStatHoverCard,
  buildUmbraContributionHelper,
  buildRatioValueHelper,
  buildStatDescriptionHelper,
  selectStatisticHelper,
  buildStatisticOrigins,
  buildImprovementHelperFooter,
  HELPER_TEXT,
  HELPER_PICTOGRAM_NAMES,
  umbraDescription,
  buildStatSourcesHelper,
  buildPlayerStatDescription,
  buildPlayerStatHelper,
  buildUmbraEntryExplanation,
  buildEntityStatTotal,
  buildTechnicalStatCalculation,
  buildUmbraCard,
} from "../../data/helpers.js";
import { getSafe, normalizeStatKey, getDisplayStatKey } from "../../entities/rules.js";
import { entites } from "../../entities/runtime.js";
import { createAttackStatView, getStatContributions } from "../../combat/statistics.js";
import { getStatisticSourceTotals, calculateStatsDisplay, isDisplayableStatContribution } from "./details.js";
import { ComputeStatPreview } from "../../entities/progression.js";
import { stats } from "../../data/statsData.js";
import { EFFECT_VISUALS } from "../../data/effectVisuals.js";
import { cachedResourceUrl } from "../../data/loaderList.js";
import {
  bindDragHelperCleanupGuards,
  clearDragTransientHelpers,
  DRAG_HELPER_CLEANUP_EVENT,
  isDragDropActive,
} from "../drag.js";
import { getStageAccess } from "../../app/state.js";

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

const helperTimers = new Map();

const essenceHoverHelpers = new Set();

const essenceHelperHostObserver = new MutationObserver(mutations => {
  if (!mutations.some(mutation => mutation.removedNodes.length)) return;
  for (const helper of essenceHoverHelpers) {
    if (!helper._helperHost?.isConnected) helper.remove();
    if (!helper.isConnected) essenceHoverHelpers.delete(helper);
  }
  if (!essenceHoverHelpers.size) essenceHelperHostObserver.disconnect();
});

function clearEssenceHoverHelpers() {
  essenceHoverHelpers.forEach(helper => helper.remove());
  essenceHoverHelpers.clear();
  essenceHelperHostObserver.disconnect();
}

const helperEntityByRoot = new WeakMap();

const LEVEL_UP_HELPER_SCOPE = '.level-up-section, .umbra-submenu.entity-stats-section';

const STOCK_HELPER_STATS = new Set(['shift', 'armor', 'fadedLife', 'extraLife', 'eternalLife']);

const ATTRIBUTE_HELPER_STATS = new Set(['strength', 'agility', 'intelligence', 'will']);

// This class is published synchronously by the existing admin mode controller.
const technicalHelpersEnabled = () => document.documentElement.classList.contains('admin-mode-enabled');

function bindHelperEntity(rootEl, entity) {
  if (rootEl instanceof Element && entity) {
    helperEntityByRoot.set(rootEl, entity);
  }
}

function getBoundHelperEntity(fromEl) {
  if (!(fromEl instanceof Element)) return null;
  const statHost = getStatHost(fromEl);
  const currentHelperEntity = entity => {
    if (!entity) return entity;
    const currentArmy = STOCK_HELPER_STATS.has(statHost?.dataset.stat)
      ? (getStageAccess().inStage ? entites : ArmyACache.get()) : null;
    const live = currentArmy
      ? currentArmy.find(candidate => String(candidate.id) === String(entity.id))
      : helperEntityByRoot.get(statHost);
    if (live && String(live.id) !== String(entity.id)) return entity;
    if (!live || live === entity) return entity;
    if (!entity.modifierStats?.preview) return live;
    // Keep the Level up choices, but project them on the current owner's equipment and reserves.
    const view = { ...live, modifierStats: { ...live.modifierStats, preview: structuredClone(entity.modifierStats.preview) } };
    ComputeStatPreview(view);
    return view;
  };

  // Le helper est déclenché depuis des éléments internes,
  // on remonte au root du bloc d’attaque
  const root = fromEl.closest('.attack-details, .attack-light-description');
  if (root) return helperEntityByRoot.get(root) || null;

  // Read the active level-up draft, not the Codex's older entity or a cached tooltip.
  for (let scope = fromEl.closest(LEVEL_UP_HELPER_SCOPE); scope; scope = scope.parentElement?.closest(LEVEL_UP_HELPER_SCOPE)) {
    const entity = currentHelperEntity(helperEntityByRoot.get(scope));
    if (!entity) continue;
    return {
      ...entity,
      stats: entity.modifierStats?.preview?.total || entity.stats,
      modifierStats: entity.modifierStats,
    };
  }
  if (statHost && helperEntityByRoot.has(statHost)) return currentHelperEntity(helperEntityByRoot.get(statHost));
  const statsPanel = fromEl.closest('.codex-substat-panel--umbra');
  if (statsPanel && helperEntityByRoot.has(statsPanel)) return currentHelperEntity(helperEntityByRoot.get(statsPanel));
  return isPinnableUmbraHost(getStatHost(fromEl))
    ? currentHelperEntity(helperEntityByRoot.get(fromEl.closest('.codex-entity-scan'))) || null : null;
}

const statsByKey = Object.fromEntries(stats.map(s => [s.key, s]));

function normalizeLabel(str) {
  return String(str)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // enlève accents
    .replace(/\s+/g, " ")
    .trim();
}

function findStatKeyFromLabel(label) {
  const target = normalizeLabel(label);
  const match = stats.find(s => normalizeLabel(s.name) === target);
  return match?.key || null;
}

function umbraDetection(statKey) {
  const def = statsByKey[statKey];
  if (!def) return null;
  if (!def.attribut) return null;          // pas d'umbra pour "special"
  if (!def.type || !def.type.includes("-")) return null;

  const [category, lvlStr] = def.type.split("-");
  const level = parseInt(lvlStr, 10);

  if (!category || !Number.isFinite(level)) return null;

  return {
    attribut: def.attribut,   // "force" | "intelligence" | "agilite"
    category,                 // "attaque" | "defense" | "utilitaire"
    level                     // 1..3
  };
}

function getGameBoundsRect() {
  const boundsEl = document.getElementById("game-windows");
  if (boundsEl) {
    const r = boundsEl.getBoundingClientRect();
    return {
      left: r.left + window.scrollX,
      top: r.top + window.scrollY,
      right: r.right + window.scrollX,
      bottom: r.bottom + window.scrollY,
    };
  }

  const left = window.scrollX;
  const top = window.scrollY;
  return { left, top, right: left + window.innerWidth, bottom: top + window.innerHeight };
}

function getVisibleHelperBounds(helperEl, anchorEl, anchor) {
  if (helperEl.closest('#game-shell')) return overlayBounds(helperEl);
  const view = window.visualViewport;
  const left = view?.offsetLeft || 0;
  const top = view?.offsetTop || 0;
  const viewport = { left, top,
    right: left + Math.min(view?.width ?? window.innerWidth, document.documentElement.clientWidth || window.innerWidth),
    bottom: top + Math.min(view?.height ?? window.innerHeight, window.innerHeight) };
  const host = helperEl._parentHelper?._helperHost || anchorEl;
  if (!host.closest('#game-windows') || helperEl.matches('.attack-mastery-hover, .combat-attack-hover')) return viewport;
  const game = getGameBoundsRect();
  const visible = {
    left: Math.max(viewport.left, game.left - window.scrollX),
    top: Math.max(viewport.top, game.top - window.scrollY),
    right: Math.min(viewport.right, game.right - window.scrollX),
    bottom: Math.min(viewport.bottom, game.bottom - window.scrollY),
  };
  // Overlays can be outside the game board; their helpers still fit the viewport.
  return visible.right > visible.left && visible.bottom > visible.top
    && anchor.right > visible.left && anchor.left < visible.right
    && anchor.bottom > visible.top && anchor.top < visible.bottom ? visible : viewport;
}

function fitUmbraCardText(helper) {
  const title = helper.querySelector('.umbra-title-card');
  const titleContent = title?.querySelector('.umbra-title-content');
  if (titleContent) {
    titleContent.style.fontSize = '';
    const css = getComputedStyle(title);
    const availableWidth = title.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
    const availableHeight = title.clientHeight - parseFloat(css.paddingTop) - parseFloat(css.paddingBottom);
    const size = overlayRect(helper, titleContent);
    const scale = Math.min(1, availableWidth / size.width, availableHeight / size.height);
    if (scale > 0 && scale < 1) titleContent.style.fontSize = `${parseFloat(getComputedStyle(titleContent).fontSize) * scale * .98}px`;
  }
  for (const content of helper.querySelectorAll('.umbra-card-total-content')) {
    const label = content.querySelector('.umbra-card-total-label');
    const line = content.querySelector('.helper-calculation');
    if (!line) continue;
    const lines = [label, line].filter(Boolean);
    for (const element of lines) element.style.fontSize = '';
    const css = getComputedStyle(content);
    const available = content.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
    const height = content.clientHeight - parseFloat(css.paddingTop) - parseFloat(css.paddingBottom);
    if (available <= 0 || height <= 0) continue;
    // Frames never grow: fit each line to the fixed inner width, then fit
    // their combined height. Re-measure after font loading and live updates.
    if (label && label.scrollWidth > available) {
      label.style.fontSize = `${parseFloat(getComputedStyle(label).fontSize) * available / label.scrollWidth * .98}px`;
    }
    const figure = line.querySelector('.helper-figure');
    const required = figure ? overlayRect(helper, figure).width : 0;
    if (required > available) {
      line.style.fontSize = `${parseFloat(getComputedStyle(line).fontSize) * available / required * .98}px`;
    }
    const requiredHeight = lines.reduce((sum, element) => sum + overlayRect(helper, element).height, 0);
    if (requiredHeight > height) {
      const scale = height / requiredHeight * .98;
      for (const element of lines) element.style.fontSize = `${parseFloat(getComputedStyle(element).fontSize) * scale}px`;
    }
  }
}

function placeHelperInBounds(helperEl, anchorEl, { offset = 5, margin = 8, preservePosition = false } = {}) {
  if (!helperEl.isConnected || !anchorEl?.isConnected) return;
  const anchor = overlayRect(helperEl, anchorEl);
  const bounds = getVisibleHelperBounds(helperEl, anchorEl, anchor);
  const nested = Boolean(helperEl._parentHelper?.isConnected);
  const naturalCard = helperEl.classList.contains('umbra-helper-card') && ['bloodFury', 'ambidextry', 'esoterism'].includes(helperEl.dataset.stat);
  const width = Math.max(1, bounds.right - bounds.left - margin * 2);
  const previousTop = preservePosition ? parseFloat(helperEl.style.top) : NaN;
  const previousLeft = preservePosition ? parseFloat(helperEl.style.left) : NaN;
  const fixedTop = !nested && Number.isFinite(previousTop) ? Math.max(bounds.top + margin, previousTop) : null;
  const height = Math.max(1, bounds.bottom - margin - (naturalCard ? bounds.top + margin : fixedTop ?? bounds.top + margin));
  const visibility = helperEl.style.visibility;
  const framed = helperEl.classList.contains('umbra-helper-card');
  helperEl._helperMeasureStyle ??= { width: helperEl.style.width, minWidth: helperEl.style.minWidth };
  // Measure at a neutral position, then freeze the width before moving. Auto width
  // at the final left edge would otherwise reflow the text after the height check.
  Object.assign(helperEl.style, {
    visibility: 'hidden', position: 'fixed', boxSizing: 'border-box',
    transitionProperty: 'opacity', right: 'auto', bottom: 'auto',
    left: `${bounds.left + margin}px`, top: `${bounds.top + margin}px`,
    width: helperEl._helperMeasureStyle.width, minWidth: helperEl._helperMeasureStyle.minWidth,
    maxWidth: `${width}px`, maxHeight: nested || naturalCard ? 'none' : `${height}px`,
    overflowX: nested ? 'visible' : '', overflowY: framed || nested ? 'visible' : 'auto', transform: '', transformOrigin: 'top left',
    overflowWrap: 'anywhere', whiteSpace: 'normal',
  });
  const minimum = parseFloat(getComputedStyle(helperEl).minWidth) || 0;
  helperEl.style.minWidth = `${Math.min(minimum, width)}px`;
  if (framed) {
    // Measure unwrapped statistic rows at the normal card width, then widen the
    // frame once. This runs only on opening, refresh or layout changes, not ticks.
    const preferred = parseFloat(getComputedStyle(helperEl).width) || 400;
    helperEl.style.width = `${Math.min(preferred, width)}px`;
    const baseWidth = overlayRect(helperEl, helperEl).width;
    let requiredWidth = baseWidth;
    for (const line of helperEl.querySelectorAll('.umbra-effect-heading, .umbra-passive-value, .umbra-effect-sentence .umbra-value-calculation')) {
      const parent = line.parentElement;
      const padding = getComputedStyle(parent);
      const available = parent.clientWidth - parseFloat(padding.paddingLeft) - parseFloat(padding.paddingRight);
      requiredWidth = Math.max(requiredWidth, baseWidth + overlayRect(helperEl, line).width - available);
    }
    helperEl.style.width = `${Math.min(Math.ceil(requiredWidth), width)}px`;
    fitUmbraCardText(helperEl);
  } else {
    helperEl.style.width = `${overlayRect(helperEl, helperEl).width}px`;
  }
  if (!framed) fitUmbraCardText(helperEl);
  let size = overlayRect(helperEl, helperEl);
  if ((nested || naturalCard) && size.height > height) {
    // Very long explanations may use more width before placement. Never turn
    // a subhelper into a scroll box just to keep its top level with the source.
    const parent = nested ? overlayRect(helperEl, helperEl._parentHelper) : anchor;
    const sideWidth = Math.max(bounds.right - margin - parent.right - offset,
      parent.left - offset - bounds.left - margin);
    for (const candidate of [Math.min(sideWidth, width), width]) {
      if (size.height <= height || candidate <= size.width) continue;
      helperEl.style.width = `${candidate}px`;
      size = overlayRect(helperEl, helperEl);
    }
  }
  const minLeft = bounds.left + margin;
  const maxLeft = Math.max(minLeft, bounds.right - margin - size.width);
  const minTop = bounds.top + margin;
  const maxTop = Math.max(minTop, bounds.bottom - margin - size.height);
  // Start beside the source, then lift the full natural-height subhelper as far
  // as necessary to keep its bottom visible, including at deeper helper levels.
  let top = fixedTop ?? (nested ? anchor.top : anchor.bottom + offset);
  const above = anchor.top - size.height - offset;
  if (!nested && fixedTop == null && top > maxTop && above >= minTop) top = above;
  let left = Number.isFinite(previousLeft) ? previousLeft : anchor.left;
  if (nested) {
    const parent = overlayRect(helperEl, helperEl._parentHelper);
    if (parent.right + offset + size.width <= bounds.right - margin) left = parent.right + offset;
    else if (parent.left - offset - size.width >= minLeft) left = parent.left - offset - size.width;
  }
  helperEl.style.left = `${Math.min(Math.max(left, minLeft), maxLeft)}px`;
  helperEl.style.top = `${Math.min(Math.max(top, minTop), maxTop)}px`;
  helperEl.style.visibility = visibility;
}

function revealPositionedHelper(helper, { nextFrame = false } = {}) {
  const reveal = () => {
    const anchor = helper._sourceAnchor || helper._helperHost;
    if (!helper.isConnected || !anchor?.isConnected) return;
    placeHelperInBounds(helper, anchor);
    helper.style.visibility = 'visible';
    helper.style.opacity = '1';
  };
  // A newly used font can change wrapping. Keep the first paint hidden until it
  // is measurable; an already-open helper is not hidden for unrelated font loads.
  const style = getComputedStyle(helper);
  const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const text = helper.textContent || ' ';
  if (helper.style.visibility === 'hidden' && document.fonts?.status === 'loading' && !document.fonts.check(font, text)) {
    if (!helper._helperFontPending) {
      helper._helperFontPending = true;
      const finish = () => {
        helper._helperFontPending = false;
        requestAnimationFrame(reveal);
      };
      document.fonts.load(font, text).then(finish, finish);
    }
  } else if (nextFrame) {
    requestAnimationFrame(reveal);
  } else {
    reveal();
  }
}

const HELPER_GLOBAL_ENTITY_ID = "__global__";

const DESTROYED_CHEST_HELPER_TEXT = HELPER_TEXT.destroyedChest;

const DESTROYED_CORPSE_HELPER_TEXT = HELPER_TEXT.destroyedCorpse;

function destroyedLootSubject(target) {
  if (!(target instanceof Element)) return null;

  const destroyedCorpse = target.closest(".destroyed-corpse");
  if (destroyedCorpse) {
    return {
      type: "corpse",
      element: destroyedCorpse,
      text: DESTROYED_CORPSE_HELPER_TEXT,
    };
  }

  const chestLoot = target.closest(".chest-loot.destroyed");
  const chestContainer = chestLoot?.closest?.(".chest-container[data-chest-id]");
  const isDestroyedChest = chestContainer && (
    chestContainer.dataset.chestStatus === "destroyed" ||
    chestContainer.dataset.durabilityState === "destroyed"
  );
  if (isDestroyedChest) {
    return {
      type: "chest",
      element: chestLoot,
      text: DESTROYED_CHEST_HELPER_TEXT,
    };
  }

  return null;
}

function hideDestroyedLootHelper() {
  document.querySelector(".Game-helper .destroyed-loot-helper")?.remove();
}

function showDestroyedLootHelper(subject) {
  const container = document.querySelector(".Game-helper");
  if (!container || !subject) return;

  hideDestroyedLootHelper();

  const helper = document.createElement("div");
  helper.className = `destroyed-loot-helper ${subject.type}`;
  helper.textContent = subject.text;
  container.appendChild(helper);
}

function placeDestroyedLootHelperAtPointer(helperEl, event, { offset = 12, margin = 8 } = {}) {
  const bounds = overlayBounds(helperEl);
  const helperRect = overlayRect(helperEl, helperEl);
  const helperW = helperRect.width;
  const helperH = helperRect.height;

  const pointer = overlayPoint(helperEl, Number(event?.clientX), Number(event?.clientY));
  let left = pointer.x + offset;
  let top = pointer.y + offset;

  if (!Number.isFinite(left)) left = bounds.left + margin;
  if (!Number.isFinite(top)) top = bounds.top + margin;

  const maxLeft = Math.max(bounds.left + margin, bounds.right - margin - helperW);
  const maxTop = Math.max(bounds.top + margin, bounds.bottom - margin - helperH);

  helperEl.style.left = `${Math.min(Math.max(left, bounds.left + margin), maxLeft)}px`;
  helperEl.style.top = `${Math.min(Math.max(top, bounds.top + margin), maxTop)}px`;
}

function getStatHost(target) {
  if (!(target instanceof Element)) return null;
  const orfevreDetail = target.closest('[data-stat="orfevre-detail"]');
  if (orfevreDetail) return orfevreDetail;
  return target.closest(".stat-container") || target.closest("[data-stat]");
}

function resolveEntityId(host) {
  const id =
    host?.dataset?.entityId ||
    host?.closest?.("[data-entity-id]")?.dataset?.entityId ||
    window.focusedEntity?.id ||
    window.selectedEntity?.id ||
    window.currentEntity?.id ||
    HELPER_GLOBAL_ENTITY_ID;

  return String(id);
}

function findEntityById(army, entityId) {
  if (!Array.isArray(army) || !entityId || entityId === HELPER_GLOBAL_ENTITY_ID) return null;

  // Compare robuste string/string (et compat si un côté est number)
  return (
    army.find(ent => String(ent?.id) === String(entityId)) ||
    army.find(ent => String(ent?.id) === String(Number(entityId)))
  );
}

const ArmyACache = (() => {
  let raw = null;
  let parsed = [];
  return {
    get() {
      const next = localStorage.getItem("selectedArmyA") || "[]";
      if (next !== raw) {
        raw = next;
        try { parsed = JSON.parse(next) || []; } catch { parsed = []; }
      }
      return parsed;
    },
    invalidate() { raw = null; },
  };
})();

const cssEscape = (s) => {
  // CSS.escape n'est pas dispo partout
  if (window.CSS && typeof CSS.escape === "function") return CSS.escape(String(s));
  return String(s).replace(/["\\]/g, "\\$&");
};

let __helperRootCounter = 0;

function getOrCreateRootUid(rootEl) {
  if (!(rootEl instanceof Element)) return "no-root";
  if (!rootEl.dataset.helperRootUid) {
    __helperRootCounter += 1;
    rootEl.dataset.helperRootUid = `root-${__helperRootCounter}`;
  }
  return rootEl.dataset.helperRootUid;
}

function getStatValue(entity, statKey) {
  if (!entity) return null;
  return getSafe(entity, statKey, null);
}

function compactAutonomousHelper(content, calculated, statName) {
  const details = [];
  const calculations = [...content.content.querySelectorAll('.helper-calculation')]
    .filter(node => !node.parentElement?.closest('.helper-calculation'));
  for (const calculation of calculations) {
    const result = calculation.querySelector(':scope > .helper-calculation-result');
    if (!result || result.hasAttribute('data-umbra-summary')) continue;
    const keys = [...new Set([...calculation.querySelectorAll('[data-umbra-calculation]')]
      .map(node => node.dataset.umbraCalculation))];
    const model = keys.length === 1 ? calculated.umbraHelperCalculations?.[keys[0]] : null;
    const originalDetail = calculation.querySelector(':scope > .helper-calculation-detail');
    if (!model && !originalDetail) continue;
    const html = model ? buildAutonomousCalculationHelper(model, result.outerHTML, statName || model.name) : calculation.outerHTML;
    if (model) result.dataset.umbraCalculation = keys[0];
    result.dataset.autonomousCalculation = String(details.length);
    result.tabIndex = 0;
    details.push({ html, rounded: !model?.contributions && !model?.kind
      && (model?.parts.some(part => part.rounded) || calculation.dataset.helperRounded === 'true') });
    const storedDetail = document.createElement('template');
    storedDetail.dataset.autonomousDetail = result.dataset.autonomousCalculation;
    storedDetail.innerHTML = html;
    calculation.replaceChildren(result, storedDetail);
  }
  return { ...calculated, helpContent: content.innerHTML, autonomousDetails: details };
}

function readStatLabel(host, { base = false } = {}) {
  const name = host.querySelector('.stat-name');
  if (!name) return '';
  let text = base ? name.dataset.baseLabel : null;
  if (!text) {
    const label = name.cloneNode(true);
    for (const marker of label.querySelectorAll('.stat-curse-marker')) marker.remove();
    text = label.textContent;
  }
  return base
    ? text.trim().replace(/(?:\s*[:!+◇◆Ω]|\s+X)+$/u, '').trim()
    : text.trim().replace(/\s*:\s*$/, '');
}

function readStatHelperContent(host, statKey, entity) {
  if (host.matches('.stuff-stat-row')) {
    const helpContent = host.dataset.helperText || '';
    return { calculated: { helpContent }, helperHTML: helpContent };
  }
  let statValue = getStatValue(entity, statKey);
  for (const field of ['timingDetail', 'orfevreDetail']) {
    if (!host.dataset[field]) continue;
    try { statValue = JSON.parse(host.dataset[field]); }
    catch (error) { console.warn(`Invalid ${field}`, error); }
  }
  // Autonomous helpers need the live model, including sources and preview states.
  const directHelperHTML = host.dataset.autonomousHelper === 'true' ? '' : String(host.dataset.helperText || '').trim();
  const liveStat = isPinnableUmbraHost(host) || (host.closest(LEVEL_UP_HELPER_SCOPE)
    && stats.some(stat => normalizeStatKey(stat.key) === normalizeStatKey(statKey)));
  const attributeHelper = liveStat && ATTRIBUTE_HELPER_STATS.has(normalizeStatKey(statKey));
  let calculated = directHelperHTML && !liveStat
    ? { helpContent: directHelperHTML, ambianceContent: String(host.dataset.helperAmbiance || '').trim() }
    : statKey === 'attackHypercognitionBonus'
      ? { helpContent: buildHypercognitionBonusHelper(calculateStatsDisplay('cognitiveExplosion', entity || null)) }
      : calculateStatsDisplay(statKey, entity || null, statValue);
  if (host.dataset.statEffect) calculated = selectStatisticHelper(calculated, host.dataset.statEffect);
  if (!calculated.helpContent) {
    const definition = stats.find(stat => normalizeStatKey(stat.key) === normalizeStatKey(statKey));
    const name = definition?.name || HELPER_PICTOGRAM_NAMES[statKey];
    if (name) calculated.helpContent = HELPER_TEXT.statNameFallback(name);
  }
  if (directHelperHTML && liveStat) calculated.ambianceContent = String(host.dataset.helperAmbiance || '').trim();
  let sourcesHTML = directHelperHTML ? '' : statSourcesHelper(entity, statKey);
  const modifiers = directHelperHTML && !liveStat ? [] : getStatContributions(entity, statKey, { includePreview: true, includePlus: true })
    .map(source => ({ ...source, unit: statKey === 'speed' ? ' ms' : calculated.statSystem?.unit || '' }));
  if (attributeHelper || modifiers.some(source => source.malus || source.provenance)
    || (!directHelperHTML && ['fadedLife', 'extraLife', 'eternalLife', 'armor', 'shift'].includes(statKey))) {
    const definition = stats.find(stat => normalizeStatKey(stat.key) === normalizeStatKey(statKey));
    sourcesHTML = buildStatisticOrigins({ compact: true,
      totals: attributeHelper || definition?.nature === 'umbra' ? [] : getStatisticSourceTotals(entity, statKey, calculated),
      statName: definition?.name, modifiers });
  }
  if (host.dataset.autonomousHelper === 'true' && !directHelperHTML) {
    const definition = stats.find(stat => normalizeStatKey(stat.key) === normalizeStatKey(statKey));
    const statName = readStatLabel(host, { base: true }) || definition?.name || HELPER_PICTOGRAM_NAMES[statKey] || statKey;
    const content = document.createElement('template');
    content.innerHTML = calculated.helpContent || '';
    const visibleModels = new Set([...content.content.querySelectorAll('[data-umbra-calculation]')]
      .map(node => node.dataset.umbraCalculation));
    if (visibleModels.has('autonomousConversion')) visibleModels.add('generatedUmbraTarget');
    calculated = { ...calculated, ambianceContent: '', umbraHelperCalculations: Object.fromEntries(
      Object.entries(calculated.umbraHelperCalculations || {}).filter(([key]) => visibleModels.has(key))) };
    sourcesHTML = buildStatisticOrigins({
      compact: true,
      totals: attributeHelper ? [] : getStatisticSourceTotals(entity, statKey, calculated),
      statName,
      modifiers,
    });
    calculated = compactAutonomousHelper(content, calculated, statName);
  }
  const generatedTotal = calculated.umbraHelperCalculations?.[`${calculated.generatedUmbraSource?.target}Total`];
  if (stats.some(stat => stat.key === normalizeStatKey(statKey) && stat.nature === 'umbra')) {
    if (calculated.umbraPresentation) calculated.helpContent = buildUmbraCard(calculated, { admin: technicalHelpersEnabled() });
    const content = document.createElement('template');
    content.innerHTML = calculated.helpContent;
    calculated = compactAutonomousHelper(content, calculated);
    if (content.content.querySelector('.umbra-card-summary-last')) {
      // The card concludes with its own grant and lore; entity composition
      // remains available in the statistic helper.
      sourcesHTML = '';
    } else if (generatedTotal?.system.umbra > 0 && generatedTotal.system.plus !== 0) {
      sourcesHTML = buildStatisticOrigins({ compact: true,
        totals: getStatisticSourceTotals(entity, calculated.generatedUmbraSource.target, calculated),
        statName: generatedTotal.name });
    }
  }
  if (host.dataset.timingDetail && calculated.helperDetails?.timing) {
    const content = document.createElement('template');
    content.innerHTML = calculated.helpContent;
    calculated = compactAutonomousHelper(content, calculated);
    if (host.dataset.timingDetail && calculated.helperDetails?.timing) {
      sourcesHTML = buildStatisticOrigins({ compact: true, totals: calculated.helperDetails.timing.sources });
    }
  }
  const purityHelper = buildAttackPurityHelper(host.closest('[data-purity-level]')?.dataset.purityLevel);
  const definition = stats.find(stat => normalizeStatKey(stat.key) === normalizeStatKey(statKey));
  if (!technicalHelpersEnabled() && !calculated.umbraPresentation && definition
    && !host.dataset.activeEffect && !host.matches('.stuff-stat-row') && !host.dataset.timingDetail) {
    calculated = { ...calculated, helpContent: buildPlayerStatHelper(getDisplayStatKey(statKey), calculated, definition.name), ambianceContent: '' };
  }
  return { calculated, helperHTML: (calculated?.helpContent || '')
    + sourcesHTML
    + purityHelper + String(host.closest('[data-helper-suffix]')?.dataset.helperSuffix || '')
    + (host.closest(LEVEL_UP_HELPER_SCOPE) ? buildImprovementHelperFooter('standard', normalizeStatKey(statKey)) : '') };
}

function contextualStatDefinition(definition, entity, calculated = null) {
  if (normalizeStatKey(definition?.key) !== 'criticalDamage') return definition;
  const exclusive = Number(calculated?.statSystem?.umbra
    ?? getStatSystemResult(entity, 'criticalDamage')?.umbra ?? getSafe(entity, 'criticalPower', 0)) > 0;
  return { ...definition, name: HELPER_TEXT.criticalDamageName(exclusive), uniquePassive: exclusive };
}

function statDefinitionHelperTitle(definition, name, isUmbra = definition?.nature === 'umbra') {
  if (ATTRIBUTE_HELPER_STATS.has(normalizeStatKey(definition?.key))) return HELPER_TEXT.attributeTitle(name);
  if (definition?.nature === 'malus') return HELPER_TEXT.malusTypeTitle(name, definition.key);
  if (['astralReturn', 'astralBody'].includes(definition?.key)) return `Passive exclusive d’Astralité : ${escape(name)}`;
  if (definition?.umbraParameter) return `Paramètre d’Exécution · Fureur sanguinaire : ${escape(name)}`;
  if (definition?.exclusiveOrigin) return HELPER_TEXT.exclusivePassiveTitle(name, definition.exclusiveOrigin);
  if (definition?.key === 'solarArmor') return HELPER_TEXT.exclusivePassiveTitle('Armure solaire', 'Robustesse');
  if (definition?.uniquePassive) {
    const origin = STAT_SYSTEM_ORIGINS[normalizeStatKey(definition.key)];
    return HELPER_TEXT.exclusivePassiveTitle(definition.name, stats.find(stat => stat.key === origin)?.name);
  }
  return HELPER_TEXT.statTitle(name, isUmbra);
}

function statEffectDescription(stat, name, state = 'normal', description = '') {
  const text = description || buildPlayerStatDescription(getDisplayStatKey(stat), name);
  const intensity = { '+': 'fortement', X: 'énormément' }[state];
  if (!intensity) return text;
  const penetration = 'Ignore un % de la ';
  if (text.startsWith(penetration) && text.endsWith('.')) {
    return `Augmente ${intensity} la part de ${text.slice(penetration.length, -1)} ignorée par les attaques de l’entité.`;
  }
  // Keep the existing description and its pictograms; qualify only its main effect.
  const actions = [
    [/^(Augmente|Améliore|Réduit|Renforce|Atténue|Accélère) /, `$1 ${intensity} `],
    [/ détermine les dégâts/, ` augmente ${intensity} les dégâts`],
    [/^Protection de base contre /, `Renforce ${intensity} la protection contre `],
    [/^Protection des /, `Renforce ${intensity} la protection des `],
    [/^Chance de /, `Augmente ${intensity} la chance de `],
    [/^Permet d’esquiver /, `Améliore ${intensity} les chances d’esquiver `],
    [/^Permet de résister /, `Renforce ${intensity} la résistance `],
    [/^Les attaques qui le peuvent ont une chance de /, `Augmente ${intensity} la chance, pour les attaques compatibles, de `],
  ];
  for (const [pattern, replacement] of actions) if (pattern.test(text)) return text.replace(pattern, replacement);
  return text;
}

function statHelperHeader(host, statKey, calculated, entity) {
  if (host.dataset.activeEffect) {
    const visual = EFFECT_VISUALS[host.dataset.entityEffect];
    const icon = visual ? `<img class="effect-helper-icon ${escape(visual.iconClass || '')}" src="${escape(cachedResourceUrl(visual.src))}" alt="" draggable="false">` : '';
    return `${icon}Effet : ${escape(host.dataset.activeEffect)}`;
  }
  const catalogDefinition = stats.find(stat => normalizeStatKey(stat.key) === normalizeStatKey(statKey));
  const definition = contextualStatDefinition(catalogDefinition, host.matches('.stuff-stat-row') ? null : entity, calculated);
  const state = calculated?.statSystem?.state;
  const withComposition = name => state
    ? name.replace(/\s+[+X◇◆Ω]$/, '') + (state === 'normal' ? '' : ` ${state}`) : name;
  if (host.dataset.timingDetail) return HELPER_TEXT.statTitle(host.querySelector('.attack-timing-label')?.textContent || statKey);
  if (host.matches('.stuff-stat-row') || host.dataset.autonomousHelper === 'true') {
    const label = readStatLabel(host, { base: !host.matches('.stuff-stat-row') });
    const name = statKey === 'criticalDamage' ? definition.name : label || definition?.name || HELPER_PICTOGRAM_NAMES[statKey] || statKey;
    return statDefinitionHelperTitle(definition, host.matches('.stuff-stat-row') ? name : withComposition(name), false);
  }
  return definition?.nature === 'umbra' && definition.attribut && definition.type
    ? umbraDescription(definition.nature, definition.attribut, definition.type, calculated?.umbraPresentation ? normalizeStatKey(statKey) : '')
    : definition?.name || HELPER_PICTOGRAM_NAMES[statKey]
      ? statDefinitionHelperTitle(definition, withComposition(definition?.name || HELPER_PICTOGRAM_NAMES[statKey])) : '';
}

function refreshStatHelper(helper, host, entity, content = readStatHelperContent(host, host.dataset.stat, entity)) {
  const { calculated, helperHTML } = content;
  const framed = helperHTML.includes('data-umbra-layout="card"');
  helper.classList.toggle('umbra-helper-card', framed);
  helper._helperHost = host;
  if (entity?.id != null) {
    helper.dataset.entityId = String(entity.id);
    helper.dataset.entityUid = String(entity.id);
  }
  helper._umbraCalculations = calculated?.umbraHelperCalculations;
  const umbraName = framed ? stats.find(stat => stat.key === normalizeStatKey(host.dataset.stat))?.name : '';
  const html = buildStatHoverCard({
    umbraTitle: framed ? { key: normalizeStatKey(host.dataset.stat), name: umbraName, technical: technicalHelpersEnabled() } : null,
    umbraHTML: statHelperHeader(host, host.dataset.stat, calculated, entity),
    helperHTML, ambianceHTML: calculated?.ambianceContent || '',
  });
  updateHelperContent(helper, html);
  applyUmbraCalculationVisibility(helper);
  if (helper.isConnected && host.isConnected) placeHelperInBounds(helper, host);
}

function showStatHelper(e) {
  if (!(e.target instanceof Element)) return;
  if (!e.target.closest('[data-helper-class*="essence-"]')) clearEssenceHoverHelpers();
  if (isDragDropActive()) {
    clearDragTransientHelpers();
    return;
  }

  // Ignore le tooltip lui-même
  if (e.target.closest(".stat-hover")) return;
  if (pinnedUmbraHelpers.length) return;

  const host = getStatHost(e.target);
  if (!host) return;

  // Opt-in obligatoire
  if (!isHelperHoverEnabled(host)) return;

  const statKey = String(host.dataset.stat || "").trim();
  if (!statKey) return;

  const rootAttack = host.closest(".attack-details");
  const rootUid = rootAttack ? getOrCreateRootUid(rootAttack) : "no-attack-root";

  let entity = getBoundHelperEntity(host);
  let entityId = "";

  if (entity) {
    entityId = String(
      entity?.id ??
      entity?.uniqueId ??
      entity?.entityId ??
      entity?.serial ??
      ""
    );
  }

  if (!entity) {
    const lsEntityId = resolveEntityId(host);

    if (lsEntityId != null) {
      entityId = String(lsEntityId);
      const armyA = ArmyACache.get();
      entity = findEntityById(armyA, entityId) || null;
    }
  }

  const entityUid = entityId || rootUid;
  if (host.closest('.item-description-card') && !host.dataset.helperKey) {
    host.dataset.helperKey = `item-${getOrCreateRootUid(host)}-${statKey}`;
  }
  const helperKey = String(host.dataset.helperKey || "").trim();
  const helperId = helperKey || `${statKey}-${entityUid}`;

  if (helperTimers && helperTimers.has(helperId)) {
    clearTimeout(helperTimers.get(helperId));
    helperTimers.delete(helperId);
  }

  const sel = helperKey
    ? `.stat-hover[data-helper-key="${cssEscape(helperKey)}"]`
    : `.stat-hover[data-stat="${cssEscape(statKey)}"][data-entity-uid="${cssEscape(entityUid)}"]`;
  if (document.querySelector(sel)) return;

  const { calculated, helperHTML } = readStatHelperContent(host, statKey, entity);

  if (!helperHTML || !helperHTML.trim()) return;

  // Un seul hover à la fois
  document.querySelectorAll('.stat-hover:not([data-umbra-pinned="true"]):not([data-umbra-detail])').forEach(el => el.remove());

  if (helperTimers) {
    helperTimers.forEach(timer => clearTimeout(timer));
    helperTimers.clear();
  }

  const container = document.querySelector(".Game-helper");
  if (!container) return;

  const statHelper = document.createElement("div");
  statHelper._helperTimerId = helperId;
  statHelper.className = "stat-hover";
  const helperClass = String(host.dataset.helperClass || "").trim();
  if (helperClass) {
    helperClass
      .split(/\s+/)
      .filter(Boolean)
      .forEach(className => statHelper.classList.add(className));
  }

  const statDef = stats.find(s => normalizeStatKey(s.key) === normalizeStatKey(statKey));

  if (statDef?.nature === "umbra" && statDef?.attribut) {
    statHelper.classList.add(statDef.attribut);
  }

  statHelper.dataset.stat = statKey;
  if (host.dataset.statEffect) statHelper.dataset.statEffect = host.dataset.statEffect;
  statHelper.dataset.entityUid = entityUid;
  if (helperKey) {
    statHelper.dataset.helperKey = helperKey;
  }

  if (entityId) {
    statHelper.dataset.entityId = entityId;
  }

  refreshStatHelper(statHelper, host, entity, { calculated, helperHTML });
  Object.assign(statHelper.style, {
    position: "fixed",
    visibility: "hidden",
    opacity: "0",
    transition: "opacity 1s ease",
    pointerEvents: "none",
  });

  container.appendChild(statHelper);
  if (statHelper.matches('.essence-universal-hover, .essence-linked-hover')) {
    essenceHoverHelpers.add(statHelper);
    essenceHelperHostObserver.observe(document.documentElement, { childList: true, subtree: true });
  }
  placeHelperInBounds(statHelper, host);

  revealPositionedHelper(statHelper, { nextFrame: true });
}

const pinnedUmbraHelpers = [];

const umbraDetailHelpers = [];
const DETAIL_ANCHOR_SELECTOR = '[data-helper-entry], [data-helper-value], [data-helper-stat-value], [data-helper-ratio], [data-umbra-calculation], [data-autonomous-calculation], [data-helper-picto-stat], [data-helper-source]';
const DETAIL_ANCHOR_ATTRIBUTES = ['data-helper-ratio', 'data-ratio-stat', 'data-helper-source', 'data-autonomous-calculation',
  'data-umbra-calculation', 'data-umbra-part', 'data-umbra-summary', 'data-helper-picto-stat',
  'data-helper-entry', 'data-helper-value', 'data-helper-stat-value'];

let umbraRefreshFrame = 0;

let umbraObserver = null;

let umbraCalculationDetailsVisible = false;
let umbraCalculationHoverSuspended = false;

function applyUmbraCalculationVisibility(helper) {
  const enabled = technicalHelpersEnabled();
  const preferences = readStatisticCalculationPreferences();
  // Overrides belong to this card and survive its live content refresh only.
  // Their keys are bounded by the current controls; removing the card releases them.
  const overrides = helper._umbraCalculationOverrides;
  const controls = [...helper.querySelectorAll('[data-umbra-detail-toggle]')];
  const keys = new Set(controls.map(button => button.dataset.umbraDetailToggle));
  for (const key of overrides?.keys() || []) if (!keys.has(key)) overrides.delete(key);
  const isExpanded = key => enabled && (overrides?.get(key)
    ?? preferences.choices[statisticCalculationChoiceKey(helper.dataset.stat, helper.dataset.statEffect, key)]
    ?? preferences.expanded);
  for (const detail of helper.querySelectorAll('[data-umbra-calculation-details]')) detail.hidden = !isExpanded(detail.dataset.umbraCalculationDetails);
  for (const button of controls) button.setAttribute('aria-expanded', String(isExpanded(button.dataset.umbraDetailToggle)));
  const expanded = controls.length > 0 && controls.every(button => button.getAttribute('aria-expanded') === 'true');
  const partial = !expanded && controls.some(button => button.getAttribute('aria-expanded') === 'true');
  for (const button of helper.querySelectorAll('[data-umbra-info-toggle]')) {
    button.setAttribute('aria-expanded', String(expanded));
    button.toggleAttribute('data-umbra-partial', partial);
    button.setAttribute('aria-label', expanded ? 'Masquer tous les calculs des Umbras' : 'Afficher tous les calculs des Umbras');
  }
}

function isPinnableUmbraHost(host) {
  if (host?.closest('.item-description-card')) return false;
  if (host?.matches('[data-timing-detail]') && host.closest('.attack-details')) return isHelperHoverEnabled(host);
  if (!host?.matches('.stat-container, [data-attribute-helper]') || !host.closest(`.codex-entity-scan, ${LEVEL_UP_HELPER_SCOPE}`) || !isHelperHoverEnabled(host)) return false;
  const key = normalizeStatKey(host.dataset.stat);
  return (host.dataset.autonomousHelper === 'true' && Boolean(host.closest(`.codex-attack-stat-block, ${LEVEL_UP_HELPER_SCOPE}`)))
    || ATTRIBUTE_HELPER_STATS.has(key)
    || stats.some(stat => normalizeStatKey(stat.key) === key && stat.nature === 'umbra');
}

function closeUmbraDetail(detail = null) {
  if (!detail) {
    for (const open of [...umbraDetailHelpers]) closeUmbraDetail(open);
    return;
  }
  closeUmbraDetailChildren(detail);
  detail._sourceAnchor?.removeAttribute('aria-expanded');
  detail.remove();
  const index = umbraDetailHelpers.indexOf(detail);
  if (index >= 0) umbraDetailHelpers.splice(index, 1);
}

function closeUmbraDetailChildren(parent) {
  for (const child of umbraDetailHelpers.filter(detail => detail._parentHelper === parent)) closeUmbraDetail(child);
}

function updateHelperContent(helper, html) {
  const children = umbraDetailHelpers.filter(detail => detail._parentHelper === helper);
  if (helper._helperRenderedHTML !== html) {
    const bindings = children.map(detail => {
      const anchor = detail._sourceAnchor;
      const attributes = DETAIL_ANCHOR_ATTRIBUTES
        .filter(key => anchor?.hasAttribute(key)).map(key => [key, anchor.getAttribute(key)]);
      const matches = node => attributes.length && attributes.every(([key, value]) => node.getAttribute(key) === value);
      return { detail, matches, index: [...helper.querySelectorAll(DETAIL_ANCHOR_SELECTOR)].filter(matches).indexOf(anchor),
        focused: anchor === document.activeElement };
    });
    // Rebind every branch before refreshing it; live Codex updates must preserve locks.
    for (const child of children) child._sourceAnchor = null;
    helper.innerHTML = html;
    if (helper.classList.contains('umbra-helper-card')) helper.querySelectorAll('.umbra-card-corner').forEach(corner => helper.append(corner));
    helper._helperRenderedHTML = html;
    activateHelperPictograms(helper);
    for (const { detail, matches, index, focused } of bindings) {
      const anchor = [...helper.querySelectorAll(DETAIL_ANCHOR_SELECTOR)].filter(matches)[index];
      if (!anchor) { closeUmbraDetail(detail); continue; }
      detail._sourceAnchor = anchor;
      if (detail.dataset.umbraPinned === 'true') anchor.setAttribute('aria-expanded', 'true');
      if (focused) anchor.focus({ preventScroll: true });
    }
  }
  for (const child of children) {
    if (child.isConnected && child._sourceAnchor?.isConnected) showUmbraDetail(child._sourceAnchor, { refresh: true });
  }
}

function readUmbraDetailContext(parent, entity) {
  return parent.hasAttribute('data-umbra-detail')
    ? { calculated: parent._detailCalculated || {}, helperHTML: parent.querySelector('.stat-hover-body')?.innerHTML || '' }
    : readStatHelperContent(parent._helperHost, parent.dataset.stat, entity);
}

function helperPictogramDefinition(icon) {
  const explicitKey = icon.dataset.helperPictoStat;
  const explicitDefinition = explicitKey && stats.find(stat => normalizeStatKey(stat.key) === normalizeStatKey(explicitKey));
  if (explicitDefinition) return explicitDefinition;
  const classes = [...icon.classList];
  const effectKey = [icon.dataset.helperEffect, ...classes].findLast(key => Object.hasOwn(HELPER_PICTOGRAM_NAMES, key));
  if (effectKey) return { key: effectKey, name: HELPER_PICTOGRAM_NAMES[effectKey],
    nature: ['entrave', 'alteration'].includes(effectKey) ? 'malus' : undefined };
  return stats.find(stat => classes.some(key => key !== 'picto-stat' && normalizeStatKey(key) === normalizeStatKey(stat.key))) || null;
}

function activateHelperPictograms(helper) {
  for (const figure of helper.querySelectorAll('.stat-hover-body .helper-figure')) {
    if (figure.closest('[data-helper-source], [data-helper-value], [data-helper-ratio], [data-umbra-calculation], [data-autonomous-calculation], .stat-source-details')
      || (!figure.closest('[data-umbra-inline-detail]') && figure.closest('[data-helper-entry]'))) continue;
    const value = figure.lastElementChild;
    if (!value || !helperPictogramDefinition(figure.querySelector('.picto-stat') || value)) continue;
    value.dataset.helperStatValue = figure.dataset.helperStat;
    value.tabIndex = 0;
  }
  for (const icon of helper.querySelectorAll('.stat-hover-body .picto-stat, .umbra-title-content')) {
    // Names already own their description. In calculations, keep pictograms
    // descriptive while the surrounding number retains its calculation link.
    if (icon.closest('[data-helper-source], .stat-source-details, .umbra-summary-stat')
      || (!icon.closest('[data-umbra-inline-detail]') && icon.closest('[data-helper-entry]'))) continue;
    const definition = helperPictogramDefinition(icon);
    if (!definition) continue;
    icon.dataset.helperPictoStat = definition.key;
    icon.tabIndex = 0;
    icon.removeAttribute('aria-hidden');
    icon.setAttribute('aria-label', definition.name);
    const label = icon.nextElementSibling;
    if (label?.matches('[data-helper-effect]')) {
      icon.dataset.helperStatState = label.dataset.statState || 'normal';
      if (!label.textContent.trim().endsWith('+') || helper.classList.contains('umbra-helper-card')) label.dataset.helperPictoStat = definition.key;
    }
  }
}

function removePinnedUmbra(helper) {
  closeUmbraDetailChildren(helper);
  helper._helperHost?.removeAttribute('aria-expanded');
  helper.remove();
  const index = pinnedUmbraHelpers.indexOf(helper);
  if (index >= 0) pinnedUmbraHelpers.splice(index, 1);
  if (!pinnedUmbraHelpers.length) {
    umbraObserver?.disconnect();
    umbraObserver = null;
    cancelAnimationFrame(umbraRefreshFrame);
    umbraRefreshFrame = 0;
  }
}

function closeOpenHelpers() {
  [...pinnedUmbraHelpers].forEach(removePinnedUmbra);
  closeUmbraDetail();
  helperTimers.forEach(timer => clearTimeout(timer));
  helperTimers.clear();
  clearDragTransientHelpers({ includePersistent: true });
}

function layoutPinnedUmbras() {
  pinnedUmbraHelpers.forEach(helper => {
    placeHelperInBounds(helper, helper._helperHost);
    helper.style.pointerEvents = 'auto';
    revealPositionedHelper(helper);
  });
  layoutUmbraDetails();
}

function refreshPinnedUmbras() {
  umbraRefreshFrame = 0;
  for (const helper of [...pinnedUmbraHelpers]) {
    const root = helper._umbraRoot;
    if (!helper.isConnected || !root?.isConnected || !root.getClientRects().length) {
      removePinnedUmbra(helper);
      continue;
    }
    let host = helper._helperHost;
    if (!host.isConnected) {
      host = [...root.querySelectorAll('.stat-container[data-stat], [data-attribute-helper], [data-timing-detail]')]
        .find(node => node.dataset.stat === helper.dataset.stat
          && node.dataset.statEffect === helper.dataset.statEffect && node.getClientRects().length);
      if (!host) { removePinnedUmbra(helper); continue; }
      helper._helperHost = host;
    }
    if (!host.getClientRects().length) { removePinnedUmbra(helper); continue; }
    const entity = getBoundHelperEntity(host) || findEntityById(ArmyACache.get(), helper.dataset.entityId);
    refreshStatHelper(helper, host, entity);
    activateHelperPictograms(helper);
    host.setAttribute('aria-expanded', 'true');
  }
  layoutPinnedUmbras();
}

function scheduleUmbraRefresh() {
  if (pinnedUmbraHelpers.length && !umbraRefreshFrame) umbraRefreshFrame = requestAnimationFrame(refreshPinnedUmbras);
}

function togglePinnedUmbra(host) {
  if (!isPinnableUmbraHost(host) || isDragDropActive()) return;
  const existing = pinnedUmbraHelpers.find(helper => helper.dataset.stat === host.dataset.stat
    && helper.dataset.statEffect === host.dataset.statEffect
    && helper.dataset.entityUid === resolveEntityUidForHost(host).entityUid
    && (!host.dataset.timingDetail || helper._helperHost === host));
  if (existing) { removePinnedUmbra(existing); layoutPinnedUmbras(); return; }
  [...pinnedUmbraHelpers].forEach(removePinnedUmbra);
  showStatHelper({ target: host });
  const helper = [...document.querySelectorAll('.stat-hover')].find(node => node._helperHost === host);
  if (!helper) return;
  clearTimeout(helperTimers.get(helper._helperTimerId));
  helperTimers.delete(helper._helperTimerId);
  helper.dataset.umbraPinned = 'true';
  helper._umbraRoot = host.closest(`${LEVEL_UP_HELPER_SCOPE}, .codex-substat-panel--umbra, .codex-entity-scan, .attack-details`);
  host.setAttribute('aria-expanded', 'true');
  pinnedUmbraHelpers.push(helper);
  // Observe only while cards are pinned; refresh on Codex changes, not on tooltip mutations.
  if (!umbraObserver) {
    umbraObserver = new MutationObserver(records => {
      if (pinnedUmbraHelpers.some(card => !card.isConnected || !card._umbraRoot.isConnected
        || records.some(record => card._umbraRoot.contains(record.target)
          || (record.type === 'attributes' && record.target.contains(card._umbraRoot))))) scheduleUmbraRefresh();
    });
    umbraObserver.observe(document.body, { subtree: true, childList: true, characterData: true,
      attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
  }
  refreshPinnedUmbras();
}

function helperAttributeForStat(key) {
  const normalized = normalizeStatKey(key || '');
  if (['strength', 'intelligence', 'agility'].includes(normalized)) return normalized;
  const attribute = statsByKey[normalized]?.attribut
    || statsByKey[STAT_SYSTEM_ORIGINS[normalized]]?.attribut;
  return { force: 'strength', intelligence: 'intelligence', agilite: 'agility' }[attribute];
}

function buildUmbraDetail(anchor, parent, entity) {
  let html;
  let header;
  let footer = '';
  let definition = null;
  let detailCalculated = null;
  let separatorStat = null;
  const readContext = () => {
    const context = readUmbraDetailContext(parent, entity);
    detailCalculated = context.calculated;
    return context;
  };
  if (anchor.hasAttribute('data-helper-entry') || anchor.hasAttribute('data-helper-value')) {
    const { calculated } = readContext();
    const presentation = calculated.umbraPresentation;
    const id = anchor.dataset.helperEntry || anchor.dataset.helperValue;
    const entry = [...(presentation?.entries || []), ...(presentation?.detailEntries || [])].find(entry => entry.id === id);
    if (!entry) return;
    definition = { ...(statsByKey[entry.stat] || {}), key: entry.stat, name: entry.name,
      nature: 'statistic', uniquePassive: entry.exclusive,
      exclusiveOrigin: entry.exclusive ? statsByKey[presentation.key]?.name : null };
    header = statDefinitionHelperTitle(definition, entry.name);
    html = anchor.hasAttribute('data-helper-value')
      ? buildUmbraEntryExplanation(entry, calculated, { admin: technicalHelpersEnabled() })
      : statEffectDescription(entry.stat, entry.name, entry.exclusive ? 'normal' : entry.state, entry.description);
  } else if (anchor.hasAttribute('data-helper-ratio')) {
    if (!technicalHelpersEnabled()) return;
    const content = document.createElement('template');
    content.innerHTML = readContext().helperHTML;
    const ratio = [...content.content.querySelectorAll('[data-helper-ratio]')]
      .find(node => node.dataset.helperRatio === anchor.dataset.helperRatio);
    if (!ratio) return;
    const stat = ratio.dataset.ratioStat;
    separatorStat = stat;
    const name = stats.find(statistic => normalizeStatKey(statistic.key) === normalizeStatKey(stat))?.name
      || HELPER_PICTOGRAM_NAMES[stat] || stat;
    header = HELPER_TEXT.ratioValueTitle(name);
    html = buildRatioValueHelper(stat, ratio.dataset.ratioValue, ratio.dataset.ratioUnit, ratio.dataset.ratioRounding, ratio.dataset.ratioSourcePoints);
    if (!html) return;
    if (statsByKey[normalizeStatKey(stat)]) {
      const display = calculateStatsDisplay(stat, entity, undefined, { includeHelper: false });
      html += buildEntityStatTotal(display.statSystem ? { ...display.statSystem, stat }
        : { stat, value: display.displayValue });
    }
  } else if (anchor.hasAttribute('data-helper-source')) {
    const content = document.createElement('template');
    content.innerHTML = readContext().helperHTML;
    const source = [...content.content.querySelectorAll('[data-helper-source]')]
      .find(node => node.dataset.helperSource === anchor.dataset.helperSource);
    // Static context in the title/header lives outside the body's fresh HTML.
    const sourceDetail = source?.querySelector('template[data-helper-source-detail]')
      || anchor.querySelector('template[data-helper-source-detail]');
    html = sourceDetail?.innerHTML;
    if (!html) return;
    header = sourceDetail.dataset.helperSourceTitle || HELPER_TEXT.sourcesTitle;
  } else if (anchor.hasAttribute('data-autonomous-calculation')) {
    const { calculated } = readContext();
    const detail = calculated.autonomousDetails?.[Number(anchor.dataset.autonomousCalculation)];
    if (!detail?.html) return;
    html = detail.html;
    header = HELPER_TEXT.calculationTitle;
    if (detail.rounded) footer = HELPER_TEXT.umbraRoundedValue;
  } else if (anchor.hasAttribute('data-umbra-calculation')) {
    const { calculated } = readContext();
    const model = calculated.umbraHelperCalculations?.[anchor.dataset.umbraCalculation];
    if (anchor.hasAttribute('data-umbra-summary')) {
      html = buildAutonomousConversionHelper(calculated);
      if (!html) return;
      header = HELPER_TEXT.calculationTitle;
      if (model?.parts.some(part => part.rounded)) footer = HELPER_TEXT.umbraRoundedValue;
    } else {
      const partIndex = Number(anchor.dataset.umbraPart);
      html = buildUmbraContributionHelper(model, partIndex);
      if (!html) return;
      const sourcePart = model.parts[partIndex];
      separatorStat = sourcePart.stat;
      const sourceName = stats.find(stat => normalizeStatKey(stat.key) === normalizeStatKey(sourcePart.stat))?.name || sourcePart.stat;
      header = sourcePart.fixed && !sourcePart.sources?.length ? HELPER_TEXT.umbraFixedValueTitle : HELPER_TEXT.umbraCalculationTitle(sourceName);
      if (sourcePart.rounded) footer = HELPER_TEXT.umbraRoundedValue;
    }
  } else {
    const valueKey = anchor.dataset.helperStatValue;
    definition = contextualStatDefinition(valueKey ? statsByKey[normalizeStatKey(valueKey)] || { key: valueKey, name: HELPER_PICTOGRAM_NAMES[valueKey] || valueKey } : helperPictogramDefinition(anchor), entity);
    if (!definition || (valueKey && normalizeStatKey(definition.key) === normalizeStatKey(parent.dataset.stat) && !parent.classList.contains('umbra-helper-card'))) return;
    const calculated = calculateStatsDisplay(definition.key, entity, undefined, { nestedHelper: true });
    detailCalculated = calculated;
    header = statDefinitionHelperTitle(definition, definition.name);
    if (definition.nature === 'umbra') {
      const presentation = calculated.umbraPresentation;
      if (presentation) {
        const bonuses = [{ stat: presentation.key, name: presentation.name }, ...(presentation.directGrants || []).map(entry => ({
          ...entry, name: statsByKey[normalizeStatKey(entry.stat)]?.name || HELPER_PICTOGRAM_NAMES[entry.stat]
            || entry.name.replace(/ · Bonus direct$/, ''),
        }))];
        const abilities = presentation.entries.filter(entry => !entry.exclusive && !entry.passiveOf);
        const passives = presentation.entries.filter(entry => entry.exclusive && !entry.passiveOf);
        const label = entry => {
          const state = entry.state;
          const gradient = state === 'X' && entry.gradient ? `--stat-x-from:${entry.gradient.from.map(key => `var(--color-${key})`).join(',')};--stat-x-to:var(--color-${entry.gradient.to})` : '';
          const anchor = entry.id ? `data-helper-entry="${escape(entry.id)}"` : `data-helper-picto-stat="${escape(entry.stat)}"`;
          return `<span class="umbra-summary-stat" ${anchor} tabindex="0"><span class="picto-stat ${escape(entry.icon || entry.stat)}" aria-hidden="true"></span><span class="${escape(entry.stat)}"${state ? ` data-stat-state="${escape(state)}"` : ''}${gradient ? ` style="${escape(gradient)}"` : ''}>${escape(entry.name)}${entry.state ? ' ' + escape(entry.state) : ''}</span></span>`;
        };
        const list = entries => [...new Set(entries.map(label))].join(', ');
        html = `<p>Octroie ${bonuses.length > 1 ? 'des bonus fixes' : 'un bonus fixe'} : ${list(bonuses)}.</p>`
          + (abilities.length ? `<p>Permet d’utiliser : ${list(abilities)}.</p>` : '')
          + (passives.length ? `<p>${passives.length > 1 ? 'Passives exclusives' : 'Passive exclusive'} : ${list(passives)}.</p>` : '');
      } else html = '<p>' + buildPlayerStatDescription(definition.key, definition.name) + '</p>';
    } else {
      html = valueKey ? buildPlayerStatHelper(getDisplayStatKey(definition.key), calculated, definition.name, { includeDescription: false })
        : statEffectDescription(definition.key, definition.name,
          anchor.dataset.helperStatState || anchor.dataset.statState || 'normal');
      if (valueKey && technicalHelpersEnabled()) {
        const model = calculated.umbraHelperCalculations?.autonomousTotal;
        const calculation = model ? buildTechnicalStatCalculation(model) : calculated.helpContent;
        if (calculation) html += '<section class="helper-technical" data-helper-technical>' + calculation + '</section>';
      }
    }
    if (valueKey) {
      const total = calculated.umbraHelperCalculations?.autonomousTotal || calculated.statSystem;
      const current = calculated.umbraPresentation?.points ?? (Number.isFinite(calculated.displayValue)
        ? calculated.displayValue : getSafe(entity, definition.key, null));
      html += buildEntityStatTotal(total ? { ...total, stat: getDisplayStatKey(definition.key) }
        : { stat: definition.key, value: current?.totalMax ?? current?.max ?? current?.current ?? current });
    }
  }

  if (!technicalHelpersEnabled() && anchor.matches('[data-autonomous-calculation], [data-umbra-calculation]')) {
    const { calculated } = readContext();
    const model = calculated.umbraHelperCalculations?.[anchor.dataset.umbraCalculation];
    const key = model?.stat || parent.dataset.stat;
    const name = statsByKey[normalizeStatKey(key)]?.name || HELPER_PICTOGRAM_NAMES[key] || key;
    html = buildPlayerStatHelper(getDisplayStatKey(key), calculateStatsDisplay(key, entity, undefined, { nestedHelper: true }), name);
    header = HELPER_TEXT.statTitle(name);
    footer = '';
  }
  const detailClass = definition
    ? `stat-hover${definition.nature === 'umbra' && definition.attribut ? ` ${definition.attribut}` : ''}`
    : [...parent.classList].filter(name => name !== 'umbra-helper-card').join(' ');
  const detailHTML = buildStatHoverCard({ umbraHTML: header, helperHTML: html, ambianceHTML: footer });
  return { html: detailHTML, className: detailClass, calculated: detailCalculated,
    attribute: helperAttributeForStat(separatorStat || definition?.key)
      || parent.dataset.helperAttribute || helperAttributeForStat(parent.dataset.stat),
    subject: definition?.key, stat: definition?.key || parent.dataset.stat };
}

function detailAnchorRoute(anchor, parent) {
  const attributes = DETAIL_ANCHOR_ATTRIBUTES.filter(key => anchor.hasAttribute(key))
    .map(key => [key, anchor.getAttribute(key)]);
  const matches = node => attributes.every(([key, value]) => node.getAttribute(key) === value);
  return { attributes, index: [...parent.querySelectorAll(DETAIL_ANCHOR_SELECTOR)].filter(matches).indexOf(anchor),
    contextStat: parent.dataset.stat };
}

function readDetailRoute(root, anchor, route, entity) {
  let view = buildUmbraDetail(anchor, root, entity);
  for (const step of route) {
    if (!view) return null;
    // Rebuild context only when opening or refreshing. These temporary nodes
    // never enter the DOM; no hidden helper chain or stale stat snapshot remains.
    const context = document.createElement('div');
    context.className = view.className;
    context.dataset.umbraDetail = '';
    context.dataset.stat = view.stat;
    if (view.attribute) context.dataset.helperAttribute = view.attribute;
    context._detailCalculated = view.calculated;
    context.innerHTML = view.html;
    activateHelperPictograms(context);
    const next = [...context.querySelectorAll(DETAIL_ANCHOR_SELECTOR)]
      .filter(node => step.attributes.every(([key, value]) => node.getAttribute(key) === value))[step.index];
    if (!next) return null;
    view = buildUmbraDetail(next, context, entity);
  }
  return view;
}

function showUmbraDetail(target, { refresh = false } = {}) {
  if (target.closest('[data-umbra-info-toggle], [data-umbra-detail-toggle]')) return;
  const requestedAnchor = target.closest(DETAIL_ANCHOR_SELECTOR);
  const owner = requestedAnchor?.closest('.stat-hover[data-umbra-pinned="true"]');
  if (!owner) return;
  const nested = owner.hasAttribute('data-umbra-detail');
  const parent = nested ? owner._parentHelper : owner;
  const anchor = nested ? owner._sourceAnchor : requestedAnchor;
  const existing = umbraDetailHelpers.find(detail => detail.isConnected
    && detail._parentHelper === parent && detail._sourceAnchor === anchor);
  let route = refresh ? existing?._detailRoute || [] : [];
  if (nested) {
    route = [...(owner._detailRoute || [])];
    const step = detailAnchorRoute(requestedAnchor, owner);
    // Revisiting a link truncates the route, so cyclic descriptions cannot
    // accumulate history. Only distinct links of the current card are retained.
    const previous = route.findIndex(entry => JSON.stringify(entry) === JSON.stringify(step));
    route = previous < 0 ? [...route, step] : route.slice(0, previous + 1);
  }
  const entity = getBoundHelperEntity(parent._helperHost) || findEntityById(ArmyACache.get(), parent.dataset.entityId);
  const view = readDetailRoute(parent, anchor, route, entity);
  if (!view) { if (refresh && existing) closeUmbraDetail(existing); return; }
  for (const open of [...umbraDetailHelpers]) if (open !== existing) closeUmbraDetail(open);
  const detail = existing || document.createElement('div');
  detail.className = view.className;
  detail.setAttribute('data-umbra-detail', '');
  if (view.attribute) detail.dataset.helperAttribute = view.attribute;
  else delete detail.dataset.helperAttribute;
  if (view.subject) detail.dataset.helperPictoSubject = view.subject;
  else delete detail.dataset.helperPictoSubject;
  detail.dataset.stat = view.stat;
  detail.dataset.entityId = parent.dataset.entityId || '';
  detail._helperHost = parent._helperHost;
  detail._detailCalculated = view.calculated;
  detail._detailRoute = route;
  detail.setAttribute('role', 'tooltip');
  detail._parentHelper = parent;
  detail._sourceAnchor = anchor;
  updateHelperContent(detail, view.html);
  applyUmbraCalculationVisibility(detail);
  if (!existing) {
    Object.assign(detail.style, { position: 'fixed', visibility: 'hidden', pointerEvents: 'none', opacity: '0',
      zIndex: String((Number(getComputedStyle(parent).zIndex) || 10) + 1) });
    parent.parentElement.appendChild(detail);
    umbraDetailHelpers.push(detail);
    revealPositionedHelper(detail);
  }
  placeHelperInBounds(detail, anchor);
  return detail;
}

function togglePinnedUmbraDetail(target) {
  if (target.closest('[data-umbra-info-toggle], [data-umbra-detail-toggle]')) return false;
  const anchor = target.closest(DETAIL_ANCHOR_SELECTOR);
  if (!anchor?.closest('.stat-hover[data-umbra-pinned="true"]')) return false;
  const existing = umbraDetailHelpers.find(detail => detail._sourceAnchor === anchor);
  if (existing?.dataset.umbraPinned === 'true') {
    closeUmbraDetail(existing);
    return true;
  }
  const detail = showUmbraDetail(anchor);
  if (!detail) return false;
  detail.dataset.umbraPinned = 'true';
  detail.style.pointerEvents = 'auto';
  detail._sourceAnchor.setAttribute('aria-expanded', 'true');
  return true;
}

function layoutOpenStatHelpers() {
  for (const helper of document.querySelectorAll('.stat-hover:not([data-umbra-detail])')) {
    if (helper._helperHost?.isConnected) placeHelperInBounds(helper, helper._helperHost);
  }
  layoutUmbraDetails();
}

function layoutUmbraDetails() {
  for (const detail of [...umbraDetailHelpers]) {
    if (detail._sourceAnchor?.isConnected && detail._parentHelper?.isConnected) placeHelperInBounds(detail, detail._sourceAnchor);
    else closeUmbraDetail(detail);
  }
}

function resolveEntityUidForHost(host) {
  // Root du bloc d’attaque (si présent)
  const rootAttack = host.closest(".attack-details");
  const rootUid = rootAttack ? getOrCreateRootUid(rootAttack) : "no-attack-root";

  // 1) Entité bindée (AttackDetailInfos)
  const boundEntity = getBoundHelperEntity(host);

  // 2) ID stable si dispo
  let entityId = "";
  if (boundEntity) {
    entityId = String(
      boundEntity?.id ??
      boundEntity?.uniqueId ??
      boundEntity?.entityId ??
      boundEntity?.serial ??
      ""
    );
  }

  // 3) Fallback localStorage (armée A)
  if (!entityId) {
    const lsEntityId = resolveEntityId(host);
    if (lsEntityId != null) entityId = String(lsEntityId);
  }

  // 4) UID final (anti-doublon + fermeture)
  const entityUid = entityId || rootUid;

  return { entityUid, entityId };
}

function isHelperHoverEnabled(el) {
  if (!(el instanceof Element)) return false;

  // On vérifie sur le host direct (celui qui porte data-stat)
  const v = el.getAttribute("data-hover");

  // Absent => false
  if (v === null) return false;

  // Présent sans valeur => true (ex: <div data-hover></div>)
  if (v === "") return true;

  // Sinon interprétation string
  const s = String(v).trim().toLowerCase();
  if (["true", "1", "yes", "y", "on"].includes(s)) return true;
  if (["false", "0", "no", "n", "off"].includes(s)) return false;

  // Valeur bizarre => par défaut true (ou false si tu veux être strict)
  return true;
}

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

function statSourcesHelper(entity, key) {
  const sources = getStatContributions(entity, key, { includePreview: true })
    .filter(source => source.malus || isDisplayableStatContribution(source));
  return buildStatSourcesHelper({ sources, escape, statClass: getDisplayStatKey(key) });
}

export {
  helperEntityByRoot,
  bindHelperEntity,
  getBoundHelperEntity,
  layoutOpenStatHelpers,
  refreshStatHelper,
  closeOpenHelpers,
  statSourcesHelper,
  clamp,
  LEVEL_UP_HELPER_SCOPE,
  STOCK_HELPER_STATS,
  statsByKey,
  findStatKeyFromLabel,
  umbraDetection,
  cssEscape,
  getStatValue,
  readStatLabel,
  contextualStatDefinition,
  escape,
};

// Register shared handlers once, after the complete module graph is initialized.
let initialized = false;
export function initializeStatHelpers() {
  if (initialized) return;
  initialized = true;
  bindDragHelperCleanupGuards();

  if (typeof document !== "undefined") {
    document.addEventListener(DRAG_HELPER_CLEANUP_EVENT, () => {
      helperTimers.forEach(timer => clearTimeout(timer));
      helperTimers.clear();
      [...pinnedUmbraHelpers].forEach(removePinnedUmbra);
      closeUmbraDetail();
    });
    document.addEventListener('essenceHoverHelpersInvalidated', clearEssenceHoverHelpers);

  }

  document.addEventListener("click", (event) => {
    const subject = destroyedLootSubject(event.target);
    if (!subject) {
      hideDestroyedLootHelper();
      return;
    }

    showDestroyedLootHelper(subject);
    const helper = document.querySelector(".Game-helper .destroyed-loot-helper");
    if (helper) placeDestroyedLootHelperAtPointer(helper, event);
  }, true);

  document.addEventListener("mouseout", (event) => {
    const subject = destroyedLootSubject(event.target);
    if (!subject) return;
    if (event.relatedTarget instanceof Element && subject.element.contains(event.relatedTarget)) return;

    hideDestroyedLootHelper();
  }, true);

  document.addEventListener('mouseover', showStatHelper);

  umbraCalculationDetailsVisible = readStatisticCalculationPreferences().expanded;

  window.addEventListener('adminModeChanged', () => {
    closeUmbraDetail();
    for (const helper of document.querySelectorAll('.stat-hover:not([data-umbra-pinned])')) helper.remove();
    refreshPinnedUmbras();
  });

  document.addEventListener('click', event => {
    const button = event.target instanceof Element && event.target.closest('[data-umbra-info-toggle], [data-umbra-detail-toggle]');
    if (!button || !technicalHelpersEnabled()) return;
    const owner = button.closest('.umbra-helper-card');
    if (!owner) return;
    // Reflow can place a statistic under a stationary pointer. Wait for actual
    // pointer movement before opening its hover helper; keyboard focus still works.
    umbraCalculationHoverSuspended = true;
    const expanded = button.getAttribute('aria-expanded') !== 'true';
    const global = button.hasAttribute('data-umbra-info-toggle');
    const cards = global ? [...document.querySelectorAll('.stat-hover.umbra-helper-card')] : [owner];
    if (global) {
      umbraCalculationDetailsVisible = expanded;
      saveStatisticCalculationDefault(expanded);
      for (const helper of cards) helper._umbraCalculationOverrides?.clear();
    } else {
      const overrides = owner._umbraCalculationOverrides ??= new Map();
      overrides.set(button.dataset.umbraDetailToggle, expanded);
      saveStatisticCalculationChoice(statisticCalculationChoiceKey(owner.dataset.stat, owner.dataset.statEffect,
        button.dataset.umbraDetailToggle), expanded);
    }
    for (const helper of cards) applyUmbraCalculationVisibility(helper);
    for (const detail of [...umbraDetailHelpers]) {
      if (detail._sourceAnchor?.closest('[data-umbra-inline-detail]')?.hidden) closeUmbraDetail(detail);
    }
    // Keep the title and i under the pointer; the body scrolls if needed.
    // Moving the card here could trigger a different element's hover helper.
    for (const helper of cards) placeHelperInBounds(helper, helper._helperHost, { preservePosition: true });
    layoutUmbraDetails();
  });

  document.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('[data-umbra-info-toggle], [data-umbra-detail-toggle]')) return;
    const parent = event.target.closest('.stat-hover[data-umbra-pinned="true"], .stat-hover[data-umbra-detail]');
    if (parent) {
      // Links toggle their own branch; clicking the parent's text or background
      // dismisses its children while keeping the parent itself pinned.
      if (!togglePinnedUmbraDetail(event.target)) closeUmbraDetailChildren(parent);
      return;
    }
    const host = getStatHost(event.target);
    if (isPinnableUmbraHost(host)) togglePinnedUmbra(host);
    else [...pinnedUmbraHelpers].forEach(removePinnedUmbra);
  }, true);

  document.addEventListener('dblclick', event => {
    if (isPinnableUmbraHost(getStatHost(event.target))) [...pinnedUmbraHelpers].forEach(removePinnedUmbra);
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      const detail = umbraDetailHelpers.at(-1);
      if (detail) closeUmbraDetail(detail);
      else [...pinnedUmbraHelpers].forEach(removePinnedUmbra);
    }
    if ((event.key === 'Enter' || event.key === ' ') && event.target instanceof Element && togglePinnedUmbraDetail(event.target)) {
      event.preventDefault();
      return;
    }
    if ((event.key === 'Enter' || event.key === ' ') && isPinnableUmbraHost(event.target)) {
      event.preventDefault();
      togglePinnedUmbra(event.target);
    }
  });

  for (const name of ['mouseover', 'focusin']) document.addEventListener(name, event => {
    if (name === 'mouseover' && umbraCalculationHoverSuspended) return;
    // A deeper link replaces this panel on click/keyboard activation, not while
    // the pointer is travelling across its text or the user is moving focus.
    if (event.target instanceof Element && !event.target.closest('[data-umbra-detail]')) showUmbraDetail(event.target);
  });

  document.addEventListener('pointermove', event => {
    if (!umbraCalculationHoverSuspended) return;
    umbraCalculationHoverSuspended = false;
    if (event.target instanceof Element && !event.target.closest('[data-umbra-detail]')) showUmbraDetail(event.target);
  });

  for (const name of ['mouseout', 'focusout']) document.addEventListener(name, event => {
    for (const detail of [...umbraDetailHelpers]) {
      const anchor = detail._sourceAnchor;
      if (!anchor || detail.dataset.umbraPinned === 'true') continue;
      const stillInside = event.relatedTarget instanceof Node
        && (anchor.contains(event.relatedTarget) || detail.contains(event.relatedTarget));
      if (!stillInside && (anchor.contains(event.target) || detail.contains(event.target))) closeUmbraDetail(detail);
    }
  });

  window.addEventListener('resize', layoutOpenStatHelpers);

  window.visualViewport?.addEventListener('resize', layoutOpenStatHelpers);

  document.addEventListener('scroll', event => {
    if (event.target instanceof Element && event.target.closest('.stat-hover')) {
      layoutUmbraDetails();
    } else {
      layoutOpenStatHelpers();
    }
  }, true);

  for (const name of ['selectedArmyAUpdated', 'entityProgressionReset', 'entityCombatStatsChanged', 'equippedItemsUpdated']) {
    window.addEventListener(name, event => {
      const entity = event.detail?.entity || event.detail?.entite;
      if (entity && name !== 'equippedItemsUpdated') for (const helper of pinnedUmbraHelpers) {
        if (String(entity.id) === helper.dataset.entityId) {
          const attackRoot = helper._helperHost.closest('.attack-details, .attack-light-description');
          // Resource helpers read the latest owner above; keep their draft and open source detail.
          if (name === 'selectedArmyAUpdated' && !attackRoot && STOCK_HELPER_STATS.has(helper.dataset.stat)) continue;
          const attack = attackRoot && helperEntityByRoot.get(attackRoot)?.currentAttack;
          const view = attack ? createAttackStatView(entity, attack) : entity;
          // A saved equipment change refreshes the owner, not the player's level-up choices.
          if (attackRoot || !helper._helperHost.closest(LEVEL_UP_HELPER_SCOPE) || name === 'entityProgressionReset') {
            bindHelperEntity(attackRoot || helper._umbraRoot, view);
          }
          bindHelperEntity(helper._helperHost, view);
        }
      }
      scheduleUmbraRefresh();
    });
  }

  document.addEventListener(
    "mouseout",
    (e) => {
      if (!(e.target instanceof Element)) return;

      // Ignore les tooltips eux-mêmes (normalement pointerEvents none, mais safe)
      if (e.target.closest(".stat-hover")) return;

    const host = getStatHost(e.target);
  if (!host) return;

  if (!isHelperHoverEnabled(host)) return;

      // Si on bouge vers un enfant/parent dans le même host → ne rien faire
      if (e.relatedTarget instanceof Element && host.contains(e.relatedTarget)) return;

      const statKey = String(host.dataset.stat || "").trim();
      if (!statKey) return;

      const { entityUid, entityId } = resolveEntityUidForHost(host);
      const helperKey = String(host.dataset.helperKey || "").trim();
      const helperId = helperKey || `${statKey}-${entityUid}`;

      // Cible le helper selon le nouveau dataset
      let statHelper = helperKey
        ? document.querySelector(`.stat-hover[data-helper-key="${cssEscape(helperKey)}"]`)
        : document.querySelector(
            `.stat-hover[data-stat="${cssEscape(statKey)}"][data-entity-uid="${cssEscape(entityUid)}"]`
          );

      // Fallback si un ancien helper data-entity-id traîne encore
      if (!statHelper && entityId) {
        statHelper = document.querySelector(
          `.stat-hover[data-stat="${cssEscape(statKey)}"][data-entity-id="${cssEscape(entityId)}"]`
        );
      }

      if (!statHelper || statHelper.dataset.umbraPinned === 'true') return;

      // Si un timer existe déjà pour ce helperId, on le remplace proprement
      if (helperTimers.has(helperId)) {
        clearTimeout(helperTimers.get(helperId));
        helperTimers.delete(helperId);
      }

      if (statHelper.classList.contains('essence-universal-hover') || statHelper.classList.contains('essence-linked-hover')) {
        statHelper.remove();
        helperTimers.delete(helperId);
        return;
      }

      const timer = setTimeout(() => {
        if (statHelper.dataset.umbraPinned === 'true') return;
        statHelper.style.transition = "opacity 1s ease";
        statHelper.style.opacity = "0";

        // supprime après la fin réelle du fade
        setTimeout(() => {
          if (statHelper?.parentNode && statHelper.dataset.umbraPinned !== 'true') statHelper.remove();
        }, 1100);

        helperTimers.delete(helperId);
      }, 200);

      helperTimers.set(helperId, timer);
    },
    true
  );
}
