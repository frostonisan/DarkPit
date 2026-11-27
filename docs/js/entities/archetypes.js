import {
  ARCHETYPE_ATTRIBUTS,
  ATTRIBUT_TO_STAT_KEY,
  CLASS_INDEX,
  calculateAwakeningStepCount,
  getArchetypeTargetRatios,
  getArchetypeUID,
  getClassFromAttributs,
  getCycleForKey,
  getStatKeyForArchetypeStep,
  isKnownArchetypeKey,
  normalizeArchetypeKey,
  resolveMutation,
} from "./rules.js";
import { balanceData } from '../data/balanceData.js';

import { REVERSE_ARCHETYPE_SOURCE, REVERSE_ARCHETYPE_MODES,
  AUTO_REVERSE_ARCHETYPE_SOURCE, AUTO_TARGET_EXCLUDED_KEYS } from '../data/cycleData.js';

function statNumber(value, fallback = 0) {
  if (value && typeof value === 'object') {
    return Number(value.max ?? value.current ?? fallback) || fallback;
  }

  return Number(value ?? fallback) || fallback;
}

function readAdminLevelModifierStat(entite, statKey) {
  return statNumber(entite?.modifierStats?.durable?.adminLevel?.[statKey], 0);
}

function readReverseFoundationStat(entite, statKey, fallback = 0) {
  return statNumber(entite?.baseStats?.[statKey], fallback) +
    readAdminLevelModifierStat(entite, statKey);
}

function readEntityLevelCurrent(entite) {
  const raw = entite?.level;
  if (raw && typeof raw === 'object') {
    return Math.max(1, Math.floor(Number(raw.current ?? raw.level ?? 1) || 1));
  }

  return Math.max(1, Math.floor(Number(raw ?? 1) || 1));
}

function normalizeReverseArchetypeMode(mode) {
  return REVERSE_ARCHETYPE_MODES.has(String(mode || '').toLowerCase())
    ? String(mode).toLowerCase()
    : 'specialiste';
}

function normalizeReverseArchetypeSecondary(rawSecondary, primaryKey) {
  return Array.isArray(rawSecondary)
    ? rawSecondary
        .map(normalizeArchetypeKey)
        .filter(key => key && key !== primaryKey && isKnownArchetypeKey(key))
    : [];
}

function readKnownArchetypeKey(value) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const key = readKnownArchetypeKey(entry);
      if (key) return key;
    }
    return null;
  }

  if (value && typeof value === 'object') {
    return readKnownArchetypeKey(
      value.key ??
      value.archetype ??
      value.archetypeKey ??
      value.current?.key
    );
  }

  const key = normalizeArchetypeKey(value);
  return key && isKnownArchetypeKey(key) ? key : null;
}

function normalizeReverseArchetypeStepCount(value) {
  if (value === undefined || value === null || value === '') return null;

  const numericValue = Math.floor(Number(value));
  return Number.isFinite(numericValue)
    ? Math.max(0, numericValue)
    : null;
}

function readReverseArchetypeRouteEntry(entry, fallbackKey = null) {
  const key = readKnownArchetypeKey(entry ?? fallbackKey);
  if (!key || AUTO_TARGET_EXCLUDED_KEYS.has(key)) return null;

  const rawSteps = entry && typeof entry === 'object' && !Array.isArray(entry)
    ? entry.steps ?? entry.step ?? entry.points ?? entry.count
    : null;

  return {
    key,
    steps: normalizeReverseArchetypeStepCount(rawSteps),
  };
}

function normalizeReverseArchetypeRoute(rawRoute, fallbackKey = null) {
  const entries = Array.isArray(rawRoute)
    ? rawRoute
    : (rawRoute ? [rawRoute] : []);
  const route = entries
    .map(entry => readReverseArchetypeRouteEntry(entry))
    .filter(Boolean);
  const fallback = readReverseArchetypeRouteEntry(fallbackKey);

  if (!route.length && fallback) {
    route.push(fallback);
  }

  return route;
}

function cloneReverseArchetypeRoute(route) {
  return (Array.isArray(route) ? route : [])
    .map(segment => readReverseArchetypeRouteEntry(segment))
    .filter(Boolean);
}

function getReverseRoutePath(route) {
  return (Array.isArray(route) ? route : [])
    .map(segment => segment?.key)
    .filter(Boolean);
}

function readDeclaredReverseArchetypeConfig(entite) {
  const raw = entite?.reverseArchetype;

  if (raw) {
    const key = readKnownArchetypeKey(raw);
    if (key) {
      const route = normalizeReverseArchetypeRoute(
        Array.isArray(raw)
          ? raw
          : (Array.isArray(raw?.route) ? raw.route : raw?.path),
        key
      );
      const path = getReverseRoutePath(route);
      const primaryKey = path[0] || key;
      return {
        key: primaryKey,
        mode: normalizeReverseArchetypeMode(raw?.mode),
        secondary: normalizeReverseArchetypeSecondary(raw?.secondary, primaryKey),
        route,
        path,
        source: REVERSE_ARCHETYPE_SOURCE,
      };
    }
  }

  const declaredKey = [
    entite?.archetype,
    entite?.archetypes,
    entite?.archetypeKey,
    entite?.currentArchetype,
  ].map(readKnownArchetypeKey).find(Boolean);

  if (!declaredKey) return null;

  return {
    key: declaredKey,
    mode: 'specialiste',
    secondary: [],
    route: [{ key: declaredKey, steps: null }],
    path: [declaredKey],
    source: REVERSE_ARCHETYPE_SOURCE,
  };
}

function readGeneratedReverseArchetypeConfig(entite) {
  const meta = entite?.Archetype?.meta;
  if (meta?.source !== REVERSE_ARCHETYPE_SOURCE) return null;

  const key = readKnownArchetypeKey(meta.targetKey);
  if (!key) return null;

  const route = Array.isArray(meta.route)
    ? normalizeReverseArchetypeRoute(meta.route, key)
    : normalizeReverseArchetypeRoute(meta.path, key);
  const path = getReverseRoutePath(route);
  const primaryKey = path[0] || key;
  return {
    key: primaryKey,
    mode: normalizeReverseArchetypeMode(meta.mode),
    secondary: normalizeReverseArchetypeSecondary(meta.secondary, primaryKey),
    route,
    path,
    source: meta.auto ? AUTO_REVERSE_ARCHETYPE_SOURCE : REVERSE_ARCHETYPE_SOURCE,
  };
}

function findBestArchetypeToFinish(entite) {
  const arch = entite?.Archetype;
  if (!arch || arch?.meta?.source === REVERSE_ARCHETYPE_SOURCE) return null;

  const entries = [
    arch.current,
    ...(Array.isArray(arch.inProgress) ? arch.inProgress : []),
  ];
  let best = null;

  entries.forEach(entry => {
    const key = readKnownArchetypeKey(entry?.key);
    if (!key || AUTO_TARGET_EXCLUDED_KEYS.has(key)) return;

    const cycle = getCycleForKey(key, entite);
    if (!cycle?.length) return;

    const step = Math.max(0, Math.min(Number(entry?.step ?? 0) || 0, cycle.length));
    if (step >= cycle.length) return;

    const remaining = cycle.length - step;
    const level = Math.max(1, Number(entry?.level ?? 1) || 1);

    if (
      !best ||
      remaining < best.remaining ||
      (remaining === best.remaining && step > best.step) ||
      (remaining === best.remaining && step === best.step && level > best.level)
    ) {
      best = { key, remaining, step, level };
    }
  });

  return best?.key || null;
}

export function getAutoReverseArchetypeCandidates(entite, budget) {
  const keys = Object.keys(CLASS_INDEX).filter(key => {
    if (AUTO_TARGET_EXCLUDED_KEYS.has(key)) return false;
    const cycle = getCycleForKey(key, entite);
    return Array.isArray(cycle) && cycle.length > 0;
  });

  if (!keys.length) return [];

  const will = readReverseFoundationStat(entite, 'will', statNumber(entite?.will, 0));
  const awakeningSteps = calculateAwakeningStepCount(will, {
    ...balanceData.level.will,
  });
  const postAwakeningBudget = Math.max(0, budget - awakeningSteps);
  const finishable = keys.filter(key => {
    const cycle = getCycleForKey(key, entite);
    return cycle?.length > 0 && cycle.length <= postAwakeningBudget;
  });

  return finishable.length ? finishable : keys;
}

function pickRandomReverseArchetypeKey(entite, budget) {
  const candidates = getAutoReverseArchetypeCandidates(entite, budget);
  if (!candidates.length) return null;

  return candidates[Math.floor(Math.random() * candidates.length)] || null;
}

function normalizeReverseArchetypeConfig(entite) {
  const explicit = readDeclaredReverseArchetypeConfig(entite);
  if (explicit) return explicit;

  const generated = readGeneratedReverseArchetypeConfig(entite);
  if (generated) return generated;

  const budget = Math.max(0, readEntityLevelCurrent(entite) - 1);
  if (budget <= 0) return null;

  const unfinishedKey = findBestArchetypeToFinish(entite);
  if (unfinishedKey) {
    return {
      key: unfinishedKey,
      mode: 'specialiste',
      secondary: [],
      route: [{ key: unfinishedKey, steps: null }],
      path: [unfinishedKey],
      source: AUTO_REVERSE_ARCHETYPE_SOURCE,
    };
  }

  const randomKey = pickRandomReverseArchetypeKey(entite, budget);
  if (!randomKey) return null;

  return {
    key: randomKey,
    mode: 'specialiste',
    secondary: [],
    route: [{ key: randomKey, steps: null }],
    path: [randomKey],
    source: AUTO_REVERSE_ARCHETYPE_SOURCE,
  };
}

function createReverseProgressEntry(key, level = 1, step = 0, preview = false) {
  return {
    key,
    level: Math.max(1, Math.floor(Number(level) || 1)),
    step: Math.max(0, Math.floor(Number(step) || 0)),
    uid: preview ? `power-${key}-${level}-${step}` : getArchetypeUID(),
    milestone: [],
  };
}

const makeProgressEntry = createReverseProgressEntry;

function cloneProgressEntry(entry) {
  return {
    key: entry.key,
    level: entry.level,
    step: entry.step,
    uid: entry.uid,
    milestone: Array.isArray(entry.milestone)
      ? entry.milestone.slice(0, entry.step)
      : [],
  };
}

function addDelta(delta, key, amount = 1) {
  if (!key) return;
  const value = Number(amount) || 0;
  if (!value) return;
  delta[key] = (Number(delta[key] ?? 0) || 0) + value;
}

function readBaseAttributCounters(entite) {
  return {
    force: Math.max(0, readReverseFoundationStat(entite, 'strength', 0)),
    agilite: Math.max(0, readReverseFoundationStat(entite, 'agility', 0)),
    intelligence: Math.max(0, readReverseFoundationStat(entite, 'intelligence', 0)),
  };
}

function scoreAttributCounters(counters, targetRatios) {
  const total = ARCHETYPE_ATTRIBUTS.reduce(
    (sum, attr) => sum + Math.max(0, Number(counters[attr]) || 0),
    0
  );

  if (total <= 0) return Number.POSITIVE_INFINITY;

  return ARCHETYPE_ATTRIBUTS.reduce((score, attr) => {
    const actual = (Math.max(0, Number(counters[attr]) || 0)) / total;
    const target = Number(targetRatios?.[attr] ?? 1 / 3) || 0;
    const diff = actual - target;
    return score + diff * diff;
  }, 0);
}

function chooseNextAttribut(counters, targetRatios) {
  let best = null;

  for (const attr of ARCHETYPE_ATTRIBUTS) {
    const candidate = {
      ...counters,
      [attr]: (Number(counters[attr]) || 0) + 1,
    };
    const score = scoreAttributCounters(candidate, targetRatios);
    const totalAfter = ARCHETYPE_ATTRIBUTS.reduce(
      (sum, key) => sum + (Number(candidate[key]) || 0),
      0
    );
    const targetNeed =
      (Number(targetRatios?.[attr] ?? 1 / 3) || 0) * totalAfter -
      (Number(counters[attr]) || 0);

    if (
      !best ||
      score < best.score ||
      (score === best.score && targetNeed > best.targetNeed)
    ) {
      best = { attr, score, targetNeed };
    }
  }

  return best?.attr || 'force';
}

function getNextPolyvalentTarget(currentTarget, config, completedSwitches) {
  const secondary = config.secondary || [];
  const nextExplicit = secondary[completedSwitches - 1];
  if (nextExplicit) return nextExplicit;

  return currentTarget === 'archon' ? 'equinoxe' : 'archon';
}

function buildArchetypeState(progress, currentKey, achieve) {
  const current =
    progress[currentKey]
      ? cloneProgressEntry(progress[currentKey])
      : makeProgressEntry(currentKey, 1, 0);

  const inProgress = Object.values(progress)
    .filter(entry => (
      entry.step > 0 ||
      (entry.key === current.key && entry.level === current.level)
    ))
    .map(cloneProgressEntry);
  const hasCurrent = inProgress.some(entry =>
    entry.key === current.key && entry.level === current.level
  );

  if (!hasCurrent) inProgress.push({ ...current });

  return {
    current,
    inProgress,
    achieve: achieve.map(cloneProgressEntry),
  };
}

export function hasReverseArchetypeConfig(entite) {
  return !!normalizeReverseArchetypeConfig(entite);
}

export function buildReverseArchetypePlan(entite, options = {}) {
  const makeProgressEntry = (key, level, step) => createReverseProgressEntry(key, level, step, options.preview === true);
  const config = normalizeReverseArchetypeConfig(entite);
  if (!config) return null;

  const maxLevel =
    Number.isFinite(Number(options.maxLevel))
      ? Math.max(1, Math.floor(Number(options.maxLevel)))
      : null;
  const currentLevel = maxLevel
    ? Math.min(readEntityLevelCurrent(entite), maxLevel)
    : readEntityLevelCurrent(entite);
  const budget = Math.max(0, currentLevel - 1);
  const counters = readBaseAttributCounters(entite);
  const delta = {};
  const progress = {};
  const achieve = [];
  const will = readReverseFoundationStat(entite, 'will', statNumber(entite?.will, 0));
  const awakeningSteps = calculateAwakeningStepCount(will, {
    ...balanceData.level.will,
  });

  let awakened = false;
  const routeSegments = cloneReverseArchetypeRoute(config.route);
  if (!routeSegments.length) {
    normalizeReverseArchetypeRoute(config.path, config.key)
      .forEach(segment => routeSegments.push(segment));
  }

  const pathTargets = getReverseRoutePath(routeSegments);
  const routeProgress = routeSegments.map((segment, index) => ({
    index,
    key: segment.key,
    steps: segment.steps,
    spent: 0,
    level: 1,
    step: 0,
    cycleLength: getCycleForKey(segment.key, entite)?.length || 0,
  }));
  let pathTargetIndex = 0;
  let steeringTarget = pathTargets[pathTargetIndex] || config.key;
  let routeSegmentSpent = 0;
  let completedTargetSwitches = 0;
  let currentKey = 'egare';

  const refreshRouteTarget = () => {
    steeringTarget = routeSegments[pathTargetIndex]?.key || steeringTarget || config.key;
    return steeringTarget;
  };

  const maybeAdvanceFiniteRouteSegment = (activeIndex, activeSegment) => {
    const stepLimit = normalizeReverseArchetypeStepCount(activeSegment?.steps);
    if (
      stepLimit === null ||
      activeIndex !== pathTargetIndex ||
      pathTargetIndex >= routeSegments.length - 1 ||
      routeSegmentSpent < stepLimit
    ) {
      return false;
    }

    pathTargetIndex += 1;
    routeSegmentSpent = 0;
    refreshRouteTarget();
    return true;
  };

  const skipEmptyRouteSegments = () => {
    while (
      pathTargetIndex < routeSegments.length - 1 &&
      normalizeReverseArchetypeStepCount(routeSegments[pathTargetIndex]?.steps) === 0
    ) {
      pathTargetIndex += 1;
      routeSegmentSpent = 0;
    }

    refreshRouteTarget();
  };

  for (let pointIndex = 0; pointIndex < budget; pointIndex++) {
    skipEmptyRouteSegments();

    const stepLevel = pointIndex + 2;
    const activeRouteIndex = pathTargetIndex;
    const activeRouteSegment = routeSegments[activeRouteIndex] || null;
    const activeSteeringTarget = refreshRouteTarget();
    const targetRatios =
      getArchetypeTargetRatios(activeSteeringTarget) ||
      getArchetypeTargetRatios(config.key) ||
      { force: 1 / 3, agilite: 1 / 3, intelligence: 1 / 3 };
    const investedAttribut = chooseNextAttribut(counters, targetRatios);
    const mainStatKey = ATTRIBUT_TO_STAT_KEY[investedAttribut];

    counters[investedAttribut] += 1;
    addDelta(delta, mainStatKey, 1);

    const activeKey = awakened
      ? normalizeArchetypeKey(
          getClassFromAttributs(
            counters.force,
            counters.agilite,
            counters.intelligence,
            stepLevel,
            true,
            entite
          )
        )
      : 'egare';
    let safeActiveKey = getCycleForKey(activeKey, entite) ? activeKey : 'egare';
    if (awakened && activeSteeringTarget && getCycleForKey(activeSteeringTarget, entite)) {
      safeActiveKey = activeSteeringTarget;
    }

    const cycle = getCycleForKey(safeActiveKey, entite) || [];

    if (!cycle.length) continue;

    const entry = progress[safeActiveKey] || makeProgressEntry(safeActiveKey, 1, 0);
    const appliedStage = Math.min(entry.step + 1, cycle.length);
    const rawStageName = cycle[appliedStage - 1];
    const stageName = String(rawStageName || '').startsWith('mutation')
      ? resolveMutation(
          rawStageName,
          counters.force,
          counters.agilite,
          counters.intelligence,
          investedAttribut,
          stepLevel,
          entite,
          awakened
        ).finalName
      : rawStageName;
    const subStatKey = getStatKeyForArchetypeStep({
      archetypeKey: safeActiveKey,
      investedAttribut,
      stageName,
    });

    addDelta(delta, subStatKey, 1);

    entry.step = appliedStage;
    entry.milestone[appliedStage - 1] = investedAttribut;
    progress[safeActiveKey] = entry;
    currentKey = safeActiveKey;

    if (awakened && safeActiveKey !== 'egare') {
      const routeInfo = routeProgress[activeRouteIndex];
      if (routeInfo) {
        routeInfo.spent += 1;
        routeInfo.level = entry.level;
        routeInfo.step = entry.step;
        routeInfo.complete = cycle.length > 0 && entry.step >= cycle.length;
      }

      routeSegmentSpent += 1;
    }

    const routeAdvanced = awakened && safeActiveKey !== 'egare'
      ? maybeAdvanceFiniteRouteSegment(activeRouteIndex, activeRouteSegment)
      : false;

    if (appliedStage < cycle.length) continue;
    if (entite.archetypeFrozen === true) {
      progress.egare = makeProgressEntry('egare', entry.level + 1, 0);
      currentKey = 'egare';
      continue;
    }

    const snapshot = cloneProgressEntry(entry);
    snapshot.step = cycle.length;
    snapshot.milestone = entry.milestone.slice(0, cycle.length);
    achieve.push(snapshot);

    if (safeActiveKey === 'egare' && !awakened) {
      delete progress.egare;
      awakened = true;
      const awakeKey =
        normalizeArchetypeKey(
          getClassFromAttributs(
            counters.force,
            counters.agilite,
            counters.intelligence,
            stepLevel,
            true,
            entite
          )
        ) || config.key;
      const routeAwakeKey = refreshRouteTarget();

      currentKey =
        routeAwakeKey && getCycleForKey(routeAwakeKey, entite)
          ? routeAwakeKey
          : (getCycleForKey(awakeKey, entite) ? awakeKey : config.key);
      progress[currentKey] = progress[currentKey] || makeProgressEntry(currentKey, snapshot.level, 0);
      continue;
    }

    progress[safeActiveKey] = makeProgressEntry(safeActiveKey, entry.level + 1, 0);

    if (
      safeActiveKey === activeSteeringTarget &&
      safeActiveKey !== 'egare' &&
      !routeAdvanced &&
      normalizeReverseArchetypeStepCount(activeRouteSegment?.steps) === null
    ) {
      if (pathTargetIndex < pathTargets.length - 1) {
        pathTargetIndex += 1;
        routeSegmentSpent = 0;
        steeringTarget = pathTargets[pathTargetIndex] || steeringTarget;
      } else if (config.mode === 'polyvalent') {
        completedTargetSwitches += 1;
        steeringTarget = getNextPolyvalentTarget(steeringTarget, config, completedTargetSwitches);
      }
    }
  }

  if (!progress[currentKey]) {
    progress[currentKey] = makeProgressEntry(currentKey, 1, 0);
  }

  const actualFinalKey = awakened
    ? normalizeArchetypeKey(
        getClassFromAttributs(
          counters.force,
          counters.agilite,
          counters.intelligence,
          currentLevel,
          true,
          entite
        )
      )
    : 'egare';
  const finalKey = awakened ? currentKey : 'egare';
  const targetReached =
    finalKey === config.key ||
    achieve.some(entry => entry.key === config.key);

  return {
    source: REVERSE_ARCHETYPE_SOURCE,
    delta,
    archetypeState: buildArchetypeState(progress, currentKey, achieve),
    meta: {
      source: REVERSE_ARCHETYPE_SOURCE,
      auto: config.source === AUTO_REVERSE_ARCHETYPE_SOURCE,
      targetSource: config.source,
      targetKey: config.key,
      mode: config.mode,
      secondary: config.secondary.slice(),
      path: pathTargets.slice(),
      route: routeSegments.map(segment => ({
        key: segment.key,
        steps: segment.steps,
      })),
      routeProgress: routeProgress.map(entry => ({
        key: entry.key,
        steps: entry.steps,
        spent: entry.spent,
        level: entry.level,
        step: entry.step,
        cycleLength: entry.cycleLength,
        active: entry.index === pathTargetIndex,
        complete: entry.complete === true,
      })),
      pathTargetIndex,
      requestedLevel: readEntityLevelCurrent(entite),
      level: currentLevel,
      budget,
      pointsSpent: budget,
      awakeningSteps,
      awakened,
      finalKey,
      actualFinalKey,
      targetReached,
      finalAttributs: { ...counters },
    },
  };
}
