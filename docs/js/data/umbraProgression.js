// Réglages et calculs communs au jeu et à Index 14 / Maj.
// Modifier ici la limite, les courbes ou les bases ; balanceData.js les réutilise.
// Classic script compatible with file://; no DOM, storage or game bootstrap.
(() => {
  'use strict';
  if (globalThis.umbraProgression) return;
  const defaultUmbraThreshold = 150;
  function getUmbraThreshold(entity) {
    const threshold = Number(entity?.seuilUmbra ?? defaultUmbraThreshold);
    return Number.isFinite(threshold) && threshold >= 0 ? threshold : defaultUmbraThreshold;
  }
  const progression = {
      // Largeur des cycles de ratio ; la limite normale vient de chaque entité.
      limit: 150,
      levelOverflowRate: 0.10,
      otherOverflowRate: 0.50,
      crystalRate: 1,
      // Un cycle garde sa largeur propre. +85 % de la base sur un cycle normal.
      curve: { profile: 'exp', intensity: 2.5, gainPercent: 85, residualPercent: 0.05 },
      // Surcharges indépendantes possibles : ex. strength: { intensity: 3 }.
      curves: { esoterism: {}, ambidextry: {}, bloodFury: {}, strength: {}, vigueur: {}, intelligence: {}, esprit: {}, agility: {}, finesse: {}, constitution: {}, integrite: {}, adresse: {}, vision: {}, criticalPower: {}, resilience: {}, equilibre: {}, vivacite: {}, robustness: {}, astrality: {} },
    };
  // Conversions physique et magique indépendantes de la limite d'acquisition.
  const resistanceCurve = { constant: 150, physicalConstant: 70, magicalConstant: 70, maxPercent: 99 };
  const dodgeCurve = { constant: 98, maxPercent: 99 };
  // Direct passive percentage: the first Vision point grants 1%; Agility
  // accelerates the remaining progression without moving that first point.
  const bullsEyeCurve = { constant: 98, maxPercent: 99, firstPointPercent: 1, agilityInfluence: 1 };
  const precisionCurve = { firstPointPercent: 5, minPercent: 5, maxPercent: 80, growthK: 0.025, decimals: 1 };
  const vision = { bullsEyeCurve };
  const critical = {
    chanceCurve: { constant: 98, maxPercent: 99, ratios: { source: 1, attribute: 0.5 } },
    damage: { nativeBasePercent: 50, sourceRatio: 1 },
  };
  // The three resistances share the same curve and base ratios; only their
  // supporting attribute differs. Exclusive cancellation has its own ratio.
  const resilienceCurve = { constant: 98, maxPercent: 99 };
  const resilience = {
    criticalResistance: { ...resilienceCurve, attribute: 'strength', ratios: { source: 1, attribute: 0.5 } },
    alterationResistance: { ...resilienceCurve, attribute: 'intelligence', ratios: { source: 1, attribute: 0.5 } },
    hindranceResistance: { ...resilienceCurve, attribute: 'agility', ratios: { source: 1, attribute: 0.5 } },
    // Exclusive cancellation has its own spread and requires Resilience.
    resilienceTotal: { ...resilienceCurve, constant: 25, attribute: 'strength', sourceRatio: 0.25, attributeInfluence: 1 },
  };
  const equilibre = {
    equilibreAggroBonus: { constant: 98, maxPercent: 99, attribute: 'strength', ratios: { source: 1, attribute: 0.5 } },
    equilibreAggroReduction: { constant: 98, maxPercent: 60, attribute: 'intelligence', ratios: { source: 1, attribute: 0.5 } },
    equilibreInvisibleDetection: { constant: 98, maxPercent: 99, attribute: 'agility', ratios: { source: 1, attribute: 0.5 } },
    equilibreBalancedAttackChance: { constant: 25, maxPercent: 40, attribute: 'intelligence', sourceRatio: 0.25, attributeInfluence: 1 },
  };
  const vivacite = {
    velocity: { target: 'velocity', attribute: 'agility', decimals: 6, ratioPercent: true,
      constant: 98, maxPercent: 65, ratios: { source: 1, attribute: 0.5 } },
    controlledSpeed: { constant: 25, maxPercent: 99, attribute: 'agility', sourceRatio: 0.25, attributeInfluence: 1 },
    retreat: { basePercent: 50, maxPercent: 99 },
    movementRecoilPercent: 20,
  };
  // Réglages d’Astralité, partagés par le combat, les helpers et index-14.
  // Les bases multiplient les courbes propres d’Astralité et de l’attribut.
  const astrality = {
    fatalSurvival: { maxPercent: 99, firstPointPercent: 1, ratios: { source: 1, attribute: 0.5 } },
    // Même délai pour toutes les sources de Survie fatale. Seule l’Umbra
    // permet à l’Agilité de le réduire ; aucun délai supplémentaire après le soin.
    astralCooldown: { baseSeconds: 5, minSeconds: 2, constant: 98, attributeRatio: 0.5 },
    // La Force seule augmente le budget. Il est versé pendant le cooldown astral.
    astralReturn: { basePercent: 10, maxPercent: 99, constant: 98,
      ratios: { attribute: 0.5 },
      // HP distribués par versement, selon le budget total de soin.
      ticks: [{ from: 0, amount: 1 }, { from: 100, amount: 2 }, { from: 300, amount: 3 }] },
    // Jet seulement à l’état inactif ; l’attente repart à la fin de l’effet.
    astralBody: { maxPercent: 25, firstPointPercent: 1, ratios: { source: 1, attribute: 0.5 },
      checkSeconds: 3, baseDurationSeconds: 3, opacity: 0.5 },
  };
  const transcendence = {
    extraLife: { referencePoints: 150, referenceLives: 7, exponent: 0.4626 },
    // 150 Transcendance / 150 Intelligence => 10,24 %, with the shared ratio 1,85.
    consoProtection: { maxPercent: 99, constant: 2405.361328125,
      sourceRatio: 1, attribute: 'intelligence', attributeInfluence: 1, ratioDecimals: 4 },
    cooldown: { baseSeconds: 5, minSeconds: 2, constant: 98, attributeRatio: 0.5 },
  };
  // Fixed calibration: chance 12.4% at 10/0 and 20% at 1/35;
  // damage 20% base + 20% from Ambidextrie + 75% from Agility at 150/150.
  // Changing the entity limit or a curve never renormalizes these coefficients.
  const ambidextry = {
    chance: { constant: 98, maxPercent: 99, ratioDecimals: 4,
      ratios: { source: 1.228578840119629, attribute: 0.47771102717543173 } },
    damage: { basePercent: 20, ratioDecimals: 4,
      ratios: { source: 20 / (150 * 1.85), attribute: 75 / (150 * 1.85) } },
  };
  function ambidextryChanceDetails(points, agility = 0, limit = defaultUmbraThreshold) {
    return ratioPercentDetails('ambidextry', 'agility', points, agility, 0, 0, ambidextry.chance, limit);
  }
  function ambidextryDamageDetails(points, agility = 0, limit = defaultUmbraThreshold) {
    points = Math.max(0, capacity(points)); agility = Math.max(0, capacity(agility));
    const cfg = ambidextry.damage, active = points > 0;
    const part = (stat, count, base) => {
      const ratio = base * getProgressiveRatio(count, stat, limit);
      const value = active ? count * ratio : 0;
      return { stat, value, unit: ' %', rounded: false,
        compact: { source: { stat, value: count }, multiplier: { stat, value: active ? ratio : 0, decimals: cfg.ratioDecimals } } };
    };
    const source = part('ambidextry', points, cfg.ratios.source);
    const attribute = part('agility', agility, cfg.ratios.attribute);
    const base = active ? cfg.basePercent : 0;
    return { points, agility, limit, active, base, source, attribute, value: base + source.value + attribute.value };
  }
  // Preserve 95% magical reduction at 150 Agility (shared curve 1.85).
  // Piercing uses exactly half the resolved magical reduction, not half a score.
  const esoterism = {
    chance: { constant: 98, maxPercent: 99, firstPointPercent: 2, ratioDecimals: 4, ratios: { source: 1, attribute: 0 } },
    reduction: { basePercent: 40, maxPercent: 99, constant: 98, attributeRatio: 98 * 55 / (4 * 150 * 1.85), ratioDecimals: 4 },
    piercing: { constant: 98, maxPercent: 99, ratioDecimals: 4, ratios: { source: 0, attribute: 0.5 }, reductionRatio: 0.5 },
    cooldown: { baseSeconds: 5, minSeconds: 2, constant: 98, attributeRatio: 0.5 },
  };
  function esoterismChanceDetails(points, limit = defaultUmbraThreshold) {
    const result = ratioPercentDetails('esoterism', 'intelligence', points, 0, 0, 0, esoterism.chance, limit);
    const minimum = points > 0 ? Math.min(result.max, Math.max(0, esoterism.chance.firstPointPercent)) : 0;
    if (result.value < minimum) {
      result.source.value = result.value = result.generated = minimum;
      result.source.compact.multiplier.value = minimum / points;
    }
    return result;
  }
  function esoterismReductionDetails(points, agility = 0, limit = defaultUmbraThreshold) {
    points = Math.max(0, capacity(points)); agility = Math.max(0, capacity(agility));
    const cfg = esoterism.reduction, active = points > 0;
    const ratio = cfg.attributeRatio * getProgressiveRatio(agility, 'agility', limit);
    const weight = Math.min(Number.MAX_VALUE, agility * ratio);
    const base = active ? cfg.basePercent : 0;
    const bonus = active && weight > 0 ? (cfg.maxPercent - base) / (1 + cfg.constant / weight) : 0;
    const value = active ? Math.min(cfg.maxPercent - Number.EPSILON * cfg.maxPercent, base + bonus) : 0;
    const attribute = { stat: 'agility', value: value - base, unit: ' %', rounded: false,
      compact: { source: { stat: 'agility', value: agility }, multiplier: { stat: 'agility', value: agility > 0 ? (value - base) / agility : 0, decimals: cfg.ratioDecimals } } };
    return { ...cfg, points, agility, limit, active, base, weight, ratio, value, attribute,
      piercingValue: value * esoterism.piercing.reductionRatio };
  }
  function esoterismPiercingDetails(points, strength = 0, limit = defaultUmbraThreshold) {
    return ratioPercentDetails('esoterism', 'strength', points, strength, 0, 0, esoterism.piercing, limit);
  }
  function esoterismCooldownDetails(points, intelligence = 0, settings = esoterism.cooldown, limit = defaultUmbraThreshold) {
    return passiveCooldownDetails(points, intelligence, 'intelligence', settings, limit);
  }
  const blood = {
    thirsty: { constant: 98, maxPercent: 99, ratios: { source: 1, attribute: 0.5 } },
    furyExecution: {
      chance: { constant: 98, maxPercent: 99, sourceRatio: 0.5, attribute: 'strength', attributeInfluence: 1 },
      threshold: { constant: 98, basePercent: 10, maxPercent: 50, sourceRatio: 0.5 },
      damage: { constant: 98, basePercent: 200, maxPercent: 600, attributeRatio: 0.5 },
    },
  };
  function bloodThirstyDetails(points, strength = 0, normal = 0, plus = 0, settings = blood.thirsty, limit = defaultUmbraThreshold) {
    return ratioPercentDetails('bloodFury', 'strength', points, strength, normal, plus, settings, limit);
  }
  // Execution parameters are generated only by the active Umbra. Autonomous
  // inputs never add to them. Combat and presentation consume this same result.
  function bloodFuryExecutionDetails(points, strength = 0, physicalDamage = 0, limit = defaultUmbraThreshold) {
    points = Math.max(0, capacity(points)); strength = Math.max(0, capacity(strength));
    physicalDamage = Math.max(0, capacity(physicalDamage));
    const cfg = blood.furyExecution, active = points > 0;
    const chance = exclusivePercentDetails('bloodFury', points, strength, cfg.chance, limit);
    const sourceRatio = cfg.threshold.sourceRatio * getProgressiveRatio(points, 'bloodFury', limit);
    const attributeRatio = cfg.damage.attributeRatio * getProgressiveRatio(strength, 'strength', limit);
    const bounded = (weight, settings) => {
      weight = Math.min(Number.MAX_VALUE, weight);
      const progress = weight > 0 ? 1 / (1 + settings.constant / weight) : 0;
      return { ...settings, weight, progress, percent: active
        ? Math.min(settings.maxPercent - Number.EPSILON * settings.maxPercent,
          settings.basePercent + (settings.maxPercent - settings.basePercent) * progress) : 0 };
    };
    const threshold = { ...bounded(points * sourceRatio, cfg.threshold), sourceRatio };
    const damage = { ...bounded(strength * attributeRatio, cfg.damage), attributeRatio, physicalDamage };
    damage.value = active ? Math.ceil(physicalDamage * (damage.percent / 100)) : 0;
    return { points, strength, limit, active, chance, threshold, damage };
  }
  // Fixed calibration: 15% at 150 source / 150 Force, whose ratios are 1.85.
  // Neither later curve edits nor the owner's point limit renormalize these bases.
  const indestructibilityRatio = (98 * 15 / (99 - 15)) / (150 * 1.85 * 3);
  const indestructibility = {
    chance: { constant: 98, maxPercent: 99, ratioDecimals: 4, ratios: { source: 1, attribute: 0 } },
    reduction: { constant: 98, maxPercent: 99, ratioDecimals: 4,
      ratios: { source: indestructibilityRatio, attribute: indestructibilityRatio * 2 } },
    regeneration: { constant: 98, maxPercent: 99, firstPointPercent: 1, ratioDecimals: 4,
      ratios: { source: indestructibilityRatio * 2, attribute: indestructibilityRatio } },
    cooldown: { baseSeconds: 5, minSeconds: 2, constant: 98, attributeRatio: 0.5 },
  };
  function indestructibilityChanceDetails(points, limit = defaultUmbraThreshold) {
    const detail = ratioPercentDetails('indestructibility', 'strength', points, 0, 0, 0, indestructibility.chance, limit);
    return { ...detail, points: Math.max(0, capacity(points)), limit };
  }
  function indestructibilityReductionDetails(points, strength = 0, limit = defaultUmbraThreshold) {
    return ratioPercentDetails('indestructibility', 'strength', points, strength, 0, 0, indestructibility.reduction, limit);
  }
  function indestructibilityRegenDetails(points, strength = 0, normal = 0, plus = 0, settings = indestructibility.regeneration, limit = defaultUmbraThreshold) {
    const detail = ratioPercentDetails('indestructibility', 'strength', points, strength, normal, plus, settings, limit);
    const minimum = points > 0 ? Math.min(detail.max, Math.max(0, Number(settings.firstPointPercent) || 0)) : 0;
    if (detail.generated >= minimum) return detail;
    // The first Umbra point guarantees 1%; preserve exact source attribution.
    detail.source.value += minimum - detail.generated;
    detail.source.compact.multiplier.value = detail.source.value / points;
    detail.generated = minimum;
    const fixed = Math.max(0, Math.min(detail.max, minimum + capacity(normal)));
    detail.value = Math.max(0, Math.min(detail.max, minimum + capacity(normal) + capacity(plus)));
    detail.normalApplied = fixed - minimum;
    detail.plusApplied = detail.value - fixed;
    return detail;
  }
  function indestructibilityCooldownDetails(points, strength = 0, settings = indestructibility.cooldown, limit = defaultUmbraThreshold) {
    return passiveCooldownDetails(points, strength, 'strength', settings, limit);
  }
  const hypercognition = {
    explosion: { attribute: 'intelligence', ratios: { source: 1, attribute: 0.5 }, flatPerPoint: 1, ratioDecimals: 4 },
    // Fixed base ratio calibrated to ten essences at 150 × 1.85. Changing
    // a curve or the owner's limit must not renormalize this coefficient.
    essences: { ratio: 10 / (150 * 1.85), firstPoint: 1, firstCount: 1, maxCount: 10 },
  };
  function hypercognitionExplosionDetails(points, intelligence = 0, limit = defaultUmbraThreshold) {
    const cfg = hypercognition.explosion;
    points = Math.max(0, capacity(points));
    const source = progressivePowerPart('hypercognition', points, cfg.ratios.source, true, limit);
    const attribute = progressivePowerPart(cfg.attribute, points > 0 ? capacity(intelligence) : 0, cfg.ratios.attribute, true, limit);
    const direct = points * cfg.flatPerPoint;
    return { points, limit, direct, source, attribute, value: round(direct + source.value + attribute.value) };
  }
  function hypercognitionEssenceDetails(points, limit = defaultUmbraThreshold) {
    const cfg = hypercognition.essences;
    points = Math.max(0, capacity(points));
    const multiplier = getProgressiveRatio(points, 'hypercognition', limit);
    const coefficient = cfg.ratio * multiplier;
    const raw = points * coefficient;
    const whole = Math.floor(raw + Number.EPSILON * Math.max(1, raw) * 4);
    const value = points < cfg.firstPoint ? 0 : Math.min(cfg.maxCount, Math.max(cfg.firstCount, whole));
    return { points, limit, ...cfg, multiplier, coefficient, raw, value };
  }
  function transcendenceDetails(points, intelligence = 0, settings = transcendence.consoProtection, limit = defaultUmbraThreshold) {
    return exclusivePercentDetails('transcendence', points, intelligence, settings, limit);
  }
  function transcendenceExtraLifeDetails(points, limit = defaultUmbraThreshold) {
    const cfg = transcendence.extraLife;
    points = Math.max(0, capacity(points)); limit = Math.max(0, capacity(limit));
    const curve = value => cfg.referenceLives * Math.pow(value / cfg.referencePoints, cfg.exponent);
    const normal = curve(Math.min(points, limit));
    const residualRate = ({ ...progression.curve, ...progression.curves.transcendence }).residualPercent / 100;
    const raw = normal + (curve(points) - normal) * residualRate;
    return { points, limit, raw, normal, residualRate, ...cfg,
      value: points > 0 ? Math.max(1, Math.round(raw)) : 0 };
  }
  function transcendenceCooldownDetails(points, intelligence = 0, settings = transcendence.cooldown, limit = defaultUmbraThreshold) {
    return passiveCooldownDetails(points, intelligence, 'intelligence', settings, limit);
  }
  // Calibrate the first source point with no attribute to exactly 1%, even
  // when the shared curve is edited. Autonomous + keeps its fixed base.
  function astralityChanceDetails(points, intelligence = 0, normal = 0, plus = 0, settings = astrality.fatalSurvival, limit = defaultUmbraThreshold) {
    const firstWeight = settings.ratios.source * getProgressiveRatio(1, 'astrality', limit);
    const constant = firstWeight * (settings.maxPercent / Math.max(Number.EPSILON, settings.firstPointPercent) - 1);
    return ratioPercentDetails('astrality', 'intelligence', points, intelligence, normal, plus, { ...settings, constant }, limit);
  }
  function astralCooldownDetails(points, agility = 0, settings = astrality.astralCooldown, limit = defaultUmbraThreshold) {
    return { ...passiveCooldownDetails(points, agility, 'agility', settings, limit), agility: Math.max(0, capacity(agility)) };
  }
  function passiveCooldownDetails(points, attributePoints, attribute, settings, limit) {
    points = Math.max(0, capacity(points)); attributePoints = Math.max(0, capacity(attributePoints));
    const attributeRatio = settings.attributeRatio * getProgressiveRatio(attributePoints, attribute, limit);
    const weight = points > 0 ? Math.min(Number.MAX_VALUE, attributePoints * attributeRatio) : 0;
    const progress = weight > 0 ? 1 / (1 + settings.constant / weight) : 0;
    const seconds = settings.baseSeconds - (settings.baseSeconds - settings.minSeconds) * progress;
    return { points, attribute, attributePoints, attributeRatio, weight, progress, seconds,
      baseSeconds: settings.baseSeconds, minSeconds: settings.minSeconds, constant: settings.constant };
  }
  function astralReturnDetails(points, strength = 0, maxHP = 0, agility = 0, settings = astrality.astralReturn, limit = defaultUmbraThreshold) {
    points = Math.max(0, capacity(points)); strength = Math.max(0, capacity(strength));
    const attributeRatio = settings.ratios.attribute * getProgressiveRatio(strength, 'strength', limit);
    const attributeWeight = strength * attributeRatio;
    const weight = Math.min(Number.MAX_VALUE, attributeWeight);
    const progress = weight > 0 ? 1 / (1 + settings.constant / weight) : 0;
    const percent = points > 0 ? settings.basePercent + (settings.maxPercent - settings.basePercent) * progress : 0;
    const cooldown = astralCooldownDetails(points, agility, astrality.astralCooldown, limit);
    const seconds = points > 0 ? cooldown.seconds : 0;
    const amount = Math.max(0, Math.round(Math.max(0, capacity(maxHP)) * percent / 100));
    const tickAmount = [...settings.ticks].reverse().find(tier => amount >= tier.from)?.amount || 1;
    return { points, strength, attributeRatio, attributeWeight, weight, cooldown,
      progress, percent, seconds, amount, tickAmount, maxHP: Math.max(0, capacity(maxHP)),
      maxPercent: settings.maxPercent, basePercent: settings.basePercent, constant: settings.constant };
  }
  function astralBodyDetails(points, intelligence = 0, settings = astrality.astralBody, limit = defaultUmbraThreshold) {
    const chance = astralityChanceDetails(points, intelligence, 0, 0, settings, limit);
    const ratio = getProgressiveRatio(points, 'astrality', limit);
    return { ...chance, value: points > 0 ? chance.value : 0, ratio,
      seconds: points > 0 ? settings.baseDurationSeconds * ratio : 0, checkSeconds: settings.checkSeconds };
  }
  function vivaciteDetails(key, points, agility = 0, normal = 0, plus = 0, settings = vivacite[key], limit = defaultUmbraThreshold) {
    return ratioPercentDetails('vivacite', settings.attribute, points, agility, normal, plus, settings, limit);
  }
  function controlledSpeedDetails(points, agility = 0, settings = vivacite.controlledSpeed, limit = defaultUmbraThreshold) {
    return exclusivePercentDetails('vivacite', points, agility, settings, limit);
  }
  function retreatChance(velocity) {
    return Math.max(0, Math.min(vivacite.retreat.maxPercent, vivacite.retreat.basePercent + capacity(velocity)));
  }
  function velocityTiming(velocity, baseSpeed) {
    const s = Math.max(0, Math.round(capacity(baseSpeed)));
    const percentage = Math.max(0, Math.min(vivacite.velocity.maxPercent, capacity(velocity)));
    const adjustedSpeed = s > 0 ? Math.max(1, Math.round(s * (1 - percentage / 100))) : 0;
    return { adjustedSpeed, speedReduction: Math.max(0, s - adjustedSpeed), reductionRatio: percentage / 100, percentage, seconds: adjustedSpeed / 1000 };
  }
  // Direct percentages. Normal gains have no ratio; + unlocks the fixed
  // Agility base, X uses both progressive curves, just like Vision.
  // Ratio gains approach the asymptote. Autonomous % gains are then pooled
  // directly, as for Bull's Eye, with a single final cap.
  function criticalChanceDetails(power, agility = 0, normal = 0, plus = 0, settings = critical.chanceCurve, limit = defaultUmbraThreshold) {
    return ratioPercentDetails('criticalPower', 'agility', power, agility, normal, plus, settings, limit);
  }
  function resilienceDetails(key, points, attribute = 0, normal = 0, plus = 0, settings = resilience[key], limit = defaultUmbraThreshold) {
    return ratioPercentDetails('resilience', settings.attribute, points, attribute, normal, plus, settings, limit);
  }
  function resilienceCancelDetails(points, strength = 0, settings = resilience.resilienceTotal, limit = defaultUmbraThreshold) {
    return exclusivePercentDetails('resilience', points, strength, settings, limit);
  }
  function equilibreDetails(key, points, attribute = 0, normal = 0, plus = 0, settings = equilibre[key], limit = defaultUmbraThreshold) {
    return ratioPercentDetails('equilibre', settings.attribute, points, attribute, normal, plus, settings, limit);
  }
  function balancedAttackDetails(points, intelligence = 0, settings = equilibre.equilibreBalancedAttackChance, limit = defaultUmbraThreshold) {
    return exclusivePercentDetails('equilibre', points, intelligence, settings, limit);
  }
  function exclusivePercentDetails(origin, points, attributePoints, settings, limit = defaultUmbraThreshold) {
    points = Math.max(0, capacity(points));
    attributePoints = Math.max(0, capacity(attributePoints));
    const max = Math.max(0, Math.min(99, Number(settings.maxPercent)));
    const constant = Math.max(Number.EPSILON, Number(settings.constant) || resilienceCurve.constant);
    const curveRatio = 1 + (getProgressiveRatio(attributePoints, settings.attribute, limit) - 1) * settings.attributeInfluence;
    const weight = Math.min(Number.MAX_VALUE, points * (settings.sourceRatio * curveRatio));
    const percent = weight > 0 ? Math.min(max - Number.EPSILON * max, max / (1 + constant / weight)) : 0;
    // The displayed product really equals the granted percentage.
    return { origin, points, attribute: settings.attribute, attributePoints, influence: settings.attributeInfluence, ratio: points > 0 ? percent / points : 0, curveRatio, max, constant, percent,
      ...(settings.ratioDecimals != null ? { ratioDecimals: settings.ratioDecimals } : {}) };
  }
  function ratioPercentDetails(origin, attributeKey, sourcePoints, attributePoints, normal, plus, settings, limit = defaultUmbraThreshold) {
    const points = Math.max(0, capacity(sourcePoints)), attribute = Math.max(0, capacity(attributePoints));
    const max = Math.max(0, Math.min(99, Number(settings.maxPercent)));
    const constant = Math.max(Number.EPSILON, Number(settings.constant) || 98);
    const sourceRatio = settings.ratios.source * getProgressiveRatio(points, origin, limit);
    const attributeRatio = settings.ratios.attribute * (points > 0 ? getProgressiveRatio(attribute, attributeKey, limit) : 1);
    const sourceWeight = Math.min(Number.MAX_VALUE, points * sourceRatio);
    const attributeWeight = points > 0 || plus > 0 ? Math.min(Number.MAX_VALUE, attribute * attributeRatio) : 0;
    const weight = Math.min(Number.MAX_VALUE, sourceWeight + attributeWeight);
    const generated = weight > 0 ? Math.max(0, Math.min(max - Number.EPSILON * max, max / (1 + constant / weight))) : 0;
    const scale = Math.max(1, sourceWeight, attributeWeight);
    const share = weight > 0 ? (sourceWeight / scale) / (sourceWeight / scale + attributeWeight / scale) : 0;
    const part = (stat, count, value) => ({ stat, value, unit: ' %', rounded: false, rounding: 'nearest',
      compact: { source: { stat, value: count }, multiplier: { stat, value: count > 0 ? value / count : 0, decimals: settings.ratioDecimals } } });
    const source = part(origin, points, Math.max(0, generated) * share);
    const attributePart = part(attributeKey, attribute, Math.max(0, generated) - source.value);
    const fixed = Math.max(0, Math.min(max, generated + capacity(normal)));
    const value = Math.max(0, Math.min(max, generated + capacity(normal) + capacity(plus)));
    const normalApplied = fixed - generated;
    return { value, generated, source, attribute: attributePart,
      normalApplied, plusApplied: value - generated - normalApplied, max, constant, sourceRatio, attributeRatio };
  }
  function criticalDamageDetails(power, limit = defaultUmbraThreshold) {
    return progressivePowerPart('criticalPower', Math.max(0, capacity(power)), critical.damage.sourceRatio, true, limit);
  }
  const sources = {
      vigueur: {
        target: "physicalDamage",
        attribute: "strength",
        decimals: 0,
        ratios: { source: 1, attribute: 0.5 },
        progressive: true,
        flatPerPoint: 1,
      },
      esprit: {
        target: "magicalDamage",
        attribute: "intelligence",
        decimals: 0,
        ratios: { source: 1, attribute: 0.5 },
        progressive: true,
        flatPerPoint: 1,
      },
      finesse: {
        target: "piercingDamage",
        attribute: "agility",
        decimals: 0,
        ratios: { source: 1, attribute: 0.5 },
        progressive: true,
        flatPerPoint: 1,
      },
      robustness: {
        target: 'armor', attribute: 'strength', decimals: 0,
        ratios: { source: 1, attribute: 0.5 },
        progressive: true, flatPerPoint: 1,
      },
      constitution: {
        target: "physicalResistance",
        attribute: "strength",
        decimals: 0,
        ratios: { source: 1, attribute: 0.5 },
        progressive: true,
        flatPerPoint: 1,
        resistance: true,
      },
      integrite: {
        target: "magicalResistance",
        attribute: "intelligence",
        decimals: 0,
        ratios: { source: 1, attribute: 0.5 },
        progressive: true,
        flatPerPoint: 1,
        resistance: true,
      },
      adresse: {
        target: 'dodge', attribute: 'agility', decimals: 0,
        ratios: { source: 1, attribute: 0.5 },
        progressive: true, flatPerPoint: 1, dodge: true,
      },
      vision: {
        target: 'precision', attribute: 'agility', decimals: 0,
        ratios: { source: 1, attribute: 0.5 },
        progressive: true, flatPerPoint: 1, precision: true,
      },
  };
  function capacity(value) { return Number(value?.max ?? value?.current ?? value) || 0; }
  function round(value) { const n = Math.round(value * 1e6) / 1e6; return Object.is(n, -0) ? 0 : n; }
  function getResistanceConstant(stat) {
    return stat === 'magicalResistance' ? resistanceCurve.magicalConstant : resistanceCurve.physicalConstant;
  }
  function dodgeChancePercent(points) {
    const amount = Math.max(0, capacity(points));
    const max = Math.min(99, Math.max(0, dodgeCurve.maxPercent));
    const k = Math.max(Number.EPSILON, Number(dodgeCurve.constant) || 98);
    // Avoid overflow and never let floating-point rounding reach the asymptote.
    return amount > 0 ? Math.min(max - Number.EPSILON * max, max / (1 + k / amount)) : 0;
  }
  function resistanceReductionRatio(points, constant = resistanceCurve.physicalConstant) {
    const amount = Math.max(0, capacity(points));
    const k = Math.max(Number.EPSILON, Number(constant) || resistanceCurve.physicalConstant);
    const maxPercent = Math.max(0, Math.min(99, resistanceCurve.maxPercent)), max = maxPercent / 100;
    return amount > 0 ? Math.min(max - Number.EPSILON * max, amount / (amount + k) * maxPercent / 100) : 0;
  }
  function bullsEyeDetails(visionPoints, agilityPoints = 0, settings = bullsEyeCurve, limit = defaultUmbraThreshold) {
    const points = Math.max(0, capacity(visionPoints)), agility = Math.max(0, capacity(agilityPoints));
    const max = Math.min(99, Math.max(0, Number(settings.maxPercent)));
    const first = Math.min(max, Math.max(0, Number(settings.firstPointPercent ?? 1)));
    const constant = Math.max(Number.EPSILON, Number(settings.constant) || 98);
    const influence = Math.max(0, Number(settings.agilityInfluence ?? 1));
    const ratio = 1 + (getProgressiveRatio(agility, 'agility', limit) - 1) * influence;
    const percent = points <= 1 ? points * first
      : Math.min(max - Number.EPSILON * max, first + (max - first) / (1 + constant / (points - 1) / ratio));
    return { points, agility, ratio, constant, max, first, influence, percent };
  }
  function bullsEyePercent(visionPoints, agilityPoints = 0, settings = bullsEyeCurve, limit = defaultUmbraThreshold) {
    return bullsEyeDetails(visionPoints, agilityPoints, settings, limit).percent;
  }
  function bullsEyeVision(percent, agilityPoints = 0, settings = bullsEyeCurve, limit = defaultUmbraThreshold) {
    const { max, first, constant, ratio } = bullsEyeDetails(0, agilityPoints, settings, limit);
    if (!Number.isFinite(percent) || percent < 0 || percent > max) return NaN;
    if (percent === max) return Infinity;
    if (percent <= first) return first ? percent / first : 0;
    return 1 + constant * ((percent - first) / (max - percent)) / ratio;
  }
  function bullsEyeTotal(generated, normal = 0, plus = 0) {
    const max = bullsEyeCurve.maxPercent;
    const fixed = Math.max(0, Math.min(max, generated + normal));
    const total = Math.max(0, Math.min(max, generated + normal + plus));
    return { total, generated, normal: fixed - generated, plus: total - fixed };
  }
  function precisionPercent(points) {
    if (points <= 0) return 0;
    if (points === 1) return precisionCurve.firstPointPercent;
    const { minPercent: min, maxPercent: max, growthK: k, decimals } = precisionCurve;
    return Math.min(Number((min + (max - min) * (1 - Math.exp(-k * (points - 1)))).toFixed(decimals)), max);
  }
  let progressiveKeyInputs = [], progressiveKeys = [];
  function getProgressiveStatKeys() {
    // Only source names, progressive flags and attributes determine this list.
    // Inspect them on every read so in-place balance edits remain immediate;
    // rebuild the projection only when those inputs actually change.
    let index = 0, changed = false;
    for (const source in sources) {
      if (!Object.hasOwn(sources, source)) continue;
      const cfg = sources[source], enabled = !!cfg.progressive;
      const previous = progressiveKeyInputs[index++];
      if (!previous || previous.source !== source || previous.enabled !== enabled
        || (enabled && previous.attribute !== cfg.attribute)) changed = true;
    }
    if (changed || index !== progressiveKeyInputs.length) {
      progressiveKeyInputs = Object.entries(sources).map(([source, cfg]) => ({
        source, enabled: !!cfg.progressive, attribute: cfg.attribute,
      }));
      progressiveKeys = [...new Set(progressiveKeyInputs
        .filter(input => input.enabled).flatMap(input => [input.source, input.attribute]))];
    }
    // Callers have always owned their array; never expose the cached one.
    return progressiveKeys.slice();
  }
  function calculateProgressivePower(source, attribute, cfg, origin, limit = defaultUmbraThreshold) {
    const sourcePart = progressivePowerPart(origin, source, cfg.ratios.source, true, limit);
    const attributePart = progressivePowerPart(cfg.attribute, attribute, cfg.ratios.attribute, source > 0, limit);
    return round(sourcePart.value + attributePart.value + source * cfg.flatPerPoint);
  }
  function calculateStatPointLimit(natural, other = 0, crystal = 0, threshold = defaultUmbraThreshold) {
    const cfg = progression, limit = Math.max(0, capacity(threshold));
    natural = capacity(natural); other = capacity(other); crystal = capacity(crystal);
    // Pool opposing signs before applying thresholds; acquisition order is not saved.
    // Cancellation uses natural, then external, then crystal points. Only the
    // remaining portion outside [0, limit] receives its source's reduced rate.
    let naturalPositive = natural, otherPositive = other;
    let naturalUnderflow = 0, otherUnderflow = 0, crystalUnderflow = 0;
    // The ordinary positive case needs no cancellation/underflow calculation.
    if (natural < 0 || other < 0 || crystal < 0) {
      const np = Math.max(0, natural), op = Math.max(0, other), cp = Math.max(0, crystal);
      const nn = Math.max(0, -natural), on = Math.max(0, -other), cn = Math.max(0, -crystal);
      const positive = np + op + cp, negative = nn + on + cn;
      naturalPositive = Math.max(0, np - negative);
      otherPositive = Math.max(0, op - Math.max(0, negative - np));
      naturalUnderflow = Math.max(0, nn - positive);
      otherUnderflow = Math.max(0, on - Math.max(0, positive - nn));
      crystalUnderflow = Math.max(0, cn - Math.max(0, positive - nn - on));
    }
    const retainedNatural = Math.min(naturalPositive, limit)
      + Math.max(0, naturalPositive - limit) * cfg.levelOverflowRate;
    const naturalApplied = natural - naturalPositive + retainedNatural
      + naturalUnderflow * (1 - cfg.levelOverflowRate);
    const otherExcess = Math.max(0, otherPositive - Math.max(0, limit - retainedNatural));
    const otherApplied = other - otherExcess * (1 - cfg.otherOverflowRate)
      + otherUnderflow * (1 - cfg.otherOverflowRate);
    // Crystals keep their full strength, with either sign.
    const crystalApplied = crystal * cfg.crystalRate;
    return { limit, natural, other, naturalApplied, otherApplied,
      crystal, crystalApplied, naturalUnderflow, otherUnderflow, crystalUnderflow,
      value: round(naturalApplied + otherApplied + crystalApplied), raw: round(natural + other + crystal),
      levelRate: cfg.levelOverflowRate, otherRate: cfg.otherOverflowRate, crystalRate: cfg.crystalRate };
  }

  function getProgressiveRatio(points, stat, limit = defaultUmbraThreshold) {
    const cfg = progression;
    const curve = { ...cfg.curve, ...cfg.curves[stat] };
    const width = Math.max(1, capacity(cfg.limit)), k = Math.max(.001, capacity(curve.intensity));
    const x = Math.max(0, capacity(points));
    limit = Math.max(0, capacity(limit));
    const gain = n => {
      const cycles = Math.floor(n / width), t = (n - cycles * width) / width;
      const normalized = curve.profile === 'j' ? Math.expm1(k * t) / Math.expm1(k)
        : -Math.expm1(-k * t) / -Math.expm1(-k);
      return (cycles + normalized) * curve.gainPercent / 100;
    };
    const normal = gain(Math.min(x, limit));
    return 1 + normal + (gain(x) - normal) * curve.residualPercent / 100;
  }
  function progressivePowerPart(stat, points, base, enabled = true, limit = defaultUmbraThreshold) {
    limit = Math.max(0, capacity(limit));
    const x = Math.max(0, points);
    const normalPoints = Math.min(x, limit), multiplier = enabled ? getProgressiveRatio(x, stat, limit) : 1;
    const normalMultiplier = enabled ? getProgressiveRatio(normalPoints, stat, limit) : 1;
    const coefficient = base * multiplier, normalCoefficient = base * normalMultiplier;
    const raw = x * coefficient, normalRaw = normalPoints * normalCoefficient;
    const epsilon = Number.EPSILON * Math.max(1, normalRaw) * 4;
    const normalValue = Math.round(normalRaw + epsilon);
    const extra = Math.max(0, raw - normalRaw), value = round(normalValue + extra);
    const ratioNote = `Base ${base} × courbe ${multiplier} ; ${x} points propres. ${enabled ? 'Ratio progressif.' : 'Ratio autonome fixe.'}`;
    return { stat, value, base, points: x, multiplier, coefficient, raw, normalPoints, normalRaw, normalValue, extra,
      rounded: true, rounding: 'nearest',
      note: ratioNote + ' Arrondi au plus proche.' + (x > limit ? ' Supplément au-delà de la limite conservé sans arrondi entier.' : ''),
      ...(x > limit ? { arithmetic: { terms: [{ stat, value: normalValue }, '+', { stat, value: extra }, '→', { stat, value }] } }
        : { compact: { source: { stat, value: x }, multiplier: { stat, value: base * multiplier } } }) };
  }
  globalThis.umbraProgression = Object.freeze({ progression, sources, resistanceCurve, getResistanceConstant, resistanceReductionRatio, dodgeCurve, dodgeChancePercent, bullsEyeCurve, bullsEyeDetails, bullsEyePercent, bullsEyeVision, bullsEyeTotal, precisionCurve, precisionPercent, vision, resilience, resilienceDetails, resilienceCancelDetails, critical, criticalChanceDetails, criticalDamageDetails,
    astrality, astralityChanceDetails, astralCooldownDetails, astralReturnDetails, astralBodyDetails,
    transcendence, transcendenceDetails, transcendenceExtraLifeDetails, transcendenceCooldownDetails,
    hypercognition, hypercognitionExplosionDetails, hypercognitionEssenceDetails,
    indestructibility, indestructibilityChanceDetails, indestructibilityReductionDetails, indestructibilityRegenDetails, indestructibilityCooldownDetails,
    blood, bloodThirstyDetails, bloodFuryExecutionDetails,
    esoterism, esoterismChanceDetails, esoterismReductionDetails, esoterismPiercingDetails, esoterismCooldownDetails,
    ambidextry, ambidextryChanceDetails, ambidextryDamageDetails,
    vivacite, vivaciteDetails, controlledSpeedDetails, retreatChance, velocityTiming,
    equilibre, equilibreDetails, balancedAttackDetails, defaultUmbraThreshold, getUmbraThreshold,
    getProgressiveStatKeys, calculateProgressivePower, calculateStatPointLimit,
    getProgressiveRatio, progressivePowerPart });
})();
