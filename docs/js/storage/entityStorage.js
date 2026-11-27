import { updateMovementDisplay } from "../rendering/hud.js";
import { updateHealthBar } from "../rendering/vitalFeedback.js";
import {
  registerCombatState, notifyCombatAction, clockNow,
} from "../combat/clock.js";

import { saveToLocalStorage, loadFromLocalStorage, saveCurrentGameData, loadEquippedItems,
  loadCombatArmyForUpdate, saveCombatArmyUpdate } from "./gameStorage.js";
import { showHealingFeedback, toggleEffectClass } from "../combat/effects.js";

import { toNonNegInt } from "../ui/display.js";
import { calculateShiftDailyStartingCharges, calculateHpBattleRegenAmount } from "../combat/statistics.js";
import { attemptBattleRegen } from "../rendering/damageFeedback.js";
import { battleLogs } from "../combat/journal.js";
import { syncEntityAuras } from "../rendering/auras.js";
import { getSafe, getCycleLenFor } from "../entities/rules.js";
import { entites, removedEntities } from "../entities/runtime.js";
import {
  applyArmorLayersToEquippedItems,
  resetEntityRegenerableArmor,
} from "../items/armor.js";
import {
  applyResourceStocksToEquippedItems, syncEntityResourceStocks, resetDailyMovement,
} from "../items/resourceStocks.js";

const combatNatureKeys = new Set([
    'physicalDamage', 'magicalDamage', 'transpiercingDamage', 'hybridalDamage',
    'physicalPiercingDamage', 'magicalPiercingDamage', 'hybridalPiercingDamage', 'inerte'
]);
const combatComponentKeys = ['physical', 'magical', 'piercing'];
const combatRangeKeys = ['melee', 'ranged', 'other'];
export const COMBAT_ROLES = ['gueux', 'tank', 'fantassin', 'mage'];
const battleRoleSessions = new Map();
const manualMovementVersions = new Map();
let movementVersion = 0;
const combatAmountKeys = [
    'hypercognitionDamage',
    'inertResistanceInput', 'inertPhysicalReduction', 'inertMagicalReduction',
    'hpDamageDealt', 'armorDamageDealt', 'hpDamageReceived',
    'battleHpRegenerated', 'dailyHpRecovered',
    'fleeAttempts', 'fleeSuccesses', 'fleeFailures', 'trailerCharges',
    'blockedMovements', 'negativeMovements', 'physicalProjectilesAvoided',
    'consumablesUsed', 'consumablesGround', 'consumablesPouch', 'consumablesInventory',
    'consumablesCombatGround', 'consumablesCombatPouch',
    'consumablesHostile', 'consumablesSupport', 'consumableDamageReceived', 'consumableHealingReceived',
];
const nonnegative = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
const normalizeTotals = values => Object.fromEntries(Object.entries(values || {}).map(([key, value]) => [key, nonnegative(value)]));

function cloneArmorLayers(entite) {
  if (!entite?.armorLayers || typeof entite.armorLayers !== 'object') return null;
  if (typeof structuredClone === 'function') return structuredClone(entite.armorLayers);
  return JSON.parse(JSON.stringify(entite.armorLayers));
}

function persistEquippedArmorReserves(entite) {
  if (!entite?.armorLayers?.stuff) return;

  const equippedItems = loadFromLocalStorage('equippedItems', []);
  const updatedItems = applyArmorLayersToEquippedItems(entite, equippedItems);
  const changed = JSON.stringify(updatedItems) !== JSON.stringify(equippedItems);
  if (changed) saveToLocalStorage('equippedItems', updatedItems);

  const playerSave = loadFromLocalStorage('PlayerSave', {});
  if (playerSave && typeof playerSave === 'object' && Array.isArray(playerSave.equippedItems)) {
    const updated = applyArmorLayersToEquippedItems(entite, playerSave.equippedItems);
    if (JSON.stringify(updated) !== JSON.stringify(playerSave.equippedItems)) {
      playerSave.equippedItems = updated;
      saveToLocalStorage('PlayerSave', playerSave);
    }
  }

  const itemData = loadFromLocalStorage('IngameItemsData', {});
  if (itemData && typeof itemData === 'object' && Array.isArray(itemData.equippedItems)) {
    const updated = applyArmorLayersToEquippedItems(entite, itemData.equippedItems);
    if (JSON.stringify(updated) !== JSON.stringify(itemData.equippedItems)) {
      itemData.equippedItems = updated;
      saveToLocalStorage('IngameItemsData', itemData);
    }
  }
  if (changed) {
    window.dispatchEvent(new CustomEvent('equippedItemsUpdated', {
      detail: { action: 'reserves', entity: entite },
    }));
  }
}

function copyResourceStock(target, source, key) {
  if (!source.resourceStocks?.[key]) return;
  target.resourceStocks ??= {};
  target.resourceStocks[key] = structuredClone(source.resourceStocks[key]);
}

export function persistEquippedResourceStocks(entity) {
  if (!entity.resourceStocks) return;
  const equipped = loadFromLocalStorage('equippedItems', []);
  const updated = applyResourceStocksToEquippedItems(entity, equipped);
  const changed = JSON.stringify(updated) !== JSON.stringify(equipped);
  if (changed) saveToLocalStorage('equippedItems', updated);
  for (const key of ['PlayerSave', 'IngameItemsData']) {
    const bucket = loadFromLocalStorage(key, {});
    if (!Array.isArray(bucket.equippedItems)) continue;
    const updatedBucket = applyResourceStocksToEquippedItems(entity, bucket.equippedItems);
    if (JSON.stringify(updatedBucket) !== JSON.stringify(bucket.equippedItems)) {
      bucket.equippedItems = updatedBucket;
      saveToLocalStorage(key, bucket);
    }
  }
  if (changed) {
    window.dispatchEvent(new CustomEvent('equippedItemsUpdated', {
      detail: { action: 'reserves', entity },
    }));
  }
}

const summonAmountKeys = ['count', 'consumed', 'expired', 'lost', 'kills', 'deaths',
    'damageDealt', 'healingDone', 'damageReceived', 'healingReceived'];

function readSummonRecords(value) {
    return Object.fromEntries(['entities', 'consumables'].map(kind => [kind,
        Object.fromEntries(Object.entries(value?.[kind] || {}).map(([key, entry]) => [key, {
            name: String(entry.name || 'Invocation'),
            combatFunction: ['Attaquant', 'Support', 'Arbitre'].includes(entry.combatFunction) ? entry.combatFunction : 'Attaquant',
            ...Object.fromEntries(summonAmountKeys.map(metric => [metric, nonnegative(entry[metric])])),
            damageByNature: normalizeTotals(entry.damageByNature),
        }]))]));
}

function findSummonOwner(id, source) {
    if (String(source?.id) === String(id)) return source;
    const pools = [entites, removedEntities];
    if (typeof window !== 'undefined') pools.push(window.selectedArmyA, window.selectedArmyB);
    for (const pool of pools) {
        const owner = Array.isArray(pool) && pool.find(item => String(item?.id) === String(id));
        if (owner) return owner;
    }
    const ally = loadFromLocalStorage('selectedArmyA', []).find(item => String(item.id) === String(id));
    if (ally) return ally;
    for (const army of Object.values(loadFromLocalStorage('ArmyB', {})?.armies || {})) {
        const enemy = army.entities?.find(item => String(item.id) === String(id));
        if (enemy) return enemy;
    }
    return null;
}

// Attribution is to the direct caster only; it never increases that caster's personal damage.
export function recordSummonOutcome(source, amounts, origin = source?.summonOrigin?.statistics, nature = null) {
    if (!origin || !['entities', 'consumables'].includes(origin.kind)) return false;
    const owner = findSummonOwner(origin.casterId, source);
    if (!owner) return false;
    const details = editableCombatDetails(owner);
    const record = details.summons[origin.kind][origin.key];
    if (!record) return false;
    for (const key of summonAmountKeys) {
        if (key !== 'count') record[key] += nonnegative(amounts?.[key]);
    }
    if (amounts?.damageDealt > 0) {
        const key = combatNatureKeys.has(nature) ? nature : 'unclassified';
        record.damageByNature[key] = nonnegative(record.damageByNature[key]) + nonnegative(amounts.damageDealt);
    }
    saveEntityCombatTotals(owner);
    return true;
}

export function recordSummonCreated(owner, subject, { kind = 'entities', template = subject } = {}) {
    if (owner?.id == null || !subject || !['entities', 'consumables'].includes(kind)) return null;
    const previous = kind === 'entities' ? subject.summonOrigin?.statistics : subject.summonStatsOrigin;
    if (previous) return previous;
    const functions = new Set((subject.attackDetails || []).map(attack => attack.combatFunction)
        .filter(value => value === 'Attaquant' || value === 'Support'));
    if (kind === 'consumables') {
        if (template.summonEffet?.includes('poisonConsommable')) functions.add('Attaquant');
        if (template.summonEffet?.includes('healConsommable')) functions.add('Support');
    }
    const combatFunction = functions.size > 1 ? 'Arbitre' : functions.has('Support') ? 'Support' : 'Attaquant';
    const name = String(template.summonDisplayName || template.name || template.class || 'Invocation');
    // Jarrets share summonId; their effect distinguishes the healthy and rotten types.
    const type = kind === 'consumables' ? template.summonEffect || template.summonId || name
        : template.templateKey || template.class || name;
    const key = JSON.stringify([String(type), name, combatFunction]);
    const origin = { casterId: owner.id, kind, key };
    if (kind === 'entities') {
        subject.summonOrigin = { ...subject.summonOrigin, casterId: owner.id, statistics: origin };
    } else subject.summonStatsOrigin = origin;
    const details = editableCombatDetails(owner);
    details.summons[kind][key] ||= {
        name, combatFunction, ...Object.fromEntries(summonAmountKeys.map(metric => [metric, 0])), damageByNature: {},
    };
    details.summons[kind][key].count++;
    saveEntityCombatTotals(owner);
    return origin;
}

export function recordEntityKill(entity, summonOrigin) {
    if (!entity) return;
    entity.kills = nonnegative(entity.kills) + 1;
    recordSummonOutcome(entity, { kills: 1 }, summonOrigin);
    saveEntityCombatTotals(entity);
}

export function recordInertResistance(entity, stages) {
    if (!entity || !stages || stages.before <= 0) return;
    const details = editableCombatDetails(entity);
    details.inertResistanceInput += nonnegative(stages.before);
    details.inertPhysicalReduction += nonnegative(stages.before - stages.afterPhysical);
    details.inertMagicalReduction += nonnegative(stages.afterPhysical - stages.afterMagical);
    saveEntityCombatTotals(entity);
}

function readRoleTotals(entity) {
    return Object.fromEntries(COMBAT_ROLES.map(role => [role, Object.fromEntries(
        ['battles', 'damageDealt', 'damageReceived', 'durationMs'].map(key =>
            [key, nonnegative(entity?.combatDetails?.roles?.[role]?.[key])]))]));
}

function currentCombatRole(entity) {
    const role = Array.isArray(entity?.role) ? entity.role[0] : entity?.role;
    return entity?.type === 'sbire' && COMBAT_ROLES.includes(role) ? role : null;
}

function settleCombatRole(entity, now = clockNow()) {
    const session = battleRoleSessions.get(String(entity?.id));
    if (!session || session.paused) return;
    entity.combatDetails ||= {};
    entity.combatDetails.roles = readRoleTotals(entity);
    if (session.role) entity.combatDetails.roles[session.role].durationMs += Math.max(0, now - session.since);
    session.since = now;
    const role = currentCombatRole(entity);
    session.role = role;
    if (role && !session.visited.has(role)) {
        entity.combatDetails.roles[role].battles++;
        session.visited.add(role);
    }
}

export function beginEntityBattleRole(entity, now = clockNow()) {
    if (!entity || entity.type !== 'sbire') return;
    if (battleRoleSessions.has(String(entity.id))) return;
    battleRoleSessions.set(String(entity.id), { entity, role: currentCombatRole(entity), since: now, visited: new Set(), paused: false });
    settleCombatRole(entity, now);
    saveEntityCombatTotals(entity, now);
}

export function endEntityBattleRole(entity, { pause = false, now = clockNow() } = {}) {
    const session = battleRoleSessions.get(String(entity?.id));
    if (!session) return;
    settleCombatRole(entity, now);
    if (pause) session.paused = true;
    else battleRoleSessions.delete(String(entity.id));
    saveEntityCombatTotals(entity, now);
}

function stopCombatRoleSessions() {
    for (const session of [...battleRoleSessions.values()]) endEntityBattleRole(session.entity);
    manualMovementVersions.clear();
}
if (typeof window !== 'undefined') {
    for (const event of ['battleResolved', 'battleStopped', 'stageInterfaceClosing']) {
        window.addEventListener(event, stopCombatRoleSessions);
    }
}

function combatRangeKey(range) {
    return range === 'ranged' ? 'ranged' : 'melee';
}

function combatRangeTotals(value) {
    return Object.fromEntries(combatRangeKeys.map(key =>
        [key, Math.max(0, Number(value?.[key]) || 0)]));
}

export function getEntityCombatDetails(entity, { elapsed = true, now = clockNow() } = {}) {
    const details = entity?.combatDetails || {};
    const roles = readRoleTotals(entity);
    const session = battleRoleSessions.get(String(entity?.id));
    if (elapsed && session?.role && !session.paused) roles[session.role].durationMs += Math.max(0, now - session.since);
    return {
        ...Object.fromEntries(combatAmountKeys.map(key => [key, nonnegative(details[key])])),
        defenseHp: normalizeTotals(details.defenseHp),
        summons: readSummonRecords(details.summons),
        livesUsed: normalizeTotals(details.livesUsed),
        roles,
        lifetime: {
            ...Object.fromEntries(['experienceSpent', 'daysAlive', 'daysDead', 'aliveStreak', 'deadStreak',
                'longestAliveStreak', 'longestDeadStreak', 'lastTrackedDay'].map(key =>
                [key, nonnegative(details.lifetime?.[key])])),
            maxLevelReached: Math.max(1, nonnegative(entity?.level?.current ?? entity?.level), nonnegative(details.lifetime?.maxLevelReached)),
            archetypesCompleted: Math.max(countCompletedArchetypes(entity), nonnegative(details.lifetime?.archetypesCompleted)),
        },
        damageByNature: details.damageByNature || {},
        criticalDamage: Math.max(0, Number(details.criticalDamage) || 0),
        criticalBonusDamage: Math.max(0, Number(details.criticalBonusDamage) || 0),
        executionDamage: Math.max(0, Number(details.executionDamage) || 0),
        ambidextryDamage: Math.max(0, Number(details.ambidextryDamage) || 0),
        ambidextryHealing: Math.max(0, Number(details.ambidextryHealing) || 0),
        damageByRange: combatRangeTotals(details.damageByRange),
        healingByRange: combatRangeTotals(details.healingByRange),
        lifeStealHealed: Math.max(0, Number(details.lifeStealHealed) || 0),
        damageReceived: Math.max(0, Number(details.damageReceived) || 0),
        armorDamageReceived: Math.max(0, Number(details.armorDamageReceived) || 0),
        healingReceived: Math.max(0, Number(details.healingReceived) || 0),
        movements: Math.max(0, Number(details.movements) || 0),
        marathonMovements: Math.max(0, Number(details.marathonMovements) || 0),
        forcedMovements: Math.max(0, Number(details.forcedMovements) || 0),
        procs: details.procs || {},
    };
}

function editableCombatDetails(entity) {
    settleCombatRole(entity);
    entity.combatDetails = getEntityCombatDetails(entity, { elapsed: false });
    return entity.combatDetails;
}

function apportionCombatDamage(amount, weights, fallback) {
    const total = Math.max(0, Math.round(Number(amount) || 0));
    const clean = Object.fromEntries(combatComponentKeys.map(key =>
        [key, Math.max(0, Number(weights?.[key]) || 0)]));
    if (!Object.values(clean).some(Boolean)) {
        for (const key of combatComponentKeys) clean[key] = fallback[key] || 0;
    }
    const sum = Object.values(clean).reduce((value, part) => value + part, 0) || 1;
    const result = Object.fromEntries(combatComponentKeys.map(key => [key, Math.floor(total * clean[key] / sum)]));
    let remainder = total - Object.values(result).reduce((value, part) => value + part, 0);
    const ranked = [...combatComponentKeys].sort((a, b) =>
        (total * clean[b] / sum - result[b]) - (total * clean[a] / sum - result[a]));
    for (let i = 0; i < remainder; i++) result[ranked[i]]++;
    return result;
}

function combatSourceWeights(sources, hybridPhysicalShare = 0.5) {
    const hybrid = Math.max(0, Number(sources?.hybridalDamage) || 0);
    const share = Math.max(0, Math.min(1, Number(hybridPhysicalShare) || 0));
    return {
        physical: Math.max(0, Number(sources?.physical) || 0) + hybrid * share,
        magical: Math.max(0, Number(sources?.magical) || 0) + hybrid * (1 - share),
        piercing: Math.max(0, Number(sources?.piercingDamage) || 0),
    };
}

const combatNatureFallbacks = {
    physicalDamage: { physical: 1 }, magicalDamage: { magical: 1 },
    transpiercingDamage: { piercing: 1 }, hybridalDamage: { physical: 1, magical: 1 },
    physicalPiercingDamage: { physical: 1, piercing: 1 },
    magicalPiercingDamage: { magical: 1, piercing: 1 },
    hybridalPiercingDamage: { physical: 1, magical: 1, piercing: 1 },
};

export function recordEntityDamageDetails(entity, nature, {
    armorDamage = 0, hpDamage = 0, armorSources = {}, hpSources = {},
    hybridPhysicalShare = 0.5, critical = false, execution = false,
    ambidextry = false, hypercognition = false, criticalBonusDamage = 0, range = 'melee', summonOrigin
} = {}) {
    if (!entity) return false;
    const amount = Math.max(0, Math.round(Number(armorDamage) || 0))
        + Math.max(0, Math.round(Number(hpDamage) || 0));
    if (!amount) return false;
    const details = editableCombatDetails(entity);
    const key = combatNatureKeys.has(nature) ? nature : 'unclassified';
    const storedEntry = details.damageByNature[key] || {};
    const entry = Object.fromEntries(['total', ...combatComponentKeys].map(part =>
        [part, Math.max(0, Number(storedEntry[part]) || 0)]));
    const fallback = combatNatureFallbacks[key] || { physical: 1 };
    const armorParts = apportionCombatDamage(armorDamage, combatSourceWeights(armorSources), fallback);
    const hpParts = apportionCombatDamage(hpDamage, combatSourceWeights(hpSources, hybridPhysicalShare), fallback);
    entry.total += amount;
    if (key !== 'inerte') for (const part of combatComponentKeys) entry[part] += armorParts[part] + hpParts[part];
    details.damageByNature[key] = entry;
    details.damageByRange[combatRangeKey(range)] += amount;
    details.hpDamageDealt += nonnegative(hpDamage);
    details.armorDamageDealt += nonnegative(armorDamage);
    const role = currentCombatRole(entity);
    if (role) details.roles[role].damageDealt += amount;
    if (critical) {
        details.criticalDamage += amount;
        const bonus = Math.min(amount, Math.max(0, Math.round(Number(criticalBonusDamage) || 0)));
        details.criticalBonusDamage += bonus;
        details.procs.critical = (Number(details.procs.critical) || 0) + 1;
    }
    if (execution) {
        details.executionDamage += amount;
        details.procs.execution = (Number(details.procs.execution) || 0) + 1;
    }
    if (ambidextry) details.ambidextryDamage += amount;
    if (hypercognition) details.hypercognitionDamage += amount;
    recordSummonOutcome(entity, { damageDealt: amount }, summonOrigin, key);
    saveEntityCombatTotals(entity);
    return true;
}

export function recordEntityLifeSteal(entity, restoredHP, range = 'melee') {
    const amount = Math.max(0, Number(restoredHP) || 0);
    if (!entity || !amount) return false;
    const details = editableCombatDetails(entity);
    details.lifeStealHealed += amount;
    details.healingReceived += amount;
    details.healingByRange[combatRangeKey(range)] += amount;
    details.procs.lifesteal = (Number(details.procs.lifesteal) || 0) + 1;
    recordSummonOutcome(entity, { healingDone: amount, healingReceived: amount });
    saveEntityCombatTotals(entity);
    return true;
}

export function recordEntityHealingDone(entity, amount, range = 'melee', { ambidextry = false, summonOrigin } = {}) {
    const healed = Math.max(0, Number(amount) || 0);
    if (!entity || !healed) return false;
    const details = editableCombatDetails(entity);
    details.healingByRange[combatRangeKey(range)] += healed;
    if (ambidextry) details.ambidextryHealing += healed;
    recordSummonOutcome(entity, { healingDone: healed }, summonOrigin);
    saveEntityCombatTotals(entity);
    return true;
}

export function recordEntityDamageReceived(entity, hpDamage = 0, armorDamage = 0) {
    const hp = Math.max(0, Number(hpDamage) || 0);
    const armor = Math.max(0, Number(armorDamage) || 0);
    if (!entity || hp + armor <= 0) return false;
    const details = editableCombatDetails(entity);
    details.damageReceived += hp + armor;
    details.hpDamageReceived += hp;
    details.armorDamageReceived += armor;
    const role = currentCombatRole(entity);
    if (role) details.roles[role].damageReceived += hp + armor;
    recordSummonOutcome(entity, { damageReceived: hp + armor });
    saveEntityCombatTotals(entity);
    return true;
}

export function recordEntityHealingReceived(entity, amount) {
    const healed = Math.max(0, Number(amount) || 0);
    if (!entity || !healed) return false;
    const details = editableCombatDetails(entity);
    details.healingReceived += healed;
    recordSummonOutcome(entity, { healingReceived: healed });
    saveEntityCombatTotals(entity);
    window.dispatchEvent(new CustomEvent('entityCombatInteraction', { detail: { entity, kind: 'healing' } }));
    return true;
}

export function recordEntityCombatMovement(entity, { marathon = false, forced = false, negative = false } = {}) {
    if (!entity) return false;
    const details = editableCombatDetails(entity);
    details.movements++;
    manualMovementVersions.set(String(entity.id), forced ? 0 : ++movementVersion);
    if (negative && !forced && !marathon) details.negativeMovements++;
    if (marathon) {
        details.marathonMovements++;
        details.procs.marathon = (Number(details.procs.marathon) || 0) + 1;
    }
    if (forced) {
        details.forcedMovements++;
        details.procs.swap = (Number(details.procs.swap) || 0) + 1;
    }
    saveEntityCombatTotals(entity);
    return true;
}

export function getEntityManualMovementVersion(entity) {
    return manualMovementVersions.get(String(entity?.id)) || 0;
}

export function countCompletedArchetypes(entity) {
    const completed = new Set();
    for (const entry of entity?.Archetype?.achieve || []) {
        const length = getCycleLenFor(entry.key, entity);
        if (length > 0 && Number(entry.step ?? entry.stage) >= length) completed.add(`${entry.key}:${entry.level}`);
    }
    return completed.size;
}

export function recordEntityProgression(entity, { experienceSpent = 0, completedBefore = countCompletedArchetypes(entity) } = {}) {
    if (!entity) return;
    const previousCompleted = Math.max(completedBefore, nonnegative(entity.combatDetails?.lifetime?.archetypesCompleted));
    const details = editableCombatDetails(entity);
    details.lifetime.experienceSpent += nonnegative(experienceSpent);
    details.lifetime.archetypesCompleted = previousCompleted + Math.max(0, countCompletedArchetypes(entity) - completedBefore);
    saveEntityCombatTotals(entity);
}

export function recordEntityDays(entity, previousDay, newDay) {
    if (!entity || !(newDay > previousDay)) return;
    const details = editableCombatDetails(entity);
    const life = details.lifetime;
    const start = Math.max(previousDay, life.lastTrackedDay, Number(entity.acquisition?.gameDay) || previousDay);
    const days = Math.max(0, newDay - start);
    if (!days) return;
    const alive = !entity.isDEAD && !entity.statut?.includes('dead') && Number(entity.stats?.HP?.current) > 0;
    const state = alive ? 'Alive' : 'Dead';
    const streak = alive ? 'aliveStreak' : 'deadStreak';
    life[`days${state}`] += days;
    life[streak] += days;
    life[alive ? 'deadStreak' : 'aliveStreak'] = 0;
    life[`longest${state}Streak`] = Math.max(life[`longest${state}Streak`], life[streak]);
    life.lastTrackedDay = newDay;
    saveEntityCombatTotals(entity);
}

export function recordEntityConsumable(entity, { source = 'inventory', inCombat = false, hostile = false, support = false } = {}) {
    if (!entity) return;
    const details = editableCombatDetails(entity);
    details.consumablesUsed++;
    const key = { ground: 'consumablesGround', pouch: 'consumablesPouch', inventory: 'consumablesInventory' }[source];
    if (key) details[key]++;
    if (inCombat && source === 'ground') details.consumablesCombatGround++;
    if (inCombat && source === 'pouch') details.consumablesCombatPouch++;
    if (hostile) details.consumablesHostile++;
    if (support) details.consumablesSupport++;
    saveEntityCombatTotals(entity);
}

export function recordEntityCombatProc(entity, key) {
    if (!entity || !/^[a-z][A-Za-z0-9]{0,63}$/.test(key)) return false;
    const details = editableCombatDetails(entity);
    details.procs[key] = (Number(details.procs[key]) || 0) + 1;
    saveEntityCombatTotals(entity);
    return true;
}

export function recordEntityCombatAmount(entity, key, value, { persist = true } = {}) {
    const amount = nonnegative(value);
    if (!entity || !combatAmountKeys.includes(key) || !amount) return 0;
    const details = editableCombatDetails(entity);
    details[key] += amount;
    if (persist) saveEntityCombatTotals(entity);
    return amount;
}

export function recordEntityDefenseHp(entity, contributions) {
    if (!entity) return;
    const details = editableCombatDetails(entity);
    for (const [key, value] of Object.entries(contributions)) {
        details.defenseHp[key] = nonnegative(details.defenseHp[key]) + nonnegative(value);
    }
    saveEntityCombatTotals(entity);
}

export function recordEntityLifeUsed(entity, pool) {
    if (!entity || !['extraLife', 'fadedLife', 'eternalLife'].includes(pool)) return;
    const details = editableCombatDetails(entity);
    details.livesUsed[pool] = nonnegative(details.livesUsed[pool]) + 1;
    recordEntityCombatStat(entity, 'extraLivesUsed');
}

export function saveEntityAttackSelection(entity) {
    const config = structuredClone(entity.attackSelection);
    const army = loadFromLocalStorage('selectedArmyA', []);
    const stored = army.find(candidate => String(candidate.id) === String(entity.id));
    if (stored) {
        stored.attackSelection = config;
        saveToLocalStorage('selectedArmyA', army);
    }
    const visible = window.selectedArmyA?.find(candidate => String(candidate.id) === String(entity.id));
    if (visible) visible.attackSelection = structuredClone(config);
    notifyCombatAction();
}

export function saveEntityCombatTotals(entity, now = clockNow()) {
    if (entity?.id == null) return false;
    settleCombatRole(entity, now);
    const totals = {
        kills: Math.max(0, Number(entity.kills) || 0),
        totalDamage: Math.max(0, Number(entity.totalDamage) || 0),
        totalHeal: Math.max(0, Number(entity.totalHeal) || 0),
        deaths: Math.max(0, Number(entity.deaths) || 0),
        resurrections: Math.max(0, Number(entity.resurrections) || 0),
        overkills: Math.max(0, Number(entity.overkills) || 0),
        battlesFought: Math.max(0, Number(entity.battlesFought) || 0),
        extraLivesUsed: Math.max(0, Number(entity.extraLivesUsed) || 0),
        combatDetails: structuredClone(getEntityCombatDetails(entity, { elapsed: false })),
    };
    const pools = [entites];
    if (typeof window !== 'undefined') pools.push(window.entites, window.selectedArmyA, window.selectedArmyB);
    const updatedCopies = new Set([entity]);
    for (const pool of new Set(pools)) {
        if (!Array.isArray(pool)) continue;
        for (const copy of pool) {
            if (!updatedCopies.has(copy) && String(copy?.id) === String(entity.id)) {
                Object.assign(copy, structuredClone(totals));
                updatedCopies.add(copy);
            }
        }
    }
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('entityCombatStatsChanged', { detail: { entity } }));
    }
    const armyA = loadCombatArmyForUpdate('selectedArmyA', []);
    const ally = armyA.find(candidate => String(candidate.id) === String(entity.id));
    if (ally) {
        Object.assign(ally, totals);
        saveCombatArmyUpdate('selectedArmyA', armyA, [ally], Object.keys(totals));
        return true;
    }
    const allArmyB = loadCombatArmyForUpdate('ArmyB');
    for (const army of Object.values(allArmyB?.armies || {})) {
        const enemy = army.entities?.find(candidate => String(candidate.id) === String(entity.id));
        if (!enemy) continue;
        Object.assign(enemy, totals);
        saveCombatArmyUpdate('ArmyB', allArmyB, [enemy], Object.keys(totals));
        return true;
    }
    return false;
}

const recordableCombatStats = new Set([
    'deaths', 'resurrections', 'overkills', 'battlesFought', 'extraLivesUsed'
]);

export function recordEntityCombatStat(entity, key) {
    if (!entity || !recordableCombatStats.has(key)) return false;
    entity[key] = Math.max(0, Number(entity[key]) || 0) + 1;
    if (key === 'deaths') recordSummonOutcome(entity, { deaths: 1 });
    if (key === 'deaths' || key === 'resurrections') {
        const details = editableCombatDetails(entity);
        details.lifetime[key === 'deaths' ? 'aliveStreak' : 'deadStreak'] = 0;
    }
    if (key === 'deaths') endEntityBattleRole(entity, { pause: true });
    if (key === 'resurrections') {
        const session = battleRoleSessions.get(String(entity.id));
        if (session) { session.paused = false; session.since = clockNow(); }
    }
    saveEntityCombatTotals(entity);
    return true;
}

export function saveEntityAttackProgression(entity) {
    const fields = ['attackDetails', 'attacks', 'attackEssenceInventory', 'nativeAttacks', 'attackSelection'];
    const patch = Object.fromEntries(fields.filter(key => entity[key] !== undefined)
      .map(key => [key, structuredClone(entity[key])]));
    // The prepared patch already owns independent copies of every field. Give
    // it to the first destination instead of cloning it a second time there.
    // Further destinations still need their own copy, never the live entity's.
    let availablePatch = patch;
    const update = candidate => {
        if (!candidate || String(candidate.id) !== String(entity.id)) return false;
        if (candidate !== entity) {
            const copy = availablePatch || structuredClone(patch);
            availablePatch = null;
            Object.assign(candidate, copy);
        }
        return true;
    };
    const army = loadCombatArmyForUpdate('selectedArmyA', []);
    const ally = army.find(candidate => candidate && String(candidate.id) === String(entity.id));
    if (ally && update(ally)) saveCombatArmyUpdate('selectedArmyA', army, [ally], fields);
    const armies = loadCombatArmyForUpdate('ArmyB', { armies: {} });
    const changed = [];
    for (const armyB of Object.values(armies?.armies || {})) {
        const enemy = armyB.entities?.find(candidate => candidate && String(candidate.id) === String(entity.id));
        if (enemy && update(enemy)) changed.push(enemy);
    }
    if (changed.length) saveCombatArmyUpdate('ArmyB', armies, changed, fields);
    if (typeof window !== 'undefined') window.selectedArmyA?.forEach(update);
}

if (typeof window !== 'undefined') {
    window.addEventListener('attackMasteryChanged', event => saveEntityAttackProgression(event.detail.entity));
}

export function getCorrectedArmyB(armyBId) {
    const allArmyB = loadFromLocalStorage('ArmyB', { armies: {} });
    let armyBContainer = allArmyB.armies?.[armyBId];

    if (!armyBContainer) {
        console.warn(`⚠️ Aucune armée trouvée pour ${armyBId}.`);
        return { armyB: [], allArmyB };
    }

    // Si on a un objet avec .entities => OK
    if (Array.isArray(armyBContainer.entities)) {
        return { armyB: armyBContainer.entities, allArmyB };
    }

    // Si c’est un tableau brut (erreur historique) => conversion
    if (Array.isArray(armyBContainer)) {
        console.log(`♻️ Correction: ArmyB ${armyBId} est un tableau brut, conversion...`);
        allArmyB.armies[armyBId] = {
            ArmyB_id: armyBId,
            entities: armyBContainer
        };
        saveToLocalStorage('ArmyB', allArmyB);
        return { armyB: armyBContainer, allArmyB };
    }

    console.warn(`⚠️ Structure inconnue pour ${armyBId}, retour d’un tableau vide.`);
    allArmyB.armies[armyBId] = {
        ArmyB_id: armyBId,
        entities: []
    };
    saveToLocalStorage('ArmyB', allArmyB);
    return { armyB: [], allArmyB };
}

export function updateEntityStatusInStorage(entite) {
    const armyBId = window.currentStageId ? `ArmyB_${window.currentStageId}` : null;
    if (!armyBId) {
        console.warn(`⚠️ currentStageId non défini, impossible de trouver ArmyB.`);
        return;
    }

    const { armyB, allArmyB } = getCorrectedArmyB(armyBId);
    const entityInArmyB = armyB.find(e => e.id === entite.id);

    if (entityInArmyB) {
        entityInArmyB.statut = entite.statut;
        allArmyB.armies[armyBId].entities = armyB;
        saveToLocalStorage('ArmyB', allArmyB);
        console.log(`📌 Statut mis à jour pour ${entite.name} (Side B): ${entite.statut}`);
        return;
    }

    // Fallback côté A
    const selectedArmy = loadFromLocalStorage('selectedArmyA', []);
    const entityInSelectedArmy = selectedArmy.find(e => e.id === entite.id);

    if (entityInSelectedArmy) {
        entityInSelectedArmy.statut = entite.statut;
        saveToLocalStorage('selectedArmyA', selectedArmy);
        console.log(`📌 Statut mis à jour pour ${entite.name} (Side A): ${entite.statut}`);
        return;
    }

    console.warn(`⚠️ Entité ${entite.name} non trouvée dans ArmyB ni ArmyA.`);
}

export function applyItemHPChange(target, variation) {
    if (!target || !target.stats.HP) return;
    if (target.stats.HP.current <= 0) return;

    target.stats.HP.current = Math.max(0, Math.min(target.stats.HP.current + variation, target.stats.HP.max));

    itemSaveEntityHPToStorage(target);

   updateHealthBar(target.stats.HP.current, target.stats.HP.max, target.stats.armor?.current || 0, target.stats.armor?.max || 0, target.id);

}

export function itemSaveEntityHPToStorage(entite) {
    let saved = false;

    // Recherche dans toutes les armées B
    const allArmyB = loadFromLocalStorage('ArmyB');
    if (allArmyB?.armies) {
        for (const [armyId, armyData] of Object.entries(allArmyB.armies)) {
            const entityInArmy = armyData.entities?.find(e => e.id === entite.id);
            if (entityInArmy) {
                entityInArmy.stats.HP = { current: entite.stats.HP.current, max: entite.stats.HP.max };
                saveToLocalStorage('ArmyB', allArmyB);
                console.log(`🩸 HP (objet) mis à jour pour ${entite.name} dans ArmyB (${armyId})`);
                saved = true;
                break;
            }
        }
    }

    // Fallback : recherche dans Army A
    if (!saved) {
        const selectedArmyA = loadFromLocalStorage('selectedArmyA', []);
        const entityInArmyA = selectedArmyA.find(e => e.id === entite.id);
        if (entityInArmyA) {
            entityInArmyA.stats.HP = { current: entite.stats.HP.current, max: entite.stats.HP.max };
            saveToLocalStorage('selectedArmyA', selectedArmyA);
            console.log(`🩸 HP (objet) mis à jour pour ${entite.name} dans ArmyA`);
            saved = true;
        }
    }

    // Rien trouvé nulle part
    if (!saved) {
        console.warn(`⚠️ HP non sauvegardés : ${entite.name} non trouvé dans ArmyA ni ArmyB.`);
    }
}

function loadCombatArmyB(armyBId) {
    const allArmyB = loadCombatArmyForUpdate('ArmyB', { armies: {} });
    const armyB = allArmyB?.armies?.[armyBId]?.entities;
    if (Array.isArray(armyB)) return { armyB, allArmyB };
    return getCorrectedArmyB(armyBId);
}

export function saveEntityHPToStorage(entite) {
    const armyBId = window.currentStageId ? `ArmyB_${window.currentStageId}` : null;
    if (!armyBId) {
        console.warn(`⚠️ currentStageId non défini, impossible de trouver ArmyB.`);
        return;
    }

    const { armyB, allArmyB } = loadCombatArmyB(armyBId);
    const entityInArmyB = armyB.find(e => e.id === entite.id);

    if (entityInArmyB) {
        entityInArmyB.stats.HP = { current: entite.stats.HP.current, max: entite.stats.HP.max };
        allArmyB.armies[armyBId].entities = armyB;
        saveCombatArmyUpdate('ArmyB', allArmyB, [entityInArmyB], ['stats']);
        console.log(`🩸 HP mis à jour pour ${entite.name} (Side B) : ${entite.stats.HP.current}/${entite.stats.HP.max}`);
        return;
    }

    // Fallback côté A
    const selectedArmy = loadCombatArmyForUpdate('selectedArmyA', []);
    const entityInSelectedArmy = selectedArmy.find(e => e.id === entite.id);

    if (entityInSelectedArmy) {
        entityInSelectedArmy.stats.HP = { current: entite.stats.HP.current, max: entite.stats.HP.max };
        saveCombatArmyUpdate('selectedArmyA', selectedArmy, [entityInSelectedArmy], ['stats']);
        console.log(`🩸 HP mis à jour pour ${entite.name} (Side A) : ${entite.stats.HP.current}/${entite.stats.HP.max}`);
        return;
    }

    console.warn(`⚠️ Entité ${entite.name} non trouvée dans ArmyB ni ArmyA.`);
}

function setLifePoolOnEntity(entityObj, entite, key) {
  if (!entityObj.stats) entityObj.stats = {};
  copyResourceStock(entityObj, entite, key);
  // ✅ fadedLife = nombre (pas d'objet, pas de max)
  if (key === "fadedLife") {
    copyResourceStock(entityObj, entite, key);
    const v = Math.max(0, Number(entite?.stats?.fadedLife ?? 0) || 0);

    if (v > 0) entityObj.stats.fadedLife = v;
    else delete entityObj.stats.fadedLife;

    return;
  }

  // ✅ extraLife = {current,max} avec sécurité current<=max, et suppression si max=0
  const src = entite?.stats?.[key];
  const max = Math.max(0, Number(src?.max ?? 0) || 0);
  const cur = Math.max(0, Math.min(Number(src?.current ?? 0) || 0, max));

  if (max <= 0) {
    delete entityObj.stats[key];
  } else {
    entityObj.stats[key] = { current: cur, max };
  }
}

export function saveEntityLifePoolToStorage(entite, key) {
  persistEquippedResourceStocks(entite);
  const armyBId = window.currentStageId ? `ArmyB_${window.currentStageId}` : null;

  // 1) Tentative Side B si possible
  if (armyBId) {
    const { armyB, allArmyB } = getCorrectedArmyB(armyBId);
    const entityInArmyB = armyB.find(e => e.id === entite.id);

    if (entityInArmyB) {
      setLifePoolOnEntity(entityInArmyB, entite, key);
      allArmyB.armies[armyBId].entities = armyB;
      saveToLocalStorage('ArmyB', allArmyB);
      return;
    }
  } else {
    console.warn(`⚠️ currentStageId non défini, skip Side B pour ${key}.`);
  }

  // 2) Fallback Side A
  const selectedArmy = loadFromLocalStorage('selectedArmyA', []);
  const entityInSelectedArmy = selectedArmy.find(e => e.id === entite.id);

  if (entityInSelectedArmy) {
    setLifePoolOnEntity(entityInSelectedArmy, entite, key);
    saveToLocalStorage('selectedArmyA', selectedArmy);
    return;
  }

  console.warn(`⚠️ Entité ${entite.name} non trouvée dans ArmyB ni ArmyA (${key}).`);
}
export function saveEntityExtraLifeRegenToStorage(entite) {
  if (!entite?.id) return false;

  let changed = false;

  // --- Army A ---
  const selectedArmyA = loadFromLocalStorage("selectedArmyA", []);
  if (Array.isArray(selectedArmyA)) {
    const idx = selectedArmyA.findIndex(e => e?.id === entite.id);
    if (idx !== -1) {
      selectedArmyA[idx].extraLifeRegen = entite.extraLifeRegen;
      saveToLocalStorage("selectedArmyA", selectedArmyA);
      changed = true;
    }
  }

  // --- Army B (stockées dans ArmyB.armies.*.entities) ---
  const armyBData = loadFromLocalStorage("ArmyB", { armies: {} });
  if (armyBData?.armies && typeof armyBData.armies === "object") {
    let touchedB = false;

    for (const armyKey of Object.keys(armyBData.armies)) {
      const entities = armyBData.armies[armyKey]?.entities;
      if (!Array.isArray(entities)) continue;

      const idx = entities.findIndex(e => e?.id === entite.id);
      if (idx !== -1) {
        entities[idx].extraLifeRegen = entite.extraLifeRegen;
        touchedB = true;
      }
    }

    if (touchedB) {
      saveToLocalStorage("ArmyB", armyBData);
      changed = true;
    }
  }

  if (changed) saveCurrentGameData();
  return changed;
}
export function saveEntityextraLifeToStorage(entite) {
  return saveEntityLifePoolToStorage(entite, 'extraLife');
}
export function saveEntityfadedLifeToStorage(entite) {
  return saveEntityLifePoolToStorage(entite, 'fadedLife');
}
export function saveEntityEternalLifeToStorage(entite) {
  return saveEntityLifePoolToStorage(entite, 'eternalLife');
}
export function saveEntityEternalLifeRegenToStorage(entite) {
  if (!entite?.id) return false;

  let changed = false;

  // --- Army A ---
  const selectedArmyA = loadFromLocalStorage("selectedArmyA", []);
  if (Array.isArray(selectedArmyA)) {
    const idx = selectedArmyA.findIndex(e => e?.id === entite.id);
    if (idx !== -1) {
      selectedArmyA[idx].eternalLifeRegen = entite.eternalLifeRegen;
      saveToLocalStorage("selectedArmyA", selectedArmyA);
      changed = true;
    }
  }

  // --- Army B ---
  const armyBData = loadFromLocalStorage("ArmyB", { armies: {} });
  if (armyBData?.armies && typeof armyBData.armies === "object") {
    let touchedB = false;

    for (const armyKey of Object.keys(armyBData.armies)) {
      const entities = armyBData.armies[armyKey]?.entities;
      if (!Array.isArray(entities)) continue;

      const idx = entities.findIndex(e => e?.id === entite.id);
      if (idx !== -1) {
        entities[idx].eternalLifeRegen = entite.eternalLifeRegen;
        touchedB = true;
      }
    }

    if (touchedB) {
      saveToLocalStorage("ArmyB", armyBData);
      changed = true;
    }
  }

  if (changed) saveCurrentGameData();
  return changed;
}

export function saveEntireEntityToStorage(entite) {
    let saved = false;
    // Live auras and combat callbacks belong to the renderer, not to the saved entity.
    const ancestors = [];
    const snapshot = JSON.parse(JSON.stringify(entite, function (key, value) {
        if (typeof value === 'function' || typeof value === 'symbol'
            || typeof Node !== 'undefined' && value instanceof Node
            || typeof Window !== 'undefined' && value instanceof Window) return undefined;
        if (value && typeof value === 'object') {
            while (ancestors.length && ancestors[ancestors.length - 1] !== this) ancestors.pop();
            if (ancestors.includes(value)) return undefined;
            ancestors.push(value);
        }
        return value;
    }));

    // 1. Sauvegarde côté ArmyB
    const allArmyB = loadFromLocalStorage('ArmyB');
    if (allArmyB?.armies) {
        for (const [armyId, armyData] of Object.entries(allArmyB.armies)) {
            const entityInArmy = armyData.entities?.find(e => e.id === entite.id);
            if (entityInArmy) {
                allArmyB.armies[armyId].entities = armyData.entities.map(e =>
                    e.id === entite.id ? snapshot : e
                );
                saveToLocalStorage('ArmyB', allArmyB);
                console.log(`💾 Entité ${entite.name} mise à jour entièrement dans ArmyB (${armyId})`);
                saved = true;
                break;
            }
        }
    }

    // 2. Fallback côté ArmyA
    if (!saved) {
        const selectedArmyA = loadFromLocalStorage('selectedArmyA', []);
        const index = selectedArmyA.findIndex(e => e.id === entite.id);
        if (index !== -1) {
            selectedArmyA[index] = snapshot;
            saveToLocalStorage('selectedArmyA', selectedArmyA);
            console.log(`💾 Entité ${entite.name} mise à jour entièrement dans ArmyA`);
            saved = true;
        }
    }

    if (!saved) {
        console.warn(`⚠️ Entité ${entite.name} non trouvée dans ArmyA ni ArmyB.`);
    }
}

export function EquipedEntityItems(entiteId, equippedItemId) {
    const armyA = loadFromLocalStorage('selectedArmyA', []);
    const index = armyA.findIndex(e => e.id === entiteId);

    if (index === -1) {
        console.warn(`❌ Entité avec ID ${entiteId} introuvable dans ArmyA`);
        return;
    }

    const targetEntity = armyA[index];

    if (!targetEntity.stuff) {
        targetEntity.stuff = {};
    }

    // Initialisation correcte des slots si absent
    const charge = Math.max(0, Math.round(Number(getSafe(targetEntity, "charge", 0)) || 0));
    for (let i = 1; i <= charge; i++) {
        const key = `slot${i}`;
        if (!targetEntity.stuff[key]) {
            targetEntity.stuff[key] = [];
        }
    }

    // Vérifie que l'item n'est pas déjà équipé dans n'importe quel slot
    const allItemsEquipped = Object.values(targetEntity.stuff).flat();
    if (allItemsEquipped.includes(equippedItemId)) {
        console.warn(`⛔ L’objet ${equippedItemId} est déjà présent dans le stuff de ${targetEntity.name}`);
        return;
    }

    // Trouve le premier slot avec de la place (ex : vide ou selon une limite définie)
    let selectedSlot = null;
    for (let i = 1; i <= charge; i++) {
        const key = `slot${i}`;
        if (targetEntity.stuff[key].length === 0) {
            selectedSlot = key;
            break;
        }
    }

    if (!selectedSlot) {
        console.warn("⛔ Aucun slot libre pour ajouter l'objet");
        return;
    }

    // Ajout de l’objet dans le slot sélectionné
    targetEntity.stuff[selectedSlot].push(equippedItemId);

    // Mise à jour et sauvegarde
    armyA[index] = targetEntity;
    saveToLocalStorage('selectedArmyA', armyA);

    console.log(`🧷 Objet ${equippedItemId} ajouté au ${selectedSlot} de ${targetEntity.name} (ID ${targetEntity.id})`);
}

export function saveEntityArmorState(entite) {
  if (!entite?.id || !entite?.stats?.armor) {
    return;
  }

  const armorStats = entite.stats.armor || {};
  const armorSave = {
    ...armorStats,
    current: Math.max(
      0,
      Math.round(
        Number(armorStats.current) || 0
      )
    ),

    max: Math.max(
      0,
      Math.round(
        Number(armorStats.max) || 0
      )
    ),
  };

  entite.stats.armor = {
    ...armorSave
  };

  syncEntityAuras(entite, "battle");
  persistEquippedArmorReserves(entite);
  const armorLayersSave = cloneArmorLayers(entite);

  const armyBId = window.currentStageId
    ? `ArmyB_${window.currentStageId}`
    : null;

  // 1. Tentative Side B
  if (armyBId) {
    const { armyB, allArmyB } =
      getCorrectedArmyB(armyBId);

    const entityInArmyB = armyB.find(
      entity =>
        Number(entity.id) === Number(entite.id)
    );

    if (entityInArmyB) {
      entityInArmyB.stats =
        entityInArmyB.stats || {};

      entityInArmyB.stats.armor = {
        ...armorSave
      };
      if (armorLayersSave) entityInArmyB.armorLayers = armorLayersSave;
      else delete entityInArmyB.armorLayers;

      allArmyB.armies[armyBId].entities = armyB;

      saveToLocalStorage(
        "ArmyB",
        allArmyB
      );

      console.log(
        `🛡️ Armor sauvegardée pour ${entite.name} Side B : ` +
        `${armorSave.current}/${armorSave.max}`
      );

      return;
    }
  }

  // 2. Fallback Side A
  const selectedArmyA = loadFromLocalStorage(
    "selectedArmyA",
    []
  );

  const entityInArmyA = selectedArmyA.find(
    entity =>
      Number(entity.id) === Number(entite.id)
  );

  if (entityInArmyA) {
    entityInArmyA.stats =
      entityInArmyA.stats || {};

    entityInArmyA.stats.armor = {
      ...armorSave
    };
    if (armorLayersSave) entityInArmyA.armorLayers = armorLayersSave;
    else delete entityInArmyA.armorLayers;

    saveToLocalStorage(
      "selectedArmyA",
      selectedArmyA
    );

    console.log(
      `🛡️ Armor sauvegardée pour ${entite.name} Side A : ` +
      `${armorSave.current}/${armorSave.max}`
    );

    return;
  }

  console.warn(
    `⚠️ Armor non sauvegardée : ${entite.name} ` +
    `non trouvé dans ArmyA ni ArmyB.`
  );
}

export function resetStoredArmorCurrentToMax() {
  const aliveAtDayStart = entite => Number(entite?.stats?.HP?.current) > 0
    && entite?.isDEAD !== true
    && ![entite?.statut].flat().includes('dead');
  const selectedArmyA = loadFromLocalStorage("selectedArmyA", []);

  selectedArmyA.forEach(entite => {
    if (!entite?.stats?.armor || !aliveAtDayStart(entite)) return;
    resetEntityRegenerableArmor(entite);
  });

  saveToLocalStorage("selectedArmyA", selectedArmyA);

  const armyBData = loadFromLocalStorage("ArmyB", { armies: {} });

  Object.values(armyBData.armies || {}).forEach(armyContainer => {
    const entities = armyContainer?.entities;
    if (!Array.isArray(entities)) return;

    entities.forEach(entite => {
      if (!entite?.stats?.armor || !aliveAtDayStart(entite)) return;
      resetEntityRegenerableArmor(entite);
    });
  });

  saveToLocalStorage("ArmyB", armyBData);

  console.log("Armure restauree au debut du jour pour les entites vivantes.");
}
export function applyHpBattleRegenAtTurnStart(entite) {
  if (!entite?.stats?.HP) return 0;
  const currentHP = Math.max(0, Number(entite.stats.HP.current) || 0);
  const maxHP = Math.max(0, Number(entite.stats.HP.max) || 0);
  if (maxHP <= 0 || currentHP <= 0 || currentHP >= maxHP) return 0;
  const regenAmount = Math.max(0, Number(calculateHpBattleRegenAmount(entite)) || 0);
  if (regenAmount <= 0) return 0;
  const newHP = Math.min(maxHP, currentHP + regenAmount);
  const hpRestored = Math.max(0, newHP - currentHP);
  if (hpRestored <= 0) return 0;
  entite.stats.HP.current = newHP;
  saveEntityHPToStorage(entite, newHP);
  recordEntityHealingReceived(entite, hpRestored);
  recordEntityCombatAmount(entite, 'battleHpRegenerated', hpRestored);
  updateHealthBar(newHP, maxHP, entite.stats?.armor?.current || 0, entite.stats?.armor?.max || 0, entite.id);
  showHealingFeedback(entite, hpRestored);
  battleLogs("entity_battle_regen", { entity: entite, hpRestored });
  attemptBattleRegen(entite, hpRestored);

  return hpRestored;
}
export function saveEntityMovementState(entite) {
  if (!entite?.id || !entite?.stats?.shift) return;
  persistEquippedResourceStocks(entite);

  const shiftSave = {
    current: Math.round(Number(entite.stats.shift.current) || 0),
    max: Math.max(0, Math.round(Number(entite.stats.shift.max) || 0)),
    ...(entite.stats.shift.baseDefault ? { baseDefault: true } : {}),
  };

  const selectedArmyA = loadFromLocalStorage("selectedArmyA", []);
  const indexA = selectedArmyA.findIndex(e => Number(e.id) === Number(entite.id));

  if (indexA !== -1) {
    selectedArmyA[indexA].stats = selectedArmyA[indexA].stats || {};
    selectedArmyA[indexA].stats.shift = shiftSave;
    copyResourceStock(selectedArmyA[indexA], entite, 'shift');
    saveToLocalStorage("selectedArmyA", selectedArmyA);
    return;
  }

  const armyBData = loadFromLocalStorage('ArmyB', { armies: {} });
  let changed = false;
  for (const army of Object.values(armyBData.armies || {})) {
    const stored = army.entities?.find(entity => String(entity.id) === String(entite.id));
    if (!stored) continue;
    stored.stats ??= {};
    stored.stats.shift = { ...shiftSave };
    copyResourceStock(stored, entite, 'shift');
    changed = true;
  }
  if (changed) saveToLocalStorage('ArmyB', armyBData);
}
export function resetStoredShiftCurrentToStartingCharges() {
  const equipped = loadEquippedItems();
  const resetShift = entite => {
    if (!entite?.stats?.shift) return;
    syncEntityResourceStocks(entite, equipped);
    resetDailyMovement(entite, calculateShiftDailyStartingCharges(entite));
  };

  const selectedArmyA = loadFromLocalStorage("selectedArmyA", []);

  if (Array.isArray(selectedArmyA)) {
    selectedArmyA.forEach(resetShift);
    saveToLocalStorage("selectedArmyA", selectedArmyA);
  }

  const armyBData = loadFromLocalStorage("ArmyB", { armies: {} });

  Object.values(armyBData.armies || {}).forEach(armyContainer => {
    const entities = armyContainer?.entities;
    if (!Array.isArray(entities)) return;

    entities.forEach(resetShift);
  });

  saveToLocalStorage("ArmyB", armyBData);
  const liveCopies = new Set([entites, window.selectedArmyA, window.selectedArmyB]
    .flatMap(list => Array.isArray(list) ? list : []));
  for (const entity of liveCopies) {
    resetShift(entity);
    updateMovementDisplay(entity);
  }
}
export function saveEntityPositionState(entite) {
  if (!entite?.id) return;

  const positionSave = entite.position || "";

  // Army A
  const selectedArmyA = loadFromLocalStorage("selectedArmyA", []);
  const indexA = selectedArmyA.findIndex(e => Number(e.id) === Number(entite.id));

  if (indexA !== -1) {
    selectedArmyA[indexA].position = positionSave;
    selectedArmyA[indexA].sizeInCells = entite._gigantismBaseSize ?? entite.sizeInCells ?? 1;
    saveToLocalStorage("selectedArmyA", selectedArmyA);
    console.log(`📍 Position sauvegardée Side A : ${entite.name} -> ${positionSave}`);
    return;
  }

  // Army B
  const armyBData = loadFromLocalStorage("ArmyB", { armies: {} });

  for (const [armyBId, armyContainer] of Object.entries(armyBData.armies || {})) {
    const entities = armyContainer?.entities;
    if (!Array.isArray(entities)) continue;

    const indexB = entities.findIndex(e => Number(e.id) === Number(entite.id));

    if (indexB !== -1) {
      entities[indexB].position = positionSave;
      entities[indexB].sizeInCells = entite._gigantismBaseSize ?? entite.sizeInCells ?? 1;
      armyBData.armies[armyBId].entities = entities;
      saveToLocalStorage("ArmyB", armyBData);

      console.log(`📍 Position sauvegardée Side B : ${entite.name} -> ${positionSave}`);
      return;
    }
  }

  console.warn(`⚠️ Position non sauvegardée : ${entite.name} introuvable ArmyA/ArmyB.`);
}

export function saveAllEntityPositionsState(entityList = []) {
  if (!Array.isArray(entityList)) return;

  entityList.forEach(entite => {
    saveEntityPositionState(entite);
  });
}

registerCombatState('roles', () => [...battleRoleSessions.values()].map(({ entity, visited, ...state }) => ({
    ...state, entity: entity.id, visited: [...visited],
})), (saved, { entities }) => {
    battleRoleSessions.clear();
    for (const entry of saved) {
        const entity = entities.find(e => e.id === entry.entity);
        if (entity) battleRoleSessions.set(String(entity.id), { ...entry, entity, visited: new Set(entry.visited) });
    }
});

registerCombatState('movement', () => ({ sequence: movementVersion, versions: [...manualMovementVersions] }), saved => {
    movementVersion = saved.sequence; manualMovementVersions.clear();
    for (const [key, value] of saved.versions) manualMovementVersions.set(key, value);
});
