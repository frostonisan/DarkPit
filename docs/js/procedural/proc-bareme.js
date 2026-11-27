import { POWER_HELPER_LABELS, buildPowerUncertaintyHelper, buildPowerBreakdownHelper } from '../data/helpers.js';
import { stats as definitions } from '../data/statsData.js';
import { balanceData } from '../data/balanceData.js';
import { getStuffResourceStocks } from '../items/resourceStocks.js';

// This module is pure: evaluation never creates items, restores pools or saves.
export const POWER_RULES = {
  version: 2,
  percentMultiplier: 10,
  unknownCoefficient: 10,
  pointsPerLevel: 100,
  maxLevel: 250,
  maxDepth: 8,
  rateActions: 100,
  maxRateActions: 10000,
  minimumHorizonMs: 60000,
  dpsCoefficient: 10,
  hpsCoefficient: 10,
  unitScales: { speed: 0.001, cooldownTime: 0.001, preparationTime: 0.001, executionTime: 0.001, projectileTime: 0.001, recuperationTime: 0.001 },
  premiums: {
    equipment: 10,
    additionalAttack: 10,
    umbra2: 10,
    umbra3: 10,
    fadedLife: 10,
    extraLife: 10,
    eternalLife: 10,
    resurrectionItem: 10,
    resurrectionSpell: 10,
  },
  tierCoefficients: { 1: 3, 2: 12, 3: 27 },
  qualityByPower: [0, 6, 14, 28, 48, 80, 120],
  lowerIsBetter: ['speed', 'weight', 'cooldownTime', 'preparationTime', 'executionTime', 'projectileTime', 'recuperationTime'],
  coefficients: {
    strength: 20, agility: 20, intelligence: 20, will: 20,
    HP: 1, armor: 4, physicalDamage: 1, magicalDamage: 1, piercingDamage: 1,
    physicalPen: 4, magicalPen: 4, physicalResistance: 4, magicalResistance: 4,
    velocity: 4, dodge: 4, speed: 4, weight: 12, hybridalDamage: 4,
    extraLife: 30, fadedLife: 16, eternalLife: 40, rangeAttack: 16,
    lifesteal: 16, charge: 45, weaponOrfevre: 9, weaponCollector: 9,
    bloodThirsty: 9, trailer: 9, marathon: 9, hpBattleRegen: 9, dayHpRegen: 2,
    shift: 9, bloodFuryExecutionChance: 9, bloodFuryExecutionDamage: 9,
    bloodFuryTargetThreshold: 9, cooldownTime: 4, preparationTime: 4,
    executionTime: 4, projectileTime: 4, recuperationTime: 4,
    attackCooldownReduc: 4, attackPreparationReduc: 4, attackExecutionReduc: 4,
    attackRecoveryReduc: 4, attackProjectileSpeed: 4,
    heal: 1, damage: 1, battleSlotBonus: 10, bagSlotBonus: 10,
  },
};

// Reglage : floor = points fixes hors multiplicateur ; coefficient = bonus additif.
// Exemple : 100 points quantitatifs, socle 50, coefficient 0.25 => 175 points.
// Les zeros sont volontaires : deja chiffre dans DPS/HPS, ou tarif a equilibrer.
// Les groupes des mecaniques peuvent restreindre la base (damage/healing/summon).
export const TACTICAL_RULES = {
  maxScore: 999999999,
  maxNodes: 512,
  maxDepth: 8,
  consequences: {
    suppression: { floor: 100, coefficient: 0.95 },
    generation_entite: { floor: 50, coefficient: 0.25 },
    resurrection: { floor: 10, coefficient: 0 },
    generation_objet: { floor: 10, coefficient: 0 },
    direct: { floor: 0, coefficient: 0 },
    differe: { floor: 0, coefficient: 0 },
    periodique: { floor: 0, coefficient: 0 },
    definitive: { floor: 0, coefficient: 0 },
    prolongee: { floor: 0, coefficient: 0 },
    temporaire: { floor: 0, coefficient: 0 },
    soin: { floor: 0, coefficient: 0, scope: 'healing', coveredBy: 'hps' },
    degats: { floor: 0, coefficient: 0, scope: 'damage', coveredBy: 'dps' },
    renforcement: { floor: 0, coefficient: 0 },
    affaiblissement: { floor: 0, coefficient: 0 },
    blocage_total: { floor: 0, coefficient: 0 },
    blocage_partiel: { floor: 0, coefficient: 0 },
    deplacement_entite: { floor: 0, coefficient: 0 },
    multicible: { floor: 0, coefficient: 0 },
    dissimulation: { floor: 0, coefficient: 0 },
    revelation: { floor: 0, coefficient: 0 },
    modification_aggro: { floor: 0, coefficient: 0 },
    ciblage_force: { floor: 0, coefficient: 0 },
    fixe: { floor: 0, coefficient: 0 },
    proportionnel: { floor: 0, coefficient: 0 },
    entite: { floor: 0, coefficient: 0 },
    terrain: { floor: 0, coefficient: 0 },
    allie: { floor: 0, coefficient: 0 },
    ennemi: { floor: 0, coefficient: 0 },
    vivant: { floor: 0, coefficient: 0 },
    mort: { floor: 0, coefficient: 0 },
    melee: { floor: 0, coefficient: 0 },
    distance: { floor: 0, coefficient: 0 },
    harmonie: { floor: 0, coefficient: 0 },
    maitrise: { floor: 0, coefficient: 0 },
  },
};

export function integerPower(value) {
  if (Number.isNaN(Number(value))) throw new TypeError('Power non numerique');
  return Math.round(Math.max(-TACTICAL_RULES.maxScore, Math.min(TACTICAL_RULES.maxScore, Number(value))));
}

// Functions passed as mechanics are inspected, never invoked. Repeated branches
// merge provenance; tacticalId explicitly distinguishes independent applications.
export function collectTacticalConsequences(root = {}, { effects = [], mechanicFor = () => null, inferred = [], source = 'attack' } = {}) {
  const rows = new Map();
  const diagnostics = [];
  const pathNodes = new Set();
  const visited = new Set();
  let nodes = 0;
  const list = value => Array.isArray(value) ? value : [];
  const rootTarget = list(root.attackTarget).includes('hexa') ? 'terrain'
    : `${list(root.attackTarget).includes('ally') ? 'ally' : 'enemy'}${list(root.deadTarget).includes('yes') ? '-corpse' : ''}`;
  const diagnose = (reason, path) => diagnostics.push({ reason, path: [...path] });
  function visit(node, context, path, depth = 0) {
    if (!node) return;
    if (depth > TACTICAL_RULES.maxDepth || ++nodes > TACTICAL_RULES.maxNodes) { diagnose('limite-parcours', path); return; }
    if (pathNodes.has(node)) { diagnose('reference-circulaire', path); return; }
    pathNodes.add(node);
    const target = node.target || context.target;
    const identity = node.tacticalId || context.identity;
    const quantity = node.quantity ?? context.quantity;
    const scope = node.tacticalScope || context.scope;
    if (!Number.isFinite(quantity) || quantity < 0) { diagnose('quantite-invalide', path); pathNodes.delete(node); return; }
    if (node.tacticalConsequence !== undefined && !Array.isArray(node.tacticalConsequence)) diagnose('liste-invalide', path);
    for (const keyword of new Set(list(node.tacticalConsequence))) {
      const rule = typeof keyword === 'string' && own(TACTICAL_RULES.consequences, keyword) ? TACTICAL_RULES.consequences[keyword] : null;
      if (!rule) { diagnose(`mot-cle-inconnu:${String(keyword)}`, path); continue; }
      const basis = node.tacticalScope || rule.scope || scope;
      if (!['attack', 'damage', 'healing', 'summon'].includes(basis)) { diagnose(`portee-invalide:${basis}`, path); continue; }
      const key = JSON.stringify([identity, target, keyword]);
      const existing = rows.get(key);
      if (existing) {
        existing.sources.push([...path]);
        if (existing.quantity !== quantity) diagnose(`declaration-contradictoire:${keyword}`, path);
        // A generic declaration and its specific mechanic describe one effect.
        if (existing.scope === 'attack') existing.scope = basis;
        else if (basis !== 'attack' && existing.scope !== basis) diagnose(`portee-contradictoire:${keyword}`, path);
        continue;
      }
      rows.set(key, { keyword, scope: basis, target, quantity, identity, sources: [[...path]] });
    }
    if (node.tacticalEffects !== undefined && !Array.isArray(node.tacticalEffects)) diagnose('groupes-invalides', path);
    list(node.tacticalEffects).slice(0, TACTICAL_RULES.maxNodes).forEach((group, index) => visit(group, { target, identity, quantity, scope }, [...path, group?.id || `group-${index}`], depth + 1));
    if (list(node.tacticalEffects).length > TACTICAL_RULES.maxNodes) diagnose('limite-parcours', path);
    for (const name of list(node.tacticalMechanics)) {
      const mechanic = mechanicFor(name);
      if (!mechanic) diagnose(`mecanique-inconnue:${name}`, path);
      else visit(mechanic, { target, identity, quantity, scope }, [...path, `mechanic:${name}`], depth + 1);
    }
    pathNodes.delete(node);
  }
  const context = { target: rootTarget, identity: '', quantity: 1, scope: 'attack' };
  visit(root, context, [source]);
  for (const node of inferred) visit(node, context, [source, 'inferred', ...(node.id ? [node.id] : [])]);
  for (const [field, self] of [['effets', false], ['selfEffects', true]]) {
    for (const name of list(root[field])) {
      const key = `${field}:${name}`;
      if (visited.has(key)) continue;
      visited.add(key);
      const path = [source, `${field}:${name}`];
      const snapshot = self ? root.resolvedSelfEffects : root.resolvedEffects;
      const effect = (snapshot || effects).find(entry => entry.effectName === name)
        || (name === 'none' ? effects.find(entry => entry.effectName === name) : null);
      if (!effect) { diagnose(`effet-inconnu:${name}`, path); continue; }
      const handler = mechanicFor(name, { self });
      const ctx = { ...context, target: self ? 'self' : rootTarget, scope: handler?.tacticalScope || 'attack' };
      visit(effect, ctx, path);
      if (handler) visit(handler, ctx, [...path, `mechanic:${handler.name || name}`]);
      else if (!effect.tacticalVisualOnly) diagnose(`mecanique-absente:${name}`, path);
    }
  }
  return { rows: [...rows.values()], diagnostics, incomplete: diagnostics.length > 0 };
}

export function evaluateTacticalPower(collected, basis = {}, { covered = [] } = {}) {
  const diagnostics = [...collected.diagnostics];
  const coveredSet = new Set(covered);
  const rows = collected.rows.map(row => {
    const rule = TACTICAL_RULES.consequences[row.keyword];
    const valid = rule && Number.isFinite(rule.floor) && rule.floor >= 0 && Number.isFinite(rule.coefficient) && rule.coefficient >= 0;
    if (!valid) diagnostics.push({ reason: `bareme-invalide:${row.keyword}`, path: row.sources[0] });
    const alreadyCovered = valid && rule.coveredBy && coveredSet.has(rule.coveredBy);
    const amount = Math.max(0, powerNumber(basis[row.scope]));
    const floor = valid && !alreadyCovered ? rule.floor * row.quantity : 0;
    const coefficient = valid && !alreadyCovered ? rule.coefficient * row.quantity : 0;
    return { ...row, floor, coefficient, basis: amount, bonus: amount * coefficient,
      score: integerPower(floor + amount * coefficient),
      coveredBy: alreadyCovered ? rule.coveredBy : null };
  });
  const floor = rows.reduce((sum, row) => sum + row.floor, 0);
  const bonus = rows.reduce((sum, row) => sum + row.bonus, 0);
  return { floor, bonus, coefficient: rows.reduce((sum, row) => sum + row.coefficient, 0),
    score: integerPower(floor + bonus), rows, diagnostics, incomplete: diagnostics.length > 0,
    saturated: floor + bonus > TACTICAL_RULES.maxScore };
}

const aliases = {
  force: 'strength', agilite: 'agility', intel: 'intelligence',
  MagicDamage: 'magicalDamage', transpiercingDamage: 'piercingDamage',
  hybridDamage: 'hybridalDamage',
};
const own = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
export const powerNumber = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
export const roundPower = value => Math.round(powerNumber(value) * 100) / 100;
export const powerStatKey = value => {
  const key = String(value || '').replace(/^stats\./, '').replace(/\.(current|max)$/, '');
  return aliases[key] || key;
};
const metadata = new Map(definitions.map(entry => [powerStatKey(entry.key), entry]));

export function isPowerEntityAwakened(entity) {
  if (entity?.archetypeFrozen === true) return false;
  const key = String(entity?.Archetype?.current?.key || 'egare').toLowerCase();
  return key !== 'egare' && key !== 'inerte';
}

export function isUmbraRestricted(entity, stat) {
  if (!entity?.Archetype && entity?.archetypeFrozen !== true) return false;
  const key = powerStatKey(stat);
  const entry = metadata.get(key);
  const rank = Number(String(entry?.type || '').split('-').pop()) || 0;
  // A manual admin grant unlocks only this Umbra, even on an unawakened entity.
  // Clearing the grant restores the ordinary restriction; point limits still apply.
  if (powerNumber(entity?.modifierStats?.durable?.adminLevel?.[key]) > 0) return false;
  return !!entity && entry?.nature === 'umbra' && rank >= 2 && !isPowerEntityAwakened(entity);
}

export function filterRestrictedUmbras(entity, values) {
  const result = { ...values };
  for (const key of Object.keys(result)) {
    if (isUmbraRestricted(entity, key)) result[key] = 0;
  }
  return result;
}

export function getPowerStatDefinition(stat, hints = {}, visited = new Set()) {
  const key = powerStatKey(stat);
  const meta = metadata.get(key) || hints;
  const rank = Number(String(meta.type || '').split('-').pop()) || Number(meta.rank) || 0;
  const category = String(meta.type || '').startsWith('defense') || ['HP', 'armor', 'physicalResistance', 'magicalResistance', 'dodge'].includes(key) ? 'defense'
    : String(meta.type || '').startsWith('attaque') || ['physicalDamage', 'magicalDamage', 'piercingDamage', 'physicalPen', 'magicalPen'].includes(key) ? 'attack' : 'utility';
  const attribute = powerStatKey(meta.attribut || meta.attribute || '');
  const common = { stat: key, rank, category, attribute, nature: meta.nature || 'statistic' };
  if (own(POWER_RULES.coefficients, key)) {
    return { ...common, coefficient: POWER_RULES.coefficients[key], path: [key], fallback: false };
  }
  if (meta.nature === 'umbra' && POWER_RULES.tierCoefficients[rank]) {
    return { ...common, coefficient: POWER_RULES.tierCoefficients[rank], path: [key, `umbra-${rank}`], fallback: false };
  }
  if (visited.has(key) || visited.size >= POWER_RULES.maxDepth) {
    return { ...common, coefficient: POWER_RULES.unknownCoefficient, path: [key, 'bounded-fallback'], fallback: true };
  }
  visited.add(key);
  const generated = Object.entries(balanceData.generatedUmbraStats?.sources || {})
    .find(([, entry]) => powerStatKey(entry.target) === key);
  const source = meta.sourceStat || meta.parentStat;
  if (source) {
    const parent = getPowerStatDefinition(source, {}, visited);
    const conversion = Math.max(0, powerNumber(meta.powerConversion, 1));
    return { ...common, coefficient: parent.coefficient * conversion, path: [key, ...parent.path], fallback: true };
  }
  const parentAttribute = attribute || powerStatKey(generated?.[1]?.attribute);
  if (parentAttribute && own(POWER_RULES.coefficients, parentAttribute)) {
    // A lineage identifies a family, not a one-for-one conversion of units.
    const coefficient = POWER_RULES.tierCoefficients[rank] || POWER_RULES.unknownCoefficient;
    return { ...common, attribute: parentAttribute, coefficient,
      path: [key, ...(generated ? [generated[0]] : []), parentAttribute, 'family-tariff'], fallback: true };
  }
  return { ...common, coefficient: POWER_RULES.unknownCoefficient, path: [key, 'unclassified'], fallback: true };
}

function valuesByUnit(value, stat, mode) {
  if (!value || typeof value !== 'object') return [{ unit: mode, quantity: powerNumber(value) }];
  if (own(value, 'current') || own(value, 'max')) {
    const amount = stat === 'armor' ? value.current : value.max ?? value.current;
    return [{ unit: 'flat', quantity: powerNumber(amount) }];
  }
  return ['flat', 'percent'].filter(unit => own(value, unit))
    .map(unit => ({ unit, quantity: powerNumber(value[unit]) }));
}

export function normalizePowerEffects(effects = []) {
  const groups = new Map();
  for (const effect of Array.isArray(effects) ? effects : []) {
    if (!effect || typeof effect !== 'object') continue;
    const type = String(effect.type || 'stat').toLowerCase();
    const entries = effect.stats && typeof effect.stats === 'object'
      ? Object.entries(effect.stats) : [[effect.stat || effect.umbra || effect.umbraKey, effect.value ?? effect.amount ?? effect.quantity ?? 1]];
    for (const [rawKey, value] of entries) {
      if (!rawKey) continue;
      const stat = powerStatKey(rawKey);
      const mode = effect.mode === 'percent' || effect.valueType === 'percent' || effect.percent === true ? 'percent' : 'flat';
      for (const entry of valuesByUnit(value, stat, mode)) {
        const quantity = type === 'stat-malus' ? -Math.abs(entry.quantity) : entry.quantity;
        const condition = JSON.stringify([effect.condition ?? null, effect.trigger ?? null, effect.duration ?? effect.effectDuration ?? null,
          effect.target ?? null, effect.stacking ?? null, effect.grantsUmbra ?? null]);
        const id = JSON.stringify([stat, entry.unit, condition]);
        const group = groups.get(id) || { stat, unit: entry.unit, quantity: 0, hints: effect, condition, sources: [] };
        group.quantity += quantity;
        group.sources.push(type);
        groups.set(id, group);
      }
    }
  }
  return [...groups.values()].filter(entry => entry.quantity !== 0);
}

function premiumDetail(stat, score, source = stat) {
  return { stat, quantity: 1, unit: 'premium', kind: 'premium', coefficient: score, power: score,
    score, category: 'utility', fallback: false, path: [source], iterations: 1 };
}

export function evaluatePowerEffects(effects, { premiums = true } = {}) {
  const details = normalizePowerEffects(effects).map(entry => {
    const definition = getPowerStatDefinition(entry.stat, entry.hints);
    const sign = POWER_RULES.lowerIsBetter.includes(entry.stat) ? -1 : 1;
    const coefficient = definition.coefficient * (entry.unit === 'percent' ? POWER_RULES.percentMultiplier : POWER_RULES.unitScales[entry.stat] ?? 1);
    return { ...definition, ...entry, kind: definition.nature, coefficient, power: coefficient,
      score: roundPower(entry.quantity * coefficient * sign), iterations: 1 };
  });
  if (premiums) {
    const granted = new Set();
    for (const detail of [...details]) {
      if (detail.quantity <= 0 || detail.unit === 'percent' || granted.has(detail.stat)) continue;
      let premium;
      if (detail.nature === 'umbra' && detail.hints?.grantsUmbra !== false && detail.rank >= 2) premium = POWER_RULES.premiums[`umbra${detail.rank}`];
      if (own(POWER_RULES.premiums, detail.stat)) premium = POWER_RULES.premiums[detail.stat];
      if (premium !== undefined) {
        details.push(premiumDetail(`${detail.stat}:access`, premium, detail.stat));
        granted.add(detail.stat);
      }
    }
  }
  return finishPower(details);
}

export function finishPower(details, extra = {}) {
  const exact = details.reduce((sum, row) => sum + row.score, 0);
  const valued = details.filter(row => row.stat !== 'rounding' && row.stat !== 'scoreCap');
  const positiveScore = integerPower(valued.reduce((sum, row) => sum + (row.breakdown?.positiveScore ?? Math.max(0, row.score)), 0));
  const negativeScore = integerPower(valued.reduce((sum, row) => sum + (row.breakdown?.negativeScore ?? Math.max(0, -row.score)), 0));
  details = details.map(row => ({ ...row, score: integerPower(row.score) }));
  const score = integerPower(exact);
  const correction = score - details.reduce((sum, row) => sum + row.score, 0);
  if (correction) details.push({ ...premiumDetail(Math.abs(exact) > TACTICAL_RULES.maxScore ? 'scoreCap' : 'rounding', correction) });
  return {
    version: POWER_RULES.version, score, positiveScore, negativeScore, details,
    quality: qualityFromPower(score), equivalentLevel: equivalentPowerLevel(score),
    provisional: true, fallbacks: details.flatMap(row => row.breakdown?.fallbacks || (row.fallback ? [{ stat: row.stat, path: row.path }] : [])),
    categories: groupPowerByCategory(details), negativeDiscount: 0, lineMixMultiplier: 1,
    saturated: Math.abs(exact) > TACTICAL_RULES.maxScore, ...extra,
  };
}

export function equivalentPowerLevel(score) {
  return Math.min(POWER_RULES.maxLevel, Math.max(1, Math.ceil(Math.max(0, powerNumber(score)) / POWER_RULES.pointsPerLevel)));
}

export function qualityFromPower(score) {
  return POWER_RULES.qualityByPower.reduce((quality, threshold, index) => score >= threshold ? index : quality, 0);
}

export function getScoredItemQuality(item, result = null) {
  if (item?.itemQuality !== undefined && item?.itemQuality !== null && Number.isFinite(Number(item.itemQuality))) return Number(item.itemQuality);
  if (Number.isFinite(item?.generatedPowerQuality)) return item.generatedPowerQuality;
  return (result || evaluateItemPower(item)).quality;
}

export function evaluateItemPower(item = {}, { fullReserve = false } = {}) {
  const effects = (Array.isArray(item.Stuffeffets) ? item.Stuffeffets : []).flatMap(effect =>
    effect?.stats && typeof effect.stats === 'object'
      ? Object.entries(effect.stats).map(([stat, value]) => ({ ...effect, stats: undefined, stat, value })) : [effect]).filter(Boolean);
  const armorEntries = effects.filter(effect => effect.type === 'stat-buff' && powerStatKey(effect.stat) === 'armor');
  const stocks = getStuffResourceStocks(item);
  const remaining = effects.filter(effect => !armorEntries.includes(effect)).flatMap(effect => {
    if (effect.type !== 'stat-buff') return [effect];
    if (effect.stat === 'fadedLife' && stocks.fadedLife && powerNumber(effect.value?.current ?? effect.value?.max ?? effect.value?.flat ?? effect.value) > 0) return [];
    if (['extraLife', 'eternalLife'].includes(effect.stat) && stocks[effect.stat]) return [];
    if (effect.stat === 'shift' && effect.value && typeof effect.value === 'object' && 'current' in effect.value) {
      return [{ ...effect, value: effect.value.max || 0 }];
    }
    return [effect];
  });
  for (const [stat, stock] of Object.entries(stocks)) {
    remaining.push({ type: 'stat', stat, value: fullReserve ? stock.max : stock.current });
  }
  if (armorEntries.length) {
    const initial = armorEntries.reduce((sum, effect) => {
      const value = effect.value ?? effect.amount ?? 0;
      return sum + Math.max(0, powerNumber(typeof value === 'object' ? value.max ?? value.current ?? value.flat : value));
    }, 0);
    const current = !fullReserve && item.armorReserve ? powerNumber(item.armorReserve.current) : initial;
    remaining.push({ type: 'stat', stat: 'armor', value: Math.max(0, current) });
  }
  const result = evaluatePowerEffects(remaining);
  const details = [...result.details];
  for (const effect of remaining) {
    if (effect.stat || effect.umbra || effect.umbraKey || effect.type === 'none') continue;
    const definition = getPowerStatDefinition(effect.type, effect);
    details.push({ ...premiumDetail(effect.type || 'unknown-effect', definition.coefficient),
      fallback: true, path: definition.path });
  }
  const types = Array.isArray(item.itemType) ? item.itemType : [item.itemType];
  if (types.includes('stuff') || effects.length) details.push(premiumDetail('equipment', POWER_RULES.premiums.equipment));
  const itemEffects = new Set(Array.isArray(item.effets) ? item.effets : []);
  const amounts = [];
  if (itemEffects.has('itemHeal') || itemEffects.has('itemRez')) amounts.push({ stat: 'heal', value: item.HealAmount ?? 0 });
  if (itemEffects.has('itemMovement')) amounts.push({ stat: 'shift', value: item.MovementAmount ?? 0 });
  if (itemEffects.has('itemFadedLife')) amounts.push({ stat: 'fadedLife', value: item.FadedLifeAmount ?? 0 });
  if (itemEffects.has('itemExtraLife')) amounts.push({ stat: 'fadedLife', value: item.ExtraLifeAmount ?? 0 });
  if (itemEffects.has('itemEternalLife')) amounts.push({ stat: 'fadedLife', value: item.EternalLifeAmount ?? 0 });
  if (itemEffects.has('itemDamage')) {
    for (const key of ['physicalDamage', 'MagicDamage', 'magicalDamage', 'piercingDamage', 'hybridalDamage']) {
      if (own(item, key)) amounts.push({ stat: key, value: item[key] });
    }
  }
  for (const key of ['battleSlotBonus', 'bagSlotBonus']) if (item[key]) amounts.push({ stat: key, value: item[key] });
  details.push(...evaluatePowerEffects(amounts).details);
  for (const effect of itemEffects) {
    if (['none', 'itemHeal', 'itemDamage', 'itemMovement', 'itemFadedLife', 'itemExtraLife', 'itemEternalLife'].includes(effect)) continue;
    const score = effect === 'itemRez' ? POWER_RULES.premiums.resurrectionItem : POWER_RULES.unknownCoefficient;
    details.push({ ...premiumDetail(effect, score), fallback: effect !== 'itemRez', path: [effect, effect === 'itemRez' ? 'resurrectionItem' : 'effect-fallback'] });
  }
  if (item.tacticalConsequence || item.tacticalEffects || effects.some(effect => effect.tacticalConsequence || effect.tacticalEffects)) {
    const collected = collectTacticalConsequences({ ...item, effets: [], selfEffects: [],
      tacticalEffects: [...(Array.isArray(item.tacticalEffects) ? item.tacticalEffects : []), ...effects] }, { source: `item:${item.itemId || item.serial || 'anonymous'}` });
    if (item.tacticalEffects && !Array.isArray(item.tacticalEffects)) collected.diagnostics.push({ reason: 'groupes-invalides', path: ['item'] });
    const quantitative = details.filter(row => row.unit !== 'premium').reduce((sum, row) => sum + row.score, 0);
    const amountScore = stat => amounts.filter(row => row.stat === stat).reduce((sum, row) => sum + powerNumber(row.value) * getPowerStatDefinition(stat).coefficient, 0);
    const tactical = evaluateTacticalPower(collected, { attack: quantitative, healing: amountScore('heal'),
      damage: ['physicalDamage', 'MagicDamage', 'magicalDamage', 'piercingDamage', 'hybridalDamage'].reduce((sum, stat) => sum + amountScore(stat), 0) },
      { covered: ['dps', 'hps'] });
    if (itemEffects.has('itemRez') && tactical.rows.some(row => row.keyword === 'resurrection')) {
      const index = details.findIndex(row => row.stat === 'itemRez');
      if (index >= 0) details.splice(index, 1);
    }
    details.push(...tacticalPowerDetails(tactical, 'item'));
    if (tactical.incomplete) details.push({ ...premiumDetail('attackEffect', POWER_RULES.unknownCoefficient, 'item:tactical'), fallback: true });
    return finishPower(details, { tactical });
  }
  return finishPower(details);
}

export function evaluateEntityPower(entity, { equipment = [], rates = null } = {}) {
  const base = entity?.baseStats || entity?.stats || {};
  // Base speed is an action duration, already priced through DPS/HPS, not a penalty.
  const effects = Object.entries(base).filter(([key]) => !['armor', 'speed'].includes(key) && !isUmbraRestricted(entity, key))
    .filter(([, value]) => typeof value === 'number' || (value && typeof value === 'object' && ('current' in value || 'max' in value)))
    .map(([stat, value]) => ({ stat, value }));
  const durable = entity?.modifierStats?.durable || {};
  // Match the combat engine's durable sources; archetypeMeta is bookkeeping,
  // while equipment and derived effects are already valued separately.
  for (const source of ['level', 'adminLevel', 'archetype', 'statLeveled']) {
    const modifier = durable[source];
    if (!modifier || typeof modifier !== 'object') continue;
    for (const [stat, value] of Object.entries(modifier)) {
      if (stat !== 'armor' && !isUmbraRestricted(entity, stat) && (typeof value === 'number' || value?.flat !== undefined || value?.percent !== undefined)) effects.push({ stat, value });
    }
  }
  const externalArmor = entity?.armorLayers?.external?.current
    ?? (equipment.length ? 0 : entity?.stats?.armor?.current ?? (typeof base.armor === 'number' ? base.armor : base.armor?.current)) ?? 0;
  const orfevreArmor = Object.values(entity?.armorLayers?.stuff || {}).reduce((sum, layer) => sum + Math.max(0, powerNumber(layer.current) - powerNumber(layer.reserve?.current)), 0);
  if (externalArmor || orfevreArmor) effects.push({ stat: 'armor', value: externalArmor + orfevreArmor });
  const ownResult = evaluatePowerEffects(effects);
  const details = [...ownResult.details];
  const ownRates = rates?.intrinsic || rates;
  if (ownRates) {
    if (ownRates.dps) details.push({ ...premiumDetail('dps', ownRates.dps * POWER_RULES.dpsCoefficient), quantity: ownRates.dps, coefficient: POWER_RULES.dpsCoefficient, category: 'attack' });
    if (ownRates.hps) details.push({ ...premiumDetail('hps', ownRates.hps * POWER_RULES.hpsCoefficient), quantity: ownRates.hps, coefficient: POWER_RULES.hpsCoefficient, category: 'utility' });
    const count = Math.max(0, (ownRates.attackCount || 0) - 1);
    if (count) details.push({ ...premiumDetail('additionalAttack', count * POWER_RULES.premiums.additionalAttack), quantity: count, coefficient: POWER_RULES.premiums.additionalAttack });
    if (ownRates.tactical) details.push(...tacticalPowerDetails(ownRates.tactical, 'attacks'));
    if (ownRates.summonNonRatePower) details.push(premiumDetail('summonPotential', ownRates.summonNonRatePower));
    if (ownRates.inheritedTacticalPower) details.push(premiumDetail('summonTactical', ownRates.inheritedTacticalPower));
    if (!ownRates.tactical && ownRates.resurrectionCount) details.push({ ...premiumDetail('resurrectionSpell', ownRates.resurrectionCount * POWER_RULES.premiums.resurrectionSpell), quantity: ownRates.resurrectionCount, coefficient: POWER_RULES.premiums.resurrectionSpell });
    for (const key of ownRates.unmeasured || []) details.push({ ...premiumDetail('attackEffect', POWER_RULES.unknownCoefficient, key), fallback: true });
  }
  const seen = new Set();
  for (const item of equipment) {
    const id = item?.equippedId || item?.itemId || item;
    if (!item || seen.has(id)) continue;
    seen.add(id);
    const result = evaluateItemPower(item);
    details.push({ ...premiumDetail('equippedItem', result.score, String(id)), itemId: id, breakdown: result });
  }
  return finishPower(details, { intrinsicScore: integerPower(details.filter(row => row.stat !== 'equippedItem').reduce((sum, row) => sum + row.score, 0)), rates });
}

export function tacticalPowerDetails(tactical, source) {
  return tactical.rows.filter(row => row.floor || row.bonus).map(row => ({
    ...premiumDetail(`tactical:${row.keyword}`, row.floor + row.bonus, source),
    tactical: row, coefficient: row.coefficient, quantity: row.quantity,
  }));
}

export function evaluateAttackPowerFromRates(rates) {
  const details = [
    { ...premiumDetail('dps', rates.dps * POWER_RULES.dpsCoefficient), quantity: rates.dps, coefficient: POWER_RULES.dpsCoefficient, category: 'attack' },
    { ...premiumDetail('hps', rates.hps * POWER_RULES.hpsCoefficient), quantity: rates.hps, coefficient: POWER_RULES.hpsCoefficient, category: 'utility' },
    ...tacticalPowerDetails(rates.tactical, 'attack'),
  ];
  if (rates.summonNonRatePower) details.push(premiumDetail('summonPotential', rates.summonNonRatePower));
  if (rates.inheritedTacticalPower) details.push(premiumDetail('summonTactical', rates.inheritedTacticalPower));
  for (const key of rates.unmeasured) details.push({ ...premiumDetail('attackEffect', POWER_RULES.unknownCoefficient, key), fallback: true });
  return finishPower(details, { rates });
}

// Schedule legal actions on one actor clock. Projectile arrivals use their own clock.
export function evaluateActionRates(actions, { horizonMs = null } = {}) {
  const usable = (actions || []).filter(action => action && Number.isFinite(action.busyMs) && action.busyMs > 0 && Number.isFinite(action.cooldownMs));
  if (!usable.length) return { dps: 0, hps: 0, directDps: 0, directHps: 0, summonDps: 0, summonHps: 0, attackCount: 0, durationMs: 0, actions: [], incomplete: false };
  const longest = Math.max(...usable.map(action => Math.max(action.busyMs, action.cooldownMs)));
  const horizon = Math.max(1, powerNumber(horizonMs ?? Math.max(POWER_RULES.minimumHorizonMs, longest * POWER_RULES.rateActions), POWER_RULES.minimumHorizonMs));
  const ready = usable.map(() => 0);
  const credits = usable.map(() => 0);
  const counts = usable.map(() => 0);
  const summons = usable.map(() => []);
  let time = 0;
  const impacts = [];
  let iterations = 0;
  while (time < horizon && iterations < POWER_RULES.maxRateActions) {
    const available = usable.map((action, index) => ({ action, index }))
      .filter(({ action, index }) => ready[index] <= time && (!action.summon || !action.summon.maxActive || summons[index].filter(end => end > time).length < action.summon.maxActive));
    available.sort((a, b) => (credits[b.index] + (b.action.weight || 1)) - (credits[a.index] + (a.action.weight || 1)) || a.index - b.index);
    const index = available[0]?.index ?? -1;
    if (index < 0) {
      const future = ready.filter(value => value > time);
      for (const ends of summons) future.push(...ends.filter(value => value > time));
      if (!future.length) break;
      time = Math.min(...future);
      continue;
    }
    const action = usable[index];
    const totalWeight = available.reduce((sum, entry) => sum + (entry.action.weight || 1), 0);
    for (const entry of available) credits[entry.index] += (entry.action.weight || 1) - (entry.index === index ? totalWeight : 0);
    iterations++;
    counts[index]++;
    const impact = time + Math.max(0, powerNumber(action.impactMs));
    if (impact <= horizon) {
      impacts.push({ at: impact, action });
      if (action.summon) {
        const end = Math.min(horizon, impact + Math.max(0, powerNumber(action.summon.durationMs, horizon)));
        summons[index].push(end);
      }
    }
    ready[index] = time + Math.max(0, action.cooldownMs);
    time += action.busyMs;
  }
  const incomplete = iterations >= POWER_RULES.maxRateActions && time < horizon;
  const durationMs = incomplete ? Math.max(1, time) : horizon;
  let damage = 0;
  let healing = 0;
  let summonDamage = 0;
  let summonHealing = 0;
  const contributions = usable.map(() => ({ dps: 0, hps: 0, summonDps: 0, summonHps: 0, summonPresence: 0 }));
  for (const { at, action } of impacts) {
    if (at > durationMs) continue;
    damage += Math.max(0, powerNumber(action.damage));
    healing += Math.max(0, powerNumber(action.healing));
    const contribution = contributions[usable.indexOf(action)];
    contribution.dps += Math.max(0, powerNumber(action.damage));
    contribution.hps += Math.max(0, powerNumber(action.healing));
    if (action.summon) {
      const seconds = Math.max(0, Math.min(durationMs - at, powerNumber(action.summon.durationMs, durationMs))) / 1000;
      summonDamage += seconds * Math.max(0, powerNumber(action.summon.dps));
      summonHealing += seconds * Math.max(0, powerNumber(action.summon.hps));
      contribution.summonDps += seconds * Math.max(0, powerNumber(action.summon.dps));
      contribution.summonHps += seconds * Math.max(0, powerNumber(action.summon.hps));
      contribution.summonPresence += seconds;
    }
  }
  const seconds = durationMs / 1000;
  return {
    dps: (damage + summonDamage) / seconds, hps: (healing + summonHealing) / seconds,
    directDps: damage / seconds, directHps: healing / seconds,
    summonDps: summonDamage / seconds, summonHps: summonHealing / seconds,
    durationMs, requestedDurationMs: horizon, attackCount: usable.length, iterations,
    incomplete,
    actions: usable.map((action, index) => ({ key: action.key, count: counts[index], approximate: !!action.approximate,
      ...Object.fromEntries(Object.entries(contributions[index]).map(([key, value]) => [key, value / seconds])) })),
  };
}

export function getProfanationTemplate(level) {
  return {
    name: 'Aberration Profanée', class: 'aberration-profanee', type: 'sbire',
    sprite: './media/sprites/aberration-profanee.png', level,
    baseStats: { HP: 10, strength: 1, agility: 1, intelligence: 1, physicalDamage: 10, speed: 1000 },
    attacks: ['autoAttack'], isTemporarySummon: true, summonLifetime: 'map-session',
  };
}

export function readOwnedPowerAttacks(entity, catalog = []) {
  const raw = Array.isArray(entity?.attackDetails) ? entity.attackDetails
    : Array.isArray(entity?.attacks) ? entity.attacks : entity?.currentAttack ? [entity.currentAttack] : [];
  const seen = new Set();
  return raw.map(entry => {
    const template = typeof entry === 'string'
      ? catalog.find(attack => [attack.attackKey, attack.functionName, attack.attackId].includes(entry))
      : entry;
    if (!template) return typeof entry === 'string' ? { attackKey: entry, unresolvedPower: true } : null;
    const key = template.entityAttackId || template.attackKey || template.functionName || template.attackId;
    if (!key || seen.has(key)) return null;
    seen.add(key);
    return structuredClone(template);
  }).filter(Boolean);
}

export function createPowerRandom(seed) {
  let state = 2166136261;
  for (const char of String(seed)) state = Math.imul(state ^ char.charCodeAt(0), 16777619) >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

export function buildPowerAction(attack, rate, timings, speed, { isMelee = true } = {}) {
  const prep = Math.max(0, powerNumber(timings.preparationTime));
  const execution = Math.max(0, powerNumber(timings.executionTime));
  const recovery = Math.max(0, powerNumber(timings.recoveryTime));
  const cooldownMs = Math.max(0, powerNumber(timings.cooldown));
  const move = Math.max(1, powerNumber(speed, 1000));
  const baseBusy = prep + recovery + move + (isMelee ? Math.max(200, execution) : 0);
  let busyMs = baseBusy;
  if (rate?.ambidextryChance && isMelee) {
    const repeatedBusy = prep + Math.max(Math.max(200, execution), rate.secondDelay + Math.max(120, execution)) + recovery + move;
    busyMs += (1 - (rate.brokenChance || 0)) * rate.ambidextryChance * (repeatedBusy - baseBusy);
  }
  return {
    key: attack.entityAttackId || attack.attackKey || attack.functionName || attack.attackId,
    priority: Math.max(0, powerNumber(attack.priority ?? attack.attackPriority)),
    cooldownMs, busyMs: Math.max(1, busyMs),
    impactMs: move + prep + Math.max(isMelee ? 200 : 1, execution),
    damage: rate?.expectedDamage || 0, healing: rate?.expectedHealing || 0,
  };
}

export function summarizePowerSamples(samples) {
  const rows = (samples || []).filter(row => Number.isFinite(row?.dps) && Number.isFinite(row?.hps));
  if (!rows.length) return { dps: 0, hps: 0, samples: 0, incomplete: true };
  const mean = key => rows.reduce((sum, row) => sum + row[key], 0) / rows.length;
  const dps = mean('dps');
  const hps = mean('hps');
  const spread = (key, average) => Math.sqrt(rows.reduce((sum, row) => sum + (row[key] - average) ** 2, 0) / rows.length);
  return {
    dps, hps, samples: rows.length,
    dpsMin: Math.min(...rows.map(row => row.dps)), dpsMax: Math.max(...rows.map(row => row.dps)),
    hpsMin: Math.min(...rows.map(row => row.hps)), hpsMax: Math.max(...rows.map(row => row.hps)),
    dpsDeviation: spread('dps', dps), hpsDeviation: spread('hps', hps),
    incomplete: rows.some(row => row.incomplete),
  };
}

export function evaluateEncounterPower(entries) {
  const ids = new Set((entries || []).map(entry => String(entry.entity?.id)));
  const included = (entries || []).filter(entry => {
    const owner = entry.entity?.summonOrigin?.casterId;
    return owner == null || !ids.has(String(owner));
  });
  const details = included.map(entry => ({
    ...premiumDetail('entity', powerNumber(entry.power?.score), String(entry.entity?.id)),
    breakdown: entry.power,
  }));
  return finishPower(details, { entityCount: included.length, summoningIncluded: true });
}

export function groupPowerByCategory(details = []) {
  const totals = { attack: 0, defense: 0, utility: 0 };
  for (const detail of details) {
    if (detail.breakdown?.details) {
      const nested = groupPowerByCategory(detail.breakdown.details);
      for (const key of Object.keys(totals)) totals[key] += nested[key];
    } else {
      const key = own(totals, detail.category) ? detail.category : 'utility';
      totals[key] += powerNumber(detail.score);
    }
  }
  for (const key of Object.keys(totals)) totals[key] = roundPower(totals[key]);
  return totals;
}



export function describePowerUncertainty(rates) {
  return buildPowerUncertaintyHelper(rates, { roundPower });
}

export function getPowerBreakdownLines(result) {
  return buildPowerBreakdownHelper(result, { roundPower, powerLabels: POWER_HELPER_LABELS, metadata, describePowerUncertainty, TACTICAL_RULES });
}
