// Release source of truth; this module updates the DOM in normal and admin modes.
export const GAME_VERSION = '0.93.3-dev';

import { ensureGameShell } from '../ui/viewport.js';
import { ENTITY_SIZE_OPTIONS, entitySizeInCells, setEntitySizeInCells, planEntityPlacements, releaseEntityFootprint, hexCoordonne, syncEntityFootprints } from "../board/controller.js";
import { gameStorage as localStorage, beginAdminSession } from "../storage/sessionStorage.js";
import {
  isAdminMode, setAdminMode, getAvailablePlayerExperience, loadFromLocalStorage, saveToLocalStorage,
  armyAConfig, loadCurrentGameData, getOrCreateGameID, getVisibleHexes, purgeStatPreview,
  loadPlayerInfo, loadEquippedItems, addToEquippedItemsStorage, removeFromEquippedItemsStorage,
} from "../storage/gameStorage.js";
import { setBattleSlotCount, removeItem, isBattleConsumable, spawnBattleGroundItem, spawnAdminGroundSummon,
    setAdminGroundItemsInfinite, restoreBattleGroundItems, clearBattleGroundItems } from "../items/itemManager.js";
import { releaseGroundItem } from "../combat/summons.js";
import { ItemDetails } from "../data/itemList.js";
import { summons } from "../data/summons.js";
import { createIngameItem } from "../items/items.js";
import { createUmbraCrystal, getPermanentStatChoices } from "../items/permanentItems.js";
import { PERMANENT_CRYSTAL_LEVELS } from "../data/permanentCrystalData.js";
import {
  removeBattleElementFromDOM, isHexOccupied,
} from "../rendering/boardElements.js";
import {
  assignUniqueIDToEntities,
  entites,
  entitesNestUp,
  recomputeEntityStats,
  BASE_MAX_LEVEL,
  maxLevel,
  calculateLvlMaxBonus,
  generateUniqueID,
} from "../entities/runtime.js";
import { createEntityIngame, spawnEntiteIngame, prepareHexForSide } from "../entities/spawn.js";
import { applyResourceStocksToEquippedItems } from "../items/resourceStocks.js";
import { applyArmorLayersToEquippedItems } from "../items/armor.js";
import { createLinkedEssenceId, createLinkedEssenceItem, createAttackEssenceSocketId, createUniversalEssenceId } from "../items/essenceInventory.js";
import { eventList } from "../data/eventList.js";
import { stats as ADMIN_STATS_DATA } from "../data/statsData.js";
import { attackDetails as ADMIN_ATTACK_DETAILS } from "../data/attackList.js";
import { getAttackEffectDefinition, listAttackEffects, EFFECT_PARAMETER_SCHEMAS, EFFECT_APPLICATION_MODES, effectApplicationModes } from "../data/attackEffects.js";
import { previewAttackEffects } from "../combat/effectParameters.js";
import { createAttackStatView } from "../combat/statistics.js";
import {
  getDisplayStatKey,
  normalizeStatKey,
  CLASS_INDEX,
  calculateAwakeningStepCount,
  getArchetypeTargetRatios,
  getClassFromAttributs,
  getClassLabel,
  getCycleForKey,
  normalizeArchetypeKey,
  entityBattleBooste,
} from "../entities/rules.js";
import { levelBiome } from "../biome/level.js";
import { balanceData } from "../data/balanceData.js";
import { determineClasse, updateCombatantRoleIndex, updateCombatantTargetZones } from "../board/deployment.js";
import {
  ATTACK_ESSENCE_MAX_SLOTS,
  getAttackEssenceColorsFromNatures,
  getAttackNatureRules,
  readAttackDefinitionsForEntity,
  normalizeAttackArrayValue,
  normalizeAttackDefinitionForEntity,
  refreshEntityCurrentAttackDefinition,
  setEntityAttackDefinitions,
  updateEntityAttackDefinition,
} from "../combat/attackResolution.js";
import { syncEntityLinkedEssenceInventory } from "../items/essences.js";
import { closePlayerArmyCodex } from "../ui/codex/index.js";
import { mountCombatSimulation, unmountCombatSimulation } from "./simulation.js";
import { clearBattleTargetDisplays } from "../rendering/hud.js";

function displayGameVersion() {
    let label = document.getElementById('game-version');
    if (!label) {
        label = document.createElement('small');
        label.id = 'game-version';
        (document.getElementById('game-shell') || document.body).append(label);
    }
    const text = `The Dark Pit v${GAME_VERSION}`;
    if (label.textContent !== text) label.textContent = text;
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', displayGameVersion, { once: true });
} else displayGameVersion();

const ADMIN_EVENT_LIST = Object.freeze(
    eventList
        .filter((eventDefinition, index, definitions) => (
            eventDefinition?.key
            && definitions.findIndex(candidate => candidate?.key === eventDefinition.key) === index
        ))
);

function recomputeAdminEntityStats(entity) {
    recomputeEntityStats(entity);
    syncEntityLinkedEssenceInventory(entity);
    return entity;
}

export function getAdminEventDefinitions() {
    return [...ADMIN_EVENT_LIST];
}

const ADMIN_EVENT_OUTCOME_ORDER = Object.freeze(['success', 'middle', 'fail']);
const ADMIN_MENU_STORAGE_KEY = 'DarkPitAdminMenuState';
const ADMIN_INVINCIBLE_MODE_STORAGE_KEY = 'DarkPitAdminInvincibleMode';
const ADMIN_SOUL_SYNC_INTERVAL_MS = 750;
const ADMIN_SOUL_SCAN_STYLE_ID = 'admin-soul-scan-tools-style';
const ADMIN_SOUL_SCAN_BUTTON_CLASS = 'admin-soul-scanentity';
const ADMIN_SOUL_RESET_TOOLS_CLASS = 'admin-soul-reset-tools';
const ADMIN_SOUL_RESET_BUTTON_CLASS = 'admin-soul-reset-level';
const ADMIN_SOUL_ENTITY_ORIGINS = new Map();
const ADMIN_ENTITY_EDITOR_KEYS = new WeakMap();
const ADMIN_LIVE_ENTITY_EDITOR_KEYS = new WeakMap();
const ADMIN_ENTITY_BASE_STAT_SNAPSHOTS = new WeakMap();
const ADMIN_ENTITY_WILL_FLEX_FLAGS = new Map();
const ADMIN_ENTITY_REQUESTED_LEVELS = new Map();
const ADMIN_ENTITY_BASESTAT_EDIT_FLAGS = new Map();
const ADMIN_NAVIGATION = { stage: null, views: new Map(), entities: new Map(), lastEntity: null };
const ADMIN_LEVEL_MODIFIER_SOURCE = 'adminLevel';
const ADMIN_ARCHETYPE_DEFAULT_TRANSITION_TOLERANCE = 15;
const ADMIN_ARCHETYPE_TRANSITION_TOLERANCES = new Map();
const ADMIN_ARCHETYPE_EXCLUDED_PICKER_KEYS = new Set(['egare', 'inerte']);
const ADMIN_ENTITY_TOOL_TABS = Object.freeze([
    Object.freeze({ key: 'stats', label: 'Entité active', iconClass: 'admin-editor-tool-icon--active-entity' }),
    Object.freeze({ key: 'archetypes', label: 'Archétypes', iconClass: 'admin-editor-tool-icon--archetypes' }),
    Object.freeze({ key: 'attacks', label: 'Attaques', iconClass: 'admin-editor-tool-icon--attacks' })
]);
const ADMIN_STAT_EDITOR_INPUT_CONTROLS = new Map();
const ADMIN_ATTRIBUTE_STAT_KEYS = Object.freeze(['strength', 'agility', 'intelligence', 'will']);
const ADMIN_STAT_EDITOR_GROUPS = Object.freeze([
    Object.freeze({ key: 'attributes', label: 'Attributs' }),
    Object.freeze({ key: 'umbras', label: 'Umbras' }),
    Object.freeze({ key: 'statistics', label: 'Stats' }),
    Object.freeze({ key: 'improved', label: 'Stats +' })
]);
const ADMIN_ATTACK_TEXT_FIELDS = Object.freeze([
    Object.freeze({ key: 'displayName', label: 'Nom affiché' })
]);
const ADMIN_ATTACK_NUMERIC_FIELDS = Object.freeze([
    Object.freeze({ key: 'preparationTime', label: 'Préparation base', suffix: 'ms', step: 100 }),
    Object.freeze({ key: 'executionTime', label: 'Exécution base', suffix: 'ms', step: 100 }),
    Object.freeze({ key: 'recoveryTime', label: 'Récupération base', suffix: 'ms', step: 100 }),
    Object.freeze({ key: 'cooldown', label: 'Cooldown base', suffix: 'ms', step: 100 }),
    Object.freeze({ key: 'physicalRatio', label: 'Ratio physique', step: 0.1 }),
    Object.freeze({ key: 'magicalRatio', label: 'Ratio magique', step: 0.1 }),
    Object.freeze({ key: 'piercingRatio', label: 'Ratio perçant', step: 0.1 }),
    Object.freeze({ key: 'attackAP', label: 'Coût AP', step: 1 }),
]);
const ADMIN_ATTACK_NATURE_PRESETS = Object.freeze([
    'hybridalPiercingDamage', 'magicalPiercingDamage', 'physicalPiercingDamage'
]);
const ADMIN_ATTACK_LIST_FIELDS = Object.freeze([
    Object.freeze({ key: 'combatFunction', label: 'Fonction', options: ['Attaquant', 'Support'], multi: false, scalar: true, required: true }),
    Object.freeze({ key: 'attackRange', label: 'Portée', options: ['melee', 'range'], multi: false }),
    Object.freeze({ key: 'attacknature', label: 'Nature', options: ['physicalDamage', 'magicalDamage', 'hybridalDamage', 'piercingDamage', ...ADMIN_ATTACK_NATURE_PRESETS], multi: true }),
    Object.freeze({ key: 'attackTarget', label: 'Cible', options: ['enemy', 'ally', 'hexa'], multi: true }),
    Object.freeze({ key: 'effets', label: 'Effets', get options() { return listAttackEffects().map(effect => effect.effectName); }, multi: true }),
    Object.freeze({ key: 'selfEffects', label: 'Effets soi', get options() { return listAttackEffects().map(effect => effect.effectName); }, multi: true }),
    Object.freeze({ key: 'deadTarget', label: 'Cible morte', options: ['yes'], multi: false })
]);
const ADMIN_ATTACK_RUNTIME_EXPORT_SKIP_KEYS = Object.freeze([
    'baseTimings',
    'meleeExecDebug',
    'meleeAmbidextryToken',
    'isLaunchedUnderMysticism',
    'isBalancedNoAggro',
    'isBrokenSpell',
    'isAmbidextry',
    'forceDamageSources',
    'ambidextryHitIndex',
    'logVariant'
]);
let adminEntityEditorKeyCounter = 0;
const ADMIN_SPAWN_SIDES = Object.freeze([
    Object.freeze({ key: 'A', label: 'Side A' }),
    Object.freeze({ key: 'B', label: 'Side B' }),
    Object.freeze({ key: 'neutral', label: 'Neutral' })
]);
const ADMIN_CHEST_STATUSES = Object.freeze([
    Object.freeze({ key: 'lootable', label: 'Lootable' }),
    Object.freeze({ key: 'locked', label: 'Locked' }),
    Object.freeze({ key: 'destroyed', label: 'Destroyed' })
]);
const ADMIN_CORPSE_STATUSES = Object.freeze([
    Object.freeze({ key: 'lootable', label: 'Lootable' }),
    Object.freeze({ key: 'empty', label: 'Empty' }),
    Object.freeze({ key: 'destroyed', label: 'Destroyed' })
]);

function normalizeAdminSpawnSide(side) {
    const normalized = String(side || '').trim().toLowerCase();
    if (normalized === 'b' || normalized === 'sideb' || normalized === 'side-b') return 'B';
    if (normalized === 'neutral' || normalized === 'neutre' || normalized === 'n') return 'neutral';
    return 'A';
}

function setAdminSpawnDragPayload(dataTransfer, payload) {
    if (!dataTransfer) return;

    dataTransfer.setData('application/x-admin-spawn', payload);
    dataTransfer.setData('text/plain', payload);
    dataTransfer.setData('text', payload);
    dataTransfer.effectAllowed = 'copy';
}

function getAdminSpawnDragPayload(dataTransfer) {
    if (!dataTransfer) return '';

    return dataTransfer.getData('application/x-admin-spawn')
        || dataTransfer.getData('text/plain')
        || dataTransfer.getData('text')
        || '';
}

function hasAdminSpawnDragPayload(dataTransfer) {
    const types = dataTransfer?.types;
    if (!types) return false;

    for (let index = 0; index < types.length; index += 1) {
        if (String(types[index]).toLowerCase() === 'application/x-admin-spawn') return true;
    }

    return false;
}

function getAdminHexPosition(hex) {
    if (!hex) return null;
    return hex.dataset?.position || hex.dataset?.hexId || (/^hex_\d+$/.test(hex.id) ? hex.id : null);
}

function normalizeAdminEditorStatKey(statKey) {
    const raw = String(statKey ?? '').trim();
    const alias = raw
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();

    if (alias === 'force') return 'strength';
    if (alias === 'agilite') return 'agility';
    if (alias === 'intel') return 'intelligence';
    return normalizeStatKey(raw);
}

function readAdminEditableStatValue(value) {
    if (value && typeof value === 'object') {
        return Number(value.max ?? value.current ?? value.value ?? 0) || 0;
    }

    return Number(value ?? 0) || 0;
}

function cloneAdminPlainData(value, fallback = {}) {
    try {
        if (typeof structuredClone === 'function') return structuredClone(value);
    } catch {
        // structuredClone peut échouer sur certains objets DOM accrochés par le runtime.
    }

    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        return fallback;
    }
}

function ensureAdminEntityBaseStatsSnapshot(entity) {
    if (!entity || typeof entity !== 'object') return {};

    if (!ADMIN_ENTITY_BASE_STAT_SNAPSHOTS.has(entity)) {
        ADMIN_ENTITY_BASE_STAT_SNAPSHOTS.set(
            entity,
            cloneAdminPlainData(entity.baseStats || {}, {})
        );
    }

    return ADMIN_ENTITY_BASE_STAT_SNAPSHOTS.get(entity) || {};
}

function getAdminStatEditorKey(entity) {
    if (!entity || typeof entity !== 'object') return '';

    ensureAdminEntityBaseStatsSnapshot(entity);

    const existing = ADMIN_ENTITY_EDITOR_KEYS.get(entity);
    if (existing) return existing;

    adminEntityEditorKeyCounter += 1;
    const stablePart = [
        entity.serial,
        entity.id,
        entity.class,
        entity.name
    ].filter(value => value !== undefined && value !== null && value !== '').join('-');
    const key = `admin-entity-stats-${stablePart || 'entity'}-${adminEntityEditorKeyCounter}`;
    ADMIN_ENTITY_EDITOR_KEYS.set(entity, key);
    return key;
}

function getAdminLiveEntityEditorKey(entity) {
    if (!entity || typeof entity !== 'object') return '';

    ensureAdminEntityBaseStatsSnapshot(entity);

    const existing = ADMIN_LIVE_ENTITY_EDITOR_KEYS.get(entity);
    if (existing) return existing;

    adminEntityEditorKeyCounter += 1;
    const key = `admin-live-entity-${entity.id || 'unknown'}-${adminEntityEditorKeyCounter}`;
    ADMIN_LIVE_ENTITY_EDITOR_KEYS.set(entity, key);
    ADMIN_ENTITY_EDITOR_KEYS.set(entity, key);
    return key;
}

function readAdminBaseStatValue(entity, statKey) {
    const key = normalizeAdminEditorStatKey(statKey);
    const displayKey = key.endsWith('Plus') ? key : getDisplayStatKey(key);
    const baseStats = entity?.baseStats || {};

    return readAdminEditableStatValue(
        baseStats[key] !== undefined
            ? baseStats[key]
            : baseStats[displayKey]
    );
}

function ensureAdminLevelModifierStats(entity) {
    if (!entity) return {};

    entity.modifierStats ??= {};
    entity.modifierStats.durable ??= {};
    entity.modifierStats.durable[ADMIN_LEVEL_MODIFIER_SOURCE] ??= {};
    return entity.modifierStats.durable[ADMIN_LEVEL_MODIFIER_SOURCE];
}

function readAdminLevelModifierStatValue(entity, statKey) {
    const key = normalizeAdminEditorStatKey(statKey);
    const displayKey = key.endsWith('Plus') ? key : getDisplayStatKey(key);
    const source = entity?.modifierStats?.durable?.[ADMIN_LEVEL_MODIFIER_SOURCE] || {};

    return readAdminEditableStatValue(
        source[key] !== undefined
            ? source[key]
            : source[displayKey]
    );
}

function setAdminLevelModifierStatValue(entity, statKey, value) {
    if (!entity) return null;

    const key = normalizeAdminEditorStatKey(statKey);
    const displayKey = key.endsWith('Plus') ? key : getDisplayStatKey(key);
    const numericValue = Number(value);
    if (!key || !Number.isFinite(numericValue)) return null;

    const source = ensureAdminLevelModifierStats(entity);
    if (Math.abs(numericValue) < 0.000001) delete source[key];
    else source[key] = numericValue;

    if (displayKey && displayKey !== key) delete source[displayKey];
    return numericValue;
}

function readAdminFinalStatValue(entity, statKey) {
    const key = normalizeAdminEditorStatKey(statKey);
    const displayKey = key.endsWith('Plus') ? key : getDisplayStatKey(key);
    const stats = entity?.stats || {};

    const value = stats[key] !== undefined ? stats[key] : stats[displayKey];
    return readAdminEditableStatValue(value?.totalMax ?? value);
}

function clearAdminLevelModifierStats(entity) {
    if (!entity) return;
    const source = ensureAdminLevelModifierStats(entity);
    Object.keys(source).forEach(key => delete source[key]);
}

function isAdminBaseStatsEditEnabled(editorKey) {
    return ADMIN_ENTITY_BASESTAT_EDIT_FLAGS.get(editorKey) === true;
}

function setAdminBaseStatsEditEnabled(editorKey, enabled) {
    if (!editorKey) return;
    if (enabled) ADMIN_ENTITY_BASESTAT_EDIT_FLAGS.set(editorKey, true);
    else ADMIN_ENTITY_BASESTAT_EDIT_FLAGS.delete(editorKey);
}

function readAdminEditedStatValue(entity, statKey, editorKey = '') {
    return isAdminBaseStatsEditEnabled(editorKey)
        ? readAdminBaseStatValue(entity, statKey)
        : readAdminLevelModifierStatValue(entity, statKey);
}

function readAdminDisplayedStatValue(entity, statKey, editorKey, row) {
    return row?.dataset.statValueMode === 'total'
        ? readAdminFinalStatValue(entity, statKey)
        : readAdminEditedStatValue(entity, statKey, editorKey);
}

function setAdminEditedStatValue(entity, statKey, value, editorKey = '') {
    return isAdminBaseStatsEditEnabled(editorKey)
        ? setAdminBaseStatValue(entity, statKey, value)
        : setAdminLevelModifierStatValue(entity, statKey, value);
}

function readAdminWillWithoutAdminLevel(entity) {
    const key = 'will';
    const durable = entity?.modifierStats?.durable || {};
    let total = readAdminBaseStatValue(entity, key);

    ['level', 'archetype', 'statLeveled'].forEach(sourceKey => {
        total += readAdminEditableStatValue(durable[sourceKey]?.[key]);
    });

    const stuffById = durable.stuff?.byId || {};
    Object.keys(stuffById).forEach(itemId => {
        total += readAdminEditableStatValue(stuffById[itemId]?.[key]);
    });

    return total;
}

function readAdminEffectiveWillValue(entity) {
    return readAdminWillWithoutAdminLevel(entity)
        + readAdminLevelModifierStatValue(entity, 'will');
}

function setAdminFlexWillValue(entity, finalWillValue, editorKey = '') {
    const targetWill = Math.max(0, Number(finalWillValue) || 0);

    if (isAdminBaseStatsEditEnabled(editorKey)) {
        setAdminLevelModifierStatValue(entity, 'will', 0);
        return setAdminBaseStatValue(entity, 'will', targetWill);
    }

    const foundationWill = readAdminWillWithoutAdminLevel(entity);
    const adminDelta = Math.max(0, targetWill - foundationWill);
    return setAdminLevelModifierStatValue(entity, 'will', adminDelta);
}

function getAdminStatInputControlKey(editorKey, statKey) {
    const key = normalizeAdminEditorStatKey(statKey);
    return editorKey && key ? `${editorKey}:${key}` : '';
}

function registerAdminStatInputControl(editorKey, statKey, row, input, initialValue = 0) {
    const controlKey = getAdminStatInputControlKey(editorKey, statKey);
    if (!controlKey || !row || !input) return;

    if (!ADMIN_STAT_EDITOR_INPUT_CONTROLS.has(controlKey)) {
        ADMIN_STAT_EDITOR_INPUT_CONTROLS.set(controlKey, new Set());
    }

    ADMIN_STAT_EDITOR_INPUT_CONTROLS.get(controlKey).add({
        row,
        input,
        initialValue: Number(initialValue) || 0,
    });
}

function readAdminEntityLevelValue(entity) {
    const rawLevel = entity?.level;
    const rawCurrent = rawLevel && typeof rawLevel === 'object'
        ? rawLevel.current ?? rawLevel.level
        : rawLevel;
    const numericValue = Math.floor(Number(rawCurrent ?? 1) || 1);
    return Math.max(1, numericValue);
}

function readAdminEntityBaseMaxLevel(entity = null) {
    const defaultBase = Math.max(
        1,
        Math.floor(Number(balanceData.level?.will?.baseMaxLevel) || BASE_MAX_LEVEL || 100)
    );
    const rawBase = Number(entity?.level?.baseMax);
    if (Number.isFinite(rawBase)) return Math.max(defaultBase, Math.floor(rawBase));

    return defaultBase;
}

function calculateAdminLevelMaxWithWill(entity, willValue) {
    const cfg = balanceData.level?.will || {};
    const hardMaxLevel = Math.max(
        1,
        Math.floor(Number(cfg.hardMaxLevel) || Number(balanceData.level?.progression?.tableMaxLevel) || maxLevel || 250)
    );
    const baseMaxLevel = readAdminEntityBaseMaxLevel(entity);
    const bonus = calculateLvlMaxBonus(willValue, {
        ...cfg,
        baseMaxLevel,
    });
    return Math.max(1, Math.min(baseMaxLevel + bonus, hardMaxLevel));
}

function findAdminRequiredWillForLevel(entity, requestedLevel) {
    const targetLevel = normalizeAdminLevelEditorValue(requestedLevel);
    if (targetLevel === null) return null;

    const cfg = balanceData.level?.will || {};
    const willCap = Math.max(1, Math.floor(Number(cfg.willCap) || 150));
    let best = {
        will: willCap,
        maxLevel: calculateAdminLevelMaxWithWill(entity, willCap),
        targetLevel,
        capped: false,
    };

    for (let will = 1; will <= willCap; will += 1) {
        const maxLevel = calculateAdminLevelMaxWithWill(entity, will);
        if (maxLevel >= targetLevel) {
            best = { will, maxLevel, targetLevel, capped: false };
            break;
        }
    }

    if (best.maxLevel < targetLevel) best.capped = true;
    return best;
}

function normalizeAdminLevelEditorValue(value) {
    const numericValue = Math.floor(Number(value));
    if (!Number.isFinite(numericValue)) return null;
    return Math.max(1, numericValue);
}

function setAdminEntityLevelValue(entity, levelValue) {
    if (!entity) return null;

    const numericValue = normalizeAdminLevelEditorValue(levelValue);
    if (numericValue === null) return null;

    const previousLevel = entity.level && typeof entity.level === 'object'
        ? entity.level
        : {};
    const baseMax = readAdminEntityBaseMaxLevel(entity);

    entity.level = {
        ...previousLevel,
        baseMax,
        current: numericValue
    };

    return numericValue;
}

function applyAdminRequestedLevelEnvelope(entity, requestedLevel, editorKey = '', { willFlex = false } = {}) {
    const level = normalizeAdminLevelEditorValue(requestedLevel);
    if (!entity || level === null) return null;

    setAdminRequestedLevelValue(editorKey, level);

    let flexInfo = null;
    if (willFlex) {
        flexInfo = findAdminRequiredWillForLevel(entity, level);
        if (flexInfo) {
            setAdminFlexWillValue(entity, flexInfo.will, editorKey);
        }
    }

    setAdminEntityLevelValue(entity, flexInfo?.capped ? Math.min(level, flexInfo.maxLevel) : level);

    const maxForWill = calculateAdminLevelMaxWithWill(entity, readAdminEffectiveWillValue(entity));
    entity.level ??= {};
    if (typeof entity.level !== 'object') entity.level = { current: level };
    entity.level.baseMax = readAdminEntityBaseMaxLevel(entity);
    entity.level.max = maxForWill;
    entity.level.current = Math.min(Number(entity.level.current) || level, maxForWill);

    return {
        requestedLevel: level,
        flexInfo,
    };
}

function isAdminWillFlexEnabled(editorKey) {
    return ADMIN_ENTITY_WILL_FLEX_FLAGS.get(editorKey) === true;
}

function setAdminWillFlexEnabled(editorKey, enabled) {
    if (!editorKey) return;
    if (enabled) ADMIN_ENTITY_WILL_FLEX_FLAGS.set(editorKey, true);
    else ADMIN_ENTITY_WILL_FLEX_FLAGS.delete(editorKey);
}

function readAdminRequestedLevelValue(entity, editorKey = '') {
    const storedLevel = editorKey ? ADMIN_ENTITY_REQUESTED_LEVELS.get(editorKey) : undefined;
    const normalizedStoredLevel = normalizeAdminLevelEditorValue(storedLevel);
    return normalizedStoredLevel ?? readAdminEntityLevelValue(entity);
}

function setAdminRequestedLevelValue(editorKey, levelValue) {
    if (!editorKey) return;

    const normalizedLevel = normalizeAdminLevelEditorValue(levelValue);
    if (normalizedLevel === null) ADMIN_ENTITY_REQUESTED_LEVELS.delete(editorKey);
    else ADMIN_ENTITY_REQUESTED_LEVELS.set(editorKey, normalizedLevel);
}

function clearAdminGeneratedLevelSources(entite, { preserveGeneratedArchetypeTarget = false } = {}) {
    if (!entite) return;

    const generatedArchetypeState = preserveGeneratedArchetypeTarget
        ? entite.Archetype
        : null;

    entite.modifierStats ??= {};
    entite.modifierStats.durable ??= {};
    entite.modifierStats.durable[ADMIN_LEVEL_MODIFIER_SOURCE] ??= {};
    entite.modifierStats.durable.level = {};
    entite.modifierStats.durable.statLeveled = {};
    entite.modifierStats.durable.archetype = {};
    entite.modifierStats.durable.archetypeMeta = null;
    entite.modifierStats.durable.derived = {};
    delete entite.modifierStats.preview;
    syncEntityLinkedEssenceInventory(entite);

    if (generatedArchetypeState) entite.Archetype = generatedArchetypeState;
    else delete entite.Archetype;
}

function refreshAdminCatalogLevelLabels(editorKey, entity) {
    if (!editorKey || typeof document === 'undefined') return;

    const levelValue = readAdminEntityLevelValue(entity);
    document.querySelectorAll('.admin-entity-catalog-row').forEach(row => {
        if (row.dataset.adminEditorKey !== editorKey) return;

        const label = row.querySelector('.admin-entity-catalog-level');
        if (label) label.textContent = `Lv ${levelValue}`;
    });
}

function refreshAdminVisibleStatInputs(editorKey, entity, statKey, options = {}) {
    if (!editorKey || typeof document === 'undefined') return;

    const resetInitial = options?.resetInitial === true;
    const normalizedKey = normalizeAdminEditorStatKey(statKey);
    const controlKey = getAdminStatInputControlKey(editorKey, normalizedKey);
    const controls = ADMIN_STAT_EDITOR_INPUT_CONTROLS.get(controlKey);

    controls?.forEach(control => {
        if (!control?.row || !control?.input) {
            controls.delete(control);
            return;
        }

        const value = readAdminEditedStatValue(entity, normalizedKey, editorKey);
        control.input.value = String(readAdminDisplayedStatValue(entity, normalizedKey, editorKey, control.row));
        if (resetInitial) {
            control.initialValue = value;
            control.row.dataset.initialValue = String(value);
        }
        control.row.classList.toggle('is-edited', value !== control.initialValue);
    });

    document.querySelectorAll('.admin-stat-editor-row').forEach(row => {
        if (row.dataset.adminEditorKey !== editorKey) return;
        if (normalizeAdminEditorStatKey(row.dataset.statKey) !== normalizedKey) return;

        const input = row.querySelector('.admin-stat-editor-input');
        const value = readAdminEditedStatValue(entity, normalizedKey, editorKey);
        if (input) input.value = String(readAdminDisplayedStatValue(entity, normalizedKey, editorKey, row));

        const initialValue = Number(row.dataset.initialValue);
        if (resetInitial) row.dataset.initialValue = String(value);
        if (Number.isFinite(initialValue)) {
            row.classList.toggle(
                'is-edited',
                value !== (resetInitial ? value : initialValue)
            );
        }
    });
}

function refreshAdminVisibleAllStatInputs(editorKey, entity, options = {}) {
    if (!editorKey || typeof document === 'undefined') return;

    const keys = new Set();
    for (const controlKey of ADMIN_STAT_EDITOR_INPUT_CONTROLS.keys()) {
        if (controlKey.startsWith(`${editorKey}:`)) keys.add(controlKey.slice(editorKey.length + 1));
    }
    document.querySelectorAll('.admin-stat-editor-row').forEach(row => {
        if (row.dataset.adminEditorKey !== editorKey) return;
        const key = normalizeAdminEditorStatKey(row.dataset.statKey);
        if (key && key !== 'level') keys.add(key);
    });

    keys.forEach(key => refreshAdminVisibleStatInputs(editorKey, entity, key, options));
}

function refreshAdminVisibleWillFlexControls(editorKey, entity, result = null) {
    if (!editorKey || typeof document === 'undefined') return;

    const flexEnabled = isAdminWillFlexEnabled(editorKey);
    const requestedLevel = result?.requestedLevel ?? readAdminRequestedLevelValue(entity, editorKey);
    const info = flexEnabled
        ? (result?.flexInfo || findAdminRequiredWillForLevel(entity, requestedLevel))
        : null;
    const summaryText = info
        ? (info.capped ? `Vol. ${info.will} / max ${info.maxLevel}` : `Vol. ${info.will}`)
        : '';

    document.querySelectorAll('.admin-stat-editor-row').forEach(row => {
        if (row.dataset.adminEditorKey !== editorKey) return;

        const flexInput = row.querySelector('.admin-level-flex-label input[type="checkbox"]');
        if (flexInput) flexInput.checked = flexEnabled;

        const flexSummary = row.querySelector('.admin-level-flex-summary');
        if (flexSummary) flexSummary.textContent = flexEnabled ? summaryText : '';
    });
}

function getAdminStatEditorGroupKey(statDefinition) {
    const key = normalizeAdminEditorStatKey(statDefinition?.key);
    if (ADMIN_ATTRIBUTE_STAT_KEYS.includes(key)) return 'attributes';
    if (statDefinition?.nature === 'umbra') return 'umbras';
    if (key.endsWith('Plus')) return 'improved';
    return 'statistics';
}

function getAdminStatDefinitionName(statKey) {
    const key = normalizeAdminEditorStatKey(statKey);
    const definition = ADMIN_STATS_DATA.find(candidate => normalizeAdminEditorStatKey(candidate?.key) === key);
    return definition?.name || key;
}

function getAdminStatEditorDefinitions(entity) {
    const definitionsByKey = new Map();

    const addDefinition = (statKey, statDefinition = null, order = definitionsByKey.size) => {
        const key = normalizeAdminEditorStatKey(statKey);
        if (!key || definitionsByKey.has(key)) return;

        const definition = statDefinition || {};
        const name = definition.name || getAdminStatDefinitionName(key);
        const group = getAdminStatEditorGroupKey({ ...definition, key });

        const displayKey = getDisplayStatKey(key);
        definitionsByKey.set(key, {
            key,
            displayKey,
            name,
            group,
            nature: definition.nature || 'statistic',
            type: definition.type || '',
            order,
            searchText: `${name} ${key} ${displayKey} ${group} ${definition.type || ''} ${definition.nature || ''}`
        });
    };

    ADMIN_ATTRIBUTE_STAT_KEYS.forEach((key, index) => {
        const definition = ADMIN_STATS_DATA.find(candidate => normalizeAdminEditorStatKey(candidate?.key) === key);
        addDefinition(key, definition, index - 1000);
    });

    ADMIN_STATS_DATA.forEach((definition, index) => {
        addDefinition(definition?.key, definition, index);
    });

    getPermanentStatChoices().filter(definition => definition.key.endsWith('Plus')).forEach((definition, index) => {
        addDefinition(definition.key, definition, index);
    });

    Object.keys(entity?.baseStats || {}).forEach((key, index) => {
        addDefinition(key, null, ADMIN_STATS_DATA.length + index);
    });

    return [...definitionsByKey.values()].sort((first, second) => {
        const firstGroupIndex = ADMIN_STAT_EDITOR_GROUPS.findIndex(group => group.key === first.group);
        const secondGroupIndex = ADMIN_STAT_EDITOR_GROUPS.findIndex(group => group.key === second.group);
        return firstGroupIndex - secondGroupIndex
            || first.order - second.order
            || first.name.localeCompare(second.name);
    });
}

function hasAdminEntityStat(entity, key) {
    return readAdminFinalStatValue(entity, key) > 0;
}

function setAdminBaseStatValue(entity, statKey, value) {
    if (!entity) return null;

    const key = normalizeAdminEditorStatKey(statKey);
    const numericValue = Number(value);
    if (!key || !Number.isFinite(numericValue)) return null;

    entity.baseStats ??= {};
    entity.baseStats[key] = numericValue;
    return numericValue;
}

function replaceAdminBaseStats(entity, nextBaseStats = {}) {
    if (!entity) return;

    entity.baseStats = cloneAdminPlainData(nextBaseStats, {});
}

function refreshAdminEditedLiveEntity(entite, oldStats) {
    if (!entite?.id || !entites.includes(entite)) return;

    refreshAdminEntityAttackState(entite);
    refreshAdminScanHeader(entite);
    updateAdminEntityHud(entite);
    saveAdminEntityToOriginalStorage(entite);

    import("../combat/vitals.js")
        .then(entityApi => {
            entityApi.updateCurrentAttackDisplay?.(entite);
            entityApi.updateBonusLifeCounters?.(entite);
        })
        .catch(error => {
            console.warn('Éditeur admin : rafraîchissement attaque courante impossible.', error);
        });

    import("../ui/statistics/components.js")
        .then(upgradeApi => {
            upgradeApi.syncDOMWithStats?.(
                oldStats || {},
                cloneAdminPlainData(entite.stats || {}, {}),
                entite.id,
                entite
            );
        })
        .catch(error => {
            console.warn('Éditeur stats admin : synchronisation DOM impossible.', error);
        });
}

function applyAdminStatEditorValue(entity, statKey, value, editorKey = '') {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return null;
    let displayedValue = numericValue;

    const targets = [entity].filter(Boolean);

    targets.forEach(target => {
        const oldStats = cloneAdminPlainData(target.stats || {}, {});
        const appliedValue = setAdminEditedStatValue(target, statKey, numericValue, editorKey);
        if (appliedValue === null) return;

        recomputeAdminEntityStats(target);
        refreshAdminEditedLiveEntity(target, oldStats);
    });

    displayedValue = readAdminEditedStatValue(entity, statKey, editorKey);
    return displayedValue;
}

function applyAdminLevelEditorValue(entity, value, editorKey = '', options = {}) {
    const requestedLevel = normalizeAdminLevelEditorValue(value);
    if (requestedLevel === null) return null;

    const willFlex = options?.willFlex === true;
    let entityFlexInfo = null;
    const targets = [entity].filter(Boolean);

    targets.forEach(target => {
        const oldStats = cloneAdminPlainData(target.stats || {}, {});
        if (target.id) purgeStatPreview(target.id);

        clearAdminGeneratedLevelSources(target, { preserveGeneratedArchetypeTarget: true });

        const envelope = applyAdminRequestedLevelEnvelope(target, requestedLevel, editorKey, { willFlex });
        if (!envelope) return;
        if (target === entity) entityFlexInfo = envelope.flexInfo;

        recomputeAdminEntityStats(target);
        refreshAdminEditedLiveEntity(target, oldStats);
    });

    refreshAdminCatalogLevelLabels(editorKey, entity);
    if (willFlex) refreshAdminVisibleStatInputs(editorKey, entity, 'will');

    const result = {
        level: readAdminEntityLevelValue(entity),
        requestedLevel,
        maxLevel: Number(entity?.level?.max) || null,
        flexInfo: entityFlexInfo,
    };

    refreshAdminVisibleWillFlexControls(editorKey, entity, result);
    return result;
}

function applyAdminWillFlexBeforeSpawn(entity, editorKey = '') {
    if (!entity || !editorKey || !isAdminWillFlexEnabled(editorKey)) return null;

    const requestedLevel = readAdminRequestedLevelValue(entity, editorKey);
    return applyAdminLevelEditorValue(entity, requestedLevel, editorKey, { willFlex: true });
}

function getAdminLevelOverrideForSpawn(entity, editorKey = '', flexResult = null) {
    if (!entity) return null;

    const requestedLevel = flexResult?.requestedLevel ?? readAdminRequestedLevelValue(entity, editorKey);
    if (!isAdminWillFlexEnabled(editorKey)) return requestedLevel;

    const flexInfo = flexResult?.flexInfo || findAdminRequiredWillForLevel(entity, requestedLevel);
    if (!flexInfo) return requestedLevel;

    return flexInfo.capped
        ? Math.min(requestedLevel, flexInfo.maxLevel)
        : requestedLevel;
}

function enforceAdminSpawnLevel(created, sourceEntity, levelOverride) {
    const normalizedLevel = normalizeAdminLevelEditorValue(levelOverride);
    if (!created || normalizedLevel === null) return;

    const sourceWill = readAdminEffectiveWillValue(sourceEntity);
    const oldStats = cloneAdminPlainData(created.stats || {}, {});

    const maxForWill = calculateAdminLevelMaxWithWill(created, sourceWill);
    created.level = {
        ...(created.level && typeof created.level === 'object' ? created.level : {}),
        baseMax: readAdminEntityBaseMaxLevel(created),
        max: Math.max(maxForWill, normalizedLevel),
        current: normalizedLevel
    };

    recomputeAdminEntityStats(created);
    refreshAdminEditedLiveEntity(created, oldStats);
}

function resetAdminEntityBaseStats(entity, editorKey = '') {
    if (!entity) return;

    const resetBaseStats = isAdminBaseStatsEditEnabled(editorKey);
    const zeroBaseStats = {};
    if (resetBaseStats) {
        getAdminStatEditorDefinitions(entity).forEach(definition => {
            zeroBaseStats[definition.key] = 0;
        });
    }

    const targets = [entity].filter(Boolean);

    targets.forEach(target => {
        const oldStats = cloneAdminPlainData(target.stats || {}, {});
        clearAdminLevelModifierStats(target);
        if (resetBaseStats) replaceAdminBaseStats(target, zeroBaseStats);
        recomputeAdminEntityStats(target);
        refreshAdminEditedLiveEntity(target, oldStats);
    });

    refreshAdminVisibleAllStatInputs(editorKey, entity, { resetInitial: true });
}

export async function hardResetAdminEntity(entity, editorKey = '') {
    if (!entity || !isAdminLevelActive()) return null;
    const { clearAttackNatureEffects, rez } = await import("../combat/effects.js");
    clearAttackNatureEffects(entity);
    for (const boosts of Object.values(entity.battleBoosts || {})) {
        for (const boost of boosts) boost.remove?.({ syncArmor: false });
    }
    const oldStats = cloneAdminPlainData(entity.stats || {}, {});
    const equipment = applyArmorLayersToEquippedItems(entity,
        applyResourceStocksToEquippedItems(entity, loadEquippedItems()));
    const ids = new Set(Object.values(entity.stuff || {}).flat());
    for (const item of equipment.filter(item => ids.has(item.equippedId))) {
        addToEquippedItemsStorage(item.equippedId, item);
        removeFromEquippedItemsStorage(item.equippedId);
    }
    purgeStatPreview(entity.id);
    entity.baseStats = Object.fromEntries(getAdminStatEditorDefinitions(entity).map(definition => [definition.key, 0]));
    Object.assign(entity.baseStats, { HP: 1, shift: { current: 0, max: 0 }, speed: 0, dayHpRegen: 0 });
    entity.stats = { HP: { current: 1, max: 1 } };
    entity.modifierStats = {};
    entity.battleBoosts = {};
    entity.stuff = {};
    entity.resourceStocks = {};
    entity.level = { current: 1 };
    entity.experience = 0;
    entity.adminExperienceSpent = 0;
    entity.Archetype = { current: { key: 'egare', level: 1, step: 0, milestone: [] }, inProgress: [], achieve: [] };
    entity.adminZeroBaseline = true;
    for (const key of ['reverseArchetype', 'armorLayers', 'extraLifeRegen', 'eternalLifeRegen',
        '_statSystemOverrides', 'baseStatSources']) delete entity[key];
    ADMIN_ENTITY_REQUESTED_LEVELS.delete(editorKey);
    ADMIN_ENTITY_WILL_FLEX_FLAGS.delete(editorKey);
    recomputeAdminEntityStats(entity);
    if (entity.isDEAD) {
        entity.corpseConsumed = false;
        entity.corpseDestroyed = false;
        rez(entity, { restoredHP: 1 });
    }
    refreshAdminEditedLiveEntity(entity, oldStats);
    refreshAdminVisibleAllStatInputs(editorKey, entity, { resetInitial: true });
    window.dispatchEvent(new CustomEvent('entityProgressionReset', {
        detail: { source: 'admin-hard-reset', entityId: entity.id, entite: entity }
    }));
    return entity;
}

function readAdminKnownArchetypeKey(value) {
    if (Array.isArray(value)) {
        for (const entry of value) {
            const key = readAdminKnownArchetypeKey(entry);
            if (key) return key;
        }
        return null;
    }

    if (value && typeof value === 'object') {
        return readAdminKnownArchetypeKey(
            value.key
            ?? value.archetype
            ?? value.archetypeKey
            ?? value.current?.key
        );
    }

    const key = normalizeArchetypeKey(value);
    return key && CLASS_INDEX[key] ? key : null;
}

function readAdminArchetypeStepCount(value) {
    if (value === undefined || value === null || value === '') return null;

    const numericValue = Math.floor(Number(value));
    return Number.isFinite(numericValue)
        ? Math.max(0, numericValue)
        : null;
}

function clampAdminArchetypeSegmentSteps(key, steps, entity) {
    const normalizedSteps = readAdminArchetypeStepCount(steps);
    if (normalizedSteps === null) return null;

    const cycleLength = getCycleForKey(key, entity)?.length || 0;
    return cycleLength > 0
        ? Math.min(normalizedSteps, cycleLength)
        : normalizedSteps;
}

function normalizeAdminArchetypeSegment(rawSegment, fallbackKey = null, entity = null) {
    const key = readAdminKnownArchetypeKey(rawSegment ?? fallbackKey);
    if (!key || ADMIN_ARCHETYPE_EXCLUDED_PICKER_KEYS.has(key)) return null;

    const rawSteps = rawSegment && typeof rawSegment === 'object' && !Array.isArray(rawSegment)
        ? rawSegment.steps ?? rawSegment.step ?? rawSegment.points ?? rawSegment.count
        : null;

    return {
        key,
        steps: clampAdminArchetypeSegmentSteps(key, rawSteps, entity),
    };
}

function normalizeAdminArchetypeSegments(rawRoute, fallbackKey = null, entity = null) {
    const entries = Array.isArray(rawRoute)
        ? rawRoute
        : (rawRoute ? [rawRoute] : []);
    const route = entries
        .map(entry => normalizeAdminArchetypeSegment(entry, null, entity))
        .filter(Boolean);
    const fallback = normalizeAdminArchetypeSegment(fallbackKey, null, entity);

    if (!route.length && fallback) {
        route.push(fallback);
    }

    return route;
}

function readAdminArchetypeConfigSegments(entity) {
    const raw = entity?.reverseArchetype;
    const primary = readAdminKnownArchetypeKey(raw);

    if (Array.isArray(raw)) {
        return normalizeAdminArchetypeSegments(raw, primary, entity);
    }

    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        return normalizeAdminArchetypeSegments(
            Array.isArray(raw.route) ? raw.route : raw.path,
            primary,
            entity
        );
    }

    return normalizeAdminArchetypeSegments([], primary, entity);
}

function readAdminActiveArchetypeEntries(entity) {
    const arch = entity?.Archetype || {};
    const rows = [];
    const seen = new Set();

    const addEntry = (entry, state) => {
        const key = readAdminKnownArchetypeKey(entry);
        if (!key) return;

        const cycle = getCycleForKey(key, entity) || [];
        const cycleLength = cycle.length;
        const step = Math.max(0, Math.min(Math.floor(Number(entry?.step ?? 0) || 0), cycleLength || Number(entry?.step ?? 0) || 0));
        const level = Math.max(1, Math.floor(Number(entry?.level ?? 1) || 1));
        const uid = entry?.uid || `${key}-${level}-${state}`;
        const id = `${state}:${key}:${level}:${step}:${uid}`;
        if (seen.has(id)) return;
        seen.add(id);

        rows.push({
            key,
            label: getClassLabel(key),
            level,
            step,
            cycleLength,
            complete: state === 'achieve' || (cycleLength > 0 && step >= cycleLength),
            state,
        });
    };

    if (Array.isArray(arch.achieve)) {
        arch.achieve.forEach(entry => addEntry(entry, 'achieve'));
    }

    const progressEntries = [
        arch.current,
        ...(Array.isArray(arch.inProgress) ? arch.inProgress : []),
    ];
    const progressSeen = new Set();
    progressEntries.forEach(entry => {
        const key = readAdminKnownArchetypeKey(entry);
        const level = Math.max(1, Math.floor(Number(entry?.level ?? 1) || 1));
        const marker = `${key}:${level}`;
        if (!key || progressSeen.has(marker)) return;
        progressSeen.add(marker);
        addEntry(entry, 'inProgress');
    });

    return rows.filter(entry => entry.key !== 'inerte');
}

function readAdminActiveArchetypeSegments(entity) {
    return readAdminActiveArchetypeEntries(entity)
        .filter(entry => entry.key && !ADMIN_ARCHETYPE_EXCLUDED_PICKER_KEYS.has(entry.key))
        .filter(entry => entry.complete || entry.step > 0)
        .map(entry => ({
            key: entry.key,
            steps: clampAdminArchetypeSegmentSteps(entry.key, entry.step, entity),
            level: entry.level,
            step: entry.step,
            cycleLength: entry.cycleLength,
            complete: entry.complete,
            state: entry.state,
            label: entry.label,
        }));
}

function readAdminArchetypeSegments(entity) {
    const activeSegments = readAdminActiveArchetypeSegments(entity);
    const configuredSegments = readAdminArchetypeConfigSegments(entity);

    if (activeSegments.length) {
        if (configuredSegments.length <= activeSegments.length) return activeSegments;

        return [
            ...activeSegments,
            ...configuredSegments.slice(activeSegments.length).map(segment => ({
                ...segment,
                future: true,
                cycleLength: getCycleForKey(segment.key, entity)?.length || 0,
                label: getClassLabel(segment.key),
            }))
        ];
    }

    if (configuredSegments.length) return configuredSegments;

    return normalizeAdminArchetypeSegments(
        [],
        entity?.archetype ?? entity?.archetypes ?? entity?.archetypeKey,
        entity
    );
}

function writeAdminArchetypeRoute(entity, nextRoute) {
    if (!entity) return [];

    const route = normalizeAdminArchetypeSegments(nextRoute, null, entity);
    if (!route.length) return [];

    const raw = entity.reverseArchetype && typeof entity.reverseArchetype === 'object' && !Array.isArray(entity.reverseArchetype)
        ? { ...entity.reverseArchetype }
        : {};
    const primaryKey = route[0].key;
    raw.key = primaryKey;
    raw.mode = String(raw.mode || 'specialiste').toLowerCase() === 'polyvalent'
        ? 'polyvalent'
        : 'specialiste';
    raw.route = route.map(segment => ({
        key: segment.key,
        ...(segment.steps !== null ? { steps: segment.steps } : {})
    }));
    raw.path = raw.route.map(segment => segment.key);
    raw.secondary = Array.isArray(raw.secondary)
        ? raw.secondary
            .map(readAdminKnownArchetypeKey)
            .filter(key => key && key !== primaryKey && !ADMIN_ARCHETYPE_EXCLUDED_PICKER_KEYS.has(key))
        : [];
    entity.reverseArchetype = raw;
    return raw.route;
}

function getAdminArchetypeRatioDistance(sourceKey, targetKey) {
    const source = readAdminKnownArchetypeKey(sourceKey);
    const target = readAdminKnownArchetypeKey(targetKey);
    if (!source || !target || source === target) return 0;

    const sourceRatios = getArchetypeTargetRatios(source);
    const targetRatios = getArchetypeTargetRatios(target);
    if (!sourceRatios || !targetRatios) return Number.POSITIVE_INFINITY;

    const movedPoints = (
        Math.abs(sourceRatios.force - targetRatios.force) +
        Math.abs(sourceRatios.agilite - targetRatios.agilite) +
        Math.abs(sourceRatios.intelligence - targetRatios.intelligence)
    ) * 50;
    return Math.round(movedPoints * 10) / 10;
}

function readAdminArchetypeAttributCounters(entity) {
    return {
        force: Math.max(0, readAdminFinalStatValue(entity, 'strength')),
        agilite: Math.max(0, readAdminFinalStatValue(entity, 'agility')),
        intelligence: Math.max(0, readAdminFinalStatValue(entity, 'intelligence')),
    };
}

function scoreAdminArchetypeCounters(counters, targetRatios) {
    const total = ['force', 'agilite', 'intelligence'].reduce(
        (sum, key) => sum + (Number(counters[key]) || 0),
        0
    );

    if (total <= 0) return Number.POSITIVE_INFINITY;

    return ['force', 'agilite', 'intelligence'].reduce((score, key) => {
        const actual = (Number(counters[key]) || 0) / total;
        const target = Number(targetRatios?.[key] ?? 1 / 3) || 0;
        const diff = actual - target;
        return score + diff * diff;
    }, 0);
}

function chooseAdminArchetypeTransitionAttribut(counters, targetRatios) {
    let best = null;

    ['force', 'agilite', 'intelligence'].forEach(key => {
        const candidate = {
            ...counters,
            [key]: (Number(counters[key]) || 0) + 1,
        };
        const score = scoreAdminArchetypeCounters(candidate, targetRatios);
        const totalAfter = ['force', 'agilite', 'intelligence'].reduce(
            (sum, attr) => sum + (Number(candidate[attr]) || 0),
            0
        );
        const targetNeed =
            (Number(targetRatios?.[key] ?? 1 / 3) || 0) * totalAfter -
            (Number(counters[key]) || 0);

        if (
            !best ||
            score < best.score ||
            (score === best.score && targetNeed > best.targetNeed)
        ) {
            best = { key, score, targetNeed };
        }
    });

    return best?.key || 'force';
}

function calculateAdminArchetypeTransitionSteps(entity, sourceKey, targetKey, maxSteps) {
    const source = readAdminKnownArchetypeKey(sourceKey);
    const target = readAdminKnownArchetypeKey(targetKey);
    if (!target) return Number.POSITIVE_INFINITY;
    if (!source || source === target) return 0;

    const targetRatios = getArchetypeTargetRatios(target);
    if (!targetRatios) return Number.POSITIVE_INFINITY;

    const sourceRatios = getArchetypeTargetRatios(source);
    const currentCounters = readAdminArchetypeAttributCounters(entity);
    const currentTotal = currentCounters.force + currentCounters.agilite + currentCounters.intelligence;
    const counters = currentTotal > 0 || !sourceRatios
        ? { ...currentCounters }
        : {
            force: Math.round((Number(sourceRatios.force) || 0) * 100),
            agilite: Math.round((Number(sourceRatios.agilite) || 0) * 100),
            intelligence: Math.round((Number(sourceRatios.intelligence) || 0) * 100),
        };
    const searchLimit = Math.max(0, Math.ceil(Number(maxSteps) || 0));

    for (let step = 0; step <= searchLimit; step += 1) {
        const activeKey = normalizeArchetypeKey(
            getClassFromAttributs(
                counters.force,
                counters.agilite,
                counters.intelligence,
                readAdminEntityLevelValue(entity) + step,
                true,
                entity
            )
        );

        if (activeKey === target) return step;

        const attr = chooseAdminArchetypeTransitionAttribut(counters, targetRatios);
        counters[attr] += 1;
    }

    return Number.POSITIVE_INFINITY;
}

function readAdminArchetypeTransitionTolerance(editorKey = '') {
    const storedValue = editorKey
        ? ADMIN_ARCHETYPE_TRANSITION_TOLERANCES.get(editorKey)
        : undefined;
    const numericValue = Number(storedValue);
    return Number.isFinite(numericValue)
        ? Math.max(0, numericValue)
        : ADMIN_ARCHETYPE_DEFAULT_TRANSITION_TOLERANCE;
}

function setAdminArchetypeTransitionTolerance(editorKey = '', value) {
    if (!editorKey) return ADMIN_ARCHETYPE_DEFAULT_TRANSITION_TOLERANCE;

    const numericValue = Number(value);
    const tolerance = Number.isFinite(numericValue)
        ? Math.max(0, numericValue)
        : ADMIN_ARCHETYPE_DEFAULT_TRANSITION_TOLERANCE;
    ADMIN_ARCHETYPE_TRANSITION_TOLERANCES.set(editorKey, tolerance);
    return tolerance;
}

function formatAdminArchetypeRatios(key) {
    const ratios = getArchetypeTargetRatios(key);
    if (!ratios) return '';

    return [
        `F ${Math.round((Number(ratios.force) || 0) * 100)}`,
        `A ${Math.round((Number(ratios.agilite) || 0) * 100)}`,
        `I ${Math.round((Number(ratios.intelligence) || 0) * 100)}`,
    ].join(' / ');
}

function calculateAdminPostAwakeningPointBudget(entity) {
    const levelBudget = Math.max(0, readAdminEntityLevelValue(entity) - 1);
    const will = readAdminEffectiveWillValue(entity);
    const awakeningSteps = calculateAwakeningStepCount(will, {
        ...balanceData.level.will,
    });

    return Math.max(0, levelBudget - awakeningSteps);
}

function calculateAdminAllocatedRouteSteps(segments) {
    return (Array.isArray(segments) ? segments : [])
        .reduce((sum, segment) => {
            const steps = readAdminArchetypeStepCount(segment?.steps ?? segment?.step);
            return sum + (steps ?? 0);
        }, 0);
}

function calculateAdminRemainingRouteSteps(entity, segments) {
    return Math.max(
        0,
        calculateAdminPostAwakeningPointBudget(entity) - calculateAdminAllocatedRouteSteps(segments)
    );
}

function getAdminArchetypeCandidateOptions(entity, referenceKey = null, editorKey = '') {
    const ref = readAdminKnownArchetypeKey(referenceKey);
    const tolerance = readAdminArchetypeTransitionTolerance(editorKey);

    return Object.keys(CLASS_INDEX)
        .filter(key => !ADMIN_ARCHETYPE_EXCLUDED_PICKER_KEYS.has(key))
        .filter(key => {
            const cycle = getCycleForKey(key, entity);
            return Array.isArray(cycle) && cycle.length > 0;
        })
        .map(key => ({
            key,
            label: getClassLabel(key),
            cycleLength: getCycleForKey(key, entity)?.length || 0,
            distance: getAdminArchetypeRatioDistance(ref, key),
            transitionSteps: calculateAdminArchetypeTransitionSteps(entity, ref, key, tolerance),
            ratios: formatAdminArchetypeRatios(key),
        }))
        .filter(candidate => (
            !ref
            || candidate.key === ref
            || candidate.transitionSteps <= tolerance
        ))
        .sort((first, second) => (
            first.transitionSteps - second.transitionSteps
            || first.distance - second.distance
            || first.cycleLength - second.cycleLength
            || first.label.localeCompare(second.label)
        ));
}

function applyAdminArchetypeRouteChoice(entity, editorKey = '', nextRoute = []) {
    const route = normalizeAdminArchetypeSegments(nextRoute, null, entity);
    if (!route.length) return [];

    const targets = [entity].filter(Boolean);
    const requestedLevel = readAdminRequestedLevelValue(entity, editorKey);
    const willFlex = isAdminWillFlexEnabled(editorKey);

    targets.forEach(target => {
        const oldStats = cloneAdminPlainData(target.stats || {}, {});
        writeAdminArchetypeRoute(target, route);
        clearAdminGeneratedLevelSources(target);
        applyAdminRequestedLevelEnvelope(target, requestedLevel, editorKey, { willFlex });
        recomputeAdminEntityStats(target);
        refreshAdminEditedLiveEntity(target, oldStats);
    });

    refreshAdminVisibleAllStatInputs(editorKey, entity);
    return route;
}

function readAdminAttackKey(value) {
    if (value && typeof value === 'object') {
        return String(value.functionName || value.attackId || value.displayName || '').trim();
    }

    return String(value || '').trim();
}

function findAdminCatalogAttackDefinition(value) {
    const key = readAdminAttackKey(value);
    if (!key) return null;

    return ADMIN_ATTACK_DETAILS.find(attack => (
        attack.functionName === key
        || attack.attackId === key
        || attack.displayName === key
    )) || null;
}

function resolveAdminAttackDefinition(value) {
    const key = readAdminAttackKey(value);
    const fromCatalog = findAdminCatalogAttackDefinition(value);

    if (value && typeof value === 'object') {
        return fromCatalog ? { ...fromCatalog, ...value } : { ...value };
    }

    return fromCatalog || null;
}

function readAdminEntityAttackDefinitions(entity) {
    return readAttackDefinitionsForEntity(entity, ADMIN_ATTACK_DETAILS, { includeModifiers: false });
}

function formatAdminAttackListValue(values) {
    return (Array.isArray(values) ? values : [values].filter(Boolean))
        .map(value => String(value).replace(/Damage$/i, ''))
        .join(' + ') || 'none';
}

function formatAdminAttackRatios(attack) {
    const parts = [];
    if (Number.isFinite(Number(attack?.physicalRatio))) parts.push(`phys ${Number(attack.physicalRatio)}`);
    if (Number.isFinite(Number(attack?.magicalRatio))) parts.push(`mag ${Number(attack.magicalRatio)}`);
    if (Number.isFinite(Number(attack?.piercingRatio))) parts.push(`perc ${Number(attack.piercingRatio)}`);
    return parts.join(' / ') || 'ratios auto';
}

function normalizeAdminAttackArrayValue(value) {
    return normalizeAttackArrayValue(value);
}

function normalizeAdminAttackForStorage(attack) {
    return normalizeAttackDefinitionForEntity(attack, ADMIN_ATTACK_DETAILS);
}

function writeAdminEntityAttackList(entity, nextAttacks) {
    if (!entity) return [];

    const attackDefinitions = setEntityAttackDefinitions(
        entity,
        nextAttacks,
        ADMIN_ATTACK_DETAILS,
        { preferredAttack: entity.currentAttackId || entity.currentAttack || nextAttacks?.[0] }
    );

    return entity.attacks || attackDefinitions
        .map(attack => attack.functionName || readAdminAttackKey(attack))
        .filter(Boolean);
}

function refreshAdminEntityAttackState(entity, preferredAttack = null) {
    if (!entity) return null;

    const runningAttack = entity._combatAction && entites.includes(entity) ? entity.currentAttack : null;
    const attacks = readAdminEntityAttackDefinitions(entity);
    if (attacks.length) {
        setEntityAttackDefinitions(entity, attacks, ADMIN_ATTACK_DETAILS, {
            preferredAttack: preferredAttack || entity.currentAttackId || entity.currentAttack || attacks[0]
        });
    }

    const currentAttack = refreshEntityCurrentAttackDefinition(entity, ADMIN_ATTACK_DETAILS, {
        preferredAttack: preferredAttack || entity.currentAttackId || entity.currentAttack || entity.attacks?.[0]
    });

    if (Array.isArray(entity.attacks)) {
        determineClasse(entity);
    }

    // Edited definitions serve the next selection; the running attack keeps its launch state.
    if (runningAttack) entity.currentAttack = runningAttack;
    return currentAttack;
}

function applyAdminAttackListChoice(entity, editorKey = '', nextAttacks = []) {
    const resolvedAttacks = nextAttacks
        .map(resolveAdminAttackDefinition)
        .filter(Boolean);

    const targets = [entity].filter(Boolean);

    targets.forEach(target => {
        const oldStats = cloneAdminPlainData(target.stats || {}, {});
        writeAdminEntityAttackList(target, resolvedAttacks);
        recomputeAdminEntityStats(target);
        refreshAdminEditedLiveEntity(target, oldStats);
    });

    return resolvedAttacks;
}

function readAdminMenuState() {
    try {
        const parsed = JSON.parse(localStorage.getItem(ADMIN_MENU_STORAGE_KEY) || '{}');
        const mode = ['spawn', 'events', 'biome'].includes(parsed.mode)
            ? parsed.mode
            : (parsed.category === 'biome' ? 'biome' : 'spawn');
        return {
            mode,
            side: normalizeAdminSpawnSide(parsed.side),
            category: ['misc', 'items'].includes(parsed.category) ? parsed.category : 'entity',
            miscType: ['chest', 'corpse', 'crystal'].includes(parsed.miscType) ? parsed.miscType : null,
            miscStatus: String(parsed.miscStatus || '').trim().toLowerCase() || null,
            crystalLevel: PERMANENT_CRYSTAL_LEVELS.some(entry => entry.level === parsed.crystalLevel) ? parsed.crystalLevel : null,
            crystalAmounts: Object.fromEntries(Object.entries(parsed.crystalAmounts || {})
                .filter(([, amount]) => Number.isSafeInteger(amount) && amount >= 1)),
            infiniteItems: parsed.infiniteItems === true,
            biomeClass: levelBiome.some(biome => biome.classe === parsed.biomeClass)
                ? parsed.biomeClass
                : null
        };
    } catch {
        return {
            mode: 'spawn',
            side: 'A',
            category: 'entity',
            miscType: null,
            miscStatus: null,
            crystalLevel: null,
            crystalAmounts: {},
            infiniteItems: false,
            biomeClass: null
        };
    }
}

function writeAdminMenuState(state) {
    try {
        localStorage.setItem(ADMIN_MENU_STORAGE_KEY, JSON.stringify(state));
    } catch {
        // La persistance admin ne doit jamais bloquer l'outil de debug.
    }
}

function readAdminInvincibleMode() {
    return isAdminMode() && localStorage.getItem(ADMIN_INVINCIBLE_MODE_STORAGE_KEY) === 'true';
}

function writeAdminInvincibleMode(enabled) {
    const active = enabled === true;
    window.__adminInvincibleMode = active;
    localStorage.setItem(ADMIN_INVINCIBLE_MODE_STORAGE_KEY, active ? 'true' : 'false');
}

function readAdminCurrentStageId() {
    return String(
        window.currentStageId
        ?? localStorage.getItem('currentStageId')
        ?? localStorage.getItem('currentLevel')
        ?? ''
    ).trim();
}

function readAdminCurrentStage() {
    const stageId = readAdminCurrentStageId();
    if (!stageId) return null;

    try {
        const gameStageData = JSON.parse(localStorage.getItem('GameStages') || '{"stages":[]}');
        return (Array.isArray(gameStageData?.stages) ? gameStageData.stages : [])
            .find(candidate => String(candidate?.id) === stageId) || null;
    } catch {
        return null;
    }
}

function isAdminLevelActive() {
    if (!isAdminMode()) return false;
    if (window.levelRunning === 'admin') return true;

    const stage = readAdminCurrentStage();
    const isAdminStage = stage?.level_type === 'admin' || stage?.type === 'admin';
    if (!isAdminStage) return false;

    window.levelRunning = 'admin';
    const stageId = readAdminCurrentStageId();
    if (stageId) {
        window.currentStageId = stageId;
        localStorage.setItem('currentStageId', stageId);
    }

    return true;
}

function activateAdminBalanceExperience() {
    return Promise.resolve(getAvailablePlayerExperience());
}

function restoreAdminBalanceExperienceIfNeeded() {}

function getAdminScanEntityId(scanControl) {
    const explicitId = scanControl?.id?.replace(/^scan-control_/, '');
    if (explicitId && explicitId !== scanControl.id) return explicitId;

    const scanRoot = scanControl?.closest?.('[id^="ScanEntity_"]');
    return scanRoot?.id?.replace(/^ScanEntity_/, '') || null;
}

function injectAdminSoulScanStyle() {
    if (document.getElementById(ADMIN_SOUL_SCAN_STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = ADMIN_SOUL_SCAN_STYLE_ID;
    style.textContent = `
.scan-control .${ADMIN_SOUL_SCAN_BUTTON_CLASS} {
  cursor: pointer;
  width: 35px;
  height: 35px;
  z-index: 9999;
  border: 1px solid #ff9b00;
  background-image: url("./media/assets/ui/picto-soul.svg");
  background-repeat: no-repeat;
  background-position: center;
  background-size: 24px;
  margin-left: 8px;
}
.scan-control .${ADMIN_SOUL_SCAN_BUTTON_CLASS}:hover,
.scan-control .${ADMIN_SOUL_SCAN_BUTTON_CLASS}.active {
  background-color: #935a00;
}
.${ADMIN_SOUL_RESET_TOOLS_CLASS} {
  position: absolute;
  top: 8px;
  right: 18px;
  width: auto;
  display: flex;
  justify-content: center;
  pointer-events: auto;
  z-index: 10050;
}
.${ADMIN_SOUL_RESET_BUTTON_CLASS} {
  flex: 0 0 auto;
  cursor: pointer;
  padding: 6px 14px;
  border: 1px solid #ff4b4b;
  background: rgba(110, 0, 0, 0.55);
  color: #ffdddd;
  font-family: inherit;
  font-size: 14px;
  text-align: center;
  letter-spacing: 0;
  width: auto;
  min-width: 140px;
}
.${ADMIN_SOUL_RESET_BUTTON_CLASS}:hover {
  background: rgba(170, 0, 0, 0.7);
  color: #ffffff;
}
.section-content.soul.admin-soul-has-reset {
  position: relative;
}
.admin-entity-stat-button,
.admin-stat-editor-step-button {
  flex: 0 0 auto;
  cursor: pointer;
}
.admin-entity-row.admin-entity-catalog-row {
  gap: 8px;
}
.admin-entity-catalog-main,
.admin-stat-editor-name {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}
.admin-entity-catalog-level {
  flex: 0 0 auto;
}
.admin-entity-row.admin-stat-editor-header {
  cursor: default;
  color: #ffd36a;
  justify-content: center;
  letter-spacing: 2px;
  text-transform: uppercase;
  background: rgba(150, 92, 0, 0.18);
}
.admin-entity-row.admin-stat-editor-reset-row {
  cursor: default;
  flex-wrap: wrap;
  border-color: rgba(255, 75, 75, 0.42);
  background: rgba(80, 0, 0, 0.24);
}
.admin-stat-editor-action-buttons {
  flex: 0 0 auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}
.admin-base-stat-mode-label {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #ffd36a;
  cursor: pointer;
  font-size: 12px;
}
.admin-base-stat-mode-label input {
  cursor: pointer;
}
.admin-stat-editor-reset-row button {
  flex: 0 0 auto;
  cursor: pointer;
}
.admin-entity-row.admin-stat-editor-row {
  cursor: default;
  gap: 8px;
}
.admin-entity-row.admin-level-editor-row {
  border-color: rgba(0, 190, 255, 0.5);
  background: rgba(0, 120, 190, 0.14);
}
.admin-level-editor-row .admin-stat-editor-name {
  color: #9fe8ff;
}
.admin-stat-editor-controls {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 4px;
}
.admin-level-flex-label {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: #ffd36a;
  cursor: pointer;
  font-size: 12px;
}
.admin-level-flex-label input {
  cursor: pointer;
}
.admin-level-flex-summary {
  flex: 0 0 auto;
  min-width: 52px;
  color: #9fe8ff;
  font-size: 11px;
  opacity: 0.85;
}
.admin-stat-editor-input {
  width: 62px;
  min-width: 0;
  box-sizing: border-box;
  text-align: center;
  color: #fff4d6;
  background: rgba(0, 0, 0, 0.55);
  border: 1px solid rgba(217, 155, 0, 0.42);
}
.admin-crystal-amount {
  color: inherit;
}
.admin-crystal-amount:invalid {
  border-color: #e86379;
}
.admin-entity-side-select {
  width: 100px;
  padding: 3px 6px;
}
.admin-stat-editor-row.is-edited {
  border-color: rgba(0, 190, 255, 0.7);
  background: rgba(0, 120, 190, 0.16);
}
#admin-entity-form.admin-has-entity-tools {
  padding-right: 48px;
}
.admin-editor-side-tabs {
  position: absolute;
  top: 72px;
  right: -42px;
  display: flex;
  flex-direction: column;
  gap: 7px;
  z-index: 10020;
}
.admin-editor-side-tabs[hidden] {
  display: none;
}
.admin-editor-tool-tab {
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border: 1px solid rgba(217, 155, 0, 0.42);
  background: rgba(8, 8, 8, 0.78);
  color: #fff4d6;
  padding: 0;
}
.admin-editor-tool-tab:hover,
.admin-editor-tool-tab.active {
  border-color: #d99b00;
  background: rgba(217, 155, 0, 0.28);
}
.admin-editor-tool-icon {
  width: 24px;
  height: 24px;
  display: block;
  background-repeat: no-repeat;
  background-position: center;
  background-size: contain;
}
.admin-editor-tool-icon--archetypes {
  background-image: url("./media/assets/ui/picto-soul.svg");
}
.admin-editor-tool-icon--active-entity {
  display: flex;
  align-items: center;
  justify-content: center;
  background-image: none;
}
.admin-editor-tool-icon--active-entity::before {
  content: "◎";
  color: #9fe8ff;
  font-size: 22px;
  line-height: 1;
}
.admin-editor-tool-icon--attacks {
  background-image: url("./media/assets/misc/stat-type-attack.png");
}
.admin-entity-row.admin-archetype-row,
.admin-entity-row.admin-attack-row {
  cursor: default;
  gap: 8px;
}
.admin-archetype-row.is-complete {
  color: #ffd36a;
  border-color: rgba(217, 155, 0, 0.55);
  background: rgba(217, 155, 0, 0.14);
}
.admin-archetype-row.is-progress {
  color: #fff4d6;
}
.admin-archetype-main,
.admin-attack-main {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.admin-archetype-title,
.admin-attack-title {
  font-weight: 700;
}
.admin-archetype-detail,
.admin-attack-detail {
  font-size: 11px;
  opacity: 0.75;
}
.admin-archetype-actions,
.admin-attack-actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 4px;
}
.admin-attack-editor-field-row {
  cursor: default;
  gap: 8px;
}
.admin-attack-editor-field-label {
  flex: 1 1 auto;
  min-width: 0;
  color: #fff4d6;
}
.admin-attack-editor-input {
  min-width: 0;
}
.admin-attack-editor-input--text {
  flex: 0 1 170px;
  box-sizing: border-box;
  color: #fff4d6;
  background: rgba(0, 0, 0, 0.55);
  border: 1px solid rgba(217, 155, 0, 0.42);
  padding: 3px 5px;
}
.admin-attack-editor-input--text.is-readonly {
  opacity: 0.62;
  border-color: rgba(255, 244, 214, 0.22);
}
.admin-attack-editor-section {
  margin-top: 4px;
}
.admin-entity-row.admin-attack-effect-toggle {
  justify-content: flex-start;
  gap: 8px;
  cursor: pointer;
}
.admin-attack-effect-toggle input[type="checkbox"] {
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: #d99b00;
}
.admin-attack-effect-toggle:has(input:checked) {
  background: rgba(217, 155, 0, 0.15);
}
.admin-attack-effect-toggle:focus-within {
  outline: 1px solid #d99b00;
  outline-offset: -1px;
}
.admin-entity-row.admin-archetype-tolerance-row {
  cursor: default;
  gap: 8px;
  border-color: rgba(0, 190, 255, 0.42);
  background: rgba(0, 120, 190, 0.12);
}
.admin-archetype-tolerance-label {
  flex: 1 1 auto;
  min-width: 0;
  color: #9fe8ff;
}
.admin-archetype-tolerance-controls {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
}
.admin-archetype-tolerance-input {
  width: 58px;
  min-width: 0;
  text-align: center;
  color: #fff4d6;
  background: rgba(0, 0, 0, 0.55);
  border: 1px solid rgba(0, 190, 255, 0.46);
}
.admin-archetype-pick-button,
.admin-attack-pick-button,
.admin-attack-remove-button {
  flex: 0 0 auto;
  cursor: pointer;
}
.admin-entity-row.admin-tool-empty-row {
  cursor: default;
  justify-content: center;
  color: rgba(255, 244, 214, 0.68);
}
#admin-entity-form.admin-mode-live-editor {
  border-color: rgba(0, 190, 255, 0.62);
  box-shadow: 0 0 12px rgba(0, 190, 255, 0.2);
}`;

    document.head.appendChild(style);
}

function injectAdminSoulScanButtons(root = document) {
    if (!isAdminLevelActive()) return;

    const scanControls = [];
    if (root.matches?.('.scan-control')) scanControls.push(root);
    root.querySelectorAll?.('.scan-control').forEach(scanControl => {
        if (!scanControls.includes(scanControl)) scanControls.push(scanControl);
    });

    scanControls.forEach(scanControl => {
        if (scanControl.querySelector(`.${ADMIN_SOUL_SCAN_BUTTON_CLASS}`)) return;

        const entityId = getAdminScanEntityId(scanControl);
        if (!entityId) return;

        const button = document.createElement('span');
        button.id = `adminSoulScan_${entityId}`;
        button.className = ADMIN_SOUL_SCAN_BUTTON_CLASS;
        button.dataset.entityId = entityId;
        button.setAttribute('role', 'button');
        button.setAttribute('tabindex', '0');
        button.setAttribute('aria-label', 'Soul admin');
        scanControl.appendChild(button);
    });
}

function removeAdminSoulScanButtons() {
    document
        .querySelectorAll(`.${ADMIN_SOUL_SCAN_BUTTON_CLASS}`)
        .forEach(button => button.remove());
}

function removeAdminSoulResetButtons() {
    document
        .querySelectorAll(`.${ADMIN_SOUL_RESET_TOOLS_CLASS}`)
        .forEach(tools => tools.remove());

    document
        .querySelectorAll('.section-content.soul.admin-soul-has-reset')
        .forEach(section => section.classList.remove('admin-soul-has-reset'));
}

function showAdminLauncherButtonFromSoul() {
    if (!isAdminLevelActive() || document.getElementById('admin-open-btn')) return;

    const button = document.createElement('button');
    button.id = 'admin-open-btn';
    button.type = 'button';
    button.textContent = 'Admin';
    button.className = 'admin-open-btn';
    button.addEventListener('click', () => {
        button.remove();
        initializeAdminLevel(window.__adminEntityCatalog || []);
    });
    ensureGameShell().appendChild(button);
}

const ADMIN_LIVE_ENTITY_SINGLE_CLICK_DELAY_MS = 450;

function clearPendingAdminLiveEntityClick() {
    if (window.__adminLiveEntityClickTimer) {
        clearTimeout(window.__adminLiveEntityClickTimer);
        window.__adminLiveEntityClickTimer = null;
    }
}

function removeAdminSpawnInterceptors() {
    clearPendingAdminLiveEntityClick();

    if (window.__adminDropInterceptor) {
        document.removeEventListener('drop', window.__adminDropInterceptor, true);
        window.__adminDropInterceptor = null;
    }

    if (window.__adminDragOverInterceptor) {
        document.removeEventListener('dragover', window.__adminDragOverInterceptor, true);
        window.__adminDragOverInterceptor = null;
    }

    if (window.__adminBoardEntityEditClickInterceptor) {
        ['pointerdown', 'mousedown', 'click', 'dblclick'].forEach(eventName => {
            document.removeEventListener(eventName, window.__adminBoardEntityEditClickInterceptor, true);
        });
        window.__adminBoardEntityEditClickInterceptor = null;
    }

    if (window.__adminBoardEntityEditBoxObserver) {
        window.__adminBoardEntityEditBoxObserver.disconnect();
        window.__adminBoardEntityEditBoxObserver = null;
    }

    document.querySelectorAll?.('.entite-box[id^="Box_Entite_"]').forEach(box => {
        const handler = box.__adminLiveEntityBoxHandler;
        if (!handler) return;

        ['pointerdown', 'mousedown', 'click', 'dblclick'].forEach(eventName => {
            box.removeEventListener(eventName, handler, true);
        });
        delete box.__adminLiveEntityBoxHandler;
        delete box.dataset.adminLiveEditBound;
    });
}

export function closeAdminEntityFormOnly() {
    if (!isAdminLevelActive() || !document.getElementById('admin-entity-form')) return;
    document.getElementById('admin-entity-form')?._rememberNavigation?.();
    document.getElementById('admin-entity-form')?.remove();
    setAdminSelectedEntity(null);
    window.__adminActiveLiveEntityId = null;
    window.__adminActiveLiveEntityDraft = null;
    removeAdminSpawnInterceptors();
    showAdminLauncherButtonFromSoul();
    installAdminSoulTools();
}

function closeAdminPanelsForSoulOpen() {
    document
        .querySelectorAll('.entite-details')
        .forEach(panel => panel.remove());

    closeAdminEntityFormOnly();
}

function getSelectedArmyA() {
    const selectedArmyA = loadFromLocalStorage('selectedArmyA', []);
    return Array.isArray(selectedArmyA) ? selectedArmyA : [];
}

function getArmyBStorage() {
    const armyBData = loadFromLocalStorage('ArmyB', { armies: {} });
    return armyBData && typeof armyBData === 'object'
        ? armyBData
        : { armies: {} };
}

function findAdminEntityById(entityId) {
    const id = String(entityId);
    const liveEntity = entites.find(entity => String(entity?.id) === id);
    if (liveEntity) return liveEntity;

    const armyAEntity = getSelectedArmyA().find(entity => String(entity?.id) === id);
    if (armyAEntity) return armyAEntity;

    const armyBData = getArmyBStorage();
    for (const armyData of Object.values(armyBData.armies || {})) {
        const entity = armyData?.entities?.find(candidate => String(candidate?.id) === id);
        if (entity) return entity;
    }

    return null;
}

function slugAdminFilePart(value, fallback = 'admin') {
    return String(value || fallback)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9_-]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase() || fallback;
}

function downloadAdminJson(filename, data) {
    const json = JSON.stringify(data, null, 4);
    const blob = new Blob([json], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
    return json;
}

function getAdminActiveEntityForExport() {
    const focusedId = getFocusedEntityIdFromDOM();
    const activeId = focusedId || window.__adminActiveLiveEntityId || null;
    const activeDraft = window.__adminActiveLiveEntityDraft;

    if (activeDraft && (!activeId || String(activeDraft.id) === String(activeId))) {
        return activeDraft;
    }

    return activeId ? findAdminEntityById(activeId) : null;
}

function getAdminEntitiesForExportScope() {
    const activeEntity = getAdminActiveEntityForExport();
    if (activeEntity) return [activeEntity];

    if (Array.isArray(entites) && entites.length > 0) return entites;

    const selectedArmyA = getSelectedArmyA();
    const armyBData = getArmyBStorage();
    const armyBEntities = Object
        .values(armyBData.armies || {})
        .flatMap(army => Array.isArray(army?.entities) ? army.entities : []);

    return [...selectedArmyA, ...armyBEntities];
}

function getAdminExportScopeLabel() {
    return getAdminActiveEntityForExport() ? 'single' : 'all';
}

function cleanAdminEntityForNestExport(entity) {
    const data = cloneAdminEntityForStorage(entity);
    const skipKeys = new Set([
        'stats',
        'currentAttack',
        'currentAttackId',
        'currentPhase',
        'targetStatut',
        'lastAttackTime',
        'preparationTime',
        'executionTime',
        'recoveryTime',
        'cooldown',
        'baseTimings',
        'hasteDebug',
        'projectiles',
        'kills',
        'isDEAD',
        'focused',
        'target',
        'targetId'
    ]);
    const orderedKeys = [
        'serial',
        'id',
        'power',
        'name',
        'class',
        'gender',
        'type',
        'lore',
        'description',
        'sprite',
        'portrait',
        'DeadSprite',
        'attacks',
        'attackDetails',
        'reverseArchetype',
        'level',
        'stuff',
        'baseStats',
        'side',
        'position',
        'role',
        'classe'
    ];
    const result = {};

    data.attacks = readAdminEntityAttackDefinitions(data)
        .map(attack => attack.functionName || readAdminAttackKey(attack))
        .filter(Boolean);
    if (data.attackDetails !== undefined) {
        data.attackDetails = readAdminEntityAttackDefinitions(data)
            .map(normalizeAdminAttackForStorage)
            .filter(Boolean);
    }
    data.level = readAdminEntityLevelValue(data);

    orderedKeys.forEach(key => {
        if (skipKeys.has(key) || data[key] === undefined) return;
        result[key] = data[key];
    });

    Object.keys(data).forEach(key => {
        if (skipKeys.has(key) || result[key] !== undefined || data[key] === undefined) return;
        result[key] = data[key];
    });

    return result;
}

function cleanAdminAttackForListExport(attack) {
    return normalizeAdminAttackForStorage(attack);
}

function getAdminAttackEffectsForExport(attacks) {
    const effectNames = new Set();

    attacks.forEach(attack => {
        normalizeAdminAttackArrayValue(attack?.effets).forEach(name => effectNames.add(name));
        normalizeAdminAttackArrayValue(attack?.selfEffects).forEach(name => effectNames.add(name));
    });

    return listAttackEffects()
        .filter(effect => effectNames.has(effect.effectName))
        .map(effect => cloneAdminPlainData(effect, {}));
}

function buildAdminAttackExportPayload(entities) {
    const attacks = [];
    const seen = new Set();
    const sourceEntities = Array.isArray(entities) ? entities.filter(Boolean) : [];

    const addAttack = attack => {
        const clean = cleanAdminAttackForListExport(attack);
        if (!clean) return;

        const key = readAdminAttackKey(clean);
        if (!key || seen.has(key)) return;

        seen.add(key);
        attacks.push(clean);
    };

    if (sourceEntities.length > 0) {
        sourceEntities.forEach(entity => {
            readAdminEntityAttackDefinitions(entity).forEach(addAttack);
        });
    }

    if (!attacks.length && sourceEntities.length === 0) {
        ADMIN_ATTACK_DETAILS.forEach(addAttack);
    }

    return {
        attackDetails: attacks,
        attackEffects: getAdminAttackEffectsForExport(attacks)
    };
}

function refreshAdminExportButtonLabels() {
    const single = getAdminExportScopeLabel() === 'single';
    const dataButton = document.getElementById('downloadAdminEntityData');
    const entityButton = document.getElementById('exportAdminEntities');
    const attackButton = document.getElementById('exportAdminAttacks');

    if (dataButton) dataButton.textContent = single
        ? 'Télécharger Données Entité'
        : 'Télécharger Données Entités';
    if (entityButton) entityButton.textContent = single
        ? 'Exporter Entité'
        : 'Exporter Entités';
    if (attackButton) attackButton.textContent = single
        ? 'Exporter Attaque'
        : 'Exporter Attaques';
}

function captureAdminEntityStorageOrigin(entityId, entite = null) {
    const id = String(entityId);
    const selectedArmyA = getSelectedArmyA();
    const armyBData = getArmyBStorage();
    const armyBIds = [];

    const rawInArmyA = selectedArmyA.some(entity => String(entity?.id) === id);
    const normalizedSide = String(entite?.side || '').toUpperCase();
    const inArmyA = rawInArmyA && (!normalizedSide || normalizedSide === 'A');

    for (const [armyId, armyData] of Object.entries(armyBData.armies || {})) {
        const entities = Array.isArray(armyData?.entities) ? armyData.entities : [];
        if (entities.some(entity => String(entity?.id) === id)) {
            armyBIds.push(armyId);
        }
    }

    return {
        entityId: id,
        side: entite?.side || (inArmyA ? 'A' : (armyBIds.length > 0 ? 'B' : 'neutral')),
        inArmyA,
        armyBIds
    };
}

function removeAdminEntityFromArmyA(entityId) {
    const id = String(entityId);
    const selectedArmyA = getSelectedArmyA();
    const filteredArmyA = selectedArmyA.filter(entity => String(entity?.id) !== id);

    if (filteredArmyA.length !== selectedArmyA.length) {
        saveToLocalStorage('selectedArmyA', filteredArmyA);
    }
}

function cloneAdminEntityForStorage(entite) {
    const ancestors = [];

    return JSON.parse(JSON.stringify(entite, function (key, value) {
        if (typeof value === 'function' || typeof value === 'symbol') return undefined;

        if (
            typeof Node !== 'undefined' && value instanceof Node
            || typeof Window !== 'undefined' && value instanceof Window
            || typeof Document !== 'undefined' && value instanceof Document
        ) {
            return undefined;
        }

        if (value && typeof value === 'object') {
            while (ancestors.length && ancestors[ancestors.length - 1] !== this) ancestors.pop();
            if (ancestors.includes(value)) return undefined;
            ancestors.push(value);
        }

        return value;
    }));
}

function isAdminEntityDead(entity) {
    return Boolean(entity && (entity.isDEAD || entity.statut?.includes('dead')
        || Number(entity.stats?.HP?.current) <= 0));
}

export async function resurrectAdminEntity(entity) {
    if (!isAdminLevelActive() || !entites.includes(entity) || !isAdminEntityDead(entity)) return false;
    const box = document.getElementById(`Box_Entite_${entity.id}`);
    const hex = box?.closest('.hex');
    if (!hex) throw new Error('Le corps de cette entité n’est plus sur le plateau.');
    if ([...hex.querySelectorAll('.entite-box')].some(other => other !== box
        && entites.some(candidate => String(candidate.id) === other.id.replace('Box_Entite_', '')
            && !isAdminEntityDead(candidate)))) throw new Error('La case du corps est occupée par une autre entité.');
    const maxHP = Number(entity.stats?.HP?.max);
    if (!(maxHP > 0)) throw new Error('Les HP maximum doivent être supérieurs à zéro.');
    const [effects, game, clock, loot] = await Promise.all([
        import("../combat/effects.js"), import("../app/state.js"),
        import("../combat/clock.js"), import("../items/loot.js")
    ]);
    if (!isAdminLevelActive() || !entites.includes(entity) || !box.isConnected || !isAdminEntityDead(entity)) return false;
    // Keep a running battle running; a finished encounter returns to its launch button.
    if (game.isBattleFinished() || !entites.some(other => other !== entity && !isAdminEntityDead(other))) {
        game.StopGame({ preserveScene: true });
        game.resetBattleResolution();
        game.setOrderSide(null);
        document.querySelectorAll('.overlay-end-screen').forEach(overlay => overlay.remove());
        sessionStorage.removeItem('globalGameOverScreen');
    }
    const oldStats = cloneAdminPlainData(entity.stats, {});
    effects.clearCombatEffects(entity);
    loot.closeOpenLootInterfaces();
    entity.isDEAD = true; // Normalize corpses whose only death marker was HP = 0.
    entity.corpseConsumed = false;
    entity.corpseDestroyed = false;
    entity.status = 'active';
    entity.battleStopped = false;
    if (!effects.rez(entity, { restoredHP: maxHP })) return false;
    refreshAdminEditedLiveEntity(entity, oldStats);
    updateCombatantRoleIndex();
    updateCombatantTargetZones();
    game.manageBattleActions({ mode: game.BATTLE_ACTION_MODE.AUTO, dialogueActive: false, entityList: entites });
    clock.notifyCombatAction();
    return true;
}

export async function duplicateAdminEntity(source) {
    if (!source?.id || !isAdminLevelActive()) return null;
    const hexes = [...document.querySelectorAll('.hex[data-position]')];
    const free = hex => !hex.querySelector('[data-ground-summon]')
        && planEntityPlacements([{entity:{...source,id:'admin-size-preview'},hex}]).valid;
    const sideClass = source.side === 'neutral' ? 'Neutral' : `Side${source.side}`;
    const hex = hexes.find(hex => hex.classList.contains(sideClass) && free(hex)) || hexes.find(free);
    if (!hex) throw new Error('Aucune case libre pour dupliquer cette entité.');
    const copy = cloneAdminEntityForStorage(source);
    let id;
    do { id = generateUniqueID(); } while (!id || String(id) === String(source.id)
        || entites.some(entity => String(entity.id) === String(id)));
    const identities = new Map();
    for (const attack of [...(copy.attackDetails || []), ...(copy.nativeAttacks || [])]) {
        if (!attack.entityAttackId || identities.has(attack.entityAttackId)) continue;
        const attackId = `entityAttack-${id}-${crypto.randomUUID()}`;
        identities.set(attack.entityAttackId, attackId);
        if (attack.essenceBaseProfile?.id) identities.set(attack.essenceBaseProfile.id, `${attackId}:base`);
    }
    const equipmentIds = new Set(Object.values(copy.stuff || {}).flat());
    const items = applyArmorLayersToEquippedItems(source,
        applyResourceStocksToEquippedItems(source, loadEquippedItems()))
        .filter(item => equipmentIds.has(item.equippedId));
    if (items.length !== equipmentIds.size) throw new Error('Équipement introuvable : duplication annulée.');
    for (const item of items) {
        identities.set(item.itemId, `${item.itemId.split('-')[0]}-${crypto.randomUUID()}`);
        identities.set(item.equippedId, `e${crypto.randomUUID()}`);
    }
    // Remap both references and keyed ledgers, without resetting stocks or essence progress.
    const remap = (value, key = '') => {
        if (['ownerEntityId', 'entityId', 'boundTo', 'equippedTo'].includes(key) && String(value) === String(source.id)) return id;
        if (typeof value === 'string') {
            if (!identities.has(value)) {
                if (value.startsWith(`${source.id}-ess-`)) identities.set(value, createLinkedEssenceId(id));
                else if (value.startsWith(`${source.id}-socket-`)) identities.set(value, createAttackEssenceSocketId(id));
                else if (value.startsWith('uess-')) identities.set(value, createUniversalEssenceId());
            }
            return identities.get(value) ?? value;
        }
        if (Array.isArray(value)) return value.map(entry => remap(entry, key));
        if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
            .map(([name, entry]) => [remap(name), remap(entry, name)]));
        return value;
    };
    const entity = remap(copy);
    entity.id = id;
    entity.position = hex.dataset.position;
    entity.battlePosition = entity.position;
    // Combat continuations and DOM bindings belong to the original instance only.
    for (const key of Object.keys(entity)) {
        if (/^__|(?:Interval|Timeout|Timer|Animation)(?:Id)?$/i.test(key)
            || ['target', 'targetId', 'targetStatut', 'projectiles', 'currentPhase', 'focused',
                'preparationTime', 'executionTime', 'recoveryTime', 'isATBFull', 'battleStopped'].includes(key)) delete entity[key];
    }
    entity.status = 'active';
    entity.battleStopped = false;
    const duplicates = items.map(item => remap(cloneAdminPlainData(item)));
    for (const item of duplicates) addToEquippedItemsStorage(item.equippedId, item);
    try {
        prepareHexForSide(hex, entity.side);
        await spawnEntiteIngame(entity, { restoreHP: false });
    } catch (error) {
        // Failed creation must not leave unattached copies in the admin inventory.
        for (const item of duplicates) {
            removeFromEquippedItemsStorage(item.equippedId);
            removeItem(item.itemId);
        }
        throw error;
    }
    const boosts = Object.values(entity.battleBoosts || {}).flat();
    entity.battleBoosts = {};
    for (const boost of boosts) {
        const durationMs = boost.expiresAt == null ? null : Math.max(0, boost.expiresAt - Date.now());
        if (durationMs === 0) continue;
        entityBattleBooste(entity, { ...boost, durationMs });
    }
    syncEntityLinkedEssenceInventory(entity);
    const { gameStarted, isBattleFinished } = await import("../app/state.js");
    if (gameStarted && !isBattleFinished() && !entity.isDEAD && ['A', 'B'].includes(entity.side)) {
        const { entiteTurn } = await import("../combat/loop.js");
        entiteTurn(entity, entites.filter(other => other.side !== entity.side), { resume: true });
    }
    return entity;
}

const ADMIN_LIVE_ACTION_KEYS = new Set([
    '_combatAction', '_phaseTimer', '_resumePhaseTimer', '_turnStage', '_resumeCombat',
    'currentPhase', 'speedTimer', 'preparationTime', 'preparationProgressRatio',
    'executionTime', 'recoveryTime', 'cooldownTimer', 'isATBFull', 'projectiles',
    'mysticTrance', 'isMysticTrance', 'mysticismTranceEndTO', 'stopMysticismAnimation',
    'stopPreparationAnimation', 'stopRecoveryAnimation', 'turnCount', 'lastAttackTime',
    '_targetSearch', 'controlIntervals', 'controlEffects', 'controlStates', 'executionRecoils',
    '_combatOriginalSide', 'orderPhase', 'hasFled', 'isDEAD', 'dead', 'statut', 'battleStopped',
]);

function replaceAdminEntityData(target, source) {
    if (!target || !source) return;

    const data = cloneAdminEntityForStorage(source);
    // A draft may predate this turn or contain a completed action. Timers retain
    // references to the live state: never delete it or replace it with that copy.
    const live = entites.includes(target);
    const keep = key => live && (ADMIN_LIVE_ACTION_KEYS.has(key)
        || (target._combatAction && key === 'currentAttack'));
    Object.keys(target).forEach(key => {
        if (key.startsWith('__admin') || keep(key)) return;
        delete target[key];
    });

    Object.entries(data).forEach(([key, value]) => {
        if (keep(key)) return;
        target[key] = value;
    });
}

export function applyAdminLiveEntityDraft(liveTarget, draft, { refresh = true } = {}) {
    if (!liveTarget || !draft) return null;

    const previousSide = normalizeAdminSpawnSide(liveTarget.side);
    const nextSide = normalizeAdminSpawnSide(draft.side ?? liveTarget.side);
    // A test-side change does not transfer ownership between saved armies.
    if (refresh && liveTarget.id && !ADMIN_SOUL_ENTITY_ORIGINS.has(String(liveTarget.id))) {
        ADMIN_SOUL_ENTITY_ORIGINS.set(String(liveTarget.id), captureAdminEntityStorageOrigin(liveTarget.id, liveTarget));
    }
    const sizeResult = setEntitySizeInCells(liveTarget, entitySizeInCells(draft));
    if (!sizeResult.valid) throw new Error(sizeResult.reason);
    // Resizing may push this entity; a draft must not restore its previous anchor.
    draft.position = liveTarget.position; draft.battlePosition = liveTarget.battlePosition;
    const oldStats = cloneAdminPlainData(liveTarget.stats || {}, {});
    replaceAdminEntityData(liveTarget, draft);
    liveTarget.side = nextSide;
    refreshAdminEntityAttackState(liveTarget, draft.currentAttackId || draft.currentAttack);
    recomputeAdminEntityStats(liveTarget);

    if (refresh) {
        if (previousSide !== nextSide) refreshAdminEntitySide(liveTarget);
        refreshAdminEditedLiveEntity(liveTarget, oldStats);
    }

    return liveTarget;
}

function refreshAdminEntitySide(entity) {
    const side = entity.side;
    const roots = ['Box_Entite_', 'headsup-container_', 'ScanEntity_']
        .map(prefix => document.getElementById(`${prefix}${entity.id}`)).filter(Boolean);
    for (const root of roots) {
        for (const node of [root, ...root.querySelectorAll('[class]')]) {
            for (const prefix of ['', 'side-', 'img-side-']) {
                const classes = ADMIN_SPAWN_SIDES.map(entry => `${prefix}${entry.key}`);
                if (!classes.some(name => node.classList.contains(name))) continue;
                node.classList.remove(...classes);
                node.classList.add(`${prefix}${side}`);
            }
        }
    }
    const camp = document.querySelector(`#ScanEntity_${entity.id} .entity-camp`);
    if (camp) camp.textContent = `Camp ${side === 'neutral' ? 'Neutre' : side}`;
    const sprite = document.getElementById(`spriteContainer_${entity.id}`);
    if (sprite?.style.transform === 'scaleX(-1)' && side !== 'B') sprite.style.transform = '';
    const hud = document.getElementById(`headsup-container_${entity.id}`);
    const hudSide = document.querySelector(`.headsup-hud-side.side-${side}`);
    if (hudSide && hud) hudSide.appendChild(hud);
    // Neutral entities have no faction HUD, but keep their existing nodes for a return to A/B.
    if (hud) hud.hidden = side === 'neutral';
    clearBattleTargetDisplays();
    updateCombatantRoleIndex();
    updateCombatantTargetZones();
}

function saveAdminEntityToOriginalStorage(entite) {
    if (!entite?.id) return;

    const id = String(entite.id);
    const origin = ADMIN_SOUL_ENTITY_ORIGINS.get(id)
        || captureAdminEntityStorageOrigin(id, entite);
    let saved = false;

    if (origin.inArmyA) {
        const selectedArmyA = getSelectedArmyA();
        const index = selectedArmyA.findIndex(entity => String(entity?.id) === id);
        if (index !== -1) {
            selectedArmyA[index] = cloneAdminEntityForStorage(entite);
            saveToLocalStorage('selectedArmyA', selectedArmyA);
            saved = true;
        }
    } else {
        removeAdminEntityFromArmyA(id);
    }

    if (origin.armyBIds.length > 0) {
        const armyBData = getArmyBStorage();
        let touchedArmyB = false;

        origin.armyBIds.forEach(armyId => {
            const armyData = armyBData.armies?.[armyId];
            if (!Array.isArray(armyData?.entities)) return;

            const index = armyData.entities.findIndex(entity => String(entity?.id) === id);
            if (index === -1) return;

            armyData.entities[index] = cloneAdminEntityForStorage(entite);
            touchedArmyB = true;
            saved = true;
        });

        if (touchedArmyB) {
            saveToLocalStorage('ArmyB', armyBData);
        }
    }

    if (!saved) {
        console.log(`Soul admin : ${entite.name || entite.id} modifiée en mémoire seulement.`);
    }
}

function refreshAdminScanHeader(entite) {
    const scanRoot = document.getElementById(`ScanEntity_${entite.id}`);
    const title = scanRoot?.querySelector('.entity-name-info');
    const currentLevel = entite.level?.current ?? entite.level ?? 1;
    if (title) title.textContent = `lvl. ${currentLevel} - ${entite.name}`;
    const nickname = scanRoot?.querySelector('.entity-nickname-info');
    if (nickname) nickname.textContent = entite.nickname || '';
    const hudName = document.getElementById(`name_${entite.id}`);
    if (hudName) hudName.textContent = `${entite.id} - ${entite.nickname || entite.name || 'Entité inconnue'}`;
}

function reconcileAdminSoulEntity(entityId) {
    if (!isAdminLevelActive()) return;

    const entite = findAdminEntityById(entityId);
    if (!entite) return;

    saveAdminEntityToOriginalStorage(entite);
    refreshAdminScanHeader(entite);
}

function scheduleAdminSoulReconcile(entityId) {
    requestAnimationFrame(() => {
        window.setTimeout(() => reconcileAdminSoulEntity(entityId), 0);
    });
}

function updateAdminEntityHud(entite) {
    if (!entite?.id) return;

    const currentLevel = entite.level?.current ?? entite.level ?? 1;
    document.querySelectorAll('.entity-level').forEach(levelNode => {
        if (String(levelNode.dataset?.entityId) === String(entite.id)) {
            levelNode.textContent = String(currentLevel);
        }
    });

    if (!entite?.stats?.HP || typeof entite.stats.HP !== 'object') return;

    import("../entities/progression.js")
        .then(upgradeApi => {
            const hp = entite.stats.HP;
            const armor = entite.stats.armor || { current: 0, max: 0 };

            upgradeApi.updateHPCounters?.(entite.id, hp.current, hp.max);
            upgradeApi.updateHealthBar?.(
                hp.current,
                hp.max,
                armor.current ?? 0,
                armor.max ?? 0,
                entite.id
            );
        })
        .catch(error => {
            console.warn('Reset level admin : refresh HUD impossible.', error);
        });
}

async function resetAdminEntityLevel(entityId) {
    if (!isAdminLevelActive()) return;

    const entite = findAdminEntityById(entityId);
    if (!entite) {
        console.warn(`Reset level admin : entité ${entityId} introuvable.`);
        return;
    }

    ADMIN_SOUL_ENTITY_ORIGINS.set(
        String(entite.id),
        ADMIN_SOUL_ENTITY_ORIGINS.get(String(entite.id))
            || captureAdminEntityStorageOrigin(entite.id, entite)
    );

    const { resetEntityProgression } = await import("../entities/progression.js");
    const result = await resetEntityProgression(entite);
    if (!result.ok) {
        const { showGamePopupMessage } = await import("../ui/display.js");
        showGamePopupMessage({ title: 'Remise a zero impossible', message: result.message, tone: 'warning' });
        return result;
    }
    saveAdminEntityToOriginalStorage(entite);
    refreshAdminScanHeader(entite);
    updateAdminEntityHud(entite);

    document.getElementById(`codex-entity_${entite.id}`)?.remove();
    await openAdminSoulForEntity(entite.id);
    return result;
}

function injectAdminSoulResetButton(codex, entityId) {
    if (!codex || !isAdminLevelActive()) return;

    const levelUpSection = codex.querySelector('.level-up-section');
    if (!levelUpSection) return;

    const soulContent = levelUpSection.closest('.section-content.soul')
        || levelUpSection.parentElement
        || codex;

    soulContent.classList?.add('admin-soul-has-reset');

    // Level up can live inside a sub-panel or the Soul graph, not directly in Soul.
    let insertionAnchor = levelUpSection;
    while (insertionAnchor.parentElement !== soulContent) {
        insertionAnchor = insertionAnchor.parentElement;
    }

    let tools = Array.from(soulContent.children || [])
        .find(child => child.classList?.contains(ADMIN_SOUL_RESET_TOOLS_CLASS))
        || codex.querySelector(`.${ADMIN_SOUL_RESET_TOOLS_CLASS}`);

    if (!tools) {
        tools = document.createElement('div');
        tools.className = ADMIN_SOUL_RESET_TOOLS_CLASS;
    }

    if (tools.parentElement !== soulContent || tools.nextElementSibling !== insertionAnchor) {
        soulContent.insertBefore(tools, insertionAnchor);
    }

    let button = codex.querySelector(`.${ADMIN_SOUL_RESET_BUTTON_CLASS}`);
    if (!button) {
        button = document.createElement('button');
    }

    button.type = 'button';
    button.className = ADMIN_SOUL_RESET_BUTTON_CLASS;
    button.dataset.entityId = entityId;
    button.textContent = 'Remise à zéro';

    if (button.parentElement !== tools) {
        tools.appendChild(button);
    }
}

function injectVisibleAdminSoulResetButtons(root = document) {
    if (!isAdminLevelActive()) return;

    const codexPanels = [];
    const closestCodex = root.closest?.('[id^="codex-entity_"]');
    if (closestCodex) codexPanels.push(closestCodex);
    if (root.matches?.('[id^="codex-entity_"]') && !codexPanels.includes(root)) codexPanels.push(root);
    root.querySelectorAll?.('[id^="codex-entity_"]').forEach(codex => {
        if (!codexPanels.includes(codex)) codexPanels.push(codex);
    });

    codexPanels.forEach(codex => {
        const entityId = codex.id?.replace(/^codex-entity_/, '');
        if (!entityId || !codex.querySelector('.level-up-section')) return;
        injectAdminSoulResetButton(codex, entityId);
    });
}

function syncAdminSoulToolsDOM(root = document) {
    if (!isAdminLevelActive()) {
        uninstallAdminSoulTools();
        return;
    }

    injectAdminSoulScanStyle();
    injectAdminSoulScanButtons(root);
    injectVisibleAdminSoulResetButtons(root);
}

async function openAdminSoulForEntity(entityId, options = {}) {
    if (!isAdminLevelActive()) return;

    const entite = findAdminEntityById(entityId);
    if (!entite) {
        console.warn(`Soul admin : entité ${entityId} introuvable.`);
        return;
    }

    const origin = captureAdminEntityStorageOrigin(entite.id, entite);
    ADMIN_SOUL_ENTITY_ORIGINS.set(String(entite.id), origin);
    if (!origin.inArmyA) removeAdminEntityFromArmyA(entite.id);

    closeAdminPanelsForSoulOpen();
    setAdminSelectedEntity(entite.id);
    await activateAdminBalanceExperience();

    const gameUiContainer = document.querySelector('.Game-UI');
    if (!gameUiContainer) {
        console.warn('Soul admin : .Game-UI introuvable.');
        return;
    }

    let menuMapContainer = gameUiContainer.querySelector('.menu-map-container');
    if (!menuMapContainer) {
        menuMapContainer = document.createElement('div');
        menuMapContainer.classList.add('menu-map-container');
        gameUiContainer.appendChild(menuMapContainer);
    }

    const codexApi = await import("../ui/codex/index.js");
    const menus = await import("../ui/navigation.js");
    const codexId = `codex-entity_${entite.id}`;
    let codex = document.getElementById(codexId);

    if (!codex) {
        if (!options.shiftKey) {
            menuMapContainer
                .querySelectorAll('.codex-entity-scan')
                .forEach(node => node.remove());
            document.querySelector('.army-codex-list')?.classList.remove('dual');
        }

        codexApi.createCodexEntityScan(
            entite,
            menuMapContainer,
            codexId,
            options.shiftKey ? 'right' : ''
        );
        codex = document.getElementById(codexId);
    }

    requestAnimationFrame(() => {
        injectAdminSoulResetButton(codex, entite.id);
        menus.MenuContainerDisplayRules?.();
        menus.enforceMenuDisplayRules?.();
    });
}

function handleAdminSoulScanClick(event) {
    const button = event.target?.closest?.(`.${ADMIN_SOUL_SCAN_BUTTON_CLASS}`);
    if (!button || !isAdminLevelActive()) return;

    event.preventDefault();
    event.stopPropagation();
    openAdminSoulForEntity(button.dataset.entityId, { shiftKey: event.shiftKey });
}

function handleAdminSoulScanKeydown(event) {
    const button = event.target?.closest?.(`.${ADMIN_SOUL_SCAN_BUTTON_CLASS}`);
    if (!button || !isAdminLevelActive()) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;

    event.preventDefault();
    event.stopPropagation();
    openAdminSoulForEntity(button.dataset.entityId, { shiftKey: event.shiftKey });
}

function handleAdminSoulConfirmClick(event) {
    if (!isAdminLevelActive()) return;

    const confirmButton = event.target?.closest?.('.confirm-button.yes.level');
    if (!confirmButton) return;

    const codex = confirmButton.closest('[id^="codex-entity_"]');
    const entityId = codex?.id?.replace(/^codex-entity_/, '');
    if (!entityId) return;

    scheduleAdminSoulReconcile(entityId);
}

function handleAdminSoulResetClick(event) {
    const button = event.target?.closest?.(`.${ADMIN_SOUL_RESET_BUTTON_CLASS}`);
    if (!button || !isAdminLevelActive()) return;

    event.preventDefault();
    event.stopPropagation();
    resetAdminEntityLevel(button.dataset.entityId);
}

function installAdminSoulTools() {
    if (!isAdminLevelActive()) return;

    syncAdminSoulToolsDOM();

    if (window.__adminSoulTools) return;

    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType !== Node.ELEMENT_NODE) return;
                if (node.matches?.('.scan-control')) {
                    injectAdminSoulScanButtons(node.parentElement || document);
                    return;
                }
                if (node.querySelector?.('.scan-control')) {
                    injectAdminSoulScanButtons(node);
                }
                if (node.matches?.('[id^="codex-entity_"]') || node.querySelector?.('.level-up-section')) {
                    injectVisibleAdminSoulResetButtons(node);
                }
            });
        });
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    document.addEventListener('click', handleAdminSoulScanClick, true);
    document.addEventListener('keydown', handleAdminSoulScanKeydown, true);
    document.addEventListener('click', handleAdminSoulConfirmClick, true);
    document.addEventListener('click', handleAdminSoulResetClick, true);

    const intervalId = window.setInterval(
        () => syncAdminSoulToolsDOM(),
        ADMIN_SOUL_SYNC_INTERVAL_MS
    );

    window.__adminSoulTools = { observer, intervalId };
}

function uninstallAdminSoulTools() {
    window.__adminSoulTools?.observer?.disconnect?.();
    if (window.__adminSoulTools?.intervalId) {
        window.clearInterval(window.__adminSoulTools.intervalId);
    }
    window.__adminSoulTools = null;

    document.removeEventListener('click', handleAdminSoulScanClick, true);
    document.removeEventListener('keydown', handleAdminSoulScanKeydown, true);
    document.removeEventListener('click', handleAdminSoulConfirmClick, true);
    document.removeEventListener('click', handleAdminSoulResetClick, true);
    removeAdminSoulScanButtons();
    removeAdminSoulResetButtons();
    document.getElementById(ADMIN_SOUL_SCAN_STYLE_ID)?.remove();
}

function getAdminEventApproachLabel(choice) {
    const resolution = choice?.resolution || {};
    const approach = String(
        resolution.adminLabel
        || resolution.label
        || resolution.approach
        || choice?.text
        || 'branche'
    ).trim();
    const condition = resolution.condition
        ? String(resolution.condition).trim()
        : '';

    return condition ? `${approach} ${condition}` : approach;
}

function getAdminEventFirstChoiceNode(eventDefinition) {
    const nodes = eventDefinition?.nodes || {};
    const visited = new Set();
    let nodeId = eventDefinition?.startNodeId;

    for (let depth = 0; nodeId && depth < 40; depth += 1) {
        if (visited.has(nodeId)) break;
        visited.add(nodeId);

        const node = nodes[nodeId];
        if (!node) break;

        const choices = Array.isArray(node.choices) ? node.choices : [];
        if (choices.length > 0) return node;

        nodeId = node.next || null;
    }

    return null;
}

function getAdminEventResolutionBranches(eventDefinition, choice) {
    const outcomes = choice?.resolution?.outcomes;
    if (!outcomes || typeof outcomes !== 'object') return [];

    const approachLabel = getAdminEventApproachLabel(choice);
    const branches = [];
    ADMIN_EVENT_OUTCOME_ORDER.forEach(outcomeKey => {
        const targetNodeId = outcomes[outcomeKey]?.next;
        if (!targetNodeId || !eventDefinition.nodes?.[targetNodeId]) return;

        branches.push(Object.freeze({
            id: `${choice.id || approachLabel}-${outcomeKey}`,
            eventKey: eventDefinition.key,
            label: `${approachLabel} - ${outcomeKey}`,
            startNodeId: targetNodeId
        }));
    });

    return branches;
}

function getAdminEventChoiceTreeBranches(eventDefinition, nodeId, labels = [], visited = new Set()) {
    const nodes = eventDefinition?.nodes || {};
    const node = nodes[nodeId];
    if (!node || visited.has(nodeId)) return [];

    const nextVisited = new Set(visited);
    nextVisited.add(nodeId);

    const choices = Array.isArray(node.choices) ? node.choices : [];
    if (choices.length > 0) {
        return choices.flatMap(choice => {
            const resolutionBranches = getAdminEventResolutionBranches(eventDefinition, choice);
            if (resolutionBranches.length > 0) return resolutionBranches;
            if (!choice.next) return [];
            return getAdminEventChoiceTreeBranches(
                eventDefinition,
                choice.next,
                [...labels, String(choice.text || choice.id || '').trim()].filter(Boolean),
                nextVisited
            );
        });
    }

    if (labels.length === 0) return [];
    return [Object.freeze({
        id: `${eventDefinition.key || 'event'}-${nodeId}`,
        eventKey: eventDefinition.key,
        label: labels.join(' - '),
        startNodeId: nodeId
    })];
}

function getAdminEventBranches(eventDefinition) {
    if (Array.isArray(eventDefinition?.adminBranches)) {
        return eventDefinition.adminBranches
            .map((branch) => {
                const targetNodeId = branch?.startNodeId || branch?.nodeId || null;
                if (!targetNodeId || !eventDefinition.nodes?.[targetNodeId]) return null;

                return Object.freeze({
                    id: String(branch.id || `${eventDefinition.key || 'event'}-${targetNodeId}`),
                    eventKey: eventDefinition.key,
                    label: String(branch.label || targetNodeId),
                    group: branch.group == null ? null : String(branch.group),
                    startNodeId: String(targetNodeId)
                });
            })
            .filter(Boolean);
    }

    const firstChoiceNode = getAdminEventFirstChoiceNode(eventDefinition);
    if (!firstChoiceNode) return [];
    return getAdminEventChoiceTreeBranches(eventDefinition, firstChoiceNode.id);
}

// preload
function preloadImages(images, callback) {
    let loadedCount = 0;
    const totalImages = images.length;

    images.forEach(src => {
        const img = new Image();
        img.src = src;
        img.onload = () => {
            loadedCount++;
            if (loadedCount === totalImages) {
                callback();
            }
        };
        img.onerror = () => {
            console.error(`Image failed to load: ${src}`);
            loadedCount++;
            if (loadedCount === totalImages) {
                callback();
            }
        };
    });
}

window.onload = function() {
    const imagesToPreload = [
        './media/assets/loading/loader-01.jpg',
		'./media/assets/misc/chest-closed.png',
		'./media/assets/misc/chest-opened.png',
    ];

    preloadImages(imagesToPreload, () => {
        console.log("Toutes les images sont préchargées");
        // Vous pouvez maintenant exécuter d'autres scripts ou initialiser votre jeu ici.
    });
};

export function JsonInfosDL() {
    for (const side of ['A', 'B']) {
        const button = document.getElementById(`PowerArmy${side}`);
        button?.addEventListener('click', async () => {
            if (!isAdminMode() || button.dataset.exporting) return;
            button.dataset.exporting = 'true';
            button.disabled = true;
            try {
                const { createArmyPowerReport } = await import("../ui/statistics/components.js");
                if (!isAdminMode()) return;
                let army = entites.filter(entity => entity.side === side);
                if (!army.length && side === 'A') army = loadFromLocalStorage('selectedArmyA', []);
                if (!army.length && side === 'B') {
                    const stageId = window.currentStageId ?? localStorage.getItem('currentLevel');
                    const stage = loadFromLocalStorage('GameStages', { stages: [] }).stages
                        .find(entry => String(entry.id) === String(stageId));
                    const armies = loadFromLocalStorage('ArmyB', { armies: {} }).armies;
                    const stored = armies[stage?.ArmyB_id] || armies[`ArmyB_${stageId}`] || armies[String(stageId)];
                    army = Array.isArray(stored) ? stored : stored?.entities || stored?.entites || [];
                }
                downloadAdminJson(`PowerArmy${side}.json`, createArmyPowerReport(army, side));
            } catch (error) {
                console.error(`PowerArmy${side}`, error);
                window.alert(`Impossible de télécharger PowerArmy${side}.`);
            } finally {
                delete button.dataset.exporting;
                button.disabled = !isAdminMode();
            }
        });
    }
    // DL JSON Army A
const btnArmyA = document.getElementById('downloadArmyA');
if (btnArmyA) {
  btnArmyA.addEventListener('click', () => {
    const selectedEntitiesA = loadFromLocalStorage('selectedArmyA', []);

    if (selectedEntitiesA.length === 0) {
      console.warn("Aucune armée enrichie trouvée. Téléchargement annulé.");
      return;
    }

    // 🧩 Ajoute un champ preview vide si absent
    const enrichedEntities = selectedEntitiesA.map(entite => {
      entite.modifierStats ??= {};
      entite.modifierStats.durable ??= {
        stuff: { byId: {} },
        level: {},
        adminLevel: {},
        archetype: {},
        statLeveled: {}
      };
      entite.modifierStats.preview ??= {}; // 👈 juste le champ vide
      return entite;
    });

    // 💾 Création du JSON
   // JSON joli
const prettyArmyA = JSON.stringify({ entities: enrichedEntities }, null, 4);

// 🔧 Recompacte UNIQUEMENT les tableaux "milestone" sur une seule ligne
const armyAJson = prettyArmyA.replace(
  /("milestone"\s*:\s*)\[\s*([\s\S]*?)\s*\]/g,
  (match, prefix, inner) => {
    const flat = inner.replace(/\s+/g, ' ').trim();
    return `${prefix}[ ${flat} ]`;
  }
);

const blob = new Blob([armyAJson], { type: 'application/json' });

    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'armyA.json';
    link.click();

    console.log('📥 Army A JSON téléchargé :', enrichedEntities);
  });
}

    // DL JSON GameStages
    const btnStages = document.getElementById('downloadGameStages');
    if (btnStages) {
        btnStages.addEventListener('click', () => {
            const gameStages = loadFromLocalStorage('GameStages', { stages: [] });

            if (gameStages.stages.length === 0) {
                console.warn("Aucun stage trouvé. Téléchargement annulé.");
                return;
            }

            const stagesJson = JSON.stringify(gameStages, null, 4);
            const blob = new Blob([stagesJson], { type: 'application/json' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = 'GameStages.json';
            link.click();

            console.log('📥 GameStages JSON téléchargé :', stagesJson);
        });
    }

    // DL JSON Army B
    const btnArmyB = document.getElementById('downloadArmyB');
    if (btnArmyB) {
        btnArmyB.addEventListener('click', () => {
            const armyBData = loadFromLocalStorage('ArmyB', { armies: {} });

            if (!armyBData || Object.keys(armyBData.armies).length === 0) {
                console.warn("Aucune armée B trouvée. Téléchargement annulé.");
                return;
            }

            const armyBJson = JSON.stringify(armyBData, null, 4);
            const blob = new Blob([armyBJson], { type: 'application/json' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = 'ArmyB.json';
            link.click();

            console.log('📥 Army B JSON téléchargé :', armyBJson);
        });
    }
	

// DL JSON Items
const btnItems = document.getElementById('downloadItems');
if (btnItems) {
    btnItems.addEventListener('click', () => {
        const ingameItems = loadFromLocalStorage('IngameItems', []);

        if (!Array.isArray(ingameItems) || ingameItems.length === 0) {
            console.warn("Aucun objet en jeu trouvé. Téléchargement annulé.");
            return;
        }

        // Charger l'inventaire du joueur depuis PlayerSave
      const playerSave = loadFromLocalStorage('PlayerSave', {
    Playerinventory: [],
    equippedItems: []
});

const playerInventory = Array.isArray(playerSave?.Playerinventory) ? playerSave.Playerinventory : [];
const equippedItems = Array.isArray(playerSave?.equippedItems) ? playerSave.equippedItems : [];

        const itemsIDs = ingameItems.map(item => item.itemId);

        const fullData = {
            ItemsIDs: itemsIDs,
			Playerinventory: playerInventory,
            battleSlots: playerSave.battleSlots || [],
            battleGroundItems: playerSave.battleGroundItems || [],
            equippedItems: equippedItems,
            items: ingameItems
         
        };

        const jsonContent = JSON.stringify(fullData, (key, value) => {
            if (key === 'ItemsIDs') {
                return JSON.parse(JSON.stringify(value));
            }
            return value;
        }, 4).replace(/\[\s+([^\]]+?)\s+\]/s, (match, inner) => {
            return '[' + inner.replace(/\s+/g, ' ') + ']';
        });

        const blob = new Blob([jsonContent], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'IngameItems.json';
        link.click();

        console.log('📥 IngameItems JSON téléchargé :', jsonContent);
    });
} else {
    console.error("❌ Le bouton 'downloadItems' n’a pas été trouvé dans le DOM.");
}


    // DL JSON Coffres / Loot persistants
    const btnChestLoot = document.getElementById('downloadChestLoot');
    if (btnChestLoot) {
        btnChestLoot.addEventListener('click', () => {
            const chestLoot = loadFromLocalStorage('ChestLoot', { chests: [] });
            const json = JSON.stringify(chestLoot, null, 4);
            const blob = new Blob([json], { type: 'application/json' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = 'chest-loot.json';
            link.click();
            URL.revokeObjectURL(link.href);
            console.log('📥 Coffres / loot téléchargés :', chestLoot);
        });
    }


    // DL JSON Entités issues des coffres
    const btnEntityLoot = document.getElementById('downloadEntityLoot');
    if (btnEntityLoot) {
        btnEntityLoot.addEventListener('click', () => {
            const entityLoot = loadFromLocalStorage('EntityLoot', { entities: [] });
            const json = JSON.stringify(entityLoot, null, 4);
            const blob = new Blob([json], { type: 'application/json' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = 'entity-loot.json';
            link.click();
            URL.revokeObjectURL(link.href);
            console.log('📥 EntityLoot téléchargé :', entityLoot);
        });
    }

    // DL JSON Player Infos
const btnPlayer = document.getElementById('downloadPlayerInfos');

if (btnPlayer) {
    btnPlayer.addEventListener('click', () => {
        const currentGameID = localStorage.getItem('currentGameID') || 'Game_000000';
        const playerData = loadCurrentGameData();
        const currentLevel = localStorage.getItem('currentLevel') || 'none';

        // ✅ Déclare d'abord les index codex
        const codexMenuIdx = loadFromLocalStorage('CodexMenuIndex', 1) || 1;
        const codexSubIdx  = loadFromLocalStorage('CodexSubmenuIndex', 1) || 1;
        const visibleHexes = getVisibleHexes();
        const storedPlayerInfo = loadPlayerInfo();
        const storedPlayerExperience = loadFromLocalStorage('playerExperience', { experience: 0 });
        const playerExperience = Math.max(
            0,
            parseInt(
                storedPlayerExperience && typeof storedPlayerExperience === 'object'
                    ? storedPlayerExperience.experience
                    : storedPlayerExperience,
                10
            ) || 0
        );
        const cockroaches = Math.max(
            0,
            parseInt(storedPlayerInfo?.cockroaches, 10) || 0
        );

        // ✅ Maintenant seulement on charge PlayerSave avec ces valeurs
        const playerSave = loadFromLocalStorage('PlayerSave', {
            Playerinventory: [],
            equippedItems: [],
            codexMenuIdx,
            codexSubIdx
        });

        const playerInventory = Array.isArray(playerSave.Playerinventory) ? playerSave.Playerinventory : [];
        const equippedItems   = Array.isArray(playerSave.equippedItems) ? playerSave.equippedItems : [];

        if (!playerData) {
            console.error("❌ Aucune donnée de partie à exporter.");
            return;
        }

        const playerInfoExport = {
            ...storedPlayerInfo,
            game_id: currentGameID,
            experience: playerExperience,
            lastUpdated: playerData.lastUpdated,
            worldmap_id: playerData.worldmap_id,
            gameDay: playerData.gameDay,
            currentLevel,
            gameIDs: Array.isArray(playerData.gameIDs) ? playerData.gameIDs : [],
            scriptedLevels: Array.isArray(playerData.scriptedLevels) ? playerData.scriptedLevels : [],
            randomLevels: Array.isArray(playerData.randomLevels) ? playerData.randomLevels : [],
            codexMenu: [codexMenuIdx],
            codexSubMenu: [codexSubIdx],
            visibleHexes,
            cockroaches,
            quest: storedPlayerInfo.quest || {
                version: 1,
                activeEventKey: null,
                inProgress: {},
                finished: {},
                failed: {}
            }
        };
        const playerDataJson = JSON.stringify(playerInfoExport, null, 4);

        const blob = new Blob([playerDataJson], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'playerInfo.json';
        link.click();

        console.log('📥 Infos joueur téléchargées :', playerDataJson);
    });
} else {
    console.error("❌ Le bouton 'downloadPlayerInfos' n’a pas été trouvé dans le DOM.");
}

const btnAdminEntityData = document.getElementById('downloadAdminEntityData');
if (btnAdminEntityData) {
    btnAdminEntityData.addEventListener('click', () => {
        const entities = getAdminEntitiesForExportScope();
        const single = getAdminExportScopeLabel() === 'single';
        const payload = single ? cloneAdminEntityForStorage(entities[0]) : entities.map(entity => cloneAdminEntityForStorage(entity));
        const namePart = single
            ? slugAdminFilePart(entities[0]?.name || entities[0]?.class || entities[0]?.id, 'entity')
            : 'entities';
        downloadAdminJson(`admin-data-${namePart}.json`, payload);
        refreshAdminExportButtonLabels();
    });
}

const btnExportAdminEntities = document.getElementById('exportAdminEntities');
if (btnExportAdminEntities) {
    btnExportAdminEntities.addEventListener('click', () => {
        const entities = getAdminEntitiesForExportScope();
        const single = getAdminExportScopeLabel() === 'single';
        const payload = entities.map(cleanAdminEntityForNestExport);
        const namePart = single
            ? slugAdminFilePart(entities[0]?.name || entities[0]?.class || entities[0]?.id, 'entity')
            : 'entities';
        downloadAdminJson(
            single ? `entity-${namePart}.json` : 'entities-export.json',
            single ? payload[0] : payload
        );
        refreshAdminExportButtonLabels();
    });
}

const btnExportAdminAttacks = document.getElementById('exportAdminAttacks');
if (btnExportAdminAttacks) {
    btnExportAdminAttacks.addEventListener('click', () => {
        const entities = getAdminEntitiesForExportScope();
        const single = getAdminExportScopeLabel() === 'single';
        const payload = buildAdminAttackExportPayload(entities);
        const namePart = single
            ? slugAdminFilePart(entities[0]?.name || entities[0]?.class || entities[0]?.id, 'entity')
            : 'attacks';
        downloadAdminJson(single ? `attacks-${namePart}.json` : 'attacks-export.json', payload);
        refreshAdminExportButtonLabels();
    });
}

refreshAdminExportButtonLabels();
document.addEventListener('click', () => {
    window.setTimeout(refreshAdminExportButtonLabels, 0);
}, true);
}

export function AdminButtons() {
    const gameWindows = document.getElementById('game-windows');
    if (!gameWindows) {
        console.error("❌ #game-windows introuvable dans le DOM.");
        return;
    }

    // Éviter les doublons
    const existingToggle = document.querySelector('.admin-toggle-button');
    if (existingToggle) {
        existingToggle.classList.remove('is-hidden');
    }

    if (document.querySelector('.admin-buttons')) {
        console.log("✅ Les boutons admin existent déjà.");
        return;
    }

    // Création du conteneur
    const adminDiv = document.createElement('div');
    adminDiv.className = 'admin-commands';
    const hideAdminControlsByDefault = true;

    const adminToggle = document.createElement('div');
    adminToggle.className = 'admin-toggle-button picto-ui';
    adminToggle.title = 'Afficher / masquer les commandes admin';
    adminToggle.setAttribute('role', 'button');
    adminToggle.setAttribute('tabindex', '0');
    adminToggle.setAttribute('aria-expanded', String(!hideAdminControlsByDefault));
    adminToggle.textContent = '⚙';

    const AlladminButtons = document.createElement('div');
    AlladminButtons.className = `admin-buttons${hideAdminControlsByDefault ? ' is-hidden' : ''}`;
    const modeLabel = document.createElement('label');
    modeLabel.className = 'admin-mode-control';
    const modeInput = document.createElement('input');
    modeInput.type = 'checkbox';
    modeInput.checked = isAdminMode();
    modeInput.addEventListener('change', () => setAdminMode(modeInput.checked));
    modeLabel.append(modeInput, document.createTextNode('Mode admin'));
    AlladminButtons.append(modeLabel);
    const refreshMode = () => {
        modeInput.checked = isAdminMode();
        AlladminButtons.querySelectorAll('button, input').forEach(control => {
            if (control !== modeInput) control.disabled = !modeInput.checked;
        });
        document.documentElement.classList.toggle('admin-mode-enabled', modeInput.checked);
        if (!modeInput.checked) cleanupAdminLevel();
        else if (window.levelRunning === 'admin') initializeAdminLevel(entitesNestUp);
    };
    window.addEventListener('adminModeChanged', refreshMode);

    const toggleAdminButtons = () => {
        const isHidden = AlladminButtons.classList.toggle('is-hidden');
        gameIdDisplay.classList.toggle('is-hidden', isHidden);
        adminToggle.setAttribute('aria-expanded', String(!isHidden));
    };

    adminToggle.addEventListener('click', toggleAdminButtons);
    adminToggle.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        toggleAdminButtons();
    });

    // Ajout de l'affichage ID (et affichage immédiat)
    const gameIdDisplay = document.createElement('div');
    gameIdDisplay.className = `GameidDisplay${hideAdminControlsByDefault ? ' is-hidden' : ''}`;
    gameIdDisplay.id = 'game-id-display';

    const gameId = getOrCreateGameID();
    gameIdDisplay.textContent = `ID de la partie : ${gameId}`;
    console.log(`🆔 ID affiché via AdminButtons : ${gameId}`);

    // Ajout au DOM : icône admin tout à gauche, puis les boutons.
    adminDiv.appendChild(adminToggle);
    adminDiv.appendChild(AlladminButtons);
    adminDiv.appendChild(gameIdDisplay);

    const buttons = [
        { id: 'downloadPlayerInfos', label: 'Télécharger Données' },
        { id: 'downloadGameStages', label: 'Télécharger Stages' },
        { id: 'downloadArmyA', label: 'Télécharger Armée A' },
        { id: 'downloadArmyB', label: 'Télécharger Armée B' },
        { id: 'PowerArmyA', label: 'PowerArmyA' },
        { id: 'PowerArmyB', label: 'PowerArmyB' },
        { id: 'downloadItems', label: 'Télécharger Items' },
        { id: 'downloadChestLoot', label: 'Télécharger Coffres / Loot' },
        { id: 'downloadEntityLoot', label: 'Télécharger Entity Loot' },
        { id: 'downloadAdminEntityData', label: 'Télécharger Données Entité' },
        { id: 'exportAdminEntities', label: 'Exporter Entité' },
        { id: 'exportAdminAttacks', label: 'Exporter Attaque' }
    ];

    buttons.forEach(btn => {
        const button = document.createElement('button');
        button.type = 'button';
        button.id = btn.id;
        button.className = 'dl-admin-button';
        button.textContent = btn.label;
        AlladminButtons.appendChild(button);
    });

    gameWindows.appendChild(adminDiv);

    const bagControl = document.createElement('label');
    bagControl.className = 'admin-battle-slots';
    bagControl.textContent = 'Emplacements de sacoche';
    const bagCount = document.createElement('input');
    bagCount.type = 'number';
    bagCount.min = '0';
    bagCount.max = '24';
    bagCount.step = '1';
    bagCount.value = loadPlayerInfo().battleSlotCount;
    const applyBagCount = document.createElement('button');
    applyBagCount.type = 'button';
    applyBagCount.textContent = 'Appliquer';
    applyBagCount.addEventListener('click', () => {
        if (!isAdminMode()) return;
        if (setBattleSlotCount(Number(bagCount.value), { admin: true })) bagCount.value = loadPlayerInfo().battleSlotCount;
    });
    bagControl.append(bagCount, applyBagCount);
    AlladminButtons.appendChild(bagControl);

    // Attacher les fonctions de téléchargement
    JsonInfosDL();
    refreshMode();
}

function getFocusedEntityIdFromDOM() {
    const box = document.querySelector('.hex.focused .entite-box[id^="Box_Entite_"]');
    if (box?.id) return box.id.replace('Box_Entite_', '');

    const fallback = document.querySelector(
        '[id^="spriteContainer_"].focused, [id^="TargetInfos_"].focused'
    );
    const match = fallback?.id?.match(/_(\d+)$/);
    return match ? match[1] : null;
}

let selectedAdminBattleObject = null;
let selectedAdminEntityId = null;

export function setAdminSelectedEntity(entityId) {
    document.querySelectorAll('.admin-selected-entity').forEach(box => {
        box.classList.remove('admin-selected-entity');
    });
    const box = entityId != null && isAdminLevelActive()
        ? document.getElementById(`Box_Entite_${entityId}`)
        : null;
    selectedAdminEntityId = box ? String(entityId) : null;
    box?.classList.add('admin-selected-entity');
}

function removeSelectedAdminBattleObject() {
    const object = selectedAdminBattleObject;
    if (!object?.isConnected) return false;
    const hex = object.closest('.hex');
    const itemId = object.dataset.itemId;
    if (itemId) {
        releaseGroundItem(itemId);
        removeItem(itemId, { from: 'ground' });
    } else {
        removeBattleElementFromDOM(object);
    }
    hex?.classList.remove('focused');
    selectedAdminBattleObject = null;
    return true;
}

export function removeAdminEntityIngame(entityId) {
    if (!isAdminMode()) return false;
    if (!entityId || !isAdminLevelActive()) return false;
    releaseEntityFootprint({id:entityId});

    const box = document.getElementById(`Box_Entite_${entityId}`);
    const hex = box?.closest('.hex');

    if (hex) {
        hex.classList.remove('occupied', 'focused');
        if (String(hex.dataset.occupiedBy) === String(entityId)) {
            delete hex.dataset.occupiedBy;
        }

        const socle = hex.querySelector('.socle');
        if (socle) {
            socle.style.opacity = '0';
            socle.style.filter = '';
        }
    }

    const spriteContainer = document.getElementById(`spriteContainer_${entityId}`);
    if (spriteContainer) {
        spriteContainer.classList.remove('focused');
        spriteContainer.querySelectorAll('.focused').forEach(node => node.classList.remove('focused'));
    }

    document.getElementById(`TargetInfos_${entityId}`)?.classList.remove('focused');
    if (selectedAdminEntityId === String(entityId)) setAdminSelectedEntity(null);
    box?.remove();

    const entityIndex = entites.findIndex(entity => String(entity.id) === String(entityId));
    if (entityIndex !== -1) entites.splice(entityIndex, 1);

    return true;
}

export function enableAdminDeleteKey() {
    if (window.__adminDeleteKeyBound) return;
    window.__adminDeleteKeyBound = true;

    document.addEventListener('click', event => {
        if (!isAdminLevelActive()) return;
        const battlefield = event.target.closest?.('#hexGrid .hex');
        if (!battlefield) return;
        selectedAdminBattleObject?.classList.remove('admin-selected');
        document.querySelectorAll('#hexGrid .hex.focused').forEach(hex => hex.classList.remove('focused'));
        selectedAdminBattleObject = event.target.closest('.battle-element, [data-ground-summon="true"][data-item-id]');
        if (selectedAdminBattleObject) {
            selectedAdminBattleObject.classList.add('admin-selected');
            battlefield.classList.add('focused');
            setAdminSelectedEntity(null);
        } else {
            setAdminSelectedEntity(event.target.closest('.entite-box[id^="Box_Entite_"]')?.id.replace('Box_Entite_', '') || null);
        }
    }, true);

    document.addEventListener('keydown', event => {
        if (!isAdminLevelActive()) return;

        const activeElement = document.activeElement;
        const isTyping = activeElement && (
            activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.tagName === 'SELECT' ||
            activeElement.isContentEditable
        );
        if (isTyping || (event.key !== 'Delete' && event.code !== 'Delete' && event.keyCode !== 46)) return;

        if (selectedAdminBattleObject?.isConnected) {
            event.preventDefault();
            removeSelectedAdminBattleObject();
            return;
        }
        const entityId = selectedAdminEntityId || getFocusedEntityIdFromDOM() || window.__adminActiveLiveEntityId;
        if (!entityId) return;

        event.preventDefault();
        if (removeAdminEntityIngame(entityId)) selectedAdminEntityId = null;
    });
}

export function cleanupAdminLevel() {
    unmountCombatSimulation();
    document.getElementById('admin-entity-form')?._rememberNavigation?.();
    document.body.classList.remove('admin-level-active');
    setAdminSelectedEntity(null);
    document.getElementById('admin-entity-form')?.remove();
    document.getElementById('admin-open-btn')?.remove();
    document.getElementById('admin-reset-level-button')?.remove();
    uninstallAdminSoulTools();
    removeAdminSpawnInterceptors();

    restoreAdminBalanceExperienceIfNeeded();
}

function normalizeAdminSearchText(value) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\+/g, ' plus ')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function getAdminSearchDistance(source, target) {
    if (source === target) return 0;
    if (!source.length) return target.length;
    if (!target.length) return source.length;

    let previous = Array.from({ length: target.length + 1 }, (_, index) => index);

    for (let sourceIndex = 1; sourceIndex <= source.length; sourceIndex++) {
        const current = [sourceIndex];

        for (let targetIndex = 1; targetIndex <= target.length; targetIndex++) {
            const substitutionCost = source[sourceIndex - 1] === target[targetIndex - 1] ? 0 : 1;
            current[targetIndex] = Math.min(
                current[targetIndex - 1] + 1,
                previous[targetIndex] + 1,
                previous[targetIndex - 1] + substitutionCost
            );
        }

        previous = current;
    }

    return previous[target.length];
}

function getAdminSearchScore(queryValue, candidateValue) {
    const query = normalizeAdminSearchText(queryValue);
    const candidate = normalizeAdminSearchText(candidateValue);
    if (!query) return 0;
    if (!candidate) return Number.POSITIVE_INFINITY;
    if (candidate === query) return -100;

    if (candidate.startsWith(query)) {
        return -80 + ((candidate.length - query.length) / Math.max(candidate.length, 1));
    }

    const directMatchIndex = candidate.indexOf(query);
    if (directMatchIndex !== -1) {
        return -60
            + (directMatchIndex / Math.max(candidate.length, 1))
            + ((candidate.length - query.length) / Math.max(candidate.length, 1));
    }

    const queryWords = query.split(' ');
    const candidateWords = candidate.split(' ');
    const wordScore = queryWords.reduce((total, queryWord) => {
        const closestWordScore = candidateWords.reduce((closest, candidateWord) => {
            if (candidateWord === queryWord) return 0;
            if (candidateWord.startsWith(queryWord)) {
                return Math.min(closest, 0.05 + (
                    (candidateWord.length - queryWord.length)
                    / Math.max(candidateWord.length, 1)
                ));
            }

            const distance = getAdminSearchDistance(queryWord, candidateWord);
            return Math.min(
                closest,
                distance / Math.max(queryWord.length, candidateWord.length, 1)
            );
        }, Number.POSITIVE_INFINITY);

        return total + closestWordScore;
    }, 0) / queryWords.length;

    const fullDistance = getAdminSearchDistance(query, candidate)
        / Math.max(query.length, candidate.length, 1);
    const wordCountPenalty = Math.abs(queryWords.length - candidateWords.length) * 0.01;

    return wordScore + (fullDistance * 0.15) + wordCountPenalty;
}

function getAdminSearchMatches(queryValue, entries) {
    const query = normalizeAdminSearchText(queryValue);
    if (!query) return entries;

    const queryWords = query.split(' ');
    const preparedEntries = entries.map((entry, index) => ({
        entry,
        index,
        normalizedText: normalizeAdminSearchText(entry.searchText)
    }));

    const phraseMatches = preparedEntries.filter(({ normalizedText }) => (
        normalizedText.includes(query)
    ));
    if (phraseMatches.length > 0) {
        return phraseMatches.map(({ entry }) => entry);
    }

    const tokenMatches = preparedEntries.filter(({ normalizedText }) => {
        const candidateWords = normalizedText.split(' ');
        return queryWords.every(queryWord => candidateWords.some(candidateWord => (
            candidateWord.startsWith(queryWord)
            || (queryWord.length >= 3 && candidateWord.includes(queryWord))
        )));
    });
    if (tokenMatches.length > 0) {
        return tokenMatches.map(({ entry }) => entry);
    }

    const fuzzyMatches = preparedEntries
        .map(prepared => ({
            ...prepared,
            score: getAdminSearchScore(query, prepared.normalizedText)
        }))
        .sort((first, second) => first.score - second.score || first.index - second.index);

    if (fuzzyMatches.length === 0) return [];

    const bestScore = fuzzyMatches[0].score;
    const tolerance = queryWords.length > 1 ? 0.14 : 0.1;
    const maximumAcceptedScore = queryWords.length > 1 ? 0.72 : 0.58;
    const acceptedScore = Math.min(bestScore + tolerance, maximumAcceptedScore);

    return fuzzyMatches
        .filter(({ score }) => score <= acceptedScore)
        .map(({ entry }) => entry);
}

export function initializeAdminLevel(entityCatalog, { restoringCombat = false } = {}) {
    if (!isAdminMode()) return;
    const currentStageId = window.currentStageId;
    const gameStageData = JSON.parse(localStorage.getItem('GameStages')) || { stages: [] };
    const stage = gameStageData.stages.find(candidate => String(candidate.id) === String(currentStageId));

    if (!isAdminLevelActive() || !stage || stage.level_type !== 'admin') {
        cleanupAdminLevel();
        console.warn('Initialisation admin ignorée : le niveau courant n’est pas un niveau admin.');
        return { A: [], B: [] };
    }

    if (!Array.isArray(entityCatalog)) {
        console.error('Initialisation admin impossible : catalogue d’entités invalide.');
        return { A: [], B: [] };
    }

    beginAdminSession();
    closePlayerArmyCodex();
    cleanupAdminLevel();
    if (ADMIN_NAVIGATION.stage !== currentStageId) {
        ADMIN_NAVIGATION.stage = currentStageId;
        ADMIN_NAVIGATION.views.clear();
        ADMIN_NAVIGATION.entities.clear();
        ADMIN_NAVIGATION.lastEntity = null;
    }
    document.body.classList.add('admin-level-active');
    mountCombatSimulation();
    enableAdminDeleteKey();
    activateAdminBalanceExperience();
    installAdminSoulTools();
    window.__adminEntityCatalog = entityCatalog;

    const selectedEntitiesA = [];
    const selectedEntitiesB = [];
    const selectedEntitiesNeutral = [];
    const menuState = readAdminMenuState();

    const form = document.createElement('form');
    form.id = 'admin-entity-form';
    form.dataset.activeSide = menuState.side;
    form.dataset.eventCount = String(ADMIN_EVENT_LIST.length);
    form.dataset.activeAdminTab = menuState.mode;
    form.innerHTML = '<h3>Sélectionner les entités (Admin)</h3>';
    const formTitle = form.querySelector('h3');

    const createTabs = (id, entries, getActive, onSelect) => {
        const tabs = document.createElement('div');
        if (id) tabs.id = id;
        tabs.className = 'admin-side-tabs';
        tabs.style.display = 'flex';
        tabs.style.gap = '8px';
        tabs.style.marginBottom = '8px';

        entries.forEach(entry => {
            const button = document.createElement('button');
            button.type = 'button';
            button.classList.add('admin-tab-button');
            button.dataset.adminTabKey = entry.key;
            button.textContent = entry.label;
            const isActive = getActive() === entry.key;
            button.classList.toggle('active', isActive);
            button.classList.toggle('passive', !isActive);
            button.addEventListener('click', () => onSelect(entry.key));
            tabs.appendChild(button);
        });

        return tabs;
    };

    const modeTabs = createTabs('admin-side-tabs', [
        Object.freeze({ key: 'spawn', label: 'Spawn' }),
        Object.freeze({ key: 'events', label: 'Events' }),
        Object.freeze({ key: 'biome', label: 'Biome' })
    ], () => menuState.mode, key => {
        menuState.mode = key;
        menuState.miscType = null;
        menuState.miscStatus = null;
        viewStack.length = 0;
        persistAndRender();
    });

    const sideTabs = createTabs(null, ADMIN_SPAWN_SIDES, () => menuState.side, key => {
        menuState.side = key;
        form.dataset.activeSide = key;
        viewStack.length = 0;
        persistAndRender();
    });

    const categoryTabs = createTabs(null, [
        Object.freeze({ key: 'entity', label: 'Entity' }),
        Object.freeze({ key: 'items', label: 'Items' }),
        Object.freeze({ key: 'misc', label: 'Misc' })
    ], () => menuState.category, key => {
        menuState.category = key;
        menuState.miscType = null;
        menuState.miscStatus = null;
        viewStack.length = 0;
        persistAndRender();
    });

    const list = document.createElement('div');
    list.id = 'admin-entity-list';
    list.classList.add('admin-entity-list');

    const infiniteLabel = document.createElement('label');
    infiniteLabel.id = 'admin-ground-infinite-control';
    const infiniteInput = document.createElement('input');
    infiniteInput.type = 'checkbox';
    infiniteInput.id = 'admin-ground-infinite';
    infiniteInput.checked = menuState.infiniteItems;
    infiniteLabel.append(infiniteInput, ' Infinie');
    infiniteInput.addEventListener('change', () => {
        if (!setAdminGroundItemsInfinite(infiniteInput.checked)) {
            infiniteInput.checked = menuState.infiniteItems;
            return;
        }
        menuState.infiniteItems = infiniteInput.checked;
        writeAdminMenuState(menuState);
    });

    const searchTools = document.createElement('div');
    searchTools.id = 'admin-list-search';
    searchTools.style.display = 'flex';
    searchTools.style.alignItems = 'center';
    searchTools.style.gap = '6px';
    searchTools.style.marginBottom = '8px';

    const searchInput = document.createElement('input');
    searchInput.id = 'admin-list-search-input';
    searchInput.type = 'search';
    searchInput.placeholder = 'Rechercher une entité…';
    searchInput.autocomplete = 'off';
    searchInput.spellcheck = false;
    searchInput.setAttribute('aria-label', 'Recherche rapide');
    searchInput.style.flex = '1 1 140px';
    searchInput.style.minWidth = '0';
    searchInput.style.padding = '4px 6px';

    const clearSearchButton = document.createElement('button');
    clearSearchButton.type = 'button';
    clearSearchButton.textContent = 'Clear';
    clearSearchButton.disabled = true;
    clearSearchButton.style.flex = '0 0 auto';
    clearSearchButton.style.padding = '4px 8px';

    const resurrectEntityButton = document.createElement('button');
    resurrectEntityButton.type = 'button';
    resurrectEntityButton.className = 'admin-resurrect-entity-button';
    resurrectEntityButton.textContent = 'Ressusciter';
    resurrectEntityButton.title = 'Ressusciter l’entité sélectionnée avec tous ses HP';
    resurrectEntityButton.style.flex = '0 0 auto';
    resurrectEntityButton.style.padding = '4px 8px';
    resurrectEntityButton.hidden = true;
    let resurrectingEntity = false;
    const updateResurrectButton = () => {
        resurrectEntityButton.disabled = resurrectingEntity
            || !isAdminEntityDead(getActiveAdminLiveEntityContext()?.liveTarget);
    };
    resurrectEntityButton.addEventListener('click', async () => {
        const context = getActiveAdminLiveEntityContext();
        if (!context?.liveTarget || resurrectingEntity) return;
        resurrectingEntity = true;
        updateResurrectButton();
        try {
            if (!await resurrectAdminEntity(context.liveTarget)) return;
            // Preserve pending edits, but never let Valider restore the old corpse state.
            for (const key of ['isDEAD', 'dead', 'statut', 'hasDeathBeenLogged', 'hasAlreadyDeadBeenLogged',
                'corpseConsumed', 'corpseDestroyed', 'status', 'battleStopped']) {
                context.draft[key] = cloneAdminPlainData(context.liveTarget[key], context.liveTarget[key]);
            }
            if (context.draft.stats?.HP) context.draft.stats.HP.current = context.draft.stats.HP.max;
            bindAdminLiveEntityBoxHandlers();
            eventStatus.textContent = `${context.liveTarget.name || 'Entité'} : ressuscitée, HP restaurés au maximum.`;
            eventStatus.hidden = false;
            renderCurrentView();
        } catch (error) {
            console.error('Résurrection admin impossible :', error);
            eventStatus.textContent = error.message;
            eventStatus.hidden = false;
        } finally {
            resurrectingEntity = false;
            updateResurrectButton();
        }
    });
    searchTools.append(searchInput, clearSearchButton, resurrectEntityButton);

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'admin-tab-button admin-panel-close';
    closeButton.textContent = '×';
    closeButton.setAttribute('aria-label', 'Fermer');
    closeButton.title = 'Fermer';

    const eventStatus = document.createElement('div');
    eventStatus.id = 'admin-event-launch-status';
    eventStatus.setAttribute('role', 'status');
    eventStatus.setAttribute('aria-live', 'polite');
    eventStatus.hidden = true;

    const resetLevelButton = document.createElement('button');
    resetLevelButton.id = 'admin-reset-level-button';
    resetLevelButton.className = 'admin-tab-button';
    resetLevelButton.type = 'button';
    resetLevelButton.textContent = 'Reset niveau';

    const invincibleModeControl = document.createElement('label');
    invincibleModeControl.className = 'admin-invincible-mode-control';
    const invincibleModeInput = document.createElement('input');
    invincibleModeInput.type = 'checkbox';
    invincibleModeInput.id = 'admin-invincible-mode';
    const invincibleModeName = document.createElement('span');
    invincibleModeName.textContent = 'Invincible';
    invincibleModeControl.append(invincibleModeInput, invincibleModeName);
    searchTools.appendChild(invincibleModeControl);

    const generateEditedEntityButton = document.createElement('button');
    generateEditedEntityButton.type = 'button';
    generateEditedEntityButton.className = 'admin-tab-button admin-generate-edited-entity-button';
    generateEditedEntityButton.textContent = 'Générer l’entité';
    generateEditedEntityButton.hidden = true;

    const validateLiveEntityButton = document.createElement('button');
    validateLiveEntityButton.type = 'submit';
    // Les pas des champs servent aux steppers ; les éditeurs contrôlent déjà les valeurs saisies.
    validateLiveEntityButton.formNoValidate = true;
    validateLiveEntityButton.className = 'admin-tab-button admin-validate-live-entity-button';
    validateLiveEntityButton.textContent = 'Valider';
    validateLiveEntityButton.title = 'Valider (Entrée)';
    validateLiveEntityButton.setAttribute('aria-keyshortcuts', 'Enter');
    validateLiveEntityButton.hidden = true;

    const duplicateEntityButton = document.createElement('button');
    duplicateEntityButton.type = 'button';
    duplicateEntityButton.className = 'admin-tab-button admin-duplicate-entity-button';
    duplicateEntityButton.textContent = 'Dupliquer';
    duplicateEntityButton.title = 'Dupliquer l’entité sélectionnée sur une case libre';
    duplicateEntityButton.hidden = true;
    duplicateEntityButton.addEventListener('click', async () => {
        const source = getActiveAdminLiveEntityContext()?.liveTarget;
        if (!source || duplicateEntityButton.disabled) return;
        duplicateEntityButton.disabled = true;
        try {
            const created = await duplicateAdminEntity(source);
            if (!created) return;
            if (created.side === 'A') selectedEntitiesA.push(created);
            else if (created.side === 'B') selectedEntitiesB.push(created);
            else selectedEntitiesNeutral.push(created);
            bindAdminLiveEntityBoxHandlers();
            eventStatus.textContent = `${source.name || 'Entité'} : copie créée (${created.id}).`;
        } catch (error) {
            console.error('Duplication admin impossible :', error);
            eventStatus.textContent = error.message;
        } finally {
            duplicateEntityButton.disabled = false;
            eventStatus.hidden = false;
        }
    });

    const panelActions = document.createElement('div');
    panelActions.className = 'admin-panel-actions';
    const liveEntityActions = document.createElement('div');
    liveEntityActions.className = 'admin-live-entity-actions';
    liveEntityActions.hidden = true;
    liveEntityActions.append(validateLiveEntityButton, duplicateEntityButton);
    panelActions.appendChild(closeButton);

    const editorToolTabs = document.createElement('div');
    editorToolTabs.className = 'admin-editor-side-tabs';
    editorToolTabs.hidden = true;
    editorToolTabs.appendChild(liveEntityActions);
    ADMIN_ENTITY_TOOL_TABS.forEach(entry => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'admin-editor-tool-tab';
        button.dataset.adminEntityTool = entry.key;
        button.setAttribute('aria-label', entry.label);

        const icon = document.createElement('span');
        icon.className = `admin-editor-tool-icon ${entry.iconClass}`;
        button.appendChild(icon);

        button.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();

            const view = getActiveAdminEntityEditorView();
            if (!view?.entity) return;

            if (entry.key === 'stats') {
                closeActiveAdminEntityToolViews();
                if (!getActiveAdminEntityEditorView()) {
                    openAdminEntityStatsEditor(view.entity, {
                        liveEdit: view.adminLiveEntityEditor === true,
                        liveTarget: view.adminLiveEntityTarget || activeAdminLiveEntityContext?.liveTarget || null
                    });
                    return;
                }
                renderShell();
                renderCurrentView();
                return;
            }

            if (entry.key === 'archetypes') {
                openAdminEntityArchetypePanel(view.entity, view.editorKey || getAdminStatEditorKey(view.entity));
                return;
            }

            openAdminEntityAttacksPanel(view.entity, view.editorKey || getAdminStatEditorKey(view.entity));
        });

        editorToolTabs.appendChild(button);
    });

    const entityRows = [];
    const eventRows = [];
    const viewStack = [];
    let currentRows = [];
    let activeAdminLiveEntityContext = null;
    let navigationKey = null;
    let pendingListScroll = null;
    let restoringNavigation = false;
    const entityNavigationKey = (entity, live) => live ? `live:${entity.id}` : getAdminStatEditorKey(entity);
    const viewRoute = view => view.navigation || { type: view.adminStatsEditor ? 'stats' : view.adminToolTab };
    const presentationRouteKey = route => JSON.stringify(route.type === 'stats' && route.section === 'general'
        ? { type: 'stats', section: 'general' } : route);
    const viewNavigationKey = view => view?.entity
        ? `${entityNavigationKey(view.entity, view.adminLiveEntityEditor)}:${presentationRouteKey(viewRoute(view))}`
        : `catalog:${JSON.stringify([menuState.mode, menuState.side, menuState.category,
            menuState.miscType, menuState.miscStatus, menuState.crystalLevel, menuState.biomeClass,
            view ? viewStack.map(entry => entry.title) : []])}`;
    function rememberPresentation() {
        if (navigationKey) ADMIN_NAVIGATION.views.set(navigationKey, {
            search: searchInput.value, scroll: list.scrollTop, formScroll: form.scrollTop
        });
    }
    function rememberNavigation() {
        if (restoringNavigation) return;
        rememberPresentation();
        const views = viewStack.filter(view => view.entity && (view.adminStatsEditor || view.adminEntityTool));
        if (!views.length) return;
        const current = views[views.length - 1];
        const memory = views.map(view => ({ route: viewRoute(view),
            presentation: { ...ADMIN_NAVIGATION.views.get(viewNavigationKey(view)) } }));
        ADMIN_NAVIGATION.entities.set(entityNavigationKey(current.entity, current.adminLiveEntityEditor), memory);
        ADMIN_NAVIGATION.lastEntity = memory;
    }
    function activateNavigation() {
        const nextKey = viewNavigationKey(viewStack[viewStack.length - 1]);
        if (nextKey === navigationKey) return;
        if (!restoringNavigation) rememberPresentation();
        navigationKey = nextKey;
        const saved = ADMIN_NAVIGATION.views.get(nextKey);
        searchInput.value = saved?.search || '';
        pendingListScroll = saved?.scroll || 0;
        form.scrollTop = saved?.formScroll || 0;
    }
    function openRememberedEntityEditor(entity, options = {}) {
        rememberNavigation();
        const ownerKey = entityNavigationKey(entity, options.liveEdit);
        const memory = ADMIN_NAVIGATION.entities.get(ownerKey) || ADMIN_NAVIGATION.lastEntity || [];
        restoringNavigation = true;
        for (const saved of memory) {
            ADMIN_NAVIGATION.views.set(`${ownerKey}:${presentationRouteKey(saved.route)}`, { ...saved.presentation });
        }
        try {
            const statsRoute = memory.find(saved => saved.route.type === 'stats')?.route;
            openAdminEntityStatsEditor(entity, { ...options, ...statsRoute });
            const key = getAdminStatEditorKey(entity);
            for (const { route } of memory) {
                if (route.type === 'archetypes') openAdminEntityArchetypePanel(entity, key);
                else if (route.type === 'attacks') openAdminEntityAttacksPanel(entity, key);
                else if (route.type === 'attack') openAdminAttackEditorPanel(entity, key, route.index);
                else if (route.type === 'attack-field') openAdminAttackListFieldPanel(entity, key, route.index, route.field);
                else if (route.type === 'attack-choice') openAdminAttackCandidatePanel(entity, key, route.index);
                else if (route.type === 'archetype-choice') openAdminArchetypeCandidatePanel(entity, key, route.index,
                    readAdminActiveArchetypeEntries(entity).filter(entry => entry.key !== 'egare' && (entry.complete || entry.step > 0))[route.index] || null);
            }
        } finally { restoringNavigation = false; }
        rememberNavigation();
    }
    form._rememberNavigation = rememberNavigation;
    list.addEventListener('scroll', rememberNavigation);
    form.addEventListener('scroll', rememberNavigation);

    const updateInvincibleModeControl = () => {
        const active = readAdminInvincibleMode();
        window.__adminInvincibleMode = active;
        invincibleModeInput.checked = active;
    };

    function persistAndRender() {
        writeAdminMenuState(menuState);
        renderShell();
        renderCurrentView();
    }

    const renderAdminList = (availableRows = currentRows) => {
        const scroll = pendingListScroll ?? list.scrollTop;
        pendingListScroll = null;
        const query = normalizeAdminSearchText(searchInput.value);
        const pinnedRows = availableRows.filter(entry => entry.alwaysVisible);
        const displayedRows = getAdminSearchMatches(query, availableRows.filter(entry => !entry.alwaysVisible));

        clearSearchButton.disabled = query.length === 0;
        list.replaceChildren(...pinnedRows.map(entry => entry.element));

        if (displayedRows.length === 0) {
            const emptyMessage = document.createElement('p');
            emptyMessage.textContent = query
                ? 'Aucun résultat.'
                : 'Aucun élément disponible.';
            list.appendChild(emptyMessage);
            return;
        }

        list.append(...displayedRows.map(entry => entry.element));
        list.scrollTop = scroll;
    };

    const resetSearch = () => {
        searchInput.value = '';
        clearSearchButton.disabled = true;
    };

    searchInput.addEventListener('input', () => {
        pendingListScroll = 0;
        renderAdminList();
        rememberNavigation();
    });
    clearSearchButton.addEventListener('click', () => {
        resetSearch();
        pendingListScroll = 0;
        renderAdminList();
        rememberNavigation();
        searchInput.focus();
    });

    const showAdminLauncherButton = () => {
        if (!isAdminLevelActive() || document.getElementById('admin-open-btn')) return;

        const button = document.createElement('button');
        button.id = 'admin-open-btn';
        button.type = 'button';
        button.textContent = 'Admin';
        button.className = 'admin-open-btn';
        button.addEventListener('click', () => {
            button.remove();
            initializeAdminLevel(window.__adminEntityCatalog || entityCatalog);
        });
        ensureGameShell().appendChild(button);
    };

    const eventLaunchRows = [];
    const setEventRowsDisabled = disabled => {
        eventLaunchRows.forEach(row => {
            row.setAttribute('aria-disabled', String(disabled));
            row.tabIndex = disabled ? -1 : 0;
        });
    };

    const pushRowsView = (title, rows, placeholder, onBack, meta = {}) => {
        rememberNavigation();
        viewStack.push({ title, rows, placeholder, onBack, ...meta });
        renderShell();
        renderCurrentView();
        rememberNavigation();
    };

    const closeRowsView = () => {
        rememberNavigation();
        const view = viewStack.pop();
        view?.onBack?.();
        if (view?.adminLiveEntityEditor === true && !viewStack.some(entry => entry?.adminLiveEntityEditor === true)) {
            activeAdminLiveEntityContext = null;
            setAdminSelectedEntity(null);
            eventStatus.textContent = 'Mode création.';
            eventStatus.hidden = false;
        }
        renderShell();
        renderCurrentView();
        rememberNavigation();
    };

    const openEventBranches = (eventDefinition, eventTitle, branches, launchEvent, options = {}) => {
        searchInput.placeholder = 'Rechercher une branche…';

        const backRow = document.createElement('div');
        backRow.className = 'admin-entity-row admin-event-row';
        backRow.setAttribute('role', 'button');
        backRow.setAttribute('aria-disabled', 'false');
        backRow.tabIndex = 0;

        const backLabel = document.createElement('span');
        backLabel.textContent = '< Retour aux événements';

        const backIdentity = document.createElement('span');
        backIdentity.style.opacity = '0.7';
        backIdentity.textContent = eventTitle;

        backRow.append(backLabel, backIdentity);
        const closeBranches = () => {
            if (typeof options.onBack === 'function') {
                options.onBack();
                return;
            }

            closeRowsView();
        };
        backRow.addEventListener('click', closeBranches);
        backRow.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            closeBranches();
        });

        const branchRows = [{
            element: backRow,
            searchText: `retour ${eventTitle}`
        }];

        const groupedBranches = !options.skipGrouping
            && branches.some(branch => branch.group);
        const displayedBranches = groupedBranches
            ? [...new Map(branches
                .filter(branch => branch.group)
                .map(branch => [branch.group, branch])).values()]
            : branches;

        displayedBranches.forEach(branch => {
            const branchRow = document.createElement('div');
            branchRow.className = 'admin-entity-row admin-event-row';
            branchRow.dataset.eventKey = eventDefinition.key;
            branchRow.dataset.eventBranch = branch.id;
            branchRow.setAttribute('role', 'button');
            branchRow.setAttribute('aria-disabled', 'false');
            branchRow.tabIndex = 0;

            const branchName = document.createElement('span');
            branchName.textContent = groupedBranches
                ? `${branch.group} >`
                : branch.label;

            const branchIdentity = document.createElement('span');
            branchIdentity.style.opacity = '0.7';
            branchIdentity.textContent = groupedBranches
                ? eventTitle
                : `ID ${eventDefinition.id} · v${eventDefinition.version || 1}`;

            branchRow.append(branchName, branchIdentity);
            const openOrLaunchBranch = () => {
                if (groupedBranches) {
                    openEventBranches(
                        eventDefinition,
                        `${eventTitle} > ${branch.group}`,
                        branches.filter(candidate => candidate.group === branch.group),
                        launchEvent,
                        { skipGrouping: true }
                    );
                    return;
                }

                launchEvent(branch);
            };

            branchRow.addEventListener('click', openOrLaunchBranch);
            branchRow.addEventListener('keydown', event => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                openOrLaunchBranch();
            });

            eventLaunchRows.push(branchRow);
            branchRows.push({
                element: branchRow,
                searchText: `${branch.group || ''} ${branch.label} ${eventTitle} ${eventDefinition.key}`
            });
        });

        pushRowsView(eventTitle, branchRows, 'Rechercher une branche…');
    };

    ADMIN_EVENT_LIST.forEach(eventDefinition => {
        const eventRow = document.createElement('div');
        eventRow.className = 'admin-entity-row admin-event-row';
        eventRow.dataset.eventKey = eventDefinition.key;
        eventRow.setAttribute('role', 'button');
        eventRow.setAttribute('aria-disabled', 'false');
        eventRow.tabIndex = 0;

        const eventName = document.createElement('span');
        const eventTitle = eventDefinition.title
            || eventDefinition.name
            || eventDefinition.key;
        const eventBranches = getAdminEventBranches(eventDefinition);
        eventName.textContent = eventTitle;

        const eventIdentity = document.createElement('span');
        eventIdentity.style.opacity = '0.7';
        eventIdentity.textContent = `ID ${eventDefinition.id} · v${eventDefinition.version || 1}`;

        eventRow.append(eventName, eventIdentity);

        let eventBranchButton = null;
        if (eventBranches.length > 0) {
            eventBranchButton = document.createElement('button');
            eventBranchButton.type = 'button';
            eventBranchButton.className = 'admin-event-branch-button';
            eventBranchButton.textContent = '>';
            eventBranchButton.setAttribute('aria-label', `Branches ${eventTitle}`);
            eventRow.append(eventBranchButton);
        }

        const launchEvent = async (branch = null) => {
            if (!isAdminLevelActive() || window.__adminEventLaunchPending) return;

            window.__adminEventLaunchPending = true;
            setEventRowsDisabled(true);
            eventStatus.textContent = `Lancement de ${branch?.label || eventTitle}…`;
            eventStatus.hidden = false;

            try {
                const { startEvent } = await import("../events/runtime.js");
                await startEvent(eventDefinition, {
                    levelId: window.currentStageId,
                    force: true,
                    ...(branch?.startNodeId ? { forcedStartNodeId: branch.startNodeId } : {})
                });
                closeAdminEntityFormOnly();
            } catch (error) {
                console.error(`Lancement admin de l’événement ${eventDefinition.key} impossible :`, error);
                eventStatus.textContent = `Échec du lancement : ${error?.message || error}`;
                setEventRowsDisabled(false);
            } finally {
                window.__adminEventLaunchPending = false;
            }
        };

        const launchFullEvent = () => launchEvent();
        const openBranches = (event = null) => {
            event?.stopPropagation?.();
            openEventBranches(eventDefinition, eventTitle, eventBranches, launchEvent);
        };

        eventRow.addEventListener('click', launchFullEvent);
        eventRow.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            launchFullEvent();
        });
        eventBranchButton?.addEventListener('click', openBranches);

        eventLaunchRows.push(eventRow);
        eventRows.push({
            element: eventRow,
            searchText: `${eventTitle} ${eventDefinition.key} branches`
        });
    });

    closeButton.addEventListener('click', () => {
        closeAdminEntityFormOnly();
    });

    const spawnEntity = async (entityBase, side, forcedPosition = null, editorKey = '') => {
        if (!isAdminLevelActive()) return null;

        try {
            const effectiveEditorKey = editorKey || getAdminStatEditorKey(entityBase);
            const flexResult = applyAdminWillFlexBeforeSpawn(entityBase, effectiveEditorKey);
            const levelOverride = getAdminLevelOverrideForSpawn(entityBase, effectiveEditorKey, flexResult);
            const created = await createEntityIngame(entityBase, {
                side,
                position: forcedPosition,
                level: levelOverride
            });
            if (levelOverride !== null) enforceAdminSpawnLevel(created, entityBase, levelOverride);
            refreshAdminEntityAttackState(created, entityBase.currentAttackId || entityBase.currentAttack || entityBase.attacks?.[0]);
            if (side === 'A') selectedEntitiesA.push(created);
            else if (side === 'B') selectedEntitiesB.push(created);
            else selectedEntitiesNeutral.push(created);
            bindAdminLiveEntityBoxHandlers();
            return created;
        } catch (error) {
            console.error('❌ Création de l’entité impossible :', error);
            return null;
        }
    };

    const refreshAdminSpawnedEntityIds = () => {
        assignUniqueIDToEntities(selectedEntitiesA);
        assignUniqueIDToEntities(selectedEntitiesB);
        assignUniqueIDToEntities(selectedEntitiesNeutral);
    };

    const createAdminStatsBackRow = (entity) => {
        const row = document.createElement('div');
        row.className = 'admin-entity-row';
        row.setAttribute('role', 'button');
        row.tabIndex = 0;

        const label = document.createElement('span');
        label.textContent = '< Retour entités';

        const details = document.createElement('span');
        details.style.opacity = '0.7';
        details.textContent = entity.name || entity.class || '';

        row.append(label, details);
        const goBack = () => closeRowsView();
        row.addEventListener('click', goBack);
        row.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            goBack();
        });

        return {
            element: row,
            searchText: `retour ${entity.name || ''} ${entity.class || ''}`
        };
    };

    const createAdminStatsGroupRow = (label) => {
        const row = document.createElement('div');
        row.className = 'admin-entity-row admin-stat-editor-header';
        row.textContent = label;

        return {
            element: row,
            searchText: label
        };
    };

    const createAdminStatsActionRow = (entity, editorKey, options = {}) => {
        const row = document.createElement('div');
        row.className = 'admin-entity-row admin-stat-editor-reset-row';
        row.draggable = false;

        const label = document.createElement('span');
        label.textContent = 'Points bruts';
        label.title = 'Les champs indiquent les bonus ajoutés. BaseStats permet de modifier directement les valeurs de base. Les ratios sont calculés ensuite par le jeu.';

        const actionButtons = document.createElement('span');
        actionButtons.className = 'admin-stat-editor-action-buttons';

        const baseStatsLabel = document.createElement('label');
        baseStatsLabel.className = 'admin-base-stat-mode-label';

        const baseStatsInput = document.createElement('input');
        baseStatsInput.type = 'checkbox';
        baseStatsInput.checked = isAdminBaseStatsEditEnabled(editorKey);

        const baseStatsText = document.createElement('span');
        baseStatsText.textContent = 'BaseStats';
        baseStatsLabel.append(baseStatsInput, baseStatsText);

        baseStatsLabel.addEventListener('click', event => event.stopPropagation());
        baseStatsInput.addEventListener('change', event => {
            event.stopPropagation();
            setAdminBaseStatsEditEnabled(editorKey, baseStatsInput.checked);
            refreshAdminVisibleAllStatInputs(editorKey, entity, { resetInitial: true });
            refreshAdminVisibleWillFlexControls(editorKey, entity);
            eventStatus.textContent = baseStatsInput.checked
                ? `${entity.name || 'Entité'} : valeurs de base, sans les bonus calculés.`
                : `${entity.name || 'Entité'} : points ajoutés, sans les bonus calculés.`;
            eventStatus.hidden = false;
        });

        const resetButton = document.createElement('button');
        resetButton.type = 'button';
        resetButton.textContent = 'Reset';
        resetButton.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            const resetBaseStats = isAdminBaseStatsEditEnabled(editorKey);
            resetAdminEntityBaseStats(entity, editorKey);
            eventStatus.textContent = resetBaseStats
                ? `${entity.name || 'Entité'} : baseStats et modifiers admin remis à 0.`
                : `${entity.name || 'Entité'} : modifiers admin remis à 0.`;
            eventStatus.hidden = false;
            closeRowsView();
            openAdminEntityStatsEditor(entity, {
                liveEdit: options.liveEdit === true,
                liveTarget: options.liveTarget || activeAdminLiveEntityContext?.liveTarget || null
            });
        });

        const hardResetButton = document.createElement('button');
        hardResetButton.type = 'button';
        hardResetButton.className = 'admin-hard-reset-entity-button';
        hardResetButton.textContent = 'Hard-reset';
        hardResetButton.title = 'Remettre toutes les stats à 0 et les HP à 1/1';
        hardResetButton.addEventListener('click', async event => {
            event.preventDefault();
            event.stopPropagation();
            hardResetButton.disabled = true;
            try {
                const target = options.liveEdit ? options.liveTarget : entity;
                await hardResetAdminEntity(target, editorKey);
                if (target !== entity) replaceAdminEntityData(entity, target);
                closeRowsView();
                openAdminEntityStatsEditor(entity, options);
                eventStatus.textContent = `${entity.name || 'Entité'} : stats à 0, HP à 1/1.`;
            } catch (error) {
                console.error('Hard-reset admin impossible :', error);
                eventStatus.textContent = error.message;
            } finally {
                hardResetButton.disabled = false;
                eventStatus.hidden = false;
            }
        });
        actionButtons.append(baseStatsLabel, resetButton, hardResetButton);
        row.append(label, actionButtons);

        return {
            element: row,
            searchText: `mode edition basestats modifiers reset stat zero ${entity.name || ''} ${entity.class || ''}`
        };
    };

    const createAdminLevelEditorRow = (entity, editorKey, options = {}) => {
        const row = document.createElement('div');
        row.className = 'admin-entity-row admin-stat-editor-row admin-level-editor-row';
        row.dataset.adminEditorKey = editorKey;
        row.dataset.statKey = 'level';
        row.draggable = false;

        const label = document.createElement('span');
        label.className = 'admin-stat-editor-name';
        label.textContent = 'Niveau';

        const controls = document.createElement('span');
        controls.className = 'admin-stat-editor-controls';

        const minus = document.createElement('button');
        minus.type = 'button';
        minus.className = 'admin-stat-editor-step-button';
        minus.textContent = '<';
        minus.setAttribute('aria-label', 'Retirer 1 niveau');

        const input = document.createElement('input');
        input.className = 'admin-stat-editor-input';
        input.type = 'number';
        input.min = '1';
        input.step = '1';
        input.value = String(readAdminRequestedLevelValue(entity, editorKey));
        input.setAttribute('aria-label', 'Niveau');

        const plus = document.createElement('button');
        plus.type = 'button';
        plus.className = 'admin-stat-editor-step-button';
        plus.textContent = '>';
        plus.setAttribute('aria-label', 'Ajouter 1 niveau');

        const flexLabel = document.createElement('label');
        flexLabel.className = 'admin-level-flex-label';

        const flexInput = document.createElement('input');
        flexInput.type = 'checkbox';
        flexInput.checked = isAdminWillFlexEnabled(editorKey);

        const flexText = document.createElement('span');
        flexText.textContent = 'Flex';
        flexLabel.append(flexInput, flexText);

        const flexSummary = document.createElement('span');
        flexSummary.className = 'admin-level-flex-summary';

        const updateLevelFlexSummary = (result = null) => {
            const flexEnabled = isAdminWillFlexEnabled(editorKey);
            flexInput.checked = flexEnabled;

            if (!flexEnabled) {
                flexSummary.textContent = '';
                return;
            }

            const requestedLevel = result?.requestedLevel ?? readAdminRequestedLevelValue(entity, editorKey);
            const info = result?.flexInfo || findAdminRequiredWillForLevel(entity, requestedLevel);
            if (!info) {
                flexSummary.textContent = '';
                return;
            }

            flexSummary.textContent = info.capped
                ? `Vol. ${info.will} / max ${info.maxLevel}`
                : `Vol. ${info.will}`;
        };

        const initialValue = readAdminRequestedLevelValue(entity, editorKey);
        const applyInputValue = (rawValue, { forceDisplay = false, refreshTool = false } = {}) => {
            const result = applyAdminLevelEditorValue(entity, rawValue, editorKey, {
                willFlex: isAdminWillFlexEnabled(editorKey),
            });
            if (result === null) return;

            const appliedLevel = result.level;
            if (forceDisplay) input.value = String(appliedLevel);
            row.classList.toggle('is-edited', appliedLevel !== initialValue);

            const flexInfo = result.flexInfo;
            const flexStatus = isAdminWillFlexEnabled(editorKey) && flexInfo
                ? ` | flex volonté = ${flexInfo.will}${flexInfo.capped ? `, max ${flexInfo.maxLevel}` : ''}`
                : '';
            eventStatus.textContent = `${entity.name || 'Entité'} : niveau = ${appliedLevel}${flexStatus}`;
            eventStatus.hidden = false;
            refreshAdminVisibleAllStatInputs(editorKey, entity);
            refreshAdminVisibleWillFlexControls(editorKey, entity, result);
            updateLevelFlexSummary(result);
            if (refreshTool && typeof options.onAfterApply === 'function') {
                options.onAfterApply(result);
            }
        };

        minus.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            const currentValue = Number.isFinite(Number(input.value))
                ? Number(input.value)
                : readAdminEntityLevelValue(entity);
            applyInputValue(currentValue - 1, { forceDisplay: true, refreshTool: true });
        });

        plus.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            const currentValue = Number.isFinite(Number(input.value))
                ? Number(input.value)
                : readAdminEntityLevelValue(entity);
            applyInputValue(currentValue + 1, { forceDisplay: true, refreshTool: true });
        });

        input.addEventListener('input', event => {
            event.stopPropagation();
            const rawValue = input.value.trim();
            if (!rawValue || rawValue === '-') return;
            applyInputValue(rawValue);
        });

        input.addEventListener('change', () => {
            const result = applyAdminLevelEditorValue(entity, input.value, editorKey, {
                willFlex: isAdminWillFlexEnabled(editorKey),
            });
            input.value = String(result?.level ?? readAdminEntityLevelValue(entity));
            refreshAdminVisibleWillFlexControls(editorKey, entity, result);
            updateLevelFlexSummary(result);
            if (typeof options.onAfterApply === 'function') {
                options.onAfterApply(result);
            }
        });

        input.addEventListener('click', event => event.stopPropagation());
        input.addEventListener('dblclick', event => event.stopPropagation());

        flexLabel.addEventListener('click', event => event.stopPropagation());
        flexInput.addEventListener('change', event => {
            event.stopPropagation();
            setAdminWillFlexEnabled(editorKey, flexInput.checked);

            if (isAdminWillFlexEnabled(editorKey)) {
                const result = applyAdminLevelEditorValue(
                    entity,
                    readAdminRequestedLevelValue(entity, editorKey),
                    editorKey,
                    { willFlex: true }
                );
                input.value = String(result?.level ?? readAdminEntityLevelValue(entity));
                refreshAdminVisibleAllStatInputs(editorKey, entity);
                updateLevelFlexSummary(result);
                const info = result?.flexInfo;
                eventStatus.textContent = info
                    ? `${entity.name || 'Entité'} : flex volonté = ${info.will} pour niveau ${result.requestedLevel}${info.capped ? ` (max ${info.maxLevel})` : ''}`
                    : `${entity.name || 'Entité'} : flex volonté activé`;
            } else {
                updateLevelFlexSummary();
                refreshAdminVisibleWillFlexControls(editorKey, entity);
                eventStatus.textContent = `${entity.name || 'Entité'} : flex volonté désactivé`;
            }

            eventStatus.hidden = false;
            if (typeof options.onAfterApply === 'function') {
                options.onAfterApply();
            }
        });

        updateLevelFlexSummary();
        controls.append(minus, input, plus, flexLabel, flexSummary);
        row.append(label, controls);

        return {
            element: row,
            searchText: `niveau level lvl ${entity.name || ''} ${entity.class || ''}`
        };
    };

    const createAdminStatEditorRow = (entity, definition, editorKey) => {
        const row = document.createElement('div');
        row.className = 'admin-entity-row admin-stat-editor-row';
        row.dataset.adminEditorKey = editorKey;
        row.dataset.statKey = definition.key;
        row.draggable = false;

        const label = document.createElement('span');
        label.className = 'admin-stat-editor-name';

        const picto = document.createElement('span');
        picto.className = `picto-stat ${definition.displayKey || definition.key}`;
        if (definition.key.endsWith('Plus')) {
            label.classList.add(definition.displayKey);
            label.dataset.statState = '+';
        }

        const name = document.createElement('span');
        name.textContent = definition.name;

        label.append(picto, name);

        const controls = document.createElement('span');
        controls.className = 'admin-stat-editor-controls';

        const minus = document.createElement('button');
        minus.type = 'button';
        minus.className = 'admin-stat-editor-step-button';
        minus.textContent = '<';
        minus.setAttribute('aria-label', `Retirer 1 ${definition.name}`);

        const input = document.createElement('input');
        input.className = 'admin-stat-editor-input';
        input.type = 'number';
        input.step = 'any';
        input.dataset.statKey = definition.key;
        input.value = String(readAdminEditedStatValue(entity, definition.key, editorKey));
        input.setAttribute('aria-label', definition.name);
        input.title = 'Points bruts : bonus ajouté, ou valeur de base si BaseStats est coché. Aucun bonus de ratio n’est inclus dans cette saisie.';

        const plus = document.createElement('button');
        plus.type = 'button';
        plus.className = 'admin-stat-editor-step-button';
        plus.textContent = '>';
        plus.setAttribute('aria-label', `Ajouter 1 ${definition.name}`);

        const initialValue = Number(input.value) || 0;
        row.dataset.initialValue = String(initialValue);
        registerAdminStatInputControl(editorKey, definition.key, row, input, initialValue);
        const readInitialValue = () => {
            const value = Number(row.dataset.initialValue);
            return Number.isFinite(value) ? value : initialValue;
        };
        const applyInputValue = (rawValue, { forceDisplay = false } = {}) => {
            const numericValue = Number(rawValue);
            if (!Number.isFinite(numericValue)) return;

            const nextPoints = row.dataset.statValueMode === 'total'
                ? readAdminEditedStatValue(entity, definition.key, editorKey)
                    + numericValue - readAdminFinalStatValue(entity, definition.key)
                : numericValue;
            const appliedValue = applyAdminStatEditorValue(
                entity,
                definition.key,
                nextPoints,
                editorKey
            );
            if (appliedValue === null) return;

            const displayedValue = readAdminDisplayedStatValue(entity, definition.key, editorKey, row);
            if (forceDisplay) input.value = String(displayedValue);
            row.classList.toggle('is-edited', appliedValue !== readInitialValue());
            eventStatus.textContent = `${entity.name || 'Entité'} : ${definition.name} = ${displayedValue}`;
            eventStatus.hidden = false;
            refreshAdminVisibleAllStatInputs(editorKey, entity);
            refreshAdminVisibleWillFlexControls(editorKey, entity);
        };

        minus.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            const currentValue = Number.isFinite(Number(input.value))
                ? Number(input.value)
                : readAdminDisplayedStatValue(entity, definition.key, editorKey, row);
            applyInputValue(currentValue - 1, { forceDisplay: true });
        });

        plus.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            const currentValue = Number.isFinite(Number(input.value))
                ? Number(input.value)
                : readAdminDisplayedStatValue(entity, definition.key, editorKey, row);
            applyInputValue(currentValue + 1, { forceDisplay: true });
        });

        input.addEventListener('input', event => {
            event.stopPropagation();
            const rawValue = input.value.trim();
            if (!rawValue || rawValue === '-' || rawValue === '.' || rawValue === '-.') return;
            applyInputValue(rawValue);
        });

        input.addEventListener('change', () => {
            const numericValue = Number(input.value);
            if (Number.isFinite(numericValue)) {
                applyInputValue(numericValue, { forceDisplay: true });
            } else {
                input.value = String(readAdminDisplayedStatValue(entity, definition.key, editorKey, row));
            }
        });

        input.addEventListener('click', event => event.stopPropagation());
        input.addEventListener('dblclick', event => event.stopPropagation());

        controls.append(minus, input, plus);
        row.append(label, controls);

        return {
            element: row,
            searchText: definition.searchText
        };
    };

    const createAdminEntitySideRow = (entity, editorKey, liveTarget) => {
        const row = document.createElement('div');
        row.className = 'admin-entity-row admin-stat-editor-row admin-entity-side-row';
        row.dataset.adminEditorKey = editorKey;
        const label = document.createElement('label');
        label.className = 'admin-stat-editor-name';
        label.textContent = 'Side';
        const select = document.createElement('select');
        select.className = 'admin-stat-editor-input admin-entity-side-select';
        select.id = `admin-entity-side-${editorKey}`;
        label.htmlFor = select.id;
        for (const entry of ADMIN_SPAWN_SIDES) {
            select.add(new Option(entry.key === 'neutral' ? 'Neutre' : entry.label, entry.key));
        }
        select.value = normalizeAdminSpawnSide(entity.side);
        select.addEventListener('change', () => {
            entity.side = normalizeAdminSpawnSide(select.value);
            row.classList.toggle('is-edited', entity.side !== normalizeAdminSpawnSide(liveTarget?.side));
        });
        row.append(label, select);
        return { element: row, searchText: 'side camp equipe faction A B neutre neutral' };
    };

    const createAdminEntitySizeRow = (entity, liveTarget) => {
        const row = document.createElement('label');row.className = 'admin-entity-row admin-entity-size-row';
        const label = document.createElement('span');label.textContent = 'Taille — cases occupées';
        const select = document.createElement('select');select.dataset.adminEntityField = 'sizeInCells';select.setAttribute('aria-label','Taille — cases occupées');
        for (const size of ENTITY_SIZE_OPTIONS) select.add(new Option(size + (size === 1 ? ' case' : ' cases'), size));
        select.value = entitySizeInCells(entity);
        const feedback = document.createElement('small');feedback.setAttribute('role','status');
        select.addEventListener('change', () => {
            const target = liveTarget || entity, result = setEntitySizeInCells(target, Number(select.value));
            if (!result.valid) { select.value = entitySizeInCells(target); feedback.textContent = result.reason; return; }
            entity.sizeInCells = entitySizeInCells(target);entity.position = target.position;entity.battlePosition = target.battlePosition;
            feedback.textContent = '';
        });
        row.append(label, select, feedback);
        return { element: row, searchText: 'taille cases groupement gigantisme size' };
    };

    const createAdminEntityNameRow = (entity, field, labelText) => {
        const row = document.createElement('label');
        row.className = 'admin-entity-row admin-entity-name-row';
        const label = document.createElement('span');
        label.textContent = labelText;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = entity[field] || '';
        input.dataset.adminEntityField = field;
        input.setAttribute('aria-label', labelText);
        input.addEventListener('input', () => {
            if (field === 'nickname' && !input.value.trim()) delete entity.nickname;
            else entity[field] = input.value;
            renderShell();
        });
        row.append(label, input);
        return { element: row, searchText: `${labelText} ${field}` };
    };

    const createAdminEntityEditorTabs = (label, entries, getActive, onSelect) => {
        const element = document.createElement('div');
        element.className = 'admin-entity-editor-tabs';
        element.setAttribute('role', 'tablist');
        element.setAttribute('aria-label', label);
        for (const entry of entries) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'admin-tab-button';
            button.setAttribute('role', 'tab');
            button.textContent = entry.label;
            button.dataset.editorTab = entry.key;
            button.addEventListener('click', () => onSelect(entry.key));
            element.appendChild(button);
        }
        return { element, alwaysVisible: true, update() {
            element.querySelectorAll('button').forEach(button => {
                const active = button.dataset.editorTab === getActive();
                button.classList.toggle('active', active);
                button.setAttribute('aria-selected', String(active));
            });
        } };
    };

    const openAdminEntityStatsEditor = (entity, options = {}) => {
        if (!entity) return;

        const editorKey = getAdminStatEditorKey(entity);
        const liveEdit = options.liveEdit === true;
        const liveTarget = options.liveTarget || activeAdminLiveEntityContext?.liveTarget || null;
        if (liveEdit && liveTarget) {
            activeAdminLiveEntityContext = { draft: entity, liveTarget, editorKey };
        }
        recomputeAdminEntityStats(entity);
        const savedViews = ADMIN_NAVIGATION.entities.get(entityNavigationKey(entity, liveEdit))
            || ADMIN_NAVIGATION.lastEntity || [];
        const savedTabs = savedViews.find(saved => saved.route.type === 'stats')?.route;
        const navigation = { type: 'stats',
            section: (options.section ?? savedTabs?.section) === 'stats' ? 'stats' : 'general',
            filter: (options.filter ?? savedTabs?.filter) === 'entity' ? 'entity' : 'all' };
        const backRow = { ...createAdminStatsBackRow(entity), alwaysVisible: true };
        let view;
        const selectTab = (key, value) => {
            rememberNavigation();
            view.navigation = { ...view.navigation, [key]: value };
            renderCurrentView();
            rememberNavigation();
        };
        const sectionTabs = createAdminEntityEditorTabs('Éditeur de l’entité', [
            { key: 'general', label: 'Général' }, { key: 'stats', label: 'Stats' }
        ], () => view.navigation.section, value => selectTab('section', value));
        const filterTabs = createAdminEntityEditorTabs('Statistiques affichées', [
            { key: 'all', label: 'All' }, { key: 'entity', label: 'This entity' }
        ], () => view.navigation.filter, value => selectTab('filter', value));
        filterTabs.element.classList.add('admin-stat-filter-tabs');
        const generalRows = [
            createAdminEntityNameRow(entity, 'name', 'Nom'),
            createAdminEntityNameRow(entity, 'nickname', 'Nickname'),
            createAdminEntitySizeRow(entity, liveEdit ? liveTarget : null),
            ...(liveEdit ? [createAdminEntitySideRow(entity, editorKey, liveTarget)] : []),
            createAdminLevelEditorRow(entity, editorKey),
            createAdminStatsActionRow(entity, editorKey, { liveEdit, liveTarget })
        ];
        const definitions = getAdminStatEditorDefinitions(entity);
        const groups = ADMIN_STAT_EDITOR_GROUPS.map(group => ({
            header: createAdminStatsGroupRow(group.label),
            rows: definitions.filter(definition => definition.group === group.key)
                .map(definition => ({ ...createAdminStatEditorRow(entity, definition, editorKey), statKey: definition.key }))
        }));
        view = {
            title: `Entité ${entity.name || entity.class || ''}`, rows: [], placeholder: '', onBack: null,
            adminStatsEditor: true, adminLiveEntityEditor: liveEdit, adminLiveEntityTarget: liveTarget,
            entity, editorKey, navigation,
            getRows() {
                const totalMode = view.navigation.section === 'stats' && view.navigation.filter === 'entity';
                for (const group of groups) for (const row of group.rows) {
                    row.element.dataset.statValueMode = totalMode ? 'total' : 'raw';
                    row.element.querySelector('input').title = totalMode
                        ? 'Valeur totale calculée. Une modification ajuste les points bruts de la différence saisie, puis recalcule le total.'
                        : 'Points bruts : bonus ajouté, ou valeur de base si BaseStats est coché. Aucun bonus de ratio n’est inclus dans cette saisie.';
                }
                refreshAdminVisibleAllStatInputs(editorKey, entity);
                sectionTabs.update();
                filterTabs.update();
                backRow.element.lastElementChild.textContent = entity.name || entity.class || '';
                if (view.navigation.section === 'general') {
                    view.placeholder = 'Rechercher un réglage…';
                    return [backRow, sectionTabs, ...generalRows];
                }
                view.placeholder = 'Rechercher une stat…';
                const rows = [backRow, sectionTabs, filterTabs];
                for (const group of groups) {
                    const entries = view.navigation.filter === 'entity'
                        ? group.rows.filter(row => hasAdminEntityStat(entity, row.statKey)) : group.rows;
                    if (entries.length) rows.push(group.header, ...entries);
                }
                return rows;
            }
        };
        rememberNavigation();
        viewStack.push(view);
        renderShell();
        renderCurrentView();
        rememberNavigation();
    };

    const openAdminLiveEntityEditor = (entity) => {
        if (!entity?.id) return;
        rememberNavigation();

        setAdminSelectedEntity(entity.id);
        const draft = cloneAdminEntityForStorage(entity);
        const editorKey = getAdminLiveEntityEditorKey(draft);
        window.__adminActiveLiveEntityId = String(entity.id);
        window.__adminActiveLiveEntityDraft = draft;
        activeAdminLiveEntityContext = {
            draft,
            liveTarget: entity,
            editorKey
        };
        ADMIN_SOUL_ENTITY_ORIGINS.set(
            String(entity.id),
            ADMIN_SOUL_ENTITY_ORIGINS.get(String(entity.id))
                || captureAdminEntityStorageOrigin(entity.id, entity)
        );

        viewStack.length = 0;
        menuState.mode = 'spawn';
        menuState.category = 'entity';
        openRememberedEntityEditor(draft, { liveEdit: true, liveTarget: entity });
        eventStatus.textContent = `${entity.name || 'Entité'} : modification live.`;
        eventStatus.hidden = false;
    };

    const closeAdminLiveEntityEditor = () => {
        const activeView = getActiveAdminEntityEditorView();
        if (activeView?.adminLiveEntityEditor !== true) return;
        rememberNavigation();

        activeAdminLiveEntityContext = null;
        setAdminSelectedEntity(null);
        window.__adminActiveLiveEntityId = null;
        window.__adminActiveLiveEntityDraft = null;
        viewStack.length = 0;
        eventStatus.textContent = 'Mode création.';
        eventStatus.hidden = false;
        persistAndRender();
    };

    const validateAdminLiveEntityEditor = () => {
        const activeView = getActiveAdminEntityEditorView();
        const liveContext = getActiveAdminLiveEntityContext();
        if (!liveContext?.draft) {
            eventStatus.textContent = 'Aucune entité live sélectionnée : validation impossible.';
            eventStatus.hidden = false;
            return false;
        }

        const draft = liveContext.draft;
        const liveTarget = entites.find(candidate => String(candidate?.id) === String(draft.id))
            || liveContext.liveTarget;
        if (!liveTarget) {
            eventStatus.textContent = 'Entité live introuvable : validation impossible.';
            eventStatus.hidden = false;
            return false;
        }

        applyAdminLiveEntityDraft(liveTarget, draft);

        replaceAdminEntityData(draft, liveTarget);
        refreshAdminEntityAttackState(draft, liveTarget.currentAttackId || liveTarget.currentAttack);
        recomputeEntityStats(draft);
        window.__adminActiveLiveEntityId = String(liveTarget.id);
        window.__adminActiveLiveEntityDraft = draft;
        activeAdminLiveEntityContext = {
            draft,
            liveTarget,
            editorKey: liveContext.editorKey || activeView?.editorKey || getAdminLiveEntityEditorKey(draft)
        };
        viewStack.forEach(view => {
            if (view?.adminLiveEntityEditor !== true) return;
            view.entity = draft;
            view.adminLiveEntityTarget = liveTarget;
            view.editorKey = activeAdminLiveEntityContext.editorKey;
        });
        refreshAdminVisibleAllStatInputs(activeAdminLiveEntityContext.editorKey, draft, { resetInitial: true });
        refreshAdminVisibleWillFlexControls(activeAdminLiveEntityContext.editorKey, draft);
        form.querySelectorAll('.admin-entity-side-row').forEach(row => {
            row.querySelector('select').value = normalizeAdminSpawnSide(draft.side);
            row.classList.remove('is-edited');
        });

        eventStatus.textContent = `${liveTarget.name || 'Entité'} : modifications validées.`;
        eventStatus.hidden = false;
        renderShell();
        renderCurrentView();
        return true;
    };

    const openAdminLiveEntityFromBox = (box, event = null, options = {}) => {
        if (!box || !isAdminLevelActive() || !document.getElementById('admin-entity-form')) return false;
        if (event && form.contains(event.target)) return false;
        const preserveEvent = options.preserveEvent === true;
        if (event?.type === 'click' && Number(event.detail) >= 2) {
            clearPendingAdminLiveEntityClick();
            return false;
        }

        const entityId = box.id?.replace(/^Box_Entite_/, '');
        const activeLiveId = activeAdminLiveEntityContext?.liveTarget?.id
            ?? activeAdminLiveEntityContext?.draft?.id
            ?? null;
        if (activeLiveId !== null && String(activeLiveId) === String(entityId)) {
            if (!preserveEvent) {
                event?.preventDefault?.();
                event?.stopPropagation?.();
                event?.stopImmediatePropagation?.();
            }
            return true;
        }

        const entity = entites.find(candidate => String(candidate?.id) === String(entityId))
            || findAdminEntityById(entityId);
        if (!entity) {
            eventStatus.textContent = `Entité ${entityId || '?'} introuvable : modification impossible.`;
            eventStatus.hidden = false;
            return false;
        }

        if (!preserveEvent) {
            event?.preventDefault?.();
            event?.stopPropagation?.();
            event?.stopImmediatePropagation?.();
        }
        openAdminLiveEntityEditor(entity);
        return true;
    };

    const scheduleAdminLiveEntityFromBoxClick = (box, event = null) => {
        if (!box || !isAdminLevelActive() || !document.getElementById('admin-entity-form')) return false;
        if (event && form.contains(event.target)) return false;

        event && (event.__adminLiveEntityClickHandled = true);
        clearPendingAdminLiveEntityClick();
        window.__adminLiveEntityClickTimer = setTimeout(() => {
            window.__adminLiveEntityClickTimer = null;
            if (!box.isConnected) return;
            openAdminLiveEntityFromBox(box, null);
        }, ADMIN_LIVE_ENTITY_SINGLE_CLICK_DELAY_MS);
        return true;
    };

    const handleAdminLiveEntityBoxEvent = event => {
        if (event?.type === 'dblclick') {
            clearPendingAdminLiveEntityClick();
            if (event.__adminLiveEntityDblClickHandled) return;
            event.__adminLiveEntityDblClickHandled = true;
            const box = event.currentTarget?.matches?.('.entite-box[id^="Box_Entite_"]')
                ? event.currentTarget
                : event.target?.closest?.('.entite-box[id^="Box_Entite_"]');
            openAdminLiveEntityFromBox(box, event, { preserveEvent: true });
            return;
        }
        if (event?.type !== 'click') return;
        if (Number(event.detail) >= 2) {
            clearPendingAdminLiveEntityClick();
            return;
        }
        if (event.__adminLiveEntityClickHandled) return;

        const box = event.currentTarget?.matches?.('.entite-box[id^="Box_Entite_"]')
            ? event.currentTarget
            : event.target?.closest?.('.entite-box[id^="Box_Entite_"]');

        scheduleAdminLiveEntityFromBoxClick(box, event);
    };

    const bindAdminLiveEntityBoxHandlers = (root = document) => {
        if (!isAdminLevelActive()) return;

        const boxes = [];
        if (root.matches?.('.entite-box[id^="Box_Entite_"]')) boxes.push(root);
        root.querySelectorAll?.('.entite-box[id^="Box_Entite_"]').forEach(box => {
            if (!boxes.includes(box)) boxes.push(box);
        });

        boxes.forEach(box => {
            if (selectedAdminEntityId === box.id.replace(/^Box_Entite_/, '')) box.classList.add('admin-selected-entity');
            if (box.dataset.adminLiveEditBound === '1' && box.__adminLiveEntityBoxHandler === handleAdminLiveEntityBoxEvent) return;
            if (box.__adminLiveEntityBoxHandler) {
                ['pointerdown', 'mousedown', 'click', 'dblclick'].forEach(eventName => {
                    box.removeEventListener(eventName, box.__adminLiveEntityBoxHandler, true);
                });
            }

            box.dataset.adminLiveEditBound = '1';
            box.__adminLiveEntityBoxHandler = handleAdminLiveEntityBoxEvent;
            ['click', 'dblclick'].forEach(eventName => {
                box.addEventListener(eventName, handleAdminLiveEntityBoxEvent, true);
            });
        });
    };

    entityCatalog.forEach(entity => {
        ensureAdminEntityBaseStatsSnapshot(entity);
        const editorKey = getAdminStatEditorKey(entity);

        const row = document.createElement('div');
        row.className = 'admin-entity-row admin-entity-catalog-row';
        row.draggable = true;
        row.dataset.adminEditorKey = editorKey;

        const label = document.createElement('span');
        label.className = 'admin-entity-catalog-main';
        label.textContent = entity.name;

        const level = document.createElement('span');
        level.className = 'admin-entity-catalog-level';
        level.style.opacity = '0.7';
        level.textContent = `Lv ${readAdminEntityLevelValue(entity)}`;

        const statsButton = document.createElement('button');
        statsButton.type = 'button';
        statsButton.className = 'admin-entity-stat-button';
        statsButton.textContent = '>';
        statsButton.draggable = false;
        statsButton.setAttribute('aria-label', `Stats ${entity.name}`);

        row.append(label, level, statsButton);

        statsButton.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            openRememberedEntityEditor(entity);
        });

        statsButton.addEventListener('dblclick', event => {
            event.preventDefault();
            event.stopPropagation();
        });

        row.addEventListener('dblclick', async event => {
            if (menuState.mode !== 'spawn') return;

            event.preventDefault();
            event.stopPropagation();

            if (menuState.category === 'misc' && menuState.miscType === 'corpse' && menuState.miscStatus) {
                await spawnAdminMisc({
                    side: menuState.side,
                    miscType: 'corpse',
                    status: menuState.miscStatus,
                    entity
                });
                return;
            }

            if (menuState.category !== 'entity') return;

            await spawnEntity(entity, form.dataset.activeSide || 'A', null, editorKey);
            refreshAdminSpawnedEntityIds();
        });

        row.addEventListener('dragstart', event => {
            if (!isAdminLevelActive()) {
                event.preventDefault();
                return;
            }

            const side = form.dataset.activeSide || 'A';
            const payload = `ADMIN_SPAWN:${JSON.stringify(
                menuState.category === 'misc' && menuState.miscType === 'corpse' && menuState.miscStatus
                    ? { __adminSpawn: 1, kind: 'misc', side, miscType: 'corpse', status: menuState.miscStatus, entity, editorKey }
                    : { __adminSpawn: 1, kind: 'entity', side, entity, editorKey }
            )}`;
            setAdminSpawnDragPayload(event.dataTransfer, payload);
        });

        entityRows.push({
            element: row,
            searchText: entity.name
        });
    });

    const createRow = ({
        label,
        statKey = null,
        imageSrc = null,
        identity = '',
        controls = null,
        searchText = label,
        draggable = false,
        payload = null,
        onClick = null,
        onDoubleClick = null,
        branchLabel = null,
        branchButtonClass = 'admin-misc-branch-button',
        branchAriaLabel = '',
        onBranchClick = null
    }) => {
        const row = document.createElement('div');
        row.className = 'admin-entity-row';
        row.draggable = Boolean(draggable);
        row.setAttribute('role', onClick || onDoubleClick ? 'button' : 'listitem');
        if (onClick || onDoubleClick) row.tabIndex = 0;

        const name = document.createElement('span');
        name.textContent = label;
        if (statKey || imageSrc) {
            name.className = 'admin-stat-editor-name';
            row.style.gap = '8px';
            name.style.textAlign = 'left';
            const icon = document.createElement(imageSrc ? 'img' : 'span');
            icon.style.cssText = 'width:26px;height:26px;flex:0 0 26px;margin:0;object-fit:contain;background-size:contain;';
            if (imageSrc) { icon.src = imageSrc; icon.alt = ''; icon.draggable = false; }
            else {
                const visual = getDisplayStatKey(statKey);
                icon.className = `picto-stat ${visual}`;
                name.classList.add(visual);
                if (statKey.endsWith('Plus')) name.dataset.statState = '+';
            }
            const text = document.createElement('span');
            text.textContent = label;
            text.style.cssText = 'min-width:0;overflow-wrap:anywhere;';
            name.replaceChildren(icon, text);
        }

        const details = document.createElement('span');
        details.style.opacity = '0.7';
        if (statKey || imageSrc) details.style.flex = '0 0 auto';
        details.textContent = identity;
        row.append(name, controls || details);

        if (branchLabel && onBranchClick) {
            const branchButton = document.createElement('button');
            branchButton.type = 'button';
            branchButton.className = branchButtonClass;
            branchButton.textContent = branchLabel;
            branchButton.draggable = false;
            if (branchAriaLabel) branchButton.setAttribute('aria-label', branchAriaLabel);
            branchButton.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                onBranchClick(event);
            });
            branchButton.addEventListener('dblclick', event => {
                event.preventDefault();
                event.stopPropagation();
            });
            row.appendChild(branchButton);
        }

        if (onClick) {
            row.addEventListener('click', event => {
                if (event.target?.closest?.('input, select, textarea')) return;
                onClick(event);
            });
        }
        if (onClick || onDoubleClick) {
            row.addEventListener('keydown', event => {
                if (event.target !== row) return;
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                (onClick || onDoubleClick)(event);
            });
        }

        if (onDoubleClick) {
            row.addEventListener('dblclick', event => {
                if (event.target?.closest?.('input, select, textarea')) return;
                event.preventDefault();
                event.stopPropagation();
                onDoubleClick(event);
            });
        }

        if (draggable && payload) {
            row.addEventListener('dragstart', event => {
                const target = event.target instanceof Element ? event.target : event.target?.parentElement;
                if (!isAdminLevelActive() || target?.closest('button, input, select, textarea')) {
                    event.preventDefault();
                    return;
                }
                const data = typeof payload === 'function' ? payload() : payload;
                if (!data) {
                    event.preventDefault();
                    return;
                }
                setAdminSpawnDragPayload(event.dataTransfer, `ADMIN_SPAWN:${JSON.stringify(data)}`);
                event.stopPropagation();
            });
        }

        return { element: row, searchText };
    };

    function closeActiveAdminEntityToolViews() {
        rememberNavigation();
        while (viewStack[viewStack.length - 1]?.adminEntityTool) {
            viewStack.pop();
        }
    }

    function pushAdminEntityToolView(toolKey, title, rows, placeholder, entity, editorKey, options = {}) {
        const activeEntityView = getActiveAdminEntityEditorView();
        const activeLiveContext = getActiveAdminLiveEntityContext();
        const liveEdit = activeEntityView?.adminLiveEntityEditor === true || Boolean(activeLiveContext);
        const liveTarget = activeEntityView?.adminLiveEntityTarget || activeLiveContext?.liveTarget || null;
        if (options.replaceExistingToolView === true) closeActiveAdminEntityToolViews();

        pushRowsView(title, rows, placeholder, null, {
            adminEntityTool: true,
            adminToolTab: toolKey,
            navigation: options.navigation || { type: toolKey },
            adminLiveEntityEditor: liveEdit,
            adminLiveEntityTarget: liveTarget,
            entity,
            editorKey: editorKey || activeLiveContext?.editorKey || ''
        });
    }

    function createAdminToolBackRow(entity, label = '< Retour stats') {
        return createRow({
            label,
            identity: entity?.name || entity?.class || '',
            searchText: `retour stats ${entity?.name || ''} ${entity?.class || ''}`,
            onClick: () => closeRowsView()
        });
    }

    function createAdminToolEmptyRow(text) {
        const row = document.createElement('div');
        row.className = 'admin-entity-row admin-tool-empty-row';
        row.textContent = text;
        return {
            element: row,
            searchText: text
        };
    }

    function createAdminArchetypeToleranceRow(entity, editorKey, onChange = null) {
        const row = document.createElement('div');
        row.className = 'admin-entity-row admin-archetype-tolerance-row';
        row.draggable = false;

        const label = document.createElement('span');
        label.className = 'admin-archetype-tolerance-label';
        label.textContent = 'Tolérance voisin';

        const controls = document.createElement('span');
        controls.className = 'admin-archetype-tolerance-controls';

        const input = document.createElement('input');
        input.className = 'admin-archetype-tolerance-input';
        input.type = 'number';
        input.min = '0';
        input.step = '1';
        input.value = String(readAdminArchetypeTransitionTolerance(editorKey));
        input.setAttribute('aria-label', 'Tolérance de transition archétype');

        input.addEventListener('change', () => {
            const tolerance = setAdminArchetypeTransitionTolerance(editorKey, input.value);
            input.value = String(tolerance);
            eventStatus.textContent = `${entity?.name || 'Entité'} : tolérance archétype = ${tolerance}.`;
            eventStatus.hidden = false;
            if (typeof onChange === 'function') onChange(tolerance);
        });

        controls.append(input);
        row.append(label, controls);

        return {
            element: row,
            searchText: `tolerance archetype ${readAdminArchetypeTransitionTolerance(editorKey)}`
        };
    }

    function createAdminArchetypeRow(entity, editorKey, entry, index) {
        const row = document.createElement('div');
        row.className = `admin-entity-row admin-archetype-row ${entry.complete ? 'is-complete' : 'is-progress'}`;
        row.draggable = false;

        const main = document.createElement('span');
        main.className = 'admin-archetype-main';

        const title = document.createElement('span');
        title.className = 'admin-archetype-title';
        title.textContent = `${entry.label} ${entry.level}`;

        const detail = document.createElement('span');
        detail.className = 'admin-archetype-detail';
        detail.textContent = `${entry.step}/${entry.cycleLength || '?'} | ${formatAdminArchetypeRatios(entry.key)}`;

        main.append(title, detail);

        const actions = document.createElement('span');
        actions.className = 'admin-archetype-actions';

        if (!ADMIN_ARCHETYPE_EXCLUDED_PICKER_KEYS.has(entry.key)) {
            const pickButton = document.createElement('button');
            pickButton.type = 'button';
            pickButton.className = 'admin-archetype-pick-button';
            pickButton.textContent = '>';
            pickButton.setAttribute('aria-label', `Modifier ${entry.label} ${entry.level}`);
            pickButton.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                openAdminArchetypeCandidatePanel(entity, editorKey, index, entry);
            });
            actions.appendChild(pickButton);
        }

        row.append(main, actions);
        return {
            element: row,
            searchText: `${entry.label} ${entry.key} ${entry.level} ${entry.step} ${entry.cycleLength}`
        };
    }

    function openAdminArchetypeCandidatePanel(entity, editorKey, segmentIndex, sourceEntry = null) {
        const route = readAdminArchetypeSegments(entity);
        const hasActiveArchetype = readAdminActiveArchetypeSegments(entity).length > 0;
        const isInitialDefinition = segmentIndex === 0 && !sourceEntry && !hasActiveArchetype;
        const isAppend = segmentIndex >= route.length && !sourceEntry;
        const referenceKey = isInitialDefinition
            ? null
            : isAppend
            ? route[route.length - 1]?.key
            : (sourceEntry?.key || route[segmentIndex]?.key || null);
        const candidates = getAdminArchetypeCandidateOptions(entity, referenceKey, editorKey);
        const sourceLabel = isInitialDefinition
            ? 'Définir'
            : (sourceEntry?.label || getClassLabel(referenceKey) || 'Archétype');
        const rows = [
            createAdminToolBackRow(entity, '< Retour archétypes'),
            createAdminArchetypeToleranceRow(entity, editorKey, () => {
                closeRowsView();
                openAdminArchetypeCandidatePanel(entity, editorKey, segmentIndex, sourceEntry);
            })
        ];
        const remainingSteps = calculateAdminRemainingRouteSteps(entity, route);

        if (!candidates.length) {
            rows.push(createAdminToolEmptyRow(
                isInitialDefinition
                    ? 'Aucun archétype possible.'
                    : 'Aucun archétype voisin possible.'
            ));
        }

        candidates.forEach(candidate => {
            rows.push(createRow({
                label: candidate.label,
                identity: `${candidate.cycleLength} étapes | steps ${candidate.transitionSteps}/${readAdminArchetypeTransitionTolerance(editorKey)} | marge ${candidate.distance} | ${candidate.ratios}`,
                searchText: `${candidate.label} ${candidate.key} ${candidate.ratios}`,
                onClick: () => {
                    const prefix = route.slice(0, Math.max(0, segmentIndex));
                    const sourceSteps = readAdminArchetypeStepCount(sourceEntry?.step ?? sourceEntry?.steps);
                    const nextSteps = isAppend
                        ? (remainingSteps > 0
                            ? clampAdminArchetypeSegmentSteps(candidate.key, remainingSteps, entity)
                            : null)
                        : clampAdminArchetypeSegmentSteps(candidate.key, sourceSteps, entity);
                    const nextRoute = [
                        ...prefix,
                        {
                            key: candidate.key,
                            ...(nextSteps !== null ? { steps: nextSteps } : {})
                        }
                    ];
                    applyAdminArchetypeRouteChoice(entity, editorKey, nextRoute);
                    eventStatus.textContent = `${entity.name || 'Entité'} : archétype ${candidate.label} | niveau ${readAdminEntityLevelValue(entity)}.`;
                    eventStatus.hidden = false;
                    closeActiveAdminEntityToolViews();
                    openAdminEntityArchetypePanel(entity, editorKey);
                }
            }));
        });

        pushAdminEntityToolView(
            'archetypes',
            isInitialDefinition ? 'Définir un archétype' : `Remplacer ${sourceLabel}`,
            rows,
            'Rechercher un archétype…',
            entity,
            editorKey,
            { navigation: { type: 'archetype-choice', index: segmentIndex } }
        );
    }

    function openAdminEntityArchetypePanel(entity, editorKey) {
        if (!entity) return;

        recomputeAdminEntityStats(entity);
        const entries = readAdminActiveArchetypeEntries(entity)
            .filter(entry => entry.key !== 'egare')
            .filter(entry => entry.complete || entry.step > 0);
        const refreshArchetypePanel = () => {
            openAdminEntityArchetypePanel(entity, editorKey);
        };
        const rows = [
            createAdminToolBackRow(entity),
            createAdminLevelEditorRow(entity, editorKey, { onAfterApply: refreshArchetypePanel }),
            createAdminArchetypeToleranceRow(entity, editorKey)
        ];

        if (!entries.length) {
            rows.push(createAdminToolEmptyRow('Aucun archétype éveillé pour ce niveau.'));
            rows.push(createRow({
                label: 'Définir un archétype',
                identity: `niveau ${readAdminRequestedLevelValue(entity, editorKey)}`,
                searchText: `definir archetype ${entity.name || ''}`,
                branchLabel: '>',
                branchAriaLabel: 'Choisir un archétype',
                onBranchClick: () => openAdminArchetypeCandidatePanel(entity, editorKey, 0, null),
                onClick: () => openAdminArchetypeCandidatePanel(entity, editorKey, 0, null)
            }));
        } else {
            entries.forEach((entry, index) => {
                rows.push(createAdminArchetypeRow(entity, editorKey, entry, index));
            });

            const route = readAdminArchetypeSegments(entity);
            const remainingSteps = calculateAdminRemainingRouteSteps(entity, route);
            rows.push(createRow({
                label: 'Ajouter une cible',
                identity: remainingSteps > 0
                    ? `${remainingSteps} point(s) disponible(s)`
                    : 'future cible au prochain niveau',
                searchText: `ajouter cible archetype route ${entity.name || ''}`,
                branchLabel: '>',
                branchAriaLabel: 'Ajouter une cible archétype',
                onBranchClick: () => openAdminArchetypeCandidatePanel(entity, editorKey, route.length, null),
                onClick: () => openAdminArchetypeCandidatePanel(entity, editorKey, route.length, null)
            }));
        }

        pushAdminEntityToolView(
            'archetypes',
            `Archétypes ${entity.name || entity.class || ''}`,
            rows,
            'Rechercher un archétype actif…',
            entity,
            editorKey,
            { replaceExistingToolView: true }
        );
    }

    function getAdminAttackTitle(attack, index = 0) {
        return attack?.displayName || attack?.functionName || attack?.attackId || `Attaque ${index + 1}`;
    }

    function getAdminAttackListFieldConfig(fieldKey) {
        return ADMIN_ATTACK_LIST_FIELDS.find(field => field.key === fieldKey) || null;
    }

    function readAdminAttackListFieldValue(attack, field) {
        const values = normalizeAdminAttackArrayValue(attack?.[field.key]);
        return field.multi === false ? values.slice(0, 1) : values;
    }

    function normalizeAdminAttackListFieldValue(field, values) {
        let nextValues = normalizeAdminAttackArrayValue(values)
            .map(value => String(value).trim())
            .filter(Boolean);

        if (field.multi === false) {
            nextValues = nextValues.slice(0, 1);
        }

        if (field.key === 'effets' || field.key === 'selfEffects') {
            nextValues = [...new Set(nextValues.filter(value => value !== 'none'))];
            if (field.key === 'effets' && nextValues.length === 0) nextValues = ['none'];
        }

        return field.scalar ? nextValues[0] : nextValues;
    }

    function buildAdminAttackNaturePatch(entity, attack, natures) {
        // Nature is derived from sockets: edit the draft's existing essence model.
        syncEntityLinkedEssenceInventory(entity);
        const colors = getAttackEssenceColorsFromNatures(natures);
        const slots = (attack.essenceSlots || []).map(slot => colors.includes(slot.color)
            ? { ...slot }
            : { ...slot, color: null, active: false, essenceId: '', essenceSource: '', linkedColor: '' });
        const items = entity.attackEssenceInventory.linkedItems;
        const usedIds = new Set(slots.filter(slot => slot.color).map(slot => slot.essenceId));

        colors.forEach(color => {
            if (slots.some(slot => slot.color === color && slot.active !== false)) return;
            let slot = slots.find(candidate => candidate.color === color && candidate.active === false)
                || slots.find(candidate => !candidate.color);
            if (!slot && slots.length < ATTACK_ESSENCE_MAX_SLOTS) {
                slot = { slotId: `admin-${crypto.randomUUID()}`, kind: 'open', source: 'admin' };
                slots.push(slot);
            }
            // A full attack can change family without exceeding the socket limit.
            slot ||= slots.find(candidate => slots.filter(other => other.color === candidate.color).length > 1);
            let item = items.find(candidate => candidate.id === slot.essenceId && candidate.color === color)
                || items.find(candidate => candidate.color === color && !usedIds.has(candidate.id)
                && candidate.state === 'available');
            if (!item) {
                item = createLinkedEssenceItem(entity.id, color, {
                    origin: 'admin', provenanceSource: 'admin',
                    provenanceContext: { entityId: entity.id, attackKey: attack.entityAttackId }
                });
                items.push(item);
            }
            usedIds.delete(slot.essenceId);
            usedIds.add(item.id);
            Object.assign(slot, { color, active: true, essenceId: item.id, essenceSource: 'linked', linkedColor: color });
        });
        return { attacknature: natures, essenceSlots: slots };
    }

    function applyAdminAttackFieldValue(entity, editorKey, attackIndex, fieldKey, value) {
        const attacks = readAdminEntityAttackDefinitions(entity);
        const attack = attacks[attackIndex];
        if (!attack) return null;

        const field = getAdminAttackListFieldConfig(fieldKey);
        const nextValue = field
            ? normalizeAdminAttackListFieldValue(field, value)
            : value;

        const oldStats = cloneAdminPlainData(entity.stats || {}, {});
        const patch = fieldKey === 'attacknature'
            ? buildAdminAttackNaturePatch(entity, attack, nextValue)
            : { [fieldKey]: nextValue };
        const updated = updateEntityAttackDefinition(entity, attack, patch, ADMIN_ATTACK_DETAILS);

        if (!updated) return null;

        recomputeAdminEntityStats(entity);
        refreshAdminEditedLiveEntity(entity, oldStats);
        return updated;
    }

    function reopenAdminAttackEditorPanel(entity, editorKey, attackIndex) {
        closeActiveAdminEntityToolViews();
        openAdminEntityAttacksPanel(entity, editorKey);
        openAdminAttackEditorPanel(entity, editorKey, attackIndex);
    }

    function createAdminAttackEditorSectionRow(label) {
        const row = document.createElement('div');
        row.className = 'admin-entity-row admin-stat-editor-header admin-attack-editor-section';
        row.textContent = label;
        return {
            element: row,
            searchText: label
        };
    }

    function createAdminAttackTextFieldRow(entity, editorKey, attackIndex, attack, field) {
        const row = document.createElement('div');
        row.className = 'admin-entity-row admin-attack-editor-field-row';
        row.draggable = false;

        const label = document.createElement('span');
        label.className = 'admin-attack-editor-field-label';
        label.textContent = field.label;

        const input = document.createElement('input');
        input.className = 'admin-attack-editor-input admin-attack-editor-input--text';
        input.type = 'text';
        input.value = String(attack?.[field.key] ?? '');
        input.setAttribute('aria-label', field.label);
        const applyValue = () => {
            const updated = applyAdminAttackFieldValue(entity, editorKey, attackIndex, field.key, input.value);
            if (!updated) return;
            input.value = String(updated[field.key] ?? '');
            eventStatus.textContent = `${entity.name || 'Entité'} : ${field.label} attaque = ${input.value || 'vide'}.`;
            eventStatus.hidden = false;
        };

        input.addEventListener('input', applyValue);
        input.addEventListener('change', applyValue);
        input.addEventListener('click', event => event.stopPropagation());
        input.addEventListener('dblclick', event => event.stopPropagation());

        row.append(label, input);
        return {
            element: row,
            searchText: `${field.label} ${field.key} ${input.value}`
        };
    }

    function createAdminAttackNumberFieldRow(entity, editorKey, attackIndex, attack, field) {
        const row = document.createElement('div');
        row.className = 'admin-entity-row admin-attack-editor-field-row';
        row.draggable = false;

        const label = document.createElement('span');
        label.className = 'admin-attack-editor-field-label';
        label.textContent = field.suffix ? `${field.label} (${field.suffix})` : field.label;

        const controls = document.createElement('span');
        controls.className = 'admin-stat-editor-controls admin-attack-editor-controls';

        const minus = document.createElement('button');
        minus.type = 'button';
        minus.className = 'admin-stat-editor-step-button';
        minus.textContent = '<';

        const input = document.createElement('input');
        input.className = 'admin-stat-editor-input admin-attack-editor-input';
        input.type = 'number';
        input.step = String(field.step ?? 'any');
        input.value = String(Number(attack?.[field.key] ?? 0) || 0);
        input.setAttribute('aria-label', field.label);

        const plus = document.createElement('button');
        plus.type = 'button';
        plus.className = 'admin-stat-editor-step-button';
        plus.textContent = '>';

        const applyValue = (rawValue, { forceDisplay = false } = {}) => {
            const numericValue = Number(rawValue);
            if (!Number.isFinite(numericValue)) return;

            const updated = applyAdminAttackFieldValue(entity, editorKey, attackIndex, field.key, numericValue);
            if (!updated) return;

            const displayedValue = Number(updated[field.key] ?? 0) || 0;
            if (forceDisplay) input.value = String(displayedValue);
            eventStatus.textContent = `${entity.name || 'Entité'} : ${field.label} = ${displayedValue}${field.suffix ? ` ${field.suffix}` : ''}.`;
            eventStatus.hidden = false;
        };

        minus.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            const currentValue = Number.isFinite(Number(input.value)) ? Number(input.value) : Number(attack?.[field.key] ?? 0) || 0;
            applyValue(currentValue - Number(field.step || 1), { forceDisplay: true });
        });

        plus.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            const currentValue = Number.isFinite(Number(input.value)) ? Number(input.value) : Number(attack?.[field.key] ?? 0) || 0;
            applyValue(currentValue + Number(field.step || 1), { forceDisplay: true });
        });

        input.addEventListener('input', event => {
            event.stopPropagation();
            const rawValue = input.value.trim();
            if (!rawValue || rawValue === '-' || rawValue === '.' || rawValue === '-.') return;
            applyValue(rawValue);
        });
        input.addEventListener('change', () => {
            const numericValue = Number(input.value);
            if (Number.isFinite(numericValue)) applyValue(numericValue, { forceDisplay: true });
            else input.value = String(Number(attack?.[field.key] ?? 0) || 0);
        });
        input.addEventListener('click', event => event.stopPropagation());
        input.addEventListener('dblclick', event => event.stopPropagation());

        controls.append(minus, input, plus);
        row.append(label, controls);
        return {
            element: row,
            searchText: `${field.label} ${field.key} ${input.value}`
        };
    }

    function createAdminAttackListFieldRow(entity, editorKey, attackIndex, attack, field) {
        return createRow({
            label: field.label,
            identity: formatAdminAttackListValue(readAdminAttackListFieldValue(attack, field)),
            searchText: `${field.label} ${field.key} ${formatAdminAttackListValue(readAdminAttackListFieldValue(attack, field))}`,
            branchLabel: '>',
            branchButtonClass: 'admin-attack-pick-button',
            branchAriaLabel: `Modifier ${field.label}`,
            onBranchClick: () => openAdminAttackListFieldPanel(entity, editorKey, attackIndex, field.key),
            onClick: () => openAdminAttackListFieldPanel(entity, editorKey, attackIndex, field.key)
        });
    }

    function openAdminAttackListFieldPanel(entity, editorKey, attackIndex, fieldKey) {
        const field = getAdminAttackListFieldConfig(fieldKey);
        const attack = readAdminEntityAttackDefinitions(entity)[attackIndex];
        if (!field || !attack) return;

        const effectField = field.key === 'effets' || field.key === 'selfEffects';
        const nature = field.key === 'attacknature' ? getAttackNatureRules(attack) : null;
        const currentValues = new Set(readAdminAttackListFieldValue(attack, field));
        const options = [...new Set([
            ...(field.key === 'effets' && !field.options.includes('none') ? ['none'] : []),
            ...field.options,
            ...(effectField ? [] : currentValues)
        ])].filter(option => option && (!effectField || option !== 'none'));

        const rows = [
            createRow({
                label: '< Retour attaque',
                identity: getAdminAttackTitle(attack, attackIndex),
                onClick: () => reopenAdminAttackEditorPanel(entity, editorKey, attackIndex)
            })
        ];

        if (field.multi === false && !field.required && field.key !== 'attackRange') {
            rows.push(createRow({
                label: 'Aucun',
                identity: currentValues.size === 0 ? 'actif' : '',
                searchText: `${field.label} aucun`,
                onClick: () => {
                    applyAdminAttackFieldValue(entity, editorKey, attackIndex, field.key, []);
                    reopenAdminAttackEditorPanel(entity, editorKey, attackIndex);
                }
            }));
        }

        options.forEach(option => {
            if (effectField) {
                const definition = getAttackEffectDefinition(option);
                const label = definition?.effectDisplay || option;
                const row = document.createElement('label');
                row.className = 'admin-entity-row admin-attack-effect-toggle';
                const input = document.createElement('input');
                input.type = 'checkbox';
                input.checked = currentValues.has(option);
                input.dataset.attackEffect = option;
                input.dataset.attackEffectField = field.key;
                const text = document.createElement('span');
                text.textContent = label;
                row.append(input, text);
                if (Object.keys(EFFECT_PARAMETER_SCHEMAS[option] || {}).length) {
                    const settings = document.createElement('button');
                    settings.type = 'button'; settings.textContent = 'Réglages';
                    settings.setAttribute('aria-label', `Réglages ${label}`);
                    settings.style.marginLeft = 'auto';
                    settings.addEventListener('click', event => {
                        event.preventDefault(); event.stopPropagation();
                        openAdminEffectParameters(entity, editorKey, attackIndex, field.key, option);
                    });
                    row.append(settings);
                }
                input.addEventListener('change', () => {
                    // Read the current draft every time: toggles stay open and accumulate.
                    const current = readAdminEntityAttackDefinitions(entity)[attackIndex];
                    const selected = new Set(readAdminAttackListFieldValue(current, field));
                    selected.delete('none');
                    if (input.checked) selected.add(option);
                    else selected.delete(option);
                    const updated = applyAdminAttackFieldValue(entity, editorKey, attackIndex, field.key, [...selected]);
                    input.checked = readAdminAttackListFieldValue(updated || current, field).includes(option);
                });
                rows.push({ element: row, searchText: `${field.label} ${label} ${option}` });
                return;
            }
            const preset = nature && ADMIN_ATTACK_NATURE_PRESETS.includes(option)
                ? getAttackNatureRules({ attacknature: [option] }) : null;
            const label = preset?.label || option;
            const active = preset ? nature.key === preset.key : currentValues.has(option);
            rows.push(createRow({
                label: active ? `✓ ${label}` : label,
                identity: field.label,
                searchText: `${field.label} ${label} ${option}`,
                onClick: () => {
                    let nextValues;
                    if (preset) {
                        // A named combination replaces the previous family; sockets
                        // and their existing purity still use the shared nature editor.
                        nextValues = active ? [] : [option];
                    } else if (field.multi === false) {
                        nextValues = active && !field.required && field.key !== 'attackRange' ? [] : [option];
                    } else if (active) {
                        nextValues = [...currentValues].filter(value => value !== option);
                        if (field.key === 'attackTarget' && !nextValues.length) return;
                    } else {
                        nextValues = [...currentValues, option];
                    }

                    applyAdminAttackFieldValue(entity, editorKey, attackIndex, field.key, nextValues);
                    reopenAdminAttackEditorPanel(entity, editorKey, attackIndex);
                }
            }));
        });

        pushAdminEntityToolView(
            'attacks',
            `${field.label} ${getAdminAttackTitle(attack, attackIndex)}`,
            rows,
            `Rechercher ${field.label.toLowerCase()}…`,
            entity,
            editorKey,
            { navigation: { type: 'attack-field', index: attackIndex, field: field.key } }
        );
    }

    function openAdminEffectParameters(entity, editorKey, attackIndex, fieldKey, effectName) {
        const definition = getAttackEffectDefinition(effectName);
        const overrideKey = fieldKey === 'selfEffects' ? 'selfEffectOverrides' : 'effectOverrides';
        const read = () => readAdminEntityAttackDefinitions(entity)[attackIndex];
        const rows = [createRow({ label: '< Retour effets', onClick: () => openAdminAttackListFieldPanel(entity, editorKey, attackIndex, fieldKey) })];
        rows.push(createAdminAttackEditorSectionRow(definition.effectDisplay));
        const modes = effectApplicationModes(effectName);
        if (modes.length) {
            const block = document.createElement('label'); block.className = 'admin-effect-application-mode';
            block.textContent = 'Réapplication : ';
            const select = document.createElement('select'); select.setAttribute('aria-label', 'Réapplication');
            select.add(new Option(`Par défaut : ${EFFECT_APPLICATION_MODES[definition.applicationMode]}`, ''));
            for (const mode of modes) select.add(new Option(EFFECT_APPLICATION_MODES[mode], mode));
            select.value = read()[overrideKey]?.[effectName]?.applicationMode || '';
            select.onchange = () => {
                const overrides = structuredClone(read()[overrideKey] || {});
                overrides[effectName] = { ...overrides[effectName], applicationMode: select.value || null };
                applyAdminAttackFieldValue(entity, editorKey, attackIndex, overrideKey, overrides);
            };
            const help = document.createElement('small');
            help.textContent = effectName === 'brulure'
                ? 'Feu collectif : apports additionnés, plafonds par lanceur et attaque. Cadence conservée.'
                : 'Rafraîchit : même lanceur et même attaque, valeurs actualisées et cadence conservée. Remplace : retire les applications précédentes de ce même effet après les résistances.';
            block.append(select, help); rows.push({ element: block, searchText: 'Réapplication cumul rafraîchit remplace' });
        }
        if (effectName === 'brulure') {
            const rules = balanceData.effectRules.burn;
            for (const [key, label, min, max] of [
                ['tickSeconds', 'Intervalle commun des ticks (s)', 0.05, null],
                ['maintenanceSeconds', 'Cycle commun d’entretien (s)', 0.05, null],
                ['lossPercent', 'Perte par cycle non entretenu (%)', 0.1, 100],
                ['extinctionPercent', 'Extinction sous la puissance initiale (%)', 0.1, 100],
            ]) {
                const block = document.createElement('label'); block.textContent = label;
                const input = document.createElement('input'); input.type = 'number'; input.step = 'any'; input.min = min;
                if (max != null) input.max = max;
                input.value = rules[key]; input.setAttribute('aria-label', label);
                input.onchange = () => {
                    if (!input.reportValidity() || !Number.isFinite(Number(input.value))) return;
                    rules[key] = Number(input.value);
                    window.dispatchEvent(new CustomEvent('attackEffectsRulesChanged'));
                };
                block.append(input); rows.push({ element: block, searchText: `Brûlure réglage commun ${label}` });
            }
            rows.push(createRow({ label: 'Réglages communs de cette session, copiés dans le simulateur. Les feux déjà allumés gardent leur cycle.' }));
        }
        for (const [key, schema] of Object.entries(EFFECT_PARAMETER_SCHEMAS[effectName] || {})) {
            const block = document.createElement('div');
            block.className = 'admin-effect-parameter'; block.dataset.effectParameter = key;
            block.style.cssText = 'padding:10px;border-bottom:1px solid #76530a;display:grid;gap:7px';
            const heading = document.createElement('strong'); heading.textContent = `${schema.label}${schema.unit ? ` (${schema.unit})` : ''}`;
            const inherited = document.createElement('small'); inherited.textContent = `Valeur par défaut : ${schema.default} ${schema.unit}`;
            const stored = read()[overrideKey]?.[effectName]?.[key];
            if (schema.choices) {
                const select = document.createElement('select'); select.setAttribute('aria-label', schema.label);
                for (const [value, label] of Object.entries(schema.choices)) select.add(new Option(label, value));
                select.value = String(stored ?? schema.default);
                select.onchange = () => {
                    const overrides = structuredClone(read()[overrideKey] || {});
                    overrides[effectName] = { ...overrides[effectName], [key]: typeof schema.default === 'number' ? Number(select.value) : select.value };
                    applyAdminAttackFieldValue(entity, editorKey, attackIndex, overrideKey, overrides);
                };
                block.append(heading, select); rows.push({ element: block, searchText: `${definition.effectDisplay} ${schema.label}` });
                continue;
            }
            let formula = stored && typeof stored === 'object' ? structuredClone(stored) : { flat: stored ?? schema.default, ratios: [] };
            formula.ratios ||= [];
            const mode = document.createElement('select'); mode.setAttribute('aria-label', `${schema.label} — mode`);
            for (const [value,label] of [['fixed','Valeur fixe'],['ratios','Valeur avec ratios']]) mode.add(new Option(label,value));
            mode.value = formula.ratios.length ? 'ratios' : 'fixed';
            const flat = document.createElement('input'); flat.type='number'; flat.step='any'; flat.min=String(schema.min ?? 0);
            if (schema.max != null) flat.max=String(schema.max);
            flat.value=String(formula.flat ?? schema.default); flat.setAttribute('aria-label', `${schema.label} — montant fixe`);
            const terms = document.createElement('div'); terms.style.display='grid'; terms.style.gap='6px';
            const preview = document.createElement('output'); preview.setAttribute('aria-live','polite');
            const refreshPreview = () => {
                const attack = { ...read(), [fieldKey]: [effectName] };
                const value = previewAttackEffects(attack, createAttackStatView(entity, attack), fieldKey === 'selfEffects')[0]?.[key];
                preview.textContent = `Valeur obtenue : ${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 }).format(value)} ${schema.unit} — avant résistances`;
            };
            const persist = value => {
                const overrides = structuredClone(read()[overrideKey] || {});
                overrides[effectName] = { ...overrides[effectName], [key]: value };
                applyAdminAttackFieldValue(entity, editorKey, attackIndex, overrideKey, overrides);
                refreshPreview();
            };
            const save = () => {
                if (!flat.reportValidity()) return;
                formula.flat=Number(flat.value);
                persist(mode.value === 'fixed' ? formula.flat : structuredClone(formula));
            };
            const renderTerms = () => {
                terms.replaceChildren();
                if (mode.value === 'fixed') return;
                formula.ratios.forEach((term,index) => {
                    const line=document.createElement('div'); line.style.cssText='display:flex;gap:4px;flex-wrap:wrap';
                    const stat=document.createElement('select'); stat.style.maxWidth='140px'; stat.setAttribute('aria-label', `${schema.label} — statistique ${index+1}`);
                    for (const row of ADMIN_STATS_DATA) stat.add(new Option(row.name || row.label || row.key,row.key));
                    stat.value=term.stat;
                    const coefficient=document.createElement('input'); coefficient.type='number'; coefficient.step='any'; coefficient.value=term.coefficient;
                    coefficient.style.width='65px'; coefficient.setAttribute('aria-label', `${schema.label} — coefficient ${index+1}`);
                    const curve=document.createElement('select'); curve.setAttribute('aria-label', `${schema.label} — courbe ${index+1}`);
                    curve.add(new Option('Ratio fixe','fixed')); curve.add(new Option('Ratio évolutif existant','progressive')); curve.value=term.curve || 'fixed';
                    const remove=document.createElement('button'); remove.type='button'; remove.textContent='Retirer';
                    remove.onclick=()=>{formula.ratios.splice(index,1);save();renderTerms();};
                    const change=()=>{ if (!coefficient.reportValidity()) return; Object.assign(term,{stat:stat.value,coefficient:Number(coefficient.value),curve:curve.value});save(); };
                    stat.onchange=coefficient.onchange=curve.onchange=change;
                    line.append(stat,coefficient,curve,remove);terms.append(line);
                });
                const add=document.createElement('button'); add.type='button'; add.textContent='Ajouter un ratio';
                add.onclick=()=>{formula.ratios.push({stat:'intelligence',coefficient:0,curve:'fixed'});renderTerms();save();};
                terms.append(add);
            };
            mode.onchange=()=>{renderTerms();save();}; flat.onchange=save;
            const reset=document.createElement('button'); reset.type='button'; reset.textContent='Reprendre la valeur par défaut';
            reset.onclick=()=>{formula={flat:schema.default,ratios:[]};flat.value=schema.default;mode.value='fixed';renderTerms();persist(null);};
            renderTerms();refreshPreview();
            block.append(heading,inherited,mode,flat,terms,preview,reset);
            rows.push({element:block,searchText:`${definition.effectDisplay} ${schema.label}`});
        }
        pushAdminEntityToolView('attacks', `Réglages ${definition.effectDisplay}`, rows, 'Rechercher un paramètre…', entity, editorKey);
    }

    function openAdminAttackEditorPanel(entity, editorKey, attackIndex) {
        const attacks = readAdminEntityAttackDefinitions(entity);
        const attack = attacks[attackIndex];
        if (!attack) return;

        const knownNumericKeys = new Set(ADMIN_ATTACK_NUMERIC_FIELDS.map(field => field.key));
        const dynamicNumericFields = Object.keys(attack)
            .filter(key => !key.startsWith('effect') && !knownNumericKeys.has(key))
            .filter(key => typeof attack[key] === 'number' && Number.isFinite(attack[key]))
            .map(key => Object.freeze({ key, label: key, step: 1 }));
        const numericFields = [...ADMIN_ATTACK_NUMERIC_FIELDS, ...dynamicNumericFields];

        const rows = [
            createAdminToolBackRow(entity, '< Retour attaques'),
            createRow({
                label: 'Remplacer attaque',
                identity: getAdminAttackTitle(attack, attackIndex),
                searchText: `remplacer attaque ${getAdminAttackTitle(attack, attackIndex)}`,
                branchLabel: '>',
                branchButtonClass: 'admin-attack-pick-button',
                branchAriaLabel: 'Choisir une autre attaque',
                onBranchClick: () => openAdminAttackCandidatePanel(entity, editorKey, attackIndex),
                onClick: () => openAdminAttackCandidatePanel(entity, editorKey, attackIndex)
            })
        ];

        ADMIN_ATTACK_TEXT_FIELDS.forEach(field => {
            rows.push(createAdminAttackTextFieldRow(entity, editorKey, attackIndex, attack, field));
        });

        rows.push(createAdminAttackEditorSectionRow('Type'));
        ADMIN_ATTACK_LIST_FIELDS.forEach(field => {
            rows.push(createAdminAttackListFieldRow(entity, editorKey, attackIndex, attack, field));
        });

        rows.push(createAdminAttackEditorSectionRow('Valeurs'));
        numericFields.forEach(field => {
            rows.push(createAdminAttackNumberFieldRow(entity, editorKey, attackIndex, attack, field));
        });

        pushAdminEntityToolView(
            'attacks',
            `Modifier ${getAdminAttackTitle(attack, attackIndex)}`,
            rows,
            'Rechercher un champ attaque…',
            entity,
            editorKey,
            { navigation: { type: 'attack', index: attackIndex } }
        );
    }

    function createAdminAttackRow(entity, editorKey, attack, index, attacks) {
        const row = document.createElement('div');
        row.className = 'admin-entity-row admin-attack-row';
        row.draggable = false;

        const main = document.createElement('span');
        main.className = 'admin-attack-main';

        const title = document.createElement('span');
        title.className = 'admin-attack-title';
        title.textContent = getAdminAttackTitle(attack, index);

        const detail = document.createElement('span');
        detail.className = 'admin-attack-detail';
        detail.textContent = [
            `portée ${formatAdminAttackListValue(attack.attackRange)}`,
            `nature ${formatAdminAttackListValue(attack.attacknature)}`,
            formatAdminAttackRatios(attack),
        ].join(' | ');

        main.append(title, detail);

        const actions = document.createElement('span');
        actions.className = 'admin-attack-actions';

        const pickButton = document.createElement('button');
        pickButton.type = 'button';
        pickButton.className = 'admin-attack-pick-button';
        pickButton.textContent = '>';
        pickButton.setAttribute('aria-label', `Modifier ${title.textContent}`);
        pickButton.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            openAdminAttackEditorPanel(entity, editorKey, index);
        });
        actions.appendChild(pickButton);

        const replaceButton = document.createElement('button');
        replaceButton.type = 'button';
        replaceButton.className = 'admin-attack-pick-button admin-attack-replace-button';
        replaceButton.textContent = 'Changer';
        replaceButton.setAttribute('aria-label', `Remplacer ${title.textContent}`);
        replaceButton.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            openAdminAttackCandidatePanel(entity, editorKey, index);
        });
        actions.appendChild(replaceButton);

        if (attacks.length > 1) {
            const removeButton = document.createElement('button');
            removeButton.type = 'button';
            removeButton.className = 'admin-attack-remove-button';
            removeButton.textContent = 'Retirer';
            removeButton.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                const nextAttacks = attacks.filter((_, attackIndex) => attackIndex !== index);
                applyAdminAttackListChoice(entity, editorKey, nextAttacks);
                eventStatus.textContent = `${entity.name || 'Entité'} : attaque retirée.`;
                eventStatus.hidden = false;
                closeActiveAdminEntityToolViews();
                openAdminEntityAttacksPanel(entity, editorKey);
            });
            actions.appendChild(removeButton);
        }

        row.append(main, actions);
        row.addEventListener('click', () => openAdminAttackEditorPanel(entity, editorKey, index));
        return {
            element: row,
            searchText: `${title.textContent} ${attack.functionName || ''} ${formatAdminAttackListValue(attack.attackRange)} ${formatAdminAttackListValue(attack.attacknature)}`
        };
    }

    function openAdminAttackCandidatePanel(entity, editorKey, attackIndex) {
        const attacks = readAdminEntityAttackDefinitions(entity);
        const rows = [
            createAdminToolBackRow(entity, '< Retour attaques')
        ];

        ADMIN_ATTACK_DETAILS.forEach(attack => {
            const label = attack.displayName || attack.functionName || attack.attackId || 'Attaque';
            rows.push(createRow({
                label,
                identity: `${formatAdminAttackListValue(attack.attackRange)} | ${formatAdminAttackListValue(attack.attacknature)} | ${formatAdminAttackRatios(attack)}`,
                searchText: `${label} ${attack.functionName || ''} ${attack.attackId || ''} ${formatAdminAttackListValue(attack.attackRange)} ${formatAdminAttackListValue(attack.attacknature)}`,
                onClick: () => {
                    const nextAttacks = attacks.slice();
                    nextAttacks[attackIndex] = attack;
                    applyAdminAttackListChoice(entity, editorKey, nextAttacks);
                    eventStatus.textContent = `${entity.name || 'Entité'} : attaque ${attackIndex + 1} = ${label}.`;
                    eventStatus.hidden = false;
                    closeActiveAdminEntityToolViews();
                    openAdminEntityAttacksPanel(entity, editorKey);
                }
            }));
        });

        pushAdminEntityToolView(
            'attacks',
            `Choisir attaque ${attackIndex + 1}`,
            rows,
            'Rechercher une attaque…',
            entity,
            editorKey,
            { navigation: { type: 'attack-choice', index: attackIndex } }
        );
    }

    function openAdminEntityAttacksPanel(entity, editorKey) {
        if (!entity) return;

        const attacks = readAdminEntityAttackDefinitions(entity);
        const rows = [
            createAdminToolBackRow(entity)
        ];

        if (!attacks.length) {
            rows.push(createAdminToolEmptyRow('Aucune attaque définie.'));
        } else {
            attacks.forEach((attack, index) => {
                rows.push(createAdminAttackRow(entity, editorKey, attack, index, attacks));
            });
        }

        rows.push(createRow({
            label: 'Ajouter une attaque',
            identity: `${attacks.length} active(s)`,
            searchText: `ajouter attaque ${entity.name || ''}`,
            branchLabel: '>',
            branchAriaLabel: 'Choisir une attaque à ajouter',
            onBranchClick: () => openAdminAttackCandidatePanel(entity, editorKey, attacks.length),
            onClick: () => openAdminAttackCandidatePanel(entity, editorKey, attacks.length)
        }));

        pushAdminEntityToolView(
            'attacks',
            `Attaques ${entity.name || entity.class || ''}`,
            rows,
            'Rechercher une attaque active…',
            entity,
            editorKey,
            { replaceExistingToolView: true }
        );
    }

    const getDefaultCorpseEntity = () => entityCatalog.find(entity => (
        String(entity?.name || entity?.nom || '').toLowerCase().includes('porc')
    )) || entityCatalog[0] || null;

    const groundItemDefinitions = ItemDetails.filter(isBattleConsumable);
    const groundSummonDefinitions = summons.filter(summon => summon.summonType === 'consommable');

    const spawnAdminGround = ({ side = menuState.side, position = null, itemSerial, summonEffect, crystal = false, statKey = null, crystalLevel = null, amount = null } = {}) => {
        if (!isAdminLevelActive()) return null;
        const count = document.querySelectorAll('#hexGrid .hex').length;
        const positions = position ? [position]
            : [...new Set([side, 'neutral', 'A', 'B'])].flatMap(zone => hexCoordonne(zone, 'middle', 'center', count));
        const hex = positions.map(value => document.querySelector(`#hexGrid .hex[data-position="${CSS.escape(String(value))}"]`))
            .find(node => node && (position || !node.matches('.occupied, .consommable-summoned')
                && !node.querySelector('.chest-container')));
        if (!hex) {
            eventStatus.textContent = 'Aucune case disponible pour cet objet.';
            eventStatus.hidden = false;
            return null;
        }
        eventStatus.textContent = '';
        eventStatus.hidden = true;
        const summon = groundSummonDefinitions.find(entry => entry.summonEffect === summonEffect);
        if (summon) return spawnAdminGroundSummon(summon.summonEffect, hex, { infinite: menuState.infiniteItems });
        if (!crystal && !groundItemDefinitions.some(entry => entry.serial === itemSerial)) return null;
        if (crystal) {
            if (crystalLevel !== null && !PERMANENT_CRYSTAL_LEVELS.some(entry => entry.level === crystalLevel)) return null;
            // A category spawn picks one child, then one stat within that child.
            if (statKey === null && crystalLevel === null) {
                crystalLevel = PERMANENT_CRYSTAL_LEVELS[Math.floor(Math.random() * PERMANENT_CRYSTAL_LEVELS.length)].level;
            }
            const choices = getPermanentStatChoices().filter(entry => crystalLevel === null || entry.crystalLevel === crystalLevel);
            if (statKey === null) statKey = choices[Math.floor(Math.random() * choices.length)]?.key;
            if (!choices.some(entry => entry.key === statKey)) return null;
        }
        const item = crystal ? createUmbraCrystal({ statKey, amount, origin: 'admin-spawn' }) : createIngameItem(itemSerial, 'admin-spawn');
        if (!item) return null;
        if (spawnBattleGroundItem(item, hex, 'admin-spawn', { infinite: menuState.infiniteItems })) return item;
        removeItem(item.itemId);
        return null;
    };

    const renderItemRows = () => [
        ...groundItemDefinitions.map(item => {
            const data = { __adminSpawn: 1, kind: 'item', side: menuState.side, itemSerial: item.serial };
            const row = createRow({ label: item.displayName, imageSrc: item.itemAsset,
                identity: 'Consommable', searchText: `${item.displayName} ${item.serial}`,
                draggable: true, payload: data, onClick: () => spawnAdminGround(data) });
            row.element.dataset.itemSerial = item.serial;
            return row;
        }),
        ...groundSummonDefinitions.map(summon => {
            const data = { __adminSpawn: 1, kind: 'item', side: menuState.side, summonEffect: summon.summonEffect };
            const row = createRow({ label: summon.summonDisplayName, imageSrc: summon.summonSprite,
                identity: 'Invocation', draggable: true, payload: data, onClick: () => spawnAdminGround(data) });
            row.element.dataset.summonEffect = summon.summonEffect;
            return row;
        })
    ];

    const spawnAdminMisc = async ({
        side,
        miscType,
        status = 'lootable',
        entity = null,
        position = null,
        statKey = null,
        crystalLevel = null,
        amount = null
    } = {}) => {
        if (!isAdminLevelActive()) return null;

        try {
            if (miscType === 'crystal') return spawnAdminGround({ side, position, crystal: true, statKey, crystalLevel, amount });
            const eventsApi = await import("../events/runtime.js");
            if (miscType === 'chest') {
                return eventsApi.spawnChest({
                    side,
                    status,
                    position,
                    spawnMode: position ? 'in-place' : 'drop',
                    forceNew: true,
                    random: true,
                    eventKey: 'admin-spawn'
                });
            }

            const corpseEntity = entity || getDefaultCorpseEntity();
            return eventsApi.spawnDead({
                side,
                status,
                serial: corpseEntity?.serial ?? null,
                entityName: corpseEntity?.name || corpseEntity?.nom || 'Porc des bas-fonds',
                createOptions: position ? { position } : {},
                eventKey: 'admin-spawn'
            });
        } catch (error) {
            console.error('❌ Création du misc admin impossible :', error);
            eventStatus.textContent = `Échec spawn misc : ${error?.message || error}`;
            eventStatus.hidden = false;
            return null;
        }
    };

    const miscPayload = (miscType, status = 'lootable', entity = null) => ({
        __adminSpawn: 1,
        kind: 'misc',
        side: menuState.side,
        miscType,
        status,
        ...(entity ? { entity } : {})
    });

    const openMiscType = (miscType) => {
        menuState.miscType = miscType;
        menuState.miscStatus = null;
        menuState.crystalLevel = null;
        resetSearch();
        persistAndRender();
    };

    const renderMiscRoot = () => [
        createRow({
            label: 'Cristaux',
            identity: 'Aléatoire : +1 / +2 / +3',
            imageSrc: PERMANENT_CRYSTAL_LEVELS[1].back,
            draggable: true,
            payload: () => miscPayload('crystal'),
            onDoubleClick: () => spawnAdminMisc({ side: menuState.side, miscType: 'crystal' }),
            branchLabel: '>',
            branchAriaLabel: 'Choisir le niveau du crystal',
            onBranchClick: () => openMiscType('crystal')
        }),
        createRow({
            label: 'Chest',
            identity: 'lootable par défaut',
            draggable: true,
            payload: () => miscPayload('chest'),
            onDoubleClick: () => spawnAdminMisc({
                side: menuState.side,
                miscType: 'chest',
                status: 'lootable'
            }),
            branchLabel: '>',
            branchAriaLabel: 'Options coffre',
            onBranchClick: () => openMiscType('chest')
        }),
        createRow({
            label: 'Corpse',
            identity: 'lootable par défaut',
            draggable: true,
            payload: () => miscPayload('corpse'),
            onDoubleClick: () => spawnAdminMisc({
                side: menuState.side,
                miscType: 'corpse',
                status: 'lootable'
            }),
            branchLabel: '>',
            branchAriaLabel: 'Options cadavre',
            onBranchClick: () => openMiscType('corpse')
        })
    ];

    const backToMiscRow = (label = '< Retour misc') => createRow({
        label,
        identity: menuState.side === 'neutral' ? 'Neutral' : `Side ${menuState.side}`,
        onClick: () => {
            menuState.miscType = null;
            menuState.miscStatus = null;
            menuState.crystalLevel = null;
            resetSearch();
            persistAndRender();
        }
    });

    const renderChestStatusRows = () => [
        backToMiscRow(),
        ...ADMIN_CHEST_STATUSES.map(status => createRow({
            label: status.label,
            identity: 'Chest',
            draggable: true,
            payload: () => miscPayload('chest', status.key),
            onDoubleClick: () => spawnAdminMisc({
                side: menuState.side,
                miscType: 'chest',
                status: status.key
            })
        }))
    ];

    const renderCrystalLevelRows = () => [
        backToMiscRow(),
        ...PERMANENT_CRYSTAL_LEVELS.map(entry => {
            const choices = getPermanentStatChoices().filter(choice => choice.crystalLevel === entry.level);
            const data = { ...miscPayload('crystal'), crystalLevel: entry.level };
            const row = createRow({
                label: `Niv. ${entry.level} : ${entry.label}`, imageSrc: entry.back,
                identity: `${choices.length} stats`,
                searchText: `${entry.level} ${entry.label} ${choices.map(choice => `${choice.name} ${choice.key}`).join(' ')}`,
                draggable: true, payload: data,
                onDoubleClick: () => spawnAdminMisc(data),
                branchLabel: '>', branchAriaLabel: `Stats des cristaux niveau ${entry.level}`,
                onBranchClick: () => {
                    menuState.crystalLevel = entry.level;
                    resetSearch();
                    persistAndRender();
                }
            });
            row.element.dataset.crystalTier = entry.level;
            return row;
        })
    ];

    const renderCrystalRows = () => [
        createRow({
            label: '< Retour cristaux', identity: `Niv. ${menuState.crystalLevel}`,
            onClick: () => {
                menuState.crystalLevel = null;
                resetSearch();
                persistAndRender();
            }
        }),
        ...getPermanentStatChoices().filter(choice => choice.crystalLevel === menuState.crystalLevel).map(choice => {
            const data = { ...miscPayload('crystal'), crystalLevel: choice.crystalLevel, statKey: choice.key };
            const controls = document.createElement('span');
            controls.className = `admin-stat-editor-controls ${choice.icon}`;
            if (choice.key.endsWith('Plus')) controls.dataset.statState = '+';
            const input = document.createElement('input');
            input.className = 'admin-stat-editor-input admin-crystal-amount';
            input.type = 'number';
            input.min = '1';
            input.max = String(Number.MAX_SAFE_INTEGER);
            input.step = '1';
            input.placeholder = '1-3';
            input.value = String(menuState.crystalAmounts[choice.key] ?? '');
            input.setAttribute('aria-label', `Montant de ${choice.name}`);
            input.title = 'Gain permanent (vide : +1 à +3 aléatoire)';
            input.addEventListener('input', () => {
                if (!input.checkValidity()) return;
                if (input.value === '') delete menuState.crystalAmounts[choice.key];
                else menuState.crystalAmounts[choice.key] = input.valueAsNumber;
                writeAdminMenuState(menuState);
            });
            controls.append(input, document.createTextNode(choice.unit));
            const payload = () => input.reportValidity()
                ? { ...data, amount: input.value === '' ? null : input.valueAsNumber } : null;
            const row = createRow({ label: choice.name, statKey: choice.key, controls,
                draggable: true, payload,
                onClick: () => {
                    const requested = payload();
                    if (requested) spawnAdminMisc(requested);
                } });
            row.element.dataset.crystalStat = choice.key;
            row.element.dataset.crystalLevel = choice.crystalLevel;
            return row;
        })
    ];

    const renderCorpseStatusRows = () => [
        backToMiscRow(),
        ...ADMIN_CORPSE_STATUSES.map(status => createRow({
            label: status.label,
            identity: 'Corpse',
            draggable: true,
            payload: () => miscPayload('corpse', status.key),
            onDoubleClick: () => spawnAdminMisc({
                side: menuState.side,
                miscType: 'corpse',
                status: status.key
            }),
            branchLabel: '>',
            branchAriaLabel: `Entités cadavre ${status.label}`,
            onBranchClick: () => {
                menuState.miscStatus = status.key;
                persistAndRender();
            }
        }))
    ];

    const renderCorpseEntityRows = () => [
        createRow({
            label: '< Retour corpse',
            identity: menuState.miscStatus || '',
            onClick: () => {
                menuState.miscStatus = null;
                persistAndRender();
            }
        }),
        ...entityRows
    ];

    const applyAdminBiome = async (biome, options = {}) => {
        try {
            const { applyBiomeRealtime } = await import("../board/controller.js");
            const applied = applyBiomeRealtime(biome.classe, options);
            eventStatus.textContent = applied
                ? `Biome appliqué : ${biome.name || biome.classe}.`
                : `Biome introuvable : ${biome.classe}.`;
            eventStatus.hidden = false;
        } catch (error) {
            console.error('❌ Changement de biome impossible :', error);
            eventStatus.textContent = `Échec biome : ${error?.message || error}`;
            eventStatus.hidden = false;
        }
    };

    const createBiomeRow = (biome) => {
        const row = document.createElement('div');
        row.className = 'admin-entity-row admin-biome-row';
        row.setAttribute('role', 'button');
        row.setAttribute('aria-disabled', 'false');
        row.tabIndex = 0;

        const name = document.createElement('span');
        name.textContent = biome.name || biome.classe;

        const details = document.createElement('span');
        details.style.opacity = '0.7';
        details.textContent = biome.classe;

        const arrow = document.createElement('button');
        arrow.type = 'button';
        arrow.className = 'admin-biome-size-button';
        arrow.textContent = '>';
        arrow.setAttribute('aria-label', `Tailles ${biome.name || biome.classe}`);

        row.append(name, details, arrow);

        const applySkinOnly = () => applyAdminBiome(biome);
        const openSizes = (event = null) => {
            event?.stopPropagation?.();
            menuState.biomeClass = biome.classe;
            persistAndRender();
        };

        row.addEventListener('click', applySkinOnly);
        row.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            applySkinOnly();
        });
        arrow.addEventListener('click', openSizes);

        return {
            element: row,
            searchText: `${biome.name || ''} ${biome.classe || ''} small medium large`
        };
    };

    const renderBiomeRows = () => levelBiome.map(createBiomeRow);

    const renderBiomeSizeRows = () => {
        const biome = levelBiome.find(candidate => candidate.classe === menuState.biomeClass);
        if (!biome) {
            menuState.biomeClass = null;
            return renderBiomeRows();
        }

        return [
            createRow({
                label: '< Retour biomes',
                identity: biome.name || biome.classe,
                onClick: () => {
                    menuState.biomeClass = null;
                    persistAndRender();
                }
            }),
            ...[
                { key: 'small', label: 'Small' },
                { key: 'medium', label: 'Medium' },
                { key: 'large', label: 'Large' }
            ].map(size => createRow({
                label: size.label,
                identity: biome.name || biome.classe,
                searchText: `${biome.name || ''} ${biome.classe || ''} ${size.label}`,
                onClick: () => applyAdminBiome(biome, { size: size.key })
            }))
        ];
    };

    function getActiveAdminEntityEditorView() {
        for (let index = viewStack.length - 1; index >= 0; index -= 1) {
            const view = viewStack[index];
            if (view?.adminStatsEditor || view?.adminEntityTool) return view;
        }

        return null;
    }

    function getActiveAdminLiveEntityContext() {
        for (let index = viewStack.length - 1; index >= 0; index -= 1) {
            const view = viewStack[index];
            if (view?.adminLiveEntityEditor === true && view.entity) {
                activeAdminLiveEntityContext = {
                    draft: view.entity,
                    liveTarget: view.adminLiveEntityTarget || activeAdminLiveEntityContext?.liveTarget || null,
                    editorKey: view.editorKey || activeAdminLiveEntityContext?.editorKey || getAdminLiveEntityEditorKey(view.entity)
                };
                return activeAdminLiveEntityContext;
            }
        }

        return activeAdminLiveEntityContext;
    }

    function renderShell() {
        form.dataset.activeAdminTab = menuState.mode;
        form.dataset.activeSide = menuState.side;
        modeTabs.querySelectorAll('button').forEach(button => {
            const isActive = button.dataset.adminTabKey === menuState.mode;
            button.classList.toggle('active', isActive);
            button.classList.toggle('passive', !isActive);
        });
        sideTabs.querySelectorAll('button').forEach(button => {
            const isActive = button.dataset.adminTabKey === menuState.side;
            button.classList.toggle('active', isActive);
            button.classList.toggle('passive', !isActive);
        });
        categoryTabs.querySelectorAll('button').forEach(button => {
            const isActive = button.dataset.adminTabKey === menuState.category;
            button.classList.toggle('active', isActive);
            button.classList.toggle('passive', !isActive);
        });

        const showSpawnOptions = menuState.mode === 'spawn';
        infiniteLabel.hidden = !showSpawnOptions || viewStack.length > 0 || !(menuState.category === 'items'
            || menuState.category === 'misc' && (!menuState.miscType || menuState.miscType === 'crystal'));
        const activeEntityView = getActiveAdminEntityEditorView();
        const activeLiveContext = getActiveAdminLiveEntityContext();
        const isLiveEdit = activeEntityView?.adminLiveEntityEditor === true || Boolean(activeLiveContext);
        sideTabs.style.display = showSpawnOptions ? 'flex' : 'none';
        categoryTabs.style.display = showSpawnOptions ? 'flex' : 'none';
        generateEditedEntityButton.hidden = !activeEntityView || isLiveEdit;
        validateLiveEntityButton.hidden = !isLiveEdit;
        duplicateEntityButton.hidden = !isLiveEdit;
        resurrectEntityButton.hidden = !isLiveEdit;
        updateResurrectButton();
        liveEntityActions.hidden = !isLiveEdit;
        editorToolTabs.hidden = !activeEntityView;
        form.classList.toggle('admin-has-entity-tools', Boolean(activeEntityView));
        form.classList.toggle('admin-mode-live-editor', isLiveEdit);
        if (formTitle) {
            const titleEntity = activeLiveContext?.liveTarget || activeEntityView?.adminLiveEntityTarget || activeEntityView?.entity;
            formTitle.textContent = isLiveEdit
                ? `Modifier ${titleEntity?.name || titleEntity?.class || 'entité'}`
                : 'Sélectionner les entités (Admin)';
        }
        editorToolTabs.querySelectorAll('[data-admin-entity-tool]').forEach(button => {
            const activeTool = activeEntityView?.adminStatsEditor
                ? 'stats'
                : activeEntityView?.adminToolTab;
            const isActive = activeTool === button.dataset.adminEntityTool;
            button.classList.toggle('active', isActive);
            button.classList.toggle('passive', !isActive);
        });
        resetLevelButton.hidden = false;
        eventStatus.hidden = !eventStatus.textContent;
    }

    function renderCurrentView() {
        activateNavigation();
        if (viewStack.length > 0) {
            const view = viewStack[viewStack.length - 1];
            currentRows = view.getRows ? view.getRows() : view.rows;
            searchInput.placeholder = view.placeholder;
            renderAdminList();
            if (view.adminStatsEditor) refreshAdminVisibleWillFlexControls(view.editorKey, view.entity);
            return;
        }

        if (menuState.mode === 'events') {
            currentRows = eventRows;
            searchInput.placeholder = 'Rechercher un événement…';
        } else if (menuState.mode === 'biome') {
            currentRows = menuState.biomeClass
                ? renderBiomeSizeRows()
                : renderBiomeRows();
            searchInput.placeholder = menuState.biomeClass
                ? 'Rechercher une taille…'
                : 'Rechercher un biome…';
        } else if (menuState.category === 'entity') {
            currentRows = entityRows;
            searchInput.placeholder = 'Rechercher une entité…';
        } else if (menuState.category === 'items') {
            currentRows = renderItemRows();
            searchInput.placeholder = 'Rechercher un objet…';
        } else if (!menuState.miscType) {
            currentRows = renderMiscRoot();
            searchInput.placeholder = 'Rechercher un élément misc…';
        } else if (menuState.miscType === 'chest') {
            currentRows = renderChestStatusRows();
            searchInput.placeholder = 'Rechercher un coffre…';
        } else if (menuState.miscType === 'crystal') {
            currentRows = menuState.crystalLevel ? renderCrystalRows() : renderCrystalLevelRows();
            searchInput.placeholder = menuState.crystalLevel ? 'Rechercher une stat de crystal…' : 'Rechercher un niveau de crystal…';
        } else if (!menuState.miscStatus) {
            currentRows = renderCorpseStatusRows();
            searchInput.placeholder = 'Rechercher un type de cadavre…';
        } else {
            currentRows = renderCorpseEntityRows();
            searchInput.placeholder = 'Rechercher une entité pour le cadavre…';
        }

        renderAdminList();
    }

    resetLevelButton.addEventListener('click', async () => {
        let restoreAdminBattleActions = null;

        try {
            const {
                StopGame,
                resetBattleResolution,
                setOrderSide,
                manageBattleActions,
                BATTLE_ACTION_MODE
            } = await import("../app/state.js");
            StopGame();
            resetBattleResolution();
            setOrderSide(null);
            restoreAdminBattleActions = () => manageBattleActions({
                mode: BATTLE_ACTION_MODE.START,
                dialogueActive: false,
                entityList: entites
            });
        } catch (error) {
            console.warn('Reset admin : arrêt combat partiel.', error);
        }

        try {
            const { resetActiveEventsImmediately, attackSurprise } = await import("../events/runtime.js");
            attackSurprise(null);
            resetActiveEventsImmediately({ resetSource: 'admin-level-reset' });
        } catch (error) {
            console.warn('Reset admin : arrêt event partiel.', error);
        }

        try {
            const { clearProjectileEffects } = await import("../rendering/animations.js");
            clearProjectileEffects(entites);
        } catch (error) {
            console.warn('Reset admin : nettoyage projectiles partiel.', error);
        }

        setAdminSelectedEntity(null);
        clearBattleGroundItems();
        document.querySelectorAll(
            '#hexGrid .entite-box, #hexGrid .battle-element, .loot-interface, .destroyed-corpse, .event-dialogue-overlay, .projectile-parent, .projectile-impacte'
        ).forEach(element => element.remove());
        document.querySelectorAll('#hexGrid .hex').forEach(hex => {
            hex.classList.remove('occupied', 'focused');
            delete hex.dataset.occupiedBy;
            const socle = hex.querySelector('.socle');
            if (socle) {
                socle.style.opacity = '0';
                socle.style.filter = '';
            }
            hex.querySelectorAll('.focused').forEach(node => node.classList.remove('focused'));
        });
        entites.splice(0, entites.length);

        syncEntityFootprints();
        const chestStorage = loadFromLocalStorage('ChestLoot', { chests: [] });
        if (Array.isArray(chestStorage.chests)) {
            chestStorage.chests = chestStorage.chests.filter(chest => (
                String(chest?.level ?? chest?.stageId ?? '') !== String(currentStageId)
            ));
            saveToLocalStorage('ChestLoot', chestStorage);
        }

        const corpseStorage = loadFromLocalStorage('PersistentCorpseLootSources', { corpses: [] });
        if (Array.isArray(corpseStorage.corpses)) {
            corpseStorage.corpses = corpseStorage.corpses.filter(corpse => (
                String(corpse?.level ?? corpse?.stageId ?? '') !== String(currentStageId)
            ));
            saveToLocalStorage('PersistentCorpseLootSources', corpseStorage);
        }

        selectedEntitiesA.length = 0;
        selectedEntitiesB.length = 0;
        selectedEntitiesNeutral.length = 0;
        restoreAdminBattleActions?.();
        eventStatus.textContent = 'Niveau admin réinitialisé.';
        eventStatus.hidden = false;
        renderCurrentView();
    });

    invincibleModeInput.addEventListener('change', () => {
        writeAdminInvincibleMode(invincibleModeInput.checked);
        updateInvincibleModeControl();
    });

    form.addEventListener('submit', event => {
        event.preventDefault();
        event.stopPropagation();
        if (!isAdminLevelActive() || !form.isConnected || validateLiveEntityButton.hidden || validateLiveEntityButton.disabled) return;
        const applied = validateAdminLiveEntityEditor();
        if (!applied) renderShell();
    });

    generateEditedEntityButton.addEventListener('click', async event => {
        event.preventDefault();
        event.stopPropagation();

        const view = getActiveAdminEntityEditorView();
        if (!view?.entity) return;
        if (view.adminLiveEntityEditor === true) {
            eventStatus.textContent = `${view.entity.name || 'Entité'} est déjà en modification live.`;
            eventStatus.hidden = false;
            return;
        }

        const created = await spawnEntity(
            view.entity,
            form.dataset.activeSide || 'A',
            null,
            view.editorKey || getAdminStatEditorKey(view.entity)
        );
        if (!created) return;

        refreshAdminSpawnedEntityIds();
        eventStatus.textContent = `${view.entity.name || 'Entité'} générée.`;
        eventStatus.hidden = false;
    });

    const adminDragOverInterceptor = event => {
        if (!isAdminLevelActive() || !document.getElementById('admin-entity-form')) return;

        const hex = event.target?.closest?.('.hex');
        if (!hex || !hasAdminSpawnDragPayload(event.dataTransfer)) return;

        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };

    const adminDropInterceptor = async event => {
        if (!isAdminLevelActive() || !document.getElementById('admin-entity-form')) return;

        const hex = event.target?.closest?.('.hex');
        const rawPayload = getAdminSpawnDragPayload(event.dataTransfer);
        if (!hex || !rawPayload.startsWith('ADMIN_SPAWN:')) return;

        event.preventDefault();
        event.stopImmediatePropagation();

        let payload;
        try {
            payload = JSON.parse(rawPayload.slice('ADMIN_SPAWN:'.length));
        } catch (error) {
            console.error('❌ Payload ADMIN_SPAWN invalide :', error);
            return;
        }

        const position = getAdminHexPosition(hex);
        const side = normalizeAdminSpawnSide(payload.side);
        if (payload.kind === 'item') {
            spawnAdminGround({ side, position, itemSerial: payload.itemSerial, summonEffect: payload.summonEffect });
            return;
        }
        if (payload.kind === 'misc') {
            await spawnAdminMisc({
                side,
                miscType: payload.miscType,
                status: payload.status,
                entity: payload.entity,
                statKey: payload.statKey ?? null,
                crystalLevel: payload.crystalLevel ?? null,
                amount: payload.amount ?? null,
                position
            });
            return;
        }

        const created = await spawnEntity(payload.entity, side, position, payload.editorKey);
        if (!created) return;

        assignUniqueIDToEntities(selectedEntitiesA);
        assignUniqueIDToEntities(selectedEntitiesB);
        assignUniqueIDToEntities(selectedEntitiesNeutral);
    };

    const adminBoardEntityEditClickInterceptor = event => {
        if (event?.type === 'dblclick') {
            clearPendingAdminLiveEntityClick();
            if (event.__adminLiveEntityDblClickHandled) return;
            const box = event.target?.closest?.('.entite-box[id^="Box_Entite_"]');
            if (!box) return;
            event.__adminLiveEntityDblClickHandled = true;
            openAdminLiveEntityFromBox(box, event, { preserveEvent: true });
            return;
        }
        if (event?.type !== 'click') return;
        if (Number(event.detail) >= 2) {
            clearPendingAdminLiveEntityClick();
            return;
        }
        if (event.__adminLiveEntityClickHandled) return;
        if (!isAdminLevelActive() || !document.getElementById('admin-entity-form')) return;
        if (form.contains(event.target)) return;
        if (event.target?.closest?.('.codex-entity-scan, [id^="codex-entity_"], .entite-details')) return;

        const box = event.target?.closest?.('.entite-box[id^="Box_Entite_"]');
        if (box) {
            const entityId = box.id.replace(/^Box_Entite_/, '');
            const entity = entites.find(candidate => String(candidate?.id) === String(entityId));
            if (!entity) return;
            scheduleAdminLiveEntityFromBoxClick(box, event);
            return;
        }

        if (event.target?.closest?.('#hexGrid .hex')) {
            closeAdminLiveEntityEditor();
        }
    };

    window.__adminDragOverInterceptor = adminDragOverInterceptor;
    window.__adminDropInterceptor = adminDropInterceptor;
    window.__adminBoardEntityEditClickInterceptor = adminBoardEntityEditClickInterceptor;
    document.addEventListener('dragover', adminDragOverInterceptor, true);
    document.addEventListener('drop', adminDropInterceptor, true);
    ['click', 'dblclick'].forEach(eventName => {
        document.addEventListener(eventName, adminBoardEntityEditClickInterceptor, true);
    });
    bindAdminLiveEntityBoxHandlers();
    const adminBoardEntityEditBoxObserver = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType !== Node.ELEMENT_NODE) return;
                bindAdminLiveEntityBoxHandlers(node);
            });
        });
        updateResurrectButton();
    });
    adminBoardEntityEditBoxObserver.observe(document.body, {
        childList: true,
        subtree: true
    });
    window.__adminBoardEntityEditBoxObserver = adminBoardEntityEditBoxObserver;

    updateInvincibleModeControl();
    form.append(panelActions, modeTabs, sideTabs, categoryTabs, infiniteLabel, searchTools, eventStatus, list, generateEditedEntityButton, editorToolTabs);
    ensureGameShell().appendChild(form);
    (document.querySelector('.scoring-ui') || ensureGameShell()).appendChild(resetLevelButton);
    if (!restoringCombat) restoreBattleGroundItems();
    renderShell();
    renderCurrentView();

    return { A: selectedEntitiesA, B: selectedEntitiesB, neutral: selectedEntitiesNeutral };
}

// Alias temporaire pour les anciens imports pendant la migration.
export const selectAdminEntitiesForSideB = initializeAdminLevel;
export const enableDeleteKeyForFocusedEntity = enableAdminDeleteKey;
