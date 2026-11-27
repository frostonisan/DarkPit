import { ESSENCE_LEDGER_SCHEMA_VERSION, ESSENCE_COLORS, ESSENCE_HISTORY_LIMIT, ESSENCE_PROVENANCE_VERSION, ESSENCE_OBJECT_TYPES } from "../data/attackList.js";
export { ESSENCE_OBJECT_TYPES } from "../data/attackList.js";
import { getCycleForKey, getStatKeyForArchetypeStep, getSafe } from "../entities/rules.js";
import { balanceData } from "../data/balanceData.js";
import { getStatSystemResult } from "../entities/statSystem.js";
import { getAttackNatureRules } from "../combat/attackResolution.js";

export function calculateHypercognitionEssenceCount(value, limit) {
  return globalThis.umbraProgression.hypercognitionEssenceDetails(value, limit).value;
}

export function calculateCognitiveEssenceCount(entity = {}) {
  const system = getStatSystemResult(entity, 'cognitiveGenerator');
  if (system) return system.value;
  const umbraCount = calculateHypercognitionEssenceCount(getSafe(entity, 'hypercognition', 0), globalThis.umbraProgression.getUmbraThreshold(entity));
  const autonomousCount = Math.floor(Math.max(0, Number(getSafe(entity, 'cognitiveGenerator', 0)) || 0));
  return Math.min(balanceData.hypercognition.essences.maxCount, umbraCount + autonomousCount);
}

export function syncHypercognitionEssences(entity = {}) {
  const inventory = entity.attackEssenceInventory;
  if (!inventory) return;
  // Preview stats must never mint or revoke owned objects.
  const committed = { ...entity, modifierStats: { ...entity.modifierStats, preview: undefined } };
  const value = getSafe(committed, 'hypercognition', 0);
  const count = calculateCognitiveEssenceCount(committed);
  const umbraCount = calculateHypercognitionEssenceCount(value, globalThis.umbraProgression.getUmbraThreshold(committed));
  const seen = new Set();
  const removed = new Set();
  const changedAttacks = [];
  inventory.linkedItems = inventory.linkedItems.filter(item => {
    if (!item.hyperco) return true;
    const rank = item.hypercoRank;
    if (!Number.isInteger(rank) || rank < 1 || rank > count || seen.has(rank)) {
      removed.add(item.id);
      return false;
    }
    seen.add(rank);
    return true;
  });
  for (const attack of entity.attackDetails || []) {
    let changed = false;
    for (const slot of attack.essenceSlots || []) {
      if (!removed.has(slot.essenceId)) continue;
      changed = true;
      Object.assign(slot, {
        essenceId: '', color: null, essenceSource: '', linkedColor: '', hyperco: false, active: false,
      });
    }
    if (changed) {
      const nature = getAttackNatureRules(attack);
      attack.essences = (attack.essenceSlots || []).filter(slot => slot.active !== false && slot.color).map(slot => slot.color);
      attack.essenceProfile = nature.profile;
      attack.attacknature = nature.natures;
      changedAttacks.push(attack);
    }
  }
  for (let rank = 1; rank <= count; rank += 1) {
    if (seen.has(rank)) continue;
    const fromUmbra = rank <= umbraCount;
    inventory.linkedItems.push(createLinkedEssenceItem(entity.id, 'blue', {
      hyperco: true, hypercoRank: rank, origin: 'hypercognition',
      provenanceSource: fromUmbra ? 'hypercognition' : 'cognitiveGenerator',
      ...(fromUmbra ? { umbraStatKey: 'hypercognition', umbraLevel: value } : {}),
    }));
  }
  if (typeof window !== 'undefined' && changedAttacks.length) queueMicrotask(() => {
    for (const attack of changedAttacks) window.dispatchEvent(new CustomEvent('attackEssenceSocketUpdated', {
      detail: { source: 'hypercognition', entityId: entity.id, entite: entity, attack },
    }));
  });
}








function clonePlainValue(value, fallback = null) {
  if (value === undefined || value === null) return fallback;
  try {
    if (typeof structuredClone === "function") return structuredClone(value);
  } catch {}

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function normalizeText(value = "") {
  return String(value ?? "").trim();
}

function normalizeProvenanceSource(value = "", { type = "", origin = "", sourceUniversalId = "" } = {}) {
  const explicitSource = normalizeText(value);
  if (explicitSource) return explicitSource;

  const normalizedOrigin = normalizeText(origin).toLowerCase();
  if (sourceUniversalId) return "universal-binding";
  if (normalizedOrigin === "shop-purchase" || normalizedOrigin === "purchase") return "universal-shop";
  if (normalizedOrigin === "umbra-level-three") return "umbra-level-three";
  if (normalizedOrigin === "initial-attack-family") return "attack-base";
  if (normalizedOrigin === "attack-creation") return "attack-configuration";
  if (normalizedOrigin.includes("archetype")) return "archetype";
  if (type === ESSENCE_OBJECT_TYPES.UNIVERSAL) return "universal-grant";
  return "linked-grant";
}

function buildEssenceProvenanceLine(provenance = {}) {
  const context = provenance.context && typeof provenance.context === "object"
    ? provenance.context
    : {};
  const parts = [
    `source=${normalizeText(provenance.source) || "unknown"}`,
    `origin=${normalizeText(provenance.origin) || "unknown"}`,
  ];

  if (provenance.parentUniversalId) parts.push(`universelle=${provenance.parentUniversalId}`);
  if (provenance.conversion) parts.push(`conversion=${provenance.conversion}`);
  if (provenance.umbraStatKey) parts.push(`umbra=${provenance.umbraStatKey}`);
  if (provenance.rewardId) parts.push(`jalon=${provenance.rewardId}`);
  if (context.attribute) parts.push(`attribut=${context.attribute}`);
  if (provenance.sourceContext?.shop) parts.push(`source-boutique=${provenance.sourceContext.shop}`);
  if (context.entityId !== undefined && context.entityId !== null && context.entityId !== "") {
    parts.push(`entite=${context.entityId}`);
  }
  if (context.attackKey) parts.push(`attaque=${context.attackKey}`);
  if (context.socketId) parts.push(`chasse=${context.socketId}`);
  if (context.slotId) parts.push(`slot=${context.slotId}`);
  if (Array.isArray(provenance.attackBase?.natures) && provenance.attackBase.natures.length) {
    parts.push(`natures-base=${provenance.attackBase.natures.join(",")}`);
  }
  if (Array.isArray(provenance.attackBase?.essenceColors) && provenance.attackBase.essenceColors.length) {
    parts.push(`essences-base=${provenance.attackBase.essenceColors.join(",")}`);
  }

  return parts.join(" | ");
}

function normalizeEssenceProvenance(existing = null, options = {}) {
  const persisted = existing && typeof existing === "object"
    ? clonePlainValue(existing, {})
    : {};
  const context = persisted.context && typeof persisted.context === "object"
    ? persisted.context
    : options.context && typeof options.context === "object"
      ? clonePlainValue(options.context, {})
      : {};
  const attackBase = persisted.attackBase && typeof persisted.attackBase === "object"
    ? persisted.attackBase
    : options.attackBase && typeof options.attackBase === "object"
      ? clonePlainValue(options.attackBase, {})
      : null;
  const sourceContext = persisted.sourceContext && typeof persisted.sourceContext === "object"
    ? persisted.sourceContext
    : options.sourceContext && typeof options.sourceContext === "object"
      ? clonePlainValue(options.sourceContext, {})
      : null;
  const source = normalizeProvenanceSource(persisted.source || options.source, {
    type: options.type,
    origin: persisted.origin || options.origin,
    sourceUniversalId: persisted.parentUniversalId || options.parentUniversalId || options.sourceUniversalId,
  });
  const persistedCreatedAt = Number(persisted.createdAt);
  const optionCreatedAt = Number(options.createdAt);
  const createdAt = Number.isFinite(persistedCreatedAt)
    ? persistedCreatedAt
    : Number.isFinite(optionCreatedAt)
      ? optionCreatedAt
      : Date.now();
  const provenance = {
    version: Number(persisted.version) || ESSENCE_PROVENANCE_VERSION,
    source,
    origin: normalizeText(persisted.origin || options.origin) || "unknown",
    ...(persisted.rewardId || options.rewardId ? { rewardId: persisted.rewardId || options.rewardId } : {}),
    ...(persisted.parentUniversalId || options.parentUniversalId || options.sourceUniversalId
      ? { parentUniversalId: normalizeText(persisted.parentUniversalId || options.parentUniversalId || options.sourceUniversalId) }
      : {}),
    ...(persisted.umbraStatKey || options.umbraStatKey
      ? { umbraStatKey: normalizeText(persisted.umbraStatKey || options.umbraStatKey) }
      : {}),
    ...(persisted.umbraLevel || options.umbraLevel
      ? { umbraLevel: Number(persisted.umbraLevel || options.umbraLevel) || 3 }
      : {}),
    ...(attackBase ? { attackBase } : {}),
    ...(sourceContext ? { sourceContext } : {}),
    ...(Object.keys(context).length ? { context } : {}),
    createdAt,
  };

  return {
    ...provenance,
    ...(persisted.conversion || options.conversion
      ? { conversion: normalizeText(persisted.conversion || options.conversion) }
      : {}),
    line: options.refreshLine === true
      ? buildEssenceProvenanceLine({
          ...provenance,
          conversion: normalizeText(persisted.conversion || options.conversion),
        })
      : normalizeText(persisted.line) || buildEssenceProvenanceLine(provenance),
  };
}

function normalizeColor(value = "") {
  const color = String(value || "").trim().toLowerCase();
  return ESSENCE_COLORS.includes(color) ? color : "";
}

export function sanitizeEssenceOwnerId(value) {
  return String(value ?? "entity")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_") || "entity";
}

function createEssenceUid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "");
  }

  const timePart = Date.now().toString(36);
  const randomPart = Math.random().toString(36).slice(2, 12);
  return `${timePart}${randomPart}`;
}

export function readEssenceUid(id = "") {
  const value = String(id || "").trim();
  if (!value) return "";
  if (value.startsWith("uess-")) return value.slice(5);

  const linkedMarker = value.indexOf("-ess-");
  if (linkedMarker >= 0) return value.slice(linkedMarker + 5);

  const socketMarker = value.indexOf("-socket-");
  if (socketMarker >= 0) return value.slice(socketMarker + 8);

  return "";
}

export function createUniversalEssenceId(options = {}) {
  const requestedUid = String(options.uid || readEssenceUid(options.sourceId) || "").trim();
  return `uess-${requestedUid || createEssenceUid()}`;
}

export function createLinkedEssenceId(entityId, options = {}) {
  const ownerId = sanitizeEssenceOwnerId(entityId);
  const requestedUid = String(options.uid || readEssenceUid(options.sourceId) || "").trim();
  return `${ownerId}-ess-${requestedUid || createEssenceUid()}`;
}

export function createAttackEssenceSocketId(entityId, options = {}) {
  const ownerId = sanitizeEssenceOwnerId(entityId);
  const requestedUid = String(options.uid || readEssenceUid(options.sourceId) || "").trim();
  return `${ownerId}-socket-${requestedUid || createEssenceUid()}`;
}

export function isUniversalEssenceId(id = "") {
  return /^uess-[a-zA-Z0-9_-]+$/.test(String(id || "").trim());
}

export function isLinkedEssenceIdForEntity(id = "", entityId) {
  const prefix = `${sanitizeEssenceOwnerId(entityId)}-ess-`;
  const value = String(id || "").trim();
  return value.startsWith(prefix) && value.length > prefix.length;
}

export function isAttackEssenceSocketIdForEntity(id = "", entityId) {
  const prefix = `${sanitizeEssenceOwnerId(entityId)}-socket-`;
  const value = String(id || "").trim();
  return value.startsWith(prefix) && value.length > prefix.length;
}

export function ensureEssenceObjectIdentity(object = {}, options = {}) {
  if (!object || typeof object !== "object") return object;

  const type = String(options.type || object.type || "").trim().toLowerCase();
  const entityId = options.entityId ?? object.ownerEntityId ?? object.boundTo;

  if (type === ESSENCE_OBJECT_TYPES.UNIVERSAL) {
    const currentId = String(object.id || "").trim();
    object.id = options.forceNew !== true && isUniversalEssenceId(currentId)
      ? currentId
      : createUniversalEssenceId({ sourceId: currentId || options.sourceId, uid: options.uid });
    object.type = ESSENCE_OBJECT_TYPES.UNIVERSAL;
    return object;
  }

  if (type === ESSENCE_OBJECT_TYPES.LINKED) {
    const currentId = String(object.id || "").trim();
    object.id = options.forceNew !== true && isLinkedEssenceIdForEntity(currentId, entityId)
      ? currentId
      : createLinkedEssenceId(entityId, {
          sourceId: options.sourceId || object.sourceUniversalId || currentId,
          uid: options.uid,
        });
    object.type = ESSENCE_OBJECT_TYPES.LINKED;
    object.ownerEntityId = entityId ?? null;
    object.boundTo = entityId ?? null;
    return object;
  }

  if (type === ESSENCE_OBJECT_TYPES.SOCKET) {
    const currentId = String(object.socketId || "").trim();
    object.socketId = options.forceNew !== true && isAttackEssenceSocketIdForEntity(currentId, entityId)
      ? currentId
      : createAttackEssenceSocketId(entityId, {
          sourceId: currentId || options.sourceId,
          uid: options.uid,
        });
  }

  return object;
}

export function createUniversalEssenceItem(color, options = {}) {
  const normalizedColor = normalizeColor(color);
  if (!normalizedColor) return null;

  const item = {
    id: options.id,
    color: normalizedColor,
    type: "universal",
    state: "available",
    origin: options.origin || "shop-purchase",
    createdAt: Number.isFinite(Number(options.createdAt))
      ? Number(options.createdAt)
      : Date.now(),
  };
  ensureEssenceObjectIdentity(item, {
    type: ESSENCE_OBJECT_TYPES.UNIVERSAL,
    sourceId: options.id,
    uid: options.uid,
  });
  item.provenance = normalizeEssenceProvenance(options.provenance, {
    type: ESSENCE_OBJECT_TYPES.UNIVERSAL,
    origin: item.origin,
    source: options.provenanceSource,
    context: options.provenanceContext,
    createdAt: item.createdAt,
  });
  item.provenanceLine = item.provenance.line;
  return item;
}

export function createLinkedEssenceItem(entityId, color, options = {}) {
  const normalizedColor = normalizeColor(color);
  if (!normalizedColor) return null;

  const state = options.state === "socketed" ? "socketed" : "available";
  const item = {
    id: options.id,
    color: normalizedColor,
    type: "linked",
    ownerEntityId: entityId ?? null,
    boundTo: entityId ?? null,
    source: "linked",
    ...(options.hyperco ? { hyperco: true, hypercoRank: options.hypercoRank } : {}),
    ...(options.nativeOrder ? { nativeOrder: options.nativeOrder, nativeAttackId: options.nativeAttackId } : {}),
    state,
    attackKey: state === "socketed" ? String(options.attackKey || "") : "",
    slotIndex: state === "socketed" && Number.isInteger(options.slotIndex)
      ? options.slotIndex
      : null,
    origin: options.origin || "linked",
    originKey: String(options.originKey || ""),
    sourceUniversalId: isUniversalEssenceId(options.sourceUniversalId)
      ? String(options.sourceUniversalId)
      : "",
    createdAt: Number.isFinite(Number(options.createdAt))
      ? Number(options.createdAt)
      : Date.now(),
  };
  ensureEssenceObjectIdentity(item, {
    type: ESSENCE_OBJECT_TYPES.LINKED,
    entityId,
    sourceId: options.sourceUniversalId || options.id,
    uid: options.uid,
  });
  item.provenance = normalizeEssenceProvenance(options.provenance, {
    type: ESSENCE_OBJECT_TYPES.LINKED,
    origin: item.origin,
    source: options.provenanceSource,
    sourceUniversalId: item.sourceUniversalId,
    parentUniversalId: options.parentUniversalId,
    umbraStatKey: options.umbraStatKey,
    umbraLevel: options.umbraLevel,
    rewardId: options.rewardId,
    attackBase: options.attackBase,
    context: options.provenanceContext,
    sourceContext: options.sourceProvenanceContext,
    conversion: options.provenanceConversion,
    refreshLine: options.refreshProvenanceLine,
    createdAt: item.createdAt,
  });
  item.provenanceLine = item.provenance.line;
  return item;
}

export function initializeEntityEssenceOwnership(entity = {}) {
  const owner = entity.attackEssenceInventory?.ownerEntityId;
  if (owner === undefined || String(owner) === String(entity.id)) return;
  delete entity.nativeAttacks;
  // A freshly generated entity may be cloned from an already enriched template.
  entity.attackDetails = (entity.attackDetails || []).map(template => {
    const attack = structuredClone(template);
    attack.essenceSlots = structuredClone(attack.essenceBaseProfile.slots);
    attack.essenceSlots.forEach(slot => {
      delete slot.socketId;
      delete slot.essenceId;
    });
    delete attack.entityAttackId;
    delete attack.essenceBaseProfile;
    delete attack.mastery;
    return attack;
  });
  entity.attackEssenceInventory = { schemaVersion: ESSENCE_LEDGER_SCHEMA_VERSION, ownerEntityId: entity.id, linkedItems: [] };
  entity.currentAttack = null;
}

export function ensureEntityAttackEssenceIdentities(entity = {}, attack = {}) {
  const entityId = entity.id;
  if (entityId === undefined || entityId === null) return attack;
  entity.attackEssenceInventory ??= { schemaVersion: ESSENCE_LEDGER_SCHEMA_VERSION, ownerEntityId: entityId, linkedItems: [] };
  const inventory = entity.attackEssenceInventory;
  inventory.linkedItems ??= [];
  const attackKey = String(attack.entityAttackId || attack.attackKey || attack.functionName);
  const base = attack.essenceBaseProfile;
  const initialize = !base?.identitiesAssigned;
  let nativeOrder = 0;

  (attack.essenceSlots || []).forEach((slot, slotIndex) => {
    ensureEssenceObjectIdentity(slot, {
      type: ESSENCE_OBJECT_TYPES.SOCKET,
      entityId,
      uid: `${sanitizeEssenceOwnerId(attackKey)}-${sanitizeEssenceOwnerId(slot.slotId)}`,
    });
    if (!initialize || slot.source === "attack-mastery") return;
    const color = normalizeColor(slot.color);
    if (!color) return;
    nativeOrder += 1;
    const item = createLinkedEssenceItem(entityId, color, {
      uid: readEssenceUid(slot.socketId),
      origin: "initial-attack-family",
      provenanceSource: "attack-base",
      nativeAttackId: attackKey,
      nativeOrder,
      attackBase: base ? { id: base.id, natures: base.natures, essenceColors: base.essenceColors } : null,
      provenanceContext: { entityId, attackKey, socketId: slot.socketId, slotId: slot.slotId },
      state: "socketed",
      attackKey,
      slotIndex,
    });
    if (!inventory.linkedItems.some(existing => existing.id === item.id)) inventory.linkedItems.push(item);
    slot.essenceId = item.id;
    slot.essenceSource = "linked";
    slot.linkedColor = color;
  });

  if (base && initialize) {
    base.slots = structuredClone(attack.essenceSlots || []);
    base.nativeEssenceIds = inventory.linkedItems
      .filter(item => item.nativeAttackId === attackKey)
      .sort((a, b) => a.nativeOrder - b.nativeOrder)
      .map(item => item.id);
    base.identitiesAssigned = true;
  }
  return attack;
}

export function ensureEntityEssenceIdentities(entity = {}, attacks = entity.attackDetails) {
  const definitions = Array.isArray(attacks) ? attacks : Object.values(attacks || {});
  definitions.forEach(attack => ensureEntityAttackEssenceIdentities(entity, attack));
  return entity;
}

export function releaseRemovedAttackEssences(entity, removedAttackIds) {
  const inventory = entity.attackEssenceInventory;
  if (!inventory || !removedAttackIds.size) return;
  const nativeIds = new Set((entity.nativeAttacks || []).map(attack => attack.entityAttackId));
  const removed = new Set(inventory.linkedItems.filter(item => removedAttackIds.has(item.nativeAttackId)
    && !nativeIds.has(item.nativeAttackId)).map(item => item.id));
  // Temporary attacks take back only their own native essences, never converted universals.
  inventory.linkedItems = inventory.linkedItems.filter(item => !removed.has(item.id));
  for (const item of inventory.linkedItems) {
    if (removedAttackIds.has(item.attackKey)) { item.state = "available"; item.attackKey = ""; item.slotIndex = null; }
  }
  for (const attack of entity.attackDetails || []) {
    for (const slot of attack.essenceSlots || []) {
      if (removed.has(slot.essenceId)) Object.assign(slot, { essenceId: "", color: null, essenceSource: "", linkedColor: "" });
    }
  }
  appendEntityEssenceHistory(entity, { action: "forget-attack", attackIds: [...removedAttackIds], removedEssenceIds: [...removed] });
}

export function getMilestoneEssenceColor(attribute) {
  return ({ force: "red", strength: "red", intelligence: "blue", agilite: "yellow", agility: "yellow" })[attribute] || "";
}

export function getEntityEssenceRewards(entity = {}) {
  const archetype = entity.Archetype || {};
  const entries = [...(archetype.achieve || []), ...(archetype.inProgress || [])];
  if (archetype.current) entries.push(archetype.current);
  const rewards = new Map();
  entries.forEach(entry => {
    const cycle = getCycleForKey(entry.key, entity) || [];
    const step = Math.max(0, Number(entry.step) || 0);
    cycle.slice(0, step).forEach((stageName, index) => {
      if (!String(stageName).endsWith("-3")) return;
      const attribute = entry.milestone?.[index];
      const color = getMilestoneEssenceColor(attribute);
      if (!color) return;
      const cycleLevel = Math.max(1, Number(entry.level) || 1);
      const rewardId = `${entry.key}:${cycleLevel}:${index + 1}`;
      rewards.set(rewardId, {
        rewardId, color, attribute, archetypeKey: entry.key, cycleLevel,
        milestoneIndex: index, stageName,
        statKey: getStatKeyForArchetypeStep({ archetypeKey: entry.key, investedAttribut: attribute, stageName }),
      });
    });
  });
  return [...rewards.values()];
}

export function syncEntityEssenceRewards(entity = {}) {
  if (entity.id !== undefined && entity.id !== null) {
    entity.attackEssenceInventory ??= { schemaVersion: ESSENCE_LEDGER_SCHEMA_VERSION, ownerEntityId: entity.id, linkedItems: [] };
  }
  ensureEntityEssenceIdentities(entity);
  syncHypercognitionEssences(entity);
  const inventory = entity.attackEssenceInventory;
  if (!inventory) return [];
  const rewards = getEntityEssenceRewards(entity);
  const ownedRewards = new Set(inventory.linkedItems.map(item => item.provenance?.rewardId).filter(Boolean));
  rewards.forEach(reward => {
    if (ownedRewards.has(reward.rewardId)) return;
    const item = createLinkedEssenceItem(entity.id, reward.color, {
      origin: "umbra-level-three",
      provenanceSource: "umbra-level-three",
      umbraStatKey: reward.statKey,
      umbraLevel: 3,
      rewardId: reward.rewardId,
      provenanceContext: {
        entityId: entity.id, archetypeKey: reward.archetypeKey, cycleLevel: reward.cycleLevel,
        milestoneIndex: reward.milestoneIndex, attribute: reward.attribute, stageName: reward.stageName,
      },
    });
    inventory.linkedItems.push(item);
    ownedRewards.add(reward.rewardId);
    appendEntityEssenceHistory(entity, { action: "milestone-reward", rewardId: reward.rewardId, essenceId: item.id });
  });
  return inventory.linkedItems;
}

export function resetEntityAttackEssences(entity = {}) {
  const inventory = entity.attackEssenceInventory;
  const priorAttacks = entity.attackDetails || [];
  if (Array.isArray(entity.nativeAttacks)) {
    entity.attackDetails = structuredClone(entity.nativeAttacks);
    entity.attacks = entity.attackDetails.map(attack => attack.functionName);
    entity.currentAttack = null;
    entity.currentAttackId = entity.attacks[0] || null;
    entity.modifierAttacks = {};
    entity.attackSelection = { priorityMode: 'auto', priorities: {}, disabled: {} };
  }
  const attacks = Array.isArray(entity.attackDetails) ? entity.attackDetails : [];
  if (!inventory) return { ok: true, removedEssenceIds: [], removedSocketIds: [] };
  const removedEssenceIds = inventory.linkedItems
    .filter(item => item.hyperco || item.provenance?.source === "umbra-level-three"
      || (item.nativeAttackId && !attacks.some(attack => attack.entityAttackId === item.nativeAttackId)))
    .map(item => item.id);
  const removed = new Set(removedEssenceIds);
  const keptItems = inventory.linkedItems.filter(item => !removed.has(item.id));
  const byId = new Map(keptItems.map(item => [item.id, item]));
  for (const attack of attacks) {
    const base = attack.essenceBaseProfile;
    if (!base?.identitiesAssigned || !Array.isArray(base.slots)) {
      return { ok: false, message: "Profil initial de l'attaque absent." };
    }
    if (base.nativeEssenceIds.some((id, index) => {
      const item = byId.get(id);
      return !item || item.nativeAttackId !== attack.entityAttackId || item.nativeOrder !== index + 1;
    })) return { ok: false, message: "Essence initiale introuvable." };
  }
  keptItems.forEach(item => { item.state = "available"; item.attackKey = ""; item.slotIndex = null; });
  const nativeSocketIds = new Set(attacks.flatMap(attack => attack.essenceBaseProfile?.slots?.map(slot => slot.socketId) || []));
  const removedSocketIds = priorAttacks.flatMap(attack => attack.essenceSlots || []).map(slot => slot.socketId).filter(id => !nativeSocketIds.has(id));
  attacks.forEach(attack => {
    const base = attack.essenceBaseProfile;
    attack.essenceSlots = structuredClone(base.slots);
    attack.essenceSlots.forEach((slot, slotIndex) => {
      if (!slot.essenceId) return;
      const item = byId.get(slot.essenceId);
      item.state = "socketed";
      item.attackKey = attack.entityAttackId;
      item.slotIndex = slotIndex;
      slot.color = item.color;
      slot.essenceSource = "linked";
    });
    attack.essences = attack.essenceSlots.map(slot => slot.color).filter(Boolean);
    attack.essenceSlotCount = attack.essenceSlots.length;
  });
  inventory.linkedItems = keptItems;
  appendEntityEssenceHistory(entity, { action: "reset-progression", removedEssenceIds, removedSocketIds });
  return { ok: true, removedEssenceIds, removedSocketIds };
}

function dedupeItems(items = []) {
  const byId = new Map();
  items.forEach(item => {
    const id = String(item?.id || "").trim();
    if (!id || byId.has(id)) return;
    byId.set(id, item);
  });
  return [...byId.values()];
}

export function normalizeUniversalEssenceStore(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const items = dedupeItems(
    (Array.isArray(source.universalItems) ? source.universalItems : [])
      .map(item => createUniversalEssenceItem(item?.color, item || {}))
      .filter(Boolean)
  );

  const counts = countUniversalEssenceItems(items);
  return {
    schemaVersion: ESSENCE_LEDGER_SCHEMA_VERSION,
    universalItems: dedupeItems(items),
    ...counts,
  };
}

export function countUniversalEssenceItems(items = []) {
  const counts = { red: 0, blue: 0, yellow: 0 };
  dedupeItems(items).forEach(item => {
    const color = normalizeColor(item?.color);
    if (color) counts[color] += 1;
  });
  return counts;
}

export function validateUniversalEssenceItems(items = []) {
  const errors = [];
  const seenIds = new Set();
  (Array.isArray(items) ? items : []).forEach(item => {
    const id = String(item?.id || "").trim();
    const color = normalizeColor(item?.color);
    if (!isUniversalEssenceId(id)) errors.push({ code: "invalid-universal-id", id });
    if (!color) errors.push({ code: "invalid-universal-color", id });
    if (seenIds.has(id)) errors.push({ code: "duplicate-universal-id", id });
    seenIds.add(id);
  });
  return {
    ok: errors.length === 0,
    errors,
    itemCount: seenIds.size,
  };
}

export function appendEntityEssenceHistory(entity = {}, event = {}) {
  if (!entity || typeof entity !== "object") return [];
  entity.attackEssenceInventory ??= {};
  const history = Array.isArray(entity.attackEssenceInventory.history)
    ? entity.attackEssenceInventory.history
    : [];
  history.push({
    at: Date.now(),
    ...event,
  });
  entity.attackEssenceInventory.history = history.slice(-ESSENCE_HISTORY_LIMIT);
  return entity.attackEssenceInventory.history;
}

export function createEssenceTransactionId() {
  return `etx-${createEssenceUid().slice(0, 18)}`;
}

export function getEssenceLedgerSchemaVersion() {
  return ESSENCE_LEDGER_SCHEMA_VERSION;
}
